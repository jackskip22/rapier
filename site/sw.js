
const CACHE_SCOPE = self.registration.scope || new URL('./', self.location).href;
const SHELL_CACHE_PREFIX = `rapier-shell:${CACHE_SCOPE}:`;
const SHELL_URLS = [
  './rapier.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
const SHELL_RELEASE_SHA256 = 'bc19377a4778c0e562edd12b383c559cc9137ef7400084978c904a843eface83';
const SHELL_PAGE_SHA256 = '1a69495f0ebf967a06a625dabe9513e58df54a962ac581b202a7a09b710cf05a';
const SHELL_BOOT_ID = 'e6f858479c99416f729b75b4628a0848f14cc6b71fdeb346a8c245493f53edcc';
const SHELL_DOOR_SHA256 = {"/":"e9011af855434cd00a4a33c7ede65e3ae09d9a60930d443ea383046a598fc331","/privacy":"a8233536ae936911fa201c18f9b4060d5619fa0e6cd9450d98001a700401985b","/commercial":"ffe2fae746af15370d0a019db729b96602c1bd9861579c9d9d5e682c82c76cee","/notes":"11f3035f1357886bd2cec365fe7d8dd1ad01938c75a0cc244ecb20a6c6063021","/draw":"c680fa0c966fd30f692d440eb0374ddbe737fab3d60435b1195023c4c08d8d55","/watercolor":"d43ec7a0b5617bd06b1a4f3dd5a890b89a394e967817b218db19726b0ab9373d","/paint":"645986e44767dc154810298a2d3d9d5828ae399058218bffd96f67e090bf08a8","/jxl":"42342068d2fce35f39a1272cec6100cfe8b6e5857d9c282b6c93341376e92eb4","/diff":"b464f9efa74bea0790a4756d0b35e8f55b567cd6d6eae7dc55f94336b9d208e9","/convert":"496e81ec35d2db282d16716104c000f14cb8a5b311305b0e5d1f68963de5a993","/math":"f8e78280b81bd746767a05efca9708d3d0138028b156808ee02de5a1b70e8f5a","/markdown-to-pdf":"e202a690bf982e8533618404b0e2f4d9ee3f33ead2048d2d8be149d7fb2a4ec8","/markdown-to-word":"cbc39139ab83cdd31d18f0cb4767c5a7e359e89f381508fd70754b7ef2f5c822","/word-to-markdown":"ef9c26efe89fb1b51340e09a8b1076c267517cc936f37c3ee1391f10913c5673","/pdf-to-markdown":"71df0a3c1dd692feeaab02ce6352477141b5c882ce8e42a964d1ee123746d4f3","/diagrams":"63ead0481197623e9a149b13453a7c7ec200fa587c5fc4fc55cdea1a4dd1f55d"};
const SHELL_SITE_PAGES = ["/gallery"];
const SITE_PAGE_CACHE = `rapier-pages:${CACHE_SCOPE}:v1`;
const SHELL_PARTS = [{"id":"document","file":"rapier-document-e869b58683a468af.txt","bytes":903350,"sri":"XAC4YLPUXCNbgMclbSnsA2VBWn2FWpxSnaYRQXBMC+dKxa1ZQbAd8auLwUDZeomE","release":"1.2.71"},{"id":"presets","file":"rapier-presets-3a684190e21e1028.txt","bytes":252243,"sri":"Cy4Kg/BOXfz3EUKpJltzXBqmlTaXB7ZCFb659cVnwvamyrYbOnLoz/+5001Ippyw","release":"1.2.71"},{"id":"drawing","file":"rapier-drawing-8d9c0d4c6ca3fc86.txt","bytes":814476,"sri":"qGtcx42Yn6jtYFL8Sq6DYd4C+0QVs3fb5E9mn9Dh6WFtuAaHdtM245tPISNHWBL3","release":"1.2.71"},{"id":"jxl","file":"rapier-jxl-7ce38eefc2b220e4.txt","bytes":34969,"sri":"YVhMHPd17DvwnyQ9wmo2QBHG/sJDAyXtv9nkLYObiHoeL89G76iaq6p8bLul4uE8","release":"1.2.71"},{"id":"convert","file":"rapier-convert-9a027d2a48833f2b.txt","bytes":5786,"sri":"7T58xiJtS1BMQmb6vFQZLOBWWdgmk2/WV9bal3xkIxFGGD815Hr+CWnTxSFVW8xo","release":"1.2.71"},{"id":"diagrams","file":"rapier-diagrams-c90748b3cc888034.txt","bytes":6020,"sri":"81nhCqgLMXm2npMPBXYePtaeDrRlNdCvtcHA9tF2G1PoHinTqUzyisehgsN55JZX","release":"1.2.71"},{"id":"diagramtheme","file":"rapier-diagramtheme-31e471e2bc1f912d.txt","bytes":7205,"sri":"LCOm4MUWvX55nA48Kyt6Umu+IK9OZdO3BO1khhZZcT9+fGuvd/FkInyQlcrzw6lA","release":"1.2.71"},{"id":"jxlcomplete","file":"rapier-jxlcomplete-c4a9dd7afdc24029.txt","bytes":524765,"sri":"2vc/20EsuYh3m+6XA1kek7fa/AEfalrjUq9zlpYpZWj3IuytEbA/BnBBYblTpOiF","release":"1.2.71"},{"id":"jxlscene","file":"rapier-jxlscene-f58b441037f95522.txt","bytes":5355,"sri":"AJ0w4rR58DMUkM6j6XH5dpaJzZwa49T9NtNORxIVy1xeqrwp6JvAAQLPSq0qcS+r","release":"1.2.71"},{"id":"jxlexample","file":"rapier-jxlexample-4f1027a3a4385b1a.txt","bytes":2685973,"sri":"Xwr/9pIJ+FCYXK0bUJz3HOoAnFY6z+P6sgeFjaRPwBTbGHL32vhL0lAUKHNSXnnD","release":"1.2.71"},{"id":"jxlclip","file":"rapier-jxlclip-189ad8226addf66c.txt","bytes":535587,"sri":"BJ1yIZwTqtHNKtNFMo4KsfhZKgflIye7mIxzoyHW2yYQlVtOyIsLa6+mszZZB9Zy","release":"1.2.71"},{"id":"diff","file":"rapier-diff-677b2f6ef83ccb16.txt","bytes":4985,"sri":"p3mFCL/usHZYZIopt1SY68IDqyAJsVDLPUseXvZJTEGBNGNdziM4P+U18XfueXEz","release":"1.2.71"},{"id":"mathview","file":"rapier-mathview-ea0411716eab04d9.txt","bytes":4871,"sri":"PjJWy8RQgBCp9ztxiG7G6f6438e2CoqwE1qrlUVhTo790DD31/fEoYJHGDbEG2pr","release":"1.2.71"},{"id":"fonts","file":"rapier-fonts-00099606ff3f4581.txt","bytes":11372,"sri":"Jt/P3eeFJPsRgjTrQHuIXAtEEXMNMmsoJfl6EWlowBavfEqkhwyg9HRhKeq1AzBJ","release":"1.2.71"},{"id":"notes","file":"rapier-notes-7448b8c31ee67222.txt","bytes":415698,"sri":"hlH9WTFMlQYjKazP7qz3GTJrmW4TdD6YDf08Sk3mLVvPvT956srJaAXaYZZhshpe","release":"1.2.71"}];
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
