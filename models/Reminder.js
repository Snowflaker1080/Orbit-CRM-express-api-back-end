const { Schema, model, Types } = require('mongoose');

const reminderSchema = new Schema({
  owner: { type: Types.ObjectId, ref: 'User', required: true },
  contact: { type: Types.ObjectId, ref: 'Contact' },
  frequency: { type: String, enum: ['weekly','monthly','quarterly','yearly','custom'], required: true },
  nextAt: { type: Date, required: true },
  note: String,
}, { timestamps: true });

module.exports = model('Reminder', reminderSchema);