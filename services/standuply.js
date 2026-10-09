const { client } = require('../config/wwebjsConfig');
const config = require('../config');
const StandupSubmission = require('../models/standupSubmissions');
const { getStaff, sendToStaff } = require('./staff');

const TIMEZONE = 'Africa/Harare';

// Payload spec: https://github.com/standuply/standuply-webhooks
// Each respondent's value.type says what they did, and only some of those are
// a standup. The rest decide whether they get nudged.
const SUBMITTED = new Set(['normal', 'quick-answer', 'video-answer', 'voice-answer']);
const EXCUSED = new Set(['ignored-by-status', 'skipped', 'answer-next-time', 'taking-part-in-another-report']);
// 'answer-later': they picked a time and Standuply will ask them again then.
// 'timed-out': the report closed without an answer — that one is missing.

const EXCUSED_LABELS = {
  skipped: 'skipped',
  'answer-next-time': 'answering next time',
  'taking-part-in-another-report': 'in another report',
};

// en-CA formats as YYYY-MM-DD. The server runs in UTC, so the day has to be
// asked for in business time or anything before 02:00 lands on the wrong day.
const standupDate = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

const normalise = (value) => (value || '').trim().toLowerCase();
const asText = (value) => (typeof value === 'string' ? value : JSON.stringify(value ?? ''));

// The spec says application/json. Standuply's own Sheets example also unwraps
// JSON that arrives encoded more than once, so this does too.
const parsePayload = (body) => {
  let payload = body;
  while (typeof payload === 'string') {
    payload = JSON.parse(payload);
  }
  return payload;
};

const noteFor = (status, data) => {
  switch (status) {
    case 'quick-answer':
    case 'video-answer':
    case 'voice-answer':
      return data?.answer;
    case 'answer-later':
      return data?.time ? `at ${data.time}` : 'later';
    case 'ignored-by-status':
      return data?.status ? `status: ${data.status}` : 'away';
    default:
      return EXCUSED_LABELS[status];
  }
};

const recordStandupWebhook = async (body) => {
  const payload = parsePayload(body);
  // An array when Standuply sends everything at once at report close
  // (isAsyncResults false); one result per call when it sends as people answer.
  const results = Array.isArray(payload?.result) ? payload.result : [payload?.result];
  // The report's scheduled time, so a late "Add answers" counts for its own day.
  const date = standupDate(payload?.scheduledAt ? new Date(payload.scheduledAt * 1000) : new Date());
  let saved = 0;

  for (const result of results) {
    const value = result?.value;

    // 'data-request' and 'survey-summary' results carry no respondent.
    if (result?.type !== 'user-answers' || !value?.userName) {
      console.log(`[standuply] Ignoring webhook result of type "${result?.type}".`);
      continue;
    }

    const status = value.type || 'normal';
    const answers = Array.isArray(value.data)
      ? value.data.map((item) => ({ question: asText(item.question), answer: asText(item.answer) }))
      : [];

    await StandupSubmission.updateOne(
      { date, userId: value.userId || value.userName },
      {
        $set: {
          userName: value.userName,
          reportName: payload.reportName,
          status,
          note: noteFor(status, value.data),
          answers,
          receivedAt: new Date(),
        },
      },
      { upsert: true },
    );
    saved++;
    console.log(
      `[standuply] ${payload.reportName || 'report'} ${date}: "${value.userName}" (${value.userId}) ${status}, ` +
        `${answers.length} answers [async=${payload.isAsyncResults} finished=${payload.isReportFinished}]`,
    );
  }

  if (saved === 0) {
    console.warn(`[standuply] Webhook had no user answers. Body: ${JSON.stringify(payload).slice(0, 2000)}`);
  }

  return saved;
};

const classify = (response) => {
  if (!response) return 'missing';
  if (SUBMITTED.has(response.status)) return 'submitted';
  if (EXCUSED.has(response.status)) return 'excused';
  if (response.status === 'answer-later') return 'later';
  return 'missing'; // timed-out, or a type Standuply has added since
};

const getTodaysStandup = async () => {
  const responses = await StandupSubmission.find({ date: standupDate() }).lean();

  // Only named staff can be matched. The name may be either the person's
  // Standuply name or their Slack member id.
  const staff = getStaff().filter((member) => member.name);
  const responseFor = (member) =>
    responses.find((r) => normalise(r.userName) === normalise(member.name) || normalise(r.userId) === normalise(member.name));

  const roster = { submitted: [], excused: [], later: [], missing: [] };
  const matched = new Set();
  for (const member of staff) {
    const response = responseFor(member);
    if (response) matched.add(response);
    roster[classify(response)].push({ member, response });
  }

  return {
    responses,
    staff,
    ...roster,
    unmatched: responses.filter((r) => !matched.has(r)),
  };
};

const SLACK_ID = /^[UW][A-Z0-9]{6,}$/i;
const greetingName = (name) => (SLACK_ID.test(name) ? '' : ` ${name.trim().split(/\s+/)[0]}`);

const nudgeMissingStandups = async () => {
  const { responses, staff, missing } = await getTodaysStandup();

  if (staff.length === 0) {
    console.warn('[standuply] No named staff in STAFF_NUMBERS — cannot tell who is missing.');
    return;
  }

  // Nothing received at all is far more likely a broken webhook (or Standuply
  // holding results until the report closes) than the whole team skipping.
  // Nudging everyone daily for our fault would train staff to ignore the bot.
  if (responses.length === 0) {
    await client.sendMessage(
      config.ME,
      '⚠️ Nothing received from Standuply yet today, so no standup nudges were sent. Either nobody has answered, the webhook is not reaching the bot, or the report only sends results when it closes.',
    );
    return;
  }

  return sendToStaff(
    missing.map(({ member }) => member),
    (member) => `Hi${greetingName(member.name)}, we haven't received your standup yet. Please submit it in Slack.`,
    'standup nudge',
  );
};

const NO_BLOCKER = /^(no|none|nothing|nope|nil|n\/?a|-)?[.!]?$/i;

const sendStandupSummary = async () => {
  const { responses, staff, submitted, excused, later, missing, unmatched } = await getTodaysStandup();

  // Not set up yet — nothing worth a daily message.
  if (staff.length === 0 && responses.length === 0) {
    console.log('[standuply] No named staff and no responses — skipping summary.');
    return;
  }

  const day = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TIMEZONE,
  });
  const withNotes = (entries) =>
    entries.map(({ member, response }) => (response?.note ? `${member.name} (${response.note})` : member.name)).join(', ');

  const lines = [`📋 *Standup — ${day}*`];
  if (staff.length > 0) {
    lines.push(`Submitted: ${submitted.length}/${staff.length}`);
  }
  if (missing.length > 0) lines.push(`Missing: ${missing.map(({ member }) => member.name).join(', ')}`);
  if (later.length > 0) lines.push(`Answering later: ${withNotes(later)}`);
  if (excused.length > 0) lines.push(`Excused: ${withNotes(excused)}`);
  // Usually a STAFF_NUMBERS name that doesn't match Standuply's spelling; the
  // Slack id works in its place.
  if (unmatched.length > 0) {
    lines.push(`Not in STAFF_NUMBERS: ${unmatched.map((r) => `${r.userName} (${r.userId})`).join(', ')}`);
  }

  const blockers = responses.flatMap((r) =>
    r.answers
      .filter((a) => /block/i.test(a.question) && !NO_BLOCKER.test(a.answer.trim()))
      .map((a) => `• ${r.userName}: ${a.answer}`),
  );
  if (blockers.length > 0) {
    lines.push('', '🚧 *Blockers*', ...blockers);
  }

  await client.sendMessage(config.ME, lines.join('\n'));
};

module.exports = { recordStandupWebhook, nudgeMissingStandups, sendStandupSummary };
