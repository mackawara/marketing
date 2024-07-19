const { OpenAI } = require("openai")
const configuration = {
    organization: process.env.OPENAI_ORGANISATION_KEY,
    apiKey: process.env.OPENAI_API_KEY,
};

const openai = new OpenAI(configuration)

module.exports = openai;