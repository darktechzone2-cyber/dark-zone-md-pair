// ─── Dark Zone MD — entry point ──────────────────────────────────────────────
// Baileys 7.x MD bot: pairing-code login (+ QR fallback), plugin loader,
// anti-delete / anti-link / anti-word enforcement, welcome/goodbye, chatbot.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import config from './config.js';
import { applySessionId } from './lib/session.js';
import { loadPlugins, dispatch, commands } from './lib/registry.js';
import { buildCtx } from './lib/context.js';
import { setDownloader } from './lib/media.js';
import { unwrapMessage, extractText } from './lib/media.js';
import {
  getSettings, groupSettings, getMode, getPrefix, storeMessage, getStoredMessage,
} from './lib/store.js';
import { aiChat } from './plugins/ai.js';

global.__dzmStart = Date.now();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: 'silent' });

setDownloader((msg, type) => downloadMediaMessage(msg, type || 'buffer', {}, { logger }));

const PLACEHOLDER_NUMBERS = ['', '9230000000000', '920000000000'];

async function start() {
  const loaded = await loadPlugins(path.join(__dirname, 'plugins'));
  console.log(`\n🤖 ${config.BOT_NAME} — ${loaded} commands loaded in ${new Set(commands.map((c) => c.category)).size} categories\n`);

  // ── SESSION_ID login (pairing-website model) ──────────────────────────────
  // If a SESSION_ID is configured (config.js field or SESSION_ID env var),
  // decode it into session/creds.json BEFORE the auth state is read — the
  // socket then connects already registered: no pairing prompt, no QR.
  // An invalid SESSION_ID is ignored with a warning and the normal
  // pairing-code / QR flow below takes over.
  const sessionId = String(config.SESSION_ID || process.env.SESSION_ID || '').trim();
  if (sessionId) {
    if (applySessionId(config.SESSION_DIR, sessionId)) {
      console.log('🔑 SESSION_ID found — connecting with the saved session (no pairing needed).');
    } else {
      console.log('⚠️  SESSION_ID is set but invalid — ignoring it; falling back to pairing-code / QR login.');
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }));

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Edge', '20.04'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // ── Pairing-code login (QR fallback if no valid owner number configured) ──
  if (!state.creds.registered) {
    const num = String(config.OWNER_NUMBER || '').replace(/\D/g, '');
    if (num && !PLACEHOLDER_NUMBERS.includes(num)) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(num);
          console.log('\n╔══════════════════════════════════════════╗');
          console.log('║  📲 PAIRING CODE: ' + code);
          console.log('║  WhatsApp → Settings → Linked devices    ║');
          console.log('║  → Link a device → Link with phone no.   ║');
          console.log('╚══════════════════════════════════════════╝\n');
        } catch (e) {
          console.log('Pairing code failed, use the QR code instead:', e.message);
        }
      }, 3000);
    } else {
      console.log('⚠️  OWNER_NUMBER is not set in config.js — falling back to QR login.');
      console.log('    Set OWNER_NUMBER and restart to use the pairing-code flow instead.');
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const qrcode = (await import('qrcode-terminal')).default;
        console.log('\n📷 Scan this QR with WhatsApp (Linked devices):\n');
        qrcode.generate(qr, { small: true });
      } catch {
        console.log('QR data (paste into a QR generator):', qr);
      }
    }
    if (connection === 'open') {
      console.log(`✅ ${config.BOT_NAME} connected as ${sock.user.id}`);
      // Auto-follow the Dark Tech Zone main newsletter channel
      try {
        await sock.newsletterFollow(config.NEWSLETTER_JID);
        console.log('📰 Auto-followed newsletter: ' + config.NEWSLETTER_JID);
      } catch (e) {
        console.log('Newsletter follow skipped:', e.message);
      }
      const s = getSettings();
      if (s.alwaysonline) { try { await sock.sendPresenceUpdate('available'); } catch { /* ignore */ } }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log('Connection closed, code:', code, loggedOut ? '(logged out — delete session and re-pair)' : '(reconnecting...)');
      if (loggedOut) {
        // Dead session: exit so the host can clean it up (exit code 2 = logged out).
        setTimeout(() => process.exit(2), 500);
        return;
      }
      setTimeout(() => start().catch((e) => console.error(e)), 3000);
    }
  });

  // ── Anti-call ───────────────────────────────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    if (!getSettings().anticall) return;
    for (const call of calls) {
      if (call.status === 'offer') {
        try { await sock.rejectCall(call.id, call.from); } catch { /* ignore */ }
        try {
          await sock.sendMessage(call.from, { text: '📵 Calls are disabled on this number. Please send a message instead.' });
        } catch { /* ignore */ }
      }
    }
  });

  // ── Welcome / goodbye ───────────────────────────────────────────────────────
  sock.ev.on('group-participants.update', async (ev) => {
    try {
      const g = groupSettings(ev.id);
      const meta = await sock.groupMetadata(ev.id).catch(() => null);
      const gname = meta ? meta.subject : 'the group';
      for (const jid of ev.participants) {
        const num = jid.split('@')[0];
        if (ev.action === 'add' && g.welcome) {
          const text = (g.welcomeText || '👋 Welcome @user to @group!').replace(/@user/g, '@' + num).replace(/@group/g, gname);
          await sock.sendMessage(ev.id, { text, mentions: [jid] });
        }
        if (ev.action === 'remove' && g.goodbye) {
          const text = (g.goodbyeText || '👋 @user has left @group.').replace(/@user/g, '@' + num).replace(/@group/g, gname);
          await sock.sendMessage(ev.id, { text, mentions: [jid] });
        }
      }
    } catch { /* never crash on participant events */ }
  });

  // ── Messages ────────────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        const chat = msg.key.remoteJid;
        if (!chat || chat === 'status@broadcast') continue;

        storeMessage(msg);

        // Anti-delete: a protocol "revoke" message references the deleted one
        const inner = unwrapMessage(msg);
        if (inner.protocolMessage && inner.protocolMessage.type === 0) {
          const g = groupSettings(chat);
          if (g.antidelete && inner.protocolMessage.key) {
            const stored = getStoredMessage(chat, inner.protocolMessage.key.id);
            if (stored) {
              const senderNum = (stored.sender || '').split('@')[0];
              const deletedText = extractText(stored.msg);
              await sock.sendMessage(chat, {
                text: `🗑️ *Anti-delete:* @${senderNum} deleted a message:\n\n${deletedText || '(media — resending below)'}`,
                mentions: [stored.sender],
              });
              if (!deletedText) {
                try {
                  const buf = await downloadMediaMessage(stored.msg, 'buffer', {}, { logger });
                  const typeKey = Object.keys(unwrapMessage(stored.msg))[0] || '';
                  if (typeKey.startsWith('image')) await sock.sendMessage(chat, { image: buf });
                  else if (typeKey.startsWith('video')) await sock.sendMessage(chat, { video: buf });
                  else if (typeKey.startsWith('audio')) await sock.sendMessage(chat, { audio: buf, mimetype: 'audio/mpeg' });
                  else if (typeKey.startsWith('sticker')) await sock.sendMessage(chat, { sticker: buf });
                } catch { /* media gone */ }
              }
            }
          }
          continue;
        }

        if (type !== 'notify' && type !== 'append') continue;
        if (msg.key.fromMe && !getSettings().autoread) { /* still allow owner commands from self */ }

        const settings = getSettings();
        if (settings.autoread) { try { await sock.readMessages([msg.key]); } catch { /* ignore */ } }

        const body = extractText(msg);
        const isGroup = chat.endsWith('@g.us');
        const sender = isGroup ? msg.key.participant || chat : chat;
        const senderNum = sender.split('@')[0].split(':')[0];
        const isOwner = senderNum === String(config.OWNER_NUMBER).replace(/\D/g, '') || msg.key.fromMe;

        // Group protections: anti-link + anti-word (non-admin, non-owner)
        if (isGroup && body) {
          const g = groupSettings(chat);
          const needsModeration = (g.antilink && /chat\.whatsapp\.com\//i.test(body)) ||
            (g.antiword.length && g.antiword.some((w) => body.toLowerCase().includes(w)));
          if (needsModeration && !isOwner) {
            let isAdmin = false;
            try {
              const meta = await sock.groupMetadata(chat);
              const p = (meta.participants || []).find((x) => x.id.split('@')[0].split(':')[0] === senderNum);
              isAdmin = !!(p && p.admin);
            } catch { /* ignore */ }
            if (!isAdmin) {
              try { await sock.sendMessage(chat, { delete: msg.key }); } catch { /* ignore */ }
              try {
                await sock.sendMessage(chat, {
                  text: `⚠️ @${senderNum}, links/banned words are not allowed in this group.`,
                  mentions: [sender],
                });
              } catch { /* ignore */ }
              continue;
            }
          }
        }

        // PM blocker: silently ignore non-owner DMs when enabled
        if (!isGroup && settings.pmblock && !isOwner) continue;

        const prefix = getPrefix();
        const isCmd = body.startsWith(prefix);

        if (!isCmd) {
          // AI chatbot auto-reply in DMs (owner can toggle with .chatbot)
          if (!isGroup && settings.chatbot && body && !msg.key.fromMe) {
            try {
              const ans = await aiChat('generic', body);
              await sock.sendMessage(chat, { text: ans.slice(0, 3800) }, { quoted: msg });
            } catch { /* stay silent if AI is down in auto-reply mode */ }
          }
          continue;
        }

        // Mode gate: private mode = owner/sudo only
        if (getMode() === 'private' && !isOwner && !settings.sudo.map(String).includes(senderNum)) continue;

        const withoutPrefix = body.slice(prefix.length).trim();
        const [nameRaw, ...args] = withoutPrefix.split(/\s+/);
        const name = (nameRaw || '').toLowerCase();
        if (!name) continue;
        const text = withoutPrefix.slice(nameRaw.length).trim();

        if (settings.autotyping) { try { await sock.sendPresenceUpdate('composing', chat); } catch { /* ignore */ } }

        const ctx = await buildCtx(sock, msg, { args, text, command: name, prefix });
        await dispatch(name, ctx);

        if (settings.autotyping) { try { await sock.sendPresenceUpdate('paused', chat); } catch { /* ignore */ } }
      } catch (e) {
        console.error('message handler error:', e && e.message ? e.message : e);
      }
    }
  });

  return sock;
}

start().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
