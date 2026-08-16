// src/lib/password.ts — تجزئة كلمات المرور وأرقام PIN
//
// لماذا PBKDF2 وليس bcrypt؟
// bcryptjs مكتبة JS خالصة، وتكلفة 12 تستهلك مئات الميلي ثانية من وقت المعالج
// لكل عملية تحقق. على Workers وقت المعالج محدود ومحاسَب عليه، وWebCrypto
// تنفّذ PBKDF2 أصلياً (native) فتكون أرخص بكثير.
//
// لماذا نبقي bcrypt أصلاً؟
// نسخ قاعدة البيانات المستعادة تحمل هاشات bcrypt بتكلفة 12. لو حذفناها نهائياً
// لأصبح استيراد تلك الحسابات مستحيلاً (لا يمكن عكس الهاش لمعرفة كلمة المرور).
// لذلك: نتحقق من النوعين، ونكتب PBKDF2 عند أي تسجيل جديد أو تغيير كلمة مرور،
// ونعيد التجزئة تلقائياً عند أول دخول ناجح لحساب قديم.

import bcrypt from 'bcryptjs';

const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const PREFIX = 'pbkdf2$sha256';

function toB64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function fromB64(s: string): Uint8Array {
	return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derive(plain: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, [
		'deriveBits',
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		key,
		KEY_BITS
	);
	return new Uint8Array(bits);
}

/** مقارنة بزمن ثابت — لا نكشف عن موضع أول اختلاف */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** ينتج: pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64> */
export async function hashPassword(plain: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(plain, salt, ITERATIONS);
	return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export function isLegacyBcrypt(stored: string): boolean {
	return /^\$2[aby]?\$/.test(stored);
}

/** يتحقق من الصيغتين: PBKDF2 الجديدة وbcrypt القديمة المستوردة */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
	if (!stored) return false;

	if (isLegacyBcrypt(stored)) {
		return await bcrypt.compare(plain, stored);
	}

	const parts = stored.split('$');
	// pbkdf2 | sha256 | iterations | salt | hash
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

	const iterations = parseInt(parts[2], 10);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;

	try {
		const salt = fromB64(parts[3]);
		const expected = fromB64(parts[4]);
		const actual = await derive(plain, salt, iterations);
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

/** هل يجب ترقية هذا الهاش بعد دخول ناجح؟ */
export function needsRehash(stored: string): boolean {
	if (isLegacyBcrypt(stored)) return true;
	const parts = stored.split('$');
	if (parts.length !== 5) return true;
	return parseInt(parts[2], 10) < ITERATIONS;
}
