const mongoose = require("mongoose");

// One document per person per standup day, as received from Standuply's webhook
// (payload spec: https://github.com/standuply/standuply-webhooks).
const standupSubmissionSchema = new mongoose.Schema({
  // YYYY-MM-DD in Africa/Harare time, from the report's scheduledAt.
  date: { type: String, required: true },
  // Slack member id — stable, unlike the display name.
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  reportName: String,
  // Standuply's respondent type: 'normal', 'quick-answer', 'timed-out',
  // 'answer-later', 'skipped', 'ignored-by-status', ...
  status: { type: String, required: true },
  // Short description for anything other than a normal answer, e.g. the quick
  // reply chosen, the Slack status, or the time they'll answer later.
  note: String,
  answers: [
    {
      _id: false,
      question: String,
      answer: String,
    },
  ],
  receivedAt: { type: Date, default: Date.now },
});

// Standuply can deliver a person more than once (e.g. 'answer-later', then
// their answers). Upserting on this keeps one row holding the latest.
standupSubmissionSchema.index({ date: 1, userId: 1 }, { unique: true });

const StandupSubmission = mongoose.model("standupSubmissions", standupSubmissionSchema);

module.exports = StandupSubmission;
