const connectDB = require("./config/database");

require("dotenv").config();

// connect to mongodb before running anything on the app
connectDB().then(async () => {
  const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      //  executablePath: "/usr/bin/chromium-browser",
      handleSIGINT: true,
      headless: true,
      args: [
        "--log-level=3", // fatal only
        "--start-maximized",
        "--no-default-browser-check",
        "--disable-infobars",
        "--disable-web-security",
        "--disable-site-isolation-trials",
        "--no-experiments",
        "--ignore-gpu-blacklist",
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-default-apps",
        "--enable-features=NetworkService",
        "--disable-setuid-sandbox",
        "--no-sandbox",
      ],
    },
  });

  client.initialize();

  //messaging client resources
  const clientOn = require("./config/helperFunction/clientOn");
  clientOn(client, "authenticated");
  clientOn(client, "auth_failure");
  clientOn(client, "qr");

  client.on("ready", async () => {
    console.log("Client is ready!");
    //functions abd resources
    //Helper Functions
    const timeDelay = (ms) => new Promise((res) => setTimeout(res, ms));
    const cron = require("node-cron");

    //client events and functions
    //decalre variables that work with client here
    clientOn(client, "message");
    clientOn(client, "group-join");
    clientOn(client, "group-leave"); //client

    //Db models

    //decalre variables that work with client here
    client.setDisplayName("Venta tech");

    const me = `263775231426@c.us`;

    const nowToday = new Date();

    //const mediaModel = require("./models/media");
    client.on("message", async (msg) => {
      if (msg.hasMedia && msg.from == "263775231426@c.us") {
        const fs = require("fs/promises");
        const media = await msg.downloadMedia();
        const uniqueName = new Date().valueOf().toString().slice("5");
        await fs.writeFile(
          `assets/image${uniqueName}.jpeg`,
          media.data,
          "base64",
          function (err) {
            if (err) {
              console.log(err);
            }
          }
        );
      }
    });

    const path = require("path");
    const fs = require("fs");
    //joining path of directory
    const directoryPath = path.join(__dirname, "assets");
    //passsing directoryPath and callback function
    //read fromm assets folder and send
    const sendAdMedia = (group) => {
      //creates anarray from the files in assets folder
      fs.readdir(directoryPath, function (err, mediaAdverts) {
        console.log(mediaAdverts);
        //handling error
        if (err) {
          return console.log("Unable to scan directory: " + err);
        }
        let randomMediaAdvert =
          mediaAdverts[Math.floor(Math.random() * mediaAdverts.length)];
        //listing all files using forEach
        console.log(randomMediaAdvert);

        client.sendMessage(
          group,
          MessageMedia.fromFilePath(`./assets/${randomMediaAdvert}`)
        );
      });
    };

    cron.schedule(`2 9,16,19 * * *`, async () => {
      console.log("cron running");
      let advertMessages = require("./adverts");
      let randomAdvert =
        advertMessages[Math.floor(Math.random() * advertMessages.length)];

      //contacts
      const me = process.env.ME;
      //groups
      const hwangeClubCricket = process.env.HWANGECLUBDELACRICKET;
      const liveSoccer1 = process.env.LIVESOCCER1;
      const liveCricket1 = process.env.LIVECRICKET1;
      const hwangeDealsgrp1 = "263775932942-1555492418@g.us";
      const sellItHge4 = "263773389927-1588234038@g.us";
      const sellIthge = "263717766191-1583426999@g.us";
      const sellIthge2 = "263717766191-1583474819@g.us";
      const sellIthge5 = "263717766191-1611592932@g.us";
      const sellIthge3 = "263717766191-1584895535@g.us";
      const sellIthge6 = "263717766191-1616870613@g.us";
      const hwangeclassifieds = "263714496540-1579592614@g.us";
      const hwangeCitytraders = "263774750143-1590396559@g.us";
      const noCaptBusIdeas = "263783046858-1621225929@g.us";

      const contactListForAds = [
        hwangeDealsgrp1,
        sellIthge,
        sellIthge2,
        sellItHge4,
        hwangeCitytraders,
        hwangeclassifieds,
        sellIthge5,
        sellIthge6,
        sellIthge3,
        noCaptBusIdeas,
      ];

      for (let i = 0; i < contactListForAds.length; i++) {
        try {
          console.log("test " + i);
          sendAdMedia(contactListForAds[i]);
          client
            .sendMessage(contactListForAds[i], `${randomAdvert}`)
            .catch((error) => {
              console.log(error);
            });
          await timeDelay(Math.floor(Math.random() * 10) * 1000); //causes a delay of anything between 1-10 secs between each message
        } catch (error) {
          console.log(error);
          client.sendMessage(
            me,
            `failed to send automatic message to ${contactListForAds[i]}`
          );
        }
      }
    });
  });

  client.on("disconnected", (reason) => {
    console.log("Client was logged out", reason);
  });
});
