const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_STATUS_MENTIONS, createStatusMentionOptions } = require('../services/statusMentions');

const SELF = '263770000000@c.us';
const SELF_LID = '100000000001@lid';
const contact = (number) => ({ contactId: `${number}@c.us` });
const group = (number, members = [SELF]) => ({
    id: { _serialized: `${number}@g.us` },
    name: `Group ${number}`,
    isGroup: true,
    participants: members.map((id) => ({ id: { _serialized: id } })),
});

test('five statuses each prefer one joined group and four contacts, with no repeats', () => {
    const result = createStatusMentionOptions({
        contacts: Array.from({ length: 50 }, (_, i) => contact(1000 + i)),
        groups: Array.from({ length: 10 }, (_, i) => group(2000 + i)),
        selfIds: [SELF],
    });

    assert.equal(MAX_STATUS_MENTIONS, 5);
    assert.equal(result.length, 5);
    for (const options of result) {
        assert.equal(options.mentions.length, 4);
        assert.equal(options.groupMentions.length, 1);
        assert.equal(options.mentions.length + options.groupMentions.length, MAX_STATUS_MENTIONS);
    }
    const targets = result.flatMap(({ mentions, groupMentions }) => [
        ...mentions, ...groupMentions.map(({ id }) => id),
    ]);
    assert.equal(new Set(targets).size, 25);
});

test('filters invalid and duplicate contact IDs and both known self IDs', () => {
    const result = createStatusMentionOptions({
        contacts: [
            contact(123), contact(123), '456@lid', { id: { _serialized: '456@lid' } },
            contact('abc'), '123@g.us', '123@broadcast', '123@c.us.extra',
            '123@lid\n', '123:4@c.us', null, {}, { contactId: SELF }, SELF_LID,
        ],
        selfIds: [{ _serialized: SELF }, SELF_LID],
        statusCount: 1,
    });
    assert.deepEqual(result, [{ mentions: ['123@c.us', '456@lid'], groupMentions: [] }]);
});

test('uses only valid joined groups and recognizes a supplied self LID', () => {
    const valid = group(2000);
    const lidGroup = { ...group('123-456', [SELF_LID]), name: undefined, subject: 'LID group' };
    const result = createStatusMentionOptions({
        groups: [
            valid, valid, lidGroup, group(2001, ['999@c.us']),
            { ...group(2002), isGroup: false }, { ...group(2003), participants: null },
            { ...group(2004), id: { _serialized: '123@c.us' } },
            { ...group(2005), name: '' }, null,
        ],
        selfIds: [SELF, SELF_LID],
        statusCount: 1,
    });
    assert.deepEqual(result, [{
        mentions: [],
        groupMentions: [{ id: '2000@g.us', subject: 'Group 2000' }, { id: '123-456@g.us', subject: 'LID group' }],
    }]);
    assert.deepEqual(createStatusMentionOptions({ groups: [valid], statusCount: 1 }), [
        { mentions: [], groupMentions: [] },
    ]);
});

test('fills available slots with only contacts and leaves exhausted slots empty', () => {
    const result = createStatusMentionOptions({
        contacts: Array.from({ length: 7 }, (_, i) => contact(1000 + i)),
    });
    assert.deepEqual(result.map(({ mentions }) => mentions.length), [5, 2, 0, 0, 0]);
    assert.ok(result.every(({ groupMentions }) => groupMentions.length === 0));
    assert.equal(new Set(result.flatMap(({ mentions }) => mentions)).size, 7);
});

test('fills available slots with only groups without repetition', () => {
    const result = createStatusMentionOptions({
        groups: Array.from({ length: 7 }, (_, i) => group(2000 + i)),
        selfId: SELF,
        statusCount: 3,
    });
    assert.deepEqual(result.map(({ groupMentions }) => groupMentions.length), [5, 2, 0]);
    assert.ok(result.every(({ mentions }) => mentions.length === 0));
    assert.equal(new Set(result.flatMap(({ groupMentions }) => groupMentions.map(({ id }) => id))).size, 7);
});

test('fills spare capacity with groups after contacts run out', () => {
    const result = createStatusMentionOptions({
        contacts: [contact(1000), contact(1001)],
        groups: Array.from({ length: 6 }, (_, i) => group(2000 + i)),
        selfId: SELF,
        statusCount: 2,
    });
    assert.deepEqual(result.map(({ mentions, groupMentions }) => [mentions.length, groupMentions.length]), [
        [2, 3], [0, 3],
    ]);
});

test('supports an empty batch and validates the status count', () => {
    assert.deepEqual(createStatusMentionOptions({ statusCount: 0 }), []);
    assert.deepEqual(createStatusMentionOptions(), Array.from({ length: 5 }, () => ({ mentions: [], groupMentions: [] })));
    for (const statusCount of [-1, 1.5, '5', NaN]) {
        assert.throws(() => createStatusMentionOptions({ statusCount }), RangeError);
    }
});
