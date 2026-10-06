/* rough.js generator (polygon / linearPath / hachure)
   Vendored from rough.js https://github.com/rough-stuff/rough
   MIT License

   Copyright (c) 2019 Preet Shihn

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.

   Pure geometry: no DOM, no canvas. One function — roughPaths — takes a
   polygon/polyline plus options and returns path data for the rough outline
   and (optional) hachure fill. Seeded PRNG so a redraw is byte-stable.
*/

function _fmt(n) {
	const r = Math.round(n * 100) / 100;
	return r.toString();
}

function Random(seed) {
	this.seed = seed >>> 0 || 1;
}
Random.prototype.next = function () {
	return ((2 ** 31 - 1) & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31;
};

function opts(options) {
	const o = {
		maxRandomnessOffset: 2,
		roughness: 1,
		bowing: 1,
		strokeWidth: 1,
		disableMultiStroke: false,
		disableMultiStrokeFill: false,
		preserveVertices: false,
		hachureAngle: -41,
		hachureGap: -1,
		seed: 1,
		closed: false,
		hachure: false,
		...(options || {}),
	};
	o.randomizer = new Random(o.seed || 1);
	return o;
}

function random(o) { return o.randomizer.next(); }

function offset(min, max, o, gain = 1) {
	return o.roughness * gain * (random(o) * (max - min) + min);
}

function offsetOpt(x, o, gain = 1) { return offset(-x, x, o, gain); }

function lineOps(x1, y1, x2, y2, o, overlay) {
	const lengthSq = (x1 - x2) ** 2 + (y1 - y2) ** 2;
	const length = Math.sqrt(lengthSq);
	let gain = 1;
	if (length > 500) gain = 0.4;
	else if (length >= 200) gain = -0.0016668 * length + 1.233334;
	let off = o.maxRandomnessOffset || 0;
	if (off * off * 100 > lengthSq) off = length / 10;
	const half = off / 2;
	const diverge = 0.2 + random(o) * 0.2;
	let midX = o.bowing * o.maxRandomnessOffset * (y2 - y1) / 200;
	let midY = o.bowing * o.maxRandomnessOffset * (x1 - x2) / 200;
	midX = offsetOpt(midX, o, gain);
	midY = offsetOpt(midY, o, gain);
	const ops = [];
	const halfR = () => offsetOpt(half, o, gain);
	const fullR = () => offsetOpt(off, o, gain);
	const keep = o.preserveVertices;
	ops.push(overlay
		? {op: 'move', data: [x1 + (keep ? 0 : halfR()), y1 + (keep ? 0 : halfR())]}
		: {op: 'move', data: [x1 + (keep ? 0 : offsetOpt(off, o, gain)), y1 + (keep ? 0 : offsetOpt(off, o, gain))]});
	const jitter = overlay ? halfR : fullR;
	ops.push({
		op: 'bcurveTo',
		data: [
			midX + x1 + (x2 - x1) * diverge + jitter(),
			midY + y1 + (y2 - y1) * diverge + jitter(),
			midX + x1 + 2 * (x2 - x1) * diverge + jitter(),
			midY + y1 + 2 * (y2 - y1) * diverge + jitter(),
			x2 + (keep ? 0 : jitter()),
			y2 + (keep ? 0 : jitter()),
		],
	});
	return ops;
}

function doubleLine(x1, y1, x2, y2, o, filling = false) {
	const single = filling ? o.disableMultiStrokeFill : o.disableMultiStroke;
	const a = lineOps(x1, y1, x2, y2, o, false);
	if (single) return a;
	return a.concat(lineOps(x1, y1, x2, y2, o, true));
}

function linearPath(points, close, o) {
	const len = points.length;
	const ops = [];
	for (let i = 0; i < len - 1; i++) ops.push(...doubleLine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], o));
	if (close) ops.push(...doubleLine(points[len - 1][0], points[len - 1][1], points[0][0], points[0][1], o));
	return ops;
}

function rotate(points, cx, cy, deg) {
	const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
	return points.map(([x, y]) => [(x - cx) * c - (y - cy) * s + cx, (x - cx) * s + (y - cy) * c + cy]);
}

function hachureLines(polygon, o) {
	const angle = o.hachureAngle + 90;
	let gap = o.hachureGap;
	if (gap < 0) gap = Math.max(0.1, (o.strokeWidth || 1) * 4);
	gap = Math.max(0.5, gap);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of polygon) {
		if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
		if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
	}
	const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
	const rotated = rotate(polygon, cx, cy, angle);
	let rMinY = Infinity, rMaxY = -Infinity;
	for (const p of rotated) {
		if (p[1] < rMinY) rMinY = p[1]; if (p[1] > rMaxY) rMaxY = p[1];
	}
	const lines = [];
	const n = polygon.length;
	for (let y = rMinY + gap; y <= rMaxY; y += gap) {
		const xs = [];
		for (let i = 0; i < n; i++) {
			const a = rotated[i], b = rotated[(i + 1) % n];
			const y0 = a[1], y1 = b[1];
			if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
				const t = (y - y0) / (y1 - y0);
				xs.push(a[0] + (b[0] - a[0]) * t);
			}
		}
		xs.sort((p, q) => p - q);
		for (let i = 0; i + 1 < xs.length; i += 2) {
			const p1 = rotate([[xs[i], y]], cx, cy, -angle)[0];
			const p2 = rotate([[xs[i + 1], y]], cx, cy, -angle)[0];
			lines.push([p1, p2]);
		}
	}
	return lines;
}

function opsToPath(ops) {
	let d = '';
	for (const op of ops) {
		const p = op.data.map(_fmt);
		if (op.op === 'move') d += 'M' + p[0] + ' ' + p[1];
		else if (op.op === 'bcurveTo') d += 'C' + p[0] + ' ' + p[1] + ' ' + p[2] + ' ' + p[3] + ' ' + p[4] + ' ' + p[5];
	}
	return d;
}

/**
 * Rough outline (and optional hachure fill) for a polygon or polyline.
 * @param {number[][]} points
 * @param {{closed?: boolean, seed?: number, roughness?: number, bowing?: number, hachure?: boolean, strokeWidth?: number, hachureGap?: number, hachureAngle?: number}} options
 * @returns {{outline: string, fill: string}}
 */
export function roughPaths(points, options) {
	const pts = (points || []).map(p => [+p[0], +p[1]]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
	const o = opts(options);
	if (pts.length < 2) return {outline: '', fill: ''};
	const closed = o.closed === true || (pts.length > 2 && o.hachure);
	const outline = opsToPath(linearPath(pts, closed, o));
	let fill = '';
	if (o.hachure && closed && pts.length >= 3) {
		const lines = hachureLines(pts, o);
		const fillOps = [];
		for (const [a, b] of lines) fillOps.push(...doubleLine(a[0], a[1], b[0], b[1], o, true));
		fill = opsToPath(fillOps);
	}
	return {outline, fill};
}
