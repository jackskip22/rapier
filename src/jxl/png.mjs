// SPDX-License-Identifier: AGPL-3.0-only
import {crc32} from '../images/crc32.mjs';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PASSES = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
const CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4};
const DEPTHS = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
const SPACES = {1: 'srgb', 9: 'rec2020', 12: 'display-p3'}, TRANSFERS = {8: 'linear', 13: 'srgb', 16: 'pq', 18: 'hlg'};
const cannot = {};

export const isPng = bytes => bytes.length >= 8 && SIGNATURE.every((value, at) => bytes[at] === value);

function inflater(parts, expected) {
	const stream = new ReadableStream({start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); }}).pipeThrough(new DecompressionStream('deflate'));
	const reader = stream.getReader();
	let chunk = new Uint8Array(0), at = 0, total = 0;
	return {
		async fill(row) {
			for (let filled = 0; filled < row.length;) {
				if (at === chunk.length) {
					const {value, done} = await reader.read();
					if (done || (total += value.length) > expected) throw cannot;
					chunk = value; at = 0;
				}
				const take = Math.min(row.length - filled, chunk.length - at);
				row.set(chunk.subarray(at, at + take), filled); filled += take; at += take;
			}
		},
		async end() {
			if (at !== chunk.length || total !== expected || !(await reader.read()).done) throw cannot;
			reader.releaseLock();
		},
		cancel: () => reader.cancel().catch(() => {}),
	};
}

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

function unfilter(row, above, step) {
	const filter = row[0];
	if (filter > 4) throw cannot;
	if (filter === 0) return;
	for (let i = 1; i < row.length; i++) {
		const a = i > step ? row[i - step] : 0, b = above ? above[i] : 0, c = i > step && above ? above[i - step] : 0;
		row[i] += filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
	}
}

function chunksOf(bytes, limit) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks = new Map(), packed = [];
	let at = 8, seenData = false, endedData = false, ended = false;
	while (at + 12 <= bytes.length) {
		const length = view.getUint32(at), end = at + 12 + length;
		if (length > 0x7fffffff || end > bytes.length) throw cannot;
		const nameBytes = bytes.subarray(at + 4, at + 8), name = String.fromCharCode(...nameBytes);
		if (crc32(bytes.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) throw cannot;
		const part = bytes.subarray(at + 8, end - 4);
		if (at === 8 && name !== 'IHDR') throw cannot;
		if (seenData && name !== 'IDAT') endedData = true;
		if (name === 'IDAT') { if (endedData) throw cannot; seenData = true; packed.push(part); }
		else if (name === 'IEND') { if (length || !seenData) throw cannot; ended = true; break; }
		else if (name === 'acTL' || name === 'fcTL' || name === 'fdAT') throw cannot;
		else if (!/^[A-Za-z]{4}$/.test(name) || (!(nameBytes[0] & 32) && !['IHDR', 'PLTE'].includes(name))) throw cannot;
		else if (!chunks.has(name) || name === 'IDAT') chunks.set(name, part);
		at = end;
	}
	if (!ended) throw cannot;
	const header = chunks.get('IHDR');
	if (!header || header.length !== 13) throw cannot;
	const hv = new DataView(header.buffer, header.byteOffset, 13), width = hv.getUint32(0), height = hv.getUint32(4);
	const depth = header[8], type = header[9], interlace = header[12];
	if (!width || !height || width * height > limit || !DEPTHS[type]?.includes(depth) || header[10] || header[11] || interlace > 1) throw cannot;
	return {chunks, packed, width, height, depth, type, interlace};
}

const CHROMA_SRGB = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
const CHROMA_NAMED = {'display-p3': [31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000], rec2020: [31270, 32900, 70800, 29200, 17000, 79700, 13100, 4600]};

async function inflateAll(part, limit) {
	const reader = new ReadableStream({start(controller) { controller.enqueue(part); controller.close(); }}).pipeThrough(new DecompressionStream('deflate')).getReader();
	const out = [];
	let size = 0;
	for (;;) {
		const {value, done} = await reader.read();
		if (done) break;
		if ((size += value.length) > limit) { await reader.cancel().catch(() => {}); throw cannot; }
		out.push(value);
	}
	const bytes = new Uint8Array(size);
	for (let at = 0, i = 0; i < out.length; at += out[i++].length) bytes.set(out[i], at);
	return bytes;
}

const fixed = (view, at, value) => view.setInt32(at, Math.round(value * 65536));
const tag = (name, body) => ({name, body});
const xyzBody = ([x, y, z]) => { const body = new Uint8Array(20), view = new DataView(body.buffer); body.set([88, 89, 90, 32]); fixed(view, 8, x); fixed(view, 12, y); fixed(view, 16, z); return body; };
const textBody = text => { const body = new Uint8Array(28 + text.length * 2), view = new DataView(body.buffer); body.set([109, 108, 117, 99]); view.setUint32(8, 1); view.setUint32(12, 12); body.set([101, 110, 85, 83], 16); view.setUint32(20, text.length * 2); view.setUint32(24, 28); for (let i = 0; i < text.length; i++) view.setUint16(28 + i * 2, text.charCodeAt(i)); return body; };
const curveBody = exponent => { const body = new Uint8Array(16), view = new DataView(body.buffer); body.set([112, 97, 114, 97]); fixed(view, 12, exponent); return body; };
const multiply = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
const invert = m => {
	const [a, b, c, d, e, f, g, h, i] = m, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
	return [(e * i - f * h), (c * h - b * i), (b * f - c * e), (f * g - d * i), (a * i - c * g), (c * d - a * f), (d * h - e * g), (b * g - a * h), (a * e - b * d)].map(value => value / det);
};
const D50 = [0.9642, 1, 0.8249];
const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const product = (a, b) => [0, 1, 2].flatMap(row => [0, 1, 2].map(col => a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]));
function adapt(white) {
	const from = multiply(BRADFORD, white), to = multiply(BRADFORD, D50);
	return product(invert(BRADFORD), product([to[0] / from[0], 0, 0, 0, to[1] / from[1], 0, 0, 0, to[2] / from[2]], BRADFORD));
}

function profileFor(exponent, chroma, gray) {
	const [wx, wy, rx, ry, gx, gy, bx, by] = (chroma || CHROMA_SRGB).map(value => value / 100000);
	const tags = [tag('desc', textBody(gray ? 'PNG gray, gamma ' + (1 / exponent).toFixed(4) : 'PNG gamma ' + (1 / exponent).toFixed(4))), tag('cprt', textBody('No copyright, use freely')), tag('wtpt', xyzBody(D50))];
	const curve = curveBody(exponent);
	if (gray) tags.push(tag('kTRC', curve));
	else {
		const white = [wx / wy, 1, (1 - wx - wy) / wy], primaries = [[rx, ry], [gx, gy], [bx, by]].map(([x, y]) => [x / y, 1, (1 - x - y) / y]);
		const basis = [0, 1, 2].flatMap(row => primaries.map(p => p[row])), weights = multiply(invert(basis), white), adaptation = adapt(white);
		const colorants = primaries.map((p, at) => multiply(adaptation, p.map(value => value * weights[at])));
		tags.push(tag('rXYZ', xyzBody(colorants[0])), tag('gXYZ', xyzBody(colorants[1])), tag('bXYZ', xyzBody(colorants[2])));
		for (const name of ['rTRC', 'gTRC', 'bTRC']) tags.push(tag(name, curve));
	}
	const table = 4 + tags.length * 12, shared = new Map();
	let size = 128 + table;
	for (const t of tags) { if (!shared.has(t.body)) { shared.set(t.body, size); size += t.body.length + (-t.body.length & 3); } }
	const out = new Uint8Array(size), view = new DataView(out.buffer);
	view.setUint32(0, size); view.setUint32(8, 0x04300000); out.set([109, 110, 116, 114], 12); out.set(gray ? [71, 82, 65, 89] : [82, 71, 66, 32], 16); out.set([88, 89, 90, 32], 20);
	view.setUint16(24, 2026); view.setUint16(26, 1); view.setUint16(28, 1); out.set([97, 99, 115, 112], 36);
	fixed(view, 68, D50[0]); fixed(view, 72, D50[1]); fixed(view, 76, D50[2]);
	view.setUint32(128, tags.length);
	tags.forEach((t, at) => { out.set([...t.name].map(c => c.charCodeAt(0)), 132 + at * 12); view.setUint32(136 + at * 12, shared.get(t.body)); view.setUint32(140 + at * 12, t.body.length); });
	for (const [body, offset] of shared) out.set(body, offset);
	return out;
}

const near = (values, wanted, slack) => values.every((value, at) => Math.abs(value - wanted[at]) <= slack);

async function colorOf(chunks, gray) {
	const cicp = chunks.get('cICP');
	if (cicp) {
		if (cicp.length !== 4 || !SPACES[cicp[0]] || !TRANSFERS[cicp[1]] || cicp[2] !== 0 || cicp[3] !== 1) return null;
		return cicp[0] === 1 && cicp[1] === 13 ? {} : {colorSpace: SPACES[cicp[0]], transferFunction: TRANSFERS[cicp[1]]};
	}
	const packed = chunks.get('iCCP');
	if (packed) {
		const end = packed.indexOf(0);
		if (end < 1 || end > 79 || end + 2 >= packed.length || packed[end + 1] !== 0) return null;
		const icc = await inflateAll(packed.subarray(end + 2), 64 * 1024 * 1024).catch(() => null);
		if (!icc || icc.length < 132 || new DataView(icc.buffer, icc.byteOffset).getUint32(0) !== icc.length) return null;
		const space = String.fromCharCode(...icc.subarray(16, 20));
		if (space !== (gray ? 'GRAY' : 'RGB ')) return null;
		return {icc};
	}
	if (chunks.has('sRGB')) return {};
	const gamma = chunks.get('gAMA'), chroma = chunks.get('cHRM');
	if (gamma && gamma.length !== 4 || chroma && chroma.length !== 32) return null;
	const value = gamma ? new DataView(gamma.buffer, gamma.byteOffset, 4).getUint32(0) : 45455;
	const points = chroma ? Array.from({length: 8}, (_, at) => new DataView(chroma.buffer, chroma.byteOffset, 32).getUint32(at * 4)) : CHROMA_SRGB;
	const named = Object.keys(CHROMA_NAMED).find(name => near(points, CHROMA_NAMED[name], 100));
	const plain = near(points, CHROMA_SRGB, 1000), srgbLike = Math.abs(value - 45455) <= 1000, linear = value === 100000;
	if (plain && srgbLike) return {};
	if (!gray && (linear || srgbLike)) {
		const space = plain ? 'srgb' : named;
		if (space && space !== 'srgb') return {colorSpace: space, transferFunction: linear ? 'linear' : 'srgb'};
		if (plain && linear) return {transferFunction: 'linear'};
	}
	const exponent = 100000 / value;
	if (!(value > 0) || exponent < 0.05 || exponent > 20 || points.some(v => v > 2e5)) return null;
	if (!gray && chroma && points.slice(0, 2).some(v => !v)) return null;
	return {icc: profileFor(exponent, chroma && !gray ? points : null, gray)};
}

export async function readPng(bytes, limit = 24_000_000, {colorsOnly = false} = {}) {
	if (!isPng(bytes) || typeof DecompressionStream !== 'function') return null;
	try {
		const {chunks, packed, width, height, depth, type, interlace} = chunksOf(bytes, Infinity);
		if (width * height > limit) throw Object.assign(new Error('Over ' + limit / 1e6 + ' megapixels.'), {shown: true});
		const color = await colorOf(chunks, type === 0 || type === 4);
		if (!color) return {browser: true, depth};
		if (colorsOnly) return {width, height, options: color, depth};
		const channels = CHANNELS[type], bits = channels * depth, step = Math.max(1, bits >> 3), wide = depth === 16;
		const passes = interlace ? PASSES : [[0, 0, 1, 1]], sizes = [];
		let expected = 0;
		for (const [x, y, dx, dy] of passes) {
			const w = Math.ceil((width - x) / dx), h = Math.ceil((height - y) / dy);
			sizes.push([Math.max(0, w), Math.max(0, h), Math.ceil(Math.max(0, w) * bits / 8)]);
			if (w > 0 && h > 0) expected += h * (1 + Math.ceil(w * bits / 8));
		}
		const palette = chunks.get('PLTE'), key = chunks.get('tRNS');
		if (type === 3 && (!palette || palette.length % 3 || palette.length > 3 << depth)) throw cannot;
		if (type === 3 && key && key.length > palette.length / 3) throw cannot;
		if ((type === 0 && key && key.length !== 2) || (type === 2 && key && key.length !== 6) || ((type === 4 || type === 6) && key)) throw cannot;
		const rows = inflater(packed, expected), data = wide ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
		const keys = key && type < 3 ? Array.from({length: key.length / 2}, (_, at) => key[at * 2] << 8 | key[at * 2 + 1]) : null;
		const max = (1 << depth) - 1, spread = wide || depth === 8 ? 1 : 255 / max, mask = max;
		try {
			for (const [pass, [startX, startY, dx, dy]] of passes.entries()) {
				const [w, h, rowBytes] = sizes[pass];
				if (!w || !h) continue;
				let raw = new Uint8Array(1 + rowBytes), above = null;
				for (let y = 0; y < h; y++) {
					await rows.fill(raw);
					unfilter(raw, above, step);
					const at = 1, base = (startY + y * dy) * width + startX;
					for (let x = 0; x < w; x++) {
						const to = (base + x * dx) * 4;
						let r, g, b, a = wide ? 65535 : 255;
						if (type === 3 || type === 0 && depth < 8) {
							const v = depth === 8 ? raw[at + x] : (raw[at + (x * depth >> 3)] >> (8 - depth - (x * depth & 7))) & mask;
							if (type === 3) {
								r = palette[v * 3]; g = palette[v * 3 + 1]; b = palette[v * 3 + 2]; if (key && v < key.length) a = key[v];
							} else { r = g = b = v * spread; if (keys && v === keys[0]) a = 0; }
						} else if (wide) {
							const o = at + x * channels * 2;
							r = raw[o] << 8 | raw[o + 1];
							if (channels < 3) { g = b = r; if (channels === 2) a = raw[o + 2] << 8 | raw[o + 3]; else if (keys && r === keys[0]) a = 0; }
							else {
								g = raw[o + 2] << 8 | raw[o + 3]; b = raw[o + 4] << 8 | raw[o + 5];
								if (channels === 4) a = raw[o + 6] << 8 | raw[o + 7]; else if (keys && r === keys[0] && g === keys[1] && b === keys[2]) a = 0;
							}
						} else {
							const o = at + x * channels;
							r = raw[o];
							if (channels < 3) { g = b = r; if (channels === 2) a = raw[o + 1]; else if (keys && r === keys[0]) a = 0; }
							else { g = raw[o + 1]; b = raw[o + 2]; if (channels === 4) a = raw[o + 3]; else if (keys && r === keys[0] && g === keys[1] && b === keys[2]) a = 0; }
						}
						data[to] = r; data[to + 1] = g; data[to + 2] = b; data[to + 3] = a;
					}
					[raw, above] = [above || new Uint8Array(1 + rowBytes), raw];
				}
			}
			await rows.end();
		} catch (error) { await rows.cancel(); throw error; }
		return {width, height, data, bitDepth: wide ? 16 : 8, options: color};
	} catch (error) { if (error?.shown || error instanceof RangeError) throw error; return null; }
}
