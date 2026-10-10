// SPDX-License-Identifier: MIT
// The host's optional policy, file picker and picture exchange. No storage, network or editor authority.
export const FEATURES = Object.freeze(['draw', 'paint', 'notes', 'readAloud', 'share', 'find']);
export const LIMITS = Object.freeze({documentBytes: 25 * 1024 * 1024, pictureBytes: 16 * 1024 * 1024});
export const ASSET_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/jxl', 'image/svg+xml']);
const ACCENTS = Object.freeze(['Teal', 'Blue', 'Amber', 'Green', 'Red', 'Purple', 'Pink', 'Gray']);
export const refusal = (code, reason = code) => Object.assign(new Error(reason), {code});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
const only = (value, keys) => Object.keys(value).every(key => keys.includes(key));

export function normalizeSettings(value = {}, {features = FEATURES, accents = ACCENTS, languages = ['en'], limits = LIMITS} = {}) {
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

// Take only the fields the host offered: absent features still mean whatever that build carries.
export function snapshotSettings(value) {
  if (value === undefined) return undefined;
  const accepted = normalizeSettings(value);
  return Object.freeze(Object.fromEntries(Object.keys(value).map(key => [key, accepted[key]])));
}

// Each picker owns its input. Cancelling it cannot give a later request its file.
export function pickDeviceFile(document, signal) {
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

// One picker ticket binds selected bytes to the frame and document that requested them.
export function createFilePicker({document, refusal: reason, snapshot, current: unchanged, settle, post, open, notify, error}) {
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

export function assetURL(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\s\u0000-\u001f\u007f<>\\]/u.test(value))
    throw refusal('asset_url_invalid');
  let url;
  try { url = new URL(value); } catch (_) { throw refusal('asset_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4096) throw refusal('asset_url_invalid');
  return url.href;
}

export function assetBytes(value, limit = LIMITS.pictureBytes) {
  if (!(value instanceof Uint8Array) || !value.byteLength) throw refusal('asset_bytes_invalid');
  if (value.byteLength > Math.min(limit, LIMITS.pictureBytes)) throw refusal('picture_too_large');
  return value;
}
export async function bytesHash(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export function externalImage(raw, asset, url) {
  if (!url) return raw;
  const token = '[' + asset.label + ']', at = raw.lastIndexOf(token);
  if (at < 0) throw refusal('asset_reference_invalid');
  const title = asset.title ? ' "' + String(asset.title).replace(/&/g, '&amp;').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"' : '';
  return raw.slice(0, at) + '(<' + assetURL(url).replace(/&/g, '&amp;') + '>' + title + ')' + raw.slice(at + token.length);
}

// At most one upload is in flight. A failure returns the embedded form, never a deletion.
// Retained local pictures are bounded separately from the host's (possibly tiny) document limit.
export function createAssetBroker({current, send}) {
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
    if (retained.size >= 1024 || retainedBytes + bytes.byteLength > LIMITS.documentBytes) return {code: 'asset_cache_full'};
    // Keep our own bytes: postMessage clones them, never transfers/detaches the kept picture.
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
