const { client } = require("../config/wwebjsConfig");
const GroupContact = require("../models/contacts");
const config = require("../config");
const mapLimit = require("../UTILS/mapLimit");

// Every lookup is a page.evaluate against one Chromium page, and every save is
// a round-trip to Mongo. Both were previously fired all at once.
const LOOKUP_CONCURRENCY = 5;
const SAVE_CONCURRENCY = 20;

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

    const idsNeedingLookup = [];
    for (const [contactId, data] of contactMap) {
      if (data.needsLookup) idsNeedingLookup.push(contactId);
    }

    if (idsNeedingLookup.length) {
      console.log(
        `🔎 Resolving ${idsNeedingLookup.length} contacts (${LOOKUP_CONCURRENCY} at a time)...`
      );

      const lookupResults = await mapLimit(
        idsNeedingLookup,
        LOOKUP_CONCURRENCY,
        async (contactId) => {
          // Derive the number from the id up front so it is always populated —
          // contact.number is undefined for contacts WhatsApp won't resolve,
          // and `phone` carries a unique index.
          const fallbackPhone = contactId.replace("@c.us", "");

          try {
            const contact = await client.getContactById(contactId);
            return {
              contactId,
              data: {
                pushname: contact.pushname || null,
                phone: contact.number || fallbackPhone,
                contactId: contactId,
                isBusiness: contact.isBusiness || false,
                savedName: contact.name || null,
              },
            };
          } catch (_) {
            return {
              contactId,
              data: {
                pushname: null,
                phone: fallbackPhone,
                contactId: contactId,
                isBusiness: false,
                savedName: null,
              },
            };
          }
        }
      );

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

    // Anything whose firstSeen lands at or after this mark was inserted by this
    // run. The previous check looked at `createdAt`, which this schema never
    // sets (no timestamps option), so "new" was always reported as 0.
    const runStartedAt = new Date();

    const saveResults = await mapLimit(
      [...contactMap.entries()],
      SAVE_CONCURRENCY,
      async ([contactId, data]) => {
        try {
          const doc = await GroupContact.findOneAndUpdate(
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
                firstSeen: runStartedAt,
              },
            },
            { upsert: true, new: true }
          );

          return { contactId, inserted: doc?.firstSeen >= runStartedAt };
        } catch (err) {
          // Rethrow with the id attached — a raw Mongo error carries no
          // indication of which contact it came from.
          throw Object.assign(err, { contactId });
        }
      },
      0
    );

    for (const result of saveResults) {
      if (result.status === "fulfilled") {
        if (result.value.inserted) {
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
      await client.sendMessage(config.ME, summary);
    } catch (err) {
      console.warn("[harvest] Could not send summary to admin:", err.message);
    }

    return { total: contactMap.size, saved, updated, errors };
  } catch (err) {
    console.error("❌ Error harvesting group contacts:", err);
    try {
      await client.sendMessage(
        config.ME,
        `❌ Contact harvest failed: ${err.message}`
      );
    } catch (notifyErr) {
      console.warn("[harvest] Could not notify admin of failure:", notifyErr.message);
    }
  }
};

module.exports = { harvestGroupContacts };
