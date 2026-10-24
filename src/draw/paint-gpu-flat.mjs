// SPDX-License-Identifier: AGPL-3.0-only

import {registerPaintEngine, paintPigmentWGSL, paintPigmentTables} from './paint-gpu.mjs';

export const FLAT_LANES = 40, FLAT_RING = 8;
export const FLAT_PIECE_FLOATS = 48;
const FLAG = {soft0: 1, soft1: 2, softStart: 4, bandStart: 8, bandEnd: 16};
const RIBBON_EDGE = 4, RIBBON_BODY = .65;
const RIBBON_SMUDGE_LOAD = .85;

const across = (P0, P1, Q0, Q1) => {
	const dx = P1[0] - P0[0], dy = P1[1] - P0[1], len = Math.hypot(dx, dy); if (len < 1e-9) return null;
	let nx = -dy / len, ny = dx / len; const mx = (Q0[0] + Q1[0]) / 2, my = (Q0[1] + Q1[1]) / 2;
	if (nx * (mx - P0[0]) + ny * (my - P0[1]) < 0) { nx = -nx; ny = -ny; }
	return [nx, ny, -(nx * P0[0] + ny * P0[1])];
};

export class FlatRecorder {
	constructor(width, height, scale = 1) {
		this.width = width; this.height = height; this.scale = scale; this.records = []; this.strokeCap = null; this.bite = 0; this.body = 0;
		this.pieces = new Float32Array(4096 * FLAT_PIECE_FLOATS); this.count = 0; this.taken = 0;
	}
	flatKnot(knot) { this.records.push({kind: 'knot', ...knot}); }
	take() { const out = {records: this.records, pieces: this.pieces.slice(0, this.count * FLAT_PIECE_FLOATS)}; this.records = []; this.count = 0; return out; }
	getColor() { this.unsupported = (this.unsupported || 0) + 1; return [0, 0, 0, 0]; }
	drawDab() { this.stamps = (this.stamps || 0) + 1; return false; }
	drawQuad(p0, p1, q1, q0, colFrom, colTo, aFrom, aTo, soft0, soft1, softStart, alpha = 1, wet = 0, edge = .5, outer = null, ref = null) {
		if (!ref) throw new Error('A GPU Flat piece needs its colour slots');
		const sc = this.scale, ax = p0[0] * sc, ay = p0[1] * sc, bx = p1[0] * sc, by = p1[1] * sc, cx = q1[0] * sc, cy = q1[1] * sc, dx = q0[0] * sc, dy = q0[1] * sc;
		const lx = Math.min(ax, bx, cx, dx), ly = Math.min(ay, by, cy, dy), hx = Math.max(ax, bx, cx, dx), hy = Math.max(ay, by, cy, dy);
		const pad = 1 + (soft0 || soft1 ? edge + RIBBON_EDGE * wet : 0);
		const x0 = Math.max(0, Math.floor(lx - pad)), y0 = Math.max(0, Math.floor(ly - pad)), x1 = Math.min(this.width - 1, Math.ceil(hx + pad)), y1 = Math.min(this.height - 1, Math.ceil(hy + pad));
		if (x1 < x0 || y1 < y0) return false;
		if ((this.count + 1) * FLAT_PIECE_FLOATS > this.pieces.length) { const grown = new Float32Array(this.pieces.length * 2); grown.set(this.pieces); this.pieces = grown; }
		const f = this.pieces, o = this.count * FLAT_PIECE_FLOATS;
		f.fill(0, o, o + FLAT_PIECE_FLOATS);
		f[o] = ax; f[o + 1] = ay; f[o + 2] = bx; f[o + 3] = by; f[o + 4] = cx; f[o + 5] = cy; f[o + 6] = dx; f[o + 7] = dy;
		f[o + 8] = aFrom; f[o + 9] = aTo; f[o + 10] = alpha; f[o + 11] = wet; f[o + 12] = edge;
		let flags = (soft0 ? FLAG.soft0 : 0) | (soft1 ? FLAG.soft1 : 0) | (softStart ? FLAG.softStart : 0);
		const band = (Ax, Ay, Bx, By, Mx, My, at) => {
			const ex = Bx - Ax, ey = By - Ay, len = Math.hypot(ex, ey); if (len < 1e-9) return false;
			let nx = -ey / len, ny = ex / len; if (nx * (Mx - Ax) + ny * (My - Ay) < 0) { nx = -nx; ny = -ny; }
			f[o + at] = nx; f[o + at + 1] = ny; f[o + at + 2] = -(nx * Ax + ny * Ay); return true;
		};
		if (soft0 || soft1) {
			if (band(ax, ay, bx, by, (cx + dx) / 2, (cy + dy) / 2, 28)) flags |= FLAG.bandStart;
			if (band(cx, cy, dx, dy, (ax + bx) / 2, (ay + by) / 2, 31)) flags |= FLAG.bandEnd;
		}
		const mx = (ax + bx + cx + dx) / 4, my = (ay + by + cy + dy) / 4;
		let sides = 0;
		const side = (F, G) => {
			if (!F || !G) return;
			const Fx = F[0] * sc, Fy = F[1] * sc, ex = G[0] * sc - Fx, ey = G[1] * sc - Fy, len = Math.hypot(ex, ey); if (len < 1e-9) return;
			let nx = -ey / len, ny = ex / len; if (nx * (mx - Fx) + ny * (my - Fy) < 0) { nx = -nx; ny = -ny; }
			const at = o + 16 + 3 * sides++; f[at] = nx; f[at + 1] = ny; f[at + 2] = -(nx * Fx + ny * Fy);
		};
		if (outer) for (const pair of outer) if (pair) side(pair[0], pair[1]);
		if (soft0) side(q0, p0);
		if (soft1) side(p1, q1);
		f[o + 13] = flags; f[o + 14] = sides; f[o + 15] = ref.lane;
		f[o + 34] = ref.sa; f[o + 35] = ref.sb; f[o + 36] = ref.wf; f[o + 37] = ref.wt;
		f[o + 38] = x0; f[o + 39] = y0; f[o + 40] = x1; f[o + 41] = y1;
		const last = this.records.at(-1), at = this.count++;
		if (last?.kind === 'pieces' && last.to === at) last.to = at + 1; else this.records.push({kind: 'pieces', from: at, to: at + 1});
		return true;
	}
}

export const FLAT_WGSL = paintPigmentWGSL({group: 0, binding: 7}) + `
struct Batch { W: u32, H: u32, x0: u32, y0: u32, w: u32, h: u32, first: u32, count: u32,
	slot: u32, flags: u32, knotAt: u32, tilesAt: u32, base: vec4f };
@group(0) @binding(0) var<storage, read_write> sheet: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> cap: array<f32>;
@group(0) @binding(2) var<storage, read> pieces: array<f32>;
@group(0) @binding(3) var<storage, read_write> ring: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> lanes: array<vec4f>;
@group(0) @binding(5) var<storage, read> knot: array<vec4f>;
@group(0) @binding(6) var<uniform> B: Batch;
// The batch's pieces binned by 16-pixel tile of its box: at tilesAt, a (start, count) pair a tile, then the lists of piece
// numbers (relative to first), each in the batch order.
@group(0) @binding(8) var<storage, read> tiles: array<u32>;
const TILE = 16u;
const P = ${FLAT_PIECE_FLOATS}u;
const EDGE = ${RIBBON_EDGE}.;
const BODY = ${RIBBON_BODY};
fn pf(q: u32, k: u32) -> f32 { return pieces[q * P + k]; }
fn pt(q: u32, k: u32) -> vec2f { return vec2f(pf(q, k), pf(q, k + 1u)); }
fn ringAt(slot: u32, lane: u32) -> vec3f { return ring[slot * 64u + lane].xyz; }

// One triangle's coverage of a pixel centre, the CPU's rule edge by edge: a hard edge keeps the pixels on it (keep) or not (open);
// a soft side only widens the piece (to -half); the first triangle's first edge, when soft, antialiases over a pixel.
fn tri(P0: vec2f, P1: vec2f, P2: vec2f, soft: vec3<bool>, open: vec3<bool>, first: bool, c: vec2f, half: f32, valid: ptr<function, bool>) -> f32 {
	let area = (P1.x - P0.x) * (P2.y - P0.y) - (P2.x - P0.x) * (P1.y - P0.y);
	if (!(abs(area) > 1e-9)) { *valid = false; return 0.; }
	*valid = true;
	let sgn = select(-1., 1., area > 0.);
	var V = array<vec2f, 3>(P0, P1, P2);
	var cov = 1.;
	for (var e = 0u; e < 3u; e++) {
		if (!(cov > 0.)) { break; }
		let a = V[e]; let b = V[(e + 1u) % 3u]; let dd = b - a; let len = length(dd);
		if (len < 1e-9) { continue; }
		let n = vec2f(-dd.y, dd.x) / len * sgn;
		let d = n.x * c.x + n.y * c.y - (n.x * a.x + n.y * a.y);
		if (soft[e]) { if (e == 0u && first) { cov = min(cov, clamp(d + .5, 0., 1.)); } else if (d < -half) { cov = 0.; } }
		else if (select(d < 0., d <= 0., open[e])) { cov = 0.; }
	}
	return cov;
}

@compute @workgroup_size(8, 8)
fn pieceBatch(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= B.w || id.y >= B.h) { return; }
	let xp = B.x0 + id.x; let yp = B.y0 + id.y;
	if (xp >= B.W || yp >= B.H) { return; }
	let p = yp * B.W + xp;
	let tw = (B.w + TILE - 1u) / TILE; let ti = B.tilesAt + 2u * ((id.y / TILE) * tw + id.x / TILE);
	let tStart = tiles[ti]; let tCount = tiles[ti + 1u];
	// Most of a batch's box is empty tiles: no sheet or cap read there.
	if (tCount == 0u) { return; }
	var D = sheet[p];
	var was = cap[p];
	let c = vec2f(f32(xp) + .5, f32(yp) + .5);
	var touched = false;
	for (var j = 0u; j < tCount; j++) {
		let q = B.first + tiles[B.tilesAt + tStart + j];
		let aFrom = pf(q, 8u); let aTo = pf(q, 9u);
		// A pixel the stroke's cap already holds at the most this piece can give it is passed over before its coverage is worked out
		// (it would be passed over after): the blade's thickness covers each pixel with many pieces in turn.
		if (was >= max(aFrom, aTo)) { continue; }
		if (f32(xp) < pf(q, 38u) || f32(yp) < pf(q, 39u) || f32(xp) > pf(q, 40u) || f32(yp) > pf(q, 41u)) { continue; }
		let A = pt(q, 0u); let Bq = pt(q, 2u); let C = pt(q, 4u); let Dq = pt(q, 6u); let alpha = pf(q, 10u); let wet = pf(q, 11u); let edge = pf(q, 12u);
		let flags = u32(pf(q, 13u)); let nSides = u32(pf(q, 14u)); let lane = u32(pf(q, 15u));
		let soft0 = (flags & 1u) != 0u; let soft1 = (flags & 2u) != 0u; let softStart = (flags & 4u) != 0u;
		let under = select(0., D.w, wet > 0.);
		let half = edge + EDGE * wet * clamp(under, 0., 1.); let inv = 1. / (2. * half);
		var cov = 0.;
		var v0 = false; var v1 = false;
		let c0 = tri(A, Bq, C, vec3<bool>(softStart, soft1, false), vec3<bool>(false, false, false), true, c, half, &v0);
		if (v0 && c0 > cov) { cov = c0; }
		// The second triangle is the first one kept when the first has no area.
		let c1 = tri(A, C, Dq, vec3<bool>(false, false, soft0), vec3<bool>(true, true, false), !v0, c, half, &v1);
		if (v1 && c1 > cov) { cov = c1; }
		if (!v0 && !v1) { continue; }
		for (var s = 0u; s < nSides; s++) {
			let nx = pf(q, 16u + 3u * s); let ny = pf(q, 17u + 3u * s); let cc = pf(q, 18u + 3u * s);
			let d = nx * c.x + ny * c.y + cc;
			if (d < half) { cov *= clamp(d * inv + .5, 0., 1.); }
		}
		if (!(cov > 0.)) { continue; }
		if ((flags & 8u) != 0u && pf(q, 28u) * c.x + pf(q, 29u) * c.y + pf(q, 30u) < select(0., -.5, softStart)) { continue; }
		if ((flags & 16u) != 0u && !(pf(q, 31u) * c.x + pf(q, 32u) * c.y + pf(q, 33u) > 0.)) { continue; }
		let s0 = (A + Bq) / 2.; let v = (C + Dq) / 2. - s0; var vv = dot(v, v); if (vv == 0.) { vv = 1.; }
		let t = clamp(dot(c - s0, v) / vv, 0., 1.);
		var o = cov * (aFrom + (aTo - aFrom) * t);
		if (!(o > 1. / 4096.)) { continue; }
		if (o <= was) { continue; }
		let w0 = was; was = o; if (w0 > 0.) { o = (o - w0) / (1. - w0); }
		let sa = u32(pf(q, 34u)); let sb = u32(pf(q, 35u)); let wf = pf(q, 36u); let wt = pf(q, 37u);
		let ca = ringAt(sa, lane); let cb = ringAt(sb, lane);
		let colFrom = ca + (cb - ca) * wf; let colTo = ca + (cb - ca) * wt;
		var col = colFrom + (colTo - colFrom) * t;
		let da = D.w;
		if (wet > 0. && da > 0.) { let w = wet * clamp(da, 0., 1.) * (1. - BODY * o); col += (D.xyz / da - col) * w; }
		// A smudging lane's piece (alpha -1) moves the pixel toward the coverage its lane carries, from the two knots' ring slots.
		var toward = alpha;
		if (alpha < 0.) { let wa = ring[sa * 64u + lane].w; toward = wa + (ring[sb * 64u + lane].w - wa) * wt; }
		let keep = 1. - o; let lay = o * clamp(toward, 0., 1.);
		D = vec4f(D.xyz * keep + lay * col, da * keep + lay);
		touched = true;
	}
	if (touched) { sheet[p] = D; cap[p] = was; }
}

// The knot: each lane mixes in what it samples ahead (a disk, every pixel, weighted equally) and its feed back toward the brush
// colour; the lanes are smoothed across the blade twice (1-2-1); each lane's colour times its value goes to the ring slot.
// The knot's sampling, before its lanes: a workgroup a lane disk (x the lane; y 0 the knot's first place, 1 its second, a smudging
// lane's paint under it), its 64 threads sharing the disk's pixels, every pixel weighted equally. The mean premultiplied color and
// coverage (0 off the sheet) goes to lanes[64 + 2 lane + y]. (One thread reading a whole disk, one lane after another, was half
// of Flat's GPU time on a T4.)
var<workgroup> diskSum: array<vec4f, 64>;
var<workgroup> diskCount: array<f32, 64>;
@compute @workgroup_size(64)
fn knotSample(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) t: u32) {
	let lane = wg.x; let which = wg.y;
	let a = knot[B.knotAt * 128u + 2u * lane]; let m = knot[B.knotAt * 128u + 2u * lane + 1u];
	let smudging = (B.flags & 2u) != 0u;
	// A mixing lane samples only while it lays paint and picks up.
	let wanted = smudging || (a.w > .5 && m.x > 0.);
	let c = select(a.xy, m.xy, which == 1u); let r = a.z;
	let lo = vec2i(floor(c - vec2f(r))); let hi = vec2i(ceil(c + vec2f(r)));
	let bw = u32(max(0, hi.x - lo.x + 1)); let total = select(0u, bw * u32(max(0, hi.y - lo.y + 1)), wanted);
	var sum = vec4f(0.); var count = 0.;
	for (var k = t; k < total; k += 64u) {
		let x = lo.x + i32(k % bw); let y = lo.y + i32(k / bw);
		if (x < 0 || y < 0 || u32(x) >= B.W || u32(y) >= B.H) { continue; }
		let d = vec2f(f32(x) + .5, f32(y) + .5) - c; if (dot(d, d) > r * r) { continue; }
		sum += sheet[u32(y) * B.W + u32(x)]; count += 1.;
	}
	diskSum[t] = sum; diskCount[t] = count;
	workgroupBarrier();
	for (var step = 32u; step > 0u; step >>= 1u) {
		if (t < step) { diskSum[t] += diskSum[t + step]; diskCount[t] += diskCount[t + step]; }
		workgroupBarrier();
	}
	if (t == 0u) { lanes[64u + 2u * lane + which] = select(vec4f(0.), diskSum[0] / diskCount[0], diskCount[0] > 0.); }
}
var<workgroup> carried: array<vec3f, 64>;
@compute @workgroup_size(64)
fn knotLanes(@builtin(local_invocation_index) i: u32) {
	let n = ${FLAT_LANES}u;
	var col = lanes[i].xyz;
	var carry = lanes[i].w;
	if (B.first == 1u) { col = B.base.xyz; carry = 0.; }
	let mixing = (B.flags & 1u) != 0u;
	let smudging = (B.flags & 2u) != 0u;
	// A smudging lane (draw/paint.mjs, rapier_ribbon_smudge): it takes in the color and coverage just ahead of it at its rate, the
	// first knot all of it, and carries both; the pieces move the paint under it toward what it carries.
	if (i < n && smudging) {
		// The knot's lane: a = (ahead x, y, radius, active), m = (under x, under y, value, rate).
		let a = knot[B.knotAt * 128u + 2u * i]; let m = knot[B.knotAt * 128u + 2u * i + 1u];
		let first = B.first == 1u;
		let below = lanes[64u + 2u * i + 1u]; let ahead = lanes[64u + 2u * i];
		let su = clamp(below.w, 0., 1.); let sh = clamp(ahead.w, 0., 1.);
		let thin = smoothstep(0., .2, su - sh);
		let sa = su + (sh - su) * thin;
		let sample = select(below, ahead, thin > .5);
		let k = select(m.w + (select(m.w, max(m.w, ${RIBBON_SMUDGE_LOAD}), sa > carry) - m.w) * (1. - thin), 1., first);
		if (sa > .02) {
			let sc = sample.xyz / max(sample.w, 1e-6);
			let f = select(1., k * sa / max(.02, carry + k * (sa - carry)), carry > .02 && !first);
			col = select(sc * f + col * (1. - f), mixPigment(sc, col, 1. - f), B.base.w > 0.);
		}
		carry += (sa - carry) * k;
		lanes[i] = vec4f(col, carry);
		ring[B.slot * 64u + i] = vec4f(clamp(col * m.z, vec3f(0.), vec3f(1.)), carry);
	}
	if (smudging) { return; }
	if (i < n && mixing) {
		let a = knot[B.knotAt * 128u + 2u * i]; let m = knot[B.knotAt * 128u + 2u * i + 1u];
		if (a.w > .5) {
			if (m.x > 0.) {
				let mean = lanes[64u + 2u * i];
				if (mean.w > 0.) {
					let sa = mean.w; let sc = mean.xyz / mean.w;
					if (sa > .02) { let f = m.x * clamp(sa, 0., 1.); col = select(sc * f + col * (1. - f), mixPigment(sc, col, 1. - f), B.base.w > 0.); }
				}
			}
			if (m.y > 0.) { col = select(B.base.xyz * m.y + col * (1. - m.y), mixPigment(B.base.xyz, col, 1. - m.y), B.base.w > 0.); }
		}
	}
	carried[i] = col;
	workgroupBarrier();
	if (mixing) {
		for (var sweep = 0u; sweep < 2u; sweep++) {
			let l = carried[select(i - 1u, 0u, i == 0u)]; let mm = carried[i]; let rr = carried[min(n - 1u, i + 1u)];
			workgroupBarrier();
			if (i < n) { carried[i] = (l + 2. * mm + rr) / 4.; }
			workgroupBarrier();
		}
	}
	if (i < n) {
		lanes[i] = vec4f(carried[i], carry);
		ring[B.slot * 64u + i] = vec4f(clamp(carried[i] * knot[B.knotAt * 128u + 2u * i + 1u].z, vec3f(0.), vec3f(1.)), 1.);
	}
}
`;

export function createFlatEngine(host) {
	const device = host.device, S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
	let W = host.width, H = host.height;
	let cap = device.createBuffer({label: 'Flat cap', size: W * H * 4, usage: S});
	const fit = () => { if (host.width === W && host.height === H) return; W = host.width; H = host.height; recorder.width = W; recorder.height = H; cap.destroy(); cap = device.createBuffer({label: 'Flat cap', size: W * H * 4, usage: S}); device.queue.writeBuffer(cap, 0, new Float32Array(W * H)); };
	const ring = device.createBuffer({label: 'Flat ring', size: FLAT_RING * 64 * 16, usage: S}), lanes = device.createBuffer({label: 'Flat lanes', size: 3 * 64 * 16, usage: S});
	let pieces = device.createBuffer({label: 'Flat pieces', size: 4096 * FLAT_PIECE_FLOATS * 4, usage: S}), piecesCap = 4096, base = 0;
	let knotBuf = device.createBuffer({label: 'Flat knots', size: 16 * 128 * 16, usage: S}), knotCap = 16;
	
	let tilesBuf = device.createBuffer({label: 'Flat tiles', size: 1 << 16, usage: S}), tilesCap = 1 << 14;
	let uniformBuf = device.createBuffer({label: 'Flat uniforms', size: 64 * UNIFORM_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}), uniformCap = 64 * UNIFORM_STRIDE;
	const tables = paintPigmentTables(device), {layout, piecePipe, knotPipe, samplePipe} = flatPrograms(device);
	const recorder = new FlatRecorder(W, H, host.scale);
	const ensure = n => {
		if (n <= piecesCap) return;
		const old = pieces; piecesCap = Math.max(n, piecesCap * 2);
		pieces = device.createBuffer({label: 'Flat pieces', size: piecesCap * FLAT_PIECE_FLOATS * 4, usage: S});
		const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(old, 0, pieces, 0, base * FLAT_PIECE_FLOATS * 4); device.queue.submit([enc.finish()]); old.destroy();
	};
	let box = null;
	const engine = {
		recorder,
		gpuSplit: {knot: 0, piece: 0, passes: 0},
		get scale() { return recorder.scale; }, set scale(v) { recorder.scale = v; },
		get strokeCap() { return null; }, set strokeCap(v) {}, capPile: 1, bite: 0, body: 0,
		flatKnot: k => recorder.flatKnot(k),
		drawQuad: (...args) => recorder.drawQuad(...args),
		getColor: (...args) => recorder.getColor(...args),
		drawDab: (...args) => recorder.drawDab(...args),
		begin() { fit(); base = 0; box = null; recorder.take(); device.queue.writeBuffer(cap, 0, new Float32Array(W * H)); },
		async submit({wait = true} = {}) {
			const {records, pieces: data} = recorder.take(), n = data.length / FLAT_PIECE_FLOATS;
			if (!records.length) return {ms: 0, batches: 0, pieces: 0};
			host.flush?.(); fit();
			ensure(base + n + 1);
			if (n) device.queue.writeBuffer(pieces, base * FLAT_PIECE_FLOATS * 4, data);
			const knots = records.filter(r => r.kind === 'knot');
			if (knots.length > knotCap) { knotBuf.destroy(); knotCap = knots.length * 2; knotBuf = device.createBuffer({label: 'Flat knots', size: knotCap * 128 * 16, usage: S}); }
			if (knots.length) {
				const k = new Float32Array(knots.length * 128 * 4);
				const sc = recorder.scale;
				knots.forEach((r, q) => r.lanes.forEach((l, j) => k.set([l.x * sc, l.y * sc, l.radius * sc, l.active ? 1 : 0, r.smudge ? l.pick * sc : l.pick, r.smudge ? l.feed * sc : l.feed, l.v, l.rate || 0], (q * 128 + j * 2) * 4)));
				device.queue.writeBuffer(knotBuf, 0, k);
			}
			if (records.length * UNIFORM_STRIDE > uniformCap) { uniformBuf.destroy(); uniformCap = records.length * UNIFORM_STRIDE * 2; uniformBuf = device.createBuffer({label: 'Flat uniforms', size: uniformCap, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}); }
			const uniformData = new ArrayBuffer(records.length * UNIFORM_STRIDE), enc = device.createCommandEncoder();
			const lists = [], runs = new Map();
			let words = 0;
			for (const r of records) {
				if (r.kind !== 'pieces') continue;
				let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
				for (let q = r.from; q < r.to; q++) { const o = q * FLAT_PIECE_FLOATS; x0 = Math.min(x0, data[o + 38]); y0 = Math.min(y0, data[o + 39]); x1 = Math.max(x1, data[o + 40]); y1 = Math.max(y1, data[o + 41]); }
				const w = x1 - x0 + 1, h = y1 - y0 + 1, tw = Math.ceil(w / 16), th = Math.ceil(h / 16), bins = Array.from({length: tw * th}, () => []);
				for (let q = r.from; q < r.to; q++) {
					const o = q * FLAT_PIECE_FLOATS, a = Math.floor((data[o + 38] - x0) / 16), b = Math.floor((data[o + 39] - y0) / 16), c = Math.floor((data[o + 40] - x0) / 16), d = Math.floor((data[o + 41] - y0) / 16);
					for (let ty = b; ty <= d; ty++) for (let tx = a; tx <= c; tx++) bins[ty * tw + tx].push(q - r.from);
				}
				const at = words, head = new Uint32Array(2 * bins.length); let off = 2 * bins.length;
				bins.forEach((list, k) => { head[2 * k] = off; head[2 * k + 1] = list.length; off += list.length; });
				const run = new Uint32Array(off); run.set(head); let p = 2 * bins.length; for (const list of bins) { run.set(list, p); p += list.length; }
				lists.push(run); words += off; runs.set(r, {x0, y0, w, h, at});
			}
			if (words > tilesCap) { tilesBuf.destroy(); tilesCap = words * 2; tilesBuf = device.createBuffer({label: 'Flat tiles', size: tilesCap * 4, usage: S}); }
			if (words) { const all = new Uint32Array(words); let p = 0; for (const l of lists) { all.set(l, p); p += l.length; } device.queue.writeBuffer(tilesBuf, 0, all); }
			const group = device.createBindGroup({layout, entries: [host.sheet, cap, pieces, ring, lanes, knotBuf, uniformBuf, tables, tilesBuf].map((buffer, binding) => ({binding, resource: binding === 6 ? {buffer, size: 64} : {buffer}}))});
			let kq = 0, batches = 0, frameBox = null;
			const passes = [];
			records.forEach((r, ri) => {
				const v = new Uint32Array(uniformData, ri * UNIFORM_STRIDE, 16), f = new Float32Array(uniformData, ri * UNIFORM_STRIDE, 16);
				let groups = [1, 1];
				if (r.kind === 'pieces') {
					const {x0, y0, w, h, at} = runs.get(r), x1 = x0 + w - 1, y1 = y0 + h - 1;
					v.set([W, H, x0, y0, w, h, base + r.from, r.to - r.from, 0, 0, 0, at]); groups = [Math.ceil(w / 8), Math.ceil(h / 8)];
					box = box ? {x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1)} : {x0, y0, x1, y1};
					frameBox = frameBox ? {x0: Math.min(frameBox.x0, x0), y0: Math.min(frameBox.y0, y0), x1: Math.max(frameBox.x1, x1), y1: Math.max(frameBox.y1, y1)} : {x0, y0, x1, y1};
					host.extendBox?.({x0, y0, x1, y1}); batches++;
				} else { v.set([W, H, 0, 0, 0, 0, r.first ? 1 : 0, 0, r.slot, (r.mixing ? 1 : 0) | (r.smudge ? 2 : 0), kq++, 0]); f.set([...r.base, r.pigment > 0 ? 1 : 0], 12); if (r.mixing || r.smudge) passes.push([samplePipe, ri * UNIFORM_STRIDE, [FLAT_LANES, r.smudge ? 2 : 1]]); }
				passes.push([r.kind === 'pieces' ? piecePipe : knotPipe, ri * UNIFORM_STRIDE, groups]);
			});
			device.queue.writeBuffer(uniformBuf, 0, uniformData);
			const stamps = host.timing && passes.length ? {set: device.createQuerySet({type: 'timestamp', count: 2 * passes.length}), n: 2 * passes.length} : null;
			passes.forEach(([pipe, offset, groups], pi) => { const pass = enc.beginComputePass(stamps ? {timestampWrites: {querySet: stamps.set, beginningOfPassWriteIndex: 2 * pi, endOfPassWriteIndex: 2 * pi + 1}} : undefined); pass.setPipeline(pipe); pass.setBindGroup(0, group, [offset]); pass.dispatchWorkgroups(...groups); pass.end(); });
			if (stamps) {
				stamps.resolve = device.createBuffer({size: 8 * stamps.n, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC}); stamps.read = device.createBuffer({size: 8 * stamps.n, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
				enc.resolveQuerySet(stamps.set, 0, stamps.n, stamps.resolve, 0); enc.copyBufferToBuffer(stamps.resolve, 0, stamps.read, 0, 8 * stamps.n);
			}
			const t = performance.now(); device.queue.submit([enc.finish()]);
			if (stamps) host.gpuTime(stamps.read.mapAsync(GPUMapMode.READ).then(() => {
				const q = new BigInt64Array(stamps.read.getMappedRange()); let all = 0;
				passes.forEach(([pipe], pi) => { const ns = Number(q[2 * pi + 1] - q[2 * pi]); all += ns; engine.gpuSplit[pipe === piecePipe ? 'piece' : 'knot'] += ns; });
				engine.gpuSplit.passes += passes.length;
				stamps.read.unmap(); for (const b of [stamps.read, stamps.resolve]) b.destroy(); stamps.set.destroy(); return all;
			}));
			if (!wait) { base += n; return {ms: 0, batches, pieces: n, box: frameBox}; }
			await device.queue.onSubmittedWorkDone(); const ms = performance.now() - t;
			base += n;
			return {ms, batches, pieces: n, box: frameBox};
		},
		get box() { return box; },
		destroy() { for (const b of [cap, ring, lanes, pieces, knotBuf, tilesBuf, uniformBuf]) b.destroy(); },
	};
	return engine;
}

const UNIFORM_STRIDE = 256, flatCache = new WeakMap();
function flatLayout(device) {
	return device.createBindGroupLayout({entries: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(b => ({binding: b, visibility: GPUShaderStage.COMPUTE, buffer: {type: b === 6 || b === 7 ? 'uniform' : b === 2 || b === 5 || b === 8 ? 'read-only-storage' : 'storage', ...(b === 6 ? {hasDynamicOffset: true} : {})}}))});
}
function flatPrograms(device) {
	let p = flatCache.get(device);
	if (p && p.samplePipe) return p;
	const module = p?.module || device.createShaderModule({label: 'Flat', code: FLAT_WGSL}), layout = p?.layout || flatLayout(device), pl = device.createPipelineLayout({bindGroupLayouts: [layout]});
	p = {module, layout, piecePipe: device.createComputePipeline({label: 'Flat pieces', layout: pl, compute: {module, entryPoint: 'pieceBatch'}}), knotPipe: device.createComputePipeline({label: 'Flat knot', layout: pl, compute: {module, entryPoint: 'knotLanes'}}), samplePipe: device.createComputePipeline({label: 'Flat knot sampling', layout: pl, compute: {module, entryPoint: 'knotSample'}})};
	flatCache.set(device, p); return p;
}
async function warmFlat(device) {
	if (flatCache.get(device)?.samplePipe) return true;
	const module = device.createShaderModule({label: 'Flat', code: FLAT_WGSL}), layout = flatLayout(device), pl = device.createPipelineLayout({bindGroupLayouts: [layout]});
	flatCache.set(device, {module, layout});
	const [piecePipe, knotPipe, samplePipe] = await Promise.all([['Flat pieces', 'pieceBatch'], ['Flat knot', 'knotLanes'], ['Flat knot sampling', 'knotSample']].map(([label, entryPoint]) => device.createComputePipelineAsync({label, layout: pl, compute: {module, entryPoint}})));
	if (!flatCache.get(device)?.samplePipe) flatCache.set(device, {module, layout, piecePipe, knotPipe, samplePipe});
	return true;
}

registerPaintEngine('flat', createFlatEngine, {warm: warmFlat});
