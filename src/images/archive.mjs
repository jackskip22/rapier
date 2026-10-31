// SPDX-License-Identifier: AGPL-3.0-only
import {crc32} from './crc32.mjs';
import {readOpenRasterMembers} from './openraster.mjs';
import {zipRanges, zipMember, archivePathName, archivePathRegistry} from '../notes/zip-reader.mjs';
export {crc32};

export const ARCHIVE_LIMITS = Object.freeze({bytes: 25 * 1024 * 1024, entries: 1024, nameBytes: 1024, metadataBytes: 65536});
const ARCHIVE_ZIP = Object.freeze({
	maxBytes: ARCHIVE_LIMITS.bytes, maxEntries: ARCHIVE_LIMITS.entries, zip64: false, maxNameBytes: ARCHIVE_LIMITS.nameBytes,
	rejectEmpty: true, contiguous: true, versionMax: 20, paths: 'archive', errors: 'archive', fileTypes: true,
	utf8Required: true, capCompressed: true, matchTime: false,
});
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
  return signal.reason instanceof Error ? signal.reason : Object.assign(new Error('The operation was canceled.'), {name: 'AbortError', code: 'cancelled'});
}
function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return fail('archive_bytes_invalid');
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

function memberSource(blob, source) {
  return {size: blob.size, read: (at, length) => source.read(at, length)};
}
async function admittedRecords(blob, source, work) {
  const scan = zipRanges(blob.size, ARCHIVE_ZIP);
  let step = scan.next();
  while (!step.done) {
    await work.checkpoint();
    step = scan.next(await source.read(step.value[0], step.value[1]));
  }
  return step.value;
}

export async function openArchive(blob, options = {}) {
  if (!(blob instanceof Blob) || blob.size < 22 || blob.size > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
  const work = options.work || createImportWork(options), source = archiveSource(blob, work);
  const members = memberSource(blob, source);
  try {
    const records = await admittedRecords(blob, source, work);
    const entries = Object.freeze(records.map(record => Object.freeze({name: record.name, directory: record.directory, size: record.size})));
    const index = new Map(records.map(record => [record.name, record])), verified = new Set();
    const read = async name => {
      source.check();
      const record = index.get(name);
      if (!record) return fail('archive_member_missing');
      const bytes = await zipMember(members, record, {errors: 'archive', signal: work.signal});
      verified.add(record); return bytes;
    };
    return Object.freeze({entries, has(name) { return index.has(name); }, read, async verify() {
      source.check();
      for (const record of records) if (!verified.has(record)) {
        await zipMember(members, record, {errors: 'archive', retain: false, signal: work.signal});
        verified.add(record);
      }
      source.check();
    }, close() { source.close(); index.clear(); verified.clear(); }});
  } catch (error) { source.close(); throw error; }
}

export async function readOpenRaster(blob, options = {}) {
  const work = options.work || createImportWork(options), archive = await openArchive(blob, {...options, work});
  try { return await readOpenRasterMembers(archive, work); }
  finally { archive.close(); }
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
  const admit = archivePathRegistry(), entries = [];
  let total = 0;
  for (const [name, value] of files) {
    const entry = archivePathName(name, ARCHIVE_LIMITS.nameBytes), bytes = bytesOf(value);
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
