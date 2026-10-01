// SPDX-License-Identifier: MIT
// The geometry of ink marks (docs/briefs/ink.md §2, §3; the grammar is spec/md-marks.mjs, "Ink"). Pure functions, no DOM:
// the page hands in the stroke's points and the boxes the browser laid (a fragment is one line's box of the marked words,
// as Range.getClientRects gives it; a word is {box, start, end} with its source offsets), and this module decides the
// kind, the anchor words, the stored path and the pieces to draw. The decisions of a lift (classify, anchor, encode) are
// made once; derive runs at every layout and reads only the mark and the boxes of that moment. Every length is a page
// unit (px) unless its name says em; the stored form is hundredths of an em.
import { INK_PATH_MAX } from './md-marks.mjs';

// The margins, in em, written here once and in the brief.
export const INK_EM = Object.freeze({
	dot: 0.3,          // a stroke shorter than this is a dot: free
	closeGap: 0.6,     // a loop closes when its ends are within this, or a fifth of its size
	flatHeight: 0.45,  // under and strike: the stroke's height at most this
	flatWidth: 1.0,    // and at least this wide
	tallWidth: 0.6,    // bracket: at most this wide
	tallHeight: 1.2,   // and at least this tall
	margin: 0.1,       // bracket: outside the words' column by at least this
	reach: 0.15,       // under and strike: words within this of the stroke's ends are marked
	simplify: 0.015,   // the resampler's tolerance: no point moves further than this
	asDrawn: 0.12,     // derive: the frame within this fraction of the stored box is as drawn
	ringPad: 0.15,     // a re-derived ring stands this far outside its fragment
});
const STRIKE_BAND = [0.25, 0.62]; // the stroke's mean height within the line's box, as a fraction of it
const UNDER_BAND = [0.62, 1.15];

export function bounds(points) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
	return points.length ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : { x: 0, y: 0, width: 0, height: 0 };
}

export function strokeLength(points) {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	return total;
}

export function unionBox(boxes) {
	if (!boxes.length) return null;
	const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
	return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}

const overlapsY = (a, b) => a.y < b.y + b.height && a.y + a.height > b.y;
const overlapsX = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x;
const overlaps = (a, b) => overlapsX(a, b) && overlapsY(a, b);
const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;

// Even-odd point-in-polygon over the stroke read as a closed loop.
export function encloses(points, x, y) {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i], b = points[j];
		if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
}

// The kind of a stroke, read once at the lift from its shape against the line boxes under it.
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
	const my = mean(points.map(p => p.y));
	let line = null, best = Infinity;
	for (const f of fragments) {
		const d = my < f.y ? f.y - my : my > f.y + f.height ? my - f.y - f.height : 0;
		if (d < best) { best = d; line = f; }
	}
	if (!line || !line.height) return 'free';
	const rel = (my - line.y) / line.height;
	if (rel >= STRIKE_BAND[0] && rel <= STRIKE_BAND[1]) return 'strike';
	if (rel > UNDER_BAND[0] && rel <= UNDER_BAND[1]) return 'under';
	return 'free';
}

const rectDistance = (p, r) => {
	const dx = p.x < r.x ? r.x - p.x : p.x > r.x + r.width ? p.x - r.x - r.width : 0;
	const dy = p.y < r.y ? r.y - p.y : p.y > r.y + r.height ? p.y - r.y - r.height : 0;
	return Math.hypot(dx, dy);
};
const span = words => ({ start: Math.min(...words.map(w => w.start)), end: Math.max(...words.map(w => w.end)) });
const toStored = (v, em) => Math.round(v * 100 / em);

// The words a stroke marks, and the frame its path is stored against: {start, end, frame, at} or null when it touches
// no words it can mark. under and strike take the words of their line within reach of the stroke's ends; a ring what it
// encloses; a bracket every word of the lines it stands beside; a free stroke its nearest word, with its offset.
export function anchorStroke(points, kind, words, em) {
	if (!Array.isArray(points) || !points.length || !Array.isArray(words) || !words.length) return null;
	const b = bounds(points);
	let chosen = [];
	if (kind === 'under' || kind === 'strike') {
		const my = mean(points.map(p => p.y));
		const reach = INK_EM.reach * em;
		const band = { x: b.x - reach, y: my, width: b.width + 2 * reach, height: 0 };
		chosen = words.filter(w => w.box.y <= my && my <= w.box.y + w.box.height * (kind === 'under' ? UNDER_BAND[1] : 1) && overlapsX(band, w.box));
		if (!chosen.length) {
			let nearest = null, best = Infinity;
			for (const w of words) { const d = rectDistance({ x: b.x + b.width / 2, y: my }, w.box); if (d < best) { best = d; nearest = w; } }
			if (!nearest) return null;
			chosen = words.filter(w => w.box.y === nearest.box.y && overlapsX(band, w.box));
			if (!chosen.length) return null;
		}
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
		let nearest = null, best = Infinity;
		const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		for (const w of words) { const d = rectDistance(centre, w.box); if (d < best) { best = d; nearest = w; } }
		if (!nearest) return null;
		chosen = [nearest];
	}
	const frame = unionBox(chosen.map(w => w.box));
	const at = kind === 'bracket' || kind === 'free' ? [toStored(b.x - frame.x, em), toStored(b.y - frame.y, em)] : null;
	return { ...span(chosen), frame, at };
}

// Ramer-Douglas-Peucker: no original point further than the tolerance from the kept polyline.
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

// Resample along the stroke's length to exactly `count` points, the ends kept.
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

// The stroke to its stored form: simplified within the tolerance, capped, in hundredths of an em from the origin;
// box is the frame's size the same way. The hand is kept: nothing is straightened or snapped.
export function encodeStroke(points, origin, size, em) {
	let kept = simplifyStroke(points, INK_EM.simplify * em);
	if (kept.length > INK_PATH_MAX) kept = resampleStroke(kept, INK_PATH_MAX);
	return {
		box: [toStored(size.width, em), toStored(size.height, em)],
		path: kept.map(p => [toStored(p.x - origin.x, em), toStored(p.y - origin.y, em)]),
	};
}

export function decodePath(path, origin, em) {
	return path.map(([x, y]) => ({ x: origin.x + x * em / 100, y: origin.y + y * em / 100 }));
}

const fit = (path, box, target, em) => {
	const w = box[0] || 1, h = box[1] || 1;
	return path.map(([x, y]) => ({ x: target.x + x / w * target.width, y: target.y + y / h * target.height }));
};
const within = (value, stored, fraction) => Math.abs(value - stored) <= fraction * Math.max(stored, 1e-9);

// The pieces to draw for one mark at this layout: fragments are the marked words' line boxes now, anchorBox the
// anchor word's box (free). As drawn while the frame still has the size it had; otherwise re-derived per fragment.
export function deriveMark(mark, fragments, anchorBox, em) {
	const unit = em / 100;
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
	if (within(U.width, stored.width, INK_EM.asDrawn) && within(U.height, stored.height, INK_EM.asDrawn)) return [fit(mark.path, mark.box, U, em)];
	if (mark.kind === 'ring') {
		const pad = INK_EM.ringPad * em;
		return fragments.map(f => fit(mark.path, mark.box, { x: f.x - pad, y: f.y - pad, width: f.width + 2 * pad, height: f.height + 2 * pad }, em));
	}
	return fragments.map(f => fit(mark.path, mark.box, f, em));
}
