module.exports = {
  apps: [
    {
      name: 'marketing',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // NOTE: this only measures the Node process. The memory in this app lives
      // in Chromium's child processes, which PM2 does not attribute here — so
      // this ceiling rarely fires. The real controls are the --js-flags and
      // --renderer-process-limit args in config/wwebjsConfig.js plus the
      // scheduled 03:00 recycle in index.js.
      max_memory_restart: '600M',
      // A cold start on ARM can take minutes; 60s meant a slow-but-healthy boot
      // counted as a failed one. And max_restarts:10 meant PM2 gave up entirely
      // during a bad patch, leaving the bot down until someone intervened.
      min_uptime: '180s',
      max_restarts: 50,
      exp_backoff_restart_delay: 10000,
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
      },
      env_health_test: {
        NODE_ENV: 'production',
        CLIENT_HEARTBEAT_MS: '5000',
      },
    },
  ],
};