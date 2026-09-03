/* Rapier service worker.

   `rapier.html` works alone. The installable PWA additionally requires
   this file, manifest.json, icon-192.png, and icon-512.png beside it.

   All URLs are scope-relative so root and subdirectory deployments behave
   identically. Do not casually change manifest `id`, `start_url`, scope, or
   the deployed path: browsers may treat that as a different installed app.

   Each build's shell lives in its own cache generation, named for the bytes it
   holds. The release digest below deliberately changes this worker whenever any
   shell member changes; qualification derives and verifies it from those bytes.
   Navigations remain network-first; the shell mainly protects users who next
   launch fully offline. Install is the only writer: once it has verified a
   generation's bytes, nothing ever mutates that cache again, so a worker's own
   generation is always exactly what its own install checked.
*/

/* CacheStorage is shared by every service-worker scope on an origin. Include
   this deployment's scope so two Rapier installations in different
   subdirectories cannot rotate or evict one another's offline shell. */
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = '5409a5c3fbd9e5c3ae73c9d6c792f9d076325d05a28d0e620b3bcf0dcf16548b';
/* This worker's own generation — never a value looked up at runtime. Two
   different releases compile to two different names, so a predecessor and a
   successor can never resolve, overwrite, or retire each other's cache. */
const SHELL_GENERATION = SHELL_CACHE_PREFIX + SHELL_RELEASE_SHA256.slice(0, 32);
const SHELL_PAGE_URL = new URL('./rapier.html', self.location).href;
const SHELL_ROOT_URL = new URL('./', self.location).href;
/* Demonstration material, not product. A shell member is mandatory — its absence
   fails the install and takes the whole offline editor with it — and an ordinary
   Rapier has no business depending on a fixture it never opens. It is cached on
   first use instead, in its own store, so `?demo=1` still works offline for
   anyone who has actually been there. */
const DEMO_PAGE_URL = new URL('./demo.md', self.location).href;
const FIXTURE_CACHE = `rapier-fixture:${CACHE_SCOPE}`;

/* Share payloads are one-shot, scope-qualified, bounded, and short-lived. */
const SHARE_CACHE = `rapier-share:${CACHE_SCOPE}:v1`;
const MAX_SHARED_BYTES = 25 * 1024 * 1024;
const MAX_SHARED_REQUEST_BYTES = MAX_SHARED_BYTES + 1024 * 1024;
const MAX_SHARED_FILENAME_BYTES = 255;
const MAX_PENDING_SHARES = 4;
const MAX_SHARE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SHARE_CLOCK_SKEW_MS = 5 * 60 * 1000;

// Scope-relative share-target endpoint.
const SHARE_TARGET_PATH = new URL('./share-target', self.location).pathname;
const SHARE_PAYLOAD_URL = new URL('./share-payload', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const members = await Promise.all(SHELL_URLS.map(async relative => {
      const request = new Request(new URL(relative, self.location), { cache: 'reload' });
      const response = await fetch(request);
      if (!isCacheableShellMember(request, response)) {
        throw new Error(`invalid shell response: ${request.url}`);
      }
      return { request, response, body: await response.clone().arrayBuffer() };
    }));
    const releaseDigest = await shellGeneration(members);
    if (releaseDigest !== SHELL_RELEASE_SHA256) {
      throw new Error('shell bytes do not match this service worker release');
    }
    /* Own generation, own cache, named before any byte was fetched: a predecessor
       still serving compiled a different SHELL_RELEASE_SHA256 and so owns a
       different name, never this one. A retry after a failed put simply retries
       the same open-and-put against the same name. */
    if (!(await caches.has(SHELL_GENERATION))) {
      const cache = await caches.open(SHELL_GENERATION);
      await Promise.all(members.map(member => cache.put(member.request, member.response)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Enable navigation preload where available.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    /* Predecessors are dropped here rather than at install, so a generation an
       outgoing worker may still be serving from outlives the install that
       replaces it. Retired by name, never by a shared pointer: this worker
       keeps only the one generation compiled into its own release. */
    const keys = await caches.keys();
    const superseded = keys.filter(key => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_GENERATION);
    await Promise.all(superseded.map(key => caches.delete(key)));
    /* A fixture is not part of the hashed shell, so nothing rotates it when the
       build changes. Retiring it with the generation it was fetched beside is
       what keeps a stale one from outliving the Rapier that opened it. */
    if (superseded.length) await caches.delete(FIXTURE_CACHE);
    await pruneShareCache(await caches.open(SHARE_CACHE));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Cache share-target POST data, then redirect to the editor.
  if (req.method === 'POST' &&
      url.origin === self.location.origin &&
      url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    const networkResponse = (async () => {
      let preload = null;
      try { preload = await event.preloadResponse; } catch (_) {}
      return preload || fetch(req);
    })();

    /* The shell's HTML is written once, at verified install, and never again: a
       live navigation response is unverified, and a rolling deploy can serve this
       worker's own release from one edge and a newer build's bytes from another.
       Writing it back here would let unverified bytes into a cache whose name
       promises exactly what install hashed. */
    event.respondWith(networkResponse.then(async response => {
      if (response && response.ok) return response;
      return (await cachedNavigationResponse(req)) || response;
    }, async () => {
      return (await cachedNavigationResponse(req)) || new Response(
        'Rapier is unavailable offline.',
        {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }));
    return;
  }

  if (req.url === DEMO_PAGE_URL) { event.respondWith(fixtureResponse(req)); return; }

  // Shell cache first; all other GETs pass through uncached.
  event.respondWith(
    shellCache()
      .then(cache => cache.match(req))
      .then(cached => cached || fetch(req))
  );
});

async function cachedNavigationResponse(request) {
  /* Offline shell fallback belongs only to Rapier's two doors. Returning the editor for an
     unknown navigation would turn a missing `/agents`, misspelled document, or private path
     into a convincing 200 HTML response after the service worker takes control — an SPA
     fallback the origin deliberately refuses. Query parameters do not change either door. */
  const requested = new URL(request.url);
  const root = new URL(SHELL_ROOT_URL);
  const page = new URL(SHELL_PAGE_URL);
  if (requested.origin !== root.origin ||
      (requested.pathname !== root.pathname && requested.pathname !== page.pathname)) return null;
  const cache = await shellCache();
  return (await cache.match(request)) || cache.match(SHELL_PAGE_URL);
}

/* Cache-on-first-use, and never fail the request because storing failed: the
   fixture is worth having offline but is worth nothing at the cost of not
   opening at all. Same admission the shell members get, so a host that serves
   `.md` as something else is refused rather than stored. */
async function fixtureResponse(request) {
  try {
    const cache = await caches.open(FIXTURE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableShellMember(request, response)) {
      try { await cache.put(request, response.clone()); } catch (_) {}
    }
    return response;
  } catch (_) {
    return fetch(request);
  }
}

let shellCachePromise = null;

/* Memoizes one caches.open call per worker instance. Not a correctness guard —
   SHELL_GENERATION is a compiled-in constant, so every call resolves the same
   cache; this only spares the lookup for a fetch handler that runs on every
   request. */
function shellCache() {
  return shellCachePromise || (shellCachePromise = caches.open(SHELL_GENERATION));
}

/* Two builds of one app version are indistinguishable by version string. Derive the
   release from ordered relative URLs, lengths and content hashes: the same rows are
   independently recomputed by qualification, and the pinned literal makes a changed
   shell change sw.js so an installed browser actually checks and installs the update. */
async function shellGeneration(members) {
  const rows = await Promise.all(members.map(async (member, index) =>
    `${SHELL_URLS[index]}\t${member.body.byteLength}\t${toHex(
      await crypto.subtle.digest('SHA-256', member.body))}`));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rows.join('\n')));
  return toHex(digest);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
}

function isCacheableShellMember(request, response) {
  if (!request || !response || !response.ok || response.redirected || !response.url ||
      response.url !== request.url || new URL(response.url).origin !== self.location.origin) {
    return false;
  }
  const contentType = (response.headers.get('Content-Type') || '').trim();
  if (request.url === SHELL_PAGE_URL) return /^text\/html(?:;|$)/i.test(contentType);
  /* Static hosts disagree about `.md`, and a type this worker refuses would fail
     the whole install and take the offline shell with it. */
  if (request.url === DEMO_PAGE_URL) return /^text\/(?:markdown|plain)(?:;|$)/i.test(contentType);
  if (request.url.endsWith('/manifest.json')) {
    return /^(?:application\/(?:manifest\+json|json)|text\/json)(?:;|$)/i.test(contentType);
  }
  return /^image\/png(?:;|$)/i.test(contentType);
}

function shareCacheKey(token) {
  const url = new URL(SHARE_PAYLOAD_URL);
  url.searchParams.set('token', token);
  return url.href;
}

function newShareToken() {
  const random = globalThis.crypto;
  if (!random || typeof random.getRandomValues !== 'function') {
    throw new Error('secure random source is unavailable');
  }
  if (typeof random.randomUUID === 'function') return random.randomUUID();
  const bytes = new Uint8Array(16);
  random.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function shareRedirect(token) {
  const url = new URL('./rapier.html', self.location);
  url.searchParams.set('share-target', token);
  return url.href;
}

function encodeSharedFilename(value, fallback) {
  let result = '';
  let bytes = 0;
  for (let character of String(value || fallback)) {
    if (character.length === 1) {
      const code = character.charCodeAt(0);
      if (code >= 0xd800 && code <= 0xdfff) character = '\ufffd';
    }
    const codePoint = character.codePointAt(0);
    const width = codePoint <= 0x7f ? 1 :
      (codePoint <= 0x7ff ? 2 : (codePoint <= 0xffff ? 3 : 4));
    if (bytes + width > MAX_SHARED_FILENAME_BYTES) break;
    result += character;
    bytes += width;
  }
  return encodeURIComponent(result || fallback);
}

let shareCacheMutation = Promise.resolve();

async function pruneShareCache(cache, now = Date.now()) {
  const stale = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    const storedAt = Number(response && response.headers.get('X-Rapier-Shared-At'));
    if (Number.isFinite(storedAt) && storedAt > 0 &&
        (now - storedAt > MAX_SHARE_AGE_MS || storedAt - now > MAX_SHARE_CLOCK_SKEW_MS)) {
      stale.push(request);
    }
  }
  await Promise.all(stale.map(request => cache.delete(request)));
}

function storeShare(cache, key, response) {
  const operation = shareCacheMutation.then(async () => {
    await pruneShareCache(cache);
    const before = await cache.keys();
    const required = before.length - MAX_PENDING_SHARES + 1;
    if (required > 0) {
      await Promise.all(before.slice(0, required).map(oldest => cache.delete(oldest)));
    }
    await cache.put(key, response);
    const after = await cache.keys();
    const overflow = after.length - MAX_PENDING_SHARES;
    if (overflow > 0) {
      await Promise.all(after.slice(0, overflow).map(oldest => cache.delete(oldest)));
    }
  });
  shareCacheMutation = operation.catch(() => {});
  return operation;
}

function shareErrorResponse(code) {
  return new Response('', {
    headers: {
      'X-Share-Error': code,
      'X-Rapier-Shared-At': String(Date.now()),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

async function readBoundedRequestBody(request, maximumBytes) {
  /* A missing stream fails as an explicit unreadable share. Falling back to
     request.formData() here would reintroduce an unbounded allocation path. */
  if (!request.body || typeof request.body.getReader !== 'function') {
    throw new Error('share request body is unavailable');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || !ArrayBuffer.isView(value)) throw new Error('invalid share request chunk');
      const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      total += chunk.byteLength;
      if (total > maximumBytes) {
        try { await reader.cancel('share request is too large'); } catch (_) {}
        return null;
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function handleShareTarget(request) {
  const token = newShareToken();
  const cacheKey = shareCacheKey(token);
  let cache = null;

  try {
    cache = await caches.open(SHARE_CACHE);
    /* No provenance is knowable here: the browser adds its Fetch Metadata headers
       (Sec-Fetch-Site and its siblings) at the network layer, after a worker's fetch
       event, so a worker never sees them on any request — a guard on them refuses
       every share, the OS share sheet's included (proved in Chrome 152 four ways,
       docs/evidence/lane-share/). What bounds this door instead is what the worker
       can see: the payload is capped, one-shot, scope-qualified and short-lived, and
       the landing opens the incoming document through the same recovery question as
       every other door — never over unsaved work, never silently. */
    const declaredLength = Number(request.headers.get('Content-Length'));
    const contentType = String(request.headers.get('Content-Type') || '');
    let response;

    if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARED_REQUEST_BYTES) {
      response = shareErrorResponse('too-large');
    } else if (!/^multipart\/form-data(?:;|$)/i.test(contentType.trim())) {
      response = shareErrorResponse('unreadable');
    } else {
      // Content-Length is advisory; bound the stream before multipart parsing.
      const body = await readBoundedRequestBody(request, MAX_SHARED_REQUEST_BYTES);
      if (!body) {
        response = shareErrorResponse('too-large');
      } else {
        const formData = await new Response(body, {
          headers: { 'Content-Type': contentType },
        }).formData();
        const file = formData.get('file');
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const sharedUrl = formData.get('url') || '';

        if (file && typeof file !== 'string') {
          response = file.size > MAX_SHARED_BYTES
            ? shareErrorResponse('too-large')
            : new Response(file, { headers: {
                'X-Rapier-Filename-Encoded': encodeSharedFilename(file.name, 'shared.md'),
                'X-Share-Kind': 'file',
                'X-Rapier-Shared-At': String(Date.now()),
                'Content-Type': file.type || 'application/octet-stream',
              } });
        } else if (text || title || sharedUrl) {
          const parts = [];
          if (title) parts.push('# ' + title, '');
          if (text) parts.push(text, '');
          if (sharedUrl) parts.push('<' + sharedUrl + '>');
          const content = parts.join('\n');
          const filename = (title
            ? title.replace(/[^\w\-. ]+/g, '_').slice(0, 60)
            : 'shared') + '.md';
          response = new Blob([content]).size > MAX_SHARED_BYTES
            ? shareErrorResponse('too-large')
            : new Response(content, { headers: {
                'X-Rapier-Filename-Encoded': encodeSharedFilename(filename, 'shared.md'),
                'X-Share-Kind': 'text',
                'X-Rapier-Shared-At': String(Date.now()),
                'Content-Type': 'text/markdown; charset=utf-8',
              } });
        } else {
          response = shareErrorResponse('empty');
        }
      }
    }

    await storeShare(cache, cacheKey, response);
  } catch (error) {
    console.warn('[rapier] share-target intake failed', error);
    /* The recovery store can fail for the same reason the first one did — an evicted or
       full cache, or a cache that never opened at all. Letting it throw here would abandon
       the redirect entirely and hand the user a browser error page instead of Rapier, which
       then has no token to report. The page already treats a missing payload as an
       unreadable share. */
    try {
      if (cache) await storeShare(cache, cacheKey, shareErrorResponse('unreadable'));
    } catch (storeError) {
      console.warn('[rapier] share-target error payload could not be stored', storeError);
    }
  }
  return Response.redirect(shareRedirect(token), 303);
}
