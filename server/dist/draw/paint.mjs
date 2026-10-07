import { createPaintPNGCodec } from './paint-png.mjs';
export { createPaintPNGCodec };
import {PAINT_BRUSH_CONTROLS, PAINT_SIZE_DEFAULTS, paintSizeDefault, PAINT_DIP_MIN, PAINT_DIP_MAX, PAINT_DIP_FULL, paintBrushRadiusOffset, paintBrushHead, paintBrushDip} from './paint-controls.mjs';
export {PAINT_BRUSH_CONTROLS, PAINT_SIZE_DEFAULTS, paintSizeDefault, PAINT_DIP_MIN, PAINT_DIP_MAX, PAINT_DIP_FULL, paintBrushRadiusOffset, paintBrushHead, paintBrushDip};
// SPDX-License-Identifier: AGPL-3.0-only
// draw/paint.mjs -- the Paint tool's dab engine: MyPaint's brush model (libmypaint 2.0, the
// `.myb` version 3 preset format) in plain JavaScript, so a MyPaint brush pack paints in Rapier
// exactly as its author tuned it: the same settings, the same input mappings, the same dab
// placement, offsets, smudge buckets, pigment (spectral) mixing and blend modes.
//
// Faithful to libmypaint's mypaint-brush.c / mypaint-tiled-surface.c / brushmodes.c / helpers.c
// (ISC licence, Martin Renold and the MyPaint team; Brien Dieterle's smudge, offset and pigment
// work) with these deliberate differences, each stated here so nobody has to rediscover them:
//   * the surface is one untiled premultiplied linear-light float RGBA buffer (0..1), not 64x64
//     15-bit tiles -- the arithmetic is the same, minus the integer rounding;
//   * `fastpow`/`fastlog` approximations become Math.pow (a hair more exact, never coarser);
//   * `rand()` in colour sampling draws from the brush's own Knuth generator, so a stroke replays
//     bit-for-bit from its recorded points: a paint stroke is a function of (brush, colour, points);
//   * no tile symmetry pass (Rapier has no symmetry mode), no operation queue.
// Nothing here touches the DOM: draw/draw.js owns the canvas, the pointer and the PNG encoder;
// witnesses and agents can run the same engine in Node.

import {paper as makePaper, wetBytes, createWetState, deposit, suspend, stepWork, settle, settleWork, finishWetWork as finishWetIterator, rewindowWetState, setGravity, toothAt, createBrushStore, loadBrush, holdAmount, HOLD_N, HOLD_TRAVEL} from './paper.mjs';

const GRID_SIZE = 256;
// The most simulated time ONE call into the solver may advance: paper.mjs's own `bounded(dt, 0,
// 60000, 'Wet time')`, named here because `_drainWet` is the owner that has to respect it while
// still paying an arbitrary accumulated debt.
const RAPIER_WET_STEP_MAX = 60000;
// Cells one frame may project to pixels. Ten exp() each, so this is the frame's own jank budget.
const WET_SETTLE_CELLS = 2000;
// How far one full contact can carry the brush's own colour toward the canvas's.
const RAPIER_HOLD_PICKUP = 0.08;
const ACTUAL_RADIUS_MIN = 0.2, ACTUAL_RADIUS_MAX = 1000;
const WGM_EPSILON = 0.001, PAINT_SAME_COLOUR = 4e-7;
const RADIANS = x => x * Math.PI / 180, DEGREES = x => x / (2 * Math.PI) * 360;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// --- brushsettings.json: settings, inputs, states ---------------------------------------------
// [internal name, default, minimum, maximum, constant]; `constant` marks the settings libmypaint
// only ever reads as a base value (BASEVAL), never through their input mappings.
export const PAINT_SETTINGS = Object.freeze([
	['opaque', 1, 0, 2], ['opaque_multiply', 0, 0, 2], ['opaque_linearize', 0.9, 0, 2, true],
	['radius_logarithmic', 2, -2, 6], ['hardness', 0.8, 0, 1], ['softness', 0, 0, 1], ['anti_aliasing', 1, 0, 5],
	['dabs_per_basic_radius', 0, 0, 200], ['dabs_per_actual_radius', 2, 0, 200], ['dabs_per_second', 0, 0, 200],
	['gridmap_scale', 0, -10, 10], ['gridmap_scale_x', 1, 0, 10], ['gridmap_scale_y', 1, 0, 10],
	['radius_by_random', 0, 0, 1.5], ['speed1_slowness', 0.04, 0, 0.2], ['speed2_slowness', 0.8, 0, 3],
	['speed1_gamma', 4, -8, 8, true], ['speed2_gamma', 4, -8, 8, true],
	['offset_by_random', 0, 0, 25], ['offset_y', 0, -40, 40], ['offset_x', 0, -40, 40],
	['offset_angle', 0, -40, 40], ['offset_angle_asc', 0, -40, 40], ['offset_angle_view', 0, -40, 40],
	['offset_angle_2', 0, 0, 40], ['offset_angle_2_asc', 0, 0, 40], ['offset_angle_2_view', 0, 0, 40],
	['offset_angle_adj', 0, -180, 180], ['offset_multiplier', 0, -2, 3], ['offset_by_speed', 0, -3, 3], ['offset_by_speed_slowness', 1, 0, 15],
	['slow_tracking', 0, 0, 10, true], ['slow_tracking_per_dab', 0, 0, 10], ['tracking_noise', 0, 0, 12, true],
	['color_h', 0, 0, 1, true], ['color_s', 0, -0.5, 1.5, true], ['color_v', 0, -0.5, 1.5, true], ['restore_color', 0, 0, 1, true],
	['change_color_h', 0, -2, 2], ['change_color_l', 0, -2, 2], ['change_color_hsl_s', 0, -2, 2], ['change_color_v', 0, -2, 2], ['change_color_hsv_s', 0, -2, 2],
	['smudge', 0, 0, 1], ['paint_mode', 1, 0, 1], ['smudge_transparency', 0, -1, 1], ['smudge_length', 0.5, 0, 1], ['smudge_length_log', 0, 0, 20],
	['smudge_bucket', 0, 0, 255], ['smudge_radius_log', 0, -1.6, 1.6], ['eraser', 0, 0, 1],
	['stroke_threshold', 0, 0, 0.5, true], ['stroke_duration_logarithmic', 4, -1, 14], ['stroke_holdtime', 0, 0, 10],
	['custom_input', 0, -5, 5], ['custom_input_slowness', 0, 0, 10],
	['elliptical_dab_ratio', 1, 1, 10], ['elliptical_dab_angle', 90, 0, 180], ['direction_filter', 2, 0, 10],
	['lock_alpha', 0, 0, 1], ['colorize', 0, 0, 1], ['posterize', 0, 0, 1], ['posterize_num', 0.05, 0.01, 1.28],
	['snap_to_pixel', 0, 0, 1], ['pressure_gain_log', 0, -1.8, 1.8, true],
].map(row => Object.freeze(row)));
export const PAINT_INPUTS = Object.freeze(['pressure', 'random', 'stroke', 'direction', 'tilt_declination', 'tilt_ascension', 'speed1', 'speed2', 'custom',
	'direction_angle', 'attack_angle', 'tilt_declinationx', 'tilt_declinationy', 'gridmap_x', 'gridmap_y', 'viewzoom', 'brush_radius', 'barrel_rotation']);
// Presets written for the smudge_tweaks branch name the grid inputs `surfacemap_*`; libmypaint 2.0
// renamed them `gridmap_*` with the same 256-unit tile. Same input, older spelling.
const INPUT_ALIASES = Object.freeze({ surfacemap_x: 'gridmap_x', surfacemap_y: 'gridmap_y' });
const S = Object.fromEntries(PAINT_SETTINGS.map((row, i) => [row[0], i]));
const I = Object.fromEntries(PAINT_INPUTS.map((name, i) => [name, i]));
const STATES = ['x', 'y', 'pressure', 'partial_dabs', 'actual_radius', 'smudge_ra', 'smudge_ga', 'smudge_ba', 'smudge_a', 'last_getcolor_r', 'last_getcolor_g', 'last_getcolor_b', 'last_getcolor_a', 'last_getcolor_recentness',
	'actual_x', 'actual_y', 'norm_dx_slow', 'norm_dy_slow', 'norm_speed1_slow', 'norm_speed2_slow', 'stroke', 'stroke_started', 'custom_input', 'rng_seed', 'actual_elliptical_dab_ratio', 'actual_elliptical_dab_angle',
	'direction_dx', 'direction_dy', 'declination', 'ascension', 'viewzoom', 'viewrotation', 'direction_angle_dx', 'direction_angle_dy', 'attack_angle', 'flip', 'gridmap_x', 'gridmap_y', 'declinationx', 'declinationy',
	'dabs_per_basic_radius', 'dabs_per_actual_radius', 'dabs_per_second', 'barrel_rotation'];
const ST = Object.fromEntries(STATES.map((name, i) => [name, i]));
const SMUDGE_R = 0, SMUDGE_G = 1, SMUDGE_B = 2, SMUDGE_A = 3, PREV_COL_R = 4, PREV_COL_G = 5, PREV_COL_B = 6, PREV_COL_A = 7, PREV_COL_RECENTNESS = 8, SMUDGE_BUCKET_SIZE = 9;
const NUM_BUCKETS = 256;

// --- Knuth's ranf_arr (rng-double.c, MyPaint's reduced quality settings) ----------------------
const QUALITY = 19, TT = 7, KK = 10, LL = 7;
const modSum = (x, y) => (x + y) - Math.trunc(x + y);
export class PaintRng {
	constructor(seed = 1000) { this.ranU = new Float64Array(KK); this.buf = new Float64Array(QUALITY); this.ptr = -1; this.seed(seed); }
	getArray(aa, n) {
		let i, j;
		for (j = 0; j < KK; j++) aa[j] = this.ranU[j];
		for (; j < n; j++) aa[j] = modSum(aa[j - KK], aa[j - LL]);
		for (i = 0; i < LL; i++, j++) this.ranU[i] = modSum(aa[j - KK], aa[j - LL]);
		for (; i < KK; i++, j++) this.ranU[i] = modSum(aa[j - KK], this.ranU[i - LL]);
	}
	seed(seed) {
		const u = new Float64Array(KK + KK - 1), ulp = (1 / (1 << 30)) / (1 << 22);
		let ss = 2 * ulp * ((seed & 0x3fffffff) + 2);
		for (let j = 0; j < KK; j++) { u[j] = ss; ss += ss; if (ss >= 1) ss -= 1 - 2 * ulp; }
		u[1] += ulp;
		let s = seed & 0x3fffffff, t = TT - 1;
		while (t) {
			for (let j = KK - 1; j > 0; j--) { u[j + j] = u[j]; u[j + j - 1] = 0; }
			for (let j = KK + KK - 2; j >= KK; j--) { u[j - (KK - LL)] = modSum(u[j - (KK - LL)], u[j]); u[j - KK] = modSum(u[j - KK], u[j]); }
			if (s & 1) { for (let j = KK; j > 0; j--) u[j] = u[j - 1]; u[0] = u[KK]; u[LL] = modSum(u[LL], u[KK]); }
			if (s) s >>= 1; else t--;
		}
		let j;
		for (j = 0; j < LL; j++) this.ranU[j + KK - LL] = u[j];
		for (; j < KK; j++) this.ranU[j - LL] = u[j];
		const warm = new Float64Array(KK + KK - 1);
		for (j = 0; j < 10; j++) this.getArray(warm, KK + KK - 1);
		this.ptr = -1;
	}
	next() {
		if (this.ptr >= 0 && this.buf[this.ptr] >= 0) return this.buf[this.ptr++];
		this.getArray(this.buf, QUALITY); this.buf[KK] = -1; this.ptr = 1;
		return this.buf[0];
	}
	gauss() { return (this.next() + this.next() + this.next() + this.next()) * 1.73205080757 - 3.46410161514; }
}

// --- helpers.c ----------------------------------------------------------------------------------
function modArith(a, n) { return a - n * Math.floor(a / n); }
function smallestAngularDifference(a, b) { let d = modArith(b - a + 180, 360) - 180; d += d > 180 ? -360 : d < -180 ? 360 : 0; return d; }
function expDecay(T, t) { return T <= 0.001 ? 0 : Math.exp(-t / T); }
export function rgbToHsv(r, g, b, out = [0, 0, 0]) {
	r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);
	const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
	let h = 0, s = 0;
	if (delta > 0.0001) {
		s = delta / max;
		if (r === max) { h = (g - b) / delta; if (h < 0) h += 6; }
		else if (g === max) h = 2 + (b - r) / delta;
		else h = 4 + (r - g) / delta;
		h /= 6;
	}
	out[0] = h; out[1] = s; out[2] = max; return out;
}
export function hsvToRgb(h, s, v, out = [0, 0, 0]) {
	h = h - Math.floor(h); s = clamp(s, 0, 1); v = clamp(v, 0, 1);
	if (s === 0) { out[0] = v; out[1] = v; out[2] = v; return out; }
	let hue = h === 1 ? 0 : h; hue *= 6;
	const i = Math.trunc(hue), f = hue - i, w = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
	switch (i) {
		case 0: out[0] = v; out[1] = t; out[2] = w; break;
		case 1: out[0] = q; out[1] = v; out[2] = w; break;
		case 2: out[0] = w; out[1] = v; out[2] = t; break;
		case 3: out[0] = w; out[1] = q; out[2] = v; break;
		case 4: out[0] = t; out[1] = w; out[2] = v; break;
		default: out[0] = v; out[1] = w; out[2] = q;
	}
	return out;
}
function rgbToHsl(r, g, b, out = [0, 0, 0]) {
	r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);
	const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
	let h = 0, s = 0;
	if (max !== min) {
		s = l <= 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
		let delta = max - min; if (delta === 0) delta = 1;
		if (r === max) h = (g - b) / delta; else if (g === max) h = 2 + (b - r) / delta; else h = 4 + (r - g) / delta;
		h /= 6; if (h < 0) h += 1;
	}
	out[0] = h; out[1] = s; out[2] = l; return out;
}
function hslValue(n1, n2, hue) {
	if (hue > 6) hue -= 6; else if (hue < 0) hue += 6;
	if (hue < 1) return n1 + (n2 - n1) * hue;
	if (hue < 3) return n2;
	if (hue < 4) return n1 + (n2 - n1) * (4 - hue);
	return n1;
}
function hslToRgb(h, s, l, out = [0, 0, 0]) {
	h = h - Math.floor(h); s = clamp(s, 0, 1); l = clamp(l, 0, 1);
	if (s === 0) { out[0] = l; out[1] = l; out[2] = l; return out; }
	const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s, m1 = 2 * l - m2;
	out[0] = hslValue(m1, m2, h * 6 + 2); out[1] = hslValue(m1, m2, h * 6); out[2] = hslValue(m1, m2, h * 6 - 2); return out;
}
const T_MATRIX_SMALL = [
	[0.026595621243689, 0.049779426257903, 0.022449850859496, -0.218453689278271, -0.256894883201278, 0.445881722194840, 0.772365886289756, 0.194498761382537, 0.014038157587820, 0.007687264480513],
	[-0.032601672674412, -0.061021043498478, -0.052490001018404, 0.206659098273522, 0.572496335158169, 0.317837248815438, -0.021216624031211, -0.019387668756117, -0.001521339050858, -0.000835181622534],
	[0.339475473216284, 0.635401374177222, 0.771520797089589, 0.113222640692379, -0.055251113343776, -0.048222578468680, -0.012966666339586, -0.001523814504223, -0.000094718948810, -0.000051604594741]];
const SPECTRAL_R = [0.009281362787953, 0.009732627042016, 0.011254252737167, 0.015105578649573, 0.024797924177217, 0.083622585502406, 0.977865045723212, 1.000000000000000, 0.999961046144372, 0.999999992756822];
const SPECTRAL_G = [0.002854127435775, 0.003917589679914, 0.012132151699187, 0.748259205918013, 1.000000000000000, 0.865695937531795, 0.037477469241101, 0.022816789725717, 0.021747419446456, 0.021384940572308];
const SPECTRAL_B = [0.537052150373386, 0.546646402401469, 0.575501819073983, 0.258778829633924, 0.041709923751716, 0.012662638828324, 0.007485593127390, 0.006766900622462, 0.006699764779016, 0.006676219883241];
export function rgbToSpectral(r, g, b, out) {
	const offset = 1 - WGM_EPSILON;
	r = r * offset + WGM_EPSILON; g = g * offset + WGM_EPSILON; b = b * offset + WGM_EPSILON;
	for (let i = 0; i < 10; i++) out[i] = SPECTRAL_R[i] * r + SPECTRAL_G[i] * g + SPECTRAL_B[i] * b;
	return out;
}
export function spectralToRgb(spec, out) {
	const offset = 1 - WGM_EPSILON;
	for (let c = 0; c < 3; c++) {
		let sum = 0;
		for (let i = 0; i < 10; i++) sum += T_MATRIX_SMALL[c][i] * spec[i];
		out[c] = clamp((sum - WGM_EPSILON) / offset, 0, 1);
	}
	return out;
}
const specA = new Float32Array(10), specB = new Float32Array(10), specMix = new Float32Array(10), logA = new Float64Array(10), rgbTmp = [0, 0, 0];
// The operators' own scratch: one sampled pixel, one mean log-reflectance.
const opPix = new Float32Array(4), opMean = new Float64Array(10);
// How far a wet dab may reach back for material it is about to move. Wet flat is a wet operator
// (`_opWet`), with a realistic wet effect rather than a dry raster carry. The dry drag (`_opDrag`,
// Smudge and Smear) does resample the canvas, one dab's travel back, because a finger dragged
// through paint is exactly a motion along the drag.
const RAPIER_OP_PAD_MAX = 48;
// Water: the fraction of a pixel's pigment MASS one dab takes into suspension per unit of strength,
// and the water a dab lays (a load, as a wet preset's own `rapier_water` is).
// The old pair of these described a different tool. LIFT scaled a fade that destroyed the pigment it
// took, so its own note recorded the corner that put it in -- 0.30 "took a solid patch to four
// percent of itself, which is an eraser with a soft edge, not water" -- and it was tuned down to
// 0.12 to make the destruction bearable. Nothing is destroyed now: what a dab lifts goes into the
// wash and settles again wherever the water dries (`_opWet`, `suspend` in draw/paper.mjs), so the
// number can say what a painter means by it. SPREAD is gone with the blur it scaled.
const RAPIER_OP_WATER_LIFT = 0.22, RAPIER_OP_WATER_WET = 0.55;
// The darkest ground a lift will work against: one 8-bit step. The lift is a power on reflectance,
// and below this a ground can never climb back, so a black film would be the one paint water could
// not shift -- which is true of no real black.
const RAPIER_OP_GROUND_FLOOR = 1 / 255;
// Wet flat: a loaded brush dragged through paint rather than a solvent stood in it. It lifts as
// Water does, but carries what it lifts in the hand's own direction and brings less water with it,
// so the trail settles as a passage drawn out rather than a pool blooming. CARRY scales the travel:
// at 1 the pigment lands exactly where the hand went between one dab and the next.
const RAPIER_OP_WET_CARRY = 1, RAPIER_OP_FLAT_WET = 0.28, RAPIER_OP_FLAT_LIFT = 0.30;
// How much the SHEET decides where a tool bites. An operator that applies evenly across its
// footprint IS a rectangle with hard ends -- nothing in it knows where the paper is high or low, so
// nothing breaks the edge up, and that is what reads as digital in a paint tool. So every tool
// reads the paper: Water pools where the paper is low, so the lift is strongest in the valleys and
// weakest on the peaks -- the same direction Dissolve takes. A dragged finger is the opposite: it
// rides the high points and picks up most from the paint standing proud of them. Both read the
// sheet in ABSOLUTE paper coordinates, so the grain does not crawl with the hand and a second pass
// works exactly where the first one did.
const RAPIER_OP_WET_TOOTH = 0.55;
// The drag (Smudge and Smear): how far, in brush radii at a full press, the paint a finger picked up
// travels before it has faded to a third, when the preset names no `rapier_carry` of its own; and
// the width of one streak of a combed drag, in brush radii; and the tooth's share of the drag (it
// rides the peaks, so the grain shows faintly through a pull without breaking it into specks).
const RAPIER_OP_DRAG_CARRY = 2.5, RAPIER_OP_DRAG_STREAK = 0.09, RAPIER_OP_DRAG_TOOTH = 0.3;
// Dissolve: the rate, and how much of the removal the sheet's own height holds back (1 would mean a
// peak never dissolves at all, which is a wall rather than a texture).
const RAPIER_OP_DISSOLVE_RATE = 0.19, RAPIER_OP_DISSOLVE_HOLD = 0.55;
// Erode: the rate, and how much deeper the bite goes where the paper is low.
const RAPIER_OP_ERODE_RATE = 0.9, RAPIER_OP_ERODE_TOOTH = 0.55;
// Erode: how far a dab reaches for the emptiness it wears toward, in brush radii, and the most it reaches in pixels. About a dozen
// dabs pass over a point, so a stroke wears an edge back about six reaches: a few screen points at the default size, and at the
// largest a visible wear rather than a square block of it.
const RAPIER_OP_ERODE_REACH = 0.05, RAPIER_OP_ERODE_REACH_MAX = 6;
// Blend's relaxation rate (at or under 1, so the mass law needs no clamp to stay exact) and the
// eraser's, and how far a finger dragged through paint flattens its body.
const RAPIER_OP_BLEND_RATE = 2.0, RAPIER_OP_ERASE_RATE = 1, RAPIER_OP_FLATTEN = 0.35;
// Weighted geometric mean of two colours' spectral reflectances (a = smudge state, b = sampled or brush colour).
// Its answer lives in one shared row, read by the caller before the next call; a dab asked twice.
const mixOut = new Float64Array(4);
function mixColors(aR, aG, aB, aA, bR, bG, bB, bA, fac, paintMode) {
	const result = mixOut, opaA = fac, opaB = 1 - fac;
	let r = 0, g = 0, b = 0;
	result[3] = clamp(opaA * aA + opaB * bA, 0, 1);
	const sfacA = aA === 0 ? 0 : opaA * aA / (aA + bA * opaB), sfacB = 1 - sfacA;
	if (paintMode > 0) {
		rgbToSpectral(aR, aG, aB, specA); rgbToSpectral(bR, bG, bB, specB);
		for (let i = 0; i < 10; i++) specMix[i] = Math.pow(specA[i], sfacA) * Math.pow(specB[i], sfacB);
		spectralToRgb(specMix, rgbTmp);
		r = rgbTmp[0]; g = rgbTmp[1]; b = rgbTmp[2];
	}
	if (paintMode < 1) { r = r * paintMode + (1 - paintMode) * (aR * opaA + bR * opaB); g = g * paintMode + (1 - paintMode) * (aG * opaA + bG * opaB); b = b * paintMode + (1 - paintMode) * (aB * opaA + bB * opaB); }
	result[0] = r; result[1] = g; result[2] = b;
	return result;
}
// Mixes two pigments in the ten-band spectral basis, t of the way from `col` (in place) to (r, g, b): the weighted geometric
// mean of their reflectances, so blue into yellow gives green and not the grey of a light average.
function oilMix(col, r, g, b, t) {
	rgbToSpectral(col[0], col[1], col[2], specA); rgbToSpectral(r, g, b, specB);
	for (let i = 0; i < 10; i++) specMix[i] = Math.exp((1 - t) * Math.log(specA[i]) + t * Math.log(specB[i]));
	spectralToRgb(specMix, rgbTmp);
	col[0] = rgbTmp[0]; col[1] = rgbTmp[1]; col[2] = rgbTmp[2];
}
function spectralBlendFactor(x) { const b = x * 8 - 3; return 0.5 + b / (1 + Math.abs(b) * 1.65); }

// --- mypaint-mapping.c --------------------------------------------------------------------------
class Mapping {
	constructor(base = 0) { this.base = base; this.points = new Array(PAINT_INPUTS.length).fill(null); this.used = 0; }
	setPoints(input, points) {
		const prior = this.points[input];
		if (points && points.length >= 2) { if (!prior) this.used++; this.points[input] = points; }
		else if (prior) { this.used--; this.points[input] = null; }
	}
	get constant() { return this.used === 0; }
	calculate(inputs) {
		let result = this.base;
		if (!this.used) return result;
		for (let j = 0; j < this.points.length; j++) {
			const p = this.points[j];
			if (!p) continue;
			const x = inputs[j];
			let x0 = p[0][0], y0 = p[0][1], x1 = p[1][0], y1 = p[1][1];
			for (let i = 2; i < p.length && x > x1; i++) { x0 = x1; y0 = y1; x1 = p[i][0]; y1 = p[i][1]; }
			result += x0 === x1 || y0 === y1 ? y0 : (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
		}
		return result;
	}
}

// --- .myb (version 3) presets ------------------------------------------------------------------
// Reads a MyPaint brush file into the settings table this engine runs on. Unknown settings and
// inputs are ignored (as libmypaint does, with a warning); a missing setting keeps its default.
const WET_KEYS = ['rapier_water', 'rapier_pigment_load'];
// Rapier's own applicator settings. A `.myb` that carries none of them paints exactly as libmypaint does; every factory Dieterle
// preset is in that case and is untouched, bit for bit. `rapier_bristles` is the count of coherent channels the belly is combed
// into -- see `_newBristles`.
// Settings the TOOL owns, not the engine: how this brush meets a hand. Parsed, range-checked and serialized here because the .myb
// file is one artefact, but never read by anything in this module. `rapier_touch` shifts a preset's two strength positions up the
// tool's own touch scale -- 1 means its Firm is everyone else's Light, and its Light is lighter again. `rapier_lift` is how many
// times the usual lift (the stretch of a finger's travel its mark is held back and tapered over, in brush radii) a brush wants: a
// flat's streaks fade over a longer lift.
const TOOL_KEYS = {rapier_touch: [0, 2], rapier_lift: [1, 4]};
const RAPIER_KEYS = {rapier_bristles: [0, 40], rapier_bristle_width: [.05, 1], rapier_bristle_depth: [0, 1], rapier_bristle_jitter: [0, 1], rapier_bristle_load: [0, 400], rapier_hold: [0, 1], rapier_bristle_lean: [0, 1], rapier_bristle_turn: [0, 1], rapier_bristle_axis: [0, 1], rapier_tooth: [0, 1], rapier_tooth_fill: [0, 1], rapier_thinners: [0, 1], rapier_body: [0, 2], rapier_load: [0, 400], rapier_op: [0, 8], rapier_carry: [0, 20], rapier_comb: [0, 1], rapier_soft: [0, 1], rapier_blade: [0, 1], rapier_pickup: [0, 1], rapier_feed: [0, 1]};
// Which OPERATOR this preset's dabs run instead of laying colour -- the one setting that makes a
// Tool a tool rather than a renamed brush. 0 is a brush and is every factory preset. The gesture
// stays the brush engine's whole: pressure, spacing, radius, the landing and the lift, the camera,
// the layer growing under the hand. Only what a dab DOES when it lands changes.
const RAPIER_OPS = ['', 'water', 'smear', 'erase', 'blend', 'dissolve', 'erode', 'pull', 'posterize'];
// A brush's whole reservoir, in belly widths of travel, for brushes that have no belly -- a nib, a
// pencil, a marker all run out too, they simply do it as one body rather than hair by hair. 0 is a
// brush that never runs out, which is what the top of the person's own Dip control must mean:
// depletion may never be a wall they cannot move.
// Impasto. How much BODY this medium has -- how far it stands off the sheet per unit of paint
// laid. Oil and a loaded bristle stand proud; ink and a wash are films with none. The volume is a
// height field beside the paper's tooth, and a raking light is what tells the eye which is which.
// The paint's own height is simulation state; the lighting is a renderer over it, run once when
// the mark is kept -- so the expensive pass lands where final quality is decided and the live
// frame never pays for it.
// Solvent on the brush, ArtRage's second axis beside Loading. Thinned paint is three things at
// once and they are one physical fact, not three settings: it is more TRANSLUCENT (less pigment
// per unit of medium), it FLOODS the sheet's tooth instead of catching on its peaks (a thin film
// wets the valleys a stiff paste never reaches), and it BLENDS more readily with what is already
// there (more solvent at the contact means more of the underlying paint moves). One number drives
// all three.
// How much a LOADED brush floods the sheet's valleys. A flat ceiling is right for a dry medium --
// graphite abrades and never reaches the bottom of the tooth, so pencil is grainy at every
// pressure -- and wrong for a loaded one: oil and marker ink flow in, and their grain belongs only
// where the brush is running dry. With one constant there is no value that is both, so the bite
// answers the dab's own load: `carry` per hair on a bristled brush, the dab's delivered opacity
// otherwise.
// How hard the sheet's grain bites this brush: 0 is a nib on glass, 1 is charcoal on rough paper.
// The frequency is the sheet's, not the brush's -- one painting is one sheet.
const RAPIER_TOOTH_GRAIN = 2.5, RAPIER_TOOTH_CONTRAST = 2.2, RAPIER_TOOTH_TILE = 64;
// Where a wash's alpha is climbing this fast per cell it is a front, not a body; how far the sheet
// may push that front either way.
const RAPIER_WET_FRONT = 0.055, RAPIER_WET_TIDE = 0.55;
// How much deeper the pigment stands at a drying front than in the belly behind it. Measured before
// this existed, the kept wash's edge was FIVE TIMES LIGHTER than its core (rim/core alpha 0.197),
// which is an airbrush -- water carries pigment TO the perimeter as it evaporates, and that darker
// rim is the single thing that reads as watercolour rather than as a soft blob.
const RAPIER_SMUDGE_MOVER = 0.7;
const RAPIER_WET_RIM = 0.9, RAPIER_WET_RIM_SPAN = 3, RAPIER_WET_BELLY_MAX = 0.35;
// How far full solvent takes each of the three: most of the pigment out, most of the tooth flooded,
// most of the way to a pure blender.
// Derived, not felt, and MULTIPLICATIVE because dilution is. A body pixel takes tens of overlapping
// dabs and `1-(1-a)^n` saturates, so a linear cut in per-dab opacity is nearly inert until it is
// almost total: 78% moved a one-pass mark from .906 only to .738, and a linear .95 put the entire
// visible range in the last third of the control's travel. Halving the paint per unit of solvent
// instead spreads the change evenly across the axis, which is also what adding solvent to paint
// actually does.
const RAPIER_THIN_K = 3.5, RAPIER_THIN_BLEND = 0.65;
const RAPIER_DRY_TOOTH = 0.55, RAPIER_DRY_FLOOR = 0.18;
// The light a kept painting is lit by: up and to the left, the angle a canvas on an easel gets from a
// window, and the one every painter's eye already reads as relief. RAPIER_BODY_UNIT is how much
// stored height one unit of laid alpha is worth; the plane is bytes, so it saturates at thick paint
// rather than growing without bound. RELIEF is how hard the diffuse term bends the colour, GLOSS how
// bright the specular sits on a ridge.
const RAPIER_LIGHT = [-0.52, -0.62, 0.59], RAPIER_BODY_UNIT = 46, RAPIER_RELIEF = 1.0, RAPIER_GLOSS = 0.45;
// Oil: a natural oil brush. A loaded round brush is a bundle of hairs, each laying its own lane of paint along the
// stroke; the paint stands off the sheet as a height field of its own (`oil`, in 1/64 of a raster pixel, 0 where
// there is none) that the lane's thickness sets and a later hair ploughs; and a light finds that height when the
// mark is read out. The height is simulation state, the lighting a view of it, so nothing here compounds and the
// eraser takes the height with the paint.
const RAPIER_OIL_UNIT = 64;
// An oil preset's own settings: how many hairs the brush has (0 is no oil model), how far its paint stands off the sheet in
// raster pixels, how much of the wet paint under a hair it takes up, and how fast it is fed fresh paint from the reservoir.
const RAPIER_OIL_KEYS = {rapier_oil: [0, 64], rapier_ridge: [0, 8], rapier_oil_pickup: [0, 1], rapier_oil_feed: [0, 1]};
// The light that rakes the oil, the same window as the other impasto's (up and to the left), and how hard it bends the
// colour (a slope toward it brightens, a slope away darkens, flat paint is exactly the swatch), how bright and how
// tight a wet ridge's highlight is, and the share of the thin paint's canvas weave that shows through.
// A plain-weave sheet's height in raster pixels over one 8 x 8 repeat (threads four pixels apart, the warp over the weft
// where the two indices agree), with a little irregularity so no thread is the one before it.
const OIL_WEAVE = (() => { const t = new Float32Array(4096), hash = (a, b) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
	// Sixty-four pixels square: sixteen threads each way, each with its own height and its own width, so the repeat is far too large to see.
	const warp = new Float64Array(16), weft = new Float64Array(16);
	for (let i = 0; i < 16; i++) { warp[i] = .75 + hash(i, 91) * .5; weft[i] = .75 + hash(i, 177) * .5; }
	for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
		const i = x >> 2, j = y >> 2, u = ((x & 3) + .5) / 4, v = ((y & 3) + .5) / 4, over = (i + j) & 1;
		const thread = Math.pow(Math.sin(Math.PI * (over ? u : v)), .7) * (over ? warp[i] : weft[j]);
		t[y * 64 + x] = Math.min(1, thread * (.85 + .3 * hash(x, y + 5000)));
	}
	return t; })();
const RAPIER_OIL_LIGHT = [-0.52, -0.62, 0.59], RAPIER_OIL_RELIEF = .9, RAPIER_OIL_GLOSS = 0.28, RAPIER_OIL_SHINE = 48, RAPIER_OIL_WEAVE = 0.35;
// The angle a held brush keeps in the WORLD. A hand does not spin the brush as the stroke turns.
const RAPIER_BRISTLE_AXIS = 35 * Math.PI / 180;
// The held head. A head that is not round keeps the angle the person holds it at, instead of turning with the hand.
// The angle reaches the engine the way a stylus's tilt does (`tilt_ascension`, with a declination that reads as a
// brush leaned over), so a preset that already maps tilt gets it with nothing rewritten; where a non-round preset's
// angle is driven only by `direction`, that input reads the held angle instead. A round head (ratio 1) has no angle
// to hold and is never touched.
const RAPIER_HELD_TILT = 0.5;
// The blade: a flat brush. A preset with `rapier_blade` is not a stack of elliptical stamps: it is `rapier_bristles` lanes laid edge
// to edge along the head's own long axis, each lane swept from where it was at the last dab to where it is now as one flat-ended
// strip, so the mark's sides are exactly the blade's sweep, its start is the blade's own straight edge, translucent paint lies even,
// and a turn never breaks into a sawtooth. A lane lifts off the paper as the finger's pressure (to a finger, its speed) falls past
// that lane's own threshold, over a band of its own: a light or fast pass runs into streaks, and the lift at the end leaves a tail of
// the lanes that held on longest, fading into the paper. A lane also carries its own colour: it picks up the paint ahead of it
// (`rapier_pickup`) and the paint behind it pushes the pickup back out (`rapier_feed`).
const RAPIER_BLADE_TURN_STEP = 10, RAPIER_BLADE_BEND = 20 * Math.PI / 180, RAPIER_BLADE_SHEAR_MAX = 3, RAPIER_BLADE_AIM = .35, RAPIER_BLADE_LAP = 1.2, RAPIER_BLADE_MIN_RUN = .7;
// The pressure at which a lane is down in full (low, high): under it the lane lays in proportion, so a lift fades the lanes one by one.
const RAPIER_BLADE_FULL = [.18, .7], RAPIER_BLADE_EDGE = [.3, .8], RAPIER_BLADE_DRY_SHARE = .3;
// The landing is crisp: every lane is down until the finger has pressed in (pressure this high, or this many blade lengths of travel).
const RAPIER_BLADE_LANDED = .6, RAPIER_BLADE_LANDED_TRAVEL = 1.5;
// How much of a turn the belly feels, and how fast that reading follows the hand.
const RAPIER_BRISTLE_TURN_GAIN = 2.2, RAPIER_BRISTLE_TURN_EASE = 0.25, RAPIER_BRISTLE_TURN_SPLAY = 0.5;
function parseInputs(inputs, put) {
	for (const [inputName, points] of Object.entries(inputs || {})) {
		const input = INPUT_ALIASES[inputName] || inputName;
		if (I[input] == null || !Array.isArray(points) || points.length < 2 || points.length > 64) continue;
		const clean = points.map(p => [Number(p[0]), Number(p[1])]);
		if (clean.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
		put(input, clean);
	}
}
function parseConstants(settings, limits) {
	const values = {};
	for (const [name, [low, high]] of Object.entries(limits)) if (Object.hasOwn(settings, name)) {
		const entry = settings[name], value = entry?.base_value;
		if (!Number.isFinite(value) || value < low || value > high || Object.keys(entry.inputs || {}).length) throw new RangeError(name + ' is a constant from ' + low + ' to ' + high);
		values[name] = value;
	}
	return values;
}
export function parseBrush(source) {
	const json = typeof source === 'string' ? JSON.parse(source) : source;
	if (!json || typeof json !== 'object' || json.version !== 3 || !json.settings || typeof json.settings !== 'object') throw new Error('Not a MyPaint brush (version 3) preset');
	const settings = PAINT_SETTINGS.map(row => ({ base: row[1], inputs: {} }));
	for (const [name, entry] of Object.entries(json.settings)) {
		const at = S[name];
		if (at == null || !entry || typeof entry !== 'object') continue;
		const base = Number(entry.base_value);
		if (Number.isFinite(base)) settings[at].base = base;
		parseInputs(entry.inputs, (input, clean) => { settings[at].inputs[input] = clean; });
	}
	// A wet load is a MAPPED setting, not a constant. A stroke whose water cannot answer the hand is
	// a tube -- every dab lays the same wash however lightly the finger touched. The loads run
	// through the same `Mapping` and per-dab inputs as radius or opacity, so a preset (a person's
	// own, or one an assistant wrote for them) says "press harder, more water" the ordinary way. An
	// unusable input is dropped as everywhere else here; the load is clamped at each dab.
	const wet = {}, wetInputs = {};
	for (const name of WET_KEYS) if (Object.hasOwn(json.settings, name)) {
		const entry = json.settings[name], value = entry?.base_value;
		if (!Number.isFinite(value) || value < 0 || value > 4) throw new RangeError(name + ' is a load from 0 to 4');
		wet[name] = value;
		const map = {};
		parseInputs(entry.inputs, (input, clean) => { map[input] = clean; });
		if (Object.keys(map).length) wetInputs[name] = map;
	}
	// The most water this brush could ever lay: its base plus the highest point of any mapping on it.
	// A preset whose base is 0 and whose pressure curve opens the tap is still wet media.
	const mostWater = Object.hasOwn(wet, 'rapier_water')
		? Math.max(wet.rapier_water, ...Object.values(wetInputs.rapier_water || {}).flat().map(q => wet.rapier_water + q[1])) : 0;
	if (mostWater > 0) for (const name of ['lock_alpha', 'colorize', 'posterize', 'eraser']) {
		const row = settings[S[name]];
		if (row.base || Object.keys(row.inputs).length) throw new RangeError('Wet media does not combine with ' + name);
	}
	// A Tool's dabs run an operator instead of laying colour, and the wet path hands the brush a
	// proxy of the surface rather than the surface itself, so the two cannot be the same preset:
	// refused here, at the door, rather than as a missing method halfway through a stroke.
	if (mostWater > 0 && Number(json.settings.rapier_op?.base_value) > 0) throw new RangeError('Wet media does not combine with rapier_op');
	// A preset describes a whole instrument, and part of that instrument is the HAND: a scumbling
	// brush is used with a light touch, a palette knife with a heavy one. That is not physics the
	// engine simulates -- the engine is handed a pressure and believes it -- so these settings are
	// carried through untouched and read by the tool that turns a finger into a pressure. The engine
	// never looks inside `tool`. Without this passthrough the only home for them would be
	// RAPIER_KEYS, which would put a setting in the engine's own registry that the engine never
	// reads.
	const tool = parseConstants(json.settings, TOOL_KEYS);
	const rapier = parseConstants(json.settings, {...RAPIER_KEYS, ...RAPIER_OIL_KEYS});
	if (rapier.rapier_bristles >= 1 && !(rapier.rapier_bristles === Math.round(rapier.rapier_bristles))) throw new RangeError('rapier_bristles is a whole number of channels');
	return { ...(Object.keys(wet).length ? {wet} : {}), ...(Object.keys(wetInputs).length ? {wetInputs} : {}), ...(Object.keys(rapier).length ? {rapier} : {}), ...(Object.keys(tool).length ? {tool} : {}), settings, description: typeof json.description === 'string' ? json.description : '', notes: typeof json.notes === 'string' ? json.notes : '', parent: typeof json.parent_brush_name === 'string' ? json.parent_brush_name : '' };
}
export function serializeBrush(def, extra = {}) {
	const settings = {};
	PAINT_SETTINGS.forEach((row, i) => { settings[row[0]] = { base_value: def.settings[i].base, inputs: { ...def.settings[i].inputs } }; });
	for (const [name, value] of Object.entries(def.wet || {})) settings[name] = {base_value: value, inputs: {...(def.wetInputs?.[name] || {})}};
	for (const [name, value] of Object.entries(def.rapier || {})) settings[name] = {base_value: value, inputs: {}};
	for (const [name, value] of Object.entries(def.tool || {})) settings[name] = {base_value: value, inputs: {}};
	return { comment: 'MyPaint brush file', version: 3, description: def.description || '', notes: def.notes || '', parent_brush_name: def.parent || '', group: '', ...extra, settings };
}

// --- mypaint-brush.c ----------------------------------------------------------------------------
export class PaintBrush {
	constructor(def) {
		this.mappings = PAINT_SETTINGS.map(row => new Mapping(row[1]));
		this.values = new Float32Array(PAINT_SETTINGS.length);
		this.states = new Float32Array(STATES.length);
		// One input vector per brush, not one per dab, and the list of settings whose mapping is NOT
		// constant -- a preset's 65 settings are mostly fixed numbers and re-dispatching all of them
		// every dab was pure repetition. Both are exact: every slot of the vector is written on every
		// update, and a constant mapping's value is written once wherever a base value can change.
		this.inputs = new Float32Array(PAINT_INPUTS.length);
		// These are the dab's own doubles, carried until the next dab overwrites them.
		this.dabColor = new Float64Array(3); this.dabColorSpace = new Float64Array(3);
		this.loadPoint = new Float64Array(2); this.holdPoint = new Float64Array(2);
		this.bristlePoint = new Float64Array(2); this.bristleDirection = new Float64Array(2); this.blade = null;
		this.oilHairs = null; this.oilPoint = new Float64Array(2); this.oilAt = null; this.oilTravel = 0; this.oilSample = new Float64Array(5);
		this.holdDab = { store: null, velocity: 0, strength: 0, col0: 0, col1: 0, initial: 0, stepped: false };
		this.dynamicMappings = [];
		this.buckets = new Float32Array(NUM_BUCKETS * SMUDGE_BUCKET_SIZE);
		this.minBucket = -1; this.maxBucket = -1;
		this.rng = new PaintRng(1000);
		this.randomInput = 0; this.paperSeed = 1000;
		this.skip = 0; this.skipLastX = 0; this.skipLastY = 0; this.skippedDtime = 0;
		this.speedGamma = [0, 0]; this.speedM = [0, 0]; this.speedQ = [0, 0];
		this.held = null; this.round = true; this.erasing = false;
		this.strokeTotalPaintingTime = 0; this.strokeCurrentIdlingTime = 0;
		if (def) this.load(def);
		this.reset(); this.newStroke(); this.baseValuesChanged(); this.resetRequested = true;
	}
	load(def) {
		this.wet = def.wet ? {...def.wet} : null;
		this.wetInputs = def.wetInputs ? JSON.parse(JSON.stringify(def.wetInputs)) : null;
		this.wetMappings = null;
		if (this.wet) {
			this.wetMappings = {};
			for (const name of WET_KEYS) {
				const m = new Mapping(this.wet[name] || 0);
				for (const [input, points] of Object.entries(this.wetInputs?.[name] || {})) if (I[input] != null) m.setPoints(I[input], points);
				this.wetMappings[name] = m;
			}
		}
		this.rapier = def.rapier ? {...def.rapier} : null;
		this.op = RAPIER_OPS[Math.round(this.rapier?.rapier_op || 0)] || '';
		def.settings.forEach((row, i) => {
			this.mappings[i].base = row.base;
			for (const input of PAINT_INPUTS) this.mappings[i].setPoints(I[input], null);
			for (const [input, points] of Object.entries(row.inputs)) if (I[input] != null) this.mappings[i].setPoints(I[input], points);
		});
		this.baseValuesChanged();
	}
	setBaseValue(name, value) { this.mappings[S[name]].base = value; this.baseValuesChanged(); }
	// The held angle of the head in degrees (the long axis, as the dab's own angle reads), or null for a head that turns
	// with the hand. Only a head that is not round holds anything. `erasing` makes the dab take paint away with its own
	// footprint (the engine's per-brush `eraser` = 1): the stroke lays no colour. Both are the tool's, set before a stroke.
	setHead(held, erasing = false) {
		this.held = Number.isFinite(held) ? modArith(held, 180) : null;
		this.erasing = !!erasing;
	}
	get holdsAngle() { return this.held !== null && !this.round; }
	// The head's footprint in brush pixels: the long half-axis, the ratio and the angle in degrees. `live` reads what the
	// stroke running now is laying; otherwise it is what the head would lay at `pressure` with the hand not yet moving,
	// for the outline before a stroke (a mouse's hover).
	footprint(live = false, pressure = 0.5) {
		const ST_ = this.states;
		if (live && ST_[ST.actual_radius] > 0) return {radius: ST_[ST.actual_radius], ratio: Math.max(1, ST_[ST.actual_elliptical_dab_ratio]), angle: ST_[ST.actual_elliptical_dab_angle]};
		const M = this.mappings, inputs = new Float32Array(PAINT_INPUTS.length), held = this.holdsAngle;
		inputs[I.pressure] = pressure; inputs[I.speed1] = 0; inputs[I.speed2] = 0; inputs[I.stroke] = 0; inputs[I.tilt_declination] = 90;
		if (held) {
			inputs[I.direction] = this.held; inputs[I.direction_angle] = this.held;
			inputs[I.tilt_declination] = 90 - RAPIER_HELD_TILT * 60; inputs[I.tilt_ascension] = modArith(this.held + 180, 360) - 180;
		}
		const radius = clamp(Math.exp(M[S.radius_logarithmic].calculate(inputs)), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX);
		return {radius, ratio: Math.max(1, M[S.elliptical_dab_ratio].calculate(inputs)), angle: modArith(M[S.elliptical_dab_angle].calculate(inputs) + this.bladeFollowTurn + 180, 180) - 180};
	}
	getBaseValue(name) { return this.mappings[S[name]].base; }
	isConstant(name) { return this.mappings[S[name]].constant; }
	// The colour a stroke paints with, in linear light (the surface's own space): sRGB in, gamma 2.2
	// out, the same curve libmypaint uses around its own HSV/HSL colour dynamics.
	setColor(r, g, b, linear = true) {
		const lin = c => linear ? Math.pow(clamp(c, 0, 1), 2.2) : clamp(c, 0, 1);
		const [h, s, v] = rgbToHsv(lin(r), lin(g), lin(b));
		this.mappings[S.color_h].base = h; this.mappings[S.color_s].base = s; this.mappings[S.color_v].base = v;
		// setColor writes three bases without going through baseValuesChanged, so the constant cache
		// has to follow them here or a colour set mid-stroke would not reach the dab.
		if (this.mappings[S.color_h].constant) this.values[S.color_h] = h;
		if (this.mappings[S.color_s].constant) this.values[S.color_s] = s;
		if (this.mappings[S.color_v].constant) this.values[S.color_v] = v;
	}
	seed(seed) { this.rng.seed(seed); this.paperSeed = seed >>> 0; this.randomInput = 0; }
	reset() { this.resetRequested = true; }
	// Moves the brush's own idea of where it is by (dx, dy) brush units, laying nothing. The surface
	// under it moved: a growth shifted the layer's origin, or a sheet flip opened a new layer with its
	// own -- and every position the brush remembers was in the old coordinates. Without this the next
	// sample reads as no movement at all (the hand travelling exactly as fast as the surface grew
	// under it), so no dab is laid for as long as growth keeps pace and the off-edge half of a stroke
	// is empty except its tip. What the brush carries besides its position -- its smudge, its load,
	// its bristles' fuel, the hold -- is untouched, so the mark stays one mark.
	rebase(dx, dy) {
		if (!(dx || dy)) return;
		const ST_ = this.states;
		ST_[ST.x] += dx; ST_[ST.y] += dy; ST_[ST.actual_x] += dx; ST_[ST.actual_y] += dy;
		if (this.skip > 0.001) { this.skipLastX += dx; this.skipLastY += dy; }
		if (this.holdAt) { this.holdAt[0] += dx; this.holdAt[1] += dy; }
		if (this.blade?.has || this.blade?.seen) { this.blade.cx += dx; this.blade.cy += dy; for (const c of this.blade.hairs) if (c.has) { c.px += dx; c.py += dy; } }
	}
	newStroke() {
		this.strokeCurrentIdlingTime = 0; this.strokeTotalPaintingTime = 0;
		// Admit wet constants once. The factory settings loop and dab arithmetic stay untouched.
		// A brush is wet if it can ever lay water: its base load, or any point of a mapping on it.
		const anyWater = this.wet ? Math.max(this.wet.rapier_water || 0,
			...Object.values(this.wetInputs?.rapier_water || {}).flat().map(q => (this.wet.rapier_water || 0) + q[1])) : 0;
		this.wetStroke = anyWater > 0 && !this.erasing ? {water: this.wet.rapier_water || 0, pigment: this.wet.rapier_pigment_load || 0} : null;
		this.loadFuel = 1; this.loadAt = null;
		// Where the hand was at this operator's last dab: an operator that transports material needs
		// the travel the hand actually made, not a filtered direction.
		this.opX = 0; this.opY = 0; this.opHas = false; this.opBucket = null; this.opDX = 0; this.opDY = 0;
		this._newBristles();
		this.oilHairs = null; this.oilAt = null; this.oilTravel = 0; this.oilFilmLoaded = false; this.oilDir = null; this.oilPress = null;
		this._newBlade();
		this._newHold();
		this._stroke = this.wetStroke ? this._wetStrokeTo : this._strokeTo;
		this._prepareDab = this.wetStroke ? this._prepareWetDab : this._prepareAndDrawDab;
	}
	// ---- The brush's belly -----------------------------------------------------------------------
	// A real loaded brush is not one round stamp: it is a band of hairs that hold their own paths along
	// the whole stroke. libmypaint's own scatter (`offset_by_random`) draws a NEW random pattern at
	// every dab, which reads as spray or clumping, never as combed paint -- so one finger pass looks
	// like dots where Brien Dieterle's sheet, made of many stylus passes, looks like a brush. So a
	// Rapier preset may declare `rapier_bristles` channels: each is given, ONCE per stroke, a lateral
	// seat across the belly, its own thickness, load and a slow rise and fall along the path. Every dab
	// then lays that same set of channels, seated across the CURRENT direction, so the streaks travel
	// with the hand and turn with it. The preset's own dab -- its radius, hardness, elongation, colour,
	// smudge and every mapping -- is what each channel paints; nothing here reaches into libmypaint's
	// arithmetic, and a preset that declares no channels (every factory one) takes the single-dab path
	// below, unchanged.
	//
	// The channels are drawn from a stroke-local generator seeded by the stroke's own seed, never from
	// the brush's RNG, so admitting this cannot shift one factory preset's random stream.
	// 0 where this dab is delivering a full film, the preset's own tooth where it is delivering
	// nothing.
	_bite(load) {
		// A spent brush finds grain a loaded one skated over: dryness raises the bite toward the
		// bare sheet, which is what makes the load axis legible on presets carrying little tooth.
		// An erasing head takes the paint off with its whole footprint: no tooth to skate over, no height laid.
		if (this.erasing) return 0;
		const dry = this.rapier?.rapier_load > 0 ? 1 - clamp(this.loadFuel ?? 1, 0, 1) : 0;
		const base = this.rapier?.rapier_tooth || 0;
		const tooth = base + (1 - base) * dry * RAPIER_DRY_TOOTH;
		if (!(tooth > 0)) return 0;
		// Solvent floods the valleys a stiff paste never reaches, so a thinned brush meets a flatter
		// sheet. Folded in here rather than at the call sites: `_drawBristles` is a separate method
		// and does not see `_prepareAndDrawDab`'s locals.
		return tooth * (1 - (this.rapier.rapier_tooth_fill || 0) * clamp(load, 0, 1)) * (1 - clamp(this.rapier.rapier_thinners || 0, 0, 1));
	}
	_newBristles() {
		const count = Math.round(this.rapier?.rapier_bristles || 0);
		if (!(count >= 2)) { this.bristles = null; return; }
		const rng = new PaintRng((this.paperSeed ^ 0x9e3779b9) >>> 0);
		const jitter = this.rapier.rapier_bristle_jitter ?? .35, depth = this.rapier.rapier_bristle_depth ?? .5;
		// How far a hair's load carries it, in belly widths of travel. Absent or 0 is a brush that
		// never runs out, which is what every preset did before this and what a marker or pen wants.
		const load = this.rapier.rapier_bristle_load || 0;
		const list = new Array(count);
		for (let i = 0; i < count; i++) {
			// Seats spread evenly from one edge of the belly to the other, then nudged: evenly spaced
			// hairs comb, perfectly spaced hairs print a comb.
			const even = count === 1 ? 0 : i / (count - 1) * 2 - 1;
			const u = clamp(even + (rng.next() * 2 - 1) * jitter / count * 2, -1, 1);
			list[i] = {
				u,
				// Hairs are not a comb: each also sits its own way forward or back along the belly,
				// or every dab prints its whole row at once and the stroke comes out as rungs.
				v: (rng.next() * 2 - 1) * .9,
				// Thickness follows the seat, not chance. A phone mark is 30-50 px across -- far too narrow
				// for lanes to read as anything but wire (thin hairs) or tube (thick ones). A real dry-brush
				// mark reads by its EDGES, so the middle hairs are wide enough to merge into a body and the
				// outer ones stay thin and separate: ragged edge, solid centre.
				r: (1 + (rng.next() * 2 - 1) * .3) * (1.45 - .8 * Math.abs(u)),
				// The belly is loaded in the middle and dry at its two edges, the way a brush actually
				// holds paint: without this every hair carries the same load and the mark is a even
				// scratchy band instead of a stroke with a body.
				a: (1 - depth * rng.next()) * (1 - .55 * u * u),
				// The hair's own rise and fall along the path: a period of a few belly widths and a
				// seat of its own in that cycle, so the gaps of neighbouring hairs never line up.
				phase: rng.next() * Math.PI * 2,
				rate: .35 + rng.next() * .75,
				// Hairs do not carry identical paint. A small per-hair tint, fixed for the stroke,
				// is what gives a loaded mark its shifting colour across the belly instead of one
				// flat value; `depth` owns how varied a belly is, in load and in colour together.
				tr: 1 + (rng.next() * 2 - 1) * depth * .25,
				tg: 1 + (rng.next() * 2 - 1) * depth * .25,
				tb: 1 + (rng.next() * 2 - 1) * depth * .25,
				// What this hair is carrying. A brush is dipped once: it starts full and pays its
				// paint out as it travels, so a stroke begins rich and goes dry -- and because each
				// hair holds its own slightly different amount, they run out at different points and
				// the mark turns streaky towards its end instead of just fading evenly.
				fuel: 1, spend: load ? 1 / (load * (.7 + rng.next() * .6)) : 0
			};
		}
		// Each hair is `width` of the belly across, so the dabs that lay it must come `1/width` times
		// as often or the hair prints as beads instead of a stroke (`_countDabsTo` reads this).
		// The preset's `opaque` must still mean what it says: the hairs' loads and their rise and fall
		// are a SHARE of the stroke, so they are normalised to average one. Without this, combing a
		// preset also quietly thinned it, and every preset had to be re-tuned to look as it did.
		let mean = 0;
		for (const c of list) mean += c.a;
		mean = mean / count * (1 - depth * .5);
		if (mean > .01) for (const c of list) c.a /= mean;
		this.bristles = list; this.bristleTravel = 0; this.bristleAt = null;
		this.bristleRate = 1 / clamp(this.rapier.rapier_bristle_width ?? .4, .05, 1);
	}
	// ---- The blade (see RAPIER_BLADE_*) ----------------------------------------------------------
	get bladeFollowTurn() { return this.rapier?.rapier_blade > 0 && !this.holdsAngle ? 90 : 0; }
	_newBlade() {
		const count = Math.round(this.rapier?.rapier_bristles || 0);
		if (!(this.rapier?.rapier_blade > 0) || !(count >= 2)) { this.blade = null; return; }
		const rng = new PaintRng((this.paperSeed ^ 0x2545f491) >>> 0);
		const depth = this.rapier.rapier_bristle_depth ?? .15, load = this.rapier.rapier_bristle_load || 0, jitter = this.rapier.rapier_bristle_jitter ?? 0;
		const hairs = new Array(count);
		for (let i = 0; i < count; i++) {
			const u = (i + .5) / count * 2 - 1, u2 = u * u;
			hairs[i] = {
				u,
				// The blade's edge hairs are the lightest on the paper; a few lanes have a dry stretch now and then.
				full: i < 2 || i >= count - 2 ? RAPIER_BLADE_EDGE[0] + rng.next() * (RAPIER_BLADE_EDGE[1] - RAPIER_BLADE_EDGE[0]) : RAPIER_BLADE_FULL[0] + rng.next() * (RAPIER_BLADE_FULL[1] - RAPIER_BLADE_FULL[0]),
				wob: jitter * 2.4 * u2 * Math.abs(u) * (.6 + rng.next() * .8), wobPhase: rng.next() * Math.PI * 2, wobRate: .35 + rng.next() * .7,
				dry: rng.next() < RAPIER_BLADE_DRY_SHARE ? depth * (.5 + .7 * rng.next()) : 0, phase: rng.next() * Math.PI * 2, rate: .5 + rng.next(),
				tint: [1 + (rng.next() * 2 - 1) * depth * .2, 1 + (rng.next() * 2 - 1) * depth * .2, 1 + (rng.next() * 2 - 1) * depth * .2],
				fuel: 1, spend: load ? 1 / (load * (.7 + rng.next() * .6)) : 0,
				col: null, base: null, px: 0, py: 0, has: false, lit: false, heading: undefined
			};
		}
		this.blade = {hairs, travel: 0, cx: 0, cy: 0, theta: 0, has: false, seen: false, dir: null, landed: false};
	}
	_drawBlade(surface, x, y, L, cr, cg, cb, opaque, hardness, softness, targetAlpha, ratio, angle, lockAlpha, colorize, posterize, posterizeNum, paintFactor) {
		const blade = this.blade, hairs = blade.hairs, ST_ = this.states, R = this.rapier;
		const pick = this.erasing ? 0 : clamp(R.rapier_pickup || 0, 0, 1), feed = clamp(R.rapier_feed || 0, 0, 1);
		// The blade's angle, kept unwrapped so a hair keeps its own end of the blade through every turn.
		// A blade that follows the finger sits square to the way the finger has been going (drawn from the first move, then eased over
		// RAPIER_BLADE_AIM blade lengths), so the first mark is already across the stroke; nothing is laid before there is a way.
		if (this.bladeFollowTurn) {
			const dm = blade.seen ? Math.hypot(x - blade.cx, y - blade.cy) : 0;
			if (dm > 1e-6) {
				const ux = (x - blade.cx) / dm, uy = (y - blade.cy) / dm;
				if (!blade.dir) blade.dir = [ux, uy];
				else { const k = 1 - Math.exp(-dm / Math.max(.5, RAPIER_BLADE_AIM * L)); blade.dir[0] += (ux - blade.dir[0]) * k; blade.dir[1] += (uy - blade.dir[1]) * k; const n = Math.hypot(blade.dir[0], blade.dir[1]) || 1; blade.dir[0] /= n; blade.dir[1] /= n; }
			}
			if (!blade.dir) { blade.seen = true; blade.cx = x; blade.cy = y; return false; }
			angle = DEGREES(Math.atan2(blade.dir[1], blade.dir[0])) + 90;
		}
		let theta = RADIANS(angle), turns = 1, from = theta, cx0 = x, cy0 = y;
		if (blade.has) {
			let d = theta - blade.theta; d -= Math.PI * Math.round(d / Math.PI); theta = blade.theta + d;
			turns = clamp(Math.ceil(Math.abs(d) / RADIANS(RAPIER_BLADE_TURN_STEP)), 1, 12); from = blade.theta; cx0 = blade.cx; cy0 = blade.cy;
		} else if (blade.seen) { cx0 = blade.cx; cy0 = blade.cy; }
		const step = blade.has || blade.seen ? Math.hypot(x - blade.cx, y - blade.cy) / Math.max(.5, L) : 0;
		blade.travel += Math.min(4, step);
		const press = ST_[ST.pressure];
		if (!blade.landed && (press >= RAPIER_BLADE_LANDED || blade.travel >= RAPIER_BLADE_LANDED_TRAVEL)) blade.landed = true;
		const dry = R.rapier_load > 0 ? 1 - clamp(this.loadFuel ?? 1, 0, 1) : 0, eff = blade.landed ? press * (1 - .6 * dry) : 1;
		let painted = false;
		for (let i = 0; i < hairs.length; i++) {
			const c = hairs[i], rad = Math.max(.1, L / hairs.length), reach = L - rad, lane = 2 / hairs.length;
			if (c.spend && step) c.fuel = Math.max(0, c.fuel - Math.min(4, step) * c.spend);
			const dip = c.dry ? Math.pow(Math.max(0, Math.sin(blade.travel * c.rate + c.phase)), 6) * c.dry : 0, cover = clamp(eff * (.45 + .55 * c.fuel) / c.full, 0, 1) * (1 - dip);
			if (!c.col) { c.base = [clamp(cr * c.tint[0], 0, 1), clamp(cg * c.tint[1], 0, 1), clamp(cb * c.tint[2], 0, 1)]; c.col = c.base.slice(); }
			const at = k => { const t = from + (theta - from) * k / turns, mx = cx0 + (x - cx0) * k / turns, my = cy0 + (y - cy0) * k / turns; const along = (c.u + (c.wob ? c.wob * Math.sin(blade.travel * c.wobRate + c.wobPhase) * lane : 0)) * reach; return [mx + Math.cos(t) * along, my + Math.sin(t) * along]; };
			const end = at(turns), begin = c.has ? null : at(0);
			// A lane that has not moved a pixel waits for the next dab: a strip of no length has no way to lean.
			if (c.has && Math.hypot(end[0] - c.px, end[1] - c.py) * surface.scale < RAPIER_BLADE_MIN_RUN) continue;
			let ox = c.has ? c.px : begin[0], oy = c.has ? c.py : begin[1];
			// What the hair carries: the paint it is about to stand on, ahead of it where nothing of this stroke has been laid, mixes in
			// before it lays; its own paint pushes that pickup back out.
			if (cover > 0 && c.has && (pick > 0 || feed > 0)) {
				const run = Math.hypot(end[0] - ox, end[1] - oy), travelled = 1 - Math.exp(-Math.min(3, run / rad));
				if (pick > 0 && run > 1e-6) {
					const sample = surface.getColor(end[0] + (end[0] - ox) / run * rad * 1.1, end[1] + (end[1] - oy) / run * rad * 1.1, rad * .8, -1, this.rng);
					if (sample[3] > .02) {
						const m = mixColors(sample[0], sample[1], sample[2], 1, c.col[0], c.col[1], c.col[2], 1, pick * travelled * clamp(sample[3], 0, 1), 1);
						c.col[0] = m[0]; c.col[1] = m[1]; c.col[2] = m[2];
					}
				}
				if (feed > 0) {
					const m = mixColors(c.base[0], c.base[1], c.base[2], 1, c.col[0], c.col[1], c.col[2], 1, feed * travelled * (.3 + .7 * c.fuel), 1);
					c.col[0] = m[0]; c.col[1] = m[1]; c.col[2] = m[2];
				}
			}
			const a = opaque * cover;
			if (a > .004) {
				surface.bite = this._bite(a); surface.body = this.erasing ? 0 : R.rapier_body || 0;
				for (let k = 1; k <= turns; k++) {
					const [hx, hy] = k === turns ? end : at(k);
					const len = Math.hypot(hx - ox, hy - oy);
					// A lane starts flat, as the blade's own edge; only a sharp bend in its way gets a round joint.
					const heading = len > 1e-6 ? Math.atan2(hy - oy, hx - ox) : c.heading;
					if (a > .95 && c.lit && c.heading !== undefined && len > 1e-6 && Math.abs(Math.atan2(Math.sin(heading - c.heading), Math.cos(heading - c.heading))) > RAPIER_BLADE_BEND
						&& surface.drawDab(ox, oy, c.half, c.col[0], c.col[1], c.col[2], a, .98, 0, targetAlpha, 1, 0, lockAlpha, colorize, posterize, posterizeNum, paintFactor)) painted = true;
					if (len > 1e-6) {
						// A lane's mark is as wide as the blade's lane seen across the way it travels, plus the blade's own thickness seen along it.
						const tk = from + (theta - from) * k / turns, ex = Math.cos(tk), ey = Math.sin(tk), ux = (hx - ox) / len, uy = (hy - oy) / len, cross = ux * ey - uy * ex;
						const lane = rad * Math.abs(cross) * RAPIER_BLADE_LAP, thick = L / Math.max(1, ratio) * Math.sqrt(Math.max(0, 1 - cross * cross)), outer = i === hairs.length - 1 ? 1 : i === 0 ? -1 : 0, plus = cross >= 0 ? outer : -outer;
						// Lanes that tile meet on hard edges and are free only on the blade's two sides; lanes the blade's thickness overlaps are free on both.
						// The ends lean with the blade (a lane of a blade held nearly along the way it goes would lean without limit, so it is held at a slope of three).
						const free = thick > lane * .5, shear = clamp((ux * ex + uy * ey) / (Math.abs(cross) < 1e-3 ? 1e-3 : cross), -RAPIER_BLADE_SHEAR_MAX, RAPIER_BLADE_SHEAR_MAX) * lane / (lane + thick || 1);
						c.half = Math.max(.1, lane + thick);
						// Where the lane's way is turning, its strip runs a little long, so the wedge a turn opens between two strips is filled.
						const turn = c.heading === undefined ? 0 : Math.abs(Math.atan2(Math.sin(heading - c.heading), Math.cos(heading - c.heading))), extra = turn > .004 ? (RAPIER_BLADE_MIN_RUN + c.half * Math.min(turn, .5) * surface.scale) / surface.scale : 0;
						if (surface.drawStrip(ox, oy, hx, hy, c.half, c.col[0], c.col[1], c.col[2], a, targetAlpha, free || plus < 0, free || plus > 0, !c.lit, shear, c.lit ? c.aLast : a, extra)) { painted = true; c.lit = true; }
						c.heading = heading;
					}
					ox = hx; oy = hy;
				}
			} else c.lit = false;
			c.aLast = a;
			c.px = end[0]; c.py = end[1]; c.has = true;
		}
		blade.cx = x; blade.cy = y; blade.theta = theta; blade.has = true;
		return painted;
	}
	// IMPaSTo hold: paint on the brush, two-way per dab. rapier_hold 0 (or absent) leaves
	// holdStore null and every factory Dieterle preset on the path they had.
	_newHold() {
		const hold = this.rapier?.rapier_hold || 0;
		// A brush that erases carries no paint of its own to hold.
		if (!(hold > 0) || this.erasing) { this.holdStore = null; this.holdAt = null; this.holdVelocity = 0; return; }
		this.holdStore = createBrushStore(HOLD_N);
		const color = hsvToRgb(this.mappings[S.color_h].base, this.mappings[S.color_s].base, this.mappings[S.color_v].base);
		rgbToSpectral(color[0], color[1], color[2], specA);
		const logs = specMix;
		for (let k = 0; k < 10; k++) logs[k] = Math.log(Math.max(specA[k], 1e-12));
		loadBrush(this.holdStore, { mass: hold * HOLD_N * HOLD_N * .85, water: 0, logs });
		// A real loaded brush is heavier in the middle. Uniform cells empty as a flat fade;
		// a radial falloff lets the edge columns run out first, so the mark goes streaky
		// rather than just dim (the same reason the belly's own `a` is higher at u=0).
		const n = HOLD_N, cx = (n - 1) / 2, store = this.holdStore, mass = hold * n * n * .85;
		let sum = 0;
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
			const u = cx ? (x - cx) / cx : 0, v = cx ? (y - cx) / cx : 0;
			const fall = Math.max(.12, 1 - .72 * (u * u + v * v)), i = y * n + x;
			store.amount[i] *= fall;
			for (let k = 0; k < 10; k++) store.logs[i * 10 + k] *= fall;
			sum += store.amount[i];
		}
		if (sum > 0) {
			const s = mass / sum;
			for (let i = 0; i < store.amount.length; i++) {
				store.amount[i] *= s;
				for (let k = 0; k < 10; k++) store.logs[i * 10 + k] *= s;
			}
		}
		store.start = Float32Array.from(store.amount);
		this.holdAt = null; this.holdVelocity = 0; this.holdInitial = mass;
	}
	_holdBegin(x, y) {
		if (!this.holdStore) return;
		if (!this.holdAt) this.holdVelocity = 1;
		else this.holdVelocity = Math.hypot(x - this.holdAt[0], y - this.holdAt[1]);
		const at = this.holdPoint; at[0] = x; at[1] = y; this.holdAt = at;
	}
	_holdOn(surface, u, width) {
		if (!this.holdStore) return;
		const n = this.holdStore.n;
		let col0 = 0, col1 = n;
		if (u != null) {
			const col = clamp(Math.round((u + 1) / 2 * (n - 1)), 0, n - 1);
			const span = Math.max(1, Math.round(n * (width ?? .25)));
			col0 = clamp(col - (span >> 1), 0, n - 1); col1 = clamp(col0 + span, 1, n);
		}
		if (surface.hold && surface.hold.store === this.holdStore) { surface.hold.col0 = col0; surface.hold.col1 = col1; return; }
		const dab = this.holdDab;
		dab.store = this.holdStore; dab.velocity = this.holdVelocity; dab.strength = this.rapier.rapier_hold;
		dab.col0 = col0; dab.col1 = col1; dab.initial = this.holdInitial; dab.stepped = false;
		surface.hold = dab;
	}
	// ---- Oil: a bundle of hairs, each with its own lane of paint
	// -----------------------------------------------------------
	// The belly (`_newBristles`) is a row of round dabs; a real hair lays a LANE, a line the length of the stroke. So an
	// oil hair is a long thin ellipse along the direction of travel, seated across the belly, and the stripes of a stroke
	// are these lanes -- coherent from one dab to the next because every hair keeps its seat and its thickness for the
	// whole stroke. What a hair lays, besides colour:
	//   - thickness: how much paint it carries (a lognormal-ish spread, more at the rim where the brush pushes paint
	// aside), which becomes the height the lane stands at (`surface.oilTop`) and how opaque it is;
	//   - contact: a hair touches only where the press reaches its length (`protrude`), so a lifting brush loses its short
	// hairs one by one and the stroke's end breaks into separate lanes, the way a brush drags out;
	//   - its own colour: each hair takes up a little of the wet paint it meets at its tip and is fed fresh paint from the
	// reservoir, so crossing another colour drags a streak of it along the lane, mixed as pigment, not as light.
	// Everything is drawn from a stroke-local generator seeded by the stroke's seed, never the brush's, so a replay is the
	// same stroke and no other preset's random stream moves.
	_newOil() {
		const n = Math.max(2, Math.round(this.rapier.rapier_oil)), rng = new PaintRng((this.paperSeed ^ 0x0e1a9d5) >>> 0);
		const jitter = this.rapier.rapier_bristle_jitter ?? .3, depth = this.rapier.rapier_bristle_depth ?? .3, spacing = 2 / (n - 1);
		// Hairs clump into tufts of three or four that move and load together, which is what leaves the broad grooves of a
		// real stroke between fine lines within it. A tuft's thickness, its slow sideways wander and its own rise and fall
		// along the stroke are the larger part of what a hair does; the hair's own spread is small beside them.
		// A tuft is one to six hairs wide; the sizes are drawn first so the belly is cut into tufts of every width.
		const sizes = []; for (let have = 0; have < n;) { const w = 1 + Math.floor(rng.next() * rng.next() * 6.9); sizes.push(w); have += w; }
		const tufts = sizes.length, tuft = new Array(tufts), of = new Int32Array(n);
		for (let g = 0, at = 0; g < tufts; g++) for (let k = 0; k < sizes[g] && at < n; k++) of[at++] = g;
		for (let g = 0; g < tufts; g++) tuft[g] = {
			t: .45 + rng.next() * 1.05, wander: .3 + rng.next() * 1.2, wanderRate: .15 + rng.next() * .45, wanderPhase: rng.next() * Math.PI * 2,
			swell: .2 + rng.next() * .35, swellRate: .12 + rng.next() * .5, swellPhase: rng.next() * Math.PI * 2,
			tr: 1 + (rng.next() * 2 - 1) * depth * .4, tg: 1 + (rng.next() * 2 - 1) * depth * .4, tb: 1 + (rng.next() * 2 - 1) * depth * .4
		};
		const list = new Array(n);
		for (let i = 0; i < n; i++) {
			const u = clamp(i * spacing - 1 + (rng.next() * 2 - 1) * jitter * spacing, -1, 1), rim = clamp((Math.abs(u) - .6) / .4, 0, 1), g = tuft[of[i]];
			list[i] = {
				u, tuft: g, v: (rng.next() * 2 - 1) * .3, len: .85 + rng.next() * .3, w: .8 + rng.next() * .5,
				t: (.75 + rng.next() * .5) * (1 + .5 * rim * rim), swell: .25 + rng.next() * .4, swellRate: .5 + rng.next() * 1.4, swellPhase: rng.next() * Math.PI * 2, protrude: rng.next() * .5 * (1 - .4 * rim), spent: rng.next() * .85,
				tr: 1 + (rng.next() * 2 - 1) * depth * .18, tg: 1 + (rng.next() * 2 - 1) * depth * .18, tb: 1 + (rng.next() * 2 - 1) * depth * .18,
				col: new Float64Array(3), loaded: false
			};
		}
		this.oilHairs = list; this.oilTravel = 0; this.oilAt = null;
	}
	_drawOil(surface, x, y, radius, cr, cg, cb, opaque, hardness, paintFactor) {
		if (!this.oilHairs) this._newOil();
		const list = this.oilHairs, ST_ = this.states, R = this.rapier, n = list.length;
		// A dry brush does not lay thinner paint, it lays paint in fewer places: the load's own fade (already in `opaque`) is taken back out.
		if (R.rapier_load > 0) opaque = clamp(opaque / (RAPIER_DRY_FLOOR + (1 - RAPIER_DRY_FLOOR) * clamp(this.loadFuel ?? 1, 0, 1)), 0, 1);
		let dx = ST_[ST.direction_angle_dx], dy = ST_[ST.direction_angle_dy];
		const len = Math.hypot(dx, dy);
		if (len > 1e-6) { dx /= len; dy /= len; } else { dx = 1; dy = 0; }
		// The lanes turn with the hand slowly, so one dab's hairs lie nearly along the last dab's and a curve is combed, not crossed.
		if (this.oilDir) { this.oilDir[0] += (dx - this.oilDir[0]) * .5; this.oilDir[1] += (dy - this.oilDir[1]) * .5; const l = Math.hypot(this.oilDir[0], this.oilDir[1]) || 1; dx = this.oilDir[0] / l; dy = this.oilDir[1] / l; this.oilDir[0] = dx; this.oilDir[1] = dy; }
		else this.oilDir = Float64Array.of(dx, dy);
		let step = 0;
		if (this.oilAt) { step = Math.min(4, Math.hypot(x - this.oilAt[0], y - this.oilAt[1]) / Math.max(.5, radius)); this.oilTravel += step; }
		const at = this.oilPoint; at[0] = x; at[1] = y; this.oilAt = at;
		const travel = this.oilTravel, px = -dy, py = dx, reach = radius * .58, space = reach * 2 / (n - 1), angle = Math.atan2(dy, dx) * 180 / Math.PI;
		const raw = ST_[ST.pressure], lifting = raw < (this.oilPress ?? raw) - 1e-4 && raw < .7; this.oilPress = raw;
		// Oil has its own landing and lift: a loaded brush meets the sheet full and leaves it with its paint piled, so the hand's
		// shared taper (which thins pressure toward both ends) keeps only the width it gives and none of the feathering.
		const press = Math.max(raw, .62), pile = lifting ? 1 + 3 * clamp((.7 - raw) * 3, 0, 1) : 1, ridge = R.rapier_ridge ?? 1.4, pickup = R.rapier_oil_pickup ?? 0, feed = R.rapier_oil_feed ?? 0;
		const dryAll = R.rapier_load > 0 ? 1 - clamp(this.loadFuel ?? 1, 0, 1) : 0, sc = surface.scale || 1, S = this.oilSample;
		surface.body = 0;
		let painted = false;
		// The body: the brush's belly lays one continuous film the width of the brush, rounded at its ends and its sides --
		// the opaque body that covers -- and the hairs ride on it. It takes up and is fed paint as a hair does, a little
		// more slowly, so a dragged colour reaches the lanes before it reaches the film.
		const film = this.oilFilm || (this.oilFilm = new Float64Array(3));
		if (!this.oilFilmLoaded) { film[0] = cr; film[1] = cg; film[2] = cb; this.oilFilmLoaded = true; }
		if (pickup > 0 && surface.oilProbe(x + dx * radius * .55, y + dy * radius * .55, S)) {
			const q = pickup * .5 * S[3] * (.3 + .7 * Math.min(1, S[4] / (ridge * 64 + 1)));
			if (q > .004) oilMix(film, S[0], S[1], S[2], q);
		}
		if (feed > 0 && Math.abs(film[0] - cr) + Math.abs(film[1] - cg) + Math.abs(film[2] - cb) > 1e-4) oilMix(film, cr, cg, cb, feed * .6 * (.25 + .75 * (1 - dryAll)));
		{
			const body = R.rapier_body ?? .4, fuelAll = 1 - dryAll;
			surface.oilPlough(x, y, radius * .6, dx, dy, ridge * body * (.3 + .7 * fuelAll) * RAPIER_OIL_UNIT);
			surface.bite = this._biteOil(dryAll, opaque);
			surface.oilTop = ridge * body * (.3 + .7 * fuelAll) * pile * RAPIER_OIL_UNIT; surface.oilPool = .3;
			if (surface.drawDab(x, y, radius * .64, film[0], film[1], film[2], clamp(opaque * Math.min(1, (1 - dryAll) * 2.4) * (.8 + .2 * clamp(press * 1.6, 0, 1)), 0, 1), .8, 0, 1, 1, 0, 0, 0, 0, 0, paintFactor)) painted = true;
		}
		for (let i = 0; i < n; i++) {
			const c = list[i], g = c.tuft;
			// Contact: a hair touches only where the press reaches its length, over a soft edge.
			const touch = clamp((press - c.protrude) * 6 + .35, 0, 1); if (touch <= .02) continue;
			// Each hair holds its own share and empties when its own turn comes, over a stretch of the brush's running down.
			const e = clamp((dryAll - c.spent) / .4, 0, 1), dry = e * e * (3 - 2 * e), fuel = 1 - dry;
			const swell = (1 + g.swell * Math.sin(travel * g.swellRate + g.swellPhase)) * (1 + c.swell * Math.sin(travel * c.swellRate + c.swellPhase));
			const thick = c.t * g.t * swell * (.25 + .75 * fuel) * (.7 + .3 * touch);
			// A round brush's belly is round: its hairs run shorter toward the rim, so a stroke begins and ends in a curve.
			const belly = Math.sqrt(Math.max(0, 1 - c.u * c.u)), seat = c.u * reach + g.wander * space * Math.sin(travel * g.wanderRate + g.wanderPhase);
			const hx = x + px * seat + dx * c.v * radius, hy = y + py * seat + dy * c.v * radius;
			const chord = Math.sqrt(Math.max(0, .64 * .64 - (.58 * c.u) ** 2)), half = Math.max(radius * .06, Math.min(radius * (.3 + .2 * belly) * c.len, radius * chord - Math.abs(c.v) * radius * .5)), wide = Math.max(.9 / sc, space * c.w * .85);
			// The hair's own paint: loaded with the swatch, it takes up the wet paint it meets at its tip and is fed again.
			if (!c.loaded) { c.col[0] = cr; c.col[1] = cg; c.col[2] = cb; c.loaded = true; }
			if (pickup > 0 && surface.oilProbe(hx + dx * half * .8, hy + dy * half * .8, S)) {
				const q = pickup * S[3] * (.3 + .7 * Math.min(1, S[4] / (ridge * 64 + 1)));
				if (q > .004) oilMix(c.col, S[0], S[1], S[2], q);
			}
			if (feed > 0) {
				const k = feed * (.25 + .75 * fuel);
				if (Math.abs(c.col[0] - cr) + Math.abs(c.col[1] - cg) + Math.abs(c.col[2] - cb) > 1e-4) oilMix(c.col, cr, cg, cb, k);
			}
			const a = clamp(opaque * touch * (.25 + .6 * Math.min(1.1, thick)) * (1 - .8 * dry * dry), 0, 1);
			surface.bite = this._biteOil(dry, a);
			surface.oilTop = ridge * thick * RAPIER_OIL_UNIT;
			if (surface.drawDab(hx, hy, half, clamp(c.col[0] * c.tr * g.tr, 0, 1), clamp(c.col[1] * c.tg * g.tg, 0, 1), clamp(c.col[2] * c.tb * g.tb, 0, 1),
				a, .88, 0, 1, Math.max(1, half / wide), angle, 0, 0, 0, 0, paintFactor)) painted = true;
		}
		surface.oilTop = 0; surface.oilPool = 0;
		return painted;
	}
	// The grain a hair finds: its preset tooth at rest, and the sheet's own peaks and valleys as it runs dry.
	_biteOil(dry, laid) {
		const base = this.rapier?.rapier_tooth || 0, tooth = base + (1 - base) * Math.pow(dry, 1.3) * .95;
		return tooth > 0 ? tooth * (1 - (this.rapier.rapier_tooth_fill || 0) * clamp(laid, 0, 1)) : 0;
	}
	_drawBristles(surface, x, y, radius, cr, cg, cb, opaque, hardness, softness, targetAlpha, aspect, angle, lockAlpha, colorize, posterize, posterizeNum, paintFactor) {
		const list = this.bristles, ST_ = this.states, depth = this.rapier.rapier_bristle_depth ?? .5;
		let dx = ST_[ST.direction_angle_dx], dy = ST_[ST.direction_angle_dy];
		const len = Math.hypot(dx, dy);
		if (len > 1e-6) { dx /= len; dy /= len; } else { dx = 1; dy = 0; }
		// Distance the hand has come, in belly widths: the phase every hair's rise and fall reads.
		let step = 0;
		// One dab never counts as more than a few belly widths of travel, whatever gap the hand left:
		// a flick between two samples must not spend a whole stroke's paint or skip the hairs'
		// rise and fall past a full cycle.
		if (this.bristleAt) { step = Math.min(4, Math.hypot(x - this.bristleAt[0], y - this.bristleAt[1]) / Math.max(.5, radius)); this.bristleTravel += step; }
		const at = this.bristlePoint; at[0] = x; at[1] = y; this.bristleAt = at;
		const width = clamp(this.rapier.rapier_bristle_width ?? .4, .05, 1);
		// A real flat brush keeps its own angle in the world: travel across its face and the mark is
		// broad, travel along it and the mark narrows to an edge. A belly seated only across the CURRENT
		// direction would present its whole width whichever way the hand went, and every mark would come
		// out the same width through every turn. `rapier_bristle_lean` is how much of that a preset
		// wants; 0 seats across the direction. The hairs still comb ALONG the stroke -- only how far
		// they spread changes -- so the streaks and the run-down are untouched.
		// A brush dragged around a turn loads its OUTSIDE and starves its inside -- the outer hairs
		// sweep the longer arc and drag, the inner ones slacken. The belly already seats its hairs
		// across the stroke at `u`, so it can express that exactly, and a finger gives the turn for
		// free: the signed cross product of one dab's direction with the last. Smoothed, because a
		// single sample pair is mostly noise at this dab rate. This is one of the signals a finger HAS
		// -- it needs no pressure, which many Android panels never report.
		// The quantity that matters is CURVATURE IN BRUSH WIDTHS -- kappa times radius -- not the angle
		// between two dabs. Dabs sit about 0.4 radius apart, so even a tight phone squiggle turns only
		// ~0.05 rad per dab and any gain on that reads as noise. Dividing by the step makes it kappa;
		// multiplying by the radius asks the only question that matters to a brush: is this turn sharp
		// compared to how wide I am?
		const prev = this.bristleDir, moved = Math.max(1e-3, step * Math.max(.5, radius));
		if (prev) this.bristleTurn = this.bristleTurn * (1 - RAPIER_BRISTLE_TURN_EASE) + ((prev[0] * dy - prev[1] * dx) / moved * radius) * RAPIER_BRISTLE_TURN_EASE;
		else this.bristleTurn = 0;
		const direction = this.bristleDirection; direction[0] = dx; direction[1] = dy; this.bristleDir = direction;
		// `rapier_bristle_turn` is how much of that a preset's belly answers: absent is all of it. A
		// loaded round (Oil) carries its paint as one body through a bend, so it answers a third, and its
		// curve stays as dense as its straight pull.
		const turn = clamp(this.bristleTurn * RAPIER_BRISTLE_TURN_GAIN, -1, 1) * clamp(this.rapier.rapier_bristle_turn ?? 1, 0, 1);
		const lean = clamp(this.rapier.rapier_bristle_lean ?? 0, 0, 1);
		// The axis the belly's lean is measured from: the held head's own angle; or, for a preset that asks for it
		// (`rapier_bristle_axis`), the angle the head has as it turns with the hand; otherwise the world's, as it always was.
		const axis = this.holdsAngle ? RADIANS(this.held) : this.rapier.rapier_bristle_axis ? RADIANS(angle) : RAPIER_BRISTLE_AXIS;
		const spread = lean > 0 ? 1 - lean * (1 - Math.abs(Math.cos(axis) * dy - Math.sin(axis) * dx)) : 1;
		// A turn is felt as SPLAY, not as load. Modulating each hair's carry was tried first and is
		// inert for the reason everything per-dab is inert here -- alpha saturates, and a 40% swing in
		// per-hair carry moved a measured arc's outer/inner ratio from .9916 to .9976, which is nothing.
		// Geometry survives repetition, and it is also the truer reading: a brush pushed into a turn
		// fans against the paper and lays wider. Symmetric in the turn's sign, so the stroke never
		// wanders off the path the finger drew.
		const reach = radius * (1 - width) * spread * (1 + Math.abs(turn) * RAPIER_BRISTLE_TURN_SPLAY);
		const px = -dy, py = dx;
		// A belly DIVIDES the brush's load across its hairs; it does not hand each one the whole dose.
		// For a brush that never mattered -- laying the same colour n times saturates rather than
		// accumulating -- but an operator's loads add, so routing a tool through the hairs multiplied
		// its water by the hair count and one pass of Water flooded the entire patch it was drawn on.
		// The share is by AREA, not by hair count, and the difference is the whole of getting this
		// right. Dividing by the count assumes the hairs tile the footprint; they do not, they overlap
		// -- a hair is `width` of the dab's radius, so it covers `width^2` of its area, and n of them
		// cover `n * width^2`, which for the tool presets is about twice over rather than eleven times.
		// Divided by the count instead, Water lifted 2.8% of a patch and left no tideline at all: a
		// tool so weak it had gone back to being nothing. Each hair's carry is weighted by the area it
		// actually covers, so the belly lays exactly what the one disc laid, spread across its width.
		let share = 1;
		if (this.op) {
			let covered = 0;
			for (let i = 0; i < list.length; i++) {
				const c = list[i];
				const w = depth ? 1 - depth * .5 * (1 - Math.cos(this.bristleTravel * c.rate + c.phase)) : 1;
				const hw = width * c.r;
				covered += c.a * w * (c.spend ? .38 + .62 * c.fuel : 1) * hw * hw;
			}
			if (covered > 0) share = 1 / covered;
		}
		let painted = false;
		for (let i = 0; i < list.length; i++) {
			const c = list[i];
			// The hair touching and lifting: never below a floor, so a channel cannot vanish for the
			// length of a stroke and leave a permanent seam.
			const wave = depth ? 1 - depth * .5 * (1 - Math.cos(this.bristleTravel * c.rate + c.phase)) : 1;
			// A spent hair still touches the paper -- it is dry, not gone.
			if (c.spend && step) c.fuel = Math.max(0, c.fuel - step * c.spend);
			// The outer hairs still drag a little more than the inner ones; this reaches the eye through
			// the tooth's bite (a ceiling) rather than through alpha, which is why it is kept small.
			const carry = c.a * wave * (c.spend ? .38 + .62 * c.fuel : 1) * (turn ? clamp(1 - turn * c.u * .5, .5, 1.5) : 1);
			if (carry <= .01) continue;
			const hx = x + px * c.u * reach + dx * c.v * radius, hy = y + py * c.u * reach + dy * c.v * radius;
			const hr = Math.max(.1, radius * width * c.r);
			// A TOOL's hair runs the operator over its own small footprint instead of laying colour, and it
			// carries ITS OWN load. That second half is what combs a smudge: one bucket shared across the
			// belly would average every hair's pickup into a single colour and wipe an even band, where a
			// real smear leaves distinct hair tracks through the paint. Each hair keeps its own, so each
			// lays back what IT picked up, a little behind where it picked it up.
			// The geometry above has one owner and this is inside it, deliberately: the belly's seat, its
			// rise and fall, its lean and its splay are the same physical brush whether the hairs are
			// laying paint or working it.
			if (this.op) {
				// Each hair remembers its own sampled colours; none borrows coverage from the sheet.
				if (surface.applyOp(this.op, hx, hy, hr, hardness, softness, aspect, angle, clamp(opaque * carry * share, 0, 1),
					this.opDX, this.opDY, this.paperSeed, c.opBucket || (c.opBucket = this._opLoad()))) painted = true;
				continue;
			}
			this._holdOn(surface, c.u, width);
			surface.bite = this._bite(opaque * carry); surface.body = this.erasing ? 0 : this.rapier?.rapier_body || 0;
			if (surface.drawDab(hx, hy, hr,
				clamp(cr * c.tr, 0, 1), clamp(cg * c.tg, 0, 1), clamp(cb * c.tb, 0, 1),
				clamp(opaque * carry, 0, 1), hardness, softness, targetAlpha, aspect, angle, lockAlpha, colorize, posterize, posterizeNum, paintFactor)) painted = true;
		}
		if (surface.hold) surface.hold = null;
		return painted;
	}
	// What a Tool carries across its dabs, made once per stroke: Posterize's palette, the drag's reach and
	// comb (`rapier_carry`, `rapier_comb`); the other operators are handed four empty slots they never read.
	_opLoad() { return this.op === 'posterize' ? new Map() : this.op === 'smear' ? Float64Array.of(this.rapier?.rapier_carry || 0, this.rapier?.rapier_comb || 0, this.rapier?.rapier_soft || 0) : new Float64Array(4); }
	strokeTo(surface, x, y, pressure, xtilt = 0, ytilt = 0, dtime = .001, viewzoom = 1, viewrotation = 0, barrel = 0, linear = true) {
		const result = this._stroke(surface, x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, barrel, linear);
		if (this.op && surface.opComposeOwed) surface.opCompose();
		return result;
	}
	_wetStrokeTo(surface, x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, barrel, linear) {
		if (!Number.isFinite(dtime) || dtime > 60) throw new RangeError('Wet event time');
		this.wetRemaining = Math.max(.0001, dtime) * 1000;
		const result = this._strokeTo(surface, x, y, pressure, xtilt, ytilt, dtime, viewzoom, viewrotation, barrel, linear);
		if (this.wetRemaining > 0) surface.wetPending = (surface.wetPending || 0) + this.wetRemaining;
		return result;
	}
	_prepareWetDab(surface, linear, dt) {
		// The normal brush still owns positions, colour/smudge and its exact hardness mask.
		const target = {getColor: (...args) => surface.getColor(...args),
			drawDab: (...args) => surface.drawWetDab(this.paperSeed, this.wetStroke, ...args),
			_renderMask: (...args) => surface._renderMask(...args),
			_holdStep: (...args) => surface._holdStep(...args),
			get hold() { return surface.hold; }, set hold(v) { surface.hold = v; },
			get scale() { return surface.scale; }};
		// The reservoir reaches water too: a loaded brush lays its pigment first and goes pale over the
		// rest of the stroke, which is the wash a real brushful gives. Water falls half as far as
		// pigment -- a nearly spent brush is still damp, and a wash with no water at all is a dry mark.
		if (this.rapier?.rapier_load > 0) {
			const fuel = RAPIER_DRY_FLOOR + (1 - RAPIER_DRY_FLOOR) * clamp(this.loadFuel ?? 1, 0, 1);
			this.wetStroke.pigment *= fuel; this.wetStroke.water *= .5 + .5 * fuel;
		}
		const painted = this._prepareAndDrawDab(target, linear);
		const elapsed = Math.min(Math.max(0, dt * 1000), this.wetRemaining);
		surface.wetPending = (surface.wetPending || 0) + elapsed; this.wetRemaining -= elapsed;
		return painted;
	}
	_reset() {
		this.skip = 0; this.skipLastX = 0; this.skipLastY = 0; this.skippedDtime = 0;
		this.states.fill(0);
		this.states[ST.flip] = -1;
		if (this.minBucket !== -1) { this.buckets.fill(0, this.minBucket * SMUDGE_BUCKET_SIZE, (this.maxBucket + 1) * SMUDGE_BUCKET_SIZE); this.minBucket = -1; this.maxBucket = -1; }
	}
	baseValuesChanged() {
		// A pure smudge carries only sampled colour at EVERY input value. Checking the mappings,
		// rather than one pressure sample or an id, keeps hybrid painting presets on their own path.
		const fixed = (name, value) => { const m = this.mappings[S[name]]; return m.base === value && m.points.every(p => !p || p.every(q => q[1] === 0)); };
		this.smudgeOnly = !this.op && !this.wet && fixed('smudge', 1) && ['eraser', 'smudge_transparency', 'colorize', 'posterize', 'change_color_h', 'change_color_l', 'change_color_hsl_s', 'change_color_v', 'change_color_hsv_s'].every(name => fixed(name, 0));
		this.round = !(this.mappings[S.elliptical_dab_ratio].base > 1);
		this.dynamicMappings.length = 0;
		for (let i = 0; i < this.mappings.length; i++) {
			const m = this.mappings[i];
			if (m.constant) this.values[i] = m.base; else this.dynamicMappings.push(i);
		}
		for (let i = 0; i < 2; i++) {
			const gamma = Math.exp(this.mappings[i === 0 ? S.speed1_gamma : S.speed2_gamma].base);
			const fix1X = 45, fix1Y = 0.5, fix2X = 45, fix2Dy = 0.015;
			const c1 = Math.log(fix1X + gamma), m = fix2Dy * (fix2X + gamma), q = fix1Y - m * c1;
			this.speedGamma[i] = gamma; this.speedM[i] = m; this.speedQ[i] = q;
		}
	}
	_bucket() {
		const index = clamp(Math.round(this.values[S.smudge_bucket]), 0, NUM_BUCKETS - 1);
		if (this.minBucket === -1 || this.minBucket > index) this.minBucket = index;
		if (this.maxBucket < index) this.maxBucket = index;
		return index * SMUDGE_BUCKET_SIZE;
	}
	_directionalOffsets(baseRadius, flip) {
		const V = this.values, ST_ = this.states;
		const mult = Math.exp(V[S.offset_multiplier]), out = this.offsetOut || (this.offsetOut = new Float64Array(2));
		out[0] = 0; out[1] = 0;
		if (!Number.isFinite(mult)) return out;
		let dx = V[S.offset_x], dy = V[S.offset_y];
		const adj = V[S.offset_angle_adj];
		const angleDeg = modArith(DEGREES(Math.atan2(ST_[ST.direction_angle_dy], ST_[ST.direction_angle_dx])) - 90, 360) - 0;
		// C's fmodf keeps the sign of the dividend; angleDeg feeds cos/sin only, where that is moot.
		const offsetAngle = V[S.offset_angle];
		if (offsetAngle) { const a = RADIANS(angleDeg + adj); dx += Math.cos(a) * offsetAngle; dy += Math.sin(a) * offsetAngle; }
		const viewRotation = ST_[ST.viewrotation], asc = V[S.offset_angle_asc];
		if (asc) { const a = RADIANS(ST_[ST.ascension] - viewRotation + adj); dx += Math.cos(a) * asc; dy += Math.sin(a) * asc; }
		const view = V[S.offset_angle_view];
		if (view) { const a = RADIANS(viewRotation + adj); dx += Math.cos(-a) * view; dy += Math.sin(-a) * view; }
		const mirror = Math.max(0, V[S.offset_angle_2]);
		if (mirror) { const a = RADIANS(angleDeg + adj * flip), f = mirror * flip; dx += Math.cos(a) * f; dy += Math.sin(a) * f; }
		const ascMirror = Math.max(0, V[S.offset_angle_2_asc]);
		if (ascMirror) { const a = RADIANS(ST_[ST.ascension] - viewRotation + adj * flip), f = flip * ascMirror; dx += Math.cos(a) * f; dy += Math.sin(a) * f; }
		const viewMirror = Math.max(0, V[S.offset_angle_2_view]);
		if (viewMirror) { const f = flip * viewMirror, a = RADIANS(viewRotation + adj); dx += Math.cos(-a) * f; dy += Math.sin(-a) * f; }
		const lim = 3240, baseMul = baseRadius * mult;
		out[0] = clamp(dx * baseMul, -lim, lim); out[1] = clamp(dy * baseMul, -lim, lim);
		return out;
	}
	_updateStates(stepDdab, stepDx, stepDy, stepDpressure, stepDeclination, stepAscension, stepDtime, viewzoom, viewrotation, stepDeclinationX, stepDeclinationY, stepBarrel) {
		const V = this.values, ST_ = this.states, M = this.mappings;
		if (stepDtime <= 0) stepDtime = 0.001;
		ST_[ST.x] += stepDx; ST_[ST.y] += stepDy; ST_[ST.pressure] += stepDpressure;
		ST_[ST.declination] += stepDeclination; ST_[ST.ascension] += stepAscension;
		ST_[ST.declinationx] += stepDeclinationX; ST_[ST.declinationy] += stepDeclinationY;
		ST_[ST.viewzoom] = viewzoom;
		const rotation = modArith(DEGREES(viewrotation) + 180, 360) - 180;
		ST_[ST.viewrotation] = rotation;
		{
			const x = ST_[ST.actual_x], y = ST_[ST.actual_y], scale = Math.exp(V[S.gridmap_scale]), scaleX = V[S.gridmap_scale_x], scaleY = V[S.gridmap_scale_y], scaled = scale * GRID_SIZE;
			ST_[ST.gridmap_x] = modArith(Math.abs(x * scaleX), scaled) / scaled * GRID_SIZE;
			ST_[ST.gridmap_y] = modArith(Math.abs(y * scaleY), scaled) / scaled * GRID_SIZE;
			if (x < 0) ST_[ST.gridmap_x] = GRID_SIZE - ST_[ST.gridmap_x];
			if (y < 0) ST_[ST.gridmap_y] = GRID_SIZE - ST_[ST.gridmap_y];
		}
		const baseRadius = Math.exp(M[S.radius_logarithmic].base);
		ST_[ST.barrel_rotation] += stepBarrel;
		if (ST_[ST.pressure] <= 0) ST_[ST.pressure] = 0;
		const pressure = ST_[ST.pressure];
		{
			const lim = 0.0001, threshold = M[S.stroke_threshold].base, started = ST_[ST.stroke_started];
			if (!started && pressure > threshold + lim) { ST_[ST.stroke_started] = 1; ST_[ST.stroke] = 0; }
			else if (started && pressure <= threshold * 0.9 + lim) ST_[ST.stroke_started] = 0;
		}
		const normDx = stepDx / stepDtime * ST_[ST.viewzoom], normDy = stepDy / stepDtime * ST_[ST.viewzoom];
		const normSpeed = Math.hypot(normDx, normDy);
		const normDist = Math.hypot(stepDx / stepDtime / baseRadius, stepDy / stepDtime / baseRadius) * stepDtime;
		const inputs = this.inputs;
		inputs[I.pressure] = pressure * Math.exp(M[S.pressure_gain_log].base);
		inputs[I.speed1] = Math.log(this.speedGamma[0] + ST_[ST.norm_speed1_slow]) * this.speedM[0] + this.speedQ[0];
		inputs[I.speed2] = Math.log(this.speedGamma[1] + ST_[ST.norm_speed2_slow]) * this.speedM[1] + this.speedQ[1];
		inputs[I.random] = this.randomInput;
		inputs[I.stroke] = Math.min(ST_[ST.stroke], 1);
		const dirAngle = Math.atan2(ST_[ST.direction_dy], ST_[ST.direction_dx]);
		inputs[I.direction] = this.holdsAngle ? this.held : modArith(DEGREES(dirAngle) + rotation + 180, 180);
		const dirAngle360 = Math.atan2(ST_[ST.direction_angle_dy], ST_[ST.direction_angle_dx]);
		inputs[I.direction_angle] = modArith(DEGREES(dirAngle360) + rotation + 360, 360);
		inputs[I.tilt_declination] = ST_[ST.declination];
		inputs[I.tilt_ascension] = modArith(ST_[ST.ascension] + rotation + 180, 360) - 180;
		inputs[I.viewzoom] = M[S.radius_logarithmic].base - Math.log(baseRadius / ST_[ST.viewzoom]);
		inputs[I.attack_angle] = smallestAngularDifference(ST_[ST.ascension], modArith(DEGREES(dirAngle360) + 90, 360));
		inputs[I.brush_radius] = M[S.radius_logarithmic].base;
		inputs[I.gridmap_x] = clamp(ST_[ST.gridmap_x], 0, GRID_SIZE);
		inputs[I.gridmap_y] = clamp(ST_[ST.gridmap_y], 0, GRID_SIZE);
		inputs[I.tilt_declinationx] = ST_[ST.declinationx];
		inputs[I.tilt_declinationy] = ST_[ST.declinationy];
		inputs[I.custom] = ST_[ST.custom_input];
		inputs[I.barrel_rotation] = modArith(ST_[ST.barrel_rotation], 360);
		for (let k = 0; k < this.dynamicMappings.length; k++) { const i = this.dynamicMappings[k]; V[i] = M[i].calculate(inputs); }
		// The wet loads read the same inputs at the same moment as every other setting.
		if (this.wetStroke) { const WM = this.wetMappings;
			this.wetStroke.water = clamp(WM.rapier_water.calculate(inputs), 0, 4);
			this.wetStroke.pigment = clamp(WM.rapier_pigment_load.calculate(inputs), 0, 4); }
		ST_[ST.dabs_per_basic_radius] = V[S.dabs_per_basic_radius];
		ST_[ST.dabs_per_actual_radius] = V[S.dabs_per_actual_radius];
		ST_[ST.dabs_per_second] = V[S.dabs_per_second];
		{
			const fac = 1 - expDecay(V[S.slow_tracking_per_dab], stepDdab);
			ST_[ST.actual_x] += (ST_[ST.x] - ST_[ST.actual_x]) * fac;
			ST_[ST.actual_y] += (ST_[ST.y] - ST_[ST.actual_y]) * fac;
		}
		{
			const fac1 = 1 - expDecay(V[S.speed1_slowness], stepDtime);
			ST_[ST.norm_speed1_slow] += (normSpeed - ST_[ST.norm_speed1_slow]) * fac1;
			const fac2 = 1 - expDecay(V[S.speed2_slowness], stepDtime);
			ST_[ST.norm_speed2_slow] += (normSpeed - ST_[ST.norm_speed2_slow]) * fac2;
		}
		{
			let timeConstant = Math.exp(V[S.offset_by_speed_slowness] * 0.01) - 1;
			if (timeConstant < 0.002) timeConstant = 0.002;
			const fac = 1 - expDecay(timeConstant, stepDtime);
			ST_[ST.norm_dx_slow] += (normDx - ST_[ST.norm_dx_slow]) * fac;
			ST_[ST.norm_dy_slow] += (normDy - ST_[ST.norm_dy_slow]) * fac;
		}
		{
			let dx = stepDx * ST_[ST.viewzoom], dy = stepDy * ST_[ST.viewzoom];
			const stepInDabtime = Math.hypot(dx, dy);
			const fac = 1 - expDecay(Math.exp(V[S.direction_filter] * 0.5) - 1, stepInDabtime);
			const dxOld = ST_[ST.direction_dx], dyOld = ST_[ST.direction_dy];
			ST_[ST.direction_angle_dx] += (dx - ST_[ST.direction_angle_dx]) * fac;
			ST_[ST.direction_angle_dy] += (dy - ST_[ST.direction_angle_dy]) * fac;
			if ((dxOld - dx) ** 2 + (dyOld - dy) ** 2 > (dxOld + dx) ** 2 + (dyOld + dy) ** 2) { dx = -dx; dy = -dy; }
			ST_[ST.direction_dx] += (dx - ST_[ST.direction_dx]) * fac;
			ST_[ST.direction_dy] += (dy - ST_[ST.direction_dy]) * fac;
		}
		{
			const fac = 1 - expDecay(V[S.custom_input_slowness], 0.1);
			ST_[ST.custom_input] += (V[S.custom_input] - ST_[ST.custom_input]) * fac;
		}
		{
			const frequency = Math.exp(-V[S.stroke_duration_logarithmic]);
			const stroke = Math.max(0, ST_[ST.stroke] + normDist * frequency), wrap = 1 + Math.max(0, V[S.stroke_holdtime]);
			if (stroke >= wrap && wrap > 9.9 + 1) ST_[ST.stroke] = 1;
			else if (stroke >= wrap) ST_[ST.stroke] = stroke % wrap;
			else ST_[ST.stroke] = stroke;
		}
		ST_[ST.actual_radius] = clamp(Math.exp(V[S.radius_logarithmic]), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX);
		ST_[ST.actual_elliptical_dab_ratio] = V[S.elliptical_dab_ratio];
		ST_[ST.actual_elliptical_dab_angle] = modArith(V[S.elliptical_dab_angle] + this.bladeFollowTurn - rotation + 180, 180) - 180;
	}
	_updateSmudgeColor(surface, at, smudgeLength, px, py, radius, legacy, paintFactor) {
		const V = this.values, B = this.buckets;
		let updateFactor = Math.max(0.01, smudgeLength);
		let r, g, b, a;
		const smudgeLengthLog = V[S.smudge_length_log];
		const recentness = B[at + PREV_COL_RECENTNESS] * updateFactor;
		B[at + PREV_COL_RECENTNESS] = recentness;
		if (recentness < Math.min(1, Math.pow(0.5 * updateFactor, smudgeLengthLog) + 1e-16)) {
			if (recentness === 0) updateFactor = 0;
			B[at + PREV_COL_RECENTNESS] = 1;
			const smudgeRadius = clamp(radius * Math.exp(V[S.smudge_radius_log]), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX);
			const sampled = surface.getColor(px, py, smudgeRadius, legacy ? -1 : paintFactor, this.rng);
			r = sampled[0]; g = sampled[1]; b = sampled[2]; a = sampled[3];
			const lim = V[S.smudge_transparency];
			if ((lim > 0 && a < lim) || (lim < 0 && a > -lim)) return true;
			B[at + PREV_COL_R] = r; B[at + PREV_COL_G] = g; B[at + PREV_COL_B] = b; B[at + PREV_COL_A] = a;
		} else { r = B[at + PREV_COL_R]; g = B[at + PREV_COL_G]; b = B[at + PREV_COL_B]; a = B[at + PREV_COL_A]; }
		if (legacy) {
			const facOld = updateFactor, facNew = (1 - updateFactor) * a;
			B[at + SMUDGE_R] = facOld * B[at + SMUDGE_R] + facNew * r;
			B[at + SMUDGE_G] = facOld * B[at + SMUDGE_G] + facNew * g;
			B[at + SMUDGE_B] = facOld * B[at + SMUDGE_B] + facNew * b;
			B[at + SMUDGE_A] = clamp(facOld * B[at + SMUDGE_A] + facNew, 0, 1);
		} else if (a > WGM_EPSILON * 10) {
			const mixed = mixColors(B[at + SMUDGE_R], B[at + SMUDGE_G], B[at + SMUDGE_B], B[at + SMUDGE_A], r, g, b, a, updateFactor, paintFactor);
			B[at + SMUDGE_R] = mixed[0]; B[at + SMUDGE_G] = mixed[1]; B[at + SMUDGE_B] = mixed[2]; B[at + SMUDGE_A] = mixed[3];
		} else B[at + SMUDGE_A] = (B[at + SMUDGE_A] + a) / 2;
		return false;
	}
	_applySmudge(at, smudgeValue, legacy, paintFactor, color) {
		const B = this.buckets, smudgeFactor = Math.min(1, smudgeValue);
		const targetAlpha = clamp((1 - smudgeFactor) + smudgeFactor * B[at + SMUDGE_A], 0, 1);
		if (targetAlpha > 0) {
			if (legacy) {
				const colFactor = 1 - smudgeFactor;
				color[0] = (smudgeFactor * B[at + SMUDGE_R] + colFactor * color[0]) / targetAlpha;
				color[1] = (smudgeFactor * B[at + SMUDGE_G] + colFactor * color[1]) / targetAlpha;
				color[2] = (smudgeFactor * B[at + SMUDGE_B] + colFactor * color[2]) / targetAlpha;
			} else {
				const mixed = mixColors(B[at + SMUDGE_R], B[at + SMUDGE_G], B[at + SMUDGE_B], B[at + SMUDGE_A], color[0], color[1], color[2], 1, smudgeFactor, paintFactor);
				color[0] = mixed[0]; color[1] = mixed[1]; color[2] = mixed[2];
			}
		} else { color[0] = 1; color[1] = 0; color[2] = 0; }
		return targetAlpha;
	}
	_prepareAndDrawDab(surface, linear) {
		const V = this.values, ST_ = this.states, M = this.mappings;
		const thin = clamp(this.rapier?.rapier_thinners || 0, 0, 1);
		let opaque = clamp(Math.max(0, V[S.opaque]) * V[S.opaque_multiply] * (thin ? Math.exp(-RAPIER_THIN_K * thin) : 1) * (this.rapier?.rapier_load > 0 ? RAPIER_DRY_FLOOR + (1 - RAPIER_DRY_FLOOR) * (this.loadFuel ?? 1) : 1), 0, 1);
		const opaqueLinearize = M[S.opaque_linearize].base;
		if (opaqueLinearize) {
			let dabsPerPixel = (ST_[ST.dabs_per_actual_radius] + ST_[ST.dabs_per_basic_radius]) * 2;
			if (dabsPerPixel < 1) dabsPerPixel = 1;
			dabsPerPixel = 1 + opaqueLinearize * (dabsPerPixel - 1);
			opaque = 1 - Math.pow(1 - opaque, 1 / dabsPerPixel);
		}
		let x = ST_[ST.actual_x], y = ST_[ST.actual_y];
		const baseRadius = Math.exp(M[S.radius_logarithmic].base);
		const offset = this._directionalOffsets(baseRadius, ST_[ST.flip]);
		x += offset[0]; y += offset[1];
		const viewZoom = ST_[ST.viewzoom], offsetBySpeed = V[S.offset_by_speed];
		if (offsetBySpeed) { x += ST_[ST.norm_dx_slow] * offsetBySpeed * 0.1 / viewZoom; y += ST_[ST.norm_dy_slow] * offsetBySpeed * 0.1 / viewZoom; }
		const offsetByRandom = V[S.offset_by_random];
		if (offsetByRandom) { const amp = Math.max(0, offsetByRandom); x += this.rng.gauss() * amp * baseRadius; y += this.rng.gauss() * amp * baseRadius; }
		let radius = ST_[ST.actual_radius];
		const radiusByRandom = V[S.radius_by_random];
		if (radiusByRandom) {
			const noise = this.rng.gauss() * radiusByRandom;
			radius = clamp(Math.exp(V[S.radius_logarithmic] + noise), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX);
			const correction = (ST_[ST.actual_radius] / radius) ** 2;
			if (correction <= 1) opaque *= correction;
		}
		// The whole brush's reservoir, spent over travel exactly as a hair's is -- for the brushes that
		// have no belly to spend hair by hair. A spent brush still touches the paper; it is dry, not
		// gone. Spent AFTER this dab takes its opacity, so a dab is drawn with the load it landed
		// with; and because bite reads what a dab delivers, a drying brush takes more grain as it goes.
		const whole = this.rapier?.rapier_load || 0;
		if (whole > 0) {
			const lx = ST_[ST.actual_x], ly = ST_[ST.actual_y];
			if (this.loadAt) { const d = Math.hypot(lx - this.loadAt[0], ly - this.loadAt[1]) / Math.max(.5, radius);
				this.loadFuel = Math.max(0, (this.loadFuel ?? 1) - Math.min(4, d) / whole); }
			const at = this.loadPoint; at[0] = lx; at[1] = ly; this.loadAt = at;
		}
		const paintFactor = this.smudgeOnly ? 0 : V[S.paint_mode], paintConstant = M[S.paint_mode].constant, legacy = this.smudgeOnly || paintFactor <= 0 && paintConstant;
		const color = hsvToRgb(M[S.color_h].base, M[S.color_s].base, M[S.color_v].base, this.dabColor);
		const smudgeLength = V[S.smudge_length];
		if (smudgeLength < 1 && (V[S.smudge] !== 0 || !M[S.smudge].constant)) {
			const at = this._bucket();
			if (this._updateSmudgeColor(surface, at, smudgeLength, Math.round(x), Math.round(y), radius, legacy, paintFactor)) return false;
		}
		let targetAlpha = 1;
		let smudgeValue = thin ? V[S.smudge] + (1 - V[S.smudge]) * thin * RAPIER_THIN_BLEND : V[S.smudge];
		if (smudgeValue > 0) {
			const at = this._bucket();
			// A Rapier applicator preset smudges only what is THERE. libmypaint's rule thins a smudging dab
			// by the emptiness it samples, so dragging a loaded brush across bare paper would make it carry
			// less paint the further it went, and every mixing brush would have to be tuned down until it
			// no longer mixed. A brush's own load does not depend on the paper being blank: the smudge is
			// weighted by the alpha under it, nothing over bare paper and its full strength over paint.
			// Factory presets keep libmypaint's rule exactly.
			// ...except for a preset that exists ONLY to move paint. Weighting its smudge by what it
			// sampled inverts it: over bare paper the weight goes to zero, the smudge with it, and what
			// remains is the dab's own chosen colour -- so Water, dragged off the edge of a red band, would
			// lay BLUE. libmypaint's own rule is right for these: with smudge at 1 and nothing under the
			// brush, `_applySmudge` returns a target alpha of 0 and the dab lays nothing at all. A tool for
			// moving paint must never introduce the colour in the swatch.
			if (this.rapier && M[S.smudge].base < RAPIER_SMUDGE_MOVER) smudgeValue *= clamp(this.buckets[at + SMUDGE_A], 0, 1);
			if (smudgeValue > 0) targetAlpha = this._applySmudge(at, smudgeValue, legacy, paintFactor, color);
		}
		const erase = this.erasing ? 1 : V[S.eraser];
		if (erase) targetAlpha *= 1 - erase;
		const usingHsv = V[S.change_color_h] || V[S.change_color_hsv_s] || V[S.change_color_v];
		const usingHsl = V[S.change_color_l] || V[S.change_color_hsl_s];
		let cr = color[0], cg = color[1], cb = color[2];
		if (usingHsv || usingHsl) {
			if (linear) { cr = Math.pow(cr, 1 / 2.2); cg = Math.pow(cg, 1 / 2.2); cb = Math.pow(cb, 1 / 2.2); }
			if (usingHsv) {
				const hsv = rgbToHsv(cr, cg, cb, this.dabColorSpace);
				let h = hsv[0], s = hsv[1], v = hsv[2];
				h += V[S.change_color_h]; s += s * v * V[S.change_color_hsv_s]; v += V[S.change_color_v];
				hsvToRgb(h, s, v, color); cr = color[0]; cg = color[1]; cb = color[2];
			}
			if (usingHsl) {
				const hsl = rgbToHsl(cr, cg, cb, this.dabColorSpace);
				let h = hsl[0], s = hsl[1], l = hsl[2];
				l += V[S.change_color_l]; s += s * Math.min(Math.abs(1 - l), Math.abs(l)) * 2 * V[S.change_color_hsl_s];
				hslToRgb(h, s, l, color); cr = color[0]; cg = color[1]; cb = color[2];
			}
			if (linear) { cr = Math.pow(cr, 2.2); cg = Math.pow(cg, 2.2); cb = Math.pow(cb, 2.2); }
		}
		let hardness = clamp(V[S.hardness], 0, 1);
		const softness = clamp(V[S.softness], 0, 1);
		const currentFadeout = radius * (1 - hardness), minFadeout = V[S.anti_aliasing];
		if (currentFadeout < minFadeout) {
			const optical = radius - (1 - hardness) * radius / 2;
			const hardnessNew = (optical - minFadeout / 2) / (optical + minFadeout / 2);
			radius = minFadeout / (1 - hardnessNew);
			hardness = hardnessNew;
		}
		const snap = V[S.snap_to_pixel];
		if (snap > 0) {
			x += (Math.floor(x) + 0.5 - x) * snap; y += (Math.floor(y) + 0.5 - y) * snap;
			let snapped = Math.round(radius * 2) / 2;
			if (snapped < 0.5) snapped = 0.5;
			if (snap > 0.9999) snapped -= 0.0001;
			radius += (snapped - radius) * snap;
		}
		// An empty/partly empty sample is not an eraser. The old target-alpha blend replaced
		// painted pixels with the bucket's missing coverage, exposing the white stage as dots.
		// Carry existing colour under invariant coverage; sampled emptiness only weakens the carry.
		if (this.smudgeOnly) return targetAlpha > 0 && surface.drawDab(x, y, radius, cr, cg, cb,
			opaque * targetAlpha, hardness, softness, 1, ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], 1, 0, 0, 0, 0);
		// A Tool's dab does not lay colour: it runs its operator over the material already inside its
		// own footprint. Everything above -- the pressure, the radius, the spacing, the landing and the
		// lift, the elongation and its angle -- is the preset's, exactly as it is for a brush; `color`
		// is computed and thrown away, which is the whole point.
		if (this.op) {
			const ax = ST_[ST.actual_x], ay = ST_[ST.actual_y];
			const ddx = this.opHas ? ax - this.opX : 0, ddy = this.opHas ? ay - this.opY : 0;
			this.opX = ax; this.opY = ay; this.opHas = true;
			// A tool with a belly works the paint hair by hair, through the same renderer a bristled
			// brush uses, so a Tool and a Brush are the same physical object with different work to do.
			if (this.bristles) {
				this.opDX = ddx; this.opDY = ddy;
				// The hairs pool their settle; the dab pays it once. The flag is cleared in a finally so a
				// refusal deep in one hair cannot leave the surface deferring for the rest of the stroke.
				surface.opDefer = true;
				try {
					return this._drawBristles(surface, x, y, radius, 0, 0, 0, opaque, hardness, softness, 1,
						ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], 0, 0, 0, 0, 1);
				} finally { surface.opDefer = false; if (typeof surface.opFlush === 'function') surface.opFlush(); }
			}
			return surface.applyOp(this.op, x, y, radius, hardness, softness,
				ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], opaque, ddx, ddy, this.paperSeed,
				// The finger's own load, made once per stroke and carried across its dabs.
				this.opBucket || (this.opBucket = this._opLoad()));
		}
		if (this.rapier?.rapier_oil > 0 && !this.erasing) return this._drawOil(surface, x, y, radius, cr, cg, cb, opaque, hardness, paintFactor);
		this._holdBegin(x, y); this._holdOn(surface);
		// A bristled brush renders a mask per hair anyway; the first of those drives the store step (the
		// `stepped` flag stops the rest). Rendering an extra full-radius mask here just to step once
		// would double the per-dab mask work -- a wide dab's mask is far larger than any one hair's.
		// Wet deposit owns the conservative store transfer; this dry prepass would debit it twice. No
		// factory preset combines hold with wet settings, but parseBrush admits it.
		if (this.holdStore && !this.bristles && !this.wetStroke && typeof surface._renderMask === 'function') {
			const sc = surface.scale || 1;
			const box = surface._renderMask(x * sc, y * sc, radius * sc, hardness, softness, ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle]);
			if (box && surface.hold) { surface._holdStep(box, opaque); surface.hold.stepped = true; }
		}
		if (this.blade) return this._drawBlade(surface, x, y, radius, cr, cg, cb, opaque, hardness, softness, targetAlpha, ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], V[S.lock_alpha], V[S.colorize], V[S.posterize], V[S.posterize_num], paintFactor);
		if (this.bristles) return this._drawBristles(surface, x, y, radius, cr, cg, cb, opaque, hardness, softness, targetAlpha,
			ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], V[S.lock_alpha], V[S.colorize], V[S.posterize], V[S.posterize_num], paintFactor);
		surface.bite = this._bite(opaque); surface.body = this.erasing ? 0 : this.rapier?.rapier_body || 0;
		const painted = surface.drawDab(x, y, radius, cr, cg, cb, opaque, hardness, softness, targetAlpha,
			ST_[ST.actual_elliptical_dab_ratio], ST_[ST.actual_elliptical_dab_angle], V[S.lock_alpha], V[S.colorize], V[S.posterize], V[S.posterize_num], paintFactor);
		if (surface.hold) surface.hold = null;
		return painted;
	}
	_countDabsTo(x, y, dt) {
		const ST_ = this.states, baseRadius = clamp(Math.exp(this.mappings[S.radius_logarithmic].base), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX);
		if (ST_[ST.actual_radius] === 0) ST_[ST.actual_radius] = baseRadius;
		const dx = x - ST_[ST.x], dy = y - ST_[ST.y];
		let dist;
		if (this.blade) dist = Math.hypot(dx, dy);
		else if (ST_[ST.actual_elliptical_dab_ratio] > 1) {
			const a = RADIANS(ST_[ST.actual_elliptical_dab_angle]), cs = Math.cos(a), sn = Math.sin(a);
			const yyr = (dy * cs - dx * sn) * ST_[ST.actual_elliptical_dab_ratio], xxr = dy * sn + dx * cs;
			dist = Math.sqrt(yyr * yyr + xxr * xxr);
		} else dist = Math.hypot(dx, dy);
		const rate = this.bristles && !(this.rapier.rapier_oil > 0 && !this.erasing) ? this.bristleRate : 1;
		const res = (dist / ST_[ST.actual_radius] * ST_[ST.dabs_per_actual_radius] + dist / baseRadius * ST_[ST.dabs_per_basic_radius]) * rate
			+ (ST_[ST.dabs_per_second] > 0 ? Math.min(dt, 1 / 60) : dt) * ST_[ST.dabs_per_second];
		return Number.isNaN(res) || res < 0 ? 0 : res;
	}
	// One motion event: (x, y) in surface pixels, pressure 0..1, tilt -1..1 each axis, dtime in
	// seconds since the previous event. Returns true when libmypaint would split the stroke here
	// (its undo grain); Rapier keeps one stroke per pointer gesture and ignores that.
	_strokeTo(surface, x, y, pressure, xtilt = 0, ytilt = 0, dtime = 0.001, viewzoom = 1, viewrotation = 0, barrel = 0, linear = true) {
		const ST_ = this.states, M = this.mappings, maxDtime = 5;
		let tiltAscension = 0, tiltDeclination = 90, tiltDeclinationX = 90, tiltDeclinationY = 90;
		// A held head with no stylus tilt of its own leans at the held angle; a stylus that reports a tilt keeps its own.
		const heldHere = this.holdsAngle && xtilt === 0 && ytilt === 0;
		if (heldHere) { const a = RADIANS(this.held); xtilt = -Math.sin(a) * RAPIER_HELD_TILT; ytilt = Math.cos(a) * RAPIER_HELD_TILT; }
		if (xtilt !== 0 || ytilt !== 0) {
			xtilt = clamp(xtilt, -1, 1); ytilt = clamp(ytilt, -1, 1);
			tiltAscension = DEGREES(Math.atan2(-xtilt, ytilt));
			tiltDeclination = 90 - Math.hypot(xtilt, ytilt) * 60;
			tiltDeclinationX = xtilt * 60; tiltDeclinationY = ytilt * 60;
		}
		if (pressure <= 0) pressure = 0;
		if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e8 || Math.abs(y) > 1e8) { x = 0; y = 0; pressure = 0; viewzoom = 1; viewrotation = 0; barrel = 0; }
		if (dtime <= 0) dtime = 0.0001;
		if (dtime > 0.1 && pressure && ST_[ST.pressure] === 0) { this._strokeTo(surface, x, y, 0, 0, 0, dtime - 0.0001, viewzoom, viewrotation, 0, linear); dtime = 0.0001; }
		if (this.skip > 0.001) {
			const dist = Math.hypot(this.skipLastX - x, this.skipLastY - y);
			this.skipLastX = x; this.skipLastY = y; this.skippedDtime += dtime; this.skip -= dist; dtime = this.skippedDtime;
			if (this.skip > 0.001 && !(dtime > maxDtime || this.resetRequested)) return false;
			this.skip = 0; this.skipLastX = 0; this.skipLastY = 0; this.skippedDtime = 0;
		}
		{
			const trackingNoise = M[S.tracking_noise].base;
			if (trackingNoise) {
				const noise = Math.exp(M[S.radius_logarithmic].base) * trackingNoise;
				if (noise > 0.001) { this.skip = 0.5 * noise; this.skipLastX = x; this.skipLastY = y; x += noise * this.rng.gauss(); y += noise * this.rng.gauss(); }
			}
			const fac = 1 - expDecay(M[S.slow_tracking].base, 100 * dtime);
			x = ST_[ST.x] + (x - ST_[ST.x]) * fac; y = ST_[ST.y] + (y - ST_[ST.y]) * fac;
		}
		if (dtime > maxDtime || this.resetRequested) {
			this.resetRequested = false;
			this._reset();
			this.randomInput = this.rng.next();
			ST_[ST.x] = x; ST_[ST.y] = y; ST_[ST.pressure] = pressure;
			ST_[ST.actual_x] = x; ST_[ST.actual_y] = y; ST_[ST.stroke] = 1;
			// The first dab already leans the way the head is held, not from straight up.
			if (heldHere) { ST_[ST.ascension] = tiltAscension; ST_[ST.declination] = tiltDeclination; ST_[ST.declinationx] = tiltDeclinationX; ST_[ST.declinationy] = tiltDeclinationY; }
			return true;
		}
		let painted = 0; // 0 unknown, 1 yes, -1 no
		let dtimeLeft = dtime, dabsMoved = ST_[ST.partial_dabs];
		// The time term is one normal frame at most. The recount below used to be handed the
		// wall-clock remainder, so a late sample paid that frame again on every dab.
		let countLeft = ST_[ST.dabs_per_second] > 0 ? Math.min(dtime, 1 / 60) : dtime;
		let dabsTodo = this._countDabsTo(x, y, countLeft), stepDpressure = 0;
		while (dabsMoved + dabsTodo >= 1) {
			let stepDdab;
			if (dabsMoved > 0) { stepDdab = 1 - dabsMoved; dabsMoved = 0; } else stepDdab = 1;
			const frac = stepDdab / dabsTodo;
			const stepDx = frac * (x - ST_[ST.x]), stepDy = frac * (y - ST_[ST.y]);
			stepDpressure = frac * (pressure - ST_[ST.pressure]);
			const stepDtime = frac * dtimeLeft, stepCount = frac * countLeft;
			this._updateStates(stepDdab, stepDx, stepDy, stepDpressure, frac * (tiltDeclination - ST_[ST.declination]), frac * smallestAngularDifference(ST_[ST.ascension], tiltAscension), stepDtime, viewzoom, viewrotation,
				frac * (tiltDeclinationX - ST_[ST.declinationx]), frac * (tiltDeclinationY - ST_[ST.declinationy]), frac * smallestAngularDifference(ST_[ST.barrel_rotation], barrel * 360));
			ST_[ST.flip] *= -1;
			const paintedNow = this._prepareDab(surface, linear, stepDtime);
			if (paintedNow) painted = 1; else if (painted === 0) painted = -1;
			this.randomInput = this.rng.next();
			dtimeLeft -= stepDtime; countLeft -= stepCount; if (countLeft < 0) countLeft = 0;
			dabsTodo = this._countDabsTo(x, y, countLeft);
		}
		{
			stepDpressure = pressure - ST_[ST.pressure];
			this._updateStates(dabsTodo, x - ST_[ST.x], y - ST_[ST.y], stepDpressure, tiltDeclination - ST_[ST.declination], smallestAngularDifference(ST_[ST.ascension], tiltAscension), dtimeLeft, viewzoom, viewrotation,
				tiltDeclinationX - ST_[ST.declinationx], tiltDeclinationY - ST_[ST.declinationy], smallestAngularDifference(ST_[ST.barrel_rotation], barrel * 360));
		}
		ST_[ST.partial_dabs] = dabsMoved + dabsTodo;
		if (painted === 0) painted = this.strokeCurrentIdlingTime > 0 || this.strokeTotalPaintingTime === 0 ? -1 : 1;
		if (painted === 1) {
			this.strokeTotalPaintingTime += dtime; this.strokeCurrentIdlingTime = 0;
			if (this.strokeTotalPaintingTime > 4 + 3 * pressure && stepDpressure >= 0) return true;
		} else {
			this.strokeCurrentIdlingTime += dtime;
			if (this.strokeTotalPaintingTime === 0) { if (this.strokeCurrentIdlingTime > 1) return true; }
			else if (this.strokeTotalPaintingTime + this.strokeCurrentIdlingTime > 0.9 + 5 * pressure) return true;
		}
		return false;
	}
}

// Decoding one 8-bit channel to linear light has only 256 possible answers, and a rehydrated
// painting asks for it once per channel per pixel -- three `Math.pow` calls for every pixel of a
// picture being picked up again. Float64 keeps the exact Number result the `pow` gave, so the
// premultiply and the Float32 store below round identically; a Float32 table would round early and
// would not be the same decode.
const PAINT_LINEAR_BYTE = Float64Array.from({length: 256}, (_, v) => Math.pow(v / 255, 2.2));
// Encoding linear light to a byte is the other direction, and a live blit asks for it three
// times per pixel of the dirty box on every frame -- a quarter of a stroke's whole engine time
// went to that one `Math.pow`. The byte is monotone in the value, so it is the count of the 255
// thresholds the value has reached. Each threshold is the smallest double whose
// `Math.round(Math.pow(v, 1 / 2.2) * 255)` reaches its byte, found by stepping through the
// doubles against that very expression, so the table gives exactly the byte the formula gives
// (`paint-byte-exact` feeds it the quotients a layer really produces). A 65,536-entry coarse index
// names the byte at the foot of the value's bucket and one or two comparisons finish; no bucket
// spans more than three bytes.
const PAINT_BYTE_EDGE = new Float64Array(257), PAINT_BYTE_COARSE = new Uint8Array(65537);
{
	const bits = new Float64Array(1), asBits = new BigUint64Array(bits.buffer);
	const byteOf = v => Math.round(Math.pow(v, 1 / 2.2) * 255);
	const next = (v, up) => { bits[0] = v; asBits[0] += up ? 1n : -1n; return bits[0]; };
	for (let k = 1; k <= 255; k++) {
		let v = Math.pow((k - 0.5) / 255, 2.2);
		while (byteOf(v) < k) v = next(v, true);
		while (byteOf(next(v, false)) >= k) v = next(v, false);
		PAINT_BYTE_EDGE[k] = v;
	}
	PAINT_BYTE_EDGE[256] = Infinity;
	for (let i = 0, k = 0; i <= 65536; i++) { while (i / 65536 >= PAINT_BYTE_EDGE[k + 1]) k++; PAINT_BYTE_COARSE[i] = k; }
}
function paintByte(v) { let k = PAINT_BYTE_COARSE[(v * 65536) | 0]; while (v >= PAINT_BYTE_EDGE[k + 1]) k++; return k; }

// --- mypaint-tiled-surface.c + brushmodes.c: one flat premultiplied linear float RGBA surface ----
// The bounded wet window carries functions as well as typed arrays. Keep immutable callbacks,
// copy material state, and journal only touched raster tiles rather than copying the whole canvas.
function copyPaintMaterial(value, seen = new Map()) {
	if (!value || typeof value !== 'object') return value;
	if (seen.has(value)) return seen.get(value);
	if (ArrayBuffer.isView(value)) { const out = value.slice(); seen.set(value, out); return out; }
	const out = Array.isArray(value) ? [] : {}; seen.set(value, out);
	for (const key of Object.keys(value)) out[key] = copyPaintMaterial(value[key], seen);
	return out;
}
export class PaintSurface {
	constructor(width, height, {wet = {}, trackedGrowth = false} = {}) {
		this.width = Math.max(1, Math.trunc(width)); this.height = Math.max(1, Math.trunc(height));
		this.data = new Float32Array(this.width * this.height * 4);
		// Premultiplied material cannot retain RGB beneath zero alpha. A loaded raster's hidden
		// channels travel separately, allocated only when the source actually carries them.
		this.transparentRGB = null;
		// The tool's blank sheets write through _touch, so their untouched margins are exact zeros.
		// Raw surfaces also expose their buffers to callers and must copy those buffers in full.
		this.growBox = trackedGrowth ? null : undefined;
		this.boundsDirty = null; this.boundsTiles = new Map(); this.boundsOX = 0; this.boundsOY = 0; this.revision = 0;
		this.dirty = null; // {x0, y0, x1, y1} inclusive pixel bounds changed since the last takeDirty()
		this.mask = new Float32Array(0);
		// The box expires with its mask at the next render; callers consume both together.
		this.maskBox = { x0: 0, y0: 0, w: 0, h: 0, mask: this.mask, spans: null };
		this.holdColor = new Float64Array(4);
		// Scratch the hot loops reuse instead of allocating per dab: the wet dab's coarse mask and the
		// smudge probe's two spectral accumulators. Every element is written before it is read.
		this.wetCoarse = new Float32Array(0);
		this.sampleSpectral = new Float32Array(10); this.sampleSpec = new Float32Array(10); this.sampleRgb = [0, 0, 0]; this.sampleOut = new Float64Array(4); this.sampleLog = new Float64Array(10);
		// Which way the phone says is down, carried to every wet state this surface opens.
		this.wetGravity = [0, 0];
		this.opDefer = false; this.opOwed = null;
		this.wetOptions = wet; this.wetState = null; this.wetWindow = null; this.wetRasterBase = null; this.wetCover = null; this.wetDeposited = null; this.wetPending = 0; this.wetTouched = null; this.wetOwedBox = false; this.wetBandY = 0; this.wetBandBox = null; this.wetCell = wet.cell || 3;
		// An optional opaque sheet under the layer, in linear light, for the smudge probe. Rapier leaves
		// it null: with a white sheet every light-pressure stroke smears white and goes pale; sampling
		// the layer alone, as libmypaint does, lets a light touch smear the paint that is there and thin
		// out over bare canvas (the Dieterle transparency gate's own design).
		this.paper = null;
		// The sheet's grain. `bite` is set per dab by the brush; the field is one sheet for the whole
		// surface, in absolute pixels, so a second stroke crossing a first meets the same peaks.
		this.bite = 0; this.toothSeed = 0x5eed1e; this.toothTiles = null; this.toothTilesW = 0; this.weaveTiles = null;
		// Where this buffer's (0,0) sits on the PAPER. Growing the surface shifts the buffer under the
		// paint, and the sheet's grain must not move with it: the tooth is a function of the paper's own
		// coordinates, so it stays exactly where it was under every pixel already laid.
		this.toothOX = 0; this.toothOY = 0;
		// Paint standing off the sheet, in bytes. Allocated only when a brush with body first paints.
		this.body = 0; this.volume = null;
		// Oil paint standing off the sheet, in 1/64 of a raster pixel (0 where there is none); allocated when an oil hair first lays.
		this.oil = null; this.oilTop = 0; this.oilPool = 0;
		// Raster pixels per canvas unit. The brush keeps working in the author's canvas units (its
		// radius, dab spacing, offsets and speed as tuned in MyPaint at 100%); the surface maps a dab's
		// centre and radius to its denser pixels here. Folding the scale into the brush's own radius
		// instead would break every preset whose radius is mapped from `brush_radius` (Dieterle's flat
		// and watery brushes shrink and pale at 2x: paint-look).
		this.scale = 1;
	}
	beginStroke() {
		this._finishWetWork();
		if (this.strokeCheckpoint) throw new Error('A paint stroke is already open');
		const material = {};
		for (const key of Object.keys(this)) if (key.startsWith('wet') || ['opDefer', 'opOwed', 'hold', 'drawDab', 'body', 'bite'].includes(key)) material[key] = this[key];
		const checkpoint = {data: this.data, volume: this.volume, oil: this.oil, transparentRGB: this.transparentRGB, width: this.width, height: this.height, growBox: this.growBox && {...this.growBox}, toothOX: this.toothOX, toothOY: this.toothOY, toothTiles: this.toothTiles, toothTilesW: this.toothTilesW, material: copyPaintMaterial(material), tiles: new Map()};
		this.strokeCheckpoint = checkpoint;
		return checkpoint;
	}
	_keepStrokePixels(x0, y0, x1, y1) {
		const cp = this.strokeCheckpoint;
		// After growth the old buffer is retained by the checkpoint and no longer changes.
		if (!cp || cp.data !== this.data) return;
		x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.width - 1, x1); y1 = Math.min(this.height - 1, y1);
		for (let ty = Math.floor(y0 / 64); ty <= Math.floor(y1 / 64); ty++) for (let tx = Math.floor(x0 / 64); tx <= Math.floor(x1 / 64); tx++) {
			const key = ty + ':' + tx; if (cp.tiles.has(key)) continue;
			const x = tx * 64, y = ty * 64, w = Math.min(64, this.width - x), h = Math.min(64, this.height - y);
			const pixels = new Float32Array(w * h * 4), volume = cp.volume && new Uint8Array(w * h), oil = cp.oil && new Uint16Array(w * h), transparentRGB = cp.transparentRGB && new Uint8Array(w * h * 3);
			for (let row = 0; row < h; row++) { const at = (y + row) * this.width + x; pixels.set(this.data.subarray(at * 4, (at + w) * 4), row * w * 4); if (volume) volume.set(this.volume.subarray(at, at + w), row * w); if (oil) oil.set(this.oil.subarray(at, at + w), row * w); if (transparentRGB) transparentRGB.set(this.transparentRGB.subarray(at * 3, (at + w) * 3), row * w * 3); }
			cp.tiles.set(key, {x, y, w, h, pixels, volume, oil, transparentRGB});
		}
	}
	endStroke(checkpoint, cancel = false) {
		if (!checkpoint || this.strokeCheckpoint !== checkpoint) return false;
		this.strokeCheckpoint = null;
		if (!cancel) return true;
		for (const {x, y, w, h, pixels, volume, oil, transparentRGB} of checkpoint.tiles.values()) for (let row = 0; row < h; row++) {
			const at = (y + row) * checkpoint.width + x;
			checkpoint.data.set(pixels.subarray(row * w * 4, (row + 1) * w * 4), at * 4);
			if (volume) checkpoint.volume.set(volume.subarray(row * w, (row + 1) * w), at);
			if (oil) checkpoint.oil.set(oil.subarray(row * w, (row + 1) * w), at);
			if (transparentRGB) checkpoint.transparentRGB.set(transparentRGB.subarray(row * w * 3, (row + 1) * w * 3), at * 3);
		}
		this.data = checkpoint.data; this.volume = checkpoint.volume; this.oil = checkpoint.oil; this.transparentRGB = checkpoint.transparentRGB; this.width = checkpoint.width; this.height = checkpoint.height;
		// Relief readout uses this paper field too; cancelling must restore its presence as well
		// as its origin, or unchanged material would encode differently after a cancelled mark.
		this.toothOX = checkpoint.toothOX; this.toothOY = checkpoint.toothOY; this.toothTiles = checkpoint.toothTiles; this.toothTilesW = checkpoint.toothTilesW; this.weaveTiles = null;
		delete this.drawDab; delete this.hold;
		Object.assign(this, checkpoint.material);
		this.boundsTiles.clear(); this.boundsOX = this.boundsOY = 0; this.preparedGrowth = null; this._readout = null; this.sinceRead = null;
		this._touch(0, 0, this.width - 1, this.height - 1);
		this.growBox = checkpoint.growBox;
		return true;
	}

	clear() { this._finishWetWork(); this._keepStrokePixels(0, 0, this.width - 1, this.height - 1); this.wetState = null; this.wetWindow = null; this.wetRasterBase = null; this.wetCover = null; this.wetDeposited = null; this.wetPending = 0; this.wetTouched = null; this.wetOwedBox = false; this.wetBandY = 0; this.wetBandBox = null; delete this.drawDab; this.data.fill(0); this.transparentRGB = null; if (this.oil) this.oil.fill(0); this._readout = null; this.sinceRead = null; this._touch(0, 0, this.width - 1, this.height - 1); }
	// The wet state is a WINDOW over the stroke, on a COARSE grid, stepped AFTER the finger. A
	// phone's live layer is 2.4 Mpx and the dense state is 128 bytes a pixel, and the reference step
	// over that at every dab takes seconds. So: the window opens around the first wet dab with a
	// margin and grows with the stroke (`rewindowWetState` moves every cell; nothing resampled); the
	// physics runs on cells of `wetCell` raster pixels (3: one drawing unit at the brush's grain),
	// with the paper generated at the window's offset so the tooth is one sheet; deposits are the dab
	// mask box-filtered onto the cells; the settled result is composed back over the SHARP raster as
	// a bilinearly upsampled wet delta, so the underpainting never blurs. During a stroke nothing is
	// stepped -- time accrues in `wetPending` and the caller advances it after release, which is when
	// a wash visibly blooms and dries. A window the budget cannot hold does not refuse the stroke:
	// what is wet settles where it is (it dries behind the hand) and a fresh window opens.
	_wetWindowFor(box, previous) {
		const C = this.wetCell, margin = 16 * C;
		let x0 = Math.max(0, box.x0 - margin), y0 = Math.max(0, box.y0 - margin);
		let x1 = Math.min(this.width, box.x0 + box.w + margin), y1 = Math.min(this.height, box.y0 + box.h + margin);
		if (previous) { x0 = Math.min(x0, previous.x0); y0 = Math.min(y0, previous.y0); x1 = Math.max(x1, previous.x0 + previous.w); y1 = Math.max(y1, previous.y0 + previous.h); }
		x0 = Math.floor(x0 / C) * C; y0 = Math.floor(y0 / C) * C;
		x1 = Math.min(Math.ceil(this.width / C) * C, Math.ceil(x1 / C) * C); y1 = Math.min(Math.ceil(this.height / C) * C, Math.ceil(y1 / C) * C);
		return { x0, y0, w: x1 - x0, h: y1 - y0, cw: (x1 - x0) / C, ch: (y1 - y0) / C };
	}
	_wetBytes(win) { return wetBytes(win.cw, win.ch) + win.cw * win.ch * 20 + win.w * win.h * 20; }
	// The bytes the window a dab box would open on a dry surface costs -- the budget law's own
	// arithmetic, so a witness derives its boundary from the surface rather than restating it.
	wetBudgetFor(box) { return this._wetBytes(this._wetWindowFor(box, null)); }
	// The live paper's tooth per raster pixel (each pixel reads its cell; 0 outside the window):
	// what a granulation witness correlates pigment against, through the window's own mapping.
	wetToothField() {
		const out = new Float32Array(this.width * this.height), state = this.wetState, win = this.wetWindow, C = this.wetCell;
		if (!state || !win) return out;
		const field = state.paper.heightField;
		for (let y = 0; y < win.h; y++) { const sy = win.y0 + y; if (sy >= this.height) break; for (let x = 0; x < win.w; x++) { const sx = win.x0 + x; if (sx >= this.width) break; out[sy * this.width + sx] = field[Math.floor(y / C) * win.cw + Math.floor(x / C)]; } }
		return out;
	}
	// Box-filter the padded, window-local raster base; keep its zero-filled edge samples in the average.
	_wetDownsample(win, base) {
		const C = this.wetCell, W = win.w, H = win.h, out = new Float32Array(win.cw * win.ch * 4);
		for (let cy = 0; cy < win.ch; cy++) for (let cx = 0; cx < win.cw; cx++) {
			let r = 0, g = 0, b = 0, a = 0, n = 0;
			for (let y = 0; y < C; y++) { const py = cy * C + y; if (py >= H) break; for (let x = 0; x < C; x++) { const px = cx * C + x; if (px >= W) break; const i = (py * W + px) * 4; r += base[i]; g += base[i + 1]; b += base[i + 2]; a += base[i + 3]; n++; } }
			const o = (cy * win.cw + cx) * 4; if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n; }
		}
		return out;
	}
	beginWet(seed, box) {
		this._finishWetWork();
		// A dab keeps `wetFlow` cells of window beyond its box, so water has somewhere to bloom;
		// growth adds the full margin, so the window is not re-cut at every dab near an edge.
		const state = this.wetState, win = this.wetWindow, F = this.wetCell * 8;
		if (state && win && box.x0 - F >= win.x0 && box.y0 - F >= win.y0 && box.x0 + box.w + F <= win.x0 + win.w && box.y0 + box.h + F <= win.y0 + win.h) return state;
		// A deferred settle (the hairs' pooled cells) and compose are in the OLD window's cells; pay both before those cells mean
		// something else. Left owed, the settle ran in the new window's numbering: off its grid at the largest sizes ("offset is
		// out of bounds", the stroke cancelled), on the wrong cells otherwise.
		this.opFlush(); this.opCompose(); this.composeWet();
		if (state && win && win.x0 === 0 && win.y0 === 0 && win.w >= this.width && win.h >= this.height) return state;
		const options = this.wetOptions, maxBytes = options.maxBytes ?? 96000000;
		let next = this._wetWindowFor(box, win), carry = state, carryWin = win, carryBase = this.wetRasterBase;
		if (this._wetBytes(next) > maxBytes) {
			if (state) { this.settleWet(); carry = null; carryWin = null; carryBase = null; }
			next = this._wetWindowFor(box, null);
			if (this._wetBytes(next) > maxBytes) { const error = new RangeError('Painting is too large for wet media'); error.code = 'PAINT_WET_BUDGET'; throw error; }
		}
		// The raster base of the window: the pixels as they were before any wet pigment settled --
		// carried from the previous window where they overlap, read from the surface elsewhere.
		const W = this.width, rasterBase = new Float32Array(next.w * next.h * 4);
		for (let y = 0; y < next.h; y++) { const py = next.y0 + y; if (py >= this.height) break; const n = Math.min(next.w, W - next.x0); rasterBase.set(this.data.subarray((py * W + next.x0) * 4, (py * W + next.x0 + n) * 4), y * next.w * 4); }
		if (carryBase) for (let y = 0; y < carryWin.h; y++) rasterBase.set(carryBase.subarray(y * carryWin.w * 4, (y + 1) * carryWin.w * 4), ((y + carryWin.y0 - next.y0) * next.w + carryWin.x0 - next.x0) * 4);
		const pixels = this._wetDownsample(next, rasterBase);
		const created = createWetState(makePaper(seed, next.cw, next.ch, { ...options, originX: next.x0 / this.wetCell, originY: next.y0 / this.wetCell }), {
			...options, pixels, maxBytes, reservedBytes: 0, toSpectral: rgbToSpectral, fromSpectral: spectralToRgb
		});
		if (carry) rewindowWetState(carry, created, (carryWin.x0 - next.x0) / this.wetCell, (carryWin.y0 - next.y0) / this.wetCell);
		// The fine coverage plane: the union of the dabs' own masks at raster resolution. The compose
		// shapes the cell-resolution wet delta by it inside cells the finger touched, so a stroke's edge
		// is the dab's own anti-aliased edge, not a staircase of cells.
		const cover = new Float32Array(next.w * next.h), deposited = new Float32Array(next.cw * next.ch);
		if (carryBase && this.wetCover) for (let y = 0; y < carryWin.h; y++) cover.set(this.wetCover.subarray(y * carryWin.w, (y + 1) * carryWin.w), (y + carryWin.y0 - next.y0) * next.w + carryWin.x0 - next.x0);
		if (carry && this.wetDeposited) for (let y = 0; y < carryWin.ch; y++) deposited.set(this.wetDeposited.subarray(y * carryWin.cw, (y + 1) * carryWin.cw), (y + (carryWin.y0 - next.y0) / this.wetCell) * next.cw + (carryWin.x0 - next.x0) / this.wetCell);
		setGravity(created, this.wetGravity[0], this.wetGravity[1]);
		// The wash's own extent in cells, carried into the new window's coordinates. Everything the
		// wash has ever occupied is composed FINELY, once, when the stroke is kept -- see settleWet.
		const shifted = this.wetTouched && carry ? { x0: this.wetTouched.x0 + (carryWin.x0 - next.x0) / this.wetCell, y0: this.wetTouched.y0 + (carryWin.y0 - next.y0) / this.wetCell, x1: this.wetTouched.x1 + (carryWin.x0 - next.x0) / this.wetCell, y1: this.wetTouched.y1 + (carryWin.y0 - next.y0) / this.wetCell } : null;
		this.wetState = created; this.wetWindow = next; this.wetRasterBase = rasterBase; this.wetCover = cover; this.wetDeposited = deposited; this.wetSeed = seed; this.wetTouched = shifted; this.wetBandBox = null;
		this.drawDab = this._drawAfterWet;
		return created;
	}
	// Composes the settled cells over the sharp raster base for a cell rectangle (inclusive): wet
	// delta = settled cell - base cell, bilinearly upsampled, added to the raster base.
	// `fine` is the pass that runs once, when the paper has dried and the stroke is about to be kept.
	// The solver works on cells of several raster pixels, so its granulation is that coarse -- a
	// dried wash would read as a flat belly with a blocky grain. Here the settled pigment is
	// modulated by the sheet's own tooth at EACH RASTER PIXEL, in the same absolute paper coordinates
	// the window's own paper was generated from, so the grain a person looks at is as fine as the
	// picture is. It costs one extra pass over the window at the moment of commit and nothing at all
	// while the finger is down: final quality over real-time detail.
	_wetCompose(rect, fine) { return finishWetIterator(this._wetComposeWork(rect, fine)); }
	*_wetComposeWork(rect, fine) {
		let cells = 0;
		// Scratch belongs to this surface: another drying sheet may run while this one yields.
		// Corner differences stay float64; rounding them changes the kept raster.
		const scratch = this._wetScratch || (this._wetScratch = {cellCover: new Float32Array(0), cornerCover: new Float32Array(0), cornerFloor: new Float64Array(0), cornerDelta: new Float64Array(0)});
		const state = this.wetState, win = this.wetWindow, C = this.wetCell, P = state.pixels, B = state.base, RB = this.wetRasterBase, D = this.data, W = this.width, H = this.height, cw = win.cw, ch = win.ch, cover = this.wetCover;
		const px0 = Math.max(0, rect.x0 - 1) * C, py0 = Math.max(0, rect.y0 - 1) * C, px1 = Math.min(win.w, (rect.x1 + 2) * C) - 1, py1 = Math.min(win.h, (rect.y1 + 2) * C) - 1;
		this._keepStrokePixels(win.x0 + px0, win.y0 + py0, win.x0 + px1, win.y0 + py1);
		// The cell's own coverage: the mean of the fine plane over it (0 where only flow reached). Only the
		// rectangle's cells and a margin of two are ever written or read, so the plane is kept across
		// calls: a fresh one per call was the whole window's worth of zeroed memory for every dab.
		if (scratch.cellCover.length < cw * ch) scratch.cellCover = new Float32Array(cw * ch);
		const cellCover = scratch.cellCover;
		for (let cy = Math.max(0, rect.y0 - 2); cy <= Math.min(ch - 1, rect.y1 + 2); cy++) for (let cx = Math.max(0, rect.x0 - 2); cx <= Math.min(cw - 1, rect.x1 + 2); cx++) { if (!(++cells & 127)) yield; let sum = 0, n = 0; for (let y = 0; y < C; y++) { const yy = cy * C + y; if (yy >= win.h) break; for (let x = 0; x < C; x++) { const xx = cx * C + x; if (xx >= win.w) break; sum += cover[yy * win.w + xx]; n++; } } cellCover[cy * cw + cx] = n ? sum / n : 0; }
		// Every pixel of this rectangle samples the same four corners. Fill those once; the lookups
		// below are the closures' clamp and the same subtract, so the floats do not move.
		const cxA = Math.floor((px0 + .5) / C - .5), cxB = Math.floor((px1 + .5) / C - .5) + 1;
		const cyA = Math.floor((py0 + .5) / C - .5), cyB = Math.floor((py1 + .5) / C - .5) + 1;
		const gw = Math.max(0, cxB - cxA + 1), gh = Math.max(0, cyB - cyA + 1), corners = gw * gh;
		if (scratch.cornerCover.length < corners) { scratch.cornerCover = new Float32Array(corners); scratch.cornerFloor = new Float64Array(corners); scratch.cornerDelta = new Float64Array(corners * 4); }
		const coverG = scratch.cornerCover, floorG = scratch.cornerFloor, deltaG = scratch.cornerDelta, dep = this.wetDeposited;
		for (let cy = cyA; cy <= cyB; cy++) {
			const ccy = cy < 0 ? 0 : cy > ch - 1 ? ch - 1 : cy;
			for (let cx = cxA; cx <= cxB; cx++) {
				if (!(++cells & 127)) yield;
				const ccx = cx < 0 ? 0 : cx > cw - 1 ? cw - 1 : cx;
				const i = (cy - cyA) * gw + (cx - cxA), o = ccy * cw + ccx, p4 = o * 4;
				coverG[i] = cellCover[o];
				const mass = state.amount[o] + state.settledAmount[o], own = dep[o] < mass ? dep[o] : mass;
				floorG[i] = Math.min(1, (mass - own) / .03);
				deltaG[i * 4] = P[p4] - B[p4]; deltaG[i * 4 + 1] = P[p4 + 1] - B[p4 + 1]; deltaG[i * 4 + 2] = P[p4 + 2] - B[p4 + 2]; deltaG[i * 4 + 3] = P[p4 + 3] - B[p4 + 3];
			}
		}
		const coverAt = (cx, cy) => coverG[(cy - cyA) * gw + (cx - cxA)];
		const delta = (cx, cy, c) => deltaG[((cy - cyA) * gw + (cx - cxA)) * 4 + c];
		// Pigment that FLOWED into a cell (beyond what its dabs deposited) shows over the whole cell:
		// the bloom is not shaped by the dab's mask. Its floor rises with the flowed-in mass.
		const opts = this.wetOptions, tooth = opts.tooth ?? .5, grain = opts.grain ?? 1, half = tooth / 2;
		const grit = fine ? (opts.grit ?? .22) : 0;
		// The rim is a REDISTRIBUTION and the refine pass owes the wash its weight back (witness
		// `paint-wet-presets`: "the refine pass moved the wash's weight, not just its grain"). So the
		// front's share is measured first, over exactly the pixels about to be composed, and the belly
		// gives up precisely that much. One extra sweep at commit, nothing under the finger.
		let bellyK = 0;
		const rimAt = (cx0, cy0) => {
			const aC = delta(cx0, cy0, 3), slope = Math.abs(delta(cx0 + 1, cy0, 3) - aC) + Math.abs(delta(cx0, cy0 + 1, 3) - aC);
			return slope > RAPIER_WET_FRONT ? Math.min(1, slope / (RAPIER_WET_FRONT * RAPIER_WET_RIM_SPAN)) : 0;
		};
		// READ-ONLY on the lineage. A cell's own deposit can only ever be what it still holds, and
		// writing that clamp back here would make composition edit the record that decides later
		// composition, so how often the frame drew would change the kept pixels. The clamp is physics:
		// it happens in `_wetLineage`, once per advance of time. Here it is only read.
		const floorAt = (cx, cy) => floorG[(cy - cyA) * gw + (cx - cxA)];
		if (fine && grit && RAPIER_WET_RIM > 0) {
			let front = 0, belly = 0;
			for (let y = py0; y <= py1; y++) {
				const sy = y + win.y0; if (sy >= H) break;
				const fy = (y + .5) / C - .5, cy0 = Math.floor(fy);
				for (let x = px0; x <= px1; x++) {
					if (!(++cells & 127)) yield;
					const sx = x + win.x0; if (sx >= W) break;
					const fx = (x + .5) / C - .5, cx0 = Math.floor(fx);
					const da = Math.abs(delta(cx0, cy0, 3)); if (!(da > 0)) continue;
					const rk = rimAt(cx0, cy0);
					front += da * rk; belly += da * (1 - rk);
				}
			}
			bellyK = belly > 1e-6 ? Math.min(RAPIER_WET_BELLY_MAX, RAPIER_WET_RIM * front / belly) : 0;
		}
		for (let y = py0; y <= py1; y++) {
			const sy = y + win.y0; if (sy >= H) break;
			const fy = (y + .5) / C - .5, cy0 = Math.floor(fy), ty = fy - cy0;
			for (let x = px0; x <= px1; x++) {
				if (!(++cells & 127)) yield;
				const sx = x + win.x0; if (sx >= W) break;
				const fx = (x + .5) / C - .5, cx0 = Math.floor(fx), tx = fx - cx0, i = (sy * W + sx) * 4, j = (y * win.w + x) * 4;
				// Guided by coverage: inside touched cells the delta is scaled by fine/cell coverage
				// (the dab's edge), capped at 1; where only flow reached (no coverage) it shows whole.
				const cc = (coverAt(cx0, cy0) * (1 - tx) + coverAt(cx0 + 1, cy0) * tx) * (1 - ty) + (coverAt(cx0, cy0 + 1) * (1 - tx) + coverAt(cx0 + 1, cy0 + 1) * tx) * ty;
				// ...and the crossing from dab-shaped to flow-shaped is itself a ramp, not a step: a hard
				// threshold on a smooth field only draws a contour line where the grid drew teeth.
				let g = 1;
				if (cc > .02) { const fl = (floorAt(cx0, cy0) * (1 - tx) + floorAt(cx0 + 1, cy0) * tx) * (1 - ty) + (floorAt(cx0, cy0 + 1) * (1 - tx) + floorAt(cx0 + 1, cy0 + 1) * tx) * ty;
					const masked = Math.max(fl, Math.min(1, cover[y * win.w + x] / cc)), k = Math.min(1, (cc - .02) / .06); g = 1 + k * (masked - 1); }
				// More pigment settles in the sheet's valleys and less on its ridges, per pixel. It is a
				// redistribution of PIGMENT, not of coverage: the wash's own alpha is left alone, or
				// modulating it would thin the mark on average and the whole stroke would come out
				// paler than the solver made it. Bounded both ways.
				let gc = 1, edge = 1, rim = 1;
				if (fine && grit) {
					const t = toothAt(this.wetSeed, (win.x0 + x) / C, (win.y0 + y) / C, tooth, grain);
					gc = Math.max(.72, Math.min(1.28, 1 + grit * (half - t) / (half || 1)));
					// The pigment field is bilinear from cells several pixels wide, so nothing finer than a cell
					// can exist and its front arrives as a smooth ramp; grit would then speckle that ramp, and a
					// kept wash would look like blurry noise with artificial edges. A real tideline is not smooth
					// and its detail does not come from the water -- it comes from the SHEET, which this surface
					// knows exactly at every raster pixel and which is coherent across the whole painting. So the
					// front is reconstructed against the paper: steep alpha gradients are pushed toward the
					// tooth's own peaks and valleys, which turns a blurred cell boundary into a wandering,
					// paper-shaped edge with real sub-cell detail. Flat interiors have no gradient and are left
					// exactly as the solver made them, so this adds an edge and never invents a wash.
					const aC = delta(cx0, cy0, 3), aX = delta(cx0 + 1, cy0, 3), aY = delta(cx0, cy0 + 1, 3);
					const slope = Math.abs(aX - aC) + Math.abs(aY - aC);
					if (slope > RAPIER_WET_FRONT) {
						const k = Math.min(1, (slope - RAPIER_WET_FRONT) / RAPIER_WET_FRONT);
						edge = 1 + k * RAPIER_WET_TIDE * (2 * (t / (tooth || 1)) - 1);
					}
					// The drying front stands deeper than the belly behind it. Water leaves fastest at a
					// wash's perimeter and carries pigment there, so this is a REDISTRIBUTION, applied
					// to all four channels alike: the front gains what the belly gives up, the straight
					// colour is untouched, and what rises is the concentration -- which on white paper
					// is exactly the darker edge that reads as watercolour. A colour-only version was
					// tried first and is invisible: the rim's coverage is a fifth of the belly's, so
					// deepening its pigment 1.6x still leaves it lighter than what it borders.
					const rk = Math.min(1, slope / (RAPIER_WET_FRONT * RAPIER_WET_RIM_SPAN));
					rim = 1 + RAPIER_WET_RIM * rk - bellyK * (1 - rk);
				}
				for (let c = 0; c < 4; c++) {
					const d = (delta(cx0, cy0, c) * (1 - tx) + delta(cx0 + 1, cy0, c) * tx) * (1 - ty) + (delta(cx0, cy0 + 1, c) * (1 - tx) + delta(cx0 + 1, cy0 + 1, c) * tx) * ty;
					D[i + c] = Math.min(1, Math.max(0, RB[j + c] + d * g * edge * rim * (c < 3 ? gc : 1)));
				}
				if (D[i + 3] > 0) for (let c = 0; c < 3; c++) D[i + c] = Math.min(D[i + c], D[i + 3]);
			}
		}
		this._touch(win.x0 + px0, win.y0 + py0, win.x0 + px1, win.y0 + py1);
	}
	// Steps the wet time owed (`dt` plus what accrued under the finger); `limit` caps how much of it
	// one call advances so a long stroke's owed time drains over frames (the wash blooms in view)
	// instead of freezing the hand at release -- the remainder stays owed. Water that reaches the
	// window's edge grows the window (the flow margin), so a bloom is never cut flat at a wall.
	// The wash's edge, rounded once, when the stroke is kept. The solver's front is quantised to its
	// own 3-pixel cells, so a boundary running diagonally climbs them in evenly spaced steps -- a
	// REGULAR pitch, which is what the eye calls digital. Three 1-2-1 averages over the band around
	// the front is a Gaussian of about one cell: the scale the solver could not resolve, and nothing
	// finer. The band is a few thousand pixels around a mark, so it costs almost nothing, and the
	// interior keeps its granulation untouched.
	_wetFinish(rect) { return finishWetIterator(this._wetFinishWork(rect)); }
	*_wetFinishWork(rect) {
		let cells = 0;
		const win = this.wetWindow, C = this.wetCell, D = this.data, W = this.width, H = this.height;
		const px0 = Math.max(0, (rect.x0 - 1) * C), py0 = Math.max(0, (rect.y0 - 1) * C);
		const px1 = Math.min(win.w, (rect.x1 + 2) * C) - 1, py1 = Math.min(win.h, (rect.y1 + 2) * C) - 1;
		const w = px1 - px0 + 1, h = py1 - py0 + 1;
		if (w < 5 || h < 5) return;
		const src = new Float32Array(w * h * 4);
		for (let y = 0; y < h; y++) { yield; const sy = win.y0 + py0 + y; if (sy >= H) break; const from = (sy * W + win.x0 + px0) * 4, n = Math.min(w, W - win.x0 - px0); src.set(D.subarray(from, from + n * 4), y * w * 4); }
		const at = (x, y, c) => src[((y < 0 ? 0 : y > h - 1 ? h - 1 : y) * w + (x < 0 ? 0 : x > w - 1 ? w - 1 : x)) * 4 + c];
		// The band: every pixel whose own cell-wide neighbourhood disagrees with itself, widened by a
		// cell so the average has somewhere to reach from.
		// On ALPHA alone -- the mark's own front. Granulation varies a wash's pigment and hardly its
		// coverage, so a colour test would call the inside of a wash a boundary and average away the
		// grain (`paint-wet-step` measures it). Two colours meeting at full alpha are not a front:
		// bleed softens that in the water instead.
		const edge = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			if (!(++cells & 127)) yield;
			let lo = 1, hi = 0;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = at(x + dx, y + dy, 3); if (v < lo) lo = v; if (v > hi) hi = v; }
			if (hi - lo >= .06) edge[y * w + x] = 1;
		}
		// ...and only where WATER ACTUALLY WENT. An alpha gradient alone is not evidence of a wash: a
		// crisp dry line lying beside one has a steep gradient too, and smoothing it would blur paint
		// the water never touched. Accidental blur is not lifting. The cell's own record of what it was
		// ever given or ever held is the test.
		const st = this.wetState, dep = this.wetDeposited, cw2 = win.cw, ch2 = win.ch;
		const wetCell = (x, y) => {
			const cx = ((px0 + x) / C) | 0, cy = ((py0 + y) / C) | 0;
			if (cx < 0 || cy < 0 || cx >= cw2 || cy >= ch2) return false;
			const o = cy * cw2 + cx;
			return (st.amount[o] + st.settledAmount[o]) > 1e-6 || (dep && dep[o] > 1e-6);
		};
		const band = [];
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			if (!(++cells & 127)) yield;
			if (!wetCell(x, y)) continue;
			let near = 0;
			for (let dy = -C; dy <= C && !near; dy++) for (let dx = -C; dx <= C; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && edge[yy * w + xx]) { near = 1; break; } }
			if (near) band.push(y * w + x);
		}
		if (!band.length) return;
		const n = band.length, hold = new Float32Array(n * 4);
		for (let pass = 0; pass < 3; pass++) {
			for (let k = 0; k < n; k++) {
				if (!(++cells & 127)) yield;
				const p = band[k], x = p % w, y = (p - x) / w;
				for (let c = 0; c < 4; c++) {
					let sum = 0;
					for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += at(x + dx, y + dy, c) * ((dx ? 1 : 2) * (dy ? 1 : 2));
					hold[k * 4 + c] = sum / 16;
				}
			}
			for (let k = 0; k < n; k++) { if (!(++cells & 127)) yield; src.set(hold.subarray(k * 4, k * 4 + 4), band[k] * 4); }
		}
		for (let k = 0; k < n; k++) {
			if (!(++cells & 127)) yield;
			const p = band[k], x = p % w, y = (p - x) / w, sy = win.y0 + py0 + y, sx = win.x0 + px0 + x;
			if (sy >= H || sx >= W) continue;
			const i = (sy * W + sx) * 4;
			for (let c = 0; c < 4; c++) { const v = src[p * 4 + c]; D[i + c] = v < 0 ? 0 : v > 1 ? 1 : v; }
			if (D[i + 3] > 0) for (let c = 0; c < 3; c++) if (D[i + c] > D[i + 3]) D[i + c] = D[i + 3];
		}
		this._touch(win.x0 + px0, win.y0 + py0, win.x0 + px1, win.y0 + py1);
	}
	// The front, smoothed in the SOLVER's own cells, just before the stroke is composed and kept.
	// Rendering the same picture at one raster pixel a cell is perfectly smooth and ten times slower,
	// which is the diagnosis: the reconstruction does not step, the front's own values disagree from
	// cell to cell, and a contour through data that wobbles every three pixels wobbles every three
	// pixels. Two 1-2-1 averages of the wet DELTA over the cells where alpha is still climbing. The
	// state is spent straight after, so this is the last thing that reads it; the base is held out
	// and added back, so no pigment is created.
	_wetSmoothCells(rect) { return finishWetIterator(this._wetSmoothCellsWork(rect)); }
	*_wetSmoothCellsWork(rect) {
		let cells = 0;
		const state = this.wetState, win = this.wetWindow; if (!state || !win) return;
		const cw = win.cw, ch = win.ch, P = state.pixels, B = state.base;
		const x0 = Math.max(0, rect.x0 - 2), y0 = Math.max(0, rect.y0 - 2), x1 = Math.min(cw - 1, rect.x1 + 2), y1 = Math.min(ch - 1, rect.y1 + 2);
		const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 3 || h < 3) return;
		const d = new Float32Array(w * h * 4);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!(++cells & 127)) yield; const o = ((y0 + y) * cw + x0 + x) * 4, j = (y * w + x) * 4; for (let c = 0; c < 4; c++) d[j + c] = P[o + c] - B[o + c]; }
		const at = (x, y, c) => d[((y < 0 ? 0 : y > h - 1 ? h - 1 : y) * w + (x < 0 ? 0 : x > w - 1 ? w - 1 : x)) * 4 + c];
		// Only where the wash's own ALPHA is still climbing -- its front. Granulation varies a cell's
		// PIGMENT and barely its coverage, so testing alpha alone leaves the middle of a wash exactly
		// as the solver granulated it (`paint-wet-step` measures that correlation) and takes in only
		// the band where the mark begins and ends. A colour boundary at full alpha is not the front
		// and is not smoothed here: bleed softens it in the water, which is where it belongs.
		const band = [];
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!(++cells & 127)) yield;
			let lo = 1, hi = -1;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = at(x + dx, y + dy, 3); if (v < lo) lo = v; if (v > hi) hi = v; }
			if (hi - lo >= .04) band.push(y * w + x);
		}
		if (!band.length) return;
		const m = band.length, hold = new Float32Array(m * 4);
		for (let pass = 0; pass < 2; pass++) {
			for (let k = 0; k < m; k++) { if (!(++cells & 127)) yield; const p = band[k], x = p % w, y = (p - x) / w;
				for (let c = 0; c < 4; c++) { let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += at(x + dx, y + dy, c) * ((dx ? 1 : 2) * (dy ? 1 : 2)); hold[k * 4 + c] = sum / 16; } }
			for (let k = 0; k < m; k++) { if (!(++cells & 127)) yield; d.set(hold.subarray(k * 4, k * 4 + 4), band[k] * 4); }
		}
		for (let k = 0; k < m; k++) { if (!(++cells & 127)) yield; const p = band[k], x = p % w, y = (p - x) / w, o = ((y0 + y) * cw + x0 + x) * 4;
			for (let c = 0; c < 4; c++) { const v = B[o + c] + d[p * 4 + c]; P[o + c] = v < 0 ? 0 : v > 1 ? 1 : v; }
			if (P[o + 3] > 0) for (let c = 0; c < 3; c++) if (P[o + c] > P[o + 3]) P[o + c] = P[o + 3]; }
	}
	// Grows the wash's extent (inclusive cell rectangle), clamped to the live window.
	_touchWet(box) {
		const win = this.wetWindow; if (!win) return;
		const x0 = Math.max(0, Math.min(win.cw - 1, box.x0)), y0 = Math.max(0, Math.min(win.ch - 1, box.y0));
		const x1 = Math.max(0, Math.min(win.cw - 1, box.x1)), y1 = Math.max(0, Math.min(win.ch - 1, box.y1));
		const t = this.wetTouched;
		if (!t) { this.wetTouched = {x0, y0, x1, y1}; return; }
		if (x0 < t.x0) t.x0 = x0; if (y0 < t.y0) t.y0 = y0; if (x1 > t.x1) t.x1 = x1; if (y1 > t.y1) t.y1 = y1;
		if (t.x0 < 0) t.x0 = 0; if (t.y0 < 0) t.y0 = 0; if (t.x1 > win.cw - 1) t.x1 = win.cw - 1; if (t.y1 > win.ch - 1) t.y1 = win.ch - 1;
	}
	advanceWet(dt, limit = Infinity) { const changed = this.stepWet(dt, limit); this.composeWet(); return changed; }
	// A frame owns one suspended operation, never a second material state. Mutations finish that
	// operation before taking a checkpoint or changing its inputs; the next feed is still owed.
	_finishWetWork() {
		if (this._wetRunning) return;
		const work = this._wetWork;
		this._wetWork = null; this._wetDryPhase = null;
		if (!work) return;
		this._wetRunning = true;
		try { finishWetIterator(work.iterator); work.resolve?.(); }
		catch (error) { work.reject?.(error); throw error; }
		finally { this._wetRunning = false; }
	}
	// Recovery can wait for the operation already under way without forcing a whole pass onto
	// its timer task. No new feed starts before that waiter has read the resulting material.
	pendingWetWork() {
		const work = this._wetWork; if (!work) return null;
		return work.promise || (work.promise = new Promise((resolve, reject) => { work.resolve = resolve; work.reject = reject; }));
	}
	dryWet(until, feed = 8, slice = 8, inputWaiting = null) {
		if (!this.wetState && !this._wetWork) return true;
		while (performance.now() < until && !inputWaiting?.()) {
			if (!this._wetWork) {
				const compose = this._wetDryPhase === 'compose';
				const step = !compose && (this.wet || this.wetPending);
				this.recordWetWork?.(compose ? 'composeWet' : step ? 'stepWet' : 'settleWet', compose ? [true] : step ? [feed, feed + slice] : []);
				this._wetWork = {iterator: compose ? this._composeWetWork(true) : step ? this._stepWetWork(feed, feed + slice) : this._settleWetWork(), next: step ? 'compose' : null};
			}
			const work = this._wetWork;
			let part;
			this._wetRunning = true;
			try { part = work.iterator.next(); }
			catch (error) { work.reject?.(error); throw error; }
			finally { this._wetRunning = false; }
			if (part.done) {
				this._wetWork = null; this._wetDryPhase = work.next;
				work.resolve?.();
				if (!this.wetState) return true;
				if (work.promise) return false;
			}
		}
		return false;
	}
	// One bounded slice of the owed projection, for a caller that owes the hand a frame. A drying
	// tick costs about 107.5 ms FIXED plus 0.454 ms per simulated ms, and the fixed part is three
	// O(active-area) passes charged per call however little time the call advanced -- so shrinking
	// the budget would multiply the total work instead of spreading it. `settle` is physics and has
	// to run per step; composing is presentation and belongs once a frame. Split so a caller can
	// advance many times and pay for the pixels once.
	// Pigment that flowed out of a cell is no longer that cell's dabs'. Time moving mass is what
	// makes that true, so the record is trimmed here, on the physics clock -- not while composing,
	// where the number of frames would decide the painting.
	_wetLineage() { return finishWetIterator(this._wetLineageWork()); }
	*_wetLineageWork() {
		let cells = 0;
		const state = this.wetState, dep = this.wetDeposited; if (!state || !dep) return;
		const win = this.wetWindow, w = state.composeBox || state.wetBox || state.active; if (!w) return;
		const cw = win.cw, A = state.amount, S = state.settledAmount;
		const x0 = Math.max(0, w.x0), x1 = Math.min(cw - 1, w.x1), y1 = Math.min(win.ch - 1, w.y1);
		for (let y = Math.max(0, w.y0); y <= y1; y++) for (let o = y * cw + x0, e = y * cw + x1; o <= e; o++) {
			if (!(++cells & 127)) yield;
			const mass = A[o] + S[o]; if (dep[o] > mass) dep[o] = mass;
		}
	}
	// One call into the solver may advance at most RAPIER_WET_STEP_MAX (paper.mjs's own `bounded(dt,
	// 0, 60000, 'Wet time')`), and that bound on a single call is right. But `wetPending` is an
	// AGGREGATE: live motion clamps each pointer event to 0.5 s and nothing caps the sum, so a valid
	// 61.5-second wet stroke owes 61,512.1 ms, and a single settlement call would throw `RangeError:
	// Wet time` on a drawing the person had every right to make.
	//
	// So the debt is PAID instead of refused or dropped, in whole chunks of the solver's own substep.
	// `step` advances by h = min(hMax, remaining), so a chunk that is an exact multiple of hMax runs
	// the identical substep sequence an uncapped call would have run -- no short substep appears at a
	// chunk boundary, and the numerical order is untouched. Elapsed time is preserved exactly: every
	// chunk is handed to `step`, which adds it to `s.elapsed` whether or not the paper is still wet.
	// At or under the bound this is a single call, byte for byte.
	//
	// This does not make a long stroke's close slow: `step` returns at its own `s.wet` test, so the
	// real work is bounded by the paper's drying time, not by the debt -- once the wash is dry the
	// remaining chunks cost one add each. Nothing is clamped, nothing is dropped, no external event's
	// allowance is widened, a long drawing stays a valid gesture, and nothing is allocated per dab.
	_drainWet(state, owed) { return finishWetIterator(this._drainWetWork(state, owed)); }
	*_drainWetWork(state, owed) {
		if (!(owed > 0)) return false;
		if (owed <= RAPIER_WET_STEP_MAX) return yield* stepWork(state, owed);
		const h = state.hMax > 0 ? state.hMax : 8;
		const chunk = h >= RAPIER_WET_STEP_MAX ? RAPIER_WET_STEP_MAX : Math.floor(RAPIER_WET_STEP_MAX / h) * h;
		let left = owed, changed = false;
		while (left > 0) { const take = left > chunk ? chunk : left; left -= take; if (yield* stepWork(state, take)) changed = true; }
		return changed;
	}
	stepWet(dt, limit = Infinity) { this._finishWetWork(); return finishWetIterator(this._stepWetWork(dt, limit)); }
	*_stepWetWork(dt, limit = Infinity) {
		const state = this.wetState; if (!state) { this.wetPending = 0; return false; }
		setGravity(state, this.wetGravity[0], this.wetGravity[1]);
		const owed = (dt || 0) + (this.wetPending || 0), step = Math.min(owed, limit); this.wetPending = owed - step;
		// A compose between steps drops this box. Dropping it here too means a frame that fits two
		// steps lineages the same cells as two frames: the schedule is not an input.
		if (state.composeBox) state.composeBox = null;
		const changed = yield* this._drainWetWork(state, step);
		yield* this._wetLineageWork();
		this._wetGrowForFlow();
		this.wetOwedBox = true;
		return changed;
	}
	// `settle` without `finish` reads pigment and writes pixels and never touches water: it is the
	// projection to the screen, not the physics, and it costs ten exp() per cell over the whole wet
	// area. Charging it per step is what made a drying tick cost 107.5 ms before it advanced any time
	// at all. Both it and the compose belong here, once a frame, however many steps that frame ran.
	// `settle` without `finish` reads pigment and writes pixels and never touches water: it is the
	// projection to the screen, not the physics, and it costs ten exp() a cell. A screen-sized wash is
	// a quarter-million cells, so ONE pass cannot fit in a frame at any budget -- that is the 484 ms
	// tick, and no scheduling of the physics can help. Cells settle independently, so the pass runs in
	// bands: a bounded slice a frame, the cursor carried, wrapping when it reaches the bottom. The
	// wash updates over a few frames instead of freezing one, and `settleWet` still does the whole
	// thing exactly at commit.
	composeWet(band = false) { this._finishWetWork(); return finishWetIterator(this._composeWetWork(band)); }
	*_composeWetWork(band = false) {
		this.opCompose();
		const live = this.wetState;
		if (!this.wetOwedBox || !live) return false;
		// What the renderer is OWED, not where the water is now. A cell that dried during the last
		// step changed its pigment and then left `wetBox` in the same pass, so composing `wetBox`
		// left that change on the floor.
		//
		// A band pass walks the debt as it stood when the pass began, and TAKES it: whatever arrives
		// while the cursor is walking accumulates afresh and is owed to the next pass. Reading the
		// live box every frame instead let it grow above the cursor, and those rows were never
		// walked and then discharged anyway -- rows of a drying wash left showing an older frame.
		if (!band || !this.wetBandBox) {
			this.wetBandBox = live.composeBox || live.wetBox || live.active;
			live.composeBox = null;
			this.wetBandY = 0;
		}
		const w = this.wetBandBox;
		if (!w) { this.wetOwedBox = false; return false; }
		const x0 = Math.max(0, w.x0 - 2), x1 = Math.min(live.width - 1, w.x1 + 2);
		const top = Math.max(0, w.y0 - 2), bottom = Math.min(live.height - 1, w.y1 + 2);
		// A caller that is not a frame (a witness, check-paper, the commit) must see the WHOLE
		// projection: banding is a scheduling favour to the hand, never a change to what is true.
		const rows = band ? Math.max(1, Math.floor(WET_SETTLE_CELLS / Math.max(1, x1 - x0 + 1))) : Infinity;
		let y = band ? this.wetBandY : top;
		if (!(y >= top && y <= bottom)) y = top;
		const yEnd = Math.min(bottom, y + rows - 1);
		const box = yield* settleWork(live, {rect: {x0, y0: y, x1, y1: yEnd}});
		// NOT `_touchWet`: what is kept at commit is decided by where paint and water went, never by
		// which rectangles happened to be drawn on the way. Letting compose widen it made the number
		// of frames move the committed region -- and with it the rim's conserving pre-pass, which
		// measures over exactly the pixels being composed.
		if (box) yield* this._wetComposeWork(box);
		// The debt is only discharged when the whole of it has been drawn -- and only the debt this
		// pass took. Anything the solver added while it walked is still owed.
		if (yEnd >= bottom) { this.wetBandY = 0; this.wetBandBox = null; this.wetOwedBox = !!live.composeBox; } else this.wetBandY = yEnd + 1;
		return true;
	}
	_wetGrowForFlow() {
		const state = this.wetState, win = this.wetWindow, a = state?.active, C = this.wetCell;
		if (!a || !state.wet) return;
		const edge = 2, atEdge = (a.x0 <= edge && win.x0 > 0) || (a.y0 <= edge && win.y0 > 0) || (a.x1 >= win.cw - 1 - edge && win.x0 + win.w < this.width) || (a.y1 >= win.ch - 1 - edge && win.y0 + win.h < this.height);
		if (!atEdge) return;
		const box = { x0: win.x0 + a.x0 * C, y0: win.y0 + a.y0 * C, w: (a.x1 - a.x0 + 1) * C, h: (a.y1 - a.y0 + 1) * C };
		const next = this._wetWindowFor(box, win);
		if (this._wetBytes(next) > (this.wetOptions.maxBytes ?? 96000000)) return; // no room: it dries at the wall
		this.beginWet(this.wetSeed, box);
	}
	settleWet() { this._finishWetWork(); return finishWetIterator(this._settleWetWork()); }
	*_settleWetWork() {
		this.opCompose();
		this.wetOwedBox = false;
		const state = this.wetState; if (!state) { this.wetPending = 0; return false; }
		setGravity(state, this.wetGravity[0], this.wetGravity[1]);
		if (this.wetPending) { yield* this._drainWetWork(state, this.wetPending); this.wetPending = 0; yield* this._wetLineageWork(); }
		const box = yield* settleWork(state, {finish: true});
		if (box) this._touchWet(box);
		// The whole wash, not the solver's last dirty box. Composing only the cells that moved last
		// would leave the rest of the mark carrying the live pass, and the two would meet along that
		// box's wall: a hard rectangular colour band across a crossing. One pass over the whole mark.
		const whole = this.wetTouched;
		if (whole) { yield* this._wetSmoothCellsWork(whole); yield* this._wetComposeWork(whole, true); yield* this._wetFinishWork(whole); }
		this.wetState = null; this.wetWindow = null; this.wetRasterBase = null; this.wetCover = null; this.wetDeposited = null; this.wetTouched = null; this.wetBandBox = null; delete this.drawDab;
		return true;
	}
	get wet() { return !!this.wetState?.wet; }
	// Sensor events never force a held pass to run on the input task. The next logical physics
	// step takes the latest tilt; an accepted step keeps the gravity it began with throughout.
	tilt(gx, gy) { this.wetGravity = [gx || 0, gy || 0]; if (this.wetState && !this._wetWork) setGravity(this.wetState, gx, gy); }
	_drawAfterWet(...args) { this.settleWet(); return this.drawDab(...args); }
	drawWetDab(seed, loads, x, y, radius, r, g, b, opaque, hardness, softness, alpha, aspect, angle) {
		x *= this.scale; y *= this.scale; radius *= this.scale;
		opaque = clamp(opaque, 0, 1); hardness = clamp(hardness, 0, 1); softness = clamp(softness, 0, 1);
		if (radius < .1 || hardness === 0 || softness === 1 || opaque === 0) return false;
		const box = this._renderMask(x, y, radius, hardness, softness, Math.max(1, aspect), angle);
		if (!box) return false;
		const state = this.beginWet(seed, box), win = this.wetWindow, C = this.wetCell;
		// the dab's mask box-filtered onto the window's cells
		const cx0 = Math.floor((box.x0 - win.x0) / C), cy0 = Math.floor((box.y0 - win.y0) / C), cx1 = Math.min(win.cw - 1, Math.floor((box.x0 + box.w - 1 - win.x0) / C)), cy1 = Math.min(win.ch - 1, Math.floor((box.y0 + box.h - 1 - win.y0) / C));
		const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1; if (cw < 1 || ch < 1) return false;
		this._touchWet({x0: cx0, y0: cy0, x1: cx1, y1: cy1});
		const coarseN = cw * ch;
		if (this.wetCoarse.length < coarseN) this.wetCoarse = new Float32Array(coarseN);
		const coarse = this.wetCoarse; coarse.fill(0, 0, coarseN);
		const area = C * C, cover = this.wetCover, ww = win.w;
		for (let y = 0; y < box.h; y++) { const cy = Math.floor((box.y0 + y - win.y0) / C) - cy0, row = (box.y0 + y - win.y0) * ww + box.x0 - win.x0; for (let x = 0; x < box.w; x++) { const cx = Math.floor((box.x0 + x - win.x0) / C) - cx0, m = box.mask[y * box.w + x]; if (cx >= 0 && cx < cw && cy >= 0 && cy < ch) { coarse[cy * cw + cx] += m / area; if (m > cover[row + x]) cover[row + x] = m; } } }
		const changed = deposit(state, {x0: cx0, y0: cy0, w: cw, h: ch, mask: coarse, ...loads, pigment: loads.pigment * clamp(alpha, 0, 1), opaque,
			r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1),
			brush: this.hold?.store, velocity: this.hold?.velocity || 0, hold: this.hold?.strength || 0, col0: this.hold?.col0, col1: this.hold?.col1});
		// The mark shows under the finger: the dab's own cells settle and compose at once (a local
		// settle, dab-sized); the physics -- flow, bloom, drying -- still waits for `advanceWet`.
		if (changed) {
			// What each cell was given directly (the compose tells flowed-in pigment from deposited by it).
			const dep = this.wetDeposited, load = loads.pigment * clamp(alpha, 0, 1) * opaque;
			for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) dep[(cy0 + y) * win.cw + cx0 + x] += coarse[y * cw + x] * load; const rect = {x0: cx0, y0: cy0, x1: cx1, y1: cy1}; settle(state, {rect}); this._wetCompose(rect); this.wetDirty = true; }
		return changed;
	}
	// Impasto: light the mark WHEN IT IS SHOWN, never into the stored pixels.
	//
	// The height the eye reads is the paint's own volume plus the sheet it sits on, so the normal
	// comes from their sum -- what a raking light actually finds on a canvas. One directional light:
	// a diffuse term that bends the colour toward or away from the light, and a specular highlight on
	// the ridges a loaded brush leaves.
	//
	// Baked into `this.data` at commit, every later stroke would re-light every earlier one,
	// multiplicatively (one stroke's mean straight colour goes 0.243 -> 0.473 over eight passes): a
	// painting bleaching itself away as you work on it. Shading is a VIEW of the pigment, not a
	// change to it, so it belongs where the pixels are read out. Stored colour stays pigment: a
	// smudge samples unlit paint, as it must, and the relief cannot compound.
	shadeInto(out, box, byte, quality) {
		if (this.volume) this._shadeClassic(out, box, byte);
		if (this.oil) this._shadeOil(out, box, byte, quality);
	}
	_shadeClassic(out, box, byte) {
		const V = this.volume, O = this.oil;
		const D = this.data, W = this.width, H = this.height, f = this.toothTiles ? this : null;
		const [lx, ly, lz] = RAPIER_LIGHT;
		const at = (x, y) => V[y * W + x] / 255 + (f ? f._toothTile(x, y) / 255 * .25 : 0);
		const w = box.x1 - box.x0 + 1;
		for (let y = Math.max(1, box.y0); y <= Math.min(H - 2, box.y1); y++) {
			for (let x = Math.max(1, box.x0); x <= Math.min(W - 2, box.x1); x++) {
				const i = (y * W + x) * 4;
				const a = D[i + 3]; if (a <= 0) continue;
				if (!V[y * W + x] || O && O[y * W + x]) continue;
				const h = at(x, y); if (h <= 0) continue;
				// Central differences give the slope; the z term sets how steep a unit of height reads.
				const nx = at(x - 1, y) - at(x + 1, y), ny = at(x, y - 1) - at(x, y + 1), nz = .16;
				const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
				const dot = (nx * lx + ny * ly + nz * lz) / len;
				const lit = 1 + RAPIER_RELIEF * dot;
				const spec = dot > 0 ? RAPIER_GLOSS * Math.pow(dot, 12) * Math.min(1, h * 2) : 0;
				const q = ((y - box.y0) * w + (x - box.x0)) * 4;
				// The byte comes from the threshold table, exactly `Math.round(Math.pow(v, 1 / 2.2) * 255)`:
				// three pow calls a lit pixel were most of the relief, the freeze at every lift (a half-screen
				// Oil painting read out in 372 ms, 350 of them shading; 170 ms through the table).
				for (let c = 0; c < 3; c++) out[q + c] = byte(clamp(D[i + c] / a * lit + spec, 0, 1));
			}
		}
	}
	// Oil is lit as a surface, not as a texture. The normal comes from the paint's own height (a hair's lane, the rim a brush
	// pushes up at its side, the weave of the sheet where the paint is thin enough to show it), and flat paint is exactly the
	// colour the person chose: a slope toward the light brightens it, a slope away darkens it, and a wet ridge facing the
	// light carries a tight highlight. `quality` is the one difference between the live frame and the kept picture: the live
	// readout needs only a pixel's neighbours (it patches the box the hand just touched), the kept one also casts the ridges'
	// shadows across the paint and darkens the cavities between them -- the pass a finished painting is worth waiting for.
	_shadeOil(out, box, byte, quality) {
		const O = this.oil, D = this.data, W = this.width, H = this.height, final = quality === 'final', pad = final ? 8 : 1;
		const bx0 = Math.max(0, box.x0 - pad), by0 = Math.max(0, box.y0 - pad), bx1 = Math.min(W - 1, box.x1 + pad), by1 = Math.min(H - 1, box.y1 + pad);
		const hw = bx1 - bx0 + 1, hh = by1 - by0 + 1, Hf = new Float32Array(hw * hh), tox = this.toothOX, toy = this.toothOY;
		for (let y = by0; y <= by1; y++) for (let x = bx0, k = (y - by0) * hw, i = y * W + bx0; x <= bx1; x++, k++, i++) {
			const o = O[i]; if (!o) continue;
			const h = o / RAPIER_OIL_UNIT, thin = h < .6 ? 1 - h / .6 : 0;
			Hf[k] = h + (thin > 0 ? RAPIER_OIL_WEAVE * thin * OIL_WEAVE[((y + toy) & 63) * 64 + ((x + tox) & 63)] : 0);
		}
		// The kept picture reads the paint a little softer than the live frame does: wet oil has no knife-edge crease, and a
		// pixel's height is nearer the mean of its neighbours than its own (a 1-2-1 kernel each way, twice).
		if (final) for (let pass = 0; pass < 2; pass++) {
			const T = new Float32Array(hw * hh);
			for (let y = 0; y < hh; y++) for (let x = 1, k = y * hw + 1; x < hw - 1; x++, k++) T[k] = (Hf[k - 1] + 2 * Hf[k] + Hf[k + 1]) * .25;
			for (let y = 1; y < hh - 1; y++) for (let x = 1, k = y * hw + 1; x < hw - 1; x++, k++) Hf[k] = (T[k - hw] + 2 * T[k] + T[k + hw]) * .25;
		}
		const [lx, ly, lz] = RAPIER_OIL_LIGHT, lxy = Math.hypot(lx, ly), tan = lz / lxy, sx = lx / lxy, sy = ly / lxy;
		const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz), w = box.x1 - box.x0 + 1;
		for (let y = Math.max(1, box.y0); y <= Math.min(H - 2, box.y1); y++) {
			for (let x = Math.max(1, box.x0); x <= Math.min(W - 2, box.x1); x++) {
				const i = y * W + x, o = O[i]; if (!o) continue;
				const a = D[i * 4 + 3]; if (a <= 0) continue;
				const k = (y - by0) * hw + (x - bx0), h0 = Hf[k];
				const gx = (Hf[k + 1] - Hf[k - 1]) * .5, gy = (Hf[k + hw] - Hf[k - hw]) * .5, nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
				const nx = -gx * nl, ny = -gy * nl, nz = nl;
				let lit = 1 + RAPIER_OIL_RELIEF * (nx * lx + ny * ly + nz * lz - lz), spec = 0;
				const nh = (nx * hx + ny * hy + nz * hz) / hl;
				if (nh > .6) { let t = nh * nh; t *= t; t *= t; t *= t; spec = RAPIER_OIL_GLOSS * t * t * t * Math.min(1, h0 / .8); }
				if (final && x - 8 >= bx0 && x + 8 <= bx1 && y - 8 >= by0 && y + 8 <= by1) {
					// A ridge's shadow: march toward the light and ask whether the paint rises above the ray.
					let block = 0;
					for (let s = 1; s <= 6; s++) {
						const hs = Hf[(y - by0 + Math.round(sy * s)) * hw + (x - bx0 + Math.round(sx * s))] - (h0 + s * tan);
						if (hs > block) block = hs;
					}
					lit *= 1 - .5 * Math.min(1, block / .5);
					// The cavity: how far below its surroundings a pixel lies.
					const r = 3, yy = (y - by0) * hw + (x - bx0);
					const around = (Hf[yy - r] + Hf[yy + r] + Hf[yy - r * hw] + Hf[yy + r * hw] + Hf[yy - r - r * hw] + Hf[yy + r - r * hw] + Hf[yy - r + r * hw] + Hf[yy + r + r * hw]) * .125;
					lit *= 1 - Math.min(.3, Math.max(0, around - h0) * .35);
					spec *= (1 - Math.min(1, block / .3)) * Math.min(1, Math.max(0, h0 - around) / .45);
				}
				if (lit < .35) lit = .35;
				const q = ((y - box.y0) * w + (x - box.x0)) * 4, p = i * 4;
				for (let c = 0; c < 3; c++) { const v = D[p + c] / a; out[q + c] = byte(clamp(v * lit + spec * (.7 + .3 * v), 0, 1)); }
			}
		}
	}
	// Kept as the one door the tool calls at commit; it no longer writes anything, because the
	// shading is applied on read. Left in place so a caller that means "the stroke is kept" still has
	// somewhere to say so, and so nothing silently double-lights again.
	_touch(x0, y0, x1, y1) {
		x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.width - 1, x1); y1 = Math.min(this.height - 1, y1);
		if (x1 < x0 || y1 < y0) return;
		this.revision++;
		if (this.growBox !== undefined) {
			const box = this.growBox;
			if (box) { box.x0 = Math.min(box.x0, x0); box.y0 = Math.min(box.y0, y0); box.x1 = Math.max(box.x1, x1); box.y1 = Math.max(box.y1, y1); }
			else this.growBox = {x0, y0, x1, y1};
		}
		const prepared = this.preparedGrowth;
		if (prepared) {
			const changed = prepared.changed;
			if (changed) { changed.x0 = Math.min(changed.x0, x0); changed.y0 = Math.min(changed.y0, y0); changed.x1 = Math.max(changed.x1, x1); changed.y1 = Math.max(changed.y1, y1); }
			else prepared.changed = {x0, y0, x1, y1};
		}
		const b = this.boundsDirty;
		if (b) { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); }
		else this.boundsDirty = { x0, y0, x1, y1 };
		const d = this.dirty;
		// Mutated, not replaced: `takeDirty` hands the object away and nulls the field, so nothing can
		// be holding a rectangle this widens.
		if (d) { d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1); d.y1 = Math.max(d.y1, y1); }
		else this.dirty = { x0, y0, x1, y1 };
		// Separate from the blit and from bounds: the committed read-out shades only this.
		const s = this.sinceRead;
		if (s) { s.x0 = Math.min(s.x0, x0); s.y0 = Math.min(s.y0, y0); s.x1 = Math.max(s.x1, x1); s.y1 = Math.max(s.y1, y1); }
		else this.sinceRead = { x0, y0, x1, y1 };
	}
	takeDirty() { const d = this.dirty; this.dirty = null; return d; }
	// A strip of half-width `half` from (ax, ay) to (bx, by), in the brush's units, laid as normal paint or (alpha < 1) as an eraser,
	// the way a dab is. It is a sheared band: its ends are not square to the way it goes but lean by `shear` (a blade's lane held across
	// the stroke starts and ends along the blade). A pixel belongs along its length by its centre, and across it too on a side that
	// meets another strip, so strips that meet end to end share no pixel and leave none out: a translucent hair swept in short steps is
	// one even line, not a string of beads (a dab's round ends overlap their neighbours and double the translucent paint there). A free
	// side or a free start is antialiased. The blade's lanes are laid with these.
	drawStrip(ax, ay, bx, by, half, r, g, b, opaque, alpha, softLeft = true, softRight = true, softStart = false, shear = 0, opaqueFrom = opaque, extra = 0) {
		const sc = this.scale; ax *= sc; ay *= sc; bx *= sc; by *= sc; half *= sc;
		opaque = clamp(opaque, 0, 1); opaqueFrom = clamp(opaqueFrom, 0, 1); alpha = clamp(alpha, 0, 1);
		const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), top = Math.max(opaque, opaqueFrom);
		if (!(top > 0) || !(len > 1e-6) || !(half > .05)) return false;
		extra *= sc;
		const ux = dx / len, uy = dy / len, k = shear, edge = 1 / Math.sqrt(1 + k * k);
		let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
		for (const s of [-half, half]) for (const t of [k * s - 1, len + extra + k * s + 1]) {
			const wx = ax + ux * t - uy * s, wy = ay + uy * t + ux * s;
			lx = Math.min(lx, wx); hx = Math.max(hx, wx); ly = Math.min(ly, wy); hy = Math.max(hy, wy);
		}
		const x0 = Math.max(0, Math.floor(lx - 1)), y0 = Math.max(0, Math.floor(ly - 1)), x1 = Math.min(this.width - 1, Math.ceil(hx + 1)), y1 = Math.min(this.height - 1, Math.ceil(hy + 1));
		if (x1 < x0 || y1 < y0) return false;
		this._keepStrokePixels(x0, y0, x1, y1);
		const w = x1 - x0 + 1, h = y1 - y0 + 1;
		if (this.mask.length < w * h) this.mask = new Float32Array(w * h);
		const mask = this.mask; let any = false;
		for (let yp = y0; yp <= y1; yp++) {
			const cy = yp + .5 - ay; let m = (yp - y0) * w;
			for (let xp = x0; xp <= x1; xp++, m++) {
				const cx = xp + .5 - ax, s = -cx * uy + cy * ux, tau = cx * ux + cy * uy - k * s;
				if (tau >= len + extra || tau < (softStart ? -.5 / edge : 0)) { mask[m] = 0; continue; }
				// Across: a side that meets another strip is cut by the pixel's centre too (two antialiased edges that meet would leave a seam
				// of paint that is not there); a free side is antialiased.
				const left = softLeft ? Math.min(1, Math.max(0, half + s + .5)) : (s >= -half ? 1 : 0), right = softRight ? Math.min(1, Math.max(0, half - s + .5)) : (s < half ? 1 : 0);
				// The paint fades from the opacity the lane had at the last dab to the one it has now, so a fade is a gradient, not steps.
				const o = Math.min(left, right) * (softStart && tau < .5 / edge ? tau * edge + .5 : 1) * ((opaqueFrom + (opaque - opaqueFrom) * Math.min(1, Math.max(0, tau / len))) / top);
				if (o < 1 / 32768) { mask[m] = 0; continue; }
				mask[m] = o; any = true;
			}
		}
		if (!any) return false;
		const box = this.maskBox; box.x0 = x0; box.y0 = y0; box.w = w; box.h = h; box.mask = mask; box.spans = null;
		if (alpha === 1) this._blendNormal(box, r, g, b, top); else this._blendNormalEraser(box, r, g, b, alpha, top);
		this._touch(x0, y0, x1, y1);
		return true;
	}
	// The dab shape: opacity per pixel of the dab's bounding box (two linear segments in rr, the
	// squared normalised distance, hardness deciding the knee; radius < 3 gets the area-based
	// anti-aliasing), mirroring render_dab_mask.
	_renderMask(x, y, radius, hardness, softness, aspect, angle) {
		hardness = clamp(hardness, 0, 1);
		if (aspect < 1) aspect = 1;
		const seg1Offset = 1 * (1 - softness), seg1Slope = -(1 / hardness - 1) * (1 - softness);
		const seg2Offset = hardness / (1 - hardness) * (1 - softness), seg2Slope = -hardness / (1 - hardness) * (1 - softness);
		const rad = angle / 360 * 2 * Math.PI, cs = Math.cos(rad), sn = Math.sin(rad);
		const fringe = radius + 1;
		const x0 = Math.max(0, Math.floor(x - fringe)), y0 = Math.max(0, Math.floor(y - fringe));
		const x1 = Math.min(this.width - 1, Math.floor(x + fringe)), y1 = Math.min(this.height - 1, Math.floor(y + fringe));
		if (x1 < x0 || y1 < y0) return null;
		this._keepStrokePixels(x0, y0, x1, y1);
		const w = x1 - x0 + 1, h = y1 - y0 + 1;
		if (this.mask.length < w * h) this.mask = new Float32Array(w * h);
		const mask = this.mask, oneOverR2 = 1 / (radius * radius);
		const spans = this.spans && this.spans.length >= h * 2 ? this.spans : (this.spans = new Int32Array(Math.max(h * 2, 64)));
		let any = false;
		if (radius < 3) {
			const aaBorder = 1;
			let rAaStart = radius > aaBorder ? radius - aaBorder : 0;
			rAaStart *= rAaStart / aspect;
			const radArea1 = Math.sqrt(1 / Math.PI);
			for (let yp = y0; yp <= y1; yp++) for (let xp = x0; xp <= x1; xp++) {
				const pixelRight = x - xp, pixelBottom = y - yp, pcx = pixelRight - 0.5, pcy = pixelBottom - 0.5, pixelLeft = pixelRight - 1, pixelTop = pixelBottom - 1;
				let nearestX, nearestY, rNear, rrNear;
				if (pixelLeft < 0 && pixelRight > 0 && pixelTop < 0 && pixelBottom > 0) { nearestX = 0; nearestY = 0; rNear = rrNear = 0; }
				else {
					// closest point on the dab's axis line (through the origin, direction (cs, sn))
					const t = (pcx * cs + pcy * sn) / (cs * cs + sn * sn);
					nearestX = clamp(t * cs, pixelLeft, pixelRight); nearestY = clamp(t * sn, pixelTop, pixelBottom);
					const yyr = (nearestY * cs - nearestX * sn) * aspect, xxr = nearestY * sn + nearestX * cs;
					rNear = yyr * yyr + xxr * xxr; rrNear = rNear * oneOverR2;
				}
				let rr;
				if (rrNear > 1) rr = rrNear;
				else {
					const centerSign = (pcx - cs) * (sn) - (cs) * (pcy - (-sn));
					let farX, farY;
					if (centerSign < 0) { farX = nearestX - sn * radArea1; farY = nearestY + cs * radArea1; }
					else { farX = nearestX + sn * radArea1; farY = nearestY - cs * radArea1; }
					const yyr = (farY * cs - farX * sn) * aspect, xxr = farY * sn + farX * cs, rFar = yyr * yyr + xxr * xxr, rrFar = rFar * oneOverR2;
					if (rFar < rAaStart) rr = (rrFar + rrNear) * 0.5;
					else { const delta = rrFar - rrNear; rr = 1 - (1 - rrNear) / (1 + delta); }
				}
				let opa = rr <= hardness ? seg1Offset + rr * seg1Slope : seg2Offset + rr * seg2Slope;
				if (rr > 1) opa = 0;
				if (opa < 1 / 32768) opa = 0; else any = true;
				mask[(yp - y0) * w + (xp - x0)] = opa;
			}
			for (let j = 0; j < h; j++) { spans[j * 2] = 0; spans[j * 2 + 1] = w; }
		} else {
			// Each row's own reach of the ellipse, solved once: (u + v xx)^2 + (s + t xx)^2 <= radius^2 is a
			// quadratic in xx, so the pixels a row cannot reach are zeroed by a fill and never evaluated, and the
			// walkers take the span. The evaluated pixels run the arithmetic below unchanged; a pixel's margin
			// each side of the roots covers the roots' own rounding, and a pixel beyond that margin is outside by
			// at least 1/radius^2, far above what a double can mistake, so the mask is the one the whole-box walk
			// writes: `node tools/probes/scumble-cost.mjs --against <ref>` paints ten strokes of six brushes on
			// both engines and compares every surface byte. The box is 2.7x the dab on a Scumble stroke; the
			// probe's Scumble stroke at 89 over Oil paint goes from 1,208 to 1,062 ms with this, its masks from
			// 42 to 23 ms.
			const qa = sn * sn * aspect * aspect + cs * cs, v = -sn * aspect, r2 = radius * radius;
			for (let yp = y0; yp <= y1; yp++) {
				const yy = yp + 0.5 - y, j = yp - y0, row = j * w;
				const u = yy * cs * aspect, s = yy * sn, qb = u * v + s * cs, disc = qb * qb - qa * (u * u + s * s - r2);
				let ia = 0, ib = 0;
				if (disc >= 0) {
					const root = Math.sqrt(disc), xa = (-qb - root) / qa + x - 0.5 - x0, xb = (-qb + root) / qa + x - 0.5 - x0;
					ia = Math.max(0, Math.floor(xa) - 1); ib = Math.min(w, Math.ceil(xb) + 2);
					if (ib < ia) ib = ia;
				}
				if (ia > 0) mask.fill(0, row, row + ia);
				if (ib < w) mask.fill(0, row + ib, row + w);
				spans[j * 2] = ia; spans[j * 2 + 1] = ib;
				for (let xp = x0 + ia; xp < x0 + ib; xp++) {
					const xx = xp + 0.5 - x, yyr = (yy * cs - xx * sn) * aspect, xxr = yy * sn + xx * cs, rr = (yyr * yyr + xxr * xxr) * oneOverR2;
					let opa = rr <= hardness ? seg1Offset + rr * seg1Slope : seg2Offset + rr * seg2Slope;
					if (rr > 1) opa = 0;
					if (opa < 1 / 32768) opa = 0; else any = true;
					mask[row + (xp - x0)] = opa;
				}
			}
		}
		if (!any) return null;
		const box = this.maskBox;
		box.x0 = x0; box.y0 = y0; box.w = w; box.h = h; box.mask = mask; box.spans = spans;
		return box;
	}
	// A dry medium does not meet a smooth plane -- it catches the sheet's peaks and skips its
	// valleys, and that, not the brush, is where the lengthwise variation in a real pencil, oil or
	// charcoal mark comes from. Without the tooth, the dry presets paint onto glass: the ink density
	// along the middle of each varies by under 10% (oil .061, pen .026, marker .025) -- flat. The
	// field is in ABSOLUTE surface pixels and is built once, so it is coherent: the same dab twice,
	// or a second stroke crossing a first, meets the same grain, and a second pass fills the first
	// pass's gaps the way paint does.
	// Lazily, in tiles of the REAL surface, cut at their true coordinates. Generating the sheet for
	// the whole surface on the first dab would stall exactly at touch-down (`paint-stroke-cost`).
	// Wrapping one small tile modulo would be cheap and wrong -- the noise is not periodic, so the
	// seam would print a grid every tile. Tiles of the true field cost only what is painted, cache
	// across strokes, and meet each other exactly.
	_toothTile(x, y) { const T = RAPIER_TOOTH_TILE; return this._toothTileFor(x, y)[(y - ((y / T) | 0) * T) * T + (x - ((x / T) | 0) * T)]; }
	_toothTileFor(x, y) {
		const T = RAPIER_TOOTH_TILE, tx = (x / T) | 0, ty = (y / T) | 0;
		if (!this.toothTiles) { this.toothTilesW = Math.ceil(this.width / T); this.toothTiles = new Array(this.toothTilesW * Math.ceil(this.height / T)).fill(null); }
		const at = ty * this.toothTilesW + tx;
		let t = this.toothTiles[at];
		if (!t) {
			t = this.toothTiles[at] = new Uint8Array(T * T);
			const ox = tx * T, oy = ty * T;
			for (let j = 0, k = 0; j < T; j++) for (let i = 0; i < T; i++, k++)
				t[k] = clamp((toothAt(this.toothSeed, ox + i + this.toothOX, oy + j + this.toothOY, 1, RAPIER_TOOTH_GRAIN) - .5) * RAPIER_TOOTH_CONTRAST + .5, 0, 1) * 255;
		}
		return t;
	}
	// The sheet an oil hair runs dry on is canvas: a plain weave, in the same absolute paper coordinates and the same 64-pixel
	// tiles as the sheet's other grain, a thread's crown high and the gap between threads low, with a little of the sheet's own
	// irregularity so no thread is the one before it. A dry brush catches on the crowns and skips the gaps.
	_weaveTileFor(x, y) {
		const T = RAPIER_TOOTH_TILE, tx = (x / T) | 0, ty = (y / T) | 0;
		if (!this.weaveTiles) { this.weaveTiles = new Array(Math.ceil(this.width / T) * Math.ceil(this.height / T)).fill(null); this.weaveW = Math.ceil(this.width / T); }
		const at = ty * this.weaveW + tx;
		let t = this.weaveTiles[at];
		if (!t) {
			t = this.weaveTiles[at] = new Uint8Array(T * T);
			const ox = tx * T + this.toothOX, oy = ty * T + this.toothOY, grain = this._toothTileFor(x, y);
			for (let j = 0, k = 0; j < T; j++) for (let i = 0; i < T; i++, k++) t[k] = clamp((OIL_WEAVE[((oy + j) & 63) * 64 + ((ox + i) & 63)] * .3 + grain[k] / 255 * .7 - .3) * 2.4, 0, 1) * 255;
		}
		return t;
	}
	// The grain has ONE owner, and it is a CEILING, not a per-dab scale. Scaling each dab was tried
	// first and is inert: a body pixel is covered by roughly seventy dabs (fourteen hairs by five
	// along the path), so `1-(1-a)^n` returns it to solid black however much each dab is thinned --
	// measured, oil's lengthwise variation moved .061 -> .054, which is nothing. A ceiling survives
	// repetition: a valley of the sheet tops out lighter and stays lighter however long the hand
	// scrubs, which is what a dry medium on rough paper actually does.
	_ceil(p) { const i = p >> 2, x = i % this.width; return 1 - this.bite * (1 - this._toothTile(x, (i - x) / this.width) / 255); }

	// ---- The seven Tools: operators, not presets
	// ------------------------------------------------------
	// The rules they all obey are three. (1) COLOURLESS: the swatch is not an input, so the same
	// gesture with magenta and with green leaves byte-identical paint -- which is why none of these
	// reads `r,g,b`. (2) NOTHING FROM NOTHING: blank paper under the footprint comes out blank, byte
	// for byte. (3) SURVIVES REPETITION: a body pixel takes tens of overlapping dabs, so every
	// operator is a relaxation toward a target or a multiplication, never an addend -- an addend is
	// erased by the fourth dab (saturation).
	// The two that read the paper read `_toothTileFor`, the same sheet Oil bites into, in absolute
	// paper coordinates: a second pass eats exactly where the first one did, and nothing reseeds a
	// random field per dab (which is what reads as spray).
	// One settle and one compose for a whole belly's worth of hairs (see `_opWet`). Called by the
	// brush after its hairs have run, never by a hair: a hair does not know when the dab is over.
	opFlush() {
		const rect = this.opOwed, state = this.wetState;
		this.opOwed = null;
		if (!rect || !state) return false;
		// The dab settles now (the next dab's physics reads it); the picture is composed once per input
		// sample (`opCompose`, at the end of `strokeTo`). Nothing a wet operator reads is the composed
		// raster, and the compose is a function of the settled state alone, so the kept pixels are the
		// same bytes; composing every dab's rectangle was 93% of a Wet flat stroke (5.2 of 5.6 s).
		settle(state, {rect}); this.wetDirty = true;
		const o = this.opComposeOwed;
		this.opComposeOwed = o ? {x0: Math.min(o.x0, rect.x0), y0: Math.min(o.y0, rect.y0), x1: Math.max(o.x1, rect.x1), y1: Math.max(o.y1, rect.y1)} : rect;
		return true;
	}
	opCompose() {
		const rect = this.opComposeOwed;
		if (!rect) return false;
		delete this.opComposeOwed;
		if (this.wetState) this._wetCompose(rect);
		return true;
	}
	applyOp(op, x, y, radius, hardness, softness, aspect, angle, strength, dx, dy, seed, bucket) {
		strength = clamp(strength, 0, 1);
		hardness = clamp(hardness, 0, 1); softness = clamp(softness, 0, 1);
		if (!(radius > 0) || strength <= 0 || hardness === 0 || softness === 1) return false;
		if (aspect < 1) aspect = 1;
		// A live wash IS the material. Clear water joins it and the solver moves what is there --
		// `deposit()` lifts a dried deposit back into suspension exactly when the dab carries no
		// pigment, which is the back-run a painter makes on purpose. Every other operator works on
		// the flat raster, so the wash settles first, exactly as any dry dab already makes it
		// (`_drawAfterWet`); that is the existing law, never a shortcut taken for speed.
		// The wet operators make their own wash and so never settle one first; every other operator
		// works on the flat raster, so a live wash settles before it runs.
		if (this.wetState && op !== 'water' && op !== 'pull') this.settleWet();
		x *= this.scale; y *= this.scale; radius *= this.scale; dx *= this.scale; dy *= this.scale;
		if (radius < 0.1) return false;
		const box = this._renderMask(x, y, radius, hardness, softness, aspect, angle);
		if (!box) return false;
		let any = false;
		const wetSeed = seed ?? this.wetSeed ?? 0;
		if (op === 'smear') any = this._opDrag(box, strength, dx, dy, radius, seed | 0, bucket);
		else if (op === 'posterize') any = this._opPosterize(box, strength, bucket || new Map());
		else if (op === 'pull') any = this._opWet(box, strength, wetSeed, dx, dy, RAPIER_OP_FLAT_WET, RAPIER_OP_FLAT_LIFT);
		else if (op === 'water') any = this._opWet(box, strength, wetSeed, 0, 0, RAPIER_OP_WATER_WET, RAPIER_OP_WATER_LIFT);
		else if (op === 'erase') any = this._opErase(box, strength);
		else if (op === 'blend') any = this._opBlend(box, strength);
		else if (op === 'dissolve') any = this._opDissolve(box, strength);
		else if (op === 'erode') any = this._opErode(box, strength, radius);
		if (any) this._touch(box.x0, box.y0, box.x0 + box.w - 1, box.y0 + box.h - 1);
		// What the operators actually did, for a witness to read through `rapierPaintFacts.ops`: how
		// many dabs ran, how many changed anything, and the total travel they were given to carry
		// material along. A tool that "does nothing" is either not being dabbed, being dabbed with no
		// travel, or being dabbed with travel and refusing -- three different faults that look
		// identical in a screenshot, and this is what tells them apart. Four adds on a path that
		// already renders a mask and walks its footprint.
		const st = this.opStats || (this.opStats = {dabs: 0, moved: 0, travel: 0, radius: 0, strength: 0, weakest: 1});
		st.dabs++; st.travel += Math.abs(dx) + Math.abs(dy); st.radius += radius; st.strength += strength;
		if (strength < st.weakest) st.weakest = strength;
		if (any) st.moved++;
		return any;
	}
	// The material as it stood BEFORE this dab, over the footprint plus a margin: the operators that
	// move or compare material must not read pixels this same dab has already written, or a smear
	// smears its own output and an erosion eats what it just ate. One buffer, grown, never a
	// per-dab allocation.
	_opRead(box, pad) {
		const W = this.width, H = this.height;
		const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
		const x1 = Math.min(W - 1, box.x0 + box.w - 1 + pad), y1 = Math.min(H - 1, box.y0 + box.h - 1 + pad);
		const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h * 4;
		if (!this.opBuf || this.opBuf.length < n) this.opBuf = new Float32Array(n);
		const src = this.data, buf = this.opBuf, span = w * 4;
		for (let j = 0; j < h; j++) {
			const p = ((y0 + j) * W + x0) * 4, q = j * span;
			for (let i = 0; i < span; i++) buf[q + i] = src[p + i];
		}
		return {x0, y0, w, h, buf};
	}
	// The drag: a finger (Smudge) or a loaded knife (Smear) pushes the paint it touches along with it.
	// Each dab lays the paint that stood one dab's travel BEHIND it -- the footprint as it was, read
	// before this dab writes and sampled between pixels, so a slow pull moves the picture smoothly --
	// and what it carries fades with distance, not with dab count: after `carry` radii at a full press
	// a third of it is left. Coverage never falls, so no pull can open the sheet; where the finger
	// leaves the paint the trail it drags lies on the paper and fades. Bare paper carries nothing, so
	// paper pulled into paint changes nothing, and a still finger moves nothing. A comb
	// (`rapier_comb`) streaks the drag along its own path, one streak per hair's width. A single
	// colour memory for the footprint would average it into one colour (mud, not a smear) and walk
	// tens of thousands of mask pixels per pixel of travel at the largest size.
	_opDrag(box, strength, dx, dy, radius, seed, drag) {
		const d = Math.hypot(dx, dy);
		if (!(d > 1e-3)) return false;
		// A light touch is a short pull, not no pull: the reach follows the press to the power three quarters.
		const carry = (drag?.[0] || RAPIER_OP_DRAG_CARRY) * radius * Math.pow(strength, .75);
		const keep = Math.exp(-d / Math.max(1e-3, carry));
		if (!(keep > 1e-3)) return false;
		const {x0, y0, w, h, mask} = box, D = this.data, W = this.width, H = this.height, V = this.volume, T = RAPIER_TOOTH_TILE;
		// The paint one dab back is a fixed shift of the footprint, so its four bilinear weights are the
		// dab's, not the pixel's. The window is read with a one-pixel margin of paper past the sheet's
		// edge, so the walk below needs no bounds.
		const ix = Math.floor(dx), iy = Math.floor(dy), fx = dx - ix, fy = dy - iy;
		const w00 = fx * fy, w10 = (1 - fx) * fy, w01 = fx * (1 - fy), w11 = (1 - fx) * (1 - fy);
		const sx0 = x0 - ix - 1, sy0 = y0 - iy - 1, sw = w + 1, sh = h + 1, n = sw * sh;
		if (!this.opBuf || this.opBuf.length < n * 4) this.opBuf = new Float32Array(n * 4);
		const S = this.opBuf;
		// Paper past the sheet's edge reads as nothing; inside it the window is copied whole.
		if (sx0 < 0 || sy0 < 0 || sx0 + sw > W || sy0 + sh > H) S.fill(0, 0, n * 4);
		for (let j = 0; j < sh; j++) {
			const y = sy0 + j; if (y < 0 || y >= H) continue;
			const a = Math.max(0, -sx0), b = Math.min(sw, W - sx0); if (b <= a) continue;
			S.set(D.subarray((y * W + sx0 + a) * 4, (y * W + sx0 + b) * 4), (j * sw + a) * 4);
		}
		// A finger softens what it carries (`rapier_soft`, in radii): the paint one dab back is taken from a box-blurred copy of the
		// footprint, so a pull smears the picture along rather than moving a crisp copy of it, a hard clone. Premultiplied colour and
		// coverage are blurred together, so a carried colour stays a mix of the colours that were there, and paper blurred in only thins
		// what is carried.
		// A blurred field needs no full resolution: the window is averaged into cells a third of the blur wide (two pixels at the
		// least), the cells are blurred, and each pixel reads them between cells (four reads, as the crisp path makes).
		const soft = clamp(drag?.[2] || 0, 0, 1) * radius;
		let G = null, gw = 0, colA = null, colW = null, rowA = null, rowW = null;
		if (soft >= 1) {
			const f = Math.max(2, Math.floor(soft / 3)), gh = Math.ceil(sh / f);
			gw = Math.ceil(sw / f);
			if (!this.opGrid || this.opGrid.length < gw * gh * 4) this.opGrid = new Float32Array(gw * gh * 4);
			G = this.opGrid; G.fill(0, 0, gw * gh * 4);
			for (let j = 0, gr = 0, cj = 0; j < sh; j++) {
				for (let i = 0, q = j * sw * 4, g = gr, ci = 0; i < sw; i++, q += 4) {
					G[g] += S[q]; G[g + 1] += S[q + 1]; G[g + 2] += S[q + 2]; G[g + 3] += S[q + 3];
					if (++ci === f) { ci = 0; g += 4; }
				}
				if (++cj === f) { cj = 0; gr += gw * 4; }
			}
			for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) {
				const g = (gj * gw + gi) * 4, k = 1 / ((Math.min(sw, gi * f + f) - gi * f) * (Math.min(sh, gj * f + f) - gj * f));
				G[g] *= k; G[g + 1] *= k; G[g + 2] *= k; G[g + 3] *= k;
			}
			this._opBlurWindow(G, gw, gh, Math.max(1, Math.round(soft / f)));
			// Where each target column and row reads the cells: the crisp path's own sample point, (i + 1 - fx, j + 1 - fy) of the
			// window, in cell units about the cells' centres.
			const n = w + h;
			if (!this.opGridAt || this.opGridAt.length < n) { this.opGridAt = new Int32Array(n); this.opGridWt = new Float32Array(n); }
			const axis = (count, frac, cells, from) => {
				const at = this.opGridAt.subarray(from, from + count), wt = this.opGridWt.subarray(from, from + count);
				for (let i = 0; i < count; i++) {
					const u = clamp((i + 1 - frac - (f - 1) / 2) / f, 0, cells - 1), a = Math.min(Math.max(0, cells - 2), Math.floor(u));
					at[i] = a; wt[i] = cells > 1 ? u - a : 0;
				}
				return [at, wt];
			};
			[colA, colW] = axis(w, fx, gw, 0); [rowA, rowW] = axis(h, fy, gh, w);
		}
		const comb = clamp(drag?.[1] || 0, 0, 1), tx = dx / d, ty = dy / d, cx = x0 + w / 2, cy = y0 + h / 2;
		const streak = 1 / Math.max(.5, radius * RAPIER_OP_DRAG_STREAK), h1 = (seed * 2654435761) >>> 0;
		const hash = k => { let v = Math.imul((k | 0) ^ h1, 2246822519) >>> 0; v ^= v >>> 15; v = Math.imul(v, 3266489917) >>> 0; return ((v ^ (v >>> 13)) >>> 0) / 4294967296; };
		const flatten = RAPIER_OP_FLATTEN * (1 - comb), grip = 1 - RAPIER_OP_DRAG_TOOTH, bite = RAPIER_OP_DRAG_TOOTH / 255;
		let any = false;
		const C = G || S;
		for (let j = 0; j < h; j++) {
			const y = y0 + j, row = (y - ((y / T) | 0) * T) * T;
			let p = (y * W + x0) * 4, m = j * w, q = j * sw, tile = null, tt = -1;
			const gy = G ? rowA[j] * gw : 0, by = G ? rowW[j] : 0;
			for (let i = 0; i < w; i++, p += 4, m++, q++) {
				const o = mask[m]; if (!o) continue;
				// Source pixels (i, j), (i+1, j), (i, j+1), (i+1, j+1) of the window: fx and fy weigh the first. Softened, the four
				// cells around the same point, weighed by where it falls between them.
				let q0, q1, q2, q3, w0 = w00, w1 = w10, w2 = w01, w3 = w11;
				if (G) {
					const ax = colW[i]; q0 = (gy + colA[i]) * 4; q1 = q0 + 4; q2 = q0 + gw * 4; q3 = q2 + 4;
					w0 = (1 - ax) * (1 - by); w1 = ax * (1 - by); w2 = (1 - ax) * by; w3 = ax * by;
				} else { q0 = q * 4; q1 = q0 + 4; q2 = q0 + sw * 4; q3 = q2 + 4; }
				const a = w0 * C[q0 + 3] + w1 * C[q1 + 3] + w2 * C[q2 + 3] + w3 * C[q3 + 3];
				if (!(a > 1e-6)) continue;
				const x = x0 + i, at = (x / T) | 0;
				if (at !== tt) { tt = at; tile = this._toothTileFor(x, y); }
				let k = o * keep * (grip + bite * tile[row + (x - tt * T)]);
				if (comb) {
					const c = ((x - cx) * -ty + (y - cy) * tx) * streak, ci = Math.floor(c), cf = c - ci, e = cf * cf * (3 - 2 * cf);
					k *= 1 - comb * (hash(ci) * (1 - e) + hash(ci + 1) * e);
				}
				if (!(k > 0)) continue;
				// Coverage rises toward what arrives and never falls; colour mixes by the paint each side brings.
				const da = D[p + 3], na = a > da ? da + k * (a - da) : da, mass = (1 - k) * da + k * a;
				if (!(mass > 1e-9)) continue;
				const f = na / mass, l = (1 - k) * f, r = k * f;
				D[p] = l * D[p] + r * (w0 * C[q0] + w1 * C[q1] + w2 * C[q2] + w3 * C[q3]);
				D[p + 1] = l * D[p + 1] + r * (w0 * C[q0 + 1] + w1 * C[q1 + 1] + w2 * C[q2 + 1] + w3 * C[q3 + 1]);
				D[p + 2] = l * D[p + 2] + r * (w0 * C[q0 + 2] + w1 * C[q1 + 2] + w2 * C[q2 + 2] + w3 * C[q3 + 2]);
				D[p + 3] = na;
				// The relief stays where it stands and a finger presses it flatter; dragged with the paint,
				// every dab's shifted copy of it printed a rung of shadow across the pull.
				if (V) V[p >> 2] *= 1 - flatten * k; if (this.oil) this.oil[p >> 2] *= 1 - flatten * k;
				any = true;
			}
		}
		return any;
	}
	// A box blur of radius `r` over a window of `w` x `h` RGBA floats, rows then columns, each a running sum over what the window
	// holds (a sum at the window's edge is over the pixels there, not over zeros). In place; one scratch row or column.
	_opBlurWindow(S, w, h, r) {
		const n = Math.max(w, h) * 4;
		if (!this.opBlurRow || this.opBlurRow.length < n) this.opBlurRow = new Float32Array(n);
		const T = this.opBlurRow;
		// One line at a time: `line` lines of `len` pixels, a line starting `step` floats after the last, a pixel `stride` floats after
		// the last (rows: 4w and 4; columns: 4 and 4w).
		for (let pass = 0; pass < 2; pass++) {
			const lines = pass ? w : h, len = pass ? h : w, step = pass ? 4 : 4 * w, stride = pass ? 4 * w : 4;
			for (let line = 0, base = 0; line < lines; line++, base += step) {
				for (let i = 0, p = base, q = 0; i < len; i++, p += stride, q += 4) { T[q] = S[p]; T[q + 1] = S[p + 1]; T[q + 2] = S[p + 2]; T[q + 3] = S[p + 3]; }
				let s0 = 0, s1 = 0, s2 = 0, s3 = 0, hi = 0;
				for (const end = Math.min(len - 1, r); hi <= end; hi++) { const q = hi * 4; s0 += T[q]; s1 += T[q + 1]; s2 += T[q + 2]; s3 += T[q + 3]; }
				for (let i = 0, p = base; i < len; i++, p += stride) {
					const lo = i - r, k = 1 / (Math.min(len - 1, i + r) - Math.max(0, lo) + 1);
					S[p] = s0 * k; S[p + 1] = s1 * k; S[p + 2] = s2 * k; S[p + 3] = s3 * k;
					if (hi < len) { const q = hi * 4; s0 += T[q]; s1 += T[q + 1]; s2 += T[q + 2]; s3 += T[q + 3]; hi++; }
					if (lo >= 0) { const q = lo * 4; s0 -= T[q]; s1 -= T[q + 1]; s2 -= T[q + 2]; s3 -= T[q + 3]; }
				}
			}
		}
	}
	// Posterize is a palette reduction, not RGB rounding. Every bin keeps an actual colour
	// first encountered under this stroke; the palette never crawls as later dabs overlap.
	// Light has more bins and Firm fewer. No interpolation invents an intermediate colour,
	// no neighbour is sampled across an edge, and coverage stays exactly as it was.
	_opPosterize(box, strength, palette) {
		const {x0, y0, w, h, mask} = box, D = this.data, W = this.width;
		// A palette works on the visible raster, as reopening a painting already does. Bake live
		// relief once at this boundary, preserving every displayed byte and each exact alpha.
		// Clearing height per dab instead changes neighbouring normals, inventing new colours
		// before the next dab samples them. This needs no second persistent material plane.
		if (this.volume || this.oil) {
			// Bare paper is a no-op for material as well as appearance. Do not freeze somebody's
			// live relief until this contact actually reaches paint that will be posterized.
			let contact = false;
			for (let j = 0; j < h && !contact; j++) for (let i = 0; i < w; i++)
				if (mask[j * w + i] >= .15 && D[((y0 + j) * W + x0 + i) * 4 + 3] > 0) { contact = true; break; }
			if (!contact) return false;
			const visible = this.toRGBA8().data;
			for (let p = 0; p < D.length; p += 4) {
				const a = D[p + 3];
				D[p] = PAINT_LINEAR_BYTE[visible[p]] * a; D[p + 1] = PAINT_LINEAR_BYTE[visible[p + 1]] * a; D[p + 2] = PAINT_LINEAR_BYTE[visible[p + 2]] * a;
			}
			this.volume = null; this.oil = null;
		}
		const levels = Math.round(4 + 12 * (1 - strength)), plane = levels * levels;
		let any = false;
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
			if (mask[j * w + i] < .15) continue;
			const p = ((y0 + j) * W + x0 + i) * 4, a = D[p + 3]; if (!(a > 0)) continue;
			const r = paintByte(clamp(D[p] / a, 0, 1)), g = paintByte(clamp(D[p + 1] / a, 0, 1)), b = paintByte(clamp(D[p + 2] / a, 0, 1));
			// Canvas stores premultiplied bytes: the same straight RGB at another alpha can round
			// into a colour absent from the source PNG. Keep representatives at their source alpha
			// byte, so both the engine and the native canvas/PNG read retain a source colour.
			const key = (levels * 4096 + (r * levels >> 8) * plane + (g * levels >> 8) * levels + (b * levels >> 8)) * 256 + Math.round(clamp(a, 0, 1) * 255);
			let colour = palette.get(key);
			if (!colour) { colour = [PAINT_LINEAR_BYTE[r], PAINT_LINEAR_BYTE[g], PAINT_LINEAR_BYTE[b]]; palette.set(key, colour); }
			D[p] = colour[0] * a; D[p + 1] = colour[1] * a; D[p + 2] = colour[2] * a;
			any = true;
		}
		return any;
	}
	// WATER: the tool makes a wash where there is none, instead of blurring what is there.
	//
	// The wet solver alone runs only where a wash is already LIVE -- after a wet preset. Run into
	// ordinary paint, which is the thing a painter actually does, a four-neighbour Laplacian times a
	// uniform fade would only blur, and blur that eats the mark: alpha only ever falls and no pigment
	// goes anywhere.
	//
	// Water is wet by definition, so it opens the window itself and the paper gives its pigment back.
	// A pixel's pigment mass is Beer-Lambert's, `-ln(1 - alpha)`. A dab lifts the fraction `f` of
	// that mass, which leaves `1 - (1 - alpha)^(1 - f)` on the paper and carries `-f * ln(1 - alpha)`
	// into suspension at the pixel's own straight colour. Exactly conserved and hue-preserving on
	// both sides: what the paper loses is what the water holds, and it comes back down when the water
	// goes.
	//
	// Nothing here draws the effect, because draw/paper.mjs already has it. `step` dries a wash from
	// its rim inward -- the evaporation term counts a cell's dry faces -- and binds suspended pigment
	// fastest where the water has gone, so pigment lifted out of the middle of a wet patch walks
	// outward and stacks on the tideline. The edge darkening, the bloom and the back-run arrive
	// because the physics under them is right, not because something painted a ring.
	//
	// Two things are named rather than hidden. A cell is `wetCell` pixels across, so the lifted
	// colour is a mass-weighted mean over at most nine neighbours, converted to spectral once per
	// cell instead of nine times -- the same box average `_wetDownsample` already makes of the base
	// it sits on. And mass here is a DENSITY, as `deposit`'s own load is: a cell's share is the mean
	// over its pixels, not their sum, or a dab would lay nine times what it took.
	_opWet(box, strength, seed, dx, dy, water, liftRate) {
		const state = this.beginWet(seed, box), win = this.wetWindow, C = this.wetCell;
		// Where the hand went, in cells. A wet brush picks up under itself and lays down where it is
		// going, so the footprint's cells are not enough: the box grows by the travel, or the pigment
		// this dab carries forward would be clamped back onto the cell it came from and go nowhere.
		const sx = dx * RAPIER_OP_WET_CARRY / C, sy = dy * RAPIER_OP_WET_CARRY / C;
		const padX = Math.min(RAPIER_OP_PAD_MAX, Math.ceil(Math.abs(sx)) + 1), padY = Math.min(RAPIER_OP_PAD_MAX, Math.ceil(Math.abs(sy)) + 1);
		const cx0 = Math.max(0, Math.floor((box.x0 - win.x0) / C) - padX), cy0 = Math.max(0, Math.floor((box.y0 - win.y0) / C) - padY);
		const cx1 = Math.min(win.cw - 1, Math.floor((box.x0 + box.w - 1 - win.x0) / C) + padX);
		const cy1 = Math.min(win.ch - 1, Math.floor((box.y0 + box.h - 1 - win.y0) / C) + padY);
		const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1; if (cw < 1 || ch < 1) return false;
		const n = cw * ch, area = C * C, ww = win.w, RB = this.wetRasterBase, cover = this.wetCover;
		if (this.wetCoarse.length < n) this.wetCoarse = new Float32Array(n);
		if (!this.opLiftMass || this.opLiftMass.length < n) { this.opLiftMass = new Float32Array(n); this.opLiftFrac = new Float32Array(n); this.opLiftColour = new Float32Array(n * 3); }
		const coarse = this.wetCoarse, mass = this.opLiftMass, lift = this.opLiftFrac, colour = this.opLiftColour;
		coarse.fill(0, 0, n); mass.fill(0, 0, n); lift.fill(0, 0, n); colour.fill(0, 0, n * 3);
		// `settle` raises what it finds in suspension BY the film gain, so something here has to carry
		// its inverse. That belongs on the MASS, not on the colour. Putting it on the colour -- a
		// pigment of `ground^(1/gain)` at unit mass -- is algebraically the same and measured 36% of
		// the optical density gone: at gain 0.55 a saturated red's ground of (0.913, 0.013, 0.009)
		// de-gains to (0.849, 0.0003, 0.0002), which is nowhere near the ten-band basis and does not
		// survive the round trip. The pigment is the paint's OWN colour, which is in gamut by
		// construction, and the mass carries the gain.
		const film = !!state.film, gain = film ? state.filmGain : 1;
		// One walk of the dab's own footprint carries all three: the water it lays (box-filtered onto
		// cells, as every wet dab's is), the fine coverage plane the compose shapes its edge by, and
		// the pigment it takes off the paper. The raster base is what the compose adds the wash's
		// delta to, so taking the pigment off THERE is what makes the paper lighter; `this.data` is
		// rewritten from it below and is never touched by hand.
		const rate = strength * liftRate, T = RAPIER_TOOTH_TILE;
		for (let y = 0; y < box.h; y++) {
			const wy = box.y0 + y - win.y0, cy = Math.floor(wy / C) - cy0;
			if (cy < 0 || cy >= ch) continue;
			const row = wy * ww + box.x0 - win.x0;
			// The sheet, in absolute paper coordinates, one tile at a time along the row.
			const py = box.y0 + y, trow = (py - ((py / T) | 0) * T) * T;
			let tile = null, tx = -1;
			for (let x = 0; x < box.w; x++) {
				const m = box.mask[y * box.w + x]; if (!m) continue;
				const wx = box.x0 + x - win.x0, cx = Math.floor(wx / C) - cx0;
				if (cx < 0 || cx >= cw) continue;
				const px = box.x0 + x, at = (px / T) | 0;
				if (at !== tx) { tx = at; tile = this._toothTileFor(px, py); }
				const tooth = tile[trow + (px - tx * T)] / 255;
				const c = cy * cw + cx;
				coarse[c] += m / area;
				if (m > cover[row + x]) cover[row + x] = m;
				const q = (wy * ww + wx) * 4, a = RB[q + 3];
				if (!(a > 1e-6)) continue;
				// Water finds the low places. On a peak it barely lifts, in a valley it takes nearly all it is
				// allowed, and the mark's edge wanders with the paper instead of ruling a line.
				const f = m * rate * (1 - RAPIER_OP_WET_TOOTH * tooth); if (!(f > 0)) continue;
				// A lift has to be exact in the pigment model the surface is actually running, and this
				// engine has two of them. Under the film law a cell is a transparent film over a
				// ground, so density is what adds: what stays is `ground^(1 - f)` and what the water
				// carries is a film of `ground^f`, which multiply back to `ground`. Without it a cell
				// is alpha-composited and the mass IS `-ln(1 - alpha)`, so what stays is
				// `1 - (1 - alpha)^(1 - f)` and the wash takes `-f * ln(1 - alpha)`; those compose back
				// to alpha exactly, which is the same statement in the other arithmetic.
				// Getting this wrong is not subtle and does not announce itself as an error: running
				// the film's power law against the alpha model measured 36% of a red band's optical
				// density simply gone, with every witness that reads alpha still green.
				const was = 1 - a, k = 1 - f, frac = f / area;
				let na, got, p0, p1, p2;
				if (film) {
					const g0 = Math.max(RAPIER_OP_GROUND_FLOOR, RB[q] + was), g1 = Math.max(RAPIER_OP_GROUND_FLOOR, RB[q + 1] + was), g2 = Math.max(RAPIER_OP_GROUND_FLOOR, RB[q + 2] + was);
					const n0 = Math.pow(g0, k), n1 = Math.pow(g1, k), n2 = Math.pow(g2, k);
					na = 1 - Math.min(n0, n1, n2);
					const clear = 1 - na;
					RB[q] = Math.max(0, n0 - clear); RB[q + 1] = Math.max(0, n1 - clear); RB[q + 2] = Math.max(0, n2 - clear); RB[q + 3] = na;
					// `settle` raises what it finds in suspension BY the film gain, so the mass carries
					// its inverse and the pigment stays the paint's OWN colour. The other way round --
					// unit mass of `ground^(1/gain)` -- is algebraically identical and useless: at gain
					// 0.55 a saturated red de-gains to (0.849, 0.0003, 0.0002), nowhere near the
					// ten-band basis, and the density dies in the round trip.
					got = frac / gain; p0 = g0; p1 = g1; p2 = g2;
				} else {
					// Bounded off 1 so a fully opaque pixel has a finite mass to give: at alpha 1
					// exactly `-ln(0)` is infinite and one dab would claim everything the solver holds.
					const held = a < .999 ? a : .999;
					na = 1 - Math.pow(1 - held, k);
					const kk = na / a;
					p0 = clamp(RB[q] / a, 0, 1); p1 = clamp(RB[q + 1] / a, 0, 1); p2 = clamp(RB[q + 2] / a, 0, 1);
					RB[q] *= kk; RB[q + 1] *= kk; RB[q + 2] *= kk; RB[q + 3] *= kk;
					got = -f * Math.log(1 - held) / area;
				}
				// The paper gives it up HERE -- `lift` is the fraction this cell's own ground loses --
				// and the water carries it THERE. With no travel the two are the same cell: `du` lands
				// exactly on `cx`, the bilinear weights collapse to one, and nothing is spread that the
				// hand did not spread. That is what keeps Water a solvent and makes Wet flat a brush.
				lift[c] += frac;
				let du = cx + sx, dv = cy + sy;
				if (!(du > 0)) du = 0; else if (du > cw - 1) du = cw - 1;
				if (!(dv > 0)) dv = 0; else if (dv > ch - 1) dv = ch - 1;
				const iu = du | 0, iv = dv | 0, fu = du - iu, fv = dv - iv;
				const iu1 = iu + 1 < cw ? iu + 1 : iu, iv1 = iv + 1 < ch ? iv + 1 : iv;
				// Unrolled, and deliberately so. The readable form builds a weights array and a cells
				// array per PIXEL, which is two allocations inside the hottest loop this engine has:
				// measured, Wet flat cost 1,168 ms for one 200-unit stroke against a 110 ms ceiling,
				// two and a half times the wet preset the product already ships. Nothing else about
				// the operator was wrong.
				const ra = iv * cw, rb = iv1 * cw, eu = 1 - fu, ev = 1 - fv;
				const w0 = eu * ev, w1 = fu * ev, w2 = eu * fv, w3 = fu * fv;
				if (w0 > 0) { const to = ra + iu, part = got * w0; mass[to] += part; colour[to * 3] += part * p0; colour[to * 3 + 1] += part * p1; colour[to * 3 + 2] += part * p2; }
				if (w1 > 0) { const to = ra + iu1, part = got * w1; mass[to] += part; colour[to * 3] += part * p0; colour[to * 3 + 1] += part * p1; colour[to * 3 + 2] += part * p2; }
				if (w2 > 0) { const to = rb + iu, part = got * w2; mass[to] += part; colour[to * 3] += part * p0; colour[to * 3 + 1] += part * p1; colour[to * 3 + 2] += part * p2; }
				if (w3 > 0) { const to = rb + iu1, part = got * w3; mass[to] += part; colour[to * 3] += part * p0; colour[to * 3 + 1] += part * p1; colour[to * 3 + 2] += part * p2; }
			}
		}
		// The water goes in through the wet path's own owner, so the drying clock, the back-run over
		// an older wash and the touch bookkeeping all stay where they already live.
		this._touchWet({x0: cx0, y0: cy0, x1: cx1, y1: cy1});
		let any = deposit(state, {x0: cx0, y0: cy0, w: cw, h: ch, mask: coarse,
			water: water * strength, pigment: 0, opaque: 1, r: 1, g: 1, b: 1});
		// Per cell, the mass-weighted mean colour of what was lifted. `lift` is already the mean
		// fraction over the cell's own `area` pixels, which is what the cell's ground gives up.
		for (let c = 0; c < n; c++) {
			const got = mass[c]; if (!(got > 0)) continue;
			colour[c * 3] /= got; colour[c * 3 + 1] /= got; colour[c * 3 + 2] /= got;
		}
		if (suspend(state, {x0: cx0, y0: cy0, w: cw, h: ch, lift, mass, colour})) any = true;
		// The mark shows under the finger, as every wet dab's does: this dab's cells settle and
		// compose at once, while the physics -- flow, bloom, drying -- still waits for `advanceWet`.
		// The mark shows under the finger, as every wet dab's does: this dab's cells settle and compose
		// at once, while the physics -- flow, bloom, drying -- still waits for `advanceWet`.
		// A BELLY defers it. Twenty hairs each settling and composing the cells the other nineteen have
		// already touched is the same picture computed twenty times: measured, Wet flat took 9,742 ms
		// for one 200-unit stroke, which is ten seconds of a phone's life for one drag. The hairs pool
		// their rectangle and the dab settles once over the union, so what is drawn is identical and
		// the work is done once (`opFlush`).
		if (any) {
			if (this.opDefer) {
				const owed = this.opOwed;
				this.opOwed = owed ? {x0: Math.min(owed.x0, cx0), y0: Math.min(owed.y0, cy0), x1: Math.max(owed.x1, cx1), y1: Math.max(owed.y1, cy1)}
					: {x0: cx0, y0: cy0, x1: cx1, y1: cy1};
			} else { const rect = {x0: cx0, y0: cy0, x1: cx1, y1: cy1}; settle(state, {rect}); this._wetCompose(rect); this.wetDirty = true; }
		}
		return any;
	}
	// ERASER: take the paint off and leave the paper, and nothing else.
	// All four premultiplied channels and the paint's own body scale by one factor, so every survivor
	// keeps its exact straight colour and an erased impasto stroke leaves no lit ridge behind. The
	// old preset round-tripped surviving colour through the spectral basis at zero target alpha
	// (a measured 6.6e-5 drift) and never cleared volume at all.
	_opErase(box, strength) {
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, V = this.volume;
		let any = false;
		for (let j = 0; j < h; j++) {
			let p = ((y0 + j) * W + x0) * 4, m = j * w;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const o = mask[m]; if (!o) continue;
				const k = 1 - clamp(o * strength * RAPIER_OP_ERASE_RATE, 0, 1);
				if (!(k < 1)) continue;
				D[p] *= k; D[p + 1] *= k; D[p + 2] *= k; D[p + 3] *= k;
				if (V) V[p >> 2] *= k;
				if (this.oil) this.oil[p >> 2] *= k;
				any = true;
			}
		}
		return any;
	}
	// BLEND: a blender works on what it touches, not on the average of where it has been.
	//
	// The intent is "mix what is already there, in pigment, without moving it". Pulling every pixel
	// toward ONE coverage-weighted mean of the whole footprint would drag a pixel at the brush's left
	// edge toward the colour of paint a brush-width away that it had never touched. That is not a
	// blend but a tint toward a local average, and it prints the brush's own outline into the
	// painting (on a hard boundary, one pass leaves a step of 0.085 in the red channel -- twenty-two
	// levels of 255 -- twenty-five pixels out from the edge it was softening, exactly where the
	// footprint ended). No rate tuning removes it, because the discontinuity IS the model.
	//
	// So the mixing is local and pairwise. Each adjacent pair inside the footprint gives the other
	// the same FRACTION of what it holds, which is `mingle`'s own rule in draw/paper.mjs and is exact
	// by construction: `na + nb` is `ma + mb` however the coverage is shaped, so the mass rule holds
	// by arithmetic rather than by tolerance, and it holds at the rim as well as the middle. There is
	// no rim: a pixel at the footprint's edge exchanges only with its own neighbours, at a rate that
	// fades out with the mask, so the blend dies away into the untouched paint instead of stopping at
	// a wall.
	//
	// The colour is still Rapier's rather than a blur's. What is exchanged is pigment, mixed as a
	// mass-weighted mean of LOG REFLECTANCE in the ten-band spectral basis, so blue into yellow gives
	// green where an RGB average gives grey. Over many dabs a local exchange IS a diffusion, which is
	// what a sable blender is: colour walks across a boundary a little at a time and the boundary
	// becomes a gradient. What it can no longer do is reach a colour that is not next to it.
	_opBlend(box, strength) {
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, V = this.volume;
		const n = w * h;
		if (!this.opSpec || this.opSpec.length < n * 10) this.opSpec = new Float64Array(n * 10);
		if (!this.opAlpha || this.opAlpha.length < n) this.opAlpha = new Float64Array(n);
		const logs = this.opSpec, A = this.opAlpha;
		// Read the footprint once, in the basis the mixing happens in. Bare paper carries a zero
		// spectrum and no mass, which is exactly right: it weighs nothing in a mean, and it takes the
		// other side's colour whole when pigment first arrives. `-1` marks a pixel the mask does not
		// cover, so the pair loops can skip it without consulting the mask twice.
		let touched = 0;
		for (let j = 0; j < h; j++) {
			let p = ((y0 + j) * W + x0) * 4, m = j * w;
			for (let i = 0; i < w; i++, p += 4, m++) {
				if (!mask[m]) { A[m] = -1; continue; }
				const a = D[p + 3];
				A[m] = a; touched++;
				if (a > 0) {
					rgbToSpectral(D[p] / a, D[p + 1] / a, D[p + 2] / a, specA);
					for (let k = 0; k < 10; k++) { const s = specA[k]; logs[m * 10 + k] = Math.log(s > 1e-12 ? s : 1e-12); }
				} else for (let k = 0; k < 10; k++) logs[m * 10 + k] = 0;
			}
		}
		if (touched < 2) return false;
		const rate = strength * RAPIER_OP_BLEND_RATE;
		// One symmetric exchange across every horizontal pair, then every vertical one. The rate is
		// the LESSER of the two coverages, so a pair straddling the footprint's edge trades at the
		// outer pixel's rate and the effect tapers to nothing exactly as the mask does.
		const trade = (a, b, f) => {
			const ma = A[a], mb = A[b], ga = f * ma, gb = f * mb, na = ma - ga + gb, nb = mb - gb + ga;
			const ka = ma - ga, kb = mb - gb;
			for (let k = 0; k < 10; k++) {
				const la = logs[a * 10 + k], lb = logs[b * 10 + k];
				if (na > 0) logs[a * 10 + k] = (la * ka + lb * gb) / na;
				if (nb > 0) logs[b * 10 + k] = (lb * kb + la * ga) / nb;
			}
			A[a] = na; A[b] = nb;
		};
		// The exchange runs at DOUBLING STRIDES -- 1, 2, 4, 8 pixels -- and that is the difference
		// between a blender and a blur.
		//
		// A single-pixel exchange is molecular diffusion: colour walks one pixel per pass, so it
		// spreads as the square root of the dabs and reaches about six pixels over a whole stroke.
		// Measured, that left a boundary three columns wide when the old footprint-mean left
		// thirty-four. But a blender is not diffusion. Its bristles CARRY colour across their own
		// length, mechanically, and that length is a fraction of the brush rather than one pixel.
		// The strides are that length: at stride 8 a pair eight pixels apart trades directly, so one
		// dab reaches fifteen pixels, and the stack of them is a pyramid rather than a single band,
		// which is what keeps the result smooth instead of ringing at one spacing.
		//
		// Every pair is still a pair, so all of it is still exact: mass is conserved by the same
		// arithmetic at stride 8 as at stride 1. And a long-stride pair whose far end falls outside
		// the footprint is simply skipped, so reach never becomes the reach-across that printed the
		// brush's outline. The rate divides across the strides, so the total a dab mixes does not
		// grow with how far it is allowed to look.
		const reach = Math.min(w, h) >> 1;
		let strides = 0;
		for (let s = 1; s <= reach; s <<= 1) strides++;
		if (strides < 1) strides = 1;
		const each = rate / strides;
		for (let s = 1; s <= reach || s === 1; s <<= 1) {
			for (let j = 0; j < h; j++) {
				const r = j * w;
				for (let i = 0; i + s < w; i++) {
					const a = r + i, b = a + s;
					if (A[a] < 0 || A[b] < 0) continue;
					const ea = mask[a], eb = mask[b], f = (ea < eb ? ea : eb) * each;
					if (f > 0) trade(a, b, f);
				}
			}
			for (let j = 0; j + s < h; j++) {
				const r = j * w;
				for (let i = 0; i < w; i++) {
					const a = r + i, b = a + s * w;
					if (A[a] < 0 || A[b] < 0) continue;
					const ea = mask[a], eb = mask[b], f = (ea < eb ? ea : eb) * each;
					if (f > 0) trade(a, b, f);
				}
			}
			if (s > reach) break;
		}
		for (let j = 0; j < h; j++) {
			let p = ((y0 + j) * W + x0) * 4, m = j * w;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const na = A[m]; if (na < 0) continue;
				if (na > 0) {
					for (let k = 0; k < 10; k++) specMix[k] = Math.exp(logs[m * 10 + k]);
					spectralToRgb(specMix, rgbTmp);
					D[p] = rgbTmp[0] * na; D[p + 1] = rgbTmp[1] * na; D[p + 2] = rgbTmp[2] * na;
				} else { D[p] = 0; D[p + 1] = 0; D[p + 2] = 0; }
				D[p + 3] = na;
				if (V) V[p >> 2] *= 1 - RAPIER_OP_FLATTEN * 0.5 * mask[m] * strength; if (this.oil) this.oil[p >> 2] *= 1 - RAPIER_OP_FLATTEN * 0.5 * mask[m] * strength;
			}
		}
		return true;
	}
	// DISSOLVE: solvent. The film does not fade evenly, it breaks up, and what it breaks into is the
	// paper. The gate is `_toothTileFor` -- the painting's own sheet, in absolute paper coordinates --
	// so the pattern does not crawl as the finger moves and a second pass eats exactly where the
	// first one did. The thin film in the sheet's valleys goes first and paint standing on its peaks
	// holds on, which turns a mark into lace and then into islands. Alpha only ever falls.
	_opDissolve(box, strength) {
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, V = this.volume, T = RAPIER_TOOTH_TILE;
		let any = false;
		for (let j = 0; j < h; j++) {
			const y = y0 + j, row = (y - ((y / T) | 0) * T) * T;
			let p = (y * W + x0) * 4, m = j * w, tile = null, tx = -1;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const o = mask[m]; if (!o || !(D[p + 3] > 0)) continue;
				const x = x0 + i, at = (x / T) | 0;
				if (at !== tx) { tx = at; tile = this._toothTileFor(x, y); }
				const t = tile[row + (x - tx * T)] / 255;
				// What this dab takes, as an ABSOLUTE amount of coverage rather than a fraction of what
				// is left. The tooth's hold is strong on purpose -- paint down in the grain survives a
				// long scrub -- but as a fraction it compounded: the rate ran 12.5:1 across the sheet,
				// so over a stroke's thirty overlapping dabs one pixel was scaled by .70^30 and its
				// neighbour by .97^30 and the mark came out punched full of holes instead of thinned
				// with the grain showing. Taken as an amount, the peaks still go first and the valleys
				// still hold, but the gap grows by addition and the paint thins the way it should.
				const want = o * strength * RAPIER_OP_DISSOLVE_RATE * (1 - RAPIER_OP_DISSOLVE_HOLD * t);
				const a = D[p + 3], k = want <= 0 ? 1 : want >= a ? 0 : 1 - want / a;
				if (!(k < 1)) continue;
				D[p] *= k; D[p + 1] *= k; D[p + 2] *= k; D[p + 3] *= k;
				if (V) V[p >> 2] *= k; if (this.oil) this.oil[p >> 2] *= k;
				any = true;
			}
		}
		return any;
	}
	// ERODE: wear, from the edges in.
	// Grey-scale morphological erosion: a pixel's coverage is pulled toward the MINIMUM coverage in
	// its own neighbourhood, the minimum taken over itself and its four neighbours -- so it can never
	// rise, and a pixel whose neighbours are as full as it is does not move however long the hand
	// scrubs. Drag this across the middle of a solid patch and nothing happens; drag it along an edge
	// and the edge frays. That is exactly the distinction a painter means between eroding and
	// erasing. The sheet decides how deep the bite is, so the eaten edge is ragged rather than a
	// clean offset contour, and the surviving colour is exact -- erosion removes material, it never
	// recolours.
	// The neighbourhood is a square whose reach follows the brush (`RAPIER_OP_ERODE_REACH` of its radius, a pixel at least): a
	// one-pixel neighbourhood wore an edge back one surface pixel a dab whatever the size, a couple of screen points over a whole
	// finger stroke at a phone's density -- nothing a person could see, and the largest size no deeper than the smallest.
	_opErode(box, strength, radius = 1) {
		const R = clamp(Math.round(radius * RAPIER_OP_ERODE_REACH), 1, RAPIER_OP_ERODE_REACH_MAX);
		const rd = this._opRead(box, R);
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, V = this.volume, T = RAPIER_TOOTH_TILE;
		const mn = this._opMinCover(rd, R);
		let any = false;
		for (let j = 0; j < h; j++) {
			const y = y0 + j, row = (y - ((y / T) | 0) * T) * T;
			let p = (y * W + x0) * 4, m = j * w, tile = null, tx = -1;
			const at0 = (y - rd.y0) * rd.w + x0 - rd.x0;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const o = mask[m]; if (!o) continue;
				const a = D[p + 3]; if (!(a > 0)) continue;
				const low = mn[at0 + i];
				if (!(low < a)) continue;
				const x = x0 + i, at = (x / T) | 0;
				if (at !== tx) { tx = at; tile = this._toothTileFor(x, y); }
				const t = tile[row + (x - tx * T)] / 255;
				const f = clamp(o * strength * RAPIER_OP_ERODE_RATE * (1 - RAPIER_OP_ERODE_TOOTH * t), 0, 1);
				const na = a + f * (low - a), k = na / a;
				D[p] *= k; D[p + 1] *= k; D[p + 2] *= k; D[p + 3] = na;
				if (V) V[p >> 2] *= k; if (this.oil) this.oil[p >> 2] *= k;
				any = true;
			}
		}
		return any;
	}
	// The least coverage within `R` pixels (a square) of every pixel of a window read by `_opRead`: rows then columns, each a running
	// minimum (the van Herk / Gil-Werman blocks), so the cost does not grow with the reach. The window's edge reads only what it holds.
	_opMinCover(rd, R) {
		const {w, h, buf} = rd, n = w * h, L = Math.max(w, h);
		if (!this.opMin || this.opMin.length < n) { this.opMin = new Float32Array(n); this.opMinTmp = new Float32Array(n); }
		if (!this.opMinG || this.opMinG.length < L) { this.opMinG = new Float32Array(L); this.opMinH = new Float32Array(L); this.opMinLine = new Float32Array(L); }
		const out = this.opMin, tmp = this.opMinTmp, g = this.opMinG, hh = this.opMinH, line = this.opMinLine, K = 2 * R + 1;
		// A window the edge cut short spans part of a block, where the blocks' answer would reach past it: read it plainly.
		const least = (lo, hi) => { let v = line[lo]; for (let k = lo + 1; k <= hi; k++) if (line[k] < v) v = line[k]; return v; };
		const run = len => {
			for (let i = 0; i < len; i++) g[i] = i % K === 0 ? line[i] : Math.min(g[i - 1], line[i]);
			for (let i = len - 1; i >= 0; i--) hh[i] = i === len - 1 || (i + 1) % K === 0 ? line[i] : Math.min(hh[i + 1], line[i]);
		};
		for (let j = 0; j < h; j++) {
			for (let i = 0; i < w; i++) line[i] = buf[(j * w + i) * 4 + 3];
			run(w);
			for (let i = 0; i < w; i++) { const lo = Math.max(0, i - R), hi = Math.min(w - 1, i + R); tmp[j * w + i] = hi - lo + 1 === K ? Math.min(hh[lo], g[hi]) : least(lo, hi); }
		}
		for (let i = 0; i < w; i++) {
			for (let j = 0; j < h; j++) line[j] = tmp[j * w + i];
			run(h);
			for (let j = 0; j < h; j++) { const lo = Math.max(0, j - R), hi = Math.min(h - 1, j + R); out[j * w + i] = hi - lo + 1 === K ? Math.min(hh[lo], g[hi]) : least(lo, hi); }
		}
		return out;
	}
	drawDab(x, y, radius, r, g, b, opaque, hardness, softness, alpha, aspect, angle, lockAlpha, colorize, posterize, posterizeNum, paint) {
		// The layer is a `scale`-times denser rendering of the canvas the brush works in.
		x *= this.scale; y *= this.scale; radius *= this.scale;
		opaque = clamp(opaque, 0, 1); hardness = clamp(hardness, 0, 1); softness = clamp(softness, 0, 1);
		lockAlpha = clamp(lockAlpha, 0, 1); colorize = clamp(colorize, 0, 1); posterize = clamp(posterize, 0, 1);
		posterizeNum = clamp(Math.round(posterizeNum * 100), 1, 128); paint = clamp(paint, 0, 1);
		if (radius < 0.1 || hardness === 0 || softness === 1 || opaque === 0) return false;
		r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1); alpha = clamp(alpha, 0, 1);
		const normal = (1 - lockAlpha) * (1 - colorize) * (1 - posterize);
		if (aspect < 1) aspect = 1;
		const box = this._renderMask(x, y, radius, hardness, softness, aspect, angle);
		if (!box) return false;
		if (this.hold) {
			if (!this.hold.stepped) { this._holdStep(box, opaque * alpha); this.hold.stepped = true; }
			const rgb = this._holdColor(opaque * alpha);
			if (rgb) this._blendNormalPaint(box, rgb[0], rgb[1], rgb[2], rgb[3]);
			this._touch(box.x0, box.y0, box.x0 + box.w - 1, box.y0 + box.h - 1);
			return true;
		}
		if (paint < 1) {
			if (normal) {
				if (alpha === 1) this._blendNormal(box, r, g, b, normal * opaque * (1 - paint));
				else this._blendNormalEraser(box, r, g, b, alpha, normal * opaque * (1 - paint));
			}
			if (lockAlpha && alpha !== 0) this._blendLockAlpha(box, r, g, b, lockAlpha * opaque * (1 - colorize) * (1 - posterize) * (1 - paint));
		}
		if (paint > 0) {
			if (normal) {
				if (alpha === 1) this._blendNormalPaint(box, r, g, b, normal * opaque * paint);
				else this._blendNormalEraserPaint(box, r, g, b, alpha, normal * opaque * paint);
			}
			if (lockAlpha && alpha !== 0) this._blendLockAlphaPaint(box, r, g, b, lockAlpha * opaque * (1 - colorize) * (1 - posterize) * paint);
		}
		if (colorize) this._blendColor(box, r, g, b, colorize * opaque);
		if (posterize) this._blendPosterize(box, posterize * opaque, posterizeNum);
		this._touch(box.x0, box.y0, box.x0 + box.w - 1, box.y0 + box.h - 1);
		return true;
	}
	_holdStep(box, opacity) {
		const H = this.hold, store = H.store, n = store.n, vel = H.velocity;
		if (vel <= .2 && vel !== 1) return;
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, logsP = specB;
		// Travel-scaled contact: a 8 px move is one full transfer. Denser raster dabs (Oil's
		// bristle rate) must not empty the store faster than a single-dab brush would.
		const travel = vel === 1 ? 1 : Math.min(1, vel / HOLD_TRAVEL);
		const stride = Math.max(1, Math.floor(Math.min(w, h) / (n * 2)));
		for (let by = 0; by < n; by++) {
			const yA = Math.floor(by * h / n), yB = Math.floor((by + 1) * h / n); if (yB <= yA) continue;
			for (let bx = 0; bx < n; bx++) {
				const xA = Math.floor(bx * w / n), xB = Math.floor((bx + 1) * w / n); if (xB <= xA) continue;
				const cell = by * n + bx;
				let c = 0, mC = 0; for (let k = 0; k < 10; k++) specA[k] = 0;
				// The store is 16x16: walking every raster pixel of a wide dab to fill one cell is
				// resolution nothing reads back. Everything below is a ratio (mC/c, specA/mC), so a
				// stride changes cost and not the answer.
				for (let j = yA; j < yB; j += stride) for (let i = xA; i < xB; i += stride) {
					const o = mask[j * w + i] * opacity; if (!(o > 0)) continue;
					const p = ((y0 + j) * W + x0 + i) * 4, a = D[p + 3];
					c += o; mC += a * o;
					if (a > 1e-8) {
						rgbToSpectral(clamp(D[p] / a, 0, 1), clamp(D[p + 1] / a, 0, 1), clamp(D[p + 2] / a, 0, 1), logsP);
						for (let k = 0; k < 10; k++) specA[k] += Math.log(Math.max(logsP[k], 1e-12)) * a * o;
					}
				}
				if (!(c > 0)) continue;
				const a_b = store.amount[cell];
				// Dry canvas is coverage, not an IMPaSTo height field, so equal-paint against
				// overlapping dabs of this stroke would stall the spend. Deposit is always vs
				// empty paper; the velocity cutoff still refuses a held brush. Travel is applied
				// after the per-cell clamp: otherwise MAX_XFER_QUANTITY eats the scale and a
				// bristled brush empties as fast as a single dab.
				const lay = holdAmount(a_b, 0, vel, 1) * travel;
				if (lay > 0 && a_b > 0) {
					let take = lay; if (take > a_b) take = a_b;
					store.amount[cell] -= take;
					for (let k = 0; k < 10; k++) store.logs[cell * 10 + k] *= store.amount[cell] > 1e-15 ? (a_b - take) / a_b : 0;
					if (!(store.amount[cell] > 1e-15)) { store.amount[cell] = 0; for (let k = 0; k < 10; k++) store.logs[cell * 10 + k] = 0; }
				}
				// Pickup only when the canvas colour actually differs. Mixing whenever alpha > 0
				// washes a picked colour back out on the stroke's own freshly laid paint.
				if (mC > 0 && store.amount[cell] > 0) {
					const invM = 1 / mC, invB = 1 / store.amount[cell];
					let diverge = 0;
					for (let k = 0; k < 10; k++) diverge += Math.abs(store.logs[cell * 10 + k] * invB - specA[k] * invM);
					if (diverge > .4) {
						// Pickup is bounded per unit of TRAVEL, exactly as the lay side is -- not per dab. A per-dab
						// floor would let a bristled brush, which fires about eight dabs per radius, move a third of
						// the way to the canvas colour on every one of them: ten dabs across a red bar and a blue
						// brush would come out the far side pure red, with no blue left and nothing blended. A brush
						// crossing a dry mark lifts a little and mixes; it does not swap.
						const t = Math.min(RAPIER_HOLD_PICKUP, (mC / c) * 1.1) * (vel === 1 ? 1 : travel);
						for (let k = 0; k < 10; k++) store.logs[cell * 10 + k] = store.logs[cell * 10 + k] * (1 - t) + specA[k] * invM * store.amount[cell] * t;
					}
				}
			}
		}
	}
	_holdColor(opacity) {
		const H = this.hold, store = H.store, n = store.n, col0 = H.col0 ?? 0, col1 = H.col1 ?? n, vel = H.velocity;
		if (vel <= .2 && vel !== 1) return null;
		let massB = 0, startB = 0;
		for (let k = 0; k < 10; k++) specMix[k] = 0;
		const start = store.start;
		for (let by = 0; by < n; by++) for (let bx = col0; bx < col1; bx++) {
			const cell = by * n + bx, m = store.amount[cell];
			if (!(m > 0)) continue;
			// Corners of the square never sit in the circular mask, so they keep their
			// starting load and would pin the colour to the dip forever. Colour reads
			// only cells that have actually transferred.
			if (start && !(start[cell] - m > 1e-8)) continue;
			if (start) startB += start[cell];
			massB += m; for (let k = 0; k < 10; k++) specMix[k] += store.logs[cell * 10 + k];
		}
		if (!(massB > 1e-8)) return null;
		const remain = startB > 0 ? Math.min(1, massB / startB) : (H.initial > 0 ? Math.min(1, massB / H.initial) : 0);
		if (!(remain > .02)) return null;
		for (let k = 0; k < 10; k++) specA[k] = Math.exp(specMix[k] / massB);
		spectralToRgb(specA, rgbTmp);
		const out = this.holdColor;
		out[0] = rgbTmp[0]; out[1] = rgbTmp[1]; out[2] = rgbTmp[2]; out[3] = opacity * remain;
		return out;
	}
	// The toothed walker. `_each` plus `_ceil` cost a modulo, a division and a call for every pixel,
	// which is most of a toothed dab's arithmetic; here x and y come straight from the loop and the
	// 64x64 tile is fetched once per run across it. The ceiling arrives as the fourth argument.
	_eachCeil(box, fn) {
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width, T = RAPIER_TOOTH_TILE, bite = this.bite;
		for (let j = 0; j < h; j++) {
			const y = y0 + j, row = (y - ((y / T) | 0) * T) * T;
			let p = (y * W + x0) * 4, m = j * w, tile = null, tx = -1;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const o = mask[m]; if (!o) continue;
				const x = x0 + i, at = (x / T) | 0;
				if (at !== tx) { tx = at; tile = this.oilTop > 0 ? this._weaveTileFor(x, y) : this._toothTileFor(x, y); }
				fn(p, o, D, 1 - bite * (1 - tile[row + (x - tx * T)] / 255));
			}
		}
	}
	_each(box, fn) {
		const { x0, y0, w, h, mask } = box, D = this.data, W = this.width;
		for (let j = 0; j < h; j++) {
			let p = ((y0 + j) * W + x0) * 4, m = j * w;
			for (let i = 0; i < w; i++, p += 4, m++) { const o = mask[m]; if (o) fn(p, o, D); }
		}
	}
	// Paint stands off the sheet where it lands. One byte per pixel, saturating, so thick paint stops
	// growing instead of running away; allocated only when a brush with body first paints.
	// Paint's own height, and it obeys the saturation law like everything else. Adding a fixed lump
	// of height per dab put every interior pixel at the ceiling within four of the seventy dabs that
	// cross it, so the height field came out FLAT and the light found slopes only at the stroke's
	// rim -- a green ribbon where the reference shows ridges. The applicator already knows where its
	// hairs are: `o` is this dab's own coverage at this pixel, high under a bristle and low in the
	// gap between two. So height RISES TOWARD a ceiling that `o` shapes, and the furrows survive any
	// number of passes. A later stroke across the first still fills its gaps, because that stroke's
	// hairs fall somewhere else.
	_lay(p, a, o) {
		if (this.oilTop > 0) return this._layOil(p, a, o);
		const V = this.volume || (this.volume = new Uint8Array(this.width * this.height));
		const i = p >> 2, was = V[i], top = o * this.body * 255;
		if (was >= top) return;
		const v = was + a * this.body * RAPIER_BODY_UNIT;
		V[i] = v > top ? top : v;
	}
	// An oil hair presses its lane into the paint: the height under it moves toward what the lane carries, shaped by the dab's
	// own coverage `o` (full under the hair's middle, none at its edge). It can fall as well as rise, so a hair dragged
	// through a ridge cuts a groove and leaves the paint it moved beside it, and a lane between two hairs stays the thin
	// valley the light needs.
	_layOil(p, a, o) {
		const O = this.oil || (this.oil = new Uint16Array(this.width * this.height));
		const i = p >> 2; let goal = o * this.oilTop;
		if (this.oilPool > 0) { const x0 = i % this.width, y = (i - x0) / this.width + this.toothOY, x = x0 + this.toothOX; goal *= 1 + this.oilPool * (Math.sin(x * .11 + 1.3) * Math.sin(y * .09 + .7) + .5 * Math.sin(x * .05 - y * .07 + 2)); }
		// The lane rises to its own profile and holds there, so a ridge is smooth along the stroke and ripples with nothing.
		if (goal > O[i]) O[i] = goal;
	}
	// The brush's leading half pushes through the paint in front of it: whatever stands higher than the film the brush is
	// about to lay is pressed down to it where the brush really bears. (Only the front half: behind the brush's middle lie
	// the lanes this very stroke has just laid, and they stay.) Taking the paint down at the leading edge is what cuts a new
	// stroke's grooves through an old stroke's ridges.
	oilPlough(x, y, radius, dx, dy, film) {
		const O = this.oil; if (!O) return;
		const sc = this.scale || 1, W = this.width, H = this.height, r = radius * sc, cx = (x + dx * radius * .3) * sc, cy = (y + dy * radius * .3) * sc;
		const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), r2 = r * r;
		this._keepStrokePixels(x0, y0, x1, y1);
		for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
			const i = py * W + px, was = O[i]; if (was <= film) continue;
			const ex = px + .5 - cx, ey = py + .5 - cy, d2 = ex * ex + ey * ey; if (d2 > r2) continue;
			// Ahead of the brush's middle only, softly across its edge.
			const ahead = ((px + .5 - x * sc) * dx + (py + .5 - y * sc) * dy) / r; if (ahead < .05) continue;
			const k = Math.min(1, ahead * 2.5) * Math.min(1, (1 - d2 / r2) * 3) * .85;
			O[i] = was + (film - was) * k;
		}
		this._touch(x0, y0, x1, y1);
	}
	// The wet paint under a point in brush units, for a hair to take up: straight linear colour, coverage and the height
	// of the paint there in 1/64 px, averaged over a small plus so one grain of the sheet is not the answer. False
	// where there is nothing to take.
	oilProbe(x, y, out) {
		const sc = this.scale || 1, cx = Math.round(x * sc), cy = Math.round(y * sc), W = this.width, H = this.height, D = this.data, O = this.oil;
		let r = 0, g = 0, b = 0, a = 0, h = 0;
		for (let k = 0; k < 5; k++) {
			const px = cx + (k === 1 ? -2 : k === 2 ? 2 : 0), py = cy + (k === 3 ? -2 : k === 4 ? 2 : 0);
			if (px < 0 || py < 0 || px >= W || py >= H) continue;
			const q = (py * W + px) * 4; r += D[q]; g += D[q + 1]; b += D[q + 2]; a += D[q + 3]; if (O) h += O[q >> 2];
		}
		if (!(a > .05)) return false;
		out[0] = clamp(r / a, 0, 1); out[1] = clamp(g / a, 0, 1); out[2] = clamp(b / a, 0, 1); out[3] = a / 5; out[4] = h / 5;
		return true;
	}
	_blendNormal(box, r, g, b, opacity) {
		// Volume is laid inside the blend's own walk, not in a second pass over the same box: the
		// separate pass cost oil 46 ms of a 470 ms stroke, a tenth of it, for arithmetic that was
		// already standing on every one of those pixels.
		const body = this.body > 0 || this.oilTop > 0;
		// The sheet caps COVERAGE, never colour. The first cut of this capped the dab's own alpha and so
		// refused the pixel outright once it sat at the ceiling -- which meant red over an opaque blue
		// stroke did essentially nothing (measured: 9,763 covered pixels, 126 of them turned red). A
		// second stroke lands on the same peaks the first one did; the peaks are full, so the alpha does
		// not rise, but the pigment on them is the new pigment. So: blend exactly as the untoothed path
		// does, then renormalise the premultiplied colour to the clamped alpha, which holds the mixed
		// straight colour while the coverage stays where the paper allows.
		if (this.bite > 0) return this._eachCeil(box, (p, o, D, ceil) => {
			const a = o * opacity, ab = 1 - a, da = D[p + 3], un = a + ab * da;
			if (body) this._lay(p, a, o);
			if (!(un > 0)) return;
			// Under the ceiling this is the ordinary blend, and no renormalising division is owed.
			if (un <= ceil) { D[p + 3] = un; D[p] = a * r + ab * D[p]; D[p + 1] = a * g + ab * D[p + 1]; D[p + 2] = a * b + ab * D[p + 2]; return; }
			const na = da > ceil ? da : ceil, k = na / un;
			D[p + 3] = na; D[p] = (a * r + ab * D[p]) * k; D[p + 1] = (a * g + ab * D[p + 1]) * k; D[p + 2] = (a * b + ab * D[p + 2]) * k;
		});
		this._each(box, (p, o, D) => { const a = o * opacity, ab = 1 - a; if (body) this._lay(p, a, o); D[p + 3] = a + ab * D[p + 3]; D[p] = a * r + ab * D[p]; D[p + 1] = a * g + ab * D[p + 1]; D[p + 2] = a * b + ab * D[p + 2]; });
	}
	_blendNormalEraser(box, r, g, b, alpha, opacity) {
		const O = this.oil;
		this._each(box, (p, o, D) => { let a = o * opacity; const ab = 1 - a; a *= alpha; if (O) O[p >> 2] *= ab; D[p + 3] = a + ab * D[p + 3]; D[p] = a * r + ab * D[p]; D[p + 1] = a * g + ab * D[p + 1]; D[p + 2] = a * b + ab * D[p + 2]; });
	}
	_blendLockAlpha(box, r, g, b, opacity) {
		this._each(box, (p, o, D) => { let a = o * opacity; const ab = 1 - a; a *= D[p + 3]; D[p] = a * r + ab * D[p]; D[p + 1] = a * g + ab * D[p + 1]; D[p + 2] = a * b + ab * D[p + 2]; });
	}
	_blendNormalPaint(box, r, g, b, opacity) {
		// Read the fixed basis once per dab. Keeping these scalars outside the pixel walk removes
		// repeated array reads without changing either Float32 rounding point or the sum order.
		const sR0 = SPECTRAL_R[0], sG0 = SPECTRAL_G[0], sB0 = SPECTRAL_B[0], sR1 = SPECTRAL_R[1], sG1 = SPECTRAL_G[1], sB1 = SPECTRAL_B[1], sR2 = SPECTRAL_R[2], sG2 = SPECTRAL_G[2], sB2 = SPECTRAL_B[2], sR3 = SPECTRAL_R[3];
		const sG3 = SPECTRAL_G[3], sB3 = SPECTRAL_B[3], sR4 = SPECTRAL_R[4], sG4 = SPECTRAL_G[4], sB4 = SPECTRAL_B[4], sR5 = SPECTRAL_R[5], sG5 = SPECTRAL_G[5], sB5 = SPECTRAL_B[5], sR6 = SPECTRAL_R[6], sG6 = SPECTRAL_G[6];
		const sB6 = SPECTRAL_B[6], sR7 = SPECTRAL_R[7], sG7 = SPECTRAL_G[7], sB7 = SPECTRAL_B[7], sR8 = SPECTRAL_R[8], sG8 = SPECTRAL_G[8], sB8 = SPECTRAL_B[8], sR9 = SPECTRAL_R[9], sG9 = SPECTRAL_G[9], sB9 = SPECTRAL_B[9];
		const tR0 = T_MATRIX_SMALL[0][0], tG0 = T_MATRIX_SMALL[1][0], tB0 = T_MATRIX_SMALL[2][0], tR1 = T_MATRIX_SMALL[0][1], tG1 = T_MATRIX_SMALL[1][1], tB1 = T_MATRIX_SMALL[2][1], tR2 = T_MATRIX_SMALL[0][2], tG2 = T_MATRIX_SMALL[1][2], tB2 = T_MATRIX_SMALL[2][2], tR3 = T_MATRIX_SMALL[0][3];
		const tG3 = T_MATRIX_SMALL[1][3], tB3 = T_MATRIX_SMALL[2][3], tR4 = T_MATRIX_SMALL[0][4], tG4 = T_MATRIX_SMALL[1][4], tB4 = T_MATRIX_SMALL[2][4], tR5 = T_MATRIX_SMALL[0][5], tG5 = T_MATRIX_SMALL[1][5], tB5 = T_MATRIX_SMALL[2][5], tR6 = T_MATRIX_SMALL[0][6], tG6 = T_MATRIX_SMALL[1][6];
		const tB6 = T_MATRIX_SMALL[2][6], tR7 = T_MATRIX_SMALL[0][7], tG7 = T_MATRIX_SMALL[1][7], tB7 = T_MATRIX_SMALL[2][7], tR8 = T_MATRIX_SMALL[0][8], tG8 = T_MATRIX_SMALL[1][8], tB8 = T_MATRIX_SMALL[2][8], tR9 = T_MATRIX_SMALL[0][9], tG9 = T_MATRIX_SMALL[1][9], tB9 = T_MATRIX_SMALL[2][9];
		const body = this.body > 0 || this.oilTop > 0;
		rgbToSpectral(r, g, b, specA);
		opacity = Math.max(opacity, 150 / 32768);
		// Same law as _blendNormal: the sheet caps coverage, the pigment mixes regardless.
		// The pigment mix is a weighted geometric mean, and it was costing two `Math.pow` per band per
		// pixel -- twenty of them, and a bristled applicator asks for this once per HAIR, so a profile
		// of one oil stroke put 79% of the whole engine's time inside this closure. The arithmetic is
		// unchanged: x^f is exp(f*ln x), the dab's own spectrum is constant for the call so its
		// logarithms are taken once instead of per pixel, and the two exponentials fold into one.
		// Twenty pows per pixel become ten logs and ten exps.
		for (let i = 0; i < 10; i++) logA[i] = Math.log(specA[i]);
		// One raster loop, not a fresh captured callback at every bristle. The pigment
		// arithmetic and Float32 stores below retain their order. Tile fetches remain lazy,
		// once per touched row-run, and neither dab geometry nor coverage is approximated.
		const {x0, y0, w, h, mask, spans} = box, D = this.data, W = this.width, T = RAPIER_TOOTH_TILE, bite = this.bite;
		for (let j = 0; j < h; j++) {
			const y = y0 + j, row = (y - ((y / T) | 0) * T) * T;
			// The row's span from the mask's own renderer; a box from another maker walks whole.
			const ia = spans ? spans[j * 2] : 0, ib = spans ? spans[j * 2 + 1] : w;
			let p = (y * W + x0 + ia) * 4, m = j * w + ia, tile = null, tx = -1;
			for (let i = ia; i < ib; i++, p += 4, m++) {
				const o = mask[m]; if (!o) continue;
				let ceil = 1;
				if (bite > 0) {
					const x = x0 + i, at = (x / T) | 0;
					if (at !== tx) { tx = at; tile = this.oilTop > 0 ? this._weaveTileFor(x, y) : this._toothTileFor(x, y); }
					ceil = 1 - bite * (1 - tile[row + (x - tx * T)] / 255);
				}
				const a = o * opacity, ab = 1 - a, da = D[p + 3], un = a + ab * da;
				if (body) this._lay(p, a, o);
				if (!(un > 0)) continue;
				const na = un > ceil ? (da > ceil ? da : ceil) : un;
				if (da <= 0) { D[p + 3] = na; D[p] = r * na; D[p + 1] = g * na; D[p + 2] = b * na; continue; }
				const facA = a / un, facB = 1 - facA;
				// The ends of the weighting carry no information: at facA within 1e-4 of 1 the mean IS the
				// dab's colour, and at 1e-4 of 0 it is what is already there. Both are far below what a
				// single 8-bit channel can hold, and a soft dab's edge -- most of the pixels a hair
				// touches -- lives at the bottom end.
				if (facA >= 1 - 1e-4) { D[p + 3] = na; D[p] = r * na; D[p + 1] = g * na; D[p + 2] = b * na; continue; }
				if (facA <= 1e-4) { const k = na / da; D[p + 3] = na; D[p] *= k; D[p + 1] *= k; D[p + 2] *= k; continue; }
				// The dab's own colour over itself is itself, whatever the weighting; most of a stroke
				// is exactly that, dab after dab over paint the same brush just laid. The spectral round
				// trip below gives it back a ten-thousandth off (the basis is not quite its own inverse),
				// which moves one channel in twenty by a byte, so this is the finer answer as well as the
				// cheap one. Within four ten-millionths is the same colour: Float32's own rounding of a
				// premultiplied channel is a tenth of that, and no colour a brush can hold differs so little.
				const sr = D[p] / da, sg = D[p + 1] / da, sb = D[p + 2] / da;
				if (Math.abs(sr - r) <= PAINT_SAME_COLOUR && Math.abs(sg - g) <= PAINT_SAME_COLOUR && Math.abs(sb - b) <= PAINT_SAME_COLOUR) { D[p + 3] = na; D[p] = r * na; D[p + 1] = g * na; D[p + 2] = b * na; continue; }
				// Fuse the three spectral walks, keeping both Float32 rounding points and each RGB sum's
				// ascending-band order. No approximate log/exp or new threshold. The ten bands are written out
				// because that IS the saving: the same fusion as a ten-step loop measures 0.97-1.00 of the
				// frozen path's cost on a Scumble stroke over paint, written out 0.64-0.67 (three alternating
				// pairs each).
				const offset = 1 - WGM_EPSILON, rr = sr * offset + WGM_EPSILON, gg = sg * offset + WGM_EPSILON, bb = sb * offset + WGM_EPSILON;
				let red = 0, green = 0, blue = 0;
				{
					const reflectance = Math.fround(sR0 * rr + sG0 * gg + sB0 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[0] + facB * Math.log(reflectance)));
					red += tR0 * mixed; green += tG0 * mixed; blue += tB0 * mixed;
				}
				{
					const reflectance = Math.fround(sR1 * rr + sG1 * gg + sB1 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[1] + facB * Math.log(reflectance)));
					red += tR1 * mixed; green += tG1 * mixed; blue += tB1 * mixed;
				}
				{
					const reflectance = Math.fround(sR2 * rr + sG2 * gg + sB2 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[2] + facB * Math.log(reflectance)));
					red += tR2 * mixed; green += tG2 * mixed; blue += tB2 * mixed;
				}
				{
					const reflectance = Math.fround(sR3 * rr + sG3 * gg + sB3 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[3] + facB * Math.log(reflectance)));
					red += tR3 * mixed; green += tG3 * mixed; blue += tB3 * mixed;
				}
				{
					const reflectance = Math.fround(sR4 * rr + sG4 * gg + sB4 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[4] + facB * Math.log(reflectance)));
					red += tR4 * mixed; green += tG4 * mixed; blue += tB4 * mixed;
				}
				{
					const reflectance = Math.fround(sR5 * rr + sG5 * gg + sB5 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[5] + facB * Math.log(reflectance)));
					red += tR5 * mixed; green += tG5 * mixed; blue += tB5 * mixed;
				}
				{
					const reflectance = Math.fround(sR6 * rr + sG6 * gg + sB6 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[6] + facB * Math.log(reflectance)));
					red += tR6 * mixed; green += tG6 * mixed; blue += tB6 * mixed;
				}
				{
					const reflectance = Math.fround(sR7 * rr + sG7 * gg + sB7 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[7] + facB * Math.log(reflectance)));
					red += tR7 * mixed; green += tG7 * mixed; blue += tB7 * mixed;
				}
				{
					const reflectance = Math.fround(sR8 * rr + sG8 * gg + sB8 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[8] + facB * Math.log(reflectance)));
					red += tR8 * mixed; green += tG8 * mixed; blue += tB8 * mixed;
				}
				{
					const reflectance = Math.fround(sR9 * rr + sG9 * gg + sB9 * bb);
					const mixed = Math.fround(Math.exp(facA * logA[9] + facB * Math.log(reflectance)));
					red += tR9 * mixed; green += tG9 * mixed; blue += tB9 * mixed;
				}
				D[p + 3] = na; D[p] = clamp((red - WGM_EPSILON) / offset, 0, 1) * na; D[p + 1] = clamp((green - WGM_EPSILON) / offset, 0, 1) * na; D[p + 2] = clamp((blue - WGM_EPSILON) / offset, 0, 1) * na;
			}
		}
	}
	_blendNormalEraserPaint(box, r, g, b, alpha, opacity) {
		rgbToSpectral(r, g, b, specA);
		// The same arithmetic as _blendNormalPaint's: the dab's logarithms once, not twenty pows a pixel.
		for (let i = 0; i < 10; i++) logA[i] = Math.log(specA[i]);
		const O = this.oil;
		this._each(box, (p, o, D) => {
			const a = o * opacity, ab = 1 - a, a2 = a * alpha, da = D[p + 3], out = a2 + ab * da;
			if (O) O[p >> 2] *= ab;
			const spectral = clamp(spectralBlendFactor(da), 0, 1), additive = 1 - spectral;
			let r0 = 0, g0 = 0, b0 = 0;
			if (additive) { r0 = a2 * r + ab * D[p]; g0 = a2 * g + ab * D[p + 1]; b0 = a2 * b + ab * D[p + 2]; }
			if (spectral && da !== 0) {
				rgbToSpectral(D[p] / da, D[p + 1] / da, D[p + 2] / da, specB);
				const facA = a / (a + ab * da) * alpha, facB = 1 - facA;
				for (let i = 0; i < 10; i++) specMix[i] = Math.exp(facA * logA[i] + facB * Math.log(specB[i]));
				spectralToRgb(specMix, rgbTmp);
				r0 = additive * r0 + spectral * rgbTmp[0] * out; g0 = additive * g0 + spectral * rgbTmp[1] * out; b0 = additive * b0 + spectral * rgbTmp[2] * out;
			}
			D[p + 3] = out; D[p] = r0; D[p + 1] = g0; D[p + 2] = b0;
		});
	}
	_blendLockAlphaPaint(box, r, g, b, opacity) {
		rgbToSpectral(r, g, b, specA);
		for (let i = 0; i < 10; i++) logA[i] = Math.log(specA[i]);
		opacity = Math.max(opacity, 150 / 32768);
		this._each(box, (p, o, D) => {
			let a = o * opacity; const ab = 1 - a, da = D[p + 3];
			a *= da;
			if (da <= 0) { D[p] = a * r + ab * D[p]; D[p + 1] = a * g + ab * D[p + 1]; D[p + 2] = a * b + ab * D[p + 2]; return; }
			const facA = a / (a + ab * da), facB = 1 - facA;
			rgbToSpectral(D[p] / da, D[p + 1] / da, D[p + 2] / da, specB);
			for (let i = 0; i < 10; i++) specMix[i] = Math.exp(facA * logA[i] + facB * Math.log(specB[i]));
			spectralToRgb(specMix, rgbTmp);
			D[p] = rgbTmp[0] * da; D[p + 1] = rgbTmp[1] * da; D[p + 2] = rgbTmp[2] * da;
		});
	}
	_blendColor(box, r, g, b, opacity) {
		const LR = 0.2126, LG = 0.7152, LB = 0.0722, luma = (r, g, b) => r * LR + g * LG + b * LB;
		const topLum = luma(r, g, b);
		this._each(box, (p, o, D) => {
			const da = D[p + 3];
			let sr = 0, sg = 0, sb = 0;
			if (da !== 0) { sr = D[p] / da; sg = D[p + 1] / da; sb = D[p + 2] / da; }
			const diff = luma(sr, sg, sb) - topLum;
			let nr = r + diff, ng = g + diff, nb = b + diff;
			const lum = luma(nr, ng, nb), cmin = Math.min(nr, ng, nb), cmax = Math.max(nr, ng, nb);
			if (cmin < 0) { nr = lum + (nr - lum) * lum / (lum - cmin); ng = lum + (ng - lum) * lum / (lum - cmin); nb = lum + (nb - lum) * lum / (lum - cmin); }
			if (cmax > 1) { nr = lum + (nr - lum) * (1 - lum) / (cmax - lum); ng = lum + (ng - lum) * (1 - lum) / (cmax - lum); nb = lum + (nb - lum) * (1 - lum) / (cmax - lum); }
			nr *= da; ng *= da; nb *= da;
			const a = o * opacity, ab = 1 - a;
			D[p] = a * nr + ab * D[p]; D[p + 1] = a * ng + ab * D[p + 1]; D[p + 2] = a * nb + ab * D[p + 2];
		});
	}
	_blendPosterize(box, opacity, num) {
		this._each(box, (p, o, D) => {
			const pr = Math.round(D[p] * num) / num, pg = Math.round(D[p + 1] * num) / num, pb = Math.round(D[p + 2] * num) / num;
			const a = o * opacity, ab = 1 - a;
			D[p] = a * pr + ab * D[p]; D[p + 1] = a * pg + ab * D[p + 1]; D[p + 2] = a * pb + ab * D[p + 2];
		});
	}
	// The colour under a soft round probe (get_color): what smudge picks up. `paint` < 0 selects
	// libmypaint's legacy additive average; otherwise pigment and additive averages are blended by
	// the paint factor. `rng` decides which pixels the sparse sampler visits.
	getColor(x, y, radius, paint, rng) {
		x *= this.scale; y *= this.scale; radius *= this.scale;
		if (radius < 1) radius = 1;
		const box = this._renderMask(x, y, radius, 0.5, 0.5, 1, 0), out = this.sampleOut;
		out[0] = 0; out[1] = 1; out[2] = 0; out[3] = 0;
		if (!box) return out;
		const D = this.data, W = this.width, { x0, y0, w, h, mask } = box, paper = this.paper;
		let sumWeight = 0, sumR = 0, sumG = 0, sumB = 0, sumA = 0;
		if (paint < 0) {
			for (let j = 0; j < h; j++) {
				let p = ((y0 + j) * W + x0) * 4, m = j * w;
				for (let i = 0; i < w; i++, p += 4, m++) {
					const o = mask[m];
					if (!o) continue;
					sumWeight += o;
					if (paper) { const u = 1 - D[p + 3]; sumR += o * (D[p] + u * paper[0]); sumG += o * (D[p + 1] + u * paper[1]); sumB += o * (D[p + 2] + u * paper[2]); sumA += o; }
					else { sumR += o * D[p]; sumG += o * D[p + 1]; sumB += o * D[p + 2]; sumA += o * D[p + 3]; }
				}
			}
			if (sumWeight <= 0) return out;
			sumA /= sumWeight; sumR /= sumWeight; sumG /= sumWeight; sumB /= sumWeight;
			if (sumA > 0) { out[0] = clamp(sumR / sumA, 0, 1); out[1] = clamp(sumG / sumA, 0, 1); out[2] = clamp(sumB / sumA, 0, 1); }
			out[3] = sumA;
			return out;
		}
		const sampleInterval = radius <= 2 ? 1 : Math.trunc(radius * 7), randomRate = 1 / (7 * radius);
		const avgSpectral = this.sampleSpectral, avgRgb = this.sampleRgb, logAvg = this.sampleLog;
		avgSpectral.fill(0); avgRgb[0] = 0; avgRgb[1] = 0; avgRgb[2] = 0;
		// The probe's weighted geometric mean is kept as the weighted mean of logarithms and
		// exponentiated once at the end -- the same mean, ten logs a sample instead of twenty pows,
		// and a fine brush samples every pixel under its probe.
		if (paint > 0) { rgbToSpectral(0, 0, 0, avgSpectral); for (let k = 0; k < 10; k++) logAvg[k] = Math.log(avgSpectral[k]); }
		let counter = 0;
		const spec = this.sampleSpec;
		for (let j = 0; j < h; j++) {
			let p = ((y0 + j) * W + x0) * 4, m = j * w;
			for (let i = 0; i < w; i++, p += 4, m++) {
				const o = mask[m];
				if (!o) continue;
				if (counter === 0 || rng.next() < randomRate) {
					let da = D[p + 3], sr = D[p], sg = D[p + 1], sb = D[p + 2];
					if (paper) { const u = 1 - da; sr += u * paper[0]; sg += u * paper[1]; sb += u * paper[2]; da = 1; }
					const a = o * da, alphaSums = a + sumA;
					sumWeight += o;
					let facA = 1, facB = 1;
					if (alphaSums > 0) { facA = a / alphaSums; facB = 1 - facA; }
					if (paint > 0 && da > 0) {
						rgbToSpectral(sr / da, sg / da, sb / da, spec);
						for (let k = 0; k < 10; k++) logAvg[k] = facA * Math.log(spec[k]) + facB * logAvg[k];
					}
					if (paint < 1 && da > 0) { avgRgb[0] = sr * facA / da + avgRgb[0] * facB; avgRgb[1] = sg * facA / da + avgRgb[1] * facB; avgRgb[2] = sb * facA / da + avgRgb[2] * facB; }
					sumA += a;
				}
				counter = (counter + 1) % sampleInterval;
			}
		}
		if (paint > 0) for (let k = 0; k < 10; k++) avgSpectral[k] = Math.exp(logAvg[k]);
		spectralToRgb(avgSpectral, rgbTmp);
		sumR = rgbTmp[0] * paint + (1 - paint) * avgRgb[0]; sumG = rgbTmp[1] * paint + (1 - paint) * avgRgb[1]; sumB = rgbTmp[2] * paint + (1 - paint) * avgRgb[2];
		if (sumWeight <= 0) return out;
		sumA /= sumWeight;
		if (sumA > 0) { out[0] = clamp(sumR, 0, 1); out[1] = clamp(sumG, 0, 1); out[2] = clamp(sumB, 0, 1); }
		out[3] = sumA;
		return out;
	}
	// The rule of a raster canvas: a surface GROWS to hold the stroke; it never clips it. A vector
	// editor cannot cut a stroke off because its drawn shapes are vectors on an unbounded page --
	// there is no edge to meet. Paint is pixels, so the edge is real, and the only honest answer is
	// to move it.
	//
	// Grows by whole pixels on any side, copying every existing pixel to its new home. Nothing is
	// resampled, so this is lossless: it is the same paint at a new address.
	//   - `data` and `volume` are copied row by row.
	//   - The paper's grain is anchored by `toothOX/OY`, so the sheet does not slide under the paint.
	//   - A live wet window is TRANSLATED (its cells are already relocatable -- see
	// rewindowWetState); nothing is resampled there either.
	// Returns the offset the content moved by, so a caller can keep its own origin in step.
	// A detached stride can be allocated and copied before the hand reaches it. Changes made while
	// its rows are copied stay on the current surface and are copied again at adoption.
	prepareGrowth(left, top, right, bottom) {
		const width = this.width + left + right, height = this.height + top + bottom;
		const data = new Float32Array(width * height * 4), volume = this.volume && new Uint8Array(width * height), oil = this.oil && new Uint16Array(width * height), transparentRGB = this.transparentRGB && new Uint8Array(width * height * 3);
		const box = this.growBox === undefined ? {x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1} : this.growBox && {...this.growBox};
		return this.preparedGrowth = {left, top, right, bottom, width, height, data, volume, oil, transparentRGB, source: this.data, sourceVolume: this.volume, sourceOil: this.oil, sourceTransparentRGB: this.transparentRGB, box, y: box?.y0 || 0, changed: null};
	}
	copyGrowth(pixels = 65536) {
		const next = this.preparedGrowth;
		if (!next || next.source !== this.data || next.sourceVolume !== this.volume || next.sourceOil !== this.oil || next.sourceTransparentRGB !== this.transparentRGB) { this.preparedGrowth = null; return false; }
		const box = next.box;
		if (!box) return true;
		const W = this.width, count = box.x1 - box.x0 + 1, end = Math.min(box.y1 + 1, next.y + Math.max(1, Math.floor(pixels / count)));
		for (; next.y < end; next.y++) {
			const from = next.y * W + box.x0, to = (next.y + next.top) * next.width + next.left + box.x0;
			next.data.set(this.data.subarray(from * 4, (from + count) * 4), to * 4);
			if (next.volume) next.volume.set(this.volume.subarray(from, from + count), to);
			if (next.oil) next.oil.set(this.oil.subarray(from, from + count), to);
			if (next.transparentRGB) next.transparentRGB.set(this.transparentRGB.subarray(from * 3, (from + count) * 3), to * 3);
		}
		return next.y > box.y1;
	}
	grow(left = 0, top = 0, right = 0, bottom = 0) {
		left = Math.max(0, Math.ceil(left)); top = Math.max(0, Math.ceil(top));
		right = Math.max(0, Math.ceil(right)); bottom = Math.max(0, Math.ceil(bottom));
		if (!(left || top || right || bottom)) return { dx: 0, dy: 0 };
		this._finishWetWork();
		const W = this.width, H = this.height, nw = W + left + right, nh = H + top + bottom;
		const next = this.preparedGrowth;
		const prepared = next && next.source === this.data && next.sourceVolume === this.volume && next.sourceOil === this.oil && next.sourceTransparentRGB === this.transparentRGB && next.left === left && next.top === top && next.right === right && next.bottom === bottom;
		const data = prepared ? next.data : new Float32Array(nw * nh * 4);
		const volume = this.volume ? (prepared ? next.volume : new Uint8Array(nw * nh)) : null, oil = this.oil ? (prepared ? next.oil : new Uint16Array(nw * nh)) : null;
		const transparentRGB = this.transparentRGB ? (prepared ? next.transparentRGB : new Uint8Array(nw * nh * 3)) : null;
		if (prepared) this.copyGrowth(Infinity);
		const changed = prepared ? next.changed : this.growBox === undefined ? {x0: 0, y0: 0, x1: W - 1, y1: H - 1} : this.growBox;
		if (changed) for (let y = changed.y0; y <= changed.y1; y++) {
			const from = y * W + changed.x0, to = (y + top) * nw + left + changed.x0, count = changed.x1 - changed.x0 + 1;
			data.set(this.data.subarray(from * 4, (from + count) * 4), to * 4);
			if (volume) volume.set(this.volume.subarray(from, from + count), to);
			if (oil) oil.set(this.oil.subarray(from, from + count), to);
			if (transparentRGB) transparentRGB.set(this.transparentRGB.subarray(from * 3, (from + count) * 3), to * 3);
		}
		// Publish the new stride and both buffers only after every allocation and copy succeeds.
		this.data = data;
		this.preparedGrowth = null;
		if (volume) this.volume = volume;
		if (oil) this.oil = oil;
		this.transparentRGB = transparentRGB;
		this.width = nw; this.height = nh;
		if (this.growBox) { this.growBox.x0 += left; this.growBox.x1 += left; this.growBox.y0 += top; this.growBox.y1 += top; }
		// Cached alpha bounds live on the paper's tile grid, so empty growth needs no rescan.
		this.boundsOX += left; this.boundsOY += top;
		for (const b of this.boundsTiles.values()) { b.x0 += left; b.x1 += left; b.y0 += top; b.y1 += top; }
		if (this.boundsDirty) { this.boundsDirty.x0 += left; this.boundsDirty.x1 += left; this.boundsDirty.y0 += top; this.boundsDirty.y1 += top; }
		this.revision++;
		this._readout = null; this.sinceRead = null;
		// The grain follows the paper, not the buffer.
		this.toothOX -= left; this.toothOY -= top;
		this.toothTiles = null; this.toothTilesW = 0; this.weaveTiles = null;
		if (this.dirty) { this.dirty.x0 += left; this.dirty.x1 += left; this.dirty.y0 += top; this.dirty.y1 += top; }
		if (this.wetWindow) { this.wetWindow.x0 += left; this.wetWindow.y0 += top; }
		if (this.wetTouched) { /* cells inside the window, which moved with it */ }
		this.wetBandBox = null;
		return { dx: left, dy: top };
	}
	bounds(threshold = 1 / 512) {
		const D = this.data, W = this.width, H = this.height;
		const scan = (left, top, right, bottom) => {
			let x0 = W, y0 = H, x1 = -1, y1 = -1;
			for (let y = top; y <= bottom; y++) for (let x = left, p = (y * W + left) * 4 + 3; x <= right; x++, p += 4) {
				if (D[p] > threshold) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
			}
			return x1 < 0 ? null : { x0, y0, x1, y1 };
		};
		if (threshold !== 1 / 512) return scan(0, 0, W - 1, H - 1);
		// Display consumes dirty rectangles on every frame. Bounds has its own invalidation so a
		// lift scans only tiles touched since the previous commit, including erasure at an edge.
		const d = this.boundsDirty, tiles = this.boundsTiles, ox = this.boundsOX, oy = this.boundsOY;
		if (d) for (let ty = Math.floor((d.y0 - oy) / 64); ty <= Math.floor((d.y1 - oy) / 64); ty++) for (let tx = Math.floor((d.x0 - ox) / 64); tx <= Math.floor((d.x1 - ox) / 64); tx++) {
			const x = ox + tx * 64, y = oy + ty * 64;
			const key = ty + ':' + tx, b = scan(Math.max(0, x), Math.max(0, y), Math.min(W - 1, x + 63), Math.min(H - 1, y + 63));
			if (b) tiles.set(key, b); else tiles.delete(key);
		}
		this.boundsDirty = null;
		let box = null;
		for (const b of tiles.values()) { if (!box) box = { ...b }; else { box.x0 = Math.min(box.x0, b.x0); box.y0 = Math.min(box.y0, b.y0); box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1); } }
		return box;
	}
	// Straight (un-premultiplied) 8-bit sRGB pixels of a box, ready for a PNG or an ImageData.
	toRGBA8(box = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 }, linear = true, quality = 'final') {
		const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, out = new Uint8ClampedArray(w * h * 4), D = this.data, W = this.width;
		const byte = linear ? paintByte : v => Math.round(v * 255);
		for (let j = 0; j < h; j++) {
			let p = ((box.y0 + j) * W + box.x0) * 4, q = j * w * 4;
			for (let i = 0; i < w; i++, p += 4, q += 4) {
				const a = D[p + 3];
				if (a <= 0) { if (this.transparentRGB) { const at = p / 4 * 3; out[q] = this.transparentRGB[at]; out[q + 1] = this.transparentRGB[at + 1]; out[q + 2] = this.transparentRGB[at + 2]; } continue; }
				out[q] = byte(clamp(D[p] / a, 0, 1)); out[q + 1] = byte(clamp(D[p + 1] / a, 0, 1)); out[q + 2] = byte(clamp(D[p + 2] / a, 0, 1));
				out[q + 3] = Math.round(clamp(a, 0, 1) * 255);
			}
		}
		// Raised paint is shaded here, on the way out, so it is shaded exactly once however many
		// times the layer is read (see shadeInto). It encodes through the same threshold table, which
		// gives exactly `Math.round(Math.pow(v, 1 / 2.2) * 255)` for every double it is handed.
		if (this.volume || this.oil) this.shadeInto(out, box, byte, quality);
		return { width: w, height: h, data: out };
	}
	// The lift's read-out. The first call shades the box; a later call shades only what has been
	// touched since, plus the one pixel a normal reaches into, and splices those bytes into the
	// cache. The buffer it returns is the cache's own — a caller that hands it to a worker copies
	// first. Bytes match `toRGBA8` of the same box.
	readCommitted(box = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 }) {
		const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
		const same = (a, b) => a && b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
		let cache = this._readout;
		if (!cache || !same(cache.box, box)) {
			const fresh = cache ? null : this.toRGBA8(box);
			if (!cache) {
				this._readout = { box: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, width: w, height: h, data: fresh.data };
				this.sinceRead = null;
				return fresh;
			}
			const next = new Uint8ClampedArray(w * h * 4);
			const ax0 = Math.max(box.x0, cache.box.x0), ay0 = Math.max(box.y0, cache.box.y0);
			const ax1 = Math.min(box.x1, cache.box.x1), ay1 = Math.min(box.y1, cache.box.y1);
			if (ax1 >= ax0 && ay1 >= ay0) {
				const cw = cache.width;
				for (let y = ay0; y <= ay1; y++) {
					const from = ((y - cache.box.y0) * cw + (ax0 - cache.box.x0)) * 4;
					next.set(cache.data.subarray(from, from + (ax1 - ax0 + 1) * 4), ((y - box.y0) * w + (ax0 - box.x0)) * 4);
				}
			}
			cache = this._readout = { box: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, width: w, height: h, data: next };
		}
		const dirty = this.sinceRead;
		if (dirty) {
			const x0 = Math.max(box.x0, dirty.x0 - 1), y0 = Math.max(box.y0, dirty.y0 - 1);
			const x1 = Math.min(box.x1, dirty.x1 + 1), y1 = Math.min(box.y1, dirty.y1 + 1);
			if (x1 >= x0 && y1 >= y0) {
				const part = this.toRGBA8({ x0, y0, x1, y1 });
				const pw = part.width;
				for (let y = 0; y < part.height; y++) {
					const row = y * pw * 4;
					cache.data.set(part.data.subarray(row, row + pw * 4), ((y0 - box.y0 + y) * w + (x0 - box.x0)) * 4);
				}
			}
			this.sinceRead = null;
		}
		return { width: cache.width, height: cache.height, data: cache.data };
	}
	// Load straight 8-bit sRGB pixels (a decoded PNG) at an offset: how a saved paint layer is
	// picked up again for more strokes.
	fromRGBA8(pixels, width, height, x0 = 0, y0 = 0, linear = true) {
		this._finishWetWork();
		this._keepStrokePixels(x0, y0, x0 + width - 1, y0 + height - 1);
		this.settleWet();
		// Pixels arriving from outside already carry whatever relief they were shaded with, so the
		// volume under them is dropped: their height is baked into their colour and shading them again
		// would darken them once per reload. A live layer is rebuilt from its own committed PNG many
		// times in an ordinary session (measured: thirty reloads over nine strokes), which is exactly
		// how the relief compounded its way through the save path after it stopped compounding in
		// memory. New paint laid on top builds fresh volume of its own.
		if (this.volume) { const W0 = this.width;
			for (let j = 0; j < height; j++) { const y = y0 + j; if (y < 0 || y >= this.height) continue;
				const from = y * W0 + Math.max(0, x0), to = y * W0 + Math.min(this.width, x0 + width);
				if (to > from) this.volume.fill(0, from, to); } }
		if (this.oil) { const W0 = this.width;
			for (let j = 0; j < height; j++) { const y = y0 + j; if (y < 0 || y >= this.height) continue;
				const from = y * W0 + Math.max(0, x0), to = y * W0 + Math.min(this.width, x0 + width);
				if (to > from) this.oil.fill(0, from, to); } }
		// The table answers only for genuine 8-bit input, which is what every caller in the product
		// hands in (ImageData, a Uint8ClampedArray). A caller with fractional channels -- a witness
		// fixture may -- takes the original arithmetic, so this is exact for both rather than exact
		// for the common one and quietly different for the other.
		const bytes = pixels instanceof Uint8ClampedArray || pixels instanceof Uint8Array;
		const D = this.data, W = this.width, decode = linear ? (bytes ? v => PAINT_LINEAR_BYTE[v] : v => Math.pow(v / 255, 2.2)) : v => v / 255;
		for (let j = 0; j < height; j++) {
			const y = y0 + j;
			if (y < 0 || y >= this.height) continue;
			for (let i = 0; i < width; i++) {
				const x = x0 + i;
				if (x < 0 || x >= W) continue;
				const q = (j * width + i) * 4, a = pixels[q + 3] / 255, p = (y * W + x) * 4;
				if (!a && bytes && (pixels[q] || pixels[q + 1] || pixels[q + 2])) {
					this.transparentRGB ||= new Uint8Array(W * this.height * 3);
					this.transparentRGB.set(pixels.subarray(q, q + 3), (y * W + x) * 3);
				} else if (this.transparentRGB) this.transparentRGB.fill(0, (y * W + x) * 3, (y * W + x + 1) * 3);
				D[p] = decode(pixels[q]) * a; D[p + 1] = decode(pixels[q + 1]) * a; D[p + 2] = decode(pixels[q + 2]) * a; D[p + 3] = a;
			}
		}
		this._touch(x0, y0, x0 + width - 1, y0 + height - 1);
	}
}

// How far a side grows when the stroke only needs `need` pixels. Whole strides, so a pull that
// crosses the edge every sample grows a few times. Zero stays zero.
export function paintGrowStep(need, stride = 256) {
	need = Math.max(0, Math.ceil(need) || 0);
	if (!need) return 0;
	return Math.ceil(need / stride) * stride;
}

// --- a stroke, replayed: the Paint tool's own record and the witness/agent path -----------------
// `points` are [x, y, pressure, dtimeSeconds, xtilt?, ytilt?] in surface pixels. `seed` makes the
// random inputs (offset_by_random, radius_by_random, tracking noise, colour sampling) repeat.
export function paintStroke(surface, brush, points, { color = [0.07, 0.07, 0.07], seed = 1000, radiusOffset = 0, linear = true, viewzoom = 1 } = {}) {
	brush.seed(seed);
	brush.setColor(color[0], color[1], color[2], linear);
	if (radiusOffset) brush.setBaseValue('radius_logarithmic', brush.getBaseValue('radius_logarithmic') + radiusOffset);
	brush.reset(); brush.newStroke();
	let dabs = 0;
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const dt = i === 0 ? 0.0001 : Math.max(0.0001, Math.min(5, p[3] ?? 0.016));
		brush.strokeTo(surface, p[0], p[1], p[2] ?? 0.5, p[4] ?? 0, p[5] ?? 0, dt, viewzoom, 0, 0, linear);
		dabs++;
	}
	if (points.length) { const last = points[points.length - 1]; brush.strokeTo(surface, last[0], last[1], 0, last[4] ?? 0, last[5] ?? 0, 0.016, viewzoom, 0, 0, linear); }
	if (radiusOffset) brush.setBaseValue('radius_logarithmic', brush.getBaseValue('radius_logarithmic') - radiusOffset);
	return dabs;
}

// PNG belongs to the same straight-RGBA owner used by the page and its worker. The injected
// compressor is a test/agent choice; ordinary callers get a lossless stored stream.
const paintPNGCodec = createPaintPNGCodec();
export function encodePNG(rgba, width, height, deflate) {
	return paintPNGCodec.encodeBytes({data: rgba, width, height}, deflate);
}
