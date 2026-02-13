const { client, MessageMedia } = require("../config/wwebjsConfig");
const config = require("../config");

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
   * Generates and posts a random tech tip with AI-generated image
   */
  async postRandomTechTip() {
    const topics = [
      "WiFi coverage optimization",
      "WiFi signal strength improvement",
      "WiFi security best practices"
    ];

    try {
      // Check if channel ID is set
      if (!config.CHANNEL_ID) {
        throw new Error("CHANNEL_ID not set in config. Please create a channel first.");
      }

      // Randomly select a topic
      const topic = topics[Math.floor(Math.random() * topics.length)];
      console.log(`Generating tech tip about: ${topic}`);

      // Generate tip using OpenAI
      const tipResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a technical expert providing concise, practical tips. Generate ONE sentence only - actionable and professional."
          },
          {
            role: "user",
            content: `Generate a single sentence practical tip about ${topic}.`
          }
        ],
        max_tokens: 100,
        temperature: 0.8
      });

      const techTip = tipResponse.choices[0].message.content.trim();
      console.log(`Generated tip: ${techTip}`);

      // Create image prompt from the tip
      const imagePromptResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Convert tech tips into detailed DALL-E image prompts. Use professional, modern, tech-focused visual descriptions."
          },
          {
            role: "user",
            content: `Create a DALL-E prompt for this tech tip: "${techTip}". The image should be professional, modern, and technology-focused.`
          }
        ],
        max_tokens: 150
      });

      const imagePrompt = imagePromptResponse.choices[0].message.content.trim();
      console.log(`Image prompt: ${imagePrompt}`);

      // Generate image using DALL-E
      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: imagePrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard"
      });

      const imageUrl = imageResponse.data[0].url;
      console.log(`Image generated: ${imageUrl}`);

      // Download the image
      const imageBuffer = await fetch(imageUrl).then(res => res.arrayBuffer());
      const imagePath = path.join(__dirname, "../services/assets", `tech-tip-${Date.now()}.png`);
      await fs.writeFile(imagePath, Buffer.from(imageBuffer));

      // Format message with emoji based on topic
      let emoji = "💡";
      if (topic.includes("WiFi")) emoji = "📡";
      if (topic.includes("CCTV") || topic.includes("camera")) emoji = "📹";
      if (topic.includes("Alarm") || topic.includes("security")) emoji = "🔒";

      const message = `${emoji} *Tech Tip of the Day*\n\n${techTip}\n\n#TechTips #${topic.split(" ")[0]}`;

      // Post to channel
      await this.postUpdate(config.CHANNEL_ID, message, imagePath);
      console.log("Tech tip posted successfully!");

      // Clean up image file after posting
      setTimeout(async () => {
        try {
          await fs.unlink(imagePath);
        } catch (err) {
          console.error("Error cleaning up image:", err);
        }
      }, 5000);

      return { tip: techTip, imagePath };
    } catch (error) {
      console.error("Error generating/posting tech tip:", error);
      throw error;
    }
  }
};

module.exports = channelService;
