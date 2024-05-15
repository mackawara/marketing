const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
console.log(process.env.NODE_ENV);
const wwebVersion='2.2412.54'
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath:
      process.env.NODE_ENV == 'local' ? null : process.env.EXECPATH,
    handleSIGINT: true,
    //ignoreDefaultArgs: ['--enable-automation'],
    ignoreDefaultArgs: ['--disable-dev-shm-usage'], ignoreHTTPSErrors: true ,
    headless: process.env.NODE_ENV == 'local' ? null : true,
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
  webVersionCache: {
    type: 'remote',
    remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`,//https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.htm
}, 
});

module.exports = { client, MessageMedia };
