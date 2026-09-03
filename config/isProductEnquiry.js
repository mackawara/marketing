const openai = require('../services/openai');
const isProductEnquiry = async (prompt) => {
  const systemPrompt = {
    role: 'system',
    content: `you will receieve  a message and  you have to determine if it contains a business enquiry about a product or service. respond with true or false. if the message contains a business product/service enquiry respond with true. For example if the message is "do you sell cartridges" or "are you open now" respond with true. For any other type of message respond with false`,
  };
const messages=[]
  messages.push(systemPrompt);

  messages.push({ role: 'user', content: prompt });

  try {
    const response = await openai.chat.completions.create({
      // Was 'gpt-3.5', which has never been a valid model id — every call 404'd
      // and the catch below turned it into a silent "false".
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0,
      // A binary classifier needs one word, and the frequency/presence
      // penalties that were here actively discourage repeating "true"/"false".
      max_tokens: 5,
    });

    const answer = response?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') {
      console.warn('[isProductEnquiry] No usable completion returned.');
      return false;
    }

    // Tolerate trailing punctuation and casing ("True.", "TRUE").
    const isEnquiry = answer.trim().toLowerCase().startsWith('true');
    console.log(`[isProductEnquiry] "${prompt}" -> ${isEnquiry}`);
    return isEnquiry;
  } catch (error) {
    // Distinguish "the model said no" from "we never reached the model" —
    // previously both returned false and looked identical in the logs.
    console.error(
      `[isProductEnquiry] Classification failed (treating as not an enquiry): ${error.message}`
    );
    return false;
  }
};
module.exports = isProductEnquiry;
