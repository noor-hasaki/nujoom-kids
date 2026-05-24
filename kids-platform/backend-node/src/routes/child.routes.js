// src/routes/child.routes.js

const router = require('express').Router();
const ctrl   = require('../controllers/child.controller');
const chatCtrl = require('../controllers/chat.controller');
const { requireParent, requireChild, authenticate } = require('../middleware/auth');
const { createChildRules } = require('../middleware/validate');

// إنشاء طفل — ولي أمر فقط
router.post('/', requireParent, createChildRules, ctrl.createChild);

// محادثات الطفل مع نجوم — يجب تعريفها قبل '/:id' حتى لا تُفسَّر "me" كمعرّف
router.get('/me/chats',             requireChild, chatCtrl.listMyChildSessions);
router.get('/me/chats/:sessionId',  requireChild, chatCtrl.getMySessionMessages);

// قراءة بيانات — يصل إليها الوالد أو الطفل نفسه
router.get('/:id',               authenticate, ctrl.getChild);
router.get('/:id/progress',      authenticate, ctrl.getChildProgress);
router.get('/:id/activities',    authenticate, ctrl.getChildActivities);
router.get('/:id/achievements',  authenticate, ctrl.getChildAchievements);
router.get('/:id/stats/summary', requireParent, ctrl.getChildStatsSummary);

// إعادة تعيين قفل PIN — ولي أمر فقط
router.post('/:id/unlock', requireParent, ctrl.unlockChild);

// تعديل — ولي أمر فقط
router.put('/:id',    requireParent, ctrl.updateChild);

// حذف — ولي أمر فقط
router.delete('/:id', requireParent, ctrl.deleteChild);

module.exports = router;