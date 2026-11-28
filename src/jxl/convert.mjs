// SPDX-License-Identifier: AGPL-3.0-only
import {dosDateTime, localHeader, centralHeader, endRecord} from '../notes/zip-records.mjs';
import {crc32} from '../images/crc32.mjs';
import {readPng, isPng} from './png.mjs';
import {embeddedProfile, avifColors, displayP3Profile, isSrgbProfile} from './profile.mjs';
import {mediaKind, convertMedia, mediaNote as framesNote} from './frames.mjs';
import {jpegWithoutLocation, metadataOf, metadataBytes, withMetadata} from './meta.mjs';
export {createPicture} from './preview.mjs';

export const CARRY_BYTES = 256 * 1024 * 1024, PIXELS = 268_435_456;
export const QUALITY = Object.freeze({high: 90, veryhigh: 95, lossless: 100});
export const qualityOf = value => Math.min(100, Math.max(1, Math.round(Number(value)) || QUALITY.high));
export const ADVANCED = Object.freeze({
	limits: Object.freeze([100e3, 250e3, 500e3, 1e6, 2e6]), limit: 500e3,
	sides: Object.freeze([0, 1920, 1280, 640])});
export const bytesWords = bytes => bytes >= 1e6 ? bytes / 1e6 + ' MB' : bytes / 1e3 + ' KB';
export const ZIP_BYTES = 1024 * 1024 * 1024, ZIP_ENTRIES = 60000;

export const LINKS = Object.freeze([['rapier-jxl on GitHub', 'https://github.com/jackskip22/rapier-jxl'], ['jpegxl on npm', 'https://www.npmjs.com/package/jpegxl'], ['SnapDOM JPEG XL plugin', 'https://snapdom.dev/plugins/jxl/'], ['EmDash JPEG XL Image Optimizer plugin', 'https://plugins.emdashcms.com/plugins/@rapier.website/jxl']]);
export const LOCAL_NOTE = Object.freeze([
	'Runs locally on your device, no uploads.',
	'Press X in the top right to go back to the Markdown editor.']);
export const COMPARE = Object.freeze({
	title: 'What is rapier-jxl?',
	lines: Object.freeze([
		'This page turns your pictures, GIFs and videos into JPEG XL files that are smaller, and still look as good as a high-quality JPEG.',
		'It runs on your device. Nothing is uploaded.',
		'Lossless keeps every pixel. High and Very high make a smaller file, and Very high keeps fine detail when you zoom in. For a JPEG, Lossless can shrink the file and still restore the original exactly.',
		'Effort levels are tuned differently from other encoders. Higher efforts take longer and make much smaller files. Effort 10 makes smaller lossless photos than any other image format\'s top effort, about 15 times faster than libjxl\'s effort 11.',
		'The upload encoder is about {upload} KB, a little faster than libvips in the browser, and uses less than half the memory for a 12-megapixel picture.']),
	basis: 'Measured against wasm-vips 0.0.19.'});
export const SCENE = Object.freeze({
	title: 'Save a 3D scene',
	note: 'A WebGL scene saved as JPEG XL while it keeps drawing, on this device.',
	missing: 'The scene could not load. Reload the page and try again.'});
export const EXAMPLE = Object.freeze({
	part: 'jxlexample', global: 'RapierJxlExample',
	title: 'Animated JPEG XL:',
	alt: 'Earth from the International Space Station, animated JPEG XL',
	credit: 'Earth from the International Space Station. NASA, public domain.',
	missing: 'The example could not load. Reload the page and try again.'});
export const CLIP = Object.freeze({
	part: 'jxlclip', global: 'RapierJxlClip',
	title: 'Animated JPEG XL:',
	alt: 'A chimpanzee driving a watermelon train, animated JPEG XL',
	caption: 'GIF 4.0 MB · JPEG XL 510 KB',
	local: false,
	credit: '',
	missing: 'The clip could not load. Reload the page and try again.'});
export const BIG = Object.freeze({
	part: 'jxlbig', global: 'RapierJxlBig', id: 'rapier-jxl-big',
	title: 'Watch a big JXL image load progressively:',
	button: 'Load big JXL image',
	alt: 'Earth from Apollo 17, a progressive JPEG XL',
	width: 4579, height: 4579, plain: 706476, rate: 51200,
	focus: Object.freeze([2500, 2050]), zoom: Object.freeze([600, 700]),
	about: Object.freeze([
		'A progressive JPEG XL stores a small whole picture first, at 1:8 of each side, then passes that add detail.',
		'A browser can show each pass as its bytes arrive, so the picture appears long before its last byte.',
		'This file is 729 KB and 4579 × 4579 pixels (21 megapixels). Here it arrives at 50 KB a second, so you can watch: the 1:8 pass shows after 181 KB, the 1:4 pass after 359 KB.',
		'Made without passes, the same picture is 690 KB: the passes add 6%.',
		'Where a browser cannot show JPEG XL, this page decodes each pass with rapier-jxl.',
		'Earth from Apollo 17. NASA, public domain.']),
	missing: 'The picture could not load. Reload the page and try again.'});
export const ABOUT = Object.freeze([
	'rapier-jxl is the JPEG XL encoder inside Rapier: JavaScript and WebAssembly, WebGPU at high efforts, MIT licensed, no dependencies.',
	'Rapier is a single HTML file that works offline, free and open source.',
	'It encodes lossless and lossy pictures, carries a JPEG exactly, and keeps alpha and HDR.',
	'Quality: High looks like the original at normal size. Very high is hard to tell from it even zoomed in, for larger files. Lossless keeps every pixel exactly.',
	'In your own site or app: npm install jpegxl, then import {encode} from "jpegxl/upload". Read the JPEG XL bytes from (await encode(file)).bytes.']);

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

const DROPS = '(hover: hover) and (pointer: fine)';
export const pickWords = () => globalThis.matchMedia?.(DROPS).matches ? 'Choose/drop files' : 'Choose files';
export function pickLabel(span) {
	span.textContent = pickWords();
	globalThis.matchMedia?.(DROPS).addEventListener?.('change', () => { if (span.isConnected) span.textContent = pickWords(); });
	return span;
}

export function liftToLabel(seek, level, label) {
	seek.addEventListener('pointerdown', () => {
		const at = level.getBoundingClientRect(), to = label.getBoundingClientRect();
		seek.style.setProperty('--rapier-effort-lift', Math.round(to.bottom - at.bottom) + 'px');
	}, true);
}

export const SHOW_REFUSED = 'This browser cannot show JPEG XL.';
export function showMade(blob, cls, alt) {
	const url = URL.createObjectURL(blob), image = document.createElement('img'), shown = {node: image, end: () => URL.revokeObjectURL(url)};
	image.className = cls; image.alt = alt; image.decoding = 'async';
	image.addEventListener('error', () => {
		const words = document.createElement('p');
		words.className = 'rapier-jxl-view__note ' + cls; words.textContent = SHOW_REFUSED;
		image.replaceWith(words); shown.node = words;
	}, {once: true});
	image.src = url;
	return shown;
}

export function kindOf(bytes) {
	if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
	if (isPng(bytes)) return 'png';
	if (bytes[0] === 0xFF && bytes[1] === 0x0A || bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 12 && bytes[4] === 0x4A && bytes[5] === 0x58 && bytes[6] === 0x4C) return 'jxl';
	if (bytes[0] === 0x76 && bytes[1] === 0x2F && bytes[2] === 0x31 && bytes[3] === 0x01 || bytes[0] === 0x23 && bytes[1] === 0x3F && /^#\?(?:RADIANCE|RGBE)/.test(String.fromCharCode(...bytes.subarray(0, 10)))) return 'hdr';
	return 'other';
}

export function outputName(name, taken = new Set(), ext = '.jxl') {
	const base = String(name || '').replace(/[\\/]/g, '_').replace(/\.[^.]*$/, '') || 'picture';
	let out = base + ext, n = 2;
	while (taken.has(out.toLowerCase())) out = base + '-' + n++ + ext;
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

export function resultOf(bytes, type = 'image/jxl') {
	let crc = 0;
	for (let at = 0; at < bytes.length; at += 65536) crc = crc32(bytes.subarray(at, at + 65536), crc);
	return {blob: new Blob([bytes], {type}), crc: crc >>> 0, size: bytes.length};
}

async function convertBack(bytes, {complete, signal, say, progress, codec}) {
	const assets = globalThis.RapierImageAssets, before = bytes.length;
	let info = null;
	try { info = assets.inspectJPEGXL(bytes.subarray(0, Math.min(bytes.length, 4 << 20)), true); } catch (_) {}
	if (info?.reconstruction) {
		say('Restoring the JPEG');
		try {
			const jpeg = await codec('restore', bytes.slice(), {}, {signal, progress});
			return {...resultOf(jpeg, 'image/jpeg'), before, back: 'jpeg', ext: '.jpg', width: info.width, height: info.height};
		} catch (error) { if (error?.name === 'AbortError' || exhausted(error)) throw error; }
	}
	say('Reading the picture'); progress(0);
	const canvas = document.createElement('canvas');
	try {
		if (await globalThis.RapierEmbeddedImages.whenJxlDisplayKnown?.() === true) {
			const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/jxl'}));
			canvas.width = bitmap.width; canvas.height = bitmap.height;
			canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
		} else {
			await complete?.();
			const pixels = await codec('decode', bytes.slice(), {format: 'uint8', colorSpace: 'srgb', unpremultiplyAlpha: true, maxPixels: PIXELS}, {signal, progress});
			canvas.width = pixels.width; canvas.height = pixels.height;
			canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.data.buffer, pixels.data.byteOffset, pixels.width * pixels.height * 4), pixels.width, pixels.height), 0, 0);
		}
		signal?.throwIfAborted();
		say('Making the file');
		const blob = await new Promise((done, fail) => canvas.toBlob(made => made ? done(made) : fail(Object.assign(new Error('Not converted: the PNG could not be made.'), {shown: true})), 'image/png'));
		const png = new Uint8Array(await blob.arrayBuffer());
		return {...resultOf(png, 'image/png'), before, back: 'png', ext: '.png', width: canvas.width, height: canvas.height};
	} finally { canvas.width = canvas.height = 0; }
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

const carriedSize = carried => globalThis.RapierImageAssets.imageDimensions(carried.subarray(0, Math.min(carried.length, 4 << 20)), 'image/jxl', true);
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
export const exhausted = error => error?.code === 'JXL_MEMORY' || error instanceof RangeError || /out of memory|allocation failed|Array buffer allocation/i.test(String(error?.message || ''));
export const EFFORT = Object.freeze({min: 1, max: 9, start: 7});
export const STILL_EFFORT = Object.freeze({min: 1, max: 10, start: 7, long: 9, slow: 10});
export const SLOW_WORDS = 'A 12 MP photo can take 20 to 30 minutes, depending on your device.';
export const effortOf = (value, range = EFFORT) => Math.min(range.max, Math.max(range.min, Math.round(Number(value)) || range.start));

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

export async function convert(file, {mode = 'lossless', quality: askedQuality, maxBytes = 0, side = 0, location = true, effort: asked = EFFORT.start, complete, signal, say = () => {}, progress = () => {}, codec = globalThis.RapierEmbeddedImages.codec, budget} = {}) {
	const effort = effortOf(asked, STILL_EFFORT), effortFor = () => effortOf(effort);
	const quality = qualityOf(askedQuality ?? QUALITY[mode]), lossless = quality === 100;
	mode = lossless ? 'lossless' : mode === 'lossless' ? 'high' : mode;
	maxBytes = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? maxBytes : 0;
	side = Number.isSafeInteger(side) && side > 0 ? side : 0;
	const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
	if (kindOf(head) === 'other' && mediaKind(head, file.type) === 'video')
		return convertMedia(file, null, 'video', {mode, quality, effortFor, resultOf, signal, say, progress, codec, complete, ...(budget ? {budget} : {})});
	const bytes = new Uint8Array(await file.arrayBuffer());
	const kind = kindOf(bytes), before = bytes.length;
	const animation = kind === 'other' || kind === 'png' ? mediaKind(bytes, file.type) : '';
	if (animation && animation !== 'video') {
		const made = await convertMedia(file, bytes, animation, {mode, quality, effortFor, resultOf, signal, say, progress, codec, complete, ...(budget ? {budget} : {}), colors: await animationColors(bytes, animation)});
		if (made) return made;
	}
	if (kind === 'jxl') return convertBack(bytes, {complete, signal, say, progress, codec});
	if (kind === 'other' && /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 1024)))) throw Object.assign(new Error('A vector drawing has no pixels to convert.'), {shown: true});
	const fits = size => !maxBytes || size <= maxBytes;
	const missed = () => Object.assign(new Error('Cannot fit under ' + bytesWords(maxBytes) + '.'), {shown: true});
	let jpegSize = null;
	if (kind === 'jpeg') try { jpegSize = globalThis.RapierImageAssets.imageDimensions(bytes.subarray(0, Math.min(bytes.length, 4 << 20)), 'image/jpeg', true); } catch (_) {}
	const shrinks = !!side && (!jpegSize || Math.max(jpegSize.width, jpegSize.height) > side);
	let exact = null;
	if (kind === 'jpeg' && before <= CARRY_BYTES && !shrinks) {
		const carry = location ? {bytes, removed: false} : jpegWithoutLocation(bytes);
		try {
			say('Carrying the JPEG');
			const carried = await codec('recompress', carry.bytes.slice(), {effort, ...effort < 10 && {gainMap: true}}, {signal, progress});
			say('Checking it restores the original'); progress(1);
			const restored = await codec('restore', carried.slice(), {}, {signal});
			if (same(restored, carry.bytes)) exact = {...resultOf(carried), before, exact: true, jpeg: true, mode: 'lossless', located: carry.removed, ...carriedSize(carried)};
		} catch (error) { if (error?.name === 'AbortError' || exhausted(error)) throw error; }
		if (exact && mode === 'lossless' && fits(exact.size)) return exact;
	}
	say('Reading the picture'); progress(0);
	let own = null, profile = null, note = '', hdr = null;
	if (kind === 'png') {
		own = await readPng(bytes, PIXELS);
		if (!lossless && own?.data) own = lossyPng(own) || (note = 'colors', null);
	} else if (kind === 'hdr') {
		await complete?.();
		const {data, width, height, parts: _, ...options} = await codec('read-hdr', bytes, {maxPixels: PIXELS}, {signal});
		hdr = {data, width, height, options: Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))};
	} else profile = embeddedProfile(bytes);
	const said = !own && !profile && !hdr && kind === 'other' ? avifColors(bytes) : null, declared = said?.browser ? null : said;
	if (said?.browser) note = 'colors';
	if (own?.browser) note = own.depth === 16 && lossless ? 'bits8' : 'colors';
	let picture = hdr || (own?.data ? own : profile ? {...await pixelsOf(file, {raw: true}), options: {icc: profile}} : declared ? {...await pixelsOf(file, {raw: true}), options: declared} : await pixelsOf(file));
	const meta = kind === 'jpeg' || kind === 'png' || kind === 'other' ? metadataOf(bytes, {location}) : null;
	const room = maxBytes ? maxBytes - metadataBytes(meta) : 0;
	if (maxBytes && room < 1) throw missed();
	const shown = await globalThis.RapierEmbeddedImages.whenJxlDisplayKnown?.() === true;
	for (let attempt = 0;; attempt++) {
		const native = picture.options ? {...picture.bitDepth === 16 && {bitDepth: 16}, ...picture.options} : {};
		const input = data => ({width: picture.width, height: picture.height, data, ...native});
		const work = {signal, progress};
		const resize = side && Math.max(picture.width, picture.height) > side;
		const sized = resize ? {[picture.width >= picture.height ? 'width' : 'height']: side} : null;
		const encode = async (data, exactly) => {
			const fidelity = exactly || lossless && !room ? 'exact' : {quality};
			if (resize) return codec('variants', input(data), {outputs: [{...sized, ...room ? {maxBytes: room, fidelity: exactly ? 'exact' : {quality}} : {fidelity}}], effort: Math.min(effort, 9), maxPixels: PIXELS}, work);
			if (room && !exactly) return codec('fit', input(data), {maxBytes: room, fidelity: {quality}, effort: Math.min(effort, 9), maxPixels: PIXELS}, work);
			return codec('encode', input(data), {fidelity, effort, maxPixels: PIXELS}, work);
		};
		const again = shown && !lossless ? picture.data.slice() : null;
		try {
			say('Making the file');
			let made = await encode(picture.data), fallback = false, refused = false;
			const madeLossless = made.fidelity ? made.fidelity === 'exact' : lossless;
			if (shown && !await opens(made)) {
				if (madeLossless) refused = true;
				else {
					say('Making it lossless'); progress(0);
					const exactly = await encode(again, true).catch(error => { if (error?.code === 'JXL_TARGET') return null; throw error; });
					if (exactly && fits(exactly.length + metadataBytes(meta)) && await opens(exactly)) { made = exactly; fallback = true; }
					else refused = true;
				}
			}
			const size = sized ? {width: Math.max(1, Math.round(sized.width ?? picture.width * side / picture.height)), height: Math.max(1, Math.round(sized.height ?? picture.height * side / picture.width))} : {width: picture.width, height: picture.height};
			const result = {...resultOf(withMetadata(made, meta)), before, exact: false, jpeg: kind === 'jpeg', mode: fallback || madeLossless ? 'lossless' : mode === 'lossless' ? 'high' : mode, fallback, refused, note, ...size,
				...resize && {side}, located: !!meta?.removed};
			return exact ? {...(result.size < exact.size && !result.refused || !fits(exact.size) ? result : {...exact, mode, exactKept: true}), also: exact} : result;
		} catch (error) {
			if (error?.code === 'JXL_TARGET') throw missed();
			if (attempt || !picture.options?.icc || error?.name === 'AbortError' || exhausted(error) || !/^JXL_(INPUT|OPTIONS|SIZE|RGBA)$/.test(error?.code || '')) throw error;
			console.warn('JPEG XL profile refused', error.code, error.message);
			note = own?.depth === 16 || picture.bitDepth === 16 ? 'bits8' : 'colors';
			picture = await pixelsOf(file);
		}
	}
}
