// ─── Dark Zone MD — configuration ────────────────────────────────────────────
// Edit OWNER_NUMBER before the first run. Everything else has sane defaults.

const config = {
  BOT_NAME: 'Dark Zone MD',
  // Owner WhatsApp number in international format, digits only (no +, no spaces).
  // Used for the pairing-code login AND for owner-only commands.
  // Example for Pakistan: '923001234567'
  OWNER_NUMBER: process.env.DZM_OWNER_NUMBER || '923000783620',
  OWNER_NAME: 'Dark Tech Zone',

  // Optional: a SESSION_ID from the Dark Zone MD pairing website
  // (looks like "DZMD~..."). When set, the bot writes it into the session
  // folder and connects directly — NO pairing code, NO QR. You can also
  // set the SESSION_ID environment variable instead of pasting it here.
  // Leave empty to use the console pairing-code / QR login below.
  // Treat it like a password: anyone with it can log in as the bot number.
  SESSION_ID: process.env.SESSION_ID || '',

  PREFIX: '.',
  MODE: 'public', // 'public' = everyone can use commands, 'private' = owner/sudo only

  // Dark Tech Zone main WhatsApp newsletter channel — auto-followed on connect.
  NEWSLETTER_JID: '120363424672606051@newsletter',
  NEWSLETTER_NAME: 'Dark Tech Zone',

  // Dark Zone AI (Ali's own AI API — public demo key, same one the DTZ web page uses)
  DTZ_AI_URL: 'https://dark-tech-zone-ai.vercel.app/api/chat',
  DTZ_AI_KEY: 'DarkTech',

  REPO_URL: 'https://darktechzon.site/',
  STICKER_PACK: 'Dark Zone MD',
  STICKER_AUTHOR: 'Dark Tech Zone',

  SESSION_DIR: process.env.DZM_SESSION_DIR || './session',
  DATA_DIR: './data',
};

export default config;
