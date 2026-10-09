const { getStaff, sendToStaff } = require('./staff');
const { nudgeMissingStandups, sendStandupSummary } = require('./standuply');

// Every recurring staff job. Schedules are node-cron expressions in
// Africa/Harare time (index.js passes CRON_TZ). Adding a reminder is adding an
// entry here: index.js schedules each one, and "remind <name>" from the admin
// number runs it immediately.
const STAFF_REMINDERS = [
  {
    name: 'standup',
    schedule: '0 8 * * 1-5', // 08:00 Mon–Fri, to all staff
    run: () => sendToStaff(getStaff(), 'Good morning, please submit your Slack standup.', 'standup reminder'),
  },
  {
    name: 'standup-nudge',
    schedule: '30 9 * * 1-5', // only staff Standuply hasn't sent us answers for
    run: nudgeMissingStandups,
  },
  {
    name: 'standup-summary',
    schedule: '0 10 * * 1-5', // who's in, who's missing, blockers — to the admin
    run: sendStandupSummary,
  },
];

module.exports = { STAFF_REMINDERS };
