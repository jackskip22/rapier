// SPDX-License-Identifier: AGPL-3.0-only
import {FontReader, fontError, fontTables, writeSfnt} from './font-format.mjs';

function access(bytes) {
	const reader = new FontReader(bytes), view = reader.view;
	return {reader, u16: at => view.getUint16(reader.range(at, 2)), s16: at => view.getInt16(reader.range(at, 2)), u32: at => view.getUint32(reader.range(at, 4))};
}
export function fontCharacterMap(bytes, glyphCount) {
	const {reader, u16, s16, u32} = access(bytes);
	if (u16(0) || !u16(2) || u16(2) > 256) fontError('The font character map is invalid.');
	reader.range(4, u16(2) * 8); const mappings = [], variations = [];
	for (let i = 0; i < u16(2); i++) {
		const row = 4 + i * 8, platform = u16(row), encoding = u16(row + 2), at = u32(row + 4), kind = u16(at);
		if (platform === 0 && encoding === 5 && kind === 14) {
			const length = u32(at + 2), count = u32(at + 6); reader.range(at, length);
			if (length < 10 || count > 256 || 10 + count * 11 > length) fontError('The font variation character map is invalid.');
			for (let j = 0; j < count; j++) {
				const atRow = at + 10 + j * 11, selector = bytes[atRow] * 65536 + bytes[atRow + 1] * 256 + bytes[atRow + 2], defaultOffset = u32(atRow + 3), alternateOffset = u32(atRow + 7);
				const defaults = [], alternates = [];
				if (defaultOffset) {
					if (defaultOffset + 4 > length) fontError('The variation character map is truncated.');
					const start = at + defaultOffset, ranges = u32(start); if (defaultOffset + 4 + ranges * 4 > length) fontError('The variation character map is truncated.');
					for (let k = 0; k < ranges; k++) { const position = start + 4 + k * 4, first = bytes[position] * 65536 + bytes[position + 1] * 256 + bytes[position + 2], end = first + bytes[position + 3]; if (end > 0x10ffff || defaults.length && first <= defaults.at(-1)[1]) fontError('The variation character map is invalid.'); defaults.push([first, end]); }
				}
				if (alternateOffset) {
					if (alternateOffset + 4 > length) fontError('The variation character map is truncated.');
					const start = at + alternateOffset, count = u32(start); if (alternateOffset + 4 + count * 5 > length) fontError('The variation character map is truncated.');
					for (let k = 0; k < count; k++) { const position = start + 4 + k * 5, code = bytes[position] * 65536 + bytes[position + 1] * 256 + bytes[position + 2], glyph = u16(position + 3); if (code > 0x10ffff || glyph >= glyphCount || alternates.length && code <= alternates.at(-1)[0]) fontError('The variation character map is invalid.'); alternates.push([code, glyph]); }
				}
				if (variations.length && selector <= variations.at(-1).selector) fontError('The variation selectors are invalid.');
				variations.push({selector, defaults, alternates});
			}
			continue;
		}
		if (platform !== 0 && !(platform === 3 && [0, 1, 10].includes(encoding))) continue;
		let lookup, intervals, priority = 0;
		if (kind === 12 || kind === 13) {
			const length = u32(at + 4), groups = u32(at + 12); reader.range(at, length);
			if (u16(at + 2) || length < 16 || groups > 0x110000 || groups * 12 > length - 16) fontError('The font character ranges are invalid.');
			let prior = -1; intervals = [];
			for (let j = 0; j < groups; j++) { const p = at + 16 + j * 12, start = u32(p), end = u32(p + 4), first = u32(p + 8); if (start <= prior || end < start || end > 0x10ffff || first + (kind === 12 ? end - start : 0) >= glyphCount) fontError('The font character ranges are invalid.'); prior = end; intervals.push([start, end]); }
			lookup = code => { let low = 0, high = groups - 1; while (low <= high) { const mid = (low + high) >> 1, p = at + 16 + mid * 12, start = u32(p), end = u32(p + 4); if (code < start) high = mid - 1; else if (code > end) low = mid + 1; else return u32(p + 8) + (kind === 12 ? code - start : 0); } return 0; }; priority = 50;
		} else if (kind === 4) {
			const length = u16(at + 2), count = u16(at + 6) / 2; reader.range(at, length);
			if (!Number.isInteger(count) || !count || length < 16 + count * 8) fontError('The font character segments are invalid.');
			const ends = at + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, ranges = deltas + count * 2;
			let prior = -1; intervals = [];
			for (let j = 0; j < count; j++) { const start = u16(starts + j * 2), end = u16(ends + j * 2), range = u16(ranges + j * 2), glyphAt = ranges + j * 2 + range; if (start <= prior || end < start || range % 2 || range && (glyphAt < ranges + count * 2 || glyphAt + (end - start + 1) * 2 > at + length)) fontError('The font character segments are invalid.'); prior = end; intervals.push([start, end]); }
			if (prior !== 65535) fontError('The font character map has no terminal segment.');
			lookup = code => { if (code > 65535) return 0; let low = 0, high = count - 1; while (low <= high) { const mid = (low + high) >> 1, start = u16(starts + mid * 2), end = u16(ends + mid * 2); if (code < start) high = mid - 1; else if (code > end) low = mid + 1; else { const range = u16(ranges + mid * 2), raw = range ? u16(ranges + mid * 2 + range + (code - start) * 2) : code, glyph = !range || raw ? (raw + s16(deltas + mid * 2)) & 65535 : 0; if (glyph >= glyphCount) fontError('A font character refers to a missing glyph.'); return glyph; } } return 0; }; priority = 40;
		} else if (kind === 6 || kind === 10) {
			const wide = kind === 10, length = wide ? u32(at + 4) : u16(at + 2), start = wide ? u32(at + 12) : u16(at + 6), count = wide ? u32(at + 16) : u16(at + 8), data = at + (wide ? 20 : 10); reader.range(at, length);
			if (data + count * 2 > at + length || start + count > 0x110000) fontError('The trimmed character map is invalid.');
			for (let j = 0; j < count; j++) if (u16(data + j * 2) >= glyphCount) fontError('A font character refers to a missing glyph.');
			lookup = code => code >= start && code < start + count ? u16(data + (code - start) * 2) : 0; intervals = [[start, start + count - 1]]; priority = wide ? 45 : 30;
		} else if (kind === 0) {
			if (u16(at + 2) < 262) fontError('The byte character map is invalid.'); reader.range(at, 262);
			for (let j = 0; j < 256; j++) if (bytes[at + 6 + j] >= glyphCount) fontError('A font character refers to a missing glyph.');
			lookup = code => code < 256 ? bytes[at + 6 + code] : 0; intervals = [[0, 255]]; priority = 20;
		}
		if (lookup) mappings.push({lookup, intervals, priority: priority + (platform === 0 ? 2 : encoding === 10 ? 1 : 0), symbol: platform === 3 && encoding === 0});
	}
	if (!mappings.length) fontError('Choose a font with a readable Unicode character map.');
	mappings.sort((a, b) => b.priority - a.priority); const primary = mappings[0];
	return {glyph: code => primary.lookup(code) || (primary.symbol && code < 256 ? primary.lookup(code + 0xf000) : 0), variations,
		*codes() { for (const [start, end] of primary.intervals) for (let code = start; code <= end; code++) if (primary.lookup(code)) yield code; }};
}
function shapingCharacters(mapping, text) {
	const codes = new Set(); for (const string of [text, text.normalize('NFC'), text.normalize('NFKD'), ' \u00a0\u25cc']) for (const character of string) codes.add(character.codePointAt(0));
	const mirror = /[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Sm}]/u.test(text);
	for (const code of mapping.codes()) {
		if (codes.has(code)) continue;
		const character = String.fromCodePoint(code), normalized = character.normalize(code >= 0xfb50 && code <= 0xfeff ? 'NFKD' : 'NFD');
		if (normalized !== character && [...normalized].every(part => codes.has(part.codePointAt(0))) || mirror && /[\p{P}\p{S}]/u.test(character)) codes.add(code);
	}
	return codes;
}
function writeCmap(mapping, codes) {
	const pairs = [...codes].sort((a, b) => a - b).map(code => [code, mapping.glyph(code)]).filter(([, glyph]) => glyph), groups = [];
	for (const [code, glyph] of pairs) { const last = groups.at(-1); if (last && code === last[1] + 1 && glyph === last[2] + code - last[0]) last[1] = code; else groups.push([code, code, glyph]); }
	const format12 = new Uint8Array(16 + groups.length * 12), v12 = new DataView(format12.buffer); v12.setUint16(0, 12); v12.setUint32(4, format12.length); v12.setUint32(12, groups.length); groups.forEach((group, i) => group.forEach((value, j) => v12.setUint32(16 + i * 12 + j * 4, value)));
	const bmp = pairs.filter(([code]) => code < 65535), segments = [];
	for (const [code, glyph] of bmp) { const delta = (glyph - code) & 65535, last = segments.at(-1); if (last && code === last[1] + 1 && delta === last[2]) last[1] = code; else segments.push([code, code, delta]); }
	segments.push([65535, 65535, 1]);
	let format4 = null;
	if (16 + segments.length * 8 <= 65535) {
		const count = segments.length, power = 2 ** Math.floor(Math.log2(count)); format4 = new Uint8Array(16 + count * 8); const view = new DataView(format4.buffer);
		view.setUint16(0, 4); view.setUint16(2, format4.length); view.setUint16(6, count * 2); view.setUint16(8, power * 2); view.setUint16(10, Math.log2(power)); view.setUint16(12, count * 2 - power * 2);
		segments.forEach(([start, end, delta], i) => { view.setUint16(14 + i * 2, end); view.setUint16(16 + count * 2 + i * 2, start); view.setUint16(16 + count * 4 + i * 2, delta); });
	}
	const uv = mapping.variations.filter(row => codes.has(row.selector)).map(row => ({selector: row.selector, defaults: row.defaults.flatMap(([start, end]) => [...codes].filter(code => code >= start && code <= end).sort((a, b) => a - b)), alternates: row.alternates.filter(([code]) => codes.has(code))})).filter(row => row.defaults.length || row.alternates.length);
	let format14 = null;
	if (uv.length) {
		const length = 10 + uv.length * 11 + uv.reduce((sum, row) => sum + (row.defaults.length ? 4 + row.defaults.length * 4 : 0) + (row.alternates.length ? 4 + row.alternates.length * 5 : 0), 0); format14 = new Uint8Array(length); const view = new DataView(format14.buffer); view.setUint16(0, 14); view.setUint32(2, length); view.setUint32(6, uv.length);
		const u24 = (at, value) => { format14[at] = value >> 16; format14[at + 1] = value >> 8; format14[at + 2] = value; }; let at = 10 + uv.length * 11;
		uv.forEach((row, i) => { const base = 10 + i * 11; u24(base, row.selector); if (row.defaults.length) { view.setUint32(base + 3, at); view.setUint32(at, row.defaults.length); at += 4; for (const code of row.defaults) { u24(at, code); at += 4; } } if (row.alternates.length) { view.setUint32(base + 7, at); view.setUint32(at, row.alternates.length); at += 4; for (const [code, glyph] of row.alternates) { u24(at, code); view.setUint16(at + 3, glyph); at += 5; } } });
	}
	const parts = [{platform: 0, encoding: 4, bytes: format12}, ...(format14 ? [{platform: 0, encoding: 5, bytes: format14}] : []), ...(format4 ? [{platform: 3, encoding: 1, bytes: format4}] : []), {platform: 3, encoding: 10, bytes: format12}];
	const unique = [...new Set(parts.map(part => part.bytes))], length = 4 + parts.length * 8 + unique.reduce((sum, part) => sum + part.length, 0), bytes = new Uint8Array(length), view = new DataView(bytes.buffer), offsets = new Map(); let at = 4 + parts.length * 8;
	view.setUint16(2, parts.length); for (const part of unique) { offsets.set(part, at); bytes.set(part, at); at += part.length; }
	parts.forEach((part, i) => { const row = 4 + i * 8; view.setUint16(row, part.platform); view.setUint16(row + 2, part.encoding); view.setUint32(row + 4, offsets.get(part.bytes)); });
	return bytes;
}
function substitutionClosure(bytes, count) {
	if (!bytes) return () => {};
	const {reader, u16, s16, u32} = access(bytes), list = u16(8), lookupCount = u16(list); reader.range(list + 2, lookupCount * 2);
	const coverage = at => {
		const format = u16(at), length = u16(at + 2), out = [];
		if (format === 1) { reader.range(at + 4, length * 2); for (let i = 0; i < length; i++) out.push(u16(at + 4 + i * 2)); }
		else if (format === 2) { reader.range(at + 4, length * 6); for (let i = 0; i < length; i++) { const p = at + 4 + i * 6, start = u16(p), end = u16(p + 2), first = u16(p + 4); if (end < start || first !== out.length || end >= count) fontError('The font substitution coverage is invalid.'); for (let glyph = start; glyph <= end; glyph++) out.push(glyph); } }
		else fontError('The font substitution coverage is invalid.');
		if (out.length > count || out.some((glyph, i) => glyph >= count || i && glyph <= out[i - 1])) fontError('The font substitution coverage is invalid.'); return out;
	};
	const operations = [], known = new Set(); let references = 0;
	const visit = (type, at, depth = 0) => {
		const key = type + ':' + at; if (known.has(key)) return; known.add(key);
		if (depth > 8 || type < 1 || type > 8) fontError('The font uses an unknown substitution lookup.');
		const format = u16(at);
		if (type === 7) { if (format !== 1 || u16(at + 2) === 7) fontError('The font extension lookup is invalid.'); visit(u16(at + 2), at + u32(at + 4), depth + 1); return; }
		if (type === 5 || type === 6) { if (format < 1 || format > 3) fontError('The font context lookup is invalid.'); return; }
		const inputs = coverage(at + u16(at + 2)), add = (input, outputs, components = []) => { if (outputs.some(glyph => glyph >= count) || components.some(glyph => glyph >= count)) fontError('The font substitution refers to a missing glyph.'); if ((references += 1 + outputs.length + components.length) > 1048576) fontError('The font has too many substitution references.', 'drawing_font_limit'); operations.push({input, outputs, components}); };
		if (type === 1) {
			if (format === 1) { const delta = s16(at + 4); for (const input of inputs) add(input, [(input + delta) & 65535]); }
			else if (format === 2 && u16(at + 4) === inputs.length) for (let i = 0; i < inputs.length; i++) add(inputs[i], [u16(at + 6 + i * 2)]);
			else fontError('The font single substitution is invalid.');
		} else if (type === 2 || type === 3) {
			if (format !== 1 || u16(at + 4) !== inputs.length) fontError('The font multiple substitution is invalid.');
			for (let i = 0; i < inputs.length; i++) { const set = at + u16(at + 6 + i * 2), n = u16(set), outputs = []; reader.range(set + 2, n * 2); for (let j = 0; j < n; j++) outputs.push(u16(set + 2 + j * 2)); add(inputs[i], outputs); }
		} else if (type === 4) {
			if (format !== 1 || u16(at + 4) !== inputs.length) fontError('The font ligature substitution is invalid.');
			for (let i = 0; i < inputs.length; i++) { const set = at + u16(at + 6 + i * 2), n = u16(set); reader.range(set + 2, n * 2); for (let j = 0; j < n; j++) { const ligature = set + u16(set + 2 + j * 2), glyph = u16(ligature), size = u16(ligature + 2), components = []; if (!size) fontError('The font ligature is empty.'); reader.range(ligature + 4, (size - 1) * 2); for (let k = 1; k < size; k++) components.push(u16(ligature + 2 + k * 2)); add(inputs[i], [glyph], components); } }
		} else if (type === 8) {
			if (format !== 1) fontError('The font reverse substitution is invalid.'); let p = at + 4; const back = u16(p); p += 2 + back * 2; const ahead = u16(p); p += 2 + ahead * 2; if (u16(p) !== inputs.length) fontError('The font reverse substitution is invalid.'); for (let i = 0; i < inputs.length; i++) add(inputs[i], [u16(p + 2 + i * 2)]);
		}
	};
	for (let i = 0; i < lookupCount; i++) { const at = list + u16(list + 2 + i * 2), type = u16(at), n = u16(at + 4); reader.range(at + 6, n * 2); for (let j = 0; j < n; j++) visit(type, at + u16(at + 6 + j * 2)); }
	const waiting = new Map(), processed = new Set();
	for (const operation of operations) {
		const inputs = new Set([operation.input, ...operation.components]); operation.remaining = inputs.size;
		for (const glyph of inputs) { if (!waiting.has(glyph)) waiting.set(glyph, []); waiting.get(glyph).push(operation); }
	}
	return keep => {
		const queue = [...keep].filter(glyph => !processed.has(glyph));
		for (let at = 0; at < queue.length; at++) {
			const glyph = queue[at]; if (processed.has(glyph)) continue; processed.add(glyph);
			for (const operation of waiting.get(glyph) || []) if (!--operation.remaining) for (const output of operation.outputs) if (!keep.has(output)) { keep.add(output); queue.push(output); }
		}
	};
}
function glyphOffsets(tables, count) {
	const head = access(tables.get('head')), loca = access(tables.get('loca')), long = head.s16(50), length = tables.get('glyf').length;
	if (long !== 0 && long !== 1) fontError('The font location format is invalid.');
	loca.reader.range(0, (count + 1) * (long ? 4 : 2)); const offsets = []; let prior = 0;
	for (let i = 0; i <= count; i++) { const at = long ? loca.u32(i * 4) : loca.u16(i * 2) * 2; if (at < prior || at > length) fontError('The font glyph locations are invalid.'); offsets.push(at); prior = at; }
	return offsets;
}
function compoundClosure(tables, keep, count, offsets) {
	const bytes = tables.get('glyf'), {u16, s16} = access(bytes);
	for (const glyph of keep) {
		const start = offsets[glyph], end = offsets[glyph + 1]; if (start === end) continue;
		if (end - start < 10) fontError('The font glyph is truncated.');
		if (s16(start) >= 0) continue;
		let at = start + 10, flags;
		do { if (at + 4 > end) fontError('The font compound glyph is truncated.'); flags = u16(at); const component = u16(at + 2); if (component >= count || component === glyph) fontError('The font has an invalid compound glyph reference.'); keep.add(component); at += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0); if (at > end) fontError('The font compound glyph is truncated.'); } while (flags & 32);
	}
}
function mathClosure(bytes, keep, count) {
	if (!bytes) return;
	const {reader, u16} = access(bytes), variants = u16(8); if (!variants) return;
	const vertical = u16(variants + 6), horizontal = u16(variants + 8); reader.range(variants + 10, (vertical + horizontal) * 2);
	const coverage = at => { if (!at) return []; const format = u16(at), n = u16(at + 2), out = []; if (format === 1) { reader.range(at + 4, n * 2); for (let i = 0; i < n; i++) out.push(u16(at + 4 + i * 2)); } else if (format === 2) { reader.range(at + 4, n * 6); for (let i = 0; i < n; i++) { const start = u16(at + 4 + i * 6), end = u16(at + 6 + i * 6); if (end < start || end >= count || u16(at + 8 + i * 6) !== out.length) fontError('The mathematical font coverage is invalid.'); for (let glyph = start; glyph <= end; glyph++) out.push(glyph); } } else fontError('The mathematical font coverage is invalid.'); if (out.some((glyph, i) => glyph >= count || i && glyph <= out[i - 1])) fontError('The mathematical font coverage is invalid.'); return out; };
	const verticalOffset = u16(variants + 2), horizontalOffset = u16(variants + 4), inputs = [...coverage(verticalOffset ? variants + verticalOffset : 0), ...coverage(horizontalOffset ? variants + horizontalOffset : 0)];
	if (inputs.length !== vertical + horizontal) fontError('The mathematical font variant count is invalid.');
	for (let i = 0; i < inputs.length; i++) if (keep.has(inputs[i])) {
		const at = variants + u16(variants + 10 + i * 2), assembly = u16(at), n = u16(at + 2); reader.range(at + 4, n * 4);
		for (let j = 0; j < n; j++) { const glyph = u16(at + 4 + j * 4); if (glyph >= count) fontError('A mathematical variant refers to a missing glyph.'); keep.add(glyph); }
		if (assembly) { const start = at + assembly, n = u16(start + 4); reader.range(start + 6, n * 10); for (let j = 0; j < n; j++) { const glyph = u16(start + 6 + j * 10); if (glyph >= count) fontError('A mathematical assembly refers to a missing glyph.'); keep.add(glyph); } }
	}
}
function subsetGlyf(tables, keep, count, offsets) {
	const source = tables.get('glyf'), parts = []; let length = 0;
	for (let i = 0; i < count; i++) { const bytes = keep.has(i) ? source.subarray(offsets[i], offsets[i + 1]) : new Uint8Array(); parts.push({at: length, bytes}); length += Math.ceil(bytes.length / 2) * 2; }
	const glyf = new Uint8Array(length), long = length > 131070, loca = new Uint8Array((count + 1) * (long ? 4 : 2)), view = new DataView(loca.buffer);
	parts.forEach(({at, bytes}, i) => { glyf.set(bytes, at); long ? view.setUint32(i * 4, at) : view.setUint16(i * 2, at / 2); }); long ? view.setUint32(count * 4, length) : view.setUint16(count * 2, length / 2);
	const head = tables.get('head').slice(); new DataView(head.buffer).setInt16(50, long ? 1 : 0); tables.set('head', head); tables.set('glyf', glyf); tables.set('loca', loca);
	const sourceGvar = tables.get('gvar'); if (!sourceGvar) return;
	const {reader, u16, u32} = access(sourceGvar), axes = u16(4), tuples = u16(6), tupleAt = u32(8), glyphs = u16(12), flags = u16(14), arrayAt = u32(16);
	if (glyphs !== count || u16(0) !== 1 || u16(2) || flags & ~1) fontError('The glyph variation header is invalid.');
	reader.range(20, (count + 1) * (flags & 1 ? 4 : 2)); reader.range(tupleAt, axes * tuples * 2);
	const ranges = []; let size = 0, prior = 0;
	for (let i = 0; i <= count; i++) { const offset = flags & 1 ? u32(20 + i * 4) : u16(20 + i * 2) * 2; if (offset < prior || arrayAt + offset > sourceGvar.length) fontError('The glyph variation offsets are invalid.'); ranges.push(offset); prior = offset; }
	const partsGvar = [];
	for (let i = 0; i < count; i++) { const bytes = keep.has(i) ? sourceGvar.subarray(arrayAt + ranges[i], arrayAt + ranges[i + 1]) : new Uint8Array(); partsGvar.push({at: size, bytes}); size += Math.ceil(bytes.length / 2) * 2; }
	const wide = size > 131070, tupleStart = 20 + (count + 1) * (wide ? 4 : 2), start = tupleStart + axes * tuples * 2, gvar = new Uint8Array(start + size), gv = new DataView(gvar.buffer); gvar.set(sourceGvar.subarray(0, 20)); gv.setUint32(8, tupleStart); gv.setUint16(14, wide ? 1 : 0); gv.setUint32(16, start); gvar.set(sourceGvar.subarray(tupleAt, tupleAt + axes * tuples * 2), tupleStart);
	partsGvar.forEach(({at, bytes}, i) => { gvar.set(bytes, start + at); wide ? gv.setUint32(20 + i * 4, at) : gv.setUint16(20 + i * 2, at / 2); }); wide ? gv.setUint32(20 + count * 4, size) : gv.setUint16(20 + count * 2, size / 2); tables.set('gvar', gvar);
}
function cffIndex(bytes, at, modern) {
	const {reader, u16, u32} = access(bytes), count = modern ? u32(at) : u16(at), prefix = modern ? 4 : 2;
	if (!count) return {count: 0, end: at + prefix, objects: []};
	if (count > 65535) fontError('The CFF index is too large.');
	const width = bytes[reader.range(at + prefix, 1)]; if (width < 1 || width > 4) fontError('The CFF offset size is invalid.');
	const directory = at + prefix + 1, data = directory + (count + 1) * width; reader.range(directory, (count + 1) * width);
	const offsets = []; let prior = 1;
	for (let i = 0; i <= count; i++) { let value = 0; for (let j = 0; j < width; j++) value = value * 256 + bytes[directory + i * width + j]; if (value < prior || !i && value !== 1) fontError('The CFF index offsets are invalid.'); offsets.push(value); prior = value; }
	reader.range(data, offsets.at(-1) - 1);
	return {count, width, directory, data, end: data + offsets.at(-1) - 1, offsets, objects: offsets.slice(0, -1).map((offset, i) => bytes.subarray(data + offset - 1, data + offsets[i + 1] - 1))};
}
function cffDict(bytes) {
	const reader = new FontReader(bytes), values = new Map(); let stack = [];
	while (reader.at < bytes.length) {
		const code = reader.u8(); let value;
		if (code >= 32 && code <= 246) value = code - 139;
		else if (code >= 247 && code <= 250) value = (code - 247) * 256 + reader.u8() + 108;
		else if (code >= 251 && code <= 254) value = -(code - 251) * 256 - reader.u8() - 108;
		else if (code === 28) value = reader.s16();
		else if (code === 29) value = reader.u32() | 0;
		else if (code === 30) { let done = false; while (!done) { const packed = reader.u8(); done = packed >> 4 === 15 || (packed & 15) === 15; } value = NaN; }
		else { const operator = code === 12 ? 1200 + reader.u8() : code; values.set(operator, stack); stack = []; continue; }
		if (stack.length >= 513) fontError('The CFF dictionary operand stack is invalid.'); stack.push(value);
	}
	return values;
}
function cffData(tables, count, keep) {
	const modern = tables.has('CFF2'), tag = modern ? 'CFF2' : 'CFF ', bytes = tables.get(tag), {reader, u16} = access(bytes); let dict;
	if (modern) { const size = u16(3); reader.range(bytes[2], size); dict = cffDict(bytes.subarray(bytes[2], bytes[2] + size)); }
	else { const names = cffIndex(bytes, bytes[2], false), top = cffIndex(bytes, names.end, false); if (top.count !== 1) fontError('The CFF face has an invalid dictionary.'); dict = cffDict(top.objects[0]); }
	const offset = dict.get(17)?.[0]; if (!Number.isInteger(offset)) fontError('The CFF face has no character strings.');
	const index = cffIndex(bytes, offset, modern); if (index.count !== count) fontError('The CFF glyph count disagrees with maxp.');
	if (!modern && !dict.has(1230)) {
		const charset = dict.get(15)?.[0] ?? 0;
		if (charset <= 2) for (let i = 0; i < count; i++) keep.add(i);
		else {
			reader.at = charset; const format = reader.u8(); let glyph = 1;
			if (format > 2) fontError('The CFF character set is invalid.');
			while (glyph < count) { const sid = reader.u16(), following = format === 0 ? 0 : format === 1 ? reader.u8() : reader.u16(); if (glyph + following >= count) fontError('The CFF character set exceeds the glyph count.'); for (let j = 0; j <= following; j++, glyph++) if (sid + j <= 390) keep.add(glyph); }
		}
	}
	return {tag, bytes, index, modern};
}
function subsetCff(tables, data, keep) {
	const {tag, bytes, index, modern} = data, out = bytes.slice(); out.fill(0, index.data, index.end); let offset = 1;
	const setOffset = (glyph, value) => { for (let j = index.width - 1; j >= 0; j--) { out[index.directory + glyph * index.width + j] = value % 256; value = Math.floor(value / 256); } };
	for (let glyph = 0; glyph < index.count; glyph++) { setOffset(glyph, offset); const source = keep.has(glyph) ? index.objects[glyph] : modern ? new Uint8Array() : Uint8Array.of(14); out.set(source, index.data + offset - 1); offset += source.length; }
	setOffset(index.count, offset);
	tables.set(tag, out);
}
export function fontCids(bytes) {
	const {tables} = fontTables(bytes), data = tables.get('CFF ');
	if (!data) return null;
	const names = cffIndex(data, data[2], false), top = cffIndex(data, names.end, false), dict = cffDict(top.objects[0]);
	const glyphs = cffIndex(data, dict.get(17)[0], false).count;
	if (!dict.has(1230)) return Array.from({length: glyphs}, (_, index) => index);
	const {reader} = access(data); reader.at = dict.get(15)[0];
	const format = reader.u8(), cids = [0];
	if (format > 2) fontError('The CFF character set is invalid.');
	while (cids.length < glyphs) {
		const first = reader.u16(), following = format === 0 ? 0 : format === 1 ? reader.u8() : reader.u16();
		if (cids.length + following >= glyphs) fontError('The CFF character set exceeds the glyph count.');
		for (let offset = 0; offset <= following; offset++) cids.push(first + offset);
	}
	return cids;
}
export function maskFontGlyphs(bytes, glyphs) {
	const {flavor, tables} = fontTables(bytes), count = access(tables.get('maxp')).u16(4);
	const removed = new Set(glyphs), keep = new Set(Array.from({length: count}, (_, id) => id).filter(id => !removed.has(id)));
	if (tables.has('glyf')) subsetGlyf(tables, keep, count, glyphOffsets(tables, count));
	else {
		const data = cffData(tables, count, new Set());
		subsetCff(tables, data, keep);
	}
	return writeSfnt(flavor, tables);
}
export function subsetSfnt(bytes, text) {
	const {flavor, tables} = fontTables(bytes), maxp = tables.get('maxp'), os = tables.get('OS/2');
	if (!maxp || maxp.length < 6 || !os || os.length < 10 || !tables.has('cmap')) fontError('The font is missing required subset tables.');
	const count = access(maxp).u16(4), noSubset = !!(access(os).u16(8) & 256), stats = {sourceBytes: bytes.length, subsetBytes: bytes.length, sourceGlyphs: count, retainedGlyphs: count, subset: false};
	if (noSubset) return {bytes, stats: {...stats, reason: 'The font requires whole-face embedding.'}};
	const mapping = fontCharacterMap(tables.get('cmap'), count), codes = shapingCharacters(mapping, text), keep = new Set([0]); for (const code of codes) keep.add(mapping.glyph(code));
	for (const row of mapping.variations) if (codes.has(row.selector)) for (const [code, glyph] of row.alternates) if (codes.has(code)) keep.add(glyph);
	const whole = ['COLR', 'SVG ', 'sbix', 'CBDT', 'EBDT', 'bdat', 'morx', 'mort', 'Silf'].some(tag => tables.has(tag));
	let offsets, cff;
	if (tables.has('glyf')) offsets = glyphOffsets(tables, count);
	else if (tables.has('CFF ') || tables.has('CFF2')) cff = cffData(tables, count, keep);
	else fontError('The font outline format cannot be subset.');
	if (whole) for (let i = 0; i < count; i++) keep.add(i);
	else {
		const substitute = substitutionClosure(tables.get('GSUB'), count); let prior;
		do { prior = keep.size; substitute(keep); mathClosure(tables.get('MATH'), keep, count); if (offsets) compoundClosure(tables, keep, count, offsets); } while (keep.size !== prior);
	}
	if (offsets) subsetGlyf(tables, keep, count, offsets); else subsetCff(tables, cff, keep);
	tables.set('cmap', writeCmap(mapping, codes));
	const result = writeSfnt(flavor, tables);
	return {bytes: result, stats: {...stats, subsetBytes: result.length, retainedGlyphs: keep.size, subset: true, ...(whole ? {reason: 'Color or alternate shaping glyphs are retained.'} : {})}};
}
