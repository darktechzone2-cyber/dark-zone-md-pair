// ─── Dark Zone MD Pair — SESSION_ID format ───────────────────────────────────
// Identical format to the bot's lib/session.js: "DZMD~" + base64(creds.json).
// The pairing site only ENCODES (it hands the id to the user); decode lives
// here too so the round-trip can be unit-tested.

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
    if (!creds.noiseKey || !creds.signedIdentityKey || !creds.me) return null;
    return creds;
  } catch {
    return null;
  }
}
