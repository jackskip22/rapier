// SPDX-License-Identifier: AGPL-3.0-only
// Paint reads straight channels. A display canvas cannot own a raster at low alpha.
import {createPaintPNGCodec} from '../draw/paint-png.mjs';
import {inspectJPEGXL} from './header.mjs';
import {inspectRaster} from './raster.mjs';

const png = createPaintPNGCodec(), JXL = 'data:image/jxl;base64,';
let hostedDecoder = null;
const check = signal => { if (signal?.aborted) { const error = new Error('Painting cancelled'); error.name = 'AbortError'; throw error; } };
export function configurePaintRasterDecoder(decoder) {
	if (decoder !== null && typeof decoder !== 'function') throw new TypeError('A paint raster decoder must be a function');
	hostedDecoder = decoder;
}
function jxlBytes(raster) {
	if (typeof raster !== 'string' || !raster.startsWith(JXL)) return null;
	if (raster.length > 24 * 1024 * 1024) throw new Error('Painting raster exceeds its byte budget');
	// Keep one byte allocation, without a character list proportional to the encoded painting.
	const binary = atob(raster.slice(JXL.length)), bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	const info = inspectJPEGXL(bytes);
	if (info.width > 16384 || info.height > 16384 || info.width * info.height > 12000000) throw new Error('Painting raster exceeds its pixel budget');
	return {bytes, info};
}
async function nativePixels(bytes, signal) {
	if (typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl').catch(() => false)) return null;
	check(signal);
	const decoder = new ImageDecoder({data: bytes, type: 'image/jxl', premultiplyAlpha: 'none'});
	try {
		const {image} = await decoder.decode();
		try {
			check(signal);
			const width = image.displayWidth, height = image.displayHeight, format = image.format;
			if (!['RGBA', 'RGBX', 'BGRA', 'BGRX'].includes(format)) return null;
			if (!width || !height || width > 16384 || height > 16384 || width * height > 12000000) throw new Error('Painting raster exceeds its pixel budget');
			const data = new Uint8ClampedArray(width * height * 4);
			await image.copyTo(data, {rect: {x: 0, y: 0, width, height}, layout: [{offset: 0, stride: width * 4}]});
			check(signal);
			if (format[0] === 'B') for (let q = 0; q < data.length; q += 4) { const b = data[q]; data[q] = data[q + 2]; data[q + 2] = b; }
			if (format[3] === 'X') for (let q = 3; q < data.length; q += 4) data[q] = 255;
			return {width, height, data};
		} finally { image.close(); }
	} finally { decoder.close(); }
}
export async function decodeNativePaintJXL(raster, {signal} = {}) {
	check(signal);
	const read = jxlBytes(raster);
	return read ? nativePixels(read.bytes, signal) : null;
}
export async function decodePaintRaster(raster, {signal} = {}) {
	check(signal);
	if (typeof raster !== 'string') return null;
	if (raster.startsWith('data:image/png;base64,')) { const pixels = await png.decode(raster); check(signal); return pixels; }
	const read = jxlBytes(raster); if (!read) return null;
	const pixels = await nativePixels(read.bytes, signal) || (hostedDecoder ? await hostedDecoder(read.bytes, {signal}) : null);
	check(signal);
	if (pixels && (pixels.width !== read.info.width || pixels.height !== read.info.height || !(pixels.data instanceof Uint8Array || pixels.data instanceof Uint8ClampedArray) || pixels.data.length !== pixels.width * pixels.height * 4)) throw new Error('The paint decoder returned a different raster');
	return pixels;
}

// A recipe may carry an imported PNG the straight-channel reader does not own
// (a profile, palette or interlace), or pixels beyond that reader's allocation
// budget. The browser's native reader can attest those bytes without rewriting
// them. A host without that reader must say it cannot validate this raster.
export async function validatePaintRaster(raster, {signal, nativeRead} = {}) {
	check(signal);
	if (typeof raster !== 'string' || !/^data:image\/(?:png|jxl);base64,/.test(raster)) throw new Error('Invalid painting raster');
	const binary = atob(raster.slice(raster.indexOf(',') + 1)), bytes = new Uint8Array(binary.length);
	for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
	const info = raster.startsWith(JXL) ? inspectJPEGXL(bytes) : inspectRaster(bytes);
	const pixels = info.width * info.height <= png.pixelLimit ? await decodePaintRaster(raster, {signal}) : null;
	check(signal);
	if (pixels) return true;
	if (typeof nativeRead === 'function') {
		const valid = await nativeRead(raster, {signal});
		check(signal);
		if (valid === true) return true;
	}
	throw Object.assign(new Error('This host cannot fully decode this painting raster.'), {code: 'paint_raster_decoder_unavailable'});
}
