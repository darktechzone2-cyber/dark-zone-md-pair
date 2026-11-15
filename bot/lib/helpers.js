// ─── Shared helpers: HTTP with timeouts, defensive response parsing ─────────

export const API_DOWN =
  '⚠️ This service is temporarily unavailable right now. Please try again in a little while.';

export class ApiError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ApiError';
  }
}

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
};

export const enc = encodeURIComponent;

async function doFetch(url, opts = {}, timeout = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      ...opts,
      signal: ctrl.signal,
      headers: { ...UA, ...(opts.headers || {}) },
    });
    return res;
  } catch (e) {
    throw new ApiError('fetch failed: ' + (e && e.message ? e.message : e));
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, opts = {}, timeout = 25000) {
  const res = await doFetch(url, opts, timeout);
  if (!res.ok) throw new ApiError('HTTP ' + res.status + ' from ' + url.split('?')[0]);
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

export async function fetchText(url, opts = {}, timeout = 25000) {
  const res = await doFetch(url, opts, timeout);
  if (!res.ok) throw new ApiError('HTTP ' + res.status + ' from ' + url.split('?')[0]);
  return res.text();
}

export async function fetchBuffer(url, opts = {}, timeout = 40000) {
  const res = await doFetch(url, opts, timeout);
  if (!res.ok) throw new ApiError('HTTP ' + res.status + ' from ' + url.split('?')[0]);
  return Buffer.from(await res.arrayBuffer());
}

/** Try a list of async producers in order; return the first success. */
export async function firstSuccess(fns) {
  let lastErr = null;
  for (const fn of fns) {
    try {
      const v = await fn();
      if (v !== undefined && v !== null && v !== '') return v;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new ApiError('all endpoints failed');
}

/** Get a value by dotted path: pick(obj, 'data.result.0.url') */
export function pick(obj, path) {
  if (!obj || !path) return undefined;
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Depth-first search over an object/array; returns first value where pred(value, key) is true. */
export function deepFind(obj, pred, depth = 0, seen = new Set()) {
  if (obj === null || obj === undefined || depth > 8) return undefined;
  if (typeof obj === 'object') {
    if (seen.has(obj)) return undefined;
    seen.add(obj);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (pred(v, k)) return v;
    if (v && typeof v === 'object') {
      const r = deepFind(v, pred, depth + 1, seen);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

/** First string value whose KEY matches re (e.g. /url|link|download/i). */
export function findByKey(obj, re) {
  return deepFind(obj, (v, k) => typeof v === 'string' && re.test(k) && v.length > 3);
}

/** First http(s) URL string whose value matches re (e.g. /\.mp4(\?|$)/i). */
export function findUrl(obj, re) {
  return deepFind(
    obj,
    (v) => typeof v === 'string' && /^https?:\/\//i.test(v) && re.test(v)
  );
}

/** Best human-readable text out of an AI-ish JSON response. */
export function deepText(obj) {
  if (typeof obj === 'string') return obj;
  const preferred = [
    'result', 'response', 'answer', 'reply', 'text', 'message', 'content',
    'output', 'data', 'choices.0.message.content', 'candidates.0.content.parts.0.text',
  ];
  for (const p of preferred) {
    const v = pick(obj, p);
    if (typeof v === 'string' && v.trim().length > 1) return v.trim();
    if (v && typeof v === 'object') {
      const inner = deepText(v);
      if (inner) return inner;
    }
  }
  // fall back to the longest string anywhere in the payload
  let best = '';
  deepFind(obj, (v) => {
    if (typeof v === 'string' && v.length > best.length && !/^https?:\/\//i.test(v)) best = v;
    return false;
  });
  return best || '';
}

export function isUrl(s) {
  return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());
}

export function jidNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

export function numToJid(num) {
  const d = String(num || '').replace(/\D/g, '');
  return d ? d + '@s.whatsapp.net' : null;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '-';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + u[i];
}

export function runtimeStr(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}
