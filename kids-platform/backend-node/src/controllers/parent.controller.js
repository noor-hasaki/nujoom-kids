// src/controllers/parent.controller.js — لوحة إحصائيات الأهل (نسخة كاملة)

const bcrypt       = require('bcryptjs');
const { getOne, getAll, run } = require('../database/db');

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me
// ══════════════════════════════════════════════════════════════
function getMe(req, res) {
    const parent = getOne(
        'SELECT id, name, email, created_at FROM parents WHERE id = ?',
        [req.user.id]
    );
    if (!parent) {
        return res.status(404).json({ success: false, error: 'الحساب غير موجود', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data: parent });
}

// ══════════════════════════════════════════════════════════════
// PUT /api/parents/me
// ══════════════════════════════════════════════════════════════
async function updateMe(req, res) {
    try {
        const { name, password } = req.body;
        const updates = [];
        const params  = [];

        if (name) {
            updates.push('name = ?');
            params.push(name.trim());
        }
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
                    code: 'INVALID_PASSWORD'
                });
            }
            const hashed = await bcrypt.hash(password, 12);
            updates.push('password = ?');
            params.push(hashed);
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'لا توجد بيانات للتحديث', code: 'NO_UPDATE' });
        }

        updates.push('updated_at = datetime("now")');
        params.push(req.user.id);

        run(`UPDATE parents SET ${updates.join(', ')} WHERE id = ?`, params);
        const updated = getOne('SELECT id, name, email, updated_at FROM parents WHERE id = ?', [req.user.id]);
        return res.json({ success: true, message: 'تم تحديث البيانات بنجاح', data: updated });

    } catch (err) {
        console.error('updateMe error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/children
// يُرجع بيانات كل الأطفال مع إحصائيات كاملة من DB
// ══════════════════════════════════════════════════════════════
function getMyChildren(req, res) {
    const parentId = req.user.id;

    const children = getAll(
        `SELECT
            c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date, c.is_frozen, c.locked_until,
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

    // لكل طفل: أحضر عدد الحروف العربية والإنجليزية المتعلَّمة من activity_logs
    const enriched = children.map(child => {
        const arabicLetters = getOne(
            `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
             FROM activity_logs
             WHERE child_id = ? AND activity_type = 'arabic_letters'`,
            [child.id]
        );
        const englishLetters = getOne(
            `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
             FROM activity_logs
             WHERE child_id = ? AND activity_type = 'english_letters'`,
            [child.id]
        );
        const certificates = getOne(
            `SELECT COUNT(*) AS cnt FROM activity_logs
             WHERE child_id = ? AND activity_type = 'certificate'`,
            [child.id]
        );
        const totalActivities = getOne(
            `SELECT COUNT(*) AS cnt FROM activity_logs WHERE child_id = ?`,
            [child.id]
        );
        const achievements = getOne(
            `SELECT COUNT(*) AS cnt FROM achievements WHERE child_id = ?`,
            [child.id]
        );

        return {
            ...child,
            arabic_letters_learned:  arabicLetters?.cnt  || 0,
            english_letters_learned: englishLetters?.cnt || 0,
            certificates_earned:     certificates?.cnt   || 0,
            total_activities:        totalActivities?.cnt || 0,
            achievements_count:      achievements?.cnt    || 0,
            level: Math.floor((child.total_stars / 50)) + 1
        };
    });

    return res.json({ success: true, data: enriched });
}

// ══════════════════════════════════════════════════════════════
// GET /api/parents/me/stats
// إحصائيات شاملة لجميع الأطفال — تُعرض في لوحة الوالدين
// ══════════════════════════════════════════════════════════════
function getMyStats(req, res) {
    const parentId = req.user.id;

    // ── إجماليات الأطفال ──
    const children = getAll(
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

    const totalStars   = children.reduce((s, c) => s + c.total_stars, 0);
    const totalTimeMin = children.reduce((s, c) => s + c.total_time_min, 0);

    // ── إجمالي الأنشطة المكتملة (من activity_logs) ──
    const totalActivities = getOne(
        `SELECT COUNT(*) AS cnt
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ?`,
        [parentId]
    );

    // ── عدد الشهادات ──
    const totalCertificates = getOne(
        `SELECT COUNT(*) AS cnt
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ? AND al.activity_type = 'certificate'`,
        [parentId]
    );

    // ── الحروف العربية الإجمالية ──
    const arabicLettersTotal = getOne(
        `SELECT COUNT(*) AS cnt
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ? AND al.activity_type = 'arabic_letters'`,
        [parentId]
    );

    // ── الحروف الإنجليزية الإجمالية ──
    const englishLettersTotal = getOne(
        `SELECT COUNT(*) AS cnt
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ? AND al.activity_type = 'english_letters'`,
        [parentId]
    );

    // ── إحصائيات كل نوع نشاط ──
    const activityStats = getAll(
        `SELECT al.activity_type,
                COUNT(*)              AS sessions,
                SUM(al.stars_earned)  AS stars,
                SUM(al.duration_min)  AS total_minutes
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ?
         GROUP BY al.activity_type
         ORDER BY sessions DESC`,
        [parentId]
    );

    // ── نشاط آخر 7 أيام ──
    const weeklyActivity = getAll(
        `SELECT DATE(al.completed_at) AS day,
                COUNT(*)              AS sessions,
                SUM(al.stars_earned)  AS stars
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ? AND al.completed_at >= DATE('now', '-7 days')
         GROUP BY day
         ORDER BY day ASC`,
        [parentId]
    );

    // ── آخر 10 أنشطة لجميع الأطفال ──
    const recentActivities = getAll(
        `SELECT c.name AS child_name, al.activity_type,
                al.stars_earned, al.score, al.completed_at
         FROM activity_logs al
         INNER JOIN children c ON c.id = al.child_id
         WHERE c.parent_id = ?
         ORDER BY al.completed_at DESC LIMIT 10`,
        [parentId]
    );

    // ── إنجازات كل طفل ──
    const childrenWithDetails = children.map(child => {
        const arabicDone = getOne(
            `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
             FROM activity_logs WHERE child_id = ? AND activity_type = 'arabic_letters'`,
            [child.id]
        );
        const englishDone = getOne(
            `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
             FROM activity_logs WHERE child_id = ? AND activity_type = 'english_letters'`,
            [child.id]
        );
        const achCount = getOne(
            `SELECT COUNT(*) AS cnt FROM achievements WHERE child_id = ?`,
            [child.id]
        );
        const certCount = getOne(
            `SELECT COUNT(*) AS cnt FROM activity_logs
             WHERE child_id = ? AND activity_type = 'certificate'`,
            [child.id]
        );
        return {
            ...child,
            arabic_letters_learned:  arabicDone?.cnt  || 0,
            english_letters_learned: englishDone?.cnt || 0,
            achievements_count:      achCount?.cnt    || 0,
            certificates_earned:     certCount?.cnt   || 0,
            level: Math.floor(child.total_stars / 50) + 1
        };
    });

    return res.json({
        success: true,
        data: {
            totalChildren:        children.length,
            totalStars,
            totalTimeMin,
            totalActivities:      totalActivities?.cnt   || 0,
            totalCertificates:    totalCertificates?.cnt || 0,
            arabicLettersTotal:   arabicLettersTotal?.cnt  || 0,
            englishLettersTotal:  englishLettersTotal?.cnt || 0,
            children:             childrenWithDetails,
            activityStats,
            weeklyActivity,
            recentActivities
        }
    });
}

module.exports = { getMe, updateMe, getMyChildren, getMyStats };