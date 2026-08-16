// src/routes/parents.ts — لوحة الأهل
// منقول عن parent.controller.js + chat.controller.js (الجزء الخاص بالأهل)
//
// فرق عن النسخة القديمة: كانت تنفّذ 5 استعلامات لكل طفل داخل حلقة (N+1).
// مع sql.js في الذاكرة كان ذلك شبه مجاني؛ مع D1 كل استعلام رحلة شبكة وصفوف
// محاسَب عليها. هنا نجمعها في استعلامات تجميعية (GROUP BY) بنفس المخرجات.

import { Hono } from 'hono';
import { getAll, getOne, run } from '../db';
import { hashPassword } from '../lib/password';
import { authenticate, requireChildOwnership, requireParent } from '../middleware/auth';
import type { AppEnv } from '../types';

const parents = new Hono<AppEnv>();

// كل المسارات تتطلب JWT ولي أمر غير مجمّد
parents.use('*', authenticate, requireParent);

const MAX_SESSIONS_PER_LIST = 100;
const MAX_MESSAGES_PER_SESSION = 500;

type ChildStatRow = {
	child_id: number;
	arabic_letters_learned: number;
	english_letters_learned: number;
	certificates_earned: number;
	total_activities: number;
};

/** إحصائيات الأنشطة لكل أطفال ولي أمر — استعلام واحد بدل 4 لكل طفل */
async function activityStatsByChild(db: D1Database, parentId: number): Promise<Map<number, ChildStatRow>> {
	const rows = await getAll<ChildStatRow>(
		db,
		`SELECT al.child_id,
		        COUNT(DISTINCT CASE WHEN al.activity_type = 'arabic_letters'
		                            THEN json_extract(al.metadata, '$.letterIndex') END) AS arabic_letters_learned,
		        COUNT(DISTINCT CASE WHEN al.activity_type = 'english_letters'
		                            THEN json_extract(al.metadata, '$.letterIndex') END) AS english_letters_learned,
		        SUM(CASE WHEN al.activity_type = 'certificate' THEN 1 ELSE 0 END)         AS certificates_earned,
		        COUNT(*)                                                                  AS total_activities
		   FROM activity_logs al
		   INNER JOIN children c ON c.id = al.child_id
		  WHERE c.parent_id = ?
		  GROUP BY al.child_id`,
		[parentId]
	);
	return new Map(rows.map((r) => [r.child_id, r]));
}

/** عدد الإنجازات لكل طفل — استعلام واحد */
async function achievementCountsByChild(db: D1Database, parentId: number): Promise<Map<number, number>> {
	const rows = await getAll<{ child_id: number; cnt: number }>(
		db,
		`SELECT a.child_id, COUNT(*) AS cnt
		   FROM achievements a
		   INNER JOIN children c ON c.id = a.child_id
		  WHERE c.parent_id = ?
		  GROUP BY a.child_id`,
		[parentId]
	);
	return new Map(rows.map((r) => [r.child_id, r.cnt]));
}

function enrich(
	child: Record<string, unknown> & { id: number; total_stars: number },
	stats: Map<number, ChildStatRow>,
	achievements: Map<number, number>
) {
	const s = stats.get(child.id);
	return {
		...child,
		arabic_letters_learned: s?.arabic_letters_learned ?? 0,
		english_letters_learned: s?.english_letters_learned ?? 0,
		certificates_earned: s?.certificates_earned ?? 0,
		total_activities: s?.total_activities ?? 0,
		achievements_count: achievements.get(child.id) ?? 0,
		level: Math.floor(child.total_stars / 50) + 1,
	};
}

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me
// ══════════════════════════════════════════════════════════════
parents.get('/me', async (c) => {
	const user = c.get('user');
	const parent = await getOne(
		c.env.DB,
		'SELECT id, name, email, created_at FROM parents WHERE id = ?',
		[user.id]
	);
	if (!parent) {
		return c.json({ success: false, error: 'الحساب غير موجود', code: 'NOT_FOUND' }, 404);
	}
	return c.json({ success: true, data: parent });
});

// ══════════════════════════════════════════════════════════════
// PUT /api/parents/me
// ══════════════════════════════════════════════════════════════
parents.put('/me', async (c) => {
	const user = c.get('user');
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

	const password = typeof body.password === 'string' ? body.password : '';
	if (password) {
		if (password.length < 6) {
			return c.json(
				{
					success: false,
					error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
					code: 'INVALID_PASSWORD',
				},
				400
			);
		}
		updates.push('password = ?');
		params.push(await hashPassword(password));
	}

	if (updates.length === 0) {
		return c.json({ success: false, error: 'لا توجد بيانات للتحديث', code: 'NO_UPDATE' }, 400);
	}

	updates.push("updated_at = datetime('now')");
	params.push(user.id);

	await run(c.env.DB, `UPDATE parents SET ${updates.join(', ')} WHERE id = ?`, params);
	const updated = await getOne(
		c.env.DB,
		'SELECT id, name, email, updated_at FROM parents WHERE id = ?',
		[user.id]
	);
	return c.json({ success: true, message: 'تم تحديث البيانات بنجاح', data: updated });
});

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children
// ══════════════════════════════════════════════════════════════
parents.get('/me/children', async (c) => {
	const parentId = c.get('user').id;

	const children = await getAll<{ id: number; total_stars: number }>(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date, c.is_frozen, c.locked_until,
		        COALESCE(cp.total_stars,    0) AS total_stars,
		        COALESCE(cp.stories_read,   0) AS stories_read,
		        COALESCE(cp.words_learned,  0) AS words_learned,
		        COALESCE(cp.games_score,    0) AS games_score,
		        COALESCE(cp.drawings_saved, 0) AS drawings_saved,
		        COALESCE(cp.math_stars,     0) AS math_stars,
		        COALESCE(cp.total_time_min, 0) AS total_time_min,
		        cp.last_active
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  WHERE c.parent_id = ?
		  ORDER BY c.created_at DESC`,
		[parentId]
	);

	const [stats, achievements] = await Promise.all([
		activityStatsByChild(c.env.DB, parentId),
		achievementCountsByChild(c.env.DB, parentId),
	]);

	return c.json({ success: true, data: children.map((ch) => enrich(ch, stats, achievements)) });
});

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/stats
// ══════════════════════════════════════════════════════════════
parents.get('/me/stats', async (c) => {
	const parentId = c.get('user').id;

	const children = await getAll<{ id: number; total_stars: number; total_time_min: number }>(
		c.env.DB,
		`SELECT c.id, c.name, c.age, c.gender,
		        COALESCE(cp.total_stars,    0) AS total_stars,
		        COALESCE(cp.stories_read,   0) AS stories_read,
		        COALESCE(cp.words_learned,  0) AS words_learned,
		        COALESCE(cp.games_score,    0) AS games_score,
		        COALESCE(cp.drawings_saved, 0) AS drawings_saved,
		        COALESCE(cp.math_stars,     0) AS math_stars,
		        COALESCE(cp.total_time_min, 0) AS total_time_min,
		        cp.last_active
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  WHERE c.parent_id = ?`,
		[parentId]
	);

	// كل ما تبقّى مستقل عن بعضه — ننفّذه على التوازي بدل التسلسل
	const [totals, activityStats, weeklyActivity, recentActivities, stats, achievements] =
		await Promise.all([
			getOne<{
				total_activities: number;
				total_certificates: number;
				arabic_total: number;
				english_total: number;
			}>(
				c.env.DB,
				`SELECT COUNT(*)                                                          AS total_activities,
				        SUM(CASE WHEN al.activity_type = 'certificate'      THEN 1 ELSE 0 END) AS total_certificates,
				        SUM(CASE WHEN al.activity_type = 'arabic_letters'   THEN 1 ELSE 0 END) AS arabic_total,
				        SUM(CASE WHEN al.activity_type = 'english_letters'  THEN 1 ELSE 0 END) AS english_total
				   FROM activity_logs al
				   INNER JOIN children c ON c.id = al.child_id
				  WHERE c.parent_id = ?`,
				[parentId]
			),
			getAll(
				c.env.DB,
				`SELECT al.activity_type,
				        COUNT(*)             AS sessions,
				        SUM(al.stars_earned) AS stars,
				        SUM(al.duration_min) AS total_minutes
				   FROM activity_logs al
				   INNER JOIN children c ON c.id = al.child_id
				  WHERE c.parent_id = ?
				  GROUP BY al.activity_type
				  ORDER BY sessions DESC`,
				[parentId]
			),
			getAll(
				c.env.DB,
				`SELECT DATE(al.completed_at) AS day,
				        COUNT(*)             AS sessions,
				        SUM(al.stars_earned) AS stars
				   FROM activity_logs al
				   INNER JOIN children c ON c.id = al.child_id
				  WHERE c.parent_id = ? AND al.completed_at >= DATE('now', '-7 days')
				  GROUP BY day
				  ORDER BY day ASC`,
				[parentId]
			),
			getAll(
				c.env.DB,
				`SELECT c.name AS child_name, al.activity_type,
				        al.stars_earned, al.score, al.completed_at
				   FROM activity_logs al
				   INNER JOIN children c ON c.id = al.child_id
				  WHERE c.parent_id = ?
				  ORDER BY al.completed_at DESC LIMIT 10`,
				[parentId]
			),
			activityStatsByChild(c.env.DB, parentId),
			achievementCountsByChild(c.env.DB, parentId),
		]);

	return c.json({
		success: true,
		data: {
			totalChildren: children.length,
			totalStars: children.reduce((s, ch) => s + ch.total_stars, 0),
			totalTimeMin: children.reduce((s, ch) => s + ch.total_time_min, 0),
			totalActivities: totals?.total_activities ?? 0,
			totalCertificates: totals?.total_certificates ?? 0,
			arabicLettersTotal: totals?.arabic_total ?? 0,
			englishLettersTotal: totals?.english_total ?? 0,
			children: children.map((ch) => enrich(ch, stats, achievements)),
			activityStats,
			weeklyActivity,
			recentActivities,
		},
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children/:childId/chats — محادثات نجوم
// ══════════════════════════════════════════════════════════════
parents.get('/me/children/:childId/chats', requireChildOwnership, async (c) => {
	const childId = c.get('childId');
	const sessions = await getAll(
		c.env.DB,
		`SELECT s.id, s.started_at, s.last_message_at, s.message_count,
		        (SELECT COUNT(*) FROM ai_chat_messages m
		          WHERE m.session_id = s.id AND m.role = 'user')  AS user_message_count,
		        (SELECT m.content FROM ai_chat_messages m
		          WHERE m.session_id = s.id AND m.role = 'user'
		          ORDER BY m.id ASC LIMIT 1)                      AS first_user_message
		   FROM ai_chat_sessions s
		  WHERE s.child_id = ?
		  ORDER BY s.last_message_at DESC
		  LIMIT ${MAX_SESSIONS_PER_LIST}`,
		[childId]
	);
	return c.json({ success: true, data: sessions });
});

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children/:childId/chats/:sessionId
// ══════════════════════════════════════════════════════════════
parents.get('/me/children/:childId/chats/:sessionId', requireChildOwnership, async (c) => {
	const childId = c.get('childId');
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
		`SELECT id, role, content, created_at
		   FROM ai_chat_messages
		  WHERE session_id = ?
		  ORDER BY id ASC
		  LIMIT ${MAX_MESSAGES_PER_SESSION}`,
		[sessionId]
	);

	return c.json({ success: true, data: { session, messages } });
});

export default parents;
