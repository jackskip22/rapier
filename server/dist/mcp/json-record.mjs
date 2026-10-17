import {jsonValueParts} from '../agent/json-value.mjs';
const SMALL_CHARS = 65536;

const GEAR = (() => {
  const table = new Int32Array(256);
  let x = 0x9e3779b9;
  for (let index = 0; index < 256; index++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; table[index] = x; }
  return table;
})();
const CUT_MASK = 0xfff80000 | 0;
const LONG_PIECE = 65536, PIECE_CUTS = new Map();
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
  let held = [];
  const state = {length: 0, hash: 0};
  for (const piece of pieces) {
    if (piece === undefined) continue;
    let start = 0;
    const out = [];
    if (piece.length >= LONG_PIECE) {
      const kept = PIECE_CUTS.get(piece), cuts = kept?.chunkChars === chunkChars ? kept.cuts : [];
      let joined = false, at = 0;
      scanPiece(piece, 0, state, chunkChars, end => {
        out.push(end);
        while (at < cuts.length && cuts[at] < end) at++;
        return joined = at < cuts.length && cuts[at] === end;
      });
      if (joined) {
        for (at++; at < cuts.length; at++) out.push(cuts[at]);
        state.length = kept.length; state.hash = kept.hash;
      }
      if (kept) PIECE_CUTS.delete(piece);
      else if (PIECE_CUTS.size >= 4) PIECE_CUTS.delete(PIECE_CUTS.keys().next().value);
      PIECE_CUTS.set(piece, {chunkChars, cuts: out, length: state.length, hash: state.hash});
    } else scanPiece(piece, 0, state, chunkChars, end => { out.push(end); return false; });
    for (const end of out) {
      held.push(piece.slice(start, end)); start = end;
      yield held.join(''); held = [];
    }
    if (start < piece.length) held.push(start ? piece.slice(start) : piece);
  }
  if (state.length) yield held.join('');
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

export function jsonRecord(value, chunkChars = 32768, {contentDefined = false} = {}) {
  if (!Number.isSafeInteger(chunkChars) || chunkChars < 1) throw new TypeError('Invalid JSON chunk size');
  let chars = 0, bytes = 0, tokens = 0;
  for (const part of jsonValueParts(value, false, true)) {
    if (part === undefined) continue;
    tokens++;
    if (typeof part === 'string') {
      chars += part.length;
      bytes += part.length;
      continue;
    }
    const string = part.string;
    chars += 2; bytes += 2;
    for (let index = 0; index < string.length; index++) {
      const code = string.charCodeAt(index);
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
        chars += 2; bytes += 2;
      } else if (code < 32) {
        chars += 6; bytes += 6;
      } else if (code >= 0xd800 && code <= 0xdbff && string.charCodeAt(index + 1) >= 0xdc00 && string.charCodeAt(index + 1) <= 0xdfff) {
        chars += 2; bytes += 4; index++;
      } else if (code >= 0xd800 && code <= 0xdfff) {
        chars += 6; bytes += 6;
      } else {
        chars++;
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      }
    }
  }
  let small;
  if (chars <= SMALL_CHARS && tokens <= 1024) small = JSON.stringify(value) ?? '';
  if (contentDefined) return {bytes, chars, parts: null,
    *[Symbol.iterator]() { yield* contentChunks(small !== undefined ? [small] : jsonValueParts(value), chunkChars); }};
  return {bytes, chars, parts: Math.ceil(chars / chunkChars),
    *[Symbol.iterator]() {
      if (small !== undefined) {
        for (let start = 0; start < small.length; start += chunkChars) yield small.slice(start, start + chunkChars);
      } else yield* jsonChunks(value, chunkChars);
    }};
}
