// SPDX-License-Identifier: AGPL-3.0-only
import {getStroke} from './freehand.mjs';

const PEN_SIZE = 9;
const PEN_OPTIONS = { thinning: 0.6, smoothing: 0.5, streamline: 0.5, last: true };
const PEN_TAPER = 2;
const PRESSURE_VARIANCE = 0.05;
const fmt = n => (Math.round(n * 100) / 100).toString();

// The same filled quadratic outline serves Draw, live annotation and the exported document.
function outlinePath(points) {
	const len = points && points.length;
	if (!len || len < 4) return '';
	const mid = (a, b) => fmt((a + b) / 2);
	let a = points[0], b = points[1];
	const c = points[2];
	let d = 'M' + fmt(a[0]) + ',' + fmt(a[1]) +
		' Q' + fmt(b[0]) + ',' + fmt(b[1]) + ' ' + mid(b[0], c[0]) + ',' + mid(b[1], c[1]) + ' T';
	for (let i = 2, max = len - 1; i < max; i++) {
		a = points[i]; b = points[i + 1];
		d += mid(a[0], b[0]) + ',' + mid(a[1], b[1]) + ' ';
	}
	return d + 'Z';
}

// Constant device pressure is a placeholder; only variation replaces Draw's velocity model.
export function strokeHasPressure(pts) {
	if (!pts || pts.length < 3) return false;
	let min = Infinity, max = -Infinity;
	for (const p of pts) {
		const v = p.length > 3 ? p[3] : null;
		if (typeof v !== 'number' || !(v >= 0)) return false;
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return max - min > PRESSURE_VARIANCE;
}

// Captured points are [x, y, time?, pressure?]. A fixed pressure serves coordinate-only marks:
// their thickness must not change when source simplification or word reflow spaces samples out.
export function penPath(pts, {size, last = true, fixedPressure = null, streamline = PEN_OPTIONS.streamline, cutStart = false, cutEnd = false} = {}) {
	if (!pts || pts.length < 2) return '';
	const fixed = typeof fixedPressure === 'number';
	const pressured = !fixed && strokeHasPressure(pts);
	const nib = size || PEN_SIZE;
	// A stroke shorter than its nib is a round dab; tapering would eat the whole mark.
	let length = 0;
	for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
	const taper = length < nib ? 0 : nib * PEN_TAPER;
	// Compaction changes sample spacing, not hand speed. Preserve Draw's captured clock for
	// velocity and time-based pressure settling; generated geometry uses the library's simulation.
	const clocked = !fixed && pts.at(-1)[2] > pts[0][2] && pts.every((p, i) => Number.isFinite(p[2]) && (!i || p[2] >= pts[i - 1][2]));
	let pressure = .5;
	const input = pts.map((p, i) => {
		if (fixed) return [p[0], p[1], fixedPressure];
		if (pressured) return [p[0], p[1], p[3]];
		if (!clocked || length < nib) return [p[0], p[1]];
		if (i) {
			const previous = pts[i - 1], dt = p[2] - previous[2];
			if (dt > 0) {
				const speed = Math.hypot(p[0] - previous[0], p[1] - previous[1]) / dt;
				const target = 1 - Math.min(1, speed * (1000 / 60) / nib);
				pressure += (target - pressure) * -Math.expm1(-dt / 45);
			}
		}
		return [p[0], p[1], pressure];
	});
	let outline;
	try {
		outline = getStroke(input, { ...PEN_OPTIONS, size: nib, streamline,
			simulatePressure: !fixed && !pressured && !clocked && length >= nib, last: !!last,
			start: { taper: cutStart ? 0 : taper, cap: !cutStart }, end: { taper: cutEnd ? 0 : taper, cap: !cutEnd } });
	} catch (_) { return ''; }
	return outlinePath(outline);
}

// Half-width at each end of the outline. A cut keeps the stroke's own pressure radius;
// a fresh taper collapses toward a point, and a blunt cap stays at the full nib.
export function endWidthProfile(pts, size, ends = {}) {
const fixed = typeof ends.fixedPressure === 'number';
const pressured = !fixed && strokeHasPressure(pts);
const nib = size || PEN_SIZE;
let length = 0;
for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
const taper = length < nib ? 0 : nib * PEN_TAPER;
const input = pts.map(p => fixed ? [p[0], p[1], ends.fixedPressure] : pressured ? [p[0], p[1], p[3]] : [p[0], p[1]]);
let outline;
try {
outline = getStroke(input, { ...PEN_OPTIONS, size: nib, last: true,
simulatePressure: !fixed && !pressured && length >= nib,
start: { taper: ends.cutStart ? 0 : taper, cap: !ends.cutStart },
end: { taper: ends.cutEnd ? 0 : taper, cap: !ends.cutEnd } });
} catch (_) { return null; }
if (!outline || outline.length < 4) return null;
const radius = (at) => {
let best = Infinity;
for (const q of outline) best = Math.min(best, Math.hypot(q[0] - at[0], q[1] - at[1]));
return best;
};
return { start: radius(pts[0]), end: radius(pts[pts.length - 1]), samples: outline.length };
}
