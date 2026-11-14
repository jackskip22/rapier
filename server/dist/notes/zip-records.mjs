// SPDX-License-Identifier: AGPL-3.0-only
import {crc32} from '../images/crc32.mjs';
import {finish, finishAsync} from '../kit/render-work.mjs';

export function dosDateTime(ms) {
	const d = new Date(ms);
	let year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
	let hour = d.getHours(), minute = d.getMinutes(), second = d.getSeconds();
	if (year < 1980) { year = 1980; month = 1; day = 1; hour = minute = second = 0; }
	if (year > 2107) { year = 2107; month = 12; day = 31; hour = 23; minute = 59; second = 58; }
	return {date: ((year - 1980) << 9) | (month << 5) | day, time: (hour << 11) | (minute << 5) | (second >> 1)};
}

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
export function dataDescriptor(f) {
	const buf = new Uint8Array(16), v = new DataView(buf.buffer);
	v.setUint32(0, 0x08074b50, true); v.setUint32(4, f.crc, true);
	v.setUint32(8, f.size, true); v.setUint32(12, f.size, true);
	return buf;
}
const MAX32 = 0xFFFFFFFF;
export const zip64Entry = (size, at) => size >= MAX32 || at >= MAX32;
const put64 = (view, at, value) => { view.setUint32(at, value % 0x100000000, true); view.setUint32(at + 4, Math.floor(value / 0x100000000), true); };
const joined = (...parts) => {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let at = 0; for (const part of parts) { out.set(part, at); at += part.length; }
	return out;
};
export function localRecord(f, at) {
	const head = localHeader(f);
	if (!zip64Entry(f.size, at)) return joined(head, f.nameBytes);
	const v = new DataView(head.buffer), extra = new Uint8Array(20), e = new DataView(extra.buffer);
	v.setUint16(4, 45, true); v.setUint32(18, MAX32, true); v.setUint32(22, MAX32, true); v.setUint16(28, 20, true);
	e.setUint16(0, 1, true); e.setUint16(2, 16, true); put64(e, 4, f.descriptor ? 0 : f.size); put64(e, 12, f.descriptor ? 0 : f.size);
	return joined(head, f.nameBytes, extra);
}
export const localRecordSize = (nameLength, size, at) => 30 + nameLength + (zip64Entry(size, at) ? 20 : 0);
export function centralRecord(f, at) {
	const head = centralHeader(f, Math.min(at, MAX32));
	if (!zip64Entry(f.size, at)) return joined(head, f.nameBytes);
	const big = f.size >= MAX32, far = at >= MAX32, length = (big ? 16 : 0) + (far ? 8 : 0);
	const v = new DataView(head.buffer), extra = new Uint8Array(4 + length), e = new DataView(extra.buffer);
	v.setUint16(4, 45, true); v.setUint16(6, 45, true); v.setUint16(30, 4 + length, true);
	if (big) { v.setUint32(20, MAX32, true); v.setUint32(24, MAX32, true); }
	e.setUint16(0, 1, true); e.setUint16(2, length, true);
	let w = 4;
	if (big) { put64(e, w, f.size); put64(e, w + 8, f.size); w += 16; }
	if (far) put64(e, w, at);
	return joined(head, f.nameBytes, extra);
}
export const centralRecordSize = (nameLength, size, at) => 46 + nameLength + (zip64Entry(size, at) ? 4 + (size >= MAX32 ? 16 : 0) + (at >= MAX32 ? 8 : 0) : 0);
export function descriptorRecord(f, at) {
	if (!zip64Entry(f.size, at)) return dataDescriptor(f);
	const buf = new Uint8Array(24), v = new DataView(buf.buffer);
	v.setUint32(0, 0x08074b50, true); v.setUint32(4, f.crc, true); put64(v, 8, f.size); put64(v, 16, f.size);
	return buf;
}
export const descriptorRecordSize = (size, at) => zip64Entry(size, at) ? 24 : 16;
export function endRecords(count, size, start, commentLength) {
	if (count < 0xFFFF && size < MAX32 && start < MAX32) return endRecord(count, size, start, commentLength);
	const buf = new Uint8Array(56 + 20 + 22), v = new DataView(buf.buffer);
	v.setUint32(0, 0x06064b50, true); put64(v, 4, 44); v.setUint16(12, 45, true); v.setUint16(14, 45, true);
	v.setUint32(16, 0, true); v.setUint32(20, 0, true); put64(v, 24, count); put64(v, 32, count); put64(v, 40, size); put64(v, 48, start);
	v.setUint32(56, 0x07064b50, true); v.setUint32(60, 0, true); put64(v, 64, start + size); v.setUint32(72, 1, true);
	buf.set(endRecord(Math.min(count, 0xFFFF), Math.min(size, MAX32), Math.min(start, MAX32), commentLength), 76);
	return buf;
}
export const endRecordsSize = (count, size, start) => count < 0xFFFF && size < MAX32 && start < MAX32 ? 22 : 98;

export function zipBlob(entries, {now = Date.now(), type = 'application/zip'} = {}) {
	const enc = new TextEncoder(), parts = [], central = [];
	let offset = 0, centralSize = 0;
	for (const e of entries) {
		const nameBytes = enc.encode(normalisedName(e.name));
		if (nameBytes.length > 0xFFFF) throw new Error(`zipBlob: "${e.name.slice(0, 40)}…" is longer than a zip name can be`);
		const size = e.blob.size;
		if (size !== e.size) throw new Error(`zipBlob: "${e.name}" is ${size} bytes, not the ${e.size} its CRC was taken over`);
		const f = {nameBytes, size, crc: e.crc >>> 0, ...dosDateTime(e.modified ?? now)};
		const head = localRecord(f, offset), entry = centralRecord(f, offset);
		parts.push(head, e.blob); central.push(entry);
		offset += head.length + size; centralSize += entry.length;
	}
	const blob = new Blob([...parts, ...central, endRecords(entries.length, centralSize, offset, 0)], {type});
	return {blob, size: blob.size, count: entries.length};
}

export function commentBytes(comment, enc) {
	const bytes = enc.encode(comment || '');
	if (bytes.length <= 0xFFFF) return bytes;
	let end = 0xFFFF;
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

function normalisedName(name) {
	if (typeof name !== 'string' || !name) throw new Error('zipStored: an entry needs a name');
	if (name[0] === '/') throw new Error(`zipStored: "${name}" starts with a slash; zip paths are relative`);
	if (name.split('/').includes('..')) throw new Error(`zipStored: "${name}" has a ".." segment; refused rather than guessed at`);
	return name;
}
function bytesOf(bytes, enc) { return typeof bytes === 'string' ? enc.encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); }
export function zipStoredSize(entries) {
	const enc = new TextEncoder();
	let size = 22;
	for (const e of entries) size += 76 + 2 * enc.encode(normalisedName(e.name)).length + bytesOf(e.bytes, enc).length;
	return size;
}
export function zipStored(entries, options = {}) { return finish(zipStoredSteps(entries, options)); }
export async function zipStoredAsync(entries, options = {}) { return finishAsync(zipStoredSteps(entries, options), options.work); }
function* zipStoredSteps(entries, options = {}) {
	if (entries.length >= 0xFFFF) throw new Error('zipStored: 65535 entries is the Zip64 sentinel, which this module does not implement');
	const enc = new TextEncoder();
	const files = [];
	for (const e of entries) {
		const nameBytes = enc.encode(normalisedName(e.name));
		if (nameBytes.length > 0xFFFF) throw new Error(`zipStored: "${e.name.slice(0, 40)}…" is longer than a zip name can be`);
		const data = bytesOf(e.bytes, enc);
		if (data.length > 0xFFFFFFFF) throw new Error(`zipStored: "${e.name}" is over 4 GiB, which would need Zip64`);
		let crc = 0;
		for (let at = 0; at < data.length; at += 65536) { crc = crc32(data.subarray(at, at + 65536), crc); yield; }
		files.push({nameBytes, data, size: data.length, crc, utf8Flag: options.utf8Flag, ...dosDateTime(e.modified ?? Date.now())});
	}
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
	for (const part of parts) {
		for (let at = 0; at < part.length; at += 65536) {
			const chunk = part.subarray(at, at + 65536); whole.set(chunk, pos); pos += chunk.length; yield;
		}
	}
	return whole;
}
