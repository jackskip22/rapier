// SPDX-License-Identifier: AGPL-3.0-only
import {crc32} from './crc32.mjs';
export {crc32};

export const ARCHIVE_LIMITS = Object.freeze({bytes: 25 * 1024 * 1024, entries: 1024, nameBytes: 1024, metadataBytes: 65536});
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const exactDecoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const IO_BYTES = 65536;

export function createImportWork({signal, checkCurrent = () => {}, onProgress} = {}) {
  let began = performance.now();
  const check = () => {
    if (signal?.aborted) throw archiveAbort(signal);
    checkCurrent();
  };
  return Object.freeze({signal, onProgress, check, async checkpoint(force = false) {
    check();
    if (force || performance.now() - began >= 8) {
      if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
      else await new Promise(resolve => setTimeout(resolve, 0));
      check();
      began = performance.now();
    }
  }});
}

function fail(reason) { throw new Error(reason); }
function archiveAbort(signal) {
  return signal.reason instanceof Error ? signal.reason : Object.assign(new Error('The operation was cancelled.'), {name: 'AbortError', code: 'cancelled'});
}
function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return fail('archive_bytes_invalid');
}

function pathName(name) {
  if (typeof name !== 'string' || !name || name.length > ARCHIVE_LIMITS.nameBytes ||
      /^[\/]/.test(name) || /[\\:\u0000-\u001f\u007f]/.test(name) || /%(?:00|2e|2f|5c)/i.test(name)) return fail('archive_path_invalid');
  const directory = name.endsWith('/'), path = directory ? name.slice(0, -1) : name;
  if (!path || path.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part))) return fail('archive_path_invalid');
  const encoded = encoder.encode(name);
  if (encoded.length > ARCHIVE_LIMITS.nameBytes) return fail('archive_path_limit');
  if (exactDecoder.decode(encoded) !== name) return fail('archive_filename_invalid');
  return {name, directory, key: path.normalize('NFC').toLowerCase()};
}

function pathRegistry() {
  const explicit = new Map(), parents = new Set();
  return entry => {
    if (explicit.has(entry.key) || !entry.directory && parents.has(entry.key)) return fail('archive_path_collision');
    let at = entry.key.indexOf('/');
    while (at >= 0) {
      const parent = entry.key.slice(0, at);
      if (explicit.has(parent) && !explicit.get(parent)) return fail('archive_path_collision');
      parents.add(parent);
      at = entry.key.indexOf('/', at + 1);
    }
    explicit.set(entry.key, entry.directory);
  };
}

function flagsValid(flags, method) {
  if (flags & ~0x080e || method !== 0 && method !== 8) return fail('archive_zip_features_unsupported');
}

function checkExtras(bytes, from, length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = from + length;
  if (end > bytes.length) return fail('archive_zip_truncated');
  while (from < end) {
    if (from + 4 > end) return fail('archive_zip_extra_invalid');
    const type = view.getUint16(from, true), size = view.getUint16(from + 2, true);
    if (type === 1) return fail('archive_zip64_unsupported');
    from += 4 + size;
    if (from > end) return fail('archive_zip_extra_invalid');
  }
}

function decodeName(bytes, flags) {
  if (!bytes.length || bytes.length > ARCHIVE_LIMITS.nameBytes) return fail('archive_path_limit');
  if (!(flags & 0x0800) && bytes.some(byte => byte > 127)) return fail('archive_filename_encoding_unsupported');
  try { return pathName(exactDecoder.decode(bytes)); }
  catch (error) { if (error instanceof TypeError) return fail('archive_filename_invalid'); throw error; }
}

function archiveSource(blob, work) {
  let source = blob, cached = null;
  const readers = new Set(), pending = new Set();
  const check = () => { work.check(); if (!source) return fail('archive_closed'); };
  const cancel = reason => {
    for (const reject of pending) reject(reason);
    for (const reader of readers) reader.cancel(reason).catch(() => {});
  };
  const aborted = () => cancel(archiveAbort(work.signal));
  work.signal?.addEventListener('abort', aborted, {once: true});
  const close = () => {
    source = null; cached = null;
    work.signal?.removeEventListener('abort', aborted);
    cancel(new Error('archive_closed'));
  };
  async function part(at, length) {
    check();
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(length) || at < 0 || length < 0 ||
        length > IO_BYTES || at + length > source.size) return fail('archive_zip_truncated');
    if (!length) return new Uint8Array(0);
    if (cached && at >= cached.at && at + length <= cached.at + cached.bytes.length)
      return cached.bytes.subarray(at - cached.at, at - cached.at + length);
    await work.checkpoint(); check();
    let stop;
    const reading = new Promise((resolve, reject) => {
      stop = reject; pending.add(stop);
      source.slice(at, at + length).arrayBuffer().then(resolve, reject);
    });
    try {
      const buffer = await reading;
      check();
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== length) return fail('archive_zip_truncated');
      return new Uint8Array(buffer);
    } finally { pending.delete(stop); }
  }

  async function read(at, length) {
    check();
    if (length <= IO_BYTES) return part(at, length);
    if (!Number.isSafeInteger(length) || length < 0 || at < 0 || at + length > source.size) return fail('archive_zip_truncated');
    const output = new Uint8Array(length);
    for (let used = 0; used < length; used += IO_BYTES)
      output.set(await part(at + used, Math.min(IO_BYTES, length - used)), used);
    return output;
  }
  return {read, part, check, close, readers, keepTail(at, bytes) {
    if (bytes.length <= IO_BYTES) cached = {at, bytes};
  }};
}

function metadataReader(source, end, tail, tailAt) {
  let bytes = tail, start = tailAt;
  return {async read(at, length) {
    source.check();
    if (at < 0 || length < 0 || at + length > end) return fail('archive_zip_truncated');
    if (bytes && at >= start && at + length <= start + bytes.length)
      return bytes.subarray(at - start, at - start + length);
    if (length > IO_BYTES) return source.read(at, length);
    bytes = await source.read(at, Math.min(IO_BYTES, end - at)); start = at;
    return bytes.subarray(0, length);
  }, clear() { bytes = null; }};
}

async function inspectZip(source, length, work) {
  const tailAt = Math.max(0, length - 22 - 65535 - 20), tail = await source.read(tailAt, length - tailAt);
  source.keepTail(tailAt, tail);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let end = -1;
  for (let at = tail.length - 22, stop = Math.max(0, at - 65535); at >= stop; at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === tail.length) { end = at; break; }
    if (!(at & 2047)) await work.checkpoint();
  }
  if (end < 0) return fail('archive_zip_directory_missing');
  const count = view.getUint16(end + 10, true), centralSize = view.getUint32(end + 12, true), centralStart = view.getUint32(end + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff ||
      tailAt + end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) return fail('archive_zip64_unsupported');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) return fail('archive_multidisk_unsupported');
  if (!count || count > ARCHIVE_LIMITS.entries) return fail('archive_entry_limit');
  end += tailAt;
  if (centralStart + centralSize !== end) return fail('archive_zip_directory_invalid');
  const entries = [], admit = pathRegistry(), central = metadataReader(source, end, tail, tailAt), local = metadataReader(source, centralStart, tail, tailAt);
  let at = centralStart, total = 0;
  try {
    for (let number = 0; number < count; number++) {
      await work.checkpoint();
      if (at + 46 > end) return fail('archive_zip_directory_invalid');
      const header = await central.read(at, 46), cv = new DataView(header.buffer, header.byteOffset, header.byteLength);
      if (cv.getUint32(0, true) !== 0x02014b50) return fail('archive_zip_directory_invalid');
      const flags = cv.getUint16(8, true), method = cv.getUint16(10, true);
      const crc = cv.getUint32(16, true), compressed = cv.getUint32(20, true), size = cv.getUint32(24, true);
      const nameLength = cv.getUint16(28, true), extraLength = cv.getUint16(30, true), commentLength = cv.getUint16(32, true);
      const attributes = cv.getUint32(38, true), start = cv.getUint32(42, true);
      if (cv.getUint16(6, true) > 20 || cv.getUint16(34, true)) return fail('archive_zip_features_unsupported');
      if (compressed === 0xffffffff || size === 0xffffffff || start === 0xffffffff) return fail('archive_zip64_unsupported');
      flagsValid(flags, method);
      if (at + 46 + nameLength + extraLength + commentLength > end) return fail('archive_zip_directory_invalid');
      if (!nameLength || nameLength > ARCHIVE_LIMITS.nameBytes) return fail('archive_path_limit');
      const extra = await central.read(at + 46, nameLength + extraLength), entry = decodeName(extra.subarray(0, nameLength), flags);
      admit(entry);
      checkExtras(extra, nameLength, extraLength);
      const kind = attributes >>> 16 & 0xf000;
      if (kind && kind !== 0x8000 && kind !== 0x4000) return fail('archive_nonregular_file');
      if ((kind === 0x4000 || attributes & 0x10) && !entry.directory || entry.directory && (size || kind === 0x8000)) return fail('archive_directory_invalid');
      total += size;
      if (total > ARCHIVE_LIMITS.bytes || compressed > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
      if (method === 0 && compressed !== size) return fail('archive_stored_size_invalid');
      if (start + 30 > centralStart) return fail('archive_zip_local_invalid');
      entries.push({...entry, flags, method, crc, compressed, size, start, nameLength});
      at += 46 + nameLength + extraLength + commentLength;
    }
    if (at !== end) return fail('archive_zip_directory_invalid');
    central.clear();
    let localEnd = 0;
    for (const entry of [...entries].sort((left, right) => left.start - right.start)) {
      await work.checkpoint();
      if (entry.start !== localEnd) return fail('archive_zip_overlap_or_gap');
      const {start, flags, method, name, crc, compressed, size} = entry;
      const header = await local.read(start, 30), lv = new DataView(header.buffer, header.byteOffset, header.byteLength);
      if (lv.getUint32(0, true) !== 0x04034b50) return fail('archive_zip_local_invalid');
      if (lv.getUint16(4, true) > 20 || lv.getUint16(6, true) !== flags || lv.getUint16(8, true) !== method) return fail('archive_zip_local_mismatch');
      const nameLength = lv.getUint16(26, true), extraLength = lv.getUint16(28, true);
      const dataStart = start + 30 + nameLength + extraLength, dataEnd = dataStart + compressed;
      if (dataEnd > centralStart || nameLength !== entry.nameLength) return fail('archive_zip_local_invalid');
      const extra = await local.read(start + 30, nameLength + extraLength);
      if (decodeName(extra.subarray(0, nameLength), flags).name !== name) return fail('archive_zip_local_mismatch');
      checkExtras(extra, nameLength, extraLength);
      for (const [position, expected] of [[14, crc], [18, compressed], [22, size]]) {
        const actual = lv.getUint32(position, true);
        if (actual !== expected && (!(flags & 8) || actual !== 0)) return fail('archive_zip_local_mismatch');
      }
      localEnd = dataEnd;
      if (flags & 8) {
        const bytes = await local.read(dataEnd, Math.min(16, centralStart - dataEnd));
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const descriptor = position => position + 12 <= bytes.length && dv.getUint32(position, true) === crc &&
          dv.getUint32(position + 4, true) === compressed && dv.getUint32(position + 8, true) === size;
        if (descriptor(0)) localEnd += 12;
        else if (bytes.length >= 4 && dv.getUint32(0, true) === 0x08074b50 && descriptor(4)) localEnd += 16;
        else return fail('archive_zip_descriptor_invalid');
      }
      Object.assign(entry, {dataStart, dataEnd, localEnd});
      Object.freeze(entry);
    }
    if (localEnd !== centralStart) return fail('archive_zip_local_invalid');
    return Object.freeze(entries);
  } finally { central.clear(); local.clear(); }
}

async function readEntry(source, entry, work, retain) {
  source.check();
  const output = retain ? new Uint8Array(entry.size) : null;
  let used = 0, crc = 0;
  const consume = async bytes => {
    if (used + bytes.length > entry.size) return fail('archive_expansion_limit');
    for (let at = 0; at < bytes.length; at += IO_BYTES) {
      await work.checkpoint(); source.check();
      const part = bytes.subarray(at, at + IO_BYTES);
      if (output) output.set(part, used);
      crc = crc32(part, crc); used += part.length;
    }
  };
  if (entry.method === 0) {
    for (let at = entry.dataStart; at < entry.dataEnd; at += IO_BYTES)
      await consume(await source.part(at, Math.min(IO_BYTES, entry.dataEnd - at)));
  } else {
    let decompressor;
    try { decompressor = new DecompressionStream('deflate-raw'); }
    catch { return fail('archive_deflate_unavailable'); }
    let at = entry.dataStart, cancelled = false;
    const input = new ReadableStream({async pull(controller) {
      try {
        source.check();
        if (at === entry.dataEnd) { controller.close(); return; }
        const bytes = await source.part(at, Math.min(IO_BYTES, entry.dataEnd - at));
        if (cancelled) return;
        at += bytes.length; controller.enqueue(bytes);
      } catch (error) { if (!cancelled) controller.error(error); }
    }, cancel() { cancelled = true; }});
    const reader = input.pipeThrough(decompressor).getReader();
    source.readers.add(reader);
    try {
      while (true) {
        await work.checkpoint(); source.check();
        const {value, done} = await reader.read();
        source.check();
        if (done) break;
        await consume(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally { source.readers.delete(reader); reader.releaseLock(); }
  }
  if (used !== entry.size) return fail('archive_uncompressed_size_invalid');
  if (crc !== entry.crc) return fail('archive_checksum_failed');
  source.check();
  return output;
}

export async function openArchive(blob, options = {}) {
  if (!(blob instanceof Blob) || blob.size < 22 || blob.size > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
  const work = options.work || createImportWork(options), source = archiveSource(blob, work);
  try {
    const entries = await inspectZip(source, blob.size, work), index = new Map(entries.map(entry => [entry.name, entry])), verified = new Set();
    const read = async name => {
      source.check();
      const entry = index.get(name);
      if (!entry) return fail('archive_member_missing');
      const bytes = await readEntry(source, entry, work, true);
      verified.add(entry); return bytes;
    };
    return Object.freeze({entries, has(name) { return index.has(name); }, read, async verify() {
      source.check();
      for (const entry of entries) if (!verified.has(entry)) {
        await readEntry(source, entry, work, false);
        verified.add(entry);
      }
      source.check();
    }, close() { source.close(); index.clear(); verified.clear(); }});
  } catch (error) { source.close(); throw error; }
}

export async function unpackFiles(blob, options = {}) {
  const archive = await openArchive(blob, options), files = new Map();
  try {
    for (const entry of archive.entries)
      if (!entry.directory) files.set(entry.name, await archive.read(entry.name));
    await archive.verify();
    return files;
  } finally { archive.close(); }
}

function textBundleLayout(entries) {
  const roots = entries.filter(entry => entry.name === 'info.json' || /^[^/]+\.textbundle\/info\.json$/.test(entry.name));
  if (roots.length !== 1) return fail('textbundle_metadata_missing_or_ambiguous');
  const metadata = roots[0], root = metadata.name.slice(0, -'info.json'.length);
  if (metadata.size > ARCHIVE_LIMITS.metadataBytes) return fail('textbundle_metadata_limit');
  const texts = entries.filter(entry => entry.name === root + 'text.md' || entry.name === root + 'text.markdown');
  if (texts.length !== 1) return fail('textbundle_text_missing_or_ambiguous');
  const text = texts[0], assets = new Map();
  for (const entry of entries) {
    if (!entry.name.startsWith(root)) return fail('textbundle_member_invalid');
    const relative = entry.name.slice(root.length);
    if (relative === 'info.json' || entry === text) continue;
    if (relative === '' || relative.endsWith('/') && relative.startsWith('assets/')) continue;
    if (!relative.startsWith('assets/') || relative.length === 7) return fail('textbundle_member_invalid');
    assets.set(relative, entry);
  }
  return {metadata, root, text, filename: text.name.slice(root.length), assets};
}

function textBundleInfo(bytes) {
  let info;
  try { info = JSON.parse(decoder.decode(bytes)); }
  catch { return fail('textbundle_metadata_invalid'); }
  if (!info || typeof info !== 'object' || Array.isArray(info) || info.version !== 2 ||
      info.type !== undefined && info.type !== 'net.daringfireball.markdown' || info.transient !== undefined && typeof info.transient !== 'boolean') return fail('textbundle_format_unsupported');
  return info;
}

export function parseTextBundle(files) {
  if (!(files instanceof Map) || !files.size || files.size > ARCHIVE_LIMITS.entries) return fail('textbundle_entries_invalid');
  const admit = pathRegistry(), entries = [];
  let total = 0;
  for (const [name, value] of files) {
    const entry = pathName(name), bytes = bytesOf(value);
    admit(entry);
    if (entry.directory && bytes.length) return fail('archive_directory_invalid');
    total += bytes.length;
    if (total > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
    entries.push({...entry, size: bytes.length, bytes});
  }
  const layout = textBundleLayout(entries), info = textBundleInfo(layout.metadata.bytes);
  let markdown;
  try { markdown = exactDecoder.decode(layout.text.bytes); }
  catch { return fail('textbundle_text_encoding_invalid'); }
  return {markdown, info, assets: new Map([...layout.assets].map(([name, entry]) => [name, entry.bytes])), root: layout.root, filename: layout.filename};
}

export async function openTextBundle(blob, options = {}) {
  const work = options.work || createImportWork(options), archive = await openArchive(blob, {work});
  try {
    const layout = textBundleLayout(archive.entries.filter(entry => !entry.directory));
    const info = textBundleInfo(await archive.read(layout.metadata.name)), bytes = await archive.read(layout.text.name);
    const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}), parts = [];
    const decode = (bytes, stream) => {
      try { return text.decode(bytes, {stream}); }
      catch { return fail('textbundle_text_encoding_invalid'); }
    };
    for (let at = 0; at < bytes.length; at += IO_BYTES) {
      parts.push(decode(bytes.subarray(at, at + IO_BYTES), true));
      await work.checkpoint();
    }
    parts.push(decode(undefined, false));
    const markdown = parts.join('');
    work.check();
    return Object.freeze({markdown, info, root: layout.root, filename: layout.filename, assets: new Map(layout.assets),
      readAsset(name) {
        const entry = layout.assets.get(name);
        if (!entry) return Promise.reject(new Error('textbundle_member_missing'));
        return archive.read(entry.name);
      }, verify: archive.verify, close: archive.close});
  } catch (error) { archive.close(); throw error; }
}
