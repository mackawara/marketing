# marketing
A whatsapp bot for marketting products

## Daily WhatsApp statuses

The bot starts a batch of five photo/video statuses each day at **09:00, 13:00
and 16:30 Africa/Harare (CAT, UTC+2)**, for 15 statuses per day. Files are downloaded
and posted sequentially, so the whole batch is not visible at exactly the
scheduled time. The server, WhatsApp session, MongoDB and media source must be
available for on-time posting.

The scheduler checks every minute after the WhatsApp client becomes ready:

- If the bot starts late, it catches up every due batch from that same day in
  schedule order. It does not backfill previous days. Deploying/restarting after
  09:00 can therefore publish immediately if due batches have no saved checkpoints;
  starting after 16:30 with no checkpoints can publish all 15 statuses.
- Progress is stored independently for each batch in MongoDB's `statusruns`
  collection. The 09:00 batch retains its Harare date key (`YYYY-MM-DD`) so existing
  records prevent duplicate morning posts; later keys include their scheduled time
  (`YYYY-MM-DD@13:00` and `YYYY-MM-DD@16:30`). Recorded posts are skipped on restart.
  Keep this collection across deployments.
- Media preparation failures get up to three attempts per batch, at least five
  minutes apart. A batch waiting to retry or with exhausted attempts does not block
  later due batches. Drive's file list is refreshed on each attempt; only
  photos/videos are used for statuses. A failed refresh retains the previous cache.
  The attempt is charged with the first durable sending/media-failure checkpoint;
  storage failures before that point do not consume the publication retry budget.
- A send that starts but produces no saved result is marked `uncertain` and is
  **not retried automatically**. Check the status in WhatsApp before manually
  reposting it. This avoids duplicates when a connection drops after acceptance.
  Once the scheduler starts, its next check also finds earlier `sending` records
  and marks them for review, even before 09:00. It never republishes old runs.
- Batch records end as `completed`, `needs_review` or `exhausted`. Watch
  `[status-scheduler]` logs for failures. A recorded message ID means the library
  returned a publish result; it does not confirm every viewer received it.
  Once retries end, any uncertain send makes the batch `needs_review`, even when
  other posts have also exhausted their retries.

Run only **one bot instance per WhatsApp account/database**, as already configured
in `ecosystem.config.js`. The overlap guard is local to that process. Use PM2's
startup persistence below to recover after server reboots. Activate source changes
through the normal deployment/restart process; local tests do not activate them.

### Contact and group mentions (experimental)

WhatsApp documents up to **five contacts/groups combined per photo/video status**.
Individual mentions notify privately; group mentions create a notice in the group
and let its members view and reshare the status. Text/voice statuses cannot use
these mentions. See [WhatsApp's mention documentation](https://faq.whatsapp.com/2920968938041709)
and [status creation instructions](https://faq.whatsapp.com/643144237275579/).

The installed `whatsapp-web.js` accepts generic `mentions` and `groupMentions`
options, but their native Status notification behavior is **unverified**. The old
code attempted 50 contacts per status and incorrectly logged those as successful
mentions. Mentions now default to off. To try the library options, set
`STATUS_MENTIONS_ENABLED=true` in the server environment and restart the bot.
Enabling this uses real stored contacts and joined groups on the next batch;
validate notifications in a separate test account first.

When enabled, the bot samples the `groupContacts` collection and checks current
group membership. Each status gets at most five targets, preferring one group
plus four contacts where available. Targets are deduplicated and the connected
account is excluded; no target is repeated within that attempt. A retry can select
different targets. IDs are not appended to the public caption. Failed lookups do
not block ordinary status posting, and logs never claim mention delivery.

Until verified, use WhatsApp's native photo/video status composer for dependable
mention selection. Put the business name and a clear call to action directly on
the artwork so reshares still identify the business.

### Local verification

Run `npm test` (Node 20+). Tests use fake clocks, storage and WhatsApp clients; they
cover all three Harare schedule boundaries, restarts, independent batch retries,
uncertain outcomes, checkpoint failures and mention limits without publishing
anything. Live media publishing and mention notifications require validation
against the deployed WhatsApp session.

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
