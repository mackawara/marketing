const timeDelay = require('../UTILS/timeDelay');
const { client, MessageMedia, restartClient } = require('../config/wwebjsConfig');
let advertMessages = require('../adverts');
const contacts = require('../models/busContacts');
const { getRandomFileFromDrive } = require('./googleDrive');

let isAdvertServiceRunning = false;


// --- Shuffle-based non-repeating advert picker ---
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

let shuffledAdverts = shuffleArray(advertMessages);
let advertIndex = 0;

function getNextAdvert() {
  if (advertIndex >= shuffledAdverts.length) {
    // All adverts have been sent — reshuffle and start over
    shuffledAdverts = shuffleArray(advertMessages);
    advertIndex = 0;
  }
  return shuffledAdverts[advertIndex++];
}

const isRetryableSendError = error => {
  const errorMessage = (error && error.message ? error.message : '').toLowerCase();
  return (
    errorMessage.includes('attempted to use detached frame') ||
    errorMessage.includes('execution context was destroyed') ||
    errorMessage.includes('target closed') ||
    errorMessage.includes('session closed') ||
    errorMessage.includes('promise was collected')
  );
};

// Retry in-process first. The previous version called restartClient() on the
// first transient error, and restartClient() ends in process.exit(1) — so
// attempts 2 and 3 were unreachable and one detached-frame blip on a single
// recipient killed the whole broadcast. A transient error is almost always one
// message, not one session, and a retry is far cheaper than a cold start.
const safeSendMessage = async (chatId, payload, options = {}, maxRetries = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.sendMessage(chatId, payload, options);
    } catch (error) {
      lastError = error;

      if (!isRetryableSendError(error)) {
        throw error;
      }

      console.warn(
        `[safeSend] Transient send error (attempt ${attempt}/${maxRetries}) for ${chatId}: ${error.message}`
      );

      if (attempt < maxRetries) {
        await timeDelay(3000 * attempt);
      }
    }
  }

  // Only now is the session itself genuinely suspect.
  console.error(
    `[safeSend] ${maxRetries} consecutive transient failures for ${chatId} — escalating to client restart.`
  );
  await restartClient(`send-failed-after-${maxRetries}-attempts:${chatId}`);
  throw lastError;
};

const sendAdMedia = async (group) => {
  console.log(`now sending media adverts to Group ${group}`);

  try {
      const fileData = getRandomFileFromDrive();

      if (!fileData) {
          console.log('No media adverts found in Google Drive folder.');
          return;
      }

      console.log(`Sending file from Google Drive: ${fileData.filename}`);
      console.log(`File URL: ${fileData.url}`);

      const media = await MessageMedia.fromUrl(fileData.url, {
          filename: fileData.filename,
          unsafeMime: true,
      });

      const MIN_MEDIA_BYTES = 100 * 1024; // 100KB
      const mediaSizeBytes = media && media.data ? Buffer.from(media.data, 'base64').length : 0;

      if (mediaSizeBytes < MIN_MEDIA_BYTES) {
          console.warn(
              `Skipping media advert: fetched file ${fileData.filename} is only ${mediaSizeBytes} bytes (< ${MIN_MEDIA_BYTES}). Likely a failed fetch.`
          );
          return;
      }

      await safeSendMessage(group, media);

      console.log('Media message sent successfully.');

  } catch (err) { // This 'catch' block IS successfully catching errors from the 'try' block.
      console.error('Error sending media advert:', err);
  }
};
const advertService = async () => {
  if (isAdvertServiceRunning) {
    console.log('Advert service is already running. Skipping overlapping run.');
    return;
  }

  isAdvertServiceRunning = true;

  try {
    const contactListForAds = await contacts.find().lean();
    const excludeList = ['1203632664192319114@g.us',process.env.VENTAGROUP];

    // One failing recipient should not end the run, but a run where every
    // recipient fails means the session is dead — stop rather than grind
    // through the whole list retrying against a broken client.
    const MAX_CONSECUTIVE_FAILURES = 5;
    let consecutiveFailures = 0;

    for (const contact of contactListForAds) {
      if (excludeList.includes(contact.serialisedNumber)) {
        console.log(`Skipping excluded group: ${contact.serialisedNumber}`);
        continue;
      }

      const randomAdvert = getNextAdvert();

      await sendAdMedia(contact.serialisedNumber);
      await timeDelay(Math.floor(Math.random() * 10 + 3) * 1000);

      try {
        await safeSendMessage(contact.serialisedNumber, randomAdvert);
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures++;
        console.error(
          `Error sending text advert to ${contact.serialisedNumber} (${consecutiveFailures} consecutive):`,
          error.message
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(
            `[advertService] ${consecutiveFailures} consecutive send failures — aborting run.`
          );
          break;
        }
      }
      await timeDelay(Math.floor(Math.random() * 10 + 3) * 1000);
    }
  } catch (error) {
    console.error(error);
  } finally {
    isAdvertServiceRunning = false;
  }
};
module.exports = { advertService, sendAdMedia };
