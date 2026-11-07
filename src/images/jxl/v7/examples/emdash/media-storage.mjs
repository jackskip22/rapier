import {header, inspect} from 'rapier-jxl/metadata';
import {readAll} from 'rapier-jxl/storage';
import {digest} from './digest.mjs';

const ACTIVE = Symbol.for('rapier-jxl.emdash.storage');
export function registerStorage(storage, scope) {
  if (typeof scope !== 'string' || !scope.length) throw new TypeError('Native storage requires its configured backend scope.');
  globalThis[ACTIVE] = {storage, scope};
  return storage;
}
export const activeStorage = () => globalThis[ACTIVE]?.storage ?? null;
export const activeStorageScope = () => globalThis[ACTIVE]?.scope ?? null;
export const isJpegKey = key => /\.(?:jpe?g|jpe|jfif)$/i.test(key);
export const hasSidecar = key => /\.(?:jpe?g|jpe|jfif|png|webp|avif)$/i.test(key);
const IMAGE = /\.(?:jpe?g|jpe|jfif|png|webp|avif)$/i;
const HASH = /^[a-f0-9]{64}$/;
const COPY_ID = /^[a-f0-9]{32}$/;
const ROOT = '__rapier_jxl__/';
const OWNER = 'rapier-jxl/emdash';
const MAX_COPY_BYTES = 8 * 1024 * 1024, MAX_RECORD_BYTES = 16 * 1024;
const utf8 = value => new TextEncoder().encode(value);
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const direct = action => action();
const failure = (code, message, cause) => Object.assign(new Error(message, cause === undefined ? undefined : {cause}), {code});
function publicKey(key) {
  if (typeof key !== 'string' || !key || key.includes('\\') || key.includes('\0') ||
      key.split('/').some(part => !part || part === '.' || part === '..') || key.startsWith(ROOT))
    throw failure('JXL_INPUT', 'Expected a media key outside the reserved copy namespace.');
  return key;
}

function meetsFloor(fidelity, floor) {
  if (fidelity === 'exact' || fidelity?.maxError === 0) return true;
  if (floor === 'exact') return false;
  return typeof floor?.quality === 'number' && typeof fidelity?.quality === 'number' && fidelity.quality >= floor.quality;
}

export function withMediaCopies(inner, {maxPixels = 24e6, maxInputBytes = 32 * 1024 * 1024, create} = {}) {
  if (create !== undefined && typeof create !== 'function') throw failure('JXL_OPTIONS', 'create is an atomic create-only function.');
  async function io(action, signal) {
    signal?.throwIfAborted();
    try { const result = await action(); signal?.throwIfAborted(); return result; }
    catch (error) {
      signal?.throwIfAborted();
      if (error?.code === 'NOT_FOUND' || error?.code?.startsWith('JXL_')) throw error;
      throw failure('JXL_INTERNAL', 'Media storage operation failed.', error);
    }
  }
  async function files(prefix, signal, call = direct) {
    const all = [], seen = new Set();
    for (let cursor; ;) {
      const page = await io(() => call(() => inner.list({prefix, limit: 100, signal, ...(cursor ? {cursor} : {})})), signal);
      all.push(...page.files.filter(file => file.key.startsWith(prefix)));
      if (!page.nextCursor) return all;
      if (seen.has(page.nextCursor)) throw failure('JXL_INTERNAL', 'Storage repeated a list cursor.');
      seen.add(page.nextCursor); cursor = page.nextCursor;
    }
  }
  async function read(key, maxBytes, signal, call = direct) {
    let file;
    try { file = await io(() => call(() => inner.download(key, {signal})), signal); }
    catch (error) { if (error?.code === 'NOT_FOUND') return null; throw error; }
    const bytes = await io(() => readAll(file.body, {maxBytes, signal}), signal);
    if (Number.isSafeInteger(file.size) && file.size !== bytes.length)
      throw failure('JXL_INPUT', 'Stored copy length differs from its declared size.');
    return {...file, bytes, size: bytes.length};
  }
  const base = async key => ROOT + await digest(utf8(key)) + '.';
  const versionOf = file => typeof file?.version === 'string' && file.version.length ? digest(utf8(file.version)) : null;
  async function generation(key, {signal, range, call = direct} = {}) {
    publicKey(key); signal?.throwIfAborted();
    let file, failed = false;
    try {
      file = await io(() => call(() => inner.download(key, {signal, ...(range ? {range} : {})})));
      signal?.throwIfAborted();
      if (range && (file?.range?.offset !== range.offset || file.range.length !== range.length))
        throw failure('JXL_UNSUPPORTED', 'The media backend did not honor the requested source range.');
      const version = await versionOf(file);
      if (range && !version) throw failure('JXL_UNSUPPORTED', 'Source ranges require a backend generation.');
      return version;
    } catch (error) {
      failed = true;
      signal?.throwIfAborted();
      if (error?.code === 'NOT_FOUND') return null;
      throw error;
    } finally {
      try { if (typeof file?.body?.cancel === 'function') await io(() => file.body.cancel()); }
      catch (error) { if (!failed) { signal?.throwIfAborted(); throw error; } }
      signal?.throwIfAborted();
    }
  }
  async function snapshot(key, {signal, call = direct} = {}) {
    publicKey(key);
    if (typeof call !== 'function') throw failure('JXL_OPTIONS', 'Source storage calls use a dispatch function.');
    const file = await read(key, maxInputBytes, signal, call);
    if (!file) return null;
    const sha256 = await digest(file.bytes);
    const generation = await versionOf(file);
    signal?.throwIfAborted();
    return {...file, sha256, generation};
  }
  async function readSource(key, offset, length, {generation: expectedGeneration, signal, call = direct} = {}) {
    publicKey(key); signal?.throwIfAborted();
    if (typeof call !== 'function') throw failure('JXL_OPTIONS', 'Source storage calls use a dispatch function.');
    if (typeof expectedGeneration !== 'string' || !HASH.test(expectedGeneration))
      throw failure('JXL_OPTIONS', 'A source range requires its captured backend generation.');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || offset > maxInputBytes - length)
      throw failure('JXL_LIMIT', 'The requested source range exceeds the input byte limit.');
    let file;
    try {
      file = await io(() => call(() => inner.download(key, {range: {offset, length}, signal})));
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(file?.size) || file.size < 1)
        throw failure('JXL_INPUT', 'A source range requires the original object size.');
      if (file.size > maxInputBytes || offset > file.size - length)
        throw failure('JXL_LIMIT', 'The requested source range exceeds the original or input byte limit.');
      if (file.range?.offset !== offset || file.range.length !== length)
        throw failure('JXL_UNSUPPORTED', 'The media backend did not honor the requested source range.');
      const version = await versionOf(file);
      if (!version) throw failure('JXL_UNSUPPORTED', 'Source ranges require a backend generation.');
      if (version !== expectedGeneration) throw failure('JXL_INPUT', 'The stored source generation changed.');
      const bytes = await io(() => readAll(file.body, {maxBytes: length, signal}), signal);
      if (bytes.length !== length) throw failure('JXL_INPUT', 'The source range body has the wrong length.');
      if (await generation(key, {signal, range: {offset: 0, length: 1}, call}) !== expectedGeneration)
        throw failure('JXL_INPUT', 'The stored source generation changed.');
      return bytes;
    } catch (error) {
      signal?.throwIfAborted();
      if (error?.code === 'NOT_FOUND') throw failure('JXL_INPUT', 'The stored source generation changed.');
      throw error;
    } finally {
      try { Promise.resolve(file?.body?.cancel?.(signal?.aborted ? signal.reason : undefined)).catch(() => {}); } catch {}
    }
  }
  const original = file => file?.sha256 ?? null;
  async function record(file, key, prefix, signal, call = direct) {
    if (typeof file?.key !== 'string' || !file.key.startsWith(prefix)) return null;
    const match = /^([a-f0-9]{64})\.(main|w([1-9][0-9]*))\.([a-f0-9]{32})\.([a-f0-9]{64})\.json$/.exec(file.key.slice(prefix.length));
    if (!match) return null;
    let stored, value;
    try {
      stored = await read(file.key, MAX_RECORD_BYTES, signal, call);
      if (!stored) return null;
      value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(stored.bytes));
    } catch (error) {
      signal?.throwIfAborted();
      if (error?.code === 'JXL_INTERNAL') throw error;
      return null;
    }
    const result = value?.result;
    if (value?.owner !== OWNER || value.source !== key || value.generation !== match[1] || value.identity !== match[4] || value.sha256 !== match[5] ||
        !['active', 'retired'].includes(value.state) ||
        !Number.isSafeInteger(value.bytes) || value.bytes < 2 || value.bytes > MAX_COPY_BYTES ||
        result?.format !== 'jxl' || result.fits !== true || !['jpeg-bytes', 'pixels', 'lossy'].includes(result.kept) ||
        !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) ||
        result.width < 1 || result.height < 1 || result.width * result.height > maxPixels ||
        (match[2] === 'main' ? value.kind !== 'sidecar' : value.kind !== 'variant' || result.width !== Number(match[3]))) return null;
    return {...value, width: result.width, height: result.height, key: file.key.slice(0, -5) + '.jxl', recordKey: file.key, recordBytes: stored.bytes, recordSize: stored.size,
      size: value.bytes, lastModified: file.lastModified};
  }
  async function records(key, generation, signal, slot = '', includeRetired = false, call = direct) {
    const prefix = await base(publicKey(key)), result = [];
    for (const file of await files(prefix + (generation ? generation + '.' : '') + (slot ? slot + '.' : ''), signal, call)) {
      const owned = await record(file, key, prefix, signal, call);
      if (owned && (!generation || owned.generation === generation) && (includeRetired || owned.state === 'active')) result.push(owned);
    }
    return result;
  }
  async function payload(owned, signal, call = direct) {
    let file;
    try { file = await read(owned.key, MAX_COPY_BYTES, signal, call); }
    catch (error) { if (['JXL_INPUT', 'JXL_LIMIT'].includes(error?.code) && !signal?.aborted) return null; throw error; }
    if (!file || file.size !== owned.bytes || await digest(file.bytes) !== owned.sha256) return null;
    let info;
    try { info = header(file.bytes); } catch { return null; }
    const rotated = info.orientation >= 5;
    if ((rotated ? info.height : info.width) !== owned.width || (rotated ? info.width : info.height) !== owned.height) return null;
    signal?.throwIfAborted();
    return file.bytes;
  }
  function ownership(owned, state) {
    return {owner: OWNER, source: owned.source, generation: owned.generation, identity: owned.identity,
      sha256: owned.sha256, bytes: owned.bytes, result: owned.result, kind: owned.kind, state};
  }
  const retiredBytes = owned => utf8(JSON.stringify(ownership(owned, 'retired')));
  async function stateOf(owned, signal, call = direct) {
    const file = await read(owned.recordKey, MAX_RECORD_BYTES, signal, call);
    if (!file) return 'absent';
    if (same(file.bytes, retiredBytes(owned))) return 'retired';
    if (same(file.bytes, utf8(JSON.stringify(ownership(owned, 'active'))))) return 'active';
    return 'changed';
  }
  async function retireRecord(owned, signal, call = direct) {
    const state = await stateOf(owned, signal, call);
    if (state === 'changed') return false;
    if (state !== 'retired') {
      let uncertain;
      try { await io(() => call(() => inner.upload({key: owned.recordKey, body: retiredBytes(owned),
        contentType: 'application/json', signal}))); }
      catch (error) { uncertain = error; }
      if (uncertain) {
        let observed;
        try { observed = await stateOf(owned, signal, call); }
        catch { throw uncertain; }
        if (observed !== 'retired') throw uncertain;
      }
    }
    return true;
  }
  async function remove(owned, signal, call = direct) {
    if (!await retireRecord(owned, signal, call)) return false;
    let file;
    try { file = await read(owned.key, MAX_COPY_BYTES, signal, call); }
    catch (error) { if (['JXL_INPUT', 'JXL_LIMIT'].includes(error?.code) && !signal?.aborted) return true; throw error; }
    if (!file || file.size !== owned.bytes || await digest(file.bytes) !== owned.sha256) return true;
    let uncertain;
    try { await io(() => call(() => inner.delete(owned.key, {signal})), signal); }
    catch (error) { uncertain = error; }
    if (uncertain && await read(owned.key, MAX_COPY_BYTES, signal, call)) throw uncertain;
    return true;
  }
  async function deliver(owned, bytes, signal, call = direct) {
    let state, created, uncertain;
    try { created = await io(() => call(() => create(owned.key, bytes, {contentType: 'image/jxl', signal}))); }
    catch (error) { uncertain = error; }
    signal?.throwIfAborted();
    if (created !== true) {
      state = await stateOf(owned, signal, call);
      if (state === 'retired' || state === 'changed') return state;
      if (!await payload(owned, signal, call)) {
        if (uncertain) throw uncertain;
        return 'changed';
      }
      if (state === 'active') return 'active';
    }
    uncertain = undefined; created = undefined;
    try { created = await io(() => call(() => create(owned.recordKey, owned.recordBytes,
      {contentType: 'application/json', signal}))); }
    catch (error) { uncertain = error; }
    signal?.throwIfAborted();
    if (created === true) return 'active';
    state = await stateOf(owned, signal, call);
    if (state === 'absent' && uncertain) throw uncertain;
    return state;
  }
  async function dropGeneration(key, previous, signal) {
    if (previous) for (const owned of await records(key, previous, signal, '', true)) await remove(owned, signal);
  }
  async function current(key, {signal} = {}) {
    try {
      const value = await generation(key, {signal});
      return value ? records(key, value, signal) : [];
    } catch (error) { if (error?.code === 'JXL_LIMIT' && !signal?.aborted) return []; throw error; }
  }
  async function attach(key, result, {source, expectedGeneration, signal, replace = false, jobIdentity, floor, call = direct} = {}, variant) {
    publicKey(key);
    const {width, height} = result ?? {};
    const refused = reason => ({key, ...(variant ? {width} : {}), stored: null, reason});
    signal?.throwIfAborted();
    if (typeof call !== 'function') throw failure('JXL_OPTIONS', 'Publication storage calls use a dispatch function.');
    if (!IMAGE.test(key) || (!variant && !hasSidecar(key))) return refused('not_image_key');
    if (!HASH.test(source ?? '')) return refused('source_required');
    if (expectedGeneration !== undefined && !HASH.test(expectedGeneration))
      throw failure('JXL_OPTIONS', 'Expected source generation is a captured backend version digest.');
    if (jobIdentity !== undefined && (typeof jobIdentity !== 'string' || !COPY_ID.test(jobIdentity) || expectedGeneration === undefined))
      throw failure('JXL_OPTIONS', 'A durable rendition needs its 32-character server identity and captured source generation.');
    if (typeof replace !== 'boolean') throw failure('JXL_OPTIONS', 'replace is an explicit boolean.');
    if (result?.fits !== true) return refused(result?.reason?.code ?? 'JXL_TARGET');
    if (result.format !== 'jxl' || !['jpeg-bytes', 'pixels', 'lossy'].includes(result.kept)) return refused('JXL_INPUT');
    const value = result.bytes;
    if (!(value instanceof Uint8Array) || value.byteLength < 2 || value.byteLength > MAX_COPY_BYTES) return refused('not_jxl');
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > maxPixels)
      return refused('dimensions_differ');
    const bytes = value.slice(), {bytes: ignored, ...metadata} = result;
    const savedResult = structuredClone(metadata);
    let info;
    try { info = await inspect(bytes, {details: ['layout'], maxInputBytes: MAX_COPY_BYTES, maxPixels, maxBoxes: 4096}); }
    catch { signal?.throwIfAborted(); return refused('not_jxl'); }
    const rotated = info.orientation >= 5;
    if ((rotated ? info.height : info.width) !== width || (rotated ? info.width : info.height) !== height)
      return refused('dimensions_differ');
    signal?.throwIfAborted();
    const before = await snapshot(key, {signal, call});
    if (original(before) !== source || expectedGeneration !== undefined && before.generation !== expectedGeneration)
      return refused('key_changed');
    if (!create || !before.generation) return refused('conditional_write_required');
    if (floor !== undefined && !meetsFloor(savedResult.fidelity, floor)) return refused('JXL_TARGET');
    let receipt;
    try { receipt = await (await import('rapier-jxl/verify')).verify(before.bytes.slice(), {...savedResult, bytes}, {maxPixels, signal}); }
    catch (error) { signal?.throwIfAborted(); if (replace || !error?.verification) throw error; receipt = error.verification; }
    if (receipt?.verified !== true) {
      if (replace) throw failure('JXL_INPUT', 'Rendition replacement was not verified.');
      return refused('not_verified');
    }
    const slot = variant ? `w${width}` : 'main', previous = replace ? await records(key, before.generation, signal, slot, false, call) : [];
    const identity = jobIdentity ?? crypto.randomUUID().replaceAll('-', '');
    if (!COPY_ID.test(identity)) throw failure('JXL_INTERNAL', 'Invalid server copy identity.');
    const sha256 = await digest(bytes), prefix = await base(key), stem =
      `${prefix}${before.generation}.${slot}.${identity}.${sha256}`;
    const copyKey = stem + '.jxl', recordKey = stem + '.json';
    const valueRecord = {owner: OWNER, source: key, generation: before.generation, identity, sha256, bytes: bytes.length,
      result: savedResult, kind: variant ? 'variant' : 'sidecar', state: 'active'};
    const recordBytes = utf8(JSON.stringify(valueRecord));
    if (recordBytes.length + 1 > MAX_RECORD_BYTES) throw failure('JXL_LIMIT', 'Media ownership record exceeds its byte limit.');
    const owned = {...valueRecord, width, height, key: copyKey, recordKey, recordBytes, recordSize: recordBytes.length, size: bytes.length};
    let kept = false, retire = jobIdentity === undefined, answer;
    try {
      const state = await deliver(owned, bytes, signal, call);
      if (state !== 'active') { retire = true; answer = refused(state === 'retired' ? 'copy_retired' : 'copy_exists'); }
      else if (await generation(key, {signal, call}) !== before.generation) { retire = true; answer = refused('key_changed'); }
      else {
        kept = true;
        for (const prior of previous) if (prior.key !== copyKey) await remove(prior, signal, call);
        answer = {key, ...(variant ? {width} : {}), stored: variant ? 'variant' : 'sidecar', reason: null,
          jxlBytes: bytes.length, result: savedResult, ...(replace && receipt ? {receipt} : {})};
      }
    } finally {
      if (!kept && retire) {
        try {
          if (jobIdentity === undefined) await remove(owned, undefined, call);
          else if (await retireRecord(owned, undefined, call) && answer) answer.collect = collectable(owned);
        } catch (error) { signal?.throwIfAborted(); throw error; }
      }
    }
    return answer;
  }
  const collectable = ({source, generation, identity, sha256, bytes, result, kind, key, recordKey}) =>
    ({source, generation, identity, sha256, bytes, result, kind, key, recordKey});
  async function collect(copy, {signal, call = direct} = {}) {
    if (typeof call !== 'function') throw failure('JXL_OPTIONS', 'Publication storage calls use a dispatch function.');
    const prefix = typeof copy?.source === 'string' && IMAGE.test(copy.source) ? await base(copy.source) : null;
    if (!prefix || !HASH.test(copy.generation ?? '') || !COPY_ID.test(copy.identity ?? '') || !HASH.test(copy.sha256 ?? '') ||
        !['sidecar', 'variant'].includes(copy.kind) || !Number.isSafeInteger(copy.bytes) || typeof copy.key !== 'string' ||
        !copy.key.startsWith(prefix + copy.generation + '.') || !copy.key.endsWith(`.${copy.identity}.${copy.sha256}.jxl`) ||
        copy.recordKey !== copy.key.slice(0, -4) + '.json')
      throw failure('JXL_INPUT', 'Expected a retired copy named by attach.');
    return remove({...copy, owner: OWNER}, signal, call);
  }

  const extra = {
    maxPixels,
    readSource,
    fingerprint: async (key, {signal} = {}) => original(await snapshot(key, {signal})),
    async sourceSnapshot(key, options) {
      const file = await snapshot(key, options);
      if (!file) return null;
      if (!file.generation) throw failure('JXL_INPUT', 'A durable image source requires a backend generation.');
      return {bytes: file.bytes, contentType: file.contentType,
        source: {generation: file.generation, sha256: file.sha256, byteLength: file.bytes.length}};
    },
    currentCopies: current,
    async upload(options) {
      publicKey(options.key);
      const before = IMAGE.test(options.key) ? await generation(options.key, {signal: options.signal}) : null;
      const result = await inner.upload(options);
      await dropGeneration(options.key, before, options.signal);
      return result;
    },
    async delete(key, options) {
      publicKey(key);
      const before = IMAGE.test(key) ? await generation(key, options) : null;
      const result = await inner.delete(key, options);
      await dropGeneration(key, before, options?.signal);
      return result;
    },
    download(key, options) { return inner.download(publicKey(key), options); },
    getPublicUrl(key) { return inner.getPublicUrl(publicKey(key)); },
    stored(key, {signal} = {}) { return read(publicKey(key), maxInputBytes, signal); },
    exists(key, options) { return typeof key === 'string' && key.startsWith(ROOT) ? Promise.resolve(false) : inner.exists(publicKey(key), options); },
    async list(options) {
      const page = await inner.list(options);
      return {...page, files: page.files.filter(file => !file.key.startsWith(ROOT))};
    },
    async family(key, {signal} = {}) {
      publicKey(key);
      if (IMAGE.test(key)) await generation(key, {signal});
      const originals = (await files(key, signal)).filter(file => file.key === key), owned = await records(key, null, signal, '', true);
      const listing = new Map((await files(await base(key), signal)).map(file => [file.key, file]));
      const all = [...originals];
      const revisionKey = await base(key) + 'revision.json';
      if (listing.has(revisionKey)) {
        let revision;
        try {
          const stored = await read(revisionKey, MAX_RECORD_BYTES, signal);
          const value = stored && JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(stored.bytes));
          if (value?.owner === OWNER && value.kind === 'revision' && value.source === key &&
              /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.version) &&
              (value.stat === null || Array.isArray(value.stat) && value.stat.length === 6 && value.stat.every(v => typeof v === 'string' && /^-?\d+$/.test(v))))
            revision = {key: revisionKey, size: stored.size};
        } catch (error) {
          signal?.throwIfAborted();
          if (error?.code === 'JXL_INTERNAL') throw error;
        }
        if (revision) all.push(revision);
      }
      for (const item of owned) {
        all.push({key: item.recordKey, size: item.recordSize});
        if (listing.has(item.key)) all.push(listing.get(item.key));
      }
      return all;
    },
    attach: (key, result, options) => attach(key, result, options, false),
    collect,
    attachVariant(key, width, result, options) {
      if (!Number.isSafeInteger(width) || width < 16)
        return Promise.resolve({key, width, stored: null, reason: 'width'});
      if (result?.width !== width)
        return Promise.resolve({key, width, stored: null, reason: 'dimensions_differ'});
      return attach(key, result, options, true);
    },
    async sidecar(key, {signal} = {}) {
      if (!hasSidecar(key)) return null;
      for (const file of (await current(key, {signal})).filter(file => file.kind === 'sidecar').sort((a, b) => a.size - b.size)) {
        const bytes = await extra.readVariant(file, {signal});
        if (bytes) return {...file.result, bytes};
      }
      return null;
    },
    async variants(key, options) {
      const chosen = new Map();
      for (const file of await current(key, options)) if (file.kind === 'variant' && (!chosen.has(file.width) || chosen.get(file.width).size > file.size)) chosen.set(file.width, file);
      return [...chosen.values()].sort((a, b) => a.width - b.width);
    },
    async readVariant(file, {signal} = {}) {
      if (!file || typeof file.source !== 'string') return null;
      const prefix = await base(file.source), latest = await record({key: file.recordKey ?? ''}, file.source, prefix, signal);
      if (!latest || latest.state !== 'active' || latest.key !== file.key || latest.generation !== await generation(file.source, {signal})) return null;
      const bytes = await payload(latest, signal);
      if (await generation(file.source, {signal}) !== latest.generation) return null;
      return bytes;
    }
  };
  return new Proxy(inner, {get(target, key) {
    if (Object.hasOwn(extra, key)) return extra[key];
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
}
