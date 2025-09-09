// models/Group.js
const { Schema, model, Types } = require('mongoose');
const mongoose = require("mongoose");

const groupSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: [ 'acquaintances', 'club', 'cohort', 'colleagues','friends','family','business', 'network', 'team', 'volunteers', 'other'], default: 'other' },
  owner: { type: Types.ObjectId, ref: 'User', required: true },
  description: { type: String, default: '' },
  members: [{ type: Types.ObjectId, ref: 'Contact' }],
}, { timestamps: true });

module.exports = model('Group', groupSchema);


