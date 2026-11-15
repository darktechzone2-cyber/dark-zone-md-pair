// ─── Verified pairing-code request ─────────────────────────────────────────────
// WHY THIS EXISTS: Baileys' sock.requestPairingCode() is fire-and-forget. It
// sends the companion_hello (link_code_companion_reg) and returns the code
// WITHOUT waiting for WhatsApp to accept it. When the server rejects the
// registration (iq 400 — the same failure that killed pairing on Vercel and
// on the DP Fetcher), the code is dead, but it is still shown — and the user
// wastes a pairing attempt typing a code WhatsApp never registered, getting
// "Couldn't link device" on their phone.
//
// This module sends the IDENTICAL stanza (same fields, same browser
// identity ['Ubuntu','Edge','20.04'], same key derivation) through
// sock.query(), which awaits the server's answer:
//   - accepted  -> the code is real; safe to show.
//   - rejected (iq error, e.g. 400) -> fresh code + fresh keys, retry.
//   - unknown (timeout / connection issue) -> show the code (best effort,
//     same as the old behaviour; the server may still have accepted it).
// After 3 rejections we return { ok:false } so the caller can fail honestly
// (show the QR instead) rather than displaying a dead code.
import crypto from 'node:crypto';
import {
  aesEncryptCTR,
  bytesToCrockford,
  derivePairingCodeKey,
  getCompanionPlatformId,
  jidEncode,
  S_WHATSAPP_NET,
} from '@whiskeysockets/baileys';

const BROWSER = ['Ubuntu', 'Edge', '20.04'];

export async function requestVerifiedPairingCode(sock, state, saveCreds, number, opts = {}) {
  const maxTries = opts.maxTries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  const queryTimeoutMs = opts.queryTimeoutMs ?? 10000;
  const log = opts.log || (() => {});

  for (let n = 1; n <= maxTries; n++) {
    const code = bytesToCrockford(crypto.randomBytes(5));
    state.creds.pairingCode = code;
    state.creds.me = { id: jidEncode(number, 's.whatsapp.net'), name: '~' };
    try { saveCreds(); } catch { /* ignore */ }

    // Same key derivation as Baileys' generatePairingKey().
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const key = await derivePairingCodeKey(code, salt);
    const ciphered = aesEncryptCTR(state.creds.pairingEphemeralKeyPair.public, key, iv);
    const wrapped = Buffer.concat([salt, iv, ciphered]);

    // Same stanza as Baileys' requestPairingCode(), sent via query() so the
    // server's answer (result or iq error) is awaited.
    const node = {
      tag: 'iq',
      attrs: { to: S_WHATSAPP_NET, type: 'set', id: sock.generateMessageTag(), xmlns: 'md' },
      content: [{
        tag: 'link_code_companion_reg',
        attrs: { jid: state.creds.me.id, stage: 'companion_hello', should_show_push_notification: 'true' },
        content: [
          { tag: 'link_code_pairing_wrapped_companion_ephemeral_pub', attrs: {}, content: wrapped },
          { tag: 'companion_server_auth_key_pub', attrs: {}, content: state.creds.noiseKey.public },
          { tag: 'companion_platform_id', attrs: {}, content: getCompanionPlatformId(BROWSER) },
          { tag: 'companion_platform_display', attrs: {}, content: `${BROWSER[1]} (${BROWSER[0]})` },
          { tag: 'link_code_pairing_nonce', attrs: {}, content: '0' },
        ],
      }],
    };

    try {
      await sock.query(node, queryTimeoutMs);
      log(`pairing code accepted by WhatsApp (try ${n}/${maxTries})`);
      return { ok: true, code };
    } catch (e) {
      // assertNodeErrorFree throws a Boom with `data` = the numeric iq
      // error code (e.g. 400) when the server explicitly rejects us.
      const serverCode = e && typeof e.data === 'number' ? e.data : null;
      log(`pairing code rejected by WhatsApp: ${serverCode ?? (e && e.message ? e.message : e)} (try ${n}/${maxTries})`);
      if (serverCode === null) {
        // Unknown outcome — the server may still have accepted it.
        return { ok: true, code };
      }
      if (n < maxTries) await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  return { ok: false, error: 'WhatsApp rejected the pairing code.' };
}
