
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = 'f1f2e7ec240c9cc8799b50f86ef63004ef1c319e7036c784139a8a5422f0cbd0';
const SHELL_PAGE_SHA256 = 'adfafd156ef122c368a1780df7945edd0571e60f95b57b648f2a02b9c012dcf3';
const SHELL_BOOT_ID = '3f6926d7152a6fd4bb7ac9e829f7c2556a048aa760dd94e993cb268dadd85680';
const SHELL_DOOR_SHA256 = {"/":"a32d5d874d67c8736d01b3a2e0db5ce425e4bd80d43bd190540d2d3785f339eb","/privacy":"b0a1704592800eceab95c51af5e2b645e83d03a929a1cbcbc4393b6ecedbf66f","/commercial":"533761ef921562fd67441691d16ec5f093bc2174468960e582d5bbbec31fab6f","/notes":"34afd87a4524a5c94490f03c1e729af2d54b3c4eb479e838784dc8c2fe1ac383","/draw":"7b39a6ed637711df59d9917588fbcbfedf9b7215d81a436bcd0b6d2cb7609e18","/watercolor":"24cc106fb6e769919357648c9c0a8e6c973ff7d1189de5565796561447265409","/paint":"3035aaf2ac00a5ca1695242902f2b51a978cbd7fd489f5534706863e72329899","/jxl":"4edf850dfe732768d754c9f74513236a0d4098bd2fdfe1e21b1f9cc5017a7883","/diff":"4329f4c9ce32dde0dd3faa5b7603f92c54028b96abeb8506740c2130ead12d87","/convert":"0dc9c898f78cf76943854c91f70a6843346f2d1192adce669967059789145c40","/math":"c073f3249398c8be7ea2ae91743010cb6e55e9e1c5f69738acc3f010b4f1b040","/markdown-to-pdf":"31ee4d5288ce811bdd92500c49be95eee072dff822dcac7ebd7cb643c3c4f6c8","/markdown-to-word":"ad86d96bee9640f536d4d7c3353df8e39fa0f35b733eccbc124c042d3e98e659","/word-to-markdown":"6f773d4a37d91957a5ec7d01ce241c754caf901c8de7273ababbbcabc10a1182","/pdf-to-markdown":"50562856125c8732c02c542e8f99b5c24cc8b17dcc602b362848743368e6a0a9","/diagrams":"12a54e9ae1ae65d0b4e506cdcb0d15a48f28f5ae32ae1ddb82bd75b1f603254c"};
const SHELL_SITE_PAGES = ["/gallery"];
const SITE_PAGE_CACHE = `rapier-pages:${CACHE_SCOPE}:v1`;
const SHELL_PARTS = [{"id":"document","file":"rapier-document-a9f09ec11bd73f68.txt","bytes":902321,"sri":"SKNGVoA/TNO44nMH+C+Ir9ypocWp0pbtDHmyfl2ljM/mSm+XvS/VOwMy+TsZZVfZ","release":"1.2.63"},{"id":"presets","file":"rapier-presets-056511ff1db8bb13.txt","bytes":252331,"sri":"cgTF22V3AEyYPFAhAYTDSffSDZ+PjgzCXRnbT/Lua48Q4nRYxdp5Srx+f+USjxAc","release":"1.2.63"},{"id":"drawing","file":"rapier-drawing-75e48bc0c17cd8a4.txt","bytes":810031,"sri":"KaZqh845zEA5/pcSLVJ/O3kBkoOwKeTcO2C9QKe5cnWTe1eZVDG7f5kM01srN+GC","release":"1.2.63"},{"id":"jxl","file":"rapier-jxl-24ac485af151746f.txt","bytes":34801,"sri":"GKL5t97HHm7Dpw3W8v4hWpsWH/Plkd178/M8gk2E8raR74SM9MaPDECzaWFw9j8X","release":"1.2.63"},{"id":"convert","file":"rapier-convert-5a8769354bfe7899.txt","bytes":5786,"sri":"MTbRPbA/xVnVYoyd/naYcZcmqQbCyeRdlVSbVvb13Dm2Mxdh0Z/JAx7Hn/kC5Or5","release":"1.2.63"},{"id":"diagrams","file":"rapier-diagrams-72dc336229dce614.txt","bytes":6006,"sri":"PzSg55BrPa5FGGUViFA44fVX5yeGuDW+YhwN+jCBhpMcs0yJZ+BwHh9GBQMLnR5R","release":"1.2.63"},{"id":"diagramtheme","file":"rapier-diagramtheme-31e471e2bc1f912d.txt","bytes":7205,"sri":"LCOm4MUWvX55nA48Kyt6Umu+IK9OZdO3BO1khhZZcT9+fGuvd/FkInyQlcrzw6lA","release":"1.2.63"},{"id":"jxlcomplete","file":"rapier-jxlcomplete-5be4e36f521398c7.txt","bytes":524821,"sri":"gBfVTAfErFMcfXprC9XkBxYZK+ZLA9Msp2noC166r6EvBDxz6P3+S3cQR3blflTL","release":"1.2.63"},{"id":"jxlscene","file":"rapier-jxlscene-5ab81983053d01a4.txt","bytes":5355,"sri":"0I9n5RONTZ289T2y4c1AQwp1ip+8bDOW3pR0YcKLsztaJfjo0LjejOI2spjw75xs","release":"1.2.63"},{"id":"jxlexample","file":"rapier-jxlexample-4f1027a3a4385b1a.txt","bytes":2685973,"sri":"Xwr/9pIJ+FCYXK0bUJz3HOoAnFY6z+P6sgeFjaRPwBTbGHL32vhL0lAUKHNSXnnD","release":"1.2.63"},{"id":"diff","file":"rapier-diff-c49e2ca9b6578c04.txt","bytes":4985,"sri":"ywkofDxgOTbEErBJ1A81VaEm8Z6DeduJQ1qYyOAW2pJc0d3by+rjuCln63E5FztC","release":"1.2.63"},{"id":"mathview","file":"rapier-mathview-0947ce04526723f3.txt","bytes":4864,"sri":"gb4GYe53vgnCYq1l43OKrOAnZElbSG0JcmBx+UCQCpHRa2okodPbU04JgMkeUTqJ","release":"1.2.63"},{"id":"fonts","file":"rapier-fonts-8b5aff7832faa429.txt","bytes":11365,"sri":"nA7L/DDZWT2xyCpiYyizhVlb4FHSFlRZKGVWP0J6A/++RM66hooVt+qFJzKC+NDV","release":"1.2.63"},{"id":"notes","file":"rapier-notes-a33e1c0f3a4ce651.txt","bytes":414900,"sri":"tpJDlc7Kbrx+wVmGQDzmI0OJWzefvPxrNdxY38TIltys5NsZs67r0UzF4TyFlbvL","release":"1.2.63"}];
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
