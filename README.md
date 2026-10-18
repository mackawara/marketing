# marketing
A whatsapp bot for marketting products

## Scheduled WhatsApp Status adverts and Channel posts

Two workflows run at the same scheduled times, with no manual approval step:

| Workflow | What is published per scheduled time |
| --- | --- |
| **WhatsApp Status** | `STATUS_IMAGES_PER_BATCH` (default 5) photos/videos from the Google Drive advert folder |
| **WhatsApp Channel** | `CHANNEL_POSTS_PER_SLOT` (default 1) short AI-written tech message |

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLISH_TIMES` | `06:00,10:00,18:00` | Comma-separated `HH:MM` (24h) times, shared by both workflows |
| `PUBLISH_TIMEZONE` | `Africa/Harare` (UTC+2) | IANA timezone for the times above and all other cron jobs |
| `GOOGLE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID` | — | Existing advert folder; it must be readable with the API key |
| `CHANNEL_ID` | — | Channel id (`...@newsletter`). If unset, Channel posting is disabled with a warning |
| `OPENAI_API_KEY`, `OPENAI_ORGANISATION_KEY` | — | Existing OpenAI configuration, unchanged |
| `OPENAI_CHANNEL_MODEL` | `gpt-4o-mini` | Model for Channel posts; must support the Responses API and web search |
| `STATUS_IMAGES_PER_BATCH`, `CHANNEL_POSTS_PER_SLOT` | `5`, `1` | Items per scheduled time |

Invalid `PUBLISH_TIMES`/`PUBLISH_TIMEZONE` values are logged and replaced by the
defaults rather than silently producing a different schedule.

### Channel setup

1. Create the Channel once with `channelService.createChannel(title)`
   (`services/channel.service.js`) from the connected account, or reuse an existing
   Channel that account owns.
2. Put the returned `nid._serialized` value in `CHANNEL_ID` and restart.

**Capability limits:** `whatsapp-web.js` is an unofficial client. It can create
Channels and send text/image/video/poll messages to a Channel the connected account
owns or administers, and photo/video/text/audio to `status@broadcast`. It is not
the official WhatsApp Business API, so WhatsApp may restrict or ban accounts for
automation; `sendMessage` also returns `null` (treated as "send outcome unknown")
for unsupported content. Live behaviour must be validated on the deployed session.

A Channel post is recorded as sent only if the returned message carries a
`serverId` (the library returns the local message even when WhatsApp rejects the
post). Otherwise the slot is marked `uncertain` and not retried. If live runs mark
slots `uncertain` although the posts are visible, the installed library version is
not exposing `serverId` and this check needs adjusting.

### Channel content

`services/channelContent.js` holds the prompt and topic rotation. Topics rotate
deterministically: Wi-Fi, security, WhatsApp tips, tech news, AI (so 3 posts a day
cover every topic roughly every two days). The existing `services/openai.js` client
is reused. News and AI posts use OpenAI web search, are limited to the last 7 days,
and **must** end with a `Source:` link taken from the web-search citations (links the model writes itself are discarded); a news post with no usable source link is
rejected and retried instead of being published. Tips never carry links. A response
OpenAI reports as `incomplete` (e.g. cut off by the token limit) is never published.

### Status advert rotation

Eligible photos/videos are ordered by filename (then Drive id) and used round-robin.
Slot *N* of a run uses position `(days since 1970-01-01 × runs per day + run number) × STATUS_IMAGES_PER_BATCH + N`,
so every advert is used once before any repeats and the choice is predictable.
All of a run's files are chosen before its first post and the Drive file ids are
recorded on the run, so a retry or restart reposts exactly those adverts even if the
folder changed meanwhile (a file deleted from Drive is replaced by the rotation
pick). Folder changes apply from the next run.
Each slot is one image/video (no groups). If the folder is empty or inaccessible,
the slot fails and is retried; **nothing empty is ever posted**. Files are
downloaded and posted sequentially, so a batch is not visible at exactly the
scheduled time. The server, WhatsApp session, MongoDB and media source must be
available for on-time posting.

### Reliability and duplicates

Each scheduler checks every minute after the WhatsApp client becomes ready:

- If the bot starts late, it catches up every due run from that same day in
  schedule order. It does not backfill previous days. Deploying/restarting after
  06:00 can therefore publish immediately if due runs have no saved checkpoints;
  starting after 18:00 with no checkpoints publishes all of that day's runs.
- Progress is stored per run in MongoDB: Status in `statusruns`, Channel in
  `channelruns`. Record ids are `YYYY-MM-DD@HH:mm` (a `09:00` Status run keeps its
  legacy `YYYY-MM-DD` id). Recorded posts are skipped on restart, which is what
  prevents duplicates. Keep both collections across deployments. The previous
  09:00/13:00/16:30 records are untouched but no longer used.
- Preparation failures (Drive/download for Status, OpenAI/sourcing for Channel) get
  up to three attempts per run, at least five minutes apart. A failed run does not
  block later runs. The attempt is charged with the first durable
  sending/failure checkpoint; storage failures before that point do not consume
  the retry budget.
- A send that starts but produces no saved result is marked `uncertain` and is
  **not retried automatically**. Check WhatsApp before manually reposting. This
  avoids duplicates when a connection drops after acceptance. The next check also
  finds earlier `sending` records and marks them for review. It never republishes
  old runs.
- Run records end as `completed`, `needs_review` or `exhausted`, with each slot's
  message id or last error. Watch `[status-scheduler]` and `[channel-scheduler]`
  logs. A recorded message ID means the library returned a publish result; it does
  not confirm every viewer received it.

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
cover the 06:00/10:00/18:00 schedule boundaries, rotation, Channel content rules, restarts, independent batch retries,
uncertain outcomes, checkpoint failures and mention limits without publishing
anything. Live Channel/Status publishing, OpenAI web search and mention notifications require validation
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
