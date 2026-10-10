// SPDX-License-Identifier: AGPL-3.0-only
// Live Liquid light: the reference steps on WebGPU. The caller shows the saved still when WebGPU
// is missing. Nothing here becomes drawing data.
import { liquidPhysics, LIQUID_GRID, LIQUID_JACOBI, LIQUID_STILL_STEP } from './liquid.mjs';

// Pixels for the picture loop and for the shaded output; the compositor scales the rest.
export const LIQUID_DYE_PIXELS = 480 * 1024;
export const LIQUID_OUTPUT_PIXELS = 1024 * 1024;

// One uniform block for every pass. Slot layout, as vec4s:
// 0 nx ny cell dt | 1 dx dy time seed | 2 cx cy frequency amplitude | 3 swirl relax confine fade
// 4 w h texel dispersion | 5 cos sin shrink sharpen | 6 refresh focus inward cycle
// 7 refract spread iridescence film | 8 sheen tint bands strength | 9-12 palette | 13 reach drift outW outH | 14 half vector
// 15 seed as two exact 16-bit halves, fill
function uniforms(p, state, out) {
	const { nx, ny, cell, w, h, dx, dy } = state, dt = state.dt, texel = dx / w;
	const a = -p.spin * dt, hl = Math.sqrt(.45 * .45 + .6 * .6 + 1.66 * 1.66);
	const rows = [
		[nx, ny, cell, dt], [dx, dy, state.time, 0], [p.cx * dx, p.cy * dy, p.frequency, p.turbulence / p.frequency],
		[p.swirl, p.relax, p.confine, 1 / (1 + p.damping * dt)], [w, h, texel, p.dispersion],
		[Math.cos(a), Math.sin(a), 1 / (1 + p.zoom * dt), p.detail], [p.refresh, p.focus, p.zoom < 0 ? 1 : 0, p.cycle],
		[p.refract, p.spread, p.iridescence, p.film], [p.sheen, p.tint, p.bands, p.strength],
		...p.stops.map(c => [c[0], c[1], c[2], 0]), [Math.max(1, .004 / texel), state.time * .15, state.outW, state.outH],
		[-.45 / hl, -.6 / hl, 1.66 / hl, 0], [Math.floor(p.seed / 65536), p.seed % 65536, p.fill, 0],
	];
	rows.forEach((row, i) => out.set(row, i * 4));
	return out;
}

// ---- Shader bodies. The reference in liquid.mjs is the law. ----

const WGSL_HEAD = /* wgsl */`
struct U { v: array<vec4<f32>, 16> };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var mirrorSampler: sampler;
@group(0) @binding(2) var clampSampler: sampler;
@group(0) @binding(3) var t0: texture_2d<f32>;
@group(0) @binding(4) var t1: texture_2d<f32>;
@group(0) @binding(5) var t2: texture_2d<f32>;
@group(0) @binding(6) var t3: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
 let p = array<vec2<f32>, 3>(vec2<f32>(-1., -1.), vec2<f32>(3., -1.), vec2<f32>(-1., 3.));
 return vec4<f32>(p[i], 0., 1.);
}
fn grid() -> vec2<i32> { return vec2<i32>(i32(u.v[0].x), i32(u.v[0].y)); }
fn cellAt(t: texture_2d<f32>, q: vec2<i32>) -> vec4<f32> { return textureLoad(t, clamp(q, vec2<i32>(0), grid() - vec2<i32>(1)), 0); }
fn hash3(i: i32, j: i32, k: i32, salt: u32) -> f32 {
 var v = (bitcast<u32>(i) * 374761393u) ^ (bitcast<u32>(j) * 668265263u) ^ (bitcast<u32>(k) * 1440662683u) ^ ((u32(u.v[15].x) * 65536u + u32(u.v[15].y) + salt) * 2246822519u);
 v = (v ^ (v >> 13u)) * 1274126177u;
 return f32(v ^ (v >> 16u)) / 4294967296.;
}
fn quintic(t: vec3<f32>) -> vec3<f32> { return t * t * t * (t * (t * 6. - 15.) + 10.); }
fn noise(p: vec3<f32>, salt: u32) -> f32 {
 let c = floor(p); let f = quintic(p - c); let i = i32(c.x); let j = i32(c.y); let k = i32(c.z);
 let a = hash3(i, j, k, salt); let b = hash3(i + 1, j, k, salt); let cc = hash3(i, j + 1, k, salt); let d = hash3(i + 1, j + 1, k, salt);
 let e = hash3(i, j, k + 1, salt); let g = hash3(i + 1, j, k + 1, salt); let h = hash3(i, j + 1, k + 1, salt); let l = hash3(i + 1, j + 1, k + 1, salt);
 let lo = a + (b - a) * f.x + (cc - a) * f.y + (a - b - cc + d) * f.x * f.y;
 let hi = e + (g - e) * f.x + (h - e) * f.y + (e - g - h + l) * f.x * f.y;
 return lo + (hi - lo) * f.z;
}
fn decay(q: f32) -> f32 { return 1. / (1. + q * (1. + q * (.5 + q * (.16666667 + q * .04166667)))); }
fn mirrorIndex(v: i32, n: i32) -> i32 { let period = 2 * n; var m = v - i32(floor(f32(v) / f32(period))) * period; if (m >= n) { m = period - 1 - m; } return m; }
fn dyeSize() -> vec2<f32> { return u.v[4].xy; }
fn dyeLoad(t: texture_2d<f32>, x: i32, y: i32) -> vec4<f32> { let n = vec2<i32>(dyeSize()); return textureLoad(t, vec2<i32>(mirrorIndex(x, n.x), mirrorIndex(y, n.y)), 0); }
fn dyeSample(t: texture_2d<f32>, f: vec2<f32>) -> vec4<f32> { return textureSampleLevel(t, mirrorSampler, (f + .5) / dyeSize(), 0.); }
// Bilinear value at a point and the range of its four texels: a sharpening lift is held inside it.
struct Held { value: vec4<f32>, lo: vec4<f32>, hi: vec4<f32> };
fn held(t: texture_2d<f32>, f: vec2<f32>) -> Held {
 let o = floor(f); let w = f - o; let x = i32(o.x); let y = i32(o.y);
 let a = dyeLoad(t, x, y); let b = dyeLoad(t, x + 1, y); let c = dyeLoad(t, x, y + 1); let d = dyeLoad(t, x + 1, y + 1);
 var h: Held; h.value = mix(mix(a, b, w.x), mix(c, d, w.x), w.y); h.lo = min(min(a, b), min(c, d)); h.hi = max(max(a, b), max(c, d));
 return h;
}
fn wave(t: f32) -> f32 { return cos(6.283185307 * t); }
fn fold(t: f32) -> f32 { let m = t - floor(t / 2.) * 2.; return select(m, 2. - m, m > 1.); }
`;

const WGSL = {
	// The picture premultiplied over the marbled ground, as liquidSource writes it.
	ground: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let ij = floor(p.xy); let pic = textureLoad(t3, vec2<i32>(ij), 0); let under = (1. - pic.a) * u.v[15].z;
 var g = u.v[12].rgb;
 if (under > 0.) {
  let n = dyeSize(); let freq = 3.2 / min(n.x, n.y); let x = ij.x * freq; let y = ij.y * freq;
  let warp = noise(vec3<f32>(x * .7, y * .7, .5), 17u) * 1.6;
  let t = noise(vec3<f32>(x + warp, y - warp, 0.), 11u) * .55 + noise(vec3<f32>((x * .8 - y * .6) * 2.1, (x * .6 + y * .8) * 2.1, .3), 13u) * .3 +
   noise(vec3<f32>((x * .28 - y * .96) * 4.3, (x * .96 + y * .28) * 4.3, .7), 19u) * .15;
  let f = clamp(t * 1.6 - .3, 0., 1.) * 2.; let k = min(floor(f), 1.); let w = f - k;
  g = select(mix(u.v[10].rgb, u.v[11].rgb, w), mix(u.v[11].rgb, u.v[12].rgb, w), k > .5);
 }
 return vec4<f32>(pic.rgb * pic.a + g * under, pic.a + under);
}`,
	init: `struct Out { @location(0) dye: vec4<f32>, @location(1) age: vec4<f32> };
@fragment fn main(@builtin(position) p: vec4<f32>) -> Out { var out: Out; out.dye = textureLoad(t3, vec2<i32>(floor(p.xy)), 0); out.age = vec4<f32>(0.); return out; }`,
	psi: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let x = floor(p.xy) + .5; let pos = x * u.v[0].z; let f = u.v[2].z; let drift = u.v[13].y;
 let s = u.v[2].w * (noise(vec3<f32>(pos * f, drift), 0u) + .5 * noise(vec3<f32>(pos * f * 2.03, drift * 1.7), 7u));
 return vec4<f32>(s, 0., 0., 1.);
}`,
	force: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let cell = u.v[0].z; let dt = u.v[0].w;
 let pos = (vec2<f32>(q) + .5) * cell; let r = pos - u.v[2].xy;
 let whirl = u.v[3].x * 2.2 * decay(dot(r, r) * 5.6689);
 let tu = (cellAt(t1, q + vec2<i32>(0, 1)).x - cellAt(t1, q - vec2<i32>(0, 1)).x) / (2. * cell) - r.y * whirl;
 let tv = -(cellAt(t1, q + vec2<i32>(1, 0)).x - cellAt(t1, q - vec2<i32>(1, 0)).x) / (2. * cell) + r.x * whirl;
 let vel = cellAt(t0, q).xy;
 return vec4<f32>(vel + (vec2<f32>(tu, tv) - vel) * u.v[3].y * dt, 0., 1.);
}`,
	curl: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let cell = u.v[0].z;
 let w = (cellAt(t0, q + vec2<i32>(1, 0)).y - cellAt(t0, q - vec2<i32>(1, 0)).y - cellAt(t0, q + vec2<i32>(0, 1)).x + cellAt(t0, q - vec2<i32>(0, 1)).x) / (2. * cell);
 return vec4<f32>(w, 0., 0., 1.);
}`,
	confine: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let n = grid(); var vel = cellAt(t0, q).xy;
 if (q.x > 0 && q.y > 0 && q.x < n.x - 1 && q.y < n.y - 1) {
  let gx = abs(cellAt(t1, q + vec2<i32>(1, 0)).x) - abs(cellAt(t1, q - vec2<i32>(1, 0)).x);
  let gy = abs(cellAt(t1, q + vec2<i32>(0, 1)).x) - abs(cellAt(t1, q - vec2<i32>(0, 1)).x);
  let s = cellAt(t1, q).x * u.v[3].z * u.v[0].z * u.v[0].w / (sqrt(gx * gx + gy * gy) + 1e-6);
  vel += vec2<f32>(gy, -gx) * s;
 }
 return vec4<f32>(vel, 0., 1.);
}`,
	advect: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let n = vec2<f32>(grid()); let vel = cellAt(t0, q).xy;
 let back = clamp(vec2<f32>(q) - vel * u.v[0].w / u.v[0].z, vec2<f32>(0.), n - 1.);
 return vec4<f32>(textureSampleLevel(t0, clampSampler, (back + .5) / n, 0.).xy * u.v[3].w, 0., 1.);
}`,
	divergence: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let n = grid(); let c = cellAt(t0, q).xy;
 let ur = select(-c.x, cellAt(t0, q + vec2<i32>(1, 0)).x, q.x < n.x - 1); let ul = select(-c.x, cellAt(t0, q - vec2<i32>(1, 0)).x, q.x > 0);
 let vt = select(-c.y, cellAt(t0, q + vec2<i32>(0, 1)).y, q.y < n.y - 1); let vb = select(-c.y, cellAt(t0, q - vec2<i32>(0, 1)).y, q.y > 0);
 return vec4<f32>((ur - ul + vt - vb) / (2. * u.v[0].z), 0., 0., 1.);
}`,
	jacobi: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let cell = u.v[0].z;
 let s = cellAt(t0, q - vec2<i32>(1, 0)).x + cellAt(t0, q + vec2<i32>(1, 0)).x + cellAt(t0, q - vec2<i32>(0, 1)).x + cellAt(t0, q + vec2<i32>(0, 1)).x;
 return vec4<f32>((s - cell * cell * cellAt(t1, q).x) * .25, 0., 0., 1.);
}`,
	project: `@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let q = vec2<i32>(floor(p.xy)); let cell = u.v[0].z;
 let g = vec2<f32>(cellAt(t1, q + vec2<i32>(1, 0)).x - cellAt(t1, q - vec2<i32>(1, 0)).x, cellAt(t1, q + vec2<i32>(0, 1)).x - cellAt(t1, q - vec2<i32>(0, 1)).x) / (2. * cell);
 return vec4<f32>(cellAt(t0, q).xy - g, 0., 1.);
}`,
	dye: `struct Out { @location(0) dye: vec4<f32>, @location(1) age: vec4<f32> };
@fragment fn main(@builtin(position) p: vec4<f32>) -> Out {
 let ij = floor(p.xy); let texel = u.v[4].z; let dt = u.v[0].w; let x = (ij + .5) * texel;
 let n = vec2<f32>(grid()); let gpos = clamp(x / u.v[0].z - .5, vec2<f32>(0.), n - 1.);
 let vel = textureSampleLevel(t2, clampSampler, (gpos + .5) / n, 0.).xy;
 let o = x - vel * dt - u.v[2].xy;
 let turned = u.v[2].xy + vec2<f32>(o.x * u.v[5].x - o.y * u.v[5].y, o.x * u.v[5].y + o.y * u.v[5].x) * u.v[5].z;
 let m = (turned - x) / texel; let f = turned / texel - .5; let d = u.v[4].w; let k = u.v[5].w;
 let here = held(t0, f); let red = held(t0, ij + m * (1. + d)); let blue = held(t0, ij + m * (1. - d));
 var lift = vec4<f32>(0.);
 if (k > 0.) {
  lift = (4. * here.value - dyeSample(t0, f - vec2<f32>(1., 0.)) - dyeSample(t0, f + vec2<f32>(1., 0.)) - dyeSample(t0, f - vec2<f32>(0., 1.)) - dyeSample(t0, f + vec2<f32>(0., 1.))) * k;
 }
 let al = clamp(clamp(here.value.a + lift.w, here.lo.a, here.hi.a), 0., 1.);
 let r = clamp(clamp(red.value.r + lift.x, red.lo.r, red.hi.r), 0., al);
 let g = clamp(clamp(here.value.g + lift.y, here.lo.g, here.hi.g), 0., al);
 let b = clamp(clamp(blue.value.b + lift.z, blue.lo.b, blue.hi.b), 0., al);
 let rr = length(x - u.v[2].xy); let ramp = clamp((rr - .22) / .16, 0., 1.); let soft = ramp * ramp * (3. - 2. * ramp);
 let lens = select(1. - soft, soft, u.v[6].z > .5);
 let rate = u.v[6].x * (1. + (lens * 3. - 1.) * u.v[6].y); let keep = rate * dt / (1. + rate * dt);
 let src = textureLoad(t3, vec2<i32>(ij), 0);
 var out: Out;
 out.dye = mix(vec4<f32>(r, g, b, al), src, keep);
 out.age = vec4<f32>((dyeSample(t1, f).x + dt) * (1. - keep), 0., 0., 1.);
 return out;
}`,
	shade: `fn tinted(f: vec2<f32>, phase: f32) -> vec3<f32> { return tint(dyeSample(t0, f), phase); }
fn tint(s: vec4<f32>, phase: f32) -> vec3<f32> {
 let own = s.rgb / max(s.a, 1e-4);
 if (u.v[8].y <= 0.) { return own; }
 let t = fold(clamp(dot(own, vec3<f32>(.2126, .7152, .0722)), 0., 1.) * u.v[8].z + phase) * 3.;
 let i = min(i32(floor(t)), 2); let w = t - f32(i);
 var lo = u.v[9].rgb; var hi = u.v[10].rgb;
 if (i == 1) { lo = u.v[10].rgb; hi = u.v[11].rgb; } else if (i == 2) { lo = u.v[11].rgb; hi = u.v[12].rgb; }
 return mix(own, mix(lo, hi, w), u.v[8].y);
}
fn luma(f: vec2<f32>) -> f32 { return dot(dyeSample(t0, f).rgb, vec3<f32>(.2126, .7152, .0722)); }
@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let f = p.xy / u.v[13].zw * dyeSize() - .5; let texel = u.v[4].z; let reach = u.v[13].x;
 let slope = vec2<f32>(luma(f + vec2<f32>(reach, 0.)) - luma(f - vec2<f32>(reach, 0.)), luma(f + vec2<f32>(0., reach)) - luma(f - vec2<f32>(0., reach))) / (2. * reach * texel);
 var bend = -slope * u.v[7].x; let size = length(bend);
 if (size > .06) { bend *= .06 / size; }
 bend /= texel;
 let phase = dyeSample(t1, f).x * u.v[6].w; let spread = u.v[7].y;
 let middle = dyeSample(t0, f + bend);
 var c = vec3<f32>(tinted(f + bend * (1. + spread), phase).r, tint(middle, phase).g, tinted(f + bend * (1. - spread), phase).b);
 let alpha = clamp(middle.a, 0., 1.);
 let steep = length(slope);
 if (u.v[7].z > 0.) {
  let lift = steep * .01; let t = (dot(c, vec3<f32>(.2126, .7152, .0722)) * .5 + lift) * u.v[7].w; let m = u.v[7].z * clamp(lift, 0., 1.);
  let film = vec3<f32>(.5 + .5 * wave(t), .5 + .5 * wave(t * 1.18 + .17), .5 + .5 * wave(t * 1.39 + .31));
  c += (film * (.35 + .65 * c) - c) * m;
 }
 if (u.v[8].x > 0.) {
  let nrm = vec3<f32>(-slope * .02, 1.);
  var s = max(0., dot(nrm, u.v[14].xyz) / length(nrm)); s *= s; s *= s; s *= s; s *= s; s *= s;
  c += vec3<f32>(s * u.v[8].x * 1.4);
 }
 let src = textureSampleLevel(t2, mirrorSampler, (f + .5) / dyeSize(), 0.);
 let m = u.v[8].w;
 return clamp(vec4<f32>(c, 1.) * alpha * m + src * (1. - m), vec4<f32>(0.), vec4<f32>(1.));
}`,
};

// Sizes for a box shown at cssWidth x cssHeight CSS pixels and a device ratio. Shrink (at most 1) scales each side of both pictures:
// a device that cannot hold its frame rate asks for less.
export function liquidSizes(cssWidth, cssHeight, ratio = 1, shrink = 1) {
	const fit = (budget, w, h) => { const k = Math.min(1, Math.sqrt(budget / Math.max(1, w * h))) * shrink; return [Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k))]; };
	const device = [cssWidth * ratio, cssHeight * ratio];
	const [w, h] = fit(LIQUID_DYE_PIXELS, ...device), [outW, outH] = fit(LIQUID_OUTPUT_PIXELS, ...device);
	return { w, h, outW, outH };
}

class LiquidBase {
	constructor(canvas) {
		this.canvas = canvas; this.time = 0; this.dt = 1 / 60; this.u = new Float32Array(64); this.effect = null; this.source = null; this.fresh = true;
	}
	// The picture in the effect's own frame, as straight RGBA bytes.
	setSource(rgba, width, height) { this.source = { rgba, width, height }; this.fresh = true; }
	setEffect(effect) {
		const reseed = !this.effect || this.effect.seed !== effect.seed || this.effect.fill !== effect.fill || this.effect.palette !== effect.palette;
		this.effect = effect; this.p = liquidPhysics(effect);
		if (reseed) this.fresh = true;
	}
	geometry(w, h, outW, outH) {
		const shortSide = Math.min(w, h), dx = w / shortSide, dy = h / shortSide;
		const nx = Math.max(8, Math.round(LIQUID_GRID * dx)), ny = Math.max(8, Math.round(LIQUID_GRID * dy));
		return { w, h, outW, outH, dx, dy, nx, ny, cell: dx / nx };
	}
	// The picture at the loop's size, straight, as bytes; the ground pass adds the rest.
	sourceBytes() {
		const { w, h } = this.size, src = this.source;
		if (src.width === w && src.height === h) return new Uint8Array(src.rgba.buffer, src.rgba.byteOffset, w * h * 4);
		const scaled = new Uint8Array(w * h * 4);
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
			const si = Math.min(src.width - 1, Math.floor((i + .5) * src.width / w)), sj = Math.min(src.height - 1, Math.floor((j + .5) * src.height / h));
			scaled.set(src.rgba.subarray((sj * src.width + si) * 4, (sj * src.width + si) * 4 + 4), (j * w + i) * 4);
		}
		return scaled;
	}
	// Advance by real seconds; the step is bounded so a slow frame never jumps the fluid.
	frame(seconds) {
		if (!this.size || !this.source || !this.effect) return;
		if (this.fresh) { this.reset(); this.fresh = false; }
		const dt = Math.min(1 / 30, Math.max(1 / 240, seconds)) * this.p.speed;
		this.step(dt); this.present();
	}
	// Jump to a moment with the still's own step: reduced motion shows what the file keeps.
	settle(seconds) {
		if (!this.size || !this.source || !this.effect) return;
		this.reset(); this.fresh = false;
		const steps = Math.min(144, Math.round(seconds / LIQUID_STILL_STEP));
		for (let i = 0; i < steps; i++) this.step(this.p.speed * LIQUID_STILL_STEP);
		this.present();
	}
	uniformsFor(dt) { this.dt = dt; return uniforms(this.p, { ...this.size, dt, time: this.time }, this.u); }
}

// One device serves every live canvas; a lost device is asked for again.
let liquidDevice = null;
function sharedDevice() {
	liquidDevice ??= (async () => {
		const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'low-power' });
		const device = adapter ? await adapter.requestDevice() : null;
		device?.lost.then(() => { liquidDevice = null; });
		return device;
	})().catch(() => { liquidDevice = null; return null; });
	return liquidDevice;
}

class LiquidWebGPU extends LiquidBase {
	static async create(canvas) {
		if (!navigator.gpu) return null;
		const device = await sharedDevice();
		if (!device) return null;
		const context = canvas.getContext('webgpu');
		if (!context) return null;
		const self = new LiquidWebGPU(canvas);
		self.device = device; self.context = context; self.format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format: self.format, alphaMode: 'premultiplied' });
		device.lost.then(() => { self.lost = true; });
		self.build();
		return self;
	}
	build() {
		const device = this.device, stage = GPUShaderStage.FRAGMENT;
		this.layout = device.createBindGroupLayout({ entries: [
			{ binding: 0, visibility: stage, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: stage, sampler: { type: 'filtering' } }, { binding: 2, visibility: stage, sampler: { type: 'filtering' } },
			...[3, 4, 5, 6].map(binding => ({ binding, visibility: stage, texture: { sampleType: 'float' } })),
		] });
		const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
		const pipeline = (name, targets) => {
			const module = device.createShaderModule({ code: WGSL_HEAD + WGSL[name] });
			return device.createRenderPipeline({ layout, vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'main', targets: targets.map(format => ({ format })) }, primitive: { topology: 'triangle-list' } });
		};
		this.pipelines = {
			psi: pipeline('psi', ['r16float']), force: pipeline('force', ['rg16float']), curl: pipeline('curl', ['r16float']),
			confine: pipeline('confine', ['rg16float']), advect: pipeline('advect', ['rg16float']), divergence: pipeline('divergence', ['r16float']),
			jacobi: pipeline('jacobi', ['r16float']), project: pipeline('project', ['rg16float']),
			ground: pipeline('ground', ['rgba16float']), init: pipeline('init', ['rgba16float', 'r16float']), dye: pipeline('dye', ['rgba16float', 'r16float']), shade: pipeline('shade', [this.format]),
		};
		this.buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		this.mirror = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'mirror-repeat', addressModeV: 'mirror-repeat' });
		this.clamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
		this.blank = this.texture(1, 1, 'rgba8unorm'); this.ids = new Map(); this.groups = new Map(); this.views = new WeakMap();
	}
	texture(w, h, format) {
		return this.device.createTexture({ size: [w, h], format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST });
	}
	resize(w, h, outW, outH) {
		if (this.size && this.size.w === w && this.size.h === h && this.size.outW === outW && this.size.outH === outH) return;
		this.release();
		this.size = this.geometry(w, h, outW, outH);
		this.canvas.width = outW; this.canvas.height = outH;
		const { nx, ny } = this.size, t = (format, a = nx, b = ny) => this.texture(a, b, format);
		this.tex = { vel: [t('rg16float'), t('rg16float')], psi: t('r16float'), curl: t('r16float'), div: t('r16float'), pressure: [t('r16float'), t('r16float')],
			dye: [t('rgba16float', w, h), t('rgba16float', w, h)], age: [t('r16float', w, h), t('r16float', w, h)], raw: t('rgba8unorm', w, h), src: t('rgba16float', w, h) };
		this.groups = new Map(); this.fresh = true;
	}
	group(...textures) {
		const views = [0, 1, 2, 3].map(i => textures[i] || this.blank);
		const id = views.map(t => this.ids.get(t) ?? this.ids.set(t, this.ids.size + 1).get(t)).join();
		let cached = this.groups.get(id);
		if (!cached) {
			cached = this.device.createBindGroup({ layout: this.layout, entries: [
				{ binding: 0, resource: { buffer: this.buffer } }, { binding: 1, resource: this.mirror }, { binding: 2, resource: this.clamp },
				...views.map((texture, i) => ({ binding: i + 3, resource: texture.createView() })),
			] });
			this.groups.set(id, cached);
		}
		return cached;
	}
	pass(encoder, name, targets, inputs) {
		// Views of the loop's own textures are made once; the canvas hands out a new texture each frame.
		const view = texture => texture === this.frameTexture ? texture.createView() : this.views.get(texture) ?? this.views.set(texture, texture.createView()).get(texture);
		const pass = encoder.beginRenderPass({ colorAttachments: targets.map(target => ({ view: view(target), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] })) });
		pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0, this.group(...inputs)); pass.draw(3); pass.end();
	}
	reset() {
		const { w, h } = this.size, q = this.device.queue;
		q.writeTexture({ texture: this.tex.raw }, this.sourceBytes(), { bytesPerRow: w * 4 }, [w, h]);
		// The loop starts from the picture itself, at rest.
		const encoder = this.device.createCommandEncoder();
		this.uniformsFor(0); q.writeBuffer(this.buffer, 0, this.u);
		for (const target of [this.tex.vel[0], this.tex.pressure[0]]) encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }).end();
		this.pass(encoder, 'ground', [this.tex.src], [null, null, null, this.tex.raw]);
		this.pass(encoder, 'init', [this.tex.dye[0], this.tex.age[0]], [null, null, null, this.tex.src]);
		q.submit([encoder.finish()]);
		this.time = 0;
	}
	step(dt) {
		const tex = this.tex, encoder = this.device.createCommandEncoder();
		this.device.queue.writeBuffer(this.buffer, 0, this.uniformsFor(dt));
		this.pass(encoder, 'psi', [tex.psi], []);
		this.pass(encoder, 'force', [tex.vel[1]], [tex.vel[0], tex.psi]);
		this.pass(encoder, 'curl', [tex.curl], [tex.vel[1]]);
		this.pass(encoder, 'confine', [tex.vel[0]], [tex.vel[1], tex.curl]);
		this.pass(encoder, 'advect', [tex.vel[1]], [tex.vel[0]]);
		this.pass(encoder, 'divergence', [tex.div], [tex.vel[1]]);
		for (let k = 0; k < LIQUID_JACOBI; k++) { this.pass(encoder, 'jacobi', [tex.pressure[1]], [tex.pressure[0], tex.div]); tex.pressure.reverse(); }
		this.pass(encoder, 'project', [tex.vel[0]], [tex.vel[1], tex.pressure[0]]);
		this.pass(encoder, 'dye', [tex.dye[1], tex.age[1]], [tex.dye[0], tex.age[0], tex.vel[0], tex.src]);
		tex.dye.reverse(); tex.age.reverse();
		this.device.queue.submit([encoder.finish()]);
		this.time += dt;
	}
	present() {
		const encoder = this.device.createCommandEncoder();
		this.frameTexture = this.context.getCurrentTexture();
		this.pass(encoder, 'shade', [this.frameTexture], [this.tex.dye[0], this.tex.age[0], this.tex.src]);
		this.device.queue.submit([encoder.finish()]);
	}
	release() { for (const value of Object.values(this.tex || {})) for (const t of [value].flat()) t.destroy(); this.tex = null; this.groups = new Map(); }
	destroy() { this.release(); this.blank?.destroy(); this.buffer?.destroy(); this.context?.unconfigure(); }
}

// A live renderer for one canvas, or null when the browser has no WebGPU.
export async function createLiquidRenderer(canvas) {
	try { const made = await LiquidWebGPU.create(canvas); if (made) made.kind = 'webgpu'; return made; } catch (_) { return null; }
}
