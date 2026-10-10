const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStatusPoster } = require('../services/statusService');

const quiet = { log() {}, warn() {}, error() {} };
function setup(overrides = {}) {
    const events = [];
    const post = createStatusPoster({
        client: { sendMessage: async (destination, media, options) => {
            events.push(['send', destination, options]);
            return { id: { _serialized: `message-${events.length}` } };
        } },
        MessageMedia: { fromUrl: async () => ({ data: 'photo', mimetype: 'image/jpeg' }) },
        refreshFiles: async () => {},
        pickFile: () => ({ url: 'https://example.test/photo', filename: 'photo.jpg' }),
        delay: async () => {}, logger: quiet,
        ...overrides,
    });
    return { post, events, callbacks: {
        onSlotSending: async slot => events.push(['sending', slot]),
        onSlotSent: async (slot, id) => events.push(['sent', slot, id]),
        onSlotFailed: async slot => events.push(['failed', slot]),
    } };
}

test('resumes only unfinished slots and checkpoints each before publishing', async () => {
    const { post, events, callbacks } = setup();
    const result = await post({ ...callbacks, skipSlots: [0, 2, 4] });
    assert.deepEqual(result, { sent: 2, failed: 0, uncertain: 0, skipped: 3 });
    assert.deepEqual(events.map(event => event[0]), ['sending', 'send', 'sent', 'sending', 'send', 'sent']);
    assert.deepEqual(events.filter(event => event[0] === 'sending').map(event => event[1]), [1, 3]);
    assert.ok(events.filter(event => event[0] === 'send').every(event => event[1] === 'status@broadcast'));
});

test('empty media cache marks slots retryable without sending', async () => {
    const { post, events, callbacks } = setup({ pickFile: () => null });
    const result = await post(callbacks);
    assert.equal(result.failed, 5);
    assert.deepEqual(events, [0, 1, 2, 3, 4].map(slot => ['failed', slot]));
});

test('download failures are safe to retry and do not record sensitive error details', async () => {
    const errors = [];
    const { post, events, callbacks } = setup({
        MessageMedia: { fromUrl: async () => { throw new Error('secret-in-url'); } },
    });
    await post({ ...callbacks, onSlotFailed: async (_, error) => errors.push(error.message) });
    assert.equal(events.length, 0);
    assert.equal(errors.length, 5);
    assert.ok(errors.every(error => !error.includes('secret-in-url')));
});

test('failed pre-send checkpoint prevents publication', async () => {
    const { post, events } = setup();
    await assert.rejects(post({ onSlotSending: async () => { throw new Error('database unavailable'); } }), /database unavailable/);
    assert.equal(events.length, 0);
});

test('ambiguous send stops batch and leaves sending checkpoint for review', async () => {
    for (const sendMessage of [async () => { throw new Error('connection lost'); }, async () => null]) {
        const { post, events, callbacks } = setup({ client: { sendMessage } });
        const result = await post(callbacks);
        assert.deepEqual(result, { sent: 0, failed: 0, uncertain: 1, skipped: 0 });
        assert.deepEqual(events, [['sending', 0]]);
    }
});

test('post-send checkpoint errors abort without marking the slot retryable', async () => {
    const { post, events, callbacks } = setup();
    await assert.rejects(post({ ...callbacks, onSlotSent: async () => { throw new Error('checkpoint lost'); } }), /checkpoint lost/);
    assert.deepEqual(events.map(event => event[0]), ['sending', 'send']);
});

test('mention failure does not block publication; default adds no mention fields', async () => {
    const { post, events, callbacks } = setup({ getMentionOptions: async () => { throw new Error('lookup failed'); } });
    const result = await post(callbacks);
    assert.equal(result.sent, 5);
    const options = events.find(event => event[0] === 'send')[2];
    assert.equal(options.mentions, undefined);
    assert.equal(options.groupMentions, undefined);
});

test('experimental group/contact options reach the status call without adding ids to caption', async () => {
    const mentions = ['100@c.us'];
    const groupMentions = [{ id: '200@g.us', subject: 'Group' }];
    const { post, events, callbacks } = setup({ getMentionOptions: async () => [{ mentions, groupMentions }] });
    await post({ ...callbacks, skipSlots: [1, 2, 3, 4] });
    const options = events.find(event => event[0] === 'send')[2];
    assert.deepEqual(options.mentions, mentions);
    assert.deepEqual(options.groupMentions, groupMentions);
    assert.ok(!options.caption.includes('@'));
});
