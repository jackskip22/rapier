
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = '1e12d317b5ab34db7d9ad0d84b0bf39e8fda0b535826797e1c41fe1553a63088';
const SHELL_PAGE_SHA256 = 'c9dd2141aa5eaccf60b3c916fac9fdff7109425fa0c8f5754b37493ac08f7f66';
const SHELL_BOOT_ID = '7a5c07c3dd198bb270afbb258213f63f297dd8ecc223defcafdd57034a2720a3';
const SHELL_DOOR_SHA256 = {"/":"44bef21ddc1eb886fbc13f900bec71a1088ce588f653d43fb1e67c11c41632fc","/privacy":"8a3d58e0db56e6a3bed4d4a75204ba72555ae177e820e3662e088d78eceb8e34","/commercial":"4e328b560f8f3473d81d4ec20e4e3eaf20a809561d62205c8fb605df3b2af549","/notes":"1d8374d8c675fd490dcdb54a4acad2b51272dc8b005e08dc6ad46d14cfc2d2fd","/draw":"8bfc3fb8f45f278ec5f0e49b873ea22984d7c85558d9b8be8ae8f717c65d3a47","/watercolor":"317826600aeb5ca1ab7821f3cca405ff30a10f8def3f8f10581704c98a445a11","/paint":"f944c38762a6a7b19e75a38d96fc2b64af87854f97cd0eede2349b3836a9ad4d","/jxl":"9004b54e73e7a81d0c62205971544f509852d551895acd89ac1e264afe3df340","/diff":"07bb762f7ae821aa526b2675eda562195be34d5cd1aa8e453782bf85cd6942f5","/convert":"ba0d72d88a10b77331fdcece49ca37143a326dee836e6f8b8f3d1960027d47a9","/math":"d841cbb63c5fd15d06b1d1749ec9766695b715931d7f5e6671ea9392e696a0ee","/markdown-to-pdf":"888e51176ea8745fb8f11314c30f6737e62d43b411b568b3de5937432036d59b","/markdown-to-word":"c3fff9c01ff1325a752100661004b620d4e4e75eeb7b3385252a2c1c8ef370db","/word-to-markdown":"012b95588c9bfb5239eac43792eb4131cac8e119ad9d15ece8a220c0b1450c2e","/pdf-to-markdown":"657117f9b0a3fbf6f1522ce4304183d3a3f39cc96df5c71e7960f57be334316c","/diagrams":"3d201b1563e179a4afba2e69e492c7aa37bdd6d265690744b293d8fd00d6b7ab"};
const SHELL_SITE_PAGES = ["/gallery"];
const SITE_PAGE_CACHE = `rapier-pages:${CACHE_SCOPE}:v1`;
const SHELL_PARTS = [{"id":"document","file":"rapier-document-dcaadcb7cb0274ee.txt","bytes":902482,"sri":"2SDElAOJs9eaRgdiv97MQi9v3MopswQ29jOgiDtMK+6RsyS+nmDqXq70R1UYhD6Z","release":"1.2.69"},{"id":"presets","file":"rapier-presets-acfd0b7a1961208b.txt","bytes":252369,"sri":"hEcJt+eKOEUhunxqAzcn8NWWD0y8tOAM/l9o8fbwXDiyLItGC8eaSYCEcIfgK2iN","release":"1.2.69"},{"id":"drawing","file":"rapier-drawing-08fa367526321ce4.txt","bytes":814168,"sri":"5Yjo42+iDmcksP6psa+GmATIE2nrT09RKpme44vLhjJXTTInEcXbH3BxB7Qxbr4y","release":"1.2.69"},{"id":"jxl","file":"rapier-jxl-b945cde305190bad.txt","bytes":34780,"sri":"oFoLwMuLaOTi1A8OFnz+fpzUOtE3Ls2+OVcFr666lFW9VapbQqqGJAB4zD5LwRm4","release":"1.2.69"},{"id":"convert","file":"rapier-convert-c9dd4531954c0162.txt","bytes":5800,"sri":"g6fxpirM/nvEV5GozQPmgET7QFEjXxrFBL8lx2TBIfSP6Ee/JzGnelSNKREVZ3ih","release":"1.2.69"},{"id":"diagrams","file":"rapier-diagrams-3ac916262fdfe4e6.txt","bytes":5999,"sri":"a1v5PmFCcCxwxrDfCbv2QLyWN/JhOEljcM7bsxHqf+9xjOohYNYjk0zH8ItlWeys","release":"1.2.69"},{"id":"diagramtheme","file":"rapier-diagramtheme-31e471e2bc1f912d.txt","bytes":7205,"sri":"LCOm4MUWvX55nA48Kyt6Umu+IK9OZdO3BO1khhZZcT9+fGuvd/FkInyQlcrzw6lA","release":"1.2.69"},{"id":"jxlcomplete","file":"rapier-jxlcomplete-9842addbabcd8eb1.txt","bytes":524891,"sri":"UdQ+AMOaF8F1H3GwFB97HuVx7QrseOuRY41mH3vWdcCE11Yvqz4t/J7Uc5u99vCa","release":"1.2.69"},{"id":"jxlscene","file":"rapier-jxlscene-94f90ec32b4d5ace.txt","bytes":5355,"sri":"8tC+7ulvLEP7kkry4FM0LqlzDys4C2BLnknPSadoNHA9nkl4SnGgE6KKo9CE5l8f","release":"1.2.69"},{"id":"jxlexample","file":"rapier-jxlexample-4f1027a3a4385b1a.txt","bytes":2685973,"sri":"Xwr/9pIJ+FCYXK0bUJz3HOoAnFY6z+P6sgeFjaRPwBTbGHL32vhL0lAUKHNSXnnD","release":"1.2.69"},{"id":"diff","file":"rapier-diff-f51bb374bf03bb57.txt","bytes":4985,"sri":"fXyeOMSkZYe20dXYeC1J309sQajnu/cOi/ZMd3wf4ikCVWgryUvM4AfsDdqSJdGI","release":"1.2.69"},{"id":"mathview","file":"rapier-mathview-c2929447f9372272.txt","bytes":4871,"sri":"/0kFLjfBqJI15dczSo9tnvB1gtzoIMtP0GMup/ZyuRvXKK7qDdxhh14LSRs6PwKj","release":"1.2.69"},{"id":"fonts","file":"rapier-fonts-49f10dd17c91c7c4.txt","bytes":11393,"sri":"fyt6fUEceRqSV7etpVpDOTJM8jPkL6zrPsqmUjSWDwZDk0SGVeB36/y3ZatiGJJu","release":"1.2.69"},{"id":"notes","file":"rapier-notes-6ec5b191a56aa70c.txt","bytes":414900,"sri":"LN31z5LlGauC8FaKcGNhKfqGG0ABRv2y2aHs4uG0nlnoWS8s1XCwr6XqB2Wo5oma","release":"1.2.69"}];
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
