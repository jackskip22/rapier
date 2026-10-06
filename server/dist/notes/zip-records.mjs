// SPDX-License-Identifier: AGPL-3.0-only
// Rapier's one ZIP writer. Nothing else writes a ZIP header.
import {crc32} from '../images/crc32.mjs';

// DOS time is clamped to 1980-2107, local time.
export function dosDateTime(ms) {
	const d = new Date(ms);
	let year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
	let hour = d.getHours(), minute = d.getMinutes(), second = d.getSeconds();
	if (year < 1980) { year = 1980; month = 1; day = 1; hour = minute = second = 0; }
	if (year > 2107) { year = 2107; month = 12; day = 31; hour = 23; minute = 59; second = 58; }
	return {date: ((year - 1980) << 9) | (month << 5) | day, time: (hour << 11) | (minute << 5) | (second >> 1)};
}

// Bit 11 UTF-8 name, bit 3 descriptor. `utf8Flag: false` for DOCX parts keeps their bytes.
const flagsOf = f => (f.descriptor ? 0x0008 : 0) | (f.utf8Flag === false ? 0 : 0x0800);
export function localHeader(f) {
	const buf = new Uint8Array(30), v = new DataView(buf.buffer);
	v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, flagsOf(f), true); v.setUint16(8, 0, true);
	v.setUint16(10, f.time, true); v.setUint16(12, f.date, true); v.setUint32(14, f.descriptor ? 0 : f.crc, true);
	v.setUint32(18, f.descriptor ? 0 : f.size, true); v.setUint32(22, f.descriptor ? 0 : f.size, true);
	v.setUint16(26, f.nameBytes.length, true); v.setUint16(28, 0, true);
	return buf;
}
export function centralHeader(f, at) {
	const buf = new Uint8Array(46), v = new DataView(buf.buffer);
	v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, flagsOf(f), true); v.setUint16(10, 0, true);
	v.setUint16(12, f.time, true); v.setUint16(14, f.date, true); v.setUint32(16, f.crc, true);
	v.setUint32(20, f.size, true); v.setUint32(24, f.size, true);
	v.setUint16(28, f.nameBytes.length, true); v.setUint16(30, 0, true); v.setUint16(32, 0, true); v.setUint16(34, 0, true); v.setUint16(36, 0, true);
	v.setUint32(38, 0, true); v.setUint32(42, at, true);
	return buf;
}
// A stored streamed entry names its CRC after the payload, so its source is read only once.
// The strict reader already admits and checks this standard signed data descriptor.
export function dataDescriptor(f) {
	const buf = new Uint8Array(16), v = new DataView(buf.buffer);
	v.setUint32(0, 0x08074b50, true); v.setUint32(4, f.crc, true);
	v.setUint32(8, f.size, true); v.setUint32(12, f.size, true);
	return buf;
}
// Truncated to 65,535 bytes on a character boundary, never refused.
export function commentBytes(comment, enc) {
	const bytes = enc.encode(comment || '');
	if (bytes.length <= 0xFFFF) return bytes;
	let end = 0xFFFF;
	// Inspect the FIRST EXCLUDED byte in the complete encoding. A continuation
	// there means the cut is inside a character; back up to exclude its lead too.
	// Inspecting the last retained byte instead breaks even a character that fitted.
	while (end && (bytes[end] & 0xC0) === 0x80) end--;
	return bytes.subarray(0, end);
}

export function endRecord(count, size, start, commentLength) {
	const buf = new Uint8Array(22), v = new DataView(buf.buffer);
	v.setUint32(0, 0x06054b50, true); v.setUint16(4, 0, true); v.setUint16(6, 0, true);
	v.setUint16(8, count, true); v.setUint16(10, count, true); v.setUint32(12, size, true); v.setUint32(16, start, true);
	v.setUint16(20, commentLength, true);
	return buf;
}

// Stored only. Leading slash or ".." refused. External attributes 0 under MS-DOS. No Zip64: throws.
function normalisedName(name) {
	if (typeof name !== 'string' || !name) throw new Error('zipStored: an entry needs a name');
	if (name[0] === '/') throw new Error(`zipStored: "${name}" starts with a slash; zip paths are relative`);
	if (name.split('/').includes('..')) throw new Error(`zipStored: "${name}" has a ".." segment; refused rather than guessed at`);
	return name;
}
function bytesOf(bytes, enc) { return typeof bytes === 'string' ? enc.encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); }
// Deterministic: same entries and times give the same bytes.
export function zipStored(entries, options = {}) {
	if (entries.length >= 0xFFFF) throw new Error('zipStored: 65535 entries is the Zip64 sentinel, which this module does not implement');
	const enc = new TextEncoder();
	const files = entries.map(e => {
		const nameBytes = enc.encode(normalisedName(e.name));
		if (nameBytes.length > 0xFFFF) throw new Error(`zipStored: "${e.name.slice(0, 40)}…" is longer than a zip name can be`);
		const data = bytesOf(e.bytes, enc);
		if (data.length > 0xFFFFFFFF) throw new Error(`zipStored: "${e.name}" is over 4 GiB, which would need Zip64`);
		return {nameBytes, data, size: data.length, crc: crc32(data), utf8Flag: options.utf8Flag, ...dosDateTime(e.modified ?? Date.now())};
	});
	const parts = [], central = [];
	let offset = 0;
	const put = bytes => {
		parts.push(bytes); offset += bytes.length;
		if (offset > 0xFFFFFFFF) throw new Error('zipStored: the archive would exceed 4 GiB, which would need Zip64');
	};
	for (const f of files) {
		const at = offset;
		put(localHeader(f)); put(f.nameBytes); put(f.data);
		central.push(centralHeader(f, at), f.nameBytes);
	}
	const centralStart = offset;
	for (const part of central) put(part);
	const comment = commentBytes(options.comment, enc);
	put(endRecord(files.length, offset - centralStart, centralStart, comment.length));
	put(comment);
	const whole = new Uint8Array(offset);
	let pos = 0;
	for (const part of parts) { whole.set(part, pos); pos += part.length; }
	return whole;
}
