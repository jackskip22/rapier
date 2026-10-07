// Straight RGBA is the material, including low-alpha colour. Canvas is only its display.
// This self-contained factory runs unchanged in the page and its offline Blob worker.
export function createPaintPNGCodec() {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; table[n] = c; }
	const crc = bytes => { let c = -1; for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 255] ^ c >>> 8; return (c ^ -1) >>> 0; };
	const join = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
	const chunk = (tag, bytes) => { const out = new Uint8Array(12 + bytes.length), view = new DataView(out.buffer); view.setUint32(0, bytes.length); for (let i = 0; i < 4; i++) out[i + 4] = tag.charCodeAt(i); out.set(bytes, 8); view.setUint32(8 + bytes.length, crc(out.subarray(4, 8 + bytes.length))); return out; };
	const rows = px => { if (!Number.isInteger(px.width) || !Number.isInteger(px.height) || px.width < 1 || px.height < 1 || px.width * px.height > 12000000 || px.data.length !== px.width * px.height * 4) throw new Error('Invalid painting pixels'); const stride = px.width * 4, out = new Uint8Array((stride + 1) * px.height); for (let y = 0; y < px.height; y++) out.set(px.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); return out; };
	const png = (px, compressed) => { const h = new Uint8Array(13), v = new DataView(h.buffer); v.setUint32(0, px.width); v.setUint32(4, px.height); h[8] = 8; h[9] = 6; return join([new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', h), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())]); };
	const url = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384)); return 'data:image/png;base64,' + btoa(s); };
	function stored(raw) {
		const count = Math.ceil(raw.length / 65535), out = new Uint8Array(raw.length + 6 + count * 5); out.set([120, 1]); let at = 2, a = 1, b = 0;
		for (let offset = 0; offset < raw.length; offset += 65535) { const n = Math.min(65535, raw.length - offset); out.set([offset + n === raw.length ? 1 : 0, n & 255, n >>> 8, ~n & 255, ~n >>> 8 & 255], at); at += 5; out.set(raw.subarray(offset, offset + n), at); at += n; }
		// Adler's 5552-byte block keeps both integer sums exact, paying modulo once per block.
		for (let i = 0; i < raw.length;) { const end = Math.min(i + 5552, raw.length); for (; i < end; i++) { a += raw[i]; b += a; } a %= 65521; b %= 65521; }
		new DataView(out.buffer).setUint32(at, ((b << 16) | a) >>> 0); return out;
	}
	const encodeBytes = (px, deflate = stored) => png(px, new Uint8Array(deflate(rows(px))));
	const encode = px => url(encodeBytes(px));
	async function compressed(px) { const raw = rows(px), stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')); return url(png(px, new Uint8Array(await new Response(stream).arrayBuffer()))); }
	async function decode(raster) {
		if (!raster.startsWith('data:image/png;base64,')) return null;
		const bytes = Uint8Array.from(atob(raster.slice(22)), c => c.charCodeAt(0)), v = new DataView(bytes.buffer);
		if (bytes.length < 57 || v.getUint32(0) !== 0x89504e47 || v.getUint32(4) !== 0x0d0a1a0a) throw new Error('Invalid painting PNG');
		const width = v.getUint32(16), height = v.getUint32(20);
		const colour = bytes[25], channels = {0: 1, 2: 3, 4: 2, 6: 4}[colour];
		if (bytes[24] !== 8 || !channels || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null;
		if (!width || !height || width * height > 12000000) throw new Error('Painting PNG is too large');
		const parts = []; let profiled = false;
		for (let at = 8; at + 12 <= bytes.length;) { const n = v.getUint32(at); if (at + n + 12 > bytes.length || crc(bytes.subarray(at + 4, at + n + 8)) !== v.getUint32(at + n + 8)) throw new Error('Damaged painting PNG'); const tag = v.getUint32(at + 4); if ([0x69434350,0x67414d41,0x6348524d,0x65584966].includes(tag)) profiled = true; if (tag === 0x49444154) parts.push(bytes.subarray(at + 8, at + 8 + n)); at += n + 12; }
		// Imported profiles/orientation belong to the browser's colour-managed reader. Our working
		// PNGs carry untagged straight sRGB and are the only pixels this raw path owns.
		if (profiled) return null;
		const limit = (width * channels + 1) * height, reader = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader(), raw = new Uint8Array(limit); let used = 0;
		try { for (;;) { const {done, value} = await reader.read(); if (done) break; if (used + value.length > limit) throw new Error('Invalid painting PNG size'); raw.set(value, used); used += value.length; } } finally { await reader.cancel(); }
		if (used !== limit) throw new Error('Truncated painting PNG');
		const stride = width * channels, data = new Uint8ClampedArray(stride * height);
		const paeth = (a,b,c) => { const p = a+b-c, x = Math.abs(p-a), y = Math.abs(p-b), z = Math.abs(p-c); return x <= y && x <= z ? a : y <= z ? b : c; };
		for (let y = 0; y < height; y++) { const filter = raw[y * (stride + 1)]; if (filter > 4) throw new Error('Invalid painting PNG filter'); for (let x = 0; x < stride; x++) { const at = y * stride + x, a = x >= channels ? data[at - channels] : 0, b = y ? data[at - stride] : 0, c = y && x >= channels ? data[at - stride - channels] : 0; data[at] = (raw[y * (stride + 1) + x + 1] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a+b) >> 1 : paeth(a,b,c))) & 255; } }
		if (colour === 6) return {width, height, data};
		// A decoded JPEG XL may expose opaque RGB or grey PNG channels. Expand them directly;
		// no premultiplication or colour conversion stands between this reader and the material.
		const rgba = new Uint8ClampedArray(width * height * 4);
		for (let p = 0, q = 0; p < data.length; p += channels, q += 4) {
			rgba[q] = data[p]; rgba[q + 1] = colour === 2 ? data[p + 1] : data[p]; rgba[q + 2] = colour === 2 ? data[p + 2] : data[p]; rgba[q + 3] = colour === 4 ? data[p + 1] : 255;
		}
		return {width, height, data: rgba};
	}
	// The synchronous PNG is stored, not compressed (about 5.3 characters a pixel): its zlib header 78 01 and a stored
	// first block, read from the first 48 bytes. No budget weighs it: it is never the form a painting is kept in.
	function isStored(raster) {
		if (!raster.startsWith('data:image/png;base64,')) return false;
		let head;
		try { head = atob(raster.slice(22, 86)); } catch (_) { return false; }
		return head.length === 48 && head.slice(37, 41) === 'IDAT' && head.charCodeAt(41) === 0x78 && head.charCodeAt(42) === 0x01 && (head.charCodeAt(43) & 6) === 0;
	}
	return {encode, encodeBytes, compressed, decode, isStored};
}
