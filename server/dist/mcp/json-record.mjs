import {jsonValueParts} from '../agent/json-value.mjs';
const SMALL_CHARS = 65536;

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

export function jsonRecord(value, chunkChars = 32768) {
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
  return {bytes, chars, parts: Math.ceil(chars / chunkChars),
    *[Symbol.iterator]() {
      if (small !== undefined) {
        for (let start = 0; start < small.length; start += chunkChars) yield small.slice(start, start + chunkChars);
      } else yield* jsonChunks(value, chunkChars);
    }};
}
