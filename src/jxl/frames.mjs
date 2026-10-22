// SPDX-License-Identifier: AGPL-3.0-only

export const FRAME_PIXELS = 80_000_000, PIXELS = 24_000_000;
export const FRAMES = 3600, DOCUMENT_BYTES = 16 * 1024 * 1024;
export const FPS = 30, LONG_SIDE = 1920, SHORT_LONG_SIDE = 480, SECONDS = 60;
export const PIXEL_RATE = 16_000_000;

const ascii = (bytes, at, text) => [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
export function mediaKind(bytes, type = '') {
	if (ascii(bytes, 0, 'GIF8')) return 'image/gif';
	if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG')) {
		for (let at = 8; at + 8 <= bytes.length;) {
			const length = (bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0;
			if (ascii(bytes, at + 4, 'acTL')) return 'image/png';
			if (ascii(bytes, at + 4, 'IDAT')) return '';
			at += 12 + length;
		}
		return '';
	}
	if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBPVP8X')) return bytes[20] & 2 ? 'image/webp' : '';
	if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video';
	if (ascii(bytes, 4, 'ftyp')) return /^(avi[fs]|hei[cfmsx]|hev[cx]|mif1|msf1|jxl )/.test(String.fromCharCode(...bytes.subarray(8, 12))) ? '' : 'video';
	return /^video\//.test(type) ? 'video' : '';
}

const stopped = () => new DOMException('Image processing canceled', 'AbortError');
const shown = text => Object.assign(new Error(text), {shown: true});

async function rgbaOf(image, width, height) {
	const order = {RGBA: [0, 1, 2, 3], RGBX: [0, 1, 2, -1], BGRA: [2, 1, 0, 3], BGRX: [2, 1, 0, -1]}[image.format];
	const data = new Uint8Array(width * height * 4);
	if (!order) { await image.copyTo(data, {format: 'RGBA', colorSpace: 'srgb'}); return data; }
	const raw = new Uint8Array(image.allocationSize()), [{offset, stride}] = await image.copyTo(raw);
	const [r, g, b, a] = order;
	for (let y = 0, to = 0; y < height; y++) for (let x = 0, from = offset + y * stride; x < width; x++, from += 4, to += 4) {
		data[to] = raw[from + r]; data[to + 1] = raw[from + g]; data[to + 2] = raw[from + b]; data[to + 3] = a < 0 ? 255 : raw[from + a];
	}
	return data;
}

export async function readAnimation(bytes, type, {signal, say = () => {}, progress = () => {}, convert = false} = {}) {
	if (typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported(type)) throw shown('This browser cannot read animations.');
	const decoder = new ImageDecoder({data: bytes, type, premultiplyAlpha: 'none', colorSpaceConversion: convert ? 'default' : 'none', preferAnimation: true});
	try {
		await decoder.tracks.ready; await decoder.completed;
		const track = decoder.tracks.selectedTrack, count = track?.frameCount || 0;
		if (count < 2) return null;
		const frames = [];
		let width = 0, height = 0, kept = count;
		for (let at = 0; at < kept; at++) {
			signal?.throwIfAborted();
			say('Frame ' + (at + 1) + ' of ' + kept); progress(at / kept);
			const {image} = await decoder.decode({frameIndex: at, completeFramesOnly: true});
			try {
				if (!at) {
					width = image.displayWidth; height = image.displayHeight;
					if (width * height > PIXELS) throw shown('Over ' + PIXELS / 1e6 + ' megapixels.');
					kept = Math.max(1, Math.min(count, FRAMES, Math.floor(FRAME_PIXELS / (width * height))));
				}
				const data = await rgbaOf(image, width, height);
				const ms = (image.duration || 0) / 1000;
				frames.push({data, duration: type === 'image/gif' && ms <= 10 ? 100 : Math.max(1, ms)});
			} finally { image.close(); }
		}
		const loops = Number.isFinite(track.repetitionCount) ? track.repetitionCount + 1 : 0;
		return {width, height, loops, frames, total: count, cut: kept < count, sound: false, scaled: false};
	} finally { decoder.close(); }
}

export function videoPlan(width, height, seconds) {
	const long = Math.max(width, height), span = Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : SECONDS, SECONDS), frames = Math.ceil(span * FPS);
	const floor = Math.min(1, SHORT_LONG_SIDE / long) ** 2 * width * height;
	const most = Math.max(floor, Math.min(Math.min(1, LONG_SIDE / long) ** 2 * width * height, PIXEL_RATE / FPS, FRAME_PIXELS / frames));
	const scale = Math.min(1, Math.sqrt(most / (width * height)));
	const even = value => Math.max(2, Math.floor(value * scale / 2) * 2);
	const size = scale < 1 ? {width: even(width), height: even(height)} : {width, height};
	const limit = Math.min(span, Math.floor(FRAME_PIXELS / (size.width * size.height) / FPS * 10) / 10);
	return {...size, seconds: limit, cut: limit < (Number.isFinite(seconds) ? seconds : Infinity) - 1e-3, scaled: size.width !== width || size.height !== height};
}

const once = (target, name, signal) => new Promise((resolve, reject) => {
	const done = event => { target.removeEventListener(name, done); target.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); resolve(event); };
	const failed = () => { target.removeEventListener(name, done); signal?.removeEventListener('abort', aborted); reject(shown('This browser cannot play this video.')); };
	const aborted = () => { target.removeEventListener(name, done); target.removeEventListener('error', failed); reject(stopped()); };
	target.addEventListener(name, done); target.addEventListener('error', failed); signal?.addEventListener('abort', aborted, {once: true});
});

export async function readVideo(file, {signal, say = () => {}, progress = () => {}} = {}) {
	const video = document.createElement('video'), url = URL.createObjectURL(file), bitmaps = [];
	video.muted = true; video.playsInline = true; video.preload = 'auto'; video.disablePictureInPicture = true;
	video.setAttribute('aria-hidden', 'true');
	video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
	document.body.append(video);
	try {
		say('Opening the video');
		video.src = url;
		await once(video, 'loadedmetadata', signal);
		if (!video.videoWidth || !video.videoHeight) throw shown('This file has no picture.');
		if (!Number.isFinite(video.duration)) {
			video.currentTime = 1e9;
			await once(video, 'seeked', signal);
			video.currentTime = 0;
			await once(video, 'seeked', signal);
		}
		const length = video.duration, plan = videoPlan(video.videoWidth, video.videoHeight, length);
		const step = 1 / FPS;
		const expected = () => {
			const rate = Math.min(FPS, (times.length - 1) / times[times.length - 1]);
			return Math.max(times.length, Math.round(plan.seconds * rate));
		};
		const shoot = () => createImageBitmap(video, {resizeWidth: plan.width, resizeHeight: plan.height, resizeQuality: 'high'});
		const times = [];
		let next = 0, finished = false, sound = false, attempts = 0, dropped = 0, rate = 1, presented = -1, returns = 0, returnedTo = -1;
		const droppedNow = () => video.getVideoPlaybackQuality?.().droppedVideoFrames || 0;
		if (video.readyState < 2) await once(video, 'loadeddata', signal);
		for (;; attempts++) {
			try { bitmaps.push(await shoot()); break; }
			catch (error) {
				if (attempts >= 3) throw shown('This video stopped playing partway.');
				video.currentTime = 0; await once(video, 'seeked', signal);
			}
		}
		times.push(0); next = step; attempts = 0; dropped = droppedNow();
		await new Promise((resolve, reject) => {
			const end = () => { if (finished) return; finished = true; video.pause(); signal?.removeEventListener('abort', aborted); video.removeEventListener('ended', ended); video.removeEventListener('error', failed); };
			const ended = () => { end(); resolve(); };
			const failed = () => { end(); reject(shown('This video stopped playing partway.')); };
			const aborted = () => { end(); reject(stopped()); };
			const back = () => { video.pause(); video.addEventListener('seeked', resume, {once: true}); video.currentTime = times[times.length - 1]; };
			const take = (_, meta) => {
				if (finished) return;
				const time = meta.mediaTime, last = times[times.length - 1], skipped = presented >= 0 && meta.presentedFrames - presented > 1;
				presented = meta.presentedFrames;
				const spacing = times.length >= 3 ? (last - times[0]) / (times.length - 1) : 0;
				const gap = spacing >= step * 0.9 && time - last > spacing * 1.6 && time > last;
				if ((droppedNow() > dropped || skipped || gap) && !(returnedTo === last && returns >= 3)) {
					returns = returnedTo === last ? returns + 1 : 1; returnedTo = last;
					if (rate > 1 / 8) { rate /= 2; video.playbackRate = rate; }
					presented = -1; back(); return;
				}
				if (time >= plan.seconds - 1e-6) { ended(); return; }
				if (time >= next - step / 4 && time > times[times.length - 1]) {
					video.pause();
					shoot().then(bitmap => {
						if (finished) { bitmap.close(); return; }
						bitmaps.push(bitmap); times.push(time); next = Math.max(next + step, time + step / 2); attempts = 0;
						const total = expected(); say('Frame ' + times.length + ' of ' + total); progress(Math.min(1, times.length / total));
						resume();
					}, () => {
						if (finished) return;
						if (++attempts > 3) { end(); reject(shown('This video stopped playing partway.')); return; }
						back();
					});
					return;
				}
				video.pause(); queueMicrotask(resume);
			};
			const resume = () => { if (finished) return; dropped = droppedNow(); video.requestVideoFrameCallback(take); video.play().catch(refused); };
			const refused = error => { end(); reject(error?.name === 'AbortError' && signal?.aborted ? stopped() : shown('This browser cannot play this video.')); };
			signal?.addEventListener('abort', aborted, {once: true});
			video.addEventListener('ended', ended); video.addEventListener('error', failed);
			video.requestVideoFrameCallback(take);
			video.play().catch(refused);
		});
		signal?.throwIfAborted();
		sound = (video.webkitAudioDecodedByteCount || 0) > 0 || !!video.audioTracks?.length || !!video.mozHasAudio;
		const stop = Math.min(plan.seconds, length, video.currentTime || length);
		const frames = [], canvas = new OffscreenCanvas(plan.width, plan.height), context = canvas.getContext('2d', {willReadFrequently: true});
		for (let at = 0; at < bitmaps.length; at++) {
			signal?.throwIfAborted();
			const bitmap = bitmaps[at];
			bitmaps[at] = null;
			try { context.clearRect(0, 0, plan.width, plan.height); context.drawImage(bitmap, 0, 0); }
			finally { bitmap.close(); }
			const data = new Uint8Array(context.getImageData(0, 0, plan.width, plan.height).data.buffer);
			const until = at + 1 < times.length ? times[at + 1] : Math.max(stop, times[at] + step);
			frames.push({data, duration: Math.max(1, Math.round((until - times[at]) * 1e6) / 1e3)});
		}
		canvas.width = canvas.height = 0;
		return {width: plan.width, height: plan.height, loops: 0, frames, total: frames.length, cut: plan.cut, seconds: plan.seconds, sound, scaled: plan.scaled};
	} finally {
		video.pause(); video.removeAttribute('src'); video.load(); video.remove(); URL.revokeObjectURL(url);
		for (const bitmap of bitmaps) bitmap?.close();
	}
}

let line = Promise.resolve();
export function oneAtATime(work) {
	const turn = line.then(work, work);
	line = turn.catch(() => {});
	return turn;
}

const seconds = frames => frames.reduce((sum, frame) => sum + frame.duration, 0) / 1000;
export function mediaNote(row) {
	return ' · ' + row.frames + ' frames · ' + row.seconds.toFixed(1) + ' s' + (row.scaled ? ' · made ' + row.width + '×' + row.height : '') + (row.note === 'colors' ? ' · converted to sRGB' : '') +
		(row.cut ? (row.video ? ' · cut to fit this device' : ' · first ' + row.frames + ' of ' + row.total + ' frames, to fit this device') : '') + (row.sound ? ' · sound dropped' : '') + (row.size > DOCUMENT_BYTES ? ' · too large to play in a Rapier document' : '');
}

export async function convertMedia(file, bytes, kind, {mode, quality, effortFor, resultOf, signal, say = () => {}, progress = () => {}, codec, complete = async () => {}, colors = {}}) {
	return oneAtATime(async () => {
		signal?.throwIfAborted();
		const video = kind === 'video';
		if (video) await complete();
		const read = video ? await readVideo(file, {signal, say, progress}) : await readAnimation(bytes, kind, {signal, say, progress, convert: !!colors.browser});
		if (!read) return null;
		if (!video) await complete();
		const {width, height, loops, frames} = read, count = frames.length, length = seconds(frames), lossless = mode === 'lossless';
		say('Making the file'); progress(0);
		const effort = effortFor(width * height * Math.min(count, 4));
		const {browser, ...declared} = colors, options = {...(lossless ? {lossless: true, effort} : {quality, photo: true, effort}), ...declared};
		const made = await codec('animation', {width, height, loops, frames, options}, {signal, progress: value => { say('Making frame ' + Math.min(count, Math.max(1, Math.ceil(value * count))) + ' of ' + count); progress(value); }});
		frames.length = 0;
		return {...resultOf(made.bytes), before: file.size, exact: false, jpeg: false, mode, fallback: false, refused: false, note: colors.browser ? 'colors' : '', width, height,
			frames: count, total: read.total, seconds: length, cut: read.cut, sound: read.sound, scaled: read.scaled, video};
	});
}
