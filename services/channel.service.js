const { client, MessageMedia } = require("../config/wwebjsConfig");

/**
 * Default channel description for tech updates
 */
const DEFAULT_TECH_DESCRIPTION = "🔧 Your go-to source for technology updates and solutions! Get expert tips on CCTV systems, WiFi optimization, Starlink connectivity, LTE networks, AI innovations, and more. Stay informed with troubleshooting guides, latest tech trends, and professional insights to keep your systems running smoothly.";

/**
 * Service to manage WhatsApp Channels
 */
const channelService = {
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
      
      if (typeof result === "string") {
        console.error("Failed to create channel:", result);
        return result;
      }

      console.log("Channel created successfully:", result.id._serialized);
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
      const chat = await client.getChatById(channelId);
      
      if (!chat.isChannel) {
        throw new Error("The provided ID is not a Channel.");
      }

      if (mediaPath) {
        const media = MessageMedia.fromFilePath(mediaPath);
        return await chat.sendMessage(media, { caption: content });
      }

      return await chat.sendMessage(content);
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
  }
};

module.exports = channelService;
