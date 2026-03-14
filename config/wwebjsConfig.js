const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const config = require("../config");
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
    executablePath: config.NODE_ENV === "production" ? "/usr/bin/chromium-browser" : undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Critical for Docker - prevents /dev/shm issues
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
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

let isRestarting = false;
let lastRestartAt = 0;
let lastRestartReason = 'none';
let heartbeatIntervalRef = null;
const RESTART_COOLDOWN_MS = 20000;

const ensureClientReady = async () => {
  try {
    const state = await client.getState();
    return state && state !== 'UNPAIRED' && state !== 'UNPAIRED_IDLE';
  } catch (error) {
    return false;
  }
};

const restartClient = async (reason = 'unknown') => {
  const now = Date.now();

  if (isRestarting) {
    console.log(`[client-restart] Exit already in progress. Reason: ${reason}`);
    return;
  }

  if (now - lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log(`[client-restart] Cooldown active. Skipping exit. Reason: ${reason}`);
    return;
  }

  isRestarting = true;
  lastRestartAt = now;
  lastRestartReason = reason;

  console.warn(`[client-restart] Exiting for PM2 restart. Reason: ${reason}`);
  try {
    await client.destroy();
  } catch (err) {
    console.warn('[client-restart] client.destroy() failed:', err.message);
  }
  process.exit(1);
};

const getClientHealth = async () => {
  let state = 'UNKNOWN';
  try {
    state = await client.getState();
  } catch (error) {
    state = 'UNAVAILABLE';
  }

  return {
    state,
    isRestarting,
    lastRestartAt,
    lastRestartReason,
  };
};

const startupHealthCheck = (delayMs = 60000) => {
  setTimeout(async () => {
    const ready = await ensureClientReady();
    if (!ready) {
      console.warn('[startup-health] Client not ready after startup delay — triggering restart.');
      restartClient('startup-health-check');
    } else {
      console.log('[startup-health] Client ready.');
    }
  }, delayMs);
};

const startClientHealthHeartbeat = (intervalMs = Number(process.env.CLIENT_HEARTBEAT_MS || 60000)) => {
  if (heartbeatIntervalRef) {
    return;
  }

  heartbeatIntervalRef = setInterval(async () => {
    const health = await getClientHealth();
    const lastRestartAtIso = health.lastRestartAt ? new Date(health.lastRestartAt).toISOString() : 'never';
    console.log(
      `[client-health] state=${health.state} restarting=${health.isRestarting} lastRestartReason=${health.lastRestartReason} lastRestartAt=${lastRestartAtIso}`
    );

    if (health.state === 'UNAVAILABLE' && !health.isRestarting) {
      console.warn('[client-health] Client unavailable — triggering recovery restart.');
      restartClient('heartbeat-recovery');
    }
  }, intervalMs);
};

client.on('disconnected', reason => {
  restartClient(`disconnected:${reason}`);
});

client.on('change_state', state => {
  if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE' || state === 'CONFLICT') {
    restartClient(`change_state:${state}`);
  }
});

client.on('auth_failure', msg => {
  restartClient(`auth_failure:${msg}`);
});

module.exports = {
  client,
  MessageMedia,
  restartClient,
  ensureClientReady,
  getClientHealth,
  startClientHealthHeartbeat,
  startupHealthCheck,
};
