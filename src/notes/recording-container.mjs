// SPDX-License-Identifier: AGPL-3.0-only
// A duration inspection, NOT a decoder or a repair. The caller keeps every original byte,
// including an incomplete tail. MediaRecorder only guarantees playback of a completed recording.
export function streamingRecordingType(mime) {
	const parts = String(mime || '').toLowerCase().split(';').map(s => s.trim());
	return ['audio/webm', 'audio/ogg'].includes(parts[0]) && parts.slice(1).every(p => /^codecs\s*=\s*(?:opus|"opus")$/.test(p));
}
const unknown = container => ({container, duration: null, completeBytes: 0, resolution: null});
const ascii = bytes => new TextDecoder().decode(bytes);
const uint = bytes => { let n = 0; for (const b of bytes) { n = n * 256 + b; if (!Number.isSafeInteger(n)) return null; } return n; };
function vint(b, at, id = false) {
	if (at >= b.length || b[at] === 0) return null;
	let mask = 128, width = 1;
	while (!(b[at] & mask)) { mask >>= 1; width++; }
	if (width > (id ? 4 : 8) || at + width > b.length) return null;
	let n = id ? b[at] : b[at] & (mask - 1), all = !id && n === mask - 1;
	for (let j = 1; j < width; j++) { n = n * 256 + b[at + j]; all = all && b[at + j] === 255; }
	return {width, value: Number.isSafeInteger(n) ? n : null, unknown: all};
}
function element(b, at, limit = b.length) {
	const id = vint(b, at, true); if (!id) return null;
	const size = vint(b, at + id.width); if (!size) return null;
	const data = at + id.width + size.width;
	if (data > limit || size.value === null && !size.unknown) return null;
	const end = size.unknown ? limit : data + size.value;
	return {id: id.value, data, end, complete: end <= limit, unknown: size.unknown};
}
function children(b, from, to, visit) {
	for (let p = from; p < to;) {
		const e = element(b, p, to); if (!e || !e.complete || e.unknown) return false;
		visit(e); p = e.end;
	}
	return true;
}
function opusSeconds(packet) {
	if (!packet.length) return null;
	const config = packet[0] >> 3, code = packet[0] & 3;
	const frame = config >= 16 ? [2.5, 5, 10, 20][config & 3] : config >= 12 ? [10, 20][config & 1] : [10, 20, 40, 60][config & 3];
	const count = code === 0 ? 1 : code === 3 ? (packet[1] || 0) & 63 : 2;
	return count && frame * count <= 120 ? frame * count / 1000 : null;
}
// Matroska's three audio lacing forms. No packet bytes are copied.
function blockSeconds(b, from, to, lacing) {
	if (!lacing) return opusSeconds(b.subarray(from, to));
	if (from >= to) return null;
	const count = b[from++] + 1, sizes = [];
	if (lacing === 4) {
		if ((to - from) % count) return null;
		for (let n = 0; n < count - 1; n++) sizes.push((to - from) / count);
	} else if (lacing === 2) {
		for (let n = 0; n < count - 1; n++) {
			let size = 0, v;
			do { if (from >= to) return null; v = b[from++]; size += v; } while (v === 255);
			sizes.push(size);
		}
	} else if (count > 1) {
		const first = vint(b, from); if (!first || first.unknown || first.value == null) return null;
		from += first.width; sizes.push(first.value);
		for (let n = 1; n < count - 1; n++) {
			const delta = vint(b, from); if (!delta || delta.unknown || delta.value == null) return null;
			from += delta.width; sizes.push(sizes.at(-1) + delta.value - (2 ** (7 * delta.width - 1) - 1));
		}
	}
	sizes.push(to - from - sizes.reduce((a, n) => a + n, 0));
	let total = 0;
	for (const size of sizes) {
		if (!Number.isSafeInteger(size) || size < 1 || from + size > to) return null;
		const seconds = opusSeconds(b.subarray(from, from + size)); if (seconds == null) return null;
		total += seconds; from += size;
	}
	return from === to ? total : null;
}
function webm(b) {
	const out = unknown('webm'), head = element(b, 0);
	if (!head || head.id !== 0x1a45dfa3 || !head.complete || head.unknown) return out;
	let doc = '', track = null, scale = 1000000, delay = 0, last = null, bad = false;
	if (!children(b, head.data, head.end, e => { if (e.id === 0x4282) doc = ascii(b.subarray(e.data, e.end)); }) || doc !== 'webm') return out;
	const segment = element(b, head.end); if (!segment || segment.id !== 0x18538067) return out;
	const stop = Math.min(segment.end, b.length);
	const block = (e, time, padding = 0) => {
		const number = vint(b, e.data); if (!number || number.unknown || number.value !== track) return;
		const p = e.data + number.width;
		if (p + 3 > e.end) { bad = true; return; }
		const relative = new DataView(b.buffer, b.byteOffset + p, 2).getInt16(0);
		const seconds = blockSeconds(b, p + 3, e.end, b[p + 2] & 6); if (seconds == null || time == null) { bad = true; return; }
		const end = (time + relative) * scale / 1e9 + seconds - delay - Math.max(0, padding) / 1e9;
		if (!Number.isFinite(end) || end < 0) { bad = true; return; }
		last = Math.max(last ?? 0, end); out.completeBytes = e.end;
	};
	for (let p = segment.data; p < stop;) {
		const e = element(b, p, stop); if (!e) break;
		if (e.id === 0x1f43b675) {
			let time = null, q = e.data, end = Math.min(e.end, stop);
			while (q < end) {
				const c = element(b, q, end); if (!c || !c.complete || c.unknown) break;
				if (e.unknown && [0x1f43b675, 0x1549a966, 0x1654ae6b, 0x1c53bb6b].includes(c.id)) break;
				if (c.id === 0xe7) time = uint(b.subarray(c.data, c.end));
				if (c.id === 0xa3) block(c, time);
				if (c.id === 0xa0) {
					let item = null, padding = 0;
					if (children(b, c.data, c.end, v => {
						if (v.id === 0xa1) item = v;
						if (v.id === 0x75a2) { const a = b.subarray(v.data, v.end), n = uint(a); padding = n == null ? NaN : a[0] & 128 ? n - 2 ** (a.length * 8) : n; }
					}) && item) { const before = out.completeBytes; block(item, time, padding); if (out.completeBytes > before) out.completeBytes = c.end; }
				}
				q = c.end;
			}
			if (e.unknown) { if (q <= p || q >= stop) break; p = q; continue; }
		} else if (e.complete && !e.unknown) {
			if (e.id === 0x1549a966 && !children(b, e.data, e.end, c => { if (c.id === 0x2ad7b1) scale = uint(b.subarray(c.data, c.end)); })) bad = true;
			if (e.id === 0x1654ae6b) children(b, e.data, e.end, c => {
				if (c.id !== 0xae) return;
				let number, type, codec, privateBytes, codecDelay;
				if (!children(b, c.data, c.end, v => {
					const bytes = b.subarray(v.data, v.end);
					if (v.id === 0xd7) number = uint(bytes);
					if (v.id === 0x83) type = uint(bytes);
					if (v.id === 0x86) codec = ascii(bytes);
					if (v.id === 0x63a2) privateBytes = bytes;
					if (v.id === 0x56aa) codecDelay = uint(bytes);
				})) { bad = true; return; }
				if (type === 2) {
					if (track !== null || codec !== 'A_OPUS' || !privateBytes || privateBytes.length < 19 || ascii(privateBytes.subarray(0, 8)) !== 'OpusHead') { bad = true; return; }
					track = number; delay = (codecDelay ?? (privateBytes[10] + privateBytes[11] * 256) / 48000 * 1e9) / 1e9;
				}
			});
		} else break;
		if (!e.complete || e.unknown || e.end <= p) break;
		p = e.end;
	}
	if (!bad && track !== null && scale > 0 && last !== null) { out.duration = last; out.resolution = scale / 1e9; }
	return out;
}
function ogg(b) {
	const out = unknown('ogg'); let serial = null, seq = 0, preSkip = null, packet = [], packetLength = 0, headers = 0, prefix = [], samples = 0, origin = null;
	const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
	for (let p = 0; p + 27 <= b.length;) {
		if (ascii(b.subarray(p, p + 4)) !== 'OggS' || b[p + 4] !== 0) break;
		const count = b[p + 26], table = p + 27, data = table + count;
		if (data > b.length) break;
		let size = 0; for (let j = table; j < data; j++) size += b[j];
		const end = data + size; if (end > b.length) break;
		let crc = 0;
		for (let j = p; j < end; j++) {
			crc ^= (j >= p + 22 && j < p + 26 ? 0 : b[j]) << 24;
			for (let k = 0; k < 8; k++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
		}
		if ((crc >>> 0) !== view.getUint32(p + 22, true)) break;
		const sid = view.getUint32(p + 14, true), sequence = view.getUint32(p + 18, true), flags = b[p + 5];
		if (serial === null) { if (!(flags & 2) || sequence !== 0) break; serial = sid; }
		else if (flags & 2 || sid !== serial) return unknown('ogg'); // No duration guesses for chained streams.
		if (sequence !== seq++ || !!(flags & 1) !== (packetLength > 0)) break;
		let q = data, audio = false;
		for (let j = table; j < data; j++) {
			const length = b[j];
			if (headers < 2) { if (packetLength + length > 65536) return unknown('ogg'); packet.push(b.subarray(q, q + length)); }
			if (headers >= 2) for (let k = 0; k < length && prefix.length < 2; k++) prefix.push(b[q + k]);
			packetLength += length; q += length;
			if (length < 255) {
				if (headers < 2) {
					const bytes = new Uint8Array(packetLength); let at = 0; for (const part of packet) { bytes.set(part, at); at += part.length; }
					if (headers === 0) { if (bytes.length < 19 || ascii(bytes.subarray(0, 8)) !== 'OpusHead' || bytes[8] > 15) return out; preSkip = bytes[10] + bytes[11] * 256; }
					else if (ascii(bytes.subarray(0, 8)) !== 'OpusTags') return out;
					headers++;
				} else { const seconds = opusSeconds(prefix); if (seconds == null) return out; samples += Math.round(seconds * 48000); audio = true; }
				packet = []; prefix = []; packetLength = 0;
			}
		}
		const granule = view.getBigUint64(p + 6, true);
		if (audio && granule !== 0xffffffffffffffffn && granule <= BigInt(Number.MAX_SAFE_INTEGER) && Number(granule) >= preSkip) {
			if (origin === null) { if (Number(granule) < samples && !(flags & 4)) return out; origin = Math.max(0, Number(granule) - samples); }
			const seconds = (Number(granule) - origin - preSkip) / 48000;
			if (seconds < 0) return out;
			if (out.duration !== null && seconds < out.duration) return unknown('ogg');
			out.duration = seconds; out.completeBytes = end; out.resolution = 1 / 48000;
		}
		p = end;
	}
	return out;
}
export function inspectRecording(bytes, mime) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const type = String(mime || '').split(';')[0].trim().toLowerCase();
	if (type === 'audio/webm') return webm(b);
	if (type === 'audio/ogg') return ogg(b);
	return unknown(null);
}
