// src/controllers/auth.controller.js — منطق التسجيل والدخول

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { getOne, run, transaction } = require('../database/db');

const SALT_ROUNDS = 12;

// ─── توليد Access Token ───────────────────────────────────────
function generateAccessToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    });
}

// ─── توليد Refresh Token عشوائي ──────────────────────────────
function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

// ─── حساب تاريخ انتهاء Refresh Token ─────────────────────────
function refreshTokenExpiry() {
    const days = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '7');
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/parent/register
// ══════════════════════════════════════════════════════════════
async function registerParent(req, res) {
    try {
        const { name, email, password } = req.body;

        // التحقق من عدم تكرار البريد
        const existing = getOne('SELECT id FROM parents WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'هذا البريد الإلكتروني مسجّل مسبقاً',
                code: 'EMAIL_EXISTS'
            });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // إدراج الحساب في قاعدة البيانات
        const result = run(
            'INSERT INTO parents (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        const parentId = result.lastInsertRowid;

        // توليد Tokens
        const tokenPayload = { id: parentId, type: 'parent', email };
        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken();

        run(
            'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES (?, ?, ?, ?)',
            [parentId, 'parent', refreshToken, refreshTokenExpiry()]
        );

        return res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: {
                token: accessToken,
                refreshToken,
                parent: { id: parentId, name, email }
            }
        });

    } catch (err) {
        console.error('registerParent error:', err);
        return res.status(500).json({
            success: false,
            error: 'خطأ في الخادم',
            code: 'SERVER_ERROR'
        });
    }
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/parent/login
// ══════════════════════════════════════════════════════════════
async function loginParent(req, res) {
    try {
        const { email, password } = req.body;

        const parent = getOne(
            'SELECT id, name, email, password, is_frozen FROM parents WHERE email = ?',
            [email]
        );

        if (!parent) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        if (parent.is_frozen) {
            return res.status(403).json({
                success: false,
                error: 'تم تجميد هذا الحساب. تواصل مع الدعم الفني',
                code: 'ACCOUNT_FROZEN'
            });
        }

        const isMatch = await bcrypt.compare(password, parent.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // جلب أطفال ولي الأمر
        const children = require('../database/db').getAll(
            `SELECT c.id, c.name, c.age, c.gender, c.avatar_id, c.join_date,
                    cp.total_stars, cp.last_active
             FROM children c
             LEFT JOIN child_progress cp ON cp.child_id = c.id
             WHERE c.parent_id = ? AND c.is_frozen = 0`,
            [parent.id]
        );

        const tokenPayload = { id: parent.id, type: 'parent', email: parent.email };
        const accessToken  = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken();

        // حذف Tokens القديمة وإضافة جديد
        run('DELETE FROM refresh_tokens WHERE user_id = ? AND user_type = ?', [parent.id, 'parent']);
        run(
            'INSERT INTO refresh_tokens (user_id, user_type, token, expires_at) VALUES (?, ?, ?, ?)',
            [parent.id, 'parent', refreshToken, refreshTokenExpiry()]
        );

        return res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: {
                token: accessToken,
                refreshToken,
                parent: {
                    id: parent.id,
                    name: parent.name,
                    email: parent.email
                },
                children
            }
        });

    } catch (err) {
        console.error('loginParent error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/login  — دخول الطفل بالـ PIN
// ══════════════════════════════════════════════════════════════
async function loginChild(req, res) {
    try {
        const { childId, pin } = req.body;

        const child = getOne(
            'SELECT id, name, age, gender, pin, avatar_id, parent_id, is_frozen FROM children WHERE id = ?',
            [childId]
        );

        if (!child) {
            return res.status(404).json({
                success: false,
                error: 'الطفل غير موجود',
                code: 'CHILD_NOT_FOUND'
            });
        }

        if (child.is_frozen) {
            return res.status(403).json({
                success: false,
                error: 'تم تجميد حساب الطفل مؤقتاً',
                code: 'ACCOUNT_FROZEN'
            });
        }

        const isMatch = await bcrypt.compare(pin, child.pin);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'PIN غير صحيح',
                code: 'INVALID_PIN'
            });
        }

        const tokenPayload = {
            id: child.id,
            type: 'child',
            parentId: child.parent_id
        };
        const accessToken = generateAccessToken(tokenPayload);

        // تحديث آخر نشاط
        run(
            'UPDATE child_progress SET last_active = datetime("now") WHERE child_id = ?',
            [child.id]
        );

        return res.json({
            success: true,
            message: `مرحباً ${child.name}! 🎉`,
            data: {
                token: accessToken,
                child: {
                    id: child.id,
                    name: child.name,
                    age: child.age,
                    gender: child.gender,
                    avatarId: child.avatar_id
                }
            }
        });

    } catch (err) {
        console.error('loginChild error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ══════════════════════════════════════════════════════════════
function refreshToken(req, res) {
    const { refreshToken: token } = req.body;
    if (!token) {
        return res.status(400).json({ success: false, error: 'refreshToken مطلوب', code: 'NO_REFRESH_TOKEN' });
    }

    const stored = getOne(
        'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime("now")',
        [token]
    );

    if (!stored) {
        return res.status(401).json({ success: false, error: 'refreshToken غير صالح أو منتهي', code: 'INVALID_REFRESH_TOKEN' });
    }

    let payload;
    if (stored.user_type === 'parent') {
        const p = getOne('SELECT id, email FROM parents WHERE id = ?', [stored.user_id]);
        payload = { id: p.id, type: 'parent', email: p.email };
    } else {
        const c = getOne('SELECT id, parent_id FROM children WHERE id = ?', [stored.user_id]);
        payload = { id: c.id, type: 'child', parentId: c.parent_id };
    }

    const newToken = generateAccessToken(payload);
    return res.json({ success: true, data: { token: newToken }, message: 'تم تجديد الجلسة' });
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════
function logout(req, res) {
    const { refreshToken: token } = req.body;
    if (token) {
        run('DELETE FROM refresh_tokens WHERE token = ?', [token]);
    }
    return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
}


// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/token-from-parent — ولي الأمر يحصل على توكن الطفل
// ══════════════════════════════════════════════════════════════
async function loginChildAsParent(req, res) {
    try {
        const parentId = req.user.id;
        const { childId } = req.body;

        if (!childId) {
            return res.status(400).json({ success: false, error: 'childId مطلوب', code: 'MISSING_CHILD_ID' });
        }

        // التحقق من ملكية الطفل
        const ownership = getOne(
            'SELECT id FROM parent_permissions WHERE parent_id = ? AND child_id = ?',
            [parentId, childId]
        );
        if (!ownership) {
            return res.status(403).json({ success: false, error: 'ليس طفلك', code: 'NO_ACCESS' });
        }

        const child = getOne(
            'SELECT id, name, age, gender, avatar_id, parent_id, is_frozen FROM children WHERE id = ?',
            [childId]
        );
        if (!child) {
            return res.status(404).json({ success: false, error: 'الطفل غير موجود', code: 'CHILD_NOT_FOUND' });
        }
        if (child.is_frozen) {
            return res.status(403).json({ success: false, error: 'حساب الطفل مجمّد', code: 'ACCOUNT_FROZEN' });
        }

        const tokenPayload = { id: child.id, type: 'child', parentId: child.parent_id };
        const accessToken = generateAccessToken(tokenPayload);

        return res.json({
            success: true,
            message: 'تم إنشاء توكن الطفل',
            data: {
                token: accessToken,
                child: { id: child.id, name: child.name, age: child.age, gender: child.gender, avatarId: child.avatar_id }
            }
        });
    } catch (err) {
        console.error('loginChildAsParent error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/child/login-by-name — دخول الطفل بالاسم + PIN
// ══════════════════════════════════════════════════════════════
async function loginChildByName(req, res) {
    try {
        const { name, pin } = req.body;

        // البحث عن جميع الأطفال بهذا الاسم
        const children = require('../database/db').getAll(
            'SELECT id, name, age, gender, pin, avatar_id, parent_id, is_frozen FROM children WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
            [name]
        );

        if (!children.length) {
            return res.status(404).json({
                success: false,
                error: 'لا يوجد طفل بهذا الاسم',
                code: 'CHILD_NOT_FOUND'
            });
        }

        // تجربة PIN مع كل طفل بنفس الاسم
        let matchedChild = null;
        for (const child of children) {
            if (child.is_frozen) continue;
            const isMatch = await bcrypt.compare(pin, child.pin);
            if (isMatch) { matchedChild = child; break; }
        }

        if (!matchedChild) {
            return res.status(401).json({
                success: false,
                error: 'الاسم أو الرمز السري غير صحيح',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const tokenPayload = {
            id: matchedChild.id,
            type: 'child',
            parentId: matchedChild.parent_id
        };
        const accessToken = generateAccessToken(tokenPayload);

        // تحديث آخر نشاط
        run(
            'UPDATE child_progress SET last_active = datetime("now") WHERE child_id = ?',
            [matchedChild.id]
        );

        return res.json({
            success: true,
            message: `مرحباً ${matchedChild.name}! 🎉`,
            data: {
                token: accessToken,
                child: {
                    id: matchedChild.id,
                    name: matchedChild.name,
                    age: matchedChild.age,
                    gender: matchedChild.gender,
                    avatarId: matchedChild.avatar_id
                }
            }
        });

    } catch (err) {
        console.error('loginChildByName error:', err);
        return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'SERVER_ERROR' });
    }
}

module.exports = { registerParent, loginParent, loginChild, loginChildByName, loginChildAsParent, refreshToken, logout };