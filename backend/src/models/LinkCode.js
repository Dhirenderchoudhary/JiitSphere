const mongoose = require('mongoose');

// A single-use code that signs a phone in to the same portal session as the
// computer that created it. Only the code's hash is stored.
const linkCodeSchema = new mongoose.Schema(
  {
    _id: { type: String },
    ownerId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false }
);

module.exports = mongoose.model('LinkCode', linkCodeSchema);
