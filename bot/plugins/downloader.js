// ─── Downloader: YouTube, TikTok, Instagram, Facebook, X, APK & more ─────────
// Public posts only. Every source uses free no-key public APIs with fallback
// chains; if all sources are down the user gets a clear reply, never silence.

import { cmd } from '../lib/registry.js';
import {
  fetchJson, fetchText, firstSuccess, findUrl, findByKey, pick, enc, isUrl, API_DOWN, ApiError,
} from '../lib/helpers.js';

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/;

function needUrl(ctx, example) {
  const u = (ctx.args[0] || ctx.text || '').trim();
  if (!isUrl(u)) return null;
  return u;
}

async function ytDownload(url, kind) {
  const e = enc(url);
  const hosts = [
    `https://api.siputzx.my.id/api/d/yt${kind}?url=${e}`,
    `https://api.agatz.xyz/api/yt${kind}?url=${e}`,
    `https://api.ryzendesu.vip/api/downloader/yt${kind}?url=${e}`,
    `https://api.vreden.my.id/api/yt${kind}?url=${e}`,
    `https://api.nekorinn.my.id/downloader/youtube?url=${e}&format=${kind === 'mp3' ? 'mp3' : 'mp4'}`,
  ];
  const mediaRe = kind === 'mp3' ? /\.(mp3|m4a|ogg)(\?|$)/i : /\.mp4(\?|$)/i;
  return firstSuccess(hosts.map((h) => async () => {
    const j = await fetchJson(h);
    const link = findUrl(j, mediaRe) || findByKey(j, /download|dl_link|^url$|link/i);
    if (!link || /youtube\.com|youtu\.be/.test(link)) throw new ApiError('no media link');
    const title = findByKey(j, /title/i) || 'YouTube';
    return { link, title };
  }));
}

async function ytSearchFirst(query) {
  const e = enc(query);
  const hosts = [
    `https://api.siputzx.my.id/api/s/youtube?query=${e}`,
    `https://api.agatz.xyz/api/ytsearch?query=${e}`,
    `https://api.ryzendesu.vip/api/search/youtube?query=${e}`,
  ];
  return firstSuccess(hosts.map((h) => async () => {
    const j = await fetchJson(h);
    const url = findUrl(j, /youtube\.com\/watch\?v=|youtu\.be\//i);
    if (!url) throw new ApiError('no results');
    const title = findByKey(j, /title/i) || query;
    return { url, title };
  }));
}

cmd({
  pattern: 'ytmp3', alias: ['yta', 'ytaudio'], category: 'Downloader', desc: 'YouTube → MP3 audio',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !YT_RE.test(url)) return ctx.reply('Usage: ytmp3 <YouTube link>');
    await ctx.react('⏳');
    try {
      const { link, title } = await ytDownload(url, 'mp3');
      await ctx.sendAudio(link);
      await ctx.reply('🎵 *' + title + '*');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'ytmp4', alias: ['ytv', 'ytvideo'], category: 'Downloader', desc: 'YouTube → MP4 video',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !YT_RE.test(url)) return ctx.reply('Usage: ytmp4 <YouTube link>');
    await ctx.react('⏳');
    try {
      const { link, title } = await ytDownload(url, 'mp4');
      await ctx.sendVideo(link, '🎬 *' + title + '*');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'play', alias: ['song'], category: 'Downloader', desc: 'Play/download a song by name (MP3)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: play <song name>');
    await ctx.react('⏳');
    try {
      const hit = await ytSearchFirst(ctx.text);
      const { link } = await ytDownload(hit.url, 'mp3');
      await ctx.sendAudio(link);
      await ctx.reply('🎵 *' + hit.title + '*');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'play2', alias: ['video', 'ytplay'], category: 'Downloader', desc: 'Download a YouTube video by name (MP4)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: play2 <video title>');
    await ctx.react('⏳');
    try {
      const hit = await ytSearchFirst(ctx.text);
      const { link } = await ytDownload(hit.url, 'mp4');
      await ctx.sendVideo(link, '🎬 *' + hit.title + '*');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'yts', alias: ['ytsearch'], category: 'Downloader', desc: 'Search YouTube videos',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: yts <search text>');
    const e = enc(ctx.text);
    try {
      const j = await firstSuccess([
        () => fetchJson(`https://api.siputzx.my.id/api/s/youtube?query=${e}`),
        () => fetchJson(`https://api.agatz.xyz/api/ytsearch?query=${e}`),
      ]);
      const arr = pick(j, 'data') || pick(j, 'result') || j;
      const items = Array.isArray(arr) ? arr.slice(0, 8) : [];
      if (!items.length) {
        const url = findUrl(j, /youtube\.com\/watch/i);
        if (!url) return ctx.reply('No results found.');
        return ctx.reply('🔎 Top result: ' + url);
      }
      const lines = items.map((v, i) => {
        const t = pick(v, 'title') || 'Untitled';
        const u = pick(v, 'url') || pick(v, 'link') || '';
        const d = pick(v, 'duration') || pick(v, 'timestamp') || '';
        return `${i + 1}. *${t}* ${d ? '(' + d + ')' : ''}\n${u}`;
      });
      await ctx.reply('🔎 *YouTube results for:* ' + ctx.text + '\n\n' + lines.join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tiktok', alias: ['tt', 'ttdl', 'tiktokdl'], category: 'Downloader', desc: 'TikTok video (no watermark)',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !/tiktok\.com/.test(url)) return ctx.reply('Usage: tiktok <TikTok link>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson('https://www.tikwm.com/api/?url=' + enc(url));
      const play = pick(j, 'data.play') || pick(j, 'data.wmplay');
      if (!play) throw new ApiError('tikwm no play url');
      const title = pick(j, 'data.title') || 'TikTok video';
      const author = pick(j, 'data.author.nickname') || '';
      await ctx.sendVideo(play, `🎵 *${title}*${author ? '\n👤 ' + author : ''}`);
    } catch {
      try {
        const j = await fetchJson('https://api.siputzx.my.id/api/d/tiktok?url=' + enc(url));
        const link = findUrl(j, /\.mp4(\?|$)/i);
        if (!link) throw new ApiError('no link');
        await ctx.sendVideo(link, '🎵 TikTok video');
      } catch { await ctx.reply(API_DOWN); }
    }
  },
});

cmd({
  pattern: 'ttmp3', alias: ['tiktokmp3'], category: 'Downloader', desc: 'TikTok → MP3 audio',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !/tiktok\.com/.test(url)) return ctx.reply('Usage: ttmp3 <TikTok link>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson('https://www.tikwm.com/api/?url=' + enc(url));
      const music = pick(j, 'data.music');
      if (!music) throw new ApiError('no music');
      await ctx.sendAudio(music);
      await ctx.reply('🎵 TikTok audio');
    } catch { await ctx.reply(API_DOWN); }
  },
});

function socialCmd(pattern, aliases, label, hosts, usageRe) {
  cmd({
    pattern, alias: aliases, category: 'Downloader', desc: label,
    async run(ctx) {
      const url = needUrl(ctx);
      if (!url || (usageRe && !usageRe.test(url))) return ctx.reply('Usage: ' + pattern + ' <link>');
      await ctx.react('⏳');
      try {
        const link = await firstSuccess(hosts.map((h) => async () => {
          const j = await fetchJson(h.replace('{u}', enc(url)));
          const l = findUrl(j, /\.(mp4|jpg|jpeg|png|webp)(\?|$)/i) || findByKey(j, /download|media|^url$/i);
          if (!l || l === url) throw new ApiError('no media');
          return l;
        }));
        if (/\.(mp3|m4a|ogg)(\?|$)/i.test(link)) await ctx.sendAudio(link);
        else if (/\.mp4(\?|$)/i.test(link)) await ctx.sendVideo(link, '⬇️ ' + label);
        else await ctx.sendImage(link, '⬇️ ' + label);
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}

socialCmd('igdl', ['ig', 'instagram', 'insta'], 'Instagram video/reel/photo downloader', [
  'https://api.siputzx.my.id/api/d/instagram?url={u}',
  'https://api.agatz.xyz/api/instagram?url={u}',
  'https://api.ryzendesu.vip/api/downloader/instagram?url={u}',
  'https://api.vreden.my.id/api/igdl?url={u}',
], /instagram\.com/);

socialCmd('fbdl', ['fb', 'facebook'], 'Facebook video downloader', [
  'https://api.siputzx.my.id/api/d/facebook?url={u}',
  'https://api.agatz.xyz/api/facebook?url={u}',
  'https://api.ryzendesu.vip/api/downloader/fbdl?url={u}',
  'https://api.vreden.my.id/api/fbdl?url={u}',
], /facebook\.com|fb\.watch/);

cmd({
  pattern: 'twitter', alias: ['xdl', 'tweetdl'], category: 'Downloader', desc: 'X (Twitter) video/photo downloader',
  async run(ctx) {
    const url = needUrl(ctx);
    const m = url && url.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/);
    if (!m) return ctx.reply('Usage: twitter <X/Twitter post link>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`);
      const tweet = pick(j, 'tweet') || {};
      const videos = pick(tweet, 'media.videos') || [];
      const photos = pick(tweet, 'media.photos') || [];
      const all = pick(tweet, 'media.all') || [];
      const vid = videos[0] || all.find((x) => x.type === 'video');
      const pho = photos[0] || all.find((x) => x.type === 'photo');
      const author = pick(tweet, 'author.name') || m[1];
      if (vid && vid.url) return ctx.sendVideo(vid.url, `🐦 Post by *${author}*`);
      if (pho && pho.url) return ctx.sendImage(pho.url, `🐦 Post by *${author}*`);
      await ctx.reply('No downloadable media found in that post (it may be text-only).');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'apk', alias: ['app', 'apkdl'], category: 'Downloader', desc: 'Download an Android APK (Aptoide)',
  async run(ctx) {
    if (!ctx.text) return ctx.reply('Usage: apk <app name>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson('https://ws75.aptoide.com/api/7/apps/search?query=' + enc(ctx.text) + '&limit=1');
      const app = pick(j, 'responses.LISTAPP.data.list.0') || pick(j, 'datalist.list.0');
      if (!app) return ctx.reply('No app found for: ' + ctx.text);
      const fileUrl = pick(app, 'file.path') || pick(app, 'obb.main.path');
      const name = pick(app, 'name') || ctx.text;
      const icon = pick(app, 'icon');
      const size = pick(app, 'size') || pick(app, 'file.filesize');
      if (icon) await ctx.sendImage(icon, `📱 *${name}*`);
      if (!fileUrl) return ctx.reply('Found *' + name + '* but no direct APK link was available.');
      await ctx.sendDocument(fileUrl, name.replace(/[^\w.-]+/g, '_') + '.apk', 'application/vnd.android.package-archive',
        `📱 *${name}*${size ? '\n📦 Size: ' + Math.round(size / 1048576) + ' MB' : ''}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'mediafire', alias: ['mf'], category: 'Downloader', desc: 'MediaFire file downloader',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !/mediafire\.com/.test(url)) return ctx.reply('Usage: mediafire <MediaFire link>');
    await ctx.react('⏳');
    try {
      const link = await firstSuccess([
        async () => {
          const html = await fetchText(url);
          const m = html.match(/href="(https:\/\/download\d*\.mediafire\.com[^"]+)"/) ||
            html.match(/id="downloadButton"[^>]*href="([^"]+)"/) ||
            html.match(/href="(https:\/\/[^"]*mediafire[^"]*\.(?:zip|rar|apk|pdf|mp4|mp3)[^"]*)"/i);
          if (!m) throw new ApiError('no download link in page');
          return m[1];
        },
        async () => {
          const j = await fetchJson('https://api.siputzx.my.id/api/d/mediafire?url=' + enc(url));
          const l = findByKey(j, /download|link|^url$/i);
          if (!l) throw new ApiError('no link');
          return l;
        },
      ]);
      await ctx.sendDocument(link, 'mediafire-file', 'application/octet-stream', '⬇️ MediaFire download');
    } catch { await ctx.reply(API_DOWN); }
  },
});

socialCmd('gdrive', ['gdrivedl'], 'Google Drive file downloader', [
  'https://api.siputzx.my.id/api/d/gdrive?url={u}',
  'https://api.ryzendesu.vip/api/downloader/gdrive?url={u}',
], /drive\.google\.com/);

socialCmd('spotify', ['spotifydl'], 'Spotify track downloader', [
  'https://api.siputzx.my.id/api/d/spotify?url={u}',
  'https://api.agatz.xyz/api/spotify?url={u}',
  'https://api.ryzendesu.vip/api/downloader/spotify?url={u}',
], /spotify\.com/);

socialCmd('soundcloud', ['scdl'], 'SoundCloud downloader', [
  'https://api.siputzx.my.id/api/d/soundcloud?url={u}',
  'https://api.ryzendesu.vip/api/downloader/soundcloud?url={u}',
], /soundcloud\.com/);

cmd({
  pattern: 'reddit', alias: ['redditdl'], category: 'Downloader', desc: 'Reddit video/image downloader',
  async run(ctx) {
    const url = needUrl(ctx);
    if (!url || !/reddit\.com/.test(url)) return ctx.reply('Usage: reddit <Reddit post link>');
    await ctx.react('⏳');
    try {
      const clean = url.replace(/\?.*$/, '').replace(/\/?$/, '');
      const j = await fetchJson(clean + '.json', { headers: { 'User-Agent': 'DarkZoneMD/1.0' } });
      const post = pick(j, '0.data.children.0.data') || {};
      const vidUrl = pick(post, 'secure_media.reddit_video.fallback_url') || pick(post, 'media.reddit_video.fallback_url');
      const imgUrl = pick(post, 'url_overridden_by_dest');
      const title = pick(post, 'title') || 'Reddit post';
      if (vidUrl) return ctx.sendVideo(vidUrl, '👽 *' + title + '*');
      if (imgUrl && /\.(jpg|png|gif|mp4)/i.test(imgUrl)) {
        if (/\.mp4/i.test(imgUrl)) return ctx.sendVideo(imgUrl, '👽 *' + title + '*');
        return ctx.sendImage(imgUrl, '👽 *' + title + '*');
      }
      await ctx.reply('No downloadable media found in that Reddit post.');
    } catch { await ctx.reply(API_DOWN); }
  },
});

socialCmd('pindl', ['pinterestdl'], 'Pinterest media downloader', [
  'https://api.siputzx.my.id/api/d/pinterest?url={u}',
  'https://api.ryzendesu.vip/api/downloader/pinterest?url={u}',
], /pin\.it|pinterest\./);

socialCmd('terabox', ['teraboxdl'], 'Terabox file downloader', [
  'https://api.siputzx.my.id/api/d/terabox?url={u}',
  'https://api.ryzendesu.vip/api/downloader/terabox?url={u}',
], /terabox|1024tera|mirrobox|freeterabox/);

socialCmd('capcut', ['capcutdl'], 'CapCut template/video downloader', [
  'https://api.siputzx.my.id/api/d/capcut?url={u}',
  'https://api.ryzendesu.vip/api/downloader/capcut?url={u}',
], /capcut\.com/);

cmd({
  pattern: 'dailymotion', alias: ['dmdl'], category: 'Downloader', desc: 'Dailymotion video downloader',
  async run(ctx) {
    const url = needUrl(ctx);
    const id = url && (url.match(/dailymotion\.com\/video\/(\w+)/) || url.match(/dai\.ly\/(\w+)/) || [])[1];
    if (!id) return ctx.reply('Usage: dailymotion <Dailymotion link>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson('https://www.dailymotion.com/player/metadata/video/' + id);
      const qualities = pick(j, 'qualities') || {};
      let best = null;
      for (const q of ['1080', '720', '480', '380', '240']) {
        const arr = qualities[q];
        if (arr && arr[0] && arr[0].url) { best = arr[0].url; break; }
      }
      if (!best) throw new ApiError('no qualities');
      await ctx.sendVideo(best, '🎬 ' + (pick(j, 'title') || 'Dailymotion video'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'vimeo', alias: ['vimeodl'], category: 'Downloader', desc: 'Vimeo video downloader',
  async run(ctx) {
    const url = needUrl(ctx);
    const id = url && (url.match(/vimeo\.com\/(\d+)/) || [])[1];
    if (!id) return ctx.reply('Usage: vimeo <Vimeo link>');
    await ctx.react('⏳');
    try {
      const j = await fetchJson('https://player.vimeo.com/video/' + id + '/config');
      const files = pick(j, 'request.files.progressive') || [];
      if (!files.length) throw new ApiError('no files (private?)');
      files.sort((a, b) => (b.height || 0) - (a.height || 0));
      await ctx.sendVideo(files[0].url, '🎬 ' + (pick(j, 'video.title') || 'Vimeo video'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

socialCmd('likee', ['likeedl'], 'Likee video downloader', [
  'https://api.siputzx.my.id/api/d/likee?url={u}',
  'https://api.ryzendesu.vip/api/downloader/likee?url={u}',
], /likee\.video|l\.likee\.video/);

cmd({
  pattern: 'gitclone', alias: ['gitdl'], category: 'Downloader', desc: 'Download a GitHub repo as ZIP',
  async run(ctx) {
    const url = needUrl(ctx);
    const m = url && url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
    if (!m) return ctx.reply('Usage: gitclone <GitHub repo link>');
    const zip = `https://github.com/${m[1]}/${m[2].replace(/\.git$/, '')}/archive/refs/heads/main.zip`;
    await ctx.sendDocument(zip, `${m[2]}.zip`, 'application/zip', `📦 ${m[1]}/${m[2]} (main branch)`);
  },
});
