// SPDX-License-Identifier: AGPL-3.0-only

const TYPE_BYTES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
const GPS_IFD = 0x8825, ORIENTATION = 0x0112;
const text = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
const big32 = (bytes, at) => (bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0;

function tiff(bytes) {
	if (bytes.length < 8) return null;
	const little = bytes[0] === 0x49 && bytes[1] === 0x49;
	if (!little && !(bytes[0] === 0x4D && bytes[1] === 0x4D)) return null;
	const u16 = at => little ? bytes[at] | bytes[at + 1] << 8 : bytes[at] << 8 | bytes[at + 1];
	const u32 = at => (little ? bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24 : bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0;
	if (u16(2) !== 42) return null;
	const entries = at => {
		if (!at || at + 2 > bytes.length) return [];
		const count = u16(at), out = [];
		for (let n = 0; n < count && at + 2 + n * 12 + 12 <= bytes.length; n++) {
			const entry = at + 2 + n * 12, type = u16(entry + 2), length = (TYPE_BYTES[type] || 0) * u32(entry + 4);
			out.push({entry, tag: u16(entry), type, length, value: length > 4 ? u32(entry + 8) : entry + 8});
		}
		return out;
	};
	return {little, u16, u32, entries, first: u32(4)};
}

export function blankLocation(bytes) {
	const read = tiff(bytes);
	const pointer = read?.entries(read.first).find(entry => entry.tag === GPS_IFD);
	if (!pointer) return false;
	const at = read.u32(pointer.value);
	if (!at || at + 2 > bytes.length) return false;
	const entries = read.entries(at);
	if (!entries.length) return false;
	for (const entry of entries) {
		if (entry.length > 4 && entry.value + entry.length <= bytes.length) bytes.fill(0, entry.value, entry.value + entry.length);
		bytes.fill(0, entry.entry, entry.entry + 12);
	}
	bytes.fill(0, at, at + 2);
	const next = at + 2 + entries.length * 12;
	if (next + 4 <= bytes.length) bytes.fill(0, next, next + 4);
	return true;
}

function upright(bytes) {
	const read = tiff(bytes), entry = read?.entries(read.first).find(each => each.tag === ORIENTATION && each.type === 3);
	if (!entry) return;
	bytes[entry.value] = read.little ? 1 : 0; bytes[entry.value + 1] = read.little ? 0 : 1;
}

export function blankXmpLocation(bytes) {
	let source = '';
	for (let at = 0; at < bytes.length; at += 32768) source += String.fromCharCode(...bytes.subarray(at, at + 32768));
	let found = false;
	for (const pattern of [/<(([\w-]+):GPS\w*)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/g, /\s[\w-]+:GPS\w*\s*=\s*(?:"[^"]*"|'[^']*')/g])
		for (const match of source.matchAll(pattern)) { bytes.fill(0x20, match.index, match.index + match[0].length); found = true; }
	return found;
}

const XMP_JPEG = 'http://ns.adobe.com/xap/1.0/\0';
function jpegSegments(bytes) {
	const found = [];
	let scan = -1;
	for (let at = 2; at + 4 <= bytes.length;) {
		if (bytes[at] !== 0xFF) break;
		const marker = bytes[at + 1];
		if (marker === 0xDA) { scan = at; break; }
		if (marker === 0xD8 || marker >= 0xD0 && marker <= 0xD7 || marker === 0x01 || marker === 0xFF) { at += marker === 0xFF ? 1 : 2; continue; }
		at += 2 + (bytes[at + 2] << 8 | bytes[at + 3]);
	}
	for (let at = 0; at + 10 <= bytes.length; at++) {
		if (bytes[at] !== 0xFF || bytes[at + 1] !== 0xE1) continue;
		const length = bytes[at + 2] << 8 | bytes[at + 3], end = at + 2 + length;
		if (end > bytes.length || length < 8) continue;
		const main = scan < 0 || at < scan;
		if (text(bytes, at + 4, 6) === 'Exif\0\0') found.push({kind: 'exif', main, start: at + 10, end});
		else if (length > 31 && text(bytes, at + 4, XMP_JPEG.length) === XMP_JPEG) found.push({kind: 'xmp', main, start: at + 4 + XMP_JPEG.length, end});
		at = end - 1;
	}
	return found;
}

export function jpegWithoutLocation(bytes) {
	const out = bytes.slice();
	let removed = false;
	for (const segment of jpegSegments(out)) {
		const part = out.subarray(segment.start, segment.end);
		if (segment.kind === 'exif' ? blankLocation(part) : blankXmpLocation(part)) removed = true;
	}
	return {bytes: removed ? out : bytes, removed};
}

function pngChunks(bytes) {
	const out = [];
	for (let at = 8; at + 12 <= bytes.length;) {
		const size = big32(bytes, at), name = text(bytes, at + 4, 4);
		if (at + 12 + size > bytes.length) break;
		out.push({name, data: bytes.subarray(at + 8, at + 8 + size)});
		if (name === 'IEND') break;
		at += 12 + size;
	}
	return out;
}
function webpChunks(bytes) {
	const out = [];
	for (let at = 12; at + 8 <= bytes.length;) {
		const size = (bytes[at + 4] | bytes[at + 5] << 8 | bytes[at + 6] << 16 | bytes[at + 7] << 24) >>> 0, name = text(bytes, at, 4);
		if (at + 8 + size > bytes.length) break;
		out.push({name, data: bytes.subarray(at + 8, at + 8 + size)});
		at += 8 + size + (size & 1);
	}
	return out;
}

export function metadataOf(bytes, {location = true} = {}) {
	let exif = null, xmp = null;
	if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
		for (const segment of jpegSegments(bytes)) {
			if (!segment.main) continue;
			if (segment.kind === 'exif') exif ||= bytes.slice(segment.start, segment.end);
			else xmp ||= bytes.slice(segment.start, segment.end);
		}
	} else if (bytes[0] === 0x89 && text(bytes, 1, 3) === 'PNG') {
		for (const {name, data} of pngChunks(bytes)) {
			if (name === 'eXIf') exif ||= data.slice();
			else if (name === 'iTXt' && text(data, 0, 18) === 'XML:com.adobe.xmp\0' && data[18] === 0) {
				let at = 20;
				for (let nul = 0; nul < 2 && at < data.length; at++) if (data[at] === 0) nul++;
				xmp ||= data.slice(at);
			}
		}
	} else if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') {
		for (const {name, data} of webpChunks(bytes)) {
			if (name === 'EXIF') exif ||= data.slice(text(data, 0, 6) === 'Exif\0\0' ? 6 : 0);
			else if (name === 'XMP ') xmp ||= data.slice();
		}
	}
	if (exif && !tiff(exif)) exif = null;
	if (!exif && !xmp) return null;
	let removed = false;
	if (exif) { upright(exif); if (!location && blankLocation(exif)) removed = true; }
	if (xmp && !location && blankXmpLocation(xmp)) removed = true;
	return {exif, xmp, removed};
}

export const metadataBytes = meta => meta ? 12 + 20 + 8 + (meta.exif ? 12 + meta.exif.length : 0) + (meta.xmp ? 8 + meta.xmp.length : 0) : 0;

function box(type, ...parts) {
	const size = 8 + parts.reduce((sum, part) => sum + part.length, 0), out = new Uint8Array(size);
	out[0] = size >>> 24; out[1] = size >>> 16 & 255; out[2] = size >>> 8 & 255; out[3] = size & 255;
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	let at = 8;
	for (const part of parts) { out.set(part, at); at += part.length; }
	return out;
}
const SIGNATURE = Uint8Array.of(0, 0, 0, 12, 0x4A, 0x58, 0x4C, 0x20, 0x0D, 0x0A, 0x87, 0x0A);
const FTYP = box('ftyp', Uint8Array.of(0x6A, 0x78, 0x6C, 0x20, 0, 0, 0, 0, 0x6A, 0x78, 0x6C, 0x20));
const join = parts => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; };

export function withMetadata(jxl, meta) {
	if (!meta || !meta.exif && !meta.xmp) return jxl;
	const added = [...meta.exif ? [box('Exif', new Uint8Array(4), meta.exif)] : [], ...meta.xmp ? [box('xml ', meta.xmp)] : []];
	if (jxl[0] === 0xFF && jxl[1] === 0x0A) return join([SIGNATURE, FTYP, ...added, box('jxlc', jxl)]);
	if (!(jxl.length >= 12 && SIGNATURE.every((value, at) => jxl[at] === value))) return jxl;
	const head = [SIGNATURE], tail = [];
	for (let at = 12; at + 8 <= jxl.length;) {
		let size = big32(jxl, at), header = 8;
		const type = text(jxl, at + 4, 4);
		if (size === 1) { size = Number(new DataView(jxl.buffer, jxl.byteOffset + at + 8, 8).getBigUint64(0)); header = 16; }
		if (size === 0) size = jxl.length - at;
		if (size < header || at + size > jxl.length) return jxl;
		const whole = jxl.subarray(at, at + size);
		if (type === 'ftyp' || type === 'jxll') head.push(whole);
		else if (type !== 'Exif' && type !== 'xml ') tail.push(whole);
		at += size;
	}
	return join([...head, ...added, ...tail]);
}
