// SPDX-License-Identifier: AGPL-3.0-only
// Paint an agent authors: strokes (a path, a brush, a colour, a size, a dip) laid by the same engine a finger drives, the same
// way in the kernel's host (Node, the worker, the page) and in the page's replay.
import { PaintSurface, PaintBrush, parseBrush, createPaintPNGCodec } from './paint.mjs';
import { paintBrushById } from './brushes.mjs';

// The paint tool's own numbers (draw/paint-tool.js: RAPIER_PAINT_GRAIN, RAPIER_PAINT_WET, the Dip's range,
// _rapierPaintRadiusOffset); the draw-agent-paint cell holds them equal.
export const AGENT_PAINT_GRAIN = 3;
export const AGENT_PAINT_WET = Object.freeze({dryingTime: 1600, cell: 3, maxBytes: 64000000, film: true, filmGain: 0.55,
	flow: 0.55, pin: 1.2, bleed: 0.6, grain: 1, granulation: 0.2, tooth: 0.85, edgeDarkening: 1});
const DIP_MIN = 14, DIP_MAX = 260, DIP_FULL = 0.97;
const radiusOffset = size => (size - 50) / 50 * Math.log(8) + Math.log(2);
// A hand's pace in drawing units a second: the time between two points, so speed-driven settings see a hand.
const HAND_PACE = 200;
export const AGENT_PAINT_LIMITS = Object.freeze({strokes: 32, points: 1024, total: 4096, side: 2048});

const finite = n => typeof n === 'number' && Number.isFinite(n);
const unit = n => finite(n) && n >= 0 && n <= 1;
const HEX = /^#[0-9a-f]{6}$/i;

// One stroke as the wire gives it, admitted or null. `size` is the tool's 0..100 slider; `load` and `water` the Dip's axes.
export function admitAgentStroke(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const entry = typeof raw.brush === 'string' ? paintBrushById(raw.brush) : null;
	if (!entry || typeof raw.colour !== 'string' || !HEX.test(raw.colour)) return null;
	if (raw.size != null && !(finite(raw.size) && raw.size >= 0 && raw.size <= 100)) return null;
	if (raw.load != null && !unit(raw.load) || raw.water != null && !unit(raw.water)) return null;
	if (!Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > AGENT_PAINT_LIMITS.points) return null;
	const points = [];
	for (const p of raw.points) {
		if (!Array.isArray(p) || p.length < 2 || p.length > 3 || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6) return null;
		if (p.length === 3 && !unit(p[2])) return null;
		points.push(p.length === 3 ? [p[0], p[1], p[2]] : [p[0], p[1]]);
	}
	const stroke = {brush: entry.id, colour: raw.colour.toLowerCase(), size: raw.size ?? 50, points};
	if (raw.load != null && raw.load < DIP_FULL) stroke.load = raw.load;
	if (raw.water != null && raw.water > 0.005) stroke.water = raw.water;
	return stroke;
}
export function admitAgentStrokes(raw) {
	if (!Array.isArray(raw) || !raw.length || raw.length > AGENT_PAINT_LIMITS.strokes) return null;
	const strokes = raw.map(admitAgentStroke);
	if (strokes.some(s => !s) || strokes.reduce((n, s) => n + s.points.length, 0) > AGENT_PAINT_LIMITS.total) return null;
	return strokes;
}

// The brush a stroke means: the preset, dipped as the tool dips it (paint-tool.js _rapierPaintApplyDip).
function brushFor(stroke) {
	const def = parseBrush(paintBrushById(stroke.brush).myb), load = stroke.load ?? 1, water = stroke.water ?? 0;
	if (load < DIP_FULL || water > 0.005) def.rapier = {...(def.rapier || {})};
	if (load < DIP_FULL) def.rapier.rapier_load = Math.round(DIP_MIN + (DIP_MAX - DIP_MIN) * load * load);
	if (water > 0.005) {
		def.rapier.rapier_thinners = water;
		if (def.wet) {
			def.wet = {...def.wet};
			if (def.wet.rapier_water > 0) def.wet.rapier_water = Math.min(4, def.wet.rapier_water * (1 + 1.1 * water));
			if (def.wet.rapier_pigment_load > 0) def.wet.rapier_pigment_load *= 1 - 0.62 * water;
		}
	}
	return {def, logRadius: def.settings[3].base + radiusOffset(stroke.size)};
}
const colourOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// The sheet the strokes are laid on: their points' box grown by the widest brush, in drawing units, at the tool's grain.
export function agentPaintFrame(strokes) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, reach = 1;
	for (const stroke of strokes) {
		reach = Math.max(reach, 2.5 * Math.exp(brushFor(stroke).logRadius) / AGENT_PAINT_GRAIN + 2);
		for (const [x, y] of stroke.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	}
	const x = x0 - reach, y = y0 - reach, w = Math.ceil((x1 - x0 + 2 * reach) * AGENT_PAINT_GRAIN), h = Math.ceil((y1 - y0 + 2 * reach) * AGENT_PAINT_GRAIN);
	return w > AGENT_PAINT_LIMITS.side || h > AGENT_PAINT_LIMITS.side ? null : {x, y, w, h};
}

// The strokes laid in order, a step at a time, so the page can spend a fixed budget a frame and the host can run it whole.
// `seed` makes the run the same run wherever it is played: the replay's paint is the committed picture's paint.
export class AgentPaintRun {
	constructor(strokes, frame = agentPaintFrame(strokes), seed = 1) {
		this.strokes = strokes; this.frame = frame; this.seed = seed;
		this.surface = new PaintSurface(frame.w, frame.h, {wet: AGENT_PAINT_WET});
		this.surface.paper = null;
		this.stroke = 0; this.point = 0; this.brush = null;
	}
	get done() { return this.stroke >= this.strokes.length; }
	// Lays dabs until `until(strokeIndex, pointIndex)` says stop, or the strokes end. Returns how many points it laid.
	run(until = () => false) {
		const g = AGENT_PAINT_GRAIN, {x: ox, y: oy} = this.frame;
		let laid = 0;
		while (!this.done) {
			const stroke = this.strokes[this.stroke];
			if (!this.brush) {
				const {def, logRadius} = brushFor(stroke), [r, gr, b] = colourOf(stroke.colour);
				this.brush = new PaintBrush(def);
				this.brush.seed(this.seed + this.stroke);
				this.brush.setColor(r, gr, b, true);
				this.brush.setBaseValue('radius_logarithmic', logRadius);
				this.brush.reset(); this.brush.newStroke();
			}
			const points = stroke.points;
			if (this.point < points.length) {
				if (until(this.stroke, this.point)) return laid;
				const p = points[this.point], q = points[this.point - 1];
				const dt = q ? Math.min(5, Math.max(0.0001, Math.hypot(p[0] - q[0], p[1] - q[1]) / HAND_PACE)) : 0.0001;
				this.brush.strokeTo(this.surface, (p[0] - ox) * g, (p[1] - oy) * g, p[2] ?? 0.6, 0, 0, dt, 1, 0, 0, true);
				this.point++; laid++;
				continue;
			}
			const last = points[points.length - 1];
			this.brush.strokeTo(this.surface, (last[0] - ox) * g, (last[1] - oy) * g, 0, 0, 0, 0.016, 1, 0, 0, true);
			this.stroke++; this.point = 0; this.brush = null;
		}
		if (this.surface.wetState) { this.surface.wetPending = 0; this.surface.settleWet(); }
		return laid;
	}
}

const codec = createPaintPNGCodec();
// The kernel host's paint: strokes in, the paint shape the recipe keeps out (its raster, its frame, and the strokes, so the
// page can replay them). Null when the strokes do not admit or would make a sheet past the side limit.
// Separate material preparation from encoding so an execution owner can attach its row pool.
// No host-dependent branch lives here: the Node door still calls paintAgentStrokes directly.
export function prepareAgentPainting(raw, seed = 1) {
	const admitted = admitAgentStrokes(raw), frame = admitted && agentPaintFrame(admitted);
	if (!frame) return null;
	const strokes = admitted.map(s => ({...s, points: s.points.map(p => [round(p[0] - frame.x), round(p[1] - frame.y), ...p.slice(2)])}));
	return {frame, run: new AgentPaintRun(strokes, {x: 0, y: 0, w: frame.w, h: frame.h}, seed)};
}
export async function encodeAgentPainting(prepared) {
	const {run, frame} = prepared, {strokes, seed} = run;
	if (!run.done) throw new Error('An agent painting must finish before encoding');
	const px = run.surface.toRGBA8();
	if (!px.data.some((v, i) => i % 4 === 3 && v)) return null;
	const raster = await codec.compressed(px), w = frame.w / AGENT_PAINT_GRAIN, h = frame.h / AGENT_PAINT_GRAIN;
	return {recognized: 'paint', geom: {cx: frame.x + w / 2, cy: frame.y + h / 2, w, h}, raster,
		paint: {brush: strokes[0].brush, px: [frame.w, frame.h], scale: AGENT_PAINT_GRAIN, strokes, seed}};
}
export async function paintAgentStrokes(raw, seed = 1) {
	const prepared = prepareAgentPainting(raw, seed);
	if (!prepared) return null;
	prepared.run.run();
	return encodeAgentPainting(prepared);
}
const round = n => Math.round(n * 1000) / 1000;
// The replay's plan for a kept layer: its strokes on the sheet the engine lays for them, which the painter replays (draw/paint-worker.mjs
// `replayCreate`, `replay`). A declared size is not that sheet, and it is not allocated.
export function agentPaintReplayPlan(paint) {
	const strokes = admitAgentStrokes(paint?.strokes), px = paint?.px;
	if (!strokes || !Array.isArray(px) || px.length !== 2 || !px.every(n => Number.isInteger(n) && n >= 1 && n <= AGENT_PAINT_LIMITS.side)) return null;
	const frame = agentPaintFrame(strokes);
	if (!frame || frame.w !== px[0] || frame.h !== px[1]) return null;
	return {strokes, frame: {x: 0, y: 0, w: frame.w, h: frame.h}, seed: paint.seed ?? 1};
}
// The same plan as a run on a surface of its own, for a host that lays it in this realm.
export function agentPaintReplayRun(paint) {
	const plan = agentPaintReplayPlan(paint);
	return plan && new AgentPaintRun(plan.strokes, plan.frame, plan.seed);
}

// Whether a kept layer's declared sheet is the one the engine lays for its strokes (the kernel's check before a
// document keeps an agent's paint shape; the replay above refuses any other sheet).
export function agentPaintSheetHolds(paint) {
	const strokes = admitAgentStrokes(paint?.strokes), px = paint?.px;
	if (!strokes || !Array.isArray(px) || px.length !== 2) return false;
	const frame = agentPaintFrame(strokes);
	return !!frame && frame.w === px[0] && frame.h === px[1];
}
