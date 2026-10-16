// SPDX-License-Identifier: AGPL-3.0-only
import {createPaintPNGCodec} from '../draw/paint-png.mjs';
import {inspectJPEGXL} from './header.mjs';
import {inspectRaster} from './raster.mjs';
import {readJXL, jxlRefused, codestreamComplete} from './jxl-native.mjs';

const png = createPaintPNGCodec(), JXL = 'data:image/jxl;base64,';
let hostedDecoder = null;
const check = signal => { if (signal?.aborted) { const error = new Error('Painting canceled'); error.name = 'AbortError'; throw error; } };
export function configurePaintRasterDecoder(decoder) {
	if (decoder !== null && typeof decoder !== 'function') throw new TypeError('A paint raster decoder must be a function');
	hostedDecoder = decoder;
}
function base64Bytes(raster) {
	const binary = atob(raster.slice(raster.indexOf(',') + 1)), bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	return bytes;
}
function jxlBytes(raster, bytes) {
	if (typeof raster !== 'string' || !raster.startsWith(JXL)) return null;
	if (raster.length > 24 * 1024 * 1024) throw new Error('Painting raster exceeds its byte budget');
	bytes ||= base64Bytes(raster);
	let info;
	try { info = inspectJPEGXL(bytes); } catch (error) { throw ['JXL_SIGNATURE', 'JXL_CONTAINER', 'JXL_HEADER'].includes(error?.code) ? Object.assign(damaged(), {cause: error}) : error; }
	if (info.width > 16384 || info.height > 16384 || info.width * info.height > 12000000) throw new Error('Painting raster exceeds its pixel budget');
	return {bytes, info};
}
const damaged = () => Object.assign(new Error('Damaged painting JPEG XL'), {code: 'paint_raster_damaged'});
const unavailable = cause => Object.assign(new Error('This browser cannot verify this painting JPEG XL.'), {code: 'paint_raster_decoder_unavailable', cause});
async function readNative(read, signal) {
	check(signal);
	let got;
	try { got = await readJXL(read.bytes, {signal}); }
	catch (error) { check(signal); if (error?.name === 'AbortError') throw error; throw jxlRefused(error) ? Object.assign(damaged(), {refusal: true}) : unavailable(error); }
	check(signal);
	if (got?.whole === false || !got?.whole && codestreamComplete(read.bytes) === false) throw damaged();
	return got;
}
export async function decodeNativePaintJXL(raster, {signal} = {}) {
	check(signal);
	if (typeof raster !== 'string' || !raster.startsWith(JXL)) return null;
	const read = await readPaintRaster(raster, signal);
	if (!read?.whole) throw unavailable();
	return read.pixels;
}
async function readPaintRaster(raster, signal, bytes) {
	check(signal);
	if (typeof raster !== 'string') return null;
	if (raster.startsWith('data:image/png;base64,')) { const pixels = await png.decode(raster); check(signal); return pixels && {pixels, whole: true}; }
	const read = jxlBytes(raster, bytes); if (!read) return null;
	let got = null, failed = null;
	try { got = await readNative(read, signal); }
	catch (error) { if (!hostedDecoder || !(error?.refusal || error?.code === 'paint_raster_decoder_unavailable')) throw error; failed = error; }
	if (!got?.whole && hostedDecoder) {
		const pixels = await hostedDecoder(read.bytes, {signal});
		check(signal);
		if (pixels) { got = {pixels, whole: true}; failed = null; }
	}
	if (failed) throw failed;
	return got && shaped(got, read);
}
function shaped(got, read) {
	const pixels = got.pixels;
	if (pixels.width !== read.info.width || pixels.height !== read.info.height || !(pixels.data instanceof Uint8Array || pixels.data instanceof Uint8ClampedArray) || pixels.data.length !== pixels.width * pixels.height * 4) throw new Error('The paint decoder returned a different raster');
	return got;
}
export async function portablePaintPNG(raster, {signal} = {}) {
	const read = await readPaintRaster(raster, signal);
	if (!read?.whole) return null;
	const url = typeof CompressionStream === 'function' ? await png.compressed(read.pixels) : png.encode(read.pixels);
	check(signal);
	return url;
}
export async function decodePaintRaster(raster, {signal} = {}) {
	const read = await readPaintRaster(raster, signal);
	return read?.whole ? read.pixels : null;
}

export async function validatePaintRaster(raster, {signal, nativeRead} = {}) {
	check(signal);
	if (typeof raster !== 'string' || !/^data:image\/(?:png|jxl);base64,/.test(raster)) throw new Error('Invalid painting raster');
	const bytes = base64Bytes(raster), info = raster.startsWith(JXL) ? inspectJPEGXL(bytes) : inspectRaster(bytes);
	let read = null;
	try { read = info.width * info.height <= png.pixelLimit ? await readPaintRaster(raster, signal, bytes) : null; }
	catch (error) { if (error?.code !== 'paint_raster_decoder_unavailable') throw error; }
	check(signal);
	if (read?.whole) return true;
	if (typeof nativeRead === 'function') {
		const valid = await nativeRead(raster, {signal});
		check(signal);
		if (valid === true) return true;
	}
	throw Object.assign(new Error('This host cannot fully decode this painting raster.'), {code: 'paint_raster_decoder_unavailable'});
}


export function paintRecompressionWorker(makePNG) {
	const png = makePNG();
	let original = null, fastBytes = 0;
	const bytesOf = raster => {
		const encoded = raster.slice(raster.indexOf(',') + 1), binary = atob(encoded), bytes = new Uint8Array(binary.length);
		for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
		return bytes;
	};
	const same = pixels => {
		if (!pixels || !original || pixels.width !== original.width || pixels.height !== original.height || pixels.data.length !== original.data.length) return false;
		for (let at = 0; at < original.data.length; at++) if (pixels.data[at] !== original.data[at]) return false;
		return true;
	};
	async function read(bytes) {
		if (typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl')) return null;
		const decoder = new ImageDecoder({data: bytes, type: 'image/jxl', premultiplyAlpha: 'none', preferAnimation: false});
		try {
			const result = await decoder.decode({frameIndex: 0, completeFramesOnly: true}), image = result.image;
			try {
				const width = image.displayWidth, height = image.displayHeight, format = image.format, colour = image.colorSpace;
				if (!result.complete || !decoder.complete || decoder.tracks.selectedTrack?.frameCount !== 1 ||
					width !== original.width || height !== original.height || image.codedWidth !== width || image.codedHeight !== height ||
					!['RGBA', 'RGBX', 'BGRA', 'BGRX'].includes(format) || colour?.primaries !== 'bt709' ||
					colour.transfer !== 'iec61966-2-1' || colour.matrix !== 'rgb' || colour.fullRange !== true) return null;
				const rect = image.visibleRect;
				if (!rect || rect.x !== 0 || rect.y !== 0 || rect.width !== width || rect.height !== height) return null;
				const data = new Uint8Array(width * height * 4);
				await image.copyTo(data, {rect: {x: 0, y: 0, width, height}, layout: [{offset: 0, stride: width * 4}]});
				if (format[0] === 'B') for (let at = 0; at < data.length; at += 4) { const blue = data[at]; data[at] = data[at + 2]; data[at + 2] = blue; }
				if (format[3] === 'X') for (let at = 3; at < data.length; at += 4) data[at] = 255;
				return {width, height, data};
			} finally { image.close(); }
		} finally { decoder.close(); }
	}
	globalThis.onmessage = async ({data: message}) => {
		try {
			if (message.operation === 'open') {
				original = null;
				if (typeof message.raster !== 'string' || !message.raster.startsWith('data:image/jxl;base64,') ||
					typeof message.source !== 'string' || !png.isOwn(message.source)) throw new Error('No exact painting source');
				const pixels = await png.decode(message.source), box = message.box;
				if (!pixels) throw new Error('No exact painting source');
				if (box) {
					if (![box.x0, box.y0, box.x1, box.y1].every(Number.isSafeInteger) || box.x0 < 0 || box.y0 < 0 ||
						box.x1 < box.x0 || box.y1 < box.y0 || box.x1 >= pixels.width || box.y1 >= pixels.height) throw new Error('Invalid painting source bounds');
					const width = box.x1 - box.x0 + 1, height = box.y1 - box.y0 + 1, data = new Uint8Array(width * height * 4);
					for (let y = 0; y < height; y++) data.set(pixels.data.subarray(((box.y0 + y) * pixels.width + box.x0) * 4, ((box.y0 + y) * pixels.width + box.x1 + 1) * 4), y * width * 4);
					original = {width, height, data};
				} else original = pixels;
				const bytes = bytesOf(message.raster); fastBytes = bytes.length;
				const decoded = await read(bytes);
				if (!same(decoded)) { original = null; globalThis.postMessage({id: message.id, ok: true, pixels: null}); return; }
				globalThis.postMessage({id: message.id, ok: true, pixels: decoded}, [decoded.data.buffer]);
			} else if (message.operation === 'check') {
				const bytes = message.bytes;
				let raster = null;
				if (original && bytes instanceof Uint8Array && bytes.length < fastBytes && same(await read(bytes))) {
					let binary = '';
					for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
					raster = 'data:image/jxl;base64,' + btoa(binary);
				}
				original = null;
				globalThis.postMessage({id: message.id, ok: true, raster});
			} else throw new Error('Unknown painting verification request');
		} catch (error) { original = null; globalThis.postMessage({id: message.id, ok: false, error: String(error?.message || error)}); }
	};
}
