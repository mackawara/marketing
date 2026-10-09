const { client } = require('../config/wwebjsConfig');
const config = require('../config');
const { safeSendMessage } = require('./advertServices');
const timeDelay = require('../UTILS/timeDelay');

// STAFF_NUMBERS is a comma-separated list of "Name=number" pairs, e.g.
// "Tendai Moyo=263771234567,Rudo=+263 77 765 4321". For standup nudges the
// name must match the person's Standuply name, or be their Slack member id
// (U0123ABCD); a bare number (no "Name=") still gets broadcast reminders.
// Numbers are international format; a full "...@c.us" id is accepted as-is.
const toChatId = (number) => {
  if (number.endsWith('@c.us')) return number;

  const digits = number.replace(/\D/g, '');
  // A leading 0 is a local number; guessing the country code would silently
  // message a stranger if the guess were wrong.
  if (!digits || digits.startsWith('0')) return null;

  return `${digits}@c.us`;
};

const getStaff = () => {
  const entries = (config.STAFF_NUMBERS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const staff = new Map();
  for (const entry of entries) {
    const [name, number] = entry.includes('=')
      ? entry.split('=').map((part) => part.trim())
      : [null, entry];
    const chatId = toChatId(number || '');

    if (chatId) {
      staff.set(chatId, { name: name || null, chatId });
    } else {
      console.warn(`[staff] Ignoring STAFF_NUMBERS entry "${entry}" — use Name=263771234567.`);
    }
  }

  return [...staff.values()];
};

// `message` is a string, or a function of the staff member for a personalised one.
const sendToStaff = async (staff, message, label = 'staff message') => {
  if (staff.length === 0) {
    console.warn(`[staff] No staff to send ${label} to — is STAFF_NUMBERS set?`);
    return { sent: 0, failed: 0 };
  }

  console.log(`[staff] Sending ${label} to ${staff.length} staff.`);
  const failed = [];

  for (const [i, member] of staff.entries()) {
    const text = typeof message === 'function' ? message(member) : message;
    try {
      await safeSendMessage(member.chatId, text);
    } catch (err) {
      failed.push(member.name || member.chatId);
      console.error(`[staff] Failed to send ${label} to ${member.chatId}:`, err.message);
    }

    if (i < staff.length - 1) {
      await timeDelay(Math.floor(Math.random() * 3 + 2) * 1000);
    }
  }

  // Otherwise a missed reminder only shows up in the server logs.
  if (failed.length > 0) {
    try {
      await client.sendMessage(
        config.ME,
        `⚠️ ${label} failed for ${failed.length}/${staff.length} staff:\n${failed.join('\n')}`,
      );
    } catch (err) {
      console.error('[staff] Could not notify admin of failures:', err.message);
    }
  }

  return { sent: staff.length - failed.length, failed: failed.length };
};

module.exports = { getStaff, sendToStaff };
