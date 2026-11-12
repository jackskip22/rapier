
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = '64a98b7dd0900833431b2988226542c53af06d215459996390b7da83fecb102a';
const SHELL_PAGE_SHA256 = 'c5723cae3f24c68a2b82774d13f522da9d14ab82c9e42ac6d8866eaa497dc6eb';
const SHELL_BOOT_ID = '092e3244d8f630ea34670505ed1ef1dd852494dc0698149aac646933c07bbcdb';
const SHELL_DOOR_SHA256 = {"/":"23f3220336ca01f42cf0f3f9b14d53f25c2f11faa94316c43341b094e37c2f5c","/privacy":"5d480a67c79b5168a8a5fa95e4563d3620645c54879e58f6cfb7cd4ec51d19df","/commercial":"72d3af87eadac73b15929963ed0d5db15fffc1a84d951b372808893867fe2711","/notes":"85a1dec75abe6f8bc3d02b9322acf7110d32eeea533f204fb24372d5050c0c40","/draw":"2f0b979998793eac73b8b7de17d45fdef6c5b05e332c8c77855466cf5db7b7c0","/watercolor":"e005340a6772c590d3194a7d83a74a7f119b25303d5c76314abf2c79dd2e001f","/paint":"0bfbd15467467b0cc43e02da7f0739cb67e477a0826f78216d7543f0879ead25","/jxl":"4c8493fff68472fc509e476b26ac823ea2623ed31e6f042af4d3bf7fd661c268","/diff":"75668362ae477d6bcf60051c4c357e67c86494b7faef67c0a12797044e715c9d","/convert":"4e4600cf344b04f5063128853c0c06c0a34f9150c3a06e15ad2d8a0d4d66dee8","/math":"ba7859c0934c04e68b79826e6c6ed2e4fc5aac5857c1dbf51c65689ca3b2fa8a","/markdown-to-pdf":"2a78db007a8cc520cfc8dc24f181fb923a551f727bd56cd0dc47deecc31fb1dd","/markdown-to-word":"f0f5d74b072a73118f5b036c196180684895139a1b6d15fbef11b3aed3fbe339","/word-to-markdown":"22d55506ac68ad83cf29ade0682fe268a8c153ef1bd98e068dc3cb3a97275fde","/pdf-to-markdown":"ed5bb57c8d1390a2c1e9a418749d60bfa3fac5e43e5764c25f43ac9c26b41663","/diagrams":"a98a883ce73a6419254279954e3ad8e76c862221023b82dc956eabbe4a9820b9"};
const SHELL_SITE_PAGES = ["/gallery"];
const SITE_PAGE_CACHE = `rapier-pages:${CACHE_SCOPE}:v1`;
const SHELL_PARTS = [{"id":"document","file":"rapier-document-a9f09ec11bd73f68.txt","bytes":902321,"sri":"SKNGVoA/TNO44nMH+C+Ir9ypocWp0pbtDHmyfl2ljM/mSm+XvS/VOwMy+TsZZVfZ","release":"1.2.64"},{"id":"presets","file":"rapier-presets-a4d6f30fadf10a56.txt","bytes":252334,"sri":"9JPkJ301FCe27j8vy47Sjwc0k/QvsduOLcAvU+zRnd7NOuQCdj/xP05V/dRrO/Ck","release":"1.2.64"},{"id":"drawing","file":"rapier-drawing-14c3f330ab3de536.txt","bytes":810269,"sri":"Y5pd+w+KiwHr7IcdmY6EC31BNfU2iG4GXV9LVRyDWuLe5WDQ4dMNgkftKZBZd/u/","release":"1.2.64"},{"id":"jxl","file":"rapier-jxl-24ac485af151746f.txt","bytes":34801,"sri":"GKL5t97HHm7Dpw3W8v4hWpsWH/Plkd178/M8gk2E8raR74SM9MaPDECzaWFw9j8X","release":"1.2.64"},{"id":"convert","file":"rapier-convert-5a8769354bfe7899.txt","bytes":5786,"sri":"MTbRPbA/xVnVYoyd/naYcZcmqQbCyeRdlVSbVvb13Dm2Mxdh0Z/JAx7Hn/kC5Or5","release":"1.2.64"},{"id":"diagrams","file":"rapier-diagrams-72dc336229dce614.txt","bytes":6006,"sri":"PzSg55BrPa5FGGUViFA44fVX5yeGuDW+YhwN+jCBhpMcs0yJZ+BwHh9GBQMLnR5R","release":"1.2.64"},{"id":"diagramtheme","file":"rapier-diagramtheme-31e471e2bc1f912d.txt","bytes":7205,"sri":"LCOm4MUWvX55nA48Kyt6Umu+IK9OZdO3BO1khhZZcT9+fGuvd/FkInyQlcrzw6lA","release":"1.2.64"},{"id":"jxlcomplete","file":"rapier-jxlcomplete-5be4e36f521398c7.txt","bytes":524821,"sri":"gBfVTAfErFMcfXprC9XkBxYZK+ZLA9Msp2noC166r6EvBDxz6P3+S3cQR3blflTL","release":"1.2.64"},{"id":"jxlscene","file":"rapier-jxlscene-5ab81983053d01a4.txt","bytes":5355,"sri":"0I9n5RONTZ289T2y4c1AQwp1ip+8bDOW3pR0YcKLsztaJfjo0LjejOI2spjw75xs","release":"1.2.64"},{"id":"jxlexample","file":"rapier-jxlexample-4f1027a3a4385b1a.txt","bytes":2685973,"sri":"Xwr/9pIJ+FCYXK0bUJz3HOoAnFY6z+P6sgeFjaRPwBTbGHL32vhL0lAUKHNSXnnD","release":"1.2.64"},{"id":"diff","file":"rapier-diff-c49e2ca9b6578c04.txt","bytes":4985,"sri":"ywkofDxgOTbEErBJ1A81VaEm8Z6DeduJQ1qYyOAW2pJc0d3by+rjuCln63E5FztC","release":"1.2.64"},{"id":"mathview","file":"rapier-mathview-0947ce04526723f3.txt","bytes":4864,"sri":"gb4GYe53vgnCYq1l43OKrOAnZElbSG0JcmBx+UCQCpHRa2okodPbU04JgMkeUTqJ","release":"1.2.64"},{"id":"fonts","file":"rapier-fonts-8b5aff7832faa429.txt","bytes":11365,"sri":"nA7L/DDZWT2xyCpiYyizhVlb4FHSFlRZKGVWP0J6A/++RM66hooVt+qFJzKC+NDV","release":"1.2.64"},{"id":"notes","file":"rapier-notes-73aea3e73403e649.txt","bytes":414851,"sri":"HSwfbgL10qeyzsW/pukYUlhGxvaw9ATNBbId0RXz7sdj6bcg/vCpIbjkyoKM3URm","release":"1.2.64"}];
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
