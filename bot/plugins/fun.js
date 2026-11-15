// ─── Fun: games, jokes, quotes, wishes, animal pics ──────────────────────────
// Mix of free APIs and built-in content packs (so basics work even offline).

import { cmd } from '../lib/registry.js';
import { fetchJson, pick, enc, API_DOWN, ApiError } from '../lib/helpers.js';
import { jidNum } from '../lib/helpers.js';

const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TRUTHS = [
  'What is the last lie you told?', 'What is your biggest fear?', 'What is the most embarrassing thing in your search history?',
  'Have you ever stalked an ex on social media?', 'What is a secret you have never told anyone?',
  'What is the worst gift you have ever received?', 'Have you ever pretended to be sick to skip something?',
  'What is your most annoying habit?', 'Who was your first crush?', 'What is the strangest dream you ever had?',
  'Have you ever cheated in an exam?', 'What is the last thing you Googled at 3 AM?',
  'If you could read one person\'s mind for a day, who would it be?', 'What is your guilty pleasure song?',
  'Have you ever sent a message to the wrong person?', 'What is the most childish thing you still do?',
  'What would your friends say is your worst quality?', 'Have you ever fallen asleep in class or a meeting?',
  'What is one thing you would change about your past?', 'Who in this chat would you call at 2 AM in an emergency?',
];
const DARES = [
  'Send a voice note singing your favourite song.', 'Type a message using only your elbows.',
  'Let the group pick your profile picture for 1 hour.', 'Speak in an accent for the next 10 minutes.',
  'Send the last photo in your gallery (if safe!).', 'Text your crush "I had a dream about you".',
  'Do 20 push-ups and send a video.', 'Put your status as "Dark Zone MD is the best bot" for 1 hour.',
  'Imitate a famous celebrity in a voice note.', 'Eat a spoon of something spicy and react in a voice note.',
  'Let someone in the group post a status from your phone.', 'Talk without using the letter "e" for 5 minutes.',
  'Send a selfie with the funniest face you can make.', 'Dance for 30 seconds on video.',
  'Change your name in the group to something the group chooses, for a day.',
];
const JOKES_LOCAL = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I told my computer I needed a break, and now it won\'t stop sending me KitKat ads.',
  'Why did the scarecrow win an award? Because he was outstanding in his field.',
  'What do you call a fish without eyes? A fsh.',
  'Why don\'t scientists trust atoms? Because they make up everything.',
  'My Wi-Fi went down for 5 minutes today, so I had to talk to my family. They seem nice.',
  'Why did the phone go to the doctor? It had too many contacts.',
  'Parallel lines have so much in common. Shame they\'ll never meet.',
];
const RIDDLES = [
  { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', a: 'An echo' },
  { q: 'The more of me you take, the more you leave behind. What am I?', a: 'Footsteps' },
  { q: 'What has keys but can\'t open a single lock?', a: 'A piano' },
  { q: 'What runs but never walks, has a mouth but never talks, has a bed but never sleeps?', a: 'A river' },
  { q: 'What gets wetter the more it dries?', a: 'A towel' },
  { q: 'I\'m tall when I\'m young, and short when I\'m old. What am I?', a: 'A candle' },
  { q: 'What has a face and two hands but no arms or legs?', a: 'A clock' },
  { q: 'The person who makes me has no need of me; the person who buys me has no use for me; the person who uses me can neither see nor feel me. What am I?', a: 'A coffin' },
];
const WYR = [
  'Would you rather always say everything on your mind or never speak again?',
  'Would you rather fight one horse-sized duck or 100 duck-sized horses?',
  'Would you rather have unlimited money or unlimited time?',
  'Would you rather know the date of your success or the way you will achieve it?',
  'Would you rather live without internet or without AC for a year?',
  'Would you rather be able to fly or be invisible?',
  'Would you rather always be 10 minutes late or always 20 minutes early?',
  'Would you rather lose your phone or your wallet?',
  'Would you rather talk like a robot or sing everything you say?',
  'Would you rather have a personal chef or a personal driver?',
];
const NEVER = [
  'Never have I ever fallen asleep during a movie at the cinema.',
  'Never have I ever sent a text to the wrong person.',
  'Never have I ever pretended to know a song\'s lyrics and just mumbled along.',
  'Never have I ever eaten a whole pizza by myself.',
  'Never have I ever stalked someone\'s social media for more than an hour.',
  'Never have I ever forgotten a close friend\'s birthday.',
  'Never have I ever lied about my age.',
  'Never have I ever danced in front of the mirror like a celebrity.',
];
const COMPLIMENTS = [
  'You have the kind of smile that fixes bad days.', 'Your energy makes every group better.',
  'You are smarter than you give yourself credit for.', 'People look up to you more than you know.',
  'Your vibe is unmatched — keep shining.', 'You make ordinary moments feel special.',
];
const ROASTS = [
  'You are proof that even evolution takes a day off sometimes.',
  'Your secrets are safe with me. I never listen when you tell me them anyway.',
  'You bring everyone so much joy — when you leave the room.',
  'Your Wi-Fi signal is stronger than your arguments.',
  'If laziness were a sport, you would come second — too lazy to win.',
  'You are like a cloud: when you disappear, it\'s a beautiful day.',
];
const PICKUPS = [
  'Are you a magician? Because whenever I look at you, everyone else disappears.',
  'Do you have a map? I keep getting lost in your eyes.',
  'Is your name Google? Because you have everything I have been searching for.',
  'Are you Wi-Fi? Because I am really feeling the connection.',
  'Do you believe in love at first sight, or should I walk by again?',
];
const SHAYARI = [
  'Mohabbat mein nahi hai farq jeene aur marne ka,\nUsi ko dekh kar jeete hain jis kafir pe dum nikle. — Ghalib',
  'Hazaaron khwahishen aisi ke har khwahish pe dum nikle,\nBahut nikle mere armaan lekin phir bhi kam nikle. — Ghalib',
  'Dil-e-nadaan tujhe hua kya hai,\nAakhir is dard ki dawa kya hai. — Ghalib',
  'Sitaaron se aage jahaan aur bhi hain,\nAbhi ishq ke imtihaan aur bhi hain. — Iqbal',
  'Khudi ko kar buland itna ke har taqdeer se pehle,\nKhuda bande se khud pooche, bata teri raza kya hai. — Iqbal',
];
const FLIRT = [
  'Warning: talking to you should come with a distraction alert.',
  'You must be tired — from running through my mind all day.',
  'If smiles were currency, you would be a billionaire.',
  'Your name must be "favorite notification".',
];
const GOODNIGHT = [
  'Good night! May your dreams be as sweet as you are. 🌙',
  'Sleep tight — tomorrow is another chance to shine. ✨',
  'Good night! Recharge well, legend. 🌙',
  'May the moon watch over your sleep tonight. Good night! 🌟',
];
const MOTIVATION_LOCAL = [
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'Don\'t watch the clock; do what it does — keep going.',
  'Your limitation is only your imagination.',
  'Push yourself, because no one else is going to do it for you.',
];
const QUOTES_LOCAL = [
  'The best way to predict the future is to invent it. — Alan Kay',
  'In the middle of difficulty lies opportunity. — Albert Einstein',
  'Simplicity is the soul of efficiency. — Austin Freeman',
  'Whatever you are, be a good one. — Abraham Lincoln',
];

cmd({ pattern: 'truth', category: 'Fun', desc: 'Random truth question', run: async (ctx) => ctx.reply('🎯 *Truth:*\n' + pickRand(TRUTHS)) });
cmd({ pattern: 'dare', category: 'Fun', desc: 'Random dare challenge', run: async (ctx) => ctx.reply('🔥 *Dare:*\n' + pickRand(DARES)) });
cmd({ pattern: 'tod', alias: ['truthordare'], category: 'Fun', desc: 'Truth or dare (random)',
  run: async (ctx) => ctx.reply(Math.random() < 0.5 ? '🎯 *Truth:*\n' + pickRand(TRUTHS) : '🔥 *Dare:*\n' + pickRand(DARES)) });

cmd({
  pattern: 'joke', alias: ['jokes'], category: 'Fun', desc: 'Random joke',
  async run(ctx) {
    try {
      const j = await fetchJson('https://v2.jokeapi.dev/joke/Any?safe-mode&type=single');
      const joke = pick(j, 'joke');
      if (!joke) throw new ApiError('no joke');
      await ctx.reply('😂 ' + joke);
    } catch { await ctx.reply('😂 ' + pickRand(JOKES_LOCAL)); }
  },
});

cmd({
  pattern: 'meme', category: 'Fun', desc: 'Random meme image',
  async run(ctx) {
    try {
      const j = await fetchJson('https://meme-api.com/gimme');
      const url = pick(j, 'url');
      if (!url) throw new ApiError('no meme');
      await ctx.sendImage(url, '😂 ' + (pick(j, 'title') || 'Meme'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'quote', alias: ['quotes'], category: 'Fun', desc: 'Random inspirational quote',
  async run(ctx) {
    try {
      const j = await fetchJson('https://dummyjson.com/quotes/random');
      const q = pick(j, 'quote');
      if (!q) throw new ApiError('no quote');
      await ctx.reply(`💬 *"${q}"*\n— ${pick(j, 'author') || 'Unknown'}`);
    } catch { await ctx.reply('💬 ' + pickRand(QUOTES_LOCAL)); }
  },
});

cmd({
  pattern: 'motivation', alias: ['motivational'], category: 'Fun', desc: 'Motivational quote',
  async run(ctx) {
    try {
      const j = await fetchJson('https://zenquotes.io/api/random');
      const q = pick(j, '0.q');
      if (!q) throw new ApiError('no quote');
      await ctx.reply(`🔥 *"${q}"*\n— ${pick(j, '0.a') || 'Unknown'}`);
    } catch { await ctx.reply('🔥 ' + pickRand(MOTIVATION_LOCAL)); }
  },
});

cmd({
  pattern: 'advice', category: 'Fun', desc: 'Random piece of advice',
  async run(ctx) {
    try {
      const j = await fetchJson('https://api.adviceslip.com/advice');
      const a = pick(j, 'slip.advice');
      if (!a) throw new ApiError('no advice');
      await ctx.reply('🧭 *Advice:*\n' + a);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'fact', category: 'Fun', desc: 'Random fun fact',
  async run(ctx) {
    try {
      const j = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
      const f = pick(j, 'text');
      if (!f) throw new ApiError('no fact');
      await ctx.reply('🤯 *Fact:*\n' + f);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'catfact', category: 'Fun', desc: 'Random cat fact',
  async run(ctx) {
    try {
      const j = await fetchJson('https://catfact.ninja/fact');
      await ctx.reply('🐱 ' + (pick(j, 'fact') || 'Cats are great.'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({ pattern: 'riddle', category: 'Fun', desc: 'Random riddle (answer hidden)',
  async run(ctx) {
    const r = pickRand(RIDDLES);
    await ctx.reply('🧩 *Riddle:*\n' + r.q + '\n\n||Answer: ' + r.a + '||');
  },
});

cmd({ pattern: '8ball', alias: ['magicball'], category: 'Fun', desc: 'Ask the magic 8-ball',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: 8ball <your yes/no question>');
    const answers = ['Yes, definitely.', 'No way.', 'Ask again later.', 'Signs point to yes.', 'Don\'t count on it.', 'Absolutely!', 'Very doubtful.', 'It is certain.', 'Maybe — the stars are unclear.', 'Outlook good.'];
    await ctx.reply('🎱 *Q:* ' + ctx.text + '\n*A:* ' + pickRand(answers));
  },
});

cmd({ pattern: 'coinflip', alias: ['flip'], category: 'Fun', desc: 'Flip a coin',
  run: async (ctx) => ctx.reply('🪙 The coin landed on: *' + (Math.random() < 0.5 ? 'HEADS' : 'TAILS') + '*') });
cmd({ pattern: 'dice', alias: ['roll'], category: 'Fun', desc: 'Roll a dice (dice <sides?>)',
  async run(ctx) {
    const sides = Math.min(100, Math.max(2, parseInt(ctx.args[0]) || 6));
    await ctx.reply(`🎲 You rolled a *${1 + Math.floor(Math.random() * sides)}* (d${sides})`);
  },
});
cmd({ pattern: 'slot', category: 'Fun', desc: 'Slot machine mini-game',
  async run(ctx) {
    const syms = ['🍒', '🍋', '🍇', '⭐', '💎', '7️⃣'];
    const r = [pickRand(syms), pickRand(syms), pickRand(syms)];
    const win = r[0] === r[1] && r[1] === r[2];
    await ctx.reply(`🎰 | ${r.join(' | ')} |\n${win ? '🎉 JACKPOT! All three match!' : 'No win — try again!'}`);
  },
});
cmd({ pattern: 'choose', alias: ['pick'], category: 'Fun', desc: 'Choose between options: choose tea | coffee',
  async run(ctx) {
    const opts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) return ctx.reply('Usage: choose <option 1> | <option 2> [| more]');
    await ctx.reply('🤔 I choose: *' + pickRand(opts) + '*');
  },
});

cmd({
  pattern: 'ship', category: 'Fun', desc: 'Ship two people (@mention two users)',
  async run(ctx) {
    const [a, b] = ctx.mentioned;
    if (!a || !b) return ctx.reply('Usage: ship @user1 @user2');
    const pct = 20 + Math.floor(Math.random() * 81);
    const hearts = '❤️'.repeat(Math.max(1, Math.round(pct / 20)));
    await ctx.reply(`💘 *Ship-o-meter*\n@${jidNum(a)} × @${jidNum(b)}\n\n${hearts} ${pct}% match!`, { mentions: [a, b] });
  },
});

cmd({
  pattern: 'love', alias: ['lovecalc'], category: 'Fun', desc: 'Love calculator for two names: love Ali | Sara',
  async run(ctx) {
    const parts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return ctx.reply('Usage: love <name 1> | <name 2>');
    const seed = [...(parts[0] + parts[1]).toLowerCase()].reduce((s, c) => s + c.charCodeAt(0), 0);
    const pct = 35 + (seed % 66);
    await ctx.reply(`💖 *${parts[0]}* + *${parts[1]}* = *${pct}%* compatible!`);
  },
});

cmd({
  pattern: 'rate', category: 'Fun', desc: 'Rate anything out of 10: rate my cooking',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: rate <anything>');
    const seed = [...ctx.text.toLowerCase()].reduce((s, c) => s + c.charCodeAt(0), 0);
    await ctx.reply(`⭐ I rate *${ctx.text}* a *${1 + (seed % 10)}/10*`);
  },
});

cmd({ pattern: 'compliment', category: 'Fun', desc: 'Get a compliment (mention someone to send it to them)',
  async run(ctx) {
    const target = ctx.targetJid();
    const text = pickRand(COMPLIMENTS);
    if (target && target !== ctx.sender) return ctx.reply(`💐 @${jidNum(target)}, ${text}`, { mentions: [target] });
    await ctx.reply('💐 ' + text);
  },
});
cmd({ pattern: 'roast', category: 'Fun', desc: 'A light, friendly roast (mention someone)',
  async run(ctx) {
    const target = ctx.targetJid();
    const text = pickRand(ROASTS);
    if (target && target !== ctx.sender) return ctx.reply(`🔥 @${jidNum(target)} — ${text}`, { mentions: [target] });
    await ctx.reply('🔥 ' + text);
  },
});
cmd({ pattern: 'pickup', alias: ['pickupline'], category: 'Fun', desc: 'Random pickup line',
  run: async (ctx) => ctx.reply('😉 ' + pickRand(PICKUPS)) });
cmd({ pattern: 'wyr', alias: ['wouldyourather'], category: 'Fun', desc: 'Would you rather...?',
  run: async (ctx) => ctx.reply('🤔 ' + pickRand(WYR)) });
cmd({ pattern: 'neverhave', alias: ['nhie'], category: 'Fun', desc: 'Never have I ever...',
  run: async (ctx) => ctx.reply('🙋 ' + pickRand(NEVER)) });
cmd({ pattern: 'shayari', category: 'Fun', desc: 'Urdu shayari (Ghalib / Iqbal)',
  run: async (ctx) => ctx.reply('🖋️\n' + pickRand(SHAYARI)) });
cmd({ pattern: 'flirt', category: 'Fun', desc: 'A flirty line',
  run: async (ctx) => ctx.reply('💌 ' + pickRand(FLIRT)) });
cmd({ pattern: 'goodnight', alias: ['gn'], category: 'Fun', desc: 'Good night wish',
  run: async (ctx) => ctx.reply('🌙 ' + pickRand(GOODNIGHT)) });
cmd({ pattern: 'birthdaywish', alias: ['bday'], category: 'Fun', desc: 'Birthday wish message',
  run: async (ctx) => ctx.reply('🎂 Happy Birthday! May your year be full of success, laughter and cake. Many happy returns of the day! 🎉') });
cmd({ pattern: 'congrats', category: 'Fun', desc: 'Congratulations message',
  run: async (ctx) => ctx.reply('🎉 Congratulations! Your hard work paid off — this is just the beginning. Keep shining! 🏆') });

cmd({
  pattern: 'hack', category: 'Fun', desc: 'Fake "hacking" prank (just for laughs)',
  async run(ctx) {
    const target = ctx.targetJid();
    const who = target ? '@' + jidNum(target) : 'target';
    await ctx.reply(`💻 *Initiating hack on ${who}...*\n[████░░░░░░] 40%\n[███████░░░] 70%\n[██████████] 100%\n\n✅ Access granted!\n📂 Downloading memes folder...\n😂 Just kidding — this is a prank. No one was hacked.`, target ? { mentions: [target] } : {});
  },
});

// ── Animal pictures ───────────────────────────────────────────────────────────
function animalCmd(pattern, label, fn) {
  cmd({
    pattern, category: 'Fun', desc: label,
    async run(ctx) {
      try { await fn(ctx); } catch { await ctx.reply(API_DOWN); }
    },
  });
}
animalCmd('cat', 'Random cat picture', async (ctx) => {
  const j = await fetchJson('https://api.thecatapi.com/v1/images/search');
  const url = pick(j, '0.url');
  if (!url) throw new ApiError('no cat');
  await ctx.sendImage(url, '🐱 Meow!');
});
animalCmd('dog', 'Random dog picture', async (ctx) => {
  const j = await fetchJson('https://dog.ceo/api/breeds/image/random');
  const url = pick(j, 'message');
  if (!url) throw new ApiError('no dog');
  await ctx.sendImage(url, '🐶 Woof!');
});
animalCmd('fox', 'Random fox picture', async (ctx) => {
  const j = await fetchJson('https://randomfox.ca/floof/');
  const url = pick(j, 'image');
  if (!url) throw new ApiError('no fox');
  await ctx.sendImage(url, '🦊 Fox!');
});
animalCmd('panda', 'Random panda picture', async (ctx) => {
  const j = await fetchJson('https://some-random-api.com/animal/red_panda');
  const url = pick(j, 'image');
  if (!url) throw new ApiError('no panda');
  await ctx.sendImage(url, '🐼 Panda!');
});
animalCmd('duck', 'Random duck picture', async (ctx) => {
  const j = await fetchJson('https://random-d.uk/api/random');
  const url = pick(j, 'url');
  if (!url) throw new ApiError('no duck');
  await ctx.sendImage(url, '🦆 Quack!');
});
animalCmd('coffee', 'Random coffee picture', async (ctx) => {
  const j = await fetchJson('https://coffee.alexflipnote.dev/random.json');
  const url = pick(j, 'file');
  if (!url) throw new ApiError('no coffee');
  await ctx.sendImage(url, '☕ Coffee time!');
});

// ── Number guessing game (per-chat state) ─────────────────────────────────────
const games = new Map();
cmd({
  pattern: 'guess', category: 'Fun', desc: 'Number guessing game: guess (start) / guess <number>',
  async run(ctx) {
    const g = games.get(ctx.chat);
    const n = parseInt(ctx.args[0]);
    if (!g) {
      games.set(ctx.chat, { num: 1 + Math.floor(Math.random() * 50), tries: 0 });
      return ctx.reply('🎮 *Guessing game started!* I picked a number between 1 and 50.\nGuess with: guess <number>');
    }
    if (isNaN(n)) return ctx.reply('Guess a number with: guess <number> (1-50). Tries so far: ' + g.tries);
    g.tries++;
    if (n === g.num) {
      games.delete(ctx.chat);
      return ctx.reply(`🎉 *Correct!* The number was ${g.num}. You got it in ${g.tries} tries!`);
    }
    await ctx.reply(n < g.num ? '📈 Too low! Try higher.' : '📉 Too high! Try lower.');
  },
});
