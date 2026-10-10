// SPDX-License-Identifier: AGPL-3.0-only
// Liquid light: a stirred fluid carries the picture, splits its colours and feeds back on itself.
// The recipe and seed are the effect. This module owns its settings, its saved form and a
// deterministic reference renderer; the live GPU renderer runs the same steps.

const DEFAULTS = Object.freeze({ strength: 1, swirl: .55, turbulence: .8, scale: .3, curl: .85, speed: .9, detail: .6,
	refresh: .3, focus: .7, zoom: .55, spin: .2, x: .5, y: .5, cycle: .85, dispersion: .55, refract: .6, iridescence: .35,
	film: .45, sheen: .45, palette: 'opal', tint: .9, bands: .2, fill: 1, time: 4 });
const RANGES = Object.freeze({ strength: [0, 1], swirl: [-1, 1], turbulence: [0, 1], scale: [0, 1], curl: [0, 1],
	speed: [0, 2], detail: [0, 1], refresh: [0, 1], focus: [0, 1], zoom: [-1, 1], spin: [-1, 1], x: [0, 1], y: [0, 1], cycle: [0, 1],
	dispersion: [0, 1], refract: [0, 1], iridescence: [0, 1], film: [0, 1], sheen: [0, 1], tint: [0, 1], bands: [0, 1],
	fill: [0, 1], time: [0, 12] });
const KEYS = new Set(['type', 'version', 'preset', 'seed', ...Object.keys(DEFAULTS)]);

// Gradient maps over luminance; Picture keeps the artwork's own colours.
export const LIQUID_PALETTES = Object.freeze([
	['source', 'Picture', []],
	['opal', 'Opal', ['#25206f', '#4c5fc4', '#9ab8ef', '#f3cdee']],
	['ink', 'Ink', ['#070a1c', '#18308a', '#4f8fd8', '#eef3fb']],
	['ember', 'Ember', ['#160403', '#7d1608', '#ea7a1f', '#ffe7b0']],
	['mint', 'Mint', ['#032222', '#147a6c', '#86e3c4', '#f4fff6']],
	['chrome', 'Chrome', ['#0d0e12', '#5d626c', '#c9ced6', '#ffffff']],
	['candy', 'Candy', ['#2a0a7a', '#c4237c', '#ff9ec8', '#fff1f8']],
	['oil', 'Oil', ['#06060a', '#2a1648', '#14607a', '#d8e27a']],
].map(([id, name, stops]) => Object.freeze({ id, name, stops: Object.freeze(stops) })));
const PALETTE_IDS = LIQUID_PALETTES.map(row => row.id);

export const LIQUID_PRESETS = Object.freeze([
	['opal-vortex', 'Opal vortex', {}],
	['oil-slick', 'Oil slick', { palette: 'source', tint: 0, iridescence: .9, film: .6, swirl: .2, turbulence: .55, zoom: .1, spin: .05, refresh: .45, cycle: 0, dispersion: .7, fill: 0 }],
	['marbling', 'Marbled paper', { swirl: 0, turbulence: .85, scale: .75, curl: .3, detail: .3, refresh: .05, focus: 0, zoom: 0, spin: 0, cycle: 0, dispersion: .12, refract: .15, iridescence: 0, sheen: .1, palette: 'source', tint: 0, fill: .85, time: 6 }],
	['whirlpool', 'Whirlpool', { swirl: 1, turbulence: .45, scale: .4, curl: .6, zoom: -.6, spin: .6, refresh: .2, cycle: .7, dispersion: .6, palette: 'ink', tint: .85 }],
	['ink-drop', 'Ink in water', { swirl: .1, turbulence: .6, scale: .3, curl: .95, speed: .35, detail: .4, refresh: .08, zoom: .2, spin: 0, cycle: .2, dispersion: .3, refract: .35, iridescence: .1, sheen: .25, palette: 'ink', tint: .85 }],
	['molten', 'Molten glass', { swirl: .3, turbulence: .5, scale: .35, curl: .5, speed: .3, refresh: .3, zoom: .15, spin: .1, cycle: .3, dispersion: .4, refract: 1, iridescence: .2, film: .3, sheen: .8, palette: 'ember', tint: .85 }],
	['mercury', 'Mercury', { swirl: .35, turbulence: .55, scale: .45, curl: .6, refresh: .3, cycle: .15, dispersion: .25, refract: .9, iridescence: .15, sheen: 1, palette: 'chrome', tint: .9, bands: .35, fill: .75 }],
	['galaxy', 'Galaxy', { swirl: .9, turbulence: .5, scale: .55, curl: .8, zoom: -.3, spin: .7, refresh: .15, cycle: .8, dispersion: .8, iridescence: .4, palette: 'candy', tint: .75, bands: .4 }],
	['gentle-stir', 'Gentle stir', { strength: .7, swirl: .2, turbulence: .3, scale: .45, curl: .4, speed: .4, detail: .3, refresh: .75, zoom: .05, spin: 0, cycle: 0, dispersion: .35, refract: .3, iridescence: .15, sheen: .25, palette: 'source', tint: 0, fill: 0 }],
].map(([id, name, values]) => Object.freeze({ id, name, values: Object.freeze(values) })));

export function liquidPreset(id = 'opal-vortex', seed = 1) {
	const preset = LIQUID_PRESETS.find(row => row.id === id);
	return preset ? { type: 'liquid', version: 1, preset: id, seed, ...DEFAULTS, ...preset.values } : null;
}

// A preset alone is a whole effect; values the caller sends stand as sent.
export function fillLiquid(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
	const start = liquidPreset(input.preset ?? 'opal-vortex', input.seed ?? 1);
	return start ? { ...start, ...input } : input;
}

export function admitLiquid(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'liquid' || raw.version !== 1 ||
		Object.keys(raw).some(key => !KEYS.has(key)) || !Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 2147483646 ||
		!PALETTE_IDS.includes(raw.palette)) return null;
	const out = liquidPreset(raw.preset, raw.seed);
	if (!out) return null;
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
		out[key] = value;
	}
	out.palette = raw.palette;
	return out;
}

// The fluid stays inside the source frame.
export function liquidBounds(_effect, box) { return { ...box }; }

// ---- One mapping from settings to physics, read by both renderers. ----

const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
export const LIQUID_JACOBI = 12;
export function liquidPhysics(e) {
	const stops = LIQUID_PALETTES.find(row => row.id === e.palette).stops.map(hexRgb);
	return {
		swirl: e.swirl * 1.2, turbulence: e.turbulence * .8, frequency: 2.5 + (1 - e.scale) * 9,
		confine: e.curl * 3, relax: 1.6, damping: .3, speed: e.speed, detail: e.detail * .11,
		refresh: e.refresh * e.refresh * 3, focus: e.focus, zoom: e.zoom * 1.2, spin: e.spin, cx: e.x, cy: e.y, cycle: e.cycle * 1.5,
		dispersion: e.dispersion * .16, spread: e.dispersion * 2.5, refract: e.refract * .03, iridescence: e.iridescence,
		film: .6 + e.film * 3.4, sheen: e.sheen, tint: stops.length ? e.tint : 0, bands: 1 + e.bands * 5,
		stops: stops.length ? stops : [[0, 0, 0], [1 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 2 / 3], [1, 1, 1]],
		fill: e.fill, ground: stops.length ? stops[3] : [1, 1, 1], strength: e.strength, seed: e.seed,
	};
}

// ---- Deterministic arithmetic: integer hashing and polynomials, the same in every engine. ----

function hash3(seed, i, j, k) {
	let v = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(seed, 2246822519);
	v = Math.imul(v ^ (v >>> 13), 1274126177);
	return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
const quintic = t => t * t * t * (t * (t * 6 - 15) + 10);
// Smooth value noise in space and time, in [0, 1).
export function liquidNoise(seed, x, y, z) {
	const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
	const fx = quintic(x - i), fy = quintic(y - j), fz = quintic(z - k);
	const a = hash3(seed, i, j, k), b = hash3(seed, i + 1, j, k), c = hash3(seed, i, j + 1, k), d = hash3(seed, i + 1, j + 1, k);
	const e = hash3(seed, i, j, k + 1), f = hash3(seed, i + 1, j, k + 1), g = hash3(seed, i, j + 1, k + 1), h = hash3(seed, i + 1, j + 1, k + 1);
	const lo = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
	const hi = e + (f - e) * fx + (g - e) * fy + (e - f - g + h) * fx * fy;
	return lo + (hi - lo) * fz;
}
// exp(-q) for q >= 0, as a rational polynomial.
export const liquidDecay = q => 1 / (1 + q * (1 + q * (.5 + q * (.16666667 + q * .04166667))));
// cos(2 pi t) by a wrapped even polynomial.
export function liquidWave(t) {
	let x = t - Math.floor(t);
	x = x > .5 ? 1 - x : x;
	const sign = x > .25 ? -1 : 1, u = x > .25 ? .5 - x : x, w = u * u * 39.47841760435743;
	return sign * (1 - w * (.5 - w * (.041666667 - w * (.0013888889 - w * .0000248016))));
}
// Palette position: folded back and forth so the palette never jumps.
export function liquidFold(t) { const m = t - Math.floor(t / 2) * 2; return m > 1 ? 2 - m : m; }

// ---- Reference renderer: velocity on a coarse grid, the picture and its age on a finer one. ----

export const LIQUID_GRID = 64;
export const LIQUID_STILL_STEP = 1 / 12;
export const LIQUID_STILL_SIDE = 384;

// Mirror the picture at its edges so the fluid never pulls in emptiness.
function mirror(v, n) {
	const period = 2 * n;
	v -= Math.floor(v / period) * period;
	return v < n ? v : period - 1 - v;
}
// Bilinear sample of channel c at texel coordinates (fx, fy); stride is the channel count.
function sample(data, w, h, stride, fx, fy, c) {
	const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
	let a, b, cc, d;
	if (x0 >= 0 && y0 >= 0 && x0 < w - 1 && y0 < h - 1) {
		const q = (y0 * w + x0) * stride + c;
		a = data[q]; b = data[q + stride]; cc = data[q + w * stride]; d = data[q + w * stride + stride];
	} else {
		const xa = mirror(x0, w), xb = mirror(x0 + 1, w), ya = mirror(y0, h), yb = mirror(y0 + 1, h);
		a = data[(ya * w + xa) * stride + c]; b = data[(ya * w + xb) * stride + c]; cc = data[(yb * w + xa) * stride + c]; d = data[(yb * w + xb) * stride + c];
	}
	return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// Bilinear sample plus a sharpening term, held inside its four source texels: edges stay
// crisp without new extremes, so the loop cannot ring or grow noise.
function held(data, w, h, fx, fy, c, lift) {
	const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
	const xa = mirror(x0, w), xb = mirror(x0 + 1, w), ya = mirror(y0, h), yb = mirror(y0 + 1, h);
	const a = data[(ya * w + xa) * 4 + c], b = data[(ya * w + xb) * 4 + c], cc = data[(yb * w + xa) * 4 + c], d = data[(yb * w + xb) * 4 + c];
	const value = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty + lift;
	const lo = Math.min(a, b, cc, d), hi = Math.max(a, b, cc, d);
	return value < lo ? lo : value > hi ? hi : value;
}

// The picture as the fluid receives it: premultiplied, over a seeded marbled ground where
// the artwork leaves the frame empty, so even a sparse sketch gives the liquid something to stir.
export function liquidSource(effect, source, width, height) {
	const p = liquidPhysics(effect), n = width * height, out = new Float32Array(n * 4), stops = p.stops;
	const shortSide = Math.min(width, height), freq = 3.2 / shortSide;
	for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
		const q = j * width + i, a = source[q * 4 + 3] / 255, under = (1 - a) * p.fill;
		let ground = p.ground;
		if (under) {
			// Three turned octaves of the effect's own noise, warped by a fourth, pick a tone from the
			// palette's upper half; turning each octave hides the lattice.
			const x = i * freq, y = j * freq, warp = liquidNoise(p.seed + 17, x * .7, y * .7, .5) * 1.6;
			const t = liquidNoise(p.seed + 11, x + warp, y - warp, 0) * .55 + liquidNoise(p.seed + 13, (x * .8 - y * .6) * 2.1, (x * .6 + y * .8) * 2.1, .3) * .3 +
				liquidNoise(p.seed + 19, (x * .28 - y * .96) * 4.3, (x * .96 + y * .28) * 4.3, .7) * .15;
			const f = clamp01(t * 1.6 - .3) * 2, k = f >= 2 ? 1 : Math.floor(f), w = f - k;
			ground = [0, 1, 2].map(c => stops[k + 1][c] + (stops[k + 2][c] - stops[k + 1][c]) * w);
		}
		for (let c = 0; c < 3; c++) out[q * 4 + c] = source[q * 4 + c] / 255 * a + ground[c] * under;
		out[q * 4 + 3] = a + under;
	}
	return out;
}

export class LiquidReference {
	constructor(effect, source, width, height, grid = LIQUID_GRID) {
		const p = this.p = liquidPhysics(effect);
		this.w = width; this.h = height;
		const shortSide = Math.min(width, height);
		this.dx = width / shortSide; this.dy = height / shortSide;
		this.nx = Math.max(8, Math.round(grid * this.dx)); this.ny = Math.max(8, Math.round(grid * this.dy));
		this.cell = this.dx / this.nx;
		const cells = this.nx * this.ny;
		for (const name of ['u', 'v', 'u2', 'v2', 'pressure', 'pressure2', 'div', 'omega', 'psi']) this[name] = new Float32Array(cells);
		this.time = 0;
		const n = width * height, src = liquidSource(effect, source, width, height);
		this.source = src; this.dye = Float32Array.from(src); this.dye2 = new Float32Array(n * 4);
		this.age = new Float32Array(n); this.age2 = new Float32Array(n);
	}

	stepFluid(dt) {
		const { nx, ny, cell, p, psi, omega, div } = this;
		let { u, v, u2, v2 } = this;
		const cx = p.cx * this.dx, cy = p.cy * this.dy, freq = p.frequency, amp = p.turbulence / freq, drift = this.time * .15, seed = p.seed;
		// Stir: relax toward a whirl plus curl noise, then confine vorticity so eddies stay sharp.
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const x = (i + .5) * cell, y = (j + .5) * cell;
			psi[j * nx + i] = amp * (liquidNoise(seed, x * freq, y * freq, drift) + .5 * liquidNoise(seed + 7, x * freq * 2.03, y * freq * 2.03, drift * 1.7));
		}
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const q = j * nx + i, x = (i + .5) * cell, y = (j + .5) * cell;
			const l = i ? q - 1 : q, r = i < nx - 1 ? q + 1 : q, b = j ? q - nx : q, t = j < ny - 1 ? q + nx : q;
			const rx = x - cx, ry = y - cy, whirl = p.swirl * 2.2 * liquidDecay((rx * rx + ry * ry) * 5.6689);
			const tu = (psi[t] - psi[b]) / (2 * cell) - ry * whirl, tv = -(psi[r] - psi[l]) / (2 * cell) + rx * whirl;
			u[q] += (tu - u[q]) * p.relax * dt; v[q] += (tv - v[q]) * p.relax * dt;
		}
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const q = j * nx + i, l = i ? q - 1 : q, r = i < nx - 1 ? q + 1 : q, b = j ? q - nx : q, t = j < ny - 1 ? q + nx : q;
			omega[q] = (v[r] - v[l] - u[t] + u[b]) / (2 * cell);
		}
		if (p.confine) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
			const q = j * nx + i;
			const gx = Math.abs(omega[q + 1]) - Math.abs(omega[q - 1]), gy = Math.abs(omega[q + nx]) - Math.abs(omega[q - nx]);
			const scale = omega[q] * p.confine * cell * dt / (Math.sqrt(gx * gx + gy * gy) + 1e-6);
			u[q] += gy * scale; v[q] -= gx * scale;
		}
		// Self-advection with gentle damping.
		const fade = 1 / (1 + p.damping * dt);
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const q = j * nx + i;
			let fx = i - u[q] * dt / cell, fy = j - v[q] * dt / cell;
			fx = fx < 0 ? 0 : fx > nx - 1 ? nx - 1 : fx; fy = fy < 0 ? 0 : fy > ny - 1 ? ny - 1 : fy;
			u2[q] = sample(u, nx, ny, 1, fx, fy, 0) * fade; v2[q] = sample(v, nx, ny, 1, fx, fy, 0) * fade;
		}
		[u, u2] = [u2, u]; [v, v2] = [v2, v];
		// Projection: walls carry no normal flow; pressure starts from the last step.
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const q = j * nx + i;
			const ur = i < nx - 1 ? u[q + 1] : -u[q], ul = i ? u[q - 1] : -u[q], vt = j < ny - 1 ? v[q + nx] : -v[q], vb = j ? v[q - nx] : -v[q];
			div[q] = (ur - ul + vt - vb) / (2 * cell);
		}
		let pr = this.pressure, pr2 = this.pressure2;
		const h2 = cell * cell;
		for (let k = 0; k < LIQUID_JACOBI; k++) {
			for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
				const q = j * nx + i;
				pr2[q] = ((i ? pr[q - 1] : pr[q]) + (i < nx - 1 ? pr[q + 1] : pr[q]) + (j ? pr[q - nx] : pr[q]) + (j < ny - 1 ? pr[q + nx] : pr[q]) - h2 * div[q]) * .25;
			}
			[pr, pr2] = [pr2, pr];
		}
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
			const q = j * nx + i;
			u[q] -= ((i < nx - 1 ? pr[q + 1] : pr[q]) - (i ? pr[q - 1] : pr[q])) / (2 * cell);
			v[q] -= ((j < ny - 1 ? pr[q + nx] : pr[q]) - (j ? pr[q - nx] : pr[q])) / (2 * cell);
		}
		this.pressure = pr; this.pressure2 = pr2;
		this.u = u; this.v = v; this.u2 = u2; this.v2 = v2;
	}

	stepDye(dt) {
		const { w, h, p, nx, ny, cell, u, v } = this, texel = this.dx / w, src = this.source, dye = this.dye, out = this.dye2, age = this.age, age2 = this.age2;
		const cx = p.cx * this.dx, cy = p.cy * this.dy;
		const a = -p.spin * dt, cos = 1 - a * a * .5, sin = a - a * a * a / 6, shrink = 1 / (1 + p.zoom * dt);
		// Resampling blurs once per step, so the sharpening is per step too, whatever the step's length.
		const d = p.dispersion, k = p.detail, inward = p.zoom < 0;
		// The sharpening term: the Laplacian of the bilinear picture is the bilinear sample of the
		// texel Laplacian, so one pass over the texels serves every sample.
		const lap = this.lap ??= new Float32Array(w * h * 4);
		if (k) for (let j = 0; j < h; j++) {
			const up = (j ? j - 1 : 0) * w, down = (j < h - 1 ? j + 1 : h - 1) * w, at = j * w;
			for (let i = 0; i < w; i++) {
				const l = at + (i ? i - 1 : 0), r = at + (i < w - 1 ? i + 1 : w - 1), q = (at + i) * 4;
				for (let c = 0; c < 4; c++) lap[q + c] = 4 * dye[q + c] - dye[l * 4 + c] - dye[r * 4 + c] - dye[(up + i) * 4 + c] - dye[(down + i) * 4 + c];
			}
		}
		// One channel's four texels around (fx, fy), bilinear plus lift, held inside them.
		const heldAt = (fx, fy, c, lift) => {
			const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
			const xa = x0 >= 0 && x0 < w ? x0 : mirror(x0, w), xb = x0 + 1 >= 0 && x0 + 1 < w ? x0 + 1 : mirror(x0 + 1, w);
			const ya = (y0 >= 0 && y0 < h ? y0 : mirror(y0, h)) * w, yb = (y0 + 1 >= 0 && y0 + 1 < h ? y0 + 1 : mirror(y0 + 1, h)) * w;
			const t00 = dye[(ya + xa) * 4 + c], t10 = dye[(ya + xb) * 4 + c], t01 = dye[(yb + xa) * 4 + c], t11 = dye[(yb + xb) * 4 + c];
			const value = t00 + (t10 - t00) * tx + (t01 - t00) * ty + (t00 - t10 - t01 + t11) * tx * ty + lift;
			const la = t00 < t10 ? t00 : t10, lb = t01 < t11 ? t01 : t11, ha = t00 > t10 ? t00 : t10, hb = t01 > t11 ? t01 : t11;
			const lo = la < lb ? la : lb, hi = ha > hb ? ha : hb;
			return value < lo ? lo : value > hi ? hi : value;
		};
		for (let j = 0; j < h; j++) {
			const y = (j + .5) * texel;
			let gy = y / cell - .5; gy = gy < 0 ? 0 : gy > ny - 1 ? ny - 1 : gy;
			const gj = Math.min(ny - 2, Math.floor(gy)), gty = gy - gj;
			for (let i = 0; i < w; i++) {
				const x = (i + .5) * texel, o = j * w + i;
				let gx = x / cell - .5; gx = gx < 0 ? 0 : gx > nx - 1 ? nx - 1 : gx;
				const gi = Math.min(nx - 2, Math.floor(gx)), gtx = gx - gi, gq = gj * nx + gi;
				const wa = (1 - gtx) * (1 - gty), wb = gtx * (1 - gty), wc = (1 - gtx) * gty, wd = gtx * gty;
				const vx = u[gq] * wa + u[gq + 1] * wb + u[gq + nx] * wc + u[gq + nx + 1] * wd;
				const vy = v[gq] * wa + v[gq + 1] * wb + v[gq + nx] * wc + v[gq + nx + 1] * wd;
				// Back along the flow, then through the feedback camera's turn and zoom.
				const ox = x - vx * dt - cx, oy = y - vy * dt - cy;
				const qx = cx + (ox * cos - oy * sin) * shrink, qy = cy + (ox * sin + oy * cos) * shrink;
				const mx = (qx - x) / texel, my = (qy - y) / texel, fx = qx / texel - .5, fy = qy / texel - .5;
				const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
				const c0 = x0 >= 0 && x0 < w ? x0 : mirror(x0, w), c1 = x0 + 1 >= 0 && x0 + 1 < w ? x0 + 1 : mirror(x0 + 1, w);
				const r0 = (y0 >= 0 && y0 < h ? y0 : mirror(y0, h)) * w, r1 = (y0 + 1 >= 0 && y0 + 1 < h ? y0 + 1 : mirror(y0 + 1, h)) * w;
				const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
				const q00 = (r0 + c0) * 4, q10 = (r0 + c1) * 4, q01 = (r1 + c0) * 4, q11 = (r1 + c1) * 4;
				// Resampling blurs; a sharpening lift restores edges and, with the blur, rounds shapes into liquid.
				let lr = 0, lg = 0, lb = 0, la = 0;
				if (k) {
					lr = (lap[q00] * w00 + lap[q10] * w10 + lap[q01] * w01 + lap[q11] * w11) * k;
					lg = (lap[q00 + 1] * w00 + lap[q10 + 1] * w10 + lap[q01 + 1] * w01 + lap[q11 + 1] * w11) * k;
					lb = (lap[q00 + 2] * w00 + lap[q10 + 2] * w10 + lap[q01 + 2] * w01 + lap[q11 + 2] * w11) * k;
					la = (lap[q00 + 3] * w00 + lap[q10 + 3] * w10 + lap[q01 + 3] * w01 + lap[q11 + 3] * w11) * k;
				}
				// Red travels a little further than blue: the colours part along the flow.
				let al = heldAt(fx, fy, 3, la);
				al = al < 0 ? 0 : al > 1 ? 1 : al;
				let r = heldAt(i + mx * (1 + d), j + my * (1 + d), 0, lr), g = heldAt(fx, fy, 1, lg), b = heldAt(i + mx * (1 - d), j + my * (1 - d), 2, lb);
				r = r < 0 ? 0 : r > al ? al : r; g = g < 0 ? 0 : g > al ? al : g; b = b < 0 ? 0 : b > al ? al : b;
				// The picture returns where the feedback starts: the centre when it blooms, the rim when it drains.
				const rx = x - cx, ry = y - cy, ramp = clamp01((Math.sqrt(rx * rx + ry * ry) - .22) / .16), soft = ramp * ramp * (3 - 2 * ramp);
				const rate = p.refresh * (1 + ((inward ? soft : 1 - soft) * 3 - 1) * p.focus), keep = rate * dt / (1 + rate * dt);
				out[o * 4] = r + (src[o * 4] - r) * keep; out[o * 4 + 1] = g + (src[o * 4 + 1] - g) * keep;
				out[o * 4 + 2] = b + (src[o * 4 + 2] - b) * keep; out[o * 4 + 3] = al + (src[o * 4 + 3] - al) * keep;
				// What returns is new, so its age starts again.
				age2[o] = (age[r0 + c0] * w00 + age[r0 + c1] * w10 + age[r1 + c0] * w01 + age[r1 + c1] * w11 + dt) * (1 - keep);
			}
		}
		this.dye = out; this.dye2 = dye; this.age = age2; this.age2 = age;
	}

	step(dt) {
		const scaled = dt * this.p.speed;
		this.stepFluid(scaled); this.stepDye(scaled); this.time += scaled;
	}

	// Light, colour and the strength mix, as straight 8-bit RGBA.
	shade() {
		const { w, h, p } = this, texel = this.dx / w, dye = this.dye, src = this.source, age = this.age, out = new Uint8ClampedArray(w * h * 4);
		const reach = Math.max(1, .004 / texel), stops = p.stops, tint = p.tint, spread = p.spread;
		const luma = (fx, fy) => .2126 * sample(dye, w, h, 4, fx, fy, 0) + .7152 * sample(dye, w, h, 4, fx, fy, 1) + .0722 * sample(dye, w, h, 4, fx, fy, 2);
		const hl = Math.sqrt(.45 * .45 + .6 * .6 + 1.66 * 1.66), hx = -.45 / hl, hy = -.6 / hl, hz = 1.66 / hl;
		// One channel of the tinted colour at a point.
		const channel = (fx, fy, c, phase) => {
			const al = Math.max(1e-4, sample(dye, w, h, 4, fx, fy, 3));
			const r = sample(dye, w, h, 4, fx, fy, 0) / al, g = sample(dye, w, h, 4, fx, fy, 1) / al, b = sample(dye, w, h, 4, fx, fy, 2) / al;
			const own = c === 0 ? r : c === 1 ? g : b;
			if (!tint) return own;
			const t = liquidFold(clamp01(.2126 * r + .7152 * g + .0722 * b) * p.bands + phase) * 3, s = t >= 3 ? 2 : Math.floor(t), f = t - s;
			return own + (stops[s][c] + (stops[s + 1][c] - stops[s][c]) * f - own) * tint;
		};
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
			// The picture's luminance is a height field: its slope bends light.
			const sx = (luma(i + reach, j) - luma(i - reach, j)) / (2 * reach * texel), sy = (luma(i, j + reach) - luma(i, j - reach)) / (2 * reach * texel);
			let bx = -sx * p.refract, by = -sy * p.refract;
			const bend = Math.sqrt(bx * bx + by * by);
			if (bend > .06) { bx *= .06 / bend; by *= .06 / bend; }
			bx /= texel; by /= texel;
			const phase = age[j * w + i] * p.cycle;
			let r = channel(i + bx * (1 + spread), j + by * (1 + spread), 0, phase), g = channel(i + bx, j + by, 1, phase), b = channel(i + bx * (1 - spread), j + by * (1 - spread), 2, phase);
			const alpha = clamp01(sample(dye, w, h, 4, i + bx, j + by, 3));
			const slope = Math.sqrt(sx * sx + sy * sy);
			if (p.iridescence) {
				// Thin film shows where the surface bends; flat liquid keeps its colour.
				const lift = slope * .01, t = ((.2126 * r + .7152 * g + .0722 * b) * .5 + lift) * p.film, m = p.iridescence * clamp01(lift);
				r += ((.5 + .5 * liquidWave(t)) * (.35 + .65 * r) - r) * m;
				g += ((.5 + .5 * liquidWave(t * 1.18 + .17)) * (.35 + .65 * g) - g) * m;
				b += ((.5 + .5 * liquidWave(t * 1.39 + .31)) * (.35 + .65 * b) - b) * m;
			}
			if (p.sheen) {
				const nx = -sx * .02, ny = -sy * .02;
				let s = Math.max(0, (nx * hx + ny * hy + hz) / Math.sqrt(nx * nx + ny * ny + 1));
				s *= s; s *= s; s *= s; s *= s; s *= s;
				const spec = s * p.sheen * 1.4;
				r += spec; g += spec; b += spec;
			}
			const o = (j * w + i) * 4, m = p.strength, oa = alpha * m + src[o + 3] * (1 - m);
			const mixed = (value, c) => oa > 1e-4 ? (clamp01(value) * alpha * m + src[o + c] * (1 - m)) / oa : 0;
			out[o] = Math.round(mixed(r, 0) * 255); out[o + 1] = Math.round(mixed(g, 1) * 255); out[o + 2] = Math.round(mixed(b, 2) * 255);
			out[o + 3] = Math.round(clamp01(oa) * 255);
		}
		return out;
	}
}

// The saved still's pixel size: its long side at most LIQUID_STILL_SIDE.
export function liquidStillSize(box) {
	const w = Math.max(1e-3, box.maxX - box.minX), h = Math.max(1e-3, box.maxY - box.minY), k = Math.min(1, LIQUID_STILL_SIDE / Math.max(w, h));
	return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// The still the saved file shows: the same settings and picture give the same pixels. A
// generator, so a caller can yield to the page between steps; its return value is the RGBA.
export function* liquidStillSteps(effect, source, width, height) {
	const e = admitLiquid(effect);
	if (!e) throw new TypeError('Invalid liquid light effect');
	const sim = new LiquidReference(e, source, width, height);
	const steps = Math.round(e.time / LIQUID_STILL_STEP);
	for (let i = 0; i < steps; i++) { sim.step(LIQUID_STILL_STEP); yield (i + 1) / (steps + 1); }
	return sim.shade();
}
export function liquidStill(effect, source, width, height) {
	const job = liquidStillSteps(effect, source, width, height);
	for (;;) { const next = job.next(); if (next.done) return next.value; }
}

// ---- Saved form: the editable source, hidden, and the still other viewers show. ----

// A 64-bit FNV-1a over the settings, frame and source markup names one still.
export function liquidStillKey(effect, body, box) {
	const text = JSON.stringify(admitLiquid(effect)) + '|' + [box.minX, box.minY, box.maxX, box.maxY].join(' ') + '|' + body;
	let a = 0x811c9dc5, b = 0x050c5d1f;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x01000193) ^ (a >>> 15);
	}
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const stills = new Map(), wanted = new Map();
const JXL_STILL = /^data:image\/jxl;base64,[A-Za-z0-9+/]+=*$/;
// Rendered stills, by key. Draw fills this; a file's own stills return through liquidStillsFromSVG.
export function liquidStillPut(key, href) {
	if (typeof key !== 'string' || !/^[0-9a-f]{16}$/.test(key) || typeof href !== 'string' || href.length > 4 * 1024 * 1024 || !JXL_STILL.test(href)) return false;
	stills.delete(key); stills.set(key, href);
	while (stills.size > 48) stills.delete(stills.keys().next().value);
	wanted.delete(key);
	return true;
}
export function liquidStillHas(key) { return stills.has(key); }
// Stills a writer asked for and did not have, handed over once: Draw renders these before Done writes.
export function liquidStillsWanted() { const jobs = [...wanted.values()]; wanted.clear(); return jobs; }
export function liquidStillsFromSVG(svg) {
	if (typeof svg !== 'string' || !svg.includes('data-rapier-liquid-still')) return 0;
	let found = 0;
	for (const match of svg.matchAll(/<image\b[^>]*\sdata-rapier-liquid-still="([0-9a-f]{16})"[^>]*\shref="([^"]+)"/g)) if (liquidStillPut(match[1], match[2])) found++;
	return found;
}

const fmt = n => String(Math.round(n * 1e5) / 1e5);
export function liquidMarkup(effect, body, box, key, scene = false) {
	const e = admitLiquid(effect);
	if (!e) throw new TypeError('Invalid liquid light effect');
	if (!e.strength) return body;
	const id = 'rapier-liquid-' + Array.from(String(key), c => c.codePointAt(0).toString(16)).join('-');
	const still = liquidStillKey(e, body, box), href = stills.get(still);
	if (!href) { wanted.set(still, { key: still, effect: e, body, box: { ...box } }); while (wanted.size > 16) wanted.delete(wanted.keys().next().value); }
	const frame = ' x="' + fmt(box.minX) + '" y="' + fmt(box.minY) + '" width="' + fmt(box.maxX - box.minX) + '" height="' + fmt(box.maxY - box.minY) + '"';
	// Viewers show the still; Rapier reads the recipe, keeps the source editable and runs the fluid live.
	return '<g data-rapier-effect="liquid" data-effect-filter="' + id + '" data-liquid-frame="' + [box.minX, box.minY, box.maxX, box.maxY].map(fmt).join(' ') + '">' +
		'<g data-rapier-liquid-source=""' + (scene ? ' data-rapier-effect-scene=""' : '') + (href ? ' display="none"' : '') + '>' + body + '</g>' +
		(href ? '<image data-rapier-liquid-still="' + still + '"' + frame + ' preserveAspectRatio="none" href="' + href + '"/>' : '') + '</g>';
}
