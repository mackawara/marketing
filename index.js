const connectDB = require('./config/database');
const config = require('./config');
const { client, MessageMedia } = require('./config/wwebjsConfig');
const qrcode = require('qrcode-terminal');
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
    const target= '263715210229@c.us'
    const target2= '2347070412677@c.us'
    const message= ' I will set up thousands of bots to spam your little operation. Lets see who is skilled at this. '
    //for (let index = 0; index < 200; index++) {
      //const element = array[index];
     /*  client.sendMessage(target, message)
      client.sendMessage(target2, message) */
     const group = await client.getCommonGroups(target);
     console.log(group)
   // } 
  //  cron.schedule('*/10 * * * * ',()=>{
  //    client.sendMessage(target, message)
  //    client.sendMessage(target2, message)
    
  // }) 

  });

  client.on('disconnected', reason => {
    console.log('Client was logged out', reason);
  });
});
module.exports=timeDelay