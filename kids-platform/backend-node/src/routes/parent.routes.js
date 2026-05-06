// src/routes/parent.routes.js

const router = require('express').Router();
const ctrl   = require('../controllers/parent.controller');
const { requireParent } = require('../middleware/auth');

router.use(requireParent); // جميع المسارات تتطلب JWT ولي أمر

router.get('/me',              ctrl.getMe);
router.put('/me',              ctrl.updateMe);
router.get('/me/children',     ctrl.getMyChildren);
router.get('/me/stats',        ctrl.getMyStats);

module.exports = router;
