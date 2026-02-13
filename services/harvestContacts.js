const { client } = require("../config/wwebjsConfig");
const GroupContact = require("../models/contacts");
const config = require("../config");

/**
 * Harvests contacts from all WhatsApp groups.
 * Iterates through every group chat, reads participants,
 * resolves their contact info (pushname, phone number),
 * and upserts each contact into MongoDB with their groups in common.
 */
const harvestGroupContacts = async () => {
  try {
    console.log("🔍 Starting group contact harvest...");
    const chats = await client.getChats();
    const groupChats = chats.filter((chat) => chat.isGroup);
    console.log(`📋 Found ${groupChats.length} group chats`);

    // Map: contactId -> { pushname, phone, contactId, isBusiness, savedName, groups[] }
    const contactMap = new Map();

    for (const group of groupChats) {
      const groupName = group.name;
      const participants = group.participants || [];

      console.log(
        `👥 Processing group: "${groupName}" (${participants.length} participants)`
      );

      for (const participant of participants) {
        const participantId = participant.id._serialized;

        // Skip non-user participants (e.g. the group itself)
        if (!participantId.endsWith("@c.us")) continue;

        if (contactMap.has(participantId)) {
          // Already seen this contact, just add the group
          contactMap.get(participantId).groups.push(groupName);
        } else {
          // New contact placeholder — lookup later in parallel
          contactMap.set(participantId, {
            pushname: null,
            phone: null,
            contactId: participantId,
            isBusiness: false,
            savedName: null,
            groups: [groupName],
            needsLookup: true,
          });
        }
      }
    }

    const lookupTasks = [];
    for (const [contactId, data] of contactMap) {
      if (!data.needsLookup) continue;
      lookupTasks.push(
        (async () => {
          try {
            const contact = await client.getContactById(contactId);
            return {
              contactId,
              data: {
                pushname: contact.pushname || null,
                phone: contact.number,
                contactId: contactId,
                isBusiness: contact.isBusiness || false,
                savedName: contact.name || null,
              },
            };
          } catch (_) {
            const phone = contactId.replace("@c.us", "");
            return {
              contactId,
              data: {
                pushname: null,
                phone: phone,
                contactId: contactId,
                isBusiness: false,
                savedName: null,
              },
            };
          }
        })()
      );
    }

    if (lookupTasks.length) {
      const lookupResults = await Promise.allSettled(lookupTasks);
      for (const result of lookupResults) {
        if (result.status !== "fulfilled") continue;
        const existing = contactMap.get(result.value.contactId);
        if (!existing) continue;
        contactMap.set(result.value.contactId, {
          ...existing,
          ...result.value.data,
          needsLookup: false,
        });
      }
    }

    console.log(`💾 Saving ${contactMap.size} unique contacts to database...`);

    let saved = 0;
    let updated = 0;
    let errors = 0;

    const saveTasks = [];
    for (const [contactId, data] of contactMap) {
      saveTasks.push(
        GroupContact.findOneAndUpdate(
          { contactId: contactId },
          {
            $set: {
              pushname: data.pushname,
              phone: data.phone,
              contactId: data.contactId,
              isBusiness: data.isBusiness,
              savedName: data.savedName,
              groupsInCommon: data.groups,
              lastUpdated: new Date(),
            },
            $setOnInsert: {
              firstSeen: new Date(),
            },
          },
          { upsert: true, new: true }
        ).then((result) => ({ result, contactId }))
      );
    }

    const saveResults = await Promise.allSettled(saveTasks);
    for (const result of saveResults) {
      if (result.status === "fulfilled") {
        if (result.value.result?.createdAt) {
          saved++;
        } else {
          updated++;
        }
      } else {
        errors++;
        console.error(
          `Error saving contact ${result.reason?.contactId || "unknown"}:`,
          result.reason?.message || result.reason
        );
      }
    }

    const summary = `✅ Harvest complete: ${contactMap.size} contacts processed | ${saved} new | ${updated} updated | ${errors} errors`;
    console.log(summary);

    // Notify admin
    try {
      client.sendMessage(config.ME, summary);
    } catch (_) {}

    return { total: contactMap.size, saved, updated, errors };
  } catch (err) {
    console.error("❌ Error harvesting group contacts:", err);
    try {
      client.sendMessage(
        config.ME,
        `❌ Contact harvest failed: ${err.message}`
      );
    } catch (_) {}
  }
};

module.exports = { harvestGroupContacts };
