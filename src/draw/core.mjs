// SPDX-License-Identifier: AGPL-3.0-only
import {getStrokePoints} from './freehand.mjs';
import {penPath, strokeHasPressure as _rapierDrawStrokeHasPressure} from './pen-path.mjs';
import {DRAW_TEXT_MAX, GARDEN_COLOURS, admitText, layoutText, restoreLetters} from './text.mjs';
import {admitFonts, fontDefs, fontMetadata, restoreFonts} from './font.mjs';
import {roughPaths} from './rough.mjs';
import {COPIER_PRESETS, copierPreset, admitCopier, copierBounds, copierMarkup, copierPreviewEffect} from './effects.mjs';
import {_rapierColorForDarkPaper, _rapierContrastRatio} from '../editor/colour-math.mjs';

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

// ---- Fitting a round stroke (R87f) --------------------------------------------------------------
// The recognizer used to read a round stroke off its BOUNDING BOX: centre at the box's middle,
// radius (w + h) / 4, and `rot: 0` for every ellipse. That is wrong in a way a person sees. A clean
// oval 120 x 65, drawn at four angles, came back as:
//
//     drawn  0 deg -> ellipse rx=120 ry=65 rot=0
//     drawn 20 deg -> ellipse rx=115 ry=74 rot=0     (the tilt thrown away, the radii the box's)
//     drawn 35 deg -> CIRCLE                         (a tilted oval's box is nearly square)
//     drawn 50 deg -> CIRCLE
//
// So an oval drawn on the diagonal came back a circle. These two fit the stroke itself instead of
// the box around it, and get the axes and the angle right at every rotation.

// The algebraic circle fit (Kasa): minimising the error in x^2 + y^2 - 2cx*x - 2cy*y + k is LINEAR
// in the centre, so this is one 2x2 solve over sums, with no iteration to diverge on a phone.
function _rapierDrawFitCircleTo(points) {
	const n = points.length;
	if (n < 5) return null;
	let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
	for (const [x, y] of points) {
		const z = x * x + y * y;
		sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
	}
	const a11 = 2 * (sxx - sx * sx / n), a12 = 2 * (sxy - sx * sy / n), a22 = 2 * (syy - sy * sy / n);
	const b1 = sxz - sx * sz / n, b2 = syz - sy * sz / n;
	const det = a11 * a22 - a12 * a12;
	if (!det || !isFinite(det)) return null;
	const cx = (b1 * a22 - b2 * a12) / det, cy = (a11 * b2 - a12 * b1) / det;
	if (!isFinite(cx) || !isFinite(cy)) return null;
	let total = 0;
	for (const [x, y] of points) total += Math.hypot(x - cx, y - cy);
	const r = total / n;
	if (!(r > 0) || !isFinite(r)) return null;
	let sq = 0;
	for (const [x, y] of points) { const d = Math.hypot(x - cx, y - cy) - r; sq += d * d; }
	return { cx, cy, r, residual: Math.sqrt(sq / n) };
}

// The direction comes from the covariance of the points, which is stable for anything drawn round;
// the two radii then fall out of a 2x2 least squares, because (u/ra)^2 + (v/rb)^2 = 1 is LINEAR in
// 1/ra^2 and 1/rb^2. A general conic solve is the textbook answer and it is not worth its trouble
// at this size: this one has no eigen-iteration to diverge and no degenerate hyperbola to reject.
function _rapierDrawFitEllipseTo(points) {
	const n = points.length;
	if (n < 6) return null;
	let cx = 0, cy = 0;
	for (const [x, y] of points) { cx += x / n; cy += y / n; }
	let sxx = 0, syy = 0, sxy = 0;
	for (const [x, y] of points) { const dx = x - cx, dy = y - cy; sxx += dx * dx / n; syy += dy * dy / n; sxy += dx * dy / n; }
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy), co = Math.cos(theta), si = Math.sin(theta);
	let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
	for (const [x, y] of points) {
		const u = (x - cx) * co + (y - cy) * si, v = -(x - cx) * si + (y - cy) * co;
		const p = u * u, q = v * v;
		a11 += p * p; a12 += p * q; a22 += q * q; b1 += p; b2 += q;
	}
	const det = a11 * a22 - a12 * a12;
	if (!det || !isFinite(det)) return null;
	const ia = (b1 * a22 - b2 * a12) / det, ib = (a11 * b2 - a12 * b1) / det;
	if (!(ia > 0) || !(ib > 0)) return null;
	const ra = 1 / Math.sqrt(ia), rb = 1 / Math.sqrt(ib);
	if (!isFinite(ra) || !isFinite(rb) || !(ra > 0) || !(rb > 0)) return null;
	let sq = 0;
	for (const [x, y] of points) {
		const u = ((x - cx) * co + (y - cy) * si) / ra, v = (-(x - cx) * si + (y - cy) * co) / rb;
		const k = Math.hypot(u, v);
		const d = k ? (k - 1) * Math.min(ra, rb) : 0;
		sq += d * d;
	}
	return { cx, cy, ra, rb, theta, residual: Math.sqrt(sq / n) };
}

// ---- Fitting a regular figure: a star, a pentagon, a hexagon (R87g) -----------------------------
// The renderer has drawn diamonds, pentagons, hexagons, octagons and five-pointed stars since the
// shape tool existed (RAPIER_DRAW_POLYGONS). The recognizer could not read one. Draw a star and you
// got your own line back; draw a hexagon and you got a circle. That is a gap, not a judgment.
//
// The general way to read a polygon is to find its corners and pay for two numbers each, which for
// a five-pointed star is twenty numbers -- more than any fit is worth, so a perfectly good star was
// always thrown away. But a regular figure is not twenty numbers. It is a centre, a radius, a depth
// and a turn, and the whole of its structure is one fact: the distance from the centre rises and
// falls the same way k times around. So read the radius as a signal in angle and find that k. A
// circle is flat. A polygon ripples gently k times. A k-pointed star swings hard k times. One
// measurement, and the depth of the swing says which of the three the person drew.
//
// This returns the figure and its vertices and nothing else: it does not decide. The caller weighs
// its residual against the answer it already has (draw.js), because a lone threshold here is
// exactly what once turned a hand-drawn ellipse into a diamond.
const RAPIER_DRAW_REGULAR_STAR_DEPTH = 0.22;
const RAPIER_DRAW_REGULAR_POLY_DEPTH = Object.freeze({ min: 0.02, max: 0.16 });
const RAPIER_DRAW_REGULAR_SIDES = Object.freeze({ 4: 'diamond', 5: 'pentagon', 6: 'hexagon', 8: 'octagon' });

// Where the frame has to sit for the renderer to draw this figure at this centre. _rapierDrawShapePolygon
// builds the unit figure, then stretches its BOUNDING BOX onto the frame -- and for an odd number
// of points that box is not centred on the figure's own centre (a pentagon sits low in its box). So
// the frame's centre is placed where the person's centre demands rather than on top of it.
function _rapierDrawRegularFrame(kind, cx, cy, radius, inner, rot) {
	const n = RAPIER_DRAW_POLYGONS[kind];
	if (!n || !(radius > 0)) return null;
	const local = Array.from({ length: n }, (_, i) => {
		const a = i * Math.PI * 2 / n - Math.PI / 2, r = kind === 'star' && i % 2 ? inner : 1;
		return [Math.cos(a) * r, Math.sin(a) * r];
	});
	const box = _rapierDrawBBox(local);
	if (!(box.w > 0) || !(box.h > 0)) return null;
	const w = box.w * radius, h = box.h * radius;
	const dx = ((0 - box.minX) / box.w - 0.5) * w, dy = ((0 - box.minY) / box.h - 0.5) * h;
	const cs = Math.cos(rot), sn = Math.sin(rot);
	return { cx: cx - (dx * cs - dy * sn), cy: cy - (dx * sn + dy * cs), w, h, rot,
		...(kind === 'star' ? { inner } : {}) };
}

function _rapierDrawFitRegularTo(points) {
	const n = points.length;
	if (n < 24) return null;
	let cx = 0, cy = 0;
	for (const [x, y] of points) { cx += x / n; cy += y / n; }
	const angle = new Float64Array(n), radius = new Float64Array(n);
	let r0 = 0;
	for (let i = 0; i < n; i++) {
		const dx = points[i][0] - cx, dy = points[i][1] - cy;
		angle[i] = Math.atan2(dy, dx); radius[i] = Math.hypot(dx, dy); r0 += radius[i] / n;
	}
	if (!(r0 > 0)) return null;
	// One Fourier coefficient per candidate k, taken over the points as they were drawn. A stroke is
	// sampled along its length, not evenly in angle, so each point carries its own share of the turn.
	const TAU = Math.PI * 2;
	let bestK = 0, bestAmp = 0, bestPhase = 0;
	for (let k = 3; k <= 8; k++) {
		let re = 0, im = 0, weight = 0;
		for (let i = 0; i < n; i++) {
			let dw = angle[(i + 1) % n] - angle[(i - 1 + n) % n];
			while (dw > Math.PI) dw -= TAU;
			while (dw < -Math.PI) dw += TAU;
			dw = Math.abs(dw) / 2;
			re += (radius[i] - r0) * Math.cos(k * angle[i]) * dw;
			im += (radius[i] - r0) * Math.sin(k * angle[i]) * dw;
			weight += dw;
		}
		if (!weight) continue;
		const amp = 2 * Math.hypot(re, im) / weight;
		if (amp > bestAmp) { bestK = k; bestAmp = amp; bestPhase = Math.atan2(im, re) / k; }
	}
	if (!bestK || !(bestAmp > 0)) return null;
	const depth = bestAmp / r0;
	// A gentle ripple is a polygon's flat sides; a deep swing is a star's points. Between them is
	// nothing a person draws on purpose, so the middle is refused rather than guessed at.
	const star = depth > RAPIER_DRAW_REGULAR_STAR_DEPTH;
	if (!star && !(depth > RAPIER_DRAW_REGULAR_POLY_DEPTH.min && depth < RAPIER_DRAW_REGULAR_POLY_DEPTH.max)) return null;
	// Only a figure the renderer can actually draw. A five-pointed star is the one star it has;
	// a three-sided ripple is a triangle, which an earlier branch reads better than this can.
	const kind = star ? (bestK === 5 ? 'star' : '') : RAPIER_DRAW_REGULAR_SIDES[bestK];
	if (!kind) return null;
	// The harmonic found k and where the figure is turned to. It is NOT the model: a star's radius
	// is a zigzag between two values and one cosine only sketches that, so the corners are read from
	// the person's own points -- a cosine fitted to a zigzag always undershoots, and a star built
	// from the cosine comes out blunter than the one that was drawn.
	const reach = (a, outward) => {
		let found = null;
		for (let i = 0; i < n; i++) {
			let d = angle[i] - a;
			while (d > Math.PI) d -= TAU;
			while (d < -Math.PI) d += TAU;
			if (Math.abs(d) > Math.PI / (2 * bestK)) continue;
			if (found == null || (outward ? radius[i] > found : radius[i] < found)) found = radius[i];
		}
		return found == null ? r0 + bestAmp * Math.cos(bestK * (a - bestPhase)) : found;
	};
	const corners = star ? bestK * 2 : bestK, vertices = [];
	let outer = 0, innerSum = 0, innerCount = 0;
	for (let i = 0; i < corners; i++) {
		const a = bestPhase + i * TAU / corners, out = !star || i % 2 === 0, r = reach(a, out);
		vertices.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
		if (out) outer = Math.max(outer, r); else { innerSum += r; innerCount++; }
	}
	if (!(outer > 0)) return null;
	const inner = innerCount ? _rapierDrawClamp(innerSum / innerCount / outer, 0.12, 0.88) : 0;
	const geom = _rapierDrawRegularFrame(kind, cx, cy, outer, inner, bestPhase + Math.PI / 2);
	return geom ? { kind, points: bestK, depth, vertices, geom } : null;
}

// D01: the appearance weight ink actually paints at, and the thin default a Shape-tool figure
// (built from scratch, no mark underneath it) draws its outline at instead. Both are at nib
// RAPIER_DRAW_NIB_DEFAULT; _rapierDrawNibScale multiplies either one for a different nib.
const RAPIER_DRAW_INK_WIDTH = 6.4;
const RAPIER_DRAW_SHAPE_WIDTH = 2.6;

// D04: the brushes with a genuine second, ink/stroke-based rendering (a coil or tube that follows
// the actual drawn or recognized-but-as-drawn stroke) distinct from their line/arrow geometry one.
const RAPIER_DRAW_INK_LOOK_BRUSHES = new Set(['spring', 'rope', 'tube', 'ray', 'light']);

// The default ink is the paper's text ink, near-black on light paper (share.js's --ink). Rapier's
// dark theme presents a drawing's default ink and palette inks through the same dark derivation
// text colours use (images/browser.js); the file keeps light-paper colours, which is what every
// other viewer expects of an SVG.
const RAPIER_DRAW_INK = '#121212';

const RAPIER_DRAW_INK_NAMES = Object.freeze({ green: '#338758', red: '#c83845', blue: '#2c70d9', gold: '#99692d', purple: '#8a3eec' });

// Rapier's diagram look, the style pack's own (spec/markdown-style.css, the --md-diagram-* tokens, holds the same pairs;
// the same palette is used for both projections). Each role is [light paper, dark paper]. A drawing an agent lays out
// wears it: nearly monochrome, every box and decision one grey, its words and lines one ink, its numbers a quieter ink,
// and the accent spent once, on the outcome the flow is for. The file keeps the light colours, which every viewer
// expects of an SVG; the SVG carries its dark pairs as its own style (_rapierDrawDiagramDark), so a Share page, an
// export and any browser that opens the file on dark paper draw the same dark diagram the editor does.
const RAPIER_DRAW_DIAGRAM = Object.freeze({
	ink: Object.freeze(['#121212', '#fafafa']), box: Object.freeze(['#f0f0f0', '#1d1d1d']), accent: Object.freeze(['#12a594', '#12a594']),
	'on-accent': Object.freeze(['#000000', '#000000']), step: Object.freeze(['#666666', '#999999']),
});
// The words a solid figure holds take the ink that reads on it: the diagram's own fills name theirs (the ink that turns
// with the paper on the grey, black that stays black on the accent), any other fill the stronger of
// near-black and white.
function _rapierDrawOnInk(fill) {
	if (fill === RAPIER_DRAW_DIAGRAM.accent[0]) return RAPIER_DRAW_DIAGRAM['on-accent'][0];
	if (fill === RAPIER_DRAW_DIAGRAM.box[0]) return RAPIER_DRAW_INK;
	const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
	const l = lum(fill);
	return (1.05 / (l + .05)) > ((l + .05) / (lum(RAPIER_DRAW_INK) + .05)) ? '#ffffff' : RAPIER_DRAW_INK;
}
// The paint display law already used by the editor: lift lightness and turn the hue back.
// This filter never changes the stored raster; only a dark SVG presentation uses it.
const RAPIER_DRAW_PAINT_INK_FILTER = '<filter id="rapier-paint-ink" color-interpolation-filters="sRGB">' +
	'<feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/>' +
	'<feColorMatrix type="hueRotate" values="180"/></filter>';
// The colours a scene's markup uses, keyed attribute+hex, the way the dark presentation's rules read them.
function _rapierDrawUsedColours(body) {
	return new Set([...body.matchAll(/\b(fill|stroke|color|stop-color)="(#[0-9a-f]{6})"/g)].map(m => m[1] + m[2]));
}
// The dark presentation's rules, one list for the file (media-gated by _rapierDrawDiagramDark below) and for the
// live canvas on dark paper (draw.js _rapierDrawDarkStyleSync, scoped to the canvas and unconditional), so what
// you draw on black is what the page and the Share page show. Light SVG attributes, the recipe and raster payloads
// stay untouched; the approved diagram pairs win over the ordinary colour derivation.
function _rapierDrawDarkRules(used, recipe, { currentColor = false, paint = false } = {}) {
	const pairs = Object.entries(RAPIER_DRAW_DIAGRAM), rules = [];
	const look = pairs.some(([role, [light]]) => role !== 'ink' && (used.has('fill' + light) || used.has('stroke' + light)));
	const turned = new Map(look ? pairs.map(([, pair]) => pair) : [RAPIER_DRAW_DIAGRAM.ink]);
	// The garden's own two defaults carry the pair chosen for dark paper (a red rose on a blue stem); a colour the person chose is turned like any ink.
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
	// Author colours take the shared dark-paper derivation, even when their light colour equals a diagram token.
	// Their words take the stronger ink over that derived fill, as the Markdown diagram projection does.
	for (const shape of recipe.shapes) if (shape.authorStyle) {
		const a = shape.authorStyle, scope = '[data-shape-id="' + shape.id + '"]';
		const fill = a.fill && _rapierColorForDarkPaper(a.fill), ink = fill ? _rapierContrastRatio(fill, '#000000') >= _rapierContrastRatio(fill, '#ffffff') ? '#000000' : '#ffffff' : a.color && _rapierColorForDarkPaper(a.color);
		if (fill) rules.push(scope + ' > [fill="' + a.fill + '"]{fill:' + fill + '}');
		if (a.stroke) rules.push(scope + ' > [stroke="' + a.stroke + '"]{stroke:' + _rapierColorForDarkPaper(a.stroke) + '}');
		if (ink) rules.push(scope + ' [data-author-label] [fill]{fill:' + ink + '}');
		if (fill && !a.stroke) rules.push(scope + ' > [data-box-mark]{stroke:' + ink + '}');
	}
	if (paint) rules.push('[data-rapier-paint]{filter:url(#rapier-paint-ink)}');
	// The scanner reads the original ink, including on dark paper. A theme must not turn
	// black source into white before the copier derives its luminance or invert its pixels.
	if (recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength)) {
		return rules.map(rule => rule.replace('{', ':not([data-rapier-copy] *){')).concat('[data-rapier-copy]{color:' + RAPIER_DRAW_INK + '}');
	}
	return rules;
}
// One compact dark presentation in the file, containing only paints this drawing actually uses.
function _rapierDrawDiagramDark(body, recipe) {
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

// A paint layer's pixels travel as one PNG data URL (draw/paint.mjs paints them, draw/draw.js
// encodes them); the SVG carries them as an <image data-rapier-paint> and the recipe metadata omits
// them (restorePaint puts them back on read, the way fonts round-trip). Base64 PNG only, bounded.
const RAPIER_DRAW_RASTER_MAX = 8 * 1024 * 1024, RAPIER_DRAW_RASTER_TOTAL = 24 * 1024 * 1024;
// A painting is admitted as PNG or as JPEG XL, each pinned to its own magic bytes in the base64:
// the PNG signature, and JPEG XL's bare-codestream (0xFF 0x0A) or ISOBMFF container start. The law
// (intent.md, "Picture format law"; open-work.md section 2, "The painting is JPEG XL, not PNG"):
// a painting is kept as JPEG XL. A textured oil painting is essentially noise, so lossless PNG of
// one is enormous -- the founder's, measured: 8300 KiB against an 8 MiB ceiling, and every further
// stroke toasted the same refusal again. The narrowing that matters is unchanged: a data URL, one
// of two image types, each proved by its own signature, and nothing else.
// The JPEG XL signatures, verified against the encoder's own output: a bare codestream begins
// 0xFF 0x0A, whose base64 is '/w' then one of o p q r (the third byte's top two bits land in
// that sextet); the ISOBMFF container begins 00 00 00 0C 'JXL ', which is 'AAAADEpYTCA'.
const _RAPIER_DRAW_RASTER = /^data:image\/(?:png;base64,iVBORw0KGgo|jxl;base64,(?:\/w[o-r]|AAAADEpYTCA))[A-Za-z0-9+/]*={0,2}$/;
function _rapierDrawValidRaster(value, max = RAPIER_DRAW_RASTER_MAX) {
	return typeof value === 'string' && value.length >= 60 && value.length <= max && _RAPIER_DRAW_RASTER.test(value) ? value : null;
}

function _rapierDrawShapeInk(shape) {
	const ink = _rapierDrawValidInk((shape?.style === 'solid' ? shape?.authorStyle?.fill : shape?.authorStyle?.stroke) || shape?.ink);
	return RAPIER_DRAW_INK_NAMES[ink] || ink || RAPIER_DRAW_INK;
}

function _rapierDrawBrushesFor(kind, hasStroke = false) {
	// Recognition never removes the looks available on the person's retained freehand stroke.
	if (hasStroke && !['ink', 'line', 'arrow'].includes(kind)) return [...new Set([..._rapierDrawBrushesFor(kind), ...RAPIER_DRAW_INK_LOOK_BRUSHES])];
	// Every figure can also wear the freehand brush look ('brush'); the Physico brushes are by kind.
	// Sketch / hatched are the rough.js look: every figure, and as-drawn strokes (outline only).
	const sketch = ['sketch', 'hatched'];
	if (kind === 'circle') return ['ink', 'brush', ...sketch, 'sphere', 'wheel', 'pulley', 'wood', 'knot'];
	if (kind === 'ellipse') return ['ink', 'brush', ...sketch, 'sphere', 'lens', 'wood', 'knot'];
	if (kind === 'rect' || kind === 'triangle' || Object.hasOwn(RAPIER_DRAW_POLYGONS, kind)) return ['ink', 'brush', ...sketch, 'wood', 'knot'];
	if (kind === 'line' || kind === 'arrow') return ['ink', 'brush', ...sketch, 'spring', 'rope', 'tube', 'ray', 'light'];
	if (kind === 'arc') return ['ink', 'brush', ...sketch];
	if (kind === 'ink') return ['ink', 'brush', ...sketch, 'spring', 'rope', 'tube', 'ray', 'light'];
	// A paint layer is pixels: it wears no vector brush.
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

// The same recursive Douglas-Peucker split as _rapierDrawRDP, generalised for the live freehand
// capture buffer's compaction (D02): a captured point also carries elapsed time and pressure past
// index 1, and a swing in one of those can matter -- can even flip a stroke's own real/simulated
// pressure call (_rapierDrawStrokeHasPressure) -- while leaving x/y almost perfectly straight, so
// position-only RDP has nothing to notice and silently erases it. `channels` is a list of [index,
// weight] pairs; a candidate point's split-worthiness is the largest of its ordinary positional
// perpendicular distance and each channel's own deviation from what linear interpolation between
// the chord's two endpoints would predict for that channel, scaled by that channel's weight into
// the same pixel-equivalent units as `eps` so one shared threshold governs every dimension at once.
// No channels reduces this to plain positional RDP.
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

// Extra box contours share the ordinary affine frame. The same points own paint, binding, bounds and text fit;
// interior marks are separate contours, so a cylinder's rim or a subroutine's bars cannot become a binding edge.
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
	if (shape.recognized === 'rect' || shape.recognized === 'paint') return g.p ? g.p.map(p => [p[0], p[1]]) : _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
	if (shape.recognized === 'triangle') return g.p.map(p => [p[0], p[1]]);
	const n = RAPIER_DRAW_POLYGONS[shape.recognized];
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

// D05: hatch fill used to run entirely in the page's own coordinates -- a fixed 45deg direction and
// a bbox centred in WORLD space -- so turning the shape never turned its hatching, the same gap D05
// fixed for wheel and wood. Now generated inside the same object frame (_rapierDrawObjectFrame) those
// use: the 45deg direction and the bbox are both taken relative to the shape's own axis (vertex 0 to
// vertex 1), clipped against the LOCAL polygon, and only the finished segment endpoints are mapped
// back out through `toWorld` -- one owner, rigid under Move/Duplicate/rotate exactly like wood grain.
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

// D07: every roughness/texture generator below keys off this small, immutable value instead of the
// shape's own id, so copy/duplicate (which remints ids for identity, never this) keeps a shape's
// random appearance exactly -- a duplicated sketch, stipple, sphere or wood grain looks the same as
// its original, texture for texture, the way its position and size already do. Minted once at
// creation (draw.js) and carried by admission through every load and edit; a shape that has none
// (foreign input omits it) falls back to its own id.
function _rapierDrawShapeSeedBase(shape) { return shape.seed != null ? String(shape.seed) : String(shape.id || 'g'); }

// D03/D05: an OBJECT frame for procedural texture, anchored to the polygon's own vertices rather
// than the page -- its origin is the centroid, its axis the direction from vertex 0 to vertex 1.
// Both are facts about the shape's own geometry: translating the whole polygon carries the origin
// along and leaves the axis untouched, and rotating it about any pivot turns the origin and axis by
// the identical angle, so a pattern generated once in this frame and mapped back through `toWorld`
// moves and turns rigidly with the shape instead of being resampled from a new absolute box. Any
// generator that samples inside `toLocal(poly)` and reports its points through `toWorld` is
// therefore already Move/Duplicate/rotate invariant, with no separate transform bookkeeping.
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
	// D03: seeded from the shape's own immutable visual identity alone -- never its geometry, which
	// moving, duplicating or rotating the shape changes on purpose -- so the exact same candidate
	// sequence is drawn in the exact same (translation/rotation-invariant) local frame every time.
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

// Rendering, picking and bounds share this choice; an asDrawn flag cannot create missing stroke data.
function _rapierDrawShapePaintsInk(shape, recipe) { return !!((shape.asDrawn || shape.recognized === 'ink') && _rapierDrawShapeStroke(shape, recipe)); }

// D01: the one owner of a shape's outline weight, read by every render and hit-test site that
// used to spell out its own "2.6" (or "6.4") literal. A cut fragment carries its already-resolved
// width explicitly (set once, at cut time, by whichever shape it was cut from -- see draw.js's
// erase code -- so a later edit to the source's own nib never retroactively reweights a piece no
// longer attached to it). Otherwise: a shape that still carries the raw mark it came from --
// `shape.stroke` survives every recognition and every "As drawn" toggle, Pen or Brush alike, per
// the applied/offered law in handoff.md -- is a READING of that mark, not a new one, and keeps the
// ink weight it was actually drawn at, whatever kind the recognizer settled on (line, rect,
// circle...). Only a Shape-tool figure, drawn from scratch with no mark under it, gets the thin
// kind default; `thin` narrows that default further for an arrowhead's own shaft convention.
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
	if (RAPIER_DRAW_BOXES.has(shape.recognized) || shape.recognized === 'paint' || shape.recognized === 'triangle' || shape.recognized === 'text' || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized)) {
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
	if (shape.recognized === 'triangle' || g.p && (RAPIER_DRAW_BOXES.has(shape.recognized) || shape.recognized === 'paint' || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized))) {
		const p = g.p, q = p[shape.recognized === 'triangle' ? 2 : 3];
		return { x: p[0][0], y: p[0][1], ux: p[1][0] - p[0][0], uy: p[1][1] - p[0][1], vx: q[0] - p[0][0], vy: q[1] - p[0][1] };
	}
	if (!['circle', 'ellipse', 'paint'].includes(shape.recognized) && !RAPIER_DRAW_BOXES.has(shape.recognized) && !Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized)) return null;
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

// D06: one connector model -- a bound endpoint follows its target whether the connector wears an
// arrowhead or not. An arrowhead is appearance (headStart/headEnd, already admitted for both kinds
// alike); binding and reroute-on-move are not, so `line` gets exactly the same live-follow `arrow`
// already had. draw/edit.mjs's own anchor bookkeeping (anchorsFor/replaceAnchors, transformShape's
// rotate/resize rewrite, _rapierDrawReleaseBindings) never filtered by kind -- it always just
// checked `shape.bind` -- so only this reroute pass and the admission gate below were arrow-only.
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
	const light = _rapierDrawLightAngle(recipe), away = light + Math.PI, ax = Math.cos(away), ay = Math.sin(away);
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
	// D05: a spoke is directional material -- drawn in the wheel's own frame, its start angle carries
	// the object's own g.rot, the same as any other rotated geometry would. The rim and hub above are
	// plain circles, rotation-invariant by construction, so they need no such term.
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
	// D05: wood grain is directional material -- rows run along the object's own local axis (via
	// _rapierDrawObjectFrame), not always page-horizontal, so a rotated plank's grain turns with it.
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

// The Brush: perfect-freehand's outline (vendored in draw/freehand.mjs) with pressure where the
// device gives it and velocity-simulated pressure where it does not, drawn as the filled quadratic
// path perfect-freehand's own README describes. Its feel is fixed (thinning, smoothing and
// streamline are the brush's own); the Pen, not the Brush, carries the smoothing control.
function _rapierDrawPenPathD(pts, smooth, last, size) {
	return penPath(pts, {size, last: !!last});
}

function _rapierDrawBrushPenPath(shape, recipe) {
	// A stroke painted as drawn is brushed along the stroke; a recognised figure (a Shape-tool box,
	// a circle the person asked for) takes the brush look along its own clean outline, resampled so
	// the brush has enough points to breathe.
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

// D08: a lens-brushed ellipse bends a nearby ray -- _rapierDrawRayLensBend is the one helper both
// ray renderers now carry through, on the ray's own chord (first sample to last, the same
// simplification _rapierDrawBrushRay already makes for a recognized line/arrow: the bend follows
// the endpoints, not every wobble in between). Decided over retiring the helper because it is a
// real, working, already-witnessed-adjacent effect (draw-sketch-brush's neighbours), and because
// leaving it wired to only one of the two ray render paths was the actual defect: R72 ("Both are
// geometry") means an as-drawn ray stroke and its cleaned recognized-line form must wear the exact
// same look, lens bend included, since cleaning changes nothing about what a shape wears.
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
	// Sketch is a rough outline; hatched adds hachure fill. As-drawn strokes (and open polylines)
	// are outline only — a hachure of an open ribbon is not a face. Seed from the shape id so a
	// redraw is byte-stable (share carrier and assetDigest depend on that).
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

// Painted geometry follows an immutable route; repeated label and SVG measurements reuse it.
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

// L01: one small visible capability table, the single owner both the agent's set_look admission
// (draw/edit.mjs) and the human Style sheet's own dash row (draw.js) consult, for whether the
// renderer actually paints a dash pattern on this shape as it is currently configured -- a `look`
// field a write path stores without checking is exactly "a stored inactive field implying a visible
// change that never happened" (Astra-R74 L01). Kept in sync by construction with every render
// branch that does or does not call _rapierDrawDashAttrs/_rapierDrawDashedOutline: an arc's own
// shaft, a plain-ink (no Physico material) line/arrow shaft, and a cut ink fragment (an erased piece
// of a dashed contour, D05) always consult shape.dash; a non-solid closed shape with no Physico
// material does through _rapierDrawDashedOutline; every other combination -- any Physico brush
// (sphere/wheel/wood/rope/sketch/hatched/...), a solid-style closed shape, an as-drawn (uncut) ink
// stroke, text or a paint layer -- never reads shape.dash at all.
function _rapierDrawDashActive(shape) {
	if (shape.recognized === 'arc') return true;
	if (shape.recognized === 'line' || shape.recognized === 'arrow') return !shape.brush || shape.brush === 'ink';
	if (shape.recognized === 'ink') return !!shape.cut;
	if (shape.recognized === 'text' || shape.recognized === 'paint') return false;
	return (!shape.brush || shape.brush === 'ink') && shape.style !== 'solid';
}

// A second ink belongs only to a filled, precise figure in the plain Ink look.
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

// The fills a kind may wear (the appearance half of the grammar; the geometry half is the kind and
// its geom). One owner: admission, the Look tab and the set_look operation all read this.
function _rapierDrawStylesFor(kind) {
	if (kind === 'line' || kind === 'arrow') return ['plain', 'arrow', 'dimension'];
	if (kind === 'arc' || kind === 'ink' || kind === 'text' || kind === 'paint') return [];
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

// F75-8 (the founder's report): the smoothing dial is a single correction strength, not a family
// of unrelated knobs. Level 0 is the raw sampled line (every other field off: no streamline, no
// simplification, no curve, no fit) -- "somebody can turn smoothing all the way off if they don't
// want it." Above 0, `streamline` and `rdp` (the freehand streamline strength and the RDP epsilon
// that simplifies its output) and `fit` (the residual, in stage px, a low-order curve fit may miss
// the simplified points by and still be accepted -- see _rapierDrawIdealise) all grow continuously
// with the level, so "stronger and stronger" has one dial behind it instead of a level 71 cliff.
function _rapierDrawSmoothPlan(level) {
	const n = _rapierDrawSmoothLevel(level);
	if (n === 0) return { settle: 0, streamline: 0, rdp: 0, curve: false, fit: null };
	const t = n / 100;
	return { settle: n <= 12 ? 1 : n <= 35 ? 2 : 3, streamline: 0.18 + t * 0.62, rdp: 1 + t * 7, curve: true, fit: 1.2 + t * 16.8 };
}

// The freehand centreline (draw/freehand.mjs getStrokePoints, the same streamline math Brush's own
// outline is built on) with no outline and no pressure taper -- Pen is one width. Feeds the ink
// render/hit-test pipeline's settle+simplify+fit chain a pre-smoothed spine instead of the box-
// relax filter alone, per the founder's own suggestion ("we can probably take some of the math
// from our freehand implementation"). `amount` is `_rapierDrawSmoothPlan(level).streamline`.
function _rapierDrawStreamlineStroke(pts, amount) {
	if (!pts || pts.length < 3 || !(amount > 0)) return _rapierDrawDedupeStroke(pts);
	let out;
	try { out = getStrokePoints(pts.map(p => [p[0], p[1]]), { streamline: _rapierDrawClamp(amount, 0, 0.92), size: 8, last: true }); }
	catch (_) { return _rapierDrawDedupeStroke(pts); }
	if (!out || out.length < 3) return _rapierDrawDedupeStroke(pts);
	return out.map(sp => [sp.point[0], sp.point[1], 0]);
}

// Smooth level 0: the raw sampled polyline, only de-duplicated (consecutive samples closer than a
// twentieth of a pixel apart collapse to one) -- no streamline, no relax, no simplification.
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
  const u0 = Math.min(...us), u1 = Math.max(...us);
  return { kind: 'poly' + degree, residual: fit.residual, frame: f,
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

  for (let cycles = 0.5; cycles <= 6.01; cycles += 0.05) {
    const w = 2 * Math.PI * cycles / span;
    const basis = u => [1, Math.sin(w * u), Math.cos(w * u)];
    const fit = _rapierDrawLeastSquares(us, vs, basis, 3);
    if (fit && (!best || fit.residual < best.fit.residual)) best = { w, fit, basis };
  }
  if (!best) return null;
  const u0 = Math.min(...us), u1 = Math.max(...us);
  return { kind: 'wave', residual: best.fit.residual, frame: f,
    sample(n) { const out = []; for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; const bs = best.basis(u);
      let v = 0; for (let k = 0; k < 3; k++) v += best.fit.coef[k] * bs[k]; out.push(_rapierDrawFromFrame(u, v, f)); } return out; } };
}

function _rapierDrawIdealise(pts, tolerance) {
  const candidates = [_rapierDrawFitPolynomial(pts, 1), _rapierDrawFitPolynomial(pts, 2), _rapierDrawFitPolynomial(pts, 3), _rapierDrawFitWave(pts)].filter(Boolean);
  if (!candidates.length) return null;
  const best = Math.min(...candidates.map(c => c.residual));
  const competitive = Math.max(best * 1.35, 0.35);
  const winner = candidates.find(c => c.residual <= competitive) || candidates.reduce((a, b) => a.residual <= b.residual ? a : b);
  return winner.residual <= tolerance ? winner : null;
}

// The one place a stroke's curve fit is attempted (render and hit-test both call this -- one
// owner). Fits directly on the raw, only de-duplicated points (resampled down for an extreme
// stroke, never simplified by RDP or smoothed by the causal freehand streamline first): a least-
// squares fit already discounts a hand's jitter on its own, and pre-filtering the input through a
// corner-seeking or directional pass would bias the fit against a steeply curving stroke rather
// than clean it up. Returns null on a closed stroke, a too-short stroke, or a fit whose residual
// misses the dial's own tolerance (`plan.fit`, null at smooth 0 -- see _rapierDrawSmoothPlan).
function _rapierDrawFitStroke(pts, plan) {
	if (plan.fit == null || !pts || _rapierDrawIsClosedStroke(pts)) return null;
	const deduped = _rapierDrawDedupeStroke(pts);
	const fitInput = deduped.length > 320 ? _rapierDrawResamplePolyline(deduped, 320) : deduped;
	if (fitInput.length <= 5) return null;
	return _rapierDrawIdealise(fitInput, plan.fit);
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
		m.push(corner ? [0, 0] : [(next[0] - prev[0]) / 6, (next[1] - prev[1]) / 6]);
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
// Every scene solve adds its counted work here; a layout reads it to know what its rungs have cost.
const _RAPIER_DRAW_ROUTE_SPENT = {work: 0};
const _RAPIER_DRAW_ROUTE_SCENES = [];

// A bound end leaves its actual outline normally. At a vertex the two outward normals
// bisect the corner (a diamond's cardinal points); an ellipse has its analytic normal.
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

// Crossing cost dominates distance; shared terminal stubs may overlap, but unrelated
// shafts prefer separate tracks. Half-open segments count a bend intersection once.
// Two connectors that share a bound piece may share its stub; any other pair never shares a shaft.
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

// A group's title and the hairline rule just over it are one band: a route passes neither through the words nor
// through the rule above them.
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

// The grid cost conservatively counts contacts too. These clear detours separate
// unrelated shared shafts before minimizing crossings; merging ink is not a cure.
function* _rapierDrawRouteDetours(shape, recipe, points, extent, consider) {
	const targets = (recipe.shapes || []).filter(s => s !== shape && !_rapierDrawShapePaintsInk(s, recipe) && _rapierDrawAnchorFrame(s, recipe));
	const boxes = targets.map(s => _rapierDrawObstacleBox(s, recipe)), tracks = [0, 1].map(axis => {
		const low = axis ? 'minY' : 'minX', high = axis ? 'maxY' : 'maxX';
		return [...new Set([extent, ...boxes].flatMap(b => [b[low] - 32, b[low] - 64, b[high] + 32, b[high] + 64]))].filter(_rapierDrawSpatial);
	});
	const first = points[0], last = points.at(-1), reach = Math.max(32, RAPIER_DRAW_ARROW_HEAD_LEN * Math.sqrt(_rapierDrawNibScale(shape, recipe) * _rapierDrawEffectiveWidth(shape, true) / 2) + 16);
	const stub = (a, b, extend) => { const length = _rapierDrawDist(a, b), part = (extend ? Math.max(reach, Math.min(64, length)) : Math.min(reach, length)) / (length || 1); return a.map((v, i) => v + (b[i] - v) * part); };
	const candidates = [];
	// A detour may extend a short normal leg; the outline and head checks below
	// decide whether that extra room is clear, rather than the old bend's position.
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

// The counted work one scene may spend bettering its routes once every connector has its first: a grid visit counts
// one, a label placement RAPIER_DRAW_ROUTE_PLACE and a detour looked at RAPIER_DRAW_ROUTE_DETOUR. When it is spent the
// best routes found so far stand. Initial routes and label repairs have their own bounded searches, independent
// of this improvement allowance. Counts, not clocks, make a drawing route the same on every machine and reopen exact.
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
	// Only derived geometry is cached. Neither a layout graph nor a second route is saved;
	// moves, resizes, changed text metrics and SVG reopening all run the same scene solver.
	// The layout's transient rails switch is left out: a scene it accepted placed every label without a rail, so the
	// same scene solved with rails allowed (the file, reopened) routes the same.
	const key = _rapierDrawRouteKey(recipe);
	let saved = _RAPIER_DRAW_AUTO_ROUTES.get(recipe);
	if (saved?.key !== key || saved.fonts !== recipe?.fonts) {
		saved = _RAPIER_DRAW_ROUTE_SCENES.find(s => s.key === key && s.fonts === recipe?.fonts);
		// A scene found again is charged its whole work, so what a layout has spent never depends on what ran before it.
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
	// The scene measured once for every search and placement below, and the work it may still spend.
	const scene = {targets: _rapierDrawRouteTargets(recipe), rooms: new Map(edges.map(edge => [edge, _rapierDrawRouteRoom(edge)])), left: RAPIER_DRAW_ROUTE_WORK, spent: 0, routes: new WeakMap(), ink: null, owner: new WeakMap()};
	const paths = new Map(), rooms = scene.rooms, apart = new Map(edges.map(edge => [edge, edges.filter(other => other !== edge && !_rapierDrawRouteRelated(edge, other))]));
	const put = (edge, points) => { paths.set(edge, points); scene.owner.set(points, edge); };
	const unrelated = edge => new Set(apart.get(edge).map(other => paths.get(other)));
	for (const edge of edges) put(edge, _rapierDrawFindOrthogonalRoute(edge, recipe, [...paths.values()], null, scene));
	// Every connector has had its own bounded first search; this shared allowance is for improvements.
	scene.left = RAPIER_DRAW_ROUTE_WORK;
	const score = (edge, points, peers) => {
		const others = peers.map(s => paths.get(s));
		const away = unrelated(edge), mine = new Set([points]);
		let value = points.slice(1).reduce((n, b, i) => n + _rapierDrawRouteCost(points[i], b, others, rooms.get(edge), true, away) + _rapierDrawDist(points[i], b), points.length * 24);
		// Count the other labels' room too. A private improvement that worsens the
		// next connector can otherwise send two routes chasing one another forever.
		for (const peer of peers) { const path = paths.get(peer), far = apart.get(peer).includes(edge) ? mine : null; for (let i = 1; i < path.length; i++) value += _rapierDrawRouteCost(path[i - 1], path[i], [points], rooms.get(peer), true, far); }
		return value;
	};
	// Rip up one connector at a time, keeping only a strict improvement. This removes
	// crossings caused by routing order without oscillating between equal arrangements.
	for (let pass = 0; pass < edges.length && scene.left > 0; pass++) {
		let changed = false;
		for (const edge of edges) {
			const peers = edges.filter(s => s !== edge), others = peers.map(s => paths.get(s)), before = paths.get(edge), room = rooms.get(edge);
			if (!before.slice(1).some((b, i) => _rapierDrawRouteCost(before[i], b, others, room))) continue;
			const after = _rapierDrawFindOrthogonalRoute(edge, recipe, others, null, scene, true);
			if (!after) break;
			// Apart first, then fewer crossings, then the cheaper route.
			const far = apart.get(edge).map(other => paths.get(other)), shared = _rapierDrawRouteOverlap(after, far) - _rapierDrawRouteOverlap(before, far);
			if (shared < -.01) { put(edge, after); changed = true; continue; }
			if (shared > .01) continue;
			const delta = _rapierDrawRouteCrossings(after, others) - _rapierDrawRouteCrossings(before, others);
			if (delta < 0 || !delta && score(edge, after, peers) + .01 < score(edge, before, peers)) { put(edge, after); changed = true; }
		}
		if (!changed) break;
	}
	// A crossing-free route can still leave no straight stretch for its words.
	// Reserve an outside rail for that connector, then measure the whole scene
	// again. These rails are derived from the measured scene, never saved geometry.
	const labelEdges = recipe.shapes.filter(s => paths.has(s)), frames = recipe.shapes.filter(s => s.recognized === 'rect' && s.group === s.id);
	const placement = () => { const result = {}; scene.left -= RAPIER_DRAW_ROUTE_PLACE; scene.spent += RAPIER_DRAW_ROUTE_PLACE; result.ok = _rapierDrawPlaceConnectorLabels(labelEdges, recipe, frames, paths, result, false, scene); return result; };
	let placed = placement();
	// Giving one label room can expose an earlier label's dependency. Permit that
	// repair too, without revisiting a scene or exceeding the connector count.
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
			// Reject a worse score before polygon/head work. Once both measures reach
			// zero, no later candidate can improve this connector in this scene.
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
	// SVG admission copies the recipe. Four recent immutable geometry results avoid
	// rerouting identical copies on each export; this cache owns no editable state.
	_RAPIER_DRAW_ROUTE_SCENES.push(saved); if (_RAPIER_DRAW_ROUTE_SCENES.length > 4) _RAPIER_DRAW_ROUTE_SCENES.shift();
	return paths.get(shape) || _rapierDrawFindOrthogonalRoute(shape, recipe, []);
}

// Only the connectors whose endpoints, ink or captions touch the moved area are searched during a drag.
// This cache is a display projection. Pointer-up discards it and solves the final scene canonically once.
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
	// Fixed captions are only a drag optimisation. If they block a local repair, let the
	// canonical solver move every caption before refusing an otherwise valid scene.
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
		// The fixed captions are obstacles for a moved connector too.
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

function _rapierDrawRouteBlocked() { throw Object.assign(new RangeError('There is no clear route between these endpoints'), { code: 'drawing_route_blocked' }); }

// The shapes an automatic route bends around, measured once for a whole scene.
function _rapierDrawRouteTargets(recipe) {
	const targets = [];
	for (const target of recipe?.shapes || []) if (!_rapierDrawShapePaintsInk(target, recipe) && _rapierDrawAnchorFrame(target, recipe)) targets.push({target, box: _rapierDrawObstacleBox(target, recipe), half: _rapierDrawStrokeHalf(target, recipe)});
	return targets;
}

// Scratch for the grid search, grown once and reused: a scene's searches allocate nothing per visit.
const _RAPIER_DRAW_GRID = {size: 0};
function _rapierDrawGridScratch(count, phases) {
	const size = count * 2 * phases;
	if (_RAPIER_DRAW_GRID.size < size) Object.assign(_RAPIER_DRAW_GRID, {size, costs: new Float64Array(size), previous: new Int32Array(size), estimates: new Float64Array(size / 2), horizontalCost: new Float64Array(size / 2), verticalCost: new Float64Array(size / 2), heapCost: new Float64Array(size * 2), heapId: new Int32Array(size * 2)});
	return _RAPIER_DRAW_GRID;
}

// One connector's cheapest orthogonal route on the grid of every obstacle's padded edges and the other shafts'
// label-room tracks. `scene` (the solver's) carries the scene's measured targets, each connector's label room and
// its counted work: an optional search (`optional`) that would spend more than the work left returns null, and every
// search subtracts the grid visits it made. Visits alone count, so the same scene routes the same on any machine.
function _rapierDrawFindOrthogonalRoute(shape, recipe, occupied, rail, scene, optional) {
	const g = shape.geom, start = [g.x1, g.y1], end = [g.x2, g.y2];
	// A shaft of a connector that shares no piece with this one costs a crossing for every pixel run along it: two
	// unrelated connectors merged into one line can no longer be told apart, which a crossing never does to them.
	const apart = new Set(occupied.filter(path => { const owner = scene?.owner.get(path); return owner && !_rapierDrawRouteRelated(shape, owner); }));
	const room = scene?.rooms.get(shape) || _rapierDrawRouteRoom(shape), frames = [], routeCost = (a, b) => _rapierDrawRouteCost(a, b, occupied, room, true, apart) + _rapierDrawRouteCost(a, b, frames, room, false);
	const gap = Math.max(24, RAPIER_DRAW_ARROW_HEAD_LEN * Math.sqrt(_rapierDrawNibScale(shape, recipe) * _rapierDrawEffectiveWidth(shape, true) / 2) + 8) + _rapierDrawStrokeHalf(shape, recipe), obstacles = [];
	for (const {target, box: b, half} of scene?.targets || _rapierDrawRouteTargets(recipe)) {
		if (target === shape) continue;
		const pad = gap + half;
		// An ordinary grouped frame encloses its members. Their connectors may leave its border,
		// while the separate title remains a text obstacle with its own band.
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
	// Two bound boxes closer than two paddings (one dragged up to its neighbour) keep a way between them: this
	// connector's own two boxes give up padding along the axis that separates them and meet at the midline, so
	// the ports stand between the boxes and the run between them is open. Every other box keeps its padding.
	const bound = ['start', 'end'].map(end => obstacles.find(o => o.real && o.target.id === shape.bind?.[end]?.to));
	if (bound[0] && bound[1] && bound[0] !== bound[1]) for (const [lo, hi] of [['minX', 'maxX'], ['minY', 'maxY']]) {
		const [p, q] = bound, pair = p.real[hi] <= q.real[lo] ? [p, q] : q.real[hi] <= p.real[lo] ? [q, p] : null;
		if (!pair) continue;
		const [near, far] = pair, apart = far.real[lo] - near.real[hi];
		if (apart <= 0 || near[hi] <= far[lo]) continue;
		const mid = near.real[hi] + apart / 2;
		near[hi] = mid; far[lo] = mid;
	}
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
		const normal = box && _rapierDrawPortNormal(box.target, point, recipe);
		const distance = normal && Math.min(...normal.map((n, axis) => Math.abs(n) < 1e-8 ? Infinity : ((axis ? n > 0 ? box.maxY : box.minY : n > 0 ? box.maxX : box.minX) - point[axis]) / n));
		const ports = box ? [{point: point.map((v, axis) => v + normal[axis] * distance), axis: normal[0] === 0 ? 1 : normal[1] === 0 ? 0 : -1}] : [{ point, axis: -1 }];
		// The ray/box intersection is a grid boundary, even when division rounded it
		// a few ulps inside. Two nearly equal tracks would otherwise imprison the port.
		if (box) for (const port of ports) for (const axis of [0, 1]) for (const edge of axis ? [box.minY, box.maxY] : [box.minX, box.maxX]) if (Math.abs(port.point[axis] - edge) < 1e-7) port.point[axis] = edge;
		const poly = box && _rapierDrawShapePolygon(box.target, recipe);
		return ports.filter(port => port.point.every(_rapierDrawSpatial)
			&& !obstacles.some(other => other !== box && (crossed(point, port.point, other) || port.point[0] > other.minX && port.point[0] < other.maxX && port.point[1] > other.minY && port.point[1] < other.maxY))
			&& (!poly || !_rapierDrawClipSegment(point, port.point, poly).some(run => _rapierDrawDist(run[0], run[1]) > .01)))
			.map(port => ({ ...port, length: _rapierDrawDist(point, port.point) }));
	};
	const starts = terminals(start, 'start'), ends = terminals(end, 'end');
	if (!starts.length || !ends.length) _rapierDrawRouteBlocked();
	// Eight simple channels are the bounded fallback if the weighted grid spends its allowance.
	// They are tested against every obstacle; exhaustion never substitutes a line through a box.
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
	// Only the shafts near this connector's own span lay tracks: a shaft far outside it cannot be run beside.
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
	if (count > 65536) { const points = optional ? null : fallback(); if (points || optional) return points; _rapierDrawRouteBlocked(); }
	// Laying out the grid costs about half a visit a cell; an optional search that could not even do that stops here.
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
	// Project occupied segments onto the grid once. Scanning every other shaft at
	// every visit made dense joins needlessly quadratic inside the search itself.
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
	// The lower bound to the nearest end, through the rail first when one is reserved: one number per cell and phase.
	let viaRail = Infinity;
	if (rail) for (const port of ends) { const d = Math.abs(rail[1][0] - port.point[0]) + Math.abs(rail[1][1] - port.point[1]) + port.length; if (d < viaRail) viaRail = d; }
	for (let at = 0, y = 0; y < ny; y++) for (let x = 0; x < nx; x++, at++) {
		let nearest = Infinity;
		for (let e = 0; e < ends.length; e++) { const port = ends[e], d = Math.abs(xs[x] - port.point[0]) + Math.abs(ys[y] - port.point[1]) + port.length; if (d < nearest) nearest = d; }
		if (rail) { estimates[at] = Math.abs(xs[x] - rail[0][0]) + Math.abs(ys[y] - rail[0][1]) + (Math.abs(rail[0][0] - rail[1][0]) + Math.abs(rail[0][1] - rail[1][1])) + viaRail; estimates[count + at] = nearest; }
		else estimates[at] = nearest;
	}
	// A binary heap on (priority, id); priorities are unique per id, so its order is the order of the pairs.
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
				// The reserved rail is crossed by nothing and entered only at its own ends.
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
	if (bestId < 0) { const points = fallback(); if (points) return points; _rapierDrawRouteBlocked(); }
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

function _rapierDrawArrowRoutePoints(shape, recipe) {
	const g = shape.geom;
	if (!g) return null;
	const route = shape.route || 'straight';
	if (route === 'auto') return _rapierDrawOrthogonalRoute(shape, recipe);
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

// Exact bbox of an already-emitted route: a straight/elbow/auto route is a polyline, so its bbox is
// just its own vertices; a curved route is one quadratic segment whose true extremum can fall
// strictly between the endpoints, so probe it the same way this has always been done. Shared so any
// caller already holding real route points -- rotated into a local frame or not -- gets the exact box
// of what was actually emitted, instead of re-deriving a route from raw endpoints (which would let an
// elbow or automatic connector route again and reflect a path that was never painted).
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

function _rapierDrawShapeMarkup(shape, recipe) {
	let body = '';

	const ink = _rapierDrawShapeInk(shape);
	const isLineKind = shape.recognized === 'line' || shape.recognized === 'arrow';
	const isArc = shape.recognized === 'arc';

	const paintsInk = _rapierDrawShapePaintsInk(shape, recipe);
	const parts = isLineKind && !paintsInk && shape.geom ? _rapierDrawArrowParts(shape, recipe) : null;
	const headEnd = parts?.headEnd, headStart = parts?.headStart;
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	// A stroke painted as drawn takes any ink brush whatever the recognizer read into it (the Brush
	// tool's own freehand look included); a recognized figure takes the brushes for its kind.
	const brushEligible = shape.brush && shape.brush !== 'ink' && (!paintsInk ? shape.recognized !== 'ink' : true);
	let brushed = null;
	if (brushEligible) {
		if (parts) brushed = parts.contours.map(points => _rapierDrawBrushMarkup({ ...shape, recognized: 'ink', stroke: 0, geom: null }, { ...recipe, strokes: [{ pts: points.map(p => p.concat(0)) }] }) || '').join('');
		// D04: not every material has a raw "as-drawn" ink rendering to fall back on. Spring, rope,
		// tube, ray and light (and the freehand 'brush' look, which reads shape.recognized not at
		// all) genuinely coil or tube along the actual stroke instead of the idealised line/arrow, so
		// forcing their geometry to 'ink' when the shape paints as drawn is how they pick that ink
		// path. A Physico FIGURE material -- sphere, wheel, pulley, wood, knot, lens -- is a property
		// of the recognized geometry itself and defines no separate ink rendering at all; forcing its
		// kind to 'ink' left every one of their own kind-guards false, so the shape fell all the way
		// through to plain ink while `shape.brush` still (truthfully, uselessly) named the material.
		// One capability rule, read here alone: only a brush that actually owns an 'ink'-kind
		// renderer asks for the ink interpretation.
		else if (!paintsInk && RAPIER_DRAW_INK_LOOK_BRUSHES.has(shape.brush)) {
			// Cleaning the recognized figure keeps its chosen material and the original stroke.
			const points = _rapierDrawShapePolyline({ ...shape, brush: 'ink' }, recipe);
			if (points?.length > 1) brushed = _rapierDrawBrushMarkup({ ...shape, recognized: 'ink', stroke: 0, geom: null }, { ...recipe, strokes: [{pts: points}] });
		}
		else brushed = _rapierDrawBrushMarkup(paintsInk && RAPIER_DRAW_INK_LOOK_BRUSHES.has(shape.brush) ? { ...shape, recognized: 'ink' } : shape, recipe);
	}
	if (brushed != null) {
		body = brushed;
	 } else if (paintsInk && shape.cut) {
		// D05: an erased fragment of a dashed contour is a `cut` ink shape -- its own true, exact
		// endpoints are the run's own two ends (erase never invents intermediate ones), so the same
		// render-time solver every dashed line or arc already uses just needs this fragment's own
		// length to land N dashes and N-1 gaps on those two ends, precisely as it would for a whole,
		// uncut shape this length.
		const cutWidth = _rapierDrawEffectiveWidth(shape);
		body = '<path d="' + _rapierDrawPolylinePathD(stroke.pts) + '" fill="none" stroke="' + ink + '" stroke-width="' + _rapierDrawFmt(cutWidth) + '" stroke-linecap="round" stroke-linejoin="round"' +
			_rapierDrawDashAttrs(_rapierDrawPerimeter(stroke.pts, false), cutWidth, shape.dash) + '/>';
	} else if (paintsInk) {

		// F75-8: the smoothing dial's one plan. The curve fit is tried first, directly on the raw
		// (only de-duplicated, at most resampled for a huge stroke) points -- least squares already
		// discounts a hand's jitter on its own; running it after the causal freehand streamline or a
		// corner-seeking RDP pass would bias a fit against a steeply curving stroke, not clean it up.
		// When no fit is accepted the line still gets the founder's ordering for its own polyline:
		// freehand streamline (the centreline math Brush's own outline is built on, no outline/no
		// taper), the box-relax settle, then RDP simplification. One rendered `<path>`, one width --
		// Pen is "one width" (intent.md); no per-segment speed taper.
		const plan = _rapierDrawSmoothPlan(shape.smooth ?? recipe?.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT);
		const fitted = _rapierDrawFitStroke(stroke.pts, plan);

		if (fitted) {
			body = '<path d="' + _rapierDrawSmoothPathD(fitted.sample(48), false, true) +
				'" fill="none" stroke="' + ink + '" stroke-width="6.4" stroke-linecap="round"/>';
		} else {
			const streamed = _rapierDrawStreamlineStroke(stroke.pts, plan.streamline);
			const settled = _rapierDrawRelaxStroke(streamed, plan.settle);
			// D02: closure is an inference the requested correction is allowed to make (`plan.curve`
			// is false only at smoothing 0 -- see _rapierDrawSmoothPlan), never something zero
			// correction reaches for on its own; at 0 the sampled polyline renders exactly as open or
			// closed as the person actually drew it, one shared decision with _rapierDrawShapePolyline
			// below for hit-test, contour and occupancy projection.
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
	} else if (shape.recognized === 'paint') {
		body = _rapierDrawPaintMarkup(shape, recipe);
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
	// A precise filled figure already uses its ink; recolouring its second ink would erase it.
	if (ink !== RAPIER_DRAW_INK && !shape.border && !shape.authorStyle && !['cylinder', 'subroutine'].includes(shape.recognized)) body = body.replaceAll(RAPIER_DRAW_INK, ink);
	if (shape.label) { const label = (parts?.label || _rapierDrawTextLayout(shape, recipe)).markup; body += shape.authorStyle ? '<g data-author-label="">' + label + '</g>' : label; }
	if (shape.effect) body = copierMarkup(shape.effect, body, _rapierDrawShapePaintedBBoxIn({ ...shape, effect: undefined }, recipe), 'shape:' + shape.id);

	// The element's own fade is its group's SVG opacity, so every viewer shows it.
	return '<g data-shape-id="' + _rapierDrawEscapeAttr(shape.id) + '" data-brush="' + _rapierDrawEscapeAttr(shape.brush) + (shape.opacity != null ? '" opacity="' + _rapierDrawFmt(shape.opacity) : '') + '">' + body + '</g>';
}

// The paint layer as an SVG <image>: the PNG's pixel grid mapped onto the shape's frame (four
// corners, so a rotated, flipped or sheared layer is one matrix), preserveAspectRatio="none" so the
// frame is the truth. Every SVG viewer renders an embedded PNG; nothing here needs Rapier.
function _rapierDrawPaintMarkup(shape, recipe) {
	const frame = _rapierDrawShapePolygon(shape, recipe), px = shape.paint?.px;
	if (!frame || !shape.raster) return '';
	const w = px?.[0] || 1, h = px?.[1] || 1;
	const a = (frame[1][0] - frame[0][0]) / w, b = (frame[1][1] - frame[0][1]) / w, c = (frame[3][0] - frame[0][0]) / h, d = (frame[3][1] - frame[0][1]) / h;
	const matrix = [a, b, c, d, frame[0][0], frame[0][1]].map(n => (Math.round(n * 100000) / 100000).toString()).join(' ');
	return '<image data-rapier-paint="' + _rapierDrawEscapeAttr(shape.id) + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" transform="matrix(' + matrix + ')" href="' + shape.raster + '"/>';
}

// The metadata recipe omits every layer's pixels (they live in the <image> right beside it);
// restorePaint reads them back, so the JSON stays a description and the file carries each byte once.
function _rapierDrawStripRasters(recipe) {
	return recipe.shapes.some(shape => shape.raster) ? { ...recipe, shapes: recipe.shapes.map(shape => shape.raster ? { ...shape, raster: undefined } : shape) } : recipe;
}
function _rapierDrawRestorePaint(recipe, svg) {
	if (!recipe || !Array.isArray(recipe.shapes) || !recipe.shapes.some(shape => shape && shape.recognized === 'paint')) return recipe;
	// SVG image resources own the pixels; metadata must not introduce a different editable painting.
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

// Every pixel a shape can actually put on the canvas, not just its bare geometry: the paint pad
// (stroke half-width, or a brush's own reach like the tube brush's tube radius), arrow/line heads
// (which can point outward past the shaft's own endpoint box), the angle/length decoration rings,
// and the label's padded paint polygon from draw/text.mjs (which already includes italic overhang).
// One shared helper so content wrapping (contentBox in edit.mjs) and the SVG crop below can never
// silently disagree about what a shape actually paints.
function _rapierDrawShapePaintedBBoxIn(shape, recipe) {
	const box = _rapierDrawShapeBBoxIn(shape, recipe);
	let minX = box.minX, minY = box.minY, maxX = box.maxX, maxY = box.maxY;
	const add = (b, pad = 0) => { if (!b) return; minX = Math.min(minX, b.minX - pad); minY = Math.min(minY, b.minY - pad); maxX = Math.max(maxX, b.maxX + pad); maxY = Math.max(maxY, b.maxY + pad); };
	add(box, _rapierDrawPaintPad(shape, recipe));
	// Miter joins can reach beyond a half-width axis pad at an acute polygon corner.
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
	return shape.effect ? copierBounds(shape.effect, bounds) : bounds;
}

function _rapierDrawCopierFrame(recipe) {
	const ink = _rapierDrawUnionView({ ...recipe, effect: undefined });
	return { minX: Math.min(0, ink?.minX ?? 0), minY: Math.min(0, ink?.minY ?? 0), maxX: Math.max(recipe.canvas.w, ink?.maxX ?? 0), maxY: Math.max(recipe.canvas.h, ink?.maxY ?? 0) };
}
function _rapierDrawUnionView(recipe) {
	if (recipe.effect?.strength) return copierBounds(recipe.effect, _rapierDrawCopierFrame(recipe));
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const shape of recipe.shapes) {
		const box = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		minX = Math.min(minX, box.minX); minY = Math.min(minY, box.minY); maxX = Math.max(maxX, box.maxX); maxY = Math.max(maxY, box.maxY);
	}
	return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// Exported (unlike its _rapierDrawUnionView helper) so a caller that only needs the crop geometry
// -- not the rendered markup -- can get it without paying for _rapierDrawSceneMarkup's text build:
// layout/browser.js's per-frame rotate preview calls this directly (with no `measured`, the same
// analytic-bounds path _rapierDrawBuildSVG itself takes when Draw has no live browser measurement
// to offer) to drive the wrap obstacle and on-screen box every frame, while the full writer below
// still owns turning that same view into the one candidate that gets decoded and, at release,
// admitted -- this never computes a second, independent crop.
function _rapierDrawInkView(recipe, measured) {
	// Native getBBox reads source geometry only; it cannot bound a filter's copied ink.
	if (recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength)) measured = null;
	const valid = measured && ['minX', 'minY', 'maxX', 'maxY'].every(k => Number.isFinite(measured[k])) && measured.maxX >= measured.minX && measured.maxY >= measured.minY;
	const box = valid ? { ...measured } : _rapierDrawUnionView(recipe);
	if (!box) return null;
	// A browser's geometry-only getBBox can omit strokes. Keep a border's analytic joins too.
	if (valid) for (const shape of recipe.shapes) if (shape.border || shape.authorStyle?.stroke) {
		const ink = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		box.minX = Math.min(box.minX, ink.minX); box.minY = Math.min(box.minY, ink.minY);
		box.maxX = Math.max(box.maxX, ink.maxX); box.maxY = Math.max(box.maxY, ink.maxY);
	}
	let pad = RAPIER_DRAW_VIEW_PAD;
	if (valid) for (const shape of recipe.shapes) pad = Math.max(pad, _rapierDrawStrokeHalf(shape, recipe) + 2);
	// Whole-pixel viewport: expand outward (floor the min, ceil the max) instead of rounding to a
	// hundredth, so the crop never clips content AND `width`/`height` already equal the viewBox size
	// as plain integers. Asset admission's own integer rounding (images/assets.mjs svgGeometry) is
	// then a no-op -- this is the one place a candidate's coordinate frame gets fixed, so a live
	// preview and the admitted asset can never disagree by a rounding fraction.
	const x = Math.floor(box.minX - pad), y = Math.floor(box.minY - pad);
	return { x, y, w: Math.ceil(box.maxX + pad) - x, h: Math.ceil(box.maxY + pad) - y };
}

// Live work and its Download keep raster bytes regardless of document admission limits. This
// opt-in is an argument, never a recipe field: untrusted file/clipboard readers keep their caps,
// and even live work still passes the same raster signatures, geometry and computation limits.
function _rapierDrawBuildSVG(input, measure, keepRasters = false) {
	const recipe = _rapierDrawAdmitRecipe(input, keepRasters);
	return recipe ? _rapierDrawSerializeSVG(recipe, measure, keepRasters) : '';
}

function _rapierDrawSceneWork(recipe) {
	let work = 0, text = 0, obstacles = 0, automatic = 0;
	for (const shape of recipe.shapes) {
		text += shape.label?.length || 0;
		const paintsInk = _rapierDrawShapePaintsInk(shape, recipe);
		if (!paintsInk && (['circle', 'ellipse', 'rect', 'triangle', 'text', 'paint'].includes(shape.recognized) || Object.hasOwn(RAPIER_DRAW_POLYGONS, shape.recognized))) obstacles++;
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

function _rapierDrawSceneMarkup(recipe, includeFonts = true, keepRasters = false) {
	_rapierDrawSceneWork(recipe);
	let body = includeFonts ? fontDefs(recipe.fonts) : '';
	let work = body.length;
	_rapierDrawWorkCount(work, 16 * 1024 * 1024);
	for (let i = 0; i < recipe.shapes.length; i++) {
		const shape = recipe.shapes[i], pieces = [shape];
		// Lossless storage pieces still form one painting. Share the filter across adjacent
		// pieces with the same settings, without moving any intervening artwork in the stack.
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
			markup = '<g data-rapier-copy-layer=""' + (shape.opacity != null ? ' opacity="' + _rapierDrawFmt(shape.opacity) + '"' : '') + '>' + copierMarkup(shape.effect, pieces.map(piece => _rapierDrawShapeMarkup({ ...piece, effect: undefined, opacity: undefined }, recipe)).join(''), _rapierDrawUnionView(source), 'layer:' + shape.id) + '</g>';
		} else markup = _rapierDrawShapeMarkup(shape, recipe);
		// Copying kept pixels is not geometry work; a large photo must not exhaust the vector budget.
		work += markup.length - (keepRasters && shape.recognized === 'paint' ? pieces.reduce((sum, piece) => sum + piece.raster.length, 0) : 0);
		_rapierDrawWorkCount(work, 16 * 1024 * 1024);
		body += markup;
	}
	return recipe.effect ? copierMarkup(recipe.effect, body, _rapierDrawCopierFrame(recipe), 'canvas', true) : body;
}

function _rapierDrawSerializeSVG(recipe, measure, keepRasters = false) {
	// Crop only the SVG view; recipe canvas and geometry stay in their original drawing coordinates.
	delete recipe.view;
	const body = _rapierDrawSceneMarkup(recipe, true, keepRasters);
	let measured = null;
	if (typeof measure === 'function') try { measured = measure(body, recipe.canvas.w, recipe.canvas.h); } catch (_) {}
	const view = _rapierDrawInkView(recipe, measured) || { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h };
	recipe.view = view;
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [view.x, view.y, view.w, view.h].map(_rapierDrawFmt).join(' ') + '" width="' + _rapierDrawFmt(view.w) + '" height="' + _rapierDrawFmt(view.h) + '" color="' + RAPIER_DRAW_INK + '"><metadata id="rapier-draw">' + _rapierDrawEscapeXML(JSON.stringify(_rapierDrawStripRasters(recipe.fonts?.length ? { ...recipe, fonts: fontMetadata(recipe.fonts) } : recipe))) + '</metadata>' + _rapierDrawDiagramDark(body, recipe) + body + '</svg>';
}

function _rapierDrawInterpolatePoint(a, b, t) {
	return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? (i === 3 ? .5 : 0)) + ((b[i] ?? (i === 3 ? .5 : 0)) - (a[i] ?? (i === 3 ? .5 : 0))) * t);
}

function _rapierDrawStrokeHalf(shape, recipe) {
	if (shape.recognized === 'paint') return 0;
	const nib = _rapierDrawShapeNib(shape, recipe);
	if (shape.cutWidth && (shape.cut || !_rapierDrawShapePaintsInk(shape, recipe))) return shape.cutWidth * nib / (2 * RAPIER_DRAW_NIB_DEFAULT);
	// D01: the non-painting case's padding tracks the same resolved outline weight the render
	// actually paints (RAPIER_DRAW_SHAPE_WIDTH's own half, 1.3, falls out of this unchanged for a
	// Shape-tool figure with no mark under it; a recognized figure that still carries one gets the
	// wider ink padding to match).
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
		// D02: the same one shared closure decision the render path makes (plan.curve gates it,
		// never zero correction) -- contour and occupancy projection see exactly the open or closed
		// stroke a person would see rendered, not a second, independent guess.
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
	if (shape.recognized === 'line') return [[g.x1, g.y1, 0], [g.x2, g.y2, 0]];
	if (shape.recognized === 'arrow') return _rapierDrawArrowHitPolyline(shape, recipe).map(p => p.concat(0));
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

// Lowers the agent-facing figure list (docs/agents.md's short grammar) into ordinary recipe shapes:
// a box figure becomes one rect/ellipse/triangle shape from its bounding box, text becomes a text
// shape, and an arrow/line's from/to either supplies a raw point or names another figure's own
// label or id to bind to (anchored at its centre; the shared writer's own bind resolution -- called
// from _rapierDrawAdmitRecipe below -- snaps that to the real edge, same as any other connector).
// `existing` seeds the label/id lookup so a shapes-patch add (_rapierDrawApplyShapesPatch) can bind
// a new figure to a shape the recipe already has.
// D03: the same immutable visual seed a human creation mints (draw.js's own _rapierDrawMintSeed,
// Math.random -- a door-side fact this decision core may not read itself, docs/kernel.md "The
// gates") -- an agent figure has no field of its own to request one from (docs/agents.md,
// AGENT-TOOLS.json), so lowering mints one here, once, the one place every agent-authored shape is
// actually created, purely from what this call already received: the figure's own authored
// description and its position among the figures this one call is lowering (so two different
// figures lowered together still read apart). Without it a lowered figure's texture depended on its
// own id (_rapierDrawShapeSeedBase's fallback), and a zero-offset Duplicate -- which remints the id
// on purpose, identity aside -- would silently reroll a brand-new texture for what is visually the
// same shape. Two calls that happen to lower an identical figure at the same position share a
// texture; unlike Math.random, that is the whole of the cost of staying pure.
function _rapierDrawFigureSeed(figure, index) { return _rapierDrawSeed(index + ':' + JSON.stringify(figure)); }

// A figure that cannot lower names itself: the first faulty figure's index, the field, and what the field takes
// (the lane of 26 September, walked as the agent: a bare figures_invalid sent the agent guessing between kind,
// the ink form and the point form). The kernel puts the fault beside its refusal; the grammar itself stays here.
// A figure graph is only a creation instruction. Layout writes ordinary geometry, labels and binds;
// the saved drawing has no graph owner or second editing model.
function _rapierDrawLayered(nodes, edges, across, gap, sibling = gap) {
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
	for (const node of nodes) if (!state.has(node.id)) visit(node.id);
	const ranks = new Map(nodes.map(node => [node.id, 0]));
	for (const id of order.reverse()) for (const edge of next.get(id)) if (!backward.has(edge)) ranks.set(edge.to, Math.max(ranks.get(edge.to), ranks.get(id) + 1));
	const rows = [];
	for (const node of nodes) (rows[ranks.get(node.id)] ||= []).push(node);
	// Alternating barycentres keep connected pieces aligned; input order breaks every tie.
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
	// Across each rank a node starts packed and centred, then moves to where its links want it: its centre on the median
	// of its parents' exits on the way down and of its children's on the way up, in order and never nearer a neighbour
	// than the sibling gap. A decision's two or three children stand beyond its side vertices, where its exits turn once.
	const at = new Map();
	rows.forEach((row, rank) => { let side = (wide - widths[rank]) / 2; for (const node of row) { at.set(node, side); side += breadth(node) + sibling; } });
	const centre = node => at.get(node) + breadth(node) / 2, rank = new Map(rows.flatMap((row, index) => row.map(node => [node, index])));
	const forward = edges.filter(edge => byId.has(edge.from) && byId.has(edge.to) && !backward.has(edge) && edge.from !== edge.to);
	const beyond = (from, to) => {
		if (from.shape?.recognized !== 'diamond') return 0;
		const out = forward.filter(edge => edge.from === from.id).map(edge => byId.get(edge.to)).sort((a, b) => centre(a) - centre(b));
		if (out.length < 2 || out.length > 3) return 0;
		const index = out.indexOf(to), reach = breadth(from) / 2 + 32 + breadth(to) / 2;
		return index === 0 ? -reach : index === out.length - 1 ? reach : 0;
	};
	// Two neighbours joined by a captioned line stand far enough apart for the caption over it.
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
	shape.labelWidth = Math.ceil(Math.max(72, Math.min(224, Math.sqrt(natural.measuredWidth * natural.measuredHeight * 3))));
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
	// Within one solve (`memo`), a route's painted geometry, its ink boxes and its words' layout are measured once per
	// route and reused by every placement that route takes part in.
	const measured = shape => {
		const points = paths?.get(shape);
		let entry = points && memo?.routes.get(points);
		if (!entry) {
			const geometry = _rapierDrawArrowGeometry(shape, scene, points), pad = _rapierDrawStrokeHalf(shape, scene), heads = [];
			for (const head of [geometry.headStart, geometry.headEnd]) if (head) heads.push(grow(_rapierDrawBBox(head.poly), head.kind === 'arrow' ? pad : 0));
			// Keep the lead's twenty-pixel tip clearance as well as the eight-pixel ink gap.
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
		// In the line first, as the diagram look was approved; beside a straight leg when no leg can carry it.
		for (const beside of [false, true]) {
			if (best) break;
			for (const [index, segment] of geometry.segments.entries()) if (segment.length === 2) {
			const [a, b] = segment, dx = b[0] - a[0], dy = b[1] - a[1], length = _rapierDrawDist(a, b), upright = Math.abs(dx) < 1e-7;
			if (beside && !upright && Math.abs(dy) > 1e-7) continue;
			const [left, right, top, bottom] = extents(beside ? natural : laid), shift = beside ? upright ? [RAPIER_DRAW_BESIDE + left, 0] : [0, -RAPIER_DRAW_BESIDE - bottom] : [0, 0];
			// A label belongs to a straight clear stretch, not a sampled bend. Its own
			// adjoining segments and round caps need the same ink clearance as any other.
			const obstacles = blocked.concat(entry.segments.filter((_, i) => beside || i !== index));
			const extent = (Math.abs(dx) * Math.max(left, right) + Math.abs(dy) * Math.max(top, bottom)) / length + 8 + _rapierDrawStrokeHalf(shape, scene);
			let clear = [[extent / length, 1 - extent / length]].filter(([lo, hi]) => hi >= lo);
			const ax = a[0] + shift[0], ay = a[1] + shift[1];
			for (const box of obstacles) {
				let lo = 0, hi = 1;
				// The stretch of the leg where the label, grown by eight pixels, would meet this box, one axis at a time.
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
	// A triangle's binding frame starts at its apex, not at its bounding-box corner.
	const box = _rapierDrawShapeBBoxIn(shape, scene), point = _rapierDrawEdgeSnapPoint(box.minX + ax * box.w, box.minY + ay * box.h, shape, scene).point;
	const f = _rapierDrawAnchorFrame(shape, scene), x = point[0] - f.x, y = point[1] - f.y, det = f.ux * f.vy - f.uy * f.vx;
	return {ax: _rapierDrawClamp((x * f.vy - y * f.vx) / det, 0, 1), ay: _rapierDrawClamp((y * f.ux - x * f.uy) / det, 0, 1)};
}

function _rapierDrawChooseReturnSides(edges, alternatives, scene) {
	// A return connector that crosses another tries the opposite outside sides: routed alone against the others as they
	// stand, one search, kept when it crosses fewer. The scene is solved once more, whole, with the sides chosen.
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

function _rapierDrawLayoutFigures(shapes, automatic, groups, existing, direction) {
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
	const bottom = Math.max(0, ...fixed.map(shape => _rapierDrawShapeBBoxIn(shape, scene).maxY));
	const owner = new Map(), grouped = new Set();
	for (const group of groups) for (const id of group.members) { owner.set(id, group.id); grouped.add(id); }
	for (const {title} of groups) { Object.assign(title, {textFont: 'mono', textCase: 'upper', letterSpacing: .16, textSize: 11}); delete title.textBold; }
	const frameShapes = groups.flatMap(group => [group.rule, group.title]);
	scene.shapes = [...frameShapes, ...existing, ...shapes];
	// One eight-pixel unit sets both rank and sibling gaps. Box extents always come
	// from text measurement, including any room a style adds inside the box.
	const ladder = [10, 15, 20, 30, 40, 60, 80];
	const spentAtStart = _RAPIER_DRAW_ROUTE_SPENT.work;
	for (const unitsGap of ladder) {
		// A layout that has spent its work on narrower gaps goes straight to the widest, where rails give every label room.
		if (unitsGap !== ladder.at(-1) && _RAPIER_DRAW_ROUTE_SPENT.work - spentAtStart > RAPIER_DRAW_LAYOUT_WORK) continue;
		// Widen the measured layout before sending a label around its outside. This
		// transient planning option is not part of the resulting ordinary recipe.
		scene.routeLabelRails = unitsGap === ladder.at(-1);
		const gap = 8 * unitsGap, units = nodes.filter(node => !grouped.has(node.id));
		// Down the page a group is a row, its members side by side, the rows stacked: a phone's page holds it whole.
		for (const group of groups) {
			// The row's steps stand evenly apart, far enough for the widest caption over a line between them.
			const words = links.filter(link => link.shape.label && group.members.includes(link.from) && group.members.includes(link.to) && link.from !== link.to)
				.map(link => Math.ceil((layoutText({...link.shape, labelPos: .5}, {path: [[-512, 0], [512, 0]]}).bounds.w + 64) / 8) * 8);
			const members = group.members.map(id => nodeMap.get(id)), inner = _rapierDrawLayered(members, links, true, Math.max(gap, ...words), Math.max(64, gap / 2));
			const title = layoutText(group.title), w = Math.max(inner.w + 64, title.bounds.w + 64), h = inner.h + title.bounds.h + 128;
			group.unit = {id: group.id, w, h}; units.push(group.unit);
			for (const node of members) { node.x += (w - inner.w) / 2; node.y += title.bounds.h + 96; }
		}
		_rapierDrawLayered(units, links.map(edge => ({from: owner.get(edge.from) || edge.from, to: owner.get(edge.to) || edge.to})).filter(edge => edge.from !== edge.to), across, gap, Math.max(64, gap / 2));
		// Each row reads the way that keeps its links to the rows placed before it shortest, so a flow runs on down the
		// side it ended on.
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
		// A group is a typographic band: a hairline rule over its title, the width of its members, the title on their
		// left edge. Across, the groups stand side by side and their bands share the highest line, as running heads do.
		// The band is final before any route is found, so the routes the layout proves are the routes the file keeps.
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
			// Two pieces side by side in one row (or one above the other in a column across) face each other: the line runs
			// straight between the facing sides. Two groups' rows join at the end they share, down its outside.
			if (b && other !== target && (across ? Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) : Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)) > 0) {
				const toward = across ? b.minY + b.maxY > a.minY + a.maxY : b.minX + b.maxX > a.minX + a.maxX;
				bind.ax = across ? .5 : toward ? 1 : 0; bind.ay = across ? toward ? 1 : 0 : .5;
				Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay));
				continue;
			}
			if (!across && b && other !== target && owner.get(target.id) && owner.get(other.id) && owner.get(target.id) !== owner.get(other.id)) {
				const row = id => groups.find(g => g.id === owner.get(id)).members.map(m => _rapierDrawShapeBBoxIn(nodeMap.get(m).shape, scene));
				const mine = row(target.id), theirs = row(other.id), right = box => box.maxX, left = box => box.minX;
				const atEnd = (boxes, box, pick, most) => pick(box) === most(...boxes.map(pick));
				const side = atEnd(mine, a, right, Math.max) && atEnd(theirs, b, right, Math.max) ? 1 : atEnd(mine, a, left, Math.min) && atEnd(theirs, b, left, Math.min) ? 0 : null;
				if (side != null && mine.length > 1 && theirs.length > 1) { bind.ax = side; bind.ay = .5; Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay)); continue; }
			}
			const forward = b && (end === 'start' ? across ? a.minX < b.minX : a.minY < b.minY : across ? b.minX < a.minX : b.minY < a.minY);
			const otherAxis = edge => {
				const peer = nodeMap.get(edge.bind?.[end === 'start' ? 'end' : 'start']?.to);
				if (!peer) return 0;
				const box = _rapierDrawShapeBBoxIn(peer.shape, scene); return across ? box.minY + box.maxY : box.minX + box.maxX;
			};
			const siblings = edges.filter(edge => edge.bind?.[end]?.to === bind.to).sort((a, b) => otherAxis(a) - otherAxis(b)), index = siblings.indexOf(shape), fraction = (index + 1) / (siblings.length + 1);
			bind.ax = across ? forward ? end === 'start' ? 1 : 0 : fraction : forward ? fraction : 1;
			bind.ay = across ? forward ? fraction : 1 : forward ? end === 'start' ? 1 : 0 : fraction;
			// A diamond has points, not edges: its connectors leave and arrive at its vertices -- the flow's own vertex
			// first, then the side vertices in order across -- never partway along a slanted side.
			if (forward && target.shape.recognized === 'diamond') {
				const flowX = across ? (end === 'start' ? 1 : 0) : .5, flowY = across ? .5 : (end === 'start' ? 1 : 0);
				const vertices = siblings.length === 1 ? [[flowX, flowY]] : siblings.length === 2
					? (across ? [[.5, 0], [.5, 1]] : [[0, .5], [1, .5]]) : across ? [[.5, 0], [flowX, flowY], [.5, 1]] : [[0, .5], [flowX, flowY], [1, .5]];
				const at = vertices[Math.min(index, vertices.length - 1)];
				bind.ax = at[0]; bind.ay = at[1];
			}
			// A back edge (a retry) leaves and arrives at the middle of a side, so its line runs clear outside the forward flow.
			if (!forward && other !== target) {
				const boxes = nodes.map(node => _rapierDrawShapeBBoxIn(node.shape, scene));
				const middle = across ? (Math.min(...boxes.map(b => b.minY)) + Math.max(...boxes.map(b => b.maxY))) / 2 : (Math.min(...boxes.map(b => b.minX)) + Math.max(...boxes.map(b => b.maxX))) / 2;
				const side = across ? (a.minY + a.maxY + (b ? b.minY + b.maxY : a.minY + a.maxY)) / 4 : (a.minX + a.maxX + (b ? b.minX + b.maxX : a.minX + a.maxX)) / 4;
				const positive = across && (target.shape.group || other?.shape.group) || side > middle;
				bind.ax = across ? .5 : positive ? 1 : 0; bind.ay = across ? positive ? 1 : 0 : .5;
				if (!alternatives.has(shape)) alternatives.set(shape, []);
				alternatives.get(shape).push({bind, alternate: _rapierDrawFigurePort(target.shape, scene, across ? .5 : 1 - bind.ax, across ? 1 - bind.ay : .5)});
			}
			// A self-loop leaves the right side and comes back into the bottom; a box's loop leaves high on its side, so the
			// loop's upright leg is long enough to carry its words beside it.
			if (other === target) { bind.ax = end === 'start' ? 1 : .5; bind.ay = end === 'start' ? ['rect', 'text'].includes(target.shape.recognized) ? .2 : .5 : 1; }
			Object.assign(bind, _rapierDrawFigurePort(target.shape, scene, bind.ax, bind.ay));
		}
		// Zero bends first, then centred: a forward connector between two boxes drops straight when one line runs through
		// the middle 60% of both facing sides, nearest the target's centre; from a decision's side vertex it turns once,
		// into the middle 60% of its box beyond the decision. Only a box's straight sides slide; a curve keeps its middle.
		for (const shape of edges) {
			const from = nodeMap.get(shape.bind?.start?.to), to = nodeMap.get(shape.bind?.end?.to);
			if (!from || !to || from === to) continue;
			const a = _rapierDrawShapeBBoxIn(from.shape, scene), b = _rapierDrawShapeBBoxIn(to.shape, scene), lo = across ? 'minY' : 'minX', hi = across ? 'maxY' : 'maxX';
			if (across ? a.maxX > b.minX : a.maxY > b.minY) continue;
			const flowing = (bind, box) => across ? Math.abs(bind.ax - (bind === shape.bind.start ? 1 : 0)) < 1e-9 : Math.abs(bind.ay - (bind === shape.bind.start ? 1 : 0)) < 1e-9;
			if (!flowing(shape.bind.end, b) || from.shape.recognized !== 'diamond' && !flowing(shape.bind.start, a)) continue;
			if (!['rect', 'text'].includes(to.shape.recognized)) {
				// Into a curve or a point the line meets the middle; a box's exit slides to meet it straight.
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
		// Reverse positions and ports, never labels or a shape's own handedness. The same router then solves the
		// actual final outlines; reflecting SVG markup would also reflect the words and the asymmetric contour.
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

// The diagram look on the coordinate-free figures, set before layout so the planner measures what will be drawn: each
// box and decision a solid field of the grey, the first outcome the author names (a box arrows reach and none leave)
// the accent; connector captions and group titles small spaced mono capitals; a step number in every box but the decision
// when the set is numbered. An author's own fill or stroke stays above the style; placed figures are never touched.
// Numbers are Rapier's, never the agent's: a directed flow with one start and no groups has them, nothing else does.
// Returns the numbered boxes, whose figures are set once the layout has placed them.
function _rapierDrawDiagramDress(shapes, automatic, groups) {
	const nodes = automatic.filter(shape => shape.recognized !== 'text'), ids = new Set(nodes.map(shape => shape.id));
	const connectors = shapes.filter(shape => (shape.recognized === 'arrow' || shape.recognized === 'line') && (ids.has(shape.bind?.start?.to) || ids.has(shape.bind?.end?.to)));
	const arrows = connectors.filter(shape => shape.recognized === 'arrow' && shape.bind?.start?.to !== shape.bind?.end?.to && ids.has(shape.bind?.start?.to) && ids.has(shape.bind?.end?.to));
	// A back edge (a retry) closes a cycle: found as the layered layout finds it, depth first in the order given.
	const next = new Map(nodes.map(node => [node.id, []])), state = new Map(), back = new Set();
	for (const arrow of arrows) next.get(arrow.bind.start.to).push(arrow);
	const visit = id => { state.set(id, 1); for (const arrow of next.get(id)) { const to = arrow.bind.end.to; if (state.get(to) === 1) back.add(arrow); else if (!state.has(to)) visit(to); } state.set(id, 2); };
	for (const node of nodes) if (!state.has(node.id)) visit(node.id);
	const forward = arrows.filter(arrow => !back.has(arrow)), starts = nodes.filter(node => !forward.some(arrow => arrow.bind.end.to === node.id));
	const outcome = nodes.find(node => node.recognized !== 'diamond' && arrows.some(arrow => arrow.bind.end.to === node.id) && !arrows.some(arrow => arrow.bind.start.to === node.id));
	for (const node of nodes) if (node.ink == null) {
		node.style = 'solid';
		node.ink = (node === outcome ? RAPIER_DRAW_DIAGRAM.accent : RAPIER_DRAW_DIAGRAM.box)[0];
	}
	for (const node of nodes) if (node.label && node.textBold == null) node.textBold = true;
	const caption = {textFont: 'mono', textCase: 'upper', letterSpacing: .12, textSize: 10};
	for (const connector of connectors) if (connector.label) Object.assign(connector, caption);
	const steps = forward.length > 0 && starts.length === 1 && !groups.length ? nodes.filter(node => node.recognized !== 'diamond' && node.label) : [];
	for (const node of steps) { node.step = 1; if (node.recognized === 'rect') node.labelAlign = 'start'; }
	return steps;
}

// Number the boxes in reading order after their final positions are known.
function _rapierDrawDiagramSet(shapes, steps, direction) {
	const across = direction === 'across' || direction === 'back', reverse = direction === 'up' || direction === 'back', scene = {shapes, strokes: []};
	const at = shape => { const b = _rapierDrawShapeBBoxIn(shape, scene); return across ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : [(b.minY + b.maxY) / 2, (b.minX + b.maxX) / 2]; };
	steps.slice().sort((a, b) => { const p = at(a), q = at(b); return Math.abs(p[0] - q[0]) > 1 ? (p[0] - q[0]) * (reverse ? -1 : 1) : p[1] - q[1]; }).forEach((shape, index) => { shape.step = index + 1; });
	return shapes;
}

function _rapierDrawLowerFiguresOrFault(figures, existing = [], direction = 'down') {
	const INK = 'an ink name (green, red, blue, gold, purple) or #rrggbb';
	const fault = (figure, field, want) => ({ fault: { figure, field, want } });
	if (!Array.isArray(figures) || !figures.length || figures.length > 128) return fault(-1, 'figures', 'a list of 1 to 128 figures');
	if (!['down', 'across', 'up', 'back'].includes(direction)) return fault(-1, 'direction', 'down, across, up or back');
	const laysOut = figures.some(figure => figure && !['line', 'arrow', 'group'].includes(figure.kind) && ['x', 'y', 'w', 'h'].every(field => figure[field] == null));
	if (laysOut) {
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
	const reserved = laysOut ? new Set(figures.map(figure => figure?.id).filter(Boolean)) : new Set();
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
		if (shape.authorStyle?.fill) shape.style = 'solid';
		if (figure.fill != null) { if (!_rapierDrawValidInk(figure.fill)) return fault(index, 'fill', INK); shape.ink = figure.fill; shape.style = 'solid'; }
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
		const steps = _rapierDrawDiagramDress(shapes, automatic, groups);
		try { return {shapes: _rapierDrawDiagramSet(_rapierDrawLayoutFigures(shapes, automatic, groups, existing, direction), steps, direction)}; }
		catch (error) { if (/^drawing_(?:geometry_limit|work_limit|route_blocked)/.test(error.code || '')) return fault(-1, 'figures', 'a diagram within the drawing geometry and routing limits'); throw error; }
	}
	return { shapes };
}
function _rapierDrawLowerFigures(figures, existing = [], direction = 'down') { return _rapierDrawLowerFiguresOrFault(figures, existing, direction).shapes || null; }
function _rapierDrawFigureFault(figures, existing = [], direction = 'down') { return _rapierDrawLowerFiguresOrFault(figures, existing, direction).fault || null; }

function _rapierDrawRestoreSVGRecipe(raw, svg) {
	const recipe = _rapierDrawAdmitRecipe(_rapierDrawRestorePaint(restoreFonts(restoreLetters(raw, svg), svg), svg));
	if (!recipe) throw new Error('Invalid drawing recipe');
	return recipe;
}

// The pure counterpart of draw.js's _rapierDrawReadSVGRecipe for doors without a DOM: reads the
// recipe a Rapier drawing carries in its own <metadata id="rapier-draw"> (the same text the writer
// above emits), restores embedded font bytes from the SVG's own @font-face resources and the capitals of a
// letter set this page does not hold from the SVG's own paths (draw/text.mjs restoreLetters), and admits it.
// Returns null for any SVG that is not a Rapier drawing; throws (code drawing_restore_failed) for one
// that claims to be and cannot be read.
function _rapierDrawReadRecipeFromSVGText(svg) {
	if (typeof svg !== 'string' || !/^\s*<svg[\s>]/.test(svg)) return null;
	const matches = [...svg.matchAll(/<metadata id="rapier-draw">([\s\S]*?)<\/metadata>/g)];
	if (!matches.length) return null;
	try {
		if (matches.length !== 1) throw new Error('Invalid drawing metadata');
		const text = matches[0][1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
		return _rapierDrawRestoreSVGRecipe(JSON.parse(text), svg);
	} catch (error) {
		throw Object.assign(new Error('Drawing could not be read: ' + String(error.message || error)), { code: 'drawing_restore_failed' });
	}
}

function _rapierDrawNormalizeAgentRecipe(input) {
	if (input?.shapes?.some?.(shape => shape?.labelBeside != null)) return null;
	if (!input || typeof input !== 'object') return null;
	const { figures, version = RAPIER_DRAW_VERSION, ...rest } = input;
	const shapes = Array.isArray(rest.shapes) ? rest.shapes : Array.isArray(figures) ? _rapierDrawLowerFigures(figures, [], input.direction) : null;
	if (!Array.isArray(shapes) || !shapes.length || shapes.length > 128) return null;
	const recipe = _rapierDrawAdmitRecipe({ ...rest, shapes, version, canvas: rest.canvas || { w: 4096, h: 4096 }, strokes: rest.strokes || [] });
	if (!recipe) return null;
	if (!rest.canvas) {
		_rapierDrawSceneWork(recipe);
		const box = _rapierDrawUnionView(recipe);
		recipe.canvas = { w: Math.min(65536, Math.max(16, Math.ceil((box?.maxX || 280) + 40))), h: Math.min(65536, Math.max(16, Math.ceil((box?.maxY || 200) + 40))) };
	}
	return recipe;
}

// A `shapes` patch mutates an already-admitted recipe in place for the iterative document.draw
// edit path (docs/agents.md): `add` accepts either a figure (lowered the same way as a fresh
// recipe's own figures, resolved against the recipe's current shapes so a new arrow can bind to a
// box already on the page) or a full recipe shape object; `replace` swaps a shape by its existing
// id for a new definition at the same position; `remove` drops shapes by id. The caller re-admits
// the result (_rapierDrawAdmitRecipe, via applyOperations), which revalidates bounds, drops binds
// left dangling by a removal and reassigns any id collision, exactly as it already does for a
// freshly supplied recipe.
function _rapierDrawApplyShapesPatch(recipe, patch) {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
	if (!recipe || !Array.isArray(recipe.shapes)) return null;
	let shapes = recipe.shapes.slice();
	if (patch.remove != null) {
		if (!Array.isArray(patch.remove) || patch.remove.length > 128 || !patch.remove.every(id => typeof id === 'string')) return null;
		const removing = new Set(patch.remove);
		shapes = shapes.filter(shape => !removing.has(shape.id));
	}
	if (patch.replace != null) {
		if (!Array.isArray(patch.replace) || patch.replace.length > 128) return null;
		for (const raw of patch.replace) {
			if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.labelBeside != null) return null;
			const at = shapes.findIndex(shape => shape.id === raw.id);
			if (at < 0) return null;
			if (typeof raw.kind === 'string') {
				// A figure replaces in the same grammar it was created with; it keeps the id it names and
				// binds against every other shape on the page.
				const lowered = _rapierDrawLowerFigures([{ ...raw, id: undefined }], shapes.filter((shape, index) => index !== at));
				if (!lowered || lowered.length !== 1) return null;
				shapes[at] = { ...lowered[0], id: raw.id };
			} else if (typeof raw.recognized === 'string') shapes[at] = { ...raw, id: raw.id };
			else return null;
		}
	}
	if (patch.add != null) {
		if (!Array.isArray(patch.add) || patch.add.length > 128) return null;
		for (const raw of patch.add) {
			if (!raw || typeof raw !== 'object' || raw.labelBeside != null) return null;
			if (typeof raw.kind === 'string') {
				const lowered = _rapierDrawLowerFigures([raw], shapes);
				if (!lowered) return null;
				shapes = shapes.concat(lowered);
			} else if (typeof raw.recognized === 'string') shapes = shapes.concat([raw]);
			else return null;
		}
	}
	if (!shapes.length || shapes.length > 128) return null;
	return { ...recipe, shapes };
}

// D04: the real per-recipe shape/stroke budget, read every admission. A window flag, read only
// when a caller has actually set it (never touched by production code), substitutes a small one so
// the one candidate/admission/commit owner every creation and modification now shares (draw.js
// _rapierDrawAdmitCreation; the agent shapes-patch path already re-admitted its own result) can be
// witnessed refusing a boundary mark without first drawing 2048 real shapes.
function _rapierDrawTestBudget(name, fallback) {
	const value = typeof globalThis !== 'undefined' ? globalThis[name] : null;
	return Number.isInteger(value) && value > 0 ? value : fallback;
}
// Recipes are untrusted input: admit bounded fields and unique IDs before geometry, bindings or SVG consume them.
function _rapierDrawAdmitRecipe(input, keepRasters = false) {
	const shapeBudget = _rapierDrawTestBudget('__rapierDrawTestMaxShapes', 2048), strokeBudget = _rapierDrawTestBudget('__rapierDrawTestMaxStrokes', 2048);
	if (!input || typeof input !== 'object' || input.version !== RAPIER_DRAW_VERSION || !Array.isArray(input.shapes) || !Array.isArray(input.strokes) || input.shapes.length > shapeBudget || input.strokes.length > strokeBudget) return null;
	const finite = n => typeof n === 'number' && Number.isFinite(n), spatial = _rapierDrawSpatial;
	const canvas = input.canvas;
	if (!canvas || !finite(canvas.w) || !finite(canvas.h) || canvas.w <= 0 || canvas.h <= 0 || canvas.w > 65536 || canvas.h > 65536) return null;
	const out = { version: RAPIER_DRAW_VERSION, canvas: { w: canvas.w, h: canvas.h }, strokes: [], shapes: [] };
	if (input.effect !== undefined) { const effect = admitCopier(input.effect); if (!effect) return null; out.effect = effect; }
	for (const key of ['smooth', 'nib']) if (finite(input[key])) out[key] = key === 'smooth' ? _rapierDrawSmoothLevel(input[key]) : _rapierDrawNibLevel(input[key]);
	// The tool the drawing was last edited with (A29 item 12): Edit reopens on it. Bounded to the
	// tool names Draw has; anything else is dropped and Edit opens in Select as before.
	if (typeof input.tool === 'string' && /^(select|brush|pen|paint|shape|text|erase|effects)$/.test(input.tool)) out.tool = input.tool;
	if (finite(input.light)) out.light = input.light % (Math.PI * 2);
	// A whole-drawing rotate (layout's picture rotate grip) bakes the turn into every shape's own
	// geometry and only keeps this as a cumulative record in whole degrees, so Edit reopens at the
	// right angle and a `wrap=box` obstacle can recover the drawing's own tilted rectangle without
	// re-deriving it from shape kinds (ink, lines, arrows...) that carry no `rot` of their own.
	if (finite(input.angle)) { const angle = ((input.angle % 360) + 360) % 360; if (angle) out.angle = angle; }
	// The canvas colour the person chose for this drawing (R86g law 5): absent means the automatic
	// rule (dark paper until a painting brings white).
	if (input.paper === 'white' || input.paper === 'black') out.paper = input.paper;
	if (input.view && ['x', 'y', 'w', 'h'].every(k => spatial(input.view[k])) && input.view.w > 0 && input.view.h > 0) out.view = { x: input.view.x, y: input.view.y, w: input.view.w, h: input.view.h };
	const reserved = new Set(input.shapes.map(s => typeof s?.id === 'string' && _RAPIER_DRAW_ID.test(s.id) ? s.id : '').filter(Boolean));
	const ids = new Set(), sourceIds = new Map(), duplicates = new Set();
	let seq = 0, points = 0, textUnits = 0, rasterUnits = 0;
	for (const raw of input.shapes) {
		if (!raw || typeof raw !== 'object') return null;
		let id = typeof raw.id === 'string' && _RAPIER_DRAW_ID.test(raw.id) ? raw.id : '';
		if (id && ids.has(id)) duplicates.add(id);
		if (!id || ids.has(id)) { do { id = 's' + (++seq); } while (reserved.has(id) || ids.has(id)); }
		ids.add(id);
		if (typeof raw.id === 'string' && !sourceIds.has(raw.id)) sourceIds.set(raw.id, id);
		let kind = raw.recognized, geom = null;
		const polygon = Object.hasOwn(RAPIER_DRAW_POLYGONS, kind), frame = RAPIER_DRAW_BOXES.has(kind) || kind === 'paint' || polygon;
		if (!['ink', 'circle', 'ellipse', 'triangle', 'line', 'arrow', 'arc', 'text', 'paint'].includes(kind) && !polygon && !RAPIER_DRAW_BOXES.has(kind)) return null;
		if (kind !== 'ink') {
			const g = raw.geom;
			if (!g || typeof g !== 'object') return null;
			if (kind === 'triangle' || frame && g.p) {
				if (!Array.isArray(g.p) || g.p.length !== (kind === 'triangle' ? 3 : 4) || !g.p.every(p => Array.isArray(p) && p.length === 2 && p.every(spatial))) return null;
				geom = { p: g.p.map(p => p.slice()) };
				if ((polygon || kind === 'paint' || kind !== 'rect' && RAPIER_DRAW_BOXES.has(kind) || raw.corner) && g.p.some((p, i) => i === 2 && (Math.abs(p[0] - g.p[1][0] - g.p[3][0] + g.p[0][0]) > .01 || Math.abs(p[1] - g.p[1][1] - g.p[3][1] + g.p[0][1]) > .01))) return null;
			} else {
				geom = {};
				for (const key of frame ? ['cx', 'cy', 'w', 'h'] : kind === 'text' ? ['cx', 'cy'] : _RAPIER_DRAW_GEOM_FIELDS[kind]) {
					if (!spatial(g[key]) || /^(?:r|rx|ry|w|h)$/.test(key) && g[key] <= 0) return null;
					geom[key] = g[key];
				}
				if (kind === 'text' && g.w != null) { if (!spatial(g.w) || g.w < 0) return null; if (g.w) geom.w = g.w; }
				if (kind === 'circle' || frame || kind === 'ellipse' || kind === 'text') { if (g.rot != null && !finite(g.rot)) return null; if (g.rot) geom.rot = g.rot % (Math.PI * 2); }
			}
			if (kind === 'star' && g.inner != null) { if (!finite(g.inner) || g.inner < .15 || g.inner > .75) return null; geom.inner = g.inner; }
			({ kind, geom } = _rapierDrawClampArcSweep(kind, geom));
		}
		let stroke = null;
		if ((kind === 'text' || kind === 'paint') && raw.stroke != null) return null;
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
		if (raw.effect !== undefined) { const effect = admitCopier(raw.effect); if (!effect) return null; shape.effect = effect; }
		if (kind !== 'rect' && RAPIER_DRAW_BOXES.has(kind) || shape.corner) {
			// A positive declared size can collapse at its centre's floating-point precision. Validate the actual
			// affine frame, for scalar dimensions and supplied corners alike, before any contour divides by its sides.
			const p = geom.p || _rapierDrawRectPolygon(geom.cx, geom.cy, geom.w, geom.h, geom.rot || 0);
			if (Math.abs((p[1][0] - p[0][0]) * (p[3][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[3][0] - p[0][0])) < 1e-8) return null;
		}
		// D07: a shape's own random-appearance seed, distinct from its id so copy/duplicate (which
		// remints the id) leaves it alone; admitted verbatim when supplied (draw.js mints one on every
		// creation and copies it through erase and duplicate), otherwise left unset so the texture
		// generators' own id-based fallback (_rapierDrawShapeSeedBase) reproduces exactly what a
		// pre-existing recipe without this field already rendered.
		if (Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff) shape.seed = raw.seed;
		const ink = _rapierDrawValidInk(raw.ink);
		if (ink) shape.ink = ink;
		if (raw.border !== undefined) {
			const border = _rapierDrawValidInk(raw.border);
			if (!border || !_rapierDrawBorderActive(shape)) return null;
			shape.border = border;
		}
		if (kind === 'paint') {
			const raster = _rapierDrawValidRaster(raw.raster, keepRasters ? Infinity : RAPIER_DRAW_RASTER_MAX);
			if (!raster || !keepRasters && (rasterUnits += raster.length) > RAPIER_DRAW_RASTER_TOTAL) return null;
			shape.raster = raster;
			const paint = raw.paint;
			if (paint != null) {
				if (typeof paint !== 'object' || Array.isArray(paint)) return null;
				const record = {};
				if (paint.brush != null) { if (typeof paint.brush !== 'string' || paint.brush.length > 96) return null; record.brush = paint.brush; }
				if (paint.px != null) { if (!Array.isArray(paint.px) || paint.px.length !== 2 || !paint.px.every(n => Number.isInteger(n) && n > 0 && n <= 16384)) return null; record.px = paint.px.slice(); }
				if (paint.scale != null) { if (!finite(paint.scale) || paint.scale <= 0 || paint.scale > 16) return null; record.scale = paint.scale; }
				// The group a lossless piece belongs to is the FIRST piece's own shape id (paint-tool.js
				// `_rapierPaintSplitShapeSync`), so it is admitted as an id. (R86e, found by
				// `paint-raster-admission`: written as an integer test, this refused every drawing that
				// held a piece -- Done could not place it and a saved one would not have reopened.)
				if (paint.group != null) { if (typeof paint.group !== 'string' || !_RAPIER_DRAW_ID.test(paint.group)) return null; record.group = paint.group; }
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
			if (line || kind === 'arc' || kind === 'ink' || kind === 'text' || kind === 'paint' || !Array.isArray(m) || m.length !== 6 || !m.every(n => finite(n) && Math.abs(n) <= 1e12)) return null;
			const d = m[0] * m[3] - m[1] * m[2];
			if (!d || ![m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d].every(n => finite(n) && Math.abs(n) <= 1e12)) return null;
			shape.labelGrow = m.slice();
		}
		if (raw.angle === true && (line || kind === 'triangle')) shape.angle = true;
		if (raw.len === true && line) shape.len = true;
		if (raw.cut === true && kind === 'ink') shape.cut = true;
		if (raw.cutWidth != null) { if (!(kind === 'ink' && shape.cut || line) || !finite(raw.cutWidth) || raw.cutWidth <= 0 || raw.cutWidth > 64) return null; shape.cutWidth = raw.cutWidth; }
		if (raw.dash === 'dashed' || raw.dash === 'dotted') shape.dash = raw.dash;
		// Every element's fade: 0.05 to 1, omitted at 1.
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
		// D06: one connector model -- binding is not routing. A line explicitly given named anchors
		// (figure lowering's `from`/`to` on a `line` figure, or a human dragging a line's own end
		// handle onto a shape, draw.js _rapierDrawSetArrowEndpoint) keeps them exactly as an arrow
		// would; an unbound line supplied as two literal points is untouched by this block and stays
		// the fixed line it was drawn as (nothing here invents a binding that was never asked for).
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
	for (const shape of out.shapes) if (shape.bind) {
		for (const end of ['start', 'end']) {
			const a = shape.bind[end], to = a && sourceIds.get(a.to);
			if (!a) continue;
			if (!to || duplicates.has(a.to) || to === shape.id) delete shape.bind[end]; else a.to = to;
		}
		if (!shape.bind.start && !shape.bind.end) delete shape.bind;
	}
	// A 1-member group is a leftover tag (erase of a partner, a pasted fragment): drop it so a
	// tap on the survivor is an ordinary selection, not a group of one.
	const groupCount = new Map();
	for (const shape of out.shapes) if (shape.group) groupCount.set(shape.group, (groupCount.get(shape.group) || 0) + 1);
	for (const shape of out.shapes) if (shape.group && groupCount.get(shape.group) < 2) delete shape.group;
	try {
		const fonts = admitFonts(input.fonts, new Set(out.shapes.map(shape => shape.textFont).filter(id => id?.startsWith('f'))));
		if (fonts.length) out.fonts = fonts;
		_rapierDrawSceneWork(out);
		_rapierDrawRerouteBoundArrows(out);
		for (const shape of out.shapes) {
			if ((shape.recognized === 'arrow' || shape.recognized === 'line' && shape.route === 'auto') && !_rapierDrawShapePaintsInk(shape, out)) _rapierDrawArrowRoutePoints(shape, out);
			if (shape.recognized === 'text' || shape.label) _rapierDrawTextLayout(shape, out);
		}
	} catch (error) { if (/^drawing_(?:geometry_limit|work_limit|route_blocked|font_)/.test(error.code || '')) return null; throw error; }
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
	// Words inside a solid figure take the ink that reads on its fill (open-work item 55 f); a step number is the quiet
	// ink on paper and the grey, and the words' own ink on any other fill.
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

// A caption beside its line: at its place along the route, on a straight leg, standing twelve pixels clear of it --
// right of an upright leg, over a level one -- wrapped to its own width, the line left whole. Null off a straight leg.
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

export {GARDEN_COLOURS,COPIER_PRESETS,copierPreset,admitCopier,copierPreviewEffect,copierBounds,copierMarkup,RAPIER_DRAW_DIAGRAM,RAPIER_DRAW_PAINT_INK_FILTER,_rapierDrawUnionView,_rapierDrawDarkRules,_rapierDrawUsedColours,_rapierDrawRouteChanges,_rapierDrawFitCircleTo,_rapierDrawFitEllipseTo,_rapierDrawFitRegularTo,_rapierDrawBorderActive,_rapierDrawGrowPolygon,_rapierDrawSpatial,RAPIER_DRAW_POLYGONS,RAPIER_DRAW_HEADS,_rapierDrawRestoreSVGRecipe,_rapierDrawStripRasters,_rapierDrawValidRaster,RAPIER_DRAW_RASTER_MAX,RAPIER_DRAW_RASTER_TOTAL,_rapierDrawNormalizeAgentRecipe,_rapierDrawReadRecipeFromSVGText,_rapierDrawLowerFigures,_rapierDrawFigureFault,_rapierDrawApplyShapesPatch,_rapierDrawTextFrame,_rapierDrawTextLayout,_rapierDrawLabelFraction,_rapierDrawShapeContours,_rapierDrawArrowHitPolyline,RAPIER_DRAW_LABEL_MAX,_rapierDrawSetLineGeometry,_rapierDrawSceneMarkup,RAPIER_DRAW_NIB_DEFAULT,RAPIER_DRAW_NIB_MAX,RAPIER_DRAW_NIB_MIN,RAPIER_DRAW_SMOOTH_DEFAULT,RAPIER_DRAW_VERSION,_rapierDrawAdmitRecipe,_rapierDrawAnchorFrame,_rapierDrawArcEndpoints,_rapierDrawArrowParts,_rapierDrawArrowRoutePoints,_rapierDrawBBox,_rapierDrawBrushMarkup,_rapierDrawBrushesFor,_rapierDrawBuildSVG,_rapierDrawClamp,_rapierDrawClosestOnSeg,_rapierDrawDefaultStyle,_rapierDrawDist,_rapierDrawEdgeSnapPoint,_rapierDrawEllipseEdgePoint,_rapierDrawFmt,_rapierDrawInterpolatePoint,_rapierDrawIsClosedStroke,_rapierDrawLabelPlacement,_rapierDrawNextAssetName,_rapierDrawNibLevel,_rapierDrawPaintPad,_rapierDrawPenPathD,_rapierDrawPerimeter,_rapierDrawPointInPolygon,_rapierDrawRDP,_rapierDrawRDPClosed,_rapierDrawRectPolygon,_rapierDrawRelaxStroke,_rapierDrawRerouteBoundArrows,_rapierDrawResamplePolyline,_rapierDrawResolveBindAnchor,_rapierDrawRouteBBoxFromPoints,_rapierDrawShapeBBoxIn,_rapierDrawShapePaintedBBoxIn,_rapierDrawShapeInk,_rapierDrawShapeMarkup,_rapierDrawShapeNib,_rapierDrawShapePaintsInk,_rapierDrawShapePolygon,_rapierDrawShapePolyline,_rapierDrawShapeStroke,_rapierDrawSmoothLevel,_rapierDrawSmoothPathD,_rapierDrawSmoothPlan,_rapierDrawStreamlineStroke,_rapierDrawStrokeHalf,_rapierDrawStrokeHasPressure,_rapierDrawStrokeSamples,_rapierDrawEscapeAttr,_rapierDrawInkView,_rapierDrawStylesFor,_rapierDrawValidInk,_rapierDrawDashActive,_rapierDrawRDPWeighted,_rapierDrawEffectiveWidth,RAPIER_DRAW_INK_WIDTH,RAPIER_DRAW_SHAPE_WIDTH,_rapierDrawObjectFrame,_rapierDrawStippleDots};
