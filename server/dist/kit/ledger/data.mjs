// SPDX-License-Identifier: MIT
// Only plain JSON data enters the public format. Accessors and toJSON are never executed.
export function fault(message) { return Object.assign(new Error('Ledger: ' + message), {code: 'ledger_invalid'}); }
export function canonicalJSON(value, depth = 0, active = new Set()) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { if (/[\uD800-\uDFFF]/u.test(value)) throw fault('unpaired surrogate'); return JSON.stringify(value); }
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || depth > 64 || active.has(value)) throw fault('not plain JSON data');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (!array && proto !== null && (Object.getPrototypeOf(proto) !== null || Object.getOwnPropertyDescriptor(proto, 'constructor')?.value?.name !== 'Object')) throw fault('not a plain object');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  for (const key of keys) {
    if (array && key === 'length') continue;
    const field = descriptors[key];
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(field, 'value') || !field.enumerable) throw fault('non-data property');
  }
  if (array && (keys.length !== value.length + 1 || keys.some(k => k !== 'length' && (!/^(0|[1-9]\d*)$/.test(k) || +k >= value.length)))) throw fault('sparse array');
  active.add(value);
  const encode = item => canonicalJSON(item, depth + 1, active);
  const out = array ? '[' + Array.from({length: value.length}, (_, i) => encode(descriptors[i].value)).join(',') + ']'
    : '{' + keys.sort().map(key => JSON.stringify(key) + ':' + encode(descriptors[key].value)).join(',') + '}';
  active.delete(value); return out;
}
export function plainData(value) { return JSON.parse(canonicalJSON(typeof value === 'string' ? JSON.parse(value) : value)); }
export function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function documentText(text) {
  if (typeof text !== 'string' || /[\uD800-\uDFFF]/u.test(text)) throw fault('document is not whole-character text');
  if (new TextEncoder().encode(text).length > 25 * 1024 * 1024) throw fault('document exceeds the editor text limit');
  return text;
}
export const nonnegative = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
