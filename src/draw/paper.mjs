// SPDX-License-Identifier: AGPL-3.0-only
import {PAPER_OCTAVES} from './grain.mjs';
const BANDS = 10, LIMIT = 1e6, FLOOR = 1 / 255;
const bounded = (x, lo, hi, name) => {
	if (!Number.isFinite(x) || x < lo || x > hi) throw new RangeError(name);
	return x;
};
function count(width, height) {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(width * height)) throw new RangeError('Paper size');
	return width * height;
}
export function wetBytes(width, height, bands = BANDS) { return count(width, height) * (48 + bands * 8) + bands * 20; }
function refusal() { const e = new RangeError('Painting is too large for wet media'); e.code = 'PAINT_WET_BUDGET'; throw e; }
function hash(seed, x, y) {
	let n = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
	n = Math.imul(n ^ n >>> 13, 1274126177);
	return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise(seed, x, y, size) {
	const ix = Math.floor(x / size), iy = Math.floor(y / size);
	let a = x / size - ix, b = y / size - iy;
	a *= a * (3 - 2 * a); b *= b * (3 - 2 * b);
	const n0 = hash(seed, ix, iy), n1 = hash(seed, ix + 1, iy), n2 = hash(seed, ix, iy + 1), n3 = hash(seed, ix + 1, iy + 1);
	return (n0 + (n1 - n0) * a) * (1 - b) + (n2 + (n3 - n2) * a) * b;
}
const [[S0, W0, M0], [S1, W1, M1], [S2, W2, M2]] = PAPER_OCTAVES;
export function toothAt(seed, x, y, tooth = .5, grain = 1) {
	return tooth * (W0 * noise(seed ^ M0, x, y, S0 * grain) + W1 * noise(seed ^ M1, x, y, S1 * grain) + W2 * noise(seed ^ M2, x, y, S2 * grain));
}
export function paper(seed, width, height, { tooth = .5, absorbency = .5, tint = [1, 1, 1], originX = 0, originY = 0, grain = 1, within = null } = {}) {
	const n = count(width, height);
	bounded(seed, 0, 4294967295, 'Paper seed'); if (!Number.isInteger(seed)) throw new RangeError('Paper seed');
	bounded(tooth, 0, 1, 'Paper tooth'); bounded(absorbency, 0, 1, 'Paper absorbency');
	if (!tint || tint.length !== 3) throw new RangeError('Paper tint');
	tint = Array.from(tint, v => bounded(v, 0, 1, 'Paper tint'));
	if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) throw new RangeError('Paper origin');
	const heightField = new Float32Array(n);
	const inner = within && within.seed === seed && within.tooth === tooth && within.grain === grain && within.originX >= originX && within.originY >= originY &&
		within.originX + within.width <= originX + width && within.originY + within.height <= originY + height ? within : null;
	const ix0 = inner ? inner.originX - originX : 0, iy0 = inner ? inner.originY - originY : 0, ix1 = inner ? ix0 + inner.width : 0, iy1 = inner ? iy0 + inner.height : 0;
	for (let y = 0; y < height; y++) {
		const row = y * width, kept = y >= iy0 && y < iy1;
		if (kept) heightField.set(inner.heightField.subarray((y - iy0) * inner.width, (y - iy0 + 1) * inner.width), row + ix0);
		for (let x = 0; x < width; x++) {
			if (kept && x === ix0) { x = ix1 - 1; continue; }
			heightField[row + x] = toothAt(seed, x + originX, y + originY, tooth, grain);
		}
	}
	return { seed, width, height, tooth, absorbency, tint, heightField, originX, originY, grain };
}
export function rewindowWetState(prev, next, dx, dy) {
	if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || dx < 0 || dy < 0 || dx + prev.width > next.width || dy + prev.height > next.height) throw new RangeError('Wet window');
	if (prev.bands !== next.bands || prev.mixing !== next.mixing) throw new RangeError('Wet mixing basis');
	const BANDS = prev.bands, W0 = prev.width, W1 = next.width;
	for (let y = 0; y < prev.height; y++) {
		const i = y * W0, j = (y + dy) * W1 + dx;
		for (const key of ['w', 'amount', 'settledAmount', 'clock', 'vx', 'vy']) next[key].set(prev[key].subarray(i, i + W0), j);
		for (const key of ['suspended', 'settled']) next[key].set(prev[key].subarray(i * BANDS, (i + W0) * BANDS), j * BANDS);
		for (const key of ['base', 'pixels']) next[key].set(prev[key].subarray(i * 4, (i + W0) * 4), j * 4);
	}
	next.elapsed = prev.elapsed; next.steps = prev.steps; next.wet = prev.wet;
	if (prev.active) next.active = { x0: prev.active.x0 + dx, y0: prev.active.y0 + dy, x1: prev.active.x1 + dx, y1: prev.active.y1 + dy };
	if (prev.wetBox) next.wetBox = { x0: prev.wetBox.x0 + dx, y0: prev.wetBox.y0 + dy, x1: prev.wetBox.x1 + dx, y1: prev.wetBox.y1 + dy };
	if (prev.composeBox) next.composeBox = { x0: prev.composeBox.x0 + dx, y0: prev.composeBox.y0 + dy, x1: prev.composeBox.x1 + dx, y1: prev.composeBox.y1 + dy };
	return next;
}
export function createWetState(substrate, { pixels, maxBytes, reservedBytes = 0, toSpectral, fromSpectral, bands = BANDS, mixing = 'log', granulation = .05, dryingTime = 1600, edgeDarkening = 1, backrun = 1, film = false, filmGain = 1, flow = 1, settling = 1, pin = 0, bleed = 0 } = {}) {
	if ({log: 10, pigment: 41, digital: 3}[mixing] !== bands) throw new RangeError('Wet mixing basis');
	const BANDS = bands;
	const { width, height } = substrate, bytes = wetBytes(width, height, bands), n = width * height;
	if (!Number.isFinite(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(reservedBytes) || reservedBytes < 0 || bytes + reservedBytes > maxBytes) refusal();
	if (!(pixels instanceof Float32Array) || pixels.length !== n * 4 || !(substrate.heightField instanceof Float32Array) || substrate.heightField.length !== n) throw new TypeError('Wet surface');
	if (typeof toSpectral !== 'function' || typeof fromSpectral !== 'function') throw new TypeError('Spectral adapter');
	bounded(granulation, 0, 1, 'Granulation'); bounded(dryingTime, 1, 60000, 'Drying time');
	bounded(edgeDarkening, 0, 1, 'Edge darkening'); bounded(backrun, 0, 1, 'Back-run'); bounded(bleed, 0, 1, 'Bleed');
	const tintLog = new Float32Array(BANDS), white = new Float32Array(BANDS), whiteLog = new Float32Array(BANDS);
	toSpectral(...substrate.tint, tintLog); toSpectral(1, 1, 1, white);
	for (let k = 0; k < BANDS; k++) { tintLog[k] = mixing === 'log' ? Math.log(tintLog[k] / white[k]) : tintLog[k] - white[k]; whiteLog[k] = mixing === 'log' ? Math.log(white[k]) : white[k]; }
	return { paper: substrate, width, height, pixels, bytes, bands, mixing, toSpectral, fromSpectral, granulation, dryingTime, edgeDarkening, backrun, film: !!film, filmGain, flow, settling, pin, bleed,
		gx: 0, gy: 0,
		w: new Float32Array(n), suspended: new Float32Array(n * BANDS), settled: new Float32Array(n * BANDS),
		amount: new Float32Array(n), settledAmount: new Float32Array(n), clock: new Float32Array(n),
		vx: new Float32Array(n), vy: new Float32Array(n), nextWater: new Float32Array(n), base: pixels.slice(),
		spectrum: new Float32Array(BANDS), ground: white, mix: new Float32Array(BANDS), tintLog, whiteLog, rgb: [0, 0, 0],
		active: null, wetBox: null, composeBox: null, elapsed: 0, steps: 0, wet: false, hMax: Math.min(48, Math.max(8, 8 / Math.max(.05, flow))) };
}
function touch(s, key, x0, y0, x1, y1) {
	const a = s[key];
	if (a) { a.x0 = Math.min(a.x0, x0); a.y0 = Math.min(a.y0, y0); a.x1 = Math.max(a.x1, x1); a.y1 = Math.max(a.y1, y1); }
	else s[key] = { x0, y0, x1, y1 };
}
export function deposit(s, dab) {
	const BANDS = s.bands;
	const { water = 0, pigment = 0, opaque = 1, x0, y0, w, h, mask, r = 0, g = 0, b = 0, brush = null, velocity = 0, hold = 0 } = dab;
	if (water === 0) return false;
	bounded(water, 0, 4, 'Water load'); bounded(pigment, 0, 4, 'Pigment load'); bounded(opaque, 0, 1, 'Wet opacity');
	if (![x0, y0, w, h].every(Number.isSafeInteger) || x0 < 0 || y0 < 0 || w < 1 || h < 1 || x0 + w > s.width || y0 + h > s.height || !mask || mask.length < w * h) throw new RangeError('Wet footprint');
	bounded(r, 0, 1, 'Wet red'); bounded(g, 0, 1, 'Wet green'); bounded(b, 0, 1, 'Wet blue');
	const holding = hold > 0 && brush;
	let any = false;
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const a = bounded(mask[m], 0, 1, 'Wet mask') * opaque, i = (y0 + y) * s.width + x0 + x;
		if (a) any = true;
		if (s.w[i] + a * water > LIMIT || (!holding && s.amount[i] + s.settledAmount[i] + a * pigment > LIMIT)) throw new RangeError('Wet load');
	}
	if (!any) return false;
	const dryLift = .95 - .6 * Math.min(1, pigment / Math.max(water, 1e-6));
	if (!holding) {
		s.toSpectral(r, g, b, s.spectrum);
		for (let k = 0; k < BANDS; k++) { if (!Number.isFinite(s.spectrum[k]) || s.mixing === 'log' && !(s.spectrum[k] > 0)) throw new RangeError('Wet spectrum'); if (s.mixing === 'log') s.spectrum[k] = Math.log(s.spectrum[k]); }
	}
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const a = mask[m] * opaque; if (!a) continue;
		const i = (y0 + y) * s.width + x0 + x, fresh = water * a, load = holding ? 0 : pigment * a, old = s.w[i];
		movePhase(s, i, -(old > 0 ? Math.min(.95, fresh * s.clock[i] / s.dryingTime * 6) : Math.min(dryLift, water * opaque * s.clock[i] / s.dryingTime * 6)) * s.backrun);
		s.clock[i] *= old / (old + fresh); s.w[i] += fresh; s.amount[i] += load;
		if (load) for (let k = 0; k < BANDS; k++) s.suspended[i * BANDS + k] += load * s.spectrum[k];
	}
	if (holding) transferHoldWet(s, brush, dab, velocity);
	touch(s, 'active', x0, y0, x0 + w - 1, y0 + h - 1); touch(s, 'wetBox', x0, y0, x0 + w - 1, y0 + h - 1); s.wet = true; return true;
}
export function suspend(s, dab) {
	const BANDS = s.bands;
	const { x0, y0, w, h, lift, mass, colour } = dab;
	if (![x0, y0, w, h].every(Number.isSafeInteger) || x0 < 0 || y0 < 0 || w < 1 || h < 1 || x0 + w > s.width || y0 + h > s.height) throw new RangeError('Lift footprint');
	if (!lift || lift.length < w * h || !mass || mass.length < w * h || !colour || colour.length < w * h * 3) throw new TypeError('Lift field');
	let any = false;
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const got = mass[m]; if (!(got > 0)) continue;
		bounded(got, 0, 4, 'Lift mass'); bounded(lift[m], 0, 1, 'Lift fraction');
		const i = (y0 + y) * s.width + x0 + x;
		if (s.amount[i] + s.settledAmount[i] + got > LIMIT) throw new RangeError('Lift load');
		any = true;
	}
	if (!any) return false;
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const got = mass[m]; if (!(got > 0)) continue;
		const i = (y0 + y) * s.width + x0 + x, p = i * 4, k = 1 - lift[m], ba = s.base[p + 3];
		if (s.film) {
			const g0 = Math.max(FLOOR, s.base[p] + 1 - ba), g1 = Math.max(FLOOR, s.base[p + 1] + 1 - ba), g2 = Math.max(FLOOR, s.base[p + 2] + 1 - ba);
			const n0 = Math.pow(g0, k), n1 = Math.pow(g1, k), n2 = Math.pow(g2, k), na = 1 - Math.min(n0, n1, n2), clear = 1 - na;
			s.base[p] = Math.max(0, n0 - clear); s.base[p + 1] = Math.max(0, n1 - clear); s.base[p + 2] = Math.max(0, n2 - clear); s.base[p + 3] = na;
		} else if (ba > 0) {
			const na = 1 - Math.pow(1 - (ba < .999 ? ba : .999), k), kk = na / ba;
			s.base[p] *= kk; s.base[p + 1] *= kk; s.base[p + 2] *= kk; s.base[p + 3] *= kk;
		}
		s.toSpectral(colour[m * 3], colour[m * 3 + 1], colour[m * 3 + 2], s.spectrum);
		for (let b = 0; b < BANDS; b++) if (!Number.isFinite(s.spectrum[b]) || s.mixing === 'log' && !(s.spectrum[b] > 0)) throw new RangeError('Lift spectrum');
		s.amount[i] += got;
		for (let b = 0; b < BANDS; b++) s.suspended[i * BANDS + b] += got * (s.mixing === 'log' ? Math.log(s.spectrum[b]) : s.spectrum[b]);
	}
	touch(s, 'active', x0, y0, x0 + w - 1, y0 + h - 1); touch(s, 'wetBox', x0, y0, x0 + w - 1, y0 + h - 1); s.wet = true;
	return true;
}
function mingle(s, a, b, h) {
	const BANDS = s.bands;
	const f = s.bleed * h * .02;
	if (!(f > 0)) return;
	const q = f > .25 ? .25 : f, aa = s.amount[a], ab = s.amount[b];
	if (!(aa > 0) && !(ab > 0)) return;
	const ma = aa * q, mb = ab * q;
	s.amount[a] = aa - ma + mb; s.amount[b] = ab - mb + ma;
	for (let k = 0; k < BANDS; k++) {
		const i = a * BANDS + k, j = b * BANDS + k, pa = s.suspended[i] * q, pb = s.suspended[j] * q;
		s.suspended[i] += pb - pa; s.suspended[j] += pa - pb;
	}
}
function transfer(s, a, b, velocity, h, damping) {
	const BANDS = s.bands;
	const water = s.w, wa = water[a], wb = water[b];
	if (!wa && !wb) { velocity[a] = 0; return; }
	if (s.bleed && wa > 0 && wb > 0) mingle(s, a, b, h);
	const field = s.paper.heightField;
	const g = velocity === s.vx ? s.gx : s.gy;
	const pressure = wa - wb + .12 * (field[a] - field[b]) + (g ? g * (wa + wb) * .5 : 0);
	const v = velocity[a] * damping + h * .09 * pressure * s.flow;
	const source = v > 0 ? a : b, target = v > 0 ? b : a, available = water[source];
	let gate = 1;
	if (s.pin && water[target] === 0) {
		const u = Math.abs(pressure) / s.pin;
		if (u < 1) { gate = u * u; if (gate < 1e-4) return; }
	}
	const q = Math.min(Math.abs(v) * h * .02 * s.flow, available * .24) * gate;
	velocity[a] = Math.fround(v);
	if (!q) return;
	const fraction = q / available, incomingAge = s.clock[source];
	const age = Math.max(0, s.clock[target] - incomingAge) / s.dryingTime;
	const lift = Math.min(.25, q * age) * s.backrun;
	const front = Math.min(.95, age * 6) * s.backrun;
	if (lift && s.settledAmount[target]) movePhase(s, target, -lift);
	const prior = water[target];
	water[source] -= q; water[target] += q;
	s.clock[target] = (s.clock[target] * prior + incomingAge * q) / (prior + q);
	const mass = s.amount[source] * fraction; s.amount[source] -= mass; s.amount[target] += mass * (1 - front); s.settledAmount[target] += mass * front;
	for (let k = 0; k < BANDS; k++) { const i = source * BANDS + k, j = target * BANDS + k, p = s.suspended[i] * fraction; s.suspended[i] -= p; s.suspended[j] += p * (1 - front); s.settled[j] += p * front; }
}
function movePhase(s, i, fraction) {
	const BANDS = s.bands;
	if (!fraction) return;
	const forward = fraction >= 0, fromMass = forward ? s.amount : s.settledAmount, intoMass = forward ? s.settledAmount : s.amount;
	if (!fromMass[i]) return;
	const from = forward ? s.suspended : s.settled, into = forward ? s.settled : s.suspended;
	fraction = Math.abs(fraction);
	const m = fromMass[i] * fraction; fromMass[i] -= m; intoMass[i] += m;
	for (let k = 0; k < BANDS; k++) { const j = i * BANDS + k, p = from[j] * fraction; from[j] -= p; into[j] += p; }
}
export function finishWetWork(work) {
	let part; do { part = work.next(); } while (!part.done); return part.value;
}
export function step(s, dt) { return finishWetWork(stepWork(s, dt)); }
export function* stepWork(s, dt) {
	let cells = 0;
	bounded(dt, 0, 60000, 'Wet time'); s.elapsed += dt;
	if (!dt || !s.wet || !s.active) return false;
	let remaining = dt;
	while (remaining > 0 && s.wet) {
		const h = Math.min(s.hMax, remaining), damping = Math.exp(-h * .035); remaining -= h; s.steps++;
		const W = s.width, H = s.height, a = s.wetBox || s.active;
		const x0 = Math.max(0, a.x0 - 2), y0 = Math.max(0, a.y0 - 2), x1 = Math.min(W - 1, a.x1 + 2), y1 = Math.min(H - 1, a.y1 + 2);
		const cb = s.composeBox;
		s.composeBox = cb ? { x0: Math.min(cb.x0, x0), y0: Math.min(cb.y0, y0), x1: Math.max(cb.x1, x1), y1: Math.max(cb.y1, y1) } : { x0, y0, x1, y1 };
		for (let parity = 0; parity < 2; parity++) for (let y = y0; y <= y1; y++) for (let x = x0 + ((x0 + parity) % 2); x < x1; x += 2) { if (!(++cells & 127)) yield; transfer(s, y * W + x, y * W + x + 1, s.vx, h, damping); }
		for (let parity = 0; parity < 2; parity++) for (let y = y0 + ((y0 + parity) % 2); y < y1; y += 2) for (let x = x0; x <= x1; x++) { if (!(++cells & 127)) yield; transfer(s, y * W + x, (y + 1) * W + x, s.vy, h, damping); }
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
			if (!(++cells & 127)) yield;
			const i = y * W + x, water = s.w[i];
			const face = v => { const r = water > 0 ? v / water : 0, u = r >= .7 ? 0 : r <= .3 ? 1 : (.7 - r) / .4; return u * u * (3 - 2 * u); };
			const edge = (!x ? 1 : face(s.w[i - 1])) + (x + 1 === W ? 1 : face(s.w[i + 1])) + (!y ? 1 : face(s.w[i - W])) + (y + 1 === H ? 1 : face(s.w[i + W]));
			s.nextWater[i] = water - Math.min(water, h / s.dryingTime * (.35 + s.paper.absorbency * .65) * (1 + edge * 2 * s.edgeDarkening));
		}
		let left = W, top = H, right = -1, bottom = -1, anyWet = false, wl = W, wt = H, wr = -1, wb = -1;
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
			if (!(++cells & 127)) yield;
			const i = y * W + x, water = s.w[i];
			if (water > 0) {
				s.w[i] = s.nextWater[i];
				const valley = s.paper.tooth - s.paper.heightField[i];
				const capture = s.w[i] === 0 ? 1 : 1 - Math.exp(-h / s.dryingTime * (.1 * s.settling + s.granulation * valley * 24) / (.12 + s.w[i]));
				movePhase(s, i, capture); s.clock[i] += h;
			}
			if (s.w[i] > 0) { anyWet = true; wl = Math.min(wl, x); wt = Math.min(wt, y); wr = Math.max(wr, x); wb = Math.max(wb, y); }
			if (s.w[i] > 0 || s.amount[i] + s.settledAmount[i] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
		}
		if (right >= 0) touch(s, 'active', left, top, right, bottom);
		s.wetBox = wr >= 0 ? { x0: wl, y0: wt, x1: wr, y1: wb } : null;
		s.wet = anyWet;
	}
	return true;
}
export function settle(s, options) { return finishWetWork(settleWork(s, options)); }
export function* settleWork(s, { finish = false, rect = null } = {}) {
	const BANDS = s.bands;
	let cells = 0;
	const a = rect || s.active; if (!a) return null;
	const { pixels, base, ground, mix, rgb } = s;
	let whiteGround = false;
	for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) {
		if (!(++cells & 127)) yield;
		const i = y * s.width + x, p = i * 4;
		if (finish) { movePhase(s, i, 1); s.w[i] = 0; s.vx[i] = s.vy[i] = 0; }
		const mass = s.amount[i] + s.settledAmount[i];
		if (!(mass > 0)) { pixels[p] = base[p]; pixels[p + 1] = base[p + 1]; pixels[p + 2] = base[p + 2]; pixels[p + 3] = base[p + 3]; continue; }
		if (s.film) {
			const bA = base[p + 3];
			if (bA !== 0 || base[p] !== 0 || base[p + 1] !== 0 || base[p + 2] !== 0) { s.toSpectral(base[p] + 1 - bA, base[p + 1] + 1 - bA, base[p + 2] + 1 - bA, ground); whiteGround = false; }
			else if (!whiteGround) { s.toSpectral(1, 1, 1, ground); whiteGround = true; }
			for (let k = 0; k < BANDS; k++) mix[k] = ground[k] * Math.exp((s.suspended[i * BANDS + k] + s.settled[i * BANDS + k] - mass * s.whiteLog[k]) * s.filmGain + s.tintLog[k]);
			s.fromSpectral(mix, rgb);
			const outA = Math.max(bA, 1 - Math.min(rgb[0], rgb[1], rgb[2]));
			for (let c = 0; c < 3; c++) pixels[p + c] = Math.min(outA, Math.max(0, rgb[c] - (1 - outA)));
			pixels[p + 3] = outA;
			continue;
		}
		const alpha = 1 - Math.exp(-mass), ba = base[p + 3] * (1 - alpha), out = alpha + ba;
		if (!(out > 0)) { pixels[p] = base[p]; pixels[p + 1] = base[p + 1]; pixels[p + 2] = base[p + 2]; pixels[p + 3] = base[p + 3]; continue; }
		if (ba) s.toSpectral(base[p] / base[p + 3], base[p + 1] / base[p + 3], base[p + 2] / base[p + 3], ground);
		for (let k = 0; k < BANDS; k++) {
			const log = (s.suspended[i * BANDS + k] + s.settled[i * BANDS + k]) / mass;
			mix[k] = s.mixing === 'log' ? Math.exp((log + s.tintLog[k]) * alpha / out + (ba ? Math.log(ground[k]) * ba / out : 0)) : (log + s.tintLog[k]) * alpha / out + (ba ? ground[k] * ba / out : 0);
		}
		s.fromSpectral(mix, rgb);
		if (s.mixing !== 'log') for (let c = 0; c < 3; c++) rgb[c] = Math.max(0, Math.min(1, rgb[c]));
		pixels[p] = rgb[0] * out; pixels[p + 1] = rgb[1] * out; pixels[p + 2] = rgb[2] * out; pixels[p + 3] = out;
	}
	if (finish) s.wet = false;
	return a;
}

export function setGravity(s, gx, gy) {
	if (!s) return;
	s.gx = bounded(Math.max(-1, Math.min(1, gx || 0)), -1, 1, 'Gravity x');
	s.gy = bounded(Math.max(-1, Math.min(1, gy || 0)), -1, 1, 'Gravity y');
}

// on the brush as well as the canvas; a dab is a two-way transfer. At rapier_hold 0 none of this
// raster pixels across at RAPIER_PAINT_GRAIN 3, so a cell is about two pixels. 32×32 on the same
export const HOLD_N = 16;
export const XFER_FRACTION = .1, MAX_XFER_QUANTITY = .008, EQUAL_PAINT_CUTOFF = 1 / 30;
export const HOLD_TRAVEL = 20;
const movedLogs = new Float32Array(41), holdLogs = new Float32Array(41);

export function createBrushStore(n = HOLD_N, bands = BANDS) {
	if (![3, 10, 41].includes(bands)) throw new RangeError('Brush mixing basis');
	const BANDS = bands;
	if (!Number.isSafeInteger(n) || n < 1 || n > 64) throw new RangeError('Brush store');
	const cells = n * n;
	return { n, bands, amount: new Float32Array(cells), logs: new Float32Array(cells * BANDS), water: new Float32Array(cells) };
}

export function loadBrush(store, { mass, water = 0, logs }) {
	const BANDS = store.bands;
	const cells = store.n * store.n, m = mass / cells, w = water / cells;
	if (!logs || logs.length < BANDS) throw new TypeError('Brush spectrum');
	for (let i = 0; i < cells; i++) {
		store.amount[i] = m; store.water[i] = w;
		for (let k = 0; k < BANDS; k++) store.logs[i * BANDS + k] = m * logs[k];
	}
}

export function brushTotals(store) {
	const BANDS = store.bands;
	let amount = 0, water = 0;
	const bands = new Float64Array(BANDS);
	for (let i = 0; i < store.amount.length; i++) {
		amount += store.amount[i]; water += store.water[i];
		for (let k = 0; k < BANDS; k++) bands[k] += store.logs[i * BANDS + k];
	}
	return { amount, water, bands };
}

export function holdAmount(a_b, a_c, velocity, contact) {
	if (!(contact > 0)) return 0;
	const paintDiff = a_b - a_c;
	const equalPaintCutoff = Math.abs(paintDiff) / EQUAL_PAINT_CUTOFF;
	if (!(equalPaintCutoff > 0)) return 0;
	const t = velocity <= .2 ? 0 : velocity >= .3 ? 1 : (velocity - .2) / .1;
	const velocityCutoff = t * t * (3 - 2 * t);
	if (!(velocityCutoff > 0)) return 0;
	let amt = (paintDiff > 0 ? a_b : a_c) * XFER_FRACTION * (equalPaintCutoff > 1 ? 1 : equalPaintCutoff) * velocityCutoff * contact;
	if (amt > MAX_XFER_QUANTITY) amt = MAX_XFER_QUANTITY;
	if (!(amt > 0)) return 0;
	return paintDiff > 0 ? amt : -amt;
}

function takeMass(amount, logs, i, amt, BANDS) {
	if (!(amt > 0) || !(amount[i] > 0)) return 0;
	if (amt > amount[i]) amt = amount[i];
	const frac = amt / amount[i];
	amount[i] -= amt;
	for (let k = 0; k < BANDS; k++) {
		movedLogs[k] = logs[i * BANDS + k] * frac;
		logs[i * BANDS + k] -= movedLogs[k];
	}
	if (!(amount[i] > 1e-15)) { amount[i] = 0; for (let k = 0; k < BANDS; k++) logs[i * BANDS + k] = 0; }
	return amt;
}

function giveMass(amount, logs, i, amt, BANDS) {
	if (!(amt > 0)) return;
	amount[i] += amt;
	for (let k = 0; k < BANDS; k++) logs[i * BANDS + k] += movedLogs[k];
}

function transferHoldWet(s, store, dab, velocity) {
	const BANDS = s.bands;
	if (store.bands !== BANDS) throw new RangeError('Brush mixing basis');
	const { x0, y0, w, h, mask, opaque = 1 } = dab, n = store.n, cells = n * n;
	const col0 = dab.col0 ?? 0, col1 = dab.col1 ?? n;
	const contact = new Float32Array(cells), massC = new Float32Array(cells);
	const hits = new Array(cells);
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const a = mask[m] * opaque; if (!(a > 0)) continue;
		const bx = Math.min(n - 1, Math.floor((x + .5) * n / w));
		if (bx < col0 || bx >= col1) continue;
		const by = Math.min(n - 1, Math.floor((y + .5) * n / h)), c = by * n + bx, i = (y0 + y) * s.width + x0 + x;
		contact[c] += a; massC[c] += s.amount[i] * a;
		(hits[c] || (hits[c] = [])).push(i, a);
	}
	for (let c = 0; c < cells; c++) {
		if (!(contact[c] > 0)) continue;
		const amt = holdAmount(store.amount[c], massC[c] / contact[c], velocity, contact[c] > 1 ? 1 : contact[c]);
		if (!amt) continue;
		const pair = hits[c];
		if (amt > 0) {
			const taken = takeMass(store.amount, store.logs, c, amt, BANDS); if (!taken) continue;
			holdLogs.set(movedLogs);
			for (let p = 0; p < pair.length; p += 2) {
				const wgt = pair[p + 1] / contact[c];
				for (let k = 0; k < BANDS; k++) movedLogs[k] = holdLogs[k] * wgt;
				giveMass(s.amount, s.suspended, pair[p], taken * wgt, BANDS);
			}
		} else {
			let got = 0; holdLogs.fill(0);
			for (let p = 0; p < pair.length; p += 2) {
				got += takeMass(s.amount, s.suspended, pair[p], -amt * pair[p + 1] / contact[c], BANDS);
				for (let k = 0; k < BANDS; k++) holdLogs[k] += movedLogs[k];
			}
			movedLogs.set(holdLogs); giveMass(store.amount, store.logs, c, got, BANDS);
		}
	}
}
