// ─── Dark Zone MD — SESSION_ID support ───────────────────────────────────────
// A SESSION_ID is "DZMD~" + base64(creds.json) — the format handed out by the
// Dark Zone MD pairing website (same model as Jawad MD / Prince MD session
// ids). When one is configured, the bot writes the decoded creds.json into
// the session folder before connecting, so it logs in with NO pairing code
// and NO QR. Absent/invalid → the normal console pairing / QR flow is used.

import fs from 'node:fs';
import path from 'node:path';

export const SESSION_PREFIX = 'DZMD~';

// creds (object or JSON string) → "DZMD~..." session id string.
export function encodeSessionId(credsJson) {
  const raw = typeof credsJson === 'string' ? credsJson : JSON.stringify(credsJson);
  return SESSION_PREFIX + Buffer.from(raw, 'utf8').toString('base64');
}

// "DZMD~..." → parsed creds object, or null when invalid. Never throws.
export function decodeSessionId(id) {
  if (!id || typeof id !== 'string') return null;
  const s = id.trim();
  if (!s.startsWith(SESSION_PREFIX)) return null;
  const b64 = s.slice(SESSION_PREFIX.length).replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!creds || typeof creds !== 'object') return null;
    // A real Baileys creds.json always carries these fields.
    if (!creds.noiseKey || !creds.signedIdentityKey || !creds.me) return null;
    return creds;
  } catch {
    return null;
  }
}

// Decode `id` and write it as creds.json inside `sessionDir`.
// Returns true when a session was written. Invalid id → writes nothing,
// returns false (caller falls back to pairing / QR). Never throws.
export function applySessionId(sessionDir, id) {
  const creds = decodeSessionId(id);
  if (!creds) return false;
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(creds));
    return true;
  } catch {
    return false;
  }
}
