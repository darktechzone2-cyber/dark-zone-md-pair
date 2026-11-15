// ─── Command registry + dispatcher ───────────────────────────────────────────
// Plugins call cmd({...}) to register. dispatch() applies guards and catches
// every error, so a broken command can never crash the bot or stay silent.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API_DOWN } from './helpers.js';

export const commands = [];
export const byName = new Map();

export function cmd(def) {
  if (!def || !def.pattern || typeof def.run !== 'function') {
    throw new Error('invalid command definition: ' + JSON.stringify(def && def.pattern));
  }
  const c = {
    alias: [],
    category: 'General',
    desc: '',
    owner: false,
    group: false,
    admin: false,
    botAdmin: false,
    ...def,
    pattern: String(def.pattern).toLowerCase(),
  };
  commands.push(c);
  byName.set(c.pattern, c);
  for (const a of c.alias) byName.set(String(a).toLowerCase(), c);
  return c;
}

export async function loadPlugins(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort();
  for (const f of files) {
    await import(pathToFileURL(path.join(dir, f)).href);
  }
  return commands.length;
}

export function byCategory() {
  const map = new Map();
  for (const c of commands) {
    if (!map.has(c.category)) map.set(c.category, []);
    map.get(c.category).push(c);
  }
  return map;
}

/**
 * Run a command by name against a prepared ctx (see lib/context.js).
 * Returns a status string: 'ok' | 'notfound' | 'blocked' | 'error'.
 * Never throws.
 */
export async function dispatch(name, ctx) {
  const c = byName.get(String(name || '').toLowerCase());
  if (!c) return 'notfound';
  ctx.command = c.pattern;
  try {
    if (c.group && !ctx.isGroup) {
      await ctx.reply('⚠️ This command only works in groups.');
      return 'blocked';
    }
    if (c.owner && !ctx.isOwner) {
      await ctx.reply('⚠️ This command is for the bot owner only.');
      return 'blocked';
    }
    if (c.admin && !(ctx.isAdmin || ctx.isOwner)) {
      await ctx.reply('⚠️ This command is for group admins only.');
      return 'blocked';
    }
    if (c.botAdmin && !ctx.isBotAdmin) {
      await ctx.reply('⚠️ The bot needs to be a group admin for this command.');
      return 'blocked';
    }
    await c.run(ctx);
    return 'ok';
  } catch (e) {
    // A command must never stay silent and never crash the process.
    try {
      const msg = e && e.name === 'ApiError' ? API_DOWN : '⚠️ Something went wrong while running that command. Please try again.';
      await ctx.reply(msg);
    } catch {
      /* socket itself failed — nothing more we can do */
    }
    return 'error';
  }
}
