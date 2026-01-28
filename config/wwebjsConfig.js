const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
console.log(process.env.NODE_ENV);

// Determine if running in Docker (via environment variable set in Dockerfile)
const isDocker = process.env.PUPPETEER_EXECUTABLE_PATH ? true : false;

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.WWEBJS_AUTH_PATH || "./.wwebjs_auth",
  }),
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 0,
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
  puppeteer: {
    // Use system Chromium in Docker, otherwise let Puppeteer use its bundled Chrome
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Critical for Docker - prevents /dev/shm issues
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // Critical for Docker stability
      "--disable-gpu",
      "--disable-web-security",
      "--disable-extensions",
      "--disable-default-apps",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--safebrowsing-disable-auto-update",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-features=IsolateOrigins,site-per-process",
      "--log-level=3",
    ],
  },
});

module.exports = { client, MessageMedia };
