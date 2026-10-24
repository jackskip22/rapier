// SPDX-License-Identifier: AGPL-3.0-only

import {createPaintPNGCodec} from './paint-png.mjs';
export const PAPER_KINDS = immutable([
 {id:'cold-press',name:'Cold Press',params:{kind:0,tint:'#f6f3ec',fleck:'#8a8070',bump:.75,mottle:.05}},
 {id:'hot-press',name:'Hot Press',params:{kind:1,tint:'#f8f7f3',fleck:'#8a8478',bump:.6,mottle:.04}},
 {id:'rough',name:'Rough',params:{kind:2,tint:'#f5f1e8',fleck:'#857a68',bump:1.3,mottle:.06}},
 {id:'cotton',name:'Khadi',params:{kind:3,tint:'#efe7d6',fleck:'#6d5f4a',bump:1.3,mottle:.12}},
 {id:'washi',name:'Washi',params:{kind:4,tint:'#f1ece0',fleck:'#7a6a52',bump:.8,mottle:.14}},
 {id:'laid',name:'Laid',params:{kind:5,tint:'#f2ebdb',fleck:'#8a7c64',bump:1,mottle:.05}},
 {id:'canvas',name:'Canvas',params:{kind:6,tint:'#f3efe6',fleck:'#8a8070',bump:.5,mottle:.04}},
 {id:'toned',name:'Toned Sand',params:{kind:7,tint:'#d9c8a6',fleck:'#6e5f45',bump:1,mottle:.06}},
 {id:'kraft',name:'Kraft',params:{kind:8,tint:'#b99872',fleck:'#4e3b28',bump:.8,mottle:.12}},
 {id:'student',name:'Student',params:{kind:9,tint:'#f7f7f4',fleck:'#8a8a84',bump:.5,mottle:.03}}
]);
export const PRO_PAPER_KINDS = immutable([
 {id:'plate-hot-press',name:'Plate Hot Press',pro:true,params:{kind:10,tint:'#faf7f0',fleck:'#9b907c',bump:.36,mottle:.025,spread:1.12,absorbency:.78,tooth:.45}},
 {id:'rough-rag',name:'Rough Cotton Rag',pro:true,params:{kind:11,tint:'#f1eadb',fleck:'#8b7960',bump:1.18,mottle:.08,spread:.84,absorbency:1.15,tooth:1.35}},
 {id:'toned-grey',name:'Toned Gray',pro:true,params:{kind:12,tint:'#c6c5bd',fleck:'#77776b',bump:.65,mottle:.045,spread:.95,absorbency:1.08,tooth:.86}},
 {id:'handmade-rag',name:'Handmade Rag',pro:true,params:{kind:13,tint:'#eae0ca',fleck:'#8e7959',bump:1.05,mottle:.14,spread:.88,absorbency:1.22,tooth:1.2}}
]);
export const paperKindById = id => PAPER_KINDS.find(row => row.id === id) || PRO_PAPER_KINDS.find(row => row.id === id) || null;
function immutable(value) {
 if (value && typeof value === 'object') { for (const item of Object.values(value)) immutable(item); Object.freeze(value); }
 return value;
}

export const WATER_PAPER_UNITS = 1100 / 900;
export const WATER_PAPER_PERIOD = 512;
export const WATER_PAPER_MM = WATER_PAPER_UNITS * 96 / 25.4;
export const WATER_PAPER_SEED = 0.4375;
export const WATER_PAPER_LEVELS = immutable([[.460, 1.28], [.408, 0.40], [.516, 1.50], [.475, 1.57], [.421, 0.68], [.370, 1.05], [.592, 1.58], [.413, 1.16], [.454, 0.71], [.473, 1.06], [.500, 0.18], [.509, 1.36], [.471, 0.74], [.447, 1.29]]);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mixf = (a, b, t) => a + (b - a) * t;
const P = WATER_PAPER_PERIOD, wrap = (c, n) => c - n * Math.floor(c / n);
function permute(value) {
 const state = (Math.imul(value, 747796405) + 2891336453) >>> 0;
 const bits = Math.imul(((state >>> (((state >>> 28) + 4) >>> 0)) ^ state) >>> 0, 277803737) >>> 0;
 return ((bits >>> 22) ^ bits) >>> 0;
}
function hash(x, y, stream, seed) {
 const gx = Math.floor(x) >>> 0, gy = Math.floor(y) >>> 0;
 return permute((gx + permute((gy + permute((stream + seed) >>> 0)) >>> 0)) >>> 0) / 4294967296;
}
function noise(x, y, nx, ny, stream, seed) {
 const u = x * nx / P, v = y * ny / P, cx = Math.floor(u), cy = Math.floor(v), fx = u - cx, fy = v - cy;
 const x0 = wrap(cx, nx), x1 = wrap(cx + 1, nx), y0 = wrap(cy, ny), y1 = wrap(cy + 1, ny);
 const wx = fx * fx * (3 - 2 * fx), wy = fy * fy * (3 - 2 * fy);
 return mixf(mixf(hash(x0, y0, stream, seed), hash(x1, y0, stream, seed), wx), mixf(hash(x0, y1, stream, seed), hash(x1, y1, stream, seed), wx), wy);
}
function fractal(x, y, nx, ny, octaves, stream, seed) {
 let sum = 0, scale = .5, total = 0;
 for (let octave = 0; octave < octaves; octave++) {
  sum += scale * noise(x + 37.3 * octave, y + 19.7 * octave, nx << octave, ny << octave, stream + 13 * octave, seed); total += scale; scale *= .5;
 }
 return sum / total;
}
function displace(x, y, n, amplitude, stream, seed) {
 return [x + (fractal(x, y, n, n, 3, stream, seed) - .5) * amplitude, y + (fractal(x, y, n, n, 3, stream + 50, seed) - .5) * amplitude];
}
function cells(x, y, n, jitter, stream, seed) {
 const u = x * n / P, v = y * n / P, cx = Math.floor(u), cy = Math.floor(v), lx = u - cx, ly = v - cy;
 let first = 9;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const ix = wrap(cx + ox, n), iy = wrap(cy + oy, n);
  const dx = ox + .5 + (hash(ix, iy, stream, seed) - .5) * jitter - lx, dy = oy + .5 + (hash(ix, iy, stream + 1, seed) - .5) * jitter - ly;
  first = Math.min(first, Math.hypot(dx, dy));
 }
 return first;
}
function hills(x, y, n, stream, seed) {
 const u = x * n / P, v = y * n / P, cx = Math.floor(u), cy = Math.floor(v), lx = u - cx, ly = v - cy;
 let sum = 0;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const ix = wrap(cx + ox, n), iy = wrap(cy + oy, n);
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
function fibers(x, y, n, span, width, density, alignment, stream, seed) {
 const pitch = P / n, px = x / pitch, py = y / pitch, gx = Math.floor(px), gy = Math.floor(py);
 let coverage = 0;
 for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) for (let fiber = 0; fiber < 2; fiber++) {
  const cx = gx + ox, cy = gy + oy, ix = wrap(cx, n), iy = wrap(cy, n), lane = stream + 31 * fiber;
  if (hash(ix, iy, lane + 3, seed) >= density) continue;
  const angle = (hash(ix, iy, lane + 2, seed) - .5) * Math.PI * (1 - alignment);
  const radius = span * (.35 + .65 * hash(ix, iy, lane + 4, seed)) * .5;
  const ex = Math.cos(angle) * radius, ey = Math.sin(angle) * radius;
  const ox2 = cx + hash(ix, iy, lane, seed), oy2 = cy + hash(ix, iy, lane + 1, seed);
  const distance = segment(px, py, ox2 - ex, oy2 - ey, ox2 + ex, oy2 + ey) * pitch;
  coverage = Math.max(coverage, (1 - smooth(width * .5, width * .5 + .9, distance)) * (.55 + .45 * hash(ix, iy, lane + 5, seed)));
 }
 return coverage;
}
function specks(x, y, n, radius, density, stream, seed) {
 const pitch = P / n, px = x / pitch, py = y / pitch, cx = Math.floor(px), cy = Math.floor(py), lx = px - cx, ly = py - cy;
 let coverage = 0;
 for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
  const ix = wrap(cx + ox, n), iy = wrap(cy + oy, n);
  if (hash(ix, iy, stream + 2, seed) >= density) continue;
  const size = radius * (.4 + .6 * hash(ix, iy, stream + 3, seed));
  const distance = Math.hypot(ox + hash(ix, iy, stream, seed) - lx, oy + hash(ix, iy, stream + 1, seed) - ly) * pitch;
  coverage = Math.max(coverage, 1 - smooth(.6 * size, size + .6, distance));
 }
 return coverage;
}
function ragged(x, y, n, radius, density, stream, seed) {
 const [sx, sy] = displace(x, y, 160, 3, stream + 7, seed);
 return specks(sx, sy, n, radius, density, stream, seed);
}
function hexagonal(x, y) {
 const py = 1.7320508, rep = (v, p) => v - p * Math.floor(v / p);
 const ax = rep(x, 1) - .5, ay = rep(y, py) - .5 * py, bx = rep(x - .5, 1) - .5, by = rep(y - .5 * py, py) - .5 * py;
 return Math.min(Math.hypot(ax, ay), Math.hypot(bx, by));
}
const thread = (t, width) => Math.sqrt(Math.max(0, 1 - (2 * t / width) ** 2));

function paperRaw(x, y, seed, kind) {
 let raw = .5, formation = .5, inclusions = .5;
 if (kind === 1) {
  const fiber = fibers(x, y, 90, 1.4, .45, .35, 0, 220, seed);
  raw = .55 * fractal(x, y, 160, 160, 3, 200, seed) + .3 * noise(x, y, 560, 560, 210, seed) + .15 * fiber;
  formation = fractal(x, y, 9, 9, 4, 230, seed);
 } else if (kind === 2) {
  const [cx, cy] = displace(x, y, 10, 16, 300, seed), large = smooth(.3, .7, fractal(x, y, 6, 6, 3, 305, seed));
  const h = hills(cx, cy, 36, 310, seed) * (.35 + .4 * large) + hills(cx, cy, 70, 315, seed) * (.45 - .25 * large);
  raw = .65 * h + .25 * fractal(cx, cy, 44, 44, 5, 320, seed) + .1 * noise(x, y, 300, 300, 325, seed);
  formation = fractal(x, y, 10, 10, 4, 330, seed);
 } else if (kind === 3) {
  const [cx, cy] = displace(x, y, 8, 40, 400, seed), knobs = 1 - smooth(0, .9, cells(cx, cy, 26, 1, 420, seed));
  const [fx, fy] = displace(x, y, 40, 6, 430, seed), fiber = fibers(fx, fy, 50, 2.2, .9, .6, 0, 440, seed);
  const [kx, ky] = displace(x, y, 30, 8, 465, seed);
  const fleck = Math.max(ragged(x, y, 14, 1.8, .35, 460, seed), .7 * fibers(kx, ky, 10, .25, .8, .35, 0, 470, seed));
  raw = .45 * fractal(cx, cy, 18, 18, 5, 410, seed) + .33 * knobs + .14 * fractal(x, y, 110, 110, 3, 450, seed) + .015 * fiber;
  formation = .7 * fractal(x, y, 5, 5, 4, 480, seed) + .1 * fiber; inclusions = .5 - .4 * fleck + .02 * fiber;
 } else if (kind === 4) {
  const [ax, ay] = displace(x, y, 20, 24, 500, seed), long = fibers(ax, ay, 14, 1.7, .8, .75, 0, 510, seed) * (.6 + .4 * noise(x, y, 12, 12, 512, seed));
  const [bx, by] = displace(x, y, 40, 8, 515, seed), fine = fibers(bx, by, 40, 1.8, .5, .6, 0, 520, seed);
  raw = .8 * fractal(x, y, 30, 30, 4, 530, seed) + .1 * long + .04 * fine;
  formation = .7 * fractal(x, y, 6, 6, 5, 540, seed) + .3 * Math.max(long, .6 * fine);
  inclusions = .5 + .2 * long + .07 * fine - .35 * ragged(x, y, 10, 1.1, .3, 550, seed);
 } else if (kind === 5) {
  const wobble = (fractal(x, y, 4, 20, 3, 600, seed) - .5) * 2.5;
  const laid = (.5 + .5 * Math.cos(2 * Math.PI * (y + wobble) * 100 / P)) ** 2;
  const across = (x + (fractal(x, y, 20, 4, 3, 610, seed) - .5) * 4) * 4 / P, distance = Math.abs(across - Math.floor(across) - .5) * P / 4;
  const chain = 1 - smooth(1, 3, distance);
  const [kx, ky] = displace(x, y, 30, 6, 645, seed);
  raw = .12 * laid + .08 * chain + .6 * fractal(x, y, 100, 100, 4, 620, seed);
  formation = .5 - .2 * Math.exp(-distance / 10) - .07 * laid + (fractal(x, y, 10, 10, 3, 630, seed) - .5) * .6;
  inclusions = .5 - .14 * fibers(kx, ky, 16, .3, .6, .2, 0, 640, seed);
 } else if (kind === 6) {
  const [px, py] = displace(x, y, 24, 2, 700, seed), ux = px * 160 / P, uy = py * 160 / P;
  const ix = Math.floor(ux), iy = Math.floor(uy), tx = ux - ix - .5, ty = uy - iy - .5;
  const warpWidth = .68 + .32 * noise(ix * P / 160, py, 160, 16, 702, seed), weftWidth = .68 + .32 * noise(px, iy * P / 160, 16, 160, 704, seed);
  const warpLift = .78 + .44 * hash(wrap(ix, 160), 0, 709, seed), weftLift = .78 + .44 * hash(0, wrap(iy, 160), 710, seed);
  const warp = warpLift * thread(tx, warpWidth) * (.55 + .45 * Math.cos(Math.PI * (uy - .5 - ix))) * (1 + .08 * Math.cos(2 * Math.PI * (3 * uy + 2 * tx)));
  const weft = weftLift * thread(ty, weftWidth) * (.55 - .45 * Math.cos(Math.PI * (ux - .5 - iy))) * (1 + .08 * Math.cos(2 * Math.PI * (3 * ux + 2 * ty)));
  raw = .78 * Math.max(warp, weft, .32) + .14 * fractal(x, y, 60, 60, 3, 706, seed) + .08 * noise(x, y, 500, 500, 707, seed);
  formation = fractal(x, y, 8, 8, 3, 708, seed);
 } else if (kind === 7) {
  const [dx, dy] = displace(x, y, 40, 4, 800, seed);
  const radius = hexagonal(dx * 110 / P, dy * 64 * 1.7320508 / P) * (.85 + .3 * noise(x, y, 110, 110, 805, seed)), rims = smooth(.12, .55, radius);
  const [lx, ly] = displace(x, y, 30, 6, 845, seed);
  raw = .3 * rims + .58 * fractal(x, y, 80, 80, 4, 810, seed) + .05 * fibers(x, y, 60, 1.6, .6, .35, 0, 820, seed);
  formation = fractal(x, y, 10, 10, 4, 830, seed);
  inclusions = .5 - .3 * ragged(x, y, 24, 1.1, .25, 840, seed) + .12 * fibers(lx, ly, 14, .35, .7, .3, 0, 850, seed);
 } else if (kind === 8) {
  const [ax, ay] = displace(x, y, 30, 6, 935, seed), [bx, by] = displace(x, y, 30, 6, 955, seed);
  const shive = Math.max(.7 * fibers(ax, ay, 18, .35, .7, .25, .6, 940, seed), ragged(x, y, 30, 1.2, .15, 950, seed));
  const light = fibers(bx, by, 16, .4, .9, .3, .5, 960, seed);
  raw = .6 * fractal(x, y, 60, 60, 4, 900, seed) + .3 * noise(x, y, 240, 240, 910, seed) + .06 * fibers(x, y, 120, 2, .5, .6, .7, 920, seed);
  formation = .75 * fractal(x, y, 4, 32, 5, 930, seed) + .25 * fractal(x, y, 12, 12, 3, 970, seed);
  inclusions = .5 - .3 * shive + .12 * light;
 } else if (kind === 9) {
  const [cx, cy] = displace(x, y, 30, 2, 995, seed), bumps = 1 - smooth(0, .7, cells(cx, cy, 100, .85, 1000, seed));
  raw = .62 * bumps + .3 * fractal(x, y, 150, 150, 3, 1010, seed) + .08 * noise(x, y, 500, 500, 1015, seed);
  formation = fractal(x, y, 14, 14, 3, 1020, seed);
 } else if (kind === 10) {
  raw = .6 * noise(x, y, 520, 520, 1100, seed) + .4 * fractal(x, y, 110, 110, 3, 1108, seed);
  formation = .5 + (fractal(x, y, 10, 10, 3, 1116, seed) - .5) * .55;
 } else if (kind === 11) {
  const [cx, cy] = displace(x, y, 12, 14, 1200, seed), basins = 1 - smooth(.08, .85, cells(cx, cy, 28, 1, 1210, seed));
  raw = .55 * basins + .25 * hills(cx, cy, 60, 1225, seed) + .2 * fractal(cx, cy, 40, 40, 4, 1220, seed) + .08 * noise(x, y, 300, 300, 1230, seed);
  formation = fractal(x, y, 9, 9, 3, 1240, seed);
 } else if (kind === 12) {
  const fiber = fibers(x, y, 30, 1.6, .55, .35, .15, 1300, seed);
  raw = .7 * fractal(x, y, 110, 110, 4, 1310, seed) + .22 * noise(x, y, 320, 320, 1320, seed) + .06 * fiber;
  formation = fractal(x, y, 10, 10, 3, 1330, seed); inclusions = .5 + .12 * fiber - .25 * ragged(x, y, 22, 1.1, .2, 1340, seed);
 } else if (kind === 13) {
  const [cx, cy] = displace(x, y, 10, 30, 1400, seed);
  const long = fibers(cx, cy, 20, 1.6, .9, .6, .08, 1410, seed), fine = fibers(x, y, 50, 2, .55, .45, 0, 1420, seed);
  const lumps = 1 - smooth(0, .9, cells(cx, cy, 34, 1, 1435, seed));
  raw = .45 * fractal(cx, cy, 16, 16, 4, 1430, seed) + .2 * lumps + .22 * fractal(x, y, 90, 90, 3, 1440, seed) + .08 * long + .04 * fine;
  formation = .75 * fractal(cx, cy, 6, 6, 4, 1450, seed) + .25 * long;
  inclusions = .5 + .12 * long - .35 * ragged(x, y, 12, 1.6, .28, 1460, seed);
 } else {
  const [cx, cy] = displace(x, y, 20, 6, 100, seed);
  const felt = .6 * hills(cx, cy, 80, 110, seed) + .4 * hills(cx, cy, 140, 115, seed);
  raw = .55 * felt + .3 * fractal(cx, cy, 48, 48, 4, 120, seed) + .07 * noise(x, y, 520, 520, 130, seed);
  formation = fractal(x, y, 10, 10, 4, 140, seed);
 }
 return [raw, formation, inclusions];
}

export function paperTiled(x, y, seedValue, kind) {
 const seed = Math.trunc(Math.fround(Math.fround(seedValue) * 7919)) >>> 0, [center, gain] = WATER_PAPER_LEVELS[kind] || WATER_PAPER_LEVELS[0];
 const [raw, formation, inclusions] = paperRaw(wrap(x, P), wrap(y, P), seed, kind in WATER_PAPER_LEVELS ? kind : 0);
 return [clamp(.5 + (raw - center) * gain, 0, 1), clamp(formation, 0, 1), clamp(inclusions, 0, 1)];
}

const linear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
const gamma = v => { v = clamp(v, 0, 1); return v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055; };
const halfScratch = new Float32Array(1), halfBits = new Uint32Array(halfScratch.buffer);
function half(value) {
 halfScratch[0] = value; const bits = halfBits[0], exponent = bits >>> 23;
 if (exponent < 113) {
  const scaled = halfScratch[0] * 16777216, whole = Math.floor(scaled), fraction = scaled - whole;
  return (whole + (fraction > .5 || (fraction === .5 && (whole & 1)) ? 1 : 0)) / 16777216;
 }
 const fraction = bits & 8191, whole = bits >>> 13;
 halfBits[0] = (whole + (fraction > 4096 || (fraction === 4096 && (whole & 1)) ? 1 : 0)) << 13;
 return halfScratch[0];
}
export const PAPER_TILE_MAX_BYTES = 96 * 1024 * 1024;
const tileBytes = size => {
 const pixels = size * size, lines = pixels * 3 + size, compressed = lines + 6 + 5 * Math.ceil(lines / 65535), pngBytes = compressed + 57;
 return pixels * (12 + 4 + 6) + lines + pngBytes * 3 + 2 * (pngBytes + 8 * Math.ceil(pngBytes / 3) + 22);
};
export function paperTileSize(density = 1) {
 if (!Number.isFinite(density) || density <= 0) return 0;
 let size = Math.max(1, Math.round(WATER_PAPER_PERIOD * density));
 if (!Number.isSafeInteger(size)) size = Number.MAX_SAFE_INTEGER;
 if (tileBytes(size) <= PAPER_TILE_MAX_BYTES) return size;
 let low = 1, high = Math.min(size, 1 << 16);
 while (low < high) { const mid = (low + high + 1) >> 1; if (tileBytes(mid) <= PAPER_TILE_MAX_BYTES) low = mid; else high = mid - 1; }
 return low;
}
export async function paperTile(id, {density = 1, strength = 1, now = null, pause = null} = {}) {
 const preset = paperKindById(id), size = paperTileSize(density);
 if (!preset || !size || !Number.isFinite(strength) || strength < 0 || strength > 1) return null;
 const step = WATER_PAPER_PERIOD / size, {kind, bump} = preset.params;
 const field = new Float32Array(size * size * 3);
 let slice = now ? now() : 0;
 for (let j = 0; j < size; j++) {
  for (let i = 0; i < size; i++) {
   const values = paperTiled((i + .5) * step, -(j + .5) * step, WATER_PAPER_SEED, kind), offset = (j * size + i) * 3;
   for (let c = 0; c < 3; c++) field[offset + c] = half(values[c]);
  }
  if (pause && now && now() - slice > 12) { await pause(); slice = now(); }
 }
 const L = [-.5, .6, .62], n = Math.hypot(...L), lx = L[0] / n, ly = L[1] / n, lz = L[2] / n, slope = 1.4 * bump / step;
 const paper = new Uint8Array(size * size * 4);
 const at = (i, j) => field[((((j % size) + size) % size) * size + (((i % size) + size) % size)) * 3];
 for (let j = 0; j < size; j++) {
  for (let i = 0; i < size; i++) {
   const index = j * size + i, o = index * 3, target = index * 4, h = field[o];
   const nx = (at(i - 1, j) - at(i + 1, j)) * slope, ny = (at(i, j + 1) - at(i, j - 1)) * slope, nl = Math.hypot(nx, ny, 1);
   paper[target] = Math.round(255 * clamp(.5 + 1.3 * ((nx * lx + ny * ly + lz) / nl - lz) + .25 * (h - .5), 0, 1));
   for (let c = 0; c < 3; c++) paper[target + c + 1] = Math.round(255 * field[o + c]);
  }
  if (pause && now && now() - slice > 12) { await pause(); slice = now(); }
 }
 return paperTileColour(id, {width: size, height: size, paper}, {strength, now, pause});
}

export async function paperTileColour(id, tile, {strength = 1, now = null, pause = null} = {}) {
 const preset = paperKindById(id);
 if (!preset || !Number.isFinite(strength) || strength < 0 || strength > 1) return null;
 const {width, height, paper} = tile || {}, {tint, fleck, mottle} = preset.params;
 if (!Number.isSafeInteger(width) || width < 1 || height !== width || paperTileSize(width / WATER_PAPER_PERIOD) !== width || !(paper instanceof Uint8Array) || paper.length !== width * height * 4) return null;
 const base = linear(tint), dark = linear(fleck), light = base.map(v => Math.min(v * 1.1 + .02, 1));
 const rgb = new Uint8ClampedArray(width * height * 3);
 let slice = now ? now() : 0;
 for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
   const pixel = y * width + x, source = pixel * 4, target = pixel * 3;
   const factor = 1 + strength * ((paper[source] / 255 - .5) * .32 + (paper[source + 2] / 255 - .5) * mottle * 2);
   const fl = (paper[source + 3] / 255 - .5) * 2 * strength;
   for (let c = 0; c < 3; c++) {
    const sheet = base[c] * factor;
    rgb[target + c] = Math.round(255 * gamma(fl >= 0 ? mixf(sheet, light[c], fl) : mixf(sheet, dark[c], -fl)));
   }
  }
  if (pause && now && now() - slice > 12) { await pause(); slice = now(); }
 }
 return {width, height, paper, rgb, strength};
}

function scanlines(rgb, width, height) {
 const stride = width * 3, out = new Uint8Array(height * (stride + 1));
 for (let y = 0; y < height; y++) {
  out[y * (stride + 1)] = 4;
  for (let x = 0; x < stride; x++) {
   const v = rgb[y * stride + x], a = x >= 3 ? rgb[y * stride + x - 3] : 0, b = y ? rgb[(y - 1) * stride + x] : 0, c = x >= 3 && y ? rgb[(y - 1) * stride + x - 3] : 0;
   const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
   out[y * (stride + 1) + 1 + x] = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
  }
 }
 return out;
}
const png = createPaintPNGCodec();
const images = new Map(), pending = new Map(), wanted = new Map(), fields = new Map(), listeners = new Set();
let lastField = null, wantedField = '';
export function paperTileImage(id, strength = 1) { const image = images.get(id); return image?.strength === strength ? image : null; }
export function paperTileListen(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export const PAPER_TILE_VERSION = 'paper-tile-1';
const storedImage = (value, id, size, strength) => value && value.id === id && value.size === size && value.strength === strength && typeof value.url === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.url)
 ? Object.freeze({id, size, density: size / WATER_PAPER_PERIOD, strength, url: value.url}) : null;
export function paperTileRequest(id, {density = 1, pixelRatio = 0, strength = 1, ready: anySize = false, now = null, pause = null, deflate = null, render = null, store = null} = {}) {
 const size = paperTileSize(pixelRatio > 0 ? Math.max(1, pixelRatio / WATER_PAPER_UNITS) : density);
 if (!paperKindById(id) || !size || !Number.isFinite(strength) || strength < 0 || strength > 1) return Promise.resolve(null);
 const key = id + ':' + size + ':' + strength, fieldKey = id + ':' + size;
 const ready = images.get(id);
 if (anySize && ready?.strength === strength) return Promise.resolve(ready);
 wanted.set(id, key); wantedField = fieldKey;
 if (ready?.size === size && ready.strength === strength) return Promise.resolve(ready);
 if (pending.has(key)) return pending.get(key);
 const task = (async () => {
  const storeKey = PAPER_TILE_VERSION + ':' + key;
  if (store) {
   let kept = null;
   try { kept = storedImage(await store.get(storeKey), id, size, strength); } catch (_) {}
   if (kept) {
    if (wanted.get(id) === key) { images.set(id, kept); for (const listener of listeners) { try { listener(id); } catch (_) {} } }
    return kept;
   }
  }
  let tile = lastField?.key === fieldKey ? lastField : null;
  if (!tile) {
   let building = fields.get(fieldKey);
   if (!building) {
    building = (async () => {
     const options = {density: size / WATER_PAPER_PERIOD, strength, now, pause};
     let value = null;
     if (render) { try { value = await render(id, options); } catch (_) { value = null; } }
     if (value && (value.width !== size || value.height !== size || !(value.paper instanceof Uint8Array) || value.paper.length !== size * size * 4)) value = null;
     value ??= await paperTile(id, options);
     if (value && wantedField === fieldKey) lastField = {key: fieldKey, width: value.width, height: value.height, paper: value.paper};
     return value;
    })();
    fields.set(fieldKey, building);
    const settled = () => { if (fields.get(fieldKey) === building) fields.delete(fieldKey); };
    building.then(settled, settled);
   }
   tile = await building;
  }
  if (!tile) return null;
  if (tile.strength !== strength || !(tile.rgb instanceof Uint8Array || tile.rgb instanceof Uint8ClampedArray) || tile.rgb.length !== size * size * 3) tile = await paperTileColour(id, tile, {strength, now, pause});
  if (!tile) return null;
  const lines = scanlines(tile.rgb, tile.width, tile.height);
  let deflated = null;
  if (deflate) { try { deflated = await deflate(lines); } catch (_) { deflated = null; } }
  const image = Object.freeze({id, size: tile.width, density: tile.width / WATER_PAPER_PERIOD, strength, url: png.url(png.wrap(tile, deflated || png.stored(lines), 2))});
  if (store) { try { Promise.resolve(store.set(storeKey, {id, size: image.size, strength, url: image.url})).catch(() => {}); } catch (_) {} }
  if (wanted.get(id) === key) {
   images.set(id, image);
   for (const listener of listeners) { try { listener(id); } catch (_) {} }
  }
  return image;
 })();
 pending.set(key, task);
 const settled = () => { if (pending.get(key) === task) pending.delete(key); };
 task.then(settled, settled);
 return task;
}
