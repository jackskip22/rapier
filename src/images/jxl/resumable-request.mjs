// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {encodeData} from './resumable-data.mjs';
import {emptyRecordIndex, appendRecordIndex, recordIndex, recordIndexRange, recordIndexItems,
  recordIndexCursor, advanceRecordIndex, RECORD_PAGE_BYTES, RECORD_PAGE_ITEMS} from './resumable-record-index.mjs';
import {arrayBufferBytes, typedFields, typedName} from './v7/bytes.mjs';
import {plain} from './v7/records.mjs';

export const REQUEST_CHUNK_BYTES = 65536;
const INLINE_BYTES = 4096, MAX_DEPTH = 64, MAX_BYTES = 0xffffffff;
const TYPES = {Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
  Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView, ArrayBuffer};
const viewFields = Object.fromEntries(['buffer', 'byteOffset', 'byteLength'].map(key => [key, Object.getOwnPropertyDescriptor(DataView.prototype, key).get]));
const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const utf8 = new TextEncoder();
const fail = message => { throw fault('JXL_INPUT', message); };
const integer = (value, hi = MAX_BYTES) => Number.isSafeInteger(value) && value >= 0 && value <= hi;
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
const property = (target, key, value) => Object.defineProperty(target, key, {value, enumerable: true, writable: true, configurable: true});

export function requestFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !plain(Object.getPrototypeOf(value)))
    fail('Request records must contain plain data.');
  return Reflect.ownKeys(value).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      fail('Request records cannot contain symbols, accessors or hidden fields.');
    return [key, descriptor.value];
  });
}
function typed(value) {
  if (ArrayBuffer.isView(value)) {
    let type, fields;
    try { type = typedName.call(value); typedFields.buffer.call(value); fields = typedFields; }
    catch { type = 'DataView'; fields = viewFields; }
    if (!Object.hasOwn(TYPES, type)) fail('Unknown request sample array.');
    const buffer = fields.buffer.call(value), offset = fields.byteOffset.call(value), byteLength = fields.byteLength.call(value);
    if (arrayBufferBytes(buffer) === null) fail('Request data cannot use shared buffers.');
    const bytes = new Uint8Array(buffer, offset, byteLength);
    return {type, bytes, length: type === 'DataView' ? byteLength : byteLength / TYPES[type].BYTES_PER_ELEMENT};
  }
  if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) return null;
  const byteLength = arrayBufferBytes(value);
  if (byteLength !== null) return {type: 'ArrayBuffer', bytes: new Uint8Array(value, 0, byteLength), length: byteLength};
  return null;
}
function fromBytes(type, bytes) {
  if (!Object.hasOwn(TYPES, type)) fail('Unknown saved request sample array.');
  if (type === 'ArrayBuffer') return bytes.buffer;
  return new TYPES[type](bytes.buffer);
}

export function snapshotRequest(value) {
  const seen = new Map(), active = new Set();
  const copy = (value, depth) => {
    if (depth > MAX_DEPTH) fail('Request data is nested too deeply.');
    if (value === null || ['string', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Request numbers must be finite.'); return value; }
    if (typeof value !== 'object' || active.has(value)) fail('Request data cannot contain functions, symbols or cycles.');
    if (seen.has(value)) return seen.get(value);
    const view = typed(value);
    if (view) {
      const result = fromBytes(view.type, new Uint8Array(view.bytes)); seen.set(value, result); return result;
    }
    active.add(value);
    let result;
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1)
        fail('Request lists must be dense data arrays.');
      result = new Array(value.length); seen.set(value, result);
      for (let at = 0; at < value.length; at++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(at));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('Request lists must be dense data arrays.');
        result[at] = copy(descriptor.value, depth + 1);
      }
    } else {
      result = {}; seen.set(value, result);
      for (const [key, child] of requestFields(value)) property(result, key, copy(child, depth + 1));
    }
    active.delete(value); return result;
  };
  try { return copy(value, 0); }
  catch (error) { if (error?.code) throw error; fail('Request data cannot be snapshotted.'); }
}

export function sameRequest(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = typed(a), y = typed(b);
  if (x || y) return !!x && !!y && x.type === y.type && x.bytes.length === y.bytes.length && x.bytes.every((v, i) => v === y.bytes[i]);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((key, at) => key === kb[at] && sameRequest(a[key], b[key]));
}
const size = value => utf8.encode(JSON.stringify(value)).length;
async function pages(io, items) {
  let index = emptyRecordIndex(), pending = [], bytes = 23;
  for (const item of items) {
    const length = size(item);
    if (length + 23 > RECORD_PAGE_BYTES) fail('A request record item exceeds one page.');
    if (pending.length === RECORD_PAGE_ITEMS || bytes + length + (pending.length ? 1 : 0) > RECORD_PAGE_BYTES) {
      index = await appendRecordIndex(io, index, pending); pending = []; bytes = 23;
    }
    bytes += length + (pending.length ? 1 : 0); pending.push(item);
  }
  if (pending.length) index = await appendRecordIndex(io, index, pending);
  return index;
}
async function binary(io, length, chunk) {
  if (!integer(length)) fail('A request binary value exceeds its native array bound.');
  const refs = [];
  for (let at = 0; at < length; at += REQUEST_CHUNK_BYTES) refs.push(await io.write(chunk(at, Math.min(REQUEST_CHUNK_BYTES, length - at))));
  return pages(io, refs);
}
function byteOrder(bytes, width) {
  if (LE || width === 1) return bytes;
  const result = new Uint8Array(bytes.length);
  for (let at = 0; at < bytes.length; at += width) for (let j = 0; j < width; j++) result[at + j] = bytes[at + width - j - 1];
  return result;
}

export async function writeRequest(io, value) {
  const memo = new Map();
  const encode = async value => {
    if (value === undefined) return {kind: 'undefined'};
    if (typeof value === 'bigint') return {kind: 'bigint', value: String(value)};
    if (Object.is(value, -0)) return {kind: 'negative-zero'};
    if (typeof value === 'string' && size(value) > INLINE_BYTES) {
      const chunks = await binary(io, value.length * 2, (at, length) => {
        const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
        for (let j = 0; j < length; j += 2) view.setUint16(j, value.charCodeAt((at + j) / 2), true);
        return bytes;
      });
      return {kind: 'text', length: value.length, chunks};
    }
    if (value === null || typeof value !== 'object') return {kind: 'atom', value};
    if (memo.has(value)) return memo.get(value);
    const view = typed(value);
    if (view) {
      const width = TYPES[view.type].BYTES_PER_ELEMENT ?? 1;
      const chunks = await binary(io, view.bytes.length, (at, n) => byteOrder(view.bytes.subarray(at, at + n), width));
      const node = {kind: 'typed', type: view.type, length: view.length, byteLength: view.bytes.length, chunks};
      memo.set(value, node); return node;
    }
    if (Array.isArray(value)) {
      const items = [];
      for (const child of value) items.push(await encode(child));
      const inline = {kind: 'array', items}, node = size(inline) <= INLINE_BYTES ? inline
        : {kind: 'array-pages', length: items.length, items: await pages(io, items)};
      memo.set(value, node); return node;
    }
    const entries = [];
    for (const key of Object.keys(value)) entries.push([await encode(key), await encode(value[key]), entries.length]);
    const inline = {kind: 'object', entries};
    let node = inline;
    if (size(inline) > INLINE_BYTES) {
      const ordered = Object.keys(value).map((key, i) => ({key, entry: entries[i]}));
      ordered.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      node = {kind: 'object-pages', length: entries.length, entries: await pages(io, ordered.map(item => item.entry))};
    }
    memo.set(value, node); return node;
  };
  const root = {schema: 1, kind: 'request', value: await encode(value)};
  if (encodeData(root).length > RECORD_PAGE_BYTES) fail('The request root exceeds one page.');
  return io.writeJSON(root);
}

function nodeOf(node) {
  if (!node || typeof node !== 'object') fail('Invalid saved request node.');
  switch (node.kind) {
    case 'atom':
      if (!keys(node, ['kind', 'value']) || node.value !== null && !['string', 'number', 'boolean'].includes(typeof node.value) ||
          typeof node.value === 'number' && !Number.isFinite(node.value) || typeof node.value === 'string' && node.value.length > INLINE_BYTES) fail('Invalid saved request atom.'); break;
    case 'undefined': case 'negative-zero': if (!keys(node, ['kind'])) fail('Invalid saved request atom.'); break;
    case 'bigint': if (!keys(node, ['kind', 'value']) || typeof node.value !== 'string' || !/^(0|-?[1-9][0-9]*)$/.test(node.value)) fail('Invalid saved request integer.'); break;
    case 'array': if (!keys(node, ['kind', 'items']) || !Array.isArray(node.items) || node.items.length > 256) fail('Invalid saved request list.'); break;
    case 'object': if (!keys(node, ['kind', 'entries']) || !Array.isArray(node.entries) || node.entries.length > 128) fail('Invalid saved request object.'); break;
    case 'array-pages': case 'object-pages': {
      const field = node.kind === 'array-pages' ? 'items' : 'entries';
      if (!keys(node, ['kind', 'length', field]) || !integer(node.length) || recordIndex(node[field]).count !== node.length)
        fail('Invalid saved request page index.'); break;
    }
    case 'typed': {
      if (!keys(node, ['kind', 'type', 'length', 'byteLength', 'chunks']) || !Object.hasOwn(TYPES, node.type) || !integer(node.length) ||
          !integer(node.byteLength) || node.length * (TYPES[node.type].BYTES_PER_ELEMENT ?? 1) !== node.byteLength ||
          recordIndex(node.chunks).count !== Math.ceil(node.byteLength / REQUEST_CHUNK_BYTES)) fail('Invalid saved request sample array.'); break;
    }
    case 'text':
      if (!keys(node, ['kind', 'length', 'chunks']) || !integer(node.length, MAX_BYTES / 2 | 0) ||
          recordIndex(node.chunks).count !== Math.ceil(node.length * 2 / REQUEST_CHUNK_BYTES)) fail('Invalid saved request text.'); break;
    default: fail('Unknown saved request node.');
  }
  return node;
}
function entryOf(entry, length) {
  if (!Array.isArray(entry) || entry.length !== 3 || !integer(entry[2], length - 1)) fail('Invalid saved request field.');
  const key = nodeOf(entry[0]);
  if (!(key.kind === 'atom' && typeof key.value === 'string' || key.kind === 'text')) fail('Invalid saved request field name.');
  nodeOf(entry[1]); return entry;
}
async function rootOf(io, ref) {
  if (!keys(ref, ['hash', 'length']) || !integer(ref.length, RECORD_PAGE_BYTES)) fail('Invalid request root reference.');
  const root = await io.readJSON(ref);
  if (!keys(root, ['schema', 'kind', 'value']) || root.schema !== 1 || root.kind !== 'request') fail('Invalid saved request root.');
  return nodeOf(root.value);
}
async function one(io, index, at) {
  for await (const item of recordIndexRange(io, index, at, 1)) return item;
  fail('Missing request record.');
}
async function bytesOf(io, node, at, length) {
  nodeOf(node);
  const total = node.kind === 'text' ? node.length * 2 : node.byteLength;
  if (!integer(at) || !integer(length, REQUEST_CHUNK_BYTES) || at + length > total) fail('A request byte read is at most 64 KiB.');
  const out = new Uint8Array(length); let written = 0;
  while (written < length) {
    const chunk = Math.floor((at + written) / REQUEST_CHUNK_BYTES), ref = await one(io, node.chunks, chunk);
    const expected = Math.min(REQUEST_CHUNK_BYTES, total - chunk * REQUEST_CHUNK_BYTES);
    if (!keys(ref, ['hash', 'length']) || ref.length !== expected) fail('Invalid request binary chunk.');
    const bytes = await io.read(ref);
    if (!(bytes instanceof Uint8Array) || bytes.length !== expected) fail('Truncated request binary chunk.');
    const offset = (at + written) % REQUEST_CHUNK_BYTES, count = Math.min(length - written, bytes.length - offset);
    out.set(bytes.subarray(offset, offset + count), written); written += count;
  }
  return out;
}
async function textOf(io, node) {
  if (node.kind === 'atom' && typeof node.value === 'string') return node.value;
  if (nodeOf(node).kind !== 'text') fail('The request field is not text.');
  const pieces = [];
  for (let at = 0; at < node.length * 2; at += REQUEST_CHUNK_BYTES) {
    const bytes = await bytesOf(io, node, at, Math.min(REQUEST_CHUNK_BYTES, node.length * 2 - at)), view = new DataView(bytes.buffer);
    const chars = [];
    for (let i = 0; i < bytes.length; i += 2) chars.push(view.getUint16(i, true));
    pieces.push(String.fromCharCode(...chars));
  }
  return pieces.join('');
}
async function compareField(io, node, name) {
  if (node.kind === 'atom') return node.value < name ? -1 : node.value > name ? 1 : 0;
  if (nodeOf(node).kind !== 'text') fail('Invalid request field name.');
  const count = Math.min(node.length, name.length), bytes = await bytesOf(io, node, 0, count * 2), view = new DataView(bytes.buffer);
  for (let at = 0; at < count; at++) {
    const a = view.getUint16(at * 2, true), b = name.charCodeAt(at);
    if (a !== b) return a < b ? -1 : 1;
  }
  return node.length < name.length ? -1 : node.length > name.length ? 1 : 0;
}
async function fieldOf(io, node, name) {
  nodeOf(node);
  if (node.kind === 'object') {
    for (const item of node.entries) { const entry = entryOf(item, node.entries.length); if (await compareField(io, entry[0], name) === 0) return entry[1]; }
    return {kind: 'undefined'};
  }
  if (node.kind !== 'object-pages') fail('The request path does not name an object.');
  let lo = 0, hi = node.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2), entry = entryOf(await one(io, node.entries, mid), node.length), order = await compareField(io, entry[0], name);
    if (order === 0) return entry[1];
    if (order < 0) lo = mid + 1; else hi = mid;
  }
  return {kind: 'undefined'};
}

export async function requestNode(io, root, path = []) {
  if (keys(path, ['requestNode'])) return nodeOf(path.requestNode);
  if (!Array.isArray(path) || path.length > MAX_DEPTH) fail('A request path has at most 64 fields.');
  const base = keys(path[0], ['requestNode']);
  let node = base ? nodeOf(path[0].requestNode) : await rootOf(io, root);
  for (const part of base ? path.slice(1) : path) {
    if (typeof part === 'string' && part.length <= INLINE_BYTES) node = await fieldOf(io, node, part);
    else if (integer(part)) {
      nodeOf(node);
      if (node.kind === 'array') { if (part >= node.items.length) fail('Request list position is outside its bounds.'); node = node.items[part]; }
      else if (node.kind === 'array-pages') { if (part >= node.length) fail('Request list position is outside its bounds.'); node = await one(io, node.items, part); }
      else fail('The request path does not name a list.');
    } else fail('A request path contains a field name or list position.');
    nodeOf(node);
  }
  return node;
}
function inline(node, depth = 0) {
  nodeOf(node); if (depth > MAX_DEPTH) fail('Request data is nested too deeply.');
  switch (node.kind) {
    case 'atom': return {value: node.value};
    case 'undefined': return {value: undefined};
    case 'negative-zero': return {value: -0};
    case 'bigint': return {value: BigInt(node.value)};
    case 'array': {
      const value = [];
      for (const child of node.items) { const item = inline(child, depth + 1); if (!item) return null; value.push(item.value); }
      return {value};
    }
    case 'object': {
      const value = {}, positions = new Set();
      for (let at = 0; at < node.entries.length; at++) {
        const [key, child, position] = entryOf(node.entries[at], node.entries.length), item = inline(child, depth + 1);
        if (!item || key.kind !== 'atom') return null;
        if (position !== at || positions.has(key.value)) fail('Request object enumeration changed.');
        positions.add(key.value); property(value, key.value, item.value);
      }
      return {value};
    }
    default: return null;
  }
}
const expose = node => { const small = inline(node); return small ? small.value : {requestNode: node}; };
export async function requestField(io, root, path) { return expose(await requestNode(io, root, path)); }
export async function requestLength(io, root, path) {
  const node = await requestNode(io, root, path);
  if (node.kind === 'array') return node.items.length;
  if (['array-pages', 'object-pages', 'typed', 'text'].includes(node.kind)) return node.length;
  if (node.kind === 'object') return node.entries.length;
  if (node.kind === 'atom' && typeof node.value === 'string') return node.value.length;
  fail('The request field has no length.');
}
export async function requestItems(io, root, path, from, count = RECORD_PAGE_ITEMS) {
  const node = await requestNode(io, root, path), length = node.kind === 'array' ? node.items.length : node.length;
  if (!['array', 'array-pages'].includes(node.kind) || !integer(from, length) || !integer(count, RECORD_PAGE_ITEMS) || count < 1)
    fail('A request list read contains 1..128 items.');
  const take = Math.min(count, length - from), source = node.kind === 'array' ? node.items.slice(from, from + take)
    : recordIndexRange(io, node.items, from, take);
  const items = []; let bytes = 0;
  for await (const child of source) {
    nodeOf(child); const n = size(child);
    if (items.length && bytes + n > RECORD_PAGE_BYTES) break;
    if (n > RECORD_PAGE_BYTES) fail('A request list item exceeds one page.');
    items.push(expose(child)); bytes += n;
  }
  return {items, next: from + items.length, length};
}

export async function requestCursor(io, root, path, from = 0, length) {
  const node = await requestNode(io, root, path), total = node.kind === 'array' ? node.items.length : node.length;
  if (length === undefined) length = total - from;
  if (!['array', 'array-pages'].includes(node.kind) || !integer(from, total) || !integer(length, total - from))
    fail('Invalid request list cursor range.');
  if (node.kind === 'array-pages') return {schema: 1, kind: 'request-list', records: recordIndexCursor(node.items, from, length)};
  return {schema: 1, kind: 'request-list-inline', items: node.items, from, end: from + length, at: from};
}

export async function requestPage(io, saved) {
  if (saved?.kind === 'request-list' && keys(saved, ['schema', 'kind', 'records']) && saved.schema === 1) {
    const next = await advanceRecordIndex(io, saved.records), cursor = {schema: 1, kind: 'request-list', records: next.cursor};
    return {cursor, items: next.items.map(expose), next: next.cursor.at, remaining: next.cursor.end - next.cursor.at,
      length: next.cursor.total, done: next.done};
  }
  if (!keys(saved, ['schema', 'kind', 'items', 'from', 'end', 'at']) || saved.schema !== 1 || saved.kind !== 'request-list-inline' ||
      !Array.isArray(saved.items) || saved.items.length > 256 || size(saved.items) > INLINE_BYTES ||
      !integer(saved.from, saved.items.length) || !integer(saved.at, saved.items.length) || !integer(saved.end, saved.items.length) ||
      saved.from > saved.at || saved.at > saved.end) fail('Invalid request list cursor.');
  const end = Math.min(saved.end, saved.at + RECORD_PAGE_ITEMS), items = saved.items.slice(saved.at, end).map(expose);
  const cursor = {...saved, at: end};
  return {cursor, items, next: end, remaining: saved.end - end, length: saved.items.length, done: end === saved.end};
}

export async function requestTypedRange(io, root, path, from, count) {
  const node = await requestNode(io, root, path);
  if (node.kind !== 'typed' || !integer(from, node.length) || !integer(count) || from + count > node.length)
    fail('Invalid request typed-array range.');
  const width = TYPES[node.type].BYTES_PER_ELEMENT ?? 1, bytes = await bytesOf(io, node, from * width, count * width);
  return fromBytes(node.type, byteOrder(bytes, width));
}

export async function readRequest(io, root) {
  const decode = async (node, depth) => {
    nodeOf(node); if (depth > MAX_DEPTH) fail('Request data is nested too deeply.');
    const small = inline(node, depth); if (small) return small.value;
    if (node.kind === 'text') return textOf(io, node);
    if (node.kind === 'typed') {
      const bytes = new Uint8Array(node.byteLength);
      for (let at = 0; at < bytes.length; at += REQUEST_CHUNK_BYTES) bytes.set(await bytesOf(io, node, at, Math.min(REQUEST_CHUNK_BYTES, bytes.length - at)), at);
      return fromBytes(node.type, byteOrder(bytes, TYPES[node.type].BYTES_PER_ELEMENT ?? 1));
    }
    if (node.kind === 'array' || node.kind === 'array-pages') {
      const result = [], items = node.kind === 'array' ? node.items : recordIndexItems(io, node.items);
      for await (const child of items) result.push(await decode(child, depth + 1));
      return result;
    }
    const entries = node.kind === 'object' ? node.entries : recordIndexItems(io, node.entries), ordered = [], names = new Set();
    const length = node.kind === 'object' ? node.entries.length : node.length;
    let previous = null;
    for await (const item of entries) {
      const [key, child, position] = entryOf(item, length), name = await textOf(io, key);
      if (ordered[position] || names.has(name) || node.kind === 'object-pages' && previous !== null && name <= previous)
        fail('Request object enumeration changed.');
      names.add(name); previous = name; ordered[position] = [name, child];
    }
    if (ordered.length !== length || ordered.some(item => !item)) fail('Request fields are truncated.');
    const result = {};
    for (const [name, child] of ordered) property(result, name, await decode(child, depth + 1));
    return result;
  };
  return decode(await rootOf(io, root), 0);
}
export function requestIO(io, root) {
  if (root === null) return {request: null};
  return {request: root,
    requestField: path => requestField(io, root, path), requestLength: path => requestLength(io, root, path),
    requestItems: (path, from, count) => requestItems(io, root, path, from, count),
    requestCursor: (path, from, length) => requestCursor(io, root, path, from, length),
    requestPage: cursor => requestPage(io, cursor),
    requestTypedRange: (path, from, count) => requestTypedRange(io, root, path, from, count)};
}
