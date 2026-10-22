// SPDX-License-Identifier: AGPL-3.0-only
const ascii = (bytes, at, text) => [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
const u32 = (bytes, at) => (bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0;
const le32 = (bytes, at) => (bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24) >>> 0;

function jpegProfile(bytes) {
	const parts = new Map();
	let count = 0;
	for (let at = 2; at + 4 <= bytes.length && bytes[at] === 0xFF;) {
		const marker = bytes[at + 1];
		if (marker === 0xDA || marker === 0xD9) break;
		if (marker === 0xFF) { at++; continue; }
		if (marker >= 0xD0 && marker <= 0xD8 || marker === 0x01) { at += 2; continue; }
		const length = bytes[at + 2] << 8 | bytes[at + 3];
		if (marker === 0xE2 && ascii(bytes, at + 4, 'ICC_PROFILE\0') && length >= 16) {
			const index = bytes[at + 16], total = bytes[at + 17];
			if (!index || !total || (count && total !== count) || parts.has(index)) return null;
			count = total; parts.set(index, bytes.subarray(at + 18, at + 2 + length));
		}
		at += 2 + length;
	}
	if (!count || parts.size !== count) return null;
	const out = new Uint8Array([...parts.values()].reduce((sum, part) => sum + part.length, 0));
	let to = 0;
	for (let i = 1; i <= count; i++) { if (!parts.has(i)) return null; out.set(parts.get(i), to); to += parts.get(i).length; }
	return out;
}

function webpProfile(bytes) {
	if (!ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBPVP8X') || !(bytes[20] & 32)) return null;
	for (let at = 12; at + 8 <= bytes.length;) {
		const size = le32(bytes, at + 4);
		if (ascii(bytes, at, 'ICCP')) return at + 8 + size <= bytes.length ? bytes.slice(at + 8, at + 8 + size) : null;
		at += 8 + size + (size & 1);
	}
	return null;
}

function* boxes(bytes, at, end) {
	while (at + 8 <= end) {
		let size = u32(bytes, at), head = 8;
		if (size === 1) { if (u32(bytes, at + 8)) return; size = u32(bytes, at + 12); head = 16; } else if (size === 0) size = end - at;
		if (size < head || at + size > end) return;
		yield [String.fromCharCode(...bytes.subarray(at + 4, at + 8)), at + head, at + size];
		at += size;
	}
}

function avifProfile(bytes) {
	if (!ascii(bytes, 4, 'ftyp')) return null;
	const found = [];
	for (const [type, from, to] of boxes(bytes, 0, bytes.length)) if (type === 'meta')
		for (const [inner, innerFrom, innerTo] of boxes(bytes, from + 4, to)) if (inner === 'iprp')
			for (const [leaf, leafFrom, leafTo] of boxes(bytes, innerFrom, innerTo)) if (leaf === 'ipco')
				for (const [prop, propFrom, propTo] of boxes(bytes, leafFrom, leafTo)) if (prop === 'colr') found.push([propFrom, propTo]);
	const profiles = found.filter(([from]) => ascii(bytes, from, 'prof') || ascii(bytes, from, 'rICC'));
	return profiles.length === 1 ? bytes.slice(profiles[0][0] + 4, profiles[0][1]) : null;
}

function curveOf(icc, offset, length) {
	const view = new DataView(icc.buffer, icc.byteOffset + offset, length), type = String.fromCharCode(...icc.subarray(offset, offset + 4));
	if (type === 'curv') {
		const count = view.getUint32(8);
		if (count === 0) return x => x;
		if (count === 1) { const gamma = view.getUint16(12) / 256; return x => x ** gamma; }
		return x => { const at = x * (count - 1), i = Math.min(count - 2, Math.floor(at)), a = view.getUint16(12 + i * 2) / 65535, b = view.getUint16(14 + i * 2) / 65535; return a + (b - a) * (at - i); };
	}
	if (type === 'para') {
		const kind = view.getUint16(8), p = Array.from({length: [1, 3, 4, 5, 7][kind] ?? 0}, (_, i) => view.getInt32(12 + i * 4) / 65536), [g, a, b, c, d, e, f] = p;
		if (kind === 0) return x => x ** g;
		if (kind === 1) return x => x >= -b / a ? (a * x + b) ** g : 0;
		if (kind === 2) return x => x >= -b / a ? (a * x + b) ** g + c : c;
		if (kind === 3) return x => x >= d ? (a * x + b) ** g : c * x;
		if (kind === 4) return x => x >= d ? (a * x + b) ** g + e : c * x + f;
	}
	return null;
}

const SRGB_D50 = [0.4360, 0.2225, 0.0139, 0.3851, 0.7169, 0.0971, 0.1431, 0.0606, 0.7141];
const srgbCurve = x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

export function isSrgbProfile(icc) {
	try {
		if (String.fromCharCode(...icc.subarray(16, 20)) !== 'RGB ') return false;
		const view = new DataView(icc.buffer, icc.byteOffset, icc.length), tags = new Map();
		for (let i = 0, count = view.getUint32(128); i < count; i++) tags.set(String.fromCharCode(...icc.subarray(132 + i * 12, 136 + i * 12)), [view.getUint32(136 + i * 12), view.getUint32(140 + i * 12)]);
		const colorants = ['rXYZ', 'gXYZ', 'bXYZ'].flatMap(name => { const [at] = tags.get(name); return [8, 12, 16].map(o => view.getInt32(at + o) / 65536); });
		if (colorants.some((value, at) => Math.abs(value - SRGB_D50[at]) > 0.002)) return false;
		return ['rTRC', 'gTRC', 'bTRC'].every(name => {
			const curve = curveOf(icc, ...tags.get(name));
			return curve && [0.02, 0.1, 0.25, 0.5, 0.75, 1].every(x => Math.abs(curve(x) - srgbCurve(x)) <= 0.002);
		});
	} catch (_) { return false; }
}

export function embeddedProfile(bytes) {
	const icc = (bytes[0] === 0xFF && bytes[1] === 0xD8 ? jpegProfile : bytes[0] === 0x52 ? webpProfile : avifProfile)(bytes);
	if (!icc || icc.length < 132 || u32(icc, 0) !== icc.length) return null;
	const space = String.fromCharCode(...icc.subarray(16, 20));
	return space === 'GRAY' || space === 'RGB ' && !isSrgbProfile(icc) ? icc : null;
}
