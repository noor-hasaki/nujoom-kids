// src/routes/child.routes.js

const router = require('express').Router();
const ctrl   = require('../controllers/child.controller');
const { requireParent, authenticate } = require('../middleware/auth');
const { createChildRules } = require('../middleware/validate');

// إنشاء طفل — ولي أمر فقط
router.post('/', requireParent, createChildRules, ctrl.createChild);

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