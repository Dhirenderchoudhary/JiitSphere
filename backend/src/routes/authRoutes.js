const express = require('express');
const {
  login,
  demoLogin,
  googlePortalConfig,
  googlePortalLogin,
  me,
  analytics,
} = require('../controllers/authController');
const authUser = require('../middlewares/authUser');
const { authLimiter } = require('../middlewares/rateLimiters');

const router = express.Router();

router.post('/login', authLimiter, login);
router.post('/demo-login', authLimiter, demoLogin);
router.get('/google-portal/config', googlePortalConfig);
router.post('/google-portal', authLimiter, googlePortalLogin);
router.get('/me', authUser, me);
router.get('/analytics', authUser, analytics);

module.exports = router;
