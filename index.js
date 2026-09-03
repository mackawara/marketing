process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Uncaught exception — exiting for PM2 restart:', err);
  process.exit(1);
});

const connectDB = require("./config/database");
const config = require("./config");
const { client, MessageMedia, startClientHealthHeartbeat, startupHealthCheck, setClientReady, restartClient } = require("./config/wwebjsConfig");
const qrcode = require("qrcode-terminal");
const contacts = require("./models/busContacts");
const { advertService, sendAdMedia } = require("./services/advertServices");const { postStatus } = require('./services/statusService');const { initDriveCache } = require("./services/googleDrive");
const { harvestGroupContacts } = require("./services/harvestContacts");
const channelService = require("./services/channel.service");

const timeDelay = require('./UTILS/timeDelay');
const { cleanupBeforeInit } = require('./UTILS/cleanupChrome');
let isReadyBootstrapComplete = false;
// connect to mongodb before running anything on the app
connectDB().then(async () => {
  // Fetch and log Google Drive file URLs at startup
  await initDriveCache();

  console.log("initialising client, be patient");
  cleanupBeforeInit();
  startClientHealthHeartbeat();
  client.initialize();
  // A cold start has to launch Chromium, load WhatsApp Web and restore the
  // session from disk. On a small ARM instance that regularly exceeds 60s, and
  // the penalty was a hard exit into another cold start that was no faster —
  // until PM2 hit max_restarts and stopped trying. Give it room.
  startupHealthCheck(240000);

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
    setClientReady(true);

    if (isReadyBootstrapComplete) {
      console.log('Ready bootstrap already complete, skipping duplicate scheduler setup.');
      return;
    }

    isReadyBootstrapComplete = true;

    await timeDelay(2000);
    try {
      await client.sendMessage(config.ME, "pipeline confirmed");
    } catch (err) {
      console.error('[startup] Could not send startup confirmation:', err.message);
    }
    //functions abd resources
    //Helper Functions
    const cron = require("node-cron");
    const path = require("path");
    const fs = require("fs");
    //joining path of directory

    //passsing directoryPath and callback function
    //read fromm assets folder and send

    // All schedules are local business time. Without an explicit timezone
    // node-cron uses the system TZ, which is UTC on the server — so these were
    // firing two hours earlier than intended.
    const CRON_TZ = { timezone: 'Africa/Harare' };

    // Adverts at 07:25, 13:25 and 18:25 CAT
    cron.schedule(`25 7,13,18 * * *`, async () => {
      try {
        await advertService();
      } catch (err) {
        console.error('[cron:advertService] Unhandled error:', err);
      }
    }, CRON_TZ);

    // Post WhatsApp status at 09:25, 11:25 and 16:25 CAT
    cron.schedule('25 16,11,9 * * *', async () => {
      try {
        await postStatus();
      } catch (err) {
        console.error('[cron:postStatus] Unhandled error:', err);
      }
    }, CRON_TZ);

    // Harvest group contacts daily at 02:00 CAT
    cron.schedule('0 2 * * *', async () => {
      try {
        await harvestGroupContacts();
      } catch (err) {
        console.error('[cron:harvestGroupContacts] Unhandled error:', err);
      }
    }, CRON_TZ);

    // Proactive recycle in a quiet window, clear of every other schedule.
    // Chromium memory growth is invisible to PM2's max_memory_restart (that
    // only measures the Node process), so without this the kernel eventually
    // picks the moment for us — usually mid-broadcast.
    cron.schedule('0 3 * * *', async () => {
      console.log('[cron:recycle] Scheduled daily client recycle.');
      await restartClient('scheduled-daily-recycle');
    }, CRON_TZ);

    // Post tech tip to channel daily at 09:00
    // cron.schedule('0 9 * * *', async () => {
    //   try {
    //     await channelService.postRandomTechTip();
    //     console.log('Daily tech tip posted to channel');
    //   } catch (error) {
    //     console.error('Failed to post tech tip:', error);
    //   }
    // });

    // Initial harvest 30s after startup
    setTimeout(() => harvestGroupContacts().catch(err => console.error('[startup:harvestGroupContacts] Unhandled error:', err)), 30000);

    //client events and functions
    //decalre variables that work with client here
    // clientOn dispatches on its first argument and imports `client` itself.
    // These previously passed the client as arg1 ("clientOn(client, ...)"), so
    // neither branch matched and no handler was ever attached.
    clientOn("message");
    clientOn("group-join");
    clientOn("group-leave");
  });
});
module.exports = timeDelay;
