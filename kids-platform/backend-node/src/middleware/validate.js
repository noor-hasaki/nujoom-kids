// src/middleware/validate.js — التحقق من صحة المدخلات

const { body, param, query, validationResult } = require('express-validator');

// ── دالة استخراج أخطاء التحقق وإرجاعها ──────────────────────
function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: errors.array()[0].msg,
            code: 'VALIDATION_ERROR',
            details: errors.array()
        });
    }
    next();
}

// ── قواعد التسجيل (ولي الأمر) ────────────────────────────────
const registerRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('الاسم مطلوب')
        .isLength({ min: 2, max: 50 }).withMessage('الاسم يجب أن يكون بين 2 و 50 حرف'),

    body('email')
        .trim().toLowerCase()
        .isEmail().withMessage('البريد الإلكتروني غير صالح')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
        .matches(/\d/).withMessage('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل'),

    handleValidation
];

// ── قواعد تسجيل الدخول ───────────────────────────────────────
const loginRules = [
    body('email')
        .trim().toLowerCase()
        .isEmail().withMessage('البريد الإلكتروني غير صالح'),

    body('password')
        .notEmpty().withMessage('كلمة المرور مطلوبة'),

    handleValidation
];

// ── قواعد إنشاء الطفل ────────────────────────────────────────
const createChildRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('اسم الطفل مطلوب')
        .isLength({ min: 2, max: 30 }).withMessage('اسم الطفل يجب أن يكون بين 2 و 30 حرف'),

    body('age')
        .isInt({ min: 3, max: 12 }).withMessage('العمر يجب أن يكون بين 3 و 12 سنة'),

    body('gender')
        .isIn(['boy', 'girl']).withMessage('الجنس يجب أن يكون boy أو girl'),

    body('pin')
        .matches(/^\d{4}$/).withMessage('PIN يجب أن يكون 4 أرقام بالضبط'),

    body('avatarId')
        .optional()
        .isInt({ min: 1, max: 10 }).withMessage('avatar_id يجب أن يكون بين 1 و 10'),

    handleValidation
];

// ── قواعد تسجيل دخول الطفل بالـ PIN ─────────────────────────
const childLoginRules = [
    body('childId')
        .isInt({ min: 1 }).withMessage('childId غير صالح'),

    body('pin')
        .matches(/^\d{4}$/).withMessage('PIN يجب أن يكون 4 أرقام'),

    handleValidation
];

// ── قواعد تسجيل النشاط ───────────────────────────────────────
const activityRules = [
    body('activityType')
        .isIn([
            'arabic_letters', 'english_letters', 'stories',
            'games', 'math', 'vocabulary', 'drawing', 'certificate'
        ]).withMessage('نوع النشاط غير صالح'),

    body('starsEarned')
        .optional()
        .isInt({ min: 0, max: 10 }).withMessage('النجوم يجب أن تكون بين 0 و 10'),

    body('score')
        .optional()
        .isInt({ min: 0 }).withMessage('النتيجة يجب أن تكون رقماً موجباً'),

    body('durationMin')
        .optional()
        .isInt({ min: 0, max: 480 }).withMessage('المدة يجب أن تكون بين 0 و 480 دقيقة'),

    handleValidation
];

// ── التحقق من ID في الـ params ────────────────────────────────
const idParamRule = [
    param('id')
        .isInt({ min: 1 }).withMessage('المعرّف غير صالح'),

    handleValidation
];

module.exports = {
    registerRules,
    loginRules,
    createChildRules,
    childLoginRules,
    activityRules,
    idParamRule
};
