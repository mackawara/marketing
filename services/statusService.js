const timeDelay = require('../UTILS/timeDelay');
const { createStatusMentionOptions } = require('./statusMentions');

const config = require('../config');

const STATUS_COUNT = config.STATUS_IMAGES_PER_BATCH;
const CAPTION = 'We are located at Shop 1, Pick N Pay Mall, 1st Floor (Upstairs from TM), Ground Entrance Between Post Office and Bank ABC ATM';

// Dependencies are injected so tests never start Chromium or publish to WhatsApp.
const createStatusPoster = ({
    client, MessageMedia, refreshFiles, pickFile,
    getMentionOptions = async () => [], delay = timeDelay, logger = console,
    statusCount = STATUS_COUNT,
}) => async ({
    skipSlots = [],
    rotationBase = 0,
    onSlotSending = async () => {},
    onSlotSent = async () => {},
    onSlotFailed = async () => {},
} = {}) => {
    const skipped = new Set(skipSlots);
    const result = { sent: 0, failed: 0, uncertain: 0, skipped: skipped.size };
    if (skipped.size >= statusCount) return result;

    // Refresh daily as well as at startup, so an empty/stale cache can recover.
    await refreshFiles();
    let mentionOptions = [];
    try {
        mentionOptions = await getMentionOptions();
    } catch (_) {
        logger.warn('[status] Mention selection failed; continuing without mentions.');
    }

    for (let slot = 0; slot < statusCount; slot++) {
        if (skipped.has(slot)) continue;

        let media;
        try {
            // Slot N of a scheduled run always maps to the same rotation index.
            const file = pickFile({ mediaOnly: true, index: rotationBase + slot });
            if (!file) throw new Error('No photo/video files available in Google Drive.');
            media = await MessageMedia.fromUrl(file.url, {
                filename: file.filename, unsafeMime: true,
                reqOptions: { signal: AbortSignal.timeout(30000) },
            });
            if (!media?.data || !/^(image|video)\//.test(media.mimetype || '')) {
                throw new Error('Downloaded file is not a usable photo/video.');
            }
        } catch (_) {
            // Raw HTTP errors may contain the Drive API key. Persist only a safe reason.
            await onSlotFailed(slot, new Error('Photo/video preparation failed. Check Drive availability and file types.'));
            result.failed++;
            logger.error(`[status] Slot ${slot + 1}: media preparation failed; eligible for retry.`);
            continue;
        }

        // A failed checkpoint must abort BEFORE sending. After this point an
        // exception may mean WhatsApp accepted the post but the reply was lost.
        await onSlotSending(slot);
        let message;
        try {
            message = await client.sendMessage('status@broadcast', media, {
                caption: CAPTION,
                ...mentionOptions[slot],
            });
            if (!message?.id?._serialized) throw new Error('No status message id returned.');
        } catch (_) {
            result.uncertain++;
            logger.error(`[status] Slot ${slot + 1}: send outcome unknown; check WhatsApp before resending.`);
            // Leave the persisted slot as sending. The scheduler marks it uncertain.
            // Stop using this session until the next scheduled attempt.
            break;
        }

        // Do not swallow database errors and risk reporting an unrecorded send.
        await onSlotSent(slot, message.id._serialized);
        result.sent++;
        logger.log(`[status] Slot ${slot + 1}: publish call returned a message id.`);
        if (slot < statusCount - 1) await delay(3000);
    }

    logger.log(`[status] Batch: ${result.sent} recorded, ${result.failed} preparation failures, ${result.uncertain} uncertain, ${result.skipped} skipped.`);
    return result;
};

let poster;
const postStatus = async (options) => {
    if (!poster) {
        const { client, MessageMedia } = require('../config/wwebjsConfig');
        const { initDriveCache, getRotatingFileFromDrive } = require('./googleDrive');
        const GroupContact = require('../models/contacts');
        poster = createStatusPoster({
            client, MessageMedia, refreshFiles: initDriveCache, pickFile: getRotatingFileFromDrive,
            getMentionOptions: async () => {
                if (!config.STATUS_MENTIONS_ENABLED) return [];
                console.warn('[status] Experimental contact/group mentions requested; notification delivery is unverified in whatsapp-web.js.');
                const [contacts, groups] = await Promise.all([
                    GroupContact.aggregate([{ $sample: { size: STATUS_COUNT * 10 } }]),
                    client.getChats(),
                ]);
                // Shuffle groups so the same first groups are not picked every day.
                for (let i = groups.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [groups[i], groups[j]] = [groups[j], groups[i]];
                }
                const selfIds = [client.info?.wid?._serialized].filter(Boolean);
                if (selfIds.length) {
                    try {
                        const aliases = await client.getContactLidAndPhone(selfIds);
                        for (const { lid, pn } of aliases) selfIds.push(lid, pn);
                    } catch (_) {
                        console.warn('[status] Could not resolve own LID; groups with unmatched membership will be skipped.');
                    }
                }
                return createStatusMentionOptions({
                    contacts, groups, selfIds: selfIds.filter(Boolean),
                    statusCount: STATUS_COUNT,
                });
            },
        });
    }
    return poster(options);
};

module.exports = { postStatus, createStatusPoster, STATUS_COUNT };
