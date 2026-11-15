// ─── Dark Zone MD Host — manager tests ─────────────────────────────────────────
// The child bot process is replaced with a fake: no real bot ever runs.
// Covers: session save/list, spawn env, cap, supersede, logout cleanup,
// crash respawn (with a short injected delay), stop, and startup reload.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHost } from '../lib/host.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.killed = [];
  }
  kill(sig) { this.killed.push(sig || 'SIGTERM'); return true; }
  die(code) { this.emit('exit', code, null); }
}

function makeFakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const c = new FakeChild();
    calls.push({ cmd, args, opts, child: c });
    return c;
  };
  return { fn, calls };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dzmd-host-'));
const sessionsDir = path.join(tmp, 'sessions');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(sessionsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const fake = makeFakeSpawn();
const logs = [];
const host = createHost({
  sessionsDir, dataDir,
  botEntry: '/x/bot/index.js', botCwd: '/x/bot',
  maxBots: 1, restartDelayMs: 50,
  spawnFn: fake.fn, log: (...a) => logs.push(a.join(' ')),
});

const CREDS = JSON.stringify({ registered: true, me: { id: '923001111111:1@s.whatsapp.net' } });
const UNREG = JSON.stringify({ registered: false, me: null });

// ─── save + list ─────────────────────────────────────────────────────────────
host.saveSession('923001111111', CREDS);
host.saveSession('923002222222', UNREG);
check('saveSession writes creds.json', fs.existsSync(path.join(sessionsDir, '923001111111', 'creds.json')));
check('listSavedSessions finds only registered numbers', JSON.stringify(host.listSavedSessions()) === JSON.stringify(['923001111111']));
check('hostedCount counts saved sessions', host.hostedCount() === 1);
check('isHosted true for saved number', host.isHosted('923001111111') === true);
check('isFull at maxBots=1 with one hosted', host.isFull() === true);

// ─── startBot: env + cwd + entry ─────────────────────────────────────────────
let r = host.startBot('923001111111');
check('startBot ok for saved session', r.ok === true);
check('spawned node with the bot entry', fake.calls.length === 1 && fake.calls[0].cmd === 'node' && fake.calls[0].args[0] === '/x/bot/index.js');
check('spawn cwd is the bot dir', fake.calls[0].opts.cwd === '/x/bot');
const env = fake.calls[0].opts.env;
check('child env DZM_SESSION_DIR points at the session', env.DZM_SESSION_DIR === path.join(sessionsDir, '923001111111'));
check('child env DZM_DATA_DIR is per-number', env.DZM_DATA_DIR === path.join(dataDir, '923001111111'));
check('child env DZM_OWNER_NUMBER is the paired number', env.DZM_OWNER_NUMBER === '923001111111');
check('activeCount is 1 after start', host.activeCount() === 1);

// ─── startBot without a saved session ────────────────────────────────────────
r = host.startBot('923009999999');
check('startBot fails without a saved session', r.ok === false);

// ─── cap: a new (unsaved) number is refused when full ────────────────────────
r = host.startBot('923003333333');
check('startBot refuses a new number when the host is full', r.ok === false && /full/i.test(r.error || ''));

// ─── supersede: re-pairing the same number kills the old child ──────────────
const firstChild = fake.calls[0].child;
r = host.startBot('923001111111');
check('re-pair restarts the bot', r.ok === true && fake.calls.length === 2);
check('old child got SIGTERM on supersede', firstChild.killed.includes('SIGTERM'));
check('activeCount still 1 after supersede', host.activeCount() === 1);

// ─── crash respawn ───────────────────────────────────────────────────────────
const secondChild = fake.calls[1].child;
secondChild.die(1);
await sleep(150);
check('crash respawns the child', fake.calls.length === 3);
check('activeCount is 1 after respawn', host.activeCount() === 1);

// ─── logout (exit 2): session removed, no respawn ────────────────────────────
const thirdChild = fake.calls[2].child;
thirdChild.die(2);
await sleep(50);
check('logout removes the session dir', !fs.existsSync(path.join(sessionsDir, '923001111111')));
check('logout does not respawn', fake.calls.length === 3);
check('hostedCount drops to 0 after logout', host.hostedCount() === 0);
check('activeCount is 0 after logout', host.activeCount() === 0);

// ─── stop + reloadAll ────────────────────────────────────────────────────────
host.saveSession('923004444444', CREDS);
host.saveSession('923005555555', CREDS);
const n = host.reloadAll();
check('reloadAll starts all saved sessions', n === 2 && host.activeCount() === 2);
const target = fake.calls.find((c) => c.opts.env.DZM_OWNER_NUMBER === '923004444444');
host.stopBot('923004444444');
check('stopBot kills the child', !!target && target.child.killed.includes('SIGTERM'));
check('activeCount drops after stop', host.activeCount() === 1);
host.close();
check('close stops every child', host.activeCount() === 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nALL HOST TESTS PASSED' : '\n' + failures + ' HOST TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
