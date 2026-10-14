const express = require('express');
const {
  login,
  demoLogin,
  portalGoogleLogin,
  me,
  analytics,
} = require('../controllers/authController');
const authUser = require('../middlewares/authUser');
const { authLimiter } = require('../middlewares/rateLimiters');

const router = express.Router();

router.post('/login', authLimiter, login);
router.post('/demo-login', authLimiter, demoLogin);
router.post('/portal-google', authLimiter, portalGoogleLogin);
router.get('/me', authUser, me);
router.get('/analytics', authUser, analytics);

module.exports = router;
