// SPDX-License-Identifier: AGPL-3.0-only

const RAPIER_DRAW_INK_LABEL = Object.freeze({ green: 'Green', red: 'Red', blue: 'Blue', gold: 'Gold', purple: 'Purple' });

const RAPIER_DRAW_INK_ORDER = ['green', 'red', 'blue', 'gold', 'purple'];

const RAPIER_DRAW_BRUSH_LABEL = { ink: 'Plain', brush: 'Brush', sketch: 'Sketch', hatched: 'Hatched', sphere: 'Sphere', wheel: 'Wheel', pulley: 'Pulley',
	wood: 'Wood', knot: 'Knot', lens: 'Lens', spring: 'Spring', rope: 'Rope', tube: 'Tube', ray: 'Ray', light: 'Light' };

const RAPIER_DRAW_SNAP_EDGE_PX = 14;
const RAPIER_DRAW_SNAP_END_PX = 10;

const RAPIER_DRAW_TURN_STEP = Math.PI / 12;
// (RAPIER_DRAW_TURN_STEP) once the delta comes this close to a step, and release adds one more,
const RAPIER_DRAW_ROTATE_MAGNET_RAD = 4 * Math.PI / 180;
const RAPIER_DRAW_ROTATE_GRAVITY_RAD = 5 * Math.PI / 180;

const RAPIER_DRAW_STROKE_KEEP = 100;
const RAPIER_DRAW_STROKE_CHUNK = 256;
const RAPIER_DRAW_STROKE_CHUNK_CAP = 48;
const RAPIER_DRAW_STROKE_GAP_MAX = 64;
// (RAPIER_DRAW_PRESSURE_VARIANCE, 0.05) and the rendered outline width with it. Pressure (0..1) is
const RAPIER_DRAW_STROKE_PRESSURE_WEIGHT = 60;
const RAPIER_DRAW_STROKE_TIME_WEIGHT = 0.15;
const RAPIER_DRAW_STROKE_CHANNELS = [[3, RAPIER_DRAW_STROKE_PRESSURE_WEIGHT], [2, RAPIER_DRAW_STROKE_TIME_WEIGHT]];
const RAPIER_DRAW_STROKE_PRESSURE_KEEP = 0.12;

// pen's width is one for the Pen's Ink and Line alike. RAPIER_DRAW_NIB_DEFAULT (9, draw/core.mjs) stays
const RAPIER_DRAW_START_TOOLS = ['pen', 'brush', 'paint', 'water'], RAPIER_DRAW_NOTES_NIB = 5, RAPIER_DRAW_FRESH_NIB = 12;
const RAPIER_DRAW_MEMORY = {
	smooth: ['rapier:draw.smooth', RAPIER_DRAW_SMOOTH_DEFAULT, _rapierDrawSmoothLevel],
	nib: ['rapier:draw.nib', RAPIER_DRAW_FRESH_NIB, _rapierDrawNibLevel],
	shapeKind: ['rapier:draw.shapekind', 'rect', value => RAPIER_DRAW_SHAPE_KINDS.some(row => row[0] === value) ? value : 'rect'],
	penMode: ['rapier:draw.penMode', 'brush', value => value === 'pen' ? 'pen' : 'brush'],
	eraseSoftness: ['rapier:draw.eraseSoftness', 0, value => { const n = Number(value); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : 0; }],
	eraseNib: ['rapier:draw.eraseNib', RAPIER_DRAW_FRESH_NIB, _rapierDrawNibLevel],
	tool: ['rapier:draw.tool', 'water', value => RAPIER_DRAW_START_TOOLS.includes(value) ? value : 'water'],
	notesTool: ['rapier:notes.draw.tool', 'water', value => RAPIER_DRAW_START_TOOLS.includes(value) ? value : 'water'],
	notesNib: ['rapier:notes.draw.nib', RAPIER_DRAW_NOTES_NIB, _rapierDrawNibLevel],
	textDefaults: ['rapier:draw.textDefaults', '{}', String],
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
const RAPIER_DRAW_HIT_SLOP_COARSE_PX = 22;
const RAPIER_DRAW_MOVE_THRESHOLD_PX = 8;
const RAPIER_DRAW_DOUBLE_TAP_DIST_PX = 24;
const RAPIER_DRAW_DOUBLE_TAP_DIST_TOUCH_PX = 40;
const RAPIER_DRAW_HOLD_MS = 260;
const RAPIER_DRAW_TINY_HANDLE_PX = 16;
const RAPIER_DRAW_HANDLE_BEARING = { nw: 315, n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270 };
const RAPIER_DRAW_GHOST_HANDLES = new Set(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']);
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
	menuShapeId: null, editing: null, insertTarget: null, heldRoot: null,
	notes: null,

	replay: null, replayLeadEl: null, replayNibEl: null, replayTagEl: null, replayBarEl: null, stageEl: null,

	smooth: RAPIER_DRAW_SMOOTH_DEFAULT,

	ink: null,

	pointerPos: null, secondPointerId: null, secondPointerPos: null,

	touchSession: '',
	perf: { geomSnapshots: 0, strokeCount: 0, strokeFirst100: null },

	pressRingEl: null, pressRingTimer: null, scribbleEl: null,
	paintHead: null, headEl: null, headAt: null, headBrush: null,
};
const _rapierDrawCoarseMedia = typeof matchMedia === 'function' ? matchMedia('(any-pointer: coarse)') : null;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', evt => {
	if (evt.pointerType === 'touch') _rapierDrawState.touchSession = 'touch';
	else if (evt.pointerType === 'mouse') _rapierDrawState.touchSession = 'mouse';
}, { capture: true, passive: true });
function _rapierDrawCoarseSession() {
	const session = _rapierDrawState.touchSession;
	return session ? session === 'touch' : !!_rapierDrawCoarseMedia?.matches;
}

function _rapierDrawRecognize(rawPts) {
	return globalThis.RapierDrawFit.fitStroke(rawPts);
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
	return { contours, polygons, body: poly };
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
	let best = null, bestD = Infinity, hollow = null;
	for (let i = recipe.shapes.length - 1; i >= 0; i--) {
		const shape = recipe.shapes[i], { contours, polygons, body } = _rapierDrawHitGeometry(shape, recipe);
		const round = !_rapierDrawShapePaintsInk(shape, recipe) && ['circle', 'ellipse'].includes(shape.recognized) && _rapierDrawPointInRound(pt, shape.geom, shape.recognized);
		const open = !!body && shape.style === 'outline';
		if (!open && round || polygons.some(poly => !(open && poly === body) && _rapierDrawPointInPolygon(pt, poly))) {
			if (bestD > 0) { bestD = 0; best = shape.id; }
			continue;
		}
		if (open && (round || _rapierDrawPointInPolygon(pt, body))) hollow ||= shape.id;
		let d = Infinity;
		for (const points of contours) for (let k = 1; k < points.length; k++) d = Math.min(d, _rapierDrawPointSegDist(pt, points[k - 1], points[k]));
		d = Math.max(0, d - _rapierDrawStrokeHalf(shape, recipe));
		if (d <= slop && d < bestD) { bestD = d; best = shape.id; }
	}
	return best || hollow;
}
function _rapierDrawLabelHandleAt(shape, point) {
	if (!shape || shape.locked || !shape.label || !['line', 'arrow'].includes(shape.recognized)) return null;
	if (_rapierDrawShapePaintsInk(shape, _rapierDrawState.recipe)) return null;
	const layout = _rapierDrawTextLayout(shape, _rapierDrawState.recipe);
	if (!layout.polygon || !_rapierDrawPointInPolygon(point, layout.polygon)) return null;
	const handlePoint = [layout.center.x, layout.center.y];
	const svg = _rapierDrawState.svgRoot, screen = svg ? _rapierDrawMapToScreen(handlePoint[0], handlePoint[1], svg.getBoundingClientRect(), svg.viewBox.baseVal) : handlePoint;
	return { id: 'label', label: 'Move label along path', point: handlePoint, screen };
}
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
	if (!_rapierDrawState.snap) return null;
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
	if (!_rapierDrawState.snap) return null;
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
	const p = target ? target.point : point, anchor = target && _rapierDrawBindAnchorFor(target.shape, p, recipe);
	try { globalThis.RapierDrawEdit._rapierDrawSetBinding(shape, end, anchor || null, recipe, p); }
	catch (error) { showToast(String(error.message || error), 'error'); return null; }
	return target?.shape.id || null;
}

function _rapierDrawBindArrowEnds(g, recipe = _rapierDrawState.recipe) {
	const shape = { recognized: 'arrow', geom: { ...g } };
	const startId = _rapierDrawSetArrowEndpoint(shape, 'start', [g.x1, g.y1], recipe);
	const endId = _rapierDrawSetArrowEndpoint(shape, 'end', [g.x2, g.y2], recipe);
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
	if (!_rapierDrawState.snap) return geom;
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
		if (!_rapierDrawHistoryEqual(prior, next)) shapes[id] = { before: prior || null, after: next ? _rapierDrawHistoryCopy(next) : null };
	}
	const beforeOrder = before.shapes.map(shape => shape.id), afterOrder = after.shapes.map(shape => shape.id);
	const orderChanged = beforeOrder.join('\0') !== afterOrder.join('\0');
	const strokes = {};
	for (let i = 0; i < Math.max(before.strokes.length, after.strokes.length); i++)
		if (!_rapierDrawHistoryEqual(before.strokes[i], after.strokes[i])) strokes[i] = { before: before.strokes[i] || null, after: after.strokes[i] ? _rapierDrawHistoryCopy(after.strokes[i]) : null };
	const strokesChanged = before.strokes.length !== after.strokes.length || Object.keys(strokes).length > 0;
	const fontsChanged = (before.fonts || []).map(font => font.id).join('\0') !== (after.fonts || []).map(font => font.id).join('\0');
	const metaKeys = ['canvas', 'view', 'tool', 'smooth', 'nib', 'angle', 'light', 'paper', 'effect', 'frame', 'background', 'backgrounds'];
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
			strokes: strokesChanged ? { length: { before: before.strokes.length, after: after.strokes.length }, at: strokes } : undefined,
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
	if (entry.delta.strokes) {
		recipe.strokes.length = entry.delta.strokes.length[side];
		for (const [i, pair] of Object.entries(entry.delta.strokes.at)) if (pair[side]) recipe.strokes[i] = _rapierDrawHistoryCopy(pair[side]);
	}
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
	state.renderEdit = { snapshot, undo: state.undoStack, redo: state.redoStack };
	if (amend && state.undoStack.length) {
		const previous = state.undoStack.at(-1);
		snapshot = { ..._rapierDrawHistoryRecipe(_rapierDrawRestoreRecipe(previous)),
			selection: previous.selection, shift: previous.shift, agent: previous.agent, act: previous.act };
		if(previous.paintHistory)Object.defineProperty(snapshot,'paintHistory',{value:previous.paintHistory,configurable:true});
		state.undoStack = state.undoStack.slice(0, -1).concat(snapshot);
	} else state.undoStack = state.undoStack.concat(snapshot).slice(-60);
	if (!snapshot.act) snapshot.act = {id: 'draw:' + state.session + ':' + (state.historyActSequence = (state.historyActSequence || 0) + 1),
		actor: {kind: 'human', id: 'local'}, createdAt: Date.now(), operation: 'drawing.change'};
	state.renderEdit.entry = snapshot;
	state.redoStack = [];
	if(typeof _rapierPaintTrimHistory==='function')_rapierPaintTrimHistory();
	_rapierDrawRenderHistory();
	return snapshot;
}
function _rapierDrawStepAmendable(entry, ids) {
	const stack = _rapierDrawState.undoStack, at = stack.indexOf(entry);
	if (at < 0 || !entry.delta || !ids.every(id => entry.delta.shapes?.[id]?.after)) return false;
	return stack.slice(at + 1).every(later => later.delta && !later.shift && !ids.some(id => later.delta.shapes?.[id]));
}
function _rapierDrawAmendStep(entry, shapes) {
	if (!_rapierDrawStepAmendable(entry, shapes.map(shape => shape.id))) return false;
	for (const shape of shapes) entry.delta.shapes[shape.id] = { ...entry.delta.shapes[shape.id], after: _rapierDrawHistoryCopy(shape) };
	_rapierDrawHumanChanged();
	_rapierDrawRenderHistory();
	return true;
}
function _rapierDrawSealHistory(before = _rapierDrawState.undoStack.at(-1)) {
	const state = _rapierDrawState;
	if (!before || before.delta) return before;
	try {
		const grown = _rapierDrawGrowCanvasToContent();
		if (grown && (grown.dx || grown.dy)) { if (!grown.recorded) before.shift = { dx: (before.shift?.dx || 0) + grown.dx, dy: (before.shift?.dy || 0) + grown.dy }; _rapierDrawRenderShapes(); }
	} catch (_) {}
	const prior = { ...before.recipe, fonts: before.fonts };
	const entry = _rapierDrawHistoryDelta(prior, state.recipe);
	entry.selection = (before.selection || []).slice();
	if (before.act) entry.act = before.act;
	if(before.paintHistory)Object.defineProperty(entry,'paintHistory',{value:before.paintHistory,configurable:true});
	if (before.shift) entry.shift = before.shift;
	if (before.agent) entry.agent = { before: String(before.agent.before || ''), after: String(before.agent.after || ''), transactionId: before.agent.transactionId,
		savedBefore: before.agent.savedBefore || null, savedAfter: before.agent.savedAfter || null };
	const at = state.undoStack.lastIndexOf(before);
	if (at >= 0) state.undoStack[at] = entry;
	if (!entry.agent && (Object.keys(entry.delta.shapes).length || entry.delta.beforeOrder || entry.delta.strokes || entry.delta.beforeMeta || entry.delta.fonts)) _rapierDrawHumanChanged();
	if (entry.agent) globalThis.RapierChanges?.schedule();
	return entry;
}

function _rapierDrawHistoryProject(target = {}) {
	const state = _rapierDrawState;
	if (!state.open || !state.recipe) return {ok: false, reason: 'drawing_unavailable'};
	const entries = state.undoStack.map(entry => {
		const tx = entry.agent && (typeof rapier === 'undefined' ? null : rapier.undo?.ledger?.find(row => row.transaction.id === entry.agent.transactionId)?.transaction);
		const act = entry.agent ? tx : entry.act;
		const sourceIds = act?.sourceActIds || act?.sourceTransactionIds || (act?.sourceTransactionId ? [act.sourceTransactionId] : null);
		return {entry, act: act ? {id: act.id, actor: {...act.actor}, createdAt: act.createdAt, operation: act.operation,
			...(act.turnId ? {turnId: act.turnId} : {}), ...(act.turnLabel ? {turnLabel: act.turnLabel} : {}),
			...(sourceIds ? {sourceActIds: sourceIds.slice()} : {})} : null};
	});
	const acts = entries.flatMap(row => row.act && (target.turnId == null || row.act.turnId === target.turnId) &&
		(target.actorId == null || row.act.actor.id === target.actorId) ? [row.act] : []);
	const result = {ok: true, session: state.session, acts, groups: globalThis.RapierLedger.groupHistoryActs(acts)};
	if (target.actId == null) return result;
	const at = entries.findIndex(row => row.act?.id === target.actId);
	if (at < 0) return {ok: false, reason: 'act_unavailable'};
	if (_rapierDrawBusy().human || state.replay) return {ok: false, reason: 'drawing_busy'};
	let recipe = _rapierDrawHistoryCopy(state.recipe);
	const later = [];
	for (let index = entries.length - 1; index >= at; index--) {
		const after = recipe, before = _rapierDrawApplyHistory(entries[index].entry, 'before', after);
		if (index === at) return {...result, act: entries[index].act, before, after,
			...(target.withLater ? {later: later.reverse()} : {})};
		later.push({act: entries[index].act, before, after}); recipe = before;
	}
	return {ok: false, reason: 'act_unavailable'};
}

async function _rapierDrawUndoAct(target) {
	const state = _rapierDrawState, entry = target.entry, session = target.session;
	if (!entry?.act || !state.open || state.session !== session || !state.undoStack.includes(entry)) return false;
	await _rapierPaintCloseLayer();
	if (!state.open || state.session !== session || state.finishing || _rapierDrawBusy().human || !state.undoStack.includes(entry)) return false;
	const projection = _rapierDrawHistoryProject({actId: entry.act.id, withLater: true});
	if (!projection.ok) return false;
	const original = _rapierDrawHistoryCopy(state.recipe), undo = state.undoStack, head = undo.at(-1);
	const before = _rapierDrawHistoryCopy(projection.before), after = _rapierDrawHistoryCopy(projection.after);
	const changes = (globalThis.RapierKernel.paintUndoChanges(original, before, after) || []).filter(change =>
		!_rapierDrawHistoryEqual(original.shapes.find(shape => shape.id === change.id)?.paint?.replay, change.replay));
	const material = new Map();
	for (const change of changes) {
		const shape = original.shapes.find(row => row.id === change.id);
		let replayed;
		try { replayed = await _rapierDrawPaintReplay(shape, change.omitIds, {requireEmptyBase: change.requireEmptyBase === true}); }
		catch (_) { return false; }
		if (!replayed || replayed.id !== shape.id || !_rapierDrawHistoryEqual(replayed.geom, shape.geom) ||
			!_rapierDrawHistoryEqual(replayed.paint?.px, shape.paint?.px) || replayed.paint?.scale !== shape.paint?.scale) return false;
		const omitted = new Set(change.omitIds);
		const expected = {...shape.paint.replay, entries: shape.paint.replay.entries.map(row => omitted.has(row.id) ? {...row, removed: true} : row)};
		if (!_rapierDrawHistoryEqual(replayed.paint?.replay, expected)) return false;
		material.set(shape.id, replayed);
		for (const recipe of [before, after]) {
			const index = recipe.shapes.findIndex(row => row.id === shape.id);
			const kept = {...(index < 0 ? shape : recipe.shapes[index]), raster: shape.raster, paint: shape.paint, geom: shape.geom};
			if (index < 0) recipe.shapes.push(kept); else recipe.shapes[index] = kept;
		}
	}
	const next = globalThis.RapierDrawCore._rapierDrawUndoRecipe(original, before, after, projection.later);
	if (!next) return false;
	for (const [id, replayed] of material) {
		const shape = next.shapes.find(row => row.id === id);
		if (!shape) return false;
		shape.raster = replayed.raster; shape.paint = replayed.paint;
	}
	if (!state.open || state.session !== session || state.finishing || _rapierDrawBusy().human || state.undoStack !== undo ||
		undo.at(-1) !== head || !_rapierDrawHistoryEqual(state.recipe, original)) return false;
	if (_rapierDrawHistoryEqual(next, original)) return {outcome: 'applied', unchanged: true, actId: entry.act.id};
	const selection = _rapierDrawSelection(), kept = new Set(next.shapes.map(shape => shape.id));
	const applied = await _rapierDrawCommand(() => {
		if (!state.open || state.session !== session || state.finishing || _rapierDrawBusy().human || state.undoStack !== undo ||
			undo.at(-1) !== head || !_rapierDrawHistoryEqual(state.recipe, original)) throw new Error('The drawing changed before Undo landed');
		state.recipe = next; _rapierDrawSetSelection(selection.filter(id => kept.has(id)));
	}, true, true, {operation: 'drawing.undo_act', sourceActIds: [entry.act.id]});
	if (!applied) return false;
	return {outcome: 'applied', unchanged: false, actId: entry.act.id};
}

function _rapierDrawSyncCanvasAccess() {
	const state = _rapierDrawState, canvas = state.svgRoot, shapes = state.recipe?.shapes || [];
	if (!canvas || !state.svg) return;
	const selected = new Set(_rapierDrawTool() === 'select' ? _rapierDrawSelection() : []);
	const objects = new Map(shapes.map((shape, index) => [shape.id, {shape, index}]));
	const lockedGroups = new Set(shapes.filter(shape => shape.locked && shape.group).map(shape => shape.group));
	let active = null;
	for (const node of state.svg.querySelectorAll('[data-shape-id]')) {
		const item = objects.get(node.getAttribute('data-shape-id'));
		if (!item) continue;
		const {shape, index} = item, label = String(shape.label || '').trim();
		node.id = 'rapier-draw-object-' + shape.id;
		node.setAttribute('role', 'button'); node.setAttribute('tabindex', '-1');
		node.setAttribute('aria-pressed', String(selected.has(shape.id)));
		node.setAttribute('aria-label', _rapierDrawKindWord(shape.recognized) + (label ? ': ' + label : '') + ', ' + (index + 1) + ' of ' + shapes.length + (shape.locked || lockedGroups.has(shape.group) ? ', locked' : ''));
		if (shape.id === state.canvasShapeId && selected.has(shape.id)) active = node.id;
	}
	canvas.setAttribute('role', 'application');
	const name = 'Draw canvas, ' + (RAPIER_DRAW_TOOL_WORDS[_rapierDrawTool()] || _rapierDrawTool()) + ' tool. ' + _rapierDrawTextAlternative(state.recipe);
	if (canvas.getAttribute('aria-label') !== name) canvas.setAttribute('aria-label', name);
	if (active) canvas.setAttribute('aria-activedescendant', active); else canvas.removeAttribute('aria-activedescendant');
}
async function _rapierDrawSelectCanvasShape(id, {extend = false, toggle = false} = {}) {
	const state = _rapierDrawState, session = state.session;
	if (!state.open || state.finishing || state.gesture) return;
	if (_rapierDrawTool() !== 'select') await _rapierDrawSetTool('select');
	if (!state.open || state.session !== session || _rapierDrawTool() !== 'select' || !_rapierDrawShapeById(id)) return;
	state.canvasShapeId = id;
	const selected = _rapierDrawSelection();
	_rapierDrawSetSelection(toggle ? _rapierDrawToggleSelection(selected, id) : extend ? selected.concat(id) : [id]);
	_rapierDrawRenderAll(); state.svgRoot.focus({preventScroll: true});
}

function _rapierDrawMarkSelection() {
	if (!_rapierDrawState.svg) return;
	const chosen = new Set(_rapierDrawTool() === 'select' ? _rapierDrawSelection() : []);
	for (const g of _rapierDrawState.svg.querySelectorAll('[data-shape-id]')) {
		if (chosen.has(g.getAttribute('data-shape-id'))) g.setAttribute('data-selected', ''); else g.removeAttribute('data-selected');
	}
	_rapierDrawSyncCanvasAccess();
	_rapierDrawUpdateHandles();
}

function _rapierDrawParseSvgNode(html) {
	const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	tmp.innerHTML = html;
	return tmp.firstElementChild;
}
function _rapierDrawUpdatePicture(node, fresh) {
	const images = node.querySelectorAll?.('image'), next = fresh.querySelectorAll?.('image');
	if (!images?.length || images.length !== next?.length || [...images].some((image, i) => image.getAttribute('href') !== next[i].getAttribute('href'))) return false;
	const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && a.childNodes.length === b.childNodes.length &&
		(a.nodeType !== 1 || [...a.childNodes].every((child, i) => same(child, b.childNodes[i])));
	if (!same(node, fresh)) return false;
	const copy = (a, b) => {
		if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
		for (const attr of [...a.attributes]) if (!b.hasAttributeNS(attr.namespaceURI, attr.localName)) a.removeAttributeNS(attr.namespaceURI, attr.localName);
		for (const attr of b.attributes) if (a.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value) a.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
		a.childNodes.forEach((child, i) => copy(child, b.childNodes[i]));
	};
	copy(node, fresh);
	return true;
}
function _rapierDrawPatchShapeNodes(ids) {
	const state = _rapierDrawState, host = state.svg;
	if (!host || !ids?.length) return;
	if (state.recipe.effect || state.recipe.shapes.some(shape => shape.effect && shape.paint?.group) || host.querySelector('[data-rapier-effect-scene],[data-rapier-effect-layer]')) { _rapierDrawAdoptShapeNodes(); return; }
	_rapierDrawRerouteBoundArrows(state.recipe);
	const patch = new Set(ids);
	for (const shape of state.recipe.shapes) {
		if (shape.bind && Object.values(shape.bind).some(anchor => patch.has(anchor.to))) patch.add(shape.id);
	}
	for (const id of _rapierDrawRouteChanges(state.recipe, ids, !!state.gesture)) patch.add(id);
	for (const shape of state.recipe.shapes) {
		if (!patch.has(shape.id)) continue;
		const html = _rapierDrawShapeMarkup(_rapierDrawDisplayShape(shape), state.recipe, {sourceOnly: true});
		_rapierDrawNoteColours(html);
		const next = _rapierDrawParseSvgNode(html);
		if (!next) continue;
		const existing = host.querySelector('[data-shape-id="' + shape.id + '"]');
		if (existing) { if (!_rapierDrawUpdatePicture(existing, next)) existing.replaceWith(next); } else host.appendChild(next);
	}
	_rapierDrawDarkStyleSync();
	_rapierDrawMarkSelection();
}
function _rapierDrawAdoptShapeNodes() {
	const state = _rapierDrawState, host = state.svg;
	_rapierDrawRerouteBoundArrows(state.recipe);
	if (state.recipe.effect || state.recipe.shapes.some(shape => shape.effect && shape.paint?.group) || host.querySelector('[data-rapier-effect-scene],[data-rapier-effect-layer]')) {
		const display = { ...state.recipe, shapes: state.recipe.shapes.map(_rapierDrawDisplayShape) };
		const html = _rapierDrawSceneMarkup(display, false, true, {sourceOnly: true});
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
	let prev = null;
	const kept = new Set(state.recipe.shapes.map(shape => String(shape.id)));
	for (const shape of state.recipe.shapes) {
		const html = _rapierDrawShapeMarkup(_rapierDrawDisplayShape(shape), state.recipe, {sourceOnly: true});
		_rapierDrawNoteColours(html);
		let node = previous.get(shape.id);
		const current = node?.outerHTML.replace(/^<g\b[^>]*>/, head => head.replace(/ (?:id|role|tabindex|aria-label|aria-pressed)="[^"]*"/g, ''));
		if (!node || current !== html) {
			const fresh = _rapierDrawParseSvgNode(html);
			if (!fresh) continue;
			if (!node || !_rapierDrawUpdatePicture(node, fresh)) {
				if (node) node.replaceWith(fresh);
				node = fresh;
			}
		}
		let place = prev ? prev.nextSibling : host.firstChild;
		while (place && place !== node && !kept.has(place.getAttribute?.('data-shape-id'))) place = place.nextSibling;
		if (place !== node) host.insertBefore(node, place);
		prev = node;
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
			if (typeof _rapierPaintSettleClosing === 'function') _rapierPaintSettleClosing();
			if (state.paintLayer && typeof _rapierPaintReattachLive === 'function') _rapierPaintReattachLive();
			state.renderEdit = null;
			_rapierDrawLiquidSync(); _rapierDrawCopierSync();
			if (globalThis.RapierDrawRefraction.hasRefraction(state.recipe) && !state.gesture) _rapierDrawEffectsPreviewSchedule();
			else if (state.effectsPreviewNode) _rapierDrawEffectsPreviewRelease(false);
			if (refused) showToast(refused.code === 'drawing_route_blocked' ? 'That move blocks a connector. Your diagram was kept.' : refused.message, 'error');
			globalThis.RapierChanges?.locate();
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
	_rapierDrawApplyView();
	_rapierDrawRenderShapes();
	_rapierDrawUpdateMenu();
	_rapierPaintSyncPaper();
	_rapierDrawRenderHistory();
	if (_rapierDrawTool() === 'effects') _rapierDrawEffectsSync();
}
function _rapierDrawGrowCanvas(minX, minY, maxX, maxY) {
	const state = _rapierDrawState, recipe = state.recipe;
	if (!recipe || ![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
	const dx = Math.max(0, Math.ceil(-minX)), dy = Math.max(0, Math.ceil(-minY));
	const w = Math.max(recipe.canvas.w + dx, Math.ceil(maxX + dx)), h = Math.max(recipe.canvas.h + dy, Math.ceil(maxY + dy));
	if (!dx && !dy && w === recipe.canvas.w && h === recipe.canvas.h) return null;
	if (dx || dy) for (const shape of recipe.shapes) _rapierDrawTranslateShape(shape, recipe, dx, dy);
	if ((dx || dy) && recipe.frame) recipe.frame = { ...recipe.frame, x: recipe.frame.x + dx, y: recipe.frame.y + dy };
	if ((dx || dy) && recipe.background?.kind === 'paper') recipe.background = globalThis.RapierDrawCore._rapierDrawPaperShifted(recipe.background, dx, dy);
	recipe.canvas = { w, h };
	state.canvasFollowsStage = false;
	let recorded = false;
	if (dx || dy) { const v = _rapierDrawView(); v.x += dx; v.y += dy; recorded = _rapierDrawRecordShift(dx, dy); }
	_rapierDrawApplyView();
	return { dx, dy, recorded };
}
const RAPIER_DRAW_PAPER_MARGIN = 24;
function _rapierDrawGrowCanvasToContent(recipe = _rapierDrawState.recipe, margin = RAPIER_DRAW_PAPER_MARGIN) {
	const source = recipe && { ...recipe, effect: undefined, shapes: recipe.shapes.map(shape => shape.effect ? { ...shape, effect: undefined } : shape) };
	const box = source && _rapierDrawUnionView(source);
	if (!box) return null;
	const m = margin;
	return _rapierDrawGrowCanvas(box.minX < 0 ? box.minX - m : 0, box.minY < 0 ? box.minY - m : 0,
		box.maxX > recipe.canvas.w ? box.maxX + m : recipe.canvas.w,
		box.maxY > recipe.canvas.h ? box.maxY + m : recipe.canvas.h);
}
function _rapierDrawRecordShift(dx, dy) {
	const state = _rapierDrawState, entry = state.undoStack.at(-1);
	if (!entry || entry !== state.renderEdit?.entry) return false;
	entry.shift = {dx: (entry.shift?.dx || 0) + dx, dy: (entry.shift?.dy || 0) + dy};
	return true;
}
function _rapierDrawDialButton(act) {
	const button = document.getElementById('btn-' + act).cloneNode(true);
	button.removeAttribute('id'); button.removeAttribute('data-action'); button.dataset.drawAct = act;
	return button;
}
function _rapierDrawRenderHistory() {
	const state = _rapierDrawState, [undo, redo] = state.surface?.querySelectorAll('.rapier-draw-head .rapier-dial') || [], layer = state.paintLayer;
	if (!undo || !redo) return;
	_rapierDialSay(undo, 'undo change', state.finishing || !(state.undoStack.length || layer?.pendingOverflow || layer?.pendingLift || layer?.pendingCommit || layer?.previousFlip?.pendingCommit || layer?.surface?.wetState || layer?.dryFinishing));
	_rapierDialSay(redo, 'redo change', state.finishing || !state.redoStack.length);
	const keys = matchMedia('(pointer: fine)').matches;
	for (const [button, chord] of [[undo, 'Mod+Z'], [redo, 'Mod+Shift+Z']]) {
		button.setAttribute('aria-keyshortcuts', ['Control', 'Meta'].map(mod => chord.replace('Mod', mod)).join(' '));
		if (keys) button.dataset.tip += ' (' + _rapierChordWords(chord) + ')';
	}
}
function _rapierDrawUndo(redo = false, target = null) {
	const state = _rapierDrawState;
	if (target && (!state.open || target.session !== state.session)) return false;
	if (!target) { state.effectsChangeEpoch = (state.effectsChangeEpoch || 0) + 1; state.effectsPendingChange = null; }
	const water = _rapierPaintWaterPending();
	if (water) {
		if (!target) target = {session: state.session, entry: (redo ? state.redoStack : state.undoStack).at(-1)};
		return water.then(() => _rapierDrawUndo(redo, target));
	}
	if (!_rapierDrawFinishText()) return false;
	_rapierDrawReplayEnd();
	if (!target) target = {session: state.session, entry: (redo ? state.redoStack : state.undoStack).at(-1)};
	if (state.waterAction) return state.waterAction.then(() => _rapierDrawUndo(redo, target));
	if (state.paintEraseFan) return state.paintEraseFan.promise.then(() => _rapierDrawUndo(redo, target));
	if (state.paintDeparture) return state.paintDeparture.promise.then(() => _rapierDrawUndo(redo, target));
	const layer = state.paintLayer, owns = () => state.open && target.session === state.session && (!state.paintLayer || state.paintLayer === layer);
	return _rapierPaintAfter(_rapierPaintFlushRevision(), () => {
		if (!owns()) return false;
		_rapierDrawCancelGesture();
		if (!owns()) return false;
		return _rapierPaintAfter(_rapierPaintFlushRevision(), () => {
			if (!owns()) return false;
			const idle = () => owns() && !state.gesture && !state.markerPress;
			return _rapierPaintAfter(typeof _rapierPaintLeaveWash === 'function' ? _rapierPaintLeaveWash(idle) : null, () => !owns() ? false :
				_rapierPaintAfter(typeof _rapierPaintFlushWet === 'function' ? _rapierPaintFlushWet(true, idle) : null, () => owns() ? _rapierDrawUndoWalk(redo, target) : false));
		});
	});
}
function _rapierDrawUndoWalk(redo, target) {
	const state = _rapierDrawState, layer = state.paintLayer;
	const owns = () => state.open && (!target || target.session === state.session) && (!state.paintLayer || state.paintLayer === layer);
	if (!owns()) return false;
	if (state.gesture || state.markerPress) return _rapierDrawUndo(redo, target);
	if (redo || typeof _rapierPaintDiscardOverflow !== 'function') return _rapierDrawUndoStep(redo, target);
	return _rapierPaintAfter(_rapierPaintDiscardOverflow(() => owns() && !state.gesture && !state.markerPress), discarded => {
		if (!owns()) return false;
		if (discarded) { _rapierDrawBackupTouch(); return; }
		return _rapierDrawUndoStep(redo, target);
	});
}
function _rapierDrawUndoStep(redo, target, replayed = null) {
	const state = _rapierDrawState;
	if (target && (!state.open || target.session !== state.session)) return false;
	if (state.gesture || state.markerPress) return _rapierDrawUndo(redo, target);
	const session = target ? target.session : state.session, owns = () => state.open && state.session === session;
	const closing = state.paintLayer ? _rapierPaintLeaveForHistory(owns) : state.paintSetting?.auto ? _rapierPaintCloseLayer(owns) : null;
	if (closing) return closing.then(closed => !owns() ? false : state.gesture || state.markerPress ? _rapierDrawUndo(redo, target) : closed === false ? false : _rapierDrawUndoStep(redo, target));
	if (!redo && target?.entry && (target.selective || target.entry.agent && state.undoStack.at(-1) !== target.entry)) {
		if (target.selective && target.entry.agent) return state.undoStack.includes(target.entry)
			? globalThis.RapierAgentBrowser?.undoHistoryAct?.({actId: target.entry.agent.transactionId}) ?? false : false;
		return target.entry.agent ? globalThis.RapierAgentBrowser?.undoDrawingChange?.(target.entry, target.session) ?? false
			: _rapierDrawUndoAct(target);
	}
	const from = redo ? state.redoStack : state.undoStack, to = redo ? state.undoStack : state.redoStack;
 const head=from.at(-1);
 if(head && replayed!==head && typeof _rapierPaintReplayHistory==='function'){
  const replay=_rapierPaintReplayHistory(head,redo?'after':'before');
  if(replay)return replay.then(()=>owns()?_rapierDrawUndoStep(redo,target,head):false);
 }
 const prior = from.pop();
	if (!prior) return false;
	if (prior.delta) { to.push(prior); state.recipe = _rapierDrawApplyHistory(prior, redo ? 'after' : 'before'); }
	else { to.push(_rapierDrawHistoryRecipe()); state.recipe = _rapierDrawRestoreRecipe(prior); }
 if(typeof _rapierPaintHistoryWalk==='function')_rapierPaintHistoryWalk(prior,redo?'after':'before');
	if (state.recipe.background?.kind === 'paper' && typeof _rapierWaterFollowPaper === 'function') _rapierWaterFollowPaper(state.recipe.background.paper);
	if (prior.shift) { const v = _rapierDrawView(), s = redo ? 1 : -1; v.x += s * prior.shift.dx; v.y += s * prior.shift.dy; }
	const live = new Set(state.recipe.shapes.map(shape => shape.id)), ids = prior.delta ? (redo ? prior.redoSelection : prior.selection) : prior.selection;
	_rapierDrawSetSelection(state.tool === 'select' ? (ids || []).filter(id => live.has(id)) : []); _rapierDrawRenderAll();
	if (typeof _rapierPaintSyncPaper === 'function') _rapierPaintSyncPaper();
	state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error'));
	let journal = null;
	if (prior.agent) {
		const asset = redo ? prior.agent.after : prior.agent.before;
		const baseline = redo ? prior.agent.savedAfter : prior.agent.savedBefore;
		const session = state.session;
		journal = _rapierDrawFollowAgentJournal(redo, prior.agent);
		if (journal) journal = Promise.resolve(journal).then(ok => {
			if (ok && state.open && state.session === session) {
				if (state.editing && asset) state.editing = { ...state.editing, asset: String(asset) };
				if (baseline) state.openSnapshot = baseline;
			}
			return ok;
		}).catch(() => false);
	}
	_rapierDrawHumanChanged();
	_rapierDrawBackupTouch();
	return journal;
}
function _rapierDrawFollowAgentJournal(redo, agent) {
	if (typeof rapier === 'undefined' || !rapier.undo?.branch) return null;
	const index = redo ? rapier.undo.cursor : rapier.undo.cursor - 1;
	const target = rapier.undo.branch[index];
	const tx = target?.transaction;
	if (!tx || tx.id !== agent?.transactionId || !['document.draw', 'document.undo'].includes(tx.operation) || tx.actor?.kind !== 'agent') return null;
	const walk = redo ? (typeof rapierRedo === 'function' ? rapierRedo : null)
		: (typeof rapierUndo === 'function' ? rapierUndo : null);
	if (!walk) return null;
	const session = _rapierDrawState.session;
	const splices = redo ? target.splices : target.splices.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
	return Promise.resolve(walk()).then(ok => {
		if (ok && _rapierDrawState.open && _rapierDrawState.session === session) _rapierDrawFollow(splices);
		return ok;
	});
}
async function _rapierDrawClearAll(session) {
	const state = _rapierDrawState, current = () => state.open && state.session === session && !state.finishing;
	const idle = () => current() && !state.waterAction && !state.paintEraseFan && !state.paintDeparture && !state.gesture && !state.markerPress;
	try {
		while (current()) {
			_rapierDrawCancelGesture();
			const pending = _rapierPaintPendingStroke();
			if (pending) { await pending; continue; }
			const settled = _rapierPaintSettleOverflow(); if (settled) await settled;
			if (!current()) return;
			if (!idle()) continue;
			const closed = _rapierPaintCloseLayer(idle); if (closed) await closed;
			if (!current()) return;
			if (!idle() || state.paintLayer) continue;
			const flushing = _rapierPaintFlushRevision();
			if (flushing) { await flushing; continue; }
			const ids = _rapierDrawGroupSelection(state.recipe, state.recipe.shapes.map(shape => shape.id));
			if (ids.length) return _rapierDrawEditSelection({ type: 'delete' }, ids);
			return;
		}
	} catch (error) {
		if (current()) showToast('The painting could not be kept for Undo, so Clear was canceled. It is still open: ' + String(error?.message || error), 'error');
	}
}
function _rapierDrawCanvasBlank() {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface || !state.open) return false;
	if (state.recipe?.shapes?.length || state.paintLayer?.surface?.bounds()) return false;
	return !surface.querySelector('.rapier-draw-shapes>*,.rapier-draw-preview>*,.rapier-draw-live[d]:not([d=""])');
}
function _rapierDrawClearExits() {
	const state = _rapierDrawState;
	return !state.undoStack.length && !state.redoStack.length && _rapierDrawCanvasBlank();
}
function _rapierDrawSetClearWord() {
	const state = _rapierDrawState;
	let button = state.clearButton;
	if (!button?.isConnected || !state.surface?.contains(button)) button = state.clearButton = state.surface?.querySelector('[data-draw-act="clear"]') || null;
	if (!button) return;
	const word = _rapierDrawClearExits() ? 'Exit' : 'Clear';
	if (button.textContent !== word) button.textContent = word;
}
async function _rapierDrawRequestClear() {
	await _rapierDrawClearAll(_rapierDrawState.session);
}
function _rapierDrawShapeById(id) { return _rapierDrawState.recipe.shapes.find(s => s.id === id) || null; }

const RAPIER_DRAW_REPLAY_PACE = 200;
const RAPIER_DRAW_REPLAY_SPEED = 5;
const RAPIER_DRAW_REPLAY_FAST_STEP = 2, RAPIER_DRAW_REPLAY_FAST_MAX = 4;
const RAPIER_DRAW_REPLAY_SETTLE_MS = 70;
const RAPIER_DRAW_REPLAY_NAME_MAX = 32;

function _rapierDrawReplayTravel(shape, recipe) {
	let points = null;
	if (shape.recognized !== 'text' && shape.recognized !== 'paint' && shape.recognized !== 'ornament') {
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
function _rapierDrawReplayNibMarkup(point, colour, width, paper) {
	const r = Math.max(3.5, width * 0.8 + 2.2), f = _rapierDrawFmt;
	const angle = Math.atan2(point.dy, point.dx) * 180 / Math.PI;
	const body = 'M' + f(-r * 2.1) + ' 0Q' + f(-r * 0.6) + ' ' + f(-r) + ' 0 ' + f(-r) +
		'A' + f(r) + ' ' + f(r) + ' 0 0 1 0 ' + f(r) + 'Q' + f(-r * 0.6) + ' ' + f(r) + ' ' + f(-r * 2.1) + ' 0Z';
	return '<g class="rapier-draw-nib" transform="translate(' + f(point.x) + ' ' + f(point.y) + ') rotate(' + f(angle) + ')">' +
		'<path d="' + body + '" fill="' + _rapierDrawEscapeAttr(colour) + '" stroke="' + _rapierDrawEscapeAttr(paper) + '"/>' +
		'<circle class="rapier-draw-nib-ring" r="' + f(r + 1.3) + '" stroke="' + _rapierDrawEscapeAttr(colour) + '"/></g>';
}
function _rapierDrawReplayPaper() {
	if (_rapierDrawState.paper) return '#ffffff';
	if (_rapierDrawState.recipe?.paper === 'black') return '#000000';
	const bg = getComputedStyle(document.body).getPropertyValue('--color-bg').trim();
	return /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : '#000000';
}
function _rapierDrawReplayName(given) {
	const text = typeof given === 'string' ? given.trim().replace(/\s+/g, ' ') : '';
	return text && text.length <= RAPIER_DRAW_REPLAY_NAME_MAX ? text : '';
}
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
const _rapierDrawPaintWorkers = new Map();
function _rapierDrawPaintClient(purpose = 'human', mode = 'paint') {
	const water = mode === 'water', role = (purpose === 'agent' ? 'agent' : purpose === 'preview' ? 'preview' : 'human') + (water ? '-water' : ''), existing = _rapierDrawPaintWorkers.get(role);
	if (existing) return existing.ready;
	const W = water ? globalThis.RapierDrawWaterWorker : globalThis.RapierDrawPaintWorker, rows = globalThis.RapierDrawPaintRows;
	const holder = {client: null, ready: null};
	_rapierDrawPaintWorkers.set(role, holder);
	if (typeof W?.workerSource !== 'function') return holder.ready = Promise.resolve(null);
	holder.ready = (async () => {
		const worker = globalThis.RapierWorkerExecution.createWorkerExecution({source: W.workerSource, name: 'rapier-' + role,
			install: water ? W.installWaterWorker : W.installPaintWorker});
		const client = holder.client = W.createWorkerClient({postMessage: (message, transfer) => worker.postMessage(message, transfer), terminate: () => worker.terminate()});
		worker.onmessage = ({data}) => client.receive(data);
		worker.onerror = event => { client.fail(event.error || new Error(event.message || 'The painter stopped')); if (_rapierDrawPaintWorkers.get(role) === holder) _rapierDrawPaintWorkers.delete(role); };
		worker.onmessageerror = () => client.fail(new Error('The painter returned unreadable data'));
		try {
			const mode = await worker.ready;
			const isolated = mode === 'worker' && globalThis.crossOriginIsolated === true && typeof rows?.workerSource === 'function';
			const helpers = !water && purpose !== 'preview' && isolated ? 4 : 0;
			await client.request('configure', {preview: water && purpose === 'preview', unfilteredTest: water && (globalThis.__rapierWaterUnfilteredTest === true || purpose === 'human' && _rapierWaterFixSwitch() === 'filter'), fix: water && purpose === 'human' ? _rapierWaterFixSwitch() : '', software: water && globalThis.__rapierWaterSoftwareTest === true, slowTest: water ? globalThis.__rapierWaterSlowTest : undefined, stats: water && purpose === 'human' && new URLSearchParams(location.search).has('waterstats'), capture: water && purpose === 'human' && new URLSearchParams(location.search).has('water-capture'), helpers, ...(helpers ? {helperSource: rows.workerSource()} : {})});
			return client;
		} catch (error) { worker.terminate(); throw error; }
	})().catch(error => { if (_rapierDrawPaintWorkers.get(role) === holder) _rapierDrawPaintWorkers.delete(role); throw error; });
	return holder.ready;
}
function _rapierDrawPaintRelease(client) {
	for (const [role, holder] of _rapierDrawPaintWorkers) if (holder.client === client || !client && role === 'human') _rapierDrawPaintWorkers.delete(role);
	if (client) void Promise.resolve(client.close?.()).catch(() => {});
}
async function _rapierDrawAgentPicture() {
	const shows = await globalThis.RapierEmbeddedImages?.whenJxlDisplayKnown?.();
	return shows === false ? 'png' : 'jxl';
}
async function _rapierDrawPaintAgentStrokes(strokes, seed = 1, target = null, options = {}) {
	options.signal?.throwIfAborted();
	const picture = _rapierDrawAgentPicture();
	picture.catch(() => {});
	if (options.mode === 'water') {
		strokes = structuredClone(strokes);
		options = {...options, actions: options.actions == null ? undefined : structuredClone(options.actions), waterSession: _rapierWaterSession(), waterAuthorized: globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target, _rapierWaterSession())};
		_rapierWaterProRefuseAgent(options.actions ?? strokes, options);
	}
	options = {...options, picture: await picture};
	const client = await _rapierDrawPaintClient('agent', options.mode);
	if (!client) return globalThis.RapierDrawAgentPaint.paintAgentStrokes(strokes, seed, target, options);
	try {
		const shape = await client.request('agent', {strokes, seed, target, contribution: options.contribution, mode:options.mode, paper:options.paper, actions:options.actions, recipe:options.recipe, picture:options.picture, waterSession:options.waterSession, waterAuthorized:options.waterAuthorized}, [], options.onProgress, {signal: options.signal});
		if (options.mode === 'water' && shape) globalThis.RapierDrawAgentPaint.rememberWaterPainting(shape, options.waterSession);
		return shape;
	}
	catch (error) { if (error.name !== 'AbortError') _rapierDrawPaintRelease(client); throw error; }
}
async function _rapierDrawPaintReplay(shape, omitIds, options = {}) {
	options.signal?.throwIfAborted();
	const picture = _rapierDrawAgentPicture();
	picture.catch(() => {});
	if (shape?.paint?.mode === 'water') {
		const waterSession = _rapierWaterSession();
		if (!globalThis.RapierDrawAgentPaint.waterPaintingIsLive(shape, waterSession)) return null;
		options = {...options, waterSession, waterAuthorized: true};
	}
	options = {...options, picture: await picture};
	const client = await _rapierDrawPaintClient('agent', shape?.paint?.mode);
	if (!client) return globalThis.RapierDrawAgentPaint.replayAgentPainting(shape, omitIds, options);
	try {
		const replayed = await client.request('replayAgent', {shape, omitIds, requireEmptyBase: options.requireEmptyBase === true, picture: options.picture, waterSession:options.waterSession, waterAuthorized:options.waterAuthorized}, [], options.onProgress, {signal: options.signal});
		if (replayed?.paint?.mode === 'water') globalThis.RapierDrawAgentPaint.rememberWaterPainting(replayed, options.waterSession);
		return replayed;
	}
	catch (error) { if (error.name !== 'AbortError') _rapierDrawPaintRelease(client); throw error; }
}
async function _rapierDrawPaintSample(shape, point, options = {}) {
	options.signal?.throwIfAborted();
	const client = await _rapierDrawPaintClient('agent', 'water');
	if (!client) return globalThis.RapierDrawAgentPaint.sampleAgentPainting(shape, point, options);
	try { return await client.request('sampleAgent', {shape, point}, [], null, {signal: options.signal}); }
	catch (error) { if (error.name !== 'AbortError' && !error.recoverable) _rapierDrawPaintRelease(client); throw error; }
}
function _rapierDrawReplayPaintSteps(shape, recipe, settle, prior = null) {
	const run = globalThis.RapierDrawAgentPaint?.agentPaintReplayPlan(shape.paint);
	const frame = run && _rapierDrawShapePolygon(shape, recipe);
	if (!frame) return null;
	const [w, h] = shape.paint.px, g = shape.paint.scale || 3;
	const at = (x, y) => { const u = x * g / w, v = y * g / h; return [frame[0][0] + (frame[1][0] - frame[0][0]) * u + (frame[3][0] - frame[0][0]) * v, frame[0][1] + (frame[1][1] - frame[0][1]) * u + (frame[3][1] - frame[0][1]) * v]; };
	const sheet = { run, frame, w, h, el: null, id: 0, busy: false }, lead = _rapierDrawAccentInk() || '#888888';
	return run.strokes.map((stroke, index) => {
		const line = stroke.points.map(p => at(p[0], p[1]));
		if (line.length === 1) line.push(line[0].slice());
		const lengths = [0];
		for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
		const total = lengths[lengths.length - 1];
		return { id: shape.id, travel: { line, lengths, length: total > 0.01 ? total : 0.01 }, was: prior, colour: stroke.colour, lead, width: Math.max(2, stroke.size / 6), settle, paint: { sheet, index } };
	});
}
function _rapierDrawReplayResolve(replay) {
	const layer = _rapierDrawState.replayPaintEl, step = replay?.steps[replay.at], sheet = step?.paint?.sheet;
	if (!layer) return;
	if (!sheet) { if (layer.firstChild) layer.replaceChildren(); return; }
	if (!sheet.el || sheet.el.parentNode !== layer) {
		const f = sheet.frame, m = [(f[1][0] - f[0][0]) / sheet.w, (f[1][1] - f[0][1]) / sheet.w, (f[3][0] - f[0][0]) / sheet.h, (f[3][1] - f[0][1]) / sheet.h, f[0][0], f[0][1]];
		const holder = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
		holder.setAttribute('width', sheet.w); holder.setAttribute('height', sheet.h); holder.setAttribute('transform', 'matrix(' + m.join(' ') + ')');
		const canvas = document.createElement('canvas'); canvas.width = sheet.w; canvas.height = sheet.h;
		holder.appendChild(canvas); layer.replaceChildren(holder);
		sheet.el = holder; sheet.ctx = canvas.getContext('2d');
	}
	const index = step.paint.index, lengths = step.travel.lengths;
	let reached = 0;
	while (reached < lengths.length && lengths[reached] <= replay.into) reached++;
	if (sheet.busy) return;
	sheet.busy = true;
	void _rapierDrawReplaySheet(sheet, index, reached, layer).catch(() => {}).finally(() => { sheet.busy = false; });
}
let _rapierDrawReplayIds = 0;
async function _rapierDrawReplaySheet(sheet, index, point, layer) {
	const client = await _rapierDrawPaintClient('agent', sheet.run.mode);
	if (!client || sheet.dead) return;
	try {
		if (!sheet.id) {
			sheet.id = 2 ** 30 + ++_rapierDrawReplayIds;
			sheet.opening = client.request('replayCreate', {surfaceId: sheet.id, strokes: sheet.run.strokes, frame: sheet.run.frame, seed: sheet.run.seed, scale: sheet.run.scale, replay: sheet.run.replay, mode: sheet.run.mode, actions: sheet.run.actions, paper: sheet.run.paper});
		}
		await sheet.opening;
		if (sheet.dead) return;
		const reply = await client.request('replay', {surfaceId: sheet.id, stroke: index, point});
		const patch = reply.surface?.patch;
		if (patch && !sheet.dead && sheet.el?.parentNode === layer) sheet.ctx.putImageData(new ImageData(patch.data, patch.width, patch.height), patch.box.x0, patch.box.y0);
	} catch (error) { sheet.dead = true; _rapierDrawPaintRelease(client); throw error; }
}
function _rapierDrawReplayRelease(replay) {
	const modes = new Map();
	for (const sheet of new Set((replay?.steps || []).map(step => step.paint?.sheet).filter(Boolean))) {
		sheet.dead = true; if (!sheet.id) continue;
		const mode = sheet.run.mode || 'paint'; if (!modes.has(mode)) modes.set(mode, []); modes.get(mode).push(sheet.id);
	}
	for (const [mode, ids] of modes) void _rapierDrawPaintClient('agent', mode).then(client => client?.request('drop', {surfaceIds: ids}), () => {}).catch(() => {});
}
function _rapierDrawReplayPaint(replay) {
	const state = _rapierDrawState, step = replay.steps[replay.at];
	const nib = state.replayNibEl, lead = state.replayLeadEl, tag = state.replayTagEl && state.stageEl ? state.replayTagEl : null;
	if (!nib || !lead) return;
	if (!step) { nib.innerHTML = ''; lead.setAttribute('d', ''); if (tag) tag.hidden = true; return; }
	const point = _rapierDrawReplayPointAt(step.travel, replay.into);
	lead.setAttribute('d', _rapierDrawReplayLeadD(step.travel, replay.into));
	lead.setAttribute('stroke', step.lead || step.colour);
	lead.setAttribute('stroke-width', _rapierDrawFmt(step.lead ? 2 : step.width));
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
	const focused = !replay && bar.contains(document.activeElement);
	bar.hidden = !replay;
	if (focused) _rapierDrawState.svgRoot.focus({preventScroll: true});
	if (replay) bar.querySelector('[data-draw-replay="faster"]')?.setAttribute('aria-disabled', String(replay.fast >= RAPIER_DRAW_REPLAY_FAST_MAX));
}
function _rapierDrawReplayEnd(disposition = 'interrupted') {
	const state = _rapierDrawState, replay = state.replay;
	if (!replay) return;
	state.replay = null;
	if (replay.frame) cancelAnimationFrame(replay.frame);
	_rapierDrawReplayRelease(replay);
	if (state.open && state.session === replay.session && state.recipe === replay.recipe) {
		state.recipe.shapes = replay.targetShapes.slice();
		_rapierDrawRenderShapes();
		_rapierDrawSealHistory(replay.entry);
	}
	if (state.replayNibEl) state.replayNibEl.innerHTML = '';
	if (state.replayLeadEl) state.replayLeadEl.setAttribute('d', '');
	state.replayPaintEl?.replaceChildren();
	if (state.replayTagEl) state.replayTagEl.hidden = true;
	_rapierDrawReplayControls(null);
	if (replay.receiptOptions) _rapierDrawAgentReceipt(replay.receiptOptions, 'incorporated', undefined, disposition);
	_rapierDrawBackupTouch();
	_rapierDrawScheduleAgentPatches();
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
	if (replay.at >= replay.steps.length) { _rapierDrawReplayEnd('completed'); return; }
	_rapierDrawReplayResolve(replay);
	_rapierDrawReplayPaint(replay);
	replay.frame = requestAnimationFrame(_rapierDrawReplayFrame);
}
function _rapierDrawReplayKeptRasters(patch, recipe) {
	const replace = patch.replace;
	if (!Array.isArray(replace) || !replace.some(shape => shape?.raster?.kept === true)) return patch;
	return { ...patch, replace: replace.map(shape => {
		if (!shape || shape.raster?.kept !== true) return shape;
		const original = recipe.shapes.find(row => row.id === shape.id && row.recognized === 'paint');
		return original ? { ...shape, raster: original.raster } : shape;
	}) };
}
function _rapierDrawReplayPatch(patch, options = {}) {
	const state = _rapierDrawState;
	if (!state.open || !state.recipe || state.finishing || !patch) return false;
	_rapierDrawReplayEnd();
	const before = state.recipe;
	if (!options.recipeBefore || !options.recipeAfter) return false;
	const patched = _rapierDrawMergeAgentRecipe(before, options.recipeBefore, options.recipeAfter);
	const target = patched && _rapierDrawAdmitRecipe(patched);
	if (!target) return false;
	const was = new Map(before.shapes.map(shape => [shape.id, shape]));
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
		const settle = RAPIER_DRAW_REPLAY_PACE * RAPIER_DRAW_REPLAY_SPEED * (RAPIER_DRAW_REPLAY_SETTLE_MS / 1000);
		const painting = shape.recognized === 'paint' && (shape.paint?.strokes || shape.paint?.mode === 'water') && (!prior || JSON.stringify(prior.paint?.strokes ?? prior.paint?.replay ?? null) !== JSON.stringify(shape.paint.strokes ?? shape.paint.replay))
			&& _rapierDrawReplayPaintSteps(shape, target, settle, prior);
		if (painting) { steps.push(...painting); continue; }
		const travel = _rapierDrawReplayTravel(shape, target);
		if (!travel) continue;
		steps.push({
			id, travel, was: prior,
			colour: _rapierDrawDisplayInk(_rapierDrawShapeInk(shape)),
			width: Math.max(1, _rapierDrawStrokeHalf(shape, target) * 2),
			settle,
		});
	}
	const entry = options.presentationOnly ? null : _rapierDrawSnapshot();
	if (entry && options.asset) entry.agent = { before: String(options.asset), after: String(options.reference || options.asset), transactionId: options.transactionId,
		savedBefore: options.savedBefore || null, savedAfter: options.savedAfter || null };
	state.recipe = target;
	_rapierDrawApplyView(); _rapierPaintSyncPaper();
	if (patch.set) { _rapierDrawRenderAll(); if (typeof _rapierBgSyncPanel === 'function') _rapierBgSyncPanel(); }
	if (!steps.length || options.presentation?.replay === false) { _rapierDrawRenderAll(); _rapierDrawSealHistory(entry); _rapierDrawBackupTouch(); return false; }
	const replay = {
		steps, targetShapes: target.shapes.slice(), entry, recipe: target, session: state.session, at: 0, into: 0, fast: 1, frame: 0,
		last: (typeof performance === 'object' ? performance.now() : Date.now()),
		name: _rapierDrawReplayName(options.name), receiptOptions: options,
	};
	state.replay = replay;
	_rapierDrawReplayRender(replay);
	_rapierDrawReplayControls(replay);
	_rapierDrawReplayPaint(replay);
	replay.frame = requestAnimationFrame(_rapierDrawReplayFrame);
	return true;
}
function _rapierDrawPaintTargetsCurrent(targets) {
	const state = _rapierDrawState, shapes = state.recipe?.shapes || [], ids = new Set(targets.map(target => String(target.id)));
	if (state.paintEraseFan?.promise || state.paintRehydrateWaiters?.some(gesture =>
		gesture.paint?.pending && !gesture.paint.discarded && ids.has(String(gesture.paint.targetId)))) return false;
	for (const layer of _rapierPaintRevisionLayers(state.paintLayer || null)) {
		if (!ids.has(String(layer.id)) && !layer.retire?.some(id => ids.has(String(id)))) continue;
		if (layer.pendingLift || layer.pendingCommit || layer.pendingOverflow || layer.dryFinishing || state.paintSetting?.layer === layer ||
			layer.surface?.settled === false || layer.surface?.wetState || layer.surface?._wetWork) return false;
	}
	return targets.every(target => {
		const current = shapes.find(shape => String(shape.id) === String(target.id));
		return current?.recognized === 'paint' && _rapierDrawHistoryEqual(current, target);
	});
}
function _rapierDrawEditingAsset({ allowBusy = false } = {}) {
	const state = _rapierDrawState;
	if (!state.open || !state.editing || state.finishing) return '';
	if (!Number.isSafeInteger(state.editing.position) || state.heldRoot !== rapier.document.source?.rootId) return '';
	if (!allowBusy && _rapierDrawBusy().human) return '';
	if (!state.openSnapshot) return '';
	return String(state.editing.asset || '');
}

function _rapierDrawBusy() {
	const state = _rapierDrawState, layer = state.paintLayer;
	const busy = { gesture: state.gesture ? String(state.gesture.kind || 'gesture') : state.markerPress ? 'hold' : null,
		label: state.textEdit ? { id: state.textEdit.id, composing: !!state.textEdit.composing } : null,
		setting: !!(state.settingEdit || state.colourEdit || state.fadeEdit || state.resize || state.bgDraft !== undefined),
		paint: !!(layer?.pendingLift || layer?.pendingCommit || layer?.previousFlip?.pendingCommit || state.paintDeparture || state.paintEraseFan || state.waterAction),
		agent: !!state.replay };
	busy.human = !!(busy.gesture || busy.label || busy.setting || busy.paint);
	return busy;
}
function _rapierDrawHumanChanged() {
	const state = _rapierDrawState;
	if (!state.open) return;
	state.humanChangePending = true;
	_rapierDrawBackupTouch(true);
	globalThis.RapierAgentBrowser?.contextChanged?.('drawing');
}
function _rapierDrawSettledRecipe() {
	const state = _rapierDrawState;
	if (!state.open || !state.recipe) return null;
	const before = state.gesture?.before || state.textEdit?.before ||
		((state.settingEdit?.changed || state.colourEdit || state.fadeEdit) && state.sweepBase);
	if (before) return _rapierDrawRestoreRecipe(before);
	return _rapierDrawHistoryCopy(state.replay ? { ...state.replay.recipe, shapes: state.replay.targetShapes } : state.recipe);
}
function _rapierDrawContext() {
	const state = _rapierDrawState;
	let recipe = _rapierDrawSettledRecipe(), recipeUnavailable;
	if (!recipe) return null;
	const settled = recipe;
	for (const ticket of state.agentQueue || []) {
		const next = _rapierDrawMergeAgentRecipe(recipe, ticket.options.recipeBefore, ticket.options.recipeAfter || ticket.options.sourceRecipeAfter);
		if (!next) { recipeUnavailable = 'drawing_conflict'; recipe = settled; break; }
		recipe = next;
	}
	if (!state.agentContextSnapshot || !_rapierDrawSameRecipe(state.agentContextSnapshot, recipe)) {
		state.agentSurfaceGeneration = (state.agentSurfaceGeneration || 0) + 1;
		state.agentContextSnapshot = _rapierDrawHistoryRecipe(recipe);
	}
	if (state.humanChangePending && !_rapierDrawBusy().human) {
		state.humanChangePending = false;
		state.drawingEventSequence = (state.drawingEventSequence || 0) + 1;
		state.drawingEvent = {sequence: state.drawingEventSequence, kind: 'human', session: state.agentSession, surfaceGeneration: state.agentSurfaceGeneration};
	}
	const editing = state.editing, record = editing && _rapierImageRecord(editing.blockId, editing.imageIndex);
	const position = editing?.position;
	const bound = record && Number.isSafeInteger(position) && state.heldRoot === rapier.document.source?.rootId;
	const occurrence = bound ? { start: position, end: position + (record.image.tokenEnd ?? record.image.end) - record.image.start,
		position, asset: String(editing.asset || ''), reference: String(editing.asset || ''), blockId: String(editing.blockId), imageIndex: editing.imageIndex } : null;
	const selectedObjects = (state.selection || []).filter(id => recipe.shapes.some(shape => shape.id === id));
	const layer = recipe.shapes.find(shape => shape.id === state.paintChosenId && shape.recognized === 'paint' && !shape.locked) ||
		recipe.shapes.slice().reverse().find(shape => shape.recognized === 'paint' && !shape.locked && shape.raster);
	const frame = layer && typeof _rapierPaintTargetFrame === 'function' ? _rapierPaintTargetFrame(layer) : null;
	const v = state.view || { x: 0, y: 0, k: 1 }, base = state.viewBase || recipe.canvas;
	const visible = { x: v.x, y: v.y, width: base.w / v.k, height: base.h / v.k };
	let selection = null;
	if (selectedObjects.length && typeof _rapierDrawSelectionBox === 'function') {
		const box = _rapierDrawSelectionBox(recipe, selectedObjects);
		if (box) selection = { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
	}
	const registry = globalThis.RapierDrawBrushes?.RAPIER_PAINT_BRUSHES || [];
	const own = typeof _rapierPaintOwnBrushes === 'function' ? _rapierPaintOwnBrushes() : [];
	const vectorTargets = recipe.shapes.filter(shape => selectedObjects.includes(shape.id));
	const vectorSets = vectorTargets.map(shape => shape.locked || ['paint', 'text', 'ornament'].includes(shape.recognized) ? [] :
		_rapierDrawBrushesFor(_rapierDrawShapePaintsInk(shape, recipe) ? 'ink' : shape.recognized, shape.stroke != null));
	const vector = vectorSets.length ? vectorSets[0].filter(id => vectorSets.every(rows => rows.includes(id))) : _rapierDrawBrushesFor(state.tool === 'shape' ? state.shapeKind : 'ink');
	const matrix = state.svgRoot?.getScreenCTM?.();
	return { open: true, session: state.agentSession, occurrence,
		assetGeneration: bound && record.image.destination ? _rapierDrawAssetGeneration(record.image.destination) : null,
		surfaceGeneration: state.agentSurfaceGeneration, ...(recipeUnavailable ? {recipeUnavailable} : {recipe}), selectedObjects,
		paintTarget: layer ? { id: layer.id, mode: layer.paint?.mode || 'paint', paper: layer.paint?.paper || null, pixels: layer.paint?.px?.slice() || null, transform: frame, locked: !!layer.locked } : null,
		bounds: { canvas: {x: 0, y: 0, width: recipe.canvas.w, height: recipe.canvas.h}, visible, selection },
		transform: { pan: {x: v.x, y: v.y}, zoom: v.k,
			canvasToScreen: matrix ? {a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f} : null },
		busy: _rapierDrawBusy(), tool: state.tool,
		brushes: { vector,
			paint: registry.concat(own).map(row => ({id: row.id, name: row.name})),
			water: globalThis.RapierDrawWater.WATER_BRUSHES.map(row => ({id:row.id,name:row.name})),
			current: { ...(state.tool === 'water' ? {water:structuredClone(Object.fromEntries(['brush','tool','pigment','paper','size','water','load','strength','angle','follow'].map(key => [key,_rapierWaterState()[key]])))} : {}), paint: state.paintBrush || null, width: state.nib, size: state.paintSize, strength: state.paintStrength, angle: state.paintHead?.angle, follow: state.paintHead?.follow } },
		limits: { shapes: 2048, strokes: 2048, patchOperations: 128, pointsPerStroke: 16384, points: 262144,
			canvasEdge: 65536, rasterBytes: RAPIER_DRAW_RASTER_MAX, labelUnits: RAPIER_DRAW_LABEL_MAX },
		event: state.drawingEvent?.session === state.agentSession ? {...state.drawingEvent} : null,
		receipts: (state.agentReceipts || []).map(row => ({ ...row })) };
}
function _rapierDrawCanQueuePatch(envelope) {
	const asset = _rapierDrawEditingAsset({ allowBusy: true });
	if (!asset || !envelope?.asset || asset.toLowerCase() !== String(envelope.asset).toLowerCase()) return false;
	const context = _rapierDrawContext(), occurrence = envelope.occurrence;
	if (!context?.occurrence || !occurrence || occurrence.start !== context.occurrence.start || occurrence.end !== context.occurrence.end) return false;
	if (envelope.session != null && String(envelope.session) !== context.session) return false;
	if (envelope.surfaceGeneration != null && (!Number.isSafeInteger(envelope.surfaceGeneration) || envelope.surfaceGeneration > context.surfaceGeneration)) return false;
	if (envelope.assetGeneration != null && envelope.assetGeneration !== context.assetGeneration) return false;
	const prepared = _rapierDrawAdmitAgentPatch(envelope.patch, envelope);
	if (!prepared) return false;
	try {
		const assets = globalThis.RapierImageAssets, saved = assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(asset));
		const recipe = saved && _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(assets.decodeDataImage(saved.url)));
		return !!recipe && _rapierDrawHistoryEqual(recipe, prepared.sourceRecipeBefore);
	} catch (_) { return false; }
}
function _rapierDrawHeldRanges() {
	const state = _rapierDrawState;
	if (!state.open) return [];
	if (state.finishing || state.heldRoot !== rapier.document.source?.rootId) return null;
	if (state.notes?.fresh) return [];
	const spans = _rapierExcerptCanonicalBlockSpans();
	const block = id => { const span = spans.get(id); return span ? [{ start: span.start, end: span.end }] : null; };
	if (state.editing) return block(state.editing.blockId);
	const target = state.insertTarget || {}, at = target.sourceSplit || target.sourceSelection;
	if (at) return [{ start: at.start, end: at.end }];
	return target.afterId != null ? block(target.afterId) : [];
}
function _rapierDrawMoveRanges(ranges, splices) {
	const moved = ranges.map(range => ({ ...range }));
	for (const row of splices) {
		const from = row.pos, to = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
		for (const range of moved) {
			if (from <= range.end && to >= range.start) return null;
			if (to < range.start) { range.start += delta; range.end += delta; }
		}
	}
	return moved;
}
function _rapierDrawFollow(splices) {
	const state = _rapierDrawState, target = state.insertTarget;
	if (!state.open) return;
	if (state.editing) {
		const editing = state.editing;
		let position = editing.position;
		if (!Number.isSafeInteger(position)) return;
		for (const row of splices) {
			if (position < row.pos) continue;
			if (position >= row.pos + row.removed.length) position += row.inserted.length - row.removed.length;
			else if (position !== row.pos || !row.inserted.startsWith('![')) {
				state.editing = { ...editing, blockId: null, imageIndex: null, position: null };
				return;
			}
		}
		const spans = _rapierExcerptCanonicalBlockSpans();
		const block = rapier.document.blocks.find(row => { const span = spans.get(row.id); return span && span.start <= position && position < span.end; });
		const image = block && _rapierRenderModule('render')._rapierScanMarkdownImages(block.raw).find(row => spans.get(block.id).start + row.start === position);
		if (!image || _rapierSourceText().slice(position, position + image.end - image.start) !== block.raw.slice(image.start, image.end)) {
			state.editing = { ...editing, blockId: null, imageIndex: null, position: null }; return;
		}
		const assets = globalThis.RapierImageAssets, renamed = assets.normalizeLabel(image.reference || '') !== assets.normalizeLabel(editing.asset || '');
		state.editing = { ...editing, blockId: block.id, imageIndex: image.renderIndex, position,
			title: _rapierRenderModule('render-markdown')._rapierImageAltText(_rapierRenderModule('render-markdown')._rapierImageAltSourceParts(image.altSource).alt),
			...(renamed ? { sourceUrl: assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(image.reference || ''))?.url, sourceHash: undefined } : {}) };
	}
	const form = !state.editing && target ? (target.sourceSplit ? 'sourceSplit' : target.sourceSelection ? 'sourceSelection' : '') : '';
	if (form) {
		const range = _rapierDrawMoveRanges([target[form]], splices)?.[0];
		if (!range) return;
		state.insertTarget = { ...target, [form]: Object.freeze({ ...target[form], start: range.start, end: range.end }) };
	}
	state.heldRoot = rapier.document.source?.rootId;
}
function _rapierDrawPresentationReceipts() {
	const documentId = String(rapier.identity.authority);
	return (_rapierDrawState.agentReceipts || []).filter(row => row.documentId === documentId).map(row => structuredClone(row));
}
function _rapierDrawAgentReceipt(options, status, reason, presentationStatus) {
	const state = _rapierDrawState, transactionId = String(options.remoteTransactionId || options.transactionId || '');
	const drawing = _rapierDrawContext();
	const presentation = {status: presentationStatus || (status === 'incorporated' ? 'completed' : status === 'presentation_deferred' ? 'deferred' : 'unavailable'),
		session: drawing?.session || options.presentationSession || null, surfaceGeneration: drawing?.surfaceGeneration || 0};
	const target = options.targetOccurrence || options.occurrence;
	if (target && Number.isSafeInteger(target.start) && Number.isSafeInteger(target.end)) {
		const start = Number.isSafeInteger(options.committedPosition) ? options.committedPosition : target.start;
		presentation.occurrence = {start, end: start + target.end - target.start, reference: String(options.reference || target.reference || '')};
	} else if (drawing?.occurrence && (!options.reference || options.reference === drawing.occurrence.reference)) presentation.occurrence = {...drawing.occurrence};
	const receipt = {transactionId, documentId: String(options.documentId || rapier.identity.authority), status, presentation, ...(reason ? {reason} : {})};
	const receipts = state.agentReceipts || (state.agentReceipts = []), prior = receipts.findIndex(row => row.transactionId === transactionId);
	if (prior >= 0 && ['completed', 'skipped', 'interrupted'].includes(receipts[prior].presentation?.status)) {
		try { options.onReceipt?.(structuredClone(receipts[prior])); } catch (_) {}
		return structuredClone(receipts[prior]);
	}
	if (prior >= 0) receipts[prior] = receipt; else receipts.push(receipt);
	const observers = state.agentReceiptObservers || (state.agentReceiptObservers = new Map());
	if (typeof options.onReceipt === 'function') observers.set(transactionId, options.onReceipt);
	try { observers.get(transactionId)?.(structuredClone(receipt)); } catch (_) {}
	if (!['replaying', 'deferred'].includes(presentation.status)) observers.delete(transactionId);
	globalThis.RapierAgentBrowser?.contextChanged?.('drawing_presentation');
	return structuredClone(receipt);
}
async function _rapierDrawPresentCommitted(intent, {current, onReceipt, signal} = {}) {
	const state = _rapierDrawState, options = {...intent, onReceipt};
	const refuse = reason => _rapierDrawAgentReceipt(options, 'unavailable', reason);
	const stamp = String(intent?.remoteTransactionId || intent?.transactionId || '');
	if (!stamp) return refuse('drawing_transaction_missing');
	const prior = state.agentReceipts?.find(row => row.transactionId === stamp && row.documentId === String(intent.documentId || rapier.identity.authority));
	if (prior && (prior.status !== 'unavailable' && prior.status !== 'presentation_deferred' ||
		prior.status === 'unavailable' && prior.reason !== 'drawing_not_open' ||
		state.agentQueue?.some(row => String(row.options.remoteTransactionId || row.options.transactionId || '') === stamp))) {
		if (typeof onReceipt === 'function') {
			if (['replaying', 'deferred'].includes(prior.presentation?.status)) (state.agentReceiptObservers ||= new Map()).set(stamp, onReceipt);
			try { onReceipt(structuredClone(prior)); } catch (_) {}
		}
		return structuredClone(prior);
	}
	if (typeof current !== 'function' || !current() || signal?.aborted) {
		_rapierDrawInviteFor(intent);
		return refuse('drawing_navigation_changed');
	}
	const position = intent.occurrence?.start, end = intent.occurrence?.end, assets = globalThis.RapierImageAssets;
	if (!Number.isSafeInteger(position) || !Number.isSafeInteger(end) || end <= position || !intent.reference) return refuse('drawing_occurrence_changed');
	const source = _rapierSourceText(), root = rapier.document.source?.rootId, spans = _rapierExcerptCanonicalBlockSpans();
	const block = rapier.document.blocks.find(row => {const span = spans.get(row.id); return span && span.start <= position && position < span.end;});
	const image = block && _rapierRenderModule('render')._rapierScanMarkdownImages(block.raw).find(row => spans.get(block.id).start + row.start === position &&
		spans.get(block.id).start + (row.tokenEnd ?? row.end) === end);
	if (!image || assets.normalizeLabel(image.reference || '') !== assets.normalizeLabel(intent.reference) ||
		source.slice(position, end) !== block.raw.slice(image.start, image.tokenEnd ?? image.end)) return refuse('drawing_occurrence_changed');
	const asset = assets.documentAssets(source).assets.get(assets.normalizeLabel(intent.reference));
	if (!asset || intent.assetGeneration && intent.assetGeneration !== _rapierDrawAssetGeneration(asset.url)) return refuse('drawing_material_changed');
	let recipe;
	try { recipe = _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(assets.decodeDataImage(asset.url))); } catch (_) {}
	if (!recipe) return refuse('drawing_recipe_invalid');
	let prepared = null;
	if (intent.drawingPatch) {
		prepared = _rapierDrawAdmitAgentPatch(intent.drawingPatch.patch, intent.drawingPatch);
		const same = value => ({...value, nib: value.nib ?? RAPIER_DRAW_NIB_DEFAULT, smooth: value.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT});
		if (!prepared || !_rapierDrawHistoryEqual(same(prepared.sourceRecipeAfter), same(recipe))) return refuse('drawing_material_changed');
	}
	if (state.open) {
		if (prepared) return _rapierDrawAgentPatch(intent.drawingPatch.patch, {...options, ...intent.drawingPatch,
			transactionId: intent.transactionId, documentId: intent.documentId, committedReference: intent.reference,
			committedPosition: position, onReceipt});
		if (state.editing?.position !== position || assets.normalizeLabel(state.editing?.asset || '') !== assets.normalizeLabel(intent.reference)) return refuse('another_drawing_open');
		if (_rapierDrawBusy().human || state.replay) return _rapierDrawAgentReceipt(options, 'presentation_deferred', 'drawing_busy');
		return _rapierDrawAgentReceipt(options, 'incorporated');
	}
	const painting = recipe.shapes.some(shape => shape.recognized === 'paint');
	if (intent.presentation?.open !== true || painting) _rapierDrawInviteFor(intent);
	if (intent.presentation?.open !== true) return refuse('drawing_not_open');
	if (painting) return _rapierDrawAgentReceipt({...options, presentationSession: 'document'}, 'incorporated', undefined, 'skipped');
	const editing = {blockId: block.id, imageIndex: image.renderIndex,
		title: _rapierRenderModule('render-markdown')._rapierImageAltText(_rapierRenderModule('render-markdown')._rapierImageAltSourceParts(image.altSource).alt), asset: intent.reference, sourceUrl: asset.url};
	if (!_rapierAgentFollowing()) {
		void _rapierAgentInvite('drawing', {go: () => {
			if (state.open || _rapierSourceText() !== source) { _rapierAgentInviteToBlockNow(block.id); return; }
			_rapierDrawOpenSurface({recipe, editing, notes: _rapierDrawInANote()});
		}});
		return _rapierDrawAgentReceipt({...options, presentationSession: 'document'}, 'incorporated', 'person_invited', 'skipped');
	}
	const opened = await new Promise(resolve => {
		const abort = () => resolve(false);
		signal?.addEventListener('abort', abort, {once: true});
		const done = value => {signal?.removeEventListener('abort', abort); resolve(value);};
		_rapierDrawOpenSurface({recipe, editing, notes: _rapierDrawInANote(), onReady: done});
	});
	if (!opened || !current() || signal?.aborted || root !== rapier.document.source?.rootId || _rapierSourceText() !== source) return refuse('drawing_navigation_changed');
	if (_rapierDrawBusy().human) return _rapierDrawAgentReceipt(options, 'presentation_deferred', 'drawing_busy');
	if (intent.presentation?.replay !== true) return _rapierDrawAgentReceipt(options, 'incorporated');
	const finalRecipe = state.recipe, empty = prepared?.recipeBefore || {...finalRecipe, strokes: [], shapes: []};
	state.recipe = empty;
	let playing;
	try { playing = _rapierDrawReplayPatch(intent.drawingPatch?.patch || {add: finalRecipe.shapes}, {...intent, presentationOnly: true, recipeBefore: empty, recipeAfter: finalRecipe}); }
	catch (_) { state.recipe = finalRecipe; _rapierDrawRenderAll(); return refuse('drawing_presentation_failed'); }
	if (!playing) { state.recipe = finalRecipe; _rapierDrawRenderAll(); }
	return _rapierDrawAgentReceipt(options, 'incorporated', undefined, playing ? 'replaying' : 'completed');
}
function _rapierDrawInviteFor(intent) {
	try {
		const position = intent.occurrence?.start, spans = _rapierExcerptCanonicalBlockSpans(), assets = globalThis.RapierImageAssets;
		const block = Number.isSafeInteger(position) && rapier.document.blocks.find(row => {const span = spans.get(row.id); return span && span.start <= position && position < span.end;});
		if (!block) return;
		const asset = assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(intent.reference || ''));
		const recipe = asset && _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(assets.decodeDataImage(asset.url)));
		_rapierAgentInviteToBlock(recipe?.shapes?.some(shape => shape.recognized === 'paint') ? 'painting' : 'drawing', block.id);
	} catch (_) {}
}
function _rapierDrawAdmitAgentPatch(patch, options) {
	try {
		const sourceRecipeBefore = _rapierDrawAdmitRecipe(options.sourceRecipeBefore), recipeBefore = _rapierDrawAdmitRecipe(options.recipeBefore || options.sourceRecipeBefore);
		if (!sourceRecipeBefore || !recipeBefore) return null;
		const calculated = _rapierDrawAdmitRecipe(_rapierDrawApplyShapesPatch(recipeBefore, _rapierDrawReplayKeptRasters(patch, recipeBefore)));
		const sourceRecipeAfter = options.sourceRecipeAfter ? _rapierDrawAdmitRecipe(options.sourceRecipeAfter) : calculated;
		const recipeAfter = options.recipeAfter ? _rapierDrawAdmitRecipe(options.recipeAfter) : sourceRecipeAfter;
		if (!calculated || !sourceRecipeAfter || !recipeAfter) return null;
		const comparable = recipe => ({...recipe, nib: recipe.nib ?? RAPIER_DRAW_NIB_DEFAULT, smooth: recipe.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT});
		if (!_rapierDrawHistoryEqual(comparable(calculated), comparable(recipeAfter))) return null;
		return {sourceRecipeBefore, recipeBefore, sourceRecipeAfter, recipeAfter};
	} catch (_) { return null; }
}
function _rapierDrawEnvelopeTargets(patch, recipeBefore) {
	const touched = new Set([...(patch?.replace || []).map(row => row?.id), ...(patch?.remove || [])]);
	return (recipeBefore?.shapes || []).filter(shape => shape.recognized === 'paint' && touched.has(shape.id));
}
function _rapierDrawLandingGate(targets) {
	if (targets?.length && !_rapierDrawPaintTargetsCurrent(targets)) return 'paint_target_changed';
	return _rapierDrawBusy().human ? 'draw_session_open' : '';
}
function _rapierDrawFence(fact) {
	if (!fact.shapesOnly) return 'draw_session_open';
	const envelope = fact.drawingPatch;
	const gate = _rapierDrawLandingGate(fact.paintTargets?.length ? fact.paintTargets : _rapierDrawEnvelopeTargets(envelope?.patch, envelope?.recipeBefore));
	return gate === 'draw_session_open' && envelope && _rapierDrawCanQueuePatch(envelope) ? '' : gate;
}
function _rapierDrawTargetsHeld(targets) {
	const shapes = _rapierDrawState.recipe?.shapes || [];
	return targets.every(target => { const current = shapes.find(shape => String(shape.id) === String(target.id)); return current?.recognized === 'paint' && _rapierDrawHistoryEqual(current, target); });
}
function _rapierDrawScheduleAgentPatches() {
	const state = _rapierDrawState;
	if (state.agentPatchTimer || !state.agentQueue?.length || !state.open || state.replay) return;
	const session = state.session;
	state.agentPatchTimer = setTimeout(() => {
		state.agentPatchTimer = null;
		if (!state.open || state.session !== session) return;
		_rapierDrawDrainAgentPatches();
		if (state.agentQueue?.length) _rapierDrawScheduleAgentPatches();
	}, 40);
}
function _rapierDrawDrainAgentPatches(final = false) {
	const state = _rapierDrawState, queue = state.agentQueue || [];
	if (!state.open || state.finishing && !final || state.replay && !final) return false;
	while (queue.length) {
		const ticket = queue[0], before = state.recipe;
		if (ticket.session !== state.session) { queue.shift(); _rapierDrawAgentReceipt(ticket.options, 'unavailable', 'draw_session_changed'); continue; }
		const targets = _rapierDrawEnvelopeTargets(ticket.patch, ticket.options.recipeBefore), gate = _rapierDrawLandingGate(targets);
		if (gate === 'paint_target_changed' && !_rapierDrawTargetsHeld(targets)) { queue.shift(); _rapierDrawAgentReceipt(ticket.options, 'unavailable', 'paint_target_changed'); continue; }
		if (gate && !final) return false;
		_rapierDrawReplayEnd();
		try { _rapierDrawReplayPatch(ticket.patch, ticket.options); }
		catch (_) { queue.shift(); _rapierDrawAgentReceipt(ticket.options, 'uncertain', 'drawing_presentation_failed'); continue; }
		queue.shift();
		_rapierDrawAgentReceipt(ticket.options, state.recipe === before ? 'unavailable' : 'incorporated', state.recipe === before ? 'drawing_conflict' : undefined, state.replay ? 'replaying' : undefined);
		if (state.replay && !final) return false;
	}
	return true;
}
function _rapierDrawAgentPatch(patch, options = {}) {
	const state = _rapierDrawState, stamp = String(options.remoteTransactionId || options.transactionId || '');
	const prior = stamp && state.agentReceipts?.find(row => row.transactionId === stamp);
	if (prior) {
		if (typeof options.onReceipt === 'function') {
			if (['replaying', 'deferred'].includes(prior.presentation?.status)) (state.agentReceiptObservers ||= new Map()).set(stamp, options.onReceipt);
			try { options.onReceipt(structuredClone(prior)); } catch (_) {}
		}
		return structuredClone(prior);
	}
	const asset = String(options.asset || ''), open = _rapierDrawEditingAsset({allowBusy: true});
	const unavailable = reason => _rapierDrawAgentReceipt(options, 'unavailable', reason);
	if (options.session != null && options.session !== state.agentSession) return unavailable('draw_session_changed');
	if (!asset || !open || asset.toLowerCase() !== open.toLowerCase()) return unavailable('drawing_not_open');
	const record = _rapierImageRecord(state.editing.blockId, state.editing.imageIndex), assets = globalThis.RapierImageAssets;
	if (!record || !options.reference || assets.normalizeLabel(record.image.reference || '') !== assets.normalizeLabel(options.committedReference || options.reference) ||
		(options.committedPosition != null && state.editing.position !== options.committedPosition)) return unavailable('drawing_occurrence_changed');
	const prepared = _rapierDrawAdmitAgentPatch(patch, {...options, sourceRecipeBefore: options.sourceRecipeBefore || _rapierDrawRestoreRecipe(state.openSnapshot)});
	if (!prepared) return unavailable('drawing_recipe_invalid');
	const {sourceRecipeBefore, recipeBefore, sourceRecipeAfter, recipeAfter} = prepared;
	const baseline = recipe => ({...recipe, smooth: recipe.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT, nib: recipe.nib ?? RAPIER_DRAW_NIB_DEFAULT});
	const savedBefore = _rapierDrawHistoryRecipe(baseline(sourceRecipeBefore)), savedAfter = _rapierDrawHistoryRecipe(baseline(sourceRecipeAfter));
	const ticket = { session: state.session, patch: _rapierDrawHistoryCopy(patch), options: { ...options,
		sourceRecipeBefore, recipeBefore, sourceRecipeAfter, recipeAfter, savedBefore, savedAfter } };
	const queue = state.agentQueue || (state.agentQueue = []), last = queue.at(-1), same = _rapierDrawHistoryEqual;
	const reversed = options.undo === true && last && same(last.options.recipeBefore, recipeAfter) &&
		same(last.options.recipeAfter, recipeBefore) && same(last.options.sourceRecipeBefore, sourceRecipeAfter) && same(last.options.sourceRecipeAfter, sourceRecipeBefore);
	if (reversed) { queue.pop(); _rapierDrawAgentReceipt(last.options, 'incorporated', 'reversed_before_presentation'); }
	else queue.push(ticket);
	state.editing = { ...state.editing, asset: String(options.reference) };
	state.openSnapshot = savedAfter;
	_rapierDrawAgentReceipt(options, reversed ? 'incorporated' : 'presentation_deferred', reversed ? 'reversed_before_presentation' : 'drawing_busy');
	_rapierDrawBackupTouch();
	_rapierDrawDrainAgentPatches();
	_rapierDrawScheduleAgentPatches();
	return { ...state.agentReceipts.find(row => row.transactionId === stamp) };
}

const RAPIER_DRAW_COPY_OFFSET = 24;
function _rapierDrawNextId() {
	const state = _rapierDrawState; let id;
	do { if (!Number.isSafeInteger(state.seq + 1)) state.seq = 0; id = 's' + (++state.seq); } while (state.recipe.shapes.some(shape => shape.id === id || shape.group === id || shape.paint?.group === id));
	return id;
}
function _rapierDrawMintSeed() { return Math.floor(Math.random() * 0x100000000); }
function _rapierDrawCopyShapes(shapes, dx = RAPIER_DRAW_COPY_OFFSET, dy = RAPIER_DRAW_COPY_OFFSET) {
	const state = _rapierDrawState, result = _rapierDrawEdit(state.recipe, shapes.map(shape => shape.id), { type: 'duplicate', dx, dy, newIds: shapes.map(() => _rapierDrawNextId()) });
	state.recipe = result.recipe; return result.ids.map(id => _rapierDrawShapeById(id));
}
function _rapierDrawEditSelection(action, ids = _rapierDrawSelection()) {
	const waiting = _rapierPaintFlushRevision();
	if (waiting) return waiting.then(() => _rapierDrawEditSelection(action, ids));
	const state = _rapierDrawState;
	if (state.replay) _rapierDrawReplayEnd();
	try {
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
			if (shape.recognized === 'text') {
				recipe.shapes = recipe.shapes.filter(item => item.id !== shape.id);
				remapRefractionRecipeSources(recipe, new Map([[shape.id, null]]));
			}
			else globalThis.RapierDrawEdit._rapierDrawFitText(shape, recipe);
			_rapierDrawRerouteBoundArrows(recipe); _rapierDrawSceneMarkup(recipe, false, true, {sourceOnly: true}); state.recipe = recipe;
		} catch (error) { showToast(String(error.message || error), 'error'); return false; }
	}
	_rapierDrawCloseLabelInput();
	if (cancel) { state.recipe = _rapierDrawRestoreRecipe(edit.before); _rapierDrawSetSelection(edit.selection); }
	else { _rapierDrawSetSelection(_rapierDrawSelection()); if (!_rapierDrawSameRecipe(edit.before)) { _rapierDrawSnapshot(edit.before); _rapierDrawSealHistory(); } }
	_rapierDrawRenderAll(); state.svgRoot.focus({ preventScroll: true });
	if (!cancel) edit.afterFinish?.();
	return true;
}
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
function _rapierDrawMonoAdvance(layout) {
	for (const line of layout.lines || []) { const c = line.carets; if (c && c.length > 2) return c[1].x - c[0].x; }
	return null;
}
function _rapierDrawMeasureAdvance(family, fontPx, weight, style) {
	const probe = document.createElement('span');
	probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;white-space:pre;letter-spacing:0;font-family:' + family + ';font-size:' + fontPx + 'px;font-weight:' + weight + ';font-style:' + style;
	probe.textContent = '0'.repeat(20);
	document.body.appendChild(probe);
	const w = probe.getBoundingClientRect().width / 20;
	probe.remove();
	return w;
}
const _rapierDrawLetterInputFaces = new Map();
function _rapierDrawLetterInputFamily(id) {
	let face = _rapierDrawLetterInputFaces.get(id);
	if (!face) {
		const bytes = globalThis.RapierDrawCore.letterInputFont(id);
		face = { family: bytes ? 'rapier-letters-' + id : null };
		_rapierDrawLetterInputFaces.set(id, face);
		if (bytes) try {
			const font = new FontFace(face.family, bytes);
			document.fonts.add(font);
			font.load().then(() => { if (_rapierDrawState.textEdit) _rapierDrawPlaceTextInput(); }, () => { face.family = null; });
		} catch (_) { face.family = null; }
	}
	return face.family;
}
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
	const lettered = /^letters:/.test(shape.textFont), letterFamily = lettered && _rapierDrawLetterInputFamily(shape.textFont.slice(8));
	const serif = globalThis.RapierDrawFonts.fontFamily(lettered ? 'serif' : shape.textFont || 'sans', state.recipe.fonts);
	input.style.fontFamily = letterFamily ? letterFamily + ', ' + serif : serif;
	input.style.fontWeight = shape.textBold && !lettered ? '700' : '400'; input.style.fontStyle = shape.textItalic && !lettered ? 'italic' : 'normal';
	const shownCase = lettered ? '' : shape.textCase;
	input.style.textTransform = shownCase === 'upper' ? 'uppercase' : shownCase === 'lower' ? 'lowercase' : 'none';
	input.style.fontVariantCaps = shownCase === 'small' ? 'small-caps' : 'normal';
	input.style.fontKerning = shape.textKern === false ? 'none' : 'auto';
	input.style.fontVariantNumeric = { oldstyle: 'oldstyle-nums', lining: 'lining-nums', tabular: 'tabular-nums' }[shape.textFigures] || 'normal';
	input.style.wordSpacing = (shape.wordSpacing || 0) * layout.fontSize * scale / innerScale + 'px';
	input.style.textAlign = layout.align === 'middle' ? 'center' : layout.align;
	input.wrap = layout.wrapWidth ? 'soft' : 'off';
	const perChar = shape.textFont === 'mono' ? _rapierDrawMonoAdvance(layout) : null;
	const trackingPx = (shape.letterSpacing || 0) * layout.fontSize * scale / innerScale;
	input.style.letterSpacing = (perChar == null ? trackingPx : (perChar * scale / innerScale) - _rapierDrawMeasureAdvance(input.style.fontFamily, cssFontPx, input.style.fontWeight, input.style.fontStyle)) + 'px';

	const bounds = layout.bounds, viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
	const right = left + (viewport?.width || innerWidth), bottom = top + (viewport?.height || innerHeight);
	const a = mapLocal(bounds.minX, bounds.minY), z = mapLocal(bounds.maxX, bounds.maxY);
	const controls = edit.controls, controlsWidth = Math.min(360, Math.max(80, right - left - 16));
	controls.style.width = controlsWidth + 'px';
	const ceiling = Math.max(top, _rapierDrawState.svgRoot?.getBoundingClientRect().top ?? top) + 8;
	const controlsHeight = controls.offsetHeight || 96, roomBelow = bottom - 8 - z[1], roomAbove = a[1] - 6 - ceiling;
	const below = roomBelow >= controlsHeight || roomAbove < controlsHeight && roomBelow >= roomAbove;
	const controlsTop = below ? z[1] + 6 : Math.max(ceiling, a[1] - controlsHeight - 6);
	controls.style.left = _rapierDrawClamp(a[0], left + 8, Math.max(left + 8, right - controlsWidth - 8)) + 'px';
	controls.style.top = _rapierDrawClamp(controlsTop, ceiling, Math.max(ceiling, bottom - controlsHeight - 8)) + 'px';
}
function _rapierDrawEditLabelInPlace(shape, options = {}) {
	const state = _rapierDrawState;
	if (!state.surface || shape.locked || !_rapierDrawFinishText()) return;
	const before = options.before || _rapierDrawHistoryRecipe(), selection = options.selection || _rapierDrawSelection();
	if (!shape.label && !['text', 'line', 'arrow', 'arc', 'parabola', 'ink'].includes(shape.recognized)) shape.labelIn = true;
	const root = document.createElement('div'), box = document.createElement('div'), input = document.createElement('textarea');
	const controls = document.createElement('div'), styleRow = document.createElement('div'), actions = document.createElement('div'), sizeRow = document.createElement('div');
	root.className = 'rapier-draw-text-editor'; box.className = 'rapier-draw-text-box'; input.className = 'rapier-draw-label-input';
	controls.className = 'rapier-draw-text-controls'; styleRow.className = 'rapier-draw-text-style'; actions.className = 'rapier-draw-text-actions'; sizeRow.className = 'rapier-draw-text-size-row';
	input.value = options.initial ?? shape.label ?? ''; input.spellcheck = true;
	input.setAttribute('aria-label', shape.recognized === 'text' ? 'Drawing text' : 'Shape label');
	const help = document.createElement('span'); help.id = 'rapier-draw-text-keys'; help.className = 'sr-only';
	help.textContent = 'Tab reaches text controls. Escape or Control+Enter finishes text. Control+] indents; Control+[ removes indentation.';
	input.setAttribute('aria-describedby', help.id); root.append(help);
	actions.innerHTML = '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-text-cancel aria-label="cancel">' + RAPIER_DRAW_ICONS.close + '</button>' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--go" data-text-done aria-label="set text">' + RAPIER_DRAW_ICONS.check + '</button>';
	box.append(input); controls.append(styleRow, sizeRow); root.append(box, controls); state.surface.append(root);
	const edit = state.textEdit = { id: shape.id, session: state.session, before, selection, panel: root, box, input, controls, composing: false };
	state.labelInput = input; _rapierDrawSetSelection([shape.id]); state.menu.hidden = true;
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
			const markup = _rapierDrawDisplayMarkup(_rapierDrawSceneMarkup(candidate, false, true, {sourceOnly: true}));
			state.svg.innerHTML = markup;
			_rapierDrawNoteColours(markup); _rapierDrawDarkStyleSync();
			state.recipe = candidate;
			return true;
		} catch (error) { showToast(String(error.message || error), 'error'); return false; }
	};
	const renderStyleRow = () => {
		const live = _rapierDrawShapeById(edit.id); if (!live) return;
		const focused = controls.contains(document.activeElement) ? document.activeElement : null;
		const focusKey = focused && ['data-text-align', 'data-text-size', 'data-text-cancel', 'data-text-done'].find(key => focused.hasAttribute(key));
		const focusValue = focusKey ? focused.getAttribute(focusKey) : '';
		const isText = live.recognized === 'text';
		const size = live.textSize || (isText ? 24 : 14);
		const align = live.labelAlign || (isText ? 'start' : 'middle');
		styleRow.innerHTML = [['start', 'align-left', 'Left'], ['middle', 'align-center', 'Center'], ['end', 'align-right', 'Right']].map(([id, icon, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-text-align="' + id + '" aria-label="' + word + '" aria-pressed="' + (align === id) + '">' + RAPIER_DRAW_ICONS[icon] + '</button>').join('');
		styleRow.append(actions);
		sizeRow.innerHTML = '<input class="rapier-draw-text-size" type="range" data-text-size min="' + RAPIER_DRAW_TEXT_SIZE_MIN + '" max="' + Math.max(RAPIER_DRAW_TEXT_SIZE_MAX, Math.ceil(size)) + '" step="1" value="' + size + '" aria-label="Text size"><output class="rapier-draw-nib-word" data-text-size-word>' + Math.round(size) + '</output>';
		_rapierDrawSeekWrap(sizeRow.querySelector('[data-text-size]'));
		if (focusKey) controls.querySelector('[' + focusKey + '="' + CSS.escape(focusValue) + '"]')?.focus({preventScroll: true});
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
		if (evt.key === 'Escape' || evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) { evt.preventDefault(); _rapierDrawFinishText(); }
		else if ((evt.ctrlKey || evt.metaKey) && (evt.key === ']' || evt.key === '[')) {
			evt.preventDefault();
			const unindent = evt.key === '[', value = input.value, start = input.selectionStart, end = input.selectionEnd;
			if (start === end && !unindent) input.setRangeText('\t', start, end, 'end');
			else {
				const first = start ? value.lastIndexOf('\n', start - 1) + 1 : 0;
				const last = end > start && value[end - 1] === '\n' ? end - 1 : value.indexOf('\n', end);
				const stop = last < 0 ? value.length : last, changes = []; let at = first;
				for (const line of value.slice(first, stop).split('\n')) {
					const remove = unindent ? (line[0] === '\t' ? 1 : /^ {1,4}/.exec(line)?.[0].length || 0) : 0;
					changes.push({ at, remove, insert: unindent ? '' : '\t' }); at += line.length + 1;
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
		const draft = _rapierDrawOfferedFonts().find(font => font.id === textStyle.textFont);
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
function _rapierDrawOfferedFonts() {
	const state = _rapierDrawState, out = new Map();
	for (const font of _rapierDocumentFonts.fonts()) out.set(font.id, font);
	for (const font of state.recipe?.fonts || []) out.set(font.id, font);
	for (const font of state.textFontDrafts?.values() || []) if (!out.has(font.id)) out.set(font.id, font);
	return [...out.values()];
}
function _rapierDrawSyncFonts() {
	const state = _rapierDrawState, used = new Set((state.recipe?.shapes || []).map(shape => shape.textFont));
	const next = state.textDefaults?.textFont;
	if (next && next !== 'sans' && next !== 'serif' && next !== 'mono') used.add(next);
	const wanted = new Map(_rapierDrawOfferedFonts().filter(font => used.has(font.id)).map(font => [font.id, font]));
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
async function _rapierDrawUploadFont(files, target = 'selection') {
	const state = _rapierDrawState, session = state.session, id = state.menuShapeId, original = target === 'selection' ? _rapierDrawShapeById(id) : null;
	if (!files || target === 'selection' && (!original || original.locked)) return;
	const baseline = original && JSON.stringify(original), fonts = globalThis.RapierDrawFonts, upload = state.fontUpload = (state.fontUpload || 0) + 1;
	const popup = _rapierProgressOpen({ label: 'Adding font', after: 500 });
	try {
		const result = await _rapierDocumentFonts.add(Array.isArray(files) ? files : [files]);
		if (result.refused.length) showToast(result.refused.map(row => row.name + ': ' + row.reason).join('\n'), 'error');
		const font = result.fonts.find(font => font.style === 'normal' && font.weight === 400) || result.fonts[0];
		if (!font) return;
		const face = state.fontFaces.get(font.id)?.font.data === font.data ? state.fontFaces.get(font.id).face : await new FontFace(fonts.fontFaceFamily(font), 'url(' + fonts.fontDataURL(font) + ')').load();
		if (!state.open || state.session !== session || state.fontUpload !== upload || state.finishing || state.textEdit) return;
		const saved = state.recipe.fonts || [], drafts = [...(state.textFontDrafts?.values() || [])], existing = saved.find(item => item.id === font.id) || drafts.find(item => item.id === font.id);
		if (existing && existing.data !== font.data) throw new Error('The new font conflicts with a font already in the drawing. Choose a different font.');
		const admitted = fonts.admitFonts([font]);
		const admittedFont = admitted.find(item => item.id === font.id) || existing || font;
		if (!state.open || state.session !== session || state.fontUpload !== upload || state.finishing || state.textEdit) return;
		if (target === 'default') {
			state.textFontDrafts ||= new Map();
			if (!saved.some(item => item.id === font.id)) state.textFontDrafts.set(font.id, admittedFont);
			_rapierDrawTextDefaults().textFont = font.id;
			_rapierDrawRemember('textDefaults', JSON.stringify(_rapierDrawTextDefaults()));
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
	finally { popup.end(); }
}

const RAPIER_DRAW_TOOLS = ['select', 'brush', 'pen', 'paint', 'water', 'shape', 'text', 'erase', 'effects'];
// first control in its row (RAPIER_DRAW_PEN_MODES). A new mode is one more row there.
const RAPIER_DRAW_TOOL_SECTIONS = [['Tools', ['select', 'erase', 'image', 'effects']], ['SVG', ['brush', 'shape', 'text', 'gallery']], ['Raster', ['paint', 'water']]];
const RAPIER_DRAW_TOOL_WORDS = { select: 'Select', brush: 'Pen', pen: 'Pen', paint: 'Brushes', water: 'Watercolor', shape: 'Shape', text: 'Text', erase: 'Eraser', image: 'Image', gallery: 'Gallery', effects: 'Effects' };
const RAPIER_DRAW_TOOL_SHORT = { select: 'Select', brush: 'Pen', pen: 'Pen', paint: 'Brushes', water: 'Water', shape: 'Shape', text: 'Text', erase: 'Eraser', effects: 'Effects' };
const RAPIER_DRAW_HINT_WORDS = {
	effects: 'Choose an effect for the artwork',
	select: 'Tap a shape to select it',
	brush: 'Tap to draw',
	pen: 'Tap to draw',
	paint: 'Tap to paint',
	water: 'If Water slows down, tap Set to keep your painting and start a fresh layer above it.',
	shape: 'Drag out a shape',
	text: 'Tap to write',
	erase: 'Draw through anything to cut it',
};
const RAPIER_DRAW_ICON_WRAP = (body, extra = '') => '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + extra + '>' + body + '</svg>';
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
	add: RAPIER_DRAW_ICON_WRAP('<path d="M12 6v12M6 12h12"/>'),
	garden: RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="7" r="4"/><path d="M10 7a2 2 0 1 1 3 1.5M12 11v10M12 16c-3 0-5-1.5-5-4 3 0 5 1.500 5 4zM12 18c3 0 5-1.500 5-4-3 0-5 1.500-5 4z"/>'),
	none: RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="8"/><path d="m6 18 12-12"/>'),
	dropper: RAPIER_DRAW_ICON_WRAP('<path d="M14.5 3.5a2.8 2.8 0 0 1 4 4l-2.2 2.2 1 1-1.8 1.8-1-1L7 19h-4v-4l7.5-7.5-1-1L11.3 4.7l1 1z"></path>'),
	get check() { return _rapierDrawSourceGlyph('command:check'); },
	get close() { return _rapierDrawSourceGlyph('#btn-embed-close'); },
	get chevron() { return _rapierDrawSourceGlyph('#settings-open-chevron'); },
	get clear() { return _rapierDrawSourceGlyph('notes:trash'); },
	canvas: RAPIER_DRAW_ICON_WRAP('<rect x="1.2" y="1.2" width="21.6" height="21.6"></rect><rect x="5.6" y="5.6" width="12.8" height="12.8"></rect>'),
	select: RAPIER_DRAW_ICON_WRAP('<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3.2 2.6"></rect>'),
	get brush() { return _rapierDrawSourceGlyph('[data-command="insert.draw"]'); },
	// Feather Icons' pen-tool (MIT; the editor's command table carries it, so the licences list's Feather entry covers it).
	get pen() { return _rapierDrawSourceGlyph('command:pen-tool'); },
	penInk: RAPIER_DRAW_ICON_WRAP('<path d="M3.5 20C7.5 19.5 9 15.5 12 12S17 5 20.5 4C18.5 7 16.5 10.5 13.5 14S8 19.5 3.5 20Z" fill="currentColor" stroke-width="1"></path>'),
	penLine: RAPIER_DRAW_ICON_WRAP('<rect x="2" y="17" width="4" height="4"></rect><rect x="18" y="3" width="4" height="4"></rect><path d="M6 19c7 0 5-14 12-14"></path>'),
	get paint() { return RAPIER_DRAW_ICON_WRAP(_rapierDrawSourceGlyphBody('[data-command="insert.draw"]') + '<circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none"></circle><circle cx="13.5" cy="20.5" r="1.4" fill="currentColor" stroke="none"></circle>'); },
	get water() { return RAPIER_PAINT_ICON_WATER; },
	shape: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="11" height="11" rx="1"></rect><circle cx="16.5" cy="16.5" r="4.5"></circle>'),
	get text() { return _rapierDrawSourceGlyph('command:type'); },
	erase: RAPIER_DRAW_ICON_WRAP('<path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3"></path><path d="M18 13.3l-6.3 -6.3"></path>'),
	get image() { return _rapierDrawSourceGlyph('command:image'); },
	get gallery() { return _rapierDrawSourceGlyph('command:book-open'); },
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
	pressed: RAPIER_DRAW_ICON_WRAP('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"></path>'),
	effects: RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
	kerning: RAPIER_DRAW_ICON_WRAP('<path d="M2.5 19l4.5-14h1.5L13 19"></path><path d="M4.6 13.5h6.3"></path><path d="M10.5 5l4.5 14h1.5L21 5"></path>'),
	'space-y': RAPIER_DRAW_ICON_WRAP('<line x1="4" y1="4" x2="20" y2="4"></line><line x1="4" y1="20" x2="20" y2="20"></line><rect x="8" y="9" width="8" height="6" rx="1"></rect>'),
};
const RAPIER_DRAW_TOOL_SAYS = {
	select: 'Select tool: tap a shape to choose it, drag empty space to choose several.',
	brush: 'Pen: Ink draws with pressure and speed, Line draws one even width.',
	pen: 'Pen: Ink draws with pressure and speed, Line draws one even width.',
	paint: 'Brushes: MyPaint brushes on a paint layer inside the drawing; pressure, speed and direction shape the stroke.',
	water: 'Watercolor: pigments flow, bloom and dry on textured paper.',
	shape: 'Shape tool: drag out the shape you picked.',
	text: 'Text tool: tap for growing text, or drag to set its wrapping width.',
	erase: 'Eraser: draw through anything to cut it into pieces.',
	image: 'Image: choose one or more pictures to place on the canvas.',
	gallery: 'Gallery: place an element, border or letter on the canvas.',
	effects: 'Effects: Copy machine and Refracted light for the drawing, selected objects or a paint layer.',
};
const RAPIER_DRAW_PEN_MODES = [['brush', 'Ink', 'pressure and speed shape the stroke'], ['pen', 'Line', 'one even width for lines, curves and shapes']];
function _rapierDrawPenMode() {
	const state = _rapierDrawState;
	return state.tool === 'brush' || state.tool === 'pen' ? state.tool : state.penMode || _rapierDrawRemembered('penMode');
}
const RAPIER_DRAW_TOOL_SETTINGS = Object.freeze({
	select: ['ink', 'nib', 'options'],
	brush: ['penMode', 'ink', 'nib'],
	pen: ['penMode', 'ink', 'nib', 'smooth'],
	paint: ['paintBrushes', 'nib', 'dip', 'ink', 'paintTools', 'paintSet'],
	water: ['waterBrushes', 'nib', 'waterLoad', 'waterPigments', 'waterDry', 'waterTools', 'paintSet'],
	shape: ['ink', 'nib', 'kinds', 'options'],
	text: ['ink', 'textSize', 'textFont', 'textSpacing', 'textStyle', 'textAlign'],
	erase: ['nib', 'eraseEdge'],
	effects: ['copyMachine', 'refractedLight', 'liquidLight'],
});
function _rapierDrawSetToolMenu(open) {
	const state = _rapierDrawState, menu = state.surface?.querySelector('.rapier-draw-tool-menu:not(.rapier-draw-canvas-menu)'), trigger = state.surface?.querySelector('[data-draw-act="toolMenu"]');
	if (!menu || !trigger) return;
	const inside = !open && menu.contains(document.activeElement);
	if (open && state.canvasMenuOpen) _rapierDrawSetCanvasMenu(false);
	state.toolMenuOpen = !!open;
	menu.hidden = !state.toolMenuOpen;
	state.surface.classList.toggle('rapier-draw-surface--choosing', state.toolMenuOpen || !!state.canvasMenuOpen);
	if (inside) trigger.focus({ preventScroll: true });
	trigger.setAttribute('aria-expanded', String(state.toolMenuOpen));
	if (open) _rapierDrawMenuEnter(menu);

	if (state.menu) {
		if (state.toolMenuOpen) state.menu.hidden = true;
		else _rapierDrawUpdateMenu();
	}
}
const RAPIER_DRAW_RESIZE_PRESETS = [['free', 'Free'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9'], ['page', 'Page']];
const RAPIER_DRAW_CANVAS_ACTS = ['canvas', 'canvasSwap', 'canvasBackground', 'canvasResize', 'canvasAdaptive'];
const RAPIER_DRAW_RESIZE_MIN = 16, RAPIER_DRAW_RESIZE_MAX = 65536, RAPIER_DRAW_RESIZE_SNAP_PX = 10;
function _rapierDrawOpenBackgroundPanel() { _rapierDrawSetCanvasMenu(false); if (typeof _rapierDrawOpenBackground === 'function') _rapierDrawOpenBackground(); }
function _rapierDrawSetCanvasMenu(open) {
	const state = _rapierDrawState, menu = state.surface?.querySelector('.rapier-draw-canvas-menu'), trigger = state.surface?.querySelector('[data-draw-act="canvas"]');
	if (!menu || !trigger) return;
	open = !!open;
	if (open === !!state.canvasMenuOpen && open === !menu.hidden) return;
	if (open && state.toolMenuOpen) _rapierDrawSetToolMenu(false);
	const inside = !open && menu.contains(document.activeElement);
	state.canvasMenuOpen = open;
	menu.hidden = !open;
	state.surface.classList.toggle('rapier-draw-surface--choosing', open || !!state.toolMenuOpen);
	state.surface.classList.toggle('rapier-draw-surface--choosing-canvas', open);
	if (inside) trigger.focus({ preventScroll: true });
	trigger.setAttribute('aria-expanded', String(open));
	if (open) { _rapierDrawSyncCanvasMenu(); _rapierDrawMenuEnter(menu); }
	if (state.menu) { if (open) state.menu.hidden = true; else _rapierDrawUpdateMenu(); }
}
function _rapierDrawSyncCanvasMenu() {
	const state = _rapierDrawState, menu = state.surface?.querySelector('.rapier-draw-canvas-menu');
	if (!menu || !state.recipe) return;
	const dark = _rapierDrawDarkPaper(), swap = menu.querySelector('[data-draw-act="canvasSwap"]'), adaptive = menu.querySelector('[data-draw-act="canvasAdaptive"]'), on = !state.recipe.frame;
	swap.setAttribute('aria-label', 'Canvas: ' + (dark ? 'black; change to white' : 'white; change to black'));
	adaptive.setAttribute('aria-checked', String(on));
	adaptive.firstElementChild.textContent = on ? 'Adaptive: on' : 'Adaptive: off';
	menu.querySelector('[data-draw-act="timelapse"]').hidden = !_rapierWaterProAvailable();
	const note = menu.querySelector('[data-draw-background-note]'), kind = (typeof _rapierBgCurrent === 'function' ? _rapierBgCurrent() : state.recipe.background)?.kind;
	if (note) note.textContent = kind ? kind[0].toUpperCase() + kind.slice(1) : 'None';
}
function _rapierDrawStartFrame(recipe = _rapierDrawState.recipe) {
	if (recipe.frame) return { ...recipe.frame };
	const paper = _rapierDrawPaperView(recipe), x = Math.floor(paper.x), y = Math.floor(paper.y);
	return { x, y, w: Math.max(1, Math.ceil(paper.x + paper.w) - x), h: Math.max(1, Math.ceil(paper.y + paper.h) - y) };
}
function _rapierDrawSetAdaptive(on) {
	const state = _rapierDrawState, frame = on ? null : _rapierDrawStartFrame();
	return Promise.resolve(_rapierDrawCommand(() => { if (frame) state.recipe.frame = frame; else delete state.recipe.frame; })).then(() => { if (!state.open) return; _rapierDrawApplyView(); _rapierDrawSyncCanvasMenu(); });
}
function _rapierDrawFrameBox(frame) {
	const state = _rapierDrawState, layer = state.resizeLayer, rect = state.svgRoot.getBoundingClientRect(), vb = state.svgRoot.viewBox.baseVal, origin = layer.getBoundingClientRect();
	const a = _rapierDrawMapToScreen(frame.x, frame.y, rect, vb), b = _rapierDrawMapToScreen(frame.x + frame.w, frame.y + frame.h, rect, vb);
	return { left: a[0] - origin.left, top: a[1] - origin.top, right: b[0] - origin.left, bottom: b[1] - origin.top };
}
function _rapierDrawResizeDraw() {
	const state = _rapierDrawState, layer = state.resizeLayer, resize = state.resize, frame = resize?.frame || state.recipe?.frame;
	if (!layer) return;
	if (!frame || !state.open) { layer.hidden = true; return; }
	if (layer.hidden) layer.hidden = false;
	if (!layer.firstChild) {
		const box = document.createElement('div'); box.className = 'rapier-draw-resize-frame';
		layer.append(box);
		for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
			const target = document.createElement('div'), mark = document.createElement('span');
			target.className = 'rapier-draw-resize-target'; target.dataset.drawResize = id; mark.className = 'rapier-draw-resize-mark';
			target.append(mark); layer.append(target);
		}
	}
	layer.dataset.mode = resize ? 'resizing' : 'resting';
	const b = _rapierDrawFrameBox(frame), box = layer.firstChild, cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
	box.style.cssText = 'left:' + b.left + 'px;top:' + b.top + 'px;width:' + (b.right - b.left) + 'px;height:' + (b.bottom - b.top) + 'px';
	if (!resize) return;
	const at = { nw: [b.left, b.top], n: [cx, b.top], ne: [b.right, b.top], e: [b.right, cy], se: [b.right, b.bottom], s: [cx, b.bottom], sw: [b.left, b.bottom], w: [b.left, cy] };
	const w = layer.clientWidth, h = layer.clientHeight;
	for (const target of layer.children) {
		const p = at[target.dataset.drawResize]; if (!p) continue;
		const left = w >= 44 ? _rapierDrawClamp(p[0] - 22, 0, w - 44) : p[0] - 22, top = h >= 44 ? _rapierDrawClamp(p[1] - 22, 0, h - 44) : p[1] - 22;
		target.style.cssText = 'left:' + left + 'px;top:' + top + 'px;--dx:' + (p[0] - 22 - left) + 'px;--dy:' + (p[1] - 22 - top) + 'px';
	}
}
function _rapierDrawResizeStart() {
	const state = _rapierDrawState;
	if (state.resize || !state.open || !state.recipe) return;
	_rapierDrawSetSelection([]); _rapierDrawCloseSettingPanels('');
	const frame = _rapierDrawStartFrame();
	state.resize = { frame, start: { ...frame }, preset: 'free', ratio: null, ink: _rapierDrawUnionView(state.recipe) };
	state.surface.classList.add('rapier-draw-surface--resizing');
	state.surface.querySelector('[data-draw-resize-strip]').hidden = false;
	_rapierDrawResizeSyncStrip(); _rapierDrawApplyView();
}
function _rapierDrawResizeReset() {
	const state = _rapierDrawState;
	state.surface.classList.remove('rapier-draw-surface--resizing');
	const strip = state.surface.querySelector('[data-draw-resize-strip]');
	if (strip) strip.hidden = true;
	if (state.resizeLayer) state.resizeLayer.hidden = true;
}
function _rapierDrawResizeSyncStrip() {
	const resize = _rapierDrawState.resize;
	for (const chip of _rapierDrawState.surface.querySelectorAll('[data-draw-preset]')) chip.setAttribute('aria-pressed', String(!!resize && chip.dataset.drawPreset === resize.preset));
}
function _rapierDrawResizeDone(cancel = false) {
	const state = _rapierDrawState, resize = state.resize;
	if (!resize) return;
	if (state.gesture?.kind === 'resize') _rapierDrawEndGesture(false);
	state.resize = null;
	state.surface.classList.remove('rapier-draw-surface--resizing');
	state.surface.querySelector('[data-draw-resize-strip]').hidden = true;
	const f = resize.frame, x = Math.floor(f.x), y = Math.floor(f.y), frame = { x, y, w: Math.max(1, Math.ceil(f.x + f.w) - x), h: Math.max(1, Math.ceil(f.y + f.h) - y) };
	const finish = () => { if (!state.open) return; _rapierDrawApplyView(); _rapierDrawSyncCanvasMenu(); };
	if (cancel) { finish(); return; }
	return Promise.resolve(_rapierDrawCommand(() => { state.recipe.frame = frame; })).then(finish);
}
function _rapierDrawResizePreset(id) {
	const state = _rapierDrawState, resize = state.resize;
	if (!resize) return;
	const f = resize.frame, cx = f.x + f.w / 2, cy = f.y + f.h / 2;
	let w = f.w, h = f.h;
	resize.preset = id; resize.ratio = null;
	if (id === 'page') {
		const column = document.querySelector('#editor-blocks .block-read, #editor-blocks p'), style = column && getComputedStyle(column);
		const width = column ? column.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) : 0;
		w = Math.round(width > 0 ? width : Math.min(720, window.innerWidth - 32));
	} else if (id !== 'free') {
		const [a, b] = id.split(':').map(Number), ratio = f.w >= f.h ? a / b : b / a;
		resize.ratio = ratio;
		h = Math.max(RAPIER_DRAW_RESIZE_MIN, w / ratio);
	}
	w = _rapierDrawClamp(w, RAPIER_DRAW_RESIZE_MIN, RAPIER_DRAW_RESIZE_MAX); h = _rapierDrawClamp(h, RAPIER_DRAW_RESIZE_MIN, RAPIER_DRAW_RESIZE_MAX);
	resize.frame = { x: cx - w / 2, y: cy - h / 2, w, h };
	_rapierDrawResizeSyncStrip(); _rapierDrawApplyView(); _rapierDrawResizeDraw();
}
function _rapierDrawResizeDown(evt) {
	const state = _rapierDrawState, target = evt.target.closest?.('[data-draw-resize]');
	state.pointerId = evt.pointerId; state.strokeStartT = evt.timeStamp;
	const point = _rapierDrawSurfacePoint(evt), svgRect = state.svgRoot.getBoundingClientRect(), scale = _rapierDrawViewTransform(svgRect, state.svgRoot.viewBox.baseVal).scale;
	state.gesture = { kind: 'resize', tool: _rapierDrawTool(), scale, origin: point, selection: [], touch: evt.pointerType === 'touch', pointerType: evt.pointerType, changed: false, dragged: false,
		resize: target ? { handle: target.dataset.drawResize, start: { ...state.resize.frame }, from: point, snapped: '' } : null };
	state.pointerPos = point; state.pointerScreen = [evt.clientX, evt.clientY];
	try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
}
function _rapierDrawResizeMove(point, gesture) {
	const state = _rapierDrawState, resize = state.resize, drag = gesture.resize;
	if (!resize || !drag) return;
	const handle = drag.handle, start = drag.start, west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
	const dx = point[0] - drag.from[0], dy = point[1] - drag.from[1], MIN = RAPIER_DRAW_RESIZE_MIN, MAX = RAPIER_DRAW_RESIZE_MAX;
	let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
	if (west) left += dx; if (east) right += dx; if (north) top += dy; if (south) bottom += dy;
	const tolerance = RAPIER_DRAW_RESIZE_SNAP_PX / gesture.scale, ink = resize.ink, snapped = [];
	if (ink) {
		if (west && Math.abs(left - ink.minX) <= tolerance) { left = ink.minX; snapped.push('w'); }
		if (east && Math.abs(right - ink.maxX) <= tolerance) { right = ink.maxX; snapped.push('e'); }
		if (north && Math.abs(top - ink.minY) <= tolerance) { top = ink.minY; snapped.push('n'); }
		if (south && Math.abs(bottom - ink.maxY) <= tolerance) { bottom = ink.maxY; snapped.push('s'); }
	}
	if (west) left = Math.min(left, right - MIN); if (east) right = Math.max(right, left + MIN);
	if (north) top = Math.min(top, bottom - MIN); if (south) bottom = Math.max(bottom, top + MIN);
	const ratio = resize.ratio;
	if (ratio) {
		let w = right - left, h = bottom - top;
		const horizontal = west || east, vertical = north || south;
		if (horizontal && vertical) { w = Math.max(w, h * ratio); h = w / ratio; }
		else if (horizontal) h = w / ratio;
		else w = h * ratio;
		w = Math.min(MAX, Math.max(MIN, w)); h = Math.min(MAX, Math.max(MIN, h));
		const cx = (start.x + start.x + start.w) / 2, cy = (start.y + start.y + start.h) / 2;
		if (horizontal) { if (west) left = right - w; else right = left + w; } else { left = cx - w / 2; right = cx + w / 2; }
		if (vertical) { if (north) top = bottom - h; else bottom = top + h; } else { top = cy - h / 2; bottom = cy + h / 2; }
	}
	const key = snapped.join('');
	if (key && key !== drag.snapped) { try { navigator.vibrate?.(8); } catch (_) {} }
	drag.snapped = key;
	const next = { x: left, y: top, w: Math.min(MAX, right - left), h: Math.min(MAX, bottom - top) };
	if (next.x === resize.frame.x && next.y === resize.frame.y && next.w === resize.frame.w && next.h === resize.frame.h) return;
	resize.frame = next; gesture.changed = true;
	if (!resize.ratio && resize.preset !== 'free') { resize.preset = 'free'; _rapierDrawResizeSyncStrip(); }
	_rapierDrawApplyView(); _rapierDrawResizeDraw();
}

function _rapierDrawCloseSettingPanels(except = '') {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface) return;
	let focusPanel = '';
	for (const panel of surface.querySelectorAll('[data-draw-panel]')) {
		const keep = panel.dataset.drawPanel === except;
		if (!keep && panel.classList.contains('rapier-draw-brushes')) _rapierPaintKeepScroll(panel);
		if (!keep) {
			if (panel.contains(document.activeElement)) focusPanel = panel.dataset.drawPanel;
			panel.hidden = true;
		}
	}
	for (const btn of surface.querySelectorAll('.rapier-draw-settings [aria-expanded]')) {
		if (btn.dataset.drawAct !== except) btn.setAttribute('aria-expanded', 'false');
	}
	if (except !== 'ink') state.colourOpen = false;
	if (except !== 'kinds') state.kindsOpen = false;
	if (except !== 'paintBrushes' && except !== 'paintTools') state.paintPicker = null;
	if (!except.startsWith('water')) state.waterPanel = null;
	if (except !== 'dip') _rapierPaintDipSyncButton?.();
	if (except !== 'background' && typeof _rapierDrawCloseBackground === 'function') _rapierDrawCloseBackground();
	if (focusPanel) {
		const tool = _rapierDrawTool();
		let action = focusPanel === 'background' ? 'canvas' : focusPanel === 'waterPaper' ? 'waterBrushes' : focusPanel === 'angle' ? (tool === 'water' ? 'waterBrushes' : 'paintBrushes') : focusPanel;
		if (action !== 'canvas' && !(RAPIER_DRAW_TOOL_SETTINGS[tool] || []).includes(action)) action = 'toolMenu';
		if (state.settingsCollapsed && action !== 'canvas' && action !== 'toolMenu') action = 'settingsCollapse';
		const trigger = surface.querySelector('[data-draw-act="' + action + '"]');
		(trigger && _rapierDrawChoiceAvailable(trigger) ? trigger : state.svgRoot).focus({preventScroll: true});
	}
}
function _rapierDrawSetSettingsCollapsed(collapsed) {
	const state = _rapierDrawState, settings = state.surface?.querySelector('.rapier-draw-settings');
	if (!settings) return;
	const btn = settings.querySelector('[data-draw-act="settingsCollapse"]');
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
function _rapierDrawShowTool(tool) {
	const trigger = _rapierDrawState.surface?.querySelector('[data-draw-act="toolMenu"]');
	const shown = tool === 'pen' ? 'brush' : tool;
	if (!trigger || trigger.dataset.drawShown === shown) return;
	const changed = !!trigger.dataset.drawShown;
	trigger.dataset.drawShown = shown;
	trigger.innerHTML = RAPIER_DRAW_ICONS[tool] + '<span>' + RAPIER_DRAW_TOOL_SHORT[tool] + '</span>';
	trigger.setAttribute('aria-label', 'Current tool: ' + RAPIER_DRAW_TOOL_WORDS[tool] + '. Choose tool.');
	if (changed) { _rapierDrawPlay(trigger.firstElementChild, 'rise'); _rapierDrawPlay(trigger.lastElementChild, 'riseWord'); }
}
function _rapierDrawUpdatePenBtn() {
	const surface = _rapierDrawState.surface;
	const tool = _rapierDrawTool();
	if (surface) {
		const sizeButton = surface.querySelector('[data-draw-act="nib"]'), sizeWord = tool === 'water' ? 'size' : 'width';
		if (sizeButton) { sizeButton.querySelector('.rapier-draw-btn-name').textContent = sizeWord; sizeButton.setAttribute('aria-label', sizeWord); sizeButton.dataset.tip = sizeWord; }
		for (const name of RAPIER_DRAW_TOOLS) {
			const btn = surface.querySelector('[data-draw-tool="' + name + '"]');
			if (!btn) continue;
			btn.hidden = !_rapierDrawToolAllowed(name);
			btn.setAttribute('aria-checked', String(name === tool || (name === 'brush' && tool === 'pen')));
			btn.innerHTML = RAPIER_DRAW_ICONS[name] + '<span>' + RAPIER_DRAW_TOOL_WORDS[name] + '</span>';
			btn.setAttribute('aria-label', RAPIER_DRAW_TOOL_SAYS[name]);
		}
		_rapierDrawShowTool(tool);
		_rapierDrawUpdatePenModes();
	}
	_rapierDrawSyncCanvasAccess();

	if (_rapierDrawState.live) {
		_rapierDrawState.live.classList.toggle('rapier-draw-live--pen', tool === 'brush');
	}
	if (surface) {
		const visible = new Set(RAPIER_DRAW_TOOL_SETTINGS[tool] || []);
		for (const btn of surface.querySelectorAll('.rapier-draw-settings [data-draw-setting]')) btn.hidden = !visible.has(btn.dataset.drawSetting);
		const row = surface.querySelector('.rapier-draw-settings'), controls = row?.querySelector('.rapier-draw-settings-controls');
		for (const name of RAPIER_DRAW_TOOL_SETTINGS[tool] || []) { const btn = controls?.querySelector('[data-draw-setting="' + name + '"]'); if (btn) controls.appendChild(btn); }
		row?.style.setProperty('--draw-settings-count', String(Math.max(1, visible.size)));
		row?.classList.toggle('rapier-draw-settings--even', tool === 'paint' || tool === 'water');
		_rapierDrawUpdateContextOptions();
		_rapierPaintUpdateStrip();
		_rapierWaterUpdate();
		for (const panel of surface.querySelectorAll('[data-draw-panel]')) {
			if (!visible.has(panel.dataset.drawPanel) && !(tool === 'water' && panel.dataset.drawPanel === 'waterPaper' && _rapierDrawState.waterPanel === 'waterPaper')) panel.hidden = true;
		}
		_rapierDrawState.live.classList.toggle('rapier-draw-live--erase', tool === 'erase');
		_rapierPaintSyncPaper();
	}
}
function _rapierDrawUpdatePenModes() {
	const surface = _rapierDrawState.surface, tool = _rapierDrawTool();
	if (!surface || (tool !== 'brush' && tool !== 'pen')) return;
	const [, word, says] = RAPIER_DRAW_PEN_MODES.find(([id]) => id === tool);
	const chip = surface.querySelector('[data-draw-act="penMode"]');
	if (chip && chip.dataset.drawMode !== tool) {
		chip.dataset.drawMode = tool;
		chip.innerHTML = RAPIER_DRAW_ICONS[tool === 'pen' ? 'penLine' : 'penInk'] + '<span class="rapier-draw-btn-name">' + word.toLowerCase() + '</span>';
		chip.setAttribute('aria-label', 'Pen mode: ' + word + ', ' + says);
		chip.dataset.tip = word.toLowerCase();
	}
	for (const radio of surface.querySelectorAll('[data-draw-pen-mode]')) {
		const on = radio.dataset.drawPenMode === tool;
		radio.setAttribute('aria-checked', String(on)); radio.tabIndex = on ? 0 : -1;
		radio.classList.toggle('rapier-draw-chip--active', on);
	}
}
function _rapierDrawTool() {
	const t = _rapierDrawState.tool;
	return RAPIER_DRAW_TOOLS.indexOf(t) >= 0 ? t : (_rapierDrawState.pen ? 'pen' : 'brush');
}
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
	el.textContent = RAPIER_DRAW_HINT_WORDS[_rapierDrawState.tool] || RAPIER_DRAW_HINT_WORDS.brush;
}
function _rapierDrawToolAllowed(name) {
	if (['select', 'erase', 'effects', 'image'].includes(name))
		return _rapierEmbedFeatureAllowed('draw') || _rapierEmbedFeatureAllowed('paint');
	return _rapierEmbedFeatureAllowed(name === 'paint' || name === 'water' ? 'paint' : 'draw');
}
async function _rapierDrawSetTool(name, remember = true) {
	if (!_rapierDrawToolAllowed(name)) return;
	if (!RAPIER_DRAW_TOOLS.includes(name)) return;
	if (!_rapierDrawFinishText()) return;
	if (name === 'water' && !globalThis.navigator?.gpu && _rapierDrawToolAllowed('paint')) { _rapierDrawWatercolourFallback(); name = 'paint'; remember = false; }
	const state = _rapierDrawState, change = state.toolChange = {session: state.session};
	const current = () => state.open && state.session === change.session && state.toolChange === change;
	_rapierDrawSetToolMenu(false); _rapierDrawShowTool(name);
	try {
		const pending = _rapierPaintPendingStroke();
		if (pending) { await pending; if (!current()) return; }
		_rapierDrawCancelGesture();
		try {
			if (!(typeof _rapierPaintDepart === 'function' && _rapierPaintDepart())) {
				const closed = _rapierPaintCloseLayer(current); if (closed) await closed;
			}
		} catch (error) { showToast('The painting could not be kept. The tool was not changed: ' + String(error?.message || error), 'error'); return; }
		if (!current()) return;
		if (name === 'effects') _rapierDrawEffectsEnter();
		else if (state.tool === 'effects') {
			state.effectsChangeEpoch++; state.effectsPendingChange = null;
			_rapierDrawEffectsPreviewRelease(false);
			state.effectsCompare = false; _rapierDrawEffectsCompare();
		}
		_rapierDrawState.tool = name;
		_rapierDrawState.pen = name === 'pen';
		if (name === 'brush' || name === 'pen') { state.penMode = name; if (remember) _rapierDrawRemember('penMode', name); }
		if (name === 'water') delete state.waterLost;
		_rapierDrawLiquidSync(); _rapierDrawCopierSync();
		_rapierDrawSetSelection([]); _rapierDrawMarkSelection(); _rapierDrawUpdateMenu();
		if (remember && RAPIER_DRAW_START_TOOLS.includes(name)) _rapierDrawRemember(state.notes ? 'notesTool' : 'tool', name);
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
		_rapierDrawEffectsPreviewSchedule();
	} finally {
		if (state.toolChange === change) state.toolChange = null;
		if (!state.toolChange && state.open) _rapierDrawShowTool(_rapierDrawTool());
		_rapierDrawReleaseHeldPress(change);
	}
}
function _rapierDrawReleaseHeldPress(change) {
	const state = _rapierDrawState, held = state.heldPress;
	if (!held || held.change !== change) return;
	if (state.toolChange && state.toolChange !== change) { held.change = state.toolChange; return; }
	if (state.paintDeparture && state.paintDeparture !== change && !['pen', 'brush', 'shape', 'text'].includes(_rapierDrawTool())) { held.change = state.paintDeparture; return; }
	state.heldPress = null;
	if (!state.open || state.session !== change.session || held.up?.type === 'pointercancel') return;
	_rapierDrawGuard(_rapierDrawOnPointerDown)(held.down);
	for (const move of held.moves) _rapierDrawGuard(_rapierDrawOnPointerMove)(move);
	if (held.up) _rapierDrawGuard(_rapierDrawOnPointerUp)(held.up);
}

const RAPIER_DRAW_ERASE_MIN_LEN = 4;

function _rapierDrawEraseRadius() {
	return Math.max(4, _rapierDrawNibLevel(_rapierDrawState.eraseNib ?? _rapierDrawState.nib) * 0.9);
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
	if (shape.recognized === 'paint' || shape.recognized === 'ornament') return true;
	if (['sphere', 'wheel', 'pulley', 'wood', 'knot', 'lens'].includes(shape.brush)) return true;
	if (shape.style === 'solid' && !['line', 'arrow', 'ink'].includes(shape.recognized) && !shape.asDrawn) return true;
	return false;
}

function _rapierDrawEraseCovers(poly, path, radius) {
	const box = _rapierDrawBBox(poly), n = 12;
	let inside = 0, rubbed = 0;
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
		const p = [box.minX + (i + .5) * box.w / n, box.minY + (j + .5) * box.h / n];
		if (!_rapierDrawPointInPolygon(p, poly)) continue;
		inside++;
		if (_rapierDrawSegmentEraseIntervals(p, p, path, radius).length) rubbed++;
	}
	return !inside || rubbed * 2 >= inside;
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
		const keepEffect = (piece, source) => {
			if (source.effect) piece.effect = remapRefractionSources({ ...source.effect }, new Map([[source.id, piece.id]]));
		};
		const linePiece = (run, source, width = _rapierDrawEffectiveWidth(source), brush = source.brush, ends = null) => {
			brush = _rapierDrawBrushesFor('ink').includes(brush) ? brush : 'ink';
			const piece = { id: _rapierDrawNextId(), stroke: recipe.strokes.length + strokes.length, recognized: 'ink', asDrawn: true, brush, style: null, geom: null, smooth: 0, nib: _rapierDrawShapeNib(source, recipe) };
			if (brush === 'ink') { piece.cut = true; if (width !== RAPIER_DRAW_INK_WIDTH) piece.cutWidth = width; }
			if (brush === 'brush' && ends) { if (ends.cutStart) piece.cutStart = true; if (ends.cutEnd) piece.cutEnd = true; }
			if (source.ink) piece.ink = source.ink;
			if (source.dash) piece.dash = source.dash;
			if (source.seed != null) piece.seed = source.seed;
			if (source.opacity != null) piece.opacity = source.opacity;
			keepEffect(piece, source);
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
			keepEffect(piece, source);
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
			keepEffect(piece, source);
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
			if (shape.recognized === 'paint') { next.push(shape); continue; }
			if (_rapierDrawEraseIsFilledFace(shape)) {
				const poly = _rapierDrawShapePolygon(shape, recipe);
				if (poly?.length && !touches(poly, radius)) { next.push(shape); continue; }
				if (poly?.length && shape.recognized !== 'paint') { budget(144); if (_rapierDrawEraseCovers(poly, path, radius)) { cut = true; continue; } }
				refused = true;
				next.push(shape);
				continue;
			}
			const contours = parts?.contours || _rapierDrawShapeContours(shape, recipe);
			budget(contours.reduce((sum, line) => sum + line.length, 0));
			const cutRuns = contours.map(line => line.length > 1 ? _rapierDrawEraseRuns(line, path, radius)
				: line.length && _rapierDrawSegmentEraseIntervals(line[0], line[0], path, radius).length ? [] : null), shaftCut = cutRuns.some(Boolean);
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
				cutRuns.forEach((runs, index) => {
				const sourceLine = contours[index];
				const same = (p, q) => p && q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4;
				for (const run of runs || [sourceLine]) {
					const ends = shape.brush === 'brush' ? { cutStart: !same(run[0], sourceLine[0]), cutEnd: !same(run.at(-1), sourceLine.at(-1)) } : null;
					linePiece(run, shape, width, shape.brush, ends);
				}
			});
			}
			for (const { head, runs } of heads) {
				if (runs) for (const run of runs) linePiece(run, shape, head.kind === 'arrow' ? 2 : 2.6, 'ink');
				else if (shaftCut) headPiece(head, shape);
			}
			if (shaftCut) labelPiece(shape, radius);
		}
		if (refused) showToast('Erase cuts lines, not filled faces.', 'info');
		if (!cut) return false;
		const draft = _rapierDrawPruneUnusedStrokes({ ...recipe, strokes: recipe.strokes.concat(strokes), shapes: next });
		const kept = new Set(next.map(shape => shape.id));
		remapRefractionRecipeSources(draft, new Map(recipe.shapes.filter(shape => !kept.has(shape.id)).map(shape => [shape.id, null])));
		const candidate = _rapierDrawAdmitRecipe(draft, true);
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
function _rapierDrawChoiceAvailable(element) {
	return !element.matches(':disabled') && !element.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]') &&
		element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
}
function _rapierDrawRadioItems(group) {
	return [...group.querySelectorAll('[role="radio"]')].filter(element => element.closest('[role="radiogroup"]') === group && _rapierDrawChoiceAvailable(element));
}
function _rapierDrawRadioRove(group, current) {
	const items = _rapierDrawRadioItems(group);
	const selected = items.includes(current) ? current : items.find(item => item.getAttribute('aria-checked') === 'true') || items[0];
	for (const item of group.querySelectorAll('[role="radio"]')) {
		if (item.closest('[role="radiogroup"]') === group) item.tabIndex = item === selected ? 0 : -1;
	}
}
function _rapierDrawRadioKey(evt) {
	if (evt.altKey || evt.ctrlKey || evt.metaKey) return false;
	const radio = evt.target.closest('[role="radio"]'), group = radio?.closest('[role="radiogroup"]');
	if (!group || radio.closest('.rapier-draw-brushes')) return false;
	const items = _rapierDrawRadioItems(group), at = items.indexOf(radio);
	if (at < 0) return false;
	let to = -1;
	if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') to = (at + 1) % items.length;
	else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') to = (at - 1 + items.length) % items.length;
	else if (evt.key === 'Home') to = 0;
	else if (evt.key === 'End') to = items.length - 1;
	else return false;
	evt.preventDefault();
	if (to === at) return true;
	const next = items[to];
	if (next.dataset.drawKind) _rapierDrawSetShapeKind(next.dataset.drawKind);
	else {
		_rapierDrawRadioRove(group, next);
		next.focus({preventScroll: true});
		next.click();
	}
	return true;
}
function _rapierDrawTabKey(evt) {
	if (evt.altKey || evt.ctrlKey || evt.metaKey) return false;
	const tab = evt.target.closest('.rapier-draw-tabs [role="tab"]'), group = tab?.closest('[role="tablist"]');
	if (!group) return false;
	const items = [...group.querySelectorAll('[role="tab"]')].filter(_rapierDrawChoiceAvailable), at = items.indexOf(tab);
	if (at < 0) return false;
	const to = evt.key === 'ArrowRight' ? (at + 1) % items.length : evt.key === 'ArrowLeft' ? (at - 1 + items.length) % items.length : evt.key === 'Home' ? 0 : evt.key === 'End' ? items.length - 1 : -1;
	if (to < 0) return false;
	evt.preventDefault(); items[to].focus({preventScroll: true}); items[to].click();
	return true;
}
function _rapierDrawMenuItems(menu) {
	return [...menu.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].filter(element => element.closest('[role="menu"]') === menu && _rapierDrawChoiceAvailable(element));
}
function _rapierDrawMenuRove(menu, current) {
	for (const item of menu.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')) {
		if (item.closest('[role="menu"]') === menu) item.tabIndex = item === current ? 0 : -1;
	}
}
function _rapierDrawMenuEnter(menu) {
	const items = _rapierDrawMenuItems(menu);
	const current = items.find(item => item.getAttribute('aria-checked') === 'true') || items[0];
	_rapierDrawMenuRove(menu, current);
	current?.focus({preventScroll: true});
}
function _rapierDrawMenuKey(evt) {
	if (evt.altKey || evt.ctrlKey || evt.metaKey) return false;
	const item = evt.target.closest('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'), menu = item?.closest('[role="menu"]');
	if (!menu) return false;
	const items = _rapierDrawMenuItems(menu), at = items.indexOf(item);
	if (at < 0) return false;
	let to = -1;
	if (evt.key === 'ArrowDown' || evt.key === 'ArrowRight') to = (at + 1) % items.length;
	else if (evt.key === 'ArrowUp' || evt.key === 'ArrowLeft') to = (at - 1 + items.length) % items.length;
	else if (evt.key === 'Home') to = 0;
	else if (evt.key === 'End') to = items.length - 1;
	else return false;
	evt.preventDefault();
	_rapierDrawMenuRove(menu, items[to]);
	items[to].focus({preventScroll: true});
	return true;
}
function _rapierDrawShapeRow() { return _rapierDrawState.surface && _rapierDrawState.surface.querySelector('.rapier-draw-kinds'); }
function _rapierDrawUpdateShapeRow() {
	const row = _rapierDrawShapeRow();
	if (!row) return;
	const focused = row.contains(document.activeElement);

	if (_rapierDrawTool() !== 'shape') {
		row.setAttribute('hidden', ''); _rapierDrawState.kindsOpen = false; _rapierDrawState.kindsSeen = false;
		_rapierDrawUpdateKindsChip();
		if (focused) _rapierDrawState.surface.querySelector('[data-draw-act="toolMenu"]').focus({preventScroll: true});
		return;
	}
	if (!_rapierDrawState.kindsSeen) { _rapierDrawState.kindsSeen = true; _rapierDrawState.kindsOpen = true; }
	row.hidden = !_rapierDrawState.kindsOpen;
	const kind = _rapierDrawShapeKind();
	_rapierDrawUpdateKindsChip();
	row.innerHTML = RAPIER_DRAW_SHAPE_KINDS.map(([id, label]) =>
		'<button type="button" tabindex="' + (id === kind ? '0' : '-1') + '" class="rapier-draw-chip rapier-draw-chip--glyph' + (id === kind ? ' rapier-draw-chip--active' : '') +
		'" role="radio" data-draw-kind="' + id + '" aria-label="' + label + '" data-tip="' + label.toLowerCase() + '" aria-checked="' + (id === kind) + '">' + _rapierDrawKindGlyph(id) + '</button>').join('');
	if (focused) {
		const target = row.hidden ? _rapierDrawState.surface.querySelector('[data-draw-act="kinds"]') : row.querySelector('[aria-checked="true"]');
		target.focus({preventScroll: true});
	}
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
	if (kind === 'line') _rapierDrawSnapLineGeom(geom);
	if (kind === 'arrow' || kind === 'line') { const bind = _rapierDrawBindArrowEnds(geom); if (bind) shape.bind = bind; }
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
const RAPIER_DRAW_CHAIN_KINDS = new Set(['rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'cylinder', 'subroutine', 'asymmetric']);
const RAPIER_DRAW_CHAIN_SIDES = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
function _rapierDrawChainable(shapes) {
	const shape = shapes.length === 1 && shapes[0];
	return !!shape?.geom && RAPIER_DRAW_CHAIN_KINDS.has(shape.recognized) && !shape.asDrawn && (shape.brush || 'ink') === 'ink' && !shape.geom.rot && !shape.locked;
}
function _rapierDrawChain(side) {
	const state = _rapierDrawState, from = _rapierDrawSelectedShapes()[0], step = RAPIER_DRAW_CHAIN_SIDES[side];
	if (!step || !_rapierDrawChainable([from]) || !_rapierDrawFinishText()) return;
	const recipe = state.recipe, before = _rapierDrawHistoryRecipe(), box = _rapierDrawShapeBBoxIn(from, recipe), gap = 48;
	const along = step[0] ? box.maxX - box.minX + gap : box.maxY - box.minY + gap;
	const taken = recipe.shapes.filter(shape => shape !== from && shape.geom && !['line', 'arrow'].includes(shape.recognized)).map(shape => _rapierDrawShapeBBoxIn(shape, recipe)).filter(Boolean);
	const tangent = step[0] ? 'ay' : 'ax', normal = step[0] ? 'ax' : 'ay', perp = [step[1] ? 1 : 0, step[0] ? 1 : 0];
	const branch = recipe.shapes.filter(shape => shape.recognized === 'arrow' && shape.bind?.start?.to === from.id && shape.bind.end?.to !== from.id && shape.bind.start[normal] === (step[0] + step[1] + 1) / 2);
	const across = perp[0] ? box.maxX - box.minX + gap : box.maxY - box.minY + gap;
	let dx = 0, dy = 0, free = false;
	for (let i = 1; i <= 24; i++) {
		const beside = i % 2 ? (1 - i) / 2 : i / 2;
		dx = branch.length ? step[0] * along + perp[0] * across * beside : step[0] * along * i; dy = branch.length ? step[1] * along + perp[1] * across * beside : step[1] * along * i;
		if (!taken.some(b => b.minX < box.maxX + dx + gap / 2 && b.maxX > box.minX + dx - gap / 2 && b.minY < box.maxY + dy + gap / 2 && b.maxY > box.minY + dy - gap / 2)) { free = true; break; }
	}
	if (!free) return;
	const next = JSON.parse(JSON.stringify(from)), g = next.geom;
	for (const key of ['label', 'labelIn', 'labelPos', 'labelBeside', 'labelGrow', 'step', 'group']) delete next[key];
	const diagram = globalThis.RapierDrawCore.RAPIER_DRAW_DIAGRAM;
	const outcome = from.ink === diagram.accent[0] && !from.authorStyle?.fill && from.authorInk !== true;
	Object.assign(next, { id: _rapierDrawNextId(), stroke: null, seed: _rapierDrawMintSeed() });
	next.geom = g.p ? { ...g, p: g.p.map(p => [p[0] + dx, p[1] + dy]) } : { ...g, cx: g.cx + dx, cy: g.cy + dy };
	const port = ([x, y]) => ({ ax: (x + 1) / 2, ay: (y + 1) / 2 });
	const arrow = { id: _rapierDrawNextId(), stroke: null, recognized: 'arrow', asDrawn: false, brush: 'ink', style: _rapierDrawDefaultStyle('arrow'), route: 'auto',
		geom: { x1: (box.minX + box.maxX + step[0] * (box.maxX - box.minX)) / 2, y1: (box.minY + box.maxY + step[1] * (box.maxY - box.minY)) / 2, x2: 0, y2: 0 },
		bind: { start: { to: from.id, ...port(step) }, end: { to: next.id, ...port([-step[0], -step[1]]) } },
		seed: _rapierDrawMintSeed(), smooth: _rapierDrawSmoothLevel(state.smooth), nib: _rapierDrawNibLevel(state.nib) };
	if (state.ink) arrow.ink = state.ink;
	arrow.geom.x2 = arrow.geom.x1 + step[0] * gap; arrow.geom.y2 = arrow.geom.y1 + step[1] * gap;
	const centre = shape => { const b = _rapierDrawShapeBBoxIn(shape, recipe); return perp[0] ? b.minX + b.maxX : b.minY + b.maxY; };
	const order = branch.map(shape => [shape, centre(recipe.shapes.find(child => child.id === shape.bind.end.to) || shape)]).concat([[arrow, perp[0] ? box.minX + box.maxX + 2 * dx : box.minY + box.maxY + 2 * dy]]).sort((a, b) => a[1] - b[1]).map(([shape]) => shape);
	const spread = new Map(order.map((shape, i) => [shape, (i + 1) / (order.length + 1)]));
	const diamondPorts = from.recognized === 'diamond' && order.length > 1 ? (() => {
		const sides = perp[0] ? [{ ax: 0, ay: .5 }, { ax: 1, ay: .5 }] : [{ ax: .5, ay: 0 }, { ax: .5, ay: 1 }], flow = port(step);
		const at = order.length === 3 ? [sides[0], flow, sides[1]] : order.map((_, i) => sides[i < order.length / 2 ? 0 : 1]);
		return new Map(order.map((shape, i) => [shape, at[i]]));
	})() : null;
	const startFor = (shape, start) => diamondPorts?.has(shape) ? { ...start, ...diamondPorts.get(shape) } : { ...start, [tangent]: spread.get(shape) };
	arrow.bind.start = startFor(arrow, arrow.bind.start);
	const shapes = recipe.shapes.map(shape => spread.has(shape) ? { ...shape, bind: { ...shape.bind, start: startFor(shape, shape.bind.start) } } : shape === from && outcome ? { ...shape, ink: diagram.box[0] } : shape);
	const candidate = _rapierDrawAdmitCreation({ ...recipe, shapes: shapes.concat([next, arrow]) });
	if (!candidate) return;
	state.recipe = candidate;
	_rapierDrawSetSelection([next.id]);
	_rapierDrawRevealBox(_rapierDrawShapeBBoxIn(next, candidate));
	_rapierDrawRenderAll();
	_rapierDrawEditLabelInPlace(candidate.shapes.find(shape => shape.id === next.id), { before, selection: [from.id] });
}
function _rapierDrawRevealBox(box) {
	const vb = _rapierDrawState.svgRoot?.viewBox.baseVal, v = _rapierDrawView();
	if (!box || !vb?.width) return;
	const m = Math.min(vb.width, vb.height) / 8;
	const shift = (lo, hi, start, span) => lo - m < start ? lo - m - start : hi + m > start + span ? Math.min(hi + m - start - span, lo - m - start) : 0;
	const sx = shift(box.minX, box.maxX, vb.x, vb.width), sy = shift(box.minY, box.maxY, vb.y, vb.height);
	if (sx || sy) { v.x += sx; v.y += sy; _rapierDrawApplyView(); }
}
function _rapierDrawCommitStroke(points, options = {}) {
	if (points.length < 2) return;

	const state = _rapierDrawState;
	const penMode = !!_rapierDrawState.pen;
	const smoothLevel = _rapierDrawSmoothLevel(_rapierDrawState.smooth);
	let recognized;
	if (options.dot) recognized = { kind: 'ink' };
	else if (penMode) recognized = smoothLevel === 0 ? { kind: 'ink' } : (_rapierDrawRecognize(points) || { kind: 'ink' });
	else recognized = _rapierDrawRecognize(points) || { kind: 'ink' };

	if ((recognized.kind === 'line' || recognized.kind === 'arrow') && recognized.geom) _rapierDrawSnapLineGeom(recognized.geom);

	else if (recognized.kind === 'arc' && recognized.geom) _rapierDrawSnapArcGeom(recognized.geom, null);

	else if (recognized.geom) recognized.geom = _rapierDrawRestGeom(recognized.kind, recognized.geom, null);

	const bind = (recognized.kind === 'arrow' || recognized.kind === 'line') && recognized.geom ? _rapierDrawBindArrowEnds(recognized.geom) : null;
	const strokeIndex = state.recipe.strokes.length;

	const varied = _rapierDrawStrokeHasPressure(points);
	const strokeEntry = { pts: points.map(p => varied
		? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] || 0), Math.round((p[3] ?? 0.5) * 100) / 100]
		: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] || 0)]) };
	const id = _rapierDrawNextId();
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
	if (!kept.includes(_rapierDrawState.canvasShapeId)) _rapierDrawState.canvasShapeId = kept.at(-1) || null;
	_rapierDrawState.menuShapeId = kept.at(-1) || null;
	if (kept.length) _rapierDrawState.paintChosenId = _rapierDrawSelectedPaint(kept);
	_rapierDrawSyncNibRow();
	_rapierDrawSyncSmoothRow();
	_rapierDrawSyncTextEffect();
	_rapierDrawUpdateInkBtn();
}
function _rapierDrawSelectedShapes() {
	const ids = new Set(_rapierDrawSelection());
	return (_rapierDrawState.recipe?.shapes || []).filter(shape => ids.has(shape.id));
}
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
	if (which === 'nib' && _rapierDrawTool() === 'water') {
		const input = row.querySelector('input'), word = row.querySelector('output');
		const shown = _rapierWaterEngine().waterHandUi(_rapierWaterState().size);
		input.min = '0'; input.max = '100'; input.value = String(shown); _rapierDrawSeekSync(input);
		word.textContent = String(shown); input.setAttribute('aria-valuetext', word.textContent);
		row.querySelector('label').textContent = 'Size · Brush';
		return;
	}
	if (which === 'nib' && _rapierDrawTool() === 'paint') {
		const input = row.querySelector('input'), word = row.querySelector('output');
		input.min = '0'; input.max = '100'; input.value = String(_rapierPaintSize()); _rapierDrawSeekSync(input);
		word.textContent = _rapierPaintSizeWord(); input.setAttribute('aria-valuetext', word.textContent);
		row.querySelector('label').textContent = 'Size · Brush';
		return;
	}
	const state = _rapierDrawState, shapes = _rapierDrawSelectedShapes(), normalize = which === 'nib' ? _rapierDrawNibLevel : _rapierDrawSmoothLevel;
	const shown = shape => normalize(shape[which] ?? state.recipe?.[which] ?? state[which]);
	const level = which === 'nib' && _rapierDrawTool() === 'erase' ? normalize(state.eraseNib) : shapes.length ? shown(shapes[0]) : normalize(state[which]);
	const mixed = shapes.some(shape => shown(shape) !== level);
	const input = row.querySelector('input'), word = row.querySelector('output');
	if (which === 'nib') { input.min = String(RAPIER_DRAW_NIB_MIN); input.max = String(RAPIER_DRAW_NIB_MAX); }
	input.value = String(level); _rapierDrawSeekSync(input);
	word.textContent = mixed ? 'Mixed' : which === 'nib' ? String(level) : _rapierDrawSmoothWord(level);
	input.setAttribute('aria-valuetext', word.textContent);
	row.querySelector('label').textContent = (which === 'nib' ? 'Width' : 'Smooth') + (shapes.length ? ' · ' + (shapes.length === 1 ? 'Shape' : shapes.length) : '');
}
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
function _rapierDrawSetSetting(which, value) {
	if (which === 'nib' && _rapierDrawTool() === 'water') { _rapierWaterSet('size', _rapierWaterEngine().waterHandFromUi(value)); _rapierDrawSyncSetting('nib'); return; }
	if (which === 'nib' && _rapierDrawTool() === 'paint') { _rapierPaintSetSize(value); _rapierDrawSyncSetting('nib'); return; }
	const n = (which === 'nib' ? _rapierDrawNibLevel : _rapierDrawSmoothLevel)(value);
	const state = _rapierDrawState, recipe = state.recipe, shapes = _rapierDrawSelectedShapes();
	if (which === 'nib' && _rapierDrawTool() === 'erase') {
		if (state.eraseNib !== n) { state.eraseNib = n; _rapierDrawRemember('eraseNib', n); }
		_rapierDrawSyncSetting('nib');
		return;
	}
	if (!shapes.length) {
		if (state[which] !== n) { state[which] = n; _rapierDrawRemember(which === 'nib' && state.notes ? 'notesNib' : which, n); }
		_rapierDrawSyncSetting(which);
		return;
	}
	const applicable = shapes.filter(shape => which !== 'nib' && which !== 'smooth' || (shape.recognized !== 'text' && shape.recognized !== 'paint' && shape.recognized !== 'ornament'));
	if (!applicable.length) { _rapierDrawSyncSetting(which); return; }
	const ids = new Set(_rapierDrawGroupSelection(recipe, applicable.map(shape => shape.id)));
	const changed = recipe.shapes.some(shape => ids.has(shape.id) && (shape.recognized !== 'text' && shape.recognized !== 'paint' && shape.recognized !== 'ornament') && (shape[which] ?? recipe[which] ?? state[which]) !== n);
	if (!changed) { _rapierDrawSyncSetting(which); return; }
	const edit = state.settingEdit;
	if (_rapierDrawCommand(() => { for (const shape of state.recipe.shapes) if (ids.has(shape.id) && (shape.recognized !== 'text' && shape.recognized !== 'paint' && shape.recognized !== 'ornament')) globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {[which]: n}); }, !edit?.changed, false) && edit) edit.changed = true;
	_rapierDrawSyncSetting(which);
}
const RAPIER_DRAW_TEXT_DEFAULT = Object.freeze({ textSize: 24, textFont: 'sans', lineHeight: 1.25, letterSpacing: 0, wordSpacing: 0, textBold: false, textItalic: false, textUnderline: false, textKern: true, textCase: '', textFigures: '', textEffect: '', effectFlower: '', effectStem: '', labelAlign: 'start' });
const RAPIER_DRAW_TEXT_CASES = [['', 'Aa', 'As typed'], ['upper', 'AA', 'Capitals'], ['small', 'Aa', 'Small capitals'], ['lower', 'aa', 'Lowercase']];
const RAPIER_DRAW_TEXT_FIGURES = { oldstyle: 'Old style', lining: 'Lining', tabular: 'Tabular' };
function _rapierDrawEffectGlyph(effect = 'pressed', style = null) {
	if (effect === 'garden') return _rapierDrawGlyph({ id: 'effect-sample', recognized: 'text', stroke: null, brush: 'ink', asDrawn: false, style: null, label: 'a', textSize: 22, textFont: 'serif', textBold: true, labelAlign: 'middle', textEffect: 'garden', textEffectSeed: 7, ...(style?.effectFlower ? { effectFlower: style.effectFlower } : {}), ...(style?.effectStem ? { effectStem: style.effectStem } : {}), geom: { cx: 20, cy: 32 } }) || RAPIER_DRAW_ICONS.garden;
	return _rapierDrawGlyph({ id: 'effect-sample', recognized: 'text', stroke: null, brush: 'ink', asDrawn: false, style: null, label: 'P', textSize: 34, textFont: 'serif', textBold: true, labelAlign: 'middle', textEffect: 'pressed', geom: { cx: 20, cy: 20 } });
}
function _rapierDrawGardenColour(kind, chosen) {
	const [light, dark] = GARDEN_COLOURS[kind];
	if (!_rapierDrawDarkChrome()) return chosen || light;
	return chosen ? (typeof _rapierDeriveDarkColor === 'function' ? _rapierDeriveDarkColor(chosen) : chosen) : dark;
}
function _rapierDrawLetterSets() { const sets = globalThis.RapierDrawLetters?.LETTER_SETS || []; return ['field', 'leaf', 'arabesque', 'relief'].map(id => sets.find(set => set.id === id)).filter(Boolean); }
function _rapierDrawLetterFont(id) { return /^letters:/.test(id) && _rapierDrawLetterSets().some(set => 'letters:' + set.id === id); }
function _rapierDrawLetterGlyph(set) {
	const sample = set && globalThis.RapierDrawLetterPreviews.LETTER_PREVIEWS[set.id];
	return sample ? '<svg class="rapier-draw-glyph" viewBox="0 0 ' + sample.glyph[0] + ' ' + sample.em + '" aria-hidden="true"><path fill="currentColor" transform="translate(' + sample.bearing + ',0)" d="' + sample.glyph[1] + '"/></svg>' : '';
}
const RAPIER_DRAW_LETTERS_URL = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.30/letters/';
const _rapierDrawLettersDoor = { allowed: false, asking: null, providers: new Map(), bringing: new Map() };
function _rapierDrawLettersProvider(set) {
	const door = _rapierDrawLettersDoor;
	if (!door.providers.has(set.id) && globalThis.RapierPluginLoader) {
		window.addEventListener('rapier:letters-' + set.id + 'plugin', event => {
			if (door.asking?.set === set) _rapierDrawLettersPaint();
			if (event.detail?.status === 'ready') void _rapierDrawLettersBring(set);
		});
		door.providers.set(set.id, RapierPluginLoader.files({ key: 'letters-' + set.id, noun: set.name + ' letter set', dash: ' — ', version: set.id + ' ' + set.sha384,
			files: [{ name: set.id, flat: 'letters-' + set.id + '.json', url: RAPIER_DRAW_LETTERS_URL + set.id + '.json', bytes: set.bytes, sri: set.sha384 }] }));
	}
	return door.providers.get(set.id) || null;
}
function _rapierDrawLettersWake() { try { for (const set of _rapierDrawLetterSets()) _rapierDrawLettersProvider(set); } catch (_) {} }
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
	closeDialog(document.getElementById('letters-plugin-overlay'));
	void _rapierDrawLettersBring(asking.set, true).finally(_rapierPluginProgress('letters-' + asking.set.id, asking.set.name));
}
function _rapierDrawLettersDismiss() {
	_rapierDrawLettersDoor.asking = null;
	closeDialog(document.getElementById('letters-plugin-overlay'));
}
function _rapierDrawLettersPaint() {
	const set = _rapierDrawLettersDoor.asking?.set, status = set && _rapierDrawLettersProvider(set)?.status;
	if (!set) return;
	const busy = status === 'downloading' || status === 'installing', error = status === 'error';
	const hostWords = phase => window.RapierPlatform?.resources.installMessage?.('letters', phase) || '';
	document.getElementById('letters-plugin-title').textContent = busy ? 'Downloading ' + set.name : error ? set.name + ' did not arrive' : 'Download ' + set.name + '?';
	document.getElementById('letters-plugin-body').textContent = error
		? hostWords('error') || 'Rapier could not reach or verify ' + set.name + '. Your words stay in the serif until it arrives.'
		: hostWords('prompt') || '• ' + set.name + ', a Draw letter set.\n• ' + Math.round(set.bytes / 1000) + ' KB, once.\n• Works offline.';
	document.getElementById('letters-plugin-body').style.whiteSpace = 'pre-line';
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
const RAPIER_DRAW_TEXT_SIZE_MIN = 8, RAPIER_DRAW_TEXT_SIZE_MAX = 240;
function _rapierDrawTextDefaults() {
	const state = _rapierDrawState;
	if (!state.textDefaults) {
		const style = state.textDefaults = { ...RAPIER_DRAW_TEXT_DEFAULT };
		let saved; try { saved = JSON.parse(_rapierDrawRemembered('textDefaults')); } catch (_) {}
		if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return style;
		for (const [key, min, max] of [['textSize', 6, 512], ['lineHeight', 1, 2.5], ['letterSpacing', -.2, .6], ['wordSpacing', -.2, 1]]) {
			if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) style[key] = _rapierDrawClamp(saved[key], min, max);
		}
		for (const key of ['textBold', 'textItalic', 'textUnderline', 'textKern']) if (typeof saved[key] === 'boolean') style[key] = saved[key];
		if (typeof saved.textFont === 'string' && /^(?:sans|serif|mono|f[0-9a-f]{24}|letters:[a-z][a-z0-9-]{0,31})$/.test(saved.textFont)) style.textFont = saved.textFont;
		for (const [key, values] of [['textCase', ['', 'upper', 'lower', 'small']], ['textFigures', ['', ...Object.keys(RAPIER_DRAW_TEXT_FIGURES)]],
			['textEffect', ['', 'pressed', 'garden']], ['labelAlign', ['start', 'middle', 'end']]]) if (values.includes(saved[key])) style[key] = saved[key];
		for (const key of ['effectFlower', 'effectStem']) if (typeof saved[key] === 'string' && /^#[\da-f]{6}$/i.test(saved[key])) style[key] = saved[key].toLowerCase();
	}
	return state.textDefaults;
}
function _rapierDrawTextSpacingWord(value) {
	const n = Math.round(Number(value) * 100);
	return n === 0 ? 'Normal' : (n > 0 ? '+' : '') + n + '%';
}
function _rapierDrawFontControls(style, selection = false, effects = true) {
	const fonts = _rapierDrawOfferedFonts(), chosen = style.textFont || 'sans', sets = _rapierDrawLetterSets();
	const attr = id => selection ? 'data-draw-menu-act="property" data-draw-property="textFont" data-draw-value="' + _rapierDrawEscapeAttr(id) + '"' : 'data-draw-text-font="' + _rapierDrawEscapeAttr(id) + '"';
	const fontButton = (id, word) => '<button type="button" class="rapier-draw-chip rapier-draw-font-choice" ' + attr(id) + ' aria-pressed="' + (id === chosen) + '" style="font-family:' + _rapierDrawEscapeAttr(globalThis.RapierDrawFonts.fontFamily(id, fonts)) + '">' + _rapierDrawEscapeAttr(word) + '</button>';
	const add = '<button type="button" class="rapier-draw-chip rapier-draw-font-add" ' + (selection ? 'data-draw-menu-act="font-upload"' : 'data-draw-act="fontUpload"') + '>' + RAPIER_DRAW_ICONS.upload + '<span>Add</span></button>';
	return '<div class="rapier-draw-font-controls"><div class="rapier-draw-font-grid">' + [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([id, word]) => fontButton(id, word)).join('') +
		(fonts.length ? '<details class="rapier-draw-my-fonts"><summary class="rapier-draw-chip"' + (fonts.some(font => font.id === chosen) ? ' aria-current="true"' : '') + '>My Fonts<span class="rapier-draw-font-chevron">' + RAPIER_DRAW_ICONS.chevron + '</span></summary><div class="rapier-draw-font-menu">' + fonts.map(font => fontButton(font.id, font.name)).join('') + add + '</div></details>' : add) + '</div>' +
		(sets.length ? '<div class="rapier-draw-letters" role="group" aria-label="Letter sets"><span class="rapier-draw-chip-head">Letter sets</span>' + sets.map(set => '<button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-letter" ' + attr('letters:' + set.id) + ' aria-label="' + _rapierDrawEscapeAttr(set.name) + '" aria-pressed="' + ('letters:' + set.id === chosen) + '">' + _rapierDrawLetterGlyph(set) + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(set.name) + '</span></button>').join('') + '</div>' : '') +
		(effects ? '<div class="rapier-draw-effects" role="group" aria-label="Effects"><span class="rapier-draw-chip-head">Effects</span><button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-effect" ' + (selection ? 'data-draw-menu-act="property" data-draw-property="textEffect" data-draw-value="' + (style.textEffect === 'pressed' ? '' : 'pressed') + '"' : 'data-draw-text-effect="pressed"') + ' aria-label="Pressed" aria-pressed="' + (style.textEffect === 'pressed') + '">' + _rapierDrawEffectGlyph() + '<span class="rapier-draw-chip-name">Pressed</span></button>' +
		'<button type="button" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-effect" ' + (selection ? 'data-draw-menu-act="property" data-draw-property="textEffect" data-draw-value="' + (style.textEffect === 'garden' ? '' : 'garden') + '"' : 'data-draw-text-effect="garden"') + ' aria-label="Garden" aria-pressed="' + (style.textEffect === 'garden') + '">' + _rapierDrawEffectGlyph('garden', style) + '<span class="rapier-draw-chip-name">Garden</span></button>' +
		[['flower', 'Flower', style.effectFlower], ['stem', 'Stem', style.effectStem]].map(([kind, word, chosen]) => '<label class="rapier-draw-chip rapier-draw-effect rapier-draw-garden-colour" data-draw-garden-colour="' + kind + '"' + (style.textEffect === 'garden' ? '' : ' hidden') + '><span class="rapier-draw-garden-dot" style="background:' + _rapierDrawEscapeAttr(_rapierDrawGardenColour(kind, chosen)) + '"></span><input type="color" aria-label="' + word + ' color" value="' + _rapierDrawEscapeAttr(chosen || GARDEN_COLOURS[kind][0]) + '" data-draw-colour="' + kind + '"><span class="rapier-draw-chip-name">' + word + '</span></label>').join('') + '</div>' : '') + '</div>';
}
function _rapierDrawRenderTextFontPanel() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="textFont"]');
	if (!panel) return;
	const style = _rapierDrawTextDefaults(), available = _rapierDrawOfferedFonts();
	if (!['sans', 'serif', 'mono'].includes(style.textFont) && !available.some(font => font.id === style.textFont) && !_rapierDrawLetterFont(style.textFont)) style.textFont = 'sans';
	if (panel.hidden) return;
	const focused = panel.contains(document.activeElement) ? document.activeElement : null;
	const focusKey = focused && ['data-draw-text-font','data-draw-text-figures','data-draw-text-effect','data-draw-colour','data-draw-act'].find(key => focused.hasAttribute(key));
	const focusValue = focusKey ? focused.getAttribute(focusKey) : '';
	panel.innerHTML = _rapierDrawFontControls(style) + _rapierDrawFiguresRow(style.textFont, available, style.textFigures, id => '<button type="button" class="rapier-draw-chip rapier-draw-text-choice" data-draw-text-figures="' + id + '" aria-pressed="' + (id === style.textFigures) + '">' + (id ? RAPIER_DRAW_TEXT_FIGURES[id] : 'Default') + '</button>');
	if (focused) {
		const next = focusKey ? panel.querySelector('[' + focusKey + '="' + CSS.escape(focusValue) + '"]') : panel.querySelector('summary');
		const target = next?.closest('details:not([open])')?.querySelector('summary') || next || state.surface.querySelector('[data-draw-act="textFont"]');
		target?.focus({preventScroll: true});
	}
}
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
function _rapierDrawEffectTargets() { return _rapierDrawSelectedShapes().filter(shape => shape.recognized === 'text' && !shape.locked); }
function _rapierDrawSyncTextEffect() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="textFont"]');
	if (!panel) return;
	const targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	_rapierDrawSyncGardenColours(panel, targets, style);
	for (const button of panel.querySelectorAll('[data-draw-text-effect]')) {
		const id = button.dataset.drawTextEffect, on = targets.length ? targets.every(shape => shape.textEffect === id) : style.textEffect === id;
		button.setAttribute('aria-pressed', String(on));
		const ink = _rapierDrawShapeInk({ ink: targets.at(-1)?.ink || state.ink }), dark = _rapierDrawDarkChrome() && typeof _rapierDeriveDarkColor === 'function';
		const sample = button.querySelector('.rapier-draw-glyph');
		if (sample && id !== 'garden') sample.style.color = ink === _rapierDrawShapeInk({}) ? '' : dark ? _rapierDeriveDarkColor(ink) : ink;
	}
}
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
function _rapierDrawGardenProperties(shape, style) {
	const properties = {textEffectSeed: Number.isInteger(shape.textEffectSeed) ? shape.textEffectSeed : Math.floor(Math.random() * 1e9)};
	for (const key of ['effectFlower', 'effectStem']) if (style[key] && !shape[key]) properties[key] = style[key];
	return properties;
}
function _rapierDrawPlantGarden(shape, style) {
	globalThis.RapierDrawEdit.setProperties(shape, _rapierDrawState.recipe, _rapierDrawGardenProperties(shape, style));
}
function _rapierDrawSetGardenColour(scope, ink, continuous) {
	const state = _rapierDrawState, key = scope === 'flower' ? 'effectFlower' : 'effectStem', hex = _rapierDrawReadHex(ink);
	if (!hex || state.finishing) return;
	const targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	style[key] = hex;
	_rapierDrawRemember('textDefaults', JSON.stringify(style));
	if (targets.length && !_rapierDrawSelectionLocked(targets) && targets.some(shape => shape[key] !== hex)) {
		if (_rapierDrawCommand(() => { for (const shape of _rapierDrawEffectTargets()) globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {[key]: hex}); }, !continuous || state.colourEdit !== state.undoStack.at(-1), !continuous) && continuous) state.colourEdit = state.undoStack.at(-1);
	}
	if (!continuous) _rapierDrawRenderTextFontPanel();
	_rapierDrawSyncTextEffect();
}
function _rapierDrawToggleTextEffect(id) {
	const state = _rapierDrawState, targets = _rapierDrawEffectTargets(), style = _rapierDrawTextDefaults();
	const on = !(targets.length ? targets.every(shape => shape.textEffect === id) : style.textEffect === id);
	style.textEffect = on ? id : '';
	_rapierDrawRemember('textDefaults', JSON.stringify(style));
	if (targets.length) _rapierDrawCommand(() => { for (const shape of _rapierDrawEffectTargets()) globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {textEffect: on ? id : null, ...(on && id === 'garden' ? _rapierDrawGardenProperties(shape, style) : {})}); });
	_rapierDrawSyncTextEffect();
	return state;
}
function _rapierDrawSetTextDefault(key, value, asked = false) {
	if (key === 'textFont' && !asked && _rapierDrawLettersAsk(value, () => _rapierDrawSetTextDefault(key, value, true))) return;
	const state = _rapierDrawState, style = _rapierDrawTextDefaults();
	if (key === 'textSize') style.textSize = _rapierDrawClamp(Math.round(Number(value) || 24), 6, 512);
	else if (key === 'textFont' && (['sans', 'serif', 'mono'].includes(value) || _rapierDrawOfferedFonts().some(font => font.id === value) || _rapierDrawLetterFont(value))) style.textFont = value;
	else if (key === 'lineHeight') style.lineHeight = _rapierDrawClamp(Number(value) || 1.25, 1, 2.5);
	else if (key === 'letterSpacing') style.letterSpacing = _rapierDrawClamp(Number(value) || 0, -.2, .6);
	else if (key === 'wordSpacing') style.wordSpacing = _rapierDrawClamp(Number(value) || 0, -.2, 1);
	else if (['textBold', 'textItalic', 'textUnderline', 'textKern'].includes(key)) style[key] = !!value;
	else if (key === 'textCase' && RAPIER_DRAW_TEXT_CASES.some(([id]) => id === value)) style.textCase = value;
	else if (key === 'textFigures' && (!value || Object.hasOwn(RAPIER_DRAW_TEXT_FIGURES, value))) style.textFigures = value;
	else if (key === 'labelAlign' && ['start', 'middle', 'end'].includes(value)) style.labelAlign = value;
	_rapierDrawRemember('textDefaults', JSON.stringify(style));
	_rapierDrawSyncTextPanels();
	if (key === 'textFont') { state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error')); }
}

function _rapierDrawEraseSoftness() { return _rapierDrawClamp(Math.round(Number(_rapierDrawState.eraseSoftness) || 0), 0, 100); }
function _rapierDrawEraseSoftnessWord(value = _rapierDrawEraseSoftness()) { return value < 18 ? 'Hard' : value > 78 ? 'Soft' : value < 50 ? 'Firm' : 'Feather'; }
function _rapierDrawSyncEraseEdge() {
	const row = _rapierDrawState.surface?.querySelector('.rapier-draw-erase-edge'); if (!row) return;
	const input = row.querySelector('input'), output = row.querySelector('output'), value = _rapierDrawEraseSoftness();
	input.value = String(value); output.textContent = _rapierDrawEraseSoftnessWord(value); input.setAttribute('aria-valuetext', output.textContent); _rapierDrawSeekSync(input);
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
function _rapierDrawDarkPaper() { return !_rapierDrawState.paper && (typeof _rapierBgCurrent !== 'function' || _rapierBgCurrent()?.kind !== 'paper') && (_rapierDrawState.recipe?.paper === 'black' || !document.body.classList.contains('light')); }
function _rapierDrawInvertInk() {
	return _rapierDrawDarkPaper() && (document.body.classList.contains('light') || RapierPreferences.read('invertImageAlpha'));
}
function _rapierDrawPaperInk() {
	if (_rapierDrawDarkPaper() && document.body.classList.contains('light')) return '#fafafa';
	const text = getComputedStyle(document.body).getPropertyValue('--color-text').trim();
	return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
}
function _rapierDrawDisplayInk(hex) {
	if (!_rapierDrawInvertInk() || typeof _rapierDeriveDarkColor !== 'function' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
	const low = hex.toLowerCase();
	return low === _rapierDrawShapeInk({}) ? _rapierDrawPaperInk() || _rapierDeriveDarkColor(low) : _rapierDeriveDarkColor(low);
}
function _rapierDrawDisplayShape(shape) {
	if (shape.recognized !== 'paint' || typeof _rapierPaintShownAs === 'undefined') return shape;
	const raster = _rapierPaintShownAs.get(shape.raster) || shape.raster;
	const shown = typeof _rapierPaintBlobURL === 'function' ? _rapierPaintBlobURL(raster) : raster;
	return shown !== shape.raster ? { ...shape, raster: shown } : shape;
}
function _rapierDrawDisplayMarkup(html) {
	if (typeof _rapierPaintShowable === 'function') html = _rapierPaintShowable(html);
	if (typeof _rapierPaintBlobSources === 'function') html = _rapierPaintBlobSources(html);
	return html;
}
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
	if (!_rapierDrawInvertInk() || !state.recipe) { if (style.textContent) style.textContent = ''; return; }
	const rules = _rapierDrawDarkRules(state.darkUsed || new Set(), state.recipe, { currentColor: !!state.darkCurrentColor, paint: !!state.darkPaint });
	const text = rules.map(rule => '.rapier-draw-canvas ' + rule).join('');
	if (style.textContent !== text) style.textContent = text;
}
function _rapierDrawDarkChrome() { return !document.body.classList.contains('light'); }
function _rapierDrawChromeMarkup(html) {
	if (!html) return html;
	const ink = _rapierDrawShapeInk({}), dark = _rapierDrawDarkChrome() && typeof _rapierDeriveDarkColor === 'function';
	return html.replace(/\b(fill|stroke|color|stop-color)="(#[0-9a-fA-F]{6})"/g, (match, attr, hex) => { const low = hex.toLowerCase(); return attr + '="' + (low === ink ? 'currentColor' : dark ? _rapierDeriveDarkColor(low) : low) + '"'; });
}

const _rapierDrawGlyphCache = new Map();
function _rapierDrawGlyph(shape, strokes = []) {
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
	if (kind === 'parabola') geom = { p: [[6, 10], [20, 50], [34, 10]] };
	else if (kind === 'arc') geom = { cx: 20, cy: 26, r: 14, a0: Math.PI, a1: Math.PI * 2 };
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
const RAPIER_DRAW_RECENT_KEY = 'rapier:draw.recentinks', RAPIER_DRAW_RECENT_MAX = 10;
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
	const accent = scope === 'next' && _rapierDrawTool() === 'paint' ? _rapierDrawAccentInk() : null;
	const words = [['#000000', 'Black'], ['#ffffff', 'White'], accent ? [accent, 'Accent'] : [scope === 'border' ? '#121212' : '', 'Default'], ...RAPIER_DRAW_INK_ORDER.map(id => [id, RAPIER_DRAW_INK_LABEL[id]])];
	const hex = _rapierDrawShapeInk({ ink });
	const clearRow = scope === 'next' && _rapierDrawTool() === 'paint', clearOn = clearRow && _rapierPaintHead().clear;
	return '<span class="rapier-draw-colour-editor" data-draw-colour-scope="' + scope + '">' +
		'<label class="rapier-draw-colour-custom" title="Choose any color"><input type="color" aria-label="Choose any color" value="' + hex + '" data-draw-colour="' + scope + '"></label>' +
		'<input class="rapier-draw-colour-hex" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" aria-label="Hex color" value="' + hex.toUpperCase() + '" data-draw-hex="' + scope + '">' +
		'<button type="button" class="rapier-draw-swatch rapier-draw-colour-copy" data-draw-colour-copy="' + scope + '" aria-label="Copy hex color"><span class="rapier-draw-dropper-glyph">' + RAPIER_DRAW_ICONS.copy + '</span><span class="rapier-draw-dropper-glyph rapier-draw-dropper-glyph--done">' + RAPIER_DRAW_ICONS.check + '</span></button>' +
		'<button type="button" class="rapier-draw-swatch rapier-draw-swatch--dropper" data-draw-act="dropper" data-draw-colour-scope="' + scope + '" aria-label="Pick a color off the drawing" data-tip="pick">' + RAPIER_DRAW_ICONS.dropper + '</button></span>' +
		'<span class="rapier-draw-palette" data-draw-palette="' + scope + '">' +
		(scope === 'border' ? '<button type="button" class="rapier-draw-swatch" data-draw-colour-value="" data-draw-colour-scope="border" aria-label="None" data-tip="none" aria-pressed="' + !ink + '">' + RAPIER_DRAW_ICONS.none + '</button>' : '') +
		words.map(([id, label]) => '<button type="button" class="rapier-draw-swatch" data-draw-colour-value="' + id + '" data-draw-colour-scope="' + scope + '" aria-label="' + label + '" data-tip="' + label.toLowerCase() + '" aria-pressed="' + (!clearOn && (ink || '').toLowerCase() === id.toLowerCase()) + '"><span style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: id })) + '"></span></button>').join('') +
		_rapierDrawRecentInks().map(value => '<button type="button" class="rapier-draw-swatch rapier-draw-swatch--recent" data-draw-colour-value="' + _rapierDrawEscapeAttr(value) + '" data-draw-colour-scope="' + scope + '" aria-label="Recent color ' + _rapierDrawEscapeAttr(value) + '" data-tip="recent" aria-pressed="' + (!clearOn && (ink || '').toLowerCase() === value.toLowerCase()) + '"><span style="background:' + _rapierDrawDisplayInk(value) + '"></span></button>').join('') +
		(clearRow ? '<button type="button" class="rapier-draw-swatch rapier-draw-swatch--clear" data-draw-clear aria-label="Clear: the brush erases" data-tip="erase" aria-pressed="' + clearOn + '"><span><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="1" y1="23" x2="23" y2="1"></line></svg></span></button>' : '') + '</span>' + (clearRow ? _rapierPaintMixMarkup(hex) : '');
}
const RAPIER_DRAW_DROPPER_LIFT = 56;
async function _rapierDrawOpenDropper(scope, found = null) {
	const state = _rapierDrawState, surface = state.surface, svg = state.svgRoot;
	if (!state.open || state.finishing || !surface || !svg || state.dropper) return;
	_rapierDrawCancelGesture();
	surface.focus({ preventScroll: true });
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
		if (keep && picked && !found) _rapierDrawChooseColour(scope, picked);
		else {
			if (scope === 'next') { state.ink = previousInk; state.inkChosen = previousChosen; }
			_rapierDrawUpdateInkBtn(); _rapierPaintUpdateStrip(); _rapierDrawUpdateMenu();
			if (keep && picked) found?.(picked);
		}
	};
	const session = { close };
	state.dropper = session;
	surface.classList.add('rapier-draw-sampling');
	if (row) row.hidden = true;
	try {
		const settled = _rapierPaintSettleOverflow(); if (settled) await settled;
		const flushing = _rapierPaintFlushRevision(); if (flushing) await flushing;
		if (state.dropper !== session || !state.open || state.session !== drawing) { close(false); return; }
		const source = JSON.stringify(state.recipe), refracted = state.recipe.effect?.type === 'refraction' || state.recipe.shapes.some(shape => shape.effect?.type === 'refraction');
		const text = _rapierPaintShowable(_rapierDrawBuildSVG(state.recipe, _rapierDrawMeasuredView, true, refracted ? {sourceOnly: true} : undefined));
		let image;
		if (refracted) {
			const rendered = await globalThis.RapierDrawRefraction.renderSVG(text, state.recipe, {backend: 'webgpu', displayRaster: url => _rapierPaintShownAs.get(url)});
			image = rendered.canvas;
		} else {
			image = new Image();
			image.src = 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(text));
			await image.decode();
		}
		if (state.dropper !== session || !state.open || state.session !== drawing || JSON.stringify(state.recipe) !== source) { close(false); return; }
		const rect = svg.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
		const c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(rect.width * dpr)); c.height = Math.max(1, Math.round(rect.height * dpr));
		const ctx = c.getContext('2d', { willReadFrequently: true });
		ctx.fillStyle = _rapierDrawReplayPaper(); ctx.fillRect(0, 0, 1, 1);
		const paper = ctx.getImageData(0, 0, 1, 1).data;
		ctx.clearRect(0, 0, 1, 1);
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
	pad.innerHTML = '<span class="rapier-draw-dropper-swatch" aria-hidden="true" hidden></span>' +
		'<div class="rapier-draw-dropper-bar">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-dropper-hex" data-draw-dropper="copy" hidden><span class="rapier-draw-dropper-chip" aria-hidden="true"></span><span class="rapier-draw-dropper-code"></span>' +
		'<span class="rapier-draw-dropper-glyph">' + RAPIER_DRAW_ICONS.copy + '</span><span class="rapier-draw-dropper-glyph rapier-draw-dropper-glyph--done">' + RAPIER_DRAW_ICONS.check + '</span></button>' +
		'<span class="rapier-draw-dropper-say" role="status">Touch a color</span>' +
		'<button type="button" class="rapier-draw-btn" data-draw-dropper="cancel">Cancel</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--done" data-draw-dropper="done" disabled>Use color</button></div>';
	stage.appendChild(pad);
	const swatch = pad.querySelector('.rapier-draw-dropper-swatch'), say = pad.querySelector('.rapier-draw-dropper-say');
	const copy = pad.querySelector('.rapier-draw-dropper-hex'), chip = pad.querySelector('.rapier-draw-dropper-chip'), code = pad.querySelector('.rapier-draw-dropper-code');
	const use = pad.querySelector('[data-draw-dropper="done"]');
	const sample = (clientX, clientY) => {
		const { rect, dpr, paper, data } = sheet, now = svg.getBoundingClientRect(), v = svg.viewBox.baseVal;
		if (['left', 'top', 'width', 'height'].some(key => now[key] !== rect[key]) || [v.x, v.y, v.width, v.height].some((n, i) => n !== sheet.view[i])) {
			close(false); showToast('The canvas moved. Open the color sampler again.', 'info'); return;
		}
		const x = Math.round((clientX - rect.left) * dpr), y = Math.round((clientY - rect.top) * dpr);
		if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
		const radius = _rapierDrawTool() === 'paint' ? Math.floor((_rapierDrawState.paintSampleSize || 1) / 2) : 0;
		const rgb = [0, 0, 0]; let count = 0;
		for (let py = Math.max(0, y - radius); py <= Math.min(data.height - 1, y + radius); py++) for (let px = Math.max(0, x - radius); px <= Math.min(data.width - 1, x + radius); px++) {
			const i = (py * data.width + px) * 4, a = data.data[i + 3] / 255; count++;
			for (let k = 0; k < 3; k++) rgb[k] += data.data[i + k] * a + paper[k] * (1 - a);
		}
		const hex = '#' + rgb.map(c => Math.round(c / count).toString(16).padStart(2, '0')).join('');
		picked = hex;
		if (scope === 'next') _rapierDrawSetColour(scope, picked, true);
		use.disabled = false;
		swatch.style.background = hex;
		const word = hex.toUpperCase();
		say.hidden = true; copy.hidden = false; delete copy.dataset.copied; chip.style.background = hex; code.textContent = word;
		copy.setAttribute('aria-label', 'Copy ' + word);
		swatch.style.left = _rapierDrawClamp(clientX - rect.left, 24, rect.width - 24) + 'px';
		swatch.style.top = Math.max(24, clientY - rect.top - RAPIER_DRAW_DROPPER_LIFT) + 'px';
		swatch.hidden = false;
	};
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
	let at = null;
	session.key = chord => {
		const step = {Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1]}[chord.replace(/^Shift\+/, '')];
		if (!step) return false;
		const { rect } = sheet, far = chord.startsWith('Shift+') ? 32 : 4;
		at ||= [rect.left + rect.width / 2, rect.top + rect.height / 2];
		at = [_rapierDrawClamp(at[0] + step[0] * far, rect.left, rect.right - 1), _rapierDrawClamp(at[1] + step[1] * far, rect.top, rect.bottom - 1)];
		sample(at[0], at[1]);
		if (picked) srAnnounce(picked.toUpperCase());
		return true;
	};
	if (document.activeElement === surface) pad.querySelector('[data-draw-dropper="cancel"]').focus({ preventScroll: true });
	_rapierDrawBindTap(pad, evt => {
		const act = evt.target.closest('[data-draw-dropper]')?.dataset.drawDropper;
		if (!act) return;
		evt.preventDefault(); evt.stopPropagation();
		if (act === 'copy') { if (picked) void _rapierDrawCopyHex(picked.toUpperCase(), copy, say); return; }
		close(act === 'done');
	});
}
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
const RAPIER_DRAW_PROP_WORD = {
	textSize: v => String(Math.round(Number(v))),
	lineHeight: v => 'x' + Number(v).toFixed(2).replace(/\.?0+$/, ''),
	letterSpacing: v => (Number(v) > 0 ? '+' : '') + Math.round(Number(v) * 100) + '%',
	wordSpacing: v => (Number(v) > 0 ? '+' : '') + Math.round(Number(v) * 100) + '%',
	inner: v => Math.round(Number(v) * 100) + '%',
	transparency: v => Math.round(Number(v) * 100) + '%'
};
function _rapierDrawTransparency(shape) { return Math.round((1 - (shape.opacity ?? 1)) * 100) / 100; }
function _rapierDrawSeekControl(name, word, min, max, step, value) {
	const id = 'rapier-draw-prop-' + name, say = RAPIER_DRAW_PROP_WORD[name] || String;
	return '<label class="rapier-draw-control rapier-draw-control--seek">' + word + '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + _rapierDrawEscapeAttr(String(value)) + '" data-draw-property="' + name + '" aria-label="' + word + '"><output class="rapier-draw-nib-word" for="' + id + '">' + say(value) + '</output></label>';
}
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
	const nib = state.surface?.querySelector('.rapier-draw-settings [data-draw-setting="nib"]');
	if (nib && _rapierDrawTool() === 'select') {
		nib.hidden = !!shape && shapes.every(item => item.recognized === 'ornament');
		nib.closest('.rapier-draw-settings')?.style.setProperty('--draw-settings-count', String(RAPIER_DRAW_TOOL_SETTINGS.select.length - (nib.hidden ? 1 : 0)));
	}
	if (_rapierDrawTool() !== 'select' || !shape || state.textEdit || state.gesture?.changed || state.marquee) {
		const focused = menu.contains(document.activeElement);
		menu.hidden = true; menu.classList.remove('rapier-draw-menu--sheet'); if (!shape) menu.innerHTML = '';
		if (focused && !state.textEdit) state.svgRoot.focus({preventScroll: true});
		return;
	}
	const pane = state.menuPane === 'text' && shapes.some(item => item.recognized === 'ornament') ? 'look' : state.menuPane, group = shapes.length > 1, brush = shape.brush || 'ink', locked = _rapierDrawSelectionLocked(shapes);
	const text = shape.recognized === 'text', paint = shape.recognized === 'paint' || shape.recognized === 'ornament', arrow = !group && ['line', 'arrow'].includes(shape.recognized);
	const stroke = _rapierDrawShapeStroke(shape, state.recipe), paintsInk = _rapierDrawShapePaintsInk(shape, state.recipe);
	const pressed = on => ' aria-pressed="' + !!on + '"';
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
			(group || shape.recognized === 'ornament' ? '' : _rapierDrawIconChip('label', 'type', text ? 'Edit text' : 'Label')) + _rapierDrawIconChip('copy', 'copy', 'Copy') + _rapierDrawIconChip('delete', 'trash', 'Delete');
	}
	html += '</span>';
	const sheet = !!(pane && !locked);
	if (sheet) {
		const tabs = [['look', 'Look'], ['size', 'Size'], ...(shapes.some(item => item.recognized === 'ornament') ? [] : [['text', 'Text']]), ...(arrow ? [['path', 'Path']] : []), ['arrange', 'Arrange']];
		html += '<span class="rapier-draw-menu-row rapier-draw-tabs" role="tablist" aria-label="Shape style">' + tabs.map(([id, word]) => _rapierDrawChip('pane', word, id, pane === id, ' role="tab" id="rapier-draw-tab-' + id + '" aria-controls="rapier-draw-pane" tabindex="' + (pane === id ? '0' : '-1') + '" aria-selected="' + (pane === id) + '"')).join('') + '</span><span class="rapier-draw-menu-row rapier-draw-pane" role="tabpanel" id="rapier-draw-pane" aria-labelledby="rapier-draw-tab-' + pane + '">';
		if (pane === 'look') {
			const border = shapes.every(_rapierDrawBorderActive), borderInk = shape.authorStyle?.stroke || shape.border;
			if (!border && state.menuColour === 'border') state.menuColour = false;
			html += '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon' + (state.menuColour === true ? ' rapier-draw-chip--active' : '') + '" data-draw-menu-act="colour" aria-label="Color" data-tip="color" aria-expanded="' + (state.menuColour === true) + '"><span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk(shape)) + '"></span></button>';
			if (border) html += '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon' + (state.menuColour === 'border' ? ' rapier-draw-chip--active' : '') + '" data-draw-menu-act="border" aria-label="Border" data-tip="border" aria-expanded="' + (state.menuColour === 'border') + '">' + (borderInk ? '<span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: borderInk })) + '"></span>' : RAPIER_DRAW_ICONS.none) + '</button>';
			if (!text && !paint) html += _rapierDrawIconChip('width', 'width', 'Width') + (paintsInk && brush === 'ink' ? _rapierDrawIconChip('smooth', 'smooth', 'Smooth') : '');
			if (state.menuColour) html += state.menuColour === 'border' ? _rapierDrawPalette(borderInk, 'border') : _rapierDrawPalette(shape.authorStyle ? _rapierDrawShapeInk(shape) : shape.ink, 'selection');
			if (!group && !text && !paint) {
				const editable = !shape.asDrawn && shape.recognized !== 'ink';
				const brushes = paintsInk ? _rapierDrawBrushesFor('ink') : editable ? _rapierDrawBrushesFor(shape.recognized, shape.stroke != null) : [];
				if (brushes.length > 1) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + brushes.map(id => _rapierDrawGlyphChip('brush', _rapierDrawBrushGlyph(paintsInk ? 'ink' : shape.recognized, id, shape), RAPIER_DRAW_BRUSH_LABEL[id], id, brush === id)).join('') + '</span>';
				if (editable && brush === 'ink') {
					const styles = arrow ? [['plain', 'Line'], ['arrow', 'Arrow'], ['dimension', 'Dimension']] : ['arc', 'parabola'].includes(shape.recognized) ? [] : [['outline', 'Outline'], ['hatch', 'Hatch'], ['stipple', 'Stipple'], ['solid', 'Solid']];
					if (styles.length) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + styles.map(([id, word]) => _rapierDrawGlyphChip('style', _rapierDrawKindGlyph(arrow ? 'arrow' : 'rect', { style: id }), word, id, shape.style === id)).join('') + '</span>';
					if (_rapierDrawDashActive(shape)) html += '<span class="rapier-draw-menu-row rapier-draw-glyph-row">' + [['', 'Solid line'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([id, word]) => _rapierDrawGlyphChip('dash', _rapierDrawKindGlyph('line', { dash: id || undefined }), word, id, (shape.dash || '') === id)).join('') + '</span>';
				}
			}
			html += _rapierDrawSeekControl('transparency', 'Transparency', 0, .95, .01, _rapierDrawTransparency(shape));
		} else if (pane === 'size') {
			html += _rapierDrawIconChip('bigger', 'bigger', 'Bigger') + _rapierDrawIconChip('smaller', 'smaller', 'Smaller') + _rapierDrawIconChip('turn', 'turn', 'Turn') +
				(!group && !['circle', 'arc'].includes(shape.recognized) ? _rapierDrawIconChip('proportions', 'proportions', 'Keep proportions', '', !!state.proportions, pressed(state.proportions)) : '') +
				_rapierDrawIconChip('center', 'center', 'Resize from center', '', !!state.resizeFromCenter, pressed(state.resizeFromCenter));
			if (shape.geom && ['line', 'arrow', 'triangle'].includes(shape.recognized)) html += _rapierDrawIconChip('angle', 'angle', 'Show angle', '', !!shape.angle, pressed(shape.angle));
			if (arrow) html += _rapierDrawIconChip('len', 'ruler', 'Show length', '', !!shape.len, pressed(shape.len));
			if (!group && shape.recognized === 'star') html += _rapierDrawSeekControl('inner', 'Star inset', .2, .7, .05, shape.geom.inner || .45);
		} else if (pane === 'text') {
			if (!group) html += _rapierDrawIconChip('label', 'type', shape.label ? 'Edit text' : 'Add text');
			const size = shape.textSize || (text ? 24 : 14);
			html += _rapierDrawSeekControl('textSize', 'Size', RAPIER_DRAW_TEXT_SIZE_MIN, Math.max(RAPIER_DRAW_TEXT_SIZE_MAX, size), 1, size) +
				_rapierDrawFontControls(shape, true, shapes.every(item => item.recognized === 'text'));
			html += '<span class="rapier-draw-menu-row">' + [['textBold', 'bold', 'Bold'], ['textItalic', 'italic', 'Italic'], ['textUnderline', 'underline', 'Underline']].map(([id, icon, word]) => _rapierDrawIconChip('text-toggle', icon, word, id, !!shape[id], pressed(shape[id]))).join('') +
				'<span class="rapier-draw-menu-gap"></span>' + [['start', 'align-left', 'Align left'], ['middle', 'align-center', 'Center'], ['end', 'align-right', 'Align right']].map(([id, icon, word]) => _rapierDrawIconChip('text-align', icon, word, id, (shape.labelAlign || (text ? 'start' : 'middle')) === id, pressed((shape.labelAlign || (text ? 'start' : 'middle')) === id))).join('') + '</span>';
			if (!group && !text && !arrow && !['arc', 'parabola'].includes(shape.recognized)) {
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
			if (group) html += _rapierDrawChoiceControl('align', 'Align', [['', 'Choose'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], '');
		}
		html += '</span>';
	}
	if (menu.hidden || state.menuHtml !== html) {
		const had = menu.contains(document.activeElement) ? document.activeElement.dataset.drawMenuAct : '', value = had ? document.activeElement.dataset.drawValue || '' : '';
		menu.innerHTML = html; menu.hidden = false; menu.classList.toggle('rapier-draw-menu--sheet', sheet); state.menuHtml = html;
		if (had) {
			const target = menu.querySelector('[data-draw-menu-act="' + had + '"][data-draw-value="' + CSS.escape(value) + '"]') || menu.querySelector('[data-draw-menu-act="' + had + '"]');
			(target?.closest('details:not([open])')?.querySelector('summary') || target || state.svgRoot).focus({preventScroll: true});
		}
		for (const input of menu.querySelectorAll('input[type="range"]')) _rapierDrawSeekWrap(input);
	}
	_rapierDrawPlaceMenu(_rapierDrawSelectionScreenBox());
}
function _rapierDrawVisibleTop() {
	const state = _rapierDrawState, top = state.svgRoot.getBoundingClientRect().top, row = state.surface?.querySelector('.rapier-draw-settings');
	return row && !row.hidden ? Math.max(top, row.getBoundingClientRect().bottom) : top;
}
function _rapierDrawPlaceMenu(box) {
	const state = _rapierDrawState, menu = state.menu;
	if (!menu || !box) return;
	if (menu.classList.contains('rapier-draw-menu--sheet')) { menu.style.cssText = ''; _rapierDrawMenuTouchAction(menu); return; }
	const margin = _rapierDrawCoarseSession() ? 14 : 8;
	const viewport = window.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
	const width = viewport?.width || window.innerWidth, bottom = top + (viewport?.height || window.innerHeight);
	const ceiling = Math.max(top, _rapierDrawVisibleTop()) + margin;
	menu.style.maxHeight = ''; menu.style.width = 'max-content'; menu.style.left = left + 'px';
	const menuWidth = Math.min(menu.offsetWidth, width - margin * 2);
	menu.style.width = menuWidth + 'px';
	menu.style.left = _rapierDrawClamp(box.left + box.width / 2, left + margin + menuWidth / 2, left + width - margin - menuWidth / 2) + 'px';
	const reachUp = Math.max(22, ...(state.handles || []).map(handle => box.top - handle.screen[1] + 22));
	const reachDown = Math.max(22, ...(state.handles || []).map(handle => handle.screen[1] - box.bottom + 22));
	const boxTop = box.top - reachUp, boxBottom = box.bottom + reachDown;
	const above = boxTop - 10 - ceiling, below = bottom - margin - boxBottom - 10;
	const room = Math.max(above, below), full = Math.max(44, bottom - margin - ceiling);
	menu.style.maxHeight = Math.min(full, Math.max(44, room)) + 'px';
	const height = menu.offsetHeight, up = below < height && (above >= height || above > below);
	menu.style.transform = 'translate(-50%,0)';
	let y = _rapierDrawClamp(up ? boxTop - height - 10 : boxBottom + 10, ceiling, Math.max(ceiling, bottom - height - margin));
	const center = Number.parseFloat(menu.style.left), natural = {left: center - menuWidth / 2, top: y, right: center + menuWidth / 2, bottom: y + height};
	const viewportBox = {left: left + margin, top: ceiling, right: left + width - margin, bottom: bottom - margin};
	const selected = new Set(_rapierDrawSelection()), rect = state.svgRoot.getBoundingClientRect(), vb = state.svgRoot.viewBox.baseVal, labels = [];
	for (const shape of state.recipe.shapes) {
		if (selected.has(shape.id) || shape.hidden || !shape.label) continue;
		const b = _rapierDrawTextLayout(shape, state.recipe).bounds;
		const a = _rapierDrawMapToScreen(b.minX, b.minY, rect, vb), z = _rapierDrawMapToScreen(b.maxX, b.maxY, rect, vb);
		const label = {left: a[0] - 8, top: a[1] - 8, right: z[0] + 8, bottom: z[1] + 8};
		if (RapierOcclusion.overlaps(label, viewportBox)) labels.push({id: 'label:' + shape.id, role: 'overlay', interactive: true, rect: label});
	}
	if (labels.some(label => RapierOcclusion.overlaps(label.rect, natural))) {
		const placed = RapierOcclusion.placeTransient({viewport: viewportBox, transient: {rect: natural}, surfaces: [
			{id: 'selection', role: 'overlay', interactive: true, rect: {left: box.left - 22, top: boxTop, right: box.right + 22, bottom: boxBottom}}, ...labels]});
		if (placed.status === 'placed') { menu.style.left = (placed.rect.left + menuWidth / 2) + 'px'; y = placed.rect.top; }
	}
	menu.style.top = y + 'px';
	_rapierDrawMenuTouchAction(menu);
}
function _rapierDrawMenuTouchAction(menu) { menu.style.touchAction = menu.scrollHeight > menu.clientHeight + 1 ? '' : 'none'; }
const RAPIER_DRAW_ZOOM_MIN = 0.2, RAPIER_DRAW_ZOOM_MAX = 8;
function _rapierDrawView() {
	const v = _rapierDrawState.view;
	return v && Number.isFinite(v.k) ? v : (_rapierDrawState.view = { x: 0, y: 0, k: 1 });
}
function _rapierDrawViewBase() {
	const state = _rapierDrawState, base = state.viewBase;
	if (base && Number.isFinite(base.w) && Number.isFinite(base.h) && base.w > 0 && base.h > 0) return base;
	const canvas = state.recipe?.canvas;
	return (state.viewBase = canvas ? { w: canvas.w, h: canvas.h } : { w: 1, h: 1 });
}
function _rapierDrawPaperView(recipe, frame = recipe.frame) {
	const canvas = recipe.canvas;
	const ink = recipe.effect?.strength || recipe.shapes.some(shape => shape.effect?.strength) ? _rapierDrawInkView({ ...recipe, frame: undefined }) : null;
	let x = 0, y = 0, r = canvas.w, b = canvas.h;
	if (ink) { x = Math.min(x, ink.x); y = Math.min(y, ink.y); r = Math.max(r, ink.x + ink.w); b = Math.max(b, ink.y + ink.h); }
	if (frame) { x = Math.min(x, frame.x); y = Math.min(y, frame.y); r = Math.max(r, frame.x + frame.w); b = Math.max(b, frame.y + frame.h); }
	return { x, y, w: r - x, h: b - y };
}
function _rapierDrawViewBaseReset(rect = _rapierDrawState.svgRoot?.getBoundingClientRect(), bars = 0) {
	const state = _rapierDrawState;
	if (!state.recipe?.canvas) return;
	const canvas = _rapierDrawPaperView(state.recipe);
	const W = Math.max(1, rect?.width || canvas.w), H = Math.max(1, (rect?.height || canvas.h) + bars), inset = Math.min(state.viewInset || 0, H / 2);
	const scale = Math.max(1e-6, Math.min(W / canvas.w, (H - inset) / canvas.h));
	state.viewBase = { w: W / scale, h: H / scale }; state.viewFit = { w: W, h: H };
	const v = _rapierDrawView();
	v.k = 1;
	v.x = canvas.x + (canvas.w - state.viewBase.w) / 2;
	v.y = canvas.y - (inset + (H - inset - canvas.h * scale) / 2) / scale;
}
function _rapierDrawViewFollowStage(rect = _rapierDrawState.svgRoot?.getBoundingClientRect()) {
	const state = _rapierDrawState, base = state.viewBase, fit = state.viewFit;
	if (!base || !rect?.width || !rect.height || fit && fit.w === rect.width && fit.h === rect.height) return false;
	const v = _rapierDrawView();
	if (fit && Math.abs(fit.w - rect.width) < .5) base.h = base.w * rect.height / rect.width;
	else {
		const span = { w: base.w / v.k, h: base.h / v.k }, t = Math.min(rect.width / span.w, rect.height / span.h);
		v.x -= (rect.width - span.w * t) / 2 / t; v.y -= (rect.height - span.h * t) / 2 / t;
		base.w = rect.width / t * v.k; base.h = rect.height / t * v.k;
	}
	state.viewFit = { w: rect.width, h: rect.height };
	return true;
}
function _rapierDrawBarsRoom() {
	const probe = _rapierDrawState.surface?.querySelector('.rapier-draw-viewport-probe');
	const tall = probe?.getBoundingClientRect().height || 0;
	return tall > innerHeight ? Math.round(tall - innerHeight) : 0;
}
function _rapierDrawSettingsInset() {
	const state = _rapierDrawState, row = state.surface?.querySelector('.rapier-draw-settings');
	if (row && !state.settingsCollapsed) return Math.max(0, Math.round(row.getBoundingClientRect().height));
	return state.viewInset || 0;
}
function _rapierDrawApplyView() {
	const state = _rapierDrawState, recipe = state.recipe, svg = state.svgRoot;
	if (!svg || !recipe?.canvas) return;
	_rapierDrawViewFollowStage(svg.getBoundingClientRect());
	const v = _rapierDrawView(), base = _rapierDrawViewBase(), w = base.w / v.k, h = base.h / v.k;
	const extent = _rapierDrawPaperView(recipe, state.resize?.frame || recipe.frame);
	const box = _rapierDrawFmt(v.x) + ' ' + _rapierDrawFmt(v.y) + ' ' + _rapierDrawFmt(w) + ' ' + _rapierDrawFmt(h);
	if (svg.getAttribute('viewBox') !== box) svg.setAttribute('viewBox', box);
	const paper = svg.querySelector('.rapier-draw-paper');
	if (paper) for (const [key, value] of Object.entries({ x: extent.x, y: extent.y, width: extent.w, height: extent.h })) paper.setAttribute(key, value);
	if (typeof _rapierDrawBackgroundSync === 'function') _rapierDrawBackgroundSync();
	if (typeof _rapierPaintPlaceLive === 'function') _rapierPaintPlaceLive();
	_rapierDrawResizeDraw();
	if (_rapierCopier.live.size) { clearTimeout(_rapierCopier.timer); _rapierCopier.timer = setTimeout(() => _rapierDrawCopierSync(), 220); }
	globalThis.RapierChanges?.locate();
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
async function _rapierDrawPaintUpload() {
	const state = _rapierDrawState;
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
	const p = _rapierDrawMapPoint(evt.clientX, evt.clientY, box.rect, box.vb).map(v => Math.round(v * 100) / 100);
	const pressure = Number.isFinite(evt.pressure) && evt.pressure >= 0 && evt.pressure <= 1 ? evt.pressure : 0.5;
	return [p[0], p[1], Math.max(0, evt.timeStamp - _rapierDrawState.strokeStartT), pressure];
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
	const ahead = state.strokePredicted?.length ? pts.concat(state.strokePredicted) : pts;
	if (tool === 'erase') { d = _rapierDrawSmoothPathD(pts, false, false); state.live.style.strokeWidth = _rapierDrawEraseRadius() * 2; }
	else if (tool === 'brush') d = _rapierDrawPenPathD(ahead, state.smooth, false, state.nib);
	else { const plan = _rapierDrawSmoothPlan(state.smooth); d = _rapierDrawSmoothPathD(_rapierDrawRelaxStroke(_rapierDrawStreamlineStroke(ahead, plan.streamline), plan.settle), false, plan.curve); }
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
// RAPIER_DRAW_STROKE_CHUNK) down to at most RAPIER_DRAW_STROKE_CHUNK_CAP points via a pressure-
// RAPIER_DRAW_STROKE_GAP_MAX raw samples (RDP alone can erode a long straight run to just its two
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
const RAPIER_DRAW_STROKE_POINT_MAX = 16384;
function _rapierDrawStrokePointBudget() {
	const test = globalThis.__rapierDrawTestMaxStrokePoints;
	return Number.isInteger(test) && test > 0 ? test : RAPIER_DRAW_STROKE_POINT_MAX;
}
function _rapierDrawStrokePointCount(state) {
	return (state.strokeHead?.length || 0) + (state.strokeChunks || []).reduce((sum, chunk) => sum + chunk.length, 0) + (state.strokeTail?.length || 0);
}
// Appends one live sample to the head (the first RAPIER_DRAW_STROKE_KEEP raw points, kept byte-exact
function _rapierDrawAppendStrokePoint(p) {
	const state = _rapierDrawState;
	if (state.strokeLast && p[2] < state.strokeLast[2]) p[2] = state.strokeLast[2];
	if (state.strokeLast && _rapierDrawDist(state.strokeLast, p) < 1.4 / Math.max(1, state.gesture?.scale || 1)) return;
	state.strokeLast = p;
	if (_rapierDrawStrokePointCount(state) >= _rapierDrawStrokePointBudget() - RAPIER_DRAW_STROKE_CHUNK) return;
	if (state.strokeHead.length < RAPIER_DRAW_STROKE_KEEP) { state.strokeHead.push(p); return; }
	state.strokeTail.push(p);
	if (state.strokeTail.length >= RAPIER_DRAW_STROKE_CHUNK) {
		state.strokeChunks.push(Object.freeze(_rapierDrawCompactStroke(state.strokeTail)));
		state.strokeTail = [];
	}
}
function _rapierDrawResetStrokeBuffer(seed) {
	const state = _rapierDrawState;
	state.strokeHead = seed ? [seed] : null; state.strokeChunks = seed ? [] : null; state.strokeTail = seed ? [] : null;
	state.strokeLast = seed || null; state.stroke = seed ? [seed] : null; state.strokePredicted = null;
}
function _rapierDrawHandleSpecs() {
	const shapes = _rapierDrawSelectedShapes(), shape = shapes[0], box = _rapierDrawSelectionBox();
	if (!box || !shape || _rapierDrawSelectionLocked(shapes)) return [];
	if (shapes.length === 1 && !shape.asDrawn && ['line', 'arrow'].includes(shape.recognized)) {
		const g = shape.geom, out = [{ id: 'start', label: 'Move start', point: [g.x1, g.y1] }, { id: 'end', label: 'Move end', point: [g.x2, g.y2] }];
		if (shape.recognized === 'arrow' && shape.route !== 'auto') {
			const path = _rapierDrawArrowRoutePoints(shape, _rapierDrawState.recipe);
			const point = shape.route === 'elbow' ? [(path[1][0] + path[2][0]) / 2, (path[1][1] + path[2][1]) / 2] :
				shape.route === 'curved' && path.length === 3 ? [(path[0][0] + 2 * path[1][0] + path[2][0]) / 4, (path[0][1] + 2 * path[1][1] + path[2][1]) / 4] : [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2];
			out.push({ id: 'bend', label: 'Adjust arrow route', point });
		}
		if (shape.label) { const text = _rapierDrawTextLayout(shape, _rapierDrawState.recipe); out.push({ id: 'label', label: 'Move label along path', point: [text.center.x, text.center.y] }); }
		return out;
	}
	const frame = _rapierDrawSelectionFrame(_rapierDrawState.recipe, _rapierDrawSelection()) || { theta: 0, pivot: null, box };
	const w = frame.box.maxX - frame.box.minX, h = frame.box.maxY - frame.box.minY;
	const chain = _rapierDrawChainable(shapes) ? Object.entries(RAPIER_DRAW_CHAIN_SIDES).map(([side, step]) => ({ id: 'add-' + side, side: step,
		label: 'Add a shape ' + { n: 'above', e: 'to the right', s: 'below', w: 'to the left' }[side], point: [(box.minX + box.maxX + step[0] * w) / 2, (box.minY + box.maxY + step[1] * h) / 2] })) : [];
	return chain.concat([['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5], ['rotate', .5, 0]].map(([id, x, y]) => {
		const local = [frame.box.minX + w * x, frame.box.minY + h * y];
		return {
			id, x, y, label: id === 'rotate' ? 'Rotate selection' : 'Resize ' + ({ nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' })[id],
			point: frame.theta ? _rapierDrawRotatePt(frame.pivot[0], frame.pivot[1], local[0], local[1], frame.theta) : local,
		};
	}));
}
const RAPIER_DRAW_HANDLE_CLEAR_PX = 18;
function _rapierDrawClearHandleSpots(recipe, ids, box, scale, sides = []) {
	const r = RAPIER_DRAW_HANDLE_CLEAR_PX / scale, boxes = [], paths = [], taken = [];
	for (const shape of recipe.shapes) {
		if (ids.includes(shape.id) || shape.hidden || shape.recognized === 'paint' || shape.recognized === 'image') continue;
		if ((shape.recognized === 'arrow' || shape.recognized === 'line') && !shape.asDrawn && shape.geom) paths.push(_rapierDrawArrowRoutePoints(shape, recipe));
		else boxes.push(_rapierDrawShapeBBoxIn(shape, recipe));
	}
	const along = (p, a, b) => {
		const dx = b[0] - a[0], dy = b[1] - a[1], t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
		return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
	};
	const clear = p => !boxes.some(b => p[0] > b.minX - r && p[0] < b.maxX + r && p[1] > b.minY - r && p[1] < b.maxY + r) &&
		!paths.some(path => path.slice(1).some((q, i) => along(p, path[i], q) < r)) && !taken.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2 * r);
	const pick = candidates => { const spot = candidates.find(clear) || candidates[0]; taken.push(spot); return spot; };
	const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, px = n => n / scale, quarter = Math.max(px(28), (box.maxX - box.minX) / 4);
	const spots = { rotate: pick([[cx, box.minY - px(44)], [box.maxX + px(30), box.minY - px(30)], [box.minX - px(30), box.minY - px(30)], [cx, box.maxY + px(44)]]) };
	for (const [side, [dx, dy]] of sides) {
		const at = reach => [dx ? (dx > 0 ? box.maxX : box.minX) + dx * px(reach) : cx, dy ? (dy > 0 ? box.maxY : box.minY) + dy * px(reach) : cy];
		const aside = (reach, k) => { const [x, y] = at(reach); return dx ? [x, y + k * Math.max(px(28), (box.maxY - box.minY) / 4)] : [x + k * quarter, y]; };
		spots['add-' + side] = pick([...(dy < 0 ? [88, 44, 66] : [44, 66, 88]).map(at), aside(44, 1), aside(44, -1)]);
	}
	return spots;
}
function _rapierDrawUpdateHandles() {
	const state = _rapierDrawState, layer = state.handlesLayer;
	if (!layer) return;
	const frame = state.open && _rapierDrawTool() === 'select' ? _rapierDrawSelectionFrame(state.recipe, _rapierDrawSelection()) : null;
	const box = frame?.box, theta = frame?.theta || 0, pivot = frame?.pivot;
	if (!box || !state.open || state.textEdit) { layer.innerHTML = ''; state.handles = []; return; }
	const svgRect = state.svgRoot.getBoundingClientRect(), vb = state.svgRoot.viewBox.baseVal, gesture = state.gesture;
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
	const specs = _rapierDrawHandleSpecs();
	const spots = moving || theta || !specs.some(handle => handle.id === 'rotate') ? {} : _rapierDrawClearHandleSpots(state.recipe, _rapierDrawSelection(), box, scaleView,
		specs.filter(handle => handle.side).map(handle => [handle.id.slice(4), handle.side]));
	const visibleTop = _rapierDrawVisibleTop();
	const belowRotate = () => toScreen((box.minX + box.maxX) / 2, box.maxY + (specs.some(handle => handle.id === 'add-s') ? 88 : 44) / scaleView);
	for (const handle of specs) {
		if (moving && handle.id !== active) continue;
		if (tiny && !moving && handle.x != null && handle.id !== 'se') continue;
		let [x, y] = _rapierDrawMapToScreen(...handle.point, svgRect, vb);
		if (active && state.pointerPos) {
			x = gesture.handle.screen[0] + (state.pointerPos[0] - gesture.origin[0]) * gesture.scale;
			y = gesture.handle.screen[1] + (state.pointerPos[1] - gesture.origin[1]) * gesture.scale;
		}
		else if (handle.id === 'label') y += 44;
		else if (spots[handle.id]) {
			[x, y] = mapLocal(...spots[handle.id]);
			if (handle.id === 'rotate' && y < visibleTop + 22) [x, y] = belowRotate();
		}
		else if (handle.side) { const reach = handle.side[1] < 0 ? 88 : 44; x += handle.side[0] * reach; y += handle.side[1] * reach; }
		else if (handle.id === 'rotate') {
			[x, y] = toScreen((box.minX + box.maxX) / 2, box.minY - 44 / scaleView);
			if (y < visibleTop + 22) [x, y] = belowRotate();
		}
		else if (handle.x != null) {
			if (wScreen < 88 && handle.x === .5) continue;
			if (hScreen < 88 && handle.y === .5 && !(textHandles && (handle.id === 'e' || handle.id === 'w'))) continue;
			let lx = box.minX + w * handle.x, ly = box.minY + h * handle.y;
			if (handle.x !== .5) lx = (box.minX + box.maxX) / 2 + (handle.x - .5) * Math.max(56 / scaleView, w);
			if (handle.y !== .5) ly = (box.minY + box.maxY) / 2 + (handle.y - .5) * Math.max(56 / scaleView, h);
			[x, y] = toScreen(lx, ly);
		}
		if (!active) {
			x = _rapierDrawClamp(x, svgRect.left + 22, Math.max(svgRect.left + 22, svgRect.right - 22));
			y = _rapierDrawClamp(y, visibleTop + 22, Math.max(visibleTop + 22, svgRect.bottom - 22));
		}
		state.handles.push({ ...handle, screen: [x, y] });
		const variant = handle.id === 'rotate' ? ' rapier-draw-handle--rotate' : handle.side ? ' rapier-draw-handle--add' : handle.id === 'bend' || handle.id === 'label' ? ' rapier-draw-handle--round' : textHandles && (handle.id === 'e' || handle.id === 'w') ? ' rapier-draw-handle--pill' : '';
		const cursorDir = _rapierDrawResizeCursorDir(handle.id, theta), cursorAttr = cursorDir ? ' data-draw-cursor="' + cursorDir + '"' : '';
		html += '<button type="button" class="rapier-draw-handle' + variant + '" data-draw-handle="' + handle.id + '"' + cursorAttr + ' aria-label="' + handle.label + '" style="left:' + x + 'px;top:' + y + 'px">' + (handle.id === 'rotate' ? RAPIER_DRAW_ICONS.turn : handle.side ? RAPIER_DRAW_ICONS.add : '<span></span>') + '</button>';
	}
	layer.innerHTML = html;
}

function _rapierDrawStartTransform() {
	const state = _rapierDrawState, gesture = state.gesture;
	if (_rapierDrawSelectionLocked()) throw new Error('Unlock the selected drawing first');
	if (gesture.changed) return;
	gesture.changed = true;
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
	for (const original of gesture.source.shapes) if (gesture.ids.includes(original.id) || original.bind && Object.values(original.bind).some(anchor => gesture.ids.includes(anchor.to))) {
		const index = state.recipe.shapes.findIndex(shape => shape.id === original.id);
		if (index < 0) continue;
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
	// underway, so a touch gesture ties its snap tolerance to RAPIER_DRAW_MOVE_THRESHOLD_PX instead
	const snapTolerance = (gesture.touch ? RAPIER_DRAW_MOVE_THRESHOLD_PX : 6) / gesture.scale;
	const snap = state.snap && !evt.ctrlKey && !evt.metaKey ? _rapierDrawSnapMove(gesture.source, gesture.ids, dx, dy, snapTolerance) : { dx, dy, guides: [] };
	for (const shape of _rapierDrawRestoreTransformShapes()) { _rapierDrawTranslateShape(shape, state.recipe, snap.dx, snap.dy); _rapierDrawReleaseBindings(shape, gesture.ids); }
	globalThis.RapierDrawEdit._rapierDrawRefaceArrows(new Set(gesture.ids), state.recipe);
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
		if (guide.kind === 'gap') return guide.marks.map(([x, y]) => '<path class="rapier-draw-guide-gap" d="' + _rapierDrawXMark(x, y, 4) + '"/>').join('');
		const line = '<path d="M' + (guide.axis === 'x' ? _rapierDrawFmt(guide.at) + ' ' + _rapierDrawFmt(guide.from) + 'V' : _rapierDrawFmt(guide.from) + ' ' + _rapierDrawFmt(guide.at) + 'H') + _rapierDrawFmt(guide.to) + '"/>';
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
	if (gesture.handle.side) return;
	_rapierDrawStartTransform();
	const shapes = _rapierDrawRestoreTransformShapes(), handle = gesture.handle, delta = [point[0] - gesture.origin[0], point[1] - gesture.origin[1]], box = gesture.box;
	const p = [handle.point[0] + delta[0], handle.point[1] + delta[1]], shape = shapes[0];
	if (handle.id === 'start' || handle.id === 'end') _rapierDrawSetArrowEndpoint(shape, handle.id, p, state.recipe, RAPIER_DRAW_SNAP_EDGE_PX / gesture.scale);
	else if (handle.id === 'bend') {
		const g = shape.geom, dx = g.x2 - g.x1, dy = g.y2 - g.y1, length = Math.hypot(dx, dy) || 1;
		if (shape.route === 'auto') return;
		if (shape.route === 'elbow') shape.elbow = _rapierDrawClamp(Math.abs(dx) >= Math.abs(dy) ? (p[0] - g.x1) / (dx || 1) : (p[1] - g.y1) / (dy || 1), 0, 1);
		else { shape.route = 'curved'; shape.curveT ??= .5; shape.bend = ((p[1] - (g.y1 + g.y2) / 2) * dx - (p[0] - (g.x1 + g.x2) / 2) * dy) / length; }
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
		const localDelta = theta ? [delta[0] * Math.cos(theta) + delta[1] * Math.sin(theta), delta[1] * Math.cos(theta) - delta[0] * Math.sin(theta)] : delta;
		let next = _rapierDrawResizeBox(localBox, handle, localDelta, lock, evt.altKey || state.resizeFromCenter);
		const snapTolerance = (gesture.touch ? RAPIER_DRAW_MOVE_THRESHOLD_PX : 6) / gesture.scale;
		if (state.snap && !evt.ctrlKey && !evt.metaKey && !theta && !lock) {
			const snap = _rapierDrawSnapResize(gesture.source, gesture.ids, localBox, next, snapTolerance);
			next = snap.next; state.guides = snap.guides;
		} else state.guides = [];
		const centered = evt.altKey || state.resizeFromCenter, anchor = { x: centered ? .5 : 1 - handle.x, y: centered ? .5 : 1 - handle.y };
		next = globalThis.RapierDrawEdit._rapierDrawLabelFloorBox(shapes, localBox, next, anchor);
		globalThis.RapierDrawEdit._rapierDrawScaleLabels(shapes, localBox, next);
		for (const shape of shapes) { _rapierDrawResizeShapeLocal(shape, state.recipe, theta, frame.pivot, localBox, next); globalThis.RapierDrawEdit._rapierDrawFitText(shape, state.recipe); _rapierDrawReleaseBindings(shape, gesture.ids); }
		_rapierDrawAnchorResizeLocal(state.recipe, gesture.ids, theta, frame.pivot, next, anchor);
	}
	_rapierDrawRenderShapes(gesture.ids); _rapierDrawPaintGuides();
}
function _rapierDrawIsCanvasTouch(target, surface) {
	if (!(target instanceof Element)) return false;
	if (target === surface) return true;
	return !!target.closest('.rapier-draw-stage,.rapier-draw-handle,.rapier-draw-text-box,.rapier-draw-menu,.rapier-draw-text-controls,.rapier-changes-mark') && !target.closest('input[type="range"]');
}
function _rapierDrawTryBeginPinch(evt) {
	const state = _rapierDrawState, gesture = state.gesture;
	if (evt.pointerType !== 'touch' || state.secondPointerId != null || !gesture || !state.pointerScreen || evt.pointerId === state.pointerId) return;
	if (gesture.kind === 'resize') { if (gesture.resize && state.resize) state.resize.frame = { ...gesture.resize.start }; }
	else if (gesture.kind === 'paint') _rapierPaintReleaseStroke(gesture, true);
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
function _rapierDrawApplyZoom(geom) {
	const state = _rapierDrawState, gesture = state.gesture, z = gesture?.zoom;
	if (!z || !state.pointerScreen || !z.pan && !state.secondPointerScreen) return;
	const rect = (geom || _rapierDrawPointerGeometry()).rect, a = state.pointerScreen, b = z.pan ? a : state.secondPointerScreen;
	const d0 = Math.max(1, Math.hypot(z.first[0] - z.second[0], z.first[1] - z.second[1]));
	const d1 = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
	const v = _rapierDrawView();
	const k = Math.min(RAPIER_DRAW_ZOOM_MAX, Math.max(RAPIER_DRAW_ZOOM_MIN, z.view.k * (d1 / d0)));
	const start = { x: z.view.x, y: z.view.y, k: z.view.k };
	const base = _rapierDrawViewBase();
	const span0 = { w: base.w / start.k, h: base.h / start.k };
	const t0 = Math.min(rect.width / span0.w, rect.height / span0.h);
	const off0 = { x: (rect.width - span0.w * t0) / 2, y: (rect.height - span0.h * t0) / 2 };
	const mid0 = [(z.first[0] + z.second[0]) / 2, (z.first[1] + z.second[1]) / 2];
	const anchorPt = [(mid0[0] - rect.left - off0.x) / t0 + start.x, (mid0[1] - rect.top - off0.y) / t0 + start.y];
	const span1 = { w: base.w / k, h: base.h / k };
	const t1 = Math.min(rect.width / span1.w, rect.height / span1.h);
	const off1 = { x: (rect.width - span1.w * t1) / 2, y: (rect.height - span1.h * t1) / 2 };
	const mid1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	v.k = k;
	v.x = anchorPt[0] - (mid1[0] - rect.left - off1.x) / t1;
	v.y = anchorPt[1] - (mid1[1] - rect.top - off1.y) / t1;
	_rapierDrawApplyView();
	_rapierDrawUpdateHandles();
}
function _rapierDrawZoomAt(clientX, clientY, factor) {
	const state = _rapierDrawState, v = state.view, rect = state.svgRoot?.getBoundingClientRect();
	if (!v || !rect || !rect.width || !rect.height || !Number.isFinite(factor) || factor <= 0) return;
	const base = _rapierDrawViewBase();
	const start = { x: v.x, y: v.y, k: v.k };
	const k = Math.min(RAPIER_DRAW_ZOOM_MAX, Math.max(RAPIER_DRAW_ZOOM_MIN, start.k * factor));
	const span0 = { w: base.w / start.k, h: base.h / start.k };
	const t0 = Math.min(rect.width / span0.w, rect.height / span0.h);
	const off0 = { x: (rect.width - span0.w * t0) / 2, y: (rect.height - span0.h * t0) / 2 };
	const anchor = [(clientX - rect.left - off0.x) / t0 + start.x, (clientY - rect.top - off0.y) / t0 + start.y];
	const span1 = { w: base.w / k, h: base.h / k };
	const t1 = Math.min(rect.width / span1.w, rect.height / span1.h);
	const off1 = { x: (rect.width - span1.w * t1) / 2, y: (rect.height - span1.h * t1) / 2 };
	v.k = k;
	v.x = anchor[0] - (clientX - rect.left - off1.x) / t1;
	v.y = anchor[1] - (clientY - rect.top - off1.y) / t1;
	_rapierDrawApplyView();
	_rapierDrawUpdateHandles();
}
function _rapierDrawEndGesture(cancel = false) {
	const state = _rapierDrawState, gesture = state.gesture, pointers = [state.pointerId, state.secondPointerId];
	if (gesture) {
		clearTimeout(gesture.holdTimer);
		if (gesture.kind === 'paint' && cancel) {
			state.gesture = null; state.pointerId = null; state.pointerPos = null;
			_rapierPaintReleaseStroke(gesture);
			if (gesture.paint?.pending) gesture.paint.discarded = true; else if (gesture.paint && !gesture.paint.discarded) _rapierPaintCommit();
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
function _rapierDrawCancelGesture() {
	const state = _rapierDrawState;
	if (state.markerPress) try { state.svgRoot.setPointerCapture(state.markerPress.down.pointerId); } catch (_) {}
	delete state.markerPress; state.canvasTouches?.clear();
	if (state.gesture) { _rapierDrawEndGesture(true); _rapierDrawRenderAll(); }
}
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
function _rapierDrawCommand(change, snapshot = true, menu = true, historyContext = null) {
	const waiting = (typeof _rapierPaintDeparting === 'function' && _rapierPaintDeparting()) || _rapierPaintFlushRevision();
	if (waiting) return waiting.then(() => _rapierDrawCommand(change, snapshot, menu, historyContext));
	const state = _rapierDrawState, original = state.recipe, before = _rapierDrawHistoryRecipe(), selection = _rapierDrawSelection(), undo = state.undoStack, redo = state.redoStack;
	state.recipe = _rapierDrawRestoreRecipe(before);
	try {
		change();
		_rapierDrawRerouteBoundArrows(state.recipe);
		const grown = _rapierDrawGrowCanvasToContent(state.recipe);
		const admitted = _rapierDrawAdmitRecipe(state.recipe, true);
		if (!admitted) throw new Error('Drawing change exceeds its limits');
		const markup = _rapierDrawDisplayMarkup(_rapierDrawSceneMarkup(admitted, false, true, {sourceOnly: true}));
		state.recipe = admitted;
		if (snapshot && !_rapierDrawSameRecipe(before)) {
			_rapierDrawSnapshot(before);
			if (historyContext) before.act = {...before.act, operation: historyContext.operation,
				sourceActIds: historyContext.sourceActIds.slice()};
			if (grown && (grown.dx || grown.dy) && !grown.recorded) { const entry = state.undoStack.at(-1); entry.shift = { dx: (entry.shift?.dx || 0) + grown.dx, dy: (entry.shift?.dy || 0) + grown.dy }; }
			_rapierDrawSealHistory(); state.sweepBase = before;
		}
		else if (!snapshot && state.sweepBase && state.undoStack.length) {
			const base = { ...state.sweepBase.recipe, fonts: state.sweepBase.fonts }, prior = state.undoStack.at(-1);
			const entry = _rapierDrawHistoryDelta(base, state.recipe);
			entry.selection = (state.sweepBase.selection || []).slice();
			if (state.sweepBase.act) entry.act = state.sweepBase.act;
			const dx = (prior.shift?.dx || 0) + (grown?.recorded ? 0 : grown?.dx || 0), dy = (prior.shift?.dy || 0) + (grown?.recorded ? 0 : grown?.dy || 0);
			if (dx || dy) entry.shift = { dx, dy };
			state.undoStack[state.undoStack.length - 1] = entry;
			state.humanChangePending = true; _rapierDrawBackupTouch();
		}
		state.svg.innerHTML = markup;
		if (typeof _rapierPaintReattachLive === 'function') _rapierPaintReattachLive();
		_rapierDrawSyncFonts(); _rapierDrawMarkSelection(); if (menu) _rapierDrawUpdateMenu();
		state.renderEdit = null;
		return true;
	} catch (error) {
		state.renderEdit = null; state.undoStack = undo; state.redoStack = redo; state.recipe = original; _rapierDrawSetSelection(selection); _rapierDrawRenderAll(); showToast(String(error.message || error), 'error');
		return false;
	}
}
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
	if (state.dropper) return;
	if (state.paintEraseFan || state.waterAction) return;
	if (state.surface && document.activeElement !== state.surface && !document.activeElement?.closest?.('textarea') && !evt.target.closest?.('[data-draw-handle]')) state.surface.focus({ preventScroll: true });
	if (state.replay) _rapierDrawReplayEnd();
	if (state.finishing || !_rapierDrawFinishText()) return;
	if (state.pointerId != null) {
		if (state.gesture?.pointerType === 'pen' && evt.pointerType === 'touch') return;
		const palm = evt.pointerType === 'pen' && state.gesture?.pointerType === 'touch' ? state.gesture : null;
		if (!palm) { _rapierDrawTryBeginPinch(evt); return; }
		if (palm.kind === 'paint') { _rapierPaintReleaseStroke(palm, true); if (palm.paint) palm.paint.discarded = true; }
		if (palm.zoom?.pan) { Object.assign(_rapierDrawView(), palm.zoom.view); _rapierDrawApplyView(); }
		_rapierDrawCancelGesture();
	}
	state.settingEdit = null;
	if (state.resize) { _rapierDrawResizeDown(evt); return; }
	state.pointerId = evt.pointerId; state.strokeStartT = evt.timeStamp;
	if (evt.pointerType === 'pen') state.pencil = true;
	else if (state.pencil && evt.pointerType === 'touch' && _rapierDrawTool() !== 'select') {
		state.pointerScreen = [evt.clientX, evt.clientY];
		state.gesture = {kind: 'zoom', pointerType: 'touch', tool: _rapierDrawTool(), selection: _rapierDrawSelection(), dragged: true, zoom: {pan: true, first: state.pointerScreen, second: state.pointerScreen, view: {..._rapierDrawView()}}};
		try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
		return;
	}
	const point = _rapierDrawSurfacePoint(evt), svgRect = state.svgRoot.getBoundingClientRect();
	const eraser = evt.pointerType === 'pen' && (evt.button === 5 || !!(evt.buttons & 32));
	const scale = _rapierDrawViewTransform(svgRect, state.svgRoot.viewBox.baseVal).scale, tool = eraser ? 'erase' : _rapierDrawTool();
	const handle = tool === 'select' && evt.target.closest('[data-draw-handle]') ? (state.handles || []).reduce((best, next) => !best || _rapierDrawDist(next.screen, [evt.clientX, evt.clientY]) < _rapierDrawDist(best.screen, [evt.clientX, evt.clientY]) ? next : best, null) : null;
	const hit = handle ? null : _rapierDrawHitShape(point, _rapierDrawHitSlop() / scale), selection = _rapierDrawSelection();
	const labelHandle = !handle && tool === 'select' && hit && selection.length === 1 && selection[0] === hit ? _rapierDrawLabelHandleAt(_rapierDrawShapeById(hit), point) : null;
	const touch = evt.pointerType === 'touch';
	const gesture = state.gesture = { kind: handle || labelHandle ? 'handle' : 'stroke', tool, scale, origin: point, downId: hit, selection, handle: handle || labelHandle, touch, pointerType: evt.pointerType, alt: !!evt.altKey, shift: !!evt.shiftKey, add: !!evt.shiftKey, changed: false, dragged: false };
	if (tool === 'effects') gesture.kind = 'hold';
	state.pointerPos = point; state.pointerScreen = [evt.clientX, evt.clientY];
	_rapierDrawResetStrokeBuffer(point); _rapierDrawNoteStroke();
	if (hit && _rapierDrawShapeById(hit)?.locked && !handle && !labelHandle && tool === 'select') { gesture.kind = 'hold'; _rapierDrawSetSelection([hit]); _rapierDrawShowPressRing(hit); }
	else if (!handle && !labelHandle && tool === 'select') {
		if (hit && !evt.ctrlKey && !evt.metaKey) {
			gesture.kind = 'move';
			if (!selection.includes(hit)) _rapierDrawSetSelection([hit]);
			_rapierDrawShowPressRing(hit);
			if (touch) _rapierDrawArmHold(gesture, () => {
				gesture.kind = 'hold';
				_rapierDrawSetSelection(_rapierDrawToggleSelection(selection, hit));
				_rapierDrawRenderAll();
			});
		} else { gesture.kind = 'marquee'; _rapierDrawBeginMarquee(point); _rapierDrawPaintMarquee(); state.menu.hidden = true; }
	} else if (!handle && tool === 'water') { gesture.kind = _rapierWaterActionWanted() ? 'waterAction' : 'paint'; }
	else if (!handle && tool === 'paint') { gesture.kind = 'paint'; }
	else if (!handle && tool === 'erase' && hit && _rapierDrawShapeById(hit)?.recognized === 'paint' && typeof _rapierPaintTarget === 'function' && _rapierPaintTarget()) {
		gesture.kind = 'paint'; gesture.eraseInk = true;
	}
	if (tool === 'erase' && gesture.kind === 'stroke') gesture.trail = { down: evt, moves: [], end: null, geom: _rapierDrawPointerGeometry() };
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
	if (gesture.kind === 'resize') { _rapierDrawResizeMove(point, gesture); return; }
	if (gesture.trail && !commit && !gesture.trail.end) gesture.trail.moves.push(...events);
	if (gesture.kind === 'paint') { if (!commit) try { _rapierPaintMove(events, gesture); } catch (error) { _rapierPaintStrokeFailed(gesture, error); } return; }
	const travel = _rapierDrawDist(point, gesture.origin) * gesture.scale;
	if (travel > RAPIER_DRAW_MOVE_THRESHOLD_PX) { clearTimeout(gesture.holdTimer); gesture.dragged = true; }
	gesture.shift = !!evt.shiftKey; gesture.alt = gesture.kind === 'move' ? gesture.alt : !!evt.altKey;
	if (gesture.kind === 'hold' || gesture.kind === 'cancelled') return;
	if (gesture.kind === 'marquee') {
		state.marquee.x1 = point[0]; state.marquee.y1 = point[1];
		let caught;
		if (gesture.touch) {
			gesture.scribble = gesture.scribble || [gesture.origin.slice()];
			for (const sample of events) gesture.scribble.push(_rapierDrawSurfacePoint(sample));
			_rapierDrawPaintScribble();
			caught = _rapierDrawScribbleCatches(gesture.scribble);
		} else { _rapierDrawPaintMarquee(); caught = _rapierDrawMarqueeCatches(_rapierDrawMarqueeRect()); }
		const extend = gesture.add || (gesture.dragged && gesture.touch && gesture.selection.length > 0);
		_rapierDrawSetSelection(extend ? [...gesture.selection, ...caught] : caught); _rapierDrawMarkSelection();
		return;
	}
	if (gesture.kind === 'handle' || gesture.kind === 'move') {
		if (gesture.changed || travel > RAPIER_DRAW_MOVE_THRESHOLD_PX) gesture.kind === 'handle' ? _rapierDrawApplyHandle(point, evt, commit) : _rapierDrawApplyMove(point, evt);
		return;
	}
	for (const sample of events) _rapierDrawAppendStrokePoint(_rapierDrawSurfacePoint(sample, geom));
	state.strokePredicted = commit ? null : (evt.getPredictedEvents?.() || []).slice(0, 2).map(sample => _rapierDrawSurfacePoint(sample, geom));
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
	if (evt.pointerId !== state.pointerId && evt.pointerId !== state.secondPointerId &&
		evt.currentTarget && evt.currentTarget === state.svgRoot && state.svgRoot.hasPointerCapture(evt.pointerId))
		state.echoTap = { x: evt.clientX, y: evt.clientY, id: evt.pointerId };
	if (state.dropper || !gesture || evt.pointerId !== state.pointerId && evt.pointerId !== state.secondPointerId) return;
	evt.stopPropagation(); evt.preventDefault();
	state.echoTap = { x: evt.clientX, y: evt.clientY, id: evt.pointerId };
	_rapierDrawOnPointerMove(evt, true);
	if (state.gesture !== gesture) return;
	if (gesture.kind === 'resize') { _rapierDrawEndGesture(); _rapierDrawResizeDraw(); return; }
	const pts = ['shape', 'text'].includes(gesture.tool) ? [gesture.origin, state.pointerPos] : state.stroke || [], kind = gesture.kind, selected = _rapierDrawSelection();
	const doubleTapDist = gesture.touch ? RAPIER_DRAW_DOUBLE_TAP_DIST_TOUCH_PX : RAPIER_DRAW_DOUBLE_TAP_DIST_PX;
	const priorTap = state.lastTap, double = !gesture.dragged && priorTap && evt.timeStamp - priorTap.time < 450 && priorTap.id === gesture.downId && _rapierDrawDist(priorTap.point, gesture.origin) * gesture.scale < doubleTapDist;
	state.lastTap = gesture.dragged ? null : { time: evt.timeStamp, id: gesture.downId, point: gesture.origin, handle: gesture.handle?.id || null };
	if (kind === 'waterAction') { _rapierDrawEndGesture(); void _rapierWaterActionAt(evt, gesture); return; }
	if (kind === 'paint') {
		_rapierDrawEndGesture(); try { _rapierPaintEnd(evt, gesture); } catch (error) { _rapierPaintStrokeFailed(gesture, error); return; }
		if (gesture.trail && !gesture.trail.end && typeof _rapierPaintEraseFan === 'function') {
			gesture.trail.end = evt;
			if (gesture.tool === 'erase') gesture.trail.vector = [gesture.trail.down, ...gesture.trail.moves, evt].map(sample => _rapierDrawSurfacePoint(sample, gesture.trail.geom));
			_rapierPaintEraseFan(gesture);
		}
		return;
	}
	const resetHandle = double && !gesture.dragged && gesture.handle && priorTap.handle === gesture.handle.id && ['rotate', 'bend'].includes(gesture.handle.id) ? gesture.handle.id : null;
	const reset = () => {
		state.lastTap = null;
		if (resetHandle === 'rotate') { const theta = _rapierDrawSelectionFrame(state.recipe, selected)?.theta || 0; if (theta) _rapierDrawTransformSelection(1, -theta); }
		else _rapierDrawCommand(() => { for (const shape of _rapierDrawSelectedShapes()) { if (shape.route === 'elbow') shape.elbow = .5; else { shape.bend = 0; shape.curveT = .5; } } });
	};
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
		if (resetHandle) reset();
		return;
	}
	if (resetHandle) { reset(); return; }
	if (!gesture.dragged && gesture.handle?.side) { _rapierDrawChain(gesture.handle.id.slice(4)); return; }
	if (!gesture.dragged && gesture.handle?.id === 'label') { _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0], {at: gesture.origin}); return; }
	if (double && gesture.tool === 'select' && !gesture.handle && gesture.downId) {
		const shape = _rapierDrawShapeById(gesture.downId);
		if (shape && (shape.recognized === 'text' || shape.label)) { _rapierDrawEditLabelInPlace(shape, { at: gesture.origin }); state.lastTap = null; return; }
	}
	if (kind === 'zoom' || kind === 'marquee' || kind === 'hold' || kind === 'handle' || kind === 'cancelled') { _rapierDrawRenderAll(); return; }
	if (kind === 'move') {
		if (gesture.add) _rapierDrawSetSelection(_rapierDrawToggleSelection(gesture.selection, gesture.downId));
		else if (gesture.downId && !gesture.dragged) {
			const shape = _rapierDrawShapeById(gesture.downId), label = gesture.selection.length === 1 && gesture.selection[0] === gesture.downId && _rapierDrawLabelBox(shape, state.recipe), p = gesture.origin;
			if (label && p[0] >= label.minX && p[0] <= label.maxX && p[1] >= label.minY && p[1] <= label.maxY) { _rapierDrawEditLabelInPlace(shape, { at: p }); return; }
			_rapierDrawSetSelection([gesture.downId]);
		}
		else _rapierDrawSetSelection([gesture.downId]);
		_rapierDrawRenderAll(); return;
	}
	if (gesture.tool === 'erase') {
		if (gesture.trail && typeof _rapierPaintEraseWanted === 'function' && _rapierPaintEraseWanted()) { gesture.trail.end = evt; gesture.trail.vector = pts; _rapierPaintEraseFan(gesture); }
		else _rapierDrawEraseWith(pts);
		return;
	}
	if (gesture.tool === 'shape') { _rapierDrawCommitShapeDrag(pts, gesture.dragged, gesture); return; }
	if (gesture.tool === 'text') { _rapierDrawCreateText(gesture.origin, pts.at(-1) || gesture.origin); return; }
	if (_rapierDrawPerimeter(pts, false) * gesture.scale < 6) {
		if (['brush', 'pen'].includes(gesture.tool) && kind === 'stroke') _rapierDrawCommitDot(pts[0] || [...gesture.origin, 0, 0.5]);
		return;
	}
	if (pts.length >= 2) _rapierDrawCommitStroke(pts);
}
function _rapierDrawCommitDot(point) {
	const pressure = point[3] ?? 0.5;
	_rapierDrawCommitStroke([[point[0], point[1], 0, pressure], [point[0] + 0.05, point[1], 8, pressure]], { dot: true });
}
function _rapierDrawOnPointerCancel(evt) {
	if (evt.pointerId !== _rapierDrawState.pointerId && evt.pointerId !== _rapierDrawState.secondPointerId) return;
	evt.stopPropagation(); _rapierDrawCancelGesture();
}
function _rapierDrawBindTap(el, handler) {
	let press = null;
	el.addEventListener('pointerdown', evt => {
		const button = evt.target.closest('button');
		press = button && !button.disabled && (evt.pointerType !== 'mouse' || evt.button === 0) ? { id: evt.pointerId, button, x: evt.clientX, y: evt.clientY, moved: false } : null;
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
	const picking = _rapierDrawTool() === 'select';
	const selected = picking ? _rapierDrawSelectedShapes() : [];
	if (picking && !selected.length && state.colourOpen) state.colourOpen = false;
	const colourScope = selected.length ? 'selection' : 'next';
	const colourInk = selected.length ? selected[0].ink : state.ink;
	const colours = palette && state.colourOpen ? _rapierDrawPalette(colourInk, colourScope) : '';
	if (btn) {
		const was = btn.querySelector('.rapier-draw-ink-dot')?.style.background || '';
		btn.innerHTML = '<span class="rapier-draw-ink-dot" style="background:' + _rapierDrawDisplayInk(_rapierDrawShapeInk({ ink: picking ? (selected[0]?.ink || null) : state.ink })) + '"></span><span class="rapier-draw-btn-name">color</span>';
		btn.disabled = picking && !selected.length;
		btn.setAttribute('aria-expanded', String(!!state.colourOpen));
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
	if (row && palette) { row.hidden = !state.colourOpen; row.innerHTML = colours; if (_rapierDrawTool() === 'paint') _rapierPaintMixSync(); }
}
function _rapierDrawSetColour(scope, ink, continuous = false) {
	const state = _rapierDrawState;
	if (state.finishing) return;
	if (scope === 'flower' || scope === 'stem') { _rapierDrawSetGardenColour(scope, ink, continuous); return; }
	if (scope === 'next') { _rapierPaintHeadClear(false); state.ink = ink || null; state.inkChosen = true; _rapierDrawUpdateInkBtn(!continuous); if (!continuous) _rapierPaintUpdateStrip(); return; }
	const shapes = _rapierDrawSelectedShapes();
	if (_rapierDrawSelectionLocked(shapes)) return;
	const key = scope === 'border' ? 'border' : 'ink';
	if (key === 'border' && !shapes.every(_rapierDrawBorderActive)) return;
	const before = state.undoStack.at(-1), sweeping = continuous && state.colourEdit === before;
	if (_rapierDrawCommand(() => {
		for (const shape of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {[key]: ink || null});
	}, !sweeping, !continuous) && continuous) {
		const top = state.undoStack.at(-1);
		if (sweeping || top !== before) state.colourEdit = top;
	}
}
function _rapierDrawChooseColour(scope, ink, continuous = false) {
	_rapierDrawRememberInk(ink);
	_rapierDrawSetColour(scope, ink, continuous);
	_rapierDrawState.colourEdit = false; _rapierDrawState.sweepBase = null;
	_rapierDrawUpdateInkBtn(); _rapierPaintUpdateStrip(); _rapierDrawUpdateMenu();
}
function _rapierDrawCommitHex(input) {
	const ink = _rapierDrawReadHex(input.value);
	input.setCustomValidity(ink ? '' : 'Enter a hex color, like #1A2B3C.');
	input.setAttribute('aria-invalid', String(!ink));
	if (!ink) return false;
	_rapierDrawChooseColour(input.dataset.drawHex, ink);
	return true;
}
function _rapierDrawSetFade(transparency, continuous = false) {
	const state = _rapierDrawState, shapes = _rapierDrawSelectedShapes();
	if (state.finishing || !shapes.length || _rapierDrawSelectionLocked(shapes)) return;
	const opacity = Math.round((1 - _rapierDrawClamp(Number(transparency) || 0, 0, .95)) * 100) / 100;
	if (!shapes.some(shape => (shape.opacity ?? 1) !== opacity)) return;
	const sweeping = continuous && !!state.fadeEdit && state.fadeEdit === state.undoStack.at(-1);
	if (_rapierDrawCommand(() => {
		for (const shape of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {opacity: opacity < 1 ? opacity : null});
	}, !sweeping, !continuous) && continuous) state.fadeEdit = state.undoStack.at(-1);
}
function _rapierDrawTransformSelection(scale, angle = 0) {
	const state = _rapierDrawState, box = _rapierDrawSelectionBox();
	if (!box || _rapierDrawSelectionLocked()) return;
	_rapierDrawCommand(() => {
		const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
		const width = box.maxX - box.minX, height = box.maxY - box.minY;
		if (scale !== 1 && (width || height)) state.recipe = _rapierDrawEdit(state.recipe, _rapierDrawSelection(), {type: 'resize', ...(width ? {width: width * scale} : {}), ...(height ? {height: height * scale} : {}), local: false}).recipe;
		if (angle) state.recipe = _rapierDrawEdit(state.recipe, _rapierDrawSelection(), {type: 'rotate', angle, pivot: [cx, cy]}).recipe;
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
			const font = _rapierDrawOfferedFonts().find(font => font.id === value);
			if (!font) throw new Error('That custom font is no longer available.');
			state.recipe.fonts = globalThis.RapierDrawFonts.admitFonts([...(state.recipe.fonts || []), font]);
		}

		const next = ['textSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'labelPos', 'inner'].includes(key) ? Number(value) : key === 'textKern' ? value !== 'off' : ['textCase', 'textFigures', 'textEffect'].includes(key) ? value || null : value;
		for (const shape of _rapierDrawSelectedShapes()) {
			if (key === 'textEffect' && shape.recognized !== 'text' || key === 'inner' && shape.recognized !== 'star') continue;
			globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {[key]: next, ...(key === 'textEffect' && value === 'garden' ? _rapierDrawGardenProperties(shape, _rapierDrawTextDefaults()) : {})});
		}
	});
	if (key === 'textFont') { state.fontReady = _rapierDrawLoadFonts(state.recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error')); }
}
function _rapierDrawMenuAction(evt) {
	const state = _rapierDrawState;
	if (state.finishing || !evt.target.closest('button')) return;
	if (_rapierDrawTool() === 'paint' && _rapierPaintMixAction(evt)) return;
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
	if (evt.target.closest('[data-draw-clear]')) { _rapierPaintHeadClear(true); _rapierDrawUpdateInkBtn(); return; }
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
	if (act === 'font-upload') { state.fontUploadTarget = 'selection'; state.fontInput.value = ''; state.fontInput.click(); return; }
	if (act === 'width' || act === 'smooth') { _rapierDrawShowRow(act === 'width' ? 'nib' : 'smooth'); return; }
	if (['bigger', 'smaller', 'turn'].includes(act)) { _rapierDrawTransformSelection(act === 'bigger' ? 1.2 : act === 'smaller' ? 1 / 1.2 : 1, act === 'turn' ? RAPIER_DRAW_TURN_STEP : 0); return; }
	_rapierDrawCommand(() => {
	const shape = _rapierDrawShapeById(state.menuShapeId);
	if (act === 'toggle-ink') {
		const asDrawn = !shape.asDrawn, brush = !asDrawn && shape.brush === 'brush' ? 'ink' : asDrawn && (!shape.brush || shape.brush === 'ink') ? 'brush' : shape.brush;
		state.recipe = _rapierDrawEdit(state.recipe, [shape.id], {type: asDrawn ? 'unclean' : 'clean'}).recipe;
		if (brush !== shape.brush) state.recipe = _rapierDrawEdit(state.recipe, [shape.id], {type: 'set_look', brush}).recipe;
	}
	else if (act === 'toggle-label-in') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {labelIn: !shape.labelIn});
	else if (act === 'text-align' || act === 'text-valign') for (const selected of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit.setProperties(selected, state.recipe, {[act === 'text-align' ? 'labelAlign' : 'labelVAlign']: value});
	else if (act === 'text-toggle') { const on = !shape[value]; for (const selected of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit.setProperties(selected, state.recipe, {[value]: on}); }
	else if (act === 'text-wrap') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {geom: {w: shape.geom.w ? null : Math.max(64, _rapierDrawTextLayout(shape, state.recipe).width)}});
	else if (act === 'style') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {style: value});
	else if (act === 'dash') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {dash: value || null});
	else if (act === 'brush') {
		globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {brush: value});
	} else if (act === 'angle') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {angle: !shape.angle});
	else if (act === 'len') globalThis.RapierDrawEdit.setProperties(shape, state.recipe, {len: !shape.len});
	if ((shape.border || shape.style === 'solid' && shape.authorStyle?.stroke) && !_rapierDrawBorderActive(shape)) throw new Error('A border needs a solid shape in the Ink look, not an as-drawn stroke');
	for (const selected of _rapierDrawSelectedShapes()) globalThis.RapierDrawEdit._rapierDrawFitText(selected, state.recipe);
	});
}
const RAPIER_DRAW_CLIPBOARD = 'application/x-rapier-drawing+json';
function _rapierDrawCopyEvent(evt) {
	evt.stopPropagation();
	if (evt.target.closest('input,textarea,select') || !_rapierDrawSelection().length || !evt.clipboardData) return;
	const waiting = _rapierPaintFlushRevision();
	void waiting?.catch?.(() => {});
	const state = _rapierDrawState, ids = new Set(_rapierDrawSelection());
	const selectedRecipe = () => {
		const recipe = _rapierDrawPruneUnusedStrokes({ ...state.recipe, shapes: state.recipe.shapes.filter(shape => ids.has(shape.id)).map(shape => {
			const copy = JSON.parse(JSON.stringify(shape));
			if (copy.bind) for (const end of ['start', 'end']) if (!ids.has(copy.bind[end]?.to)) delete copy.bind[end];
			return copy;
		}) });
		recipe.fonts = (recipe.fonts || []).filter(font => recipe.shapes.some(shape => shape.textFont === font.id));
		return recipe;
	};
	const recipe = selectedRecipe();
	if (recipe.effect?.type === 'refraction' || recipe.shapes.some(shape => shape.effect?.type === 'refraction')) {
		evt.preventDefault();
		const missingSource = recipe => [recipe, ...recipe.shapes].some(target => refractionSourceReferences(target.effect).some(({key}) => {
			const sources = refractionSourceShapes(state.recipe, target.effect[key]);
			return !sources || sources.some(shape => !ids.has(shape.id));
		}));
		const includeSources = 'Include the lens and matte sources in the selection before copying.';
		if (missingSource(recipe)) { showToast(includeSources, 'error'); return; }
		const clipboard = globalThis.navigator?.clipboard, Clipboard = globalThis.ClipboardItem;
		const refused = error => showToast('This drawing could not be copied. Use ' + (globalThis.RapierPlatform?.environment.native === true ? 'Save. ' : 'Download. ') + String(error?.message || error || ''), 'error');
		if (typeof clipboard?.write !== 'function' || typeof Clipboard !== 'function' || typeof globalThis.RapierDrawRefraction?.prepare !== 'function') {
			refused('The browser does not support copying prepared drawings.'); return;
		}
		const drawing = state.session, selection = JSON.stringify([...ids]);
		const current = () => _rapierDrawState === state && state.open && !state.finishing && !state.gesture && !state.replay && state.session === drawing && JSON.stringify(_rapierDrawSelection()) === selection;
		let captured;
		const data = Promise.resolve(waiting).then(async () => {
			if (!current()) throw new Error('The drawing changed during copying.');
			captured = JSON.stringify(state.recipe);
			const source = selectedRecipe();
			if (missingSource(source)) throw new Error(includeSources);
			const prepared = await globalThis.RapierDrawRefraction.prepare(source, {displayRaster: url => _rapierPaintShownAs.get(url)});
			if (!current() || JSON.stringify(state.recipe) !== captured) throw new Error('The drawing changed during copying.');
			return new Blob([_rapierDrawBuildSVG(prepared)], {type: 'text/plain'});
		});
		void data.catch(() => {});
		try {
			return Promise.resolve(clipboard.write([new Clipboard({'text/plain': data})])).then(async () => {
				if (evt.type !== 'cut') return;
				const flushing = _rapierPaintFlushRevision(); if (flushing) await flushing;
				if (!current() || JSON.stringify(state.recipe) !== captured) {
					showToast('Copied. The drawing changed, so Cut kept the source.', 'info'); return;
				}
				_rapierDrawEditSelection({type: 'delete'}, [...ids]);
			}).catch(refused);
		} catch (error) { refused(error); return; }
	}
	try {
		const svg = _rapierDrawBuildSVG(recipe), json = JSON.stringify(recipe);
		evt.clipboardData.setData('text/plain', svg);
		try { evt.clipboardData.setData(RAPIER_DRAW_CLIPBOARD, json); } catch (_) {}
		evt.preventDefault();
		if (evt.type === 'cut') _rapierDrawEditSelection({ type: 'delete' });
	} catch (error) { showToast(String(error.message || error), 'error'); }
}

function _rapierDrawPasteRecipe(incoming) {
	const waiting = _rapierPaintFlushRevision();
	if (waiting) return waiting.then(() => _rapierDrawPasteRecipe(incoming));
	incoming = _rapierDrawAdmitRecipe(incoming, true);
	if (!incoming) throw new Error('This drawing cannot be pasted.');
	if (incoming.effect?.type === 'refraction') throw new Error('Paste this SVG into the document to keep its whole-drawing effect and editable source.');
	const state = _rapierDrawState, fonts = globalThis.RapierDrawFonts, joinedFonts = [...(state.recipe.fonts || [])];
	for (const font of incoming.fonts || []) {
		const prior = joinedFonts.find(saved => saved.id === font.id);
		if (prior && prior.data !== font.data) throw new Error('Font identity collision');
		if (!prior) joinedFonts.push(font);
	}
	const admittedFonts = fonts.admitFonts(joinedFonts), ids = new Map(), groups = new Map(), paintGroups = new Map();
	let box = null;
	for (const shape of incoming.shapes) {
		ids.set(shape.id, _rapierDrawNextId());
		const b = _rapierDrawShapeBBoxIn(shape, incoming);
		box = box ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) } : b;
	}
	if (!box) return;
	const used = new Set([...state.recipe.shapes.flatMap(shape => [shape.id, shape.group, shape.paint?.group]).filter(Boolean), ...ids.values()]);
	const vb = state.svgRoot.viewBox.baseVal, at = state.lastTap?.point || [vb.x + vb.width / 2, vb.y + vb.height / 2];
	const origin = [...ids.keys()].sort().join(',') + '@' + at[0].toFixed(1) + ',' + at[1].toFixed(1);
	const streak = state.pasteStreak, n = streak && streak.origin === origin ? streak.n + 1 : 0;
	state.pasteStreak = { origin, n };
	const shift = n * RAPIER_DRAW_COPY_OFFSET;
	const dx = at[0] - (box.minX + box.maxX) / 2 + shift, dy = at[1] - (box.minY + box.maxY) / 2 + shift;
	for (const shape of incoming.shapes) {
		_rapierDrawTranslateShape(shape, incoming, dx, dy);
		shape.id = ids.get(shape.id); delete shape.locked;
		const nib = _rapierDrawShapeNib(shape, incoming), smooth = _rapierDrawSmoothLevel(shape.smooth ?? incoming.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT);
		if (shape.nib == null && nib !== state.recipe.nib) shape.nib = nib;
		if (shape.smooth == null && smooth !== state.recipe.smooth) shape.smooth = smooth;
		if (shape.group) {
			if (!groups.has(shape.group)) { let id; do { id = 'g' + _rapierDrawNextId(); } while (used.has(id)); used.add(id); groups.set(shape.group, id); }
			shape.group = groups.get(shape.group);
		}
		if (shape.paint?.group) {
			if (!paintGroups.has(shape.paint.group)) paintGroups.set(shape.paint.group, shape.id);
			shape.paint.group = paintGroups.get(shape.paint.group);
		}
		if (shape.stroke != null) shape.stroke += state.recipe.strokes.length;
		if (shape.bind) for (const end of ['start', 'end']) { const to = ids.get(shape.bind[end]?.to); if (to) shape.bind[end].to = to; else delete shape.bind[end]; }
		if (shape.effect) shape.effect = remapRefractionSources(shape.effect, ids);
	}
	const recipe = _rapierDrawAdmitRecipe({ ...state.recipe, fonts: admittedFonts, shapes: state.recipe.shapes.concat(incoming.shapes), strokes: state.recipe.strokes.concat(incoming.strokes) }, true);
	if (!recipe) throw new Error('Drawing is too large to paste here');
	_rapierDrawSceneMarkup(recipe, false, true, {sourceOnly: true});
	_rapierDrawSnapshot(); state.recipe = recipe; _rapierDrawSetSelection([...ids.values()]); _rapierDrawRenderAll(); _rapierDrawSealHistory();
	state.fontReady = _rapierDrawLoadFonts(recipe, state.session); state.fontReady.catch(error => showToast(String(error.message || error), 'error'));
}
function _rapierDrawRasterDataURL(bytes, mime) {
	return 'data:' + mime + ';base64,' + RapierBundleIO.toBase64(bytes);
}
async function _rapierDrawReadVector(file) {
	const assets = globalThis.RapierImageAssets, bytes = assets.normalizeSVG(await _rapierReadImageFileBytes(file)), info = assets.inspectSVG(bytes);
	return { bytes, isJxl: false, info, mime: 'image/svg+xml', converted: false };
}
async function _rapierDrawReadImage(file, session, work = {}) {
	const state = _rapierDrawState, core = globalThis.RapierDrawCore;
	const input = _rapierIsVectorFile(file) ? await _rapierDrawReadVector(file) : await _rapierReadRasterFile(file);
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
	if (input.mime === 'image/jpeg' && wantsJxl && _rapierJxlEncoderPresent()) {
		let carried = null;
		try { carried = await globalThis.RapierEmbeddedImages.codec('transcode', { bytes: input.bytes.slice() }, { signal: work.signal }); } catch (error) { if (error?.name === 'AbortError') throw error; }
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
			const pixels = await globalThis.RapierEmbeddedImages.codec('decode', { bytes: input.bytes.slice() }, { signal: work.signal });
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
			const encoded = await globalThis.RapierEmbeddedImages.codec('encode', { width, height, data: rgba.data, options: lossless ? { lossless: true } : { quality: 90, photo: true } }, work);
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
	const source = Array.from(files).slice(0, 16), controller = new AbortController();
	const popup = _rapierProgressOpen({ label: source.length > 1 ? 'Adding pictures' : 'Adding picture', after: 500, cancel: () => controller.abort() });
	try {
		const rows = [];
		for (const [index, file] of source.entries()) {
			popup.set(source.length > 1 ? index / source.length : null);
			const row = await _rapierDrawReadImage(file, session, { signal: controller.signal, progress: fraction => popup.set((index + fraction) / source.length) });
			controller.signal.throwIfAborted();
			if (!row) return;
			rows.push(row);
		}
		popup.end();
		if (!rows.length || !state.open || state.session !== session || state.finishing) return;
		const vb = state.svgRoot.viewBox.baseVal, maxW = Math.max(44, vb.width * .62), maxH = Math.max(44, vb.height * .62);
		const shapes = rows.map((row, index) => {
			const scale = Math.min(1, maxW / row.width, maxH / row.height), w = row.width * scale, h = row.height * scale, step = index * RAPIER_DRAW_COPY_OFFSET;
			return { id: 'image' + (index + 1), recognized: 'paint', geom: { cx: vb.x + vb.width / 2 + step, cy: vb.y + vb.height / 2 + step, w, h }, raster: row.url, paint: { px: [row.width, row.height], scale: 1 } };
		});
		const incoming = _rapierDrawAdmitRecipe({ version: RAPIER_DRAW_VERSION, canvas: { w: state.recipe.canvas.w, h: state.recipe.canvas.h }, strokes: [], shapes });
		if (!incoming) throw new Error('These images are too large to place in one drawing.');
		await _rapierDrawSetTool('select');
		if (!state.open || state.session !== session || state.finishing || _rapierDrawTool() !== 'select') return;
		_rapierDrawPasteRecipe(incoming);
	} catch (error) {
		if (error?.name !== 'AbortError' && state.open && state.session === session) showToast('Image could not be added: ' + String(error?.message || error), 'error');
	} finally { popup.end(); if (state.session === session) state.imageImporting = false; }
}
function _rapierDrawGalleryOffered() { return typeof _rapierPartAvailable === 'function' && (!!_rapierPresetPart || _rapierPartAvailable('presets')); }
async function _rapierDrawOpenGallery() {
	const state = _rapierDrawState, session = state.session;
	if (!state.open || state.finishing || !await _rapierPartReady('presets') || !state.open || state.session !== session || state.finishing) return;
	_rapierPresetPart.open(null, { place: chosen => _rapierDrawPlaceOrnament(_rapierDrawGalleryPiece(chosen), session) });
}
function _rapierDrawGalleryPiece({ border, item, set, entry }) {
	const moved = (path, dx, dy) => path.replace(/M(-?\d+)[ ,]?(-?\d+)/g, (_, x, y) => 'M' + (Number(x) + dx) + ' ' + (Number(y) + dy));
	if (border) return { name: border.name, d: border.frame.path, w: border.w, h: border.h };
	if (item) {
		const longest = Math.max(item.path.length, ...(item.layers || []).map(layer => layer.path.length));
		const tiles = item.tile === true ? Math.max(1, Math.min(globalThis.RapierOrnaments.bandTiles(item), Math.floor(900000 / longest))) : 1;
		const laid = path => Array.from({ length: tiles }, (_, i) => moved(path, i * item.w, 0)).join('');
		return { name: item.name, d: laid(item.path), w: item.w * tiles, h: item.h, ...(item.layers ? { layers: item.layers.map(layer => ({ d: laid(layer.path), opacity: layer.opacity })) } : {}) };
	}
	const box = globalThis.RapierDrawOrnaments.outlineBox(entry.path), pad = 12;
	return { name: set.name + ' ' + (entry.letter || entry.key), d: moved(entry.path, pad - box[0], pad - box[1]), w: box[2] - box[0] + 2 * pad, h: box[3] - box[1] + 2 * pad };
}
async function _rapierDrawPlaceOrnament(piece, session) {
	const state = _rapierDrawState;
	if (!state.open || state.session !== session || state.finishing) return;
	await _rapierDrawSetTool('select');
	if (!state.open || state.session !== session || state.finishing || _rapierDrawTool() !== 'select') return;
	const vb = state.svgRoot.viewBox.baseVal, scale = Math.min(vb.width * .62 / piece.w, vb.height * .62 / piece.h);
	const shape = { id: 'ornament', recognized: 'ornament', geom: { cx: vb.x + vb.width / 2, cy: vb.y + vb.height / 2, w: piece.w * scale, h: piece.h * scale }, ornament: { d: piece.d, w: piece.w, h: piece.h, ...(piece.layers ? { layers: piece.layers } : {}) } };
	if (state.ink) shape.ink = state.ink;
	const incoming = _rapierDrawAdmitRecipe({ version: RAPIER_DRAW_VERSION, canvas: { w: state.recipe.canvas.w, h: state.recipe.canvas.h }, strokes: [], shapes: [shape] });
	if (!incoming) { showToast(piece.name + ' is too large to place in a drawing.', 'error'); return; }
	await _rapierPaintFlushRevision();
	state.lastTap = null;
	await _rapierDrawPasteRecipe(incoming);
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
		'<span class="rapier-draw-head-start"><button type="button" class="rapier-draw-current-tool" data-draw-act="toolMenu" aria-haspopup="menu" aria-expanded="false"></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-canvas-toggle" data-draw-act="canvas" aria-label="Canvas" aria-haspopup="menu" aria-expanded="false">' + RAPIER_DRAW_ICONS.canvas + '</button></span>' +
		'<span class="rapier-draw-head-end"><span class="rapier-draw-head-clear">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--clear" data-draw-act="clear">Clear</button></span>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--done" data-draw-act="done">Done</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--stowed" data-draw-act="close">Close</button></span></div>' +
		'<div class="rapier-draw-tool-menu" role="menu" aria-label="Drawing tools" hidden>' + RAPIER_DRAW_TOOL_SECTIONS.map(([title, names]) =>
			'<div class="rapier-draw-tool-menu-section" role="group" aria-label="' + title + '"><div class="rapier-draw-tool-menu-head" role="presentation">' + title + '</div>' + names.filter(name => name !== 'gallery' || _rapierDrawGalleryOffered()).map(name => name === 'image' || name === 'gallery'
			? '<button type="button" class="rapier-draw-tool-menu-item" role="menuitem" data-draw-act="' + name + '" aria-label="' + RAPIER_DRAW_TOOL_SAYS[name] + '">' + RAPIER_DRAW_ICONS[name] + '<span>' + RAPIER_DRAW_TOOL_WORDS[name] + '</span></button>'
			: '<button type="button" class="rapier-draw-tool-menu-item" role="menuitemradio" data-draw-act="tool" data-draw-tool="' + name + '" aria-checked="false" aria-label="' + RAPIER_DRAW_TOOL_SAYS[name] + '">' + RAPIER_DRAW_ICONS[name] + '<span>' + RAPIER_DRAW_TOOL_WORDS[name] + '</span></button>').join('') + '</div>').join('') +
			'</div>' +
		'<div class="rapier-draw-tool-menu rapier-draw-canvas-menu" role="menu" aria-label="Canvas" hidden>' +
		'<button type="button" class="rapier-draw-tool-menu-item rapier-draw-canvas-row" role="menuitem" data-draw-act="canvasSwap"><span>Canvas</span></button>' +
		'<button type="button" class="rapier-draw-tool-menu-item" role="menuitem" data-draw-act="canvasBackground"><span>Background</span><i class="rapier-draw-menu-swatch" data-draw-background-swatch hidden></i><em class="rapier-draw-menu-note" data-draw-background-note>None</em></button>' +
		'<button type="button" class="rapier-draw-tool-menu-item" role="menuitem" data-draw-act="canvasResize"><span>Resize</span></button>' +
		'<button type="button" class="rapier-draw-tool-menu-item" role="menuitemcheckbox" data-draw-act="canvasAdaptive" aria-checked="true"><span>Adaptive: on</span></button>' +
		'<button type="button" class="rapier-draw-tool-menu-item" role="menuitem" data-draw-act="timelapse" hidden><span>Time-lapse</span></button>' +
		'</div></div>' +
		'<div class="rapier-draw-settings" role="toolbar" aria-label="Tool settings"><div class="rapier-draw-settings-controls">' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--quiet" data-draw-setting="copyMachine" data-draw-act="copyMachine" aria-expanded="false">Copy machine</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--quiet" data-draw-setting="refractedLight" data-draw-act="refractedLight" aria-expanded="false">Refracted light</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--quiet" data-draw-setting="liquidLight" data-draw-act="liquidLight" aria-expanded="false">Liquid light</button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="penMode" data-draw-act="penMode" aria-label="pen mode" data-tip="mode" aria-expanded="false">' + RAPIER_DRAW_ICONS.penInk + '<span class="rapier-draw-btn-name">ink</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="ink" data-draw-act="ink" aria-label="color" data-tip="color" aria-expanded="false"><span class="rapier-draw-ink-dot"></span><span class="rapier-draw-btn-name">color</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="nib" data-draw-act="nib" aria-label="width" data-tip="width" aria-expanded="false">' + RAPIER_DRAW_ICONS.width + '<span class="rapier-draw-btn-name">width</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="smooth" data-draw-act="smooth" aria-label="smooth" data-tip="smooth" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">smooth</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--dip" data-draw-setting="dip" data-draw-act="dip" aria-label="paint" data-tip="paint" aria-expanded="false">' + RAPIER_DRAW_ICONS.paint + '<span class="rapier-draw-btn-name">paint</span></button>' +
		_rapierWaterToolbarHTML() +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintBrushes" data-draw-act="paintBrushes" aria-label="brush" data-tip="brush" aria-expanded="false">' + RAPIER_DRAW_ICONS.brush + '<span class="rapier-draw-btn-name">brush</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintTools" data-draw-act="paintTools" aria-label="tool" data-tip="tool" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">tool</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="paintSet" data-draw-act="paintSet" aria-label="set the current painting as a picture" data-tip="set">' + RAPIER_DRAW_ICONS.image + '<span class="rapier-draw-btn-name">set</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--kinds" data-draw-setting="kinds" data-draw-act="kinds" aria-label="shape" data-tip="shape" aria-expanded="false"><span class="rapier-draw-btn-name">shape</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon rapier-draw-btn--options" data-draw-setting="options" data-draw-act="options" aria-label="options" data-tip="options" aria-expanded="false">' + RAPIER_DRAW_ICONS.sliders + '<span class="rapier-draw-btn-name">options</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textSize" data-draw-act="textSize" aria-label="text size" data-tip="size" aria-expanded="false">' + RAPIER_DRAW_ICONS['text-size'] + '<span class="rapier-draw-btn-name">size</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textFont" data-draw-act="textFont" aria-label="font" data-tip="font" aria-expanded="false">' + RAPIER_DRAW_ICONS.typography + '<span class="rapier-draw-btn-name">font</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textSpacing" data-draw-act="textSpacing" aria-label="text spacing" data-tip="spacing" aria-expanded="false">' + RAPIER_DRAW_ICONS['space-x'] + '<span class="rapier-draw-btn-name">spacing</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textStyle" data-draw-act="textStyle" aria-label="text style" data-tip="style" aria-expanded="false">' + RAPIER_DRAW_ICONS.bold + '<span class="rapier-draw-btn-name">style</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="textAlign" data-draw-act="textAlign" aria-label="text alignment" data-tip="align" aria-expanded="false">' + RAPIER_DRAW_ICONS['align-left'] + '<span class="rapier-draw-btn-name">align</span></button>' +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="eraseEdge" data-draw-act="eraseEdge" aria-label="eraser edge softness, for painted marks" data-tip="edge (paint)" aria-expanded="false">' + RAPIER_DRAW_ICONS.smooth + '<span class="rapier-draw-btn-name">edge</span></button>' +
		'</div><button type="button" class="rapier-draw-settings-collapse" data-draw-act="settingsCollapse" aria-label="Hide tool controls" aria-expanded="true">' + RAPIER_DRAW_ICONS.chevron + '</button></div>' +
		'<div class="rapier-draw-panels">' +
		'<div class="rapier-draw-resize-strip" data-draw-resize-strip role="group" aria-label="Resize the canvas" hidden>' +
		RAPIER_DRAW_RESIZE_PRESETS.map(([id, word]) => '<button type="button" class="rapier-draw-chip" data-draw-act="resizePreset" data-draw-preset="' + id + '" aria-pressed="false">' + word + '</button>').join('') +
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--done rapier-draw-resize-done" data-draw-act="resizeDone">Done</button></div>' +
		'<div class="rapier-draw-options" data-draw-panel="options" hidden role="group" aria-label="Options">' + [['snap', 'magnet', 'Snap to shapes', true], ['repeat', 'repeat', 'Repeat shape', false], ['proportions', 'proportions', 'Keep proportions', false], ['center', 'center', 'Resize from center', false]].map(([act, icon, word, on]) =>
			'<button type="button" class="rapier-draw-option" role="switch" data-draw-act="' + act + '" aria-checked="' + on + '">' + RAPIER_DRAW_ICONS[icon] + '<span>' + word + '</span><span class="rapier-draw-switch" aria-hidden="true"></span></button>').join('') +
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
		'<div class="rapier-draw-anglepanel" data-draw-panel="angle" hidden role="group" aria-label="Brush angle">' +
		'<div class="rapier-draw-anglepanel-dial" data-draw-angle-dial tabindex="0" role="slider" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="179" aria-valuenow="45" aria-label="Brush angle. Drag round to turn the head. Arrow keys turn it, Enter switches between held and follow">' +
		'<svg viewBox="-60 -60 120 120" aria-hidden="true"><circle class="rapier-draw-angle-ring" r="54"></circle>' +
		[0, 45, 90, 135].map(a => '<path class="rapier-draw-angle-tick" d="M44 0H54" transform="rotate(' + a + ')"></path><path class="rapier-draw-angle-tick" d="M44 0H54" transform="rotate(' + (a + 180) + ')"></path>').join('') +
		'<ellipse class="rapier-draw-angle-head" rx="40" ry="11" transform="rotate(45)"></ellipse></svg></div>' +
		'<div class="rapier-draw-anglepanel-side"><output class="rapier-draw-angle-number" aria-live="polite"></output>' +
		'<div class="rapier-draw-anglepanel-modes" role="group" aria-label="Held or follow">' +
		'<button type="button" class="rapier-draw-chip" data-draw-angle-mode="held" aria-pressed="false">Held</button>' +
		'<button type="button" class="rapier-draw-chip" data-draw-angle-mode="follow" aria-pressed="true">Follow</button></div>' +
		'<div class="rapier-draw-anglepanel-presets" role="group" aria-label="Preset angles">' +
		[0, 45, 90, 135].map(a => '<button type="button" class="rapier-draw-chip" data-draw-angle-set="' + a + '" aria-pressed="false">' + a + '\u00b0</button>').join('') + '</div></div></div>' +
		'<div class="rapier-draw-kinds" data-draw-panel="kinds" hidden role="radiogroup" aria-label="Shape"></div>' +
		'<div class="rapier-draw-text-panel rapier-draw-pen-modes" data-draw-panel="penMode" hidden role="radiogroup" aria-label="Pen mode">' +
		RAPIER_DRAW_PEN_MODES.map(([id, word, says]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" role="radio" data-draw-pen-mode="' + id + '" aria-checked="false" tabindex="-1" aria-label="' + word + ': ' + says + '">' + RAPIER_DRAW_ICONS[id === 'pen' ? 'penLine' : 'penInk'] + '<span class="rapier-draw-chip-name">' + word + '</span></button>').join('') + '</div>' +
		'<div class="rapier-draw-brushes" data-draw-panel="paintBrushes" hidden role="radiogroup" aria-label="Brushes"></div>' +
		_rapierWaterPanelsHTML() +
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
		'<span class="rapier-draw-text-cases" role="group" aria-label="Case">' + RAPIER_DRAW_TEXT_CASES.map(([id, face, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-text-case' + (id === 'small' ? ' rapier-draw-text-case--small' : '') + '" data-draw-text-case="' + id + '" aria-label="' + word + '" aria-pressed="' + !id + '">' + face + '</button>').join('') + '</span></div>' +
		'<div class="rapier-draw-text-panel" data-draw-panel="textAlign" hidden role="group" aria-label="Text alignment">' +
		[['start', 'align-left', 'Left'], ['middle', 'align-center', 'Center'], ['end', 'align-right', 'Right']].map(([id, icon, word]) => '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-text-align="' + id + '" aria-label="' + word + '" aria-pressed="' + (id === 'start') + '">' + RAPIER_DRAW_ICONS[icon] + '<span class="rapier-draw-chip-name">' + word + '</span></button>').join('') + '</div>' +
		'<div class="rapier-draw-smooth rapier-draw-erase-edge" data-draw-panel="eraseEdge" hidden><label class="rapier-draw-smooth-label" for="rapier-draw-erase-edge-input">Edge</label>' +
		'<input id="rapier-draw-erase-edge-input" class="rapier-draw-nib-range" type="range" min="0" max="100" step="1" value="0" aria-describedby="rapier-draw-erase-edge-word">' +
		'<span class="rapier-draw-edge-sample" aria-hidden="true"></span><output id="rapier-draw-erase-edge-word" class="rapier-draw-nib-word" for="rapier-draw-erase-edge-input">Hard</output></div></div>' +
		'<div class="rapier-draw-viewport-probe" aria-hidden="true"></div><div class="rapier-draw-stage"><svg class="rapier-draw-canvas" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="application" aria-describedby="rapier-draw-keys"><desc id="rapier-draw-keys">Page Down and Page Up select shapes. Home selects the first, End the last. Shift adds to the selection. Arrow keys move; Shift moves farther. Enter edits a label or places the chosen shape or text. Delete removes the selection. Tab reaches tools and handles.</desc><defs>' + RAPIER_DRAW_PAINT_INK_FILTER + '</defs><style class="rapier-draw-dark"></style><rect class="rapier-draw-paper" x="0" y="0"/><path class="rapier-draw-replay-lead" d=""/><g class="rapier-draw-shapes"></g><g class="rapier-draw-replay-paint" aria-hidden="true"></g><g class="rapier-draw-preview"></g><g class="rapier-draw-guides"></g><path class="rapier-draw-press-ring" d=""/><path class="rapier-draw-scribble" d=""/><path class="rapier-draw-live" d=""/><rect class="rapier-draw-marquee" hidden/><g class="rapier-draw-replay-nib" aria-hidden="true"></g></svg>' +
		'<svg class="rapier-paint-head-overlay" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0"><path class="rapier-draw-outline" d=""/></svg>' +
		'<span class="rapier-draw-nib-tag" aria-hidden="true" hidden></span>' +
		'<div class="rapier-draw-replay-bar" hidden>' +
		'<button type="button" class="rapier-draw-replay-btn" data-draw-replay="faster">Faster</button>' +
		'<button type="button" class="rapier-draw-replay-btn" data-draw-replay="skip">Skip</button></div>' +
		'<div class="rapier-draw-hint" aria-hidden="true">Tap to paint</div><div class="rapier-draw-resize" hidden aria-hidden="true"></div></div><div class="rapier-draw-handles"></div><div class="rapier-draw-menu" hidden></div><input class="rapier-draw-font-input" type="file" accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.zip,font/ttf,font/otf,font/woff,font/woff2,application/zip" multiple hidden><input class="rapier-draw-brush-input" type="file" accept=".myb,application/json" hidden><input class="rapier-draw-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/jxl,.jxl,image/svg+xml,.svg" multiple hidden>';
	const dials = document.createElement('span'); dials.className = 'rapier-draw-head-dials';
	dials.append(_rapierDrawDialButton('undo'), _rapierDrawDialButton('redo'));
	surface.querySelector('.rapier-draw-head-end').before(dials);
	_rapierDrawEffectsBuild(surface);
	document.body.appendChild(surface);
	for (const input of surface.querySelectorAll('input[type="range"]')) _rapierDrawSeekWrap(input);
	_rapierDrawGuardRowSwipes(surface);
	_rapierPaintMixBind(surface);
	const state = _rapierDrawState;
	surface.addEventListener('pointerdown', event => {
		for (const menu of surface.querySelectorAll('.rapier-draw-my-fonts[open]')) if (!menu.contains(event.target)) menu.open = false;
		if (!state.toolMenuOpen && !state.canvasMenuOpen || event.target.closest('.rapier-draw-tool-menu,[data-draw-act="toolMenu"],[data-draw-act="canvas"]')) return;
		_rapierDrawSetToolMenu(false); _rapierDrawSetCanvasMenu(false);
		if (event.target.closest('.rapier-draw-stage')) { event.preventDefault(); event.stopPropagation(); }
	}, true);
	state.surface = surface; state.svgRoot = surface.querySelector('.rapier-draw-canvas'); state.svg = surface.querySelector('.rapier-draw-shapes');
	state.svg.addEventListener('click', evt => {
		const shape = evt.target.closest('[data-shape-id]');
		if (!shape || evt.defaultPrevented || evt.detail !== 0 || state.finishing) return;
		evt.preventDefault(); evt.stopPropagation();
		void _rapierDrawSelectCanvasShape(shape.getAttribute('data-shape-id'), {toggle: true});
	});
	state.live = surface.querySelector('.rapier-draw-live'); state.preview = surface.querySelector('.rapier-draw-preview'); state.marqueeEl = surface.querySelector('.rapier-draw-marquee');
	state.pressRingEl = surface.querySelector('.rapier-draw-press-ring'); state.scribbleEl = surface.querySelector('.rapier-draw-scribble'); state.headEl = surface.querySelector('.rapier-draw-outline');
	state.stageEl = surface.querySelector('.rapier-draw-stage'); state.resizeLayer = surface.querySelector('.rapier-draw-resize');
	state.replayLeadEl = surface.querySelector('.rapier-draw-replay-lead'); state.replayNibEl = surface.querySelector('.rapier-draw-replay-nib'); state.replayPaintEl = surface.querySelector('.rapier-draw-replay-paint');
	state.replayTagEl = surface.querySelector('.rapier-draw-nib-tag'); state.replayBarEl = surface.querySelector('.rapier-draw-replay-bar');
	_rapierDrawBindTap(state.replayBarEl, evt => {
		const act = evt.target.closest('[data-draw-replay]')?.dataset.drawReplay;
		if (!act) return;
		evt.preventDefault(); evt.stopPropagation();
		if (act === 'skip') _rapierDrawReplayEnd('skipped'); else _rapierDrawReplayFaster();
	});
	state.menu = surface.querySelector('.rapier-draw-menu'); state.handlesLayer = surface.querySelector('.rapier-draw-handles'); state.closeBtn = surface.querySelector('[data-draw-act="close"]'); state.guidesEl = surface.querySelector('.rapier-draw-guides'); state.fontInput = surface.querySelector('.rapier-draw-font-input'); state.paintBrushInput = surface.querySelector('.rapier-draw-brush-input'); state.imageInput = surface.querySelector('.rapier-draw-image-input'); state.hintEl = surface.querySelector('.rapier-draw-hint');
	state.clearWatch?.disconnect();
	state.clearWatch = new MutationObserver(() => _rapierDrawSetClearWord());
	state.clearWatch.observe(surface, { childList: true, subtree: true, attributes: true, attributeFilter: ['d'] });
	Object.defineProperty(surface, 'rapierDrawPerf', {
		enumerable: false,
		get() {
			const recipe = state.recipe, snapshotBytes = recipe ? JSON.stringify({ ...recipe, fonts: undefined }).length : 0;
			let historyBytes = 0, deltas = 0, snapshots = 0;
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
				strokeChunkCount: state.strokeChunks?.length || 0, strokeFrozen: (state.strokeHead || []).concat(...(state.strokeChunks || [])).map(p => [p[0], p[1]]),
				strokeAll: (state.stroke || []).map(p => [p[0], p[1]]),
				historyBytes, historyCount: state.undoStack.length, snapshotBytes, historyDeltas: deltas, historySnapshots: snapshots,
				historyRasterBytes, historyRasterDistinctBytes, historyRasterReferencedBytes,
			};
		},
	});
	const canvasTouches = state.canvasTouches = new Map();
	surface.addEventListener('pointerdown', _rapierDrawGuard(evt => {
		if (!_rapierDrawIsCanvasTouch(evt.target, surface) || evt.pointerType === 'mouse' && evt.button !== 0) return;
		if (evt.pointerType === 'touch' && evt.width >= 40 && evt.height >= 40) { evt.preventDefault(); evt.stopImmediatePropagation(); return; }
		const departing = !state.toolChange && state.paintDeparture && !['pen', 'brush', 'shape', 'text'].includes(_rapierDrawTool()) ? state.paintDeparture : null;
		if ((state.toolChange || departing) && !state.heldPress) {
			evt.preventDefault(); evt.stopImmediatePropagation();
			try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
			state.heldPress = {down: evt, moves: [], up: null, change: state.toolChange || departing};
			return;
		}
		if (state.heldPress) { evt.preventDefault(); evt.stopImmediatePropagation(); return; }
		const otherMarkerPointer = state.markerPress && evt.pointerId !== state.markerPress.down.pointerId;
		if (evt.pointerType !== 'touch') {
			if (otherMarkerPointer) {
				evt.preventDefault(); evt.stopImmediatePropagation();
				try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
			}
			return;
		}
		canvasTouches.set(evt.pointerId, {id: evt.pointerId, screen: [evt.clientX, evt.clientY]});
		if (canvasTouches.size < 2 || state.gesture?.kind === 'zoom' || state.finishing) {
			if (otherMarkerPointer) {
				evt.preventDefault(); evt.stopImmediatePropagation();
				try { state.svgRoot.setPointerCapture(evt.pointerId); } catch (_) {}
			}
			return;
		}
		if (state.markerPress) try { state.svgRoot.setPointerCapture(state.markerPress.down.pointerId); } catch (_) {}
		delete state.markerPress;
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
		const held = state.heldPress;
		if (held?.down.pointerId === evt.pointerId) { if (!held.up) held.moves.push(evt); evt.stopImmediatePropagation(); return; }
		if (canvasTouches.has(evt.pointerId)) canvasTouches.get(evt.pointerId).screen = [evt.clientX, evt.clientY];
	}, true);
	for (const type of ['pointerup', 'pointercancel']) surface.addEventListener(type, evt => {
		const held = state.heldPress;
		if (held?.down.pointerId === evt.pointerId) { held.up ||= evt; evt.stopImmediatePropagation(); return; }
		canvasTouches.delete(evt.pointerId);
	}, true);
	surface.addEventListener('lostpointercapture', evt => { if (!state.open) canvasTouches.clear(); }, true);

	surface.addEventListener('pointerdown', evt => {
		const marker = evt.target.closest?.('.rapier-changes-mark');
		if (!marker || state.markerPress || state.gesture || state.pointerId != null || evt.pointerType === 'mouse' && evt.button !== 0) return;
		state.markerPress = {down: evt, moves: [], marker, session: state.session, tool: _rapierDrawTool()};
		try { marker.setPointerCapture(evt.pointerId); } catch (_) {}
	});
	surface.addEventListener('pointermove', _rapierDrawGuard(evt => {
		const press = state.markerPress;
		if (!press || evt.pointerId !== press.down.pointerId) return;
		if (!state.open || state.session !== press.session || !press.marker.isConnected || !surface.contains(press.marker) ||
			_rapierDrawTool() !== press.tool || state.gesture || state.pointerId != null) { delete state.markerPress; return; }
		press.moves.push(evt);
		if (Math.hypot(evt.clientX - press.down.clientX, evt.clientY - press.down.clientY) <= RAPIER_DRAW_MOVE_THRESHOLD_PX) return;
		delete state.markerPress;
		_rapierDrawOnPointerDown(press.down);
		for (const move of press.moves) _rapierDrawOnPointerMove(move);
	}));
	for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, evt => {
		if (state.markerPress?.down.pointerId === evt.pointerId) { delete state.markerPress; canvasTouches.delete(evt.pointerId); }
	}, true);

	state.svgRoot.addEventListener('pointermove', evt => { if (evt.pointerType === 'mouse' && !state.gesture) _rapierPaintHeadHover(evt); });
	state.svgRoot.addEventListener('pointerleave', evt => { if (evt.pointerType === 'mouse' && !state.gesture) _rapierPaintHeadHide(); });
	for (const target of [state.svgRoot, state.handlesLayer, state.resizeLayer]) for (const [event, handler] of [['pointerdown', _rapierDrawOnPointerDown], ['pointermove', _rapierDrawOnPointerMove], ['pointerup', _rapierDrawOnPointerUp], ['pointercancel', _rapierDrawOnPointerCancel], ['lostpointercapture', _rapierDrawOnPointerCancel]]) target.addEventListener(event, _rapierDrawGuard(handler));
	document.addEventListener('pointerdown', () => { state.echoTap = null; }, true);
	document.addEventListener('click', evt => {
		const echo = state.echoTap;
		if (!echo || !evt.detail && !evt.clientX && !evt.clientY || evt.pointerId > 0 && evt.pointerId !== echo.id || Math.hypot(evt.clientX - echo.x, evt.clientY - echo.y) > 16) return;
		state.echoTap = null; evt.preventDefault(); evt.stopImmediatePropagation();
	}, true);
	window.addEventListener('blur', _rapierDrawCancelGesture);
	document.addEventListener('visibilitychange', () => { if (document.hidden) { _rapierDrawBackupFlush(); _rapierDrawCancelGesture(); } });
	const reposition = () => {
		if (!state.open) return;
		if (_rapierDrawViewFollowStage()) _rapierDrawApplyView();
		if (!state.gesture) { _rapierDrawFollowStage(); _rapierDrawUpdateMenu(); _rapierDrawUpdateHandles(); _rapierDrawPlaceTextInput(); _rapierPaintPlaceLive(); }
	};
	window.addEventListener('resize', reposition); window.visualViewport?.addEventListener('resize', reposition); window.visualViewport?.addEventListener('scroll', reposition);
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
			else if (name === 'penMode') { _rapierDrawUpdatePenModes(); if (button?.matches(':focus-visible')) panel.querySelector('[aria-checked="true"]')?.focus({preventScroll: true}); }
		}
		reposition();
	};
	const toolbar = async evt => {
		const button = evt.target.closest('[data-draw-act]'), act = button?.dataset.drawAct;
		if (!act) return;
		if (state.finishing) { if (act === 'undo' || act === 'redo') _rapierDialTurn(button, act === 'redo', false); return; }
		if (state.resize && act !== 'resizeDone' && act !== 'resizePreset') {
			if (act === 'undo') { await _rapierDrawResizeDone(true); return; }
			if (act === 'redo' || act === 'clear') return;
			await _rapierDrawResizeDone(false);
		}
		if (document.activeElement?.dataset.drawHex) document.activeElement.blur();
		state.dropper?.close(true);
		if (state.textEdit?.composing) {
			const session = state.session;
			state.textEdit.afterFinish = () => { if (state.open && state.session === session && button.isConnected) void toolbar({ target: button }); };
			_rapierDrawFinishText(); return;
		}
		if (!_rapierDrawFinishText()) return;
		_rapierDrawCancelGesture();
		if (act !== 'toolMenu' && act !== 'image' && act !== 'gallery') _rapierDrawSetToolMenu(false);
		if (!RAPIER_DRAW_CANVAS_ACTS.includes(act) || act === 'canvasResize') _rapierDrawSetCanvasMenu(false);
		if (act === 'toolMenu') { _rapierDrawSetToolMenu(!state.toolMenuOpen); return; }
		if (act === 'undo' || act === 'redo') _rapierDialTurn(button, act === 'redo', () => _rapierDrawUndo(act === 'redo'));
		else if (act === 'options' || ['textSize', 'textFont', 'textSpacing', 'textStyle', 'textAlign', 'eraseEdge', 'penMode'].includes(act)) togglePanel(button, act);
		else if (['snap', 'repeat', 'proportions', 'center'].includes(act)) { const key = act === 'center' ? 'resizeFromCenter' : act; state[key] = !state[key]; button.setAttribute('aria-checked', String(state[key])); _rapierDrawUpdateMenu(); }
		else if (act === 'unlockAll') _rapierDrawEditSelection({ type: 'unlockAll' });
		else if (act === 'tool') _rapierDrawSetTool(button.dataset.drawTool === 'brush' ? _rapierDrawPenMode() : button.dataset.drawTool);
		else if (act === 'canvas') _rapierDrawSetCanvasMenu(!state.canvasMenuOpen);
		else if (act === 'canvasSwap') {
			const next = _rapierDrawDarkPaper() ? 'white' : 'black';
			await _rapierDrawCommand(() => { state.recipe.paper = next; });
			_rapierPaintSyncPaper(); _rapierDrawSyncCanvasMenu();
		}
		else if (act === 'canvasBackground') { _rapierDrawOpenBackgroundPanel(); }
		else if (act === 'canvasResize') _rapierDrawResizeStart();
		else if (act === 'canvasAdaptive') await _rapierDrawSetAdaptive(!!state.recipe.frame);
		else if (act === 'timelapse') await _rapierWaterProVideo().catch(_rapierWaterProError);
		else if (act === 'resizePreset') _rapierDrawResizePreset(button.dataset.drawPreset);
		else if (act === 'resizeDone') await _rapierDrawResizeDone(false);
		else if (act === 'image') {
			if (!state.open || state.finishing) return;
			state.imageInput.value = ''; state.imageInput.click();
		}
		else if (act === 'gallery') await _rapierDrawOpenGallery();
		else if (act === 'nib') _rapierDrawToggleNibRow();
		else if (act === 'copyMachine' || act === 'refractedLight' || act === 'liquidLight') { _rapierDrawEffectsOpen(act === 'copyMachine' ? 'copier' : act === 'liquidLight' ? 'liquid' : 'refraction'); reposition(); }
		else if (act === 'smooth') _rapierDrawToggleSmoothRow();
		else if (act === 'kinds') {
			const open = !state.kindsOpen;
			_rapierDrawCloseSettingPanels(open ? 'kinds' : '');
			state.kindsOpen = open;
			button.setAttribute('aria-expanded', String(open));
			_rapierDrawUpdateShapeRow();
			if (state.kindsOpen) surface.querySelector('.rapier-draw-kinds [role="radio"][aria-checked="true"]').focus({preventScroll: true});
			reposition();
		}
		else if (act === 'dip') {
			const open = !!_rapierPaintDipPanel()?.hidden;
			_rapierDrawCloseSettingPanels(open ? 'dip' : '');
			_rapierPaintDipOpen(open); reposition();
		}
		else if (act === 'waterDry') { _rapierDrawCloseSettingPanels(); void _rapierWaterRunAction({kind:'dry'}); }
		else if (act.startsWith('water')) { _rapierWaterOpen(act); reposition(); }
		else if (act === 'paintBrushes' || act === 'paintTools') {
			const mode = act === 'paintTools' ? 'tools' : 'brushes', open = state.paintPicker !== mode;
			_rapierDrawCloseSettingPanels(open ? act : '');
			_rapierPaintSetPicker(mode, open); button.setAttribute('aria-expanded', String(open)); reposition();
		}
		else if (act === 'paintUpload') void _rapierDrawPaintUpload();
		else if (act === 'fontUpload') {
			state.fontUploadTarget = 'default';
			if (!state.open || state.finishing) return;
			state.fontInput.value = ''; state.fontInput.click();
		}
		else if (act === 'paintExport') _rapierPaintExportBrush(_rapierPaintBrushId());
		else if (act === 'paintSet') void _rapierPaintRequestSetLayer();
		else if (act === 'settingsCollapse') { _rapierDrawSetSettingsCollapsed(!state.settingsCollapsed); reposition(); }
		else if (act === 'clear') void (_rapierDrawClearExits() ? _rapierDrawFinish() : _rapierDrawRequestClear());
		else if (act === 'ink') {
			const open = !state.colourOpen;
			_rapierDrawCloseSettingPanels(open ? 'ink' : '');
			state.colourOpen = open; button.setAttribute('aria-expanded', String(open));
			_rapierDrawUpdateInkBtn(); reposition();
		}
		else if (act === 'done') void _rapierDrawSavePainting();
		else if (act === 'close') void _rapierDrawClose({ recover: true });
	};
	for (const selector of ['.rapier-draw-head', '.rapier-draw-tool-menu', '.rapier-draw-canvas-menu', '.rapier-draw-resize-strip', '.rapier-draw-settings', '.rapier-draw-options']) _rapierDrawBindTap(surface.querySelector(selector), evt => { void toolbar(evt); });
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-pen-modes'), evt => { const mode = evt.target.closest('[data-draw-pen-mode]')?.dataset.drawPenMode; if (mode && !state.finishing) void _rapierDrawSetTool(mode); });
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-kinds'), evt => { const kind = evt.target.closest('[data-draw-kind]')?.dataset.drawKind; if (kind && !state.finishing) { state.kindsOpen = false; _rapierDrawSetShapeKind(kind); } });
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
	_rapierWaterBind(surface);
	_rapierDrawBindTap(surface.querySelector('.rapier-draw-colours'), _rapierDrawMenuAction);
	_rapierDrawBindTap(state.menu, _rapierDrawGuard(_rapierDrawMenuAction));
	state.fontInput.addEventListener('change', () => {
		const files = Array.from(state.fontInput.files || []), target = state.fontUploadTarget || 'selection';
		state.fontInput.value = ''; state.fontUploadTarget = null;
		if (files.length) void _rapierDrawUploadFont(files, target);
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
	surface.addEventListener('change', evt => {
		const input = evt.target, scope = input.dataset.drawColour;
		if (scope) _rapierDrawChooseColour(scope, input.value, true);
		else if (input.dataset.drawHex) _rapierDrawCommitHex(input);
	});
	surface.addEventListener('contextmenu', evt => {
		if (evt.target.closest('input,textarea,select')) return;
		evt.preventDefault();
		if (evt.pointerType === 'touch' || !state.open || state.finishing || state.gesture || !_rapierDrawIsCanvasTouch(evt.target, surface) || evt.target.closest('.rapier-draw-menu,.rapier-draw-handle')) return;
		const id = _rapierDrawHitShape(_rapierDrawSurfacePoint(evt).slice(0, 2));
		if (id && !_rapierDrawSelection().includes(id)) void _rapierDrawSelectCanvasShape(id);
	});
	surface.addEventListener('wheel', evt => {
		if (!(evt.ctrlKey || evt.metaKey) || !state.open || state.finishing) return;
		evt.preventDefault();
		_rapierDrawZoomAt(evt.clientX, evt.clientY, Math.exp(-evt.deltaY * 0.0015));
	}, { passive: false });
	surface.addEventListener('keydown', async evt => {
		evt.stopPropagation();
		if (evt.defaultPrevented || evt.isComposing || evt.keyCode === 229) return;
		const chord = _rapierChordOf(evt);
		if (_rapierTrapModalTab(evt, surface)) return;
		if (chord === 'Escape' && state.textEdit && evt.target.closest('.rapier-draw-text-editor')) { evt.preventDefault(); _rapierDrawFinishText(); return; }
		if (evt.target.dataset.drawHex) {
			if (chord === 'Enter') { evt.preventDefault(); if (_rapierDrawCommitHex(evt.target)) surface.focus({ preventScroll: true }); else evt.target.reportValidity(); }
			else if (chord === 'Escape') { evt.preventDefault(); _rapierDrawUpdateInkBtn(); _rapierDrawUpdateMenu(); surface.focus({ preventScroll: true }); }
			return;
		}
		if (state.dropper) { if (chord === 'Escape' || state.dropper.key?.(chord)) evt.preventDefault(); if (chord === 'Escape') state.dropper.close(false); return; }
		if (state.resize) { if (chord === 'Escape' || chord === 'Mod+Z') { evt.preventDefault(); await _rapierDrawResizeDone(true); } return; }
		if (!state.finishing && (_rapierDrawMenuKey(evt) || _rapierDrawRadioKey(evt) || _rapierDrawTabKey(evt))) return;
		if (['Mod+Z', 'Mod+Y', 'Mod+Shift+Z'].includes(chord) && !state.finishing && !evt.target.closest('input:not([type="range"]),textarea,select')) { evt.preventDefault(); _rapierDrawUndo(chord !== 'Mod+Z'); return; }
		if (chord === 'Mod+A' && !state.finishing && !evt.target.closest('input:not([type="range"]),textarea,select')) {
			evt.preventDefault();
			const session = state.session;
			await _rapierDrawSetTool('select');
			if (!state.open || state.session !== session || _rapierDrawTool() !== 'select') return;
			state.svgRoot.focus({preventScroll: true});
			_rapierDrawSetSelection(_rapierDrawGroupSelection(state.recipe, state.recipe.shapes.map(shape => shape.id))); _rapierDrawRenderAll(); return;
		}
		if ((chord === 'Delete' || chord === 'Backspace') && !state.finishing && !evt.target.closest('input:not([type="range"]),textarea,select') && _rapierDrawTool() === 'select' && _rapierDrawSelection().length && !_rapierDrawSelectionLocked()) { evt.preventDefault(); _rapierDrawEditSelection({ type: 'delete' }); return; }
		if (chord === 'Escape' && evt.target.closest('[data-draw-panel]')) {
			evt.preventDefault();
			const kept = evt.target.value;
			_rapierDrawCloseSettingPanels();
			if (kept != null && evt.target.value !== kept) evt.target.value = kept;
			_rapierDrawUpdateMenu(); _rapierDrawUpdateHandles();
			return;
		}
	if (evt.target.closest('input,textarea,select,[data-draw-menu-act="property"]') || state.finishing) return;
		if (chord === 'Escape') {
			evt.preventDefault();
			if (state.toolMenuOpen) _rapierDrawSetToolMenu(false);
			else if (state.canvasMenuOpen) _rapierDrawSetCanvasMenu(false);
			else if (state.gesture || state.markerPress) _rapierDrawCancelGesture();
			else if (_rapierDrawSelection().length) { _rapierDrawSetSelection([]); _rapierDrawRenderAll(); }
			else _rapierDrawHandleBack();
			return;
		}
		if (evt.target.closest('.rapier-draw-dip-pad')) return;
		if (evt.target.closest('button,a[href],[role="button"]') && !evt.target.closest('[data-draw-handle],[data-shape-id]')) return;
		const onCanvas = evt.target === surface || state.svgRoot.contains(evt.target);
		if (onCanvas && !evt.ctrlKey && !evt.metaKey && !evt.altKey && ['PageDown', 'PageUp', 'Home', 'End'].includes(evt.key)) {
			evt.preventDefault();
			if (state.gesture) return;
			const session = state.session;
			if (_rapierDrawTool() !== 'select') await _rapierDrawSetTool('select');
			if (!state.open || state.session !== session || _rapierDrawTool() !== 'select' || state.gesture) return;
			const shapes = state.recipe.shapes, at = shapes.findIndex(shape => shape.id === state.canvasShapeId);
			const index = evt.key === 'Home' ? 0 : evt.key === 'End' ? shapes.length - 1 : at < 0 ? (evt.key === 'PageDown' ? 0 : shapes.length - 1) : (at + (evt.key === 'PageDown' ? 1 : -1) + shapes.length) % shapes.length;
			if (shapes[index]) await _rapierDrawSelectCanvasShape(shapes[index].id, {extend: evt.shiftKey});
			return;
		}
		const object = onCanvas && evt.target.closest('[data-shape-id]');
		if (object && (chord === 'Enter' || evt.key === ' ' && !evt.ctrlKey && !evt.metaKey && !evt.altKey)) { evt.preventDefault(); await _rapierDrawSelectCanvasShape(object.getAttribute('data-shape-id'), {toggle: true}); return; }
		if (onCanvas && !state.gesture && chord === 'Enter' && ['shape', 'text'].includes(_rapierDrawTool())) {
			evt.preventDefault();
			const vb = state.svgRoot.viewBox.baseVal, point = [vb.x + vb.width / 2, vb.y + vb.height / 2];
			if (_rapierDrawTool() === 'text') _rapierDrawCreateText(point);
			else { const line = ['line', 'arrow'].includes(_rapierDrawShapeKind()); _rapierDrawCommitShapeDrag(line ? [[point[0] - 48, point[1]], [point[0] + 48, point[1]]] : [point], line); state.svgRoot.focus({preventScroll: true}); }
			return;
		}
		if (_rapierDrawTool() !== 'select') return;
		if (chord === 'Mod+D') { evt.preventDefault(); _rapierDrawEditSelection({ type: 'duplicate' }); return; }
		if (chord === 'Enter' && evt.target.dataset?.drawHandle?.startsWith('add-')) { evt.preventDefault(); _rapierDrawChain(evt.target.dataset.drawHandle.slice(4)); return; }
		if (chord === 'Enter' && _rapierDrawSelection().length === 1) { evt.preventDefault(); _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0]); return; }
		if (!_rapierDrawSelection().length) {
			if (!evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.key.length === 1 && /\S/.test(evt.key)) { evt.preventDefault(); const vb = state.svgRoot.viewBox.baseVal; _rapierDrawCreateText([vb.x + vb.width / 2, vb.y + vb.height / 2], undefined, evt.key); }
			return;
		}
		if (_rapierDrawSelectionLocked()) return;
		if (chord === 'Delete' || chord === 'Backspace') { evt.preventDefault(); _rapierDrawEditSelection({ type: 'delete' }); return; }
		const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[evt.key];
		if (!delta) {
			if (_rapierDrawSelection().length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey && evt.key.length === 1 && /\S/.test(evt.key)) { evt.preventDefault(); _rapierDrawEditLabelInPlace(_rapierDrawSelectedShapes()[0], { initial: evt.key }); }
			return;
		}
		if (chord !== evt.key.replace(/^Arrow/, '') && chord !== 'Shift+' + evt.key.replace(/^Arrow/, '')) return;
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
function _rapierDrawFreshSession() {
	return {
		pasteStreak: null, heldPress: null, ink: null, inkChosen: false, colourOpen: false, snap: true, repeat: false,
		lastTap: null, proportions: false, resizeFromCenter: false, settingEdit: null, colourEdit: false, fadeEdit: false,
		toolMenuOpen: false, canvasMenuOpen: false, resize: null, settingsCollapsed: false, kindsOpen: false, penMode: null, paintPicker: null, imageImporting: false,
		effectsScope: 'drawing', effectsSelection: [], effectsLayer: null, effectsSweep: null, effectsCompare: false,
		effectsType: 'copier', effectsSection: null, effectsPreviewEpoch: 0, effectsChangeEpoch: 0, effectsGesture: null, effectsPendingChange: null,
		waterFallbackRemembered: null,
	};
}
function _rapierDrawToastHome(up) {
	const state = _rapierDrawState, root = document.getElementById('toast-root');
	if (!root || !state.surface) return;
	if (up) { if (root.parentElement !== state.surface) state.surface.appendChild(root); }
	else if (root.parentElement === state.surface) { if (typeof _rapierNotesToastHome === 'function') _rapierNotesToastHome(_rapierNotes.open === true); else document.body.appendChild(root); }
	_rapierScheduleToastLift();
}
function _rapierDrawWatercolourFallback(notice = true) {
	const state = _rapierDrawState;
	state.paintBrush = 'rapier/watercolour'; state.paintSize = _rapierPaintSizeFor(state.paintBrush);
	state.waterFallbackRemembered = _rapierPaintRememberedBrush();
	if (notice) showToast('Watercolor needs WebGPU. Using Brushes.', 'info');
}
function _rapierDrawWaterUnavailable(error, notice = true) {
	const state = _rapierDrawState;
	if (error?.code !== 'water_webgpu_unavailable' || !state.open || !_rapierDrawToolAllowed('paint')) return false;
	_rapierDrawWatercolourFallback(notice);
	if (state.tool === 'water') void _rapierDrawSetTool('paint', false);
	return true;
}
function _rapierDrawOpenSurface(options) {
	if (!_rapierEmbedFeatureAllowed('draw') && !_rapierEmbedFeatureAllowed('paint')) { options?.onReady?.(false); return false; }
	if (!_rapierDrawState.surface) _rapierDrawBuildSurface();
	const state = _rapierDrawState, opts = options || {};
	if (state.finishing) { opts.onReady?.(false); return; }
	if (state.open) { opts.onReady?.(false); state.surface.focus({ preventScroll: true }); showToast('Finish or close this drawing before opening another. Your work is still here.', 'info'); return; }
	state.dropper?.close(false);
	_rapierDrawReplayEnd();
	_rapierDrawCancelGesture(); _rapierDrawCloseLabelInput(); _rapierDrawFontFacesClear();
	const recipe = opts.recipe ? _rapierDrawAdmitRecipe(opts.recipe, opts.keepRasters === true) : _rapierDrawNewRecipe(1, 1);
	if (!recipe) { opts.onReady?.(false); showToast('This drawing could not be opened', 'error'); return; }
	void _rapierDrawBackupRelease();
	state.recipe = recipe; state.undoStack = []; state.redoStack = []; state.session = (state.session || 0) + 1; state.paintFastSources = new Map();
	if(typeof _rapierPaintTrimHistory==='function')_rapierPaintTrimHistory();
	if (state.agentPatchTimer) clearTimeout(state.agentPatchTimer);
	state.agentPatchTimer = null; state.agentQueue = []; state.agentReceipts = _rapierDrawPresentationReceipts(); state.agentReceiptObservers ||= new Map(); state.humanChangePending = false;
	state.agentContextSnapshot = null; state.agentSurfaceGeneration = 0; state.agentSession = crypto.randomUUID();
	if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
	state.backupDirty = false;
	state.seq = recipe.shapes.reduce((max, shape) => { const n = /^s\d+$/.test(shape.id) ? Number(shape.id.slice(1)) : 0; return Number.isSafeInteger(n) && n < Number.MAX_SAFE_INTEGER - 4096 ? Math.max(max, n) : max; }, 0);
	state.smooth = _rapierDrawSmoothLevel(_rapierDrawRemembered('smooth'));
	state.nib = _rapierDrawNibLevel(_rapierDrawRemembered(opts.notes ? 'notesNib' : 'nib'));
	recipe.smooth ??= opts.recipe ? RAPIER_DRAW_SMOOTH_DEFAULT : state.smooth; recipe.nib ??= opts.recipe ? RAPIER_DRAW_NIB_DEFAULT : state.nib;
	state.editing = opts.editing ? { ...opts.editing } : null; state.insertTarget = opts.target || null; state.notes = opts.notes || null; state.finishHandoff = null;
	if (state.editing) {
		const record = _rapierImageRecord(state.editing.blockId, state.editing.imageIndex);
		const span = record && _rapierExcerptCanonicalBlockSpans([record.block.id]).get(record.block.id);
		state.editing.position = span ? span.start + record.image.start : null;
	}
	state.heldRoot = rapier.document.source?.rootId;
	// (RAPIER_DRAW_START_TOOLS, above). Re-opening an EXISTING drawing opens on the tool it was last
	const fresh = !state.editing && !opts.recovered, fallback = _rapierEmbedFeatureAllowed('draw') ? 'brush' : 'paint';
	state.tool = opts.tool && _rapierDrawToolAllowed(opts.tool) ? opts.tool : fresh ? _rapierDrawRemembered(state.notes ? 'notesTool' : 'tool') : RAPIER_DRAW_TOOLS.includes(recipe.tool) ? recipe.tool : state.editing ? (recipe.shapes?.some(shape => shape.recognized === 'paint') ? 'paint' : 'select') : 'brush';
	const noWater = state.tool === 'water' && !globalThis.navigator?.gpu;
	if (!_rapierDrawToolAllowed(state.tool)) state.tool = fallback;
	else if (noWater) state.tool = _rapierDrawToolAllowed('paint') ? 'paint' : fallback;
	else if (fresh && state.tool === 'water') {
		const session = state.session;
		_rapierPaintStartPainter('water').catch(() => {
			if (!state.open || state.session !== session || state.tool !== 'water' || state.gesture) return;
			if (_rapierDrawToolAllowed('paint')) _rapierDrawWaterUnavailable({code: 'water_webgpu_unavailable'}, false);
			else void _rapierDrawSetTool(fallback, false);
		});
	}
	state.pen = state.tool === 'pen';
	state.surface.setAttribute('aria-label', state.notes ? 'Draw, ' + state.notes.label : 'Draw');
	state.shapeKind = _rapierDrawRemembered('shapeKind');
	_rapierDrawSetHint();
	Object.assign(state, _rapierDrawFreshSession());
	_rapierDrawFollowToolInk(state.tool);
	state.eraseSoftness = _rapierDrawRemembered('eraseSoftness');
	state.eraseNib = _rapierDrawNibLevel(_rapierDrawRemembered('eraseNib'));
	_rapierDrawTextDefaults();
	state.menuPane = null; state.menuColour = false;
	_rapierWaterReset();
	state.paintBrush = _rapierPaintRememberedBrush(); state.paintSize = _rapierPaintRememberedSize(); state.paintStrength = _rapierPaintRememberedStrength(); state.paper = false; state.paperBlack = false; if (typeof _rapierPaintShownAs !== 'undefined') { _rapierPaintShownAs.clear(); if (typeof _rapierPaintForgetBlobs === 'function') _rapierPaintForgetBlobs(); } _rapierPaintCloseLayer(); state.surface.classList.remove('rapier-draw-surface--paper', 'rapier-draw-surface--black');
	state.paintChosenId = null;
	_rapierDrawSetToolMenu(false); _rapierDrawSetCanvasMenu(false); _rapierDrawResizeReset(); _rapierDrawSetSettingsCollapsed(false); _rapierDrawCloseSettingPanels();
	for (const action of ['snap', 'repeat', 'proportions', 'center']) {
		const btn = state.surface.querySelector('[data-draw-act="' + action + '"]'), on = action === 'snap';
		btn?.setAttribute('aria-checked', String(on));
	}
	_rapierDrawSyncTextPanels(); _rapierDrawSyncEraseEdge();
	_rapierDrawSetSelection([]); _rapierDrawUpdatePenBtn(); _rapierDrawUpdateShapeRow(); _rapierDrawUpdateInkBtn(); _rapierDrawSetCloseVisible(false);
	if (!state.open) {
		state.focusBeforeOpen = document.activeElement;
		document.getElementById('toast-root')?._rapierDismissNoticeView?.(document.body.classList.contains('rapier-notes-open') ? 'notes' : 'editor');
		_rapierDrawToastHome(true);
		state.releaseIsolation = _rapierInstallModalIsolation(state.surface);
	}
	clearTimeout(state.leaving); state.surface.classList.remove('rapier-draw-surface--closed', 'rapier-draw-surface--leave');
	state.surface.classList.toggle('rapier-draw-surface--notes', !!state.notes);
	state.surface.hidden = false; document.body.classList.add('rapier-draw-open'); document.documentElement?.classList.add('rapier-draw-open'); state.open = true; state.painter = state.painterNext === true; state.painterNext = false; state.surface.focus({ preventScroll: true });
	if (typeof _rapierAgentNoteHome === 'function') _rapierAgentNoteHome(state.surface);
	if (noWater && state.tool === 'paint') _rapierDrawWatercolourFallback(false);
	if (_rapierDrawBackupHere()) { _rapierDrawBackupOwner(true); _rapierDrawBackupStore(); }
	if (typeof _rapierBackHold === 'function') _rapierBackHold();
	if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('draw', true);
	const session = state.session;
	const baseline = opts.baselineRecipe;
	if (baseline) { baseline.smooth ??= RAPIER_DRAW_SMOOTH_DEFAULT; baseline.nib ??= RAPIER_DRAW_NIB_DEFAULT; }
	const opening = state.openFirst = _rapierDrawHistoryRecipe(baseline || recipe);
	const rect = state.svgRoot.getBoundingClientRect();
	state.viewInset = _rapierDrawSettingsInset();
	const bars = opts.recipe ? 0 : _rapierDrawBarsRoom();
	if (!opts.recipe) recipe.canvas = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height + bars - state.viewInset)) };
	state.canvasFollowsStage = !opts.recipe;
	state.openWindow = { w: innerWidth, h: innerHeight, bars: ['top', 'bottom', 'left', 'right'].map(side => document.documentElement?.style?.getPropertyValue('--native-inset-' + side)).join() };
	if (opts.recipe) _rapierDrawGrowCanvasToContent(recipe, 0);
	state.view = { x: 0, y: 0, k: 1 };
	_rapierDrawViewBaseReset(rect, bars);
	_rapierDrawApplyView();
	_rapierDrawRenderAll();
	state.openSnapshot = state.undoStack.length ? opening : _rapierDrawHistoryRecipe(baseline || state.recipe);
	state.fontReady = _rapierDrawLoadFonts(recipe, session).then(() => { if (state.open && state.session === session) _rapierDrawRenderAll(); }).catch(error => { if (state.open && state.session === session) showToast('Font could not load: ' + String(error.message || error), 'error'); throw error; });
	state.fontReady.catch(() => {});
	_rapierDrawLettersWake();
	requestAnimationFrame(() => {
		if (!state.open || state.session !== session) { opts.onReady?.(false); return; }
		if (opts.agentPatches?.length) {
			state.agentQueue = opts.agentPatches.map(row => ({...row, session: state.session, options: {...row.options,
				savedBefore: _rapierDrawHistoryRecipe(row.options.sourceRecipeBefore), savedAfter: _rapierDrawHistoryRecipe(row.options.sourceRecipeAfter)}}));
			for (const row of state.agentQueue) _rapierDrawAgentReceipt(row.options, 'presentation_deferred', 'drawing_recovered');
			_rapierDrawScheduleAgentPatches();
		}
		globalThis.RapierChanges?.close(); globalThis.RapierChanges?.schedule();
		opts.onReady?.(true);
	});
}
const RAPIER_DRAW_FADE_MS = 200;
function _rapierDrawStill() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
const RAPIER_DRAW_MOMENTS = Object.freeze({
	dab: [[{ transform: 'translateX(-19.68px) scaleX(.18)', opacity: .3 }, { transform: 'translateX(.96px) scaleX(1.04)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 340, 'cubic-bezier(.2,.7,.2,1)'],
	pop: [[{ transform: 'scale(.6)', opacity: .4 }, { transform: 'scale(1.12)', opacity: 1, offset: .6 }, { transform: 'none', opacity: 1 }], 300, 'cubic-bezier(.2,.7,.2,1)'],
	wash: [[{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 380, 'cubic-bezier(.3,.7,.3,1)', '::after'],
	rise: [[{ transform: 'translateY(8px) scale(.7)', opacity: 0 }, { transform: 'translateY(-1px) scale(1.06)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 260, 'cubic-bezier(.2,.7,.2,1)'],
	riseWord: [[{ transform: 'translateY(4px)', opacity: 0 }, { transform: 'translateY(4px)', opacity: 0, offset: .25 }, { transform: 'none', opacity: 1 }], 260, 'ease-out'],
	press: [[{ transform: 'none' }, { transform: 'translateY(1px) scale(.82)', offset: .35 }, { transform: 'scale(1.04)', offset: .72 }, { transform: 'none' }], 380, 'ease-out'],
	lift: [[{ transform: 'none' }, { transform: 'translateY(-2px) scale(1.1)', offset: .4 }, { transform: 'none' }], 320, 'ease-out'],
	laid: [[{ transform: 'translateY(-10px) scale(1.03)', opacity: .6 }, { transform: 'none', opacity: .32, offset: .45 }, { transform: 'none', opacity: 0 }], 520, 'cubic-bezier(.2,.7,.3,1)'],
	land: [[{ transform: 'translateY(22px) scale(.95)', opacity: 0 }, { transform: 'translateY(-3px) scale(1.005)', opacity: 1, offset: .62 }, { transform: 'none', opacity: 1 }], 480, 'cubic-bezier(.2,.7,.2,1)'],
	breathe: [[{ opacity: .5 }, { opacity: 1 }], 260, 'ease-out'],
	foldChevron: [(dx, from, to) => [{ transform: 'translateX(' + dx + 'px) rotate(' + from + 'deg)' }, { transform: 'rotate(' + to + 'deg)' }], 200, 'cubic-bezier(.2,.7,.2,1)'],
});
const _rapierDrawPlaying = new WeakMap();
function _rapierDrawPlay(el, name, ...args) {
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
function _rapierDrawLand(label, frames = 180, settled) {
	if (!label) return settled?.(false);
	(document.hidden ? cb => setTimeout(cb, 50) : requestAnimationFrame)(() => {
		const img = [...document.querySelectorAll('#editor-blocks img[data-rapier-asset]')].find(el => String(el.getAttribute('data-rapier-asset')).toLowerCase() === String(label).toLowerCase());
		if (img?.dataset.rapierAssetState !== 'ready') { if (frames > 1) _rapierDrawLand(label, frames - 1, settled); else settled?.(false); return; }
		settled?.(true);
		let box = img.getBoundingClientRect();
		if (box.bottom <= 0 || box.top >= innerHeight) { img.scrollIntoView({ block: 'center', behavior: 'instant' }); box = img.getBoundingClientRect(); }
		if (!_rapierDrawStill() && box.bottom > 0 && box.top < innerHeight && box.width) _rapierDrawPlay(img, 'land');
	});
}
function _rapierDrawFollowStage() {
	const state = _rapierDrawState, recipe = state.recipe;
	if (!state.open || !state.canvasFollowsStage || !recipe || state.gesture) return;
	const now = { w: innerWidth, h: innerHeight, bars: ['top', 'bottom', 'left', 'right'].map(side => document.documentElement?.style?.getPropertyValue('--native-inset-' + side)).join() };
	if (now.w === state.openWindow.w && now.h === state.openWindow.h && now.bars === state.openWindow.bars) return;
	const pending = state.waterStrokes?.some(receipt => !receipt.finished || receipt.running) ||
		state.paintRehydrateWaiters?.some(gesture => gesture.paint?.pending && !gesture.paint.discarded);
	if (pending || recipe.strokes.length || _rapierDrawHasContent(recipe) || state.undoStack.length || state.redoStack.length || state.paintLayer?.surface?.bounds()) { state.canvasFollowsStage = false; return; }
	state.openWindow = now;
	const rect = state.svgRoot.getBoundingClientRect(), bars = _rapierDrawBarsRoom(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height + bars - (state.viewInset || 0)));
	if (w === recipe.canvas.w && h === recipe.canvas.h) return;
	recipe.canvas = { w, h };
	_rapierDrawViewBaseReset(rect, bars);
	_rapierDrawApplyView();
	if (state.paintLayer && state.paintLayer.id == null) _rapierPaintCloseLayer();
	state.openSnapshot = _rapierDrawHistoryRecipe();
	_rapierDrawRenderAll();
}
function _rapierDrawOverEditor() { return _rapierDrawState.open && !_rapierDrawState.notes; }
async function _rapierDrawClose({ recover = false, landed = false } = {}) {
	const state = _rapierDrawState, notes = state.notes;
	if (state.open) globalThis.RapierAgentBrowser?.drawingNavigationChanged?.();
	try { localStorage.removeItem('rapier:draw:reopened'); } catch (_) {}
	if (recover) {
		if (state.finishing || !state.open) return;
		const session = state.session;
		state.finishing = true;
		try {
			const pending = _rapierPaintPendingStroke();
			if (pending) { await pending; if (!state.open || state.session !== session) return; }
			_rapierDrawCancelGesture();
			const settled = _rapierPaintSettleOverflow(); if (settled) { await settled; if (!state.open || state.session !== session) return; }
			_rapierDrawBackupTouch();
			await _rapierDrawBackupWrite(true);
			await state.backupIO;
			if (state.backupDirty || !state.open || state.session !== session) return;
		} catch (error) {
			showToast('This drawing could not be backed up, so it stays open: ' + String(error?.message || error), 'error');
			return;
		} finally { state.finishing = false; }
	}
	state.dropper?.close(false);
	_rapierDrawReplayEnd();
	for (const ticket of state.agentQueue || []) _rapierDrawAgentReceipt(ticket.options, 'unavailable', 'draw_session_closed');
	state.agentQueue = [];
	state.renderEdit = null;
	_rapierDrawCancelGesture(); _rapierDrawCloseLabelInput(); _rapierDrawFontFacesClear();
	{
		const session = state.session, settled = _rapierPaintSettleOverflow();
		if (settled) await settled;
		const closed = _rapierPaintCloseLayer();
		if (closed) await closed;
		if (!state.open || state.session !== session) return;
	}
	state.effectsChangeEpoch++; state.effectsPendingChange = null;
	_rapierDrawEffectsPreviewRelease(false);
	state.effectsPreviewCache?.clear(); state.effectsPreviewCache = null;
	if (typeof _rapierPaintTiltOff === 'function') _rapierPaintTiltOff();
	const surface = state.surface;
	if (surface && notes) surface.classList.add('rapier-draw-surface--closed'); else if (surface) surface.hidden = true;
	document.body.classList.remove('rapier-draw-open'); document.documentElement?.classList.remove('rapier-draw-open');
	state.releaseIsolation?.(); state.releaseIsolation = null;
	if (typeof _rapierAgentNoteHome === 'function') _rapierAgentNoteHome(null);
	const origin = state.focusBeforeOpen; state.focusBeforeOpen = null;
	const available = element => element?.isConnected && !surface?.contains(element) && _rapierDrawChoiceAvailable(element);
	let focus = origin !== document.body && available(origin) ? origin : null;
	if (!focus) {
		const modal = _rapierDialogRuntime.isolation.at(-1);
		const candidates = modal ? _rapierModalFocusables(modal).concat(modal)
			: [...document.querySelectorAll('.rapier-notes-card[data-notes-file]'), document.querySelector('.rapier-notes-surface'),
				document.getElementById('source-textarea'), document.getElementById('editor-blocks')];
		focus = candidates.find(available);
		if (!focus && !modal) focus = _rapierModalFocusables(document).find(available);
	}
	focus?.focus({preventScroll: true});
	globalThis.RapierDrawAgentPaint?.forgetWaterSession?.(globalThis.RapierDrawAgentPaint.waterSession(state.session));
	state.paintFastSources?.clear(); state.finishHandoff = null;
	state.open = false; state.painter = false; state.pencil = false; state.session = (state.session || 0) + 1; state.editing = null; state.insertTarget = null; state.notes = null; state.openSnapshot = null;
	if(typeof _rapierPaintTrimHistory==='function')_rapierPaintTrimHistory();
	_rapierDrawLiquidStop(); _rapierDrawCopierStop();
	setTimeout(() => void _rapierDrawLiquidResume(), 0);
	globalThis.RapierChanges?.close(); globalThis.RapierChanges?.schedule();
	_rapierDrawToastHome(false);
	if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('draw', false);
	if (typeof _rapierBackHold === 'function') _rapierBackHold();
	void _rapierDrawBackupRelease();
	_rapierDrawSetSelection([]); _rapierDrawUpdateHandles();
	if (surface && notes) _rapierDrawLeave(surface, landed ? null : notes.closed?.());
}
// RAPIER_DRAW_LEAVE_WAIT_MS), so that note is never seen. It is closed from the first moment, and a
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
const RAPIER_DRAW_BACKUP_MS = 4000;
const RAPIER_DRAW_BACKUP_CAPTURE_MS = 1500;
function _rapierDrawBackupCarryable() {
	const state = _rapierDrawState, layer = typeof _rapierPaintLayer === 'function' ? _rapierPaintLayer() : null;
	return !state.waterAction && !state.paintEraseFan && !state.gesture?.eraseInk && !!layer && layer.id != null && state.recipe.shapes.some(shape => shape.id === layer.id && shape.recognized === 'paint' && typeof shape.raster === 'string' && shape.raster.length > 0);
}
function _rapierDrawBackupPublished() {
	const state = _rapierDrawState;
	if (!state.open || state.finishing || (typeof document !== 'undefined' && document.hidden) || !_rapierDrawBackupHere() || !_rapierDrawBackupCarryable()) return;
	const owner = _rapierDrawBackupOwner();
	owner.published = (owner.published || 0) + 1;
	state.backupDirty = true;
	void _rapierDrawBackupWrite(false, true);
}
function _rapierDrawBackupHere() {
	if (globalThis.RapierBenchSession?.active === true) return false;
	return !!(navigator.locks?.request && typeof indexedDB !== 'undefined');
}
function _rapierDrawBackupStore() {
	return _rapierDrawState.backupStore ||= _rapierDrawBackupIDB();
}
const RAPIER_DRAW_BACKUP_WORKER = `
let opened = null;
const open = () => opened ||= new Promise((ok, no) => {
	const request = indexedDB.open('rapier-draw', 1);
	request.onupgradeneeded = () => request.result.createObjectStore('pending');
	request.onsuccess = () => { const db = request.result; db.onversionchange = db.onclose = () => { opened = null; db.close(); }; ok(db); };
	request.onerror = () => no(request.error);
}).catch(error => { opened = null; throw error; });
onmessage = async ({ data }) => {
	const { id, name, record, remove } = data;
	try {
		const text = typeof record === 'string' ? record : JSON.stringify(record), db = await open();
		await new Promise((ok, no) => {
			const tx = db.transaction('pending', 'readwrite', { durability: 'strict' }), store = tx.objectStore('pending');
			tx.oncomplete = ok; tx.onerror = tx.onabort = () => no(tx.error || new Error('IndexedDB refused the drawing recovery'));
			store.put(text, name);
			for (const older of remove) store.delete(older);
			tx.commit();
		});
		postMessage({ id });
	} catch (error) { postMessage({ id, error: { name: String(error && error.name || 'Error'), message: String(error && error.message || error) } }); }
};`;
async function _rapierDrawBackupWorkerCall(message) {
	const state = _rapierDrawState;
	if (state.backupWorker === undefined) {
		const client = {worker: globalThis.RapierWorkerExecution.createWorkerExecution({
			source: RAPIER_DRAW_BACKUP_WORKER, name: 'rapier-draw-recovery'}), pending: new Map(), serial: 0, failure: null};
		client.lose = (error = new Error('The recovery writer stopped.')) => {
			if (error.code !== 'worker_startup_refused') error.mayHaveCommitted = true;
			client.failure ||= error;
			for (const row of client.pending.values()) { clearTimeout(row.timer); row.reject(client.failure); }
			client.pending.clear(); client.worker.terminate();
		};
		client.worker.onmessage = ({data}) => {
			const row = client.pending.get(data.id);
			if (!row) return;
			client.pending.delete(data.id); clearTimeout(row.timer);
			if (data.error) row.reject(Object.assign(new Error(data.error.message), {name: data.error.name})); else row.resolve(data);
		};
		client.worker.onerror = event => client.lose(event.error || new Error(event.message || 'The recovery writer stopped.'));
		client.worker.onmessageerror = () => client.lose();
		state.backupWorker = client;
	}
	const client = state.backupWorker;
	await client.worker.ready;
	if (client.failure) throw client.failure;
	return new Promise((resolve, reject) => {
		const id = ++client.serial, timer = setTimeout(() => client.lose(), 30000);
		client.pending.set(id, {resolve, reject, timer});
		try { client.worker.postMessage({...message, id}); }
		catch (error) { client.pending.delete(id); clearTimeout(timer); reject(error); }
	});
}
function _rapierDrawBackupIDB() {
	let opened = null;
	const open = () => {
		if (opened) return opened;
		const asked = opened = new Promise((ok, no) => {
			const req = indexedDB.open('rapier-draw', 1);
			let refused = false;
			const fail = error => { refused = true; no(error); };
			req.onupgradeneeded = () => { req.result.createObjectStore('pending'); };
			req.onsuccess = () => {
				const db = req.result;
				if (refused) { db.close(); return; }
				const reset = () => { if (opened === asked) opened = null; };
				db.onversionchange = () => { reset(); db.close(); };
				db.onclose = reset;
				ok(db);
			};
			req.onerror = () => fail(req.error || new Error('IndexedDB refused the drawing recovery store'));
			req.onblocked = () => fail(new Error('IndexedDB held the drawing recovery store'));
		});
		asked.catch(() => { if (opened === asked) opened = null; });
		return asked;
	};
	const run = async (mode, act) => {
		const pending = open(), db = await pending;
		try {
			return await new Promise((ok, no) => {
				const tx = mode === 'readwrite' ? db.transaction('pending', mode, { durability: 'strict' }) : db.transaction('pending', mode);
				let req;
				tx.oncomplete = () => ok(req.result);
				tx.onerror = () => no(tx.error || new Error('IndexedDB refused the drawing recovery'));
				tx.onabort = () => no(tx.error || new Error('IndexedDB dropped the drawing recovery'));
				try {
					req = act(tx.objectStore('pending'));
					if (mode === 'readwrite') tx.commit();
				}
				catch (error) { try { tx.abort(); } catch (_) {} no(error); }
			});
		} catch (error) {
			if (opened === pending) opened = null;
			try { db.close(); } catch (_) {}
			throw error;
		}
	};
	void open().catch(() => {});
	return {
		async list() {
			const names = await run('readonly', store => store.getAllKeys());
			return names.map(name => ({ name: String(name), text: () => run('readonly', store => store.get(name)).then(value => typeof value === 'string' ? value : '') }));
		},
		async write(name, record, { background = false, remove = [] } = {}) {
			if (background) {
				try { await _rapierDrawBackupWorkerCall({name, record, remove}); return; }
				catch (error) { if (error.code !== 'worker_startup_refused') throw error; }
			}
			const text = typeof record === 'string' ? record : JSON.stringify(record);
			await run('readwrite', store => { const put = store.put(text, name); for (const older of remove) store.delete(older); return put; });
		},
		remove(name) { return run('readwrite', store => store.delete(name)); },
	};
}
function _rapierDrawBackupProblem(message) {
	if (_rapierDrawState.backupError !== message) showToast(message, 'error');
	_rapierDrawState.backupError = message;
}
function _rapierDrawBackupOwner(prepare = false) {
	const state = _rapierDrawState;
	if (state.backupRecovery?.session !== state.session || state.backupRecovery.released) {
		void _rapierDrawBackupRelease();
		state.backupRecovery = { session: state.session, drawing: crypto.randomUUID(), authority: '', filename: '', prepared: true, revision: 0, change: 0, cleared: 0, writing: 0, files: new Set() };
	}
	const owner = state.backupRecovery;
	if (owner.prepared && !prepare) {
		owner.authority = String(rapier.identity.authority || ''); owner.filename = String(rapier.document.filename || ''); owner.prepared = false;
	}
	if (!owner.ready || owner.lockFailed) {
		owner.lockFailed = false;
		let ready, refused;
		owner.ready = new Promise((resolve, reject) => { ready = resolve; refused = reject; });
		const held = new Promise(resolve => { owner.release = () => { owner.released = true; resolve(); }; });
		owner.lock = Promise.resolve().then(() => navigator.locks.request('rapier.draw.' + owner.drawing, async () => { ready(); await held; })).catch(error => { owner.lockFailed = true; refused(error); });
		owner.ready.catch(() => {});
	}
	return state.backupRecovery;
}
function _rapierDrawBackupRelease(owner = _rapierDrawState.backupRecovery) {
	if (!owner) return Promise.resolve();
	return Promise.resolve(_rapierDrawState.backupIO).then(() => { owner.release(); return owner.lock; });
}
function _rapierDrawBackupTouch(soon = false, delay = RAPIER_DRAW_BACKUP_MS) {
	if (globalThis.RapierBenchSession?.active === true) return;
	const state = _rapierDrawState;
	if (!state.open) return;
	state.backupDirty = true;
	if (!_rapierDrawBackupHere()) { _rapierDrawBackupProblem('This drawing can’t be backed up here. Add it or ' + (globalThis.RapierPlatform?.environment.native === true ? 'save' : 'download') + ' it before you leave.'); return; }
	_rapierDrawBackupOwner().change++;
	if (soon) {
		if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
		if (state.backupQueued && state.backupQueued.session === state.session) return;
		const queued = state.backupQueued = { session: state.session };
		queueMicrotask(() => {
			if (state.backupQueued !== queued) return;
			state.backupQueued = null;
			if (state.open && state.session === queued.session) void _rapierDrawBackupWrite();
		});
		return;
	}
	if (!state.backupTimer && (!state.backupQueued || state.backupQueued.session !== state.session)) state.backupTimer = setTimeout(() => { state.backupTimer = 0; void _rapierDrawBackupWrite(); }, delay);
}
async function _rapierDrawBackupRemove(store, files, owner, { quiet = false } = {}) {
	let ok = true;
	for (const name of files) {
		try { await store.remove(name); owner?.files.delete(name); }
		catch (_) { ok = false; }
	}
	if (!ok && !quiet) _rapierDrawBackupProblem('An older drawing backup could not be removed.');
	return ok;
}
async function _rapierDrawBackupWrite(closing = false, sealed = false) {
	const state = _rapierDrawState;
	const urgent = closing || (typeof document !== 'undefined' && document.hidden);
	const readoutEpoch = state.backupReadoutEpoch || 0;
	if (urgent) state.backupReadoutEpoch = readoutEpoch + 1;
	if (urgent && typeof _rapierPaintDropSnapshots === 'function') {
		let dropped = false;
		for (const layer of _rapierPaintRevisionLayers()) dropped = _rapierPaintDropSnapshots(layer) || dropped;
		const pendingOwner = state.backupRecovery;
		if ((dropped || pendingOwner?.writing) && pendingOwner?.session === state.session && pendingOwner.revision > pendingOwner.cleared) state.backupDirty = true;
	}
	if (!state.open || !state.backupDirty) return;
	const session = state.session, began = Date.now();
	let record, editing, owner, encode, published = null, publication = 0;
	let carried = sealed && !urgent && _rapierDrawBackupCarryable();
	try {
		let pending = !carried && typeof _rapierPaintPendingStroke === 'function' ? _rapierPaintPendingStroke(closing) : null;
		if (pending && !urgent && _rapierDrawBackupCarryable()) { carried = true; pending = null; }
		while (pending) {
			await pending;
			if (!state.open || state.session !== session) return;
			pending = _rapierPaintPendingStroke(closing, true);
			if (pending && !urgent && _rapierDrawBackupCarryable()) { carried = true; break; }
		}
		if (!_rapierDrawBackupHere()) { _rapierDrawBackupTouch(); return; }
		owner = _rapierDrawBackupOwner();
		if (owner.writing && !urgent) return;
		publication = owner.published || 0;
		const stroking = !closing && state.gesture?.kind === 'paint' && !state.textEdit && !state.settingEdit && !state.replay && _rapierDrawBackupCarryable();
		if (!closing && !stroking && (state.gesture || state.textEdit || state.settingEdit || state.replay)) { _rapierDrawBackupTouch(); return; }
		if (stroking) carried = true;
		state.backupDirty = carried;
		const recipe = _rapierDrawHistoryCopy({ ...state.recipe, fonts: undefined });
		recipe.tool = state.tool;
		let live = !carried && typeof _rapierPaintLayerSnapshot === 'function' ? _rapierPaintLayerSnapshot(!urgent) : null;
		if (live?.then) live = await live;
		if (!state.open || state.session !== session || state.backupRecovery !== owner) return;
		if ((owner.published || 0) !== publication) {
			if (state.backupDirty) return _rapierDrawBackupWrite(closing, true);
			return;
		}
		if (live) {
			const id = live.id || ('s' + (state.seq + 1)), at = recipe.shapes.findIndex(existing => existing.id === id);
			const previous = at >= 0 ? recipe.shapes[at] : null;
			if (previous?.recognized === 'paint' && typeof previous.raster === 'string' && previous.raster) published = recipe.shapes.slice();
			const shape = { id, stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, ...previous, geom: live.geom, raster: live.raster, paint: { ...previous?.paint, strokes: undefined, seed: undefined, ...live.paint } };
			if (live.encode) encode = async () => { shape.raster = await live.encode(); return !!shape.raster; };
			if (at >= 0) recipe.shapes[at] = shape; else recipe.shapes.push(shape);
			if (live.retire?.length) {
				const gone = new Set(live.retire);
				recipe.shapes = recipe.shapes.filter(row => !gone.has(row.id) || row === shape);
				remapRefractionRecipeSources(recipe, new Map([...gone].map(id => [id, shape.id])));
				if (shape.paint.group != null && !recipe.shapes.some(row => row !== shape && row.paint?.group === shape.paint.group)) delete shape.paint.group;
			}
		}
		if (!_rapierDrawHasContent(recipe) && !state.editing) { await _rapierDrawBackupClear(); return; }
		editing = state.editing ? { ...state.editing } : null;
		record = { version: 1, drawing: owner.drawing, revision: ++owner.revision, at: Date.now(), authority: owner.authority, filename: owner.filename, editing: editing ? { blockId: editing.blockId, imageIndex: editing.imageIndex, title: editing.title, asset: editing.asset, sourceHash: editing.sourceHash } : null, recipe, fonts: state.recipe.fonts?.slice() };
		if (state.agentQueue?.length) record.agentPatches = state.agentQueue.map(({patch, options}) => {
			const {savedBefore, savedAfter, ...kept} = options;
			return _rapierDrawHistoryCopy({patch, options: kept});
		});
	} catch (_) {
		state.backupDirty = true;
		_rapierDrawBackupProblem('This drawing could not be backed up. Add it or ' + (globalThis.RapierPlatform?.environment.native === true ? 'save' : 'download') + ' it before you leave.');
		return false;
	}
	const name = 'pending.' + record.drawing + '.' + record.revision + '.json', previous = [...owner.files];
	owner.files.add(name); owner.writing++;
	const io = state.backupIO = (state.backupIO || Promise.resolve()).then(async () => {
		let store, failure = 'This drawing could not be backed up. ' + (globalThis.RapierPlatform?.environment.native === true ? 'Save' : 'Download') + ' it before you leave.';
		try {
			await owner.ready;
			let captured = true;
			if (encode) {
				if (published && !urgent) {
					let timer;
					captured = await Promise.race([encode(), new Promise(done => { timer = setTimeout(() => done(false), RAPIER_DRAW_BACKUP_CAPTURE_MS); })]);
					clearTimeout(timer);
					if (!captured && typeof _rapierPaintDropSnapshots === 'function' && typeof _rapierPaintRevisionLayers === 'function') for (const layer of _rapierPaintRevisionLayers()) _rapierPaintDropSnapshots(layer);
				} else captured = await encode();
			}
			if (!captured) {
				if (!published || urgent) {
					owner.files.delete(name);
					if (state.open && state.backupRecovery === owner && state.session === owner.session && record.revision === owner.revision && record.revision > owner.cleared) _rapierDrawBackupTouch();
					return false;
				}
				record.recipe.shapes = published;
				carried = true; state.backupDirty = true;
			}
			if (!_rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts || record.recipe.fonts })) {
				if (!urgent && readoutEpoch !== (state.backupReadoutEpoch || 0)) throw Object.assign(new Error('Recovery readout superseded by an urgent checkpoint'), {code: 'PAINT_CAPTURE_CHANGED'});
				await _rapierPaintKeepAsJXL(record.recipe, !urgent);
				if (!_rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts || record.recipe.fonts })) {
					failure = 'This drawing is too large for its backup copy. ' + (globalThis.RapierPlatform?.environment.native === true ? 'Save' : 'Download') + ' it before you leave.';
					throw new Error(failure);
				}
			}
			if (editing?.sourceUrl && !record.editing.sourceHash) {
				try { record.editing.sourceHash = await globalThis.RapierImageAssets.hashAsset(globalThis.RapierImageAssets.decodeDataImage(editing.sourceUrl)); }
				catch (_) {}
			}
			failure = 'This drawing could not be backed up: storage is full or unavailable. Add it or ' + (globalThis.RapierPlatform?.environment.native === true ? 'save' : 'download') + ' it before you leave.';
			store = _rapierDrawBackupStore();
			await store.write(name, record, { background: !urgent, remove: previous });
		} catch (error) {
			if (error?.code === 'PAINT_CAPTURE_CHANGED') {
				owner.files.delete(name);
				if (state.open && state.backupRecovery === owner && state.session === owner.session && record.revision === owner.revision && record.revision > owner.cleared) _rapierDrawBackupTouch();
				return false;
			}
			if (!error?.mayHaveCommitted) {
				if (store) await _rapierDrawBackupRemove(store, [name], owner, { quiet: true });
				else owner.files.delete(name);
			}
			if (state.session === owner.session && record.revision > owner.cleared) state.backupDirty = true;
			_rapierDrawBackupProblem(failure);
			return false;
		}
		if (state.session === owner.session) state.backupAt = record.at;
		for (const older of previous) owner.files.delete(older);
		if (state.session === owner.session && state.backupError) {
			state.backupError = null; showToast('Drawings are backed up again', 'info');
		}
		return true;
	});
	const ok = await io;
	owner.writing--;
	if (ok && state.backupRecovery === owner && state.session === owner.session && state.open && state.backupDirty) {
		if ((owner.published || 0) !== publication) void _rapierDrawBackupWrite(false, true);
		else _rapierDrawBackupTouch(!carried, Math.max(0, RAPIER_DRAW_BACKUP_MS - (Date.now() - began)));
	}
	return ok;
}
function _rapierDrawBackupFlush(event) {
	const state = _rapierDrawState;
	if (!state.open) return;
	if (state.backupTimer) { clearTimeout(state.backupTimer); state.backupTimer = 0; }
	if (state.gesture || state.markerPress) { _rapierDrawCancelGesture(); state.backupDirty = true; }
	const session = state.session;
	const completion = Promise.resolve(_rapierDrawBackupWrite(true)).then(async kept => {
		const queued = await state.backupIO;
		return kept !== false && queued !== false && state.session === session &&
			!state.backupDirty && !state.backupError && !state.backupRecovery?.writing &&
			!state.textEdit && !state.settingEdit && !state.replay;
	}, () => false).catch(() => false);
	if (typeof event?.detail?.waitUntil === 'function') event.detail.waitUntil(completion);
	return completion;
}
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', _rapierDrawBackupFlush);
	window.addEventListener('rapier:checkpoint-requested', _rapierDrawBackupFlush);
}
function _rapierDrawBackupTicket() {
	const state = _rapierDrawState, owner = state.backupRecovery;
	return owner?.session === state.session ? { owner, files: [...owner.files], revision: owner.revision, change: owner.change } : null;
}
async function _rapierDrawBackupClear(ticket = _rapierDrawBackupTicket()) {
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
		try { return await _rapierDrawBackupRemove(_rapierDrawBackupStore(), files, owner); }
		catch (_) { _rapierDrawBackupProblem('This drawing\'s backup could not be removed.'); return false; }
	});
	const ok = await io;
	if (owner && (!state.open || state.session !== owner.session)) await _rapierDrawBackupRelease(owner);
	if (ok && !state.open && owner?.recovered) setTimeout(() => { void _rapierDrawOfferRecovery(); }, 0);
	return ok;
}
async function _rapierDrawBackupRead() {
	if (!_rapierDrawBackupHere()) { _rapierDrawBackupProblem('Drawings can’t be backed up in this window.'); return null; }
	if (!_rapierDrawState.open) await _rapierDrawBackupRelease();
	await _rapierDrawState.backupIO;
	let kept;
	try { kept = await _rapierDrawBackupStore().list(); }
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
			if (!lock) return;
			for (const row of rows) {
				try {
					const text = await row.text();
					if (!text) continue;
					const record = JSON.parse(text);
					if (record?.version !== 1 || record.drawing !== drawing || record.revision !== row.revision || typeof record.authority !== 'string' || !record.authority || typeof record.filename !== 'string' || !Number.isFinite(record.at)) throw new Error('recovery record');
					const recipe = _rapierDrawAdmitRecipe({ ...record.recipe, fonts: record.fonts }, true);
					if (!recipe) throw new Error('recovery recipe');
					if (record.agentPatches != null && (!Array.isArray(record.agentPatches) || record.agentPatches.some(row => !row || !_rapierDrawAdmitAgentPatch(row.patch, row.options)))) throw new Error('recovery drawing contribution');
					record.recipe = recipe; record.fonts = recipe.fonts;
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
async function _rapierDrawOfferRecovery(chosen = false) {
	if (globalThis.RapierBenchSession?.active === true) return;
	const state = _rapierDrawState;
	const blank = () => state.open && !state.editing && _rapierDrawCanvasBlank();
	if ((state.open && !blank()) || state.finishing || state.backupOffering) return;
	state.backupOffering = true;
	try {
		const loadToken = rapier.identity.loadToken, stamp = Object.freeze(_rapierMutationStamp());
		const record = await _rapierDrawBackupRead();
		if (!record || (state.open && !blank()) || state.finishing || loadToken !== rapier.identity.loadToken || !_rapierMutationStampIsCurrent(stamp)) return;
		if (state.open) {
			if (!chosen) { showToast('Your unfinished drawing is kept.', 'info', { label: 'Open', fn: () => { void _rapierDrawOfferRecovery(true); } }); return; }
			await _rapierDrawClose();
			if (state.open || state.finishing) return;
		}
		if (!chosen) { showToast('Your unfinished drawing is kept.', 'info', { label: 'Open', fn: () => { void _rapierDrawOfferRecovery(true); } }); return; }
		const same = record.authority === String(rapier.identity.authority || '');
		let editing = null, baselineRecipe = null;
		if (same && record.editing?.sourceHash) {
			try {
				const saved = record.editing, current = _rapierImageRecord(saved.blockId, saved.imageIndex), assets = globalThis.RapierImageAssets;
				if (current && assets.normalizeLabel(current.image.reference || '') === assets.normalizeLabel(saved.asset || '')) {
					const sourceUrl = saved.asset ? assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(saved.asset))?.url : current.image.destination;
					const bytes = sourceUrl && assets.decodeDataImage(sourceUrl);
					if (bytes && await assets.hashAsset(bytes) === saved.sourceHash) {
						if (assets.dataImage(sourceUrl)?.codec === 'image/svg+xml') baselineRecipe = _rapierDrawReadSVGRecipe(new TextDecoder().decode(bytes));
						if (!baselineRecipe) {
							const popup = typeof _rapierProgressOpen === 'function' ? _rapierProgressOpen({label: 'Preparing the picture…', after: 500}) : null;
							let image;
							try {
								image = await globalThis.RapierEmbeddedImages.nativeImage(sourceUrl);
								baselineRecipe = _rapierDrawAdmitRecipe(await _rapierDrawPictureRecipe(image, {progress: fraction => popup?.set(fraction)}), true);
							} finally { image?.removeAttribute('src'); popup?.end(); }
						}
						if (baselineRecipe) editing = { ...saved, sourceUrl };
					}
				}
			} catch (_) {}
		}
		if (state.open || state.finishing || loadToken !== rapier.identity.loadToken || !_rapierMutationStampIsCurrent(stamp)) return;
		_rapierDrawOpenSurface(editing ? { recipe: record.recipe, editing, baselineRecipe, agentPatches: record.agentPatches, recovered: true, keepRasters: record.overKeepLimit } : { recipe: record.recipe, target: _rapierImageInsertionTarget(), agentPatches: record.agentPatches, recovered: true, keepRasters: record.overKeepLimit });
		if (state.open) {
			const owner = _rapierDrawBackupOwner(); owner.files = new Set(record.files); owner.recovered = true;
			state.backupAt = record.at;
			const back = 'Your unfinished drawing' + (!same && record.filename ? ' from ' + record.filename : '') + ' is back' + (record.waiting ? ' (' + record.waiting + ' more waiting)' : '');
			showToast(record.overKeepLimit
				? back + '. Its paintings together are over what one document picture can hold: Set a painting or remove one before Add, or ' + (globalThis.RapierPlatform?.environment.native === true ? 'save' : 'download') + ' the drawing.'
				: back, 'info');
			_rapierDrawBackupTouch(); void _rapierDrawBackupWrite();
		}
	} finally { state.backupOffering = false; }
}
if (typeof window !== 'undefined') {
	const kick = () => setTimeout(() => { _rapierDrawOfferRecovery().catch(error => console.warn('[rapier] draw recovery', error)); }, 2500);
	if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick, { once: true });
}
if (typeof window !== 'undefined' && RAPIER_DRAW_DOOR_AT_BIRTH) {
	const door = () => {
		const booted = typeof _rapierBootFactsPublished !== 'undefined' ? _rapierBootFactsPublished : Promise.resolve();
		booted.then(async () => {
			if (globalThis._rapierDrawDoorYielded === true) { _rapierDrawStartClass(false); return; }
			if (!_rapierDrawState.open && !_rapierDrawState.finishing) {
			if (RAPIER_DRAW_DOOR_AT_BIRTH === 'paint') {
				if (!await _rapierPartReady('notes')) return;
				await _rapierNotesPart.open(false, {unseen: true});
				if (!_rapierNotesPart.state.open) return;
				_rapierDrawState.painterNext = true;
				try { await _rapierNotesNewDrawing(null, 'paint'); } finally { _rapierDrawState.painterNext = false; }
				return;
			}
			_rapierDrawState.painterNext = RAPIER_DRAW_DOOR_AT_BIRTH === 'watercolor';
			try { rapierOpenDraw(null, RAPIER_DRAW_DOOR_AT_BIRTH === 'watercolor' ? 'water' : null); } finally { _rapierDrawState.painterNext = false; }
		} }).catch(error => showToast(String(error?.message || error), 'error')).finally(() => _rapierDrawStartClass(false));
	};
	door();
}
function _rapierDrawChangedSinceOpen() {
	const state = _rapierDrawState;
	const opened = state.openSnapshot || state.openFirst;
	return !opened || !_rapierDrawSameRecipe(opened);
}
function _rapierDrawNextName() { return _rapierDrawNextAssetName(globalThis.RapierImageAssets.documentAssets(_rapierSourceText()).assets.values()); }
function _rapierDrawSetCloseVisible(visible) { _rapierDrawState.closeBtn?.classList.toggle('rapier-draw-btn--stowed', !visible); }
function _rapierDrawShowCloseOnFailure() { _rapierDrawSetCloseVisible(true); }
const RAPIER_DRAW_INLINE_SHARE = .62, RAPIER_DRAW_COLUMN_SHARE = .91;
const RAPIER_DRAW_WIDTH_MAX = 48, RAPIER_DRAW_WIDTH_MIN = 12;
function _rapierDrawPlacement(recipe, editing, svgText) {
	if (editing) return '';
	if (_rapierPlainLayout()) return '';
	const canvasWidth = recipe?.canvas?.w, drawn = /\swidth="([0-9.]+)"/.exec(svgText || '');
	if (!(canvasWidth > 0) || !drawn) return '';
	const inkWidth = Number(drawn[1]);
	if (!(inkWidth <= canvasWidth * RAPIER_DRAW_INLINE_SHARE)) return '';
	const width = Math.round(_rapierDrawClamp(inkWidth / (canvasWidth * RAPIER_DRAW_COLUMN_SHARE) * 100, RAPIER_DRAW_WIDTH_MIN, RAPIER_DRAW_WIDTH_MAX));
	return ' <!--md-layout:v1 width=' + width + '%-->';
}
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
function _rapierDrawAssetBudget() {
	const test = typeof window !== 'undefined' ? window.__rapierDrawAssetMaxTest : undefined;
	return Number.isFinite(test) ? test : globalThis.RapierImageAssets.IMAGE_LIMITS.bytes;
}
async function _rapierDrawEffectStills(recipe, keeping = _rapierDrawWhileKeeping) {
	await keeping(work => _rapierDrawLiquidStills(recipe, work));
	return globalThis.RapierDrawRefraction.hasRefraction(recipe) ? keeping(work => globalThis.RapierDrawRefraction.prepare(recipe, {...work, displayRaster: url => _rapierPaintShownAs.get(url)})) : recipe;
}
async function _rapierDrawWhileKeeping(work, controller = new AbortController(), row = null) {
	const popup = row || (typeof _rapierProgressOpen === 'function' ? _rapierProgressOpen({ label: 'Saving at full quality', after: 500, cancel: () => controller.abort() }) : null);
	try {
		const kept = await Promise.race([work({ progress: fraction => popup?.set(row ? Math.min(.99, fraction) : fraction), signal: controller.signal }), new Promise((_, no) => controller.signal.addEventListener('abort', () => no(Object.assign(new Error('Saving canceled'), { code: 'DRAW_KEEP_GIVEN_UP' })), { once: true }))]);
		return kept;
	} finally { if (!row) popup?.end(); }
}
function _rapierDrawSaySplit(split) {
	if (!split?.length) return;
	const pieces = split.reduce((n, row) => n + row.pieces, 0);
	showToast((split.length === 1 ? 'One painting was' : split.length + ' paintings were') + ' too large for one picture, so ' + (split.length === 1 ? 'it is' : 'they are') + ' kept at full quality in ' + pieces + ' JPEG XL pieces. Nothing was lost from the drawing.', 'info');
}
function _rapierDrawFinishIdle(asset, sources) {
	const embedded = globalThis.RapierEmbeddedImages;
	if (!sources?.size || !embedded?.canFinishLater?.() || typeof _rapierPaintRecompress !== 'function') return Promise.resolve('kept');
	return embedded.finishLater({
		asset, title: asset.title, optional: true,
		busy: () => _rapierDrawState.open || !!_rapierDrawState.paintSetting || !!_rapierDrawState.finishing,
		persist: async stamp => {
			if (!_rapierMutationStampIsCurrent(stamp)) return false;
			if (_rapierNotesOwnTheDocument()) {
				const receipt = await _rapierNotesFlush();
				return _rapierMutationStampIsCurrent(receipt) && _rapierMutationStampIsCurrent(stamp);
			}
			return (globalThis.RAPIER_APPS_HOST === true ? await globalThis.RapierMcpApp?.flush()
				: await rapierFlushDirty({snapshot: true, durable: true})) === true && _rapierMutationStampIsCurrent(stamp);
		},
		final: async (_, work) => {
			const pause = async () => { await new Promise(resolve => setTimeout(resolve, 0)); work.signal.throwIfAborted(); };
			await pause();
			const text = new TextDecoder().decode(asset.bytes);
			let next = text;
			for (const [raster, source] of sources) {
				await pause();
				if (!next.includes('href="' + raster + '"')) continue;
				const fresh = await _rapierPaintRecompress(raster, source, work);
				await pause();
				if (fresh) next = next.split('href="' + raster + '"').join('href="' + fresh + '"');
			}
			return next === text ? null : next;
		},
	});
}
async function _rapierDrawFinish() {
	const state = _rapierDrawState;
	if (state.finishing || !_rapierDrawFinishText()) return;
	const big = _rapierPainterBig(), row = typeof _rapierProgressOpen === 'function' ? _rapierProgressOpen({ label: 'Saving at full quality', after: big ? 0 : 500 }) : null;
	if (big && row) await _rapierProgressPainted();
	try { await _rapierDrawFinishWith(row); } finally { if (!row?.handed) row?.end(); }
}
async function _rapierDrawFinishWith(row) {
	const state = _rapierDrawState;
	_rapierDrawReplayEnd();
	const waitingSession = state.session, pending = _rapierPaintPendingStroke();
	if (pending) { await pending; if (!state.open || state.session !== waitingSession || state.finishing) return; }
	try { const settled = _rapierPaintSettleOverflow(); if (settled) await settled; }
	catch (error) { _rapierDrawShowCloseOnFailure(); showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); return; }
	if (!state.open || state.session !== waitingSession || state.finishing) return;
	const effects = state.effectsPendingChange && _rapierDrawEffectsFlush();
	if (effects) { await effects; if (!state.open || state.session !== waitingSession || state.finishing) return; }
	if (state.agentQueue?.length) { _rapierDrawDrainAgentPatches(true); _rapierDrawReplayEnd(); }
	if (!state.finishHandoff && state.editing && !_rapierDrawChangedSinceOpen()) { void _rapierDrawBackupClear(); _rapierDrawClose(); return; }
	const empty = !_rapierDrawHasContent(state.recipe);
	if (empty && !state.editing && !state.finishHandoff) { void _rapierDrawBackupClear(); _rapierDrawClose(); return; }
	const session = state.session, sameSession = () => state.session === session, notes = state.notes;
	let editing = state.editing;
	let insertTarget = state.insertTarget, loadToken = rapier.identity.loadToken;
	state.finishing = true; state.surface.setAttribute('aria-busy', 'true');
	if (state.surface.contains(document.activeElement)) state.svgRoot.focus({preventScroll: true});
	srAnnounce('Saving drawing');
	for (const control of state.surface.querySelectorAll(':is(button:not(.rapier-dial),input,textarea,select):not(#toast-root *)')) control.disabled = true;
	_rapierDrawRenderHistory();
	let completed = false;
	const controller = new AbortController();
	const keeping = (work, cancel = true) => { if (row) { row.cancel = cancel ? () => controller.abort() : null; row.set(null); } return _rapierDrawWhileKeeping(work, controller, row); };
	const given = () => { if (controller.signal.aborted) throw Object.assign(new Error('Saving canceled'), { code: 'DRAW_KEEP_GIVEN_UP' }); };
	const refreshHandoff = handoff => {
		const editing = state.editing, source = _rapierSourceText();
		if (!handoff.bound || !_rapierMutationStampSharesDocument(handoff.documentStamp) || !editing ||
			!Number.isSafeInteger(editing.position) || state.heldRoot !== rapier.document.source?.rootId) return false;
		const record = _rapierImageRecord(editing.blockId, editing.imageIndex), span = record && _rapierExcerptCanonicalBlockSpans().get(record.block.id);
		if (!span || span.start + record.image.start !== editing.position ||
			source.slice(editing.position, editing.position + record.image.end - record.image.start) !== record.block.raw.slice(record.image.start, record.image.end)) return false;
		const assets = globalThis.RapierImageAssets, reference = record.image.reference || '';
		const url = assets.documentAssets(source).assets.get(assets.normalizeLabel(reference))?.url || record.image.destination || null;
		if (!handoff.sourceUrl || url !== handoff.sourceUrl) return false;
		handoff.stamp = Object.freeze(_rapierMutationStamp()); handoff.reference = reference;
		return true;
	};
	const keep = async handoff => {
		const belongs = () => sameSession() && state.open && _rapierMutationStampSharesDocument(handoff.documentStamp);
		if (!belongs() || !handoff.stamp || (!_rapierMutationStampIsCurrent(handoff.stamp) && !refreshHandoff(handoff))) throw new Error('The document changed before it kept the drawing');
		let kept;
		if (_rapierNotesOwnTheDocument()) {
			const note = _rapierNotes?.current, currentNote = () => typeof _rapierNotes === 'object' && note && _rapierNotes.current === note &&
				!_rapierNotes.returnRefused && _rapierNotesDocumentBound();
			if (!currentNote()) throw new Error('The note is not ready to keep the drawing');
			const receipt = await _rapierNotesFlush();
			kept = currentNote() && _rapierMutationStampIsCurrent(receipt);
			if (kept) handoff.stamp = receipt;
		} else {
			kept = (globalThis.RAPIER_APPS_HOST === true
				? await globalThis.RapierMcpApp?.flush()
				: await rapierFlushDirty({ snapshot: true, durable: true })) === true &&
				(_rapierMutationStampIsCurrent(handoff.stamp) || refreshHandoff(handoff));
		}
		const verb = globalThis.RapierPlatform?.environment.native === true ? 'save' : 'download';
		if (!kept || !belongs()) throw new Error(typeof _rapierPersistenceRuntime === 'object' && _rapierPersistenceRuntime.recoveryHeld
			? 'Saving is paused for the saved draft. Recover it, then try Done again, or ' + verb + ' the drawing.'
			: 'The document has not kept the drawing yet. Try Done again or ' + verb + ' it.');
		void _rapierDrawBackupClear(handoff.recovery);
		if (!_rapierDrawSameRecipe(handoff.recipe)) return;
		state.finishHandoff = null;
		await _rapierDrawClose({ landed: true });
		if (state.open || state.session !== session + 1 || !_rapierMutationStampSharesDocument(handoff.documentStamp)) return;
		completed = true;
		srAnnounce(handoff.reference ? 'Drawing saved' : 'Drawing removed');
		if (handoff.reference && row) { row.handed = true; row.set(null); }
		if (handoff.reference) _rapierDrawLand(handoff.reference, 180, ready => { if (ready) row?.set(1); row?.end(); });
		else row?.set(1);
		if (handoff.notes && handoff.newDrawing) _rapierDrawReadyForWords(handoff.reference);
		if (handoff.asset) void _rapierDrawFinishIdle(handoff.asset, handoff.idleSources);
	};
	try {
		if (state.finishHandoff && _rapierDrawSameRecipe(state.finishHandoff.recipe)) { await keep(state.finishHandoff); return; }
		if (state.finishHandoff && !refreshHandoff(state.finishHandoff)) throw new Error('The drawing is no longer bound to its place in the document. ' + (globalThis.RapierPlatform?.environment.native === true ? 'Save' : 'Download') + ' it or close it for recovery.');
		if (notes?.fresh && notes.ready) {
			const ok = await notes.ready;
			if (!sameSession() || !state.open) return;
			if (!ok) {
				const choice = await rapierConfirm({ title: 'unsaved drawing', message: 'The note could not be written. ' + (globalThis.RapierPlatform?.environment.native === true ? 'Save' : 'Download') + ' the drawing as a file?', confirmLabel: globalThis.RapierPlatform?.environment.native === true ? 'Save' : 'Download' });
				if (!sameSession() || !state.open) return;
				if (choice === true) await _rapierDrawDownload(session);
				return;
			}
			insertTarget = _rapierDrawLineTarget(); loadToken = rapier.identity.loadToken;
		}
		const deadline = Date.now() + 650;
		while (_rapierUserMutationBlocked(false) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 40));
		if (_rapierUserMutationBlocked(false)) throw new Error('Document is still busy; try Done again');
		editing = state.editing;
		if (!notes?.fresh) {
			insertTarget = state.insertTarget;
			if (!editing && state.heldRoot !== rapier.document.source?.rootId) insertTarget = _rapierDrawLineTarget();
		}
		if (empty) {
			const recovery = _rapierDrawBackupTicket(), drawn = _rapierDrawHistoryRecipe(), documentStamp = Object.freeze(_rapierMutationStamp());
			await _rapierDrawRemoveEditedEmpty(editing);
			if (!sameSession() || !state.open) return;
			const handoff = state.finishHandoff = { recovery, recipe: drawn, documentStamp, notes, bound: false,
				stamp: _rapierMutationStampSharesDocument(documentStamp) ? Object.freeze(_rapierMutationStamp()) : null };
			await keep(handoff);
			return;
		}
		await _rapierDrawLoadFonts(state.recipe, session);
		if (!state.open || !sameSession()) return;
		const drawn = _rapierDrawHistoryRecipe(), recovery = _rapierDrawBackupTicket();
		let recipe = _rapierDrawRestoreRecipe(drawn);
		const stamp = Object.freeze(_rapierMutationStamp());
		recipe.tool = state.tool;
		const paperImage = await _rapierBgPaperSnapshot(recipe);
		if (!state.open || !sameSession()) return;
		const idleSources = new Map(state.paintFastSources || []);
		const measure = typeof _rapierDrawMeasuredView === 'function' ? _rapierDrawMeasuredView : undefined;
		if (typeof _rapierPaintKeepAsJXL === 'function') {
			try {
				_rapierDrawSaySplit(await keeping(work => _rapierPaintKeepAsJXL(recipe, false, null, {...work, sources: idleSources})));
			} catch (error) {
				if (error?.code === 'DRAW_KEEP_GIVEN_UP') throw error;
				console.warn('[rapier] paint keep', error);
			}
		}
		// FORM, never a licence to delete the content: before Add is refused, Rapier changes the form --
		if (!_rapierDrawAdmitRecipe(recipe)) {
			await _rapierDrawTooLarge(session);
			return;
		}
		recipe = await _rapierDrawEffectStills(recipe, keeping);
		if (!state.open || !sameSession()) return;
		if (row) { row.cancel = null; row.set(null); }
		given();
		let svgText = _rapierDrawBuildSVG(recipe, measure, true, {paperImage});
		if (!svgText) throw new Error('The complete drawing could not be prepared');
		let svgBytes = new TextEncoder().encode(svgText);
		if (svgBytes.length > _rapierDrawAssetBudget() && (typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl')) {
			const before = svgBytes.length;
			row?.set(null);
			if (!await _rapierPaintReencodeQuality95(recipe)) {
				await _rapierDrawTooLarge(session);
				return;
			}
			await _rapierDrawLiquidStills(recipe);
			if (globalThis.RapierDrawRefraction.hasRefraction(recipe)) recipe = await keeping(work => globalThis.RapierDrawRefraction.prepare(recipe, {...work, displayRaster: url => _rapierPaintShownAs.get(url)}), false);
			const smallerText = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true, {paperImage}), smallerBytes = new TextEncoder().encode(smallerText);
			if (smallerBytes.length > _rapierDrawAssetBudget()) {
				await _rapierDrawTooLarge(session);
				return;
			}
			if (!await _rapierPaintOfferQuality95(before, smallerBytes.length)) {
				await _rapierDrawTooLarge(session);
				return;
			}
			svgText = smallerText; svgBytes = smallerBytes;
			showToast('This drawing was too large for one picture at full quality, so its painting is kept at quality 95 instead (' + Math.round(smallerBytes.length / 1024) + ' KiB).', 'info');
		}
		if (svgBytes.length > _rapierDrawAssetBudget()) {
			await _rapierDrawTooLarge(session);
			return;
		}
		const assetTitle = editing?.title || _rapierDrawNextName();
		given();
		const asset = await globalThis.RapierImageAssets.createAsset(svgBytes, null, { codec: 'image/svg+xml', title: assetTitle });
		if (loadToken !== rapier.identity.loadToken || !sameSession()) throw new Error('Document changed; try Draw again');
		const previousAlt = editing?.title || '', generatedAlt = _rapierDrawTextAlternative(state.openSnapshot?.recipe);
		const alt = editing && previousAlt && _rapierEscapeImageAlt(previousAlt) !== _rapierEscapeImageAlt(generatedAlt) ? previousAlt : _rapierDrawTextAlternative(recipe, notes?.alt || 'Drawing');
		const raw = '![' + _rapierEscapeImageAlt(alt) + '][' + asset.label + ']' + (notes ? '' : _rapierDrawPlacement(recipe, editing, svgText));
		const target = editing ? { replaceImage: { blockId: editing.blockId, imageIndex: editing.imageIndex } } : insertTarget || {};
		const normalized = { asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height };
		given();
		const inserted = await globalThis.RapierEmbeddedImages.insert(normalized, raw, target, stamp, { receipt: true });
		if (!inserted?.committed) throw new Error('Document changed; try Draw again');
		if (!sameSession() || !state.open) return;
		const occurrence = inserted.occurrence;
		const handoff = state.finishHandoff = { recovery, recipe: drawn, documentStamp: inserted.documentStamp, stamp: inserted.stamp,
			notes, bound: !!occurrence, reference: occurrence?.reference, sourceUrl: occurrence?.sourceUrl, newDrawing: !editing, asset, idleSources };
		if (occurrence && sameSession() && _rapierMutationStampSharesDocument(inserted.documentStamp)) {
			state.editing = { ...occurrence, asset: occurrence.reference, title: alt };
			state.openSnapshot = drawn; state.heldRoot = rapier.document.source?.rootId;
		}
		await keep(handoff);
	} catch (error) {
		if (error?.code === 'DRAW_KEEP_GIVEN_UP') { if (sameSession()) showToast('Saving canceled. The drawing is still open.', 'info'); }
		else if (sameSession()) { _rapierDrawShowCloseOnFailure(); showToast((state.finishHandoff ? 'Drawing could not be kept: ' : 'Drawing could not be placed: ') + String(error.message || error), 'error'); }
	} finally {
		state.finishing = false; state.surface.removeAttribute('aria-busy');
		for (const control of state.surface.querySelectorAll(':is(button:not(.rapier-dial),input,textarea,select):not(#toast-root *)')) control.disabled = false;
		_rapierDrawRenderHistory();
		if (completed) globalThis.RapierPlatform?.host?.reviewFinished?.('drawing-done');
	}
}
function _rapierDrawReadyForWords(label) {
	if (rapier.access.readOnly || rapier.view.mode === 'source' || _rapierUserMutationBlocked()) return;
	const blocks = rapier.document.blocks, at = blocks.findIndex(row => String(row.raw || '').includes('][' + label + ']'));
	if (at < 0) return;
	if (rapier.view.mode !== 'edit' && typeof rapierSetMode === 'function') rapierSetMode('edit', { announce: false });
	const next = blocks[at + 1], id = next && !String(next.raw || '').trim() ? next.id : _insertBlockAfter(blocks[at].id, '', { noEdit: true });
	const line = id != null && rapier.document.blocks.find(row => row.id === id);
	if (line && typeof _rapierNotesHeadClaim === 'function') _rapierNotesHeadClaim(id);
	const wrapper = line && document.querySelector('#editor-blocks > .block-wrapper[data-block-id="' + id + '"]');
	if (wrapper) enterBlockEdit(line, wrapper, { charOffset: 0, preserveScroll: true });
}
async function _rapierDrawTooLarge(session) {
	showToast('This drawing is too large for the document, so it is saved as a file instead.', 'info');
	await _rapierDrawDownload(session);
}
async function _rapierDrawDownload(session) {
	const state = _rapierDrawState, live = () => state.open && state.session === session;
	const check = () => { if (!live()) throw Object.assign(new Error('The drawing changed before its file was written.'), {name: 'AbortError'}); };
	if (!live()) return;
	try {
		const docBase = String(rapier.document.filename || 'document').replace(/\.[a-z0-9]+$/i, '') || 'document';
		const name = (state.editing?.asset || (docBase + '-drawing')) + '.svg';
		const reserve = window.RapierPlatform?.files?.prepareExportArtifact;
		const reserved = typeof reserve === 'function' ? await reserve(name) : undefined;
		if (reserved === null || !state.open || state.session !== session) return;
		await _rapierDrawLoadFonts(state.recipe, session);
		if (!state.open || state.session !== session) return;
		const flushing = _rapierPaintFlushRevision(undefined, true);
		if (flushing) { await flushing; if (!state.open || state.session !== session) return; }
		let recipe = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe());
		const recovery = _rapierDrawBackupTicket();
		const paperImage = await _rapierBgPaperSnapshot(recipe);
		if (!state.open || state.session !== session) return;
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
		recipe = await _rapierDrawEffectStills(recipe);
		if (!state.open || state.session !== session) return;
		const svgText = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true, {paperImage});
		if (!svgText) throw new Error('The complete drawing could not be prepared');
		const svgBytes = new TextEncoder().encode(svgText);
		const blob = new Blob([svgBytes], { type: 'image/svg+xml' });
		let receipt, saved;
		if (reserved) {
			receipt = await reserved(blob, {check}); saved = _rapierExportOutcome(receipt);
		} else {
			const files = window.RapierPlatform?.files;
			const exportFile = typeof files?.exportArtifact === 'function' ? files.exportArtifact : typeof files?.saveAs === 'function' ? files.saveAs : null;
			if (exportFile) {
				try { receipt = await exportFile(blob, name, {check}); saved = _rapierExportOutcome(receipt); }
				catch (error) { console.warn('[rapier] platform export failed; inline fallback was not attempted', error); saved = null; }
			} else saved = await _download(blob, name);
		}
		if (!live()) return;
		if (saved === true) {
			if (receipt?.status === 'confirmed' && receipt.confirmed === true) await _rapierDrawBackupClear(recovery);
			else {
				if (!live()) return;
				_rapierDrawBackupTouch();
				const kept = await _rapierDrawBackupFlush();
				if (!live()) return;
				if (!kept) { _rapierDrawShowCloseOnFailure(); return; }
			}
			if (state.open && state.session === session) _rapierDrawClose();
		}
		else if (saved !== false && state.open && state.session === session) { _rapierDrawShowCloseOnFailure(); showToast('The drawing could not be saved as a file. It is still open; try Done again.', 'error'); }
	} catch (error) {
		if (state.open && state.session === session) { _rapierDrawShowCloseOnFailure(); showToast('The drawing could not be saved as a file. It is still open: ' + String(error?.message || error), 'error'); }
	}
}
function _rapierPainterOver(dst, src, opacity, multiply) {
	for (let q = 0; q < dst.length; q += 4) {
		const sa = src[q + 3] * opacity / 255, da = dst[q + 3] / 255, oa = sa + da * (1 - sa);
		if (!sa) continue;
		for (let c = 0; c < 3; c++) {
			const s = src[q + c], d = dst[q + c];
			dst[q + c] = oa ? ((multiply ? (1 - da) * s + da * s * d / 255 : s) * sa + d * da * (1 - sa)) / oa : s;
		}
		dst[q + 3] = oa * 255;
	}
}
async function _rapierPainterLayers(recipe, svg, signal) {
	const view = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number), paints = recipe.shapes.filter(shape => shape.recognized === 'paint' && shape.raster);
	const big = paints.reduce((a, shape) => !a || shape.paint.px[0] * shape.paint.px[1] > a.paint.px[0] * a.paint.px[1] ? shape : a, null), frame = big && _rapierDrawShapePolygon(big, recipe);
	const scale = big ? big.paint.px[0] / Math.hypot(frame[1][0] - frame[0][0], frame[1][1] - frame[0][1]) : 2;
	const W = Math.round(view[2] * scale), H = Math.round(view[3] * scale);
	if (!(W * H <= _rapierPaintPNG.pixelLimit)) throw new Error('This painting is too large to save as a picture.');
	const render = async sub => {
		const text = _rapierDrawBuildSVG(sub, _rapierDrawMeasuredView, true).replace(/prefers-color-scheme:\s*dark/g, 'not all').replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, 'viewBox="' + view.join(' ') + '" width="' + W + '" height="' + H + '"');
		const url = URL.createObjectURL(new Blob([text], {type: 'image/svg+xml'})), image = new Image(), board = document.createElement('canvas');
		try { image.src = url; await image.decode(); board.width = W; board.height = H; const context = board.getContext('2d', {willReadFrequently: true}); context.drawImage(image, 0, 0, W, H); return context.getImageData(0, 0, W, H).data; }
		finally { URL.revokeObjectURL(url); board.width = 0; }
	};
	const decode = async raster => await globalThis.RapierDrawAgentPaint.decodePaintRaster(raster, {signal}) || (_rapierPaintShownAs.get(raster) ? globalThis.RapierDrawAgentPaint.decodePaintRaster(_rapierPaintShownAs.get(raster), {signal}) : null);
	const bare = ({background, ...rest}) => rest;
	const {effect, ...authored} = recipe;
	const layers = [];
	if (recipe.background) layers.push({name: 'Canvas', data: await render({...authored, shapes: []}), opacity: 1});
	let vectors = [];
	const flush = async () => { if (vectors.length) layers.push({name: 'Drawing', data: await render({...bare(authored), shapes: vectors}), opacity: 1}); vectors = []; };
	for (const shape of recipe.shapes) {
		if (shape.recognized !== 'paint' || !shape.raster) { vectors.push(shape); continue; }
		await flush();
		const f = _rapierDrawShapePolygon(shape, recipe), [w, h] = shape.paint.px, x = (f[0][0] - view[0]) * scale, y = (f[0][1] - view[1]) * scale;
		const placed = Math.abs(x - Math.round(x)) < 1e-3 && Math.abs(y - Math.round(y)) < 1e-3 && Math.abs(f[1][1] - f[0][1]) < 1e-6 && Math.abs(f[3][0] - f[0][0]) < 1e-6 &&
			Math.abs((f[1][0] - f[0][0]) * scale - w) < 1e-3 && Math.abs((f[3][1] - f[0][1]) * scale - h) < 1e-3;
		const px = await decode(shape.raster);
		if (!px || px.width !== w || px.height !== h) throw new Error('This browser cannot read the painting\'s exact pixels.');
		let data;
		if (placed && !shape.effect) {
			data = new Uint8ClampedArray(W * H * 4);
			for (let row = 0, X = Math.round(x), Y = Math.round(y); row < h; row++) {
				const top = Y + row, left = Math.max(0, X), right = Math.min(W, X + w);
				if (top >= 0 && top < H && right > left) data.set(px.data.subarray((row * w + left - X) * 4, (row * w + right - X) * 4), (top * W + left) * 4);
			}
		} else data = await render({...bare(authored), shapes: [{...shape, opacity: undefined, raster: _rapierPaintPNG.encode(px)}]});
		layers.push({name: (shape.paint.mode === 'water' ? 'Water ' : 'Paint ') + (layers.length + 1), data, opacity: shape.opacity ?? 1,
			multiply: shape.paint.mode === 'water' && recipe.background?.kind === 'paper'});
	}
	await flush();
	let composite = layers;
	if (effect) { const exact = []; for (const shape of recipe.shapes) exact.push(shape.recognized === 'paint' && shape.raster ? {...shape, raster: _rapierPaintPNG.encode(await decode(shape.raster))} : shape);
		composite = [{data: await render({...recipe, shapes: exact}), opacity: 1}]; }
	const merged = new Uint8ClampedArray(W * H * 4), [first] = composite, whole = first?.opacity === 1 && !first.multiply;
	if (whole) merged.set(first.data);
	for (const layer of composite.slice(whole ? 1 : 0)) _rapierPainterOver(merged, layer.data, layer.opacity, layer.multiply);
	return {W, H, layers, merged};
}
async function _rapierPainterPNG(width, height, data) {
	const url = await _rapierPaintPNG.compressed({width, height, data}), back = await _rapierPaintPNG.decode(url);
	if (!back || back.data.length !== data.length || back.data.some((v, i) => v !== data[i])) throw new Error('The PNG did not keep the painting exactly.');
	return Uint8Array.from(atob(url.slice(22)), c => c.charCodeAt(0));
}
function _rapierPngSoftware(png) {
	const word = new TextEncoder().encode('Software\0Rapier'), out = new Uint8Array(png.length + 12 + word.length), view = new DataView(out.buffer);
	out.set(png.subarray(0, 33));
	view.setUint32(33, word.length); out.set([116, 69, 88, 116], 37); out.set(word, 41);
	let c = -1;
	for (const byte of out.subarray(37, 41 + word.length)) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; }
	view.setUint32(41 + word.length, (c ^ -1) >>> 0);
	out.set(png.subarray(33), 45 + word.length);
	return out;
}
async function _rapierPainterORA(out, svg) {
	await RapierParts.need('notes');
	const entries = [{name: 'mimetype', bytes: 'image/openraster'}], stack = [];
	for (const [i, layer] of out.layers.entries()) {
		entries.push({name: 'data/layer' + i + '.png', bytes: await _rapierPainterPNG(out.W, out.H, layer.data)});
		stack.unshift('<layer name="' + layer.name + '" src="data/layer' + i + '.png" x="0" y="0" opacity="' + layer.opacity + '" visibility="visible" composite-op="svg:' + (layer.multiply ? 'multiply' : 'src-over') + '"/>');
	}
	const k = Math.min(1, 256 / Math.max(out.W, out.H)), w = Math.max(1, Math.round(out.W * k)), h = Math.max(1, Math.round(out.H * k)), full = document.createElement('canvas'), thumb = document.createElement('canvas');
	full.width = out.W; full.height = out.H; full.getContext('2d').putImageData(new ImageData(out.merged, out.W, out.H), 0, 0);
	thumb.width = w; thumb.height = h; const context = thumb.getContext('2d'); context.drawImage(full, 0, 0, w, h);
	const small = context.getImageData(0, 0, w, h).data; full.width = thumb.width = 0;
	entries.push({name: 'stack.xml', bytes: '<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="' + out.W + '" h="' + out.H + '"><stack>' + stack.join('') + '</stack></image>\n'},
		{name: 'mergedimage.png', bytes: _rapierPngSoftware(await _rapierPainterPNG(out.W, out.H, out.merged))}, {name: 'Thumbnails/thumbnail.png', bytes: await _rapierPainterPNG(w, h, small)}, {name: 'drawing.svg', bytes: svg});
	return globalThis.RapierZipRecords.zipStored(entries);
}
async function _rapierDrawSavePainting(leaving = false) {
	const state = _rapierDrawState, session = state.session, live = () => state.open && state.session === session;
	if (!live() || state.finishing || state.painterOpening?.session === session || !_rapierDrawFinishText()) return;
	const opening = state.painterOpening = {session};
	const preparing = _rapierProgressOpen({label: 'Preparing drawing', after: _rapierPainterBig() ? 0 : 500});
	_rapierDrawReplayEnd();
	try {
		const pending = _rapierPaintPendingStroke(); if (pending) await pending;
		const settled = live() && _rapierPaintSettleOverflow(); if (settled) await settled;
		const effects = live() && state.effectsPendingChange && _rapierDrawEffectsFlush(); if (effects) await effects;
		const flushing = live() && _rapierPaintFlushRevision(undefined, true); if (flushing) await flushing;
		if (live() && state.agentQueue?.length) { _rapierDrawDrainAgentPatches(true); _rapierDrawReplayEnd(); }
	} catch (error) { if (live()) showToast('The painting could not be prepared. It is still open: ' + String(error?.message || error), 'error'); return; }
	finally { preparing.end(); if (state.painterOpening === opening) state.painterOpening = null; }
	if (!live()) return;
	const untouched = () => !state.finishHandoff && (state.editing ? !_rapierDrawChangedSinceOpen() : !_rapierDrawHasContent(state.recipe));
	if (untouched() && (state.editing || leaving && !state.undoStack.length && !state.redoStack.length)) { void _rapierDrawFinish(); return; }
	const jxl = typeof _rapierJxlEncoderPresent !== 'function' || _rapierJxlEncoderPresent();
	const native = window.RapierPlatform?.environment.native === true;
	const download = (format, word) => '<button type="button" class="settings-action-btn" data-download="' + format + '">' + word + '</button>';
	const overlay = document.createElement('div');
	overlay.className = 'link-dialog__overlay';
	overlay.innerHTML = '<div class="link-dialog rapier-draw-save" role="dialog" aria-modal="true" aria-label="Done painting"><div class="link-dialog__actions"><span class="link-dialog__spacer"></span>' +
		'<button type="button" class="link-dialog__btn" data-info aria-label="Info" aria-expanded="false" aria-controls="rapier-save-info">' + RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>') + '</button></div>' +
		'<p class="link-dialog__description" id="rapier-save-info" hidden>Add to document puts the painting in your document; Undo takes it out. JPEG XL is lossless and small. PNG opens everywhere. Layers is an OpenRaster file (.ora) for Krita, GIMP and MyPaint: each layer, the merged picture and the editable SVG. One painting layer saves exactly; effects, moved layers and drawings are flattened. The picture is what the canvas shows: with no background it is transparent. Tap outside to return to your painting.</p>' +
		'<div class="rapier-pop__actions"><button type="button" class="settings-action-btn" data-act="add">Add to document</button>' +
		'<div class="link-dialog__title" id="rapier-save-download">' + (native ? 'Save:' : 'Download:') + '</div>' +
		'<div class="settings-action-pair" role="group" aria-labelledby="rapier-save-download">' + (jxl ? download('jxl', 'JPEG XL') : '') + download('png', 'PNG') + download('ora', 'Layers') + '</div>' +
		'<button type="button" class="settings-action-btn" data-act="exit" data-pop-bottom>Exit without saving</button></div></div>';
	const progress = _rapierProgressOver(overlay, true);
	let work = null;
	const dialog = _rapierBeginEngineDialog(overlay, () => { work?.abort(); progress.release(); });
	const say = (words, error) => { if (words) { progress.notice(); showToast(words, error ? 'error' : 'info'); } };
	requestAnimationFrame(() => overlay.querySelector('[data-act="add"]')?.focus());
	overlay.addEventListener('click', async event => {
		if (event.target === overlay) { dialog.cancel(true); return; }
		const target = event.target.closest?.('button');
		if (!target || work) return;
		if (target.hasAttribute('data-info')) { const info = overlay.querySelector('#rapier-save-info'), open = info.hidden; info.hidden = !open; target.setAttribute('aria-expanded', String(open)); return; }
		if (target.dataset.act === 'add' && !_rapierDrawHasPlace(state.notes)) { say('This document is plain text, so it cannot hold a drawing. ' + (native ? 'Save' : 'Download') + ' keeps your drawing.'); return; }
		if (target.dataset.act === 'add') { dialog.cancel(false); if (live()) await _rapierDrawFinish(); return; }
		if (target.dataset.act === 'exit') {
			dialog.cancel(false);
			if (live() && untouched()) { await _rapierDrawBackupClear(); await _rapierDrawClose(); }
			else if (live()) await _rapierDrawClose({ recover: true });
			return;
		}
		const format = target.dataset.download;
		if (!format) return;
		const controller = work = new AbortController(), name = 'painting.' + format;
		const row = progress.open({label: 'Saving picture', after: _rapierPainterBig() ? 0 : 500, cancel: () => controller.abort()});
		for (const control of overlay.querySelectorAll('.rapier-draw-save button')) control.disabled = true;
		say('');
		try {
			const reserve = window.RapierPlatform?.files?.prepareExportArtifact;
			const reserved = typeof reserve === 'function' ? await reserve(name) : undefined;
			if (reserved === null) return;
			controller.signal.throwIfAborted(); if (!live()) return;
			let recipe = _rapierDrawRestoreRecipe(_rapierDrawHistoryRecipe());
			await _rapierDrawLoadFonts(recipe, session);
			recipe = await _rapierDrawEffectStills(recipe, task => task({signal: controller.signal, progress: f => row.set(f * .5)}));
			controller.signal.throwIfAborted(); if (!live()) return;
			const svg = _rapierDrawBuildSVG(recipe, _rapierDrawMeasuredView, true);
			if (!svg) throw new Error('The painting could not be prepared.');
			const out = await _rapierPainterLayers(recipe, svg, controller.signal);
			controller.signal.throwIfAborted();
			let bytes, type = 'image/' + format;
			if (format === 'jxl') bytes = (await globalThis.RapierEmbeddedImages.codec('encode', {width: out.W, height: out.H, data: new Uint8Array(out.merged.buffer), options: {lossless: true, losslessProfile: 'painting'}}, {signal: controller.signal, progress: f => row.set(f * .95)})).bytes;
			else if (format === 'png') bytes = _rapierPngSoftware(await _rapierPainterPNG(out.W, out.H, out.merged));
			else { bytes = await _rapierPainterORA(out, svg); type = 'image/openraster'; }
			controller.signal.throwIfAborted(); if (!live()) return;
			row.end();
			const blob = new Blob([bytes], {type});
			const saved = reserved ? _rapierExportOutcome(await reserved(blob, {check: () => controller.signal.throwIfAborted()})) : await _download(blob, name);
			if (RAPIER_WATER_CAPTURE) await _rapierWaterCaptureSave();
			if (live() && !controller.signal.aborted) { if (saved === true) say(name + (native ? ' saved' : ' sent to downloads')); else if (saved !== false) say('Not saved: the file could not be written.', true); }
		} catch (error) {
			if (live() && !controller.signal.aborted) say('Not saved: ' + String(error?.message || error), true);
		} finally {
			row.end(); work = null;
			for (const control of overlay.querySelectorAll('.rapier-draw-save button')) control.disabled = false;
			if (target.isConnected && (!document.activeElement || document.activeElement === document.body)) target.focus({ preventScroll: true });
		}
	});
}
function _rapierPainterBig() { return _rapierDrawState.recipe.shapes.some(shape => shape.paint?.px?.[0] * shape.paint?.px?.[1] > 4e6); }
function _rapierDrawHandleBack() {
	const state = _rapierDrawState;
	if (!state.open) return false;
	globalThis.RapierAgentBrowser?.drawingNavigationChanged?.();
	if (state.dropper) { state.dropper.close(false); return true; }
	if (state.resize) { void _rapierDrawResizeDone(true); return true; }
	if (state.canvasMenuOpen) { _rapierDrawSetCanvasMenu(false); return true; }
	if (state.toolMenuOpen) { _rapierDrawSetToolMenu(false); return true; }
	if (state.surface?.querySelector('[data-draw-panel]:not([hidden])')) {
		_rapierDrawCloseSettingPanels(); _rapierDrawUpdateMenu(); _rapierDrawUpdateHandles();
		return true;
	}
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
	void _rapierDrawSavePainting(true);
	return true;
}
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
function _rapierDrawInANote() { return typeof _rapierNotesDrawFor === 'function' ? _rapierNotesDrawFor(false) : null; }
function _rapierDrawHasPlace(notes) { return !!notes || rapier.document.docKind === 'markdown'; }
function rapierOpenDraw(notes = _rapierDrawInANote(), tool = null) {
	if (typeof _rapierWaterStatsStart === 'function') _rapierWaterStatsStart();
	if (notes?.fresh && notes.ready) { _rapierDrawOpenSurface({ target: null, notes, tool }); return; }
	if (_rapierUserMutationBlocked()) return;
	_rapierDrawOpenSurface({ target: !_rapierDrawHasPlace(notes) ? null : notes ? _rapierDrawLineTarget() : _rapierImageInsertionTarget(), notes, tool });
}












async function _rapierDrawPictureRecipe(imageEl, work = {}) {
	const {signal, progress} = work;
	signal?.throwIfAborted();
	const w = imageEl.naturalWidth, h = imageEl.naturalHeight;
	if (!(w > 0 && h > 0)) throw new Error('This picture has not finished loading');
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('This picture is larger than the 12-megapixel painting surface. Use a smaller copy to draw on.');
	if (w > 16384 || h > 16384) throw new Error('This picture is too wide or tall for the painting surface. Use a smaller copy to draw on.');
	const recipe = raster => ({version: RAPIER_DRAW_VERSION, canvas: {w, h}, strokes: [],
		shapes: [{id: 's1', recognized: 'paint', geom: {cx: w / 2, cy: h / 2, w, h, rot: 0}, raster, paint: {px: [w, h], scale: 1}}]});
	const original = _rapierDrawImageDataUrl(imageEl) || imageEl.currentSrc || imageEl.getAttribute('src');
	if (globalThis.RapierDrawCore._rapierDrawValidRaster(original, Infinity)) return recipe(original);
	const canvas = document.createElement('canvas');
	canvas.width = w; canvas.height = h;
	const popup = typeof progress === 'function' || typeof _rapierProgressOpen !== 'function' ? null : _rapierProgressOpen({label: 'Preparing the picture…', after: 500});
	let fraction = 0;
	const report = value => {
		if (!Number.isFinite(value)) return;
		fraction = Math.max(fraction, Math.min(1, Math.max(0, value)));
		progress?.(fraction); popup?.set(fraction);
	};
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
				{width: w, height: h, data: new Uint8Array(px.data.buffer.slice(0)), options: {lossless: true}}, {signal, progress: report});
			raster = 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out);
		} catch (error) {
			if (error?.code !== 'JXL_SIZE') throw error;
			raster = canvas.toDataURL('image/png');
		}
		signal?.throwIfAborted();
		if (!globalThis.RapierDrawCore._rapierDrawValidRaster(raster, Infinity)) throw new Error('The complete picture could not be kept for drawing');
		return recipe(raster);
	} finally { canvas.width = 0; canvas.height = 0; popup?.end(); }
}

async function _rapierDrawOnPicture() {
	const blockId = _rapierImageRuntime.blockId, imageIndex = _rapierImageRuntime.imageIndex;
	const record = _rapierImageRecord(blockId, imageIndex);
	const imageEl = _rapierImageRuntime.image;
	if (!record || !imageEl) { showToast('That picture is no longer available', 'info'); return; }
	const stamp = Object.freeze(_rapierMutationStamp());
	const sourceUrl = _rapierDrawImageDataUrl(imageEl) || imageEl.currentSrc || imageEl.getAttribute('src');
	let recipe;
	const controller = new AbortController();
	const popup = _rapierProgressOpen({label: 'Opening picture', after: 500, cancel: () => controller.abort()});
	const work = {signal: controller.signal, progress: fraction => popup.set(fraction)};
	try {
		recipe = await _rapierDrawPictureRecipe(imageEl, work);
		controller.signal.throwIfAborted();
	} catch (error) { if (error?.name !== 'AbortError') showToast(String(error?.message || error), 'error'); return; }
	finally { popup.end(); }
	if (!_rapierMutationStampIsCurrent(stamp) ||
		(_rapierDrawImageDataUrl(imageEl) || imageEl.currentSrc || imageEl.getAttribute('src')) !== sourceUrl ||
		_rapierImageRuntime.image !== imageEl || _rapierImageRuntime.blockId !== blockId || _rapierImageRuntime.imageIndex !== imageIndex) {
		showToast('That picture changed while it was being read; press the brush again', 'info'); return;
	}
	const currentAlt = _rapierRenderModule('render-markdown')._rapierImageAltText(_rapierRenderModule('render-markdown')._rapierImageAltSourceParts(record.image.altSource).alt);
	const asset = imageEl.getAttribute('data-rapier-asset') || record.image.reference || '';
	_rapierDrawOpenSurface({recipe, keepRasters: true, editing: {blockId: record.block.id, imageIndex: record.imageIndex, title: currentAlt, asset, sourceUrl}, notes: _rapierDrawInANote()});
	_rapierCloseImageTools();
}

async function _rapierEditDrawing() {
	const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
	const imageEl = _rapierImageRuntime.image;
	if (!record || !imageEl) { showToast('Drawing is no longer available', 'info'); return; }
	const drawing = _rapierDrawImageRecipe(imageEl), stamp = _rapierMutationStamp();
	if (drawing?.pending && !drawing.ready) await drawing.pending;
	if (!_rapierMutationStampIsCurrent(stamp) || _rapierImageRuntime.image !== imageEl ||
		_rapierImageRuntime.blockId !== record.block.id || _rapierImageRuntime.imageIndex !== record.imageIndex ||
		_rapierDrawImageDataUrl(imageEl) !== drawing?.url) return;
	const recipe = drawing?.recipe;
	if (drawing?.error) { showToast(drawing.error.message, 'error'); return; }
	if (!recipe) { await _rapierDrawOnPicture(); return; }

	const currentAlt = _rapierRenderModule('render-markdown')._rapierImageAltText(_rapierRenderModule('render-markdown')._rapierImageAltSourceParts(record.image.altSource).alt);
	const asset = imageEl.getAttribute('data-rapier-asset') || record.image.reference || '';
	_rapierDrawOpenSurface({ recipe, editing: { blockId: record.block.id, imageIndex: record.imageIndex, title: currentAlt, asset, sourceUrl: drawing.url }, notes: _rapierDrawInANote() });
	_rapierCloseImageTools();
}
async function _rapierPaintFinishKept({recipe, rasters, text, pixels}, report) {
	const split = await _rapierPaintKeepAsJXL(recipe, false, null, { progress: report, preparedPixels: pixels });
	if (split.length) return null;
	const swaps = new Map();
	for (const [id, old] of rasters) {
		const fresh = recipe.shapes.find(shape => shape.id === id)?.raster;
		if (!fresh?.startsWith('data:image/jxl;') || (swaps.has(old) && swaps.get(old) !== fresh)) return null;
		swaps.set(old, fresh);
	}
	let next = text;
	for (const [old, fresh] of swaps) {
		if (!next.includes('href="' + old + '"')) return null;
		next = next.split('href="' + old + '"').join('href="' + fresh + '"');
	}
	return new TextEncoder().encode(next).length <= _rapierDrawAssetBudget() ? next : null;
}
async function _rapierDrawLiquidFinish(recipe, defs, report) {
	await _rapierDrawLiquidStills(recipe, { progress: report }, defs);
	const next = _rapierDrawBuildSVG(recipe, undefined, true);
	return next && next.includes('data-rapier-liquid-still') && new TextEncoder().encode(next).length <= _rapierDrawAssetBudget() ? next : null;
}
function _rapierDrawPersonalKeys() {
	return {...Object.fromEntries(Object.entries(RAPIER_DRAW_MEMORY).map(([key, value]) => [key, value[0]])),
		recentInks: RAPIER_DRAW_RECENT_KEY, paintBrush: RAPIER_PAINT_BRUSH_KEY, paintStrength: RAPIER_PAINT_STRENGTH_KEY, paintHead: RAPIER_PAINT_HEAD_KEY,
		paintSizes: RAPIER_PAINT_SIZES_KEY, paintDips: RAPIER_PAINT_DIP_KEY};
}
function _rapierDrawPersonalApplied() {
	const state = _rapierDrawState;
	if (!state.open) return;
	if (!state.gesture) {
		const remembered = _rapierPaintRememberedBrush();
		if (state.waterFallbackRemembered == null || remembered !== state.waterFallbackRemembered) {
			state.paintBrush = remembered; state.paintSize = _rapierPaintRememberedSize();
			state.waterFallbackRemembered = null;
		}
		state.paintStrength = _rapierPaintRememberedStrength(); state.paintHead = null;
	}
	_rapierDrawSyncTextPanels(); _rapierDrawUpdateMenu(); _rapierPaintUpdateStrip();
}
_rapierDrawPart = Object.freeze({
	state: _rapierDrawState, open: rapierOpenDraw, surface: _rapierDrawOpenSurface, edit: _rapierEditDrawing, onPicture: _rapierDrawOnPicture,
	renderAll: _rapierDrawRenderAll, back: _rapierDrawHandleBack, overEditor: _rapierDrawOverEditor, history: _rapierDrawHistoryProject,
	undo: _rapierDrawUndo, darkPaper: _rapierDrawDarkPaper, follow: _rapierDrawFollow, editingAsset: _rapierDrawEditingAsset,
	changedSinceOpen: _rapierDrawChangedSinceOpen, selection: _rapierDrawSelection,
	observe: options => _rapierPaintObserveDrawing(options),
	finishPaint: _rapierPaintFinishKept, finishLiquid: _rapierDrawLiquidFinish,
	keys: _rapierDrawPersonalKeys, applied: _rapierDrawPersonalApplied, fits: value => _rapierPaintAdoptFits(value),
	brushes: (keep, brushes) => _rapierPaintAdoptBrushes(keep, brushes), ownBrushes: () => _rapierPaintOwnBrushes(),
});
