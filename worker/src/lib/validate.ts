// src/lib/validate.ts — بديل express-validator
// نفس الرسائل العربية ونفس شكل الخطأ (code: VALIDATION_ERROR) الذي تتوقعه الواجهة.

export type Body = Record<string, unknown>;
export type Rule = (b: Body) => string | null;

/** يعيد أول رسالة خطأ، أو null إذا كان كل شيء سليماً */
export function validate(body: Body, rules: Rule[]): string | null {
	for (const rule of rules) {
		const err = rule(body);
		if (err) return err;
	}
	return null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// نفس تحقق express-validator من البريد تقريباً — بسيط ومقصود
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isText =
	(field: string, min: number, max: number, msgEmpty: string, msgLen: string): Rule =>
	(b) => {
		const v = str(b[field]);
		if (!v) return msgEmpty;
		if (v.length < min || v.length > max) return msgLen;
		return null;
	};

export const isEmail =
	(field = 'email', msg = 'البريد الإلكتروني غير صالح'): Rule =>
	(b) =>
		EMAIL_RE.test(str(b[field]).toLowerCase()) ? null : msg;

export const isInRange =
	(field: string, min: number, max: number, msg: string, optional = false): Rule =>
	(b) => {
		const raw = b[field];
		if (optional && (raw === undefined || raw === null || raw === '')) return null;
		const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
		if (!Number.isInteger(n) || n < min || n > max) return msg;
		return null;
	};

export const matches =
	(field: string, re: RegExp, msg: string): Rule =>
	(b) =>
		re.test(String(b[field] ?? '')) ? null : msg;

export const isOneOf =
	(field: string, allowed: readonly string[], msg: string): Rule =>
	(b) =>
		allowed.includes(String(b[field] ?? '')) ? null : msg;

export const notEmpty =
	(field: string, msg: string): Rule =>
	(b) =>
		str(b[field]) ? null : msg;

// ── مجموعات القواعد (مطابقة لـ middleware/validate.js) ───────
export const registerRules: Rule[] = [
	isText('name', 2, 50, 'الاسم مطلوب', 'الاسم يجب أن يكون بين 2 و 50 حرف'),
	isEmail(),
	(b) =>
		String(b.password ?? '').length >= 6 ? null : 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
	matches('password', /\d/, 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل'),
];

export const loginRules: Rule[] = [isEmail(), notEmpty('password', 'كلمة المرور مطلوبة')];

export const childLoginRules: Rule[] = [
	isInRange('childId', 1, Number.MAX_SAFE_INTEGER, 'childId غير صالح'),
	matches('pin', /^\d{4}$/, 'PIN يجب أن يكون 4 أرقام'),
];

export const childLoginByNameRules: Rule[] = [
	isText('name', 2, 30, 'اسم الطفل مطلوب', 'الاسم يجب أن يكون بين 2 و 30 حرف'),
	matches('pin', /^\d{4}$/, 'PIN يجب أن يكون 4 أرقام بالضبط'),
];

export const createChildRules: Rule[] = [
	isText('name', 2, 30, 'اسم الطفل مطلوب', 'اسم الطفل يجب أن يكون بين 2 و 30 حرف'),
	isInRange('age', 3, 12, 'العمر يجب أن يكون بين 3 و 12 سنة'),
	isOneOf('gender', ['boy', 'girl'], 'الجنس يجب أن يكون boy أو girl'),
	matches('pin', /^\d{4}$/, 'PIN يجب أن يكون 4 أرقام بالضبط'),
	isInRange('avatarId', 1, 10, 'avatar_id يجب أن يكون بين 1 و 10', true),
];

export const ACTIVITY_TYPES = [
	'arabic_letters',
	'english_letters',
	'stories',
	'games',
	'math',
	'vocabulary',
	'drawing',
	'certificate',
	'islamic',
] as const;

export const activityRules: Rule[] = [
	isOneOf('activityType', ACTIVITY_TYPES, 'نوع النشاط غير صالح'),
	isInRange('starsEarned', 0, 10, 'النجوم يجب أن تكون بين 0 و 10', true),
	isInRange('score', 0, Number.MAX_SAFE_INTEGER, 'النتيجة يجب أن تكون رقماً موجباً', true),
	isInRange('durationMin', 0, 480, 'المدة يجب أن تكون بين 0 و 480 دقيقة', true),
];
