const config = require('../config');

const TIMEZONE = config.PUBLISH_TIMEZONE;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormatters = new Map();

function dateFormatter(timezone) {
  if (!dateFormatters.has(timezone)) {
    dateFormatters.set(timezone, new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }));
  }
  return dateFormatters.get(timezone);
}

function businessClock(date, timezone = TIMEZONE) {
  const parts = Object.fromEntries(dateFormatter(timezone).formatToParts(date)
    .map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function createMongoStatusRunStore(StatusRun) {
  return {
    get: (id) => StatusRun.findById(id).lean().exec(),
    findUnfinishedBefore: (date) => StatusRun.find({
      businessDate: { $lt: date },
      'slots.state': 'sending',
    }).lean().exec(),
    save: (run) => StatusRun.replaceOne({ _id: run._id }, run, {
      upsert: true,
      runValidators: true,
    }).exec(),
  };
}

const errorText = (error) => String(error?.message || error).slice(0, 1000);
const isRetryable = (slot) => slot.state === 'pending' || slot.state === 'failed';

// "06:00" -> { time: '06:00', minutes: 360 }, in chronological order.
function buildSchedule(times) {
  return times.map((time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return { time, minutes: hours * 60 + minutes };
  }).sort((a, b) => a.minutes - b.minutes);
}

// Days since the epoch for a YYYY-MM-DD business date.
function epochDay(businessDate) {
  const [year, month, day] = businessDate.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/**
 * Run daily batches at the configured times, with same-day catch-up.
 * Assumes the existing single PM2 instance: inFlight prevents overlapping ticks.
 * WhatsApp has no idempotency key here. Persist BEFORE sending and quarantine
 * ambiguous sends after a crash/error, instead of risking duplicate posts.
 *
 * Used for both WhatsApp Status batches and Channel posts: `publish` receives
 * the slot callbacks plus `rotationBase`, a number that increases by `slotCount`
 * at every scheduled run so slot N of any run maps to one fixed rotation index.
 * `legacyKeyTime` is the one time whose run keeps the old date-only record id.
 */
function createStatusScheduler({ store, postStatus, publish = postStatus,
  isReady = () => true, now = () => new Date(), logger = console,
  schedule: times = config.PUBLISH_TIMES, timezone = TIMEZONE,
  slotCount = config.STATUS_IMAGES_PER_BATCH, label = 'status',
  legacyKeyTime = '09:00' }) {
  let inFlight = false;
  const SCHEDULE = buildSchedule(times);
  const STATUS_COUNT = slotCount;
  const tag = `[${label}-scheduler]`;

  function quarantineSending(run) {
    let changed = false;
    for (const slot of run.slots) {
      if (slot.state !== 'sending') continue;
      slot.state = 'uncertain';
      slot.lastError = 'Send started but its publish result was not saved. Check WhatsApp manually; automatic retry suppressed.';
      logger.error(`${tag} ${run.businessDate} ${run.scheduledTime || legacyKeyTime} slot ${slot.slot + 1}: ${slot.lastError}`);
      changed = true;
    }
    return changed;
  }

  async function recoverPreviousRuns(date) {
    const unfinished = await store.findUnfinishedBefore(date);
    for (const run of unfinished) {
      if (!quarantineSending(run)) continue;
      // Recovery only records an ambiguous outcome; it never republishes an
      // old batch. Run this even before 09:00 or while WhatsApp is disconnected.
      run.state = 'needs_review';
      run.nextAttemptAt = null;
      run.updatedAt = now();
      await store.save(run);
    }
  }

  async function runBatch(clock, schedule, startedAt) {
    // Preserve the original morning key so existing 09:00 records are reused.
    const runId = schedule.time === legacyKeyTime ? clock.date : `${clock.date}@${schedule.time}`;
    const rotationBase = (epochDay(clock.date) * SCHEDULE.length + SCHEDULE.indexOf(schedule)) * STATUS_COUNT;
    const run = await store.get(runId) || {
      _id: runId,
      businessDate: clock.date,
      scheduledTime: schedule.time,
      timezone,
      state: 'pending',
      attempts: 0,
      slots: Array.from({ length: STATUS_COUNT }, (_, slot) => ({ slot, state: 'pending' })),
    };
    const save = async () => {
      run.updatedAt = now();
      await store.save(run);
    };
    const finish = async () => {
      quarantineSending(run);
      const remaining = run.slots.some(isRetryable);
      if (remaining && run.attempts < MAX_ATTEMPTS) {
        run.state = 'pending';
        run.nextAttemptAt = new Date(now().getTime() + RETRY_DELAY_MS);
      } else {
        run.nextAttemptAt = null;
        run.state = run.slots.some((slot) => slot.state === 'uncertain') ? 'needs_review'
          : remaining ? 'exhausted' : 'completed';
      }
      await save();
      const sent = run.slots.filter((slot) => slot.state === 'sent').length;
      const uncertain = run.slots.filter((slot) => slot.state === 'uncertain').length;
      logger.info(`${tag} ${run.businessDate} ${schedule.time}: ${run.state}, ${sent}/${STATUS_COUNT} recorded, ${uncertain} uncertain, attempt ${run.attempts}/${MAX_ATTEMPTS}.`);
      return { state: run.state, sent, uncertain };
    };

    // A previous process may have died between WhatsApp sending and saving.
    if (quarantineSending(run)) await save();
    if (['completed', 'needs_review', 'exhausted'].includes(run.state)) {
      return { state: run.state };
    }
    if (!run.slots.some(isRetryable) || run.attempts >= MAX_ATTEMPTS) return await finish();
    if (run.nextAttemptAt && new Date(run.nextAttemptAt) > startedAt) return { state: 'backoff' };

    run.state = 'running';
    // Reserving a run must not consume an attempt if storage prevents all work.
    // Charge the first sending/media-failure checkpoint in the same write.
    run.nextAttemptAt = new Date(startedAt.getTime() + RETRY_DELAY_MS);
    await save();

    let attemptCharged = false;
    let storageBlocked = false;
    const saveProgress = async () => {
      if (!attemptCharged) run.attempts += 1;
      try {
        await save();
      } catch (error) {
        if (!attemptCharged) run.attempts -= 1;
        storageBlocked = true;
        throw error;
      }
      attemptCharged = true;
    };

    const getSlot = (index) => {
      const slot = run.slots.find((entry) => entry.slot === index);
      if (!slot) throw new Error(`Invalid status slot: ${index}`);
      return slot;
    };
    try {
      await publish({
        rotationBase,
        selectedFiles: Object.fromEntries(run.slots.filter((slot) => slot.fileId)
          .map((slot) => [slot.slot, { id: slot.fileId, filename: slot.filename }])),
        // Kept in memory, then persisted by the first sending/failure checkpoint.
        onSlotSelected: async (index, file) => {
          const slot = getSlot(index);
          slot.fileId = file.id;
          slot.filename = file.filename;
        },
        skipSlots: run.slots.filter((slot) => !isRetryable(slot)).map((slot) => slot.slot),
        onSlotSending: async (index) => {
          const slot = getSlot(index);
          if (!isRetryable(slot)) throw new Error(`Status slot ${index} must not be resent`);
          if (businessClock(now(), timezone).date !== run.businessDate) {
            throw new Error('Daily status batch crossed midnight; stop the previous day\'s posts');
          }
          const previousState = slot.state;
          const previousError = slot.lastError;
          slot.state = 'sending';
          slot.lastError = undefined;
          try {
            await saveProgress();
          } catch (error) {
            // postStatus awaits this callback before invoking WhatsApp, so
            // this process knows no send occurred. If storage recovers,
            // finish() can persist the safe retry even if the write timed out.
            slot.state = previousState;
            slot.lastError = previousError;
            throw error;
          }
        },
        onSlotSent: async (index, messageId) => {
          const slot = getSlot(index);
          if (slot.state !== 'sending' || !messageId) {
            throw new Error(`Status slot ${index} requires a sending checkpoint and returned message id`);
          }
          slot.state = 'sent';
          slot.messageId = messageId;
          slot.sentAt = now();
          await save();
        },
        onSlotFailed: async (index, error) => {
          const slot = getSlot(index);
          if (!isRetryable(slot)) throw new Error(`Status slot ${index} cannot safely be retried`);
          slot.state = 'failed';
          slot.lastError = errorText(error);
          await saveProgress();
        },
      });
      run.lastError = undefined;
    } catch (error) {
      run.lastError = errorText(error);
      logger.error(`${tag} ${run.businessDate} ${schedule.time} batch interrupted: ${run.lastError}`);
    }
    // Unexpected publisher failures before any slot callback still use the
    // retry budget. Storage-only failures remain eligible after recovery.
    if (!attemptCharged && !storageBlocked) run.attempts += 1;
    return await finish();
  }

  async function check() {
    if (inFlight) return { state: 'busy' };
    inFlight = true;
    try {
      const clock = businessClock(now(), timezone);
      await recoverPreviousRuns(clock.date);
      const due = SCHEDULE.filter((schedule) => clock.minutes >= schedule.minutes);
      if (!due.length) return { state: 'not_due' };
      let result;
      for (const schedule of due) {
        const startedAt = now();
        // A slow recovery batch must not backfill yesterday after midnight.
        if (businessClock(startedAt, timezone).date !== clock.date) break;
        if (!await isReady()) return { state: 'not_ready' };
        result = await runBatch(clock, schedule, startedAt);
      }
      return result || { state: 'not_due' };
    } catch (error) {
      // A database outage must prevent sends, never bypass the checkpoint.
      logger.error(`${tag} Scheduled check failed:`, errorText(error));
      return { state: 'error' };
    } finally {
      inFlight = false;
    }
  }

  return { check };
}

module.exports = { createStatusScheduler, createMongoStatusRunStore, businessClock, buildSchedule, TIMEZONE };
