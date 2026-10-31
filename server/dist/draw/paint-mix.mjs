// SPDX-License-Identifier: AGPL-3.0-only

export const MIX_CHANNELS = 8;
const MIX_GRAY = 2e-4;
export const MIX_STRENGTH = 1, MIX_KEEP = .3, MIX_DARKEN = 1.25;
export const MIX_CANCEL = .2, MIX_CANCEL_TOP = .5;
export const MIX_OPPOSED_FROM = -.78, MIX_OPPOSED_TO = -.92, MIX_OPPOSED_MIN = .0005;
export const MIX_WHEEL = [[1, -15], [29, 0], [53, 50], [110, 120], [142, 165], [160, 192], [195, 214], [239, 227], [264, 240], [294, 280], [328, 320], [361, 345]];

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const HUE = MIX_WHEEL.map(a => a[0] * DEG), WHEEL = MIX_WHEEL.map(a => a[1] * DEG);
const wrap = (x, lo) => { x = (x - lo) % TAU; return (x < 0 ? x + TAU : x) + lo; };
function piecewise(x, xs, ys) {
	x = wrap(x, xs[0]);
	let i = 1;
	while (i < xs.length - 1 && x > xs[i]) i++;
	return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
}
export const hueToWheel = h => piecewise(h, HUE, WHEEL);
export const wheelToHue = w => piecewise(w, WHEEL, HUE);

export function linearToOklab(r, g, b, out) {
	const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
	const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
	const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
	out[0] = .2104542553 * l + .793617785 * m - .0040720468 * s;
	out[1] = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
	out[2] = .0259040371 * l + .7827717662 * m - .808675766 * s;
	return out;
}
export function oklabToLinear(L, a, b, out) {
	const l1 = L + .3963377774 * a + .2158037573 * b, m1 = L - .1055613458 * a - .0638541728 * b, s1 = L - .0894841775 * a - 1.291485548 * b;
	const l = l1 * l1 * l1, m = m1 * m1 * m1, s = s1 * s1 * s1;
	out[0] = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s;
	out[1] = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s;
	out[2] = -.0041960863 * l - .7034186147 * m + 1.707614701 * s;
	return out;
}

const lab = new Float64Array(3), rgb = new Float64Array(3);
export function mixState(r, g, b, out, offset = 0, weight = 1) {
	linearToOklab(clamp01(r), clamp01(g), clamp01(b), lab);
	const L = lab[0], C0 = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]), C = C0 < MIX_GRAY ? 0 : C0, s = Math.exp(-MIX_STRENGTH * L);
	const w = C > 0 ? hueToWheel(Math.atan2(lab[2], lab[1])) : 0, sc = s * C;
	out[offset] = weight; out[offset + 1] = weight * L; out[offset + 2] = weight * s;
	out[offset + 3] = weight * sc * Math.cos(w); out[offset + 4] = weight * sc * Math.sin(w);
	out[offset + 5] = weight * sc;
	out[offset + 6] = weight * sc * Math.cos(2 * w); out[offset + 7] = weight * sc * Math.sin(2 * w);
	return out;
}
function opposition(z, offset) {
	const sc = z[offset + 5]; if (!(sc > 0)) return 1;
	const m1x = z[offset + 3] / sc, m1y = z[offset + 4] / sc, m2x = z[offset + 6] / sc, m2y = z[offset + 7] / sc;
	const a = 1 - (m1x * m1x + m1y * m1y), b = 1 - (m2x * m2x + m2y * m2y);
	if (a < MIX_OPPOSED_MIN) return 1;
	const c = Math.max(-1, Math.min(1, b / (2 * a) - 1));
	return 1 + (c - 1) * smooth(MIX_OPPOSED_MIN, 4 * MIX_OPPOSED_MIN, a);
}

const inGamut = (r, g, b) => r >= -1e-7 && g >= -1e-7 && b >= -1e-7 && r <= 1 + 1e-7 && g <= 1 + 1e-7 && b <= 1 + 1e-7;
export function mixLab(z, out, offset = 0) {
	const W = z[offset], s = z[offset + 2];
	let L = W > 0 ? z[offset + 1] / W : 0, C = 0, h = 0;
	if (s > 0) {
		const vx = z[offset + 3] / s, vy = z[offset + 4] / s, mean = z[offset + 5] / s;
		const v = Math.sqrt(vx * vx + vy * vy);
		if (mean > 1e-9) {
			const rho = Math.min(1, v / mean), x = Math.min(1, Math.max(0, (rho - MIX_CANCEL) / (MIX_CANCEL_TOP - MIX_CANCEL)));
			C = mean * Math.pow(rho, MIX_KEEP) * x * x * (3 - 2 * x);
			L -= MIX_DARKEN * Math.max(0, mean - v);
			h = wheelToHue(Math.atan2(vy, vx));
		}
	}
	out[0] = clamp01(L); out[1] = C * Math.cos(h); out[2] = C * Math.sin(h);
	return out;
}
function labToGamut(L, a, b, out) {
	oklabToLinear(L, a, b, rgb);
	if (!inGamut(rgb[0], rgb[1], rgb[2])) {
		const C = Math.sqrt(a * a + b * b), ca = C > 0 ? a / C : 1, sa = C > 0 ? b / C : 0;
		let lo = 0, hi = C;
		for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; oklabToLinear(L, m * ca, m * sa, rgb); if (inGamut(rgb[0], rgb[1], rgb[2])) lo = m; else hi = m; }
		oklabToLinear(L, lo * ca, lo * sa, rgb);
	}
	out[0] = clamp01(rgb[0]); out[1] = clamp01(rgb[1]); out[2] = clamp01(rgb[2]);
	return out;
}
const wlab = new Float64Array(3);
export function mixColor(z, out, offset = 0) { mixLab(z, wlab, offset); return labToGamut(wlab[0], wlab[1], wlab[2], out); }

export const MIX_RESCUE_FROM = .1, MIX_RESCUE_TO = .7, MIX_RESCUE_VALUE = .5, MIX_RESCUE_NEUTRAL = .03;
const kmLab = new Float64Array(3), wheelRgb = new Float64Array(3);
const smooth = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
export function mixRescue(km, z, out, offset = 0) {
	linearToOklab(clamp01(km[0]), clamp01(km[1]), clamp01(km[2]), kmLab);
	const ck = Math.sqrt(kmLab[1] * kmLab[1] + kmLab[2] * kmLab[2]), s = z[offset + 2];
	const bound = s > 0 ? z[offset + 5] / s : 0;
	if (ck >= (1 - MIX_RESCUE_FROM) * bound) { out[0] = clamp01(km[0]); out[1] = clamp01(km[1]); out[2] = clamp01(km[2]); return out; }
	mixColor(z, wheelRgb, offset);
	linearToOklab(wheelRgb[0], wheelRgb[1], wheelRgb[2], lab);
	const cw = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
	const q = smooth(MIX_OPPOSED_FROM, MIX_OPPOSED_TO, opposition(z, offset));
	const k = cw > 1e-4 ? smooth(MIX_RESCUE_FROM, MIX_RESCUE_TO, (cw - ck) / cw) * smooth(MIX_RESCUE_NEUTRAL, 2 * MIX_RESCUE_NEUTRAL, cw) * (1 - q) : 0;
	let L = kmLab[0] + (lab[0] - kmLab[0]) * k * MIX_RESCUE_VALUE, a = kmLab[1] + (lab[1] - kmLab[1]) * k, b = kmLab[2] + (lab[2] - kmLab[2]) * k;
	const rho = bound > 0 ? Math.sqrt(z[offset + 3] * z[offset + 3] + z[offset + 4] * z[offset + 4]) / z[offset + 5] : 1;
	const kc = q * (1 - Math.min(1, rho)) ** 2 * smooth(MIX_RESCUE_NEUTRAL, 2 * MIX_RESCUE_NEUTRAL, bound);
	if (kc > 0) { if (lab[0] < L) L += (lab[0] - L) * kc * MIX_RESCUE_VALUE; a *= 1 - kc * MIX_RESCUE_VALUE; b *= 1 - kc * MIX_RESCUE_VALUE; }
	if (k === 0 && kc === 0) { out[0] = clamp01(km[0]); out[1] = clamp01(km[1]); out[2] = clamp01(km[2]); return out; }
	return labToGamut(L, a, b, out);
}

const za = new Float64Array(MIX_CHANNELS), zb = new Float64Array(MIX_CHANNELS);
export function mixLinear(ar, ag, ab, br, bg, bb, t, out) {
	t = clamp01(t);
	if (t === 0) { out[0] = ar; out[1] = ag; out[2] = ab; return out; }
	if (t === 1) { out[0] = br; out[1] = bg; out[2] = bb; return out; }
	mixState(ar, ag, ab, za); mixState(br, bg, bb, zb);
	for (let i = 0; i < MIX_CHANNELS; i++) za[i] += (zb[i] - za[i]) * t;
	return mixColor(za, out);
}

const srgbToLinear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const linearToSrgb = x => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
const parseHex = h => [1, 3, 5].map(i => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
export const linearToHex = c => '#' + Array.from(c, x => Math.round(linearToSrgb(clamp01(x)) * 255).toString(16).padStart(2, '0')).join('');
export function mixHex(a, b, t) { return linearToHex(mixLinear(...parseHex(a), ...parseHex(b), t, [0, 0, 0])); }

const wgslArray = (name, values) => `const ${name} = array<f32, ${values.length}>(${values.map(v => v.toFixed(9)).join(', ')});`;
export const PAINT_MIX_WGSL = `
${wgslArray('MIX_HUE', HUE)}
${wgslArray('MIX_WHEEL', WHEEL)}
const MIX_TAU = ${TAU.toFixed(9)};
fn mixWrap(x: f32, lo: f32) -> f32 { let y = x - lo; return y - floor(y / MIX_TAU) * MIX_TAU + lo; }
fn mixHueToWheel(h0: f32) -> f32 {
	let h = mixWrap(h0, MIX_HUE[0]); var i = 1u;
	loop { if (i >= ${HUE.length - 1}u || h <= MIX_HUE[i]) { break; } i++; }
	return MIX_WHEEL[i - 1u] + (MIX_WHEEL[i] - MIX_WHEEL[i - 1u]) * (h - MIX_HUE[i - 1u]) / (MIX_HUE[i] - MIX_HUE[i - 1u]);
}
fn mixWheelToHue(w0: f32) -> f32 {
	let w = mixWrap(w0, MIX_WHEEL[0]); var i = 1u;
	loop { if (i >= ${HUE.length - 1}u || w <= MIX_WHEEL[i]) { break; } i++; }
	return MIX_HUE[i - 1u] + (MIX_HUE[i] - MIX_HUE[i - 1u]) * (w - MIX_WHEEL[i - 1u]) / (MIX_WHEEL[i] - MIX_WHEEL[i - 1u]);
}
fn mixOklab(c0: vec3f) -> vec3f {
	let c = clamp(c0, vec3f(0.0), vec3f(1.0));
	let lms = vec3f(dot(c, vec3f(0.4122214708, 0.5363325363, 0.0514459929)), dot(c, vec3f(0.2119034982, 0.6806995451, 0.1073969566)), dot(c, vec3f(0.0883024619, 0.2817188376, 0.6299787005)));
	let q = sign(lms) * pow(abs(lms), vec3f(1.0 / 3.0));
	return vec3f(dot(q, vec3f(0.2104542553, 0.793617785, -0.0040720468)), dot(q, vec3f(1.9779984951, -2.428592205, 0.4505937099)), dot(q, vec3f(0.0259040371, 0.7827717662, -0.808675766)));
}
fn mixLinearOf(L: f32, a: f32, b: f32) -> vec3f {
	let l = L + 0.3963377774 * a + 0.2158037573 * b; let m = L - 0.1055613458 * a - 0.0638541728 * b; let s = L - 0.0894841775 * a - 1.291485548 * b;
	let q = vec3f(l * l * l, m * m * m, s * s * s);
	return vec3f(dot(q, vec3f(4.0767416621, -3.3077115913, 0.2309699292)), dot(q, vec3f(-1.2684380046, 2.6097574011, -0.3413193965)), dot(q, vec3f(-0.0041960863, -0.7034186147, 1.707614701)));
}
struct MixState { a: vec4f, b: vec4f };
fn mixState(c: vec3f) -> MixState { return mixStateWeighted(c, 1.0); }
fn mixStateWeighted(c: vec3f, weight: f32) -> MixState {
	let o = mixOklab(c); var C = length(o.yz); if (C < ${MIX_GRAY}) { C = 0.0; } let s = exp(-${MIX_STRENGTH.toFixed(9)} * o.x);
	var w = 0.0; if (C > 0.0) { w = mixHueToWheel(atan2(o.z, o.y)); }
	let sc = s * C;
	return MixState(weight * vec4f(1.0, o.x, s, sc * cos(w)), weight * vec4f(sc * sin(w), sc, sc * cos(2.0 * w), sc * sin(2.0 * w)));
}
fn mixOpposition(z: MixState) -> f32 {
	let sc = z.b.y; if (!(sc > 0.0)) { return 1.0; }
	let m1 = vec2f(z.a.w, z.b.x) / sc; let m2 = z.b.zw / sc;
	let a = 1.0 - dot(m1, m1); let b = 1.0 - dot(m2, m2);
	if (a < ${MIX_OPPOSED_MIN}) { return 1.0; }
	let c = clamp(b / (2.0 * a) - 1.0, -1.0, 1.0);
	return 1.0 + (c - 1.0) * smoothstep(${MIX_OPPOSED_MIN}, ${4 * MIX_OPPOSED_MIN}, a);
}
fn mixInGamut(c: vec3f) -> bool { return all(c >= vec3f(-1e-5)) && all(c <= vec3f(1.0 + 1e-5)); }
fn mixLab(z: MixState) -> vec3f {
	let s = z.a.z; var L = 0.0; if (z.a.x > 0.0) { L = z.a.y / z.a.x; } var C = 0.0; var h = 0.0;
	if (s > 0.0) {
		let vx = z.a.w / s; let vy = z.b.x / s; let mean = z.b.y / s;
		let v = length(vec2f(vx, vy));
		if (mean > 1e-9) {
			let rho = min(1.0, v / mean);
			C = mean * pow(rho, ${MIX_KEEP.toFixed(9)}) * smoothstep(${MIX_CANCEL.toFixed(9)}, ${MIX_CANCEL_TOP.toFixed(9)}, rho);
			L -= ${MIX_DARKEN.toFixed(9)} * max(0.0, mean - v);
			h = mixWheelToHue(atan2(vy, vx));
		}
	}
	return vec3f(clamp(L, 0.0, 1.0), C * cos(h), C * sin(h));
}
fn mixGamut(o: vec3f) -> vec3f {
	var rgb = mixLinearOf(o.x, o.y, o.z);
	if (!mixInGamut(rgb)) {
		let C = length(o.yz); var dir = vec2f(1.0, 0.0); if (C > 0.0) { dir = o.yz / C; }
		var lo = 0.0; var hi = C;
		for (var i = 0; i < 8; i++) { let m = 0.5 * (lo + hi); if (mixInGamut(mixLinearOf(o.x, m * dir.x, m * dir.y))) { lo = m; } else { hi = m; } }
		rgb = mixLinearOf(o.x, lo * dir.x, lo * dir.y);
	}
	return clamp(rgb, vec3f(0.0), vec3f(1.0));
}
fn mixColor(z: MixState) -> vec3f { return mixGamut(mixLab(z)); }
fn mixRescue(km0: vec3f, z: MixState) -> vec3f {
	let km = clamp(km0, vec3f(0.0), vec3f(1.0));
	let k0 = mixOklab(km); let ck = length(k0.yz);
	var bound = 0.0; if (z.a.z > 0.0) { bound = z.b.y / z.a.z; }
	if (ck >= ${(1 - MIX_RESCUE_FROM).toFixed(9)} * bound) { return km; }
	let w = mixOklab(mixColor(z)); let cw = length(w.yz);
	let q = smoothstep(${MIX_OPPOSED_FROM.toFixed(9)}, ${MIX_OPPOSED_TO.toFixed(9)}, mixOpposition(z));
	var k = 0.0; if (cw > 1e-4) { k = smoothstep(${MIX_RESCUE_FROM.toFixed(9)}, ${MIX_RESCUE_TO.toFixed(9)}, (cw - ck) / cw) * smoothstep(${MIX_RESCUE_NEUTRAL.toFixed(9)}, ${(2 * MIX_RESCUE_NEUTRAL).toFixed(9)}, cw) * (1.0 - q); }
	var L = k0.x + (w.x - k0.x) * k * ${MIX_RESCUE_VALUE.toFixed(9)}; var ab = k0.yz + (w.yz - k0.yz) * k;
	var rho = 1.0; if (bound > 0.0) { rho = length(vec2f(z.a.w, z.b.x)) / z.b.y; }
	let kc = q * (1.0 - min(1.0, rho)) * (1.0 - min(1.0, rho)) * smoothstep(${MIX_RESCUE_NEUTRAL.toFixed(9)}, ${(2 * MIX_RESCUE_NEUTRAL).toFixed(9)}, bound);
	if (kc > 0.0) { if (w.x < L) { L += (w.x - L) * kc * ${MIX_RESCUE_VALUE.toFixed(9)}; } ab *= 1.0 - kc * ${MIX_RESCUE_VALUE.toFixed(9)}; }
	if (k <= 0.0 && kc <= 0.0) { return km; }
	return mixGamut(vec3f(L, ab));
}
fn mixAdd(x: MixState, y: MixState, t: f32) -> MixState { return MixState(mix(x.a, y.a, t), mix(x.b, y.b, t)); }
fn mixLinear(a: vec3f, b: vec3f, tIn: f32) -> vec3f {
	let t = clamp(tIn, 0.0, 1.0);
	if (t <= 0.0) { return a; } if (t >= 1.0) { return b; }
	return mixColor(mixAdd(mixState(a), mixState(b), t));
}
`;
