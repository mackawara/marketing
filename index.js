const connectDB = require("./config/database");
const config = require("./config");
const { client, MessageMedia, startClientHealthHeartbeat, startupHealthCheck } = require("./config/wwebjsConfig");
const qrcode = require("qrcode-terminal");
const contacts = require("./models/busContacts");
const { advertService, sendAdMedia } = require("./services/advertServices");const { postStatus } = require('./services/statusService');const { initDriveCache } = require("./services/googleDrive");
const { harvestGroupContacts } = require("./services/harvestContacts");
const channelService = require("./services/channel.service");

const timeDelay = (ms) => new Promise((res) => setTimeout(res, ms));
let isReadyBootstrapComplete = false;
// connect to mongodb before running anything on the app
connectDB().then(async () => {
  // Fetch and log Google Drive file URLs at startup
  await initDriveCache();

  console.log("initialising client, be patient");
  startClientHealthHeartbeat();
  client.initialize();
  startupHealthCheck(60000); // if not ready after 60s, restart

  //messaging client resources
  const clientOn = require("./config/helperFunction/clientOn");

  client.on("authenticated", async (session) => {
    console.log(`client authenticated`);
  });

  client.on("qr", (qr) => {
    console.log("qr stage");
    qrcode.generate(qr, { small: true });
    console.log(qr);
  });

  client.on("ready", async () => {
    console.log("Client is ready!");

    if (isReadyBootstrapComplete) {
      console.log('Ready bootstrap already complete, skipping duplicate scheduler setup.');
      return;
    }

    isReadyBootstrapComplete = true;

    await timeDelay(2000);
    client.sendMessage(config.ME, "pipeline confirmed");
    //functions abd resources
    //Helper Functions
    const cron = require("node-cron");
    const path = require("path");
    const fs = require("fs");
    //joining path of directory

    //passsing directoryPath and callback function
    //read fromm assets folder and send

    cron.schedule(`25 7,13,18 * * *`, async () => {
      advertService();
    });

    // Post WhatsApp status daily at 19:00
    cron.schedule('25 16 * * *', async () => {
      postStatus();
    });

    // Harvest group contacts daily at 02:00
    cron.schedule('0 2 * * *', async () => {
      harvestGroupContacts();
    });

    // Post tech tip to channel daily at 09:00
    cron.schedule('0 9 * * *', async () => {
      try {
        await channelService.postRandomTechTip();
        console.log('Daily tech tip posted to channel');
      } catch (error) {
        console.error('Failed to post tech tip:', error);
      }
    });

    // Initial harvest 30s after startup
    setTimeout(() => harvestGroupContacts(), 30000);

    //client events and functions
    //decalre variables that work with client here
    clientOn("message");
    clientOn(client, "group-join");
    clientOn(client, "group-leave");
  });
});
module.exports = timeDelay;
