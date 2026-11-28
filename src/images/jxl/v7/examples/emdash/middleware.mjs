import {serve, acceptsJxl as accepts} from 'rapier-jxl/serve';
import {isSharePreviewRequest} from './space-saver.mjs';

const FILE = /^\/_emdash\/api\/media\/file\/([0-9A-HJKMNP-TV-Z]{26}(?:\.[0-9A-HJKMNP-TV-Z]{26})*\.(?:jpe?g|jpe|jfif|png|webp|avif))$/i;
const REPLACE = /^\/_emdash\/api\/media\/[0-9A-HJKMNP-TV-Z]{26}\/replace$/i;
const WIDTH_FORMATS = new Map([[null, 'image/webp'], ['webp', 'image/webp'], ['avif', 'image/avif'],
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['png', 'image/png']]);
const NAMED_QUALITY = new Map([['low', 25], ['mid', 50], ['high', 80], ['max', 100]]);
const ALLOWED_PARAMS = new Set(['href', 'w', 'h', 'f', 'q', 'fit', 'pos', 'position']);
const CENTERED_POSITION = new Set(['center', 'centre', '50%', '50% 50%', 'center center', 'centre centre']);
const BOUNDING_FITS = new Set(['contain', 'inside', 'scale-down']);
const EXACT_BOX_FITS = new Set([null, 'cover', 'fill', 'outside']);
export const NEAR_WIDTH = 1.06;
const SANDBOX = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
export const mediaKey = url => FILE.exec(new URL(url).pathname)?.[1] ?? null;

export const acceptsJxl = (value, alternative = 'image/webp') => accepts(value, alternative);
function varyDelivery(headers) {
  const parts = String(headers.get('vary') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (parts.includes('*')) return;
  for (const name of ['Accept', 'User-Agent', 'Purpose', 'Sec-Purpose', 'X-Purpose', 'Range'])
    if (!parts.some(value => value.toLowerCase() === name.toLowerCase())) parts.push(name);
  headers.set('vary', parts.join(', '));
}
const secure = response => {
  varyDelivery(response.headers);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('content-security-policy', SANDBOX);
  response.headers.set('content-disposition', 'inline');
  return response;
};
const requestForJxl = request => ({method: request.method,
  headers: {accept: 'image/jxl', 'if-none-match': request.headers.get('if-none-match') ?? ''}});

function askedQuality(raw) {
  if (raw === null) return null;
  if (NAMED_QUALITY.has(raw)) return NAMED_QUALITY.get(raw);
  return /^(?:[1-9][0-9]?|100)$/.test(raw) ? Number(raw) : undefined;
}

function centeredPosition(url) {
  const pos = url.searchParams.get('pos'), position = url.searchParams.get('position');
  if (pos !== null && position !== null && pos !== position) return false;
  const raw = position ?? pos;
  return raw === null || CENTERED_POSITION.has(raw.trim().toLowerCase().replace(/\s+/g, ' '));
}

function matchesQuality(result, format, requestedQuality) {
  const fidelity = result?.fidelity;
  const exact = fidelity === 'exact' || fidelity?.maxError === 0 || fidelity?.quality === 100;
  if (format === 'png') return exact || result?.kept === 'pixels';
  if (requestedQuality === null) return true;
  const storedQuality = exact ? 100 : fidelity?.quality;
  return requestedQuality === 85 || requestedQuality === storedQuality;
}

export async function serveMedia({request, storage}) {
  if (!['GET', 'HEAD'].includes(request.method) || request.headers.has('range') || typeof storage?.sidecar !== 'function') return null;
  const key = mediaKey(request.url);
  if (!key) return null;
  const type = /\.(?:jpe?g|jpe|jfif)$/i.test(key) ? 'image/jpeg' : /\.png$/i.test(key) ? 'image/png' :
    /\.avif$/i.test(key) ? 'image/avif' : 'image/webp';
  if (isSharePreviewRequest(request) || !acceptsJxl(request.headers.get('accept'), type)) return null;
  const result = await storage.sidecar(key, {signal: request.signal});
  return result ? secure(await serve(result.bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal,
    ...(typeof result.etag === 'string' && {etag: result.etag})})) : null;
}

export async function serveWidth({request, storage, endpoint = '/_image'}) {
  const url = new URL(request.url);
  if (url.pathname !== endpoint || !['GET', 'HEAD'].includes(request.method) || request.headers.has('range') ||
      (typeof storage?.variants !== 'function' && typeof storage?.sidecar !== 'function')) return null;
  if ([...url.searchParams.keys()].some(k => !ALLOWED_PARAMS.has(k)) || !centeredPosition(url)) return null;
  const format = url.searchParams.get('f'), alternative = WIDTH_FORMATS.get(format), named = format === 'jxl';
  if (!named && (!alternative || isSharePreviewRequest(request) || !acceptsJxl(request.headers.get('accept'), alternative))) return null;
  const answer = named ? response => (secure(response).headers.delete('vary'), response) : secure;
  const requestedQuality = askedQuality(url.searchParams.get('q'));
  if (requestedQuality === undefined) return null;
  const fit = url.searchParams.get('fit');
  if (!EXACT_BOX_FITS.has(fit) && !BOUNDING_FITS.has(fit)) return null;
  const href = url.searchParams.get('href');
  if (!href) return null;
  const hasW = url.searchParams.has('w'), hasH = url.searchParams.has('h');
  const width = hasW ? Number(url.searchParams.get('w')) : null;
  const height = hasH ? Number(url.searchParams.get('h')) : null;
  if (hasW && (!Number.isSafeInteger(width) || width < 1)) return null;
  if (hasH && (!Number.isSafeInteger(height) || height < 1)) return null;
  let source;
  try { source = new URL(href, url); } catch { return null; }
  if (source.origin !== url.origin) return null;
  const key = mediaKey(source);
  if (!key) return null;

  const list = typeof storage.variants === 'function' ? await storage.variants(key, {signal: request.signal}) : [];
  let targetW = width, targetH = height, main = undefined;
  const readMain = async () => {
    if (main === undefined) main = typeof storage.sidecar === 'function' ? await storage.sidecar(key, {signal: request.signal}) : null;
    return main;
  };

  if (BOUNDING_FITS.has(fit)) {
    const full = await readMain();
    if (!full || !Number.isSafeInteger(full.width) || !Number.isSafeInteger(full.height)) {
      if (!hasW) return null;
      const direct = list.find(v => v.width === width && (!hasH || v.result.height === height));
      if (!direct || !matchesQuality(direct.result, format, requestedQuality)) return null;
      const bytes = await storage.readVariant(direct, {signal: request.signal});
      return bytes ? answer(await serve(bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal,
        ...(typeof direct.sha256 === 'string' && {etag: direct.sha256.slice(0, 32)})})) : null;
    }
    const scaleW = hasW ? width / full.width : 1, scaleH = hasH ? height / full.height : 1;
    const rawScale = Math.min(scaleW, scaleH);
    if (rawScale > 1 && fit !== 'scale-down') return null;
    const scale = Math.min(1, rawScale);
    targetW = Math.max(1, Math.round(full.width * scale));
    targetH = Math.max(1, Math.round(full.height * scale));
  } else if (!hasW && hasH) {
    const full = await readMain();
    if (!full || !Number.isSafeInteger(full.width) || !Number.isSafeInteger(full.height) || height > full.height) return null;
    targetW = Math.max(1, Math.round(full.width * height / full.height));
    targetH = height;
  }
  const near = (w, h) => targetW !== null && w >= targetW && w <= targetW * NEAR_WIDTH &&
    (targetH === null || Math.abs(h * targetW / w - targetH) <= 1);
  const fileFor = file => file && matchesQuality(file.result, format, requestedQuality) && near(file.width, file.result.height);
  const file = targetW === null ? undefined : list.filter(v => v.width >= targetW).sort((a, b) => a.width - b.width).find(fileFor);
  const full = await readMain();
  const fullFits = full && Number.isSafeInteger(full.width) && Number.isSafeInteger(full.height) && matchesQuality(full, format, requestedQuality) &&
    (targetW === null ? targetH === null || full.height === targetH : near(full.width, full.height));
  if (file && !(fullFits && full.width < file.width)) {
    const bytes = await storage.readVariant(file, {signal: request.signal});
    if (bytes) return answer(await serve(bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal,
      ...(typeof file.sha256 === 'string' && {etag: file.sha256.slice(0, 32)})}));
  }
  if (!fullFits) return null;
  return answer(await serve(full.bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal,
    ...(typeof full.etag === 'string' && {etag: full.etag})}));
}

export async function announceUpload(hooks, response, id = 'rapier-media') {
  if (![200, 201].includes(response.status) || typeof hooks?.getTypedHooks !== 'function' || typeof hooks.getContext !== 'function') return;
  const data = (await response.clone().json().catch(() => null))?.data, item = data?.item ?? data;
  if (!item?.id || typeof item.url !== 'string') return;
  const media = {id: item.id, filename: item.filename, mimeType: item.mimeType, size: item.size, url: item.url, createdAt: item.createdAt};
  for (const hook of hooks.getTypedHooks('media:afterUpload').filter(hook => hook.pluginId === id))
    await hook.handler({media}, hooks.getContext(id));
}

const activation = new WeakMap();

const MEMORY_LIMIT = 10 * 1024 * 1024;
let cacheHelper;
const loadCacheHelper = () => cacheHelper ??= import('emdash/media/image-endpoint').then(
  module => typeof module.cacheMediaResponse === 'function' ? module : null, () => null);
export const useCacheHelper = module => { cacheHelper = module === undefined ? undefined : Promise.resolve(module); };

function storageKeyOf(url) {
  if (url.pathname === '/_image') {
    try { return mediaKey(new URL(url.searchParams.get('href') ?? '', url)); } catch { return null; }
  }
  return mediaKey(url);
}

async function tagOwn(response, url, cache) {
  const key = storageKeyOf(url), helper = key && cache?.enabled ? await loadCacheHelper() : null;
  if (helper) {
    const size = Number(response.headers.get('content-length'));
    helper.cacheMediaResponse(cache, key, Number.isFinite(size) && size > 0 ? size : undefined,
      helper.MEMORY_ROUTE_CACHE_MAX_MEDIA_BYTES ?? MEMORY_LIMIT);
  }
  return response;
}
export async function onRequest(context, next) {
  const emdash = context.locals.emdash, storage = emdash?.storage, request = context.request;
  const owned = !!storage && typeof storage === 'object';
  if (owned && typeof emdash?.getPublicPluginRouteMeta === 'function') activation.set(storage, emdash.getPublicPluginRouteMeta);
  const meta = typeof emdash?.getPublicPluginRouteMeta === 'function' ? emdash.getPublicPluginRouteMeta
    : owned ? activation.get(storage) : undefined;
  const enabled = typeof meta === 'function' && meta('rapier-media', 'available')?.public === true;
  const rendition = enabled ? await serveMedia({request, storage}) ?? await serveWidth({request, storage}) : null;
  if (rendition) return tagOwn(rendition, new URL(request.url), context.cache);
  const response = await next(), url = new URL(request.url);
  const directWrite = request.method === 'POST' && url.pathname === '/_emdash/api/media' && response.status === 201 ||
    request.method === 'PUT' && REPLACE.test(url.pathname) && response.status === 200;
  if (enabled && directWrite) {
    const work = announceUpload(emdash?.hooks, response).catch(error => console.error('[rapier-jxl] upload', error));
    context.locals.cfContext?.waitUntil?.(work);
    return response;
  }
  if (!['GET', 'HEAD'].includes(request.method) || !mediaKey(url) && url.pathname !== '/_image' ||
      url.searchParams.get('f') === 'jxl') return response;
  const headers = new Headers(response.headers);
  varyDelivery(headers);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
