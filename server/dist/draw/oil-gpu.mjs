// SPDX-License-Identifier: AGPL-3.0-only
import {registerPaintEngine} from './paint-gpu.mjs';
import {PAINT_PRIMARY, PAINT_DISPLAY} from './paint-pigment-data.mjs';
import {PAINT_MIX_WGSL} from './paint-mix.mjs';
import {OilPath} from './oil-brush.mjs';
import {OIL_MEDIA, OIL_CANVAS, OIL_LOOK, OIL_GPU, OIL_LAYER_COUNT, OIL_LAYER_STRIDE, OIL_LAYER_VOLUME, OIL_GPU_LAYER_BYTES} from './oil-material.mjs';

const BANDS = PAINT_PRIMARY.length;
const HC = {ks: 68, residual: 68 + BANDS, outer: 71 + BANDS, key: 74 + BANDS};
const HS = HC.key + 1, MAX_STEPS = 4096, FX = 65536, T = 64;
const LAYER_WORDS = OIL_GPU_LAYER_BYTES / 4, INPUT_WORDS = 12 + OIL_LAYER_STRIDE / 2, HEADER_WORDS = 6, TILE_WORDS = HEADER_WORDS + T * T * INPUT_WORDS;
const O = {ox: 0, oy: 1, g: 2, L: 3, res: 4, res0: 7, abs: 10, as: 13, col: 16, pick: 19, pk: 22, bump: 23, aff: 24, cseed: 25, tx: 26, ty: 27, px: 28, py: 29,
	bowV: 30, bow: 31, on: 34, land: 35, gate: 36, first: 37, hseed: 65};
const A = {settle: 38, swell: 39, rad: 40, lf: 41, ramp: 42, thrL: 43, step: 44, bx0: 45, by0: 46, bw: 47, bh: 48,
	rel: 49, sx0: 50, sy0: 51, rr: 52, ax0: 53, ay0: 54, aw: 55, ah: 56, dash: 57, share: 58, tw: 62, fleckN: 63, fleck: 64};
const F = name => `hairs[h * HS + ${O[name] ?? A[name]}u]`;
const pigTable = (() => {
	const f = PAINT_PRIMARY.flat();
	for (const row of PAINT_DISPLAY) f.push(...row);
	while (f.length % 4) f.push(0);
	return new Float32Array(f);
})();
const OIL_V = 256, OIL_V_MAX = 2047, OIL_G = 24, REL_LO = -.5, REL_SPAN = 2.1;

const HASH = `
fn hash(x: i32, y: i32, s: i32) -> f32 {
	var n = (u32(x) * 374761393u) ^ (u32(y) * 668265263u) ^ (u32(s) * 1442695041u);
	n = (n ^ (n >> 13u)) * 1274126177u;
	return f32(n ^ (n >> 16u)) / 4294967295.;
}
`;
const FIELD_NOISE = `
fn vnoise(x: f32, y: f32, s: i32) -> f32 {
	let xi = floor(x); let yi = floor(y); let fx = x - xi; let fy = y - yi; let u = fx * fx * (3. - 2. * fx); let v = fy * fy * (3. - 2. * fy);
	let X = i32(xi); let Y = i32(yi);
	let a = hash(X, Y, s); let b = hash(X + 1, Y, s); let c = hash(X, Y + 1, s); let d = hash(X + 1, Y + 1, s);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
`;
const PARAMS = `
struct Params {
	W: f32, H: f32, nh: f32, nsteps: f32, G: f32, wetLife: f32, flat: f32, sx: f32,
	R0: f32, width: f32, thin: f32, cap: f32, hairR: f32, contact: f32, acr: f32, pickup: f32,
	plow: f32, ridge: f32, gloss: f32, body: f32, cover: f32, wetMix: f32, absorb: f32, absorbMax: f32,
	take: f32, tipMax: f32, settleLen: f32, landPile: f32, ridgeFade: f32, groove: f32, gateSpan: f32, swellLen: f32,
	swellHair: f32, depSwell: f32, fineTake: f32, sy: f32,
};
`;
const LAYER_PIXEL = `
fn layerRGB(k: u32) -> vec3f { return vec3f(f32(layers[k] & 65535u), f32(layers[k] >> 16u), f32(layers[k + 1u] & 65535u)) / 65535.; }
fn layerCoverage(k: u32, slot: u32) -> u32 { return (layers[k + 6u + (slot >> 1u)] >> ((slot & 1u) * 16u)) & 65535u; }
fn layerPixel(i: u32) -> vec4f {
	let k = i * ${LAYER_WORDS}u; var out = vec4f(0.);
	for (var slot = 0u; slot < ${OIL_LAYER_COUNT}u; slot++) { let w = f32(layerCoverage(k, slot)) / 65535. * (1. - out.w); out = vec4f(out.xyz + layerRGB(k + slot * 2u) * w, out.w + w); }
	return out;
}
`;
const STROKE = WG => PAINT_MIX_WGSL + HASH + PARAMS + `
const BANDS = ${BANDS}u;
const HS = ${HS}u;
const FX = ${FX}.;
struct Pig { p: array<vec4f, ${pigTable.length / 4}> };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> PIG: Pig;
@group(0) @binding(2) var<storage, read_write> paint: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> state: array<vec4f>;
struct Fields { snap: vec4f, paper: vec4f };
@group(0) @binding(4) var<storage, read> fields: array<Fields>;
@group(0) @binding(5) var<storage, read_write> expiry: array<f32>;
@group(0) @binding(6) var<storage, read_write> hairs: array<f32>;
@group(0) @binding(7) var<storage, read> steps: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> uv: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> layers: array<u32>;
${LAYER_PIXEL}
var<private> gC: vec4f;   // this step's centre and the grooves' frame (cos, sin)
var<private> gT: f32;     // this step's travel
var<private> gK: f32;     // how tightly the stroke turns here (OilPath._curl)
var<private> gNow: f32;   // captured input time, independent of GPU/frame/drain scheduling
fn pg(i: u32) -> f32 { return PIG.p[i >> 2u][i & 3u]; }
fn lum(c: vec3f) -> f32 { return .2126 * c.x + .7152 * c.y + .0722 * c.z; }
// Tint strength: a white or gray brush takes a darker paint up by less
fn oilTint(own: vec3f, took: vec3f, aff: f32) -> f32 {
	let mx = max(own.x, max(own.y, own.z)); var gray = 1.; if (mx > 0.) { gray = 1. - (mx - min(own.x, min(own.y, own.z))) / mx; }
	let t = min(1., max(.08, pow(max(.0001, lum(took)) / max(.0001, lum(own)), .75)));
	let eager = clamp((aff - .9) / .4, 0., 1.);
	return 1. + ((.2 + .8 * eager) - 1.) * gray * gray;
}
fn flagsOf(s: vec4f) -> u32 { return u32(s.w); }
fn wetUntil(expiry: f32) -> bool { return expiry < 0. || expiry > gNow; }
fn layerExpiry(k: u32, slot: u32) -> f32 { return expiry[k / ${LAYER_WORDS}u * 3u + slot]; }
// Rapier's pigment: K/S per band from six spectral primaries, plus the RGB residual, the colour rounded to 64 levels a
// channel (dark paint stains as in the look the owner chose); fused per-band loops with no arrays.
struct Wt { wh: f32, w0: f32, w1: f32, w2: f32, w3: f32, w4: f32, w5: f32 };
const QUANT = 63.;
fn srgb(c: f32) -> f32 { if (c <= .0031308) { return c * 12.92; } return 1.055 * pow(c, 1. / 2.4) - .055; }
fn linear(c: f32) -> f32 { if (c <= .04045) { return c / 12.92; } return pow((c + .055) / 1.055, 2.4); }
fn outerCell(c: vec3f) -> vec3f {
	let q = floor(vec3f(srgb(clamp(c.x, 0., 1.)), srgb(clamp(c.y, 0., 1.)), srgb(clamp(c.z, 0., 1.))) * QUANT + .5) / QUANT;
	return vec3f(linear(q.x), linear(q.y), linear(q.z));
}
fn outerKey(c: vec3f) -> u32 {
	let q = vec3u(floor(vec3f(srgb(clamp(c.x, 0., 1.)), srgb(clamp(c.y, 0., 1.)), srgb(clamp(c.z, 0., 1.))) * QUANT + .5));
	return q.x | (q.y << 6u) | (q.z << 12u);
}
fn wts(c0: vec3f) -> Wt {
	let c = floor(outerCell(c0) * 1023. + .5) / 1023.;
	let wh = min(c.x, min(c.y, c.z)); let r = c.x - wh; let g = c.y - wh; let b = c.z - wh;
	return Wt(wh, min(g, b), min(r, b), min(r, g), max(0., min(r - g, r - b)), max(0., min(g - r, g - b)), max(0., min(b - r, b - g)));
}
fn ks(w: Wt, i: u32) -> f32 {
	let j = i * 6u;
	let re = max(.0001, w.wh + w.w0 * pg(j) + w.w1 * pg(j + 1u) + w.w2 * pg(j + 2u) + w.w3 * pg(j + 3u) + w.w4 * pg(j + 4u) + w.w5 * pg(j + 5u));
	return (1. - re) * (1. - re) / (2. * re);
}
fn refl(k0: f32) -> f32 { let k = max(0., k0); return 1. / (1. + k + sqrt(k * k + 2. * k)); }
fn disp(i: u32) -> vec3f { let b = BANDS * 6u + i * 3u; return vec3f(pg(b), pg(b + 1u), pg(b + 2u)); }
// two nearly equal colours: K-M cannot dull their mix, so the painter's wheel (CM1's mixer) has nothing to rescue
fn near(a: vec3f, b: vec3f) -> bool { let d = abs(a - b); return d.x + d.y + d.z < .03; }
fn mixRGB(a: vec3f, b: vec3f, t0: f32) -> vec3f {
	let t = clamp(t0, 0., 1.);
	if (t <= 0. || abs(a.x - b.x) + abs(a.y - b.y) + abs(a.z - b.z) < 1e-7) { return a; }
	if (t >= 1.) { return b; }
	let ya = max(.0001, lum(a)); let yb = max(.0001, lum(b));
	let c = yb * t / (ya * (1. - t) + yb * t); let u = 1. - c;
	let wa = wts(a); let wb = wts(b); var da = vec3f(0.); var db = vec3f(0.); var o = vec3f(0.);
	for (var i = 0u; i < BANDS; i++) { let ka = ks(wa, i); let kb = ks(wb, i); let d = disp(i); da += refl(ka) * d; db += refl(kb) * d; o += refl(ka * u + kb * c) * d; }
	let aq = outerCell(a); let bq = outerCell(b); let ac = floor(aq * 1023. + .5) / 1023.; let bc = floor(bq * 1023. + .5) / 1023.;
	// paintWetRGB clamps the reconstructed K-M color before Oil adds its outer-grid residual.
	let decoded = clamp(o + (ac - da) * u + (bc - db) * c, vec3f(0.), vec3f(1.));
	let km = clamp(decoded + (a - aq) * u + (b - bq) * c, vec3f(0.), vec3f(1.));
	if (near(a, b)) { return km; }
	return min(max(a, b), mixRescue(km, mixAdd(mixState(a), mixState(b), t)));
}
// A hair keeps this spectral input until its outer cell changes. Exact RGB luminance, outer residual,
// and wheel state are deliberately not cached: highlights and changes within one cell still matter.
fn prepareHairMix(h: u32, a: vec3f) {
	let base = h * HS; let key = f32(outerKey(a));
	if (hairs[base + ${HC.key}u] == key) { return; }
	let wa = wts(a); var da = vec3f(0.);
	for (var i = 0u; i < BANDS; i++) { let ka = ks(wa, i); hairs[base + ${HC.ks}u + i] = ka; da += refl(ka) * disp(i); }
	let aq = outerCell(a); let ac = floor(aq * 1023. + .5) / 1023.;
	S3(h, ${HC.residual}u, ac - da); S3(h, ${HC.outer}u, aq);
	hairs[base + ${HC.key}u] = key;
}
// The same mix operation with only input a's spectral reconstruction prepared by phaseA.
// Keep every mixed-band inversion, both clamp stages, and the exact-color rescue in their original order.
fn mixHairRGB(a: vec3f, b: vec3f, t0: f32, h: u32) -> vec3f {
	let t = clamp(t0, 0., 1.);
	if (t <= 0. || abs(a.x - b.x) + abs(a.y - b.y) + abs(a.z - b.z) < 1e-7) { return a; }
	if (t >= 1.) { return b; }
	let ya = max(.0001, lum(a)); let yb = max(.0001, lum(b));
	let c = yb * t / (ya * (1. - t) + yb * t); let u = 1. - c;
	let wb = wts(b); var db = vec3f(0.); var o = vec3f(0.);
	for (var i = 0u; i < BANDS; i++) { let ka = hairs[h * HS + ${HC.ks}u + i]; let kb = ks(wb, i); let d = disp(i); db += refl(kb) * d; o += refl(ka * u + kb * c) * d; }
	let aq = H3(h, ${HC.outer}u); let bq = outerCell(b); let bc = floor(bq * 1023. + .5) / 1023.;
	let decoded = clamp(o + H3(h, ${HC.residual}u) * u + (bc - db) * c, vec3f(0.), vec3f(1.));
	let km = clamp(decoded + (a - aq) * u + (b - bq) * c, vec3f(0.), vec3f(1.));
	if (near(a, b)) { return km; }
	return min(max(a, b), mixRescue(km, mixAdd(mixState(a), mixState(b), t)));
}
// Correct the share for tinting strength; dark-with-dark approaches a plain mix.
fn mixT(a: vec3f, b: vec3f, t: f32) -> vec3f {
	let ya = max(.01, lum(a)); let yb = max(.01, lum(b));
	let dd = min(1., pow((ya + yb) / .6, .8));
	var k: f32; if (yb < ya) { k = min(1., 3. * yb / ya); } else { k = max(.4, sqrt(ya / yb)); }
	var te = 1.; if (t < 1.) { te = t * k * dd * dd / (t * k * dd * dd + 1. - t); }
	var o = mixRGB(a, b, te);
	if (dd < 1.) { o = o * dd + (a * (1. - te) + b * te) * (1. - dd); }
	return o;
}
// Uint16 strata. Each invocation owns one pixel, so its eight packed words need no atomics.
fn layerOpen(i: u32) {
	let flags = flagsOf(state[i]); if ((flags & 8u) != 0u) { return; }
	let k = i * ${LAYER_WORDS}u; let deep = layers[k + 5u] >> 16u;
	let cm = f32(layerCoverage(k, 1u)) / 65535.; let cb = f32(layerCoverage(k, 2u)) / 65535.; let cover = cm + cb * (1. - cm);
	let em = layerExpiry(k, 1u); let eb = layerExpiry(k, 2u); var mergedExpiry = em;
	if (cm == 0.) { mergedExpiry = eb; } else if (cb > 0.) { if (em < 0.) { mergedExpiry = eb; } else if (eb >= 0.) { mergedExpiry = min(em, eb); } }
	let ek = i * 3u; expiry[ek + 2u] = mergedExpiry; expiry[ek + 1u] = expiry[ek]; expiry[ek] = 0.;
	var rgb = vec3u(0u); if (cover > 0.) { rgb = vec3u(floor((layerRGB(k + 2u) * cm + layerRGB(k + 4u) * cb * (1. - cm)) / cover * 65535. + .5)); }
	layers[k + 4u] = rgb.x | (rgb.y << 16u);
	layers[k + 5u] = rgb.z | (min(65535u, (layers[k + 3u] >> 16u) + deep) << 16u);
	layers[k + 2u] = layers[k]; layers[k + 3u] = layers[k + 1u]; layers[k] = 0u; layers[k + 1u] = 0u;
	layers[k + 7u] = u32(floor(clamp(cover, 0., 1.) * 65535. + .5)); layers[k + 6u] = (layers[k + 6u] & 65535u) << 16u;
	state[i].w = f32(flags | 8u);
}
fn layerRead(i: u32) {
	let k = i * ${LAYER_WORDS}u; let flags = flagsOf(state[i]);
	let v = f32((layers[k + 1u] >> 16u) + (layers[k + 3u] >> 16u) + (layers[k + 5u] >> 16u)) / ${OIL_LAYER_VOLUME}.;
	let pixel = layerPixel(i); paint[i] = vec4f(pixel.xyz + vec3f(1. - pixel.w), v); state[i].w = f32(flags | 2u);
	layers[k + 7u] |= 65536u;   // GPU-only dirty bit in record padding; stripped at readback
}
fn layerLay(i: u32, rgb0: vec3f, amount: f32, coverage: f32, stir: bool) -> f32 {
	let units = u32(max(0., floor(amount * ${OIL_LAYER_VOLUME}. + .5))); let qcover = u32(floor(clamp(coverage, 0., 1.) * 65535. + .5)); if (units == 0u || qcover == 0u) { return 0.; }
	layerOpen(i);
	let k = i * ${LAYER_WORDS}u; let old = layers[k + 1u] >> 16u; let before = f32(layerCoverage(k, 0u)) / 65535.; let edge = f32(qcover) / 65535.; let cover = edge + before * (1. - edge); var rgb = rgb0;
	if (before > 0.) { let top = layerRGB(k); if (stir) { rgb = mixRGB(top, rgb, f32(units) / f32(old + units)); } else if (edge < 1.) { let t = edge / cover; rgb = top * (1. - t) + rgb * t; } }
	let c = vec3u(floor(clamp(rgb, vec3f(0.), vec3f(1.)) * 65535. + .5));
	layers[k] = c.x | (c.y << 16u); layers[k + 1u] = c.z | (min(65535u, old + units) << 16u);
	layers[k + 6u] = (layers[k + 6u] & 4294901760u) | u32(floor(clamp(cover, 0., 1.) * 65535. + .5));
	var until = -1.; if (P.wetLife >= 0.) { until = gNow + P.wetLife; } expiry[i * 3u] = until;
	layerRead(i); return f32(units) / ${OIL_LAYER_VOLUME}.;
}
fn layerLift(i: u32, amount: f32) -> vec4f {
	let k = i * ${LAYER_WORDS}u; var at = 0u; if ((flagsOf(state[i]) & 8u) != 0u) { at = 1u; }
	var units = u32(max(0., floor(amount * ${OIL_LAYER_VOLUME}. + .5))); var moved = 0u; var carried = vec3f(0.);
	loop {
		let word = k + at * 2u + 1u; let v = layers[word] >> 16u;
		if (units == 0u || v == 0u || !wetUntil(layerExpiry(k, at))) { break; }
		let q = min(units, v); carried += layerRGB(k + at * 2u) * f32(q);
		units -= q; moved += q; layers[word] = (layers[word] & 65535u) | ((v - q) << 16u);
		if (v == q) {
			for (var a = at * 2u; a < 4u; a++) { layers[k + a] = layers[k + a + 2u]; } layers[k + 4u] = 0u; layers[k + 5u] = 0u;
			var c0 = layerCoverage(k, 0u); if (at == 0u) { c0 = layerCoverage(k, 1u); } layers[k + 6u] = c0 | (layerCoverage(k, 2u) << 16u); layers[k + 7u] = 0u;
			for (var a = at; a < 2u; a++) { expiry[i * 3u + a] = expiry[i * 3u + a + 1u]; } expiry[i * 3u + 2u] = 0.;
		}
	}
	// Displaced pigment follows the removed strata, including a newly exposed buried colour.
	// Frozen pre-stroke colour belongs to brush pickup, not to this material transfer.
	if (moved != 0u) { layerRead(i); } return vec4f(carried / max(1., f32(moved)), f32(moved) / ${OIL_LAYER_VOLUME}.);
}
fn H3(h: u32, o: u32) -> vec3f { let b = h * HS + o; return vec3f(hairs[b], hairs[b + 1u], hairs[b + 2u]); }
fn S3(h: u32, o: u32, v: vec3f) { let b = h * HS + o; hairs[b] = v.x; hairs[b + 1u] = v.y; hairs[b + 2u] = v.z; }
var<workgroup> slots: array<u32, 256>;
var<workgroup> starts: array<u32, 257>;
var<workgroup> rstarts: array<u32, 257>;
var<workgroup> gstart: array<u32, 257>;
var<workgroup> groupCount: u32;
var<workgroup> acc: array<atomic<i32>, 2560>;
var<workgroup> cnts: array<u32, 256>;   // a hair's lay tasks | release tasks << 16 this step, 0 when it does not touch
fn cl(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn addF(h: u32, k: u32, v: f32) { atomicAdd(&acc[h * 10u + k], i32(round(v * FX))); }
fn getF(h: u32, k: u32) -> f32 { return f32(atomicLoad(&acc[h * 10u + k])) / FX; }
// One hair's geometry, load, and contact parameters for this input step.
fn phaseA(h: u32, x: f32, y: f32, p: f32, fx: f32, fy: f32, travel: f32, ang: f32) {
	let nx = -fy; let ny = fx; let R0 = P.R0;
	let spread = .9 + .1 * cl(p);
	let ox = ${F('ox')}; let oy = ${F('oy')};
	var ax: f32; var ay: f32;
	if (P.flat > .5) { let hx = cos(ang); let hy = sin(ang); ax = x + (hx * ox - hy * oy) * R0; ay = y + (hy * ox + hx * oy) * R0; }
	else { ax = x + (nx * ox * spread + fx * (oy * .55 - .25) * .9) * R0; ay = y + (ny * ox * spread + fy * (oy * .55 - .25) * .9) * R0; }
	{	// each hair wanders a little across the head along the stroke
		let hw = ${F('hseed')}; let sw = i32(hw * 5.); let uw = travel / (P.width * ${OIL_LOOK.wanderLen}) + hw * .37; let iw = floor(uw); let fw = uw - iw; let ew = fw * fw * (3. - 2. * fw);
		var w = ${OIL_LOOK.wander} * (1. + ${OIL_LOOK.curlWander} * gK) * R0 * 2. * (hash(i32(iw), sw, 41) * (1. - ew) + hash(i32(iw) + 1, sw, 41) * ew - .5);
		let u2 = travel / ${OIL_LOOK.wobLen}. + hw * 1.7; let j0 = floor(u2); let f2 = u2 - j0; let e2 = f2 * f2 * (3. - 2. * f2);
		w += ${OIL_LOOK.wobPx} * 2. * (hash(i32(j0), sw, 43) * (1. - e2) + hash(i32(j0) + 1, sw, 43) * e2 - .5);
		// Keep lateral noise inside the neighboring anchors' midpoints. This preserves their target order;
		// the filtered tips and the stroke path can still cross when the painter turns the brush.
		var left = -1.; var right = 1.;
		if (h > 0u) { left = hairs[(h - 1u) * HS + ${O.ox}u]; }
		if (h + 1u < u32(P.nh)) { right = hairs[(h + 1u) * HS + ${O.ox}u]; }
		let headScale = R0 * select(spread, 1., P.flat > .5);
		w = clamp(w, -.45 * max(0., ox - left) * headScale, .45 * max(0., right - ox) * headScale);
		if (P.flat > .5) { ax += cos(ang) * w; ay += sin(ang) * w; } else { ax += nx * w; ay += ny * w; }
	}
	if (${F('on')} < .5) { ${F('tx')} = ax; ${F('ty')} = ay; ${F('px')} = ax; ${F('py')} = ay; ${F('on')} = 1.; ${F('first')} = 1.; return; }
	let g = ${F('g')};
	let lag = .38 + .3 * g / 1.4;
	let tx0 = ${F('tx')}; let ty0 = ${F('ty')};
	${F('px')} = tx0; ${F('py')} = ty0;
	let tx = tx0 + (ax - tx0) * lag; let ty = ty0 + (ay - ty0) * lag;
	${F('tx')} = tx; ${F('ty')} = ty;
	var off: bool; if (P.flat > .5) { off = abs(ox) > .55 + .6 * cl(p); } else { off = abs(ox) > .86 + .2 * cl(p); }
	let land = ${F('land')};
	if (off || travel < land || p < .12 + .6 * ${F('gate')}) { return; }
	let st = cl((travel - land) / (P.width * P.settleLen));
	if (st < ${F('gate')} * P.gateSpan) { return; }
	let settle = st * st * (3. - 2. * st);
	let cs = ${F('cseed')};
	let hs = P.swellHair * ${F('hseed')}; let sd = i32(cs * 7. + hs);
	var u = travel / (P.width * P.swellLen) + cs + hs; var i0 = floor(u); var f = u - i0; var e = f * f * (3. - 2. * f);
	let swell = .45 + 1.1 * (hash(i32(i0), sd, 11) * (1. - e) + hash(i32(i0) + 1, sd, 11) * e);
	let x0 = tx0; let y0 = ty0; let dx = tx - x0; let dy = ty - y0;
	var len2 = dx * dx + dy * dy; if (len2 == 0.) { len2 = 1e-6; }
	let rad0 = P.hairR;
	let bx0 = max(0., floor(min(x0, tx) - rad0 - 1.)); let bx1 = min(P.W - 1., ceil(max(x0, tx) + rad0 + 1.));
	let by0 = max(0., floor(min(y0, ty) - rad0 - 1.)); let by1 = min(P.H - 1., ceil(max(y0, ty) + rad0 + 1.));
	${F('bx0')} = bx0; ${F('by0')} = by0; ${F('bw')} = max(0., bx1 - bx0 + 1.); ${F('bh')} = max(0., by1 - by0 + 1.);
	let rad = rad0 * (.35 + .65 * settle);
	${F('rad')} = rad;
	{	// where this hair's bow wave can be released (behind it, and for the outer hairs to the side across the head)
		var side = 0.; if (abs(ox) > .7) { side = sign(ox); }
		var sxn = nx; var syn = ny; if (P.flat > .5) { sxn = cos(ang); syn = sin(ang); }
		let off2 = side * rad * .6; let rr = rad + 1.;
		let sx0 = x0 + sxn * off2; let sy0 = y0 + syn * off2; let sx1 = tx + sxn * off2; let sy1 = ty + syn * off2;
		let ax0 = max(0., floor(min(sx0, sx1) - rr)); let ax1 = min(P.W - 1., ceil(max(sx0, sx1) + rr));
		let ay0 = max(0., floor(min(sy0, sy1) - rr)); let ay1 = min(P.H - 1., ceil(max(sy0, sy1) + rr));
		${F('sx0')} = sx0; ${F('sy0')} = sy0; ${F('rr')} = rr;
		${F('ax0')} = ax0; ${F('ay0')} = ay0; ${F('aw')} = max(0., ax1 - ax0 + 1.); ${F('ah')} = max(0., ay1 - ay0 + 1.);
		cnts[h] = u32(max(0., bx1 - bx0 + 1.) * max(0., by1 - by0 + 1.)) | (u32(max(0., ax1 - ax0 + 1.) * max(0., ay1 - ay0 + 1.)) << 16u);
	}
	${F('step')} = sqrt(len2);
	let lf = clamp(${F('L')} / P.cap, 0., 1.5);
	${F('lf')} = lf;
	let pk = ${F('pk')};
	var col: vec3f;
	if (pk <= .002) { col = H3(h, ${O.res}u); }
	else { let tint = oilTint(H3(h, ${O.res0}u), H3(h, ${O.pick}u), ${F('aff')}); col = mixT(H3(h, ${O.res}u), H3(h, ${O.pick}u), min(pk, min(P.tipMax, P.pickup * ${F('aff')} * (1. + .5 * P.thin))) * tint); }
	let previousCol = H3(h, ${O.col}u); S3(h, ${O.col}u, col);
	// Unchanged exact color also skips the outer-cell quantizer. The cache is private to this hair's col.
	if (hairs[h * HS + ${HC.key}u] < 0. || any(col != previousCol)) { prepareHairMix(h, col); }
	${F('pk')} = pk * ${OIL_LOOK.pickFade};
	let lm = min(1., lf);
	let thr = 1.08 - (.28 * cl(p) + 1.75 * lm - .35 * lm * lm);
	${F('ramp')} = .12 + .25 * min(1., lf * 1.5) * settle;
	let hd = ${F('hseed')}; let sdd = i32(hd * 3.);
	u = travel / (P.width * ${OIL_LOOK.dryLen}) + hd * .61; i0 = floor(u); f = u - i0; e = f * f * (3. - 2. * f);
	let dry = hash(i32(i0), sdd, 31) * (1. - e) + hash(i32(i0) + 1, sdd, 31) * e;
	${F('thrL')} = thr + .75 * (1. - settle) - ${OIL_LOOK.dryStreak} * (dry - .5);
	{ let hd2 = ${F('hseed')}; let ud = travel / ${OIL_LOOK.dashPx}. + hd2 * 1.9; let id = floor(ud); let fd = ud - id; let ed = fd * fd * (3. - 2. * fd); let sd2 = i32(hd2 * 7.);
	  ${F('dash')} = hash(i32(id), sd2, 53) * (1. - ed) + hash(i32(id) + 1, sd2, 53) * ed; }
	{ let hd2 = ${F('hseed')}; let uf = travel / ${OIL_LOOK.fleckPx}. + hd2 * 2.3; let i0f = floor(uf); let ff = uf - i0f; let ef = ff * ff * (3. - 2. * ff); let sf = i32(hd2 * 13.);
	  let nf = hash(i32(i0f), sf, 71) * (1. - ef) + hash(i32(i0f) + 1, sf, 71) * ef;
	  ${F('fleckN')} = nf; ${F('fleck')} = cl((nf - 1. + ${OIL_LOOK.fleckShare}) / .12); }
	${F('settle')} = settle; ${F('swell')} = swell;
}
// One bristle contact on one pixel.
fn layPixel(h: u32, px: u32, py: u32, p: f32, lift: f32) {
	let x0 = ${F('px')}; let y0 = ${F('py')}; let dx = ${F('tx')} - x0; let dy = ${F('ty')} - y0;
	var len2 = dx * dx + dy * dy; if (len2 == 0.) { len2 = 1e-6; }
	let qx = f32(px) + .5 - x0; let qy = f32(py) + .5 - y0; let s0 = (qx * dx + qy * dy) / len2;
	if (s0 < 0. && ${F('first')} < .5) { return; }
	let s = cl(s0); let ex = qx - dx * s; let ey = qy - dy * s;
	let d = sqrt(ex * ex + ey * ey); let cw = cl((${F('rad')} + .5 * ${OIL_LOOK.hairSoft} - d) / ${OIL_LOOK.hairSoft});
	if (cw <= 0.) { return; }
	let i = py * u32(P.W) + px;
	let pc = paint[i]; let sv = state[i];
	let v = pc.w; let ev = exp(-1.6 * v);
	let surf = (.5 + P.contact * (fields[i].paper.y - .5)) * ev + (1. - ev) * (.6 + .9 * sv.x);
	let st0 = ${F('settle')}; let edge = ${OIL_LOOK.edgeDots} * cl((abs(${F('ox')}) - .72) / .28); var dots = 1.; if (1. - st0 + edge > 0.) { dots = cl(((fields[i].paper.y + ${F('dash')}) * .5 - max(1. - st0, edge) * ${OIL_LOOK.landDots}) * 2.5 + .5); }
	let f = cl((surf - ${F('thrL')}) / ${F('ramp')} + .5) * dots;
	if (f <= 0.) { return; }
	let dry = cl((p - .08) / .9); let cg = fields[i].paper.z;
	var grain = 1.; if (dry < 1.) { grain = cl((cg * (1. - ${OIL_LOOK.dryTrack}) + ${F('fleckN')} * ${OIL_LOOK.dryTrack} - (1. - ${OIL_LOOK.dryReach} * pow(dry, ${OIL_LOOK.dryPow}))) / ${OIL_LOOK.drySoft} + .5); }
	if (grain <= 0.) { return; }
	let k = cw * f * grain * (${OIL_LOOK.dryThin} + ${1 - OIL_LOOK.dryThin} * pow(dry, 1.4)) * (1. - ${OIL_LOOK.fleck} * ${F('fleck')} * (.6 + .8 * (1. - cg))) * min(1., ${F('step')});
	let lf = ${F('lf')};
	let wetOk = wetUntil(fields[i].paper.w);
	let sn = fields[i].snap;
	var wet = sn.w; if (!wetOk) { wet = 0.; }
	if (wet > .01) {
		let q = cl(.45 * k * min(1., wet) / (.4 + lf));
		if (q > .004) { addF(h, 0u, q); addF(h, 1u, 1.); addF(h, 2u, q * sn.x); addF(h, 3u, q * sn.y); addF(h, 4u, q * sn.z); }
	}
	var live = min(v, sn.w); if (!wetOk) { live = 0.; }
	if (live > .02 && P.plow > 0.) {
		let pv = layerLift(i, min(live * .4, live * P.plow * k * (1. - .6 * P.thin)));
		addF(h, 5u, pv.w); addF(h, 6u, pv.w * pv.x); addF(h, 7u, pv.w * pv.y); addF(h, 8u, pv.w * pv.z);
	}
	if (${F('L')} > 0. && lift <= .25 + .75 * hash(i32(${F('hseed')} * 11.), 0, 61)) {
		let full = min(1.3, lf);
		var gF: f32; if (full > .25) { gF = sqrt(full); } else { gF = .5 * sqrt(full / .25); }
		let g = ${F('g')}; let thin = P.thin; let settle = ${F('settle')};
		let dep = .16 * ${OIL_LOOK.hairPx / 1.15} * g * gF * k * (1. - .45 * thin) * P.body * (1. + ${OIL_LOOK.liftLip} * lift * (1. - lift) * 4. * min(1., lf) * (1. - thin)) * (1. + P.landPile * (1. - settle) * min(1., lf)) * (1. + P.depSwell * (${F('swell')} - 1.));
		let contact = cw * f * grain; let edge = .12 + .2 * (1. - min(1., lf)) + .55 * (1. - settle) * (1. - dry);
		if (contact < edge || dep < .006) { return; }
		let coverage = cl((contact - edge) * 4.);
		var stir = 0.; if (wet > .01) { stir = min(.4, (.12 * gK + .3 * max(0., .75 - lf) + .18 * thin) * P.wetMix * cl(p)) * oilTint(H3(h, ${O.res0}u), sn.xyz, ${F('aff')}); }
		var mixed = H3(h, ${O.col}u); if (stir > .0001) { mixed = mixHairRGB(mixed, sn.xyz, stir, h); }
		let laid = layerLay(i, mixed, dep, coverage, false); if (laid == 0.) { return; }
		let cover = cl(laid / .04); var out = state[i]; var flags = flagsOf(out);
		out.x += (P.ridge * (1. - ${OIL_LOOK.curlFlat} * gK) * ${F('bump')} * ${F('swell')} * (.8 + .2 * g) * min(1., P.ridgeFade + lf) * (1. - .7 * thin) * (1. + 1.6 * lift * (1. - lift) * 4.) - out.x) * cl(cover * 2.6);
		if (cover > .5) { out.y = P.acr; }
		if (cover > P.fineTake) { let q = uv[i]; uv[i] = vec4f(P.groove + (f32(px) + .5 - gC.x) * gC.z + (f32(py) + .5 - gC.y) * gC.w, gT, q.z, q.w); flags |= 4u; }
		out.w = f32(flags); state[i] = out; addF(h, 9u, laid);
	}
}
// Release the bow wave group by group, then update each hair's carried paint and load once per step.
fn hairPick(h: u32) {
	let qs = getF(h, 0u);
	if (qs > 0.) {
		let qn = getF(h, 1u); let qm = vec3f(getF(h, 2u), getF(h, 3u), getF(h, 4u)) / qs;
		let pk = ${F('pk')};
		let q = min(1., P.take * qs / qn); let npk = pk + (1. - pk) * q;
		S3(h, ${O.pick}u, mixRGB(H3(h, ${O.pick}u), qm, q / npk)); ${F('pk')} = npk;
		let res0 = H3(h, ${O.res0}u);
		let yr = max(.01, lum(res0)); let yp = max(.01, lum(qm));
		let aff = ${F('aff')}; let as0 = ${F('as')};
		let tr = oilTint(res0, qm, aff); let ga = min(1., q * P.absorb * aff * tr);
		var t = 1.; if (as0 > 0.) { t = ga / (as0 + ga); }
		let ab = mixRGB(H3(h, ${O.abs}u), qm, t); S3(h, ${O.abs}u, ab);
		let as1 = as0 + ga * max(0., 1. - as0 / (P.absorbMax * tr)); ${F('as')} = as1;
		S3(h, ${O.res}u, mixT(res0, ab, as1));
	}
	let rad = ${F('rad')};
	${F('L')} = ${F('L')} - getF(h, 9u) / (.16 * ${OIL_LOOK.hairPx / 1.15} * (2. * rad + 1.) * P.body) / (1. + 1.5 * P.thin);
	${F('first')} = 0.;
}
fn hairBow(h: u32) {
	let pv = getF(h, 5u); var bowV = ${F('bowV')};
	if (pv > 0.) { let nb = bowV + pv; S3(h, ${O.bow}u, (H3(h, ${O.bow}u) * bowV + vec3f(getF(h, 6u), getF(h, 7u), getF(h, 8u))) / nb); bowV = nb; }
	${F('rel')} = 0.;
	if (bowV > 1e-4) {
		let rel = bowV * .12; bowV -= rel; ${F('rel')} = rel;
		// Match the reference's clipped discrete capsule, including the canvas edges.
		var tw = 0.;
		let ax0 = u32(${F('ax0')}); let ay0 = u32(${F('ay0')}); let aw = u32(${F('aw')}); let ah = u32(${F('ah')});
		for (var y = 0u; y < ah; y++) { for (var x = 0u; x < aw; x++) { tw += cellK(h, ax0 + x, ay0 + y); } }
		${F('tw')} = tw;
	}
	${F('bowV')} = bowV;
}
fn cellK(h: u32, X: u32, Y: u32) -> f32 {
	let dx = ${F('tx')} - ${F('px')}; let dy = ${F('ty')} - ${F('py')};
	var len2 = dx * dx + dy * dy; if (len2 == 0.) { len2 = 1e-6; }
	let qx = f32(X) + .5 - ${F('sx0')}; let qy = f32(Y) + .5 - ${F('sy0')};
	let t = cl((qx * dx + qy * dy) / len2); let ex = qx - dx * t; let ey = qy - dy * t;
	return cl(${F('rr')} - sqrt(ex * ex + ey * ey));
}
fn findSlot(t: u32, k0: u32, k1: u32, st: ptr<workgroup, array<u32, 257>>) -> u32 { var k = k0; while (k + 1u < k1 && (*st)[k + 1u] <= t) { k++; } return k; }
@compute @workgroup_size(${WG})
fn stroke(@builtin(local_invocation_index) lid: u32) {
	let nh = u32(P.nh); let ns = u32(P.nsteps);
	// the layer grew under the stroke: every hair moves with the paint
	if (lid < nh && (P.sx != 0. || P.sy != 0.)) { let h = lid; ${F('tx')} += P.sx; ${F('ty')} += P.sy; ${F('px')} += P.sx; ${F('py')} += P.sy; }
	storageBarrier(); workgroupBarrier();
	for (var s = 0u; s < ns; s++) {
		// a step: x, y, pressure, direction x; direction y, travel, lift, the grooves' frame angle; the head's angle
		let a = steps[s * 3u]; let b = steps[s * 3u + 1u]; let c2 = steps[s * 3u + 2u]; gC = vec4f(a.x, a.y, cos(b.w), sin(b.w)); gT = b.y; gK = c2.y; gNow = c2.w; let G = u32(c2.z);
		if (lid < nh) { cnts[lid] = 0u; phaseA(lid, a.x, a.y, a.z, a.w, b.x, b.y, c2.x); for (var k = 0u; k < 10u; k++) { atomicStore(&acc[lid * 10u + k], 0); } }
		storageBarrier(); workgroupBarrier();
		if (lid == 0u) {
			var n = 0u; var tot = 0u; var rtot = 0u; var ng = 0u;
			for (var g = 0u; g < G; g++) {
				var first = n;
				for (var h = g; h < nh; h += G) {
					let c = cnts[h]; if (c == 0u) { continue; }
					var overlap = false;
					let hx = min(${F('bx0')}, ${F('ax0')}); let hy = min(${F('by0')}, ${F('ay0')});
					let hx1 = max(${F('bx0')} + ${F('bw')}, ${F('ax0')} + ${F('aw')}); let hy1 = max(${F('by0')} + ${F('bh')}, ${F('ay0')} + ${F('ah')});
					for (var k = first; k < n; k++) {
						let o = slots[k] * HS; let x = min(hairs[o + ${A.bx0}u], hairs[o + ${A.ax0}u]); let y = min(hairs[o + ${A.by0}u], hairs[o + ${A.ay0}u]);
						let x1 = max(hairs[o + ${A.bx0}u] + hairs[o + ${A.bw}u], hairs[o + ${A.ax0}u] + hairs[o + ${A.aw}u]);
						let y1 = max(hairs[o + ${A.by0}u] + hairs[o + ${A.bh}u], hairs[o + ${A.ay0}u] + hairs[o + ${A.ah}u]);
						if (hx < x1 && x < hx1 && hy < y1 && y < hy1) { overlap = true; break; }
					}
					if (overlap) { gstart[ng] = first; ng++; first = n; }
					slots[n] = h; starts[n] = tot; rstarts[n] = rtot; tot += c & 65535u; rtot += c >> 16u; n++;
				}
				if (n > first) { gstart[ng] = first; ng++; }
			}
			gstart[ng] = n; groupCount = ng; starts[n] = tot; rstarts[n] = rtot;
		}
		workgroupBarrier();
		let ng = workgroupUniformLoad(&groupCount);
		for (var g = 0u; g < ng; g++) {
			let k0 = gstart[g]; let k1 = gstart[g + 1u];
			let t0 = starts[k0]; let t1 = starts[k1];
			for (var t = t0 + lid; t < t1; t += ${WG}u) {
				let k = findSlot(t, k0, k1, &starts); let h = slots[k]; let r = t - starts[k]; let bw = u32(${F('bw')});
				layPixel(h, u32(${F('bx0')}) + r % bw, u32(${F('by0')}) + r / bw, a.z, b.z);
			}
			storageBarrier(); workgroupBarrier();
			if (k0 + lid < k1) { hairBow(slots[k0 + lid]); }
			storageBarrier(); workgroupBarrier();
			let r0 = rstarts[k0]; let r1 = rstarts[k1];
			for (var t = r0 + lid; t < r1; t += ${WG}u) {
				let k = findSlot(t, k0, k1, &rstarts); let h = slots[k];
				let rel = ${F('rel')}; let tw = ${F('tw')};
				if (rel <= 0. || tw <= 0.) { continue; }
				let r = t - rstarts[k]; let aw = u32(${F('aw')});
				let X = u32(${F('ax0')}) + r % aw; let Y = u32(${F('ay0')}) + r / aw;
				let kk = cellK(h, X, Y);
				if (kk > 0.) {
					let i = Y * u32(P.W) + X;
					let amount = rel * kk / tw; layerLay(i, H3(h, ${O.bow}u), amount, min(1., amount / .02), true);
				}
			}
			storageBarrier(); workgroupBarrier();
		}
		if (lid < gstart[ng]) { hairPick(slots[lid]); }
		storageBarrier(); workgroupBarrier();
		// what the tips picked up spreads to their neighbours across the head
		if (${OIL_LOOK.pickShare} > 0. && lid < nh) {
			let h = lid; let k = ${OIL_LOOK.pickShare}; var sp = 0.; var sc = vec3f(0.); var cnt = 0.;
			if (h > 0u) { let o = (h - 1u) * HS; let pk = hairs[o + ${O.pk}u]; sp += pk; sc += vec3f(hairs[o + ${O.pick}u], hairs[o + ${O.pick + 1}u], hairs[o + ${O.pick + 2}u]) * pk; cnt += 1.; }
			if (h + 1u < nh) { let o = (h + 1u) * HS; let pk = hairs[o + ${O.pk}u]; sp += pk; sc += vec3f(hairs[o + ${O.pick}u], hairs[o + ${O.pick + 1}u], hairs[o + ${O.pick + 2}u]) * pk; cnt += 1.; }
			let me = H3(h, ${O.pick}u); let mpk = ${F('pk')}; let wm = mpk * (1. - k); let wn = k * sp / cnt; let wt = wm + wn;
			var np = me; if (wt > 1e-6) { np = (me * wm + k * sc / cnt) / wt; }
			hairs[h * HS + ${A.share}u] = np.x; hairs[h * HS + ${A.share + 1}u] = np.y; hairs[h * HS + ${A.share + 2}u] = np.z; hairs[h * HS + ${A.share + 3}u] = mpk + k * (sp / cnt - mpk);
		}
		storageBarrier(); workgroupBarrier();
		if (${OIL_LOOK.pickShare} > 0. && lid < nh) {
			let h = lid; S3(h, ${O.pick}u, vec3f(hairs[h * HS + ${A.share}u], hairs[h * HS + ${A.share + 1}u], hairs[h * HS + ${A.share + 2}u])); ${F('pk')} = hairs[h * HS + ${A.share + 3}u];
		}
		storageBarrier(); workgroupBarrier();
	}
}
`;

const IO = HASH + FIELD_NOISE + PARAMS + `
struct Box { x0: u32, y0: u32, w: u32, h: u32, W: u32, n: u32, p0: u32, p1: u32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> Bx: Box;
@group(0) @binding(2) var<storage, read_write> paint: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> uv: array<vec4f>;
struct Fields { snap: vec4f, paper: vec4f };
@group(0) @binding(5) var<storage, read_write> fields: array<Fields>;
@group(0) @binding(6) var<storage, read_write> expiry: array<f32>;
@group(0) @binding(7) var<storage, read> incoming: array<u32>;   // tile xy, origin floor xy, origin fraction xy, then material
@group(0) @binding(8) var<storage, read_write> oilp: array<u32>;
@group(0) @binding(9) var<storage, read_write> layers: array<u32>;
fn in4(i: u32) -> vec4f { return bitcast<vec4f>(vec4u(incoming[i], incoming[i + 1u], incoming[i + 2u], incoming[i + 3u])); }
fn toothAt(x: f32, y: f32) -> f32 { return clamp(.6 * vnoise(x / 9., y / 7., 8) + .4 * vnoise(x / 3.5, y / 3., 9), 0., 1.); }
fn canvasAt(x: f32, y: f32) -> f32 {
	return clamp(.5 + .22 * (cos(x * 1.5) + cos(y * 1.5)) + .18 * (hash(i32(x), i32(y), 5) - .5) + .1 * (vnoise(x / 6., y / 6., 6) - .5), 0., 1.);
}
@compute @workgroup_size(256)
fn load(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) lid: u32) {
	let base = wg.x * ${TILE_WORDS}u; let tx = incoming[base]; let ty = incoming[base + 1u]; let W = u32(P.W); let H = u32(P.H);
	let tox = bitcast<i32>(incoming[base + 2u]); let toy = bitcast<i32>(incoming[base + 3u]);
	let fracX = bitcast<f32>(incoming[base + 4u]); let fracY = bitcast<f32>(incoming[base + 5u]);
	for (var k = lid; k < 4096u; k += 256u) {
		let x = tx * 64u + k % 64u; let y = ty * 64u + k / 64u;
		if (x >= W || y >= H) { continue; }
		let i = y * W + x; let s = base + ${HEADER_WORDS}u + k * ${INPUT_WORDS}u;
		// A resized surface may already carry this stroke's floats and immutable pickup snapshot.
		if ((u32(state[i].w) & 16u) == 0u) {
			paint[i] = in4(s); fields[i].snap = in4(s); state[i] = in4(s + 4u); state[i].w += 16.; uv[i] = in4(s + 8u);
			let px = f32(i32(x) + tox) + fracX; let py = f32(i32(y) + toy) + fracY;
			fields[i].paper = vec4f(0., toothAt(px, py), canvasAt(px, py), 0.);
			for (var a = 0u; a < ${LAYER_WORDS}u; a++) { layers[i * ${LAYER_WORDS}u + a] = incoming[s + 12u + a]; }
			let k0 = i * ${LAYER_WORDS}u; let top = layers[k0 + 1u] >> 16u;
			for (var a = 0u; a < 3u; a++) { expiry[i * 3u + a] = bitcast<f32>(incoming[s + 20u + a]); }
			fields[i].paper.w = expiry[i * 3u];
			if ((layers[k0 + 6u] & 65535u) != 0u) { paint[i].w = f32(top + (layers[k0 + 3u] >> 16u) + (layers[k0 + 5u] >> 16u)) / ${OIL_LAYER_VOLUME}.; fields[i].snap.w = f32(top) / ${OIL_LAYER_VOLUME}.; }
		}
		let v = in4(s).w; var o = 0u; if (v > 0.) { o = (u32(clamp(floor(v * ${OIL_V}. + .5), 1., ${OIL_V_MAX}.)) << 5u) | u32(min(31., round(in4(s + 8u).w * ${OIL_G}.))); }
		oilp[i] = o;
	}
}
`;
const COMPOSE = HASH + PARAMS + `
struct Box { x0: u32, y0: u32, w: u32, h: u32, W: u32, n: u32, p0: u32, p1: u32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> Bx: Box;
@group(0) @binding(2) var<storage, read> paint: array<vec4f>;
@group(0) @binding(3) var<storage, read> state: array<vec4f>;
@group(0) @binding(4) var<storage, read> uv: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> sheet: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> volume: array<u32>;
@group(0) @binding(7) var<storage, read_write> oilp: array<u32>;
struct Fine { fine: f32, fineW: f32, fineLen: f32, fineSharp: f32 };
@group(0) @binding(8) var<uniform> FN: Fine;
@group(0) @binding(9) var<storage, read> layers: array<u32>;
${LAYER_PIXEL}
@compute @workgroup_size(16, 16)
fn compose(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= Bx.w || id.y >= Bx.h) { return; }
	let x = Bx.x0 + id.x; let y = Bx.y0 + id.y; let i = y * Bx.W + x;
	let sv = state[i]; let flags = u32(sv.w);
	if ((flags & 2u) == 0u) { return; }
	let pc = paint[i]; let q = uv[i]; let v = max(0., pc.w); let was = (flags & 1u) != 0u;
	sheet[i] = layerPixel(i);
	if (v > 0.) {
		var g = 0.;
		if ((flags & 4u) != 0u && FN.fine > 0.) {
			let f = q.x / FN.fineW; let kf = floor(f); let fr = f - kf; let kk = i32(kf);
			let sa = q.y / FN.fineLen + 7. * hash(kk, 1, 2); let a0 = floor(sa); let e = sa - a0; let es = e * e * (3. - 2. * e); let ai = i32(a0);
			let on = hash(kk, ai, 3) * (1. - es) + hash(kk, ai + 1, 3) * es; let depth = (.25 + .75 * hash(kk, 5, 9)) * (${OIL_LOOK.fineFloor} + ${1 - OIL_LOOK.fineFloor} * on);
			let z = (fr - .5) / FN.fineSharp; g = FN.fine * depth * exp(-z * z);
		} else if (was) { g = q.w; }
		oilp[i] = (u32(clamp(floor(v * ${OIL_V}. + .5), 1., ${OIL_V_MAX}.)) << 5u) | u32(min(31., round(g * ${OIL_G}.)));
		volume[i] = u32(round(clamp((sv.x - ${REL_LO}) / ${REL_SPAN}, 0., 1.) * 127.)) | (u32(sv.y) << 7u) | (oilp[i] << 16u);
	} else {
		oilp[i] = 0u; var vb = u32(sv.z); if (was) { vb = 0u; } volume[i] = vb;
	}
}
`;
const LIGHT = HASH + FIELD_NOISE + `
struct L { x0: i32, y0: i32, w: i32, h: i32, W: i32, H: i32, bx0: i32, by0: i32, bw: i32, bh: i32, tox: i32, toy: i32,
	relief: f32, volumeLight: f32, bodyLight: f32, vFull: f32, vGamma: f32, vMax: f32, diffuse: f32, spec: f32, cavity: f32, glossOil: f32, glossAcr: f32, vFloor: f32,
	fracX: f32, fracY: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> Q: L;
@group(0) @binding(1) var<storage, read> sheet: array<vec4f>;
@group(0) @binding(2) var<storage, read> volume: array<u32>;
@group(0) @binding(3) var<storage, read> oilp: array<u32>;
@group(0) @binding(4) var<storage, read_write> A: array<vec4f>;   // H, soft H (grooves cut), the cavity's blur, paint presence blurred
@group(0) @binding(5) var<storage, read_write> Tm: array<vec4f>;  // scratch: x pass of the soft H, the cavity, the presence; V
@group(0) @binding(6) var<storage, read_write> outp: array<u32>;
fn weaveAt(x: i32, y: i32) -> f32 {
	let fx = f32(x) + Q.fracX; let fy = f32(y) + Q.fracY;
	// Keep the integer hash's low bits; a negative coordinate with a fraction truncates toward zero.
	let hx = x + select(0, 1, x < 0 && Q.fracX > 0.); let hy = y + select(0, 1, y < 0 && Q.fracY > 0.);
	return clamp(.62 * vnoise(fx / 2.6, fy / 2.2, 3) + .28 * vnoise(fx / 7., fy / 6., 4) + .25 * (hash(hx, hy, 1) - .5) + .05, 0., 1.);
}
fn ri(x: i32, y: i32) -> u32 { return u32(clamp(y, 0, Q.h - 1) * Q.w + clamp(x, 0, Q.w - 1)); }   // region index (clamped)
fn si(x: i32, y: i32) -> u32 { return u32((Q.y0 + y) * Q.W + Q.x0 + x); }               // sheet index of a region pixel
@compute @workgroup_size(16, 16) fn h0(@builtin(global_invocation_id) id: vec3u) {
	let x = i32(id.x); let y = i32(id.y); if (x >= Q.w || y >= Q.h) { return; }
	let i = si(x, y); let o = oilp[i]; var H = 0.; var v = 0.; var pr = 0.;
	if (o != 0u) {
		v = f32(max(1u, o >> 5u)) / ${OIL_V}.; let rel = f32(volume[i] & 127u) / 127. * ${REL_SPAN} + ${REL_LO};
		H = Q.volumeLight * v / (1. + ${OIL_LOOK.volSat} * v) + rel * min(1., v * 2.5) + Q.relief * weaveAt(Q.x0 + x + Q.tox, Q.y0 + y + Q.toy) * exp(-3. * v);
		if (v > .03) { pr = 1.; }
	}
	A[ri(x, y)] = vec4f(H, 0., 0., pr); Tm[ri(x, y)] = vec4f(0., 0., 0., v);
}
@compute @workgroup_size(16, 16) fn h1(@builtin(global_invocation_id) id: vec3u) {
	let x = i32(id.x); let y = i32(id.y); if (x >= Q.w || y >= Q.h) { return; }
	var t = A[ri(x, y)].x; if (x > 0 && x < Q.w - 1) { t = (A[ri(x - 1, y)].x + 2. * A[ri(x, y)].x + A[ri(x + 1, y)].x) * .25; }
	var sp = 0.; for (var d = -9; d <= 9; d++) { sp += A[ri(x + d, y)].w; }
	let k = ri(x, y); Tm[k] = vec4f(t, 0., sp / 19., Tm[k].w);
}
@compute @workgroup_size(16, 16) fn h2(@builtin(global_invocation_id) id: vec3u) {
	let x = i32(id.x); let y = i32(id.y); if (x >= Q.w || y >= Q.h) { return; }
	let k = ri(x, y);
	var H = A[k].x; if (y > 0 && y < Q.h - 1 && x > 0 && x < Q.w - 1) { H = (Tm[ri(x, y - 1)].x + 2. * Tm[k].x + Tm[ri(x, y + 1)].x) * .25; }
	let o = oilp[si(x, y)]; if ((o & 31u) != 0u) { H -= f32(o & 31u) / ${OIL_G}. * min(1., Tm[k].w * 2.5); }
	var pb = 0.; for (var d = -9; d <= 9; d++) { pb += Tm[ri(x, y + d)].z; }
	A[k] = vec4f(A[k].x, H, 0., pb / 19.);
}
@compute @workgroup_size(16, 16) fn h3(@builtin(global_invocation_id) id: vec3u) {
	let x = i32(id.x); let y = i32(id.y); if (x >= Q.w || y >= Q.h) { return; }
	var s = 0.; for (var d = -4; d <= 4; d++) { let xx = x + d; if (xx >= 0 && xx < Q.w) { s += A[ri(xx, y)].y; } }
	let k = ri(x, y); Tm[k] = vec4f(Tm[k].x, s / 9., Tm[k].z, Tm[k].w);
}
@compute @workgroup_size(16, 16) fn h4(@builtin(global_invocation_id) id: vec3u) {
	let x = i32(id.x); let y = i32(id.y); if (x >= Q.w || y >= Q.h) { return; }
	var s = 0.; for (var d = -4; d <= 4; d++) { let yy = y + d; if (yy >= 0 && yy < Q.h) { s += Tm[ri(x, yy)].y; } }
	let k = ri(x, y); A[k] = vec4f(A[k].x, A[k].y, s / 9., A[k].w);
}
fn byteOf(v: f32) -> u32 { return u32(round(pow(clamp(v, 0., 1.), 1. / 2.2) * 255.)); }
@compute @workgroup_size(16, 16) fn shade(@builtin(global_invocation_id) id: vec3u) {
	let bx = i32(id.x); let by = i32(id.y); if (bx >= Q.bw || by >= Q.bh) { return; }
	let x = Q.bx0 - Q.x0 + bx; let y = Q.by0 - Q.y0 + by; let i = si(x, y); let D = sheet[i]; let a = D.w;
	var px = 0u;
	if (a > 0.) {
		let st = clamp(D.xyz / a, vec3f(0.), vec3f(1.));
		var rgb = vec3u(byteOf(st.x), byteOf(st.y), byteOf(st.z));
		let o = oilp[i];
		if (o != 0u) {
			let k = ri(x, y); let Ak = A[k];
			let kp = ri(min(x + 1, Q.w - 1), y); let km = ri(max(x - 1, 0), y); let kn = ri(x, max(y - 1, 0)); let ks = ri(x, min(y + 1, Q.h - 1));
			let kbp = ri(select(x, x + 3, x < Q.w - 3), y); let kbm = ri(select(x, x - 3, x > 2), y); let kbn = ri(x, select(y, y - 3, y > 2)); let kbs = ri(x, select(y, y + 3, y < Q.h - 3));
			let gx = (A[kp].y - A[km].y) * .5 + Q.bodyLight * (A[kbp].z - A[kbm].z) / 6.; let gy = (A[ks].y - A[kn].y) * .5 + Q.bodyLight * (A[kbs].z - A[kbn].z) / 6.;
			let Ld = normalize(vec3f(-.5, -.62, .6)); let Hh = normalize(Ld + vec3f(0., 0., 1.));
			let nl = 1. / sqrt(gx * gx + gy * gy + 1.); let n = vec3f(-gx * nl, -gy * nl, nl);
			let ndl = dot(n, Ld); let ndh = max(0., dot(n, Hh));
			let sh = clamp(1. + Q.diffuse * (ndl - Ld.z) / max(.2, 1. - Ld.z), .6, 1.06);
			let cav = clamp(1. - max(0., Ak.z - Ak.y) * .3 * Q.cavity, 1. - .28 * Q.cavity, 1.); let crest = clamp((Ak.y - Ak.z) * 1.6, 0., 1.) * clamp((Ak.w - .9) * 10., 0., 1.);
			let v = Tm[k].w; var gl = Q.glossOil; if (((volume[i] & 65535u) >> 7u) != 0u) { gl = Q.glossAcr; } gl *= clamp(v * 2., 0., 1.);
			let n2 = ndh * ndh; let n4 = n2 * n2; let n8 = n4 * n4; let spec = u32(round(255. * Q.spec * gl * (${OIL_LOOK.specRidge} * n8 * crest + ${OIL_LOOK.specSheen} * n8 * sqrt(crest))));
			let yp = max(0., dot(D.xyz + vec3f(1. - a), vec3f(.2126, .7152, .0722))); let m = 1. - (1. - sh * cav) * (1. - ${OIL_LOOK.lightKeep} * yp); var d = 1.; if (Q.vFull > 0.) { d = max(Q.vFloor, min(Q.vMax, pow(v / Q.vFull, Q.vGamma))); if (v > Q.vFull) { let cw0 = D.xyz + vec3f(1. - a); d = 1. + (d - 1.) * clamp((cw0.z - max(cw0.x, cw0.y)) * 3., 0., 1.); } }
			let col = D.xyz + vec3f(1. - a);
			var t = clamp(pow(max(col, vec3f(1e-6)), vec3f(d)) * m, vec3f(0.), vec3f(1.));
			if (a < 1.) { t = clamp(vec3f(1.) - (vec3f(1.) - t) / a, vec3f(0.), vec3f(1.)); }
			rgb = min(vec3u(255u), vec3u(byteOf(t.x), byteOf(t.y), byteOf(t.z)) + vec3u(spec));
		}
		px = rgb.x | (rgb.y << 8u) | (rgb.z << 16u) | (u32(round(clamp(a, 0., 1.) * 255.)) << 24u);
	}
	outp[u32(by * Q.bw + bx)] = px;
}
`;

export class OilGpuStroke extends OilPath {
	constructor(engine, o) { super(engine.host.record, o); this.engine = engine; this.rec = []; this.box = null; this.input = []; this.inputPoints = 0; this.inputSteps = 0; }
	add(points) {
		this.validate(points);
		if (this.ended) throw new Error('Paint stroke has ended');
		let previous = this.inputLast, cost = 0;
		for (const p of points) { cost += previous ? Math.max(1, Math.ceil(Math.hypot(p[0] - previous[0], p[1] - previous[1]) / 1.2)) : 1; previous = p; }
		if (this.inputPoints + points.length > 4096 || this.inputSteps + cost > 32768) throw new RangeError('Paint input queue is full');
		if (!points.length) return null;
		const copy = points.map(p => [p[0], p[1], p[2], p[3] ?? this.time]);
		this.input.push({points: copy, cost, work: this.addWork(copy)}); this.inputPoints += copy.length; this.inputSteps += cost;
		this.inputLast = copy.at(-1).slice();
		const e = this.cur.width + this.cur.hairR + 16, box = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
		for (const p of copy) { box.x0 = Math.min(box.x0, Math.floor(p[0] - e)); box.y0 = Math.min(box.y0, Math.floor(p[1] - e)); box.x1 = Math.max(box.x1, Math.ceil(p[0] + e)); box.y1 = Math.max(box.y1, Math.ceil(p[1] + e)); }
		return this._commit(box);
	}
	fill(limit) {
		while (this.rec.length < limit * 12 && this.input.length) {
			const head = this.input[0];
			if (head.work.next().done) { this.input.shift(); this.inputPoints -= head.points.length; this.inputSteps -= head.cost; }
		}
	}
	get pending() { return this.rec.length > 0 || this.input.length > 0; }
	_commit(box) {
		if (!(box.x1 >= box.x0 && box.y1 >= box.y0)) return null;
		this.engine.host.extendBox(box); return box;
	}
	_step(x, y, p, box) {
		const c = this.cur, L = OIL_LOOK; c.lastStep = [x, y]; this._cx = x; this._cy = y;
		const dl = Math.hypot(c.dirx, c.diry) || 1, nx = -c.diry / dl, ny = c.dirx / dl;
		this._curl(c.dirx / dl, c.diry / dl);
		if (c.follow) c.angle = Math.atan2(ny, nx);
		{ const sl = c.lastU ? Math.hypot(x - c.lastU[0], y - c.lastU[1]) : 0, a = c.ux === undefined ? 1 : Math.min(1, sl / (L.fineTurn * c.width));
		  const ux = (c.ux ?? nx) + (nx - (c.ux ?? nx)) * a, uy = (c.uy ?? ny) + (ny - (c.uy ?? ny)) * a, ul = Math.hypot(ux, uy) || 1; c.ux = ux / ul; c.uy = uy / ul; c.lastU = [x, y]; }
		this.rec.push(x, y, p, c.dirx / dl, c.diry / dl, c.travel, this._lift || 0, Math.atan2(c.uy, c.ux), c.angle, c.curl || 0, c.groups(p), this.time);
		const e = c.R0 * 2 + c.hairR + 8;
		box.x0 = Math.min(box.x0, Math.floor(x - e)); box.y0 = Math.min(box.y0, Math.floor(y - e)); box.x1 = Math.max(box.x1, Math.ceil(x + e)); box.y1 = Math.max(box.y1, Math.ceil(y + e));
	}
	end() { if (!this.ended) { this.input.push({points: [], cost: 0, work: this.endWork()}); this.ended = true; } }
	rebase(dx, dy) {
		if (!(dx || dy)) return;
		super.rebase(dx, dy);
		for (const batch of this.input) for (const p of batch.points) { p[0] += dx; p[1] += dy; }
		if (this.inputLast) { this.inputLast[0] += dx; this.inputLast[1] += dy; }
		for (let q = 0; q < this.rec.length; q += 12) { this.rec[q] += dx; this.rec[q + 1] += dy; }
		this.shift = [(this.shift?.[0] || 0) + dx, (this.shift?.[1] || 0) + dy];
	}
}

function buildOilPrograms(device, pipeline) {
	const wg = Math.min(256, device.limits.maxComputeInvocationsPerWorkgroup, device.limits.maxComputeWorkgroupSizeX);
	const mod = device.createShaderModule({label: 'Oil stroke', code: STROKE(wg)}), io = device.createShaderModule({label: 'Oil io', code: IO});
	const cmod = device.createShaderModule({label: 'Oil compose', code: COMPOSE}), lmod = device.createShaderModule({label: 'Oil light', code: LIGHT});
	const ub = {buffer: {type: 'uniform'}}, sb = {buffer: {type: 'storage'}}, rb = {buffer: {type: 'read-only-storage'}};
	const layout = kinds => device.createBindGroupLayout({entries: kinds.map((k, binding) => ({binding, visibility: GPUShaderStage.COMPUTE, ...k}))});
	const lStroke = layout([ub, ub, sb, sb, rb, sb, sb, rb, sb, sb]), lLoad = layout([ub, ub, sb, sb, sb, sb, sb, rb, sb, sb]), lCompose = layout([ub, ub, rb, rb, rb, sb, sb, sb, ub, rb]), lLight = layout([ub, rb, rb, rb, sb, sb, sb]);
	const pipe = (module, entryPoint, l) => pipeline({label: 'Oil ' + entryPoint, layout: device.createPipelineLayout({bindGroupLayouts: [l]}), compute: {module, entryPoint}});
	return {lStroke, lLoad, lCompose, lLight, pStroke: pipe(mod, 'stroke', lStroke), pLoad: pipe(io, 'load', lLoad), pCompose: pipe(cmod, 'compose', lCompose), pLight: ['h0', 'h1', 'h2', 'h3', 'h4', 'shade'].map(n => pipe(lmod, n, lLight))};
}
const oilReady = new WeakMap(), oilWarming = new WeakMap();
function oilPrograms(device) {
	let p = oilReady.get(device);
	if (!p) { p = buildOilPrograms(device, d => device.createComputePipeline(d)); oilReady.set(device, p); }
	return p;
}
export function warmOilPrograms(device) {
	if (oilReady.has(device)) return Promise.resolve(true);
	if (!oilWarming.has(device)) oilWarming.set(device, (async () => {
		const b = buildOilPrograms(device, d => device.createComputePipelineAsync(d));
		b.pStroke = await b.pStroke; b.pLoad = await b.pLoad; b.pCompose = await b.pCompose; b.pLight = await Promise.all(b.pLight);
		if (!oilReady.has(device)) oilReady.set(device, b);
		return true;
	})().catch(() => false));
	return oilWarming.get(device);
}
export function oilGpuFits(device, width, height) {
	const bytes = width * height * OIL_GPU_LAYER_BYTES, limits = device?.limits;
	return !!limits && bytes > 0 && bytes <= limits.maxStorageBufferBindingSize && bytes <= limits.maxBufferSize;
}
export function createOilEngine(host) {
	const device = host.device, S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
	const {lStroke, lLoad, lCompose, lLight, pStroke, pLoad, pCompose, pLight} = oilPrograms(device);
	const params = device.createBuffer({size: 144, usage: U}), pig = device.createBuffer({size: pigTable.byteLength, usage: U}), boxU = device.createBuffer({size: 32, usage: U}), fineU = device.createBuffer({size: 16, usage: U}), lightU = device.createBuffer({size: 112, usage: U});
	device.queue.writeBuffer(pig, 0, pigTable);
	const hairs = device.createBuffer({label: 'Oil hairs', size: 256 * HS * 4, usage: S}), steps = device.createBuffer({label: 'Oil steps', size: MAX_STEPS * 48, usage: S});
	let W = 0, H = 0, planes = null, groups = null, stroke = null, loaded = new Set(), pv = new Float32Array(36), scratch = null;
	const fit = () => {
		if (planes && W === host.width && H === host.height) return;
		if (!oilGpuFits(device, host.width, host.height)) throw new RangeError('Oil layer stack exceeds the GPU storage buffer limit.');
		const old = planes, ow = W, oh = H;
		W = host.width; H = host.height; const n = W * H;
		planes = {paint: device.createBuffer({label: 'Oil paint', size: n * 16, usage: S}), state: device.createBuffer({label: 'Oil state', size: n * 16, usage: S}),
			uv: device.createBuffer({label: 'Oil uv', size: n * 16, usage: S}), fields: device.createBuffer({label: 'Oil snapshot and fields', size: n * 32, usage: S}), expiry: device.createBuffer({label: 'Oil expiry', size: n * 12, usage: S}), layers: device.createBuffer({label: 'Oil layers', size: n * OIL_GPU_LAYER_BYTES, usage: S})};
		if (old && stroke && !stroke.ended && loaded.size) {
			const dx = stroke.shift?.[0] || 0, dy = stroke.shift?.[1] || 0, x0 = Math.max(0, -dx), y0 = Math.max(0, -dy), x1 = Math.min(ow, W - dx), y1 = Math.min(oh, H - dy);
			const enc = device.createCommandEncoder();
			if (x1 > x0) for (const key of Object.keys(old)) { const stride = key === 'layers' || key === 'fields' ? 32 : key === 'expiry' ? 12 : 16; for (let y = y0; y < y1; y++) enc.copyBufferToBuffer(old[key], (y * ow + x0) * stride, planes[key], ((y + dy) * W + x0 + dx) * stride, (x1 - x0) * stride); }
			device.queue.submit([enc.finish()]);
		}
		if (old) for (const b of Object.values(old)) b.destroy();
		groups = null; loaded = new Set();
	};
	const oilPlane = () => host.plane('packed', 4);
	const writeParams = (c, nsteps = 0) => {
		const M = c.M;
		const sh = stroke.shift || [0, 0];
		pv.set([W, H, c.hairs.length, nsteps, c.G || 1, Number.isFinite(M.wetLife) ? M.wetLife : -1, c.brush === 'flat' ? 1 : 0, sh[0],
			c.R0, c.width, c.thin, c.cap, c.hairR, OIL_CANVAS.contact, stroke.medium === 'acrylic' ? 1 : 0, M.pickup,
			M.plow, M.ridge, M.gloss, M.body, M.cover, M.wetMix, M.absorb, M.absorbMax, M.take, M.tipMax, OIL_LOOK.settleLen, OIL_LOOK.landPile, OIL_LOOK.ridgeFade, c.groove, OIL_LOOK.gateSpan, OIL_LOOK.swellLen,
			OIL_LOOK.swellHair, OIL_LOOK.depSwell, OIL_LOOK.fineTake, sh[1]]);
		stroke.shift = null;
		device.queue.writeBuffer(params, 0, pv);
	};
	const bindStroke = () => groups?.stroke || (groups = {...groups, stroke: device.createBindGroup({layout: lStroke, entries: [params, pig, planes.paint, planes.state, planes.fields, planes.expiry, hairs, steps, planes.uv, planes.layers].map((buffer, binding) => ({binding, resource: {buffer}}))})}).stroke;
	const load = (enc, box) => {
		const r = host.record, x0 = Math.max(0, box.x0) >> 6, y0 = Math.max(0, box.y0) >> 6, x1 = Math.min(W - 1, box.x1) >> 6, y1 = Math.min(H - 1, box.y1) >> 6, keys = [];
		for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const k = tx | ty << 16; if (!loaded.has(k)) { loaded.add(k); keys.push(k); } }
		if (!keys.length) return 0;
		const D = r.data, Oo = r.oil, VO = r.volume, tox = r.toothOX || 0, toy = r.toothOY || 0, data = new Float32Array(keys.length * TILE_WORDS), words = new Uint32Array(data.buffer), sourceLayers = r.oilLayers;
		const wholeX = Math.floor(tox), wholeY = Math.floor(toy), fracX = tox - wholeX, fracY = toy - wholeY;
		keys.forEach((k, t) => {
			const bx = (k & 65535) * 64, by = (k >>> 16) * 64, header = t * TILE_WORDS;
			words[header] = k & 65535; words[header + 1] = k >>> 16; words[header + 2] = wholeX; words[header + 3] = wholeY; data[header + 4] = fracX; data[header + 5] = fracY;
			for (let j = 0; j < 64; j++) for (let q = 0; q < 64; q++) {
				const x = bx + q, y = by + j; if (x >= W || y >= H) continue;
				const i = y * W + x, s = header + HEADER_WORDS + (j * 64 + q) * INPUT_WORDS, a = D[i * 4 + 3], o = Oo ? Oo[i] : 0, vb = VO ? VO[i] : 0, v = o ? Math.max(1, o >>> 5) / OIL_V : 0;
				data[s] = Math.min(1, Math.max(0, D[i * 4] + 1 - a)); data[s + 1] = Math.min(1, Math.max(0, D[i * 4 + 1] + 1 - a)); data[s + 2] = Math.min(1, Math.max(0, D[i * 4 + 2] + 1 - a)); data[s + 3] = v;
				data[s + 4] = o ? (vb & 127) / 127 * REL_SPAN + REL_LO : 0; data[s + 5] = o ? vb >> 7 : 0; data[s + 6] = vb; data[s + 7] = o ? 1 : 0;
				data[s + 8] = 0; data[s + 9] = 0; data[s + 10] = a; data[s + 11] = (o & 31) / OIL_G;
				if (sourceLayers?.[i * OIL_LAYER_STRIDE + 12]) for (let z = 0; z < OIL_LAYER_STRIDE / 2; z++) words[s + 12 + z] = sourceLayers[i * OIL_LAYER_STRIDE + z * 2] | sourceLayers[i * OIL_LAYER_STRIDE + z * 2 + 1] << 16;
				else if (a > 0) {
					const color = ch => Math.round(Math.min(1, Math.max(0, D[i * 4 + ch] / a)) * 65535);
					words[s + 12] = color(0) | color(1) << 16; words[s + 13] = color(2) | Math.min(65535, Math.round(v * OIL_LAYER_VOLUME)) << 16; words[s + 18] = Math.round(Math.min(1, Math.max(0, a)) * 65535);
				}
			}
		});
		const incoming = device.createBuffer({label: 'Oil tile upload', size: data.byteLength, usage: S});
		device.queue.writeBuffer(incoming, 0, data);
		const g = device.createBindGroup({layout: lLoad, entries: [params, boxU, planes.paint, planes.state, planes.uv, planes.fields, planes.expiry, incoming, oilPlane(), planes.layers].map((buffer, binding) => ({binding, resource: {buffer}}))});
		const pass = enc.beginComputePass(); pass.setPipeline(pLoad); pass.setBindGroup(0, g); pass.dispatchWorkgroups(keys.length); pass.end();
		(stroke.transient ||= []).push(incoming);
		return keys.length;
	};
	const compose = (enc, box) => {
		const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0), x1 = Math.min(W - 1, box.x1), y1 = Math.min(H - 1, box.y1);
		if (x1 < x0 || y1 < y0) return;
		const u = device.createBuffer({label: 'Oil compose box', size: 32, usage: U}); device.queue.writeBuffer(u, 0, new Uint32Array([x0, y0, x1 - x0 + 1, y1 - y0 + 1, W, 0, 0, 0]));
		device.queue.writeBuffer(fineU, 0, new Float32Array([OIL_LOOK.fine, OIL_LOOK.fineW, OIL_LOOK.fineLen, OIL_LOOK.fineSharp]));
		const g = device.createBindGroup({layout: lCompose, entries: [params, u, planes.paint, planes.state, planes.uv, host.sheet, host.volume, oilPlane(), fineU, planes.layers].map((buffer, binding) => ({binding, resource: {buffer}}))});
		const pass = enc.beginComputePass(); pass.setPipeline(pCompose); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil((x1 - x0 + 1) / 16), Math.ceil((y1 - y0 + 1) / 16)); pass.end();
		(stroke.transient ||= []).push(u);
		host.extendBox({x0, y0, x1, y1});
		stroke.box = stroke.box ? {x0: Math.min(stroke.box.x0, x0), y0: Math.min(stroke.box.y0, y0), x1: Math.max(stroke.box.x1, x1), y1: Math.max(stroke.box.y1, y1)} : {x0, y0, x1, y1};
	};
	const drain = async s => {
		const transient = s.transient || []; s.transient = [];
		try { await device.queue.onSubmittedWorkDone(); }
		finally { for (const b of transient) b.destroy(); }
	};
	const engine = {
		host, pace: 48, profile: false,
		get active() { return !!stroke; },
		begin() {},
		start(o) {
			if (stroke) throw new Error('Settle the current paint stroke before starting another');
			const next = new OilGpuStroke(engine, o);
			fit(); loaded = new Set();
			const r = host.record; r.volume ||= new Uint8Array(r.width * r.height);
			const reset = device.createCommandEncoder(); reset.clearBuffer(planes.state); device.queue.submit([reset.finish()]);
			const s = stroke = next; s.stats = {steps: 0, parts: 0};
			const c = s.cur, n = c.hairs.length, hd = new Float32Array(n * HS);
			c.hairs.forEach((hr, i) => { const b = i * HS;
				hd[b + O.ox] = hr.ox; hd[b + O.oy] = hr.oy; hd[b + O.g] = hr.g; hd[b + O.L] = hr.L; hd.set(hr.res, b + O.res); hd.set(hr.res0, b + O.res0); hd.set(hr.abs, b + O.abs);
				hd[b + O.as] = hr.as; hd.set(hr.col, b + O.col); hd.set(hr.pick, b + O.pick); hd[b + O.pk] = hr.pk; hd[b + O.bump] = hr.bump; hd[b + O.aff] = hr.aff; hd[b + O.cseed] = hr.cseed;
				hd[b + O.land] = hr.land; hd[b + O.gate] = hr.gate; hd[b + O.hseed] = hr.hseed; hd[b + HC.key] = -1; });
			c.G = c.groups(0);
			device.queue.writeBuffer(hairs, 0, hd);
			return s;
		},
		async submit({wait = true, all = false} = {}) {
			const s = stroke, profiling = engine.profile;
			const profile = profiling ? {ms: 0, wallMs: 0, prepareMs: 0, tileLoadMs: 0, queueDrainMs: 0, loadedTiles: 0, dispatchedSteps: 0, parts: 0, queuedBefore: (s?.rec.length || 0) / 12, inputPointsBefore: s?.inputPoints || 0, inputStepsBefore: s?.inputSteps || 0, queuedAfter: 0} : null;
			if (!s || !s.pending) {
				let ms = 0;
				if (wait && s?.transient?.length) { const t = performance.now(); await drain(s); ms = performance.now() - t; }
				if (profile) { profile.ms = profile.wallMs = profile.queueDrainMs = ms; engine.lastSubmit = profile; }
				return {ms};
			}
			const fitAt = profiling ? performance.now() : 0;
			fit();
			if (profile) profile.prepareMs = performance.now() - fitAt;
			const per = 12, t0 = performance.now();
			while (s.pending) {
				const prepareAt = profiling ? performance.now() : 0;
				s.fill(all || s.ended ? 96 : engine.pace);
				if (!s.rec.length) break;
				const n = Math.min(all || s.ended ? 96 : engine.pace, s.rec.length / per, MAX_STEPS), part = s.rec.splice(0, n * per), c = s.cur;
				const e = c.R0 * 2 + c.hairR + 16, box = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
				let pmin = 1;
				for (let q = 0; q < part.length; q += per) { box.x0 = Math.min(box.x0, part[q] - e); box.y0 = Math.min(box.y0, part[q + 1] - e); box.x1 = Math.max(box.x1, part[q] + e); box.y1 = Math.max(box.y1, part[q + 1] + e); pmin = Math.min(pmin, part[q + 2]); }
				box.x0 = Math.floor(box.x0); box.y0 = Math.floor(box.y0); box.x1 = Math.ceil(box.x1); box.y1 = Math.ceil(box.y1);
				c.G = c.groups(pmin);
				host.flush?.();
				const enc = device.createCommandEncoder();
				const loadAt = profiling ? performance.now() : 0;
				const tiles = load(enc, {x0: box.x0 - 16, y0: box.y0 - 16, x1: box.x1 + 16, y1: box.y1 + 16});
				if (profile) { profile.tileLoadMs += performance.now() - loadAt; profile.loadedTiles += tiles; }
				device.queue.writeBuffer(steps, 0, new Float32Array(part)); writeParams(c, n);
				const pass = enc.beginComputePass(); pass.setPipeline(pStroke); pass.setBindGroup(0, bindStroke()); pass.dispatchWorkgroups(1); pass.end();
				compose(enc, box);
				device.queue.submit([enc.finish()]);
				s.stats.steps += n; s.stats.parts++;
				if (profile) { profile.prepareMs += performance.now() - prepareAt; profile.dispatchedSteps += n; profile.parts++; }
				if (!(all || s.ended)) break;
				const drainAt = profiling ? performance.now() : 0;
				await drain(s);
				if (profile) profile.queueDrainMs += performance.now() - drainAt;
			}
			if (wait) { const drainAt = profiling ? performance.now() : 0; await drain(s); if (profile) profile.queueDrainMs += performance.now() - drainAt; }
			const ms = performance.now() - t0;
			if (profile) { profile.ms = ms; profile.wallMs = performance.now() - fitAt; profile.queuedAfter = s.rec.length / per; profile.inputPointsAfter = s.inputPoints; profile.inputStepsAfter = s.inputSteps; engine.lastSubmit = profile; }
			if (!s.ended) engine.pace = ms > 40 ? Math.max(4, Math.floor(engine.pace * .7)) : ms < 15 ? Math.min(96, engine.pace + 8) : engine.pace;
			return {ms};
		},
		async commit() {
			const s = stroke; if (!s) return null;
			await engine.submit({all: true});
			const mine = loaded;
			if (s.ended) stroke = null;
			for (const b of s.transient || []) b.destroy(); s.transient = [];
			const box = s.box; s.box = null; if (!box) return null;
			const r = host.record, w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, bpr = Math.ceil(w * 4 / 256) * 256;
			const layerRow = w * OIL_GPU_LAYER_BYTES, expiryRow = w * 12;
			const rows = Math.max(1, Math.floor(Math.min(32 * 1024 * 1024, device.limits.maxBufferSize) / (bpr + layerRow + expiryRow)));
			for (let y0 = 0; y0 < h; y0 += rows) {
				const count = Math.min(rows, h - y0), layerBase = bpr * count, expiryBase = layerBase + layerRow * count;
				const read = device.createBuffer({size: expiryBase + expiryRow * count, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
				let mapped = false;
				try {
					const enc = device.createCommandEncoder();
					for (let y = 0; y < count; y++) {
						const source = (box.y0 + y0 + y) * W + box.x0;
						enc.copyBufferToBuffer(oilPlane(), source * 4, read, y * bpr, w * 4);
						enc.copyBufferToBuffer(planes.layers, source * OIL_GPU_LAYER_BYTES, read, layerBase + y * layerRow, layerRow);
						enc.copyBufferToBuffer(planes.expiry, source * 12, read, expiryBase + y * expiryRow, expiryRow);
					}
					device.queue.submit([enc.finish()]);
					await read.mapAsync(GPUMapMode.READ); mapped = true;
					const data = read.getMappedRange(), src = new Uint32Array(data, 0, layerBase / 4), layerSrc = new Uint16Array(data, layerBase, layerRow * count / 2), expirySrc = new Uint16Array(data, expiryBase);
					r._keepStrokePixels?.(box.x0, box.y0 + y0, box.x1, box.y0 + y0 + count - 1);
					const Oo = r.oil || (r.oil = new Uint16Array(r.width * r.height)), Ls = r.oilLayers || (r.oilLayers = new Uint16Array(r.width * r.height * OIL_LAYER_STRIDE));
					for (let y = 0; y < count; y++) { const Y = box.y0 + y0 + y; for (let x = 0; x < w; x++) { const X = box.x0 + x; if (mine.has((X >> 6) | (Y >> 6) << 16)) {
						const i = Y * r.width + X, q = y * w + x, k = q * 16, target = i * OIL_LAYER_STRIDE;
						if (!(layerSrc[k + 15] & 1)) continue;
						Oo[i] = src[y * (bpr >> 2) + x]; Ls.set(layerSrc.subarray(k, k + 16), target); Ls[target + 15] = 0;
						Ls.set(expirySrc.subarray(q * 6, q * 6 + 6), target + 16);
					} } }
				} finally {
					try { if (mapped) read.unmap(); } finally { read.destroy(); }
				}
			}
			return box;
		},
		cancel() { const s = stroke; stroke = null; for (const b of s?.transient || []) b.destroy(); },
		get displays() { return !!stroke; },
		async display(box) {
			const profiling = engine.profile, started = profiling ? performance.now() : 0;
			fit();
			const P = 14, x0 = Math.max(0, box.x0 - P), y0 = Math.max(0, box.y0 - P), x1 = Math.min(W - 1, box.x1 + P), y1 = Math.min(H - 1, box.y1 + P);
			const w = x1 - x0 + 1, h = y1 - y0 + 1, bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1, n = w * h, r = host.record;
			if (!scratch || scratch.n < n) { scratch?.A.destroy(); scratch?.T.destroy(); scratch = {n: Math.max(n, 1 << 16), A: device.createBuffer({size: Math.max(n, 1 << 16) * 16, usage: S}), T: device.createBuffer({size: Math.max(n, 1 << 16) * 16, usage: S})}; }
			const out = device.createBuffer({size: bw * bh * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC}), read = device.createBuffer({size: bw * bh * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
			const L = OIL_LOOK, lb = new ArrayBuffer(112), li = new Int32Array(lb), lf = new Float32Array(lb), tox = r.toothOX || 0, toy = r.toothOY || 0;
			const wholeX = Math.floor(tox), wholeY = Math.floor(toy);
			li.set([x0, y0, w, h, W, H, box.x0, box.y0, bw, bh, wholeX, wholeY]);
			lf.set([OIL_CANVAS.relief, L.volumeLight, L.bodyLight, L.vFull, L.vGamma, L.vMax, L.diffuse, L.spec, L.cavity, OIL_MEDIA.oil.gloss, OIL_MEDIA.acrylic.gloss, L.vFloor ?? 0], 12);
			lf.set([tox - wholeX, toy - wholeY], 24);
			device.queue.writeBuffer(lightU, 0, lb);
			const g = device.createBindGroup({layout: lLight, entries: [lightU, host.sheet, host.volume, oilPlane(), scratch.A, scratch.T, out].map((buffer, binding) => ({binding, resource: {buffer}}))});
			const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
			for (let k = 0; k < 5; k++) { pass.setPipeline(pLight[k]); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(w / 16), Math.ceil(h / 16)); }
			pass.setPipeline(pLight[5]); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(bw / 16), Math.ceil(bh / 16)); pass.end();
			enc.copyBufferToBuffer(out, 0, read, 0, bw * bh * 4); device.queue.submit([enc.finish()]);
			const readAt = profiling ? performance.now() : 0;
			try { await read.mapAsync(GPUMapMode.READ); } catch (_) { out.destroy(); read.destroy(); return null; }
			const data = new Uint8ClampedArray(read.getMappedRange().slice(0)); read.unmap(); read.destroy(); out.destroy();
			if (profiling) engine.lastDisplay = {wallMs: performance.now() - started, prepareMs: readAt - started, readbackMs: performance.now() - readAt, pixels: bw * bh};
			return {width: bw, height: bh, data};
		},
		destroy() { engine.cancel(); for (const b of [params, pig, boxU, fineU, lightU, hairs, steps, ...(planes ? Object.values(planes) : []), ...(scratch ? [scratch.A, scratch.T] : [])]) b.destroy(); },
	};
	return engine;
}

registerPaintEngine('oil', createOilEngine, {warm: device => warmOilPrograms(device)});
OIL_GPU.registered = true;
OIL_GPU.fits = oilGpuFits;
