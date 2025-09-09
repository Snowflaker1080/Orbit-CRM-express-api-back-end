const { Schema, model, Types } = require('mongoose');

const inviteSchema = new Schema({
  owner: { type: Types.ObjectId, ref: 'User', required: true },
  contactEmail: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
}, { timestamps: true });

module.exports = model('Invite', inviteSchema);