
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = '86bea75342a8c0c99a5c802cd2d75e0d063a0ada4f2a8db54aafe720d0405859';
const SHELL_PAGE_SHA256 = 'cec6f2feffb8a7f703ee83909bd1cf5baa58b75eb80abdede83e285030e99fb3';
const SHELL_BOOT_ID = 'd91d689473513817ab63a95fd969260d2cb2abf941d05a2a71c9ee3777dfe0cb';
const SHELL_DOOR_SHA256 = {"/":"b698afb54d7fc87073a2e879259e82d5377a76206ca52d375f3548a8f5241713","/privacy":"0dd698dbf344ceb7ab2a38040ca15f39c733f81ea124792d42867a764b5aa46c","/commercial":"91aff32f1a089207eeb9fd33c20a0b8cfd87ed6913ee7ec3bb231e186f2d196f","/notes":"da01e95283f42a57f2a811abb7150424d294b4a446c188582e3251af38d51377","/draw":"750668ec6fb28857d5c05d7e718e50718853d4e2d33f02f660988b1d9280b538","/watercolor":"0868557769d418a7072f6bf1caad01cfdcb993ecbc6c9ddf2a6054fbf3731e13","/paint":"195c6aede7227f01223fd9db6d4f236b88fdbca2a7b308ca8c249b324e157819","/jxl":"c92335bdd012272c66de1dfe10ab995bfd6f8890eb649f2de7ed5232c5154b06","/diff":"4c893fbdf78039b11eab32608b9de985b96050907055ff69ad185ab8fa6e91f2","/convert":"3904af085aeec5e14194c90464e67d507ec628646ac6f26a1e419e80480e6cb2","/math":"b1e27de34d80f40b099fb6c438e60315617670a952d220a21467aed4f9d1d6e7","/markdown-to-pdf":"0f766b2fbc82ccfe90dff131087647fb0115b5feaf49c300433b527abab21185","/markdown-to-word":"793b97ac1639d15ddccb8740f9ae3e8da35dde2fe03e8338c6c84645dc9a4a3a","/word-to-markdown":"d753944fee3139db78d2a6e53dfb00e03c241a548312b31e5f051be6d357314e","/pdf-to-markdown":"caeed652d5429b6136c840692985ab0bf0c1645e5809d01cb2ec593bb272c922","/diagrams":"47e41d279d13a2ca2536d923f34b7dc05a477153286273750270ee76e8eb85d7"};
const SHELL_SITE_PAGES = ["/gallery"];
const SITE_PAGE_CACHE = `rapier-pages:${CACHE_SCOPE}:v1`;
const SHELL_PARTS = [{"id":"document","file":"rapier-document-9578dd34275477d4.txt","bytes":902300,"sri":"eQIcJJFfrLTGWPssh6YtD2uk7R2s17GBMfWDu7B381ksiXWgrdpRE8fnpTu9rG9k","release":"1.2.76"},{"id":"presets","file":"rapier-presets-180164c6fe9f1835.txt","bytes":252201,"sri":"2QCiH/QvCpzoycqa8Jz5F6VpE6h9KCStIrgvQiWnOpPzXkPIAsqS+QnWtmZAmQkU","release":"1.2.76"},{"id":"drawing","file":"rapier-drawing-3529f1048412911f.txt","bytes":814287,"sri":"W0L/NShkpHctUbtqetUjiJGBDyroFUfdxLmUx3Cim6CpDMxauYK+CCN+3aEAXq7D","release":"1.2.76"},{"id":"jxl","file":"rapier-jxl-8fdf550039703f97.txt","bytes":38126,"sri":"Pl0kOFS8x4pkUmoEcUAOeCFixhVhFpEFBR0gNaWkTeTp6MfToH1thODt6Y59r+nC","release":"1.2.76"},{"id":"convert","file":"rapier-convert-4ec57567c0f8eb92.txt","bytes":5779,"sri":"0UdfC4iPrLzQUNeRxVFBXucy79REvx2KSpzAClQdvD908Zs1EP9QICr4Aq12TDpv","release":"1.2.76"},{"id":"diagrams","file":"rapier-diagrams-0c6f524fc4087d50.txt","bytes":6013,"sri":"NxgmRv6dEmiXpSik1D7RooATZ22ySrPImS6/MPW42MA2oMsKq7z7UxcEeiI9wUgm","release":"1.2.76"},{"id":"diagramtheme","file":"rapier-diagramtheme-31e471e2bc1f912d.txt","bytes":7205,"sri":"LCOm4MUWvX55nA48Kyt6Umu+IK9OZdO3BO1khhZZcT9+fGuvd/FkInyQlcrzw6lA","release":"1.2.76"},{"id":"jxlcomplete","file":"rapier-jxlcomplete-2dd89bc142f122fd.txt","bytes":783089,"sri":"+nTQy5dSOhmDMxK6wWQNKSZu9WXz8TtX9AbZuhNH8c8uhb3xQUkvuz5aYAWARj+B","release":"1.2.76"},{"id":"jxlmax","file":"rapier-jxlmax-cbc064b4825b9ca5.txt","bytes":658047,"sri":"PJ/teat7doacQ4M7hdWD22KwMu7YJJZsQEfx6gSydnw1tx78NSwEhnubqySeL336","release":"1.2.76"},{"id":"jxlscene","file":"rapier-jxlscene-1ca0fab021a385b9.txt","bytes":5355,"sri":"giAx0sFzlQhQ+TBP+ad04R6FIsDSO5lMF93qor77xTlahMTdTBpuxhRh4s9XEmK2","release":"1.2.76"},{"id":"jxlexample","file":"rapier-jxlexample-4f1027a3a4385b1a.txt","bytes":2685973,"sri":"Xwr/9pIJ+FCYXK0bUJz3HOoAnFY6z+P6sgeFjaRPwBTbGHL32vhL0lAUKHNSXnnD","release":"1.2.76"},{"id":"jxlclip","file":"rapier-jxlclip-189ad8226addf66c.txt","bytes":535587,"sri":"BJ1yIZwTqtHNKtNFMo4KsfhZKgflIye7mIxzoyHW2yYQlVtOyIsLa6+mszZZB9Zy","release":"1.2.76"},{"id":"jxlbig","file":"rapier-jxlbig-b891f05d10d1dd65.txt","bytes":1246376,"sri":"AOccccG1HAJ3Awc8TERtUCkYLUDlmpIDS/UCTja6SpjwJDX12wsk17m5TT14VwiN","release":"1.2.76"},{"id":"diff","file":"rapier-diff-83dbc4b5bfe288c8.txt","bytes":4985,"sri":"p5oSsy8FfBGHkOFLS4d9OouJhdUkbD5DSjAkgjSHqCJ8QZyGUz9iaI9Tjie8En83","release":"1.2.76"},{"id":"mathview","file":"rapier-mathview-f3152457fc55ee3c.txt","bytes":4871,"sri":"tHY92FL7YPpO61iKLDyemfyQLKpubyg2Unsr56SRtHz3D3E7uWcQGhFzICkq8u6L","release":"1.2.76"},{"id":"fonts","file":"rapier-fonts-650600d9673eabc5.txt","bytes":11365,"sri":"W51L3zp0vWbG7T7n6PolyFv2QpNWT73KOJ99O4EykmJz8XYDMu2OfHOqBMU+cvhU","release":"1.2.76"},{"id":"notes","file":"rapier-notes-123bed0f43e7c5dd.txt","bytes":416020,"sri":"swCskeNGwOJ1St5pXBLi7L43bTVvzmktql3P0A5ZPIVaJYOVpi/sb/G/gkwB3nmj","release":"1.2.76"}];
const PART_DIRECTORY = 'parts/';
const SHELL_GENERATION = SHELL_CACHE_PREFIX + SHELL_RELEASE_SHA256.slice(0, 32);
const SHELL_PAGE_URL = new URL('./rapier.html', self.location).href;
const SHELL_ROOT_URL = new URL('./', self.location).href;
const STARTUP_STATE_URL = new URL('./.rapier-startup', self.location).href;
const RETRY_FIRST_MS = 10 * 60 * 1000;
const RETRY_MOST_MS = 24 * 60 * 60 * 1000;

const SHARE_CACHE = `rapier-share:${CACHE_SCOPE}:v1`;
const MAX_SHARED_BYTES = 64 * 1024 * 1024;
const MAX_SHARED_REQUEST_BYTES = MAX_SHARED_BYTES + 1024 * 1024;
const MAX_SHARED_FILENAME_BYTES = 255;
const MAX_PENDING_SHARES = 4;
const MAX_SHARE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SHARE_CLOCK_SKEW_MS = 5 * 60 * 1000;

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
    const predecessors = (await caches.keys()).filter(name =>
      name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_GENERATION);
    await keepParts();
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
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
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

  if (req.method === 'POST' &&
      url.origin === self.location.origin &&
      url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';

  if (isNavigation && isSitePage(url)) {
    event.respondWith(sitePageNavigation(req));
    return;
  }

  if (isNavigation) {
    event.respondWith((async () => {
      const state = await inspectStartup(event).catch(() => null);
      const selected = state?.rollback ? state.previous : null;
      const copy = await cachedNavigationResponse(req, selected).catch(() => null);
      if (copy) return rememberNavigation(event, copy);
      try {
        const response = await fetch(req, {cache: 'no-cache'});
        if (!response.ok || !response.body ||
            !/^text\/html(?:;|$)/i.test((response.headers.get('Content-Type') || '').trim())) return response;
        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.delete('Content-Encoding');
        headers.delete('Content-Length');
        headers.delete('Transfer-Encoding');
        return rememberNavigation(event, new Response(body, {
          status: response.status, statusText: response.statusText, headers,
        }));
      } catch (_) {
        return new Response('Rapier is unavailable offline.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'},
        });
      }
    })());
    return;
  }

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
  const requested = new URL(value);
  const page = new URL(SHELL_PAGE_URL);
  const path = scopePath(requested);
  return requested.origin === page.origin &&
    (requested.pathname === page.pathname || path !== null && Object.hasOwn(SHELL_DOOR_SHA256, path));
}

function scopePath(url) {
  const root = new URL(SHELL_ROOT_URL);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
  return '/' + url.pathname.slice(root.pathname.length).replace(/\/+$/, '');
}

function isSitePage(url) {
  const path = scopePath(url);
  return path !== null && SHELL_SITE_PAGES.includes(path);
}

async function sitePageNavigation(request) {
  const cache = await caches.open(SITE_PAGE_CACHE);
  const key = new URL(request.url);
  key.search = '';
  key.pathname = key.pathname.replace(/\/+$/, '');
  try {
    const response = await fetch(request, {cache: 'no-cache'});
    if (response.ok && !response.redirected && new URL(response.url || request.url).pathname === key.pathname &&
        /^text\/html(?:;|$)/i.test((response.headers.get('Content-Type') || '').trim())) {
      await cache.put(key.href, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const copy = await cache.match(key.href);
    if (copy) return copy;
    return new Response('Rapier is unavailable offline.', {
      status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'},
    });
  }
}

function matchesPage(url, digest) {
  if (!isShellDoor(url)) return false;
  const path = scopePath(new URL(url));
  return digest === SHELL_PAGE_SHA256 || digest === SHELL_DOOR_SHA256[path];
}

const checkedPages = new WeakMap();
async function cachedNavigationResponse(request, release = null) {
  if (!isShellDoor(request.url)) return null;
  const cache = release ? await caches.open(release.cache) : await shellCache();
  const copy = (await cache.match(request)) || await cache.match(SHELL_PAGE_URL);
  if (!copy?.ok || !/^text\/html(?:;|$)/i.test((copy.headers.get('Content-Type') || '').trim())) return null;
  const canonical = new URL(request.url);
  if (canonical.pathname !== new URL(SHELL_ROOT_URL).pathname && canonical.pathname.endsWith('/')) {
    canonical.pathname = canonical.pathname.slice(0, -1);
    return Response.redirect(canonical.href, 308);
  }
  const digest = toHex(await crypto.subtle.digest('SHA-256', await copy.clone().arrayBuffer()));
  if (digest !== (release?.page || SHELL_PAGE_SHA256)) return null;
  checkedPages.set(copy, digest);
  return copy;
}

const PART_FORMAT = 1;
async function keepParts() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('rapier:cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = (mode, act) => new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode), request = act(tx.objectStore('files'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB refused the parts'));
  });
  try {
    const keys = (await run('readonly', store => store.getAllKeys())).map(String);
    const fetched = await Promise.all(SHELL_PARTS.map(async pin => {
      const stem = 'parts/rapier-' + pin.id + '-', used = key => key.startsWith(stem) || pin.id === 'diagramtheme' && key.startsWith('mermaid/');
      if (keys.includes('parts/' + pin.file) || !keys.some(used)) return null;
      let response;
      try { response = await fetch(new Request(new URL(PART_DIRECTORY + pin.file, self.location), {cache: 'reload'})); }
      catch (_) { return null; }
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sri = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))));
      if (bytes.byteLength !== pin.bytes || sri !== pin.sri) throw new Error('invalid part: ' + pin.file);
      const earlier = await Promise.all(keys.filter(key => key.startsWith(stem)).map(async key => [key, (await run('readonly', store => store.get(key)))?.release]));
      return {pin, bytes, earlier};
    }));
    const kept = fetched.filter(Boolean);
    if (kept.length) await run('readwrite', store => {
      let last;
      for (const {pin, bytes, earlier} of kept) {
        for (const [key, release] of earlier) if (!release || release.localeCompare(pin.release, undefined, {numeric: true}) < 0) store.delete(key);
        last = store.put({bytes, savedAt: Date.now(), format: PART_FORMAT, sri: pin.sri, size: pin.bytes, release: pin.release}, 'parts/' + pin.file);
      }
      return last;
    });
  } finally { db.close(); }
}

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
  if (!state.previous) return;
  state.rollback = true;
  state.failed = Math.min((Number(state.failed) || 0) + 1, 16);
  state.retryAt = Date.now() + Math.min(RETRY_MOST_MS, RETRY_FIRST_MS * 2 ** (state.failed - 1));
}

async function inspectStartup(event) {
  const result = await updateStartup(async state => {
    let changed = false;
    if (state.rollback && !state.ready && !(Date.now() < state.retryAt)) {
      state.rollback = false;
      state.failures = [];
      state.clients = {};
      changed = true;
    }
    const entries = Object.entries(state.clients);
    if (!state.ready && entries.length) {
      const ready = new Set((await self.clients.matchAll({type: 'window', includeUncontrolled: true})).map(client => client.id));
      for (const [id, client] of entries) {
        if (id === event.replacesClientId || client.attempt && !ready.has(id)) {
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
    const page = checkedPages.get(response) || toHex(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()));
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

function shellCache() {
  return shellCachePromise || (shellCachePromise = caches.open(SHELL_GENERATION));
}

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

const SHARED_AUTOLINK = /^[A-Za-z][A-Za-z0-9+.\-]{1,31}:[^\u0000-\u0020<>\u007f]*$/;
function sharedHeadingText(value) {
  return String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>&!|~$#]/g, '\\$&');
}
function sharedLinkMarkdown(value) {
  let href = '';
  try {
    const url = new URL(String(value).trim());
    if (/^(?:https?|mailto):$/.test(url.protocol)) href = url.href;
  } catch (_) {}
  return SHARED_AUTOLINK.test(href) ? '<' + href + '>'
    : String(value).replace(/\s+/g, ' ').trim().replace(/[!-/:-@[-`{-~]/g, '\\$&');
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
    const declaredLength = Number(request.headers.get('Content-Length'));
    const contentType = String(request.headers.get('Content-Type') || '');
    let response;

    if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARED_REQUEST_BYTES) {
      response = shareErrorResponse('too-large');
    } else if (!/^multipart\/form-data(?:;|$)/i.test(contentType.trim())) {
      response = shareErrorResponse('unreadable');
    } else {
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
          if (title) parts.push('# ' + sharedHeadingText(title), '');
          if (text) parts.push(text, '');
          if (sharedUrl) parts.push(sharedLinkMarkdown(sharedUrl));
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
    try {
      if (cache) await storeShare(cache, cacheKey, shareErrorResponse('unreadable'));
    } catch (storeError) {
      console.warn('[rapier] share-target error payload could not be stored', storeError);
    }
  }
  return Response.redirect(shareRedirect(token), 303);
}
