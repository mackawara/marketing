const clientOn = async (client, arg1, arg2, MessageMedia) => {
  const me = process.env.ME;
  //const { MessageMedia } = require("whatsapp-web.js");

  if (arg1 == "auth_failure") {
    client.on("auth_failure", (msg) => {
      // Fired if session restore was unsuccessful
      console.error("AUTHENTICATION FAILURE", msg);
    });
  }
  if (arg1 == "authenticated") {
    client.on("authenticated", async (session) => {
      console.log(`client authenticated`);
    });
  }
  const qrcode = require("qrcode-terminal");
  if (arg1 == "qr") {
    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log(qr);
    });
  }

  const contactModel = require("../../models/busContacts");
  // let groupName, grpDescription;
  if (arg1 == "message") {
    client.on(`message`, async (msg) => {
      const chat = await msg.getChat();
      const contact = await msg.getContact();

      const msgBody = msg.body;

      msgBody.split(" ").forEach(async (word) => {
        const keywords = {
          businessKeywords: [
            "receipt",
            "invoice books",
            "cartridges",
            "toner",
            "catridge",
            "ink cartridge",
            "printer cartridge",
            "CCTV",
            "camera",
            "internet",
            "Hp cartridge",
            "kyocera",
            "computer repairs",
            "photo shoot",
            "hard drives",
            "RAM",
            "laptops",
            "computer",
          ],
          usdKeyword: [
            `for eco`,
            `for ecocash`,
            `USD available`,
            `for zipit`,
            `US for`,
            `for bank transfer`,
            `US for`,
            `usd available`,
            `ìnternal transfer`,
          ],
        };

        if (keywords.businessKeywords.includes(word)) {
          console.log(msg);
          //do stuff
          client.sendMessage(me, `Business keyword alert:\n ${msg.body} from `);
        }
      });

      if (chat.isGroup) {
        //grpOwner = chat.owner.user;
      } else {
        let from = msg.from;

        let senderNotifyName = await contact.pushname;

        if (!contactModel.find({ number: from })) {
          const newContact = new contactModel({
            notifyName: senderNotifyName,
            number: from,
            serialisedNumber: contact.id._serialised,
            isBlocked: contact.isBlocked,
          });
          newContact.save().then(() => console.log("saved"));
        }

        chat.sendSeen();
        // msg.reply("hi thank you");
      }
    });
  }
  //run when group is left
  else if (arg1 == "group-leave") {
    client.on("group_leave", (notification) => {
      console.log(notification);
      // User has left or been kicked from the group.

      /* client.sendMessage(
          user,
          `We are sorry to see you leave our group , May you indly share wy you decided to leave`
        ); */
      //client.sendMessage(me,`User ${notification.id.participant} just left  the group`);
    });
  } else if (arg1 == "group-join") {
    client.on("group_join", (notification) => {
      console.log(notification);
      // User has joined or been added to the group.
      console.log("join", notification);
      /*  client.sendMessage(
          notification.id.participant,
          `welcome to ${}}Here are the group rules for your convenience.... \n`
        )  */
      // notification.reply("User joined.");
    });
  } else if (arg1 == "before" && arg2 == "after") {
    client.on("message_revoke_everyone", async (after, before) => {
      // Fired whenever a message is deleted by anyone (including you)
      console.log(after); // message after it was deleted.
      if (before) {
        console.log(before); // message before it was deleted.
      } else {
        client.sendMessage(me, `this message was deleted${before.body}`);
      }
    });
  }
};

module.exports = clientOn;
