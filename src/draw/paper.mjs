// SPDX-License-Identifier: AGPL-3.0-only
// Deterministic wet-media reference. Pigment is conserved as mass and ten mass-weighted
// log reflectances; the existing engine supplies the spectral transforms, never a second table.
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
// The fixed overhead is the per-band tables the state owns whatever its size: the paper's tint in
// log reflectance, the basis's own white in log (R80, the film law), the working spectrum and the
// mix. 200 bytes, checked against the real typed arrays by `check-paper`.
export function wetBytes(width, height) { return count(width, height) * 128 + 200; }
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
// The sheet's own tooth at one point, in paper coordinates -- the same three octaves `paper` lays
// into its field, sampled instead of stored. The wet solver works on cells of several raster pixels;
// this is how the FINAL image gets its grain at the resolution a person actually looks at (R80).
// The octaves are grain.mjs's, the one table the pressed letter's filter also reads.
const [[S0, W0, M0], [S1, W1, M1], [S2, W2, M2]] = PAPER_OCTAVES;
export function toothAt(seed, x, y, tooth = .5, grain = 1) {
	return tooth * (W0 * noise(seed ^ M0, x, y, S0 * grain) + W1 * noise(seed ^ M1, x, y, S1 * grain) + W2 * noise(seed ^ M2, x, y, S2 * grain));
}
export function paper(seed, width, height, { tooth = .5, absorbency = .5, tint = [1, 1, 1], originX = 0, originY = 0, grain = 1 } = {}) {
	const n = count(width, height);
	bounded(seed, 0, 4294967295, 'Paper seed'); if (!Number.isInteger(seed)) throw new RangeError('Paper seed');
	bounded(tooth, 0, 1, 'Paper tooth'); bounded(absorbency, 0, 1, 'Paper absorbency');
	if (!tint || tint.length !== 3) throw new RangeError('Paper tint');
	tint = Array.from(tint, v => bounded(v, 0, 1, 'Paper tint'));
	// R79: a window of a larger sheet. The tooth is a function of absolute paper coordinates, so
	// two windows of one seed agree wherever they overlap and a window that moves keeps its grain.
	if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) throw new RangeError('Paper origin');
	const heightField = new Float32Array(n);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const px = x + originX, py = y + originY; heightField[y * width + x] = toothAt(seed, px, py, tooth, grain); }
	return { seed, width, height, tooth, absorbency, tint, heightField, originX, originY, grain };
}
// R79: move a live wet state into a larger window (the stroke grew past the one it began in).
// `next` is a fresh state over the new substrate and pixel window; `dx`/`dy` place the old
// window inside the new one. Every per-cell quantity is copied cell for cell; nothing is
// resampled, so mass and its spectra are conserved exactly. Returns `next`.
export function rewindowWetState(prev, next, dx, dy) {
	if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || dx < 0 || dy < 0 || dx + prev.width > next.width || dy + prev.height > next.height) throw new RangeError('Wet window');
	const W0 = prev.width, W1 = next.width;
	for (let y = 0; y < prev.height; y++) for (let x = 0; x < W0; x++) {
		const i = y * W0 + x, j = (y + dy) * W1 + x + dx;
		next.w[j] = prev.w[i]; next.amount[j] = prev.amount[i]; next.settledAmount[j] = prev.settledAmount[i]; next.clock[j] = prev.clock[i];
		next.vx[j] = prev.vx[i]; next.vy[j] = prev.vy[i];
		for (let k = 0; k < BANDS; k++) { next.suspended[j * BANDS + k] = prev.suspended[i * BANDS + k]; next.settled[j * BANDS + k] = prev.settled[i * BANDS + k]; }
		for (let c = 0; c < 4; c++) next.base[j * 4 + c] = prev.base[i * 4 + c];
	}
	next.elapsed = prev.elapsed; next.steps = prev.steps; next.wet = prev.wet;
	if (prev.active) next.active = { x0: prev.active.x0 + dx, y0: prev.active.y0 + dy, x1: prev.active.x1 + dx, y1: prev.active.y1 + dy };
	if (prev.wetBox) next.wetBox = { x0: prev.wetBox.x0 + dx, y0: prev.wetBox.y0 + dy, x1: prev.wetBox.x1 + dx, y1: prev.wetBox.y1 + dy };
	if (prev.composeBox) next.composeBox = { x0: prev.composeBox.x0 + dx, y0: prev.composeBox.y0 + dy, x1: prev.composeBox.x1 + dx, y1: prev.composeBox.y1 + dy };
	return next;
}
export function createWetState(substrate, { pixels, maxBytes, reservedBytes = 0, toSpectral, fromSpectral, granulation = .05, dryingTime = 1600, edgeDarkening = 1, backrun = 1, film = false, filmGain = 1, flow = 1, settling = 1, pin = 0, bleed = 0 } = {}) {
	const { width, height } = substrate, bytes = wetBytes(width, height), n = width * height;
	if (!Number.isFinite(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(reservedBytes) || reservedBytes < 0 || bytes + reservedBytes > maxBytes) refusal();
	if (!(pixels instanceof Float32Array) || pixels.length !== n * 4 || !(substrate.heightField instanceof Float32Array) || substrate.heightField.length !== n) throw new TypeError('Wet surface');
	if (typeof toSpectral !== 'function' || typeof fromSpectral !== 'function') throw new TypeError('Spectral adapter');
	bounded(granulation, 0, 1, 'Granulation'); bounded(dryingTime, 1, 60000, 'Drying time');
	bounded(edgeDarkening, 0, 1, 'Edge darkening'); bounded(backrun, 0, 1, 'Back-run'); bounded(bleed, 0, 1, 'Bleed');
	const tintLog = new Float32Array(BANDS), white = new Float32Array(BANDS), whiteLog = new Float32Array(BANDS);
	toSpectral(...substrate.tint, tintLog); toSpectral(1, 1, 1, white);
	for (let k = 0; k < BANDS; k++) { tintLog[k] = Math.log(tintLog[k] / white[k]); whiteLog[k] = Math.log(white[k]); }
	return { paper: substrate, width, height, pixels, bytes, toSpectral, fromSpectral, granulation, dryingTime, edgeDarkening, backrun, film: !!film, filmGain, flow, settling, pin, bleed,
		// Which way is down (R80). A phone knows how it is being held, so a wash can run downhill the
		// way it does on a tilted sheet of paper. Set by the tool from the device's own orientation;
		// [0, 0] -- a sheet lying flat, and the reference's own state -- is no bias at all.
		gx: 0, gy: 0,
		w: new Float32Array(n), suspended: new Float32Array(n * BANDS), settled: new Float32Array(n * BANDS),
		amount: new Float32Array(n), settledAmount: new Float32Array(n), clock: new Float32Array(n),
		vx: new Float32Array(n), vy: new Float32Array(n), nextWater: new Float32Array(n), base: pixels.slice(),
		spectrum: new Float32Array(BANDS), ground: white, mix: new Float32Array(BANDS), tintLog, whiteLog, rgb: [0, 0, 0],
		// `active` is every cell the RENDERER must revisit (water or any pigment, dry included);
		// `wetBox` is only where water actually is, which is all the solver has to step. Without the
		// second one, a stroke's dry pigment keeps the whole painted rectangle in the physics loop
		// for the rest of the session and drying a wash costs more the more has been painted (R79).
		// `composeBox` is what the RENDERER is owed: every cell this step could have changed, unioned
		// until someone composes it. `wetBox` cannot serve -- it is recomputed AFTER the step, so a
		// cell that dried during it has already left, and its last change would never be drawn
		// (Codex R81, measured: 29,191 stale channels, max 0.236328). A cell only changes if it or a
		// neighbour held water when the step began, which is exactly the scanned region.
		active: null, wetBox: null, composeBox: null, elapsed: 0, steps: 0, wet: false, hMax: Math.min(48, Math.max(8, 8 / Math.max(.05, flow))) };
}
function touch(s, key, x0, y0, x1, y1) {
	const a = s[key];
	if (a) { a.x0 = Math.min(a.x0, x0); a.y0 = Math.min(a.y0, y0); a.x1 = Math.max(a.x1, x1); a.y1 = Math.max(a.y1, y1); }
	else s[key] = { x0, y0, x1, y1 };
}
export function deposit(s, dab) {
	const { water = 0, pigment = 0, opaque = 1, x0, y0, w, h, mask, r = 0, g = 0, b = 0, brush = null, velocity = 0, hold = 0 } = dab;
	if (water === 0) return false;
	bounded(water, 0, 4, 'Water load'); bounded(pigment, 0, 4, 'Pigment load'); bounded(opaque, 0, 1, 'Wet opacity');
	if (![x0, y0, w, h].every(Number.isSafeInteger) || x0 < 0 || y0 < 0 || w < 1 || h < 1 || x0 + w > s.width || y0 + h > s.height || !mask || mask.length < w * h) throw new RangeError('Wet footprint');
	bounded(r, 0, 1, 'Wet red'); bounded(g, 0, 1, 'Wet green'); bounded(b, 0, 1, 'Wet blue');
	const holding = hold > 0 && brush;
	// Validate the entire footprint before changing any physical state. Overflow refuses a dab;
	// neither the water nor its pigment is clipped away to keep a misleading partial mark.
	let any = false;
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const a = bounded(mask[m], 0, 1, 'Wet mask') * opaque, i = (y0 + y) * s.width + x0 + x;
		if (a) any = true;
		if (s.w[i] + a * water > LIMIT || (!holding && s.amount[i] + s.settledAmount[i] + a * pigment > LIMIT)) throw new RangeError('Wet load');
	}
	if (!any) return false;
	// Set once for the whole footprint: the dab's own pigment-to-water ratio decides how much of a
	// dried deposit it can re-suspend (see the lift below).
	const dryLift = .95 - .6 * Math.min(1, pigment / Math.max(water, 1e-6));
	if (!holding) {
		s.toSpectral(r, g, b, s.spectrum);
		for (let k = 0; k < BANDS; k++) { if (!(s.spectrum[k] > 0) || !Number.isFinite(s.spectrum[k])) throw new RangeError('Wet spectrum'); s.spectrum[k] = Math.log(s.spectrum[k]); }
	}
	for (let y = 0, m = 0; y < h; y++) for (let x = 0; x < w; x++, m++) {
		const a = mask[m] * opaque; if (!a) continue;
		const i = (y0 + y) * s.width + x0 + x, fresh = water * a, load = holding ? 0 : pigment * a, old = s.w[i];
		// Fresh water on an aged deposit lifts pigment back into suspension (the back-run). A damp
		// cell is lifted in proportion to the water this dab brings it; a DRY cell by the dab's whole
		// water load (R79): fresh water has zero age, so the first dab to wet a cell resets its clock
		// and no later dab can lift it -- weighted by that first dab's mask, a stroke over a dry wash
		// printed rings of dab fringes (each fringe cell under-lifted for good). The dry cell's lift
		// therefore does not depend on which part of a dab happened to wet it first.
		// How much a DRY cell gives back depends on what the dab carries: clear water is the solvent
		// and lifts a dried wash almost wholly (the back-run, the cauliflower a person makes on
		// purpose), while a loaded brush lays a pigment film and barely disturbs what is under it --
		// otherwise a second colour glazed over a dry first washes it away (R79).
		movePhase(s, i, -(old > 0 ? Math.min(.95, fresh * s.clock[i] / s.dryingTime * 6) : Math.min(dryLift, water * opaque * s.clock[i] / s.dryingTime * 6)) * s.backrun);
		s.clock[i] *= old / (old + fresh); s.w[i] += fresh; s.amount[i] += load;
		if (load) for (let k = 0; k < BANDS; k++) s.suspended[i * BANDS + k] += load * s.spectrum[k];
	}
	if (holding) transferHoldWet(s, brush, dab, velocity);
	touch(s, 'active', x0, y0, x0 + w - 1, y0 + h - 1); touch(s, 'wetBox', x0, y0, x0 + w - 1, y0 + h - 1); s.wet = true; return true;
}
// LIFT (R86l): dry pigment already on the paper goes back into suspension, which is what water does.
//
// `deposit` above lifts a DRIED WASH -- pigment this solver laid and then let dry, whose age it
// still holds in `clock`. It cannot touch paint that never passed through here, and almost none of
// it has: a dry brush writes straight to the raster, and to a wash that raster is `base`, a ground
// to lay a film over. `settle` says so in one line -- with no wet mass a cell IS its base. So water
// run into ordinary paint had nothing to pick up, and the tool fell back to a blur times a fade.
// The mark went soft and pale and no pigment went anywhere, which is not water at all.
//
// What arrives here has already left the caller's raster: draw/paint.mjs owns the pixels, works out
// what a dab takes off them by Beer-Lambert, and hands over the mass and its colour per cell. The
// physics of suspension is this module's, so it lands here; `keep` is the same fraction applied to
// `base`, the cell-resolution copy the compose diffs against, because a compose that still held the
// lifted pigment in its ground would put it straight back on the next frame.
//
// Nothing downstream needs teaching. `step` already dries a wash from its rim inward -- the
// evaporation term counts a cell's dry faces -- and binds suspended pigment fastest where the water
// has gone, so pigment lifted out of the middle of a wet patch walks outward and stacks on the
// tideline. Edge darkening, the bloom and the back-run all fall out of the solver that is already
// here; none of them is drawn.
export function suspend(s, dab) {
	const { x0, y0, w, h, lift, mass, colour } = dab;
	if (![x0, y0, w, h].every(Number.isSafeInteger) || x0 < 0 || y0 < 0 || w < 1 || h < 1 || x0 + w > s.width || y0 + h > s.height) throw new RangeError('Lift footprint');
	if (!lift || lift.length < w * h || !mass || mass.length < w * h || !colour || colour.length < w * h * 3) throw new TypeError('Lift field');
	// Validate the whole footprint before changing any physical state, as `deposit` does: an overflow
	// refuses the lift outright rather than leaving half the paper stripped and half of it not.
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
		// The paper is lighter by exactly what left it, in the film's OWN arithmetic. A cell's ground
		// is its premultiplied colour over white -- the same reflectance `settle` reads to lay a film
		// on -- and a film's DENSITY is what adds, so lifting the fraction `f` leaves `ground^(1-f)`
		// here and carries a film of `ground^f` away. Those two multiply back to exactly `ground`:
		// water that lifts and puts it straight back changes nothing, which is the one property this
		// has to have. Scaling the four premultiplied channels by `1 - f` instead -- an alpha-linear
		// fade against a Beer-Lambert film -- does NOT cancel, and measured +14% alpha in the core of
		// a watered patch: paint that got DENSER for being diluted.
		// The floor is one 8-bit step. Below it `ground^k` can never climb back, so a black film would
		// be the one paint water could not lift, which is not true of any real black.
		if (s.film) {
			const g0 = Math.max(FLOOR, s.base[p] + 1 - ba), g1 = Math.max(FLOOR, s.base[p + 1] + 1 - ba), g2 = Math.max(FLOOR, s.base[p + 2] + 1 - ba);
			const n0 = Math.pow(g0, k), n1 = Math.pow(g1, k), n2 = Math.pow(g2, k), na = 1 - Math.min(n0, n1, n2), clear = 1 - na;
			s.base[p] = Math.max(0, n0 - clear); s.base[p + 1] = Math.max(0, n1 - clear); s.base[p + 2] = Math.max(0, n2 - clear); s.base[p + 3] = na;
		} else if (ba > 0) {
			// Without the film law a cell is alpha-composited, so the ground gives up its mass the
			// same way `settle` reads it back: alpha `1 - (1 - a)^(1 - f)`, and the four premultiplied
			// channels take the one factor because straight colour is untouched either way.
			const na = 1 - Math.pow(1 - (ba < .999 ? ba : .999), k), kk = na / ba;
			s.base[p] *= kk; s.base[p + 1] *= kk; s.base[p + 2] *= kk; s.base[p + 3] *= kk;
		}
		s.toSpectral(colour[m * 3], colour[m * 3 + 1], colour[m * 3 + 2], s.spectrum);
		for (let b = 0; b < BANDS; b++) if (!(s.spectrum[b] > 0) || !Number.isFinite(s.spectrum[b])) throw new RangeError('Lift spectrum');
		s.amount[i] += got;
		for (let b = 0; b < BANDS; b++) s.suspended[i * BANDS + b] += got * Math.log(s.spectrum[b]);
	}
	touch(s, 'active', x0, y0, x0 + w - 1, y0 + h - 1); touch(s, 'wetBox', x0, y0, x0 + w - 1, y0 + h - 1); s.wet = true;
	return true;
}
// Pigment BLEEDS between two cells that share water, moving or not (R80). Advection carries pigment
// only where the flux goes, so two washes laid side by side while both were wet met along a hard
// butt joint. The exchange is SYMMETRIC -- each cell gives the other the same fraction of what it
// holds -- so mass is exactly conserved and two cells holding equal masses of DIFFERENT colour still
// mix, which a difference-driven diffusion would not. Settled pigment is bound to the paper and
// never takes part; at `bleed` 0 the reference is unchanged.
function mingle(s, a, b, h) {
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
	const water = s.w, wa = water[a], wb = water[b];
	if (!wa && !wb) { velocity[a] = 0; return; }
	if (s.bleed && wa > 0 && wb > 0) mingle(s, a, b, h);
	const field = s.paper.heightField;
	// Gravity pulls the water in the pool, so it counts for as much as there is water to pull.
	const g = velocity === s.vx ? s.gx : s.gy;
	const pressure = wa - wb + .12 * (field[a] - field[b]) + (g ? g * (wa + wb) * .5 : 0);
	// `flow` (R79) scales how far water travels per unit time: the reference's coefficients were
	// set per raster pixel; on a coarser cell grid the same numbers spread a wash C times further.
	const v = velocity[a] * damping + h * .09 * pressure * s.flow;
	const source = v > 0 ? a : b, target = v > 0 ? b : a, available = water[source];
	// The wet front pins (R79). Water does not creep indefinitely into dry paper: it advances only
	// where the pressure behind it beats the paper's own resistance, and where it stops it stops
	// sharply -- which is what leaves a watercolour its hard edge and the rim of pigment on it. At
	// `pin` 0 (the reference) there is no threshold and nothing changes.
	// R80: the refusal is GRADED, not absolute. All-or-nothing stopped the front on a cell wall, so a
	// diagonal boundary climbed the grid in even steps with the rim of pigment on each one -- the row
	// of teeth along every stroke. Below the pinning pressure the flux is throttled by how close it
	// came rather than refused, so the contact line dies away over two or three cells and its place
	// between them is continuous. The hard refusal survives as the floor below which nothing moves.
	let gate = 1;
	if (s.pin && water[target] === 0) {
		const u = Math.abs(pressure) / s.pin;
		if (u < 1) { gate = u * u; if (gate < 1e-4) return; }
	}
	const q = Math.min(Math.abs(v) * h * .02 * s.flow, available * .24) * gate;
	velocity[a] = Math.fround(v);
	if (!q) return;
	const fraction = q / available, incomingAge = s.clock[source];
	// A fresh, moving front can lift part of an older deposit. The lifted pigment is local
	// suspension, subsequently carried by the same conservative fluxes as every other pigment.
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
	if (!fraction) return;
	const forward = fraction >= 0, fromMass = forward ? s.amount : s.settledAmount, intoMass = forward ? s.settledAmount : s.amount;
	if (!fromMass[i]) return;
	const from = forward ? s.suspended : s.settled, into = forward ? s.settled : s.suspended;
	fraction = Math.abs(fraction);
	const m = fromMass[i] * fraction; fromMass[i] -= m; intoMass[i] += m;
	for (let k = 0; k < BANDS; k++) { const j = i * BANDS + k, p = from[j] * fraction; from[j] -= p; into[j] += p; }
}
export function step(s, dt) {
	bounded(dt, 0, 60000, 'Wet time'); s.elapsed += dt;
	if (!dt || !s.wet || !s.active) return false;
	let remaining = dt;
	while (remaining > 0 && s.wet) {
		// The substep is capped so a flux cannot outrun its cell. That cap is 8 ms at the reference's
		// own flow; a surface that flows more slowly (`flow`, the coarse grid's own scaling) moves
		// that much less per millisecond and takes proportionally longer steps, which is what makes
		// a wash dry in view on a phone instead of a frame at a time. At flow 1 this is exactly 8.
		const h = Math.min(s.hMax, remaining), damping = Math.exp(-h * .035); remaining -= h; s.steps++;
		// Only where the water is, plus the two-cell margin its fluxes can reach this substep. Cells
		// with no water are exact no-ops in every pass below (`transfer` returns on two dry cells,
		// evaporation and capture are gated on `water > 0`), so this is a bound, not an approximation.
		const W = s.width, H = s.height, a = s.wetBox || s.active;
		const x0 = Math.max(0, a.x0 - 2), y0 = Math.max(0, a.y0 - 2), x1 = Math.min(W - 1, a.x1 + 2), y1 = Math.min(H - 1, a.y1 + 2);
		const cb = s.composeBox;
		s.composeBox = cb ? { x0: Math.min(cb.x0, x0), y0: Math.min(cb.y0, y0), x1: Math.max(cb.x1, x1), y1: Math.max(cb.y1, y1) } : { x0, y0, x1, y1 };
		// Four non-overlapping face passes. Their order is part of the reference; GPU passes
		// may run a parity in parallel, but must preserve these four barriers.
		for (let parity = 0; parity < 2; parity++) for (let y = y0; y <= y1; y++) for (let x = x0 + ((x0 + parity) % 2); x < x1; x += 2) transfer(s, y * W + x, y * W + x + 1, s.vx, h, damping);
		for (let parity = 0; parity < 2; parity++) for (let y = y0 + ((y0 + parity) % 2); y < y1; y += 2) for (let x = x0; x <= x1; x++) transfer(s, y * W + x, (y + 1) * W + x, s.vy, h, damping);
		// Every cell reads the same post-flow water state for border evaporation.
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
			const i = y * W + x, water = s.w[i];
			// How exposed this cell is: R80 counts each dry face CONTINUOUSLY. A step at half the
			// neighbour's water made the tideline jump by a whole face between one cell and the next,
			// printing a regular ripple of dark beads along a diagonal front. The ramp meets the old
			// test at both ends and fills in the cliff between them.
			const face = v => { const r = water > 0 ? v / water : 0, u = r >= .7 ? 0 : r <= .3 ? 1 : (.7 - r) / .4; return u * u * (3 - 2 * u); };
			const edge = (!x ? 1 : face(s.w[i - 1])) + (x + 1 === W ? 1 : face(s.w[i + 1])) + (!y ? 1 : face(s.w[i - W])) + (y + 1 === H ? 1 : face(s.w[i + W]));
			s.nextWater[i] = water - Math.min(water, h / s.dryingTime * (.35 + s.paper.absorbency * .65) * (1 + edge * 2 * s.edgeDarkening));
		}
		let left = W, top = H, right = -1, bottom = -1, anyWet = false, wl = W, wt = H, wr = -1, wb = -1;
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
			const i = y * W + x, water = s.w[i];
			if (water > 0) {
				s.w[i] = s.nextWater[i];
				const valley = s.paper.tooth - s.paper.heightField[i];
				// `settling` (R79) scales how fast suspended pigment binds to the paper while water is
				// still present: at 1 (the reference) nearly all of it travels with the water until the
				// cell dries, so a wash empties its middle into its rim; staining pigment settles sooner.
				const capture = s.w[i] === 0 ? 1 : 1 - Math.exp(-h / s.dryingTime * (.1 * s.settling + s.granulation * valley * 24) / (.12 + s.w[i]));
				movePhase(s, i, capture); s.clock[i] += h;
			}
			if (s.w[i] > 0) { anyWet = true; wl = Math.min(wl, x); wt = Math.min(wt, y); wr = Math.max(wr, x); wb = Math.max(wb, y); }
			if (s.w[i] > 0 || s.amount[i] + s.settledAmount[i] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
		}
		// The active rectangle includes historical pigment for rendering; the wet rectangle
		// expands by only the faces actually considered in this substep.
		if (right >= 0) touch(s, 'active', left, top, right, bottom);
		s.wetBox = wr >= 0 ? { x0: wl, y0: wt, x1: wr, y1: wb } : null;
		s.wet = anyWet;
	}
	return true;
}
// `rect` (R79) settles only those cells -- the live preview of one dab while the finger is down;
// `finish` dries everything: every suspended band settles, the water goes, the state is spent.
export function settle(s, { finish = false, rect = null } = {}) {
	const a = rect || s.active; if (!a) return null;
	const { pixels, base, ground, mix, rgb } = s;
	let whiteGround = false;
	for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) {
		const i = y * s.width + x, p = i * 4;
		if (finish) { movePhase(s, i, 1); s.w[i] = 0; s.vx[i] = s.vy[i] = 0; }
		const mass = s.amount[i] + s.settledAmount[i];
		if (!(mass > 0)) { pixels[p] = base[p]; pixels[p + 1] = base[p + 1]; pixels[p + 2] = base[p + 2]; pixels[p + 3] = base[p + 3]; continue; }
		if (s.film) {
			// The film law (R79): pigment is a transparent film over whatever is under it. Each band's
			// transmittance is exp(mass-weighted log reflectance * gain) -- Beer-Lambert, so more
			// pigment in a cell is darker and more saturated (the rim), and a glaze over a dry wash
			// multiplies with it (blue over gold goes dark green, not grey). The cell is encoded as
			// premultiplied RGBA that composes over white to exactly ground * film.
			const bA = base[p + 3];
			// Astra A7-1: a blank premultiplied base IS white, and the adapter's answer for white is the
			// same every time, so keep it across a run of blank cells. Verified exact for every call
			// site Rapier has -- 0 differing Float32 values over mixed and all-blank fields. It is NOT
			// exact for a STATEFUL toSpectral fed straight to the low-level createWetState API (which
			// checks only typeof === 'function'); nothing in this codebase does that.
			if (bA !== 0 || base[p] !== 0 || base[p + 1] !== 0 || base[p + 2] !== 0) { s.toSpectral(base[p] + 1 - bA, base[p + 1] + 1 - bA, base[p + 2] + 1 - bA, ground); whiteGround = false; }
			else if (!whiteGround) { s.toSpectral(1, 1, 1, ground); whiteGround = true; }
			// R80: the exponent is reflectance RELATIVE TO WHITE, the convention the tint is already
			// held in above. The stored band is the log of the ABSOLUTE spectrum and this basis's
			// white is not flat, so raising it to a power tilted every colour towards the basis's own
			// shape -- a black wash painted olive, while a saturated blue looked right and hid it.
			// Subtracting mass * log(white) leaves exp(mass * log(R/W) * gain): a neutral stays
			// neutral at every depth and a white pigment is a film that transmits everything.
			for (let k = 0; k < BANDS; k++) mix[k] = ground[k] * Math.exp((s.suspended[i * BANDS + k] + s.settled[i * BANDS + k] - mass * s.whiteLog[k]) * s.filmGain + s.tintLog[k]);
			s.fromSpectral(mix, rgb);
			// Premultiplied so that over white it is exactly ground * film: the alpha is what the
			// film's darkest channel takes from white, never less than the base's own alpha.
			const outA = Math.max(bA, 1 - Math.min(rgb[0], rgb[1], rgb[2]));
			for (let c = 0; c < 3; c++) pixels[p + c] = Math.min(outA, Math.max(0, rgb[c] - (1 - outA)));
			pixels[p + 3] = outA;
			continue;
		}
		const alpha = 1 - Math.exp(-mass), ba = base[p + 3] * (1 - alpha), out = alpha + ba;
		// A mass too small to move its own alpha off 0 on blank paper leaves nothing to show: the base, as a massless cell.
		// Dividing by that zero `out` wrote NaN into the colour, which the 8-bit read-out drew as black specks.
		if (!(out > 0)) { pixels[p] = base[p]; pixels[p + 1] = base[p + 1]; pixels[p + 2] = base[p + 2]; pixels[p + 3] = base[p + 3]; continue; }
		if (ba) s.toSpectral(base[p] / base[p + 3], base[p + 1] / base[p + 3], base[p + 2] / base[p + 3], ground);
		for (let k = 0; k < BANDS; k++) {
			const log = (s.suspended[i * BANDS + k] + s.settled[i * BANDS + k]) / mass;
			mix[k] = Math.exp((log + s.tintLog[k]) * alpha / out + (ba ? Math.log(ground[k]) * ba / out : 0));
		}
		s.fromSpectral(mix, rgb);
		pixels[p] = rgb[0] * out; pixels[p + 1] = rgb[1] * out; pixels[p + 2] = rgb[2] * out; pixels[p + 3] = out;
	}
	if (finish) s.wet = false;
	return a;
}

// The tilt of the phone, as the wet media's own down. `gx`/`gy` are in cell coordinates: positive
// `gy` is "down the screen". Bounded, because a sheet held vertically is the whole of the effect and
// anything past that is a number, not a steeper hill.
export function setGravity(s, gx, gy) {
	if (!s) return;
	s.gx = bounded(Math.max(-1, Math.min(1, gx || 0)), -1, 1, 'Gravity x');
	s.gy = bounded(Math.max(-1, Math.min(1, gy || 0)), -1, 1, 'Gravity y');
}

// IMPaSTo Algorithm 1 (Baxter, Wendt, Lin, NPAR 2004), reimplemented from the paper. Paint lives
// on the brush as well as the canvas; a dab is a two-way transfer. At rapier_hold 0 none of this
// runs and the engine is bit-for-bit what it was. 16×16 is the grain: a finger Oil dab is ~33
// raster pixels across at RAPIER_PAINT_GRAIN 3, so a cell is about two pixels. 32×32 was measured
// on the same Oil stroke (docs/Tranche-N-report.md): along-curve and pickup agreed, the end was
// slightly wetter, and the extra 768 floats bought no visible grain. Keep 16.
export const HOLD_N = 16;
export const XFER_FRACTION = .1, MAX_XFER_QUANTITY = .008, EQUAL_PAINT_CUTOFF = 1 / 30;
// One full Algorithm-1 transfer per this many pixels of travel. libmypaint may emit several
// dabs in that span (Oil's bristle rate is ~4x); those are raster samples of the same contact,
// not extra dips. Wet `transferHoldWet` does not use this -- its contact is the mask itself.
//
// R81: 5 px was tuned against a single 310-drawing-unit line, "starts loaded and ends dry". A
// person does not draw one short line -- the founder's own scribble is 1,096 units before it stops,
// and at 5 px the mark died a third of the way in and the rest of the gesture laid nothing. Tuned
// instead against that gesture: the load must carry a real mark and still visibly run down.
export const HOLD_TRAVEL = 20;
const movedLogs = new Float32Array(BANDS), holdLogs = new Float32Array(BANDS);

export function createBrushStore(n = HOLD_N) {
	if (!Number.isSafeInteger(n) || n < 1 || n > 64) throw new RangeError('Brush store');
	const cells = n * n;
	return { n, amount: new Float32Array(cells), logs: new Float32Array(cells * BANDS), water: new Float32Array(cells) };
}

export function loadBrush(store, { mass, water = 0, logs }) {
	const cells = store.n * store.n, m = mass / cells, w = water / cells;
	if (!logs || logs.length < BANDS) throw new TypeError('Brush spectrum');
	for (let i = 0; i < cells; i++) {
		store.amount[i] = m; store.water[i] = w;
		for (let k = 0; k < BANDS; k++) store.logs[i * BANDS + k] = m * logs[k];
	}
}

export function brushTotals(store) {
	let amount = 0, water = 0;
	const bands = new Float64Array(BANDS);
	for (let i = 0; i < store.amount.length; i++) {
		amount += store.amount[i]; water += store.water[i];
		for (let k = 0; k < BANDS; k++) bands[k] += store.logs[i * BANDS + k];
	}
	return { amount, water, bands };
}

// Signed quantity: positive is brush → canvas. Velocity is in cells (or pixels) per dab;
// smoothstep(0.2, 0.3, ||v||) is the paper's held-brush cutoff. contact is 0..1.
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

function takeMass(amount, logs, i, amt) {
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

function giveMass(amount, logs, i, amt) {
	if (!(amt > 0)) return;
	amount[i] += amt;
	for (let k = 0; k < BANDS; k++) logs[i * BANDS + k] += movedLogs[k];
}

function transferHoldWet(s, store, dab, velocity) {
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
			const taken = takeMass(store.amount, store.logs, c, amt); if (!taken) continue;
			holdLogs.set(movedLogs);
			for (let p = 0; p < pair.length; p += 2) {
				const wgt = pair[p + 1] / contact[c];
				for (let k = 0; k < BANDS; k++) movedLogs[k] = holdLogs[k] * wgt;
				giveMass(s.amount, s.suspended, pair[p], taken * wgt);
			}
		} else {
			let got = 0; holdLogs.fill(0);
			for (let p = 0; p < pair.length; p += 2) {
				got += takeMass(s.amount, s.suspended, pair[p], -amt * pair[p + 1] / contact[c]);
				for (let k = 0; k < BANDS; k++) holdLogs[k] += movedLogs[k];
			}
			movedLogs.set(holdLogs); giveMass(store.amount, store.logs, c, got);
		}
	}
}
