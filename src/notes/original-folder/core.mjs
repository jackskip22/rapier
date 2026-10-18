const MAX_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();
export const fail = code => Object.assign(new Error(code), {code});
const check = signal => { if (signal?.aborted) throw fail('cancelled'); };
function pending(work, signal, discard) {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    let ended = false;
    const abort = () => { if (!ended) { ended = true; reject(fail('cancelled')); } };
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
    Promise.resolve(work).then(value => {
      signal.removeEventListener('abort', abort);
      if (ended) { Promise.resolve(discard?.(value)).catch(() => {}); return; }
      ended = true; resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!ended) { ended = true; reject(error); }
    });
  });
}
const scalar = text => typeof text === 'string' && !/[\0\ud800-\udfff]/u.test(text);
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function decode(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) throw fail('too_large');
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
  catch { throw fail('invalid_utf8'); }
  const bom = bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191;
  if (bom) text = text.slice(1);
  if (!scalar(text)) throw fail('invalid_text');
  return Object.freeze({text, bom, admittedBytes: bytes.length - (bom ? 3 : 0)});
}

export function encode(text, bom = false) {
  if (!scalar(text) || typeof bom !== 'boolean') throw fail('invalid_text');
  const bytes = encoder.encode((bom ? '\ufeff' : '') + text);
  if (bytes.length > MAX_BYTES) throw fail('too_large');
  return bytes;
}

export async function generation(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'sha256:' + [...digest].map(v => v.toString(16).padStart(2, '0')).join('') + ':' + bytes.length;
}

function segments(path) {
  if (typeof path !== 'string' || path.length > 8192 || path.startsWith('/') ||
      path.includes('\\') || /[\0\ud800-\udfff]/u.test(path)) throw fail('invalid_path');
  if (!path) return [];
  const parts = path.split('/');
  if (parts.length > 64 || parts.some(p => !p || p === '.' || p === '..' || encoder.encode(p).length > 255))
    throw fail('invalid_path');
  return parts;
}

export function relativeResource(documentPath, authoredURL) {
  const base = segments(documentPath).slice(0, -1);
  if (typeof authoredURL !== 'string' || !authoredURL || authoredURL.length > 8192 ||
      authoredURL !== authoredURL.trim() || /[\u0000-\u0020\u007f\\]/.test(authoredURL) ||
      authoredURL.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(authoredURL)) throw fail('invalid_url');
  const hash = authoredURL.indexOf('#'), raw = hash < 0 ? authoredURL : authoredURL.slice(0, hash);
  if (!raw || raw.includes('?')) throw fail('invalid_url');
  for (const part of raw.split('/')) {
    if (!part) throw fail('invalid_url');
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { throw fail('invalid_url'); }
    if (!scalar(decoded) || /[%/\\:\u0000-\u001f\u007f]/.test(decoded) ||
        ((decoded === '.' || decoded === '..') && decoded !== part)) throw fail('encoded_escape');
    if (decoded === '.') continue;
    if (decoded === '..') { if (!base.length) throw fail('escape_refused'); base.pop(); }
    else base.push(decoded);
  }
  const path = base.join('/');
  segments(path);
  return Object.freeze({path, authoredURL});
}

function rasterMime(bytes) {
  if (bytes.length >= 8 && equal(bytes.subarray(0, 8), Uint8Array.of(137,80,78,71,13,10,26,10))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const ascii = (a, b) => String.fromCharCode(...bytes.subarray(a, b));
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 10) return 'image/jxl';
  if (bytes.length >= 12 && equal(bytes.subarray(0,12), Uint8Array.of(0,0,0,12,74,88,76,32,13,10,135,10))) return 'image/jxl';
  throw fail('active_or_unsupported_resource');
}

export class Folder {
  #provider; #entries = new WeakMap(); #snapshots = new WeakMap(); #retired = new WeakMap(); #live = new Set();
  #urls = new Map(); #active = true; #cancel = new AbortController();
  #url; #epoch = 1; #resources = 0;
  #sourceBytes = 0; #sourceReserved = 0; #resourceReserved = 0;
  #saveReserved = 0;
  #listing = null;
  constructor(provider, {url = URL} = {}) {
    this.#provider = provider;
    this.#url = url;
    this.capabilities = Object.freeze({...provider.capabilities});
    this.root = this.#entry(provider.root);
    Object.freeze(this);
  }
  #current(signal) {
    check(signal);
    if (!this.#active) throw fail('revoked');
  }
  #signal(signal) { return signal ? AbortSignal.any([signal, this.#cancel.signal]) : this.#cancel.signal; }
  #entry(row) {
    const entry = Object.freeze({name: row.name, kind: row.kind, displayPath: row.displayPath});
    this.#entries.set(entry, row);
    return entry;
  }
  #row(entry) {
    const row = this.#entries.get(entry);
    if (!row) throw fail('stale_locator');
    return row;
  }
  async #releaseRows(rows) {
    try { await this.#provider.release(rows); }
    catch (error) {
      if (!this.#active) return;
      await this.revoke();
      throw error;
    }
  }
  async lookup(path, {signal} = {}) {
    this.#current(signal); segments(path);
    const row = await this.#provider.lookup(path);
    try { this.#current(signal); return this.#entry(row); }
    catch (error) { await this.#releaseRows([row]); throw error; }
  }
  async release(entry) {
    const row = this.#entries.get(entry);
    if (!row || entry === this.root) return;
    this.#entries.delete(entry);
    await this.#releaseRows([row]);
  }
  async retain(entry, {signal} = {}) {
    this.#current(signal);
    const row = await this.#provider.retain(this.#row(entry));
    try { this.#current(signal); return this.#entry(row); }
    catch (error) { await this.#releaseRows([row]); throw error; }
  }
  list(directory = this.root, {limit = 64, signal} = {}) {
    this.#listing?.abort();
    const cancel = this.#listing = new AbortController();
    const lifetime = AbortSignal.any([cancel.signal, this.#signal(signal)]);
    const iterator = this.#list(directory, {limit, signal: lifetime});
    return Object.freeze({
      [Symbol.asyncIterator]() { return this; },
      next: value => iterator.next(value),
      return: async () => { cancel.abort(); await iterator.return(); return {done: true, value: undefined}; },
      throw: async error => { cancel.abort(); return iterator.throw(error); },
    });
  }
  async *#list(directory, {limit, signal}) {
    this.#current(signal);
    if (!Number.isInteger(limit) || limit < 1 || limit > 128) throw fail('invalid_limit');
    const row = this.#row(directory), lifetime = this.#signal(signal);
    let cursor = null, held = null, closing = Promise.resolve(), cancelled = Promise.resolve();
    const dropPage = () => {
      const page = held; held = null;
      if (!page) return Promise.resolve();
      for (const entry of page.entries) this.#entries.delete(entry);
      return this.#releaseRows(page.rows);
    };
    const closeCursor = () => {
      const id = cursor; cursor = null;
      if (id === null) return closing;
      closing = this.#provider.listClose(id).catch(error => { if (this.#active) throw error; });
      return closing;
    };
    const abort = () => {
      cancelled = Promise.all([dropPage(), closeCursor()]).catch(() => this.revoke());
    };
    lifetime.addEventListener('abort', abort, {once: true});
    try {
      this.#current(lifetime);
      cursor = await pending(this.#provider.listStart(row), lifetime,
        id => this.#provider.listClose(id).catch(() => this.revoke()));
      this.#current(lifetime);
      while (true) {
        this.#current(lifetime);
        const page = await pending(this.#provider.listNext(cursor, limit), lifetime,
          page => this.#releaseRows(page.entries));
        const entries = page.entries.map(row => this.#entry(row));
        held = {entries, rows: page.entries};
        try {
          this.#current(lifetime);
          yield Object.freeze({entries: Object.freeze(entries), complete: page.done, skipped: page.skipped || 0});
        } finally { await dropPage(); }
        if (page.done) return;
      }
    } finally {
      lifetime.removeEventListener('abort', abort);
      try { await Promise.all([dropPage(), closeCursor(), cancelled]); }
      catch (error) { await this.revoke(); throw error; }
    }
  }
  async open(entry, {signal} = {}) {
    this.#current(signal);
    if (!this.capabilities.checkedSave) {
      if (!this.capabilities.pinnedIdentity || !this.capabilities.confinedRead) throw fail('identity_or_confinement_unproven');
      if (!this.capabilities.coherentRead) throw fail('coherent_snapshot_unavailable');
    }
    if (entry.kind !== 'file' || !/\.md$/i.test(entry.name)) throw fail('not_markdown');
    const row = await this.#provider.retain(this.#row(entry));
    let reserved = 0;
    try {
      this.#current(signal);
      if (!Number.isSafeInteger(row.size) || row.size < 0 || row.size > MAX_BYTES) throw fail('too_large');
      if (this.#sourceBytes + this.#sourceReserved + row.size > MAX_BYTES) throw fail('source_limit');
      reserved = row.size; this.#sourceReserved += reserved;
      const metadata = await this.#provider.validate(row);
      const bytes = await this.#provider.read(row, {signal: this.#signal(signal), maxBytes: reserved});
      const after = await this.#provider.validate(row);
      if (metadata.size !== after.size || metadata.version !== after.version) throw fail('changed_during_read');
      this.#current(signal);
      const record = decode(bytes), observedGeneration = await generation(bytes);
      this.#current(signal);
      const snapshot = Object.freeze({...record, name: entry.name, displayPath: entry.displayPath,
        observedGeneration, capabilities: this.capabilities,
        encode: text => encode(text, record.bom)});
      this.#snapshots.set(snapshot, {row, bytes, metadata, epoch: this.#epoch, cancel: new AbortController(), saving: Promise.resolve()});
      this.#sourceBytes += bytes.length; this.#live.add(snapshot);
      return snapshot;
    } catch (error) { await this.#releaseRows([row]); throw error; }
    finally { this.#sourceReserved -= reserved; }
  }
  #state(snapshot) {
    if (this.#retired.has(snapshot)) throw fail(this.#retired.get(snapshot));
    const state = this.#snapshots.get(snapshot);
    if (!state || !this.#live.has(snapshot) || state.epoch !== this.#epoch) throw fail('stale_source');
    return state;
  }
  assertCurrent(snapshot) { this.#current(); this.#state(snapshot); return true; }
  async #retire(snapshot, error) {
    this.#retired.set(snapshot, error.code || 'original_unavailable');
    await this.closeDocument(snapshot);
    throw error;
  }
  async #validateSource(snapshot) {
    const state = this.#state(snapshot);
    if (state.conflicted) throw fail('external_file_changed');
    try { return await this.#provider.validate(state.row); }
    catch (error) { return this.#retire(snapshot, error); }
  }
  async readCurrent(snapshot, {signal} = {}) {
    this.#current(signal);
    const state = this.#state(snapshot);
    await this.#validateSource(snapshot);
    const bytes = await this.#provider.read(state.row, {
      signal: AbortSignal.any([this.#signal(signal), state.cancel.signal]), maxBytes: MAX_BYTES});
    this.#current(signal); this.#state(snapshot);
    return bytes;
  }
  async revalidate(snapshot, options) {
    const current = await this.readCurrent(snapshot, options);
    if (!equal(current, this.#state(snapshot).bytes)) return this.#retire(snapshot, fail('external_file_changed'));
    return true;
  }
  async save(snapshot, text, {signal} = {}) {
    const intended = snapshot.encode(text);
    return this.saveBytes(snapshot, intended, {signal});
  }
  async saveBytes(snapshot, intended, {signal} = {}) {
    decode(intended);
    this.#current(signal);
    const state = this.#state(snapshot);
    if (this.#saveReserved + intended.length > MAX_BYTES) throw fail('write_limit');
    intended = intended.slice();
    this.#saveReserved += intended.length;
    const saving = state.saving.then(async () => {
      this.#current(signal); this.#state(snapshot);
      const growth = Math.max(0, intended.length - state.bytes.length);
      if (this.#sourceBytes + this.#sourceReserved + growth > MAX_BYTES) throw fail('source_limit');
      this.#sourceReserved += growth;
      let saveRow, resultRow;
      try {
      if (!this.#provider.save) throw fail('checked_save_unavailable');
      saveRow = await this.#provider.retain(state.row, {forSave: true});
      this.#current(signal); this.#state(snapshot);
      const result = await this.#provider.save(saveRow, intended, {
        ...state.metadata, digest: (await generation(state.bytes)).split(':')[1]},
        {signal: AbortSignal.any([this.#signal(signal), state.cancel.signal])});
      resultRow = result.row;
      this.#current(signal); this.#state(snapshot);
      if (result.status === 'kept-both') {
        state.conflicted = true;
        for (const [url, info] of this.#urls) if (info.snapshot === snapshot) this.#revoke(url);
        return Object.freeze({status: 'retained-draft', confirmed: false, verified: false, writes: 1,
          originalPreserved: true, copyVerified: true, destinationName: result.destinationName,
          reason: 'external_file_changed', recoveryChoices: Object.freeze(['keep-editing', 'save-copy', 'reopen-original'])});
      }
      if (!['saved', 'unchanged'].includes(result.status)) throw fail('write_unverified');
      if (result.row && result.row !== state.row) {
        const old = state.row; state.row = result.row; resultRow = null; await this.#releaseRows([old]);
      }
      this.#sourceBytes += intended.length - state.bytes.length;
      state.bytes = intended; state.metadata = result.metadata; state.conflicted = false;
      return Object.freeze({status: result.status, confirmed: true, verified: true,
        writes: result.status === 'saved' ? 1 : 0, destinationName: snapshot.name});
      } finally {
        this.#sourceReserved -= growth;
        const rows = [...new Set([saveRow, resultRow].filter(Boolean))];
        if (rows.length) await this.#releaseRows(rows);
      }
    });
    state.saving = saving.catch(() => {});
    return saving.finally(() => { this.#saveReserved -= intended.length; });
  }
  async openRelative(snapshot, authoredURL, {signal} = {}) {
    this.#current(signal);
    const source = this.#state(snapshot);
    const projection = relativeResource(snapshot.displayPath, authoredURL);
    if (!this.capabilities.parentAnchored || !this.#provider.relative) throw fail('parent_anchor_unavailable');
    const row = await this.#provider.relative(source.row, projection.path);
    const entry = this.#entry(row);
    let opened;
    try {
      opened = await this.open(entry, {signal});
      await this.#validateSource(snapshot);
      this.#current(signal); this.#state(snapshot);
      return opened;
    } catch (error) {
      if (opened) await this.closeDocument(opened);
      throw error;
    } finally { await this.release(entry); }
  }
  async resource(snapshot, authoredURL, {signal, maxBytes = 16 * 1024 * 1024} = {}) {
    this.#current(signal);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 16 * 1024 * 1024) throw fail('too_large');
    const sourceState = this.#state(snapshot);
    const projection = relativeResource(snapshot.displayPath, authoredURL);
    if (this.#urls.size >= 32 || this.#resources + this.#resourceReserved + maxBytes > 32 * 1024 * 1024)
      throw fail('resource_limit');
    this.#resourceReserved += maxBytes;
    try {
      await this.#validateSource(snapshot);
      this.#current(signal); this.#state(snapshot);
      if (!this.capabilities.parentAnchored || !this.#provider.relative) throw fail('parent_anchor_unavailable');
      const row = await this.#provider.relative(sourceState.row, projection.path);
      let bytes;
      try {
        if (row.kind !== 'file') throw fail('not_file');
        bytes = await this.#provider.read(row, {
          signal: AbortSignal.any([this.#signal(signal), sourceState.cancel.signal]), maxBytes});
        this.#current(signal); this.#state(snapshot);
        await this.#validateSource(snapshot);
        await this.#provider.validate(row);
      } finally { await this.#releaseRows([row]); }
      this.#current(signal); this.#state(snapshot);
      const mime = rasterMime(bytes);
      if (this.#urls.size >= 32) throw fail('resource_limit');
      const blob = new Blob([bytes], {type: mime});
      const url = this.#url.createObjectURL(blob);
      this.#urls.set(url, {snapshot, bytes: bytes.length}); this.#resources += bytes.length;
      return Object.freeze({authoredURL, url, blob, mime, bytes: bytes.length, dispose: () => this.#revoke(url)});
    } finally { this.#resourceReserved -= maxBytes; }
  }
  #revoke(url) {
    const info = this.#urls.get(url);
    if (!info) return;
    this.#url.revokeObjectURL(url); this.#urls.delete(url); this.#resources -= info.bytes;
  }
  async closeDocument(snapshot) {
    const state = this.#snapshots.get(snapshot);
    if (!state || !this.#live.delete(snapshot)) return;
    state.cancel.abort(); this.#sourceBytes -= state.bytes.length;
    for (const [url, info] of this.#urls) if (info.snapshot === snapshot) this.#revoke(url);
    this.#snapshots.delete(snapshot);
    await this.#releaseRows([state.row]);
  }
  retained() {
    let sourceBytes = 0, textCodeUnits = 0;
    for (const snapshot of this.#live) {
      sourceBytes += this.#state(snapshot).bytes.length; textCodeUnits += snapshot.text.length;
    }
    return Object.freeze({sourceBytes, textCodeUnits, resourceBytes: this.#resources, resourceURLs: this.#urls.size,
      openDocuments: this.#live.size, pendingSourceBytes: this.#sourceReserved, pendingWriteBytes: this.#saveReserved, pendingResourceBytes: this.#resourceReserved});
  }
  async revoke() {
    if (!this.#active) return;
    this.#active = false; this.#epoch++; this.#cancel.abort();
    for (const url of this.#urls.keys()) this.#revoke(url);
    this.#sourceBytes = 0; this.#live.clear(); this.#snapshots = new WeakMap(); this.#entries = new WeakMap();
    await this.#provider.close();
  }
}

