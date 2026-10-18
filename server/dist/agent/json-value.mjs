// SPDX-License-Identifier: AGPL-3.0-only
import {heldSourceView} from '../kit/ledger/source.mjs';
const LONG_STRING = 65536, ESCAPED = new Map();
function escapedPart(value) {
  if (value.length >= LONG_STRING) {
    let escaped = ESCAPED.get(value);
    if (escaped === undefined) {
      escaped = JSON.stringify(value).slice(1, -1);
      if (ESCAPED.size >= 4) ESCAPED.delete(ESCAPED.keys().next().value);
    } else ESCAPED.delete(value);
    ESCAPED.set(value, escaped);
    return escaped;
  }
  return JSON.stringify(value).slice(1, -1);
}
export function* jsonStringParts(value) {
  const source = value.length >= LONG_STRING && heldSourceView(value);
  if (source) {
    yield '"';
    let high = '';
    for (let part of source.parts()) {
      if (high) { part = high + part; high = ''; }
      if ((part.charCodeAt(part.length - 1) & 0xfc00) === 0xd800) { high = part.slice(-1); part = part.slice(0, -1); }
      if (part) yield escapedPart(part);
    }
    if (high) yield escapedPart(high);
    yield '"'; return;
  }
  if (value.length >= LONG_STRING) { yield '"'; yield escapedPart(value); yield '"'; return; }
  yield '"';
  for (let start = 0; start < value.length;) {
    let end = Math.min(value.length, start + 4096);
    if (end < value.length && (value.charCodeAt(end - 1) & 0xfc00) === 0xd800 &&
        (value.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}

export function* jsonValueParts(value, canonical = false, unescaped = false) {
  const prepare = (value, key) => !canonical && value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
  const missing = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
  const frames = [{value: prepare(value, ''), index: -1}], active = new Set();
  while (frames.length) {
    const frame = frames[frames.length - 1];
    if (frame.index < 0) {
      if (typeof frame.value === 'string') {
        if (unescaped) yield {string: frame.value};
        else yield* jsonStringParts(frame.value);
        frames.pop(); continue;
      }
      const object = frame.value && typeof frame.value === 'object';
      const prototype = object && Object.getPrototypeOf(frame.value);
      if (!object || !canonical && !Array.isArray(frame.value) && prototype !== Object.prototype && prototype !== null) {
        const encoded = JSON.stringify(canonical && frame.value === undefined ? null : frame.value);
        yield frames.length === 1 ? encoded : encoded === undefined ? '' : encoded;
        frames.pop(); continue;
      }
      if (active.has(frame.value)) throw Object.assign(new TypeError('Cyclic tool input cannot be represented as JSON.'), {code: 'invalid_arguments', path: 'arguments'});
      active.add(frame.value);
      frame.keys = Array.isArray(frame.value) ? null : Object.keys(frame.value);
      if (frame.keys && canonical) frame.keys.sort();
      frame.length = frame.keys ? frame.keys.length : frame.value.length;
      frame.index = 0; frame.written = 0;
      yield frame.keys ? '{' : '[';
    }
    if (frame.index === frame.length) {
      yield frame.keys ? '}' : ']'; active.delete(frame.value); frames.pop(); continue;
    }
    const key = frame.keys ? frame.keys[frame.index] : frame.index;
    frame.index++;
    let child = prepare(frame.value[key], String(key));
    if (!canonical && frame.keys && missing(child)) continue;
    if (frame.written++) yield ',';
    if (frame.keys) { if (unescaped) yield {string: key}; else yield* jsonStringParts(key); yield ':'; }
    if (canonical && !frame.keys && !(key in frame.value)) continue;
    if (!canonical && !frame.keys && missing(child)) child = null;
    if (canonical && frame.keys && child !== undefined && missing(child)) { yield 'undefined'; continue; }
    frames.push({value: child, index: -1});
  }
}

export function jsonText(value, canonical = false) {
  const parts = [...jsonValueParts(value, canonical)];
  return parts.length === 1 && parts[0] === undefined ? undefined : parts.join('');
}
