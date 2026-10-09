// SPDX-License-Identifier: AGPL-3.0-only
// The watercolour papers: their look and their procedural relief. One periodic field serves the Water
// engine's tooth and granulation (WGSL) and the drawing's paper background (this file's CPU twin), so
// paint settles into the same hollows the background shows. Pure data in, pixels out; no DOM.

export const PAPER_KINDS = immutable([
 {id:'cold-press',name:'Cold Press',params:{kind:0,tint:'#f6f3ec',fleck:'#8a8070',bump:1,mottle:.05}},
 {id:'hot-press',name:'Hot Press',params:{kind:1,tint:'#f8f7f3',fleck:'#8a8478',bump:.6,mottle:.04}},
 {id:'rough',name:'Rough',params:{kind:2,tint:'#f5f1e8',fleck:'#857a68',bump:.8,mottle:.06}},
 {id:'cotton',name:'Khadi',params:{kind:3,tint:'#efe7d6',fleck:'#6d5f4a',bump:1,mottle:.12}},
 {id:'washi',name:'Washi',params:{kind:4,tint:'#f1ece0',fleck:'#7a6a52',bump:.8,mottle:.14}},
 {id:'laid',name:'Laid',params:{kind:5,tint:'#f2ebdb',fleck:'#8a7c64',bump:1,mottle:.05}},
 {id:'canvas',name:'Canvas',params:{kind:6,tint:'#f3efe6',fleck:'#8a8070',bump:1,mottle:.04}},
 {id:'toned',name:'Toned Sand',params:{kind:7,tint:'#d9c8a6',fleck:'#6e5f45',bump:1,mottle:.06}},
 {id:'kraft',name:'Kraft',params:{kind:8,tint:'#b99872',fleck:'#4e3b28',bump:.8,mottle:.12}},
 {id:'student',name:'Student',params:{kind:9,tint:'#f7f7f4',fleck:'#8a8a84',bump:1,mottle:.03}}
]);
function immutable(value) {
 if (value && typeof value === 'object') { for (const item of Object.values(value)) immutable(item); Object.freeze(value); }
 return value;
}

// Paper units per drawing unit: the reference's sheet in the owner's target screenshots, 1100 units over a 900-pixel
// window at device pixel ratio 1. A Water sheet at one pixel per drawing unit is then that sheet, grain and brush alike.
export const WATER_PAPER_UNITS = 1100 / 900;
// The field repeats every PERIOD paper units; the last BAND units of each period blend into the next period's start.
export const WATER_PAPER_PERIOD = 512, WATER_PAPER_BAND = 64;
// The one sheet seed every Water layer and paper background of a drawing share.
export const WATER_PAPER_SEED = 0.4375;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mixf = (a, b, t) => a + (b - a) * t;
function permute(value) {
 const state = (Math.imul(value, 747796405) + 2891336453) >>> 0;
 const bits = Math.imul(((state >>> (((state >>> 28) + 4) >>> 0)) ^ state) >>> 0, 277803737) >>> 0;
 return ((bits >>> 22) ^ bits) >>> 0;
}
function hash(x, y, stream, seed) {
 const gx = Math.floor(x) >>> 0, gy = Math.floor(y) >>> 0;
 return permute((gx + permute((gy + permute((stream + seed) >>> 0)) >>> 0)) >>> 0) / 4294967296;
}
function noise(x, y, stream, seed) {
 const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy;
 const wx = fx * fx * (3 - 2 * fx), wy = fy * fy * (3 - 2 * fy);
 const lower = mixf(hash(cx, cy, stream, seed), hash(cx + 1, cy, stream, seed), wx);
 const upper = mixf(hash(cx, cy + 1, stream, seed), hash(cx + 1, cy + 1, stream, seed), wx);
 return mixf(lower, upper, wy);
}
function fractal(x, y, octaves, stream, seed) {
 let sum = 0, scale = .5, total = 0;
 for (let octave = 0; octave < octaves; octave++) {
  sum += scale * noise(x, y, stream + 13 * octave, seed); total += scale;
  const nx = (.8 * x + .6 * y) * 2.03 + 17.1, ny = (-.6 * x + .8 * y) * 2.03 + 17.1; x = nx; y = ny; scale *= .5;
 }
 return sum / total;
}
function displace(x, y, frequency, amplitude, stream, seed) {
 return [x + (fractal(x * frequency, y * frequency, 3, stream, seed) - .5) * amplitude, y + (fractal(x * frequency, y * frequency, 3, stream + 50, seed) - .5) * amplitude];
}
function neighbors(x, y, jitter, stream, seed) {
 const cx = Math.floor(x), cy = Math.floor(y), lx = x - cx, ly = y - cy;
 let first = 9, second = 9;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const dx = ox + .5 + (hash(cx + ox, cy + oy, stream, seed) - .5) * jitter - lx, dy = oy + .5 + (hash(cx + ox, cy + oy, stream + 1, seed) - .5) * jitter - ly;
  const distance = Math.hypot(dx, dy);
  if (distance < first) { second = first; first = distance; } else second = Math.min(second, distance);
 }
 return first;
}
function hills(x, y, stream, seed) {
 const cx = Math.floor(x), cy = Math.floor(y), lx = x - cx, ly = y - cy;
 let sum = 0;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const ix = cx + ox, iy = cy + oy;
  const dx = ox + hash(ix, iy, stream, seed) - lx, dy = oy + hash(ix, iy, stream + 1, seed) - ly;
  const radius = .35 + .4 * hash(ix, iy, stream + 2, seed);
  sum += (.5 + .5 * hash(ix, iy, stream + 3, seed)) * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
 }
 return .75 * sum;
}
function segment(px, py, ax, ay, bx, by) {
 const dx = bx - ax, dy = by - ay, lx = px - ax, ly = py - ay;
 const t = clamp((lx * dx + ly * dy) / (dx * dx + dy * dy), 0, 1);
 return Math.hypot(lx - dx * t, ly - dy * t);
}
function fibers(x, y, pitch, span, width, density, alignment, stream, seed) {
 const px = x / pitch, py = y / pitch, gx = Math.floor(px), gy = Math.floor(py);
 let coverage = 0;
 for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) for (let fiber = 0; fiber < 2; fiber++) {
  const cx = gx + ox, cy = gy + oy, lane = stream + 31 * fiber;
  if (hash(cx, cy, lane + 3, seed) >= density) continue;
  const angle = (hash(cx, cy, lane + 2, seed) - .5) * Math.PI * (1 - alignment);
  const radius = span * (.35 + .65 * hash(cx, cy, lane + 4, seed)) * .5;
  const ex = Math.cos(angle) * radius, ey = Math.sin(angle) * radius;
  const ox2 = cx + hash(cx, cy, lane, seed), oy2 = cy + hash(cx, cy, lane + 1, seed);
  const distance = segment(px, py, ox2 - ex, oy2 - ey, ox2 + ex, oy2 + ey) * pitch;
  coverage = Math.max(coverage, (1 - smooth(width * .5, width * .5 + .9, distance)) * (.55 + .45 * hash(cx, cy, lane + 5, seed)));
 }
 return coverage;
}
function specks(x, y, pitch, radius, density, stream, seed) {
 const px = x / pitch, py = y / pitch, cx = Math.floor(px), cy = Math.floor(py), lx = px - cx, ly = py - cy;
 let coverage = 0;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const ix = cx + ox, iy = cy + oy;
  if (hash(ix, iy, stream + 2, seed) >= density) continue;
  const size = radius * (.4 + .6 * hash(ix, iy, stream + 3, seed));
  const distance = Math.hypot(ox + hash(ix, iy, stream, seed) - lx, oy + hash(ix, iy, stream + 1, seed) - ly) * pitch;
  coverage = Math.max(coverage, 1 - smooth(.6 * size, size + .6, distance));
 }
 return coverage;
}
function hexagonal(x, y) {
 const py = 1.7320508, rep = (v, p) => v - p * Math.floor(v / p);
 const ax = rep(x, 1) - .5, ay = rep(y, py) - .5 * py, bx = rep(x - .5, 1) - .5, by = rep(y - .5 * py, py) - .5 * py;
 return Math.min(Math.hypot(ax, ay), Math.hypot(bx, by));
}

// Height, formation and inclusions at a paper point: the CPU twin of PAPER_WGSL's waterPaperField.
export function paperField(x, y, seedValue, kind) {
 const seed = Math.trunc(Math.fround(Math.fround(seedValue) * 7919)) >>> 0;
 let height = .5, formation = .5, inclusions = .5;
 if (kind === 1) {
  const felt = .6 * fractal(x * .06, y * .06, 4, 200, seed) + .25 * noise(x * .4, y * .4, 210, seed);
  const fiber = fibers(x, y, 16, 2.5, .8, .3, 0, 220, seed);
  height = .5 + (felt + .05 * fiber - .4) * .45; formation = fractal(x * .01, y * .01, 4, 230, seed);
 } else if (kind === 2) {
  const [cx, cy] = displace(x, y, .01, 40, 300, seed);
  const large = smooth(.3, .7, fractal(x * .006, y * .006, 3, 305, seed));
  const h = hills(cx / 26, cy / 26, 310, seed) * (.35 + .4 * large) + hills(cx / 12, cy / 12, 315, seed) * (.45 - .25 * large);
  height = .5 + (.65 * h + .25 * fractal(cx * .06, cy * .06, 5, 320, seed) + .1 * noise(x * .45, y * .45, 325, seed) - .52) * 1.5;
  formation = fractal(x * .01, y * .01, 4, 330, seed);
 } else if (kind === 3) {
  const [cx, cy] = displace(x, y, .008, 60, 400, seed);
  const h = 1 - smooth(0, .9, neighbors(cx / 13, cy / 13, 1, 420, seed));
  const [fx, fy] = displace(x, y, .05, 8, 430, seed), fiber = fibers(fx, fy, 9, 3, 1.1, .6, 0, 440, seed);
  const felt = .5 * fractal(cx * .035, cy * .035, 5, 410, seed) + .3 * h + .16 * fractal(x * .2, y * .2, 3, 450, seed) + .03 * fiber;
  const [kx, ky] = displace(x, y, .06, 10, 465, seed);
  const fleck = Math.max(specks(x, y, 60, 2, .3, 460, seed), .6 * fibers(kx, ky, 110, .4, .9, .3, 0, 470, seed));
  height = .5 + (felt - .5) * 1.6; formation = .7 * fractal(x * .006, y * .006, 4, 480, seed) + .25 * fiber; inclusions = .5 - .35 * fleck + .06 * fiber;
 } else if (kind === 4) {
  const [ax, ay] = displace(x, y, .025, 28, 500, seed), longFiber = fibers(ax, ay, 42, 3.4, 1.3, .4, 0, 510, seed) * (.6 + .4 * noise(x * .05, y * .05, 512, seed));
  const [bx, by] = displace(x, y, .05, 10, 515, seed), fineFiber = fibers(bx, by, 14, 3, .6, .45, 0, 520, seed);
  height = .5 + (.8 * fractal(x * .05, y * .05, 4, 530, seed) + .08 * longFiber + .03 * fineFiber - .42) * .7;
  formation = .85 * fractal(x * .005, y * .005, 5, 540, seed) + .15 * longFiber;
  inclusions = .5 + .16 * longFiber + .05 * fineFiber - .4 * specks(x, y, 70, 1.6, .18, 550, seed);
 } else if (kind === 5) {
  const horizontal = (fractal(x * .004, y * .02, 3, 600, seed) - .5) * 6;
  const laid = (.5 + .5 * Math.cos(2 * Math.PI * (y + horizontal) / 5.6)) ** 2;
  const vertical = x + (fractal(x * .02, y * .004, 3, 610, seed) - .5) * 8;
  const distance = Math.abs(vertical / 140 - Math.floor(vertical / 140) - .5) * 140;
  const chain = 1 - smooth(1, 3.5, distance);
  height = .5 + (.1 * laid + .05 * chain + .6 * fractal(x * .08, y * .08, 4, 620, seed) - .36) * 1.1;
  formation = .5 - .12 * Math.exp(-distance / 12) - .06 * laid + (fractal(x * .01, y * .01, 3, 630, seed) - .5) * .6;
 } else if (kind === 6) {
  const px = x + (noise(x * .02, y * .02, 700, seed) - .5) * 9.6, py = y + (noise(x * .02, y * .02, 701, seed) - .5) * 9.6;
  const cx = px / 8, cy = py / 8, sx = Math.floor(cx), sy = Math.floor(cy), ux = cx - sx - .5, uy = cy - sy - .5;
  const warp = .8 + .2 * hash(sx, 0, 702, seed) + .3 * (noise(sx * 5, cy * .35, 703, seed) - .5);
  const weft = .8 + .2 * hash(0, sy, 704, seed) + .3 * (noise(cx * .35, sy * 5, 705, seed) - .5);
  const parity = sx + sy - 2 * Math.floor((sx + sy) / 2), raised = parity > .5;
  const ex = ux * (raised ? 2.3 : 1.15), ey = uy * (raised ? 1.15 : 2.3);
  const thread = Math.max(0, 1 - (ex * ex + ey * ey)) * (raised ? warp : weft);
  height = .5 + (.75 * Math.sqrt(thread) + .25 * fractal(px * .15, py * .15, 3, 706, seed) - .55) * 1.1;
  formation = fractal(px * .01, py * .01, 3, 707, seed);
 } else if (kind === 7) {
  const [dx, dy] = displace(x, y, .05, 7, 800, seed), cx = dx / 9, cy = dy / 9;
  const radius = hexagonal(cx, cy) * (.8 + .4 * noise(cx * 2, cy * 2, 805, seed));
  const rims = smooth(.1, .55, radius);
  height = .5 + (.28 * rims + .6 * fractal(x * .09, y * .09, 4, 810, seed) + .04 * fibers(x, y, 12, 2, .9, .35, 0, 820, seed) - .42) * 1.2;
  formation = fractal(x * .012, y * .012, 4, 830, seed); inclusions = .5 - .3 * specks(x, y, 60, 1.2, .2, 840, seed);
 } else if (kind === 8) {
  const felt = .6 * fractal(x * .07, y * .07, 4, 900, seed) + .32 * noise(x * .35, y * .35, 910, seed) + .04 * fibers(x, y, 10, 2.5, .9, .6, .7, 920, seed);
  const [ax, ay] = displace(x, y, .08, 10, 935, seed), [bx, by] = displace(x, y, .08, 10, 955, seed);
  const fleck = Math.max(.6 * fibers(ax, ay, 60, .35, .7, .2, .6, 940, seed), specks(x, y, 40, 1.3, .35, 950, seed));
  const light = fibers(bx, by, 70, .4, 1, .25, .5, 960, seed);
  height = .5 + (felt - .45) * .7; formation = .8 * fractal(x * .004, y * .03, 5, 930, seed) + .2 * fractal(x * .01, y * .01, 3, 970, seed);
  inclusions = .5 - .28 * fleck + .12 * light;
 } else if (kind === 9) {
  const [cx, cy] = displace(x, y, .03, 3, 995, seed);
  const bumps = 1 - smooth(0, .7, neighbors(cx / 7, cy / 7, .7, 1000, seed));
  height = .5 + (.6 * bumps + .4 * fractal(x * .12, y * .12, 3, 1010, seed) - .48) * 1.1;
  formation = fractal(x * .015, y * .015, 3, 1020, seed);
 } else {
  const [cx, cy] = displace(x, y, .02, 10, 100, seed);
  const h = .6 * hills(cx / 11, cy / 11, 110, seed) + .4 * hills(cx / 5.5, cy / 5.5, 115, seed);
  height = .5 + (.5 * h + .38 * fractal(cx * .09, cy * .09, 5, 120, seed) + .12 * noise(x * .5, y * .5, 130, seed) - .5) * 1.3;
  formation = fractal(x * .012, y * .012, 4, 140, seed);
 }
 return [clamp(height, 0, 1), clamp(formation, 0, 1), clamp(inclusions, 0, 1)];
}

// The periodic sheet. Inside a period the field is the plain field; across the last BAND units the field
// fades into the one a period earlier, with the blend's variance kept, so period edges meet without a seam.
export function paperTiled(x, y, seedValue, kind) {
 const P = WATER_PAPER_PERIOD, qx = x - P * Math.floor(x / P), qy = y - P * Math.floor(y / P);
 const wx = smooth(P - WATER_PAPER_BAND, P, qx), wy = smooth(P - WATER_PAPER_BAND, P, qy);
 const weights = [(1 - wx) * (1 - wy), wx * (1 - wy), (1 - wx) * wy, wx * wy];
 const out = [0, 0, 0];let norm = 0;
 for (let i = 0; i < 4; i++) {
  const w = weights[i];
  if (w <= 0) continue;
  const f = paperField(qx - (i & 1) * P, qy - (i >> 1) * P, seedValue, kind);
  for (let c = 0; c < 3; c++) out[c] += w * (f[c] - .5);
  norm += w * w;
 }
 const k = 1 / Math.sqrt(norm);
 return out.map(v => clamp(.5 + v * k, 0, 1));
}

const linear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
const gamma = v => { v = clamp(v, 0, 1); return v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055; };
const quantize = v => Math.round(clamp(v, 0, 1) * 255) / 255;
// One period of the lit sheet, one pixel per paper unit, in straight sRGB bytes: its tint, relief, mottling and
// flecks as the Water paper display composes them at full texture strength. The field takes a few seconds on a
// phone, so a caller may build it in slices: `now` reads its clock and `pause` resolves when to go on.
export async function paperTile(id, {now = null, pause = null} = {}) {
 const paper = PAPER_KINDS.find(p => p.id === id);
 if (!paper) return null;
 const P = WATER_PAPER_PERIOD, {kind, tint, fleck, bump, mottle} = paper.params;
 const field = new Float32Array(P * P * 3);
 let slice = now ? now() : 0;
 for (let j = 0; j < P; j++) {
  for (let i = 0; i < P; i++) field.set(paperTiled(i + .5, -(j + .5), WATER_PAPER_SEED, kind), (j * P + i) * 3);
  if (pause && now && now() - slice > 12) { await pause(); slice = now(); }
 }
 const base = linear(tint), dark = linear(fleck), light = base.map(v => Math.min(v * 1.1 + .02, 1));
 const L = [-.5, .6, .62], n = Math.hypot(...L), lx = L[0] / n, ly = L[1] / n, lz = L[2] / n, slope = 1.4 * bump;
 const rgb = new Uint8ClampedArray(P * P * 3);
 const at = (i, j) => field[((((j % P) + P) % P) * P + (((i % P) + P) % P)) * 3];
 for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
  const o = (j * P + i) * 3, h = field[o];
  const nx = (at(i - 1, j) - at(i + 1, j)) * slope, ny = (at(i, j + 1) - at(i, j - 1)) * slope, nl = Math.hypot(nx, ny, 1);
  const relief = quantize(.5 + 1.3 * ((nx * lx + ny * ly + lz) / nl - lz) + .25 * (h - .5));
  const formation = quantize(field[o + 1]), inclusion = quantize(field[o + 2]);
  const factor = 1 + (relief - .5) * .32 + (formation - .5) * mottle * 2, fl = (inclusion - .5) * 2;
  for (let c = 0; c < 3; c++) {
   const sheet = base[c] * factor;
   rgb[o + c] = Math.round(255 * gamma(fl >= 0 ? mixf(sheet, light[c], fl) : mixf(sheet, dark[c], -fl)));
  }
 }
 return {width: P, height: P, rgb};
}

// ---- the tile as an image: luminance in a grey PNG plus one affine colour map per channel ----
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; CRC[n] = c >>> 0; }
const crc32 = bytes => { let c = -1; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ c >>> 8; return (c ^ -1) >>> 0; };
function chunk(tag, data) {
 const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
 view.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i);
 out.set(data, 8); view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
}
function png(width, height, deflated) {
 const head = new Uint8Array(13), view = new DataView(head.buffer);
 view.setUint32(0, width); view.setUint32(4, height); head[8] = 8; head[9] = 0;
 const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflated), chunk('IEND', new Uint8Array(0))];
 const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0;
 for (const p of parts) { out.set(p, at); at += p.length; }
 return out;
}
function stored(raw) {
 const count = Math.ceil(raw.length / 65535), out = new Uint8Array(raw.length + 6 + count * 5); out.set([120, 1]);
 let at = 2, a = 1, b = 0;
 for (let offset = 0; offset < raw.length; offset += 65535) {
  const n = Math.min(65535, raw.length - offset);
  out.set([offset + n === raw.length ? 1 : 0, n & 255, n >>> 8, ~n & 255, ~n >>> 8 & 255], at); at += 5;
  out.set(raw.subarray(offset, offset + n), at); at += n;
 }
 for (let i = 0; i < raw.length;) { const end = Math.min(i + 5552, raw.length); for (; i < end; i++) { a += raw[i]; b += a; } a %= 65521; b %= 65521; }
 new DataView(out.buffer).setUint32(at, ((b << 16) | a) >>> 0); return out;
}
// Paeth-filtered scanlines: the smooth relief compresses far better than raw bytes.
function scanlines(gray, width, height) {
 const out = new Uint8Array(height * (width + 1));
 for (let y = 0; y < height; y++) {
  out[y * (width + 1)] = 4;
  for (let x = 0; x < width; x++) {
   const v = gray[y * width + x], a = x ? gray[y * width + x - 1] : 0, b = y ? gray[(y - 1) * width + x] : 0, c = x && y ? gray[(y - 1) * width + x - 1] : 0;
   const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
   out[y * (width + 1) + 1 + x] = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
  }
 }
 return out;
}
const base64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(s); };
const images = new Map(), pending = new Map(), listeners = new Set();
// The finished image of a paper, or null while it is being made.
export function paperTileImage(id) { return images.get(id) || null; }
// Called with a paper id each time one's image is ready (or improves).
export function paperTileListen(listener) { listeners.add(listener); return () => listeners.delete(listener); }
// Make a paper's image once. The grey tile and the colour map that turns it back into the sheet:
// colour = gain * grey + offset per channel (0..1). The caller supplies its clock and pause for slicing, `render`
// (a paper id to a lit period of any square size, async) where it can draw the field faster, and `deflate` (bytes to
// zlib bytes, async) where it has one; without it the image is stored uncompressed.
export function paperTileRequest(id, {now = null, pause = null, deflate = null, render = null} = {}) {
 if (images.has(id)) return Promise.resolve(images.get(id));
 if (pending.has(id)) return pending.get(id);
 const task = (async () => {
  let tile = null;
  if (render) { try { tile = await render(id); } catch (_) { tile = null; } }
  tile ??= await paperTile(id, {now, pause});
  if (!tile) return null;
  const n = tile.width * tile.height, gray = new Uint8Array(n), sums = [0, 0, 0], cross = [0, 0, 0];
  let sg = 0, sgg = 0;
  for (let i = 0; i < n; i++) {
   const r = tile.rgb[i * 3], g = tile.rgb[i * 3 + 1], b = tile.rgb[i * 3 + 2], y = Math.round(.299 * r + .587 * g + .114 * b);
   gray[i] = y; sg += y; sgg += y * y;
   for (let c = 0; c < 3; c++) { sums[c] += tile.rgb[i * 3 + c]; cross[c] += y * tile.rgb[i * 3 + c]; }
  }
  const mean = sg / n, variance = Math.max(1e-6, sgg / n - mean * mean);
  const gain = cross.map((v, c) => (v / n - mean * sums[c] / n) / variance), offset = sums.map((v, c) => (v / n - gain[c] * mean) / 255);
  const lines = scanlines(gray, tile.width, tile.height);
  let deflated = null;
  if (deflate) { try { deflated = await deflate(lines); } catch (_) { deflated = null; } }
  const image = Object.freeze({id, size: tile.width, gain, offset, mean: mean / 255, url: 'data:image/png;base64,' + base64(png(tile.width, tile.height, deflated || stored(lines)))});
  images.set(id, image); pending.delete(id);
  for (const listener of listeners) { try { listener(id); } catch (_) {} }
  return image;
 })();
 pending.set(id, task);
 task.catch(() => pending.delete(id));
 return task;
}
