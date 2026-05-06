// src/controllers/activity.controller.js — تسجيل الأنشطة والإنجازات

const { getOne, getAll, run, transaction } = require('../database/db');

// ─── قائمة الإنجازات وشروطها ─────────────────────────────────
const ACHIEVEMENT_RULES = [
    { id: 'first_star',       check: (p) => p.total_stars >= 1,   label: 'أول نجمة ⭐' },
    { id: 'stars_10',         check: (p) => p.total_stars >= 10,  label: '10 نجوم 🌟' },
    { id: 'stars_50',         check: (p) => p.total_stars >= 50,  label: '50 نجمة 💫' },
    { id: 'stars_100',        check: (p) => p.total_stars >= 100, label: 'بطل النجوم 🏆' },
    { id: 'first_story',      check: (p) => p.stories_read >= 1,  label: 'قارئ نشيط 📖' },
    { id: 'reader_5',         check: (p) => p.stories_read >= 5,  label: 'محب القراءة 📚' },
    { id: 'words_10',         check: (p) => p.words_learned >= 10, label: 'متعلم لغات 🔤' },
    { id: 'math_star',        check: (p) => p.math_stars >= 5,    label: 'عبقري الرياضيات 🔢' },
    { id: 'artist',           check: (p) => p.drawings_saved >= 3, label: 'رسام موهوب 🎨' },
    { id: 'time_60',          check: (p) => p.total_time_min >= 60, label: 'ساعة تعليم 🕐' },
    { id: 'time_300',         check: (p) => p.total_time_min >= 300, label: '5 ساعات تعليم ⏰' },
];

// ─── التحقق من الإنجازات الجديدة ──────────────────────────────
function checkAndAwardAchievements(childId, progress) {
    const awarded = [];

    for (const rule of ACHIEVEMENT_RULES) {
        if (!rule.check(progress)) continue;

        // هل الإنجاز مُكتسَب مسبقاً؟
        const existing = getOne(
            'SELECT id FROM achievements WHERE child_id = ? AND achievement_id = ?',
            [childId, rule.id]
        );
        if (existing) continue;

        // منح الإنجاز
        try {
            run(
                'INSERT INTO achievements (child_id, achievement_id) VALUES (?, ?)',
                [childId, rule.id]
            );
            awarded.push({ id: rule.id, label: rule.label });
        } catch (e) {
            // UNIQUE constraint — تجاهل
        }
    }

    return awarded;
}

// ══════════════════════════════════════════════════════════════
// POST /api/activities/complete  — تسجيل إتمام نشاط
// ══════════════════════════════════════════════════════════════
function completeActivity(req, res) {
    try {
        const childId = req.user.id;
        const {
            activityType,
            starsEarned = 0,
            score       = 0,
            durationMin = 0,
            metadata    = {}
        } = req.body;

        const newAchievements = transaction(() => {
            // 1. تسجيل النشاط في السجل
            run(
                `INSERT INTO activity_logs
                 (child_id, activity_type, stars_earned, score, duration_min, metadata)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [childId, activityType, starsEarned, score, durationMin, JSON.stringify(metadata)]
            );

            // 2. تحديث child_progress
            const updateFields = {
                total_stars:    starsEarned,
                total_time_min: durationMin
            };

            // حقول خاصة بكل نشاط
            if (activityType === 'stories')          updateFields.stories_read    = 1;
            if (activityType === 'vocabulary')       updateFields.words_learned   = metadata.wordsCount || 1;
            if (activityType === 'math')             updateFields.math_stars      = starsEarned;
            if (activityType === 'drawing')          updateFields.drawings_saved  = 1;
            if (activityType === 'games')            updateFields.games_score     = score;

            run(
                `INSERT INTO child_progress (child_id, total_stars, total_time_min,
                    stories_read, words_learned, games_score, drawings_saved, math_stars)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(child_id) DO UPDATE SET
                    total_stars     = total_stars    + excluded.total_stars,
                    total_time_min  = total_time_min + excluded.total_time_min,
                    stories_read    = stories_read   + excluded.stories_read,
                    words_learned   = words_learned  + excluded.words_learned,
                    games_score     = games_score    + excluded.games_score,
                    drawings_saved  = drawings_saved + excluded.drawings_saved,
                    math_stars      = math_stars     + excluded.math_stars,
                    last_active     = datetime('now'),
                    updated_at      = datetime('now')`,
                [
                    childId,
                    starsEarned,
                    durationMin,
                    updateFields.stories_read    || 0,
                    updateFields.words_learned   || 0,
                    updateFields.games_score     || 0,
                    updateFields.drawings_saved  || 0,
                    updateFields.math_stars      || 0
                ]
            );

            // 3. جلب التقدم المحدَّث
            const updatedProgress = getOne(
                'SELECT * FROM child_progress WHERE child_id = ?',
                [childId]
            );

            // 4. التحقق من الإنجازات الجديدة
            return checkAndAwardAchievements(childId, updatedProgress);
        });

        const progress = getOne(
            'SELECT total_stars, total_time_min FROM child_progress WHERE child_id = ?',
            [childId]
        );

        return res.json({
            success: true,
            message: 'أحسنت! تم تسجيل النشاط 🌟',
            data: {
                starsEarned,
                totalStars:  progress?.total_stars || 0,
                newAchievements
            }
        });

    } catch (err) {
        console.error('completeActivity error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// POST /api/activities/save-drawing
// ══════════════════════════════════════════════════════════════
function saveDrawing(req, res) {
    try {
        const childId = req.user.id;
        const { imageData, title = 'رسمة جميلة' } = req.body;

        if (!imageData) {
            return res.status(400).json({ success: false, error: 'بيانات الرسمة مطلوبة', code: 'NO_IMAGE_DATA' });
        }

        // حد أقصى 50 رسمة للطفل
        const count = getOne('SELECT COUNT(*) AS cnt FROM drawings WHERE child_id = ?', [childId]);
        if (count.cnt >= 50) {
            // حذف الأقدم
            const oldest = getOne('SELECT id FROM drawings WHERE child_id = ? ORDER BY created_at ASC LIMIT 1', [childId]);
            if (oldest) run('DELETE FROM drawings WHERE id = ?', [oldest.id]);
        }

        const result = run(
            'INSERT INTO drawings (child_id, title, image_data) VALUES (?, ?, ?)',
            [childId, title, imageData]
        );

        // تسجيل نشاط الرسم أيضاً
        run(
            `INSERT INTO activity_logs (child_id, activity_type, stars_earned, metadata)
             VALUES (?, 'drawing', 2, ?)`,
            [childId, JSON.stringify({ drawingId: result.lastInsertRowid, title })]
        );

        run(
            `UPDATE child_progress SET drawings_saved = drawings_saved + 1,
             total_stars = total_stars + 2, updated_at = datetime('now')
             WHERE child_id = ?`,
            [childId]
        );

        return res.status(201).json({
            success: true,
            message: 'تم حفظ رسمتك 🎨',
            data: { drawingId: result.lastInsertRowid, title }
        });

    } catch (err) {
        console.error('saveDrawing error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// GET /api/activities/leaderboard
// ══════════════════════════════════════════════════════════════
function getLeaderboard(req, res) {
    const top = getAll(
        `SELECT c.id, c.name, c.gender, c.avatar_id,
                COALESCE(cp.total_stars, 0) AS total_stars
         FROM children c
         LEFT JOIN child_progress cp ON cp.child_id = c.id
         ORDER BY total_stars DESC
         LIMIT 10`
    );

    return res.json({ success: true, data: top });
}

module.exports = { completeActivity, saveDrawing, getLeaderboard };
