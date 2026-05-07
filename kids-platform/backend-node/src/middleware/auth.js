// src/middleware/auth.js — التحقق من JWT والصلاحيات

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { getOne } = require('../database/db');

// ── التحقق من Access Token (ولي الأمر أو الطفل) ───────────────
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'لا يوجد token، يرجى تسجيل الدخول أولاً',
            code: 'NO_TOKEN'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { id, type: 'parent'|'child', email?, ... }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
                code: 'TOKEN_EXPIRED'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'token غير صالح',
            code: 'INVALID_TOKEN'
        });
    }
}

// ── التحقق أن المستخدم ولي أمر ────────────────────────────────
function requireParent(req, res, next) {
    authenticate(req, res, () => {
        if (req.user.type !== 'parent') {
            return res.status(403).json({
                success: false,
                error: 'هذا الطلب مخصص لأولياء الأمور فقط',
                code: 'PARENT_ONLY'
            });
        }
        // التحقق أن حساب الأهل غير مجمّد
        const parent = getOne('SELECT is_frozen FROM parents WHERE id = ?', [req.user.id]);
        if (!parent || parent.is_frozen) {
            return res.status(403).json({
                success: false,
                error: 'تم تجميد هذا الحساب. تواصل مع الدعم الفني',
                code: 'ACCOUNT_FROZEN'
            });
        }
        next();
    });
}

// ── التحقق أن المستخدم طفل ────────────────────────────────────
function requireChild(req, res, next) {
    authenticate(req, res, () => {
        if (req.user.type !== 'child') {
            return res.status(403).json({
                success: false,
                error: 'هذا الطلب مخصص للأطفال فقط',
                code: 'CHILD_ONLY'
            });
        }
        // التحقق أن حساب الطفل غير مجمّد
        const child = getOne('SELECT is_frozen FROM children WHERE id = ?', [req.user.id]);
        if (!child || child.is_frozen) {
            return res.status(403).json({
                success: false,
                error: 'تم تجميد هذا الحساب مؤقتاً',
                code: 'ACCOUNT_FROZEN'
            });
        }
        next();
    });
}

// ── التحقق من Internal Admin API Key ──────────────────────────
function requireAdminKey(req, res, next) {
    const key    = req.headers['x-admin-key'] || req.cookies?.admin_key;
    const secret = process.env.INTERNAL_ADMIN_API_KEY;

    let valid = false;
    if (key && secret) {
        try {
            const keyBuf    = Buffer.from(key);
            const secretBuf = Buffer.from(secret);
            valid = keyBuf.length === secretBuf.length &&
                    crypto.timingSafeEqual(keyBuf, secretBuf);
        } catch {
            valid = false;
        }
    }

    if (!valid) {
        return res.status(403).json({
            success: false,
            error: 'مفتاح Admin غير صالح',
            code: 'INVALID_ADMIN_KEY'
        });
    }
    next();
}

// ── التحقق أن ولي الأمر يملك صلاحية على هذا الطفل ────────────
function requireChildOwnership(req, res, next) {
    const childId  = parseInt(req.params.id || req.params.childId);
    const parentId = req.user.id;

    const ownership = getOne(
        'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
        [parentId, childId]
    );

    if (!ownership) {
        return res.status(403).json({
            success: false,
            error: 'ليس لديك صلاحية الوصول لهذا الطفل',
            code: 'NO_CHILD_ACCESS'
        });
    }
    req.childId = childId;
    next();
}

module.exports = {
    authenticate,
    requireParent,
    requireChild,
    requireAdminKey,
    requireChildOwnership
};
