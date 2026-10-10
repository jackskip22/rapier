// SPDX-License-Identifier: MIT
// Runs while writing the page. The written file carries only the resulting fonts.
import decodeWoff2 from 'wawoff2/decompress.js';
import {zlibSync, unzlibSync} from 'fflate';

let engine;
function harfbuzz() {
  if (!engine) engine = WebAssembly.instantiate(Uint8Array.from(atob(RAPIER_FONT_SUBSET_WASM), c => c.charCodeAt(0)))
    .then(({instance}) => { instance.exports._initialize(); return instance.exports; });
  return engine;
}

const fail = message => { throw Object.assign(new Error(message), {code: 'export_font_invalid'}); };
const aligned = length => (length + 3) & ~3;
const tag = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
const viewOf = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
function bytesOf(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
  if (!bytes || bytes.length < 12) fail('The page contains an invalid font.');
  return bytes;
}

function tableDirectory(bytes) {
  const view = viewOf(bytes), flavor = view.getUint32(0), count = view.getUint16(4);
  if (flavor !== 0x00010000 && flavor !== 0x4f54544f) fail('The page font is not a single TrueType or OpenType face.');
  if (!count || 12 + count * 16 > bytes.length) fail('The page font table directory is invalid.');
  const tables = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    const row = 12 + i * 16, name = tag(bytes, row), offset = view.getUint32(row + 8), length = view.getUint32(row + 12);
    if (seen.has(name) || offset < 12 + count * 16 || offset > bytes.length || length > bytes.length - offset)
      fail('The page font contains an invalid table.');
    seen.add(name); tables.push({name, bytes: bytes.slice(offset, offset + length)});
  }
  return {flavor, tables: tables.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)};
}

function checksum(bytes) {
  let sum = 0;
  for (let at = 0; at < bytes.length; at += 4)
    sum = (sum + (((bytes[at] << 24) | ((bytes[at + 1] || 0) << 16) | ((bytes[at + 2] || 0) << 8) | (bytes[at + 3] || 0)) >>> 0)) >>> 0;
  return sum;
}

function mappedCharacters(tables, text) {
  const cmap = tables.find(table => table.name === 'cmap')?.bytes;
  if (!cmap || cmap.length < 4) fail('The page font has no character map.');
  const view = viewOf(cmap), count = view.getUint16(2), mappings = [];
  if (4 + count * 8 > cmap.length) fail('The page font character map is invalid.');
  for (let index = 0; index < count; index++) {
    const row = 4 + index * 8, platform = view.getUint16(row), encoding = view.getUint16(row + 2), at = view.getUint32(row + 4);
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
    if (at > cmap.length - 2) fail('The page font character map is invalid.');
    const format = view.getUint16(at);
    if (format === 4 && at <= cmap.length - 16) {
      const length = view.getUint16(at + 2), segments = view.getUint16(at + 6) / 2;
      if (!Number.isInteger(segments) || length < 16 + segments * 8 || length > cmap.length - at) fail('The page font character map is invalid.');
      const ends = at + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
      mappings.push(code => {
        if (code > 65535) return false;
        let low = 0, high = segments - 1;
        while (low <= high) {
          const middle = (low + high) >>> 1, start = view.getUint16(starts + middle * 2), end = view.getUint16(ends + middle * 2);
          if (code < start) high = middle - 1;
          else if (code > end) low = middle + 1;
          else {
            const delta = view.getInt16(deltas + middle * 2), range = view.getUint16(offsets + middle * 2);
            const address = offsets + middle * 2 + range + (code - start) * 2;
            if (range && address > at + length - 2) fail('The page font character map is invalid.');
            const glyph = range ? view.getUint16(address) : code;
            return (!range || glyph) && ((glyph + delta) & 65535) !== 0;
          }
        }
        return false;
      });
    } else if ((format === 12 || format === 13) && at <= cmap.length - 16) {
      const length = view.getUint32(at + 4), groups = view.getUint32(at + 12);
      if (length < 16 + groups * 12 || length > cmap.length - at) fail('The page font character map is invalid.');
      mappings.push(code => {
        let low = 0, high = groups - 1;
        while (low <= high) {
          const middle = (low + high) >>> 1, row = at + 16 + middle * 12, start = view.getUint32(row), end = view.getUint32(row + 4);
          if (code < start) high = middle - 1;
          else if (code > end) low = middle + 1;
          else return view.getUint32(row + 8) + (format === 12 ? code - start : 0) !== 0;
        }
        return false;
      });
    }
  }
  return [...text].filter(character => mappings.some(mapping => mapping(character.codePointAt(0)))).join('');
}

function sfntBytes(flavor, tables) {
  const count = tables.length, header = 12 + count * 16;
  const bytes = new Uint8Array(header + tables.reduce((size, row) => size + aligned(row.bytes.length), 0)), view = viewOf(bytes);
  const power = 2 ** Math.floor(Math.log2(count));
  view.setUint32(0, flavor); view.setUint16(4, count); view.setUint16(6, power * 16);
  view.setUint16(8, Math.log2(power)); view.setUint16(10, count * 16 - power * 16);
  let offset = header, head = 0;
  tables.forEach((table, i) => {
    const row = 12 + i * 16;
    for (let k = 0; k < 4; k++) bytes[row + k] = table.name.charCodeAt(k);
    if (table.name === 'head') {
      if (table.bytes.length < 54) fail('The page font header is invalid.');
      viewOf(table.bytes).setUint32(8, 0); head = offset;
    }
    table.checksum = checksum(table.bytes);
    view.setUint32(row + 4, table.checksum); view.setUint32(row + 8, offset); view.setUint32(row + 12, table.bytes.length);
    bytes.set(table.bytes, offset); offset += aligned(table.bytes.length);
  });
  if (!head) fail('The page font has no header.');
  const adjustment = (0xb1b0afba - checksum(bytes)) >>> 0;
  view.setUint32(head + 8, adjustment);
  viewOf(tables.find(row => row.name === 'head').bytes).setUint32(8, adjustment);
  return bytes;
}

function readWoff(bytes) {
  if (bytes.length < 44) fail('The page font container is invalid.');
  const view = viewOf(bytes), count = view.getUint16(12);
  if (view.getUint32(8) !== bytes.length || !count || 44 + count * 20 > bytes.length) fail('The page font container is invalid.');
  const tables = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    const row = 44 + i * 20, name = tag(bytes, row), offset = view.getUint32(row + 4), size = view.getUint32(row + 8), original = view.getUint32(row + 12);
    if (seen.has(name) || offset < 44 + count * 20 || offset > bytes.length || size > bytes.length - offset || size > original)
      fail('The page font container has an invalid table.');
    seen.add(name);
    const data = size === original ? bytes.slice(offset, offset + size) : unzlibSync(bytes.subarray(offset, offset + size));
    if (data.length !== original) fail('The page font table length changed during decompression.');
    tables.push({name, bytes: data});
  }
  const output = sfntBytes(view.getUint32(4), tables.sort((a, b) => a.name < b.name ? -1 : 1));
  if (output.length !== view.getUint32(16)) fail('The page font size changed during decompression.');
  return output;
}

function writeWoff(bytes) {
  const {flavor, tables} = tableDirectory(bytes), sfnt = sfntBytes(flavor, tables);
  for (const table of tables) {
    const compressed = zlibSync(table.bytes, {level: 9});
    table.data = compressed.length < table.bytes.length ? compressed : table.bytes;
  }
  const count = tables.length, header = 44 + count * 20;
  const output = new Uint8Array(header + tables.reduce((size, row) => size + aligned(row.data.length), 0)), view = viewOf(output);
  view.setUint32(0, 0x774f4646); view.setUint32(4, flavor); view.setUint32(8, output.length); view.setUint16(12, count);
  view.setUint32(16, sfnt.length); view.setUint16(20, 1);
  let offset = header;
  tables.forEach((table, i) => {
    const row = 44 + i * 20;
    for (let k = 0; k < 4; k++) output[row + k] = table.name.charCodeAt(k);
    view.setUint32(row + 4, offset); view.setUint32(row + 8, table.data.length); view.setUint32(row + 12, table.bytes.length);
    view.setUint32(row + 16, table.checksum); output.set(table.data, offset); offset += aligned(table.data.length);
  });
  return output;
}

export async function subset(value, characters) {
  const original = bytesOf(value);
  if (typeof characters !== 'string' || !characters.length) fail('The font subset needs document characters.');
  // Shaping may compose or decompose the text before looking up its glyphs.
  // Keep those canonical equivalents without changing the authored string.
  const repertoire = characters + characters.normalize('NFC') + characters.normalize('NFD');
  const container = tag(original, 0), sfnt = container === 'wOF2' ? bytesOf(await decodeWoff2(original))
    : container === 'wOFF' ? readWoff(original) : original;
  const {tables} = tableDirectory(sfnt), permission = tables.find(row => row.name === 'OS/2');
  if (!mappedCharacters(tables, repertoire)) return null;
  // A font's no-subsetting permission requires its whole face even in a static page.
  if (permission?.bytes.length >= 10 && (viewOf(permission.bytes).getUint16(8) & 0x0100)) return original.slice();
  const hb = await harfbuzz();
  let pointer = 0, blob = 0, face = 0, input = 0, result = 0, output = 0;
  let bytes;
  try {
    pointer = hb.malloc(sfnt.length);
    if (!pointer) fail('The font subset could not allocate memory.');
    new Uint8Array(hb.memory.buffer).set(sfnt, pointer);
    blob = hb.hb_blob_create(pointer, sfnt.length, 2, 0, 0);
    face = hb.hb_face_create(blob, 0); input = hb.hb_subset_input_create_or_fail();
    if (!blob || !face || face === hb.hb_face_get_empty() || !input) fail('The page font could not be opened.');
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const character of repertoire) hb.hb_set_add(unicodes, character.codePointAt(0));
    // Retain all shaping features, glyph closure, variation axes and hinting.
    const features = hb.hb_subset_input_set(input, 6);
    hb.hb_set_clear(features); hb.hb_set_invert(features);
    hb.hb_subset_input_set_flags(input, 0x40);
    result = hb.hb_subset_or_fail(face, input);
    if (!result) fail('The page font could not be subset.');
    output = hb.hb_face_reference_blob(result);
    const length = hb.hb_blob_get_length(output), data = hb.hb_blob_get_data(output, 0);
    if (!data || !length) fail('The font subset was empty.');
    bytes = new Uint8Array(hb.memory.buffer, data, length).slice();
  } finally {
    if (output) hb.hb_blob_destroy(output);
    if (result) hb.hb_face_destroy(result);
    if (input) hb.hb_subset_input_destroy(input);
    if (face) hb.hb_face_destroy(face);
    if (blob) hb.hb_blob_destroy(blob);
    if (pointer) hb.free(pointer);
  }
  return writeWoff(bytes);
}
