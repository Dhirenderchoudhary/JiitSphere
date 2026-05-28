const crypto = require('crypto');
const env = require('../config/env');
const { sign } = require('../utils/token');
const { getSnapshot } = require('../services/requestAnalyticsStore');
const asyncHandler = require('../middlewares/asyncHandler');
const Material = require('../models/Material');

const SUPERADMIN_ID = process.env.SUPERADMIN_ID || '';
const SUPERADMIN_PASSWORD_HASH = (process.env.SUPERADMIN_PASSWORD_HASH || '').toLowerCase();

const timingSafeEqual = (a, b) => {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const login = asyncHandler(async (req, res) => {
  const { id, password } = req.body;

  if (!SUPERADMIN_ID || !SUPERADMIN_PASSWORD_HASH) {
    return res.status(503).json({ success: false, message: 'Service unavailable' });
  }

  if (!id || !password) {
    return res.status(400).json({ success: false, message: 'ID and password are required' });
  }

  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  const idMatch = timingSafeEqual(
    crypto.createHash('sha256').update(String(id)).digest('hex'),
    crypto.createHash('sha256').update(SUPERADMIN_ID).digest('hex')
  );
  const pwMatch = timingSafeEqual(inputHash, SUPERADMIN_PASSWORD_HASH);

  if (!idMatch || !pwMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = sign(
    {
      role: 'superadmin',
      iat: Math.floor(Date.now() / 1000),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    },
    env.authSecret
  );

  return res.json({ success: true, token });
});

const getAnalytics = asyncHandler(async (_req, res) => {
  const snapshot = getSnapshot();

  const [totalMaterials, materialsByDegree, materialsByType] = await Promise.all([
    Material.countDocuments(),
    Material.aggregate([{ $group: { _id: '$degree', count: { $sum: 1 } } }]),
    Material.aggregate([{ $group: { _id: '$resourceType', count: { $sum: 1 } } }]),
  ]);

  return res.json({
    success: true,
    data: {
      ...snapshot,
      materials: {
        total: totalMaterials,
        byDegree: materialsByDegree.map((d) => ({ name: d._id, count: d.count })),
        byType: materialsByType.map((t) => ({ name: t._id, count: t.count })),
      },
    },
  });
});

module.exports = { login, getAnalytics };
