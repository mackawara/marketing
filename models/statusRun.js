const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  slot: { type: Number, required: true },
  state: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed', 'uncertain'],
    required: true,
  },
  messageId: String,
  sentAt: Date,
  lastError: String,
}, { _id: false });

const statusRunSchema = new mongoose.Schema({
  // One checkpoint per Harare date and scheduled time. The morning run keeps
  // its legacy date-only key; later runs use date@HH:mm. Mongo's _id is unique.
  _id: String,
  businessDate: { type: String, required: true },
  scheduledTime: { type: String, enum: ['09:00', '13:00', '16:30'], default: '09:00' },
  timezone: { type: String, required: true },
  state: {
    type: String,
    enum: ['pending', 'running', 'completed', 'needs_review', 'exhausted'],
    required: true,
  },
  attempts: { type: Number, required: true },
  nextAttemptAt: Date,
  updatedAt: Date,
  lastError: String,
  slots: [slotSchema],
}, { versionKey: false });

module.exports = mongoose.model('StatusRun', statusRunSchema);
