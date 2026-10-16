// SPDX-License-Identifier: AGPL-3.0-only
import {jxlCodestreamParts} from './header.mjs';

const PROBE = '/woAAACClQgIEACYAAAAAAEIAEsYk46DQ5SAGgEgvLkI0zH5QDC1/AsIAUCQBSZIe6M9RA4N7uMAcwZvBzMA';
const FORMATS = ['RGBA', 'RGBX', 'BGRA', 'BGRX'], ROUTES = ['decoder', 'bitmap'];
const LIMIT = {edge: 16384, pixels: 12000000};
let traits = null;

async function frameRGBA(frame, limit) {
	const width = frame.displayWidth, height = frame.displayHeight, format = frame.format;
	if (!FORMATS.includes(format)) return null;
	if (!width || !height || width > limit.edge || height > limit.edge || width * height > limit.pixels) throw new Error('Painting raster exceeds its pixel budget');
	const data = new Uint8ClampedArray(width * height * 4);
	await frame.copyTo(data, {rect: {x: 0, y: 0, width, height}, layout: [{offset: 0, stride: width * 4}]});
	if (format[0] === 'B') for (let q = 0; q < data.length; q += 4) { const b = data[q]; data[q] = data[q + 2]; data[q + 2] = b; }
	if (format[3] === 'X') for (let q = 3; q < data.length; q += 4) data[q] = 255;
	return {width, height, data};
}
export async function readNativeJXL(bytes, route, {limit = LIMIT, pixels = true, signal} = {}) {
	if (route === 'decoder') {
		signal?.throwIfAborted();
		const decoder = new ImageDecoder({data: bytes, type: 'image/jxl', premultiplyAlpha: 'none'}), stop = () => decoder.close();
		signal?.addEventListener('abort', stop, {once: true});
		try {
			const {image} = await decoder.decode({completeFramesOnly: true}).catch(refusal);
			try { return pixels ? await frameRGBA(image, limit) : true; } finally { image.close(); }
		} finally { signal?.removeEventListener('abort', stop); decoder.close(); }
	}
	if (route !== 'bitmap') return null;
	signal?.throwIfAborted();
	const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/jxl'}), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'}).catch(refusal);
	try {
		if (!pixels) return true;
		const frame = new VideoFrame(bitmap, {timestamp: 0});
		try { return await frameRGBA(frame, limit); } finally { frame.close(); }
	} finally { bitmap.close(); }
}
const REFUSALS = ['EncodingError', 'RangeError', 'InvalidStateError'];
function refusal(error) {
	if (REFUSALS.includes(error?.name)) throw Object.assign(new Error(String(error.message || error.name)), {name: error.name, jxlRefusal: true, cause: error});
	throw error;
}
export const jxlRefused = error => error?.jxlRefusal === true && error.name === 'EncodingError';
const declined = error => error?.jxlRefusal === true;
async function measureRoute(route, bytes, want) {
	if (route === 'decoder' ? typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl').catch(() => false)
		: typeof createImageBitmap !== 'function') return null;
	const refuses = async input => { try { await readNativeJXL(input, route, {pixels: false}); return false; } catch (error) { return declined(error); } };
	let got = null;
	try { got = await readNativeJXL(bytes, route, {pixels: typeof VideoFrame === 'function' || route === 'decoder'}); } catch { return null; }
	const exact = !!got?.data && got.data.length === want.length && got.data.every((v, at) => v === want[at]);
	const short = bytes.slice(0, -1); short[11] -= 4;
	return {exact, cut: await refuses(bytes.subarray(0, bytes.length - 1)), short: await refuses(short)};
}
async function measure() {
	const binary = atob(PROBE), bytes = new Uint8Array(binary.length), want = new Uint8Array(257 * 4), out = {};
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	for (let x = 0; x < 257; x++) want.set(x < 256 ? [200, 10, 30, x ? 2 : 0] : [7, 9, 11, 1], x * 4);
	for (const route of ROUTES) out[route] = await measureRoute(route, bytes, want);
	return out;
}
export function jxlNativeTraits() { return traits ||= measure(); }
function attests(trait, bytes) {
	const extent = trait.cut ? null : codestreamComplete(bytes);
	if (extent === false) return false;
	return trait.short && (trait.cut || extent === true) ? true : null;
}
export async function readJXL(bytes, {limit = LIMIT, signal} = {}) {
	const t = await untilAborted(jxlNativeTraits(), signal);
	if (!ROUTES.some(name => t[name]?.exact)) return null;
	const failures = [];
	for (const route of ROUTES.filter(name => t[name]?.exact)) {
		try { const pixels = await readNativeJXL(bytes, route, {limit, signal}); if (pixels) return {pixels, whole: attests(t[route], bytes)}; failures.push(null); }
		catch (error) { signal?.throwIfAborted(); if (error?.name === 'AbortError') throw error; failures.push(error); }
	}
	if (failures.every(jxlRefused) && codestreamComplete(bytes) === true && await refusedByAll(bytes, t, signal)) throw failures[0];
	return null;
}
async function refusedByAll(bytes, t, signal) {
	for (const route of ROUTES.filter(name => t[name] && !t[name].exact)) {
		try { await readNativeJXL(bytes, route, {pixels: false, signal}); return false; }
		catch (error) { signal?.throwIfAborted(); if (!jxlRefused(error)) return false; }
	}
	return true;
}
export async function jxlWhole(bytes) {
	const t = await jxlNativeTraits();
	let readers = 0, malformed = 0;
	for (const route of ROUTES) {
		const trait = t[route];
		if (!trait) continue;
		readers++;
		const verdict = trait.short ? attests(trait, bytes) : null;
		if (verdict === false) return false;
		try { await readNativeJXL(bytes, route, {pixels: false}); }
		catch (error) { if (jxlRefused(error)) malformed++; continue; }
		if (verdict === true) return true;
	}
	const extent = codestreamComplete(bytes);
	if (extent === false) return false;
	return readers && malformed === readers && extent === true ? false : null;
}
function untilAborted(promise, signal) {
	if (!signal) return promise;
	signal.throwIfAborted();
	return new Promise((ok, no) => {
		const stop = () => no(signal.reason);
		signal.addEventListener('abort', stop, {once: true});
		promise.then(value => { signal.removeEventListener('abort', stop); ok(value); }, error => { signal.removeEventListener('abort', stop); no(error); });
	});
}

const CUT = Symbol('cut'), FORM = Symbol('form');
export function codestreamComplete(input) {
	try { return walk(...codestream(input)); }
	catch (error) { if (error === CUT) return false; if (error === FORM) return null; throw error; }
}
function codestream(bytes) {
	let parts;
	try { parts = jxlCodestreamParts(bytes); } catch (error) { throw error?.code === 'JXL_CONTAINER' ? CUT : FORM; }
	const total = parts.reduce((n, p) => n + p.length, 0);
	if (parts.length === 1) return [parts[0], total];
	const head = new Uint8Array(Math.min(total, 65536));
	let at = 0; for (const part of parts) { if (at === head.length) break; const take = Math.min(head.length - at, part.length); head.set(part.subarray(0, take), at); at += take; }
	return [head, total];
}
function walk(bytes, total) {
	let bit = 0;
	const bits = count => {
		if (bit + count > bytes.length * 8) throw bit + count > total * 8 ? CUT : FORM;
		let value = 0;
		for (let i = 0; i < count; i++, bit++) value += ((bytes[bit >>> 3] >>> (bit & 7)) & 1) * 2 ** i;
		return value;
	};
	const u32 = choices => { const [n, offset] = choices[bits(2)]; return offset + (n ? bits(n) : 0); };
	const flag = () => bits(1) === 1, en = () => u32([[0, 0], [0, 1], [4, 2], [6, 18]]);
	const u64 = () => { const s = bits(2); if (s === 0) return 0; if (s === 1) return 1 + bits(4); if (s === 2) return 17 + bits(8); throw FORM; };
	const none = value => { if (value) throw FORM; };
	const depth = () => { if (flag()) { u32([[0, 32], [0, 16], [0, 24], [6, 1]]); bits(4); } else u32([[0, 8], [0, 10], [0, 12], [6, 1]]); };
	const size = () => {
		const small = flag(), dim = () => small ? 8 * (1 + bits(5)) : u32([[9, 1], [13, 1], [18, 1], [30, 1]]);
		const height = dim(), ratio = bits(3);
		if (!ratio) return {width: dim(), height};
		const num = [0, 1, 12, 4, 3, 16, 5, 2][ratio], den = [1, 1, 10, 3, 2, 9, 4, 1][ratio];
		return {width: Math.floor(height * num / den), height};
	};
	if (bits(16) !== 0x0AFF) throw FORM;
	const {width, height} = size();
	let xyb = true, extra = 0;
	if (!flag()) {
		const fields = flag();
		if (fields) { bits(3); if (flag()) size(); if (flag()) throw FORM; if (flag()) throw FORM; }
		depth(); bits(1);
		extra = u32([[0, 0], [0, 1], [4, 2], [12, 1]]);
		for (let c = 0; c < extra; c++) {
			if (flag()) continue;
			const type = en(); depth(); u32([[0, 0], [0, 3], [0, 4], [3, 1]]);
			const name = u32([[0, 0], [4, 0], [5, 16], [10, 48]]); bits(8 * name);
			if (type === 0) bits(1); else if (type === 2) bits(64); else if (type === 5) u32([[0, 1], [2, 0], [4, 3], [8, 19]]);
		}
		xyb = flag();
		if (!flag()) {
			if (flag()) throw FORM;
			const space = en();
			const xy = count => { for (let i = 0; i < 2 * count; i++) u32([[19, 0], [19, 524288], [20, 1048576], [21, 2097152]]); };
			if (space !== 3) { const white = en(); if (white === 2) xy(1); else if (white === 7) throw FORM; }
			if (space !== 1 && space !== 3) { const primaries = en(); if (primaries === 2) xy(3); }
			if (flag()) bits(24); else en();
			en();
		}
		if (fields && !flag()) { bits(16); bits(16); bits(1); bits(16); }
		none(u64());
	}
	if (!flag()) throw FORM;
	bit = (bit + 7) & ~7;
	for (let last = false; !last;) {
		let encoding = 0, shift = 1, upsampling = 1, passes = 1, type = 0, w = width, h = height;
		last = true;
		if (!flag()) {
			type = bits(2); encoding = bits(1);
			const lf = u64() & 0x20;
			const ycbcr = !xyb && flag();
			if (ycbcr && !lf) bits(6);
			if (!lf) {
				upsampling = [1, 2, 4, 8][bits(2)];
				for (let c = 0; c < extra; c++) bits(2);
			}
			if (encoding === 1) shift = bits(2);
			if (encoding === 0 && xyb) bits(6);
			if (type !== 2) {
				passes = u32([[0, 1], [0, 2], [0, 3], [3, 4]]);
				if (passes !== 1) {
					const steps = u32([[0, 0], [0, 1], [0, 2], [1, 3]]);
					bits(2 * (passes - 1 + steps));
					for (let i = 0; i < steps; i++) u32([[0, 0], [0, 1], [0, 2], [3, 0]]);
				}
			}
			if (type === 1) {
				const scale = 8 ** (bits(2) + 1);
				w = Math.ceil(w / scale); h = Math.ceil(h / scale); last = false;
			} else if (flag()) {
				if (type !== 2) throw FORM;
				const dim = () => u32([[8, 0], [11, 256], [14, 2304], [30, 18688]]);
				w = dim(); h = dim();
			}
			if (type === 0 || type === 3) {
				for (let c = 0; c <= extra; c++) if (u32([[0, 0], [0, 1], [0, 2], [2, 3]]) !== 0) throw FORM;
				last = flag();
				if (!last) throw FORM;
			} else if (type === 2) { last = false; bits(2); bits(1); }
			const name = u32([[0, 0], [4, 0], [5, 16], [10, 48]]); bits(8 * name);
			if (!flag()) {
				if (flag() && flag()) bits(96);
				if (bits(2)) {
					if (!encoding && flag() || flag() || flag()) throw FORM;
					if (encoding) bits(16);
				}
				none(u64());
			}
			none(u64());
		}
		const dim = 128 << shift, fw = Math.ceil(w / upsampling), fh = Math.ceil(h / upsampling);
		const groups = Math.ceil(fw / dim) * Math.ceil(fh / dim), dcGroups = Math.ceil(fw / (8 * dim)) * Math.ceil(fh / (8 * dim));
		const entries = groups === 1 && passes === 1 ? 1 : 2 + dcGroups + groups * passes;
		if (flag()) throw FORM;
		bit = (bit + 7) & ~7;
		let sum = 0;
		for (let e = 0; e < entries; e++) sum += u32([[10, 0], [14, 1024], [22, 17408], [30, 4211712]]);
		bit = ((bit + 7) & ~7) + sum * 8;
		if (bit > total * 8) return false;
	}
	return true;
}
