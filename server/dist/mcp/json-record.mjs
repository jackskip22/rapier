import {jsonValueParts, ownedJsonEntry} from '../agent/json-value.mjs';
import {heldSourceFacts} from '../kit/ledger/source.mjs';
const SMALL_CHARS = 65536;

const GEAR = (() => {
  const table = new Int32Array(256);
  let x = 0x9e3779b9;
  for (let index = 0; index < 256; index++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; table[index] = x; }
  return table;
})();
const CUT_MASK = 0xfff80000 | 0;
const LONG_PIECE = 4096, PIECE_CUTS = new Map(), STRING_COUNTS = new Map(), SHORT_COUNTS = new Map();
const SHORT_COUNT_LIMIT = 1024;
let cutChars = 0, countChars = 0;
function scanPiece(piece, index, state, chunkChars, cut) {
  const least = chunkChars >> 1, window = least - 32;
  let {length, hash} = state;
  while (index < piece.length) {
    if (length < window) {
      const step = Math.min(window - length, piece.length - index);
      index += step; length += step; continue;
    }
    hash = (hash << 1) + GEAR[piece.charCodeAt(index++) & 255] | 0;
    if (++length === chunkChars || length >= least && (hash & CUT_MASK) === 0) {
      length = 0; hash = 0;
      if (cut(index)) { state.length = 0; state.hash = 0; return index; }
    }
  }
  state.length = length; state.hash = hash;
  return index;
}
export function* contentChunks(pieces, chunkChars = 32768) {
  if (!Number.isSafeInteger(chunkChars) || chunkChars < 64) throw new TypeError('Invalid JSON chunk size');
  const window = (chunkChars >> 1) - 32;
  let held = [];
  const state = {length: 0, hash: 0};
  for (const piece of pieces) {
    if (!piece) continue;
    if (state.length + piece.length <= window) {
      state.length += piece.length;
      held.push(piece);
      continue;
    }
    let start = 0, out;
    if (piece.length >= LONG_PIECE) {
      const startLength = state.length, startHash = state.hash;
      let entries = PIECE_CUTS.get(piece);
      const hit = entries?.find(e => e.chunkChars === chunkChars && e.startLength === startLength && e.startHash === startHash);
      if (hit) {
        out = hit.cuts;
        state.length = hit.length; state.hash = hit.hash;
        PIECE_CUTS.delete(piece);
        PIECE_CUTS.set(piece, entries);
      } else {
        out = [];
        const ref = entries?.find(e => e.chunkChars === chunkChars && e.cuts.length > 0);
        const cuts = ref ? ref.cuts : [];
        let joined = false, at = 0;
        scanPiece(piece, 0, state, chunkChars, end => {
          out.push(end);
          while (at < cuts.length && cuts[at] < end) at++;
          return joined = at < cuts.length && cuts[at] === end;
        });
        if (joined) {
          for (at++; at < cuts.length; at++) out.push(cuts[at]);
          state.length = ref.length; state.hash = ref.hash;
        }
        const entry = {chunkChars, startLength, startHash, cuts: out, length: state.length, hash: state.hash};
        if (!entries && piece.length > 4 * 1024 * 1024) {
        } else if (entries) {
          PIECE_CUTS.delete(piece);
          if (entries.length >= 4) entries.shift();
          entries.push(entry);
        } else {
          while (PIECE_CUTS.size >= 256 || cutChars + piece.length > 4 * 1024 * 1024 && PIECE_CUTS.size) {
            const oldest = PIECE_CUTS.keys().next().value;
            cutChars -= oldest.length;
            PIECE_CUTS.delete(oldest);
          }
          cutChars += piece.length;
          entries = [entry];
        }
        if (entries) PIECE_CUTS.set(piece, entries);
      }
    } else {
      out = [];
      scanPiece(piece, 0, state, chunkChars, end => { out.push(end); return false; });
    }
    for (let i = 0; i < out.length; i++) {
      const end = out[i], slice = piece.slice(start, end);
      start = end;
      if (held.length) { held.push(slice); yield held.join(''); held = []; }
      else yield slice;
    }
    if (start < piece.length) held.push(start ? piece.slice(start) : piece);
  }
  if (state.length) yield held.length === 1 ? held[0] : held.join('');
}

export function* jsonChunks(value, chunkChars = 32768) {
  if (!Number.isSafeInteger(chunkChars) || chunkChars < 1) throw new TypeError('Invalid JSON chunk size');
  let chunk = '';
  for (const part of jsonValueParts(value)) {
    if (part === undefined) continue;
    for (let offset = 0; offset < part.length;) {
      const end = Math.min(part.length, offset + chunkChars - chunk.length);
      chunk += part.slice(offset, end);
      offset = end;
      if (chunk.length === chunkChars) { yield chunk; chunk = ''; }
    }
  }
  if (chunk) yield chunk;
}

function rememberShortCount(string, result) {
  if (SHORT_COUNTS.has(string)) SHORT_COUNTS.delete(string);
  else if (SHORT_COUNTS.size >= SHORT_COUNT_LIMIT) SHORT_COUNTS.delete(SHORT_COUNTS.keys().next().value);
  SHORT_COUNTS.set(string, result);
}

function measureJsonString(string) {
  if (string.length <= 64) {
    const hit = SHORT_COUNTS.get(string);
    if (hit !== undefined) { rememberShortCount(string, hit); return hit; }
  } else if (string.length >= LONG_PIECE) {
    const measured = heldSourceFacts(string);
    if (measured) return measured;
    const cached = STRING_COUNTS.get(string);
    if (cached !== undefined) {
      STRING_COUNTS.delete(string);
      STRING_COUNTS.set(string, cached);
      return cached;
    }
  }
  let jsonChars = string.length, jsonBytes = string.length;
  for (let index = 0; index < string.length; index++) {
    const code = string.charCodeAt(index);
    if (code >= 32 && code < 0x80 && code !== 34 && code !== 92) continue;
    if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
      jsonChars++; jsonBytes++;
    } else if (code < 32) {
      jsonChars += 5; jsonBytes += 5;
    } else if (code >= 0xd800 && code <= 0xdbff && string.charCodeAt(index + 1) >= 0xdc00 && string.charCodeAt(index + 1) <= 0xdfff) {
      jsonBytes += 2; index++;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      jsonChars += 5; jsonBytes += 5;
    } else {
      jsonBytes += code < 0x800 ? 1 : 2;
    }
  }
  const result = {jsonChars, jsonBytes};
  if (string.length <= 64) { rememberShortCount(string, result); return result; }
  if (string.length >= LONG_PIECE && string.length <= 4 * 1024 * 1024) {
    while (STRING_COUNTS.size >= 256 || countChars + string.length > 4 * 1024 * 1024 && STRING_COUNTS.size) {
      const oldest = STRING_COUNTS.keys().next().value;
      countChars -= oldest.length;
      STRING_COUNTS.delete(oldest);
    }
    countChars += string.length;
    STRING_COUNTS.set(string, result);
  }
  return result;
}

export function jsonRecord(value, chunkChars = 32768, {contentDefined = false} = {}) {
  if (!Number.isSafeInteger(chunkChars) || chunkChars < 1) throw new TypeError('Invalid JSON chunk size');
  const prepare = (value, key) => value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
  const missing = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
  let chars = 0, bytes = 0, maxDepth = 1;
  const frames = [{value: prepare(value, ''), index: -1}], active = new Set();
  while (frames.length) {
    if (frames.length > maxDepth) maxDepth = frames.length;
    const frame = frames[frames.length - 1];
    if (frame.index < 0) {
      if (typeof frame.value === 'string') {
        const m = measureJsonString(frame.value);
        chars += 2 + m.jsonChars; bytes += 2 + m.jsonBytes;
        frames.pop(); continue;
      }
      const object = frame.value && typeof frame.value === 'object';
      const prototype = object && Object.getPrototypeOf(frame.value);
      if (!object || !Array.isArray(frame.value) && prototype !== Object.prototype && prototype !== null) {
        const encoded = JSON.stringify(frame.value);
        const len = encoded === undefined ? 0 : encoded.length;
        chars += len; bytes += len;
        frames.pop(); continue;
      }
      if (active.has(frame.value)) throw Object.assign(new TypeError('Cyclic tool input cannot be represented as JSON.'), {code: 'invalid_arguments', path: 'arguments'});
      active.add(frame.value);
      frame.keys = Array.isArray(frame.value) ? null : Object.keys(frame.value);
      frame.length = frame.keys ? frame.keys.length : frame.value.length;
      frame.index = 0; frame.written = 0;
      chars++; bytes++;
    }
    if (frame.index === frame.length) {
      chars++; bytes++;
      active.delete(frame.value); frames.pop(); continue;
    }
    const key = frame.keys ? frame.keys[frame.index] : frame.index;
    frame.index++;
    let child = prepare(frame.value[key], String(key));
    if (frame.keys && missing(child)) continue;
    if (frame.written++) { chars++; bytes++; }
    if (frame.keys) {
      const m = measureJsonString(key);
      chars += 3 + m.jsonChars; bytes += 3 + m.jsonBytes;
    }
    if (!frame.keys && missing(child)) { chars += 4; bytes += 4; continue; }
    if (typeof child === 'string') {
      const m = measureJsonString(child);
      chars += 2 + m.jsonChars; bytes += 2 + m.jsonBytes;
      continue;
    }
    if (child === null || child === true) { chars += 4; bytes += 4; continue; }
    if (child === false) { chars += 5; bytes += 5; continue; }
    if (typeof child === 'number') {
      const len = Number.isFinite(child) ? ('' + child).length : 4;
      chars += len; bytes += len;
      continue;
    }
    const owned = ownedJsonEntry(child);
    if (owned) {
      chars += owned.chars; bytes += owned.bytes;
      continue;
    }
    frames.push({value: child, index: -1});
  }
  let small;
  if (chars <= SMALL_CHARS && maxDepth <= 64) small = JSON.stringify(value) ?? '';
  if (contentDefined) return {bytes, chars, parts: null,
    *[Symbol.iterator]() { yield* contentChunks(small !== undefined ? [small] : jsonValueParts(value), chunkChars); }};
  return {bytes, chars, parts: Math.ceil(chars / chunkChars),
    *[Symbol.iterator]() {
      if (small !== undefined) {
        for (let start = 0; start < small.length; start += chunkChars) yield small.slice(start, start + chunkChars);
      } else yield* jsonChunks(value, chunkChars);
    }};
}
