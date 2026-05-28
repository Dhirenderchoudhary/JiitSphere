const crypto = require('crypto');
const env = require('../config/env');

const sessionsByOwner = new Map();
const MAX_SDK_SESSIONS = Math.max(100, Number(process.env.MAX_SDK_SESSIONS || 10000));

const lastActiveAt = (session) => Number(session?.updatedAt || session?.createdAt || 0);

const evictOldestSdkSession = () => {
  let oldestKey = null;
  let oldestTs = Number.MAX_SAFE_INTEGER;

  for (const [key, value] of sessionsByOwner.entries()) {
    const ts = lastActiveAt(value);
    if (ts < oldestTs) {
      oldestTs = ts;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    sessionsByOwner.delete(oldestKey);
  }
};

/* ── session TTL cleanup ─────────────────────────────────────────── */
const purgeExpiredSdkSessions = () => {
  const now = Date.now();
  for (const [id, session] of sessionsByOwner) {
    if (now - lastActiveAt(session) > env.sessionMaxAgeMs) {
      sessionsByOwner.delete(id);
    }
  }
};

setInterval(purgeExpiredSdkSessions, env.sessionCleanupIntervalMs).unref();

const createOrUpdateSession = ({
  ownerId,
  userId,
  relaySessionId = null,
  dataset: initialDataset = null,
}) => {
  if (!sessionsByOwner.has(ownerId) && sessionsByOwner.size >= MAX_SDK_SESSIONS) {
    evictOldestSdkSession();
  }

  const baseDataset = {
    mode: 'direct-relay',
    relaySessionId,
    realData: false,
    semesters: [],
    attendanceData: {},
    subjectDailyData: {},
    grades: [],
    gradeCards: {},
    exams: [],
    profile: null,
    subjects: {},
    diagnostics: null,
  };

  const dataset = initialDataset
    ? {
        ...baseDataset,
        ...initialDataset,
        relaySessionId,
      }
    : baseDataset;

  const session = {
    sessionId: crypto.randomUUID(),
    ownerId,
    userId,
    dataset,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  sessionsByOwner.set(ownerId, session);
  return session;
};

const getSessionByOwner = (ownerId) => {
  const session = sessionsByOwner.get(ownerId) || null;
  if (session) {
    session.updatedAt = Date.now();
  }
  return session;
};

module.exports = {
  createOrUpdateSession,
  getSessionByOwner,
};
