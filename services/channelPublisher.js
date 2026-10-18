const { generateChannelPost } = require('./channelContent');
const { businessClock } = require('./statusScheduler');

// whatsapp-web.js returns the locally created message even when the server
// rejects a Channel post (success: false); only an accepted post gets a serverId.
const serverAccepted = (message) => Boolean(message?.serverId ?? message?._data?.serverId);

const CHANNEL_POSTS_PER_SLOT = require('../config').CHANNEL_POSTS_PER_SLOT;

// Dependencies are injected so tests never call OpenAI or publish to WhatsApp.
// Follows the same checkpoint contract as the Status poster: persist BEFORE
// sending, and leave an ambiguous send as `sending` for the scheduler to quarantine.
const createChannelPublisher = ({
  generate = generateChannelPost, send, channelId, openai,
  postsPerRun = CHANNEL_POSTS_PER_SLOT, today = () => businessClock(new Date()).date,
  logger = console,
}) => async ({
  skipSlots = [],
  rotationBase = 0,
  onSlotSending = async () => {},
  onSlotSent = async () => {},
  onSlotFailed = async () => {},
} = {}) => {
  const skipped = new Set(skipSlots);
  const result = { sent: 0, failed: 0, uncertain: 0, skipped: skipped.size };
  if (!channelId) throw new Error('CHANNEL_ID is not set; run channelService.createChannel and configure it.');

  for (let slot = 0; slot < postsPerRun; slot++) {
    if (skipped.has(slot)) continue;

    let post;
    try {
      post = await generate({ openai, rotationIndex: rotationBase + slot, date: today() });
    } catch (error) {
      // Nothing was sent, so the slot is safe to retry.
      await onSlotFailed(slot, new Error(`Channel post generation failed: ${String(error?.message || error).slice(0, 200)}`));
      result.failed++;
      logger.error(`[channel] Slot ${slot + 1}: generation failed; eligible for retry.`);
      continue;
    }

    await onSlotSending(slot);
    let message;
    try {
      message = await send(channelId, post.text);
      if (!message?.id?._serialized) throw new Error('No channel message id returned.');
      // Without proof of server acceptance the post may or may not be live:
      // keep the slot uncertain rather than recording success or retrying.
      if (!serverAccepted(message)) throw new Error('Channel post was not confirmed as accepted by WhatsApp.');
    } catch (_) {
      result.uncertain++;
      logger.error(`[channel] Slot ${slot + 1}: send outcome unknown; check the Channel before resending.`);
      break;
    }

    await onSlotSent(slot, message.id._serialized);
    result.sent++;
    logger.log(`[channel] Slot ${slot + 1}: published ${post.topic} post.`);
  }

  logger.log(`[channel] Run: ${result.sent} recorded, ${result.failed} generation failures, ${result.uncertain} uncertain, ${result.skipped} skipped.`);
  return result;
};

let publisher;
const publishChannelPosts = async (options) => {
  if (!publisher) {
    const openai = require('./openai');
    const channelService = require('./channel.service');
    // Resolved before generating anything; throws (and the run retries) if the
    // Channel cannot be found yet.
    const channelId = await channelService.resolveChannelId();
    publisher = createChannelPublisher({
      openai,
      channelId,
      send: (id, text) => channelService.postUpdate(id, text),
    });
  }
  return publisher(options);
};

module.exports = { createChannelPublisher, publishChannelPosts, serverAccepted };
