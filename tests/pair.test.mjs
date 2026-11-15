// ─── Dark Zone MD Pair — local tests ─────────────────────────────────────────
// The Baileys connector is replaced with a fake: NO real WhatsApp connection
// is ever made. Covers: page serving, number validation, the pairing flow
// (code → open → SESSION_ID), SESSION_ID round-trip against BOTH this site's
// lib and the BOT's lib/session.js (format interop), WhatsApp delivery of
// the id, temp-dir deletion, one-pairing-per-number, and the rate limit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { createPairServer } = await import('../index.js');
const pairSession = await import('../lib/session.js');
const botSession = await import('../../dark-zone-md/lib/session.js');

const FAKE_CREDS = {
  noiseKey: { private: 'fake', public: 'fake' },
  signedIdentityKey: { private: 'fake', public: 'fake' },
  signedPreKey: { keyPair: {}, signature: 'fake', keyId: 1 },
  registrationId: 42,
  advSecretKey: 'fake',
  me: { id: '923001234567:5@s.whatsapp.net', name: 'Pair Tester' },
  registered: true,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

// Fake connector: code at 10ms, "connection open" at 40ms with creds on disk.
function makeFake(sentLog, { open = true } = {}) {
  return async function fakePairing(attempt, hooks) {
    attempt.disposeSocket = () => {};
    setTimeout(() => hooks.onCode('ABCD-EFGH'), 10);
    if (open) {
      setTimeout(() => {
        fs.writeFileSync(path.join(attempt.dir, 'creds.json'), JSON.stringify(FAKE_CREDS));
        const fakeSock = {
          sendMessage: async (jid, content) => { sentLog.push({ jid, content }); return { key: { id: 'X1' } }; },
        };
        hooks.onOpen(fakeSock);
      }, 40);
    }
  };
}

async function boot(deps) {
  const srv = createPairServer(deps);
  const http = await new Promise((resolve) => {
    const s = srv.app.listen(0, () => resolve(s));
  });
  return { ...srv, http, base: 'http://127.0.0.1:' + http.address().port };
}
async function shutdown(s) { s.close(); await new Promise((r) => s.http.close(r)); }

// ─── Server 1: main flow ─────────────────────────────────────────────────────
const sentLog = [];
const s1 = await boot({ startPairing: makeFake(sentLog), cleanupDelayMs: 150, sweepMs: 100 });

let r = await fetch(s1.base + '/');
check('GET / serves the pairing page', r.status === 200 && (await r.text()).includes('Dark Zone'));
r = await fetch(s1.base + '/logo.png');
check('GET /logo.png serves the logo', r.status === 200);
r = await fetch(s1.base + '/health');
check('GET /health ok', r.status === 200 && (await r.json()).ok === true);
r = await fetch(s1.base + '/status/does-not-exist');
check('GET /status/<unknown> → 404', r.status === 404);

for (const bad of ['abc', '12345', '', '+92 300', '1234567890123456']) {
  r = await fetch(s1.base + '/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: bad }),
  });
  check('POST /pair rejects ' + JSON.stringify(bad) + ' → 400', r.status === 400);
}

r = await fetch(s1.base + '/pair', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ number: '+92 300 1234567' }),
});
const pairBody = await r.json();
check('POST /pair valid number → 200 + code', r.status === 200 && pairBody.ok === true && pairBody.code === 'ABCD-EFGH');
const attempt = s1.attempts.get(pairBody.id);
check('attempt registered for the number', !!attempt && attempt.number === '923001234567');
const attemptDir = attempt.dir;

await sleep(250); // let the fake "open" + handleOpen complete
r = await fetch(s1.base + '/status/' + pairBody.id);
const status = await r.json();
check('GET /status → done', status.status === 'done');
check('SESSION_ID has DZMD~ prefix', typeof status.sessionId === 'string' && status.sessionId.startsWith('DZMD~'));

const viaPairLib = pairSession.decodeSessionId(status.sessionId);
check('round-trip via pair-site lib', !!viaPairLib && viaPairLib.me.id === FAKE_CREDS.me.id);
const viaBotLib = botSession.decodeSessionId(status.sessionId);
check('round-trip via BOT lib (format interop)', !!viaBotLib && viaBotLib.me.id === FAKE_CREDS.me.id);
const reEncoded = botSession.encodeSessionId(FAKE_CREDS);
check('bot-encoded id decodes in pair lib', !!pairSession.decodeSessionId(reEncoded));

check('SESSION_ID sent to the user\'s own WhatsApp', sentLog.length === 1 &&
  sentLog[0].jid === '923001234567@s.whatsapp.net' &&
  sentLog[0].content.text.includes(status.sessionId));

await sleep(400); // cleanupDelay 150ms + margin
check('temp auth dir deleted after pairing', !fs.existsSync(attemptDir));
await shutdown(s1);

// ─── Server 2: one active pairing per number ─────────────────────────────────
const s2 = await boot({ startPairing: makeFake([], { open: false }), sweepMs: 100 });
const post = (base) => fetch(base + '/pair', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ number: '923009999999' }),
}).then((x) => x.json());
const first = await post(s2.base);
const second = await post(s2.base);
check('second pairing supersedes the first', s2.attempts.get(first.id).status === 'expired' && second.id !== first.id);
await shutdown(s2);

// ─── Server 3: rate limit ────────────────────────────────────────────────────
const s3 = await boot({ startPairing: makeFake([], { open: false }), rateMax: 2 });
let lastStatus = 0;
for (let i = 0; i < 3; i++) {
  const rr = await fetch(s3.base + '/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: 'bad' }),
  });
  lastStatus = rr.status;
}
check('rate limit → 429 after limit', lastStatus === 429);
await shutdown(s3);

// ─── Server 4: qr gate plumbing ─────────────────────────────────────────────
// Fake connector that emits a qr first, then the code, then open.
function makeFakeQr() {
  return async function fakeQrPairing(attempt, hooks) {
    attempt.disposeSocket = () => {};
    setTimeout(() => hooks.onQr('fake-qr-ref-123'), 10);
    setTimeout(() => hooks.onCode('WXYZ-1234'), 20);
    setTimeout(() => {
      fs.writeFileSync(path.join(attempt.dir, 'creds.json'), JSON.stringify(FAKE_CREDS));
      const fakeSock = {
        sendMessage: async () => ({ key: { id: 'X2' } }),
      };
      hooks.onOpen(fakeSock);
    }, 40);
  };
}
const s4 = await boot({ startPairing: makeFakeQr(), cleanupDelayMs: 150, sweepMs: 100 });
r = await fetch(s4.base + '/pair', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ number: '923001111111' }),
});
const qrBody = await r.json();
check('POST /pair returns the qr for the QR fallback', r.status === 200 && qrBody.qr === 'fake-qr-ref-123');
await sleep(250);
r = await fetch(s4.base + '/status/' + qrBody.id);
const qrStatus = await r.json();
check('GET /status returns the qr while pairing', qrStatus.qr === 'fake-qr-ref-123');
await shutdown(s4);

// ─── Regression guard: browser identity ───────────────────────────────────────
// The custom 'Dark Zone MD Pair' device identity is a live suspect for
// WhatsApp's 400 on companion registration; the old working identity must stay.
const pairSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
check('browser identity is Ubuntu/Edge (old working identity)', pairSrc.includes("['Ubuntu', 'Edge', '20.04']"));
check('old custom device identity is gone', !pairSrc.includes("'Dark Zone MD Pair', 'Chrome'"));
check('code request is qr-gated (no fixed-timeout request)', !pairSrc.includes('}, 1500);') && pairSrc.includes('hooks.onQr'));

console.log(failures === 0 ? '\nALL PAIR TESTS PASSED' : '\n' + failures + ' PAIR TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
