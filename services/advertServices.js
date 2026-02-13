const timeDelay = ms => new Promise(res => setTimeout(res, ms));
const { client, MessageMedia } = require('../config/wwebjsConfig');
let advertMessages = require('../adverts');
const contacts = require('../models/busContacts');
const { getRandomFileFromDrive } = require('./googleDrive');


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

      await client.sendMessage(group, media);

      console.log('Media message sent successfully.');

  } catch (err) { // This 'catch' block IS successfully catching errors from the 'try' block.
      console.error('Error sending media advert:', err);

      // This condition checks if the caught error is the specific "Promise was collected" error.
      if (
        err.message && err.message.includes(
          'Protocol error (Runtime.callFunctionOn): Promise was collected'
        )
      ) {
          console.warn('Detected possible broken session. Scheduled shutdown.');
          
          setTimeout(() => process.exit(0), 5000);
      }
  }
};
const advertService = async () => {
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

      await client
        .sendMessage(contact.serialisedNumber, randomAdvert)
        .catch(error => {
          console.error(error);
        });
      await timeDelay(Math.floor(Math.random() * 10 + 3) * 1000);
    }
  } catch (error) {
    console.error(error);
  }
};
module.exports = { advertService, sendAdMedia };
