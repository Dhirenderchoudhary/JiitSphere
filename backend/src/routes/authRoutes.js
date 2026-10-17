const express = require('express');
const {
  login,
  demoLogin,
  portalGoogleLogin,
  createLinkCode,
  redeemLinkCode,
  me,
  analytics,
} = require('../controllers/authController');
const authUser = require('../middlewares/authUser');
const { authLimiter } = require('../middlewares/rateLimiters');

const router = express.Router();

router.post('/login', authLimiter, login);
router.post('/demo-login', authLimiter, demoLogin);
router.post('/portal-google', authLimiter, portalGoogleLogin);
router.post('/link-code', authUser, authLimiter, createLinkCode);
router.post('/link-code/redeem', authLimiter, redeemLinkCode);
router.get('/me', authUser, me);
router.get('/analytics', authUser, analytics);

module.exports = router;
