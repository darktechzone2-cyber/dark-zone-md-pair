// ─── General: menus + bot info ───────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { cmd, commands, byCategory } from '../lib/registry.js';
import { getMode, getPrefix } from '../lib/store.js';
import { runtimeStr } from '../lib/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, '..', 'assets', 'menu-logo.png');

const CAT_EMOJI = {
  General: '🧭', AI: '🤖', Downloader: '⬇️', Logo: '🎨', Sticker: '🏷️',
  Tools: '🧰', Group: '👥', Search: '🔎', Fun: '🎲', Anime: '🌸', Owner: '👑',
};

function header(ctx) {
  const p = getPrefix();
  return [
    `╭━━━〔 *${config.BOT_NAME}* 〕━━━╮`,
    `┃ 👤 User: @${ctx.senderNum}`,
    `┃ ⚙️ Mode: ${getMode()}`,
    `┃ 🔣 Prefix: ${p}`,
    `┃ 📚 Commands: ${commands.length}`,
    `╰━━━━━━━━━━━━━━━━━━━━╯`,
  ].join('\n');
}

function categoryBlock(cat, list, p) {
  const lines = [`\n╭──〔 ${CAT_EMOJI[cat] || '•'} *${cat.toUpperCase()}* 〕`];
  for (const c of list) lines.push(`┃ ${p}${c.pattern}${c.desc ? ' — ' + c.desc : ''}`);
  lines.push('╰' + '─'.repeat(24));
  return lines.join('\n');
}

cmd({
  pattern: 'menu', alias: ['help', 'helpmenu'], category: 'General',
  desc: 'Show the main menu',
  async run(ctx) {
    const p = getPrefix();
    const cats = byCategory();
    const menuText =
      header(ctx) +
      `\n\n👋 Hello @${ctx.senderNum}, I am *${config.BOT_NAME}* — a powerful WhatsApp MD bot.\n` +
      [...cats.keys()].map((c) => `\n${CAT_EMOJI[c] || '•'} *${c}* — ${p}${c.toLowerCase()}menu`).join('') +
      `\n\nType ${p}allmenu to see every command.\n🌐 ${config.REPO_URL}`;
    try {
      const img = fs.readFileSync(logoPath);
      await ctx.sock.sendMessage(
        ctx.chat,
        { image: img, caption: menuText, mentions: [ctx.sender] },
        { quoted: ctx.msg }
      );
    } catch {
      await ctx.reply(menuText);
    }
  },
});

cmd({
  pattern: 'allmenu', alias: ['list', 'listmenu', 'fullmenu'], category: 'General',
  desc: 'Show ALL commands',
  async run(ctx) {
    const p = getPrefix();
    let out = header(ctx);
    for (const [cat, list] of byCategory()) out += '\n' + categoryBlock(cat, list, p);
    await ctx.reply(out);
  },
});

// Per-category menu commands: .aimenu, .dlmenu, ...
const MENU_DEFS = [
  ['aimenu', 'AI'], ['dlmenu', 'Downloader'], ['downloadermenu', 'Downloader'],
  ['logomenu', 'Logo'], ['stickermenu', 'Sticker'], ['toolsmenu', 'Tools'],
  ['groupmenu', 'Group'], ['funmenu', 'Fun'], ['animemenu', 'Anime'],
  ['searchmenu', 'Search'], ['ownermenu', 'Owner'], ['generalmenu', 'General'],
];
for (const [pattern, cat] of MENU_DEFS) {
  cmd({
    pattern, category: 'General', desc: `Show ${cat} commands`,
    async run(ctx) {
      const list = byCategory().get(cat) || [];
      await ctx.reply(header(ctx) + '\n' + categoryBlock(cat, list, getPrefix()));
    },
  });
}

cmd({
  pattern: 'alive', alias: ['test', 'checkstatus'], category: 'General',
  desc: 'Check if the bot is alive',
  async run(ctx) {
    await ctx.reply(
      `✅ *${config.BOT_NAME} is alive and working!*\n⏱️ Uptime: ${runtimeStr(Date.now() - global.__dzmStart || 0)}\n⚙️ Mode: ${getMode()}`
    );
  },
});

cmd({
  pattern: 'ping', alias: ['speed'], category: 'General',
  desc: 'Check bot response speed',
  async run(ctx) {
    const t0 = Date.now();
    const sent = await ctx.reply('🏓 Pinging...');
    const ms = Date.now() - t0;
    try {
      await ctx.sock.sendMessage(ctx.chat, { text: `🏓 *Pong!* ${ms} ms`, edit: sent.key });
    } catch {
      await ctx.reply(`🏓 *Pong!* ${ms} ms`);
    }
  },
});

cmd({
  pattern: 'runtime', category: 'General',
  desc: 'Bot uptime',
  async run(ctx) {
    await ctx.reply(`⏱️ *Uptime:* ${runtimeStr(Date.now() - (global.__dzmStart || Date.now()))}`);
  },
});

cmd({
  pattern: 'owner', alias: ['creator'], category: 'General',
  desc: 'Bot owner info',
  async run(ctx) {
    const num = config.OWNER_NUMBER;
    await ctx.sock.sendMessage(
      ctx.chat,
      {
        contacts: {
          displayName: config.OWNER_NAME,
          contacts: [{
            vcard:
              'BEGIN:VCARD\nVERSION:3.0\nFN:' + config.OWNER_NAME +
              '\nTEL;type=CELL;type=VOICE;waid=' + num + ':+' + num + '\nEND:VCARD',
          }],
        },
        text: `👑 *Owner:* ${config.OWNER_NAME}\n📱 wa.me/${num}`,
      },
      { quoted: ctx.msg }
    );
  },
});

cmd({
  pattern: 'repo', alias: ['script', 'sc', 'botrepo'], category: 'General',
  desc: 'Bot script / website link',
  async run(ctx) {
    await ctx.reply(`📦 *${config.BOT_NAME}*\n🌐 ${config.REPO_URL}\n\nA product of *Dark Tech Zone*.`);
  },
});

cmd({
  pattern: 'botinfo', alias: ['info', 'about'], category: 'General',
  desc: 'Bot information',
  async run(ctx) {
    const cats = byCategory();
    await ctx.reply(
      `🤖 *${config.BOT_NAME}*\n` +
      `📚 Commands: ${commands.length} in ${cats.size} categories\n` +
      `⚙️ Mode: ${getMode()} • Prefix: ${getPrefix()}\n` +
      `⏱️ Uptime: ${runtimeStr(Date.now() - (global.__dzmStart || Date.now()))}\n` +
      `🛠️ Engine: Baileys MD (multi-device)`
    );
  },
});

cmd({
  pattern: 'totalcmd', alias: ['cmdcount', 'totalcommands'], category: 'General',
  desc: 'Command count per category',
  async run(ctx) {
    const lines = [`📚 *Total commands: ${commands.length}*`];
    for (const [cat, list] of byCategory()) lines.push(`${CAT_EMOJI[cat] || '•'} ${cat}: ${list.length}`);
    await ctx.reply(lines.join('\n'));
  },
});

cmd({
  pattern: 'channel', alias: ['newsletter', 'wachannelinfo'], category: 'General',
  desc: 'Dark Tech Zone channels & links',
  async run(ctx) {
    await ctx.reply(
      `📣 *Dark Tech Zone*\n\n` +
      `🌐 Website: https://darktechzon.site/\n` +
      `▶️ YouTube: https://youtube.com/@darktechzone1\n` +
      `📢 WhatsApp Channel: Dark Tech Zone (auto-followed by this bot)\n\n` +
      `Learn. Build. Secure.`
    );
  },
});

cmd({
  pattern: 'support', alias: ['report', 'request'], category: 'General',
  desc: 'How to get support / request a feature',
  async run(ctx) {
    await ctx.reply(
      `🛟 *Support*\n\nMessage the owner with ${getPrefix()}owner, or join the Dark Tech Zone channel (${getPrefix()}channel) for updates, new tools and feature announcements.`
    );
  },
});

cmd({
  pattern: 'donate', category: 'General',
  desc: 'Support the project',
  async run(ctx) {
    await ctx.reply('❤️ Enjoying Dark Zone MD? Support Dark Tech Zone by joining and sharing our channel — type ' + getPrefix() + 'channel.');
  },
});
