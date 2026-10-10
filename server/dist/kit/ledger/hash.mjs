// SPDX-License-Identifier: MIT
// The editor's path-dependent root, plus synchronous SHA-256 for file readers (including offline wrappers).
export function textRoot(text) {
  let fnv = 0x811c9dc5, a = 1, b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 16777619); a = (a + c) % 65521; b = (b + a) % 65521;
  }
  return text.length + ':' + (fnv >>> 0).toString(36) + ':' + (((b << 16) | a) >>> 0).toString(36);
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
// The rounds run on plain 32-bit locals: no array is made per block, so a megabyte (a painting's text) hashes about five times
// faster than through destructured arrays, with the same digest.
const W = new Int32Array(64);
export function sha256(text) {
  const bytes = new TextEncoder().encode(text), length = bytes.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64), end = padded.length;
  padded.set(bytes); padded[length] = 0x80;
  const high = Math.floor(length * 8 / 0x100000000), low = (length * 8) >>> 0;
  padded[end - 8] = high >>> 24; padded[end - 7] = high >>> 16; padded[end - 6] = high >>> 8; padded[end - 5] = high;
  padded[end - 4] = low >>> 24; padded[end - 3] = low >>> 16; padded[end - 2] = low >>> 8; padded[end - 1] = low;
  let h0 = 0x6a09e667 | 0, h1 = 0xbb67ae85 | 0, h2 = 0x3c6ef372 | 0, h3 = 0xa54ff53a | 0, h4 = 0x510e527f | 0, h5 = 0x9b05688c | 0, h6 = 0x1f83d9ab | 0, h7 = 0x5be0cd19 | 0;
  const w = W;
  for (let offset = 0; offset < end; offset += 64) {
    for (let i = 0, j = offset; i < 16; i++, j += 4) w[i] = padded[j] << 24 | padded[j + 1] << 16 | padded[j + 2] << 8 | padded[j + 3];
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + ((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ x >>> 3) + w[i - 7] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ y >>> 10)) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, k = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + (e & f ^ ~e & g) + K[i] + w[i]) | 0;
      const t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + (a & b ^ a & c ^ b & c)) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + k) | 0;
  }
  let out = '';
  for (const x of [h0, h1, h2, h3, h4, h5, h6, h7]) out += (x >>> 0).toString(16).padStart(8, '0');
  return out;
}
