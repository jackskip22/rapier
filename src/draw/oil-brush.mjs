// SPDX-License-Identifier: AGPL-3.0-only
import {OIL_MEDIA, OIL_LOOK, OIL_FOOTPRINT} from './oil-material.mjs';
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (x, y, s) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

export class OilPath {
	constructor(surface, {rgb, width, load = 1, water = 0, medium = 'oil', angle = null, seed = 1, pressure = 1, time = 0}) {
		if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(Number.isFinite) ||
			![width, load, water, seed, pressure, time].every(Number.isFinite) || width <= 0 || width > 16384 || time < 0 ||
			!['oil', 'acrylic'].includes(medium) || angle != null && angle !== 'follow' && !Number.isFinite(angle))
			throw new RangeError('Invalid paint stroke');
		this.surface = surface; this.seed = seed >>> 0; this.time = time;
		this._tox = surface.toothOX || 0; this._toy = surface.toothOY || 0;
		this.medium = medium === 'acrylic' ? 'acrylic' : 'oil';
		this._brush({rgb, width, load, water, medium: this.medium, pressure, brush: angle === null || angle === undefined ? 'round' : 'flat', angle: angle === 'follow' ? 0 : angle || 0, follow: angle === 'follow'});
	}
	rebase(dx, dy) {
		if (!(dx || dy)) return;
		const c = this.cur;
		if (c.q) for (const q of c.q) { q[0] += dx; q[1] += dy; }
		for (const at of [c.last, c.lastStep, c.lastU, c.curlAt]) if (at) { at[0] += dx; at[1] += dy; }
		if (this._cx !== undefined) this._cx += dx; if (this._cy !== undefined) this._cy += dy;
	}
	_brush({rgb, width, load, water, medium, pressure, brush, angle, follow}) {
		const M = OIL_MEDIA[medium], L = OIL_LOOK, r = rng(this.seed * 7919 + 1);
		width = Math.max(2, width);
		const n = Math.round(clamp(width / L.hairPx, 24, 220)), base = [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
		const thin = clamp(water), cap = M.hold * width;
		const hairs = [], nC = brush === 'flat' ? Math.max(3, Math.round(width / 20)) : OIL_FOOTPRINT.length, cg = Array.from({length: nC + 2}, () => .55 + .7 * r()), cval = Array.from({length: nC + 2}, () => 1 + (r() - .5) * (brush === 'flat' ? .14 : .34));
		const tufts = brush === 'flat' ? null : (() => {
			const T = OIL_FOOTPRINT, area = T.reduce((s, t) => s + t[2] * t[2], 0), out = [];
			T.forEach((t, k) => { const m = Math.max(1, Math.round(n * t[2] * t[2] / area)); for (let j = 0; j < m; j++) { const a = r() * 2 * Math.PI, d = Math.sqrt(r()); out.push({ox: clamp(t[0] + t[2] * d * Math.cos(a), -1, 1), oy: (t[1] + t[2] * 1.6 * d * Math.sin(a)) / .55, ci: k, d}); } });
			return out.sort((p, q) => p.ox - q.ox).slice(0, n);
		})();
		const nh = tufts ? tufts.length : n;
		for (let i = 0; i < nh; i++) {
			r(); r();
			const tf = tufts && tufts[i], ox = tf ? tf.ox : (i + .5) / n * 2 - 1 + (r() - .5) * 1.6 / n, oy = brush === 'flat' ? (r() - .5) * .16 : tf.oy, rr = brush === 'flat' ? Math.abs(ox) : Math.min(1, Math.hypot(ox, oy * .55));
			const flat = brush === 'flat' ? .45 : 1;
			const j = ((r() - .5) * .16 + (hash(i >> 3, this.seed, 5) - .5) * .1) * flat * L.valueJitter + (hash(i, this.seed, 77) - .5) * L.hairVal * flat;
			const sC0 = tf ? tf.ci : (ox + 1) / 2 * nC, cv = 1 + (cval[Math.max(0, Math.min(nC + 1, Math.floor(sC0) + 1))] - 1) * L.valueJitter;
			const res = [base[0] * (1 + j) * cv, base[1] * (1 + j) * cv, base[2] * (1 + j) * cv];
			const sC = tf ? tf.ci + .5 : (ox + 1) / 2 * nC + .5 * (r() - .5) * .3, ci = Math.floor(sC), rb = r(), bump = ((tf ? (1 - tf.d) : Math.sin(Math.PI * (sC - ci))) ** .8 * cg[ci + 1]) * (1 - L.bumpRandom) + L.bumpRandom * rb * rb * 1.3;
			hairs.push({ox, oy, g: (brush === 'flat' ? .85 + .3 * r() : 1 - .4 * L.gSpread + .8 * L.gSpread * r()) * (1 - .45 * rr ** 3) * (1 + L.clumpVar * (cg[ci + 1] - .9) / .35),
 L: cap * load * (brush === 'flat' ? .9 + .2 * r() : 1 + L.loadVar * (r() - .5)) * (1 - .2 * rr ** 4) * Math.max(.15, 1 + L.clumpLoad * (cg[ci + 1] - .9) / .35), res, res0: res.slice(), abs: res.slice(), as: 0, col: res.slice(), pick: res.slice(), pk: 0, bump, aff: .25 + 1.5 * r() ** 1.6,
				cseed: (ci + 1) * 17.3 + (this.seed % 9973) * 3.1,
				tx: 0, ty: 0, px: 0, py: 0, bowV: 0, bow: [0, 0, 0], on: false, first: false, land: r() * L.landSpan * width + (brush === 'flat' ? 0 : L.landBehind * Math.max(0, -(oy * .55 - .25) * .9) * width / 2 + L.landRound * (1 - Math.sqrt(Math.max(0, 1 - ox * ox))) * width / 2), gate: r() ** 1.5, hseed: i * 7.125});
		}
		const cur = this.cur = {M, brush, angle, follow, R0: width / 2, width, thin, cap, hairs, pressure, hairR: .7 + L.hairW * width / n,
			last: null, lastStep: null, dirx: 1, diry: 0, travel: 0, q: null, e: 0, mixed: [0, 0, 0], tmp: [0, 0, 0], groove: (this.seed * 911.37) % 4096};
		const nH = hairs.length, gapAt = G => { let m = Infinity; for (let i = 0; i + G < nH; i++) m = Math.min(m, hairs[i + G].ox - hairs[i].ox); return m; }, gcache = new Map();
		cur.groups = p => { const sp = cur.R0 * (brush === 'flat' ? 1 : .9 + .1 * Math.min(1, Math.max(0, p))), reach = 2 * (cur.hairR + 1) + 2 * .6 * cur.hairR + 1, key = Math.round(sp * 64);
			if (gcache.has(key)) return gcache.get(key);
			let G = Math.max(1, Math.ceil(nH / 64)); while (G < nH && gapAt(G) * sp < reach) G++;
			gcache.set(key, G); return G; };

	}
	add(points) { return this._finish(this.addWork(points)); }
	_finish(work) { let step; do { step = work.next(); } while (!step.done); return step.value; }
	validate(points) {
		if (!Array.isArray(points) || points.some(p => !Array.isArray(p) || p.length < 3 ||
			!p.slice(0, 3).every(Number.isFinite) || p[3] !== undefined && (!Number.isFinite(p[3]) || p[3] < 0) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6 || p[2] < 0 || p[2] > 1))
			throw new RangeError('Invalid paint sample');
	}
	*addWork(points) {
		this.validate(points);
		const c = this.cur, box = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
		for (const [x, y, p0, time = this.time] of points) {
			const q = c.q || (c.q = []), last = q[q.length - 1];
			if (last && Math.hypot(x - last[0], y - last[1]) < .5) { last[2] = p0 * c.pressure; last[3] = time; continue; }
			q.push([x, y, p0 * c.pressure, time]);
			if (q.length === 2 && !c.lastStep) { const dx = x - q[0][0], dy = y - q[0][1], l = Math.hypot(dx, dy); c.dirx = dx / l; c.diry = dy / l; this.time = q[0][3]; this._step(q[0][0], q[0][1], q[0][2], box); yield; }
			while (c.e + 2 < q.length) { yield* this._segmentWork(c.e, box); c.e++; }
			if (c.e > 1) { q.splice(0, c.e - 1); c.e = 1; }
		}
		return this._commit(box);
	}
	end() { return this._finish(this.endWork()); }
	*endWork() {
		const c = this.cur, box = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
		if (c.q && c.q.length === 1 && !c.lastStep) { this.time = c.q[0][3]; this._step(c.q[0][0], c.q[0][1], c.q[0][2], box); yield; }
		if (c.q) while (c.e + 1 < c.q.length) { yield* this._segmentWork(c.e, box); c.e++; }
		if (c.last && c.travel > c.width * .3) {
			const at = c.last, dl = Math.hypot(c.dirx, c.diry) || 1, L = c.width * OIL_LOOK.liftLen, m = Math.max(1, Math.ceil(L / 1.2));
			for (let s = 1; s <= m; s++) { this._lift = s / m; this._step(at[0] + c.dirx / dl * L * s / m, at[1] + c.diry / dl * L * s / m, at[2], box); yield; }
			this._lift = 0;
		}
		const out = this._commit(box);
		return out;
	}
	*_segmentWork(i, box) {
		const c = this.cur, q = c.q, P0 = q[Math.max(0, i - 1)], P1 = q[i], P2 = q[i + 1], P3 = q[Math.min(q.length - 1, i + 2)];
		const m = Math.max(1, Math.ceil(Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) / 1.2));
		const cr = (a, b, cc, d, t) => .5 * (2 * b + (cc - a) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (3 * b - a - 3 * cc + d) * t * t * t);
		for (let s = 1; s <= m; s++) {
			const t = s / m, x = cr(P0[0], P1[0], P2[0], P3[0], t), y = cr(P0[1], P1[1], P2[1], P3[1], t), p = P1[2] + (P2[2] - P1[2]) * t;
			const [lx, ly] = c.lastStep, dx = x - lx, dy = y - ly, l = Math.hypot(dx, dy);
			if (l > .2) { c.dirx += (dx / l - c.dirx) * .3; c.diry += (dy / l - c.diry) * .3; }
			c.travel += l; c.last = [x, y, p];
			this.time = P1[3] + (P2[3] - P1[3]) * t;
			this._step(x, y, p, box);
			yield;
		}
	}
	_curl(fx, fy) {
		const c = this.cur, a = Math.atan2(fy, fx), st = c.lastStep && c.curlAt ? Math.hypot(c.lastStep[0] - c.curlAt[0], c.lastStep[1] - c.curlAt[1]) : 0;
		if (c.curlA !== undefined && st > 0) { let d = Math.abs(a - c.curlA); if (d > Math.PI) d = 2 * Math.PI - d; const turn = Math.min(1, d / st * c.width * .25); c.curl = (c.curl || 0) + (turn - (c.curl || 0)) * Math.min(1, st / (c.width * .3)); }
		c.curlA = a; c.curlAt = c.lastStep ? c.lastStep.slice() : null;
	}
}

