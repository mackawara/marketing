require("dotenv").config()
const config = require("../config")
console.log(config.NODE_ENV)
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: config.NODE_ENV == "local" ? null : config.EXECPATH,// process.env.EXECPATH,
        //handleSIGINT: true,
        //ignoreDefaultArgs: ['--enable-automation'],
        headless: config.NODE_ENV == "local" ? false : true,
        args: [
            "--log-level=3", // fatal only
            "--start-maximized",
            "--no-default-browser-check",
            "--disable-infobars",
            "--disable-web-security",
            "--disable-site-isolation-trials",
            "--no-experiments",
            "--ignore-gpu-blacklist",
            "--ignore-certificate-errors",
            "--ignore-certificate-errors-spki-list",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-default-apps",
            "--enable-features=NetworkService",
            "--disable-setuid-sandbox",
            "--no-sandbox",
        ],
    },
});
module.exports = { client, MessageMedia };
