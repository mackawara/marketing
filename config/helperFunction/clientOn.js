const { client } = require('../wwebjsConfig');
const config = require('../../config');
const timeDelay = require('../../index');
const isProductEnquiry = require('../isProductEnquiry');
const { advertService } = require('../../services/advertServices');
const busGroupsModel = require('../../models/busContacts');
const fs = require('fs/promises');
const isGroup = inputString => {
  if (typeof inputString !== 'string') {
    throw new Error('Input must be a string');
  }
  return inputString.slice(-5) === '@g.us';
};

const clientOn = async (arg1, arg2) => {
  try{
  const me = config.ME;
  // let groupName, grpDescription;
  if (arg1 == 'message') {
    client.on(`message`, async msg => {
      const chat = await msg.getChat();
      const contact = await msg.getContact();
      const msgBody = msg.body;
      //admin messages
      if (msg.from == me) {
        if (msg.hasMedia && msg.body.toLowerCase() == 'advert') {
          console.log('message advert received');
          
          const media = await msg.downloadMedia();
          const uniqueName = new Date().valueOf().toString().slice('5');
          await fs.writeFile(
            `./services/assets/image${uniqueName}.jpeg`,
            media.data,
            'base64',
            function (err) {
              if (err) {
                console.log(err);
              }
            }
          );
        } else if (msg.body.toLowerCase() === 'broadcast') {
          advertService();
        }
      }
      const keywords = {
        businessKeywords: [
          'receipt',
          'invoice books',
          'cartridges',
          'toner',
          'catridge',
          'ink cartridge',
          'printer cartridge',
          'CCTV',
          'VSAT',
          'camera',
          'internet',
          'Hp cartridge',
          'kyocera',
          'computer repairs',
          'photo shoot',
          'hard drives',
          'RAM',
          'cctv',
          'laptops',
          'computer',
          'join',
          'Follow this link to join my WhatsApp group',
        ],
      };

      if (chat.isGroup) {
        const contact = await busGroupsModel.findOne({
          serialisedNumber: chat.id._serialized,
        });

        console.log(contact);
        if (!contact) {
          const newContact = new busGroupsModel({
            number: contact.number,
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
        /*   msgBody.split(' ').forEach(word => {
          if (keywords.businessKeywords.includes(word)) {
            client.sendMessage(
              me,
              `Business keyword alert:\n ${msg.body} from Group ${chat.name} from ${msg.author}`
            );
          }
        }); */
        //grpOwner = chat.owner.user;
      } else if (
        !chat.isGroup && // isgroupis not working
        !isGroup(msg.from) &&
        !msg.isStatus &&
        !msg.isGif &&
        !msg.hasMedia
      ) {
        // this is a message to the inbox whic could be an enquiry
        chat.markUnread();
        timeDelay(3000);
        const inhouse = [process.env.ME, process.env.VENTA];
        const isInhouseNumber = inhouse.includes(chat.id) ? true : false;
        const number = await chat.getContact();

        if (!isInhouseNumber) {
          const isEnquiry = await isProductEnquiry(msgBody);
          if (isEnquiry) {
            client.sendMessage(
              process.env.NOTHANDO,
              `🛑*Enquiry*🛑:\n Please respond to this enquiry\n\n*${msg.body}*\n from ${chat.name} number ${number.id.user}`
            );
            client.sendMessage(
              process.env.VENTAGROUP,
              `🛑*Enquiry*🛑:\n Please respond to this enquiry\n\n*${msg.body}*\n from ${chat.name} number ${number.id.user}`
            );
          }
        }
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
  } /* else if (arg1 == 'before' && arg2 == 'after') {
    client.on('message_revoke_everyone', async (after, before) => {
      // Fired whenever a message is deleted by anyone (including you)
      console.log(after); // message after it was deleted.
      if (before) {
        console.log(before); // message before it was deleted.
      } else {
        client.sendMessage(me, `this message was deleted${before.body}`);
      }
    });
  } */}catch(err){console.log(err)}
};

module.exports = clientOn;
