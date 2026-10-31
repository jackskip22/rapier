// SPDX-License-Identifier: AGPL-3.0-only
import {PAINT_PRIMARY, PAINT_DISPLAY} from './paint-pigment-data.mjs';
import {mixState, mixRescue, linearToOklab, MIX_CHANNELS, MIX_RESCUE_FROM} from './paint-mix.mjs';

const BANDS = PAINT_PRIMARY.length, KM = BANDS + 3;
export const PAINT_PIGMENT_CHANNELS = KM + MIX_CHANNELS;
const clamp = x => Math.max(0, Math.min(1, x));
const pigments = new Map(), CACHE_SIZE = 4096, GRID = 1023;
const mixed = new Float64Array(KM), decoded = new Float64Array(3), kmOut = new Float64Array(3);
const za = new Float64Array(MIX_CHANNELS), zb = new Float64Array(MIX_CHANNELS), lab = new Float64Array(3);
const chromaOf = (r, g, b) => { linearToOklab(clamp(r), clamp(g), clamp(b), lab); return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]); };
const cbrtF = new Float32Array(1), cbrtI = new Uint32Array(cbrtF.buffer);
const fastCbrt = x => { if (!(x > 0)) return 0; cbrtF[0] = x; cbrtI[0] = Math.floor(cbrtI[0] / 3) + 709921077; let y = cbrtF[0]; y = (2 * y + x / (y * y)) / 3; return (2 * y + x / (y * y)) / 3; };
function fastChroma(r, g, b) {
	r = clamp(r); g = clamp(g); b = clamp(b);
	const l = fastCbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = fastCbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = fastCbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
	const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
	return Math.sqrt(A * A + B * B);
}
const SKIP = (1 - MIX_RESCUE_FROM) * 1.002;

export function paintPigment(r, g, b) {
	const out = new Float64Array(PAINT_PIGMENT_CHANNELS);
	out.set(paintPigmentCell(Math.round(clamp(r) * GRID), Math.round(clamp(g) * GRID), Math.round(clamp(b) * GRID)));
	mixState(r, g, b, out, KM, 1 / lumOf(r, g, b));
	return out;
}
function paintPigmentCell(r, g, b) {
	const key = r * 1048576 + g * 1024 + b;
	let pigment = pigments.get(key);
	if (pigment) return pigment;
	r /= GRID; g /= GRID; b /= GRID;
	const white = Math.min(r, g, b); r -= white; g -= white; b -= white;
	const weights = [Math.min(g, b), Math.min(r, b), Math.min(r, g), Math.max(0, Math.min(r - g, r - b)), Math.max(0, Math.min(g - r, g - b)), Math.max(0, Math.min(b - r, b - g))];
	pigment = new Float64Array(KM);
	for (let i = 0; i < BANDS; i++) {
		let reflectance = white;
		for (let j = 0; j < 6; j++) reflectance += weights[j] * PAINT_PRIMARY[i][j];
		reflectance = Math.max(.0001, reflectance);
		pigment[i] = (1 - reflectance) ** 2 / (2 * reflectance);
	}
	kmRGB(pigment, decoded);
	pigment[BANDS] = r + white - decoded[0]; pigment[BANDS + 1] = g + white - decoded[1]; pigment[BANDS + 2] = b + white - decoded[2];
	if (pigments.size >= CACHE_SIZE) pigments.delete(pigments.keys().next().value);
	pigments.set(key, pigment);
	return pigment;
}

function kmRGB(pigment, out, offset = 0) {
	let r = 0, g = 0, b = 0;
	for (let i = 0; i < BANDS; i++) {
		const k = Math.max(0, pigment[offset + i]);
		const reflectance = 1 / (1 + k + Math.sqrt(k * k + 2 * k)), row = PAINT_DISPLAY[i];
		r += reflectance * row[0]; g += reflectance * row[1]; b += reflectance * row[2];
	}
	out[0] = r + pigment[offset + BANDS]; out[1] = g + pigment[offset + BANDS + 1]; out[2] = b + pigment[offset + BANDS + 2];
	return out;
}
export function paintPigmentRGB(pigment, out, offset = 0) {
	kmRGB(pigment, kmOut, offset);
	return mixRescue(kmOut, pigment, out, offset + KM);
}

const lumOf = (r, g, b) => Math.max(.0001, .2126 * r + .7152 * g + .0722 * b);
export function writePaintPigment(r, g, b, out, offset = 0) {
	writePaintKM(r, g, b, out, offset);
	mixState(r, g, b, out, offset + KM, 1 / lumOf(r, g, b));
	return out;
}

export const PAINT_WET_CHANNELS = PAINT_PIGMENT_CHANNELS;
export function writePaintWet(r, g, b, out, offset = 0) { return writePaintPigment(r, g, b, out, offset); }
export function writePaintKM(r, g, b, out, offset = 0) {
	const pigment = paintPigmentCell(Math.round(clamp(r) * GRID), Math.round(clamp(g) * GRID), Math.round(clamp(b) * GRID));
	for (let i = 0; i < KM; i++) out[offset + i] = pigment[i];
	out[offset + BANDS] += r - Math.round(clamp(r) * GRID) / GRID;
	out[offset + BANDS + 1] += g - Math.round(clamp(g) * GRID) / GRID;
	out[offset + BANDS + 2] += b - Math.round(clamp(b) * GRID) / GRID;
	return out;
}
export function paintWetRGB(pigment, out, offset = 0) { return paintPigmentRGB(pigment, out, offset); }
export function paintKMRGB(pigment, out, offset = 0) { return kmRGB(pigment, out, offset); }
export function paintWetPigment(r, g, b) { return paintPigmentCell(Math.round(clamp(r) * GRID), Math.round(clamp(g) * GRID), Math.round(clamp(b) * GRID)); }

export function writePaintRGB(r, g, b, out) { out[0] = r; out[1] = g; out[2] = b; return out; }
export function readPaintRGB(source, out) { out[0] = source[0]; out[1] = source[1]; out[2] = source[2]; return out; }

const SLOTS = 1 << 16, seen = new Float64Array(SLOTS * 3).fill(-1), states = new Float64Array(SLOTS * MIX_CHANNELS);
const bits = new Float64Array(3), words = new Int32Array(bits.buffer);
function wheelOf(r, g, b, out) {
	bits[0] = r; bits[1] = g; bits[2] = b;
	let h = 0; for (let i = 0; i < 6; i++) h = Math.imul(h ^ words[i], 0x9e3779b1);
	const slot = (h ^ h >>> 16) & (SLOTS - 1), at = slot * MIX_CHANNELS, c = slot * 3;
	if (seen[c] !== r || seen[c + 1] !== g || seen[c + 2] !== b) { mixState(r, g, b, states, at); seen[c] = r; seen[c + 1] = g; seen[c + 2] = b; }
	for (let i = 0; i < MIX_CHANNELS; i++) out[i] = states[at + i];
	return out;
}

export function mixPaintPigment(ar, ag, ab, br, bg, bb, t, out) {
	return mixPreparedPaintPigment(ar, ag, ab, preparePaintPigment(br, bg, bb), t, out);
}

export function preparePaintPigment(r, g, b) { return {r, g, b, pigment:null, wheel:null, chroma:-1, y:0, dr:0, dg:0, db:0}; }
export function mixPreparedPaintPigment(ar, ag, ab, incoming, t, out) {
	const {r:br, g:bg, b:bb} = incoming;
	t = clamp(t);
	if (t === 0 || Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb) < 1e-7) { out[0] = ar; out[1] = ag; out[2] = ab; return out; }
	if (t === 1) { out[0] = br; out[1] = bg; out[2] = bb; return out; }
	const qr = Math.round(clamp(ar) * GRID), qg = Math.round(clamp(ag) * GRID), qb = Math.round(clamp(ab) * GRID);
	const a = paintPigmentCell(qr, qg, qb);
	if (!incoming.pigment) {
		incoming.pigment = paintPigmentCell(Math.round(clamp(br) * GRID), Math.round(clamp(bg) * GRID), Math.round(clamp(bb) * GRID));
		incoming.wheel = wheelOf(br, bg, bb, new Float64Array(MIX_CHANNELS));
		incoming.y = Math.max(.0001, .2126 * br + .7152 * bg + .0722 * bb);
		incoming.dr = br - Math.round(clamp(br) * GRID) / GRID;
		incoming.dg = bg - Math.round(clamp(bg) * GRID) / GRID;
		incoming.db = bb - Math.round(clamp(bb) * GRID) / GRID;
	}
	const b = incoming.pigment, ya = Math.max(.0001, .2126 * ar + .7152 * ag + .0722 * ab), yb = incoming.y;
	const concentration = yb * t / (ya * (1 - t) + yb * t), u = 1 - concentration;
	for (let i = 0; i < KM; i++) mixed[i] = a[i] * u + b[i] * concentration;
	kmRGB(mixed, kmOut);
	kmOut[0] = clamp(kmOut[0] + (ar - qr / GRID) * u + incoming.dr * concentration);
	kmOut[1] = clamp(kmOut[1] + (ag - qg / GRID) * u + incoming.dg * concentration);
	kmOut[2] = clamp(kmOut[2] + (ab - qb / GRID) * u + incoming.db * concentration);
	if (incoming.chroma < 0) incoming.chroma = chromaOf(br, bg, bb);
	const ck = fastChroma(kmOut[0], kmOut[1], kmOut[2]);
	if (ck >= SKIP * incoming.chroma && ck >= SKIP * fastChroma(ar, ag, ab)) { out[0] = kmOut[0]; out[1] = kmOut[1]; out[2] = kmOut[2]; return out; }
	wheelOf(ar, ag, ab, za);
	for (let i = 0; i < MIX_CHANNELS; i++) zb[i] = za[i] + (incoming.wheel[i] - za[i]) * t;
	return mixRescue(kmOut, zb, out);
}

export function mixPaintHex(a, b, t, pigment = true) {
	const rgb = hex => [1, 3, 5].map(i => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));
	const left = rgb(a), right = rgb(b), out = [0, 0, 0];
	if (pigment) mixPaintPigment(...left, ...right, t, out);
	else for (let i = 0; i < 3; i++) out[i] = left[i] * (1 - t) + right[i] * t;
	return '#' + out.map(c => Math.round(Math.pow(clamp(c), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
}
