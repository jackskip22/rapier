// SPDX-License-Identifier: AGPL-3.0-only
import {dosDateTime, localHeader, centralHeader, endRecord} from '../notes/zip-records.mjs';
import {crc32} from '../images/crc32.mjs';
import {readPng, isPng} from './png.mjs';
import {embeddedProfile, avifColors, displayP3Profile, isSrgbProfile} from './profile.mjs';
import {mediaKind, convertMedia, mediaNote as framesNote} from './frames.mjs';

export const CARRY_BYTES = 16 * 1024 * 1024, PIXELS = 24_000_000;
export const QUALITY = Object.freeze({lossless: 100, high: 90, smaller: 75});
export const ZIP_BYTES = 1024 * 1024 * 1024, ZIP_ENTRIES = 60000;

export const LINKS = Object.freeze([['rapier-jxl on GitHub', 'https://github.com/jackskip22/rapier-jxl'], ['rapier-jxl on npm', 'https://www.npmjs.com/package/rapier-jxl']]);
export const ABOUT = Object.freeze([
	'rapier-jxl is the JPEG XL encoder inside Rapier: pure JavaScript with optional WebAssembly, MIT licensed, no dependencies.',
	'It encodes lossless and lossy pictures, carries a JPEG exactly, and keeps alpha and HDR.',
	'In your own site or app: npm install rapier-jxl, then import {toJXL} from "rapier-jxl/image". toJXL(file, {worker}) returns a JPEG XL Blob.']);

export const mediaNote = framesNote;

const REFUSALS = Object.freeze({
	JXL_SIZE: 'The result is larger than the encoder can write.',
	JXL_FRAMING: 'Its frames cannot be written as one animation.',
	JXL_UNAVAILABLE: 'This copy of Rapier cannot make this file.',
	JXL_RECONSTRUCTION: 'Its JPEG data cannot be carried.',
	JXL_JPEG: 'Its JPEG data cannot be carried.',
	JXL_INPUT: 'Its pixels did not reach the encoder whole. Try it again.',
	JXL_RGBA: 'Its pixels did not reach the encoder whole. Try it again.',
	JXL_OPTIONS: 'The encoder did not take this quality. Choose another and try again.',
	JXL_OPERATION: 'This copy of Rapier asked its encoder for something it cannot do. Reload Rapier and try again.',
	JXL_THREAD_REQUIRED: 'The encoder could not start in the background. Reload Rapier and try again.',
	JXL_INITIALIZE: 'The encoder could not start. Reload Rapier and try again.',
	JXL_WORKER: 'The encoder stopped partway. Try it again.',
	JXL_CODEC: 'The encoder failed on this file. Try it again, or choose lossless.',
	JXL_ENCODE: 'The encoder failed while writing it. Try it again, or choose lossless.',
	JXL_BUSY: 'The encoder was busy. Try it again in a moment.',
	JXL_ABORTED: 'Canceled',
});
export function refusal(error, file) {
	if (error?.shown || error?.code === 'JXL_DIMENSIONS') return error.message;
	const over = file && (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name || '')) && file.size > CARRY_BYTES ? 'Over ' + CARRY_BYTES / 1048576 + ' MB, so made from its pixels. ' : '';
	const code = typeof error?.code === 'string' && /^JXL_[A-Z_]+$/.test(error.code) ? error.code : '';
	if (code && !REFUSALS[code]) console.warn('JPEG XL refusal', code, error?.message);
	if (code) return over + (REFUSALS[code] || 'The encoder could not make this file. Try it again.');
	if (/^Image (processing took too long|worker)/.test(String(error?.message || ''))) { console.warn('JPEG XL worker', error.message); return over + 'The encoder stopped partway. Try it again.'; }
	return 'This picture cannot be read or converted.';
}

export function kindOf(bytes) {
	if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
	if (isPng(bytes)) return 'png';
	if (bytes[0] === 0xFF && bytes[1] === 0x0A || bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 12 && bytes[4] === 0x4A && bytes[5] === 0x58 && bytes[6] === 0x4C) return 'jxl';
	return 'other';
}

export function outputName(name, taken = new Set()) {
	const base = String(name || '').replace(/[\\/]/g, '_').replace(/\.[^.]*$/, '') || 'picture';
	let out = base + '.jxl', n = 2;
	while (taken.has(out.toLowerCase())) out = base + '-' + n++ + '.jxl';
	taken.add(out.toLowerCase());
	return out;
}

export function zipSeries(results, {now = Date.now()} = {}) {
	const enc = new TextEncoder(), {date, time} = dosDateTime(now), zips = [];
	let open = null;
	const close = () => {
		if (!open) return;
		const size = open.central.reduce((sum, part) => sum + part.length, 0);
		zips.push({blob: new Blob([...open.parts, ...open.central, endRecord(open.count, size, open.offset, 0)], {type: 'application/zip'}), count: open.count});
		open = null;
	};
	for (const {name, blob, crc, size} of results) {
		const nameBytes = enc.encode(name), file = {nameBytes, size, crc, date, time};
		const need = 30 + nameBytes.length + size + 46 + nameBytes.length;
		if (open && (open.offset + open.centralSize + need > ZIP_BYTES || open.count >= ZIP_ENTRIES)) close();
		open ||= {parts: [], central: [], centralSize: 0, offset: 0, count: 0};
		const head = localHeader(file), entry = centralHeader(file, open.offset);
		open.parts.push(head, nameBytes, blob); open.central.push(entry, nameBytes);
		open.offset += head.length + nameBytes.length + size; open.centralSize += entry.length + nameBytes.length; open.count++;
	}
	close();
	return zips;
}

export function resultOf(bytes) {
	let crc = 0;
	for (let at = 0; at < bytes.length; at += 65536) crc = crc32(bytes.subarray(at, at + 65536), crc);
	return {blob: new Blob([bytes], {type: 'image/jxl'}), crc: crc >>> 0, size: bytes.length};
}

function lossyPng(own) {
	const keys = Object.keys(own.options || {});
	if (keys.length && !(keys.length === 1 && keys[0] === 'icc') && !(own.options.colorSpace === 'display-p3' && own.options.transferFunction === 'srgb' && keys.length === 2)) return null;
	return own;
}

function stillOf(bytes) {
	const parts = [bytes.subarray(0, 8)];
	for (let at = 8; at + 12 <= bytes.length;) {
		const size = (bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0, name = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		if (at + 12 + size > bytes.length) break;
		if (!['acTL', 'fcTL', 'fdAT'].includes(name)) parts.push(bytes.subarray(at, at + 12 + size));
		at += 12 + size;
	}
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	for (let at = 0, part = 0; part < parts.length; at += parts[part++].length) out.set(parts[part], at);
	return out;
}

async function animationColors(bytes, type) {
	if (type === 'image/png') {
		const read = await readPng(stillOf(bytes), PIXELS, {colorsOnly: true});
		return !read || read.browser ? {browser: true} : read.options.icc ? isSrgbProfile(read.options.icc) ? {} : displayP3Profile(read.options.icc) || {browser: true} : read.options;
	}
	if (type === 'image/webp') { const icc = embeddedProfile(bytes); return !icc || isSrgbProfile(icc) ? {} : displayP3Profile(icc) || {browser: true}; }
	return {};
}

const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
export const exhausted = error => error?.code === 'JXL_MEMORY' || error instanceof RangeError || /out of memory|allocation failed|Array buffer allocation/i.test(String(error?.message || ''));
export const EFFORT = Object.freeze({min: 1, max: 9, start: 7});
export const effortOf = value => Math.min(EFFORT.max, Math.max(EFFORT.min, Math.round(Number(value)) || EFFORT.start));

export async function pixelsOf(file, {raw = false} = {}) {
	const bitmap = await createImageBitmap(file, {premultiplyAlpha: 'none', ...raw && {colorSpaceConversion: 'none'}});
	try {
		const width = bitmap.width, height = bitmap.height;
		if (width * height > PIXELS) throw Object.assign(new Error('Over ' + PIXELS / 1e6 + ' megapixels.'), {shown: true});
		try {
			const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl', {premultipliedAlpha: false, alpha: true, antialias: false});
			if (!gl || width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw new Error('canvas');
			const texture = gl.createTexture(), buffer = gl.createFramebuffer();
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
			gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('canvas');
			const out = new Uint8Array(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
			return {width, height, data: out};
		} catch (error) { if (error.shown || exhausted(error)) throw error; }
		const canvas = document.createElement('canvas');
		canvas.width = width; canvas.height = height;
		try {
			const context = canvas.getContext('2d', {willReadFrequently: true});
			context.drawImage(bitmap, 0, 0);
			return {width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer)};
		} finally { canvas.width = canvas.height = 0; }
	} finally { bitmap.close(); }
}

async function opens(bytes) {
	try { (await createImageBitmap(new Blob([bytes], {type: 'image/jxl'}))).close(); return true; } catch (_) { return false; }
}

export async function convert(file, {mode = 'lossless', effort: asked = EFFORT.start, videoMode = '', complete, signal, say = () => {}, progress = () => {}, codec = globalThis.RapierEmbeddedImages.codec} = {}) {
	const effort = effortOf(asked), effortFor = () => effort;
	const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
	if (kindOf(head) === 'other' && mediaKind(head, file.type) === 'video')
		return convertMedia(file, null, 'video', {mode: videoMode || mode, quality: QUALITY[videoMode || mode], effortFor, resultOf, signal, say, progress, codec, complete});
	const bytes = new Uint8Array(await file.arrayBuffer());
	const kind = kindOf(bytes), before = bytes.length;
	const animation = kind === 'other' || kind === 'png' ? mediaKind(bytes, file.type) : '';
	if (animation && animation !== 'video') {
		const made = await convertMedia(file, bytes, animation, {mode, quality: QUALITY[mode], effortFor, resultOf, signal, say, progress, codec, complete, colors: await animationColors(bytes, animation)});
		if (made) return made;
	}
	if (kind === 'jxl') throw Object.assign(new Error('Already JPEG XL.'), {shown: true});
	if (kind === 'other' && /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) throw Object.assign(new Error('A vector drawing has no pixels to convert.'), {shown: true});
	let exact = null;
	if (kind === 'jpeg' && before <= CARRY_BYTES) {
		try {
			say('Carrying the JPEG');
			const carried = await codec('transcode', {bytes: bytes.slice(), options: {effort}}, {signal, progress});
			say('Checking it restores the original'); progress(1);
			const restored = await codec('reconstruct', {bytes: carried.bytes.slice()}, {signal});
			if (carried.bytes && restored.bytes && same(restored.bytes, bytes)) exact = {...resultOf(carried.bytes), before, exact: true, jpeg: true, mode: 'lossless', width: carried.width, height: carried.height};
		} catch (error) { if (error?.name === 'AbortError' || exhausted(error)) throw error; }
		if (exact && mode === 'lossless') return exact;
	}
	say('Reading the picture'); progress(0);
	const lossless = mode === 'lossless';
	let own = null, profile = null, note = '';
	if (kind === 'png') {
		own = await readPng(bytes, PIXELS);
		if (!lossless && own?.data) own = lossyPng(own) || (note = 'colors', null);
	} else if (kind !== 'jxl') profile = embeddedProfile(bytes);
	const said = !own && !profile && kind === 'other' ? avifColors(bytes) : null, declared = said?.browser ? null : said;
	if (said?.browser) note = 'colors';
	if (own?.browser) note = own.depth === 16 && lossless ? 'bits8' : 'colors';
	let picture = own?.data ? own : profile ? {...await pixelsOf(file, {raw: true}), options: {icc: profile}} : declared ? {...await pixelsOf(file, {raw: true}), options: declared} : await pixelsOf(file);
	const shown = await globalThis.RapierEmbeddedImages.whenJxlDisplayKnown?.() === true;
	for (let attempt = 0;; attempt++) {
		const native = picture.options ? {...picture.bitDepth === 16 && {bitDepth: 16}, ...picture.options} : {};
		const encode = (data, options) => codec('encode', {width: picture.width, height: picture.height, data, options: {...options, ...native}}, {signal, progress});
		const again = shown && !lossless ? picture.data.slice() : null;
		try {
			say('Making the file');
			let made = await encode(picture.data, lossless ? {lossless: true, effort} : {quality: QUALITY[mode], photo: true, effort}), fallback = false, refused = false;
			if (shown && !await opens(made.bytes)) {
				if (lossless) refused = true;
				else { say('Making it lossless'); progress(0); made = await encode(again, {lossless: true, effort}); fallback = true; refused = !await opens(made.bytes); }
			}
			const result = {...resultOf(made.bytes), before, exact: false, jpeg: kind === 'jpeg', mode: fallback ? 'lossless' : mode, fallback, refused, note, width: picture.width, height: picture.height};
			return exact ? {...(result.size < exact.size && !result.refused ? result : {...exact, mode, exactKept: true}), also: exact} : result;
		} catch (error) {
			if (attempt || !picture.options?.icc || error?.name === 'AbortError' || exhausted(error) || !/^JXL_(INPUT|OPTIONS|SIZE|RGBA)$/.test(error?.code || '')) throw error;
			console.warn('JPEG XL profile refused', error.code, error.message);
			note = own?.depth === 16 || picture.bitDepth === 16 ? 'bits8' : 'colors';
			picture = await pixelsOf(file);
		}
	}
}
