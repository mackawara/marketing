# marketing
A whatsapp bot for marketting products

## Run health/restart test mode

Use a separate startup command that enables faster heartbeat logging for client stability testing:

```bash
npm run start:health-test
```

Optional custom heartbeat interval (milliseconds):

```bash
CLIENT_HEARTBEAT_MS=5000 npm run start:health-test
```

## Run with PM2 (auto-restart on failure)

Start normal mode with restart policy:

```bash
npm run pm2:start
```

Start health test mode via PM2:

```bash
npm run pm2:start:health-test
```

Useful PM2 commands:

```bash
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
npm run pm2:delete
```

Persist PM2 across server reboot:

```bash
pm2 save
pm2 startup
```

Notes:
- Restart behavior is configured in `ecosystem.config.js` (`autorestart`, `min_uptime`, `max_restarts`, and backoff delay).
- Exit code `130` is usually manual interruption (`Ctrl+C`), not a crash.

## TroubleShooting
Protocol Runtime error
# Fixes
 Delete .wwebjs_cache and _wwebjs_auth folders
## Any other issues
Visit Issues  page on github
https://github.com/pedroslopez/whatsapp-web.js/issues

Watchout for version changes