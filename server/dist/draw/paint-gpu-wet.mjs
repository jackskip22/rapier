// SPDX-License-Identifier: AGPL-3.0-only

import {paintPigmentWGSL, paintPigmentTables, registerPaintEngine} from './paint-gpu.mjs';
import {paper as makePaper, wetBytes, createWetState, setGravity} from './paper.mjs';
import {PAPER_OCTAVES} from './grain.mjs';
import {writePaintWet, paintWetRGB, writePaintRGB, readPaintRGB, PAINT_WET_CHANNELS} from './paint-pigment.mjs';
import {RAPIER_WET_FRONT, RAPIER_WET_TIDE, RAPIER_WET_RIM, RAPIER_WET_RIM_SPAN, RAPIER_WET_BELLY_MAX, RAPIER_WET_STEP_MAX} from './paint.mjs';

const W_ = 0, AMOUNT = 1, SETTLED = 2, CLOCK = 3, VX = 4, VY = 5, NEXT = 6, HEIGHT = 7, BASE = 8, PIX = 12, DEP = 16, CCOV = 17, PLANES = 18;
const CTL_WORDS = 32, PARAM_STRIDE = 256, SUB_BYTES = 128, SLOTS = 192;
const C = {wet: 0, active: 1, activeOk: 5, wetBox: 6, wetBoxOk: 10, cur: 11, curOk: 15, accWet: 16, accAct: 20, anyWet: 24, compose: 25, composeOk: 29};
const f9 = v => v.toFixed(9);

export function wetSolverWGSL(bands) {
	const digital = bands === 3;
	return paintPigmentWGSL({group: 0, binding: 4}) + `
const B = ${bands}u;
struct Wet { width: u32, height: u32, n: u32, bands: u32,
	dryingTime: f32, flow: f32, pin: f32, bleed: f32,
	backrun: f32, gx: f32, gy: f32, absorbency: f32,
	tooth: f32, granulation: f32, settling: f32, edgeDarkening: f32,
	winX0: i32, winY0: i32, winW: u32, winH: u32,
	layerW: u32, layerH: u32, cell: u32, seed: u32,
	paperTooth: f32, grain: f32, grit: f32, pad: u32, p1: u32, p2: u32, p3: u32, p4: u32 };
struct Sub { h: f32, damping: f32, parity: u32, finish: u32, x0: i32, y0: i32, x1: i32, y1: i32,
	px0: i32, py0: i32, px1: i32, py1: i32, fine: u32, coarseAt: u32, maskAt: u32, maskW: u32,
	maskH: u32, bx0: i32, by0: i32, water: f32, pigment: f32, opaque: f32, dryLift: f32, load: f32,
	spectrumAt: u32, aAt: u32, bAt: u32, flagsAt: u32, flags2At: u32, rw: u32, rh: u32, count: u32 };
@group(0) @binding(0) var<storage, read_write> cells: array<f32>;
@group(0) @binding(1) var<storage, read_write> ctl: array<atomic<i32>, ${CTL_WORDS}>;
@group(0) @binding(2) var<uniform> wet: Wet;
@group(0) @binding(3) var<uniform> sub: Sub;
// The paper's tint in the basis, relative to white (createWetState's tintLog).
@group(0) @binding(5) var<uniform> tint: array<vec4f, 11>;
@group(0) @binding(6) var<storage, read_write> rb: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> cover: array<f32>;
@group(0) @binding(8) var<storage, read_write> sheet: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> aux: array<f32>;
fn at(plane: u32, i: u32) -> f32 { return cells[plane * wet.n + i]; }
fn put(plane: u32, i: u32, v: f32) { cells[plane * wet.n + i] = v; }
fn susp(k: u32) -> u32 { return ${PLANES}u + k; }
fn sett(k: u32) -> u32 { return ${PLANES}u + B + k; }
fn ctlAt(k: u32) -> i32 { return atomicLoad(&ctl[k]); }
struct Box { x0: i32, y0: i32, x1: i32, y1: i32, ok: bool };
fn cur() -> Box { return Box(ctlAt(${C.cur}u), ctlAt(${C.cur + 1}u), ctlAt(${C.cur + 2}u), ctlAt(${C.cur + 3}u), ctlAt(${C.curOk}u) != 0); }

// paper.mjs movePhase: abs(f) of mass and every band from suspended to settled (f >= 0) or back.
fn movePhase(i: u32, fraction: f32) {
	if (fraction == 0.0) { return; }
	let forward = fraction >= 0.0;
	var fromM = ${AMOUNT}u; var intoM = ${SETTLED}u; if (!forward) { fromM = ${SETTLED}u; intoM = ${AMOUNT}u; }
	let fm = at(fromM, i); if (fm == 0.0) { return; }
	let f = abs(fraction);
	let m = fm * f; put(fromM, i, fm - m); put(intoM, i, at(intoM, i) + m);
	for (var k = 0u; k < B; k++) {
		var src = susp(k); var dst = sett(k); if (!forward) { src = sett(k); dst = susp(k); }
		let p = at(src, i) * f; put(src, i, at(src, i) - p); put(dst, i, at(dst, i) + p);
	}
}
// paper.mjs mingle: a symmetric exchange of suspended pigment between two wet cells.
fn mingle(a: u32, b: u32, h: f32) {
	let f = wet.bleed * h * 0.02;
	if (!(f > 0.0)) { return; }
	let q = min(f, 0.25); let aa = at(${AMOUNT}u, a); let ab = at(${AMOUNT}u, b);
	if (!(aa > 0.0) && !(ab > 0.0)) { return; }
	let ma = aa * q; let mb = ab * q;
	put(${AMOUNT}u, a, aa - ma + mb); put(${AMOUNT}u, b, ab - mb + ma);
	for (var k = 0u; k < B; k++) {
		let pa = at(susp(k), a) * q; let pb = at(susp(k), b) * q;
		put(susp(k), a, at(susp(k), a) + pb - pa); put(susp(k), b, at(susp(k), b) + pa - pb);
	}
}
// paper.mjs transfer, for the face between a and b whose velocity is plane vel (VX or VY) at a.
fn transfer(a: u32, b: u32, vel: u32, h: f32, damping: f32) {
	let wa = at(${W_}u, a); let wb = at(${W_}u, b);
	if (wa == 0.0 && wb == 0.0) { put(vel, a, 0.0); return; }
	if (wet.bleed != 0.0 && wa > 0.0 && wb > 0.0) { mingle(a, b, h); }
	var g = wet.gy; if (vel == ${VX}u) { g = wet.gx; }
	var pressure = wa - wb + 0.12 * (at(${HEIGHT}u, a) - at(${HEIGHT}u, b));
	if (g != 0.0) { pressure += g * (wa + wb) * 0.5; }
	let v = at(vel, a) * damping + h * 0.09 * pressure * wet.flow;
	var srcCell = b; var tgt = a; if (v > 0.0) { srcCell = a; tgt = b; }
	let available = at(${W_}u, srcCell);
	var gate = 1.0;
	if (wet.pin != 0.0 && at(${W_}u, tgt) == 0.0) {
		let u = abs(pressure) / wet.pin;
		if (u < 1.0) { gate = u * u; if (gate < 1e-4) { return; } }
	}
	let q = min(abs(v) * h * 0.02 * wet.flow, available * 0.24) * gate;
	put(vel, a, v);
	if (q == 0.0) { return; }
	let fraction = q / available; let incomingAge = at(${CLOCK}u, srcCell);
	let age = max(0.0, at(${CLOCK}u, tgt) - incomingAge) / wet.dryingTime;
	let lift = min(0.25, q * age) * wet.backrun;
	let front = min(0.95, age * 6.0) * wet.backrun;
	if (lift != 0.0 && at(${SETTLED}u, tgt) != 0.0) { movePhase(tgt, -lift); }
	let prior = at(${W_}u, tgt);
	put(${W_}u, srcCell, at(${W_}u, srcCell) - q); put(${W_}u, tgt, prior + q);
	put(${CLOCK}u, tgt, (at(${CLOCK}u, tgt) * prior + incomingAge * q) / (prior + q));
	let mass = at(${AMOUNT}u, srcCell) * fraction;
	put(${AMOUNT}u, srcCell, at(${AMOUNT}u, srcCell) - mass); put(${AMOUNT}u, tgt, at(${AMOUNT}u, tgt) + mass * (1.0 - front));
	put(${SETTLED}u, tgt, at(${SETTLED}u, tgt) + mass * front);
	for (var k = 0u; k < B; k++) {
		let p = at(susp(k), srcCell) * fraction;
		put(susp(k), srcCell, at(susp(k), srcCell) - p); put(susp(k), tgt, at(susp(k), tgt) + p * (1.0 - front)); put(sett(k), tgt, at(sett(k), tgt) + p * front);
	}
}

// ---- the substep ----
@compute @workgroup_size(1)
fn wetBegin() {
	atomicStore(&ctl[${C.curOk}u], 0);
	if (ctlAt(${C.wet}u) == 0) { return; }
	var x0 = 0; var y0 = 0; var x1 = 0; var y1 = 0;
	if (ctlAt(${C.wetBoxOk}u) != 0) { x0 = ctlAt(${C.wetBox}u); y0 = ctlAt(${C.wetBox + 1}u); x1 = ctlAt(${C.wetBox + 2}u); y1 = ctlAt(${C.wetBox + 3}u); }
	else if (ctlAt(${C.activeOk}u) != 0) { x0 = ctlAt(${C.active}u); y0 = ctlAt(${C.active + 1}u); x1 = ctlAt(${C.active + 2}u); y1 = ctlAt(${C.active + 3}u); }
	else { return; }
	x0 = max(0, x0 - 2); y0 = max(0, y0 - 2); x1 = min(i32(wet.width) - 1, x1 + 2); y1 = min(i32(wet.height) - 1, y1 + 2);
	atomicStore(&ctl[${C.cur}u], x0); atomicStore(&ctl[${C.cur + 1}u], y0); atomicStore(&ctl[${C.cur + 2}u], x1); atomicStore(&ctl[${C.cur + 3}u], y1); atomicStore(&ctl[${C.curOk}u], 1);
	if (ctlAt(${C.composeOk}u) != 0) { x0 = min(x0, ctlAt(${C.compose}u)); y0 = min(y0, ctlAt(${C.compose + 1}u)); x1 = max(x1, ctlAt(${C.compose + 2}u)); y1 = max(y1, ctlAt(${C.compose + 3}u)); }
	atomicStore(&ctl[${C.compose}u], x0); atomicStore(&ctl[${C.compose + 1}u], y0); atomicStore(&ctl[${C.compose + 2}u], x1); atomicStore(&ctl[${C.compose + 3}u], y1); atomicStore(&ctl[${C.composeOk}u], 1);
	atomicStore(&ctl[${C.accWet}u], i32(wet.width)); atomicStore(&ctl[${C.accWet + 1}u], i32(wet.height)); atomicStore(&ctl[${C.accWet + 2}u], -1); atomicStore(&ctl[${C.accWet + 3}u], -1);
	atomicStore(&ctl[${C.accAct}u], i32(wet.width)); atomicStore(&ctl[${C.accAct + 1}u], i32(wet.height)); atomicStore(&ctl[${C.accAct + 2}u], -1); atomicStore(&ctl[${C.accAct + 3}u], -1);
	atomicStore(&ctl[${C.anyWet}u], 0);
}
// x faces of one parity: (x, x + 1) for x = x0 + ((x0 + parity) % 2), x0 + 2 ... below x1, every row of the box.
@compute @workgroup_size(64)
fn wetFaceX(@builtin(global_invocation_id) g: vec3u) {
	let b = cur(); if (!b.ok) { return; }
	let x = b.x0 + ((b.x0 + i32(sub.parity)) % 2) + 2 * i32(g.x); let y = b.y0 + i32(g.y);
	if (x >= b.x1 || y > b.y1) { return; }
	let i = u32(y) * wet.width + u32(x);
	transfer(i, i + 1u, ${VX}u, sub.h, sub.damping);
}
@compute @workgroup_size(64)
fn wetFaceY(@builtin(global_invocation_id) g: vec3u) {
	let b = cur(); if (!b.ok) { return; }
	let x = b.x0 + i32(g.x); let y = b.y0 + ((b.y0 + i32(sub.parity)) % 2) + 2 * i32(g.y);
	if (x > b.x1 || y >= b.y1) { return; }
	let i = u32(y) * wet.width + u32(x);
	transfer(i, i + wet.width, ${VY}u, sub.h, sub.damping);
}
fn face(v: f32, water: f32) -> f32 {
	var r = 0.0; if (water > 0.0) { r = v / water; }
	var u = (0.7 - r) / 0.4; if (r >= 0.7) { u = 0.0; } else if (r <= 0.3) { u = 1.0; }
	return u * u * (3.0 - 2.0 * u);
}
@compute @workgroup_size(64)
fn wetEvaporate(@builtin(global_invocation_id) g: vec3u) {
	let b = cur(); if (!b.ok) { return; }
	let x = b.x0 + i32(g.x); let y = b.y0 + i32(g.y);
	if (x > b.x1 || y > b.y1) { return; }
	let W = wet.width; let i = u32(y) * W + u32(x); let water = at(${W_}u, i);
	var edge = 0.0;
	if (x == 0) { edge += 1.0; } else { edge += face(at(${W_}u, i - 1u), water); }
	if (u32(x) + 1u == W) { edge += 1.0; } else { edge += face(at(${W_}u, i + 1u), water); }
	if (y == 0) { edge += 1.0; } else { edge += face(at(${W_}u, i - W), water); }
	if (u32(y) + 1u == wet.height) { edge += 1.0; } else { edge += face(at(${W_}u, i + W), water); }
	put(${NEXT}u, i, water - min(water, sub.h / wet.dryingTime * (0.35 + wet.absorbency * 0.65) * (1.0 + edge * 2.0 * wet.edgeDarkening)));
}
@compute @workgroup_size(64)
fn wetCapture(@builtin(global_invocation_id) g: vec3u) {
	let b = cur(); if (!b.ok) { return; }
	let x = b.x0 + i32(g.x); let y = b.y0 + i32(g.y);
	if (x > b.x1 || y > b.y1) { return; }
	let i = u32(y) * wet.width + u32(x);
	if (at(${W_}u, i) > 0.0) {
		let w = at(${NEXT}u, i); put(${W_}u, i, w);
		let valley = wet.tooth - at(${HEIGHT}u, i);
		var capture = 1.0;
		if (w != 0.0) { capture = 1.0 - exp(-sub.h / wet.dryingTime * (0.1 * wet.settling + wet.granulation * valley * 24.0) / (0.12 + w)); }
		movePhase(i, capture); put(${CLOCK}u, i, at(${CLOCK}u, i) + sub.h);
	}
	if (at(${W_}u, i) > 0.0) {
		atomicStore(&ctl[${C.anyWet}u], 1);
		atomicMin(&ctl[${C.accWet}u], x); atomicMin(&ctl[${C.accWet + 1}u], y); atomicMax(&ctl[${C.accWet + 2}u], x); atomicMax(&ctl[${C.accWet + 3}u], y);
	}
	if (at(${W_}u, i) > 0.0 || at(${AMOUNT}u, i) + at(${SETTLED}u, i) > 0.0) {
		atomicMin(&ctl[${C.accAct}u], x); atomicMin(&ctl[${C.accAct + 1}u], y); atomicMax(&ctl[${C.accAct + 2}u], x); atomicMax(&ctl[${C.accAct + 3}u], y);
	}
}
// The substep's end: the active rectangle grows by what this step found; the wet box is where water now is.
@compute @workgroup_size(1)
fn wetEnd() {
	if (ctlAt(${C.curOk}u) == 0) { return; }
	if (ctlAt(${C.accAct + 2}u) >= 0) {
		var x0 = ctlAt(${C.accAct}u); var y0 = ctlAt(${C.accAct + 1}u); var x1 = ctlAt(${C.accAct + 2}u); var y1 = ctlAt(${C.accAct + 3}u);
		if (ctlAt(${C.activeOk}u) != 0) { x0 = min(x0, ctlAt(${C.active}u)); y0 = min(y0, ctlAt(${C.active + 1}u)); x1 = max(x1, ctlAt(${C.active + 2}u)); y1 = max(y1, ctlAt(${C.active + 3}u)); }
		atomicStore(&ctl[${C.active}u], x0); atomicStore(&ctl[${C.active + 1}u], y0); atomicStore(&ctl[${C.active + 2}u], x1); atomicStore(&ctl[${C.active + 3}u], y1); atomicStore(&ctl[${C.activeOk}u], 1);
	}
	if (ctlAt(${C.accWet + 2}u) >= 0) {
		for (var k = 0u; k < 4u; k++) { atomicStore(&ctl[${C.wetBox}u + k], ctlAt(${C.accWet}u + k)); }
		atomicStore(&ctl[${C.wetBoxOk}u], 1);
	} else { atomicStore(&ctl[${C.wetBoxOk}u], 0); }
	atomicStore(&ctl[${C.wet}u], ctlAt(${C.anyWet}u));
}

// ---- the projection (paper.mjs settleWork, non-film): each cell's RGBA from its pigment over its base ----
// toSpectral is writePaintWet (K/S of the colour on the 1/1023 grid, plus the exact residual) and fromSpectral
// paintWetRGB; in Digital mode both are the identity on RGB.
fn tintAt(k: u32) -> f32 { return tint[k / 4u][k % 4u]; }
@compute @workgroup_size(8, 8)
fn wetSettle(@builtin(global_invocation_id) g: vec3u) {
	let x = sub.x0 + i32(g.x); let y = sub.y0 + i32(g.y);
	if (x > sub.x1 || y > sub.y1) { return; }
	let i = u32(y) * wet.width + u32(x);
	if (sub.finish != 0u) { movePhase(i, 1.0); put(${W_}u, i, 0.0); put(${VX}u, i, 0.0); put(${VY}u, i, 0.0); }
	let base = vec4f(at(${BASE}u, i), at(${BASE + 1}u, i), at(${BASE + 2}u, i), at(${BASE + 3}u, i));
	let mass = at(${AMOUNT}u, i) + at(${SETTLED}u, i);
	var px = base;
	if (mass > 0.0) {
		let alpha = 1.0 - exp(-mass); let ba = base.a * (1.0 - alpha); let o = alpha + ba;
		if (o > 0.0) {
			var rgb = vec3f(0.0);
${digital ? `			var ground = vec3f(0.0); if (ba != 0.0) { ground = base.rgb / base.a; }
			for (var c = 0u; c < 3u; c++) {
				var m = (at(susp(c), i) + at(sett(c), i)) / mass;
				m = (m + tintAt(c)) * alpha / o;
				if (ba != 0.0) { m += ground[c] * ba / o; }
				rgb[c] = m;
			}` : `			var gb = Basis(0.0, vec4f(0.0), vec2f(0.0)); var gres = vec3f(0.0);
			if (ba != 0.0) {
				let c = base.rgb / base.a; let q = round(clamp(c, vec3f(0.0), vec3f(1.0)) * 1023.0) / 1023.0;
				gb = basisOf(q); var dec = vec3f(0.0);
				for (var k = 0u; k < BANDS; k++) { dec += ksRefl(gb, k).y * display(k); }
				gres = c - dec;
			}
			for (var k = 0u; k < BANDS; k++) {
				var m = (at(susp(k), i) + at(sett(k), i)) / mass;
				m = (m + tintAt(k)) * alpha / o;
				if (ba != 0.0) { m += ksBand(gb, k) * ba / o; }
				rgb += reflOf(max(0.0, m)) * display(k);
			}
			for (var c = 0u; c < 3u; c++) {
				let k = BANDS + c;
				var m = (at(susp(k), i) + at(sett(k), i)) / mass;
				m = (m + tintAt(k)) * alpha / o;
				if (ba != 0.0) { m += gres[c] * ba / o; }
				rgb[c] += m;
			}`}
			rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
			px = vec4f(rgb * o, o);
		}
	}
	put(${PIX}u, i, px.r); put(${PIX + 1}u, i, px.g); put(${PIX + 2}u, i, px.b); put(${PIX + 3}u, i, px.a);
}

// ---- a dab (paint.mjs drawWetDab, paper.mjs deposit): its mask box-filtered onto the cells (aux at coarseAt) ----
@compute @workgroup_size(8, 8)
fn wetDeposit(@builtin(global_invocation_id) g: vec3u) {
	let cw = u32(sub.x1 - sub.x0 + 1);
	if (g.x >= cw || i32(g.y) > sub.y1 - sub.y0) { return; }
	let m = aux[sub.coarseAt + g.y * cw + g.x];
	let i = u32(sub.y0 + i32(g.y)) * wet.width + u32(sub.x0 + i32(g.x));
	// What each cell was given directly (the compose tells flowed-in pigment from deposited).
	put(${DEP}u, i, at(${DEP}u, i) + m * sub.load);
	let a = m * sub.opaque; if (a == 0.0) { return; }
	let fresh = sub.water * a; let load = sub.pigment * a; let old = at(${W_}u, i); let clock = at(${CLOCK}u, i);
	var lift = 0.0;
	if (old > 0.0) { lift = min(0.95, fresh * clock / wet.dryingTime * 6.0); } else { lift = min(sub.dryLift, sub.water * sub.opaque * clock / wet.dryingTime * 6.0); }
	movePhase(i, -lift * wet.backrun);
	put(${CLOCK}u, i, at(${CLOCK}u, i) * (old / (old + fresh))); put(${W_}u, i, old + fresh); put(${AMOUNT}u, i, at(${AMOUNT}u, i) + load);
	if (load != 0.0) { for (var k = 0u; k < B; k++) { put(susp(k), i, at(susp(k), i) + load * aux[sub.spectrumAt + k]); } }
}
// The dab's cells join the active and wet rectangles; the paper is wet.
@compute @workgroup_size(1)
fn wetTouch() {
	for (var k = 0u; k < 2u; k++) {
		var at0 = ${C.active}u; var ok = ${C.activeOk}u; if (k == 1u) { at0 = ${C.wetBox}u; ok = ${C.wetBoxOk}u; }
		var x0 = sub.x0; var y0 = sub.y0; var x1 = sub.x1; var y1 = sub.y1;
		if (ctlAt(ok) != 0) { x0 = min(x0, ctlAt(at0)); y0 = min(y0, ctlAt(at0 + 1u)); x1 = max(x1, ctlAt(at0 + 2u)); y1 = max(y1, ctlAt(at0 + 3u)); }
		atomicStore(&ctl[at0], x0); atomicStore(&ctl[at0 + 1u], y0); atomicStore(&ctl[at0 + 2u], x1); atomicStore(&ctl[at0 + 3u], y1); atomicStore(&ctl[ok], 1);
	}
	atomicStore(&ctl[${C.wet}u], 1);
}
// The fine coverage plane: the dab's own mask (aux at maskAt, maskW x maskH from window pixel bx0, by0), max with what is there,
// where the pixel's cell is one of the dab's.
@compute @workgroup_size(8, 8)
fn wetCover(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= sub.maskW || g.y >= sub.maskH) { return; }
	let wx = sub.bx0 + i32(g.x); let wy = sub.by0 + i32(g.y); let C = i32(wet.cell);
	let cx = wx / C; let cy = wy / C;
	if (wx < 0 || wy < 0 || cx < sub.x0 || cx > sub.x1 || cy < sub.y0 || cy > sub.y1) { return; }
	let m = aux[sub.maskAt + g.y * sub.maskW + g.x];
	let j = u32(wy) * wet.winW + u32(wx);
	if (m > cover[j]) { cover[j] = m; }
}

// ---- the compose (paint.mjs _wetComposeWork): the cells' wet delta over the sharp raster base ----
// The cell's own coverage: the mean of the fine plane over it.
@compute @workgroup_size(8, 8)
fn wetCellCover(@builtin(global_invocation_id) g: vec3u) {
	let cx = sub.x0 + i32(g.x); let cy = sub.y0 + i32(g.y);
	if (cx > sub.x1 || cy > sub.y1) { return; }
	let C = wet.cell; var sum = 0.0; var n = 0.0;
	for (var y = 0u; y < C; y++) { let yy = u32(cy) * C + y; if (yy >= wet.winH) { break; } for (var x = 0u; x < C; x++) { let xx = u32(cx) * C + x; if (xx >= wet.winW) { break; } sum += cover[yy * wet.winW + xx]; n += 1.0; } }
	var v = 0.0; if (n > 0.0) { v = sum / n; }
	put(${CCOV}u, u32(cy) * wet.width + u32(cx), v);
}
fn cellOf(cx: i32, cy: i32) -> u32 { return u32(clamp(cy, 0, i32(wet.height) - 1)) * wet.width + u32(clamp(cx, 0, i32(wet.width) - 1)); }
fn delta(cx: i32, cy: i32, c: u32) -> f32 { let o = cellOf(cx, cy); return at(${PIX}u + c, o) - at(${BASE}u + c, o); }
fn coverAt(cx: i32, cy: i32) -> f32 { return at(${CCOV}u, cellOf(cx, cy)); }
fn floorAt(cx: i32, cy: i32) -> f32 { let o = cellOf(cx, cy); let mass = at(${AMOUNT}u, o) + at(${SETTLED}u, o); let own = min(at(${DEP}u, o), mass); return min(1.0, (mass - own) / 0.03); }
fn rimAt(cx: i32, cy: i32) -> f32 {
	let aC = delta(cx, cy, 3u); let slope = abs(delta(cx + 1, cy, 3u) - aC) + abs(delta(cx, cy + 1, 3u) - aC);
	if (slope > ${f9(RAPIER_WET_FRONT)}) { return min(1.0, slope / ${f9(RAPIER_WET_FRONT * RAPIER_WET_RIM_SPAN)}); }
	return 0.0;
}
// paper.mjs toothAt, at a point in paper coordinates.
fn hash(seed: u32, x: i32, y: i32) -> f32 {
	var n = seed ^ bitcast<u32>(x * 374761393) ^ bitcast<u32>(y * 668265263);
	n = (n ^ (n >> 13u)) * 1274126177u;
	return f32(n ^ (n >> 16u)) / 4294967295.0;
}
fn noise(seed: u32, x: f32, y: f32, size: f32) -> f32 {
	let fx = x / size; let fy = y / size; let ix = floor(fx); let iy = floor(fy);
	var a = fx - ix; var b = fy - iy; a = a * a * (3.0 - 2.0 * a); b = b * b * (3.0 - 2.0 * b);
	let X = i32(ix); let Y = i32(iy);
	let n0 = hash(seed, X, Y); let n1 = hash(seed, X + 1, Y); let n2 = hash(seed, X, Y + 1); let n3 = hash(seed, X + 1, Y + 1);
	return (n0 + (n1 - n0) * a) * (1.0 - b) + (n2 + (n3 - n2) * a) * b;
}
fn toothAt(x: f32, y: f32) -> f32 {
	return wet.paperTooth * (${PAPER_OCTAVES.map(([S, W, M]) => `${f9(W)} * noise(wet.seed ^ ${M}u, x, y, ${S}.0 * wet.grain)`).join(' + ')});
}
// The rim's share over the pixels about to be composed: partial sums a workgroup (front, belly) into aux at aAt.
var<workgroup> rimSums: array<vec2f, 64>;
@compute @workgroup_size(8, 8)
fn wetRimSum(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) l: u32, @builtin(workgroup_id) wg: vec3u) {
	var s = vec2f(0.0);
	let x = sub.px0 + i32(g.x); let y = sub.py0 + i32(g.y);
	if (x <= sub.px1 && y <= sub.py1 && wet.winY0 + y < i32(wet.layerH) && wet.winX0 + x < i32(wet.layerW)) {
		let C = f32(wet.cell);
		let cx0 = i32(floor((f32(x) + 0.5) / C - 0.5)); let cy0 = i32(floor((f32(y) + 0.5) / C - 0.5));
		let da = abs(delta(cx0, cy0, 3u));
		if (da > 0.0) { let rk = rimAt(cx0, cy0); s = vec2f(da * rk, da * (1.0 - rk)); }
	}
	rimSums[l] = s; workgroupBarrier();
	for (var k = 32u; k > 0u; k >>= 1u) { if (l < k) { rimSums[l] += rimSums[l + k]; } workgroupBarrier(); }
	if (l == 0u) { let w = wg.y * ((sub.rw + 7u) / 8u) + wg.x; aux[sub.aAt + w * 2u] = rimSums[0].x; aux[sub.aAt + w * 2u + 1u] = rimSums[0].y; }
}
var<workgroup> rimTotal: array<vec2f, 256>;
@compute @workgroup_size(256)
fn wetRimTotal(@builtin(local_invocation_index) l: u32) {
	var s = vec2f(0.0);
	for (var k = l; k < sub.count; k += 256u) { s += vec2f(aux[sub.aAt + k * 2u], aux[sub.aAt + k * 2u + 1u]); }
	rimTotal[l] = s; workgroupBarrier();
	for (var k = 128u; k > 0u; k >>= 1u) { if (l < k) { rimTotal[l] += rimTotal[l + k]; } workgroupBarrier(); }
	if (l == 0u) { var belly = 0.0; if (rimTotal[0].y > 1e-6) { belly = min(${f9(RAPIER_WET_BELLY_MAX)}, ${f9(RAPIER_WET_RIM)} * rimTotal[0].x / rimTotal[0].y); } aux[sub.bAt] = belly; }
}
@compute @workgroup_size(8, 8)
fn wetCompose(@builtin(global_invocation_id) g: vec3u) {
	let x = sub.px0 + i32(g.x); let y = sub.py0 + i32(g.y);
	if (x > sub.px1 || y > sub.py1) { return; }
	let sx = wet.winX0 + x; let sy = wet.winY0 + y;
	if (sy >= i32(wet.layerH) || sx >= i32(wet.layerW)) { return; }
	let C = f32(wet.cell);
	let fx = (f32(x) + 0.5) / C - 0.5; let fy = (f32(y) + 0.5) / C - 0.5;
	let cx0 = i32(floor(fx)); let cy0 = i32(floor(fy)); let tx = fx - f32(cx0); let ty = fy - f32(cy0);
	let i = u32(sy) * wet.layerW + u32(sx); let j = u32(y) * wet.winW + u32(x);
	let base = rb[j];
	var D = base;
	let still = all(vec4f(delta(cx0, cy0, 0u), delta(cx0, cy0, 1u), delta(cx0, cy0, 2u), delta(cx0, cy0, 3u)) == vec4f(0.0)) && all(vec4f(delta(cx0 + 1, cy0, 0u), delta(cx0 + 1, cy0, 1u), delta(cx0 + 1, cy0, 2u), delta(cx0 + 1, cy0, 3u)) == vec4f(0.0))
		&& all(vec4f(delta(cx0, cy0 + 1, 0u), delta(cx0, cy0 + 1, 1u), delta(cx0, cy0 + 1, 2u), delta(cx0, cy0 + 1, 3u)) == vec4f(0.0)) && all(vec4f(delta(cx0 + 1, cy0 + 1, 0u), delta(cx0 + 1, cy0 + 1, 1u), delta(cx0 + 1, cy0 + 1, 2u), delta(cx0 + 1, cy0 + 1, 3u)) == vec4f(0.0));
	if (!still) {
		let cc = (coverAt(cx0, cy0) * (1.0 - tx) + coverAt(cx0 + 1, cy0) * tx) * (1.0 - ty) + (coverAt(cx0, cy0 + 1) * (1.0 - tx) + coverAt(cx0 + 1, cy0 + 1) * tx) * ty;
		var gm = 1.0;
		if (cc > 0.02) {
			let fl = (floorAt(cx0, cy0) * (1.0 - tx) + floorAt(cx0 + 1, cy0) * tx) * (1.0 - ty) + (floorAt(cx0, cy0 + 1) * (1.0 - tx) + floorAt(cx0 + 1, cy0 + 1) * tx) * ty;
			let masked = max(fl, min(1.0, cover[j] / cc)); let k = min(1.0, (cc - 0.02) / 0.06); gm = 1.0 + k * (masked - 1.0);
		}
		var gc = 1.0; var edge = 1.0; var rim = 1.0;
		if (sub.fine != 0u && wet.grit != 0.0) {
			let half = wet.paperTooth / 2.0;
			let t = toothAt(f32(wet.winX0 + x) / C, f32(wet.winY0 + y) / C);
			var hd = half; if (hd == 0.0) { hd = 1.0; }
			gc = max(0.72, min(1.28, 1.0 + wet.grit * (half - t) / hd));
			let aC = delta(cx0, cy0, 3u); let aX = delta(cx0 + 1, cy0, 3u); let aY = delta(cx0, cy0 + 1, 3u);
			let slope = abs(aX - aC) + abs(aY - aC);
			if (slope > ${f9(RAPIER_WET_FRONT)}) {
				let k = min(1.0, (slope - ${f9(RAPIER_WET_FRONT)}) / ${f9(RAPIER_WET_FRONT)});
				var td = wet.paperTooth; if (td == 0.0) { td = 1.0; }
				edge = 1.0 + k * ${f9(RAPIER_WET_TIDE)} * (2.0 * (t / td) - 1.0);
			}
			let rk = min(1.0, slope / ${f9(RAPIER_WET_FRONT * RAPIER_WET_RIM_SPAN)});
			rim = 1.0 + ${f9(RAPIER_WET_RIM)} * rk - aux[sub.bAt] * (1.0 - rk);
		}
		for (var c = 0u; c < 4u; c++) {
			let d = (delta(cx0, cy0, c) * (1.0 - tx) + delta(cx0 + 1, cy0, c) * tx) * (1.0 - ty) + (delta(cx0, cy0 + 1, c) * (1.0 - tx) + delta(cx0 + 1, cy0 + 1, c) * tx) * ty;
			var k = 1.0; if (c < 3u) { k = gc; }
			D[c] = base[c] + d * gm * edge * rim * k;
		}
	}
	D = clamp(D, vec4f(0.0), vec4f(1.0));
	if (D.a > 0.0) { D = vec4f(min(D.rgb, vec3f(D.a)), D.a); }
	sheet[i] = D;
}

// ---- the front smoothed in the solver's cells (paint.mjs _wetSmoothCellsWork), over cells x0..x1, y0..y1 ----
fn sIndex(x: i32, y: i32) -> u32 { let w = sub.x1 - sub.x0 + 1; let h = sub.y1 - sub.y0 + 1; return u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)); }
@compute @workgroup_size(8, 8)
fn wetSmoothRead(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.x1 - sub.x0 + 1; let h = sub.y1 - sub.y0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let o = u32(sub.y0 + i32(g.y)) * wet.width + u32(sub.x0 + i32(g.x)); let j = sIndex(i32(g.x), i32(g.y));
	for (var c = 0u; c < 4u; c++) { aux[sub.aAt + j * 4u + c] = at(${PIX}u + c, o) - at(${BASE}u + c, o); }
}
@compute @workgroup_size(8, 8)
fn wetSmoothBand(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.x1 - sub.x0 + 1; let h = sub.y1 - sub.y0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	var lo = 1.0; var hi = -1.0;
	for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { let v = aux[sub.aAt + sIndex(i32(g.x) + dx, i32(g.y) + dy) * 4u + 3u]; lo = min(lo, v); hi = max(hi, v); } }
	var band = 0.0; if (hi - lo >= 0.04) { band = 1.0; }
	aux[sub.flagsAt + sIndex(i32(g.x), i32(g.y))] = band;
}
// One 1-2-1 pass over the band, from aAt into bAt (count 0) or back (count 1); off the band the value is carried.
@compute @workgroup_size(8, 8)
fn wetSmoothAverage(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.x1 - sub.x0 + 1; let h = sub.y1 - sub.y0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	var src = sub.aAt; var dst = sub.bAt; if (sub.count == 1u) { src = sub.bAt; dst = sub.aAt; }
	let j = sIndex(i32(g.x), i32(g.y));
	for (var c = 0u; c < 4u; c++) {
		var v = aux[src + j * 4u + c];
		if (aux[sub.flagsAt + j] != 0.0) {
			var sum = 0.0;
			for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { var wgt = 1.0; if (dx == 0) { wgt *= 2.0; } if (dy == 0) { wgt *= 2.0; } sum += aux[src + sIndex(i32(g.x) + dx, i32(g.y) + dy) * 4u + c] * wgt; } }
			v = sum / 16.0;
		}
		aux[dst + j * 4u + c] = v;
	}
}
@compute @workgroup_size(8, 8)
fn wetSmoothWrite(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.x1 - sub.x0 + 1; let h = sub.y1 - sub.y0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let j = sIndex(i32(g.x), i32(g.y));
	if (aux[sub.flagsAt + j] == 0.0) { return; }
	let o = u32(sub.y0 + i32(g.y)) * wet.width + u32(sub.x0 + i32(g.x));
	var P = vec4f(0.0);
	for (var c = 0u; c < 4u; c++) { P[c] = clamp(at(${BASE}u + c, o) + aux[sub.aAt + j * 4u + c], 0.0, 1.0); }
	if (P.a > 0.0) { P = vec4f(min(P.rgb, vec3f(P.a)), P.a); }
	for (var c = 0u; c < 4u; c++) { put(${PIX}u + c, o, P[c]); }
}

// ---- the wash's edge rounded at the keep (paint.mjs _wetFinishWork), over window pixels px0..px1, py0..py1 ----
fn fIndex(x: i32, y: i32) -> u32 { let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1; return u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)); }
fn cellWet(cx: i32, cy: i32) -> bool {
	if (cx < 0 || cy < 0 || cx >= i32(wet.width) || cy >= i32(wet.height)) { return false; }
	let o = u32(cy) * wet.width + u32(cx);
	return at(${AMOUNT}u, o) + at(${SETTLED}u, o) > 1e-6 || at(${DEP}u, o) > 1e-6;
}
@compute @workgroup_size(8, 8)
fn wetFinishRead(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let sx = wet.winX0 + sub.px0 + i32(g.x); let sy = wet.winY0 + sub.py0 + i32(g.y);
	var v = vec4f(0.0);
	if (sx < i32(wet.layerW) && sy < i32(wet.layerH)) { v = sheet[u32(sy) * wet.layerW + u32(sx)]; }
	let j = fIndex(i32(g.x), i32(g.y));
	for (var c = 0u; c < 4u; c++) { aux[sub.aAt + j * 4u + c] = v[c]; }
}
// The front: where alpha disagrees across a pixel's neighbours, within a cell of a wet cell.
@compute @workgroup_size(8, 8)
fn wetFinishEdge(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let C = i32(wet.cell); let j = fIndex(i32(g.x), i32(g.y));
	let gx0 = sub.px0 / C; let gy0 = sub.py0 / C; let gx1 = (sub.px0 + w - 1) / C; let gy1 = (sub.py0 + h - 1) / C;
	let cx = (sub.px0 + i32(g.x)) / C; let cy = (sub.py0 + i32(g.y)) / C;
	var near = false;
	for (var ny = max(gy0, cy - 1); ny <= min(gy1, cy + 1); ny++) { for (var nx = max(gx0, cx - 1); nx <= min(gx1, cx + 1); nx++) { if (cellWet(nx, ny)) { near = true; } } }
	var edge = 0.0;
	if (near) {
		var lo = 1.0; var hi = 0.0;
		for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { let v = aux[sub.aAt + fIndex(i32(g.x) + dx, i32(g.y) + dy) * 4u + 3u]; lo = min(lo, v); hi = max(hi, v); } }
		if (hi - lo >= 0.06) { edge = 1.0; }
	}
	aux[sub.flagsAt + j] = edge;
}
// The band: a wet pixel with a front within a cell of it.
@compute @workgroup_size(8, 8)
fn wetFinishBand(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let C = i32(wet.cell); var band = 0.0;
	if (cellWet((sub.px0 + i32(g.x)) / C, (sub.py0 + i32(g.y)) / C)) {
		for (var dy = -C; dy <= C; dy++) { for (var dx = -C; dx <= C; dx++) {
			let yy = i32(g.y) + dy; let xx = i32(g.x) + dx;
			if (yy >= 0 && yy < h && xx >= 0 && xx < w && aux[sub.flagsAt + u32(yy * w + xx)] != 0.0) { band = 1.0; }
		} }
	}
	aux[sub.flags2At + fIndex(i32(g.x), i32(g.y))] = band;
}
@compute @workgroup_size(8, 8)
fn wetFinishAverage(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	var src = sub.aAt; var dst = sub.bAt; if (sub.count == 1u) { src = sub.bAt; dst = sub.aAt; }
	let j = fIndex(i32(g.x), i32(g.y));
	for (var c = 0u; c < 4u; c++) {
		var v = aux[src + j * 4u + c];
		if (aux[sub.flags2At + j] != 0.0) {
			var sum = 0.0;
			for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { var wgt = 1.0; if (dx == 0) { wgt *= 2.0; } if (dy == 0) { wgt *= 2.0; } sum += aux[src + fIndex(i32(g.x) + dx, i32(g.y) + dy) * 4u + c] * wgt; } }
			v = sum / 16.0;
		}
		aux[dst + j * 4u + c] = v;
	}
}
@compute @workgroup_size(8, 8)
fn wetFinishWrite(@builtin(global_invocation_id) g: vec3u) {
	let w = sub.px1 - sub.px0 + 1; let h = sub.py1 - sub.py0 + 1;
	if (i32(g.x) >= w || i32(g.y) >= h) { return; }
	let j = fIndex(i32(g.x), i32(g.y));
	if (aux[sub.flags2At + j] == 0.0) { return; }
	let sx = wet.winX0 + sub.px0 + i32(g.x); let sy = wet.winY0 + sub.py0 + i32(g.y);
	if (sx >= i32(wet.layerW) || sy >= i32(wet.layerH)) { return; }
	var D = vec4f(0.0);
	for (var c = 0u; c < 4u; c++) { D[c] = clamp(aux[sub.bAt + j * 4u + c], 0.0, 1.0); }
	if (D.a > 0.0) { D = vec4f(min(D.rgb, vec3f(D.a)), D.a); }
	sheet[u32(sy) * wet.layerW + u32(sx)] = D;
}
`;
}

const REWINDOW_WGSL = `
struct Move { oldW: u32, oldH: u32, newW: u32, newH: u32, dx: i32, dy: i32, planes: u32, cell: u32,
	oldWinW: u32, oldWinH: u32, newWinW: u32, newWinH: u32, pdx: i32, pdy: i32, layerW: u32, layerH: u32,
	winX0: i32, winY0: i32, carry: u32, pad: u32 };
@group(0) @binding(0) var<storage, read> oldCells: array<f32>;
@group(0) @binding(1) var<storage, read_write> newCells: array<f32>;
@group(0) @binding(2) var<storage, read> oldRb: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> newRb: array<vec4f>;
@group(0) @binding(4) var<storage, read> oldCover: array<f32>;
@group(0) @binding(5) var<storage, read_write> newCover: array<f32>;
@group(0) @binding(6) var<storage, read> sheet: array<vec4f>;
@group(0) @binding(7) var<uniform> mv: Move;
fn kept(x: i32, y: i32) -> bool { return mv.carry != 0u && x >= mv.dx && y >= mv.dy && x < mv.dx + i32(mv.oldW) && y < mv.dy + i32(mv.oldH); }
@compute @workgroup_size(8, 8)
fn moveCells(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= mv.newW || g.y >= mv.newH) { return; }
	let x = i32(g.x); let y = i32(g.y);
	if (!kept(x, y)) { return; }
	let i = g.y * mv.newW + g.x; let o = u32(y - mv.dy) * mv.oldW + u32(x - mv.dx);
	let nN = mv.newW * mv.newH; let oN = mv.oldW * mv.oldH;
	for (var p = 0u; p < mv.planes; p++) { if (p == ${HEIGHT}u || p == ${CCOV}u) { continue; } newCells[p * nN + i] = oldCells[p * oN + o]; }
}
@compute @workgroup_size(8, 8)
fn moveRaster(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= mv.newWinW || g.y >= mv.newWinH) { return; }
	let j = g.y * mv.newWinW + g.x; let x = i32(g.x) - mv.pdx; let y = i32(g.y) - mv.pdy;
	if (mv.carry != 0u && x >= 0 && y >= 0 && x < i32(mv.oldWinW) && y < i32(mv.oldWinH)) { let o = u32(y) * mv.oldWinW + u32(x); newRb[j] = oldRb[o]; newCover[j] = oldCover[o]; return; }
	let sx = mv.winX0 + i32(g.x); let sy = mv.winY0 + i32(g.y);
	var v = vec4f(0.0); if (sx < i32(mv.layerW) && sy < i32(mv.layerH)) { v = sheet[u32(sy) * mv.layerW + u32(sx)]; }
	newRb[j] = v; newCover[j] = 0.0;
}
// _wetDownsample: a new cell's pixels (and base) are the mean of the raster base over it, zero-filled edges included.
@compute @workgroup_size(8, 8)
fn moveDownsample(@builtin(global_invocation_id) g: vec3u) {
	if (g.x >= mv.newW || g.y >= mv.newH) { return; }
	if (kept(i32(g.x), i32(g.y))) { return; }
	let C = mv.cell; var s = vec4f(0.0); var n = 0.0;
	for (var y = 0u; y < C; y++) { let py = g.y * C + y; if (py >= mv.newWinH) { break; } for (var x = 0u; x < C; x++) { let px = g.x * C + x; if (px >= mv.newWinW) { break; } s += newRb[py * mv.newWinW + px]; n += 1.0; } }
	if (n > 0.0) { s /= n; }
	let i = g.y * mv.newW + g.x; let nN = mv.newW * mv.newH;
	for (var c = 0u; c < 4u; c++) { newCells[(${BASE}u + c) * nN + i] = s[c]; newCells[(${PIX}u + c) * nN + i] = s[c]; }
}
`;

const programs = new WeakMap(), warming = new WeakMap();
const WET_PASSES = ['wetBegin', 'wetFaceX', 'wetFaceY', 'wetEvaporate', 'wetCapture', 'wetEnd', 'wetSettle', 'wetDeposit', 'wetTouch', 'wetCover', 'wetCellCover', 'wetRimSum', 'wetRimTotal', 'wetCompose',
	'wetSmoothRead', 'wetSmoothBand', 'wetSmoothAverage', 'wetSmoothWrite', 'wetFinishRead', 'wetFinishEdge', 'wetFinishBand', 'wetFinishAverage', 'wetFinishWrite'];
const MOVE_PASSES = ['moveCells', 'moveRaster', 'moveDownsample'];
const programsOf = device => { let byBands = programs.get(device); if (!byBands) programs.set(device, byBands = new Map()); return byBands; };
function buildPrograms(device, bands, pipeline) {
	const module = device.createShaderModule({label: 'Paint wet', code: wetSolverWGSL(bands)});
	const S = GPUShaderStage.COMPUTE, entry = (binding, type, dyn = false) => ({binding, visibility: S, buffer: {type, ...(dyn ? {hasDynamicOffset: true} : {})}});
	const layout = device.createBindGroupLayout({entries: [entry(0, 'storage'), entry(1, 'storage'), entry(2, 'uniform'), entry(3, 'uniform', true), entry(4, 'uniform'), entry(5, 'uniform'),
		entry(6, 'storage'), entry(7, 'storage'), entry(8, 'storage'), entry(9, 'storage')]});
	const pipelineLayout = device.createPipelineLayout({bindGroupLayouts: [layout]});
	const moveModule = device.createShaderModule({label: 'Paint wet rewindow', code: REWINDOW_WGSL});
	const moveLayout = device.createBindGroupLayout({entries: [entry(0, 'read-only-storage'), entry(1, 'storage'), entry(2, 'read-only-storage'), entry(3, 'storage'), entry(4, 'read-only-storage'), entry(5, 'storage'), entry(6, 'read-only-storage'), entry(7, 'uniform')]});
	const movePipeline = device.createPipelineLayout({bindGroupLayouts: [moveLayout]});
	const p = {module, layout, moveModule, moveLayout}, made = [];
	for (const name of WET_PASSES) made.push([name, pipeline({label: 'Paint wet ' + name, layout: pipelineLayout, compute: {module, entryPoint: name}})]);
	for (const name of MOVE_PASSES) made.push([name, pipeline({label: 'Paint wet ' + name, layout: movePipeline, compute: {module: moveModule, entryPoint: name}})]);
	return {p, made};
}
function programsFor(device, bands) {
	const byBands = programsOf(device);
	let p = byBands.get(bands); if (p) return p;
	const built = buildPrograms(device, bands, d => device.createComputePipeline(d));
	for (const [name, pipeline] of built.made) built.p[name] = pipeline;
	byBands.set(bands, built.p);
	return built.p;
}
export function warmWetPrograms(device, bands) {
	if (programs.get(device)?.has(bands)) return Promise.resolve(true);
	let byBands = warming.get(device); if (!byBands) warming.set(device, byBands = new Map());
	if (!byBands.has(bands)) byBands.set(bands, (async () => {
		const built = buildPrograms(device, bands, d => device.createComputePipelineAsync(d));
		for (const [name, pipeline] of built.made) built.p[name] = await pipeline;
		const ready = programsOf(device); if (!ready.has(bands)) ready.set(bands, built.p);
		return true;
	})().catch(() => false));
	return byBands.get(bands);
}
export const wetBandsFor = record => record.pigment ? PAINT_WET_CHANNELS : 3;
export const wetProgramsReady = (device, bands) => !!programs.get(device)?.has(bands);

export class WetEngineGpu {
	constructor(host, record) {
		this.host = host; this.device = host.device; this.record = record;
		this.bands = wetBandsFor(record);
		this.programs = programsFor(this.device, this.bands);
		this.state = null;
		this.wetPending = 0; this.wetTouched = null; this.wetOwedBox = false; this.wetSeed = 0;
		this.subs = this.device.createBuffer({label: 'Paint wet steps', size: PARAM_STRIDE * SLOTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		this.params = this.device.createBuffer({label: 'Paint wet params', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		this.tint = this.device.createBuffer({label: 'Paint wet tint', size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
		this.ctl = this.device.createBuffer({label: 'Paint wet ctl', size: CTL_WORDS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		this.aux = null; this.auxBytes = 0;
		this.slot = 0; this.slotData = new ArrayBuffer(PARAM_STRIDE * SLOTS); this.encoder = null; this.pass = null;
		this.options = record.wetOptions || {}; this.C = record.wetCell || 3;
		this.lastCtl = null;
	}
	get wet() { return !!this.state?.wet; }
	submit() { this._submit(); }
	get wetState() { return this.state; }
	_open() {
		if (this.pass) return;
		this.host.flush();
		if (this.state && this.state.sheet !== this.host.sheet) { this._bindState(); this._writeParams(); }
		this.encoder = this.device.createCommandEncoder(); this.pass = this.encoder.beginComputePass(); this.slot = 0;
	}
	_sub(values) {
		if (this.slot >= SLOTS) this._submit(), this._open();
		const at = this.slot++ * PARAM_STRIDE, f = new Float32Array(this.slotData, at, 32), u = new Uint32Array(this.slotData, at, 32), i = new Int32Array(this.slotData, at, 32);
		f.fill(0);
		const set = (k, v, kind) => { if (kind === 'f') f[k] = v; else if (kind === 'i') i[k] = v; else u[k] = v; };
		const LAYOUT = {h: [0, 'f'], damping: [1, 'f'], parity: [2], finish: [3], x0: [4, 'i'], y0: [5, 'i'], x1: [6, 'i'], y1: [7, 'i'], px0: [8, 'i'], py0: [9, 'i'], px1: [10, 'i'], py1: [11, 'i'],
			fine: [12], coarseAt: [13], maskAt: [14], maskW: [15], maskH: [16], bx0: [17, 'i'], by0: [18, 'i'], water: [19, 'f'], pigment: [20, 'f'], opaque: [21, 'f'], dryLift: [22, 'f'], load: [23, 'f'],
			spectrumAt: [24], aAt: [25], bAt: [26], flagsAt: [27], flags2At: [28], rw: [29], rh: [30], count: [31]};
		for (const [k, v] of Object.entries(values)) { const [index, kind] = LAYOUT[k]; set(index, v, kind); }
		return at;
	}
	_run(name, offset, x, y = 1) { if (x < 1 || y < 1) return; this.pass.setPipeline(this.programs[name]); this.pass.setBindGroup(0, this.state.group, [offset]); this.pass.dispatchWorkgroups(x, y); }
	_submit() {
		if (!this.pass) return;
		this.pass.end();
		this.device.queue.writeBuffer(this.subs, 0, this.slotData, 0, Math.max(1, this.slot) * PARAM_STRIDE);
		this.device.queue.submit([this.encoder.finish()]);
		this.pass = null; this.encoder = null; this.slot = 0; this.auxAt = 0;
		for (const b of this.transient?.splice(0) || []) b.destroy();
	}
	_auxFor(floats) {
		const bytes = Math.max(1 << 16, Math.ceil(floats * 4 / 65536) * 65536);
		if (this.aux && this.auxBytes >= bytes) return;
		this._submit();
		(this.transient ??= []).push(...(this.aux ? [this.aux] : []));
		this.aux = this.device.createBuffer({label: 'Paint wet aux', size: this.auxBytes = Math.max(bytes, this.auxBytes * 2), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		if (this.state) this._bindState();
	}
	_bindState() {
		const s = this.state;
		s.group = this.device.createBindGroup({layout: this.programs.layout, entries: [
			{binding: 0, resource: {buffer: s.cells}}, {binding: 1, resource: {buffer: this.ctl}}, {binding: 2, resource: {buffer: this.params}}, {binding: 3, resource: {buffer: this.subs, size: SUB_BYTES}},
			{binding: 4, resource: {buffer: paintPigmentTables(this.device)}}, {binding: 5, resource: {buffer: this.tint}},
			{binding: 6, resource: {buffer: s.rb}}, {binding: 7, resource: {buffer: s.cover}}, {binding: 8, resource: {buffer: this.host.sheet}}, {binding: 9, resource: {buffer: this.aux}}]});
		s.sheet = this.host.sheet;
	}
	_writeParams() {
		const s = this.state, o = this.options, b = new ArrayBuffer(128), u = new Uint32Array(b), f = new Float32Array(b), i = new Int32Array(b);
		u[0] = s.cw; u[1] = s.ch; u[2] = s.n; u[3] = this.bands;
		f[4] = s.dryingTime; f[5] = s.flow; f[6] = s.pin; f[7] = s.bleed;
		f[8] = s.backrun; f[9] = s.gx; f[10] = s.gy; f[11] = s.paper.absorbency;
		f[12] = s.paper.tooth; f[13] = s.granulation; f[14] = s.settling; f[15] = s.edgeDarkening;
		i[16] = s.win.x0; i[17] = s.win.y0; u[18] = s.win.w; u[19] = s.win.h;
		u[20] = this.host.width; u[21] = this.host.height; u[22] = this.C; u[23] = this.wetSeed >>> 0;
		f[24] = o.tooth ?? .5; f[25] = o.grain ?? 1; f[26] = o.grit ?? .22;
		this.device.queue.writeBuffer(this.params, 0, b);
	}
	_windowFor(box, previous) {
		const C = this.C, margin = 16 * C, W = this.host.width, H = this.host.height;
		let x0 = Math.max(0, box.x0 - margin), y0 = Math.max(0, box.y0 - margin);
		let x1 = Math.min(W, box.x0 + box.w + margin), y1 = Math.min(H, box.y0 + box.h + margin);
		if (previous) { x0 = Math.min(x0, previous.x0); y0 = Math.min(y0, previous.y0); x1 = Math.max(x1, previous.x0 + previous.w); y1 = Math.max(y1, previous.y0 + previous.h); }
		x0 = Math.floor(x0 / C) * C; y0 = Math.floor(y0 / C) * C;
		x1 = Math.min(Math.ceil(W / C) * C, Math.ceil(x1 / C) * C); y1 = Math.min(Math.ceil(H / C) * C, Math.ceil(y1 / C) * C);
		return {x0, y0, w: x1 - x0, h: y1 - y0, cw: (x1 - x0) / C, ch: (y1 - y0) / C};
	}
	_bytes(win) { return wetBytes(win.cw, win.ch, this.bands) + win.cw * win.ch * 20 + win.w * win.h * 20; }
	beginWet(seed, box) {
		const state = this.state, win = state?.win, F = this.C * 8;
		if (state && box.x0 - F >= win.x0 && box.y0 - F >= win.y0 && box.x0 + box.w + F <= win.x0 + win.w && box.y0 + box.h + F <= win.y0 + win.h) return state;
		this.composeWet();
		if (state && win.x0 === 0 && win.y0 === 0 && win.w >= this.host.width && win.h >= this.host.height) return state;
		const o = this.options, maxBytes = o.maxBytes ?? 96000000;
		let next = this._windowFor(box, win), carry = state;
		if (this._bytes(next) > maxBytes) {
			if (state) { this.wetPending = 0; this.settleWet(); carry = null; }
			next = this._windowFor(box, null);
			if (this._bytes(next) > maxBytes) { const error = new RangeError('Painting is too large for wet media'); error.code = 'PAINT_WET_BUDGET'; throw error; }
		}
		this._submit();
		const C = this.C, d = this.device, n = next.cw * next.ch, planes = PLANES + 2 * this.bands;
		const paper = makePaper(seed, next.cw, next.ch, {...o, originX: next.x0 / C, originY: next.y0 / C, within: carry && carry.paper.seed === seed ? carry.paper : null});
		const cells = d.createBuffer({label: 'Paint wet cells', size: planes * n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
		const rb = d.createBuffer({label: 'Paint wet raster base', size: next.w * next.h * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		const cover = d.createBuffer({label: 'Paint wet cover', size: next.w * next.h * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
		d.queue.writeBuffer(cells, HEIGHT * n * 4, paper.heightField);
		const B = this.bands, toSpectral = B === 3 ? (r, g, b, out) => { out[0] = r; out[1] = g; out[2] = b; return out; } : writePaintWet;
		const tintLog = new Float32Array(B), white = new Float32Array(B); toSpectral(...paper.tint, tintLog); toSpectral(1, 1, 1, white);
		for (let k = 0; k < B; k++) tintLog[k] = tintLog[k] - white[k];
		const tint = new Float32Array(44); tint.set(tintLog.subarray(0, 44)); d.queue.writeBuffer(this.tint, 0, tint);
		const dx = carry ? (carry.win.x0 - next.x0) / C : 0, dy = carry ? (carry.win.y0 - next.y0) / C : 0;
		const move = new ArrayBuffer(80), mu = new Uint32Array(move), mi = new Int32Array(move);
		mu[0] = carry ? carry.cw : 0; mu[1] = carry ? carry.ch : 0; mu[2] = next.cw; mu[3] = next.ch; mi[4] = dx; mi[5] = dy; mu[6] = planes; mu[7] = C;
		mu[8] = carry ? carry.win.w : 0; mu[9] = carry ? carry.win.h : 0; mu[10] = next.w; mu[11] = next.h; mi[12] = carry ? carry.win.x0 - next.x0 : 0; mi[13] = carry ? carry.win.y0 - next.y0 : 0;
		mu[14] = this.host.width; mu[15] = this.host.height; mi[16] = next.x0; mi[17] = next.y0; mu[18] = carry ? 1 : 0;
		const moveBuffer = d.createBuffer({size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}); d.queue.writeBuffer(moveBuffer, 0, move);
		const tiny = () => d.createBuffer({size: 16, usage: GPUBufferUsage.STORAGE});
		const oldCells = carry?.cells || tiny(), oldRb = carry?.rb || tiny(), oldCover = carry?.cover || tiny();
		const group = d.createBindGroup({layout: this.programs.moveLayout, entries: [{binding: 0, resource: {buffer: oldCells}}, {binding: 1, resource: {buffer: cells}}, {binding: 2, resource: {buffer: oldRb}}, {binding: 3, resource: {buffer: rb}},
			{binding: 4, resource: {buffer: oldCover}}, {binding: 5, resource: {buffer: cover}}, {binding: 6, resource: {buffer: this.host.sheet}}, {binding: 7, resource: {buffer: moveBuffer}}]});
		this.host.flush();
		const e = d.createCommandEncoder(), pass = e.beginComputePass();
		const go = (name, x, y) => { pass.setPipeline(this.programs[name]); pass.setBindGroup(0, group); pass.dispatchWorkgroups(x, y); };
		if (carry) go('moveCells', Math.ceil(next.cw / 8), Math.ceil(next.ch / 8));
		go('moveRaster', Math.ceil(next.w / 8), Math.ceil(next.h / 8));
		go('moveDownsample', Math.ceil(next.cw / 8), Math.ceil(next.ch / 8));
		pass.end(); d.queue.submit([e.finish()]);
		const transient = [moveBuffer]; if (!carry) transient.push(oldCells, oldRb, oldCover); else transient.push(carry.cells, carry.rb, carry.cover);
		(this.transient ??= []).push(...transient);
		const shift = b => b && {x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy};
		const next_ = {win: next, cw: next.cw, ch: next.ch, n, cells, rb, cover, paper, bands: B,
			dryingTime: o.dryingTime ?? 1600, flow: o.flow ?? 1, pin: o.pin ?? 0, bleed: o.bleed ?? 0, backrun: o.backrun ?? 1, granulation: o.granulation ?? .05, settling: o.settling ?? 1, edgeDarkening: o.edgeDarkening ?? 1,
			gx: 0, gy: 0, hMax: Math.min(48, Math.max(8, 8 / Math.max(.05, o.flow ?? 1))), elapsed: carry?.elapsed || 0, steps: carry?.steps || 0,
			wet: carry?.wet || false, active: shift(carry?.active), wetBox: shift(carry?.wetBox), composeBox: shift(carry?.composeBox)};
		this.state = next_; this.wetSeed = seed;
		if (this.wetTouched && carry) this.wetTouched = shift(this.wetTouched); else if (!carry) this.wetTouched = null;
		this.wetBandBox = null;
		this._auxFor(1 << 14); this._bindState(); this._writeParams(); this._tilt();
		this._writeCtl();
		this.host.extendBox({x0: next.x0, y0: next.y0, x1: next.x0 + next.w - 1, y1: next.y0 + next.h - 1});
		return next_;
	}
	_tilt() { const s = this.state; if (!s) return; const g = this.record.wetGravity || [0, 0]; s.gx = Math.max(-1, Math.min(1, g[0] || 0)); s.gy = Math.max(-1, Math.min(1, g[1] || 0)); this._writeParams(); }
	tilt(gx, gy) { this.record.wetGravity = [gx || 0, gy || 0]; this._tilt(); }
	_writeCtl() {
		const s = this.state, ctl = new Int32Array(CTL_WORDS), box4 = b => b ? [b.x0, b.y0, b.x1, b.y1] : [0, 0, 0, 0];
		ctl[C.wet] = s.wet ? 1 : 0;
		ctl.set(box4(s.active), C.active); ctl[C.activeOk] = s.active ? 1 : 0;
		ctl.set(box4(s.wetBox), C.wetBox); ctl[C.wetBoxOk] = s.wetBox ? 1 : 0;
		ctl.set(box4(s.composeBox), C.compose); ctl[C.composeOk] = s.composeBox ? 1 : 0;
		this._submit(); this.device.queue.writeBuffer(this.ctl, 0, ctl);
	}
	async _readCtl() {
		this._submit();
		const d = this.device, read = d.createBuffer({size: CTL_WORDS * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
		const e = d.createCommandEncoder(); e.copyBufferToBuffer(this.ctl, 0, read, 0, CTL_WORDS * 4); d.queue.submit([e.finish()]);
		await read.mapAsync(GPUMapMode.READ); const ctl = new Int32Array(read.getMappedRange().slice(0)); read.unmap(); read.destroy();
		const s = this.state; if (!s) return null;
		const box = (at, ok) => ctl[ok] ? {x0: ctl[at], y0: ctl[at + 1], x1: ctl[at + 2], y1: ctl[at + 3]} : null;
		s.wet = !!ctl[C.wet]; s.active = box(C.active, C.activeOk); s.wetBox = box(C.wetBox, C.wetBoxOk); s.composeBox = box(C.compose, C.composeOk);
		s.unread = false;
		return s;
	}
	drawWetDab(seed, loads, x, y, radius, r, g, b, opaque, hardness, softness, alpha, aspect, angle) {
		const rec = this.record, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
		x *= rec.scale; y *= rec.scale; radius *= rec.scale;
		opaque = clamp(opaque, 0, 1); hardness = clamp(hardness, 0, 1); softness = clamp(softness, 0, 1);
		if (radius < .1 || hardness === 0 || softness === 1 || opaque === 0) return false;
		const keep = rec.strokeCheckpoint; rec.strokeCheckpoint = null;
		let box; try { box = rec._renderMask(x, y, radius, hardness, softness, Math.max(1, aspect), angle); } finally { rec.strokeCheckpoint = keep; }
		if (!box) return false;
		const mask = box.mask.slice(0, box.w * box.h);
		const state = this.beginWet(seed, box), win = state.win, C = this.C;
		const cx0 = Math.floor((box.x0 - win.x0) / C), cy0 = Math.floor((box.y0 - win.y0) / C), cx1 = Math.min(win.cw - 1, Math.floor((box.x0 + box.w - 1 - win.x0) / C)), cy1 = Math.min(win.ch - 1, Math.floor((box.y0 + box.h - 1 - win.y0) / C));
		const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1; if (cw < 1 || ch < 1) return false;
		this._touchWet({x0: cx0, y0: cy0, x1: cx1, y1: cy1});
		const coarse = new Float32Array(cw * ch), area = C * C;
		for (let yy = 0; yy < box.h; yy++) { const cy = Math.floor((box.y0 + yy - win.y0) / C) - cy0; for (let xx = 0; xx < box.w; xx++) { const cx = Math.floor((box.x0 + xx - win.x0) / C) - cx0, m = mask[yy * box.w + xx]; if (cx >= 0 && cx < cw && cy >= 0 && cy < ch) coarse[cy * cw + cx] += m / area; } }
		const water = loads.water, pigment = loads.pigment * clamp(alpha, 0, 1);
		if (water === 0) return false;
		let any = false; for (let k = 0; k < coarse.length; k++) if (coarse[k] * opaque) { any = true; break; }
		const spectrum = new Float32Array(this.bands);
		if (any) {
			const toSpectral = this.bands === 3 ? (r, g, b, out) => { out[0] = r; out[1] = g; out[2] = b; return out; } : writePaintWet;
			toSpectral(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), spectrum);
		}
		const need = coarse.length + this.bands + mask.length;
		if ((this.auxAt || 0) + need > this.auxBytes / 4) this._submit();
		this._auxFor((this.auxAt || 0) + need);
		const coarseAt = this.auxAt || 0, spectrumAt = coarseAt + coarse.length, maskAt = spectrumAt + this.bands;
		this.auxAt = maskAt + mask.length;
		const upload = new Float32Array(need); upload.set(coarse, 0); upload.set(spectrum, coarse.length); upload.set(mask, coarse.length + this.bands);
		this.device.queue.writeBuffer(this.aux, coarseAt * 4, upload);
		this._open();
		const dryLift = .95 - .6 * Math.min(1, pigment / Math.max(water, 1e-6)), load = loads.pigment * clamp(alpha, 0, 1) * opaque;
		const at = this._sub({x0: cx0, y0: cy0, x1: cx1, y1: cy1, coarseAt, spectrumAt, maskAt, maskW: box.w, maskH: box.h, bx0: box.x0 - win.x0, by0: box.y0 - win.y0, water, pigment, opaque, dryLift, load: any ? load : 0});
		this._run('wetCover', at, Math.ceil(box.w / 8), Math.ceil(box.h / 8));
		if (!any) return false;
		this._run('wetDeposit', at, Math.ceil(cw / 8), Math.ceil(ch / 8));
		this._run('wetTouch', at, 1);
		state.wet = true;
		const grow = (k, b) => { const a = state[k]; state[k] = a ? {x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)} : {...b}; };
		const rect = {x0: cx0, y0: cy0, x1: cx1, y1: cy1};
		grow('active', rect); grow('wetBox', rect);
		this._settleRect(rect, false);
		this._compose(rect, false);
		this.wetDirty = true;
		return true;
	}
	_touchWet(box) {
		const win = this.state?.win; if (!win) return;
		const x0 = Math.max(0, Math.min(win.cw - 1, box.x0)), y0 = Math.max(0, Math.min(win.ch - 1, box.y0));
		const x1 = Math.max(0, Math.min(win.cw - 1, box.x1)), y1 = Math.max(0, Math.min(win.ch - 1, box.y1));
		const t = this.wetTouched;
		if (!t) { this.wetTouched = {x0, y0, x1, y1}; return; }
		if (x0 < t.x0) t.x0 = x0; if (y0 < t.y0) t.y0 = y0; if (x1 > t.x1) t.x1 = x1; if (y1 > t.y1) t.y1 = y1;
		if (t.x0 < 0) t.x0 = 0; if (t.y0 < 0) t.y0 = 0; if (t.x1 > win.cw - 1) t.x1 = win.cw - 1; if (t.y1 > win.ch - 1) t.y1 = win.ch - 1;
	}
	_settleRect(rect, finish) {
		this._open();
		const at = this._sub({x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1, finish: finish ? 1 : 0});
		this._run('wetSettle', at, Math.ceil((rect.x1 - rect.x0 + 1) / 8), Math.ceil((rect.y1 - rect.y0 + 1) / 8));
	}
	_compose(rect, fine) {
		const s = this.state, win = s.win, C = this.C, cw = win.cw, ch = win.ch;
		const px0 = Math.max(0, rect.x0 - 1) * C, py0 = Math.max(0, rect.y0 - 1) * C, px1 = Math.min(win.w, (rect.x1 + 2) * C) - 1, py1 = Math.min(win.h, (rect.y1 + 2) * C) - 1;
		if (px1 < px0 || py1 < py0) return;
		const rw = px1 - px0 + 1, rh = py1 - py0 + 1, groups = Math.ceil(rw / 8) * Math.ceil(rh / 8);
		if (fine) { this._submit(); this._auxFor(groups * 2 + 8); }
		this._open();
		const cover = this._sub({x0: Math.max(0, rect.x0 - 2), y0: Math.max(0, rect.y0 - 2), x1: Math.min(cw - 1, rect.x1 + 2), y1: Math.min(ch - 1, rect.y1 + 2)});
		this._run('wetCellCover', cover, Math.ceil((Math.min(cw - 1, rect.x1 + 2) - Math.max(0, rect.x0 - 2) + 1) / 8), Math.ceil((Math.min(ch - 1, rect.y1 + 2) - Math.max(0, rect.y0 - 2) + 1) / 8));
		const bAt = groups * 2 + 4;
		const at = this._sub({px0, py0, px1, py1, fine: fine ? 1 : 0, aAt: 0, bAt: fine ? bAt : 0, rw, rh, count: groups});
		if (fine && (this.options.grit ?? .22) && RAPIER_WET_RIM > 0) { this._run('wetRimSum', at, Math.ceil(rw / 8), Math.ceil(rh / 8)); this._run('wetRimTotal', at, 1); }
		else if (fine) { this._submit(); this.device.queue.writeBuffer(this.aux, bAt * 4, new Float32Array(1)); this._open(); }
		this._run('wetCompose', at, Math.ceil(rw / 8), Math.ceil(rh / 8));
		this.host.extendBox({x0: win.x0 + px0, y0: win.y0 + py0, x1: win.x0 + px1, y1: win.y0 + py1});
	}
	_smoothCells(rect) {
		const s = this.state, cw = s.win.cw, ch = s.win.ch;
		const x0 = Math.max(0, rect.x0 - 2), y0 = Math.max(0, rect.y0 - 2), x1 = Math.min(cw - 1, rect.x1 + 2), y1 = Math.min(ch - 1, rect.y1 + 2);
		const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 3 || h < 3) return;
		const n = w * h; this._submit(); this._auxFor(n * 9 + 8);
		this._open();
		const base = {x0, y0, x1, y1, aAt: 0, bAt: n * 4, flagsAt: n * 8};
		const gx = Math.ceil(w / 8), gy = Math.ceil(h / 8);
		this._run('wetSmoothRead', this._sub(base), gx, gy);
		this._run('wetSmoothBand', this._sub(base), gx, gy);
		this._run('wetSmoothAverage', this._sub({...base, count: 0}), gx, gy);
		this._run('wetSmoothAverage', this._sub({...base, count: 1}), gx, gy);
		this._run('wetSmoothWrite', this._sub(base), gx, gy);
	}
	_finish(rect) {
		const win = this.state.win, C = this.C;
		const px0 = Math.max(0, (rect.x0 - 1) * C), py0 = Math.max(0, (rect.y0 - 1) * C);
		const px1 = Math.min(win.w, (rect.x1 + 2) * C) - 1, py1 = Math.min(win.h, (rect.y1 + 2) * C) - 1;
		const w = px1 - px0 + 1, h = py1 - py0 + 1;
		if (w < 5 || h < 5) return;
		const n = w * h; this._submit(); this._auxFor(n * 10 + 8);
		this._open();
		const base = {px0, py0, px1, py1, aAt: 0, bAt: n * 4, flagsAt: n * 8, flags2At: n * 9};
		const gx = Math.ceil(w / 8), gy = Math.ceil(h / 8);
		this._run('wetFinishRead', this._sub(base), gx, gy);
		this._run('wetFinishEdge', this._sub(base), gx, gy);
		this._run('wetFinishBand', this._sub(base), gx, gy);
		this._run('wetFinishAverage', this._sub({...base, count: 0}), gx, gy);
		this._run('wetFinishAverage', this._sub({...base, count: 1}), gx, gy);
		this._run('wetFinishAverage', this._sub({...base, count: 0}), gx, gy);
		this._run('wetFinishWrite', this._sub(base), gx, gy);
		this.host.extendBox({x0: win.x0 + px0, y0: win.y0 + py0, x1: win.x0 + px1, y1: win.y0 + py1});
	}
	_step(dt) {
		const s = this.state;
		s.elapsed += dt;
		if (!dt || !s.wet || !s.active) return false;
		this._writeParams();
		let remaining = dt;
		s.unread = true;
		this._open();
		while (remaining > 0) {
			const h = Math.min(s.hMax, remaining); remaining -= h; s.steps++;
			const damping = Math.exp(-h * .035), W = s.cw, H = s.ch;
			const a = this._sub({h, damping, parity: 0}), b = this._sub({h, damping, parity: 1});
			this._run('wetBegin', a, 1);
			this._run('wetFaceX', a, Math.ceil(Math.ceil(W / 2) / 64), H); this._run('wetFaceX', b, Math.ceil(Math.ceil(W / 2) / 64), H);
			this._run('wetFaceY', a, Math.ceil(W / 64), Math.ceil(H / 2)); this._run('wetFaceY', b, Math.ceil(W / 64), Math.ceil(H / 2));
			this._run('wetEvaporate', a, Math.ceil(W / 64), H);
			this._run('wetCapture', a, Math.ceil(W / 64), H);
			this._run('wetEnd', a, 1);
		}
		return true;
	}
	_drain(owed) {
		const s = this.state;
		if (!(owed > 0)) return false;
		if (owed <= RAPIER_WET_STEP_MAX) return this._step(owed);
		const h = s.hMax > 0 ? s.hMax : 8, chunk = h >= RAPIER_WET_STEP_MAX ? RAPIER_WET_STEP_MAX : Math.floor(RAPIER_WET_STEP_MAX / h) * h;
		let left = owed, changed = false;
		while (left > 0) { const take = left > chunk ? chunk : left; left -= take; if (this._step(take)) changed = true; }
		return changed;
	}
	async stepWet(dt, limit = Infinity) {
		const s = this.state; if (!s) { this.wetPending = 0; return false; }
		this._tilt();
		const owed = (dt || 0) + (this.wetPending || 0), step = Math.min(owed, limit); this.wetPending = owed - step;
		if (s.composeBox) { s.composeBox = null; this._writeCtlCompose(); }
		const changed = this._drain(step);
		await this._readCtl();
		await this._growForFlow();
		this.wetOwedBox = true;
		return changed;
	}
	_writeCtlCompose() { this._submit(); this.device.queue.writeBuffer(this.ctl, C.composeOk * 4, new Int32Array([0])); }
	async _growForFlow() {
		const s = this.state, win = s?.win, a = s?.active, C = this.C;
		if (!a || !s.wet) return;
		const edge = 2, atEdge = (a.x0 <= edge && win.x0 > 0) || (a.y0 <= edge && win.y0 > 0) || (a.x1 >= win.cw - 1 - edge && win.x0 + win.w < this.host.width) || (a.y1 >= win.ch - 1 - edge && win.y0 + win.h < this.host.height);
		if (!atEdge) return;
		const box = {x0: win.x0 + a.x0 * C, y0: win.y0 + a.y0 * C, w: (a.x1 - a.x0 + 1) * C, h: (a.y1 - a.y0 + 1) * C};
		if (this._bytes(this._windowFor(box, win)) > (this.options.maxBytes ?? 96000000)) return;
		this.beginWet(this.wetSeed, box);
	}
	composeWet() {
		const live = this.state;
		if (!this.wetOwedBox || !live) return false;
		const w = live.composeBox || live.wetBox || live.active;
		if (live.composeBox) { live.composeBox = null; this._writeCtlCompose(); }
		if (!w) { this.wetOwedBox = false; return false; }
		const x0 = Math.max(0, w.x0 - 2), x1 = Math.min(live.cw - 1, w.x1 + 2), y0 = Math.max(0, w.y0 - 2), y1 = Math.min(live.ch - 1, w.y1 + 2);
		const rect = {x0, y0, x1, y1};
		this._settleRect(rect, false); this._compose(rect, false); this._submit();
		this.wetOwedBox = false;
		return true;
	}
	async advanceWet(dt, limit = Infinity) { const changed = await this.stepWet(dt, limit); this.composeWet(); return changed; }
	settleWet(owed = true) {
		this.wetOwedBox = false;
		const state = this.state; if (!state) { this.wetPending = 0; return false; }
		this._tilt();
		if (!owed) this.wetPending = 0;
		if (this.wetPending) { this._drain(this.wetPending); this.wetPending = 0; }
		const box = state.unread ? {x0: 0, y0: 0, x1: state.cw - 1, y1: state.ch - 1} : state.active;
		if (box) { this._settleRect(box, true); this._touchWet(box); }
		const whole = this.wetTouched;
		if (whole) { this._smoothCells(whole); this._compose(whole, true); this._finish(whole); }
		this._submit();
		this.state = null; this.wetTouched = null; this.wetBandBox = null;
		for (const b of [state.cells, state.rb, state.cover]) b.destroy();
		return true;
	}
	async dryWet(feed = 8, slice = 8) {
		if (!this.state) { this.work = []; return true; }
		if (this.state.wet || this.wetPending) { await this.stepWet(feed, feed + slice); this.composeWet(); this.work = [['stepWet', [feed, feed + slice]], ['composeWet', []]]; return false; }
		this.settleWet(); this.work = [['settleWet', []]];
		return true;
	}
	async snapshot() {
		const s = this.state; if (!s) return null;
		await this._readCtl();
		const d = this.device, cellsBytes = (PLANES + 2 * this.bands) * s.n * 4, rasterBytes = s.win.w * s.win.h * 16, coverBytes = s.win.w * s.win.h * 4;
		const read = d.createBuffer({size: cellsBytes + rasterBytes + coverBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
		const e = d.createCommandEncoder(); e.copyBufferToBuffer(s.cells, 0, read, 0, cellsBytes); e.copyBufferToBuffer(s.rb, 0, read, cellsBytes, rasterBytes); e.copyBufferToBuffer(s.cover, 0, read, cellsBytes + rasterBytes, coverBytes); d.queue.submit([e.finish()]);
		await read.mapAsync(GPUMapMode.READ);
		const all = read.getMappedRange();
		const out = {seed: this.wetSeed, bands: this.bands, win: {...s.win}, planes: new Float32Array(all.slice(0, cellsBytes)), rb: new Float32Array(all.slice(cellsBytes, cellsBytes + rasterBytes)), cover: new Float32Array(all.slice(cellsBytes + rasterBytes)),
			wet: s.wet, active: s.active && {...s.active}, wetBox: s.wetBox && {...s.wetBox}, composeBox: s.composeBox && {...s.composeBox}, elapsed: s.elapsed, steps: s.steps, gx: s.gx, gy: s.gy,
			wetPending: this.wetPending, wetTouched: this.wetTouched && {...this.wetTouched}};
		read.unmap(); read.destroy();
		return out;
	}
	discard() { this._submit(); const s = this.state; if (s) for (const b of [s.cells, s.rb, s.cover]) b.destroy(); this.state = null; this.wetPending = 0; this.wetTouched = null; this.wetOwedBox = false; }
	shift(left, top) { const s = this.state; if (!s) return; s.win.x0 += left; s.win.y0 += top; this._writeParams(); }
	destroy() { this._submit(); for (const b of [this.subs, this.params, this.tint, this.ctl, this.aux, this.state?.cells, this.state?.rb, this.state?.cover, ...(this.transient || [])]) b?.destroy(); this.state = null; }
}

export class WetSolverGpu {
	constructor(device, state) {
		this.device = device; this.state = state; this.bands = state.bands;
		const n = state.width * state.height;
		this.n = n; this.planes = PLANES + 2 * state.bands;
		this.programs = programsFor(device, state.bands);
		const host = {device, width: state.width, height: state.height, sheet: device.createBuffer({size: 16, usage: GPUBufferUsage.STORAGE}), flush() {}, extendBox() {}};
		this.engine = new WetEngineGpu(host, {pigment: state.bands !== 3, wetOptions: {}, wetCell: 1});
		const e = this.engine;
		e.state = {win: {x0: 0, y0: 0, w: state.width, h: state.height, cw: state.width, ch: state.height}, cw: state.width, ch: state.height, n, paper: state.paper, bands: state.bands,
			cells: device.createBuffer({label: 'Paint wet cells', size: this.planes * n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC}),
			rb: device.createBuffer({size: 16, usage: GPUBufferUsage.STORAGE}), cover: device.createBuffer({size: 16, usage: GPUBufferUsage.STORAGE}),
			dryingTime: state.dryingTime, flow: state.flow, pin: state.pin, bleed: state.bleed, backrun: state.backrun, granulation: state.granulation, settling: state.settling, edgeDarkening: state.edgeDarkening,
			gx: state.gx, gy: state.gy, hMax: state.hMax, elapsed: state.elapsed, steps: state.steps, wet: state.wet, active: state.active, wetBox: state.wetBox, composeBox: state.composeBox};
		e._auxFor(1 << 14); e._bindState();
	}
	get programsModule() { return this.programs.module; }
	upload() {
		const s = this.state, n = this.n, B = s.bands, q = this.device.queue, plane = new Float32Array(n), cells = this.engine.state.cells;
		const put = (k, a) => q.writeBuffer(cells, k * n * 4, a);
		put(W_, s.w); put(AMOUNT, s.amount); put(SETTLED, s.settledAmount); put(CLOCK, s.clock); put(VX, s.vx); put(VY, s.vy); put(NEXT, s.nextWater); put(HEIGHT, s.paper.heightField);
		for (const [from, at] of [[s.suspended, PLANES], [s.settled, PLANES + B]]) for (let k = 0; k < B; k++) { for (let i = 0; i < n; i++) plane[i] = from[i * B + k]; put(at + k, plane); }
		for (const [from, at] of [[s.base, BASE], [s.pixels, PIX]]) for (let c = 0; c < 4; c++) { for (let i = 0; i < n; i++) plane[i] = from[i * 4 + c]; put(at + c, plane); }
		const tint = new Float32Array(44); tint.set(s.tintLog.subarray(0, Math.min(44, B))); q.writeBuffer(this.engine.tint, 0, tint);
		this.engine._writeParams(); this.engine._writeCtl();
	}
	step(dt) { const e = this.engine; e.state.gx = this.state.gx; e.state.gy = this.state.gy; const r = e._step(dt); e._submit(); this.state.elapsed = e.state.elapsed; return r; }
	settle(rect, finish = false) { if (!rect) return null; this.engine._settleRect(rect, finish); this.engine._submit(); if (finish) this.state.wet = false; return rect; }
	async download() {
		const s = this.state, n = this.n, B = s.bands, d = this.device, e = this.engine;
		await e._readCtl();
		const read = d.createBuffer({size: this.planes * n * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
		const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(e.state.cells, 0, read, 0, this.planes * n * 4); d.queue.submit([enc.finish()]);
		await read.mapAsync(GPUMapMode.READ);
		const all = new Float32Array(read.getMappedRange());
		const plane = k => all.subarray(k * n, (k + 1) * n);
		s.w.set(plane(W_)); s.amount.set(plane(AMOUNT)); s.settledAmount.set(plane(SETTLED)); s.clock.set(plane(CLOCK)); s.vx.set(plane(VX)); s.vy.set(plane(VY)); s.nextWater.set(plane(NEXT));
		for (const [into, at] of [[s.suspended, PLANES], [s.settled, PLANES + B]]) for (let k = 0; k < B; k++) { const src = plane(at + k); for (let i = 0; i < n; i++) into[i * B + k] = src[i]; }
		for (const [into, at] of [[s.base, BASE], [s.pixels, PIX]]) for (let c = 0; c < 4; c++) { const src = plane(at + c); for (let i = 0; i < n; i++) into[i * 4 + c] = src[i]; }
		read.unmap(); read.destroy();
		s.wet = e.state.wet; s.active = e.state.active; s.wetBox = e.state.wetBox; s.composeBox = e.state.composeBox;
		return s;
	}
	destroy() { this.engine.destroy(); }
}

registerPaintEngine('wet', host => new WetEngineGpu(host, host.record), {warm: (device, record) => warmWetPrograms(device, wetBandsFor(record))});

export function installWetState(rec, snap, fromHistory = true) {
	const C = rec.wetCell || 3, win = snap.win, n = win.cw * win.ch, B = snap.bands, plane = k => snap.planes.subarray(k * n, (k + 1) * n);
	const options = rec.wetOptions || {}, digital = B === 3;
	const paper = makePaper(snap.seed, win.cw, win.ch, {...options, originX: win.x0 / C, originY: win.y0 / C});
	const pixels = new Float32Array(n * 4), base = new Float32Array(n * 4);
	for (let c = 0; c < 4; c++) { const p = plane(PIX + c), b = plane(BASE + c); for (let i = 0; i < n; i++) { pixels[i * 4 + c] = p[i]; base[i * 4 + c] = b[i]; } }
	const state = createWetState(paper, {...options, pixels, maxBytes: Number.MAX_SAFE_INTEGER, reservedBytes: 0, mixing: digital ? 'digital' : 'pigment', bands: B, film: false,
		toSpectral: digital ? writePaintRGB : writePaintWet, fromSpectral: digital ? readPaintRGB : paintWetRGB});
	state.base.set(base);
	state.w.set(plane(W_)); state.amount.set(plane(AMOUNT)); state.settledAmount.set(plane(SETTLED)); state.clock.set(plane(CLOCK)); state.vx.set(plane(VX)); state.vy.set(plane(VY)); state.nextWater.set(plane(NEXT));
	for (const [into, at] of [[state.suspended, PLANES], [state.settled, PLANES + B]]) for (let k = 0; k < B; k++) { const src = plane(at + k); for (let i = 0; i < n; i++) into[i * B + k] = src[i]; }
	Object.assign(state, {wet: snap.wet, active: snap.active && {...snap.active}, wetBox: snap.wetBox && {...snap.wetBox}, composeBox: snap.composeBox && {...snap.composeBox}, elapsed: snap.elapsed, steps: snap.steps});
	setGravity(state, snap.gx, snap.gy);
	Object.assign(rec, {wetState: state, wetWindow: {...win}, wetRasterBase: snap.rb.slice(), wetCover: snap.cover.slice(), wetDeposited: plane(DEP).slice(), wetSeed: snap.seed,
		wetTouched: snap.wetTouched && {...snap.wetTouched}, wetPending: snap.wetPending || 0, wetOwedBox: true, wetBandBox: null, wetBandY: 0});
	rec.drawDab = rec._drawAfterWet; rec.wetFromGpu = fromHistory;
	return rec;
}
