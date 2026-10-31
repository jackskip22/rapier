// SPDX-License-Identifier: AGPL-3.0-only

const WINDOWS_1252 = new Map([0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F, 0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
	0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178].map((code, index) => [code, 0x80 + index]));

async function windows1252Bytes(text, options) {
	const out = new Uint8Array(text.length);
	for (let start = 0; start < text.length;) {
		options.signal?.throwIfAborted();
		const end = Math.min(text.length, start + 65536);
		for (let i = start; i < end; i++) {
			const code = text.charCodeAt(i);
			if (code < 0x80 || (code >= 0xA0 && code <= 0xFF)) { out[i] = code; continue; }
			const byte = WINDOWS_1252.get(code);
			if (byte === undefined) return null;
			out[i] = byte;
		}
		start = end;
		if (start < text.length && options.yield) await options.yield();
	}
	return out;
}

async function utf8Blob(text, trailer, bom, type, options) {
	const parts = bom ? [new Blob(['\uFEFF'])] : [];
	for (const value of [text, trailer]) for (let start = 0; start < value.length;) {
		options.signal?.throwIfAborted();
		let end = Math.min(value.length, start + 65536);
		if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff &&
				value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff) end++;
		parts.push(new Blob([value.slice(start, end)])); start = end;
		if (parts.length % 16 === 0) await (options.yield ? options.yield() : new Promise(resolve => setTimeout(resolve, 0)));
	}
	options.signal?.throwIfAborted();
	return new Blob(parts, {type});
}

export async function saveFileBytes(text, options = {}) {
	const body = String(text ?? ''), trailer = String(options.trailer || '');
	const type = options.type === undefined ? 'text/plain' : options.type;
	if (options.encoding === 'windows-1252') {
		const bytes = await windows1252Bytes(body + trailer, options);
		options.signal?.throwIfAborted();
		if (bytes) return {blob: new Blob([bytes], {type}), encoding: 'windows-1252', bom: false};
		return {blob: await utf8Blob(body, trailer, true, type, options), encoding: 'utf-8', bom: true};
	}
	const bom = options.bom === true;
	return {blob: await utf8Blob(body, trailer, bom, type, options), encoding: 'utf-8', bom};
}
