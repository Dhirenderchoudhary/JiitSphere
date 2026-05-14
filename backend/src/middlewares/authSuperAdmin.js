
const env = require('../config/env');
const { verify } = require('../utils/token');

const authSuperAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const payload = verify(token, env.authSecret);
  if (!payload || payload.role !== 'superadmin') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  req.superadmin = true;
  next();
};

module.exports = authSuperAdmin;
