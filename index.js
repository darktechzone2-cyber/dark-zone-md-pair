// ─── Dark Zone MD — public pairing website ───────────────────────────────────
// Jawad MD / Prince MD model: a visitor enters their WhatsApp number, gets an
// 8-digit pairing code, links the device in WhatsApp, and receives a
// SESSION_ID ("DZMD~...") — shown on the page AND sent to their own WhatsApp.
//
// Privacy by design: every pairing runs in a unique temp dir that is DELETED
// when pairing finishes or expires (~2 min). The site keeps no database,
// retains no credentials, and never logs numbers, codes or session ids.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { encodeSessionId } from './lib/session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: 'silent' });

const HOW_TO_USE =
  '🤖 *Dark Zone MD — your SESSION_ID*\n\n' +
  'Paste it into the bot\'s config.js as SESSION_ID (or set it as the ' +
  'SESSION_ID environment variable on your bot hosting), then start the bot — ' +
  'it connects directly, no pairing needed.\n\n' +
  '⚠️ Keep it secret: anyone with this ID can log in as this WhatsApp number.\n\n' +
  'SESSION_ID:\n';

function maskNumber(num) {
  return num.slice(0, 3) + '***' + num.slice(-2);
}

// ─── Real Baileys pairing connector ──────────────────────────────────────────
// Drives one pairing attempt: opens a socket on attempt.dir, requests the
// pairing code, and reports back through hooks. Reconnects after WhatsApp's
// post-pairing "restart required" close so the session completes.
async function baileysPairing(attempt, hooks) {
  const { state, saveCreds } = await useMultiFileAuthState(attempt.dir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }));
  let reconnects = 0;

  const connect = () => {
    if (attempt.status === 'done' || attempt.status === 'expired') return;
    const sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ['Dark Zone MD Pair', 'Chrome', '1.1.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    attempt.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
      if (u.connection === 'open') hooks.onOpen(sock);
      if (u.connection === 'close') {
        if (attempt.status === 'done' || attempt.status === 'expired') return;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        // After a successful pair WhatsApp closes with restartRequired (515)
        // and expects one reconnect with the now-registered creds.
        if ((code === DisconnectReason.restartRequired || state.creds.registered) && reconnects < 3) {
          reconnects++;
          setTimeout(connect, 1000);
          return;
        }
        hooks.onError('Connection closed before pairing completed. Please try again.');
      }
    });
    if (!state.creds.registered) {
      setTimeout(async () => {
        if (attempt.status !== 'starting' || attempt.code) return;
        try {
          const code = await sock.requestPairingCode(attempt.number);
          hooks.onCode(code);
        } catch {
          hooks.onError('Could not request a pairing code for that number. Check the number and try again.');
        }
      }, 1500);
    }
  };

  attempt.disposeSocket = () => {
    try { attempt.sock?.end?.(); } catch { /* ignore */ }
    try { attempt.sock?.ws?.close?.(); } catch { /* ignore */ }
  };
  connect();
}

// ─── Server factory (startPairing injectable for tests) ──────────────────────
export function createPairServer(deps = {}) {
  const cfg = {
    ttlMs: deps.ttlMs ?? 120_000,          // pairing attempt lifetime ~2 min
    keepMs: deps.keepMs ?? 120_000,        // keep finished record for polling
    cleanupDelayMs: deps.cleanupDelayMs ?? 5_000, // after open: close + delete dir
    rateMax: deps.rateMax ?? 6,            // pair requests per IP per window
    rateWindowMs: deps.rateWindowMs ?? 10 * 60_000,
    tmpBase: deps.tmpBase || os.tmpdir(),
    startPairing: deps.startPairing || baileysPairing,
    sweepMs: deps.sweepMs ?? 5_000,
  };

  const attempts = new Map();  // id -> attempt
  const byNumber = new Map();  // number -> id (one active pairing per number)
  const ipHits = new Map();    // ip -> [timestamps]

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Minimal helmet-style security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'dark-zone-md-pair' }));

  function dispose(a) {
    try { a.disposeSocket?.(); } catch { /* ignore */ }
    try { fs.rmSync(a.dir, { recursive: true, force: true }); } catch { /* ignore */ }
    if (byNumber.get(a.number) === a.id) byNumber.delete(a.number);
  }

  function finish(a, status, error) {
    if (a.status === 'done') return;
    a.status = status;
    if (error) a.error = error;
    a.finishedAt = Date.now();
    if (a.rejectCode) a.rejectCode(new Error(error || status));
    dispose(a);
  }

  async function handleOpen(a, sock) {
    if (a.status === 'done') return;
    try {
      const raw = fs.readFileSync(path.join(a.dir, 'creds.json'), 'utf8');
      const sid = encodeSessionId(raw);
      a.sessionId = sid;
      a.status = 'done';
      a.finishedAt = Date.now();
      if (a.resolveCode) a.resolveCode(a.code);
      console.log('pair done for', maskNumber(a.number));
      try {
        await sock.sendMessage(a.number + '@s.whatsapp.net', { text: HOW_TO_USE + sid });
      } catch { /* the page still shows the SESSION_ID */ }
    } catch {
      finish(a, 'error', 'Paired, but reading the session failed. Please try again.');
      return;
    }
    // Close the socket and delete the temp auth dir — nothing is retained.
    setTimeout(() => dispose(a), cfg.cleanupDelayMs);
  }

  function startAttempt(number) {
    // One active pairing per number: a new request supersedes the old one.
    const oldId = byNumber.get(number);
    if (oldId && attempts.has(oldId)) finish(attempts.get(oldId), 'expired');

    const id = crypto.randomBytes(9).toString('hex');
    const dir = fs.mkdtempSync(path.join(cfg.tmpBase, 'dzmd-pair-'));
    const a = {
      id, number, dir,
      status: 'starting', code: null, sessionId: null, error: null,
      sock: null, disposeSocket: null,
      createdAt: Date.now(), expiresAt: Date.now() + cfg.ttlMs, finishedAt: null,
      resolveCode: null, rejectCode: null,
    };
    a.codePromise = new Promise((resolve, reject) => { a.resolveCode = resolve; a.rejectCode = reject; });
    a.codePromise.catch(() => { /* rejection is surfaced via /status */ });
    attempts.set(id, a);
    byNumber.set(number, id);

    const hooks = {
      onCode(code) {
        if (a.status !== 'starting') return;
        a.code = code;
        a.status = 'code';
        a.resolveCode(code);
      },
      onOpen(sock) { handleOpen(a, sock); },
      onError(msg) { finish(a, 'error', msg); },
    };

    Promise.resolve()
      .then(() => cfg.startPairing(a, hooks))
      .catch(() => finish(a, 'error', 'Pairing failed to start. Please try again.'));
    console.log('pair started for', maskNumber(number));
    return a;
  }

  function rateLimited(ip) {
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < cfg.rateWindowMs);
    hits.push(now);
    ipHits.set(ip, hits);
    return hits.length > cfg.rateMax;
  }

  app.post('/pair', async (req, res) => {
    if (rateLimited(req.ip || 'unknown')) {
      return res.status(429).json({ ok: false, error: 'Too many pairing attempts from your network. Please wait a few minutes and try again.' });
    }
    let digits = String((req.body && req.body.number) || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!/^\d{10,15}$/.test(digits)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid WhatsApp number with country code (10–15 digits, e.g. 923001234567).' });
    }
    const a = startAttempt(digits);
    // Wait briefly for the pairing code; if it is slow, the page polls /status.
    const code = await Promise.race([
      a.codePromise.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 45_000)),
    ]);
    if (a.status === 'error') return res.status(502).json({ ok: false, id: a.id, error: a.error });
    return res.json({ ok: true, id: a.id, code: code || a.code || null });
  });

  app.get('/status/:id', (req, res) => {
    const a = attempts.get(req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: 'Pairing session not found or already cleaned up.' });
    const out = { ok: true, status: a.status };
    if (a.code) out.code = a.code;
    if (a.status === 'done') out.sessionId = a.sessionId;
    if (a.error) out.error = a.error;
    return res.json(out);
  });

  // Expiry / cleanup sweep
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const a of attempts.values()) {
      if ((a.status === 'starting' || a.status === 'code') && now > a.expiresAt) {
        console.log('pair expired for', maskNumber(a.number));
        finish(a, 'expired', 'Pairing timed out (2 minutes). Please request a new code.');
      } else if (a.finishedAt && now > a.finishedAt + cfg.keepMs) {
        if (byNumber.get(a.number) === a.id) byNumber.delete(a.number);
        attempts.delete(a.id);
      }
    }
    for (const [ip, hits] of ipHits) {
      if (!hits.some((t) => now - t < cfg.rateWindowMs)) ipHits.delete(ip);
    }
  }, cfg.sweepMs);
  sweep.unref();

  return { app, attempts, close: () => clearInterval(sweep) };
}

// ─── Entry point ─────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { app } = createPairServer();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n🤖 Dark Zone MD Pair — listening on port ${port}`);
    console.log('   Open the page, enter a WhatsApp number, get a pairing code.\n');
  });
}
