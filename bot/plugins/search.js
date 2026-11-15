// ─── Search: web, images, lyrics, movies, weather, news, stalk & more ────────
// Free no-key public APIs only (public data).

import { cmd } from '../lib/registry.js';
import {
  fetchJson, fetchText, firstSuccess, pick, findUrl, enc, API_DOWN, ApiError,
} from '../lib/helpers.js';

const need = (ctx, usage) => (ctx.text ? null : ctx.reply('Usage: ' + usage));

cmd({
  pattern: 'google', alias: ['gsearch', 'websearch'], category: 'Search', desc: 'Search the web (DuckDuckGo)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'google <search text>');
    try {
      const html = await fetchText('https://lite.duckduckgo.com/lite/?q=' + enc(ctx.text));
      const results = [];
      const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="result-link"[^>]*>([^<]+)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && results.length < 6) {
        let link = m[1];
        const ud = link.match(/uddg=([^&]+)/);
        if (ud) link = decodeURIComponent(ud[1]);
        results.push({ title: m[2].trim(), link });
      }
      if (!results.length) {
        const j = await fetchJson('https://api.duckduckgo.com/?q=' + enc(ctx.text) + '&format=json&no_html=1');
        const abs = pick(j, 'AbstractText');
        const heading = pick(j, 'Heading') || ctx.text;
        if (abs) return ctx.reply(`🔎 *${heading}*\n\n${abs}\n\n${pick(j, 'AbstractURL') || ''}`);
        return ctx.reply('No results found for: ' + ctx.text);
      }
      await ctx.reply('🔎 *Results for:* ' + ctx.text + '\n\n' + results.map((r, i) => `${i + 1}. *${r.title}*\n${r.link}`).join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

function pinSearch(pattern, desc) {
  cmd({
    pattern, category: 'Search', desc,
    async run(ctx) {
      if (!ctx.text) return need(ctx, pattern + ' <search text>');
      try {
        const j = await firstSuccess([
          () => fetchJson('https://api.siputzx.my.id/api/s/pinterest?query=' + enc(ctx.text)),
          () => fetchJson('https://api.ryzendesu.vip/api/search/pinterest?query=' + enc(ctx.text)),
        ]);
        const arr = pick(j, 'data') || pick(j, 'result') || [];
        const items = (Array.isArray(arr) ? arr : []).slice(0, 5);
        const imgs = [];
        for (const it of items) {
          const u = typeof it === 'string' ? it : pick(it, 'image') || pick(it, 'url') || pick(it, 'images.orig.url') || findUrl(it, /\.(jpg|png|webp)/i);
          if (u) imgs.push(u);
        }
        if (!imgs.length) {
          const u = findUrl(j, /\.(jpg|jpeg|png|webp)(\?|$)/i);
          if (!u) return ctx.reply('No images found for: ' + ctx.text);
          return ctx.sendImage(u, '📌 ' + ctx.text);
        }
        await ctx.sendImage(imgs[0], `📌 *${ctx.text}* — ${imgs.length} images found`);
        for (const u of imgs.slice(1)) { try { await ctx.sendImage(u); } catch { /* skip */ } }
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}
pinSearch('pinterest', 'Search Pinterest images');
pinSearch('imgsearch', 'Search images');

cmd({
  pattern: 'lyrics', alias: ['lyric'], category: 'Search', desc: 'Song lyrics: lyrics <artist> - <title>',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'lyrics <artist> - <title>');
    const [artist, ...rest] = ctx.text.split(' - ');
    const title = (rest.join(' - ') || artist).trim();
    const art = rest.length ? artist.trim() : '';
    try {
      let lyr = '';
      if (art) {
        const j = await fetchJson(`https://api.lyrics.ovh/v1/${enc(art)}/${enc(title)}`);
        lyr = pick(j, 'lyrics') || '';
      }
      if (!lyr) {
        const j = await fetchJson('https://api.siputzx.my.id/api/search/lyrics?query=' + enc(ctx.text));
        lyr = pick(j, 'data.lyrics') || pick(j, 'result.lyrics') || pick(j, 'lyrics') || '';
      }
      if (!lyr) return ctx.reply('Lyrics not found for: ' + ctx.text);
      await ctx.reply('🎤 *Lyrics — ' + ctx.text + '*\n\n' + String(lyr).slice(0, 3800));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'movie', alias: ['imdb'], category: 'Search', desc: 'Movie information',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'movie <movie name>');
    try {
      const j = await firstSuccess([
        () => fetchJson('https://search.imdbot.workers.dev/?q=' + enc(ctx.text)),
        () => fetchJson('https://api.siputzx.my.id/api/s/imdb?query=' + enc(ctx.text)),
      ]);
      const list = pick(j, 'description') || pick(j, 'data') || pick(j, 'result') || [];
      const movie = Array.isArray(list) ? list[0] : list;
      if (!movie) return ctx.reply('Movie not found: ' + ctx.text);
      const title = pick(movie, '#TITLE') || pick(movie, 'title') || pick(movie, 'name') || ctx.text;
      const year = pick(movie, '#YEAR') || pick(movie, 'year') || '';
      const rank = pick(movie, '#RANK') || pick(movie, 'rating') || '';
      const poster = pick(movie, '#IMG_POSTER') || pick(movie, 'poster') || pick(movie, 'image');
      const caption = `🎬 *${title}* ${year ? '(' + year + ')' : ''}\n${rank ? '⭐ Rank/Rating: ' + rank + '\n' : ''}🔎 Searched: ${ctx.text}`;
      if (poster) return ctx.sendImage(poster, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tvshow', alias: ['tv', 'series'], category: 'Search', desc: 'TV show information (TVmaze)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'tvshow <show name>');
    try {
      const j = await fetchJson('https://api.tvmaze.com/search/shows?q=' + enc(ctx.text));
      const hit = Array.isArray(j) ? j[0] : null;
      if (!hit) return ctx.reply('Show not found: ' + ctx.text);
      const s = hit.show || {};
      const summary = (s.summary || '').replace(/<[^>]+>/g, '');
      const caption = `📺 *${s.name}* (${(s.premiered || '').slice(0, 4) || '?'})\n⭐ ${s.rating && s.rating.average ? s.rating.average : 'N/A'} • ${s.status || ''} • ${(s.genres || []).join(', ')}\n\n${summary.slice(0, 600)}`;
      if (s.image && s.image.medium) return ctx.sendImage(s.image.original || s.image.medium, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

async function weatherData(city) {
  const j = await fetchJson('https://wttr.in/' + enc(city) + '?format=j1');
  const cur = pick(j, 'current_condition.0');
  if (!cur) throw new ApiError('no weather');
  const area = pick(j, 'nearest_area.0.areaName.0.value') || city;
  const country = pick(j, 'nearest_area.0.country.0.value') || '';
  return { j, cur, area, country };
}

cmd({
  pattern: 'weather', alias: ['forecast'], category: 'Search', desc: 'Current weather of a city',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'weather <city>');
    try {
      const { cur, area, country } = await weatherData(ctx.text);
      await ctx.reply(
        `🌦️ *Weather — ${area}, ${country}*\n` +
        `☀️ ${pick(cur, 'weatherDesc.0.value')}\n` +
        `🌡️ Temp: ${pick(cur, 'temp_C')}°C (feels ${pick(cur, 'FeelsLikeC')}°C)\n` +
        `💧 Humidity: ${pick(cur, 'humidity')}%\n💨 Wind: ${pick(cur, 'windspeedKmph')} km/h ${pick(cur, 'winddir16Point')}`
      );
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'forecast3', alias: ['weather3'], category: 'Search', desc: '3-day weather forecast (Open-Meteo)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'forecast3 <city>');
    try {
      const geo = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?name=' + enc(ctx.text) + '&count=1&format=json');
      const place = pick(geo, 'results.0');
      if (!place) return ctx.reply('City not found: ' + ctx.text);
      const f = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=3&timezone=auto`);
      const days = pick(f, 'daily.time') || [];
      const max = pick(f, 'daily.temperature_2m_max') || [];
      const min = pick(f, 'daily.temperature_2m_min') || [];
      const lines = days.map((d, i) => `• ${d}: ${min[i]}°C – ${max[i]}°C`);
      await ctx.reply(`🌦️ *3-day forecast — ${place.name}, ${place.country || ''}*\n` + lines.join('\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

function newsCmd(pattern, categoryName, label) {
  cmd({
    pattern, category: 'Search', desc: label,
    async run(ctx) {
      try {
        const j = await fetchJson(`https://saurav.tech/NewsAPI/top-headlines/category/${categoryName}/in.json`);
        const arts = (pick(j, 'articles') || []).slice(0, 8);
        if (!arts.length) throw new ApiError('no news');
        await ctx.reply('📰 *' + label + '*\n\n' + arts.map((a, i) => `${i + 1}. *${a.title}*\n${a.url}`).join('\n\n'));
      } catch { await ctx.reply(API_DOWN); }
    },
  });
}
newsCmd('news', 'general', 'Latest news headlines (India/global)');
newsCmd('technews', 'technology', 'Technology news');
newsCmd('sportsnews', 'sports', 'Sports news');
newsCmd('biznews', 'business', 'Business news');

cmd({
  pattern: 'github', alias: ['gitstalk'], category: 'Search', desc: 'GitHub user info (public)',
  async run(ctx) {
    const user = (ctx.args[0] || '').replace('@', '').trim();
    if (!user) return need(ctx, 'github <username>');
    try {
      const j = await fetchJson('https://api.github.com/users/' + enc(user));
      if (pick(j, 'message') === 'Not Found') return ctx.reply('GitHub user not found: ' + user);
      const caption =
        `🐙 *${pick(j, 'name') || pick(j, 'login')}* (@${pick(j, 'login')})\n` +
        `${pick(j, 'bio') || ''}\n\n` +
        `📦 Public repos: ${pick(j, 'public_repos')}\n👥 Followers: ${pick(j, 'followers')} • Following: ${pick(j, 'following')}\n` +
        `📍 ${pick(j, 'location') || '-'}\n🔗 ${pick(j, 'html_url')}`;
      const av = pick(j, 'avatar_url');
      if (av) return ctx.sendImage(av, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'ghrepo', alias: ['reposearch'], category: 'Search', desc: 'Search GitHub repositories',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'ghrepo <search text>');
    try {
      const j = await fetchJson('https://api.github.com/search/repositories?q=' + enc(ctx.text) + '&per_page=5&sort=stars');
      const items = pick(j, 'items') || [];
      if (!items.length) return ctx.reply('No repositories found.');
      await ctx.reply('🐙 *Top repos:*\n\n' + items.map((r, i) => `${i + 1}. *${r.full_name}* ⭐${r.stargazers_count}\n${r.description || ''}\n${r.html_url}`).join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'wiki', alias: ['wikipedia'], category: 'Search', desc: 'Wikipedia summary',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'wiki <topic>');
    try {
      const j = await fetchJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + enc(ctx.text.replace(/\s+/g, '_')));
      const extract = pick(j, 'extract');
      if (!extract) return ctx.reply('No Wikipedia page found for: ' + ctx.text);
      await ctx.reply(`📚 *${pick(j, 'title')}*\n\n${extract.slice(0, 2500)}\n\n${pick(j, 'content_urls.desktop.page') || ''}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'npm', alias: ['npmsearch'], category: 'Search', desc: 'npm package info',
  async run(ctx) {
    const pkg = (ctx.args[0] || '').trim();
    if (!pkg) return need(ctx, 'npm <package name>');
    try {
      const j = await fetchJson('https://registry.npmjs.org/' + enc(pkg));
      if (pick(j, 'error')) return ctx.reply('Package not found: ' + pkg);
      const latest = pick(j, 'dist-tags.latest');
      await ctx.reply(`📦 *${pick(j, 'name')}* v${latest}\n${pick(j, 'description') || ''}\n\n🔗 https://www.npmjs.com/package/${pkg}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'stackoverflow', alias: ['so'], category: 'Search', desc: 'Search Stack Overflow',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'stackoverflow <question>');
    try {
      const j = await fetchJson('https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&q=' + enc(ctx.text));
      const items = (pick(j, 'items') || []).slice(0, 5);
      if (!items.length) return ctx.reply('No results found.');
      await ctx.reply('🧑‍💻 *Stack Overflow:*\n\n' + items.map((q, i) => `${i + 1}. *${q.title.replace(/&[^;]+;/g, ' ')}* (score ${q.score})\n${q.link}`).join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'covid', category: 'Search', desc: 'COVID-19 stats for a country',
  async run(ctx) {
    const country = ctx.text || 'Pakistan';
    try {
      const j = await fetchJson('https://disease.sh/v3/covid-19/countries/' + enc(country));
      if (pick(j, 'message')) return ctx.reply('Country not found: ' + country);
      await ctx.reply(`🦠 *COVID-19 — ${pick(j, 'country')}*\n😷 Cases: ${Number(pick(j, 'cases')).toLocaleString()}\n💀 Deaths: ${Number(pick(j, 'deaths')).toLocaleString()}\n💚 Recovered: ${Number(pick(j, 'recovered')).toLocaleString()}\n📊 Active: ${Number(pick(j, 'active')).toLocaleString()}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'prayer', alias: ['namaz', 'prayertimes'], category: 'Search', desc: 'Prayer times for a city',
  async run(ctx) {
    const city = ctx.text || 'Karachi';
    try {
      const j = await fetchJson('https://api.aladhan.com/v1/timingsByCity?city=' + enc(city) + '&country=&method=2');
      const t = pick(j, 'data.timings');
      if (!t) throw new ApiError('no timings');
      const rows = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((k) => `• ${k}: ${String(t[k]).slice(0, 5)}`);
      await ctx.reply(`🕌 *Prayer times — ${city}*\n` + rows.join('\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'animesearch', alias: ['animeinfo'], category: 'Search', desc: 'Search anime (MyAnimeList/Jikan)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'animesearch <anime name>');
    try {
      const j = await fetchJson('https://api.jikan.moe/v4/anime?q=' + enc(ctx.text) + '&limit=1&sfw=true');
      const a = pick(j, 'data.0');
      if (!a) return ctx.reply('Anime not found: ' + ctx.text);
      const caption = `🌸 *${pick(a, 'title')}*\n⭐ Score: ${pick(a, 'score') || 'N/A'} • 📺 ${pick(a, 'episodes') || '?'} eps • ${pick(a, 'status') || ''}\n\n${(pick(a, 'synopsis') || '').slice(0, 500)}\n\n${pick(a, 'url')}`;
      const img = pick(a, 'images.jpg.image_url');
      if (img) return ctx.sendImage(img, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'manga', alias: ['mangasearch'], category: 'Search', desc: 'Search manga (Jikan)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'manga <manga name>');
    try {
      const j = await fetchJson('https://api.jikan.moe/v4/manga?q=' + enc(ctx.text) + '&limit=1&sfw=true');
      const a = pick(j, 'data.0');
      if (!a) return ctx.reply('Manga not found: ' + ctx.text);
      const caption = `📖 *${pick(a, 'title')}*\n⭐ Score: ${pick(a, 'score') || 'N/A'} • 📚 ${pick(a, 'chapters') || '?'} chapters • ${pick(a, 'status') || ''}\n\n${(pick(a, 'synopsis') || '').slice(0, 500)}\n\n${pick(a, 'url')}`;
      const img = pick(a, 'images.jpg.image_url');
      if (img) return ctx.sendImage(img, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'book', alias: ['booksearch'], category: 'Search', desc: 'Search books (Open Library)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'book <book title>');
    try {
      const j = await fetchJson('https://openlibrary.org/search.json?q=' + enc(ctx.text) + '&limit=3');
      const docs = pick(j, 'docs') || [];
      if (!docs.length) return ctx.reply('No books found.');
      await ctx.reply('📚 *Books:*\n\n' + docs.map((b, i) => `${i + 1}. *${b.title}* — ${(b.author_name || ['unknown']).join(', ')} (${b.first_publish_year || '?'})`).join('\n\n'));
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'recipe', alias: ['meal'], category: 'Search', desc: 'Recipe search (TheMealDB)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'recipe <dish name>');
    try {
      const j = await fetchJson('https://www.themealdb.com/api/json/v1/1/search.php?s=' + enc(ctx.text));
      const meal = pick(j, 'meals.0');
      if (!meal) return ctx.reply('No recipe found for: ' + ctx.text);
      const caption = `🍽️ *${meal.strMeal}* (${meal.strArea || ''} ${meal.strCategory || ''})\n\n${(meal.strInstructions || '').slice(0, 1200)}`;
      if (meal.strMealThumb) return ctx.sendImage(meal.strMealThumb, caption);
      await ctx.reply(caption);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'nasa', alias: ['apod'], category: 'Search', desc: 'NASA picture of the day',
  async run(ctx) {
    try {
      const j = await fetchJson('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
      const title = pick(j, 'title') || 'NASA APOD';
      const expl = (pick(j, 'explanation') || '').slice(0, 800);
      const url = pick(j, 'url');
      if (url && pick(j, 'media_type') === 'image') return ctx.sendImage(url, `🚀 *${title}*\n\n${expl}`);
      await ctx.reply(`🚀 *${title}*\n\n${expl}\n\n${url || ''}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'appsearch', alias: ['playstore'], category: 'Search', desc: 'Search apps (Aptoide index)',
  async run(ctx) {
    if (!ctx.text) return need(ctx, 'appsearch <app name>');
    try {
      const j = await fetchJson('https://ws75.aptoide.com/api/7/apps/search?query=' + enc(ctx.text) + '&limit=5');
      const list = pick(j, 'responses.LISTAPP.data.list') || [];
      if (!list.length) return ctx.reply('No apps found.');
      await ctx.reply('📱 *Apps:*\n\n' + list.map((a, i) => `${i + 1}. *${a.name}* (${a.package || ''})\n⭐ ${a.stats ? (a.stats.rating || 'N/A') : 'N/A'} • ⬇️ ${a.stats ? Number(a.stats.downloads || 0).toLocaleString() : '?'}`).join('\n\n') + '\n\nDownload with: apk <app name>');
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'wachannel', alias: ['channelstalk'], category: 'Search', desc: 'WhatsApp channel info from its link',
  async run(ctx) {
    const url = (ctx.args[0] || '').trim();
    const code = (url.match(/whatsapp\.com\/channel\/(\w+)/) || [])[1];
    if (!code) return ctx.reply('Usage: wachannel <whatsapp channel link>');
    try {
      const j = await firstSuccess([
        () => fetchJson('https://api.siputzx.my.id/api/stalk/wachannel?url=' + enc(url)),
        () => fetchJson('https://api.ryzendesu.vip/api/stalk/wachannel?url=' + enc(url)),
      ]);
      const name = pick(j, 'data.title') || pick(j, 'result.title') || pick(j, 'data.name') || 'WhatsApp Channel';
      const followers = pick(j, 'data.followers') || pick(j, 'result.followers') || 'unknown';
      await ctx.reply(`📣 *${name}*\n👥 Followers: ${followers}\n🔗 ${url}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'igstalk', alias: ['iginfo'], category: 'Search', desc: 'Instagram profile info (public)',
  async run(ctx) {
    const user = (ctx.args[0] || '').replace('@', '').trim();
    if (!user) return need(ctx, 'igstalk <username>');
    try {
      const j = await firstSuccess([
        () => fetchJson('https://api.siputzx.my.id/api/stalk/instagram?username=' + enc(user)),
        () => fetchJson('https://api.ryzendesu.vip/api/stalk/instagram?username=' + enc(user)),
      ]);
      const name = pick(j, 'data.full_name') || pick(j, 'result.full_name') || pick(j, 'data.name') || user;
      const followers = pick(j, 'data.followers') || pick(j, 'result.followers') || '?';
      const following = pick(j, 'data.following') || pick(j, 'result.following') || '?';
      const posts = pick(j, 'data.posts') || pick(j, 'result.posts') || '?';
      await ctx.reply(`📸 *${name}* (@${user})\n👥 Followers: ${followers} • Following: ${following}\n🖼️ Posts: ${posts}\n🔗 https://instagram.com/${user}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});

cmd({
  pattern: 'tiktokstalk', alias: ['ttstalk'], category: 'Search', desc: 'TikTok profile info (public)',
  async run(ctx) {
    const user = (ctx.args[0] || '').replace('@', '').trim();
    if (!user) return need(ctx, 'tiktokstalk <username>');
    try {
      const j = await fetchJson('https://www.tikwm.com/api/user/info?unique_id=' + enc(user));
      const d = pick(j, 'data');
      if (!d) throw new ApiError('not found');
      const u = pick(d, 'user') || {};
      const s = pick(d, 'stats') || {};
      await ctx.reply(`🎵 *${pick(u, 'nickname') || user}* (@${pick(u, 'uniqueId') || user})\n👥 Followers: ${Number(pick(s, 'followerCount') || 0).toLocaleString()} • Following: ${Number(pick(s, 'followingCount') || 0).toLocaleString()}\n❤️ Likes: ${Number(pick(s, 'heartCount') || 0).toLocaleString()} • 🎬 Videos: ${pick(s, 'videoCount') || 0}`);
    } catch { await ctx.reply(API_DOWN); }
  },
});
