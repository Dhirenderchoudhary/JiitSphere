// SPDX-License-Identifier: GPL-3.0-or-later
const express = require('express');
const authSuperAdmin = require('../middlewares/authSuperAdmin');
const { login, getAnalytics } = require('../controllers/superadminController');

const router = express.Router();

router.post('/login', login);
router.get('/analytics', authSuperAdmin, getAnalytics);

module.exports = router;
