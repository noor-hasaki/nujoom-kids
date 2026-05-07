// src/routes/internal.routes.js — مسارات داخلية لـ Spring Boot Admin Service

const router = require('express').Router();
const { requireAdminKey } = require('../middleware/auth');
const { getOne, getAll, run, saveDB, transaction } = require('../database/db');

// جميع المسارات هنا محمية بـ Admin API Key
router.use(requireAdminKey);

function logAudit(req, action, targetType, targetId, details) {
    try {
        run(
            'INSERT INTO admin_audit (ts, ip, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [Date.now(), req.ip, action, targetType || null, targetId || null, JSON.stringify(details || {})]
        );
    } catch (e) { console.error('audit log error:', e.message); }
}

// ── GET /api/internal/parents ─────────────────────────────────
router.get('/parents', (req, res) => {
    const parents = getAll(
        `SELECT p.id, p.name, p.email, p.is_frozen, p.created_at,
                COUNT(c.id) AS children_count
         FROM parents p
         LEFT JOIN children c ON c.parent_id = p.id
         GROUP BY p.id
         ORDER BY p.created_at DESC`
    );
    res.json({ success: true, data: parents });
});

// ── GET /api/internal/children ────────────────────────────────
router.get('/children', (req, res) => {
    const children = getAll(
        `SELECT c.id, c.name, c.age, c.gender, c.is_frozen, c.join_date,
                c.parent_id, p.name AS parent_name, p.email AS parent_email,
                COALESCE(cp.total_stars, 0) AS total_stars,
                COALESCE(cp.total_time_min, 0) AS total_time_min
         FROM children c
         LEFT JOIN parents p ON p.id = c.parent_id
         LEFT JOIN child_progress cp ON cp.child_id = c.id
         ORDER BY c.created_at DESC`
    );
    res.json({ success: true, data: children });
});

// ── GET /api/internal/relationships ──────────────────────────
router.get('/relationships', (req, res) => {
    const rels = getAll(
        `SELECT pp.parent_id, p.name AS parent_name, p.email AS parent_email,
                pp.child_id,  c.name AS child_name, c.age, c.gender,
                pp.can_view_stats, pp.can_edit_child, pp.can_enter_mode
         FROM parent_permissions pp
         JOIN parents p ON p.id = pp.parent_id
         JOIN children c ON c.id = pp.child_id`
    );
    res.json({ success: true, data: rels });
});

// ── GET /api/internal/stats ──────────────────────────────────
router.get('/stats', (req, res) => {
    const totalParents  = getOne('SELECT COUNT(*) AS cnt FROM parents')?.cnt || 0;
    const totalChildren = getOne('SELECT COUNT(*) AS cnt FROM children')?.cnt || 0;
    const frozenParents = getOne('SELECT COUNT(*) AS cnt FROM parents WHERE is_frozen = 1')?.cnt || 0;
    const frozenChildren= getOne('SELECT COUNT(*) AS cnt FROM children WHERE is_frozen = 1')?.cnt || 0;
    const totalStars    = getOne('SELECT SUM(total_stars) AS s FROM child_progress')?.s || 0;
    const totalActivities = getOne('SELECT COUNT(*) AS cnt FROM activity_logs')?.cnt || 0;

    res.json({
        success: true,
        data: {
            totalParents, totalChildren,
            frozenParents, frozenChildren,
            totalStars, totalActivities
        }
    });
});

// ── PUT /api/internal/parents/:id ────────────────────────────
router.put('/parents/:id', (req, res) => {
    const { name, email, is_frozen } = req.body;
    const updates = [], params = [];

    if (name !== undefined)      { updates.push('name = ?');      params.push(name); }
    if (email !== undefined)     { updates.push('email = ?');     params.push(email); }
    if (is_frozen !== undefined) { updates.push('is_frozen = ?'); params.push(is_frozen ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'لا توجد بيانات', code: 'NO_UPDATE' });

    updates.push('updated_at = datetime("now")');
    params.push(req.params.id);
    run(`UPDATE parents SET ${updates.join(', ')} WHERE id = ?`, params);
    logAudit(req, 'update_parent', 'parent', req.params.id, { fields: Object.keys(req.body) });
    res.json({ success: true, message: 'تم التحديث' });
});

// ── PUT /api/internal/children/:id ───────────────────────────
router.put('/children/:id', (req, res) => {
    const { name, age, is_frozen } = req.body;
    const updates = [], params = [];

    if (name !== undefined)      { updates.push('name = ?');      params.push(name); }
    if (age !== undefined)       { updates.push('age = ?');       params.push(age); }
    if (is_frozen !== undefined) { updates.push('is_frozen = ?'); params.push(is_frozen ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'لا توجد بيانات', code: 'NO_UPDATE' });

    updates.push('updated_at = datetime("now")');
    params.push(req.params.id);
    run(`UPDATE children SET ${updates.join(', ')} WHERE id = ?`, params);
    logAudit(req, 'update_child', 'child', req.params.id, { fields: Object.keys(req.body) });
    res.json({ success: true, message: 'تم التحديث' });
});

// ── DELETE /api/internal/parents/:id ────────────────────────
router.delete('/parents/:id', (req, res) => {
    const parentId = req.params.id;
    try {
        // جلب جميع أطفال هذا الوالد أولاً (قبل الحذف)
        const children = getAll('SELECT id, name FROM children WHERE parent_id = ?', [parentId]);

        // تحقق من وجود ولي الأمر
        const parent = getOne('SELECT id, name FROM parents WHERE id = ?', [parentId]);
        if (!parent) {
            return res.status(404).json({ success: false, error: 'ولي الأمر غير موجود', code: 'NOT_FOUND' });
        }

        // حذف داخل transaction ضامن للاتساق
        transaction(() => {
            // حذف صريح لكل بيانات كل طفل (sql.js لا يُطبّق CASCADE بشكل موثوق)
            children.forEach(child => {
                run('DELETE FROM achievements       WHERE child_id = ?', [child.id]);
                run('DELETE FROM activity_logs      WHERE child_id = ?', [child.id]);
                run('DELETE FROM child_progress     WHERE child_id = ?', [child.id]);
                run('DELETE FROM drawings           WHERE child_id = ?', [child.id]);
                run('DELETE FROM parent_permissions WHERE child_id = ?', [child.id]);
                run('DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [child.id, 'child']);
                run('DELETE FROM children           WHERE id = ?', [child.id]);
            });

            // حذف بيانات ولي الأمر نفسه
            run('DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [parentId, 'parent']);
            run('DELETE FROM parent_permissions WHERE parent_id = ?', [parentId]);
            run('DELETE FROM parents            WHERE id = ?', [parentId]);
        });

        const childNames = children.map(c => c.name).join(', ');
        const childInfo  = children.length > 0
            ? ` وأطفاله: ${childNames}`
            : ' (لا يوجد أطفال)';

        logAudit(req, 'delete_parent', 'parent', parentId, { name: parent.name, children_count: children.length });
        res.json({
            success: true,
            message: `✅ تم حذف ولي الأمر "${parent.name}"${childInfo}. المحذوفات: ${children.length} طفل وجميع إحصائياتهم.`
        });
    } catch (err) {
        console.error('deleteParent (admin) error:', err);
        res.status(500).json({ success: false, error: 'خطأ أثناء الحذف', code: 'DELETE_ERROR' });
    }
});

// ── DELETE /api/internal/children/:id ───────────────────────
router.delete('/children/:id', (req, res) => {
    const childId = req.params.id;
    try {
        const child = getOne('SELECT id, name FROM children WHERE id = ?', [childId]);
        if (!child) {
            return res.status(404).json({ success: false, error: 'الطفل غير موجود', code: 'NOT_FOUND' });
        }

        transaction(() => {
            run('DELETE FROM achievements       WHERE child_id = ?', [childId]);
            run('DELETE FROM activity_logs      WHERE child_id = ?', [childId]);
            run('DELETE FROM child_progress     WHERE child_id = ?', [childId]);
            run('DELETE FROM drawings           WHERE child_id = ?', [childId]);
            run('DELETE FROM parent_permissions WHERE child_id = ?', [childId]);
            run('DELETE FROM refresh_tokens     WHERE user_id = ? AND user_type = ?', [childId, 'child']);
            run('DELETE FROM children           WHERE id = ?', [childId]);
        });

        logAudit(req, 'delete_child', 'child', childId, { name: child.name });
        res.json({ success: true, message: `✅ تم حذف الطفل "${child.name}" وجميع بياناته وإحصائياته` });
    } catch (err) {
        console.error('deleteChild (admin) error:', err);
        res.status(500).json({ success: false, error: 'خطأ أثناء الحذف', code: 'DELETE_ERROR' });
    }
});

// ── PUT /api/internal/parents/:id/freeze ────────────────────
router.put('/parents/:id/freeze', (req, res) => {
    run('UPDATE parents SET is_frozen = 1 WHERE id = ?', [req.params.id]);
    logAudit(req, 'freeze_parent', 'parent', req.params.id, {});
    res.json({ success: true, message: 'تم تجميد الحساب' });
});

// ── PUT /api/internal/parents/:id/unfreeze ──────────────────
router.put('/parents/:id/unfreeze', (req, res) => {
    run('UPDATE parents SET is_frozen = 0 WHERE id = ?', [req.params.id]);
    logAudit(req, 'unfreeze_parent', 'parent', req.params.id, {});
    res.json({ success: true, message: 'تم رفع التجميد' });
});

// ── PUT /api/internal/children/:id/freeze ───────────────────
router.put('/children/:id/freeze', (req, res) => {
    run('UPDATE children SET is_frozen = 1 WHERE id = ?', [req.params.id]);
    logAudit(req, 'freeze_child', 'child', req.params.id, {});
    res.json({ success: true, message: 'تم تجميد حساب الطفل' });
});

router.put('/children/:id/unfreeze', (req, res) => {
    run('UPDATE children SET is_frozen = 0 WHERE id = ?', [req.params.id]);
    logAudit(req, 'unfreeze_child', 'child', req.params.id, {});
    res.json({ success: true, message: 'تم رفع تجميد الطفل' });
});

// ── GET /api/internal/audit ──────────────────────────────────
router.get('/audit', (req, res) => {
    const logs = getAll('SELECT * FROM admin_audit ORDER BY ts DESC LIMIT 200');
    res.json({ success: true, data: logs });
});

module.exports = router;