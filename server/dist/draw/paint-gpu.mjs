// SPDX-License-Identifier: AGPL-3.0-only
import {PAINT_PRIMARY, PAINT_DISPLAY} from './paint-pigment-data.mjs';
import {PAPER_OCTAVES} from './grain.mjs';
import {RAPIER_LIGHT, RAPIER_RELIEF, RAPIER_GLOSS} from './paint.mjs';
import {PAINT_MIX_WGSL} from './paint-mix.mjs';

const BANDS = PAINT_PRIMARY.length;
const DAB_STRIDE = 256, DAB_WORDS = 64, MAX_BATCH = 4096;
const BUCKETS = 256, BUCKET = 9, BUCKET_WORDS = BUCKETS * BUCKET, RESOLVED = 8;
const TOOTH_GRAIN = 2.5, TOOTH_CONTRAST = 2.2; // paint.mjs RAPIER_TOOTH_GRAIN, RAPIER_TOOTH_CONTRAST
const TOOTH_TILE = 64, RUN_MAX = 256, RUN_STRIDE = 256, MAX_RUNS = 2048;
const HOLD_N = 16, HOLD_CELLS = HOLD_N * HOLD_N, HOLD_AT = BUCKET_WORDS + MAX_BATCH * RESOLVED, HOLD_WORDS = HOLD_CELLS * 5;
const STATE_BYTES = (HOLD_AT + HOLD_WORDS) * 4;
export const DAB = Object.freeze({COLOUR: 1, RESAMPLE: 2, LEGACY: 4, MOVER: 8, SMUDGE_ONLY: 16, LINEAR: 32, HSV: 64, HSL: 128, UPDATE: 256, SMUDGE: 512, BODY: 1024, REF: 2048, NO_STAMP: 4096, HOLD_STEP: 8192, HOLD_COLOUR: 16384, OP: 32768});
export const GPU_OPS = Object.freeze({erase: 1, dissolve: 2, erode: 3, smear: 4, blend: 5, posterize: 6});
const PALETTE_SLOTS = 65536;
const BLEND_VEC = 14;

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export function paintSoftwareAdapter(adapter) {
	const i = adapter?.info ?? {};
	if (i.isFallbackAdapter === true || adapter?.isFallbackAdapter === true) return true;
	return /swiftshader|llvmpipe|lavapipe|softpipe|microsoft basic render|\bwarp\b/i.test([i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' '));
}

const failure = (code, message) => Object.assign(new Error(message), {code});
export async function openPaintDevice({gpu = globalThis.navigator?.gpu, software = globalThis.__rapierPaintSoftwareTest === true, timeoutMs = 2000} = {}) {
	if (!gpu) throw failure('paint_gpu_unavailable', 'No WebGPU.');
	const start = async () => {
		let adapter = null;
		for (let i = 0; i < 4 && !adapter; i++) { adapter = await gpu.requestAdapter({powerPreference: 'high-performance'}); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
		if (!adapter) throw failure('paint_gpu_unavailable', 'No WebGPU adapter.');
		const isSoftware = paintSoftwareAdapter(adapter);
		if (isSoftware && !software) throw failure('paint_gpu_unavailable', 'Only a software adapter.');
		const cap = 1 << 30, L = adapter.limits;
		const requiredLimits = {maxStorageBufferBindingSize: Math.min(cap, L.maxStorageBufferBindingSize), maxBufferSize: Math.min(cap, L.maxBufferSize)};
		const requiredFeatures = ['timestamp-query'].filter(f => adapter.features.has(f));
		const device = await adapter.requestDevice({requiredLimits, requiredFeatures});
		device.paintSoftware = isSoftware;
		device.paintAdapter = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.description].filter(Boolean).join(' ');
		return device;
	};
	let timer;
	try { return await Promise.race([start(), new Promise((_, reject) => { timer = setTimeout(() => reject(failure('paint_gpu_unavailable', 'WebGPU did not start in time.')), timeoutMs); })]); }
	finally { clearTimeout(timer); }
}

const PIGMENT_FNS = PAINT_MIX_WGSL + `fn lum(c: vec3f) -> f32 { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
fn reflOf(k: f32) -> f32 { let q = max(0.0, k); return 1.0 / (1.0 + q + sqrt(q * q + 2.0 * q)); }
// The six-primary reflectance construction of paintPigmentCell, one band at a time.
struct Basis { white: f32, w0: vec4f, w1: vec2f };
fn basisOf(c: vec3f) -> Basis {
	let v = clamp(c, vec3f(0.0), vec3f(1.0));
	let white = min(v.r, min(v.g, v.b));
	let r = v.r - white; let g = v.g - white; let b = v.b - white;
	return Basis(white, vec4f(min(g, b), min(r, b), min(r, g), max(0.0, min(r - g, r - b))), vec2f(max(0.0, min(g - r, g - b)), max(0.0, min(b - r, b - g))));
}
// A band's K/S and the reflectance it came from (reflOf(K/S) gives that reflectance back, so callers keep it).
fn ksRefl(s: Basis, i: u32) -> vec2f {
	let p0 = tables[i * 3u]; let p1 = tables[i * 3u + 1u];
	let refl = max(0.0001, s.white + dot(s.w0, p0) + dot(s.w1, p1.xy));
	return vec2f((1.0 - refl) * (1.0 - refl) / (2.0 * refl), refl);
}
fn ksBand(s: Basis, i: u32) -> f32 { return ksRefl(s, i).x; }
fn display(i: u32) -> vec3f { return tables[i * 3u + 2u].xyz; }
// K/S by pigment mass, weighted by each colour's luminance (mixPreparedPaintPigment), in float, no grid.
fn mixPigment(a: vec3f, b: vec3f, tIn: f32) -> vec3f {
	let t = clamp(tIn, 0.0, 1.0);
	if (t == 0.0 || abs(a.r - b.r) + abs(a.g - b.g) + abs(a.b - b.b) < 1e-7) { return a; }
	if (t == 1.0) { return b; }
	let ya = max(0.0001, lum(a)); let yb = max(0.0001, lum(b));
	let conc = yb * t / (ya * (1.0 - t) + yb * t); let u = 1.0 - conc;
	let sa = basisOf(a); let sb = basisOf(b);
	var da = vec3f(0.0); var db = vec3f(0.0); var dm = vec3f(0.0);
	for (var i = 0u; i < BANDS; i++) {
		let ka = ksRefl(sa, i); let kb = ksRefl(sb, i); let d = display(i);
		da += ka.y * d; db += kb.y * d; dm += reflOf(ka.x * u + kb.x * conc) * d;
	}
	// CM1's one mixer: K-M's answer rescued toward the painter's wheel where K-M dulled it, the wheel states mixed by the
	// same share (paint-mix.mjs; the CPU's paint-pigment.mjs does the same).
	// The wheel states mix by mass (t), K-M by its luminance share (paint-pigment.mjs mixPreparedPaintPigment).
	let km = clamp(dm + (a - da) * u + (b - db) * conc, vec3f(0.0), vec3f(1.0));
	// as the CPU (paint-pigment.mjs): when K-M keeps 90% of the paints' chroma there is nothing to rescue (exact; it keeps
	// Halftone within its T4 budget)
	if (length(mixOklab(km).yz) >= ${(0.9 * 1.002).toFixed(6)} * max(length(mixOklab(a).yz), length(mixOklab(b).yz))) { return km; }
	return mixRescue(km, mixAdd(mixState(a), mixState(b), t));
}
`;
export function paintPigmentWGSL({group = 0, binding = 0} = {}) {
	return `@group(${group}) @binding(${binding}) var<uniform> tables: array<vec4f, ${BANDS * 3}>;\nconst BANDS = ${BANDS}u;\n` + PIGMENT_FNS;
}
export function paintPigmentTables(device) { return programsFor(device).tables; }
const engines = new Map(), engineWarm = new Map();
export function registerPaintEngine(name, factory, {warm} = {}) { engines.set(name, factory); if (warm) engineWarm.set(name, warm); }
export function warmPaintEngines(device, record) {
	return Promise.all([...engineWarm.values()].map(warm => Promise.resolve().then(() => warm(device, record)).catch(() => false)));
}
const WGSL = `
struct Dab {
	flags: u32, index: u32, bucket: u32, posterizeNum: f32,
	x0: i32, y0: i32, w: u32, h: u32,
	x: f32, y: f32, radius: f32, aspect: f32,
	cs: f32, sn: f32, hardness: f32, softness: f32,
	opaque: f32, r: f32, g: f32, b: f32,
	alpha: f32, lockAlpha: f32, colorize: f32, posterize: f32,
	paint: f32, bite: f32, body: f32, smudge: f32,
	update: f32, lim: f32, erase: f32, chH: f32,
	chS: f32, chV: f32, chL: f32, chHslS: f32,
	px: f32, py: f32, pr: f32, samplePaint: f32,
	px0: i32, py0: i32, pw: u32, ph: u32,
	refIndex: u32, tr: f32, tg: f32, tb: f32,
	holdVel: f32, col0: u32, col1: u32, op: u32,
	o0: f32, o1: f32, o2: f32, o3: f32, o4: f32, o5: f32, o6: f32, o7: f32,
	u0: i32, u1: i32, u2: u32, u3: u32,
};
struct Info { width: u32, height: u32, toothW: u32, pad: u32 };
@group(0) @binding(0) var<storage, read_write> sheet: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> state: array<f32>;
@group(0) @binding(2) var<storage, read> tooth: array<u32>;
@group(0) @binding(3) var<storage, read_write> volume: array<u32>;
@group(0) @binding(4) var<uniform> dab: Dab;
@group(0) @binding(5) var<uniform> info: Info;
@group(0) @binding(6) var<uniform> tables: array<vec4f, ${BANDS * 3}>;
@group(0) @binding(7) var<storage, read_write> scratch: array<vec4f>;
struct Run { count: u32, x0: i32, y0: i32, w: u32, h: u32, a: u32, b: u32, c: u32 };
@group(0) @binding(8) var<uniform> dabs: array<Dab, ${RUN_MAX}>;
@group(0) @binding(9) var<uniform> run: Run;

const BANDS = ${BANDS}u;
const F_COLOUR = 1u; const F_RESAMPLE = 2u; const F_LEGACY = 4u; const F_MOVER = 8u; const F_SMUDGE_ONLY = 16u;
const F_LINEAR = 32u; const F_HSV = 64u; const F_HSL = 128u; const F_UPDATE = 256u; const F_SMUDGE = 512u; const F_BODY = 1024u; const F_REF = 2048u; const F_NO_STAMP = 4096u; const F_HOLD_STEP = 8192u; const F_HOLD_COLOUR = 16384u;
const HOLD_AT = ${HOLD_AT}u; const HOLD_N = ${HOLD_N}u; const HOLD_CELLS = ${HOLD_CELLS}u;
const BUCKET_WORDS = ${BUCKET_WORDS}u;
const RESOLVED = ${RESOLVED}u;

${PIGMENT_FNS}
// mixColors: alpha weights pigment mass; transparent canvas contributes no colour.
fn mixColors(a: vec4f, b: vec4f, fac: f32, paintMode: f32) -> vec4f {
	let massA = fac * a.a; let massB = (1.0 - fac) * b.a; let mass = massA + massB;
	var t = 0.0; if (mass > 0.0) { t = massB / mass; }
	let linear = a.rgb * (1.0 - t) + b.rgb * t;
	var rgb = linear;
	if (paintMode > 0.0) { rgb = mixPigment(a.rgb, b.rgb, t) * paintMode + linear * (1.0 - paintMode); }
	return vec4f(rgb, clamp(mass, 0.0, 1.0));
}

// render_dab_mask, both branches, as paint.mjs _renderMask writes it.
fn dabMask(xp: i32, yp: i32, x: f32, y: f32, radius: f32, hardness: f32, softness: f32, aspect: f32, cs: f32, sn: f32) -> f32 {
	let seg1Offset = 1.0 - softness;
	let oneOverR2 = 1.0 / (radius * radius);
	var rr: f32;
	if (radius < 3.0) {
		var rAaStart = 0.0; if (radius > 1.0) { rAaStart = radius - 1.0; }
		rAaStart = rAaStart * rAaStart / aspect;
		let radArea1 = sqrt(1.0 / 3.14159265358979);
		let pixelRight = x - f32(xp); let pixelBottom = y - f32(yp);
		let pcx = pixelRight - 0.5; let pcy = pixelBottom - 0.5; let pixelLeft = pixelRight - 1.0; let pixelTop = pixelBottom - 1.0;
		var nearestX = 0.0; var nearestY = 0.0; var rrNear = 0.0;
		if (!(pixelLeft < 0.0 && pixelRight > 0.0 && pixelTop < 0.0 && pixelBottom > 0.0)) {
			let t = (pcx * cs + pcy * sn) / (cs * cs + sn * sn);
			nearestX = clamp(t * cs, pixelLeft, pixelRight); nearestY = clamp(t * sn, pixelTop, pixelBottom);
			let yyr = (nearestY * cs - nearestX * sn) * aspect; let xxr = nearestY * sn + nearestX * cs;
			rrNear = (yyr * yyr + xxr * xxr) * oneOverR2;
		}
		if (rrNear > 1.0) { rr = rrNear; }
		else {
			let centerSign = (pcx - cs) * sn - cs * (pcy + sn);
			var farX: f32; var farY: f32;
			if (centerSign < 0.0) { farX = nearestX - sn * radArea1; farY = nearestY + cs * radArea1; }
			else { farX = nearestX + sn * radArea1; farY = nearestY - cs * radArea1; }
			let yyr = (farY * cs - farX * sn) * aspect; let xxr = farY * sn + farX * cs; let rFar = yyr * yyr + xxr * xxr; let rrFar = rFar * oneOverR2;
			if (rFar < rAaStart) { rr = (rrFar + rrNear) * 0.5; }
			else { let delta = rrFar - rrNear; rr = 1.0 - (1.0 - rrNear) / (1.0 + delta); }
		}
	} else {
		let yy = f32(yp) + 0.5 - y; let xx = f32(xp) + 0.5 - x;
		let yyr = (yy * cs - xx * sn) * aspect; let xxr = yy * sn + xx * cs;
		rr = (yyr * yyr + xxr * xxr) * oneOverR2;
	}
	if (rr > 1.0) { return 0.0; }
	var opa: f32;
	if (rr <= hardness) { opa = seg1Offset - (1.0 / hardness - 1.0) * (1.0 - softness) * rr; }
	else { opa = hardness / (1.0 - hardness) * (1.0 - softness) - hardness / (1.0 - hardness) * (1.0 - softness) * rr; }
	if (opa < 1.0 / 32768.0) { return 0.0; }
	return opa;
}

fn toothAt(x: u32, y: u32) -> f32 {
	let T = ${TOOTH_TILE}u;
	let tile = (y / T) * info.toothW + (x / T);
	let k = (y % T) * T + (x % T);
	let word = tooth[tile * (T * T / 4u) + k / 4u];
	return f32((word >> ((k % 4u) * 8u)) & 255u);
}
// Paint stands off the sheet (paint.mjs _lay), one byte a pixel.
fn lay(d: Dab, i: u32, a: f32, o: f32) {
	let was = f32(volume[i]);
	let topExact = o * d.body * 255.0;
	if (was >= topExact) { return; }
	let v = was + a * d.body * 46.0;
	volume[i] = u32(floor(min(v, topExact)));
}

fn rgbToHsv(c0: vec3f) -> vec3f {
	let c = clamp(c0, vec3f(0.0), vec3f(1.0));
	let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b)); let delta = mx - mn;
	var h = 0.0; var s = 0.0;
	if (delta > 0.0001) {
		s = delta / mx;
		if (c.r == mx) { h = (c.g - c.b) / delta; if (h < 0.0) { h += 6.0; } }
		else if (c.g == mx) { h = 2.0 + (c.b - c.r) / delta; }
		else { h = 4.0 + (c.r - c.g) / delta; }
		h /= 6.0;
	}
	return vec3f(h, s, mx);
}
fn hsvToRgb(h0: f32, s0: f32, v0: f32) -> vec3f {
	let h = h0 - floor(h0); let s = clamp(s0, 0.0, 1.0); let v = clamp(v0, 0.0, 1.0);
	if (s == 0.0) { return vec3f(v); }
	var hue = h; if (h == 1.0) { hue = 0.0; } hue *= 6.0;
	let i = i32(trunc(hue)); let f = hue - f32(i); let w = v * (1.0 - s); let q = v * (1.0 - s * f); let t = v * (1.0 - s * (1.0 - f));
	switch (i) {
		case 0: { return vec3f(v, t, w); }
		case 1: { return vec3f(q, v, w); }
		case 2: { return vec3f(w, v, t); }
		case 3: { return vec3f(w, q, v); }
		case 4: { return vec3f(t, w, v); }
		default: { return vec3f(v, w, q); }
	}
}
fn rgbToHsl(c0: vec3f) -> vec3f {
	let c = clamp(c0, vec3f(0.0), vec3f(1.0));
	let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b)); let l = (mx + mn) / 2.0;
	var h = 0.0; var s = 0.0;
	if (mx != mn) {
		if (l <= 0.5) { s = (mx - mn) / (mx + mn); } else { s = (mx - mn) / (2.0 - mx - mn); }
		var delta = mx - mn; if (delta == 0.0) { delta = 1.0; }
		if (c.r == mx) { h = (c.g - c.b) / delta; } else if (c.g == mx) { h = 2.0 + (c.b - c.r) / delta; } else { h = 4.0 + (c.r - c.g) / delta; }
		h /= 6.0; if (h < 0.0) { h += 1.0; }
	}
	return vec3f(h, s, l);
}
fn hslValue(n1: f32, n2: f32, hue0: f32) -> f32 {
	var hue = hue0; if (hue > 6.0) { hue -= 6.0; } else if (hue < 0.0) { hue += 6.0; }
	if (hue < 1.0) { return n1 + (n2 - n1) * hue; }
	if (hue < 3.0) { return n2; }
	if (hue < 4.0) { return n1 + (n2 - n1) * (4.0 - hue); }
	return n1;
}
fn hslToRgb(h0: f32, s0: f32, l0: f32) -> vec3f {
	let h = h0 - floor(h0); let s = clamp(s0, 0.0, 1.0); let l = clamp(l0, 0.0, 1.0);
	if (s == 0.0) { return vec3f(l); }
	var m2: f32; if (l <= 0.5) { m2 = l * (1.0 + s); } else { m2 = l + s - l * s; }
	let m1 = 2.0 * l - m2;
	return vec3f(hslValue(m1, m2, h * 6.0 + 2.0), hslValue(m1, m2, h * 6.0), hslValue(m1, m2, h * 6.0 - 2.0));
}

// ---- pickup: the probe disk under a dab, then the dab's colour (one workgroup) --------------------
var<workgroup> wgSum: array<f32, 256>;
fn reduce(local: u32, v: f32) -> f32 {
	wgSum[local] = v;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s >>= 1u) {
		if (local < s) { wgSum[local] += wgSum[local + s]; }
		workgroupBarrier();
	}
	let out = wgSum[0];
	workgroupBarrier();
	return out;
}
// Four sums in one tree (each lane adds in the same order as reduce, so the totals are the same bits).
var<workgroup> wgSum4: array<vec4f, 256>;
fn reduce4(local: u32, v: vec4f) -> vec4f {
	wgSum4[local] = v;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s >>= 1u) {
		if (local < s) { wgSum4[local] += wgSum4[local + s]; }
		workgroupBarrier();
	}
	let out = wgSum4[0];
	workgroupBarrier();
	return out;
}
const BAND_WORDS = ${Math.ceil((BANDS + 1) / 4)}u;
// The band sums four at a time; the lane after the last band carries extra.
fn reduceBands(local: u32, ks: ptr<function, array<f32, BANDS>>, extra: f32) -> array<vec4f, BAND_WORDS> {
	var out: array<vec4f, BAND_WORDS>;
	for (var w = 0u; w < BAND_WORDS; w++) {
		var v = vec4f(0.0);
		for (var l = 0u; l < 4u; l++) { let b = w * 4u + l; if (b < BANDS) { v[l] = (*ks)[b]; } else if (b == BANDS) { v[l] = extra; } }
		out[w] = reduce4(local, v);
	}
	return out;
}
fn bandOf(t: ptr<function, array<vec4f, BAND_WORDS>>, b: u32) -> f32 { return (*t)[b / 4u][b % 4u]; }
fn pickupFor(d: Dab, local: u32) {
	let B = d.bucket * 9u;
	var sample = vec4f(0.0, 1.0, 0.0, 0.0);
	var skip = false;
	if ((d.flags & F_RESAMPLE) != 0u) {
		var sumW = 0.0; var sumA = 0.0; var lin = vec3f(0.0); var res = vec3f(0.0); var wy = 0.0;
		var ks: array<f32, ${BANDS}>; var z = MixState(vec4f(0.0), vec4f(0.0));
		for (var i = 0u; i < BANDS; i++) { ks[i] = 0.0; }
		// A large probe is read on an even grid of at most about 2,048 points (every pixel of a small one); the CPU reads a
		// random one in 7 radii, so this is both cheaper per point and steadier.
		let step = max(1u, u32(ceil(sqrt(f32(d.pw * d.ph) / 2048.0))));
		let gw = (d.pw + step - 1u) / step; let n = gw * ((d.ph + step - 1u) / step);
		let legacy = d.samplePaint < 0.0;
		for (var k = local; k < n; k += 256u) {
			let xp = d.px0 + i32((k % gw) * step); let yp = d.py0 + i32((k / gw) * step);
			let o = dabMask(xp, yp, d.px, d.py, d.pr, 0.5, 0.5, 1.0, 1.0, 0.0);
			if (o == 0.0) { continue; }
			let D = sheet[u32(yp) * info.width + u32(xp)];
			sumW += o;
			if (legacy) { lin += o * D.rgb; sumA += o * D.a; continue; }
			let mass = o * D.a;
			if (!(mass > 0.0)) { continue; }
			let c = D.rgb / D.a;
			sumA += mass; lin += mass * c;
			if (d.samplePaint > 0.0) {
				let y = max(0.0001, lum(c)); let m = mass * y; let s = basisOf(c);
				var dec = vec3f(0.0);
				for (var i = 0u; i < BANDS; i++) { let kb = ksRefl(s, i); ks[i] += m * kb.x; dec += kb.y * display(i); }
				res += m * (c - dec); wy += m;
				// The wheel numbers by mass (the K/S bands by mass times luminance), as the CPU's pigment state carries them.
				let zc = mixState(c); z = MixState(z.a + mass * zc.a, z.b + mass * zc.b);
			}
		}
		let A = reduce4(local, vec4f(lin, sumW)); lin = A.xyz; sumW = A.w;
		if (d.samplePaint > 0.0) {
			let R4 = reduce4(local, vec4f(res, sumA)); res = R4.xyz; sumA = R4.w;
			let za = reduce4(local, z.a); let zb = reduce4(local, z.b);
			var t = reduceBands(local, &ks, wy); wy = bandOf(&t, BANDS);
			var dm = vec3f(0.0);
			if (wy > 0.0) { for (var i = 0u; i < BANDS; i++) { dm += reflOf(bandOf(&t, i) / wy) * display(i); } }
			if (wy > 0.0) { res = mixRescue(clamp(dm + res / wy, vec3f(0.0), vec3f(1.0)), MixState(za / wy, zb / wy)); }
		} else { sumA = reduce(local, sumA); }
		if (local == 0u) {
			if (legacy) {
				if (sumW > 0.0) {
					let a = sumA / sumW;
					if (a > 0.0) { sample = vec4f(clamp(lin / sumW / a, vec3f(0.0), vec3f(1.0)), a); } else { sample.a = a; }
				}
			} else if (sumW > 0.0) {
				var c = vec3f(0.0);
				if (sumA > 0.0) { c = lin / sumA; if (d.samplePaint > 0.0) { c = c * (1.0 - d.samplePaint) + res * d.samplePaint; } }
				sample = vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), sumA / sumW);
			}
		}
	}
	// A hair of a brush that holds paint: its colour is what its columns of the brush's cells carry (paint.mjs _holdColor),
	// mixed by pigment mass weighted by luminance, order-free; its opacity falls as the cells empty.
	var base = vec3f(d.r, d.g, d.b); var baseOpaque = d.opaque;
	if ((d.flags & F_HOLD_COLOUR) != 0u) {
		var mass = 0.0; var start = 0.0; var wy = 0.0; var lin = vec3f(0.0); var res = vec3f(0.0);
		let cell = local; let bx = cell % HOLD_N;
		var ks: array<f32, ${BANDS}>; var z = MixState(vec4f(0.0), vec4f(0.0));
		for (var i = 0u; i < BANDS; i++) { ks[i] = 0.0; }
		let m = state[HOLD_AT + cell];
		if (bx >= d.col0 && bx < d.col1 && m > 1e-8) {
			let c = vec3f(state[HOLD_AT + 2u * HOLD_CELLS + cell * 3u], state[HOLD_AT + 2u * HOLD_CELLS + cell * 3u + 1u], state[HOLD_AT + 2u * HOLD_CELLS + cell * 3u + 2u]);
			mass = m; start = state[HOLD_AT + HOLD_CELLS + cell]; lin = m * c;
			if (d.paint > 0.0) {
				let y = max(0.0001, lum(c)); let w = m * y; let s = basisOf(c); var dec = vec3f(0.0);
				for (var i = 0u; i < BANDS; i++) { let kb = ksRefl(s, i); ks[i] = w * kb.x; dec += kb.y * display(i); }
				res = w * (c - dec); wy = w;
				let zc = mixState(c); z = MixState(m * zc.a, m * zc.b);
			}
		}
		let A = reduce4(local, vec4f(lin, mass)); lin = A.xyz; mass = A.w;
		var mixed = vec3f(0.0);
		if (d.paint > 0.0) {
			let R4 = reduce4(local, vec4f(res, start)); res = R4.xyz; start = R4.w;
			let za = reduce4(local, z.a); let zb = reduce4(local, z.b);
			var t = reduceBands(local, &ks, wy); wy = bandOf(&t, BANDS);
			var dm = vec3f(0.0);
			if (wy > 0.0) { for (var i = 0u; i < BANDS; i++) { dm += reflOf(bandOf(&t, i) / wy) * display(i); } }
			if (wy > 0.0) { mixed = mixRescue(clamp(dm + res / wy, vec3f(0.0), vec3f(1.0)), MixState(za / wy, zb / wy)); }
		} else { start = reduce(local, start); if (mass > 0.0) { mixed = lin / mass; } }
		var remain = 0.0; if (start > 0.0) { remain = min(1.0, mass / start); }
		if (local == 0u && (!(remain > 0.02) || (d.holdVel <= 0.2 && d.holdVel != 1.0))) { state[BUCKET_WORDS + d.index * RESOLVED + 6u] = 1.0; return; }
		base = mixed; baseOpaque = d.opaque * remain;
	}
	if (local != 0u) { return; }
	let R = BUCKET_WORDS + d.index * RESOLVED;
	if ((d.flags & F_UPDATE) != 0u) {
		var prev: vec4f;
		if ((d.flags & F_RESAMPLE) != 0u) {
			if ((d.lim > 0.0 && sample.a < d.lim) || (d.lim < 0.0 && sample.a > -d.lim)) { skip = true; }
			else { state[B + 4u] = sample.r; state[B + 5u] = sample.g; state[B + 6u] = sample.b; state[B + 7u] = sample.a; }
			prev = sample;
		} else { prev = vec4f(state[B + 4u], state[B + 5u], state[B + 6u], state[B + 7u]); }
		if (!skip) {
			let smudge = vec4f(state[B], state[B + 1u], state[B + 2u], state[B + 3u]);
			var next: vec4f;
			if ((d.flags & F_LEGACY) != 0u) {
				let facOld = d.update; let facNew = (1.0 - d.update) * prev.a;
				next = vec4f(facOld * smudge.rgb + facNew * prev.rgb, clamp(facOld * smudge.a + facNew, 0.0, 1.0));
			} else if (prev.a > 0.01) { next = mixColors(smudge, prev, d.update, d.paint); }
			else { next = vec4f(smudge.rgb, (smudge.a + prev.a) / 2.0); }
			state[B] = next.r; state[B + 1u] = next.g; state[B + 2u] = next.b; state[B + 3u] = next.a;
		}
	}
	if (skip) { state[R + 6u] = 1.0; return; }
	// _colourDab
	var color = base;
	var smudgeValue = d.smudge;
	if ((d.flags & F_MOVER) != 0u) { smudgeValue *= clamp(state[B + 3u], 0.0, 1.0); }
	var targetAlpha = 1.0;
	if (smudgeValue > 0.0) {
		let f = min(1.0, smudgeValue);
		let smudge = vec4f(state[B], state[B + 1u], state[B + 2u], state[B + 3u]);
		targetAlpha = clamp((1.0 - f) + f * smudge.a, 0.0, 1.0);
		if (targetAlpha > 0.0) {
			if ((d.flags & F_LEGACY) != 0u) { color = (f * smudge.rgb + (1.0 - f) * color) / targetAlpha; }
			else { color = mixColors(smudge, vec4f(color, 1.0), f, d.paint).rgb; }
		} else { color = vec3f(1.0, 0.0, 0.0); }
	}
	targetAlpha *= 1.0 - d.erase;
	if ((d.flags & (F_HSV | F_HSL)) != 0u) {
		var c = color;
		if ((d.flags & F_LINEAR) != 0u) { c = pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }
		if ((d.flags & F_HSV) != 0u) {
			let hsv = rgbToHsv(c);
			c = hsvToRgb(hsv.x + d.chH, hsv.y + hsv.y * hsv.z * d.chS, hsv.z + d.chV);
		}
		if ((d.flags & F_HSL) != 0u) {
			let hsl = rgbToHsl(c);
			let l = hsl.z + d.chL;
			c = hslToRgb(hsl.x, hsl.y + hsl.y * min(abs(1.0 - l), abs(l)) * 2.0 * d.chHslS, l);
		}
		if ((d.flags & F_LINEAR) != 0u) { c = pow(max(c, vec3f(0.0)), vec3f(2.2)); }
		color = c;
	}
	if ((d.flags & F_HOLD_COLOUR) != 0u) {
		color *= vec3f(d.tr, d.tg, d.tb); targetAlpha = d.alpha;
		// The hair keeps its dab's coverage law: the dab's own resolved target alpha when the GPU resolved it.
		if ((d.flags & F_REF) != 0u) { let K = BUCKET_WORDS + d.refIndex * RESOLVED; if (state[K + 6u] != 0.0) { state[BUCKET_WORDS + d.index * RESOLVED + 6u] = 1.0; return; } targetAlpha = state[K + 4u]; }
	}
	var opaque = baseOpaque; var alpha = targetAlpha; var lockAlpha = d.lockAlpha;
	if ((d.flags & F_SMUDGE_ONLY) != 0u) {
		if (!(targetAlpha > 0.0)) { state[R + 6u] = 1.0; return; }
		opaque = d.opaque * targetAlpha; alpha = 1.0; lockAlpha = 1.0;
	}
	state[R] = clamp(color.r, 0.0, 1.0); state[R + 1u] = clamp(color.g, 0.0, 1.0); state[R + 2u] = clamp(color.b, 0.0, 1.0);
	state[R + 3u] = clamp(opaque, 0.0, 1.0); state[R + 4u] = clamp(alpha, 0.0, 1.0); state[R + 5u] = clamp(lockAlpha, 0.0, 1.0); state[R + 6u] = 0.0;
}

@compute @workgroup_size(256)
fn pickup(@builtin(local_invocation_index) local: u32) { pickupFor(dab, local); }
// Colour passes that read no paint but carry the brush's smudge state from one dab to the next (most MyPaint dabs): one
// invocation runs them in order over a run, before the run's stamps.
@compute @workgroup_size(1)
fn pickupChain() {
	for (var k = 0u; k < run.count; k++) {
		let d = dabs[k];
		if ((d.flags & F_COLOUR) != 0u && (d.flags & F_UPDATE) != 0u && (d.flags & F_RESAMPLE) == 0u && (d.flags & F_HOLD_COLOUR) == 0u) { pickupFor(d, 0u); }
	}
}
// Colour passes that read no paint and write only their own slot (a holding brush's hairs): one workgroup each, together.
@compute @workgroup_size(256)
fn pickupMany(@builtin(workgroup_id) w: vec3u, @builtin(local_invocation_index) local: u32) {
	let d = dabs[w.x];
	if ((d.flags & F_COLOUR) == 0u || (d.flags & (F_RESAMPLE | F_UPDATE)) != 0u) { return; }
	pickupFor(d, local);
}
// ---- held paint: the dab's footprint exchanges paint with the brush's cells once (paint.mjs _holdStep) ----
@compute @workgroup_size(256)
fn holdStep(@builtin(local_invocation_index) cell: u32) {
	let vel = dab.holdVel;
	if (vel <= 0.2 && vel != 1.0) { return; }
	var travel = 1.0; if (vel != 1.0) { travel = min(1.0, vel / 20.0); }
	let n = HOLD_N; let w = dab.w; let h = dab.h;
	let stride = max(1u, u32(floor(f32(min(w, h)) / f32(n * 2u))));
	let by = cell / n; let bx = cell % n;
	let yA = by * h / n; let yB = (by + 1u) * h / n; let xA = bx * w / n; let xB = (bx + 1u) * w / n;
	// What the cell meets, as one mass-weighted pigment mean (luminance-weighted K/S, as every mix here), not a chain of
	// pairwise mixes: a chain of slightly different tints drifts toward olive (measured on the CPU, which chains them).
	var contact = 0.0; var mass = 0.0; var lin = vec3f(0.0); var res = vec3f(0.0); var wy = 0.0;
	var ks: array<f32, ${BANDS}>; var z = MixState(vec4f(0.0), vec4f(0.0));
	for (var b = 0u; b < BANDS; b++) { ks[b] = 0.0; }
	for (var j = yA; j < yB; j += stride) {
		for (var i = xA; i < xB; i += stride) {
			let xp = dab.x0 + i32(i); let yp = dab.y0 + i32(j);
			let o = dabMask(xp, yp, dab.x, dab.y, dab.radius, dab.hardness, dab.softness, dab.aspect, dab.cs, dab.sn) * dab.opaque;
			if (!(o > 0.0)) { continue; }
			let D = sheet[u32(yp) * info.width + u32(xp)];
			let added = D.a * o; contact += o;
			if (!(added > 0.0)) { continue; }
			let p = D.rgb / D.a;
			lin += added * p; mass += added;
			if (dab.paint > 0.0) {
				let m = added * max(0.0001, lum(p)); let sb = basisOf(p); var dec = vec3f(0.0);
				for (var b = 0u; b < BANDS; b++) { let kb = ksRefl(sb, b); ks[b] += m * kb.x; dec += kb.y * display(b); }
				res += m * (p - dec); wy += m;
				let zc = mixState(p); z = MixState(z.a + added * zc.a, z.b + added * zc.b);
			}
		}
	}
	var c = vec3f(0.0);
	if (mass > 0.0) {
		if (dab.paint > 0.0 && wy > 0.0) { var dm = vec3f(0.0); for (var b = 0u; b < BANDS; b++) { dm += reflOf(ks[b] / wy) * display(b); } c = mixRescue(clamp(dm + res / wy, vec3f(0.0), vec3f(1.0)), MixState(z.a / wy, z.b / wy)); }
		else { c = lin / mass; }
	}
	if (!(contact > 0.0)) { return; }
	let was = state[HOLD_AT + cell];
	// holdAmount(was, 0, vel, 1)
	var lay = 0.0;
	if (was > 0.0) {
		let cutoff = min(1.0, was / (1.0 / 30.0));
		let s = clamp((vel - 0.2) / 0.1, 0.0, 1.0); let vc = s * s * (3.0 - 2.0 * s);
		lay = min(0.008, was * 0.1 * cutoff * vc);
	}
	lay *= travel;
	let left = max(0.0, was - lay);
	state[HOLD_AT + cell] = left;
	if (!(mass > 0.0) || !(left > 0.0)) { return; }
	let t = min(0.08, mass / contact * 1.1) * travel;
	let at = HOLD_AT + 2u * HOLD_CELLS + cell * 3u;
	let old = vec3f(state[at], state[at + 1u], state[at + 2u]);
	var next: vec3f;
	if (dab.paint > 0.0) { next = mixPigment(old, c, t); } else { next = old + (c - old) * t; }
	state[at] = next.r; state[at + 1u] = next.g; state[at + 2u] = next.b;
}

// ---- stamp: one dab's footprint, every blend drawDab runs, in its order -----------------------------
fn blendPigment(d: Dab, i: u32, o: f32, rgb: vec3f, alpha: f32, opacity: f32, locked: bool, ceiling: f32) {
	var D = sheet[i];
	let a = o * opacity; let da = D.a;
	var lockMul = 1.0; if (locked) { lockMul = da; }
	let deposited = a * alpha * lockMul; let kept = (1.0 - a) * da; let total = deposited + kept;
	if (!(total > 0.0)) { sheet[i] = vec4f(0.0); return; }
	var na = total;
	if (locked) { na = da; } else if (alpha == 1.0) { na = min(total, max(da, ceiling)); }
	if ((d.flags & F_BODY) != 0u && deposited > 0.0) { lay(d, i, deposited, o); }
	// As the CPU's: an eraser thins the relief under it whether or not it lays body itself (an empty plane stays empty).
	if (alpha < 1.0) { volume[i] = u32(floor(f32(volume[i]) * (1.0 - a * (1.0 - alpha)))); }
	var c = rgb;
	if (da > 0.0) { c = mixPigment(D.rgb / da, rgb, deposited / total); }
	sheet[i] = vec4f(c * na, na);
}
fn stampAt(d: Dab, xp: i32, yp: i32) {
	let o = dabMask(xp, yp, d.x, d.y, d.radius, d.hardness, d.softness, d.aspect, d.cs, d.sn);
	if (o == 0.0) { return; }
	var rgb = vec3f(d.r, d.g, d.b); var opaque = d.opaque; var alpha = d.alpha; var lockAlpha = d.lockAlpha;
	if ((d.flags & F_COLOUR) != 0u) {
		let R = BUCKET_WORDS + d.index * RESOLVED;
		if (state[R + 6u] != 0.0) { return; }
		rgb = vec3f(state[R], state[R + 1u], state[R + 2u]); opaque = state[R + 3u]; alpha = state[R + 4u]; lockAlpha = state[R + 5u];
	}
	// A hair of a bristled brush: its dab's resolved colour, tinted by the hair, at the hair's own opacity.
	if ((d.flags & F_REF) != 0u && (d.flags & F_COLOUR) == 0u) {
		let R = BUCKET_WORDS + d.refIndex * RESOLVED;
		if (state[R + 6u] != 0.0) { return; }
		rgb = clamp(vec3f(state[R] * d.tr, state[R + 1u] * d.tg, state[R + 2u] * d.tb), vec3f(0.0), vec3f(1.0));
		alpha = state[R + 4u]; lockAlpha = state[R + 5u];
	}
	if (opaque == 0.0) { return; }
	let i = u32(yp) * info.width + u32(xp);
	let colorize = d.colorize; let posterize = d.posterize; let paint = d.paint;
	let normal = (1.0 - lockAlpha) * (1.0 - colorize) * (1.0 - posterize);
	var ceiling = 1.0;
	if (d.bite > 0.0) { ceiling = 1.0 - d.bite * (1.0 - toothAt(u32(xp), u32(yp)) / 255.0); }
	let body = (d.flags & F_BODY) != 0u;
	if (paint < 1.0) {
		if (normal > 0.0) {
			let a0 = o * normal * opaque * (1.0 - paint); let ab = 1.0 - a0;
			var D = sheet[i];
			if (alpha == 1.0) {
				if (body) { lay(d, i, a0, o); }
				let un = a0 + ab * D.a;
				if (d.bite > 0.0) {
					if (un > 0.0) {
						if (un <= ceiling) { D = vec4f(a0 * rgb + ab * D.rgb, un); }
						else { let na = max(D.a, ceiling); let k = na / un; D = vec4f((a0 * rgb + ab * D.rgb) * k, na); }
					}
				} else { D = vec4f(a0 * rgb + ab * D.rgb, un); }
			} else {
				let a1 = a0 * alpha;
				D = vec4f(a1 * rgb + ab * D.rgb, a1 + ab * D.a);
			}
			sheet[i] = D;
		}
		if (lockAlpha > 0.0 && alpha != 0.0) {
			var D = sheet[i];
			let a0 = o * lockAlpha * opaque * (1.0 - colorize) * (1.0 - posterize) * (1.0 - paint); let ab = 1.0 - a0; let a1 = a0 * D.a;
			sheet[i] = vec4f(a1 * rgb + ab * D.rgb, D.a);
		}
	}
	if (paint > 0.0) {
		if (normal > 0.0) {
			var c = 1.0; if (d.bite > 0.0) { c = ceiling; }
			blendPigment(d, i, o, rgb, alpha, normal * opaque * paint, false, c);
		}
		if (lockAlpha > 0.0 && alpha != 0.0) { blendPigment(d, i, o, rgb, 1.0, lockAlpha * opaque * (1.0 - colorize) * (1.0 - posterize) * paint, true, 1.0); }
	}
	if (colorize > 0.0) {
		var D = sheet[i]; let da = D.a;
		var s = vec3f(0.0); if (da != 0.0) { s = D.rgb / da; }
		let diff = lum(s) - lum(rgb);
		var n = rgb + vec3f(diff);
		let l = lum(n); let cmin = min(n.r, min(n.g, n.b)); let cmax = max(n.r, max(n.g, n.b));
		if (cmin < 0.0) { n = vec3f(l) + (n - vec3f(l)) * l / (l - cmin); }
		if (cmax > 1.0) { n = vec3f(l) + (n - vec3f(l)) * (1.0 - l) / (cmax - l); }
		n *= da;
		let a0 = o * colorize * opaque; let ab = 1.0 - a0;
		sheet[i] = vec4f(a0 * n + ab * D.rgb, D.a);
	}
	if (posterize > 0.0) {
		var D = sheet[i]; let num = d.posterizeNum;
		let p = round(D.rgb * num) / num;
		let a0 = o * posterize * opaque; let ab = 1.0 - a0;
		sheet[i] = vec4f(a0 * p + ab * D.rgb, D.a);
	}
}


// A run of stamps, in order, over the run's box: each pixel applies the dabs that cover it one after another. A stamp reads and
// writes only its own pixel, so this is the same arithmetic as one dispatch a dab.
@compute @workgroup_size(8, 8)
fn stampRun(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= run.w || g.y >= run.h) { return; }
	let xp = run.x0 + i32(g.x); let yp = run.y0 + i32(g.y);
	for (var k = 0u; k < run.count; k++) {
		let d = dabs[k];
		if ((d.flags & F_NO_STAMP) != 0u || xp < d.x0 || yp < d.y0 || xp >= d.x0 + i32(d.w) || yp >= d.y0 + i32(d.h)) { continue; }
		stampAt(d, xp, yp);
	}
}

// ---- the operators (paint.mjs applyOp): they read the paint as it stood before the dab ------------
// The window an operator reads, copied whole before it writes (zeros past the sheet's edge).
@compute @workgroup_size(8, 8)
fn opSnap(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.u2 || g.y >= dab.u3) { return; }
	let x = dab.u0 + i32(g.x); let y = dab.u1 + i32(g.y);
	var v = vec4f(0.0);
	if (x >= 0 && y >= 0 && x < i32(info.width) && y < i32(info.height)) { v = sheet[u32(y) * info.width + u32(x)]; }
	scratch[g.y * dab.u2 + g.x] = v;
}
// The drag's softened copy: the window averaged into cells f wide (opGrid), then a box blur of radius rb (rows, then columns),
// each a mean over what the grid holds, as _opBlurWindow writes it.
fn gridW() -> u32 { let f = u32(dab.o5); return (dab.u2 + f - 1u) / f; }
fn gridH() -> u32 { let f = u32(dab.o5); return (dab.u3 + f - 1u) / f; }
@compute @workgroup_size(8, 8)
fn opGrid(@builtin(global_invocation_id) g: vec3u) {
	let gw = gridW(); let gh = gridH(); let f = u32(dab.o5);
	if (g.x >= gw || g.y >= gh) { return; }
	var sum = vec4f(0.0);
	let xa = g.x * f; let ya = g.y * f; let xb = min(dab.u2, xa + f); let yb = min(dab.u3, ya + f);
	for (var y = ya; y < yb; y++) { for (var x = xa; x < xb; x++) { sum += scratch[y * dab.u2 + x]; } }
	scratch[dab.u2 * dab.u3 + g.y * gw + g.x] = sum / f32((xb - xa) * (yb - ya));
}
@compute @workgroup_size(8, 8)
fn opBlurRows(@builtin(global_invocation_id) g: vec3u) {
	let gw = gridW(); let gh = gridH();
	if (g.x >= gw || g.y >= gh) { return; }
	let base = dab.u2 * dab.u3; let r = i32(dab.o6);
	let lo = max(0, i32(g.x) - r); let hi = min(i32(gw) - 1, i32(g.x) + r);
	var sum = vec4f(0.0);
	for (var i = lo; i <= hi; i++) { sum += scratch[base + g.y * gw + u32(i)]; }
	scratch[base + gw * gh + g.y * gw + g.x] = sum / f32(hi - lo + 1);
}
@compute @workgroup_size(8, 8)
fn opBlurCols(@builtin(global_invocation_id) g: vec3u) {
	let gw = gridW(); let gh = gridH();
	if (g.x >= gw || g.y >= gh) { return; }
	let base = dab.u2 * dab.u3; let r = i32(dab.o6);
	let lo = max(0, i32(g.y) - r); let hi = min(i32(gh) - 1, i32(g.y) + r);
	var sum = vec4f(0.0);
	for (var j = lo; j <= hi; j++) { sum += scratch[base + gw * gh + u32(j) * gw + g.x]; }
	scratch[base + g.y * gw + g.x] = sum / f32(hi - lo + 1);
}
fn opHash(k: i32) -> f32 {
	var v = (bitcast<u32>(k) ^ dab.bucket) * 2246822519u;
	v ^= v >> 15u; v = v * 3266489917u;
	return f32(v ^ (v >> 13u)) / 4294967296.0;
}
@compute @workgroup_size(8, 8)
fn opApply(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	let xp = dab.x0 + i32(g.x); let yp = dab.y0 + i32(g.y);
	let o = dabMask(xp, yp, dab.x, dab.y, dab.radius, dab.hardness, dab.softness, dab.aspect, dab.cs, dab.sn);
	if (o == 0.0) { return; }
	let i = u32(yp) * info.width + u32(xp);
	var D = sheet[i]; let a = D.a; let strength = dab.opaque;
	let body = (dab.flags & F_BODY) != 0u;
	if (dab.op == 1u) { // erase
		if (!(a > 0.0)) { return; }
		let k = max(0.0, 1.0 - o * strength / a);
		if (!(k < 1.0)) { return; }
		sheet[i] = D * k; if (body) { volume[i] = u32(floor(f32(volume[i]) * k)); }
		return;
	}
	let t = toothAt(u32(xp), u32(yp)) / 255.0;
	if (dab.op == 2u) { // dissolve
		if (!(a > 0.0)) { return; }
		let want = o * strength * 0.19 * (1.0 - 0.55 * t);
		var k = 1.0; if (want > 0.0) { if (want >= a) { k = 0.0; } else { k = 1.0 - want / a; } }
		if (!(k < 1.0)) { return; }
		sheet[i] = D * k; if (body) { volume[i] = u32(floor(f32(volume[i]) * k)); }
		return;
	}
	if (dab.op == 3u) { // erode: toward the least coverage within R, read from the snapshot
		if (!(a > 0.0)) { return; }
		let R = i32(dab.o4);
		var low = 2.0;
		for (var dy = -R; dy <= R; dy++) { for (var dx = -R; dx <= R; dx++) {
			let x = xp + dx; let y = yp + dy;
			if (x < 0 || y < 0 || x >= i32(info.width) || y >= i32(info.height)) { continue; }
			low = min(low, scratch[u32(y - dab.u1) * dab.u2 + u32(x - dab.u0)].a);
		} }
		if (!(low < a)) { return; }
		let f = clamp(o * strength * 0.9 * (1.0 - 0.55 * t), 0.0, 1.0);
		let na = a + f * (low - a); let k = na / a;
		sheet[i] = vec4f(D.rgb * k, na); if (body) { volume[i] = u32(floor(f32(volume[i]) * k)); }
		return;
	}
	// drag (Smudge, Smear): the paint one dab's travel behind, from the snapshot window or its softened grid
	let dx = dab.o0; let dy = dab.o1; let ix = floor(dx); let iy = floor(dy); let fx = dx - ix; let fy = dy - iy;
	var w0 = fx * fy; var w1 = (1.0 - fx) * fy; var w2 = fx * (1.0 - fy); var w3 = (1.0 - fx) * (1.0 - fy);
	var c0: vec4f; var c1: vec4f; var c2: vec4f; var c3: vec4f;
	if (dab.o5 > 0.0) {
		let f = dab.o5; let gw = gridW(); let gh = gridH(); let base = dab.u2 * dab.u3;
		let u = clamp((f32(g.x) + 1.0 - fx - (f - 1.0) / 2.0) / f, 0.0, f32(gw) - 1.0);
		let ca = min(max(0.0, f32(gw) - 2.0), floor(u)); var ax = 0.0; if (gw > 1u) { ax = u - ca; }
		let v = clamp((f32(g.y) + 1.0 - fy - (f - 1.0) / 2.0) / f, 0.0, f32(gh) - 1.0);
		let ra = min(max(0.0, f32(gh) - 2.0), floor(v)); var by = 0.0; if (gh > 1u) { by = v - ra; }
		let q = base + u32(ra) * gw + u32(ca);
		let cx1 = min(u32(ca) + 1u, gw - 1u) - u32(ca); let ry1 = (min(u32(ra) + 1u, gh - 1u) - u32(ra)) * gw;
		c0 = scratch[q]; c1 = scratch[q + cx1]; c2 = scratch[q + ry1]; c3 = scratch[q + ry1 + cx1];
		w0 = (1.0 - ax) * (1.0 - by); w1 = ax * (1.0 - by); w2 = (1.0 - ax) * by; w3 = ax * by;
	} else {
		let q = g.y * dab.u2 + g.x;
		c0 = scratch[q]; c1 = scratch[q + 1u]; c2 = scratch[q + dab.u2]; c3 = scratch[q + dab.u2 + 1u];
	}
	let C = w0 * c0 + w1 * c1 + w2 * c2 + w3 * c3;
	if (!(C.a > 1e-6)) { return; }
	var k = o * dab.o2 * (0.7 + 0.3 / 255.0 * toothAt(u32(xp), u32(yp)));
	let comb = dab.o3;
	if (comb > 0.0) {
		let len = sqrt(dx * dx + dy * dy); let tx = dx / len; let ty = dy / len;
		let cx = f32(dab.x0) + f32(dab.w) / 2.0; let cy = f32(dab.y0) + f32(dab.h) / 2.0;
		let c = ((f32(xp) - cx) * -ty + (f32(yp) - cy) * tx) * dab.o4; let ci = floor(c); let cf = c - ci; let e = cf * cf * (3.0 - 2.0 * cf);
		k *= 1.0 - comb * (opHash(i32(ci)) * (1.0 - e) + opHash(i32(ci) + 1) * e);
	}
	if (!(k > 0.0)) { return; }
	let da = D.a;
	var na = da; if (C.a > da) { na = da + k * (C.a - da); }
	let mass = (1.0 - k) * da + k * C.a;
	if (!(mass > 1e-9)) { return; }
	let f = na / mass;
	if (dab.paint > 0.0 && C.a > 0.0 && da > 0.0) { D = vec4f(mixPigment(D.rgb / da, C.rgb / C.a, k * C.a / mass) * na, na); }
	else { D = vec4f((1.0 - k) * f * D.rgb + k * f * C.rgb, na); }
	sheet[i] = D;
	if (body) { volume[i] = u32(floor(f32(volume[i]) * (1.0 - dab.o7 * k))); }
}


// ---- Blend (paint.mjs _opBlend): pairwise pigment exchange at doubling strides, mass exact ---------
// Per pixel of the footprint in scratch: [A, Y, mask, 0] then 12 vec4: K/S bands, the residual and the wheel state (or straight RGB).
fn bAt(m: u32) -> u32 { return m * ${BLEND_VEC}u; }
fn bandGet(m: u32, k: u32) -> f32 { let v = scratch[bAt(m) + 1u + k / 4u]; return v[k % 4u]; }
fn bandSet(m: u32, k: u32, value: f32) { let at = bAt(m) + 1u + k / 4u; var v = scratch[at]; v[k % 4u] = value; scratch[at] = v; }
fn bandCount() -> u32 { if (dab.paint > 0.0) { return BANDS + 11u; } return 3u; }
@compute @workgroup_size(8, 8)
fn blendRead(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	let m = g.y * dab.w + g.x; let xp = dab.x0 + i32(g.x); let yp = dab.y0 + i32(g.y);
	let o = dabMask(xp, yp, dab.x, dab.y, dab.radius, dab.hardness, dab.softness, dab.aspect, dab.cs, dab.sn);
	if (o == 0.0) { scratch[bAt(m)] = vec4f(-1.0, 0.0, 0.0, 0.0); return; }
	let D = sheet[u32(yp) * info.width + u32(xp)]; let a = D.a;
	var Y = a;
	if (dab.paint > 0.0 && a > 0.0) { Y = a * max(0.0001, lum(D.rgb) / a); }
	scratch[bAt(m)] = vec4f(a, Y, o, 0.0);
	for (var k = 0u; k < ${BLEND_VEC - 1}u; k++) { scratch[bAt(m) + 1u + k] = vec4f(0.0); }
	if (!(a > 0.0)) { return; }
	let c = D.rgb / a;
	if (dab.paint > 0.0) {
		let s = basisOf(c); var dec = vec3f(0.0);
		for (var i = 0u; i < BANDS; i++) { let kb = ksRefl(s, i); bandSet(m, i, kb.x); dec += kb.y * display(i); }
		let r = c - dec; bandSet(m, BANDS, r.r); bandSet(m, BANDS + 1u, r.g); bandSet(m, BANDS + 2u, r.b);
		// Divided by luminance, as the CPU stores them: the exchange weights by luminance, so the wheel mixes by mass.
		let z = mixStateWeighted(c, 1.0 / max(0.0001, lum(c))); for (var k = 0u; k < 4u; k++) { bandSet(m, BANDS + 3u + k, z.a[k]); bandSet(m, BANDS + 7u + k, z.b[k]); }
	} else { bandSet(m, 0u, c.r); bandSet(m, 1u, c.g); bandSet(m, 2u, c.b); }
}
// One half-sweep: pairs (m, m + stride) along rows (o5 = 0) or columns (o5 = 1) whose block index has parity o6.
@compute @workgroup_size(8, 8)
fn blendTrade(@builtin(global_invocation_id) g: vec3u) {
	let s = dab.u2; let vertical = dab.o5 > 0.5; let parity = u32(dab.o6);
	var i = g.x; var j = g.y;
	if (vertical) { if (i >= dab.w || j + s >= dab.h || ((j / s) % 2u) != parity) { return; } }
	else { if (j >= dab.h || i + s >= dab.w || ((i / s) % 2u) != parity) { return; } }
	let a = j * dab.w + i; var b = a + s; if (vertical) { b = a + s * dab.w; }
	let sa = scratch[bAt(a)]; let sb = scratch[bAt(b)];
	if (sa.x < 0.0 || sb.x < 0.0) { return; }
	let f = min(sa.z, sb.z) * dab.o4;
	if (!(f > 0.0)) { return; }
	let ma = sa.x; let mb = sb.x; let ga = f * ma; let gb = f * mb;
	let ya = sa.y; let yb = sb.y; let ha = f * ya; let hb = f * yb; let na = ya - ha + hb; let nb = yb - hb + ha;
	let ka = ya - ha; let kb = yb - hb;
	// Four bands at a time (the lanes past the last band hold zeros and stay zero).
	let words = (bandCount() + 3u) / 4u;
	for (var k = 0u; k < words; k++) {
		let la = scratch[bAt(a) + 1u + k]; let lb = scratch[bAt(b) + 1u + k];
		if (na > 0.0) { scratch[bAt(a) + 1u + k] = (la * ka + lb * hb) / na; }
		if (nb > 0.0) { scratch[bAt(b) + 1u + k] = (lb * kb + la * ha) / nb; }
	}
	scratch[bAt(a)] = vec4f(ma - ga + gb, na, sa.z, 0.0);
	scratch[bAt(b)] = vec4f(mb - gb + ga, nb, sb.z, 0.0);
}
@compute @workgroup_size(8, 8)
fn blendWrite(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	let m = g.y * dab.w + g.x; let st = scratch[bAt(m)]; let na = st.x;
	if (na < 0.0) { return; }
	let i = u32(dab.y0 + i32(g.y)) * info.width + u32(dab.x0 + i32(g.x));
	if (na > 0.0) {
		var rgb: vec3f;
		if (dab.paint > 0.0) {
			rgb = vec3f(bandGet(m, BANDS), bandGet(m, BANDS + 1u), bandGet(m, BANDS + 2u));
			for (var k = 0u; k < BANDS; k++) { rgb += reflOf(bandGet(m, k)) * display(k); }
			rgb = mixRescue(clamp(rgb, vec3f(0.0), vec3f(1.0)), MixState(vec4f(bandGet(m, BANDS + 3u), bandGet(m, BANDS + 4u), bandGet(m, BANDS + 5u), bandGet(m, BANDS + 6u)), vec4f(bandGet(m, BANDS + 7u), bandGet(m, BANDS + 8u), bandGet(m, BANDS + 9u), bandGet(m, BANDS + 10u))));
		} else { rgb = vec3f(bandGet(m, 0u), bandGet(m, 1u), bandGet(m, 2u)); }
		sheet[i] = vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)) * na, na);
	} else { sheet[i] = vec4f(0.0); }
	if ((dab.flags & F_BODY) != 0u) { volume[i] = u32(floor(f32(volume[i]) * (1.0 - 0.35 * 0.5 * st.z * dab.opaque))); }
}

// ---- readback pack: a box of the sheet (and the volume plane) into a contiguous buffer -------------
struct Box { x0: u32, y0: u32, w: u32, h: u32, relief: u32, p0: u32, p1: u32, p2: u32 };
@group(1) @binding(0) var<uniform> box: Box;
@group(1) @binding(1) var<storage, read_write> packed: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> packedVolume: array<u32>;
@compute @workgroup_size(8, 8)
fn pack(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= box.w || g.y >= box.h) { return; }
	let i = (box.y0 + g.y) * info.width + box.x0 + g.x;
	packed[g.y * box.w + g.x] = sheet[i];
	packedVolume[g.y * box.w + g.x] = volume[i];
}
fn reliefAt(x: u32, y: u32) -> f32 {
	var h = f32(volume[y * info.width + x]) / 255.0;
	if ((box.relief & 2u) != 0u) { h += toothAt(x, y) / 255.0 * 0.25; }
	return h;
}
// The live display: straight colour, sRGB-ish 1/2.2 encoding as toRGBA8 writes it, one u32 per pixel.
@group(1) @binding(3) var<storage, read_write> packedDisplay: array<u32>;
@compute @workgroup_size(8, 8)
fn packDisplay(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= box.w || g.y >= box.h) { return; }
	let D = sheet[(box.y0 + g.y) * info.width + box.x0 + g.x];
	var px = 0u;
	if (D.a > 0.0) {
		var straight = clamp(D.rgb / D.a, vec3f(0.0), vec3f(1.0));
		let x = box.x0 + g.x; let y = box.y0 + g.y;
		// Raised paint lit on the way out, as PaintSurface._shadeClassic does (never stored).
		if (box.relief != 0u && volume[y * info.width + x] != 0u && x >= 1u && y >= 1u && x + 2u <= info.width && y + 2u <= info.height) {
			let h = reliefAt(x, y);
			if (h > 0.0) {
				let n = vec3f(reliefAt(x - 1u, y) - reliefAt(x + 1u, y), reliefAt(x, y - 1u) - reliefAt(x, y + 1u), 0.16);
				let dt = dot(n, vec3f(${RAPIER_LIGHT.join(', ')})) / length(n);
				var spec = 0.0; if (dt > 0.0) { spec = ${RAPIER_GLOSS.toFixed(4)} * pow(dt, 12.0) * min(1.0, h * 2.0); }
				straight = clamp(straight * (1.0 + ${RAPIER_RELIEF.toFixed(4)} * dt) + vec3f(spec), vec3f(0.0), vec3f(1.0));
			}
		}
		let c = round(pow(straight, vec3f(1.0 / 2.2)) * 255.0);
		let a = round(clamp(D.a, 0.0, 1.0) * 255.0);
		px = u32(c.r) | (u32(c.g) << 8u) | (u32(c.b) << 16u) | (u32(a) << 24u);
	}
	packedDisplay[g.y * box.w + g.x] = px;
}
// Whole 64-pixel tiles of the sheet (a list of tile origins in packedDisplay, x | y << 16, in tiles), one workgroup each.
@compute @workgroup_size(8, 8)
fn packTiles(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) l: vec3u) {
	let t = wg.x; let at = packedDisplay[t]; let tx = (at & 65535u) * 64u; let ty = (at >> 16u) * 64u;
	for (var y = l.y; y < 64u; y += 8u) { for (var x = l.x; x < 64u; x += 8u) {
		var v = vec4f(0.0); var vol = 0u;
		if (tx + x < info.width && ty + y < info.height) { let i = (ty + y) * info.width + tx + x; v = sheet[i]; vol = volume[i]; }
		packed[t * 4096u + y * 64u + x] = v; packedVolume[t * 4096u + y * 64u + x] = vol;
	} }
}
@compute @workgroup_size(8, 8)
fn unpack(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= box.w || g.y >= box.h) { return; }
	let i = (box.y0 + g.y) * info.width + box.x0 + g.x;
	sheet[i] = packed[g.y * box.w + g.x];
	volume[i] = packedVolume[g.y * box.w + g.x];
}
`;

const POSTERIZE_WGSL = `
struct Slot { key: atomic<u32>, claim: atomic<u32>, colour: atomic<u32>, fixed: atomic<u32> };
@group(2) @binding(0) var<storage, read_write> palette: array<Slot, ${PALETTE_SLOTS}>;
fn posterKey(xp: i32, yp: i32, o: ptr<function, f32>, bytes: ptr<function, vec3u>, alpha: ptr<function, f32>) -> u32 {
	*o = dabMask(xp, yp, dab.x, dab.y, dab.radius, dab.hardness, dab.softness, dab.aspect, dab.cs, dab.sn);
	if (*o < 0.15) { return 0u; }
	let D = sheet[u32(yp) * info.width + u32(xp)]; let a = D.a; *alpha = a;
	if (!(a > 0.0)) { return 0u; }
	let b = vec3u(round(pow(clamp(D.rgb / a, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)) * 255.0));
	*bytes = b;
	let levels = u32(round(4.0 + 12.0 * (1.0 - dab.opaque))); let plane = levels * levels;
	return ((levels * 4096u + ((b.r * levels) >> 8u) * plane + ((b.g * levels) >> 8u) * levels + ((b.b * levels) >> 8u)) * 256u + u32(round(clamp(a, 0.0, 1.0) * 255.0))) + 1u;
}
fn slotOf(key: u32, claim: bool) -> i32 {
	var h = (key * 2654435761u) >> 16u;
	for (var n = 0u; n < 64u; n++) {
		let at = (h + n) % ${PALETTE_SLOTS}u;
		if (claim) {
			let r = atomicCompareExchangeWeak(&palette[at].key, 0u, key);
			if (r.exchanged || r.old_value == key) { return i32(at); }
			if (r.old_value == 0u) { n--; continue; } // a spurious weak failure: try the same slot again
		} else if (atomicLoad(&palette[at].key) == key) { return i32(at); }
	}
	return -1;
}
@compute @workgroup_size(8, 8)
fn posterClaim(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	var o = 0.0; var b = vec3u(0u); var a = 0.0;
	let key = posterKey(dab.x0 + i32(g.x), dab.y0 + i32(g.y), &o, &b, &a); if (key == 0u) { return; }
	let at = slotOf(key, true); if (at < 0) { return; }
	if (atomicLoad(&palette[at].fixed) == 0u) { atomicMax(&palette[at].claim, 0xffffffffu - (g.y * dab.w + g.x)); }
}
@compute @workgroup_size(8, 8)
fn posterSettle(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	var o = 0.0; var b = vec3u(0u); var a = 0.0;
	let key = posterKey(dab.x0 + i32(g.x), dab.y0 + i32(g.y), &o, &b, &a); if (key == 0u) { return; }
	let at = slotOf(key, false); if (at < 0) { return; }
	if (atomicLoad(&palette[at].fixed) == 0u && atomicLoad(&palette[at].claim) == 0xffffffffu - (g.y * dab.w + g.x)) { atomicStore(&palette[at].colour, b.r | (b.g << 8u) | (b.b << 16u)); }
}
@compute @workgroup_size(8, 8)
fn posterMark(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	var o = 0.0; var b = vec3u(0u); var a = 0.0;
	let key = posterKey(dab.x0 + i32(g.x), dab.y0 + i32(g.y), &o, &b, &a); if (key == 0u) { return; }
	let at = slotOf(key, false); if (at >= 0) { atomicStore(&palette[at].fixed, 1u); }
}
@compute @workgroup_size(8, 8)
fn posterWrite(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= dab.w || g.y >= dab.h) { return; }
	let xp = dab.x0 + i32(g.x); let yp = dab.y0 + i32(g.y);
	var o = 0.0; var b = vec3u(0u); var a = 0.0;
	let key = posterKey(xp, yp, &o, &b, &a); if (key == 0u) { return; }
	let at = slotOf(key, false);
	var c = b; if (at >= 0) { let v = atomicLoad(&palette[at].colour); c = vec3u(v & 255u, (v >> 8u) & 255u, (v >> 16u) & 255u); }
	sheet[u32(yp) * info.width + u32(xp)] = vec4f(pow(vec3f(c) / 255.0, vec3f(2.2)) * a, a);
}
`;
const TOOTH_WGSL = `
struct Tooth { seed: u32, ox: i32, oy: i32, tilesW: u32 };
@group(0) @binding(0) var<storage, read_write> tooth: array<u32>;
@group(0) @binding(1) var<uniform> params: Tooth;
@group(0) @binding(2) var<storage, read> tiles: array<u32>;
fn hash(seed: u32, x: i32, y: i32) -> f32 {
	var n = seed ^ bitcast<u32>(x * 374761393) ^ bitcast<u32>(y * 668265263);
	n = (n ^ (n >> 13u)) * 1274126177u;
	return f32(n ^ (n >> 16u)) / 4294967295.0;
}
fn noise(seed: u32, x: f32, y: f32, size: f32) -> f32 {
	let fx = x / size; let fy = y / size; let ix = floor(fx); let iy = floor(fy);
	var a = fx - ix; var b = fy - iy; a = a * a * (3.0 - 2.0 * a); b = b * b * (3.0 - 2.0 * b);
	let X = i32(ix); let Y = i32(iy);
	let n0 = hash(seed, X, Y); let n1 = hash(seed, X + 1, Y); let n2 = hash(seed, X, Y + 1); let n3 = hash(seed, X + 1, Y + 1);
	return (n0 + (n1 - n0) * a) * (1.0 - b) + (n2 + (n3 - n2) * a) * b;
}
fn paperTooth(x: f32, y: f32) -> f32 {
	return ${PAPER_OCTAVES.map(([S, W, M]) => `${W.toFixed(4)} * noise(params.seed ^ ${M}u, x, y, ${S} * ${TOOTH_GRAIN.toFixed(1)})`).join(' + ')};
}
// Four pixels a thread, so each writes one whole word.
@compute @workgroup_size(16, 8)
fn toothTile(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) l: vec3u) {
	let at = tiles[wg.x]; let tx = at & 65535u; let ty = at >> 16u;
	for (var y = l.y; y < 64u; y += 8u) {
		var word = 0u;
		for (var k = 0u; k < 4u; k++) {
			let x = l.x * 4u + k;
			let px = f32(i32(tx * 64u + x) + params.ox); let py = f32(i32(ty * 64u + y) + params.oy);
			let v = clamp((paperTooth(px, py) - 0.5) * ${TOOTH_CONTRAST.toFixed(1)} + 0.5, 0.0, 1.0) * 255.0;
			word |= u32(v) << (k * 8u);
		}
		tooth[(ty * params.tilesW + tx) * 1024u + y * 16u + l.x] = word;
	}
}
`;
export const paintGpuShaderSource = () => WGSL;

function pigmentTables() {
	const out = new Float32Array(BANDS * 3 * 4);
	for (let i = 0; i < BANDS; i++) {
		const p = PAINT_PRIMARY[i], d = PAINT_DISPLAY[i], o = i * 12;
		out.set([p[0], p[1], p[2], p[3]], o); out.set([p[4], p[5], 0, 0], o + 4); out.set([d[0], d[1], d[2], 0], o + 8);
	}
	return out;
}

const programs = new WeakMap();
function programsFor(device) {
	let p = programs.get(device);
	if (p) return p;
	const module = device.createShaderModule({label: 'Paint', code: WGSL});
	const S = GPUShaderStage.COMPUTE;
	const main = device.createBindGroupLayout({label: 'Paint sheet', entries: [
		{binding: 0, visibility: S, buffer: {type: 'storage'}},
		{binding: 1, visibility: S, buffer: {type: 'storage'}},
		{binding: 2, visibility: S, buffer: {type: 'read-only-storage'}},
		{binding: 3, visibility: S, buffer: {type: 'storage'}},
		{binding: 4, visibility: S, buffer: {type: 'uniform', hasDynamicOffset: true, minBindingSize: DAB_WORDS * 4}},
		{binding: 5, visibility: S, buffer: {type: 'uniform'}},
		{binding: 6, visibility: S, buffer: {type: 'uniform'}},
		{binding: 7, visibility: S, buffer: {type: 'storage'}},
		{binding: 8, visibility: S, buffer: {type: 'uniform', hasDynamicOffset: true, minBindingSize: RUN_MAX * DAB_STRIDE}},
		{binding: 9, visibility: S, buffer: {type: 'uniform', hasDynamicOffset: true, minBindingSize: 32}}]});
	const io = device.createBindGroupLayout({label: 'Paint box', entries: [
		{binding: 0, visibility: S, buffer: {type: 'uniform'}},
		{binding: 1, visibility: S, buffer: {type: 'storage'}},
		{binding: 2, visibility: S, buffer: {type: 'storage'}},
		{binding: 3, visibility: S, buffer: {type: 'storage'}}]});
	const single = device.createPipelineLayout({bindGroupLayouts: [main]}), both = device.createPipelineLayout({bindGroupLayouts: [main, io]});
	const make = (entryPoint, layout) => device.createComputePipeline({label: 'Paint ' + entryPoint, layout, compute: {module, entryPoint}});
	const tables = device.createBuffer({label: 'Paint pigment tables', size: BANDS * 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
	device.queue.writeBuffer(tables, 0, pigmentTables());
	const paletteLayout = device.createBindGroupLayout({label: 'Paint palette', entries: [{binding: 0, visibility: S, buffer: {type: 'storage'}}]});
	const empty = device.createBindGroupLayout({label: 'Paint none', entries: []}), emptyGroup = device.createBindGroup({layout: empty, entries: []});
	let posterPipelines = null;
	const posterize = () => posterPipelines ??= (() => {
		const module = device.createShaderModule({label: 'Paint posterize', code: WGSL + POSTERIZE_WGSL});
		const layout = device.createPipelineLayout({bindGroupLayouts: [main, empty, paletteLayout]});
		const make = entryPoint => device.createComputePipeline({label: 'Paint ' + entryPoint, layout, compute: {module, entryPoint}});
		return {posterClaim: make('posterClaim'), posterSettle: make('posterSettle'), posterMark: make('posterMark'), posterWrite: make('posterWrite')};
	})();
	const toothLayout = device.createBindGroupLayout({label: 'Paint tooth', entries: [{binding: 0, visibility: S, buffer: {type: 'storage'}}, {binding: 1, visibility: S, buffer: {type: 'uniform'}}, {binding: 2, visibility: S, buffer: {type: 'read-only-storage'}}]});
	const toothTile = device.createComputePipeline({label: 'Paint toothTile', layout: device.createPipelineLayout({bindGroupLayouts: [toothLayout]}), compute: {module: device.createShaderModule({label: 'Paint tooth', code: TOOTH_WGSL}), entryPoint: 'toothTile'}});
	p = {toothLayout, toothTile, paletteLayout, emptyGroup, posterize, main, io, stampRun: make('stampRun', single), pickup: make('pickup', single), pickupMany: make('pickupMany', single), pickupChain: make('pickupChain', single), holdStep: make('holdStep', single), opSnap: make('opSnap', single), opGrid: make('opGrid', single), opBlurRows: make('opBlurRows', single), opBlurCols: make('opBlurCols', single), opApply: make('opApply', single), blendRead: make('blendRead', single), blendTrade: make('blendTrade', single), blendWrite: make('blendWrite', single), pack: make('pack', both), unpack: make('unpack', both), packDisplay: make('packDisplay', both), packTiles: make('packTiles', both), tables};
	programs.set(device, p);
	return p;
}

export function paintGpuFits(device, width, height) {
	const bytes = width * height * 16, L = device.limits;
	return bytes <= L.maxStorageBufferBindingSize && bytes <= L.maxBufferSize;
}
export class GpuPaintSurface {
	constructor(device, record) {
		this.device = device; this.record = record; this.programs = programsFor(device);
		this.gpu = true; this.lost = null;
		this.batch = new ArrayBuffer(MAX_BATCH * DAB_STRIDE); this.batchF = new Float32Array(this.batch); this.batchU = new Uint32Array(this.batch); this.batchI = new Int32Array(this.batch);
		this.count = 0; this.colourCount = 0; this.runsUniform = device.createBuffer({label: 'Paint runs', size: MAX_RUNS * RUN_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}); this.runs = new ArrayBuffer(MAX_RUNS * RUN_STRIDE);
		this.dabsUniform = device.createBuffer({label: 'Paint dabs', size: (MAX_BATCH + RUN_MAX) * DAB_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		this.geometry = [];
		this.state = device.createBuffer({label: 'Paint brush state', size: STATE_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		this.info = device.createBuffer({label: 'Paint info', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		this.boxUniform = device.createBuffer({label: 'Paint box', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		this.stroke = null; this.brush = null; this.brushEpoch = -1;
		this.toothSent = new Set();
		this.stale = null; this.syncedRevision = -1; this.dirty = null;
		device.lost?.then(info => { this.lost = info || {reason: 'unknown'}; });
		this._watch();
		if (!device.paintErrorWatch) { device.paintErrorWatch = true; device.addEventListener?.('uncapturederror', event => { device.paintError ??= event.error; }); }
		this._allocate();
	}
	get width() { return this.record.width; }
	get height() { return this.record.height; }
	get scale() { return this.record.scale; }
	set scale(v) { this.record.scale = v; }
	_allocate() {
		const {width, height} = this.record, d = this.device, n = width * height;
		if (!paintGpuFits(d, width, height)) { this.lost = {reason: 'size'}; throw failure('paint_gpu_lost', 'This layer is larger than the GPU buffers.'); }
		for (const b of [this.sheet, this.volume, this.tooth, this.snapBuffer, ...(this.planes?.values() || [])]) b?.destroy();
		this.snapBuffer = null; this.planes = null;
		this.sheet = d.createBuffer({label: 'Paint sheet', size: n * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		this.volume = d.createBuffer({label: 'Paint volume', size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		this.toothW = Math.ceil(width / TOOTH_TILE);
		const tiles = this.toothW * Math.ceil(height / TOOTH_TILE);
		this.tooth = d.createBuffer({label: 'Paint tooth', size: tiles * TOOTH_TILE * TOOTH_TILE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		this.toothSent.clear();
		d.queue.writeBuffer(this.info, 0, new Uint32Array([width, height, this.toothW, 0]));
		this._bind();
		this.allocated = {width, height, toothOX: this.record.toothOX, toothOY: this.record.toothOY};
		this.stale = {x0: 0, y0: 0, x1: width - 1, y1: height - 1};
	}
	_bind() {
		const d = this.device;
		this.scratch ??= d.createBuffer({label: 'Paint scratch', size: this.scratchBytes = 1 << 20, usage: GPUBufferUsage.STORAGE});
		this.bindGroup = d.createBindGroup({layout: this.programs.main, entries: [
			{binding: 0, resource: {buffer: this.sheet}}, {binding: 1, resource: {buffer: this.state}}, {binding: 2, resource: {buffer: this.tooth}},
			{binding: 3, resource: {buffer: this.volume}}, {binding: 4, resource: {buffer: this.dabsUniform, size: DAB_WORDS * 4}},
			{binding: 5, resource: {buffer: this.info}}, {binding: 6, resource: {buffer: this.programs.tables}}, {binding: 7, resource: {buffer: this.scratch}},
			{binding: 8, resource: {buffer: this.dabsUniform, size: RUN_MAX * DAB_STRIDE}}, {binding: 9, resource: {buffer: this.runsUniform, size: 32}}]});
	}
	_scratchFor(bytes) {
		if (bytes <= this.scratchBytes) return true;
		if (bytes > this.device.limits.maxStorageBufferBindingSize || bytes > this.device.limits.maxBufferSize) return false;
		this.flush();
		const old = this.scratch; this.scratch = this.device.createBuffer({label: 'Paint scratch', size: this.scratchBytes = Math.ceil(bytes / (1 << 20)) * (1 << 20), usage: GPUBufferUsage.STORAGE});
		this._bind(); old.destroy();
		return true;
	}
	markStale(box = {x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1}) {
		const s = this.stale;
		this.stale = s ? {x0: Math.min(s.x0, box.x0), y0: Math.min(s.y0, box.y0), x1: Math.max(s.x1, box.x1), y1: Math.max(s.y1, box.y1)} : {...box};
	}
	attach(record) { if (record !== this.record) { this.record = record; this.syncedRevision = -1; } this._watch(); }
	_watch() {
		const r = this.record; if (r.gpuWatch === this) return;
		const touch = Object.getPrototypeOf(r)._touch;
		Object.defineProperty(r, 'gpuWatch', {value: this, writable: true, configurable: true, enumerable: false});
		Object.defineProperty(r, '_touch', {configurable: true, writable: true, enumerable: false, value: (x0, y0, x1, y1) => {
			const before = r.revision; touch.call(r, x0, y0, x1, y1);
			if (r.gpuWatch === this && !this.committing && r.revision !== before) { this.markStale({x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(r.width - 1, x1), y1: Math.min(r.height - 1, y1)}); this.watchedRevision = r.revision; }
		}});
	}
	_sync() {
		const r = this.record, a = this.allocated;
		if (a.width !== r.width || a.height !== r.height || a.toothOX !== r.toothOX || a.toothOY !== r.toothOY) this._allocate();
		if (this.syncedRevision !== r.revision && this.watchedRevision !== r.revision) this.markStale();
		this.syncedRevision = r.revision;
		if (!this.stale) return;
		const box = this.stale; this.stale = null;
		if (r.revision === 0 && !r.volume && !this.uploadedOnce) { this.uploadedOnce = true; return; }
		this.uploadedOnce = true;
		const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, V = r.volume;
		if (w === r.width && h === r.height) {
			this.device.queue.writeBuffer(this.sheet, 0, r.data);
			this.device.queue.writeBuffer(this.volume, 0, V ? Uint32Array.from(V) : new Uint32Array(w * h));
			return;
		}
		const pixels = new Float32Array(w * h * 4), volume = new Uint32Array(w * h);
		for (let y = 0; y < h; y++) {
			const at = (box.y0 + y) * r.width + box.x0;
			pixels.set(r.data.subarray(at * 4, (at + w) * 4), y * w * 4);
			if (V) for (let x = 0; x < w; x++) volume[y * w + x] = V[at + x];
		}
		this._boxIO(box, 'unpack', pixels, volume);
	}
	_boxIO(box, entry, pixels = null, volume = null) {
		const d = this.device, w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, n = w * h;
		const spare = this.spareIO ??= [16, 4, 4].map(size => d.createBuffer({label: 'Paint spare io', size, usage: GPUBufferUsage.STORAGE}));
		const display = entry === 'packDisplay';
		const packed = display ? spare[0] : d.createBuffer({size: n * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		const packedVolume = display ? spare[1] : d.createBuffer({size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		const packedDisplay = display ? d.createBuffer({size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC}) : spare[2];
		if (pixels) { d.queue.writeBuffer(packed, 0, pixels); d.queue.writeBuffer(packedVolume, 0, volume); }
		const r = this.record, relief = entry === 'packDisplay' && r.volume ? 1 | (r.toothTiles ? 2 : 0) : 0;
		d.queue.writeBuffer(this.boxUniform, 0, new Uint32Array([box.x0, box.y0, w, h, relief, 0, 0, 0]));
		const io = d.createBindGroup({layout: this.programs.io, entries: [{binding: 0, resource: {buffer: this.boxUniform}}, {binding: 1, resource: {buffer: packed}}, {binding: 2, resource: {buffer: packedVolume}}, {binding: 3, resource: {buffer: packedDisplay}}]});
		const e = d.createCommandEncoder(), pass = e.beginComputePass();
		pass.setPipeline(this.programs[entry]); pass.setBindGroup(0, this.bindGroup, [0, 0, 0]); pass.setBindGroup(1, io);
		pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); pass.end();
		let read = null, readVolume = null;
		if (entry === 'packDisplay') {
			read = d.createBuffer({size: n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
			e.copyBufferToBuffer(packedDisplay, 0, read, 0, n * 4);
		}
		if (entry === 'pack') {
			read = d.createBuffer({size: n * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
			readVolume = d.createBuffer({size: n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
			e.copyBufferToBuffer(packed, 0, read, 0, n * 16); e.copyBufferToBuffer(packedVolume, 0, readVolume, 0, n * 4);
		}
		d.queue.submit([e.finish()]);
		for (const b of [packed, packedVolume, packedDisplay]) if (!spare.includes(b)) b.destroy();
		return read && {read, readVolume, w, h};
	}
	_toothFor(x0, y0, x1, y1) {
		const T = TOOTH_TILE, r = this.record;
		if (!r.toothTiles) { r.toothTilesW = Math.ceil(r.width / T); r.toothTiles = new Array(r.toothTilesW * Math.ceil(r.height / T)).fill(null); r._readout = null; }
		for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) {
			const at = ty * this.toothW + tx;
			if (this.toothSent.has(at)) continue;
			this.toothSent.add(at);
			(this.toothOwed ??= []).push(tx | ty << 16);
		}
	}
	_makeTooth(e) {
		const owed = this.toothOwed; if (!owed?.length) return;
		this.toothOwed = [];
		const d = this.device, r = this.record, list = d.createBuffer({size: owed.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		this.toothParams ??= d.createBuffer({size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		d.queue.writeBuffer(list, 0, Uint32Array.from(owed));
		d.queue.writeBuffer(this.toothParams, 0, new Int32Array([r.toothSeed | 0, r.toothOX, r.toothOY, this.toothW]));
		const group = d.createBindGroup({layout: this.programs.toothLayout, entries: [{binding: 0, resource: {buffer: this.tooth}}, {binding: 1, resource: {buffer: this.toothParams}}, {binding: 2, resource: {buffer: list}}]});
		const pass = e.beginComputePass(); pass.setPipeline(this.programs.toothTile); pass.setBindGroup(0, group); pass.dispatchWorkgroups(owed.length); pass.end();
		(this.transient ??= []).push(list);
	}
	engine(name) {
		this.engines ??= new Map();
		let e = this.engines.get(name);
		if (!e) {
			const factory = engines.get(name); if (!factory) throw new Error('No paint engine ' + name);
			const surface = this;
			e = factory({device: this.device, get sheet() { return surface.sheet; }, get width() { return surface.width; }, get height() { return surface.height; },
				get scale() { return surface.record.scale; }, get record() { return surface.record; }, flush: () => surface.flush(), extendBox: box => surface._grow(box),
				get volume() { return surface.volume; }, get tooth() { return surface.tooth; }, toothFor: box => surface._toothFor(box.x0, box.y0, box.x1, box.y1),
				plane: (plane, bytes = 4) => surface._plane(name + '.' + plane, bytes),
				snap: box => surface._snap(box)});
			this.engines.set(name, e);
			if (this.stroke) e.begin?.();
		}
		return e;
	}
	_plane(key, bytes) {
		this.planes ??= new Map();
		let b = this.planes.get(key);
		if (!b) { b = this.device.createBuffer({label: 'Paint plane ' + key, size: Math.max(4, this.width * this.height * bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST}); this.planes.set(key, b); }
		return b;
	}
	_snap(raw) {
		const W = this.width, H = this.height, T = 64;
		this.snapBuffer ??= this.device.createBuffer({label: 'Paint snap', size: W * H * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		const snapped = this.stroke ? (this.stroke.snapped ??= new Set()) : new Set();
		let e = null;
		for (let ty = Math.max(0, raw.y0) >> 6; ty <= Math.min(H - 1, raw.y1) >> 6; ty++) for (let tx = Math.max(0, raw.x0) >> 6; tx <= Math.min(W - 1, raw.x1) >> 6; tx++) {
			const key = tx | ty << 16; if (snapped.has(key)) continue; snapped.add(key);
			e ??= this.device.createCommandEncoder();
			const x0 = tx * T, w = Math.min(T, W - x0);
			for (let y = ty * T; y < Math.min(H, ty * T + T); y++) e.copyBufferToBuffer(this.sheet, (y * W + x0) * 16, this.snapBuffer, (y * W + x0) * 16, w * 16);
		}
		if (e) this.device.queue.submit([e.finish()]);
		return this.snapBuffer;
	}
	get _wetEngine() { return this.engines?.get('wet') || null; }
	drawWetDab(...args) { return this.engine('wet').drawWetDab(...args); }
	get wetPending() { return this._wetEngine?.wetPending || 0; }
	set wetPending(v) { const e = this._wetEngine || (v ? this.engine('wet') : null); if (e) e.wetPending = v; }
	get wetState() { return this._wetEngine?.state || null; }
	get wet() { return !!this._wetEngine?.wet; }
	settleWet(owed = true) { return this._wetEngine?.settleWet(owed) ?? false; }
	stepWet(dt, limit) { return this._wetEngine?.stepWet(dt, limit) ?? Promise.resolve(false); }
	composeWet() { return this._wetEngine?.composeWet() ?? false; }
	advanceWet(dt, limit) { return this._wetEngine?.advanceWet(dt, limit) ?? Promise.resolve(false); }
	dryWet(feed, slice) { return this._wetEngine?.dryWet(feed, slice) ?? Promise.resolve(true); }
	tilt(gx, gy) { this._wetEngine?.tilt(gx, gy); }
	_renderMask(...args) { return this.record._renderMask(...args); }
	discardWet() { this._wetEngine?.discard(); }
	open() {
		if (this.stroke) return;
		this._sync();
		this.stroke = {box: null, tiles: new Map(), reads: new Map(), frame: 0, inflight: []}; this.brush = null; this.dirty = null;
		for (const e of this.engines?.values() || []) e.begin?.();
	}
	cancel() {
		this.count = 0;
		const s = this.stroke; this.stroke = null; this.brush = null; this.dirty = null;
		if (s?.box) this.markStale(s.box);
	}
	async settle() {
		this.flush();
		for (const e of this.engines?.values() || []) await e.submit?.();
		if (this.device.paintError) { this.cancel(); throw failure('paint_gpu_lost', 'The GPU refused paint work: ' + this.device.paintError.message); }
		const s = this.stroke; if (!s) return null;
		this.stroke = null; this.dirty = null;
		let stateRead = null;
		const rest = [...s.tiles].filter(([k, v]) => !(s.reads.get(k)?.v >= v) || s.pending?.has(k)).map(([k]) => k);
		for (let i = 0; i < rest.length; i += 256) this._readTiles(rest.slice(i, i + 256), s);
		if (this.brush) {
			stateRead = this.device.createBuffer({size: STATE_BYTES, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
			const e = this.device.createCommandEncoder(); e.copyBufferToBuffer(this.state, 0, stateRead, 0, STATE_BYTES); this.device.queue.submit([e.finish()]);
		}
		let commit = null;
		try { await Promise.all(s.inflight); } catch (_) { this.lost ??= {reason: 'read'}; }
		if (this.lost || this.device.paintError) { stateRead?.destroy(); throw failure('paint_gpu_lost', 'The GPU stopped.'); }
		if (s.tiles.size) {
			const r = this.record, tiles = [];
			for (const k of [...s.tiles.keys()].sort((a, b) => a - b)) {
				const got = s.reads.get(k), x = (k & 65535) * 64, y = (k >>> 16) * 64, w = Math.min(64, r.width - x), h = Math.min(64, r.height - y);
				if (w <= 0 || h <= 0) continue;
				const tile = got.written ? null : this._writeTile(k, got);
				if (tile) tiles.push(tile);
				else { const pixels = new Float32Array(w * h * 4), volume = r.volume ? new Uint8Array(w * h) : null;
					for (let j = 0; j < h; j++) { pixels.set(got.pixels.subarray(j * 256, j * 256 + w * 4), j * w * 4); if (volume) for (let i = 0; i < w; i++) volume[j * w + i] = got.volume[j * 64 + i]; }
					tiles.push({x, y, w, h, pixels, volume}); }
			}
			commit = {box: s.box, tiles};
			this.syncedRevision = r.revision;
		}
		if (stateRead) {
			try { await stateRead.mapAsync(GPUMapMode.READ); } catch (_) { this.lost ??= {reason: 'read'}; throw failure('paint_gpu_lost', 'The GPU stopped.'); }
			const st = new Float32Array(stateRead.getMappedRange()), B = this.brush.buckets;
			for (let k = 0; k < BUCKETS; k++) for (let j = 0; j < 8; j++) B[k * BUCKET + j] = st[k * BUCKET + j];
			const H = this.brush.holdStore;
			if (H && H === this.holdStore) { H.amount.set(st.subarray(HOLD_AT, HOLD_AT + HOLD_CELLS)); H.colour.set(st.subarray(HOLD_AT + HOLD_CELLS * 2, HOLD_AT + HOLD_CELLS * 5)); }
			stateRead.unmap(); stateRead.destroy();
		}
		this.brush = null;
		return commit;
	}
	beginStroke() { const cp = this.record.beginStroke(); this.open(); return cp; }
	async endStroke(checkpoint, cancel = false) {
		if (cancel) this.cancel(); else await this.settle();
		return this.record.endStroke(checkpoint, cancel);
	}
	_readTiles(keys, s = this.stroke) {
		const d = this.device, n = keys.length;
		const list = d.createBuffer({size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		const packed = d.createBuffer({size: n * 4096 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC});
		const packedVolume = d.createBuffer({size: n * 4096 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC});
		const read = d.createBuffer({size: n * 4096 * 20, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
		d.queue.writeBuffer(list, 0, Uint32Array.from(keys));
		const io = d.createBindGroup({layout: this.programs.io, entries: [{binding: 0, resource: {buffer: this.boxUniform}}, {binding: 1, resource: {buffer: packed}}, {binding: 2, resource: {buffer: packedVolume}}, {binding: 3, resource: {buffer: list}}]});
		const e = d.createCommandEncoder(), pass = e.beginComputePass();
		pass.setPipeline(this.programs.packTiles); pass.setBindGroup(0, this.bindGroup, [0, 0, 0]); pass.setBindGroup(1, io); pass.dispatchWorkgroups(n); pass.end();
		e.copyBufferToBuffer(packed, 0, read, 0, n * 4096 * 16); e.copyBufferToBuffer(packedVolume, 0, read, n * 4096 * 16, n * 4096 * 4);
		d.queue.submit([e.finish()]); list.destroy(); packed.destroy(); packedVolume.destroy();
		const versions = keys.map(k => s.tiles.get(k));
		const done = read.mapAsync(GPUMapMode.READ).then(() => {
			const all = read.getMappedRange(), pix = new Float32Array(all, 0, n * 4096 * 4), vol = new Uint32Array(all, n * 4096 * 16, n * 4096);
			keys.forEach((k, t) => {
				const old = s.reads.get(k); if (old && old.v > versions[t]) return;
				const got = {v: versions[t], pixels: pix.slice(t * 16384, (t + 1) * 16384), volume: vol.slice(t * 4096, (t + 1) * 4096)};
				s.reads.set(k, got);
				if (this.stroke === s && !this.lost) { this._writeTile(k, got); got.written = true; }
			});
			read.unmap(); read.destroy();
		});
		const settled = done.catch(error => { this.lost ??= {reason: 'read'}; throw error; });
		settled.catch(() => {});
		s.inflight.push(settled);
		return settled;
	}
	_writeTile(k, got) {
		const r = this.record, x = (k & 65535) * 64, y = (k >>> 16) * 64, w = Math.min(64, r.width - x), h = Math.min(64, r.height - y);
		if (w <= 0 || h <= 0) return null;
		const pixels = new Float32Array(w * h * 4), volume = r.volume ? new Uint8Array(w * h) : null;
		for (let j = 0; j < h; j++) { pixels.set(got.pixels.subarray(j * 256, j * 256 + w * 4), j * w * 4); if (volume) for (let i = 0; i < w; i++) volume[j * w + i] = got.volume[j * 64 + i]; }
		const tile = {x, y, w, h, pixels, volume};
		this.committing = true; try { writeCommit(r, tile.volume || !r.volume ? {box: {x0: x, y0: y, x1: x + w - 1, y1: y + h - 1}, pixels, volume} : {box: {x0: x, y0: y, x1: x + w - 1, y1: y + h - 1}, pixels, volume: null}); } finally { this.committing = false; }
		return tile;
	}
	_readBehind() {
		const s = this.stroke; if (!s) return;
		const keys = [];
		for (const [k, v] of s.tiles) if (v < s.frame - 1 && !(s.reads.get(k)?.v >= v) && !s.pending?.has(k)) keys.push(k);
		if (!keys.length) return;
		const batch = keys.slice(0, 96);
		s.pending ??= new Set(); for (const k of batch) s.pending.add(k);
		this._readTiles(batch).then(() => { for (const k of batch) s.pending.delete(k); });
	}
	takeDirty() { const d = this.dirty; this.dirty = null; return d; }
	async readDisplay(box) {
		const r = this.record;
		if (r.volume && r.toothTiles) this._toothFor(Math.max(0, box.x0 - 1), Math.max(0, box.y0 - 1), Math.min(this.width - 1, box.x1 + 1), Math.min(this.height - 1, box.y1 + 1));
		await this.submitFrame();
		const {read, w, h} = this._boxIO(box, 'packDisplay');
		try { await read.mapAsync(GPUMapMode.READ); } catch (_) { this.lost ??= {reason: 'read'}; read.destroy(); return null; }
		const data = new Uint8ClampedArray(read.getMappedRange().slice(0)); read.unmap(); read.destroy();
		return {width: w, height: h, data};
	}
	_useBrush(brush) {
		if (this.brush === brush && this.brushEpoch === brush.bucketEpoch && this.holdStore === (brush.holdStore || null)) return;
		if (this.count) this.flush();
		if (this.brush && this.brush !== brush) this.stroke.brushes = [...(this.stroke.brushes || []), this.brush];
		this.brush = brush; this.brushEpoch = brush.bucketEpoch; this.holdStore = brush.holdStore || null;
		this.device.queue.writeBuffer(this.state, 0, new Float32Array(brush.buckets.subarray(0, BUCKET_WORDS)));
		const H = brush.holdStore;
		if (H) { const hold = new Float32Array(HOLD_WORDS); hold.set(H.amount, 0); hold.set(H.start, HOLD_CELLS); hold.set(H.colour, HOLD_CELLS * 2); this.device.queue.writeBuffer(this.state, HOLD_AT * 4, hold); }
	}
	_grow(raw) {
		const box = {x0: Math.max(0, raw.x0), y0: Math.max(0, raw.y0), x1: Math.min(this.width - 1, raw.x1), y1: Math.min(this.height - 1, raw.y1)};
		if (box.x1 < box.x0 || box.y1 < box.y0) return;
		const d = this.dirty;
		this.dirty = d ? {x0: Math.min(d.x0, box.x0), y0: Math.min(d.y0, box.y0), x1: Math.max(d.x1, box.x1), y1: Math.max(d.y1, box.y1)} : {...box};
		const s = this.stroke; if (!s) return;
		for (let ty = box.y0 >> 6; ty <= box.y1 >> 6; ty++) for (let tx = box.x0 >> 6; tx <= box.x1 >> 6; tx++) s.tiles.set(tx | ty << 16, s.frame);
		s.box = s.box ? {x0: Math.min(s.box.x0, box.x0), y0: Math.min(s.box.y0, box.y0), x1: Math.max(s.box.x1, box.x1), y1: Math.max(s.box.y1, box.y1)} : {...box};
	}
	reserve(n) { if (this.count + n > MAX_BATCH || (this.splits || 0) + n >= MAX_RUNS - 32) this.flush(); }
	queueDab(brush, d) {
		if (this._wetEngine?.state) this._wetEngine.settleWet();
		if (!this.stroke) throw new Error('A GPU dab needs an open stroke');
		if (brush) this._useBrush(brush);
		const sc = this.record.scale, x = d.x * sc, y = d.y * sc, radius = d.radius * sc;
		const hardness = clamp(d.hardness, 0, 1), softness = clamp(d.softness, 0, 1), opaque = clamp(d.opaque, 0, 1);
		if (radius < 0.1 || hardness === 0 || softness === 1 || opaque === 0) return false;
		const W = this.width, H = this.height, fringe = radius + 1;
		const x0 = Math.max(0, Math.floor(x - fringe)), y0 = Math.max(0, Math.floor(y - fringe)), x1 = Math.min(W - 1, Math.floor(x + fringe)), y1 = Math.min(H - 1, Math.floor(y + fringe));
		if ((x1 < x0 || y1 < y0) && !(d.flags & DAB.NO_STAMP)) return false;
		const colourPass = !!(d.flags & DAB.COLOUR);
		let px0 = 0, py0 = 0, pw = 0, ph = 0, prX = 0, prY = 0, pr = 0;
		if (d.flags & DAB.RESAMPLE) {
			prX = d.px * sc; prY = d.py * sc; pr = Math.max(1, d.pr * sc);
			const f = pr + 1;
			px0 = Math.max(0, Math.floor(prX - f)); py0 = Math.max(0, Math.floor(prY - f));
			const px1 = Math.min(W - 1, Math.floor(prX + f)), py1 = Math.min(H - 1, Math.floor(prY + f));
			pw = Math.max(0, px1 - px0 + 1); ph = Math.max(0, py1 - py0 + 1);
		}
		if (d.bite > 0) this._toothFor(x0, y0, x1, y1);
		if (this.count >= MAX_BATCH || this.splits >= MAX_RUNS - 32) { if (d.flags & DAB.REF) throw new Error('A hair outlived its colour record'); this.flush(); }
		if (d.flags & (DAB.OP | DAB.HOLD_STEP | DAB.UPDATE | DAB.RESAMPLE)) this.splits = (this.splits || 0) + 1;
		const i = this.count++, o = i * DAB_STRIDE / 4, F = this.batchF, U = this.batchU, I = this.batchI;
		let aspect = d.aspect; if (!(aspect >= 1)) aspect = 1;
		const rad = d.angle / 360 * 2 * Math.PI;
		U[o] = d.flags | (d.body > 0 ? DAB.BODY : 0); U[o + 1] = i; U[o + 2] = d.bucket || 0; F[o + 3] = clamp(Math.round(d.posterizeNum * 100), 1, 128);
		I[o + 4] = x0; I[o + 5] = y0; U[o + 6] = x1 - x0 + 1; U[o + 7] = y1 - y0 + 1;
		F[o + 8] = x; F[o + 9] = y; F[o + 10] = radius; F[o + 11] = aspect;
		F[o + 12] = Math.cos(rad); F[o + 13] = Math.sin(rad); F[o + 14] = hardness; F[o + 15] = softness;
		F[o + 16] = opaque; F[o + 17] = clamp(d.r, 0, 1); F[o + 18] = clamp(d.g, 0, 1); F[o + 19] = clamp(d.b, 0, 1);
		F[o + 20] = clamp(d.alpha, 0, 1); F[o + 21] = clamp(d.lockAlpha, 0, 1); F[o + 22] = clamp(d.colorize, 0, 1); F[o + 23] = clamp(d.posterize, 0, 1);
		F[o + 24] = clamp(d.paint, 0, 1); F[o + 25] = d.bite || 0; F[o + 26] = d.body || 0; F[o + 27] = d.smudge || 0;
		F[o + 28] = d.update || 0; F[o + 29] = d.lim || 0; F[o + 30] = d.erase || 0; F[o + 31] = d.chH || 0;
		F[o + 32] = d.chS || 0; F[o + 33] = d.chV || 0; F[o + 34] = d.chL || 0; F[o + 35] = d.chHslS || 0;
		F[o + 36] = prX; F[o + 37] = prY; F[o + 38] = pr; F[o + 39] = d.samplePaint ?? 0;
		I[o + 40] = px0; I[o + 41] = py0; U[o + 42] = pw; U[o + 43] = ph;
		U[o + 44] = d.ref ?? 0; F[o + 45] = d.tr ?? 1; F[o + 46] = d.tg ?? 1; F[o + 47] = d.tb ?? 1;
		F[o + 48] = d.holdVel ?? 0; U[o + 49] = d.col0 ?? 0; U[o + 50] = d.col1 ?? 0; U[o + 51] = d.op ?? 0;
		for (let k = 0; k < 8; k++) F[o + 52 + k] = d.ov?.[k] ?? 0;
		I[o + 60] = d.win?.[0] ?? 0; I[o + 61] = d.win?.[1] ?? 0; U[o + 62] = d.win?.[2] ?? 0; U[o + 63] = d.win?.[3] ?? 0;
		this.geometry[i] = [x1 - x0 + 1, y1 - y0 + 1, colourPass, !!(d.flags & DAB.NO_STAMP), !!(d.flags & DAB.HOLD_STEP), d.flags & DAB.OP ? d : null, x0, y0, colourPass && !(d.flags & (DAB.RESAMPLE | DAB.UPDATE))];
		if (d.body > 0 && !this.record.volume) this.record.volume = new Uint8Array(W * H);
		if (!(d.flags & DAB.NO_STAMP)) this._grow({x0, y0, x1, y1});
		return d.flags & DAB.NO_STAMP ? i : true;
	}
	_palette() {
		if (!this.paletteBuffer) {
			this.paletteBuffer = this.device.createBuffer({label: 'Paint palette', size: PALETTE_SLOTS * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
			this.paletteGroup = this.device.createBindGroup({layout: this.programs.paletteLayout, entries: [{binding: 0, resource: {buffer: this.paletteBuffer}}]});
		}
		return this.paletteGroup;
	}
	applyOp(op, x, y, radius, hardness, softness, aspect, angle, strength, dx, dy, seed, bucket) {
		if (this._wetEngine?.state) this._wetEngine.settleWet();
		const id = GPU_OPS[op]; if (!id) throw new Error('This operator is not on the GPU yet');
		strength = clamp(strength, 0, 1); hardness = clamp(hardness, 0, 1); softness = clamp(softness, 0, 1);
		if (!(radius > 0) || strength <= 0 || hardness === 0 || softness === 1) return false;
		const sc = this.record.scale; dx *= sc; dy *= sc;
		const R = radius * sc; if (R < 0.1) return false;
		const W = this.width, H = this.height, fringe = R + 1, X = x * sc, Y = y * sc;
		const x0 = Math.max(0, Math.floor(X - fringe)), y0 = Math.max(0, Math.floor(Y - fringe)), x1 = Math.min(W - 1, Math.floor(X + fringe)), y1 = Math.min(H - 1, Math.floor(Y + fringe));
		if (x1 < x0 || y1 < y0) return false;
		const w = x1 - x0 + 1, h = y1 - y0 + 1, body = this.record.volume ? 1 : 0;
		const st = this.record.opStats || (this.record.opStats = {dabs: 0, moved: 0, travel: 0, radius: 0, strength: 0, weakest: 1});
		st.dabs++; st.travel += Math.abs(dx) + Math.abs(dy); st.radius += R; st.strength += strength; if (strength < st.weakest) st.weakest = strength;
		const d = {x, y, radius, hardness, softness, aspect, angle, opaque: strength, r: 0, g: 0, b: 0, alpha: 1, lockAlpha: 0, colorize: 0, posterize: 0, posterizeNum: 0, paint: this.pigment ? 1 : 0,
			flags: DAB.OP | (body ? DAB.BODY : 0), op: id, ov: [], body: 0};
		this._toothFor(x0, y0, x1, y1);
		if (op === 'erode') {
			const r = clamp(Math.round(R * 0.05), 1, 6);
			d.win = [x0 - r, y0 - r, w + 2 * r, h + 2 * r]; d.ov[4] = r;
			if (!this._scratchFor(d.win[2] * d.win[3] * 16)) return false;
		} else if (op === 'smear') {
			const len = Math.hypot(dx, dy); if (!(len > 1e-3)) return false;
			const carry = (bucket?.[0] || 2.5) * R * Math.pow(strength, .75), keep = Math.exp(-len / Math.max(1e-3, carry));
			if (!(keep > 1e-3)) return false;
			const ix = Math.floor(dx), iy = Math.floor(dy), comb = clamp(bucket?.[1] || 0, 0, 1), soft = clamp(bucket?.[2] || 0, 0, 1) * R;
			d.win = [x0 - ix - 1, y0 - iy - 1, w + 1, h + 1];
			d.ov = [dx, dy, keep, comb, 1 / Math.max(.5, R * 0.09), 0, 0, 0.35 * (1 - comb)];
			d.bucket = Math.imul(seed | 0, 2654435761) >>> 0;
			let bytes = d.win[2] * d.win[3] * 16;
			if (soft >= 1) {
				const f = Math.max(2, Math.floor(soft / 3)), gw = Math.ceil(d.win[2] / f), gh = Math.ceil(d.win[3] / f);
				d.ov[5] = f; d.ov[6] = Math.max(1, Math.round(soft / f)); d.grid = [gw, gh]; bytes += gw * gh * 32;
			}
			if (!this._scratchFor(bytes)) return false;
		}
		if (op === 'posterize') {
			if (this.paletteStroke !== this.stroke) { this._palette(); this.flush(); this.device.queue.writeBuffer(this.paletteBuffer, 0, new Uint8Array(PALETTE_SLOTS * 16)); this.paletteStroke = this.stroke; }
			this.queueDab(null, {...d, poster: true});
			return true;
		}
		if (op === 'blend') {
			if (!this._scratchFor(w * h * BLEND_VEC * 16)) return false;
			const reach = Math.min(w, h) >> 1; let strides = 0;
			for (let s = 1; s <= reach; s <<= 1) strides++;
			if (strides < 1) strides = 1;
			const each = strength * 2.0 / strides, passes = [{pass: 'blendRead'}];
			for (let s = 1; s <= reach || s === 1; s <<= 1) {
				for (const vertical of [0, 1]) for (const parity of [0, 1]) passes.push({pass: 'blendTrade', win: [0, 0, s, 0], ov: [0, 0, 0, 0, each, vertical, parity, 0]});
				if (s > reach) break;
			}
			passes.push({pass: 'blendWrite'});
			this.reserve(passes.length);
			for (const extra of passes) this.queueDab(null, {...d, ...extra, ov: extra.ov || d.ov});
			return true;
		}
		this.queueDab(null, d);
		return true;
	}
	drawDab(x, y, radius, r, g, b, opaque, hardness, softness, alpha, aspect, angle, lockAlpha, colorize, posterize, posterizeNum, paint) {
		const H = this.hold;
		if (H) {
			const k = this.holdKit, t = H.tint, ref = k.flags & DAB.COLOUR ? this.holdRef : -1;
			return this.queueDab(null, {...k, x, y, radius, hardness, softness, aspect, angle, opaque, alpha, lockAlpha, colorize, posterize, posterizeNum, paint,
				bite: this.bite || 0, body: this.body || 0, flags: (k.flags & ~(DAB.UPDATE | DAB.RESAMPLE | DAB.NO_STAMP | DAB.HOLD_STEP)) | DAB.COLOUR | DAB.HOLD_COLOUR | (ref >= 0 ? DAB.REF : 0), ref: Math.max(0, ref),
				smudge: k.smudge, holdVel: H.velocity, col0: H.col0 ?? 0, col1: H.col1 ?? HOLD_N, tr: t ? t.tr : 1, tg: t ? t.tg : 1, tb: t ? t.tb : 1});
		}
		const ref = this.hairRef ?? -1;
		return this.queueDab(null, {x, y, radius, hardness, softness, aspect, angle, opaque, r, g, b, alpha, lockAlpha, colorize, posterize, posterizeNum, paint,
			bite: this.bite || 0, body: this.body || 0, flags: ref >= 0 ? DAB.REF : 0, ref: Math.max(0, ref), tr: r * 2, tg: g * 2, tb: b * 2});
	}
	flush() {
		const n = this.count; if (!n) return;
		const d = this.device, p = this.programs;
		d.queue.writeBuffer(this.dabsUniform, 0, this.batch, 0, n * DAB_STRIDE);
		const stamp = this.timing && d.features.has('timestamp-query') ? this._stamp() : null;
		const e = d.createCommandEncoder();
		this._makeTooth(e);
		const pass = e.beginComputePass(stamp ? {timestampWrites: {querySet: stamp.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1}} : undefined), runs = new Uint32Array(this.runs), runsI = new Int32Array(this.runs);
		let runCount = 0;
		const single = (name, i, x, y) => { pass.setPipeline(p[name]); pass.setBindGroup(0, this.bindGroup, [i * DAB_STRIDE, 0, 0]); pass.dispatchWorkgroups(x, y); };
		let first = -1, last = -1, colours = false, chain = false;
		const close = () => {
			if (first < 0) return;
			for (let c = first; c <= last;) {
				let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, area = 0, count = 0;
				const room = this.splitRuns !== false && runCount + 64 < MAX_RUNS;
				for (let k = c; k <= last && count < RUN_MAX; k++) {
					const g = this.geometry[k];
					if (!(g[3] || g[5])) {
						const nx0 = Math.min(x0, g[6]), ny0 = Math.min(y0, g[7]), nx1 = Math.max(x1, g[6] + g[0] - 1), ny1 = Math.max(y1, g[7] + g[1] - 1), a = g[0] * g[1];
						if (room && count >= 8 && (nx1 - nx0 + 1) * (ny1 - ny0 + 1) > 4 * (area + a)) break;
						x0 = nx0; y0 = ny0; x1 = nx1; y1 = ny1; area += a;
					}
					count++;
				}
				const slot = runCount++, o = slot * RUN_STRIDE / 4, at = c * DAB_STRIDE;
				c += count;
				runs[o] = count;
				if (chain) { pass.setPipeline(p.pickupChain); pass.setBindGroup(0, this.bindGroup, [0, at, slot * RUN_STRIDE]); pass.dispatchWorkgroups(1); }
				if (colours) { pass.setPipeline(p.pickupMany); pass.setBindGroup(0, this.bindGroup, [0, at, slot * RUN_STRIDE]); pass.dispatchWorkgroups(count); }
				if (x1 < 0) continue;
				runs[o] = count; runsI[o + 1] = x0; runsI[o + 2] = y0; runs[o + 3] = x1 - x0 + 1; runs[o + 4] = y1 - y0 + 1;
				pass.setPipeline(p.stampRun); pass.setBindGroup(0, this.bindGroup, [0, at, slot * RUN_STRIDE]);
				pass.dispatchWorkgroups(Math.ceil((x1 - x0 + 1) / 8), Math.ceil((y1 - y0 + 1) / 8));
			}
			first = last = -1; colours = false; chain = false;
		};
		for (let i = 0; i < n; i++) {
			const [w, h, colour, noStamp, holdStep, op, , , independent] = this.geometry[i];
			if (op) {
				close();
				const at = [i * DAB_STRIDE, 0, 0], run = (name, x, y) => { pass.setPipeline(p[name]); pass.setBindGroup(0, this.bindGroup, at); pass.dispatchWorkgroups(Math.ceil(x / 8), Math.ceil(y / 8)); };
				if (op.poster) {
					pass.setBindGroup(1, p.emptyGroup); pass.setBindGroup(2, this._palette());
					const q = p.posterize();
					for (const name of ['posterClaim', 'posterSettle', 'posterMark', 'posterWrite']) { pass.setPipeline(q[name]); pass.setBindGroup(0, this.bindGroup, at); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); }
					continue;
				}
				if (op.pass) { run(op.pass, w, h); continue; }
				if (op.win) run('opSnap', op.win[2], op.win[3]);
				if (op.grid) { run('opGrid', op.grid[0], op.grid[1]); run('opBlurRows', op.grid[0], op.grid[1]); run('opBlurCols', op.grid[0], op.grid[1]); }
				run('opApply', w, h);
				continue;
			}
			const chained = colour && !independent && !holdStep && (this.batchU[i * DAB_STRIDE / 4] & DAB.RESAMPLE) === 0;
			if (chained) {
				if (colours) close();
				if (first < 0) first = i;
				last = i;
				chain = true; continue;
			}
			if ((colour && !independent) || holdStep) {
				close();
				if (colour) single('pickup', i, 1, 1);
				if (holdStep) single('holdStep', i, 1, 1);
				if (noStamp) continue;
				first = last = i; continue;
			}
			if (first < 0) first = i;
			last = i;
			if (colour) colours = true;
		}
		close();
		pass.end();
		d.queue.writeBuffer(this.runsUniform, 0, this.runs, 0, Math.max(1, runCount) * RUN_STRIDE);
		if (stamp) { e.resolveQuerySet(stamp.set, 0, 2, stamp.resolve, 0); e.copyBufferToBuffer(stamp.resolve, 0, stamp.read, 0, 16); }
		d.queue.submit([e.finish()]);
		for (const b of this.transient?.splice(0) || []) b.destroy();
		if (stamp) this.stamps.push(stamp.read.mapAsync(GPUMapMode.READ).then(() => { const t = new BigInt64Array(stamp.read.getMappedRange()); this.gpuNs += Number(t[1] - t[0]); stamp.read.unmap(); this.stampFree.push(stamp); }));
		this.count = 0; this.splits = 0; this.dabsSubmitted = (this.dabsSubmitted || 0) + n;
	}
	_stamp() {
		this.stamps ??= []; this.stampFree ??= []; this.gpuNs ??= 0;
		return this.stampFree.pop() || {set: this.device.createQuerySet({type: 'timestamp', count: 2}),
			resolve: this.device.createBuffer({size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC}),
			read: this.device.createBuffer({size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST})};
	}
	async takeGpuMs() { const pending = this.stamps || []; this.stamps = []; await Promise.all(pending); const ms = (this.gpuNs || 0) / 1e6; this.gpuNs = 0; return ms; }
	submitFrame() {
		this.flush();
		if (this.stroke) { this.stroke.frame++; this._readBehind(); }
		return Promise.all([...(this.engines?.values() || [])].map(e => e.submit?.()));
	}
	async fence() {
		const d = this.device, b = d.createBuffer({size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
		const e = d.createCommandEncoder(); e.copyBufferToBuffer(this.info, 0, b, 0, 4); d.queue.submit([e.finish()]);
		await b.mapAsync(GPUMapMode.READ); b.unmap(); b.destroy();
	}
	async readSheet(box = {x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1}) {
		this.flush();
		const {read, readVolume, w, h} = this._boxIO(box, 'pack');
		await read.mapAsync(GPUMapMode.READ);
		const out = new Float32Array(read.getMappedRange().slice(0)); read.unmap(); read.destroy(); readVolume.destroy();
		return {width: w, height: h, data: out};
	}
	destroy() { for (const b of [this.sheet, this.volume, this.tooth, this.state, this.info, this.boxUniform, this.dabsUniform, this.snapBuffer, ...(this.spareIO || []), ...(this.planes?.values() || [])]) b?.destroy(); }
}

export function writeCommit(r, commit) {
	if (commit.tiles) {
		for (const t of commit.tiles) writeCommit(r, {box: {x0: t.x, y0: t.y, x1: t.x + t.w - 1, y1: t.y + t.h - 1}, pixels: t.pixels, volume: t.volume});
		return;
	}
	const {box, pixels, volume} = commit;
	const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
	r._keepStrokePixels?.(box.x0, box.y0, box.x1, box.y1);
	if (volume && !r.volume) r.volume = new Uint8Array(r.width * r.height);
	for (let y = 0; y < h; y++) {
		const at = (box.y0 + y) * r.width + box.x0;
		r.data.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), at * 4);
		if (volume) r.volume.set(volume.subarray(y * w, (y + 1) * w), at);
	}
	r._touch(box.x0, box.y0, box.x1, box.y1);
}
