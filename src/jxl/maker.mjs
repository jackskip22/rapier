// SPDX-License-Identifier: AGPL-3.0-only
import {FRAME_PIXELS, FRAMES, PIXELS} from './frames.mjs';
export {mediaKind, readAnimation, readVideo, videoPlan, FRAME_PIXELS, SECONDS} from './frames.mjs';

export const DELAY = Object.freeze({min: 1, max: 600000, start: 100});
export const LOOPS = Object.freeze({min: 0, max: 65535});
export const SIZES = Object.freeze(['first', 'largest', 'smallest']);
export const FITS = Object.freeze(['contain', 'cover', 'none']);
export const SCALES = Object.freeze([1, 0.75, 0.5, 0.25]);
export const ALIGNS = Object.freeze([0, 0.5, 1]);

let serial = 0;
export const frameOf = (picture, duration = DELAY.start) => ({id: ++serial, picture, duration: delayOf(duration), skip: false});
export const delayOf = value => Math.min(DELAY.max, Math.max(DELAY.min, Math.round(Number(value)) || DELAY.start));
export const loopsOf = value => Math.min(LOOPS.max, Math.max(LOOPS.min, Math.round(Number(value)) || 0));
const shown = frames => frames.filter(frame => !frame.skip);

export function canvasOf(frames, {size = 'first', scale = 1} = {}) {
	const kept = shown(frames);
	if (!kept.length) return null;
	let pick = kept[0].picture;
	if (size !== 'first') for (const {picture} of kept) {
		const area = picture.width * picture.height, best = pick.width * pick.height;
		if (size === 'largest' ? area > best : area < best) pick = picture;
	}
	const s = SCALES.includes(scale) ? scale : 1;
	return {width: Math.max(1, Math.round(pick.width * s)), height: Math.max(1, Math.round(pick.height * s))};
}

export function placement(picture, canvas, {fit = 'contain', align = [0.5, 0.5]} = {}) {
	const {width: w, height: h} = picture, [ax, ay] = align;
	let scale = 1;
	if (fit === 'contain') scale = Math.min(canvas.width / w, canvas.height / h);
	else if (fit === 'cover') scale = Math.max(canvas.width / w, canvas.height / h);
	if (w === canvas.width && h === canvas.height) scale = 1;
	const dw = w * scale, dh = h * scale;
	const exactScale = Math.abs(scale - 1) < 1e-9;
	const dx = exactScale ? Math.round((canvas.width - w) * ax) : (canvas.width - dw) * ax, dy = exactScale ? Math.round((canvas.height - h) * ay) : (canvas.height - dh) * ay;
	return {dx: dx + 0, dy: dy + 0, dw: exactScale ? w : dw, dh: exactScale ? h : dh, exact: exactScale};
}

export function blit(picture, canvas, {dx, dy}) {
	const out = new Uint8Array(canvas.width * canvas.height * 4), {width, height, data} = picture;
	const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(canvas.width, dx + width), y1 = Math.min(canvas.height, dy + height);
	if (x1 <= x0 || y1 <= y0) return out;
	if (!dx && !dy && width === canvas.width && height === canvas.height) { out.set(data.subarray(0, out.length)); return out; }
	for (let y = y0; y < y1; y++) {
		const from = ((y - dy) * width + (x0 - dx)) * 4;
		out.set(data.subarray(from, from + (x1 - x0) * 4), (y * canvas.width + x0) * 4);
	}
	return out;
}

export function timeline(frames) {
	const kept = shown(frames);
	return {count: kept.length, ms: kept.reduce((sum, frame) => sum + frame.duration, 0)};
}

export function fits(frames, canvas) {
	const count = shown(frames).length;
	if (!canvas || !count) return {ok: false, why: 'empty'};
	if (canvas.width * canvas.height > PIXELS) return {ok: false, why: 'pixels'};
	if (count > FRAMES) return {ok: false, why: 'frames', most: FRAMES};
	const most = Math.floor(FRAME_PIXELS / (canvas.width * canvas.height));
	return count > most ? {ok: false, why: 'memory', most} : {ok: true};
}

export async function animationOf(frames, {size, scale, fit, align, loops = 0}, draw, {signal} = {}) {
	const canvas = canvasOf(frames, {size, scale});
	const out = [];
	let last = null;
	for (const frame of shown(frames)) {
		signal?.throwIfAborted();
		if (last && last.picture === frame.picture) { out[out.length - 1].duration += frame.duration; continue; }
		const lay = async picture => { const place = placement(picture, canvas, {fit, align}); return place.exact ? blit(picture, canvas, place) : draw(picture, canvas, place); };
		const data = frame.picture.mix ? mixed(await lay(frame.picture.mix.a), await lay(frame.picture.mix.b), frame.picture.mix.t) : await lay(frame.picture);
		out.push({data, duration: frame.duration});
		last = frame;
	}
	return {width: canvas.width, height: canvas.height, loops: loopsOf(loops), frames: out};
}

export function exactOf(frames, settings) {
	const canvas = canvasOf(frames, settings);
	return !!canvas && shown(frames).every(frame => {
		const {picture} = frame, place = !picture.mix && placement(picture, canvas, settings);
		return place && place.exact && place.dx >= 0 && place.dy >= 0 && place.dx + picture.width <= canvas.width && place.dy + picture.height <= canvas.height;
	});
}

export function mixed(a, b, t) {
	const out = new Uint8Array(a.length), u = 1 - t;
	for (let i = 0; i < a.length; i += 4) {
		const alpha = a[i + 3] * u + b[i + 3] * t;
		out[i + 3] = Math.round(alpha);
		if (!alpha) continue;
		const wa = a[i + 3] * u / alpha, wb = b[i + 3] * t / alpha;
		out[i] = Math.round(a[i] * wa + b[i] * wb); out[i + 1] = Math.round(a[i + 1] * wa + b[i + 1] * wb); out[i + 2] = Math.round(a[i + 2] * wa + b[i + 2] * wb);
	}
	return out;
}
export const FADE = Object.freeze({count: 4, ms: 40});
export function fade(frames, ids, {count = FADE.count, ms = FADE.ms} = {}) {
	if (ids.size < 2) ids = new Set();
	const around = !ids.size || ids.size === frames.length;
	const run = frames.filter(frame => !frame.skip && !frame.picture.mix && (!ids.size || ids.has(frame.id)));
	if (run.length < 2) return {frames, made: new Set()};
	const pairs = new Map(run.slice(0, -1).map((frame, at) => [frame.id, run[at + 1]]));
	if (around) pairs.set(run[run.length - 1].id, run[0]);
	const out = [], made = new Set();
	const between = (a, b) => Array.from({length: count}, (_, k) => {
		const frame = {id: ++serial, picture: {width: a.picture.width, height: a.picture.height, mix: {a: a.picture, b: b.picture, t: (k + 1) / (count + 1)}}, duration: delayOf(ms), skip: false};
		made.add(frame.id);
		return frame;
	});
	for (const frame of frames) { out.push(frame); const next = pairs.get(frame.id); if (next) out.push(...between(frame, next)); }
	return {frames: out, made};
}
export const byName = files => [...files].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, {numeric: true, sensitivity: 'base'}));

const chosen = (frames, ids) => frames.filter(frame => ids.has(frame.id));
export function remove(frames, ids) { return frames.filter(frame => !ids.has(frame.id)); }
export function duplicate(frames, ids) {
	const out = [], made = new Set();
	for (const frame of frames) {
		out.push(frame);
		if (ids.has(frame.id)) { const copy = {...frame, id: ++serial}; out.push(copy); made.add(copy.id); }
	}
	return {frames: out, made};
}
export function skip(frames, ids) {
	const all = chosen(frames, ids).every(frame => frame.skip);
	return frames.map(frame => ids.has(frame.id) ? {...frame, skip: !all} : frame);
}
export function delay(frames, ids, ms) {
	const value = delayOf(ms);
	return frames.map(frame => !ids.size || ids.has(frame.id) ? {...frame, duration: value} : frame);
}
export function move(frames, ids, to) {
	const moving = chosen(frames, ids);
	if (!moving.length) return frames;
	const before = frames.slice(0, Math.max(0, Math.min(frames.length, to))).filter(frame => !ids.has(frame.id));
	const after = frames.slice(Math.max(0, Math.min(frames.length, to))).filter(frame => !ids.has(frame.id));
	return [...before, ...moving, ...after];
}
export function nudge(frames, ids, step) {
	const at = frames.map((frame, index) => ids.has(frame.id) ? index : -1).filter(index => index >= 0);
	if (!at.length) return frames;
	if (step < 0) return at[0] === 0 ? frames : move(frames, ids, at[0] - 1);
	return at[at.length - 1] === frames.length - 1 ? frames : move(frames, ids, at[at.length - 1] + 2);
}
export function reverse(frames, ids) {
	const places = frames.map((frame, index) => !ids.size || ids.has(frame.id) ? index : -1).filter(index => index >= 0);
	const out = frames.slice(), picked = places.map(index => frames[index]).reverse();
	places.forEach((index, at) => { out[index] = picked[at]; });
	return out;
}
export function boomerang(frames, ids) {
	const run = frames.filter(frame => !ids.size || ids.has(frame.id));
	if (run.length < 3) return frames;
	const back = run.slice(1, -1).reverse().map(frame => ({...frame, id: ++serial}));
	const last = frames.lastIndexOf(run[run.length - 1]);
	return [...frames.slice(0, last + 1), ...back, ...frames.slice(last + 1)];
}
export function pick(frames, {from = 1, to = frames.length, every = 1} = {}) {
	const a = Math.max(1, Math.min(frames.length, Math.round(from) || 1)), b = Math.max(a, Math.min(frames.length, Math.round(to) || frames.length)), n = Math.max(1, Math.round(every) || 1);
	const ids = new Set();
	for (let at = a - 1; at < b; at += n) ids.add(frames[at].id);
	return ids;
}
export function span(frames, anchor, id) {
	const a = frames.findIndex(frame => frame.id === anchor), b = frames.findIndex(frame => frame.id === id);
	if (a < 0 || b < 0) return new Set([id]);
	return new Set(frames.slice(Math.min(a, b), Math.max(a, b) + 1).map(frame => frame.id));
}

export function summary(frames, settings) {
	const {count, ms} = timeline(frames), canvas = canvasOf(frames, settings);
	if (!count) return '';
	return count + (count === 1 ? ' frame' : ' frames') + ' · ' + (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s · ' + canvas.width + ' × ' + canvas.height;
}

export const ANSWERS = Object.freeze({
	title: 'Animated JPEG XL',
	items: Object.freeze([
		Object.freeze(['How do I make an animated JPEG XL?', 'Tap animated, then choose or drop a GIF, APNG, animated WebP, a video or several pictures. Order the frames, set their delays, then Make JPEG XL and download the .jxl file.']),
		Object.freeze(['Why does my viewer show a still picture?', 'Some viewers and image libraries decode only the first frame of a JPEG XL. Open the file in a browser that plays it, or in a viewer built on libjxl with animation turned on.']),
		Object.freeze(['Which browsers open JPEG XL?', 'Chrome 155, Firefox 158 and Safari 17 and later. Safari does not play animated JPEG XL. Any browser can make the files here.']),
		Object.freeze(['Is animated JPEG XL smaller than a GIF?', 'Yes. Lossless keeps every frame of a GIF exactly and the file is smaller. High and Medium are smaller still.']),
	])});
