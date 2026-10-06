// SPDX-License-Identifier: AGPL-3.0-only
// The type a letter set's text is typed in. A letter set draws its capitals as paths at the set's own advances, so the
// textarea under them (transparent, only its caret and selection show) needs every character to take the very same
// advance the drawn letter takes: one tiny TrueType font with no outlines, a glyph per character whose advance is the
// planner's advance (draw/text.mjs letterInputAdvances), the em a thousand units, the ascent and descent the planner's
// (1 and .1 em) so a line's baseline stands where the drawn capitals' does. Built in memory, handed to the browser's
// FontFace as bytes, never stored and never shown.

const be16 = (view, at, n) => view.setUint16(at, n & 0xffff);
const be32 = (view, at, n) => view.setUint32(at, n >>> 0);

function checksum(bytes) {
	let sum = 0;
	for (let i = 0; i < bytes.length; i += 4) sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
	return sum;
}

const utf16 = text => { const out = new Uint8Array(text.length * 2); for (let i = 0; i < text.length; i++) { out[i * 2] = text.charCodeAt(i) >> 8; out[i * 2 + 1] = text.charCodeAt(i) & 255; } return out; };

// `advances`: a Map of code point (BMP) to its advance in thousandths of the em. `name`: the family. Returns the font's bytes.
export function advanceFontBytes(advances, name) {
	const points = [...advances.keys()].filter(cp => cp > 0 && cp < 0xffff).sort((a, b) => a - b);
	const glyphs = points.length + 1;
	const table = (size, fill) => { const bytes = new Uint8Array(size); fill(new DataView(bytes.buffer), bytes); return bytes; };
	const widths = [500, ...points.map(cp => Math.max(0, Math.min(65535, Math.round(advances.get(cp)))))];
	const head = table(54, v => { be32(v, 0, 0x00010000); be32(v, 4, 0x00010000); be32(v, 12, 0x5f0f3cf5); be16(v, 18, 1000); be16(v, 44, 8); be16(v, 46, 2); });
	const hhea = table(36, v => { be32(v, 0, 0x00010000); be16(v, 4, 1000); be16(v, 6, -100); be16(v, 10, Math.max(...widths)); be16(v, 18, 1); be16(v, 34, glyphs); });
	const maxp = table(32, v => { be32(v, 0, 0x00010000); be16(v, 4, glyphs); be16(v, 14, 1); });
	const hmtx = table(glyphs * 4, v => widths.forEach((w, i) => be16(v, i * 4, w)));
	const loca = table((glyphs + 1) * 2, () => {});
	const glyf = new Uint8Array(4);
	const segments = points.length + 1;
	const cmap = table(12 + 16 + segments * 8, v => {
		be16(v, 2, 1); be16(v, 4, 3); be16(v, 6, 1); be32(v, 8, 12);
		const f = 12; be16(v, f, 4); be16(v, f + 2, 16 + segments * 8); be16(v, f + 6, segments * 2);
		let power = 1, log = 0; while (power * 2 <= segments) { power *= 2; log++; }
		be16(v, f + 8, power * 2); be16(v, f + 10, log); be16(v, f + 12, segments * 2 - power * 2);
		const ends = f + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
		points.forEach((cp, i) => { be16(v, ends + i * 2, cp); be16(v, starts + i * 2, cp); be16(v, deltas + i * 2, i + 1 - cp); });
		be16(v, ends + points.length * 2, 0xffff); be16(v, starts + points.length * 2, 0xffff); be16(v, deltas + points.length * 2, 1);
		void ranges;
	});
	const strings = [[1, name], [2, 'Regular'], [4, name], [6, name]].map(([id, text]) => [id, utf16(text)]);
	const stringBytes = strings.reduce((sum, [, b]) => sum + b.length, 0);
	const names = table(6 + strings.length * 12 + stringBytes, (v, bytes) => {
		be16(v, 2, strings.length); be16(v, 4, 6 + strings.length * 12);
		let at = 0;
		strings.forEach(([id, b], i) => { const r = 6 + i * 12; be16(v, r, 3); be16(v, r + 2, 1); be16(v, r + 4, 0x409); be16(v, r + 6, id); be16(v, r + 8, b.length); be16(v, r + 10, at); bytes.set(b, 6 + strings.length * 12 + at); at += b.length; });
	});
	const os2 = table(78, v => {
		be16(v, 2, 500); be16(v, 4, 400); be16(v, 6, 5); be16(v, 62, 0x40); be16(v, 64, 0x20); be16(v, 66, 0xffff);
		be16(v, 68, 1000); be16(v, 70, -100); be16(v, 74, 1000); be16(v, 76, 100);
	});
	const post = table(32, v => { be32(v, 0, 0x00030000); be16(v, 8, -75); be16(v, 10, 50); });
	const tables = [['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', loca], ['maxp', maxp], ['name', names], ['post', post]];
	const header = 12 + tables.length * 16;
	let size = header; for (const [, t] of tables) size += (t.length + 3) & ~3;
	const out = new Uint8Array(size), view = new DataView(out.buffer);
	be32(view, 0, 0x00010000); be16(view, 4, tables.length);
	let power = 1, log = 0; while (power * 2 <= tables.length) { power *= 2; log++; }
	be16(view, 6, power * 16); be16(view, 8, log); be16(view, 10, tables.length * 16 - power * 16);
	let at = header, headAt = 0;
	tables.forEach(([tag, bytes], i) => {
		for (let k = 0; k < 4; k++) out[12 + i * 16 + k] = tag.charCodeAt(k);
		be32(view, 12 + i * 16 + 4, checksum(bytes)); be32(view, 12 + i * 16 + 8, at); be32(view, 12 + i * 16 + 12, bytes.length);
		out.set(bytes, at); if (tag === 'head') headAt = at;
		at += (bytes.length + 3) & ~3;
	});
	be32(view, headAt + 8, (0xb1b0afba - checksum(out)) >>> 0);
	return out;
}
