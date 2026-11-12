// SPDX-License-Identifier: AGPL-3.0-only
import {heldSourceView} from '../kit/ledger/source.mjs';
const LONG_STRING = 4096, ESCAPED = new Map(), OWNED_JSON = new WeakMap();
let escapedChars = 0;
export function admitOwnedJson(value) {
  if (value && typeof value === 'object' && !OWNED_JSON.has(value)) OWNED_JSON.set(value, null);
  return value;
}
export function isOwnedJson(value) {
  return Boolean(value && typeof value === 'object' && OWNED_JSON.has(value));
}
export function ownedJsonEntry(value) {
  if (!value || typeof value !== 'object' || !OWNED_JSON.has(value)) return null;
  let entry = OWNED_JSON.get(value);
  if (entry === null) {
    const encoded = JSON.stringify(value);
    let bytes = encoded.length;
    for (let i = 0; i < encoded.length; i++) {
      const code = encoded.charCodeAt(i);
      if (code >= 0x80) bytes += code < 0x800 || code >= 0xd800 && code <= 0xdfff ? 1 : 2;
    }
    entry = {encoded, chars: encoded.length, bytes};
    OWNED_JSON.set(value, entry);
  }
  return entry;
}
export function escapedPart(value) {
  if (value.length >= LONG_STRING) {
    let escaped = ESCAPED.get(value);
    if (escaped === undefined) {
      escaped = JSON.stringify(value).slice(1, -1);
      if (escaped.length > 4 * 1024 * 1024) return escaped;
      while (ESCAPED.size >= 256 || escapedChars + escaped.length > 4 * 1024 * 1024 && ESCAPED.size) {
        const oldest = ESCAPED.keys().next().value;
        escapedChars -= ESCAPED.get(oldest).length;
        ESCAPED.delete(oldest);
      }
      escapedChars += escaped.length;
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
  yield JSON.stringify(value);
}

const FROZEN_JSON = [new WeakMap(), new WeakMap()], NOT_KEPT = new WeakSet(), IMMUTABLE = new WeakSet();
function immutableData(value, active = new Set()) {
  if (IMMUTABLE.has(value)) return true;
  const asked = active.size === 0;
  if (NOT_KEPT.has(value) || !value || typeof value !== 'object' || !Object.isFrozen(value) || active.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) { NOT_KEPT.add(value); return false; }
  const own = Object.getOwnPropertyDescriptors(value);
  if (own.toJSON) { NOT_KEPT.add(value); return false; }
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) if (!own[i]) { NOT_KEPT.add(value); return false; }
  active.add(value);
  for (const slot of Object.values(own)) {
    if (!('value' in slot)) { active.delete(value); NOT_KEPT.add(value); return false; }
    const item = slot.value, type = typeof item;
    if (item === null || type === 'string' || type === 'number' || type === 'boolean') continue;
    if (type !== 'object' || !immutableData(item, active)) { active.delete(value); NOT_KEPT.add(value); return false; }
  }
  active.delete(value);
  if (asked) IMMUTABLE.add(value);
  return true;
}
function frozenText(value, canonical) {
  if (!immutableData(value)) return null;
  const kept = FROZEN_JSON[canonical ? 1 : 0];
  let text = kept.get(value);
  if (text === undefined) {
    text = [...jsonValueParts(value, canonical, false, false)].join('');
    text = JSON.parse(JSON.stringify(text));
    kept.set(value, text);
    const numbers = item => typeof item === 'number';
    if (Array.isArray(value) && value.every(item => numbers(item) || Array.isArray(item) && item.every(numbers))) FROZEN_JSON[canonical ? 0 : 1].set(value, text);
  }
  return text;
}
export function sameJsonData(a, b) {
  if (a === b) return typeof a !== 'number' || Number.isFinite(a);
  if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!(i in a) || !(i in b) || !sameJsonData(a[i], b[i])) return false;
    return true;
  }
  const plain = value => { const prototype = Object.getPrototypeOf(value); return (prototype === Object.prototype || prototype === null) && typeof value.toJSON !== 'function'; };
  if (Array.isArray(b) || !plain(a) || !plain(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !sameJsonData(a[key], b[key])) return false;
  return true;
}
export function keptJsonData(value) {
  if (!value || typeof value !== 'object' || immutableData(value)) return value;
  if (Array.isArray(value)) return value.map(keptJsonData);
  const copy = {};
  for (const key of Object.keys(value)) copy[key] = keptJsonData(value[key]);
  return copy;
}
export function* jsonValueParts(value, canonical = false, unescaped = false, frozen = true) {
  const prepare = (value, key) => !canonical && value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
  const missing = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
  const frames = [{value: prepare(value, ''), index: -1}], active = new Set();
  const plainPrototypes = !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype);
  let chunk = '';
  while (frames.length) {
    const frame = frames[frames.length - 1];
    if (frame.index < 0) {
      if (typeof frame.value === 'string') {
        if (unescaped) yield {string: frame.value};
        else if (frame.value.length < LONG_STRING) {
          chunk += JSON.stringify(frame.value);
          if (chunk.length >= 4096) { yield chunk; chunk = ''; }
        } else {
          if (chunk) { yield chunk; chunk = ''; }
          yield* jsonStringParts(frame.value);
        }
        frames.pop(); continue;
      }
      const object = frame.value && typeof frame.value === 'object';
      const prototype = object && Object.getPrototypeOf(frame.value);
      if (!object || !canonical && !Array.isArray(frame.value) && prototype !== Object.prototype && prototype !== null) {
        const encoded = JSON.stringify(canonical && frame.value === undefined ? null : frame.value);
        if (frames.length === 1 && encoded === undefined) { yield undefined; return; }
        const piece = encoded === undefined ? '' : encoded;
        if (unescaped) yield piece;
        else if (piece.length >= LONG_STRING) {
          if (chunk) { yield chunk; chunk = ''; }
          yield piece;
        } else {
          chunk += piece;
          if (chunk.length >= 4096) { yield chunk; chunk = ''; }
        }
        frames.pop(); continue;
      }
      if (active.has(frame.value)) throw Object.assign(new TypeError('Cyclic tool input cannot be represented as JSON.'), {code: 'invalid_arguments', path: 'arguments'});
      active.add(frame.value);
      frame.keys = Array.isArray(frame.value) ? null : Object.keys(frame.value);
      if (frame.keys && canonical) frame.keys.sort();
      frame.length = frame.keys ? frame.keys.length : frame.value.length;
      frame.index = 0; frame.written = 0;
      if (unescaped) yield frame.keys ? '{' : '[';
      else chunk += frame.keys ? '{' : '[';
    }
    if (frame.index === frame.length) {
      if (unescaped) yield frame.keys ? '}' : ']';
      else {
        chunk += frame.keys ? '}' : ']';
        if (chunk.length >= 4096) { yield chunk; chunk = ''; }
      }
      active.delete(frame.value); frames.pop(); continue;
    }
    const key = frame.keys ? frame.keys[frame.index] : frame.index;
    frame.index++;
    let child = prepare(frame.value[key], String(key));
    if (!canonical && frame.keys && missing(child)) continue;
    if (frame.written++) { if (unescaped) yield ','; else chunk += ','; }
    if (frame.keys) {
      if (unescaped) { yield {string: key}; yield ':'; }
      else if (key.length < LONG_STRING) chunk += JSON.stringify(key) + ':';
      else {
        if (chunk) { yield chunk; chunk = ''; }
        yield* jsonStringParts(key);
        chunk += ':';
      }
    }
    if (canonical && !frame.keys && !(key in frame.value)) continue;
    if (!canonical && !frame.keys && missing(child)) child = null;
    if (canonical && frame.keys && child !== undefined && missing(child)) {
      if (unescaped) yield 'undefined';
      else chunk += 'undefined';
      continue;
    }
    if (typeof child === 'string') {
      if (unescaped) { yield {string: child}; continue; }
      if (child.length < LONG_STRING) {
        chunk += JSON.stringify(child);
        if (chunk.length >= 4096) { yield chunk; chunk = ''; }
        continue;
      }
    } else if (typeof child === 'number' || typeof child === 'boolean' || child === null) {
      const encoded = JSON.stringify(child);
      if (unescaped) yield encoded;
      else {
        chunk += encoded;
        if (chunk.length >= 4096) { yield chunk; chunk = ''; }
      }
      continue;
    } else if (frozen && !unescaped && plainPrototypes && child && typeof child === 'object' && Object.isFrozen(child) && frozenText(child, canonical) !== null) {
      const encoded = frozenText(child, canonical);
      if (encoded.length >= LONG_STRING) {
        if (chunk) { yield chunk; chunk = ''; }
        yield encoded;
      } else {
        chunk += encoded;
        if (chunk.length >= 4096) { yield chunk; chunk = ''; }
      }
      continue;
    } else if (!canonical && !unescaped) {
      const owned = ownedJsonEntry(child);
      if (owned) {
        if (owned.encoded.length >= LONG_STRING) {
          if (chunk) { yield chunk; chunk = ''; }
          yield owned.encoded;
        } else {
          chunk += owned.encoded;
          if (chunk.length >= 4096) { yield chunk; chunk = ''; }
        }
        continue;
      }
    }
    frames.push({value: child, index: -1});
  }
  if (chunk) yield chunk;
}

export function jsonText(value, canonical = false) {
  const parts = [...jsonValueParts(value, canonical)];
  if (parts.length === 1 && parts[0] === undefined) return undefined;
  return parts.join('');
}
