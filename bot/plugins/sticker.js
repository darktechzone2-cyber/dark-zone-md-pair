// ─── Sticker: makers, converters, meme-image tools ───────────────────────────

import { cmd } from '../lib/registry.js';
import config from '../config.js';
import { fetchJson, fetchBuffer, firstSuccess, pick, enc, API_DOWN, ApiError } from '../lib/helpers.js';

cmd({
  pattern: 'sticker', alias: ['s', 'stick'], category: 'Sticker', desc: 'Make a sticker from a quoted image/video',
  async run(ctx) {
    const type = ctx.quotedType();
    const selfType = !ctx.quoted ? '' : null;
    const target = ctx.quoted || ctx.msg;
    const t = ctx.quoted ? type : (Object.keys((ctx.msg.message || {}))[0] || '');
    if (!/imageMessage|videoMessage|stickerMessage/.test(t)) {
      return ctx.reply('Reply to an image or short video with ' + ctx.prefix + 'sticker');
    }
    try {
      const buf = ctx.quoted ? await ctx.downloadQuoted() : await ctx.downloadSelf();
      await ctx.sock.sendMessage(ctx.chat, {
        sticker: buf,
        packname: config.STICKER_PACK,
        author: config.STICKER_AUTHOR,
      }, { quoted: ctx.msg });
    } catch {
      await ctx.reply('⚠️ Could not create the sticker. For best results run the bot on a host with ffmpeg installed.');
    }
  },
});

cmd({
  pattern: 'toimg', alias: ['s2img', 'tophoto'], category: 'Sticker', desc: 'Convert a quoted sticker to an image',
  async run(ctx) {
    if (ctx.quotedType() !== 'stickerMessage') return ctx.reply('Reply to a sticker with toimg.');
    try {
      const buf = await ctx.downloadQuoted();
      await ctx.sendImage(buf, '🖼️ Sticker → image');
    } catch {
      await ctx.reply('⚠️ Could not convert that sticker.');
    }
  },
});

cmd({
  pattern: 'emojimix', alias: ['emix'], category: 'Sticker', desc: 'Mix two emojis into one sticker (e.g. emojimix 😂 ❤️)',
  async run(ctx) {
    const emojis = [...(ctx.text || '').match(/\p{Extended_Pictographic}/gu) || []];
    if (emojis.length < 2) return ctx.reply('Usage: emojimix 😂 ❤️ (send two emojis)');
    const [a, b] = emojis;
    const cp = (e) => [...e].map((c) => 'u' + c.codePointAt(0).toString(16)).join('-');
    const dates = ['20201001', '20211123', '20220530', '20230301', '20210521'];
    try {
      const buf = await firstSuccess(dates.map((d) => async () => {
        const url = `https://www.google.com/android/keyboard/emojikitchen/${d}/${cp(a)}/${cp(a)}_${cp(b)}.png`;
        const data = await fetchBuffer(url);
        if (!data || data.length < 500) throw new ApiError('bad combo');
        return data;
      }));
      await ctx.sendSticker(buf);
    } catch {
      await ctx.reply('⚠️ That emoji combination is not available. Try another pair!');
    }
  },
});

cmd({
  pattern: 'quotly', alias: ['qc'], category: 'Sticker', desc: 'Make a quote sticker from a message (reply to one)',
  async run(ctx) {
    const q = ctx.quoted;
    const text = ctx.quotedText() || ctx.text;
    if (!text) return ctx.reply('Reply to a message with quotly to turn it into a quote sticker.');
    const from = q && q.participant ? q.participant : ctx.sender;
    const num = from.split('@')[0];
    let avatar = '';
    try { avatar = await ctx.sock.profilePictureUrl(from, 'image'); } catch { avatar = ''; }
    try {
      const res = await fetch('https://bot.lyo.su/quote/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote', format: 'png', backgroundColor: '#1b1425', width: 512, height: 768, scale: 2,
          messages: [{
            entities: [], avatar: true,
            from: { id: num, name: '@' + num, photo: { url: avatar || '' } },
            text, replyMessage: {},
          }],
        }),
      });
      if (!res.ok) throw new ApiError('quotly HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      await ctx.sendSticker(buf);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'smeme', category: 'Sticker', desc: 'Add meme text to a quoted image: smeme top | bottom',
  async run(ctx) {
    if (ctx.quotedType() !== 'imageMessage') return ctx.reply('Reply to an image: smeme <top text> | <bottom text>');
    const [top = '', bottom = ''] = (ctx.text || '').split('|').map((s) => s.trim());
    try {
      const buf = await ctx.downloadQuoted();
      // Upload to Catbox (free, anonymous) to get a URL memegen can use
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([buf]), 'img.jpg');
      const up = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
      const imgUrl = (await up.text()).trim();
      if (!/^https?:/.test(imgUrl)) throw new ApiError('upload failed');
      const esc = (s) => enc((s || '_').replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_').replace(/\?/g, '~q').replace(/%/g, '~p'));
      const memeUrl = `https://api.memegen.link/images/custom/${esc(top)}/${esc(bottom)}.jpg?background=${enc(imgUrl)}`;
      const meme = await fetchBuffer(memeUrl);
      await ctx.sendImage(meme, '😂 Your meme');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'brat', category: 'Sticker', desc: 'Make a BRAT-style text sticker',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: brat <text>');
    try {
      const buf = await fetchBuffer('https://brat.caliphdev.com/image/brat?text=' + enc(ctx.text.slice(0, 100)));
      await ctx.sendSticker(buf);
    } catch { await ctx.reply(API_DOWN); }
  },
});

function textStickerCmd(pattern, service, desc) {
  cmd({
    pattern, category: 'Sticker', desc,
    async run(ctx) {
      if (!ctx.text) return ctx.reply('Usage: ' + pattern + ' <text>');
      const e = enc(ctx.text.slice(0, 60));
      try {
        const buf = await firstSuccess([
          () => fetchBuffer(`https://api.ryzendesu.vip/api/maker/${service}?text=${e}`),
          () => fetchBuffer(`https://api.siputzx.my.id/api/maker/${service}?text=${e}`),
          () => fetchBuffer('https://brat.caliphdev.com/image/brat?text=' + e),
        ]);
        await ctx.sendSticker(buf);
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}
textStickerCmd('attp', 'attp', 'Animated rainbow text sticker');
textStickerCmd('ttp', 'ttp', 'Text-to-sticker image');

cmd({
  pattern: 'stickerly', alias: ['ssearch', 'stickersearch'], category: 'Sticker', desc: 'Search sticker packs',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: stickerly <search text>');
    try {
      const j = await fetchJson('https://api.siputzx.my.id/api/s/stickerly?query=' + enc(ctx.text));
      const items = pick(j, 'data') || pick(j, 'result') || [];
      const list = Array.isArray(items) ? items.slice(0, 6) : [];
      if (!list.length) return ctx.reply('No sticker packs found for: ' + ctx.text);
      const lines = list.map((s, i) => `${i + 1}. *${pick(s, 'name') || pick(s, 'title') || 'Pack'}*\n${pick(s, 'url') || pick(s, 'link') || ''}`);
      await ctx.reply('🏷️ *Sticker packs:*\n\n' + lines.join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'take', alias: ['stealsticker'], category: 'Sticker', desc: 'Re-brand a quoted sticker with Dark Zone MD pack info',
  async run(ctx) {
    if (ctx.quotedType() !== 'stickerMessage') return ctx.reply('Reply to a sticker with take.');
    try {
      const buf = await ctx.downloadQuoted();
      await ctx.sock.sendMessage(ctx.chat, {
        sticker: buf, packname: config.STICKER_PACK, author: config.STICKER_AUTHOR,
      }, { quoted: ctx.msg });
    } catch {
      await ctx.reply('⚠️ Could not process that sticker.');
    }
  },
});

// Popcat image-maker commands (use the target's profile picture)
function popcatCmd(pattern, endpoint, caption) {
  cmd({
    pattern, category: 'Sticker', desc: caption,
    async run(ctx) {
      const jid = ctx.targetJid() || ctx.sender;
      let pp = '';
      try { pp = await ctx.sock.profilePictureUrl(jid, 'image'); } catch { pp = ''; }
      if (!pp) return ctx.reply('⚠️ That user has no public profile picture.');
      try {
        const buf = await fetchBuffer(`https://api.popcat.xyz/${endpoint}?image=${enc(pp)}`);
        await ctx.sendImage(buf, caption);
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}
popcatCmd('triggered', 'triggered', '😤 Triggered!');
popcatCmd('wasted', 'wasted', '💀 Wasted');
popcatCmd('jail', 'jail', '🚔 Sent to jail');
popcatCmd('clown', 'clown', '🤡 Clown');
