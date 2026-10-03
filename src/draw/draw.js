// SPDX-License-Identifier: AGPL-3.0-only
const {GARDEN_COLOURS,_rapierDrawShapePaintedBBoxIn,_rapierDrawInkView,_rapierDrawRouteChanges,_rapierDrawUnionView,_rapierDrawDarkRules,_rapierDrawUsedColours,RAPIER_DRAW_PAINT_INK_FILTER,_rapierDrawRestoreSVGRecipe,_rapierDrawTextLayout,_rapierDrawShapeContours,RAPIER_DRAW_LABEL_MAX,_rapierDrawSetLineGeometry,_rapierDrawSceneMarkup,_rapierDrawEscapeAttr,RAPIER_DRAW_NIB_DEFAULT,RAPIER_DRAW_NIB_MAX,RAPIER_DRAW_NIB_MIN,RAPIER_DRAW_SMOOTH_DEFAULT,RAPIER_DRAW_VERSION,_rapierDrawAdmitRecipe,_rapierDrawApplyShapesPatch,_rapierDrawAnchorFrame,_rapierDrawArcEndpoints,_rapierDrawArrowParts,_rapierDrawArrowRoutePoints,_rapierDrawBBox,_rapierDrawFitCircleTo,_rapierDrawFitEllipseTo,_rapierDrawFitRegularTo,RAPIER_DRAW_RASTER_MAX,_rapierDrawBrushMarkup,_rapierDrawBrushesFor,_rapierDrawBuildSVG,_rapierDrawClamp,_rapierDrawClosestOnSeg,_rapierDrawDefaultStyle,_rapierDrawDist,_rapierDrawEdgeSnapPoint,_rapierDrawEllipseEdgePoint,_rapierDrawFmt,_rapierDrawInterpolatePoint,_rapierDrawIsClosedStroke,_rapierDrawNextAssetName,_rapierDrawNibLevel,_rapierDrawPaintPad,_rapierDrawPenPathD,_rapierDrawPerimeter,_rapierDrawPointInPolygon,_rapierDrawRDP,_rapierDrawRDPClosed,_rapierDrawRectPolygon,_rapierDrawRelaxStroke,_rapierDrawRerouteBoundArrows,_rapierDrawResamplePolyline,_rapierDrawShapeBBoxIn,_rapierDrawShapeInk,_rapierDrawShapeMarkup,_rapierDrawShapeNib,_rapierDrawShapePaintsInk,_rapierDrawShapePolygon,_rapierDrawShapePolyline,_rapierDrawShapeStroke,_rapierDrawSmoothLevel,_rapierDrawSmoothPathD,_rapierDrawSmoothPlan,_rapierDrawStreamlineStroke,_rapierDrawStrokeHalf,_rapierDrawStrokeHasPressure,_rapierDrawStrokeSamples,_rapierDrawDashActive,_rapierDrawBorderActive,_rapierDrawGrowPolygon,_rapierDrawRDPWeighted,_rapierDrawEffectiveWidth,RAPIER_DRAW_INK_WIDTH} = globalThis.RapierDrawCore;
const {_rapierDrawTranslateGeom,_rapierDrawTranslateShape,_rapierDrawReleaseBindings,_rapierDrawRotatePt,_rapierDrawResizeShape,_rapierDrawResizeShapeLocal,_rapierDrawRotateShape,_rapierDrawBindAnchorFor,_rapierDrawPruneUnusedStrokes,anchorResize:_rapierDrawAnchorResize,anchorResizeLocal:_rapierDrawAnchorResizeLocal,selectionFrame:_rapierDrawSelectionFrame,editDrawing:_rapierDrawEdit,selectionIds:_rapierDrawGroupSelection,snapMove:_rapierDrawSnapMove,snapResize:_rapierDrawSnapResize} = globalThis.RapierDrawEdit;

const RAPIER_DRAW_INK_LABEL = Object.freeze({ green: 'Green', red: 'Red', blue: 'Blue', gold: 'Gold', purple: 'Purple' });

const RAPIER_DRAW_INK_ORDER = ['green', 'red', 'blue', 'gold', 'purple'];

const RAPIER_DRAW_BRUSH_LABEL = { ink: 'Plain', brush: 'Brush', sketch: 'Sketch', hatched: 'Hatched', sphere: 'Sphere', wheel: 'Wheel', pulley: 'Pulley',
	wood: 'Wood', knot: 'Knot', lens: 'Lens', spring: 'Spring', rope: 'Rope', tube: 'Tube', ray: 'Ray', light: 'Light' };

const RAPIER_DRAW_SNAP_EDGE_PX = 14;
const RAPIER_DRAW_SNAP_END_PX = 10;

const RAPIER_DRAW_TURN_STEP = Math.PI / 12;
// Touch has no Shift key, so a live rotate drag substitutes a magnetic pull onto the 15 deg grid
// (RAPIER_DRAW_TURN_STEP) once the delta comes this close to a step, and release adds one more,
// independent right-angle gravity onto 0/90/180/270 within this wider window (rotate-rules.md R21/R23).
const RAPIER_DRAW_ROTATE_MAGNET_RAD = 4 * Math.PI / 180;
const RAPIER_DRAW_ROTATE_GRAVITY_RAD = 5 * Math.PI / 180;

const RAPIER_DRAW_ARC_RESAMPLE_N = 24;
const RAPIER_DRAW_ARC_RESIDUAL_FRAC = 0.09;
const RAPIER_DRAW_ARC_MIN_SWEEP = Math.PI / 6;
const RAPIER_DRAW_ARC_MAX_SWEEP = Math.PI * 5 / 3;
// Live stroke buffer: the first KEEP raw points are a semantic prefix, kept byte-exact forever.
// After that, points accumulate in a live tail; once the tail reaches CHUNK samples it is RDP'd
// down to at most CHUNK_CAP points ONE TIME and frozen (Object.freeze) into strokeChunks, and a
// fresh tail continues the gesture -- a completed chunk is never re-simplified by a later one.
// GAP_MAX bounds how many consecutive raw samples a chunk's compaction may leave unrepresented
// (plain RDP alone can erode a long straight run to just its two endpoints); the compactor fills
// any gap wider than that with the actual sample at that point, never a computed one.
const RAPIER_DRAW_STROKE_KEEP = 100;
const RAPIER_DRAW_STROKE_CHUNK = 256;
const RAPIER_DRAW_STROKE_CHUNK_CAP = 48;
const RAPIER_DRAW_STROKE_GAP_MAX = 64;
// D02: a captured point is [x, y, elapsed ms, pressure] (see _rapierDrawStrokeSample below). RDP
// judged x/y alone, so a pressure swell or a sudden change of pace on an otherwise near-straight
// run left no positional trace to protect it from compaction -- silently erased even though it can
// flip the stroke's own real/simulated pressure call (RAPIER_DRAW_PRESSURE_VARIANCE, 0.05) and the
// rendered outline width with it. Pressure (0..1) is weighted heavily enough that a swing anywhere
// near that classification threshold reads as a large positional deviation in the shared eps scale
// these px-based budgets already use; elapsed time is weighted lightly -- worth protecting a real
// pace change, not fighting the position budget for every sample of a smooth acceleration.
const RAPIER_DRAW_STROKE_PRESSURE_WEIGHT = 60;
const RAPIER_DRAW_STROKE_TIME_WEIGHT = 0.15;
const RAPIER_DRAW_STROKE_CHANNELS = [[3, RAPIER_DRAW_STROKE_PRESSURE_WEIGHT], [2, RAPIER_DRAW_STROKE_TIME_WEIGHT]];
// A belt-and-suspenders floor under the weighted RDP above: any local pressure extremum whose swing
// clears this (comfortably above the 0.05 classification threshold) survives compaction on its own,
// even one a tight chunk budget's greedy split order still traded away for other detail elsewhere in
// a long tail.
const RAPIER_DRAW_STROKE_PRESSURE_KEEP = 0.12;

// A canvas a Notes door opens is a sketch, a quick note: it keeps Notes' own hand, apart from the
// editor's Draw -- the mark-making tool last used there and its width, the SVG Brush at a felt-tip
// width (a 3.6 px line) until the person picks another. Select, Eraser, Shape and Text are
// reached for inside a drawing, never the way one starts, so they are not remembered.
// The width a fresh canvas starts at where none is remembered is a third over what it was, 5 in a
// note (was 4) and 12 in the editor's Draw (was 9): the founder, 25 September 2026, "just make the
// default size for the SVG brush a bit bigger" (docs/intent.md law 17). The pen's width is one for the
// SVG Brush and the SVG Pen alike, so the Pen's starts wider with it. RAPIER_DRAW_NIB_DEFAULT (9, draw/core.mjs)
// stays the unit every width is drawn by: a stroke keeps its own nib, so nothing drawn before changes, and
// the Width control with nothing selected sets only the pen (_rapierDrawSetSetting).
const RAPIER_DRAW_NOTES_TOOLS = ['pen', 'brush', 'paint'], RAPIER_DRAW_NOTES_NIB = 5, RAPIER_DRAW_FRESH_NIB = 12;
// Device preferences share IO: they are the pen a drawing opens with (_rapierDrawOpenSurface); a recipe's own values are what its shapes carry.
const RAPIER_DRAW_MEMORY = {
	smooth: ['rapier:draw.smooth', RAPIER_DRAW_SMOOTH_DEFAULT, _rapierDrawSmoothLevel],
	nib: ['rapier:draw.nib', RAPIER_DRAW_FRESH_NIB, _rapierDrawNibLevel],
	shapeKind: ['rapier:draw.shapekind', 'rect', value => RAPIER_DRAW_SHAPE_KINDS.some(row => row[0] === value) ? value : 'rect'],
	eraseSoftness: ['rapier:draw.eraseSoftness', 0, value => { const n = Number(value); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : 0; }],
	notesTool: ['rapier:notes.draw.tool', 'brush', value => RAPIER_DRAW_NOTES_TOOLS.includes(value) ? value : 'brush'],
	notesNib: ['rapier:notes.draw.nib', RAPIER_DRAW_NOTES_NIB, _rapierDrawNibLevel],
};
function _rapierDrawRemembered(key) {
	const [storage, fallback, read] = RAPIER_DRAW_MEMORY[key];
	try { const raw = localStorage.getItem(storage); return raw == null ? fallback : read(raw); }
	catch (_) { return fallback; }
}
function _rapierDrawRemember(key, value) {
	try { localStorage.setItem(RAPIER_DRAW_MEMORY[key][0], String(value)); } catch (_) {}
	_rapierPersonal.rememberDrawing(key, String(value));
}

const RAPIER_DRAW_HIT_SLOP_PX = 16;
// A coarse pointer's own hit margin, wider than the fine-pointer value the same way every other
// distance-based touch constant here is (touch-rules.md T3); a phone session used this fine value
// for every pointer type until the touch-session signal below could tell them apart.
const RAPIER_DRAW_HIT_SLOP_COARSE_PX = 22;
const RAPIER_DRAW_MOVE_THRESHOLD_PX = 8;
const RAPIER_DRAW_DOUBLE_TAP_DIST_PX = 24;
const RAPIER_DRAW_DOUBLE_TAP_DIST_TOUCH_PX = 40;
// Select's touch hold toggles membership in the current selection.
const RAPIER_DRAW_HOLD_MS = 260;
// Below this on-screen box size (in both dimensions) the full handle set would overlap itself;
// collapse to one draggable corner instead (resize-rules.md R19's tiny-shape collapse stage).
const RAPIER_DRAW_TINY_HANDLE_PX = 16;
// Each box handle's own compass bearing at zero rotation, degrees clockwise from north -- folded
// through the selection's live tilt to pick a resize cursor (R5/R14: mouse-only, touch has no
// cursor to steer). Opposite handles (nw/se, n/s, ne/sw, e/w) always share one cursor, so only the
// 0-180 half needs bucketing below.
const RAPIER_DRAW_HANDLE_BEARING = { nw: 315, n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270 };
// Handle ids that resize or rotate the selection's own box -- a held one of these freezes the
// pre-drag geometry into a hairline ghost (Part D's tldraw-lesson extension: "ghost, not smaller
// handles"). Move ('move' kind, no handle id), and an arrow's own start/end/bend/label handles,
// reshape a single shape's route rather than the selection box, so they are deliberately excluded.
const RAPIER_DRAW_GHOST_HANDLES = new Set(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']);
// A press ring fades over this long if the press becomes a pan/pinch/cancel instead of a committed
// drag or a plain tap-release (shapes-and-select-rules.md's "press ring" table entry) -- kept a
// touch under the witness's 200ms pinch-clears-it budget so a slow browser still lands inside it.
const RAPIER_DRAW_PRESS_RING_FADE_MS = 160;
function _rapierDrawResizeCursorDir(id, thetaRad) {
	const bearing = RAPIER_DRAW_HANDLE_BEARING[id];
	if (bearing == null) return null;
	const deg = (((bearing + thetaRad * 180 / Math.PI) % 180) + 180) % 180;
	return deg < 22.5 || deg >= 157.5 ? 'ns' : deg < 67.5 ? 'nesw' : deg < 112.5 ? 'ew' : 'nwse';
}
const _rapierDrawState = {
	open: false, surface: null, svgRoot: null, svg: null, live: null, menu: null, closeBtn: null,
	recipe: null, undoStack: [], redoStack: [], seq: 0, pointerId: null, stroke: null, strokeStartT: 0,
	strokeHead: null, strokeChunks: null, strokeTail: null, strokeLast: null,
	menuShapeId: null, editing: null, insertTarget: null,
	// The canvas opened in Notes (notes/notes.js _rapierNotesDrawFor), null for the editor's own Draw:
	// {label, fresh, alt, closed} -- the note it is for, by the name its card shows, or a new note; the
	// new drawing's caption; and, for the + bar's new note, what to do when it closes keeping nothing.
	notes: null,

	// The agent's replay while one is running, and the elements that show it; null the rest of the
	// time, because the nib exists only while the replay runs (docs/briefs/agent-on-the-canvas.md).
	replay: null, replayLeadEl: null, replayNibEl: null, replayTagEl: null, replayBarEl: null, stageEl: null,

	smooth: RAPIER_DRAW_SMOOTH_DEFAULT,

	ink: null,

	pointerPos: null, secondPointerId: null, secondPointerPos: null,

	// '', 'touch' or 'mouse' -- see _rapierDrawCoarseSession below.
	touchSession: '',
	perf: { geomSnapshots: 0, strokeCount: 0, strokeFirst100: null },

	pressRingEl: null, pressRingTimer: null, scribbleEl: null,
};
// Coarse-pointer session state, mirroring editor/engine.js's own recentPointerModality (T1): a live
// `(any-pointer: coarse)` baseline, instantly overridden by the pointer type of the last real
// pointerdown anywhere in the window, captured in the capture phase so nothing swallows it first.
// Kept on _rapierDrawState so every Draw call site can ask "is this session touch right now" once,
// instead of re-deriving it from whichever single event happens to be in hand.
const _rapierDrawCoarseMedia = typeof matchMedia === 'function' ? matchMedia('(any-pointer: coarse)') : null;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', evt => {
	if (evt.pointerType === 'touch') _rapierDrawState.touchSession = 'touch';
	else if (evt.pointerType === 'mouse') _rapierDrawState.touchSession = 'mouse';
}, { capture: true, passive: true });
function _rapierDrawCoarseSession() {
	const session = _rapierDrawState.touchSession;
	return session ? session === 'touch' : !!_rapierDrawCoarseMedia?.matches;
}

function _rapierDrawArea(points) {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i], b = points[(i + 1) % points.length];
		sum += a[0] * b[1] - b[0] * a[1];
	}
	return Math.abs(sum) / 2;
}

function _rapierDrawTurns(poly) {
	const n = poly.length, out = [];
	for (let i = 0; i < n; i++) {
		const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
		const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
		const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
		let d = a2 - a1;
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		out.push(d);
	}
	return out;
}
function _rapierDrawTopCorners(poly, n) {
	const turns = _rapierDrawTurns(poly).map((a, i) => [Math.abs(a), i]).sort((a, b) => b[0] - a[0]);
	const idx = turns.slice(0, n).map(r => r[1]).sort((a, b) => a - b);
	return idx.map(i => poly[i]);
}
function _rapierDrawNearlyStraight(poly) {
	const a = poly[0], b = poly[1], c = poly[2];
	const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1;
	const d = Math.abs(dy * b[0] - dx * b[1] + c[0] * a[1] - c[1] * a[0]) / len;
	return d < Math.max(6, len * 0.06);
}

const RAPIER_DRAW_SHAFT_SLACK = 0.18;
function _rapierDrawRunsStraight(pts, hook) {
	let shaft = pts;
	if (hook) {
		const cumulative = [0];
		for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + _rapierDrawDist(pts[i - 1], pts[i]));
		const total = cumulative[cumulative.length - 1];

		const splitIdx = cumulative.findIndex(c => c >= total * 0.82);
		if (splitIdx > 1) shaft = pts.slice(0, splitIdx + 1);
	}
	const first = shaft[0], last = shaft[shaft.length - 1];
	const chord = _rapierDrawDist(first, last);
	if (!(chord > 0)) return false;
	let worst = 0;
	for (let i = 1; i < shaft.length - 1; i++) {
		const away = _rapierDrawPointSegDist(shaft[i], first, last);
		if (away > worst) worst = away;
	}
	return worst <= chord * RAPIER_DRAW_SHAFT_SLACK;
}
function _rapierDrawHasHook(pts) {
	const n = pts.length;
	if (n < 6) return false;
	const cumulative = [0];
	for (let i = 1; i < n; i++) cumulative.push(cumulative[i - 1] + _rapierDrawDist(pts[i - 1], pts[i]));
	const total = cumulative[n - 1];
	if (total < 24) return false;
	const splitAt = total * 0.82;
	const splitIdx = cumulative.findIndex(c => c >= splitAt);
	if (splitIdx < 2 || splitIdx > n - 2) return false;
	const mainDir = Math.atan2(pts[splitIdx][1] - pts[0][1], pts[splitIdx][0] - pts[0][0]);
	const tailDir = Math.atan2(pts[n - 1][1] - pts[splitIdx][1], pts[n - 1][0] - pts[splitIdx][0]);
	let diff = Math.abs(mainDir - tailDir);
	if (diff > Math.PI) diff = 2 * Math.PI - diff;
	const tailLen = total - cumulative[splitIdx];
	return diff > 0.45 && diff < 2.8 && tailLen > total * 0.06 && tailLen > 8;
}
function _rapierDrawRectFromQuad(quad) {
	let angle = Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]);
	while (angle > Math.PI / 4) angle -= Math.PI / 2;
	while (angle <= -Math.PI / 4) angle += Math.PI / 2;
	const cx0 = quad.reduce((s, p) => s + p[0], 0) / 4, cy0 = quad.reduce((s, p) => s + p[1], 0) / 4;
	const cos = Math.cos(-angle), sin = Math.sin(-angle);
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const p of quad) {
		const rx = (p[0] - cx0) * cos - (p[1] - cy0) * sin, ry = (p[0] - cx0) * sin + (p[1] - cy0) * cos;
		if (rx < minX) minX = rx; if (rx > maxX) maxX = rx; if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
	}
	return { cx: cx0, cy: cy0, w: Math.max(8, maxX - minX), h: Math.max(8, maxY - minY), rot: Math.abs(angle) < 0.05 ? 0 : angle };
}




function _rapierDrawFitCircleLS(pts) {
	let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
	const n = pts.length;
	for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
	const a11 = 4 * sxx, a12 = 4 * sxy, a13 = 2 * sx, a21 = 4 * sxy, a22 = 4 * syy, a23 = 2 * sy, a31 = 2 * sx, a32 = 2 * sy, a33 = n;
	const b1 = 2 * sxz, b2 = 2 * syz, b3 = sz;
	const det = a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31);
	if (Math.abs(det) < 1e-9) return null;
	const cx = (b1 * (a22 * a33 - a23 * a32) - a12 * (b2 * a33 - a23 * b3) + a13 * (b2 * a32 - a22 * b3)) / det;
	const cy = (a11 * (b2 * a33 - a23 * b3) - b1 * (a21 * a33 - a23 * a31) + a13 * (a21 * b3 - b2 * a31)) / det;
	const c = (a11 * (a22 * b3 - b2 * a32) - a12 * (a21 * b3 - b2 * a31) + b1 * (a21 * a32 - a22 * a31)) / det;
	const r2 = c + cx * cx + cy * cy;
	if (!(r2 > 9)) return null;
	return { cx, cy, r: Math.sqrt(r2) };
}

function _rapierDrawFitArc(rawPts) {
	if (rawPts.length < 5) return null;
	const rs = _rapierDrawResamplePolyline(rawPts, RAPIER_DRAW_ARC_RESAMPLE_N);
	const fit = _rapierDrawFitCircleLS(rs);
	if (!fit) return null;
	let sumSq = 0;
	for (const p of rs) { const d = Math.abs(_rapierDrawDist(p, [fit.cx, fit.cy]) - fit.r); sumSq += d * d; }
	const rms = Math.sqrt(sumSq / rs.length);
	if (rms > fit.r * RAPIER_DRAW_ARC_RESIDUAL_FRAC) return null;
	let a0 = Math.atan2(rs[0][1] - fit.cy, rs[0][0] - fit.cx), prevA = a0, total = 0;
	for (let i = 1; i < rs.length; i++) {
		const a = Math.atan2(rs[i][1] - fit.cy, rs[i][0] - fit.cx);
		let d = a - prevA;
		while (d > Math.PI) d -= 2 * Math.PI;
		while (d < -Math.PI) d += 2 * Math.PI;
		total += d;
		prevA += d;
	}
	if (Math.abs(total) < RAPIER_DRAW_ARC_MIN_SWEEP || Math.abs(total) > RAPIER_DRAW_ARC_MAX_SWEEP) return null;
	return { cx: fit.cx, cy: fit.cy, r: fit.r, a0, a1: a0 + total };
}

// How far the person's points sit from a closed outline, root-mean-square, in their own units --
// the same measure the circle and ellipse fits publish, so the three are comparable (R87f).
function _rapierDrawOutlineResidual(pts, ring) {
	if (!ring || ring.length < 3) return Infinity;
	let sq = 0;
	for (const p of pts) {
		let best = Infinity;
		for (let i = 0; i < ring.length; i++) {
			const d = _rapierDrawPointSegDist(p, ring[i], ring[(i + 1) % ring.length]);
			if (d < best) best = d;
		}
		sq += best * best;
	}
	return Math.sqrt(sq / pts.length);
}

// How much better a regular figure must explain the stroke than the round fit it would displace,
// and how tight it must be on its own where there is nothing to displace (see the two uses below).
const RAPIER_DRAW_REGULAR_MARGIN = 0.5;
const RAPIER_DRAW_REGULAR_TIGHT = 0.02;

function _rapierDrawRecognize(rawPts) {
	const pts = rawPts.map(p => [p[0], p[1]]);
	if (pts.length < 2) return null;
	const length = _rapierDrawPerimeter(pts, false);
	if (length < 6 && pts.length < 4) return null;
	const bbox = _rapierDrawBBox(pts);
	const diag = Math.hypot(bbox.w, bbox.h) || 1;
	const first = pts[0], last = pts[pts.length - 1];
	const closed = _rapierDrawIsClosedStroke(pts);
	if (closed) {
		const perim = _rapierDrawPerimeter(pts, true);
		const area = _rapierDrawArea(pts);
		const circularity = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;
		const eps = Math.max(5, perim * 0.05);
		let poly = _rapierDrawRDPClosed(pts, eps);
		if (poly.length > 2 && _rapierDrawDist(poly[0], poly[poly.length - 1]) < Math.max(10, diag * 0.08)) poly = poly.slice(0, -1);
		const turns = poly.length >= 3 ? _rapierDrawTurns(poly) : [];
		const corners = turns.filter(a => Math.abs(a) > 0.55).length;
		const aspect = Math.max(bbox.w, bbox.h) / Math.max(1, Math.min(bbox.w, bbox.h));

		const polygonal = circularity < 0.87;
		if (polygonal && (poly.length === 3 || (corners === 3 && poly.length <= 5))) {
			return { kind: 'triangle', geom: { p: (poly.length === 3 ? poly : _rapierDrawTopCorners(poly, 3)).map(p => [p[0], p[1]]) } };
		}
		if (polygonal && (poly.length === 4 || (corners === 4 && poly.length <= 6))) {
			const quad = poly.length === 4 ? poly : _rapierDrawTopCorners(poly, 4);
			// R87f: a hand-drawn OVAL lands here, not in the round branch below, because its wobble
			// puts circularity under the 0.87 cliff and RDP gives it four points -- so "draw an oval,
			// get a box" was the everyday case, not an edge. The two answers cost the same (a centre,
			// two extents and a rotation, five numbers each), so there is nothing to weigh and no
			// threshold to invent: fit both to the person's own points and keep whichever explains
			// them better. On the bench's strokes the separation is not close --
			//   hand-drawn oval  ellipse 0.0040  quad 0.0286+
			//   hand-drawn box   ellipse 0.0286  quad much lower
			// -- which is why this reads as a residual comparison rather than another cliff.
			if (quad && quad.length === 4) {
				const fitE = _rapierDrawFitEllipseTo(pts);
				if (fitE && fitE.residual < _rapierDrawOutlineResidual(pts, quad)) {
					return { kind: 'ellipse', geom: { cx: fitE.cx, cy: fitE.cy,
						rx: Math.max(6, fitE.ra), ry: Math.max(6, fitE.rb), rot: fitE.theta } };
				}
				return { kind: 'rect', geom: _rapierDrawRectFromQuad(quad) };
			}
		}
		if (circularity > 0.72 || corners <= 2) {
			// R87f: fit the stroke, not the box around it. The old lines here read the centre and the
			// radii off `bbox` and wrote `rot: 0` unconditionally, which meant an oval's proportions
			// changed as you turned it and, past about 30 degrees, an oval came back a CIRCLE --
			// because the bounding box of a tilted 120x65 oval is nearly square, so the aspect test
			// below fired. Measured, at four rotations of one clean oval:
			//   0 deg -> rx=120 ry=65 rot=0 | 20 deg -> rx=115 ry=74 rot=0 | 35 and 50 deg -> circle.
			// The fits get the axes and the angle right at every rotation (draw/core.mjs).
			// The decision between the two is the fit's own: a circle is the cheaper shape, so it wins
			// unless the ellipse explains the stroke better than its extra freedom costs -- compared
			// on residual against the stroke's own size, never on a bounding box's aspect.
			const fitE = _rapierDrawFitEllipseTo(pts), fitC = _rapierDrawFitCircleTo(pts);
			// R87g: a hand-drawn pentagon or hexagon lands here, because a figure with that many
			// short sides is round enough to clear the circularity test -- so "draw a hexagon, get a
			// circle" was the everyday case. The regular fit is offered the same deal the ellipse
			// gets above: explain the person's own points better, or lose. The margin is a factor of
			// two rather than a hair, and the measurements say that is not a close call --
			//   hand-drawn pentagon  regular/round 0.205      hand-drawn hexagon  0.287
			//   hand-drawn ellipse   regular/round 13.342     hand-drawn circle   no regular fit
			// -- a factor of 46 between the nearest accept and the nearest refusal. The ellipse that
			// an earlier attempt turned into a diamond is refused here by its own residual, which is
			// the whole reason this is a comparison and not another threshold.
			const roundResidual = Math.min(fitE ? fitE.residual : Infinity, fitC ? fitC.residual : Infinity);
			if (isFinite(roundResidual)) {
				const reg = _rapierDrawFitRegularTo(pts);
				if (reg && _rapierDrawOutlineResidual(pts, reg.vertices) < roundResidual * RAPIER_DRAW_REGULAR_MARGIN) {
					return { kind: reg.kind, geom: reg.geom };
				}
			}
			const round = Math.min(fitE ? fitE.ra / fitE.rb : 1, fitE ? fitE.rb / fitE.ra : 1);
			if (fitE && fitC && round < 0.86 && fitE.residual < fitC.residual * 0.9) {
				return { kind: 'ellipse', geom: { cx: fitE.cx, cy: fitE.cy,
					rx: Math.max(6, fitE.ra), ry: Math.max(6, fitE.rb), rot: fitE.theta } };
			}
			if (fitC) return { kind: 'circle', geom: { cx: fitC.cx, cy: fitC.cy, r: Math.max(6, fitC.r) } };
			// Neither solve stood up (a degenerate stroke). The box is still an honest last answer.
			const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
			if (aspect < 1.28) return { kind: 'circle', geom: { cx, cy, r: Math.max(6, (bbox.w + bbox.h) / 4) } };
			return { kind: 'ellipse', geom: { cx, cy, rx: Math.max(6, bbox.w / 2), ry: Math.max(6, bbox.h / 2), rot: 0 } };
		}
		// R87g, the last resort. Every branch above has declined, so the answer is about to be the
		// person's own line -- which is the right answer for a squiggle and the wrong one for the
		// five-pointed star the renderer has been able to draw all along. There is no incumbent to
		// compare against here, so the figure has to stand on its own: within 2% of its own size,
		// root-mean-square. A hand-drawn star measures 0.5%; the bench's squiggle and scribble
		// produce no regular fit at all, at any depth. Nothing that any earlier branch would have
		// answered can reach this line, so nothing already right can be taken away by it.
		const last = _rapierDrawFitRegularTo(pts);
		if (last && _rapierDrawOutlineResidual(pts, last.vertices) < Math.max(bbox.w, bbox.h) * RAPIER_DRAW_REGULAR_TIGHT) {
			return { kind: last.kind, geom: last.geom };
		}
		return { kind: 'ink' };
	}
	const eps = Math.max(5, length * 0.035);
	const poly = _rapierDrawRDP(pts, eps);

	if (poly.length === 2 || poly.length === 3) {
		const hook = _rapierDrawHasHook(pts);
		if (poly.length === 2 || ((hook || _rapierDrawNearlyStraight(poly)) && _rapierDrawRunsStraight(pts, hook))) {
			return { kind: hook ? 'arrow' : 'line', geom: { x1: first[0], y1: first[1], x2: last[0], y2: last[1] }, style: hook ? 'arrow' : 'plain' };
		}
	}

	const arc = _rapierDrawFitArc(pts);
	if (arc) return { kind: 'arc', geom: arc };
	return { kind: 'ink' };
}

function _rapierDrawHitGeometry(shape, recipe) {
	const contours = _rapierDrawShapeContours(shape, recipe), polygons = [];
	const poly = !_rapierDrawShapePaintsInk(shape, recipe) && _rapierDrawShapePolygon(shape, recipe);
	if (poly) polygons.push(poly);
	if (shape.label && shape.recognized !== 'text') { const label = _rapierDrawTextLayout(shape, recipe).polygon; polygons.push(label); contours.push(label.concat([label[0]])); }
	if (!_rapierDrawShapePaintsInk(shape, recipe) && ['line', 'arrow'].includes(shape.recognized)) {
		const parts = _rapierDrawArrowParts(shape, recipe);
		for (const head of [parts.headStart, parts.headEnd]) if (head) {
			contours.push(head.kind === 'arrow' ? head.poly : head.poly.concat([head.poly[0]]));
			if (head.kind !== 'arrow') polygons.push(head.poly);
		}
	}
	return { contours, polygons };
}
function _rapierDrawPointSegDist(p, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
	let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
	t = _rapierDrawClamp(t, 0, 1);
	return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

function _rapierDrawPointInRound(pt, g, kind) {
	if (!g) return false;
	const rx = kind === 'circle' ? g.r : g.rx, ry = kind === 'circle' ? g.r : g.ry;
	if (!(rx > 0) || !(ry > 0)) return false;
	const rot = kind === 'circle' ? 0 : (g.rot || 0);
	const cs = Math.cos(rot), sn = Math.sin(rot);
	const dx = pt[0] - g.cx, dy = pt[1] - g.cy;
	const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
	return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
}
function _rapierDrawHitSlop() { return _rapierDrawCoarseSession() ? RAPIER_DRAW_HIT_SLOP_COARSE_PX : RAPIER_DRAW_HIT_SLOP_PX; }
function _rapierDrawHitShape(pt, slop = _rapierDrawHitSlop()) {
	const recipe = _rapierDrawState.recipe;
	let best = null, bestD = Infinity;
	for (let i = recipe.shapes.length - 1; i >= 0; i--) {
		const shape = recipe.shapes[i], { contours, polygons } = _rapierDrawHitGeometry(shape, recipe);
		const round = !_rapierDrawShapePaintsInk(shape, recipe) && ['circle', 'ellipse'].includes(shape.recognized) && _rapierDrawPointInRound(pt, shape.geom, shape.recognized);
		if (round || polygons.some(poly => _rapierDrawPointInPolygon(pt, poly))) {
			if (bestD > 0) { bestD = 0; best = shape.id; }
			continue;
		}
		let d = Infinity;
		for (const points of contours) for (let k = 1; k < points.length; k++) d = Math.min(d, _rapierDrawPointSegDist(pt, points[k - 1], points[k]));
		d = Math.max(0, d - _rapierDrawStrokeHalf(shape, recipe));
		if (d <= slop && d < bestD) { bestD = d; best = shape.id; }
	}
	return best;
}
// Hit order table (shapes-and-select-rules.md), rank 2: an arrow/line's own rendered label
// outranks its shaft. The finger reaches the label's rendered text well before it reaches the
// small round label-handle icon 44 screen px below it (_rapierDrawUpdateHandles), so without this
// a press on the label itself would fall through to the generic shape hit test and start an
// ordinary whole-shape move -- dragging the shaft out from under a label the person meant to
// reposition on its own. Only applies once the shape is already the sole selection, matching every
// other handle (a handle cannot be grabbed before its shape is selected either).
function _rapierDrawLabelHandleAt(shape, point) {
	if (!shape || shape.locked || !shape.label || !['line', 'arrow'].includes(shape.recognized)) return null;
	if (_rapierDrawShapePaintsInk(shape, _rapierDrawState.recipe)) return null;
	const layout = _rapierDrawTextLayout(shape, _rapierDrawState.recipe);
	if (!layout.polygon || !_rapierDrawPointInPolygon(point, layout.polygon)) return null;
	const handlePoint = [layout.center.x, layout.center.y];
	// A handle grabbed through the real DOM button (`state.handles`, populated by
	// _rapierDrawUpdateHandles) always carries its own rendered screen position -- the active-
	// handle-follows-the-finger math in that same function reads `gesture.handle.screen` on every
	// frame. This handle is synthesized here instead, so it must carry the same field or that read
	// throws the moment the gesture's first real move re-renders handles.
	const svg = _rapierDrawState.svgRoot, screen = svg ? _rapierDrawMapToScreen(handlePoint[0], handlePoint[1], svg.getBoundingClientRect(), svg.viewBox.baseVal) : handlePoint;
	return { id: 'label', label: 'Move label along path', point: handlePoint, screen };
}
// Press ring (shapes-and-select-rules.md): the hit shape's own painted outline, traced through the
// same polyline the hit test itself already uses (_rapierDrawShapePolyline), so the ring always
// matches what was actually grabbed -- a rect, an ellipse's polygon approximation, an arrow's
// route, a freehand stroke, all fall out of the one function already relied on elsewhere.
function _rapierDrawPressRingPath(shape, recipe) {
	const path = _rapierDrawShapePolyline(shape, recipe);
	if (!path || !path.length) return '';
	return path.map((p, i) => (i ? 'L' : 'M') + _rapierDrawFmt(p[0]) + ' ' + _rapierDrawFmt(p[1])).join('');
}
function _rapierDrawShowPressRing(id) {
	const state = _rapierDrawState, el = state.pressRingEl, shape = id && _rapierDrawShapeById(id);
	if (!el || !shape) return;
	const d = _rapierDrawPressRingPath(shape, state.recipe);
	if (!d) return;
	clearTimeout(state.pressRingTimer); state.pressRingTimer = null;
	el.classList.remove('rapier-draw-press-ring--out');
	el.setAttribute('stroke-width', _rapierDrawFmt(_rapierDrawShapeNib(shape, state.recipe) * 1.6 + 4));
	el.setAttribute('d', d);
}
function _rapierDrawHidePressRing() {
	const state = _rapierDrawState, el = state.pressRingEl;
	if (!el || !el.getAttribute('d')) return;
	clearTimeout(state.pressRingTimer);
	el.classList.add('rapier-draw-press-ring--out');
	state.pressRingTimer = setTimeout(() => { el.setAttribute('d', ''); el.classList.remove('rapier-draw-press-ring--out'); state.pressRingTimer = null; }, RAPIER_DRAW_PRESS_RING_FADE_MS + 10);
}
// Scribble select on touch (shapes-and-select-rules.md): the same marquee gesture state, a second
// geometry. A touch marquee's live selection test walks the finger's own recorded path instead of
// a press-to-current rectangle, catching a shape whose stroke/interior the path actually crosses
// -- reusing the identical per-shape hit geometry (_rapierDrawHitGeometry, built from
// _rapierDrawShapePolygon/_rapierDrawShapePolyline/_rapierDrawArrowHitPolyline) the rectangular
// marquee (_rapierDrawMarqueeCatches) and the plain hit test both already rely on. The mouse never
// calls this -- it keeps the axis-aligned rectangle.
function _rapierDrawSegmentsCross(a, b, c, d) {
	const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
	const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function _rapierDrawScribbleCatches(points) {
	const recipe = _rapierDrawState.recipe, scale = _rapierDrawState.gesture?.scale || 1;
	if (!recipe || !points || points.length < 2) return [];
	let length = 0; for (let i = 1; i < points.length; i++) length += _rapierDrawDist(points[i - 1], points[i]);
	if (length * scale < RAPIER_DRAW_MARQUEE_MIN) return [];
	const lockedGroups = new Set(recipe.shapes.filter(shape => shape.locked && shape.group).map(shape => shape.group));
	return recipe.shapes.filter(shape => {
		if (shape.locked || lockedGroups.has(shape.group)) return false;
		const geometry = _rapierDrawHitGeometry(shape, recipe);
		for (const poly of geometry.polygons) if (points.some(p => _rapierDrawPointInPolygon(p, poly))) return true;
		for (let i = 1; i < points.length; i++) {
			const a = points[i - 1], b = points[i];
			for (const contour of geometry.contours) for (let k = 1; k < contour.length; k++) if (_rapierDrawSegmentsCross(a, b, contour[k - 1], contour[k])) return true;
			for (const poly of geometry.polygons) for (let k = 0; k < poly.length; k++) if (_rapierDrawSegmentsCross(a, b, poly[k], poly[(k + 1) % poly.length])) return true;
		}
		return false;
	}).map(shape => shape.id);
}
function _rapierDrawPaintScribble() {
	const el = _rapierDrawState.scribbleEl, pts = _rapierDrawState.gesture?.scribble;
	if (!el) return;
	el.setAttribute('d', pts && pts.length > 1 ? pts.map((p, i) => (i ? 'L' : 'M') + _rapierDrawFmt(p[0]) + ' ' + _rapierDrawFmt(p[1])).join('') : '');
}

function _rapierDrawSnapEndpoint(px, py, excludeId) {
	const recipe = _rapierDrawState.recipe;
	let best = null, bestD = RAPIER_DRAW_SNAP_EDGE_PX;
	for (const shape of _rapierDrawState.recipe.shapes) {
		if (shape.id === excludeId || shape.recognized === 'ink' || !shape.geom) continue;
		if (!_rapierDrawShapePolygon(shape, recipe) && !['circle', 'ellipse'].includes(shape.recognized)) continue;
		const cand = _rapierDrawEdgeSnapPoint(px, py, shape, recipe);
		if (cand && cand.dist <= bestD) { bestD = cand.dist; best = cand.point; }
	}
	if (best) return best;
	let bestEnd = null, bestEndD = RAPIER_DRAW_SNAP_END_PX;
	for (const shape of _rapierDrawState.recipe.shapes) {
		if (shape.id === excludeId || !shape.geom) continue;
		if (shape.recognized !== 'line' && shape.recognized !== 'arrow') continue;
		for (const end of [[shape.geom.x1, shape.geom.y1], [shape.geom.x2, shape.geom.y2]]) {
			const d = _rapierDrawDist([px, py], end);
			if (d <= bestEndD) { bestEndD = d; bestEnd = end; }
		}
	}
	return bestEnd;
}

function _rapierDrawSnapLineGeom(g, excludeId) {
	const s1 = _rapierDrawSnapEndpoint(g.x1, g.y1, excludeId);
	const s2 = _rapierDrawSnapEndpoint(g.x2, g.y2, excludeId);
	if (s1) { g.x1 = s1[0]; g.y1 = s1[1]; }
	if (s2) { g.x2 = s2[0]; g.y2 = s2[1]; }
}

function _rapierDrawFindEdgeBindTarget(px, py, excludeId, recipe = _rapierDrawState.recipe, slop = RAPIER_DRAW_SNAP_EDGE_PX) {
	let best = null, bestD = slop;
	for (let i = recipe.shapes.length - 1; i >= 0; i--) {
		const shape = recipe.shapes[i];
		if (shape.id === excludeId || !shape.geom || _rapierDrawShapePaintsInk(shape, recipe)) continue;
		const cand = _rapierDrawEdgeSnapPoint(px, py, shape, recipe);
		if (!cand) continue;
		const poly = _rapierDrawShapePolygon(shape, recipe);
		const inside = shape.recognized === 'circle' || shape.recognized === 'ellipse'
			? _rapierDrawPointInRound([px, py], shape.geom, shape.recognized) : poly && _rapierDrawPointInPolygon([px, py], poly);
		const d = inside ? 0 : cand.dist;
		if (d <= slop && (best === null || d < bestD)) { bestD = d; best = { shape, point: cand.point }; }
	}
	return best;
}


function _rapierDrawSetArrowEndpoint(shape, end, point, recipe = _rapierDrawState.recipe, slop = RAPIER_DRAW_SNAP_EDGE_PX) {
	const target = _rapierDrawFindEdgeBindTarget(point[0], point[1], shape.id, recipe, slop);
	const p = target ? target.point : point, start = end === 'start', next = { ...shape.geom };
	next[start ? 'x1' : 'x2'] = p[0]; next[start ? 'y1' : 'y2'] = p[1];
	if (!_rapierDrawSetLineGeometry(shape, next, recipe)) { showToast('This would place the drawing outside its limits. Use a smaller move or size.', 'error'); return null; }
	const anchor = shape.recognized === 'arrow' && target && _rapierDrawBindAnchorFor(target.shape, p, recipe);
	if (anchor) (shape.bind || (shape.bind = {}))[end] = anchor;
	else if (shape.bind) { delete shape.bind[end]; if (!shape.bind.start && !shape.bind.end) delete shape.bind; }
	return target?.shape.id || null;
}

function _rapierDrawBindArrowEnds(g, recipe = _rapierDrawState.recipe) {
	// Probe on a copy: the endpoint resolver writes the snapped ends into the geometry it is given.
	const shape = { recognized: 'arrow', geom: { ...g } };
	const startId = _rapierDrawSetArrowEndpoint(shape, 'start', [g.x1, g.y1], recipe);
	const endId = _rapierDrawSetArrowEndpoint(shape, 'end', [g.x2, g.y2], recipe);
	// An arrow drawn with both ends inside one shape is an annotation inside that shape, not a
	// connector: it keeps exactly the geometry the person drew and binds to nothing.
	if (startId && startId === endId) return null;
	Object.assign(g, shape.geom);
	return shape.bind || null;
}

function _rapierDrawNearestAngle(angle, near) {
	let a = angle;
	while (a - near > Math.PI) a -= 2 * Math.PI;
	while (a - near < -Math.PI) a += 2 * Math.PI;
	return a;
}

function _rapierDrawSnapArcGeom(g, excludeId) {
	const [p0, p1] = _rapierDrawArcEndpoints(g);
	const s0 = _rapierDrawSnapEndpoint(p0[0], p0[1], excludeId);
	const s1 = _rapierDrawSnapEndpoint(p1[0], p1[1], excludeId);
	if (s0) g.a0 = _rapierDrawNearestAngle(Math.atan2(s0[1] - g.cy, s0[0] - g.cx), g.a0);
	if (s1) g.a1 = _rapierDrawNearestAngle(Math.atan2(s1[1] - g.cy, s1[0] - g.cx), g.a1);
}

function _rapierDrawRestSurfaces(excludeId) {
	const recipe = _rapierDrawState.recipe;
	const segs = [];
	for (const shape of _rapierDrawState.recipe.shapes) {
		if (shape.id === excludeId || !shape.geom) continue;
		if (shape.recognized === 'line' || shape.recognized === 'arrow') { const g = shape.geom; segs.push([[g.x1, g.y1], [g.x2, g.y2]]); continue; }
		if (_rapierDrawShapePolygon(shape, recipe)) {
			const poly = _rapierDrawShapePolygon(shape, recipe);
			if (poly) for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
		}
	}
	return segs;
}

function _rapierDrawRoundRestDelta(shape, seg) {
	const g = shape.geom, isCircle = shape.recognized === 'circle';
	const rx = isCircle ? g.r : g.rx, ry = isCircle ? g.r : g.ry;
	const Q = _rapierDrawClosestOnSeg([g.cx, g.cy], seg[0], seg[1]);
	const E = _rapierDrawEllipseEdgePoint(g.cx, g.cy, rx, ry, isCircle ? 0 : (g.rot || 0), Q[0], Q[1]);
	const dist = _rapierDrawDist(Q, E);
	const overlapping = _rapierDrawDist([g.cx, g.cy], Q) < _rapierDrawDist([g.cx, g.cy], E);
	if (overlapping && dist > Math.max(rx, ry) * 2) return null;
	return { dx: Q[0] - E[0], dy: Q[1] - E[1], dist };
}

function _rapierDrawPolyRestDelta(shape, seg) {
	const poly = _rapierDrawShapePolygon(shape, _rapierDrawState.recipe);
	if (!poly) return null;
	const b = _rapierDrawBBox(poly), cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
	const Q = _rapierDrawClosestOnSeg([cx, cy], seg[0], seg[1]);
	let nx = cx - Q[0], ny = cy - Q[1];
	const nlen = Math.hypot(nx, ny);
	if (nlen < 1e-6) return null;
	nx /= nlen; ny /= nlen;
	let minD = Infinity, maxD = -Infinity;
	for (const p of poly) { const d = (p[0] - Q[0]) * nx + (p[1] - Q[1]) * ny; if (d < minD) minD = d; if (d > maxD) maxD = d; }
	if (minD < 0 && -minD > maxD - minD) return null;
	return { dx: nx * -minD, dy: ny * -minD, dist: Math.abs(minD) };
}

function _rapierDrawRestGeom(kind, geom, excludeId) {
	const isRound = kind === 'circle' || kind === 'ellipse';
	const isPoly = !!_rapierDrawShapePolygon({ recognized: kind, geom }, _rapierDrawState.recipe);
	if (!isRound && !isPoly) return geom;
	const shapeLike = { recognized: kind, geom };
	let best = null;
	for (const seg of _rapierDrawRestSurfaces(excludeId)) {
		const r = isRound ? _rapierDrawRoundRestDelta(shapeLike, seg) : _rapierDrawPolyRestDelta(shapeLike, seg);
		if (!r || r.dist > RAPIER_DRAW_SNAP_EDGE_PX) continue;
		if (!best || r.dist < best.dist) best = r;
	}
	return best ? _rapierDrawTranslateGeom(kind, geom, best.dx, best.dy) : geom;
}

function _rapierDrawSmoothWord(level) {
	const n = _rapierDrawSmoothLevel(level);
	return n === 0 ? 'Off' : n <= 35 ? 'Natural' : n <= 70 ? 'Smooth' : 'Shape';
}

function _rapierDrawShapeBBox(shape) { return _rapierDrawShapeBBoxIn(shape, _rapierDrawState.recipe); }

function _rapierDrawMeasuredView(body, w, h) {
	if (typeof document === 'undefined' || !document.body) return null;
	let host = null;
	try {
		host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		host.setAttribute('viewBox', '0 0 ' + _rapierDrawFmt(w) + ' ' + _rapierDrawFmt(h));
		host.setAttribute('width', _rapierDrawFmt(w));
		host.setAttribute('height', _rapierDrawFmt(h));

		// Keep the SVG in layout for getBBox; display:none can make the measurement unusable.
		host.setAttribute('style', 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none');
		host.innerHTML = body;
		for (const style of host.querySelectorAll('style[data-rapier-font]')) style.remove();
		document.body.append(host);
		const box = host.getBBox();
		if (!(box.width > 0) || !(box.height > 0)) return null;
		return { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
	} catch (_) { return null; }
	finally { host?.remove(); }
}

function _rapierDrawNewRecipe(w, h) { return { version: RAPIER_DRAW_VERSION, canvas: { w, h }, strokes: [], shapes: [] }; }
function _rapierDrawClone(value) { return JSON.parse(JSON.stringify(value)); }
function _rapierDrawHistoryCopy(value) {
	// Recipes are plain data. Strings (pictures and font bytes) are immutable revisions; retain
	// their references while copying only the mutable containers, never a raster-sized JSON copy.
	if (Array.isArray(value)) return value.map(_rapierDrawHistoryCopy);
	if (!value || typeof value !== 'object') return value;
	const copy = {};
	for (const key of Object.keys(value)) if (value[key] !== undefined) copy[key] = _rapierDrawHistoryCopy(value[key]);
	return copy;
}
function _rapierDrawHistoryEqual(a, b) {
	if (a === b) return true;
	if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
	const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
	return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && _rapierDrawHistoryEqual(a[key], b[key]));
}
function _rapierDrawHistoryRecipe(recipe = _rapierDrawState.recipe) {
	// undo-rules.md U6: a mark remembers the selection current at it, so Undo restores the document
	// and the selection together and the next thumb gesture can carry on.
	return { recipe: _rapierDrawHistoryCopy({ ...recipe, fonts: undefined }), fonts: recipe.fonts?.slice(), selection: _rapierDrawSelection() };
}
function _rapierDrawRestoreRecipe(snapshot) {
	if (snapshot?.delta) return _rapierDrawApplyHistory(snapshot, 'before');
	const recipe = _rapierDrawHistoryCopy(snapshot.recipe);
	if (snapshot.fonts) recipe.fonts = snapshot.fonts.slice();
	return recipe;
}
function _rapierDrawSameRecipe(snapshot, recipe = _rapierDrawState.recipe) {
	if (!snapshot) return false;
	if (snapshot.recipe) return _rapierDrawHistoryEqual(snapshot.recipe, { ...recipe, fonts: undefined }) && (snapshot.fonts || []).map(font => font.id).join() === (recipe.fonts || []).map(font => font.id).join();
	if (!snapshot.delta) return false;
	const restored = _rapierDrawApplyHistory(snapshot, 'after', recipe);
	return _rapierDrawHistoryEqual({ ...restored, fonts: undefined }, { ...recipe, fonts: undefined });
}
function _rapierDrawHistoryDelta(before, after) {
	const beforeShapes = new Map(before.shapes.map(shape => [shape.id, shape]));
	const afterShapes = new Map(after.shapes.map(shape => [shape.id, shape]));
	const shapes = {};
	for (const id of new Set([...beforeShapes.keys(), ...afterShapes.keys()])) {
		const prior = beforeShapes.get(id), next = afterShapes.get(id);
		// The before side already belongs to the immutable snapshot. Copy only next's metadata;
		// both sides keep the raster string itself, shared with the neighbouring history entry.
		if (!_rapierDrawHistoryEqual(prior, next)) shapes[id] = { before: prior || null, after: next ? _rapierDrawHistoryCopy(next) : null };
	}
	const beforeOrder = before.shapes.map(shape => shape.id), afterOrder = after.shapes.map(shape => shape.id);
	const orderChanged = beforeOrder.join('\0') !== afterOrder.join('\0');
	const strokesChanged = !_rapierDrawHistoryEqual(before.strokes, after.strokes);
	// A font upload changes recipe.fonts and a shape's textFont together, so the two sides of the
	// delta need their own font sets -- a single shared set (as before) leaves Redo's shape naming
	// a font that side's recipe.fonts never gained. Fonts are immutable per id, so a shallow slice
	// of the array is enough; comparing by id list avoids restringifying font bytes on every command.
	const fontsChanged = (before.fonts || []).map(font => font.id).join('\0') !== (after.fonts || []).map(font => font.id).join('\0');
	const metaKeys = ['canvas', 'smooth', 'nib', 'angle', 'light', 'paper', 'effect'];
	const beforeMeta = {}, afterMeta = {};
	let metaChanged = false;
	for (const key of metaKeys) {
		const priorJson = JSON.stringify(before[key]), nextJson = JSON.stringify(after[key]);
		if (priorJson === nextJson) continue;
		metaChanged = true;
		beforeMeta[key] = before[key] == null ? null : _rapierDrawClone(before[key]);
		afterMeta[key] = after[key] == null ? null : _rapierDrawClone(after[key]);
	}
	return {
		delta: {
			shapes,
			beforeOrder: orderChanged ? beforeOrder : undefined,
			afterOrder: orderChanged ? afterOrder : undefined,
			strokes: strokesChanged ? { before: _rapierDrawClone(before.strokes), after: _rapierDrawClone(after.strokes) } : undefined,
			beforeMeta: metaChanged ? beforeMeta : undefined,
			afterMeta: metaChanged ? afterMeta : undefined,
			fonts: fontsChanged ? { before: (before.fonts || []).slice(), after: (after.fonts || []).slice() } : undefined,
		},
		selection: (before.selection || []).slice(), redoSelection: _rapierDrawSelection(),
	};
}
function _rapierDrawApplyHistory(entry, side, base = _rapierDrawState.recipe) {
	if (!entry?.delta) return _rapierDrawRestoreRecipe(entry);
	const recipe = _rapierDrawHistoryCopy(base);
	for (const [id, pair] of Object.entries(entry.delta.shapes || {})) {
		const next = pair[side];
		const index = recipe.shapes.findIndex(shape => shape.id === id);
		if (next == null) { if (index >= 0) recipe.shapes.splice(index, 1); }
		else if (index >= 0) recipe.shapes[index] = _rapierDrawHistoryCopy(next);
		else recipe.shapes.push(_rapierDrawHistoryCopy(next));
	}
	const order = side === 'before' ? entry.delta.beforeOrder : entry.delta.afterOrder;
	if (order) {
		const byId = new Map(recipe.shapes.map(shape => [shape.id, shape]));
		recipe.shapes = order.map(id => byId.get(id)).filter(Boolean);
		for (const [id, shape] of byId) if (!order.includes(id)) recipe.shapes.push(shape);
	}
	if (entry.delta.strokes) recipe.strokes = _rapierDrawClone(entry.delta.strokes[side]);
	const meta = side === 'before' ? entry.delta.beforeMeta : entry.delta.afterMeta;
	if (meta) for (const [key, value] of Object.entries(meta)) {
		if (value == null) delete recipe[key]; else recipe[key] = _rapierDrawClone(value);
	}
	if (entry.delta.fonts) recipe.fonts = entry.delta.fonts[side].slice();
	return recipe;
}
function _rapierDrawSnapshot(snapshot = _rapierDrawHistoryRecipe(), amend = false) {
	_rapierDrawBackupTouch();
	const state = _rapierDrawState;
	// Keep both prior history branches before capping Undo so render failure can restore them exactly.
	state.renderEdit = { snapshot, undo: state.undoStack, redo: state.redoStack };
	if (amend && state.undoStack.length) {
		// A codec-only custody change belongs to the stroke already at the head of history.
		// Restore its before side before re-sealing, including piece IDs and canvas growth.
		const previous = state.undoStack.at(-1);
		snapshot = { ..._rapierDrawHistoryRecipe(_rapierDrawRestoreRecipe(previous)),
			selection: previous.selection, shift: previous.shift, agent: previous.agent };
		state.undoStack = state.undoStack.slice(0, -1).concat(snapshot);
	} else state.undoStack = state.undoStack.concat(snapshot).slice(-60);
	// The entry this command left at the head, amended or new: a growth in the same command writes its shift there.
	state.renderEdit.entry = snapshot;
	state.redoStack = [];
	_rapierDrawRenderHistory();
	return snapshot;
}
function _rapierDrawSealHistory(before = _rapierDrawState.undoStack.at(-1)) {
	const state = _rapierDrawState;
	if (!before || before.delta) return before;
	// The paper follows the change being sealed (every gesture, patch and text edit passes here): a growth that
	// moved the shapes left or down moved the window with them, is written on this step so Undo gives it back,
	// and is shown again. A growth that cannot be measured never stops the seal.
	try {
		// The growth writes its shift on the open step itself (_rapierDrawRecordShift, when `before` is that step); it is
		// added here only when it could not, so a shift is never counted twice (an audit of 30 September found Undo
		// giving back double the move).
		const grown = _rapierDrawGrowCanvasToContent();
		if (grown && (grown.dx || grown.dy)) { if (!grown.recorded) before.shift = { dx: (before.shift?.dx || 0) + grown.dx, dy: (before.shift?.dy || 0) + grown.dy }; _rapierDrawRenderShapes(); }
	} catch (_) {}
	const prior = { ...before.recipe, fonts: before.fonts };
	const entry = _rapierDrawHistoryDelta(prior, state.recipe);
	entry.selection = (before.selection || []).slice();
	if (before.shift) entry.shift = before.shift;
	// An agent's contribution is one Draw step AND one document.draw transaction. Seal must carry
	// the stamp so Undo of the delta still knows to walk the document journal (R87g: "provided our
	// undo system works properly"). Selection and shift already travel this way.
	if (before.agent) entry.agent = { before: String(before.agent.before || ''), after: String(before.agent.after || ''),
		savedBefore: before.agent.savedBefore || null, savedAfter: before.agent.savedAfter || null };
	const at = state.undoStack.lastIndexOf(before);
	if (at >= 0) state.undoStack[at] = entry;
	// The snapshot has become a delta; renderEdit still points at the snapshot, so a growth after the
	// seal has nothing of this command's to write on and correctly leaves the stack alone.
	return entry;
}

function _rapierDrawMarkSelection() {
	if (!_rapierDrawState.svg) return;
	const chosen = new Set(_rapierDrawTool() === 'select' ? _rapierDrawSelection() : []);
	for (const g of _rapierDrawState.svg.querySelectorAll('[data-shape-id]')) {
		if (chosen.has(g.getAttribute('data-shape-id'))) g.setAttribute('data-selected', ''); else g.removeAttribute('data-selected');
	}
	_rapierDrawUpdateHandles();
}

function _rapierDrawParseSvgNode(html) {
	const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	tmp.innerHTML = html;
	return tmp.firstElementChild;
}
function _rapierDrawPatchShapeNodes(ids) {
	const state = _rapierDrawState, host = state.svg;
	if (!host || !ids?.length) return;
	if (state.recipe.effect || state.recipe.shapes.some(shape => shape.effect && shape.paint?.group) || host.querySelector('[data-rapier-copy-scene],[data-rapier-copy-layer]')) { _rapierDrawAdoptShapeNodes(); return; }
	_rapierDrawRerouteBoundArrows(state.recipe);
	const patch = new Set(ids);
	for (const shape of state.recipe.shapes) {
		if (shape.bind && Object.values(shape.bind).some(anchor => patch.has(anchor.to))) patch.add(shape.id);
	}
	for (const id of _rapierDrawRouteChanges(state.recipe, ids, !!state.gesture)) patch.add(id);
	for (const shape of state.recipe.shapes) {
		if (!patch.has(shape.id)) continue;
		const html = _rapierDrawShapeMarkup(_rapierDrawDisplayShape(shape), state.recipe);
		_rapierDrawNoteColours(html);
		const next = _rapierDrawParseSvgNode(html);
		if (!next) continue;
		const existing = host.querySelector('[data-shape-id="' + shape.id + '"]');
		if (existing) existing.replaceWith(next); else host.appendChild(next);
	}
	_rapierDrawDarkStyleSync();
	_rapierDrawMarkSelection();
}
function _rapierDrawAdoptShapeNodes() {
	const state = _rapierDrawState, host = state.svg;
	_rapierDrawRerouteBoundArrows(state.recipe);
	if (state.recipe.effect || state.recipe.shapes.some(shape => shape.effect && shape.paint?.group) || host.querySelector('[data-rapier-copy-scene],[data-rapier-copy-layer]')) {
		const display = { ...state.recipe, shapes: state.recipe.shapes.map(_rapierDrawDisplayShape) };
		const html = _rapierDrawSceneMarkup(display, false, true);
		const scene = _rapierDrawParseSvgNode('<g>' + html + '</g>');
		host.replaceChildren(...scene.childNodes);
		if (typeof _rapierPaintReattachLive === 'function') _rapierPaintReattachLive();
		state.darkUsed = new Set(); state.darkCurrentColor = false; state.darkPaint = false;
		_rapierDrawNoteColours(html); _rapierDrawDarkStyleSync(); _rapierDrawSyncFonts(); _rapierDrawMarkSelection();
		return;
	}
	const previous = new Map();
	for (const node of [...host.children]) {
		const id = node.getAttribute('data-shape-id');
		if (id) previous.set(id, node);
	}
	state.darkUsed = new Set(); state.darkCurrentColor = false; state.darkPaint = false;
	for (const shape of state.recipe.shapes) {
		const html = _rapierDrawShapeMarkup(_rapierDrawDisplayShape(shape), state.recipe);
		_rapierDrawNoteColours(html);
		let node = previous.get(shape.id);
		if (!node || node.outerHTML !== html) {
			const fresh = _rapierDrawParseSvgNode(html);
			if (!fresh) continue;
			if (node) node.replaceWith(fresh);
			node = fresh;
		}
		host.appendChild(node);
		previous.delete(shape.id);
	}
	for (const leftover of previous.values()) leftover.remove();
	_rapierDrawDarkStyleSync();
	_rapierDrawSyncFonts();
	_rapierDrawMarkSelection();
}

function _rapierDrawRenderShapes(onlyIds) {
	const state = _rapierDrawState;
	if (!state.svg) return;
	let refused = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			if (onlyIds?.length && !attempt) _rapierDrawPatchShapeNodes(onlyIds);
			else _rapierDrawAdoptShapeNodes();
			state.renderEdit = null;
			if (refused) showToast(refused.code === 'drawing_route_blocked' ? 'That move blocks a connector. Your diagram was kept.' : refused.message, 'error');
			return;
		} catch (error) {
			if (!['drawing_work_limit', 'drawing_geometry_limit', 'drawing_route_blocked'].includes(error.code)) throw error;
			refused = error;
			if (!attempt && state.gesture?.before) _rapierDrawEndGesture(true);
			else {
				const prior = !attempt && state.renderEdit;
				state.renderEdit = null;
				if (!prior) throw error;
				state.recipe = _rapierDrawRestoreRecipe(prior.snapshot); state.undoStack = prior.undo; state.redoStack = prior.redo;
				state.settingEdit = null;
				_rapierDrawSetSelection([]);
			}
		}
	}
}
function _rapierDrawRenderAll() {
	const state = _rapierDrawState, recipe = state.recipe;
	// The viewBox follows the recipe's canvas (R78: a canvas grown by Paint, or shrunk back by Undo).
	_rapierDrawApplyView();
	_rapierDrawRenderShapes();
	_rapierDrawUpdateMenu();
	_rapierPaintSyncPaper();
	_rapierDrawRenderHistory();
	if (_rapierDrawTool() === 'effects') _rapierDrawEffectsSync();
}
// Grows the canvas to hold a box in canvas units (R78, the paper grows under the hand): returns
// {dx, dy} -- the shift applied to every shape when the box lay left of or above the origin --
// or null when the box already fits. The caller owns the history snapshot.
function _rapierDrawGrowCanvas(minX, minY, maxX, maxY) {
	const state = _rapierDrawState, recipe = state.recipe;
	if (!recipe || ![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
	const dx = Math.max(0, Math.ceil(-minX)), dy = Math.max(0, Math.ceil(-minY));
	const w = Math.max(recipe.canvas.w + dx, Math.ceil(maxX + dx)), h = Math.max(recipe.canvas.h + dy, Math.ceil(maxY + dy));
	if (!dx && !dy && w === recipe.canvas.w && h === recipe.canvas.h) return null;
	if (dx || dy) for (const shape of recipe.shapes) _rapierDrawTranslateShape(shape, recipe, dx, dy);
	recipe.canvas = { w, h };
	state.canvasFollowsStage = false;
	// Growing left or above moves every shape by (dx, dy) in canvas units. The window moves with them
	// so the person's work stays under the same pixel: without this the whole drawing jumps right and
	// down the instant a stroke crosses the left edge. The window's SIZE is untouched -- see
	// _rapierDrawViewBase -- so the zoom is the zoom the person set, before and after.
	// The shift is written once, here, on the step this command holds open; a caller that grows before it opens its
	// step gets `recorded: false` and writes the shift itself.
	let recorded = false;
	if (dx || dy) { const v = _rapierDrawView(); v.x += dx; v.y += dy; recorded = _rapierDrawRecordShift(dx, dy); }
	_rapierDrawApplyView();
	return { dx, dy, recorded };
}
// The paper holds everything on it (the founder, 29 September: the canvas "is not expanding automatically
// properly to capture new content ... It's everything"): after every committed change the canvas grows to the
// scene's painted bounds with a margin, the same growth a stroke past the edge makes, so a box dragged off the
// paper, a lowered diagram or a word typed at its edge is never left off it. It never shrinks; Undo takes a
// growth back with the step that made it (_rapierDrawCommand records the shift on that step).
const RAPIER_DRAW_PAPER_MARGIN = 24;
function _rapierDrawGrowCanvasToContent(recipe = _rapierDrawState.recipe) {
	// Effects expand the displayed paper only; authored geometry grows or translates the canvas.
	// Otherwise adding a copy stack would move the originals, and a sheet filter would grow
	// its own canvas again at every history seal. The SVG crop still includes all filtered ink.
	const source = recipe && { ...recipe, effect: undefined, shapes: recipe.shapes.map(shape => shape.effect ? { ...shape, effect: undefined } : shape) };
	const box = source && _rapierDrawUnionView(source);
	if (!box) return null;
	const m = RAPIER_DRAW_PAPER_MARGIN;
	return _rapierDrawGrowCanvas(box.minX - m, box.minY - m, box.maxX + m, box.maxY + m);
}
// A growth that moved every shape moved the window with them, and the history snapshot was taken
// BEFORE it: undoing puts the shapes back at their old coordinates, so the window has to give the
// shift back or everything the person kept slides across the glass at the moment they asked for one
// stroke to be taken back (measured at 154 screen pixels on a phone). The shift is written on the
// entry the current command pushed, which is the entry that undo pops -- and only on that one, so a
// growth outside a command can never tag somebody else's step. _rapierDrawSealHistory carries it
// across when the snapshot becomes a delta.
function _rapierDrawRecordShift(dx, dy) {
	const state = _rapierDrawState, entry = state.undoStack.at(-1);
	if (!entry || entry !== state.renderEdit?.entry) return false;
	entry.shift = {dx: (entry.shift?.dx || 0) + dx, dy: (entry.shift?.dy || 0) + dy};
	return true;
}
// Law 47 (the founder, 26 September 2026: "It's literally an undo and a redo button, and it should be
// absolutely identical absolutely everywhere ... Copy the icons, the animations, the behavior, every
// single little thing"): Draw's undo and redo are the editor's own two buttons (editor/ui.html #btn-undo,
// #btn-redo), cloned when the surface is built -- the element, its class, glyph and size, styled by the
// same rules (rapier-app.css .icon-btn, .rapier-dial), turned by the same dial (_rapierDialTurn) and
// saying their state through the same function (_rapierDialSay). Only the act they call is Draw's. The
// per-button animation is owned by the live DOM and is not copied.
function _rapierDrawDialButton(act) {
	const button = document.getElementById('btn-' + act).cloneNode(true);
	button.removeAttribute('id'); button.removeAttribute('data-action'); button.dataset.drawAct = act;
	return button;
}
// What they say, as the editor's say it (editor/engine.js renderHistory): a step of Draw's has no name, so
// the word is the editor's own for a change; nothing to do is Draw's two stacks empty, and a stroke still
// drying (or a painting too large to keep) is one more thing Undo takes back. While DONE writes, nothing is.
function _rapierDrawRenderHistory() {
	const state = _rapierDrawState, [undo, redo] = state.surface?.querySelectorAll('.rapier-draw-head .rapier-dial') || [], layer = state.paintLayer;
	if (!undo || !redo) return;
	_rapierDialSay(undo, 'undo change', state.finishing || !(state.undoStack.length || layer?.pendingOverflow || layer?.pendingCommit || layer?.previousFlip?.pendingCommit || layer?.surface?.wetState));
	_rapierDialSay(redo, 'redo change', state.finishing || !state.redoStack.length);
}
// False when there was nothing to take back or bring back: the head's arrow presses in rather than
// turning (editor/engine.js _rapierDialTurn, docs/intent.md law 12), the one answer every undo and
// redo in Rapier gives, in place of the notice that used to wait for Draw to close.
function _rapierDrawUndo(redo = false) {
	const state = _rapierDrawState;
	if (!_rapierDrawFinishText()) return false;
	// An Undo asked mid-replay lands the agent's whole contribution first and then takes that one
	// step back: the replay is how a committed change is shown, never a state to accept in pieces.
	_rapierDrawReplayEnd();
	_rapierPaintFlushRevision();
	_rapierDrawCancelGesture();
	// Cancelling a paint gesture keeps its current ink and may queue a new encode. Both Undo and
	// Redo must finish it before choosing a branch; a new stroke invalidates the old Redo branch.
	_rapierPaintFlushRevision();
	// A lifted wet stroke is new work even before its drying timer commits. Settle it through
	// Paint's owner before either branch is chosen, so Redo cannot revive work it replaced.
	if (typeof _rapierPaintFlushWet === 'function') _rapierPaintFlushWet();
	// A live layer that overflowed the raster budget (Astra-R74 P03) was never pushed onto the
	// history stack -- nothing was committed -- so Undo's job here is the deliberate discard the
	// toast promised, not a reach into real history.
	if (!redo && typeof _rapierPaintDiscardOverflow === 'function' && _rapierPaintDiscardOverflow()) { _rapierDrawBackupTouch(); return; }
	// The wet settlement above can itself begin Set. Revoke its token only after that fence,
	// before walking history, so neither an older encode nor one started by Undo can revive ink.
	if (state.paintSetting?.auto) _rapierPaintCloseLayer();
	const from = redo ? state.redoStack : state.undoStack, to = redo ? state.undoStack : state.redoStack, prior = from.pop();
	if (!prior) return false;
	if (prior.delta) { to.push(prior); state.recipe = _rapierDrawApplyHistory(prior, redo ? 'after' : 'before'); }
	else { to.push(_rapierDrawHistoryRecipe()); state.recipe = _rapierDrawRestoreRecipe(prior); }
	// The window follows the shapes, both ways: the same shift the growth added is taken off going
	// back and put on again going forward, so the drawing never moves on the screen for either.
	if (prior.shift) { const v = _rapierDrawView(), s = redo ? 1 : -1; v.x += s * prior.shift.dx; v.y += s * prior.shift.dy; }
	const live = new Set(state.recipe.shapes.map(shape => shape.id)), ids = prior.delta ? (redo ? prior.redoSelection : prior.selection) : prior.selection;
	_rapierDrawSetSelection(state.tool === 'select' ? (ids || []).filter(id => live.has(id)) : []); _rapierDrawRenderAll();
	if (typeof _rapierPaintSyncPaper === 'function') _rapierPaintSyncPaper();
	state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error'));
	// R87g: an agent's patch is already in the document when the surface shows it. Surface-only Undo
	// then leaves the committed SVG in the file, and Done's unchanged-since-open check no-ops, so
	// the person who pressed Undo still has the agent's picture. Follow the house journal for the
	// matching document.draw — and only that operation, only when it is the next step — so one
	// Undo takes the drawing back on the glass AND in the file. If the journal cannot walk, leave
	// openSnapshot as the committed picture so Done writes this surface back (the restore still
	// happens, just later). If it walked, the surface and the file now agree: Done is a no-op.
	let journal = null;
	if (prior.agent) {
		const asset = redo ? prior.agent.after : prior.agent.before;
		if (state.editing && asset) state.editing = { ...state.editing, asset: String(asset) };
		// The exact source baseline this journal step moves to, stamped when the patch landed --
		// never the whole restored surface (DRA-01 repair item 5). The document journal has just
		// put the saved drawing back WITHOUT the person's own unwritten edit; the restored surface
		// still has it, and calling that committed is the same loss Done's no-op close was.
		// Independent unsaved human deltas stay dirty, so Done still writes them.
		const baseline = redo ? prior.agent.savedAfter : prior.agent.savedBefore;
		journal = _rapierDrawFollowAgentJournal(redo);
		if (journal) journal = Promise.resolve(journal).then(ok => {
			if (ok && state.open) state.openSnapshot = baseline || _rapierDrawHistoryRecipe();
			return ok;
		}).catch(() => false);
	}
	_rapierDrawBackupTouch();
	return journal;
}
// Walk the editor journal for the agent document.draw that this Draw history entry is the surface
// of. The next history step must be that operation, by an agent: Draw being open is itself the
// fence against any other document edit, but we still refuse to walk a different top than the one
// we stamped, so a missed stamp cannot eat a person's own typing. Returns the walk's promise, or
// null when there is no journal to follow (Node recovery harness, document profile without undo).
function _rapierDrawFollowAgentJournal(redo) {
	if (typeof rapier === 'undefined' || !rapier.undo?.branch) return null;
	const index = redo ? rapier.undo.cursor : rapier.undo.cursor - 1;
	const target = rapier.undo.branch[index];
	const tx = target?.transaction;
	if (!tx || tx.operation !== 'document.draw' || tx.actor?.kind !== 'agent') return null;
	const walk = redo ? (typeof rapierRedo === 'function' ? rapierRedo : null)
		: (typeof rapierUndo === 'function' ? rapierUndo : null);
	return walk ? walk() : null;
}
function _rapierDrawClearAll() {
	_rapierDrawCancelGesture();
	_rapierPaintFlushRevision();
	// ZA3 F2: settle before the deletion's snapshot, so Undo Clear restores even the last wet or
	// over-budget stroke. Closing the layer also revokes any automatic SET which could otherwise
	// resurrect it after the deletion Undo just restored.
	try { _rapierPaintSettleOverflow(); _rapierPaintCloseLayer(); }
	catch (error) { showToast('The painting could not be kept for Undo, so Clear was cancelled. It is still open: ' + String(error?.message || error), 'error'); return; }
	const ids = _rapierDrawGroupSelection(_rapierDrawState.recipe, _rapierDrawState.recipe.shapes.map(shape => shape.id));
	if (ids.length) _rapierDrawEditSelection({ type: 'delete' }, ids);
}
async function _rapierDrawRequestClear() {
	const state = _rapierDrawState;
	_rapierPaintFlushRevision();
	// ZA3 F2: a first stroke still live and drying, with nothing committed to the recipe yet, is
	// content too -- the base asked nothing and there was nothing to Clear once it dried.
	if (state.finishing || !state.recipe?.shapes?.length && !state.paintLayer?.surface?.bounds()) return;
	const session = state.session;
	const accepted = await rapierConfirm({
		title: 'Clear canvas?',
		message: 'Are you sure you want to clear the whole canvas?',
		confirmLabel: 'Clear',
		destructive: true,
	});
	if (accepted === true && state.open && state.session === session && !state.finishing) _rapierDrawClearAll();
}
function _rapierDrawShapeById(id) { return _rapierDrawState.recipe.shapes.find(s => s.id === id) || null; }

// ---- The agent's replay, and the nib that shows it (docs/briefs/agent-on-the-canvas.md) ---------
// An agent never draws live and never will: its contribution arrives whole, as a recipe patch, in
// one round trip. By the time Rapier has anything to show, the agent has finished. So "watching
// the agent draw" is not transmission, it is PLAYBACK of a finished thing in the order it was
// written -- the same shapes the single-frame apply already renders, spread over a few seconds.
// What the per-frame cost actually IS has not been measured (Astra R87j DRA-02). It is not one
// attribute write: the nib's markup is regenerated through innerHTML, bounding boxes are read and
// left/top written every frame, and each finished shape calls _rapierDrawRenderShapes, whose no-id
// path regenerates every visible shape and reroutes connectors. Fast forward can cross several
// steps in one frame and repeat that work. No claim of "cheaper per frame" or "never drops a
// frame" belongs here until somebody measures a fixed heavy scene on the founder's own phone.
//
// The change is committed the moment the patch lands. The replay is HOW it is shown, never a state
// the person must accept: no ghost, no preview layer, no second subsystem. The whole contribution
// is exactly ONE entry on Draw's undo stack whatever the replay does -- the snapshot is taken once
// before the first shape lands, and sealed once after the last, so one Undo takes the lot back.
// A tap anywhere on the canvas jumps to the end; the person's own pointer ends it on the spot,
// because their hand always wins.
// The one tunable: a hand lays about 200 canvas units a second (docs/briefs: a 200-unit stroke is
// about a second of a person's time), and a replay runs at five times that -- a stroke a person
// would take a second over lands in roughly a fifth of one, fast but still legible on a phone.
const RAPIER_DRAW_REPLAY_PACE = 200;
const RAPIER_DRAW_REPLAY_SPEED = 5;
// Fast forward raises the multiplier. It does NOT follow that no frame is dropped: a higher
// multiplier crosses more steps per frame, and each step completion is a shape render. Unmeasured.
const RAPIER_DRAW_REPLAY_FAST_STEP = 2, RAPIER_DRAW_REPLAY_FAST_MAX = 4;
// The nib's own pause between one shape and the next, so twenty shapes read as twenty marks.
const RAPIER_DRAW_REPLAY_SETTLE_MS = 70;
const RAPIER_DRAW_REPLAY_NAME_MAX = 32;

// The path the nib travels for one shape: the shape's own polyline wherever it has one (every
// stroke, line, arrow, arc and closed figure share this with hit-testing), and a left-to-right run
// across the middle of the box for text and for a paint layer, whose marks are not a line a hand
// walked. Returns {line, lengths, length} in canvas units, or null for a shape with no geometry.
function _rapierDrawReplayTravel(shape, recipe) {
	let points = null;
	if (shape.recognized !== 'text' && shape.recognized !== 'paint') {
		try { points = _rapierDrawShapePolyline(shape, recipe); } catch (_) { points = null; }
	}
	if (!points || points.length < 2) {
		let box = null;
		try { box = _rapierDrawShapeBBoxIn(shape, recipe); } catch (_) { box = null; }
		if (!box || !Number.isFinite(box.minX) || !Number.isFinite(box.maxX)) return null;
		const mid = (box.minY + box.maxY) / 2;
		points = [[box.minX, mid], [box.maxX, mid]];
	}
	const line = [];
	for (const point of points) if (Number.isFinite(point[0]) && Number.isFinite(point[1])) line.push([point[0], point[1]]);
	if (line.length < 2) return null;
	const lengths = [0];
	let total = 0;
	for (let i = 1; i < line.length; i++) { total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); lengths.push(total); }
	// A degenerate shape (a dot, a zero-length line) still gets a moment of its own rather than a
	// division by zero: the nib sits on it for the length of one short mark.
	return { line, lengths, length: total > 0.01 ? total : 0.01 };
}
function _rapierDrawReplayPointAt(travel, at) {
	const { line, lengths } = travel, d = Math.max(0, Math.min(travel.length, at));
	let i = 1;
	while (i < lengths.length - 1 && lengths[i] < d) i++;
	const a = line[i - 1], b = line[i], span = lengths[i] - lengths[i - 1];
	const t = span > 0 ? (d - lengths[i - 1]) / span : 1;
	const dx = b[0] - a[0], dy = b[1] - a[1], run = Math.hypot(dx, dy) || 1;
	return { x: a[0] + dx * t, y: a[1] + dy * t, dx: dx / run, dy: dy / run };
}
// The lead line: the stroke the agent wrote, as far as the nib has taken it. One `d` attribute a
// frame, in the shape's own ink and its own width, and the real shape lands on top of it the
// instant the stroke finishes -- so a pen's mark reads as being laid down, and a paint layer's
// picture arrives behind a line that showed where it was going (the founder's own answer).
function _rapierDrawReplayLeadD(travel, at) {
	const { line, lengths } = travel;
	let d = 'M' + _rapierDrawFmt(line[0][0]) + ' ' + _rapierDrawFmt(line[0][1]);
	for (let i = 1; i < line.length; i++) {
		if (lengths[i] <= at) { d += 'L' + _rapierDrawFmt(line[i][0]) + ' ' + _rapierDrawFmt(line[i][1]); continue; }
		const point = _rapierDrawReplayPointAt(travel, at);
		d += 'L' + _rapierDrawFmt(point.x) + ' ' + _rapierDrawFmt(point.y);
		return d;
	}
	return d;
}
// A nib, not a cursor and not an orb. An orb is a presence -- a being standing in the person's
// document; a cursor is a second person, pointing at their things. Neither is true: an agent is a
// hand that proposes under the person's authority, and the person's own input is a finger. So the
// honest representation is the TOOL DOING THE WORK: a mark at the exact point being drawn, the
// size of the brush laying it, carrying the colour it is putting down, with a thin contrasting
// ring so it stays visible on white paper and on a photograph. It leans along its direction of
// travel, and it exists only while the replay runs.
function _rapierDrawReplayNibMarkup(point, colour, width, paper) {
	const r = Math.max(3.5, width * 0.8 + 2.2), f = _rapierDrawFmt;
	const angle = Math.atan2(point.dy, point.dx) * 180 / Math.PI;
	const body = 'M' + f(-r * 2.1) + ' 0Q' + f(-r * 0.6) + ' ' + f(-r) + ' 0 ' + f(-r) +
		'A' + f(r) + ' ' + f(r) + ' 0 0 1 0 ' + f(r) + 'Q' + f(-r * 0.6) + ' ' + f(r) + ' ' + f(-r * 2.1) + ' 0Z';
	return '<g class="rapier-draw-nib" transform="translate(' + f(point.x) + ' ' + f(point.y) + ') rotate(' + f(angle) + ')">' +
		'<path d="' + body + '" fill="' + _rapierDrawEscapeAttr(colour) + '" stroke="' + _rapierDrawEscapeAttr(paper) + '"/>' +
		'<circle class="rapier-draw-nib-ring" r="' + f(r + 1.3) + '" stroke="' + _rapierDrawEscapeAttr(colour) + '"/></g>';
}
// The paper the nib's ring is cut against: the same ground _rapierPaintSyncPaper puts under the
// stage, so the ring separates the nib from whatever it is standing on, white paper or photograph.
function _rapierDrawReplayPaper() {
	if (_rapierDrawState.paper) return '#ffffff';
	if (_rapierDrawState.recipe?.paper === 'black') return '#000000';
	const bg = getComputedStyle(document.body).getPropertyValue('--color-bg').trim();
	return /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : '#000000';
}
// The name comes from what the door gave when the session opened, once, for the session -- never a
// per-call argument, because a name that can be set differently on every call is a costume, not a
// name. If the door gave no name the nib draws and the tag does not: never an invented one.
function _rapierDrawReplayName(given) {
	const text = typeof given === 'string' ? given.trim().replace(/\s+/g, ' ') : '';
	return text && text.length <= RAPIER_DRAW_REPLAY_NAME_MAX ? text : '';
}
// The shapes that are on the paper at this point of the replay: everything the patch left alone,
// the previous version of anything it replaces until the nib reaches it, and the shapes it added
// only once they have been drawn. Shapes that were already there are simply present.
function _rapierDrawReplayStage(replay) {
	const pending = new Map(replay.steps.slice(replay.at).map(step => [step.id, step.was]));
	const shapes = [];
	for (const shape of replay.targetShapes) {
		if (!pending.has(shape.id)) { shapes.push(shape); continue; }
		const was = pending.get(shape.id);
		if (was) shapes.push(was);
	}
	return shapes;
}
function _rapierDrawReplayRender(replay) {
	_rapierDrawState.recipe.shapes = _rapierDrawReplayStage(replay);
	_rapierDrawRenderShapes();
}
// Pure presentation, read off the replay's own current point: the nib at it, and a small pill
// beside it carrying the name the door gave and nothing else -- plain type on a plain pill, no
// tick, no badge, no logo. A name a caller supplies is not an identity check and must not look
// like one. The tag trails the nib below-right, flips to stay on screen, and dims while the stroke
// runs so it never fights the artwork.
function _rapierDrawReplayPaint(replay) {
	const state = _rapierDrawState, step = replay.steps[replay.at];
	const nib = state.replayNibEl, lead = state.replayLeadEl, tag = state.replayTagEl && state.stageEl ? state.replayTagEl : null;
	if (!nib || !lead) return;
	if (!step) { nib.innerHTML = ''; lead.setAttribute('d', ''); if (tag) tag.hidden = true; return; }
	const point = _rapierDrawReplayPointAt(step.travel, replay.into);
	lead.setAttribute('d', _rapierDrawReplayLeadD(step.travel, replay.into));
	lead.setAttribute('stroke', step.colour);
	lead.setAttribute('stroke-width', _rapierDrawFmt(step.width));
	nib.innerHTML = _rapierDrawReplayNibMarkup(point, step.colour, step.width, _rapierDrawReplayPaper());
	if (!tag) return;
	if (!replay.name) { tag.hidden = true; return; }
	const rect = state.svgRoot.getBoundingClientRect(), stage = state.stageEl.getBoundingClientRect();
	const screen = _rapierDrawMapToScreen(point.x, point.y, rect, state.svgRoot.viewBox.baseVal);
	if (tag.textContent !== replay.name) tag.textContent = replay.name;
	tag.hidden = false;
	tag.classList.toggle('rapier-draw-nib-tag--quiet', replay.into < step.travel.length);
	const size = tag.getBoundingClientRect();
	let left = screen[0] - stage.left + 13, top = screen[1] - stage.top + 13;
	if (left + size.width > stage.width - 6) left = screen[0] - stage.left - 13 - size.width;
	if (top + size.height > stage.height - 6) top = screen[1] - stage.top - 13 - size.height;
	tag.style.left = Math.max(6, left) + 'px';
	tag.style.top = Math.max(6, top) + 'px';
}
function _rapierDrawReplayControls(replay) {
	const bar = _rapierDrawState.replayBarEl;
	if (!bar) return;
	bar.hidden = !replay;
	if (replay) bar.querySelector('[data-draw-replay="faster"]')?.setAttribute('aria-disabled', String(replay.fast >= RAPIER_DRAW_REPLAY_FAST_MAX));
}
// Ends the replay and lands everything the patch left: a tap, the person's own pointer, Undo, Done,
// closing the surface and the last frame all come through here, so the finished drawing is exactly
// the same whichever of them got there first.
function _rapierDrawReplayEnd() {
	const state = _rapierDrawState, replay = state.replay;
	if (!replay) return;
	state.replay = null;
	if (replay.frame) cancelAnimationFrame(replay.frame);
	if (state.open && state.session === replay.session && state.recipe === replay.recipe) {
		state.recipe.shapes = replay.targetShapes.slice();
		_rapierDrawRenderShapes();
		_rapierDrawSealHistory(replay.entry);
	}
	if (state.replayNibEl) state.replayNibEl.innerHTML = '';
	if (state.replayLeadEl) state.replayLeadEl.setAttribute('d', '');
	if (state.replayTagEl) state.replayTagEl.hidden = true;
	_rapierDrawReplayControls(null);
	_rapierDrawBackupTouch();
}
function _rapierDrawReplayFaster() {
	const replay = _rapierDrawState.replay;
	if (!replay) return;
	replay.fast = Math.min(RAPIER_DRAW_REPLAY_FAST_MAX, replay.fast * RAPIER_DRAW_REPLAY_FAST_STEP);
	_rapierDrawReplayControls(replay);
}
function _rapierDrawReplayFrame(now) {
	const state = _rapierDrawState, replay = state.replay;
	if (!replay) return;
	replay.frame = 0;
	if (!state.open || state.session !== replay.session || state.recipe !== replay.recipe) { _rapierDrawReplayEnd(); return; }
	const dt = Math.min(0.05, Math.max(0, (now - replay.last) / 1000));
	replay.last = now;
	let travelled = RAPIER_DRAW_REPLAY_PACE * RAPIER_DRAW_REPLAY_SPEED * replay.fast * dt;
	while (travelled > 0 && replay.at < replay.steps.length) {
		const step = replay.steps[replay.at], total = step.travel.length + step.settle;
		const take = Math.min(travelled, total - replay.into);
		replay.into += take; travelled -= take;
		if (replay.into < total) break;
		replay.at++; replay.into = 0;
		_rapierDrawReplayRender(replay);
	}
	if (replay.at >= replay.steps.length) { _rapierDrawReplayEnd(); return; }
	_rapierDrawReplayPaint(replay);
	replay.frame = requestAnimationFrame(_rapierDrawReplayFrame);
}
// `raster: {kept: true}` in a replaced paint shape means "the bytes this paint id already has" --
// a marker on the wire, never pixels. agent/kernel.mjs resolves it against the recipe IT holds;
// this resolves it against the drawing on the surface, the same way, before the patch is applied.
// Without it the surface would admit a paint layer whose raster is a marker object, which is no
// raster at all, and the person's own Done would write that loss into the document.
function _rapierDrawReplayKeptRasters(patch, recipe) {
	const replace = patch.replace;
	if (!Array.isArray(replace) || !replace.some(shape => shape?.raster?.kept === true)) return patch;
	return { ...patch, replace: replace.map(shape => {
		if (!shape || shape.raster?.kept !== true) return shape;
		const original = recipe.shapes.find(row => row.id === shape.id && row.recognized === 'paint');
		return original ? { ...shape, raster: original.raster } : shape;
	}) };
}
// Astra R87j DRA-01 / DS-03, the founder's law R85b ("no path that means KEEP THIS may destroy what
// the person made"). The kernel applies the patch to the handle's SAVED bytes; the surface applies
// it to the canvas in front of the person, which may hold a finished edit of theirs that Done has
// not written yet. Those are two different drawings, and the patch is only allowed to be ONE change
// made to both of them. This is the predicate for that, over the four recipes involved: what the
// canvas held and now holds, and what the source held and now holds.
//
// A shape is "touched" when the patch changed it, on either side. For every touched id:
//   * the canvas must still hold exactly the shape the patch was written against. The person having
//     moved, restyled or deleted the agent's target -- or already using that id for a shape of
//     their own that the source has never seen -- is a human conflict, not a merge. (An id the
//     patch adds is absent from both, which compares equal: unrelated completed human work
//     elsewhere on the canvas is no conflict at all and must keep replaying fine.)
//   * the shape the patch produces must be the SAME shape in both drawings. A figure lowers
//     against whatever else is on the page, so an arrow written to bind "the box" can bind to a
//     different box on a canvas that has one more. Two drawings is the one outcome that is never
//     acceptable here.
// Untouched shapes need no comparison: neither side changed them, and the person's own additions
// are exactly the difference the surface is allowed to keep.
function _rapierDrawAgentPatchAgrees(canvasBefore, canvasAfter, sourceBefore, sourceAfter) {
	const shapesOf = recipe => new Map((recipe?.shapes || []).map(shape => [shape.id, JSON.stringify(shape)]));
	const was = shapesOf(canvasBefore), now = shapesOf(canvasAfter);
	const saved = shapesOf(sourceBefore), committed = shapesOf(sourceAfter);
	const changed = (a, b) => new Set([...a.keys(), ...b.keys()].filter(id => a.get(id) !== b.get(id)));
	const touchedSource = changed(saved, committed);
	// Only ids the source knows about can be the patch's doing. A shape that exists on the canvas
	// alone -- one of the person's own, which the source has never seen -- may well settle
	// differently once the patch is on the page (a connector of theirs re-routing around a new box
	// is the ordinary case). That is their canvas responding to a change they are watching arrive,
	// and Done writes it; it is not the patch landing somewhere it was not written for, and it must
	// never be a reason to refuse an agent's work.
	const touchedCanvas = new Set([...changed(was, now)].filter(id => saved.has(id) || committed.has(id)));
	if (touchedSource.size !== touchedCanvas.size) return false;
	for (const id of touchedSource) {
		if (!touchedCanvas.has(id)) return false;
		if (was.get(id) !== saved.get(id)) return false;
		if (now.get(id) !== committed.get(id)) return false;
	}
	return true;
}
// The one entry: an agent's shapes patch, landing on the drawing the person is looking at. The
// patch is applied through the very same _rapierDrawApplyShapesPatch and _rapierDrawAdmitRecipe the
// kernel's own document.draw edit path uses, so what the surface shows and what the document keeps
// are one computation, not two that happen to agree. Returns true when a replay started.
function _rapierDrawReplayPatch(patch, options = {}) {
	const state = _rapierDrawState;
	if (!state.open || !state.recipe || state.finishing || !patch) return false;
	// A replay already running lands in full before the next one starts: two nibs on one drawing is
	// a presence system, which is exactly what this design rules out.
	_rapierDrawReplayEnd();
	const before = state.recipe;
	const patched = _rapierDrawApplyShapesPatch(before, _rapierDrawReplayKeptRasters(patch, before));
	const target = patched && _rapierDrawAdmitRecipe(patched);
	if (!target) return false;
	// One change made to both drawings, or none made here (DRA-01). Both sides here are RECIPES,
	// never the {json} history snapshots `savedBefore`/`savedAfter` carry. A refusal leaves
	// state.recipe and openSnapshot exactly as they were, so the canvas still shows the person's
	// own work and their Done still writes it: the agent's commit is in the document and one Undo
	// away, and nothing the person made has been touched.
	if (options.sourceRecipeBefore && !_rapierDrawAgentPatchAgrees(before, target, options.sourceRecipeBefore, options.sourceRecipeAfter)) return false;
	const was = new Map(before.shapes.map(shape => [shape.id, shape]));
	// The order the agent wrote them: the patch's own order, replacements before additions exactly
	// as the patch applies them. Only what it added or changed is replayed.
	const order = [];
	for (const raw of patch.replace || []) if (typeof raw?.id === 'string') order.push(raw.id);
	for (const shape of target.shapes) if (!was.has(shape.id)) order.push(shape.id);
	const steps = [];
	for (const id of order) {
		if (steps.some(step => step.id === id)) continue;
		const shape = target.shapes.find(row => row.id === id);
		if (!shape) continue;
		const prior = was.get(id) || null;
		if (prior && JSON.stringify(prior) === JSON.stringify(shape)) continue;
		const travel = _rapierDrawReplayTravel(shape, target);
		if (!travel) continue;
		steps.push({
			id, travel, was: prior,
			colour: _rapierDrawDisplayInk(_rapierDrawShapeInk(shape)),
			width: Math.max(1, _rapierDrawStrokeHalf(shape, target) * 2),
			settle: RAPIER_DRAW_REPLAY_PACE * RAPIER_DRAW_REPLAY_SPEED * (RAPIER_DRAW_REPLAY_SETTLE_MS / 1000),
		});
	}
	// One Undo step for the whole contribution, taken before the first shape lands.
	const entry = _rapierDrawSnapshot();
	// Stamp the document.draw this surface step is the picture of, so Undo can walk the journal.
	// `after` is the reference the door will rename the picture to; before the rename lands it is
	// the same as `before`. `savedBefore`/`savedAfter` are the exact recipes the SOURCE holds on
	// either side of that transaction, so Undo and Redo can put the right source baseline back
	// rather than calling the whole restored surface committed (DRA-01, repair item 5). Both are
	// the same openSnapshot objects the surface already holds -- referenced, never copied.
	// Copied through SealHistory onto the delta.
	if (options.asset) entry.agent = { before: String(options.asset), after: String(options.reference || options.asset),
		savedBefore: options.savedBefore || null, savedAfter: options.savedAfter || null };
	state.recipe = target;
	if (!steps.length) { _rapierDrawRenderShapes(); _rapierDrawSealHistory(entry); _rapierDrawBackupTouch(); return false; }
	const replay = {
		// targetShapes is the finished drawing, held apart from state.recipe.shapes, which the
		// replay rewrites every step: they must never be the same array.
		steps, targetShapes: target.shapes.slice(), entry, recipe: target, session: state.session, at: 0, into: 0, fast: 1, frame: 0,
		last: (typeof performance === 'object' ? performance.now() : Date.now()),
		name: _rapierDrawReplayName(options.name),
	};
	state.replay = replay;
	_rapierDrawReplayRender(replay);
	_rapierDrawReplayControls(replay);
	_rapierDrawReplayPaint(replay);
	replay.frame = requestAnimationFrame(_rapierDrawReplayFrame);
	return true;
}
// The one fact both the door's fence and the replay ask: which drawing, if any, the person has
// open in Draw at this instant -- the reference the picture is known by, or '' when Draw is shut or
// holds a brand-new drawing that is not in the document yet. One owner, so the fence can never open
// on an edit the hand-off would then refuse to show (agent/browser.js's drawFence).
//
// A transaction of the person's own -- a mark under the finger, a label being typed, a setting
// being dragged -- answers '' as well, so an agent's patch cannot land in the middle of one. Their
// hand wins, and the door refuses rather than committing something the surface would not take (the
// same category as the backup's own "cancelled transactions must not become the recovery").
function _rapierDrawEditingAsset() {
	const state = _rapierDrawState;
	if (!state.open || !state.editing || state.finishing) return '';
	if (state.gesture || state.textEdit || state.settingEdit || state.paintLayer?.pendingCommit) return '';
	// The surface is not ready to take a patch until it knows what the SOURCE holds. openSnapshot
	// is taken a frame after the canvas opens (_rapierDrawOpenSurface's own measurement frame), and
	// until it exists there is no baseline to apply the agent's patch to and nothing to prove the
	// two drawings agree -- so this is one more "the picture is still being prepared", exactly like
	// a mark under the finger. The door's fence and the hand-off read the same predicate, so the
	// fence refuses draw_session_open for that frame rather than admitting a commit the surface
	// would then have to refuse to show (Astra R87j DRA-01).
	if (!state.openSnapshot) return '';
	return String(state.editing.asset || '');
}
// The door's own hand-off: Draw takes an agent's patch only when it is open on that same drawing.
// A patch for a picture the person is not looking at is simply not a replay -- the document keeps
// it either way, and the edit is theirs to open.
function _rapierDrawAgentPatch(patch, options = {}) {
	const asset = String(options.asset || ''), open = _rapierDrawEditingAsset();
	if (!asset || !open || asset !== open) return false;
	const state = _rapierDrawState;
	// DRA-01. openSnapshot is the recipe the SOURCE holds for this drawing -- set from the document's
	// own original when the surface opened, and advanced only by a committed source transaction.
	// That is exactly the baseline the kernel just patched (held.recipeJSON), so running the same
	// patch through the same two functions on it gives what the source holds NOW, without a second
	// read and without ever calling the live canvas committed.
	const savedBefore = state.openSnapshot;
	let sourceRecipeBefore = null, sourceRecipeAfter = null;
	try {
		sourceRecipeBefore = savedBefore ? _rapierDrawRestoreRecipe(savedBefore) : null;
		const patchedSource = sourceRecipeBefore && _rapierDrawApplyShapesPatch(sourceRecipeBefore, _rapierDrawReplayKeptRasters(patch, sourceRecipeBefore));
		sourceRecipeAfter = patchedSource ? _rapierDrawAdmitRecipe(patchedSource) : null;
	} catch (_) { sourceRecipeAfter = null; }
	// No usable source baseline means nothing here can prove the two drawings agree, and the old
	// behaviour -- declare the live canvas committed -- is the R85b defect itself. Refuse the
	// hand-off: the change is in the document, Done still writes what the person can see.
	if (!sourceRecipeAfter) return false;
	const savedAfter = _rapierDrawHistoryRecipe(sourceRecipeAfter);
	const before = state.recipe;
	const replayed = _rapierDrawReplayPatch(patch, {...options, sourceRecipeBefore, sourceRecipeAfter, savedBefore, savedAfter});
	// ReplayPatch returns false both when it did not apply and when it applied with no animation.
	// The recipe identity is the tell: an applied patch replaces state.recipe, or starts a replay
	// whose recipe is the target. A failed admission must not rewrite openSnapshot, or Done would
	// no-op over work the person already made.
	const committed = state.replay?.recipe;
	if (!committed && state.recipe === before) return replayed;
	if (options.reference) state.editing = { ...state.editing, asset: String(options.reference) };
	// The source's recipe, never the surface's. On a canvas the person has not touched since Done
	// these are the same drawing and Done stays the no-op it should be; on a canvas holding a
	// finished edit of theirs they differ by exactly that edit, so Done writes it instead of
	// concluding there was nothing to write and closing over it.
	state.openSnapshot = savedAfter;
	return replayed;
}

const RAPIER_DRAW_COPY_OFFSET = 24;
function _rapierDrawNextId() {
	const state = _rapierDrawState; let id;
	do { if (!Number.isSafeInteger(state.seq + 1)) state.seq = 0; id = 's' + (++state.seq); } while (state.recipe.shapes.some(shape => shape.id === id || shape.group === id));
	return id;
}
// D07: a fresh, small random-appearance seed minted once for every newly created shape, distinct
// from its id -- copy/duplicate keeps this value verbatim (draw/edit.mjs's clone-based duplicate
// already carries any field it does not explicitly touch) while the id itself gets reminted for
// identity, so a duplicated sketch, stipple, sphere or wood grain keeps its original's exact
// texture. Cosmetic only (which dot lands where inside a hachure or a wood-grain ring), so
// Math.random needs no determinism guarantee beyond "stable once minted."
function _rapierDrawMintSeed() { return Math.floor(Math.random() * 0x100000000); }
function _rapierDrawCopyShapes(shapes, dx = RAPIER_DRAW_COPY_OFFSET, dy = RAPIER_DRAW_COPY_OFFSET) {
	const state = _rapierDrawState, result = _rapierDrawEdit(state.recipe, shapes.map(shape => shape.id), { type: 'duplicate', dx, dy, newIds: shapes.map(() => _rapierDrawNextId()) });
	state.recipe = result.recipe; return result.ids.map(id => _rapierDrawShapeById(id));
}
function _rapierDrawEditSelection(action, ids = _rapierDrawSelection()) {
	_rapierPaintFlushRevision();
	const state = _rapierDrawState;
	// Every command the person issues from the chrome lands the agent's replay first -- one step on
	// the stack for the contribution, then their own on top of it, never interleaved.
	if (state.replay) _rapierDrawReplayEnd();
	try {
		if (action.type === 'duplicate') action.newIds = _rapierDrawSelectedShapes().map(() => _rapierDrawNextId());
		const result = _rapierDrawEdit(state.recipe, ids, action);
		if (!result.changed) return;
		_rapierDrawSnapshot(); state.recipe = result.recipe; _rapierDrawSetSelection(result.ids); _rapierDrawRenderAll(); _rapierDrawSealHistory();
	} catch (error) { showToast(String(error.message || error), 'error'); }
}

function _rapierDrawCloseLabelInput() {
	const state = _rapierDrawState, edit = state.textEdit;
	state.textEdit = null; state.labelInput = null;
	edit?.panel.remove();
}
function _rapierDrawFinishText(cancel = false) {
	const state = _rapierDrawState, edit = state.textEdit;
	if (!edit) return true;
	if (edit.composing) { edit.pending = cancel ? 'cancel' : 'commit'; if (cancel) edit.afterFinish = null; return false; }
	const live = state.open && state.session === edit.session && _rapierDrawShapeById(edit.id);
	if (!live) { _rapierDrawCloseLabelInput(); return true; }
	if (!cancel && !live.label?.trim()) {
		try {
			const recipe = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe()), shape = recipe.shapes.find(shape => shape.id === edit.id);
			delete shape.label;
			if (shape.recognized === 'text') recipe.shapes = recipe.shapes.filter(item => item.id !== shape.id);
			else globalThis.RapierDrawEdit._rapierDrawFitText(shape, recipe);
			_rapierDrawRerouteBoundArrows(recipe); _rapierDrawSceneMarkup(recipe, false, true); state.recipe = recipe;
		} catch (error) { showToast(String(error.message || error), 'error'); return false; }
	}
	_rapierDrawCloseLabelInput();
	if (cancel) { state.recipe = _rapierDrawRestoreRecipe(edit.before); _rapierDrawSetSelection(edit.selection); }
	else { _rapierDrawSetSelection(_rapierDrawSelection()); if (!_rapierDrawSameRecipe(edit.before)) { _rapierDrawSnapshot(edit.before); _rapierDrawSealHistory(); } }
	_rapierDrawRenderAll(); state.surface.focus({ preventScroll: true });
	if (!cancel) edit.afterFinish?.();
	return true;
}
// Per-glyph caret lookup for a tapped point: inverse-rotates into the shape's own local frame,
// picks the nearest line by vertical top, then the nearest caret boundary layoutText already
// computed in text.mjs (line.carets) -- never a hand-rolled measurement of its own.
function _rapierDrawOffsetForPoint(layout, x, y) {
	const local = layout.rotation ? _rapierDrawRotatePt(layout.origin.x, layout.origin.y, x, y, -layout.rotation) : [x, y];
	const lines = layout.lines || [];
	if (!lines.length) return 0;
	let line = lines[0];
	for (const candidate of lines) if (local[1] >= candidate.y - layout.baseline) line = candidate;
	const carets = line.carets && line.carets.length ? line.carets : [{ offset: line.start, x: 0 }];
	let offset = carets[0].offset, best = Infinity;
	for (const c of carets) { const d = Math.abs(local[0] - (line.x + c.x)); if (d < best) { best = d; offset = c.offset; } }
	return offset;
}
// The per-character advance layoutText's own planner assigned a real monospace line (uniform for
// every cluster in that family, tabs and spaces included -- see text.mjs fallbackAdvance), read
// straight back out of the caret table above rather than re-deriving the .6em constant here.
function _rapierDrawMonoAdvance(layout) {
	for (const line of layout.lines || []) { const c = line.carets; if (c && c.length > 2) return c[1].x - c[0].x; }
	return null;
}
// Measures the real browser advance of the textarea's own monospace font at the exact CSS size in
// play, via an offscreen probe -- never a private closure's idea of the font, only what a real
// span of that font-family/size actually renders at.
function _rapierDrawMeasureAdvance(family, fontPx, weight, style) {
	const probe = document.createElement('span');
	probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;white-space:pre;letter-spacing:0;font-family:' + family + ';font-size:' + fontPx + 'px;font-weight:' + weight + ';font-style:' + style;
	probe.textContent = '0'.repeat(20);
	document.body.appendChild(probe);
	const w = probe.getBoundingClientRect().width / 20;
	probe.remove();
	return w;
}
// Sizes and positions the textarea to the exact lines layoutText (the same portable planner the
// SVG writer uses) reports -- same font, size, line height, letter spacing, alignment, padding and
// rotation -- so the person types on top of the glyphs they will keep instead of a browser-chosen
// approximation. `W` (the wrap limit the planner used, wider than the tight drawn box whenever the
// shape/frame has slack) anchored at whichever edge the resolved alignment pins to the tight box's
// own matching edge reproduces layoutText's two-level alignment (frame-level box placement, then
// per-line alignment within that box) exactly, without special-casing align in CSS. A sub-16px CSS
// font-size invites Safari's auto-zoom-on-focus, so below that floor the textarea renders at 16px
// and is scaled back down with a compensating CSS transform (origin 0,0, matching the untransformed
// box's own top-left) rather than shrinking the requested size -- purely a paint-time correction,
// so it never moves where a character actually measures relative to the box.
function _rapierDrawPlaceTextInput() {
	const state = _rapierDrawState, edit = state.textEdit, shape = edit && _rapierDrawShapeById(edit.id);
	if (!shape) return;
	const input = edit.input, layout = _rapierDrawTextLayout(shape, state.recipe);
	const svgRect = state.svgRoot.getBoundingClientRect(), vb = state.svgRoot.viewBox.baseVal;
	const scale = _rapierDrawViewTransform(svgRect, vb).scale;
	const mapLocal = (lx, ly) => _rapierDrawMapToScreen(lx, ly, svgRect, vb);
	const b = layout.box, W = layout.wrapWidth || b.w;
	const boxLeft = layout.align === 'end' ? b.maxX - W : layout.align === 'middle' ? (b.minX + b.maxX) / 2 - W / 2 : b.minX;
	const [screenLeft, screenTop] = mapLocal(boxLeft, b.minY), [originX, originY] = mapLocal(layout.origin.x, layout.origin.y);
	const widthPx = Math.max(1, W * scale), heightPx = Math.max(1, layout.height * scale);
	const box = edit.box;
	box.style.left = screenLeft + 'px'; box.style.top = screenTop + 'px';
	box.style.width = widthPx + 'px'; box.style.height = heightPx + 'px';
	box.style.transformOrigin = (originX - screenLeft) + 'px ' + (originY - screenTop) + 'px';
	box.style.transform = layout.rotation ? 'rotate(' + (layout.rotation * 180 / Math.PI) + 'deg)' : 'none';

	const trueFontPx = layout.fontSize * scale, FLOOR = 16;
	const innerScale = trueFontPx > 0 && trueFontPx < FLOOR ? trueFontPx / FLOOR : 1;
	const cssFontPx = innerScale < 1 ? FLOOR : trueFontPx;
	input.style.fontSize = cssFontPx + 'px';
	input.style.lineHeight = (layout.lineHeight * scale / innerScale) + 'px';
	input.style.width = (widthPx / innerScale) + 'px'; input.style.height = (heightPx / innerScale) + 'px';
	input.style.transform = innerScale < 1 ? 'scale(' + innerScale + ')' : 'none';
	// A letter set's capitals are paths under the textarea; its caret follows the serif the set's other characters take.
	input.style.fontFamily = globalThis.RapierDrawFonts.fontFamily(/^letters:/.test(shape.textFont) ? 'serif' : shape.textFont || 'sans', state.recipe.fonts);
	input.style.fontWeight = shape.textBold ? '700' : '400'; input.style.fontStyle = shape.textItalic ? 'italic' : 'normal';
	// The type choices the planner measured, so the caret stands where the drawn glyphs do.
	input.style.textTransform = shape.textCase === 'upper' ? 'uppercase' : shape.textCase === 'lower' ? 'lowercase' : 'none';
	input.style.fontVariantCaps = shape.textCase === 'small' ? 'small-caps' : 'normal';
	input.style.fontKerning = shape.textKern === false ? 'none' : 'auto';
	input.style.fontVariantNumeric = { oldstyle: 'oldstyle-nums', lining: 'lining-nums', tabular: 'tabular-nums' }[shape.textFigures] || 'normal';
	input.style.wordSpacing = (shape.wordSpacing || 0) * layout.fontSize * scale / innerScale + 'px';
	input.style.textAlign = layout.align === 'middle' ? 'center' : layout.align;
	input.wrap = layout.wrapWidth ? 'soft' : 'off';
	// A real monospace font's per-character advance is uniform, so one letter-spacing correction
	// (target minus measured-natural) reproduces the planner's own uniform .6em advance exactly at
	// every offset; a proportional font has no single constant that does the same per glyph, so it
	// keeps ordinary 0 letter-spacing and whatever residual the real font vs. the planner's generic
	// advance table leaves (documented in draw-text-rules.md, not hidden here).
	const perChar = shape.textFont === 'mono' ? _rapierDrawMonoAdvance(layout) : null;
	const trackingPx = (shape.letterSpacing || 0) * layout.fontSize * scale / innerScale;
	input.style.letterSpacing = (perChar == null ? trackingPx : (perChar * scale / innerScale) - _rapierDrawMeasureAdvance(input.style.fontFamily, cssFontPx, input.style.fontWeight, input.style.fontStyle)) + 'px';

	const bounds = layout.bounds, viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
	const right = left + (viewport?.width || innerWidth), bottom = top + (viewport?.height || innerHeight);
	const a = mapLocal(bounds.minX, bounds.minY), z = mapLocal(bounds.maxX, bounds.maxY);
	const controls = edit.controls, controlsWidth = Math.min(360, Math.max(80, right - left - 16));
	controls.style.width = controlsWidth + 'px';
	const controlsHeight = controls.offsetHeight || 96, below = bottom - 8 - z[1] >= controlsHeight;
	const controlsTop = below ? z[1] + 6 : Math.max(top + 8, a[1] - controlsHeight - 6);
	controls.style.left = _rapierDrawClamp(a[0], left + 8, Math.max(left + 8, right - controlsWidth - 8)) + 'px';
	controls.style.top = _rapierDrawClamp(controlsTop, top + 8, Math.max(top + 8, bottom - controlsHeight - 8)) + 'px';
}
function _rapierDrawEditLabelInPlace(shape, options = {}) {
	const state = _rapierDrawState;
	if (!state.surface || shape.locked || !_rapierDrawFinishText()) return;
	const before = options.before || _rapierDrawHistoryRecipe(), selection = options.selection || _rapierDrawSelection();
	if (!shape.label && !['text', 'line', 'arrow', 'arc', 'ink'].includes(shape.recognized)) shape.labelIn = true;
	// Structure: `root` is a full-viewport, pointer-events:none frame so it never intercepts drawing-
	// surface touches of its own; `box` is the exact glyph-aligned overlay (rotated, sized and
	// positioned by _rapierDrawPlaceTextInput above) holding only the textarea; `controls` is one
	// Controls sit apart from the glyph box: alignment/actions above size, so even a one-character
	// label can be edited without packing every control into its own tight width.
	const root = document.createElement('div'), box = document.createElement('div'), input = document.createElement('textarea');
	const controls = document.createElement('div'), styleRow = document.createElement('div'), actions = document.createElement('div'), sizeRow = document.createElement('div');
	root.className = 'rapier-draw-text-editor'; box.className = 'rapier-draw-text-box'; input.className = 'rapier-draw-label-input';
	controls.className = 'rapier-draw-text-controls'; styleRow.className = 'rapier-draw-text-style'; actions.className = 'rapier-draw-text-actions'; sizeRow.className = 'rapier-draw-text-size-row';
	input.value = options.initial ?? shape.label ?? ''; input.spellcheck = true;
	input.setAttribute('aria-label', shape.recognized === 'text' ? 'Drawing text' : 'Shape label');
	actions.innerHTML = '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-text-cancel aria-label="cancel">' + RAPIER_DRAW_ICONS.close + '</button>' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--go" data-text-done aria-label="set text">' + RAPIER_DRAW_ICONS.check + '</button>';
	box.append(input); controls.append(styleRow, sizeRow); root.append(box, controls); state.surface.append(root);
	const edit = state.textEdit = { id: shape.id, session: state.session, before, selection, panel: root, box, input, controls, composing: false };
	state.labelInput = input; _rapierDrawSetSelection([shape.id]); state.menu.hidden = true;
	// Shared by typing and by a live style change (Size/Align below): builds a candidate recipe,
	// lets `mutate` change the one field that differs, then runs the exact same fit/reroute/render
	// pipeline either way -- so "font size/alignment changes re-plan the textarea live" is the same
	// code path as "typing re-plans the textarea live", not a second one that can drift from it.
	const applyChange = mutate => {
		if (state.textEdit !== edit || state.session !== edit.session) return false;
		const live = _rapierDrawShapeById(edit.id); if (!live) return false;
		try {
			const candidate = { ...state.recipe, shapes: state.recipe.shapes.map(item => item === live || item.bind ? JSON.parse(JSON.stringify(item)) : item), strokes: state.recipe.strokes.map(stroke => ({ ...stroke })) };
			const changed = candidate.shapes.find(item => item.id === edit.id), old = _rapierDrawTextLayout(live, state.recipe);
			mutate(changed);
			if (changed.recognized === 'text') {
				const next = _rapierDrawTextLayout({ ...changed, geom: { ...changed.geom, cx: 0, cy: 0 } }, candidate), a = changed.geom.rot || 0;
				const dx = (next.width - old.width) * (changed.labelAlign === 'end' ? -.5 : changed.labelAlign === 'middle' ? 0 : .5), dy = (next.height - old.height) / 2;
				changed.geom.cx += dx * Math.cos(a) - dy * Math.sin(a); changed.geom.cy += dx * Math.sin(a) + dy * Math.cos(a);
			} else globalThis.RapierDrawEdit._rapierDrawFitText(changed, candidate);
			_rapierDrawRerouteBoundArrows(candidate);
			const markup = _rapierDrawDisplayMarkup(_rapierDrawSceneMarkup(candidate, false, true));
			state.svg.innerHTML = markup;
			state.recipe = candidate;
			return true;
		} catch (error) { showToast(String(error.message || error), 'error'); return false; }
	};
	const renderStyleRow = () => {
		const live = _rapierDrawShapeById(edit.id); if (!live) return;
		const isText = live.recognized === 'text';
		const size = live.textSize || (isText ? 24 : 14);
		const align = live.labelAlign || (isText ? 'start' : 'middle');
		// R85c: the size while typing is the same seek slider as everywhere else in Draw, with its
		// number beside it; the size lands on release (a change), the word moves with the finger.
		styleRow.innerHTML = [['start', 'align-left', 'Left'], ['middle', 'align-center', 'Centre'], ['end', 'align-right', 'Right']].map(([id, icon, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-text-align="' + id + '" aria-label="' + word + '" aria-pressed="' + (align === id) + '">' + RAPIER_DRAW_ICONS[icon] + '</button>').join('');
		styleRow.append(actions);
		sizeRow.innerHTML = '<input class="rapier-draw-text-size" type="range" data-text-size min="' + RAPIER_DRAW_TEXT_SIZE_MIN + '" max="' + Math.max(RAPIER_DRAW_TEXT_SIZE_MAX, Math.ceil(size)) + '" step="1" value="' + size + '" aria-label="Text size"><output class="rapier-draw-nib-word" data-text-size-word>' + Math.round(size) + '</output>';
		_rapierDrawSeekWrap(sizeRow.querySelector('[data-text-size]'));
	};
	const applyStyle = (key, value) => {
		const ok = applyChange(changed => { changed[key] = value; });
		if (ok) _rapierDrawPlaceTextInput();
		renderStyleRow();
	};
	const update = () => {
		if (state.textEdit !== edit || state.session !== edit.session || edit.composing) return;
		const live = _rapierDrawShapeById(edit.id); if (!live) return;
		if (input.value.length > RAPIER_DRAW_LABEL_MAX || /[\ud800-\udfff\ufffe\uffff]/u.test(input.value)) {
			input.value = live.label || '';
			const caret = edit.caret || [input.value.length, input.value.length, 'none'];
			input.setSelectionRange(Math.min(caret[0], input.value.length), Math.min(caret[1], input.value.length), caret[2]);
			showToast('Text is limited to ' + RAPIER_DRAW_LABEL_MAX + ' characters', 'error');
			return;
		}
		if (applyChange(changed => { changed.label = input.value; })) {
			edit.caret = [input.selectionStart, input.selectionEnd, input.selectionDirection];
			_rapierDrawMarkSelection(); _rapierDrawPlaceTextInput();
		} else {
			input.value = live.label || '';
			const caret = edit.caret || [input.value.length, input.value.length, 'none'];
			input.setSelectionRange(Math.min(caret[0], input.value.length), Math.min(caret[1], input.value.length), caret[2]);
		}
	};
	root.addEventListener('pointerdown', evt => evt.stopPropagation());
	input.addEventListener('beforeinput', evt => {
		if (!edit.composing) edit.caret = [input.selectionStart, input.selectionEnd, input.selectionDirection];
		if (!evt.isComposing && typeof evt.data === 'string' && input.value.length - input.selectionEnd + input.selectionStart + evt.data.length > RAPIER_DRAW_LABEL_MAX) {
			evt.preventDefault(); showToast('Text is limited to ' + RAPIER_DRAW_LABEL_MAX + ' characters', 'error');
		}
	});
	input.addEventListener('paste', evt => {
		const value = evt.clipboardData?.getData('text/plain');
		if (typeof value === 'string' && input.value.length - input.selectionEnd + input.selectionStart + value.length > RAPIER_DRAW_LABEL_MAX) {
			evt.preventDefault(); showToast('Text is limited to ' + RAPIER_DRAW_LABEL_MAX + ' characters', 'error');
		}
	});
	input.addEventListener('input', update);
	input.addEventListener('compositionstart', () => { edit.caret = [input.selectionStart, input.selectionEnd, input.selectionDirection]; edit.composing = true; });
	input.addEventListener('compositionend', () => { if (state.textEdit !== edit || state.session !== edit.session) return; edit.composing = false; update(); if (edit.pending) _rapierDrawFinishText(edit.pending === 'cancel'); });
	input.addEventListener('keydown', evt => {
		evt.stopPropagation(); if (evt.isComposing || edit.composing || evt.keyCode === 229) return;
		// Escape leaves the words as Back and a tap away do (R85b); only the named Cancel puts them back.
		if (evt.key === 'Escape' || evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) { evt.preventDefault(); _rapierDrawFinishText(); }
		else if (evt.key === 'Tab') {
			evt.preventDefault();
			const value = input.value, start = input.selectionStart, end = input.selectionEnd;
			if (start === end && !evt.shiftKey) input.setRangeText('\t', start, end, 'end');
			else {
				const first = start ? value.lastIndexOf('\n', start - 1) + 1 : 0;
				const last = end > start && value[end - 1] === '\n' ? end - 1 : value.indexOf('\n', end);
				const stop = last < 0 ? value.length : last, changes = []; let at = first;
				for (const line of value.slice(first, stop).split('\n')) {
					const remove = evt.shiftKey ? (line[0] === '\t' ? 1 : /^ {1,4}/.exec(line)?.[0].length || 0) : 0;
					changes.push({ at, remove, insert: evt.shiftKey ? '' : '\t' }); at += line.length + 1;
				}
				let next = value;
				for (const change of changes.slice().reverse()) next = next.slice(0, change.at) + change.insert + next.slice(change.at + change.remove);
				const mapped = offset => offset + changes.reduce((sum, change) => sum + (change.at <= offset ? change.insert.length - Math.min(change.remove, offset - change.at) : 0), 0);
				input.setRangeText(next, 0, value.length, 'preserve'); input.setSelectionRange(mapped(start), mapped(end));
			}
			update();
		}
	});
	controls.addEventListener('pointerdown', () => { edit.actionPress = true; }, true);
	for (const event of ['pointerup', 'pointercancel']) controls.addEventListener(event, () => { queueMicrotask(() => { edit.actionPress = false; }); });
	input.addEventListener('blur', evt => { if (state.textEdit === edit && !edit.actionPress && !root.contains(evt.relatedTarget)) _rapierDrawFinishText(); });
	_rapierDrawBindTap(controls, evt => {
		if (state.textEdit !== edit) return;
		if (evt.target.closest('[data-text-cancel],[data-text-done]')) { _rapierDrawFinishText(!!evt.target.closest('[data-text-cancel]')); return; }
		const alignBtn = evt.target.closest('[data-text-align]');
		if (alignBtn) applyStyle('labelAlign', alignBtn.dataset.textAlign);
	});
	sizeRow.addEventListener('change', evt => { if (evt.target.matches('[data-text-size]')) applyStyle('textSize', Number(evt.target.value)); });
	sizeRow.addEventListener('input', evt => { if (evt.target.matches('[data-text-size]')) { const out = sizeRow.querySelector('[data-text-size-word]'); if (out) out.textContent = String(Math.round(Number(evt.target.value))); } });
	renderStyleRow(); update();
	if (options.at) {
		const offset = _rapierDrawClamp(_rapierDrawOffsetForPoint(_rapierDrawTextLayout(shape, state.recipe), options.at[0], options.at[1]), 0, input.value.length);
		input.setSelectionRange(offset, offset);
	} else if (options.initial == null) input.select();
	else input.setSelectionRange(input.value.length, input.value.length);
	_rapierDrawPlaceTextInput(); input.focus({ preventScroll: true });
}
function _rapierDrawCreateText(a, b = a, initial = '') {
	if (typeof initial !== 'string' || initial.length > RAPIER_DRAW_LABEL_MAX || /[\ud800-\udfff\ufffe\uffff]/u.test(initial)) { showToast('Drawing text must contain complete characters and at most ' + RAPIER_DRAW_LABEL_MAX + ' characters', 'error'); return; }
	const state = _rapierDrawState, before = _rapierDrawHistoryRecipe(), selection = _rapierDrawSelection(), textStyle = _rapierDrawTextDefaults();
	const scale = _rapierDrawViewTransform(state.svgRoot.getBoundingClientRect(), state.svgRoot.viewBox.baseVal).scale;
	const fixed = Math.abs(b[0] - a[0]) * scale > RAPIER_DRAW_MOVE_THRESHOLD_PX;
	const shape = { id: _rapierDrawNextId(), recognized: 'text', stroke: null, brush: 'ink', asDrawn: false,
		geom: { cx: fixed ? (a[0] + b[0]) / 2 : a[0], cy: a[1] }, labelAlign: textStyle.labelAlign, textSize: textStyle.textSize, label: '' };
	if (textStyle.textFont !== 'sans') shape.textFont = textStyle.textFont;
	if (textStyle.lineHeight !== 1.25) shape.lineHeight = textStyle.lineHeight;
	if (textStyle.letterSpacing) shape.letterSpacing = textStyle.letterSpacing;
	if (textStyle.wordSpacing) shape.wordSpacing = textStyle.wordSpacing;
	for (const key of ['textBold', 'textItalic', 'textUnderline']) if (textStyle[key]) shape[key] = true;
	if (!textStyle.textKern) shape.textKern = false;
	for (const key of ['textCase', 'textEffect']) if (textStyle[key]) shape[key] = textStyle[key];
	if (shape.textEffect === 'garden') _rapierDrawPlantGarden(shape, textStyle);
	if (fixed) shape.geom.w = Math.max(24, Math.abs(b[0] - a[0]));
	if (state.ink) shape.ink = state.ink;
	let base = state.recipe;
	if (textStyle.textFont && !['sans', 'serif', 'mono'].includes(textStyle.textFont) && !_rapierDrawLetterFont(textStyle.textFont) && !base.fonts?.some(font => font.id === textStyle.textFont)) {
		const draft = _rapierDrawAvailableFonts().find(font => font.id === textStyle.textFont);
		if (!draft) { showToast('That custom font is no longer available', 'error'); return; }
		try { base = { ...base, fonts: globalThis.RapierDrawFonts.admitFonts([...(base.fonts || []), draft]) }; }
		catch (error) { showToast(String(error.message || error), 'error'); return; }
	}
	if (textStyle.textFigures && _rapierDrawFontFigures(shape.textFont || 'sans', base.fonts).includes(textStyle.textFigures)) shape.textFigures = textStyle.textFigures;
	try {
		const empty = _rapierDrawTextLayout({ ...shape, geom: { ...shape.geom, cx: 0, cy: 0 } }, base);
		shape.label = initial;
		const filled = _rapierDrawTextLayout({ ...shape, geom: { ...shape.geom, cx: 0, cy: 0 } }, base);
		shape.geom.cx += fixed ? (filled.width - empty.width) / 2 : filled.width / 2;
		shape.geom.cy += (filled.height - empty.height) / 2;
		_rapierDrawTextLayout(shape, base);
	} catch (error) { showToast(String(error.message || error), 'error'); return; }
	const candidate = _rapierDrawAdmitCreation({ ...base, shapes: base.shapes.concat([shape]) });
	if (!candidate) return;
	state.recipe = candidate;
	state.textFontDrafts?.delete(textStyle.textFont);
	state.tool = 'select'; state.pen = false; _rapierDrawUpdatePenBtn(); _rapierDrawUpdateShapeRow();
	_rapierDrawEditLabelInPlace(shape, { before, selection, initial });
}
function _rapierDrawFontFacesClear() {
	const state = _rapierDrawState;
	for (const entry of state.fontFaces?.values() || []) document.fonts.delete(entry.face);
	state.fontFaces = new Map(); state.fontLoads = new Map(); state.textFontDrafts = new Map(); state.fontUploadTarget = null; state.fontReady = null; state.fontUpload = (state.fontUpload || 0) + 1;
}
function _rapierDrawAvailableFonts() {
	const state = _rapierDrawState, out = new Map();
	for (const font of _rapierPersonal.fonts()) out.set(font.id, font);
	for (const font of state.recipe?.fonts || []) out.set(font.id, font);
	for (const font of state.textFontDrafts?.values() || []) if (!out.has(font.id)) out.set(font.id, font);
	return [...out.values()];
}
function _rapierDrawSyncFonts() {
	const state = _rapierDrawState, used = new Set((state.recipe?.shapes || []).map(shape => shape.textFont));
	const next = state.textDefaults?.textFont;
	if (next && next !== 'sans' && next !== 'serif' && next !== 'mono') used.add(next);
	const wanted = new Map(_rapierDrawAvailableFonts().filter(font => used.has(font.id)).map(font => [font.id, font]));
	state.fontFaces ||= new Map(); state.fontLoads ||= new Map();
	for (const [id, entry] of state.fontFaces) if (wanted.get(id)?.data !== entry.font.data) { document.fonts.delete(entry.face); state.fontFaces.delete(id); }
	for (const [id, entry] of state.fontLoads) if (wanted.get(id)?.data !== entry.font.data) state.fontLoads.delete(id);
	return [...wanted.values()];
}
async function _rapierDrawLoadFonts(recipe, session) {
	const state = _rapierDrawState, fonts = globalThis.RapierDrawFonts;
	if (!state.open || state.session !== session) return;
	await Promise.all(_rapierDrawSyncFonts().map(font => {
		if (state.fontFaces.get(font.id)?.font.data === font.data) return;
		const prior = state.fontLoads.get(font.id);
		if (prior?.font.data === font.data) return prior.promise;
		const entry = {font}, current = () => state.open && state.session === session && state.fontLoads.get(font.id) === entry &&
			_rapierDrawSyncFonts().some(item => item.id === font.id && item.data === font.data);
		entry.promise = Promise.resolve().then(() => new FontFace(fonts.fontFaceFamily(font), 'url(' + fonts.fontDataURL(font) + ')').load()).then(face => {
			if (!current()) return;
			document.fonts.add(face); state.fontFaces.set(font.id, {font, face});
		}, error => { if (current()) throw error; }).finally(() => { if (state.fontLoads.get(font.id) === entry) state.fontLoads.delete(font.id); });
		state.fontLoads.set(font.id, entry);
		return entry.promise;
	}));
}
async function _rapierDrawUploadFont(file, target = 'selection') {
	const state = _rapierDrawState, session = state.session, id = state.menuShapeId, original = target === 'selection' ? _rapierDrawShapeById(id) : null;
	if (!file || target === 'selection' && (!original || original.locked) || file.size > 2097152) { if (file?.size > 2097152) showToast('Font must be 2 MiB or smaller', 'error'); return; }
	const baseline = original && JSON.stringify(original), fonts = globalThis.RapierDrawFonts, upload = state.fontUpload = (state.fontUpload || 0) + 1;
	try {
		const font = fonts.importFont(new Uint8Array(await file.arrayBuffer()));
		const face = state.fontFaces.get(font.id)?.font.data === font.data ? state.fontFaces.get(font.id).face : await new FontFace(fonts.fontFaceFamily(font), 'url(' + fonts.fontDataURL(font) + ')').load();
		if (!state.open || state.session !== session || state.fontUpload !== upload || state.finishing || state.textEdit) return;
		const saved = state.recipe.fonts || [], drafts = [...(state.textFontDrafts?.values() || [])], existing = saved.find(item => item.id === font.id) || drafts.find(item => item.id === font.id);
		if (existing && existing.data !== font.data) throw new Error('The new font conflicts with a font already in the drawing. Choose a different font.');
		const admitted = fonts.admitFonts([font]);
		const admittedFont = admitted.find(item => item.id === font.id) || existing || font;
		await _rapierPersonal.addFont(admittedFont);
		if (!state.open || state.session !== session || state.fontUpload !== upload || state.finishing || state.textEdit) return;
		if (target === 'default') {
			state.textFontDrafts ||= new Map();
			if (!saved.some(item => item.id === font.id)) state.textFontDrafts.set(font.id, admittedFont);
			_rapierDrawTextDefaults().textFont = font.id;
			if (!state.fontFaces.has(font.id)) { document.fonts.add(face); state.fontFaces.set(font.id, {font: admittedFont, face}); }
			_rapierDrawSyncTextPanels();
			return;
		}
		const live = _rapierDrawShapeById(id);
		if (!live || JSON.stringify(live) !== baseline) return;
		const recipeFonts = fonts.admitFonts(existing && saved.some(item => item.id === font.id) ? saved : saved.concat(admittedFont));
		if (!_rapierDrawCommand(() => { state.recipe.fonts = recipeFonts; const shape = _rapierDrawShapeById(id); shape.textFont = font.id; globalThis.RapierDrawEdit._rapierDrawFitText(shape, state.recipe); })) return;
		state.textFontDrafts?.delete(font.id);
		if (!state.fontFaces.has(font.id)) { document.fonts.add(face); state.fontFaces.set(font.id, {font: admittedFont, face}); }
		_rapierDrawRenderAll();
	} catch (error) { if (state.open && state.session === session && state.fontUpload === upload) showToast(String(error.message || error), 'error'); }
}

const RAPIER_DRAW_TOOLS = ['select', 'brush', 'pen', 'paint', 'shape', 'text', 'erase', 'effects'];
const RAPIER_DRAW_TOOL_MENU = ['brush', 'paint', 'erase', 'shape', 'text', 'image', 'select', 'pen', 'effects'];
// The current tool anchors the head's left edge. The menu carries the full vocabulary;
// only Raster Brush is shortened in the head because the founder deliberately asked for RASTER.
const RAPIER_DRAW_TOOL_WORDS = { select: 'Select', brush: 'SVG Brush', pen: 'SVG Pen (Testing)', paint: 'Raster Brush', shape: 'Shape', text: 'Text', erase: 'Eraser', image: 'Image', effects: 'Effects (Testing)' };
const RAPIER_DRAW_TOOL_SHORT = { select: 'Select', brush: 'SVG Brush', pen: 'SVG Pen', paint: 'Raster', shape: 'Shape', text: 'Text', erase: 'Eraser', effects: 'Effects' };
// The empty canvas says what the tool in hand will actually do. A new drawing opens in SVG Brush, a new
// drawing in a note on Notes' own last tool, and a drawing opened again on the tool it was last
// edited with (_rapierDrawOpenSurface), so each tool keeps its own words: "Tap to paint" / "Try blending
// colours" -- R86g law 8's words -- belong to Paint alone, since a vector tool's first stroke lays no
// paint to blend.
const RAPIER_DRAW_HINT_WORDS = {
	effects: ['Choose Copy machine to add an effect', ''],
	select: ['Tap a shape to select it', ''],
	brush: ['Tap to draw', 'Pressure and speed shape the stroke'],
	pen: ['Tap to draw', 'A clean line of one width'],
	paint: ['Tap to paint', 'Try blending colours'],
	shape: ['Drag out a shape', ''],
	text: ['Tap to write', ''],
	erase: ['Draw through anything to cut it', ''],
};
// Feather icons (Tabler where Feather has none, a few drawn in the same 24px/2px stroke language),
// the editor's own bar vocabulary. Draw's compact controls pair these familiar marks with short
// names where the founder's new surface calls for them; aria-labels keep the richer explanation.
const RAPIER_DRAW_ICON_WRAP = (body, extra = '') => '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + extra + '>' + body + '</svg>';
// One glyph, one definition (docs/intent.md "The afternoon list", law 3; the founder, 25 September
// 2026: "where we have identical icons, we should only have one copy of the SVG ... We should never
// have the icons drifting if they are the same thing"). A mark the editor already draws is read from
// the editor when Draw paints -- its own element in editor/ui.html (a selector), its command table
// (editor/engine.js _RAPIER_COMMAND_ICONS, `command:`) or the Will's (`will:`) -- and one Notes draws
// and Draw shares is read from Notes' table (`notes:`), each set in Draw's own 24px frame. Never a copy
// here: tools/check-icon-copies.mjs refuses one. Read lazily, so nothing is asked of a page not built.
function _rapierDrawSourceGlyphBody(source) {
	try {
		if (source.startsWith('command:')) return _RAPIER_COMMAND_ICONS[source.slice(8)] || '';
		if (source.startsWith('will:')) return (/<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(_RAPIER_WILL_LAW_GLYPH[source.slice(5)] || '') || [])[1] || '';
		if (source.startsWith('notes:')) return RAPIER_NOTES_ICONS[source.slice(6)].map(d => '<path d="' + d + '"></path>').join('');
		return document.querySelector(source)?.querySelector('svg')?.innerHTML || '';
	} catch (_) { return ''; }
}
function _rapierDrawSourceGlyph(source, extra = '') { return RAPIER_DRAW_ICON_WRAP(_rapierDrawSourceGlyphBody(source), extra); }
const RAPIER_DRAW_ICONS = {
	// The garden: a rose at the head of a stem with a leaf, the sample's stand-in where it cannot be drawn.
	garden: RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="7" r="4"/><path d="M10 7a2 2 0 1 1 3 1.5M12 11v10M12 16c-3 0-5-1.5-5-4 3 0 5 1.500 5 4zM12 18c3 0 5-1.500 5-4-3 0-5 1.500-5 4z"/>'),
	none: RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="8"/><path d="m6 18 12-12"/>'),
	// The pipette every drawing app draws: a barrel held at the working angle with a drop at its tip.
	dropper: RAPIER_DRAW_ICON_WRAP('<path d="M14.5 3.5a2.8 2.8 0 0 1 4 4l-2.2 2.2 1 1-1.8 1.8-1-1L7 19h-4v-4l7.5-7.5-1-1L11.3 4.7l1 1z"></path>'),
	get check() { return _rapierDrawSourceGlyph('command:check'); },
	get close() { return _rapierDrawSourceGlyph('#btn-embed-close'); },
	get chevron() { return _rapierDrawSourceGlyph('#settings-open-chevron'); },
	get clear() { return _rapierDrawSourceGlyph('notes:trash'); },
	// The canvas is a paper's frame (the founder, 29 September: a perfect square with square corners, a fifth bigger
	// than the rounded one, and inside it a smaller square a frame's gap in, its stroke marginally thinner); the
	// control fills both with the current paper colour.
	canvas: RAPIER_DRAW_ICON_WRAP('<rect x="1.2" y="1.2" width="21.6" height="21.6"></rect><rect x="5.6" y="5.6" width="12.8" height="12.8"></rect>'),
	select: RAPIER_DRAW_ICON_WRAP('<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3.2 2.6"></rect>'),
	// The brush is the editor's own DRAW button's (the floating toolbar); Paint's is that brush with its drops.
	get brush() { return _rapierDrawSourceGlyph('[data-command="insert.draw"]'); },
	get pen() { return _rapierDrawSourceGlyph('command:highlight'); },
	get paint() { return RAPIER_DRAW_ICON_WRAP(_rapierDrawSourceGlyphBody('[data-command="insert.draw"]') + '<circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none"></circle><circle cx="13.5" cy="20.5" r="1.4" fill="currentColor" stroke="none"></circle>'); },
	shape: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="11" height="11" rx="1"></rect><circle cx="16.5" cy="16.5" r="4.5"></circle>'),
	get text() { return _rapierDrawSourceGlyph('command:type'); },
	erase: RAPIER_DRAW_ICON_WRAP('<path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3"></path><path d="M18 13.3l-6.3 -6.3"></path>'),
	get image() { return _rapierDrawSourceGlyph('command:image'); },
	// settings row and menu
	width: RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="5.5" x2="20" y2="5.5" stroke-width="1.2"></line><line x1="4" y1="11.5" x2="20" y2="11.5" stroke-width="2.6"></line><line x1="4" y1="18.5" x2="20" y2="18.5" stroke-width="4.4"></line>'),
	smooth: RAPIER_DRAW_ICON_WRAP('<path d="M2 12c3-8 7-8 10 0s7 8 10 0"></path>'),
	sliders: RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>'),
	get type() { return _rapierDrawSourceGlyph('command:type'); },
	get copy() { return _rapierDrawSourceGlyph('notes:copy'); },
	get trash() { return _rapierDrawSourceGlyph('notes:trash'); },
	bigger: RAPIER_DRAW_ICON_WRAP('<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>'),
	smaller: RAPIER_DRAW_ICON_WRAP('<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>'),
	get turn() { return RAPIER_DRAW_ICON_WRAP(globalThis.RapierImageFlow.rotateGlyph); },
	get lock() { return _rapierDrawSourceGlyph('will:keep'); },
	unlock: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'),
	get bold() { return _rapierDrawSourceGlyph('command:bold'); },
	get italic() { return _rapierDrawSourceGlyph('command:italic'); },
	get underline() { return _rapierDrawSourceGlyph('command:underline'); },
	get 'align-left'() { return _rapierDrawSourceGlyph('command:align-left'); },
	get 'align-center'() { return _rapierDrawSourceGlyph('command:align-center'); },
	get 'align-right'() { return _rapierDrawSourceGlyph('command:align-right'); },
	'valign-top': RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="4" x2="20" y2="4"></line><rect x="9" y="8" width="6" height="12" rx="1"></rect>'),
	'valign-middle': RAPIER_DRAW_ICON_WRAP('<line x1="3" y1="12" x2="8" y2="12"></line><line x1="16" y1="12" x2="21" y2="12"></line><rect x="9" y="6" width="6" height="12" rx="1"></rect>'),
	'valign-bottom': RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="20" x2="20" y2="20"></line><rect x="9" y="4" width="6" height="12" rx="1"></rect>'),
	'label-in': RAPIER_DRAW_ICON_WRAP('<rect x="3" y="4" width="18" height="16" rx="1"></rect><path d="M9 9h6M12 9v6"></path>'),
	'label-out': RAPIER_DRAW_ICON_WRAP('<rect x="4" y="3" width="16" height="9" rx="1"></rect><path d="M8 17h8M12 17v4"></path>'),
	wrap: RAPIER_DRAW_ICON_WRAP('<path d="M4 6h16"></path><path d="M4 18h5"></path><path d="M4 12h13a3 3 0 0 1 0 6h-4l2-2m0 4l-2-2"></path>'),
	upload: RAPIER_DRAW_ICON_WRAP('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>'),
	// A big T beside a small one: size. An italic A over its baseline: the family.
	get 'text-size'() { return _rapierDrawSourceGlyph('#fmt-btn-text-style'); },
	typography: RAPIER_DRAW_ICON_WRAP('<path d="M4 20h3"></path><path d="M14 20h7"></path><path d="M6.9 15h6.9"></path><path d="M10.2 6.3l5.8 13.7"></path><path d="M5 20l6-16h2l7 16"></path>'),
	download: RAPIER_DRAW_ICON_WRAP('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'),
	get repeat() { return _rapierDrawSourceGlyph('#btn-replace-toggle'); },
	magnet: RAPIER_DRAW_ICON_WRAP('<path d="M4 13v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a2 2 0 0 0 6 0v-8a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v8a8 8 0 0 1 -16 0"></path><line x1="4" y1="8" x2="9" y2="8"></line><line x1="15" y1="8" x2="20" y2="8"></line>'),
	proportions: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="5" width="18" height="14" rx="1"></rect><path d="M7 12v-3h3"></path><path d="M17 12v3h-3"></path>'),
	center: RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="1.5" fill="currentColor"></circle><path d="M4 8v-2a2 2 0 0 1 2 -2h2"></path><path d="M4 16v2a2 2 0 0 0 2 2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v2"></path><path d="M16 20h2a2 2 0 0 0 2 -2v-2"></path>'),
	angle: RAPIER_DRAW_ICON_WRAP('<path d="M21 19H3l9-15"></path><path d="M13.5 19a9 9 0 0 0-3.2-6.4"></path>'),
	ruler: RAPIER_DRAW_ICON_WRAP('<path d="M17 3l4 4l-14 14l-4 -4z"></path><path d="M16 7l-1.5 -1.5"></path><path d="M13 10l-1.5 -1.5"></path><path d="M10 13l-1.5 -1.5"></path><path d="M7 16l-1.5 -1.5"></path>'),
	'flip-x': RAPIER_DRAW_ICON_WRAP('<path d="M3 12h18"></path><path d="M7 16h10l-10 5z"></path><path d="M7 8h10l-10 -5z"></path>'),
	'flip-y': RAPIER_DRAW_ICON_WRAP('<path d="M12 3v18"></path><path d="M16 7v10l5 0z"></path><path d="M8 7v10l-5 0z"></path>'),
	front: RAPIER_DRAW_ICON_WRAP('<path d="M12 10v10"></path><path d="M12 10l4 4"></path><path d="M12 10l-4 4"></path><path d="M4 4h16"></path>'),
	get forward() { return _rapierDrawSourceGlyph('#compare-prev'); },
	get backward() { return _rapierDrawSourceGlyph('#compare-next'); },
	back: RAPIER_DRAW_ICON_WRAP('<path d="M12 14v-10"></path><path d="M12 14l4 -4"></path><path d="M12 14l-4 -4"></path><path d="M4 20h16"></path>'),
	group: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="11" height="11" rx="1"></rect><rect x="10" y="10" width="11" height="11" rx="1"></rect>'),
	ungroup: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="13" width="8" height="8" rx="1"></rect><path d="M11 11l2 2" stroke-dasharray="1.5 1.5"></path>'),
	'space-x': RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="4" x2="4" y2="20"></line><line x1="20" y1="4" x2="20" y2="20"></line><rect x="9" y="8" width="6" height="8" rx="1"></rect>'),
	// The pressed letter's own mark: a P struck into a plate. Kerning: an A and a V drawn into each other.
	pressed: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"></path>'),
	effects: RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
	kerning: RAPIER_DRAW_ICON_WRAP('<path d="M2.5 19l4.5-14h1.5L13 19"></path><path d="M4.6 13.5h6.3"></path><path d="M10.5 5l4.5 14h1.5L21 5"></path>'),
	'space-y': RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="4" x2="20" y2="4"></line><line x1="4" y1="20" x2="20" y2="20"></line><rect x="8" y="9" width="8" height="6" rx="1"></rect>'),
};
const RAPIER_DRAW_TOOL_SAYS = {
	select: 'Select tool: tap a shape to choose it, drag empty space to choose several.',
	brush: 'Brush: pressure and speed shape the stroke; a circle or box you draw can become a clean shape with one tap.',
	pen: 'SVG Pen (Testing): a clean line of one width, with a smoothing control.',
	paint: 'Paint: MyPaint brushes on a paint layer inside the drawing; pressure, speed and direction shape the stroke.',
	shape: 'Shape tool: drag out the shape you picked.',
	text: 'Text tool: tap for growing text, or drag to set its wrapping width.',
	erase: 'Eraser: draw through anything to cut it into pieces.',
	image: 'Image: choose one or more pictures to place on the canvas.',
	effects: 'Effects: copy machine treatments for the drawing, selected objects or a paint layer.',
};
const RAPIER_DRAW_TOOL_SETTINGS = Object.freeze({
	// Select keeps Colour and Width (R75): a width set with a shape selected acts on that shape, and the
	// next stroke's colour is where the eye looks for it; Options carries the selection's transforms.
	select: ['ink', 'nib', 'options'],
	brush: ['ink', 'nib'],
	pen: ['ink', 'nib', 'smooth'],
	// R86e, the founder: "add and save should move into the brush category as the last options, that
	// makes total sense and would declutter the draw interface which is always our goal." They are the
	// last two cells of the Brushes strip now (draw/paint-tool.js _rapierPaintUpdateStrip). Law 15 (25
	// September 2026): "brushes should come first on the left ... keep width as the second one, and
	// actually keep paint as the third one, and then color should be the middle one, the fourth option.
	// And then tools, set and the chevron." Each list is its row, in order (_rapierDrawUpdatePenBtn).
	paint: ['paintBrushes', 'nib', 'dip', 'ink', 'paintTools', 'paintSet'],
	shape: ['ink', 'nib', 'kinds', 'options'],
	text: ['ink', 'textSize', 'textFont', 'textSpacing', 'textStyle', 'textAlign'],
	erase: ['nib', 'eraseEdge'],
	effects: ['copyMachine'],
});
function _rapierDrawSetToolMenu(open) {
	const state = _rapierDrawState, menu = state.surface?.querySelector('.rapier-draw-tool-menu'), trigger = state.surface?.querySelector('[data-draw-act="toolMenu"]');
	if (!menu || !trigger) return;
	// A choice closes the menu under the focus: it goes back to the trigger, not to the page behind Draw.
	const inside = !open && menu.contains(document.activeElement);
	state.toolMenuOpen = !!open;
	menu.hidden = !state.toolMenuOpen;
	if (inside) trigger.focus({ preventScroll: true });
	trigger.setAttribute('aria-expanded', String(state.toolMenuOpen));

	// R85b: the per-shape menu is a FIXED overlay above the whole surface (z 901) and the chooser
	// hangs off the head inside it (z 8), so with a shape selected the menu sat on top of the tool
	// list and ate the taps for whichever tools it covered -- the person tapped TEXT and stayed on
	// Select (found by `export-styled-roundtrip`, which could then never reach the text editor).
	// Choosing a tool is a deliberate act that drops the selection anyway: the menu stands down
	// while the chooser is up, and _rapierDrawUpdateMenu puts it back the moment it closes.
	if (state.menu) {
		if (state.toolMenuOpen) state.menu.hidden = true;
		else _rapierDrawUpdateMenu();
	}
}
function _rapierDrawCloseSettingPanels(except = '') {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface) return;
	for (const panel of surface.querySelectorAll('[data-draw-panel]')) {
		const keep = panel.dataset.drawPanel === except;
		// R85: the brush strip forgets its scroll while hidden (display:none drops it); keep it so
		// the strip comes back where the person left it (_rapierPaintUpdateStrip gives it back).
		if (!keep && panel.classList.contains('rapier-draw-brushes')) _rapierPaintKeepScroll(panel);
		if (!keep) panel.hidden = true;
	}
	for (const btn of surface.querySelectorAll('.rapier-draw-settings [aria-expanded]')) {
		if (btn.dataset.drawAct !== except) btn.setAttribute('aria-expanded', 'false');
	}
	if (except !== 'ink') state.colourOpen = false;
	if (except !== 'kinds') state.kindsOpen = false;
	if (except !== 'paintBrushes' && except !== 'paintTools') state.paintPicker = null;
	if (except !== 'dip') _rapierPaintDipSyncButton?.();
}
function _rapierDrawSetSettingsCollapsed(collapsed) {
	const state = _rapierDrawState, settings = state.surface?.querySelector('.rapier-draw-settings');
	if (!settings) return;
	const btn = settings.querySelector('[data-draw-act="settingsCollapse"]');
	// The fold moves nothing (docs/paint-tools.md, "Draw's moments"): the row floats over the stage, which is the
	// viewport and never resizes for it (rapier-draw.css .rapier-draw-stage), so the drawing stays exactly where it
	// was; only the chevron crosses to its other edge, a FLIP of transform alone -- one layout on the tap.
	const place = () => btn?.getBoundingClientRect().left ?? 0;
	const before = !!collapsed !== !!state.settingsCollapsed && state.open && !_rapierDrawStill() ? place() : null;
	state.settingsCollapsed = !!collapsed;
	settings.classList.toggle('rapier-draw-settings--collapsed', state.settingsCollapsed);
	if (before !== null) {
		const turn = state.settingsCollapsed ? [0, 180] : [180, 0];
		_rapierDrawPlay(btn, 'foldChevron', Math.round(before - place()), turn[0], turn[1]);
	}
	btn?.setAttribute('aria-label', state.settingsCollapsed ? 'Show tool controls' : 'Hide tool controls');
	btn?.setAttribute('aria-expanded', String(!state.settingsCollapsed));
	if (state.settingsCollapsed) _rapierDrawCloseSettingPanels();
}
function _rapierDrawUpdateContextOptions() {
	const surface = _rapierDrawState.surface, tool = _rapierDrawTool();
	if (!surface) return;
	const allowed = tool === 'shape' ? new Set(['snap', 'repeat', 'proportions', 'center'])
		: tool === 'select' ? new Set(['snap', 'proportions', 'center', 'unlockAll']) : new Set();
	for (const button of surface.querySelectorAll('.rapier-draw-options [data-draw-act]')) button.hidden = !allowed.has(button.dataset.drawAct);
}
function _rapierDrawUpdatePenBtn() {
	const surface = _rapierDrawState.surface;
	const tool = _rapierDrawTool();
	if (surface) {
		for (const name of RAPIER_DRAW_TOOLS) {
			const btn = surface.querySelector('[data-draw-tool="' + name + '"]');
			if (!btn) continue;
			btn.setAttribute('aria-pressed', name === tool ? 'true' : 'false');
			btn.setAttribute('aria-checked', String(name === tool));
			btn.innerHTML = RAPIER_DRAW_ICONS[name] + '<span>' + RAPIER_DRAW_TOOL_WORDS[name] + '</span>';
			btn.setAttribute('aria-label', RAPIER_DRAW_TOOL_SAYS[name]);
		}
		const trigger = surface.querySelector('[data-draw-act="toolMenu"]');
		if (trigger && trigger.dataset.drawShown !== tool) {
			// A new tool rises into the box; the box drawn at open, or again for the same tool, stands still.
			const changed = !!trigger.dataset.drawShown;
			trigger.dataset.drawShown = tool;
			trigger.innerHTML = RAPIER_DRAW_ICONS[tool] + '<span>' + RAPIER_DRAW_TOOL_SHORT[tool] + '</span>';
			trigger.setAttribute('aria-label', 'Current tool: ' + RAPIER_DRAW_TOOL_WORDS[tool] + '. Choose tool.');
			if (changed) { _rapierDrawPlay(trigger.firstElementChild, 'rise'); _rapierDrawPlay(trigger.lastElementChild, 'riseWord'); }
		}
	}
	const canvas = surface && surface.querySelector('.rapier-draw-canvas');
	if (canvas) {
		canvas.setAttribute('role', 'img');
		canvas.setAttribute('aria-label', 'Draw canvas, ' + (RAPIER_DRAW_TOOL_WORDS[tool] || tool) + ' tool');
	}

	if (_rapierDrawState.live) {
		_rapierDrawState.live.classList.toggle('rapier-draw-live--pen', tool === 'brush');
	}
	// One fixed-width, non-scrolling row per tool. Only controls that can affect the active tool are
	// admitted here; generic transform switches do not leak into Brush/Pen/Paint where they read as
	// nonsense. A separate chevron owns collapsing the entire row.
	if (surface) {
		const visible = new Set(RAPIER_DRAW_TOOL_SETTINGS[tool] || []);
		for (const btn of surface.querySelectorAll('.rapier-draw-settings [data-draw-setting]')) btn.hidden = !visible.has(btn.dataset.drawSetting);
		const row = surface.querySelector('.rapier-draw-settings'), controls = row?.querySelector('.rapier-draw-settings-controls');
		for (const name of RAPIER_DRAW_TOOL_SETTINGS[tool] || []) { const btn = controls?.querySelector('[data-draw-setting="' + name + '"]'); if (btn) controls.appendChild(btn); }
		row?.style.setProperty('--draw-settings-count', String(Math.max(1, visible.size)));
		// Law 15 (the founder: "There's seven icons in that row. If they were evenly spaced, then it should be
		// that the middle icon is dead center with that top tool icon"): in the Raster row the chevron's cell is
		// one of seven even columns, so the fourth, COLOUR, stands under the tool. Every other row keeps its
		// chevron anchored at the right edge as R85 drew it.
		row?.classList.toggle('rapier-draw-settings--even', tool === 'paint');
		_rapierDrawUpdateContextOptions();
		_rapierPaintUpdateStrip();
		for (const panel of surface.querySelectorAll('[data-draw-panel]')) {
			if (!visible.has(panel.dataset.drawPanel)) panel.hidden = true;
		}
		_rapierDrawState.live.classList.toggle('rapier-draw-live--erase', tool === 'erase');
		_rapierPaintSyncPaper();
	}
}
function _rapierDrawTool() {
	const t = _rapierDrawState.tool;
	return RAPIER_DRAW_TOOLS.indexOf(t) >= 0 ? t : (_rapierDrawState.pen ? 'pen' : 'brush');
}
// The founder (R85): "the default colour when a user opens RASTER BRUSH mode is their own selected
// accent colour. black is ugly and doesn't show off our brushes." Until a colour is chosen the ink
// follows the tool -- the accent under Raster Brush, the paper's own ink everywhere else, because
// the vector tools' default is the black-ink SVG every other viewer expects; a chosen colour stays
// put across tools. The accent is read from the page, so it is whatever the person set in Settings.
function _rapierDrawAccentInk() {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
	return /^#[\da-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}
function _rapierDrawFollowToolInk(name) {
	const state = _rapierDrawState;
	if (!state.inkChosen) state.ink = name === 'paint' ? _rapierDrawAccentInk() : null;
}
function _rapierDrawSetHint() {
	const el = _rapierDrawState.hintEl;
	if (!el) return;
	const [first, second] = RAPIER_DRAW_HINT_WORDS[_rapierDrawState.tool] || RAPIER_DRAW_HINT_WORDS.brush;
	el.textContent = first;
	if (!second) return;
	const sub = document.createElement('span');
	sub.className = 'rapier-draw-hint-sub';
	sub.textContent = second;
	el.append(sub);
}
async function _rapierDrawSetTool(name) {
	if (!RAPIER_DRAW_TOOLS.includes(name)) return;
	if (!_rapierDrawFinishText()) return;
	const state = _rapierDrawState, session = state.session, pending = _rapierPaintPendingStroke();
	if (pending) { await pending; if (!state.open || state.session !== session) return; }
	_rapierDrawCancelGesture();
	// The settlement law (Astra-R75 P02, R85b): a tool change never drops a live layer still holding
	// pixels the working budget refused -- it keeps them, the same as Done does.
	try { _rapierPaintSettleOverflow(); _rapierPaintCloseLayer(); }
	catch (error) { showToast('The painting could not be kept. The tool was not changed: ' + String(error?.message || error), 'error'); return; }
	if (name === 'effects') _rapierDrawEffectsEnter();
	else if (state.tool === 'effects') { state.effectsCompare = false; _rapierDrawEffectsCompare(); }
	_rapierDrawState.tool = name;
	_rapierDrawState.pen = name === 'pen';
	// Select owns object manipulation. Paint keeps its chosen layer separately in paintChosenId.
	_rapierDrawSetSelection([]); _rapierDrawMarkSelection(); _rapierDrawUpdateMenu();
	if (state.notes && RAPIER_DRAW_NOTES_TOOLS.includes(name)) _rapierDrawRemember('notesTool', name);
	_rapierDrawSetHint();
	_rapierDrawFollowToolInk(name);
	_rapierDrawSetToolMenu(false);
	_rapierDrawSetSettingsCollapsed(false);
	_rapierDrawCloseSettingPanels();
	_rapierDrawEndMarquee();
	_rapierDrawUpdatePenBtn();
	_rapierDrawUpdateShapeRow();
	_rapierDrawUpdateInkBtn();
	if (name === 'effects') _rapierDrawEffectsSync();
}

const RAPIER_DRAW_ERASE_MIN_LEN = 4;

function _rapierDrawEraseRadius() {
	return Math.max(4, _rapierDrawNibLevel(_rapierDrawState.nib) * 0.9);
}

function _rapierDrawSegmentEraseIntervals(a, b, path, radius) {
	const intervals = [], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
	const add = (lo, hi) => { lo = Math.max(0, lo); hi = Math.min(1, hi); if (hi >= lo) intervals.push([lo, hi]); };
	const disc = c => {
		const x = a[0] - c[0], y = a[1] - c[1];
		if (!length2) { if (x * x + y * y <= radius * radius) add(0, 1); return; }
		const dot = x * dx + y * dy, d = dot * dot - length2 * (x * x + y * y - radius * radius);
		if (d >= 0) { const root = Math.sqrt(d); add((-dot - root) / length2, (-dot + root) / length2); }
	};
	for (let i = 0; i < path.length; i++) {
		const p = path[i]; disc(p);
		if (!i) continue;
		const q = path[i - 1], ex = p[0] - q[0], ey = p[1] - q[1], span = Math.hypot(ex, ey);
		if (!span) continue;
		const ux = ex / span, uy = ey / span, x = a[0] - q[0], y = a[1] - q[1];
		let lo = 0, hi = 1;
		for (const [start, delta, min, max] of [[x * ux + y * uy, dx * ux + dy * uy, 0, span], [-x * uy + y * ux, -dx * uy + dy * ux, -radius, radius]]) {
			if (Math.abs(delta) < 1e-12) { if (start < min || start > max) { lo = 1; hi = 0; break; } }
			else { const t0 = (min - start) / delta, t1 = (max - start) / delta; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
		}
		add(lo, hi);
	}
	return _rapierDrawMergeRuns([intervals], 1e-9) || [];
}

function _rapierDrawEraseRuns(pts, path, radius) {
	const runs = [];
	let run = [], touched = false;
	const flush = () => { if (run.length > 1 && _rapierDrawPerimeter(run, false) >= RAPIER_DRAW_ERASE_MIN_LEN) runs.push(run); run = []; };
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i], cuts = _rapierDrawSegmentEraseIntervals(a, b, path, radius);
		let at = 0;
		for (const [lo, hi] of cuts.concat([[1, 1]])) {
			if (lo > at + 1e-9) {
				const p = _rapierDrawInterpolatePoint(a, b, at), q = _rapierDrawInterpolatePoint(a, b, lo);
				if (!run.length) run.push(p);
				run.push(q);
			}
			if (hi > lo || lo < 1) { touched = true; flush(); }
			at = Math.max(at, hi);
		}
	}
	flush();
	if (!touched) return null;
	if (runs.length > 1 && _rapierDrawDist(pts[0], pts[pts.length - 1]) < .01 && _rapierDrawDist(runs[0][0], runs.at(-1).at(-1)) < .01) {
		const last = runs.pop(); runs[0] = last.concat(runs[0].slice(1));
	}
	return runs;
}

function _rapierDrawEraseIsFilledFace(shape) {
	// A paint layer is pixels on paper: a filled face, never a contour to cut (its PNG would go with
	// the frame). Its own eraser brush is the way to take paint away.
	if (shape.recognized === 'paint') return true;
	if (['sphere', 'wheel', 'pulley', 'wood', 'knot', 'lens'].includes(shape.brush)) return true;
	if (shape.style === 'solid' && !['line', 'arrow', 'ink'].includes(shape.recognized) && !shape.asDrawn) return true;
	return false;
}

function _rapierDrawEraseWith(path) {
	const state = _rapierDrawState, recipe = state.recipe;
	if (!recipe || !path?.length) return false;
	try {
		const next = [], strokes = [], pathBox = _rapierDrawBBox(path), lockedGroups = new Set(recipe.shapes.filter(shape => shape.locked && shape.group).map(shape => shape.group));
		let cut = false, work = 0, refused = false;
		const budget = points => {
			work += points * path.length;
			if (work > 4194304) throw Object.assign(new RangeError('Erase a smaller part of this drawing at a time'), { code: 'drawing_work_limit' });
		};
		const touches = (poly, radius) => {
			budget(poly.length);
			return path.some(point => _rapierDrawPointInPolygon(point, poly)) || poly.some((a, i) => _rapierDrawSegmentEraseIntervals(a, poly[(i + 1) % poly.length], path, radius).length);
		};
		// D05: a fragment keeps every appearance fact its own rendering needs, not just brush/ink/nib --
		// dash (so a cut piece of a dashed line stays dashed: the render-time solver re-fits N dashes
		// to whatever length this exact fragment turns out to be, the same way it already does for an
		// uncut shape, so nothing more than carrying the flag forward is needed) and seed (D07: so a
		// cut sketch/hatched/rope-spring fragment keeps the same random texture its source already
		// wore at that point, rather than rolling a fresh one from its own brand-new id).
		// D01: a fragment's own width is resolved once here, at cut time, from its SOURCE's effective
		// appearance (the same one owner core.mjs's renderer reads, _rapierDrawEffectiveWidth) --
		// never the render-time fallback's own literal, which would otherwise thin a cut piece of an
		// actual ink mark down to the Shape-tool default the instant it lost its `.geom`.
		const linePiece = (run, source, width = _rapierDrawEffectiveWidth(source), brush = source.brush) => {
			brush = _rapierDrawBrushesFor('ink').includes(brush) ? brush : 'ink';
			const piece = { id: _rapierDrawNextId(), stroke: recipe.strokes.length + strokes.length, recognized: 'ink', asDrawn: true, brush, style: null, geom: null, smooth: 0, nib: _rapierDrawShapeNib(source, recipe) };
			if (brush === 'ink') { piece.cut = true; if (width !== RAPIER_DRAW_INK_WIDTH) piece.cutWidth = width; }
			if (source.ink) piece.ink = source.ink;
			if (source.dash) piece.dash = source.dash;
			if (source.seed != null) piece.seed = source.seed;
			if (source.opacity != null) piece.opacity = source.opacity;
			if (brush === 'ink') piece.smooth = source.smooth ?? recipe.smooth;
			strokes.push({ pts: run }); next.push(piece);
		};
		const headPiece = (head, source) => {
			if (head.kind === 'arrow') { linePiece(head.poly, source, 2, 'ink'); return; }
			const recognized = head.circle ? 'circle' : head.poly.length === 3 ? 'triangle' : 'rect';
			const piece = { id: _rapierDrawNextId(), stroke: null, recognized, asDrawn: false, brush: 'ink', style: 'solid', geom: head.circle ? { ...head.circle } : { p: head.poly.map(p => p.slice()) } };
			if (source.ink) piece.ink = source.ink;
			if (source.seed != null) piece.seed = source.seed;
			if (source.opacity != null) piece.opacity = source.opacity;
			next.push(piece);
		};
		const labelPiece = (source, radius) => {
			if (!source.label) return;
			const old = _rapierDrawTextLayout(source, recipe);
			if (touches(old.polygon, radius)) return;
			const align = ['arrow', 'line'].includes(source.recognized) ? 'middle' : source.labelAlign || 'middle';
			const piece = { id: _rapierDrawNextId(), stroke: null, recognized: 'text', asDrawn: false, brush: 'ink', style: null, label: source.label, labelAlign: align, textSize: source.textSize ?? 14,
				geom: { cx: 0, cy: 0, w: old.wrapWidth || old.width } };
			for (const key of ['textFont', 'textBold', 'textItalic', 'textUnderline', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textCase', 'textKern', 'textFigures', 'textEffect', 'textEffectSeed', 'effectFlower', 'effectStem', 'ink', 'opacity']) if (source[key] != null) piece[key] = source[key];
			if (old.wrapWidth >= 6) piece.labelWidth = old.wrapWidth;
			const text = _rapierDrawTextLayout(piece, recipe);
			if (text.lines.length !== old.lines.length || text.lines.some((line, i) => line.text !== old.lines[i].text || Math.abs(line.width - old.lines[i].width) > 1e-7) || Math.abs(text.height - old.height) > 1e-7) throw Object.assign(new RangeError('This label cannot be separated without changing its layout'), { code: 'drawing_geometry_limit' });
			const factor = align === 'start' ? 0 : align === 'end' ? 1 : .5;
			const x = old.box.minX + old.width * factor + text.width * (.5 - factor), y = old.box.minY + text.height / 2;
			[piece.geom.cx, piece.geom.cy] = _rapierDrawRotatePt(old.origin.x, old.origin.y, x, y, old.rotation);
			if (old.rotation) piece.geom.rot = old.rotation;
			next.push(piece);
		};
		for (const shape of recipe.shapes) {
			if (shape.locked || lockedGroups.has(shape.group)) { next.push(shape); continue; }
			const parts = !_rapierDrawShapePaintsInk(shape, recipe) && ['arrow', 'line'].includes(shape.recognized) ? _rapierDrawArrowParts(shape, recipe) : null;
			const radius = _rapierDrawEraseRadius() + _rapierDrawStrokeHalf(shape, recipe), box = _rapierDrawShapeBBoxIn(shape, recipe);
			if (parts) for (const head of [parts.headStart, parts.headEnd]) if (head) {
				const b = head.circle ? { minX: head.circle.cx - head.circle.r, minY: head.circle.cy - head.circle.r, maxX: head.circle.cx + head.circle.r, maxY: head.circle.cy + head.circle.r } : _rapierDrawBBox(head.poly);
				box.minX = Math.min(box.minX, b.minX); box.minY = Math.min(box.minY, b.minY); box.maxX = Math.max(box.maxX, b.maxX); box.maxY = Math.max(box.maxY, b.maxY);
			}
			if (box.maxX < pathBox.minX - radius || box.minX > pathBox.maxX + radius || box.maxY < pathBox.minY - radius || box.minY > pathBox.maxY + radius) { next.push(shape); continue; }
			if (shape.recognized === 'text') {
				if (touches(_rapierDrawTextLayout(shape, recipe).polygon, radius)) cut = true; else next.push(shape);
				continue;
			}
			if (_rapierDrawEraseIsFilledFace(shape)) {
				const poly = _rapierDrawShapePolygon(shape, recipe);
				if (poly && poly.length ? touches(poly, radius) : true) refused = true;
				next.push(shape);
				continue;
			}
			const contours = parts?.contours || _rapierDrawShapeContours(shape, recipe);
			budget(contours.reduce((sum, line) => sum + line.length, 0));
			const cutRuns = contours.map(line => line.length > 1 ? _rapierDrawEraseRuns(line, path, radius) : null), shaftCut = cutRuns.some(Boolean);
			const heads = parts ? [['End', parts.headEnd], ['Start', parts.headStart]].filter(row => row[1]).map(([end, head]) => {
				const contour = head.kind === 'arrow' ? head.poly : head.poly.concat([head.poly[0]]);
				budget(contour.length);
				return { end, head, runs: _rapierDrawEraseRuns(contour, path, radius) };
			}) : [];
			if (!shaftCut && !heads.some(row => row.runs)) { next.push(shape); continue; }
			cut = true;
			if (!shaftCut) {
				const kept = { ...shape, cutWidth: shape.cutWidth || _rapierDrawEffectiveWidth(shape, parts.headStart || parts.headEnd) };
				if (parts.label) kept.labelPos = parts.label.labelPos;
				for (const { end, head, runs } of heads) if (runs) {
					kept['head' + end] = 'none';
					kept['trim' + end] = Math.max(kept['trim' + end] || 0, head.trim);
				}
				next.push(kept);
			} else {
				const width = shape.cutWidth || _rapierDrawEffectiveWidth(shape, parts && (parts.headStart || parts.headEnd));
				for (const run of cutRuns.flatMap((runs, index) => runs || [contours[index]])) linePiece(run, shape, width);
			}
			for (const { head, runs } of heads) {
				if (runs) for (const run of runs) linePiece(run, shape, head.kind === 'arrow' ? 2 : 2.6, 'ink');
				else if (shaftCut) headPiece(head, shape);
			}
			if (shaftCut) labelPiece(shape, radius);
		}
		if (refused) showToast('Erase cuts lines, not filled faces.', 'info');
		if (!cut) return false;
		const candidate = _rapierDrawAdmitRecipe(_rapierDrawPruneUnusedStrokes({ ...recipe, strokes: recipe.strokes.concat(strokes), shapes: next }), true);
		if (!candidate) throw Object.assign(new RangeError('Erasing this much exceeds the drawing limit. Erase a smaller part.'), { code: 'drawing_geometry_limit' });
		return _rapierDrawCommand(() => { state.recipe = candidate; _rapierDrawSetSelection([]); });
	} catch (error) { showToast(String(error.message || error), 'error'); return false; }
}

const RAPIER_DRAW_SHAPE_KINDS = [
	['rect', 'Box'], ['ellipse', 'Oval'], ['circle', 'Circle'],
	['triangle', 'Triangle'], ['diamond', 'Diamond'], ['star', 'Star'], ['hexagon', 'Hexagon'],
	['pentagon', 'Pentagon'], ['octagon', 'Octagon'], ['line', 'Line'], ['arrow', 'Arrow'],
];
const RAPIER_DRAW_SHAPE_MIN = 8;
function _rapierDrawShapeKind() {
	const k = _rapierDrawState.shapeKind;
	return RAPIER_DRAW_SHAPE_KINDS.some(row => row[0] === k) ? k : 'rect';
}
function _rapierDrawSetShapeKind(kind) {
	if (!RAPIER_DRAW_SHAPE_KINDS.some(row => row[0] === kind)) return;
	_rapierDrawState.shapeKind = kind;
	_rapierDrawRemember('shapeKind', kind);
	_rapierDrawUpdateShapeRow();
}
// The one chip in the settings row that stands for the shape kinds: it wears the chosen kind's own
// glyph, so the row still says what the tool will draw.
function _rapierDrawUpdateKindsChip() {
	const btn = _rapierDrawState.surface?.querySelector('[data-draw-act="kinds"]');
	if (!btn) return;
	const shape = _rapierDrawTool() === 'shape';
	btn.hidden = !shape;
	if (!shape) return;
	const kind = _rapierDrawShapeKind();
	const label = (RAPIER_DRAW_SHAPE_KINDS.find(([id]) => id === kind) || [, kind])[1];
	btn.innerHTML = _rapierDrawKindGlyph(kind) + '<span class="rapier-draw-btn-name">shape</span>';
	btn.setAttribute('aria-label', 'Shape: ' + label);
	btn.setAttribute('data-tip', String(label).toLowerCase());
	btn.setAttribute('aria-expanded', String(!!_rapierDrawState.kindsOpen));
}
function _rapierDrawShapeRow() { return _rapierDrawState.surface && _rapierDrawState.surface.querySelector('.rapier-draw-kinds'); }
function _rapierDrawUpdateShapeRow() {
	const row = _rapierDrawShapeRow();
	if (!row) return;

	// The eleven kinds live in one secondary panel, opened from one fixed Shape control. All eleven
	// wrap inside that panel so none disappear off a phone edge; the primary settings row itself
	// never scrolls or grows to a second line.
	if (_rapierDrawTool() !== 'shape') { row.setAttribute('hidden', ''); _rapierDrawState.kindsOpen = false; _rapierDrawState.kindsSeen = false; _rapierDrawUpdateKindsChip(); return; }
	// Reaching for the Shape tool is asking which shapes there are, so the first thing it does is show
	// them (R82, the founder: "every single shape has disappeared"); the panel floats over the stage
	// and reflows nothing. Picking one closes it; the Shape control reopens it.
	if (!_rapierDrawState.kindsSeen) { _rapierDrawState.kindsSeen = true; _rapierDrawState.kindsOpen = true; }
	row.hidden = !_rapierDrawState.kindsOpen;
	const kind = _rapierDrawShapeKind();
	_rapierDrawUpdateKindsChip();
	// The shapes are shown as themselves: the engine paints each kind's own glyph.
	row.innerHTML = RAPIER_DRAW_SHAPE_KINDS.map(([id, label]) =>
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--glyph' + (id === kind ? ' rapier-draw-chip--active' : '') +
		'" role="radio" data-draw-kind="' + id + '" aria-label="' + label + '" data-tip="' + label.toLowerCase() + '" aria-checked="' + (id === kind) + '" aria-pressed="' + (id === kind) + '">' + _rapierDrawKindGlyph(id) + '</button>').join('');

}

function _rapierDrawShapeFromDrag(kind, a, b, options = _rapierDrawState.gesture || {}) {
	let dx = b[0] - a[0], dy = b[1] - a[1];
	const state = _rapierDrawState;
	if (!options.ignore && (state.proportions || options.shift)) { const side = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * side; dy = Math.sign(dy || 1) * side; }
	if (!options.ignore && (state.resizeFromCenter || options.alt)) { a = [a[0] - dx, a[1] - dy]; dx *= 2; dy *= 2; b = [a[0] + dx, a[1] + dy]; }
	b = [a[0] + dx, a[1] + dy];
	if (kind === 'line' || kind === 'arrow') return Math.hypot(dx, dy) < RAPIER_DRAW_SHAPE_MIN ? null : { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
	if (Math.abs(dx) < RAPIER_DRAW_SHAPE_MIN && Math.abs(dy) < RAPIER_DRAW_SHAPE_MIN) return null;
	if (kind === 'circle') { const d = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * d; dy = (dy < 0 ? -1 : 1) * d; }
	else { dx = (dx < 0 ? -1 : 1) * Math.max(Math.abs(dx), RAPIER_DRAW_SHAPE_MIN); dy = (dy < 0 ? -1 : 1) * Math.max(Math.abs(dy), RAPIER_DRAW_SHAPE_MIN); }
	const cx = a[0] + dx / 2, cy = a[1] + dy / 2, w = Math.abs(dx), h = Math.abs(dy);
	if (['rect', 'diamond', 'star', 'hexagon', 'pentagon', 'octagon'].includes(kind)) return { cx, cy, w, h };
	if (kind === 'ellipse') return { cx, cy, rx: w / 2, ry: h / 2 };
	if (kind === 'circle') return { cx, cy, r: w / 2 };
	if (kind === 'triangle') return { p: [[cx, Math.min(a[1], a[1] + dy)], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] };
	return null;
}
// D04: one candidate/admission/commit owner for every new shape or stroke, the same
// _rapierDrawAdmitRecipe gate the agent-facing shapes-patch modification path already re-admits
// its own result through (_rapierDrawApplyShapesPatch's own comment). Creation used to push
// straight onto the live recipe and let limits surface only at Done, by which point a refusal
// meant losing whatever the person had just drawn; now a candidate is built off-line from the live
// recipe, admitted, and only adopted on success -- a refusal leaves the previous recipe, still a
// complete and valid scene, completely untouched, and reports why.
function _rapierDrawAdmitCreation(candidate) {
	const admitted = _rapierDrawAdmitRecipe(candidate, true);
	if (!admitted) showToast('This drawing is at its limit; that mark was not added', 'error');
	return admitted;
}
function _rapierDrawCommitShapeDrag(pts, dragged = true, options) {
	if (!pts?.length) return false;
	const state = _rapierDrawState, kind = _rapierDrawShapeKind();
	const size = 96, a = pts[0], b = pts.at(-1);
	const geom = !dragged && !['line', 'arrow'].includes(kind) ? _rapierDrawShapeFromDrag(kind, [a[0] - size / 2, a[1] - size / 2], [a[0] + size / 2, a[1] + size / 2], { ignore: true }) : _rapierDrawShapeFromDrag(kind, a, b, options);
	if (!geom) return false;
	const shape = { id: _rapierDrawNextId(), stroke: null, recognized: kind, asDrawn: false,
		brush: 'ink', style: _rapierDrawDefaultStyle(kind), geom, seed: _rapierDrawMintSeed(),
		smooth: _rapierDrawSmoothLevel(state.smooth), nib: _rapierDrawNibLevel(state.nib) };
	if (state.ink) shape.ink = state.ink;
	if (kind === 'arrow') { const bind = _rapierDrawBindArrowEnds(geom); if (bind) shape.bind = bind; }
	else if (kind === 'line') _rapierDrawSnapLineGeom(geom);
	const candidate = _rapierDrawAdmitCreation({ ...state.recipe, shapes: state.recipe.shapes.concat([shape]) });
	if (!candidate) return false;
	_rapierDrawSnapshot();
	state.recipe = candidate;
	if (!state.repeat) { state.tool = 'select'; state.pen = false; _rapierDrawUpdatePenBtn(); _rapierDrawUpdateShapeRow(); }
	_rapierDrawSetSelection(state.repeat ? [] : [shape.id]);
	_rapierDrawRenderAll();
	_rapierDrawSealHistory();
	return true;
}
function _rapierDrawCommitStroke(points, options = {}) {
	if (points.length < 2) return;

	// F75-8 (the founder's report): Pen reads intent the way Brush does, and the smoothing dial is
	// the correction strength -- zero means the raw sampled line, nothing read, nothing corrected.
	// Above zero, Pen runs the same recognizer Brush uses (line, arrow, rect, circle/ellipse, arc)
	// and, unlike Brush, applies what it finds at once: the dial already is the person's one tap,
	// so there is no second "Make it a circle" to offer (Brush's own offer, never applied unasked,
	// is untouched -- see _rapierDrawUpdateMenu). An open, corner-free stroke the recognizer does
	// not read as a hard shape keeps its `ink` kind and still straightens: the render pipeline
	// (core.mjs _rapierDrawShapeMarkup, _rapierDrawIdealise) fits it to a low-order curve when the
	// fit is close, so a parabola or an S-curve reads as itself without ever becoming a shape kind.
	// A dot (`options.dot`) is ink whatever the tool: nothing to recognise.
	const state = _rapierDrawState;
	const penMode = !!_rapierDrawState.pen;
	const smoothLevel = _rapierDrawSmoothLevel(_rapierDrawState.smooth);
	// Recognition offers a shape; failing to recognise one must never discard the person's ink.
	let recognized;
	if (options.dot) recognized = { kind: 'ink' };
	else if (penMode) recognized = smoothLevel === 0 ? { kind: 'ink' } : (_rapierDrawRecognize(points) || { kind: 'ink' });
	else recognized = _rapierDrawRecognize(points) || { kind: 'ink' };

	if ((recognized.kind === 'line' || recognized.kind === 'arrow') && recognized.geom) _rapierDrawSnapLineGeom(recognized.geom);

	else if (recognized.kind === 'arc' && recognized.geom) _rapierDrawSnapArcGeom(recognized.geom, null);

	else if (recognized.geom) recognized.geom = _rapierDrawRestGeom(recognized.kind, recognized.geom, null);

	const bind = recognized.kind === 'arrow' && recognized.geom ? _rapierDrawBindArrowEnds(recognized.geom) : null;
	const strokeIndex = state.recipe.strokes.length;

	const varied = _rapierDrawStrokeHasPressure(points);
	const strokeEntry = { pts: points.map(p => varied
		? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] || 0), Math.round((p[3] ?? 0.5) * 100) / 100]
		: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] || 0)]) };
	const id = _rapierDrawNextId();
	// Pen applies a recognised hard shape at once (asDrawn:false, the figure itself); Brush always
	// keeps the stroke as drawn and offers its own recognised shape on the selection row instead.
	// Either way the raw stroke stays (`stroke: strokeIndex`), so "As drawn" can still go back.
	const penApplies = penMode && recognized.kind !== 'ink';
	const shape = {
		id, stroke: strokeIndex, recognized: recognized.kind, asDrawn: !penApplies,
		brush: penMode ? 'ink' : 'brush', style: recognized.style || _rapierDrawDefaultStyle(recognized.kind), geom: recognized.geom || null,
		seed: _rapierDrawMintSeed(),

		smooth: smoothLevel,
		nib: _rapierDrawNibLevel(_rapierDrawState.nib),
	};

	if (state.ink) shape.ink = state.ink;

	if (bind) shape.bind = bind;
	const candidate = _rapierDrawAdmitCreation({ ...state.recipe, strokes: state.recipe.strokes.concat([strokeEntry]), shapes: state.recipe.shapes.concat([shape]) });
	if (!candidate) return;
	_rapierDrawSnapshot();
	state.recipe = candidate;
	_rapierDrawRenderAll();
	_rapierDrawSealHistory();
}

function _rapierDrawSmoothRow() { return _rapierDrawState.surface && _rapierDrawState.surface.querySelector('.rapier-draw-smooth'); }

function _rapierDrawNibRow() { return _rapierDrawState.surface?.querySelector('.rapier-draw-nib'); }
const RAPIER_DRAW_MARQUEE_MIN = 6;
function _rapierDrawBeginMarquee(pt) { _rapierDrawState.marquee = { x0: pt[0], y0: pt[1], x1: pt[0], y1: pt[1] }; }
function _rapierDrawMarqueeRect() {
	const m = _rapierDrawState.marquee;
	return m ? { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) } : null;
}
function _rapierDrawPaintMarquee() {
	const el = _rapierDrawState.marqueeEl, r = _rapierDrawMarqueeRect();
	if (!el) return;
	// The stylesheet reads [hidden]; toggle the SVG attribute explicitly.
	el.toggleAttribute('hidden', !r);
	if (r) for (const [name, value] of [['x', r.x], ['y', r.y], ['width', r.w], ['height', r.h]]) el.setAttribute(name, _rapierDrawFmt(value));
}
function _rapierDrawEndMarquee() { _rapierDrawState.marquee = null; _rapierDrawPaintMarquee(); _rapierDrawState.scribbleEl?.setAttribute('d', ''); }
function _rapierDrawMarqueeCatches(rect) {
	const recipe = _rapierDrawState.recipe, scale = _rapierDrawState.gesture?.scale || 1;
	if (!recipe || !rect || Math.max(rect.w, rect.h) * scale < RAPIER_DRAW_MARQUEE_MIN) return [];
	const inside = p => p[0] >= rect.x && p[0] <= rect.x + rect.w && p[1] >= rect.y && p[1] <= rect.y + rect.h;
	const crosses = (a, b) => {
		let lo = 0, hi = 1;
		for (const [start, delta, min, max] of [[a[0], b[0] - a[0], rect.x, rect.x + rect.w], [a[1], b[1] - a[1], rect.y, rect.y + rect.h]]) {
			if (!delta) { if (start < min || start > max) return false; continue; }
			const p = (min - start) / delta, q = (max - start) / delta;
			lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q));
			if (lo > hi) return false;
		}
		return true;
	};
	const corners = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]];
	const lockedGroups = new Set(recipe.shapes.filter(shape => shape.locked && shape.group).map(shape => shape.group));
	return recipe.shapes.filter(shape => {
		if (shape.locked || lockedGroups.has(shape.group)) return false;
		const geometry = _rapierDrawHitGeometry(shape, recipe);
		for (const points of geometry.contours) for (let i = 1; i < points.length; i++) if (inside(points[i - 1]) || crosses(points[i - 1], points[i])) return true;
		for (const poly of geometry.polygons) {
			if (poly.some(inside) || corners.some(point => _rapierDrawPointInPolygon(point, poly))) return true;
			if (poly.some((a, i) => crosses(a, poly[(i + 1) % poly.length]))) return true;
		}
		return false;
	}).map(shape => shape.id);
}
function _rapierDrawSelection() { return (_rapierDrawState.selection || []).slice(); }
function _rapierDrawToggleSelection(ids, hit) {
	const unit = _rapierDrawGroupSelection(_rapierDrawState.recipe, [hit], true);
	return ids.includes(hit) ? ids.filter(id => !unit.includes(id)) : [...ids, ...unit];
}
function _rapierDrawSetSelection(ids) {
	const live = new Set((_rapierDrawState.recipe?.shapes || []).map(shape => shape.id));
	const kept = _rapierDrawState.recipe ? _rapierDrawGroupSelection(_rapierDrawState.recipe, [...new Set(ids || [])].filter(id => live.has(id)), true) : [];
	if (kept.join('\0') !== _rapierDrawSelection().join('\0')) { _rapierDrawState.menuPane = null; _rapierDrawState.menuColour = false; }
	_rapierDrawState.selection = kept;
	_rapierDrawState.menuShapeId = kept.at(-1) || null;
	// The person's chosen paint identity (Astra-R75 P01): this is the one owner of a real selection
	// change, so it is also the one place that records a deliberate choice of painting -- a single
	// eligible painting selected here is what Paint targets from now on, however the selection is
	// later cleared (a tool switch, Paint's own per-stroke clearing, Escape). Selecting anything else
	// -- a vector, a lock group, more than one shape -- is just as deliberate and forgets the earlier
	// choice; CLEARING the selection to nothing is not itself a choice and never touches this, which
	// is exactly what lets the choice outlive Paint's own selection housekeeping.
	if (kept.length) _rapierDrawState.paintChosenId = _rapierDrawSelectedPaint(kept);
	_rapierDrawSyncNibRow();
	_rapierDrawSyncSmoothRow();
	_rapierDrawSyncTextEffect();
}
function _rapierDrawSelectedShapes() {
	const ids = new Set(_rapierDrawSelection());
	return (_rapierDrawState.recipe?.shapes || []).filter(shape => ids.has(shape.id));
}
// Group/recipe-order selection stays separate from Paint's readable-raster eligibility.
function _rapierDrawSelectionLocked(shapes = _rapierDrawSelectedShapes()) {
	return shapes.some(shape => shape.locked);
}
function _rapierDrawSelectedPaint(ids = _rapierDrawSelection()) {
	return ids.length === 1 && _rapierPaintEligiblePaint(_rapierDrawShapeById(ids[0])) ? ids[0] : null;
}
function _rapierDrawSelectionBox(recipe = _rapierDrawState.recipe, ids = _rapierDrawSelection()) {
	let box = null;
	for (const shape of recipe.shapes) if (ids.includes(shape.id)) {
		const b = _rapierDrawShapeBBoxIn(shape, recipe);
		box = box ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) } : { ...b };
	}
	return box;
}
function _rapierDrawSelectionScreenBox() {
	let box = null;
	for (const shape of _rapierDrawSelectedShapes()) {
		const b = _rapierDrawShapeScreenBox(shape);
		box = box ? { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), right: Math.max(box.right, b.right), bottom: Math.max(box.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
	}
	return box && { ...box, width: box.right - box.left, height: box.bottom - box.top };
}
function _rapierDrawSettingRow(which) { return which === 'nib' ? _rapierDrawNibRow() : _rapierDrawSmoothRow(); }
function _rapierDrawShowRow(which, toggle = false) {
	const row = _rapierDrawSettingRow(which);
	if (!row) return;
	const open = !toggle || row.hidden;
	_rapierDrawCloseSettingPanels(open ? which : '');
	row.hidden = !open;
	_rapierDrawState.surface.querySelector('[data-draw-act="' + which + '"]')?.setAttribute('aria-expanded', String(open));
	_rapierDrawSyncNibRow(); _rapierDrawSyncSmoothRow();
	_rapierDrawUpdateMenu(); _rapierDrawUpdateHandles();
}
function _rapierDrawToggleNibRow() { _rapierDrawShowRow('nib', true); }
function _rapierDrawToggleSmoothRow() { _rapierDrawShowRow('smooth', true); }
function _rapierDrawSyncSetting(which) {
	const row = _rapierDrawSettingRow(which);
	if (!row || row.hidden) return;
	if (which === 'nib' && _rapierDrawTool() === 'paint') {
		// The Width row is the Paint tool's Size: a log offset on the preset's own radius.
		const input = row.querySelector('input'), word = row.querySelector('output');
		input.min = '0'; input.max = '100'; input.value = String(_rapierPaintSize()); _rapierDrawSeekSync(input);
		word.textContent = _rapierPaintSizeWord(); input.setAttribute('aria-valuetext', word.textContent);
		row.querySelector('label').textContent = 'Size · Brush';
		return;
	}
	// With shapes selected the row reads and sets theirs; with none it is the pen's own, what the next mark takes.
	const state = _rapierDrawState, shapes = _rapierDrawSelectedShapes(), normalize = which === 'nib' ? _rapierDrawNibLevel : _rapierDrawSmoothLevel;
	const shown = shape => normalize(shape[which] ?? state.recipe?.[which] ?? state[which]);
	const level = shapes.length ? shown(shapes[0]) : normalize(state[which]);
	const mixed = shapes.some(shape => shown(shape) !== level);
	const input = row.querySelector('input'), word = row.querySelector('output');
	if (which === 'nib') { input.min = String(RAPIER_DRAW_NIB_MIN); input.max = String(RAPIER_DRAW_NIB_MAX); }
	input.value = String(level); _rapierDrawSeekSync(input);
	word.textContent = mixed ? 'Mixed' : which === 'nib' ? String(level) : _rapierDrawSmoothWord(level);
	input.setAttribute('aria-valuetext', word.textContent);
	row.querySelector('label').textContent = (which === 'nib' ? 'Width' : 'Smooth') + (shapes.length ? ' · ' + (shapes.length === 1 ? 'Shape' : shapes.length) : '');
}
// Geoffrey's seek control, the one slider design in Draw (the founder: the now-playing playback
// indicator, "a white line with a hollow circle overlayed cutting out of it and when you tap the
// circle fills in"). The range input stays the control -- keyboard, screen reader, tap-to-jump --
// and is drawn as a 2px line cut either side of a hollow circle sitting exactly where the input's
// own 44px thumb is; the circle fills while the finger is down. Built with DOM calls, so it is not
// an HTML sink. Anything that writes input.value or its range afterwards calls _rapierDrawSeekSync.
// R85. A sideways swipe on a row that scrolls (the palette, Brushes, Tools, the shape kinds) is the
// row's to use -- and when the row is already at its end, it is nobody's. Left to the browser, the
// swipe a row cannot take becomes the browser's own gesture: in Chromium a long pull from the left
// edge across a row at its start is "go back", and a drawing in progress is left mid-stroke (seen
// by hand in R85: the page went to about:blank; neither the row's nor the viewport's
// overscroll-behavior stopped it, only refusing the touch does). So the first real sideways move
// that the row cannot consume is refused here, and every move of that touch after it, before the
// browser reads any of them as a gesture. A touch on something that already keeps its touches (the
// seek sliders, the dip pad: touch-action none) is left alone; so is anything vertical, and any tap.
function _rapierDrawGuardRowSwipes(surface) {
	let from = null;
	surface.addEventListener('touchstart', evt => {
		from = null;
		if (evt.touches.length !== 1 || !(evt.target instanceof Element)) return;
		let el = evt.target;
		while (el && el !== surface) {
			const style = getComputedStyle(el);
			if (style.touchAction === 'none') return;
			const ox = style.overflowX;
			if (ox === 'auto' || ox === 'scroll') break;
			el = el.parentElement;
		}
		if (!el || el === surface) return;
		from = { el, x: evt.touches[0].clientX, y: evt.touches[0].clientY };
	}, { passive: true, capture: true });
	surface.addEventListener('touchmove', evt => {
		if (!from || evt.touches.length !== 1) return;
		// Once refused, refused for the whole touch: the browser keeps offering each move until one
		// goes unrefused, and starts its pan (and its gesture) on that one. A tap's wobble is a
		// pointer press/release to Rapier (_rapierDrawBindTap), which a refused touchmove does not touch.
		if (from.refuse) { if (evt.cancelable) evt.preventDefault(); return; }
		if (!evt.cancelable) { from = null; return; }
		const dx = evt.touches[0].clientX - from.x, dy = evt.touches[0].clientY - from.y;
		if (!dx || Math.abs(dx) <= Math.abs(dy)) return;
		const el = from.el, atStart = el.scrollLeft <= 0, atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
		if ((dx > 0 && atStart) || (dx < 0 && atEnd)) { from.refuse = true; evt.preventDefault(); }
		else from = null;
	}, { passive: false, capture: true });
	for (const end of ['touchend', 'touchcancel']) surface.addEventListener(end, () => { from = null; }, { passive: true, capture: true });
}
function _rapierDrawSeekWrap(input) {
	if (!input || input.parentElement?.classList.contains('rapier-draw-seek')) return input?.parentElement || null;
	const wrap = document.createElement('span'); wrap.className = 'rapier-draw-seek';
	const track = document.createElement('span'); track.className = 'rapier-draw-seek-track'; track.setAttribute('aria-hidden', 'true');
	const head = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); head.setAttribute('class', 'rapier-draw-seek-head'); head.setAttribute('viewBox', '0 0 24 24'); head.setAttribute('aria-hidden', 'true');
	const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ring.setAttribute('cx', '12'); ring.setAttribute('cy', '12'); ring.setAttribute('r', '10'); head.appendChild(ring);
	input.replaceWith(wrap); wrap.append(track, head, input);
	const active = on => wrap.classList.toggle('rapier-draw-seek--active', on);
	input.addEventListener('pointerdown', () => active(true));
	for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) input.addEventListener(event, () => active(false));
	input.addEventListener('input', () => _rapierDrawSeekSync(input));
	_rapierDrawSeekSync(input);
	return wrap;
}
function _rapierDrawSeekSync(input) {
	const wrap = input?.parentElement;
	if (!wrap?.classList.contains('rapier-draw-seek')) return;
	const min = Number(input.min) || 0, max = Number(input.max) || 100, value = Number(input.value) || 0;
	wrap.style.setProperty('--seek-frac', String(max > min ? _rapierDrawClamp((value - min) / (max - min), 0, 1) : 0));
}
function _rapierDrawSyncNibRow() { _rapierDrawSyncSetting('nib'); }
function _rapierDrawSyncSmoothRow() { _rapierDrawSyncSetting('smooth'); }
// The Width and Smooth rows have two scopes and nothing between them (the founder, 30 September 2026: "You should only
// be changing existing lines using the select tool"). With shapes selected the row sets those shapes' own value, one
// Undo step for a drag. With nothing selected it sets the pen -- what the next mark takes, as the colour beside it does --
// and touches nothing drawn: every stroke keeps the width and smoothing it was drawn with, and the recipe and the history
// are exactly as they were, so there is nothing for Undo to take back. The pen is the person's (a remembered preference,
// _rapierDrawOpenSurface): a selection edit leaves it alone too.
function _rapierDrawSetSetting(which, value) {
	if (which === 'nib' && _rapierDrawTool() === 'paint') { _rapierPaintSetSize(value); _rapierDrawSyncSetting('nib'); return; }
	const n = (which === 'nib' ? _rapierDrawNibLevel : _rapierDrawSmoothLevel)(value);
	const state = _rapierDrawState, recipe = state.recipe, shapes = _rapierDrawSelectedShapes();
	if (!shapes.length) {
		if (state[which] !== n) { state[which] = n; _rapierDrawRemember(which === 'nib' && state.notes ? 'notesNib' : which, n); }
		_rapierDrawSyncSetting(which);
		return;
	}
	const ids = new Set(_rapierDrawGroupSelection(recipe, shapes.map(shape => shape.id)));
	const changed = recipe.shapes.some(shape => ids.has(shape.id) && (shape[which] ?? recipe[which] ?? state[which]) !== n);
	if (!changed) { _rapierDrawSyncSetting(which); return; }
	const edit = state.settingEdit;
	if (_rapierDrawCommand(() => { for (const shape of state.recipe.shapes) if (ids.has(shape.id)) shape[which] = n; }, !edit?.changed, false) && edit) edit.changed = true;
	_rapierDrawSyncSetting(which);
}

const RAPIER_DRAW_TEXT_DEFAULT = Object.freeze({ textSize: 24, textFont: 'sans', lineHeight: 1.25, letterSpacing: 0, wordSpacing: 0, textBold: false, textItalic: false, textUnderline: false, textKern: true, textCase: '', textFigures: '', textEffect: '', effectFlower: '', effectStem: '', labelAlign: 'start' });
// The type choices past weight and slant, each a recipe field on the text (docs/architecture.md, "Text
// is one primitive"): the case the words are shown in, and the figure style an uploaded font carries.
const RAPIER_DRAW_TEXT_CASES = [['', 'Aa', 'As typed'], ['upper', 'AA', 'Capitals'], ['small', 'Aa', 'Small capitals'], ['lower', 'aa', 'Lowercase']];
const RAPIER_DRAW_TEXT_FIGURES = { oldstyle: 'Old style', lining: 'Lining', tabular: 'Tabular' };
// The pressed letter's live sample: a P in the ink the next text takes, drawn by the same writer
// that draws the canvas (draw/text.mjs), so the chip can never disagree with the result.
function _rapierDrawEffectGlyph(effect = 'pressed', style = null) {
	if (effect === 'garden') return _rapierDrawGlyph({ id: 'effect-sample', recognized: 'text', stroke: null, brush: 'ink', asDrawn: false, style: null, label: 'a', textSize: 22, textFont: 'serif', textBold: true, labelAlign: 'middle', textEffect: 'garden', textEffectSeed: 7, ...(style?.effectFlower ? { effectFlower: style.effectFlower } : {}), ...(style?.effectStem ? { effectStem: style.effectStem } : {}), geom: { cx: 20, cy: 32 } }) || RAPIER_DRAW_ICONS.garden;
	return _rapierDrawGlyph({ id: 'effect-sample', recognized: 'text', stroke: null, brush: 'ink', asDrawn: false, style: null, label: 'P', textSize: 34, textFont: 'serif', textBold: true, labelAlign: 'middle', textEffect: 'pressed', geom: { cx: 20, cy: 20 } });
}
// The garden's two colours as the chips show them: the person's choice, else the default for the paper, lifted for a dark theme the way every ink is.
function _rapierDrawGardenColour(kind, chosen) {
	const [light, dark] = GARDEN_COLOURS[kind];
	if (!_rapierDrawDarkChrome()) return chosen || light;
	return chosen ? (typeof _rapierDeriveDarkColor === 'function' ? _rapierDeriveDarkColor(chosen) : chosen) : dark;
}
// The page carries one capital per set for discovery; using the alphabet still loads its pinned set.
function _rapierDrawLetterSets() { const sets = globalThis.RapierDrawLetters?.LETTER_SETS || []; return ['field', 'leaf', 'arabesque', 'relief'].map(id => sets.find(set => set.id === id)).filter(Boolean); }
function _rapierDrawLetterFont(id) { return /^letters:/.test(id) && _rapierDrawLetterSets().some(set => 'letters:' + set.id === id); }
function _rapierDrawLetterGlyph(set) {
	const sample = set && globalThis.RapierDrawLetters.LETTER_PREVIEWS[set.id];
	return sample ? '<svg class="rapier-draw-glyph" viewBox="0 0 ' + sample.glyph[0] + ' ' + sample.em + '" aria-hidden="true"><path fill="currentColor" transform="translate(' + sample.bearing + ',0)" d="' + sample.glyph[1] + '"/></svg>' : '';
}
// No set rides in the page: each comes through the plug-in door (shell/plugin-loader.js RapierPluginLoader.files), one file
// pinned by the catalogue's length and SHA-384 -- the app's own copy where the app keeps the plug-ins (Android's Play pack,
// rapier-letters-<id>), this browser's once it has one, else the public plug-ins repository through jsDelivr. The first
// press of a set not here asks in the plug-in sheet (#letters-plugin-overlay) what comes, from where and how big; one yes
// a page. A set here is never fetched again. Until it is here the words stay as typed, in the serif, at the set's advances.
const RAPIER_DRAW_LETTERS_URL = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@main/letters/';
const _rapierDrawLettersDoor = { allowed: false, asking: null, providers: new Map(), bringing: new Map(), store: null };
function _rapierDrawLettersProvider(set) {
	const door = _rapierDrawLettersDoor;
	if (!door.providers.has(set.id) && globalThis.RapierPluginLoader) {
		door.store ||= RapierBundleIO.store(RapierStorage.optional.lettersDb, 'bundle');
		window.addEventListener('rapier:letters-' + set.id + 'plugin', event => {
			if (door.asking?.set === set) _rapierDrawLettersPaint();
			if (event.detail?.status === 'ready') void _rapierDrawLettersBring(set);
		});
		door.providers.set(set.id, RapierPluginLoader.files({ key: 'letters-' + set.id, noun: set.name + ' letter set', dash: ' — ', version: set.id + ' ' + set.sha384,
			files: [{ name: set.id, url: RAPIER_DRAW_LETTERS_URL + set.id + '.json', bytes: set.bytes, sri: set.sha384 }], store: door.store }));
	}
	return door.providers.get(set.id) || null;
}
// Draw opens: a set this browser or the app already keeps is held at once, with no question and no network. Asking never
// stands between a person and the canvas.
function _rapierDrawLettersWake() { try { for (const set of _rapierDrawLetterSets()) _rapierDrawLettersProvider(set); } catch (_) {} }
// A press on a letter set (a Type chip, the text's pane): false when the choice goes ahead now -- the set is here or on its
// way (kept, or this page already said yes) -- true when the sheet asks first; `apply` makes the choice on the yes.
function _rapierDrawLettersAsk(font, apply) {
	const set = _rapierDrawLetterSets().find(item => 'letters:' + item.id === font);
	if (!set || globalThis.RapierDrawLetters.letterSetHeld(set.id)) return false;
	const door = _rapierDrawLettersDoor, provider = _rapierDrawLettersProvider(set);
	if (!provider) return false;
	if (provider.status === 'ready' || door.allowed && provider.status !== 'error') { void _rapierDrawLettersBring(set, true); return false; }
	door.asking = { set, apply };
	_rapierDrawLettersPaint();
	openDialog(document.getElementById('letters-plugin-overlay'), { panel: '.settings-panel', onEscape: _rapierDrawLettersDismiss });
	return true;
}
// The set's bytes from the door, held (holdLetterSet), and everything drawn in it drawn again. A failure is the loader's to
// word (the provider's status and error); the sheet shows it when a person asked for the set.
function _rapierDrawLettersBring(set, asked = false) {
	const door = _rapierDrawLettersDoor, letters = globalThis.RapierDrawLetters;
	if (letters.letterSetHeld(set.id)) return Promise.resolve();
	if (!door.bringing.has(set.id)) door.bringing.set(set.id, (async () => {
		const provider = _rapierDrawLettersProvider(set);
		try {
			if (provider.status !== 'ready') await provider[provider.status === 'error' ? 'reinstall' : 'install']();
			if (!letters.holdLetterSet((await provider.bytes())[set.id])) throw new Error(set.name + ' is not a letter set');
			if (door.asking?.set === set) { door.asking = null; closeDialog(document.getElementById('letters-plugin-overlay')); }
			const state = _rapierDrawState;
			if (state.open) { _rapierDrawRenderAll(); _rapierDrawSyncTextPanels(); }
		} catch (_) {
			if (!asked || door.asking && door.asking.set !== set) return;
			door.asking ||= { set, apply: null };
			_rapierDrawLettersPaint();
			openDialog(document.getElementById('letters-plugin-overlay'), { panel: '.settings-panel', onEscape: _rapierDrawLettersDismiss });
		} finally { door.bringing.delete(set.id); }
	})());
	return door.bringing.get(set.id);
}
function _rapierDrawLettersInstall() {
	const door = _rapierDrawLettersDoor, asking = door.asking;
	if (!asking) return;
	door.allowed = true;
	const apply = asking.apply;
	asking.apply = null;
	apply?.();
	void _rapierDrawLettersBring(asking.set, true);
}
function _rapierDrawLettersDismiss() {
	_rapierDrawLettersDoor.asking = null;
	closeDialog(document.getElementById('letters-plugin-overlay'));
}
function _rapierDrawLettersPaint() {
	const set = _rapierDrawLettersDoor.asking?.set, status = set && _rapierDrawLettersProvider(set)?.status;
	if (!set) return;
	const busy = status === 'downloading' || status === 'installing', error = status === 'error';
	// Where the app keeps the plug-ins (Android: Google Play brings them in one pack), the app says what comes and what it costs.
	const hostWords = phase => window.RapierPlatform?.resources.installMessage?.('letters', phase) || '';
	document.getElementById('letters-plugin-title').textContent = busy ? 'Downloading ' + set.name : error ? set.name + ' did not arrive' : 'Download ' + set.name + '?';
	document.getElementById('letters-plugin-body').textContent = error
		? hostWords('error') || 'Rapier could not reach or verify ' + set.name + '. Your words stay in the serif until it arrives.'
		: hostWords('prompt') || (navigator.onLine === false ? 'This device is offline. ' : '') + set.name + ' is one of Draw\'s letter sets. Rapier downloads it once from jsDelivr (about ' + Math.round(set.bytes / 1000) + ' KB), then it works offline.';
	const progress = document.getElementById('letters-plugin-progress'), said = document.getElementById('letters-plugin-error'), install = document.getElementById('letters-plugin-install');
	progress.hidden = !busy;
	progress.textContent = 'Downloading ' + set.name + '…';
	said.hidden = !error;
	said.textContent = 'Last attempt failed: ' + (_rapierDrawLettersProvider(set)?.error || 'unknown error');
	install.disabled = busy;
	install.textContent = busy ? 'downloading…' : error ? 'retry' : 'download';
}
document.addEventListener('click', event => {
	const act = event.target instanceof Element ? event.target.closest('[data-action]')?.dataset.action : '';
	if (act === 'letters-install') _rapierDrawLettersInstall();
	else if (act === 'letters-dismiss') _rapierDrawLettersDismiss();
	else if (event.target instanceof Element && event.target.id === 'letters-plugin-overlay') _rapierDrawLettersDismiss();
});
// The founder (R85): size is a slider over whole pixels, capped where a phone canvas stops making
// sense -- text is vector, so any size is resized later with the fingers; a fixed list of eight
// sizes was the wrong control. The shape itself still admits 6..512.
const RAPIER_DRAW_TEXT_SIZE_MIN = 8, RAPIER_DRAW_TEXT_SIZE_MAX = 240;
function _rapierDrawTextDefaults() {
	const state = _rapierDrawState;
	if (!state.textDefaults) state.textDefaults = { ...RAPIER_DRAW_TEXT_DEFAULT };
	return state.textDefaults;
}
function _rapierDrawTextSpacingWord(value) {
	const n = Math.round(Number(value) * 100);
	return n === 0 ? 'Normal' : (n > 0 ? '+' : '') + n + '%';
}
// Both text entry points use the same font shelf. A drawing still embeds only the fonts it uses.
function _rapierDrawFontControls(style, selection = false, effects = true) {
	const fonts = _rapierDrawAvailableFonts(), chosen = style.textFont || 'sans', sets = _rapierDrawLetterSets();
	const attr = id => selection ? 'data-draw-menu-act="property" data-draw-property="textFont" data-draw-value="' + _rapierDrawEscapeAttr(id) + '"' : 'data-draw-text-font="' + _rapierDrawEscapeAttr(id) + '"';
	const fontButton = (id, word) => '<button type="button" class="rapier-draw-chip rapier-draw-font-choice" ' + attr(id) + ' aria-pressed="' + (id === chosen) + '" style="font-family:' + _rapierDrawEscapeAttr(globalThis.RapierDrawFonts.fontFamily(id, fonts)) + '">' + _rapierDrawEscapeAttr(word) + '</button>';
	const add = '<button type="button" class="rapier-draw-chip rapier-draw-font-add" ' + (selection ? 'data-draw-menu-act="font-upload"' : 'data-draw-act="fontUpload"') + '>' + RAPIER_DRAW_ICONS.upload + '<span>Add</span></button>';
	return '<div class="rapier-draw-font-controls"><div class="rapier-draw-font-grid">' + [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([id, word]) => fontButton(id, word)).join('') +
		(fonts.length ? '<details class="rapier-draw-my-fonts"><summary class="rapier-draw-chip"' + (fonts.some(font => font.id === chosen) ? ' aria-current="true"' : '') + '>My Fonts<span class="rapier-draw-font-chevron">' + RAPIER_DRAW_ICONS.chevron + '</span></summary><div class="rapier-draw-font-menu">' + fonts.map(font => fontButton(font.id, font.name)).join('') + add + '</div></details>' : add) + '</div>' +
		(sets.length ? '<div class="rapier-draw-letters" role="group" aria-label="Letter sets"><span class="rapier-draw-chip-head">Letter sets</span>' + sets.map(set => '<button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-letter" ' + attr('letters:' + set.id) + ' aria-label="' + _rapierDrawEscapeAttr(set.name) + '" aria-pressed="' + ('letters:' + set.id === chosen) + '">' + _rapierDrawLetterGlyph(set) + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(set.name) + '</span></button>').join('') + '</div>' : '') +
		(effects ? '<div class="rapier-draw-effects" role="group" aria-label="Effects"><span class="rapier-draw-chip-head">Effects</span><button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-effect" ' + (selection ? 'data-draw-menu-act="property" data-draw-property="textEffect" data-draw-value="' + (style.textEffect === 'pressed' ? '' : 'pressed') + '"' : 'data-draw-text-effect="pressed"') + ' aria-label="Pressed" aria-pressed="' + (style.textEffect === 'pressed') + '">' + _rapierDrawEffectGlyph() + '<span class="rapier-draw-chip-name">Pressed</span></button>' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-effect" ' + (selection ? 'data-draw-menu-act="property" data-draw-property="textEffect" data-draw-value="' + (style.textEffect === 'garden' ? '' : 'garden') + '"' : 'data-draw-text-effect="garden"') + ' aria-label="Garden" aria-pressed="' + (style.textEffect === 'garden') + '">' + _rapierDrawEffectGlyph('garden', style) + '<span class="rapier-draw-chip-name">Garden</span></button>' +
		[['flower', 'Flower', style.effectFlower], ['stem', 'Stem', style.effectStem]].map(([kind, word, chosen]) => '<label class="rapier-draw-chip rapier-draw-effect rapier-draw-garden-colour" data-draw-garden-colour="' + kind + '"' + (style.textEffect === 'garden' ? '' : ' hidden') + '><span class="rapier-draw-garden-dot" style="background:' + _rapierDrawEscapeAttr(_rapierDrawGardenColour(kind, chosen)) + '"></span><input type="color" aria-label="' + word + ' colour" value="' + _rapierDrawEscapeAttr(chosen || GARDEN_COLOURS[kind][0]) + '" data-draw-colour="' + kind + '"><span class="rapier-draw-chip-name">' + word + '</span></label>').join('') + '</div>' : '') + '</div>';
}
function _rapierDrawRenderTextFontPanel() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="textFont"]');
	if (!panel) return;
	const style = _rapierDrawTextDefaults(), available = _rapierDrawAvailableFonts();
	if (!['sans', 'serif', 'mono'].includes(style.textFont) && !available.some(font => font.id === style.textFont) && !_rapierDrawLetterFont(style.textFont)) style.textFont = 'sans';
	panel.innerHTML = _rapierDrawFontControls(style) + _rapierDrawFiguresRow(style.textFont, available, style.textFigures, id => '<button type="button" class="rapier-draw-chip rapier-draw-text-choice" data-draw-text-figures="' + id + '" aria-pressed="' + (id === style.textFigures) + '">' + (id ? RAPIER_DRAW_TEXT_FIGURES[id] : 'Default') + '</button>');
}
// The figure styles a font carries (an uploaded font's own substitution features; a built-in family
// promises none), as one row under the fonts. A font without them shows no row.
function _rapierDrawFontFigures(font, fonts) {
	try { return globalThis.RapierDrawFonts.fontFigures(font, fonts); } catch (_) { return []; }
}
function _rapierDrawFiguresRow(font, fonts, value, chip) {
	const figures = _rapierDrawFontFigures(font, fonts);
	return figures.length ? '<span class="rapier-draw-figures" role="group" aria-label="Figures"><span class="rapier-draw-chip-head">Figures</span>' + ['', ...figures].map(chip).join('') + '</span>' : '';
}
function _rapierDrawSyncTextPanels() {
	const surface = _rapierDrawState.surface, style = _rapierDrawTextDefaults();
	if (!surface) return;
	_rapierDrawRenderTextFontPanel();
	const size = surface.querySelector('#rapier-draw-text-size-input'), sizeWord = surface.querySelector('#rapier-draw-text-size-word');
	if (size) { size.value = String(style.textSize); sizeWord.textContent = String(style.textSize); size.setAttribute('aria-valuetext', style.textSize + ' px'); _rapierDrawSeekSync(size); }
	for (const button of surface.querySelectorAll('[data-draw-text-font]')) button.setAttribute('aria-pressed', String(button.dataset.drawTextFont === style.textFont));
	for (const button of surface.querySelectorAll('[data-draw-text-style]')) button.setAttribute('aria-pressed', String(!!style[button.dataset.drawTextStyle]));
	for (const button of surface.querySelectorAll('[data-draw-text-align]')) button.setAttribute('aria-pressed', String(button.dataset.drawTextAlign === style.labelAlign));
	const tracking = surface.querySelector('#rapier-draw-text-tracking-input'), trackingWord = surface.querySelector('#rapier-draw-text-tracking-word');
	if (tracking) { tracking.value = String(Math.round(style.letterSpacing * 100)); trackingWord.textContent = _rapierDrawTextSpacingWord(style.letterSpacing); tracking.setAttribute('aria-valuetext', trackingWord.textContent); _rapierDrawSeekSync(tracking); }
	const leading = surface.querySelector('#rapier-draw-text-leading-input'), leadingWord = surface.querySelector('#rapier-draw-text-leading-word');
	if (leading) { leading.value = String(Math.round(style.lineHeight * 100)); leadingWord.textContent = Math.round(style.lineHeight * 100) + '%'; leading.setAttribute('aria-valuetext', leadingWord.textContent); _rapierDrawSeekSync(leading); }
	const words = surface.querySelector('#rapier-draw-text-words-input'), wordsWord = surface.querySelector('#rapier-draw-text-words-word');
	if (words) { words.value = String(Math.round(style.wordSpacing * 100)); wordsWord.textContent = _rapierDrawTextSpacingWord(style.wordSpacing); words.setAttribute('aria-valuetext', wordsWord.textContent); _rapierDrawSeekSync(words); }
	for (const button of surface.querySelectorAll('[data-draw-text-case]')) button.setAttribute('aria-pressed', String(button.dataset.drawTextCase === style.textCase));
	for (const button of surface.querySelectorAll('[data-draw-text-figures]')) button.setAttribute('aria-pressed', String(button.dataset.drawTextFigures === style.textFigures));
	_rapierDrawSyncTextEffect();
}
// EFFECTS acts on the text in hand: with text selected it shows and sets that text's effect (one
// command, one Undo), and the next text takes the same; with none it is the next text's alone.
function _rapierDrawEffectTargets() { return _rapierDrawSelectedShapes().filter(shape => shape.recognized === 'text' && !shape.locked); }
function _rapierDrawSyncTextEffect() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="textFont"]');
	if (!panel) return;
	const targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	_rapierDrawSyncGardenColours(panel, targets, style);
	for (const button of panel.querySelectorAll('[data-draw-text-effect]')) {
		const id = button.dataset.drawTextEffect, on = targets.length ? targets.every(shape => shape.textEffect === id) : style.textEffect === id;
		button.setAttribute('aria-pressed', String(on));
		// The sample is drawn once in the default ink, which chrome writes as currentColor; a chosen
		// ink colours it through `color`, lifted for a dark theme the way every chrome sample is.
		const ink = _rapierDrawShapeInk({ ink: targets.at(-1)?.ink || state.ink }), dark = _rapierDrawDarkChrome() && typeof _rapierDeriveDarkColor === 'function';
		const sample = button.querySelector('.rapier-draw-glyph');
		if (sample && id !== 'garden') sample.style.color = ink === _rapierDrawShapeInk({}) ? '' : dark ? _rapierDeriveDarkColor(ink) : ink;
	}
}
// The garden's colour chips show only while the garden is on, and show the colour the next garden takes: the text in hand's own,
// else the default for the paper.
function _rapierDrawSyncGardenColours(panel, targets, style) {
	const on = targets.length ? targets.every(shape => shape.textEffect === 'garden') : style.textEffect === 'garden';
	for (const chip of panel.querySelectorAll('[data-draw-garden-colour]')) {
		const kind = chip.dataset.drawGardenColour, key = kind === 'flower' ? 'effectFlower' : 'effectStem', colour = _rapierDrawGardenColour(kind, targets.length ? targets.at(-1)[key] : style[key]);
		chip.hidden = !on;
		chip.querySelector('.rapier-draw-garden-dot').style.background = colour;
		const input = chip.querySelector('input'), held = (targets.length ? targets.at(-1)[key] : style[key]) || GARDEN_COLOURS[kind][0];
		if (input.value !== held) input.value = held;
	}
}
// A garden's seed is chosen once, by the first application, and kept; its colours are the next text's own when set.
function _rapierDrawPlantGarden(shape, style) {
	if (!Number.isInteger(shape.textEffectSeed)) shape.textEffectSeed = Math.floor(Math.random() * 1e9);
	for (const key of ['effectFlower', 'effectStem']) if (style[key] && !shape[key]) shape[key] = style[key];
}
function _rapierDrawSetGardenColour(scope, ink, continuous) {
	const state = _rapierDrawState, key = scope === 'flower' ? 'effectFlower' : 'effectStem', hex = _rapierDrawReadHex(ink);
	if (!hex || state.finishing) return;
	const targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	style[key] = hex;
	if (targets.length && !_rapierDrawSelectionLocked(targets) && targets.some(shape => shape[key] !== hex)) {
		if (_rapierDrawCommand(() => { for (const shape of _rapierDrawEffectTargets()) shape[key] = hex; }, !continuous || !state.colourEdit, !continuous) && continuous) state.colourEdit = true;
	}
	// A committed colour redraws the panel, so the chip's sample is drawn again by the canvas's own writer in it.
	if (!continuous) _rapierDrawRenderTextFontPanel();
	_rapierDrawSyncTextEffect();
}
function _rapierDrawToggleTextEffect(id) {
	const state = _rapierDrawState, targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	const on = !(targets.length ? targets.every(shape => shape.textEffect === id) : style.textEffect === id);
	style.textEffect = on ? id : '';
	if (targets.length) _rapierDrawCommand(() => { for (const shape of _rapierDrawEffectTargets()) { if (on) { shape.textEffect = id; if (id === 'garden') _rapierDrawPlantGarden(shape, style); } else delete shape.textEffect; } });
	_rapierDrawSyncTextEffect();
	return state;
}
function _rapierDrawSetTextDefault(key, value, asked = false) {
	if (key === 'textFont' && !asked && _rapierDrawLettersAsk(value, () => _rapierDrawSetTextDefault(key, value, true))) return;
	const state = _rapierDrawState, style = _rapierDrawTextDefaults();
	if (key === 'textSize') style.textSize = _rapierDrawClamp(Math.round(Number(value) || 24), 6, 512);
	else if (key === 'textFont' && (['sans', 'serif', 'mono'].includes(value) || _rapierDrawAvailableFonts().some(font => font.id === value) || _rapierDrawLetterFont(value))) style.textFont = value;
	else if (key === 'lineHeight') style.lineHeight = _rapierDrawClamp(Number(value) || 1.25, 1, 2.5);
	else if (key === 'letterSpacing') style.letterSpacing = _rapierDrawClamp(Number(value) || 0, -.2, .6);
	else if (key === 'wordSpacing') style.wordSpacing = _rapierDrawClamp(Number(value) || 0, -.2, 1);
	else if (['textBold', 'textItalic', 'textUnderline', 'textKern'].includes(key)) style[key] = !!value;
	else if (key === 'textCase' && RAPIER_DRAW_TEXT_CASES.some(([id]) => id === value)) style.textCase = value;
	else if (key === 'textFigures' && (!value || Object.hasOwn(RAPIER_DRAW_TEXT_FIGURES, value))) style.textFigures = value;
	else if (key === 'labelAlign' && ['start', 'middle', 'end'].includes(value)) style.labelAlign = value;
	_rapierDrawSyncTextPanels();
	if (key === 'textFont') { state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error')); }
}

function _rapierDrawEraseSoftness() { return _rapierDrawClamp(Math.round(Number(_rapierDrawState.eraseSoftness) || 0), 0, 100); }
function _rapierDrawEraseSoftnessWord(value = _rapierDrawEraseSoftness()) { return value < 18 ? 'Hard' : value > 78 ? 'Soft' : value < 50 ? 'Firm' : 'Feather'; }
function _rapierDrawSyncEraseEdge() {
	const row = _rapierDrawState.surface?.querySelector('.rapier-draw-erase-edge'); if (!row) return;
	const input = row.querySelector('input'), output = row.querySelector('output'), value = _rapierDrawEraseSoftness();
	input.value = String(value); output.textContent = _rapierDrawEraseSoftnessWord(value); input.setAttribute('aria-valuetext', output.textContent); _rapierDrawSeekSync(input);
	// The edge as it is set: a dab of the eraser, hard to soft, beside its word.
	row.style.setProperty('--rapier-erase-edge', String(value / 100));
}
function _rapierDrawSetEraseSoftness(value) {
	_rapierDrawState.eraseSoftness = _rapierDrawClamp(Math.round(Number(value) || 0), 0, 100);
	_rapierDrawRemember('eraseSoftness', _rapierDrawState.eraseSoftness);
	_rapierDrawSyncEraseEdge();
}
function _rapierDrawShapeScreenBox(shape) {
	const group = _rapierDrawState.svg?.querySelector('[data-shape-id="' + shape.id + '"]'), rect = group?.getBoundingClientRect();
	if (rect && (rect.width || rect.height)) return rect;
	const b = _rapierDrawShapeBBox(shape), svgRect = _rapierDrawState.svgRoot.getBoundingClientRect(), vb = _rapierDrawState.svgRoot.viewBox.baseVal;
	const [left, top] = _rapierDrawMapToScreen(b.minX, b.minY, svgRect, vb), [right, bottom] = _rapierDrawMapToScreen(b.maxX, b.maxY, svgRect, vb);
	return { left, right, top, bottom, width: right - left, height: bottom - top };
}
// ---- Display on dark paper -------------------------------------------------------------------
// The file keeps light-paper colours (every other viewer expects a black-ink SVG); the canvas, the
// live stroke, the ink dots and the glyphs are re-inked for display only, with the same derivation
// the document uses for an inserted drawing (images/browser.js presentUrl), so what you draw is
// what the page will show. Nothing here reaches the recipe or the SVG that is written.
// _rapierPaintSyncPaper projects the same ground: explicit white paper, otherwise the body's
// live background token. The person's Canvas choice beats automatic paper while painting.
// A chosen black canvas is black in either theme (the menu says black); otherwise the ground is the theme's.
function _rapierDrawDarkPaper() { return !_rapierDrawState.paper && (_rapierDrawState.recipe?.paper === 'black' || !document.body.classList.contains('light')); }
// The default ink is "the text colour": black on light paper, the theme's text white on dark
// paper. Chosen colours are derived the way coloured text is.
function _rapierDrawPaperInk() {
	// Black paper in the light theme: the dark theme's own text, the ink that ground is drawn for.
	if (_rapierDrawDarkPaper() && document.body.classList.contains('light')) return '#fafafa';
	const text = getComputedStyle(document.body).getPropertyValue('--color-text').trim();
	return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
}
function _rapierDrawDisplayInk(hex) {
	if (!_rapierDrawDarkPaper() || typeof _rapierDeriveDarkColor !== 'function' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
	const low = hex.toLowerCase();
	return low === _rapierDrawShapeInk({}) ? _rapierDrawPaperInk() || _rapierDeriveDarkColor(low) : _rapierDeriveDarkColor(low);
}
// A shape's markup keeps its light attributes on every paper: on dark paper the canvas's own style (below) turns
// them, so a diagram's grey boxes, quiet numbers and accent read on black as the page shows them.
// Resolve the display twin before serializing its large source. A twin may itself be a map key,
// so this view takes one hop only; its raster must never replace the recipe's or history's bytes.
function _rapierDrawDisplayShape(shape) {
	if (shape.recognized !== 'paint' || typeof _rapierPaintShownAs === 'undefined') return shape;
	const raster = _rapierPaintShownAs.get(shape.raster);
	return raster ? { ...shape, raster } : shape;
}
function _rapierDrawDisplayMarkup(html) {
	if (typeof _rapierPaintShowable === 'function') html = _rapierPaintShowable(html);
	return html;
}
// ---- The live canvas on dark paper wears the file's own dark rules ----------------------------------------
// The file carries its dark presentation as media-gated rules (core.mjs _rapierDrawDiagramDark: the approved
// diagram pairs, the words' contrast on a solid box, author colours, paint's filter). On dark paper the canvas wears
// the same rules, unconditional and scoped to itself, so what you draw is what the page shows (the founder, 29
// September, on the canvas toggle: "they become invisible and the style's all fucked up"). The colours are noted as
// each shape's markup is made, keyed the way the rules read them; the light attributes stay in the markup.
function _rapierDrawNoteColours(html) {
	const state = _rapierDrawState;
	if (!state.darkUsed) state.darkUsed = new Set();
	let grew = false;
	for (const entry of _rapierDrawUsedColours(html)) if (!state.darkUsed.has(entry)) { state.darkUsed.add(entry); grew = true; }
	if (!state.darkCurrentColor && html.includes('currentColor')) { state.darkCurrentColor = true; grew = true; }
	if (!state.darkPaint && html.includes('data-rapier-paint=')) { state.darkPaint = true; grew = true; }
	return grew;
}
function _rapierDrawDarkStyleSync() {
	const state = _rapierDrawState, style = state.svgRoot?.querySelector('.rapier-draw-dark');
	if (!style) return;
	if (!_rapierDrawDarkPaper() || !state.recipe) { if (style.textContent) style.textContent = ''; return; }
	const rules = _rapierDrawDarkRules(state.darkUsed || new Set(), state.recipe, { currentColor: !!state.darkCurrentColor, paint: !!state.darkPaint });
	const text = rules.map(rule => '.rapier-draw-canvas ' + rule).join('');
	if (style.textContent !== text) style.textContent = text;
}
// R85c. The CANVAS is lit by the paper (dark until a painting puts white paper under everything);
// the CHROME around it is lit by the THEME alone. The two rules above serve the canvas. A sample
// drawn for a chip -- a shape kind, a brush, a fill, a dash -- lives in the chrome, and drawn with
// the canvas's rule it went black on black the moment a painting existed: white paper, true black
// ink, dark chrome (the founder, on the phone: "shapes are invisible in dark mode except the
// selected one"). So a chrome sample writes the DEFAULT ink as currentColor -- the chip's own text
// colour, which is light on dark, dark on light, and inverted on the pressed chip -- and any chosen
// ink as itself, lifted for a dark theme the way the canvas lifts it.
function _rapierDrawDarkChrome() { return !document.body.classList.contains('light'); }
function _rapierDrawChromeMarkup(html) {
	if (!html) return html;
	const ink = _rapierDrawShapeInk({}), dark = _rapierDrawDarkChrome() && typeof _rapierDeriveDarkColor === 'function';
	return html.replace(/\b(fill|stroke|color|stop-color)="(#[0-9a-fA-F]{6})"/g, (match, attr, hex) => { const low = hex.toLowerCase(); return attr + '="' + (low === ink ? 'currentColor' : dark ? _rapierDeriveDarkColor(low) : low) + '"'; });
}

// ---- Glyphs: the drawing engine draws its own icons ----------------------------------------
// A shape kind, a brush, a fill or a dash is shown as itself: the same markup writer that paints
// the canvas paints a 40-unit sample, so the picker can never disagree with the result.
const _rapierDrawGlyphCache = new Map();
function _rapierDrawGlyph(shape, strokes = []) {
	// A sample is chrome: keyed and coloured by the theme, never by the paper (R85c, above).
	const key = JSON.stringify([shape, strokes.length, _rapierDrawDarkChrome()]);
	const cached = _rapierDrawGlyphCache.get(key);
	if (cached != null) return cached;
	let svg = '';
	try {
		const recipe = _rapierDrawAdmitRecipe({ version: RAPIER_DRAW_VERSION, canvas: { w: 40, h: 40 }, strokes, shapes: [shape] });
		if (recipe) svg = '<svg class="rapier-draw-glyph" viewBox="0 0 40 40" aria-hidden="true">' + _rapierDrawChromeMarkup(_rapierDrawSceneMarkup(recipe, false)) + '</svg>';
	} catch (_) { svg = ''; }
	if (_rapierDrawGlyphCache.size > 200) _rapierDrawGlyphCache.clear();
	_rapierDrawGlyphCache.set(key, svg);
	return svg;
}
function _rapierDrawKindGlyph(kind, extra = {}) {
	let geom;
	if (kind === 'arc') geom = { cx: 20, cy: 26, r: 14, a0: Math.PI, a1: Math.PI * 2 };
	else if (kind === 'line' || kind === 'arrow') geom = _rapierDrawShapeFromDrag(kind, [7, 31], [33, 9], { ignore: true });
	else if (kind === 'circle') geom = _rapierDrawShapeFromDrag(kind, [7, 7], [33, 33], { ignore: true });
	else geom = _rapierDrawShapeFromDrag(kind, [6, 9], [34, 31], { ignore: true });
	if (!geom) return '';
	const shape = { id: 'g', recognized: kind, geom, stroke: null, brush: 'ink', asDrawn: false, style: _rapierDrawDefaultStyle(kind), ...extra };
	for (const k of Object.keys(shape)) if (shape[k] === undefined) delete shape[k];
	return _rapierDrawGlyph(shape);
}
const RAPIER_DRAW_GLYPH_WAVE = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return [5 + 30 * t, Math.round((21 + 7 * Math.sin(t * Math.PI * 1.6)) * 10) / 10, i * 12]; });
function _rapierDrawBrushGlyph(kind, brush, like = {}) {
	if (kind === 'ink') return _rapierDrawGlyph({ id: 'g', stroke: 0, recognized: 'ink', asDrawn: true, brush, style: null, geom: null, nib: like.nib ?? RAPIER_DRAW_NIB_DEFAULT }, [{ pts: RAPIER_DRAW_GLYPH_WAVE }]);
	return _rapierDrawKindGlyph(kind, { brush, style: like.style || _rapierDrawDefaultStyle(kind) });
}
function _rapierDrawKindWord(kind) { return (RAPIER_DRAW_SHAPE_KINDS.find(([id]) => id === kind)?.[1] || kind).toLowerCase(); }

// ---- Chips -----------------------------------------------------------------------------------
function _rapierDrawChipMarkup(act, body, value, active, kind, extra) {
	const deletion = kind === 'icon' ? act === 'delete' : !kind && act.includes('delete');
	return '<button type="button" class="rapier-draw-chip' + (kind ? ' rapier-draw-chip--' + kind : '') + (active ? ' rapier-draw-chip--active' : '') + (deletion ? ' rapier-draw-chip--delete' : '') +
		'" data-draw-menu-act="' + act + '" data-draw-value="' + value + '"' + extra + '>' + body + '</button>';
}
function _rapierDrawChipLabel(label) {
	return ' aria-label="' + _rapierDrawEscapeAttr(label) + '" data-tip="' + _rapierDrawEscapeAttr(label.toLowerCase()) + '"';
}
function _rapierDrawChip(act, word, value = '', active = false, extra = '') {
	return _rapierDrawChipMarkup(act, word, value, active, '', extra);
}
function _rapierDrawIconChip(act, icon, label, value = '', active = false, extra = '') {
	return _rapierDrawChipMarkup(act, RAPIER_DRAW_ICONS[icon], value, active, 'icon', _rapierDrawChipLabel(label) + extra);
}
function _rapierDrawGlyphChip(act, glyph, label, value = '', active = false, extra = '') {
	return _rapierDrawChipMarkup(act, glyph, value, active, 'glyph', _rapierDrawChipLabel(label) + ' aria-pressed="' + !!active + '"' + extra);
}
// R84, the founder's design of R80, written down then and built now: a colour dropper and a memory
// of the colours already used. Both live ON THE COLOUR ROW rather than as tools, for the one reason
// `intent.md` gives -- exactly one tool is active -- so picking a colour off your own picture is one
// tap in and one tap out and you never leave Brush.
const RAPIER_DRAW_RECENT_KEY = 'rapier:draw.recentinks', RAPIER_DRAW_RECENT_MAX = 10;
// What may be remembered: a plain hex colour, which is all the operating system's picker and the
// dropper ever produce. Checked here rather than borrowed from the core's own ink admission, which
// also accepts the named ids -- and a named ink is already on the row, so remembering one would
// spend a slot on a colour that was never lost.
const _rapierDrawHexInk = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
function _rapierDrawReadHex(value) {
	const digits = String(value || '').trim().replace(/^#/, '');
	if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(digits)) return null;
	return '#' + (digits.length === 3 ? [...digits].map(c => c + c).join('') : digits).toLowerCase();
}
function _rapierDrawRecentInks() {
	const state = _rapierDrawState;
	if (state.recentInks) return state.recentInks;
	let rows = [];
	try { const raw = localStorage.getItem(RAPIER_DRAW_RECENT_KEY); if (raw) rows = JSON.parse(raw); } catch (_) { rows = []; }
	state.recentInks = Array.isArray(rows) ? rows.filter(_rapierDrawHexInk).slice(0, RAPIER_DRAW_RECENT_MAX) : [];
	return state.recentInks;
}
// Most recent first, deduplicated by exact value, ten deep, this device only. A named swatch is
// already on the row, so remembering it again would spend one of the ten on something never lost --
// black and white (R86g law 6) are permanent swatches too, carried as plain hex rather than a named
// id, so they are excluded here by the same rule rather than by format alone.
const RAPIER_DRAW_PERMANENT_HEX = new Set(['#000000', '#ffffff']);
function _rapierDrawRememberInk(value) {
	value = _rapierDrawReadHex(value);
	if (!value || RAPIER_DRAW_PERMANENT_HEX.has(value)) return;
	const rows = _rapierDrawRecentInks().filter(row => row.toLowerCase() !== String(value).toLowerCase());
	rows.unshift(value);
	rows.length = Math.min(rows.length, RAPIER_DRAW_RECENT_MAX);
	_rapierDrawState.recentInks = rows;
	try { localStorage.setItem(RAPIER_DRAW_RECENT_KEY, JSON.stringify(rows)); } catch (_) {}
	_rapierPersonal.rememberDrawing('recentInks', JSON.stringify(rows));
}
function _rapierDrawPalette(ink, scope) {
	// Under Raster Brush the tool's own default is the accent (R85), so the first swatch after the
	// permanent black and white (R86g law 6) IS the accent and is the pressed one until a
	// colour is chosen; every other tool's first swatch after black and white is the paper's ink.
	const accent = scope === 'next' && _rapierDrawTool() === 'paint' ? _rapierDrawAccentInk() : null;
	const words = [['#000000', 'Black'], ['#ffffff', 'White'], accent ? [accent, 'Accent'] : [scope === 'border' ? '#121212' : '', 'Default'], ...RAPIER_DRAW_INK_ORDER.map(id => [id, RAPIER_DRAW_INK_LABEL[id]])];
	const hex = _rapierDrawShapeInk({ ink });
	return '<span class="rapier-draw-colour-editor" data-draw-colour-scope="' + scope + '">' +
		'<label class="rapier-draw-colour-custom" title="Choose any colour"><input type="color" aria-label="Choose any colour" value="' + hex + '" data-draw-colour="' + scope + '"></label>' +
		'<input class="rapier-draw-colour-hex" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" aria-label="Hex colour" value="' + hex.toUpperCase() + '" data-draw-hex="' + scope + '">' +
		'<button type="button" class="rapier-draw-swatch rapier-draw-colour-copy" data-draw-colour-copy="' + scope + '" aria-label="Copy hex colour"><span class="rapier-draw-dropper-glyph">' + RAPIER_DRAW_ICONS.copy + '</span><span class="rapier-draw-dropper-glyph rapier-draw-dropper-glyph--done">' + RAPIER_DRAW_ICONS.check + '</span></button>' +
		'<button type="button" class="rapier-draw-swatch rapier-draw-swatch--dropper" data-draw-act="dropper" data-draw-colour-scope="' + scope + '" aria-label="Pick a colour off the drawing" data-tip="pick">' + RAPIER_DRAW_ICONS.dropper + '</button></span>' +
		'<span class="rapier-draw-palette" data-draw-palette="' + scope + '">' +
		(scope === 'border' ? '<button type="button" class="rapier-draw-swatch" data-draw-colour-value="" data-draw-colour-scope="border" aria-label="None" data-tip="none" aria-pressed="' + !ink + '">' + RAPIER_DRAW_ICONS.none + '</button>' : '') +
		words.map(([id, label]) => '<button type="button" class="rapier-draw-swatch" data-draw-colour-value="' + id + '" data-draw-colour-scope="' + scope + '" aria-label="' + label + '" data-tip="' + label.toLowerCase() + '" aria-pressed="' + ((ink || '').toLowerCase() === id.toLowerCase()) + '"><span style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: id })) + '"></span></button>').join('') +
		_rapierDrawRecentInks().map(value => '<button type="button" class="rapier-draw-swatch rapier-draw-swatch--recent" data-draw-colour-value="' + _rapierDrawEscapeAttr(value) + '" data-draw-colour-scope="' + scope + '" aria-label="Recent colour ' + _rapierDrawEscapeAttr(value) + '" data-tip="recent" aria-pressed="' + ((ink || '').toLowerCase() === value.toLowerCase()) + '"><span style="background:' + _rapierDrawDisplayInk(value) + '"></span></button>').join('') + '</span>';
}
// The colour row rebuilds in place, so a new recent shows the moment it is earned.
function _rapierDrawRefreshColourRow() {
	const state = _rapierDrawState, row = state.surface?.querySelector('.rapier-draw-colours');
	if (row && state.colourOpen && !row.hidden) row.innerHTML = _rapierDrawPalette(state.ink, 'next');
}
// The dropper, exactly as the founder drew it: "the pop-up temporarily disappears to reveal your full
// canvas ... you can drag your finger over and watch as the color changes in a little pop-up, the
// sampled color, visibly, until you're happy ... then you press done."
//
// The browser's own EyeDropper is desktop-Chromium only and samples the SCREEN, so it is no use to a
// phone. Rapier samples ITS OWN STAGE instead: the drawing's portable SVG -- the same bytes Share
// hands out, so a painting's pixels and a vector's fill are sampled alike -- is rasterised ONCE when
// the dropper opens and read under the finger on every move. No permission, no platform dependency,
// and a move costs one array read.
const RAPIER_DRAW_DROPPER_LIFT = 56;
async function _rapierDrawOpenDropper(scope) {
	const state = _rapierDrawState, surface = state.surface, svg = state.svgRoot;
	// ZA3 F3: reopening while closing, or while another sampler already owns the canvas, is refused
	// outright, and any live gesture is cancelled first -- sampling is read-only, never a paint stroke.
	if (!state.open || state.finishing || !surface || !svg || state.dropper) return;
	_rapierDrawCancelGesture();
	surface.focus({ preventScroll: true });
	// `drawing`: this opening's own session token, so a decode that outlives a close/reopen can tell
	// (state.session is reused by the NEXT drawing the moment this one closes).
	const drawing = state.session, stage = surface.querySelector('.rapier-draw-stage') || svg.parentElement || surface;
	const row = surface.querySelector('.rapier-draw-colours'), wasOpen = state.colourOpen, previousInk = state.ink, previousChosen = state.inkChosen;
	let sheet, pad = null, move = null, picked = '', pointer = null;
	const close = keep => {
		if (state.dropper !== session) return;
		state.dropper = null;
		surface.classList.remove('rapier-draw-sampling');
		pad?.remove();
		if (move) for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) svg.removeEventListener(type, move);
		if (pointer != null) { try { svg.releasePointerCapture(pointer); } catch (_) {} pointer = null; }
		if (!state.open || state.session !== drawing) return;
		surface.focus({ preventScroll: true });
		state.colourOpen = wasOpen;
		if (keep && picked) _rapierDrawChooseColour(scope, picked);
		else {
			if (scope === 'next') { state.ink = previousInk; state.inkChosen = previousChosen; }
			_rapierDrawUpdateInkBtn(); _rapierPaintUpdateStrip(); _rapierDrawUpdateMenu();
		}
	};
	// Sampling owns the canvas from this reservation, not only once the image has decoded: a late
	// decode of a closed sampler, or one from a drawing that has since closed, must not mount a pad
	// or move colours in whatever is open now.
	const session = { close };
	state.dropper = session;
	surface.classList.add('rapier-draw-sampling');
	if (row) row.hidden = true;
	try {
		// Whatever is still wet or over budget belongs in the sample too (ZA3 F3): the founder drew
		// the dropper as reading exactly what the canvas shows, not the last committed picture.
		_rapierPaintSettleOverflow();
		_rapierPaintFlushRevision();
		const text = _rapierPaintShowable(_rapierDrawBuildSVG(state.recipe, _rapierDrawMeasuredView, true));
		const image = new Image();
		image.src = 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(text));
		await image.decode();
		if (state.dropper !== session || !state.open || state.session !== drawing) { close(false); return; }
		// Hiding the palette above changes the stage; its geometry is read only after that layout
		// settles and the decode completes, never before (ZA3 F3).
		const rect = svg.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(rect.width * dpr)); c.height = Math.max(1, Math.round(rect.height * dpr));
		const ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.fillStyle = _rapierDrawReplayPaper(); ctx.fillRect(0, 0, 1, 1);
		const paper = ctx.getImageData(0, 0, 1, 1).data;
		ctx.clearRect(0, 0, 1, 1);
		// The portable SVG's view is cropped to its ink (core.mjs _rapierDrawSerializeSVG), so it is laid
		// back exactly where that ink stands on the stage -- the crop's corners through the drawing's own
		// screen transform -- and the finger reads the colour it is on, not a stretched copy of the drawing.
		const view = (/viewBox="([^"]+)"/.exec(text)?.[1] || '').trim().split(/[\s,]+/).map(Number), ctm = svg.getScreenCTM(), v = svg.viewBox.baseVal;
		if (view.length !== 4 || !view.every(Number.isFinite) || !ctm) throw new Error('the drawing has no place on the stage');
		const a = new DOMPoint(view[0], view[1]).matrixTransform(ctm), b = new DOMPoint(view[0] + view[2], view[1] + view[3]).matrixTransform(ctm);
		ctx.drawImage(image, (a.x - rect.left) * dpr, (a.y - rect.top) * dpr, (b.x - a.x) * dpr, (b.y - a.y) * dpr);
		sheet = { rect, dpr, paper, view: [v.x, v.y, v.width, v.height], data: ctx.getImageData(0, 0, c.width, c.height) };
	} catch (error) {
		if (state.dropper === session) { close(false); showToast('That drawing could not be sampled: ' + String(error.message || error), 'error'); }
		return;
	}
	pad = document.createElement('div');
	pad.className = 'rapier-draw-dropper';
	// The afternoon list, law 9 (the founder, 25 September 2026: "an easy and minimalistic way to copy the
	// hex code of the colour they're sampling ... so rapier can be used as a hex code finder tool also"):
	// sampled, the bar's main word is the colour as #RRGGBB beside a chip of it, and that word is the one
	// tap that copies it (_rapierDrawCopyHex); the bar itself says the copy (its glyph turns to the editor's
		// check) or the refusal. Confirmation names its effect on the active colour.
	pad.innerHTML = '<span class="rapier-draw-dropper-swatch" aria-hidden="true" hidden></span>' +
		'<div class="rapier-draw-dropper-bar">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-dropper-hex" data-draw-dropper="copy" hidden><span class="rapier-draw-dropper-chip" aria-hidden="true"></span><span class="rapier-draw-dropper-code"></span>' +
		'<span class="rapier-draw-dropper-glyph">' + RAPIER_DRAW_ICONS.copy + '</span><span class="rapier-draw-dropper-glyph rapier-draw-dropper-glyph--done">' + RAPIER_DRAW_ICONS.check + '</span></button>' +
		'<span class="rapier-draw-dropper-say" role="status">Touch a colour</span>' +
		'<button type="button" class="rapier-draw-btn" data-draw-dropper="cancel">Cancel</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--done" data-draw-dropper="done" disabled>Use colour</button></div>';
	stage.appendChild(pad);
	const swatch = pad.querySelector('.rapier-draw-dropper-swatch'), say = pad.querySelector('.rapier-draw-dropper-say');
	const copy = pad.querySelector('.rapier-draw-dropper-hex'), chip = pad.querySelector('.rapier-draw-dropper-chip'), code = pad.querySelector('.rapier-draw-dropper-code');
	const use = pad.querySelector('[data-draw-dropper="done"]');
	const sample = (clientX, clientY) => {
		const { rect, dpr, paper, data } = sheet, now = svg.getBoundingClientRect(), v = svg.viewBox.baseVal;
		// ZA3 F3: the stage moved (a resize, an orientation change, a zoom) since the sheet was
		// rasterised -- the captured pixels no longer sit where the finger reads them from.
		if (['left', 'top', 'width', 'height'].some(key => now[key] !== rect[key]) || [v.x, v.y, v.width, v.height].some((n, i) => n !== sheet.view[i])) {
			close(false); showToast('The canvas moved. Open the colour sampler again.', 'info'); return;
		}
		const x = Math.round((clientX - rect.left) * dpr), y = Math.round((clientY - rect.top) * dpr);
		if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
		const i = (y * data.width + x) * 4, a = data.data[i + 3] / 255;
		// The colour on the paper, not full-strength pigment hidden in a partly transparent pixel.
		const hex = '#' + [0, 1, 2].map(k => Math.round(data.data[i + k] * a + paper[k] * (1 - a)).toString(16).padStart(2, '0')).join('');
		picked = hex;
		// Next ink is a reversible tool preference. Selection changes wait for confirmation so a
		// drag over many pixels becomes exactly one artwork edit, with one Undo step.
		if (scope === 'next') _rapierDrawSetColour(scope, picked, true);
		use.disabled = false;
		swatch.style.background = hex;
		const word = hex.toUpperCase();
		say.hidden = true; copy.hidden = false; delete copy.dataset.copied; chip.style.background = hex; code.textContent = word;
		copy.setAttribute('aria-label', 'Copy ' + word);
		// Above the touch, never under it: a finger hides what it is pointing at.
		swatch.style.left = _rapierDrawClamp(clientX - rect.left, 24, rect.width - 24) + 'px';
		swatch.style.top = Math.max(24, clientY - rect.top - RAPIER_DRAW_DROPPER_LIFT) + 'px';
		swatch.hidden = false;
	};
	// ZA3 F3: one pointer, captured, across down/move/up/cancel -- the base's plain listeners left the
	// sampler's own gesture untracked, so a second finger or a stray move from elsewhere could sample.
	move = evt => {
		if (state.dropper !== session) return;
		if (evt.type === 'pointerdown') {
			if (pointer != null || evt.pointerType === 'mouse' && evt.button !== 0) return;
			pointer = evt.pointerId; try { svg.setPointerCapture(pointer); } catch (_) {}
		} else if (evt.pointerId !== pointer) return;
		evt.preventDefault(); evt.stopPropagation();
		if (evt.type !== 'pointercancel' && evt.type !== 'lostpointercapture') sample(evt.clientX, evt.clientY);
		if ((evt.type === 'pointerup' || evt.type === 'pointercancel' || evt.type === 'lostpointercapture') && pointer != null) {
			const id = pointer; pointer = null; try { svg.releasePointerCapture(id); } catch (_) {}
		}
	};
	for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(type, move);
	_rapierDrawBindTap(pad, evt => {
		const act = evt.target.closest('[data-draw-dropper]')?.dataset.drawDropper;
		if (!act) return;
		evt.preventDefault(); evt.stopPropagation();
		// A copy leaves the person sampling: the next colour is one drag away.
		if (act === 'copy') { if (picked) void _rapierDrawCopyHex(picked.toUpperCase(), copy, say); return; }
		close(act === 'done');
	});
}
// The hex, through the editor's own clipboard door (the app's bridge, then the browser's, then the page's
// copy), and said. A page whose clipboard refuses (a file:// or content:// page may) is told so, and the
// hex stays in the bar to be read off; it is never told the copy worked. The bar says it where the finger
// is -- the copy glyph turns to the editor's check for a moment, or the hint says the refusal -- because
// every page notice waits while Draw is up (layout/bottom-surfaces.json draw-surface: "a document toast
// cannot take taps from the drawing"; docs/transient-reachability.md "When there is no room"); the toast
// is the page's record of it, shown when Draw gives it room.
const RAPIER_DRAW_COPIED_MS = 1600;
async function _rapierDrawCopyHex(hex, button, say) {
	let ok = false;
	try { ok = await _rapierWriteTextClipboard(hex); } catch (_) { ok = false; }
	if (button?.isConnected) {
		clearTimeout(button._rapierCopied);
		button.dataset.copied = ok ? 'yes' : 'no';
		button.setAttribute('aria-label', (ok ? 'Copied ' : 'Could not copy ') + hex);
		if (say) { say.textContent = ok ? '' : 'Could not copy'; say.hidden = ok; }
		if (ok) button._rapierCopied = setTimeout(() => { if (button.dataset.copied === 'yes') { delete button.dataset.copied; button.setAttribute('aria-label', 'Copy ' + hex); } }, RAPIER_DRAW_COPIED_MS);
	}
	showToast(ok ? 'Copied ' + hex : 'Could not copy ' + hex + ': the clipboard refused', ok ? 'success' : 'error');
}
// R85c: a numeric property in the style sheet is a seek slider, the same control the Text tool's
// own row has (the founder: text size "should just be a slider that goes through integers"). The
// word beside it is written by these, live while the finger moves; the value lands on release.
const RAPIER_DRAW_PROP_WORD = {
	textSize: v => String(Math.round(Number(v))),
	lineHeight: v => 'x' + Number(v).toFixed(2).replace(/\.?0+$/, ''),
	letterSpacing: v => (Number(v) > 0 ? '+' : '') + Math.round(Number(v) * 100) + '%',
	wordSpacing: v => (Number(v) > 0 ? '+' : '') + Math.round(Number(v) * 100) + '%',
	inner: v => Math.round(Number(v) * 100) + '%',
	transparency: v => Math.round(Number(v) * 100) + '%'
};
// Transparency is the person's word (the founder, 27 September 2026); the recipe keeps its opposite, `opacity`.
function _rapierDrawTransparency(shape) { return Math.round((1 - (shape.opacity ?? 1)) * 100) / 100; }
function _rapierDrawSeekControl(name, word, min, max, step, value) {
	const id = 'rapier-draw-prop-' + name, say = RAPIER_DRAW_PROP_WORD[name] || String;
	return '<label class="rapier-draw-control rapier-draw-control--seek">' + word + '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + _rapierDrawEscapeAttr(String(value)) + '" data-draw-property="' + name + '" aria-label="' + word + '"><output class="rapier-draw-nib-word" for="' + id + '">' + say(value) + '</output></label>';
}
// A finite choice uses the Look row's chips and the existing property command. Uploaded fonts
// keep their own names; changing the control never changes recipe admission, history or SVG.
function _rapierDrawChoiceControl(name, word, entries, value, glyph) {
	return '<span class="rapier-draw-menu-row rapier-draw-glyph-row" data-draw-property-row="' + name + '" role="group" aria-label="' + word + '"><span class="rapier-draw-chip-head">' + word + '</span>' + entries.map(([id, text]) => {
		const active = String(id) === String(value), val = _rapierDrawEscapeAttr(String(id)), extra = ' data-draw-property="' + name + '" style="flex:none"';
		const sample = glyph && glyph(id);
		return sample ? _rapierDrawGlyphChip('property', sample, text, val, active, extra)
			: _rapierDrawChip('property', _rapierDrawEscapeAttr(text), val, active, extra + ' aria-pressed="' + active + '"');
	}).join('') + '</span>';
}
function _rapierDrawUpdateMenu() {
	const state = _rapierDrawState, menu = state.menu, shapes = _rapierDrawSelectedShapes(), shape = shapes.at(-1);
	if (!menu) return;
	if (_rapierDrawTool() !== 'select' || !shape || state.textEdit || state.gesture?.changed || state.marquee) { menu.hidden = true; menu.classList.remove('rapier-draw-menu--sheet'); if (!shape) menu.innerHTML = ''; return; }
	const pane = state.menuPane, group = shapes.length > 1, brush = shape.brush || 'ink', locked = _rapierDrawSelectionLocked(shapes);
	const text = shape.recognized === 'text', paint = shape.recognized === 'paint', arrow = !group && ['line', 'arrow'].includes(shape.recognized);
	const stroke = _rapierDrawShapeStroke(shape, state.recipe), paintsInk = _rapierDrawShapePaintsInk(shape, state.recipe);
	const pressed = on => ' aria-pressed="' + !!on + '"';
	// Compact row: icons only. A stroke the recognizer understood offers its clean shape as the
	// shape itself ("Make it a circle"), never applied unasked; a recognised shape that still
	// carries its stroke can go back to the brush ("As drawn").
	let html = '<span class="rapier-draw-menu-row">' + (group ? '<span class="rapier-draw-menu-count">' + shapes.length + '</span>' : '');
	if (locked) html += _rapierDrawIconChip('edit', 'unlock', 'Unlock', 'unlock');
	else {
		if (!group && !text && stroke && shape.recognized !== 'ink') {
			const word = _rapierDrawKindWord(shape.recognized);
			html += shape.asDrawn
				? _rapierDrawGlyphChip('toggle-ink', _rapierDrawKindGlyph(shape.recognized), 'Make it a' + (/^[aeiou]/.test(word) ? 'n ' : ' ') + word)
				: _rapierDrawIconChip('toggle-ink', 'brush', 'As drawn');
		}
		html += _rapierDrawIconChip('pane', 'sliders', 'Style', pane ? '' : text ? 'text' : 'look', !!pane, ' aria-expanded="' + !!pane + '"') +
			(group ? '' : _rapierDrawIconChip('label', 'type', text ? 'Edit text' : 'Label')) + _rapierDrawIconChip('copy', 'copy', 'Copy') + _rapierDrawIconChip('delete', 'trash', 'Delete');
	}
	html += '</span>';
	const sheet = !!(pane && !locked);
	if (sheet) {
		const tabs = [['look', 'Look'], ['size', 'Size'], ['text', 'Text'], ...(arrow ? [['path', 'Path']] : []), ['arrange', 'Arrange']];
		html += '<span class="rapier-draw-menu-row rapier-draw-tabs" role="tablist">' + tabs.map(([id, word]) => _rapierDrawChip('pane', word, id, pane === id, ' role="tab" aria-selected="' + (pane === id) + '"')).join('') + '</span><span class="rapier-draw-menu-row rapier-draw-pane">';
		if (pane === 'look') {
			const border = shapes.every(_rapierDrawBorderActive), borderInk = shape.authorStyle?.stroke || shape.border;
			if (!border && state.menuColour === 'border') state.menuColour = false;
			html += '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon' + (state.menuColour === true ? ' rapier-draw-chip--active' : '') + '" data-draw-menu-act="colour" aria-label="Colour" data-tip="colour" aria-expanded="' + (state.menuColour === true) + '"><span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk(shape)) + '"></span></button>';
			if (border) html += '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon' + (state.menuColour === 'border' ? ' rapier-draw-chip--active' : '') + '" data-draw-menu-act="border" aria-label="Border" data-tip="border" aria-expanded="' + (state.menuColour === 'border') + '">' + (borderInk ? '<span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: borderInk })) + '"></span>' : RAPIER_DRAW_ICONS.none) + '</button>';
			if (!text && !paint) html += _rapierDrawIconChip('width', 'width', 'Width') + (paintsInk && brush === 'ink' ? _rapierDrawIconChip('smooth', 'smooth', 'Smooth') : '');
			if (state.menuColour) html += state.menuColour === 'border' ? _rapierDrawPalette(borderInk, 'border') : _rapierDrawPalette(shape.authorStyle ? _rapierDrawShapeInk(shape) : shape.ink, 'selection');
			if (!group && !text && !paint) {
				const editable = !shape.asDrawn && shape.recognized !== 'ink';
				// Brushes: a stroke painted as drawn takes the ink brushes (the real brush, spring,
				// rope, tube, ray, light); a recognised figure takes the brushes for its kind, and
				// every kind can go back to a freehand brush look. All shown as themselves.
				const brushes = paintsInk ? _rapierDrawBrushesFor('ink') : editable ? _rapierDrawBrushesFor(shape.recognized, shape.stroke != null) : [];
				if (brushes.length > 1) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + brushes.map(id => _rapierDrawGlyphChip('brush', _rapierDrawBrushGlyph(paintsInk ? 'ink' : shape.recognized, id, shape), RAPIER_DRAW_BRUSH_LABEL[id], id, brush === id)).join('') + '</span>';
				if (editable && brush === 'ink') {
					const styles = arrow ? [['plain', 'Line'], ['arrow', 'Arrow'], ['dimension', 'Dimension']] : shape.recognized === 'arc' ? [] : [['outline', 'Outline'], ['hatch', 'Hatch'], ['stipple', 'Stipple'], ['solid', 'Solid']];
					if (styles.length) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + styles.map(([id, word]) => _rapierDrawGlyphChip('style', _rapierDrawKindGlyph(arrow ? 'arrow' : 'rect', { style: id }), word, id, shape.style === id)).join('') + '</span>';
					// L01: shown only when the shared capability table (draw/core.mjs
					// _rapierDrawDashActive) says the renderer actually draws dash for this shape as
					// currently configured -- the same table set_look's own admission refuses against.
					if (_rapierDrawDashActive(shape)) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + [['', 'Solid line'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([id, word]) => _rapierDrawGlyphChip('dash', _rapierDrawKindGlyph('line', { dash: id || undefined }), word, id, (shape.dash || '') === id)).join('') + '</span>';
				}
			}
			html += _rapierDrawSeekControl('transparency', 'Transparency', 0, .95, .01, _rapierDrawTransparency(shape));
		} else if (pane === 'size') {
			html += _rapierDrawIconChip('bigger', 'bigger', 'Bigger') + _rapierDrawIconChip('smaller', 'smaller', 'Smaller') + _rapierDrawIconChip('turn', 'turn', 'Turn') +
				(!group && !['circle', 'arc'].includes(shape.recognized) ? _rapierDrawIconChip('proportions', 'proportions', 'Keep proportions', '', !!state.proportions, pressed(state.proportions)) : '') +
				_rapierDrawIconChip('center', 'center', 'Resize from centre', '', !!state.resizeFromCenter, pressed(state.resizeFromCenter));
			if (shape.geom && ['line', 'arrow', 'triangle'].includes(shape.recognized)) html += _rapierDrawIconChip('angle', 'angle', 'Show angle', '', !!shape.angle, pressed(shape.angle));
			if (arrow) html += _rapierDrawIconChip('len', 'ruler', 'Show length', '', !!shape.len, pressed(shape.len));
			if (!group && shape.recognized === 'star') html += _rapierDrawSeekControl('inner', 'Star inset', .2, .7, .05, shape.geom.inner || .45);
		} else if (pane === 'text') {
			if (!group) html += _rapierDrawIconChip('label', 'type', shape.label ? 'Edit text' : 'Add text');
			const size = shape.textSize || (text ? 24 : 14);
			html += _rapierDrawSeekControl('textSize', 'Size', RAPIER_DRAW_TEXT_SIZE_MIN, Math.max(RAPIER_DRAW_TEXT_SIZE_MAX, size), 1, size) +
				_rapierDrawFontControls(shape, true, shapes.every(item => item.recognized === 'text'));
			html += '<span class="rapier-draw-menu-row">' + [['textBold', 'bold', 'Bold'], ['textItalic', 'italic', 'Italic'], ['textUnderline', 'underline', 'Underline']].map(([id, icon, word]) => _rapierDrawIconChip('text-toggle', icon, word, id, !!shape[id], pressed(shape[id]))).join('') +
				'<span class="rapier-draw-menu-gap"></span>' + [['start', 'align-left', 'Align left'], ['middle', 'align-center', 'Centre'], ['end', 'align-right', 'Align right']].map(([id, icon, word]) => _rapierDrawIconChip('text-align', icon, word, id, (shape.labelAlign || (text ? 'start' : 'middle')) === id, pressed((shape.labelAlign || (text ? 'start' : 'middle')) === id))).join('') + '</span>';
			if (!group && !text && !arrow && shape.recognized !== 'arc') {
				html += '<span class="rapier-draw-menu-row">' + _rapierDrawIconChip('toggle-label-in', shape.labelIn ? 'label-in' : 'label-out', shape.labelIn ? 'Text inside (tap for outside)' : 'Text outside (tap for inside)', '', !!shape.labelIn, pressed(shape.labelIn));
				if (shape.labelIn) html += '<span class="rapier-draw-menu-gap"></span>' + [['top', 'valign-top', 'Top'], ['middle', 'valign-middle', 'Middle'], ['bottom', 'valign-bottom', 'Bottom']].map(([id, icon, word]) => _rapierDrawIconChip('text-valign', icon, word, id, (shape.labelVAlign || 'middle') === id, pressed((shape.labelVAlign || 'middle') === id))).join('');
				html += '</span>';
			}
			if (!group && text) html += _rapierDrawIconChip('text-wrap', 'wrap', shape.geom.w ? 'Wrapping (tap for auto width)' : 'Auto width (tap to wrap)', '', !!shape.geom.w, pressed(shape.geom.w));
			const tracking = shape.letterSpacing || 0;
			html += _rapierDrawSeekControl('lineHeight', 'Leading', 1, 2, .05, shape.lineHeight || 1.25) +
				_rapierDrawSeekControl('letterSpacing', 'Tracking', -.2, .6, .01, tracking) +
				_rapierDrawSeekControl('wordSpacing', 'Word spacing', -.2, 1, .01, shape.wordSpacing || 0);
			html += _rapierDrawChoiceControl('textCase', 'Case', RAPIER_DRAW_TEXT_CASES.map(([id, , word]) => [id, word]), shape.textCase || '') +
				_rapierDrawChoiceControl('textKern', 'Kerning', [['on', 'On'], ['off', 'Off']], shape.textKern === false ? 'off' : 'on');
			const figures = _rapierDrawFontFigures(shape.textFont || 'sans', state.recipe.fonts);
			if (figures.length) html += _rapierDrawChoiceControl('textFigures', 'Figures', [['', 'Default'], ...figures.map(id => [id, RAPIER_DRAW_TEXT_FIGURES[id]])], shape.textFigures || '');
		} else if (pane === 'path' && arrow) {
			html += _rapierDrawChoiceControl('route', 'Route', [['straight', 'Straight'], ['curved', 'Curved'], ['elbow', 'Elbow'], ['auto', 'Avoid shapes']], shape.route || 'straight', id => id === 'auto' ? '' : _rapierDrawKindGlyph('arrow', { route: id, bend: id === 'curved' ? 8 : undefined }));
			const heads = [['none', 'None'], ['arrow', 'Open arrow'], ['triangle', 'Triangle'], ['dot', 'Dot'], ['diamond', 'Diamond'], ['bar', 'Bar']];
			html += _rapierDrawChoiceControl('headStart', 'Start', heads, shape.headStart || (shape.style === 'dimension' ? 'triangle' : 'none'), id => _rapierDrawKindGlyph('arrow', { headStart: id, headEnd: 'none' })) + _rapierDrawChoiceControl('headEnd', 'End', heads, shape.headEnd || (shape.style === 'plain' ? 'none' : 'triangle'), id => _rapierDrawKindGlyph('arrow', { headStart: 'none', headEnd: id }));
			if (shape.label) html += _rapierDrawChoiceControl('labelPos', 'Label position', [[.15, 'Near start'], [.5, 'Middle'], [.85, 'Near end']], shape.labelPos ?? .5);
		} else if (pane === 'arrange') {
			if (group) html += _rapierDrawIconChip('edit', 'group', 'Group', 'group');
			if (shapes.some(shape => shape.group)) html += _rapierDrawIconChip('edit', 'ungroup', 'Ungroup', 'ungroup');
			html += _rapierDrawIconChip('edit', 'lock', 'Lock', 'lock') + '<span class="rapier-draw-menu-gap"></span>' + [['front', 'front', 'To front'], ['forward', 'forward', 'Forward'], ['backward', 'backward', 'Backward'], ['back', 'back', 'To back']].map(([id, icon, word]) => _rapierDrawIconChip('edit', icon, word, id)).join('');
			html += '<span class="rapier-draw-menu-row">' + _rapierDrawIconChip('flip', 'flip-x', 'Flip across', 'x') + _rapierDrawIconChip('flip', 'flip-y', 'Flip down', 'y');
			if (group) html += '<span class="rapier-draw-menu-gap"></span>' + _rapierDrawIconChip('distribute', 'space-x', 'Space across', 'x') + _rapierDrawIconChip('distribute', 'space-y', 'Space down', 'y');
			html += '</span>';
			if (group) html += _rapierDrawChoiceControl('align', 'Align', [['', 'Choose'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], '');
		}
		html += '</span>';
	}
	// The menu is written only when what it says has changed. A press is a button going down and up, and a tap counts only if
	// it is the same node at both ends (_rapierDrawBindTap): a slider losing focus to that very press re-rendered the menu
	// between them, so with a mouse the first click on the menu after the Width slider was lost.
	if (menu.hidden || state.menuHtml !== html) {
		// A press re-renders the menu under the focus: the same control, or the pane's tab it opened, takes it back.
		const had = menu.contains(document.activeElement) ? document.activeElement.dataset.drawMenuAct : '', value = had ? document.activeElement.dataset.drawValue || '' : '';
		menu.innerHTML = html; menu.hidden = false; menu.classList.toggle('rapier-draw-menu--sheet', sheet); state.menuHtml = html;
		if (had) (menu.querySelector('[data-draw-menu-act="' + had + '"][data-draw-value="' + CSS.escape(value) + '"]') || menu.querySelector('[data-draw-menu-act="' + had + '"]'))?.focus({ preventScroll: true });
		for (const input of menu.querySelectorAll('input[type="range"]')) _rapierDrawSeekWrap(input);
	}
	_rapierDrawPlaceMenu(_rapierDrawSelectionScreenBox());
}
function _rapierDrawPlaceMenu(box) {
	const state = _rapierDrawState, menu = state.menu;
	if (!menu || !box) return;
	// The style sheet sits at the foot of the stage, full width, scrolling inside itself: a floating
	// pane clipped to the room beside a shape is how Style ended up "chopped off" on a phone.
	if (menu.classList.contains('rapier-draw-menu--sheet')) { menu.style.cssText = ''; return; }
	// A thumb working near a phone's curved bezel/safe-area needs more clearance from the true screen
	// edge than a mouse pointer does (T28); the touch-session signal decides the margin once per
	// session rather than re-testing pointer type at every placement.
	const margin = _rapierDrawCoarseSession() ? 14 : 8;
	const viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
	const width = viewport?.width || window.innerWidth, bottom = top + (viewport?.height || window.innerHeight);
	const ceiling = Math.max(top, state.svgRoot.getBoundingClientRect().top) + margin;
	menu.style.maxHeight = ''; menu.style.width = ''; menu.style.left = left + 'px';
	const menuWidth = Math.min(menu.offsetWidth, width - margin * 2);
	menu.style.width = menuWidth + 'px';
	menu.style.left = _rapierDrawClamp(box.left + box.width / 2, left + margin + menuWidth / 2, left + width - margin - menuWidth / 2) + 'px';
	// The menu keeps clear of the handles: the rotate handle sits 44px above the box (22px radius),
	// the edge handles reach 22px past it, so the row never covers the thing the thumb is after.
	const reachUp = (state.handles || []).some(handle => handle.id === 'rotate') ? 66 : 22, reachDown = 22;
	const boxTop = box.top - reachUp, boxBottom = box.bottom + reachDown;
	const above = boxTop - 10 - ceiling, below = bottom - margin - boxBottom - 10;
	const room = Math.max(above, below), full = Math.max(44, bottom - margin - ceiling);
	menu.style.maxHeight = Math.min(full, Math.max(44, room)) + 'px';
	// Below the shape first (the rotate handle lives above it), above only when below has no room.
	const height = menu.offsetHeight, up = below < height && (above >= height || above > below);
	menu.style.transform = 'translate(-50%,0)';
	menu.style.top = _rapierDrawClamp(up ? boxTop - height - 10 : boxBottom + 10, ceiling, Math.max(ceiling, bottom - height - margin)) + 'px';
}
// The CAMERA (R82). Draw had none: two fingers scaled the SELECTION, so with nothing selected --
// which is every moment you are painting -- pinching did nothing at all, and the founder rightly
// read that as "pinch to zoom only works when you have the select tool selected". A camera is a
// window on the canvas: `view.k` how far in, `view.x`/`view.y` where the window's top-left sits in
// canvas units. It is written into the SVG's own viewBox, which every pointer mapping in this file
// already reads (`_rapierDrawMapPoint` honours vb.x/vb.y), so the whole editor -- paint included --
// follows it without a second coordinate system.
const RAPIER_DRAW_ZOOM_MIN = 0.2, RAPIER_DRAW_ZOOM_MAX = 8;
function _rapierDrawView() {
	const v = _rapierDrawState.view;
	return v && Number.isFinite(v.k) ? v : (_rapierDrawState.view = { x: 0, y: 0, k: 1 });
}
// The window's SIZE is measured against the canvas the zoom was set against, not against the canvas
// as it stands (the founder, 18 September: "the canvas zoom needs to stay constant when you paint
// near the edge of the canvas... the canvas can indeed expand but the view should not
// automatically" move). The span used to be `canvas / k`, so growing the paper widened the window,
// and a wider window rendered into the same stage makes everything on it smaller: measured, a
// stroke off the right edge took the canvas from 390 to 535 and shrank the person's work by 27.1%
// while sliding it 100 px down the screen. The paper may grow all it likes now; the window does not
// hear about it. A growth that also shifts the shapes moves the window with them, below, so the
// work stays under the same pixel. Only a pinch changes the zoom.
function _rapierDrawViewBase() {
	const state = _rapierDrawState, base = state.viewBase;
	if (base && Number.isFinite(base.w) && Number.isFinite(base.h) && base.w > 0 && base.h > 0) return base;
	const canvas = state.recipe?.canvas;
	return (state.viewBase = canvas ? { w: canvas.w, h: canvas.h } : { w: 1, h: 1 });
}
function _rapierDrawPaperView(recipe) {
	const canvas = recipe.canvas;
	const ink = recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength) ? _rapierDrawInkView(recipe) : null;
	if (!ink) return { x: 0, y: 0, w: canvas.w, h: canvas.h };
	const x = Math.min(0, ink.x), y = Math.min(0, ink.y);
	return { x, y, w: Math.max(canvas.w, ink.x + ink.w) - x, h: Math.max(canvas.h, ink.y + ink.h) - y };
}
// The window is re-measured only where a canvas is genuinely new to the person: the drawing opening, and a
// still-empty canvas taking the stage's size after a real rotation. The window at zoom 1 is the whole stage in
// canvas units, at the scale that fits the paper into the band under the settings row (state.viewInset, the
// row's height, measured at open) and centred there. The stage is the viewport and the row floats over it (the
// founder, 29 September: "your viewport is locked to a particular position in the canvas, and then the UI is
// locked to your viewport. The canvas is not locked to the UI"), so folding the row moves nothing: it only
// uncovers the band above the paper.
function _rapierDrawViewBaseReset(rect = _rapierDrawState.svgRoot?.getBoundingClientRect()) {
	const state = _rapierDrawState;
	if (!state.recipe?.canvas) return;
	const canvas = _rapierDrawPaperView(state.recipe);
	const W = Math.max(1, rect?.width || canvas.w), H = Math.max(1, rect?.height || canvas.h), inset = Math.min(state.viewInset || 0, H / 2);
	const scale = Math.max(1e-6, Math.min(W / canvas.w, (H - inset) / canvas.h));
	state.viewBase = { w: W / scale, h: H / scale };
	const v = _rapierDrawView();
	v.k = 1;
	v.x = canvas.x + (canvas.w - state.viewBase.w) / 2;
	v.y = canvas.y - (inset + (H - inset - canvas.h * scale) / 2) / scale;
}
// The settings row's height while it is shown: the band the opening view keeps clear of the paper.
function _rapierDrawSettingsInset() {
	const state = _rapierDrawState, row = state.surface?.querySelector('.rapier-draw-settings');
	if (row && !state.settingsCollapsed) return Math.max(0, Math.round(row.getBoundingClientRect().height));
	return state.viewInset || 0;
}
function _rapierDrawApplyView() {
	const state = _rapierDrawState, recipe = state.recipe, svg = state.svgRoot;
	if (!svg || !recipe?.canvas) return;
	const v = _rapierDrawView(), base = _rapierDrawViewBase(), w = base.w / v.k, h = base.h / v.k;
	// The displayed paper includes filtered output without feeding its reach back into the
	// authored canvas. Otherwise every seal would grow the whole-drawing filter again.
	const extent = _rapierDrawPaperView(recipe);
	// The window may travel past the paper -- painting up to a corner needs room beyond it -- but not
	// so far that the paper leaves the screen entirely.
	const slackX = Math.max(extent.w, w) * 0.9, slackY = Math.max(extent.h, h) * 0.9;
	v.x = Math.min(Math.max(v.x, extent.x - slackX), extent.x + extent.w + slackX - w);
	v.y = Math.min(Math.max(v.y, extent.y - slackY), extent.y + extent.h + slackY - h);
	const box = _rapierDrawFmt(v.x) + ' ' + _rapierDrawFmt(v.y) + ' ' + _rapierDrawFmt(w) + ' ' + _rapierDrawFmt(h);
	if (svg.getAttribute('viewBox') !== box) svg.setAttribute('viewBox', box);
	const paper = svg.querySelector('.rapier-draw-paper');
	if (paper) for (const [key, value] of Object.entries({ x: extent.x, y: extent.y, width: extent.w, height: extent.h })) paper.setAttribute(key, value);
	// The paint overlay is a raster positioned over the stage, not an SVG child, so it is placed again
	// against the new window or it would sit still while everything under it moved.
	if (typeof _rapierPaintPlaceLive === 'function') _rapierPaintPlaceLive();
}
function _rapierDrawViewTransform(rect, vb) {
	if (!vb.width || !vb.height || !rect.width || !rect.height) return { scale: 1, offX: 0, offY: 0 };
	const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
	return { scale, offX: (rect.width - vb.width * scale) / 2, offY: (rect.height - vb.height * scale) / 2 };
}
function _rapierDrawMapPoint(clientX, clientY, rect, vb) {
	const t = _rapierDrawViewTransform(rect, vb);
	return [(clientX - rect.left - t.offX) / t.scale + (vb.x || 0), (clientY - rect.top - t.offY) / t.scale + (vb.y || 0)];
}
function _rapierDrawMapToScreen(x, y, rect, vb) {
	const t = _rapierDrawViewTransform(rect, vb);
	return [rect.left + t.offX + (x - (vb.x || 0)) * t.scale, rect.top + t.offY + (y - (vb.y || 0)) * t.scale];
}
// Adding a MyPaint brush: the real file chooser, prepared the way every other chooser is. Reached
// from the last cell of the Brushes strip (R86e) -- one owner, wherever the control sits.
async function _rapierDrawPaintUpload() {
	const state = _rapierDrawState;
	await _rapierPrepareFileChooser('brush');
	if (!state.open || state.finishing) return;
	state.paintBrushInput.value = ''; state.paintBrushInput.click();
}
function _rapierDrawPointerGeometry(svg = _rapierDrawState.svgRoot) {
	const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
	if (_rapierDrawState.perf) _rapierDrawState.perf.geomSnapshots++;
	return { rect, vb };
}
function _rapierDrawSurfacePoint(evt, geom) {
	const svg = _rapierDrawState.svgRoot, box = geom || _rapierDrawPointerGeometry(svg);
	const p = _rapierDrawMapPoint(evt.clientX, evt.clientY, box.rect, box.vb);
	const pressure = Number.isFinite(evt.pressure) && evt.pressure >= 0 && evt.pressure <= 1 ? evt.pressure : 0.5;
	// Points are [x, y, elapsed milliseconds, pressure]; index 2 remains the recognizer's clock.
	return [p[0], p[1], evt.timeStamp - _rapierDrawState.strokeStartT, pressure];
}
function _rapierDrawPaintLive() {
	const state = _rapierDrawState;
	_rapierDrawNoteStroke();
	const pts = state.stroke;
	if (!pts?.length) return;
	const tool = state.gesture?.tool || _rapierDrawTool();
	state.live.classList.toggle('rapier-draw-live--erase', tool === 'erase');
	if (tool === 'text') {
		const a = pts[0], b = pts.at(-1), width = Math.abs(b[0] - a[0]);
		state.preview.innerHTML = width * (state.gesture?.scale || 1) > RAPIER_DRAW_MOVE_THRESHOLD_PX ? '<rect x="' + _rapierDrawFmt(Math.min(a[0], b[0])) + '" y="' + _rapierDrawFmt(a[1] - 15) + '" width="' + _rapierDrawFmt(width) + '" height="30" fill="none" stroke="currentColor" stroke-dasharray="3 4"/>' : '';
		return;
	}
	if (tool === 'shape') {
		const kind = _rapierDrawShapeKind(), geom = _rapierDrawShapeFromDrag(kind, pts[0], pts.at(-1));
		state.preview.innerHTML = geom ? _rapierDrawDisplayMarkup(_rapierDrawShapeMarkup({ id: 'preview', recognized: kind, geom, stroke: null, brush: 'ink', style: _rapierDrawDefaultStyle(kind), ink: state.ink, nib: state.nib }, state.recipe)) : '';
		if (geom && _rapierDrawNoteColours(state.preview.innerHTML)) _rapierDrawDarkStyleSync();
		return;
	}
	let d;
	if (tool === 'erase') { d = _rapierDrawSmoothPathD(pts, false, false); state.live.style.strokeWidth = _rapierDrawEraseRadius() * 2; }
	else if (tool === 'brush') d = _rapierDrawPenPathD(pts, state.smooth, false, state.nib);
	else { const plan = _rapierDrawSmoothPlan(state.smooth); d = _rapierDrawSmoothPathD(_rapierDrawRelaxStroke(_rapierDrawStreamlineStroke(pts, plan.streamline), plan.settle), false, plan.curve); }
	state.live.setAttribute('d', d);
}
function _rapierDrawClearLivePaint() {
	if (_rapierDrawState.live) { _rapierDrawState.live.setAttribute('d', ''); _rapierDrawState.live.style.strokeWidth = ''; }
	if (_rapierDrawState.preview) _rapierDrawState.preview.innerHTML = '';
}
function _rapierDrawRDPToCount(points, max) {
	if (points.length <= max) return points;
	let lo = 0, hi = 1, best = _rapierDrawRDPWeighted(points, hi, RAPIER_DRAW_STROKE_CHANNELS);
	while (best.length > max && hi < 4096) { hi *= 2; best = _rapierDrawRDPWeighted(points, hi, RAPIER_DRAW_STROKE_CHANNELS); }
	if (best.length > max) {
		const step = Math.max(1, Math.ceil((points.length - 1) / Math.max(1, max - 1)));
		return points.filter((_, i) => i % step === 0 || i === points.length - 1);
	}
	for (let i = 0; i < 8; i++) {
		const mid = (lo + hi) / 2, next = _rapierDrawRDPWeighted(points, mid, RAPIER_DRAW_STROKE_CHANNELS);
		if (next.length > max) lo = mid; else { hi = mid; best = next; }
	}
	return best;
}
// Indices (excluding the two ends, always kept) of local pressure extrema -- points strictly higher
// or lower than both neighbours -- whose swing on both sides clears `minSwing`. D02's floor under
// the weighted RDP above: a real pressure spike this size must survive on its own.
function _rapierDrawStrokePressureExtrema(points, minSwing) {
	const idx = [];
	for (let i = 1; i < points.length - 1; i++) {
		const p0 = points[i - 1][3], p1 = points[i][3], p2 = points[i + 1][3];
		if (typeof p0 !== 'number' || typeof p1 !== 'number' || typeof p2 !== 'number') continue;
		if ((p1 - p0) * (p1 - p2) < 0) continue;
		if (Math.min(Math.abs(p1 - p0), Math.abs(p1 - p2)) < minSwing) continue;
		idx.push(i);
	}
	return idx;
}
// Compacts exactly one closed chunk (the raw points a live tail collected before it hit
// RAPIER_DRAW_STROKE_CHUNK) down to at most RAPIER_DRAW_STROKE_CHUNK_CAP points via a pressure- and
// pace-weighted RDP (D02: position alone let a real mid-stroke pressure swell vanish on an
// otherwise near-straight run), forces in any pressure extremum that RDP's own count budget still
// traded away, then walks the original run once more to fill in any stretch left wider than
// RAPIER_DRAW_STROKE_GAP_MAX raw samples (RDP alone can erode a long straight run to just its two
// endpoints). RDP always keeps a piece's first and last point, so the result starts and ends on
// the exact same raw samples the next/previous chunk's own run starts and ends on -- chunks meet
// with no gap and no duplicated point. The caller freezes the result; this function never touches
// a chunk twice.
function _rapierDrawCompactStroke(points) {
	const kept = _rapierDrawRDPToCount(points, RAPIER_DRAW_STROKE_CHUNK_CAP);
	const chosen = new Set(kept);
	for (const i of _rapierDrawStrokePressureExtrema(points, RAPIER_DRAW_STROKE_PRESSURE_KEEP)) chosen.add(points[i]);
	if (chosen.size === points.length) return points.slice();
	const filled = [];
	let last = -1;
	for (let i = 0; i < points.length; i++) {
		if (chosen.has(points[i]) || i - last >= RAPIER_DRAW_STROKE_GAP_MAX) { filled.push(points[i]); last = i; }
	}
	return filled;
}
// Rebuilds the flat view every reader (pointer handlers, _rapierDrawPaintLive, the pointerup
// commit) sees as `state.stroke`, from the head, the frozen chunks and the still-open tail. Cheap
// relative to a frame: proportional to the CURRENT compacted total, not to how many raw samples
// the gesture has produced so far, and called at most once per pointermove batch (from
// _rapierDrawNoteStroke, itself called once per batch by _rapierDrawPaintLive) rather than once
// per point.
function _rapierDrawSyncStroke() {
	const state = _rapierDrawState;
	state.stroke = state.strokeHead.concat(...state.strokeChunks, state.strokeTail);
	return state.stroke;
}
function _rapierDrawNoteStroke() {
	const state = _rapierDrawState, perf = state.perf;
	const pts = _rapierDrawSyncStroke();
	if (!perf) return;
	perf.strokeCount = pts.length;
	perf.strokeFirst100 = pts.slice(0, 100).map(p => [p[0], p[1]]);
}
// Appends one live sample to the head (the first RAPIER_DRAW_STROKE_KEEP raw points, kept
// byte-exact for the life of the gesture) or, once the head is full, to the open tail. A tail that
// reaches the chunk budget is compacted ONE TIME and frozen into strokeChunks -- never revisited,
// unlike the old whole-buffer resweep this replaces -- and the gesture continues in a fresh tail.
// Does not touch state.stroke itself; callers that need the flat view call _rapierDrawNoteStroke
// (or _rapierDrawSyncStroke) once after a batch of appends, not once per point.
// D04: the real per-stroke point budget an admitted recipe will ever accept (draw/core.mjs
// _rapierDrawAdmitRecipe's own 16384-point-per-stroke cap). A window flag, read only when a caller
// has actually set it, substitutes a small one so a long live gesture hitting its own bound can be
// witnessed without a multi-minute drag.
const RAPIER_DRAW_STROKE_POINT_MAX = 16384;
function _rapierDrawStrokePointBudget() {
	const test = globalThis.__rapierDrawTestMaxStrokePoints;
	return Number.isInteger(test) && test > 0 ? test : RAPIER_DRAW_STROKE_POINT_MAX;
}
function _rapierDrawStrokePointCount(state) {
	return (state.strokeHead?.length || 0) + (state.strokeChunks || []).reduce((sum, chunk) => sum + chunk.length, 0) + (state.strokeTail?.length || 0);
}
// Appends one live sample to the head (the first RAPIER_DRAW_STROKE_KEEP raw points, kept
// byte-exact for the life of the gesture) or, once the head is full, to the open tail. A tail that
// reaches the chunk budget is compacted ONE TIME and frozen into strokeChunks -- never revisited,
// unlike the old whole-buffer resweep this replaces -- and the gesture continues in a fresh tail.
// D04: an exceptionally long, uninterrupted gesture must not grow the live buffer past what the
// recipe could ever admit -- bounded here, live, with headroom for one more worst-case chunk, so a
// person who has kept their finger down for minutes still gets the gesture committed (truncated at
// the boundary) rather than the whole stroke refused at release once it is already too late to
// react. Does not touch state.stroke itself; callers that need the flat view call
// _rapierDrawNoteStroke (or _rapierDrawSyncStroke) once after a batch of appends, not once per point.
function _rapierDrawAppendStrokePoint(p) {
	const state = _rapierDrawState;
	if (state.strokeLast && _rapierDrawDist(state.strokeLast, p) < 1.4) return;
	state.strokeLast = p;
	if (_rapierDrawStrokePointCount(state) >= _rapierDrawStrokePointBudget() - RAPIER_DRAW_STROKE_CHUNK) return;
	if (state.strokeHead.length < RAPIER_DRAW_STROKE_KEEP) { state.strokeHead.push(p); return; }
	state.strokeTail.push(p);
	if (state.strokeTail.length >= RAPIER_DRAW_STROKE_CHUNK) {
		state.strokeChunks.push(Object.freeze(_rapierDrawCompactStroke(state.strokeTail)));
		state.strokeTail = [];
	}
}
// Resets (or, with a seed point, starts) the whole live-stroke buffer: head/chunks/tail plus the
// flat `state.stroke` view every other reader uses. Called everywhere a gesture's stroke buffer
// starts or ends -- pointerdown, a pinch taking over a one-finger drag, a touch long-press
// discarding the pending stroke, and _rapierDrawEndGesture.
function _rapierDrawResetStrokeBuffer(seed) {
	const state = _rapierDrawState;
	state.strokeHead = seed ? [seed] : null; state.strokeChunks = seed ? [] : null; state.strokeTail = seed ? [] : null;
	state.strokeLast = seed || null; state.stroke = seed ? [seed] : null;
}
function _rapierDrawHandleSpecs() {
	const shapes = _rapierDrawSelectedShapes(), shape = shapes[0], box = _rapierDrawSelectionBox();
	if (!box || !shape || _rapierDrawSelectionLocked(shapes)) return [];
	if (shapes.length === 1 && !shape.asDrawn && ['line', 'arrow'].includes(shape.recognized)) {
		const g = shape.geom, out = [{ id: 'start', label: 'Move start', point: [g.x1, g.y1] }, { id: 'end', label: 'Move end', point: [g.x2, g.y2] }];
		if (shape.recognized === 'arrow') {
			const path = _rapierDrawArrowRoutePoints(shape, _rapierDrawState.recipe);
			const point = shape.route === 'elbow' ? [(path[1][0] + path[2][0]) / 2, (path[1][1] + path[2][1]) / 2] :
				shape.route === 'curved' && path.length === 3 ? [(path[0][0] + 2 * path[1][0] + path[2][0]) / 4, (path[0][1] + 2 * path[1][1] + path[2][1]) / 4] : [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2];
			out.push({ id: 'bend', label: 'Adjust arrow route', point });
		}
		if (shape.label) { const text = _rapierDrawTextLayout(shape, _rapierDrawState.recipe); out.push({ id: 'label', label: 'Move label along path', point: [text.center.x, text.center.y] }); }
		return out;
	}
	// A rotated single shape, or a multi-selection sharing one angle, tilts the box (and its
	// handles) to that angle (R14 in rotate-rules.md) so resize handles sit on the shape's own
	// tilted corners instead of floating off them.
	const frame = _rapierDrawSelectionFrame(_rapierDrawState.recipe, _rapierDrawSelection()) || { theta: 0, pivot: null, box };
	const w = frame.box.maxX - frame.box.minX, h = frame.box.maxY - frame.box.minY;
	return [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5], ['rotate', .5, 0]].map(([id, x, y]) => {
		const local = [frame.box.minX + w * x, frame.box.minY + h * y];
		return {
			id, x, y, label: id === 'rotate' ? 'Rotate selection' : 'Resize ' + ({ nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' })[id],
			point: frame.theta ? _rapierDrawRotatePt(frame.pivot[0], frame.pivot[1], local[0], local[1], frame.theta) : local,
		};
	});
}
function _rapierDrawUpdateHandles() {
	const state = _rapierDrawState, layer = state.handlesLayer;
	if (!layer) return;
	const svgRect = state.svgRoot.getBoundingClientRect(), vb = state.svgRoot.viewBox.baseVal, gesture = state.gesture;
	const frame = state.open && _rapierDrawTool() === 'select' ? _rapierDrawSelectionFrame(state.recipe, _rapierDrawSelection()) : null;
	const box = frame?.box, theta = frame?.theta || 0, pivot = frame?.pivot;
	if (!box || !state.open || state.textEdit) { layer.innerHTML = ''; state.handles = []; return; }
	// `mapLocal` treats a box-local point as if it were already a page point -- valid because local
	// coordinates share the page's scale, only differing by the rotation about `pivot` that CSS
	// applies afterward (see the outline's transform below); `toScreen` instead resolves a local
	// point through that rotation first, which is what a real page-space handle position needs.
	const scaleView = _rapierDrawViewTransform(svgRect, vb).scale;
	const mapLocal = (lx, ly) => _rapierDrawMapToScreen(lx, ly, svgRect, vb);
	const toScreen = (lx, ly) => { const p = theta ? _rapierDrawRotatePt(pivot[0], pivot[1], lx, ly, theta) : [lx, ly]; return _rapierDrawMapToScreen(p[0], p[1], svgRect, vb); };
	const [uLeft, uTop] = mapLocal(box.minX, box.minY), [uRight, uBottom] = mapLocal(box.maxX, box.maxY);
	const w = box.maxX - box.minX, h = box.maxY - box.minY, wScreen = w * scaleView, hScreen = h * scaleView;
	const moving = !!gesture?.changed, active = moving && gesture.kind === 'handle' ? gesture.handle.id : null;
	const tiny = wScreen < RAPIER_DRAW_TINY_HANDLE_PX && hScreen < RAPIER_DRAW_TINY_HANDLE_PX;
	const selectedShapes = _rapierDrawSelectedShapes(), textHandles = selectedShapes.length === 1 && selectedShapes[0].recognized === 'text';
	let html = '';
	if (!moving) {
		const tilt = theta ? ';transform-origin:' + (mapLocal(pivot[0], pivot[1])[0] - uLeft) + 'px ' + (mapLocal(pivot[0], pivot[1])[1] - uTop) + 'px;transform:rotate(' + (theta * 180 / Math.PI) + 'deg)' : '';
		html = '<span class="rapier-draw-selection-box" style="left:' + uLeft + 'px;top:' + uTop + 'px;width:' + Math.max(1, uRight - uLeft) + 'px;height:' + Math.max(1, uBottom - uTop) + 'px' + tilt + '"></span>';
	}
	// Ghost, not smaller handles (shapes-and-select-rules.md): while a resize or rotate handle is
	// held, every sibling handle already hides above (D1-D4) -- this adds a hairline outline of the
	// selection's PRE-drag box (`gesture.box`/`gesture.frame`, frozen the instant the drag started
	// in _rapierDrawStartTransform, never the live one) so the person can still see where they began
	// without the clutter of the full handle set. It disappears the instant the drag is no longer
	// active (release, cancel or a handle swap), the same frame the real result commits.
	else if (gesture.kind === 'handle' && gesture.box && RAPIER_DRAW_GHOST_HANDLES.has(gesture.handle.id)) {
		const gFrame = gesture.frame || { theta: 0, pivot: null, box: gesture.box }, gBox = gFrame.box, gTheta = gFrame.theta || 0;
		const [gLeft, gTop] = _rapierDrawMapToScreen(gBox.minX, gBox.minY, svgRect, vb), [gRight, gBottom] = _rapierDrawMapToScreen(gBox.maxX, gBox.maxY, svgRect, vb);
		let gTilt = '';
		if (gTheta && gFrame.pivot) {
			const [ox, oy] = _rapierDrawMapToScreen(gFrame.pivot[0], gFrame.pivot[1], svgRect, vb);
			gTilt = ';transform-origin:' + (ox - gLeft) + 'px ' + (oy - gTop) + 'px;transform:rotate(' + (gTheta * 180 / Math.PI) + 'deg)';
		}
		html += '<span class="rapier-draw-handle-ghost" style="left:' + gLeft + 'px;top:' + gTop + 'px;width:' + Math.max(1, gRight - gLeft) + 'px;height:' + Math.max(1, gBottom - gTop) + 'px' + gTilt + '"></span>';
	}
	state.handles = [];
	if (state.marquee) { layer.innerHTML = html; return; }
	for (const handle of _rapierDrawHandleSpecs()) {
		if (moving && handle.id !== active) continue;
		// R19: a box shrunk past the point its own handles would overlap keeps exactly one corner
		// (the active drag, if any, is already exempted above) rather than eight-plus-rotate clutter.
		if (tiny && !moving && handle.x != null && handle.id !== 'se') continue;
		let [x, y] = _rapierDrawMapToScreen(...handle.point, svgRect, vb);
		if (active && state.pointerPos) {
			x = gesture.handle.screen[0] + (state.pointerPos[0] - gesture.origin[0]) * gesture.scale;
			y = gesture.handle.screen[1] + (state.pointerPos[1] - gesture.origin[1]) * gesture.scale;
		}
		else if (handle.id === 'label') y += 44;
		else if (handle.id === 'rotate') {
			[x, y] = toScreen((box.minX + box.maxX) / 2, box.minY - 44 / scaleView);
			if (y < svgRect.top + 22) continue;
		}
		else if (handle.x != null) {
			if (wScreen < 88 && handle.x === .5) continue;
			// R18: unlike an ordinary mid-edge handle, text's own e/w pair is the only way to change
			// wrap width without rescaling the font (R8), so a short single line never loses it.
			if (hScreen < 88 && handle.y === .5 && !(textHandles && (handle.id === 'e' || handle.id === 'w'))) continue;
			let lx = box.minX + w * handle.x, ly = box.minY + h * handle.y;
			if (handle.x !== .5) lx = (box.minX + box.maxX) / 2 + (handle.x - .5) * Math.max(56 / scaleView, w);
			if (handle.y !== .5) ly = (box.minY + box.maxY) / 2 + (handle.y - .5) * Math.max(56 / scaleView, h);
			[x, y] = toScreen(lx, ly);
		}
		if (!active) {
			x = _rapierDrawClamp(x, svgRect.left + 22, Math.max(svgRect.left + 22, svgRect.right - 22));
			y = _rapierDrawClamp(y, svgRect.top + 22, Math.max(svgRect.top + 22, svgRect.bottom - 22));
		}
		state.handles.push({ ...handle, screen: [x, y] });
		// R21: text's own width handles read as a distinct pill, not the ordinary square corner marker.
		const variant = handle.id === 'rotate' ? ' rapier-draw-handle--rotate' : handle.id === 'bend' || handle.id === 'label' ? ' rapier-draw-handle--round' : textHandles && (handle.id === 'e' || handle.id === 'w') ? ' rapier-draw-handle--pill' : '';
		const cursorDir = _rapierDrawResizeCursorDir(handle.id, theta), cursorAttr = cursorDir ? ' data-draw-cursor="' + cursorDir + '"' : '';
		html += '<button type="button" class="rapier-draw-handle' + variant + '" data-draw-handle="' + handle.id + '"' + cursorAttr + ' aria-label="' + handle.label + '" style="left:' + x + 'px;top:' + y + 'px">' + (handle.id === 'rotate' ? RAPIER_DRAW_ICONS.turn : '<span></span>') + '</button>';
	}
	layer.innerHTML = html;
}

function _rapierDrawStartTransform() {
	const state = _rapierDrawState, gesture = state.gesture;
	if (_rapierDrawSelectionLocked()) throw new Error('Unlock the selected drawing first');
	if (gesture.changed) return;
	gesture.changed = true;
	// A press ring's job ends the instant the gesture actually commits to a move/resize/rotate --
	// ordinary chrome (the selection box, or D1-D4's hidden-while-dragging handles) takes over.
	_rapierDrawHidePressRing();
	gesture.beforeUndo = state.undoStack; gesture.beforeRedo = state.redoStack; gesture.before = _rapierDrawSnapshot();
	if (gesture.alt && gesture.kind === 'move') {
		const copies = _rapierDrawCopyShapes(_rapierDrawSelectedShapes(), 0, 0);
		_rapierDrawSetSelection(copies.map(shape => shape.id));
	}
	gesture.ids = _rapierDrawSelection();
	gesture.source = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe());
	gesture.box = _rapierDrawSelectionBox(gesture.source, gesture.ids);
	gesture.frame = _rapierDrawSelectionFrame(gesture.source, gesture.ids);
	state.menu.hidden = true;
}
function _rapierDrawRestoreTransformShapes() {
	const state = _rapierDrawState, gesture = state.gesture;
	for (const original of gesture.source.shapes) if (!gesture.ids.includes(original.id) && original.bind && Object.values(original.bind).some(anchor => gesture.ids.includes(anchor.to))) {
		const shape = state.recipe.shapes.find(shape => shape.id === original.id);
		shape.bind = JSON.parse(JSON.stringify(original.bind));
	}
	for (const original of gesture.source.shapes) if (gesture.ids.includes(original.id)) {
		const index = state.recipe.shapes.findIndex(shape => shape.id === original.id);
		state.recipe.shapes[index] = JSON.parse(JSON.stringify(original));
		if (original.stroke != null) state.recipe.strokes[original.stroke] = { pts: gesture.source.strokes[original.stroke].pts.map(p => p.slice()) };
	}
	return _rapierDrawSelectedShapes();
}
function _rapierDrawApplyMove(point, evt = {}) {
	const state = _rapierDrawState, gesture = state.gesture;
	_rapierDrawStartTransform();
	let dx = point[0] - gesture.origin[0], dy = point[1] - gesture.origin[1];
	if (evt.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
	// A fixed 6px catch (T13's reference figure, converted to a constant screen distance the same way
	// as the hit-test margin) reads noticeably weaker than touch's own generous move/handle thresholds
	// once a drag is already underway, so a touch gesture ties its snap tolerance to
	// RAPIER_DRAW_MOVE_THRESHOLD_PX instead -- exactly the distance a touch drag already had to travel
	// to start moving at all, so the magnet engages right up to where that same threshold would
	// otherwise have swallowed a small deliberate nudge, never past it.
	const snapTolerance = (gesture.touch ? RAPIER_DRAW_MOVE_THRESHOLD_PX : 6) / gesture.scale;
	const snap = state.snap && !evt.ctrlKey && !evt.metaKey ? _rapierDrawSnapMove(gesture.source, gesture.ids, dx, dy, snapTolerance) : { dx, dy, guides: [] };
	for (const shape of _rapierDrawRestoreTransformShapes()) { _rapierDrawTranslateShape(shape, state.recipe, snap.dx, snap.dy); _rapierDrawReleaseBindings(shape, gesture.ids); }
	state.guides = snap.guides; _rapierDrawRenderShapes(gesture.ids); _rapierDrawPaintGuides();
}
function _rapierDrawPlusMark(x, y, r) {
	return 'M' + _rapierDrawFmt(x - r) + ' ' + _rapierDrawFmt(y) + 'H' + _rapierDrawFmt(x + r) + 'M' + _rapierDrawFmt(x) + ' ' + _rapierDrawFmt(y - r) + 'V' + _rapierDrawFmt(y + r);
}
function _rapierDrawXMark(x, y, r) {
	return 'M' + _rapierDrawFmt(x - r) + ' ' + _rapierDrawFmt(y - r) + 'L' + _rapierDrawFmt(x + r) + ' ' + _rapierDrawFmt(y + r) + 'M' + _rapierDrawFmt(x - r) + ' ' + _rapierDrawFmt(y + r) + 'L' + _rapierDrawFmt(x + r) + ' ' + _rapierDrawFmt(y - r);
}
function _rapierDrawPaintGuides() {
	const state = _rapierDrawState;
	if (!state.guidesEl) return;
	state.guidesEl.innerHTML = (state.guides || []).map(guide => {
		// Equal-gap has its own visual (a small "x" at each matched gap's own centre, no spanning
		// line) so it never reads as an ordinary alignment -- distribution is a distance match between
		// two gaps, not a shared position (T14's dedicated equal-gap indicator).
		if (guide.kind === 'gap') return guide.marks.map(([x, y]) => '<path class="rapier-draw-guide-gap" d="' + _rapierDrawXMark(x, y, 4) + '"/>').join('');
		const line = '<path d="M' + (guide.axis === 'x' ? _rapierDrawFmt(guide.at) + ' ' + _rapierDrawFmt(guide.from) + 'V' : _rapierDrawFmt(guide.from) + ' ' + _rapierDrawFmt(guide.at) + 'H') + _rapierDrawFmt(guide.to) + '"/>';
		// The line shows the whole span that aligned; a small "+" pins the one point that actually
		// caught, since a dashed line crossing a cluttered small screen is easy to lose (T14).
		const mark = guide.mark ? '<path class="rapier-draw-guide-mark" d="' + _rapierDrawPlusMark(guide.mark[0], guide.mark[1], 4) + '"/>' : '';
		return line + mark;
	}).join('');
}
function _rapierDrawResizeBox(box, handle, delta, lock, centered) {
	const width = Math.max(.001, box.maxX - box.minX), height = Math.max(.001, box.maxY - box.minY);
	const ax = centered || handle.x === .5 ? (box.minX + box.maxX) / 2 : handle.x ? box.minX : box.maxX;
	const ay = centered || handle.y === .5 ? (box.minY + box.maxY) / 2 : handle.y ? box.minY : box.maxY;
	let sx = handle.x === .5 ? 1 : 1 + delta[0] / ((handle.x ? width : -width) * (centered ? .5 : 1));
	let sy = handle.y === .5 ? 1 : 1 + delta[1] / ((handle.y ? height : -height) * (centered ? .5 : 1));
	if (lock) {
		const size = handle.x === .5 ? Math.abs(sy) : handle.y === .5 ? Math.abs(sx) : Math.abs(sx - 1) >= Math.abs(sy - 1) ? Math.abs(sx) : Math.abs(sy);
		sx = (sx < 0 ? -1 : 1) * size; sy = (sy < 0 ? -1 : 1) * size;
	}
	if (Math.abs(sx) * width < .05) sx = (sx < 0 ? -1 : 1) * .05 / width;
	if (Math.abs(sy) * height < .05) sy = (sy < 0 ? -1 : 1) * .05 / height;
	return { minX: ax + (box.minX - ax) * sx, maxX: ax + (box.maxX - ax) * sx, minY: ay + (box.minY - ay) * sy, maxY: ay + (box.maxY - ay) * sy };
}
function _rapierDrawApplyHandle(point, evt = {}, commit = false) {
	const state = _rapierDrawState, gesture = state.gesture;
	_rapierDrawStartTransform();
	const shapes = _rapierDrawRestoreTransformShapes(), handle = gesture.handle, delta = [point[0] - gesture.origin[0], point[1] - gesture.origin[1]], box = gesture.box;
	const p = [handle.point[0] + delta[0], handle.point[1] + delta[1]], shape = shapes[0];
	if (handle.id === 'start' || handle.id === 'end') _rapierDrawSetArrowEndpoint(shape, handle.id, p, state.recipe, RAPIER_DRAW_SNAP_EDGE_PX / gesture.scale);
	else if (handle.id === 'bend') {
		const g = shape.geom, dx = g.x2 - g.x1, dy = g.y2 - g.y1, length = Math.hypot(dx, dy) || 1;
		if (shape.route === 'elbow') shape.elbow = _rapierDrawClamp(Math.abs(dx) >= Math.abs(dy) ? (p[0] - g.x1) / (dx || 1) : (p[1] - g.y1) / (dy || 1), 0, 1);
		else { shape.route = 'curved'; shape.curveT = .5; shape.bend = ((p[1] - (g.y1 + g.y2) / 2) * dx - (p[0] - (g.x1 + g.x2) / 2) * dy) / length; }
	} else if (handle.id === 'label') {
		shape.labelPos = globalThis.RapierDrawCore._rapierDrawLabelFraction(shape, state.recipe, p);
	} else if (shape.recognized === 'text' && shapes.length === 1 && ['e', 'w'].includes(handle.id)) {
		const old = _rapierDrawTextLayout(shape, state.recipe), angle = shape.geom.rot || 0, direction = handle.id === 'w' ? -1 : 1, centered = evt.altKey || state.resizeFromCenter;
		const amount = (delta[0] * Math.cos(angle) + delta[1] * Math.sin(angle)) * direction;
		const width = Math.max(24, old.width + amount * (centered ? 2 : 1));
		shape.geom.w = width;
		const next = _rapierDrawTextLayout(shape, state.recipe), dx = centered ? 0 : (next.width - old.width) * direction / 2, dy = centered ? 0 : (next.height - old.height) / 2;
		shape.geom.cx += dx * Math.cos(angle) - dy * Math.sin(angle); shape.geom.cy += dx * Math.sin(angle) + dy * Math.cos(angle);
	} else if (handle.id === 'rotate') {
		const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
		let angle = Math.atan2(point[1] - cy, point[0] - cx) - Math.atan2(gesture.origin[1] - cy, gesture.origin[0] - cx);
		if (evt.shiftKey) angle = Math.round(angle / RAPIER_DRAW_TURN_STEP) * RAPIER_DRAW_TURN_STEP;
		else if (evt.pointerType !== 'mouse') {
			// No Shift key on touch: a magnetic pull onto the 15 deg grid stands in for it while the
			// drag is live (rotate-rules.md R21). At release only, a second, independent right-angle
			// gravity onto 0/90/180/270 (checked against the gesture's own recorded selection-frame
			// angle, not shape.geom.rot -- a reflected rectangle stores its frame as corners with no
			// `rot` field at all, which used to read as a false 0 and could settle near 184 instead of
			// 180) can pull further, and the committed angle is rounded to a whole degree so it
			// carries no float noise (R22/R23).
			const nearest15 = Math.round(angle / RAPIER_DRAW_TURN_STEP) * RAPIER_DRAW_TURN_STEP;
			if (Math.abs(angle - nearest15) < RAPIER_DRAW_ROTATE_MAGNET_RAD) angle = nearest15;
			if (commit) {
				const start = gesture.frame?.theta || 0, right = Math.PI / 2, nearest90 = Math.round((start + angle) / right) * right;
				if (Math.abs(start + angle - nearest90) < RAPIER_DRAW_ROTATE_GRAVITY_RAD) angle = nearest90 - start;
				angle = Math.round((start + angle) * 180 / Math.PI) * Math.PI / 180 - start;
			}
		}
		for (const shape of shapes) { _rapierDrawRotateShape(shape, state.recipe, cx, cy, angle); _rapierDrawReleaseBindings(shape, gesture.ids); }
	} else {
		const lock = shapes.length > 1 || state.proportions || evt.shiftKey || shapes.some(shape => ['circle', 'arc', 'text'].includes(shape.recognized));
		const frame = gesture.frame || { theta: 0, pivot: null, box };
		const theta = frame.theta, localBox = theta ? frame.box : box;
		// A rotated single shape (or uniformly-rotated group) resizes in its own tilted axes (R18):
		// the pointer delta is measured in that local frame before the ordinary box math runs.
		const localDelta = theta ? [delta[0] * Math.cos(theta) + delta[1] * Math.sin(theta), delta[1] * Math.cos(theta) - delta[0] * Math.sin(theta)] : delta;
		let next = _rapierDrawResizeBox(localBox, handle, localDelta, lock, evt.altKey || state.resizeFromCenter);
		// snapping-rules.md N5: the moved edge of an unlocked, untilted box snaps to a neighbour's
		// edge or centre within the same tolerance a move uses. A locked (proportional) resize or a
		// tilted box skips it: an independent per-axis nudge would break the lock (R27), and a
		// rotated edge lining up with an unrotated neighbour is too fuzzy (R26).
		const snapTolerance = (gesture.touch ? RAPIER_DRAW_MOVE_THRESHOLD_PX : 6) / gesture.scale;
		if (state.snap && !evt.ctrlKey && !evt.metaKey && !theta && !lock) {
			const snap = _rapierDrawSnapResize(gesture.source, gesture.ids, localBox, next, snapTolerance);
			next = snap.next; state.guides = snap.guides;
		} else state.guides = [];
		for (const shape of shapes) { _rapierDrawResizeShapeLocal(shape, state.recipe, theta, frame.pivot, localBox, next); globalThis.RapierDrawEdit._rapierDrawFitText(shape, state.recipe); _rapierDrawReleaseBindings(shape, gesture.ids); }
		const centered = evt.altKey || state.resizeFromCenter;
		_rapierDrawAnchorResizeLocal(state.recipe, gesture.ids, theta, frame.pivot, next, { x: centered ? .5 : 1 - handle.x, y: centered ? .5 : 1 - handle.y });
	}
	_rapierDrawRenderShapes(gesture.ids); _rapierDrawPaintGuides();
}
function _rapierDrawTryBeginPinch(evt) {
	const state = _rapierDrawState, gesture = state.gesture;
	if (evt.pointerType !== 'touch' || state.secondPointerId != null || !gesture || !state.pointerScreen || evt.pointerId === state.pointerId) return;
	// Two touches are always navigation, including over selected objects and their handles.
	if (gesture.kind === 'paint') _rapierPaintReleaseStroke(gesture, true);
	else if (gesture.before) {
		state.recipe = _rapierDrawRestoreRecipe(gesture.before);
		state.undoStack = gesture.beforeUndo; state.redoStack = gesture.beforeRedo;
	}
	clearTimeout(gesture.holdTimer);
	_rapierDrawSetSelection(gesture.selection || []);
	state.stroke = null; state.renderEdit = null; state.lastTap = null; state.guides = [];
	_rapierDrawEndMarquee(); _rapierDrawClearLivePaint(); _rapierDrawHidePressRing(); _rapierDrawResetStrokeBuffer();
	state.secondPointerId = evt.pointerId; state.secondPointerScreen = [evt.clientX, evt.clientY]; state.secondPointerPos = _rapierDrawSurfacePoint(evt);
	try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
	const view = _rapierDrawView();
	state.gesture = {kind: 'zoom', tool: gesture.tool, selection: gesture.selection || [], dragged: true, zoom: {first: state.pointerScreen.slice(), second: state.secondPointerScreen.slice(), view: {...view}}};
	_rapierDrawRenderAll(); _rapierPaintShowLive(true); _rapierDrawPaintGuides();
	evt.preventDefault();
}
// Two fingers, in screen pixels: the span between them sets the zoom, their midpoint sets the pan,
// and the canvas point that sat under that midpoint when the fingers landed stays under it -- which
// is what makes a pinch feel like moving a photograph rather than driving a slider.
function _rapierDrawApplyZoom(geom) {
	const state = _rapierDrawState, gesture = state.gesture, z = gesture?.zoom;
	if (!z || !state.pointerScreen || !state.secondPointerScreen) return;
	const rect = (geom || _rapierDrawPointerGeometry()).rect;
	const d0 = Math.max(1, Math.hypot(z.first[0] - z.second[0], z.first[1] - z.second[1]));
	const d1 = Math.max(1, Math.hypot(state.pointerScreen[0] - state.secondPointerScreen[0], state.pointerScreen[1] - state.secondPointerScreen[1]));
	const v = _rapierDrawView();
	const k = Math.min(RAPIER_DRAW_ZOOM_MAX, Math.max(RAPIER_DRAW_ZOOM_MIN, z.view.k * (d1 / d0)));
	// Where the fingers' midpoint began, in canvas units, under the view they began with.
	const start = { x: z.view.x, y: z.view.y, k: z.view.k };
	const base = _rapierDrawViewBase();
	const span0 = { w: base.w / start.k, h: base.h / start.k };
	const t0 = Math.min(rect.width / span0.w, rect.height / span0.h);
	const off0 = { x: (rect.width - span0.w * t0) / 2, y: (rect.height - span0.h * t0) / 2 };
	const mid0 = [(z.first[0] + z.second[0]) / 2, (z.first[1] + z.second[1]) / 2];
	const anchorPt = [(mid0[0] - rect.left - off0.x) / t0 + start.x, (mid0[1] - rect.top - off0.y) / t0 + start.y];
	// Put that same canvas point back under the fingers' midpoint now, at the new zoom.
	const span1 = { w: base.w / k, h: base.h / k };
	const t1 = Math.min(rect.width / span1.w, rect.height / span1.h);
	const off1 = { x: (rect.width - span1.w * t1) / 2, y: (rect.height - span1.h * t1) / 2 };
	const mid1 = [(state.pointerScreen[0] + state.secondPointerScreen[0]) / 2, (state.pointerScreen[1] + state.secondPointerScreen[1]) / 2];
	v.k = k;
	v.x = anchorPt[0] - (mid1[0] - rect.left - off1.x) / t1;
	v.y = anchorPt[1] - (mid1[1] - rect.top - off1.y) / t1;
	_rapierDrawApplyView();
	_rapierDrawUpdateHandles();
}
function _rapierDrawEndGesture(cancel = false) {
	const state = _rapierDrawState, gesture = state.gesture, pointers = [state.pointerId, state.secondPointerId];
	if (gesture) {
		clearTimeout(gesture.holdTimer);
		// A paint stroke cut short (a lost pointer, a hidden page) keeps what it painted: the layer
		// is committed as it stands rather than leaving pixels only the overlay knows about. One that
		// was still queued on its target's decode (P02) has no layer yet to commit -- it is marked
		// discarded instead, so a decode that resolves after the cancel does not paint a stroke the
		// person no longer means (a tool switch, Undo/Redo or a lost pointer all cancel this way).
		if (gesture.kind === 'paint' && cancel) {
			state.gesture = null; state.pointerId = null; state.pointerPos = null;
			_rapierPaintReleaseStroke(gesture);
			if (gesture.paint?.pending) gesture.paint.discarded = true; else _rapierPaintCommit();
		}
		if (cancel) { if (gesture.before) state.recipe = _rapierDrawRestoreRecipe(gesture.before); _rapierDrawSetSelection(gesture.selection); }
		if (cancel && gesture.beforeUndo) state.undoStack = gesture.beforeUndo;
		if (cancel && gesture.beforeRedo) state.redoStack = gesture.beforeRedo;
		if (cancel) state.renderEdit = null;
	}
	state.gesture = null; state.pointerId = null; state.secondPointerId = null;
	state.pointerPos = null; state.secondPointerPos = null; _rapierDrawResetStrokeBuffer(); state.guides = []; _rapierDrawPaintGuides();
	_rapierDrawEndMarquee(); _rapierDrawClearLivePaint(); _rapierDrawHidePressRing();
	for (const id of pointers) if (id != null) try { state.svgRoot.releasePointerCapture(id); } catch (_) {}
}
function _rapierDrawCancelGesture() { _rapierDrawState.canvasTouches?.clear(); if (_rapierDrawState.gesture) { _rapierDrawEndGesture(true); _rapierDrawRenderAll(); } }
function _rapierDrawGuard(action) {
	return (...args) => {
		const state = _rapierDrawState, gesture = state.gesture, undo = state.undoStack, top = undo.at(-1), redo = state.redoStack;
		try { return action(...args); }
		catch (error) {
			if (state.gesture) _rapierDrawEndGesture(true);
			else if (gesture?.before) {
				state.recipe = _rapierDrawRestoreRecipe(gesture.before); _rapierDrawSetSelection(gesture.selection);
				if (state.undoStack.at(-1) === gesture.before) state.undoStack.pop();
			} else if (state.undoStack.at(-1) && state.undoStack.at(-1) !== top) {
				state.recipe = _rapierDrawRestoreRecipe(state.undoStack.pop()); _rapierDrawSetSelection([]);
			}
			state.renderEdit = null; state.undoStack = gesture?.beforeUndo || undo; state.redoStack = gesture?.beforeRedo || redo;
			_rapierDrawRenderAll(); showToast(String(error.message || error), 'error');
		}
	};
}
function _rapierDrawCommand(change, snapshot = true, menu = true) {
	_rapierPaintFlushRevision();
	const state = _rapierDrawState, original = state.recipe, before = _rapierDrawHistoryRecipe(), selection = _rapierDrawSelection(), undo = state.undoStack, redo = state.redoStack;
	state.recipe = _rapierDrawRestoreRecipe(before);
	try {
		change();
		_rapierDrawRerouteBoundArrows(state.recipe);
		// The paper follows the change (above): a growth that moved every shape left or down moved the window
		// with them, and that shift is written on this step so Undo gives it back with the shapes.
		const grown = _rapierDrawGrowCanvasToContent(state.recipe);
		const admitted = _rapierDrawAdmitRecipe(state.recipe, true);
		if (!admitted) throw new Error('Drawing change exceeds its limits');
		const markup = _rapierDrawDisplayMarkup(_rapierDrawSceneMarkup(admitted, false, true));
		state.recipe = admitted;
		if (snapshot && !_rapierDrawSameRecipe(before)) {
			_rapierDrawSnapshot(before);
			if (grown && (grown.dx || grown.dy) && !grown.recorded) { const entry = state.undoStack.at(-1); entry.shift = { dx: (entry.shift?.dx || 0) + grown.dx, dy: (entry.shift?.dy || 0) + grown.dy }; }
			_rapierDrawSealHistory(); state.sweepBase = before;
		}
		else if (!snapshot && state.sweepBase && state.undoStack.length) {
			// A continuing sweep (a colour or slider drag) is one history step: its sealed delta is
			// recomputed from the sweep's own base to the recipe as it now stands, so Undo returns to
			// the base and Redo returns to the last value the finger left, not the first.
			const base = { ...state.sweepBase.recipe, fonts: state.sweepBase.fonts };
			const entry = _rapierDrawHistoryDelta(base, state.recipe);
			entry.selection = (state.sweepBase.selection || []).slice();
			state.undoStack[state.undoStack.length - 1] = entry;
		}
		state.svg.innerHTML = markup; _rapierDrawSyncFonts(); _rapierDrawMarkSelection(); if (menu) _rapierDrawUpdateMenu();
		state.renderEdit = null;
		return true;
	} catch (error) {
		state.renderEdit = null; state.undoStack = undo; state.redoStack = redo; state.recipe = original; _rapierDrawSetSelection(selection); _rapierDrawRenderAll(); showToast(String(error.message || error), 'error');
		return false;
	}
}
// One shared long-press primitive for every touch hold gesture below: a single timer armed at
// pointerdown and a single cancellation rule (still the same gesture, and it hasn't already
// committed a change or crossed the move threshold -- _rapierDrawOnPointerMove clears the timer
// itself the instant that happens, so this is a second, cheap belt-and-suspenders check, not the
// only guard). Each call site supplies only what firing means for it -- multi-select toggle here,
// Shape/Brush/Pen cancel-or-marquee-escape there (T7: one place decides a press has gone on long
// enough; every tool interprets that instant its own way instead of inventing its own timer).
function _rapierDrawArmHold(gesture, onFire) {
	gesture.holdTimer = setTimeout(() => {
		if (_rapierDrawState.gesture !== gesture || gesture.changed || gesture.dragged) return;
		onFire();
	}, RAPIER_DRAW_HOLD_MS);
}
function _rapierDrawOnPointerDown(evt) {
	if (evt.pointerType === 'mouse' && evt.button !== 0) return;
	evt.stopPropagation(); evt.preventDefault();
	const state = _rapierDrawState;
	// ZA3 F3: the colour sampler owns the canvas while it is open -- a drag meant to sample must
	// never also move or delete the selected painting, or begin a stroke of its own.
	if (state.dropper) return;
	// A press on the canvas is the canvas taking the focus. The press keeps the pointer from the page (preventDefault above stops the
	// mouse events that would move the focus), so the focus stayed on the toolbar button or slider last used, and the keyboard -- Delete,
	// the arrows, Ctrl+D, Enter, a letter to begin a text -- was ignored (a button owns its own keys). A handle keeps its own focus.
	if (state.surface && document.activeElement !== state.surface && !document.activeElement?.closest?.('textarea') && !evt.target.closest?.('[data-draw-handle]')) state.surface.focus({ preventScroll: true });
	// Nobody is ever trapped watching an animation, and nobody waits to start their own stroke: a
	// tap anywhere on the canvas jumps the agent's replay to its end, and a finger that carries on
	// into a stroke has already ended it by the time the stroke begins. Their hand wins, always.
	if (state.replay) _rapierDrawReplayEnd();
	if (state.finishing || !_rapierDrawFinishText()) return;
	if (state.pointerId != null) {
		if (state.gesture?.pointerType === 'pen' && evt.pointerType === 'touch') return;
		_rapierDrawTryBeginPinch(evt); return;
	}
	state.settingEdit = null;
	state.pointerId = evt.pointerId; state.strokeStartT = evt.timeStamp;
	const point = _rapierDrawSurfacePoint(evt), svgRect = state.svgRoot.getBoundingClientRect();
	const eraser = evt.pointerType === 'pen' && (evt.button === 5 || !!(evt.buttons & 32));
	// S6: the hardware eraser belongs to this gesture, not the chosen tool. Ending/cancelling the
	// gesture restores the choice without a tool switch (which could discard a queued paint stroke).
	const scale = _rapierDrawViewTransform(svgRect, state.svgRoot.viewBox.baseVal).scale, tool = eraser ? 'erase' : _rapierDrawTool();
	// Handles and object hits never steal a mark from a drawing tool, including over existing ink.
	const handle = tool === 'select' && evt.target.closest('[data-draw-handle]') ? (state.handles || []).reduce((best, next) => !best || _rapierDrawDist(next.screen, [evt.clientX, evt.clientY]) < _rapierDrawDist(best.screen, [evt.clientX, evt.clientY]) ? next : best, null) : null;
	const hit = handle ? null : _rapierDrawHitShape(point, _rapierDrawHitSlop() / scale), selection = _rapierDrawSelection();
	// Hit order rank 2: an already-sole-selected arrow/line's own rendered label outranks its
	// shaft -- grab the label directly rather than starting a whole-shape move underneath it.
	const labelHandle = !handle && tool === 'select' && hit && selection.length === 1 && selection[0] === hit ? _rapierDrawLabelHandleAt(_rapierDrawShapeById(hit), point) : null;
	const touch = evt.pointerType === 'touch';
	const gesture = state.gesture = { kind: handle || labelHandle ? 'handle' : 'stroke', tool, scale, origin: point, downId: hit, selection, handle: handle || labelHandle, touch, pointerType: evt.pointerType, alt: !!evt.altKey, shift: !!evt.shiftKey, add: !!evt.shiftKey, changed: false, dragged: false };
	// Effects does not make marks or steal Select's job; two fingers still reach the camera.
	if (tool === 'effects') gesture.kind = 'hold';
	state.pointerPos = point; state.pointerScreen = [evt.clientX, evt.clientY];
	_rapierDrawResetStrokeBuffer(point); _rapierDrawNoteStroke();
	// Shape, Text and Erase keep their tool intent even when a canvas press hits a selected shape.
	if (hit && _rapierDrawShapeById(hit)?.locked && !handle && !labelHandle && tool === 'select') { gesture.kind = 'hold'; _rapierDrawSetSelection([hit]); _rapierDrawShowPressRing(hit); }
	else if (!handle && !labelHandle && tool === 'select') {
		if (hit && !evt.ctrlKey && !evt.metaKey) {
			gesture.kind = 'move';
			if (!selection.includes(hit)) _rapierDrawSetSelection([hit]);
			// Press ring (shapes-and-select-rules.md): shown before the move threshold, on the hit
			// shape's own painted outline -- so the person sees what they grabbed before it moves.
			_rapierDrawShowPressRing(hit);
			if (touch) _rapierDrawArmHold(gesture, () => {
				gesture.kind = 'hold';
				_rapierDrawSetSelection(_rapierDrawToggleSelection(selection, hit));
				_rapierDrawRenderAll();
			});
		} else { gesture.kind = 'marquee'; _rapierDrawBeginMarquee(point); _rapierDrawPaintMarquee(); state.menu.hidden = true; }
	} else if (!handle && tool === 'paint') { gesture.kind = 'paint'; }
	// R82: the Eraser erases PAINT. It used to refuse a painting outright -- "Erase cuts lines, not
	// filled faces" -- on the reasoning that a raster is a filled face and the Paint tool's own
	// eraser preset is the way to take pixels away. That is not what anyone reaching for an eraser
	// expects, and the founder found it broken on their own phone: "I've also just tested the eraser
	// functionality. Doesn't work. Doesn't erase paintbrush strokes or anything." So when the finger
	// is over a painting and no vector shape is on top of it there, the gesture becomes a PAINT
	// gesture carrying the eraser preset: it erases live, under the finger, and commits like any
	// other stroke. Over vectors, or where there is no painting, Erase still cuts lines exactly as
	// it did.
	// ...and only when the finger comes down ON a painting. The first cut asked merely whether a
	// painting existed ANYWHERE in the drawing, so an erase stroke across an ink outline on empty
	// canvas was swallowed by the paint eraser and the line was never cut (`draw-not-tldraw` (2)).
	// Touching the painting is the whole condition: unambiguous to a person, and it leaves every
	// other erase exactly as it was.
	else if (!handle && tool === 'erase' && hit && _rapierDrawShapeById(hit)?.recognized === 'paint' && typeof _rapierPaintTarget === 'function' && _rapierPaintTarget()) {
		gesture.kind = 'paint'; gesture.eraseInk = true;
	}
	try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
	if (gesture.kind === 'paint') { _rapierPaintBegin(evt, gesture); return; }
	if (gesture.kind === 'stroke') _rapierDrawPaintLive();
	else if (gesture.kind === 'move' || gesture.kind === 'handle') { _rapierDrawMarkSelection(); _rapierDrawUpdateMenu(); }
	else _rapierDrawRenderAll();
}
function _rapierDrawOnPointerMove(evt, commit = false) {
	const state = _rapierDrawState, gesture = state.gesture;
	if (state.dropper || !gesture || evt.pointerId !== state.pointerId && evt.pointerId !== state.secondPointerId) return;
	evt.stopPropagation(); evt.preventDefault();
	const raw = evt.getCoalescedEvents?.(), events = raw?.length ? raw : [evt];
	const geom = _rapierDrawPointerGeometry();
	const point = _rapierDrawSurfacePoint(events.at(-1), geom);
	if (evt.pointerId === state.pointerId) { state.pointerPos = point; state.pointerScreen = [evt.clientX, evt.clientY]; }
	else { state.secondPointerPos = point; state.secondPointerScreen = [evt.clientX, evt.clientY]; }
	if (gesture.kind === 'zoom') { _rapierDrawApplyZoom(geom); return; }
	if (gesture.kind === 'paint') { if (!commit) _rapierPaintMove(events, gesture); return; }
	const travel = _rapierDrawDist(point, gesture.origin) * gesture.scale;
	if (travel > RAPIER_DRAW_MOVE_THRESHOLD_PX) { clearTimeout(gesture.holdTimer); gesture.dragged = true; }
	gesture.shift = !!evt.shiftKey; gesture.alt = gesture.kind === 'move' ? gesture.alt : !!evt.altKey;
	if (gesture.kind === 'hold' || gesture.kind === 'cancelled') return;
	if (gesture.kind === 'marquee') {
		state.marquee.x1 = point[0]; state.marquee.y1 = point[1];
		let caught;
		if (gesture.touch) {
			// Scribble select on touch: one owner (the marquee gesture), two geometries -- the mouse
			// keeps the axis-aligned rectangle (_rapierDrawMarqueeCatches) below; touch instead walks
			// the finger's own recorded path (_rapierDrawScribbleCatches), painted as a translucent
			// live path rather than a filled rect.
			gesture.scribble = gesture.scribble || [gesture.origin.slice()];
			for (const sample of events) gesture.scribble.push(_rapierDrawSurfacePoint(sample));
			_rapierDrawPaintScribble();
			caught = _rapierDrawScribbleCatches(gesture.scribble);
		} else { _rapierDrawPaintMarquee(); caught = _rapierDrawMarqueeCatches(_rapierDrawMarqueeRect()); }
		// B9's phone substitute: touch has no Shift to hold, so a real drag-marquee (not a mere tap,
		// which must still deselect per B6/B7) extends an already-existing selection by default.
		const extend = gesture.add || (gesture.dragged && gesture.touch && gesture.selection.length > 0);
		_rapierDrawSetSelection(extend ? [...gesture.selection, ...caught] : caught); _rapierDrawMarkSelection();
		return;
	}
	if (gesture.kind === 'handle' || gesture.kind === 'move') {
		if (gesture.changed || travel > RAPIER_DRAW_MOVE_THRESHOLD_PX) gesture.kind === 'handle' ? _rapierDrawApplyHandle(point, evt, commit) : _rapierDrawApplyMove(point, evt);
		return;
	}
	for (const sample of events) _rapierDrawAppendStrokePoint(_rapierDrawSurfacePoint(sample, geom));
	if (travel > RAPIER_DRAW_MOVE_THRESHOLD_PX && _rapierDrawSelection().length) { _rapierDrawSetSelection([]); _rapierDrawUpdateMenu(); _rapierDrawMarkSelection(); }
	_rapierDrawPaintLive();
}
function _rapierDrawSettleMovedShape(shape, scale) {
	if (!shape?.geom || shape.asDrawn || !_rapierDrawState.snap || shape.recognized === 'text') return;
	const recipe = _rapierDrawState.recipe, kind = shape.recognized, old = { ...shape.geom };
	if (kind === 'line' || kind === 'arrow') {
		if (shape.style === 'dimension') return;
		const next = { ...old };
		_rapierDrawSnapLineGeom(next, shape.id);
		_rapierDrawSetArrowEndpoint(shape, 'start', [next.x1, next.y1], recipe, RAPIER_DRAW_SNAP_EDGE_PX / scale);
		_rapierDrawSetArrowEndpoint(shape, 'end', [next.x2, next.y2], recipe, RAPIER_DRAW_SNAP_EDGE_PX / scale);
		return;
	}
	const stroke = _rapierDrawShapeStroke(shape, recipe);
	if (kind === 'arc') {
		_rapierDrawSnapArcGeom(shape.geom, shape.id);
		if (stroke && Math.abs(old.a1 - old.a0) > .000001 && (old.a0 !== shape.geom.a0 || old.a1 !== shape.geom.a1)) {
			let previous = old.a0;
			for (const p of stroke.pts) {
				const radius = Math.hypot(p[0] - old.cx, p[1] - old.cy);
				previous = _rapierDrawNearestAngle(Math.atan2(p[1] - old.cy, p[0] - old.cx), previous);
				const angle = shape.geom.a0 + (previous - old.a0) / (old.a1 - old.a0) * (shape.geom.a1 - shape.geom.a0);
				p[0] = old.cx + Math.cos(angle) * radius; p[1] = old.cy + Math.sin(angle) * radius;
			}
		}
	} else {
		const geom = _rapierDrawRestGeom(kind, shape.geom, shape.id);
		if (geom !== shape.geom) {
			const before = _rapierDrawShapeBBox(shape), after = _rapierDrawShapeBBoxIn({ ...shape, geom }, recipe);
			_rapierDrawTranslateShape(shape, recipe, after.minX - before.minX, after.minY - before.minY);
		}
	}
}
function _rapierDrawOnPointerUp(evt) {
	const state = _rapierDrawState, gesture = state.gesture;
	if (state.dropper || !gesture || evt.pointerId !== state.pointerId && evt.pointerId !== state.secondPointerId) return;
	evt.stopPropagation(); evt.preventDefault();
	state.echoTap = { x: evt.clientX, y: evt.clientY, id: evt.pointerId };
	_rapierDrawOnPointerMove(evt, true);
	if (state.gesture !== gesture) return;
	const pts = ['shape', 'text'].includes(gesture.tool) ? [gesture.origin, state.pointerPos] : state.stroke || [], kind = gesture.kind, selected = _rapierDrawSelection();
	// A thumb's second tap lands further from its first than a mouse's second click does, so the
	// double-tap location tolerance widens for touch (touch-rules.md T8); the 450ms window itself
	// stays pointer-type-independent, same as the reference.
	const doubleTapDist = gesture.touch ? RAPIER_DRAW_DOUBLE_TAP_DIST_TOUCH_PX : RAPIER_DRAW_DOUBLE_TAP_DIST_PX;
	const priorTap = state.lastTap, double = !gesture.dragged && priorTap && evt.timeStamp - priorTap.time < 450 && priorTap.id === gesture.downId && _rapierDrawDist(priorTap.point, gesture.origin) * gesture.scale < doubleTapDist;
	state.lastTap = gesture.dragged ? null : { time: evt.timeStamp, id: gesture.downId, point: gesture.origin };
	if (kind === 'paint') { _rapierDrawEndGesture(); _rapierPaintEnd(evt, gesture); return; }
	_rapierDrawEndGesture();
	if (gesture.changed) {
		if (kind === 'move' && selected.length === 1) {
			const shape = _rapierDrawShapeById(selected[0]);
			_rapierDrawSettleMovedShape(shape, gesture.scale);
		}
		if (gesture.ids?.length) { _rapierDrawRenderShapes(gesture.ids); _rapierDrawUpdateMenu(); }
		else _rapierDrawRenderAll();
		if (_rapierDrawSameRecipe(gesture.before)) { state.undoStack = gesture.beforeUndo; state.redoStack = gesture.beforeRedo; _rapierDrawRenderHistory(); }
		else _rapierDrawSealHistory(gesture.before);
		return;
	}
	// Double-tap table (shapes-and-select-rules.md): only a genuine text shape or a shape that
	// already carries a label re-opens the editor here. Empty canvas never spawns a text shape (no
	// `else` path does that any more), and a labelless geo shape or a bare arrow shaft does nothing
	// on double-tap -- falling through to the ordinary single-tap reselect below, same as any other
	// non-double tap on that shape.
	if (!gesture.dragged && gesture.handle?.id === 'label') { _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0], {at: gesture.origin}); return; }
	if (double && gesture.tool === 'select' && !gesture.handle && gesture.downId) {
		const shape = _rapierDrawShapeById(gesture.downId);
		if (shape && (shape.recognized === 'text' || shape.label)) { _rapierDrawEditLabelInPlace(shape, { at: gesture.origin }); state.lastTap = null; return; }
	}
	if (kind === 'zoom' || kind === 'marquee' || kind === 'hold' || kind === 'handle' || kind === 'cancelled') { _rapierDrawRenderAll(); return; }
	if (kind === 'move') {
		if (gesture.add) _rapierDrawSetSelection(_rapierDrawToggleSelection(gesture.selection, gesture.downId));
		else if (gesture.downId && !gesture.dragged) {
			const shape = _rapierDrawShapeById(gesture.downId), label = _rapierDrawLabelBox(shape, state.recipe), p = gesture.origin;
			if (label && p[0] >= label.minX && p[0] <= label.maxX && p[1] >= label.minY && p[1] <= label.maxY) { _rapierDrawEditLabelInPlace(shape, { at: p }); return; }
		}
		else _rapierDrawSetSelection([gesture.downId]);
		_rapierDrawRenderAll(); return;
	}
	if (gesture.tool === 'erase') { _rapierDrawEraseWith(pts); return; }
	if (gesture.tool === 'shape') { _rapierDrawCommitShapeDrag(pts, gesture.dragged, gesture); return; }
	if (gesture.tool === 'text') { _rapierDrawCreateText(gesture.origin, pts.at(-1) || gesture.origin); return; }
	if (_rapierDrawPerimeter(pts, false) * gesture.scale < 6) {
		// A tap is ink even when it lands on another stroke.
		if (['brush', 'pen'].includes(gesture.tool) && kind === 'stroke') _rapierDrawCommitDot(pts[0] || [...gesture.origin, 0, 0.5]);
		return;
	}
	if (pts.length >= 2) _rapierDrawCommitStroke(pts);
}
// A dot: two points a hair apart so the brush outline is a round dab of the nib's own width,
// committed as an ordinary ink stroke (selectable, movable, resizable, erasable) with no recognition.
function _rapierDrawCommitDot(point) {
	const pressure = point[3] ?? 0.5;
	_rapierDrawCommitStroke([[point[0], point[1], 0, pressure], [point[0] + 0.05, point[1], 8, pressure]], { dot: true });
}
function _rapierDrawOnPointerCancel(evt) {
	if (evt.pointerId !== _rapierDrawState.pointerId && evt.pointerId !== _rapierDrawState.secondPointerId) return;
	evt.stopPropagation(); _rapierDrawCancelGesture();
}
function _rapierDrawBindTap(el, handler) {
	// Touch activation requires a matching press and release; click also preserves keyboard activation.
	let press = null;
	el.addEventListener('pointerdown', evt => {
		const button = evt.target.closest('button');
		press = button && !button.disabled && (evt.pointerType !== 'mouse' || evt.button === 0) ? { id: evt.pointerId, button, x: evt.clientX, y: evt.clientY, moved: false } : null;
		// A touch press owns its gesture outright: cancel it here so the browser never queues its
		// delayed compatibility mousedown/mouseup/click for this touch. Left unprevented, that shadow
		// sequence lands (after a hit-test taken at dispatch time, not press time) on whatever is now
		// under the finger — which for an action that hides its own trigger (e.g. opening the label
		// editor collapses the menu) is the surface behind it — and the browser's default mousedown
		// behaviour focuses the nearest focusable ancestor, silently blurring a just-opened modal
		// input. Mouse presses are untouched: their click still runs, and the echoTap guard below still
		// dedupes it against this same press/release.
		if (press && evt.pointerType !== 'mouse') evt.preventDefault();
		evt.stopPropagation();
	});
	el.addEventListener('pointermove', evt => { if (press?.id === evt.pointerId && Math.hypot(evt.clientX - press.x, evt.clientY - press.y) > 8) press.moved = true; });
	el.addEventListener('pointercancel', () => { press = null; });
	el.addEventListener('pointerup', evt => {
		const start = press; press = null;
		if (!start || start.id !== evt.pointerId) return;
		_rapierDrawState.echoTap = { x: evt.clientX, y: evt.clientY, id: evt.pointerId };
		if (start.moved || evt.target.closest('button') !== start.button) return;
		evt.preventDefault(); evt.stopPropagation();
		handler(evt);
	});
	el.addEventListener('click', evt => { evt.stopPropagation(); handler(evt); });
}
function _rapierDrawUpdateInkBtn(palette = true) {
	const state = _rapierDrawState, btn = state.surface?.querySelector('[data-draw-act="ink"]');
	// The palette reads the theme; finish those reads before replacing any button or panel nodes.
	const colours = palette && state.colourOpen ? _rapierDrawPalette(state.ink, 'next') : '';
	if (btn) {
		const was = btn.querySelector('.rapier-draw-ink-dot')?.style.background || '';
		btn.innerHTML = '<span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: state.ink })) + '"></span><span class="rapier-draw-btn-name">colour</span>';
		btn.setAttribute('aria-expanded', String(!!state.colourOpen));
		// A colour chosen (never each step of a colour dragged) washes into the dot from its middle: the old colour
		// stands under the new one while the new one spreads (rapier-draw.css .rapier-draw-ink-dot--wash).
		const dot = btn.firstElementChild;
		if (palette && was && was !== dot.style.background) {
			dot.style.setProperty('--rapier-ink-was', was); dot.style.setProperty('--rapier-ink-now', dot.style.background);
			dot.classList.add('rapier-draw-ink-dot--wash');
			const washing = _rapierDrawPlay(dot, 'wash');
			if (washing) washing.finished.then(() => dot.classList.remove('rapier-draw-ink-dot--wash'), () => {});
			else dot.classList.remove('rapier-draw-ink-dot--wash');
		}
	}
	if (state.live) state.live.style.color = _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: state.ink }));
	const row = state.surface?.querySelector('.rapier-draw-colours');
	if (row && palette) { row.hidden = !state.colourOpen; row.innerHTML = colours; }
}
function _rapierDrawSetColour(scope, ink, continuous = false) {
	const state = _rapierDrawState;
	if (state.finishing) return;
	if (scope === 'flower' || scope === 'stem') { _rapierDrawSetGardenColour(scope, ink, continuous); return; }
	if (scope === 'next') { state.ink = ink || null; state.inkChosen = true; _rapierDrawUpdateInkBtn(!continuous); if (!continuous) _rapierPaintUpdateStrip(); return; }
	const shapes = _rapierDrawSelectedShapes();
	if (_rapierDrawSelectionLocked(shapes)) return;
	const key = scope === 'border' ? 'border' : 'ink';
	if (key === 'border' && !shapes.every(_rapierDrawBorderActive)) return;
	if (!shapes.some(shape => ((key === 'border' ? shape.authorStyle?.stroke : shape.style === 'solid' ? shape.authorStyle?.fill : shape.authorStyle?.stroke) || shape[key] || '') !== ink)) return;
	if (_rapierDrawCommand(() => {
		for (const shape of _rapierDrawSelectedShapes()) { globalThis.RapierDrawEdit._rapierDrawReleaseAuthorPaint(shape, {[key]: ink || null}); if (ink) shape[key] = ink; else delete shape[key]; }
	}, !continuous || !state.colourEdit, !continuous) && continuous) state.colourEdit = true;
}
function _rapierDrawChooseColour(scope, ink, continuous = false) {
	_rapierDrawRememberInk(ink);
	_rapierDrawSetColour(scope, ink, continuous);
	_rapierDrawState.colourEdit = false; _rapierDrawState.sweepBase = null;
	_rapierDrawUpdateInkBtn(); _rapierPaintUpdateStrip(); _rapierDrawUpdateMenu(); _rapierDrawRefreshColourRow();
}
function _rapierDrawCommitHex(input) {
	const ink = _rapierDrawReadHex(input.value);
	input.setCustomValidity(ink ? '' : 'Enter a hex colour, like #1A2B3C.');
	input.setAttribute('aria-invalid', String(!ink));
	if (!ink) return false;
	_rapierDrawChooseColour(input.dataset.drawHex, ink);
	return true;
}
// A fade is one sweep, as a colour is: the selection fades live under the finger and the drag is one Undo step. The sweep
// goes on only while its own step is the newest; any other step, or Undo, starts the next drag afresh.
function _rapierDrawSetFade(transparency, continuous = false) {
	const state = _rapierDrawState, shapes = _rapierDrawSelectedShapes();
	if (state.finishing || !shapes.length || _rapierDrawSelectionLocked(shapes)) return;
	const opacity = Math.round((1 - _rapierDrawClamp(Number(transparency) || 0, 0, .95)) * 100) / 100;
	if (!shapes.some(shape => (shape.opacity ?? 1) !== opacity)) return;
	const sweeping = continuous && !!state.fadeEdit && state.fadeEdit === state.undoStack.at(-1);
	if (_rapierDrawCommand(() => {
		for (const shape of _rapierDrawSelectedShapes()) { if (opacity < 1) shape.opacity = opacity; else delete shape.opacity; }
	}, !sweeping, !continuous) && continuous) state.fadeEdit = state.undoStack.at(-1);
}
function _rapierDrawTransformSelection(scale, angle = 0) {
	const state = _rapierDrawState, box = _rapierDrawSelectionBox();
	if (!box || _rapierDrawSelectionLocked()) return;
	_rapierDrawCommand(() => {
		const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
		const next = { minX: cx + (box.minX - cx) * scale, maxX: cx + (box.maxX - cx) * scale, minY: cy + (box.minY - cy) * scale, maxY: cy + (box.maxY - cy) * scale };
		for (const shape of _rapierDrawSelectedShapes()) {
			if (scale !== 1) { _rapierDrawResizeShape(shape, state.recipe, box, next); globalThis.RapierDrawEdit._rapierDrawFitText(shape, state.recipe); }
			if (angle) _rapierDrawRotateShape(shape, state.recipe, cx, cy, angle);
			_rapierDrawReleaseBindings(shape, _rapierDrawSelection());
		}
		if (scale !== 1) _rapierDrawAnchorResize(state.recipe, _rapierDrawSelection(), next, { x: .5, y: .5 });
	});
}
function _rapierDrawSetProperty(key, value, asked = false) {
	const state = _rapierDrawState, shapes = _rapierDrawSelectedShapes();
	if (state.finishing || !shapes.length || _rapierDrawSelectionLocked(shapes)) return;
	if (key === 'textFont' && !asked && _rapierDrawLettersAsk(value, () => _rapierDrawSetProperty(key, value, true))) return;
	if (key === 'transparency') { _rapierDrawSetFade(value, true); state.fadeEdit = false; state.sweepBase = null; _rapierDrawUpdateMenu(); return; }
	if (key === 'align') { if (value) _rapierDrawEditSelection({ type: 'align', alignment: value }); return; }
	_rapierDrawCommand(() => {
		if (key === 'textFont' && !['sans', 'serif', 'mono'].includes(value) && !_rapierDrawLetterFont(value) && !state.recipe.fonts?.some(font => font.id === value)) {
			const font = _rapierDrawAvailableFonts().find(font => font.id === value);
			if (!font) throw new Error('That custom font is no longer available.');
			state.recipe.fonts = globalThis.RapierDrawFonts.admitFonts([...(state.recipe.fonts || []), font]);
		}

		for (const shape of _rapierDrawSelectedShapes()) {
			if (['textSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'labelPos'].includes(key)) shape[key] = Number(value);
			else if (['textCase', 'textFigures', 'textEffect'].includes(key)) { if (key === 'textEffect' && shape.recognized !== 'text') continue; if (value) shape[key] = value; else delete shape[key]; if (key === 'textEffect' && value === 'garden') _rapierDrawPlantGarden(shape, _rapierDrawTextDefaults()); }
			else if (key === 'textKern') { if (value === 'off') shape.textKern = false; else delete shape.textKern; }
			else if (key === 'inner') { if (shape.recognized === 'star') shape.geom.inner = Number(value); }
			else if (key === 'headStart' || key === 'headEnd') { shape[key] = value; delete shape['trim' + key.slice(4)]; delete shape.cutWidth; }
			else if (key === 'route') {
				if (shape.recognized === 'line' && value !== 'straight') { shape.recognized = 'arrow'; if (shape.brush && !_rapierDrawBrushesFor('arrow').includes(shape.brush)) shape.brush = 'ink'; }
				shape.route = value;
				if (value === 'curved' && !shape.bend) shape.bend = _rapierDrawClamp(Math.hypot(shape.geom.x2 - shape.geom.x1, shape.geom.y2 - shape.geom.y1) * .2, 12, 60);
				if (value === 'elbow' && typeof shape.elbow !== 'number') shape.elbow = .5;
			} else shape[key] = value;
			globalThis.RapierDrawEdit._rapierDrawFitText(shape, state.recipe);
		}
	});
	if (key === 'textFont') { state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error')); }
}
function _rapierDrawMenuAction(evt) {
	const state = _rapierDrawState;
	if (state.finishing || !evt.target.closest('button')) return;
	// Touch buttons suppress native focus changes. Commit a typed colour before a button hides
	// or replaces its field, just as leaving the field with a keyboard or a mouse does.
	if (document.activeElement?.dataset.drawHex) document.activeElement.blur();
	const copy = evt.target.closest('[data-draw-colour-copy]');
	if (copy) {
		const input = copy.closest('.rapier-draw-colour-editor')?.querySelector('[data-draw-hex]'), hex = _rapierDrawReadHex(input?.value);
		const button = state.surface.querySelector('[data-draw-colour-copy="' + CSS.escape(copy.dataset.drawColourCopy) + '"]') || copy;
		if (hex) void _rapierDrawCopyHex(hex.toUpperCase(), button);
		return;
	}
	const dropper = evt.target.closest('[data-draw-act="dropper"]');
	if (dropper) { void _rapierDrawOpenDropper(dropper.dataset.drawColourScope || 'next'); return; }
	const swatch = evt.target.closest('[data-draw-colour-value]');
	if (swatch) { _rapierDrawChooseColour(swatch.dataset.drawColourScope, swatch.dataset.drawColourValue); return; }
	const btn = evt.target.closest('[data-draw-menu-act]'), shape = _rapierDrawShapeById(state.menuShapeId);
	if (!btn || !shape) return;
	const act = btn.dataset.drawMenuAct, value = btn.dataset.drawValue;
	if (act === 'property') { _rapierDrawSetProperty(btn.dataset.drawProperty, value); return; }
	if (act === 'pane') { state.menuPane = value || null; state.menuColour = false; _rapierDrawUpdateMenu(); return; }
	if (act === 'colour' || act === 'border') { const scope = act === 'border' ? 'border' : true; state.menuColour = state.menuColour === scope ? false : scope; state.colourEdit = false; state.sweepBase = null; _rapierDrawUpdateMenu(); return; }
	if (act === 'proportions') { state.proportions = !state.proportions; _rapierDrawUpdateMenu(); return; }
	if (act === 'center') { state.resizeFromCenter = !state.resizeFromCenter; _rapierDrawUpdateMenu(); return; }
	if (act === 'edit') { _rapierDrawEditSelection({ type: value }); return; }
	if (act === 'copy' || act === 'delete') { _rapierDrawEditSelection({ type: act === 'copy' ? 'duplicate' : 'delete' }); return; }
	if (act === 'flip' || act === 'distribute') { _rapierDrawEditSelection({ type: act, axis: value }); return; }
	if (_rapierDrawSelectionLocked()) return;
	if (act === 'label') { _rapierDrawEditLabelInPlace(shape); return; }
	// One acknowledged picker operation (Astra-R74 N01, editor/engine.js
	// _rapierPrepareFileChooser): a custom font is an ordinary attachment, not a document Open, so
	// android MainActivity.kt must hand its result back to this input's own change handler.
	if (act === 'font-upload') { state.fontUploadTarget = 'selection'; state.fontInput.value = ''; void (async () => { await _rapierPrepareFileChooser('font'); state.fontInput.click(); })(); return; }
	if (act === 'width' || act === 'smooth') { _rapierDrawShowRow(act === 'width' ? 'nib' : 'smooth'); return; }
	if (['bigger', 'smaller', 'turn'].includes(act)) { _rapierDrawTransformSelection(act === 'bigger' ? 1.2 : act === 'smaller' ? 1 / 1.2 : 1, act === 'turn' ? RAPIER_DRAW_TURN_STEP : 0); return; }
	_rapierDrawCommand(() => {
	const shape = _rapierDrawShapeById(state.menuShapeId);
	if (act === 'toggle-ink') {
		// Distinct from the agent's clean/unclean (draw/edit.mjs applyOperations), which is geometry
		// only and leaves whatever material the shape wears untouched (L01: clean the circle, keep
		// its brush) -- this chip is the one-tap human convenience "Make it a circle" / "As drawn",
		// and its own default look is coupled to which side of the toggle it lands on: the freehand
		// 'brush' look (_rapierDrawBrushPenPath, drawn along the stroke) is what an as-drawn stroke
		// actually looks like fresh off the Brush tool, and the plain 'ink' look (a thin recognized
		// line, draw-copy-erase-undo/draw-erase-brushed's own "rod" carrying pathLength) is what
		// "Make it a line" is understood to mean -- so this one action swaps the *default* between
		// them, same as it always has, while any OTHER material the shape already wears on purpose
		// (sketch, sphere, rope, ...) is left alone in both directions, exactly as the agent op does.
		shape.asDrawn = !shape.asDrawn;
		if (!shape.asDrawn && shape.brush === 'brush') shape.brush = 'ink';
		else if (shape.asDrawn && (!shape.brush || shape.brush === 'ink')) shape.brush = 'brush';
	}
	else if (act === 'toggle-label-in') shape.labelIn = !shape.labelIn;
	else if (act === 'text-align' || act === 'text-valign') for (const selected of _rapierDrawSelectedShapes()) selected[act === 'text-align' ? 'labelAlign' : 'labelVAlign'] = value;
	else if (act === 'text-toggle') { const on = !shape[value]; for (const selected of _rapierDrawSelectedShapes()) selected[value] = on; }
	else if (act === 'text-wrap') { if (shape.geom.w) delete shape.geom.w; else shape.geom.w = Math.max(64, _rapierDrawTextLayout(shape, state.recipe).width); }
	else if (act === 'style') { globalThis.RapierDrawEdit._rapierDrawReleaseAuthorPaint(shape, {style: value}); shape.style = value; delete shape.headStart; delete shape.headEnd; delete shape.trimStart; delete shape.trimEnd; delete shape.cutWidth; if (value !== 'solid') delete shape.border; }
	else if (act === 'dash') { if (value) shape.dash = value; else delete shape.dash; }
	else if (act === 'brush') {
		shape.brush = value;
		if (value === 'light') {
			if (shape.geom) state.recipe.light = Math.atan2(shape.geom.y2 - shape.geom.y1, shape.geom.x2 - shape.geom.x1);
			else { const points = _rapierDrawShapeStroke(shape, state.recipe)?.pts, samples = points?.length >= 2 && _rapierDrawStrokeSamples(points, 3); if (samples?.length) state.recipe.light = samples[0].ang; }
		}
	} else if (act === 'angle') shape.angle = !shape.angle;
	else if (act === 'len') shape.len = !shape.len;
	if ((shape.border || shape.style === 'solid' && shape.authorStyle?.stroke) && !_rapierDrawBorderActive(shape)) throw new Error('A border needs a solid shape in the Ink look, not an as-drawn stroke');
	for (const selected of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit._rapierDrawFitText(selected, state.recipe);
	});
}
const RAPIER_DRAW_CLIPBOARD = 'application/x-rapier-drawing+json';
function _rapierDrawCopyEvent(evt) {
	evt.stopPropagation();
	if (evt.target.closest('input,textarea,select') || !_rapierDrawSelection().length || !evt.clipboardData) return;
	_rapierPaintFlushRevision();
	const state = _rapierDrawState, ids = new Set(_rapierDrawSelection());
	const recipe = _rapierDrawPruneUnusedStrokes({ ...state.recipe, shapes: state.recipe.shapes.filter(shape => ids.has(shape.id)).map(shape => {
		const copy = JSON.parse(JSON.stringify(shape));
		if (copy.bind) for (const end of ['start', 'end']) if (!ids.has(copy.bind[end]?.to)) delete copy.bind[end];
		return copy;
	}) });
	recipe.fonts = (recipe.fonts || []).filter(font => recipe.shapes.some(shape => shape.textFont === font.id));
	try {
		const svg = _rapierDrawBuildSVG(recipe), json = JSON.stringify(recipe);
		evt.clipboardData.setData('text/plain', svg);
		try { evt.clipboardData.setData(RAPIER_DRAW_CLIPBOARD, json); } catch (_) {}
		evt.preventDefault();
		if (evt.type === 'cut') _rapierDrawEditSelection({ type: 'delete' });
	} catch (error) { showToast(String(error.message || error), 'error'); }
}
function _rapierDrawReadSVGRecipe(text) {
	if (!/^\s*</.test(text)) return null;
	const xml = new DOMParser().parseFromString(text, 'image/svg+xml'), root = xml.documentElement;
	if (root.localName !== 'svg' || root.namespaceURI && root.namespaceURI !== 'http://www.w3.org/2000/svg' || xml.querySelector('parsererror')) return null;
	const metadata = [...root.getElementsByTagNameNS(root.namespaceURI, 'metadata')].filter(node => node.getAttribute('id') === 'rapier-draw');
	if (!metadata.length) return null;
	try {
		if (metadata.length !== 1 || metadata[0].children.length) throw new Error('Invalid drawing metadata');
		return _rapierDrawRestoreSVGRecipe(JSON.parse(metadata[0].textContent), text);
	} catch (error) {
		throw Object.assign(new Error('Drawing could not be read: ' + String(error.message || error)), { code: 'drawing_restore_failed' });
	}
}
function _rapierDrawPasteRecipe(incoming) {
	_rapierPaintFlushRevision();
	const state = _rapierDrawState, fonts = globalThis.RapierDrawFonts, joinedFonts = [...(state.recipe.fonts || [])];
	for (const font of incoming.fonts || []) {
		const prior = joinedFonts.find(saved => saved.id === font.id);
		if (prior && prior.data !== font.data) throw new Error('Font identity collision');
		if (!prior) joinedFonts.push(font);
	}
	const admittedFonts = fonts.admitFonts(joinedFonts), ids = new Map(), groups = new Map();
	let box = null;
	for (const shape of incoming.shapes) {
		ids.set(shape.id, _rapierDrawNextId());
		const b = _rapierDrawShapeBBoxIn(shape, incoming);
		box = box ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) } : b;
	}
	if (!box) return;
	const used = new Set([...state.recipe.shapes.flatMap(shape => [shape.id, shape.group]).filter(Boolean), ...ids.values()]);
	const vb = state.svgRoot.viewBox.baseVal, at = state.lastTap?.point || [vb.x + vb.width / 2, vb.y + vb.height / 2];
	// clipboard-rules.md C10: the same payload pasted again at the same point steps by the duplicate
	// offset instead of stacking on itself.
	const origin = [...ids.keys()].sort().join(',') + '@' + at[0].toFixed(1) + ',' + at[1].toFixed(1);
	const streak = state.pasteStreak, n = streak && streak.origin === origin ? streak.n + 1 : 0;
	state.pasteStreak = { origin, n };
	const shift = n * RAPIER_DRAW_COPY_OFFSET;
	const dx = at[0] - (box.minX + box.maxX) / 2 + shift, dy = at[1] - (box.minY + box.maxY) / 2 + shift;
	for (const shape of incoming.shapes) {
		_rapierDrawTranslateShape(shape, incoming, dx, dy);
		shape.id = ids.get(shape.id); delete shape.locked;
		// A shape without a width or smoothing of its own is drawn with its drawing's: pasted, it keeps the ones it was drawn with, not the destination's.
		const nib = _rapierDrawShapeNib(shape, incoming), smooth = _rapierDrawSmoothLevel(shape.smooth ?? incoming.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT);
		if (shape.nib == null && nib !== state.recipe.nib) shape.nib = nib;
		if (shape.smooth == null && smooth !== state.recipe.smooth) shape.smooth = smooth;
		if (shape.group) {
			if (!groups.has(shape.group)) { let id; do { id = 'g' + _rapierDrawNextId(); } while (used.has(id)); used.add(id); groups.set(shape.group, id); }
			shape.group = groups.get(shape.group);
		}
		if (shape.stroke != null) shape.stroke += state.recipe.strokes.length;
		if (shape.bind) for (const end of ['start', 'end']) { const to = ids.get(shape.bind[end]?.to); if (to) shape.bind[end].to = to; else delete shape.bind[end]; }
	}
	const recipe = _rapierDrawAdmitRecipe({ ...state.recipe, fonts: admittedFonts, shapes: state.recipe.shapes.concat(incoming.shapes), strokes: state.recipe.strokes.concat(incoming.strokes) }, true);
	if (!recipe) throw new Error('Drawing is too large to paste here');
	_rapierDrawSceneMarkup(recipe, false, true);
	_rapierDrawSnapshot(); state.recipe = recipe; _rapierDrawSetSelection([...ids.values()]); _rapierDrawRenderAll(); _rapierDrawSealHistory();
	state.fontReady = _rapierDrawLoadFonts(recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error'));
}
function _rapierDrawRasterDataURL(bytes, mime) {
	return 'data:' + mime + ';base64,' + RapierBundleIO.toBase64(bytes);
}
async function _rapierDrawReadImage(file, session) {
	const state = _rapierDrawState, core = globalThis.RapierDrawCore;
	const input = await _rapierReadRasterFile(file);
	if (!state.open || state.session !== session || state.finishing) return null;
	const wantsJxl = typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl';
	if (wantsJxl && input.isJxl) {
		const url = _rapierDrawRasterDataURL(input.bytes, 'image/jxl');
		if (!core._rapierDrawValidRaster(url)) throw new Error('This image is too large for the drawing canvas.');
		return { url, width: input.info.width, height: input.info.height };
	}
	if (!wantsJxl && input.mime === 'image/png') {
		const url = _rapierDrawRasterDataURL(input.bytes, 'image/png');
		if (!core._rapierDrawValidRaster(url)) throw new Error('This image is too large for the drawing canvas.');
		return { url, width: input.info.displayWidth || input.info.width, height: input.info.displayHeight || input.info.height };
	}
	// A JPEG is carried whole into JPEG XL, its coefficients as they are; one the carrier refuses is decoded below.
	if (input.mime === 'image/jpeg' && wantsJxl && _rapierJxlEncoderPresent()) {
		let carried = null;
		try { carried = await globalThis.RapierEmbeddedImages.codec('transcode', { bytes: input.bytes.slice() }); } catch (_) {}
		if (!state.open || state.session !== session || state.finishing) return null;
		if (carried?.bytes && globalThis.RapierImageAssets.validCarriedDimensions(carried.width, carried.height)) {
			const url = _rapierDrawRasterDataURL(carried.bytes, 'image/jxl');
			if (core._rapierDrawValidRaster(url)) return { url, width: carried.width, height: carried.height };
		}
	}
	let decoded = null, canvas = null;
	const releaseDecoded = () => {
		if (decoded?.close) decoded.close();
		if (decoded?.nodeName === 'IMG') decoded.removeAttribute('src');
		decoded = null;
	};
	try {
		try { decoded = await _rapierDecodeRaster(new Blob([input.bytes], { type: input.mime })); }
		catch (error) {
			if (!input.isJxl) throw error;
			const pixels = await globalThis.RapierEmbeddedImages.codec('decode', { bytes: input.bytes.slice() });
			decoded = await _rapierDecodeRaster(new Blob([pixels.bytes], { type: 'image/png' }));
		}
		if (!state.open || state.session !== session || state.finishing) return null;
		const width = decoded.naturalWidth || decoded.width, height = decoded.naturalHeight || decoded.height;
		if (!globalThis.RapierImageAssets.validAssetDimensions(width, height)) throw new Error('This image exceeds the 24 megapixel image limit.');
		canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
		const context = canvas.getContext('2d', { alpha: input.mime !== 'image/jpeg' });
		if (!context) throw new Error('Image conversion is unavailable.');
		context.drawImage(decoded, 0, 0, width, height); releaseDecoded();
		let url;
		if (wantsJxl && _rapierJxlEncoderPresent()) {
			const rgba = context.getImageData(0, 0, width, height);
			const lossless = input.mime === 'image/png';
			const encoded = await globalThis.RapierEmbeddedImages.codec('encode', { width, height, data: rgba.data, options: lossless ? { lossless: true } : { quality: 90, photo: true } });
			url = _rapierDrawRasterDataURL(encoded.bytes || encoded, 'image/jxl');
		} else {
			const blob = await _rapierCanvasBlob(canvas, 'image/png');
			if (!blob) throw new Error('Image conversion failed.');
			url = await _rapierBlobDataUrl(blob);
		}
		if (!state.open || state.session !== session || state.finishing) return null;
		if (!core._rapierDrawValidRaster(url)) throw new Error('This image is too large for the drawing canvas.');
		return { url, width, height };
	} finally {
		releaseDecoded();
		if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
	}
}
async function _rapierDrawImportImages(files) {
	const state = _rapierDrawState, session = state.session;
	if (!state.open || state.finishing || state.imageImporting || !files?.length) return;
	state.imageImporting = true;
	try {
		const source = Array.from(files).slice(0, 16), rows = [];
		for (const file of source) {
			const row = await _rapierDrawReadImage(file, session);
			if (!row) return;
			rows.push(row);
		}
		if (!rows.length || !state.open || state.session !== session || state.finishing) return;
		const vb = state.svgRoot.viewBox.baseVal, maxW = Math.max(44, vb.width * .62), maxH = Math.max(44, vb.height * .62);
		const shapes = rows.map((row, index) => {
			const scale = Math.min(1, maxW / row.width, maxH / row.height), w = row.width * scale, h = row.height * scale, step = index * RAPIER_DRAW_COPY_OFFSET;
			// The imported grid is one native pixel per unit; fitting it is a geometry transform.
			// Its original scale makes it a raster-tool target without inflating the whole stage to
			// the photo's fitted pixel density, which can exceed both the reader and surface limits.
			return { id: 'image' + (index + 1), recognized: 'paint', geom: { cx: vb.x + vb.width / 2 + step, cy: vb.y + vb.height / 2 + step, w, h }, raster: row.url, paint: { px: [row.width, row.height], scale: 1 } };
		});
		const incoming = _rapierDrawAdmitRecipe({ version: RAPIER_DRAW_VERSION, canvas: { w: state.recipe.canvas.w, h: state.recipe.canvas.h }, strokes: [], shapes });
		if (!incoming) throw new Error('These images are too large to place in one drawing.');
		// IMAGE is deliberately not a persistent tool: a successful pick enters Select and leaves the
		// inserted pictures selected so the next finger gesture can move or resize them immediately.
		await _rapierDrawSetTool('select');
		if (!state.open || state.session !== session || state.finishing || _rapierDrawTool() !== 'select') return;
		_rapierDrawPasteRecipe(incoming);
	} catch (error) {
		if (state.open && state.session === session) showToast('Image could not be added: ' + String(error?.message || error), 'error');
	} finally { if (state.session === session) state.imageImporting = false; }
}
async function _rapierDrawPasteEvent(evt) {
	evt.stopPropagation();
	if (evt.target.closest('input,textarea,select') || !evt.clipboardData || _rapierDrawState.finishing) return;
	const data = evt.clipboardData.getData(RAPIER_DRAW_CLIPBOARD), plain = evt.clipboardData.getData('text/plain');
	if (!data && !plain) return;
	evt.preventDefault();
	const state = _rapierDrawState, session = state.session;
	try {
		if (Math.max(data.length, plain.length) > 16 * 1024 * 1024) throw new Error('Clipboard drawing is too large');
		const recipe = data ? _rapierDrawAdmitRecipe(JSON.parse(data)) : _rapierDrawReadSVGRecipe(plain);
		if (data && !recipe) throw new Error('Clipboard drawing could not be read');
		await _rapierDrawSetTool('select');
		if (!state.open || state.session !== session || state.finishing || _rapierDrawTool() !== 'select') return;
		if (recipe) _rapierDrawPasteRecipe(recipe);
		else {
			if (plain.length > RAPIER_DRAW_LABEL_MAX) throw new Error('Drawing text is limited to ' + RAPIER_DRAW_LABEL_MAX + ' characters');
			const state = _rapierDrawState, vb = state.svgRoot.viewBox.baseVal, point = state.lastTap?.point || [vb.x + vb.width / 2, vb.y + vb.height / 2];
			_rapierDrawCreateText(point, point, plain);
		}
	} catch (error) { showToast(String(error.message || error), 'error'); }
}
function _rapierDrawBuildSurface() {
	const surface = document.createElement('div');
	surface.id = 'rapier-draw-surface'; surface.className = 'rapier-draw-surface'; surface.hidden = true; surface.tabIndex = -1;
	surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', 'Draw'); surface.setAttribute('aria-modal', 'true');
	surface.innerHTML = '<div class="rapier-draw-toolbar">' +
		'<div class="rapier-draw-head">' +
		// The tool box, the canvas frame, then Undo and Redo (appended below), evenly spaced (the founder, 29 September).
		'<span class="rapier-draw-head-start"><button type="button" class="rapier-draw-current-tool" data-draw-act="toolMenu" aria-haspopup="menu" aria-expanded="false"></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-canvas-toggle" data-draw-act="canvas" aria-label="Canvas colour">' + RAPIER_DRAW_ICONS.canvas + '</button></span>' +
		'<span class="rapier-draw-head-end"><span class="rapier-draw-head-clear">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--clear" data-draw-act="clear">Clear</button></span>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--done" data-draw-act="done">Done</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--stowed" data-draw-act="close">Close</button></span></div>' +
		'<div class="rapier-draw-tool-menu" role="menu" aria-label="Drawing tools" hidden>' + RAPIER_DRAW_TOOL_MENU.map(name => name === 'image'
			? '<button type="button" class="rapier-draw-tool-menu-item" role="menuitem" data-draw-act="image" aria-label="' + RAPIER_DRAW_TOOL_SAYS.image + '">' + RAPIER_DRAW_ICONS.image + '<span>Image</span></button>'
			: '<button type="button" class="rapier-draw-tool-menu-item" role="menuitemradio" data-draw-act="tool" data-draw-tool="' + name + '" aria-pressed="false" aria-label="' + RAPIER_DRAW_TOOL_SAYS[name] + '">' + RAPIER_DRAW_ICONS[name] + '<span>' + RAPIER_DRAW_TOOL_WORDS[name] + '</span></button>').join('') +
			'</div></div>' +
		'<div class="rapier-draw-settings" role="toolbar" aria-label="Tool settings"><div class="rapier-draw-settings-controls">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--quiet" data-draw-setting="copyMachine" data-draw-act="copyMachine" aria-expanded="false">Copy machine</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="ink" data-draw-act="ink" aria-label="colour" data-tip="colour" aria-expanded="false"><span class="rapier-draw-ink-dot"></span><span class="rapier-draw-btn-name">colour</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="nib" data-draw-act="nib" aria-label="width" data-tip="width" aria-expanded="false">' + RAPIER_DRAW_ICONS.width + '<span class="rapier-draw-btn-name">width</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="smooth" data-draw-act="smooth" aria-label="smooth" data-tip="smooth" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">smooth</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--dip" data-draw-setting="dip" data-draw-act="dip" aria-label="paint" data-tip="paint" aria-expanded="false">' + RAPIER_DRAW_ICONS.paint + '<span class="rapier-draw-btn-name">paint</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintBrushes" data-draw-act="paintBrushes" aria-label="brush" data-tip="brush" aria-expanded="false">' + RAPIER_DRAW_ICONS.brush + '<span class="rapier-draw-btn-name">brush</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintTools" data-draw-act="paintTools" aria-label="tool" data-tip="tool" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">tool</span></button>' +
		// Law 15: "set right now, it doesn't appear to have an icon" -- it had none, only its word low in the
		// cell. It wears the editor's own picture (the painting becomes one), its word under it as every control's.
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintSet" data-draw-act="paintSet" aria-label="set the current painting as a picture" data-tip="set">' + RAPIER_DRAW_ICONS.image + '<span class="rapier-draw-btn-name">set</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--kinds" data-draw-setting="kinds" data-draw-act="kinds" aria-label="shape" data-tip="shape" aria-expanded="false"><span class="rapier-draw-btn-name">shape</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--options" data-draw-setting="options" data-draw-act="options" aria-label="options" data-tip="options" aria-expanded="false">' + RAPIER_DRAW_ICONS.sliders + '<span class="rapier-draw-btn-name">options</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textSize" data-draw-act="textSize" aria-label="text size" data-tip="size" aria-expanded="false">' + RAPIER_DRAW_ICONS['text-size'] + '<span class="rapier-draw-btn-name">size</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textFont" data-draw-act="textFont" aria-label="font" data-tip="font" aria-expanded="false">' + RAPIER_DRAW_ICONS.typography + '<span class="rapier-draw-btn-name">font</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textSpacing" data-draw-act="textSpacing" aria-label="text spacing" data-tip="spacing" aria-expanded="false">' + RAPIER_DRAW_ICONS['space-x'] + '<span class="rapier-draw-btn-name">spacing</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textStyle" data-draw-act="textStyle" aria-label="text style" data-tip="style" aria-expanded="false">' + RAPIER_DRAW_ICONS.bold + '<span class="rapier-draw-btn-name">style</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textAlign" data-draw-act="textAlign" aria-label="text alignment" data-tip="align" aria-expanded="false">' + RAPIER_DRAW_ICONS['align-left'] + '<span class="rapier-draw-btn-name">align</span></button>' +
		// The founder (docs/intent.md, "The pressed letter"): one EFFECTS button under Type, opening a full row of effects.
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="eraseEdge" data-draw-act="eraseEdge" aria-label="eraser edge softness, for painted marks" data-tip="edge (paint)" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">edge</span></button>' +
		'</div><button type="button" class="rapier-draw-settings-collapse" data-draw-act="settingsCollapse" aria-label="Hide tool controls" aria-expanded="true">' + RAPIER_DRAW_ICONS.chevron + '</button></div>' +
		// Every secondary panel lives in one zero-height layer under the settings row and FLOATS over
		// the top of the stage (the founder: "the canvas should never move" -- an in-flow panel pushed
		// the paper down every time Colour, Width, Paint or Brushes opened). One panel is open at a time.
		'<div class="rapier-draw-panels">' +
		'<div class="rapier-draw-options" data-draw-panel="options" hidden role="group" aria-label="Options">' + [['snap', 'magnet', 'Snap to shapes', true], ['repeat', 'repeat', 'Repeat shape', false], ['proportions', 'proportions', 'Keep proportions', false], ['center', 'center', 'Resize from centre', false]].map(([act, icon, word, on]) =>
			'<button type="button" class="rapier-draw-option" role="switch" data-draw-act="' + act + '" aria-checked="' + on + '" aria-pressed="' + on + '">' + RAPIER_DRAW_ICONS[icon] + '<span>' + word + '</span><span class="rapier-draw-switch" aria-hidden="true"></span></button>').join('') +
			'<button type="button" class="rapier-draw-option" data-draw-act="unlockAll">' + RAPIER_DRAW_ICONS.unlock + '<span>Unlock all</span></button></div>' +
		'<div class="rapier-draw-colours" data-draw-panel="ink" hidden></div>' +
		'<div class="rapier-draw-smooth" data-draw-panel="smooth" hidden><label class="rapier-draw-smooth-label" for="rapier-draw-smooth-input">Smooth</label>' +
		'<input id="rapier-draw-smooth-input" class="rapier-draw-smooth-range" type="range" min="0" max="100" step="1" value="' + RAPIER_DRAW_SMOOTH_DEFAULT + '" aria-describedby="rapier-draw-smooth-word">' +
		'<output id="rapier-draw-smooth-word" class="rapier-draw-smooth-word" for="rapier-draw-smooth-input"></output></div>' +
		'<div class="rapier-draw-smooth rapier-draw-nib" data-draw-panel="nib" hidden><label class="rapier-draw-smooth-label" for="rapier-draw-nib-input">Width</label>' +
		'<input id="rapier-draw-nib-input" class="rapier-draw-nib-range" type="range" min="' + RAPIER_DRAW_NIB_MIN + '" max="' + RAPIER_DRAW_NIB_MAX + '" step="1" value="' + RAPIER_DRAW_NIB_DEFAULT + '" aria-describedby="rapier-draw-nib-word">' +
		'<output id="rapier-draw-nib-word" class="rapier-draw-nib-word" for="rapier-draw-nib-input"></output></div>' +
		'<div class="rapier-draw-dip" data-draw-panel="dip" hidden role="group" aria-label="Paint">' +
		'<div class="rapier-draw-dip-firmness"><span>Brush firmness</span><div class="rapier-draw-dip-firmness-choices">' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-strength="firm" aria-label="Firm brush response" aria-pressed="true">' + RAPIER_PAINT_ICON_GAUGE_FIRM + '<span class="rapier-draw-chip-name">firm</span></button>' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-strength="light" aria-label="Light brush response" aria-pressed="false">' + RAPIER_PAINT_ICON_GAUGE_LIGHT + '<span class="rapier-draw-chip-name">light</span></button></div></div>' +
		'<img class="rapier-draw-dip-sample" alt="" draggable="false">' +
		'<div class="rapier-draw-dip-pad" tabindex="0" role="application" aria-label="Paint load and water. Left and right for water, up and down for paint.">' +
		'<canvas class="rapier-draw-dip-field" aria-hidden="true"></canvas><span class="rapier-draw-dip-track" aria-hidden="true"><span class="rapier-draw-dip-knob"></span></span>' +
		'<span class="rapier-draw-dip-edge rapier-draw-dip-edge--load" aria-hidden="true">paint</span>' +
		'<span class="rapier-draw-dip-edge rapier-draw-dip-edge--water" aria-hidden="true">water</span></div>' +
		'<div class="rapier-draw-dip-foot"><output class="rapier-draw-dip-word" aria-live="polite"></output><span class="rapier-draw-dip-actions">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--quiet rapier-draw-dip-redip" data-draw-paint-act="redip" hidden>Re-dip</button></span></div></div>' +
		'<div class="rapier-draw-kinds" data-draw-panel="kinds" hidden role="radiogroup" aria-label="Shape"></div>' +
		'<div class="rapier-draw-brushes" data-draw-panel="paintBrushes" hidden role="radiogroup" aria-label="Brushes"></div>' +
		'<div class="rapier-draw-smooth rapier-draw-text-size" data-draw-panel="textSize" hidden><label class="rapier-draw-smooth-label" for="rapier-draw-text-size-input">Size</label>' +
		'<input id="rapier-draw-text-size-input" type="range" min="' + RAPIER_DRAW_TEXT_SIZE_MIN + '" max="' + RAPIER_DRAW_TEXT_SIZE_MAX + '" step="1" value="' + RAPIER_DRAW_TEXT_DEFAULT.textSize + '" aria-describedby="rapier-draw-text-size-word">' +
		'<output id="rapier-draw-text-size-word" class="rapier-draw-nib-word" for="rapier-draw-text-size-input">' + RAPIER_DRAW_TEXT_DEFAULT.textSize + '</output></div>' +
		'<div class="rapier-draw-text-panel rapier-draw-font-panel" data-draw-panel="textFont" hidden role="group" aria-label="Font"></div>' +
		'<div class="rapier-draw-text-spacing" data-draw-panel="textSpacing" hidden role="group" aria-label="Text spacing">' +
		'<div class="rapier-draw-metric"><label for="rapier-draw-text-tracking-input">Tracking</label><input id="rapier-draw-text-tracking-input" type="range" min="-20" max="60" step="1" value="0" aria-describedby="rapier-draw-text-tracking-word"><output id="rapier-draw-text-tracking-word">Normal</output></div>' +
		'<div class="rapier-draw-metric"><label for="rapier-draw-text-leading-input">Line spacing</label><input id="rapier-draw-text-leading-input" type="range" min="100" max="250" step="5" value="125" aria-describedby="rapier-draw-text-leading-word"><output id="rapier-draw-text-leading-word">125%</output></div>' +
		'<div class="rapier-draw-metric"><label for="rapier-draw-text-words-input">Word spacing</label><input id="rapier-draw-text-words-input" type="range" min="-20" max="100" step="1" value="0" aria-describedby="rapier-draw-text-words-word"><output id="rapier-draw-text-words-word">Normal</output></div></div>' +
		'<div class="rapier-draw-text-panel" data-draw-panel="textStyle" hidden role="group" aria-label="Text style">' +
		[['textBold', 'bold', 'Bold'], ['textItalic', 'italic', 'Italic'], ['textUnderline', 'underline', 'Underline'], ['textKern', 'kerning', 'Kerning']].map(([id, icon, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-text-style="' + id + '" aria-label="' + word + '" aria-pressed="' + (id === 'textKern') + '">' + RAPIER_DRAW_ICONS[icon] + '<span class="rapier-draw-chip-name">' + word + '</span></button>').join('') +
		// The case the words are shown in; each chip shows itself in it.
		'<span class="rapier-draw-text-cases" role="group" aria-label="Case">' + RAPIER_DRAW_TEXT_CASES.map(([id, face, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-text-case' + (id === 'small' ? ' rapier-draw-text-case--small' : '') + '" data-draw-text-case="' + id + '" aria-label="' + word + '" aria-pressed="' + !id + '">' + face + '</button>').join('') + '</span></div>' +
		'<div class="rapier-draw-text-panel" data-draw-panel="textAlign" hidden role="group" aria-label="Text alignment">' +
		[['start', 'align-left', 'Left'], ['middle', 'align-center', 'Centre'], ['end', 'align-right', 'Right']].map(([id, icon, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-text-align="' + id + '" aria-label="' + word + '" aria-pressed="' + (id === 'start') + '">' + RAPIER_DRAW_ICONS[icon] + '<span class="rapier-draw-chip-name">' + word + '</span></button>').join('') + '</div>' +
		'<div class="rapier-draw-smooth rapier-draw-erase-edge" data-draw-panel="eraseEdge" hidden><label class="rapier-draw-smooth-label" for="rapier-draw-erase-edge-input">Edge</label>' +
		'<input id="rapier-draw-erase-edge-input" class="rapier-draw-nib-range" type="range" min="0" max="100" step="1" value="0" aria-describedby="rapier-draw-erase-edge-word">' +
		'<span class="rapier-draw-edge-sample" aria-hidden="true"></span><output id="rapier-draw-erase-edge-word" class="rapier-draw-nib-word" for="rapier-draw-erase-edge-input">Hard</output></div></div>' +
		'<div class="rapier-draw-stage"><svg class="rapier-draw-canvas" xmlns="http://www.w3.org/2000/svg"><defs>' + RAPIER_DRAW_PAINT_INK_FILTER + '</defs><style class="rapier-draw-dark"></style><rect class="rapier-draw-paper" x="0" y="0"/><path class="rapier-draw-replay-lead" d=""/><g class="rapier-draw-shapes"></g><g class="rapier-draw-preview"></g><g class="rapier-draw-guides"></g><path class="rapier-draw-press-ring" d=""/><path class="rapier-draw-scribble" d=""/><path class="rapier-draw-live" d=""/><rect class="rapier-draw-marquee" hidden/><g class="rapier-draw-replay-nib" aria-hidden="true"></g></svg>' +
		'<span class="rapier-draw-nib-tag" aria-hidden="true" hidden></span>' +
		'<div class="rapier-draw-replay-bar" hidden>' +
		'<button type="button" class="rapier-draw-replay-btn" data-draw-replay="faster">Faster</button>' +
		'<button type="button" class="rapier-draw-replay-btn" data-draw-replay="skip">Skip</button></div>' +
		'<div class="rapier-draw-hint" aria-hidden="true">Tap to paint<span class="rapier-draw-hint-sub">Try blending colours</span></div></div><div class="rapier-draw-handles"></div><div class="rapier-draw-menu" hidden></div><input class="rapier-draw-font-input" type="file" accept=".ttf,.otf,font/ttf,font/otf" hidden><input class="rapier-draw-brush-input" type="file" accept=".myb,application/json" hidden><input class="rapier-draw-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/jxl,.jxl" multiple hidden>';
	surface.querySelector('.rapier-draw-head-start').append(_rapierDrawDialButton('undo'), _rapierDrawDialButton('redo'));
	_rapierDrawEffectsBuild(surface);
	document.body.appendChild(surface);
	for (const input of surface.querySelectorAll('input[type="range"]')) _rapierDrawSeekWrap(input);
	_rapierDrawGuardRowSwipes(surface);
	const state = _rapierDrawState;
	// Dismissing the chooser owns this tap; it must not leave an accidental mark underneath.
	surface.addEventListener('pointerdown', event => {
		for (const menu of surface.querySelectorAll('.rapier-draw-my-fonts[open]')) if (!menu.contains(event.target)) menu.open = false;
		if (!state.toolMenuOpen || event.target.closest('.rapier-draw-tool-menu,[data-draw-act="toolMenu"]')) return;
		_rapierDrawSetToolMenu(false);
		if (event.target.closest('.rapier-draw-stage')) { event.preventDefault(); event.stopPropagation(); }
	}, true);
	state.surface = surface; state.svgRoot = surface.querySelector('.rapier-draw-canvas'); state.svg = surface.querySelector('.rapier-draw-shapes');
	state.live = surface.querySelector('.rapier-draw-live'); state.preview = surface.querySelector('.rapier-draw-preview'); state.marqueeEl = surface.querySelector('.rapier-draw-marquee');
	state.pressRingEl = surface.querySelector('.rapier-draw-press-ring'); state.scribbleEl = surface.querySelector('.rapier-draw-scribble');
	state.stageEl = surface.querySelector('.rapier-draw-stage');
	state.replayLeadEl = surface.querySelector('.rapier-draw-replay-lead'); state.replayNibEl = surface.querySelector('.rapier-draw-replay-nib');
	state.replayTagEl = surface.querySelector('.rapier-draw-nib-tag'); state.replayBarEl = surface.querySelector('.rapier-draw-replay-bar');
	// Skip ends the replay the way a tap on the canvas does; Faster raises the multiplier. Both were
	// asked for by name (docs/briefs/agent-on-the-canvas.md, "Skip and fast forward").
	state.replayBarEl?.addEventListener('pointerdown', evt => {
		const act = evt.target.closest('[data-draw-replay]')?.dataset.drawReplay;
		if (!act) return;
		evt.preventDefault(); evt.stopPropagation();
		if (act === 'skip') _rapierDrawReplayEnd(); else _rapierDrawReplayFaster();
	});
	state.menu = surface.querySelector('.rapier-draw-menu'); state.handlesLayer = surface.querySelector('.rapier-draw-handles'); state.closeBtn = surface.querySelector('[data-draw-act="close"]'); state.guidesEl = surface.querySelector('.rapier-draw-guides'); state.fontInput = surface.querySelector('.rapier-draw-font-input'); state.paintBrushInput = surface.querySelector('.rapier-draw-brush-input'); state.imageInput = surface.querySelector('.rapier-draw-image-input'); state.hintEl = surface.querySelector('.rapier-draw-hint');
	Object.defineProperty(surface, 'rapierDrawPerf', {
		enumerable: false,
		get() {
			const recipe = state.recipe, snapshotBytes = recipe ? JSON.stringify({ ...recipe, fonts: undefined }).length : 0;
			let historyBytes = 0, deltas = 0, snapshots = 0;
			// History copies only containers: its immutable raster strings are shared by both sides
			// of adjacent deltas. Count each retained revision once, and expose reference bytes too so
			// the old duplicated cost stays visible. Include Redo and the agent baselines carried by its entries, which retain
			// pictures even when Undo is empty. Diagnostics do not serialize those picture bytes.
			let historyRasterReferencedBytes = 0; const rasterSeen = new Set();
			for (const entry of [...state.undoStack, ...state.redoStack]) {
				historyBytes += JSON.stringify(entry, (key, value) => {
					if (key !== 'raster' || typeof value !== 'string') return value;
					historyRasterReferencedBytes += value.length; rasterSeen.add(value); return undefined;
				}).length;
				if (entry?.delta) deltas++;
				else snapshots++;
			}
			let historyRasterDistinctBytes = 0; for (const raster of rasterSeen) historyRasterDistinctBytes += raster.length;
			const historyRasterBytes = historyRasterDistinctBytes;
			historyBytes += historyRasterBytes;
			return {
				geomSnapshots: state.perf.geomSnapshots,
				strokeCount: state.perf.strokeCount,
				strokeFirst100: state.perf.strokeFirst100,
				strokeBudget: RAPIER_DRAW_STROKE_CHUNK, strokeChunkCap: RAPIER_DRAW_STROKE_CHUNK_CAP, strokeGapMax: RAPIER_DRAW_STROKE_GAP_MAX,
				// strokeFrozen is the immutable prefix (head + every closed, frozen chunk) -- it only
				// ever grows by appending a new chunk at the end, never by editing what is already
				// there. strokeAll additionally includes the still-open live tail (i.e. the same array
				// _rapierDrawPaintLive and the pointerup commit read as state.stroke).
				strokeChunkCount: state.strokeChunks?.length || 0, strokeFrozen: (state.strokeHead || []).concat(...(state.strokeChunks || [])).map(p => [p[0], p[1]]),
				strokeAll: (state.stroke || []).map(p => [p[0], p[1]]),
				historyBytes, historyCount: state.undoStack.length, snapshotBytes, historyDeltas: deltas, historySnapshots: snapshots,
				historyRasterBytes, historyRasterDistinctBytes, historyRasterReferencedBytes,
			};
		},
	});
	// Capture touches across the canvas, handles and native label editor before an individual
	// tool can claim them. One palm beside a pen is ignored; two actual touches take the camera.
	const canvasTouches = state.canvasTouches = new Map();
	surface.addEventListener('pointerdown', _rapierDrawGuard(evt => {
		if (evt.pointerType !== 'touch' || !evt.target.closest('.rapier-draw-stage,.rapier-draw-handle,.rapier-draw-text-box')) return;
		canvasTouches.set(evt.pointerId, {id: evt.pointerId, screen: [evt.clientX, evt.clientY]});
		if (canvasTouches.size < 2 || state.gesture?.kind === 'zoom' || state.finishing) return;
		if (!_rapierDrawFinishText()) return;
		state.dropper?.close(false);
		const first = [...canvasTouches.values()].find(touch => touch.id !== evt.pointerId);
		const oldPointer = state.pointerId;
		state.pointerId = first.id; state.pointerScreen = first.screen;
		state.pointerPos = _rapierDrawSurfacePoint({clientX: first.screen[0], clientY: first.screen[1]});
		state.gesture ||= {kind: 'hold', tool: _rapierDrawTool(), selection: _rapierDrawSelection(), pointerType: 'touch'};
		if (oldPointer != null && oldPointer !== first.id) try { state.svgRoot.releasePointerCapture(oldPointer); } catch (_) {}
		try { state.svgRoot.setPointerCapture(first.id); } catch (_) {}
		_rapierDrawTryBeginPinch(evt);
		evt.stopImmediatePropagation();
	}), true);
	surface.addEventListener('pointermove', evt => {
		if (canvasTouches.has(evt.pointerId)) canvasTouches.get(evt.pointerId).screen = [evt.clientX, evt.clientY];
	}, true);
	for (const type of ['pointerup', 'pointercancel']) surface.addEventListener(type, evt => { canvasTouches.delete(evt.pointerId); }, true);
	surface.addEventListener('lostpointercapture', evt => { if (!state.open) canvasTouches.clear(); }, true);

	for (const target of [state.svgRoot, state.handlesLayer]) for (const [event, handler] of [['pointerdown', _rapierDrawOnPointerDown], ['pointermove', _rapierDrawOnPointerMove], ['pointerup', _rapierDrawOnPointerUp], ['pointercancel', _rapierDrawOnPointerCancel], ['lostpointercapture', _rapierDrawOnPointerCancel]]) target.addEventListener(event, _rapierDrawGuard(handler));
	// A click is the echo of the release that set echoTap when no press came between them (every press clears it), it is
	// that pointer's own (where the browser names the pointer) and it lands where the release did. Not a clock: a loaded
	// phone delivers a touch's click seconds after its press (the X7 fold: 9.7 to 13.7 s), and a late echo is an echo still.
	document.addEventListener('pointerdown', () => { state.echoTap = null; }, true);
	document.addEventListener('click', evt => {
		const echo = state.echoTap;
		if (!echo || !evt.detail && !evt.clientX && !evt.clientY || evt.pointerId > 0 && evt.pointerId !== echo.id || Math.hypot(evt.clientX - echo.x, evt.clientY - echo.y) > 16) return;
		state.echoTap = null; evt.preventDefault(); evt.stopImmediatePropagation();
	}, true);
	window.addEventListener('blur', _rapierDrawCancelGesture);
	document.addEventListener('visibilitychange', () => { if (document.hidden) { _rapierDrawBackupFlush(); _rapierDrawCancelGesture(); } });
	const reposition = () => { if (state.open && !state.gesture) { _rapierDrawFollowStage(); _rapierDrawUpdateMenu(); _rapierDrawUpdateHandles(); _rapierDrawPlaceTextInput(); _rapierPaintPlaceLive(); } };
	window.addEventListener('resize', reposition); window.visualViewport?.addEventListener('resize', reposition); window.visualViewport?.addEventListener('scroll', reposition);
	// The stage itself changes size without the window doing so (a tool's strip appears below the
	// toolbar, the keyboard leaves after Draw opened from the editing toolbar): the canvas of a new,
	// still-empty drawing follows it, and everything placed on the stage is placed again.
	if (typeof ResizeObserver === 'function') new ResizeObserver(reposition).observe(surface.querySelector('.rapier-draw-stage'));
	const togglePanel = (button, name) => {
		const panel = surface.querySelector('[data-draw-panel="' + name + '"]');
		if (!panel) return;
		const open = panel.hidden;
		_rapierDrawCloseSettingPanels(open ? name : '');
		panel.hidden = !open;
		button?.setAttribute('aria-expanded', String(open));
		if (open) {
			if (name.startsWith('text')) _rapierDrawSyncTextPanels();
			else if (name === 'eraseEdge') _rapierDrawSyncEraseEdge();
		}
		reposition();
	};
	const toolbar = async evt => {
		const button = evt.target.closest('[data-draw-act]'), act = button?.dataset.drawAct;
		if (!act) return;
		// While DONE writes nothing may change, and the dial says so as the editor's does when it cannot
		// act (law 47): its button is never `disabled`, and the arrow presses in.
		if (state.finishing) { if (act === 'undo' || act === 'redo') _rapierDialTurn(button, act === 'redo', false); return; }
		if (document.activeElement?.dataset.drawHex) document.activeElement.blur();
		// Continuing with a tool keeps the sampled colour. Cancel and Back alone discard it.
		state.dropper?.close(true);
		if (state.textEdit?.composing) {
			const session = state.session;
			state.textEdit.afterFinish = () => { if (state.open && state.session === session && button.isConnected) void toolbar({ target: button }); };
			_rapierDrawFinishText(); return;
		}
		if (!_rapierDrawFinishText()) return;
		_rapierDrawCancelGesture();
		// IMAGE is an insertion action, not a tool. Keep the chooser open behind the system picker
		// until an image is actually admitted; cancelling the picker therefore returns to the same
		// chooser and leaves the current drawing tool untouched. A successful import enters Select,
		// and `_rapierDrawSetTool('select')` closes the chooser at that point.
		if (act !== 'toolMenu' && act !== 'image') _rapierDrawSetToolMenu(false);
		if (act === 'toolMenu') { _rapierDrawSetToolMenu(!state.toolMenuOpen); return; }
		if (act === 'undo' || act === 'redo') _rapierDialTurn(button, act === 'redo', _rapierDrawUndo(act === 'redo') !== false);
		else if (act === 'options' || ['textSize', 'textFont', 'textSpacing', 'textStyle', 'textAlign', 'eraseEdge'].includes(act)) togglePanel(button, act);
		else if (['snap', 'repeat', 'proportions', 'center'].includes(act)) { const key = act === 'center' ? 'resizeFromCenter' : act; state[key] = !state[key]; button.setAttribute('aria-pressed', String(state[key])); button.setAttribute('aria-checked', String(state[key])); _rapierDrawUpdateMenu(); }
		else if (act === 'unlockAll') _rapierDrawEditSelection({ type: 'unlockAll' });
		else if (act === 'tool') _rapierDrawSetTool(button.dataset.drawTool);
		else if (act === 'canvas') {
			// The choice is the drawing's own (recipe.paper, undoable like any edit) and beats the
			// automatic white a painting brings; the paper follows at once.
			const next = _rapierDrawDarkPaper() ? 'white' : 'black';
			_rapierDrawCommand(() => { state.recipe.paper = next; });
			_rapierPaintSyncPaper();
		}
		else if (act === 'image') {
			await _rapierPrepareFileChooser('image');
			if (!state.open || state.finishing) return;
			state.imageInput.value = ''; state.imageInput.click();
		}
		else if (act === 'nib') _rapierDrawToggleNibRow();
		else if (act === 'copyMachine') { _rapierDrawEffectsOpen(); reposition(); }
		else if (act === 'smooth') _rapierDrawToggleSmoothRow();
		else if (act === 'kinds') {
			const open = !state.kindsOpen;
			_rapierDrawCloseSettingPanels(open ? 'kinds' : '');
			state.kindsOpen = open;
			button.setAttribute('aria-expanded', String(open));
			_rapierDrawUpdateShapeRow(); reposition();
		}
		else if (act === 'dip') {
			const open = !!_rapierPaintDipPanel()?.hidden;
			_rapierDrawCloseSettingPanels(open ? 'dip' : '');
			_rapierPaintDipOpen(open); reposition();
		}
		else if (act === 'paintBrushes' || act === 'paintTools') {
			const mode = act === 'paintTools' ? 'tools' : 'brushes', open = state.paintPicker !== mode;
			_rapierDrawCloseSettingPanels(open ? act : '');
			_rapierPaintSetPicker(mode, open); button.setAttribute('aria-expanded', String(open)); reposition();
		}
		else if (act === 'paintUpload') void _rapierDrawPaintUpload();
		else if (act === 'fontUpload') {
			state.fontUploadTarget = 'default';
			await _rapierPrepareFileChooser('font');
			if (!state.open || state.finishing) return;
			state.fontInput.value = ''; state.fontInput.click();
		}
		else if (act === 'paintExport') _rapierPaintExportBrush(_rapierPaintBrushId());
		else if (act === 'paintSet') void _rapierPaintRequestSetLayer();
		else if (act === 'settingsCollapse') { _rapierDrawSetSettingsCollapsed(!state.settingsCollapsed); reposition(); }
		else if (act === 'clear') void _rapierDrawRequestClear();
		else if (act === 'ink') {
			const open = !state.colourOpen;
			_rapierDrawCloseSettingPanels(open ? 'ink' : '');
			state.colourOpen = open; button.setAttribute('aria-expanded', String(open));
			_rapierDrawUpdateInkBtn(); reposition();
		}
		else if (act === 'done') void _rapierDrawFinish();
		else if (act === 'close') void _rapierDrawClose({ recover: true });
	};
	for (const selector of ['.rapier-draw-head', '.rapier-draw-tool-menu', '.rapier-draw-settings', '.rapier-draw-options']) _rapierDrawBindTap(surface.querySelector(selector), evt => { void toolbar(evt); });
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-kinds'), evt => { const kind = evt.target.closest('[data-draw-kind]')?.dataset.drawKind; if (kind && !state.finishing) { state.kindsOpen = false; _rapierDrawSetShapeKind(kind); _rapierDrawUpdateShapeRow(); } });
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-brushes'), evt => { const id = evt.target.closest('[data-draw-paint-brush]')?.dataset.drawPaintBrush; if (id && !state.finishing) _rapierPaintSetBrush(id); });
	for (const [selector, key, read] of [
		['[data-draw-panel="textFont"]', 'textFont', target => target.dataset.drawTextFont],
		['[data-draw-panel="textAlign"]', 'labelAlign', target => target.dataset.drawTextAlign],
	]) _rapierDrawBindTap(surface.querySelector(selector), evt => {
		if (selector === '[data-draw-panel="textFont"]' && evt.target.closest('[data-draw-act="fontUpload"]')) { void toolbar(evt); return; }
		const effect = evt.target.closest('[data-draw-text-effect]');
		if (effect && !state.finishing) { _rapierDrawToggleTextEffect(effect.dataset.drawTextEffect); return; }
		const figures = evt.target.closest('[data-draw-text-figures]');
		if (figures && !state.finishing) { _rapierDrawSetTextDefault('textFigures', figures.dataset.drawTextFigures); return; }
		const target = evt.target.closest('[data-draw-text-font],[data-draw-text-align]');
		if (target && !state.finishing) _rapierDrawSetTextDefault(key, read(target));
	});
	_rapierDrawBindTap(surface.querySelector('[data-draw-panel="textStyle"]'), evt => {
		const cased = evt.target.closest('[data-draw-text-case]');
		if (cased && !state.finishing) { _rapierDrawSetTextDefault('textCase', cased.dataset.drawTextCase); return; }
		const target = evt.target.closest('[data-draw-text-style]');
		if (!target || state.finishing) return;
		const key = target.dataset.drawTextStyle, style = _rapierDrawTextDefaults();
		_rapierDrawSetTextDefault(key, !style[key]);
	});
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-colours'), _rapierDrawMenuAction);
	_rapierDrawBindTap(state.menu, _rapierDrawGuard(_rapierDrawMenuAction));
	state.fontInput.addEventListener('change', () => {
		const file = state.fontInput.files?.[0], target = state.fontUploadTarget || 'selection';
		state.fontInput.value = ''; state.fontUploadTarget = null;
		if (file) void _rapierDrawUploadFont(file, target);
	});
	state.paintBrushInput.addEventListener('change', () => { const file = state.paintBrushInput.files?.[0]; state.paintBrushInput.value = ''; if (file) void _rapierPaintUploadBrush(file); });
	state.imageInput.addEventListener('change', () => { const files = Array.from(state.imageInput.files || []); state.imageInput.value = ''; if (files.length) void _rapierDrawImportImages(files); });
	const tracking = surface.querySelector('#rapier-draw-text-tracking-input'), leading = surface.querySelector('#rapier-draw-text-leading-input'), eraseEdge = surface.querySelector('#rapier-draw-erase-edge-input'), textSize = surface.querySelector('#rapier-draw-text-size-input');
	textSize.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetTextDefault('textSize', textSize.value); });
	tracking.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetTextDefault('letterSpacing', Number(tracking.value) / 100); });
	leading.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetTextDefault('lineHeight', Number(leading.value) / 100); });
	const words = surface.querySelector('#rapier-draw-text-words-input');
	words.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetTextDefault('wordSpacing', Number(words.value) / 100); });
	eraseEdge.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetEraseSoftness(eraseEdge.value); });
	for (const event of ['copy', 'cut']) surface.addEventListener(event, _rapierDrawCopyEvent);
	surface.addEventListener('paste', _rapierDrawPasteEvent);
	state.menu.addEventListener('change', evt => { const key = evt.target.dataset.drawProperty; if (key) _rapierDrawSetProperty(key, evt.target.value); });
	state.menu.addEventListener('input', evt => {
		const input = evt.target, key = input.dataset.drawProperty;
		if (!key || input.type !== 'range') return;
		const out = input.closest('.rapier-draw-control')?.querySelector('output');
		if (out) out.textContent = (RAPIER_DRAW_PROP_WORD[key] || String)(input.value);
		if (key === 'transparency') _rapierDrawSetFade(input.value, true);
	});
	for (const which of ['nib', 'smooth']) {
		const input = surface.querySelector('#rapier-draw-' + which + '-input');
		input.addEventListener('pointerdown', evt => { evt.stopPropagation(); state.settingEdit = { changed: false }; });
		input.addEventListener('keydown', evt => { if (!evt.repeat) state.settingEdit = { changed: false }; });
		input.addEventListener('input', evt => { evt.stopPropagation(); if (!state.finishing) _rapierDrawSetSetting(which, input.value); });
		for (const event of ['change', 'blur', 'keyup', 'pointercancel']) input.addEventListener(event, () => { state.settingEdit = null; reposition(); });
	}
	surface.addEventListener('input', evt => {
		const input = evt.target, scope = input.dataset.drawColour;
		if (input.dataset.drawHex) { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); }
		if (!scope) return;
		_rapierDrawSetColour(scope, input.value, true);
		const hex = input.closest('.rapier-draw-colour-editor')?.querySelector('[data-draw-hex]');
		if (hex) hex.value = input.value.toUpperCase();
	});
	// `change` applies the colour as well: a platform colour dialog may commit without ever firing `input`.
	surface.addEventListener('change', evt => {
		const input = evt.target, scope = input.dataset.drawColour;
		if (scope) _rapierDrawChooseColour(scope, input.value, true);
		else if (input.dataset.drawHex) _rapierDrawCommitHex(input);
	});
	surface.addEventListener('contextmenu', evt => { if (!evt.target.closest('input,textarea,select')) evt.preventDefault(); });
	surface.addEventListener('keydown', async evt => {
		evt.stopPropagation();
		if (evt.defaultPrevented || evt.isComposing || evt.keyCode === 229) return;
		if (_rapierTrapModalTab(evt, surface)) return;
		if (evt.target.dataset.drawHex) {
			if (evt.key === 'Enter') { evt.preventDefault(); if (_rapierDrawCommitHex(evt.target)) surface.focus({ preventScroll: true }); else evt.target.reportValidity(); }
			else if (evt.key === 'Escape') { evt.preventDefault(); _rapierDrawUpdateInkBtn(); _rapierDrawUpdateMenu(); surface.focus({ preventScroll: true }); }
			return;
		}
		// ZA3 F3: the sampler owns the keyboard while it is open -- every key but its own Escape is
		// left alone, and Escape dismisses only the sampler, never the drawing underneath it.
		if (state.dropper) { if (evt.key === 'Escape') { evt.preventDefault(); state.dropper.close(false); } return; }
		// Undo, Redo and Select all are Draw's wherever the focus is but in the words being typed: a click on a toolbar button or a drag
		// on a slider leaves the focus there, and Ctrl+Z did nothing (a button owns its Enter and Space, a slider its arrows; neither owns the chord).
		if ((evt.ctrlKey || evt.metaKey) && !state.finishing && !evt.target.closest('input[type="text"],textarea') && ['z', 'y'].includes(evt.key.toLowerCase())) { evt.preventDefault(); _rapierDrawUndo(evt.shiftKey || evt.key.toLowerCase() === 'y'); return; }
		if ((evt.ctrlKey || evt.metaKey) && !state.finishing && !evt.target.closest('input[type="text"],textarea') && evt.key.toLowerCase() === 'a') {
			evt.preventDefault();
			const session = state.session;
			await _rapierDrawSetTool('select');
			if (!state.open || state.session !== session || _rapierDrawTool() !== 'select') return;
			// The tool switch can hide the very button that had the focus, and the keys after this chord (Delete, the arrows) need a focus to reach.
			if (!surface.contains(document.activeElement)) surface.focus({ preventScroll: true });
			_rapierDrawSetSelection(_rapierDrawGroupSelection(state.recipe, state.recipe.shapes.map(shape => shape.id))); _rapierDrawRenderAll(); return;
		}
		// Delete and Backspace belong to no button and no slider: with a selection they remove it wherever the focus is but in the words being typed.
		if ((evt.key === 'Delete' || evt.key === 'Backspace') && !state.finishing && !evt.target.closest('input[type="text"],textarea,select') && _rapierDrawTool() === 'select' && _rapierDrawSelection().length && !_rapierDrawSelectionLocked()) { evt.preventDefault(); _rapierDrawEditSelection({ type: 'delete' }); return; }
		// Choice buttons keep native Enter/Space and arrow-key scrolling; canvas shortcuts must
		// not open a label editor or move the drawing while a property control owns focus.
		if (evt.target.closest('input,textarea,select,[data-draw-menu-act="property"]') || state.finishing) return;
		// Phone contract: a live gesture cancels; else an existing selection deselects; else Escape
		// resolves exactly like Back (_rapierDrawHandleBack, wired into engine.js's rapierHandleBack
		// for the hardware/browser case) -- commit as Done when the canvas differs from what Draw
		// opened with, close without writing when it does not. No confirmation popup either way.
		if (evt.key === 'Escape') {
			evt.preventDefault();
			if (state.toolMenuOpen) _rapierDrawSetToolMenu(false);
			else if (state.gesture) _rapierDrawCancelGesture();
			else if (_rapierDrawSelection().length) { _rapierDrawSetSelection([]); _rapierDrawRenderAll(); }
			else _rapierDrawHandleBack();
			return;
		}
		if (evt.target.closest('.rapier-draw-dip-pad')) return;
		// A toolbar control owns its native activation. Handles still own canvas movement.
		if (evt.target.closest('button,a[href],[role="button"]') && !evt.target.closest('[data-draw-handle]')) return;
		if (_rapierDrawTool() !== 'select') return;
		if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'd') { evt.preventDefault(); _rapierDrawEditSelection({ type: 'duplicate' }); return; }
		if (evt.key === 'Enter' && _rapierDrawSelection().length === 1) { evt.preventDefault(); _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0]); return; }
		if (!_rapierDrawSelection().length) {
			if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.key.length === 1 && /\S/.test(evt.key)) { evt.preventDefault(); const vb = state.svgRoot.viewBox.baseVal; _rapierDrawCreateText([vb.x + vb.width / 2, vb.y + vb.height / 2], undefined, evt.key); }
			return;
		}
		if (_rapierDrawSelectionLocked()) return;
		if (evt.key === 'Delete' || evt.key === 'Backspace') { evt.preventDefault(); _rapierDrawEditSelection({ type: 'delete' }); return; }
		const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[evt.key];
		if (!delta) {
			if (_rapierDrawSelection().length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.key.length === 1 && /\S/.test(evt.key)) { evt.preventDefault(); _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0], { initial: evt.key }); }
			return;
		}
		evt.preventDefault();
		const scale = _rapierDrawViewTransform(state.svgRoot.getBoundingClientRect(), state.svgRoot.viewBox.baseVal).scale, amount = (evt.shiftKey ? 10 : 1) / scale;
		const handle = state.handles?.find(handle => handle.id === evt.target.dataset.drawHandle);
		const origin = handle ? handle.point : [0, 0];
		state.gesture = { kind: handle ? 'handle' : 'move', origin, selection: _rapierDrawSelection(), handle, scale };
		_rapierDrawGuard(handle ? _rapierDrawApplyHandle : _rapierDrawApplyMove)([origin[0] + delta[0] * amount, origin[1] + delta[1] * amount], { ctrlKey: true });
		_rapierDrawEndGesture(); _rapierDrawRenderAll();
		if (handle) state.handlesLayer.querySelector('[data-draw-handle="' + handle.id + '"]')?.focus({ preventScroll: true });
	});
}
// Only transient values: resource release, stored defaults and recipe setup keep their order.
function _rapierDrawFreshSession() {
	return {
		pasteStreak: null, ink: null, inkChosen: false, colourOpen: false, snap: true, repeat: false,
		lastTap: null, proportions: false, resizeFromCenter: false, settingEdit: null, colourEdit: false, fadeEdit: false,
		toolMenuOpen: false, settingsCollapsed: false, kindsOpen: false, paintPicker: null, imageImporting: false,
		effectsScope: 'drawing', effectsSelection: [], effectsLayer: null, effectsSweep: null, effectsCompare: false,
	};
}
function _rapierDrawOpenSurface(options) {
	if (!_rapierDrawState.surface) _rapierDrawBuildSurface();
	const state = _rapierDrawState, opts = options || {};
	if (state.finishing) return;
	if (state.open) { state.surface.focus({ preventScroll: true }); showToast('Finish or close this drawing before opening another. Your work is still here.', 'info'); return; }
	state.dropper?.close(false);
	_rapierDrawReplayEnd();
	_rapierDrawCancelGesture(); _rapierDrawCloseLabelInput(); _rapierDrawFontFacesClear();
	const recipe = opts.recipe ? _rapierDrawAdmitRecipe(opts.recipe, opts.keepRasters === true) : _rapierDrawNewRecipe(1, 1);
	if (!recipe) { showToast('This drawing could not be opened', 'error'); return; }
	void _rapierDrawBackupRelease(); // A31: the replaced session is no longer a live drawing.
	state.recipe = recipe; state.undoStack = []; state.redoStack = []; state.session = (state.session || 0) + 1;
	if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
	state.backupDirty = false;
	state.seq = recipe.shapes.reduce((max, shape) => { const n = /^s\d+$/.test(shape.id) ? Number(shape.id.slice(1)) : 0; return Number.isSafeInteger(n) && n < Number.MAX_SAFE_INTEGER - 4096 ? Math.max(max, n) : max; }, 0);
	// The pen -- the width and smoothing the next mark takes -- is the person's, remembered on this device (or the note's own in
	// Notes), and a drawing opens with it whichever drawing it is: what a stroke was drawn with is its own (`shape.nib`,
	// `shape.smooth`), never the pen's, so nothing already drawn follows it. The recipe's own `nib` and `smooth` are what a
	// shape that carries none is drawn with (a fresh canvas records the pen's; a recipe written without them keeps the defaults it was drawn at).
	state.smooth = _rapierDrawSmoothLevel(_rapierDrawRemembered('smooth'));
	state.nib = _rapierDrawNibLevel(_rapierDrawRemembered(opts.notes ? 'notesNib' : 'nib'));
	recipe.smooth ??= opts.recipe ? RAPIER_DRAW_SMOOTH_DEFAULT : state.smooth; recipe.nib ??= opts.recipe ? RAPIER_DRAW_NIB_DEFAULT : state.nib;
	state.editing = opts.editing || null; state.insertTarget = opts.target || null; state.notes = opts.notes || null;
	// A29 item 12 (open-work.md "R86s, closed", item 1): a NEW drawing opens in Paint -- the thing the
	// product is for, under the words the founder wrote for it (law 8). Re-opening an EXISTING
	// drawing opens on the tool it was last edited with (`recipe.tool`, written by Done and the
	// backup), so somebody halfway through a vector figure is not dragged into Paint every time they
	// come back; a drawing that names no tool opens in Select (law 4).
	// A new drawing in a note opens on Notes' own last tool (RAPIER_DRAW_NOTES_TOOLS, above).
	state.tool = state.editing ? (RAPIER_DRAW_TOOLS.includes(recipe.tool) ? recipe.tool : 'select') : state.notes ? _rapierDrawRemembered('notesTool') : 'brush';
	state.pen = state.tool === 'pen';
	// A canvas a Notes door opened shows no note title (docs/intent.md law 13, the founder: "We don't need to
	// display the note title. The user already knows they're in a note."); the note's name is the canvas's
	// accessible name alone, and Back's question speaks of it.
	state.surface.setAttribute('aria-label', state.notes ? 'Draw, ' + state.notes.label : 'Draw');
	state.shapeKind = _rapierDrawRemembered('shapeKind');
	_rapierDrawSetHint();
	Object.assign(state, _rapierDrawFreshSession());
	state.eraseSoftness = _rapierDrawRemembered('eraseSoftness');
	_rapierDrawTextDefaults();
	state.menuPane = null; state.menuColour = false;
	state.paintBrush = _rapierPaintRememberedBrush(); state.paintSize = _rapierPaintRememberedSize(); state.paintStrength = _rapierPaintRememberedStrength(); state.paper = false; state.paperBlack = false; if (typeof _rapierPaintShownAs !== 'undefined') _rapierPaintShownAs.clear(); _rapierPaintCloseLayer(); state.surface.classList.remove('rapier-draw-surface--paper', 'rapier-draw-surface--black');
	// A fresh document (a new drawing, or the same one reopened) is the one other boundary that
	// forgets the chosen painting (Astra-R75 P01): a stale shape id from an earlier editing session
	// must never be read as "chosen" against an unrelated recipe.
	state.paintChosenId = null;
	_rapierDrawSetToolMenu(false); _rapierDrawSetSettingsCollapsed(false); _rapierDrawCloseSettingPanels();
	for (const action of ['snap', 'repeat', 'proportions', 'center']) {
		const btn = state.surface.querySelector('[data-draw-act="' + action + '"]'), on = action === 'snap';
		btn?.setAttribute('aria-pressed', String(on)); btn?.setAttribute('aria-checked', String(on));
	}
	_rapierDrawSyncTextPanels(); _rapierDrawSyncEraseEdge();
	_rapierDrawSetSelection([]); _rapierDrawUpdatePenBtn(); _rapierDrawUpdateShapeRow(); _rapierDrawUpdateInkBtn(); _rapierDrawSetCloseVisible(false);
	if (!state.open) {
		state.focusBeforeOpen = document.activeElement;
		state.releaseIsolation = _rapierInstallModalIsolation(state.surface);
	}
	// A canvas a Notes door opened comes up on a short fade -- over the note, or over the plate Notes
	// grows from the + bar's DRAW (notes/notes.js _rapierNotesDrawLift) -- and leaves on the same fade
	// (_rapierDrawLeave). The fade in is the stylesheet's (@starting-style, rapier-draw.css): it begins
	// in the first frame the canvas is shown. Nothing fades under reduced motion. A canvas reopened while
	// the last one is still leaving takes it back.
	clearTimeout(state.leaving); state.surface.classList.remove('rapier-draw-surface--closed', 'rapier-draw-surface--leave');
	state.surface.classList.toggle('rapier-draw-surface--notes', !!state.notes);
	state.surface.hidden = false; document.body.classList.add('rapier-draw-open'); state.open = true; state.surface.focus({ preventScroll: true });
	// On the web a canvas over the editor holds a history entry of its own, so the browser's Back lands in
	// Draw's question and not on the page under it (law 56; editor/engine.js _rapierBackWant).
	if (typeof _rapierBackHold === 'function') _rapierBackHold();
	if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('draw', true);
	const session = state.session;
	state.fontReady = _rapierDrawLoadFonts(recipe, session).then(() => { if (state.open && state.session === session) _rapierDrawRenderAll(); }).catch(error => { if (state.open && state.session === session) showToast('Font could not load: ' + String(error.message || error), 'error'); throw error; });
	state.fontReady.catch(() => {});
	_rapierDrawLettersWake();
	requestAnimationFrame(() => {
		if (!state.open || state.session !== session) return;
		const rect = state.svgRoot.getBoundingClientRect();
		// A new canvas is the stage less the settings row's band, so it opens whole and clear of the row.
		state.viewInset = _rapierDrawSettingsInset();
		if (!opts.recipe) recipe.canvas = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height - state.viewInset)) };
		state.canvasFollowsStage = !opts.recipe;
		// The canvas is decided once, here: later chrome (keyboard, a toolbar row, the URL bar)
		// must never resize it, only a real window-size change (device rotated) may.
		state.openWindow = { w: innerWidth, h: innerHeight };
		// A drawing that arrives with work off its paper (a box dragged past the edge before the paper
		// followed content) takes its paper first, so the opening view shows all of it.
		if (opts.recipe) _rapierDrawGrowCanvasToContent();
		state.view = { x: 0, y: 0, k: 1 };
		// The zoom is 1 against THIS canvas: a drawing opens showing the whole of its own paper.
		_rapierDrawViewBaseReset(rect);
		_rapierDrawApplyView();
		_rapierDrawRenderAll();
		// Taken once the canvas is settled (post-measurement for a brand-new drawing, so its own
		// canvas.w/h assignment above never itself reads as a change) -- this is what Back, Escape
		// and Done's own unchanged-editing check below compare the live recipe against.
		// Recovery is an edit against the document's original, not against the rescued work.
		const baseline = opts.baselineRecipe;
		if (baseline) { baseline.smooth ??= RAPIER_DRAW_SMOOTH_DEFAULT; baseline.nib ??= RAPIER_DRAW_NIB_DEFAULT; }
		state.openSnapshot = _rapierDrawHistoryRecipe(baseline || state.recipe);
	});
}
// The fade a canvas a Notes door opened comes up and leaves on (rapier-draw.css, the house ease).
const RAPIER_DRAW_FADE_MS = 200;
function _rapierDrawStill() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
// Draw's moments (docs/paint-tools.md, "Draw's moments"; the afternoon list's law 1): each one Web Animation of transform
// and opacity alone, which the compositor runs without the page's main thread, played on an element a person sees and
// let go of when it ends. A moment played again while it runs starts over from its first frame; under reduced motion,
// in a hidden page and on an element no longer in the page none plays. [keyframes, ms, easing, pseudo-element].
const RAPIER_DRAW_MOMENTS = Object.freeze({
	// A brush picked lays its sample across its card, left to right, as the brush lays paint: its left edge stays put
	// (the card is 48 px wide, rapier-draw.css), so the finger's press on the chip still gives about its middle.
	dab: [[{ transform: 'translateX(-19.68px) scaleX(.18)', opacity: .3 }, { transform: 'translateX(.96px) scaleX(1.04)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 340, 'cubic-bezier(.2,.7,.2,1)'],
	// A tool picked, a mark not a sample: it comes up to size.
	pop: [[{ transform: 'scale(.6)', opacity: .4 }, { transform: 'scale(1.12)', opacity: 1, offset: .6 }, { transform: 'none', opacity: 1 }], 300, 'cubic-bezier(.2,.7,.2,1)'],
	// COLOUR takes a new colour from its middle out, the way paper takes ink (the notes cards' wash, at the dot's size).
	wash: [[{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 380, 'cubic-bezier(.3,.7,.3,1)', '::after'],
	// The tool box takes a new tool: its mark rises into the box, its word a beat behind.
	rise: [[{ transform: 'translateY(8px) scale(.7)', opacity: 0 }, { transform: 'translateY(-1px) scale(1.06)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 260, 'cubic-bezier(.2,.7,.2,1)'],
	riseWord: [[{ transform: 'translateY(4px)', opacity: 0 }, { transform: 'translateY(4px)', opacity: 0, offset: .25 }, { transform: 'none', opacity: 1 }], 260, 'ease-out'],
	// PRESSED on: the P is pressed into the paper and springs back; off, it lifts out of it.
	press: [[{ transform: 'none' }, { transform: 'translateY(1px) scale(.82)', offset: .35 }, { transform: 'scale(1.04)', offset: .72 }, { transform: 'none' }], 380, 'ease-out'],
	lift: [[{ transform: 'none' }, { transform: 'translateY(-2px) scale(1.1)', offset: .4 }, { transform: 'none' }], 320, 'ease-out'],
	// SET: a sheet of the paper's own colour, a breath above the picture just set, settles onto it and is gone.
	laid: [[{ transform: 'translateY(-10px) scale(1.03)', opacity: .6 }, { transform: 'none', opacity: .32, offset: .45 }, { transform: 'none', opacity: 0 }], 520, 'cubic-bezier(.2,.7,.3,1)'],
	// DONE: the drawing comes down into the prose and lands, as a card lands.
	land: [[{ transform: 'translateY(22px) scale(.95)', opacity: 0 }, { transform: 'translateY(-3px) scale(1.005)', opacity: 1, offset: .62 }, { transform: 'none', opacity: 1 }], 480, 'cubic-bezier(.2,.7,.2,1)'],
	// The pad's new sample breathes in when it arrives, a beat after the hand stops.
	breathe: [[{ opacity: .5 }, { opacity: 1 }], 260, 'ease-out'],
	// The fold: the chevron crosses to its other edge turning, and the drawing glides to where the row's height put it.
	foldChevron: [(dx, from, to) => [{ transform: 'translateX(' + dx + 'px) rotate(' + from + 'deg)' }, { transform: 'rotate(' + to + 'deg)' }], 200, 'cubic-bezier(.2,.7,.2,1)'],
});
const _rapierDrawPlaying = new WeakMap();
function _rapierDrawPlay(el, name, ...args) {
	// Nothing to play on, nothing read: the element is looked at before the table.
	if (!el?.isConnected || typeof el.animate !== 'function' || document.hidden || _rapierDrawStill()) return null;
	const moment = RAPIER_DRAW_MOMENTS[name];
	if (!moment) return null;
	const [keyframes, duration, easing, pseudoElement] = moment, playing = _rapierDrawPlaying.get(el) || new Map();
	playing.get(name)?.cancel();
	const animation = el.animate(typeof keyframes === 'function' ? keyframes(...args) : keyframes, { id: 'rapier-draw-' + name, duration, easing, fill: pseudoElement ? 'forwards' : 'none', ...(pseudoElement ? { pseudoElement } : {}) });
	playing.set(name, animation); _rapierDrawPlaying.set(el, playing);
	animation.finished.then(() => { if (playing.get(name) === animation) playing.delete(name); }, () => {});
	return animation;
}
// DONE's moment, once the drawing is in its document: the picture it became lands, if a person can see it. It is
// found by its reference (on dark paper its source is the re-inked copy, images/browser.js presentUrl) and lands only
// once the document shows it painted, never as the placeholder it is until then. The document draws it in its own
// time, so it is looked for over the next frames, and played only once.
function _rapierDrawLand(label, frames = 30) {
	if (!label || _rapierDrawStill()) return;
	requestAnimationFrame(() => {
		const img = [...document.querySelectorAll('#editor-blocks img[data-rapier-asset]')].find(el => el.getAttribute('data-rapier-asset') === label);
		if (img?.dataset.rapierAssetState !== 'ready') { if (frames > 1) _rapierDrawLand(label, frames - 1); return; }
		const box = img.getBoundingClientRect();
		if (box.bottom > 0 && box.top < innerHeight && box.width) _rapierDrawPlay(img, 'land');
	});
}
// A new drawing's canvas is the stage, measured once the window has actually changed size (a real
// rotation) while nothing has been drawn -- never for chrome that comes and goes underneath the
// same window (a toolbar row, the keyboard). The first mark fixes the canvas; a re-measure is not
// a change to undo or to ask about on Back.
function _rapierDrawFollowStage() {
	const state = _rapierDrawState, recipe = state.recipe;
	if (!state.open || !state.canvasFollowsStage || !recipe || state.gesture) return;
	// Transient chrome (keyboard, a toolbar row appearing, the URL bar) resizes the stage or
	// visualViewport without the window itself changing size -- only a real window-size change
	// (device rotated) is a reason for a still-empty canvas to move (the founder: "the canvas
	// should never move... it moves when the keyboard comes up").
	if (innerWidth === state.openWindow.w && innerHeight === state.openWindow.h) return;
	if (recipe.strokes.length || recipe.shapes.length || state.undoStack.length || state.redoStack.length || state.paintLayer?.surface?.bounds()) { state.canvasFollowsStage = false; return; }
	state.openWindow = { w: innerWidth, h: innerHeight };
	const rect = state.svgRoot.getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height - (state.viewInset || 0)));
	if (w === recipe.canvas.w && h === recipe.canvas.h) return;
	recipe.canvas = { w, h };
	// A still-empty canvas taking the stage's size after a real rotation is a new canvas to the
	// person, so the window is measured against it again. A canvas GROWN under a stroke is not.
	_rapierDrawViewBaseReset(rect);
	_rapierDrawApplyView();
	// R84. This is THE line that cleared the founder's canvas, and it was deliberate code. The stage
	// rect changing is a VIEW event -- a zoom, a rotation, a keyboard opening -- and it used to
	// answer an over-budget live painting by DISCARDING it, toast and all ("I kept drawing and then
	// I zoomed a little and then all of a sudden the whole canvas cleared").
	//
	// A view event may never destroy work. Closing now commits (_rapierPaintCloseLayer), and the
	// budget cannot refuse a closing commit, so the painting survives the zoom as a picture. The
	// deliberate discard stays exactly where a person asks for it: Undo.
	if (state.paintLayer && state.paintLayer.id == null) _rapierPaintCloseLayer();
	state.openSnapshot = _rapierDrawHistoryRecipe();
	_rapierDrawRenderAll();
}
// A canvas up over the editor rather than a note's: it holds a history entry of its own on the web
// (law 56; editor/engine.js _rapierBackWant); a note's canvas is carried by Notes' entries.
function _rapierDrawOverEditor() { return _rapierDrawState.open && !_rapierDrawState.notes; }
// `landed`: the drawing has just gone into its document; every other close keeps nothing new.
async function _rapierDrawClose({ recover = false, landed = false } = {}) {
	const state = _rapierDrawState, notes = state.notes;
	// The failure-path Close has not placed or downloaded anything. Close only after its own
	// checkpoint closes; a quota/readback refusal keeps the drawing open, not merely a toast.
	if (recover) {
		if (state.finishing || !state.open) return;
		const session = state.session;
		state.finishing = true;
		try {
			const pending = _rapierPaintPendingStroke();
			if (pending) { await pending; if (!state.open || state.session !== session) return; }
			_rapierDrawCancelGesture(); _rapierPaintSettleOverflow();
			_rapierDrawBackupTouch();
			await _rapierDrawBackupWrite(true);
			await state.backupIO;
			if (state.backupDirty || !state.open || state.session !== session) return;
		} catch (error) {
			showToast('This drawing could not be backed up, so it stays open: ' + String(error?.message || error), 'error');
			return;
		} finally { state.finishing = false; }
	}
	// ZA3 F3: closing Draw retires an active or pending sampler, so a late decode from this session
	// cannot mount a pad or move colours in whatever opens next.
	state.dropper?.close(false);
	_rapierDrawReplayEnd();
	state.renderEdit = null;
	_rapierDrawCancelGesture(); _rapierDrawCloseLabelInput(); _rapierDrawFontFacesClear();
	// The settlement law (Astra-R75 P02, R85b): closing Draw outright never drops a live layer still
	// holding pixels the working budget refused -- it keeps them, so a Done that failed and a close
	// after it still have the painting to write.
	_rapierPaintSettleOverflow(); _rapierPaintCloseLayer();
	// Nothing is listened to once Draw is shut: the phone's orientation is Paint's business only.
	if (typeof _rapierPaintTiltOff === 'function') _rapierPaintTiltOff();
	const surface = state.surface;
	if (surface && notes) surface.classList.add('rapier-draw-surface--closed'); else if (surface) surface.hidden = true;
	document.body.classList.remove('rapier-draw-open');
	state.releaseIsolation?.(); state.releaseIsolation = null;
	const origin = state.focusBeforeOpen; state.focusBeforeOpen = null;
	if (origin?.isConnected && !origin.closest('[inert]')) origin.focus({ preventScroll: true });
	state.open = false; state.session = (state.session || 0) + 1; state.editing = null; state.insertTarget = null; state.notes = null; state.openSnapshot = null;
	if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('draw', false);
	if (typeof _rapierBackHold === 'function') _rapierBackHold(); // the canvas's own history entry goes with it (law 56)
	void _rapierDrawBackupRelease(); // Drain admitted writes, then let another window recover it.
	_rapierDrawSetSelection([]); _rapierDrawUpdateHandles();
	// A Notes canvas that kept nothing tells its door (notes/notes.js _rapierNotesDrawFor), which may
	// need a moment to make ready what the canvas leaves over.
	if (surface && notes) _rapierDrawLeave(surface, landed ? null : notes.closed?.());
}
// A canvas a Notes door opened leaves on the fade it came up on, over what stands under it once that
// is ready: at once over the note, or, for the + bar's canvas that kept nothing, when Notes has taken
// back the empty note made for it and brought the cards up under the canvas (`under`; at most
// RAPIER_DRAW_LEAVE_WAIT_MS), so that note is never seen. It is closed from the first moment, and a
// finger goes through it. Under reduced motion it goes without the fade.
const RAPIER_DRAW_LEAVE_WAIT_MS = 600;
function _rapierDrawLeave(surface, under) {
	const state = _rapierDrawState, session = state.session;
	const go = () => {
		if (state.open || state.session !== session) return;
		if (_rapierDrawStill()) { surface.hidden = true; surface.classList.remove('rapier-draw-surface--closed'); return; }
		surface.classList.add('rapier-draw-surface--leave');
		state.leaving = setTimeout(() => { surface.hidden = true; surface.classList.remove('rapier-draw-surface--closed', 'rapier-draw-surface--leave'); }, RAPIER_DRAW_FADE_MS);
	};
	if (under) void Promise.race([under, new Promise(resolve => setTimeout(resolve, RAPIER_DRAW_LEAVE_WAIT_MS))]).then(go, go);
	else go();
}
// ---- The drawing backed up as it goes (R86g law 11; A31 ownership) --------------------------------
// A checkpoint is immutable. The document authority and a fresh drawing-session id own it;
// a successor closes before its predecessors are removed. A live session holds its own lock so
// another window cannot mistake its checkpoint for abandoned work. No count or age evicts a drawing.
const RAPIER_DRAW_BACKUP_MS = 4000;
// ---- Where the recoveries live --------------------------------------------------------------------
// The private file system where the page has one. A page the browser gives none -- a file:// page,
// Android's content:// through a browser: getDirectory() throws a SecurityError there, the refusal
// Notes met on the founder's phone on 17 September -- keeps them in IndexedDB instead, which such a
// page does get (it is where the document's own recovery already lives). Before this rung the
// boot's read on such a page said "Unfinished drawings could not be read" every time the page
// opened, with nothing unread anywhere (the founder's phone, 24 September). One shape for both:
// list() -> [{name, text()}], write(name, text), remove(name); a name that is not there is not a
// fault for remove. The choice is made once, when first needed. A folder that FAILED this once is
// not a page that has none: any fault but the refusal is thrown to the caller, which says so, and
// the question is asked again next time.
// Recovery needs a lock and a store: the private file system, or IndexedDB where a file page's
// private file system refuses (the founder's phone, content:// in Brave). Only a browser with
// neither API is known unavailable here, synchronously; a store that refuses at runtime is the
// write's or the read's to report.
function _rapierDrawBackupHere() {
	return !!(navigator.locks?.request && (navigator.storage?.getDirectory || typeof indexedDB !== 'undefined'));
}
function _rapierDrawBackupStore() {
	const state = _rapierDrawState;
	if (state.backupStore) return state.backupStore;
	const asked = state.backupStore = (async () => {
		try {
			if (!navigator.storage?.getDirectory) throw new DOMException('this browser has no private file system', 'SecurityError');
			await navigator.storage.getDirectory();
			return _rapierDrawBackupOPFS();
		} catch (error) {
			if (error?.name === 'SecurityError') return _rapierDrawBackupIDB();
			throw error;
		}
	})();
	asked.catch(() => { if (state.backupStore === asked) state.backupStore = null; });
	return asked;
}
function _rapierDrawBackupOPFS() {
	const dir = create => navigator.storage.getDirectory().then(root => root.getDirectoryHandle('draw', { create }));
	const absent = error => error?.name === 'NotFoundError';
	return {
		kind: 'opfs',
		async list() {
			let d;
			try { d = await dir(false); } catch (error) { if (absent(error)) return []; throw error; }
			const rows = [];
			for await (const [name, handle] of d.entries()) {
				if (handle.kind !== 'file') continue;
				rows.push({ name, text: async () => { const file = await handle.getFile(); return file.size ? file.text() : ''; } });
			}
			return rows;
		},
		async write(name, text) {
			const d = await dir(true);
			let writer;
			try { writer = await (await d.getFileHandle(name, { create: true })).createWritable(); await writer.write(text); await writer.close(); }
			catch (error) { try { await writer?.abort(); } catch (_) {} throw error; }
		},
		async remove(name) {
			let d;
			try { d = await dir(false); } catch (error) { if (absent(error)) return; throw error; }
			try { await d.removeEntry(name); } catch (error) { if (!absent(error)) throw error; }
		},
	};
}
function _rapierDrawBackupIDB() {
	const open = () => new Promise((ok, no) => {
		const req = indexedDB.open('rapier-draw', 1);
		req.onupgradeneeded = () => { req.result.createObjectStore('pending'); };
		req.onsuccess = () => ok(req.result);
		req.onerror = () => no(req.error || new Error('IndexedDB refused the drawing recovery store'));
		req.onblocked = () => no(new Error('IndexedDB held the drawing recovery store'));
	});
	const run = async (mode, act) => {
		const db = await open();
		try {
			return await new Promise((ok, no) => {
				const tx = db.transaction('pending', mode), req = act(tx.objectStore('pending'));
				tx.oncomplete = () => ok(req.result);
				tx.onerror = () => no(tx.error || new Error('IndexedDB refused the drawing recovery'));
				tx.onabort = () => no(tx.error || new Error('IndexedDB dropped the drawing recovery'));
			});
		} finally { db.close(); }
	};
	return {
		kind: 'indexeddb',
		async list() {
			const names = await run('readonly', store => store.getAllKeys());
			return names.map(name => ({ name: String(name), text: () => run('readonly', store => store.get(name)).then(value => typeof value === 'string' ? value : '') }));
		},
		write(name, text) { return run('readwrite', store => store.put(text, name)); },
		remove(name) { return run('readwrite', store => store.delete(name)); },
	};
}
function _rapierDrawBackupProblem(message) {
	if (_rapierDrawState.backupError !== message) showToast(message, 'error');
	_rapierDrawState.backupError = message;
}
function _rapierDrawBackupOwner() {
	const state = _rapierDrawState;
	if (state.backupRecovery?.session !== state.session || state.backupRecovery.released) {
		void _rapierDrawBackupRelease();
		state.backupRecovery = { session: state.session, drawing: crypto.randomUUID(), authority: String(rapier.identity.authority || ''), filename: String(rapier.document.filename || ''), revision: 0, change: 0, cleared: 0, writing: 0, files: new Set() };
	}
	const owner = state.backupRecovery;
	if (!owner.ready || owner.lockFailed) {
		owner.lockFailed = false;
		let ready, refused;
		owner.ready = new Promise((resolve, reject) => { ready = resolve; refused = reject; });
		const held = new Promise(resolve => { owner.release = () => { owner.released = true; resolve(); }; });
		owner.lock = Promise.resolve().then(() => navigator.locks.request('rapier.draw.' + owner.drawing, async () => { ready(); await held; })).catch(error => { owner.lockFailed = true; refused(error); });
		owner.ready.catch(() => {}); // The write reports refusal; merely touching must not reject.
	}
	return state.backupRecovery;
}
function _rapierDrawBackupRelease(owner = _rapierDrawState.backupRecovery) {
	if (!owner) return Promise.resolve();
	return Promise.resolve(_rapierDrawState.backupIO).then(() => { owner.release(); return owner.lock; });
}
function _rapierDrawBackupTouch() {
	const state = _rapierDrawState;
	if (!state.open) return;
	state.backupDirty = true;
	if (!_rapierDrawBackupHere()) { _rapierDrawBackupProblem('This drawing can’t be backed up here. Add it or download it before you leave.'); return; }
	_rapierDrawBackupOwner().change++;
	if (!state.backupTimer) state.backupTimer = setTimeout(() => { state.backupTimer = 0; void _rapierDrawBackupWrite(); }, RAPIER_DRAW_BACKUP_MS);
}
// `quiet`: a removal made while a failed write is being reported raises no second notice of its own
// (the founder's phone, 24 September: two red boxes for one refused store).
async function _rapierDrawBackupRemove(store, files, owner, { quiet = false } = {}) {
	let ok = true;
	for (const name of files) {
		try { await store.remove(name); owner?.files.delete(name); }
		catch (_) { ok = false; }
	}
	if (!ok && !quiet) _rapierDrawBackupProblem('An older drawing backup could not be removed.');
	return ok;
}
async function _rapierDrawBackupWrite(closing = false) {
	const state = _rapierDrawState;
	if (!state.open || !state.backupDirty) return;
	const session = state.session;
	let record, editing, owner;
	try {
		// The revision is already off this thread. Wait for it; do not encode it here. A worker that
		// never answers keeps the checkpoint dirty so the next write carries the stroke.
		let pending = typeof _rapierPaintPendingStroke === 'function' ? _rapierPaintPendingStroke() : null;
		while (pending) {
			await pending;
			if (!state.open || state.session !== session) return;
			pending = _rapierPaintPendingStroke();
		}
		if (!_rapierDrawBackupHere()) { _rapierDrawBackupTouch(); return; }
		owner = _rapierDrawBackupOwner();
		if (owner.writing && !closing) return;
		// Cancelled transactions must not become the recovery. Flush has already settled the gesture.
		// A running replay is the same category: the shapes on the paper mid-replay are a VIEW of a
		// change that has already landed, and a recovery written from one would keep half an agent's
		// contribution. Every path that shuts the surface ends the replay first, so `closing` always
		// sees the finished drawing.
		if (!closing && (state.gesture || state.textEdit || state.settingEdit || state.replay)) { _rapierDrawBackupTouch(); return; }
		state.backupDirty = false;
		const recipe = _rapierDrawHistoryCopy({ ...state.recipe, fonts: undefined });
		recipe.tool = state.tool;
		const live = typeof _rapierPaintLayerSnapshot === 'function' ? _rapierPaintLayerSnapshot() : null;
		if (live) {
			const id = live.id || ('s' + (state.seq + 1)), at = recipe.shapes.findIndex(existing => existing.id === id);
			const previous = at >= 0 ? recipe.shapes[at] : null;
			const shape = { id, stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, ...previous, geom: live.geom, raster: live.raster, paint: { ...previous?.paint, ...live.paint } };
			if (at >= 0) recipe.shapes[at] = shape; else recipe.shapes.push(shape);
			if (live.retire?.length) {
				const gone = new Set(live.retire);
				recipe.shapes = recipe.shapes.filter(row => !gone.has(row.id) || row === shape);
				if (shape.paint.group != null && !recipe.shapes.some(row => row !== shape && row.paint?.group === shape.paint.group)) delete shape.paint.group;
			}
		}
		if (!recipe.shapes.length) { await _rapierDrawBackupClear(); return; }
		editing = state.editing ? { ...state.editing } : null;
		record = { version: 1, drawing: owner.drawing, revision: ++owner.revision, at: Date.now(), authority: owner.authority, filename: owner.filename, editing: editing ? { blockId: editing.blockId, imageIndex: editing.imageIndex, title: editing.title, asset: editing.asset, sourceHash: editing.sourceHash } : null, recipe, fonts: state.recipe.fonts?.slice() };
	} catch (_) {
		state.backupDirty = true;
		_rapierDrawBackupProblem('This drawing could not be backed up. Add it or download it before you leave.');
		return false;
	}
	const name = 'pending.' + record.drawing + '.' + record.revision + '.json', previous = [...owner.files];
	owner.files.add(name); owner.writing++;
	// Register before the await: a clear requested during this write captures this exact file too.
	const io = state.backupIO = (state.backupIO || Promise.resolve()).then(async () => {
		let store, failure = 'This drawing could not be backed up. Download it before you leave.';
		try {
			await owner.ready;
			// Working PNGs may exceed the file recipe's limits. Use the existing lossless encoder on
			// this captured recipe, inside its registered IO ticket, before replacing any recovery.
			if (!_rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts || record.recipe.fonts })) {
				await _rapierPaintKeepAsJXL(record.recipe);
				if (!_rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts || record.recipe.fonts })) {
					failure = 'This drawing is too large for its backup copy. Download it before you leave.';
					throw new Error(failure);
				}
			}
			if (editing?.sourceUrl && !record.editing.sourceHash) {
				try { record.editing.sourceHash = await globalThis.RapierImageAssets.hashAsset(globalThis.RapierImageAssets.decodeDataImage(editing.sourceUrl)); }
				catch (_) {} // Without target proof the drawing still reopens separately.
			}
			failure = 'This drawing could not be backed up: storage is full or unavailable. Add it or download it before you leave.';
			store = await _rapierDrawBackupStore();
			await store.write(name, JSON.stringify(record));
		} catch (_) {
			// Only this failed attempt is disposable; never make room by deleting a kept checkpoint.
			if (store) await _rapierDrawBackupRemove(store, [name], owner, { quiet: true });
			else owner.files.delete(name);
			if (state.session === owner.session && record.revision > owner.cleared) state.backupDirty = true;
			_rapierDrawBackupProblem(failure);
			return false;
		}
		if (state.session === owner.session) state.backupAt = record.at;
		const cleaned = await _rapierDrawBackupRemove(store, previous, owner);
		if (cleaned && state.session === owner.session && state.backupError) {
			state.backupError = null; showToast('Drawings are backed up again', 'info');
		}
		return true;
	});
	const ok = await io;
	owner.writing--;
	// A refusal stays dirty but does not spin a failing timer. The next change or hide retries it.
	if (ok && state.session === owner.session && state.open && state.backupDirty) _rapierDrawBackupTouch();
	return ok;
}
// The page going away: start the write now, not on a timer that may never run. The browser's
// asynchronous storage cannot promise completion if the process is killed during this handler.
function _rapierDrawBackupFlush() {
	const state = _rapierDrawState;
	if (!state.open) return;
	if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
	if (state.gesture) { _rapierDrawCancelGesture(); state.backupDirty = true; }
	void _rapierDrawBackupWrite(true);
}
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', _rapierDrawBackupFlush);
	// Android can pause a still-visible WebView; use the same recovery owner before its timer.
	window.addEventListener('rapier:checkpoint-requested', _rapierDrawBackupFlush);
}
function _rapierDrawBackupTicket() {
	const state = _rapierDrawState, owner = state.backupRecovery;
	return owner?.session === state.session ? { owner, files: [...owner.files], revision: owner.revision, change: owner.change } : null;
}
// `next`: go on to the next recovery waiting once this one is gone. Only discarding a recovery in
// the offer's own dialog asks for that, and finishing a drawing that was itself recovered (the
// "(N more waiting)" the offer promised). After DONE or a close on an ordinary drawing no question
// follows: the drawing just done is not an unfinished one, and another document's recovery waits
// for the next boot, the moment made for the question (the founder, 25 September 2026, on his
// phone: DONE on a drawing inside a note raised "unfinished drawing" before the drawing landed in
// the note; docs/intent.md law 20).
async function _rapierDrawBackupClear(ticket = _rapierDrawBackupTicket(), { next = false } = {}) {
	if (!ticket) return;
	const state = _rapierDrawState, { owner, files } = ticket;
	if (owner) {
		owner.cleared = Math.max(owner.cleared, ticket.revision);
		if (state.session === owner.session && owner.change === ticket.change) {
			if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
			state.backupDirty = false;
		}
	}
	const io = state.backupIO = (state.backupIO || Promise.resolve()).then(async () => {
		try { return await _rapierDrawBackupRemove(await _rapierDrawBackupStore(), files, owner); }
		catch (_) { _rapierDrawBackupProblem('This drawing\'s backup could not be removed.'); return false; }
	});
	const ok = await io;
	if (owner && (!state.open || state.session !== owner.session)) await _rapierDrawBackupRelease(owner);
	if (ok && !state.open && (next || owner?.recovered)) setTimeout(() => { void _rapierDrawOfferRecovery(); }, 0);
	return ok;
}
async function _rapierDrawBackupRead() {
	if (!_rapierDrawBackupHere()) { _rapierDrawBackupProblem('Drawings can’t be backed up in this window.'); return null; }
	if (!_rapierDrawState.open) await _rapierDrawBackupRelease();
	await _rapierDrawState.backupIO;
	let kept;
	try { kept = await (await _rapierDrawBackupStore()).list(); }
	catch (_) { _rapierDrawBackupProblem('Unfinished drawings could not be read. Their backups are kept.'); return null; }
	const groups = new Map();
	for (const row of kept) {
		const match = /^pending\.([0-9a-f-]{36})\.([1-9]\d*)\.json$/.exec(row.name);
		if (!match || !Number.isSafeInteger(Number(match[2]))) continue;
		const rows = groups.get(match[1]) || []; rows.push({ name: row.name, text: row.text, revision: Number(match[2]) }); groups.set(match[1], rows);
	}
	let best = null, count = 0;
	const authority = String(rapier.identity.authority || '');
	const consider = record => {
		count++;
		if (!best || (record.authority === authority) > (best.authority === authority) || (record.authority === authority) === (best.authority === authority) && (record.at < best.at || record.at === best.at && record.drawing < best.drawing)) best = record;
	};
	for (const [drawing, rows] of groups) {
		rows.sort((a, b) => b.revision - a.revision);
		try { await navigator.locks.request('rapier.draw.' + drawing, { ifAvailable: true }, async lock => {
			if (!lock) return; // A live window owns this drawing; it is not an abandoned recovery.
			for (const row of rows) {
				try {
					const text = await row.text();
					if (!text) continue; // A writer may have created its new name but not closed it yet.
					const record = JSON.parse(text);
					if (record?.version !== 1 || record.drawing !== drawing || record.revision !== row.revision || typeof record.authority !== 'string' || !record.authority || typeof record.filename !== 'string' || !Number.isFinite(record.at)) throw new Error('recovery record');
					// keepRasters (28b part 3): recovery must never refuse what it itself wrote. A live
					// state the door now keeps under the aggregate can still cross it through a closing
					// commit (Set, Done, a tool change) that law forbids refusing, so a checkpoint may be over
					// it. Admission here
					// only shapes the recipe; the drawing still opens, with Done refused by name below.
					const recipe = _rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts }, true);
					if (!recipe) throw new Error('recovery recipe');
					record.recipe = recipe; record.fonts = recipe.fonts;
					// Marked, not just silently kept: the same admission Done/Add already runs, without
					// keepRasters, says whether this checkpoint would pass it -- the exact question Done
					// asks. A per-picture-oversized raster (a separate, pre-existing cap) marks it too;
					// either way Done's own refusal below already names Download.
					record.overKeepLimit = !_rapierDrawAdmitRecipe(recipe);
					record.files = rows.filter(other => other.revision <= row.revision).map(other => other.name);
					consider(record);
					break;
				} catch (error) {
					if (error.name !== 'NotFoundError') _rapierDrawBackupProblem('An unfinished drawing could not be read. Its backup is kept.');
				}
			}
		}); } catch (_) { _rapierDrawBackupProblem('Unfinished drawings could not be read. Their backups are kept.'); }
	}
	if (best) best.waiting = count - 1;
	return best;
}
// Reopening forks a fresh drawing session before any write. Two windows can recover the same
// checkpoint without gaining deletion authority over either window's subsequent work.
async function _rapierDrawOfferRecovery() {
	const state = _rapierDrawState;
	if (state.open || state.finishing || state.backupOffering) return;
	state.backupOffering = true;
	try {
		const loadToken = rapier.identity.loadToken, stamp = Object.freeze(_rapierMutationStamp());
		const record = await _rapierDrawBackupRead();
		if (!record || state.open || state.finishing || loadToken !== rapier.identity.loadToken || !_rapierMutationStampIsCurrent(stamp)) return;
		const same = record.authority === String(rapier.identity.authority || '');
		if (!same) {
			const choice = await rapierConfirm({ title: 'unfinished drawing', message: 'A drawing was not finished when Rapier closed' + (record.filename ? ' (' + record.filename + ')' : '') + '. Open it in this document?', confirmLabel: 'open', secondaryLabel: 'discard' });
			if (state.open || state.finishing || loadToken !== rapier.identity.loadToken || !_rapierMutationStampIsCurrent(stamp)) return;
			if (choice === 'secondary') { await _rapierDrawBackupClear({ files: record.files }, { next: true }); return; }
			if (choice !== true) return;
		}
		let editing = null, baselineRecipe = null;
		// A block number alone is not picture identity. Changed originals recover alongside it.
		if (same && record.editing?.asset && record.editing.sourceHash) {
			try {
				const saved = record.editing, current = _rapierImageRecord(saved.blockId, saved.imageIndex), assets = globalThis.RapierImageAssets;
				if (current && assets.normalizeLabel(current.image.reference || '') === assets.normalizeLabel(saved.asset)) {
					const sourceUrl = assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(saved.asset))?.url;
					const bytes = sourceUrl && assets.decodeDataImage(sourceUrl);
					if (bytes && await assets.hashAsset(bytes) === saved.sourceHash) {
						baselineRecipe = _rapierDrawReadSVGRecipe(new TextDecoder().decode(bytes));
						if (baselineRecipe) editing = { ...saved, sourceUrl };
					}
				}
			} catch (_) {}
		}
		if (state.open || state.finishing || loadToken !== rapier.identity.loadToken || !_rapierMutationStampIsCurrent(stamp)) return;
		// keepRasters (28b part 3): a checkpoint already over the aggregate must still open -- Done
		// refuses it by name below (_rapierDrawAdmitRecipe's own aggregate check, unchanged), Download
		// stays uncapped, and only Set or removing a layer clears the way back to Add.
		_rapierDrawOpenSurface(editing ? { recipe: record.recipe, editing, baselineRecipe, recovered: true, keepRasters: record.overKeepLimit } : { recipe: record.recipe, target: _rapierImageInsertionTarget(), recovered: true, keepRasters: record.overKeepLimit });
		if (state.open) {
			const owner = _rapierDrawBackupOwner(); owner.files = new Set(record.files); owner.recovered = true;
			state.backupAt = record.at;
			showToast(record.overKeepLimit
				? 'Your unfinished drawing is back' + (record.waiting ? ' (' + record.waiting + ' more waiting)' : '') + '. Its paintings together are over what one document picture can hold: Set a painting or remove one before Add, or download the drawing.'
				: 'Your unfinished drawing is back' + (record.waiting ? ' (' + record.waiting + ' more waiting)' : ''), 'info');
			_rapierDrawBackupTouch(); void _rapierDrawBackupWrite();
		}
	} finally { state.backupOffering = false; }
}
if (typeof window !== 'undefined') {
	const kick = () => setTimeout(() => { _rapierDrawOfferRecovery().catch(error => console.warn('[rapier] draw recovery', error)); }, 2500);
	if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick, { once: true });
}
// Law 42 (docs/intent.md; the founder, 26 September 2026: "we should have rapier.website/draw too which boots
// straight into drawing mode"): the site's /draw is the floating toolbar's own DRAW pressed at boot, once the
// boot's document is restored (shell/platform.js _rapierBootFactsPublished) -- a fresh canvas over the
// document the page opened with, DONE landing the drawing where DRAW's would. The editor is not painted first:
// html.rapier-draw-start (editor/styles/rapier-draw.css), set at this file's evaluation before the first paint
// and taken off once the canvas is up, or declined. The path then names the surface (_rapierDoorPathMark).
// The same door by fragment, `#v/draw` (docs/agents.md "The address of a document"), for a copy of the page with
// no path of its own to say it: a file, a self-hosted rapier.html. Read once and taken off, so a reload is the editor.
// A page handed over may carry the view itself (`rapier-html --view draw`: `data-view` on the carried document
// block, docs/page-door.md "2a"), for a published copy whose link cannot carry a fragment.
const RAPIER_DRAW_DOOR_AT_BIRTH = (() => { try {
	if (document.getElementById('rapier-document')?.dataset.view === 'draw') return true;
	if (/^#v\/draw\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); return true; }
	return /^\/draw\/?$/.test(String(location.pathname || ''));
} catch (_) { return false; } })();
function _rapierDrawStartClass(on) { try { document.documentElement.classList.toggle('rapier-draw-start', on === true); } catch (_) {} }
if (typeof window !== 'undefined' && RAPIER_DRAW_DOOR_AT_BIRTH) {
	_rapierDrawStartClass(true);
	const door = () => {
		const booted = typeof _rapierBootFactsPublished !== 'undefined' ? _rapierBootFactsPublished : Promise.resolve();
		booted.then(() => { if (!_rapierDrawState.open && !_rapierDrawState.finishing) rapierOpenDraw(null); }, () => {}).finally(() => _rapierDrawStartClass(false));
	};
	if (document.readyState === 'complete') door(); else window.addEventListener('load', door, { once: true });
}
// Whether the recipe differs from the snapshot taken when Draw's surface finished opening -- any
// shape/stroke/label/style change, or ink added to a brand-new empty canvas. Selecting shapes does
// not itself count: selection lives outside the recipe this compares.
function _rapierDrawChangedSinceOpen() {
	const state = _rapierDrawState;
	return !state.openSnapshot || !_rapierDrawSameRecipe(state.openSnapshot);
}
function _rapierDrawNextName() { return _rapierDrawNextAssetName(globalThis.RapierImageAssets.documentAssets(_rapierSourceText()).assets.values()); }
function _rapierDrawSetCloseVisible(visible) { _rapierDrawState.closeBtn?.classList.toggle('rapier-draw-btn--stowed', !visible); }
function _rapierDrawShowCloseOnFailure() { _rapierDrawSetCloseVisible(true); }
const RAPIER_DRAW_INLINE_SHARE = .62, RAPIER_DRAW_COLUMN_SHARE = .91;
const RAPIER_DRAW_WIDTH_MAX = 48, RAPIER_DRAW_WIDTH_MIN = 12;
function _rapierDrawPlacement(recipe, editing, svgText) {
	if (editing) return '';
	// F75-12: Plain authors rung 0 only -- Done writes no placement comment.
	if (_rapierPlainLayout()) return '';
	const canvasWidth = recipe?.canvas?.w, drawn = /\swidth="([0-9.]+)"/.exec(svgText || '');
	if (!(canvasWidth > 0) || !drawn) return '';
	const inkWidth = Number(drawn[1]);
	if (!(inkWidth <= canvasWidth * RAPIER_DRAW_INLINE_SHARE)) return '';
	const width = Math.round(_rapierDrawClamp(inkWidth / (canvasWidth * RAPIER_DRAW_COLUMN_SHARE) * 100, RAPIER_DRAW_WIDTH_MIN, RAPIER_DRAW_WIDTH_MAX));
	return ' <!--md-layout:v1 width=' + width + '% wrap=around x=0% y=0em-->';
}
// D03: erasing/clearing every shape and stroke out of an EXISTING drawing and pressing Done is a
// real edit -- a deletion -- and must remove the picture's own occurrence the same way any other
// content deletion does: one ordinary source splice through _rapierCommitSourceProjection, which
// already retires the asset's now-unreferenced definition bytes when this was its last occurrence
// (the same last-use retirement any text deletion around a picture gets, layout/actions.js). Both
// image.start and image.end already span the full occurrence including a trailing placement
// comment when one is present (_rapierScanMarkdownImages), so removing exactly that range is enough
// -- there is nothing left over to also strip. Returns true once the occurrence is gone.
async function _rapierDrawRemoveEditedEmpty(editing) {
	const record = _rapierImageRecord(editing.blockId, editing.imageIndex);
	const span = record && _rapierExcerptCanonicalBlockSpans().get(record.block.id);
	if (!span) throw new Error('Drawing is no longer available');
	const source = _rapierSourceText(), start = span.start + record.image.start, end = span.start + record.image.end;
	if (!(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end <= source.length)) {
		throw new Error('Drawing is no longer available');
	}
	const splices = [{ pos: start, removed: source.slice(start, end), inserted: '' }];
	if (!await _rapierCommitSourceProjection(splices, 'document.remove-image')) throw new Error('Document changed; try Draw again');
}
// The drawing's own SVG asset is a separate limit from any one picture inside it: every painting is
// already lossless, in as many pieces as one picture may hold (paint-tool.js's own
// _rapierPaintRasterBudget), but the whole drawing is written as ONE SVG asset
// (globalThis.RapierImageAssets.createAsset), which refuses bytes over IMAGE_LIMITS.bytes -- a limit
// the pieces' own sum can still pass even when no single piece does. The one owner of that number,
// mirroring _rapierPaintRasterBudget exactly: the reader's own admission cap, or the tiny cap a
// witness injects (`window.__rapierDrawAssetMaxTest`, read only when set) to prove Add's refusal.
// Download is a file, not a document asset, and never reads this limit.
function _rapierDrawAssetBudget() {
	const test = typeof window !== 'undefined' ? window.__rapierDrawAssetMaxTest : undefined;
	return Number.isFinite(test) ? test : globalThis.RapierImageAssets.IMAGE_LIMITS.bytes;
}
async function _rapierDrawFinish({ back = false } = {}) {
	const state = _rapierDrawState;
	if (state.finishing || !_rapierDrawFinishText()) return;
	// Done writes the finished drawing, not the frame the replay happened to be on.
	_rapierDrawReplayEnd();
	const waitingSession = state.session, pending = _rapierPaintPendingStroke();
	if (pending) { await pending; if (!state.open || state.session !== waitingSession || state.finishing) return; }
	// The settlement law (Astra-R75 P02, corrected at R85b by the founder on their phone): Done/Back
	// builds its SVG from the last COMMITTED recipe, which a still-overflowed live layer was never
	// written into (that is the working PNG budget's refusal) -- so without this, finishing here
	// would save the document behind what the person can see. It used to DISCARD that layer, which
	// is the same loss with a toast on it: "I painted heaps and then pressed done and rapier REMOVED
	// my latest painting work... rapier needs to save the user's work automatically as jpegxl never
	// delete it". So it is KEPT here instead -- committed now, written as JPEG XL below -- and the
	// unchanged-since-open and empty-recipe checks just below see the true, settled recipe.
	try { _rapierPaintSettleOverflow(); }
	catch (error) { _rapierDrawShowCloseOnFailure(); showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); return; }
	// Re-editing an existing drawing that nobody touched must not write: no source change, no new
	// (or duplicate) asset, no Undo entry -- law 3. Checked before the empty-recipe branch below so
	// "opened an existing drawing and changed nothing" and "cleared an existing drawing down to
	// nothing" are told apart -- only the second is a real edit (D03). Back and Escape both funnel
	// into this same function (_rapierDrawHandleBack below), so "looked, changed nothing, pressed
	// Back" and "looked, changed nothing, tapped Done anyway" behave identically for free.
	if (state.editing && !_rapierDrawChangedSinceOpen()) { void _rapierDrawBackupClear(); _rapierDrawClose(); return; }
	const empty = !state.recipe?.shapes.length;
	// A brand-new drawing that never gained a mark stays a no-op close -- there is nothing to
	// delete because nothing was ever saved (D03 does not apply: only an edited EXISTING drawing's
	// emptying is a deletion).
	if (empty && !state.editing) { void _rapierDrawBackupClear(); _rapierDrawClose(); return; }
	// R86g law 10 (the founder): Done no longer commits straight through -- it asks first, past the
	// no-op checks just above (nothing to add stays a no-op close, unasked, exactly as before). The
	// house confirm offers three answers: add it to the document (today's path, unchanged below,
	// `true`), download it as a file and touch nothing (`'secondary'` -- _rapierDrawDownload, the
	// same bytes this function itself would write, never the write), or its own Cancel/Escape/
	// backdrop (`false`), back to the painting with nothing touched. `rapierConfirm`
	// (editor/engine.js) is the house's own dialog; `_rapierUiOpenConfirm`/`_rapierUiResolveConfirm`
	// there resolve it exactly this way.
	// That question is the editor's. A canvas a Notes door opened is for its note, so there DONE is
	// one act -- the drawing goes into the note -- and the file stays within reach on the picture's
	// own toolbar (law 9), which a hold on the drawing brings up.
	// Back is not DONE: it can mean "get me out", so it asks whether to keep the drawing or discard it
	// (law 56, the founder, 26 September 2026: "Do you want to discard your drawing or do you want to
	// save it?"), in the note's words inside a note. KEEP is DONE's own act below; DISCARD writes
	// nothing and lets the drawing's backup go; Cancel, a tap beside it or a second Back leave the
	// canvas as it was. Work is never kept or dropped on a guess (R85b).
	const session = state.session, sameSession = () => state.session === session, notes = state.notes;
	if (back || !notes) {
		const choice = await rapierConfirm(back ? _rapierDrawBackQuestion(notes, state.editing, empty) : {
			title: 'done',
			message: 'Add this drawing to the document, or download it as a file?',
			confirmLabel: 'Add to Rapier document',
			secondaryLabel: 'Download',
		});
		// The confirm is itself an await: re-check the surface is still this same open session before
		// acting on its answer, the same caution every later await in this function already takes.
		if (!sameSession() || !state.open) return;
		if (choice === 'secondary' && back) { void _rapierDrawBackupClear(); _rapierDrawClose(); return; }
		if (choice === 'secondary') { await _rapierDrawDownload(session); return; }
		if (choice !== true) return;
	}
	const editing = state.editing;
	let insertTarget = state.insertTarget, loadToken = rapier.identity.loadToken;
	state.finishing = true; state.surface.setAttribute('aria-busy', 'true');
	for (const control of state.surface.querySelectorAll('button:not(.rapier-dial),input,textarea,select')) control.disabled = true;
	_rapierDrawRenderHistory();
	try {
		// Law 46: a canvas the + bar raised before its note was ready waits for the note here, and takes its place in
		// it now that it is open (the busy wait below then reads the note's own document); a note that could not be
		// written hands the drawing to a Download (R85b), never to the document that stood under the cards.
		if (notes?.fresh && notes.ready) {
			const ok = await notes.ready;
			if (!sameSession() || !state.open) return;
			if (!ok) {
				const choice = await rapierConfirm({ title: 'unsaved drawing', message: 'The note could not be written. Download the drawing as a file?', confirmLabel: 'Download' });
				if (!sameSession() || !state.open) return;
				if (choice === true) await _rapierDrawDownload(session);
				return;
			}
			insertTarget = _rapierDrawLineTarget(); loadToken = rapier.identity.loadToken;
		}
		const deadline = Date.now() + 650;
		while (_rapierUserMutationBlocked(false) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40));
		if (_rapierUserMutationBlocked(false)) throw new Error('Document is still busy; try Done again');
		if (empty) {
			await _rapierDrawRemoveEditedEmpty(editing);
			void _rapierDrawBackupClear(); if (sameSession()) _rapierDrawClose();
			return;
		}
		await _rapierDrawLoadFonts(state.recipe, session);
		if (!state.open || !sameSession()) return;
		const recipe = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe()), stamp = Object.freeze(_rapierMutationStamp());
		recipe.tool = state.tool; // Edit reopens on the tool the drawing was finished with (A29 item 12).
		// The picture-format law (intent.md, "Picture format law"; open-work.md section 2): every
		// painting is kept as JPEG XL at FULL QUALITY. PNG is only the cheap working form while paint
		// is live. It happens HERE, on the recipe actually about to be written -- the file is built
		// from the restored history recipe, not state.recipe. No quality is ever taken for ONE
		// PICTURE, quietly or by asking: a painting too large for one picture is kept in lossless
		// pieces (R86e). The drawing's own SVG ASSET is a separate limit; Download keeps it whole.
		if (typeof _rapierPaintKeepAsJXL === 'function') {
			try {
				const split = await _rapierPaintKeepAsJXL(recipe);
				// Never a quality step (the picture-format law, in code at R86e): a painting too large
				// for one picture is kept whole, at full quality, as several lossless pieces, and the
				// person hears it once. Losing the work was never one of the choices (R85b).
				if (split?.length) {
					const pieces = split.reduce((n, row) => n + row.pieces, 0);
					showToast((split.length === 1 ? 'One painting was' : split.length + ' paintings were') + ' too large for one picture, so ' + (split.length === 1 ? 'it is' : 'they are') + ' kept at full quality in ' + pieces + ' JPEG XL pieces. Nothing was lost from the drawing.', 'info');
				}
			} catch (error) { console.warn('[rapier] paint keep', error); }
		}
		// Prepare the whole live drawing, then apply only the document's admission limits to Add.
		// Download (above) never reduces quality to fit: the file exit carries all of it without
		// these byte caps. Add is bound by the document's own picture cap, and the general law
		// (intent.md, "no path that means KEEP THIS may destroy... a size limit is a limit on a
		// FORM, not a licence to delete the content") still applies to it: before Add is refused,
		// Rapier changes the form -- the founder's own quality-95 clause, asked by name with both
		// sizes, never silent, never the default (R86g law 10; docs/canvas-durability.md, "the one
		// time quality 95 is still asked").
		if (!_rapierDrawAdmitRecipe(recipe)) {
			showToast('This drawing is too large to add to the document. Download the drawing.', 'info');
			return;
		}
		let svgText = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true);
		if (!svgText) throw new Error('The complete drawing could not be prepared');
		let svgBytes = new TextEncoder().encode(svgText);
		// Only reached when JPEG XL is this document's own image profile; a document without the
		// encoder (or a witness forcing portable pictures) has no quality-95 to offer and falls
		// through to the refusal below.
		if (svgBytes.length > _rapierDrawAssetBudget() && (typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl')) {
			const before = svgBytes.length;
			await _rapierPaintReencodeQuality95(recipe);
			const smallerText = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true), smallerBytes = new TextEncoder().encode(smallerText);
			if (smallerBytes.length > _rapierDrawAssetBudget()) {
				showToast('This drawing is too large to add to the document. Download the drawing.', 'info');
				return;
			}
			if (!await _rapierPaintOfferQuality95(before, smallerBytes.length)) {
				showToast('This drawing is too large to add to the document. Download the drawing.', 'info');
				return;
			}
			svgText = smallerText; svgBytes = smallerBytes;
			showToast('This drawing was too large for one picture at full quality, so its painting is kept at quality 95 instead (' + Math.round(smallerBytes.length / 1024) + ' KiB).', 'info');
		}
		// No quality-95 to offer here (no JPEG XL profile): the drawing's own asset ceiling still
		// refuses by name rather than falling through to createAsset's own dead-end error.
		if (svgBytes.length > _rapierDrawAssetBudget()) {
			showToast('This drawing is too large to add to the document. Download the drawing.', 'info');
			return;
		}
		const assetTitle = editing?.title || _rapierDrawNextName();
		const asset = await globalThis.RapierImageAssets.createAsset(svgBytes, null, { codec: 'image/svg+xml', title: assetTitle });
		if (loadToken !== rapier.identity.loadToken || !sameSession()) throw new Error('Document changed; try Draw again');
		// A brand-new drawing gets an empty alt: the generated asset title (draw-N) is a machine
		// name for the definition metadata, never a caption, and must not leak into alt (docs/agents.md's
		// draw paragraph). Editing an existing drawing keeps its own alt exactly as it was when Edit
		// opened it -- editing.title, despite the name, already holds that captured alt, not the
		// asset's own title (see _rapierEditDrawing's `currentAlt`, above). A new drawing in a note
		// takes the caption Notes gives it -- "Drawing", or the note's own name -- because a note
		// that opens with a picture is named by its alt (notes/model.mjs noteFileName), and an empty
		// one named it "note".
		const alt = editing ? editing.title : notes?.alt || '';
		// A drawing in a note stands on its own line at the size it was drawn -- the canvas was the
		// note's width -- never the editor's figure of at most 48% with the words wrapped round it.
		const raw = '![' + _rapierEscapeImageAlt(alt) + '][' + asset.label + ']' + (notes ? '' : _rapierDrawPlacement(recipe, editing, svgText));
		const target = editing ? { replaceImage: { blockId: editing.blockId, imageIndex: editing.imageIndex } } : insertTarget || {};
		const normalized = { asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height };
		if (!await globalThis.RapierEmbeddedImages.insert(normalized, raw, target, stamp)) throw new Error('Document changed; try Draw again');
		void _rapierDrawBackupClear(); if (sameSession()) { _rapierDrawClose({ landed: true }); _rapierDrawLand(asset.label); }
		if (notes && !editing) _rapierDrawReadyForWords(asset.label);
	} catch (error) {
		if (sameSession()) { _rapierDrawShowCloseOnFailure(); showToast('Drawing could not be placed: ' + String(error.message || error), 'error'); }
	} finally {
		state.finishing = false; state.surface.removeAttribute('aria-busy');
		for (const control of state.surface.querySelectorAll('button:not(.rapier-dial),input,textarea,select')) control.disabled = false;
		_rapierDrawRenderHistory();
	}
}
// A note a new drawing lands in is ready for words after it (docs/notes-cards.md, "Drawing in a
// note"): the caret on a line of its own under the drawing -- the line a tap below a picture opens
// in the editor (_rapierOpenGroundBelow) -- in edit mode, as a note just made is. An empty line
// already there (one the person opened with Enter before drawing) is the line, never a second one.
function _rapierDrawReadyForWords(label) {
	if (rapier.access.readOnly || rapier.view.mode === 'source' || _rapierUserMutationBlocked()) return;
	const blocks = rapier.document.blocks, at = blocks.findIndex(row => String(row.raw || '').includes('][' + label + ']'));
	if (at < 0) return;
	if (rapier.view.mode !== 'edit' && typeof rapierSetMode === 'function') rapierSetMode('edit', { announce: false });
	const next = blocks[at + 1], id = next && !String(next.raw || '').trim() ? next.id : _insertBlockAfter(blocks[at].id, '', { noEdit: true });
	const line = id != null && rapier.document.blocks.find(row => row.id === id);
	// At the head of a note with no title, that line is the note's Title field (notes/notes.js
	// _rapierNotesHeadClaim; docs/notes-cards.md §16): the next words are its title.
	if (line && typeof _rapierNotesHeadClaim === 'function') _rapierNotesHeadClaim(id);
	const wrapper = line && document.querySelector('#editor-blocks > .block-wrapper[data-block-id="' + id + '"]');
	if (wrapper) enterBlockEdit(line, wrapper, { charOffset: 0, preserveScroll: true });
}
// Download keeps the entire live drawing, losslessly, without document picture/aggregate byte
// limits. Geometry, raster signatures and vector work are still checked by the same SVG owner.
// Only a confirmed file write clears the recovery ticket for the exact exported snapshot.
async function _rapierDrawDownload(session) {
	const state = _rapierDrawState;
	try {
		await _rapierDrawLoadFonts(state.recipe, session);
		if (!state.open || state.session !== session) return;
		_rapierPaintFlushRevision();
		const recipe = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe());
		const recovery = _rapierDrawBackupTicket(); // Exact exported work, before any encoding/save await.
		const editing = state.editing;
		const docBase = String(rapier.document.filename || 'document').replace(/\.[a-z0-9]+$/i, '') || 'document';
		const name = (editing?.asset || (docBase + '-drawing')) + '.svg';
		if (typeof _rapierPaintKeepAsJXL === 'function') {
			try {
				const split = await _rapierPaintKeepAsJXL(recipe);
				if (split?.length) {
					const pieces = split.reduce((n, row) => n + row.pieces, 0);
					showToast((split.length === 1 ? 'One painting was' : split.length + ' paintings were') + ' too large for one picture, so ' + (split.length === 1 ? 'it is' : 'they are') + ' kept at full quality in ' + pieces + ' JPEG XL pieces. Nothing was lost from the drawing.', 'info');
				}
			} catch (error) { console.warn('[rapier] paint keep', error); }
		}
		if (!state.open || state.session !== session) return;
		const svgText = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true);
		if (!svgText) throw new Error('The complete drawing could not be prepared');
		const svgBytes = new TextEncoder().encode(svgText);
		const saved = await _download(new Blob([svgBytes], { type: 'image/svg+xml' }), name);
		if (saved === true) await _rapierDrawBackupClear(recovery);
		// The shared download owner returns null on a writer failure, false on cancellation.
		else if (saved !== false && state.open && state.session === session) showToast('The drawing could not be downloaded. It is still open; try Download again.', 'error');
	} catch (error) {
		if (state.open && state.session === session) showToast('The drawing could not be downloaded. It is still open: ' + String(error?.message || error), 'error');
	}
}
// Android hardware Back and browser history Back both reach here through engine.js's
// rapierHandleBack (window.Rapier.shell.handleBack -> MainActivity.kt's onBackPressedDispatcher on
// Android, and shell/platform.js's popstate on the web, where a canvas over the editor holds an entry
// of its own; see rapierHandleBack's comment for why this is a direct check there rather than one
// more _rapierUiSurfaces entry). Draw's own in-surface Escape falls through to this too, once a
// live gesture and an existing selection are already accounted for (see the keydown handler
// above). Both cancel any live gesture, then let _rapierDrawFinish decide: an untouched canvas
// (an empty new one, or an existing one unchanged) closes without writing, and anything else asks
// keep or discard (law 56). Returns true when Draw consumed the Back press, so the caller does not
// also fall through to whatever surface sits beneath it.
function _rapierDrawHandleBack() {
	const state = _rapierDrawState;
	if (!state.open) return false;
	// ZA3 F3: Back first leaves the colour sampler, the same phone contract (law 56) an existing
	// selection already gets -- it never surprises by closing or committing the drawing underneath.
	if (state.dropper) { state.dropper.close(false); return true; }
	if (_rapierDrawLettersDoor.asking) { _rapierDrawLettersDismiss(); return true; }
	if (state.finishing) return true;
	if (state.textEdit?.composing) {
		const session = state.session;
		state.textEdit.afterFinish = () => { if (state.open && state.session === session) _rapierDrawHandleBack(); };
		_rapierDrawFinishText();
		return true;
	}
	if (!_rapierDrawFinishText()) return true;
	_rapierDrawCancelGesture();
	void _rapierDrawFinish({ back: true });
	return true;
}
// Back's question (law 56), in the house's confirm and its words (law 57: short, plain, the picture in a
// skim): KEEP puts the drawing where DONE would -- the document, the note, a new note from the + bar --
// or keeps the changes to a drawing reopened, which for one emptied takes it out (D03, said); DISCARD
// throws a new drawing away and leaves a reopened one as it was. Inside a note the note is named and the
// document never is.
function _rapierDrawBackQuestion(notes, editing, empty) {
	const where = notes ? (notes.fresh ? '' : notes.label) : 'your document';
	if (editing) return {
		title: 'keep your changes?',
		message: empty && where ? 'keep takes the drawing out of ' + where + '; discard leaves it as it was.' : 'discard leaves the drawing as it was.',
		confirmLabel: 'keep', secondaryLabel: 'discard', destructive: true,
	};
	return {
		title: 'keep this drawing?',
		message: (where ? 'keep adds it to ' + where : 'keep makes it a new note') + '; discard throws it away.',
		confirmLabel: 'keep', secondaryLabel: 'discard', destructive: true,
	};
}
// A drawing in a note lands on its own line where the person was: at the block the caret is in --
// after it, or before it when the caret stands at the block's very start or on a line still empty
// -- never inside the words. The editor's picture target splits the block at the raw caret
// (_rapierImageCaretTarget and caretSplit in images/browser.js), mid-word as often as not ("Book
// the fe" [drawing] "rry"), and takes the place a page merely rests at for a caret: a note just
// opened rests at the start of its first block with nothing being edited. The caret's block is the
// one being edited or, once the control pressed has taken the page out of its editing -- the note's
// plus sheet does, while the person reads it -- the one the caret was last in (the editor's own
// lastActiveBlockId, which a load clears); where in it the caret stood is gone with the editing, so
// the drawing goes after that block, or in its place when it is still empty. With neither there is
// no caret, and the drawing goes to the note's end.
function _rapierDrawLineTarget() {
	const target = _rapierImageInsertionTarget(), spans = _rapierExcerptCanonicalBlockSpans();
	const edge = at => ({ sourceSelection: { start: at, end: at } });
	if (target.sourceSelection) {
		const caret = target.sourceSelection.start;
		for (const span of spans.values()) if (caret >= span.start && caret <= span.end) return edge(caret === span.start ? span.start : span.end);
		return target;
	}
	const wrapper = document.querySelector('.block-wrapper--editing');
	const block = wrapper ? _rapierBoundBlock(wrapper) : rapier.document.blocks.find(row => row.id === rapier.view.lastActiveBlockId);
	const span = block && spans.get(block.id);
	if (!span) return { afterId: null };
	const split = wrapper && target.sourceSplit?.start === span.start ? target.sourceSplit : null;
	const atStart = split ? !split.before : !String(block.raw || '').trim();
	return edge(atStart ? span.start : span.end);
}
// A canvas opened while a note is open in Notes is that note's, whichever control opened it -- the
// note's + sheet, the format toolbar's Draw, a tap on a drawing, the picture toolbar's brush:
// notes/notes.js _rapierNotesDrawFor says which note, and says nothing anywhere else.
function _rapierDrawInANote() { return typeof _rapierNotesDrawFor === 'function' ? _rapierNotesDrawFor(false) : null; }
// `notes` is what Notes knows about the canvas it opens (_rapierDrawState.notes); none for the editor.
function rapierOpenDraw(notes = _rapierDrawInANote()) {
	// Law 46 (notes/notes.js _rapierNotesNewDrawing): the + bar's canvas opens before its note exists, over whatever
	// document stands under the cards; the place in the note is picked at DONE, once the note is open.
	if (notes?.fresh && notes.ready) { _rapierDrawOpenSurface({ target: null, notes }); return; }
	if (_rapierUserMutationBlocked()) return;
	if (rapier.document.docKind !== 'markdown') { showToast('Draw works in Markdown documents', 'info'); return; }
	_rapierDrawOpenSurface({ target: notes ? _rapierDrawLineTarget() : _rapierImageInsertionTarget(), notes });
}

function _rapierDrawImageDataUrl(imageEl) {
	if (!imageEl) return null;
	const id = imageEl.getAttribute('data-rapier-asset') || imageEl.getAttribute('data-rapier-image-url');
	if (!id) return null;
	const assets = globalThis.RapierImageAssets;
	if (assets.dataImage(id)) return id;
	const record = assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(id));
	return record ? record.url : null;
}

const _rapierDrawRecipeCache = new WeakMap();
function _rapierDrawImageRecipe(imageEl) {
	if (!imageEl) return null;
	const url = _rapierDrawImageDataUrl(imageEl), cached = _rapierDrawRecipeCache.get(imageEl);
	if (cached?.url === url) return cached;
	const record = { url, recipe: null, error: null };
	try {
		const assets = globalThis.RapierImageAssets;
		if (assets.dataImage(url)?.codec === 'image/svg+xml') record.recipe = _rapierDrawReadSVGRecipe(new TextDecoder('utf-8', { fatal: true }).decode(assets.decodeDataImage(url)));
	} catch (error) { if (error.code === 'drawing_restore_failed') record.error = error; }
	// Layout reads stay quiet; an explicit Edit reports admission failure without replacing the picture.
	_rapierDrawRecipeCache.set(imageEl, record); return record;
}
function _rapierDrawRecipeFromImage(imageEl) { return _rapierDrawImageRecipe(imageEl)?.recipe || null; }
function _rapierDrawImageIsOurs(imageEl) { const record = _rapierDrawImageRecipe(imageEl); return !!(record?.recipe || record?.error); }

function _rapierDrawRoundProfile(cx, cy, rx, ry) {
	return { spanAt(t) { const dy = (t - cy) / ry; if (Math.abs(dy) >= 1) return null; const dx = rx * Math.sqrt(1 - dy * dy); return [cx - dx, cx + dx]; } };
}

const RAPIER_DRAW_BANDS = 48;

function _rapierDrawBrushExtent(shape, recipe) {
	if (!shape.brush || shape.brush === 'ink') return null;
	if (typeof document === 'undefined' || !document.body) return null;
	let markup;
	try { markup = _rapierDrawBrushMarkup(shape, recipe); } catch (_) { return null; }
	if (!markup) return null;
	let svg;
	try {
		svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('style', 'position:absolute;visibility:hidden;width:0;height:0;');
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		group.innerHTML = markup;
		svg.appendChild(group);
		document.body.appendChild(svg);
		const box = group.getBBox();
		return box.width >= 0 && box.height >= 0 ? { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height } : null;
	} catch (_) { return null; }
	finally { svg?.remove(); }
}

function _rapierDrawCoverPad(shape, recipe, box) {
	const brush = _rapierDrawBrushExtent(shape, recipe), pad = _rapierDrawPaintPad(shape, recipe);
	return brush && box ? Math.max(pad, brush.maxX - box.maxX, box.minX - brush.minX, brush.maxY - box.maxY, box.minY - brush.minY) : pad;
}

function _rapierDrawRoundReach(shape, recipe, cx, cy, rx, ry) {
	const brush = _rapierDrawBrushExtent(shape, recipe), pad = _rapierDrawPaintPad(shape, recipe);
	return { rx: Math.max(rx + pad, brush ? Math.max(brush.maxX - cx, cx - brush.minX) + pad : 0), ry: Math.max(ry + pad, brush ? Math.max(brush.maxY - cy, cy - brush.minY) + pad : 0) };
}

const RAPIER_DRAW_OPEN_HALF = 4;

function _rapierDrawShapeCover(shape, recipe) {
	if (!shape || typeof shape !== 'object') return null;
	if (shape.effect?.strength) {
		const b = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		return { poly: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]] };
	}
	if (shape.recognized === 'text') return { poly: _rapierDrawTextLayout(shape, recipe).polygon };
	return _rapierDrawShapeContours(shape, recipe).filter(points => points.length > 1).map(points => {
		const pad = _rapierDrawCoverPad(shape, recipe, _rapierDrawBBox(points));
		const closed = !_rapierDrawShapePaintsInk(shape, recipe) ? ['circle', 'ellipse'].includes(shape.recognized) || !!_rapierDrawShapePolygon(shape, recipe) : _rapierDrawIsClosedStroke(points);
		return closed ? { poly: _rapierDrawGrowPolygon(_rapierDrawDist(points[0], points.at(-1)) < .01 ? points.slice(0, -1) : points, pad) } : { line: points, half: Math.max(RAPIER_DRAW_OPEN_HALF, pad) };
	});
}

function _rapierDrawMeasureLabelBox(text) {
	if (typeof document !== 'undefined' && document.body) {
		let host = null;
		try {
			host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			host.setAttribute('style', 'position:absolute;left:-99999px;top:0;visibility:hidden');
			const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			t.setAttribute('font-family', 'system-ui, sans-serif');
			t.setAttribute('font-size', '14');
			t.textContent = text;
			host.appendChild(t);
			document.body.append(host);
			const box = t.getBBox();
			if (box.width >= 0 && box.height >= 0) return { width: box.width, top: box.y, bottom: box.y + box.height };
		} catch (_) {   }
		finally { host?.remove(); }
	}
	return { width: Math.max(1, text.length) * 8.2, top: -12, bottom: 4 };
}

function _rapierDrawLabelBox(shape, recipe) {
	return shape?.label || shape?.recognized === 'text' ? _rapierDrawTextLayout(shape, recipe).bounds : null;
}

function _rapierDrawMergeRuns(lists, gap = .5) {
	const runs = [];
	for (const list of lists) if (list) runs.push(...list);
	if (!runs.length) return null;
	runs.sort((one, two) => one[0] - two[0]);
	const merged = [[runs[0][0], runs[0][1]]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i][0] <= last[1] + gap) last[1] = Math.max(last[1], runs[i][1]);
		else merged.push(runs[i].slice());
	}
	return merged;
}
function _rapierDrawRunsAtY(covers, y) {
	const runs = [];
	for (const cover of covers) {
		if (cover.poly) {
			const poly = cover.poly, xs = [];
			for (let i = 0; i < poly.length; i++) {
				const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
				if ((y1 <= y) === (y2 <= y)) continue;
				xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
			}

			xs.sort((a, b) => a - b);
			for (let i = 0; i + 1 < xs.length; i += 2) runs.push([xs[i], xs[i + 1]]);
			continue;
		}
		const pts = cover.line, half = cover.half ?? RAPIER_DRAW_OPEN_HALF;
		for (let i = 1; i < pts.length; i++) {
			const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
			if (y < Math.min(y1, y2) - half || y > Math.max(y1, y2) + half) continue;
			let a, b;
			if (Math.abs(y2 - y1) < 1e-6) { a = Math.min(x1, x2); b = Math.max(x1, x2); }
			else {
				const t0 = _rapierDrawClamp((y - half - y1) / (y2 - y1), 0, 1);
				const t1 = _rapierDrawClamp((y + half - y1) / (y2 - y1), 0, 1);
				const xa = x1 + (x2 - x1) * t0, xb = x1 + (x2 - x1) * t1;
				a = Math.min(xa, xb); b = Math.max(xa, xb);
			}
			runs.push([a - half, b + half]);
		}
	}
	if (!runs.length) return null;
	runs.sort((one, two) => one[0] - two[0]);
	const merged = [[runs[0][0], runs[0][1]]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i][0] <= last[1] + .5) { if (runs[i][1] > last[1]) last[1] = runs[i][1]; }
		else merged.push([runs[i][0], runs[i][1]]);
	}
	return merged;
}
function _rapierDrawBandProfile(bands) {
	const at = t => bands[_rapierDrawClamp(Math.floor(t * bands.length), 0, bands.length - 1)];
	return { spanAt(t) { const runs = at(t); return runs?.length ? [runs[0][0], runs[runs.length - 1][1]] : null; }, runsAt: t => at(t) || null };
}
// Split from a recipe so a layout-side rotate preview (layout/browser.js) can feed a candidate
// recipe straight through, without a rendered <img> to resolve one from; `glyphs` is the rendered
// alpha fallback for label/text shapes, already resolved by the caller since it needs real pixels.
function _rapierDrawShapeProfileFor(recipe, glyphs) {
	const w = recipe?.canvas?.w, h = recipe?.canvas?.h;
	if (!recipe || !recipe.shapes.length || !(w > 0) || !(h > 0)) return null;
	const saved = recipe.view;
	const view = saved && saved.w > 0 && saved.h > 0
		? { x: +saved.x || 0, y: +saved.y || 0, w: +saved.w, h: +saved.h } : { x: 0, y: 0, w, h };
	// The scene filter paints paper and impressions beyond every source silhouette. The
	// document and shared page must reserve its saved viewport, even without decoded pixels.
	if (recipe.effect?.strength) return { spanAt() { return [0, 1]; }, runsAt() { return [[0, 1]]; } };

	if (recipe.shapes.length === 1 && recipe.shapes[0] && typeof recipe.shapes[0] === 'object' && !recipe.shapes[0].label && !recipe.shapes[0].effect?.strength) {
		const shape = recipe.shapes[0], g = shape.geom || {};

		if (!_rapierDrawShapePaintsInk(shape, recipe)) {

			if (shape.recognized === 'circle' && g.r > 0) {
				const reach = _rapierDrawRoundReach(shape, recipe, g.cx, g.cy, g.r, g.r);
				return _rapierDrawRoundProfile((g.cx - view.x) / view.w, (g.cy - view.y) / view.h, reach.rx / view.w, reach.ry / view.h);
			}
			if (shape.recognized === 'ellipse' && g.rx > 0 && g.ry > 0 && !g.rot) {
				const reach = _rapierDrawRoundReach(shape, recipe, g.cx, g.cy, g.rx, g.ry);
				return _rapierDrawRoundProfile((g.cx - view.x) / view.w, (g.cy - view.y) / view.h, reach.rx / view.w, reach.ry / view.h);
			}

		}
	}
	const covers = [];
	for (const shape of recipe.shapes) {
		if (glyphs && !shape.effect?.strength && (shape.recognized === 'text' || shape.recognized === 'paint')) continue;
		let cover = null;

		try { cover = _rapierDrawShapeCover(shape, recipe); } catch (_) { cover = null; }
		if (cover) covers.push(...(Array.isArray(cover) ? cover : [cover]));
		if (shape.geom && !_rapierDrawShapePaintsInk(shape, recipe) && (shape.recognized === 'arrow' || shape.recognized === 'line')) {
			const parts = _rapierDrawArrowParts(shape, recipe);
			for (const head of [parts.headStart, parts.headEnd]) if (head) covers.push({ poly: _rapierDrawGrowPolygon(head.poly, 1) });
		}

		if (shape.geom && !shape.asDrawn) {
			const g = shape.geom, box = (x, y, w, h) => ({ poly: [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]] });
			if (shape.angle) for (const p of shape.recognized === 'triangle' ? g.p : [[g.x1, g.y1]]) covers.push(box(p[0], p[1], 40, 40));
			if (shape.len) {
				const angle = Math.atan2(g.y2 - g.y1, g.x2 - g.x1), text = String(Math.round(Math.hypot(g.x2 - g.x1, g.y2 - g.y1)));
				const measure = _rapierDrawMeasureLabelBox(text);
				covers.push(box((g.x1 + g.x2) / 2 - Math.sin(angle) * 12, (g.y1 + g.y2) / 2 + Math.cos(angle) * 12 - 5, measure.width / 2 + 2, 11));
			}
		}
		let labelBox = null;
		try { labelBox = _rapierDrawLabelBox(shape, recipe); } catch (_) { labelBox = null; }
		if (labelBox && !glyphs) covers.push({ poly: _rapierDrawTextLayout(shape, recipe).polygon });
	}
	if (!covers.length && !glyphs) return null;
	const bands = [];
	let any = false;
	for (let i = 0; i < RAPIER_DRAW_BANDS; i++) {

		const top = view.y + i / RAPIER_DRAW_BANDS * view.h;
		const bottom = view.y + (i + 1) / RAPIER_DRAW_BANDS * view.h;
		const runs = _rapierDrawMergeRuns([
			_rapierDrawRunsAtY(covers, top), _rapierDrawRunsAtY(covers, (top + bottom) / 2), _rapierDrawRunsAtY(covers, bottom)]);
		const scaled = (runs || []).map(([a, b]) => [
			_rapierDrawClamp((a - view.x) / view.w, 0, 1),
			_rapierDrawClamp((b - view.x) / view.w, 0, 1)]).filter(([a, b]) => b > a);
		const merged = _rapierDrawMergeRuns([scaled, glyphs?.runsAt((i + .5) / RAPIER_DRAW_BANDS)], .001);
		if (merged?.length) any = true;
		bands.push(merged);
	}
	return any ? _rapierDrawBandProfile(bands) : null;
}
function _rapierDrawShapeProfile(imageEl) {
	const recipe = _rapierDrawRecipeFromImage(imageEl);
	const glyphs = recipe?.shapes.some(shape => shape.recognized === 'text' || shape.recognized === 'paint' || shape.label) ? globalThis.RapierImageLayout.alphaProfile(imageEl) : null;
	return _rapierDrawShapeProfileFor(recipe, glyphs);
}
// Draw ON a picture (the founder's list item 8: "tap the picture, press the brush, the existing
// Draw door, that raster as paper, Done writes in place, do not crop. One path").
//
// The picture becomes a `paint` shape filling the canvas -- the same shape the Paint tool commits a
// painting as, which is why this needs no new representation, no new codec, no second write-back
// and no second Done: it serialises as a PNG/JPEG XL <image> inside the drawing's
// own SVG, so what lands back in the document is one picture with the person's marks on it.
//
// Not cropped, by construction: the canvas is the picture's own pixel size and the shape's frame is
// the whole canvas, so the frame's aspect ratio IS the picture's and the renderer's
// preserveAspectRatio="none" has nothing to squash.
//
// Existing PNG/JPEG XL bytes are already the picture: keep them verbatim. Other codecs are
// decoded once and kept losslessly; the 12MP live surface, not a document raster byte cap, bounds
// this door. A refused encode never removes the original picture from its document.
async function _rapierDrawPictureRaster(imageEl) {
	const w = imageEl.naturalWidth, h = imageEl.naturalHeight;
	if (!(w > 0 && h > 0)) throw new Error('This picture has not finished loading');
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('This picture is larger than the 12-megapixel painting surface. Use a smaller copy to draw on.');
	if (w > 16384 || h > 16384) throw new Error('This picture is too wide or tall for the painting surface. Use a smaller copy to draw on.');
	const original = _rapierDrawImageDataUrl(imageEl) || imageEl.currentSrc || imageEl.getAttribute('src');
	if (globalThis.RapierDrawCore._rapierDrawValidRaster(original, Infinity)) return { raster: original, w, h };
	const canvas = document.createElement('canvas');
	canvas.width = w; canvas.height = h;
	try {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('This browser could not read the picture');
		ctx.drawImage(imageEl, 0, 0, w, h);
		let px;
		try { px = ctx.getImageData(0, 0, w, h); }
		catch (_) { throw new Error('This picture comes from another site, so the browser will not let Rapier read its pixels to draw on'); }
		let raster;
		try {
			const out = await globalThis.RapierEmbeddedImages.codec('encode',
				{width: w, height: h, data: new Uint8Array(px.data.buffer.slice(0)), options: {lossless: true}});
			raster = 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out);
		} catch (error) {
			// The codec has its own byte bound. PNG is also lossless, and live work need not fit
			// one document picture; Add will explain its limit without blocking this photo's tools.
			if (error?.code !== 'JXL_SIZE') throw error;
			raster = canvas.toDataURL('image/png');
		}
		if (!globalThis.RapierDrawCore._rapierDrawValidRaster(raster, Infinity)) throw new Error('The complete picture could not be kept for drawing');
		return {raster, w, h};
	} finally { canvas.width = 0; canvas.height = 0; }
}

async function _rapierDrawOnPicture() {
	const blockId = _rapierImageRuntime.blockId, imageIndex = _rapierImageRuntime.imageIndex;
	const record = _rapierImageRecord(blockId, imageIndex);
	const imageEl = _rapierImageRuntime.image;
	if (!record || !imageEl) { showToast('That picture is no longer available', 'info'); return; }
	let held;
	try { held = await _rapierDrawPictureRaster(imageEl); }
	catch (error) { showToast(String(error?.message || error), 'error'); return; }
	// The slot is re-checked after the await: the person may have changed the document while the
	// encode ran, and what this is about to write into must still be what they pressed. The check is
	// on the live picture ELEMENT and its own slot -- `_rapierImageRecord` builds a fresh record
	// object on every call, so comparing records by identity is always false and would refuse every
	// single time (it did).
	if (_rapierImageRuntime.image !== imageEl || _rapierImageRuntime.blockId !== blockId || _rapierImageRuntime.imageIndex !== imageIndex) {
		showToast('That picture changed while it was being read; press the brush again', 'info'); return;
	}
	const {raster, w, h} = held;
	const recipe = {version: RAPIER_DRAW_VERSION, canvas: {w, h}, strokes: [],
		shapes: [{id: 's1', recognized: 'paint', geom: {cx: w / 2, cy: h / 2, w, h, rot: 0}, raster, paint: {px: [w, h], scale: 1}}]};
	const currentAlt = _rapierImageAltText(_rapierImageAltSourceParts(record.image.altSource).alt);
	const asset = imageEl.getAttribute('data-rapier-asset') || record.image.reference || '';
	_rapierDrawOpenSurface({recipe, keepRasters: true, editing: {blockId: record.block.id, imageIndex: record.imageIndex, title: currentAlt, asset}, notes: _rapierDrawInANote()});
	_rapierCloseImageTools();
}

function _rapierEditDrawing() {
	const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
	const imageEl = _rapierImageRuntime.image;
	if (!record || !imageEl) { showToast('Drawing is no longer available', 'info'); return; }
	const drawing = _rapierDrawImageRecipe(imageEl), recipe = drawing?.recipe;
	if (drawing?.error) { showToast(drawing.error.message, 'error'); return; }
	if (!recipe) { showToast('This picture was not made with Draw', 'info'); return; }

	const currentAlt = _rapierImageAltText(_rapierImageAltSourceParts(record.image.altSource).alt);
	// The reference label this picture is already known by (`draw-3`, ...) -- the same pairing
	// `_rapierImageRecord`'s own callers read elsewhere (editor/engine.js): the DOM's own attribute
	// first, the parsed markdown reference as its fallback. R86g law 10's Download answer names its
	// file after this when re-editing an existing drawing, rather than the document's own name.
	const asset = imageEl.getAttribute('data-rapier-asset') || record.image.reference || '';
	// Reopened inside a note, the canvas is the note's (_rapierDrawInANote): it says so, and DONE
	// keeps the drawing with no question, as for a new one there.
	_rapierDrawOpenSurface({ recipe, editing: { blockId: record.block.id, imageIndex: record.imageIndex, title: currentAlt, asset, sourceUrl: drawing.url }, notes: _rapierDrawInANote() });
	_rapierCloseImageTools();
}
