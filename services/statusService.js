const { client, MessageMedia } = require('../config/wwebjsConfig');
const { getRandomFileFromDrive } = require('./googleDrive');
let advertMessages = require('../adverts');

const timeDelay = (ms) => new Promise((res) => setTimeout(res, ms));
const STATUS_COUNT = 5;

/**
 * Posts 5 random media files from Google Drive as WhatsApp statuses
 * with random advert captions. Scheduled to run daily at 19:00.
 */
const postStatus = async () => {
    console.log(`Posting ${STATUS_COUNT} daily status updates...`);

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

            await client.sendMessage('status@broadcast', media) 

            console.log(`✅ Status ${i + 1}/${STATUS_COUNT} posted successfully!`);

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
