const connectDB = require('./config/database');
const config = require('./config');
const { client, MessageMedia } = require('./config/wwebjsConfig');
const qrcode = require('qrcode-terminal');

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
    const timeDelay = ms => new Promise(res => setTimeout(res, ms));
    console.log('Client is ready!');
    await timeDelay(2000);
    client.sendMessage(config.ME, 'pipeline confirmed');
    //functions abd resources
    //Helper Functions
    const cron = require('node-cron');

    //client events and functions
    //decalre variables that work with client here
    clientOn('message');
    clientOn(client, 'group-join');
    clientOn(client, 'group-leave');
    const me = config.ME;

    client.on('message', async msg => {
      if (msg.hasMedia && msg.from == me && msg.body == 'advert') {
        const fs = require('fs/promises');
        const media = await msg.downloadMedia();
        const uniqueName = new Date().valueOf().toString().slice('5');
        await fs.writeFile(
          `assets/image${uniqueName}.jpeg`,
          media.data,
          'base64',
          function (err) {
            if (err) {
              console.log(err);
            }
          }
        );
      }
    });

    const path = require('path');
    const fs = require('fs');
    //joining path of directory
    const directoryPath = path.join(__dirname, 'assets');
    //passsing directoryPath and callback function
    //read fromm assets folder and send
    const sendAdMedia = group => {
      //creates anarray from the files in assets folder
      fs.readdir(directoryPath, function (err, mediaAdverts) {
        if (err) {
          return console.log('Unable to scan directory: ' + err);
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

    cron.schedule(`30 20 * * 7`, async () => {
      const allChats = await client.getChats();
      allChats.forEach(chat => chat.clearMessages());
    });
    cron.schedule(`43 9,15 * * *`, async () => {
      let advertMessages = require('./adverts');

      //contacts
      const contacts = require('./models/busContacts');
      const contactListForAds = await contacts.find().exec();

      for (let i = 0; i < contactListForAds.length; i++) {
        let randomAdvert =
          advertMessages[Math.floor(Math.random() * advertMessages.length)];
        try {
          sendAdMedia(contactListForAds[i].serialisedNumber);
          client
            .sendMessage(
              contactListForAds[i].serialisedNumber,
              `${randomAdvert}\n\n*For quicker replies enquire on thhis number 0775 231 426*`
            )
            .catch(error => {
              console.log(error);
            });
          const maxDelayTimeInSecs = 9;
          const minDelayTimeInSecs = 3;
          const delayTime =
            (Math.random() * (maxDelayTimeInSecs - minDelayTimeInSecs) +
              minDelayTimeInSecs) *
            1000;
          await timeDelay(delayTime); //causes a delay of anything between 1-10 secs between each message
        } catch (error) {
          console.log(error);
          client.sendMessage(
            me,
            `failed to send automatic message to ${contactListForAds[i].notifyName}`
          );
        }
      }
    });
  });

  client.on('disconnected', reason => {
    console.log('Client was logged out', reason);
  });
});
