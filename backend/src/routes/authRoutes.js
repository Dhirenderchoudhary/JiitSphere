const express = require('express');
const { login, me, analytics } = require('../controllers/authController');
const authUser = require('../middlewares/authUser');
const { authLimiter } = require('../middlewares/rateLimiters');

const router = express.Router();

router.post('/login', authLimiter, login);
router.get('/me', authUser, me);
router.get('/analytics', authUser, analytics);

module.exports = router;
