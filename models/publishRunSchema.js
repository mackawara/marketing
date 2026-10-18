const mongoose = require('mongoose');

// Shared by StatusRun and ChannelRun: both are scheduled batches of slots.
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

const publishRunSchema = new mongoose.Schema({
  // One checkpoint per business date and scheduled time (PUBLISH_TIMES). A
  // legacy 09:00 run keeps its date-only key; others use date@HH:mm.
  _id: String,
  businessDate: { type: String, required: true },
  scheduledTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '09:00' },
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

module.exports = publishRunSchema;
