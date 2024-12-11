const fs = require('fs/promises');
const path = require('path');

const timeDelay=ms => new Promise(res => setTimeout(res, ms));
const { client, MessageMedia } = require('../config/wwebjsConfig');
let advertMessages = require('../adverts');
const config = require('../config');
const contacts = require('../models/busContacts');
const me = config.ME;
const directoryPath = path.join(__dirname, 'assets');
const sendAdMedia = group => {
    console.log('now sending media adverts')
  //creates anarray from the files in assets folder
  fs.readdir(directoryPath, function (err, mediaAdverts) {
      if (err) {
    //handling error
    console.log('Unable to scan directory: ' + err);
      return 
    }
    let randomMediaAdvert =
      mediaAdverts[Math.floor(Math.random() * mediaAdverts.length)];
    //listing all files using forEach

    client.sendMessage(
      group,
      MessageMedia.fromFilePath(`./assets/${randomMediaAdvert}`)
    );
  });
};
const advertService = async () => {
  try {
    const contactListForAds = await contacts.find().lean();
    const excludeList = ['120363266412319114@g.us'];
    for (let i = 0; i < contactListForAds.length; i++) {
      let randomAdvert =
        advertMessages[Math.floor(Math.random() * advertMessages.length)];

      if (excludeList.includes(contactListForAds[i])) {
        continue;
      }
     sendAdMedia(contactListForAds[i].serialisedNumber);
      /* client
        .sendMessage(contactListForAds[i].serialisedNumber, `${randomAdvert}`)
        .catch(error => {
          console.error(error);
        }); */
       await timeDelay(Math.floor(Math.random() * 10) * 1000); //causes a delay of anything between 1-10 secs between each message
    }
  } catch (error) {
    console.error(error);
    client.sendMessage(me, `failed to send automatic message to `);
  }
};
module.exports = { advertService, sendAdMedia };
