// ─── Dark Zone MD — public pairing website ───────────────────────────────────
// Jawad MD / Prince MD model: a visitor enters their WhatsApp number, gets an
// 8-digit pairing code, links the device in WhatsApp, and receives a
// SESSION_ID ("DZMD~...") — shown on the page AND sent to their own WhatsApp.
//
// Privacy: a pairing session is kept ONLY to run that number's bot on this
// host (sessions live under host-sessions/<number>/, deleted if the number
// logs out). The pairing attempt itself still runs in a unique temp dir that
// is DELETED when pairing finishes or expires. The user also gets their
// SESSION_ID, so they can move the bot to their own hosting any time.
// Numbers, codes and session ids are never logged.

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
import { createHost } from './lib/host.js';
import { requestVerifiedPairingCode } from './lib/pairing-code.js';

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
  let qrSeen = false;
  let codeRequested = false;
  let settleTimer = null;
  let noQrTimer = null;

  const connect = () => {
    if (attempt.status === 'done' || attempt.status === 'expired') return;
    const sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ['Windows', 'Chrome', '10.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    attempt.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
      console.log('[wa]', maskNumber(attempt.number), 'update:', u.connection || '', u.qr ? 'qr=yes' : '', u.lastDisconnect?.error?.output?.statusCode ?? '');
      if (u.qr && !qrSeen) {
        qrSeen = true;
        hooks.onQr(u.qr);
        // Settle ~2.5s after the handshake produces a qr (mirrors the old
        // working 3s-from-creation timing) before asking for the code.
        settleTimer = setTimeout(() => requestCode(sock), 2500);
      }
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
    if (!state.creds.registered && !qrSeen) {
      // If the handshake never produces a qr, fail honestly instead of
      // issuing a code WhatsApp never registered.
      noQrTimer = setTimeout(() => {
        if (!qrSeen && !codeRequested && attempt.status === 'starting') {
          hooks.onError('WhatsApp did not answer the pairing handshake. Please try again.');
        }
      }, 15000);
    }
  };

  async function requestCode(sock) {
    if (codeRequested || attempt.status !== 'starting') return;
    codeRequested = true;
    try {
      // Verified request: only a code WhatsApp accepted is shown. If the
      // server keeps rejecting the registration, fail honestly (the QR
      // below still works) instead of showing a dead code.
      const r = await requestVerifiedPairingCode(sock, state, saveCreds, attempt.number, {
        log: (...args) => console.log('[wa]', maskNumber(attempt.number), ...args),
      });
      if (r.ok) hooks.onCode(r.code);
      else hooks.onCodeFailed('WhatsApp is rejecting the pairing code right now. Please use the QR code below, or wait a few minutes and try again.');
    } catch {
      hooks.onError('Could not request a pairing code for that number. Check the number and try again.');
    }
  }

  attempt.disposeSocket = () => {
    try { clearTimeout(settleTimer); } catch { /* ignore */ }
    try { clearTimeout(noQrTimer); } catch { /* ignore */ }
    try { attempt.sock?.end?.(); } catch { /* ignore */ }
    try { attempt.sock?.ws?.close?.(); } catch { /* ignore */ }
  };
  connect();
}

// ─── Server factory (startPairing injectable for tests) ──────────────────────
export function createPairServer(deps = {}) {
  const cfg = {
    ttlMs: deps.ttlMs ?? 300_000,          // pairing attempt lifetime ~5 min (one-phone flow needs time)
    keepMs: deps.keepMs ?? 120_000,        // keep finished record for polling
    cleanupDelayMs: deps.cleanupDelayMs ?? 5_000, // after open: close + delete dir
    rateMax: deps.rateMax ?? 6,            // pair requests per IP per window
    rateWindowMs: deps.rateWindowMs ?? 10 * 60_000,
    tmpBase: deps.tmpBase || os.tmpdir(),
    startPairing: deps.startPairing || baileysPairing,
    sweepMs: deps.sweepMs ?? 5_000,
    host: deps.host || null, // bot host (null = pairing only, e.g. tests)
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

  app.get('/health', (req, res) => res.json({ ok: true, service: 'dark-zone-md-pair', bots: cfg.host ? cfg.host.activeCount() : 0, hosted: cfg.host ? cfg.host.hostedCount() : 0, maxBots: cfg.host ? cfg.host.maxBots : 0 }));

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
    let raw;
    try {
      raw = fs.readFileSync(path.join(a.dir, 'creds.json'), 'utf8');
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
    // Host the bot: persist the session, close the pairing socket FIRST
    // (so the bot child is the only live connection on these creds),
    // then start the bot. The SESSION_ID above still works on the user's
    // own hosting too — hosting here is a convenience, not a lock-in.
    if (cfg.host) {
      try {
        cfg.host.saveSession(a.number, raw);
        dispose(a);
        const r = cfg.host.startBot(a.number);
        a.botStarted = !!r.ok;
        a.botError = r.ok ? null : (r.error || 'Bot could not start.');
        console.log('bot start for', maskNumber(a.number), r.ok ? 'ok' : ('failed: ' + a.botError));
      } catch (e) {
        a.botStarted = false;
        a.botError = 'Bot could not start. Your SESSION_ID above still works on your own hosting.';
        console.log('bot start failed for', maskNumber(a.number), e && e.message ? e.message : e);
      }
    }
    // Safety net: close the socket and delete the temp auth dir if still there.
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
      status: 'starting', code: null, qr: null, sessionId: null, error: null, codeError: null, botStarted: null, botError: null,
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
      onCodeFailed(msg) {
        if (a.status !== 'starting') return;
        a.codeError = msg;
        a.resolveCode(null); // unblock the /pair POST; the QR stays live
      },
      onQr(qr) {
        if (a.status !== 'starting') return;
        a.qr = qr;
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
    if (cfg.host && cfg.host.isFull() && !cfg.host.isHosted(digits)) {
      return res.status(503).json({ ok: false, error: 'The host is full right now — all bot slots are taken. Please try again later.' });
    }
    const a = startAttempt(digits);
    // Wait briefly for the pairing code; if it is slow, the page polls /status.
    const code = await Promise.race([
      a.codePromise.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 45_000)),
    ]);
    if (a.status === 'error') return res.status(502).json({ ok: false, id: a.id, error: a.error });
    return res.json({ ok: true, id: a.id, code: code || a.code || null, qr: a.qr || null, codeError: a.codeError || null });
  });

  app.get('/status/:id', (req, res) => {
    const a = attempts.get(req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: 'Pairing session not found or already cleaned up.' });
    const out = { ok: true, status: a.status };
    if (a.code) out.code = a.code;
    if (a.qr) out.qr = a.qr;
    if (a.codeError) out.codeError = a.codeError;
    if (a.status === 'done') out.sessionId = a.sessionId;
    if (a.botStarted) out.botStarted = true;
    if (a.botError) out.botError = a.botError;
    if (a.error) out.error = a.error;
    return res.json(out);
  });

  // Expiry / cleanup sweep
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const a of attempts.values()) {
      if ((a.status === 'starting' || a.status === 'code') && now > a.expiresAt) {
        console.log('pair expired for', maskNumber(a.number));
        finish(a, 'expired', 'Pairing timed out (5 minutes). Please request a new code.');
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
  const host = createHost({
    sessionsDir: path.join(__dirname, 'host-sessions'),
    dataDir: path.join(__dirname, 'host-data'),
    botEntry: path.join(__dirname, 'bot', 'index.js'),
    botCwd: path.join(__dirname, 'bot'),
    maxBots: Number(process.env.HOST_MAX_BOTS || 6),
    log: (...args) => console.log(...args),
  });
  // Startup self-check: confirm the bot engine files are present (nested
  // paths are hard to verify from the hosting panel, so the host logs it).
  const botCheck = (() => {
    try {
      const libFiles = fs.readdirSync(path.join(__dirname, 'bot', 'lib')).filter((f) => f.endsWith('.js'));
      const pluginFiles = fs.readdirSync(path.join(__dirname, 'bot', 'plugins')).filter((f) => f.endsWith('.js'));
      return {
        entryOk: fs.existsSync(path.join(__dirname, 'bot', 'index.js')),
        lib: libFiles.length, plugins: pluginFiles.length,
      };
    } catch (e) {
      return { entryOk: false, lib: 0, plugins: 0, error: e.message };
    }
  })();
  console.log('bot engine check:', JSON.stringify(botCheck));
  const { app } = createPairServer({ host });
  host.reloadAll();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n🤖 Dark Zone MD Pair + Host — listening on port ${port}`);
    console.log('   Pair a number and its bot starts automatically.\n');
  });
}
