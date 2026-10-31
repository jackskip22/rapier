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

export function* jsonValueParts(value, canonical = false, unescaped = false) {
  const prepare = (value, key) => !canonical && value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
  const missing = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
  const frames = [{value: prepare(value, ''), index: -1}], active = new Set();
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
  return parts.length === 1 && parts[0] === undefined ? undefined : parts.join('');
}
