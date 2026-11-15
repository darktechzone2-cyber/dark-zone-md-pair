// ─── Persistent settings + in-memory message store (anti-delete) ────────────

import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const dataDir = process.env.DZM_DATA_DIR || config.DATA_DIR;
const settingsFile = path.join(dataDir, 'settings.json');

const DEFAULTS = {
  mode: null, // null = use config.MODE
  prefix: null, // null = use config.PREFIX
  sudo: [], // extra owner numbers (digits)
  autoread: false,
  autotyping: false,
  alwaysonline: false,
  anticall: false,
  pmblock: false,
  chatbot: false, // AI auto-reply in DMs
  groups: {}, // per-group settings, see groupDefaults()
};

function groupDefaults() {
  return {
    antilink: false,
    antidelete: false,
    welcome: false,
    goodbye: false,
    antiword: [], // banned words list
    welcomeText: '',
    goodbyeText: '',
    warns: {}, // jid -> count
  };
}

let settings = structuredClone(DEFAULTS);
try {
  if (fs.existsSync(settingsFile)) {
    const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    settings = { ...structuredClone(DEFAULTS), ...raw };
  }
} catch {
  settings = structuredClone(DEFAULTS);
}

export function save() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 1));
  } catch {
    /* read-only fs etc — settings stay in memory */
  }
}

export function getSettings() {
  return settings;
}

export function groupSettings(jid) {
  if (!settings.groups[jid]) {
    settings.groups[jid] = groupDefaults();
    save();
  }
  return settings.groups[jid];
}

export function getMode() {
  return settings.mode || config.MODE;
}

export function getPrefix() {
  return settings.prefix || config.PREFIX;
}

export function isSudo(num) {
  return settings.sudo.map(String).includes(String(num));
}

// ─── Anti-delete message store (in-memory, capped) ───────────────────────────
const msgStore = new Map(); // chatJid -> Map(msgId -> { msg, sender, ts })
const MAX_PER_CHAT = 300;

export function storeMessage(msg) {
  try {
    const chat = msg.key.remoteJid;
    const id = msg.key.id;
    if (!chat || !id || chat === 'status@broadcast') return;
    if (!msgStore.has(chat)) msgStore.set(chat, new Map());
    const m = msgStore.get(chat);
    m.set(id, { msg, sender: msg.key.participant || msg.key.remoteJid, ts: Date.now() });
    while (m.size > MAX_PER_CHAT) m.delete(m.keys().next().value);
  } catch {
    /* ignore */
  }
}

export function getStoredMessage(chat, id) {
  const m = msgStore.get(chat);
  return m ? m.get(id) : undefined;
}

export function clearStore() {
  msgStore.clear();
}

// ─── Temp-mail cache (per user) ──────────────────────────────────────────────
const tempMail = new Map(); // senderJid -> { login, domain, ts }
export function setTempMail(jid, box) { tempMail.set(jid, { ...box, ts: Date.now() }); }
export function getTempMail(jid) { return tempMail.get(jid); }
