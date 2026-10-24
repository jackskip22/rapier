// SPDX-License-Identifier: MIT
const {FEATURES, LIMITS, ASSET_TYPES, refusal, normalizeSettings, snapshotSettings, pickDeviceFile, createFilePicker, assetURL, assetBytes, bytesHash, externalImage, createAssetBroker, pictureBase} = (() => {
const FEATURES = Object.freeze(['draw', 'paint', 'notes', 'readAloud', 'share', 'find']);
const LIMITS = Object.freeze({documentBytes: 64 * 1024 * 1024, pictureBytes: 16 * 1024 * 1024});
const ASSET_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/jxl', 'image/svg+xml']);
const ACCENTS = Object.freeze(['Teal', 'Blue', 'Amber', 'Green', 'Red', 'Purple', 'Pink', 'Gray']);
const refusal = (code, reason = code) => Object.assign(new Error(reason), {code});
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

function assetBytes(value, limit = LIMITS.pictureBytes) {
  if (!(value instanceof Uint8Array) || !value.byteLength) throw refusal('asset_bytes_invalid');
  if (value.byteLength > Math.min(limit, LIMITS.pictureBytes)) throw refusal('picture_too_large');
  return value;
}
async function bytesHash(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
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
  function cancel(code = 'asset_disconnected') { pending?.finish({code}); }
  async function request(asset) {
    const state = scope(), bytes = assetBytes(asset.bytes, state.pictureBytes);
    if (!state.granted) return {code: 'asset_not_granted'};
    if (!state.connected) return {code: 'asset_disconnected'};
    if (pending) return {code: 'asset_busy'};
    if (!ASSET_TYPES.includes(asset.codec)) throw refusal('asset_media_type_invalid');
    if (retained.size >= 1024 || retainedBytes + bytes.byteLength > 25 * 1024 * 1024) return {code: 'asset_cache_full'};
    const kept = {...asset, bytes: bytes.slice()};
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
    try { const href = new URL(text, base).href; vouched.add(href); return href; } catch (_) { return null; }
  }, {vouched});
}
return {FEATURES, LIMITS, ASSET_TYPES, refusal, normalizeSettings, snapshotSettings, pickDeviceFile, createFilePicker, assetURL, assetBytes, bytesHash, externalImage, createAssetBroker, pictureBase};
})();
const BUILDS = Object.freeze({full: 'https://rapier.website/embed/rapier.html', reader: 'https://rapier.website/embed/rapier-reader.html'});
const PACKAGE_VERSION = '1.2.40';
const OPTIONS = ['build', 'src', 'plugins', 'approvePlugins', 'sessionId', 'documentId', 'agent', 'agentName', 'theme', 'save', 'assets', 'openFile', 'load',
  'onState', 'compare', 'onClose', 'settings', 'style', 'title', 'onError', 'timeout'];
const READER_FEATURES = ['find', 'readAloud', 'share'];
const DEFAULT_SRC = BUILDS.full;
const revision = value => Number.isSafeInteger(value) && value >= 0 || typeof value === 'string' && value.length > 0 && value.length <= 256;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const themeValue = value => ['light', 'dark', 'system'].includes(value);
const mint = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
const autoLive = new Map();
const fnv = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
function autoIdentity(options) {
  const load = options.load;
  if (!options.save || !load || typeof load !== 'object' || typeof load.content !== 'string') return null;
  const base = fnv(location.origin + location.pathname) + '-' + fnv(String(load.filename ?? '') + '|' + load.content.length + '|' + load.content.slice(0, 2048));
  let at = 0;
  while (autoLive.get(base + '-' + at)?.()) at++;
  return base + '-' + at;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return {promise, resolve, reject};
}
const refused = payload => Object.assign(new Error(payload?.reason || payload?.code || 'The editor refused the request'), {code: payload?.code, payload},
  revision(payload?.currentRevision) ? {currentRevision: payload.currentRevision} : {});

function conflict(currentRevision) {
  if (!revision(currentRevision)) throw new TypeError('A conflict needs the current revision');
  return Object.assign(new Error('The stored document has changed'), {code: 'conflict', currentRevision});
}

function readerStyle(value) {
  if (!record(value) || Object.keys(value).some(key => !['css', 'fonts'].includes(key))) throw new TypeError('style takes css and fonts');
  if (value.css !== undefined && typeof value.css !== 'string') throw new TypeError('style.css must be a stylesheet');
  const face = row => record(row) && typeof row.family === 'string' && row.family.length > 0 &&
    (typeof row.source === 'string' || row.source instanceof ArrayBuffer || ArrayBuffer.isView(row.source)) &&
    (row.descriptors === undefined || record(row.descriptors)) && Object.keys(row).every(key => ['family', 'source', 'descriptors'].includes(key));
  if (value.fonts !== undefined && (!Array.isArray(value.fonts) || !value.fonts.every(face))) throw new TypeError('style.fonts takes {family, source, descriptors?} faces');
  return {...(value.css !== undefined ? {css: value.css} : {}), ...(value.fonts !== undefined ? {fonts: value.fonts.map(row => ({...row}))} : {})};
}

const HOSTED_ORIGIN = new URL(BUILDS.full).origin;
function framingProblem(host, source, sandbox, noun) {
  const here = host.location, local = ['localhost', '127.0.0.1', '[::1]'].includes(here.hostname);
  if (here.protocol !== 'https:' && here.protocol !== 'http:')
    return {code: 'host_scheme_unsupported', reason: 'The ' + noun + ' cannot be framed by a ' + here.protocol + ' page: it needs an https page, or http on localhost. Serve your app over one of those.'};
  if (source.origin === HOSTED_ORIGIN && here.protocol === 'http:' && !local)
    return {code: 'host_not_secure', reason: 'The hosted ' + noun + ' can be framed by https pages and by http on localhost only. Serve your app over https, or serve a copy of the page yourself and set src.'};
  if (source.origin === HOSTED_ORIGIN && host.crossOriginIsolated === true)
    return {code: 'host_cross_origin_isolated', reason: 'This page is cross-origin isolated (COEP), which blocks the hosted ' + noun + '. Serve a copy of the page yourself with the Cross-Origin-Embedder-Policy and Cross-Origin-Resource-Policy headers and set src, or drop COEP.'};
  if (sandbox) for (const token of ['allow-scripts', 'allow-same-origin']) if (!sandbox.contains(token))
    return {code: 'sandbox_token_missing', reason: 'The iframe you passed has a sandbox without ' + token + ', which the ' + noun + ' needs. Add the token, or pass a container and let mount create the iframe.'};
  return null;
}

function mount(target, options = {}) {
  const document = target?.ownerDocument;
  if (!document) throw new TypeError('Mount needs an iframe or a container element');
  const unknown = Object.keys(options).filter(key => !OPTIONS.includes(key));
  if (unknown.length) throw Object.assign(new TypeError('Unknown option: ' + unknown.join(', ') + '. Mount takes ' + OPTIONS.join(', ')), {code: 'option_unknown'});
  const build = options.build === undefined || options.build === 'document' ? 'full' : options.build;
  if (!Object.hasOwn(BUILDS, build)) throw new TypeError('build must be full or reader');
  const reader = build === 'reader', noun = reader ? 'reader' : 'editor';
  if (reader && ['save', 'compare', 'onClose', 'agent', 'agentName', 'assets'].some(key => options[key] !== undefined && options[key] !== false))
    throw new TypeError('The reader takes load, onState, theme, settings, style and plugins');
  if (!reader && options.style !== undefined) throw new TypeError('style restyles the reader build');
  if (options.style !== undefined && options.load === undefined) throw new TypeError('Reader styling requires load');
  if (options.plugins !== undefined && (typeof options.plugins !== 'string' || !options.plugins || options.plugins.length > 2048 || /[\u0000-\u001f\u007f]/.test(options.plugins)))
    throw new TypeError('plugins is the address of the directory that holds the plug-in files');
  if (options.approvePlugins !== undefined && typeof options.approvePlugins !== 'boolean') throw new TypeError('approvePlugins is true or false');
  let currentStyle = options.style === undefined ? undefined : readerStyle(options.style);
  const host = document.defaultView, iframe = target.tagName === 'IFRAME' ? target : document.createElement('iframe');
  const source = new URL(options.src || BUILDS[build], host.location.href);
  if (source.username || source.password || !(source.protocol === 'https:' || source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)))
    throw new TypeError('The editor needs HTTPS, or HTTP on localhost');
  const page = source.pathname.split('/').pop();
  if (reader ? page === 'rapier.html' : page === 'rapier-reader.html')
    throw Object.assign(new TypeError('build ' + build + ' cannot frame ' + page + '; set build: \'' + (reader ? 'full' : 'reader') + '\' or src to ' + (reader ? 'rapier-reader.html' : 'rapier.html')), {code: 'build_mismatch'});
  source.searchParams.set('embed', '1');
  if (options.plugins !== undefined) {
    let directory;
    try { directory = new URL(options.plugins, host.location.href); } catch { throw new TypeError('plugins is not an address'); }
    if (!(directory.protocol === 'https:' || directory.protocol === 'http:') || directory.username || directory.password || directory.search || directory.hash)
      throw new TypeError('plugins is an http or https address of a directory, with no query or fragment');
    if (directory.origin !== source.origin)
      throw new TypeError('plugins must be on ' + source.origin + ', the origin of the page it configures: the page reads plug-ins only from its own origin. Serve the page and its plug-ins together (set src), or leave plugins out');
    source.searchParams.set('plugins', directory.href);
  }
  if (options.approvePlugins === true) source.searchParams.set('approvePlugins', '1');
  const origin = source.origin, auto = options.sessionId === undefined && options.documentId === undefined ? autoIdentity(options) : null;
  const sessionId = options.sessionId ?? (auto ? 'page-' + auto : mint('session')), documentId = options.documentId ?? (auto ? 'doc-' + auto : mint('document'));
  if (!identifier(sessionId) || !identifier(documentId)) throw new TypeError('Session and document IDs must be nonempty strings of at most 256 code units');
  const agentName = options.agentName;
  if (agentName !== undefined && (typeof agentName !== 'string' || !agentName.trim() || agentName.length > 96 || /[\u0000-\u001f\u007f]/.test(agentName))) throw new TypeError('agentName must be a host-given name of at most 96 characters');
  if (options.theme !== undefined && !themeValue(options.theme)) throw new TypeError('Theme must be light, dark or system');
  if (options.save !== undefined && typeof options.save !== 'function') throw new TypeError('save must be a durable storage callback');
  if (options.assets !== undefined && typeof options.assets !== 'function') throw new TypeError('assets must be a picture storage callback');
  if (options.openFile !== undefined && typeof options.openFile !== 'function') throw new TypeError('openFile must choose a File or null');
  if (options.timeout !== undefined && !(Number.isSafeInteger(options.timeout) && options.timeout > 0)) throw new TypeError('timeout is a whole number of milliseconds');
  const bootTimeout = options.timeout ?? 15000;
  const settings = snapshotSettings(options.settings), policy = normalizeSettings(settings), storeAsset = options.assets;
  const unread = reader ? (settings?.features || []).filter(name => !READER_FEATURES.includes(name)) : [];
  if (unread.length) throw Object.assign(new TypeError('The reader has no ' + unread.join(', ') + '; its features are ' + READER_FEATURES.join(', ')), {code: 'settings_feature_unavailable'});
  const assetAnswers = new Map();
  let assetPending = '', assetAbort = new AbortController();
  const chooseFile = options.openFile || (({signal}) => pickDeviceFile(document, signal)), openAnswers = new Map();
  let openPending = null;
  const capabilities = [
    ...(options.load !== undefined ? ['open'] : []), ...(options.save ? ['read'] : []),
    ...(options.save || options.onState ? ['changes'] : []), ...(options.compare ? ['compare'] : []),
    ...(options.onClose ? ['close'] : []), ...(options.agent ? ['agent'] : []), ...(storeAsset ? ['assets'] : []),
  ];
  if (options.agent && (!capabilities.includes('open') || !capabilities.includes('read')))
    throw new TypeError('Agent access needs both load and save');
  const ids = {sessionId, documentId}, answers = new Map(), waiting = new Map(), listeners = new Map();
  let port = null, posted = false, connected = false, ended = false, sawLoad = false, seq = 0, activeSave = null, activeClose = null;
  let currentTheme = options.theme, lastSaved = null, readOnly = false, connectedWait = deferred(), boot, bootTimer = 0, frameFacts = {};
  let held = null;
  const ready = deferred();
  const emit = (type, value) => { for (const fn of listeners.get(type) || []) fn(value); };
  const fail = error => { emit('error', error); options.onError?.(error); };
  const rejectPending = error => {
    for (const job of waiting.values()) job.reject(error);
    waiting.clear(); activeSave?.reject(error); activeSave = null; activeClose?.reject(error); activeClose = null;
  };
  function send(type, payload, baseRevision, quiet = false) {
    if (ended || !connected || !port) return Promise.reject(new Error('The ' + noun + ' connection has ended or is not connected'));
    if (type === 'load') cancelOpen('open_stale');
    const requestId = 'host-' + ++seq;
    const message = {type, ...ids, requestId, ...(baseRevision !== undefined ? {baseRevision} : {}), ...(payload !== undefined ? {payload} : {})};
    const pending = deferred();
    if (!quiet) waiting.set(requestId, pending);
    try { port.postMessage(message); if (quiet) pending.resolve(); }
    catch (error) { waiting.delete(requestId); pending.reject(error); }
    return pending.promise;
  }
  function requestCapture() {
    if (activeSave) activeSave.commandId = 'host-' + (seq + 1);
    send('save', undefined, undefined, true).catch(error => { activeSave?.reject(error); activeSave = null; });
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
          const result = await options.save({...payload, requestId, baseRevision});
          if (!revision(result?.revision) || result.revision === baseRevision || typeof result.revision === 'number' && typeof baseRevision === 'number' && result.revision <= baseRevision)
            throw new TypeError('save must return an advancing durable revision');
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
      lastSaved = reply.payload; held = {revision: reply.payload.revision, content: payload.content, filename: payload.filename};
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
        row = {signature, job: null}; assetAnswers.set(requestId, row); assetPending = requestId;
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
          } finally { if (assetPending === requestId) assetPending = ''; }
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
      const error = refused(payload); connectedWait.reject(error); ready.reject(error); fail(error); return;
    }
    if (type === 'connected') {
      if (connected) return;
      clearTimeout(bootTimer);
      connected = true; frameFacts = {version: typeof payload.appVersion === 'string' ? payload.appVersion : null, contract: payload.contract ?? null};
      connectedWait.resolve(); emit('connected', payload); return;
    }
    if (!connected) return;
    if (type === 'open-request' || type === 'open-cancel') { answerOpen(message, channel); return; }
    if (type === 'asset-request') { answerAsset(message, channel).catch(fail); return; }
    if (type === 'save-request') { answerSave(message, channel).catch(fail); return; }
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
      Promise.resolve().then(() => options.onClose({dirty: !!payload.dirty})).then(decision => {
        if (!['save', 'discard', 'cancel'].includes(decision)) throw new TypeError('Close needs save, discard or cancel');
        if (channel !== port || ended) return;
        channel.postMessage({type: 'close-decision', ...ids, requestId, baseRevision: message.baseRevision, payload: {decision}});
        if (decision === 'cancel') { activeClose?.resolve({cancelled: true}); activeClose = null; }
      }).catch(error => { activeClose?.reject(error); activeClose = null; fail(error); });
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
    boot = connectedWait.promise.then(async () => {
      if (currentStyle) await send('style', currentStyle, undefined, true);
      if (options.load !== undefined) {
        const value = typeof options.load === 'function' ? await options.load() : options.load;
        if (!record(value) || typeof value.content !== 'string' || !revision(value.revision)) throw new TypeError('load needs content and its revision');
        await send('load', value, null);
        held = {revision: value.revision, content: value.content, filename: value.filename};
      }
      ready.resolve(handle);
    });
    boot.catch(error => { ready.reject(error); if (!ended) fail(error); });
  }
  function connect() {
    if (posted || ended) return;
    const channel = new host.MessageChannel();
    port = channel.port1; posted = true;
    port.onmessage = event => onPortMessage(event, channel.port1);
    port.onmessageerror = () => {
      if (channel.port1 !== port || ended) return;
      cancelOpen('open_disconnected'); assetAbort.abort(); rejectPending(new Error('The ' + noun + ' connection was lost'));
    };
    try { iframe.contentWindow.postMessage({type: 'rapier-connect', ...ids, capabilities, contract: 1, ...(settings ? {settings} : {}), ...(agentName ? {agent: {name: agentName}} : {}), ...(currentTheme ? {theme: currentTheme} : {})}, origin, [channel.port2]); }
    catch (error) { port.close(); port = null; posted = false; fail(error); }
  }
  function bootFailed(code, reason) {
    clearTimeout(bootTimer);
    if (connected || ended) return;
    connectedWait.reject(refusal(code, reason));
  }
  const connectTimeoutReason = () => 'The ' + noun + ' did not connect within ' + bootTimeout / 1000 + ' seconds. A page that does not allow this parent (frame-ancestors) is blocked and never connects; the hosted pages allow https, localhost and 127.0.0.1 parents.';
  function onLoad() {
    if (sawLoad && posted) {
      cancelOpen('open_disconnected');
      rejectPending(new Error('The ' + noun + ' reconnected')); port?.close();
      assetAbort.abort(refusal('asset_disconnected')); assetAbort = new AbortController();
      connected = false; posted = false; readOnly = false; connectedWait = deferred(); prepareBoot();
    }
    sawLoad = true;
    clearTimeout(bootTimer);
    if (!connected) bootTimer = setTimeout(() => bootFailed('connect_timeout', connectTimeoutReason()), bootTimeout);
    connect();
  }
  function focusBeside(forward) {
    const order = forward ? host.Node.DOCUMENT_POSITION_FOLLOWING : host.Node.DOCUMENT_POSITION_PRECEDING;
    const controls = [...document.querySelectorAll('a[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable=""],[contenteditable="true"]')]
      .filter(element => element !== iframe && element.tabIndex >= 0 && !element.disabled && !element.closest('[inert]') && element.getClientRects().length &&
        iframe.compareDocumentPosition(element) & order);
    const next = forward ? controls[0] : controls.at(-1);
    if (next) next.focus(); else iframe.blur();
  }
  function onWindowMessage(event) {
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
      await boot;
      if (version === undefined) version = typeof held?.revision === 'number' ? held.revision + 1 : 1;
      const sameDocument = held && (filename === undefined || held.filename === undefined || filename === held.filename);
      if (sameDocument && typeof version === 'number' && typeof held.revision === 'number' && version < held.revision)
        throw Object.assign(new Error('Revision ' + version + ' is older than the frame\'s ' + held.revision), {code: 'revision_stale', currentRevision: held.revision});
      if (sameDocument && version === held.revision && held.content !== null && content !== held.content)
        throw Object.assign(new Error('Revision ' + version + ' already names other content'), {code: 'revision_conflict', currentRevision: held.revision});
      const loaded = await send('load', {content, revision: version, ...(filename !== undefined ? {filename} : {}), ...(readOnly !== undefined ? {readOnly} : {}), ...(title !== undefined ? {title} : {}), ...(baseUrl !== undefined ? {baseUrl} : {})}, null);
      held = {revision: version, content, filename};
      return loaded;
    },
    async save() {
      await boot;
      if (!options.save) throw new Error('No save callback was granted');
      if (ended) throw new Error('The ' + noun + ' connection has ended');
      if (readOnly) throw new Error('The document is read-only');
      if (!activeSave) activeSave = {...deferred(), acknowledged: false, commandId: ''};
      const promise = activeSave.promise;
      requestCapture(); return promise;
    },
    async compare(content, {filename} = {}) { await boot; return send('compare', {content, ...(filename !== undefined ? {filename} : {})}); },
    async close() {
      await boot;
      if (!options.onClose) throw new Error('No close callback was granted');
      if (!activeClose) { activeClose = deferred(); send('close', undefined, undefined, true).catch(error => { activeClose?.reject(error); activeClose = null; }); }
      return activeClose.promise;
    },
    async theme(value) {
      if (!themeValue(value)) throw new TypeError('Theme must be light, dark or system');
      currentTheme = value; await boot; return send('theme', {theme: value}, undefined, true);
    },
    async style(value) {
      if (!reader) throw new TypeError('style restyles the reader build');
      if (!capabilities.includes('open')) throw new TypeError('Reader styling requires load');
      currentStyle = readerStyle(value); await boot; return send('style', currentStyle, undefined, true);
    },
    disconnect() {
      if (ended) return;
      if (connected) send('disconnect', undefined, undefined, true).catch(() => {});
      ended = true; connected = false; clearTimeout(bootTimer);
      cancelOpen('open_disconnected'); openAnswers.clear();
      assetAbort.abort(refusal('asset_disconnected')); assetAnswers.clear();
      const error = new Error('The ' + noun + ' connection has ended');
      rejectPending(error); connectedWait.reject(error); ready.reject(error);
      host.removeEventListener('message', onWindowMessage); iframe.removeEventListener('load', onLoad);
      port?.close(); port = null; listeners.clear();
      if (iframe !== target) iframe.remove();
    },
    on(type, fn) {
      if (typeof fn !== 'function') throw new TypeError('An event listener must be a function');
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
  });
  if (auto) autoLive.set(auto, () => iframe.isConnected && !ended);
  prepareBoot();
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
  bootTimer = setTimeout(() => bootFailed('connect_timeout', connectTimeoutReason()), bootTimeout);
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
    group.view = form.ownerDocument.defaultView; group.view.addEventListener('submit', group.submit, true); forms.set(form, group);
  }
  group.fields.add(field);
  return () => {
    group.fields.delete(field);
    if (!group.fields.size) { group.view.removeEventListener('submit', group.submit, true); forms.delete(form); }
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
    this._media ||= this.ownerDocument.defaultView.matchMedia('(max-width:600px)');
    this._onMedia ||= () => this._layout(); this._media.addEventListener('change', this._onMedia);
    this._bindForm(); this._updateValue(); this._layout(); if (this._panel.open) this._start();
  }
  disconnectedCallback() {
    this._formAuthority++;
    queueMicrotask(() => {
      if (this.isConnected) return;
      this._leaveForm?.(); this._leaveForm = null; this._media?.removeEventListener('change', this._onMedia);
      this._editor?.disconnect(); this._editor = null; this._mount.replaceChildren();
    });
  }
  attributeChangedCallback(name) {
    if (!this._initialized) return;
    if (name === 'disabled') this.formDisabledCallback(this.matches(':disabled'));
    else if (name === 'theme') this._editor?.theme(this.getAttribute('theme') || 'system').catch(error => this._error(error));
    else if (name === 'src') (this._editor?.connected ? this.save() : Promise.resolve()).then(() => this._replace(this._value)).catch(error => this._error(error));
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
  formStateRestoreCallback(state) { if (typeof state === 'string') this._replace(state); }
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
  _updateValue() {
    const File = this.ownerDocument.defaultView.File;
    this._internals.setFormValue(new File([this._value], this._filename(), {type: 'text/markdown'}), this._value);
    this._preview.textContent = this._value || 'Edit document'; this._preview.disabled = this._disabled;
    if (this._fallback) this._fallback.value = this._value;
    const missing = this.required && !this._value && !this._dirty;
    const error = this._customValidity || (missing ? 'Please fill out this field.' : '');
    this._internals.setValidity(error ? (this._customValidity ? {customError: true} : {valueMissing: true}) : {}, error, this._preview);
  }
  _replace(value) {
    this._value = value; this._dirty = false; this._revision = 0; this._generation++;
    this._editor?.disconnect(); this._editor = null; this._mount.replaceChildren(); this._updateValue();
    if (this._initialized && this.isConnected && this._panel.open) this._start();
  }
  _start() {
    if (this._editor) return;
    const generation = this._generation;
    this._editor = Rapier.mount(this._mount, {
      src: this.getAttribute('src') || DEFAULT_SRC, theme: this.getAttribute('theme') || 'system',
      load: {content: this._value, filename: this._filename(), revision: this._revision, readOnly: this._disabled},
      save: ({content, baseRevision}) => {
        if (this._generation !== generation) throw new Error('The form field was replaced');
        if (baseRevision !== this._revision) throw conflict(this._revision);
        this._value = content; this._revision++; this._dirty = false; this._updateValue();
        this.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
        return {revision: this._revision};
      },
      onState: state => { this._dirty = state.dirty; this._updateValue(); },
      onError: error => this._error(error),
    });
    this._mount.inert = this._disabled;
  }
  _layout() {
    const narrow = this._media.matches;
    if (this._narrow === narrow) return;
    this._narrow = narrow;
    if (this._panel.open) this._panel.close();
    if (!narrow) { this._panel.setAttribute('open', ''); this._start(); }
  }
  focus(options) {
    if (this._disabled) return;
    if (this._narrow && !this._panel.open) this._panel.showModal();
    this._start(); this._editor.iframe.focus(options);
  }
  async save() {
    await this._sync;
    if (this._editor && !this._disabled) await this._editor.save();
    return this._value;
  }
  async _finish() {
    try { await this.save(); this._panel.close(); this._preview.focus(); }
    catch (error) { this._error(error); }
  }
  _error(error) { this.dispatchEvent(new CustomEvent('error', {detail: error, bubbles: true, composed: true})); }
}

export function defineRapierEditor(registry = globalThis.customElements) {
  if (!registry || !globalThis.ElementInternals) throw new Error('rapier-editor needs form-associated custom elements');
  if (!registry.get('rapier-editor')) registry.define('rapier-editor', RapierEditor);
  return RapierEditor;
}
