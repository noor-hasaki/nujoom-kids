// src/routes/auth.routes.js — مسارات التسجيل والدخول

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl      = require('../controllers/auth.controller');
const { registerRules, loginRules, childLoginRules, childLoginByNameRules } = require('../middleware/validate');
const { requireParent } = require('../middleware/auth');

// Rate Limiting: 15 محاولات لكل IP كل 15 دقيقة
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: {
        success: false,
        error: 'محاولات كثيرة جداً، حاول مرة أخرى بعد 15 دقيقة',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiting: 20 تجديد لكل IP كل 15 دقيقة
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: 'محاولات تجديد الجلسة كثيرة جداً، حاول مرة أخرى بعد 15 دقيقة',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

router.post('/parent/register', authLimiter, registerRules, ctrl.registerParent);
router.post('/parent/login',    authLimiter, loginRules,    ctrl.loginParent);
router.post('/child/login',     authLimiter, childLoginRules, ctrl.loginChild);
router.post('/child/login-by-name', authLimiter, childLoginByNameRules, ctrl.loginChildByName);
router.post('/child/token-from-parent', requireParent, ctrl.loginChildAsParent);
router.post('/refresh',         refreshLimiter, ctrl.refreshToken);
router.post('/logout',          ctrl.logout);

module.exports = router;