const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { createStatusScheduler, businessClock } = require('../services/statusScheduler');
const { selectRotatingFile } = require('../services/googleDrive');
const { createStatusPoster } = require('../services/statusService');
const { createChannelPublisher } = require('../services/channelPublisher');
const { generateChannelPost, topicFor, TOPICS } = require('../services/channelContent');

const quiet = { log() {}, info() {}, warn() {}, error() {} };

function fixture(start) {
  let current = new Date(start);
  const rows = new Map();
  return {
    rows,
    now: () => new Date(current),
    setTime: (value) => { current = new Date(value); },
    logger: quiet,
    store: {
      get: async (key) => structuredClone(rows.get(key)),
      findUnfinishedBefore: async () => [],
      save: async (row) => { rows.set(row._id, structuredClone(row)); },
    },
  };
}

test('default schedule is 06:00, 10:00 and 18:00 Africa/Harare', () => {
  assert.deepEqual(config.PUBLISH_TIMES, ['06:00', '10:00', '18:00']);
  assert.equal(config.PUBLISH_TIMEZONE, 'Africa/Harare');
});

test('runs fire at 06:00, 10:00 and 18:00 Harare (04:00, 08:00, 16:00 UTC), each once', async () => {
  const f = fixture('2026-10-18T03:59:00Z');
  const runs = [];
  const scheduler = createStatusScheduler({ ...f, slotCount: 2, publish: async ({ rotationBase, onSlotSending, onSlotSent }) => {
    runs.push(rotationBase);
    for (const slot of [0, 1]) { await onSlotSending(slot); await onSlotSent(slot, `m${slot}`); }
  } });
  assert.equal((await scheduler.check()).state, 'not_due');
  for (const [time, expected] of [['04:00', 1], ['07:59', 1], ['08:00', 2], ['15:59', 2], ['16:00', 3], ['20:00', 3]]) {
    f.setTime(`2026-10-18T${time}:00Z`);
    await scheduler.check();
    assert.equal(runs.length, expected, time);
  }
  assert.deepEqual([...f.rows.keys()], ['2026-10-18@06:00', '2026-10-18@10:00', '2026-10-18@18:00']);
});

test('rotation base advances by slotCount per run, across runs and days, without gaps', async () => {
  const f = fixture('2026-10-18T16:00:00Z');
  const bases = [];
  const scheduler = createStatusScheduler({ ...f, slotCount: 5, publish: async ({ rotationBase, onSlotSending, onSlotSent }) => {
    bases.push(rotationBase);
    for (let slot = 0; slot < 5; slot += 1) { await onSlotSending(slot); await onSlotSent(slot, `m${slot}`); }
  } });
  await scheduler.check();
  f.setTime('2026-10-19T04:00:00Z');
  await scheduler.check();
  assert.equal(bases.length, 4);
  for (let i = 1; i < bases.length; i += 1) assert.equal(bases[i] - bases[i - 1], 5);
});

test('configured schedule and timezone are honoured', async () => {
  const f = fixture('2026-10-18T04:30:00Z');
  const calls = [];
  const scheduler = createStatusScheduler({ ...f, schedule: ['07:00'], timezone: 'Africa/Johannesburg', slotCount: 1,
    publish: async () => { calls.push(1); } });
  await scheduler.check();
  assert.equal(calls.length, 0);
  assert.equal(businessClock(new Date('2026-10-18T05:00:00Z'), 'Africa/Johannesburg').minutes, 7 * 60);
});

test('a failed Channel run retries without re-sending slots already recorded', async () => {
  const f = fixture('2026-10-18T04:00:00Z');
  const sent = [];
  let failNext = true;
  const publisher = createChannelPublisher({
    channelId: '1@newsletter', postsPerRun: 2, logger: quiet,
    generate: async ({ rotationIndex }) => {
      if (rotationIndex % 2 === 1 && failNext) { failNext = false; throw new Error('openai down'); }
      return { text: `post ${rotationIndex}`, topic: 't', sources: [] };
    },
    send: async (_, text) => { sent.push(text); return { id: { _serialized: `id-${sent.length}` } }; },
  });
  const scheduler = createStatusScheduler({ ...f, slotCount: 2, label: 'channel', legacyKeyTime: null, schedule: ['06:00'], publish: publisher });
  assert.equal((await scheduler.check()).state, 'pending');
  assert.equal(sent.length, 1);
  assert.equal(f.rows.get('2026-10-18@06:00').slots[1].state, 'failed');
  f.setTime('2026-10-18T04:06:00Z');
  assert.equal((await scheduler.check()).state, 'completed');
  assert.equal(sent.length, 2);
  f.setTime('2026-10-18T04:20:00Z');
  await scheduler.check();
  assert.equal(sent.length, 2);
});

test('an ambiguous Channel send is quarantined, never retried', async () => {
  const f = fixture('2026-10-18T04:00:00Z');
  let sends = 0;
  const publisher = createChannelPublisher({
    channelId: '1@newsletter', postsPerRun: 1, logger: quiet,
    generate: async () => ({ text: 'hi', topic: 't', sources: [] }),
    send: async () => { sends += 1; throw new Error('socket closed'); },
  });
  const scheduler = createStatusScheduler({ ...f, slotCount: 1, schedule: ['06:00'], publish: publisher });
  assert.equal((await scheduler.check()).state, 'needs_review');
  f.setTime('2026-10-18T04:30:00Z');
  await scheduler.check();
  assert.equal(sends, 1);
});

test('Channel publisher requires a channel id and checkpoints before sending', async () => {
  await assert.rejects(createChannelPublisher({ send: async () => {}, logger: quiet })(), /CHANNEL_ID/);
  const events = [];
  await createChannelPublisher({
    channelId: 'c', postsPerRun: 1, logger: quiet,
    generate: async () => ({ text: 'x', topic: 't', sources: [] }),
    send: async () => { events.push('send'); return { id: { _serialized: 'i' } }; },
  })({ onSlotSending: async () => events.push('sending'), onSlotSent: async () => events.push('sent') });
  assert.deepEqual(events, ['sending', 'send', 'sent']);
});

test('rotation orders by filename, wraps, and filters to media', () => {
  const files = [
    { id: '3', filename: 'c.jpg', mimeType: 'image/jpeg' },
    { id: '1', filename: 'a.jpg', mimeType: 'image/jpeg' },
    { id: '9', filename: 'doc.pdf', mimeType: 'application/pdf' },
    { id: '2', filename: 'b.mp4', mimeType: 'video/mp4' },
  ];
  const pick = (index) => selectRotatingFile(files, index, { mediaOnly: true }).filename;
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(pick), ['a.jpg', 'b.mp4', 'c.jpg', 'a.jpg', 'b.mp4', 'c.jpg']);
  assert.equal(selectRotatingFile([], 0), null);
  assert.equal(selectRotatingFile([files[2]], 0, { mediaOnly: true }), null);
});

test('Status poster maps each slot to rotationBase + slot and sends nothing for missing media', async () => {
  const picked = [];
  const sent = [];
  const base = {
    client: { sendMessage: async (...args) => { sent.push(args); return { id: { _serialized: 'm' } }; } },
    MessageMedia: { fromUrl: async () => ({ data: 'd', mimetype: 'image/jpeg' }) },
    refreshFiles: async () => {}, delay: async () => {}, logger: quiet, statusCount: 3,
  };
  await createStatusPoster({ ...base, pickFile: ({ index }) => { picked.push(index); return { url: 'u', filename: 'f' }; } })({ rotationBase: 30 });
  assert.deepEqual(picked, [30, 31, 32]);
  sent.length = 0;
  const failed = [];
  await createStatusPoster({ ...base, pickFile: () => null })({ onSlotFailed: async (slot) => failed.push(slot) });
  assert.equal(sent.length, 0);
  assert.deepEqual(failed, [0, 1, 2]);
});

function fakeOpenAI(output) {
  const requests = [];
  return { requests, responses: { create: async (request) => { requests.push(request); return output; } } };
}
const withCitation = (text, url) => ({ output_text: text, output: [{ content: [{ annotations: [{ type: 'url_citation', url }] }] }] });

test('topics rotate through Wi-Fi, security, WhatsApp, news and AI', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => topicFor(i).key),
    ['wifi', 'security', 'whatsapp', 'news', 'ai', 'wifi']);
  assert.equal(TOPICS.filter((topic) => topic.news).length, 2);
});

test('tips use the existing OpenAI client without web search and carry no links', async () => {
  const openai = fakeOpenAI({ output_text: '*Move your router*\nPlace it centrally. https://made-up.example', output: [] });
  const post = await generateChannelPost({ openai, rotationIndex: 0, date: '2026-10-18' });
  assert.equal(openai.requests[0].tools, undefined);
  assert.match(openai.requests[0].instructions, /WhatsApp/);
  assert.ok(!post.text.includes('http'));
  assert.deepEqual(post.sources, []);
});

test('news uses web search, appends a cited source and strips tracking params', async () => {
  const openai = fakeOpenAI(withCitation('*Big news*\nSomething happened.', 'https://news.example/a?utm_source=openai&id=7'));
  const post = await generateChannelPost({ openai, rotationIndex: 3, date: '2026-10-18' });
  assert.deepEqual(openai.requests[0].tools, [{ type: 'web_search' }]);
  assert.match(post.text, /Source: https:\/\/news\.example\/a\?id=7$/);
});

test('news without any source link is rejected rather than published', async () => {
  const openai = fakeOpenAI({ output_text: 'Unsourced claim', output: [] });
  await assert.rejects(generateChannelPost({ openai, rotationIndex: 4, date: '2026-10-18' }), /No source link/);
  await assert.rejects(generateChannelPost({ openai: fakeOpenAI({ output_text: '  ', output: [] }), rotationIndex: 0, date: 'd' }), /empty/);
});

test('integrated day: real scheduler, generator, publisher and poster publish to Channel and Status once per slot', async () => {
  const f = fixture('2026-10-18T16:00:00Z'); // 18:00 Harare: all three runs are due
  const statusRows = f.rows;
  const channelF = fixture('2026-10-18T16:00:00Z');
  const channelMessages = [];
  const statusMessages = [];
  const openai = { responses: { create: async (request) => ({
    output_text: request.tools ? '*News*\nSomething happened.' : '*Tip*\nDo this.',
    output: request.tools ? [{ content: [{ annotations: [{ type: 'url_citation', url: 'https://news.example/x?utm_source=openai' }] }] }] : [],
  }) } };
  const files = ['b.jpg', 'a.jpg', 'c.jpg'].map((filename, i) => ({ id: `${i}`, filename, mimeType: 'image/jpeg' }));
  const statusPoster = createStatusPoster({
    client: { sendMessage: async (to, media) => { statusMessages.push([to, media.name]); return { id: { _serialized: `s${statusMessages.length}` } }; } },
    MessageMedia: { fromUrl: async (url, { filename }) => ({ data: 'd', mimetype: 'image/jpeg', name: filename }) },
    refreshFiles: async () => {}, delay: async () => {}, logger: quiet, statusCount: 2,
    pickFile: ({ index, mediaOnly }) => { const file = selectRotatingFile(files, index, { mediaOnly }); return { url: 'u', filename: file.filename }; },
  });
  const channelPublisher = createChannelPublisher({
    openai, channelId: '123@newsletter', postsPerRun: 1, logger: quiet,
    send: async (to, text) => { channelMessages.push([to, text]); return { id: { _serialized: `c${channelMessages.length}` } }; },
  });
  const status = createStatusScheduler({ ...f, publish: statusPoster, slotCount: 2 });
  const channel = createStatusScheduler({ ...channelF, publish: channelPublisher, slotCount: 1, label: 'channel', legacyKeyTime: null });

  assert.equal((await status.check()).state, 'completed');
  assert.equal((await channel.check()).state, 'completed');
  await status.check();
  await channel.check();

  assert.equal(statusMessages.length, 6);
  assert.ok(statusMessages.every(([to]) => to === 'status@broadcast'));
  assert.deepEqual(statusMessages.slice(0, 3).map(([, name]) => name), ['a.jpg', 'b.jpg', 'c.jpg']);
  assert.equal(channelMessages.length, 3);
  assert.ok(channelMessages.every(([to]) => to === '123@newsletter'));
  assert.deepEqual([...statusRows.keys()], ['2026-10-18@06:00', '2026-10-18@10:00', '2026-10-18@18:00']);
  assert.ok([...channelF.rows.values()].every((run) => run.state === 'completed' && run.slots[0].messageId));
});
