const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const PortalSession = require('../models/PortalSession');

// The payload holds the student's portal token, so it is encrypted at rest with a
// key derived from AUTH_SECRET.
const key = () => crypto.createHash('sha256').update(`${env.authSecret}:portal-session`).digest();

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
};

const decrypt = (payload) => {
  const [iv, tag, data] = String(payload)
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
};

const dbReady = () => mongoose.connection.readyState === 1;

// Saving is best effort: without a database the session still works until the
// next restart, as it did before.
const savePortalSession = async (ownerId, relaySessionId, authContext) => {
  if (!dbReady()) return;
  try {
    await PortalSession.findByIdAndUpdate(
      ownerId,
      {
        relaySessionId,
        payload: encrypt(authContext),
        expiresAt: new Date(Date.now() + env.portalTokenMaxAgeMs),
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Could not save portal session:', err.message);
  }
};

const loadPortalSession = async (ownerId) => {
  if (!dbReady()) return null;
  try {
    const record = await PortalSession.findById(ownerId).lean();
    if (!record || record.expiresAt < new Date()) return null;
    return { relaySessionId: record.relaySessionId, authContext: decrypt(record.payload) };
  } catch (err) {
    console.error('Could not load portal session:', err.message);
    return null;
  }
};

const deletePortalSession = async (ownerId) => {
  if (!dbReady()) return;
  try {
    await PortalSession.deleteOne({ _id: ownerId });
  } catch (err) {
    console.error('Could not delete portal session:', err.message);
  }
};

module.exports = { savePortalSession, loadPortalSession, deletePortalSession };
