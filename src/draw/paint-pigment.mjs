// SPDX-License-Identifier: AGPL-3.0-only
import {PAINT_PRIMARY, PAINT_DISPLAY} from './paint-pigment-data.mjs';

const BANDS = PAINT_PRIMARY.length;
export const PAINT_PIGMENT_CHANNELS = BANDS + 3;
const clamp = x => Math.max(0, Math.min(1, x));
const pigments = new Map(), CACHE_SIZE = 4096, GRID = 1023;
const mixed = new Float64Array(PAINT_PIGMENT_CHANNELS), decoded = new Float64Array(3);

export function paintPigment(r, g, b) {
	r = Math.round(clamp(r) * GRID); g = Math.round(clamp(g) * GRID); b = Math.round(clamp(b) * GRID);
	return paintPigmentCell(r, g, b);
}
function paintPigmentCell(r, g, b) {
	const key = r * 1048576 + g * 1024 + b;
	let pigment = pigments.get(key);
	if (pigment) return pigment;
	r /= GRID; g /= GRID; b /= GRID;
	const white = Math.min(r, g, b); r -= white; g -= white; b -= white;
	const weights = [Math.min(g, b), Math.min(r, b), Math.min(r, g), Math.max(0, Math.min(r - g, r - b)), Math.max(0, Math.min(g - r, g - b)), Math.max(0, Math.min(b - r, b - g))];
	pigment = new Float64Array(PAINT_PIGMENT_CHANNELS);
	for (let i = 0; i < BANDS; i++) {
		let reflectance = white;
		for (let j = 0; j < 6; j++) reflectance += weights[j] * PAINT_PRIMARY[i][j];
		reflectance = Math.max(.0001, reflectance);
		pigment[i] = (1 - reflectance) ** 2 / (2 * reflectance);
	}
	paintPigmentRGB(pigment, decoded);
	pigment[BANDS] = r + white - decoded[0]; pigment[BANDS + 1] = g + white - decoded[1]; pigment[BANDS + 2] = b + white - decoded[2];
	if (pigments.size >= CACHE_SIZE) pigments.delete(pigments.keys().next().value);
	pigments.set(key, pigment);
	return pigment;
}

export function paintPigmentRGB(pigment, out, offset = 0) {
	let r = 0, g = 0, b = 0;
	for (let i = 0; i < BANDS; i++) {
		const k = Math.max(0, pigment[offset + i]);
		const reflectance = 1 / (1 + k + Math.sqrt(k * k + 2 * k)), row = PAINT_DISPLAY[i];
		r += reflectance * row[0]; g += reflectance * row[1]; b += reflectance * row[2];
	}
	out[0] = r + pigment[offset + BANDS]; out[1] = g + pigment[offset + BANDS + 1]; out[2] = b + pigment[offset + BANDS + 2];
	return out;
}

export function writePaintPigment(r, g, b, out, offset = 0) {
	const pigment = paintPigment(r, g, b);
	for (let i = 0; i < PAINT_PIGMENT_CHANNELS; i++) out[offset + i] = pigment[i];
	out[offset + BANDS] += r - Math.round(clamp(r) * GRID) / GRID;
	out[offset + BANDS + 1] += g - Math.round(clamp(g) * GRID) / GRID;
	out[offset + BANDS + 2] += b - Math.round(clamp(b) * GRID) / GRID;
	return out;
}

export function writePaintRGB(r, g, b, out) { out[0] = r; out[1] = g; out[2] = b; return out; }
export function readPaintRGB(source, out) { out[0] = source[0]; out[1] = source[1]; out[2] = source[2]; return out; }

export function mixPaintPigment(ar, ag, ab, br, bg, bb, t, out) {
	return mixPreparedPaintPigment(ar, ag, ab, preparePaintPigment(br, bg, bb), t, out);
}

export function preparePaintPigment(r, g, b) { return {r, g, b, pigment:null, y:0, dr:0, dg:0, db:0}; }
export function mixPreparedPaintPigment(ar, ag, ab, incoming, t, out) {
	const {r:br, g:bg, b:bb} = incoming;
	t = clamp(t);
	if (t === 0 || Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb) < 1e-7) { out[0] = ar; out[1] = ag; out[2] = ab; return out; }
	if (t === 1) { out[0] = br; out[1] = bg; out[2] = bb; return out; }
	const qr = Math.round(clamp(ar) * GRID), qg = Math.round(clamp(ag) * GRID), qb = Math.round(clamp(ab) * GRID);
	const a = paintPigmentCell(qr, qg, qb);
	if (!incoming.pigment) {
		incoming.pigment = paintPigment(br, bg, bb);
		incoming.y = Math.max(.0001, .2126 * br + .7152 * bg + .0722 * bb);
		incoming.dr = br - Math.round(clamp(br) * GRID) / GRID;
		incoming.dg = bg - Math.round(clamp(bg) * GRID) / GRID;
		incoming.db = bb - Math.round(clamp(bb) * GRID) / GRID;
	}
	const b = incoming.pigment, ya = Math.max(.0001, .2126 * ar + .7152 * ag + .0722 * ab), yb = incoming.y;
	const concentration = yb * t / (ya * (1 - t) + yb * t), u = 1 - concentration;
	for (let i = 0; i < PAINT_PIGMENT_CHANNELS; i++) mixed[i] = a[i] * u + b[i] * concentration;
	paintPigmentRGB(mixed, out);
	out[0] = clamp(out[0] + (ar - qr / GRID) * u + incoming.dr * concentration);
	out[1] = clamp(out[1] + (ag - qg / GRID) * u + incoming.dg * concentration);
	out[2] = clamp(out[2] + (ab - qb / GRID) * u + incoming.db * concentration);
	return out;
}

export function mixPaintHex(a, b, t, pigment = true) {
	const rgb = hex => [1, 3, 5].map(i => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));
	const left = rgb(a), right = rgb(b), out = [0, 0, 0];
	if (pigment) mixPaintPigment(...left, ...right, t, out);
	else for (let i = 0; i < 3; i++) out[i] = left[i] * (1 - t) + right[i] * t;
	return '#' + out.map(c => Math.round(Math.pow(clamp(c), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
}
