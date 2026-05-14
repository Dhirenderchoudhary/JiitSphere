
const crypto = require('crypto');
const env = require('../config/env');

const timingSafeEqual = (a, b) => {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const authAdmin = (req, res, next) => {
  const token = req.headers['x-admin-key'];
  const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase();

  if (!token || !env.adminApiKey || !timingSafeEqual(token, env.adminApiKey)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access' });
  }

  if (!email || !env.adminAllowedEmails.includes(email)) {
    return res.status(403).json({ success: false, message: 'Admin email is not authorized' });
  }

  req.adminEmail = email;

  next();
};

module.exports = authAdmin;
