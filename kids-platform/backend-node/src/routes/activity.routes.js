// src/routes/activity.routes.js

const router = require('express').Router();
const ctrl   = require('../controllers/activity.controller');
const { requireChild, authenticate } = require('../middleware/auth');
const { activityRules } = require('../middleware/validate');

router.post('/complete',     requireChild, activityRules, ctrl.completeActivity);
router.post('/save-drawing', requireChild, ctrl.saveDrawing);
router.get('/leaderboard',   authenticate, ctrl.getLeaderboard);

module.exports = router;
