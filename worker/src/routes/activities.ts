// src/routes/activities.ts — تسجيل الأنشطة والإنجازات والرسومات
// منقول عن activity.controller.js + activity.routes.js

import { Hono } from 'hono';
import { getAll, getOne, prep, run } from '../db';
import { activityRules, validate } from '../lib/validate';
import { authenticate, requireChild } from '../middleware/auth';
import type { AppEnv } from '../types';

const activities = new Hono<AppEnv>();

const MAX_DRAWINGS_PER_CHILD = 50;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type Progress = {
	total_stars: number;
	stories_read: number;
	words_learned: number;
	math_stars: number;
	drawings_saved: number;
	total_time_min: number;
};

// ─── قائمة الإنجازات وشروطها ─────────────────────────────────
const ACHIEVEMENT_RULES: { id: string; label: string; check: (p: Progress) => boolean }[] = [
	{ id: 'first_star', label: 'أول نجمة ⭐', check: (p) => p.total_stars >= 1 },
	{ id: 'stars_10', label: '10 نجوم 🌟', check: (p) => p.total_stars >= 10 },
	{ id: 'stars_50', label: '50 نجمة 💫', check: (p) => p.total_stars >= 50 },
	{ id: 'stars_100', label: 'بطل النجوم 🏆', check: (p) => p.total_stars >= 100 },
	{ id: 'first_story', label: 'قارئ نشيط 📖', check: (p) => p.stories_read >= 1 },
	{ id: 'reader_5', label: 'محب القراءة 📚', check: (p) => p.stories_read >= 5 },
	{ id: 'words_10', label: 'متعلم لغات 🔤', check: (p) => p.words_learned >= 10 },
	{ id: 'math_star', label: 'عبقري الرياضيات 🔢', check: (p) => p.math_stars >= 5 },
	{ id: 'artist', label: 'رسام موهوب 🎨', check: (p) => p.drawings_saved >= 3 },
	{ id: 'time_60', label: 'ساعة تعليم 🕐', check: (p) => p.total_time_min >= 60 },
	{ id: 'time_300', label: '5 ساعات تعليم ⏰', check: (p) => p.total_time_min >= 300 },
];

/**
 * النسخة القديمة كانت تستعلم عن كل إنجاز على حدة داخل حلقة (11 استعلاماً).
 * هنا: قراءة واحدة للمكتسَب مسبقاً، ثم إدراج دفعة واحدة لما استُحقّ جديداً.
 * INSERT OR IGNORE يغطّي سباق UNIQUE(child_id, achievement_id).
 */
async function checkAndAwardAchievements(
	db: D1Database,
	childId: number,
	progress: Progress
): Promise<{ id: string; label: string }[]> {
	const owned = await getAll<{ achievement_id: string }>(
		db,
		'SELECT achievement_id FROM achievements WHERE child_id = ?',
		[childId]
	);
	const ownedIds = new Set(owned.map((r) => r.achievement_id));

	const earned = ACHIEVEMENT_RULES.filter((r) => r.check(progress) && !ownedIds.has(r.id));
	if (!earned.length) return [];

	await db.batch(
		earned.map((r) =>
			prep(db, 'INSERT OR IGNORE INTO achievements (child_id, achievement_id) VALUES (?, ?)', [
				childId,
				r.id,
			])
		)
	);

	return earned.map((r) => ({ id: r.id, label: r.label }));
}

// ══════════════════════════════════════════════════════════════
// POST /api/activities/complete — تسجيل إتمام نشاط
// ══════════════════════════════════════════════════════════════
activities.post('/complete', authenticate, requireChild, async (c) => {
	const childId = c.get('user').id;

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const invalid = validate(body, activityRules);
	if (invalid) return c.json({ success: false, error: invalid, code: 'VALIDATION_ERROR' }, 400);

	const activityType = String(body.activityType);
	const starsEarned = parseInt(String(body.starsEarned ?? 0), 10) || 0;
	const score = parseInt(String(body.score ?? 0), 10) || 0;
	const durationMin = parseInt(String(body.durationMin ?? 0), 10) || 0;
	const metadata = (body.metadata ?? {}) as Record<string, unknown>;

	// حقول خاصة بكل نوع نشاط
	const storiesRead = activityType === 'stories' ? 1 : 0;
	const wordsLearned =
		activityType === 'vocabulary' ? parseInt(String(metadata.wordsCount ?? 1), 10) || 1 : 0;
	const mathStars = activityType === 'math' ? starsEarned : 0;
	const drawingsSaved = activityType === 'drawing' ? 1 : 0;
	const gamesScore = activityType === 'games' ? score : 0;

	// تسجيل النشاط + تحديث التقدم معاً (معاملة ضمنية واحدة)
	await c.env.DB.batch([
		prep(
			c.env.DB,
			`INSERT INTO activity_logs (child_id, activity_type, stars_earned, score, duration_min, metadata)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[childId, activityType, starsEarned, score, durationMin, JSON.stringify(metadata)]
		),
		prep(
			c.env.DB,
			`INSERT INTO child_progress (child_id, total_stars, total_time_min,
			     stories_read, words_learned, games_score, drawings_saved, math_stars)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(child_id) DO UPDATE SET
			     total_stars    = total_stars    + excluded.total_stars,
			     total_time_min = total_time_min + excluded.total_time_min,
			     stories_read   = stories_read   + excluded.stories_read,
			     words_learned  = words_learned  + excluded.words_learned,
			     games_score    = games_score    + excluded.games_score,
			     drawings_saved = drawings_saved + excluded.drawings_saved,
			     math_stars     = math_stars     + excluded.math_stars,
			     last_active    = datetime('now'),
			     updated_at     = datetime('now')`,
			[
				childId,
				starsEarned,
				durationMin,
				storiesRead,
				wordsLearned,
				gamesScore,
				drawingsSaved,
				mathStars,
			]
		),
	]);

	const progress = await getOne<Progress>(c.env.DB, 'SELECT * FROM child_progress WHERE child_id = ?', [
		childId,
	]);

	const newAchievements = progress
		? await checkAndAwardAchievements(c.env.DB, childId, progress)
		: [];

	return c.json({
		success: true,
		message: 'أحسنت! تم تسجيل النشاط 🌟',
		data: {
			starsEarned,
			totalStars: progress?.total_stars ?? 0,
			newAchievements,
		},
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/activities/save-drawing
// ══════════════════════════════════════════════════════════════
activities.post('/save-drawing', authenticate, requireChild, async (c) => {
	const childId = c.get('user').id;

	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const imageData = typeof body.imageData === 'string' ? body.imageData : '';
	const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'رسمة جميلة';

	if (!imageData) {
		return c.json({ success: false, error: 'بيانات الرسمة مطلوبة', code: 'NO_IMAGE_DATA' }, 400);
	}
	if (!/^data:image\/(png|jpeg|webp);base64,/.test(imageData)) {
		return c.json({ success: false, error: 'صيغة الرسمة غير صالحة', code: 'INVALID_IMAGE_FORMAT' }, 400);
	}
	if (imageData.length > MAX_IMAGE_BYTES) {
		return c.json(
			{ success: false, error: 'حجم الرسمة أكبر من المسموح به (2MB)', code: 'IMAGE_TOO_LARGE' },
			400
		);
	}

	// حد أقصى 50 رسمة — احذف الأقدم عند التجاوز
	const count = await getOne<{ cnt: number }>(
		c.env.DB,
		'SELECT COUNT(*) AS cnt FROM drawings WHERE child_id = ?',
		[childId]
	);
	if ((count?.cnt ?? 0) >= MAX_DRAWINGS_PER_CHILD) {
		await run(
			c.env.DB,
			'DELETE FROM drawings WHERE id = (SELECT id FROM drawings WHERE child_id = ? ORDER BY created_at ASC LIMIT 1)',
			[childId]
		);
	}

	const { lastInsertRowid: drawingId } = await run(
		c.env.DB,
		'INSERT INTO drawings (child_id, title, image_data) VALUES (?, ?, ?)',
		[childId, title, imageData]
	);

	await c.env.DB.batch([
		prep(
			c.env.DB,
			`INSERT INTO activity_logs (child_id, activity_type, stars_earned, metadata)
			 VALUES (?, 'drawing', 2, ?)`,
			[childId, JSON.stringify({ drawingId, title })]
		),
		prep(
			c.env.DB,
			`UPDATE child_progress
			    SET drawings_saved = drawings_saved + 1,
			        total_stars    = total_stars + 2,
			        updated_at     = datetime('now')
			  WHERE child_id = ?`,
			[childId]
		),
	]);

	return c.json({ success: true, message: 'تم حفظ رسمتك 🎨', data: { drawingId, title } }, 201);
});

// ══════════════════════════════════════════════════════════════
// GET /api/activities/leaderboard
// ══════════════════════════════════════════════════════════════
activities.get('/leaderboard', authenticate, async (c) => {
	const top = await getAll(
		c.env.DB,
		`SELECT c.id, c.name, c.gender, c.avatar_id,
		        COALESCE(cp.total_stars, 0) AS total_stars
		   FROM children c
		   LEFT JOIN child_progress cp ON cp.child_id = c.id
		  ORDER BY total_stars DESC
		  LIMIT 10`
	);
	return c.json({ success: true, data: top });
});

export default activities;
