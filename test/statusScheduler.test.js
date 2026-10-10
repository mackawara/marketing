const test = require('node:test');
const assert = require('node:assert/strict');
const { createStatusScheduler, businessClock } = require('../services/statusScheduler');

function fixture(start = '2026-10-09T07:00:00Z') {
  let current = new Date(start);
  const rows = new Map();
  const messages = [];
  return {
    rows,
    messages,
    now: () => new Date(current),
    setTime: (value) => { current = new Date(value); },
    logger: {
      info: (message) => messages.push(message),
      error: (...parts) => messages.push(parts.join(' ')),
    },
    store: {
      get: async (key) => structuredClone(rows.get(key)),
      findUnfinishedBefore: async (date) => structuredClone([...rows.values()].filter((row) =>
        row.businessDate < date && row.slots.some((slot) => slot.state === 'sending'))),
      save: async (row) => { rows.set(row._id, structuredClone(row)); },
    },
  };
}

async function sendAvailable({ skipSlots, onSlotSending, onSlotSent }, sent) {
  for (let slot = 0; slot < 5; slot += 1) {
    if (skipSlots.includes(slot)) continue;
    await onSlotSending(slot);
    sent.push(slot);
    await onSlotSent(slot, `message-${slot}`);
  }
}

test('09:00, 13:00 and 16:30 Harare batches wait until their scheduled minute', async () => {
  const f = fixture('2026-10-09T06:59:59Z');
  const sent = [];
  const scheduler = createStatusScheduler({ ...f, postStatus: (options) => sendAvailable(options, sent) });
  assert.deepEqual(businessClock(f.now()), { date: '2026-10-09', minutes: 539 });
  assert.equal((await scheduler.check()).state, 'not_due');
  assert.equal(f.rows.size, 0);
  f.setTime('2026-10-09T07:00:00Z');
  assert.equal((await scheduler.check()).state, 'completed');
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(sent.length, 5);
  assert.equal(f.rows.get('2026-10-09').scheduledTime, '09:00');

  f.setTime('2026-10-09T10:59:59Z');
  await scheduler.check();
  assert.equal(sent.length, 5);
  f.setTime('2026-10-09T11:00:00Z');
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(sent.length, 10);
  assert.equal(f.rows.get('2026-10-09@13:00').scheduledTime, '13:00');

  f.setTime('2026-10-09T14:29:59Z');
  await scheduler.check();
  assert.equal(sent.length, 10);
  f.setTime('2026-10-09T14:30:00Z');
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(sent.length, 15);
  assert.equal(f.rows.get('2026-10-09@16:30').scheduledTime, '16:30');
  await scheduler.check();
  assert.equal(sent.length, 15);
});

test('startup catches up today; restart never reposts completed slots or backfills old days', async () => {
  const f = fixture('2026-10-09T20:00:00Z');
  const sent = [];
  const options = { ...f, postStatus: (callbacks) => sendAvailable(callbacks, sent) };
  await createStatusScheduler(options).check();
  assert.equal((await createStatusScheduler(options).check()).state, 'completed');
  assert.equal(sent.length, 15);

  // 22:00 UTC is already the next Harare date, but its 09:00 is not due.
  f.setTime('2026-10-09T22:00:00Z');
  assert.equal(businessClock(f.now()).date, '2026-10-10');
  assert.equal((await createStatusScheduler(options).check()).state, 'not_due');
  f.setTime('2026-10-11T07:00:00Z');
  await createStatusScheduler(options).check();
  assert.equal(sent.length, 20);
  assert.deepEqual([...f.rows.keys()], [
    '2026-10-09', '2026-10-09@13:00', '2026-10-09@16:30', '2026-10-11',
  ]);
});

test('an existing morning checkpoint suppresses its batch while later batches still run', async () => {
  const f = fixture('2026-10-09T14:30:00Z');
  f.rows.set('2026-10-09', {
    _id: '2026-10-09', businessDate: '2026-10-09', timezone: 'Africa/Harare',
    state: 'completed', attempts: 1,
    slots: Array.from({ length: 5 }, (_, slot) => ({ slot, state: 'sent', messageId: `old-${slot}` })),
  });
  const sent = [];
  const options = { ...f, postStatus: (callbacks) => sendAvailable(callbacks, sent) };
  assert.equal((await createStatusScheduler(options).check()).state, 'completed');
  assert.equal(sent.length, 10);
  assert.equal(f.rows.get('2026-10-09').attempts, 1);
  assert.equal(f.rows.get('2026-10-09@13:00').state, 'completed');
  assert.equal(f.rows.get('2026-10-09@16:30').state, 'completed');
  await createStatusScheduler(options).check();
  assert.equal(sent.length, 10);
});

test('all due batches run sequentially and share the scheduler overlap guard', async () => {
  const f = fixture('2026-10-09T14:30:00Z');
  let release;
  let announceStarted;
  const blocked = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { announceStarted = resolve; });
  const sent = [];
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    announceStarted();
    await blocked;
    await sendAvailable(options, sent);
    active -= 1;
  } });
  const first = scheduler.check();
  await started;
  assert.equal((await scheduler.check()).state, 'busy');
  release();
  assert.equal((await first).state, 'completed');
  assert.deepEqual(sent, [...Array(3)].flatMap(() => [0, 1, 2, 3, 4]));
  assert.equal(calls, 3);
  assert.equal(maxActive, 1);
});

test('partial preparation failures retry after five minutes and skip recorded slots after restart', async () => {
  const f = fixture();
  const sent = [];
  await createStatusScheduler({ ...f, postStatus: async (callbacks) => {
    for (let slot = 0; slot < 5; slot += 1) {
      if (slot === 2) {
        await callbacks.onSlotFailed(slot, new Error('Drive download failed'));
      } else {
        await callbacks.onSlotSending(slot);
        sent.push(slot);
        await callbacks.onSlotSent(slot, `first-${slot}`);
      }
    }
  } }).check();
  assert.equal(f.rows.get('2026-10-09').state, 'pending');
  let retryCalls = 0;
  const restarted = createStatusScheduler({ ...f, postStatus: async (callbacks) => {
    retryCalls += 1;
    assert.deepEqual(callbacks.skipSlots, [0, 1, 3, 4]);
    await sendAvailable(callbacks, sent);
  } });
  f.setTime('2026-10-09T07:04:59Z');
  assert.equal((await restarted.check()).state, 'backoff');
  assert.equal(retryCalls, 0);
  f.setTime('2026-10-09T07:05:00Z');
  assert.equal((await restarted.check()).state, 'completed');
  assert.deepEqual(sent, [0, 1, 3, 4, 2]);
  assert.equal(f.rows.get('2026-10-09').attempts, 2);
});

test('crash recovery quarantines sending slots and preserves sent slots', async () => {
  const f = fixture('2026-10-09T07:10:00Z');
  f.rows.set('2026-10-09', {
    _id: '2026-10-09', businessDate: '2026-10-09', timezone: 'Africa/Harare',
    state: 'running', attempts: 1, nextAttemptAt: new Date('2026-10-09T07:05:00Z'),
    slots: [
      { slot: 0, state: 'sent', messageId: 'already-sent' },
      { slot: 1, state: 'sending' },
      ...[2, 3, 4].map((slot) => ({ slot, state: 'pending' })),
    ],
  });
  const sent = [];
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    assert.deepEqual(options.skipSlots, [0, 1]);
    await sendAvailable(options, sent);
  } });
  assert.deepEqual(await scheduler.check(), { state: 'needs_review', sent: 4, uncertain: 1 });
  assert.deepEqual(sent, [2, 3, 4]);
  assert.equal(f.rows.get('2026-10-09').slots[1].state, 'uncertain');
  assert.ok(f.messages.some((message) => message.includes('Check WhatsApp manually')));
  assert.equal((await scheduler.check()).state, 'needs_review');
  assert.equal(sent.length, 3);
});

test('ambiguous live send failures do not become successful or retryable', async () => {
  const f = fixture();
  const sent = [];
  await createStatusScheduler({ ...f, postStatus: async (options) => {
    await options.onSlotSending(0);
    throw new Error('Connection lost while waiting for publish result');
  } }).check();
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'uncertain');
  f.setTime('2026-10-09T07:05:00Z');
  const result = await createStatusScheduler({ ...f, postStatus: async (options) => {
    assert.deepEqual(options.skipSlots, [0]);
    await sendAvailable(options, sent);
  } }).check();
  assert.equal(result.state, 'needs_review');
  assert.deepEqual(sent, [1, 2, 3, 4]);
});

test('uncertain sends keep their review state when safe-slot retries reach the attempt limit', async () => {
  const f = fixture();
  f.rows.set('2026-10-09', {
    _id: '2026-10-09', businessDate: '2026-10-09', timezone: 'Africa/Harare',
    state: 'pending', attempts: 0,
    slots: [
      { slot: 0, state: 'uncertain' },
      { slot: 1, state: 'failed' },
      ...[2, 3, 4].map((slot) => ({ slot, state: 'pending' })),
    ],
  });
  let calls = 0;
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    calls += 1;
    assert.deepEqual(options.skipSlots, [0]);
    await options.onSlotFailed(1, new Error('Media remains unavailable'));
    // The interrupted batch leaves both failed and pending safe slots.
    throw new Error('Preparation interrupted');
  } });
  assert.equal((await scheduler.check()).state, 'pending');
  f.setTime('2026-10-09T07:05:00Z');
  assert.equal((await scheduler.check()).state, 'pending');
  f.setTime('2026-10-09T07:10:00Z');
  assert.deepEqual(await scheduler.check(), { state: 'needs_review', sent: 0, uncertain: 1 });
  const run = f.rows.get('2026-10-09');
  assert.equal(run.attempts, 3);
  assert.equal(run.nextAttemptAt, null);
  assert.deepEqual(run.slots.map((slot) => slot.state), [
    'uncertain', 'failed', 'pending', 'pending', 'pending',
  ]);
  f.setTime('2026-10-09T07:15:00Z');
  assert.equal((await scheduler.check()).state, 'needs_review');
  assert.equal(calls, 3);
});

test('restart after Harare midnight quarantines old sends before 09:00 without backfilling', async () => {
  const f = fixture('2026-10-09T22:00:00Z');
  const oldIds = ['2026-10-09', '2026-10-09@13:00', '2026-10-09@16:30'];
  for (const [index, id] of oldIds.entries()) {
    f.rows.set(id, {
      _id: id, businessDate: '2026-10-09', timezone: 'Africa/Harare',
      scheduledTime: ['09:00', '13:00', '16:30'][index], state: 'running', attempts: 1,
      nextAttemptAt: new Date('2026-10-09T21:55:00Z'),
      slots: [
        { slot: 0, state: 'sent', messageId: 'already-sent' },
        { slot: 1, state: 'sending' },
        ...[2, 3, 4].map((slot) => ({ slot, state: 'pending' })),
      ],
    });
  }
  f.rows.set('2026-10-08', {
    _id: '2026-10-08', businessDate: '2026-10-08', timezone: 'Africa/Harare',
    state: 'pending', attempts: 1,
    slots: Array.from({ length: 5 }, (_, slot) => ({ slot, state: 'pending' })),
  });
  const pendingOldRun = structuredClone(f.rows.get('2026-10-08'));
  const sent = [];
  const options = { ...f, postStatus: (callbacks) => sendAvailable(callbacks, sent) };
  assert.equal((await createStatusScheduler(options).check()).state, 'not_due');
  assert.deepEqual(sent, []);
  for (const id of oldIds) {
    const run = f.rows.get(id);
    assert.equal(run.state, 'needs_review');
    assert.equal(run.attempts, 1);
    assert.equal(run.nextAttemptAt, null);
    assert.deepEqual(run.slots.map((slot) => slot.state), [
      'sent', 'uncertain', 'pending', 'pending', 'pending',
    ]);
    assert.equal(run.slots[0].messageId, 'already-sent');
  }
  assert.equal(f.messages.filter((message) => message.includes('Check WhatsApp manually')).length, 3);
  const oldRuns = structuredClone([...f.rows.values()]);

  f.setTime('2026-10-10T07:00:00Z');
  assert.equal((await createStatusScheduler(options).check()).state, 'completed');
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
  assert.equal(f.rows.get('2026-10-10').state, 'completed');
  assert.deepEqual(oldIds.map((id) => f.rows.get(id)), oldRuns.slice(0, 3));
  assert.deepEqual(f.rows.get('2026-10-08'), pendingOldRun);
  assert.equal(f.messages.filter((message) => message.includes('Check WhatsApp manually')).length, 3);
});

test('old-send recovery retries failed persistence while offline and stops revisiting saved records', async () => {
  const f = fixture('2026-10-10T07:00:00Z');
  const oldId = '2026-10-09@16:30';
  f.rows.set(oldId, {
    _id: oldId, businessDate: '2026-10-09', timezone: 'Africa/Harare',
    scheduledTime: '16:30', state: 'running', attempts: 1,
    slots: [
      { slot: 0, state: 'sending' },
      ...[1, 2, 3, 4].map((slot) => ({ slot, state: 'pending' })),
    ],
  });
  let saves = 0;
  const normalSave = f.store.save;
  f.store.save = async (row) => {
    saves += 1;
    if (saves === 1) throw new Error('Mongo unavailable during old-send recovery');
    await normalSave(row);
  };
  let posts = 0;
  const scheduler = createStatusScheduler({ ...f, isReady: () => false,
    postStatus: async () => { posts += 1; } });
  assert.equal((await scheduler.check()).state, 'error');
  assert.equal(f.rows.get(oldId).slots[0].state, 'sending');
  assert.equal((await scheduler.check()).state, 'not_ready');
  assert.equal(f.rows.get(oldId).slots[0].state, 'uncertain');
  assert.equal(f.rows.get(oldId).state, 'needs_review');
  assert.equal(f.rows.get(oldId).nextAttemptAt, null);
  const warningCount = f.messages.filter((message) => message.includes('Check WhatsApp manually')).length;
  assert.ok(warningCount > 0);
  assert.equal((await scheduler.check()).state, 'not_ready');
  assert.equal(saves, 2);
  assert.equal(posts, 0);
  assert.equal(f.rows.size, 1);
  assert.equal(f.messages.filter((message) => message.includes('Check WhatsApp manually')).length, warningCount);
});

test('persistent preparation failures stop after three attempts per batch', async () => {
  const f = fixture();
  let calls = 0;
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    calls += 1;
    for (let slot = 0; slot < 5; slot += 1) {
      await options.onSlotFailed(slot, new Error('No Drive media available'));
    }
  } });
  assert.equal((await scheduler.check()).state, 'pending');
  f.setTime('2026-10-09T07:05:00Z');
  assert.equal((await scheduler.check()).state, 'pending');
  f.setTime('2026-10-09T07:10:00Z');
  assert.equal((await scheduler.check()).state, 'exhausted');
  f.setTime('2026-10-09T10:00:00Z');
  assert.equal((await scheduler.check()).state, 'exhausted');
  assert.equal(calls, 3);
});

test('failed batches have independent retry budgets and do not block later due batches', async () => {
  const f = fixture('2026-10-09T14:30:00Z');
  let calls = 0;
  const sent = [];
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    calls += 1;
    // The morning batch fails on every attempt; the afternoon batch succeeds.
    if ([1, 4, 6].includes(calls)) {
      for (let slot = 0; slot < 5; slot += 1) {
        await options.onSlotFailed(slot, new Error('Media preparation failed'));
      }
      return;
    }
    // The evening batch needs one retry, which skips its four saved statuses.
    if (calls === 3) {
      await options.onSlotFailed(0, new Error('One media file unavailable'));
      await sendAvailable({ ...options, skipSlots: [0] }, sent);
      return;
    }
    if (calls === 5) assert.deepEqual(options.skipSlots, [1, 2, 3, 4]);
    await sendAvailable(options, sent);
  } });
  assert.equal((await scheduler.check()).state, 'pending');
  assert.equal(calls, 3);
  assert.equal(sent.length, 9);
  assert.deepEqual([...f.rows.values()].map((run) => run.attempts), [1, 1, 1]);

  f.setTime('2026-10-09T14:34:59Z');
  assert.equal((await scheduler.check()).state, 'backoff');
  assert.equal(calls, 3);
  f.setTime('2026-10-09T14:35:00Z');
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(calls, 5);
  assert.equal(sent.length, 10);
  assert.deepEqual([...f.rows.values()].map((run) => run.attempts), [2, 1, 2]);

  f.setTime('2026-10-09T14:40:00Z');
  await scheduler.check();
  await scheduler.check();
  assert.equal(calls, 6);
  assert.equal(f.rows.get('2026-10-09').state, 'exhausted');
  assert.deepEqual([...f.rows.values()].map((run) => run.attempts), [3, 1, 2]);
  assert.equal(sent.length, 10);
});

test('a disconnected client consumes no attempts and catches up when ready', async () => {
  const f = fixture();
  let ready = false;
  const sent = [];
  const scheduler = createStatusScheduler({ ...f, isReady: () => ready,
    postStatus: (options) => sendAvailable(options, sent) });
  assert.equal((await scheduler.check()).state, 'not_ready');
  assert.equal(f.rows.size, 0);
  ready = true;
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(f.rows.get('2026-10-09').attempts, 1);
});

test('persistent checkpoint storage failure prevents sending and permits retry after recovery', async () => {
  const f = fixture();
  let sends = 0;
  let saves = 0;
  const normalSave = f.store.save;
  f.store.save = async (run) => {
    saves += 1;
    // Initial attempt write succeeds, but the per-slot sending marker fails.
    if (saves > 1) throw new Error('Mongo unavailable');
    await normalSave(run);
  };
  const scheduler = createStatusScheduler({ ...f, postStatus: async (options) => {
    await options.onSlotSending(0);
    sends += 1;
    await options.onSlotSent(0, 'unexpected');
  } });
  assert.equal((await scheduler.check()).state, 'error');
  assert.equal(sends, 0);
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'pending');

  f.store.save = normalSave;
  f.setTime('2026-10-09T07:05:00Z');
  const sent = [];
  const result = await createStatusScheduler({ ...f,
    postStatus: (options) => sendAvailable(options, sent),
  }).check();
  assert.deepEqual(result, { state: 'completed', sent: 5, uncertain: 0 });
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
});

test('a transient sending-checkpoint timeout restores safe retry because WhatsApp was never invoked', async () => {
  const f = fixture();
  let sends = 0;
  let saves = 0;
  const normalSave = f.store.save;
  f.store.save = async (run) => {
    saves += 1;
    // Simulate a write that committed before its response was lost. Recovery
    // must overwrite that marker using the known fact that no send followed.
    await normalSave(run);
    if (saves === 2) throw new Error('Mongo request timed out; write outcome unknown');
  };
  await createStatusScheduler({ ...f, postStatus: async (options) => {
    await options.onSlotSending(0);
    sends += 1;
  } }).check();
  assert.equal(sends, 0);
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'pending');
  assert.ok(!f.messages.some((message) => message.includes('automatic retry suppressed')));

  f.setTime('2026-10-09T07:05:00Z');
  const sent = [];
  const result = await createStatusScheduler({ ...f,
    postStatus: (options) => sendAvailable(options, sent),
  }).check();
  assert.deepEqual(result, { state: 'completed', sent: 5, uncertain: 0 });
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
});

test('repeated pre-send checkpoint failures do not consume the publication retry budget', async () => {
  const f = fixture();
  const normalSave = f.store.save;
  let checkpointFailures = 0;
  f.store.save = async (run) => {
    if (run.state === 'running' && run.slots.some((slot) => slot.state === 'sending')) {
      checkpointFailures += 1;
      throw new Error('Mongo unavailable before WhatsApp send');
    }
    await normalSave(run);
  };
  const sent = [];
  const options = { ...f, postStatus: (callbacks) => sendAvailable(callbacks, sent) };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    f.setTime(new Date(Date.parse('2026-10-09T07:00:00Z') + attempt * 5 * 60 * 1000));
    assert.equal((await createStatusScheduler(options).check()).state, 'pending');
    assert.equal(f.rows.get('2026-10-09').attempts, 0);
    assert.ok(f.rows.get('2026-10-09').slots.every((slot) => slot.state === 'pending'));
  }
  assert.equal(checkpointFailures, 4);
  assert.deepEqual(sent, []);

  f.store.save = normalSave;
  f.setTime('2026-10-09T07:20:00Z');
  assert.deepEqual(await createStatusScheduler(options).check(), {
    state: 'completed', sent: 5, uncertain: 0,
  });
  assert.equal(f.rows.get('2026-10-09').attempts, 1);
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
});

test('a transient result-checkpoint failure preserves the returned message id for final persistence', async () => {
  const f = fixture();
  const sent = [];
  let saves = 0;
  const normalSave = f.store.save;
  f.store.save = async (run) => {
    saves += 1;
    if (saves === 3) throw new Error('Mongo unavailable when saving publish result');
    await normalSave(run);
  };
  const options = { ...f, postStatus: (callbacks) => sendAvailable(callbacks, sent) };
  assert.equal((await createStatusScheduler(options).check()).state, 'pending');
  assert.deepEqual(sent, [0]);
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'sent');
  assert.equal(f.rows.get('2026-10-09').slots[0].messageId, 'message-0');

  f.setTime('2026-10-09T07:05:00Z');
  assert.deepEqual(await createStatusScheduler(options).check(), {
    state: 'completed', sent: 5, uncertain: 0,
  });
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
});

test('lost persistence after a returned publish result cannot cause a duplicate on restart', async () => {
  const f = fixture();
  const sent = [];
  let saves = 0;
  const normalSave = f.store.save;
  f.store.save = async (run) => {
    saves += 1;
    // The send marker is durable; storing its result and final summary fail.
    if (saves > 2) throw new Error('Mongo unavailable after WhatsApp returned');
    await normalSave(run);
  };
  assert.equal((await createStatusScheduler({ ...f,
    postStatus: (options) => sendAvailable(options, sent),
  }).check()).state, 'error');
  assert.deepEqual(sent, [0]);
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'sending');

  f.store.save = normalSave;
  f.setTime('2026-10-09T07:05:00Z');
  const result = await createStatusScheduler({ ...f,
    postStatus: (options) => sendAvailable(options, sent),
  }).check();
  assert.deepEqual(result, { state: 'needs_review', sent: 4, uncertain: 1 });
  assert.deepEqual(sent, [0, 1, 2, 3, 4]);
});

test('a late batch stops preparing new sends once the Harare day changes', async () => {
  const f = fixture('2026-10-09T21:59:59Z');
  let sends = 0;
  await createStatusScheduler({ ...f, postStatus: async (options) => {
    f.setTime('2026-10-09T22:00:00Z');
    await options.onSlotSending(0);
    sends += 1;
  } }).check();
  assert.equal(sends, 0);
  assert.equal(f.rows.get('2026-10-09').slots[0].state, 'pending');
  assert.deepEqual([...f.rows.keys()], ['2026-10-09']);
  assert.ok(f.messages.some((message) => message.includes('crossed midnight')));
});
