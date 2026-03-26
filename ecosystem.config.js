module.exports = {
  apps: [
    {
      name: 'marketing',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      min_uptime: '60s',
      max_restarts: 10,
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