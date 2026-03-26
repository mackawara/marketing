const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const config = require("../config");
const timeDelay = ms => new Promise(res => setTimeout(res, ms));
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
    protocolTimeout: 300000, // 5 minutes — Oracle ARM can be slow under load
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
let isClientReady = false; // set true only when 'ready' event fires
const RESTART_COOLDOWN_MS = 20000;

// Called from index.js when the 'ready' event fires
const setClientReady = (value) => {
  isClientReady = value;
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
  isClientReady = false;
  lastRestartAt = now;
  lastRestartReason = reason;

  console.warn(`[client-restart] Exiting for PM2 restart. Reason: ${reason}`);
  try {
    await client.destroy();
  } catch (err) {
    console.warn('[client-restart] client.destroy() failed:', err.message);
  }
  await timeDelay(6000); // Ensure all async cleanup is done before exit
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

// Startup health check — uses the ready event flag, not getState().
// null state during init is normal; only restart if ready never fired.
const startupHealthCheck = (delayMs = 120000) => {
  setTimeout(() => {
    if (!isClientReady) {
      console.warn('[startup-health] Client did not fire ready event within startup window — triggering restart.');
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
      `[client-health] state=${health.state} ready=${isClientReady} restarting=${health.isRestarting} lastRestartReason=${health.lastRestartReason} lastRestartAt=${lastRestartAtIso}`
    );

    // Only recover if client was previously ready but has now become unavailable.
    // Ignore null state — that's normal during initialization.
    if (isClientReady && health.state === 'UNAVAILABLE' && !health.isRestarting) {
      console.warn('[client-health] Client was ready but is now unavailable — triggering recovery restart.');
      restartClient('heartbeat-recovery');
    }
  }, intervalMs);
};

client.on('disconnected', reason => {
  // Only restart if the client was previously ready.
  // Ignore disconnected events during initialization — these are from the
  // previous session and would trigger an unnecessary restart loop.
  if (isClientReady) {
    restartClient(`disconnected:${reason}`);
  } else {
    console.log(`[client-event] Ignoring disconnected event during init. Reason: ${reason}`);
  }
});

client.on('change_state', state => {
  // Do NOT restart on CONFLICT — takeoverOnConflict:true handles it automatically.
  // Restarting on CONFLICT would cancel the takeover and create a restart loop.
  if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
    restartClient(`change_state:${state}`);
  } else {
    console.log(`[client-event] State changed: ${state}`);
  }
});

client.on('auth_failure', msg => {
  restartClient(`auth_failure:${msg}`);
});

module.exports = {
  client,
  MessageMedia,
  restartClient,
  setClientReady,
  getClientHealth,
  startClientHealthHeartbeat,
  startupHealthCheck,
};
