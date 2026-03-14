const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth';
const CACHE_PATH = './.wwebjs_cache';

// Chrome lock files that prevent relaunch after an abrupt exit
const CHROME_LOCK_FILES = [
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
];

/**
 * Removes stale Chrome lock files from the wwebjs auth session dir.
 * Safe to call on every startup — preserves WhatsApp session/auth data.
 */
const cleanChromeLocks = () => {
  const sessionDir = path.join(AUTH_PATH, 'session');
  let cleaned = 0;

  for (const lockFile of CHROME_LOCK_FILES) {
    const lockPath = path.join(sessionDir, lockFile);
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
        console.log(`[cleanup] Removed stale lock file: ${lockFile}`);
        cleaned++;
      } catch (err) {
        console.warn(`[cleanup] Could not remove ${lockFile}:`, err.message);
      }
    }
  }

  if (cleaned === 0) {
    console.log('[cleanup] No stale Chrome lock files found.');
  }
};

/**
 * Kills any orphaned chromium processes left over from a previous crash.
 * Only runs on Linux (production server). Safe no-op on other platforms.
 */
const killOrphanedChrome = () => {
  if (process.platform !== 'linux') return;

  try {
    execSync('pkill -f chromium-browser || true', { stdio: 'ignore' });
    console.log('[cleanup] Killed orphaned chromium processes (if any).');
  } catch (_) {
    // pkill exits non-zero if no processes found — that's fine
  }
};

/**
 * Deletes the wwebjs_cache directory so the web version is re-fetched fresh.
 * Use this only when you want a full reset of the cached WhatsApp web version.
 * NOTE: Does NOT delete auth/session data — you will NOT need to re-scan QR.
 */
const cleanWwebjsCache = () => {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      fs.rmSync(CACHE_PATH, { recursive: true, force: true });
      console.log('[cleanup] Cleared wwebjs_cache.');
    } catch (err) {
      console.warn('[cleanup] Could not clear wwebjs_cache:', err.message);
    }
  }
};

/**
 * Full cleanup before client.initialize().
 * @param {object} options
 * @param {boolean} [options.clearCache=false] - Also wipe wwebjs_cache (forces web version re-fetch)
 */
const cleanupBeforeInit = ({ clearCache = false } = {}) => {
  console.log('[cleanup] Running pre-init cleanup...');
  killOrphanedChrome();
  cleanChromeLocks();
  if (clearCache) cleanWwebjsCache();
  console.log('[cleanup] Pre-init cleanup complete.');
};

module.exports = { cleanupBeforeInit, cleanChromeLocks, cleanWwebjsCache, killOrphanedChrome };
