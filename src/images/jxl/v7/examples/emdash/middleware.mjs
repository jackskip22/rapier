import {serve} from 'rapier-jxl/serve';

const FILE = /^\/_emdash\/api\/media\/file\/([0-9A-HJKMNP-TV-Z]{26}\.(?:jpe?g|jpe|jfif|png|webp|avif))$/i;
const SANDBOX = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
export const mediaKey = url => FILE.exec(new URL(url).pathname)?.[1] ?? null;

export function acceptsJxl(value, alternative = 'image/webp') {
  const weights = new Map();
  const parts = String(value ?? '').match(/(?:[^,"]|"(?:\\.|[^"\\])*")+/g) ?? [];
  for (const part of parts) {
    const [type, ...parameters] = part.trim().toLowerCase().split(';').map(p => p.trim());
    if (!['image/jxl', alternative, 'image/*', '*/*'].includes(type)) continue;
    if (parameters.some(p => p && !/^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(p))) continue;
    const weight = parameters.length ? Number(parameters.at(-1).slice(2)) : 1;
    weights.set(type, Math.max(weights.get(type) ?? 0, weight));
  }
  const other = weights.get(alternative) ?? weights.get('image/*') ?? weights.get('*/*') ?? 0;
  return (weights.get('image/jxl') ?? 0) > 0 && weights.get('image/jxl') >= other;
}
const secure = response => {
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('content-security-policy', SANDBOX);
  response.headers.set('content-disposition', 'inline');
  return response;
};
const requestForJxl = request => ({method: request.method,
  headers: {accept: 'image/jxl', 'if-none-match': request.headers.get('if-none-match') ?? ''}});

export async function serveMedia({request, storage}) {
  if (!['GET', 'HEAD'].includes(request.method) || typeof storage?.sidecar !== 'function') return null;
  const key = mediaKey(request.url);
  if (!key) return null;
  const type = /\.(?:jpe?g|jpe|jfif)$/i.test(key) ? 'image/jpeg' : /\.png$/i.test(key) ? 'image/png' :
    /\.avif$/i.test(key) ? 'image/avif' : 'image/webp';
  if (!acceptsJxl(request.headers.get('accept'), type)) return null;
  const result = await storage.sidecar(key, {signal: request.signal});
  return result ? secure(await serve(result.bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal})) : null;
}

export async function serveWidth({request, storage, endpoint = '/_image'}) {
  const url = new URL(request.url);
  if (url.pathname !== endpoint || !['GET', 'HEAD'].includes(request.method) || typeof storage?.variants !== 'function' ||
      !acceptsJxl(request.headers.get('accept'))) return null;
  if ([...url.searchParams.keys()].some(k => !['href', 'w', 'h', 'f', 'q'].includes(k)) ||
      ![null, 'webp'].includes(url.searchParams.get('f')) || ![null, '85'].includes(url.searchParams.get('q'))) return null;
  const href = url.searchParams.get('href'), width = Number(url.searchParams.get('w'));
  if (!href || !Number.isSafeInteger(width) || width < 1) return null;
  let source;
  try { source = new URL(href, url); } catch { return null; }
  if (source.origin !== url.origin) return null;
  const key = mediaKey(source);
  if (!key) return null;
  const file = (await storage.variants(key, {signal: request.signal})).find(v => v.width === width);
  if (!file) return null;
  const bytes = await storage.readVariant(file, {signal: request.signal});
  if (!bytes) return null;
  if (url.searchParams.has('h') && Number(url.searchParams.get('h')) !== file.result.height) return null;
  return secure(await serve(bytes, requestForJxl(request), {maxPixels: storage.maxPixels, signal: request.signal}));
}

export async function onRequest(context, next) {
  const storage = context.locals.emdash?.storage, request = context.request;
  const rendition = await serveMedia({request, storage}) ?? await serveWidth({request, storage});
  if (rendition) return rendition;
  const response = await next(), url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method) || !mediaKey(url) && url.pathname !== '/_image') return response;
  const headers = new Headers(response.headers), vary = headers.get('vary');
  if (!vary?.split(',').some(value => ['*', 'accept'].includes(value.trim().toLowerCase())))
    headers.set('vary', vary ? vary + ', Accept' : 'Accept');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
