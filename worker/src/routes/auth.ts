// src/routes/auth.ts — مسارات التسجيل والدخول
// منقول عن auth.controller.js + auth.routes.js

import { Hono } from 'hono';
import { getAll, getOne, prep, run } from '../db';
import { generateRefreshToken, refreshTokenExpiry, signAccessToken } from '../lib/jwt';
import { hashPassword, needsRehash, verifyPassword } from '../lib/password';
import {
	childLoginByNameRules,
	childLoginRules,
	loginRules,
	registerRules,
	validate,
	type Body,
} from '../lib/validate';
import { authenticate, requireParent } from '../middleware/auth';
import { authRateLimit } from '../middleware/ratelimit';
import type { AppEnv, UserPayload } from '../types';

const auth = new Hono<AppEnv>();

// نفس تغطية express-rate-limit القديمة: التسجيل والدخول والتجديد.
// (logout و token-from-parent كانا بلا حدّ، ويبقيان كذلك)
auth.use('/parent/register', authRateLimit);
auth.use('/parent/login', authRateLimit);
auth.use('/child/login', authRateLimit);
auth.use('/child/login-by-name', authRateLimit);
auth.use('/refresh', authRateLimit);

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

function accessTtl(env: { JWT_EXPIRES_IN?: string }): string {
	return env.JWT_EXPIRES_IN || '15m';
}

function refreshDays(env: { REFRESH_TOKEN_EXPIRES_IN?: string }): number {
	const n = parseInt(env.REFRESH_TOKEN_EXPIRES_IN || '7', 10);
	return Number.isInteger(n) && n > 0 ? n : 7;
}

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Body> {
	try {
		const b = await c.req.json();
		return b && typeof b === 'object' ? (b as Body) : {};
	} catch {
		return {};
	}
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/parent/register
// ══════════════════════════════════════════════════════════════
auth.post('/parent/register', async (c) => {
	const body = await readBody(c);
	const invalid = validate(body, registerRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const name = String(body.name).trim();
	const email = String(body.email).trim().toLowerCase();
	const password = String(body.password);

	const existing = await getOne<{ id: number }>(c.env.DB, 'SELECT id FROM parents WHERE email = ?', [
		email,
	]);
	if (existing) {
		return c.json(
			{ success: false, error: 'هذا البريد الإلكتروني مسجّل مسبقاً', code: 'EMAIL_EXISTS' },
			409
		);
	}

	const hashed = await hashPassword(password);
	const { lastInsertRowid: parentId } = await run(
		c.env.DB,
		'INSERT INTO parents (name, email, password) VALUES (?, ?, ?)',
		[name, email, hashed]
	);
	if (!parentId) {
		return c.json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' }, 500);
	}

	const payload: UserPayload = { id: parentId, type: 'parent', email };
	const accessToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));
	const refreshToken = generateRefreshToken();

	await run(
		c.env.DB,
		'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES (?, ?, ?, ?)',
		[parentId, 'parent', refreshToken, refreshTokenExpiry(refreshDays(c.env))]
	);

	return c.json(
		{
			success: true,
			message: 'تم إنشاء الحساب بنجاح',
			data: { token: accessToken, refreshToken, parent: { id: parentId, name, email } },
		},
		201
	);
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/parent/login
// ══════════════════════════════════════════════════════════════
auth.post('/parent/login', async (c) => {
	const body = await readBody(c);
	const invalid = validate(body, loginRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const email = String(body.email).trim().toLowerCase();
	const password = String(body.password);

	const parent = await getOne<{
		id: number;
		name: string;
		email: string;
		password: string;
		is_frozen: number;
	}>(c.env.DB, 'SELECT id, name, email, password, is_frozen FROM parents WHERE email = ?', [email]);

	if (!parent) {
		return c.json(
			{
				success: false,
				error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
				code: 'INVALID_CREDENTIALS',
			},
			401
		);
	}

	if (parent.is_frozen) {
		return c.json(
			{ success: false, error: 'تم تجميد هذا الحساب. تواصل مع الدعم الفني', code: 'ACCOUNT_FROZEN' },
			403
		);
	}

	const isMatch = await verifyPassword(password, parent.password);
	if (!isMatch) {
		return c.json(
			{
				success: false,
				error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
				code: 'INVALID_CREDENTIALS',
			},
			401
		);
	}

	// ترقية الهاش القديم (bcrypt المستورد) إلى PBKDF2 بصمت بعد دخول ناجح
	if (needsRehash(parent.password)) {
		const upgraded = await hashPassword(password);
		await run(c.env.DB, 'UPDATE parents SET password = ?, updated_at = datetime(\'now\') WHERE id = ?', [
			upgraded,
			parent.id,
		]);
	}

	const children = await getAll(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date,
		        cp.total_stars, cp.last_active
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  WHERE c.parent_id = ? AND c.is_frozen = 0`,
		[parent.id]
	);

	const payload: UserPayload = { id: parent.id, type: 'parent', email: parent.email };
	const accessToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));
	const refreshToken = generateRefreshToken();

	// حذف الرموز القديمة وإضافة الجديد — دفعة واحدة (معاملة ضمنية في D1)
	await c.env.DB.batch([
		prep(c.env.DB, 'DELETE FROM refresh_tokens WHERE user_id = ? AND user_type = ?', [
			parent.id,
			'parent',
		]),
		prep(
			c.env.DB,
			'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES (?, ?, ?, ?)',
			[parent.id, 'parent', refreshToken, refreshTokenExpiry(refreshDays(c.env))]
		),
	]);

	return c.json({
		success: true,
		message: 'تم تسجيل الدخول بنجاح',
		data: {
			token: accessToken,
			refreshToken,
			parent: { id: parent.id, name: parent.name, email: parent.email },
			children,
		},
	});
});

// ── نوع صف الطفل المستخدم في مساري دخول الطفل ────────────────
type ChildRow = {
	id: number;
	name: string;
	age: number;
	gender: string;
	pin: string;
	avatar_id: number;
	parent_id: number;
	is_frozen: number;
	failed_pin_attempts: number;
	locked_until: number | null;
};

/** بعد دخول ناجح: تصفير العداد، ترقية هاش الـ PIN إن لزم، تحديث آخر نشاط */
async function onChildLoginSuccess(db: D1Database, child: ChildRow, pin: string): Promise<void> {
	await run(db, 'UPDATE children SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?', [
		child.id,
	]);

	if (needsRehash(child.pin)) {
		const upgraded = await hashPassword(pin);
		await run(db, 'UPDATE children SET pin = ? WHERE id = ?', [upgraded, child.id]);
	}

	await run(db, "UPDATE child_progress SET last_active = datetime('now') WHERE child_id = ?", [
		child.id,
	]);
}

function childData(child: ChildRow) {
	return {
		id: child.id,
		name: child.name,
		age: child.age,
		gender: child.gender,
		avatarId: child.avatar_id,
	};
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/login — دخول الطفل بالـ PIN
// ══════════════════════════════════════════════════════════════
auth.post('/child/login', async (c) => {
	const body = await readBody(c);
	const invalid = validate(body, childLoginRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const childId = parseInt(String(body.childId), 10);
	const pin = String(body.pin);

	const child = await getOne<ChildRow>(
		c.env.DB,
		`SELECT id, name, age, gender, pin, avatar_id, parent_id, is_frozen,
		        failed_pin_attempts, locked_until
		   FROM children WHERE id = ?`,
		[childId]
	);

	if (!child) {
		return c.json({ success: false, error: 'الطفل غير موجود', code: 'CHILD_NOT_FOUND' }, 404);
	}

	if (child.is_frozen) {
		return c.json(
			{ success: false, error: 'تم تجميد حساب الطفل مؤقتاً', code: 'ACCOUNT_FROZEN' },
			403
		);
	}

	if (child.locked_until && child.locked_until > Date.now()) {
		const mins = Math.ceil((child.locked_until - Date.now()) / 60000);
		return c.json(
			{
				success: false,
				error: `تم قفل الحساب مؤقتاً. حاول بعد ${mins} دقيقة أو اطلب من ولي أمرك إعادة التعيين`,
				code: 'PIN_LOCKED',
				locked_until: child.locked_until,
			},
			423
		);
	}

	const isMatch = await verifyPassword(pin, child.pin);
	if (!isMatch) {
		const attempts = (child.failed_pin_attempts || 0) + 1;
		if (attempts >= MAX_PIN_ATTEMPTS) {
			const lockedUntil = Date.now() + PIN_LOCK_MS;
			await run(
				c.env.DB,
				'UPDATE children SET failed_pin_attempts = ?, locked_until = ? WHERE id = ?',
				[attempts, lockedUntil, child.id]
			);
			return c.json(
				{
					success: false,
					error: 'تم قفل الحساب لمدة 15 دقيقة بسبب المحاولات المتكررة',
					code: 'PIN_LOCKED',
					locked_until: lockedUntil,
				},
				423
			);
		}
		await run(c.env.DB, 'UPDATE children SET failed_pin_attempts = ? WHERE id = ?', [
			attempts,
			child.id,
		]);
		return c.json(
			{
				success: false,
				error: 'PIN غير صحيح',
				code: 'INVALID_PIN',
				attempts_left: MAX_PIN_ATTEMPTS - attempts,
			},
			401
		);
	}

	await onChildLoginSuccess(c.env.DB, child, pin);

	const payload: UserPayload = { id: child.id, type: 'child', parentId: child.parent_id };
	const accessToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));

	return c.json({
		success: true,
		message: `مرحباً ${child.name}! 🎉`,
		data: { token: accessToken, child: childData(child) },
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/login-by-name — دخول الطفل بالاسم + PIN
// ══════════════════════════════════════════════════════════════
auth.post('/child/login-by-name', async (c) => {
	const body = await readBody(c);
	const invalid = validate(body, childLoginByNameRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const name = String(body.name).trim();
	const pin = String(body.pin);

	const children = await getAll<ChildRow>(
		c.env.DB,
		`SELECT id, name, age, gender, pin, avatar_id, parent_id, is_frozen,
		        failed_pin_attempts, locked_until
		   FROM children WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`,
		[name]
	);

	if (!children.length) {
		return c.json({ success: false, error: 'لا يوجد طفل بهذا الاسم', code: 'CHILD_NOT_FOUND' }, 404);
	}

	const eligible = children.filter(
		(ch) => !ch.is_frozen && !(ch.locked_until && ch.locked_until > Date.now())
	);

	let matched: ChildRow | null = null;
	for (const child of eligible) {
		if (await verifyPassword(pin, child.pin)) {
			matched = child;
			break;
		}
	}

	if (!matched) {
		// زيادة عداد المحاولات لكل طفل مؤهل بنفس الاسم — دفعة واحدة
		const now = Date.now();
		await c.env.DB.batch(
			eligible.map((child) => {
				const attempts = (child.failed_pin_attempts || 0) + 1;
				return attempts >= MAX_PIN_ATTEMPTS
					? prep(
							c.env.DB,
							'UPDATE children SET failed_pin_attempts = ?, locked_until = ? WHERE id = ?',
							[attempts, now + PIN_LOCK_MS, child.id]
						)
					: prep(c.env.DB, 'UPDATE children SET failed_pin_attempts = ? WHERE id = ?', [
							attempts,
							child.id,
						]);
			})
		);
		return c.json(
			{ success: false, error: 'الاسم أو الرمز السري غير صحيح', code: 'INVALID_CREDENTIALS' },
			401
		);
	}

	await onChildLoginSuccess(c.env.DB, matched, pin);

	const payload: UserPayload = { id: matched.id, type: 'child', parentId: matched.parent_id };
	const accessToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));

	return c.json({
		success: true,
		message: `مرحباً ${matched.name}! 🎉`,
		data: { token: accessToken, child: childData(matched) },
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/token-from-parent — ولي الأمر يحصل على توكن الطفل
// ══════════════════════════════════════════════════════════════
auth.post('/child/token-from-parent', authenticate, requireParent, async (c) => {
	const parent = c.get('user');
	const body = await readBody(c);
	const childId = parseInt(String(body.childId ?? ''), 10);

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'childId مطلوب', code: 'MISSING_CHILD_ID' }, 400);
	}

	const ownership = await getOne<{ id: number }>(
		c.env.DB,
		'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
		[parent.id, childId]
	);
	if (!ownership) {
		return c.json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' }, 403);
	}

	const child = await getOne<ChildRow>(
		c.env.DB,
		'SELECT id, name, age, gender, pin, avatar_id, parent_id, is_frozen, failed_pin_attempts, locked_until FROM children WHERE id = ?',
		[childId]
	);
	if (!child) {
		return c.json({ success: false, error: 'الطفل غير موجود', code: 'CHILD_NOT_FOUND' }, 404);
	}
	if (child.is_frozen) {
		return c.json({ success: false, error: 'حساب الطفل مجمّد', code: 'ACCOUNT_FROZEN' }, 403);
	}

	const payload: UserPayload = { id: child.id, type: 'child', parentId: child.parent_id };
	const accessToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));

	return c.json({
		success: true,
		message: 'تم إنشاء توكن الطفل',
		data: { token: accessToken, child: childData(child) },
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ══════════════════════════════════════════════════════════════
auth.post('/refresh', async (c) => {
	const body = await readBody(c);
	const token = String(body.refreshToken ?? '');

	if (!token) {
		return c.json({ success: false, error: 'refreshToken مطلوب', code: 'NO_REFRESH_TOKEN' }, 400);
	}

	const stored = await getOne<{ user_id: number; user_type: string }>(
		c.env.DB,
		"SELECT user_id, user_type FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')",
		[token]
	);

	if (!stored) {
		return c.json(
			{ success: false, error: 'refreshToken غير صالح أو منتهي', code: 'INVALID_REFRESH_TOKEN' },
			401
		);
	}

	let payload: UserPayload;
	if (stored.user_type === 'parent') {
		const p = await getOne<{ id: number; email: string }>(
			c.env.DB,
			'SELECT id, email FROM parents WHERE id = ?',
			[stored.user_id]
		);
		// الحساب قد يكون حُذف بينما الرمز ما زال صالحاً — النسخة القديمة كانت ترمي 500 هنا
		if (!p) {
			return c.json(
				{ success: false, error: 'refreshToken غير صالح أو منتهي', code: 'INVALID_REFRESH_TOKEN' },
				401
			);
		}
		payload = { id: p.id, type: 'parent', email: p.email };
	} else {
		const ch = await getOne<{ id: number; parent_id: number }>(
			c.env.DB,
			'SELECT id, parent_id FROM children WHERE id = ?',
			[stored.user_id]
		);
		if (!ch) {
			return c.json(
				{ success: false, error: 'refreshToken غير صالح أو منتهي', code: 'INVALID_REFRESH_TOKEN' },
				401
			);
		}
		payload = { id: ch.id, type: 'child', parentId: ch.parent_id };
	}

	const newToken = await signAccessToken(payload, c.env.JWT_SECRET, accessTtl(c.env));
	return c.json({ success: true, data: { token: newToken }, message: 'تم تجديد الجلسة' });
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════
auth.post('/logout', async (c) => {
	const body = await readBody(c);
	const token = String(body.refreshToken ?? '');
	if (token) {
		await run(c.env.DB, 'DELETE FROM refresh_tokens WHERE token = ?', [token]);
	}
	return c.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
});

export default auth;
