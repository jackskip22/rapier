/* Rapier service worker.

   `rapier.html` works alone. The installable PWA additionally requires
   this file, manifest.json, icon-192.png, and icon-512.png beside it.

   All URLs are scope-relative so root and subdirectory deployments behave
   identically. Do not casually change manifest `id`, `start_url`, scope, or
   the deployed path: browsers may treat that as a different installed app.

   Each build's shell lives in its own cache generation, named for the bytes it
   holds. The release digest below deliberately changes this worker whenever any
   shell member changes; qualification derives and verifies it from those bytes.
   Navigations remain network-first until two starts fail. A failed release uses
   its verified predecessor; only a completed start retires that predecessor.
   Install alone writes shell bytes. Startup receipts live beside them.
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
const SHELL_RELEASE_SHA256 = '768a1e8a577a21a33c0c9c8abb43dbdd9e2f6755db6d22208eb04157c4541c5f';
const SHELL_PAGE_SHA256 = '776b04c17ab26c5f649465feef462b4b4d3a37c9547e5b112d555f278702972c';
const SHELL_BOOT_ID = 'f47c61bf946d95eb85d141bf5f0f43a29970fa588f6c3fb61c1b678481efa5cb';
const SHELL_DOOR_SHA256 = {"/privacy":"47ff7526f31d3316d4bb943ee494442e94cc786f363e9465d445853b3da989f9","/commercial":"89de64e42b4f42d7ab7631bf572c4bc0dd8cd865dd9c13c3fc6617379c438130","/notes":"b6bdb5b32347c9bc2ae78cc6c475729f58635b35c9a35f54ead3f3ef0b1b4a9b","/draw":"f209e8003e8f0a4dd7f82f0745466397b48828a718343d3d5807e2576ce8ea7d","/watercolor":"72405f634eeb723cc285d863e2921ebc325943c51db6d57e8a1eadd21d7b6c9e"};
/* Only this generation receives writes. Retirement names are captured during
   install, so a delayed success cannot erase a newer worker's cache. */
const SHELL_GENERATION = SHELL_CACHE_PREFIX + SHELL_RELEASE_SHA256.slice(0, 32);
const SHELL_PAGE_URL = new URL('./rapier.html', self.location).href;
const SHELL_ROOT_URL = new URL('./', self.location).href;
const STARTUP_STATE_URL = new URL('./.rapier-startup', self.location).href;

/* Share payloads are one-shot, scope-qualified, bounded, and short-lived. */
const SHARE_CACHE = `rapier-share:${CACHE_SCOPE}:v1`;
const MAX_SHARED_BYTES = 25 * 1024 * 1024;
const MAX_SHARED_REQUEST_BYTES = MAX_SHARED_BYTES + 1024 * 1024;
const MAX_SHARED_FILENAME_BYTES = 255;
const MAX_PENDING_SHARES = 4;
/* A navigation is network-first, but not for ever: past this wait with the release's own verified
   copy at hand, the copy is served and the network's late answer dropped. */
const NAVIGATION_WAIT_MS = 3000;
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
    /* Own generation, own verified bytes. Opening a cache creates its name before
       its puts finish, so existence alone never proves that a failed install left
       every member behind. Each install fills the generation with the same verified
       bytes before it can activate; retrying cannot bless an incomplete shell. */
    const predecessors = (await caches.keys()).filter(name =>
      name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_GENERATION);
    const cache = await caches.open(SHELL_GENERATION);
    await Promise.all(members.map(member => cache.put(member.request, member.response)));
    if (!await startupState(cache)) {
      const previous = await previousShell(predecessors);
      await writeStartupState(cache, {release: SHELL_RELEASE_SHA256, page: SHELL_PAGE_SHA256,
        boot: SHELL_BOOT_ID, ready: false, rollback: false, failures: [], clients: {},
        previous, retire: predecessors});
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
    await pruneShareCache(await caches.open(SHARE_CACHE));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'rapier:startup') {
    event.waitUntil(receiveStartup(event).catch(() => {}));
  }
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
    const abort = new AbortController();
    const signal = AbortSignal.any([req.signal, abort.signal]);
    const networkResponse = (async () => {
      let preload = null;
      try { preload = await event.preloadResponse; } catch (_) {}
      const response = preload || await fetch(req, { signal });
      if (signal.aborted) {
        try { await response.body?.cancel(); } catch (_) {}
        throw signal.reason;
      }
      if (!response.ok || !response.body || !/^text\/html(?:;|$)/i.test((response.headers.get('Content-Type') || '').trim())) return response;
      /* Headers alone do not make an editor: the transport can fail halfway through a packed
         library. Finish the HTML body before choosing it over the verified shell. The signal
         cancels the body too, including navigation preload, which was not started by our fetch. */
      const stream = response.body.pipeThrough(new TransformStream(), { signal });
      const body = await new Response(stream).arrayBuffer();
      const headers = new Headers(response.headers);
      // Fetch has decoded the transfer; these headers describe the wire bytes, not this body.
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      headers.delete('Transfer-Encoding');
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    })();
    const discardNetwork = () => {
      abort.abort();
      // A response that finished while CacheStorage was answering no longer has a consumer.
      networkResponse.then(response => response.body?.cancel()).catch(() => {});
    };

    /* The shell's HTML is written once, at verified install, and never again: a
       live navigation response is unverified, and a rolling deploy can serve this
       worker's own release from one edge and a newer build's bytes from another.
       Writing it back here would let unverified bytes into a cache whose name
       promises exactly what install hashed. */
    event.respondWith((async () => {
      const outcome = networkResponse.then(response => ({ response }), error => ({ error }));
      let deadline;
      try {
        const state = await inspectStartup(event).catch(() => null);
        if (state?.rollback && state.previous) {
          const copy = await cachedNavigationResponse(req, state.previous).catch(() => null);
          if (copy) { discardNetwork(); return copy; }
        }
        /* The deadline covers both headers and body. With no readable offline copy, keep waiting
           for the network: a slow complete release is still useful to a first visit. */
        const first = await Promise.race([outcome, new Promise(resolve => {
          deadline = setTimeout(() => resolve(null), NAVIGATION_WAIT_MS);
        })]);
        if (!first) {
          const copy = await cachedNavigationResponse(req).catch(() => null);
          if (copy) { discardNetwork(); return rememberNavigation(event, copy); }
        }
        const settled = first || await outcome;
        /* A redirect is the host's answer: /draw/ goes to /draw, and the browser follows it. */
        if (settled.response && (settled.response.ok || settled.response.type === 'opaqueredirect')) {
          return rememberNavigation(event, settled.response);
        }
        const copy = await cachedNavigationResponse(req).catch(() => null);
        if (copy) { discardNetwork(); return rememberNavigation(event, copy); }
        return settled.response || new Response(
          'Rapier is unavailable offline.',
          {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          }
        );
      } finally {
        clearTimeout(deadline);
      }
    })());
    return;
  }

  // Receipt records are internal. Only the four shell members are served here.
  if (!SHELL_URLS.some(relative => new URL(relative, self.location).href === req.url)) return;
  event.respondWith(
    shellCache()
      .then(async cache => {
        const state = await startupState(cache).catch(() => null);
        const selected = state?.rollback && state.previous ? await caches.open(state.previous.cache) : cache;
        return selected.match(req);
      })
      .then(cached => cached || fetch(req))
  );
});

function isShellDoor(value) {
  /* Offline shell fallback belongs only to Rapier's two doors. Returning the editor for an
     unknown navigation would turn a missing `/agents`, misspelled document, or private path
     into a convincing 200 HTML response after the service worker takes control — an SPA
     fallback the origin deliberately refuses. Query parameters do not change either door. */
  const requested = new URL(value);
  const root = new URL(SHELL_ROOT_URL);
  const page = new URL(SHELL_PAGE_URL);
  /* And the addresses the page is entered by (repo/_redirects): /notes, /draw, /watercolor, /privacy and
     /commercial. Offline, each loads Rapier, which opens the surface the address names; the slash the host
     redirects online is served as it stands (shell/platform.js _rapierDoorPathMark). */
  const door = requested.pathname.startsWith(root.pathname) &&
    /^(?:notes|draw|watercolor|privacy|commercial)\/?$/.test(requested.pathname.slice(root.pathname.length));
  return requested.origin === root.origin &&
    (requested.pathname === root.pathname || requested.pathname === page.pathname || door);
}

function matchesPage(url, digest) {
  if (!isShellDoor(url)) return false;
  const path = '/' + new URL(url).pathname.slice(new URL(SHELL_ROOT_URL).pathname.length);
  return digest === SHELL_PAGE_SHA256 || digest === SHELL_DOOR_SHA256[path];
}

async function cachedNavigationResponse(request, release = null) {
  if (!isShellDoor(request.url)) return null;
  const cache = release ? await caches.open(release.cache) : await shellCache();
  const copy = (await cache.match(request)) || await cache.match(SHELL_PAGE_URL);
  if (!copy?.ok || !/^text\/html(?:;|$)/i.test((copy.headers.get('Content-Type') || '').trim())) return null;
  // Stored bytes can be damaged after install. Refuse them without cancelling a healthy network body.
  const digest = toHex(await crypto.subtle.digest('SHA-256', await copy.clone().arrayBuffer()));
  if (digest !== (release?.page || SHELL_PAGE_SHA256)) return null;
  const canonical = new URL(request.url);
  if (canonical.pathname !== new URL(SHELL_ROOT_URL).pathname && canonical.pathname.endsWith('/')) {
    // The page derives its storage and worker scope from its address. Match
    // the host redirect before opening a slash door, including when offline.
    canonical.pathname = canonical.pathname.slice(0, -1);
    return Response.redirect(canonical.href, 308);
  }
  return copy;
}

/* The same four-member digest proves every cached predecessor, including a
   cache with no completed-start receipt. A known failure is never promoted. */
async function previousShell(names) {
  let unconfirmed = null;
  for (const name of [...names].reverse()) {
    try {
      const cache = await caches.open(name);
      const members = await Promise.all(SHELL_URLS.map(async relative => {
        const response = await cache.match(new URL(relative, self.location).href);
        if (!response?.ok) throw new Error('incomplete cached release');
        return {body: await response.arrayBuffer()};
      }));
      const release = await shellGeneration(members);
      if (name !== SHELL_CACHE_PREFIX + release.slice(0, 32)) continue;
      const page = toHex(await crypto.subtle.digest('SHA-256', members[0].body));
      const receipt = await cache.match(STARTUP_STATE_URL);
      const state = receipt ? await receipt.json() : null;
      if (state?.failures?.length || state?.rollback) continue;
      const descriptor = {cache: name, release, page};
      if (state?.release === release && state.page === page && state.ready === true) return descriptor;
      unconfirmed ||= descriptor;
    } catch (_) {}
  }
  return unconfirmed;
}

async function startupState(cache) {
  const response = await cache.match(STARTUP_STATE_URL);
  if (!response) return null;
  const state = await response.json().catch(() => null);
  return state?.release === SHELL_RELEASE_SHA256 && state.page === SHELL_PAGE_SHA256 &&
    state.boot === SHELL_BOOT_ID && Array.isArray(state.failures) && state.clients &&
    Array.isArray(state.retire) ? state : null;
}

async function retireShells(names) {
  // A successor may still need the predecessor we both inherited. Its own
  // completed start will retire this inventory, including incomplete installs.
  if (self.registration.installing || self.registration.waiting) return;
  const known = new Set([SHELL_GENERATION, ...names]);
  if ((await caches.keys()).some(name => name.startsWith(SHELL_CACHE_PREFIX) && !known.has(name))) return;
  await Promise.all(names.map(name => caches.delete(name)));
}

function writeStartupState(cache, state) {
  return cache.put(STARTUP_STATE_URL, new Response(JSON.stringify(state), {
    headers: {'Content-Type': 'application/json'},
  }));
}

let startupMutation = Promise.resolve();

function updateStartup(change) {
  const operation = startupMutation.then(async () => {
    const cache = await shellCache(), state = await startupState(cache);
    if (!state) return null;
    const result = await change(state);
    if (result?.changed) await writeStartupState(cache, state);
    return result;
  });
  startupMutation = operation.catch(() => {});
  return operation;
}

function failStartup(state, client, attempt) {
  if (state.failures.length < 2 && !state.failures.some(failure => failure.client === client)) {
    state.failures.push({client, attempt});
  }
  if (state.failures.length >= 2 && state.previous) state.rollback = true;
}

async function inspectStartup(event) {
  const result = await updateStartup(async state => {
    let changed = false;
    const entries = Object.entries(state.clients);
    if (!state.ready && entries.length) {
      // get() can wait for a reserved navigation to execute. matchAll() lists
      // execution-ready clients without blocking delivery of their pages.
      const ready = new Set((await self.clients.matchAll({type: 'window', includeUncontrolled: true})).map(client => client.id));
      for (const [id, client] of entries) {
        const replaced = id === event.replacesClientId;
        if (!client.attempt && !replaced && !ready.has(id)) continue;
        if (replaced || !ready.has(id)) {
          // A live slow tab is not a failure. Replacing a pending document, or
          // losing a client that began boot, proves an abandoned start.
          if (!client.result && matchesPage(client.url, client.page) && (replaced || client.attempt)) {
            failStartup(state, id, client.attempt);
          }
          delete state.clients[id];
          changed = true;
        }
      }
    }
    return {changed, state};
  });
  return result?.state;
}

async function rememberNavigation(event, response) {
  if (!event.resultingClientId || !isShellDoor(event.request.url) || !response.ok ||
      !/^text\/html(?:;|$)/i.test((response.headers.get('Content-Type') || '').trim())) return response;
  await updateStartup(async state => {
    if (state.ready || state.rollback) return null;
    const page = toHex(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()));
    state.clients[event.resultingClientId] = {url: event.request.url, page, attempt: '', result: ''};
    return {changed: true};
  }).catch(() => {});
  return response;
}

async function receiveStartup(event) {
  const message = event.data, source = event.source;
  if (message.release !== SHELL_BOOT_ID || typeof message.attempt !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(message.attempt) || !['begin', 'ready', 'failed'].includes(message.state) ||
      source?.type !== 'window' || !['top-level', 'auxiliary'].includes(source.frameType) ||
      !isShellDoor(source.url)) return;
  const result = await updateStartup(async state => {
    if (!(await self.clients.get(source.id))) return null;
    if (state.ready) return null;
    const failed = state.failures.find(failure => failure.client === source.id);
    if (failed) return {fallback: state.rollback && message.state === 'failed' && failed.attempt === message.attempt};
    let client = state.clients[source.id];
    if (client && (!matchesPage(client.url, client.page) || client.attempt && client.attempt !== message.attempt)) return null;
    if (message.state === 'begin') {
      // An uncontrolled first page has no FetchEvent. Its compiled release ID
      // admits that one client; a recorded navigation mismatch always refuses.
      if (!client) client = state.clients[source.id] = {url: source.url, page: SHELL_PAGE_SHA256, result: ''};
      client.attempt = message.attempt;
      return {changed: true};
    }
    if (!client || client.attempt !== message.attempt) return null;
    if (client.result) return {fallback: state.rollback && client.result === 'failed'};
    client.result = message.state;
    if (message.state === 'ready') {
      if (state.rollback) return null;
      const retire = state.retire;
      state.ready = true;
      state.previous = null;
      state.retire = [];
      state.clients = {};
      state.failures = [];
      return {changed: true, retire};
    }
    failStartup(state, source.id, message.attempt);
    return {changed: true, fallback: state.rollback};
  });
  if (result?.retire) await retireShells(result.retire);
  if (result?.fallback) {
    const state = await startupState(await shellCache());
    if (state?.previous && await cachedNavigationResponse(new Request(source.url), state.previous)) {
      source.postMessage({type: 'rapier:startup-fallback', release: SHELL_BOOT_ID, attempt: message.attempt});
    }
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
       every share, the OS share sheet's included (proved in Chrome 152 four ways).
       What bounds this door instead is what the worker
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
