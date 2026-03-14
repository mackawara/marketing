const { client, MessageMedia } = require('../config/wwebjsConfig');
const { getRandomFileFromDrive } = require('./googleDrive');
const GroupContact = require('../models/contacts');
let advertMessages = require('../adverts');

const timeDelay = require('../UTILS/timeDelay');
const STATUS_COUNT = 5;
const MENTION_COUNT = 50;

/**
 * Fetches MENTION_COUNT random unique contacts from DB and resolves
 * them to WhatsApp contact objects suitable for use in `mentions`.
 */
const getRandomMentionContacts = async () => {
    const dbContacts = await GroupContact.aggregate([
        { $sample: { size: MENTION_COUNT * 2 } }, // over-fetch to account for resolution failures
    ]);

    // Deduplicate before resolving
    const unique = [...new Map(dbContacts.map((c) => [c.contactId, c])).values()];

    const results = await Promise.allSettled(
        unique.map((c) => client.getContactById(c.contactId))
    );

    const resolved = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value)
        .slice(0, MENTION_COUNT);

    console.log(`📇 Resolved ${resolved.length} contacts for mentions`);
    return resolved;
};

/**
 * Posts 5 random media files from Google Drive as WhatsApp statuses
 * with random advert captions. Scheduled to run daily at 19:00.
 */
const postStatus = async () => {
    console.log(`Posting ${STATUS_COUNT} daily status updates...`);

    // Resolve mention contacts once, reuse across all status posts
    let mentionContacts = [];
    try {
        mentionContacts = await getRandomMentionContacts();
    } catch (err) {
        console.warn('⚠️ Could not fetch mention contacts:', err.message);
    }

    const mentionText = mentionContacts
        .map((c) => `@${c.id.user}`)
        .join(' ');

    for (let i = 0; i < STATUS_COUNT; i++) {
        try {
            const fileData = getRandomFileFromDrive();

            if (!fileData) {
                console.log('No files available from Google Drive for status.');
                return;
            }

            console.log(`[${i + 1}/${STATUS_COUNT}] Posting status with file: ${fileData.filename}`);
            console.log(`File URL: ${fileData.url}`);

            const media = await MessageMedia.fromUrl(fileData.url, {
                filename: fileData.filename,
                unsafeMime: true,
            });

            const randomCaption =
                advertMessages[Math.floor(Math.random() * advertMessages.length)];

            const caption = mentionText
                ? `${randomCaption}\n\n${mentionText}`
                : randomCaption;

            await client.sendMessage('status@broadcast', media, {
                caption,
                ...(mentionContacts.length > 0 && { mentions: mentionContacts }),
            });

            console.log(`✅ Status ${i + 1}/${STATUS_COUNT} posted with ${mentionContacts.length} mentions`);

            // Delay between posts to avoid rate limiting
            if (i < STATUS_COUNT - 1) {
                const delay = Math.floor(Math.random() * 10 + 3) * 1000;
                console.log(`Waiting ${delay / 1000}s before next status...`);
                await timeDelay(delay);
            }
        } catch (err) {
            console.error(`❌ Error posting status ${i + 1}/${STATUS_COUNT}:`, err);

            if (
                err.message &&
                err.message.includes(
                    'Protocol error (Runtime.callFunctionOn): Promise was collected'
                )
            ) {
                console.warn('Detected possible broken session. Scheduled shutdown.');
                setTimeout(() => process.exit(0), 5000);
                return;
            }
        }
    }

    console.log('✅ All status updates posted.');
};

module.exports = { postStatus };
