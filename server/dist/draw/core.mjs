// SPDX-License-Identifier: AGPL-3.0-only
import {drawingSVGMetadata, drawingTextAlternative as _rapierDrawTextAlternative} from '../images/assets.mjs';
import {getStrokePoints} from './freehand.mjs';
import {penPath, strokeHasPressure as _rapierDrawStrokeHasPressure} from './pen-path.mjs';
import {DRAW_TEXT_MAX, GARDEN_COLOURS, admitText, layoutText, letterInputFont, restoreLetters} from './text.mjs';
import {admitFonts, fontDefs, fontMetadata, restoreFonts} from './font.mjs';
import {roughPaths} from './rough.mjs';
import {COPIER_PRESETS, copierPreset, admitCopier, copierBounds, copierMarkup, copierPreviewEffect,
	REFRACTION_PRESETS, refractionPreset, admitRefraction, LIQUID_PRESETS, LIQUID_PALETTES, liquidPreset, admitLiquid,
	fillEffect, admitEffect, effectPreset, effectBounds, effectMarkup, refractionSourceReferences, remapRefractionSources, remapRefractionRecipeSources} from './effects.mjs';
import {liquidStillPut, liquidStillHas, liquidStillsWanted, liquidStillsFromSVG, liquidStillKey, liquidStillSize, liquidStillSteps} from './liquid.mjs';
export {refractionSourceReferences, remapRefractionSources, remapRefractionRecipeSources};
import {_rapierColorForDarkPaper, _rapierContrastRatio} from '../editor/colour-math.mjs';
import {normalizeBackground, paperShifted, backgroundSVG, BACKGROUND_PRESETS, BACKGROUND_KINDS, backgroundStart, fillBackground, sampleStops as _rapierDrawSampleStops, PAPER_CHOICES as RAPIER_DRAW_PAPERS, paperTileListen as _rapierDrawPaperListen, paperTileRequest as _rapierDrawPaperRequest} from './backgrounds.mjs';
import {admitPaintStrokeRecords, admitPaintReplay} from './paint-history.mjs';
import {admitWaterActions, waterPaperById} from './water-data.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {inspectJPEGXL} from '../images/header.mjs';
import {inspectRaster} from '../images/raster.mjs';
import {ornamentPath} from './ornaments.mjs';
import {hasRefraction, refractionRecipeKey, admitRefractionRenditions, currentRefractionRenditions, stripRefractionRenditions, restoreRefractionRenditions} from './refraction-rendition.mjs';

const _rapierDrawAssetGenerations = [];
export function _rapierDrawAssetGeneration(value) {
	const at = _rapierDrawAssetGenerations.findIndex(row => row.value === value);
	if (at >= 0) { const [row] = _rapierDrawAssetGenerations.splice(at, 1); _rapierDrawAssetGenerations.push(row); return row.digest; }
	const digest = sha256(value);
	if (typeof value === 'string' && value.length <= 32 * 1024 * 1024) {
		_rapierDrawAssetGenerations.push({value, digest});
		while (_rapierDrawAssetGenerations.length > 4 || _rapierDrawAssetGenerations.reduce((total, row) => total + row.value.length, 0) > 32 * 1024 * 1024)
			_rapierDrawAssetGenerations.shift();
	}
	return digest;
}

function _rapierDrawNextAssetName(records) {
	const used = new Set();
	for (const row of records) if (typeof row.title === 'string') used.add(row.title);
	let number = 1;
	while (used.has('draw-' + number + '.svg')) number++;
	return 'draw-' + number + '.svg';
}

const RAPIER_DRAW_VERSION = 1;

const RAPIER_DRAW_LABEL_MAX = DRAW_TEXT_MAX;

const RAPIER_DRAW_POLYGONS = Object.freeze({ diamond: 4, pentagon: 5, hexagon: 6, octagon: 8, star: 10 });
const RAPIER_DRAW_BOXES = new Set(['rect', 'cylinder', 'subroutine', 'asymmetric']);

const RAPIER_DRAW_HEADS = Object.freeze(['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar']);

// RAPIER_DRAW_NIB_DEFAULT; _rapierDrawNibScale multiplies either one for a different nib.
const RAPIER_DRAW_INK_WIDTH = 6.4;
const RAPIER_DRAW_SHAPE_WIDTH = 2.6;

const RAPIER_DRAW_INK_LOOK_BRUSHES = new Set(['spring', 'rope', 'tube', 'ray', 'light']);

const RAPIER_DRAW_INK = '#121212';

const RAPIER_DRAW_INK_NAMES = Object.freeze({ green: '#338758', red: '#c83845', blue: '#2c70d9', gold: '#99692d', purple: '#8a3eec' });

const RAPIER_DRAW_DIAGRAM = Object.freeze({
	ink: Object.freeze(['#121212', '#fafafa']), box: Object.freeze(['#f0f0f0', '#333333']), accent: Object.freeze(['#12a594', '#12a594']),
	'on-accent': Object.freeze(['#000000', '#000000']), step: Object.freeze(['#666666', '#999999']),
});
function _rapierDrawOnInk(fill) {
	if (fill === RAPIER_DRAW_DIAGRAM.accent[0]) return RAPIER_DRAW_DIAGRAM['on-accent'][0];
	if (fill === RAPIER_DRAW_DIAGRAM.box[0]) return RAPIER_DRAW_INK;
	const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
	const l = lum(fill);
	return (1.05 / (l + .05)) > ((l + .05) / (lum(RAPIER_DRAW_INK) + .05)) ? '#ffffff' : RAPIER_DRAW_INK;
}
const RAPIER_DRAW_PAINT_INK_FILTER = '<filter id="rapier-paint-ink" color-interpolation-filters="sRGB">' +
	'<feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/>' +
	'<feColorMatrix type="hueRotate" values="180"/></filter>';
function _rapierDrawUsedColours(body) {
	return new Set([...body.matchAll(/\b(fill|stroke|color|stop-color)="(#[0-9a-f]{6})"/g)].map(m => m[1] + m[2]));
}
function _rapierDrawDarkRules(used, recipe, { currentColor = false, paint = false } = {}) {
	const pairs = Object.entries(RAPIER_DRAW_DIAGRAM), rules = [];
	const look = pairs.some(([role, [light]]) => role !== 'ink' && (used.has('fill' + light) || used.has('stroke' + light)));
	const turned = new Map(look ? pairs.map(([, pair]) => pair) : [RAPIER_DRAW_DIAGRAM.ink]);
	for (const kind of Object.values(GARDEN_COLOURS)) if (!turned.has(kind[0])) turned.set(kind[0], kind[1]);
	const turn = hex => { if (!turned.has(hex)) turned.set(hex, _rapierColorForDarkPaper(hex)); return turned.get(hex); };
	if (look) for (const [, [light, dark]] of pairs) for (const attr of ['fill', 'stroke']) if (used.has(attr + light)) rules.push('[' + attr + '="' + light + '"]{' + attr + ':' + dark + '}');
	const named = new Set(look ? pairs.flatMap(([, [light]]) => ['fill' + light, 'stroke' + light]) : []);
	for (const entry of used) {
		const attr = entry.slice(0, -7), hex = entry.slice(-7), dark = turn(hex);
		if (!named.has(entry) && dark !== hex) rules.push('[' + attr + '="' + hex + '"]{' + attr + ':' + dark + '}');
	}
	if (currentColor) rules.push('[color="' + RAPIER_DRAW_INK + '"]{color:' + turn(RAPIER_DRAW_INK) + '}');
	for (const shape of recipe.shapes) {
		if (shape.authorStyle) continue;
		if (!shape.label || !shape.labelIn || shape.style !== 'solid' || shape.recognized === 'text' || shape.brush && shape.brush !== 'ink') continue;
		const fill = _rapierDrawShapeInk(shape), words = _rapierDrawOnInk(fill), dark = turn(fill);
		if (_rapierContrastRatio(turn(words), dark) >= 4.5) continue;
		const ink = _rapierContrastRatio('#121212', dark) > _rapierContrastRatio('#ffffff', dark) ? '#121212' : '#ffffff';
		rules.push('[data-shape-id="' + shape.id + '"] [fill="' + words + '"]{fill:' + ink + '}');
	}
	for (const shape of recipe.shapes) if (shape.authorStyle) {
		const a = shape.authorStyle, scope = '[data-shape-id="' + shape.id + '"]';
		const fill = a.fill && _rapierColorForDarkPaper(a.fill), ink = fill ? _rapierContrastRatio(fill, '#000000') >= _rapierContrastRatio(fill, '#ffffff') ? '#000000' : '#ffffff' : a.color && _rapierColorForDarkPaper(a.color);
		if (fill) rules.push(scope + ' > [fill="' + a.fill + '"]{fill:' + fill + '}');
		if (a.stroke) rules.push(scope + ' > [stroke="' + a.stroke + '"]{stroke:' + _rapierColorForDarkPaper(a.stroke) + '}');
		if (ink) rules.push(scope + ' [data-author-label] [fill]{fill:' + ink + '}');
		if (fill && !a.stroke) rules.push(scope + ' > [data-box-mark]{stroke:' + ink + '}');
	}
	if (paint) rules.push('[data-rapier-paint]{filter:url(#rapier-paint-ink)}');
	if (recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength)) {
		return rules.map(rule => rule.replace('{', ':not([data-rapier-effect] *){')).concat('[data-rapier-effect]{color:' + RAPIER_DRAW_INK + '}');
	}
	return rules;
}
function _rapierDrawDiagramDark(body, recipe) {
	if (recipe.background?.kind === 'paper') return '';
	const paint = body.includes('data-rapier-paint=');
	const rules = _rapierDrawDarkRules(_rapierDrawUsedColours(body), recipe, { currentColor: body.includes('currentColor'), paint });
	return (rules.length ? '<style>@media (prefers-color-scheme:dark){' + rules.join('') + '}</style>' : '') + (paint ? '<defs>' + RAPIER_DRAW_PAINT_INK_FILTER + '</defs>' : '');
}

function _rapierDrawValidInk(ink) {
	return typeof ink === 'string' && (Object.hasOwn(RAPIER_DRAW_INK_NAMES, ink) ? ink : /^#[\da-f]{6}$/i.test(ink) ? ink.toLowerCase() : null);
}

function _rapierDrawFigureTraits(raw, kind) {
	const out = {};
	if (raw.corner != null) { if (kind !== 'rect' || typeof raw.corner !== 'number' || !Number.isFinite(raw.corner) || raw.corner <= 0 || raw.corner > .5) return null; out.corner = raw.corner; }
	if (raw.flat != null) { if (kind !== 'hexagon' || typeof raw.flat !== 'boolean') return null; if (raw.flat) out.flat = true; }
	if (raw.authorStyle != null) {
		if (!raw.authorStyle || typeof raw.authorStyle !== 'object' || Array.isArray(raw.authorStyle) || !['circle', 'ellipse', 'triangle'].includes(kind) && !RAPIER_DRAW_BOXES.has(kind) && !Object.hasOwn(RAPIER_DRAW_POLYGONS, kind)) return null;
		const own = {};
		for (const key of Object.keys(raw.authorStyle)) {
			const color = _rapierDrawValidInk(raw.authorStyle[key]);
			if (!['fill', 'stroke', 'color'].includes(key) || !color) return null;
			own[key] = RAPIER_DRAW_INK_NAMES[color] || color;
		}
		if (Object.keys(own).length) out.authorStyle = own;
	}
	return out;
}

const RAPIER_DRAW_RASTER_MAX = 8 * 1024 * 1024, RAPIER_DRAW_RASTER_TOTAL = 24 * 1024 * 1024;
const _RAPIER_DRAW_RASTER = /^data:image\/(?:png;base64,iVBORw0KGgo|jxl;base64,(?:\/w[o-r]|AAAADEpYTCA))[A-Za-z0-9+/]*={0,2}$/;
function _rapierDrawAgentStrokes(raw) {
	return admitPaintStrokeRecords(raw);
}
const RAPIER_DRAW_RASTERS_KEPT = 4, _rapierDrawRastersAdmitted = [];
function _rapierDrawRasterInfo(value, max = RAPIER_DRAW_RASTER_MAX) {
	if (typeof value !== 'string' || value.length < 60 || value.length > max) return null;
	const lifted = max === Infinity;
	for (const row of _rapierDrawRastersAdmitted) if (row.lifted === lifted && row.value === value) return row.info;
	if (!_RAPIER_DRAW_RASTER.test(value)) return null;
	const encoded = value.slice(value.indexOf(',') + 1);
	if (encoded.length % 4) return null;
	try {
		let bytes;
		if (typeof Uint8Array.fromBase64 === 'function') bytes = Uint8Array.fromBase64(encoded, {lastChunkHandling: 'strict'});
		else {
			const binary = atob(encoded);
			if (btoa(binary) !== encoded) return null;
			bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		}
		const info = value.startsWith('data:image/png;') ? inspectRaster(bytes, {maximumBytes: lifted ? Infinity : undefined}) : inspectJPEGXL(bytes);
		if (info) { _rapierDrawRastersAdmitted.push({lifted, value, info}); if (_rapierDrawRastersAdmitted.length > RAPIER_DRAW_RASTERS_KEPT) _rapierDrawRastersAdmitted.shift(); }
		return info;
	} catch { return null; }
}
function _rapierDrawValidRaster(value, max = RAPIER_DRAW_RASTER_MAX) {
	return _rapierDrawRasterInfo(value, max) ? value : null;
}

function _rapierDrawShapeInk(shape) {
	const ink = _rapierDrawValidInk((shape?.style === 'solid' ? shape?.authorStyle?.fill : shape?.authorStyle?.stroke) || shape?.ink);
	return RAPIER_DRAW_INK_NAMES[ink] || ink || RAPIER_DRAW_INK;
}

function _rapierDrawBrushesFor(kind, hasStroke = false) {
	if (hasStroke && !['ink', 'line', 'arrow'].includes(kind)) return [...new Set([..._rapierDrawBrushesFor(kind), ...RAPIER_DRAW_INK_LOOK_BRUSHES])];
	const sketch = ['sketch', 'hatched'];
	if (kind === 'circle') return ['ink', 'brush', ...sketch, 'sphere', 'wheel', 'pulley', 'wood', 'knot'];
	if (kind === 'ellipse') return ['ink', 'brush', ...sketch, 'sphere', 'lens', 'wood', 'knot'];
	if (kind === 'rect' || kind === 'triangle' || Object.hasOwn(RAPIER_DRAW_POLYGONS, kind)) return ['ink', 'brush', ...sketch, 'wood', 'knot'];
	if (kind === 'line' || kind === 'arrow') return ['ink', 'brush', ...sketch, 'spring', 'rope', 'tube', 'ray', 'light'];
	if (kind === 'arc' || kind === 'parabola') return ['ink', 'brush', ...sketch];
	if (kind === 'ink') return ['ink', 'brush', ...sketch, 'spring', 'rope', 'tube', 'ray', 'light'];
	return ['ink'];
}

const RAPIER_DRAW_DEFAULT_LIGHT = -Math.PI * 3 / 4;

function _rapierDrawLightAngle(recipe) { return typeof recipe.light === 'number' && isFinite(recipe.light) ? recipe.light : RAPIER_DRAW_DEFAULT_LIGHT; }

const RAPIER_DRAW_ARROW_HEAD_LEN = 14;

const RAPIER_DRAW_ARROW_HEAD_W = 10;

const RAPIER_DRAW_ANGLE_R = 18;

const RAPIER_DRAW_ARC_FULL_TURN = Math.PI * 2;

const RAPIER_DRAW_SMOOTH_DEFAULT = 25;

function _rapierDrawDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function _rapierDrawClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function _rapierDrawFmt(n) {
	const r = Math.round(n * 100) / 100;
	return r.toString();
}

function _rapierDrawSpatial(n) { return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 65536; }

function _rapierDrawWorkCount(count, limit = 65536) {
	if (!Number.isFinite(count) || count < 0 || count > limit) throw Object.assign(new RangeError('Drawing is too complex'), {code: 'drawing_work_limit'});
	return count;
}

function _rapierDrawRDP(points, eps) {
	if (points.length < 3) return points.slice();
	const keep = new Uint8Array(points.length), stack = [0, points.length - 1];
	let work = 0;
	keep[0] = keep[points.length - 1] = 1;
	while (stack.length) {
		const end = stack.pop(), start = stack.pop();
		if (end - start < 2) continue;
		work = _rapierDrawWorkCount(work + end - start - 1, 4194304);
		const p1 = points[start], p2 = points[end];
		const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1e-6;
		let maxD = -1, index = start;
		for (let i = start + 1; i < end; i++) {
			const p = points[i], d = Math.abs(dy * p[0] - dx * p[1] + p2[0] * p1[1] - p2[1] * p1[0]) / len;
			if (d > maxD) { maxD = d; index = i; }
		}
		if (maxD > eps) { keep[index] = 1; stack.push(start, index, index, end); }
	}
	return points.filter((point, index) => keep[index]);
}

function _rapierDrawRDPWeighted(points, eps, channels) {
	if (points.length < 3) return points.slice();
	const keep = new Uint8Array(points.length), stack = [0, points.length - 1];
	let work = 0;
	keep[0] = keep[points.length - 1] = 1;
	while (stack.length) {
		const end = stack.pop(), start = stack.pop();
		if (end - start < 2) continue;
		work = _rapierDrawWorkCount(work + end - start - 1, 4194304);
		const p1 = points[start], p2 = points[end];
		const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1e-6;
		let maxD = -1, index = start;
		for (let i = start + 1; i < end; i++) {
			const p = points[i], t = (i - start) / (end - start);
			let d = Math.abs(dy * p[0] - dx * p[1] + p2[0] * p1[1] - p2[1] * p1[0]) / len;
			for (const [idx, weight] of channels || []) {
				const v = p[idx], v1 = p1[idx], v2 = p2[idx];
				if (typeof v !== 'number' || typeof v1 !== 'number' || typeof v2 !== 'number') continue;
				const chanD = Math.abs(v - (v1 + (v2 - v1) * t)) * weight;
				if (chanD > d) d = chanD;
			}
			if (d > maxD) { maxD = d; index = i; }
		}
		if (maxD > eps) { keep[index] = 1; stack.push(start, index, index, end); }
	}
	return points.filter((point, index) => keep[index]);
}

function _rapierDrawRDPClosed(loopPts, eps) {
	if (loopPts.length < 4) return loopPts.slice();
	let farIdx = 1, farD = -1;
	for (let i = 1; i < loopPts.length; i++) { const d = _rapierDrawDist(loopPts[0], loopPts[i]); if (d > farD) { farD = d; farIdx = i; } }
	if (farIdx <= 0 || farIdx >= loopPts.length - 1) return _rapierDrawRDP(loopPts, eps);
	const arcA = loopPts.slice(0, farIdx + 1);
	const arcB = loopPts.slice(farIdx).concat([loopPts[0]]);
	const simpA = _rapierDrawRDP(arcA, eps), simpB = _rapierDrawRDP(arcB, eps);
	return simpA.slice(0, -1).concat(simpB.slice(0, -1));
}

function _rapierDrawPerimeter(points, closed) {
	let sum = 0;
	for (let i = 1; i < points.length; i++) sum += _rapierDrawDist(points[i - 1], points[i]);
	if (closed && points.length > 1) sum += _rapierDrawDist(points[points.length - 1], points[0]);
	return sum;
}

function _rapierDrawBBox(points) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of points) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
	return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function _rapierDrawResamplePolyline(pts, n) {
	const total = _rapierDrawPerimeter(pts, false);
	if (total < 1e-6) return pts.map(p => [p[0], p[1]]);
	const out = [];
	let idx = 0, acc = 0;
	for (let k = 0; k <= n; k++) {
		const target = (k / n) * total;
		while (idx < pts.length - 2 && acc + _rapierDrawDist(pts[idx], pts[idx + 1]) < target) { acc += _rapierDrawDist(pts[idx], pts[idx + 1]); idx++; }
		const segLen = _rapierDrawDist(pts[idx], pts[idx + 1]) || 1e-9;
		const t = _rapierDrawClamp((target - acc) / segLen, 0, 1);
		out.push([pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * t, pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * t]);
	}
	return out;
}

function _rapierDrawIsClosedStroke(pts) {
	if (!pts || pts.length < 2) return false;
	const bbox = _rapierDrawBBox(pts);
	const diag = Math.hypot(bbox.w, bbox.h) || 1;
	return diag > 14 && _rapierDrawDist(pts[0], pts[pts.length - 1]) <= Math.max(20, diag * 0.16);
}

function _rapierDrawEllipsePolygon(cx, cy, rx, ry, rot, n) {
	const pts = [], cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a);
		pts.push([cx + x * cs - y * sn, cy + x * sn + y * cs]);
	}
	return pts;
}

function _rapierDrawRectPolygon(cx, cy, w, h, rot) {
	const hw = w / 2, hh = h / 2, cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
	return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * cs - y * sn, cy + x * sn + y * cs]);
}

function _rapierDrawBoxContours(shape) {
	if (shape.recognized === 'rect' && !shape.corner) return null;
	const g = shape.geom, frame = g.p || _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
	const w = _rapierDrawDist(frame[0], frame[1]), h = _rapierDrawDist(frame[0], frame[3]);
	const map = points => points.map(([x, y]) => [frame[0][0] + (frame[1][0] - frame[0][0]) * x + (frame[3][0] - frame[0][0]) * y,
		frame[0][1] + (frame[1][1] - frame[0][1]) * x + (frame[3][1] - frame[0][1]) * y]);
	const arc = (cx, cy, rx, ry, start, end, count = 16) => Array.from({length: count + 1}, (_, i) => { const a = start + (end - start) * i / count; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
	let outline, marks = [], textFrame;
	if (shape.recognized === 'cylinder') {
		const r = Math.min(.15, w / h * .1);
		outline = [...arc(.5, r, .5, r, Math.PI, 2 * Math.PI), ...arc(.5, 1 - r, .5, r, 0, Math.PI)];
		marks = [arc(.5, r, .5, r, 0, Math.PI)];
		textFrame = [[0, 2 * r], [1, 2 * r], [1, 1 - r], [0, 1 - r]];
	} else if (shape.recognized === 'asymmetric') { outline = [[0, 0], [1, 0], [1, 1], [0, 1], [.18, .5]]; textFrame = [[.18, 0], [1, 0], [1, 1], [.18, 1]]; }
	else if (shape.recognized === 'subroutine') {
		outline = [[0, 0], [1, 0], [1, 1], [0, 1]];
		marks = [[[.08, 0], [.08, 1]], [[.92, 0], [.92, 1]]];
		textFrame = [[.08, 0], [.92, 0], [.92, 1], [.08, 1]];
	} else if (shape.corner) {
		const radius = Math.min(w, h) * shape.corner, rx = radius / w, ry = radius / h;
		outline = [[1 - rx, 0], ...arc(1 - rx, ry, rx, ry, -Math.PI / 2, 0, 12).slice(1),
			...arc(1 - rx, 1 - ry, rx, ry, 0, Math.PI / 2, 12), ...arc(rx, 1 - ry, rx, ry, Math.PI / 2, Math.PI, 12),
			...arc(rx, ry, rx, ry, Math.PI, Math.PI * 1.5, 12)];
	} else return null;
	return {outline: map(outline).filter((p, i, all) => !i || _rapierDrawDist(p, all[i - 1]) > 1e-8), marks: marks.map(map), textFrame: textFrame && map(textFrame)};
}

function _rapierDrawShapePolygon(shape, recipe) {
	const g = shape.geom;
	if (!g) return null;
	if (shape.recognized === 'text') return _rapierDrawTextLayout(shape, recipe).polygon;
	if (shape.recognized === 'circle') return _rapierDrawEllipsePolygon(g.cx, g.cy, g.r, g.r, 0, 48);
	if (shape.recognized === 'ellipse') return _rapierDrawEllipsePolygon(g.cx, g.cy, g.rx, g.ry, g.rot || 0, 64);
	if (RAPIER_DRAW_BOXES.has(shape.recognized)) { const contour = _rapierDrawBoxContours(shape); if (contour) return contour.outline; }
	if (shape.recognized === 'rect' || shape.recognized === 'paint' || shape.recognized === 'ornament') return g.p ? g.p.map(p => [p[0], p[1]]) : _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
	if (shape.recognized === 'triangle') return g.p.map(p => [p[0], p[1]]);
	const n = shape.recognized === 'star' ? (g.points || 5) * 2 : RAPIER_DRAW_POLYGONS[shape.recognized];
	if (n) {
		const local = Array.from({ length: n }, (_, i) => {
			const a = i * Math.PI * 2 / n - (shape.flat ? 0 : Math.PI / 2), r = shape.recognized === 'star' && i % 2 ? g.inner ?? .45 : 1;
			return [Math.cos(a) * r, Math.sin(a) * r];
		});
		const box = _rapierDrawBBox(local), frame = g.p || _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
		return local.map(([x, y]) => {
			const u = (x - box.minX) / box.w, v = (y - box.minY) / box.h;
			return [frame[0][0] + (frame[1][0] - frame[0][0]) * u + (frame[3][0] - frame[0][0]) * v,
				frame[0][1] + (frame[1][1] - frame[0][1]) * u + (frame[3][1] - frame[0][1]) * v];
		});
	}
	return null;
}

function _rapierDrawPointInPolygon(pt, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
		if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
	}
	return inside;
}

function _rapierDrawClipSegment(a, b, poly) {
	const dx = b[0] - a[0], dy = b[1] - a[1], cuts = [0, 1], runs = [];
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1];
		const den = dx * ey - dy * ex;
		if (Math.abs(den) < 1e-10) continue;
		const x = p[0] - a[0], y = p[1] - a[1], t = (x * ey - y * ex) / den, u = (x * dy - y * dx) / den;
		if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
	}
	cuts.sort((a, b) => a - b);
	for (let i = 1; i < cuts.length; i++) {
		const lo = cuts[i - 1], hi = cuts[i], mid = (lo + hi) / 2;
		if (hi - lo > 1e-9 && _rapierDrawPointInPolygon([a[0] + dx * mid, a[1] + dy * mid], poly)) runs.push([[a[0] + dx * lo, a[1] + dy * lo], [a[0] + dx * hi, a[1] + dy * hi]]);
	}
	return runs;
}

function _rapierDrawHatchPath(poly) {
	const frame = _rapierDrawObjectFrame(poly), local = poly.map(p => frame.toLocal(p[0], p[1]));
	const bbox = _rapierDrawBBox(local), diag = Math.hypot(bbox.w, bbox.h) || 1;
	const spacing = _rapierDrawClamp(diag / 9, 6, 26);
	const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
	const dir = Math.PI / 4, nx = Math.cos(dir), ny = Math.sin(dir), px = -ny, py = nx, half = diag * 0.75;
	let d = '';
	_rapierDrawWorkCount(Math.ceil(diag * 1.5 / spacing) + 1);
	for (let o = -half; o <= half; o += spacing) {
		const cxo = cx + px * o, cyo = cy + py * o;
		for (const seg of _rapierDrawClipSegment([cxo - nx * diag, cyo - ny * diag], [cxo + nx * diag, cyo + ny * diag], local)) {
			const a = frame.toWorld(seg[0][0], seg[0][1]), b = frame.toWorld(seg[1][0], seg[1][1]);
			d += 'M' + _rapierDrawFmt(a[0]) + ' ' + _rapierDrawFmt(a[1]) + 'L' + _rapierDrawFmt(b[0]) + ' ' + _rapierDrawFmt(b[1]) + ' ';
		}
	}
	return d;
}

function _rapierDrawSeed(s) {
	let h = 1779033703 ^ s.length;
	for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
	return h >>> 0;
}

function _rapierDrawMulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function _rapierDrawShapeSeedBase(shape) { return shape.seed != null ? String(shape.seed) : String(shape.id || 'g'); }

function _rapierDrawObjectFrame(poly) {
	let cx = 0, cy = 0;
	for (const p of poly) { cx += p[0]; cy += p[1]; }
	const n = poly.length || 1;
	cx /= n; cy /= n;
	const ax = poly.length > 1 ? poly[1][0] - poly[0][0] : 1, ay = poly.length > 1 ? poly[1][1] - poly[0][1] : 0;
	const len = Math.hypot(ax, ay) || 1, ex = ax / len, ey = ay / len;
	return {
		toLocal: (x, y) => { const dx = x - cx, dy = y - cy; return [dx * ex + dy * ey, -dx * ey + dy * ex]; },
		toWorld: (u, v) => [cx + u * ex - v * ey, cy + u * ey + v * ex],
	};
}

function _rapierDrawStippleDots(shape, poly) {
	const frame = _rapierDrawObjectFrame(poly), local = poly.map(p => frame.toLocal(p[0], p[1]));
	const bbox = _rapierDrawBBox(local), area = Math.max(1, bbox.w * bbox.h);
	const count = _rapierDrawClamp(Math.round(area / 46), 24, 260);
	const rand = _rapierDrawMulberry32(_rapierDrawSeed(_rapierDrawShapeSeedBase(shape)));
	const dots = [];
	let guard = 0;
	while (dots.length < count && guard < count * 40) {
		guard++;
		const u = bbox.minX + rand() * bbox.w, v = bbox.minY + rand() * bbox.h;
		if (_rapierDrawPointInPolygon([u, v], local)) dots.push(frame.toWorld(u, v));
	}
	return dots;
}

function _rapierDrawShapeStroke(shape, recipe) { return shape.stroke != null && recipe ? recipe.strokes[shape.stroke] : null; }

function _rapierDrawShapePaintsInk(shape, recipe) { return !!((shape.asDrawn || shape.recognized === 'ink') && _rapierDrawShapeStroke(shape, recipe)); }

function _rapierDrawEffectiveWidth(shape, thin) {
	if (shape.cutWidth) return shape.cutWidth;
	if (shape.stroke != null) return RAPIER_DRAW_INK_WIDTH;
	return thin ? 2 : RAPIER_DRAW_SHAPE_WIDTH;
}

function _rapierDrawEllipseEdgePoint(cx, cy, rx, ry, rot, px, py) {
	const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0), dx = px - cx, dy = py - cy;
	const x = dx * cs + dy * sn, y = -dx * sn + dy * cs, ax = Math.abs(x), ay = Math.abs(y);
	let lo = 0, hi = Math.PI / 2;

	for (let i = 0; i < 32; i++) {
		const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
		const da = (rx * Math.cos(a) - ax) ** 2 + (ry * Math.sin(a) - ay) ** 2;
		const db = (rx * Math.cos(b) - ax) ** 2 + (ry * Math.sin(b) - ay) ** 2;
		if (da < db) hi = b; else lo = a;
	}
	let angle = (lo + hi) / 2, dist = Infinity;
	for (const a of [0, angle, Math.PI / 2]) {
		const d = (rx * Math.cos(a) - ax) ** 2 + (ry * Math.sin(a) - ay) ** 2;
		if (d < dist) { dist = d; angle = a; }
	}
	const ex = rx * Math.cos(angle) * (x < 0 ? -1 : 1), ey = ry * Math.sin(angle) * (y < 0 ? -1 : 1);
	return [cx + ex * cs - ey * sn, cy + ex * sn + ey * cs];
}

function _rapierDrawClosestOnSeg(p, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
	let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
	t = _rapierDrawClamp(t, 0, 1);
	return [a[0] + dx * t, a[1] + dy * t];
}

function _rapierDrawNearestOnPolygon(pt, poly) {
	let best = null, bestD = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const c = _rapierDrawClosestOnSeg(pt, poly[i], poly[(i + 1) % poly.length]);
		const d = _rapierDrawDist(pt, c);
		if (d < bestD) { bestD = d; best = c; }
	}
	return { point: best, dist: bestD };
}

function _rapierDrawEdgeSnapPoint(px, py, shape, recipe) {
	const g = shape.geom;
	if (shape.recognized === 'circle') { const p = _rapierDrawEllipseEdgePoint(g.cx, g.cy, g.r, g.r, 0, px, py); return { point: p, dist: _rapierDrawDist([px, py], p) }; }
	if (shape.recognized === 'ellipse') { const p = _rapierDrawEllipseEdgePoint(g.cx, g.cy, g.rx, g.ry, g.rot || 0, px, py); return { point: p, dist: _rapierDrawDist([px, py], p) }; }
	if (RAPIER_DRAW_BOXES.has(shape.recognized) || shape.recognized === 'paint' || shape.recognized === 'ornament' || shape.recognized === 'triangle' || shape.recognized === 'text' || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized)) {
		const poly = _rapierDrawShapePolygon(shape, recipe);
		return poly ? _rapierDrawNearestOnPolygon([px, py], poly) : null;
	}
	return null;
}

function _rapierDrawAnchorFrame(shape, recipe) {
	const g = shape.geom;
	if (!g) return null;
	if (shape.recognized === 'text') {
		const p = _rapierDrawTextLayout(shape, recipe).polygon;
		return { x: p[0][0], y: p[0][1], ux: p[1][0] - p[0][0], uy: p[1][1] - p[0][1], vx: p[3][0] - p[0][0], vy: p[3][1] - p[0][1] };
	}
	if (shape.recognized === 'triangle' || g.p && (RAPIER_DRAW_BOXES.has(shape.recognized) || shape.recognized === 'paint' || shape.recognized === 'ornament' || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized))) {
		const p = g.p, q = p[shape.recognized === 'triangle' ? 2 : 3];
		return { x: p[0][0], y: p[0][1], ux: p[1][0] - p[0][0], uy: p[1][1] - p[0][1], vx: q[0] - p[0][0], vy: q[1] - p[0][1] };
	}
	if (!['circle', 'ellipse', 'paint', 'ornament'].includes(shape.recognized) && !RAPIER_DRAW_BOXES.has(shape.recognized) && !Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized)) return null;
	const rx = g.r ?? g.rx ?? g.w / 2, ry = g.r ?? g.ry ?? g.h / 2, c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0);
	return { x: g.cx - rx * c + ry * s, y: g.cy - rx * s - ry * c, ux: 2 * rx * c, uy: 2 * rx * s, vx: -2 * ry * s, vy: 2 * ry * c };
}

function _rapierDrawResolveBindAnchor(anchor, recipe) {
	const shape = anchor && recipe.shapes.find(s => s.id === anchor.to), f = shape && _rapierDrawAnchorFrame(shape, recipe);
	if (!f || _rapierDrawShapePaintsInk(shape, recipe)) return null;
	const x = f.x + f.ux * anchor.ax + f.vx * anchor.ay, y = f.y + f.uy * anchor.ax + f.vy * anchor.ay;
	return _rapierDrawEdgeSnapPoint(x, y, shape, recipe)?.point || null;
}

function _rapierDrawSetLineGeometry(shape, next, recipe) {
	if (!['x1', 'y1', 'x2', 'y2'].every(key => _rapierDrawSpatial(next[key]))) return false;
	const old = shape.geom;
	if (['x1', 'y1', 'x2', 'y2'].every(key => old[key] === next[key])) return true;
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	let points;
	if (stroke) {
		const dx = old.x2 - old.x1, dy = old.y2 - old.y1, length2 = dx * dx + dy * dy, nx = next.x2 - next.x1, ny = next.y2 - next.y1;
		points = stroke.pts.map((p, index) => {
			if (length2 <= .000001) {
				const t = index / Math.max(1, stroke.pts.length - 1);
				return [p[0] + next.x1 - old.x1 + t * (nx - dx), p[1] + next.y1 - old.y1 + t * (ny - dy)].concat(p.slice(2));
			}
			const x = p[0] - old.x1, y = p[1] - old.y1, t = (x * dx + y * dy) / length2, v = (y * dx - x * dy) / length2;
			return [next.x1 + t * nx - v * ny, next.y1 + t * ny + v * nx].concat(p.slice(2));
		});
		if (!points.every(p => _rapierDrawSpatial(p[0]) && _rapierDrawSpatial(p[1]))) return false;
	}
	Object.assign(old, next);
	if (points) stroke.pts = points;
	return true;
}

function _rapierDrawRerouteBoundArrows(recipe) {
	for (const shape of recipe.shapes) {
		if ((shape.recognized !== 'arrow' && shape.recognized !== 'line') || !shape.bind || !shape.geom) continue;
		const next = { ...shape.geom };
		for (const end of ['start', 'end']) {
			const anchor = shape.bind[end];
			if (!anchor) continue;
			const p = _rapierDrawResolveBindAnchor(anchor, recipe);
			if (!p) { delete shape.bind[end]; continue; }
			const x = end === 'start' ? 'x1' : 'x2', y = end === 'start' ? 'y1' : 'y2';
			next[x] = p[0]; next[y] = p[1];
		}
		if (!shape.bind.start && !shape.bind.end) delete shape.bind;
		if (!_rapierDrawSetLineGeometry(shape, next, recipe)) throw Object.assign(new RangeError('Drawing exceeds its coordinate range'), {code: 'drawing_geometry_limit'});
	}
}

function _rapierDrawArcEndpoints(g) {
	return [[g.cx + g.r * Math.cos(g.a0), g.cy + g.r * Math.sin(g.a0)], [g.cx + g.r * Math.cos(g.a1), g.cy + g.r * Math.sin(g.a1)]];
}

function _rapierDrawArcPolyline(g, n) {
	const pts = [];
	for (let i = 0; i <= n; i++) { const a = g.a0 + (g.a1 - g.a0) * (i / n); pts.push([g.cx + g.r * Math.cos(a), g.cy + g.r * Math.sin(a)]); }
	return pts;
}

function _rapierDrawArcPathD(g) {
	const [p0, p1] = _rapierDrawArcEndpoints(g);
	const d = g.a1 - g.a0, sweepFlag = d >= 0 ? 1 : 0, largeArc = Math.abs(d) > Math.PI ? 1 : 0;
	return 'M' + _rapierDrawFmt(p0[0]) + ' ' + _rapierDrawFmt(p0[1]) + 'A' + _rapierDrawFmt(g.r) + ' ' + _rapierDrawFmt(g.r) + ' 0 ' + largeArc + ' ' + sweepFlag + ' ' + _rapierDrawFmt(p1[0]) + ' ' + _rapierDrawFmt(p1[1]);
}

function _rapierDrawOutlineTag(shape) {
	const g = shape.geom;
	if (shape.recognized === 'circle') return '<circle cx="' + _rapierDrawFmt(g.cx) + '" cy="' + _rapierDrawFmt(g.cy) + '" r="' + _rapierDrawFmt(g.r) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	if (shape.recognized === 'ellipse') return '<ellipse cx="' + _rapierDrawFmt(g.cx) + '" cy="' + _rapierDrawFmt(g.cy) + '" rx="' + _rapierDrawFmt(g.rx) + '" ry="' + _rapierDrawFmt(g.ry) + '" ' +
		(g.rot ? 'transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')" ' : '') + 'fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	if (shape.recognized === 'rect' && !shape.corner && g.p) return '<polygon points="' + g.p.map(p => _rapierDrawFmt(p[0]) + ',' + _rapierDrawFmt(p[1])).join(' ') + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	if (shape.recognized === 'rect' && !shape.corner) return '<rect x="' + _rapierDrawFmt(g.cx - g.w / 2) + '" y="' + _rapierDrawFmt(g.cy - g.h / 2) + '" width="' + _rapierDrawFmt(g.w) + '" height="' + _rapierDrawFmt(g.h) + '" ' +
		(g.rot ? 'transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')" ' : '') + 'fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	const poly = _rapierDrawShapePolygon(shape);
	if (poly) return '<polygon points="' + poly.map(p => _rapierDrawFmt(p[0]) + ',' + _rapierDrawFmt(p[1])).join(' ') + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	return '';
}

function _rapierDrawBrushSphere(shape, recipe) {
	const g = shape.geom, isCircle = shape.recognized === 'circle';
	const cx = g.cx, cy = g.cy, rx = isCircle ? g.r : g.rx, ry = isCircle ? g.r : g.ry;
	const light = _rapierDrawLightAngle(recipe), away = light + Math.PI;
	let body = '<ellipse cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" rx="' + _rapierDrawFmt(rx) + '" ry="' + _rapierDrawFmt(ry) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';

	const rings = 10, d = 0.38, lx = Math.cos(light), ly = Math.sin(light);
	const ex = cx + lx * d * rx, ey = cy + ly * d * ry;
	for (let i = 1; i <= rings; i++) {
		const t = i / rings, rho = 0.24 + 1.08 * t;
		const k = (d * d + rho * rho - 1) / (2 * d * rho);
		if (k >= 1) continue;
		const inside = (k <= -1 ? Math.PI : Math.acos(k)) - 0.07;
		const half = Math.min(inside, 0.55 + 1.95 * t);
		if (half <= 0.08) continue;
		const w = 0.5 + 1.9 * t, a0 = away - half, a1 = away + half;
		const sx = ex + rho * rx * Math.cos(a0), sy = ey + rho * ry * Math.sin(a0), tx = ex + rho * rx * Math.cos(a1), ty = ey + rho * ry * Math.sin(a1);
		const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
		body += '<path d="M' + _rapierDrawFmt(sx) + ' ' + _rapierDrawFmt(sy) + 'A' + _rapierDrawFmt(rho * rx) + ' ' + _rapierDrawFmt(rho * ry) + ' 0 ' + largeArc + ' 1 ' + _rapierDrawFmt(tx) + ' ' + _rapierDrawFmt(ty) +
			'" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="' + _rapierDrawFmt(w) + '" stroke-linecap="round"/>';
	}
	const rand = _rapierDrawMulberry32(_rapierDrawSeed('sphere:' + _rapierDrawShapeSeedBase(shape)));
	for (let k = 0; k < 9; k++) {
		const a = away + (rand() - 0.5) * 2.6, f0 = 0.56 + rand() * 0.30, f1 = f0 + 0.09 + rand() * 0.05;
		const cA = Math.cos(a), sA = Math.sin(a);
		body += '<path d="M' + _rapierDrawFmt(cx + cA * f0 * rx) + ' ' + _rapierDrawFmt(cy + sA * f0 * ry) + 'L' + _rapierDrawFmt(cx + cA * f1 * rx) + ' ' + _rapierDrawFmt(cy + sA * f1 * ry) +
			'" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>';
	}
	return body;
}

function _rapierDrawBrushWheel(shape) {
	const g = shape.geom, cx = g.cx, cy = g.cy, r = g.r, hub = Math.max(2.5, r * 0.16), spokes = 7;
	let body = '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(r) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(r * 0.84) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.2"/>';
	body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(hub) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2"/>';
	const rot = g.rot || 0;
	for (let i = 0; i < spokes; i++) {
		const a = (i / spokes) * 2 * Math.PI + rot;
		body += '<path d="M' + _rapierDrawFmt(cx + Math.cos(a) * hub) + ' ' + _rapierDrawFmt(cy + Math.sin(a) * hub) + 'L' + _rapierDrawFmt(cx + Math.cos(a) * r * 0.84) + ' ' + _rapierDrawFmt(cy + Math.sin(a) * r * 0.84) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.6"/>';
	}
	return body;
}

function _rapierDrawBrushPulley(shape) {
	const g = shape.geom, cx = g.cx, cy = g.cy, r = g.r, hub = Math.max(2.5, r * 0.17), rimOut = r * 0.90, rimIn = r * 0.74;
	let body = '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(r) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(rimOut) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.5"/>';
	const bands = 5;
	for (let k = 1; k < bands; k++) {
		const rr = rimIn + (rimOut - rimIn) * (k / bands);
		body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(rr) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1"/>';
	}
	body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(rimIn) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.5"/>';
	body += '<circle cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" r="' + _rapierDrawFmt(hub) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2"/>';
	return body;
}

function _rapierDrawBrushWood(shape) {
	const poly = _rapierDrawShapePolygon(shape);
	if (!poly) return null;
	const frame = _rapierDrawObjectFrame(poly), local = poly.map(p => frame.toLocal(p[0], p[1]));
	const bbox = _rapierDrawBBox(local), rand = _rapierDrawMulberry32(_rapierDrawSeed('wood:' + _rapierDrawShapeSeedBase(shape)));
	let body = _rapierDrawOutlineTag(shape);
	const rows = _rapierDrawClamp(Math.round(bbox.h / 12), 3, 15), diag = Math.hypot(bbox.w, bbox.h) || 1;
	for (let i = 0; i < rows; i++) {
		const v = bbox.minY + (i + 0.5) * (bbox.h / rows) + (rand() - 0.5) * 3.5;
		const wob = (rand() - 0.5) * 0.1;
		for (const seg of _rapierDrawClipSegment([bbox.minX - diag, v - diag * wob], [bbox.maxX + diag, v + diag * wob], local)) {
			const a = frame.toWorld(seg[0][0], seg[0][1]), b = frame.toWorld(seg[1][0], seg[1][1]);
			body += '<path d="M' + _rapierDrawFmt(a[0]) + ' ' + _rapierDrawFmt(a[1]) + 'L' + _rapierDrawFmt(b[0]) + ' ' + _rapierDrawFmt(b[1]) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="' + _rapierDrawFmt(0.7 + rand() * 0.9) + '"/>';
		}
	}
	for (let k = 0; k < 2; k++) {
		let u = 0, v = 0, ok = false;
		for (let tries = 0; tries < 24 && !ok; tries++) { u = bbox.minX + rand() * bbox.w; v = bbox.minY + rand() * bbox.h; ok = _rapierDrawPointInPolygon([u, v], local); }
		if (!ok) continue;
		const [x, y] = frame.toWorld(u, v);
		for (const rr of [3.2, 5.6]) body += '<ellipse cx="' + _rapierDrawFmt(x) + '" cy="' + _rapierDrawFmt(y) + '" rx="' + _rapierDrawFmt(rr) + '" ry="' + _rapierDrawFmt(rr * 0.6) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="0.8"/>';
	}
	return body;
}

function _rapierDrawBrushLens(shape) {
	const g = shape.geom, cx = g.cx, cy = g.cy, rx = g.rx, ry = g.ry, bulge = rx * 1.15;
	const top = [cx, cy - ry], bot = [cx, cy + ry];
	const d = 'M' + _rapierDrawFmt(top[0]) + ' ' + _rapierDrawFmt(top[1]) +
		' Q' + _rapierDrawFmt(cx + bulge) + ' ' + _rapierDrawFmt(cy) + ' ' + _rapierDrawFmt(bot[0]) + ' ' + _rapierDrawFmt(bot[1]) +
		' Q' + _rapierDrawFmt(cx - bulge) + ' ' + _rapierDrawFmt(cy) + ' ' + _rapierDrawFmt(top[0]) + ' ' + _rapierDrawFmt(top[1]) + 'Z';
	let body = '<path d="' + d + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.6"/>';
	body += '<path d="M' + _rapierDrawFmt(cx) + ' ' + _rapierDrawFmt(top[1]) + 'L' + _rapierDrawFmt(cx) + ' ' + _rapierDrawFmt(bot[1]) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.6"/>';
	return body;
}

function _rapierDrawTwistPath(samples, amp, turnLen, strands) {
	let out = '';
	for (let s = 0; s < strands; s++) {
		const phase = strands > 1 ? (s / strands) * 2 * Math.PI : 0;
		let d = '';
		for (let i = 0; i < samples.length; i++) {
			const p = samples[i], off = turnLen > 0 ? Math.sin((p.s / turnLen) * 2 * Math.PI + phase) * amp : 0;
			const x = p.x + p.nx * off, y = p.y + p.ny * off;
			d += (i === 0 ? 'M' : 'L') + _rapierDrawFmt(x) + ' ' + _rapierDrawFmt(y) + ' ';
		}
		out += '<path d="' + d + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.5" stroke-linecap="round"/>';
	}
	return out;
}

function _rapierDrawLineSamples(x1, y1, x2, y2, step) {
	const len = _rapierDrawDist([x1, y1], [x2, y2]), ang = Math.atan2(y2 - y1, x2 - x1);
	const tx = Math.cos(ang), ty = Math.sin(ang), nx = -ty, ny = tx, n = _rapierDrawWorkCount(Math.max(2, Math.round(len / step)));
	const out = [];
	for (let i = 0; i <= n; i++) { const s = (i / n) * len; out.push({ x: x1 + tx * s, y: y1 + ty * s, nx, ny, s }); }
	return out;
}

function _rapierDrawBrushSpring(shape) {
	const g = shape.geom, len = _rapierDrawDist([g.x1, g.y1], [g.x2, g.y2]);
	const turns = _rapierDrawClamp(Math.round(len / 20), 3, 16), amp = _rapierDrawClamp(len / (turns * 2.6), 3.5, 13);
	const turnLen = len / turns;
	return _rapierDrawTwistPath(_rapierDrawLineSamples(g.x1, g.y1, g.x2, g.y2, 2.2), amp, turnLen, 1);
}

function _rapierDrawBrushRope(shape) {
	const g = shape.geom, len = _rapierDrawDist([g.x1, g.y1], [g.x2, g.y2]);
	const turnLen = _rapierDrawClamp(len / Math.max(4, Math.round(len / 13)), 8, 20);
	return _rapierDrawTwistPath(_rapierDrawLineSamples(g.x1, g.y1, g.x2, g.y2, 2), 3, turnLen, 2);
}

function _rapierDrawStrokeSamples(pts, step) {
	const total = _rapierDrawPerimeter(pts, false);
	const n = _rapierDrawWorkCount(Math.max(2, Math.round(total / step)));
	const rs = _rapierDrawResamplePolyline(pts, n);
	const out = [];
	for (let i = 0; i < rs.length; i++) {
		const a = rs[Math.max(0, i - 1)], b = rs[Math.min(rs.length - 1, i + 1)];
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		out.push({ x: rs[i][0], y: rs[i][1], nx: -Math.sin(ang), ny: Math.cos(ang), ang, s: (i / n) * total });
	}
	return out;
}

function _rapierDrawPenPathD(pts, smooth, last, size, ends) {
	return penPath(pts, {size, last: !!last, cutStart: !!ends?.cutStart, cutEnd: !!ends?.cutEnd});
}

function _rapierDrawBrushPenPath(shape, recipe) {
	let pts = _rapierDrawShapePaintsInk(shape, recipe) ? _rapierDrawShapeStroke(shape, recipe).pts : null;
	if (!pts) {
		const line = _rapierDrawShapePolyline({ ...shape, brush: 'ink' }, recipe);
		if (!line || line.length < 2) return null;
		pts = _rapierDrawResamplePolyline(line, Math.min(512, Math.max(24, Math.ceil(_rapierDrawPerimeter(line, false) / 3))));
	}
	const d = _rapierDrawPenPathD(pts, shape.smooth, true, _rapierDrawShapeNib(shape, recipe), shape.brush === 'brush' ? { cutStart: !!shape.cutStart, cutEnd: !!shape.cutEnd } : null);

	return d ? '<path d="' + d + '" fill="' + _rapierDrawShapeInk(shape) + '"/>' : null;
}

function _rapierDrawBrushSpringPath(shape, recipe) {
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (!stroke || stroke.pts.length < 2) return null;
	const len = _rapierDrawPerimeter(stroke.pts, false);
	const turns = _rapierDrawClamp(Math.round(len / 20), 3, 16), amp = _rapierDrawClamp(len / (turns * 2.6), 3.5, 13);
	return _rapierDrawTwistPath(_rapierDrawStrokeSamples(stroke.pts, 2.2), amp, len / turns, 1);
}

function _rapierDrawBrushRopePath(shape, recipe) {
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (!stroke || stroke.pts.length < 2) return null;
	const len = _rapierDrawPerimeter(stroke.pts, false);
	const turnLen = _rapierDrawClamp(len / Math.max(4, Math.round(len / 13)), 8, 20);
	return _rapierDrawTwistPath(_rapierDrawStrokeSamples(stroke.pts, 2), 3, turnLen, 2);
}

function _rapierDrawBrushTubePath(shape, recipe) {
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (!stroke || stroke.pts.length < 2) return null;
	const len = _rapierDrawPerimeter(stroke.pts, false), r = _rapierDrawClamp(len * 0.09, 5, 16);
	const samples = _rapierDrawStrokeSamples(stroke.pts, 3);
	if (samples.length < 2) return null;
	let d = '';
	for (const p of samples) d += (d ? 'L' : 'M') + _rapierDrawFmt(p.x + p.nx * r) + ' ' + _rapierDrawFmt(p.y + p.ny * r) + ' ';
	for (let i = samples.length - 1; i >= 0; i--) { const p = samples[i]; d += 'L' + _rapierDrawFmt(p.x - p.nx * r) + ' ' + _rapierDrawFmt(p.y - p.ny * r) + ' '; }
	let body = '<path d="' + d + 'Z" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2"/>';
	for (const p of [samples[0], samples[samples.length - 1]]) {
		body += '<ellipse cx="' + _rapierDrawFmt(p.x) + '" cy="' + _rapierDrawFmt(p.y) + '" rx="' + _rapierDrawFmt(r * 0.34) + '" ry="' + _rapierDrawFmt(r) +
			'" transform="rotate(' + _rapierDrawFmt(p.ang * 180 / Math.PI) + ' ' + _rapierDrawFmt(p.x) + ' ' + _rapierDrawFmt(p.y) + ')" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.3"/>';
	}
	return body;
}

function _rapierDrawBrushTube(shape) {
	const g = shape.geom, x1 = g.x1, y1 = g.y1, x2 = g.x2, y2 = g.y2;
	const len = _rapierDrawDist([x1, y1], [x2, y2]), ang = Math.atan2(y2 - y1, x2 - x1);
	const r = _rapierDrawClamp(len * 0.09, 5, 16), nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
	const corner = (t, s) => [x1 + tx * t * len + nx * s * r, y1 + ty * t * len + ny * s * r];
	const a = corner(0, -1), b = corner(1, -1), c = corner(1, 1), d = corner(0, 1);
	let body = '<path d="M' + a.map(_rapierDrawFmt).join(' ') + 'L' + b.map(_rapierDrawFmt).join(' ') + 'L' + c.map(_rapierDrawFmt).join(' ') + 'L' + d.map(_rapierDrawFmt).join(' ') + 'Z" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2"/>';
	for (const cap of [0, 1]) {
		const cx = x1 + tx * cap * len, cy = y1 + ty * cap * len;
		body += '<ellipse cx="' + _rapierDrawFmt(cx) + '" cy="' + _rapierDrawFmt(cy) + '" rx="' + _rapierDrawFmt(r * 0.34) + '" ry="' + _rapierDrawFmt(r) + '" transform="rotate(' + _rapierDrawFmt(ang * 180 / Math.PI) + ' ' + _rapierDrawFmt(cx) + ' ' + _rapierDrawFmt(cy) + ')" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.3"/>';
	}
	for (const s of [-0.42, 0.05, 0.5]) {
		const w = s === 0.05 ? 0.6 : 1.5, p1 = corner(0.06, s), p2 = corner(0.94, s);
		body += '<path d="M' + p1.map(_rapierDrawFmt).join(' ') + 'L' + p2.map(_rapierDrawFmt).join(' ') + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="' + w + '" opacity="0.75"/>';
	}
	return body;
}

function _rapierDrawRayLensBend(x1, y1, x2, y2, g) {
	const cx = g.cx, cy = g.cy, rx = Math.max(4, g.rx || g.r || 10), ry = Math.max(4, g.ry || g.r || 10);
	const ux1 = (x1 - cx) / rx, uy1 = (y1 - cy) / ry, ux2 = (x2 - cx) / rx, uy2 = (y2 - cy) / ry;
	const dx = ux2 - ux1, dy = uy2 - uy1, a = dx * dx + dy * dy;
	if (a < 1e-9) return null;
	const b = 2 * (ux1 * dx + uy1 * dy), c = ux1 * ux1 + uy1 * uy1 - 1, disc = b * b - 4 * a * c;
	if (disc <= 0) return null;
	const sq = Math.sqrt(disc);
	let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
	if (t1 < t0) { const tmp = t0; t0 = t1; t1 = tmp; }
	if (t1 <= 0.02 || t0 >= 0.98) return null;
	t0 = _rapierDrawClamp(t0, 0, 1); t1 = _rapierDrawClamp(t1, 0, 1);
	const P = t => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t], bend = 0.22;
	const entry = P(t0), exit = P(t1);
	const bentEntry = [entry[0], entry[1] + (cy - entry[1]) * bend], bentExit = [exit[0], exit[1] + (cy - exit[1]) * bend];
	return [[x1, y1], entry, bentEntry, bentExit, exit, [x2, y2]];
}

function _rapierDrawBrushRay(shape, recipe) {
	const g = shape.geom;
	const lens = recipe.shapes.find(s => s !== shape && s.brush === 'lens' && s.geom && (s.recognized === 'ellipse' || s.recognized === 'circle'));
	const bent = lens ? _rapierDrawRayLensBend(g.x1, g.y1, g.x2, g.y2, lens.geom) : null;
	const pts = bent || [[g.x1, g.y1], [g.x2, g.y2]];
	let d = '';
	for (let i = 0; i < pts.length; i++) d += (i === 0 ? 'M' : 'L') + _rapierDrawFmt(pts[i][0]) + ' ' + _rapierDrawFmt(pts[i][1]) + ' ';
	let body = '<path d="' + d + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.5" stroke-linecap="round"/>';
	const last = pts[pts.length - 1], prev = pts[pts.length - 2], ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
	for (const a of [ang + Math.PI - 0.4, ang + Math.PI + 0.4]) body += '<path d="M' + _rapierDrawFmt(last[0]) + ' ' + _rapierDrawFmt(last[1]) + 'L' + _rapierDrawFmt(last[0] + Math.cos(a) * 8) + ' ' + _rapierDrawFmt(last[1] + Math.sin(a) * 8) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4"/>';
	const total = _rapierDrawDist([g.x1, g.y1], [g.x2, g.y2]), ang0 = Math.atan2(g.y2 - g.y1, g.x2 - g.x1), nx = -Math.sin(ang0), ny = Math.cos(ang0);
	_rapierDrawWorkCount(Math.ceil(total / 14));
	for (let s = 8; s < total - 6; s += 14) {
		const px = g.x1 + Math.cos(ang0) * s, py = g.y1 + Math.sin(ang0) * s;
		body += '<path d="M' + _rapierDrawFmt(px - nx * 3.2) + ' ' + _rapierDrawFmt(py - ny * 3.2) + 'L' + _rapierDrawFmt(px + nx * 3.2) + ' ' + _rapierDrawFmt(py + ny * 3.2) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="0.9"/>';
	}
	return body;
}

function _rapierDrawBrushLight(shape) {
	const g = shape.geom, R = 6;
	let body = '<path d="M' + _rapierDrawFmt(g.x1) + ' ' + _rapierDrawFmt(g.y1) + 'L' + _rapierDrawFmt(g.x2) + ' ' + _rapierDrawFmt(g.y2) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>';
	body += '<circle cx="' + _rapierDrawFmt(g.x1) + '" cy="' + _rapierDrawFmt(g.y1) + '" r="' + _rapierDrawFmt(R * 0.55) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4"/>';
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * 2 * Math.PI;
		body += '<path d="M' + _rapierDrawFmt(g.x1 + Math.cos(a) * R * 0.85) + ' ' + _rapierDrawFmt(g.y1 + Math.sin(a) * R * 0.85) + 'L' + _rapierDrawFmt(g.x1 + Math.cos(a) * R * 1.5) + ' ' + _rapierDrawFmt(g.y1 + Math.sin(a) * R * 1.5) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.1"/>';
	}
	return body;
}

function _rapierDrawBrushRayPath(shape, recipe) {
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (!stroke || stroke.pts.length < 2) return null;
	const samples = _rapierDrawStrokeSamples(stroke.pts, 3);
	if (samples.length < 2) return null;
	const first = samples[0], last = samples[samples.length - 1];
	const lens = recipe.shapes.find(s => s !== shape && s.brush === 'lens' && s.geom && (s.recognized === 'ellipse' || s.recognized === 'circle'));
	const bent = lens ? _rapierDrawRayLensBend(first.x, first.y, last.x, last.y, lens.geom) : null;
	if (bent) return _rapierDrawBrushRay({ ...shape, recognized: 'line', geom: { x1: first.x, y1: first.y, x2: last.x, y2: last.y } }, recipe);
	let d = '';
	for (const p of samples) d += (d ? 'L' : 'M') + _rapierDrawFmt(p.x) + ' ' + _rapierDrawFmt(p.y) + ' ';
	let body = '<path d="' + d + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.5" stroke-linecap="round"/>';
	for (const a of [last.ang + Math.PI - 0.4, last.ang + Math.PI + 0.4]) body += '<path d="M' + _rapierDrawFmt(last.x) + ' ' + _rapierDrawFmt(last.y) + 'L' + _rapierDrawFmt(last.x + Math.cos(a) * 8) + ' ' + _rapierDrawFmt(last.y + Math.sin(a) * 8) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4"/>';
	let nextTick = 8;
	for (const p of samples) {
		if (p.s < nextTick) continue;
		if (p.s > last.s - 6) break;
		body += '<path d="M' + _rapierDrawFmt(p.x - p.nx * 3.2) + ' ' + _rapierDrawFmt(p.y - p.ny * 3.2) + 'L' + _rapierDrawFmt(p.x + p.nx * 3.2) + ' ' + _rapierDrawFmt(p.y + p.ny * 3.2) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="0.9"/>';
		nextTick += 14;
	}
	return body;
}

function _rapierDrawBrushLightPath(shape, recipe) {
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (!stroke || stroke.pts.length < 2) return null;
	const samples = _rapierDrawStrokeSamples(stroke.pts, 3);
	if (samples.length < 2) return null;
	const R = 6;
	let d = '';
	for (const p of samples) d += (d ? 'L' : 'M') + _rapierDrawFmt(p.x) + ' ' + _rapierDrawFmt(p.y) + ' ';
	let body = '<path d="' + d + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>';
	const src = samples[0];
	body += '<circle cx="' + _rapierDrawFmt(src.x) + '" cy="' + _rapierDrawFmt(src.y) + '" r="' + _rapierDrawFmt(R * 0.55) + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.4"/>';
	const spokes = 7, spread = Math.PI * 1.15, back = src.ang + Math.PI;
	for (let i = 0; i < spokes; i++) {
		const a = back + (i / (spokes - 1) - 0.5) * spread;
		body += '<path d="M' + _rapierDrawFmt(src.x + Math.cos(a) * R * 0.85) + ' ' + _rapierDrawFmt(src.y + Math.sin(a) * R * 0.85) + 'L' + _rapierDrawFmt(src.x + Math.cos(a) * R * 1.5) + ' ' + _rapierDrawFmt(src.y + Math.sin(a) * R * 1.5) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.1"/>';
	}
	return body;
}

function _rapierDrawBrushKnot(shape) {
	const poly = _rapierDrawShapePolygon(shape);
	if (!poly) return null;
	const perim = _rapierDrawPerimeter(poly, true);
	_rapierDrawWorkCount(Math.ceil(perim / 2.4) + poly.length);
	const samples = [];
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], segLen = _rapierDrawDist(a, b) || 1e-6;
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), tx = Math.cos(ang), ty = Math.sin(ang), nx = -ty, ny = tx;
		const steps = Math.max(1, Math.round(segLen / 2.4));
		for (let k = 0; k < steps; k++) { const t = k / steps; samples.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, nx, ny, s: (samples.length ? samples[samples.length - 1].s + segLen / steps : 0) }); }
	}
	samples.push({ ...samples[0], s: perim });
	const turnLen = _rapierDrawClamp(perim / Math.max(6, Math.round(perim / 15)), 9, 20);
	let body = _rapierDrawTwistPath(samples, 2.6, turnLen, 2);

	for (const frac of [0.24, 0.66]) {
		const at = samples.find(p => p.s >= frac * perim) || samples[0];
		body += '<path d="M' + _rapierDrawFmt(at.x - at.nx * 6) + ' ' + _rapierDrawFmt(at.y - at.ny * 6) + 'L' + _rapierDrawFmt(at.x + at.nx * 6) + ' ' + _rapierDrawFmt(at.y + at.ny * 6) + '" stroke="' + RAPIER_DRAW_INK + '" stroke-width="2.2" stroke-linecap="round"/>';
	}
	return body;
}

function _rapierDrawBrushMarkup(shape, recipe) {
	if (shape.recognized === 'ellipse' && shape.geom.rot && (shape.brush === 'sphere' || shape.brush === 'lens')) {
		const g = shape.geom;
		return '<g transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')">' +
			_rapierDrawBrushMarkup({ ...shape, geom: { ...g, rot: 0 } }, recipe) + '</g>';
	}
	if (shape.brush === 'sphere'  && (shape.recognized === 'circle' || shape.recognized === 'ellipse')) return _rapierDrawBrushSphere(shape, recipe);
	if (shape.brush === 'wheel' && shape.recognized === 'circle') return _rapierDrawBrushWheel(shape);
	if (shape.brush === 'pulley' && shape.recognized === 'circle') return _rapierDrawBrushPulley(shape);
	if (shape.brush === 'wood') return _rapierDrawBrushWood(shape);
	if (shape.brush === 'lens' && shape.recognized === 'ellipse') return _rapierDrawBrushLens(shape);
	if (shape.brush === 'knot') return _rapierDrawBrushKnot(shape);
	if (shape.brush === 'spring' && (shape.recognized === 'line' || shape.recognized === 'arrow')) return _rapierDrawBrushSpring(shape);
	if (shape.brush === 'rope' && (shape.recognized === 'line' || shape.recognized === 'arrow')) return _rapierDrawBrushRope(shape);
	if (shape.brush === 'tube' && (shape.recognized === 'line' || shape.recognized === 'arrow')) return _rapierDrawBrushTube(shape);
	if (shape.brush === 'ray' && (shape.recognized === 'line' || shape.recognized === 'arrow')) return _rapierDrawBrushRay(shape, recipe);
	if (shape.brush === 'light' && (shape.recognized === 'line' || shape.recognized === 'arrow')) return _rapierDrawBrushLight(shape);

	if (shape.brush === 'brush') return _rapierDrawBrushPenPath(shape, recipe);
	if (shape.brush === 'spring' && shape.recognized === 'ink') return _rapierDrawBrushSpringPath(shape, recipe);
	if (shape.brush === 'rope' && shape.recognized === 'ink') return _rapierDrawBrushRopePath(shape, recipe);
	if (shape.brush === 'tube' && shape.recognized === 'ink') return _rapierDrawBrushTubePath(shape, recipe);
	if (shape.brush === 'ray' && shape.recognized === 'ink') return _rapierDrawBrushRayPath(shape, recipe);
	if (shape.brush === 'light' && shape.recognized === 'ink') return _rapierDrawBrushLightPath(shape, recipe);
	if (shape.brush === 'sketch' || shape.brush === 'hatched') return _rapierDrawBrushSketch(shape, recipe);
	return null;
}

function _rapierDrawBrushSketch(shape, recipe) {
	const hatched = shape.brush === 'hatched';
	let pts = null, closed = false;
	if (_rapierDrawShapePaintsInk(shape, recipe)) {
		const stroke = _rapierDrawShapeStroke(shape, recipe);
		if (!stroke || stroke.pts.length < 2) return null;
		pts = stroke.pts.map(p => [p[0], p[1]]);
		closed = false;
	} else {
		const poly = _rapierDrawShapePolygon(shape, recipe);
		if (poly && poly.length >= 3) { pts = poly.map(p => [p[0], p[1]]); closed = true; }
		else {
			const line = _rapierDrawShapePolyline({ ...shape, brush: 'ink' }, recipe);
			if (!line || line.length < 2) return null;
			pts = line.map(p => [p[0], p[1]]);
			closed = false;
		}
	}
	_rapierDrawWorkCount(pts.length * (hatched && closed ? 8 : 4));
	const seed = (_rapierDrawSeed(_rapierDrawShapeSeedBase(shape)) || 1) >>> 0;
	const {outline, fill} = roughPaths(pts, {
		closed, seed, hachure: !!(hatched && closed), roughness: 1.15, bowing: 1,
		strokeWidth: 1.6, hachureGap: 6, hachureAngle: -41,
	});
	const ink = _rapierDrawShapeInk(shape);
	let body = '';
	if (fill) body += '<path d="' + fill + '" fill="none" stroke="' + ink + '" stroke-width="1.1"/>';
	if (outline) body += '<path d="' + outline + '" fill="none" stroke="' + ink + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
	return body || null;
}

function _rapierDrawArrowHeadGeom(from, tip, kind, scale, available) {
	if (kind === 'none') return null;
	const span = _rapierDrawDist(from, tip), length = Math.min(RAPIER_DRAW_ARROW_HEAD_LEN * Math.sqrt(scale), available, span * .8);
	if (length < .001) return null;
	const ux = (tip[0] - from[0]) / span, uy = (tip[1] - from[1]) / span, half = length * RAPIER_DRAW_ARROW_HEAD_W / (2 * RAPIER_DRAW_ARROW_HEAD_LEN);
	const at = (x, y) => [tip[0] - ux * x - uy * y, tip[1] - uy * x + ux * y];
	let poly, trim = length;
	if (kind === 'dot') {
		const r = length / 2;
		poly = Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return at(r + Math.cos(a) * r, Math.sin(a) * r); });
	} else if (kind === 'diamond') poly = [tip, at(length / 2, half), at(length, 0), at(length / 2, -half)];
	else if (kind === 'bar') { const w = Math.max(.7, Math.min(length / 4, 1.3 * scale)); poly = [at(-w, half), at(w, half), at(w, -half), at(-w, -half)]; trim = 0; }
	else { poly = [at(length, half), tip, at(length, -half)]; if (kind === 'arrow') trim = 0; }
	return { kind, poly, tip, base: at(trim, 0), length, trim, ...(kind === 'dot' ? { circle: { cx: at(length / 2, 0)[0], cy: at(length / 2, 0)[1], r: length / 2 } } : {}) };
}

const _RAPIER_DRAW_ARROW_GEOMETRY = new WeakMap();
function _rapierDrawArrowGeometry(shape, recipe, points) {
	const g = shape.geom, pts = points || (shape.recognized === 'arrow' || shape.route === 'auto' ? _rapierDrawArrowRoutePoints(shape, recipe) : [[g.x1, g.y1], [g.x2, g.y2]]);
	const key = shape.route === 'auto' && JSON.stringify([recipe?.nib, shape]);
	const kept = key && _RAPIER_DRAW_ARROW_GEOMETRY.get(pts);
	if (kept?.key === key) return kept.geometry;
	const geometry = _rapierDrawArrowGeometryOf(shape, recipe, pts);
	if (key) _RAPIER_DRAW_ARROW_GEOMETRY.set(pts, {key, geometry});
	return geometry;
}

function _rapierDrawArrowGeometryOf(shape, recipe, pts) {
	const segments = _rapierDrawRouteSegments(pts, shape.route === 'curved', shape.route === 'elbow' ? 6 : 0);
	const length = segments.reduce((sum, p) => sum + _rapierDrawSegmentLength(p), 0), scale = _rapierDrawNibScale(shape, recipe) * (shape.route === 'auto' ? _rapierDrawEffectiveWidth(shape, true) / 2 : 1);
	const start = shape.headStart || (shape.style === 'dimension' ? 'triangle' : 'none');
	const end = shape.headEnd || (shape.style === 'arrow' || shape.style === 'dimension' ? 'triangle' : 'none');
	const limit = length * ((start !== 'none' || shape.trimStart != null) && (end !== 'none' || shape.trimEnd != null) ? .35 : .6);
	const first = segments[0], last = segments.at(-1);
	const fromStart = _rapierDrawDist(first[0], first[1]) > .001 ? first[1] : first.at(-1);
	const fromEnd = _rapierDrawDist(last.at(-1), last.at(-2)) > .001 ? last.at(-2) : last[0];
	return { pts, segments, length, samples: _rapierDrawSegmentsPolyline(segments),
		headStart: _rapierDrawArrowHeadGeom(fromStart, pts[0], start, scale, limit), headEnd: _rapierDrawArrowHeadGeom(fromEnd, pts.at(-1), end, scale, limit) };
}

function _rapierDrawArrowParts(shape, recipe) {
	const geometry = _rapierDrawArrowGeometry(shape, recipe), { headStart, headEnd } = geometry;
	const shaft = _rapierDrawTrimSegments(geometry.segments, Math.max(headStart?.trim || 0, shape.trimStart || 0), Math.max(headEnd?.trim || 0, shape.trimEnd || 0));
	const label = shape.label ? _rapierDrawTextLayout(shape, recipe, geometry) : null;
	const runs = _rapierDrawCutSegments(shaft, label?.cutout).map(segments => ({ segments, d: _rapierDrawSegmentsPathD(segments), length: segments.reduce((sum, p) => sum + _rapierDrawSegmentLength(p), 0) }));
	return { ...geometry, shaft: _rapierDrawSegmentsPolyline(shaft), runs, contours: runs.map(run => _rapierDrawSegmentsPolyline(run.segments)), label };
}

function _rapierDrawArrowHeadMarkup(head, ink) {
	if (head.kind === 'arrow') return '<path d="' + _rapierDrawPolylinePathD(head.poly) + '" fill="none" stroke="' + ink + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
	if (head.circle) return '<circle cx="' + _rapierDrawFmt(head.circle.cx) + '" cy="' + _rapierDrawFmt(head.circle.cy) + '" r="' + _rapierDrawFmt(head.circle.r) + '" fill="' + ink + '" stroke="none"/>';
	return '<polygon points="' + head.poly.map(p => p.map(_rapierDrawFmt).join(',')).join(' ') + '" fill="' + ink + '" stroke="none"/>';
}

function _rapierDrawPolylinePathD(points, radius = 0) {
	if (!points.length) return '';
	let d = 'M' + points[0].slice(0, 2).map(_rapierDrawFmt).join(' ');
	for (let i = 1; i < points.length; i++) {
		const p = points[i], before = points[i - 1], after = points[i + 1];
		const r = after ? Math.min(radius, _rapierDrawDist(before, p) / 2, _rapierDrawDist(p, after) / 2) : 0;
		if (r > 0) {
			const u = r / _rapierDrawDist(before, p), v = r / _rapierDrawDist(p, after);
			d += 'L' + [p[0] + (before[0] - p[0]) * u, p[1] + (before[1] - p[1]) * u].map(_rapierDrawFmt).join(' ');
			d += 'Q' + p.slice(0, 2).map(_rapierDrawFmt).join(' ') + ' ' + [p[0] + (after[0] - p[0]) * v, p[1] + (after[1] - p[1]) * v].map(_rapierDrawFmt).join(' ');
		} else d += 'L' + p.slice(0, 2).map(_rapierDrawFmt).join(' ');
	}
	return d;
}

function _rapierDrawDashActive(shape) {
	if (shape.recognized === 'arc' || shape.recognized === 'parabola') return true;
	if (shape.recognized === 'line' || shape.recognized === 'arrow') return !shape.brush || shape.brush === 'ink';
	if (shape.recognized === 'ink') return !!shape.cut;
	if (shape.recognized === 'text' || shape.recognized === 'paint' || shape.recognized === 'ornament') return false;
	return (!shape.brush || shape.brush === 'ink') && shape.style !== 'solid';
}

function _rapierDrawBorderActive(shape) {
	return shape.style === 'solid' && !shape.asDrawn && (!shape.brush || shape.brush === 'ink') &&
		(['circle', 'ellipse', 'triangle'].includes(shape.recognized) || RAPIER_DRAW_BOXES.has(shape.recognized) || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized));
}

function _rapierDrawDashAttrs(length, width, kind, closed = false) {
	if (!kind || length < width * 2) return '';
	const dot = kind === 'dotted', nominal = width * (dot ? 2.8 : 5);
	const count = Math.max(1, Math.round(length / nominal)), mark = dot ? .01 : Math.min(width * 2.5, length / (count * 1.7));
	if (!closed && count === 1) return '';
	const gap = closed ? length / count - mark : count > 1 ? (length - count * mark) / (count - 1) : length;
	return ' stroke-dasharray="' + _rapierDrawFmt(mark) + ' ' + _rapierDrawFmt(gap) + '"' + (closed ? ' stroke-dashoffset="' + _rapierDrawFmt(mark / 2) + '"' : '');
}

function _rapierDrawDashedOutline(shape, recipe) {
	const g = shape.geom, width = 2.6 * _rapierDrawNibScale(shape, recipe), ink = _rapierDrawShapeInk(shape);
	const tag = (body, len, loop) => '<path d="' + body + '" fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"' + _rapierDrawDashAttrs(len, width, shape.dash, loop) + '/>';
	if (shape.recognized === 'circle' || shape.recognized === 'ellipse') {
		const rx = g.r ?? g.rx, ry = g.r ?? g.ry, h = ((rx - ry) / (rx + ry)) ** 2;
		const len = Math.PI * (rx + ry) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
		return '<ellipse cx="' + _rapierDrawFmt(g.cx) + '" cy="' + _rapierDrawFmt(g.cy) + '" rx="' + _rapierDrawFmt(rx) + '" ry="' + _rapierDrawFmt(ry) + '"' +
			(g.rot ? ' transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')"' : '') +
			' fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round" pathLength="' + _rapierDrawFmt(len) + '"' + _rapierDrawDashAttrs(len, width, shape.dash, true) + '/>';
	}
	const poly = _rapierDrawShapePolygon(shape);
	return poly ? poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return tag(_rapierDrawPolylinePathD([p, q]), _rapierDrawDist(p, q), true); }).join('') : '';
}

function _rapierDrawAngleArc(cx, cy, ang0, ang1, r) {
	let d = ang1 - ang0;
	while (d > Math.PI) d -= 2 * Math.PI;
	while (d < -Math.PI) d += 2 * Math.PI;
	const sweep = d >= 0 ? 1 : 0;
	const x0 = cx + r * Math.cos(ang0), y0 = cy + r * Math.sin(ang0);
	const x1 = cx + r * Math.cos(ang1), y1 = cy + r * Math.sin(ang1);
	const mid = ang0 + d / 2, lr = r + 11;
	return {
		path: 'M' + _rapierDrawFmt(x0) + ' ' + _rapierDrawFmt(y0) + 'A' + _rapierDrawFmt(r) + ' ' + _rapierDrawFmt(r) + ' 0 0 ' + sweep + ' ' + _rapierDrawFmt(x1) + ' ' + _rapierDrawFmt(y1),
		labelX: cx + lr * Math.cos(mid), labelY: cy + lr * Math.sin(mid), deg: Math.round(Math.abs(d) * 180 / Math.PI),
	};
}

function _rapierDrawAngleTag(cx, cy, ang0, ang1) {
	const a = _rapierDrawAngleArc(cx, cy, ang0, ang1, RAPIER_DRAW_ANGLE_R);
	return '<path d="' + a.path + '" fill="none" stroke="' + RAPIER_DRAW_INK + '" stroke-width="1.2"/>' +
		'<text x="' + _rapierDrawFmt(a.labelX) + '" y="' + _rapierDrawFmt(a.labelY) + '" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" text-anchor="middle" dominant-baseline="middle">' + a.deg + '°</text>';
}

function _rapierDrawAngleMarkup(shape) {
	const g = shape.geom;
	if (shape.recognized === 'triangle') {
		let out = '';
		for (let i = 0; i < 3; i++) {
			const prev = g.p[(i + 2) % 3], cur = g.p[i], next = g.p[(i + 1) % 3];
			out += _rapierDrawAngleTag(cur[0], cur[1], Math.atan2(prev[1] - cur[1], prev[0] - cur[0]), Math.atan2(next[1] - cur[1], next[0] - cur[0]));
		}
		return out;
	}
	return _rapierDrawAngleTag(g.x1, g.y1, 0, Math.atan2(g.y2 - g.y1, g.x2 - g.x1));
}

function _rapierDrawStylesFor(kind) {
	if (kind === 'line' || kind === 'arrow') return ['plain', 'arrow', 'dimension'];
	if (kind === 'arc' || kind === 'parabola' || kind === 'ink' || kind === 'text' || kind === 'paint' || kind === 'ornament') return [];
	return ['outline', 'hatch', 'stipple', 'solid'];
}
function _rapierDrawDefaultStyle(kind) {
	if (kind === 'line') return 'plain';
	if (kind === 'arrow') return 'arrow';
	if (kind === 'circle' || kind === 'ellipse' || RAPIER_DRAW_BOXES.has(kind) || kind === 'triangle' || Object.hasOwn(RAPIER_DRAW_POLYGONS, kind)) return 'outline';
	return null;
}

const RAPIER_DRAW_CORNER_COS = Math.cos(65 * Math.PI / 180);

function _rapierDrawSmoothLevel(level) {
	const n = Math.round(Number(level));
	return Number.isFinite(n) ? _rapierDrawClamp(n, 0, 100) : RAPIER_DRAW_SMOOTH_DEFAULT;
}

function _rapierDrawSmoothPlan(level) {
	const n = _rapierDrawSmoothLevel(level);
	if (n === 0) return { settle: 0, streamline: 0, rdp: 0, curve: false, fit: null };
	const t = n / 100;
	return { settle: n <= 12 ? 1 : n <= 35 ? 2 : 3, streamline: 0.18 + t * 0.62, rdp: 1 + t * 7, curve: true, fit: 1.2 + t * 16.8 };
}

function _rapierDrawStreamlineStroke(pts, amount) {
	if (!pts || pts.length < 3 || !(amount > 0)) return _rapierDrawDedupeStroke(pts);
	let out;
	try { out = getStrokePoints(pts.map(p => [p[0], p[1]]), { streamline: _rapierDrawClamp(amount, 0, 0.92), size: 8, last: true }); }
	catch (_) { return _rapierDrawDedupeStroke(pts); }
	if (!out || out.length < 3) return _rapierDrawDedupeStroke(pts);
	return out.map(sp => [sp.point[0], sp.point[1], 0]);
}

function _rapierDrawDedupeStroke(pts) {
	if (!pts || pts.length < 2) return pts ? pts.slice() : [];
	const out = [pts[0]];
	for (let i = 1; i < pts.length; i++) if (_rapierDrawDist(out[out.length - 1], pts[i]) > 0.05) out.push(pts[i]);
	return out;
}

function _rapierDrawStrokeFrame(pts) {
  const chord = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]];
  const chordLen = Math.hypot(chord[0], chord[1]);
  let extent = 0;
  for (const p of pts) extent = Math.max(extent, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]));
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  sxx /= n; sxy /= n; syy /= n;

  const t = (sxx + syy) / 2, d = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const l1 = t + d;
  let ex = sxy, ey = l1 - sxx;
  if (Math.hypot(ex, ey) < 1e-9) { ex = 1; ey = 0; }
  const L = Math.hypot(ex, ey); ex /= L; ey /= L;
  if (chordLen > extent * 0.35) { ex = chord[0] / chordLen; ey = chord[1] / chordLen; }
  return { mx, my, ex, ey, l1, l2: t - d };
}

const _rapierDrawToFrame = (p, f) => [ (p[0]-f.mx)*f.ex + (p[1]-f.my)*f.ey, -(p[0]-f.mx)*f.ey + (p[1]-f.my)*f.ex ];

const _rapierDrawFromFrame = (u, v, f) => [ f.mx + u*f.ex - v*f.ey, f.my + u*f.ey + v*f.ex ];

function _rapierDrawSolveLinear(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function _rapierDrawLeastSquares(us, vs, basis, terms) {
  const A = Array.from({length: terms}, () => new Array(terms).fill(0)), b = new Array(terms).fill(0);
  for (let i = 0; i < us.length; i++) {
    const f = basis(us[i]);
    for (let r = 0; r < terms; r++) { b[r] += f[r] * vs[i]; for (let c = 0; c < terms; c++) A[r][c] += f[r] * f[c]; }
  }
  const coef = _rapierDrawSolveLinear(A, b);
  if (!coef) return null;
  let ss = 0;
  for (let i = 0; i < us.length; i++) { const f = basis(us[i]); let y = 0; for (let k = 0; k < terms; k++) y += coef[k] * f[k]; ss += (y - vs[i]) ** 2; }
  return { coef, residual: Math.sqrt(ss / us.length) };
}

function _rapierDrawFitPolynomial(pts, degree) {
  const f = _rapierDrawStrokeFrame(pts);
  const us = [], vs = [];
  for (const p of pts) { const [u, v] = _rapierDrawToFrame(p, f); us.push(u); vs.push(v); }
  const terms = degree + 1;
  const basis = u => { const out = [1]; for (let k = 1; k <= degree; k++) out.push(out[k - 1] * u); return out; };
  const fit = _rapierDrawLeastSquares(us, vs, basis, terms);
  if (!fit) return null;
  const u0 = Math.min(...us), u1 = Math.max(...us), v = u => basis(u).reduce((sum, b, k) => sum + fit.coef[k] * b, 0);
  const slope = u => { let s = 0; for (let k = 1; k < terms; k++) s += k * fit.coef[k] * u ** (k - 1); return s; }, w = (u1 - u0) / 3;
  return { kind: 'poly' + degree, residual: fit.residual, frame: f,
    bezier: () => [[u0, v(u0)], [u0 + w, v(u0) + w * slope(u0)], [u1 - w, v(u1) - w * slope(u1)], [u1, v(u1)]].map(([u, y]) => _rapierDrawFromFrame(u, y, f)),
    sample(n) { const out = []; for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; const bs = basis(u);
      let v = 0; for (let k = 0; k < terms; k++) v += fit.coef[k] * bs[k]; out.push(_rapierDrawFromFrame(u, v, f)); } return out; } };
}

function _rapierDrawFitWave(pts) {
  const f = _rapierDrawStrokeFrame(pts);
  const us = [], vs = [];
  for (const p of pts) { const [u, v] = _rapierDrawToFrame(p, f); us.push(u); vs.push(v); }
  const span = Math.max(...us) - Math.min(...us);
  if (!(span > 0)) return null;
  let best = null;
  const n = us.length, sin = new Float64Array(n), cos = new Float64Array(n);
  for (let cycles = 0.5; cycles <= 6.01; cycles += 0.05) {
    const w = 2 * Math.PI * cycles / span;
    let a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const sn = sin[i] = Math.sin(w * us[i]), cs = cos[i] = Math.cos(w * us[i]), v = vs[i];
      b0 += v; b1 += sn * v; b2 += cs * v;
      a01 += sn; a02 += cs; a11 += sn * sn; a12 += sn * cs; a22 += cs * cs;
    }
    const coef = _rapierDrawSolveLinear([[n, a01, a02], [a01, a11, a12], [a02, a12, a22]], [b0, b1, b2]);
    if (!coef) continue;
    let ss = 0;
    for (let i = 0; i < n; i++) ss += (coef[0] + coef[1] * sin[i] + coef[2] * cos[i] - vs[i]) ** 2;
    const residual = Math.sqrt(ss / n);
    if (!best || residual < best.fit.residual) best = { w, fit: { coef, residual } };
  }
  if (!best) return null;
  best.basis = u => [1, Math.sin(best.w * u), Math.cos(best.w * u)];
  const u0 = Math.min(...us), u1 = Math.max(...us);
  return { kind: 'wave', residual: best.fit.residual, frame: f,
    sample(n) { const out = []; for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; const bs = best.basis(u);
      let v = 0; for (let k = 0; k < 3; k++) v += best.fit.coef[k] * bs[k]; out.push(_rapierDrawFromFrame(u, v, f)); } return out; } };
}

function _rapierDrawIdealise(pts, tolerance) {
  const line = _rapierDrawFitPolynomial(pts, 1);
  const candidates = [line, _rapierDrawFitPolynomial(pts, 2), _rapierDrawFitPolynomial(pts, 3), line?.residual <= 0.35 ? null : _rapierDrawFitWave(pts)].filter(Boolean);
  if (!candidates.length) return null;
  const best = Math.min(...candidates.map(c => c.residual));
  const competitive = Math.max(best * 1.35, 0.35);
  const winner = candidates.find(c => c.residual <= competitive) || candidates.reduce((a, b) => a.residual <= b.residual ? a : b);
  return winner.residual <= tolerance ? winner : null;
}

function _rapierDrawFitStroke(pts, plan) {
	if (plan.fit == null || !pts || _rapierDrawIsClosedStroke(pts)) return null;
	const deduped = _rapierDrawDedupeStroke(pts);
	const fitInput = deduped.length > 320 ? _rapierDrawResamplePolyline(deduped, 320) : deduped;
	if (fitInput.length <= 5 || _rapierDrawHasCorner(fitInput)) return null;
	return _rapierDrawIdealise(fitInput, plan.fit);
}

function _rapierDrawHasCorner(pts, w = 5) {
	for (let i = w; i < pts.length - w; i++) {
		const ax = pts[i][0] - pts[i - w][0], ay = pts[i][1] - pts[i - w][1];
		const bx = pts[i + w][0] - pts[i][0], by = pts[i + w][1] - pts[i][1];
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la > 4 && lb > 4 && (ax * bx + ay * by) / (la * lb) < RAPIER_DRAW_CORNER_COS) return true;
	}
	return false;
}

function _rapierDrawRelaxStroke(pts, passes = 2) {
	if (!pts || pts.length < 3 || passes < 1) return pts;

	const w = 5, pinned = new Set();
	for (let i = w; i < pts.length - w; i++) {
		const ax = pts[i][0] - pts[i - w][0], ay = pts[i][1] - pts[i - w][1];
		const bx = pts[i + w][0] - pts[i][0], by = pts[i + w][1] - pts[i][1];
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		if (la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) < RAPIER_DRAW_CORNER_COS) {
			pinned.add(i - 1); pinned.add(i); pinned.add(i + 1);
		}
	}
	let cur = pts;
	for (let pass = 0; pass < passes; pass++) {
		const next = [cur[0]];
		for (let i = 1; i < cur.length - 1; i++) {
			if (pinned.has(i)) { next.push(cur[i]); continue; }
			next.push([(cur[i - 1][0] + 2 * cur[i][0] + cur[i + 1][0]) / 4,
				(cur[i - 1][1] + 2 * cur[i][1] + cur[i + 1][1]) / 4, cur[i][2]]);
		}
		next.push(cur[cur.length - 1]);
		cur = next;
	}
	return cur;
}

function _rapierDrawTangents(pts, closed) {
	const n = pts.length, at = i => pts[(i + n) % n], m = [];
	for (let i = 0; i < n; i++) {
		const prev = closed ? at(i - 1) : pts[Math.max(0, i - 1)];
		const next = closed ? at(i + 1) : pts[Math.min(n - 1, i + 1)];
		let corner = false;
		if (i > 0 && i < n - 1 || closed) {
			const ax = pts[i][0] - prev[0], ay = pts[i][1] - prev[1];
			const bx = next[0] - pts[i][0], by = next[1] - pts[i][1];
			const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
			if (la > 0 && lb > 0) corner = (ax * bx + ay * by) / (la * lb) < RAPIER_DRAW_CORNER_COS;
		}
		const mx = (next[0] - prev[0]) / 6, my = (next[1] - prev[1]) / 6, lm = Math.hypot(mx, my);
		const cap = Math.min(Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]), Math.hypot(next[0] - pts[i][0], next[1] - pts[i][1])) / 2;
		m.push(corner ? [0, 0] : lm > cap && cap > 0 ? [mx * cap / lm, my * cap / lm] : [mx, my]);
	}
	return m;
}

function _rapierDrawCurveTo(a, b, ma, mb) {
	return 'C' + _rapierDrawFmt(a[0] + ma[0]) + ' ' + _rapierDrawFmt(a[1] + ma[1]) + ' ' +
		_rapierDrawFmt(b[0] - mb[0]) + ' ' + _rapierDrawFmt(b[1] - mb[1]) + ' ' +
		_rapierDrawFmt(b[0]) + ' ' + _rapierDrawFmt(b[1]) + ' ';
}

function _rapierDrawSmoothPathD(pts, closed, curve = true) {
	if (!pts || !pts.length) return '';
	if (pts.length === 1) return 'M' + _rapierDrawFmt(pts[0][0]) + ' ' + _rapierDrawFmt(pts[0][1]) + ' L' + _rapierDrawFmt(pts[0][0]) + ' ' + _rapierDrawFmt(pts[0][1]) + ' ';
	let d = 'M' + _rapierDrawFmt(pts[0][0]) + ' ' + _rapierDrawFmt(pts[0][1]) + ' ';
	if (!curve) { for (let i = 1; i < pts.length; i++) d += 'L' + _rapierDrawFmt(pts[i][0]) + ' ' + _rapierDrawFmt(pts[i][1]) + ' '; return d; }
	const m = _rapierDrawTangents(pts, closed);
	for (let i = 1; i < pts.length; i++) d += _rapierDrawCurveTo(pts[i - 1], pts[i], m[i - 1], m[i]);
	return d;
}

function _rapierDrawEscapeXML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _rapierDrawEscapeAttr(s) { return _rapierDrawEscapeXML(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

const _RAPIER_DRAW_ID = /^[A-Za-z0-9_-]{1,64}$/;

function _rapierDrawShapeBBoxIn(shape, recipe) {
	if (shape.recognized === 'text') return _rapierDrawTextLayout(shape, recipe).bounds;
	if (!_rapierDrawShapePaintsInk(shape, recipe) && shape.geom) {
		const g = shape.geom, kind = shape.recognized;
		if (kind === 'circle' || kind === 'ellipse') {
			const rx = g.r ?? g.rx, ry = g.r ?? g.ry, c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0);
			const x = Math.hypot(rx * c, ry * s), y = Math.hypot(rx * s, ry * c);
			return { minX: g.cx - x, maxX: g.cx + x, minY: g.cy - y, maxY: g.cy + y, w: x * 2, h: y * 2 };
		}
		if (kind === 'parabola') return _rapierDrawRouteBBoxFromPoints(g.p, true);
		const poly = _rapierDrawShapePolygon(shape, recipe);
		if (poly) return _rapierDrawBBox(poly);
		if (kind === 'line' || kind === 'arrow') return _rapierDrawRouteBBoxFromPoints(_rapierDrawArrowRoutePoints(shape, recipe), shape.route === 'curved');
		if (kind === 'arc') {
			const pts = _rapierDrawArcEndpoints(g), lo = Math.min(g.a0, g.a1), hi = Math.max(g.a0, g.a1);
			for (let k = Math.ceil(lo / (Math.PI / 2)); k <= Math.floor(hi / (Math.PI / 2)); k++) pts.push([g.cx + g.r * Math.cos(k * Math.PI / 2), g.cy + g.r * Math.sin(k * Math.PI / 2)]);
			return _rapierDrawBBox(pts);
		}
	}
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	return stroke ? _rapierDrawBBox(_rapierDrawShapePolyline(shape, recipe) || stroke.pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
}

const _RAPIER_DRAW_AUTO_ROUTES = new WeakMap();
const _RAPIER_DRAW_ROUTE_SPENT = {work: 0};
const _RAPIER_DRAW_ROUTE_SCENES = [];

function _rapierDrawPortNormal(target, point, recipe) {
	const g = target.geom;
	if (target.recognized === 'ellipse' || target.recognized === 'circle') {
		const c = Math.cos(g.rot || 0), s = Math.sin(g.rot || 0), x = point[0] - g.cx, y = point[1] - g.cy;
		const u = (x * c + y * s) / (g.r ?? g.rx) ** 2, v = (y * c - x * s) / (g.r ?? g.ry) ** 2, n = Math.hypot(u, v);
		return n ? [(u * c - v * s) / n, (u * s + v * c) / n] : [1, 0];
	}
	const poly = _rapierDrawShapePolygon(target, recipe), normals = [];
	if (!poly?.length) return [1, 0];
	const sign = Math.sign(poly.reduce((n, p, i) => { const q = poly[(i + 1) % poly.length]; return n + p[0] * q[1] - q[0] * p[1]; }, 0));
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], length = _rapierDrawDist(a, b);
		if (length && _rapierDrawDist(point, _rapierDrawClosestOnSeg(point, a, b)) < .01) normals.push([sign * (b[1] - a[1]) / length, sign * (a[0] - b[0]) / length]);
	}
	const x = normals.reduce((n, p) => n + p[0], 0), y = normals.reduce((n, p) => n + p[1], 0), length = Math.hypot(x, y);
	return length ? [Math.abs(x / length) < 1e-8 ? 0 : x / length, Math.abs(y / length) < 1e-8 ? 0 : y / length] : [1, 0];
}

function _rapierDrawRouteRelated(a, b) {
	return ['start', 'end'].some(x => ['start', 'end'].some(y => a.bind?.[x]?.to && a.bind[x].to === b.bind?.[y]?.to));
}

function _rapierDrawRouteCost(a, b, occupied, room = [0, 0], crossings = true, apart = null) {
	let cost = 0;
	const ux = b[0] - a[0], uy = b[1] - a[1], length = Math.hypot(ux, uy);
	if (!length) return cost;
	for (const points of occupied) for (let i = 1; i < points.length; i++) {
		const c = points[i - 1], d = points[i], vx = d[0] - c[0], vy = d[1] - c[1], den = ux * vy - uy * vx, x = c[0] - a[0], y = c[1] - a[1];
		if (Math.abs(den) > 1e-7) {
			const t = (x * vy - y * vx) / den, u = (x * uy - y * ux) / den;
			if (crossings && t > 1e-7 && t <= 1 + 1e-7 && u > 1e-7 && u <= 1 + 1e-7) cost += 1e9;
		} else {
			const t = (x * ux + y * uy) / length, u = ((d[0] - a[0]) * ux + (d[1] - a[1]) * uy) / length;
			const overlap = Math.max(0, Math.min(length, Math.max(t, u)) - Math.max(0, Math.min(t, u))), distance = Math.abs(x * uy - y * ux) / length;
			cost += overlap * (distance < 1e-7 ? apart?.has(points) ? 1e9 : 1e4 : Math.max(0, (Math.abs(ux) > Math.abs(uy) ? room[1] : room[0]) - distance) * 10);
		}
	}
	return cost;
}

function _rapierDrawObstacleBox(target, recipe) {
	const b = _rapierDrawShapeBBoxIn(target, recipe), rule = target.recognized === 'text' && target.group && recipe.shapes.find(s => s.recognized === 'line' && s.group === target.group && !s.bind && s.geom?.y1 === s.geom.y2 && b.minY >= s.geom.y1 && b.minY - s.geom.y1 <= 16);
	return rule ? _rapierDrawBBox([[b.minX, b.minY], [b.maxX, b.maxY], [rule.geom.x1, rule.geom.y1], [rule.geom.x2, rule.geom.y2]]) : b;
}

function _rapierDrawRouteRoom(shape) {
	if (!shape.label) return [16, 16];
	const b = layoutText({...shape, recognized: 'text', geom: {cx: 0, cy: 0, w: shape.labelWidth || 160}}).bounds;
	return [b.w / 2 + 16, b.h / 2 + 16];
}

function _rapierDrawRouteCrossings(points, others) {
	let count = 0;
	const rays = (path, point, owner) => {
		const out = [];
		for (let i = 1; i < path.length; i++) if (_rapierDrawDist(point, _rapierDrawClosestOnSeg(point, path[i - 1], path[i])) < 1e-6) for (const end of [path[i - 1], path[i]]) {
			if (_rapierDrawDist(point, end) < 1e-6) continue;
			const angle = Math.atan2(end[1] - point[1], end[0] - point[0]);
			if (!out.some(r => Math.abs(r.angle - angle) < 1e-7)) out.push({angle, owner});
		}
		return out;
	};
	for (const other of others) {
		const seen = new Set();
		for (let i = 1; i < points.length; i++) for (let j = 1; j < other.length; j++) {
			const a = points[i - 1], b = points[i], c = other[j - 1], d = other[j], ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - c[0], vy = d[1] - c[1], den = ux * vy - uy * vx;
			if (Math.abs(den) < 1e-7) continue;
			const x = c[0] - a[0], y = c[1] - a[1], t = (x * vy - y * vx) / den, u = (x * uy - y * ux) / den;
			if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) continue;
			const point = [a[0] + t * ux, a[1] + t * uy], key = point.map(v => v.toFixed(6)).join(':');
			if (seen.has(key)) continue; seen.add(key);
			const directions = rays(points, point, 0).concat(rays(other, point, 1)).sort((a, b) => a.angle - b.angle);
			if (directions.length === 4 && directions.every((r, i) => r.owner !== directions[(i + 1) % 4].owner && Math.abs(r.angle - directions[(i + 1) % 4].angle) > 1e-7)) count++;
		}
	}
	return count;
}

function _rapierDrawRouteOverlap(points, others) {
	let total = 0;
	for (const other of others) for (let i = 1; i < points.length; i++) for (let j = 1; j < other.length; j++) {
		const a = points[i - 1], b = points[i], c = other[j - 1], d = other[j], dx = b[0] - a[0], dy = b[1] - a[1];
		if (Math.abs(dx * (d[1] - c[1]) - dy * (d[0] - c[0])) > 1e-7 || Math.abs(dx * (c[1] - a[1]) - dy * (c[0] - a[0])) > 1e-7) continue;
		const axis = Math.abs(dx) > Math.abs(dy) ? 0 : 1, low = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])), high = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
		if (high > low + 1e-7) total += (high - low) * Math.hypot(dx, dy) / Math.abs(b[axis] - a[axis]);
	}
	return total;
}

function* _rapierDrawRouteDetours(shape, recipe, points, extent, consider) {
	const targets = (recipe.shapes || []).filter(s => s !== shape && !_rapierDrawShapePaintsInk(s, recipe) && _rapierDrawAnchorFrame(s, recipe));
	const boxes = targets.map(s => _rapierDrawObstacleBox(s, recipe)), tracks = [0, 1].map(axis => {
		const low = axis ? 'minY' : 'minX', high = axis ? 'maxY' : 'maxX';
		return [...new Set([extent, ...boxes].flatMap(b => [b[low] - 32, b[low] - 64, b[high] + 32, b[high] + 64]))].filter(_rapierDrawSpatial);
	});
	const first = points[0], last = points.at(-1), reach = Math.max(32, RAPIER_DRAW_ARROW_HEAD_LEN * Math.sqrt(_rapierDrawNibScale(shape, recipe) * _rapierDrawEffectiveWidth(shape, true) / 2) + 16);
	const stub = (a, b, extend) => { const length = _rapierDrawDist(a, b), part = (extend ? Math.max(reach, Math.min(64, length)) : Math.min(reach, length)) / (length || 1); return a.map((v, i) => v + (b[i] - v) * part); };
	const candidates = [];
	for (const extend of [false, true]) {
		const start = stub(first, points[1], extend), end = stub(last, points.at(-2), extend);
		candidates.push(...tracks[0].map(x => [first, start, [x, start[1]], [x, end[1]], end, last]),
			...tracks[1].map(y => [first, start, [start[0], y], [end[0], y], end, last]));
	}
	for (let i = 1; i + 2 < points.length; i++) {
		const a = points[i], b = points[i + 1], axis = Math.abs(a[0] - b[0]) < 1e-7 ? 0 : Math.abs(a[1] - b[1]) < 1e-7 ? 1 : -1;
		if (axis < 0) continue;
		for (const offset of [-64, -32, -16, 16, 32, 64]) {
			const c = a.slice(), d = b.slice(); c[axis] += offset; d[axis] += offset;
			if ([...c, ...d].every(_rapierDrawSpatial)) candidates.push([...points.slice(0, i + 1), c, d, ...points.slice(i + 1)]);
		}
	}
	const obstacles = targets.map((target, i) => {
		const b = boxes[i], member = target.recognized === 'rect' && target.group && ['start', 'end'].some(end => {
			const node = recipe.shapes.find(s => s.id === shape.bind?.[end]?.to);
			if (!node || node === target || node.group !== target.group) return false;
			const box = _rapierDrawShapeBBoxIn(node, recipe); return box.minX > b.minX && box.maxX < b.maxX && box.minY > b.minY && box.maxY < b.maxY;
		});
		if (member) {
			const titles = recipe.shapes.filter(s => s.group === target.group && s.recognized === 'text').map(s => _rapierDrawShapeBBoxIn(s, recipe)).filter(t => t.minY >= b.minY && t.maxY <= b.maxY);
			if (!titles.length) return null;
			const bottom = Math.min(...titles.map(t => t.maxY)) + 8;
			return {poly: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, bottom], [b.minX, bottom]], gap: 0};
		}
		return {poly: target.recognized === 'text' ? [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]] : _rapierDrawShapePolygon(target, recipe), gap: ['start', 'end'].some(end => shape.bind?.[end]?.to === target.id) ? 0 : 8 + _rapierDrawStrokeHalf(shape, recipe) + _rapierDrawStrokeHalf(target, recipe)};
	}).filter(o => o?.poly);
	for (const candidate of candidates) {
		const route = [];
		for (const point of candidate) {
			if (route.length && _rapierDrawDist(route.at(-1), point) < 1e-7) continue;
			while (route.length > 1) {
				const a = route.at(-2), b = route.at(-1), cross = (b[0] - a[0]) * (point[1] - b[1]) - (b[1] - a[1]) * (point[0] - b[0]);
				if (Math.abs(cross) > 1e-7 || (b[0] - a[0]) * (point[0] - b[0]) + (b[1] - a[1]) * (point[1] - b[1]) < 0) break;
				route.pop();
			}
			route.push(point);
		}
		if (route.some((b, i) => i && i + 1 < route.length && _rapierDrawDist(route[i - 1], route[i + 1]) + .01 < _rapierDrawDist(route[i - 1], b) + _rapierDrawDist(b, route[i + 1]) && Math.abs((b[0] - route[i - 1][0]) * (route[i + 1][1] - b[1]) - (b[1] - route[i - 1][1]) * (route[i + 1][0] - b[0])) < 1e-7)) continue;
		if (!consider(route)) continue;
		if (obstacles.some(({poly, gap}) => route.slice(1).some((b, i) => {
			const a = route[i];
			if (_rapierDrawClipSegment(a, b, poly).some(run => _rapierDrawDist(run[0], run[1]) > .01)) return true;
			return gap && poly.some((c, j) => { const d = poly[(j + 1) % poly.length]; return Math.min(_rapierDrawDist(a, _rapierDrawClosestOnSeg(a, c, d)), _rapierDrawDist(b, _rapierDrawClosestOnSeg(b, c, d)), _rapierDrawDist(c, _rapierDrawClosestOnSeg(c, a, b)), _rapierDrawDist(d, _rapierDrawClosestOnSeg(d, a, b))) < gap; });
		}))) continue;
		const geometry = _rapierDrawArrowGeometry(shape, recipe, route);
		if ([['headStart', geometry.segments[0]], ['headEnd', geometry.segments.at(-1)]].some(([name, segment]) => geometry[name] && (segment.length !== 2 || _rapierDrawDist(segment[0], segment[1]) + .01 < geometry[name].length))) continue;
		yield route;
	}
}

// one, a label placement RAPIER_DRAW_ROUTE_PLACE and a detour looked at RAPIER_DRAW_ROUTE_DETOUR. When it is spent the
const RAPIER_DRAW_BESIDE = 12, RAPIER_DRAW_LAYOUT_WORK = 600000;
const RAPIER_DRAW_SEARCH_WORK = 32768, RAPIER_DRAW_ROUTE_WORK = 40000, RAPIER_DRAW_ROUTE_PLACE = 200, RAPIER_DRAW_ROUTE_DETOUR = 8;

function _rapierDrawRouteKey(recipe) {
	return JSON.stringify([recipe?.nib, (recipe?.shapes || []).map(({raster, paint, labelPos, labelBeside, ...value}) => {
		value.stroke ??= null; value.asDrawn = !!value.asDrawn; value.brush ||= 'ink'; value.style ||= _rapierDrawDefaultStyle(value.recognized);
		return Object.keys(value).sort().map(name => [name, value[name]]);
	})]);
}

function _rapierDrawOrthogonalRoute(shape, recipe) {
	if (!recipe) return _rapierDrawFindOrthogonalRoute(shape, recipe, []);
	const key = _rapierDrawRouteKey(recipe);
	let saved = _RAPIER_DRAW_AUTO_ROUTES.get(recipe);
	if (saved?.key !== key || saved.fonts !== recipe?.fonts) {
		saved = _RAPIER_DRAW_ROUTE_SCENES.find(s => s.key === key && s.fonts === recipe?.fonts);
		if (saved) _RAPIER_DRAW_ROUTE_SPENT.work += saved.work;
	}
	if (saved?.paths.has(shape.id)) { _RAPIER_DRAW_AUTO_ROUTES.set(recipe, saved); return saved.paths.get(shape.id); }
	const edges = (recipe?.shapes || [shape]).filter(s => s.geom && s.route === 'auto' && ['arrow', 'line'].includes(s.recognized) && !_rapierDrawShapePaintsInk(s, recipe));
	const terminal = (s, end) => {
		const target = recipe?.shapes.find(t => t.id === s.bind?.[end]?.to);
		return target ? _rapierDrawPortNormal(target, end === 'start' ? [s.geom.x1, s.geom.y1] : [s.geom.x2, s.geom.y2], recipe) : [0, 0];
	};
	const returning = s => { const a = terminal(s, 'start'), b = terminal(s, 'end'); return a[0] * b[0] + a[1] * b[1] > .5 ? 1 : 0; };
	edges.sort((a, b) => returning(a) - returning(b) || Math.hypot(a.geom.x2 - a.geom.x1, a.geom.y2 - a.geom.y1) - Math.hypot(b.geom.x2 - b.geom.x1, b.geom.y2 - b.geom.y1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const scene = {targets: _rapierDrawRouteTargets(recipe), rooms: new Map(edges.map(edge => [edge, _rapierDrawRouteRoom(edge)])), left: RAPIER_DRAW_ROUTE_WORK, spent: 0, routes: new WeakMap(), ink: null, owner: new WeakMap()};
	const paths = new Map(), rooms = scene.rooms, apart = new Map(edges.map(edge => [edge, edges.filter(other => other !== edge && !_rapierDrawRouteRelated(edge, other))]));
	const put = (edge, points) => { paths.set(edge, points); scene.owner.set(points, edge); };
	const unrelated = edge => new Set(apart.get(edge).map(other => paths.get(other)));
	for (const edge of edges) put(edge, _rapierDrawFindOrthogonalRoute(edge, recipe, [...paths.values()], null, scene));
	scene.left = RAPIER_DRAW_ROUTE_WORK;
	const score = (edge, points, peers) => {
		const others = peers.map(s => paths.get(s));
		const away = unrelated(edge), mine = new Set([points]);
		let value = points.slice(1).reduce((n, b, i) => n + _rapierDrawRouteCost(points[i], b, others, rooms.get(edge), true, away) + _rapierDrawDist(points[i], b), points.length * 24);
		for (const peer of peers) { const path = paths.get(peer), far = apart.get(peer).includes(edge) ? mine : null; for (let i = 1; i < path.length; i++) value += _rapierDrawRouteCost(path[i - 1], path[i], [points], rooms.get(peer), true, far); }
		return value;
	};
	for (let pass = 0; pass < edges.length && scene.left > 0; pass++) {
		let changed = false;
		for (const edge of edges) {
			const peers = edges.filter(s => s !== edge), others = peers.map(s => paths.get(s)), before = paths.get(edge), room = rooms.get(edge);
			if (!before.slice(1).some((b, i) => _rapierDrawRouteCost(before[i], b, others, room))) continue;
			const after = _rapierDrawFindOrthogonalRoute(edge, recipe, others, null, scene, true);
			if (!after) break;
			const far = apart.get(edge).map(other => paths.get(other)), shared = _rapierDrawRouteOverlap(after, far) - _rapierDrawRouteOverlap(before, far);
			if (shared < -.01) { put(edge, after); changed = true; continue; }
			if (shared > .01) continue;
			const delta = _rapierDrawRouteCrossings(after, others) - _rapierDrawRouteCrossings(before, others);
			if (delta < 0 || !delta && score(edge, after, peers) + .01 < score(edge, before, peers)) { put(edge, after); changed = true; }
		}
		if (!changed) break;
	}
	for (const edge of edges) put(edge, _rapierDrawRouteStraighten(edge, paths.get(edge), edges.filter(s => s !== edge).map(s => paths.get(s)), scene));
	const labelEdges = recipe.shapes.filter(s => paths.has(s)), frames = recipe.shapes.filter(s => s.recognized === 'rect' && s.group === s.id);
	const placement = () => { const result = {}; scene.left -= RAPIER_DRAW_ROUTE_PLACE; scene.spent += RAPIER_DRAW_ROUTE_PLACE; result.ok = _rapierDrawPlaceConnectorLabels(labelEdges, recipe, frames, paths, result, false, scene); return result; };
	let placed = placement();
	const labelStates = new Set([JSON.stringify([...paths.values()])]);
	for (let repair = 0; recipe.routeLabelRails !== false && !placed.ok && repair < edges.length; repair++) {
		const edge = placed.failed, original = paths.get(edge), peers = edges.filter(s => s !== edge), others = peers.map(s => paths.get(s)), room = rooms.get(edge);
		const box = _rapierDrawBBox([...paths.values()].flat()), g = edge.geom;
		const lowX = Math.min(g.x1, g.x2) - room[0] * 2, highX = Math.max(g.x1, g.x2) + room[0] * 2;
		const lowY = Math.min(g.y1, g.y2) - room[1] * 2, highY = Math.max(g.y1, g.y2) + room[1] * 2;
		const rails = [box.minX - room[0] * 2, box.maxX + room[0] * 2].map(x => [[x, lowY], [x, highY]])
			.concat([box.minY - room[1] * 2, box.maxY + room[1] * 2].map(y => [[lowX, y], [highX, y]]));
		let best;
		for (const points of rails) {
			if (!points.flat().every(_rapierDrawSpatial)) continue;
			const rail = _rapierDrawDist([g.x1, g.y1], points[0]) <= _rapierDrawDist([g.x1, g.y1], points[1]) ? points : points.slice().reverse();
			let candidate;
			try { candidate = _rapierDrawFindOrthogonalRoute(edge, recipe, others, rail, scene); }
			catch (error) { if (error.code !== 'drawing_route_blocked') throw error; continue; }
			put(edge, candidate);
			const next = placement(), progress = next.ok ? labelEdges.length : labelEdges.indexOf(next.failed), state = JSON.stringify([...paths.values()]);
			const crossings = _rapierDrawRouteCrossings(candidate, others), value = score(edge, candidate, peers);
			if ((next.ok || next.failed !== edge) && !labelStates.has(state) && (!best || progress > best.progress || progress === best.progress && (crossings < best.crossings || crossings === best.crossings && value < best.value))) best = {candidate, next, progress, crossings, value, state};
		}
		put(edge, best?.candidate || original);
		if (!best) break;
		labelStates.add(best.state); placed = best.next;
	}
	if (placed.ok) for (let pass = 0; pass < edges.length && scene.left > 0; pass++) {
		let changed = false;
		for (const edge of edges) {
			const others = edges.filter(s => s !== edge).map(s => paths.get(s)), before = paths.get(edge);
			const unrelated = edges.filter(s => s !== edge && !['start', 'end'].some(a => ['start', 'end'].some(b => edge.bind?.[a]?.to && edge.bind[a].to === s.bind?.[b]?.to))).map(s => paths.get(s));
			let best = before, crossings = _rapierDrawRouteCrossings(before, others), overlap = _rapierDrawRouteOverlap(before, unrelated);
			if (!crossings && !overlap) continue;
			let count, length;
			const consider = candidate => {
				scene.spent += RAPIER_DRAW_ROUTE_DETOUR;
				if ((scene.left -= RAPIER_DRAW_ROUTE_DETOUR) <= 0) return false;
				count = _rapierDrawRouteCrossings(candidate, others); length = _rapierDrawRouteOverlap(candidate, unrelated);
				return length < overlap - .01 || Math.abs(length - overlap) <= .01 && count < crossings;
			};
			for (const candidate of _rapierDrawRouteDetours(edge, recipe, before, _rapierDrawBBox([...paths.values()].flat()), consider)) {
				if (scene.left <= 0) break;
				put(edge, candidate);
				if (placement().ok) { best = candidate; crossings = count; overlap = length; }
				if (!crossings && !overlap) break;
			}
			put(edge, best); if (best !== before) changed = true;
			if (scene.left <= 0) break;
		}
		if (!changed) break;
	}
	saved = {key, fonts: recipe?.fonts, work: scene.spent, boxes: scene.targets.map(({target, box}) => ({id: target.id, ...box})), paths: new Map([...paths].map(([s, points]) => [s.id, points]))};
	_RAPIER_DRAW_ROUTE_SPENT.work += scene.spent;
	_RAPIER_DRAW_AUTO_ROUTES.set(recipe, saved);
	_RAPIER_DRAW_ROUTE_SCENES.push(saved); if (_RAPIER_DRAW_ROUTE_SCENES.length > 4) _RAPIER_DRAW_ROUTE_SCENES.shift();
	return paths.get(shape) || _rapierDrawFindOrthogonalRoute(shape, recipe, []);
}

function _rapierDrawRouteChanges(recipe, ids, live = false) {
	const edges = recipe.shapes.filter(s => s.route === 'auto' && ['line', 'arrow'].includes(s.recognized) && !_rapierDrawShapePaintsInk(s, recipe));
	if (!edges.length) return [];
	const before = _RAPIER_DRAW_AUTO_ROUTES.get(recipe);
	if (!live || !before) {
		if (before?.live) _RAPIER_DRAW_AUTO_ROUTES.delete(recipe);
		_rapierDrawOrthogonalRoute(edges[0], recipe);
		_rapierDrawPlaceConnectorLabels(edges, recipe, [], null, null);
		return edges.map(s => s.id);
	}
	try {
	const changed = new Set(ids), targets = _rapierDrawRouteTargets(recipe);
	const boxes = before.boxes.filter(b => changed.has(b.id)).concat(targets.filter(t => changed.has(t.target.id)).map(t => t.box));
	const intersects = (a, b, pad = 32) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minY <= b.maxY + pad && a.maxY >= b.minY - pad;
	const paths = new Map(), dirty = [], labels = new Map();
	for (const edge of edges) {
		const points = before.paths.get(edge.id);
		if (edge.label) labels.set(edge.id, [edge.labelPos, edge.labelBeside]);
		const touches = !points || changed.has(edge.id) || Object.values(edge.bind || {}).some(b => changed.has(b.to)) || points.slice(1).some((p, i) => boxes.some(b => intersects(_rapierDrawBBox([points[i], p]), b)))
			|| edge.label && boxes.some(b => intersects(_rapierDrawTextLayout(edge, recipe, _rapierDrawArrowGeometry(edge, recipe, points)).bounds, b));
		if (touches) dirty.push(edge); else paths.set(edge, points);
	}
	const scene = {targets, rooms: new Map(edges.map(e => [e, _rapierDrawRouteRoom(e)])), left: RAPIER_DRAW_ROUTE_WORK, spent: 0, routes: new WeakMap(), owner: new WeakMap()};
	for (const [edge, points] of paths) {
		scene.owner.set(points, edge);
		if (edge.label) scene.targets.push({target: {id: 'label:' + edge.id, recognized: 'text'}, box: _rapierDrawTextLayout(edge, recipe, _rapierDrawArrowGeometry(edge, recipe, points)).bounds, half: 8});
	}
	for (const edge of dirty) {
		const points = _rapierDrawFindOrthogonalRoute(edge, recipe, [...paths.values()], null, scene, true);
		if (!points) _rapierDrawRouteBlocked();
		paths.set(edge, points); scene.owner.set(points, edge);
	}
	if (!_rapierDrawPlaceConnectorLabels(edges, recipe, [], paths, null, true, scene)) _rapierDrawRouteBlocked();
	const saved = {key: _rapierDrawRouteKey(recipe), fonts: recipe.fonts, live: true, boxes: targets.filter(t => !t.target.id.startsWith('label:')).map(({target, box}) => ({id: target.id, ...box})), paths: new Map([...paths].map(([edge, points]) => [edge.id, points]))};
	_RAPIER_DRAW_AUTO_ROUTES.set(recipe, saved);
	return edges.filter(e => paths.get(e) !== before.paths.get(e.id) || e.label && (e.labelPos !== labels.get(e.id)[0] || e.labelBeside !== labels.get(e.id)[1])).map(e => e.id);
	} catch (error) {
		if (error.code !== 'drawing_route_blocked') throw error;
		_RAPIER_DRAW_AUTO_ROUTES.delete(recipe);
		_rapierDrawOrthogonalRoute(edges[0], recipe);
		_rapierDrawPlaceConnectorLabels(edges, recipe, [], null, null);
		return edges.map(edge => edge.id);
	}
}

// One connector's short jogs removed. A jog is a leg no longer than RAPIER_DRAW_ROUTE_JOG between two parallel legs
const RAPIER_DRAW_ROUTE_JOG = 16;
function _rapierDrawRouteStraighten(shape, points, others, scene) {
	if (!points || points.length < 5) return points;
	const ends = new Set([shape.bind?.start?.to, shape.bind?.end?.to].filter(Boolean)), half = _rapierDrawStrokeHalf(shape, null) + 2;
	const blocked = (a, b, ownEnds) => (scene?.targets || []).some(({target, box}) => {
		if (ownEnds && ends.has(target.id)) return false;
		const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]), minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
		return maxX > box.minX - half && minX < box.maxX + half && maxY > box.minY - half && minY < box.maxY + half;
	});
	const cost = path => path.slice(1).reduce((n, b, i) => n + _rapierDrawRouteCost(path[i], b, others, [0, 0]), 0);
	let path = points.map(p => p.slice());
	for (let guard = 0; guard < points.length; guard++) {
		let next = null;
		for (let i = 1; i + 2 < path.length && !next; i++) {
			const a = path[i - 1], b = path[i], c = path[i + 1], d = path[i + 2];
			const jog = _rapierDrawDist(b, c), axis = Math.abs(b[0] - c[0]) > Math.abs(b[1] - c[1]) ? 0 : 1;
			if (!(jog > 0 && jog <= RAPIER_DRAW_ROUTE_JOG) || Math.abs(a[axis] - b[axis]) > 1e-6 || Math.abs(c[axis] - d[axis]) > 1e-6) continue;
			if (Math.sign(b[1 - axis] - a[1 - axis]) !== Math.sign(d[1 - axis] - c[1 - axis])) continue;
			for (const [from, to, at] of [[i - 1, i, c[axis]], [i + 1, i + 2, b[axis]]]) {
				if (from === 0 || to === path.length - 1) continue;
				const candidate = path.map(p => p.slice());
				candidate[from][axis] = at; candidate[to][axis] = at;
				const moved = [[from - 1, from], [from, to], [to, to + 1]].filter(([u, v]) => u >= 0 && v < candidate.length);
				if (moved.some(([u, v]) => blocked(candidate[u], candidate[v], u === 0 || v === candidate.length - 1))) continue;
				const merged = candidate.filter((p, k) => !k || _rapierDrawDist(p, candidate[k - 1]) > 1e-6)
					.filter((p, k, all) => k === 0 || k === all.length - 1 || Math.abs((p[0] - all[k - 1][0]) * (all[k + 1][1] - p[1]) - (p[1] - all[k - 1][1]) * (all[k + 1][0] - p[0])) > 1e-6);
				if (cost(merged) <= cost(path) + 1e-6) { next = merged; break; }
			}
		}
		if (!next) break;
		path = next;
	}
	return path.length === points.length && path.every((p, k) => p[0] === points[k][0] && p[1] === points[k][1]) ? points : path;
}

function _rapierDrawRouteBlocked() { throw Object.assign(new RangeError('There is no clear route between these endpoints'), { code: 'drawing_route_blocked' }); }

function _rapierDrawRouteTargets(recipe) {
	const targets = [];
	for (const target of recipe?.shapes || []) if (!_rapierDrawShapePaintsInk(target, recipe) && _rapierDrawAnchorFrame(target, recipe)) targets.push({target, box: _rapierDrawObstacleBox(target, recipe), half: _rapierDrawStrokeHalf(target, recipe)});
	return targets;
}

const _RAPIER_DRAW_GRID = {size: 0};
function _rapierDrawGridScratch(count, phases) {
	const size = count * 2 * phases;
	if (_RAPIER_DRAW_GRID.size < size) Object.assign(_RAPIER_DRAW_GRID, {size, costs: new Float64Array(size), previous: new Int32Array(size), estimates: new Float64Array(size / 2), horizontalCost: new Float64Array(size / 2), verticalCost: new Float64Array(size / 2), heapCost: new Float64Array(size * 2), heapId: new Int32Array(size * 2)});
	return _RAPIER_DRAW_GRID;
}

function _rapierDrawFindOrthogonalRoute(shape, recipe, occupied, rail, scene, optional) {
	const g = shape.geom, start = [g.x1, g.y1], end = [g.x2, g.y2];
	const apart = new Set(occupied.filter(path => { const owner = scene?.owner.get(path); return owner && !_rapierDrawRouteRelated(shape, owner); }));
	const room = scene?.rooms.get(shape) || _rapierDrawRouteRoom(shape), frames = [], routeCost = (a, b) => _rapierDrawRouteCost(a, b, occupied, room, true, apart) + _rapierDrawRouteCost(a, b, frames, room, false);
	const gap = Math.max(24, RAPIER_DRAW_ARROW_HEAD_LEN * Math.sqrt(_rapierDrawNibScale(shape, recipe) * _rapierDrawEffectiveWidth(shape, true) / 2) + 8) + _rapierDrawStrokeHalf(shape, recipe), obstacles = [];
	for (const {target, box: b, half} of scene?.targets || _rapierDrawRouteTargets(recipe)) {
		if (target === shape) continue;
		const terminal = ['start', 'end'].some(end => shape.bind?.[end]?.to === target.id);
		const pad = (terminal ? gap : 8 + _rapierDrawStrokeHalf(shape, recipe)) + half;
		if (target.recognized === 'rect' && target.group && ['start', 'end'].some(end => {
			const member = recipe.shapes.find(other => other.id === shape.bind?.[end]?.to);
			if (!member || member === target || member.group !== target.group) return false;
			const inside = _rapierDrawShapeBBoxIn(member, recipe);
			return b.minX < inside.minX && b.minY < inside.minY && b.maxX > inside.maxX && b.maxY > inside.maxY;
		})) {
			frames.push([[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY], [b.minX, b.minY]]);
			const titles = recipe.shapes.filter(other => other.group === target.group && other.recognized === 'text')
				.map(other => _rapierDrawShapeBBoxIn(other, recipe)).filter(title => title.minY >= b.minY && title.maxY <= b.maxY);
			if (titles.length) obstacles.push({target, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: Math.min(...titles.map(title => title.maxY)) + 8});
			continue;
		}
		obstacles.push({ target, real: b, minX: Math.max(-65536, b.minX - pad), minY: Math.max(-65536, b.minY - pad), maxX: Math.min(65536, b.maxX + pad), maxY: Math.min(65536, b.maxY + pad) });
	}
	const bound = ['start', 'end'].map(end => obstacles.find(o => o.real && o.target.id === shape.bind?.[end]?.to));
	for (const p of new Set(bound)) if (p) for (const q of obstacles) if (q.real && q !== p) for (const [lo, hi, across] of [['minX', 'maxX', ['minY', 'maxY']], ['minY', 'maxY', ['minX', 'maxX']]]) {
		const pair = p.real[hi] <= q.real[lo] ? [p, q] : q.real[hi] <= p.real[lo] ? [q, p] : null;
		if (!pair || p[across[1]] <= q[across[0]] || q[across[1]] <= p[across[0]]) continue;
		const [near, far] = pair, apart = far.real[lo] - near.real[hi];
		if (apart <= 0 || near[hi] <= far[lo]) continue;
		const mid = near.real[hi] + apart / 2;
		near[hi] = mid; far[lo] = mid;
	}
	const blocked = () => { if (rail || recipe?.routeLabelRails !== undefined) _rapierDrawRouteBlocked(); return [start, end]; };
	_rapierDrawWorkCount(obstacles.length, 96);
	const turn = 1000000;
	const crossed = (a, b, box) => {
		let lo = 0, hi = 1;
		for (const [v, d, min, max] of [[a[0], b[0] - a[0], box.minX, box.maxX], [a[1], b[1] - a[1], box.minY, box.maxY]]) {
			if (Math.abs(d) < 1e-9) { if (v <= min + 1e-7 || v >= max - 1e-7) return false; }
			else { const p = (min - v) / d, q = (max - v) / d; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)); }
		}
		return hi > lo + 1e-8;
	};
	const terminals = (point, name) => {
		const box = obstacles.find(b => b.target.id === shape.bind?.[name]?.to);
		const raw = box && _rapierDrawPortNormal(box.target, point, recipe);
		const normal = raw && (Math.abs(raw[0]) >= Math.abs(raw[1]) ? [Math.sign(raw[0]) || 1, 0] : [0, Math.sign(raw[1])]);
		const distance = normal && Math.min(...normal.map((n, axis) => Math.abs(n) < 1e-8 ? Infinity : ((axis ? n > 0 ? box.maxY : box.minY : n > 0 ? box.maxX : box.minX) - point[axis]) / n));
		const ports = box ? [{point: point.map((v, axis) => v + normal[axis] * distance), axis: normal[0] === 0 ? 1 : normal[1] === 0 ? 0 : -1}] : [{ point, axis: -1 }];
		if (box) for (const port of ports) for (const axis of [0, 1]) for (const edge of axis ? [box.minY, box.maxY] : [box.minX, box.maxX]) if (Math.abs(port.point[axis] - edge) < 1e-7) port.point[axis] = edge;
		const poly = box && _rapierDrawShapePolygon(box.target, recipe);
		return ports.filter(port => port.point.every(_rapierDrawSpatial)
			&& !obstacles.some(other => other !== box && (crossed(point, port.point, other) || port.point[0] > other.minX && port.point[0] < other.maxX && port.point[1] > other.minY && port.point[1] < other.maxY))
			&& (!poly || !_rapierDrawClipSegment(point, port.point, poly).some(run => _rapierDrawDist(run[0], run[1]) > .01)))
			.map(port => ({ ...port, length: _rapierDrawDist(point, port.point) }));
	};
	const starts = terminals(start, 'start'), ends = terminals(end, 'end');
	if (!starts.length || !ends.length) return blocked();
	const fallback = () => {
		const a = starts[0].point, b = ends[0].point, box = _rapierDrawBBox([a, b, ...obstacles.flatMap(o => [[o.minX, o.minY], [o.maxX, o.maxY]])]);
		const mids = [[[b[0], a[1]]], [[a[0], b[1]]]];
		for (const x of [box.minX - gap, box.maxX + gap, (a[0] + b[0]) / 2]) mids.push([[x, a[1]], [x, b[1]]]);
		for (const y of [box.minY - gap, box.maxY + gap, (a[1] + b[1]) / 2]) mids.push([[a[0], y], [b[0], y]]);
		let best = null, cost = Infinity;
		for (const mid of mids) {
			const path = [start, a, ...mid, b, end], points = [];
			if (rail && !mid.some((p, i) => i && p[0] === rail[1][0] && p[1] === rail[1][1] && mid[i - 1][0] === rail[0][0] && mid[i - 1][1] === rail[0][1])) continue;
			if (path.some(p => !p.every(_rapierDrawSpatial)) || path.slice(2, -1).some((p, i) => obstacles.some(o => crossed(path[i + 1], p, o)))) continue;
			for (const p of path) {
				if (points.length && _rapierDrawDist(points.at(-1), p) < 1e-7) continue;
				while (points.length > 1) { const q = points.at(-1), r = points.at(-2); if (Math.abs((q[0] - r[0]) * (p[1] - q[1]) - (q[1] - r[1]) * (p[0] - q[0])) > 1e-7 || (q[0] - r[0]) * (p[0] - q[0]) + (q[1] - r[1]) * (p[1] - q[1]) < 0) break; points.pop(); }
				points.push(p);
			}
			const value = points.length * turn + points.slice(1).reduce((n, p, i) => n + _rapierDrawDist(points[i], p) + routeCost(points[i], p), 0);
			if (value < cost) { best = points; cost = value; }
		}
		return best;
	};
	const reach = [start, end, ...(rail || [])], margin = 256 + Math.max(...room);
	const nearBox = {minX: Math.min(...reach.map(p => p[0])) - margin, maxX: Math.max(...reach.map(p => p[0])) + margin, minY: Math.min(...reach.map(p => p[1])) - margin, maxY: Math.max(...reach.map(p => p[1])) + margin};
	const near = ((a, b) => Math.max(a[0], b[0]) >= nearBox.minX && Math.min(a[0], b[0]) <= nearBox.maxX && Math.max(a[1], b[1]) >= nearBox.minY && Math.min(a[1], b[1]) <= nearBox.maxY);
	const coordinates = axis => {
		const values = [...starts, ...ends].map(p => p.point[axis]).concat(obstacles.flatMap(b => axis ? [b.minY, b.maxY] : [b.minX, b.maxX]));
		if (rail) values.push(rail[0][axis], rail[1][axis]);
		for (const points of [...occupied, ...frames]) for (let i = 1; i < points.length; i++) if (Math.abs(points[i][axis] - points[i - 1][axis]) < 1e-7 && (!near || near(points[i - 1], points[i]))) {
			values.push(Math.floor((points[i][axis] - room[axis]) / 8) * 8, Math.ceil((points[i][axis] + room[axis]) / 8) * 8);
		}
		values.push(Math.min(...values) - gap, Math.max(...values) + gap);
		return [...new Set(values.filter(_rapierDrawSpatial))].sort((a, b) => a - b);
	};
	const xs = coordinates(0), ys = coordinates(1);
	const nx = xs.length, ny = ys.length, stride = nx + 1, count = nx * ny, xIndex = new Map(xs.map((v, i) => [v, i])), yIndex = new Map(ys.map((v, i) => [v, i]));
	if (count > 65536) { const points = optional ? null : fallback(); if (points || optional) return points; return blocked(); }
	const laid = count >> 1;
	if (optional && laid >= scene.left) { scene.left -= laid; scene.spent += laid; return null; }
	const horizontal = new Int16Array((nx + 1) * (ny + 1)), vertical = new Int16Array(horizontal.length);
	const mark = (data, x0, y0, x1, y1) => {
		if (x0 > x1 || y0 > y1) return;
		data[y0 * stride + x0]++; data[y0 * stride + x1 + 1]--; data[(y1 + 1) * stride + x0]--; data[(y1 + 1) * stride + x1 + 1]++;
	};
	for (const box of obstacles) {
		const x0 = xIndex.get(box.minX), y0 = yIndex.get(box.minY), x1 = xIndex.get(box.maxX), y1 = yIndex.get(box.maxY);
		mark(horizontal, x0, y0 + 1, x1 - 1, y1 - 1); mark(vertical, x0 + 1, y0, x1 - 1, y1 - 1);
	}
	for (const data of [horizontal, vertical]) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
		const i = y * stride + x;
		data[i] += (x ? data[i - 1] : 0) + (y ? data[i - stride] : 0) - (x && y ? data[i - stride - 1] : 0);
	}
	const phases = rail ? 2 : 1, size = count * 2 * phases, grid = _rapierDrawGridScratch(count, phases);
	const {costs, previous, estimates, horizontalCost, verticalCost} = grid;
	costs.fill(Infinity, 0, size); previous.fill(-1, 0, size); horizontalCost.fill(0, 0, count); verticalCost.fill(0, 0, count);
	const before = (values, point) => {
		let lo = 0, hi = values.length;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] < point - 1e-7) lo = mid + 1; else hi = mid; }
		return lo - 1;
	};
	const project = (paths, crossings) => {
		for (const path of paths) for (let i = 1, merge = apart.has(path) ? 1e9 : 1e4; i < path.length; i++) for (const axis of [0, 1]) {
			const a = path[i - 1], b = path[i], along = axis ? ys : xs, across = axis ? xs : ys, costs = axis ? verticalCost : horizontalCost;
			const at = (i, j) => axis ? i * nx + j : j * nx + i, delta = b[1 - axis] - a[1 - axis];
			if (Math.abs(delta) > 1e-7) {
				if (!crossings) continue;
				for (let j = 0; j < across.length; j++) {
					const u = (across[j] - a[1 - axis]) / delta;
					if (u <= 1e-7 || u > 1 + 1e-7) continue;
					const k = before(along, a[axis] + u * (b[axis] - a[axis]));
					if (k >= 0 && k + 1 < along.length) costs[at(k, j)] += 1e9;
				}
			} else {
				const min = Math.min(a[axis], b[axis]), max = Math.max(a[axis], b[axis]);
				for (let j = 0; j < across.length; j++) {
					const distance = Math.abs(across[j] - a[1 - axis]), weight = distance < 1e-7 ? merge : Math.max(0, room[1 - axis] - distance) * 10;
					if (!weight) continue;
					for (let k = Math.max(0, before(along, min)); k + 1 < along.length && along[k] < max; k++) costs[at(k, j)] += Math.max(0, Math.min(along[k + 1], max) - Math.max(along[k], min)) * weight;
				}
			}
		}
	};
	project(occupied, true); project(frames, false);
	let viaRail = Infinity;
	if (rail) for (const port of ends) { const d = Math.abs(rail[1][0] - port.point[0]) + Math.abs(rail[1][1] - port.point[1]) + port.length; if (d < viaRail) viaRail = d; }
	for (let at = 0, y = 0; y < ny; y++) for (let x = 0; x < nx; x++, at++) {
		let nearest = Infinity;
		for (let e = 0; e < ends.length; e++) { const port = ends[e], d = Math.abs(xs[x] - port.point[0]) + Math.abs(ys[y] - port.point[1]) + port.length; if (d < nearest) nearest = d; }
		if (rail) { estimates[at] = Math.abs(xs[x] - rail[0][0]) + Math.abs(ys[y] - rail[0][1]) + (Math.abs(rail[0][0] - rail[1][0]) + Math.abs(rail[0][1] - rail[1][1])) + viaRail; estimates[count + at] = nearest; }
		else estimates[at] = nearest;
	}
	let heapCost = grid.heapCost, heapId = grid.heapId, heapSize = 0;
	const estimate = id => estimates[(id >= count * 2 ? count : 0) + ((id % (count * 2)) >> 1)];
	const push = (id, cost) => {
		cost += estimate(id);
		if (heapSize === heapCost.length) {
			const c = new Float64Array(heapSize * 2), d = new Int32Array(heapSize * 2);
			c.set(heapCost); d.set(heapId); heapCost = grid.heapCost = c; heapId = grid.heapId = d;
		}
		let i = heapSize++;
		while (i) { const parent = (i - 1) >> 1; if (heapCost[parent] < cost || heapCost[parent] === cost && heapId[parent] <= id) break; heapCost[i] = heapCost[parent]; heapId[i] = heapId[parent]; i = parent; }
		heapCost[i] = cost; heapId[i] = id;
	};
	const index = port => yIndex.get(port.point[1]) * nx + xIndex.get(port.point[0]);
	const railStart = rail && index({point: rail[0]}), railEnd = rail && index({point: rail[1]}), railAxis = rail && (rail[0][0] === rail[1][0] ? 1 : 0);
	const railOpen = rail && !obstacles.some(box => crossed(rail[0], rail[1], box));
	const endCells = ends.map(index);
	for (let i = 0; i < starts.length; i++) for (const axis of starts[i].axis < 0 ? [0, 1] : [starts[i].axis]) {
		const id = index(starts[i]) * 2 + axis;
		const cost = starts[i].length + routeCost(start, starts[i].point);
		if (cost < costs[id]) { costs[id] = cost; previous[id] = -i - 2; push(id, costs[id]); }
	}
	const limit = optional ? Math.min(RAPIER_DRAW_SEARCH_WORK, scene.left - laid) : RAPIER_DRAW_SEARCH_WORK;
	let best = Infinity, bestId = -1, work = 0;
	while (heapSize) {
		const priority = heapCost[0], id = heapId[0], cost = costs[id];
		if (--heapSize) {
			const lastCost = heapCost[heapSize], lastId = heapId[heapSize];
			let i = 0;
			while (i * 2 + 1 < heapSize) {
				let child = i * 2 + 1;
				if (child + 1 < heapSize && (heapCost[child + 1] < heapCost[child] || heapCost[child + 1] === heapCost[child] && heapId[child + 1] < heapId[child])) child++;
				if (lastCost < heapCost[child] || lastCost === heapCost[child] && lastId <= heapId[child]) break;
				heapCost[i] = heapCost[child]; heapId[i] = heapId[child]; i = child;
			}
			heapCost[i] = lastCost; heapId[i] = lastId;
		}
		if (priority !== cost + estimate(id)) continue;
		if (priority >= best) break;
		if (++work > limit) {
			if (optional) { scene.left -= laid + work; scene.spent += laid + work; return null; }
			break;
		}
		const phase = id >= count * 2 ? 1 : 0, at = (id % (count * 2)) >> 1, axis = id & 1, x = at % nx, y = Math.floor(at / nx);
		if (railOpen && !phase && at === railStart) {
			const next = count * 2 + railEnd * 2 + railAxis, total = cost + _rapierDrawDist(rail[0], rail[1]) + routeCost(rail[0], rail[1]) + (axis !== railAxis ? turn : 0);
			if (total < costs[next]) { costs[next] = total; previous[next] = id; push(next, total); }
		}
		if (!rail || phase) for (let i = 0; i < ends.length; i++) if (endCells[i] === at) {
			const total = cost + ends[i].length + routeCost(ends[i].point, end) + (ends[i].axis >= 0 && ends[i].axis !== axis ? turn : 0);
			if (total < best) { best = total; bestId = id; }
		}
		for (let side = 0; side < 4; side++) {
			let next, direction, distance, blocked;
			if (side === 0) { if (!x) continue; next = at - 1; direction = 0; distance = xs[x] - xs[x - 1]; blocked = horizontal[y * stride + x - 1]; }
			else if (side === 1) { if (x + 1 >= nx) continue; next = at + 1; direction = 0; distance = xs[x + 1] - xs[x]; blocked = horizontal[y * stride + x]; }
			else if (side === 2) { if (!y) continue; next = at - nx; direction = 1; distance = ys[y] - ys[y - 1]; blocked = vertical[(y - 1) * stride + x]; }
			else { if (y + 1 >= ny) continue; next = at + nx; direction = 1; distance = ys[y + 1] - ys[y]; blocked = vertical[y * stride + x]; }
			if (blocked) continue;
			if (rail) {
				const ax = xs[x], ay = ys[y], bx = xs[next % nx], by = ys[Math.floor(next / nx)];
				const aAcross = railAxis ? ax : ay, bAcross = railAxis ? bx : by, aAlong = railAxis ? ay : ax, bAlong = railAxis ? by : bx, line = rail[0][1 - railAxis];
				if (Math.min(aAcross, bAcross) <= line && Math.max(aAcross, bAcross) >= line) {
					const low = Math.min(rail[0][railAxis], rail[1][railAxis]), high = Math.max(rail[0][railAxis], rail[1][railAxis]);
					if (direction === railAxis) { if (Math.min(aAlong, bAlong) < high && Math.max(aAlong, bAlong) > low) continue; }
					else if (aAlong >= low && aAlong <= high && (aAlong !== rail[phase][railAxis] || aAcross !== line && bAcross !== line)) continue;
				}
			}
			const nextId = phase * count * 2 + next * 2 + direction, nextCost = cost + distance + (axis !== direction ? turn : 0) + (direction ? verticalCost : horizontalCost)[Math.min(at, next)];
			if (nextCost < costs[nextId]) { costs[nextId] = nextCost; previous[nextId] = id; push(nextId, nextCost); }
		}
	}
	if (scene) { scene.left -= laid + work; scene.spent += laid + work; }
	if (bestId < 0) { const points = fallback(); if (points) return points; return blocked(); }
	const route = [];
	for (let id = bestId; id >= 0; id = previous[id]) { const at = (id % (count * 2)) >> 1; route.push([xs[at % nx], ys[Math.floor(at / nx)]]); }
	route.reverse(); route.unshift(start); route.push(end);
	const points = [];
	for (const point of route) {
		if (points.length && _rapierDrawDist(points.at(-1), point) < 1e-7) continue;
		while (points.length > 1) {
			const a = points.at(-2), b = points.at(-1);
			if (Math.abs((b[0] - a[0]) * (point[1] - b[1]) - (b[1] - a[1]) * (point[0] - b[0])) > 1e-7 || (b[0] - a[0]) * (point[0] - b[0]) + (b[1] - a[1]) * (point[1] - b[1]) < 0) break;
			points.pop();
		}
		points.push(point);
	}
	if (points.length === 1) points.push(points[0].slice());
	return points;
}

const _RAPIER_DRAW_TURNED_SCENES = new WeakMap();
function _rapierDrawTurnedShape(shape, turn, delta) {
	const g = shape.geom;
	if (!g) return shape;
	if (g.p) return { ...shape, geom: { ...g, p: g.p.map(turn) } };
	if (shape.recognized === 'line' || shape.recognized === 'arrow') {
		const a = turn([g.x1, g.y1]), b = turn([g.x2, g.y2]);
		return { ...shape, geom: { ...g, x1: a[0], y1: a[1], x2: b[0], y2: b[1] } };
	}
	if (!Number.isFinite(g.cx) || !Number.isFinite(g.cy)) return shape;
	const c = turn([g.cx, g.cy]), raw = (g.rot || 0) + delta, rot = Math.atan2(Math.sin(raw), Math.cos(raw));
	const geom = { ...g, cx: c[0], cy: c[1] };
	if (Math.abs(rot) > 1e-9) geom.rot = rot; else delete geom.rot;
	return { ...shape, geom };
}
function _rapierDrawTurnedRoute(shape, recipe) {
	const key = JSON.stringify([_rapierDrawRouteKey(recipe), recipe.angle, recipe.canvas?.w, recipe.canvas?.h]);
	let scene = _RAPIER_DRAW_TURNED_SCENES.get(recipe);
	if (scene?.key !== key || scene.fonts !== recipe.fonts) {
		const theta = recipe.angle * Math.PI / 180, cx = recipe.canvas.w / 2, cy = recipe.canvas.h / 2;
		const turn = angle => { const cs = Math.cos(angle), sn = Math.sin(angle); return ([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]; };
		const back = turn(-theta), local = { ...recipe, shapes: recipe.shapes.map(item => _rapierDrawTurnedShape(item, back, -theta)) };
		delete local.angle;
		scene = { key, fonts: recipe.fonts, local, forward: turn(theta), index: new Map(recipe.shapes.map((item, i) => [item.id, { value: JSON.stringify(item), local: local.shapes[i] }])) };
		_RAPIER_DRAW_TURNED_SCENES.set(recipe, scene);
	}
	const entry = scene.index.get(shape.id), mine = entry && (entry.value === JSON.stringify(shape)) ? entry.local : null;
	return mine ? _rapierDrawOrthogonalRoute(mine, scene.local).map(scene.forward) : _rapierDrawOrthogonalRoute(shape, recipe);
}

function _rapierDrawArrowRoutePoints(shape, recipe) {
	const g = shape.geom;
	if (!g) return null;
	const route = shape.route || 'straight';
	if (route === 'auto') return recipe?.angle ? _rapierDrawTurnedRoute(shape, recipe) : _rapierDrawOrthogonalRoute(shape, recipe);
	if (route === 'elbow') {
		const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
		const t = _rapierDrawClamp(typeof shape.elbow === 'number' ? shape.elbow : .5, 0, 1);
		if (Math.abs(dx) >= Math.abs(dy)) { const mx = g.x1 + dx * t; return [[g.x1, g.y1], [mx, g.y1], [mx, g.y2], [g.x2, g.y2]]; }
		const my = g.y1 + dy * t;
		return [[g.x1, g.y1], [g.x1, my], [g.x2, my], [g.x2, g.y2]];
	}
	if (route === 'curved' && (shape.bend || shape.curveT != null && shape.curveT !== .5)) {
		const dx = g.x2 - g.x1, dy = g.y2 - g.y1, len = Math.hypot(dx, dy) || 1, t = shape.curveT ?? .5;
		const control = [g.x1 + dx * t - dy / len * (shape.bend || 0) * 2, g.y1 + dy * t + dx / len * (shape.bend || 0) * 2];
		if (!control.every(_rapierDrawSpatial)) throw Object.assign(new RangeError('Drawing exceeds its coordinate range'), { code: 'drawing_geometry_limit' });
		return [[g.x1, g.y1], control, [g.x2, g.y2]];
	}
	return [[g.x1, g.y1], [g.x2, g.y2]];
}

function _rapierDrawQuadraticAt(p, t) {
	const u = 1 - t;
	return [u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0], u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]];
}

function _rapierDrawRouteBBoxFromPoints(pts, curved) {
	const exact = [pts[0], pts[pts.length - 1]];
	if (curved && pts.length === 3) for (const axis of [0, 1]) {
		const den = pts[0][axis] - 2 * pts[1][axis] + pts[2][axis];
		const t = den ? (pts[0][axis] - pts[1][axis]) / den : -1;
		if (t > 0 && t < 1) exact.push(_rapierDrawQuadraticAt(pts, t));
	} else exact.push(...pts);
	return _rapierDrawBBox(exact);
}

function _rapierDrawSegmentLength(p, end = 1) {
	if (p.length === 2) return _rapierDrawDist(p[0], p[1]) * end;
	const ax = p[0][0] - 2 * p[1][0] + p[2][0], ay = p[0][1] - 2 * p[1][1] + p[2][1];
	const bx = p[1][0] - p[0][0], by = p[1][1] - p[0][1], a = ax * ax + ay * ay, c = bx * bx + by * by;
	if (a < 1e-12) return 2 * Math.sqrt(c) * end;
	const root = Math.sqrt(a), u = (ax * bx + ay * by) / a, v2 = Math.max(0, c / a - u * u);
	if (Math.abs(u) > 1e4 || v2 > 1e8) {
		let sum = 0;
		for (let i = 0; i < 16; i++) { const t = (i + .5) * end / 16; sum += Math.hypot(ax * t + bx, ay * t + by); }
		return sum * end / 8;
	}
	const primitive = t => {
		const x = t + u;
		return x * Math.hypot(x, Math.sqrt(v2)) + (v2 > 1e-14 ? v2 * Math.asinh(x / Math.sqrt(v2)) : 0);
	};
	return Math.max(0, root * (primitive(end) - primitive(0)));
}

function _rapierDrawSegmentPart(p, lo, hi) {
	if (p.length === 2) return [_rapierDrawInterpolatePoint(p[0], p[1], lo), _rapierDrawInterpolatePoint(p[0], p[1], hi)];
	const a = _rapierDrawQuadraticAt(p, lo), b = _rapierDrawQuadraticAt(p, hi), span = hi - lo;
	return [a, [a[0] + ((1 - lo) * (p[1][0] - p[0][0]) + lo * (p[2][0] - p[1][0])) * span,
		a[1] + ((1 - lo) * (p[1][1] - p[0][1]) + lo * (p[2][1] - p[1][1])) * span], b];
}

function _rapierDrawRouteSegments(points, curved, radius) {
	if (curved && points.length === 3) return [points];
	const out = [];
	let last = points[0];
	for (let i = 1; i < points.length; i++) {
		const p = points[i], before = points[i - 1], after = points[i + 1];
		const r = after ? Math.min(radius, _rapierDrawDist(before, p) / 2, _rapierDrawDist(p, after) / 2) : 0;
		if (r > .001) {
			const entry = _rapierDrawInterpolatePoint(p, before, r / _rapierDrawDist(before, p));
			const exit = _rapierDrawInterpolatePoint(p, after, r / _rapierDrawDist(p, after));
			if (_rapierDrawDist(last, entry) > 1e-8) out.push([last, entry]);
			out.push([entry, p, exit]); last = exit;
		} else if (_rapierDrawDist(last, p) > 1e-8) { out.push([last, p]); last = p; }
	}
	return out.length ? out : [[points[0], points.at(-1)]];
}

function _rapierDrawSegmentsPolyline(segments) {
	const out = segments.length ? [segments[0][0].slice()] : [];
	for (const p of segments) {
		const n = p.length === 2 ? 1 : Math.min(2048, Math.max(2, Math.ceil(Math.sqrt(Math.hypot(p[0][0] - 2 * p[1][0] + p[2][0], p[0][1] - 2 * p[1][1] + p[2][1]) / .6))));
		_rapierDrawWorkCount(out.length + n);
		for (let i = 1; i <= n; i++) out.push(p.length === 2 ? p[1].slice() : _rapierDrawQuadraticAt(p, i / n));
	}
	return out;
}

function _rapierDrawTrimSegments(segments, start, end) {
	let offset = 0;
	const total = segments.reduce((sum, p) => sum + _rapierDrawSegmentLength(p), 0), out = [];
	for (const p of segments) {
		const length = _rapierDrawSegmentLength(p), lo = Math.max(0, start - offset), hi = Math.min(length, total - end - offset);
		offset += length;
		if (hi <= lo || length < 1e-8) continue;
		const at = distance => {
			if (distance <= 0) return 0;
			if (distance >= length) return 1;
			if (p.length === 2) return distance / length;
			let a = 0, b = 1;
			for (let i = 0; i < 24; i++) { const mid = (a + b) / 2; if (_rapierDrawSegmentLength(p, mid) < distance) a = mid; else b = mid; }
			return (a + b) / 2;
		};
		out.push(_rapierDrawSegmentPart(p, at(lo), at(hi)));
	}
	return out;
}

function _rapierDrawCutSegments(segments, box) {
	if (!box) return segments.length ? [segments] : [];
	const runs = [];
	for (const p of segments) {
		const cuts = [0, 1];
		for (const axis of [0, 1]) for (const edge of axis ? [box.minY, box.maxY] : [box.minX, box.maxX]) {
			const a = p.length === 3 ? p[0][axis] - 2 * p[1][axis] + p[2][axis] : 0;
			const b = p.length === 3 ? 2 * (p[1][axis] - p[0][axis]) : p[1][axis] - p[0][axis], c = p[0][axis] - edge;
			if (Math.abs(a) < 1e-10) { if (Math.abs(b) > 1e-10) { const t = -c / b; if (t > 0 && t < 1) cuts.push(t); } }
			else {
				const disc = b * b - 4 * a * c;
				if (disc >= 0) for (const sign of [-1, 1]) { const t = (-b + sign * Math.sqrt(disc)) / (2 * a); if (t > 0 && t < 1) cuts.push(t); }
			}
		}
		cuts.sort((a, b) => a - b);
		for (let i = 1; i < cuts.length; i++) {
			const lo = cuts[i - 1], hi = cuts[i];
			if (hi - lo < 1e-9) continue;
			const mid = p.length === 3 ? _rapierDrawQuadraticAt(p, (lo + hi) / 2) : _rapierDrawInterpolatePoint(p[0], p[1], (lo + hi) / 2);
			if (mid[0] > box.minX && mid[0] < box.maxX && mid[1] > box.minY && mid[1] < box.maxY) continue;
			const part = _rapierDrawSegmentPart(p, lo, hi), last = runs.at(-1);
			if (last && _rapierDrawDist(last.at(-1).at(-1), part[0]) < 1e-7) last.push(part); else runs.push([part]);
		}
	}
	return runs;
}

function _rapierDrawSegmentsPathD(segments) {
	if (!segments.length) return '';
	let out = 'M' + segments[0][0].map(_rapierDrawFmt).join(' ');
	for (const p of segments) out += p.length === 3 ? 'Q' + p[1].map(_rapierDrawFmt).join(' ') + ' ' + p[2].map(_rapierDrawFmt).join(' ') : 'L' + p[1].map(_rapierDrawFmt).join(' ');
	return out;
}

function _rapierDrawArrowHitPolyline(shape, recipe) {
	const pts = _rapierDrawArrowRoutePoints(shape, recipe);
	return pts && _rapierDrawSegmentsPolyline(_rapierDrawRouteSegments(pts, shape.route === 'curved', shape.route === 'elbow' ? 6 : 0));
}

function _rapierDrawShapeMarkup(shape, recipe, renderOptions) {
	let body = '';

	const ink = _rapierDrawShapeInk(shape);
	const isLineKind = shape.recognized === 'line' || shape.recognized === 'arrow';
	const isArc = shape.recognized === 'arc';

	const paintsInk = _rapierDrawShapePaintsInk(shape, recipe);
	const parts = isLineKind && !paintsInk && shape.geom ? _rapierDrawArrowParts(shape, recipe) : null;
	const headEnd = parts?.headEnd, headStart = parts?.headStart;
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	const brushEligible = shape.brush && shape.brush !== 'ink' && (!paintsInk ? shape.recognized !== 'ink' : true);
	let brushed = null;
	if (brushEligible) {
		if (parts) brushed = parts.contours.map(points => _rapierDrawBrushMarkup({ ...shape, recognized: 'ink', stroke: 0, geom: null }, { ...recipe, strokes: [{ pts: points.map(p => p.concat(0)) }] }) || '').join('');
		else if (!paintsInk && RAPIER_DRAW_INK_LOOK_BRUSHES.has(shape.brush)) {
			const points = _rapierDrawShapePolyline({ ...shape, brush: 'ink' }, recipe);
			if (points?.length > 1) brushed = _rapierDrawBrushMarkup({ ...shape, recognized: 'ink', stroke: 0, geom: null }, { ...recipe, strokes: [{pts: points}] });
		}
		else brushed = _rapierDrawBrushMarkup(paintsInk && RAPIER_DRAW_INK_LOOK_BRUSHES.has(shape.brush) ? { ...shape, recognized: 'ink' } : shape, recipe);
	}
	if (brushed != null) {
		body = brushed;
	 } else if (paintsInk && shape.cut) {
		const cutWidth = _rapierDrawEffectiveWidth(shape);
		body = '<path d="' + _rapierDrawPolylinePathD(stroke.pts) + '" fill="none" stroke="' + ink + '" stroke-width="' + _rapierDrawFmt(cutWidth) + '" stroke-linecap="round" stroke-linejoin="round"' +
			_rapierDrawDashAttrs(_rapierDrawPerimeter(stroke.pts, false), cutWidth, shape.dash) + '/>';
	} else if (paintsInk) {

		const plan = _rapierDrawSmoothPlan(shape.smooth ?? recipe?.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT);
		const fitted = _rapierDrawFitStroke(stroke.pts, plan);

		if (fitted) {
			const b = fitted.bezier?.();
			body = '<path d="' + (b ? 'M' + b[0].map(_rapierDrawFmt).join(' ') + ' C' + b.slice(1).flat().map(_rapierDrawFmt).join(' ') + ' ' : _rapierDrawSmoothPathD(fitted.sample(48), false, true)) +
				'" fill="none" stroke="' + ink + '" stroke-width="6.4" stroke-linecap="round"/>';
		} else {
			const streamed = _rapierDrawStreamlineStroke(stroke.pts, plan.streamline);
			const settled = _rapierDrawRelaxStroke(streamed, plan.settle);
			const closed = plan.curve && _rapierDrawIsClosedStroke(settled);
			const simplified = plan.rdp > 0 && settled.length > 2
				? (closed ? _rapierDrawRDPClosed(settled, plan.rdp) : _rapierDrawRDP(settled, plan.rdp))
				: settled;
			if (closed) {
				const ring = simplified.length ? simplified.concat([simplified[0]]) : simplified;
				body = '<path d="' + _rapierDrawSmoothPathD(ring, true, plan.curve) +
					'" fill="none" stroke="' + ink + '" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>';
			} else {
				body = '<path d="' + _rapierDrawSmoothPathD(simplified, false, plan.curve) +
					'" fill="none" stroke="' + ink + '" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>';
			}
		}
	} else if (isLineKind) {
		const sw = _rapierDrawEffectiveWidth(shape, headStart || headEnd);
		body = parts.runs.map(run => '<path d="' + run.d + '" fill="none" stroke="' + ink + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" pathLength="' + _rapierDrawFmt(Math.max(.01, run.length)) + '"' +
			_rapierDrawDashAttrs(run.length, sw * _rapierDrawNibScale(shape, recipe), shape.dash) + '/>').join('');
	} else if (isArc) {
		const aw = _rapierDrawEffectiveWidth(shape);
		body = '<path d="' + _rapierDrawArcPathD(shape.geom) + '" fill="none" stroke="' + ink + '" stroke-width="' + _rapierDrawFmt(aw) + '" stroke-linecap="round"' + _rapierDrawDashAttrs(Math.abs(shape.geom.a1 - shape.geom.a0) * shape.geom.r, aw * _rapierDrawNibScale(shape, recipe), shape.dash) + '/>';
	} else if (shape.recognized === 'parabola') {
		const width = _rapierDrawEffectiveWidth(shape), length = _rapierDrawSegmentLength(shape.geom.p);
		body = '<path d="' + _rapierDrawSegmentsPathD([shape.geom.p]) + '" fill="none" stroke="' + ink + '" stroke-width="' + _rapierDrawFmt(width) + '" stroke-linecap="round"' + _rapierDrawDashAttrs(length, width * _rapierDrawNibScale(shape, recipe), shape.dash) + '/>';
	} else if (shape.recognized === 'paint') {
		body = _rapierDrawPaintMarkup(shape, recipe);
	} else if (shape.recognized === 'ornament') {
		body = _rapierDrawOrnamentMarkup(shape, recipe, ink);
	} else if (shape.recognized !== 'text') {
		const g = shape.geom, style = shape.style || 'outline', solid = style === 'solid';
		const border = shape.authorStyle?.stroke || shape.border, contours = RAPIER_DRAW_BOXES.has(shape.recognized) && _rapierDrawBoxContours(shape);
		const fillAttrs = solid && !border ? ('fill="' + ink + '" stroke="none"') : ('fill="' + (solid ? ink : 'none') + '" stroke="' + (solid ? _rapierDrawShapeInk({ ink: border }) : ink) + '" stroke-width="' + _rapierDrawFmt(_rapierDrawEffectiveWidth(shape)) + '"');
		if (contours) body = '<polygon points="' + contours.outline.map(p => _rapierDrawFmt(p[0]) + ',' + _rapierDrawFmt(p[1])).join(' ') + '" ' + fillAttrs + '/>';
		else if (shape.recognized === 'circle') body = '<circle cx="' + _rapierDrawFmt(g.cx) + '" cy="' + _rapierDrawFmt(g.cy) + '" r="' + _rapierDrawFmt(g.r) + '" ' + fillAttrs + '/>';
		else if (shape.recognized === 'ellipse') body = '<ellipse cx="' + _rapierDrawFmt(g.cx) + '" cy="' + _rapierDrawFmt(g.cy) + '" rx="' + _rapierDrawFmt(g.rx) + '" ry="' + _rapierDrawFmt(g.ry) +
			'" ' + (g.rot ? 'transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')" ' : '') + fillAttrs + '/>';
		else if (shape.recognized === 'rect' && g.p) body = '<polygon points="' + g.p.map(p => _rapierDrawFmt(p[0]) + ',' + _rapierDrawFmt(p[1])).join(' ') + '" ' + fillAttrs + '/>';
		else if (shape.recognized === 'rect') body = '<rect x="' + _rapierDrawFmt(g.cx - g.w / 2) + '" y="' + _rapierDrawFmt(g.cy - g.h / 2) + '" width="' + _rapierDrawFmt(g.w) + '" height="' + _rapierDrawFmt(g.h) +
			'" ' + (g.rot ? 'transform="rotate(' + _rapierDrawFmt(g.rot * 180 / Math.PI) + ' ' + _rapierDrawFmt(g.cx) + ' ' + _rapierDrawFmt(g.cy) + ')" ' : '') + fillAttrs + '/>';
		const poly = _rapierDrawShapePolygon(shape, recipe);
		if (!body && poly) body = '<polygon points="' + poly.map(p => _rapierDrawFmt(p[0]) + ',' + _rapierDrawFmt(p[1])).join(' ') + '" ' + fillAttrs + '/>';
		if (shape.dash && !solid) body = _rapierDrawDashedOutline(shape, recipe);
		if (poly && style === 'hatch') body += '<path d="' + _rapierDrawHatchPath(poly) + '" fill="none" stroke="' + ink + '" stroke-width="1.1"/>';
		if (poly && style === 'stipple') body += _rapierDrawStippleDots(shape, poly).map(([x, y]) => '<circle cx="' + _rapierDrawFmt(x) + '" cy="' + _rapierDrawFmt(y) + '" r="1.15" fill="' + ink + '" stroke="none"/>').join('');
		if (contours) for (const points of contours.marks) body += '<path data-box-mark="" d="' + _rapierDrawPolylinePathD(points) + '" fill="none" stroke="' + (border || (solid ? _rapierDrawOnInk(ink) : ink)) + '" stroke-width="' + _rapierDrawFmt(_rapierDrawEffectiveWidth(shape)) + '"/>';
	}

	if (headEnd) body += _rapierDrawArrowHeadMarkup(headEnd, ink);
	if (headStart) body += _rapierDrawArrowHeadMarkup(headStart, ink);

	if (shape.angle && !shape.asDrawn && shape.geom && (isLineKind || shape.recognized === 'triangle')) body += _rapierDrawAngleMarkup(shape).replaceAll(RAPIER_DRAW_INK, ink);

	if (shape.len && !shape.asDrawn && shape.geom && isLineKind) {
		const g = shape.geom, mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
		const ang = Math.atan2(g.y2 - g.y1, g.x2 - g.x1), nx = -Math.sin(ang), ny = Math.cos(ang);
		const lenPx = Math.round(Math.hypot(g.x2 - g.x1, g.y2 - g.y1));
		body += '<text x="' + _rapierDrawFmt(mx + nx * 12) + '" y="' + _rapierDrawFmt(my + ny * 12) + '" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" text-anchor="middle">' + lenPx + '</text>';
	}

	const scale = _rapierDrawNibScale(shape, recipe);
	if (scale !== 1) body = body.replace(/stroke-width="([\d.]+)"/g, (_, n) => 'stroke-width="' + _rapierDrawFmt(Number(n) * scale) + '"');
	if (ink !== RAPIER_DRAW_INK && !shape.border && !shape.authorStyle && !['cylinder', 'subroutine'].includes(shape.recognized)) body = body.replaceAll(RAPIER_DRAW_INK, ink);
	if (shape.label) { const label = (parts?.label || _rapierDrawTextLayout(shape, recipe)).markup; body += shape.authorStyle ? '<g data-author-label="">' + label + '</g>' : label; }
	if (shape.effect) {
		const scope = 'shape:' + shape.id, renditions = renderOptions?.renditions || currentRefractionRenditions(recipe);
		body = effectMarkup(shape.effect, body, _rapierDrawShapePaintedBBoxIn({ ...shape, effect: undefined }, recipe), scope, false, {...renderOptions, rendition: renditions.find(row => row.scope === scope)});
	}

	const multiply = shape.recognized === 'paint' && shape.paint?.mode === 'water' && recipe?.background?.kind === 'paper';
	return '<g data-shape-id="' + _rapierDrawEscapeAttr(shape.id) + '" data-brush="' + _rapierDrawEscapeAttr(shape.brush) + (shape.opacity != null ? '" opacity="' + _rapierDrawFmt(shape.opacity) : '') + (multiply ? '" style="mix-blend-mode:multiply' : '') + '">' + body + '</g>';
}

function _rapierDrawPaintMarkup(shape, recipe) {
	const frame = _rapierDrawShapePolygon(shape, recipe), px = shape.paint?.px;
	if (!frame || !shape.raster) return '';
	const w = px?.[0] || 1, h = px?.[1] || 1;
	const a = (frame[1][0] - frame[0][0]) / w, b = (frame[1][1] - frame[0][1]) / w, c = (frame[3][0] - frame[0][0]) / h, d = (frame[3][1] - frame[0][1]) / h;
	const matrix = [a, b, c, d, frame[0][0], frame[0][1]].map(n => (Math.round(n * 100000) / 100000).toString()).join(' ');
	return '<image data-rapier-paint="' + _rapierDrawEscapeAttr(shape.id) + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" transform="matrix(' + matrix + ')" href="' + shape.raster + '"/>';
}

function _rapierDrawOrnamentMarkup(shape, recipe, ink) {
	const frame = _rapierDrawShapePolygon(shape, recipe), piece = shape.ornament;
	if (!frame || !piece) return '';
	const a = (frame[1][0] - frame[0][0]) / piece.w, b = (frame[1][1] - frame[0][1]) / piece.w, c = (frame[3][0] - frame[0][0]) / piece.h, d = (frame[3][1] - frame[0][1]) / piece.h;
	const matrix = [a, b, c, d, frame[0][0], frame[0][1]].map(n => (Math.round(n * 100000) / 100000).toString()).join(' ');
	return '<g transform="matrix(' + matrix + ')" fill="' + ink + '" fill-rule="evenodd" stroke="none">' + (piece.layers || []).map(layer =>
		'<path fill-opacity="' + _rapierDrawFmt(layer.opacity / 255) + '" d="' + layer.d + '"/>').join('') + '<path d="' + piece.d + '"/></g>';
}

function _rapierDrawStripRasters(recipe) {
	recipe = stripRefractionRenditions(recipe);
	return recipe.shapes.some(shape => shape.raster) ? { ...recipe, shapes: recipe.shapes.map(shape => shape.raster ? { ...shape, raster: undefined } : shape) } : recipe;
}
function _rapierDrawRestorePaint(recipe, svg) {
	if (!recipe || !Array.isArray(recipe.shapes) || !recipe.shapes.some(shape => shape && shape.recognized === 'paint')) return recipe;
	if (recipe.shapes.some(shape => shape && shape.recognized === 'paint' && shape.raster != null)) throw Object.assign(new Error('The drawing contains paint outside its image resources.'), { code: 'drawing_restore_failed' });
	if (typeof svg !== 'string') return recipe;
	const rasters = new Map(), pattern = /<image\b((?:"[^"]*"|'[^']*'|[^<>"'])*)\/?>/g;
	for (let match; (match = pattern.exec(svg));) {
		const attrs = match[1], id = /\sdata-rapier-paint\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs), href = /\s(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs);
		if (!id || !href) continue;
		const key = id[1] ?? id[2], value = (href[1] ?? href[2]).replace(/&amp;/g, '&');
		if (rasters.has(key)) throw Object.assign(new Error('The drawing contains duplicate paint layers.'), { code: 'drawing_restore_failed' });
		rasters.set(key, value);
	}
	return { ...recipe, shapes: recipe.shapes.map(shape => shape && shape.recognized === 'paint' ? { ...shape, raster: rasters.get(shape.id) } : shape) };
}

const RAPIER_DRAW_VIEW_PAD = 8;

function _rapierDrawGrowPolygon(poly, pad) {
	if (!(pad > 0) || poly.length < 3) return poly;
	let area = 0;
	for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
	const direction = area < 0 ? -1 : 1;
	return poly.map((p, i) => {
		const prev = poly[(i + poly.length - 1) % poly.length], next = poly[(i + 1) % poly.length];
		const l0 = _rapierDrawDist(prev, p), l1 = _rapierDrawDist(p, next);
		if (!l0 || !l1) return p.slice();
		const ax = (p[1] - prev[1]) / l0 * direction, ay = (prev[0] - p[0]) / l0 * direction;
		const bx = (next[1] - p[1]) / l1 * direction, by = (p[0] - next[0]) / l1 * direction;
		const x = ax + bx, y = ay + by, factor = Math.min(pad / Math.max(.01, 1 + ax * bx + ay * by), pad * 4 / (Math.hypot(x, y) || 1));
		return [p[0] + x * factor, p[1] + y * factor];
	});
}

function _rapierDrawPaintPad(shape, recipe) {
	const extra = { spring: 13, rope: 4, tube: 18, ray: 10, light: 10, knot: 7, wood: 6, sketch: 8, hatched: 8 }[shape.brush] || 0;
	return Math.max(_rapierDrawStrokeHalf(shape, recipe), extra + 1.3 * _rapierDrawNibScale(shape, recipe));
}

function _rapierDrawShapeFilledOnly(shape) {
	return shape.recognized === 'text' && typeof shape.textFont === 'string' && shape.textFont.startsWith('letters:') && !shape.border && !shape.effect && !shape.textEffect && !shape.authorStyle?.stroke;
}

function _rapierDrawShapePaintedBBoxIn(shape, recipe) {
	const box = _rapierDrawShapeBBoxIn(shape, recipe);
	if (_rapierDrawShapeFilledOnly(shape)) return { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
	let minX = box.minX, minY = box.minY, maxX = box.maxX, maxY = box.maxY;
	const add = (b, pad = 0) => { if (!b) return; minX = Math.min(minX, b.minX - pad); minY = Math.min(minY, b.minY - pad); maxX = Math.max(maxX, b.maxX + pad); maxY = Math.max(maxY, b.maxY + pad); };
	add(box, _rapierDrawPaintPad(shape, recipe));
	if (shape.border || shape.authorStyle?.stroke) {
		const poly = _rapierDrawShapePolygon(shape, recipe);
		if (poly) add(_rapierDrawBBox(_rapierDrawGrowPolygon(poly, _rapierDrawStrokeHalf(shape, recipe))));
	}
	if (shape.geom && !_rapierDrawShapePaintsInk(shape, recipe) && (shape.recognized === 'arrow' || shape.recognized === 'line')) {
		const parts = _rapierDrawArrowParts(shape, recipe);
		for (const head of [parts.headStart, parts.headEnd]) if (head) add(_rapierDrawBBox(head.poly));
	}
	if (shape.angle) add(box, RAPIER_DRAW_ANGLE_R + 22);
	if (shape.len) add(box, 28);
	if (shape.label) { const laid = _rapierDrawTextLayout(shape, recipe); add(laid.bounds, 2); add(laid.reach, 2); }
	const bounds = { minX, minY, maxX, maxY };
	return shape.effect ? effectBounds(shape.effect, bounds) : bounds;
}

function _rapierDrawEffectFrame(recipe) {
	const ink = _rapierDrawUnionView({ ...recipe, effect: undefined });
	return { minX: Math.min(0, ink?.minX ?? 0), minY: Math.min(0, ink?.minY ?? 0), maxX: Math.max(recipe.canvas.w, ink?.maxX ?? 0), maxY: Math.max(recipe.canvas.h, ink?.maxY ?? 0) };
}
function _rapierDrawUnionView(recipe) {
	if (recipe.effect?.strength) return effectBounds(recipe.effect, _rapierDrawEffectFrame(recipe));
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const shape of recipe.shapes) {
		const box = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		minX = Math.min(minX, box.minX); minY = Math.min(minY, box.minY); maxX = Math.max(maxX, box.maxX); maxY = Math.max(maxY, box.maxY);
	}
	return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function _rapierDrawInkView(recipe, measured) {
	if (recipe.frame) return { x: recipe.frame.x, y: recipe.frame.y, w: recipe.frame.w, h: recipe.frame.h };
	if (recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength)) measured = null;
	const valid = measured && ['minX', 'minY', 'maxX', 'maxY'].every(k => Number.isFinite(measured[k])) && measured.maxX >= measured.minX && measured.maxY >= measured.minY;
	const box = valid ? { ...measured } : _rapierDrawUnionView(recipe);
	if (!box) return null;
	if (valid) for (const shape of recipe.shapes) if (shape.border || shape.authorStyle?.stroke) {
		const ink = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		box.minX = Math.min(box.minX, ink.minX); box.minY = Math.min(box.minY, ink.minY);
		box.maxX = Math.max(box.maxX, ink.maxX); box.maxY = Math.max(box.maxY, ink.maxY);
	}
	const capitalsOnly = recipe.shapes.length > 0 && recipe.shapes.every(_rapierDrawShapeFilledOnly);
	let pad = capitalsOnly ? 0 : RAPIER_DRAW_VIEW_PAD;
	if (valid && !capitalsOnly) for (const shape of recipe.shapes) pad = Math.max(pad, _rapierDrawStrokeHalf(shape, recipe) + 2);
	const x = Math.floor(box.minX - pad), y = Math.floor(box.minY - pad);
	return { x, y, w: Math.ceil(box.maxX + pad) - x, h: Math.ceil(box.maxY + pad) - y };
}

function _rapierDrawBuildSVG(input, measure, keepRasters = false, renderOptions) {
	const recipe = _rapierDrawAdmitRecipe(input, keepRasters);
	return recipe ? _rapierDrawSerializeSVG(recipe, measure, keepRasters, renderOptions) : '';
}

function _rapierDrawSceneWork(recipe) {
	let work = 0, text = 0, obstacles = 0, automatic = 0;
	for (const shape of recipe.shapes) {
		text += shape.label?.length || 0;
		const paintsInk = _rapierDrawShapePaintsInk(shape, recipe);
		if (!paintsInk && (['circle', 'ellipse', 'rect', 'triangle', 'text', 'paint', 'ornament'].includes(shape.recognized) || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized))) obstacles++;
		if (!paintsInk && (shape.recognized === 'arrow' || shape.recognized === 'line') && shape.route === 'auto') automatic++;
		const points = _rapierDrawShapeStroke(shape, recipe)?.pts;
		if (!points || !paintsInk) continue;
		const fit = !shape.cut && (shape.recognized !== 'ink' || !shape.brush || shape.brush === 'ink') && _rapierDrawSmoothLevel(shape.smooth ?? recipe.smooth) > 0;
		work += points.length * (fit ? 128 : 1);
	}
	_rapierDrawWorkCount(text, 262144);
	if (automatic) _rapierDrawWorkCount(obstacles, 96);
	_rapierDrawWorkCount(work + text * 8 + automatic * (obstacles * 2 + 8) ** 2 * 8, 4194304);
}

export function requiredRefractionScopes(recipe) {
	const active = e => e?.type === 'refraction' && e.strength && e.amount && e.bump && (e.amountX || e.amountY) && (e.red || e.blue);
	const scopes = [];
	for (let i = 0; i < recipe.shapes.length; i++) {
		const shape = recipe.shapes[i]; let count = 1;
		if (shape.recognized === 'paint' && shape.paint?.group && shape.effect) {
			while (i + 1 < recipe.shapes.length) {
				const next = recipe.shapes[i + 1];
				if (next.recognized !== 'paint' || next.paint?.group !== shape.paint.group || next.opacity !== shape.opacity || JSON.stringify(next.effect) !== JSON.stringify(shape.effect)) break;
				i++; count++;
			}
		}
		if (active(shape.effect)) scopes.push((count > 1 ? 'layer:' : 'shape:') + shape.id);
	}
	if (active(recipe.effect)) scopes.push('canvas');
	return scopes;
}

const RAPIER_DRAW_SCENE_BYTES = 16 * 1024 * 1024;
function _rapierDrawSceneMarkup(recipe, includeFonts = true, keepRasters = false, renderOptions = {}) {
	_rapierDrawSceneWork(recipe);
	renderOptions = {...renderOptions, renditions: currentRefractionRenditions(recipe)};
	let body = includeFonts ? fontDefs(recipe.fonts) : '';
	let work = body.length;
	_rapierDrawWorkCount(work, RAPIER_DRAW_SCENE_BYTES);
	for (let i = 0; i < recipe.shapes.length; i++) {
		const shape = recipe.shapes[i], pieces = [shape];
		if (shape.recognized === 'paint' && shape.paint?.group && shape.effect) {
			while (i + 1 < recipe.shapes.length) {
				const next = recipe.shapes[i + 1];
				if (next.recognized !== 'paint' || next.paint?.group !== shape.paint.group || next.opacity !== shape.opacity || JSON.stringify(next.effect) !== JSON.stringify(shape.effect)) break;
				pieces.push(next); i++;
			}
		}
		let markup;
		if (pieces.length > 1) {
			const source = { ...recipe, effect: undefined, shapes: pieces.map(piece => ({ ...piece, effect: undefined })) };
			const scope = 'layer:' + shape.id;
			markup = '<g data-rapier-effect-layer=""' + (shape.opacity != null ? ' opacity="' + _rapierDrawFmt(shape.opacity) + '"' : '') + '>' + effectMarkup(shape.effect, pieces.map(piece => _rapierDrawShapeMarkup({ ...piece, effect: undefined, opacity: undefined }, recipe)).join(''), _rapierDrawUnionView(source), scope, false, {...renderOptions, rendition: renderOptions.renditions.find(row => row.scope === scope)}) + '</g>';
		} else markup = _rapierDrawShapeMarkup(shape, recipe, renderOptions);
		const rendition = !renderOptions.sourceOnly && renderOptions.renditions.find(row => row.scope === (pieces.length > 1 ? 'layer:' : 'shape:') + shape.id);
		work += markup.length - (keepRasters && shape.recognized === 'paint' ? pieces.reduce((sum, piece) => sum + piece.raster.length, 0) : 0) - (rendition ? rendition.png.length + rendition.jxl.length : 0);
		_rapierDrawWorkCount(work, 16 * 1024 * 1024);
		body += markup;
	}
	return recipe.effect ? effectMarkup(recipe.effect, body, _rapierDrawEffectFrame(recipe), 'canvas', true, {...renderOptions, rendition: renderOptions.renditions.find(row => row.scope === 'canvas')}) : body;
}

function _rapierDrawBackgroundKey(recipe) {
	let h = 2166136261;
	for (const ch of JSON.stringify(recipe.background) + JSON.stringify(recipe.canvas)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return (h >>> 0).toString(36);
}
function _rapierDrawSerializeSVG(recipe, measure, keepRasters = false, renderOptions) {
	delete recipe.view;
	const body = _rapierDrawSceneMarkup(recipe, true, keepRasters, renderOptions);
	let measured = null;
	if (typeof measure === 'function') try { measured = measure(body, recipe.canvas.w, recipe.canvas.h); } catch (_) {}
	let view = _rapierDrawInkView(recipe, measured) || { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h };
	const paper = recipe.frame || { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h };
	if (recipe.background) {
		const x = Math.min(paper.x, view.x), y = Math.min(paper.y, view.y);
		view = { x, y, w: Math.max(paper.x + paper.w, view.x + view.w) - x, h: Math.max(paper.y + paper.h, view.y + view.h) - y };
	}
	recipe.view = view;
	const bgId = 'rapier-bg-' + _rapierDrawBackgroundKey(recipe);
	const background = !recipe.background ? '' : recipe.paper || recipe.background.kind === 'paper' ? backgroundSVG(recipe.background, paper, bgId, recipe.paper === 'black', renderOptions?.paperImage)
		: '<style>.' + bgId + '-d{display:none}@media (prefers-color-scheme:dark){.' + bgId + '-l{display:none}.' + bgId + '-d{display:inline}}</style>'
			+ '<g class="' + bgId + '-l">' + backgroundSVG(recipe.background, paper, bgId + '-l', false) + '</g>'
			+ '<g class="' + bgId + '-d">' + backgroundSVG(recipe.background, paper, bgId + '-d', true) + '</g>';
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [view.x, view.y, view.w, view.h].map(_rapierDrawFmt).join(' ') + '" width="' + _rapierDrawFmt(view.w) + '" height="' + _rapierDrawFmt(view.h) + '" color="' + RAPIER_DRAW_INK + '" role="img"><title>' + _rapierDrawEscapeXML(_rapierDrawTextAlternative(recipe)) + '</title><metadata id="rapier-draw">' + _rapierDrawEscapeXML(JSON.stringify(_rapierDrawStoredRecipe(_rapierDrawStripRasters(recipe.fonts?.length ? { ...recipe, fonts: fontMetadata(recipe.fonts) } : recipe)))) + '</metadata>' + _rapierDrawDiagramDark(body, recipe) + background + body + '</svg>';
}

function _rapierDrawStoredRecipe(recipe) {
	return { ...recipe, shapes: recipe.shapes.map(shape => {
		const { stroke, asDrawn, brush, style, ...rest } = shape;
		return { ...(stroke !== null ? { stroke } : {}), ...(asDrawn !== false ? { asDrawn } : {}), ...(brush !== 'ink' ? { brush } : {}), ...(style !== _rapierDrawDefaultStyle(shape.recognized) ? { style } : {}), ...rest };
	}) };
}

function _rapierDrawInterpolatePoint(a, b, t) {
	return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? (i === 3 ? .5 : 0)) + ((b[i] ?? (i === 3 ? .5 : 0)) - (a[i] ?? (i === 3 ? .5 : 0))) * t);
}

function _rapierDrawStrokeHalf(shape, recipe) {
	if (shape.recognized === 'paint' || shape.recognized === 'ornament') return 0;
	const nib = _rapierDrawShapeNib(shape, recipe);
	if (shape.cutWidth && (shape.cut || !_rapierDrawShapePaintsInk(shape, recipe))) return shape.cutWidth * nib / (2 * RAPIER_DRAW_NIB_DEFAULT);
	// paints (RAPIER_DRAW_SHAPE_WIDTH's own half, 1.3, falls out of this unchanged for a Shape-tool
	return shape.brush === 'brush' ? nib * .82 : _rapierDrawShapePaintsInk(shape, recipe) && !shape.cut ? nib * .72 : (_rapierDrawEffectiveWidth(shape) / 2) * nib / RAPIER_DRAW_NIB_DEFAULT;
}

function _rapierDrawShapePolyline(shape, recipe) {
	if (_rapierDrawShapePaintsInk(shape, recipe)) {
		const stroke = _rapierDrawShapeStroke(shape, recipe), pts = stroke.pts;
		if (shape.cut || shape.brush && shape.brush !== 'ink') return pts.map(p => p.slice());
		const plan = _rapierDrawSmoothPlan(shape.smooth ?? recipe.smooth);
		const fit = _rapierDrawFitStroke(pts, plan);
		if (fit) return fit.sample(96).map(p => p.concat(0));
		const streamed = _rapierDrawStreamlineStroke(pts, plan.streamline);
		const settled = _rapierDrawRelaxStroke(streamed, plan.settle), closed = plan.curve && _rapierDrawIsClosedStroke(settled);
		const line = plan.rdp > 0 && settled.length > 2 ? (closed ? _rapierDrawRDPClosed(settled, plan.rdp) : _rapierDrawRDP(settled, plan.rdp)) : settled;
		if (closed && line.length) line.push(line[0].slice());
		if (!plan.curve || line.length < 3) return line;
		const tangents = _rapierDrawTangents(line, closed), out = [line[0]];
		for (let i = 1; i < line.length; i++) {
			const a = line[i - 1], b = line[i], m = tangents[i - 1], n = tangents[i], count = Math.min(64, Math.max(2, Math.ceil(_rapierDrawDist(a, b) / 4)));
			_rapierDrawWorkCount(out.length + count);
			for (let k = 1; k <= count; k++) {
				const t = k / count, u = 1 - t, p = _rapierDrawInterpolatePoint(a, b, t);
				p[0] = u * u * u * a[0] + 3 * u * u * t * (a[0] + m[0]) + 3 * u * t * t * (b[0] - n[0]) + t * t * t * b[0];
				p[1] = u * u * u * a[1] + 3 * u * u * t * (a[1] + m[1]) + 3 * u * t * t * (b[1] - n[1]) + t * t * t * b[1];
				out.push(p);
			}
		}
		return out;
	}
	const g = shape.geom;
	if (!g) return null;
	if (shape.recognized === 'line' && shape.route !== 'auto') return [[g.x1, g.y1, 0], [g.x2, g.y2, 0]];
	if (shape.recognized === 'parabola') return _rapierDrawSegmentsPolyline([g.p]).map(p => p.concat(0));
	if (shape.recognized === 'arrow' || shape.recognized === 'line') return _rapierDrawArrowHitPolyline(shape, recipe).map(p => p.concat(0));
	if (shape.recognized === 'arc') return _rapierDrawArcPolyline(g, Math.min(2048, Math.max(32, Math.ceil(Math.abs(g.a1 - g.a0) * g.r / 4)))).map(p => p.concat(0));
	const poly = _rapierDrawShapePolygon(shape, recipe);
	return poly ? poly.concat([poly[0]]).map(p => p.concat(0)) : null;
}

const RAPIER_DRAW_NIB_MIN = 2, RAPIER_DRAW_NIB_MAX = 24, RAPIER_DRAW_NIB_DEFAULT = 9;

function _rapierDrawNibLevel(value) {
	const n = Math.round(Number(value));
	return Number.isFinite(n) ? _rapierDrawClamp(n, RAPIER_DRAW_NIB_MIN, RAPIER_DRAW_NIB_MAX) : RAPIER_DRAW_NIB_DEFAULT;
}

function _rapierDrawShapeNib(shape, recipe) { return _rapierDrawNibLevel(shape?.nib ?? recipe?.nib ?? RAPIER_DRAW_NIB_DEFAULT); }

function _rapierDrawNibScale(shape, recipe) { return _rapierDrawShapeNib(shape, recipe) / RAPIER_DRAW_NIB_DEFAULT; }

const _RAPIER_DRAW_GEOM_FIELDS = {
	circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['cx', 'cy', 'w', 'h'], paint: ['cx', 'cy', 'w', 'h'],
	line: ['x1', 'y1', 'x2', 'y2'], arrow: ['x1', 'y1', 'x2', 'y2'],

	arc: ['cx', 'cy', 'r', 'a0', 'a1'],
};

function _rapierDrawClampArcSweep(kind, geom) {
	if (kind !== 'arc' || !geom || typeof geom.a0 !== 'number' || typeof geom.a1 !== 'number' || !isFinite(geom.a0) || !isFinite(geom.a1)) return { kind, geom };
	if (Math.abs(geom.a1 - geom.a0) < RAPIER_DRAW_ARC_FULL_TURN) return { kind, geom };
	return { kind: 'circle', geom: { cx: geom.cx, cy: geom.cy, r: geom.r } };
}

function _rapierDrawFigurePoint(value) {
	if (Array.isArray(value) && value.length === 2 && value.every(_rapierDrawSpatial)) return [value[0], value[1]];
	if (value && typeof value === 'object' && _rapierDrawSpatial(value.x) && _rapierDrawSpatial(value.y)) return [value.x, value.y];
	return null;
}

function _rapierDrawFigureSeed(figure, index) { return _rapierDrawSeed(index + ':' + JSON.stringify(figure)); }

function _rapierDrawLayered(nodes, edges, across, gap, sibling = gap, compact = false) {
	const byId = new Map(nodes.map(node => [node.id, node])), next = new Map(nodes.map(node => [node.id, []]));
	for (const edge of edges) if (byId.has(edge.from) && byId.has(edge.to)) next.get(edge.from).push(edge);
	const state = new Map(), order = [], backward = new Set();
	const visit = id => {
		state.set(id, 1);
		for (const edge of next.get(id)) {
			if (state.get(edge.to) === 1) backward.add(edge);
			else if (!state.has(edge.to)) visit(edge.to);
		}
		state.set(id, 2); order.push(id);
	};
	const into = new Set(edges.filter(edge => byId.has(edge.from) && edge.from !== edge.to).map(edge => edge.to));
	for (const node of [...nodes.filter(node => !into.has(node.id)), ...nodes]) if (!state.has(node.id)) visit(node.id);
	const ranks = new Map(nodes.map(node => [node.id, 0]));
	for (const id of order.reverse()) for (const edge of next.get(id)) if (!backward.has(edge)) ranks.set(edge.to, Math.max(ranks.get(edge.to), ranks.get(id) + 1));
	const rows = [];
	for (const node of nodes) (rows[ranks.get(node.id)] ||= []).push(node);
	const initial = new Map(nodes.map((node, index) => [node.id, index]));
	for (let pass = 0; pass < 6; pass++) {
		const positions = new Map(rows.flatMap(row => row.map((node, index) => [node.id, index])));
		for (const row of pass % 2 ? rows.slice().reverse() : rows) {
			const score = node => {
				const related = edges.filter(edge => !backward.has(edge) && (pass % 2 ? edge.from === node.id : edge.to === node.id))
					.map(edge => positions.get(pass % 2 ? edge.to : edge.from)).filter(Number.isFinite);
				return related.length ? related.reduce((a, b) => a + b, 0) / related.length : positions.get(node.id);
			};
			row.sort((a, b) => score(a) - score(b) || initial.get(a.id) - initial.get(b.id));
			row.forEach((node, index) => positions.set(node.id, index));
		}
	}
	const breadth = node => across ? node.h : node.w, depth = node => across ? node.w : node.h;
	const widths = rows.map(row => row.reduce((sum, node) => sum + breadth(node), sibling * (row.length - 1))), wide = Math.max(0, ...widths);
	const at = new Map();
	rows.forEach((row, rank) => { let side = (wide - widths[rank]) / 2; for (const node of row) { at.set(node, side); side += breadth(node) + sibling; } });
	const centre = node => at.get(node) + breadth(node) / 2, rank = new Map(rows.flatMap((row, index) => row.map(node => [node, index])));
	const forward = edges.filter(edge => byId.has(edge.from) && byId.has(edge.to) && !backward.has(edge) && edge.from !== edge.to);
	const beyond = (from, to) => {
		if (from.shape?.recognized !== 'diamond') return 0;
		const out = forward.filter(edge => edge.from === from.id).map(edge => byId.get(edge.to)).sort((a, b) => centre(a) - centre(b));
		if (out.length < 2 || out.length > 3) return 0;
		const index = out.indexOf(to), reach = compact ? Math.max(breadth(from) / 2 + 12, (breadth(to) + sibling) / 2) : breadth(from) / 2 + 32 + breadth(to) / 2;
		return index === 0 ? -reach : index === out.length - 1 ? reach : 0;
	};
	const caption = new Map();
	for (const edge of edges) if (edge.shape?.label && byId.has(edge.from) && byId.has(edge.to) && rank.get(byId.get(edge.from)) === rank.get(byId.get(edge.to))) {
		const key = [edge.from, edge.to].sort().join(' '), room = layoutText({...edge.shape, labelPos: .5}, {path: across ? [[0, -512], [0, 512]] : [[-512, 0], [512, 0]]}).bounds;
		caption.set(key, Math.max(caption.get(key) || 0, Math.ceil(((across ? room.h : room.w) + 64) / 8) * 8));
	}
	const apart = (a, b) => Math.max(sibling, caption.get([a.id, b.id].sort().join(' ')) || 0);
	const place = (row, wanted) => {
		const left = [], right = [];
		row.forEach((node, i) => { left[i] = Math.max(wanted(node) - breadth(node) / 2, i ? left[i - 1] + breadth(row[i - 1]) + apart(row[i - 1], node) : -Infinity); });
		for (let i = row.length - 1; i >= 0; i--) right[i] = Math.min(wanted(row[i]) - breadth(row[i]) / 2, i + 1 < row.length ? right[i + 1] - apart(row[i], row[i + 1]) - breadth(row[i]) : Infinity);
		row.forEach((node, i) => at.set(node, (left[i] + right[i]) / 2));
	};
	const median = values => { const v = values.slice().sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
	for (const down of [true, false, true]) for (const row of down ? rows.slice(1) : rows.slice(0, -1).reverse()) place(row, node => {
		const links = forward.filter(edge => down ? edge.to === node.id && rank.get(byId.get(edge.from)) < rank.get(node) : edge.from === node.id && rank.get(byId.get(edge.to)) > rank.get(node));
		return links.length ? median(links.map(edge => down ? centre(byId.get(edge.from)) + beyond(byId.get(edge.from), node) : centre(byId.get(edge.to)) - beyond(node, byId.get(edge.to)))) : centre(node);
	});
	const least = Math.min(...nodes.map(node => at.get(node))), most = Math.max(...nodes.map(node => at.get(node) + breadth(node)));
	let cursor = 0;
	rows.forEach(row => {
		const high = Math.max(...row.map(depth));
		for (const node of row) { const side = at.get(node) - least; node.x = across ? cursor + (high - depth(node)) / 2 : side; node.y = across ? side : cursor + (high - depth(node)) / 2; }
		cursor += high + gap;
	});
	const span = nodes.length ? most - least : 0;
	return {w: across ? Math.max(0, cursor - gap) : span, h: across ? span : Math.max(0, cursor - gap), backward};
}

function _rapierDrawFigureGeometry(shape, x, y, w, h) {
	const cx = x + w / 2, cy = y + h / 2;
	shape.geom = shape.recognized === 'circle' ? {cx, cy, r: w / 2} : shape.recognized === 'ellipse' ? {cx, cy, rx: w / 2, ry: h / 2}
		: shape.recognized === 'triangle' ? {p: [[cx, y], [x, y + h], [x + w, y + h]]}
		: shape.recognized === 'text' ? {cx, cy, w: Math.max(16, w - 8)} : {cx, cy, w, h};
}

function _rapierDrawMeasureFigure(shape) {
	shape.textWrap = 'balance'; shape.textSize ||= 14;
	const natural = layoutText({...shape, recognized: 'text', geom: {cx: 0, cy: 0}});
	const lines = Math.sqrt(natural.measuredWidth / (3 * natural.measuredHeight));
	shape.labelWidth = Math.ceil(Math.max(72, Math.min(224, natural.measuredWidth / (shape.recognized === 'diamond' ? lines : Math.max(.75, Math.round(lines) - .25)))));
	const measured = layoutText({...shape, recognized: 'text', geom: {cx: 0, cy: 0, w: shape.labelWidth}});
	let w = Math.ceil(Math.max(112, measured.measuredWidth + (shape.step ? 52 : 44))), h = Math.ceil(Math.max(56, measured.height + 36));
	for (let pass = 0; pass < 5; pass++) {
		if (shape.recognized === 'circle') w = h = Math.max(w, h);
		_rapierDrawFigureGeometry(shape, 0, 0, w, h);
		if (shape.recognized === 'text') break;
		const laid = _rapierDrawTextLayout(shape, {shapes: [shape], strokes: []}), frame = laid.shapeFrame;
		const sx = Math.max(1, (Math.max(laid.width, measured.measuredWidth) + (shape.step ? 52 : 44)) / (frame.w * laid.fitScaleX)), sy = Math.max(1, ((laid.width + .5 >= measured.measuredWidth ? laid.height : measured.height) + 36 + (laid.stepBlock || 0)) / (frame.h * laid.fitScaleY));
		if (sx <= 1 && sy <= 1) break;
		w = Math.ceil(w * sx); h = Math.ceil(h * sy);
	}
	if (shape.recognized === 'circle') w = h = Math.max(w, h);
	return {id: shape.id, shape, w, h};
}

function _rapierDrawPlaceConnectorLabels(edges, scene, frames, paths, result, apply = true, memo = null) {
	const measured = shape => {
		const points = paths?.get(shape);
		let entry = points && memo?.routes.get(points);
		if (!entry) {
			const geometry = _rapierDrawArrowGeometry(shape, scene, points), pad = _rapierDrawStrokeHalf(shape, scene), heads = [];
			for (const head of [geometry.headStart, geometry.headEnd]) if (head) heads.push(grow(_rapierDrawBBox(head.poly), head.kind === 'arrow' ? pad : 0));
			for (const head of [geometry.headStart, geometry.headEnd]) if (head) heads.push(grow(_rapierDrawBBox([head.tip]), 12));
			entry = {geometry, segments: geometry.segments.map(segment => grow(_rapierDrawBBox(segment), pad)), heads, laid: new Map()};
			if (points && memo) memo.routes.set(points, entry);
		}
		return entry;
	};
	const layout = (shape, entry, position, beside) => {
		const key = position == null ? 'as-is' : position + (beside ? 'b' : '');
		let laid = entry.laid.get(key);
		if (!laid) entry.laid.set(key, laid = _rapierDrawTextLayout(position == null ? shape : {...shape, labelPos: position, labelBeside: beside || undefined}, scene, entry.geometry));
		return laid;
	};
	const grow = (box, pad) => ({minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad});
	const routes = new Map(edges.map(shape => [shape, measured(shape)])), labels = [];
	let ink = memo?.ink;
	if (!ink) {
		ink = [];
		for (const shape of scene.shapes) if (!routes.has(shape)) {
			const b = _rapierDrawShapeBBoxIn(shape, scene), pad = shape.recognized === 'text' ? 0 : _rapierDrawStrokeHalf(shape, scene);
			if (frames.includes(shape)) {
				for (const [a, c] of [[[b.minX, b.minY], [b.maxX, b.minY]], [[b.maxX, b.minY], [b.maxX, b.maxY]], [[b.maxX, b.maxY], [b.minX, b.maxY]], [[b.minX, b.maxY], [b.minX, b.minY]]]) ink.push(grow(_rapierDrawBBox([a, c]), pad));
			} else ink.push(grow(b, pad));
		}
		if (memo) memo.ink = ink;
	}
	for (const shape of edges) if (shape.label) {
		const entry = routes.get(shape), {geometry} = entry, path = geometry.samples, distances = [0], laid = layout(shape, entry, shape.labelPos ?? .5, false);
		for (let i = 1; i < path.length; i++) distances.push(distances.at(-1) + _rapierDrawDist(path[i - 1], path[i]));
		let natural = memo?.natural?.get(shape);
		if (!natural) { natural = layoutText({...shape, labelPos: .5}, {fonts: scene.fonts, path: [[0, -512], [0, 512]]}); if (memo) (memo.natural ||= new Map()).set(shape, natural); }
		const extents = laid => [laid.center.x - laid.bounds.minX, laid.bounds.maxX - laid.center.x, laid.center.y - laid.bounds.minY, laid.bounds.maxY - laid.center.y];
		const blocked = [...ink, ...labels];
		for (const [other, route] of routes) {
			if (other !== shape) blocked.push(...route.segments);
			blocked.push(...route.heads);
		}
		let best = null;
		if (shape.labelPos != null) {
			const label = layout(shape, entry, shape.labelPos, !!shape.labelBeside);
			const hits = box => label.bounds.minX < box.maxX + 8 - 1e-7 && label.bounds.maxX > box.minX - 8 + 1e-7 && label.bounds.minY < box.maxY + 8 - 1e-7 && label.bounds.maxY > box.minY - 8 + 1e-7;
			if (!blocked.some(hits)) { labels.push(label.bounds); continue; }
		}
		for (const beside of [false, true]) {
			if (best) break;
			for (const [index, segment] of geometry.segments.entries()) if (segment.length === 2) {
			const [a, b] = segment, dx = b[0] - a[0], dy = b[1] - a[1], length = _rapierDrawDist(a, b), upright = Math.abs(dx) < 1e-7;
			if (beside && !upright && Math.abs(dy) > 1e-7) continue;
			const [left, right, top, bottom] = extents(beside ? natural : laid), shift = beside ? upright ? [RAPIER_DRAW_BESIDE + left, 0] : [0, -RAPIER_DRAW_BESIDE - bottom] : [0, 0];
			const obstacles = blocked.concat(entry.segments.filter((_, i) => beside || i !== index));
			const extent = (Math.abs(dx) * Math.max(left, right) + Math.abs(dy) * Math.max(top, bottom)) / length + 8 + _rapierDrawStrokeHalf(shape, scene);
			let clear = [[extent / length, 1 - extent / length]].filter(([lo, hi]) => hi >= lo);
			const ax = a[0] + shift[0], ay = a[1] + shift[1];
			for (const box of obstacles) {
				let lo = 0, hi = 1;
				for (let axis = 0; axis < 2; axis++) {
					const v = axis ? ay : ax, d = axis ? dy : dx, min = axis ? box.minY - bottom - 8 : box.minX - right - 8, max = axis ? box.maxY + top + 8 : box.maxX + left + 8;
					if (Math.abs(d) < 1e-9) { if (v <= min + 1e-7 || v >= max - 1e-7) { hi = -1; break; } }
					else { const p = (min - v) / d, q = (max - v) / d; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)); }
				}
				if (hi <= lo) continue;
				clear = clear.flatMap(([start, end]) => hi <= start || lo >= end ? [[start, end]] : [[start, Math.min(end, lo)], [Math.max(start, hi), end]].filter(([l, h]) => h >= l));
				if (!clear.length) break;
			}
			for (const [lo, hi] of clear) {
				const room = (hi - lo) * length;
				if (best && room <= best.room) continue;
				const point = [a[0] + dx * (lo + hi) / 2, a[1] + dy * (lo + hi) / 2];
				let error = Infinity, at = 0;
				for (let i = 1; i < path.length; i++) {
					const near = _rapierDrawClosestOnSeg(point, path[i - 1], path[i]), distance = _rapierDrawDist(point, near);
					if (distance < error) { error = distance; at = distances[i - 1] + _rapierDrawDist(path[i - 1], near); }
				}
				best = {obstacles, room, fraction: distances.at(-1) ? at / distances.at(-1) : .5, point, beside, centre: [point[0] + shift[0], point[1] + shift[1]]};
			}
		}
		}
		if (!best) { if (result) result.failed = shape; return false; }
		if (apply) { shape.labelPos = best.fraction; if (best.beside) shape.labelBeside = true; else delete shape.labelBeside; }
		const label = layout(shape, entry, best.fraction, best.beside);
		if (Math.hypot(label.center.x - best.centre[0], label.center.y - best.centre[1]) > .01) { if (result) result.failed = shape; return false; }
		if (best.obstacles.some(b => label.bounds.minX < b.maxX + 8 - 1e-7 && label.bounds.maxX > b.minX - 8 + 1e-7 && label.bounds.minY < b.maxY + 8 - 1e-7 && label.bounds.maxY > b.minY - 8 + 1e-7)) { if (result) result.failed = shape; return false; }
		labels.push(label.bounds);
	}
	return true;
}

function _rapierDrawFigurePort(shape, scene, ax, ay) {
	if (shape.recognized !== 'triangle') return {ax, ay};
	const box = _rapierDrawShapeBBoxIn(shape, scene), point = _rapierDrawEdgeSnapPoint(box.minX + ax * box.w, box.minY + ay * box.h, shape, scene).point;
	const f = _rapierDrawAnchorFrame(shape, scene), x = point[0] - f.x, y = point[1] - f.y, det = f.ux * f.vy - f.uy * f.vx;
	return {ax: _rapierDrawClamp((x * f.vy - y * f.vx) / det, 0, 1), ay: _rapierDrawClamp((y * f.ux - x * f.uy) / det, 0, 1)};
}

function _rapierDrawFaceFigureBindings(edges, scene) {
	const targets = new Map(scene.shapes.map(shape => [shape.id, shape])), groups = new Map(), pending = new Set(edges);
	for (const edge of edges) for (const end of ['start', 'end']) {
		const bind = edge.bind?.[end], target = targets.get(bind?.to), frame = target && _rapierDrawAnchorFrame(target, scene);
		if (!frame) continue;
		const other = edge.bind?.[end === 'start' ? 'end' : 'start'], partner = targets.get(other?.to), box = partner && _rapierDrawShapeBBoxIn(partner, scene);
		const point = box ? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2] : end === 'start' ? [edge.geom.x2, edge.geom.y2] : [edge.geom.x1, edge.geom.y1];
		const x = point[0] - frame.x - (frame.ux + frame.vx) / 2, y = point[1] - frame.y - (frame.uy + frame.vy) / 2, det = frame.ux * frame.vy - frame.uy * frame.vx;
		const u = (x * frame.vy - y * frame.vx) / det, v = (y * frame.ux - x * frame.uy) / det;
		const axis = partner === target ? end === 'start' ? 0 : 1 : Math.abs(u) >= Math.abs(v) ? 0 : 1, side = partner === target || (axis ? v : u) >= 0 ? 1 : 0;
		const key = target.id + ':' + axis + ':' + side;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push({bind, target, axis, side, order: axis ? point[0] : point[1]});
	}
	for (const rows of groups.values()) {
		rows.sort((a, b) => a.order - b.order);
		const {target, axis, side} = rows[0], normal = axis ? 'ay' : 'ax', tangent = axis ? 'ax' : 'ay';
		const used = scene.shapes.filter(shape => !pending.has(shape)).flatMap(shape => Object.values(shape.bind || {}))
			.filter(bind => bind.to === target.id && bind[normal] === side).map(bind => bind[tangent]);
		for (const [index, row] of rows.entries()) {
			let fraction = (index + 1) / (rows.length + 1);
			if (used.some(at => Math.abs(at - fraction) < 1e-6)) {
				const stops = [0, ...used, 1].sort((a, b) => a - b);
				let widest = -1;
				for (let i = 1; i < stops.length; i++) if (stops[i] - stops[i - 1] > widest) { widest = stops[i] - stops[i - 1]; fraction = (stops[i] + stops[i - 1]) / 2; }
			}
			used.push(fraction);
			Object.assign(row.bind, _rapierDrawFigurePort(target, scene, axis ? fraction : side, axis ? side : fraction));
		}
	}
}

function _rapierDrawChooseReturnSides(edges, alternatives, scene) {
	const current = new Map(edges.map(shape => [shape, _rapierDrawArrowRoutePoints(shape, scene)]));
	for (const [shape, ports] of alternatives) {
		if (ports.length !== 2) continue;
		const others = edges.filter(other => other !== shape).map(other => current.get(other)), crossings = _rapierDrawRouteCrossings(current.get(shape), others);
		if (!crossings) continue;
		const before = ports.map(({bind}) => ({ax: bind.ax, ay: bind.ay}));
		ports.forEach(({bind, alternate}) => Object.assign(bind, alternate));
		_rapierDrawRerouteBoundArrows(scene);
		let after;
		try { after = _rapierDrawFindOrthogonalRoute(shape, scene, others); } catch (error) { if (error.code !== 'drawing_route_blocked') throw error; }
		if (after && _rapierDrawRouteCrossings(after, others) < crossings) current.set(shape, after);
		else { ports.forEach(({bind}, i) => Object.assign(bind, before[i])); _rapierDrawRerouteBoundArrows(scene); }
	}
}

function _rapierDrawLayoutFigures(shapes, automatic, groups, existing, direction, captionSize, compact) {
	const across = direction === 'across' || direction === 'back', reverse = direction === 'up' || direction === 'back', nodes = automatic.map(_rapierDrawMeasureFigure), nodeMap = new Map(nodes.map(node => [node.id, node]));
	const edges = shapes.filter(shape => shape.recognized === 'arrow' || shape.recognized === 'line')
		.filter(shape => nodeMap.has(shape.bind?.start?.to) || nodeMap.has(shape.bind?.end?.to));
	const links = edges.map(shape => ({from: shape.bind?.start?.to, to: shape.bind?.end?.to, shape}));
	for (const shape of edges) {
		shape.route = 'auto';
		shape.style ||= _rapierDrawDefaultStyle(shape.recognized);
		if (shape.label) { shape.textWrap = 'balance'; shape.labelWidth = 160; }
	}
	const fixed = [...existing, ...shapes.filter(shape => !nodeMap.has(shape.id) && !edges.includes(shape))];
	const scene = {version: RAPIER_DRAW_VERSION, canvas: {w: 4096, h: 4096}, strokes: [], shapes: [...existing, ...shapes]};
	const bottom = Math.max(0, ...fixed.filter(shape => !['line', 'arrow'].includes(shape.recognized)).map(shape => _rapierDrawShapeBBoxIn(shape, scene).maxY));
	const owner = new Map(), grouped = new Set();
	for (const group of groups) for (const id of group.members) { owner.set(id, group.id); grouped.add(id); }
	for (const {title} of groups) { Object.assign(title, {textFont: 'mono', textCase: 'upper', letterSpacing: .16, textSize: Math.max(11, captionSize)}); delete title.textBold; }
	const frameShapes = groups.flatMap(group => [group.rule, group.title]);
	scene.shapes = [...frameShapes, ...existing, ...shapes];
	const ladder = compact ? [6, 10, 15, 20, 30, 40, 60, 80] : [10, 15, 20, 30, 40, 60, 80];
	const spentAtStart = _RAPIER_DRAW_ROUTE_SPENT.work;
	for (const unitsGap of ladder) {
		if (unitsGap !== ladder.at(-1) && _RAPIER_DRAW_ROUTE_SPENT.work - spentAtStart > RAPIER_DRAW_LAYOUT_WORK) continue;
		scene.routeLabelRails = unitsGap === ladder.at(-1);
		const gap = 8 * unitsGap, units = nodes.filter(node => !grouped.has(node.id));
		for (const group of groups) {
			const words = links.filter(link => link.shape.label && group.members.includes(link.from) && group.members.includes(link.to) && link.from !== link.to)
				.map(link => Math.ceil((layoutText({...link.shape, labelPos: .5}, {path: [[-512, 0], [512, 0]]}).bounds.w + 64) / 8) * 8);
			const members = group.members.map(id => nodeMap.get(id)), inner = _rapierDrawLayered(members, links, true, Math.max(gap, ...words), Math.max(compact ? 32 : 64, gap / 2), compact);
			const title = layoutText(group.title), w = Math.max(inner.w + 64, title.bounds.w + 64), h = inner.h + title.bounds.h + 128;
			group.unit = {id: group.id, w, h}; units.push(group.unit);
			for (const node of members) { node.x += (w - inner.w) / 2; node.y += title.bounds.h + 96; }
		}
		_rapierDrawLayered(units, links.map(edge => ({from: owner.get(edge.from) || edge.from, to: owner.get(edge.to) || edge.to})).filter(edge => edge.from !== edge.to), across, gap, Math.max(compact ? 32 : 64, gap / 2), compact);
		const settled = new Set();
		for (const group of groups.slice().sort((a, b) => a.unit.y - b.unit.y || a.unit.x - b.unit.x)) {
			const members = group.members.map(id => nodeMap.get(id)), centre = node => (owner.get(node.id) ? groups.find(g => g.id === owner.get(node.id)).unit.x : 0) + node.x + node.w / 2;
			const outside = links.filter(link => nodeMap.has(link.from) && nodeMap.has(link.to) && [link.from, link.to].filter(id => owner.get(id) === group.id).length === 1
				&& [link.from, link.to].every(id => owner.get(id) === group.id || !owner.get(id) || settled.has(owner.get(id))));
			settled.add(group.id);
			const cost = () => outside.reduce((sum, link) => sum + Math.abs(centre(nodeMap.get(link.from)) - centre(nodeMap.get(link.to))), 0);
			const before = cost();
			for (const node of members) node.x = group.unit.w - node.x - node.w;
			if (cost() >= before) for (const node of members) node.x = group.unit.w - node.x - node.w;
		}
		for (const node of nodes) {
			const group = groups.find(group => group.id === owner.get(node.id)), x = node.x + (group?.unit.x || 0) + 40, y = node.y + (group?.unit.y || 0) + bottom + 40;
			_rapierDrawFigureGeometry(node.shape, x, y, node.w, node.h);
			if (group) node.shape.group = group.id;
		}
		const band = across && groups.length ? Math.min(...groups.map(group => group.unit.y)) : null;
		for (const group of groups) {
			const members = group.members.map(id => _rapierDrawShapeBBoxIn(nodeMap.get(id).shape, scene)), minX = Math.min(...members.map(b => b.minX)), maxX = Math.max(...members.map(b => b.maxX));
			const title = layoutText(group.title), top = (band ?? group.unit.y) + bottom + 68, y = Math.round(top - 10);
			group.title.geom = {cx: minX + title.width / 2, cy: top + title.height / 2};
			group.rule.geom = {x1: minX, y1: y, x2: maxX, y2: y};
		}
		const alternatives = new Map();
		for (const shape of edges) for (const end of ['start', 'end']) {
			const bind = shape.bind?.[end], target = bind && nodeMap.get(bind.to); if (!target) continue;
			const other = nodeMap.get(shape.bind?.[end === 'start' ? 'end' : 'start']?.to);
			const a = _rapierDrawShapeBBoxIn(target.shape, scene), b = other && _rapierDrawShapeBBoxIn(other.shape, scene);
			if (b && other !== target && (across ? Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) : Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)) > 0) {
				const toward = across ? b.minY + b.maxY > a.minY + a.maxY : b.minX + b.maxX > a.minX + a.maxX;
				bind.ax = across ? .5 : toward ? 1 : 0; bind.ay = across ? toward ? 1 : 0 : .5;
				Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay));
				continue;
			}
			if (!across && b && other !== target && owner.get(target.id) && owner.get(other.id) && owner.get(target.id) !== owner.get(other.id)) {
				const row = id => groups.find(g => g.id === owner.get(id)).members.map(m => _rapierDrawShapeBBoxIn(nodeMap.get(m).shape, scene));
				const mine = row(target.id), theirs = row(other.id), right = box => box.maxX, left = box => box.minX;
				const atEnd = (boxes, box, pick, most) => most === Math.max ? !boxes.some(c => c !== box && c.minX >= box.maxX - 1) : !boxes.some(c => c !== box && c.maxX <= box.minX + 1);
				const side = atEnd(mine, a, right, Math.max) && atEnd(theirs, b, right, Math.max) ? 1 : atEnd(mine, a, left, Math.min) && atEnd(theirs, b, left, Math.min) ? 0 : null;
				if (side != null && mine.length > 1 && theirs.length > 1) { bind.ax = side; bind.ay = .5; Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay)); continue; }
			}
			const forward = b && (end === 'start' ? across ? a.minX < b.minX : a.minY < b.minY : across ? b.minX < a.minX : b.minY < a.minY);
			const otherAxis = edge => {
				const peer = nodeMap.get(edge.bind?.[end === 'start' ? 'end' : 'start']?.to);
				if (!peer) return 0;
				const box = _rapierDrawShapeBBoxIn(peer.shape, scene); return across ? box.minY + box.maxY : box.minX + box.maxX;
			};
			const goes = edge => {
				const peer = nodeMap.get(edge.bind?.[end === 'start' ? 'end' : 'start']?.to); if (!peer) return false;
				const p = _rapierDrawShapeBBoxIn(peer.shape, scene);
				return end === 'start' ? across ? a.minX < p.minX : a.minY < p.minY : across ? p.minX < a.minX : p.minY < a.minY;
			};
			const siblings = edges.filter(edge => edge.bind?.[end]?.to === bind.to && (edge === shape || goes(edge) === !!forward)).sort((a, b) => otherAxis(a) - otherAxis(b)), index = siblings.indexOf(shape), fraction = (index + 1) / (siblings.length + 1);
			bind.ax = across ? forward ? end === 'start' ? 1 : 0 : fraction : forward ? fraction : 1;
			bind.ay = across ? forward ? fraction : 1 : forward ? end === 'start' ? 1 : 0 : fraction;
			if (forward && target.shape.recognized === 'diamond') {
				const flowX = across ? (end === 'start' ? 1 : 0) : .5, flowY = across ? .5 : (end === 'start' ? 1 : 0);
				const vertices = siblings.length === 1 ? [[flowX, flowY]] : siblings.length === 2
					? (across ? [[.5, 0], [.5, 1]] : [[0, .5], [1, .5]]) : across ? [[.5, 0], [flowX, flowY], [.5, 1]] : [[0, .5], [flowX, flowY], [1, .5]];
				const at = vertices[Math.min(index, vertices.length - 1)];
				bind.ax = at[0]; bind.ay = at[1];
			}
			if (!forward && other !== target) {
				const boxes = nodes.map(node => _rapierDrawShapeBBoxIn(node.shape, scene));
				const middle = across ? (Math.min(...boxes.map(b => b.minY)) + Math.max(...boxes.map(b => b.maxY))) / 2 : (Math.min(...boxes.map(b => b.minX)) + Math.max(...boxes.map(b => b.maxX))) / 2;
				const side = across ? (a.minY + a.maxY + (b ? b.minY + b.maxY : a.minY + a.maxY)) / 4 : (a.minX + a.maxX + (b ? b.minX + b.maxX : a.minX + a.maxX)) / 4;
				const positive = across && (target.shape.group || other?.shape.group) || side > middle;
				bind.ax = across ? .5 : positive ? 1 : 0; bind.ay = across ? positive ? 1 : 0 : .5;
				if (!alternatives.has(shape)) alternatives.set(shape, []);
				alternatives.get(shape).push({bind, alternate: _rapierDrawFigurePort(target.shape, scene, across ? .5 : 1 - bind.ax, across ? 1 - bind.ay : .5)});
			}
			if (other === target) { bind.ax = end === 'start' ? 1 : .5; bind.ay = end === 'start' ? ['rect', 'text'].includes(target.shape.recognized) ? .2 : .5 : 1; }
			Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay));
		}
		for (const shape of edges) {
			const from = nodeMap.get(shape.bind?.start?.to), to = nodeMap.get(shape.bind?.end?.to);
			if (!from || !to || from === to) continue;
			const a = _rapierDrawShapeBBoxIn(from.shape, scene), b = _rapierDrawShapeBBoxIn(to.shape, scene), lo = across ? 'minY' : 'minX', hi = across ? 'maxY' : 'maxX';
			if (across ? a.maxX > b.minX : a.maxY > b.minY) continue;
			const flowing = (bind, box) => across ? Math.abs(bind.ax - (bind === shape.bind.start ? 1 : 0)) < 1e-9 : Math.abs(bind.ay - (bind === shape.bind.start ? 1 : 0)) < 1e-9;
			if (!flowing(shape.bind.end, b) || from.shape.recognized !== 'diamond' && !flowing(shape.bind.start, a)) continue;
			if (!['rect', 'text'].includes(to.shape.recognized)) {
				const value = (b[lo] + b[hi]) / 2, span = a[hi] - a[lo];
				if (['rect', 'text'].includes(from.shape.recognized) && value >= a[lo] + .2 * span && value <= a[hi] - .2 * span) { if (across) shape.bind.start.ay = (value - a.minY) / span; else shape.bind.start.ax = (value - a.minX) / span; }
				continue;
			}
			const middle = box => [box[lo] + .2 * (box[hi] - box[lo]), box[hi] - .2 * (box[hi] - box[lo])], [q0, q1] = middle(b), centre = (b[lo] + b[hi]) / 2;
			const slide = (bind, box, value) => { if (across) bind.ay = (value - box.minY) / (box.maxY - box.minY); else bind.ax = (value - box.minX) / (box.maxX - box.minX); };
			if (from.shape.recognized === 'diamond') {
				const exit = _rapierDrawResolveBindAnchor(shape.bind.start, scene), flat = across ? exit[1] : exit[0], mid = (a[lo] + a[hi]) / 2;
				if (Math.abs(flat - mid) < 1) continue;
				const edge = flat < mid ? Math.min(q1, flat - 32) : Math.max(q0, flat + 32), value = flat < mid ? Math.min(centre, edge) : Math.max(centre, edge);
				if (value >= q0 && value <= q1) slide(shape.bind.end, b, value);
			} else if (['rect', 'text'].includes(from.shape.recognized)) {
				const [p0, p1] = middle(a), low = Math.max(p0, q0), high = Math.min(p1, q1);
				if (low > high) continue;
				const value = _rapierDrawClamp(centre, low, high);
				slide(shape.bind.start, a, value); slide(shape.bind.end, b, value);
			}
		}
		if (reverse) {
			const boxes = nodes.map(node => _rapierDrawShapeBBoxIn(node.shape, scene));
			const sum = across ? Math.min(...boxes.map(b => b.minX)) + Math.max(...boxes.map(b => b.maxX)) : Math.min(...boxes.map(b => b.minY)) + Math.max(...boxes.map(b => b.maxY));
			for (const [i, node] of nodes.entries()) { const b = boxes[i]; _rapierDrawFigureGeometry(node.shape, across ? sum - b.maxX : b.minX, across ? b.minY : sum - b.maxY, node.w, node.h); }
			for (const edge of edges) for (const bind of Object.values(edge.bind || {})) if (nodeMap.has(bind.to)) { if (across) bind.ax = 1 - bind.ax; else bind.ay = 1 - bind.ay; }
			for (const ports of alternatives.values()) for (const port of ports) { if (across) port.alternate.ax = 1 - port.alternate.ax; else port.alternate.ay = 1 - port.alternate.ay; }
			for (const group of groups) {
				const member = group.members.map(id => _rapierDrawShapeBBoxIn(nodeMap.get(id).shape, scene)), minX = Math.min(...member.map(b => b.minX)), maxX = Math.max(...member.map(b => b.maxX)), title = layoutText(group.title);
				const top = across ? group.title.geom.cy - title.height / 2 : Math.min(...member.map(b => b.minY)) - title.height - 68;
				group.title.geom = {cx: minX + title.width / 2, cy: top + title.height / 2}; group.rule.geom = {x1: minX, y1: top - 10, x2: maxX, y2: top - 10};
			}
			const minY = Math.min(...[...automatic, ...frameShapes].map(s => _rapierDrawShapeBBoxIn(s, scene).minY)), dy = Math.max(0, bottom + 40 - minY);
			if (dy) for (const shape of [...automatic, ...frameShapes]) {
				const g = shape.geom;
				if (g.p) g.p.forEach(p => { p[1] += dy; }); else if (g.cy != null) g.cy += dy; else { g.y1 += dy; g.y2 += dy; }
			}
		}
		_rapierDrawFaceFigureBindings(shapes.filter(shape => shape.bind && (!nodeMap.has(shape.bind.start?.to) || !nodeMap.has(shape.bind.end?.to))), scene);
		_rapierDrawRerouteBoundArrows(scene);
		try {
			_rapierDrawChooseReturnSides(edges, alternatives, scene);
			const result = {};
			if (_rapierDrawPlaceConnectorLabels(edges, scene, [], null, result)) { return [...frameShapes, ...shapes]; }
		}
		catch (error) { if (error.code !== 'drawing_route_blocked') throw error; }
	}
	_rapierDrawRouteBlocked();
}

function _rapierDrawDiagramDress(shapes, automatic, groups, captionSize) {
	const nodes = automatic.filter(shape => shape.recognized !== 'text'), ids = new Set(nodes.map(shape => shape.id));
	const connectors = shapes.filter(shape => (shape.recognized === 'arrow' || shape.recognized === 'line') && (ids.has(shape.bind?.start?.to) || ids.has(shape.bind?.end?.to)));
	const arrows = connectors.filter(shape => shape.recognized === 'arrow' && shape.bind?.start?.to !== shape.bind?.end?.to && ids.has(shape.bind?.start?.to) && ids.has(shape.bind?.end?.to));
	const next = new Map(nodes.map(node => [node.id, []])), state = new Map(), back = new Set();
	for (const arrow of arrows) next.get(arrow.bind.start.to).push(arrow);
	const visit = id => { state.set(id, 1); for (const arrow of next.get(id)) { const to = arrow.bind.end.to; if (state.get(to) === 1) back.add(arrow); else if (!state.has(to)) visit(to); } state.set(id, 2); };
	const into = new Set(arrows.map(arrow => arrow.bind.end.to));
	for (const node of [...nodes.filter(node => !into.has(node.id)), ...nodes]) if (!state.has(node.id)) visit(node.id);
	const forward = arrows.filter(arrow => !back.has(arrow)), starts = nodes.filter(node => !forward.some(arrow => arrow.bind.end.to === node.id));
	const ends = nodes.filter(node => arrows.some(arrow => arrow.bind.end.to === node.id) && !arrows.some(arrow => arrow.bind.start.to === node.id));
	const outcome = ends.length === 1 && ends[0].recognized !== 'diamond' ? ends[0] : null;
	for (const node of nodes) if (node.ink == null) {
		node.style = 'solid';
		node.ink = (node === outcome ? RAPIER_DRAW_DIAGRAM.accent : RAPIER_DRAW_DIAGRAM.box)[0];
	}
	for (const node of nodes) if (node.label && node.textBold == null) node.textBold = true;
	const caption = {textFont: 'mono', textCase: 'upper', letterSpacing: .12, textSize: captionSize};
	for (const connector of connectors) if (connector.label) Object.assign(connector, caption);
	const steps = forward.length > 0 && starts.length === 1 && ends.length <= 1 && !groups.length ? nodes.filter(node => node.recognized !== 'diamond' && node.label) : [];
	for (const node of steps) { node.step = 1; if (node.recognized === 'rect') node.labelAlign = 'start'; }
	return steps;
}

function _rapierDrawDiagramSet(shapes, steps, direction) {
	const across = direction === 'across' || direction === 'back', reverse = direction === 'up' || direction === 'back', scene = {shapes, strokes: []};
	const at = shape => { const b = _rapierDrawShapeBBoxIn(shape, scene); return across ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : [(b.minY + b.maxY) / 2, (b.minX + b.maxX) / 2]; };
	steps.slice().sort((a, b) => { const p = at(a), q = at(b); return Math.abs(p[0] - q[0]) > 1 ? (p[0] - q[0]) * (reverse ? -1 : 1) : p[1] - q[1]; }).forEach((shape, index) => { shape.step = index + 1; });
	return shapes;
}

function _rapierDrawLowerFiguresOrFault(figures, existing = [], direction = 'down', captionSize = 10, compact = false) {
	const INK = 'an ink name (green, red, blue, gold, purple) or #rrggbb';
	const fault = (figure, field, want) => ({ fault: { figure, field, want } });
	if (!Array.isArray(figures) || !figures.length || figures.length > 128) return fault(-1, 'figures', 'a list of 1 to 128 figures');
	if (!['down', 'across', 'up', 'back'].includes(direction)) return fault(-1, 'direction', 'down, across, up or back');
	const laysOut = figures.some(figure => figure && !['line', 'arrow', 'group'].includes(figure.kind) && ['x', 'y', 'w', 'h'].every(field => figure[field] == null));
	{
		const ids = new Set(existing.map(shape => shape.id));
		for (const [index, figure] of figures.entries()) if (figure?.id != null) {
			if (typeof figure.id !== 'string' || !_RAPIER_DRAW_ID.test(figure.id) || ids.has(figure.id)) return fault(index, 'id', 'a unique id using letters, numbers, underscore or hyphen');
			ids.add(figure.id);
		}
	}
	const byName = new Map(), byId = new Map();
	for (const shape of existing) {
		if (!shape || typeof shape !== 'object' || typeof shape.id !== 'string') continue;
		const g = shape.geom;
		const at = !g ? null : g.cx != null ? [g.cx, g.cy] : g.p ? [g.p.reduce((sum, p) => sum + p[0], 0) / g.p.length, g.p.reduce((sum, p) => sum + p[1], 0) / g.p.length]
			: g.x1 != null ? [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2] : null;
		if (at) byId.set(shape.id, at);
		if (typeof shape.label === 'string' && shape.label) byName.set(shape.label, shape.id);
	}
	let seq = 0;
	const reserved = new Set(figures.map(figure => figure?.id).filter(Boolean));
	const nextId = () => { let id; do { id = 'g' + (++seq); } while (byId.has(id) || reserved.has(id)); return id; };
	const boxes = [], lines = [], groupFigures = [], automatic = [];
	for (const [index, figure] of figures.entries()) {
		if (!figure || typeof figure !== 'object') return fault(index, 'figure', 'an object');
		if (figure.labelBeside != null) return fault(index, 'labelBeside', 'a caption position chosen by the router');
		if (typeof figure.kind !== 'string') return fault(index, 'kind', 'rect, ellipse, triangle, text, line or arrow (the field is kind, not type)');
		if (!['rect', 'ellipse', 'circle', 'triangle', 'diamond', 'hexagon', 'cylinder', 'subroutine', 'asymmetric', 'text', 'line', 'arrow', 'group'].includes(figure.kind)) return fault(index, 'kind', 'a supported drawing figure kind');
		if (figure.kind === 'group') { groupFigures.push([figure, index]); continue; }
		(figure.kind === 'arrow' || figure.kind === 'line' ? lines : boxes).push([figure, index]);
	}
	const shapes = [];
	for (const [figure, index] of boxes) {
		const kind = figure.kind;
		const id = typeof figure.id === 'string' && _RAPIER_DRAW_ID.test(figure.id) && !byId.has(figure.id) ? figure.id : nextId();
		const auto = ['x', 'y', 'w', 'h'].every(field => figure[field] == null);
		let shape;
		if (kind === 'text') {
			if (typeof figure.text !== 'string' || !figure.text) return fault(index, 'text', 'the words, a nonempty string');
			for (const field of ['x', 'y']) if (!auto && !_rapierDrawSpatial(figure[field])) return fault(index, field, 'a number within 65536, or omit all coordinates for layout');
			shape = { id, recognized: 'text', geom: { cx: auto ? 0 : figure.x, cy: auto ? 0 : figure.y }, label: figure.text };
			byId.set(id, [shape.geom.cx, shape.geom.cy]);
			if (!byName.has(figure.text)) byName.set(figure.text, id);
		} else {
			const { x, y, w, h } = auto ? {x: 0, y: 0, w: 96, h: 48} : figure;
			for (const field of ['x', 'y', 'w', 'h']) if (!auto && !_rapierDrawSpatial(figure[field])) return fault(index, field, 'a number within 65536 (x, y, w and h), or omit all coordinates for layout');
			if (w <= 0 || h <= 0) return fault(index, w <= 0 ? 'w' : 'h', 'a positive size');
			const cx = x + w / 2, cy = y + h / 2;
			if (kind === 'circle' && !auto && w !== h) return fault(index, 'w', 'equal width and height for a circle');
			const geom = kind === 'circle' ? { cx, cy, r: w / 2 } : kind === 'ellipse' ? { cx, cy, rx: w / 2, ry: h / 2 }
				: kind === 'triangle' ? { p: [[cx, y], [x, y + h], [x + w, y + h]] }
				: { cx, cy, w, h };
			shape = { id, recognized: kind, geom };
			if (figure.label != null) {
				if (typeof figure.label !== 'string' || !figure.label) return fault(index, 'label', 'the words inside the shape, a nonempty string');
				shape.label = figure.label; shape.labelIn = true;
			}
			byId.set(id, [cx, cy]);
		}
		const traits = _rapierDrawFigureTraits(figure, kind);
		if (!traits) return fault(index, 'figure', 'valid corner, flat and authorStyle attributes for this kind');
		Object.assign(shape, traits);
		if (figure.effect !== undefined) {
			const effect = admitEffect(fillEffect(figure.effect));
			if (!effect) return fault(index, 'effect', 'valid effect settings');
			shape.effect = effect;
		}
		if (shape.authorStyle?.fill) shape.style = 'solid';
		if (figure.fill != null) {
			const fill = _rapierDrawValidInk(figure.fill);
			if (!fill) return fault(index, 'fill', INK);
			shape.ink = figure.fill; shape.style = 'solid';
			if ((RAPIER_DRAW_INK_NAMES[fill] || fill) === RAPIER_DRAW_DIAGRAM.accent[0]) shape.authorInk = true;
		}
		else if (figure.stroke != null) { if (!_rapierDrawValidInk(figure.stroke)) return fault(index, 'stroke', INK); shape.ink = figure.stroke; }
		if (figure.border !== undefined) {
			const border = _rapierDrawValidInk(figure.border);
			if (!border) return fault(index, 'border', INK);
			if (!_rapierDrawBorderActive(shape)) return fault(index, 'border', 'a border only on a filled shape');
			shape.border = border;
		}
		if (kind !== 'text') shape.seed = _rapierDrawFigureSeed(figure, index);
		shapes.push(shape);
		if (auto) automatic.push(shape);
		if (typeof figure.label === 'string' && figure.label) byName.set(figure.label, id);
	}
	for (const [figure, index] of lines) {
		if (figure.border !== undefined) return fault(index, 'border', 'no border on a line or arrow (color sets its ink)');
		const id = typeof figure.id === 'string' && _RAPIER_DRAW_ID.test(figure.id) && !byId.has(figure.id) ? figure.id : nextId();
		const bind = {};
		const resolve = (value, end) => {
			const point = _rapierDrawFigurePoint(value);
			if (point) return point;
			if (typeof value !== 'string') return null;
			const target = laysOut && byId.has(value) ? value : byName.get(value) || (byId.has(value) ? value : null), at = target && byId.get(target);
			if (!at) return null;
			bind[end] = { to: target, ax: .5, ay: .5 };
			return at;
		};
		const from = resolve(figure.from, 'start'), to = resolve(figure.to, 'end');
		if (!from || !to) return fault(index, from ? 'to' : 'from', 'a point [x, y] or {x, y}, or the label or id of a figure to bind to');
		const shape = { id, recognized: figure.kind, geom: { x1: from[0], y1: from[1], x2: to[0], y2: to[1] }, seed: _rapierDrawFigureSeed(figure, index) };
		if (figure.color != null) { if (!_rapierDrawValidInk(figure.color)) return fault(index, 'color', INK); shape.ink = figure.color; }
		if (figure.label != null) { if (typeof figure.label !== 'string' || !figure.label) return fault(index, 'label', 'a nonempty connector label'); shape.label = figure.label; }
		if (figure.route != null) { if (!['straight', 'curved', 'elbow', 'auto'].includes(figure.route)) return fault(index, 'route', 'straight, curved, elbow or auto'); shape.route = figure.route; }
		if (figure.bend != null) { if (!_rapierDrawSpatial(figure.bend)) return fault(index, 'bend', 'a number within 65536'); shape.bend = figure.bend; }
		for (const key of ['headStart', 'headEnd']) if (figure[key] != null) { if (!RAPIER_DRAW_HEADS.includes(figure[key])) return fault(index, key, 'a supported connector head'); shape[key] = figure[key]; }
		if (figure.dash != null) { if (!['dashed', 'dotted'].includes(figure.dash)) return fault(index, 'dash', 'dashed or dotted'); shape.dash = figure.dash; }
		if (figure.nib != null) { if (!Number.isInteger(figure.nib) || figure.nib < RAPIER_DRAW_NIB_MIN || figure.nib > RAPIER_DRAW_NIB_MAX) return fault(index, 'nib', 'an integer from 2 to 24'); shape.nib = figure.nib; }
		if (bind.start || bind.end) shape.bind = bind;
		shapes.push(shape);
		byId.set(id, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
	}
	const groups = [], members = new Set(), autoIds = new Set(automatic.map(shape => shape.id));
	for (const [figure, index] of groupFigures) {
		if (typeof figure.title !== 'string' || !figure.title || figure.title.length > DRAW_TEXT_MAX) return fault(index, 'title', 'a nonempty group title');
		if (!Array.isArray(figure.members) || !figure.members.length) return fault(index, 'members', 'ids or labels of coordinate-free figures, each in one group');
		const ids = [];
		for (const name of figure.members) {
			const id = byId.has(name) ? name : byName.get(name);
			if (!autoIds.has(id) || members.has(id)) return fault(index, 'members', 'ids or labels of coordinate-free figures, each in one group');
			members.add(id); ids.push(id);
		}
		if (figure.id != null && (typeof figure.id !== 'string' || !_RAPIER_DRAW_ID.test(figure.id) || byId.has(figure.id))) return fault(index, 'id', 'a unique group id');
		const id = figure.id || nextId(); byId.set(id, [0, 0]);
		const titleId = nextId(); byId.set(titleId, [0, 0]);
		groups.push({id, members: ids, rule: {id, recognized: 'line', geom: {x1: 0, y1: 0, x2: 1, y2: 0}, style: 'plain', nib: 4, group: id},
			title: {id: titleId, recognized: 'text', geom: {cx: 0, cy: 0}, textSize: 14, textBold: true, textWrap: 'balance', labelWidth: 224, label: figure.title, group: id}});
	}
	if (automatic.length) {
		const steps = _rapierDrawDiagramDress(shapes, automatic, groups, captionSize);
		try { return {shapes: _rapierDrawDiagramSet(_rapierDrawLayoutFigures(shapes, automatic, groups, existing, direction, captionSize, compact), steps, direction)}; }
		catch (error) { if (/^drawing_(?:geometry_limit|work_limit|route_blocked)/.test(error.code || '')) return fault(-1, 'figures', 'a diagram within the drawing geometry and routing limits'); throw error; }
	}
	_rapierDrawFaceFigureBindings(shapes.filter(shape => shape.bind), {shapes: [...existing, ...shapes], strokes: []});
	return { shapes };
}
function _rapierDrawLowerFigures(figures, existing = [], direction = 'down', captionSize = 10, compact = false) { return _rapierDrawLowerFiguresOrFault(figures, existing, direction, captionSize, compact).shapes || null; }
function _rapierDrawFigureFault(figures, existing = [], direction = 'down') { return _rapierDrawLowerFiguresOrFault(figures, existing, direction).fault || null; }

function _rapierDrawRestoreSVGRecipe(raw, svg, restored) {
	const recipe = _rapierDrawAdmitRecipe(restoreRefractionRenditions(_rapierDrawRestorePaint(restoreFonts(restoreLetters(raw, svg, restored?.letter), svg), svg), svg));
	if (!recipe) throw new Error('Invalid drawing recipe');
	liquidStillsFromSVG(svg, restored?.still);
	return recipe;
}

function _rapierDrawReadRecipeFromSVGText(svg, restored) {
	const text = drawingSVGMetadata(svg);
	if (text == null) return null;
	try { return _rapierDrawRestoreSVGRecipe(JSON.parse(text), svg, restored); }
	catch (error) {
		throw Object.assign(new Error('Drawing could not be read: ' + String(error.message || error)), { code: 'drawing_restore_failed' });
	}
}

function _rapierDrawAgentCandidate(input) {
	if (input?.shapes?.some?.(shape => shape?.labelBeside != null)) return null;
	if (!input || typeof input !== 'object') return null;
	const { figures, version = RAPIER_DRAW_VERSION, ...rest } = input;
	const shapes = Array.isArray(rest.shapes) ? rest.shapes : Array.isArray(figures) ? _rapierDrawLowerFigures(figures, [], input.direction) : null;
	if (!Array.isArray(shapes) || !shapes.length || shapes.length > 128) return null;
	if (rest.background !== undefined) rest.background = fillBackground(rest.background);
	if (rest.effect !== undefined) rest.effect = fillEffect(rest.effect);
	return { ...rest, shapes: shapes.map(shape => shape?.effect === undefined ? shape : {...shape, effect: fillEffect(shape.effect)}), version, canvas: rest.canvas || { w: 4096, h: 4096 }, strokes: rest.strokes || [] };
}

function _rapierDrawNormalizeAgentRecipe(input) {
	const candidate = _rapierDrawAgentCandidate(input);
	const recipe = candidate && _rapierDrawAdmitRecipe(candidate);
	if (!recipe) return null;
	if (!input.canvas) {
		_rapierDrawSceneWork(recipe);
		const box = _rapierDrawUnionView(recipe);
		recipe.canvas = { w: Math.min(65536, Math.max(16, Math.ceil((box?.maxX || 280) + 40))), h: Math.min(65536, Math.max(16, Math.ceil((box?.maxY || 200) + 40))) };
	}
	return recipe;
}

function _rapierDrawApplyShapesPatch(recipe, patch, direction = 'down') {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
	if (!recipe || !Array.isArray(recipe.shapes)) return null;
	const dialed = patch.set == null ? recipe : _rapierDrawSetDials(recipe, patch.set);
	if (!dialed) return null;
	let shapes = recipe.shapes.slice();
	if (patch.remove != null) {
		if (!Array.isArray(patch.remove) || patch.remove.length > 128 || !patch.remove.every(id => typeof id === 'string')) return null;
		const removing = new Set(patch.remove);
		shapes = shapes.filter(shape => !removing.has(shape.id));
	}
	const replacements = new Map();
	if (patch.replace != null) {
		if (!Array.isArray(patch.replace) || patch.replace.length > 128) return null;
		for (const raw of patch.replace) {
			if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || (raw.labelBeside != null && typeof raw.kind === 'string') ||
				!shapes.some(shape => shape.id === raw.id) || replacements.has(raw.id) ||
				!(typeof raw.kind === 'string' || typeof raw.recognized === 'string')) return null;
			replacements.set(raw.id, raw);
		}
	}
	if (patch.add != null && (!Array.isArray(patch.add) || patch.add.length > 128)) return null;
	const used = new Set(shapes.flatMap(shape => [shape.id, shape.group].filter(Boolean)));
	for (const raw of patch.add || []) {
		if (!raw || typeof raw !== 'object' || (raw.labelBeside != null && typeof raw.kind === 'string') ||
			!(typeof raw.kind === 'string' || typeof raw.recognized === 'string')) return null;
		if (raw.id != null) {
			if (typeof raw.id !== 'string' || !_RAPIER_DRAW_ID.test(raw.id) || used.has(raw.id)) return null;
			used.add(raw.id);
		}
	}
	let seq = 0;
	const additions = (patch.add || []).map(raw => {
		if (raw.id != null) return raw;
		let id; do { id = 'g' + (++seq); } while (used.has(id));
		used.add(id); return { ...raw, id };
	});
	const staged = shapes.map(shape => replacements.get(shape.id) || shape).concat(additions);
	const figures = staged.filter(raw => typeof raw.kind === 'string');
	const native = staged.filter(raw => typeof raw.kind !== 'string');
	const lowered = figures.length ? _rapierDrawLowerFigures(figures, native, direction) : [];
	if (!lowered) return null;
	const byId = new Map(lowered.map(shape => [shape.id, shape]));
	shapes = [];
	for (const raw of staged) {
		if (typeof raw.kind !== 'string') shapes.push(raw);
		else if (byId.has(raw.id)) { shapes.push(byId.get(raw.id)); byId.delete(raw.id); }
	}
	shapes.push(...byId.values());
	if (patch.order != null) {
		if (!Array.isArray(patch.order) || !patch.order.every(id => typeof id === 'string') || new Set(patch.order).size !== patch.order.length) return null;
		const ordered = new Map(shapes.map(shape => [shape.id, shape]));
		if (patch.order.some(id => !ordered.has(id))) return null;
		shapes = patch.order.map(id => ordered.get(id)).concat(shapes.filter(shape => !patch.order.includes(shape.id)));
	}
	const candidate = { ...dialed, shapes };
	for (const key of RAPIER_DRAW_PATCH_CARRIED) {
		if (!Object.hasOwn(patch, key)) continue;
		if (patch[key] === null && key !== 'strokes') delete candidate[key]; else candidate[key] = patch[key];
	}
	const keptIds = new Set(shapes.map(shape => shape.id)), removed = new Map(recipe.shapes.filter(shape => !keptIds.has(shape.id)).map(shape => [shape.id, null]));
	if (removed.size) {
		candidate.shapes = shapes.map(shape => ({...shape}));
		remapRefractionRecipeSources(candidate, removed);
	}
	return candidate;
}

const RAPIER_DRAW_PATCH_DIALS = Object.freeze(['background', 'paper', 'effect', 'canvas', 'frame', 'light', 'smooth', 'nib']);
const RAPIER_DRAW_PATCH_CARRIED = Object.freeze(['strokes', 'fonts', 'angle', 'tool', 'view', 'renditions', 'backgrounds']);
function _rapierDrawSetDials(recipe, set) {
	if (!set || typeof set !== 'object' || Array.isArray(set) || set.canvas === null) return null;
	const next = { ...recipe };
	for (const key of RAPIER_DRAW_PATCH_DIALS) {
		if (!Object.hasOwn(set, key)) continue;
		if (key === 'background') _rapierDrawChangeBackground(next, set[key]);
		else if (set[key] === null) delete next[key];
		else next[key] = key === 'effect' ? fillEffect(set[key]) : set[key];
	}
	return next;
}
function _rapierDrawChangeBackground(recipe, sent) {
	const left = recipe.background, kept = { ...recipe.backgrounds };
	const wore = sent && typeof sent === 'object' && !Array.isArray(sent) && sent.kind !== left?.kind && Object.hasOwn(kept, sent.kind) ? kept[sent.kind] : null;
	const background = sent === null ? null : wore ? { ...wore, ...sent } : fillBackground(sent);
	if (left && left.kind !== background?.kind) kept[left.kind] = left;
	if (background) { recipe.background = background; delete kept[background.kind]; } else delete recipe.background;
	if (Object.keys(kept).length) recipe.backgrounds = kept; else delete recipe.backgrounds;
	return recipe;
}

export function _rapierDrawRecipeDelta(before, after) {
	const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
	const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
	if (!before || !after || !Array.isArray(before.shapes) || !Array.isArray(after.shapes)) return null;
	const prior = new Map(before.shapes.map(shape => [shape.id, shape])), next = new Map(after.shapes.map(shape => [shape.id, shape]));
	const add = after.shapes.filter(shape => !prior.has(shape.id));
	const replace = after.shapes.filter(shape => prior.has(shape.id) && !same(shape, prior.get(shape.id)));
	const remove = before.shapes.filter(shape => !next.has(shape.id)).map(shape => shape.id);
	const patch = { ...(add.length ? { add: copy(add) } : {}), ...(replace.length ? { replace: copy(replace) } : {}), ...(remove.length ? { remove } : {}) };
	const kept = before.shapes.filter(shape => next.has(shape.id)).map(shape => shape.id).concat(add.map(shape => shape.id));
	if (!same(kept, after.shapes.map(shape => shape.id))) patch.order = after.shapes.map(shape => shape.id);
	const set = {};
	for (const key of RAPIER_DRAW_PATCH_DIALS) if (!same(before[key], after[key])) set[key] = Object.hasOwn(after, key) ? copy(after[key]) : null;
	if (Object.keys(set).length) patch.set = set;
	for (const key of RAPIER_DRAW_PATCH_CARRIED) if (!same(before[key], after[key]) || key === 'backgrounds' && set.background !== undefined) patch[key] = Object.hasOwn(after, key) ? copy(after[key]) : null;
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (key === 'shapes' || key === 'version' || RAPIER_DRAW_PATCH_DIALS.includes(key) || RAPIER_DRAW_PATCH_CARRIED.includes(key)) continue;
		if (!same(before[key], after[key])) return null;
	}
	return patch;
}

function _rapierDrawBadKey(sent, start, admits) {
	if (!sent || typeof sent !== 'object' || Array.isArray(sent) || !start) return '';
	const probe = { ...start };
	for (const key of new Set([...Object.keys(start), ...Object.keys(sent)])) {
		if (Object.hasOwn(sent, key)) probe[key] = sent[key]; else delete probe[key];
		if (!admits(probe)) return '.' + key;
	}
	return '';
}
function _rapierDrawRecipeFault(input) {
	let candidate = _rapierDrawAgentCandidate(input);
	if (!candidate) return { field: !input || typeof input !== 'object' ? 'recipe' : Array.isArray(input.figures) && !Array.isArray(input.shapes) ? 'figures' : 'shapes' };
	const admits = recipe => !!_rapierDrawAdmitRecipe(recipe);
	if (admits(candidate)) return null;
	const sourceFault = refractionSourceFault(candidate);
	if (sourceFault) return sourceFault;
	candidate = remapRefractionRecipeSources({...candidate, shapes: candidate.shapes.map(shape => shape && typeof shape === 'object' ? {...shape} : shape)}, new Map(candidate.shapes.map(shape => [shape?.id, null])));
	let built = { version: RAPIER_DRAW_VERSION, canvas: { w: 1, h: 1 }, strokes: [], shapes: [] };
	for (const field of ['version', 'canvas', 'effect', 'background', 'fonts', 'strokes']) {
		if (candidate[field] === undefined) continue;
		built = { ...built, [field]: candidate[field] };
		if (admits(built)) continue;
		const sent = candidate[field];
		if (field === 'background') return { field: field + (BACKGROUND_KINDS.includes(sent?.kind) ? _rapierDrawBadKey(sent, backgroundStart(sent.kind), normalizeBackground) : sent && typeof sent === 'object' && !Array.isArray(sent) ? '.kind' : '') };
		if (field !== 'effect') return { field };
		const type = sent?.type ?? 'copier', start = effectPreset(type, sent?.preset, sent?.seed) || effectPreset(type);
		if (!start) return { field: field + '.type' };
		const key = _rapierDrawBadKey(sent, start, admitEffect).slice(1);
		return { field: field + (key ? '.' + (Object.hasOwn(sent, key) ? key : 'preset') : '') };
	}
	const shapes = candidate.shapes;
	let low = 1, high = shapes.length;
	while (low < high) { const mid = (low + high) >> 1; if (admits({ ...built, shapes: shapes.slice(0, mid) })) low = mid + 1; else high = mid; }
	const at = low - 1, shape = shapes[at], before = shapes.slice(0, at), path = 'shapes[' + at + ']';
	if (!shape || typeof shape !== 'object') return { field: path };
	const key = Object.keys(shape).find(name => !['id', 'recognized', 'geom'].includes(name) && admits({ ...built, shapes: before.concat(Object.fromEntries(Object.entries(shape).filter(([other]) => other !== name))) }));
	return { field: path + '.' + (key || (!_rapierDrawKnownKind(shape.recognized) ? 'recognized' : shape.recognized === 'ink' ? 'stroke' : shape.recognized === 'paint' ? 'raster' : 'geom')) };
}

export function _rapierDrawMergeAgentRecipe(live, before, after, options = null) {
	const same = (a, b) => {
		if (a === b) return true;
		if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
		const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
		return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
	};
	const shapeValue = (shape, recipe) => shape ? { ...shape, stroke: shape.stroke == null ? null : recipe.strokes[shape.stroke] } : null;
	const undo = options?.undo === true, paths = new Map();
	const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
	let act = null;
	const remember = (prior, next, path) => {
		if (same(prior, next)) return;
		if (object(prior) && object(next)) {
			for (const key of new Set([...Object.keys(prior), ...Object.keys(next)])) remember(prior[key], next[key], path.concat(key));
		} else {
			const key = JSON.stringify(path), rows = paths.get(key) || [];
			const targets = new Set(act?.sourceActIds || act?.sourceTransactionIds || (act?.sourceTransactionId ? [act.sourceTransactionId] : []));
			let from = prior, cancelled = false;
			for (let index = rows.length - 1; index >= 0 && targets.has(rows[index].id) && same(rows[index].next, from); index--) {
				from = rows[index].prior;
				if (same(from, next)) { rows.splice(index); cancelled = true; break; }
			}
			if (!cancelled) rows.push({id: act?.id, prior, next});
			paths.set(key, rows);
		}
	};
	for (const step of undo ? options.later || [] : []) {
		if (!step?.before || !step?.after) return null;
		act = step.act || null;
		const prior = new Map(step.before.shapes.map(shape => [shape.id, shapeValue(shape, step.before)]));
		const next = new Map(step.after.shapes.map(shape => [shape.id, shapeValue(shape, step.after)]));
		for (const id of new Set([...prior.keys(), ...next.keys()])) remember(prior.get(id), next.get(id), ['shape', id]);
		for (const key of new Set([...Object.keys(step.before), ...Object.keys(step.after)])) {
			if (!['version', 'shapes', 'strokes'].includes(key)) remember(step.before[key], step.after[key], ['meta', key]);
		}
		const shared = new Set([...prior.keys()].filter(id => next.has(id)));
		remember([...prior.keys()].filter(id => shared.has(id)), [...next.keys()].filter(id => shared.has(id)), ['order']);
	}
	const writes = new Set([...paths].filter(([, rows]) => rows.length).map(([key]) => key));
	const changedPaths = [...writes].map(key => JSON.parse(key)), laterOrder = writes.has('["order"]');
	const protectedAt = path => path.some((_, index) => writes.has(JSON.stringify(path.slice(0, index + 1))));
	const protectedBelow = path => changedPaths.some(other => path.every((part, index) => other[index] === part));
	const restore = (current, prior, target, path) => {
		if (same(prior, target) || protectedAt(path)) return current;
		if (same(current, prior) && !protectedBelow(path)) return target;
		if (object(current) && object(prior) && object(target)) {
			const out = {...current};
			for (const key of new Set([...Object.keys(prior), ...Object.keys(target)])) {
				const value = restore(current[key], prior[key], target[key], path.concat(key));
				if (value === undefined) delete out[key]; else out[key] = value;
			}
			return out;
		}
		return current;
	};
	const was = new Map(before.shapes.map(shape => [shape.id, shape]));
	const next = new Map(after.shapes.map(shape => [shape.id, shape]));
	const rows = new Map(live.shapes.map(shape => [shape.id, {shape, recipe: live}]));
	for (const id of new Set([...was.keys(), ...next.keys()])) {
		const prior = shapeValue(was.get(id), before), target = shapeValue(next.get(id), after);
		if (same(prior, target)) continue;
		const current = rows.get(id), value = current ? shapeValue(current.shape, current.recipe) : null;
		if (undo) {
			const restored = restore(value, prior, target, ['shape', id]);
			if (!restored) rows.delete(id);
			else rows.set(id, {shape: {...restored, stroke: restored.stroke == null ? null : 0}, recipe: {strokes: restored.stroke == null ? [] : [restored.stroke]}});
		} else {
			if (!same(value, prior) && !same(value, target)) return null;
			if (!target) rows.delete(id); else rows.set(id, {shape: next.get(id), recipe: after});
		}
	}
	if (undo) for (const {shape} of rows.values()) for (const anchor of Object.values(shape.bind || {})) {
		if (!rows.has(anchor.to)) {
			const bound = live.shapes.find(candidate => candidate.id === anchor.to);
			if (bound) rows.set(bound.id, {shape: bound, recipe: live});
		}
	}
	const out = { ...live, shapes: [], strokes: [] };
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (['version', 'shapes', 'strokes'].includes(key)) continue;
		const fallback = key === 'nib' ? RAPIER_DRAW_NIB_DEFAULT : key === 'smooth' ? RAPIER_DRAW_SMOOTH_DEFAULT : undefined;
		const prior = before[key] ?? fallback, target = after[key] ?? fallback, current = live[key] ?? fallback;
		if (same(prior, target)) continue;
		if (undo) {
			const value = restore(current, prior, target, ['meta', key]);
			if (value === undefined) delete out[key]; else out[key] = value;
		} else {
			if (!same(current, prior) && !same(current, target)) return null;
			if (after[key] === undefined) delete out[key]; else out[key] = after[key];
		}
	}
	const beforeOrder = before.shapes.map(shape => shape.id), afterOrder = after.shapes.map(shape => shape.id);
	const shared = new Set(beforeOrder.filter(id => next.has(id)));
	const oldShared = beforeOrder.filter(id => shared.has(id)), newShared = afterOrder.filter(id => shared.has(id));
	let order = live.shapes.map(shape => shape.id).filter(id => rows.has(id));
	if (!same(oldShared, newShared) && !laterOrder) {
		const current = order.filter(id => shared.has(id));
		let canOrder = same(current, oldShared.filter(id => rows.has(id))) || same(current, newShared.filter(id => rows.has(id)));
		if (!canOrder && !undo) return null;
		const agent = newShared.filter(id => rows.has(id)), own = order.filter(id => !shared.has(id) && !next.has(id)), anchored = new Map();
		for (const id of own) {
			const below = order.slice(0, order.indexOf(id)).filter(other => shared.has(other)), prefix = new Set(agent.slice(0, below.length));
			if (!below.every(other => prefix.has(other))) { if (!undo) return null; canOrder = false; }
			const key = below.length ? agent[below.length - 1] : '';
			if (!anchored.has(key)) anchored.set(key, []);
			anchored.get(key).push(id);
		}
		if (canOrder) order = (anchored.get('') || []).concat(afterOrder.filter(id => rows.has(id)).flatMap(id => [id, ...(anchored.get(id) || [])]));
	}
	const placed = new Set(order), intended = new Map(afterOrder.map((id, index) => [id, index]));
	for (const id of afterOrder) {
		if (!rows.has(id) || placed.has(id)) continue;
		let lower = 0, upper = order.length;
		for (let at = 0; at < order.length; at++) {
			const anchor = intended.get(order[at]);
			if (anchor < intended.get(id)) lower = Math.max(lower, at + 1);
			else if (anchor > intended.get(id)) upper = Math.min(upper, at);
		}
		if (lower > upper) { if (!undo) return null; upper = lower; }
		order.splice(upper, 0, id); placed.add(id);
	}
	for (const id of order) {
		const {shape, recipe} = rows.get(id), copy = {...shape};
		if (copy.stroke != null) { const stroke = recipe.strokes[copy.stroke]; if (!stroke) return null; copy.stroke = out.strokes.length; out.strokes.push(stroke); }
		out.shapes.push(copy);
	}
	return _rapierDrawAdmitRecipe(out);
}

export function _rapierDrawUndoRecipe(live, before, after, later = []) {
	return _rapierDrawMergeAgentRecipe(live, after, before, {undo: true, later});
}

function _rapierDrawTestBudget(name, fallback) {
	const value = typeof globalThis !== 'undefined' ? globalThis[name] : null;
	return Number.isInteger(value) && value > 0 ? value : fallback;
}
const _rapierDrawKnownKind = kind => ['ink', 'circle', 'ellipse', 'triangle', 'line', 'arrow', 'arc', 'parabola', 'text', 'paint', 'ornament'].includes(kind) || Object.hasOwn(RAPIER_DRAW_POLYGONS, kind) || RAPIER_DRAW_BOXES.has(kind);
export function refractionSourceFault(recipe, sourceCounts) {
	const shapes = Array.isArray(recipe?.shapes) ? recipe.shapes : [];
	const counts = sourceCounts || new Map();
	if (!sourceCounts) for (const shape of shapes) if (typeof shape?.id === 'string') counts.set(shape.id, (counts.get(shape.id) || 0) + 1);
	for (const [effect, field] of [[recipe?.effect, 'effect'], ...shapes.map((shape, i) => [shape?.effect, 'shapes[' + i + '].effect'])])
		for (const {key, id} of refractionSourceReferences(effect)) if (counts.get(id) !== 1) return {field: field + '.' + key};
	return null;
}
export function refractionSourceShapes(recipe, choice) {
	if (choice === 'source' || choice === 'none') return [];
	const reference = refractionSourceReferences({type: 'refraction', lens: choice})[0];
	if (!reference || !Array.isArray(recipe?.shapes)) return null;
	const matches = recipe.shapes.filter(shape => shape.id === reference.id);
	if (matches.length !== 1) return null;
	const shape = matches[0];
	return shape.recognized === 'paint' && shape.paint?.group
		? recipe.shapes.filter(row => row.recognized === 'paint' && row.paint?.group === shape.paint.group) : [shape];
}
function _rapierDrawAdmitRecipe(input, keepRasters = false) {
	const shapeBudget = _rapierDrawTestBudget('__rapierDrawTestMaxShapes', 2048), strokeBudget = _rapierDrawTestBudget('__rapierDrawTestMaxStrokes', 2048);
	if (!input || typeof input !== 'object' || input.version !== RAPIER_DRAW_VERSION || !Array.isArray(input.shapes) || !Array.isArray(input.strokes) || input.shapes.length > shapeBudget || input.strokes.length > strokeBudget) return null;
	const finite = n => typeof n === 'number' && Number.isFinite(n), spatial = _rapierDrawSpatial;
	const canvas = input.canvas;
	if (!canvas || !finite(canvas.w) || !finite(canvas.h) || canvas.w <= 0 || canvas.h <= 0 || canvas.w > 65536 || canvas.h > 65536) return null;
	const out = { version: RAPIER_DRAW_VERSION, canvas: { w: canvas.w, h: canvas.h }, strokes: [], shapes: [] };
	if (input.effect !== undefined) { const effect = admitEffect(input.effect); if (!effect) return null; out.effect = effect; }
	for (const key of ['smooth', 'nib']) if (finite(input[key])) out[key] = key === 'smooth' ? _rapierDrawSmoothLevel(input[key]) : _rapierDrawNibLevel(input[key]);
	if (typeof input.tool === 'string' && /^(select|brush|pen|paint|water|shape|text|erase|effects)$/.test(input.tool)) out.tool = input.tool;
	if (finite(input.light)) out.light = input.light % (Math.PI * 2);
	if (finite(input.angle)) { const angle = ((input.angle % 360) + 360) % 360; if (angle) out.angle = angle; }
	if (input.paper === 'white' || input.paper === 'black') out.paper = input.paper;
	if (input.background !== undefined) { const background = normalizeBackground(input.background); if (!background) return null; out.background = background; }
	if (input.backgrounds && typeof input.backgrounds === 'object' && !Array.isArray(input.backgrounds)) {
		const kept = {};
		for (const kind of BACKGROUND_KINDS) if (Object.hasOwn(input.backgrounds, kind)) { const background = normalizeBackground(input.backgrounds[kind]); if (background?.kind === kind) kept[kind] = background; }
		if (Object.keys(kept).length) out.backgrounds = kept;
	}
	if (input.view && ['x', 'y', 'w', 'h'].every(k => spatial(input.view[k])) && input.view.w > 0 && input.view.h > 0) out.view = { x: input.view.x, y: input.view.y, w: input.view.w, h: input.view.h };
	if (input.frame && ['x', 'y', 'w', 'h'].every(k => spatial(input.frame[k])) && input.frame.w >= 1 && input.frame.h >= 1 && input.frame.w <= 65536 && input.frame.h <= 65536) out.frame = { x: Math.round(input.frame.x), y: Math.round(input.frame.y), w: Math.round(input.frame.w), h: Math.round(input.frame.h) };
	const reserved = new Set(input.shapes.map(s => typeof s?.id === 'string' && _RAPIER_DRAW_ID.test(s.id) ? s.id : '').filter(Boolean));
	const ids = new Set(), sourceIds = new Map(), duplicates = new Set();
	let seq = 0, points = 0, textUnits = 0, rasterUnits = 0, ornamentUnits = 0;
	for (const raw of input.shapes) {
		if (!raw || typeof raw !== 'object') return null;
		let id = typeof raw.id === 'string' && _RAPIER_DRAW_ID.test(raw.id) ? raw.id : '';
		if (id && ids.has(id)) duplicates.add(id);
		if (!id || ids.has(id)) { do { id = 's' + (++seq); } while (reserved.has(id) || ids.has(id)); }
		ids.add(id);
		if (typeof raw.id === 'string' && !sourceIds.has(raw.id)) sourceIds.set(raw.id, id);
		let kind = raw.recognized, geom = null;
		const polygon = Object.hasOwn(RAPIER_DRAW_POLYGONS, kind), frame = RAPIER_DRAW_BOXES.has(kind) || kind === 'paint' || kind === 'ornament' || polygon;
		if (!_rapierDrawKnownKind(kind)) return null;
		if (kind !== 'ink') {
			const g = raw.geom;
			if (!g || typeof g !== 'object') return null;
			if (kind === 'triangle' || kind === 'parabola' || frame && g.p) {
				if (!Array.isArray(g.p) || g.p.length !== (kind === 'triangle' || kind === 'parabola' ? 3 : 4) || !g.p.every(p => Array.isArray(p) && p.length === 2 && p.every(spatial))) return null;
				geom = { p: g.p.map(p => p.slice()) };
				if ((polygon || kind === 'paint' || kind === 'ornament' || kind !== 'rect' && RAPIER_DRAW_BOXES.has(kind) || raw.corner) && g.p.some((p, i) => i === 2 && (Math.abs(p[0] - g.p[1][0] - g.p[3][0] + g.p[0][0]) > .01 || Math.abs(p[1] - g.p[1][1] - g.p[3][1] + g.p[0][1]) > .01))) return null;
			} else {
				geom = {};
				for (const key of frame ? ['cx', 'cy', 'w', 'h'] : kind === 'text' ? ['cx', 'cy'] : _RAPIER_DRAW_GEOM_FIELDS[kind]) {
					if (!spatial(g[key]) || /^(?:r|rx|ry|w|h)$/.test(key) && g[key] <= 0) return null;
					geom[key] = g[key];
				}
				if (kind === 'text' && g.w != null) { if (!spatial(g.w) || g.w < 0) return null; if (g.w) geom.w = g.w; }
				if (kind === 'circle' || frame || kind === 'ellipse' || kind === 'text') { if (g.rot != null && !finite(g.rot)) return null; if (g.rot) geom.rot = g.rot % (Math.PI * 2); }
			}
			if (g.points != null) { if (kind !== 'star' || ![5, 6].includes(g.points)) return null; if (g.points === 6) geom.points = 6; }
			if (kind === 'star' && g.inner != null) { if (!finite(g.inner) || g.inner < .15 || g.inner > .75) return null; geom.inner = g.inner; }
			({ kind, geom } = _rapierDrawClampArcSweep(kind, geom));
		}
		let stroke = null;
		if ((kind === 'text' || kind === 'paint' || kind === 'ornament') && raw.stroke != null) return null;
		if (raw.stroke != null) {
			if (!Number.isInteger(raw.stroke) || raw.stroke < 0 || !input.strokes[raw.stroke]) return null;
			const pts = input.strokes[raw.stroke].pts;
			if (!Array.isArray(pts) || pts.length < 2 || pts.length > 16384 || (points += pts.length) > 262144 || !pts.every(p => Array.isArray(p) && p.length >= 2 && p.length <= 4 && spatial(p[0]) && spatial(p[1]) && (p.length < 3 || finite(p[2]) && p[2] >= 0) && (p.length < 4 || finite(p[3]) && p[3] >= 0 && p[3] <= 1))) return null;
			stroke = out.strokes.length;
			out.strokes.push({ pts: pts.map(p => [p[0], p[1], p[2] || 0].concat(p.length > 3 ? [p[3]] : [])) });
		}
		if (kind === 'ink' && stroke === null) return null;
		const line = kind === 'line' || kind === 'arrow';
		const styles = _rapierDrawStylesFor(kind), brushes = _rapierDrawBrushesFor(kind, stroke !== null);
		if (raw.brush != null && !brushes.includes(raw.brush)) return null;
		const shape = { id, stroke, recognized: kind, asDrawn: stroke !== null && (kind === 'ink' || raw.asDrawn === true),
			brush: raw.brush || 'ink', style: styles.includes(raw.style) ? raw.style : _rapierDrawDefaultStyle(kind), geom };
		const traits = _rapierDrawFigureTraits(raw, kind);
		if (!traits || traits.authorStyle?.fill && shape.style !== 'solid') return null;
		Object.assign(shape, traits);
		if (raw.effect !== undefined) { const effect = admitEffect(raw.effect); if (!effect) return null; shape.effect = effect; }
		if (kind !== 'rect' && RAPIER_DRAW_BOXES.has(kind) || shape.corner) {
			const p = geom.p || _rapierDrawRectPolygon(geom.cx, geom.cy, geom.w, geom.h, geom.rot || 0);
			if (Math.abs((p[1][0] - p[0][0]) * (p[3][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[3][0] - p[0][0])) < 1e-8) return null;
		}
		if (Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff) shape.seed = raw.seed;
		if (shape.brush === 'brush' && stroke !== null) for (const end of ['cutStart', 'cutEnd']) if (raw[end] === true) shape[end] = true;
		const ink = _rapierDrawValidInk(raw.ink);
		if (ink) shape.ink = ink;
		if (raw.authorInk === true && shape.ink === RAPIER_DRAW_DIAGRAM.accent[0]) shape.authorInk = true;
		if (raw.border !== undefined) {
			const border = _rapierDrawValidInk(raw.border);
			if (!border || !_rapierDrawBorderActive(shape)) return null;
			shape.border = border;
		}
		if (kind === 'ornament') {
			const piece = raw.ornament, side = n => Number.isInteger(n) && n >= 1 && n <= 524288;
			if (!piece || typeof piece !== 'object' || !side(piece.w) || !side(piece.h) || !ornamentPath(piece.d, 1000000) || (ornamentUnits += piece.d.length) > 4000000) return null;
			shape.ornament = { d: piece.d, w: piece.w, h: piece.h };
			if (piece.layers != null) {
				if (!Array.isArray(piece.layers) || !piece.layers.length || piece.layers.length > 8) return null;
				for (const layer of piece.layers) if (!layer || !Number.isInteger(layer.opacity) || layer.opacity < 1 || layer.opacity > 254 || !ornamentPath(layer.d, 1000000) || (ornamentUnits += layer.d.length) > 4000000) return null;
				shape.ornament.layers = piece.layers.map(layer => ({ d: layer.d, opacity: layer.opacity }));
			}
		} else if (raw.ornament != null) return null;
		if (kind === 'paint') {
			const raster = _rapierDrawRasterInfo(raw.raster, keepRasters ? Infinity : RAPIER_DRAW_RASTER_MAX);
			if (!raster || !keepRasters && (rasterUnits += raw.raster.length) > RAPIER_DRAW_RASTER_TOTAL) return null;
			shape.raster = raw.raster;
			const paint = raw.paint;
			if (paint != null) {
				if (typeof paint !== 'object' || Array.isArray(paint)) return null;
				const record = {};
				if (paint.mode != null) { if (paint.mode !== 'water' || !waterPaperById(paint.paper)) return null; record.mode = 'water'; record.paper = paint.paper; }
				if (paint.actions != null) { const actions = admitWaterActions(paint.actions); if (record.mode !== 'water' || !actions) return null; record.actions = actions; }
				if (paint.brush != null) { if (typeof paint.brush !== 'string' || paint.brush.length > 96) return null; record.brush = paint.brush; }
				if (paint.px != null) { const side = paint.strokes != null ? 2048 : 16384; if (!Array.isArray(paint.px) || paint.px.length !== 2 || !paint.px.every(n => Number.isInteger(n) && n > 0 && n <= side) || paint.px[0] !== raster.width || paint.px[1] !== raster.height) return null; record.px = paint.px.slice(); }
				if (paint.scale != null) { if (!finite(paint.scale) || paint.scale <= 0 || paint.scale > 16) return null; record.scale = paint.scale; }
				if (paint.group != null) { if (typeof paint.group !== 'string' || !_RAPIER_DRAW_ID.test(paint.group)) return null; record.group = paint.group; }
				if (paint.strokes != null) {
					const strokes = _rapierDrawAgentStrokes(paint.strokes);
					if (!strokes || !record.px || !record.scale) return null;
					const gw = record.px[0] / record.scale, gh = record.px[1] / record.scale;
					for (const s of strokes) for (const p of s.points) if (p[0] < -1 || p[1] < -1 || p[0] > gw + 1 || p[1] > gh + 1) return null;
					record.strokes = strokes;
				}
				if (paint.seed != null) { if (!Number.isInteger(paint.seed) || paint.seed < 0 || paint.seed > 0x7fffffff) return null; record.seed = paint.seed; }
				if (paint.replay != null) {
					const replay = admitPaintReplay(paint.replay, value => _rapierDrawValidRaster(value, keepRasters ? Infinity : RAPIER_DRAW_RASTER_MAX));
					if (!replay || !record.px || !keepRasters && (rasterUnits += JSON.stringify(replay).length) > RAPIER_DRAW_RASTER_TOTAL) return null;
					record.replay = replay;
				}
				if (record.mode === 'water' && (!record.px || !record.scale || record.strokes)) return null;
				if (record.replay?.mode === 'water' && record.mode !== 'water') return null;
				if (Object.keys(record).length) shape.paint = record;
			}
		} else if (raw.raster != null) return null;
		for (const key of ['smooth', 'nib']) if (finite(raw[key])) shape[key] = key === 'smooth' ? _rapierDrawSmoothLevel(raw[key]) : _rapierDrawNibLevel(raw[key]);
		const text = admitText(raw, kind);
		if (!text) return null;
		if ((textUnits += text.label?.length || 0) > 262144) return null;
		Object.assign(shape, text);
		if (raw.group != null) { if (typeof raw.group !== 'string' || !_RAPIER_DRAW_ID.test(raw.group)) return null; shape.group = raw.group; }
		if (raw.locked != null && typeof raw.locked !== 'boolean') return null;
		if (raw.locked) shape.locked = true;
		if (raw.labelGrow != null) {
			const m = raw.labelGrow;
			if (line || kind === 'arc' || kind === 'parabola' || kind === 'ink' || kind === 'text' || kind === 'paint' || kind === 'ornament' || !Array.isArray(m) || m.length !== 6 || !m.every(n => finite(n) && Math.abs(n) <= 1e12)) return null;
			const d = m[0] * m[3] - m[1] * m[2];
			if (!d || ![m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d].every(n => finite(n) && Math.abs(n) <= 1e12)) return null;
			shape.labelGrow = m.slice();
		}
		if (raw.angle === true && (line || kind === 'triangle')) shape.angle = true;
		if (raw.len === true && line) shape.len = true;
		if (raw.cut === true && kind === 'ink') shape.cut = true;
		if (raw.cutWidth != null) { if (!(kind === 'ink' && shape.cut || line) || !finite(raw.cutWidth) || raw.cutWidth <= 0 || raw.cutWidth > 64) return null; shape.cutWidth = raw.cutWidth; }
		if (raw.dash === 'dashed' || raw.dash === 'dotted') shape.dash = raw.dash;
		if (raw.opacity != null) { if (!finite(raw.opacity) || raw.opacity < .05 || raw.opacity > 1) return null; if (raw.opacity < 1) shape.opacity = raw.opacity; }
		if (line) for (const key of ['headStart', 'headEnd']) {
			if (raw[key] == null) continue;
			if (!RAPIER_DRAW_HEADS.includes(raw[key])) return null;
			shape[key] = raw[key];
		}
		if (line) for (const key of ['trimStart', 'trimEnd']) {
			if (raw[key] == null) continue;
			if (!spatial(raw[key]) || raw[key] < 0) return null;
			shape[key] = raw[key];
		}
		if (line) {
			if (raw.route != null && !['straight', 'curved', 'elbow', 'auto'].includes(raw.route)) return null;
			if (raw.route && raw.route !== 'straight') shape.route = raw.route;
			if (raw.bend != null) { if (!spatial(raw.bend)) return null; shape.bend = raw.bend; }
			if (raw.curveT != null) { if (!spatial(raw.curveT)) return null; if (raw.curveT !== .5) shape.curveT = raw.curveT; }
			if (finite(raw.elbow)) shape.elbow = _rapierDrawClamp(raw.elbow, 0, 1);
		}
		if (line && raw.bind && typeof raw.bind === 'object') {
			const bind = {};
			for (const end of ['start', 'end']) {
				const a = raw.bind[end];
				if (a && typeof a.to === 'string' && finite(a.ax) && finite(a.ay) && a.ax >= 0 && a.ax <= 1 && a.ay >= 0 && a.ay <= 1) bind[end] = { to: a.to, ax: a.ax, ay: a.ay };
			}
			if (bind.start || bind.end) shape.bind = bind;
		}
		out.shapes.push(shape);
	}
	if (refractionSourceFault(out, new Map([...sourceIds.keys()].map(id => [id, duplicates.has(id) ? 2 : 1])))) return null;
	for (const shape of out.shapes) if (shape.bind) {
		for (const end of ['start', 'end']) {
			const a = shape.bind[end], to = a && sourceIds.get(a.to);
			if (!a) continue;
			if (!to || duplicates.has(a.to) || to === shape.id) delete shape.bind[end]; else a.to = to;
		}
		if (!shape.bind.start && !shape.bind.end) delete shape.bind;
	}
	const groupCount = new Map();
	for (const shape of out.shapes) if (shape.group) groupCount.set(shape.group, (groupCount.get(shape.group) || 0) + 1);
	for (const shape of out.shapes) if (shape.group && groupCount.get(shape.group) < 2) delete shape.group;
	try {
		const fonts = admitFonts(input.fonts, new Set(out.shapes.map(shape => shape.textFont).filter(id => id?.startsWith('f'))));
		if (fonts.length) out.fonts = fonts;
		_rapierDrawWorkCount(fonts.reduce((bytes, font) => bytes + font.data.length + 256, 0), RAPIER_DRAW_SCENE_BYTES);
		_rapierDrawSceneWork(out);
		_rapierDrawRerouteBoundArrows(out);
		for (const shape of out.shapes) {
			if ((shape.recognized === 'arrow' || shape.recognized === 'line' && shape.route === 'auto') && !_rapierDrawShapePaintsInk(shape, out)) _rapierDrawArrowRoutePoints(shape, out);
			if (shape.recognized === 'text' || shape.label) _rapierDrawTextLayout(shape, out);
		}
	} catch (error) { if (/^drawing_(?:geometry_limit|work_limit|route_blocked|font_)/.test(error.code || '')) return null; throw error; }
	if (input.renditions !== undefined) {
		const renditions = admitRefractionRenditions(input.renditions);
		if (!renditions) return null;
		const key = refractionRecipeKey(out), current = renditions.filter(row => row.key === key), scopes = requiredRefractionScopes(out);
		if (current.some(row => !scopes.includes(row.scope))) return null;
		if (hasRefraction(out) && current.length) out.renditions = current;
	}
	return out;
}

function _rapierDrawTextFrame(shape, recipe) {
	if (shape.recognized === 'text') return null;
	if (['cylinder', 'subroutine', 'asymmetric'].includes(shape.recognized)) return _rapierDrawTextFrame({recognized: 'rect', geom: {p: _rapierDrawBoxContours(shape).textFrame}}, recipe);
	const poly = _rapierDrawShapePolygon(shape, recipe);
	if (!poly) return null;
	const g = shape.geom;
	const area = poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
	let rot = g.rot || 0, cx = g.cx, cy = g.cy, w = (g.r ?? g.rx) * 2 || g.w, h = (g.r ?? g.ry) * 2 || g.h;
	if (g.p) {
		const u = shape.recognized === 'triangle' ? [g.p[1][0] - g.p[2][0], g.p[1][1] - g.p[2][1]] : [g.p[1][0] - g.p[0][0], g.p[1][1] - g.p[0][1]];
		rot = Math.atan2(u[1], u[0]);
		if (area < 0) { if (rot > Math.PI / 2) rot -= Math.PI; else if (rot < -Math.PI / 2) rot += Math.PI; }
		const cs = Math.cos(rot), sn = Math.sin(rot), local = g.p.map(p => [p[0] * cs + p[1] * sn, -p[0] * sn + p[1] * cs]);
		const b = _rapierDrawBBox(local), x = (b.minX + b.maxX) / 2, y = (b.minY + b.maxY) / 2;
		cx = x * cs - y * sn; cy = x * sn + y * cs; w = b.w; h = b.h;
	}
	const cs = Math.cos(rot), sn = Math.sin(rot), sign = area < 0 ? -1 : 1;
	let scale = 1;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i], b = poly[(i + 1) % poly.length], nx = (a[1] - b[1]) * sign, ny = (b[0] - a[0]) * sign;
		const den = Math.abs(nx * cs + ny * sn) * w / 2 + Math.abs(ny * cs - nx * sn) * h / 2;
		if (den > 1e-8) scale = Math.min(scale, ((cx - a[0]) * nx + (cy - a[1]) * ny) / den);
	}
	return { cx, cy, w, h, rot, ux: cs, uy: sn, vx: -sn, vy: cs, fitScaleX: Math.max(0, scale), fitScaleY: Math.max(0, scale) };
}

function _rapierDrawTextLayout(shape, recipe, arrowGeometry) {
	const fill = shape.labelIn && shape.style === 'solid' && shape.recognized !== 'text' && (!shape.brush || shape.brush === 'ink') ? _rapierDrawShapeInk(shape) : null;
	const g = shape.geom || {}, context = { fonts: recipe?.fonts, color: shape.authorStyle?.color || (fill ? _rapierDrawOnInk(fill) : _rapierDrawShapeInk(shape)),
		stepColor: shape.authorStyle?.color || (shape.authorStyle?.fill ? _rapierDrawOnInk(fill) : !fill || fill === RAPIER_DRAW_DIAGRAM.box[0] ? RAPIER_DRAW_DIAGRAM.step[0] : _rapierDrawOnInk(fill)) };
	const shapeFrame = _rapierDrawTextFrame(shape, recipe), fitScaleX = shapeFrame?.fitScaleX ?? 1, fitScaleY = shapeFrame?.fitScaleY ?? 1;
	if (shape.recognized !== 'text') {
		context.box = arrowGeometry ? _rapierDrawRouteBBoxFromPoints(arrowGeometry.pts, shape.route === 'curved') : _rapierDrawShapeBBoxIn(shape, recipe);
		if ((shape.recognized === 'arrow' || shape.recognized === 'line') && !_rapierDrawShapePaintsInk(shape, recipe)) {
			const route = arrowGeometry || _rapierDrawArrowGeometry(shape, recipe);
			context.path = route.samples;
			context.insets = { start: Math.max(route.headStart?.length || 0, shape.trimStart || 0, shape.bind?.start ? 8 : 0), end: Math.max(route.headEnd?.length || 0, shape.trimEnd || 0, shape.bind?.end ? 8 : 0) };
		} else if (shape.labelIn && shapeFrame) {
			if (!(fitScaleX > 1e-6)) throw Object.assign(new RangeError('This shape has no room for an inside label'), { code: 'drawing_geometry_limit' });
			context.frame = { ...shapeFrame, w: shapeFrame.w * fitScaleX, h: shapeFrame.h * fitScaleY };
		} else if (shape.recognized === 'arc') {
			const a = (g.a0 + g.a1) / 2;
			context.anchor = { x: g.cx + (g.r + 14) * Math.cos(a), y: g.cy + (g.r + 14) * Math.sin(a), anchor: 'start' };
		}
	}
	const beside = shape.labelBeside && context.path && _rapierDrawBesideLayout(shape, context, arrowGeometry || _rapierDrawArrowGeometry(shape, recipe));
	const laid = beside || layoutText(shape, context);
	if (shape.route === 'auto' && laid.cutout) {
		const b = laid.bounds, pad = 8 + _rapierDrawStrokeHalf(shape, recipe);
		laid.cutout = {minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad, w: b.w + 2 * pad, h: b.h + 2 * pad};
	}
	return { ...laid, shapeFrame, fitScaleX, fitScaleY };
}

function _rapierDrawBesideLayout(shape, context, route) {
	const path = route.samples, lengths = [0];
	for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + _rapierDrawDist(path[i - 1], path[i]));
	const want = (shape.labelPos ?? .5) * lengths.at(-1);
	let i = 1;
	while (i < path.length - 1 && lengths[i] < want) i++;
	const part = lengths[i] > lengths[i - 1] ? (want - lengths[i - 1]) / (lengths[i] - lengths[i - 1]) : 0, anchor = _rapierDrawInterpolatePoint(path[i - 1], path[i], part).slice(0, 2);
	const segment = route.segments.find(s => s.length === 2 && _rapierDrawDist(anchor, _rapierDrawClosestOnSeg(anchor, s[0], s[1])) < .01);
	if (!segment) return null;
	const upright = Math.abs(segment[0][0] - segment[1][0]) < 1e-7;
	if (!upright && Math.abs(segment[0][1] - segment[1][1]) > 1e-7) return null;
	const {insets, ...plain} = context, at = {...shape, labelPos: .5};
	const line = p => upright ? [[p[0], p[1] - 512], [p[0], p[1] + 512]] : [[p[0] - 512, p[1]], [p[0] + 512, p[1]]];
	const first = layoutText(at, {...plain, path: line(anchor)});
	const shift = upright ? [RAPIER_DRAW_BESIDE + first.center.x - first.bounds.minX, 0] : [0, -RAPIER_DRAW_BESIDE - first.bounds.maxY + first.center.y];
	return {...layoutText(at, {...plain, path: line([anchor[0] + shift[0], anchor[1] + shift[1]])}), cutout: null};
}

function _rapierDrawLabelPlacement(shape, recipe) {
	const label = _rapierDrawTextLayout(shape, recipe);
	return { x: label.center.x, y: label.center.y, anchor: 'middle', middle: true };
}

function _rapierDrawLabelFraction(shape, recipe, point) {
	const path = _rapierDrawArrowHitPolyline(shape, recipe);
	if (!path || path.length < 2) return .5;
	let total = 0, best = Infinity, distance = 0;
	for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i], q = _rapierDrawClosestOnSeg(point, a, b), error = _rapierDrawDist(point, q), length = _rapierDrawDist(a, b);
		if (error < best) { best = error; distance = total + _rapierDrawDist(a, q); }
		total += length;
	}
	const range = _rapierDrawTextLayout(shape, recipe).labelRange;
	return _rapierDrawClamp(total ? distance / total : .5, range[0], range[1]);
}

function _rapierDrawShapeContours(shape, recipe) {
	if ((shape.recognized === 'arrow' || shape.recognized === 'line') && !_rapierDrawShapePaintsInk(shape, recipe)) return _rapierDrawArrowParts(shape, recipe).contours.map(points => points.map(p => p.concat(0)));
	const path = _rapierDrawShapePolyline(shape, recipe);
	const marks = !_rapierDrawShapePaintsInk(shape, recipe) && ['cylinder', 'subroutine'].includes(shape.recognized) ? _rapierDrawBoxContours(shape).marks : [];
	return path?.length ? [path, ...marks.map(points => points.map(p => p.concat(0)))] : [];
}

export {RAPIER_DRAW_PAPERS,_rapierDrawPaperListen,_rapierDrawPaperRequest,_rapierDrawShapeFilledOnly,normalizeBackground as _rapierDrawNormalizeBackground,paperShifted as _rapierDrawPaperShifted,backgroundSVG as _rapierDrawBackgroundSVG,BACKGROUND_PRESETS as RAPIER_DRAW_BACKGROUND_PRESETS,_rapierDrawSampleStops,letterInputFont,GARDEN_COLOURS,COPIER_PRESETS,copierPreset,admitCopier,copierPreviewEffect,copierBounds,copierMarkup,REFRACTION_PRESETS,refractionPreset,admitRefraction,LIQUID_PRESETS,LIQUID_PALETTES,liquidPreset,admitLiquid,liquidStillPut,liquidStillHas,liquidStillsWanted,liquidStillsFromSVG,liquidStillKey,liquidStillSize,liquidStillSteps,fillEffect,admitEffect,effectPreset,effectBounds,effectMarkup,RAPIER_DRAW_DIAGRAM,RAPIER_DRAW_PAINT_INK_FILTER,_rapierDrawUnionView,_rapierDrawDarkRules,_rapierDrawUsedColours,_rapierDrawRouteChanges,_rapierDrawBorderActive,_rapierDrawGrowPolygon,_rapierDrawSpatial,RAPIER_DRAW_POLYGONS,RAPIER_DRAW_HEADS,_rapierDrawRestoreSVGRecipe,_rapierDrawStripRasters,_rapierDrawValidRaster,RAPIER_DRAW_RASTER_MAX,RAPIER_DRAW_RASTER_TOTAL,_rapierDrawNormalizeAgentRecipe,_rapierDrawRecipeFault,backgroundStart as _rapierDrawBackgroundStart,_rapierDrawReadRecipeFromSVGText,_rapierDrawLowerFigures,_rapierDrawFigureFault,_rapierDrawApplyShapesPatch,_rapierDrawTextFrame,_rapierDrawTextLayout,_rapierDrawLabelFraction,_rapierDrawShapeContours,_rapierDrawArrowHitPolyline,RAPIER_DRAW_LABEL_MAX,_rapierDrawSetLineGeometry,_rapierDrawSceneMarkup,_rapierDrawChangeBackground,RAPIER_DRAW_NIB_DEFAULT,RAPIER_DRAW_NIB_MAX,RAPIER_DRAW_NIB_MIN,RAPIER_DRAW_SMOOTH_DEFAULT,RAPIER_DRAW_VERSION,_rapierDrawAdmitRecipe,_rapierDrawAnchorFrame,_rapierDrawArcEndpoints,_rapierDrawArrowParts,_rapierDrawArrowRoutePoints,_rapierDrawBBox,_rapierDrawBrushMarkup,_rapierDrawBrushesFor,_rapierDrawBuildSVG,_rapierDrawTextAlternative,_rapierDrawClamp,_rapierDrawClosestOnSeg,_rapierDrawDefaultStyle,_rapierDrawDist,_rapierDrawEdgeSnapPoint,_rapierDrawEllipseEdgePoint,_rapierDrawFmt,_rapierDrawInterpolatePoint,_rapierDrawIsClosedStroke,_rapierDrawLabelPlacement,_rapierDrawNextAssetName,_rapierDrawNibLevel,_rapierDrawPaintPad,_rapierDrawPenPathD,_rapierDrawPerimeter,_rapierDrawPointInPolygon,_rapierDrawRDP,_rapierDrawRDPClosed,_rapierDrawRectPolygon,_rapierDrawRelaxStroke,_rapierDrawRerouteBoundArrows,_rapierDrawResamplePolyline,_rapierDrawResolveBindAnchor,_rapierDrawRouteBBoxFromPoints,_rapierDrawShapeBBoxIn,_rapierDrawShapePaintedBBoxIn,_rapierDrawShapeInk,_rapierDrawShapeMarkup,_rapierDrawShapeNib,_rapierDrawShapePaintsInk,_rapierDrawShapePolygon,_rapierDrawShapePolyline,_rapierDrawShapeStroke,_rapierDrawSmoothLevel,_rapierDrawSmoothPathD,_rapierDrawSmoothPlan,_rapierDrawStreamlineStroke,_rapierDrawStrokeHalf,_rapierDrawStrokeHasPressure,_rapierDrawStrokeSamples,_rapierDrawEscapeAttr,_rapierDrawInkView,_rapierDrawStylesFor,_rapierDrawValidInk,_rapierDrawDashActive,_rapierDrawRDPWeighted,_rapierDrawEffectiveWidth,RAPIER_DRAW_INK_WIDTH,RAPIER_DRAW_SHAPE_WIDTH,_rapierDrawObjectFrame,_rapierDrawStippleDots};
