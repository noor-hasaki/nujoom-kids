// src/controllers/child.controller.js — عمليات الطفل (نسخة كاملة)

const bcrypt = require('bcryptjs');
const { getOne, getAll, run, transaction } = require('../database/db');

// ══════════════════════════════════════════════════════════════
// POST /api/children  — إنشاء ملف طفل جديد
// ══════════════════════════════════════════════════════════════
async function createChild(req, res) {
    try {
        const { name, age, gender, pin, avatarId = 1 } = req.body;
        const parentId = req.user.id;

        const childCount = getOne(
            'SELECT COUNT(*) AS cnt FROM children WHERE parent_id = ?',
            [parentId]
        );
        if (childCount.cnt >= 5) {
            return res.status(400).json({
                success: false,
                error: 'وصلت للحد الأقصى من عدد الأطفال (5 أطفال لكل حساب)',
                code: 'MAX_CHILDREN_REACHED'
            });
        }

        const hashedPin = await bcrypt.hash(pin, 12);

        const childId = transaction(() => {
            const result = run(
                `INSERT INTO children (parent_id, name, age, gender, pin, avatar_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [parentId, name.trim(), age, gender, hashedPin, avatarId]
            );
            const cid = result.lastInsertRowid;
            run('INSERT INTO child_progress (child_id) VALUES (?)', [cid]);
            run(
                `INSERT INTO parent_permissions (parent_id, child_id) VALUES (?, ?)`,
                [parentId, cid]
            );
            return cid;
        });

        const child = getOne(
            `SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date,
                    cp.total_stars
             FROM children c
             LEFT JOIN child_progress cp ON cp.child_id = c.id
             WHERE c.id = ?`,
            [childId]
        );

        return res.status(201).json({
            success: true,
            message: `تم إضافة ${name} بنجاح 🎉`,
            data: child
        });

    } catch (err) {
        console.error('createChild error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id
// ══════════════════════════════════════════════════════════════
function getChild(req, res) {
    const childId  = parseInt(req.params.id);
    const isParent = req.user.type === 'parent';
    const isOwner  = req.user.type === 'child' && req.user.id === childId;

    if (!isParent && !isOwner) {
        return res.status(403).json({ success: false, error: 'غير مصرح', code: 'FORBIDDEN' });
    }
    if (isParent) {
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [req.user.id, childId]
        );
        if (!ownership) return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const child = getOne(
        `SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date, c.is_frozen,
                cp.total_stars, cp.stories_read, cp.words_learned, cp.games_score,
                cp.drawings_saved, cp.math_stars, cp.total_time_min, cp.last_active
         FROM children c
         LEFT JOIN child_progress cp ON cp.child_id = c.id
         WHERE c.id = ?`,
        [childId]
    );

    if (!child) return res.status(404).json({ success: false, error: 'الطفل غير موجود', code: 'NOT_FOUND' });
    return res.json({ success: true, data: child });
}

// ══════════════════════════════════════════════════════════════
// PUT /api/children/:id
// ══════════════════════════════════════════════════════════════
async function updateChild(req, res) {
    try {
        const childId  = parseInt(req.params.id);
        const parentId = req.user.id;

        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ? AND can_edit_child = 1',
            [parentId, childId]
        );
        if (!ownership) {
            return res.status(403).json({ success: false, error: 'لا تملك صلاحية تعديل هذا الطفل', code: 'FORBIDDEN' });
        }

        const { name, age, gender, pin, avatarId } = req.body;
        const updates = [];
        const params  = [];

        if (name)     { updates.push('name = ?');      params.push(name.trim()); }
        if (age)      { updates.push('age = ?');       params.push(parseInt(age)); }
        if (gender)   { updates.push('gender = ?');    params.push(gender); }
        if (avatarId) { updates.push('avatar_id = ?'); params.push(avatarId); }
        if (pin) {
            const hashedPin = await bcrypt.hash(pin, 12);
            updates.push('pin = ?');
            params.push(hashedPin);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'لا توجد بيانات للتحديث', code: 'NO_UPDATE' });
        }

        updates.push('updated_at = datetime("now")');
        params.push(childId);

        run(`UPDATE children SET ${updates.join(', ')} WHERE id = ?`, params);

        const updated = getOne(
            'SELECT id, name, age, gender, avatar_id FROM children WHERE id = ?',
            [childId]
        );
        return res.json({ success: true, message: 'تم التحديث بنجاح', data: updated });

    } catch (err) {
        console.error('updateChild error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/progress
// ══════════════════════════════════════════════════════════════
function getChildProgress(req, res) {
    const childId = parseInt(req.params.id);

    // التحقق من الصلاحية
    if (req.user.type === 'child' && req.user.id !== childId) {
        return res.status(403).json({ success: false, error: 'غير مصرح', code: 'FORBIDDEN' });
    }
    if (req.user.type === 'parent') {
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [req.user.id, childId]
        );
        if (!ownership) return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const progress = getOne(
        `SELECT cp.*,
                (SELECT COUNT(*) FROM achievements WHERE child_id = ?) AS achievement_count
         FROM child_progress cp
         WHERE cp.child_id = ?`,
        [childId, childId]
    );

    if (!progress) return res.status(404).json({ success: false, error: 'لا يوجد سجل تقدم', code: 'NOT_FOUND' });

    // حساب عدد الحروف المتعلَّمة من activity_logs
    const arabicDone = getOne(
        `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
         FROM activity_logs WHERE child_id = ? AND activity_type = 'arabic_letters'`,
        [childId]
    );
    const englishDone = getOne(
        `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
         FROM activity_logs WHERE child_id = ? AND activity_type = 'english_letters'`,
        [childId]
    );
    const certsDone = getOne(
        `SELECT COUNT(*) AS cnt FROM activity_logs
         WHERE child_id = ? AND activity_type = 'certificate'`,
        [childId]
    );

    const level = Math.floor((progress.total_stars || 0) / 50) + 1;

    return res.json({
        success: true,
        data: {
            ...progress,
            level,
            nextLevelStars:          level * 50,
            arabic_letters_learned:  arabicDone?.cnt  || 0,
            english_letters_learned: englishDone?.cnt || 0,
            certificates_earned:     certsDone?.cnt   || 0
        }
    });
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/activities
// ══════════════════════════════════════════════════════════════
function getChildActivities(req, res) {
    const childId = parseInt(req.params.id);

    if (req.user.type === 'child' && req.user.id !== childId) {
        return res.status(403).json({ success: false, error: 'غير مصرح', code: 'FORBIDDEN' });
    }
    if (req.user.type === 'parent') {
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [req.user.id, childId]
        );
        if (!ownership) return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const { type, limit = 20, offset = 0 } = req.query;

    let sql = `SELECT id, activity_type, stars_earned, score, duration_min, metadata, completed_at
               FROM activity_logs WHERE child_id = ?`;
    const params = [childId];

    if (type) { sql += ' AND activity_type = ?'; params.push(type); }
    sql += ` ORDER BY completed_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const activities = getAll(sql, params);
    const parsed = activities.map(a => ({
        ...a,
        metadata: (() => { try { return JSON.parse(a.metadata); } catch { return {}; } })()
    }));

    return res.json({ success: true, data: parsed });
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/achievements
// ══════════════════════════════════════════════════════════════
function getChildAchievements(req, res) {
    const childId = parseInt(req.params.id);

    if (req.user.type === 'child' && req.user.id !== childId) {
        return res.status(403).json({ success: false, error: 'غير مصرح', code: 'FORBIDDEN' });
    }
    if (req.user.type === 'parent') {
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [req.user.id, childId]
        );
        if (!ownership) return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const achievements = getAll(
        'SELECT id, achievement_id, earned_at FROM achievements WHERE child_id = ? ORDER BY earned_at DESC',
        [childId]
    );

    return res.json({ success: true, data: achievements });
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/stats/summary
// إحصائيات كاملة لعرضها في لوحة الوالدين
// ══════════════════════════════════════════════════════════════
function getChildStatsSummary(req, res) {
    const childId  = parseInt(req.params.id);
    const parentId = req.user.id;

    const ownership = getOne(
        'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
        [parentId, childId]
    );
    if (!ownership) {
        return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const progress = getOne('SELECT * FROM child_progress WHERE child_id = ?', [childId]);

    // عدد الحروف المتعلَّمة (arabic + english)
    const arabicDone = getOne(
        `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
         FROM activity_logs WHERE child_id = ? AND activity_type = 'arabic_letters'`,
        [childId]
    );
    const englishDone = getOne(
        `SELECT COUNT(DISTINCT json_extract(metadata, '$.letterIndex')) AS cnt
         FROM activity_logs WHERE child_id = ? AND activity_type = 'english_letters'`,
        [childId]
    );

    // عدد الشهادات
    const certsDone = getOne(
        `SELECT COUNT(*) AS cnt FROM activity_logs
         WHERE child_id = ? AND activity_type = 'certificate'`,
        [childId]
    );

    // إجمالي الأنشطة
    const totalActivities = getOne(
        `SELECT COUNT(*) AS cnt FROM activity_logs WHERE child_id = ?`,
        [childId]
    );

    // عدد الإنجازات
    const achievementsCount = getOne(
        `SELECT COUNT(*) AS cnt FROM achievements WHERE child_id = ?`,
        [childId]
    );

    // آخر 10 أنشطة
    const recentActivities = getAll(
        `SELECT activity_type, stars_earned, score, duration_min, metadata, completed_at
         FROM activity_logs WHERE child_id = ?
         ORDER BY completed_at DESC LIMIT 10`,
        [childId]
    );

    // النشاط المفضّل
    const favoriteActivity = getOne(
        `SELECT activity_type, COUNT(*) AS count
         FROM activity_logs WHERE child_id = ?
         GROUP BY activity_type ORDER BY count DESC LIMIT 1`,
        [childId]
    );

    // نجوم آخر 7 أيام
    const weeklyStars = getAll(
        `SELECT DATE(completed_at) AS day, SUM(stars_earned) AS stars
         FROM activity_logs
         WHERE child_id = ? AND completed_at >= DATE('now', '-7 days')
         GROUP BY day ORDER BY day ASC`,
        [childId]
    );

    // إحصائيات كل نوع نشاط
    const activityBreakdown = getAll(
        `SELECT activity_type,
                COUNT(*)             AS sessions,
                SUM(stars_earned)    AS stars,
                SUM(duration_min)    AS total_minutes
         FROM activity_logs WHERE child_id = ?
         GROUP BY activity_type ORDER BY sessions DESC`,
        [childId]
    );

    const level = Math.floor((progress?.total_stars || 0) / 50) + 1;

    return res.json({
        success: true,
        data: {
            progress: {
                ...(progress || {}),
                arabic_letters_learned:  arabicDone?.cnt  || 0,
                english_letters_learned: englishDone?.cnt || 0,
                certificates_earned:     certsDone?.cnt   || 0,
                total_activities:        totalActivities?.cnt || 0,
                achievements_count:      achievementsCount?.cnt || 0
            },
            level,
            nextLevelStars:    level * 50,
            recentActivities:  recentActivities.map(a => ({
                ...a,
                metadata: (() => { try { return JSON.parse(a.metadata); } catch { return {}; } })()
            })),
            favoriteActivity:  favoriteActivity?.activity_type || null,
            weeklyStars,
            activityBreakdown
        }
    });
}

// ══════════════════════════════════════════════════════════════
// POST /api/children/:id/unlock — إعادة تعيين قفل PIN (ولي الأمر فقط)
// ══════════════════════════════════════════════════════════════
function unlockChild(req, res) {
    const childId  = parseInt(req.params.id);
    const parentId = req.user.id;

    const ownership = getOne(
        'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
        [parentId, childId]
    );
    if (!ownership) {
        return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    run('UPDATE children SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?', [childId]);
    return res.json({ success: true, message: 'تم إعادة تعيين قفل الحساب' });
}

// ══════════════════════════════════════════════════════════════
// DELETE /api/children/:id  — حذف طفل (ولي الأمر فقط)
// ══════════════════════════════════════════════════════════════
function deleteChild(req, res) {
    try {
        const childId  = parseInt(req.params.id);
        const parentId = req.user.id;

        // التحقق من الملكية
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [parentId, childId]
        );
        if (!ownership) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك صلاحية حذف هذا الطفل',
                code: 'FORBIDDEN'
            });
        }

        // حذف تدريجي صريح (لأن sql.js لا يُطبّق CASCADE بشكل موثوق)
        run('DELETE FROM achievements        WHERE child_id = ?', [childId]);
        run('DELETE FROM activity_logs       WHERE child_id = ?', [childId]);
        run('DELETE FROM child_progress      WHERE child_id = ?', [childId]);
        run('DELETE FROM drawings            WHERE child_id = ?', [childId]);
        run('DELETE FROM parent_permissions  WHERE child_id = ?', [childId]);
        run('DELETE FROM refresh_tokens      WHERE user_id = ? AND user_type = ?', [childId, 'child']);
        run('DELETE FROM children            WHERE id = ? AND parent_id = ?', [childId, parentId]);

        return res.json({ success: true, message: 'تم حذف الطفل وجميع بياناته بنجاح' });

    } catch (err) {
        console.error('deleteChild error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// GET /api/children/:id/ai-chats — ولي الأمر فقط
// يُرجع محادثات الطفل مع نجوم مجمَّعة حسب الجلسة
// ══════════════════════════════════════════════════════════════
function getChildAiChats(req, res) {
    const childId  = parseInt(req.params.id);
    const parentId = req.user.id;

    const ownership = getOne(
        'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
        [parentId, childId]
    );
    if (!ownership) {
        return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
    }

    const { limit = 20, offset = 0 } = req.query;

    // Fetch messages for the most recent sessions
    const sessionIds = getAll(
        `SELECT DISTINCT session_id, MIN(created_at) AS started_at
         FROM ai_chats WHERE child_id = ?
         GROUP BY session_id
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`,
        [childId, parseInt(limit), parseInt(offset)]
    );

    const sessions = sessionIds.map(s => {
        const messages = getAll(
            `SELECT role, content, created_at
             FROM ai_chats WHERE child_id = ? AND session_id = ?
             ORDER BY created_at ASC`,
            [childId, s.session_id]
        );
        return {
            sessionId:  s.session_id,
            startedAt:  s.started_at,
            messages
        };
    });

    const totalSessions = getOne(
        'SELECT COUNT(DISTINCT session_id) AS cnt FROM ai_chats WHERE child_id = ?',
        [childId]
    );
    const totalMessages = getOne(
        'SELECT COUNT(*) AS cnt FROM ai_chats WHERE child_id = ?',
        [childId]
    );

    return res.json({
        success: true,
        data: {
            sessions,
            totalSessions: totalSessions?.cnt || 0,
            totalMessages: totalMessages?.cnt || 0
        }
    });
}

module.exports = {
    createChild,
    getChild,
    updateChild,
    unlockChild,
    deleteChild,
    getChildProgress,
    getChildActivities,
    getChildAchievements,
    getChildStatsSummary,
    getChildAiChats
};