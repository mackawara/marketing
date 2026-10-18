const { client, MessageMedia } = require("../config/wwebjsConfig");
const config = require("../config");
const openai = require("./openai");
const { createChannelIdResolver } = require("./channelId");
const { generateChannelPost } = require("./channelContent");
const { businessClock } = require("./statusScheduler");

/**
 * Default channel description for tech updates
 */
const DEFAULT_TECH_DESCRIPTION = "🔧 Your go-to source for technology updates and solutions! Get expert tips on CCTV systems, WiFi optimization, Starlink connectivity, LTE networks, AI innovations, and more. Stay informed with troubleshooting guides, latest tech trends, and professional insights to keep your systems running smoothly.";

/**
 * Service to manage WhatsApp Channels
 */
const resolveChannelId = createChannelIdResolver({
  configuredId: config.CHANNEL_ID,
  inviteCode: config.CHANNEL_INVITE_CODE,
  getChannelByInviteCode: (code) => client.getChannelByInviteCode(code),
});

const channelService = {
  resolveChannelId,

  /**
   * Reusable function to create a new channel
   * @param {string} title - The name of the channel (e.g., "Tech Updates & Solutions")
   * @param {Object} options - Additional options for the channel
   * @param {string} [options.description] - The description of the channel (defaults to tech description)
   * @returns {Promise<object|string>} - The result of the channel creation
   */
  async createChannel(title, options = {}) {
    // Use default tech description if none provided
    if (!options.description) {
      options.description = DEFAULT_TECH_DESCRIPTION;
    }
    try {
      console.log(`Attempting to create channel: ${title}`);
      const result = await client.createChannel(title, options);
      console.log("Channel creation result:", result);
      
      if (typeof result === "string") {
        console.error("Failed to create channel:", result);
        return result;
      }

      console.log("Channel created successfully:", result.nid._serialized);
      
      // Add config.ME as admin to the channel
      try {
        const channelId = result.nid._serialized;
        const clientInfo = await client.info;
        const clientNumber = clientInfo.wid._serialized;
        
        // If config.ME is different from the client's number, send admin invite
        if (config.ME && config.ME !== clientNumber) {
          await client.sendChannelAdminInvite(config.ME, channelId, {});
          console.log(`Admin invite sent to ${config.ME}`);
        } else {
          console.log(`Channel creator ${clientNumber} is automatically the owner`);
        }
      } catch (adminError) {
        console.error("Could not add admin to channel:", adminError.message);
      }
      
      return result;
    } catch (error) {
      console.error("Error in createChannel:", error);
      throw error;
    }
  },

  /**
   * Post a technical issue or update to a specific channel
   * @param {string} channelId - The ID of the channel
   * @param {string} content - The message content
   * @param {string} [mediaPath] - Optional path to an image or file
   */
  async postUpdate(channelId, content, mediaPath = null) {
    try {
      console.log(`Posting update to channel ${channelId}: ${content}`);
      
      // For channels, use sendMessage directly instead of getChatById
      if (mediaPath) {
        const media = MessageMedia.fromFilePath(mediaPath);
        return await client.sendMessage(channelId, media, { caption: content });
      }

      return await client.sendMessage(channelId, content);
    } catch (error) {
      console.error("Error posting update to channel:", error);
      throw error;
    }
  },

  /**
   * Update channel details like description or profile picture
   * @param {string} channelId 
   * @param {Object} updates - { description, title, profilePicPath }
   */
  async updateChannel(channelId, updates = {}) {
    try {
      const channel = await client.getChatById(channelId);
      
      if (updates.title) await channel.setSubject(updates.title);
      if (updates.description) await channel.setDescription(updates.description);
      if (updates.profilePicPath) {
        const media = MessageMedia.fromFilePath(updates.profilePicPath);
        await channel.setProfilePicture(media);
      }
      
      return true;
    } catch (error) {
      console.error("Error updating channel:", error);
      throw error;
    }
  },

  /**
   * Generates and posts one short tech message (Wi-Fi, security, WhatsApp tips,
   * tech news or AI) on demand. Scheduled posting goes through
   * services/channelPublisher.js, which uses the same generator.
   * @param {number} [rotationIndex] - Topic rotation position (random if omitted)
   */
  async postRandomTechTip(rotationIndex = Math.floor(Math.random() * 1000)) {
    const channelId = await resolveChannelId();
    if (!channelId) {
      throw new Error("CHANNEL_ID (or CHANNEL_INVITE) not set in config.");
    }
    const { text, topic } = await generateChannelPost({
      openai,
      rotationIndex,
      date: businessClock(new Date()).date,
    });
    await this.postUpdate(channelId, text);
    console.log(`Channel ${topic} post published.`);
    return { text, topic };
  }
};

module.exports = channelService;
