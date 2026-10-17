const mongoose = require('mongoose');

// One record per student: the portal sign-in a JiitSphere session runs on, so it
// survives a backend restart. `payload` is encrypted; see portalSessionStore.
const portalSessionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    relaySessionId: { type: String, required: true },
    payload: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('PortalSession', portalSessionSchema);
