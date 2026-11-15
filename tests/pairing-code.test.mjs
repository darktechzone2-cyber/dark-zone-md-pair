// ─── Verified pairing-code request — unit tests ───────────────────────────────
// The real WhatsApp server is NOT touched: the socket's query() is faked.
// Covers: accepted code (stanza shape + creds), 400 rejection with retries,
// retry-then-accept, and unknown-outcome (timeout) best effort.
import crypto from 'node:crypto';
import { requestVerifiedPairingCode } from '../lib/pairing-code.js';

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

function makeState() {
  return {
    creds: {
      pairingEphemeralKeyPair: { public: crypto.randomBytes(32), private: crypto.randomBytes(32) },
      noiseKey: { public: crypto.randomBytes(32), private: crypto.randomBytes(32) },
      pairingCode: null,
      me: null,
    },
  };
}

const NUMBER = '923001234567';

// ─── 1. Accepted: stanza shape + creds ───────────────────────────────────────
{
  const state = makeState();
  let saved = 0;
  const seen = [];
  const sock = {
    generateMessageTag: () => 'tag-1',
    query: async (node) => { seen.push(node); return { tag: 'iq', attrs: { type: 'result' } }; },
  };
  const r = await requestVerifiedPairingCode(sock, state, () => saved++, NUMBER, { retryDelayMs: 5 });
  check('accepted returns ok + an 8-char code', r.ok === true && typeof r.code === 'string' && r.code.length === 8);
  check('creds.pairingCode is the returned code', state.creds.pairingCode === r.code);
  check('creds.me is the number JID', state.creds.me && state.creds.me.id === NUMBER + '@s.whatsapp.net');
  check('saveCreds called', saved === 1);
  check('query called once', seen.length === 1);
  const node = seen[0];
  check('stanza is iq/md set', node.tag === 'iq' && node.attrs.xmlns === 'md' && node.attrs.type === 'set' && node.attrs.to === '@s.whatsapp.net');
  const reg = node.content[0];
  check('companion_hello registration', reg.tag === 'link_code_companion_reg' && reg.attrs.stage === 'companion_hello' && reg.attrs.jid === NUMBER + '@s.whatsapp.net');
  const tags = Object.fromEntries(reg.content.map((c) => [c.tag, c.content]));
  check('platform id is Chrome (1)', tags['companion_platform_id'] === '1');
  check('platform display is Chrome (Windows)', tags['companion_platform_display'] === 'Chrome (Windows)');
  check('nonce is 0', tags['link_code_pairing_nonce'] === '0');
  check('wrapped ephemeral key is 32+16+32 bytes', Buffer.isBuffer(tags['link_code_pairing_wrapped_companion_ephemeral_pub']) && tags['link_code_pairing_wrapped_companion_ephemeral_pub'].length === 80);
}

// ─── 2. Rejected 3x (400): retries with fresh codes, then honest failure ────
{
  const state = makeState();
  const codes = [];
  let calls = 0;
  const sock = {
    generateMessageTag: () => 'tag-' + (++calls),
    query: async () => {
      codes.push(state.creds.pairingCode);
      const err = new Error('Bad Request');
      err.data = 400;
      throw err;
    },
  };
  const r = await requestVerifiedPairingCode(sock, state, () => {}, NUMBER, { retryDelayMs: 5, log: () => {} });
  check('3x rejected returns ok:false', r.ok === false);
  check('query retried 3 times', calls === 3);
  check('each retry used a fresh code', codes.length === 3 && new Set(codes).size === 3);
}

// ─── 3. Retry then accept ────────────────────────────────────────────────────
{
  const state = makeState();
  let calls = 0;
  const sock = {
    generateMessageTag: () => 'tag-' + (++calls),
    query: async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('Bad Request');
        err.data = 400;
        throw err;
      }
      return { tag: 'iq', attrs: { type: 'result' } };
    },
  };
  const r = await requestVerifiedPairingCode(sock, state, () => {}, NUMBER, { retryDelayMs: 5, log: () => {} });
  check('retry-then-accept returns ok:true', r.ok === true && typeof r.code === 'string');
  check('query called twice (1 reject + 1 accept)', calls === 2);
}

// ─── 4. Unknown outcome (timeout, no error code): best effort, show code ────
{
  const state = makeState();
  let calls = 0;
  const sock = {
    generateMessageTag: () => 'tag-1',
    query: async () => { calls++; throw new Error('Query timed out'); },
  };
  const r = await requestVerifiedPairingCode(sock, state, () => {}, NUMBER, { retryDelayMs: 5, log: () => {} });
  check('timeout returns ok:true with the code (best effort)', r.ok === true && typeof r.code === 'string');
  check('no retry on unknown outcome', calls === 1);
}

console.log(failures === 0 ? '\nALL PAIRING-CODE TESTS PASSED' : '\n' + failures + ' PAIRING-CODE TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
