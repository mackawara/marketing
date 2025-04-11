const fs = require('fs').promises;
const path = require('path');

const timeDelay = ms => new Promise(res => setTimeout(res, ms));
const { client, MessageMedia } = require('../config/wwebjsConfig');
let advertMessages = require('../adverts');
const config = require('../config');
const contacts = require('../models/busContacts');
const me = config.ME;
//const directoryPath = path.join(__dirname, 'assets');
const sendAdMedia = async (group) => {
  console.log(`now sending media adverts to Group ${group}`);

  const directoryPath = path.resolve(__dirname, './assets');


  try {
      const mediaAdverts = await fs.readdir(directoryPath);

      console.log('length is ' + mediaAdverts.length);

      if (mediaAdverts.length === 0) {
          console.log('No media adverts found in directory.');
          return;
      }

      const randomMediaAdvert =
          mediaAdverts[Math.floor(Math.random() * mediaAdverts.length)];

      const fullMediaPath = path.join(directoryPath, randomMediaAdvert);
      
      console.log('Attempting to send file: ', fullMediaPath);

      const media = MessageMedia.fromFilePath(fullMediaPath);
console.log(media)
      await client.sendMessage(group, media);

      console.log('Media message sent successfully.');

  } catch (err) {
      console.error('Error sending media advert:', err);

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

      if (excludeList.includes(contactListForAds[i].serialisedNumber)) {
        continue;
      } 
      sendAdMedia(contactListForAds[i].serialisedNumber);
       client
        .sendMessage(contactListForAds[i].serialisedNumber, `${randomAdvert}`)
        .catch(error => {
          console.error(error);
        }); 
      await timeDelay(Math.floor(Math.random() * 13) * 1000); //causes a delay of anything between 1-10 secs between each message
    }
  } catch (error) {
    console.error(error);
  }
};
module.exports = { advertService, sendAdMedia };
