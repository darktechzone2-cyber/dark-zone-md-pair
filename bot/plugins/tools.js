// ─── Tools: TTS, translate, shorteners, temp mail, converters & utilities ────
// All free, no-key public APIs. NOTE: no calculator by design (Ali's rule) —
// these are real services, not arithmetic/formatting toys.

import { cmd } from '../lib/registry.js';
import {
  fetchJson, fetchText, fetchBuffer, firstSuccess, pick, enc, isUrl, API_DOWN, ApiError,
} from '../lib/helpers.js';
import { getTempMail, setTempMail } from '../lib/store.js';

// ── TTS (Google Translate TTS — free) ─────────────────────────────────────────
async function ttsRun(ctx, lang) {
  const text = ctx.text || ctx.quotedText();
  if (!text) return ctx.reply('Usage: ' + ctx.command + ' <text to speak>');
  try {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + lang + '&q=' + enc(text.slice(0, 200));
    const buf = await fetchBuffer(url);
    await ctx.sendAudio(buf, true);
  } catch { await ctx.reply(API_DOWN); }
}
cmd({ pattern: 'tts', alias: ['say', 'speak'], category: 'Tools', desc: 'Text to speech (tts <lang?> <text> — put text last)',
  async run(ctx) {
    // tts: if first arg looks like a 2-letter lang code, use it
    let lang = 'en';
    let text = ctx.text;
    const m = text.match(/^([a-z]{2})[\s:]+(.+)$/s);
    if (m) { lang = m[1]; text = m[2]; }
    const save = ctx.text; ctx.text = text;
    try { await ttsRun(ctx, lang); } finally { ctx.text = save; }
  } });
cmd({ pattern: 'ttsur', category: 'Tools', desc: 'Urdu text to speech', run: (ctx) => ttsRun(ctx, 'ur') });
cmd({ pattern: 'ttsar', category: 'Tools', desc: 'Arabic text to speech', run: (ctx) => ttsRun(ctx, 'ar') });
cmd({ pattern: 'ttshi', category: 'Tools', desc: 'Hindi text to speech', run: (ctx) => ttsRun(ctx, 'hi') });
cmd({ pattern: 'ttses', category: 'Tools', desc: 'Spanish text to speech', run: (ctx) => ttsRun(ctx, 'es') });

// ── Translate (Google Translate gtx — free) ───────────────────────────────────
async function translateRun(ctx, tl) {
  const text = ctx.text || ctx.quotedText();
  if (!text) return ctx.reply('Usage: ' + ctx.command + ' <text>');
  try {
    const j = await fetchJson('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + tl + '&dt=t&q=' + enc(text));
    const parts = pick(j, '0') || [];
    const out = parts.map((p) => (Array.isArray(p) ? p[0] : '')).join('');
    if (!out) throw new ApiError('no translation');
    await ctx.reply('🌍 *Translation (' + tl + '):*\n\n' + out);
  } catch { await ctx.reply(API_DOWN); }
}
cmd({ pattern: 'translate', alias: ['trt', 'tr'], category: 'Tools', desc: 'Translate: translate <lang> <text> (or reply)',
  async run(ctx) {
    let tl = 'en';
    let text = ctx.text;
    const m = text.match(/^([a-z]{2})[\s:]+(.+)$/s);
    if (m) { tl = m[1]; text = m[2]; }
    const save = ctx.text; ctx.text = text;
    try { await translateRun(ctx, tl); } finally { ctx.text = save; }
  } });
cmd({ pattern: 'tren', category: 'Tools', desc: 'Translate to English', run: (ctx) => translateRun(ctx, 'en') });
cmd({ pattern: 'trur', category: 'Tools', desc: 'Translate to Urdu', run: (ctx) => translateRun(ctx, 'ur') });
cmd({ pattern: 'trar', category: 'Tools', desc: 'Translate to Arabic', run: (ctx) => translateRun(ctx, 'ar') });
cmd({ pattern: 'trhi', category: 'Tools', desc: 'Translate to Hindi', run: (ctx) => translateRun(ctx, 'hi') });
cmd({ pattern: 'tres', category: 'Tools', desc: 'Translate to Spanish', run: (ctx) => translateRun(ctx, 'es') });

// ── URL shorteners (all free) ─────────────────────────────────────────────────
function shortenerCmd(pattern, name, fn) {
  cmd({
    pattern, category: 'Tools', desc: 'Shorten a URL via ' + name,
    async run(ctx) {
      const url = (ctx.args[0] || '').trim();
      if (!isUrl(url)) return ctx.reply('Usage: ' + pattern + ' <long url>');
      try {
        const short = await fn(url);
        await ctx.reply('🔗 *Shortened (' + name + '):*\n' + short);
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}
shortenerCmd('shorten', 'TinyURL', async (u) => (await fetchText('https://tinyurl.com/api-create.php?url=' + enc(u))).trim());
shortenerCmd('tinyurl', 'TinyURL', async (u) => (await fetchText('https://tinyurl.com/api-create.php?url=' + enc(u))).trim());
shortenerCmd('isgd', 'is.gd', async (u) => (await fetchText('https://is.gd/create.php?format=simple&url=' + enc(u))).trim());
shortenerCmd('vgd', 'v.gd', async (u) => (await fetchText('https://v.gd/create.php?format=simple&url=' + enc(u))).trim());
shortenerCmd('cleanuri', 'CleanURI', async (u) => {
  const j = await fetchJson('https://cleanuri.com/api/v1/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'url=' + enc(u),
  });
  const r = pick(j, 'result_url');
  if (!r) throw new ApiError('cleanuri failed');
  return r;
});

cmd({
  pattern: 'unshorten', alias: ['expandurl'], category: 'Tools', desc: 'Reveal where a short URL really goes',
  async run(ctx) {
    const url = (ctx.args[0] || '').trim();
    if (!isUrl(url)) return ctx.reply('Usage: unshorten <short url>');
    try {
      const res = await fetch(url, { redirect: 'follow' });
      await ctx.reply('🔍 Final destination:\n' + res.url);
    } catch { await ctx.reply(API_DOWN); }
  },
});

// ── Website screenshots (thum.io — free) ──────────────────────────────────────
function ssCmd(pattern, width, label) {
  cmd({
    pattern, category: 'Tools', desc: 'Screenshot a website (' + label + ')',
    async run(ctx) {
      const url = (ctx.args[0] || '').trim();
      if (!isUrl(url)) return ctx.reply('Usage: ' + pattern + ' <website url>');
      const shot = `https://image.thum.io/get/width/${width}/noanimate/${url}`;
      await ctx.sendImage(shot, '📸 ' + url);
    },
  });
}
ssCmd('ssweb', 1200, 'desktop/full');
ssCmd('sspc', 1280, 'PC');
ssCmd('ssphone', 390, 'phone');

// ── QR code ───────────────────────────────────────────────────────────────────
cmd({
  pattern: 'qrcode', alias: ['qr'], category: 'Tools', desc: 'Make a QR code from text/link',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: qrcode <text or link>');
    await ctx.sendImage('https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=' + enc(ctx.text), '🔳 Your QR code');
  },
});

// ── Temp mail (1secmail — free) ───────────────────────────────────────────────
cmd({
  pattern: 'tempmail', alias: ['tmpmail'], category: 'Tools', desc: 'Get a disposable email address',
  async run(ctx) {
    try {
      const j = await fetchJson('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
      const email = Array.isArray(j) ? j[0] : null;
      if (!email) throw new ApiError('no mailbox');
      const [login, domain] = email.split('@');
      setTempMail(ctx.sender, { login, domain, email });
      await ctx.reply(`📧 *Your temp email:*\n${email}\n\nCheck it with: tempmailinbox\n(Valid for this session)`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tempmailinbox', alias: ['tmpinbox'], category: 'Tools', desc: 'Check your temp-mail inbox',
  async run(ctx) {
    const box = getTempMail(ctx.sender);
    if (!box) return ctx.reply('You have no temp email yet. Get one with: tempmail');
    try {
      const j = await fetchJson(`https://www.1secmail.com/api/v1/?action=getMessages&login=${enc(box.login)}&domain=${enc(box.domain)}`);
      const msgs = Array.isArray(j) ? j : [];
      if (!msgs.length) return ctx.reply('📭 Inbox empty for ' + box.email);
      const lines = msgs.slice(0, 10).map((m) => `• *#${m.id}* from ${m.from}\n  ${m.subject || '(no subject)'}`);
      await ctx.reply(`📥 *${box.email}* — ${msgs.length} message(s):\n\n` + lines.join('\n') + '\n\nRead one with: tempmailmsg <id>');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tempmailmsg', alias: ['tmpmsg'], category: 'Tools', desc: 'Read a temp-mail message by ID',
  async run(ctx) {
    const box = getTempMail(ctx.sender);
    if (!box) return ctx.reply('You have no temp email yet. Get one with: tempmail');
    const id = (ctx.args[0] || '').trim();
    if (!id) return ctx.reply('Usage: tempmailmsg <id> (see tempmailinbox)');
    try {
      const j = await fetchJson(`https://www.1secmail.com/api/v1/?action=readMessage&login=${enc(box.login)}&domain=${enc(box.domain)}&id=${enc(id)}`);
      const body = pick(j, 'textBody') || pick(j, 'body') || '(empty body)';
      await ctx.reply(`✉️ *From:* ${pick(j, 'from') || '?'}\n*Subject:* ${pick(j, 'subject') || ''}\n\n${String(body).slice(0, 3000)}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

// ── Knowledge utilities ───────────────────────────────────────────────────────
cmd({
  pattern: 'trivia', category: 'Tools', desc: 'Random trivia question (answer hidden)',
  async run(ctx) {
    try {
      const j = await fetchJson('https://opentdb.com/api.php?amount=1&type=multiple');
      const r = pick(j, 'results.0');
      if (!r) throw new ApiError('no trivia');
      const dec = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&eacute;/g, 'é');
      const opts = [...(r.incorrect_answers || []), r.correct_answer].sort(() => Math.random() - 0.5);
      await ctx.reply(`🧠 *Trivia* (${dec(r.category)})\n\n${dec(r.question)}\n\n` + opts.map((o, i) => `${'ABCD'[i]}. ${dec(o)}`).join('\n') + `\n\n||Answer: ${dec(r.correct_answer)}||`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'define', alias: ['dictionary'], category: 'Tools', desc: 'Dictionary definition of a word',
  async run(ctx) {
    const word = (ctx.args[0] || '').trim();
    if (!word) return ctx.reply('Usage: define <word>');
    try {
      const j = await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + enc(word.toLowerCase()));
      const entry = Array.isArray(j) ? j[0] : null;
      const def = pick(entry, 'meanings.0.definitions.0.definition');
      if (!def) return ctx.reply('No definition found for: ' + word);
      const pos = pick(entry, 'meanings.0.partOfSpeech') || '';
      const phon = pick(entry, 'phonetic') || '';
      await ctx.reply(`📖 *${word}* ${phon} (${pos})\n\n${def}`);
    } catch { await ctx.reply('No definition found for: ' + word); }
  },
});

cmd({
  pattern: 'currency', alias: ['convertmoney', 'fx'], category: 'Tools', desc: 'Currency converter: currency 100 USD PKR',
  async run(ctx) {
    const [amountRaw, fromRaw, toRaw] = ctx.args;
    const amount = parseFloat(amountRaw);
    if (!amount || !fromRaw || !toRaw) return ctx.reply('Usage: currency <amount> <FROM> <TO>  e.g. currency 100 USD PKR');
    try {
      const j = await fetchJson('https://open.er-api.com/v6/latest/' + enc(fromRaw.toUpperCase()));
      const rate = pick(j, 'rates.' + toRaw.toUpperCase());
      if (!rate) throw new ApiError('bad currency code');
      await ctx.reply(`💱 *${amount} ${fromRaw.toUpperCase()}* = *${(amount * rate).toFixed(2)} ${toRaw.toUpperCase()}*\nRate: 1 ${fromRaw.toUpperCase()} = ${rate} ${toRaw.toUpperCase()}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

async function cryptoRun(ctx, symbol) {
  try {
    const j = await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=' + symbol);
    const price = parseFloat(pick(j, 'price'));
    if (!price) throw new ApiError('no price');
    await ctx.reply(`🪙 *${symbol.replace('USDT', '/USDT')}*\n💲 $${price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`);
  } catch { await ctx.reply(API_DOWN); }
}
cmd({ pattern: 'crypto', alias: ['cryptoprice'], category: 'Tools', desc: 'Crypto price: crypto BTC (default BTC)',
  run: (ctx) => cryptoRun(ctx, ((ctx.args[0] || 'BTC').toUpperCase().replace(/USDT$/, '') || 'BTC') + 'USDT') });
cmd({ pattern: 'btc', category: 'Tools', desc: 'Bitcoin price', run: (ctx) => cryptoRun(ctx, 'BTCUSDT') });
cmd({ pattern: 'eth', category: 'Tools', desc: 'Ethereum price', run: (ctx) => cryptoRun(ctx, 'ETHUSDT') });

cmd({
  pattern: 'ipinfo', alias: ['ip'], category: 'Tools', desc: 'IP address info (public data)',
  async run(ctx) {
    const ip = (ctx.args[0] || '').trim();
    if (!ip) return ctx.reply('Usage: ipinfo <ip address>');
    try {
      const j = await fetchJson('http://ip-api.com/json/' + enc(ip) + '?fields=status,country,regionName,city,isp,org,as,query,timezone');
      if (pick(j, 'status') !== 'success') throw new ApiError('bad ip');
      await ctx.reply(`🌐 *${pick(j, 'query')}*\n📍 ${pick(j, 'city')}, ${pick(j, 'regionName')}, ${pick(j, 'country')}\n🏢 ISP: ${pick(j, 'isp')}\n🕐 TZ: ${pick(j, 'timezone')}\n🔢 ${pick(j, 'as') || ''}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'whois', alias: ['domain'], category: 'Tools', desc: 'Domain WHOIS/RDAP info',
  async run(ctx) {
    const d = (ctx.args[0] || '').replace(/^https?:\/\//, '').split('/')[0].trim();
    if (!d || !d.includes('.')) return ctx.reply('Usage: whois <domain.com>');
    try {
      const j = await fetchJson('https://rdap.db.ripe.net/domain/' + enc(d));
      const name = pick(j, 'ldhName') || d;
      const events = pick(j, 'events') || [];
      const reg = (events.find((e) => e.eventAction === 'registration') || {}).eventDate || 'unknown';
      const exp = (events.find((e) => /expiration/.test(e.eventAction || '')) || {}).eventDate || 'unknown';
      const status = (pick(j, 'status') || []).join(', ') || 'unknown';
      await ctx.reply(`🌐 *${name}*\n📅 Registered: ${reg}\n⏳ Expires: ${exp}\n📌 Status: ${status}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'carbon', category: 'Tools', desc: 'Turn code into a beautiful image: carbon <code>',
  async run(ctx) {
    const code = ctx.text || ctx.quotedText();
    if (!code) return ctx.reply('Usage: carbon <code>');
    try {
      const buf = await fetchBuffer('https://carbonara.solopov.dev/api/cook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, backgroundColor: '#1F816D', theme: 'seti', language: 'auto' }),
      });
      await ctx.sendImage(buf, '💻 Your code, beautified');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'readmore', category: 'Tools', desc: 'Hide text behind a WhatsApp "Read more"',
  async run(ctx) {
    const [before, ...after] = (ctx.text || '').split('|');
    if (!after.length) return ctx.reply('Usage: readmore <visible text> | <hidden text>');
    await ctx.reply(before.trim() + ' ​\n' + '⁠'.repeat(4001) + '\n' + after.join('|').trim());
  },
});

// ── Fancy text (unicode styles, computed locally) ─────────────────────────────
const FANCY_MAPS = {
  bold: { map: (c) => ({ a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷', k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁', u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇', A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗', E: '𝗘', F: '𝗙', G: '𝗚', H: '𝗛', I: '𝗜', J: '𝗝', K: '𝗞', L: '𝗟', M: '𝗠', N: '𝗡', O: '𝗢', P: '𝗣', Q: '𝗤', R: '𝗥', S: '𝗦', T: '𝗧', U: '𝗨', V: '𝗩', W: '𝗪', X: '𝗫', Y: '𝗬', Z: '𝗭' }[c] || c) },
};
function styleText(text, fn) { return [...text].map(fn).join(''); }
const monoMap = (c) => ({ a: '𝚊', b: '𝚋', c: '𝚌', d: '𝚍', e: '𝚎', f: '𝚏', g: '𝚐', h: '𝚑', i: '𝚒', j: '𝚓', k: '𝚔', l: '𝚕', m: '𝚖', n: '𝚗', o: '𝚘', p: '𝚙', q: '𝚚', r: '𝚛', s: '𝚜', t: '𝚝', u: '𝚞', v: '𝚟', w: '𝚠', x: '𝚡', y: '𝚢', z: '𝚣', A: '𝙰', B: '𝙱', C: '𝙲', D: '𝙳', E: '𝙴', F: '𝙵', G: '𝙶', H: '𝙷', I: '𝙸', J: '𝙹', K: '𝙺', L: '𝙻', M: '𝙼', N: '𝙽', O: '𝙾', P: '𝙿', Q: '𝚀', R: '𝚁', S: '𝚂', T: '𝚃', U: '𝚄', V: '𝚅', W: '𝚆', X: '𝚇', Y: '𝚈', Z: '𝚉' }[c] || c);
const bubbleMap = (c) => ({ a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ', i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ', q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ', y: 'ⓨ', z: 'ⓩ', A: 'Ⓐ', B: 'Ⓑ', C: 'Ⓒ', D: 'Ⓓ', E: 'Ⓔ', F: 'Ⓕ', G: 'Ⓖ', H: 'Ⓗ', I: 'Ⓘ', J: 'Ⓙ', K: 'Ⓚ', L: 'Ⓛ', M: 'Ⓜ', N: 'Ⓝ', O: 'Ⓞ', P: 'Ⓟ', Q: 'Ⓠ', R: 'Ⓡ', S: 'Ⓢ', T: 'Ⓣ', U: 'Ⓤ', V: 'Ⓥ', W: 'Ⓦ', X: 'Ⓧ', Y: 'Ⓨ', Z: 'Ⓩ' }[c] || c);
const scriptMap = (c) => ({ a: '𝒶', b: '𝒷', c: '𝒸', d: '𝒹', e: 'ℯ', f: '𝒻', g: 'ℊ', h: '𝒽', i: '𝒾', j: '𝒿', k: '𝓀', l: '𝓁', m: '𝓂', n: '𝓃', o: 'ℴ', p: '𝓅', q: '𝓆', r: '𝓇', s: '𝓈', t: '𝓉', u: '𝓊', v: '𝓋', w: '𝓌', x: '𝓍', y: '𝓎', z: '𝓏', A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵' }[c] || c);

cmd({
  pattern: 'fancy', category: 'Tools', desc: 'Your text in 5 fancy styles at once',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: fancy <text>');
    const t = ctx.text.slice(0, 60);
    await ctx.reply(['*1.* ' + styleText(t, FANCY_MAPS.bold.map), '*2.* ' + styleText(t, monoMap), '*3.* ' + styleText(t, bubbleMap), '*4.* ' + styleText(t, scriptMap), '*5.* ' + [...t].join(' ')].join('\n'));
  },
});
function styleCmd(pattern, fn, label) {
  cmd({ pattern, category: 'Tools', desc: label, async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: ' + pattern + ' <text>');
    await ctx.reply(styleText(ctx.text.slice(0, 120), fn));
  } });
}
styleCmd('boldtext', FANCY_MAPS.bold.map, 'Text in bold unicode style');
styleCmd('monospace', monoMap, 'Text in monospace unicode style');
styleCmd('bubbletext', bubbleMap, 'Text in bubble unicode style');
styleCmd('scripttext', scriptMap, 'Text in script unicode style');

// ── Encoders / text transforms (local) ────────────────────────────────────────
cmd({ pattern: 'encode', alias: ['ebase', 'base64'], category: 'Tools', desc: 'Encode text to Base64',
  run: async (ctx) => ctx.reply(ctx.text ? Buffer.from(ctx.text, 'utf8').toString('base64') : 'Usage: encode <text>') });
cmd({ pattern: 'decode', alias: ['dbase'], category: 'Tools', desc: 'Decode Base64 to text',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: decode <base64>');
    try { await ctx.reply(Buffer.from(ctx.text.trim(), 'base64').toString('utf8') || '(empty)'); }
    catch { await ctx.reply('⚠️ That is not valid Base64.'); }
  } });
cmd({ pattern: 'binary', alias: ['ebinary'], category: 'Tools', desc: 'Text → binary',
  run: async (ctx) => ctx.reply(ctx.text ? [...ctx.text].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ') : 'Usage: binary <text>') });
cmd({ pattern: 'debinary', alias: ['dbinary'], category: 'Tools', desc: 'Binary → text',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: debinary <01001000 ...>');
    try {
      const out = ctx.text.trim().split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 2))).join('');
      await ctx.reply(out || '(empty)');
    } catch { await ctx.reply('⚠️ Invalid binary input.'); }
  } });
cmd({ pattern: 'reverse', alias: ['revtext'], category: 'Tools', desc: 'Reverse text',
  run: async (ctx) => ctx.reply(ctx.text ? [...ctx.text].reverse().join('') : 'Usage: reverse <text>') });

const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', ' ': '/' };
cmd({ pattern: 'morse', category: 'Tools', desc: 'Text → Morse code',
  run: async (ctx) => ctx.reply(ctx.text ? [...ctx.text.toLowerCase()].map((c) => MORSE[c] || c).join(' ') : 'Usage: morse <text>') });
cmd({ pattern: 'demorse', category: 'Tools', desc: 'Morse code → text',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: demorse <... --- ...>');
    const rev = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
    await ctx.reply(ctx.text.trim().split(' ').map((t) => rev[t] || '?').join('') || '(empty)');
  } });

cmd({ pattern: 'uuid', category: 'Tools', desc: 'Generate a random UUID',
  run: async (ctx) => ctx.reply('🆔 ' + globalThis.crypto.randomUUID()) });

cmd({
  pattern: 'time', alias: ['worldtime'], category: 'Tools', desc: 'Current time in a city/timezone area: time Asia/Karachi',
  async run(ctx) {
    const zone = (ctx.text || 'Asia/Karachi').trim().replace(/\s+/g, '_');
    try {
      const j = await fetchJson('https://worldtimeapi.org/api/timezone/' + enc(zone).replace(/%2F/gi, '/'));
      const dt = pick(j, 'datetime');
      if (!dt) throw new ApiError('bad zone');
      await ctx.reply(`🕐 *${zone}*\n${dt.replace('T', ' ').slice(0, 19)}\nUTC offset: ${pick(j, 'utc_offset')}`);
    } catch { await ctx.reply('⚠️ Unknown timezone. Example: time Asia/Karachi or time Europe/London'); }
  },
});

// ── URL fetch & upload ────────────────────────────────────────────────────────
cmd({
  pattern: 'geturl', alias: ['fetchurl'], category: 'Tools', desc: 'Fetch a URL and show its content info',
  async run(ctx) {
    const url = (ctx.args[0] || '').trim();
    if (!isUrl(url)) return ctx.reply('Usage: geturl <url>');
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const type = res.headers.get('content-type') || 'unknown';
      const len = res.headers.get('content-length') || 'unknown';
      if (/image|video|audio|pdf|zip/.test(type)) {
        await ctx.sendDocument(url, 'download', type, `📥 ${type} (${len} bytes)`);
      } else {
        const txt = await res.text();
        await ctx.reply('📄 *' + url + '*\nType: ' + type + '\n\n' + txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2500));
      }
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tourl', alias: ['upload'], category: 'Tools', desc: 'Upload a quoted media and get a public URL (Catbox)',
  async run(ctx) {
    if (!ctx.quoted) return ctx.reply('Reply to an image/video/file with tourl.');
    try {
      const buf = await ctx.downloadQuoted();
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([buf]), 'file.bin');
      const up = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
      const link = (await up.text()).trim();
      if (!/^https?:/.test(link)) throw new ApiError('upload failed');
      await ctx.reply('🔗 Your file URL:\n' + link);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'bible', alias: ['verse'], category: 'Tools', desc: 'Fetch a Bible verse: bible John 3:16',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: bible <book chapter:verse>');
    try {
      const j = await fetchJson('https://bible-api.com/' + enc(ctx.text));
      const text = pick(j, 'text');
      if (!text) throw new ApiError('not found');
      await ctx.reply(`📖 *${pick(j, 'reference')}*\n\n${text.trim()}`);
    } catch { await ctx.reply('Verse not found. Example: bible John 3:16'); }
  },
});

cmd({
  pattern: 'save', alias: ['saveme'], category: 'Tools', desc: 'Save a quoted status/media to your own DM',
  async run(ctx) {
    if (!ctx.quoted) return ctx.reply('Reply to any media/message with save — I will forward it to your DM.');
    try {
      const type = ctx.quotedType();
      if (/imageMessage|videoMessage|audioMessage|stickerMessage|documentMessage/.test(type)) {
        const buf = await ctx.downloadQuoted();
        if (type === 'imageMessage') await ctx.sock.sendMessage(ctx.sender, { image: buf, caption: '💾 Saved by Dark Zone MD' });
        else if (type === 'videoMessage') await ctx.sock.sendMessage(ctx.sender, { video: buf, caption: '💾 Saved by Dark Zone MD' });
        else if (type === 'audioMessage') await ctx.sock.sendMessage(ctx.sender, { audio: buf, mimetype: 'audio/mpeg' });
        else if (type === 'stickerMessage') await ctx.sock.sendMessage(ctx.sender, { sticker: buf });
        else await ctx.sock.sendMessage(ctx.sender, { document: buf, fileName: 'saved-file' });
      } else {
        await ctx.sock.sendMessage(ctx.sender, { text: '💾 Saved:\n\n' + (ctx.quotedText() || '(media)') });
      }
      await ctx.reply('💾 Sent to your DM.');
    } catch {
      await ctx.reply('⚠️ Could not save that.');
    }
  },
});
