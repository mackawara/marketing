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
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.5,
      max_tokens: 300,
      frequency_penalty: 1.5,
      presence_penalty: 1.89,
    });
    //check if there is any response
    if (response) {
      if ('choices' in response) {
        console.log(response.choices[0]['message']['content'].toLowerCase())
       const isEnquiry= response.choices[0]['message']['content'].toLowerCase()==='true'?true:false
        console.log(`Message: ${prompt}, isEnquiry: ${isEnquiry}`)
        return isEnquiry;
      }
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
};
module.exports = isProductEnquiry;
