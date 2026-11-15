// ─── Owner: bot administration (owner/sudo only) ─────────────────────────────

import config from '../config.js';
import { cmd, commands } from '../lib/registry.js';
import { getSettings, groupSettings, save, clearStore, getMode } from '../lib/store.js';
import { fetchText, jidNum, numToJid, runtimeStr, API_DOWN } from '../lib/helpers.js';

const S = () => getSettings();

function toggleCmd(pattern, key, label, desc) {
  cmd({
    pattern, category: 'Owner', desc, owner: true,
    async run(ctx) {
      const s = S();
      const arg = (ctx.args[0] || '').toLowerCase();
      if (arg === 'on') s[key] = true;
      else if (arg === 'off') s[key] = false;
      else s[key] = !s[key];
      save();
      await ctx.reply(`⚙️ *${label}* is now *${s[key] ? 'ON' : 'OFF'}*`);
    },
  });
}

toggleCmd('autoread', 'autoread', 'Auto-read messages', 'Toggle auto-read');
toggleCmd('autotyping', 'autotyping', 'Auto-typing presence', 'Toggle auto-typing');
toggleCmd('alwaysonline', 'alwaysonline', 'Always online presence', 'Toggle always-online');
toggleCmd('anticall', 'anticall', 'Anti-call (auto reject calls)', 'Toggle anti-call');
toggleCmd('pmblock', 'pmblock', 'PM blocker (block non-owner DMs)', 'Toggle PM blocker');
toggleCmd('chatbot', 'chatbot', 'AI chatbot auto-reply in DMs', 'Toggle AI chatbot');

cmd({
  pattern: 'broadcast', alias: ['bc'], category: 'Owner', desc: 'Broadcast text to all joined groups', owner: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: broadcast <text>');
    const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}));
    const jids = Object.keys(groups);
    let sent = 0;
    for (const jid of jids) {
      try { await ctx.sock.sendMessage(jid, { text: `📢 *Broadcast*\n\n${ctx.text}` }); sent++; } catch { /* skip */ }
    }
    await ctx.reply(`📢 Broadcast sent to ${sent}/${jids.length} groups.`);
  },
});

cmd({
  pattern: 'bcgc', category: 'Owner', desc: 'Broadcast quoted media/text to all groups', owner: true,
  async run(ctx) {
    const text = ctx.text || ctx.quotedText() || '';
    if (!text && !ctx.quoted) return ctx.reply('Usage: bcgc <text> (or reply to a message)');
    const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}));
    const jids = Object.keys(groups);
    let sent = 0;
    for (const jid of jids) {
      try { await ctx.sock.sendMessage(jid, { text: `📢 *Broadcast*\n\n${text}` }); sent++; } catch { /* skip */ }
    }
    await ctx.reply(`📢 Broadcast sent to ${sent}/${jids.length} groups.`);
  },
});

cmd({
  pattern: 'join', category: 'Owner', desc: 'Join a group via invite link', owner: true,
  async run(ctx) {
    const link = ctx.text || '';
    const code = (link.match(/chat\.whatsapp\.com\/(\S+)/) || [])[1];
    if (!code) return ctx.reply('Usage: join <group invite link>');
    try {
      const jid = await ctx.sock.groupAcceptInvite(code);
      await ctx.reply('✅ Joined group: ' + jid);
    } catch {
      await ctx.reply('⚠️ Could not join — the link may be invalid or revoked.');
    }
  },
});

cmd({
  pattern: 'leave', alias: ['exitgc'], category: 'Owner', desc: 'Make the bot leave this group', owner: true, group: true,
  async run(ctx) {
    await ctx.reply('👋 Leaving this group. Goodbye!');
    await ctx.sock.groupLeave(ctx.chat);
  },
});

cmd({
  pattern: 'block', category: 'Owner', desc: 'Block a user (mention/reply/number)', owner: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: block <@user / reply / number>');
    await ctx.sock.updateBlockStatus(jid, 'block');
    await ctx.reply('🚫 Blocked @' + jidNum(jid), { mentions: [jid] });
  },
});

cmd({
  pattern: 'unblock', category: 'Owner', desc: 'Unblock a user', owner: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: unblock <@user / reply / number>');
    await ctx.sock.updateBlockStatus(jid, 'unblock');
    await ctx.reply('✅ Unblocked @' + jidNum(jid), { mentions: [jid] });
  },
});

cmd({
  pattern: 'blocklist', alias: ['listblock'], category: 'Owner', desc: 'List blocked users', owner: true,
  async run(ctx) {
    let list = [];
    try { list = await ctx.sock.fetchBlocklist(); } catch { /* older baileys */ }
    if (!list || !list.length) return ctx.reply('🚫 Block list is empty.');
    await ctx.reply('🚫 *Blocked users:*\n' + list.map((j) => '• ' + jidNum(j)).join('\n'));
  },
});

cmd({
  pattern: 'restart', alias: ['reboot'], category: 'Owner', desc: 'Restart the bot', owner: true,
  async run(ctx) {
    await ctx.reply('♻️ Restarting Dark Zone MD...');
    if (!process.env.DZM_TEST) setTimeout(() => process.exit(0), 600);
  },
});

cmd({
  pattern: 'shutdown', alias: ['stopbot'], category: 'Owner', desc: 'Shut the bot down', owner: true,
  async run(ctx) {
    await ctx.reply('🛑 Shutting down. Start me again from the panel/host.');
    if (!process.env.DZM_TEST) setTimeout(() => process.exit(1), 600);
  },
});

cmd({
  pattern: 'mode', alias: ['setmode', 'botmode'], category: 'Owner', desc: 'Switch public/private mode', owner: true,
  async run(ctx) {
    const s = S();
    const arg = (ctx.args[0] || '').toLowerCase();
    if (arg === 'public' || arg === 'private') s.mode = arg;
    else s.mode = getMode() === 'public' ? 'private' : 'public';
    save();
    await ctx.reply(`⚙️ Bot mode is now *${s.mode.toUpperCase()}*`);
  },
});

cmd({
  pattern: 'setprefix', alias: ['prefix'], category: 'Owner', desc: 'Change the command prefix', owner: true,
  async run(ctx) {
    const p = (ctx.args[0] || '').trim();
    if (!p || p.length > 3) return ctx.reply('Usage: setprefix <1-3 chars, e.g. !>');
    S().prefix = p;
    save();
    await ctx.reply('⚙️ Prefix changed to *' + p + '*');
  },
});

cmd({
  pattern: 'uptime', category: 'Owner', desc: 'Detailed uptime', owner: true,
  async run(ctx) {
    await ctx.reply(`⏱️ Uptime: ${runtimeStr(Date.now() - (global.__dzmStart || Date.now()))}\n📚 Commands loaded: ${commands.length}`);
  },
});

cmd({
  pattern: 'gjid', alias: ['groupjids'], category: 'Owner', desc: 'List JIDs of all joined groups', owner: true,
  async run(ctx) {
    const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}));
    const entries = Object.entries(groups);
    if (!entries.length) return ctx.reply('The bot is not in any group.');
    await ctx.reply('👥 *Groups:*\n' + entries.map(([jid, g]) => `• ${g.subject || ''}\n  ${jid}`).join('\n'));
  },
});

cmd({
  pattern: 'jid', category: 'Owner', desc: 'Get bot / user JID', owner: true,
  async run(ctx) {
    const target = ctx.targetJid() || ctx.sender;
    await ctx.reply('🆔 JID of @' + jidNum(target) + ':\n' + target, { mentions: [target] });
  },
});

cmd({
  pattern: 'onwa', category: 'Owner', desc: 'Check if a number is on WhatsApp', owner: true,
  async run(ctx) {
    const num = (ctx.args[0] || '').replace(/\D/g, '');
    if (!num) return ctx.reply('Usage: onwa <number with country code>');
    try {
      const [res] = await ctx.sock.onWhatsApp(num);
      await ctx.reply(res && res.exists ? `✅ +${num} is on WhatsApp.\nJID: ${res.jid}` : `❌ +${num} is NOT on WhatsApp.`);
    } catch {
      await ctx.reply(API_DOWN);
    }
  },
});

cmd({
  pattern: 'setppbot', category: 'Owner', desc: 'Set bot profile picture (reply to image)', owner: true,
  async run(ctx) {
    if (ctx.quotedType() !== 'imageMessage') return ctx.reply('Reply to an image with setppbot.');
    try {
      const buf = await ctx.downloadQuoted();
      await ctx.sock.updateProfilePicture(ctx.botJid, buf);
      await ctx.reply('✅ Bot profile picture updated.');
    } catch {
      await ctx.reply('⚠️ Could not update the profile picture.');
    }
  },
});

cmd({
  pattern: 'setname', alias: ['setbotname'], category: 'Owner', desc: 'Set bot profile name', owner: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: setname <new name>');
    await ctx.sock.updateProfileName(ctx.text.slice(0, 25));
    await ctx.reply('✅ Bot name updated to: ' + ctx.text.slice(0, 25));
  },
});

cmd({
  pattern: 'setbio', alias: ['setstatus'], category: 'Owner', desc: 'Set bot profile status/bio', owner: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: setbio <text>');
    await ctx.sock.updateProfileStatus(ctx.text.slice(0, 139));
    await ctx.reply('✅ Bot bio updated.');
  },
});

cmd({
  pattern: 'addsudo', category: 'Owner', desc: 'Add a sudo (owner-level) user', owner: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: addsudo <@user / reply / number>');
    const s = S();
    const num = jidNum(jid);
    if (!s.sudo.includes(num)) s.sudo.push(num);
    save();
    await ctx.reply('👑 @' + num + ' is now a sudo user.', { mentions: [jid] });
  },
});

cmd({
  pattern: 'delsudo', category: 'Owner', desc: 'Remove a sudo user', owner: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: delsudo <@user / reply / number>');
    const s = S();
    const num = jidNum(jid);
    s.sudo = s.sudo.filter((x) => String(x) !== num);
    save();
    await ctx.reply('✅ @' + num + ' removed from sudo.', { mentions: [jid] });
  },
});

cmd({
  pattern: 'listsudo', category: 'Owner', desc: 'List sudo users', owner: true,
  async run(ctx) {
    const s = S();
    const lines = ['👑 *Owner:* ' + jidNum(config.OWNER_NUMBER), '', '*Sudo users:*'];
    if (!s.sudo.length) lines.push('(none)');
    for (const n of s.sudo) lines.push('• ' + n);
    await ctx.reply(lines.join('\n'));
  },
});

cmd({
  pattern: 'clearstore', category: 'Owner', desc: 'Clear the anti-delete message store', owner: true,
  async run(ctx) {
    clearStore();
    await ctx.reply('🧹 Anti-delete message store cleared.');
  },
});

cmd({
  pattern: 'statuspost', alias: ['poststatus'], category: 'Owner', desc: 'Post a text status', owner: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: statuspost <text>');
    await ctx.sock.sendMessage('status@broadcast', { text: ctx.text });
    await ctx.reply('✅ Status posted.');
  },
});

cmd({
  pattern: 'inspect', category: 'Owner', desc: 'Inspect a user (WhatsApp check + JID)', owner: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: inspect <@user / reply / number>');
    const num = jidNum(jid);
    let exists = 'unknown';
    try {
      const [res] = await ctx.sock.onWhatsApp(num);
      exists = res && res.exists ? 'yes' : 'no';
    } catch { /* keep unknown */ }
    await ctx.reply(`🔍 *Inspect*\nNumber: ${num}\nJID: ${jid}\nOn WhatsApp: ${exists}`, { mentions: [jid] });
  },
});

cmd({
  pattern: 'allvar', alias: ['settings', 'vars'], category: 'Owner', desc: 'Show all bot settings', owner: true,
  async run(ctx) {
    const s = S();
    const rows = [
      ['Mode', getMode()], ['Autoread', s.autoread], ['Autotyping', s.autotyping],
      ['Always online', s.alwaysonline], ['Anticall', s.anticall], ['PM block', s.pmblock],
      ['Chatbot', s.chatbot], ['Sudo users', s.sudo.length],
    ];
    await ctx.reply('⚙️ *Dark Zone MD settings*\n' + rows.map(([k, v]) => `• ${k}: ${v}`).join('\n'));
  },
});
