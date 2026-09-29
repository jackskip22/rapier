// SPDX-License-Identifier: AGPL-3.0-only
import { _rapierDrawSpatial as spatial, _rapierDrawAdmitRecipe, _rapierDrawAnchorFrame, _rapierDrawBrushesFor, _rapierDrawStylesFor, _rapierDrawValidInk, _rapierDrawArrowRoutePoints, _rapierDrawClamp, _rapierDrawDashActive, _rapierDrawBorderActive, _rapierDrawRectPolygon, _rapierDrawRerouteBoundArrows, _rapierDrawResolveBindAnchor, _rapierDrawRouteBBoxFromPoints, _rapierDrawShapeBBoxIn, _rapierDrawShapePaintedBBoxIn, _rapierDrawShapePaintsInk, _rapierDrawShapeStroke, _rapierDrawTextFrame, _rapierDrawTextLayout } from './core.mjs';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FRAMES = new Set(['rect', 'paint', 'diamond', 'star', 'hexagon', 'pentagon', 'octagon', 'cylinder', 'subroutine', 'asymmetric']);
const AXES = { x: ['minX', 'maxX'], y: ['minY', 'maxY'] };
const clone = value => JSON.parse(JSON.stringify(value));
const signature = recipe => JSON.stringify({ ...recipe, fonts: recipe.fonts?.map(font => font.id) });
// A person's appearance edit replaces just the authored paint they touched. Other authored paint and words stay.
function _rapierDrawReleaseAuthorPaint(shape, change) {
	const own = shape.authorStyle;
	if (!own) return;
	if (change.style != null && change.style !== 'solid' && own.fill) { shape.ink = own.fill; delete own.fill; }
	if (change.ink !== undefined) delete own[(change.style || shape.style) === 'solid' ? 'fill' : 'stroke'];
	if (change.border !== undefined) delete own.stroke;
	if (!Object.keys(own).length) delete shape.authorStyle;
}
function fail(code = 'drawing_operation_invalid') { throw Object.assign(new RangeError(code === 'drawing_locked' ? 'Unlock the selected drawing first' : code === 'drawing_geometry_limit' ? 'Drawing exceeds its coordinate range' : code === 'drawing_work_limit' ? 'Drawing operation exceeds its work limit' : code === 'drawing_border_inactive' ? 'A border needs a solid shape in the Ink look, not an as-drawn stroke' : code === 'drawing_border_invalid' ? 'Choose a border colour from the palette or use #RRGGBB' : 'Invalid drawing operation'), { code }); }
function pointOK(p) { if (!spatial(p[0]) || !spatial(p[1])) fail('drawing_geometry_limit'); return p; }
function geomOK(g) {
	if (!g) return g;
	for (const [key, value] of Object.entries(g)) {
		if (key === 'p') value.forEach(pointOK);
		else if (typeof value === 'number' && (!Number.isFinite(value) || !['rot', 'a0', 'a1'].includes(key) && !spatial(value) || ['r', 'rx', 'ry'].includes(key) && value <= 0)) fail('drawing_geometry_limit');
	}
	return g;
}

function _rapierDrawTranslateGeom(kind, geom, dx, dy) {
	if (geom.p) return geomOK({ ...geom, p: geom.p.map(p => [p[0] + dx, p[1] + dy]) });
	if (kind === 'line' || kind === 'arrow') return geomOK({ ...geom, x1: geom.x1 + dx, y1: geom.y1 + dy, x2: geom.x2 + dx, y2: geom.y2 + dy });
	return geomOK({ ...geom, cx: geom.cx + dx, cy: geom.cy + dy });
}
function _rapierDrawTranslateShape(shape, recipe, dx, dy) {
	const geom = shape.geom && _rapierDrawTranslateGeom(shape.recognized, shape.geom, dx, dy), stroke = _rapierDrawShapeStroke(shape, recipe);
	const points = stroke?.pts.map(p => pointOK([p[0] + dx, p[1] + dy]).concat(p.slice(2))), grow = shape.labelGrow?.slice();
	if (grow) { grow[4] += dx - grow[0] * dx - grow[2] * dy; grow[5] += dy - grow[1] * dx - grow[3] * dy; inverse(grow); }
	if (geom) shape.geom = geom;
	if (points) stroke.pts = points;
	if (grow) shape.labelGrow = grow;
	return shape;
}
function _rapierDrawRotatePt(cx, cy, x, y, angle) {
	const cs = Math.cos(angle), sn = Math.sin(angle), dx = x - cx, dy = y - cy;
	return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs];
}
function _rapierDrawBindAnchorFor(shape, point, recipe) {
	const f = _rapierDrawAnchorFrame(shape, recipe);
	if (!f) return null;
	const x = point[0] - f.x, y = point[1] - f.y, det = f.ux * f.vy - f.uy * f.vx;
	if (Math.abs(det) < 1e-9) return null;
	return { to: shape.id, ax: _rapierDrawClamp((x * f.vy - y * f.vx) / det, 0, 1), ay: _rapierDrawClamp((y * f.ux - x * f.uy) / det, 0, 1) };
}
function anchorsFor(shape, recipe, point) {
	const anchors = [];
	for (const arrow of recipe.shapes) for (const end of ['start', 'end']) if (arrow.bind?.[end]?.to === shape.id) {
		const p = _rapierDrawResolveBindAnchor(arrow.bind[end], recipe);
		if (p) anchors.push([arrow, end, pointOK(point(p))]);
	}
	return anchors;
}
function replaceAnchors(shape, recipe, anchors) {
	for (const [arrow, end, point] of anchors) {
		const next = _rapierDrawBindAnchorFor(shape, point, recipe);
		if (next) arrow.bind[end] = next; else delete arrow.bind[end];
	}
}
function multiply(a, b) {
	return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function inverse(m) {
	const d = m[0] * m[3] - m[1] * m[2];
	if (!d || !Number.isFinite(d)) fail('drawing_geometry_limit');
	const out = [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
	if (!m.concat(out).every(n => Number.isFinite(n) && Math.abs(n) <= 1e12)) fail('drawing_geometry_limit');
	return out;
}
function transformShape(shape, recipe, matrix, preserveGrow = true) {
	const im = inverse(matrix), [a, b, c, d, e, f] = matrix, det = a * d - b * c;
	const grow = preserveGrow && shape.labelGrow && multiply(multiply(matrix, shape.labelGrow), im);
	if (grow) inverse(grow);
	const point = p => [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f];
	const anchors = anchorsFor(shape, recipe, point), stroke = _rapierDrawShapeStroke(shape, recipe);
	const points = stroke?.pts.map(p => pointOK(point(p)).concat(p.slice(2))), g = shape.geom, kind = shape.recognized;
	let geom = g, recognized = kind, bend, curveT, textSize;
	if (g) {
		if (g.p || FRAMES.has(kind)) {
			const frame = g.p || _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
			geom = { p: frame.map(point) };
			if (!g.p && det > 0) {
				const cs = Math.cos(g.rot || 0), sn = Math.sin(g.rot || 0), ux = a * cs + c * sn, uy = b * cs + d * sn, vx = c * cs - a * sn, vy = d * cs - b * sn, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
				if (Math.abs(ux * vx + uy * vy) <= lu * lv * 1e-10) { const center = point([g.cx, g.cy]); geom = { cx: center[0], cy: center[1], w: g.w * lu, h: g.h * lv, rot: Math.atan2(uy, ux) }; }
			}
			if (g.inner != null) geom.inner = g.inner;
		} else if (kind === 'line' || kind === 'arrow') {
			const old = _rapierDrawArrowRoutePoints(shape, recipe), a = point([g.x1, g.y1]), b = point([g.x2, g.y2]);
			geom = { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
			if (shape.route === 'curved' && old.length === 3) {
				const c = point(old[1]), dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
				bend = length ? ((c[1] - a[1]) * dx - (c[0] - a[0]) * dy) / (2 * length) : 0;
				curveT = length ? ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (length * length) : .5;
				if (!spatial(bend) || !spatial(curveT)) fail('drawing_geometry_limit');
			}
		} else {
			const center = point([g.cx, g.cy]);
			if (kind === 'text') {
				const cs = Math.cos(g.rot || 0), sn = Math.sin(g.rot || 0), ux = a * cs + c * sn, uy = b * cs + d * sn;
				let rot = Math.atan2(uy, ux);
				if (det < 0) rot = ((rot + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
				geom = { ...g, cx: center[0], cy: center[1], rot };
				if (g.w) geom.w = g.w * Math.hypot(ux, uy);
				const xx = a * a + c * c, yy = b * b + d * d, xy = a * b + c * d, scale = Math.abs(det) / Math.sqrt((xx + yy + Math.hypot(xx - yy, 2 * xy)) / 2);
				if (Math.abs(scale - 1) > 1e-12) textSize = _rapierDrawClamp((shape.textSize || 24) * scale, 6, 512);
			} else if (kind === 'arc') {
				const sx = Math.hypot(a, b), sy = Math.hypot(c, d);
				if (Math.abs(sx - sy) > Math.max(sx, sy) * 1e-10 || Math.abs(a * c + b * d) > sx * sy * 1e-10) fail();
				const cs = Math.cos(g.a0), sn = Math.sin(g.a0), a0 = Math.atan2(b * cs + d * sn, a * cs + c * sn);
				geom = { cx: center[0], cy: center[1], r: g.r * sx, a0, a1: a0 + (g.a1 - g.a0) * Math.sign(det) };
			} else {
				const rx = g.r ?? g.rx, ry = g.r ?? g.ry, cs = Math.cos(g.rot || 0), sn = Math.sin(g.rot || 0);
				const ux = rx * (a * cs + c * sn), uy = rx * (b * cs + d * sn), vx = ry * (c * cs - a * sn), vy = ry * (d * cs - b * sn), lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
				let major = lu, minor = lv, rot = Math.atan2(uy, ux);
				if (Math.abs(ux * vx + uy * vy) > lu * lv * 1e-10) {
					const xx = ux * ux + vx * vx, yy = uy * uy + vy * vy, xy = ux * uy + vx * vy;
					major = Math.sqrt((xx + yy + Math.hypot(xx - yy, 2 * xy)) / 2); minor = Math.abs(ux * vy - uy * vx) / major; rot = Math.atan2(2 * xy, xx - yy) / 2;
				} else if (det < 0) rot = ((rot + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
				if (kind === 'circle' && Math.abs(major - minor) <= major * 1e-12) geom = { cx: center[0], cy: center[1], r: major, rot };
				else { recognized = 'ellipse'; geom = { cx: center[0], cy: center[1], rx: major, ry: minor, rot }; }
			}
		}
	}
	geomOK(geom);
	if (shape.recognized !== recognized && shape.brush && !_rapierDrawBrushesFor(recognized).includes(shape.brush)) shape.brush = 'ink';
	shape.geom = geom; shape.recognized = recognized;
	if (points) stroke.pts = points;
	if (bend != null) { shape.bend = bend; shape.curveT = curveT; }
	if (textSize != null) shape.textSize = textSize;
	if (grow) shape.labelGrow = grow;
	replaceAnchors(shape, recipe, anchors);
	return shape;
}
function _rapierDrawResizeShape(shape, recipe, box, nextBox, manual = true) {
	const width = box.maxX - box.minX, height = box.maxY - box.minY;
	const sx = width ? (nextBox.maxX - nextBox.minX) / width : 1, sy = height ? (nextBox.maxY - nextBox.minY) / height : 1;
	const resized = manual && (Math.abs(Math.abs(sx) - 1) > 1e-10 || Math.abs(Math.abs(sy) - 1) > 1e-10);
	transformShape(shape, recipe, [sx, 0, 0, sy, nextBox.minX - box.minX * sx, nextBox.minY - box.minY * sy], !resized);
	if (resized) delete shape.labelGrow;
	return shape;
}
function rotationMatrix(cx, cy, angle) {
	const cs = Math.cos(angle), sn = Math.sin(angle);
	return [cs, sn, -sn, cs, cx - cs * cx + sn * cy, cy - sn * cx - cs * cy];
}
function _rapierDrawRotateShape(shape, recipe, cx, cy, angle) {
	return transformShape(shape, recipe, rotationMatrix(cx, cy, angle));
}
// Painted, not geometry-only: an arrow head, an outside label or a brush's own reach (the tube
// brush's tube, say) can sit outside a shape's bare geometry box, and wrap=box must still enclose it.
function contentBox(recipe) { return union(recipe.shapes.map(shape => _rapierDrawShapePaintedBBoxIn(shape, recipe))); }
// Rotates every shape in the recipe by `angle` radians about the drawing's own current content
// centre, baking the turn into geometry the same way a single shape's own rotate does (reusing
// rotationMatrix via _rapierDrawRotateShape) rather than adding a display-only transform. `angle`
// accumulates in whole degrees on the recipe (admission keeps it, see core.mjs) purely as a record:
// Edit reopens at the right angle and `contentTiltBox` recovers the pre-rotation content bounds
// from it, without depending on every shape kind (ink, lines, arrows...) carrying its own `rot`.
function rotateDrawing(recipe, angle) {
	const box = contentBox(recipe);
	if (!angle || !box) return recipe;
	const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
	const next = { ...recipe, strokes: recipe.strokes.map(stroke => stroke ? { pts: stroke.pts.map(p => p.slice()) } : stroke), shapes: recipe.shapes.map(clone) };
	for (const shape of next.shapes) _rapierDrawRotateShape(shape, next, cx, cy, angle);
	_rapierDrawRerouteBoundArrows(next);
	next.angle = (((next.angle || 0) + angle * 180 / Math.PI) % 360 + 360) % 360;
	return _rapierDrawAdmitRecipe(next) || next;
}
// The tight rectangle around every shape, tilted to the drawing's own recorded `angle`: unrotate
// the current geometry by that angle about the content's own centre to measure it axis-aligned in
// the drawing's local frame (reusing the same rotate-and-measure technique a tilted selection's own
// resize already relies on), then hand back that rectangle's four page-space corners. Any fixed
// pivot works for this round trip as long as the same one unrotates and re-rotates, so there is no
// need to remember the centre `rotateDrawing` actually used. Feeds the `wrap=box` obstacle.
function contentTiltBox(recipe) {
	const box = contentBox(recipe);
	if (!box) return null;
	const theta = ((recipe.angle || 0) % 360) * Math.PI / 180;
	const pivot = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
	const local = theta ? _rapierDrawLocalSelectionBox(recipe, recipe.shapes.map(shape => shape.id), theta, pivot) : box;
	if (!local) return null;
	const corners = [[local.minX, local.minY], [local.maxX, local.minY], [local.maxX, local.maxY], [local.minX, local.maxY]];
	if (!theta) return corners;
	const cs = Math.cos(theta), sn = Math.sin(theta), [px, py] = pivot;
	return corners.map(([x, y]) => [px + (x - px) * cs - (y - py) * sn, py + (x - px) * sn + (y - py) * cs]);
}
// A rotated selection resizes in its OWN tilted axes, not the page's: unrotate about `pivot` by
// `theta`, apply the ordinary page-axis box->nextBox scale, then rotate back. That keeps a tilted
// rectangle a rectangle instead of shearing it into explicit corner points (transformShape's frame
// branch only recovers a clean cx/cy/w/h/rot shape when its own axes stay orthogonal). `theta: 0`
// degenerates to the identity rotation and is exactly `_rapierDrawResizeShape`.
function _rapierDrawResizeShapeLocal(shape, recipe, theta, pivot, box, nextBox, manual = true) {
	if (!theta) return _rapierDrawResizeShape(shape, recipe, box, nextBox, manual);
	const width = box.maxX - box.minX, height = box.maxY - box.minY;
	const sx = width ? (nextBox.maxX - nextBox.minX) / width : 1, sy = height ? (nextBox.maxY - nextBox.minY) / height : 1;
	const resized = manual && (Math.abs(Math.abs(sx) - 1) > 1e-10 || Math.abs(Math.abs(sy) - 1) > 1e-10);
	const scaleMatrix = [sx, 0, 0, sy, nextBox.minX - box.minX * sx, nextBox.minY - box.minY * sy];
	const matrix = multiply(rotationMatrix(pivot[0], pivot[1], theta), multiply(scaleMatrix, rotationMatrix(pivot[0], pivot[1], -theta)));
	transformShape(shape, recipe, matrix, !resized);
	if (resized) delete shape.labelGrow;
	return shape;
}
// A line/arrow shape's local-frame bounds are measured from the route actually emitted by the SOURCE
// recipe (respecting its real elbow bend, automatic obstacle routing, and curve), rotating only the
// resulting points into the local frame; recomputing the route from rotated endpoints instead would
// let an elbow or automatic connector route again and reflect a path that was never painted (a
// straight/elbow/auto route is a polyline, so rotating its vertices is exact; a curved route's
// quadratic control points still transform exactly under rotation, per _rapierDrawRouteBBoxFromPoints).
// Every other shape kind has no route to reroute, so it is still measured via a throwaway clone+rotate.
function _rapierDrawLocalShapeBBox(shape, recipe, theta, pivot) {
	if (shape.geom && !_rapierDrawShapePaintsInk(shape, recipe) && (shape.recognized === 'line' || shape.recognized === 'arrow')) {
		const pts = _rapierDrawArrowRoutePoints(shape, recipe);
		if (pts) return _rapierDrawRouteBBoxFromPoints(pts.map(p => _rapierDrawRotatePt(pivot[0], pivot[1], p[0], p[1], -theta)), shape.route === 'curved');
	}
	const scene = { ...recipe, shapes: [], strokes: recipe.strokes.map(stroke => stroke ? { pts: stroke.pts.map(p => p.slice()) } : stroke) };
	const copy = clone(shape); _rapierDrawRotateShape(copy, scene, pivot[0], pivot[1], -theta); return _rapierDrawShapeBBoxIn(copy, scene);
}
// The local (unrotated-about-`pivot`) bounding box of `ids`, as if every selected shape had been
// rotated by `-theta` about `pivot` first.
function _rapierDrawLocalSelectionBox(recipe, ids, theta, pivot) {
	const wanted = new Set(ids), shapes = recipe.shapes.filter(shape => wanted.has(shape.id));
	if (!theta) return union(shapes.map(shape => _rapierDrawShapeBBoxIn(shape, recipe)));
	return union(shapes.map(shape => _rapierDrawLocalShapeBBox(shape, recipe, theta, pivot)));
}
// A member's own tilt: `geom.rot` when the shape has one, or else -- a reflected or mirrored
// rect-family shape keeps no `rot` at all, only its four corners (`geom.p`) -- the corner frame's own
// edge direction, the same frame `_rapierDrawAnchorFrame` already resolves for anchors. A shape with
// neither (a line/arrow/ink stroke) has no member angle at all.
// The corner frame's edge direction alone cannot tell a genuine rotation from a Flip (Flip is a
// mirror, never a 180 turn -- R32 in rotate-rules.md): mirroring an on-axis rect-family shape
// reverses its corner winding, which reads back as a false +180 with nothing actually rotated.
// A rect-family box is visually identical at theta and theta+180 either way (the box itself has no
// handedness), so folding the raw edge angle into [0, PI) collapses that false +180 back onto the
// same representative angle a plain, unreflected member would report -- while leaving a genuinely
// tilted member's angle (already inside that range) untouched, so draw-frame-reflected/
// draw-gravity-reflected's own reflected-and-tilted cases still read their real, non-zero tilt.
function memberAngle(shape, recipe) {
	if (shape.geom && typeof shape.geom.rot === 'number') return shape.geom.rot;
	const f = _rapierDrawAnchorFrame(shape, recipe);
	return f ? Math.atan2(f.uy, f.ux) : null;
}
// The box tilts to match a single selected shape's own rotation, or a multi-selection's shared
// rotation (every non-circular member's own angle must agree); a mixed-angle selection falls back to
// the plain axis-aligned box. A circle's angle is never visually meaningful (rotating a circle
// changes nothing you can see), so it is excluded from the agreement check entirely rather than
// standing in as a literal zero that a genuinely tilted member would then disagree with.
function selectionFrame(recipe, ids) {
	const wanted = new Set(ids), shapes = recipe.shapes.filter(shape => wanted.has(shape.id));
	if (!shapes.length) return null;
	const pageBox = union(shapes.map(shape => _rapierDrawShapeBBoxIn(shape, recipe)));
	// Agreement is about resize axes, and a box has the same axes at θ and θ + π: a member stored as
	// a full rotation (geom.rot) and one stored as a reflected corner frame (geom.p, read back through
	// its own edge direction) are compared modulo π, in the same fold, so equivalent geometry gets the
	// same frame whichever representation it happens to carry. The frame's directional angle then
	// comes from one member's actual angle, not from the folded axis, so handles keep that member's
	// orientation.
	const norm = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
	const axis = a => ((a % Math.PI) + Math.PI) % Math.PI;
	const tiltable = shapes.filter(shape => shape.recognized !== 'circle');
	const raw = tiltable.map(shape => memberAngle(shape, recipe));
	const eligible = raw.every(a => a != null);
	const axes = eligible ? raw.map(axis) : [];
	const axisDiff = (a, b) => { const d = Math.abs(a - b); return Math.min(d, Math.PI - d); };
	const shared = eligible && axes.every(a => axisDiff(a, axes[0]) < 1e-3);
	const theta = shared && axes.length && axisDiff(axes[0], 0) > 1e-3 ? norm(raw[0]) : 0;
	if (!theta) return { theta: 0, pivot: null, box: pageBox };
	const pivot = [(pageBox.minX + pageBox.maxX) / 2, (pageBox.minY + pageBox.maxY) / 2];
	return { theta, pivot, box: _rapierDrawLocalSelectionBox(recipe, ids, theta, pivot) };
}
// Local-frame counterpart of `anchorResize`: nudges the whole selection (translate only, so it is
// always shear-safe) so the resize's fixed anchor corner/centre lands exactly where a text-refit
// mid-loop may have moved it, measured in the tilted frame rather than the page's.
function anchorResizeLocal(recipe, ids, theta, pivot, next, anchor) {
	if (!theta) return anchorResize(recipe, ids, next, anchor);
	if (![anchor.x, anchor.y].every(n => n === 0 || n === .5 || n === 1)) fail();
	_rapierDrawRerouteBoundArrows(recipe);
	const box = _rapierDrawLocalSelectionBox(recipe, ids, theta, pivot);
	if (!box) return;
	const x = next.minX + (next.maxX - next.minX) * anchor.x, y = next.minY + (next.maxY - next.minY) * anchor.y;
	const dx0 = x - box.minX - (box.maxX - box.minX) * (next.maxX >= next.minX ? anchor.x : 1 - anchor.x);
	const dy0 = y - box.minY - (box.maxY - box.minY) * (next.maxY >= next.minY ? anchor.y : 1 - anchor.y);
	if (Math.abs(dx0) <= 1e-8 && Math.abs(dy0) <= 1e-8) return;
	const cs = Math.cos(theta), sn = Math.sin(theta), dx = dx0 * cs - dy0 * sn, dy = dx0 * sn + dy0 * cs;
	const wanted = new Set(ids);
	for (const shape of recipe.shapes) if (wanted.has(shape.id)) _rapierDrawTranslateShape(shape, recipe, dx, dy);
}
function identity(m) { return m.every((n, i) => Math.abs(n - (i === 0 || i === 3 ? 1 : 0)) <= (i < 4 ? 1e-10 : 1e-8)); }
function _rapierDrawFitText(shape, recipe) {
	if (!shape.labelGrow && (!shape.label || !shape.labelIn)) return shape;
	if (!_rapierDrawTextFrame(shape, recipe)) return shape;
	// labelGrow maps the manual frame to the fitted frame; undo it before refitting so shorter text can shrink back.
	const old = shape.labelGrow || [1, 0, 0, 1, 0, 0], undo = inverse(old), draft = clone(shape), scene = { ...recipe, shapes: [], strokes: [] };
	draft.id = ''; draft.stroke = null; draft.asDrawn = false; delete draft.labelGrow;
	if (!identity(old)) transformShape(draft, scene, undo);
	let grow = [1, 0, 0, 1, 0, 0], settled = !shape.label || !shape.labelIn;
	for (let i = 0; !settled && i < 8; i++) {
		const layout = _rapierDrawTextLayout(draft, scene), frame = layout.shapeFrame;
		if (!frame || !(frame.w * layout.fitScaleX > 0) || !(frame.h * layout.fitScaleY > 0)) fail('drawing_geometry_limit');
		let sx = Math.max(1, layout.requiredWidth / (frame.w * layout.fitScaleX)), sy = Math.max(1, layout.requiredHeight / (frame.h * layout.fitScaleY));
		if (draft.recognized === 'circle') sx = sy = Math.max(sx, sy);
		if (Math.max(sx, sy) <= 1 + 1e-8) { settled = true; break; }
		const { ux, uy, vx, vy } = frame, x = frame.cx - vx * frame.h / 2, y = frame.cy - vy * frame.h / 2;
		const a = sx * ux * ux + sy * vx * vx, b = sx * ux * uy + sy * vx * vy, c = sx * uy * ux + sy * vy * vx, d = sx * uy * uy + sy * vy * vy;
		const matrix = [a, b, c, d, x - a * x - c * y, y - b * x - d * y];
		grow = multiply(matrix, grow); inverse(grow);
		transformShape(draft, scene, matrix);
	}
	if (!settled) {
		const layout = _rapierDrawTextLayout(draft, scene), frame = layout.shapeFrame;
		settled = !!frame && layout.requiredWidth <= frame.w * layout.fitScaleX * (1 + 1e-8) && layout.requiredHeight <= frame.h * layout.fitScaleY * (1 + 1e-8);
	}
	if (!settled) fail('drawing_geometry_limit');
	const delta = multiply(grow, undo);
	if (!identity(delta)) transformShape(shape, recipe, delta, false);
	if (identity(grow)) delete shape.labelGrow; else if (!identity(delta) || !shape.labelGrow) shape.labelGrow = grow;
	return shape;
}
function _rapierDrawReleaseBindings(shape, ids) {
	if (!shape.bind) return;
	for (const end of ['start', 'end']) if (shape.bind[end] && !ids.includes(shape.bind[end].to)) delete shape.bind[end];
	if (!shape.bind.start && !shape.bind.end) delete shape.bind;
}
function _rapierDrawPruneUnusedStrokes(recipe) {
	const remap = new Map(), strokes = [];
	for (const shape of recipe.shapes) if (shape.stroke != null && recipe.strokes[shape.stroke] && !remap.has(shape.stroke)) { remap.set(shape.stroke, strokes.length); strokes.push(recipe.strokes[shape.stroke]); }
	return { ...recipe, strokes, shapes: recipe.shapes.map(shape => ({ ...shape, stroke: remap.has(shape.stroke) ? remap.get(shape.stroke) : null })) };
}

function selectionIds(recipe, ids, includeLocked = false) {
	const wanted = new Set(ids), groups = new Set(), locked = new Set();
	for (const shape of recipe.shapes) {
		if (shape.group && wanted.has(shape.id)) groups.add(shape.group);
		if (shape.group && shape.locked) locked.add(shape.group);
	}
	return recipe.shapes.filter(shape => (wanted.has(shape.id) || shape.group && groups.has(shape.group)) && (includeLocked || !shape.locked && !locked.has(shape.group))).map(shape => shape.id);
}
function union(boxes) {
	if (!boxes.length) return null;
	return { minX: Math.min(...boxes.map(b => b.minX)), maxX: Math.max(...boxes.map(b => b.maxX)), minY: Math.min(...boxes.map(b => b.minY)), maxY: Math.max(...boxes.map(b => b.maxY)) };
}
function unitsFor(recipe, ids, bounds = true) {
	const wanted = new Set(ids), groups = new Map(), units = [];
	for (const shape of recipe.shapes) if (wanted.has(shape.id)) {
		let unit = shape.group && groups.get(shape.group);
		if (!unit) { unit = { shapes: [] }; units.push(unit); if (shape.group) groups.set(shape.group, unit); }
		unit.shapes.push(shape);
	}
	if (bounds) for (const unit of units) unit.box = union(unit.shapes.map(shape => _rapierDrawShapeBBoxIn(shape, recipe)));
	return units;
}
function anchorResize(recipe, ids, next, anchor) {
	if (![anchor.x, anchor.y].every(n => n === 0 || n === .5 || n === 1)) fail();
	_rapierDrawRerouteBoundArrows(recipe);
	const wanted = new Set(ids), shapes = recipe.shapes.filter(shape => wanted.has(shape.id)), box = union(shapes.map(shape => _rapierDrawShapeBBoxIn(shape, recipe)));
	if (!box) return;
	const x = next.minX + (next.maxX - next.minX) * anchor.x, y = next.minY + (next.maxY - next.minY) * anchor.y;
	const dx = x - box.minX - (box.maxX - box.minX) * (next.maxX >= next.minX ? anchor.x : 1 - anchor.x), dy = y - box.minY - (box.maxY - box.minY) * (next.maxY >= next.minY ? anchor.y : 1 - anchor.y);
	if (Math.abs(dx) <= 1e-8 && Math.abs(dy) <= 1e-8) return;
	for (const shape of shapes) _rapierDrawTranslateShape(shape, recipe, dx, dy);
}
function nextId(prefix, used) { let i = 1; while (used.has(prefix + i)) i++; const id = prefix + i; used.add(id); return id; }
function shiftUnits(recipe, units, delta, ids) {
	for (const unit of units) {
		const [dx, dy] = delta(unit);
		if (!dx && !dy) continue;
		for (const shape of unit.shapes) { _rapierDrawTranslateShape(shape, recipe, dx, dy); _rapierDrawReleaseBindings(shape, ids); }
	}
}
function moveLayer(recipe, ids, front) {
	const wanted = new Set(ids), chosen = recipe.shapes.filter(shape => wanted.has(shape.id)), rest = recipe.shapes.filter(shape => !wanted.has(shape.id));
	recipe.shapes = front ? rest.concat(chosen) : chosen.concat(rest);
}
function stepLayer(recipe, ids, forward) {
	const wanted = new Set(ids), units = unitsFor(recipe, ids, false);
	if (forward) units.reverse();
	for (const unit of units) {
		const members = new Set(unit.shapes.map(shape => shape.id)), positions = recipe.shapes.map((shape, i) => members.has(shape.id) ? i : -1).filter(i => i >= 0);
		let at = forward ? Math.max(...positions) + 1 : Math.min(...positions) - 1, target;
		for (; at >= 0 && at < recipe.shapes.length; at += forward ? 1 : -1) if (!wanted.has(recipe.shapes[at].id)) { target = recipe.shapes[at]; break; }
		if (!target) continue;
		const chosen = recipe.shapes.filter(shape => members.has(shape.id)), rest = recipe.shapes.filter(shape => !members.has(shape.id));
		const targets = rest.map((shape, i) => shape.id === target.id || target.group && shape.group === target.group ? i : -1).filter(i => i >= 0);
		rest.splice(forward ? Math.max(...targets) + 1 : Math.min(...targets), 0, ...chosen);
		recipe.shapes = rest;
	}
}
function distribute(recipe, units, axis, ids) {
	const [lo, hi] = AXES[axis];
	let active = units.slice();
	while (active.length >= 3) {
		const first = active.reduce((a, b) => a.box[lo] <= b.box[lo] ? a : b), last = active.reduce((a, b) => a.box[hi] >= b.box[hi] ? a : b);
		if (first === last) { active = active.filter(unit => unit !== first); continue; }
		const middle = active.filter(unit => unit !== first && unit !== last).sort((a, b) => a.box[lo] - b.box[lo]);
		const gap = (last.box[lo] - first.box[hi] - middle.reduce((sum, unit) => sum + unit.box[hi] - unit.box[lo], 0)) / (middle.length + 1);
		let position = first.box[hi] + gap;
		shiftUnits(recipe, middle, unit => { const offset = position - unit.box[lo]; position += unit.box[hi] - unit.box[lo] + gap; return axis === 'x' ? [offset, 0] : [0, offset]; }, ids);
		break;
	}
}
// Admission creates a private candidate; validate the whole batch before the caller adopts any geometry.
function applyOperations(input, operations) {
	if (!Array.isArray(operations) || operations.length > 64) fail();
	let recipe = _rapierDrawAdmitRecipe(input);
	if (!recipe) fail('drawing_geometry_limit');
	const before = signature(recipe);
	for (const shape of recipe.shapes) _rapierDrawFitText(shape, recipe);
	_rapierDrawRerouteBoundArrows(recipe);
	let ids = [], work = 0;
	for (const operation of operations) {
		if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail();
		const type = operation.type, all = new Set(recipe.shapes.map(shape => shape.id));
		if (type === 'unlockAll') { for (const shape of recipe.shapes) delete shape.locked; ids = []; continue; }
		if (!Array.isArray(operation.ids) || operation.ids.length > 2048 || !operation.ids.every(id => typeof id === 'string' && all.has(id))) fail();
		ids = selectionIds(recipe, operation.ids, true);
		const selected = new Set(ids), shapes = recipe.shapes.filter(shape => selected.has(shape.id));
		if (!['lock', 'unlock'].includes(type) && shapes.some(shape => shape.locked)) fail('drawing_locked');
		work += recipe.shapes.length + shapes.reduce((sum, shape) => sum + (_rapierDrawShapeStroke(shape, recipe)?.pts.length || 0), 0);
		if (work > 4194304) fail('drawing_work_limit');
		if (type === 'group') {
			if (operation.group != null && (typeof operation.group !== 'string' || !ID.test(operation.group))) fail();
			if (shapes.length < 2 || shapes[0].group && shapes.every(shape => shape.group === shapes[0].group) && (!operation.group || operation.group === shapes[0].group)) continue;
			const used = new Set(recipe.shapes.flatMap(shape => [shape.id, shape.group].filter(Boolean)));
			if (operation.group && used.has(operation.group)) fail();
			const group = operation.group || nextId('g', used), last = recipe.shapes.reduce((n, shape, i) => selected.has(shape.id) ? i : n, -1);
			const position = recipe.shapes.slice(0, last + 1).filter(shape => !selected.has(shape.id)).length;
			for (const shape of shapes) shape.group = group;
			recipe.shapes = recipe.shapes.filter(shape => !selected.has(shape.id)); recipe.shapes.splice(position, 0, ...shapes);
		} else if (type === 'ungroup') for (const shape of shapes) delete shape.group;
		else if (type === 'lock') for (const shape of shapes) shape.locked = true;
		else if (type === 'unlock') for (const shape of shapes) delete shape.locked;
		else if (type === 'delete') { recipe.shapes = recipe.shapes.filter(shape => !selected.has(shape.id)); recipe = _rapierDrawPruneUnusedStrokes(recipe); ids = []; }
		else if (type === 'duplicate') {
			const dx = operation.dx ?? 24, dy = operation.dy ?? 24;
			if (!spatial(dx) || !spatial(dy) || recipe.shapes.length + shapes.length > 2048 || recipe.strokes.reduce((sum, stroke) => sum + stroke.pts.length, 0) + shapes.reduce((sum, shape) => sum + (_rapierDrawShapeStroke(shape, recipe)?.pts.length || 0), 0) > 262144) fail('drawing_geometry_limit');
			const assigned = operation.newIds;
			for (const shape of recipe.shapes) if (shape.group) all.add(shape.group);
			if (assigned != null && (!Array.isArray(assigned) || assigned.length !== shapes.length || !assigned.every(id => typeof id === 'string' && ID.test(id) && !all.has(id)) || new Set(assigned).size !== assigned.length)) fail();
			const mapped = new Map(shapes.map((shape, i) => [shape.id, assigned?.[i] || nextId('s', all)])), groups = new Map(), used = new Set(recipe.shapes.flatMap(shape => [shape.id, shape.group].filter(Boolean)).concat([...mapped.values()]));
			const copies = shapes.map(shape => {
				const copy = clone(shape), stroke = _rapierDrawShapeStroke(shape, recipe); copy.id = mapped.get(shape.id);
				if (stroke) { copy.stroke = recipe.strokes.length; recipe.strokes.push({ pts: stroke.pts.map(p => p.slice()) }); }
				if (shape.group) { if (!groups.has(shape.group)) groups.set(shape.group, nextId('g', used)); copy.group = groups.get(shape.group); }
				if (copy.bind) for (const end of ['start', 'end']) if (copy.bind[end]) { const to = mapped.get(copy.bind[end].to); if (to) copy.bind[end].to = to; else delete copy.bind[end]; }
				_rapierDrawTranslateShape(copy, recipe, dx, dy);
				return copy;
			});
			recipe.shapes.push(...copies); ids = copies.map(shape => shape.id);
		} else if (type === 'clean' || type === 'unclean') {
			// Geometry only (the transformation grammar, R72), and nothing else: a clean figure is the
			// recognized shape drawn precisely; unclean hands the person's own stroke back. What the
			// shape wears (brush, style, ink, dash) is orthogonal and untouched either way -- brush
			// already renders correctly for both states on its own (_rapierDrawBrushPenPath resamples
			// the shape's own precise polyline for a clean figure and follows the raw stroke for an
			// as-drawn one; every Physico material reads shape.geom, never asDrawn, at all), so there
			// is no rendering reason for this op to reach into appearance -- a documented contradiction
			// with this same "geometry only" law until R75 lane F, Astra-R74 L01.
			for (const shape of shapes) {
				if (type === 'unclean' && _rapierDrawShapeStroke(shape, recipe) === null) fail('drawing_not_sketched');
				if (type === 'unclean' && shape.border) fail('drawing_border_inactive');
				shape.asDrawn = type === 'unclean';
			}
		} else if (type === 'set_look') {
			// Appearance only: brush (the look), style (the fill), ink, border, dash; each validated against
			// what the shape's kind may wear, and a field left out is left alone.
			const { brush, style, ink, border, dash } = operation;
			for (const shape of shapes) {
				_rapierDrawReleaseAuthorPaint(shape, operation);
				if (brush !== undefined) {
					const want = brush === 'pen' ? 'brush' : brush;
					if (typeof want !== 'string' || !_rapierDrawBrushesFor(shape.recognized).includes(want)) fail('drawing_look_invalid');
					shape.brush = want;
				}
				if (style !== undefined) {
					if (typeof style !== 'string' || !_rapierDrawStylesFor(shape.recognized).includes(style)) fail('drawing_look_invalid');
					shape.style = style; delete shape.headStart; delete shape.headEnd; delete shape.trimStart; delete shape.trimEnd; delete shape.cutWidth;
					if (style !== 'solid') delete shape.border;
				}
				if (ink !== undefined) {
					if (ink === null) delete shape.ink;
					else { const valid = _rapierDrawValidInk(ink); if (!valid) fail('drawing_look_invalid'); shape.ink = valid; }
				}
				if (border !== undefined) {
					if (border === null) delete shape.border;
					else { const valid = _rapierDrawValidInk(border); if (!valid) fail('drawing_border_invalid'); shape.border = valid; }
				}
				if ((shape.border || shape.style === 'solid' && shape.authorStyle?.stroke) && !_rapierDrawBorderActive(shape)) fail('drawing_border_inactive');
				if (dash !== undefined) {
					if (dash === null || dash === '') delete shape.dash;
					else if (dash === 'dashed' || dash === 'dotted') shape.dash = dash;
					else fail('drawing_look_invalid');
				}
				// L01: a look combination the renderer would ignore is refused, not stored inert --
				// checked whenever this call touched the field that decides dash's own activity
				// (brush) or dash itself, against the one shared capability table
				// (_rapierDrawDashActive) the human Style sheet's dash row reads too.
				if ((brush !== undefined || dash !== undefined) && shape.dash && !_rapierDrawDashActive(shape)) fail('drawing_look_invalid');
			}
		} else if (type === 'front' || type === 'back') moveLayer(recipe, ids, type === 'front');
		else if (type === 'forward' || type === 'backward') stepLayer(recipe, ids, type === 'forward');
		else if (type === 'move') {
			if (!spatial(operation.dx) || !spatial(operation.dy)) fail('drawing_geometry_limit');
			if (!operation.dx && !operation.dy) continue;
			for (const shape of shapes) { _rapierDrawTranslateShape(shape, recipe, operation.dx, operation.dy); _rapierDrawReleaseBindings(shape, ids); }
		} else if (type === 'align') {
			const rule = { left: ['x', 0], center: ['x', .5], right: ['x', 1], top: ['y', 0], middle: ['y', .5], bottom: ['y', 1] }[operation.alignment];
			if (!rule) fail();
			const units = unitsFor(recipe, ids), box = union(units.map(unit => unit.box));
			if (units.length < 2) continue;
			const [axis, t] = rule, [lo, hi] = AXES[axis], target = box[lo] + (box[hi] - box[lo]) * t;
			shiftUnits(recipe, units, unit => { const delta = target - unit.box[lo] - (unit.box[hi] - unit.box[lo]) * t; return axis === 'x' ? [delta, 0] : [0, delta]; }, ids);
		} else if (type === 'distribute' || type === 'flip') {
			if (!Object.hasOwn(AXES, operation.axis)) fail();
			const units = unitsFor(recipe, ids);
			if (type === 'distribute') distribute(recipe, units, operation.axis, ids);
			else if (shapes.length) {
				const box = union(units.map(unit => unit.box)), next = { ...box }, [lo, hi] = AXES[operation.axis];
				[next[lo], next[hi]] = [next[hi], next[lo]];
				for (const shape of shapes) { _rapierDrawResizeShape(shape, recipe, box, next, false); _rapierDrawReleaseBindings(shape, ids); }
			}
		} else fail();
		_rapierDrawRerouteBoundArrows(recipe);
	}
	const admitted = _rapierDrawAdmitRecipe(recipe);
	if (!admitted) fail('drawing_geometry_limit');
	const changed = before !== signature(admitted);
	return { recipe: admitted, ids, changed };
}
function editDrawing(recipe, ids, action) { return applyOperations(recipe, [{ ...action, ids }]); }
// Point/edge/centre snap plus live equal-gap and gap-duplication, one competition per axis so whichever
// correction is smallest wins (touch-rules.md T13/T14). `tolerance` is pre-divided by view scale at
// the call site so it reads as a constant screen distance regardless of zoom, the same convention
// T3's hit-test margin already uses.
function snapMove(recipe, ids, dx, dy, tolerance) {
	if (![dx, dy, tolerance].every(Number.isFinite) || tolerance < 0) fail();
	const expanded = selectionIds(recipe, ids), selected = new Set(expanded), moving = unitsFor(recipe, expanded), box = union(moving.map(unit => unit.box));
	if (!box) return { dx, dy, guides: [] };
	const targets = recipe.shapes.filter(shape => !selected.has(shape.id) && !Object.values(shape.bind || {}).some(anchor => selected.has(anchor.to))).map(shape => shape.id);
	const units = unitsFor(recipe, targets), chosen = [];
	for (const axis of ['x', 'y']) {
		const [lo, hi] = AXES[axis], [clo, chi] = AXES[axis === 'x' ? 'y' : 'x'], offset = axis === 'x' ? dx : dy;
		let best;
		for (const unit of units) for (const t of [.5, 0, 1]) for (const u of [.5, 0, 1]) {
			const at = unit.box[lo] + (unit.box[hi] - unit.box[lo]) * t, delta = at - (box[lo] + (box[hi] - box[lo]) * u + offset);
			if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis, kind: 'point', at, delta, box: unit.box };
		}
		// Equal-gap: a shape dragged into the space between two stationary neighbours settles once its
		// own two flanking gaps match -- the live counterpart of the Space across/down menu action
		// (`distribute` above). Scoped to targets that overlap the moving box on the cross axis (a
		// plausible "row"/"column") and capped so a crowded drawing can't turn this into O(n^2) work
		// on every pointer-move.
		const row = units.filter(unit => unit.box[clo] < box[chi] && box[clo] < unit.box[chi]);
		if (row.length > 40) row.length = 40;
		for (const L of row) for (const R of row) {
			if (L === R) continue;
			const span = R.box[lo] - L.box[hi];
			if (span <= 0) continue;
			const size = box[hi] - box[lo], boxLoNow = box[lo] + offset, boxHiNow = box[hi] + offset;
			if (span < size || boxHiNow <= L.box[hi] || boxLoNow >= R.box[lo]) continue;
			const wantLo = L.box[hi] + (span - size) / 2, delta = wantLo - boxLoNow;
			if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis, kind: 'gap', delta, L: L.box, R: R.box };
		}
		// Gap duplication: repeat an existing neighbour-to-neighbour gap on the far side of a
		// neighbour (dragging a third box onto the end of an already-spaced row). Same row/cap as
		// equal-gap; competes on the same per-axis smallest-delta rule.
		const size = box[hi] - box[lo], boxLoNow = box[lo] + offset;
		for (const A of row) for (const B of row) {
			if (A === B) continue;
			const gap = B.box[lo] - A.box[hi];
			if (gap <= 0) continue;
			const after = B.box[hi] + gap, before = A.box[lo] - gap - size;
			const dup = Math.abs(after - boxLoNow) <= Math.abs(before - boxLoNow)
				? { side: 'after', want: after, A: A.box, B: B.box }
				: { side: 'before', want: before, A: A.box, B: B.box };
			const delta = dup.want - boxLoNow;
			if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis, kind: 'gap-dup', delta, side: dup.side, A: dup.A, B: dup.B };
		}
		if (best) { chosen.push(best); if (axis === 'x') dx += best.delta; else dy += best.delta; }
	}
	const guides = chosen.map(guide => {
		const [lo, hi] = AXES[guide.axis], [clo, chi] = AXES[guide.axis === 'x' ? 'y' : 'x'];
		const axisOffset = guide.axis === 'x' ? dx : dy, cross = (box[clo] + box[chi]) / 2 + (guide.axis === 'x' ? dy : dx);
		if (guide.kind === 'gap' || guide.kind === 'gap-dup') {
			const boxLoNow = box[lo] + axisOffset, size = box[hi] - box[lo];
			const marks = guide.kind === 'gap-dup'
				? [ (guide.A[hi] + guide.B[lo]) / 2, guide.side === 'after' ? (guide.B[hi] + boxLoNow) / 2 : (boxLoNow + size + guide.A[lo]) / 2 ]
				: [ (guide.L[hi] + boxLoNow) / 2, (boxLoNow + size + guide.R[lo]) / 2 ];
			return { kind: 'gap', axis: guide.axis, marks: guide.axis === 'x' ? marks.map(m => [m, cross]) : marks.map(m => [cross, m]) };
		}
		return { kind: 'point', axis: guide.axis, at: guide.at, from: Math.min(box[lo] + axisOffset, guide.box[lo]), to: Math.max(box[hi] + axisOffset, guide.box[hi]), mark: guide.axis === 'x' ? [guide.at, cross] : [cross, guide.at] };
	});
	return { dx, dy, guides };
}
// Snap a proposed resize box's moved edges to nearby edges/centres. Unlocked and axis-aligned
// only: an independent per-axis nudge would break aspect-lock (resize-rules R27), and a rotated
// edge lining up with an unrotated neighbour is too fuzzy to ship (R26).
function snapResize(recipe, ids, from, next, tolerance) {
	if (![tolerance].every(Number.isFinite) || tolerance < 0) fail();
	if (![from, next].every(b => b && [b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite))) fail();
	const expanded = selectionIds(recipe, ids), selected = new Set(expanded);
	if (!from || from.maxX - from.minX < .05 || from.maxY - from.minY < .05) return { next: { ...next }, guides: [] };
	const targets = recipe.shapes.filter(shape => !selected.has(shape.id) && !Object.values(shape.bind || {}).some(anchor => selected.has(anchor.to))).map(shape => shape.id);
	const units = unitsFor(recipe, targets), out = { minX: next.minX, maxX: next.maxX, minY: next.minY, maxY: next.maxY }, chosen = [];
	for (const axis of ['x', 'y']) {
		const [lo, hi] = AXES[axis];
		const edges = [];
		if (Math.abs(next[lo] - from[lo]) > 1e-8) edges.push(lo);
		if (Math.abs(next[hi] - from[hi]) > 1e-8) edges.push(hi);
		let best;
		for (const edge of edges) for (const unit of units) for (const t of [.5, 0, 1]) {
			const at = unit.box[lo] + (unit.box[hi] - unit.box[lo]) * t, delta = at - next[edge];
			if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis, edge, at, delta, box: unit.box };
		}
		if (best) {
			const trial = { ...out, [best.edge]: out[best.edge] + best.delta };
			if (trial.maxX - trial.minX >= .05 && trial.maxY - trial.minY >= .05) { out[best.edge] += best.delta; chosen.push(best); }
		}
	}
	const guides = chosen.map(guide => {
		const [lo, hi] = AXES[guide.axis], [clo, chi] = AXES[guide.axis === 'x' ? 'y' : 'x'];
		const cross = (out[clo] + out[chi]) / 2;
		return { kind: 'point', axis: guide.axis, at: guide.at, from: Math.min(out[lo], guide.box[lo]), to: Math.max(out[hi], guide.box[hi]), mark: guide.axis === 'x' ? [guide.at, cross] : [cross, guide.at] };
	});
	return { next: out, guides };
}

export { applyOperations, editDrawing, selectionIds, snapMove, snapResize, anchorResize, anchorResizeLocal, selectionFrame, rotateDrawing, contentTiltBox, _rapierDrawReleaseAuthorPaint, _rapierDrawTranslateGeom, _rapierDrawTranslateShape, _rapierDrawRotatePt, _rapierDrawBindAnchorFor, _rapierDrawResizeShape, _rapierDrawResizeShapeLocal, _rapierDrawRotateShape, _rapierDrawFitText, _rapierDrawReleaseBindings, _rapierDrawPruneUnusedStrokes };
