// SPDX-License-Identifier: AGPL-3.0-only
import {decodeBrotli} from './font-brotli.mjs';
export const FONT_FILE_BYTES = 32 * 1024 * 1024;
export const FONT_BATCH_BYTES = 128 * 1024 * 1024;
const pad4 = n => Math.ceil(n / 4) * 4;
const tags = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];
export function fontError(message, code = 'drawing_font_invalid') { throw Object.assign(new Error(message), {code}); }
export class FontReader {
	constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.at = 0; }
	range(at, size) { if (!Number.isSafeInteger(at) || !Number.isSafeInteger(size) || at < 0 || size < 0 || at > this.bytes.length - size) fontError('The font contains a truncated table.'); return at; }
	u8() { return this.bytes[this.range(this.at++, 1)]; }
	u16() { const at = this.range(this.at, 2); this.at += 2; return this.view.getUint16(at); }
	s16() { const at = this.range(this.at, 2); this.at += 2; return this.view.getInt16(at); }
	u32() { const at = this.range(this.at, 4); this.at += 4; return this.view.getUint32(at); }
	part(size) { const at = this.range(this.at, size); this.at += size; return this.bytes.subarray(at, this.at); }
	tag() { return String.fromCharCode(...this.part(4)); }
	base128() {
		let value = 0;
		for (let n = 0; n < 5; n++) {
			const byte = this.u8();
			if (!n && byte === 128 || value > 0x1ffffff) fontError('The WOFF2 directory contains an invalid length.');
			value = value * 128 + (byte & 127);
			if (!(byte & 128)) return value;
		}
		fontError('The WOFF2 directory contains an invalid length.');
	}
	uint255() { const byte = this.u8(); return byte === 253 ? this.u16() : byte >= 254 ? (byte === 254 ? 506 : 253) + this.u8() : byte; }
	done() { if (this.at !== this.bytes.length) fontError('The font table has unexpected trailing data.'); }
}
export function fontChecksum(bytes) {
	let sum = 0;
	for (let at = 0; at < bytes.length; at += 4) sum = (sum + (bytes[at] * 0x1000000 + (bytes[at + 1] || 0) * 65536 + (bytes[at + 2] || 0) * 256 + (bytes[at + 3] || 0))) >>> 0;
	return sum;
}
export function fontTables(bytes, offset = 0, collection = false) {
	const reader = new FontReader(bytes); reader.at = offset;
	const flavor = reader.u32(), count = reader.u16();
	if (![0x00010000, 0x4f54544f, 0x74727565].includes(flavor) || !count || count > 256) fontError('The font table directory is invalid.');
	reader.range(offset, 12 + 16 * count); reader.at = offset + 12;
	const tables = new Map(), spans = [];
	for (let i = 0; i < count; i++) {
		const tag = reader.tag(), checksum = reader.u32(), at = reader.u32(), length = reader.u32();
		if (!/^[ -~]{4}$/.test(tag) || tables.has(tag) || at % 4 || !collection && at < offset + 12 + 16 * count) fontError('The font table directory is invalid.');
		reader.range(at, length);
		tables.set(tag, bytes.subarray(at, at + length));
		if (length) spans.push([at, at + length]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) fontError('The font contains overlapping tables.');
	return {flavor: flavor === 0x74727565 ? 0x00010000 : flavor, tables};
}
export function writeSfnt(flavor, input) {
	const tables = new Map([...input].filter(([tag]) => tag !== 'DSIG').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
	const count = tables.size, length = 12 + count * 16 + [...tables.values()].reduce((sum, bytes) => sum + pad4(bytes.length), 0);
	if (!count || count > 256 || length > FONT_FILE_BYTES) fontError('This font exceeds the 32 MiB face limit.', 'drawing_font_limit');
	const bytes = new Uint8Array(length), view = new DataView(bytes.buffer), power = 2 ** Math.floor(Math.log2(count));
	view.setUint32(0, flavor); view.setUint16(4, count); view.setUint16(6, power * 16); view.setUint16(8, Math.log2(power)); view.setUint16(10, (count - power) * 16);
	let at = 12 + count * 16, row = 12, head = -1;
	for (const [tag, source] of tables) {
		for (let i = 0; i < 4; i++) bytes[row + i] = tag.charCodeAt(i);
		bytes.set(source, at);
		if (tag === 'head') { if (source.length < 54) fontError('The font head table is invalid.'); head = at; view.setUint32(at + 8, 0); }
		view.setUint32(row + 4, fontChecksum(bytes.subarray(at, at + source.length))); view.setUint32(row + 8, at); view.setUint32(row + 12, source.length);
		at += pad4(source.length); row += 16;
	}
	if (head < 0) fontError('The font is missing its head table.');
	view.setUint32(head + 8, (0xb1b0afba - fontChecksum(bytes)) >>> 0);
	return bytes;
}
export async function fontCompression(bytes, format, compress = false, length = FONT_FILE_BYTES) {
	if (!compress && format === 'brotli') return decodeBrotli(bytes, length);
	let transform;
	try { transform = new (compress ? CompressionStream : DecompressionStream)(format); }
	catch (_) {
		fontError('This browser cannot ' + (compress ? 'write' : 'read') + ' this compression format.', 'font_compression_unavailable');
	}
	const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader(), parts = [];
	let used = 0;
	try {
		for (;;) { const {done, value} = await reader.read(); if (done) break; used += value.length; if (used > length) fontError('The decompressed font exceeds its declared size.', 'drawing_font_limit'); parts.push(value); }
	} catch (error) { await reader.cancel().catch(() => {}); throw error; }
	const out = new Uint8Array(used); let at = 0;
	for (const part of parts) { out.set(part, at); at += part.length; }
	return out;
}
function tableView(tables, name, length) {
	const bytes = tables.get(name);
	if (!bytes || bytes.length < length) fontError('The font is missing a valid ' + name.trim() + ' table.');
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function zeroPadding(reader, start, end) {
	reader.range(start, end - start);
	for (let at = start; at < end; at++) if (reader.bytes[at]) fontError('The webfont has invalid padding.');
}
function optionalBlocks(reader, header, end) {
	const view = reader.view, metadata = view.getUint32(header), stored = view.getUint32(header + 4), original = view.getUint32(header + 8), privateAt = view.getUint32(header + 12), privateSize = view.getUint32(header + 16);
	if (!metadata && (stored || original) || metadata && (!stored || !original) || !privateAt && privateSize || privateAt && !privateSize) fontError('The webfont optional block header is invalid.');
	for (const [at, size] of [[metadata, stored], [privateAt, privateSize]]) if (at) {
		if (at !== pad4(end)) fontError('The webfont optional blocks overlap or contain extra data.');
		zeroPadding(reader, end, at); reader.range(at, size); end = at + size;
	}
	if (reader.bytes.length > pad4(end) || reader.bytes.length < end || privateAt && end !== reader.bytes.length) fontError('The webfont has unexpected trailing data.');
	zeroPadding(reader, end, reader.bytes.length);
}
async function readWoff(bytes) {
	const reader = new FontReader(bytes); reader.range(0, 44); reader.at = 4;
	const flavor = reader.u32(), size = reader.u32(), count = reader.u16(), reserved = reader.u16(), sfntSize = reader.u32();
	if (size !== bytes.length || reserved || !count || count > 256 || sfntSize > FONT_FILE_BYTES) fontError('The WOFF header is invalid.');
	reader.range(44, count * 20); reader.at = 44;
	const rows = [], tables = new Map(), spans = [];
	let total = 12 + count * 16;
	for (let i = 0; i < count; i++) {
		const tag = reader.tag(), at = reader.u32(), stored = reader.u32(), length = reader.u32(), checksum = reader.u32();
		if (at < 44 + count * 20 || at % 4 || stored > length || length > FONT_FILE_BYTES || tables.has(tag)) fontError('The WOFF table directory is invalid.');
		reader.range(at, stored); tables.set(tag, null); rows.push({tag, at, stored, length, checksum});
		if (stored) spans.push([at, at + stored]); total += pad4(length);
	}
	if (total !== sfntSize || total > FONT_FILE_BYTES) fontError('The WOFF expanded size is invalid.');
	spans.sort((a, b) => a[0] - b[0]);
	let storedEnd = 44 + count * 20;
	for (const [start, end] of spans) { if (start !== pad4(storedEnd)) fontError('The WOFF contains overlapping tables or extra data.'); zeroPadding(reader, storedEnd, start); storedEnd = end; }
	zeroPadding(reader, storedEnd, pad4(storedEnd)); optionalBlocks(reader, 24, pad4(storedEnd));
	for (const row of rows) {
		const source = bytes.subarray(row.at, row.at + row.stored), data = row.stored === row.length ? source : await fontCompression(source, 'deflate', false, row.length);
		if (data.length !== row.length) fontError('The WOFF table has an incorrect expanded size.');
		const sumBytes = row.tag === 'head' ? data.slice() : data;
		if (row.tag === 'head') { if (sumBytes.length < 12) fontError('The font head table is invalid.'); sumBytes.fill(0, 8, 12); }
		if (fontChecksum(sumBytes) !== row.checksum) fontError('The WOFF table checksum is invalid.');
		tables.set(row.tag, data);
	}
	return writeSfnt(flavor, tables);
}
function pointsToGlyph(contours, ends, points, instructions, bounds, overlap) {
	const flags = [], xs = [], ys = [];
	for (let i = 0; i < points.length; i++) {
		const {x, y, on} = points[i]; let flag = on ? 1 : 0;
		for (const [delta, out, short, same] of [[x, xs, 2, 16], [y, ys, 4, 32]]) {
			if (!delta) flag |= same;
			else if (delta >= -255 && delta <= 255) { flag |= short; if (delta > 0) flag |= same; out.push(Math.abs(delta)); }
			else { out.push((delta >> 8) & 255, delta & 255); }
		}
		if (!i && overlap) flag |= 64;
		flags.push(flag);
	}
	const bytes = new Uint8Array(12 + ends.length * 2 + instructions.length + flags.length + xs.length + ys.length), view = new DataView(bytes.buffer);
	view.setInt16(0, contours); bounds.forEach((value, i) => view.setInt16(2 + i * 2, value));
	ends.forEach((value, i) => view.setUint16(10 + i * 2, value));
	let at = 10 + ends.length * 2; view.setUint16(at, instructions.length); at += 2;
	for (const data of [instructions, flags, xs, ys]) { bytes.set(data, at); at += data.length; }
	return bytes;
}
function transformedGlyf(data, expectedLoca) {
	const reader = new FontReader(data), version = reader.u16(), options = reader.u16(), count = reader.u16(), index = reader.u16();
	if (version || options & ~1 || !count || index > 1 || expectedLoca !== (count + 1) * (index ? 4 : 2)) fontError('The WOFF2 glyph header is invalid.');
	const sizes = Array.from({length: 7}, () => reader.u32());
	const streams = sizes.map(length => new FontReader(reader.part(length))), [contours, pointCounts, flags, glyphs, composites, boxes, instructions] = streams;
	const overlap = options & 1 ? reader.part(Math.ceil(count / 8)) : null; reader.done();
	if (contours.bytes.length !== count * 2) fontError('The WOFF2 contour stream is invalid.');
	const bitmap = boxes.part(Math.ceil(count / 32) * 4), records = [], offsets = [0], xMins = new Int16Array(count);
	let length = 0;
	for (let glyph = 0; glyph < count; glyph++) {
		const n = contours.s16(), boxPresent = !!(bitmap[glyph >> 3] & (128 >> (glyph & 7)));
		let record;
		if (!n) { if (boxPresent) fontError('An empty WOFF2 glyph has a bounding box.'); record = new Uint8Array(); }
		else if (n > 0) {
			const ends = []; let total = 0;
			for (let i = 0; i < n; i++) { const value = pointCounts.uint255(); if (!value || total + value > 65535) fontError('The WOFF2 contour points are invalid.'); total += value; ends.push(total - 1); }
			const points = []; let x = 0, y = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (let i = 0; i < total; i++) {
				const flag = flags.u8(), code = flag & 127; let dx = 0, dy = 0;
				if (code < 10) dy = (Math.floor(code / 2) * 256 + glyphs.u8()) * (code & 1 ? 1 : -1);
				else if (code < 20) dx = (Math.floor((code - 10) / 2) * 256 + glyphs.u8()) * (code & 1 ? 1 : -1);
				else if (code < 84) { const packed = glyphs.u8(), group = Math.floor((code - 20) / 4); dx = 1 + Math.floor(group / 4) * 16 + (packed >> 4); dy = 1 + (group % 4) * 16 + (packed & 15); }
				else if (code < 120) { const group = Math.floor((code - 84) / 4); dx = 1 + Math.floor(group / 3) * 256 + glyphs.u8(); dy = 1 + group % 3 * 256 + glyphs.u8(); }
				else if (code < 124) { const a = glyphs.u8(), b = glyphs.u8(), c = glyphs.u8(); dx = a * 16 + (b >> 4); dy = (b & 15) * 256 + c; }
				else { dx = glyphs.u16(); dy = glyphs.u16(); }
				if (code >= 20) { dx *= code & 1 ? 1 : -1; dy *= code & 2 ? 1 : -1; }
				dx = (dx << 16) >> 16; dy = (dy << 16) >> 16; x = ((x + dx) << 16) >> 16; y = ((y + dy) << 16) >> 16;
				minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
				points.push({x: dx, y: dy, on: !(flag & 128)});
			}
			const instruction = instructions.part(glyphs.uint255()), bounds = boxPresent ? Array.from({length: 4}, () => boxes.s16()) : [minX, minY, maxX, maxY];
			xMins[glyph] = bounds[0]; record = pointsToGlyph(n, ends, points, instruction, bounds, !!(overlap?.[glyph >> 3] & (128 >> (glyph & 7))));
		} else if (n === -1) {
			if (!boxPresent) fontError('A composite WOFF2 glyph is missing its bounding box.');
			const start = composites.at; let flag = 0, instruction = false, components = 0;
			do {
				flag = composites.u16(); const id = composites.u16();
				if (id >= count || ++components > count) fontError('The WOFF2 composite glyph is invalid.');
				composites.part((flag & 1 ? 4 : 2) + (flag & 8 ? 2 : flag & 64 ? 4 : flag & 128 ? 8 : 0));
				instruction ||= !!(flag & 256);
			} while (flag & 32);
			const body = composites.bytes.subarray(start, composites.at), code = instruction ? instructions.part(glyphs.uint255()) : null;
			record = new Uint8Array(10 + body.length + (code ? 2 + code.length : 0)); const view = new DataView(record.buffer); view.setInt16(0, -1);
			for (let i = 0; i < 4; i++) { const value = boxes.s16(); view.setInt16(2 + i * 2, value); if (!i) xMins[glyph] = value; }
			record.set(body, 10); if (code) { view.setUint16(10 + body.length, code.length); record.set(code, 12 + body.length); }
		} else fontError('The WOFF2 glyph contour count is invalid.');
		records.push(record); length += Math.ceil(record.length / 2) * 2;
		if (length > FONT_FILE_BYTES || !index && length > 131070) fontError('The reconstructed WOFF2 glyphs exceed their offset range.');
		offsets.push(length);
	}
	for (const stream of streams) stream.done();
	const glyf = new Uint8Array(length), loca = new Uint8Array(expectedLoca), view = new DataView(loca.buffer);
	for (let i = 0; i < count; i++) glyf.set(records[i], offsets[i]);
	offsets.forEach((at, i) => index ? view.setUint32(i * 4, at) : view.setUint16(i * 2, at / 2));
	return {glyf, loca, xMins};
}
function transformedHmtx(data, tables) {
	const head = tableView(tables, 'head', 54), hhea = tableView(tables, 'hhea', 36), maxp = tableView(tables, 'maxp', 6);
	const count = maxp.getUint16(4), horizontal = hhea.getUint16(34), index = head.getInt16(50), loca = tableView(tables, 'loca', (count + 1) * (index ? 4 : 2)), glyf = tables.get('glyf');
	if (!count || !horizontal || horizontal > count || !glyf || index < 0 || index > 1) fontError('The WOFF2 horizontal metrics are invalid.');
	const reader = new FontReader(data), flags = reader.u8();
	if (!(flags & 3) || flags & ~3) fontError('The WOFF2 horizontal transform flags are invalid.');
	const widths = Array.from({length: horizontal}, () => reader.u16()), bearings = new Int16Array(count), glyphView = new FontReader(glyf);
	for (let i = 0; i < count; i++) {
		if (!(flags & (i < horizontal ? 1 : 2))) bearings[i] = reader.s16();
		else { const at = index ? loca.getUint32(i * 4) : loca.getUint16(i * 2) * 2, end = index ? loca.getUint32(i * 4 + 4) : loca.getUint16(i * 2 + 2) * 2; if (end < at || end > glyf.length) fontError('The WOFF2 glyph offsets are invalid.'); if (end > at) { glyphView.range(at, 10); bearings[i] = glyphView.view.getInt16(at + 2); } }
	}
	reader.done(); const bytes = new Uint8Array(horizontal * 4 + (count - horizontal) * 2), view = new DataView(bytes.buffer);
	for (let i = 0; i < count; i++) { if (i < horizontal) { view.setUint16(i * 4, widths[i]); view.setInt16(i * 4 + 2, bearings[i]); } else view.setInt16(horizontal * 4 + (i - horizontal) * 2, bearings[i]); }
	return bytes;
}
async function readWoff2(bytes) {
	const reader = new FontReader(bytes); reader.range(0, 48); reader.at = 4;
	const flavor = reader.u32(), length = reader.u32(), count = reader.u16(), reserved = reader.u16(), sfntSize = reader.u32(), compressedSize = reader.u32();
	if (length !== bytes.length || !count || count > 4096) fontError('The WOFF2 header is invalid.');
	reader.at = 48; const rows = []; let expanded = 0;
	for (let i = 0; i < count; i++) {
		const flags = reader.u8(), tag = (flags & 63) === 63 ? reader.tag() : tags[flags & 63], version = flags >> 6, origLength = reader.base128();
		const outline = tag === 'glyf' || tag === 'loca', transform = outline ? version === 0 : tag === 'hmtx' && version === 1;
		if (!/^[ -~]{4}$/.test(tag) || outline && version !== 0 && version !== 3 || !outline && version !== 0 && !(tag === 'hmtx' && version === 1)) fontError('This WOFF2 file uses an unknown table transform.');
		const size = transform ? reader.base128() : origLength;
		if (origLength > FONT_FILE_BYTES || (expanded += size) > FONT_BATCH_BYTES || tag === 'loca' && transform && size) fontError('The WOFF2 table size is invalid.');
		rows.push({tag, origLength, size, transform, data: null});
	}
	const faces = [];
	if (flavor === 0x74746366) {
		const version = reader.u32(), fonts = reader.uint255();
		if (![0x10000, 0x20000].includes(version) || !fonts || fonts > 64) fontError('The WOFF2 collection directory is invalid.');
		for (let n = 0; n < fonts; n++) {
			const count = reader.uint255(), flavor = reader.u32(), indices = [];
			if (!count || count > 256) fontError('The WOFF2 collection face is invalid.');
			for (let i = 0; i < count; i++) { const index = reader.uint255(); if (index >= rows.length || indices.includes(index)) fontError('The WOFF2 collection table index is invalid.'); indices.push(index); }
			faces.push({flavor, indices});
		}
	} else { if (count > 256) fontError('The WOFF2 face has too many tables.'); faces.push({flavor, indices: rows.map((_, i) => i)}); }
	const compressed = reader.part(compressedSize); optionalBlocks(reader, 28, reader.at);
	const stream = await fontCompression(compressed, 'brotli', false, expanded);
	if (stream.length !== expanded) fontError('The WOFF2 expanded table size is invalid.');
	let at = 0; for (const row of rows) { row.data = stream.subarray(at, at + row.size); at += row.size; }
	const result = [];
	for (const face of faces) {
		const tables = new Map(), sources = new Map();
		for (const index of face.indices) { const row = rows[index]; if (tables.has(row.tag)) fontError('The WOFF2 face contains duplicate tables.'); tables.set(row.tag, row.data); sources.set(row.tag, row); }
		const glyf = sources.get('glyf'), loca = sources.get('loca');
		if (!!glyf !== !!loca || glyf && glyf.transform !== loca.transform) fontError('The WOFF2 glyph and location transforms disagree.');
		if (glyf?.transform) {
			const rebuilt = transformedGlyf(glyf.data, loca.origLength); tables.set('glyf', rebuilt.glyf); tables.set('loca', rebuilt.loca);
			if (tableView(tables, 'maxp', 6).getUint16(4) !== rebuilt.xMins.length) fontError('The WOFF2 glyph count disagrees with maxp.');
		}
		if (sources.get('hmtx')?.transform) tables.set('hmtx', transformedHmtx(sources.get('hmtx').data, tables));
		result.push(writeSfnt(face.flavor, tables));
	}
	return result;
}
export async function unpackFonts(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > FONT_BATCH_BYTES) fontError('Choose a valid font file below 128 MiB.', 'drawing_font_limit');
	const reader = new FontReader(bytes), signature = reader.u32();
	if (signature === 0x774f4646) return [await readWoff(bytes)];
	if (signature === 0x774f4632) return readWoff2(bytes);
	if (signature === 0x74746366) {
		const version = reader.u32(), count = reader.u32();
		if (![0x10000, 0x20000].includes(version) || !count || count > 64) fontError('The font collection header is invalid.');
		const offsets = Array.from({length: count}, () => reader.u32()), fonts = [];
		for (const offset of offsets) { const {flavor, tables} = fontTables(bytes, offset, true); fonts.push(writeSfnt(flavor, tables)); }
		return fonts;
	}
	const face = fontTables(bytes);
	return [signature === 0x74727565 ? writeSfnt(face.flavor, face.tables) : bytes.slice()];
}
function base128(value) {
	const bytes = [value % 128];
	while ((value = Math.floor(value / 128))) bytes.unshift(128 | value % 128);
	return bytes;
}
export async function packWoff(bytes) {
	const source = fontTables(bytes), {flavor, tables} = fontTables(writeSfnt(source.flavor, source.tables)), entries = [...tables], parts = [];
	let length = 44 + entries.length * 20;
	for (const [tag, source] of entries) { const compressed = await fontCompression(source, 'deflate', true, FONT_FILE_BYTES), data = compressed.length < source.length ? compressed : source; parts.push({tag, source, data, at: length}); length += pad4(data.length); }
	const out = new Uint8Array(length), view = new DataView(out.buffer);
	view.setUint32(0, 0x774f4646); view.setUint32(4, flavor); view.setUint32(8, length); view.setUint16(12, entries.length); view.setUint32(16, 12 + entries.length * 16 + entries.reduce((sum, [, table]) => sum + pad4(table.length), 0)); view.setUint16(20, 1);
	parts.forEach(({tag, source, data, at}, i) => { const row = 44 + i * 20; for (let k = 0; k < 4; k++) out[row + k] = tag.charCodeAt(k); view.setUint32(row + 4, at); view.setUint32(row + 8, data.length); view.setUint32(row + 12, source.length); const sumBytes = tag === 'head' ? source.slice() : source; if (tag === 'head') sumBytes.fill(0, 8, 12); view.setUint32(row + 16, fontChecksum(sumBytes)); out.set(data, at); });
	return out;
}
export async function packWoff2(bytes) {
	const {flavor, tables} = fontTables(bytes); tables.delete('DSIG');
	const head = tables.get('head')?.slice(); if (head) { new DataView(head.buffer).setUint16(16, new DataView(head.buffer).getUint16(16) | 0x800); tables.set('head', head); }
	const entries = [...fontTables(writeSfnt(flavor, tables)).tables], directory = [];
	let length = 0;
	for (const [tag, source] of entries) { const code = tags.indexOf(tag); directory.push((tag === 'glyf' || tag === 'loca' ? 192 : 0) | (code < 0 ? 63 : code)); if (code < 0) for (const character of tag) directory.push(character.charCodeAt(0)); directory.push(...base128(source.length)); length += source.length; }
	const plain = new Uint8Array(length); let at = 0; for (const [, source] of entries) { plain.set(source, at); at += source.length; }
	const compressed = await fontCompression(plain, 'brotli', true, FONT_FILE_BYTES), out = new Uint8Array(pad4(48 + directory.length + compressed.length)), view = new DataView(out.buffer);
	view.setUint32(0, 0x774f4632); view.setUint32(4, flavor); view.setUint32(8, out.length); view.setUint16(12, entries.length); view.setUint32(16, 12 + entries.length * 16 + entries.reduce((sum, [, data]) => sum + pad4(data.length), 0)); view.setUint32(20, compressed.length); view.setUint16(24, 1); out.set(directory, 48); out.set(compressed, 48 + directory.length);
	return out;
}
