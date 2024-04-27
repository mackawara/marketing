const { client } = require('../wwebjsConfig');
const config = require('../../config');
const timeDelay=require('../../index')

const busGroupsModel = require('../../models/busContacts');
const clientOn = async (arg1, arg2, MessageMedia) => {
  const me = config.ME;
  //const { MessageMedia } = require("whatsapp-web.js");

  // let groupName, grpDescription;
  if (arg1 == 'message') {
    client.on(`message`, async msg => {
      const chat = await msg.getChat();
      const contact = await msg.getContact();

      const msgBody = msg.body;
      const keywords = {
        businessKeywords: [
          'receipt',
          'invoice books',
          'cartridges',
          'toner',
          'catridge',
          'ink cartridge',
          'printer cartridge',
          'CCTV','VSAT',
          'camera',
          'internet',
          'Hp cartridge',
          'kyocera',
          'computer repairs',
          'photo shoot',
          'hard drives',
          'RAM','cctv',
          'laptops',
          'computer',
          'join','Follow this link to join my WhatsApp group' 
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

      if (chat.isGroup) {
        const contacts = await busGroupsModel.find({
          serialisedNumber: chat.id._serialized,
        });

        if (!contacts.length > 0) {
          const newContact = new busGroupsModel({
            number: contacts.number,
            serialisedNumber: chat.id._serialized,
            notifyName: chat.name,
            number: chat.id.user,
            group: chat.name,
            date: new Date().toISOString().slice(0, 10),
          });
          try {
            newContact.save();
          } catch (err) {
            console.log(err.data);
          }
        }
        msgBody.split(' ').forEach(word => {
          if (keywords.businessKeywords.includes(word)) {
            client.sendMessage(
              me,
              `Business keyword alert:\n ${msg.body} from Group ${chat.name} from ${msg.author}`
            );
          }
        });
        //grpOwner = chat.owner.user;
      } else if (
        !chat.isGroup &&
        !msg.isStatus &&
        !msg.isGif &&
        !msg.hasMedia && m
      ) {
timeDelay(3000)
msgBody.split(' ').forEach(word => {
  if (keywords.businessKeywords.includes(word)) {
    client.sendMessage(
      me,
      `Business keyword alert:\n ${msg.body} from Group ${chat.name} from ${msg.author}`
    );
  }
});
        let from = msg.from;

        let senderNotifyName = await contact.pushname;

        chat.sendSeen();
        // msg.reply("hi thank you");
      }
    });
  }
  //run when group is left
  else if (arg1 == 'group-join') {
    client.on('group_join', notification => {
      /*  client.sendMessage(
          notification.id.participant,
          `welcome to ${}}Here are the group rules for your convenience.... \n`
        )  */
      // notification.reply("User joined.");
    });
  } else if (arg1 == 'before' && arg2 == 'after') {
    client.on('message_revoke_everyone', async (after, before) => {
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
