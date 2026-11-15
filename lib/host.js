// ─── Dark Zone MD — bot host (multi-session) ─────────────────────────────────
// Owns one child Node process per paired WhatsApp number. Each child IS the
// Dark Zone MD bot (bot/index.js) with env overrides:
//   DZM_SESSION_DIR   — that number's persistent session dir (creds live here)
//   DZM_DATA_DIR      — that number's settings store
//   DZM_OWNER_NUMBER  — the paired number (owner of that bot)
// The host only ever handles decoded creds objects, never SESSION_ID strings:
// the pairing flow hands it the creds JSON, which it writes straight to the
// session dir. No credential, number or code is ever logged (masked only).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function maskNumber(num) {
  const s = String(num || '');
  return s.slice(0, 3) + '***' + s.slice(-2);
}

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 5000;

export function createHost(cfg = {}) {
  const sessionsDir = cfg.sessionsDir; // absolute, required
  const dataDir = cfg.dataDir; // absolute, required
  const botEntry = cfg.botEntry; // absolute path to bot/index.js
  const botCwd = cfg.botCwd; // absolute path to bot/
  const maxBots = cfg.maxBots ?? 6;
  const restartDelayMs = cfg.restartDelayMs ?? RESTART_DELAY_MS;
  const spawnFn = cfg.spawnFn || spawn;
  const log = cfg.log || (() => {});

  // number -> { child, restarts, startedAt, dead, stopping, timer, killTimer }
  const children = new Map();

  function sessionDirFor(number) { return path.join(sessionsDir, number); }
  function dataDirFor(number) { return path.join(dataDir, number); }

  function saveSession(number, credsJson) {
    const dir = sessionDirFor(number);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'creds.json'),
      typeof credsJson === 'string' ? credsJson : JSON.stringify(credsJson),
    );
    return dir;
  }

  function listSavedSessions() {
    try {
      return fs
        .readdirSync(sessionsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((n) => /^\d{10,15}$/.test(n))
        .filter((n) => {
          try {
            const c = JSON.parse(fs.readFileSync(path.join(sessionsDir, n, 'creds.json'), 'utf8'));
            return !!c.registered;
          } catch { return false; }
        });
    } catch { return []; }
  }

  function hostedCount() { return listSavedSessions().length; }
  function isHosted(number) { return listSavedSessions().includes(number); }
  function isFull() { return hostedCount() >= maxBots; }
  function activeCount() { return [...children.values()].filter((c) => !c.dead).length; }

  function stopBot(number) {
    const rec = children.get(number);
    if (!rec) return false;
    rec.stopping = true;
    try { clearTimeout(rec.timer); } catch { /* ignore */ }
    try { rec.child.kill('SIGTERM'); } catch { /* ignore */ }
    rec.killTimer = setTimeout(() => {
      try { rec.child.kill('SIGKILL'); } catch { /* ignore */ }
    }, 5000);
    try { rec.killTimer.unref?.(); } catch { /* ignore */ }
    children.delete(number);
    return true;
  }

  function removeBot(number) {
    stopBot(number);
    try { fs.rmSync(sessionDirFor(number), { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(dataDirFor(number), { recursive: true, force: true }); } catch { /* ignore */ }
    return true;
  }

  function startBot(number) {
    const existing = children.get(number);
    if (existing && !existing.dead && existing.child) {
      stopBot(number); // re-pair supersedes the running bot
    }
    if (!isHosted(number) && isFull()) {
      return { ok: false, error: 'Host is full right now — all bot slots are taken. Please try again later.' };
    }
    if (!fs.existsSync(path.join(sessionDirFor(number), 'creds.json'))) {
      return { ok: false, error: 'No saved session for that number.' };
    }
    const restarts = existing ? existing.restarts : 0;
    const env = {
      ...process.env,
      DZM_SESSION_DIR: sessionDirFor(number),
      DZM_DATA_DIR: dataDirFor(number),
      DZM_OWNER_NUMBER: number,
    };
    const tag = `[bot ${maskNumber(number)}]`;
    let child;
    try {
      child = spawnFn('node', [botEntry], { cwd: botCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return { ok: false, error: 'Could not start the bot process.' };
    }
    const rec = { child, restarts, startedAt: Date.now(), dead: false, stopping: false, timer: null, killTimer: null };
    children.set(number, rec);
    child.stdout?.on('data', (d) => log(tag + ' ' + String(d).trimEnd()));
    child.stderr?.on('data', (d) => log(tag + ' ERR ' + String(d).trimEnd()));
    child.on('exit', (code) => {
      if (rec.stopping) return;
      if (code === 2) {
        // Logged out: the session is dead. Remove it so the number can re-pair.
        log(tag + ' logged out — removing the dead session.');
        removeBot(number);
        return;
      }
      if (rec.restarts < MAX_RESTARTS) {
        rec.restarts += 1;
        rec.dead = true;
        log(tag + ` exited (code ${code}) — restarting in 5s (attempt ${rec.restarts}/${MAX_RESTARTS}).`);
        rec.timer = setTimeout(() => startBot(number), restartDelayMs);
        try { rec.timer.unref?.(); } catch { /* ignore */ }
      } else {
        rec.dead = true;
        log(tag + ` exited (code ${code}) — giving up after ${MAX_RESTARTS} restarts.`);
      }
    });
    log(tag + ' started.');
    return { ok: true };
  }

  function reloadAll() {
    const saved = listSavedSessions();
    let started = 0;
    for (const n of saved) {
      if (startBot(n).ok) started++;
    }
    log(`host reload: ${started}/${saved.length} saved bot(s) started (max ${maxBots}).`);
    return started;
  }

  function close() {
    for (const n of [...children.keys()]) stopBot(n);
  }

  return {
    saveSession, listSavedSessions, hostedCount, isHosted, isFull,
    activeCount, startBot, stopBot, removeBot, reloadAll, close, maxBots,
  };
}
