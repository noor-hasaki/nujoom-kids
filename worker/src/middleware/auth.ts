// src/middleware/auth.ts — التحقق من JWT والصلاحيات
// منقول عن src/middleware/auth.js مع نفس رموز الأخطاء (codes) حرفياً،
// لأن frontend/api.js يعتمد عليها في منطق التجديد وإعادة التوجيه.

import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { getOne } from '../db';
import { verifyAccessToken } from '../lib/jwt';
import type { AppEnv } from '../types';

/** مقارنة بزمن ثابت للمفاتيح السرية */
function timingSafeEqual(a: string, b: string): boolean {
	const ab = new TextEncoder().encode(a);
	const bb = new TextEncoder().encode(b);
	if (ab.length !== bb.length) return false;
	let diff = 0;
	for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
	return diff === 0;
}

// ── التحقق من Access Token (ولي الأمر أو الطفل) ───────────────
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
	const authHeader = c.req.header('authorization');

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return c.json(
			{ success: false, error: 'لا يوجد token، يرجى تسجيل الدخول أولاً', code: 'NO_TOKEN' },
			401
		);
	}

	const token = authHeader.slice('Bearer '.length);
	const result = await verifyAccessToken(token, c.env.JWT_SECRET);

	if (!result.ok) {
		return result.expired
			? c.json(
					{ success: false, error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً', code: 'TOKEN_EXPIRED' },
					401
				)
			: c.json({ success: false, error: 'token غير صالح', code: 'INVALID_TOKEN' }, 401);
	}

	c.set('user', result.payload);
	await next();
};

// ── التحقق أن المستخدم ولي أمر وغير مجمّد ────────────────────
export const requireParent: MiddlewareHandler<AppEnv> = async (c, next) => {
	const user = c.get('user');

	if (user.type !== 'parent') {
		return c.json(
			{ success: false, error: 'هذا الطلب مخصص لأولياء الأمور فقط', code: 'PARENT_ONLY' },
			403
		);
	}

	const parent = await getOne<{ is_frozen: number }>(
		c.env.DB,
		'SELECT is_frozen FROM parents WHERE id = ?',
		[user.id]
	);
	if (!parent || parent.is_frozen) {
		return c.json(
			{ success: false, error: 'تم تجميد هذا الحساب. تواصل مع الدعم الفني', code: 'ACCOUNT_FROZEN' },
			403
		);
	}

	await next();
};

// ── التحقق أن المستخدم طفل وغير مجمّد ────────────────────────
export const requireChild: MiddlewareHandler<AppEnv> = async (c, next) => {
	const user = c.get('user');

	if (user.type !== 'child') {
		return c.json({ success: false, error: 'هذا الطلب مخصص للأطفال فقط', code: 'CHILD_ONLY' }, 403);
	}

	const child = await getOne<{ is_frozen: number }>(
		c.env.DB,
		'SELECT is_frozen FROM children WHERE id = ?',
		[user.id]
	);
	if (!child || child.is_frozen) {
		return c.json(
			{ success: false, error: 'تم تجميد هذا الحساب مؤقتاً', code: 'ACCOUNT_FROZEN' },
			403
		);
	}

	await next();
};

// ── التحقق من Internal Admin API Key ──────────────────────────
export const requireAdminKey: MiddlewareHandler<AppEnv> = async (c, next) => {
	const key = c.req.header('x-admin-key') ?? getCookie(c, 'admin_key');
	const secret = c.env.INTERNAL_ADMIN_API_KEY;

	if (!key || !secret || !timingSafeEqual(key, secret)) {
		return c.json({ success: false, error: 'مفتاح Admin غير صالح', code: 'INVALID_ADMIN_KEY' }, 403);
	}

	await next();
};

// ── التحقق أن ولي الأمر يملك صلاحية على هذا الطفل ────────────
export const requireChildOwnership: MiddlewareHandler<AppEnv> = async (c, next) => {
	const user = c.get('user');
	const raw = c.req.param('childId') ?? c.req.param('id');
	const childId = parseInt(raw ?? '', 10);

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'معرّف الطفل غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const ownership = await getOne<{ id: number }>(
		c.env.DB,
		'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
		[user.id, childId]
	);

	if (!ownership) {
		return c.json(
			{ success: false, error: 'ليس لديك صلاحية الوصول لهذا الطفل', code: 'NO_CHILD_ACCESS' },
			403
		);
	}

	c.set('childId', childId);
	await next();
};
