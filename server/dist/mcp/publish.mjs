// SPDX-License-Identifier: AGPL-3.0-only
import {MAX_PUBLISHED_PAGE_BYTES, publicationId} from '../spec/publish.mjs';
import {handleAndroidPublish} from './publish-android.mjs';

export const PUBLISH_LIMITS = Object.freeze({
  maxBytes: MAX_PUBLISHED_PAGE_BYTES,
  chunkBytes: 64 * 1024,
  maxUploadMs: 60000,
  ownerRequestsPerMinute: 120,
  deploymentOwnerRequestsPerMinute: 6000,
  readerRequestsPerMinute: 240,
  deploymentReaderRequestsPerMinute: 12000,
  writesPerHour: 120,
  deploymentWritesPerHour: 2000,
  createsPerHour: 12,
  deploymentCreatesPerHour: 120,
});

export const PUBLISHED_PAGE_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-src about: data: blob:; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const SAFE_HEADERS = Object.freeze({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'"});
const OWNER_CORS = Object.freeze({'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match, X-Rapier-SHA256',
  'Access-Control-Expose-Headers': 'ETag, Retry-After, X-Rapier-Published, X-Rapier-Page-Bytes, X-Rapier-Updated-At, X-Rapier-SHA256'});
const ROUTE = /^\/(p|publish)\/([a-f0-9]{64})$/;
const REVISION = /^"([a-f0-9]{32})"$/;
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
const problem = (code, message, status, details = {}, headers = {}) => new Response(JSON.stringify({code, message, ...details}),
  {status, headers: {...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers}});
const unavailable = () => problem('publication_unavailable', 'The page service did not confirm the request. Check its status before retrying.', 503);

function condition(request) {
  const match = request.headers.get('If-Match'), absent = request.headers.get('If-None-Match');
  if (request.method === 'PUT' && absent === '*' && match === null) return '*';
  if (absent === null && REVISION.test(match || '')) return REVISION.exec(match)[1];
  return null;
}

async function takeBudget(env, key, limit, windowMs, takeId) {
  const answer = await env.BUDGET.get(env.BUDGET.idFromName(key)).fetch(new Request('https://rapier.internal/take', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({limit, windowMs, ...(takeId ? {takeId} : {})}),
  }));
  if (!answer.ok) return unavailable();
  const value = await answer.json();
  if (value.code || typeof value.allowed !== 'boolean') return unavailable();
  if (value.allowed) return null;
  return problem('publication_rate_limited', 'Too many page requests. Try again after the stated delay.', 429, {},
    {'Retry-After': String(Math.max(1, Math.ceil((value.resetAt - Date.now()) / 1000)))});
}

async function requestBudget(request, env, owner) {
  const ip = await digest('rapier-publish-ip-v1:' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
  const group = owner ? 'owner' : 'reader', limits = PUBLISH_LIMITS;
  const refused = await takeBudget(env, 'publish:' + group + ':ip:' + ip,
    owner ? limits.ownerRequestsPerMinute : limits.readerRequestsPerMinute, 60000);
  if (refused) return refused;
  return await takeBudget(env, 'publish:' + group + ':deployment',
    owner ? limits.deploymentOwnerRequestsPerMinute : limits.deploymentReaderRequestsPerMinute, 60000);
}

async function writeBudget(request, env, id, expected) {
  const ip = await digest('rapier-publish-ip-v1:' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
  const takeId = 'take_' + await digest('rapier-publish-write-v1:' + id + ':' + request.method + ':' + expected);
  const groups = [['write', PUBLISH_LIMITS.writesPerHour, PUBLISH_LIMITS.deploymentWritesPerHour],
    ...(expected === '*' ? [['create', PUBLISH_LIMITS.createsPerHour, PUBLISH_LIMITS.deploymentCreatesPerHour]] : [])];
  for (const [kind, local, global] of groups) {
    const refused = await takeBudget(env, 'publish:' + kind + ':ip:' + ip, local, 3600000, takeId)
      || await takeBudget(env, 'publish:' + kind + ':deployment', global, 3600000, takeId);
    if (refused) return refused;
  }
  return null;
}

function withCors(response, owner, head) {
  const headers = new Headers(response.headers);
  if (owner) for (const [key, value] of Object.entries(OWNER_CORS)) headers.set(key, value);
  return new Response(head ? null : response.body, {status: response.status, headers});
}

export async function handlePublishedPages(request, env) {
  if (!env.PUBLISHED_PAGES?.get || !env.PUBLISHED_PAGES?.idFromName)
    return problem('publication_not_found', 'Page not found.', 404);
  const url = new URL(request.url), match = ROUTE.exec(url.pathname), owner = url.pathname.startsWith('/publish/');
  const answer = async () => {
    if (!match || url.search || url.hash) return problem('publication_not_found', 'Page not found.', 404);
    const [, kind, id] = match;
    if (request.method === 'OPTIONS' && owner) return new Response(null, {status: 204, headers: SAFE_HEADERS});
    const allowed = owner ? ['GET', 'HEAD', 'PUT', 'DELETE'] : ['GET', 'HEAD'];
    if (!allowed.includes(request.method)) return problem('publication_method', 'Method not allowed.', 405, {}, {Allow: allowed.join(', ')});
    if (!env.PUBLISHED_PAGES?.get || !env.PUBLISHED_PAGES?.idFromName || !env.BUDGET?.get || !env.BUDGET?.idFromName) return unavailable();
    const refused = await requestBudget(request, env, owner);
    if (refused) return refused;
    if (owner) {
      const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') || '');
      let proven = false;
      if (bearer) try { proven = await publicationId(bearer[1]) === id; } catch {}
      if (!proven) return problem('publication_unauthorized', 'The page key is required.', 401, {}, {'WWW-Authenticate': 'Bearer realm="published-page"'});
    }
    let expected;
    if (['PUT', 'DELETE'].includes(request.method)) {
      expected = condition(request);
      if (expected === null) return problem('publication_precondition', 'Send the current page revision, or If-None-Match: * for a new page.',
        request.headers.has('If-Match') || request.headers.has('If-None-Match') ? 400 : 428);
      if (request.method === 'PUT') {
        if (!/^[a-f0-9]{64}$/.test(request.headers.get('X-Rapier-SHA256') || ''))
          return problem('publication_digest', 'Send the SHA-256 digest of the complete page.', 400);
        if (!/^text\/html(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get('Content-Type') || '') ||
          request.headers.has('Content-Encoding') && request.headers.get('Content-Encoding') !== 'identity')
          return problem('publication_content_type', 'Send an uncompressed UTF-8 HTML page.', 415);
        const length = request.headers.get('Content-Length');
        if (length !== null && !/^\d+$/.test(length)) return problem('publication_length', 'The page length is invalid.', 400);
        if (length !== null && Number(length) > PUBLISH_LIMITS.maxBytes)
          return problem('publication_too_large', 'The page exceeds the 16 MiB size limit.', 413, {maxBytes: PUBLISH_LIMITS.maxBytes});
      }
      const refused = await writeBudget(request, env, id, expected);
      if (refused) return refused;
    }
    const headers = new Headers({'X-Rapier-Publication-ID': id, 'X-Rapier-Publication-Origin': url.origin});
    if (expected !== undefined) headers.set('X-Rapier-Publication-Expected', expected);
    if (request.method === 'PUT') headers.set('X-Rapier-SHA256', request.headers.get('X-Rapier-SHA256'));
    if (request.method === 'PUT' && request.headers.has('Content-Length'))
      headers.set('X-Rapier-Publication-Length', request.headers.get('Content-Length'));
    const path = kind === 'p' ? '/page' : '/owner';
    const page = env.PUBLISHED_PAGES.get(env.PUBLISHED_PAGES.idFromName(id));
    if (request.method !== 'PUT') return page.fetch(new Request('https://rapier.internal' + path, {method: request.method, headers, signal: request.signal}));
    const relay = new TransformStream(), abort = new AbortController();
    const transfer = request.body ? request.body.pipeTo(relay.writable, {signal: abort.signal}).then(() => true, () => false) : Promise.resolve(false);
    if (!request.body) return problem('publication_empty', 'The page is empty.', 400);
    let response;
    try {
      response = await page.fetch(new Request('https://rapier.internal' + path, {method: 'PUT', headers,
        body: relay.readable, signal: request.signal, duplex: 'half'}));
    } finally {
      if (!response?.ok) abort.abort();
      const transferred = await transfer;
      if (response?.ok && !transferred) response = unavailable();
    }
    return response;
  };
  try {
    const android = handleAndroidPublish(request, env);
    if (android) return android;
    return withCors(await answer(), owner, request.method === 'HEAD');
  }
  catch { return withCors(unavailable(), owner, request.method === 'HEAD'); }
}

async function readPage(request) {
  const reader = request.body?.getReader();
  if (!reader) throw {status: 400, code: 'publication_empty', message: 'The page is empty.'};
  const hash = new crypto.DigestStream('SHA-256'), writer = hash.getWriter(), result = hash.digest;
  result.catch(() => {});
  const decoder = new TextDecoder('utf-8', {fatal: true}), chunks = [];
  let size = 0, chunk = new Uint8Array(PUBLISH_LIMITS.chunkBytes), used = 0;
  let timer;
  const timeout = new Promise((_, reject) => {timer = setTimeout(() => reject({status: 408,
    code: 'publication_timeout', message: 'The page upload timed out. Try again.'}), PUBLISH_LIMITS.maxUploadMs);});
  try {
    while (true) {
      request.signal.throwIfAborted();
      const {value, done} = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > PUBLISH_LIMITS.maxBytes) throw {status: 413, code: 'publication_too_large', message: 'The page exceeds the 16 MiB size limit.'};
      try { decoder.decode(value, {stream: true}); } catch { throw {status: 400, code: 'publication_utf8', message: 'The page must contain UTF-8 text.'}; }
      await writer.write(value);
      for (let offset = 0; offset < value.byteLength;) {
        const length = Math.min(chunk.byteLength - used, value.byteLength - offset);
        chunk.set(value.subarray(offset, offset + length), used); used += length; offset += length;
        if (used === chunk.byteLength) { chunks.push(chunk); chunk = new Uint8Array(PUBLISH_LIMITS.chunkBytes); used = 0; }
      }
    }
    try { decoder.decode(); } catch { throw {status: 400, code: 'publication_utf8', message: 'The page must contain UTF-8 text.'}; }
    const declared = request.headers.get('X-Rapier-Publication-Length');
    if (declared !== null && Number(declared) !== size) throw {status: 400, code: 'publication_length', message: 'The page transfer was incomplete.'};
    if (!size) throw {status: 400, code: 'publication_empty', message: 'The page is empty.'};
    if (used) chunks.push(chunk.slice(0, used));
    await writer.close();
    const sha256 = hex(await result);
    if (sha256 !== request.headers.get('X-Rapier-SHA256')) throw {status: 400,
      code: 'publication_digest', message: 'The complete page did not arrive. Try again.'};
    return {chunks, bytes: size, sha256};
  } catch (error) {
    await Promise.allSettled([reader.cancel(), writer.abort()]);
    throw error;
  } finally { clearTimeout(timer); reader.releaseLock(); writer.releaseLock(); }
}

export class RapierPublishedPage {
  constructor(ctx) { this.ctx = ctx; this.receiving = false; }

  metadata(request, head) {
    const id = request.headers.get('X-Rapier-Publication-ID'), origin = request.headers.get('X-Rapier-Publication-Origin');
    return {id, url: origin + '/p/' + id, published: head?.published === true, revision: head?.revision || null,
      bytes: head?.bytes || 0, updatedAt: head?.updatedAt || null, sha256: head?.sha256 || null};
  }

  receipt(request, head, status = 200, error) {
    const value = this.metadata(request, head), headers = {...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8',
      'X-Rapier-Published': value.published ? '1' : '0', 'X-Rapier-Page-Bytes': String(value.bytes)};
    if (head?.revision) headers.ETag = '"' + head.revision + '"';
    if (head?.updatedAt) headers['X-Rapier-Updated-At'] = String(head.updatedAt);
    if (head?.sha256) headers['X-Rapier-SHA256'] = head.sha256;
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({...value, ...(error || {})}), {status, headers});
  }

  changed(request, head) {
    return this.receipt(request, head, 412, {code: 'publication_changed', message: 'The published page changed. Read its current revision before another change.'});
  }

  async fetch(request) {
    const path = new URL(request.url).pathname, storage = this.ctx.storage;
    try {
      const current = storage.kv.get('head');
      if (path === '/page' && ['GET', 'HEAD'].includes(request.method)) {
        if (!current?.published) return problem('publication_not_found', 'Page not found.', 404);
        const chunks = []; let bytes = 0;
        if (request.method === 'GET') for (let i = 0; i < current.chunks; i++) {
          const chunk = storage.kv.get('html:' + i);
          if (!(chunk instanceof Uint8Array)) return unavailable();
          chunks.push(chunk); bytes += chunk.byteLength;
        }
        if (request.method === 'GET' && bytes !== current.bytes) return unavailable();
        let index = 0;
        const body = request.method === 'HEAD' ? null : new ReadableStream({pull(controller) {
          if (index === chunks.length) controller.close(); else controller.enqueue(chunks[index++]);
        }});
        return new Response(body, {headers: {...SAFE_HEADERS, 'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': PUBLISHED_PAGE_CSP, 'Content-Length': String(current.bytes), ETag: '"' + current.revision + '"',
          'Cross-Origin-Opener-Policy': 'same-origin'}});
      }
      if (path !== '/owner') return problem('publication_not_found', 'Page not found.', 404);
      if (['GET', 'HEAD'].includes(request.method)) return this.receipt(request, current);
      if (!['PUT', 'DELETE'].includes(request.method)) return problem('publication_method', 'Method not allowed.', 405);
      const expected = request.headers.get('X-Rapier-Publication-Expected');
      if (!(expected === '*' && request.method === 'PUT') && !/^[a-f0-9]{32}$/.test(expected || ''))
        return problem('publication_precondition', 'A page revision is required.', 428);
      let upload;
      if (request.method === 'PUT') {
        if (this.receiving) return problem('publication_busy', 'Another upload is still arriving. Try again.', 429, {}, {'Retry-After': '1'});
        this.receiving = true;
        try { upload = await readPage(request); } finally { this.receiving = false; }
      }
      request.signal.throwIfAborted();
      const head = storage.kv.get('head');
      if (head?.last?.method === request.method && head.last.expected === expected &&
          (request.method === 'DELETE' || head.last.sha256 === upload.sha256)) return this.receipt(request, head, head.last.status);
      if (expected === '*' ? !!head : !head || expected !== head.revision) return this.changed(request, head);
      if (request.method === 'DELETE' && !head.published) return this.receipt(request, head);
      const status = head ? 200 : 201;
      const next = {revision: hex(crypto.getRandomValues(new Uint8Array(16))), published: request.method === 'PUT',
        bytes: upload?.bytes || 0, sha256: upload?.sha256 || null, chunks: upload?.chunks.length || 0, updatedAt: Date.now(),
        last: {method: request.method, expected, sha256: upload?.sha256 || null, status}};
      storage.transactionSync(() => {
        for (let i = 0; i < next.chunks; i++) storage.kv.put('html:' + i, upload.chunks[i]);
        for (let i = next.chunks; i < (head?.chunks || 0); i++) storage.kv.delete('html:' + i);
        storage.kv.put('head', next);
      });
      await storage.sync();
      return this.receipt(request, next, status);
    } catch (error) {
      return error?.status && error?.code ? problem(error.code, error.message, error.status) : unavailable();
    }
  }
}
