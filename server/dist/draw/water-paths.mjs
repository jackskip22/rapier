// SPDX-License-Identifier: AGPL-3.0-only
import {WATER_STROKE_SET_ID, WATER_LETTER_SETS, strokeLetterGlyph} from './stroke-letters.mjs';
import {_rapierDrawShapeContours, _rapierDrawBBox} from './core.mjs';
import {WATER_TICK_HZ, WATER_ACTION_MAX_POINTS} from './water-data.mjs';

export {WATER_STROKE_SET_ID, WATER_LETTER_SETS};

const TRACE_KINDS = new Set(['ink', 'line', 'arrow', 'parabola', 'arc', 'rect', 'circle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'cylinder', 'subroutine', 'asymmetric']);
function fail(code, message) { throw Object.assign(new Error(message), {code}); }
function number(value, low, high, name) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) fail('WATER_PATH', 'Choose a valid ' + name + '.');
	return value;
}
function optionsFor(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('WATER_PATH', 'Choose valid stroke settings.');
	const pressure = number(raw.pressure ?? .65, 0, 1, 'pressure'), speed = number(raw.speed ?? 180, .01, 100000, 'speed');
	const tick = number(raw.tick ?? 0, 0, Number.MAX_SAFE_INTEGER, 'tick');
	const maxPoints = number(raw.maxPoints ?? WATER_ACTION_MAX_POINTS, 1, WATER_ACTION_MAX_POINTS, 'point limit');
	if (!Number.isSafeInteger(tick) || !Number.isSafeInteger(maxPoints)) fail('WATER_PATH', 'Use whole ticks and point limits.');
	return {pressure, speed, tick, maxPoints};
}
function recordedPaths(rawPaths, options) {
	const {pressure, speed, maxPoints} = options, paths = [];
	let count = 0, distance = 0, tick = options.tick;
	for (const raw of rawPaths) {
		if (!Array.isArray(raw) || !raw.length) fail('WATER_PATH', 'Choose a shape with a path.');
		count += raw.length;
		if (count > maxPoints) fail('WATER_LIMIT', 'Use fewer words or a simpler path for this stroke.');
		if (paths.length) tick++;
		const path = [];
		for (let i = 0; i < raw.length; i++) {
			const p = raw[i];
			if (!Array.isArray(p) || p.length < 2 || p.slice(0, 2).some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6)) fail('WATER_PATH', 'Keep the stroke within the drawing.');
			if (i) distance += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
			const at = tick + Math.round(distance * WATER_TICK_HZ / speed);
			if (!Number.isSafeInteger(at)) fail('WATER_LIMIT', 'Use a shorter stroke or a faster speed.');
			path.push([p[0], p[1], pressure, at]);
		}
		paths.push(path);
	}
	if (!paths.length) fail('WATER_PATH', 'Choose words or a shape with a path.');
	const bounds = _rapierDrawBBox(paths.flat());
	return {paths, bounds, nextTick: paths.at(-1).at(-1)[3]};
}

// Paths, including every accent and pen lift, are captured before paint admission.
export function waterTextPaths(text, raw = {}) {
	const options = optionsFor(raw);
	if (typeof text !== 'string' || !text.length) fail('WATER_PATH', 'Enter words to paint.');
	if (text.length > 4096) fail('WATER_LIMIT', 'Use a shorter passage for this stroke.');
	const x = number(raw.x ?? 0, -1e6, 1e6, 'horizontal position'), y = number(raw.y ?? 0, -1e6, 1e6, 'vertical position');
	const size = number(raw.size ?? 48, .1, 10000, 'letter size'), spacing = number(raw.spacing ?? .12, 0, 10, 'letter spacing');
	const lineHeight = number(raw.lineHeight ?? 1.5, .1, 20, 'line height'), align = raw.align ?? 'left', set = raw.set ?? WATER_STROKE_SET_ID;
	if (!['left', 'center', 'right'].includes(align)) fail('WATER_PATH', 'Choose left, center or right alignment.');
	const metrics = WATER_LETTER_SETS.find(item => item.id === set);
	if (!metrics) fail('WATER_GLYPH', 'Choose an available stroke letter set.');
	const canonical = text.replace(/\r\n?/g, '\n').normalize('NFC'), lines = [[]];
	for (const character of canonical.normalize('NFD')) {
		if (character === '\n') { lines.push([]); continue; }
		const line = lines.at(-1);
		if (/\p{M}/u.test(character)) {
			if (!line.length || /^[\s]$/u.test(line.at(-1))) fail('WATER_GLYPH', 'Place each accent on a supported letter.');
			line[line.length - 1] += character;
		} else line.push(character);
	}
	const scale = size / metrics.em, prepared = [];
	let width = 0, points = 0;
	for (const line of lines) {
		const glyphs = [], advances = [];
		for (const character of line) {
			const space = character === ' ' || character === '\u00a0' || character === '\t';
			const glyph = space ? null : strokeLetterGlyph(character, set);
			if (!space && !glyph) fail('WATER_GLYPH', 'This letter set does not include “' + character.normalize('NFC') + '”.');
			glyphs.push(glyph);
			advances.push((space ? metrics.space * (character === '\t' ? 4 : 1) : glyph.advance) * scale);
			if (glyph) for (const path of glyph.paths) points += path.length;
			if (points > options.maxPoints) fail('WATER_LIMIT', 'Use fewer words for this stroke.');
		}
		const lineWidth = advances.reduce((sum, advance) => sum + advance, 0) + Math.max(0, line.length - 1) * spacing * size;
		width = Math.max(width, lineWidth);
		prepared.push({glyphs, advances, width: lineWidth});
	}
	const paths = [];
	for (let line = 0; line < prepared.length; line++) {
		const row = prepared[line], offset = align === 'center' ? row.width / 2 : align === 'right' ? row.width : 0;
		let cursor = x - offset;
		for (let i = 0; i < row.glyphs.length; i++) {
			if (row.glyphs[i]) for (const path of row.glyphs[i].paths) paths.push(path.map(point => [cursor + point[0] * scale, y + line * lineHeight * size + point[1] * scale]));
			cursor += row.advances[i] + spacing * size;
		}
	}
	return {...recordedPaths(paths, options), text: canonical, set, width, height: size + Math.max(0, prepared.length - 1) * lineHeight * size};
}

// Trace reads the same contours as drawing geometry, including separate interior marks.
export function waterTracePaths(shape, recipe, raw = {}) {
	const options = optionsFor(raw);
	if (!shape || typeof shape !== 'object' || !TRACE_KINDS.has(shape.recognized)) fail('WATER_PATH', 'Choose a drawing shape to trace.');
	const source = shape.stroke != null && recipe?.strokes?.[shape.stroke]?.pts;
	if (source && (!Array.isArray(source) || source.length > WATER_ACTION_MAX_POINTS)) fail('WATER_LIMIT', 'Choose a simpler path to trace.');
	let paths;
	try { paths = _rapierDrawShapeContours(shape, recipe); }
	catch (_) { fail('WATER_PATH', 'Choose a complete drawing shape to trace.'); }
	return recordedPaths(paths, options);
}
