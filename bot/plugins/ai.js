// ─── AI: chat providers, image generation, AI text tools ─────────────────────
// All endpoints are free and need no API key. DTZ AI is Ali's own API using
// its public demo key (same key the DTZ web page ships with).

import config from '../config.js';
import { cmd } from '../lib/registry.js';
import { fetchJson, firstSuccess, deepText, enc, API_DOWN, ApiError } from '../lib/helpers.js';

const CHAT_CHAINS = {
  generic: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/gpt3?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.agatz.xyz/api/gpt?message=${enc(q)}`),
    (q) => fetchJson(`https://api.ryzendesu.vip/api/ai/chatgpt?text=${enc(q)}`),
    (q) => fetchJson(`https://api.vreden.my.id/api/ai/gpt?query=${enc(q)}`),
  ],
  gpt: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/chatgpt?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.nekorinn.my.id/ai/chatgpt?text=${enc(q)}&model=gpt-4`),
    (q) => fetchJson(`https://api.agatz.xyz/api/gpt?message=${enc(q)}`),
  ],
  gemini: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/gemini?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.ryzendesu.vip/api/ai/gemini?text=${enc(q)}`),
    (q) => fetchJson(`https://api.agatz.xyz/api/gemini?message=${enc(q)}`),
  ],
  llama: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/llama?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.ryzendesu.vip/api/ai/llama?text=${enc(q)}`),
  ],
  deepseek: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/deepseek?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.ryzendesu.vip/api/ai/deepseek?text=${enc(q)}`),
  ],
  blackbox: [
    (q) => fetchJson(`https://api.siputzx.my.id/api/ai/blackbox?prompt=${enc(q)}`),
    (q) => fetchJson(`https://api.ryzendesu.vip/api/ai/blackbox?text=${enc(q)}`),
  ],
};

export async function aiChat(chainName, prompt) {
  const chain = CHAT_CHAINS[chainName] || CHAT_CHAINS.generic;
  const raw = await firstSuccess(chain.map((fn) => () => fn(prompt)));
  const text = typeof raw === 'string' ? raw : deepText(raw);
  if (!text || text.length < 2) throw new ApiError('empty AI response');
  return text;
}

async function dtzAi(prompt) {
  const res = await fetch(config.DTZ_AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.DTZ_AI_KEY },
    body: JSON.stringify({ q: prompt }),
  });
  if (!res.ok) throw new ApiError('DTZ AI HTTP ' + res.status);
  const body = await res.text();
  let out = '';
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') break;
    try {
      const j = JSON.parse(payload);
      if (j.chunk) out += j.chunk;
    } catch { /* partial line */ }
  }
  if (!out.trim()) throw new ApiError('empty DTZ AI response');
  return out.trim();
}

function chatCmd(pattern, aliases, chain, label) {
  cmd({
    pattern, alias: aliases, category: 'AI', desc: 'Chat with ' + label,
    async run(ctx) {
      if (!ctx.text) return ctx.reply('Usage: ' + pattern + ' <your question>');
      await ctx.react('🤖');
      try {
        const ans = chain === 'dtz' ? await dtzAi(ctx.text) : await aiChat(chain, ctx.text);
        await ctx.reply('🤖 *' + label + '*\n\n' + ans.slice(0, 3800));
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}

chatCmd('ai', ['aichat', 'askai'], 'generic', 'AI');
chatCmd('gpt', ['gpt4', 'chatgpt'], 'gpt', 'GPT AI');
chatCmd('dtzai', ['darkai', 'dzai'], 'dtz', 'Dark Tech Zone AI');
chatCmd('gemini', ['geminiai'], 'gemini', 'Gemini AI');
chatCmd('llama', ['llamaai'], 'llama', 'Llama AI');
chatCmd('deepseek', ['dsai'], 'deepseek', 'DeepSeek AI');
chatCmd('blackbox', ['blackboxai'], 'blackbox', 'BlackBox AI');

cmd({
  pattern: 'simsimi', alias: ['simi'], category: 'AI', desc: 'Chat with SimSimi (fun chat)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: simsimi <message>');
    try {
      const ans = await aiChat('generic', 'Reply like the playful SimSimi chatbot, in one short line: ' + ctx.text);
      await ctx.reply('🐤 ' + ans.slice(0, 500));
    } catch { await ctx.reply(API_DOWN); }
  },
});

// ─── Image generation (Pollinations — free, no key) ──────────────────────────

function imagineUrl(prompt, seed) {
  return 'https://image.pollinations.ai/prompt/' + enc(prompt) +
    `?width=1024&height=1024&seed=${seed || Math.floor(Math.random() * 999999)}&nologo=true`;
}

cmd({
  pattern: 'imagine', alias: ['aiimg', 'genimg'], category: 'AI', desc: 'Generate an image from text (AI)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: imagine <describe the image>');
    await ctx.react('🎨');
    await ctx.sendImage(imagineUrl(ctx.text), '🎨 *' + ctx.text.slice(0, 200) + '*');
  },
});

const IMG_STYLES = [
  ['aireal', 'ultra realistic photograph, 8k, sharp focus, professional lighting'],
  ['aianime', 'anime style illustration, vibrant, studio quality, detailed'],
  ['aicyber', 'cyberpunk style, neon lights, futuristic, blade runner mood'],
  ['ai3d', '3d render, octane render, pixar style, soft studio light'],
  ['aipaint', 'classical oil painting, canvas texture, museum quality'],
  ['aisketch', 'pencil sketch drawing, detailed shading, black and white'],
  ['aichibi', 'cute chibi style, kawaii, pastel colors'],
  ['aifantasy', 'epic fantasy art, magical, ethereal glow, highly detailed'],
  ['aipixel', 'pixel art, 16-bit retro game style'],
  ['aiwater', 'watercolor painting, soft washes, artistic'],
];
for (const [pattern, style] of IMG_STYLES) {
  cmd({
    pattern, category: 'AI', desc: 'AI image (' + pattern.replace('ai', '') + ' style)',
    async run(ctx) {
      if (!ctx.text) return ctx.reply('Usage: ' + pattern + ' <describe the image>');
      await ctx.react('🎨');
      await ctx.sendImage(imagineUrl(ctx.text + ', ' + style), '🎨 *' + ctx.text.slice(0, 200) + '*');
    },
  });
}

// ─── AI text tools (prompt wrappers over the chat chain) ─────────────────────

function textTool(pattern, desc, instruction) {
  cmd({
    pattern, category: 'AI', desc,
    async run(ctx) {
      const input = ctx.text || ctx.quotedText();
      if (!input) return ctx.reply('Usage: ' + pattern + ' <text> (or reply to a message)');
      await ctx.react('✍️');
      try {
        const ans = await aiChat('generic', instruction + '\n\n---\n' + input);
        await ctx.reply(ans.slice(0, 3800));
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}

textTool('summarize', 'Summarize text with AI', 'Summarize the following text in a few clear bullet points:');
textTool('rewrite', 'Rewrite text with AI', 'Rewrite the following text more clearly and professionally, keeping the meaning:');
textTool('grammar', 'Fix grammar with AI', 'Correct the grammar and spelling of the following text. Output only the corrected text:');
textTool('expand', 'Expand text with AI', 'Expand the following short text into a fuller, well-written paragraph:');
textTool('paraphrase', 'Paraphrase text with AI', 'Paraphrase the following text in completely different words:');
textTool('codeai', 'Generate code with AI', 'Write clean, working code for the following request. Include a one-line explanation before the code:');
textTool('explain', 'Explain anything with AI', 'Explain the following in simple words, like teaching a beginner:');
textTool('essay', 'Write an essay with AI', 'Write a well-structured short essay on:');
textTool('storyai', 'Write a short story with AI', 'Write a short, engaging story (300-400 words) about:');
textTool('captionai', 'Social media caption with AI', 'Write 3 catchy social media captions with emojis and hashtags for a post about:');
textTool('bioai', 'Generate a profile bio with AI', 'Write 3 short stylish profile bios for someone described as:');
textTool('letterai', 'Write a letter/email with AI', 'Write a polite, professional letter/email for this purpose:');
