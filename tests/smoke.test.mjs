// ─── Dark Zone MD Host — end-to-end smoke test ─────────────────────────────────
// Boots the real host server with a FAKE pairing connector and a FAKE bot
// child. Proves: pair → code+qr → open → session saved → bot child spawned
// with the right env → /health reports the bot. No real WhatsApp connection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { createPairServer } = await import('../index.js');
const { createHost } = await import('../lib/host.js');

const FAKE_CREDS = {
  noiseKey: { private: 'fake', public: 'fake' },
  signedIdentityKey: { private: 'fake', public: 'fake' },
  signedPreKey: { keyPair: {}, signature: 'fake', keyId: 1 },
  registrationId: 42,
  advSecretKey: 'fake',
  me: { id: '923001234567:5@s.whatsapp.net', name: 'Smoke Tester' },
  registered: true,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

function makeFake() {
  return async function fakePairing(attempt, hooks) {
    attempt.disposeSocket = () => {};
    setTimeout(() => hooks.onQr('fake-qr-ref'), 10);
    setTimeout(() => hooks.onCode('ABCD-EFGH'), 20);
    setTimeout(() => {
      fs.writeFileSync(path.join(attempt.dir, 'creds.json'), JSON.stringify(FAKE_CREDS));
      const fakeSock = { sendMessage: async () => ({ key: { id: 'X1' } }) };
      hooks.onOpen(fakeSock);
    }, 40);
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dzmd-smoke-'));
const sessionsDir = path.join(tmp, 'sessions');
const dataDir = path.join(tmp, 'data');
const logs = [];
const host = createHost({
  sessionsDir, dataDir,
  botEntry: path.join(__dirname, 'fake-bot.mjs'),
  botCwd: __dirname,
  maxBots: 6,
  log: (...a) => logs.push(a.join(' ')),
});
const srv = createPairServer({ startPairing: makeFake(), host, cleanupDelayMs: 150, sweepMs: 100 });
const http = await new Promise((resolve) => { const s = srv.app.listen(0, () => resolve(s)); });
const base = 'http://127.0.0.1:' + http.address().port;

try {
  let r = await fetch(base + '/pair', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: '923001234567' }),
  });
  const pairBody = await r.json();
  check('POST /pair returns code + qr', r.status === 200 && pairBody.code === 'ABCD-EFGH' && pairBody.qr === 'fake-qr-ref');

  // Poll /status until the pairing completes and the bot starts.
  let status = null;
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    r = await fetch(base + '/status/' + pairBody.id);
    status = await r.json();
    if (status.status === 'done') break;
  }
  check('GET /status reaches done', status && status.status === 'done');
  check('SESSION_ID issued on done', typeof status.sessionId === 'string' && status.sessionId.startsWith('DZMD~'));
  check('botStarted is true on done', status.botStarted === true);
  check('no botError on done', !status.botError);

  // The fake child needs a moment to print.
  await sleep(500);
  check('bot child spawned with the paired number', logs.some((l) => l.includes('FAKE BOT STARTED owner=923001234567')));
  check('bot child got the session dir', logs.some((l) => l.includes('FAKE BOT session=' + path.join(sessionsDir, '923001234567'))));
  check('session persisted on disk', fs.existsSync(path.join(sessionsDir, '923001234567', 'creds.json')));

  r = await fetch(base + '/health');
  const health = await r.json();
  check('GET /health reports 1 bot', health.ok === true && health.bots === 1 && health.hosted === 1);
} finally {
  host.close();
  srv.close();
  await new Promise((res) => http.close(res));
  await sleep(200);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : '\n' + failures + ' SMOKE TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
