// ─── Logo / text-effect makers ───────────────────────────────────────────────
// Each style generates a real logo image with the user's text via the free
// Pollinations image engine (no key). 36 styles — more than any rival bot.

import { cmd } from '../lib/registry.js';
import { enc } from '../lib/helpers.js';

const STYLES = [
  ['neonlogo', 'glowing neon sign text, dark wall background, electric blue and pink neon'],
  ['glowlogo', 'soft glowing light text effect, radiant halo, dark background'],
  ['glitchlogo', 'glitch effect typography, rgb split, digital distortion, dark background'],
  ['galaxylogo', 'galaxy space text effect, stars and nebula filled letters, cosmic'],
  ['firelogo', 'burning fire flame text effect, orange flames, dark background'],
  ['icelogo', 'frozen ice crystal text effect, blue frost, winter'],
  ['goldlogo', 'luxury golden 3d text, metallic gold letters, black background, elegant'],
  ['silverlogo', 'shiny silver chrome 3d text, metallic letters, dark background'],
  ['matrixlogo', 'matrix digital rain green code text effect, cyber'],
  ['thunderlogo', 'electric lightning thunder text effect, storm sky, dramatic'],
  ['lavalogo', 'molten lava magma text effect, volcanic, dark background'],
  ['rainbowlogo', 'colorful rainbow gradient text, vibrant, playful'],
  ['carbonlogo', 'carbon fiber dark text logo, tech style, sleek'],
  ['woodlogo', 'carved wooden text effect, rustic wood texture'],
  ['stonelogo', 'ancient stone carved text effect, rock texture, epic'],
  ['waterlogo', 'water splash liquid text effect, blue waves, fresh'],
  ['sandlogo', 'sand writing text on beach, summer vibes'],
  ['beachlogo', 'beach summer text logo, palm trees, sunset ocean'],
  ['sunsetlogo', 'retro sunset text logo, 80s synthwave gradient sky'],
  ['nightlogo', 'midnight night sky text logo, moon and stars'],
  ['purplelogo', 'royal purple luxury text logo, violet gradient, elegant'],
  ['pinklogo', 'stylish pink text logo, cute gradient, modern'],
  ['bluelogo', 'blue electric text logo, modern tech style'],
  ['dragonlogo', 'epic dragon themed text logo, fantasy fire, gaming style'],
  ['tigerlogo', 'fierce tiger themed text logo, wild orange stripes, gaming style'],
  ['spacelogo', 'outer space astronaut text logo, planets and stars'],
  ['magmalogo', 'hot magma core text logo, glowing cracks, dark'],
  ['horrorlogo', 'scary horror text logo, dripping blood style, dark spooky'],
  ['angellogo', 'angel wings text logo, heavenly white and gold, divine'],
  ['graffitilogo', 'street graffiti text art, spray paint, urban wall'],
  ['typographylogo', 'modern typography poster text design, minimal, bold'],
  ['papercutlogo', 'paper cut craft text art, layered paper, creative'],
  ['pixellogo', 'retro pixel game text logo, 8-bit arcade style'],
  ['underwaterlogo', 'underwater ocean text logo, bubbles and coral, deep blue'],
  ['watercolorlogo', 'watercolor painted text logo, artistic splashes'],
  ['cartoonlogo', 'fun cartoon text logo, bold rounded letters, colorful'],
];

function logoHandler(styleDesc) {
  return async (ctx) => {
    if (!ctx.text) return ctx.reply('Usage: ' + ctx.command + ' <your text>');
    const text = ctx.text.slice(0, 40);
    const prompt = `professional text logo design of the words "${text}", ${styleDesc}, centered composition, high quality, no other words`;
    const url = 'https://image.pollinations.ai/prompt/' + enc(prompt) +
      `?width=1024&height=1024&seed=${Math.floor(Math.random() * 999999)}&nologo=true`;
    await ctx.react('🎨');
    await ctx.sendImage(url, '🎨 *' + text + '*');
  };
}

for (const [pattern, style] of STYLES) {
  cmd({ pattern, category: 'Logo', desc: 'Make a ' + pattern.replace('logo', '') + ' style text logo', run: logoHandler(style) });
}

cmd({
  pattern: 'logomaker', alias: ['makelogo', 'textlogo'], category: 'Logo', desc: 'Make a text logo (random premium style)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: logomaker <your text>\nOr pick a style: .logomenu');
    const style = STYLES[Math.floor(Math.random() * STYLES.length)][1];
    return logoHandler(style)(ctx);
  },
});
