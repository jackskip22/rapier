// SPDX-License-Identifier: MIT
const {FEATURES, LIMITS, ASSET_TYPES, refusal, coded, normalizeSettings, snapshotSettings, pickDeviceFile, createFilePicker, assetURL, assetBytes, bytesHash, externalImage, createAssetBroker, pictureBase} = (() => {
const FEATURES = Object.freeze(['draw', 'paint', 'notes', 'readAloud', 'share', 'find']);
const LIMITS = Object.freeze({documentBytes: 64 * 1024 * 1024, pictureBytes: 16 * 1024 * 1024});
const ASSET_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/jxl', 'image/svg+xml']);
const ACCENTS = Object.freeze(['Teal', 'Blue', 'Amber', 'Green', 'Red', 'Purple', 'Pink', 'Gray']);
const refusal = (code, reason = code) => Object.assign(new Error(reason), {code});
const coded = (code, Type, message) => Object.assign(new Type(message), {code});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
const only = (value, keys) => Object.keys(value).every(key => keys.includes(key));

function normalizeSettings(value = {}, {features = FEATURES, accents = ACCENTS, languages = ['en'], limits = LIMITS} = {}) {
  if (!record(value)) throw refusal('settings_invalid');
  if (!only(value, ['features', 'language', 'limits', 'palette'])) throw refusal('settings_unknown');
  let selected = features;
  if (value.features !== undefined) {
    if (!Array.isArray(value.features) || value.features.length > FEATURES.length ||
        new Set(value.features).size !== value.features.length) throw refusal('settings_features_invalid');
    if (value.features.some(name => !FEATURES.includes(name))) throw refusal('settings_feature_unknown');
    selected = features.filter(name => value.features.includes(name));
  }
  let language = languages[0];
  if (value.language !== undefined) {
    if (typeof value.language !== 'string' || !value.language || value.language.length > 63) throw refusal('settings_language_invalid');
    let canonical;
    try { canonical = Intl.getCanonicalLocales(value.language)[0]; }
    catch (_) { throw refusal('settings_language_invalid'); }
    language = languages.find(tag => tag.toLowerCase() === canonical.toLowerCase()) || languages[0];
  }
  const acceptedLimits = {...limits};
  if (value.limits !== undefined) {
    if (!record(value.limits) || !only(value.limits, Object.keys(LIMITS))) throw refusal('settings_limits_invalid');
    for (const [key, bytes] of Object.entries(value.limits)) {
      if (!Number.isSafeInteger(bytes) || bytes < 1) throw refusal('settings_limits_invalid');
      acceptedLimits[key] = Math.min(bytes, limits[key]);
    }
  }
  let palette;
  if (value.palette !== undefined) {
    if (!record(value.palette) || !only(value.palette, ['accent']) || !accents.includes(value.palette.accent))
      throw refusal('settings_palette_invalid');
    palette = Object.freeze({accent: value.palette.accent});
  }
  return Object.freeze({features: Object.freeze([...selected]), language, limits: Object.freeze(acceptedLimits),
    ...(palette ? {palette} : {})});
}

function snapshotSettings(value) {
  if (value === undefined) return undefined;
  const accepted = normalizeSettings(value);
  return Object.freeze(Object.fromEntries(Object.keys(value).map(key => [key, accepted[key]])));
}

function pickDeviceFile(document, signal) {
  if (signal?.aborted) return Promise.resolve(null);
  const input = document.createElement('input');
  input.type = 'file'; input.hidden = true;
  let resolve, settled = false;
  const result = new Promise(yes => { resolve = yes; });
  const finish = file => {
    if (settled) return;
    settled = true;
    input.removeEventListener('change', changed); input.removeEventListener('cancel', cancelled);
    signal?.removeEventListener('abort', cancelled);
    input.remove(); resolve(file);
  };
  const changed = () => finish(input.files?.[0] || null), cancelled = () => finish(null);
  input.addEventListener('change', changed); input.addEventListener('cancel', cancelled);
  signal?.addEventListener('abort', cancelled, {once: true});
  try {
    (document.body || document.documentElement).append(input);
    if (signal?.aborted) finish(null);
    else if (typeof input.showPicker === 'function') input.showPicker();
    else {
      if (document.defaultView?.navigator?.userActivation?.isActive === false)
        throw refusal('open_unavailable', 'Tap Open to choose a file.');
      input.click();
    }
  } catch (error) { finish(null); throw error; }
  return result;
}

function createFilePicker({document, refusal: reason, snapshot, current: unchanged, settle, post, open, notify, error}) {
  return {
    pending: null,
    refusal: reason,
    current(row) {
      return !!row && this.pending === row && !row.controller.signal.aborted && !reason() && unchanged(row);
    },
    check() {
      const row = this.pending;
      if (row && !row.committing && !this.current(row)) this.cancel('open_stale');
    },
    cancel(code = 'open_cancelled', tellHost = true) {
      const row = this.pending;
      if (!row) return;
      this.pending = null;
      clearTimeout(row.timer);
      row.started(false);
      row.controller.abort();
      const state = snapshot();
      if (tellHost && row.host && row.port === state.port && row.portGeneration === state.portGeneration)
        post('open-cancel', {}, row.requestId, row.baseRevision);
      if (code !== 'open_cancelled' && code !== 'open_finished') notify(code);
    },
    begin(event) {
      this.check();
      const code = reason();
      if (!event?.isTrusted || code || this.pending || !settle()) {
        if (code) notify(code);
        return false;
      }
      let started;
      const ready = new Promise(resolve => { started = resolve; });
      const row = {...snapshot(), requestId: crypto.randomUUID(), controller: new AbortController(), started, host: false};
      this.pending = row;
      try {
        const selected = pickDeviceFile(document, row.controller.signal);
        selected.then(file => this.selected(file, row)).catch(() => { if (this.pending === row) this.cancel('open_failed'); });
        started(true);
      } catch (_) {
        row.host = true;
        row.timer = setTimeout(() => { if (this.pending === row) this.cancel('open_timeout'); }, 15000);
        if (!post('open-request', {}, row.requestId, row.baseRevision)) this.cancel('open_disconnected');
      }
      return ready;
    },
    answer(data) {
      const row = this.pending, payload = data.payload || {};
      if (!row || !row.host || data.requestId !== row.requestId || data.baseRevision !== row.baseRevision) return 'open_unmatched';
      if (!this.current(row)) { this.cancel('open_stale'); return 'open_stale'; }
      const fields = data.type === 'open-result' ? ['file'] : data.type === 'open-nack' ? ['code', 'reason'] : [];
      const valid = Object.keys(payload).every(key => fields.includes(key)) &&
        (data.type !== 'open-result' || payload.file === null || payload.file instanceof document.defaultView.File) &&
        (data.type !== 'open-nack' || typeof payload.code === 'string' && payload.code.length > 0 && payload.code.length <= 64 &&
          typeof payload.reason === 'string' && payload.reason.length <= 500);
      if (!valid) { this.cancel('open_reply_invalid'); return 'open_reply_invalid'; }
      clearTimeout(row.timer);
      if (data.type === 'open-nack') { this.cancel(payload.code, false); return ''; }
      row.started(true);
      if (data.type === 'open-result') void this.selected(payload.file, row);
      return '';
    },
    async selected(file, row) {
      if (this.pending !== row || row.reading) return;
      if (!file) { this.cancel(); return; }
      if (!this.current(row)) { this.cancel('open_stale'); return; }
      row.reading = true;
      try { await open(file, row); }
      catch (failure) { error(failure); }
      finally { if (this.pending === row) this.cancel('open_finished', false); }
    },
  };
}

function assetURL(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\s\u0000-\u001f\u007f<>\\]/u.test(value))
    throw refusal('asset_url_invalid');
  let url;
  try { url = new URL(value); } catch (_) { throw refusal('asset_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4096) throw refusal('asset_url_invalid');
  return url.href;
}

function pictureCeiling(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw refusal('asset_bytes_invalid');
  return Math.min(limit, LIMITS.pictureBytes);
}
function assetBytes(value, limit = LIMITS.pictureBytes) {
  if (!(value instanceof Uint8Array) || !value.byteLength) throw refusal('asset_bytes_invalid');
  if (value.byteLength > pictureCeiling(limit)) throw refusal('picture_too_large');
  return value;
}
async function bytesHash(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
function ownedPicture(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
function externalImage(raw, asset, url) {
  if (!url) return raw;
  const token = '[' + asset.label + ']', at = raw.lastIndexOf(token);
  if (at < 0) throw refusal('asset_reference_invalid');
  const title = asset.title ? ' "' + String(asset.title).replace(/&/g, '&amp;').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"' : '';
  return raw.slice(0, at) + '(<' + assetURL(url).replace(/&/g, '&amp;') + '>' + title + ')' + raw.slice(at + token.length);
}

function createAssetBroker({current, send}) {
  const retained = new Map();
  let pending = null, identity = '', retainedBytes = 0;
  const same = (a, b) => a.identity === b.identity && a.generation === b.generation && b.connected && b.granted;
  function scope() {
    const now = current();
    if (identity !== now.identity) { retained.clear(); retainedBytes = 0; identity = now.identity; }
    return now;
  }
  function admitted(now) {
    return {identity: now.identity, generation: now.generation, connected: now.connected,
      granted: now.granted, pictureBytes: now.pictureBytes, baseRevision: now.baseRevision};
  }
  function cancel(code = 'asset_disconnected') { pending?.finish({code}); }
  async function request(asset) {
    const state = admitted(scope()), bytes = assetBytes(asset.bytes, state.pictureBytes);
    if (!state.granted) return {code: 'asset_not_granted'};
    if (!state.connected) return {code: 'asset_disconnected'};
    if (pending) return {code: 'asset_busy'};
    if (!ASSET_TYPES.includes(asset.codec)) throw refusal('asset_media_type_invalid');
    if (retained.size >= 1024 || retainedBytes + bytes.byteLength > 25 * 1024 * 1024) return {code: 'asset_cache_full'};
    const kept = {...asset, bytes: ownedPicture(bytes)};
    let resolve;
    const job = new Promise(yes => { resolve = yes; });
    const row = {state, asset: kept, requestId: crypto.randomUUID(), timer: null, bytesSha256: '',
      finish(value) {
        if (pending !== row) return;
        clearTimeout(row.timer); pending = null; resolve(value);
      }};
    pending = row;
    row.timer = setTimeout(() => row.finish({code: 'asset_timeout'}), 15000);
    bytesHash(kept.bytes).then(hash => {
      if (pending !== row) return;
      if (!same(state, scope())) { row.finish({code: 'asset_stale'}); return; }
      row.bytesSha256 = hash;
      if (!send('asset-request', {bytesSha256: hash, mediaType: kept.codec, bytes: kept.bytes}, row.requestId, state.baseRevision))
        row.finish({code: 'asset_unavailable'});
    }).catch(() => row.finish({code: 'asset_unavailable'}));
    return job;
  }
  function answer(message) {
    const row = pending;
    if (!row || message.requestId !== row.requestId || message.baseRevision !== row.state.baseRevision)
      return {code: 'asset_unmatched'};
    let result;
    if (!same(row.state, scope())) result = {code: 'asset_stale'};
    else if (message.type === 'asset-nack') result = {code: 'asset_rejected'};
    else if (message.type !== 'asset-ack') result = {code: 'asset_reply_invalid'};
    else {
      try {
        const url = assetURL(message.payload?.url), prior = retained.get(url);
        if (prior && (prior.bytesSha256 !== row.bytesSha256 || prior.asset.codec !== row.asset.codec)) result = {code: 'asset_url_conflict'};
        else {
          if (!prior) { retained.set(url, {asset: row.asset, bytesSha256: row.bytesSha256}); retainedBytes += row.asset.bytes.byteLength; }
          result = {url};
        }
      } catch (error) { result = {code: error.code || 'asset_url_invalid'}; }
    }
    row.finish(result);
    return result;
  }
  function lookup(url) { scope(); return retained.get(url)?.asset || null; }
  return Object.freeze({request, answer, cancel, lookup});
}

function pictureBase(value) {
  if (value === undefined || value === null) return null;
  let base;
  try {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\s\u0000-\u001f\u007f<>\\]/u.test(value)) throw 0;
    base = new URL(value);
    if (base.username || base.password || !(base.protocol === 'https:' || base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw 0;
  } catch (_) { throw refusal('invalid_base_url', 'baseUrl is an absolute https address, or http on localhost.'); }
  const vouched = new Set();
  return Object.assign(src => {
    const text = String(src || '').trim();
    if (!text || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(text)) return null;
    try { const url = new URL(text, base); if (url.origin !== base.origin) return null; vouched.add(url.href); return url.href; } catch (_) { return null; }
  }, {vouched});
}
return {FEATURES, LIMITS, ASSET_TYPES, refusal, coded, normalizeSettings, snapshotSettings, pickDeviceFile, createFilePicker, assetURL, assetBytes, bytesHash, externalImage, createAssetBroker, pictureBase};
})();
const BUILDS = Object.freeze({full: 'https://rapier.website/embed/rapier.html', reader: 'https://rapier.website/embed/rapier-reader.html'});
const PACKAGE_VERSION = '1.2.53';
const OPTIONS = ['build', 'src', 'plugins', 'approvePlugins', 'sessionId', 'documentId', 'agent', 'agentName', 'theme', 'save', 'assets', 'openFile', 'load',
  'onState', 'compare', 'onClose', 'settings', 'style', 'title', 'onError', 'timeout'];
const READER_FEATURES = ['find', 'readAloud', 'share'];
const DEFAULT_SRC = BUILDS.full;
const revision = value => Number.isSafeInteger(value) && value >= 0 || typeof value === 'string' && value.length > 0 && value.length <= 256;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.isWellFormed();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const themeValue = value => ['light', 'dark', 'system'].includes(value);
const mint = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
const slotLive = new Map();
const fnv = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
function autoIdentity(options, location, fieldId) {
  const load = options.load;
  if (!options.save || !load || typeof load !== 'object' || typeof load.content !== 'string') return null;
  const base = fnv(location.origin + location.pathname) + '-' + fnv(String(load.filename ?? '') + '|' + load.content.length + '|' + load.content.slice(0, 2048));
  if (fieldId) return base + '-field-' + fnv(fieldId);
  let at = 0;
  while (slotLive.get(JSON.stringify(['page-' + base + '-' + at, 'doc-' + base + '-' + at]))?.()) at++;
  return base + '-' + at;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return {promise, resolve, reject};
}
const refused = payload => Object.assign(new Error(payload?.reason || payload?.code || 'The editor refused the request'), {code: payload?.code ?? 'refused', payload, ...(typeof payload?.reason === 'string' ? {reason: payload.reason} : {})},
  revision(payload?.currentRevision) ? {currentRevision: payload.currentRevision} : {});

function conflict(currentRevision) {
  if (!revision(currentRevision)) throw coded('invalid_revision', TypeError, 'A conflict needs the current revision');
  return Object.assign(new Error('The stored document has changed'), {code: 'conflict', currentRevision});
}

function readerStyle(value) {
  if (!record(value) || Object.keys(value).some(key => !['css', 'fonts'].includes(key))) throw coded('invalid_style', TypeError, 'style takes css and fonts');
  if (value.css !== undefined && typeof value.css !== 'string') throw coded('invalid_style', TypeError, 'style.css must be a stylesheet');
  const face = row => record(row) && typeof row.family === 'string' && row.family.length > 0 &&
    (typeof row.source === 'string' || row.source instanceof ArrayBuffer || ArrayBuffer.isView(row.source)) &&
    (row.descriptors === undefined || record(row.descriptors)) && Object.keys(row).every(key => ['family', 'source', 'descriptors'].includes(key));
  if (value.fonts !== undefined && (!Array.isArray(value.fonts) || !value.fonts.every(face))) throw coded('invalid_style', TypeError, 'style.fonts takes {family, source, descriptors?} faces');
  return {...(value.css !== undefined ? {css: value.css} : {}), ...(value.fonts !== undefined ? {fonts: value.fonts.map(row => ({...row}))} : {})};
}

const HOSTED_ORIGIN = new URL(BUILDS.full).origin;
function framingProblem(host, source, sandbox, noun) {
  const here = host.location, local = ['localhost', '127.0.0.1', '[::1]'].includes(here.hostname);
  if (here.protocol !== 'https:' && here.protocol !== 'http:')
    return {code: 'host_scheme_unsupported', reason: 'The ' + noun + ' cannot be framed by a ' + here.protocol + ' page: it needs an https page, or http on localhost. Serve your app over one of those.'};
  if (source.origin === HOSTED_ORIGIN && here.protocol === 'http:' && !local)
    return {code: 'host_not_secure', reason: 'The hosted ' + noun + ' can be framed by https pages and by http on localhost only. Serve your app over https, or serve a copy of the page yourself and set src.'};
  if (source.origin === HOSTED_ORIGIN && host.origin === 'null')
    return {code: 'host_sandboxed', reason: 'This page has an opaque origin (a sandbox without allow-same-origin), which the hosted ' + noun + ' refuses. Give the page an origin, or serve a copy of the ' + noun + ' yourself and set src.'};
  if (source.origin === HOSTED_ORIGIN && [...(here.ancestorOrigins || [])].some(origin => /^http:\/\//.test(origin) && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(origin)))
    return {code: 'host_not_secure', reason: 'A page around this one is served over http, which the hosted ' + noun + ' refuses. Serve the whole page over https, or serve a copy of the ' + noun + ' yourself and set src.'};
  if (source.origin === HOSTED_ORIGIN && host.navigator?.onLine === false)
    return {code: 'offline', reason: 'The browser is offline, so the hosted ' + noun + ' cannot be fetched. Mount again when it is back, or serve a copy of the ' + noun + ' yourself and set src.'};
  if (source.origin === HOSTED_ORIGIN && host.crossOriginIsolated === true)
    return {code: 'host_cross_origin_isolated', reason: 'This page is cross-origin isolated (COEP), which blocks the hosted ' + noun + '. Serve a copy of the page yourself with the Cross-Origin-Embedder-Policy and Cross-Origin-Resource-Policy headers and set src, or drop COEP.'};
  if (sandbox) for (const token of ['allow-scripts', 'allow-same-origin']) if (!sandbox.contains(token))
    return {code: 'sandbox_token_missing', reason: 'The iframe you passed has a sandbox without ' + token + ', which the ' + noun + ' needs. Add the token, or pass a container and let mount create the iframe.'};
  return null;
}

function mount(target, options = {}) {
  const document = target?.ownerDocument;
  if (!document || target.nodeType !== 1) throw coded('invalid_target', TypeError, 'Mount needs an iframe or a container element');
  if (!record(options)) throw coded('invalid_options', TypeError, 'Mount options must be an object');
  const unknown = Object.keys(options).filter(key => !OPTIONS.includes(key));
  if (unknown.length) throw Object.assign(new TypeError('Unknown option: ' + unknown.join(', ') + '. Mount takes ' + OPTIONS.join(', ')), {code: 'option_unknown'});
  const build = options.build === undefined || options.build === 'document' ? 'full' : options.build;
  if (!Object.hasOwn(BUILDS, build)) throw coded('invalid_build', TypeError, 'build must be full or reader');
  const reader = build === 'reader', noun = reader ? 'reader' : 'editor';
  if (reader && ['save', 'compare', 'onClose', 'agent', 'agentName', 'assets'].some(key => options[key] !== undefined && options[key] !== false))
    throw coded('reader_option_unsupported', TypeError, 'The reader takes load, onState, theme, settings, style and plugins');
  if (!reader && options.style !== undefined) throw coded('style_unavailable', TypeError, 'style restyles the reader build');
  if (options.style !== undefined && options.load === undefined) throw coded('load_required', TypeError, 'Reader styling requires load');
  if (options.plugins !== undefined && (typeof options.plugins !== 'string' || !options.plugins || options.plugins.length > 2048 || /[\u0000-\u001f\u007f]/.test(options.plugins)))
    throw coded('invalid_plugins', TypeError, 'plugins is the address of the directory that holds the plug-in files');
  if (options.approvePlugins !== undefined && typeof options.approvePlugins !== 'boolean') throw coded('invalid_option', TypeError, 'approvePlugins is true or false');
  let currentStyle = options.style === undefined ? undefined : readerStyle(options.style);
  const host = document.defaultView, iframe = target.tagName === 'IFRAME' ? target : document.createElement('iframe');
  let source;
  try {
    if (options.src !== undefined && typeof options.src !== 'string') throw new TypeError();
    source = new URL(options.src || BUILDS[build], host.location.href);
  } catch { throw coded('invalid_src', TypeError, 'src must be a page address'); }
  if (source.username || source.password || !(source.protocol === 'https:' || source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)))
    throw coded('host_not_secure', TypeError, 'The editor needs HTTPS, or HTTP on localhost');
  const page = source.pathname.split('/').pop();
  if (reader ? page === 'rapier.html' : page === 'rapier-reader.html')
    throw Object.assign(new TypeError('build ' + build + ' cannot frame ' + page + '; set build: \'' + (reader ? 'full' : 'reader') + '\' or src to ' + (reader ? 'rapier-reader.html' : 'rapier.html')), {code: 'build_mismatch'});
  source.searchParams.set('embed', '1');
  if (options.plugins !== undefined) {
    let directory;
    try { directory = new URL(options.plugins, host.location.href); } catch { throw coded('invalid_plugins', TypeError, 'plugins is not an address'); }
    if (!(directory.protocol === 'https:' || directory.protocol === 'http:') || directory.username || directory.password || directory.search || directory.hash)
      throw coded('invalid_plugins', TypeError, 'plugins is an http or https address of a directory, with no query or fragment');
    if (directory.origin !== source.origin)
      throw coded('invalid_plugins', TypeError, 'plugins must be on ' + source.origin + ', the origin of the page it configures: the page reads plug-ins only from its own origin. Serve the page and its plug-ins together (set src), or leave plugins out');
    source.searchParams.set('plugins', directory.href);
  }
  if (options.approvePlugins === true) source.searchParams.set('approvePlugins', '1');
  const origin = source.origin, auto = options.sessionId === undefined && options.documentId === undefined ? autoIdentity(options, host.location) : null;
  const pageSession = options.documentId !== undefined && options.save ? 'page-' + fnv(host.location.origin + host.location.pathname) : null;
  const askedSession = options.sessionId ?? (auto ? 'page-' + auto : pageSession ?? mint('session')), askedDocument = options.documentId ?? (auto ? 'doc-' + auto : mint('document'));
  if (!identifier(askedSession) || !identifier(askedDocument)) throw coded('invalid_id', TypeError, 'Session and document IDs must be nonempty strings of at most 256 code units');
  const sessionId = askedSession, documentId = askedDocument, pairKey = JSON.stringify([sessionId, documentId]), openElsewhere = !!slotLive.get(pairKey)?.();
  const agentName = options.agentName;
  if (agentName !== undefined && (typeof agentName !== 'string' || !agentName.trim() || agentName.length > 96 || /[\u0000-\u001f\u007f]/.test(agentName))) throw coded('invalid_option', TypeError, 'agentName must be a host-given name of at most 96 characters');
  if (options.theme !== undefined && !themeValue(options.theme)) throw coded('invalid_theme', TypeError, 'Theme must be light, dark or system');
  if (options.save !== undefined && typeof options.save !== 'function') throw coded('invalid_option', TypeError, 'save must be a durable storage callback');
  if (options.assets !== undefined && typeof options.assets !== 'function') throw coded('invalid_option', TypeError, 'assets must be a picture storage callback');
  if (options.openFile !== undefined && typeof options.openFile !== 'function') throw coded('invalid_option', TypeError, 'openFile must choose a File or null');
  if (options.timeout !== undefined && !(Number.isSafeInteger(options.timeout) && options.timeout > 0)) throw coded('invalid_option', TypeError, 'timeout is a whole number of milliseconds');
  const bootTimeout = options.timeout ?? 15000, loadTimeout = Math.max(bootTimeout, 120000);
  const settings = snapshotSettings(options.settings), policy = normalizeSettings(settings), storeAsset = options.assets;
  const unread = reader ? (settings?.features || []).filter(name => !READER_FEATURES.includes(name)) : [];
  if (unread.length) throw Object.assign(new TypeError('The reader has no ' + unread.join(', ') + '; its features are ' + READER_FEATURES.join(', ')), {code: 'settings_feature_unavailable'});
  const assetAnswers = new Map();
  let assetPending = null, assetAbort = new AbortController();
  const chooseFile = options.openFile || (({signal}) => pickDeviceFile(document, signal)), openAnswers = new Map();
  let openPending = null;
  const capabilities = [
    ...(options.load !== undefined ? ['open'] : []), ...(options.save ? ['read'] : []),
    ...(options.save || options.onState ? ['changes'] : []), ...(options.compare ? ['compare'] : []),
    ...(options.onClose ? ['close'] : []), ...(options.agent ? ['agent'] : []), ...(storeAsset ? ['assets'] : []),
  ];
  if (options.agent && (!capabilities.includes('open') || !capabilities.includes('read')))
    throw coded('invalid_option', TypeError, 'Agent access needs both load and save');
  const ids = {sessionId, documentId}, answers = new Map(), waiting = new Map(), listeners = new Map();
  let watcher = null, port = null, posted = false, connected = false, ended = false, terminal = false, endError = null, sawLoad = false, seq = 0, activeSave = null, activeClose = null;
  let currentTheme = options.theme, lastSaved = null, readOnly = false, connectedWait = deferred(), boot, bootAttempt, bootTimer = 0, loadTimer = 0, timedOut = false, frameFacts = {};
  const initialLoad = record(options.load) ? {...options.load} : options.load;
  let held = null;
  const ready = deferred();
  const emit = (type, value) => { for (const fn of listeners.get(type) || []) fn(value); };
  const fail = error => { emit('error', error); options.onError?.(error); };
  const rejectPending = error => {
    for (const job of waiting.values()) job.reject(error);
    waiting.clear(); activeSave?.reject(error); activeSave = null; activeClose?.reject(error); activeClose = null;
  };
  function send(type, payload, baseRevision, quiet = false, deadline = 0) {
    if (ended || !connected || !port) return Promise.reject(endError || coded('disconnected', Error, 'The ' + noun + ' connection has ended or is not connected'));
    if (type === 'load') cancelOpen('open_stale');
    const requestId = 'host-' + ++seq;
    const message = {type, ...ids, requestId, ...(baseRevision !== undefined ? {baseRevision} : {}), ...(payload !== undefined ? {payload} : {})};
    const pending = deferred();
    if (!quiet) waiting.set(requestId, pending);
    try { port.postMessage(message); if (quiet) pending.resolve(); }
    catch (error) { waiting.delete(requestId); pending.reject(error); }
    if (deadline > 0 && !quiet) {
      const timer = setTimeout(() => { if (waiting.delete(requestId)) pending.reject(coded(type + '_timeout', Error, 'The ' + noun + ' did not answer within ' + deadline / 1000 + ' seconds')); }, deadline);
      pending.promise.then(() => clearTimeout(timer), () => clearTimeout(timer));
    }
    return pending.promise;
  }
  function requestCapture() {
    const capture = activeSave;
    if (capture) capture.commandId = 'host-' + (seq + 1);
    send('save', undefined, undefined, true).catch(error => { if (activeSave === capture) { capture?.reject(error); activeSave = null; } });
  }
  async function answerSave(message, channel) {
    const {requestId, baseRevision, payload} = message;
    if (!options.save || !identifier(requestId) || !revision(baseRevision) || typeof payload?.content !== 'string') return;
    const reject = code => {
      if (ended || channel !== port) return;
      channel.postMessage({type: 'save-nack', ...ids, requestId, baseRevision, payload: {code, reason: code}});
      if (code !== 'save_request_conflict') { activeSave?.reject(refused({code})); activeSave = null; }
    };
    if (!payload.content.isWellFormed() || Object.keys(payload).some(key => !['content', 'filename', 'docKind', 'codeLang'].includes(key)) ||
        typeof payload.filename !== 'string' || payload.filename.length > 255 ||
        !['markdown', 'text', 'code'].includes(payload.docKind) || typeof payload.codeLang !== 'string' || payload.codeLang.length > 64)
      return reject('save_payload_invalid');
    if (payload.content.length > policy.limits.documentBytes) return reject('document_too_large');
    const bytes = new TextEncoder().encode(payload.content);
    if (bytes.byteLength > policy.limits.documentBytes) return reject('document_too_large');
    const signature = JSON.stringify([baseRevision, await bytesHash(bytes), payload.filename, payload.docKind, payload.codeLang]);
    if (ended || channel !== port) return;
    const prior = answers.get(requestId);
    if (prior && prior.signature !== signature) return reject('save_request_conflict');
    if (!answers.has(requestId)) {
      const job = Promise.resolve().then(async () => {
        try {
          if (ended || channel !== port) throw coded('disconnected', Error, 'The ' + noun + ' connection has ended');
          const result = await options.save({...payload, requestId, baseRevision});
          if (!revision(result?.revision) || result.revision === baseRevision || typeof result.revision === 'number' && typeof baseRevision === 'number' && result.revision <= baseRevision)
            throw coded('save_not_advancing', TypeError, 'save must return an advancing durable revision');
          return {type: 'save-ack', ...ids, requestId, baseRevision, payload: {revision: result.revision}};
        } catch (error) {
          return {type: 'save-nack', ...ids, requestId, baseRevision, payload: error?.code === 'conflict' && revision(error.currentRevision)
            ? {code: 'conflict', currentRevision: error.currentRevision}
            : {code: 'failed', reason: String(error?.message || error).slice(0, 500)}};
        }
      });
      answers.set(requestId, {signature, job});
    }
    const reply = await answers.get(requestId).job;
    if (ended || channel !== port) return;
    channel.postMessage(reply);
    if (reply.type === 'save-ack') {
      lastSaved = reply.payload; held = {...held, revision: reply.payload.revision, content: payload.content, filename: payload.filename};
      if (activeSave) activeSave.acknowledged = true;
    } else if (activeSave) { activeSave.reject(refused(reply.payload)); activeSave = null; }
  }
  async function answerAsset(message, channel) {
    const {requestId, baseRevision, payload} = message;
    if (!storeAsset || !identifier(requestId)) return;
    const reply = (type, result) => {
      if (!ended && channel === port) channel.postMessage({type, ...ids, requestId, baseRevision, payload: result});
    };
    try {
      if (Object.keys(payload).some(key => !['bytes', 'bytesSha256', 'mediaType'].includes(key)) ||
          !ASSET_TYPES.includes(payload.mediaType) || typeof payload.bytesSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.bytesSha256))
        throw refusal('asset_payload_invalid');
      const bytes = assetBytes(payload.bytes, policy.limits.pictureBytes);
      const signature = JSON.stringify([baseRevision, payload.bytesSha256, payload.mediaType, bytes.byteLength]);
      let row = assetAnswers.get(requestId);
      if (row && row.signature !== signature) throw refusal('asset_request_conflict');
      if (!row) {
        if (assetPending) throw refusal('asset_busy');
        if (assetAnswers.size >= 48) assetAnswers.delete(assetAnswers.keys().next().value);
        const signal = assetAbort.signal;
        row = {signature, job: null}; assetAnswers.set(requestId, row); assetPending = row;
        row.job = Promise.resolve().then(async () => {
          try {
            if (await bytesHash(bytes) !== payload.bytesSha256) throw refusal('asset_hash_mismatch');
            signal.throwIfAborted();
            const result = await storeAsset({requestId, bytesSha256: payload.bytesSha256, mediaType: payload.mediaType, bytes, signal});
            signal.throwIfAborted();
            return {type: 'asset-ack', payload: {url: assetURL(result?.url)}};
          } catch (error) {
            return {type: 'asset-nack', payload: {code: typeof error?.code === 'string' && error.code.length > 0 && error.code.length <= 64 ? error.code : 'asset_failed',
              reason: String(error?.message || error).slice(0, 500)}};
          } finally { if (assetPending === row) assetPending = null; }
        });
      } else if (await bytesHash(bytes) !== payload.bytesSha256) throw refusal('asset_hash_mismatch');
      const answer = await row.job;
      reply(answer.type, answer.payload);
    } catch (error) {
      reply('asset-nack', {code: error.code || 'asset_failed', reason: String(error.message || error).slice(0, 500)});
    }
  }
  function cancelOpen(code = 'open_cancelled') {
    const row = openPending;
    if (!row || row.abort.signal.aborted) return;
    openPending = null;
    row.answer = {type: 'open-nack', payload: {code, reason: 'File opening was canceled.'}};
    row.abort.abort();
  }
  function answerOpen(message, channel) {
    const {type, requestId, baseRevision, payload} = message;
    const reply = (name, value) => {
      if (ended || !connected || channel !== port) return false;
      try { channel.postMessage({type: name, ...ids, requestId, baseRevision, payload: value}); return true; }
      catch (_) { return false; }
    };
    const nack = (code, reason = code) => ({type: 'open-nack', payload: {code, reason}});
    const respond = answer => reply(answer.type, answer.payload);
    if (!identifier(requestId) || !revision(baseRevision)) return;
    if (!capabilities.includes('open')) { respond(nack('open_not_granted')); return; }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(payload)) || Object.keys(payload).length ||
        Object.keys(message).some(key => !['type', 'sessionId', 'documentId', 'requestId', 'baseRevision', 'payload'].includes(key))) {
      respond(nack('open_payload_invalid')); return;
    }
    const prior = openAnswers.get(requestId);
    if (type === 'open-cancel') {
      if (prior?.baseRevision !== baseRevision) { respond(nack('open_unmatched')); return; }
      if (prior === openPending) cancelOpen();
      return;
    }
    if (prior) {
      respond(prior.baseRevision !== baseRevision ? nack('open_request_conflict')
        : prior.answer || {type: 'open-ack', payload: {}});
      return;
    }
    if (openAnswers.size >= 48) for (const [id, row] of openAnswers) {
      if (row !== openPending) { openAnswers.delete(id); break; }
    }
    const row = {baseRevision, answer: null, abort: new AbortController()};
    openAnswers.set(requestId, row);
    if (openPending) { row.answer = nack('open_busy'); respond(row.answer); return; }
    openPending = row;
    let selection;
    try {
      selection = chooseFile({requestId, baseRevision, signal: row.abort.signal});
      if (!reply('open-ack', {})) cancelOpen('open_disconnected');
    } catch (error) {
      row.answer = nack('open_unavailable', String(error?.message || error).slice(0, 500));
      row.abort.abort(); row.abort = null;
      openPending = null; respond(row.answer); return;
    }
    Promise.resolve(selection).then(file => {
      if (row.abort.signal.aborted || channel !== port || ended) return;
      const FileType = host.File || globalThis.File;
      if (file !== null && (typeof FileType !== 'function' || !(file instanceof FileType) ||
          !file.name.trim() || file.name.length > 255 || /[\\/<>"\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/.test(file.name)))
        throw refusal('open_file_invalid');
      row.answer = nack('open_completed', 'This picker request has already finished.');
      reply('open-result', {file});
    }).catch(error => {
      if (row.abort.signal.aborted || channel !== port || ended) return;
      row.answer = nack(typeof error?.code === 'string' && error.code.length > 0 && error.code.length <= 64
        ? error.code : 'open_unavailable', String(error?.message || error).slice(0, 500));
      respond(row.answer);
    }).finally(() => { if (openPending === row) openPending = null; row.abort = null; });
  }
  function onPortMessage(event, channel) {
    if (channel !== port || ended) return;
    const message = event.data;
    if (!record(message) || message.sessionId !== sessionId || message.documentId !== documentId || !record(message.payload)
      || !(message.requestId === null || identifier(message.requestId)) || !(message.baseRevision == null || revision(message.baseRevision))) return;
    const {type, payload, requestId} = message, pending = waiting.get(requestId);
    if (type === 'protocol-error' && !connected) {
      clearTimeout(bootTimer); clearTimeout(loadTimer);
      connectedWait.reject(refused(payload)); return;
    }
    if (type === 'connected') {
      if (connected) return;
      clearTimeout(bootTimer); clearTimeout(loadTimer);
      if (timedOut) { timedOut = false; connectedWait = deferred(); prepareBoot(); }
      connected = true; frameFacts = {version: typeof payload.appVersion === 'string' ? payload.appVersion : null, contract: payload.contract ?? null};
      connectedWait.resolve(); emit('connected', payload); return;
    }
    if (!connected) return;
    if (type === 'open-request' || type === 'open-cancel') { answerOpen(message, channel); return; }
    if (type === 'asset-request') { answerAsset(message, channel).catch(error => { if (!ended && channel === port) fail(error); }); return; }
    if (type === 'save-request') { answerSave(message, channel).catch(error => { if (!ended && channel === port) fail(error); }); return; }
    if (type === 'document-state' && capabilities.includes('changes')) {
      if (!['loaded', 'dirty', 'saving', 'closing', 'readOnly'].every(key => typeof payload[key] === 'boolean')
        || Object.keys(payload).some(key => !['loaded', 'dirty', 'saving', 'closing', 'readOnly', 'filename', 'docKind'].includes(key))) return;
      readOnly = payload.readOnly; emit('state', payload); options.onState?.(payload);
      if (activeSave && !activeSave.acknowledged && activeSave.commandId && message.requestId === activeSave.commandId && payload.loaded && !payload.dirty && !payload.saving && revision(message.baseRevision)) {
        activeSave.resolve({revision: message.baseRevision}); activeSave = null;
        return;
      }
      if (activeSave?.acknowledged && !payload.saving && message.baseRevision === lastSaved?.revision) {
        if (payload.dirty) { activeSave.acknowledged = false; requestCapture(); }
        else { activeSave.resolve(lastSaved); activeSave = null; }
      }
      return;
    }
    if (type === 'close-request' && options.onClose) {
      Promise.resolve().then(() => {
        if (ended || channel !== port) throw coded('disconnected', Error, 'The ' + noun + ' connection has ended');
        return options.onClose({dirty: !!payload.dirty});
      }).then(decision => {
        if (!['save', 'discard', 'cancel'].includes(decision)) throw coded('invalid_option', TypeError, 'Close needs save, discard or cancel');
        if (channel !== port || ended) return;
        channel.postMessage({type: 'close-decision', ...ids, requestId, baseRevision: message.baseRevision, payload: {decision}});
        if (decision === 'cancel') { activeClose?.resolve({cancelled: true}); activeClose = null; }
      }).catch(error => { if (channel !== port || ended) return; activeClose?.reject(error); activeClose = null; fail(error); });
      emit('close-request', payload); return;
    }
    if (type === 'close-ready' && options.onClose) { activeClose?.resolve(payload); activeClose = null; emit('closed', payload); return; }
    if (type === 'protocol-error') {
      const error = refused(payload);
      if (typeof payload.code === 'string' && /^(?:asset|open)_/.test(payload.code)) { fail(error); return; }
      if (pending) { waiting.delete(requestId); pending.reject(error); }
      else { activeSave?.reject(error); activeSave = null; activeClose?.reject(error); activeClose = null; fail(error); }
      return;
    }
    if (pending && ['load-ack', 'load-nack', 'compare-ack', 'compare-nack'].includes(type)) {
      waiting.delete(requestId);
      if (type === 'load-ack') {
        readOnly = payload.readOnly === true;
      }
      if (type.endsWith('-nack')) pending.reject(refused(payload)); else pending.resolve(payload);
    }
  }
  function prepareBoot() {
    bootAttempt?.cancel(coded('disconnected', Error, 'The ' + noun + ' reconnected'));
    const attempt = {...deferred(), stopped: false, recovered: false, timer: 0};
    attempt.cancel = error => { attempt.stopped = true; clearTimeout(attempt.timer); attempt.reject(error); };
    bootAttempt = attempt; boot = attempt.promise;
    const current = () => bootAttempt === attempt && !attempt.stopped && !ended;
    connectedWait.promise.then(async () => {
      if (!current()) return;
      attempt.timer = setTimeout(() => {
        if (!current()) return;
        const error = coded('load_timeout', Error, 'The ' + noun + ' did not finish its first document within ' + loadTimeout / 1000 + ' seconds');
        attempt.cancel(error); rejectPending(error);
      }, loadTimeout);
      if (currentStyle) await send('style', currentStyle, undefined, true);
      if (initialLoad !== undefined) {
        const input = typeof initialLoad === 'function' ? await initialLoad() : held || initialLoad;
        if (!current()) return;
        if (!record(input) || typeof input.content !== 'string' || !revision(input.revision)) throw coded('invalid_load', TypeError, 'load needs content and its revision');
        const value = {...input};
        await send('load', value, null, false, loadTimeout);
        if (!current()) return;
        held = value;
      }
      if (!current()) return;
      clearTimeout(attempt.timer); attempt.resolve();
      ready.resolve(handle);
    }).catch(error => { if (current()) attempt.cancel(error); });
    boot.catch(error => { if (bootAttempt === attempt && !ended) { ready.reject(error); fail(error); } });
  }
  async function whenBooted(retryLoad = false) {
    const attempt = bootAttempt;
    try { await attempt.promise; }
    catch (error) { if ((!retryLoad && !attempt.recovered) || ended || !connected || attempt !== bootAttempt) throw error; }
    if (ended || attempt !== bootAttempt) throw endError || coded('disconnected', Error, 'The ' + noun + ' connection has ended');
    return attempt;
  }
  function connect() {
    if (posted || ended) return;
    const channel = new host.MessageChannel();
    port = channel.port1; posted = true;
    port.onmessage = event => onPortMessage(event, channel.port1);
    port.onmessageerror = () => {
      if (channel.port1 !== port || ended) return;
      const error = coded('disconnected', Error, 'The ' + noun + ' connection was lost');
      end(true, error); fail(error);
    };
    try { iframe.contentWindow.postMessage({type: 'rapier-connect', ...ids, capabilities, contract: 1, ...(settings ? {settings} : {}), ...(agentName ? {agent: {name: agentName}} : {}), ...(currentTheme ? {theme: currentTheme} : {})}, origin, [channel.port2]); }
    catch (error) { port.close(); port = null; posted = false; fail(error); }
  }
  function bootFailed(code, reason) {
    clearTimeout(bootTimer); clearTimeout(loadTimer);
    if (connected || ended) return;
    timedOut = code === 'connect_timeout' || code === 'load_timeout';
    connectedWait.reject(refusal(code, reason));
  }
  const connectTimeoutReason = () => 'The ' + noun + ' page loaded but did not answer within ' + bootTimeout / 1000 + ' seconds. The address may not be a Rapier page (a missing file loads an error page), the page may not allow this parent (frame-ancestors or X-Frame-Options), or the device may be too slow; a slow device that answers later still connects.';
  function onLoad() {
    if (terminal) return;
    if (ended) {
      if (!iframe.isConnected) return;
      if (slotLive.get(pairKey)?.()) {
        endError = coded('document_open_elsewhere', Error, 'Another editor already has this document open');
        fail(endError); return;
      }
      ended = false; endError = null; connected = false; posted = false; readOnly = false; sawLoad = false; timedOut = false;
      assetAbort = new AbortController(); connectedWait = deferred(); prepareBoot();
      host.addEventListener('message', onWindowMessage);
      slotLive.set(pairKey, live); watch();
    }
    if (sawLoad && posted) {
      cancelOpen('open_disconnected');
      const error = coded('disconnected', Error, 'The ' + noun + ' reconnected');
      bootAttempt.cancel(error); rejectPending(error); port?.close(); port = null;
      assetAbort.abort(refusal('asset_disconnected')); assetPending = null; assetAbort = new AbortController();
      connected = false; posted = false; readOnly = false; timedOut = false; connectedWait = deferred(); prepareBoot();
    }
    sawLoad = true;
    clearTimeout(bootTimer); clearTimeout(loadTimer);
    if (!connected) bootTimer = setTimeout(() => bootFailed('connect_timeout', connectTimeoutReason()), bootTimeout);
    connect();
  }
  function focusBeside(forward) {
    const flat = [], around = new Set();
    const parent = node => node.assignedSlot || node.parentNode || node.host;
    const walk = element => {
      flat.push(element);
      const assigned = element.localName === 'slot' ? element.assignedElements({flatten: true}) : [];
      for (const child of assigned.length ? assigned : (element.shadowRoot || element).children) walk(child);
    };
    for (const child of document.children) walk(child);
    for (let node = iframe; node; node = parent(node)) around.add(node);
    const available = element => {
      if (around.has(element) || element.tabIndex < 0 || !element.matches('a[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable=""],[contenteditable="true"]') ||
          element.matches(':disabled') || !element.getClientRects().length || ['hidden', 'collapse'].includes(host.getComputedStyle(element).visibility)) return false;
      for (let node = element; node; node = parent(node))
        if (node.nodeType === 1 && (node.matches('[hidden],[inert]') || node.localName.includes('-') && node.hasAttribute('disabled'))) return false;
      return true;
    };
    const at = flat.indexOf(iframe), side = forward ? flat.slice(at + 1) : flat.slice(0, at).reverse();
    const next = at < 0 ? null : side.find(available);
    if (next) next.focus(); else iframe.blur();
  }
  function end(removed, error) {
    if (terminal || ended && removed) return;
    if (connected && (!removed || error)) send('disconnect', undefined, undefined, true).catch(() => {});
    terminal = !removed; ended = true; connected = false; clearTimeout(bootTimer); clearTimeout(loadTimer); watcher?.disconnect(); watcher = null;
    cancelOpen('open_disconnected'); openAnswers.clear();
    assetAbort.abort(refusal('asset_disconnected')); assetPending = null; assetAnswers.clear();
    error ??= removed ? coded('frame_removed', Error, 'The ' + noun + ' was removed from the page') : coded('disconnected', Error, 'The ' + noun + ' connection has ended');
    endError = error;
    bootAttempt.cancel(error); rejectPending(error); connectedWait.reject(error); ready.reject(error);
    host.removeEventListener('message', onWindowMessage);
    if (!removed) { iframe.removeEventListener('load', onLoad); listeners.clear(); answers.clear(); }
    port?.close(); port = null;
    if (slotLive.get(pairKey) === live) slotLive.delete(pairKey);
    if (!removed && iframe !== target) iframe.remove();
  }
  function onWindowMessage(event) {
    if (ended) return;
    if (event.source !== iframe.contentWindow || event.origin !== origin) return;
    if (event.data?.type === 'rapier-ready') connect();
    else if (event.data?.type === 'rapier-boot-failed') bootFailed('boot_failed', 'The ' + noun + ' could not start');
    else if (event.data?.type === 'rapier-focus-leave' && connected) focusBeside(event.data.backward !== true);
    else if (event.data?.type === 'close-ready' && event.data.sessionId === sessionId && event.data.documentId === documentId && options.onClose) {
      activeClose?.resolve(event.data.payload); activeClose = null; emit('closed', event.data.payload);
    }
  }
  const handle = Object.freeze({
    iframe, ready: ready.promise,
    get connected() { return connected && !ended; },
    get version() { return frameFacts.version ?? null; },
    get contract() { return frameFacts.contract ?? null; },
    async load(content, options = {}) {
      if (record(content)) { options = content; content = options.content; }
      if (typeof content !== 'string') throw Object.assign(new TypeError('load needs the document text as a string'), {code: 'invalid_payload'});
      let {filename, revision: version, readOnly, title, baseUrl} = options;
      cancelOpen('open_stale');
      const attempt = await whenBooted(true);
      if (version === undefined) version = typeof held?.revision === 'number' ? held.revision + 1 : 1;
      const sameDocument = held && (filename === undefined || held.filename === undefined || filename === held.filename);
      if (sameDocument && typeof version === 'number' && typeof held.revision === 'number' && version < held.revision)
        throw Object.assign(new Error('Revision ' + version + ' is older than the frame\'s ' + held.revision), {code: 'revision_stale', currentRevision: held.revision});
      if (sameDocument && version === held.revision && held.content !== null && content !== held.content)
        throw Object.assign(new Error('Revision ' + version + ' already names other content'), {code: 'revision_conflict', currentRevision: held.revision});
      const value = {content, revision: version, ...(filename !== undefined ? {filename} : {}), ...(readOnly !== undefined ? {readOnly} : {}), ...(title !== undefined ? {title} : {}), ...(baseUrl !== undefined ? {baseUrl} : {})};
      const loaded = await send('load', value, null, false, loadTimeout);
      if (attempt !== bootAttempt || ended) throw endError || coded('disconnected', Error, 'The ' + noun + ' reconnected');
      held = value; attempt.recovered = true;
      return loaded;
    },
    async save() {
      await whenBooted();
      if (ended) throw endError || coded('disconnected', Error, 'The ' + noun + ' connection has ended');
      if (!options.save) throw coded('save_unavailable', Error, 'No save callback was granted');
      if (readOnly) throw coded('read_only', Error, 'The document is read-only');
      if (!activeSave) activeSave = {...deferred(), acknowledged: false, commandId: ''};
      const promise = activeSave.promise;
      requestCapture(); return promise;
    },
    async compare(content, {filename} = {}) { await whenBooted(); return send('compare', {content, ...(filename !== undefined ? {filename} : {})}); },
    async close() {
      await whenBooted();
      if (ended) throw endError || coded('disconnected', Error, 'The ' + noun + ' connection has ended');
      if (!options.onClose) throw coded('close_unavailable', Error, 'No close callback was granted');
      if (!activeClose) {
        const closing = activeClose = deferred();
        send('close', undefined, undefined, true).catch(error => { if (activeClose === closing) { closing.reject(error); activeClose = null; } });
      }
      return activeClose.promise;
    },
    async theme(value) {
      if (!themeValue(value)) throw coded('invalid_theme', TypeError, 'Theme must be light, dark or system');
      currentTheme = value;
      try { await whenBooted(); return await send('theme', {theme: value}, undefined, true); } catch (error) { if (error?.code === 'disconnected') return; throw error; }
    },
    async style(value) {
      if (!reader) throw coded('style_unavailable', TypeError, 'style restyles the reader build');
      if (!capabilities.includes('open')) throw coded('load_required', TypeError, 'Reader styling requires load');
      currentStyle = readerStyle(value);
      try { await whenBooted(); return await send('style', currentStyle, undefined, true); } catch (error) { if (error?.code === 'disconnected') return; throw error; }
    },
    disconnect() { end(false); },
    on(type, fn) {
      if (typeof fn !== 'function') throw coded('invalid_option', TypeError, 'An event listener must be a function');
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
  });
  const live = () => iframe.isConnected && !ended;
  if (!openElsewhere) slotLive.set(pairKey, live);
  prepareBoot();
  if (openElsewhere) {
    queueMicrotask(() => bootFailed('document_open_elsewhere', 'Another editor on this page already has this document open (the same sessionId and documentId). Give each editor its own documentId.'));
    return handle;
  }
  if (iframe !== target) { iframe.setAttribute('width', '100%'); iframe.setAttribute('height', '100%'); iframe.setAttribute('frameborder', '0'); }
  iframe.setAttribute('title', options.title || (reader ? 'Markdown reader' : 'Markdown editor'));
  iframe.setAttribute('allow', options.agent ? 'clipboard-write; tools' : 'clipboard-write');
  const ownSandbox = iframe === target && iframe.hasAttribute('sandbox');
  if (!ownSandbox) iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads');
  const blocked = framingProblem(host, source, ownSandbox ? iframe.sandbox : null, noun);
  if (blocked) {
    if (iframe !== target) target.append(iframe);
    queueMicrotask(() => bootFailed(blocked.code, blocked.reason));
    return handle;
  }
  host.addEventListener('message', onWindowMessage); iframe.addEventListener('load', onLoad);
  iframe.src = source.href;
  if (iframe !== target) target.append(iframe);
  function watch() {
    if (!host.MutationObserver) return;
    watcher?.disconnect();
    let attached = iframe.isConnected;
    watcher = new host.MutationObserver(() => {
      if (!iframe.isConnected) { if (attached) end(true); return; }
      attached = true;
      observeRoots();
    });
    const observeRoots = () => {
      for (let node = iframe; node;) {
        const root = node.getRootNode();
        if (root !== host.document && root.nodeType === 11) watcher.observe(root, {childList: true, subtree: true});
        node = root.host;
      }
    };
    watcher.observe(host.document, {childList: true, subtree: true});
    observeRoots();
  }
  watch();
  loadTimer = setTimeout(() => bootFailed('load_timeout', 'The ' + noun + ' did not finish loading within ' + loadTimeout / 1000 + ' seconds. Check the address and the network.'), loadTimeout);
  return handle;
}

export const Rapier = Object.freeze({mount, conflict, version: PACKAGE_VERSION, contract: 1});

const forms = new WeakMap();
function joinForm(field, form) {
  if (!form) return () => {};
  let group = forms.get(form);
  if (!group) {
    group = {fields: new Set(), pending: false, releasing: false};
    group.submit = async event => {
      if (event.target !== form || group.releasing) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (group.pending) return;
      group.pending = true;
      const submitter = event.submitter;
      const enabled = () => [...group.fields].filter(field => field.isConnected && field.form === form && !field._disabled);
      const captured = enabled().map(field => ({field, generation: field._generation, authority: field._formAuthority}));
      const current = () => forms.get(form) === group && enabled().length === captured.length && captured.every(({field, generation, authority}) =>
        group.fields.has(field) && field.isConnected && field.form === form && !field._disabled && field._generation === generation && field._formAuthority === authority);
      try {
        await Promise.all(captured.map(({field}) => field.save()));
        if (!current() || submitter && (submitter.form !== form || submitter.disabled)) return;
        group.releasing = true;
        if (submitter?.form === form) form.requestSubmit(submitter); else form.requestSubmit();
      } catch (error) { if (current()) for (const {field} of captured) field._error(error); }
      finally { group.pending = false; group.releasing = false; }
    };
    forms.set(form, group);
  }
  const root = form.getRootNode?.();
  const next = !root || root === form.ownerDocument ? form.ownerDocument.defaultView : root;
  if (group.view !== next) {
    group.view?.removeEventListener('submit', group.submit, true);
    group.view = next;
    next?.addEventListener('submit', group.submit, true);
  }
  group.fields.add(field);
  return () => {
    group.fields.delete(field);
    if (!group.fields.size) { group.view?.removeEventListener('submit', group.submit, true); forms.delete(form); }
  };
}

export class RapierEditor extends (globalThis.HTMLElement || class {}) {
  static formAssociated = true;
  static observedAttributes = ['disabled', 'required', 'theme', 'src', 'name'];
  constructor() {
    super();
    this._internals = this.attachInternals(); this._value = ''; this._revision = 0; this._dirty = false;
    this._disabled = false; this._initialized = false; this._sync = Promise.resolve(); this._generation = 0; this._formAuthority = 0;
    const shadow = this.attachShadow({mode: 'open', delegatesFocus: true}), doc = this.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = ':host{display:block}button{font:inherit;color:inherit;cursor:pointer}.preview{width:100%;white-space:pre-wrap;text-align:start;padding:1rem;max-height:16rem;overflow:auto}.panel{box-sizing:border-box;width:100%;height:32rem;border:0;padding:0;position:static;color:inherit;background:Canvas}.mount,.mount iframe{width:100%;height:100%;border:0}.done{display:none}@media(max-width:600px){.panel{position:fixed;inset:0;width:100%;max-width:none;height:100dvh;max-height:none;margin:0}.mount{height:calc(100% - 3rem)}.done{display:block;height:3rem;width:100%}}@media(min-width:601px){.preview{display:none}}';
    this._preview = doc.createElement('button'); this._preview.type = 'button'; this._preview.className = 'preview';
    this._panel = doc.createElement('dialog'); this._panel.className = 'panel';
    this._done = doc.createElement('button'); this._done.type = 'button'; this._done.className = 'done'; this._done.textContent = 'Done';
    this._mount = doc.createElement('div'); this._mount.className = 'mount';
    this._panel.append(this._done, this._mount); shadow.append(style, this._preview, this._panel);
    this._preview.addEventListener('click', () => this.focus());
    this._done.addEventListener('click', () => this._finish());
    this._panel.addEventListener('cancel', event => { event.preventDefault(); this._finish(); });
  }
  connectedCallback() {
    if (!this._initialized) {
      this._fallback = this.querySelector('textarea');
      const own = Object.prototype.hasOwnProperty.call(this, 'value') ? this.value : undefined;
      if (own !== undefined) delete this.value;
      this._value = own !== undefined ? String(own) : this._hasValue ? this._value : this._fallback?.value ?? this.textContent;
      this._defaultValue = this._fallback?.defaultValue ?? this._value;
      if (this._fallback) this._fallback.disabled = true;
      this._initialized = true;
    }
    this._disabled = this.matches(':disabled'); this.tabIndex = this._disabled ? -1 : 0;
    if (!this._onPageHide) {
      this._onPageHide = () => {
        if (this._disabled) return;
        this._setFormValue();
      };
      this._onPageShow = () => { if (!this._disabled) this._updateValue(); };
    }
    const bindPageLifecycle = () => {
      if (!this._onPageHide) return;
      const view = this.isConnected ? this.ownerDocument.defaultView : null;
      if (this._view === view) return;
      this._view?.removeEventListener('pagehide', this._onPageHide);
      this._view?.removeEventListener('pageshow', this._onPageShow);
      this._media?.removeEventListener('change', this._onMedia);
      this._view = view;
      this._media = view ? view.matchMedia('(max-width:600px)') : null;
      view?.addEventListener('pagehide', this._onPageHide);
      view?.addEventListener('pageshow', this._onPageShow);
      if (this._media) {
        this._onMedia ||= () => this._layout();
        this._media.addEventListener('change', this._onMedia);
      }
    };
    bindPageLifecycle();
    queueMicrotask(bindPageLifecycle);
    this._bindForm(); this._updateValue(); this._layout(); if (this._panel.open) this._start();
  }
  disconnectedCallback() {
    this._formAuthority++;
    queueMicrotask(() => {
      if (this.isConnected) return;
      this._leaveForm?.(); this._leaveForm = null;
      this._media?.removeEventListener('change', this._onMedia);
      this._media = null;
      this._view?.removeEventListener('pagehide', this._onPageHide);
      this._view?.removeEventListener('pageshow', this._onPageShow);
      this._view = null;
      this._onPageHide = null; this._onPageShow = null;
      const editor = this._editor;
      this._generation++; this._editor = null; this._sync = Promise.resolve();
      editor?.disconnect(); this._mount.replaceChildren();
    });
  }
  attributeChangedCallback(name) {
    if (!this._initialized) return;
    if (name === 'disabled') this.formDisabledCallback(this.matches(':disabled'));
    else if (name === 'theme') {
      const editor = this._editor;
      editor?.theme(this.getAttribute('theme') || 'system').catch(error => { if (this._editor === editor) this._error(error); });
    }
    else if (name === 'src') {
      const editor = this._editor, generation = this._generation, src = this.getAttribute('src');
      const current = () => this._editor === editor && this._generation === generation && this.getAttribute('src') === src;
      (editor?.connected ? this.save() : Promise.resolve()).then(() => { if (current()) this._remount(); })
        .catch(error => { if (current()) this._error(error); });
    }
    else this._updateValue();
  }
  get value() { return this._value; }
  set value(value) { this._hasValue = true; this._replace(String(value)); }
  get name() { return this.getAttribute('name') || ''; }
  set name(value) { this.setAttribute('name', value); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { this.toggleAttribute('disabled', !!value); }
  get required() { return this.hasAttribute('required'); }
  set required(value) { this.toggleAttribute('required', !!value); }
  get form() { return this._internals.form; }
  get labels() { return this._internals.labels; }
  get validity() { return this._internals.validity; }
  get validationMessage() { return this._internals.validationMessage; }
  get willValidate() { return this._internals.willValidate; }
  checkValidity() { return this._internals.checkValidity(); }
  reportValidity() { return this._internals.reportValidity(); }
  setCustomValidity(message) { this._customValidity = String(message); this._updateValue(); }
  _bindForm() { this._formAuthority++; this._leaveForm?.(); this._leaveForm = joinForm(this, this.form); }
  formAssociatedCallback() { if (this._initialized && this.isConnected) this._bindForm(); }
  formResetCallback() { this._replace(this._defaultValue); }
  formStateRestoreCallback(state, mode) { if (mode === 'restore' && typeof state === 'string') this._replace(state); }
  formDisabledCallback(disabled) {
    const wasDisabled = this._disabled; this._disabled = disabled;
    if (disabled !== wasDisabled) this._formAuthority++;
    this.tabIndex = disabled ? -1 : 0; this._preview.disabled = disabled; this._mount.inert = disabled;
    if (!this._initialized) return;
    this._updateValue();
    const editor = this._editor;
    if (!editor || disabled === wasDisabled) return;
    this._sync = this._sync.then(async () => {
      if (this._editor !== editor) return;
      await editor.ready;
      if (!wasDisabled) await editor.save();
      if (this._editor === editor) await editor.load(this._value, {filename: this._filename(), revision: this._revision, readOnly: disabled});
    }).catch(error => { if (this._editor === editor) this._error(error); });
  }
  _filename() { return (this.getAttribute('name') || 'document').slice(0, 240) + '.md'; }
  _submissionFile() {
    const File = this.ownerDocument.defaultView?.File;
    return File ? new File([this._value], this._filename(), {type: 'text/markdown'}) : null;
  }
  _setFormValue() {
    const file = this._submissionFile();
    if (!file) return;
    this._internals.setFormValue(file, null);
  }
  _updateValue() {
    this._setFormValue();
    this._preview.textContent = this._value || 'Edit document'; this._preview.disabled = this._disabled;
    if (this._fallback) this._fallback.value = this._value;
    const missing = this.required && !this._value && !this._dirty;
    const error = this._customValidity || (missing ? 'Please fill out this field.' : '');
    this._internals.setValidity(error ? (this._customValidity ? {customError: true} : {valueMissing: true}) : {}, error, this._preview);
  }
  _replace(value) {
    this._value = value; this._dirty = false; this._revision = 0;
    this._ids = {sessionId: mint('field'), documentId: mint('field')};
    this._remount();
  }
  _remount() {
    const editor = this._editor;
    this._generation++; this._editor = null; this._sync = Promise.resolve();
    editor?.disconnect(); this._mount.replaceChildren(); this._updateValue();
    if (this._initialized && this.isConnected && this._panel.open) this._start();
  }
  _start() {
    if (this._editor) return;
    const load = {content: this._value, filename: this._filename(), revision: this._revision, readOnly: this._disabled};
    if (!this._ids) {
      const here = this.ownerDocument.defaultView.location;
      const auto = autoIdentity({load, save: true}, here, this.id);
      this._ids = {sessionId: 'page-' + auto, documentId: 'doc-' + auto};
    }
    const generation = this._generation;
    let editor;
    const current = () => this._generation === generation && this._editor === editor;
    editor = Rapier.mount(this._mount, {...this._ids,
      src: this.getAttribute('src') || DEFAULT_SRC, theme: this.getAttribute('theme') || 'system',
      load,
      save: ({content, baseRevision}) => {
        if (!current()) throw coded('field_replaced', Error, 'The form field was replaced');
        if (baseRevision !== this._revision) throw conflict(this._revision);
        this._value = content; this._revision++; this._dirty = false; this._updateValue();
        const revision = this._revision;
        this.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
        return {revision};
      },
      onState: state => { if (current()) { this._dirty = state.dirty; this._updateValue(); } },
      onError: error => { if (current()) this._error(error); },
    });
    this._editor = editor;
    this._mount.inert = this._disabled;
  }
  _layout() {
    const narrow = this._media?.matches === true;
    if (this._narrow === narrow) return;
    this._narrow = narrow;
    if (this._panel.open) this._panel.close();
    if (narrow || !this.ownerDocument.defaultView) return;
    this._panel.setAttribute('open', '');
    this._start();
  }
  focus(options) {
    if (this._disabled) return;
    if (this._narrow && !this._panel.open) this._panel.showModal();
    this._start(); this._editor.iframe.focus(options);
  }
  async save() {
    const generation = this._generation;
    await this._sync;
    if (generation !== this._generation) throw coded('field_replaced', Error, 'The form field was replaced');
    if (this._editor && !this._disabled) await this._editor.save();
    if (generation !== this._generation) throw coded('field_replaced', Error, 'The form field was replaced');
    return this._value;
  }
  async _finish() {
    const generation = this._generation, authority = this._formAuthority, narrow = this._narrow;
    const current = () => this._generation === generation && this._formAuthority === authority && this._narrow === narrow && this.isConnected;
    try { await this.save(); if (current()) { this._panel.close(); if (!this._disabled) this._preview.focus(); } }
    catch (error) { if (current()) this._error(error); }
  }
  _error(error) { this.dispatchEvent(new CustomEvent('error', {detail: error, bubbles: true, composed: true})); }
}

export function defineRapierEditor(registry = globalThis.customElements) {
  if (!registry || !globalThis.ElementInternals) throw coded('unsupported_environment', Error, 'rapier-editor needs form-associated custom elements');
  if (!registry.get('rapier-editor')) registry.define('rapier-editor', RapierEditor);
  return RapierEditor;
}
