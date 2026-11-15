// ─── Anime (SFW only) ────────────────────────────────────────────────────────
// Reaction GIFs and anime images from waifu.pics / nekos.best SFW endpoints.

import { cmd } from '../lib/registry.js';
import { fetchJson, pick, API_DOWN } from '../lib/helpers.js';
import { jidNum } from '../lib/helpers.js';

// waifu.pics SFW categories — each is its own command, like rival bots.
const REACTIONS = [
  ['waifu', 'waifu', '🖼️'], ['neko', 'neko', '🐱'], ['shinobu', 'shinobu', '🦋'],
  ['megumin', 'megumin', '💥'], ['awoo', 'awoo', '🐺'], ['bully', 'bully', '😤'],
  ['cuddle', 'cuddle', '🤗'], ['cry', 'cry', '😭'], ['hug', 'hug', '🫂'],
  ['kiss', 'kiss', '💋'], ['lick', 'lick', '👅'], ['pat', 'pat', '🖐️'],
  ['smug', 'smug', '😏'], ['bonk', 'bonk', '🔨'], ['yeet', 'yeet', '💨'],
  ['blush', 'blush', '😊'], ['smile', 'smile', '😄'], ['wave', 'wave', '👋'],
  ['happy', 'happy', '🥳'], ['wink', 'wink', '😉'], ['poke', 'poke', '👉'],
  ['dance', 'dance', '💃'], ['cringe', 'cringe', '😬'],
];

function reactionHandler(cat, emoji) {
  return async (ctx) => {
    try {
      const j = await fetchJson('https://api.waifu.pics/sfw/' + cat);
      const url = pick(j, 'url');
      if (!url) throw new Error('no url');
      const target = ctx.targetJid();
      const caption = target && target !== ctx.sender
        ? `${emoji} @${ctx.senderNum} → @${jidNum(target)}`
        : `${emoji} ${cat}!`;
      const mentions = target && target !== ctx.sender ? [ctx.sender, target] : [ctx.sender];
      if (/\.gif(\?|$)/i.test(url)) {
        await ctx.sock.sendMessage(ctx.chat, { video: { url }, gifPlayback: true, caption, mentions }, { quoted: ctx.msg });
      } else {
        await ctx.sock.sendMessage(ctx.chat, { image: { url }, caption, mentions }, { quoted: ctx.msg });
      }
    } catch { await ctx.reply(API_DOWN); }
  };
}

for (const [pattern, cat, emoji] of REACTIONS) {
  cmd({ pattern, category: 'Anime', desc: 'Anime ' + cat + ' (SFW)', run: reactionHandler(cat, emoji) });
}

cmd({
  pattern: 'ranime', alias: ['randomanime'], category: 'Anime', desc: 'Random SFW anime image/GIF',
  async run(ctx) {
    const [pattern, cat, emoji] = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    return reactionHandler(cat, emoji)(ctx);
  },
});

cmd({
  pattern: 'animepic', alias: ['anipic'], category: 'Anime', desc: 'Random anime picture (nekos.best)',
  async run(ctx) {
    try {
      const j = await fetchJson('https://nekos.best/api/v2/neko');
      const url = pick(j, 'results.0.url');
      if (!url) throw new Error('no url');
      await ctx.sendImage(url, '🌸 Random anime picture');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'animequote', category: 'Anime', desc: 'Random anime quote',
  async run(ctx) {
    try {
      const j = await fetchJson('https://api.animechan.io/v1/quotes/random');
      const q = pick(j, 'data.content') || pick(j, 'data.quote') || pick(j, 'quote');
      const ch = pick(j, 'data.character.name') || pick(j, 'data.character') || pick(j, 'character') || '';
      const an = pick(j, 'data.anime.name') || pick(j, 'data.anime') || pick(j, 'anime') || '';
      if (!q) throw new Error('no quote');
      await ctx.reply(`🌸 *"${q}"*\n— ${ch}${an ? ' (' + an + ')' : ''}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});
