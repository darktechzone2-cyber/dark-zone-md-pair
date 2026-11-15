// ─── Media download indirection ──────────────────────────────────────────────
// index.js injects Baileys' downloadMediaMessage at startup; the test harness
// injects a stub. Plugins/context only ever call downloadMsg().

let downloader = null;

export function setDownloader(fn) {
  downloader = fn;
}

export async function downloadMsg(msg, type = 'buffer') {
  if (!downloader) throw new Error('media downloader not initialised');
  return downloader(msg, type);
}

/** Unwrap view-once / ephemeral wrappers and return the inner message content. */
export function unwrapMessage(msg) {
  let m = msg && msg.message ? msg.message : msg;
  if (!m) return {};
  for (let i = 0; i < 5; i++) {
    const inner =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

/** The content-type key of a (possibly wrapped) message, e.g. 'imageMessage'. */
export function contentType(msg) {
  const m = unwrapMessage(msg);
  return Object.keys(m)[0] || '';
}

/** Extract plain text from any message shape. */
export function extractText(msg) {
  const m = unwrapMessage(msg);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

/** Mentioned JIDs in a message. */
export function mentionedJids(msg) {
  const m = unwrapMessage(msg);
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    {};
  return ctx.mentionedJid || [];
}

/** The quoted message object ({ key, message, ... }) or null. */
export function quotedMessage(msg) {
  const m = unwrapMessage(msg);
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    null;
  if (!ctx || !ctx.quotedMessage) return null;
  return {
    key: {
      remoteJid: msg.key.remoteJid,
      fromMe: false,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: ctx.quotedMessage,
    participant: ctx.participant,
  };
}
