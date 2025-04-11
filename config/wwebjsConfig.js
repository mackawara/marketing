const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
console.log(process.env.NODE_ENV);
//const wwebVersion='2.2412.54'
const client = new Client({
  authStrategy: new LocalAuth(),
  restartOnAuthFail: true,
  puppeteer: {
    executablePath:
      process.env.NODE_ENV == 'local' ? null : process.env.EXECPATH,
    handleSIGINT: true,
    //ignoreDefaultArgs: ['--enable-automation'],
    ignoreDefaultArgs: ['--disable-dev-shm-usage'], ignoreHTTPSErrors: true ,
    headless:true,// process.env.NODE_ENV == 'local' ? false : true,
    args: [
      '--log-level=3', // fatal only
      '--start-maximized',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-web-security',
      '--disable-site-isolation-trials',
      '--no-experiments',
      '--ignore-gpu-blacklist',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--enable-features=NetworkService',
      '--disable-setuid-sandbox',
      '--no-sandbox',
    ],
  },
});

module.exports = { client, MessageMedia };
