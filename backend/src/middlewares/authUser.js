
const env = require('../config/env');
const { verify } = require('../utils/token');

const authUser = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const payload = verify(token, env.authSecret);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Unauthorized user access' });
  }

  req.user = payload;
  return next();
};

module.exports = authUser;
