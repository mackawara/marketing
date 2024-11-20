const connectDB = require('./config/database');
const config = require('./config');
const { client, MessageMedia } = require('./config/wwebjsConfig');
const qrcode = require('qrcode-terminal');
const contacts = require('./models/busContacts');
const {advertService}=require('./services/advertServices')
let advertMessages = require('./adverts');
const timeDelay = ms => new Promise(res => setTimeout(res, ms));
// connect to mongodb before running anything on the app
connectDB().then(async () => {
  console.log('initialising client, be patient');
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
    const path = require('path');
    const fs = require('fs');
    //joining path of directory
    const directoryPath = path.join(__dirname, 'assets');
    //passsing directoryPath and callback function
    //read fromm assets folder and send
    

    cron.schedule(`8 8,14 * * *`, async () => {
      advertService();
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
module.exports = timeDelay;
