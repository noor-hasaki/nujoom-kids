// src/routes/children.ts — عمليات الطفل
// منقول عن child.controller.js + child.routes.js + chat.controller.js (جزء الطفل)

import { Hono } from 'hono';
import { getAll, getOne, prep, run } from '../db';
import { hashPassword } from '../lib/password';
import { createChildRules, validate } from '../lib/validate';
import { authenticate, requireChild, requireParent } from '../middleware/auth';
import type { AppEnv } from '../types';

const children = new Hono<AppEnv>();

const MAX_CHILDREN_PER_PARENT = 5;
const MAX_SESSIONS_PER_LIST = 100;
const MAX_MESSAGES_PER_SESSION = 500;

function parseMetadata(raw: unknown): unknown {
	try {
		return JSON.parse(String(raw ?? '{}'));
	} catch {
		return {};
	}
}

/** يتحقق أن ولي الأمر يملك الطفل — يُستعمل داخل المعالجات لا كـ middleware */
async function parentOwns(db: D1Database, parentId: number, childId: number): Promise<boolean> {
	const row = await getOne<{ id: number }>(
		db,
		'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
		[parentId, childId]
	);
	return !!row;
}

// ══════════════════════════════════════════════════════════════
// POST /api/children — إنشاء ملف طفل جديد (ولي أمر فقط)
// ══════════════════════════════════════════════════════════════
children.post('/', authenticate, requireParent, async (c) => {
	const parentId = c.get('user').id;

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const invalid = validate(body, createChildRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const count = await getOne<{ cnt: number }>(
		c.env.DB,
		'SELECT COUNT(*) AS cnt FROM children WHERE parent_id = ?',
		[parentId]
	);
	if ((count?.cnt ?? 0) >= MAX_CHILDREN_PER_PARENT) {
		return c.json(
			{
				success: false,
				error: 'وصلت للحد الأقصى من عدد الأطفال (5 أطفال لكل حساب)',
				code: 'MAX_CHILDREN_REACHED',
			},
			400
		);
	}

	const name = String(body.name).trim();
	const age = parseInt(String(body.age), 10);
	const gender = String(body.gender);
	const avatarId = body.avatarId ? parseInt(String(body.avatarId), 10) : 1;
	const hashedPin = await hashPassword(String(body.pin));

	// D1 لا يدعم المعاملات التفاعلية، ونحتاج معرّف الطفل قبل إدراج التابعَين.
	// لذلك: إدراج الطفل أولاً، ثم دفعة واحدة للجدولين التابعين معاً.
	const { lastInsertRowid: childId } = await run(
		c.env.DB,
		'INSERT INTO children (parent_id, name, age, gender, pin, avatar_id) VALUES (?, ?, ?, ?, ?, ?)',
		[parentId, name, age, gender, hashedPin, avatarId]
	);
	if (!childId) {
		return c.json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' }, 500);
	}

	await c.env.DB.batch([
		prep(c.env.DB, 'INSERT INTO child_progress (child_id) VALUES (?)', [childId]),
		prep(c.env.DB, 'INSERT INTO parent_permissions (parent_id, child_id) VALUES (?, ?)', [
			parentId,
			childId,
		]),
	]);

	const child = await getOne(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date, cp.total_stars
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  WHERE c.id = ?`,
		[childId]
	);

	return c.json({ success: true, message: `تم إضافة ${name} بنجاح 🎉`, data: child }, 201);
});

// ══════════════════════════════════════════════════════════════
// محادثات الطفل — تُسجَّل قبل '/:id' حتى لا تُفسَّر "me" كمعرّف
// ══════════════════════════════════════════════════════════════
children.get('/me/chats', authenticate, requireChild, async (c) => {
	const childId = c.get('user').id;
	const sessions = await getAll(
		c.env.DB,
		`SELECT s.id, s.started_at, s.last_message_at, s.message_count,
		        (SELECT COUNT(*) FROM ai_chat_messages m
		          WHERE m.session_id = s.id AND m.role = 'user') AS user_message_count,
		        (SELECT m.content FROM ai_chat_messages m
		          WHERE m.session_id = s.id AND m.role = 'user'
		          ORDER BY m.id ASC LIMIT 1)                     AS first_user_message
		   FROM ai_chat_sessions s
		  WHERE s.child_id = ?
		  ORDER BY s.last_message_at DESC
		  LIMIT ${MAX_SESSIONS_PER_LIST}`,
		[childId]
	);
	return c.json({ success: true, data: sessions });
});

children.get('/me/chats/:sessionId', authenticate, requireChild, async (c) => {
	const childId = c.get('user').id;
	const sessionId = parseInt(c.req.param('sessionId'), 10);

	if (!Number.isInteger(sessionId)) {
		return c.json({ success: false, error: 'sessionId غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const session = await getOne<{ id: number; child_id: number }>(
		c.env.DB,
		'SELECT id, child_id, started_at, last_message_at, message_count FROM ai_chat_sessions WHERE id = ?',
		[sessionId]
	);
	if (!session || session.child_id !== childId) {
		return c.json({ success: false, error: 'الجلسة غير موجودة', code: 'NOT_FOUND' }, 404);
	}

	const messages = await getAll(
		c.env.DB,
		`SELECT id, role, content, created_at FROM ai_chat_messages
		  WHERE session_id = ? ORDER BY id ASC LIMIT ${MAX_MESSAGES_PER_SESSION}`,
		[sessionId]
	);
	return c.json({ success: true, data: { session, messages } });
});

/**
 * صلاحية القراءة: الطفل نفسه، أو ولي أمر يملكه.
 * يعيد رسالة الخطأ الجاهزة أو null إذا كان الوصول مسموحاً.
 */
async function canRead(
	db: D1Database,
	user: { id: number; type: string },
	childId: number
): Promise<{ error: string; code: string; status: 403 } | null> {
	if (user.type === 'child') {
		return user.id === childId ? null : { error: 'غير مصرح', code: 'FORBIDDEN', status: 403 };
	}
	return (await parentOwns(db, user.id, childId))
		? null
		: { error: 'ليس طفلك', code: 'NO_ACCESS', status: 403 };
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id
// ══════════════════════════════════════════════════════════════
children.get('/:id', authenticate, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const denied = await canRead(c.env.DB, c.get('user'), childId);
	if (denied) return c.json({ success: false, error: denied.error, code: denied.code }, denied.status);

	const child = await getOne(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date, c.is_frozen,
		        cp.total_stars, cp.stories_read, cp.words_learned, cp.games_score,
		        cp.drawings_saved, cp.math_stars, cp.total_time_min, cp.last_active
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  WHERE c.id = ?`,
		[childId]
	);

	if (!child) return c.json({ success: false, error: 'الطفل غير موجود', code: 'NOT_FOUND' }, 404);
	return c.json({ success: true, data: child });
});

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/progress
// ══════════════════════════════════════════════════════════════
children.get('/:id/progress', authenticate, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const denied = await canRead(c.env.DB, c.get('user'), childId);
	if (denied) return c.json({ success: false, error: denied.error, code: denied.code }, denied.status);

	const progress = await getOne<{ total_stars: number }>(
		c.env.DB,
		`SELECT cp.*, (SELECT COUNT(*) FROM achievements WHERE child_id = ?) AS achievement_count
		   FROM child_progress cp WHERE cp.child_id = ?`,
		[childId, childId]
	);
	if (!progress) {
		return c.json({ success: false, error: 'لا يوجد سجل تقدم', code: 'NOT_FOUND' }, 404);
	}

	// استعلام تجميعي واحد بدل ثلاثة
	const counts = await getOne<{ arabic: number; english: number; certs: number }>(
		c.env.DB,
		`SELECT COUNT(DISTINCT CASE WHEN activity_type = 'arabic_letters'
		                           THEN json_extract(metadata, '$.letterIndex') END) AS arabic,
		        COUNT(DISTINCT CASE WHEN activity_type = 'english_letters'
		                           THEN json_extract(metadata, '$.letterIndex') END) AS english,
		        SUM(CASE WHEN activity_type = 'certificate' THEN 1 ELSE 0 END)        AS certs
		   FROM activity_logs WHERE child_id = ?`,
		[childId]
	);

	const level = Math.floor((progress.total_stars || 0) / 50) + 1;

	return c.json({
		success: true,
		data: {
			...progress,
			level,
			nextLevelStars: level * 50,
			arabic_letters_learned: counts?.arabic ?? 0,
			english_letters_learned: counts?.english ?? 0,
			certificates_earned: counts?.certs ?? 0,
		},
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/activities
// ══════════════════════════════════════════════════════════════
children.get('/:id/activities', authenticate, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const denied = await canRead(c.env.DB, c.get('user'), childId);
	if (denied) return c.json({ success: false, error: denied.error, code: denied.code }, denied.status);

	const type = c.req.query('type');
	const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10) || 20, 1), 100);
	const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

	let sql = `SELECT id, activity_type, stars_earned, score, duration_min, metadata, completed_at
	             FROM activity_logs WHERE child_id = ?`;
	const params: (string | number)[] = [childId];
	if (type) {
		sql += ' AND activity_type = ?';
		params.push(type);
	}
	sql += ' ORDER BY completed_at DESC LIMIT ? OFFSET ?';
	params.push(limit, offset);

	const activities = await getAll<Record<string, unknown>>(c.env.DB, sql, params);
	return c.json({
		success: true,
		data: activities.map((a) => ({ ...a, metadata: parseMetadata(a.metadata) })),
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/achievements
// ══════════════════════════════════════════════════════════════
children.get('/:id/achievements', authenticate, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const denied = await canRead(c.env.DB, c.get('user'), childId);
	if (denied) return c.json({ success: false, error: denied.error, code: denied.code }, denied.status);

	const achievements = await getAll(
		c.env.DB,
		'SELECT id, achievement_id, earned_at FROM achievements WHERE child_id = ? ORDER BY earned_at DESC',
		[childId]
	);
	return c.json({ success: true, data: achievements });
});

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/stats/summary — ولي أمر فقط
// ══════════════════════════════════════════════════════════════
children.get('/:id/stats/summary', authenticate, requireParent, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	const parentId = c.get('user').id;

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}
	if (!(await parentOwns(c.env.DB, parentId, childId))) {
		return c.json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' }, 403);
	}

	const [progress, counts, recentActivities, favoriteActivity, weeklyStars, activityBreakdown] =
		await Promise.all([
			getOne<{ total_stars: number }>(c.env.DB, 'SELECT * FROM child_progress WHERE child_id = ?', [
				childId,
			]),
			getOne<{
				arabic: number;
				english: number;
				certs: number;
				total: number;
				achievements: number;
			}>(
				c.env.DB,
				`SELECT COUNT(DISTINCT CASE WHEN activity_type = 'arabic_letters'
				                           THEN json_extract(metadata, '$.letterIndex') END) AS arabic,
				        COUNT(DISTINCT CASE WHEN activity_type = 'english_letters'
				                           THEN json_extract(metadata, '$.letterIndex') END) AS english,
				        SUM(CASE WHEN activity_type = 'certificate' THEN 1 ELSE 0 END)        AS certs,
				        COUNT(*)                                                              AS total,
				        (SELECT COUNT(*) FROM achievements WHERE child_id = ?)                AS achievements
				   FROM activity_logs WHERE child_id = ?`,
				[childId, childId]
			),
			getAll<Record<string, unknown>>(
				c.env.DB,
				`SELECT activity_type, stars_earned, score, duration_min, metadata, completed_at
				   FROM activity_logs WHERE child_id = ? ORDER BY completed_at DESC LIMIT 10`,
				[childId]
			),
			getOne<{ activity_type: string }>(
				c.env.DB,
				`SELECT activity_type, COUNT(*) AS count FROM activity_logs
				  WHERE child_id = ? GROUP BY activity_type ORDER BY count DESC LIMIT 1`,
				[childId]
			),
			getAll(
				c.env.DB,
				`SELECT DATE(completed_at) AS day, SUM(stars_earned) AS stars
				   FROM activity_logs
				  WHERE child_id = ? AND completed_at >= DATE('now', '-7 days')
				  GROUP BY day ORDER BY day ASC`,
				[childId]
			),
			getAll(
				c.env.DB,
				`SELECT activity_type, COUNT(*) AS sessions, SUM(stars_earned) AS stars,
				        SUM(duration_min) AS total_minutes
				   FROM activity_logs WHERE child_id = ?
				  GROUP BY activity_type ORDER BY sessions DESC`,
				[childId]
			),
		]);

	const level = Math.floor((progress?.total_stars || 0) / 50) + 1;

	return c.json({
		success: true,
		data: {
			progress: {
				...(progress ?? {}),
				arabic_letters_learned: counts?.arabic ?? 0,
				english_letters_learned: counts?.english ?? 0,
				certificates_earned: counts?.certs ?? 0,
				total_activities: counts?.total ?? 0,
				achievements_count: counts?.achievements ?? 0,
			},
			level,
			nextLevelStars: level * 50,
			recentActivities: recentActivities.map((a) => ({ ...a, metadata: parseMetadata(a.metadata) })),
			favoriteActivity: favoriteActivity?.activity_type ?? null,
			weeklyStars,
			activityBreakdown,
		},
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/children/:id/unlock — إعادة تعيين قفل PIN
// ══════════════════════════════════════════════════════════════
children.post('/:id/unlock', authenticate, requireParent, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	const parentId = c.get('user').id;

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}
	if (!(await parentOwns(c.env.DB, parentId, childId))) {
		return c.json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' }, 403);
	}

	await run(c.env.DB, 'UPDATE children SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?', [
		childId,
	]);
	return c.json({ success: true, message: 'تم إعادة تعيين قفل الحساب' });
});

// ══════════════════════════════════════════════════════════════
// PUT /api/children/:id — تعديل (ولي أمر فقط)
// ══════════════════════════════════════════════════════════════
children.put('/:id', authenticate, requireParent, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	const parentId = c.get('user').id;

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}

	const ownership = await getOne<{ id: number }>(
		c.env.DB,
		'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ? AND can_edit_child = 1',
		[parentId, childId]
	);
	if (!ownership) {
		return c.json(
			{ success: false, error: 'لا تملك صلاحية تعديل هذا الطفل', code: 'FORBIDDEN' },
			403
		);
	}

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const updates: string[] = [];
	const params: (string | number)[] = [];

	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (name) {
		updates.push('name = ?');
		params.push(name);
	}
	if (body.age) {
		updates.push('age = ?');
		params.push(parseInt(String(body.age), 10));
	}
	if (body.gender) {
		updates.push('gender = ?');
		params.push(String(body.gender));
	}
	if (body.avatarId) {
		updates.push('avatar_id = ?');
		params.push(parseInt(String(body.avatarId), 10));
	}
	if (body.pin) {
		updates.push('pin = ?');
		params.push(await hashPassword(String(body.pin)));
	}

	if (updates.length === 0) {
		return c.json({ success: false, error: 'لا توجد بيانات للتحديث', code: 'NO_UPDATE' }, 400);
	}

	updates.push("updated_at = datetime('now')");
	params.push(childId);

	await run(c.env.DB, `UPDATE children SET ${updates.join(', ')} WHERE id = ?`, params);

	const updated = await getOne(
		c.env.DB,
		'SELECT id, name, age, gender, avatar_id FROM children WHERE id = ?',
		[childId]
	);
	return c.json({ success: true, message: 'تم التحديث بنجاح', data: updated });
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/children/:id — حذف طفل وكل بياناته
// ══════════════════════════════════════════════════════════════
children.delete('/:id', authenticate, requireParent, async (c) => {
	const childId = parseInt(c.req.param('id'), 10);
	const parentId = c.get('user').id;

	if (!Number.isInteger(childId)) {
		return c.json({ success: false, error: 'المعرّف غير صالح', code: 'BAD_REQUEST' }, 400);
	}
	if (!(await parentOwns(c.env.DB, parentId, childId))) {
		return c.json(
			{ success: false, error: 'لا تملك صلاحية حذف هذا الطفل', code: 'FORBIDDEN' },
			403
		);
	}

	// الحذف الصريح محفوظ كما كان (D1 يطبّق CASCADE فعلاً، لكن الصراحة أوضح).
	// إضافة عن النسخة القديمة: جلسات ورسائل نجوم — كانت تُترك يتيمة عند الحذف.
	await c.env.DB.batch([
		prep(
			c.env.DB,
			'DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE child_id = ?)',
			[childId]
		),
		prep(c.env.DB, 'DELETE FROM ai_chat_sessions   WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM achievements       WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM activity_logs      WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM child_progress     WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM drawings           WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM parent_permissions WHERE child_id = ?', [childId]),
		prep(c.env.DB, 'DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [
			childId,
			'child',
		]),
		prep(c.env.DB, 'DELETE FROM children           WHERE id = ? AND parent_id = ?', [
			childId,
			parentId,
		]),
	]);

	return c.json({ success: true, message: 'تم حذف الطفل وجميع بياناته بنجاح' });
});

export default children;
