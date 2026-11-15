// ─── Group: administration, protection toggles, member tools ─────────────────

import { cmd } from '../lib/registry.js';
import { groupSettings, save } from '../lib/store.js';
import { jidNum, numToJid, API_DOWN } from '../lib/helpers.js';
import { unwrapMessage } from '../lib/media.js';

function toggle(pattern, key, label, desc, withText) {
  cmd({
    pattern, category: 'Group', desc, group: true, admin: true,
    async run(ctx) {
      const g = groupSettings(ctx.chat);
      const arg = (ctx.args[0] || '').toLowerCase();
      if (withText && ctx.text && !['on', 'off'].includes(arg)) {
        g[key] = ctx.text;
        save();
        return ctx.reply(`✅ ${label} text updated.`);
      }
      if (arg === 'on') g[key] = true;
      else if (arg === 'off') g[key] = false;
      else if (typeof g[key] === 'boolean') g[key] = !g[key];
      save();
      await ctx.reply(`⚙️ *${label}* is now *${g[key] ? 'ON' : 'OFF'}* for this group.`);
    },
  });
}

toggle('antilink', 'antilink', 'Anti-link', 'Auto-remove group invite links (admin)');
toggle('antidelete', 'antidelete', 'Anti-delete', 'Repost deleted messages (admin)');
toggle('welcome', 'welcome', 'Welcome messages', 'Welcome new members (admin)');
toggle('goodbye', 'goodbye', 'Goodbye messages', 'Say goodbye to leaving members (admin)');

cmd({
  pattern: 'setwelcome', category: 'Group', desc: 'Set custom welcome text (use @user, @group)', group: true, admin: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: setwelcome <text> — placeholders: @user @group');
    const g = groupSettings(ctx.chat);
    g.welcomeText = ctx.text; g.welcome = true; save();
    await ctx.reply('✅ Welcome message set and enabled.');
  },
});

cmd({
  pattern: 'setgoodbye', category: 'Group', desc: 'Set custom goodbye text (use @user, @group)', group: true, admin: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: setgoodbye <text> — placeholders: @user @group');
    const g = groupSettings(ctx.chat);
    g.goodbyeText = ctx.text; g.goodbye = true; save();
    await ctx.reply('✅ Goodbye message set and enabled.');
  },
});

cmd({
  pattern: 'antiword', category: 'Group', desc: 'Banned words: antiword add/del/list <word>', group: true, admin: true,
  async run(ctx) {
    const g = groupSettings(ctx.chat);
    const [action, ...rest] = ctx.args;
    const word = rest.join(' ').toLowerCase().trim();
    if (action === 'add' && word) {
      if (!g.antiword.includes(word)) g.antiword.push(word);
      save();
      return ctx.reply(`🚫 Banned word added: "${word}" (${g.antiword.length} total)`);
    }
    if (action === 'del' && word) {
      g.antiword = g.antiword.filter((w) => w !== word);
      save();
      return ctx.reply(`✅ Banned word removed: "${word}"`);
    }
    if (action === 'list') {
      return ctx.reply(g.antiword.length ? '🚫 *Banned words:*\n' + g.antiword.map((w) => '• ' + w).join('\n') : 'No banned words set. Add with: antiword add <word>');
    }
    await ctx.reply('Usage:\n• antiword add <word>\n• antiword del <word>\n• antiword list\nMessages containing a banned word are removed automatically.');
  },
});

async function memberAction(ctx, action) {
  const jid = ctx.targetJid();
  if (!jid) return ctx.reply(`Usage: ${action} <@user / reply / number>`);
  if (jidNum(jid) === ctx.botNum) return ctx.reply('⚠️ I cannot do that to myself.');
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], action);
    const labels = { remove: '👢 Removed', add: '✅ Added', promote: '⬆️ Promoted to admin', demote: '⬇️ Demoted to member' };
    await ctx.reply(`${labels[action]}: @${jidNum(jid)}`, { mentions: [jid] });
  } catch {
    await ctx.reply('⚠️ Action failed — check that the bot is admin and the number is valid.');
  }
}

cmd({ pattern: 'kick', alias: ['remove'], category: 'Group', desc: 'Remove a member', group: true, admin: true, botAdmin: true,
  run: (ctx) => memberAction(ctx, 'remove') });
cmd({ pattern: 'add', category: 'Group', desc: 'Add a member by number', group: true, admin: true, botAdmin: true,
  run: (ctx) => memberAction(ctx, 'add') });
cmd({ pattern: 'promote', alias: ['toadmin'], category: 'Group', desc: 'Promote a member to admin', group: true, admin: true, botAdmin: true,
  run: (ctx) => memberAction(ctx, 'promote') });
cmd({ pattern: 'demote', category: 'Group', desc: 'Demote an admin to member', group: true, admin: true, botAdmin: true,
  run: (ctx) => memberAction(ctx, 'demote') });

cmd({
  pattern: 'tagall', alias: ['everyone'], category: 'Group', desc: 'Mention every group member', group: true,
  async run(ctx) {
    const parts = await ctx.participants();
    const text = ctx.text || '📣 Attention everyone!';
    await ctx.sock.sendMessage(ctx.chat, {
      text: `╭──〔 📣 TAG ALL 〕\n${text}\n\n` + parts.map((p) => '• @' + jidNum(p.id)).join('\n'),
      mentions: parts.map((p) => p.id),
    }, { quoted: ctx.msg });
  },
});

cmd({
  pattern: 'hidetag', alias: ['htag'], category: 'Group', desc: 'Send a message mentioning everyone silently', group: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: hidetag <message>');
    const parts = await ctx.participants();
    await ctx.sock.sendMessage(ctx.chat, { text: ctx.text, mentions: parts.map((p) => p.id) });
  },
});

cmd({
  pattern: 'tagadmins', alias: ['admins', 'listadmins'], category: 'Group', desc: 'List/mention group admins', group: true,
  async run(ctx) {
    const parts = await ctx.participants();
    const admins = parts.filter((p) => p.admin);
    if (!admins.length) return ctx.reply('No admins found.');
    await ctx.sock.sendMessage(ctx.chat, {
      text: '👮 *Group admins:*\n' + admins.map((p) => '• @' + jidNum(p.id) + (p.admin === 'superadmin' ? ' (owner)' : '')).join('\n'),
      mentions: admins.map((p) => p.id),
    }, { quoted: ctx.msg });
  },
});

cmd({
  pattern: 'groupinfo', alias: ['ginfo', 'gcinfo'], category: 'Group', desc: 'Group information', group: true,
  async run(ctx) {
    const meta = await ctx.groupMeta();
    const parts = await ctx.participants();
    const admins = parts.filter((p) => p.admin).length;
    await ctx.reply(
      `👥 *${meta.subject || 'Group'}*\n🆔 ${ctx.chat}\n👤 Owner: ${meta.owner ? '@' + jidNum(meta.owner) : 'unknown'}\n👥 Members: ${parts.length} (${admins} admins)\n📝 ${meta.desc || 'No description'}`,
      meta.owner ? { mentions: [meta.owner] } : {}
    );
  },
});

cmd({
  pattern: 'grouplink', alias: ['invite', 'linkgc'], category: 'Group', desc: 'Get the group invite link', group: true, botAdmin: true,
  async run(ctx) {
    try {
      const code = await ctx.sock.groupInviteCode(ctx.chat);
      await ctx.reply('🔗 Group link:\nhttps://chat.whatsapp.com/' + code);
    } catch {
      await ctx.reply('⚠️ Could not fetch the invite link.');
    }
  },
});

cmd({
  pattern: 'revokelink', alias: ['resetlink'], category: 'Group', desc: 'Revoke/reset the group invite link', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    try {
      const code = await ctx.sock.groupRevokeInvite(ctx.chat);
      await ctx.reply('♻️ Link reset. New link:\nhttps://chat.whatsapp.com/' + code);
    } catch {
      await ctx.reply('⚠️ Could not reset the invite link.');
    }
  },
});

cmd({
  pattern: 'setgname', alias: ['setsubject'], category: 'Group', desc: 'Change group name', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: setgname <new name>');
    await ctx.sock.groupUpdateSubject(ctx.chat, ctx.text.slice(0, 100));
    await ctx.reply('✅ Group name updated.');
  },
});

cmd({
  pattern: 'setgdesc', alias: ['setdesc'], category: 'Group', desc: 'Change group description', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    await ctx.sock.groupUpdateDescription(ctx.chat, ctx.text || '');
    await ctx.reply('✅ Group description updated.');
  },
});

cmd({
  pattern: 'setgcpp', alias: ['setgpp'], category: 'Group', desc: 'Set group picture (reply to image)', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    if (ctx.quotedType() !== 'imageMessage') return ctx.reply('Reply to an image with setgcpp.');
    try {
      const buf = await ctx.downloadQuoted();
      await ctx.sock.updateProfilePicture(ctx.chat, buf);
      await ctx.reply('✅ Group picture updated.');
    } catch {
      await ctx.reply('⚠️ Could not update the group picture.');
    }
  },
});

cmd({
  pattern: 'opengc', alias: ['open', 'unmute'], category: 'Group', desc: 'Open group (everyone can message)', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement');
    await ctx.reply('🔓 Group opened — everyone can send messages.');
  },
});

cmd({
  pattern: 'closegc', alias: ['close', 'mute'], category: 'Group', desc: 'Close group (admins only)', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement');
    await ctx.reply('🔒 Group closed — only admins can send messages.');
  },
});

cmd({
  pattern: 'warn', category: 'Group', desc: 'Warn a member (3 warns = kick)', group: true, admin: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: warn <@user / reply>');
    const g = groupSettings(ctx.chat);
    const num = jidNum(jid);
    g.warns[num] = (g.warns[num] || 0) + 1;
    const count = g.warns[num];
    save();
    if (count >= 3 && ctx.isBotAdmin) {
      try { await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], 'remove'); } catch { /* ignore */ }
      delete g.warns[num]; save();
      return ctx.reply(`⛔ @${num} reached 3 warnings and was removed.`, { mentions: [jid] });
    }
    await ctx.reply(`⚠️ Warning ${count}/3 for @${num}`, { mentions: [jid] });
  },
});

cmd({
  pattern: 'warnings', alias: ['warnlist'], category: 'Group', desc: 'Show warnings for a member', group: true,
  async run(ctx) {
    const g = groupSettings(ctx.chat);
    const jid = ctx.targetJid();
    if (jid) {
      return ctx.reply(`⚠️ @${jidNum(jid)} has ${g.warns[jidNum(jid)] || 0}/3 warnings.`, { mentions: [jid] });
    }
    const entries = Object.entries(g.warns);
    if (!entries.length) return ctx.reply('No warnings recorded in this group.');
    await ctx.reply('⚠️ *Warnings:*\n' + entries.map(([n, c]) => `• @${n}: ${c}/3`).join('\n'), {
      mentions: entries.map(([n]) => numToJid(n)).filter(Boolean),
    });
  },
});

cmd({
  pattern: 'resetwarn', alias: ['delwarn'], category: 'Group', desc: 'Reset a member\'s warnings', group: true, admin: true,
  async run(ctx) {
    const jid = ctx.targetJid();
    if (!jid) return ctx.reply('Usage: resetwarn <@user / reply>');
    const g = groupSettings(ctx.chat);
    delete g.warns[jidNum(jid)];
    save();
    await ctx.reply('✅ Warnings reset for @' + jidNum(jid), { mentions: [jid] });
  },
});

cmd({
  pattern: 'delmsg', alias: ['del', 'delete'], category: 'Group', desc: 'Delete the quoted message', group: true,
  async run(ctx) {
    if (!ctx.quoted) return ctx.reply('Reply to a message with delmsg to delete it.');
    try {
      await ctx.sock.sendMessage(ctx.chat, { delete: ctx.quoted.key });
      await ctx.react('✅');
    } catch {
      await ctx.reply('⚠️ Could not delete that message.');
    }
  },
});

cmd({
  pattern: 'viewonce', alias: ['rvo', 'vv'], category: 'Group', desc: 'Reveal a quoted view-once media in chat',
  async run(ctx) {
    const q = ctx.quoted;
    if (!q) return ctx.reply('Reply to a view-once photo/video with viewonce.');
    const inner = unwrapMessage(q);
    const type = Object.keys(inner)[0] || '';
    if (!/imageMessage|videoMessage/.test(type)) {
      return ctx.reply('Reply to a view-once photo or video.');
    }
    try {
      const buf = await ctx.downloadQuoted();
      if (type === 'imageMessage') await ctx.sendImage(buf, '👁️ View-once revealed');
      else await ctx.sendVideo(buf, '👁️ View-once revealed');
    } catch {
      await ctx.reply('⚠️ Could not download that media.');
    }
  },
});

cmd({
  pattern: 'members', alias: ['membercount'], category: 'Group', desc: 'Group member count', group: true,
  async run(ctx) {
    const parts = await ctx.participants();
    const admins = parts.filter((p) => p.admin).length;
    await ctx.reply(`👥 Members: *${parts.length}*\n👮 Admins: *${admins}*`);
  },
});

cmd({
  pattern: 'poll', category: 'Group', desc: 'Create a poll: poll Question | opt1 | opt2', group: true,
  async run(ctx) {
    const parts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return ctx.reply('Usage: poll <question> | <option 1> | <option 2> [| more]');
    const [question, ...values] = parts;
    await ctx.sock.sendMessage(ctx.chat, {
      poll: { name: question, values: values.slice(0, 12), selectableCount: 1 },
    });
  },
});

cmd({
  pattern: 'requests', alias: ['joinrequests'], category: 'Group', desc: 'List pending join requests', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    try {
      const list = await ctx.sock.groupRequestParticipantsList(ctx.chat);
      if (!list || !list.length) return ctx.reply('No pending join requests.');
      await ctx.reply('📥 *Pending requests:*\n' + list.map((r) => '• @' + jidNum(r.jid)).join('\n'), {
        mentions: list.map((r) => r.jid),
      });
    } catch {
      await ctx.reply(API_DOWN);
    }
  },
});

cmd({
  pattern: 'acceptall', alias: ['approveall'], category: 'Group', desc: 'Accept all pending join requests', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    try {
      const list = await ctx.sock.groupRequestParticipantsList(ctx.chat);
      if (!list || !list.length) return ctx.reply('No pending join requests.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.chat, list.map((r) => r.jid), 'approve');
      await ctx.reply(`✅ Accepted ${list.length} join request(s).`);
    } catch {
      await ctx.reply('⚠️ Could not process join requests.');
    }
  },
});

cmd({
  pattern: 'rejectall', alias: ['declineall'], category: 'Group', desc: 'Reject all pending join requests', group: true, admin: true, botAdmin: true,
  async run(ctx) {
    try {
      const list = await ctx.sock.groupRequestParticipantsList(ctx.chat);
      if (!list || !list.length) return ctx.reply('No pending join requests.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.chat, list.map((r) => r.jid), 'reject');
      await ctx.reply(`❌ Rejected ${list.length} join request(s).`);
    } catch {
      await ctx.reply('⚠️ Could not process join requests.');
    }
  },
});

cmd({
  pattern: 'getpp', alias: ['userpp'], category: 'Group', desc: 'Get a user\'s profile picture',
  async run(ctx) {
    const jid = ctx.targetJid() || ctx.sender;
    try {
      const url = await ctx.sock.profilePictureUrl(jid, 'image');
      await ctx.sendImage(url, '🖼️ Profile picture of @' + jidNum(jid));
    } catch {
      await ctx.reply('⚠️ No profile picture found (or it is private).');
    }
  },
});

cmd({
  pattern: 'vcf', alias: ['savecontacts'], category: 'Group', desc: 'Export group members as a vCard (.vcf) file', group: true,
  async run(ctx) {
    const parts = await ctx.participants();
    if (!parts.length) return ctx.reply('No members found.');
    const cards = parts.map((p) => {
      const num = jidNum(p.id);
      return `BEGIN:VCARD\nVERSION:3.0\nFN:+${num}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`;
    }).join('\n');
    await ctx.sendDocument(Buffer.from(cards), 'group-contacts.vcf', 'text/vcard', `📇 ${parts.length} contacts exported.`);
  },
});

cmd({
  pattern: 'newgroup', alias: ['newgc'], category: 'Owner', desc: 'Create a new group with the mentioned users', group: false, owner: true,
  async run(ctx) {
    const name = ctx.text.replace(/@\d+/g, '').trim() || 'Dark Zone MD Group';
    const members = ctx.mentioned.length ? ctx.mentioned : [ctx.sender];
    try {
      const g = await ctx.sock.groupCreate(name, members);
      let link = '';
      try { link = '\nhttps://chat.whatsapp.com/' + (await ctx.sock.groupInviteCode(g.id)); } catch { /* ignore */ }
      await ctx.reply(`✅ Group *${name}* created.${link}`);
    } catch {
      await ctx.reply('⚠️ Could not create the group.');
    }
  },
});
