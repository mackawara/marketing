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

const safeSendMessage = async (chatId, payload, options = {}, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
   
    try {
      return await client.sendMessage(chatId, payload, options);
    } catch (error) {
      const retryable = isRetryableSendError(error);
      if (!retryable || attempt === maxRetries) {
        if (retryable) {
          await restartClient(`retryable-send-failure:${chatId}`);
        }
        throw error;
      }

      console.warn(
        `[safeSend] Transient send error (attempt ${attempt}/${maxRetries}) for ${chatId}: ${error.message}.`
      );
      // Always restart on transient errors — restartClient guards prevent double-restarts
      await restartClient(`transient-send-error:${chatId}`);
      await timeDelay(5000 * attempt);
    }
  }

  throw new Error(`Unable to send message to ${chatId} after ${maxRetries} attempts.`);
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
    const excludeList = ['1203632664192319114@g.us'];

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
      } catch (error) {
        console.error(`Error sending text advert to ${contact.serialisedNumber}:`, error);
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
