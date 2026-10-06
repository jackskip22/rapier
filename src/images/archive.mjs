// SPDX-License-Identifier: AGPL-3.0-only
import {crc32} from './crc32.mjs';
export {crc32};

export const ARCHIVE_LIMITS = Object.freeze({bytes: 25 * 1024 * 1024, entries: 1024, nameBytes: 1024, metadataBytes: 65536});
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const nameDecoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});

function fail(reason) { throw new Error(reason); }
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
  if (nameDecoder.decode(encoded) !== name) return fail('archive_filename_invalid');
  return {name, encoded, directory, key: path.normalize('NFC').toLowerCase()};
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
  if (flags & ~0x080e || method !== 0 && method !== 8 || method === 0 && flags & 6) return fail('archive_zip_features_unsupported');
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
  try { return pathName(nameDecoder.decode(bytes)); }
  catch (error) { if (error instanceof TypeError) return fail('archive_filename_invalid'); throw error; }
}

function inspectZip(bytes) {
  if (bytes.length < 22 || bytes.length > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22, stop = Math.max(0, at - 65535); at >= stop; at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0) return fail('archive_zip_directory_missing');
  const count = view.getUint16(end + 10, true), centralSize = view.getUint32(end + 12, true), centralStart = view.getUint32(end + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff || end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) return fail('archive_zip64_unsupported');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) return fail('archive_multidisk_unsupported');
  if (!count || count > ARCHIVE_LIMITS.entries) return fail('archive_entry_limit');
  if (centralStart + centralSize !== end) return fail('archive_zip_directory_invalid');
  const entries = [], admit = pathRegistry();
  let at = centralStart, total = 0;
  for (let number = 0; number < count; number++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) return fail('archive_zip_directory_invalid');
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true), compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const attributes = view.getUint32(at + 38, true), start = view.getUint32(at + 42, true);
    if (view.getUint16(at + 6, true) > 20 || view.getUint16(at + 34, true)) return fail('archive_zip_features_unsupported');
    if (compressed === 0xffffffff || size === 0xffffffff || start === 0xffffffff) return fail('archive_zip64_unsupported');
    flagsValid(flags, method);
    if (at + 46 + nameLength + extraLength + commentLength > end) return fail('archive_zip_directory_invalid');
    const entry = decodeName(bytes.subarray(at + 46, at + 46 + nameLength), flags);
    admit(entry);
    checkExtras(bytes, at + 46 + nameLength, extraLength);
    const kind = attributes >>> 16 & 0xf000;
    if (kind && kind !== 0x8000 && kind !== 0x4000) return fail('archive_nonregular_file');
    if ((kind === 0x4000 || attributes & 0x10) && !entry.directory || entry.directory && (size || kind === 0x8000)) return fail('archive_directory_invalid');
    total += size;
    if (total > ARCHIVE_LIMITS.bytes || compressed > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
    if (method === 0 && compressed !== size) return fail('archive_stored_size_invalid');
    if (start + 30 > centralStart || view.getUint32(start, true) !== 0x04034b50) return fail('archive_zip_local_invalid');
    if (view.getUint16(start + 4, true) > 20 || view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method) return fail('archive_zip_local_mismatch');
    const localNameLength = view.getUint16(start + 26, true), localExtraLength = view.getUint16(start + 28, true);
    const dataStart = start + 30 + localNameLength + localExtraLength, dataEnd = dataStart + compressed;
    if (dataEnd > centralStart || localNameLength !== nameLength) return fail('archive_zip_local_invalid');
    const localName = decodeName(bytes.subarray(start + 30, start + 30 + localNameLength), flags);
    if (localName.name !== entry.name) return fail('archive_zip_local_mismatch');
    checkExtras(bytes, start + 30 + localNameLength, localExtraLength);
    for (const [position, expected] of [[14, crc], [18, compressed], [22, size]]) {
      const actual = view.getUint32(start + position, true);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) return fail('archive_zip_local_mismatch');
    }
    let localEnd = dataEnd;
    if (flags & 8) {
      const descriptor = position => position + 12 <= centralStart && view.getUint32(position, true) === crc &&
        view.getUint32(position + 4, true) === compressed && view.getUint32(position + 8, true) === size;
      if (descriptor(dataEnd)) localEnd += 12;
      else if (dataEnd + 4 <= centralStart && view.getUint32(dataEnd, true) === 0x08074b50 && descriptor(dataEnd + 4)) localEnd += 16;
      else return fail('archive_zip_descriptor_invalid');
    }
    entries.push({...entry, flags, method, crc, compressed, size, start, dataStart, dataEnd, localEnd});
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) return fail('archive_zip_directory_invalid');
  let localEnd = 0;
  for (const entry of [...entries].sort((left, right) => left.start - right.start)) {
    if (entry.start !== localEnd) return fail('archive_zip_overlap_or_gap');
    localEnd = entry.localEnd;
  }
  if (localEnd !== centralStart) return fail('archive_zip_local_invalid');
  return entries;
}

async function inflate(bytes, entry) {
  if (entry.method === 0) return bytes.slice(entry.dataStart, entry.dataEnd);
  let stream;
  try { stream = new Blob([bytes.subarray(entry.dataStart, entry.dataEnd)]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
  catch { return fail('archive_deflate_unavailable'); }
  const reader = stream.getReader(), output = new Uint8Array(entry.size);
  let used = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      if (used + value.length > output.length) return fail('archive_expansion_limit');
      output.set(value, used);
      used += value.length;
    }
    if (used !== output.length) return fail('archive_uncompressed_size_invalid');
    return output;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export async function unpackFiles(blob) {
  if (!(blob instanceof Blob) || blob.size > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
  const bytes = new Uint8Array(await blob.arrayBuffer()), entries = inspectZip(bytes), files = new Map();
  for (const entry of entries) {
    const decoded = await inflate(bytes, entry);
    if (crc32(decoded) !== entry.crc) return fail('archive_checksum_failed');
    if (!entry.directory) files.set(entry.name, decoded);
  }
  return files;
}

export function parseTextBundle(files) {
  if (!(files instanceof Map) || !files.size || files.size > ARCHIVE_LIMITS.entries) return fail('textbundle_entries_invalid');
  const admit = pathRegistry();
  let total = 0;
  for (const [name, value] of files) {
    const entry = pathName(name), bytes = bytesOf(value);
    admit(entry);
    if (entry.directory && bytes.length) return fail('archive_directory_invalid');
    total += bytes.length;
    if (total > ARCHIVE_LIMITS.bytes) return fail('archive_byte_limit');
  }
  const roots = [...files.keys()].filter(name => name === 'info.json' || /^[^/]+\.textbundle\/info\.json$/.test(name));
  if (roots.length !== 1) return fail('textbundle_metadata_missing_or_ambiguous');
  const root = roots[0].slice(0, -'info.json'.length), metadataBytes = bytesOf(files.get(roots[0]));
  if (metadataBytes.length > ARCHIVE_LIMITS.metadataBytes) return fail('textbundle_metadata_limit');
  let info;
  try { info = JSON.parse(decoder.decode(metadataBytes)); }
  catch { return fail('textbundle_metadata_invalid'); }
  if (!info || typeof info !== 'object' || Array.isArray(info) || info.version !== 2 ||
      info.type !== undefined && info.type !== 'net.daringfireball.markdown' || info.transient !== undefined && typeof info.transient !== 'boolean') return fail('textbundle_format_unsupported');
  const texts = ['text.md', 'text.markdown'].filter(name => files.has(root + name));
  if (texts.length !== 1) return fail('textbundle_text_missing_or_ambiguous');
  const assets = new Map();
  for (const [name, value] of files) {
    if (!name.startsWith(root)) return fail('textbundle_member_invalid');
    const relative = name.slice(root.length);
    if (relative === 'info.json' || relative === texts[0]) continue;
    if (relative === '' || relative.endsWith('/') && relative.startsWith('assets/')) continue;
    if (!relative.startsWith('assets/') || relative.length === 7) return fail('textbundle_member_invalid');
    assets.set(relative, bytesOf(value));
  }
  let markdown;
  try { markdown = decoder.decode(bytesOf(files.get(root + texts[0]))); }
  catch { return fail('textbundle_text_encoding_invalid'); }
  return {markdown, info, assets, root, filename: texts[0]};
}
