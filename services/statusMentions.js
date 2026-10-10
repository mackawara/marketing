const MAX_STATUS_MENTIONS = 5;

const CONTACT_ID = /^\d+@(?:c\.us|lid)$/;
const GROUP_ID = /^\d+(?:-\d+)?@g\.us$/;

const serializedId = (value) => {
    if (typeof value === 'string') return value;
    if (value && typeof value._serialized === 'string') return value._serialized;
    return null;
};

/**
 * Select best-effort mention options for one batch of statuses. These are the
 * library's public message options; they do not guarantee status notifications.
 * Pass all known self IDs (phone-number and LID) to verify group membership and
 * exclude the connected account. Each target is used at most once per batch.
 */
const createStatusMentionOptions = ({
    contacts = [],
    groups = [],
    selfIds = [],
    selfId,
    statusCount = 5,
} = {}) => {
    if (!Number.isInteger(statusCount) || statusCount < 0) {
        throw new RangeError('statusCount must be a non-negative integer');
    }

    const ownIds = new Set(
        [...selfIds, selfId].map(serializedId).filter((id) => id && CONTACT_ID.test(id))
    );
    const seenContacts = new Set();
    const contactCandidates = [];

    for (const contact of contacts) {
        const id = serializedId(contact?.contactId ?? contact?.id ?? contact);
        if (!id || !CONTACT_ID.test(id) || ownIds.has(id) || seenContacts.has(id)) continue;
        seenContacts.add(id);
        contactCandidates.push(id);
    }

    const seenGroups = new Set();
    const groupCandidates = [];
    for (const group of groups) {
        const id = serializedId(group?.id);
        if (!group?.isGroup || !id || !GROUP_ID.test(id) || seenGroups.has(id)) continue;
        const belongsToGroup = Array.isArray(group.participants)
            && group.participants.some((participant) => ownIds.has(serializedId(participant?.id)));
        if (!belongsToGroup) continue;

        const subject = typeof group.name === 'string' ? group.name : group.subject;
        if (typeof subject !== 'string' || !subject.trim()) continue;
        seenGroups.add(id);
        groupCandidates.push({ id, subject });
    }

    let contactIndex = 0;
    let groupIndex = 0;
    return Array.from({ length: statusCount }, () => {
        const mentions = [];
        const groupMentions = [];

        if (groupIndex < groupCandidates.length) {
            groupMentions.push(groupCandidates[groupIndex++]);
        }
        while (mentions.length + groupMentions.length < MAX_STATUS_MENTIONS
            && contactIndex < contactCandidates.length) {
            mentions.push(contactCandidates[contactIndex++]);
        }
        while (mentions.length + groupMentions.length < MAX_STATUS_MENTIONS
            && groupIndex < groupCandidates.length) {
            groupMentions.push(groupCandidates[groupIndex++]);
        }

        return { mentions, groupMentions };
    });
};

module.exports = { MAX_STATUS_MENTIONS, createStatusMentionOptions };
