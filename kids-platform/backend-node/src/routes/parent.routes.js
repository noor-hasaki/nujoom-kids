// src/routes/parent.routes.js

const router = require('express').Router();
const ctrl   = require('../controllers/parent.controller');
const chatCtrl = require('../controllers/chat.controller');
const { requireParent, requireChildOwnership } = require('../middleware/auth');

router.use(requireParent); // جميع المسارات تتطلب JWT ولي أمر

router.get('/me',              ctrl.getMe);
router.put('/me',              ctrl.updateMe);
router.get('/me/children',     ctrl.getMyChildren);
router.get('/me/stats',        ctrl.getMyStats);

// محادثات نجوم — قراءة فقط، بعد التحقق أن الوالد يملك صلاحية على الطفل
router.get('/me/children/:childId/chats',                requireChildOwnership, chatCtrl.listChildSessionsForParent);
router.get('/me/children/:childId/chats/:sessionId',     requireChildOwnership, chatCtrl.getSessionMessagesForParent);

module.exports = router;
