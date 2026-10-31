// SPDX-License-Identifier: MIT
export function fault(message) { return Object.assign(new Error('Ledger: ' + message), {code: 'ledger_invalid'}); }
export const plainPrototype = proto => proto === null || Object.getPrototypeOf(proto) === null &&
  Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(proto, 'constructor')?.value || {}, 'name')?.value === 'Object';
export function fields(value, depth, active, sorted = true) {
  if (!value || typeof value !== 'object' || depth > 64 || active.has(value)) throw fault('not plain JSON data');
  const array = Array.isArray(value);
  if (!array && !plainPrototype(Object.getPrototypeOf(value))) throw fault('not a plain object');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  for (const key of keys) {
    if (array && key === 'length') continue;
    const field = descriptors[key];
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(field, 'value') || !field.enumerable) throw fault('non-data property');
  }
  if (array && (keys.length !== value.length + 1 || keys.some(k => k !== 'length' && (!/^(0|[1-9]\d*)$/.test(k) || +k >= value.length)))) throw fault('sparse array');
  return {array, descriptors, keys: array ? keys.filter(key => key !== 'length') : sorted ? keys.sort() : keys};
}
export function scalar(value) {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') { if (!value.isWellFormed()) throw fault('unpaired surrogate'); return true; }
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
}
export function plainData(value) {
  if (typeof value === 'string') value = JSON.parse(value);
  const active = new Set();
  const copy = (value, depth) => {
    if (scalar(value)) return value;
    const {array, descriptors, keys} = fields(value, depth, active);
    const out = array ? [] : {};
    active.add(value);
    for (const key of keys) out[key] = copy(descriptors[key].value, depth + 1);
    active.delete(value); return out;
  };
  return copy(value, 0);
}
function* quoted(text, whole = true) {
  yield '"';
  for (let at = 0; at < text.length;) {
    let end = Math.min(text.length, at + 16384);
    if (end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
    const part = text.slice(at, end);
    if (whole && !part.isWellFormed()) throw fault('unpaired surrogate');
    yield JSON.stringify(part).slice(1, -1); at = end;
  }
  yield '"';
}
function* dataParts(value, depth, active, sorted, known = null) {
  if (typeof value === 'string') { yield* quoted(value); return; }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) {
    yield JSON.stringify(value); return;
  }
  const text = known?.(value, depth);
  if (text !== undefined) { yield text; return; }
  const {array, descriptors, keys} = fields(value, depth, active, sorted);
  active.add(value);
  yield array ? '[' : '{';
  for (let i = 0; i < keys.length; i++) {
    if (i) yield ',';
    const key = keys[i];
    if (!array) { yield* quoted(key, false); yield ':'; }
    yield* dataParts(descriptors[key].value, depth + 1, active, sorted, known);
  }
  yield array ? ']' : '}';
  active.delete(value);
}
export function canonicalParts(value, depth = 0, active = new Set()) { return dataParts(value, depth, active, true); }
export function jsonParts(value) { return dataParts(value, 0, new Set(), false); }
export function jsonPartsKnown(value, known) { return dataParts(value, 0, new Set(), false, known); }
export function jsonTextAt(value, depth) { return Array.from(dataParts(value, depth, new Set(), false)).join(''); }
export function canonicalJSON(value, depth = 0, active = new Set()) { return Array.from(canonicalParts(value, depth, active)).join(''); }
const ownedRows = new WeakSet(), rowCanonical = new Map();
let rowCanonicalChars = 0;
const ROW_CANONICAL_LIMIT = 32 * 1024 * 1024;
function freezeData(value) {
  if (!value || typeof value !== 'object' || ownedRows.has(value) || ownedLedgers.has(value)) return value;
  for (const key of Object.keys(value)) freezeData(value[key]);
  return Object.freeze(value);
}
export function ownRow(row) { if (!ownedRows.has(row)) { freezeData(row); ownedRows.add(row); } return row; }
const ownedLedgers = new WeakSet();
export function ownLedger(ledger) {
  if (ledger && typeof ledger === 'object' && !ownedLedgers.has(ledger)) { freezeData(ledger); ownedLedgers.add(ledger); }
  return ledger;
}
export function isOwnedLedger(ledger) { return !!ledger && ownedLedgers.has(ledger); }
const rowText = new WeakMap();
function canonicalRow(row, depth) {
  if (!ownedRows.has(row)) return canonicalJSON(row, depth);
  const own = rowText.get(row);
  if (own?.depth === depth) return own.json;
  const json = keyedRow(row, depth);
  rowText.set(row, {depth, json});
  return json;
}
function keyedRow(row, depth) {
  const id = typeof row.transaction?.id === 'string' ? row.transaction.id : null, seen = JSON.stringify(row);
  const hit = id === null ? null : rowCanonical.get(id);
  if (hit && hit.depth === depth && hit.seen.includes(seen)) return hit.json;
  const json = canonicalJSON(row, depth);
  if (id !== null && 2 * seen.length + json.length <= ROW_CANONICAL_LIMIT / 4) {
    const size = entry => entry.seen.reduce((sum, text) => sum + text.length, entry.json.length);
    const seenAlso = hit && hit.depth === depth && hit.json === json ? [hit.seen.at(-1), seen] : [seen];
    if (hit) { rowCanonical.delete(id); rowCanonicalChars -= size(hit); }
    const entry = {depth, seen: seenAlso, json};
    rowCanonical.set(id, entry); rowCanonicalChars += size(entry);
    for (const [key, value] of rowCanonical) {
      if (rowCanonicalChars <= ROW_CANONICAL_LIMIT) break;
      rowCanonical.delete(key); rowCanonicalChars -= size(value);
    }
  }
  return json;
}
const plainRowArrays = new WeakSet();
export function* canonicalRowsParts(rows, depth = 0) {
  if (!(depth <= 64 && plainRowArrays.has(rows))) {
    const {array} = fields(rows, depth, new Set());
    if (!array) { yield* canonicalParts(rows, depth); return; }
    if (Object.isFrozen(rows) && depth <= 64) plainRowArrays.add(rows);
  }
  yield '[';
  for (let i = 0; i < rows.length; i++) { if (i) yield ','; yield canonicalRow(rows[i], depth + 1); }
  yield ']';
}
export function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function utf8Length(text, whole = false) {
  let bytes = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if ((code & 0xfc00) === 0xd800 && (text.charCodeAt(at + 1) & 0xfc00) === 0xdc00) { bytes += 4; at++; }
    else { if (whole && code >= 0xd800 && code <= 0xdfff) throw fault('document is not whole-character text'); bytes += 3; }
  }
  return bytes;
}
export function documentBytes(text) {
  if (typeof text !== 'string') throw fault('document is not whole-character text');
  const bytes = utf8Length(text, true);
  if (bytes > 64 * 1024 * 1024) throw fault('document exceeds the editor text limit');
  return bytes;
}
export function documentText(text) { documentBytes(text); return text; }
export const nonnegative = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
