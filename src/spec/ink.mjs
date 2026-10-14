// SPDX-License-Identifier: MIT
import { INK_PATH_MAX } from './md-marks.mjs';

const inkGeometry = () => {
	// SPDX-License-Identifier: MIT
	const INK_LAYOUT_EM = Object.freeze({
		asDrawn: 0.10,
		ringPad: 0.15,
	});

	function bounds(points) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
		return points.length ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : { x: 0, y: 0, width: 0, height: 0 };
	}

	function unionBox(boxes) {
		if (!boxes.length) return null;
		const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
		return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
	}

	function decodePath(path, origin, em) {
		return path.map(([x, y]) => ({ x: origin.x + x * em / 100, y: origin.y + y * em / 100 }));
	}

	const fit = (path, box, target, em) => {
		const w = box[0] || 1, h = box[1] || 1;
		return path.map(([x, y]) => ({ x: target.x + x / w * target.width, y: target.y + y / h * target.height }));
	};
	const within = (value, stored, fraction) => Math.abs(value - stored) <= fraction * Math.max(stored, 1e-9);

	function arrowEndpoints(tails, heads) {
		let endpoints = null, distance = Infinity;
		for (const tail of tails) for (const head of heads) {
			const a = { x: tail.x + tail.width / 2, y: tail.y + tail.height / 2 };
			const b = { x: head.x + head.width / 2, y: head.y + head.height / 2 };
			const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
			if (d > 0 && d < distance) { distance = d; endpoints = [a, b]; }
		}
		return endpoints;
	}

	function deriveArrow(mark, tails, heads, em) {
		const ends = arrowEndpoints(tails, heads);
		if (!ends) return [];
		const [a, b] = ends, dx = b.x - a.x, dy = b.y - a.y;
		const path = mark.path || [], first = path[0], last = path[path.length - 1];
		const sx = first && last ? last[0] - first[0] : 0, sy = first && last ? last[1] - first[1] : 0;
		const squared = sx * sx + sy * sy;
		const shaft = squared ? path.map(([x, y]) => {
			const along = ((x - first[0]) * sx + (y - first[1]) * sy) / squared;
			const across = ((y - first[1]) * sx - (x - first[0]) * sy) / squared;
			return { x: a.x + along * dx - across * dy, y: a.y + along * dy + across * dx };
		}) : [a, b];
		const prior = shaft.slice(0, -1).reverse().find(p => p.x !== b.x || p.y !== b.y) || a;
		const length = Math.hypot(b.x - prior.x, b.y - prior.y), ux = (b.x - prior.x) / length, uy = (b.y - prior.y) / length;
		const reach = Math.min(0.55 * em, Math.hypot(dx, dy) / 3), wing = reach * 0.5;
		return [shaft, [{ x: b.x - reach * ux - wing * uy, y: b.y - reach * uy + wing * ux }, b,
			{ x: b.x - reach * ux + wing * uy, y: b.y - reach * uy - wing * ux }]];
	}

	function deriveMark(mark, fragments, anchorBox, em, endFragments = []) {
		const unit = em / 100;
		if (mark.kind === 'end') return [];
		if (mark.kind === 'arrow') return deriveArrow(mark, fragments, endFragments, em);
		if ((mark.kind === 'under' || mark.kind === 'strike') && !mark.path?.length) {
			return fragments.map(f => {
				const y = f.y + f.height * (mark.kind === 'under' ? 0.95 : 0.5);
				return [{ x: f.x, y }, { x: f.x + f.width, y }];
			});
		}
		if (mark.kind === 'free') {
			if (!anchorBox || !mark.at) return [];
			return [decodePath(mark.path, { x: anchorBox.x + mark.at[0] * unit, y: anchorBox.y + mark.at[1] * unit }, em)];
		}
		if (!fragments.length || !mark.box) return [];
		const U = unionBox(fragments);
		const stored = { width: mark.box[0] * unit, height: mark.box[1] * unit };
		if (mark.kind === 'bracket') {
			if (!mark.at) return [];
			const sy = stored.height ? U.height / stored.height : 1;
			const origin = { x: U.x + mark.at[0] * unit, y: U.y + mark.at[1] * unit * sy };
			return [mark.path.map(([x, y]) => ({ x: origin.x + x * unit, y: origin.y + y * unit * sy }))];
		}
		if (within(U.width, stored.width, INK_LAYOUT_EM.asDrawn) && within(U.height, stored.height, INK_LAYOUT_EM.asDrawn)) return [fit(mark.path, mark.box, U, em)];
		if (mark.kind === 'ring') {
			const pad = INK_LAYOUT_EM.ringPad * em;
			return fragments.map(f => fit(mark.path, mark.box, { x: f.x - pad, y: f.y - pad, width: f.width + 2 * pad, height: f.height + 2 * pad }, em));
		}
		return fragments.map(f => fit(mark.path, mark.box, f, em));
	}
	return { INK_LAYOUT_EM, bounds, unionBox, decodePath, deriveMark, arrowEndpoints };
};
const { INK_LAYOUT_EM, bounds, unionBox, decodePath, deriveMark, arrowEndpoints } = inkGeometry();
export { bounds, unionBox, decodePath, deriveMark, arrowEndpoints };

export const INK_EM = Object.freeze({
	dot: 0.3,
	closeGap: 0.6,
	flatHeight: 0.45,
	flatWidth: 0.5,
	tallWidth: 1.0,
	tallHeight: 1.2,
	margin: 0.1,
	reach: 0.15,
	simplify: 0.015,
	...INK_LAYOUT_EM,
});

const STRIKE_BAND = [0.25, 0.62];
const UNDER_BAND = [0.62, 1.15];

export function arrowStroke(points, words, em) {
	if (!Array.isArray(points) || points.length < 2 || !Array.isArray(words)) return null;
	const wordAt = p => words.find(w => p.x >= w.box.x && p.x <= w.box.x + w.box.width && p.y >= w.box.y && p.y < w.box.y + w.box.height * 0.82);
	const first = points[0], tail = wordAt(first);
	if (!tail || strokeLength(points) < INK_EM.dot * em) return null;
	let tip = 0, far = 0;
	for (let i = 1; i < points.length; i++) {
		const d = Math.hypot(points[i].x - first.x, points[i].y - first.y);
		if (d > far) { tip = i; far = d; }
	}
	if (tip > 0 && tip < points.length - 1 && far >= em) {
		const p = points[tip], head = wordAt(p);
		if (head && head !== tail && points.slice(tip + 1).every(q => Math.hypot(q.x - p.x, q.y - p.y) <= 1.25 * em)) {
			return { tail, head, points: points.slice(0, tip + 1) };
		}
	}
	const head = wordAt(points[points.length - 1]);
	return head && head !== tail ? { tail, head, points } : null;
}

export function strokeLength(points) {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	return total;
}

const overlapsY = (a, b) => a.y < b.y + b.height && a.y + a.height > b.y;
const overlapsX = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x;
const overlaps = (a, b) => overlapsX(a, b) && overlapsY(a, b);
const verticalDistance = (y, r) => Math.max(r.y - y, y - r.y - r.height, 0);

function strokeBand(points, top, bottom) {
	let length = 0, moment = 0, left = Infinity, right = -Infinity;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
		const segment = Math.hypot(dx, dy);
		if (!segment) continue;
		const lo = Math.max(top, Math.min(a.y, b.y)), hi = Math.min(bottom, Math.max(a.y, b.y));
		if (hi < lo || dy && hi === lo) continue;
		const part = dy ? segment * (hi - lo) / Math.abs(dy) : segment;
		const x0 = dy ? a.x + dx * (lo - a.y) / dy : a.x;
		const x1 = dy ? a.x + dx * (hi - a.y) / dy : b.x;
		length += part; moment += part * (lo + hi) / 2;
		left = Math.min(left, x0, x1); right = Math.max(right, x0, x1);
	}
	if (!length) { const box = bounds(points); return { length, y: box.y + box.height / 2, x: box.x, width: box.width }; }
	return { length, y: moment / length, x: left, width: right - left };
}

function strokeLine(points, fragments) {
	const whole = strokeBand(points, -Infinity, Infinity);
	let best = null;
	for (const box of fragments) {
		const part = strokeBand(points, box.y, box.y + box.height), distance = verticalDistance(whole.y, box);
		if (!best || part.length > best.part.length || part.length === best.part.length &&
			(distance < best.distance || distance === best.distance && (box.y < best.box.y || box.y === best.box.y && box.x < best.box.x))) {
			best = { box, part, distance };
		}
	}
	return best && { box: best.box, stroke: best.part.length ? best.part : whole };
}

export function encloses(points, x, y) {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i], b = points[j];
		if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
}

export function classifyStroke(points, fragments, em) {
	if (!Array.isArray(points) || points.length < 2) return 'free';
	const b = bounds(points);
	if (strokeLength(points) < INK_EM.dot * em) return 'free';
	const first = points[0], last = points[points.length - 1];
	const gap = Math.hypot(last.x - first.x, last.y - first.y);
	const closed = points.length >= 8 && gap <= Math.max(INK_EM.closeGap * em, 0.2 * (b.width + b.height));
	if (closed && b.width >= 0.8 * em && b.height >= 0.5 * em && fragments.some(f => overlaps(b, f))) return 'ring';
	const flat = b.height <= INK_EM.flatHeight * em && b.width >= INK_EM.flatWidth * em;
	const tall = b.width <= INK_EM.tallWidth * em && b.height >= INK_EM.tallHeight * em;
	if (tall) {
		const beside = fragments.filter(f => overlapsY(b, f));
		const cx = b.x + b.width / 2;
		return beside.length && beside.every(f => cx <= f.x - INK_EM.margin * em || cx >= f.x + f.width + INK_EM.margin * em) ? 'bracket' : 'free';
	}
	if (!flat) return 'free';
	const line = strokeLine(points, fragments);
	if (!line || !line.box.height) return 'free';
	const rel = (line.stroke.y - line.box.y) / line.box.height;
	if (rel >= STRIKE_BAND[0] && rel <= STRIKE_BAND[1]) return 'strike';
	if (rel > UNDER_BAND[0] && rel <= UNDER_BAND[1]) return 'under';
	return 'free';
}

const rectDistance = (p, r) => {
	const dx = p.x < r.x ? r.x - p.x : p.x > r.x + r.width ? p.x - r.x - r.width : 0;
	const dy = verticalDistance(p.y, r);
	return Math.hypot(dx, dy);
};
const span = words => ({ start: Math.min(...words.map(w => w.start)), end: Math.max(...words.map(w => w.end)) });
const toStored = (v, em) => Math.round(v * 100 / em);

export function anchorStroke(points, kind, words, em) {
	if (!Array.isArray(points) || !points.length || !Array.isArray(words) || !words.length) return null;
	const b = bounds(points);
	let chosen = [];
	if (kind === 'under' || kind === 'strike') {
		const byLine = new Map();
		for (const word of words) {
			if (!byLine.has(word.box.y)) byLine.set(word.box.y, []);
			byLine.get(word.box.y).push(word);
		}
		const line = strokeLine(points, Array.from(byLine.values(), group => unionBox(group.map(w => w.box))));
		if (!line) return null;
		const reach = INK_EM.reach * em;
		const band = { x: line.stroke.x - reach, width: line.stroke.width + 2 * reach };
		chosen = byLine.get(line.box.y).filter(w => overlapsX(band, w.box));
		if (!chosen.length) return null;
	} else if (kind === 'ring') {
		chosen = words.filter(w => {
			const centre = { x: w.box.x + w.box.width / 2, y: w.box.y + w.box.height / 2 };
			if (encloses(points, centre.x, centre.y)) return true;
			const ix = Math.max(0, Math.min(b.x + b.width, w.box.x + w.box.width) - Math.max(b.x, w.box.x));
			const iy = Math.max(0, Math.min(b.y + b.height, w.box.y + w.box.height) - Math.max(b.y, w.box.y));
			return w.box.width > 0 && w.box.height > 0 && ix * iy >= 0.5 * w.box.width * w.box.height;
		});
		if (!chosen.length) return null;
	} else if (kind === 'bracket') {
		chosen = words.filter(w => overlapsY(b, w.box));
		if (!chosen.length) return null;
	} else {
		let nearest = null, bestLine = Infinity, bestWord = Infinity;
		const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		for (const w of words) {
			const lineDistance = verticalDistance(centre.y, w.box), wordDistance = rectDistance(centre, w.box);
			if (lineDistance < bestLine || lineDistance === bestLine && (wordDistance < bestWord ||
				wordDistance === bestWord && w.start < nearest.start)) {
				bestLine = lineDistance; bestWord = wordDistance; nearest = w;
			}
		}
		if (!nearest) return null;
		chosen = [nearest];
	}
	const frame = unionBox(chosen.map(w => w.box));
	const at = kind === 'bracket' || kind === 'free' ? [toStored(b.x - frame.x, em), toStored(b.y - frame.y, em)] : null;
	return { ...span(chosen), frame, at };
}

export function simplifyStroke(points, tolerance) {
	if (points.length <= 2) return points.slice();
	const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
	const stack = [[0, points.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop();
		const a = points[s], c = points[e];
		let far = -1, farthest = tolerance;
		for (let i = s + 1; i < e; i++) {
			const p = points[i];
			const dx = c.x - a.x, dy = c.y - a.y, len2 = dx * dx + dy * dy;
			const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
			const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
			if (d > farthest) { farthest = d; far = i; }
		}
		if (far >= 0) { keep[far] = 1; stack.push([s, far], [far, e]); }
	}
	return points.filter((_, i) => keep[i]);
}

export function resampleStroke(points, count) {
	if (points.length <= count || count < 2) return points.slice();
	const total = strokeLength(points);
	if (!total) return [points[0], points[points.length - 1]];
	const out = [points[0]];
	let i = 1, walked = 0;
	for (let k = 1; k < count - 1; k++) {
		const target = total * k / (count - 1);
		while (i < points.length - 1 && walked + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) < target) {
			walked += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); i++;
		}
		const a = points[i - 1], b = points[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
		const t = seg ? (target - walked) / seg : 0;
		out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
	}
	out.push(points[points.length - 1]);
	return out;
}

export function encodeStroke(points, origin, size, em) {
	let kept = simplifyStroke(points, INK_EM.simplify * em);
	if (kept.length > INK_PATH_MAX) kept = resampleStroke(kept, INK_PATH_MAX);
	return {
		box: [toStored(size.width, em), toStored(size.height, em)],
		path: kept.map(p => [toStored(p.x - origin.x, em), toStored(p.y - origin.y, em)]),
	};
}
