const connectDB = require('./config/database');
const config = require('./config');
const { client, MessageMedia } = require('./config/wwebjsConfig');
const qrcode = require('qrcode-terminal');
const contacts = require("./models/busContacts");
const timeDelay = ms => new Promise(res => setTimeout(res, ms));

// connect to mongodb before running anything on the app
connectDB().then(async () => {
  console.log('initialse client');
  client.initialize();

  //messaging client resources
  const clientOn = require('./config/helperFunction/clientOn');

  client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessful
    console.error('AUTHENTICATION FAILURE', msg);
  });

  client.on('authenticated', async session => {
    console.log(`client authenticated`);
  });

  client.on('qr', qr => {
    console.log('qr stage');
    qrcode.generate(qr, { small: true });
    console.log(qr);
  });

  client.on('ready', async () => {
    
    console.log('Client is ready!');
    await timeDelay(2000);
    client.sendMessage(config.ME, 'pipeline confirmed');
    //functions abd resources
    //Helper Functions
    const cron = require('node-cron');
    const path = require("path");
    const fs = require("fs");
    //joining path of directory
    const directoryPath = path.join(__dirname, "assets");
    //passsing directoryPath and callback function
    //read fromm assets folder and send
    const sendAdMedia = (group) => {
      //creates anarray from the files in assets folder
      fs.readdir(directoryPath, function (err, mediaAdverts) {
        //handling error
        if (err) {
          return console.log("Unable to scan directory: " + err);
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


    cron.schedule(`8 8,14 * * *`, async () => {

      let advertMessages = require("./adverts");
      const contactListForAds = await contacts.find().lean();

      for (let i = 0; i < contactListForAds.length; i++) {
        let randomAdvert =
          advertMessages[Math.floor(Math.random() * advertMessages.length)];
        try {
          if(contactListForAds[i]=='120363266412319114@g.us'){
            continue
          }
          sendAdMedia(contactListForAds[i].serialisedNumber);
          client
            .sendMessage(
              contactListForAds[i].serialisedNumber,
              `${randomAdvert}`
            )
            .catch((error) => {
              console.log(error);
            });
          await timeDelay(Math.floor(Math.random() * 10) * 1000); //causes a delay of anything between 1-10 secs between each message
        } catch (error) {
          console.log(error);
          client.sendMessage(
            me,
            `failed to send automatic message to ${contactListForAds[i].notifyName}`
          );
        }
      }
    
  });


    //client events and functions
    //decalre variables that work with client here
    clientOn('message');
    clientOn(client, 'group-join');
    clientOn(client, 'group-leave');
   

  });

  client.on('disconnected', reason => {
    console.log('Client was logged out', reason);
  });
});
module.exports=timeDelay