// SPDX-License-Identifier: GPL-3.0-or-later
const crypto = require('crypto');
const env = require('../config/env');

const sessionsByOwner = new Map();

/* ── session TTL cleanup ─────────────────────────────────────────── */
const purgeExpiredSdkSessions = () => {
  const now = Date.now();
  for (const [id, session] of sessionsByOwner) {
    if (now - session.createdAt > env.sessionMaxAgeMs) {
      sessionsByOwner.delete(id);
    }
  }
};

setInterval(purgeExpiredSdkSessions, env.sessionCleanupIntervalMs).unref();

const createOrUpdateSession = ({ ownerId, userId, relaySessionId = null, dataset: initialDataset = null }) => {
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
    diagnostics: null
  };

  const dataset = initialDataset
    ? {
        ...baseDataset,
        ...initialDataset,
        relaySessionId
      }
    : baseDataset;

  const session = {
    sessionId: crypto.randomUUID(),
    ownerId,
    userId,
    dataset,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  sessionsByOwner.set(ownerId, session);
  return session;
};

const getSessionByOwner = (ownerId) => sessionsByOwner.get(ownerId) || null;

module.exports = {
  createOrUpdateSession,
  getSessionByOwner
};
