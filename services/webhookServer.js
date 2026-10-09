const http = require('http');
const crypto = require('crypto');
const config = require('../config');
const { recordStandupWebhook } = require('./standuply');

const MAX_BODY_BYTES = 1024 * 1024;
const STANDUPLY_PATH = '/webhooks/standuply/';

// Standuply can't sign requests or add headers, so the secret has to live in
// the URL path. Hashing both sides gives timingSafeEqual equal-length inputs.
const isValidSecret = (candidate) => {
  const hash = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(candidate), hash(config.STANDUPLY_WEBHOOK_SECRET));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but leave the socket up long enough to send the 413.
        req.removeAllListeners('data');
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const reply = (res, status, text) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(text);
};

const handleRequest = async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/health') {
    return reply(res, 200, 'ok');
  }

  if (!pathname.startsWith(STANDUPLY_PATH) || !isValidSecret(pathname.slice(STANDUPLY_PATH.length))) {
    return reply(res, 404, 'not found');
  }

  // In case Standuply checks the URL when it is saved.
  if (req.method === 'GET') {
    return reply(res, 200, 'ok');
  }
  if (req.method !== 'POST') {
    return reply(res, 405, 'method not allowed');
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    res.setHeader('Connection', 'close');
    return reply(res, 413, err.message);
  }

  try {
    await recordStandupWebhook(body);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn(`[webhook] Standuply sent invalid JSON: ${body.slice(0, 500)}`);
      return reply(res, 400, 'invalid json');
    }
    console.error('[webhook] Failed to record Standuply webhook:', err);
    return reply(res, 500, 'error');
  }

  return reply(res, 200, 'ok');
};

// Started before the WhatsApp client, which can take minutes to come up —
// recording a submission only needs MongoDB.
const startWebhookServer = () => {
  const port = Number(config.PORT);

  if (!port || !config.STANDUPLY_WEBHOOK_SECRET) {
    console.warn('[webhook] PORT or STANDUPLY_WEBHOOK_SECRET not set — webhook server not started.');
    return;
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[webhook] Unhandled error:', err);
      if (!res.headersSent) reply(res, 500, 'error');
    });
  });

  // Unhandled, a server 'error' (e.g. the port already taken) reaches the
  // uncaughtException handler and takes the whole bot down with it.
  server.on('error', (err) => console.error('[webhook] Server error:', err.message));

  // Loopback only: Caddy is the public face and terminates TLS.
  server.listen(port, '127.0.0.1', () => console.log(`[webhook] Listening on 127.0.0.1:${port}`));
};

module.exports = { startWebhookServer };
