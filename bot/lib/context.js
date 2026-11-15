// ─── Per-message command context ─────────────────────────────────────────────
// One code path for the real bot (index.js) and the test harness.

import config from '../config.js';
import { isSudo } from './store.js';
import {
  unwrapMessage, contentType, extractText, mentionedJids, quotedMessage, downloadMsg,
} from './media.js';
import { jidNum, numToJid } from './helpers.js';

export async function buildCtx(sock, msg, bodyInfo) {
  const chat = msg.key.remoteJid;
  const isGroup = chat.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant || chat : chat;
  const senderNum = jidNum(sender);
  const botJid = sock.user ? sock.user.id : '';
  const botNum = jidNum(botJid);
  const isOwner =
    senderNum === jidNum(config.OWNER_NUMBER) || msg.key.fromMe === true || isSudo(senderNum);

  const quoted = quotedMessage(msg);
  const mentioned = mentionedJids(msg);
  const { args = [], text = '', command = '' } = bodyInfo || {};

  // Group admin info (lazy, cached per message)
  let _meta = null;
  let _participants = [];
  async function loadGroup() {
    if (!isGroup || _meta) return;
    try {
      _meta = await sock.groupMetadata(chat);
      _participants = _meta.participants || [];
    } catch {
      _meta = { participants: [] };
      _participants = [];
    }
  }

  const ctx = {
    sock, msg, chat, sender, senderNum, isGroup, isOwner,
    args, text, q: text, command,
    prefix: bodyInfo && bodyInfo.prefix ? bodyInfo.prefix : config.PREFIX,
    quoted,
    mentioned,
    botJid, botNum,

    async groupMeta() { await loadGroup(); return _meta; },
    async participants() { await loadGroup(); return _participants; },
    async isAdminCheck() {
      await loadGroup();
      const p = _participants.find((x) => jidNum(x.id) === senderNum);
      return !!(p && p.admin);
    },
    async isBotAdminCheck() {
      await loadGroup();
      const p = _participants.find((x) => jidNum(x.id) === botNum);
      return !!(p && p.admin);
    },

    /** First target user: mentioned → quoted sender → number in args. */
    targetJid() {
      if (mentioned.length) return mentioned[0];
      if (quoted && quoted.participant) return quoted.participant;
      for (const a of args) {
        const j = numToJid(a);
        if (j && a.replace(/\D/g, '').length >= 7) return j;
      }
      return null;
    },

    quotedType() { return quoted ? contentType(quoted) : ''; },
    quotedText() { return quoted ? extractText(quoted) : ''; },

    async downloadQuoted() {
      if (!quoted) throw new Error('no quoted message');
      return downloadMsg(quoted);
    },
    async downloadSelf() {
      return downloadMsg(msg);
    },

    // ── send helpers ──────────────────────────────────────────────────────────
    async reply(textOut, opts = {}) {
      return sock.sendMessage(chat, { text: String(textOut) }, { quoted: msg, ...opts });
    },
    async sendText(jid, textOut) {
      return sock.sendMessage(jid, { text: String(textOut) });
    },
    async react(emoji) {
      try {
        return await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } });
      } catch { return null; }
    },
    async sendImage(src, caption = '') {
      const content = Buffer.isBuffer(src) ? { image: src } : { image: { url: src } };
      if (caption) content.caption = caption;
      return sock.sendMessage(chat, content, { quoted: msg });
    },
    async sendVideo(src, caption = '', gif = false) {
      const content = Buffer.isBuffer(src) ? { video: src } : { video: { url: src } };
      if (caption) content.caption = caption;
      if (gif) content.gifPlayback = true;
      return sock.sendMessage(chat, content, { quoted: msg });
    },
    async sendAudio(src, ptt = false) {
      const content = Buffer.isBuffer(src) ? { audio: src } : { audio: { url: src } };
      content.mimetype = 'audio/mpeg';
      if (ptt) content.ptt = true;
      return sock.sendMessage(chat, content, { quoted: msg });
    },
    async sendDocument(src, fileName = 'file', mimetype = 'application/octet-stream', caption = '') {
      const content = Buffer.isBuffer(src)
        ? { document: src, fileName, mimetype }
        : { document: { url: src }, fileName, mimetype };
      if (caption) content.caption = caption;
      return sock.sendMessage(chat, content, { quoted: msg });
    },
    async sendSticker(buffer) {
      return sock.sendMessage(chat, { sticker: buffer }, { quoted: msg });
    },
  };

  ctx.isAdmin = isGroup ? await ctx.isAdminCheck().catch(() => false) : false;
  ctx.isBotAdmin = isGroup ? await ctx.isBotAdminCheck().catch(() => false) : false;
  return ctx;
}
