// SPDX-License-Identifier: AGPL-3.0-only
// base124: script data passes 0x01-0x7F except NUL, CR, `<`; LF is excluded too. 124 symbols, 13 or 14 bits per pair (basE91's scheme, base 124).
// The build encodes; the page decodes (inlined into the runtime loader).
export const BASE124_SYMBOLS = new Uint8Array([...Array(127).keys()].map(code => code + 1).filter(code => code !== 10 && code !== 13 && code !== 60));
const PAIR = 124 * 124, FOURTEEN_BELOW = PAIR - 8192; // 7,184: a thirteen-bit value under this takes a fourteenth bit
const values = new Int8Array(128).fill(-1);
BASE124_SYMBOLS.forEach((code, index) => { values[code] = index; });
const fail = reason => { throw new Error(reason); };

export function encodeBase124(value) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes) return fail('base124_bytes_invalid');
  const out = new Uint8Array(Math.ceil(bytes.length * 8 / 13) * 2 + 2);
  let pending = 0, bits = 0, length = 0;
  for (let index = 0; index < bytes.length; index++) {
    pending |= bytes[index] << bits;
    bits += 8;
    if (bits > 13) {
      let pair = pending & 8191;
      const take = pair < FOURTEEN_BELOW ? 14 : 13;
      if (take === 14) pair = pending & 16383;
      pending >>>= take;
      bits -= take;
      out[length++] = BASE124_SYMBOLS[pair % 124];
      out[length++] = BASE124_SYMBOLS[(pair / 124) | 0];
    }
  }
  if (bits) {
    out[length++] = BASE124_SYMBOLS[pending % 124];
    if (bits > 7 || pending > 123) out[length++] = BASE124_SYMBOLS[(pending / 124) | 0];
  }
  return new TextDecoder('latin1').decode(out.subarray(0, length));
}

/** Decode base124 text. LF and CR between symbols are skipped; any other character refuses. */
export function decodeBase124(text, {expectedBytes, maxBytes = Infinity} = {}) {
  if (typeof text !== 'string') return fail('base124_text_invalid');
  if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) return fail('base124_byte_limit');
  if (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxBytes)) return fail('base124_byte_limit');
  const bytes = new Uint8Array(expectedBytes ?? Math.min(maxBytes, Math.ceil(text.length * 7 / 8)));
  let pending = 0, bits = 0, pair = -1, length = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 10 || code === 13) continue;
    const value = code < 128 ? values[code] : -1;
    if (value < 0) return fail('base124_invalid');
    if (pair < 0) { pair = value; continue; }
    pair += value * 124;
    pending |= pair << bits;
    bits += (pair & 8191) < FOURTEEN_BELOW ? 14 : 13;
    pair = -1;
    do {
      if (length === bytes.length) return fail(expectedBytes === undefined ? 'base124_byte_limit' : 'base124_byte_length');
      bytes[length++] = pending & 255;
      pending >>>= 8;
      bits -= 8;
    } while (bits > 7);
  }
  if (pair >= 0) {
    if (length === bytes.length) return fail(expectedBytes === undefined ? 'base124_byte_limit' : 'base124_byte_length');
    bytes[length++] = (pending | pair << bits) & 255;
  }
  if (expectedBytes !== undefined && length !== expectedBytes) return fail('base124_byte_length');
  return length === bytes.length ? bytes : bytes.slice(0, length);
}
