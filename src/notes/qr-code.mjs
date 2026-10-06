// SPDX-License-Identifier: MIT
// Rapier's QR Model 2 encoder. Byte mode, ISO/IEC 18004 versions 1–40.
// The block tables are the standard's error-correction parameters, not executable vendor code.
// No network, dependency, image file or retained copy of the input belongs to an encoded symbol.
const LEVELS = ['L', 'M', 'Q', 'H'];
const CHECK = [
 [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
 [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
];
const BLOCKS = [
 [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
 [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
 [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
 [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
];
const refuse = (code, message) => { throw Object.assign(new RangeError(message), {code}); };
function wordCount(version) {
 let modules = (16 * version + 128) * version + 64;
 if (version > 1) { const n = Math.floor(version / 7) + 2; modules -= (25 * n - 10) * n - 55; }
 if (version > 6) modules -= 36;
 return Math.floor(modules / 8);
}
const dataCount = (version, level) => wordCount(version) - CHECK[level][version - 1] * BLOCKS[level][version - 1];
const countBits = version => version < 10 ? 8 : 16;
function multiply(a, b) {
 let result = 0;
 while (b) { if (b & 1) result ^= a; b >>>= 1; a <<= 1; if (a & 256) a ^= 0x11d; }
 return result;
}
function correction(data, degree) {
 let polynomial = [1], root = 1;
 for (let i = 0; i < degree; i++) {
  const next = new Uint8Array(polynomial.length + 1);
  for (let j = 0; j < polynomial.length; j++) { next[j] ^= polynomial[j]; next[j + 1] ^= multiply(polynomial[j], root); }
  polynomial = next; root = multiply(root, 2);
 }
 const tail = new Uint8Array(degree);
 for (const byte of data) {
  const lead = byte ^ tail[0]; tail.copyWithin(0, 1); tail[degree - 1] = 0;
  for (let i = 0; i < degree; i++) tail[i] ^= multiply(polynomial[i + 1], lead);
 }
 return tail;
}
function interleave(data, version, level) {
 const total = wordCount(version), blocks = BLOCKS[level][version - 1], degree = CHECK[level][version - 1];
 const shortData = Math.floor(total / blocks) - degree, shortBlocks = blocks - total % blocks;
 const bodies = [], tails = [];
 let start = 0;
 for (let i = 0; i < blocks; i++) {
  const end = start + shortData + (i >= shortBlocks ? 1 : 0), body = data.subarray(start, end);
  bodies.push(body); tails.push(correction(body, degree)); start = end;
 }
 const result = new Uint8Array(total); let at = 0;
 for (let i = 0; i <= shortData; i++) for (const body of bodies) if (i < body.length) result[at++] = body[i];
 for (let i = 0; i < degree; i++) for (const tail of tails) result[at++] = tail[i];
 return result;
}
function masked(mask, x, y) {
 switch (mask) {
  case 0: return (x + y) % 2 === 0;
  case 1: return y % 2 === 0;
  case 2: return x % 3 === 0;
  case 3: return (x + y) % 3 === 0;
  case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  case 5: return x * y % 2 + x * y % 3 === 0;
  case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
  default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
 }
}
function penalty(modules, size) {
 let score = 0, dark = 0;
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const at = y * size + x, bit = modules[at]; dark += bit;
  if (x && y && bit === modules[at - 1] && bit === modules[at - size] && bit === modules[at - size - 1]) score += 3;
 }
 for (const vertical of [false, true]) for (let line = 0; line < size; line++) {
  const runs = []; let colour = 0, length = 0;
  for (let i = 0; i < size; i++) {
   const bit = modules[vertical ? i * size + line : line * size + i];
   if (bit === colour) length++;
   else { runs.push(length); if (length >= 5) score += length - 2; colour = bit; length = 1; }
  }
  runs.push(length); if (length >= 5) score += length - 2;
  if (colour) runs.push(0);
  // The four-module quiet zone is white; longer scaled patterns see white past the symbol too.
  runs[0] += size; runs[runs.length - 1] += size;
  for (let i = 1; i + 5 < runs.length; i += 2) {
   const n = runs[i];
   if (runs[i + 1] === n && runs[i + 2] === n * 3 && runs[i + 3] === n && runs[i + 4] === n) {
    if (runs[i - 1] >= n * 4 && runs[i + 5] >= n) score += 40;
    if (runs[i - 1] >= n && runs[i + 5] >= n * 4) score += 40;
   }
  }
 }
 return score + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
}

// M is the screen-transfer policy, not a rule imposed by QR. Take the smallest fitting
// version at that level; spend spare capacity on stronger correction without making it larger.
// Explicit version/level/mask also let the independent host oracle cover the standard's boundaries.
export function encodeQR(value, {level = 'M', version = null, mask = null, boost = true} = {}) {
 const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
 if (!(bytes instanceof Uint8Array) || !LEVELS.includes(level) || version !== null && (!Number.isInteger(version) || version < 1 || version > 40) || mask !== null && (!Number.isInteger(mask) || mask < 0 || mask > 7)) refuse('qr-input', 'the qr input is not complete.');
 let ec = LEVELS.indexOf(level), v = version || 1;
 const fits = (v, ec) => bytes.length < 2 ** countBits(v) && 4 + countBits(v) + bytes.length * 8 <= dataCount(v, ec) * 8;
 while (!fits(v, ec)) { if (version || v === 40) refuse('qr-capacity', 'this device code is too long for one qr code; select and copy it instead.'); v++; }
 if (boost) for (let higher = ec + 1; higher < 4; higher++) if (fits(v, higher)) ec = higher;
 const data = new Uint8Array(dataCount(v, ec)); let bit = 0;
 const append = (value, width) => { for (let i = width - 1; i >= 0; i--, bit++) data[bit >>> 3] |= ((value >>> i) & 1) << (7 - (bit & 7)); };
 append(4, 4); append(bytes.length, countBits(v));
 for (const byte of bytes) append(byte, 8);
 append(0, Math.min(4, data.length * 8 - bit));
 while (bit % 8) append(0, 1);
 for (let i = 0; bit < data.length * 8; i++) append(i % 2 ? 0x11 : 0xec, 8);
 const words = interleave(data, v, ec), size = 17 + v * 4;
 const fixed = new Uint8Array(size * size), modules = new Uint8Array(size * size);
 const put = (x, y, value) => { if (x >= 0 && y >= 0 && x < size && y < size) { const at = y * size + x; modules[at] = value ? 1 : 0; fixed[at] = 1; } };
 for (let i = 0; i < size; i++) { put(i, 6, i % 2 === 0); put(6, i, i % 2 === 0); }
 for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
  const distance = Math.max(Math.abs(x), Math.abs(y)); put(cx + x, cy + y, distance !== 2 && distance !== 4);
 }
 if (v > 1) {
  const count = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.floor((v * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const positions = [6]; for (let p = size - 7; positions.length < count; p -= step) positions.splice(1, 0, p);
  for (let yi = 0; yi < count; yi++) for (let xi = 0; xi < count; xi++) {
   if (yi === 0 && (xi === 0 || xi === count - 1) || xi === 0 && yi === count - 1) continue;
   for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) put(positions[xi] + x, positions[yi] + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
  }
 }
 if (v >= 7) {
  let remainder = v;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  const bits = (v << 12) | remainder;
  for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); put(a, b, (bits >>> i) & 1); put(b, a, (bits >>> i) & 1); }
 }
 const format = mask => {
  const value = ([1, 0, 3, 2][ec] << 3) | mask; let remainder = value;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((value << 10) | remainder) ^ 0x5412, at = i => (bits >>> i) & 1;
  for (let i = 0; i < 6; i++) put(8, i, at(i));
  put(8, 7, at(6)); put(8, 8, at(7)); put(7, 8, at(8));
  for (let i = 9; i < 15; i++) put(14 - i, 8, at(i));
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, at(i));
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, at(i));
  put(8, size - 8, 1);
 };
 format(0); bit = 0; let up = true;
 for (let right = size - 1; right >= 1; right -= 2) {
  if (right === 6) right--;
  for (let row = 0; row < size; row++) for (let dx = 0; dx < 2; dx++) {
   const x = right - dx, y = up ? size - 1 - row : row, at = y * size + x;
   if (!fixed[at]) { modules[at] = bit < words.length * 8 ? (words[bit >>> 3] >>> (7 - (bit & 7))) & 1 : 0; bit++; }
  }
  up = !up;
 }
 const applyMask = mask => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y * size + x] && masked(mask, x, y)) modules[y * size + x] ^= 1; };
 if (mask === null) {
  let best = Infinity;
  for (let candidate = 0; candidate < 8; candidate++) {
   applyMask(candidate); format(candidate);
   const score = penalty(modules, size); if (score < best) { best = score; mask = candidate; }
   applyMask(candidate);
  }
 }
 applyMask(mask); format(mask);
 return {version: v, level: LEVELS[ec], mask, size, modules};
}

// Integer paths include the standard's four-module quiet zone on every side. A run is one
// filled rectangle; there are no external resources, text or caller-controlled SVG attributes.
export function qrDrawing(qr) {
 const {size, modules} = qr; let path = '';
 for (let y = 0; y < size; y++) for (let x = 0; x < size;) {
  if (!modules[y * size + x]) { x++; continue; }
  const start = x; while (x < size && modules[y * size + x]) x++;
  path += `M${start + 4} ${y + 4}h${x - start}v1h-${x - start}z`;
 }
 return {size: size + 8, path};
}
