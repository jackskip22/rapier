// SPDX-License-Identifier: AGPL-3.0-only
const RADIX = 140, BLOCK = 7, CAPACITY = 140 ** 7, TWO_49 = 2 ** 49, THRESHOLD = CAPACITY - TWO_49, R4 = 140 ** 4;
const LOW = 124, MID = 13, MID_END = LOW + MID, THREE = RADIX - MID_END, THREE_FULL = THREE * RADIX * RADIX, TWO_TAIL = MID * RADIX;
const ENC = new Uint16Array(LOW), DEC = new Int16Array(128).fill(-1);
{
  let n = 0;
  for (let cp = 1; cp < 128; cp++) {
    if (cp === 10 || cp === 13 || cp === 60) continue;
    ENC[n] = cp; DEC[cp] = n++;
  }
}
const fail = reason => { throw new Error(reason); };
const encode3 = idx => { let cp = 0x0800 + idx; if (cp >= 0x2028) cp += 2; if (cp >= 0xD800) cp += 0x0800; if (cp >= 0xFDD0) cp += 0x0020; return cp; };
const decode3 = cp => { if (cp >= 0xFDF0) cp -= 0x0020; if (cp >= 0xE000) cp -= 0x0800; if (cp >= 0x202A) cp -= 2; return cp - 0x0800; };
function readBits(src, bitPos, n) {
  let value = 0, taken = 0, index = bitPos >>> 3, skip = bitPos & 7, byte = src[index] >>> skip, have = 8 - skip;
  while (taken < n) {
    const take = n - taken < have ? n - taken : have;
    value += (byte & ((1 << take) - 1)) * 2 ** taken;
    taken += take;
    if (taken === n) break;
    byte = src[++index]; have = 8;
  }
  return value;
}

export function encodeBase124(value) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes) return fail('base124_bytes_invalid');
  const header = [];
  let rem = bytes.length;
  while (rem >= 0x80) { header.push((rem & 0x7f) | 0x80); rem >>>= 7; }
  header.push(rem);
  const payload = header.length + bytes.length, src = new Uint8Array(payload + 16);
  src.set(header, 0); src.set(bytes, header.length);
  const digits = [];
  let bitPos = 0;
  const totalBits = payload * 8;
  while (bitPos < totalBits) {
    const v49 = readBits(src, bitPos, 49);
    bitPos += 49;
    let v = v49 < THRESHOLD ? v49 * 2 + readBits(src, bitPos, 1) : v49 + THRESHOLD;
    if (v49 < THRESHOLD) bitPos += 1;
    for (let i = 0; i < BLOCK; i++) { digits.push(v % RADIX); v = Math.floor(v / RADIX); }
  }
  const chars = [];
  for (let i = 0; i < digits.length;) {
    const d0 = digits[i];
    if (d0 < LOW) { chars.push(ENC[d0]); i++; }
    else if (d0 < MID_END) {
      if (i + 1 < digits.length) { chars.push(0x80 + (d0 - LOW) * RADIX + digits[i + 1]); i += 2; }
      else { chars.push(0x80 + TWO_TAIL + (d0 - LOW)); i++; }
    } else if (i + 2 < digits.length) {
      chars.push(encode3(((d0 - MID_END) * RADIX + digits[i + 1]) * RADIX + digits[i + 2])); i += 3;
    } else if (i + 1 < digits.length) {
      chars.push(encode3(THREE_FULL + (d0 - MID_END) * RADIX + digits[i + 1])); i += 2;
    } else { chars.push(0x80 + TWO_TAIL + (d0 - LOW)); i++; }
  }
  let text = '';
  for (let at = 0; at < chars.length; at += 8192) text += String.fromCharCode(...chars.slice(at, at + 8192));
  return text;
}

export function decodeBase124(text, {expectedBytes, maxBytes = Infinity} = {}) {
  if (typeof text !== 'string') return fail('base124_text_invalid');
  if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) return fail('base124_byte_limit');
  if (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxBytes)) return fail('base124_byte_limit');
  const estimate = Math.ceil(text.length * 3 * 50 / 56) + 16;
  const room = maxBytes === Infinity ? estimate : Math.min(estimate, maxBytes + 8);
  const raw = new Uint8Array(room);
  const full = () => fail(expectedBytes === undefined ? 'base124_byte_limit' : 'base124_byte_length');
  let buf = 0, nbits = 0, at = 0;
  const emit = (value, bits) => {
    if (at + 8 > raw.length) return full();
    const low = value >>> 0, high = (value / 4294967296) | 0, s = nbits;
    const w0 = (buf | (low << s)) >>> 0;
    raw[at++] = w0; raw[at++] = w0 >>> 8; raw[at++] = w0 >>> 16; raw[at++] = w0 >>> 24;
    const w1 = ((s ? low >>> (32 - s) : 0) | (high << s)) >>> 0;
    raw[at++] = w1; raw[at++] = w1 >>> 8;
    buf = w1 >>> 16; nbits = s + (bits - 48);
    if (nbits >= 8) { raw[at++] = buf & 255; buf >>>= 8; nbits -= 8; }
  };
  const dig = new Uint16Array(BLOCK);
  let dn = 0;
  const put = d => {
    dig[dn++] = d;
    if (dn < BLOCK) return;
    const v = (((dig[6] * RADIX + dig[5]) * RADIX + dig[4]) * R4) + (((dig[3] * RADIX + dig[2]) * RADIX + dig[1]) * RADIX + dig[0]);
    if (v < THRESHOLD * 2) { const extra = v & 1; emit((v - extra) / 2 + extra * TWO_49, 50); }
    else emit(v - THRESHOLD, 49);
    dn = 0;
  };
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp < 0x80) {
      if (cp === 10 || cp === 13) continue;
      const d = DEC[cp];
      if (d < 0) return fail('base124_invalid');
      put(d);
    } else if (cp < 0x800) {
      const idx = cp - 0x80;
      if (idx >= TWO_TAIL) put(LOW + (idx - TWO_TAIL));
      else { put(LOW + (idx / RADIX | 0)); put(idx % RADIX); }
    } else if ((cp >= 0xD800 && cp <= 0xDFFF) || cp > 0xFFFD) return fail('base124_invalid');
    else {
      const idx = decode3(cp);
      if (idx < 0 || idx >= THREE_FULL + THREE * RADIX) return fail('base124_invalid');
      if (idx >= THREE_FULL) { const rem = idx - THREE_FULL; put(MID_END + (rem / RADIX | 0)); put(rem % RADIX); }
      else {
        const d2 = idx % RADIX, q = (idx - d2) / RADIX;
        put(MID_END + (q / RADIX | 0)); put(q % RADIX); put(d2);
      }
    }
  }
  if (dn) return fail('base124_invalid');
  while (nbits > 0) { if (at === raw.length) return full(); raw[at++] = buf & 255; buf >>>= 8; nbits -= 8; }
  let pos = 0, outLen = 0, shift = 0;
  while (pos < at) {
    const b = raw[pos++];
    outLen += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) return fail('base124_invalid');
  }
  if (!Number.isSafeInteger(outLen) || outLen < 0 || pos + outLen > at) return fail('base124_invalid');
  if (outLen > maxBytes) return full();
  if (expectedBytes !== undefined && outLen !== expectedBytes) return fail('base124_byte_length');
  return raw.subarray(pos, pos + outLen);
}
