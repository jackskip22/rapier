// SPDX-License-Identifier: MIT
export function textRoot(text) {
  return textRootParts([text]);
}
export function textRootParts(parts) {
  let fnv = 0x811c9dc5, a = 1, b = 0, length = 0;
  for (const text of parts) {
    length += text.length;
    for (let i = 0; i < text.length;) {
      const end = Math.min(text.length, i + 4096);
      for (; i < end; i++) { const c = text.charCodeAt(i); fnv = Math.imul(fnv ^ c, 16777619); a += c; b += a; }
      a %= 65521; b %= 65521;
    }
  }
  return length + ':' + (fnv >>> 0).toString(36) + ':' + (((b << 16) | a) >>> 0).toString(36);
}
export function rootAfter(root, row) {
  return textRoot(String(root || '') + ':' + row.pos + ':' + textRoot(row.removed) + ':' + textRoot(row.inserted));
}
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const rotate = (x, n) => (x >>> n) | (x << (32 - n));
export function sha256State() {
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w = new Uint32Array(64), block = new Uint8Array(64);
  let used = 0, bytes = 0, finished = false;
  const compress = (input, offset) => {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      w[i] = (input[at] << 24) | (input[at + 1] << 16) | (input[at + 2] << 8) | input[at + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = w[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let a=h[0], b=h[1], c=h[2], d=h[3], e=h[4], f=h[5], g=h[6], k=h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=k;
  };
  const feed = (input, size) => {
    bytes += size;
    let at = 0;
    if (used) {
      const take = Math.min(64 - used, size);
      block.set(input.subarray(0, take), used); used += take; at = take;
      if (used === 64) { compress(block, 0); used = 0; }
    }
    for (; at + 64 <= size; at += 64) compress(input, at);
    if (at < size) { block.set(input.subarray(at, size), 0); used = size - at; }
  };
  return {
    update(input) {
      if (finished || !(input instanceof Uint8Array)) throw new TypeError('SHA-256 needs bytes before finish');
      if (!Number.isSafeInteger(bytes + input.length)) throw new Error('SHA-256 input length is not exact');
      feed(input, input.length);
    },
    finish() {
      if (finished) throw new Error('SHA-256 is already finished');
      finished = true;
      block[used++] = 0x80; block.fill(0, used);
      if (used > 56) { compress(block, 0); block.fill(0); }
      const view = new DataView(block.buffer);
      view.setUint32(56, Math.floor(bytes / 0x20000000)); view.setUint32(60, (bytes * 8) >>> 0);
      compress(block, 0);
      return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
    },
    get bytes() { return bytes; },
  };
}
export function createSHA256() {
  const hash = sha256State(), encoded = new Uint8Array(65536), encoder = new TextEncoder();
  let high = '', finished = false;
  const write = text => {
    for (let at = 0; at < text.length;) {
      let end = Math.min(text.length, at + 32768);
      if (end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
      const part = encoder.encodeInto(text.slice(at, end), encoded);
      hash.update(encoded.subarray(0, part.written)); at += part.read;
    }
  };
  return {
    update(value) {
      if (finished) throw new Error('SHA-256 is finished');
      let text = high + String(value === undefined ? '' : value); high = '';
      if (text.length && (text.charCodeAt(text.length - 1) & 0xfc00) === 0xd800) { high = text.slice(-1); text = text.slice(0, -1); }
      write(text); return this;
    },
    digest() {
      if (finished) throw new Error('SHA-256 is finished');
      if (high) { write(high); high = ''; }
      finished = true;
      return hash.finish();
    },
    get bytes() { return hash.bytes; },
  };
}
export function sha256Parts(parts) {
  const hash = createSHA256();
  for (const part of parts) hash.update(part);
  return hash.digest();
}
export function sha256(text) { return createSHA256().update(text).digest(); }
