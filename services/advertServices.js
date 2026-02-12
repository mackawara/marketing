const fs = require('fs').promises;
const path = require('path');

const timeDelay = ms => new Promise(res => setTimeout(res, ms));
const { client, MessageMedia } = require('../config/wwebjsConfig');
let advertMessages = require('../adverts');
const config = require('../config');
const contacts = require('../models/busContacts');
const { getRandomFileFromDrive } = require('./googleDrive');
const me = config.ME;
//const directoryPath = path.join(__dirname, 'assets');
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
    for (let i = 0; i < contactListForAds.length; i++) {
      let randomAdvert =
        advertMessages[Math.floor(Math.random() * advertMessages.length)];

      if (contactListForAds[i].serialisedNumber!='120363266412319114@g.us') {
      
      sendAdMedia(contactListForAds[i].serialisedNumber);
       client
        .sendMessage(contactListForAds[i].serialisedNumber, `${randomAdvert}`)
        .catch(error => {
          console.error(error);
        }); 
      await timeDelay(Math.floor(Math.random() * 13) * 1000); //causes a delay of anything between 1-10 secs between each message
    }}
  } catch (error) {
    console.error(error);
  }
};
module.exports = { advertService, sendAdMedia };
