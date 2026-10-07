// SPDX-License-Identifier: AGPL-3.0-only
// Paint an agent authors: strokes (a path, a brush, a colour, a size, a dip) laid by the same engine a finger drives, the same
// way in the kernel's host (Node, the worker, the page) and in the page's replay.
import { PaintSurface, PaintBrush, parseBrush, serializeBrush, createPaintPNGCodec, PAINT_BRUSH_CONTROLS, PAINT_DIP_FULL, paintSizeDefault, paintBrushRadiusOffset, paintBrushDip, paintBrushHead } from './paint.mjs';
import { RAPIER_PAINT_BRUSHES, paintBrushById } from './brushes.mjs';
import {admitPaintReplay, paintReplayFits, PAINT_REPLAY_MAX_BYTES} from './paint-history.mjs';
export {PAINT_REPLAY_MAX_BYTES, paintReplayFits};
import {canonicalJSON} from '../kit/ledger/data.mjs';
import {WaterSurface, waterReady} from './water.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {admitWaterActions, admitWaterPigment, waterPaperById, waterRadius, WATER_BRUSHES, WATER_PIGMENTS, WATER_PAPERS, WATER_TOOLS, WATER_CONTROLS} from './water-data.mjs';
import {encodeSteps as encodeJXLSteps} from '../images/jxl/index.mjs';
import {waterTextPaths,waterTracePaths} from './water-paths.mjs';
import {configurePaintRasterDecoder, decodePaintRaster, decodeNativePaintJXL, validatePaintRaster} from '../images/paint-raster.mjs';
export {configurePaintRasterDecoder, decodePaintRaster, decodeNativePaintJXL, validatePaintRaster};

// The paint tool's own numbers (draw/paint-tool.js: RAPIER_PAINT_GRAIN, RAPIER_PAINT_WET, the Dip's range,
// _rapierPaintRadiusOffset); the draw-agent-paint cell holds them equal.
export const AGENT_PAINT_GRAIN = 3;
export const AGENT_PAINT_WET = Object.freeze({dryingTime: 1600, cell: 3, maxBytes: 64000000, film: true, filmGain: 0.55,
	flow: 0.55, pin: 1.2, bleed: 0.6, grain: 1, granulation: 0.2, tooth: 0.85, edgeDarkening: 1});
// A hand's pace in drawing units a second: the time between two points, so speed-driven settings see a hand.
const HAND_PACE = 200;
export const AGENT_PAINT_LIMITS = Object.freeze({strokes: 32, points: 1024, total: 4096, side: 2048});

const finite = n => typeof n === 'number' && Number.isFinite(n);
const unit = n => finite(n) && n >= 0 && n <= 1;
const HEX = /^#[0-9a-f]{6}$/i;
const sameScale = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const cancelled = signal => { if (signal?.aborted) { const error = new Error('Painting cancelled'); error.name = 'AbortError'; throw error; } };
const copy = value => JSON.parse(JSON.stringify(value));

const waterSessionId = 'water-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const waterPublications = new Map();
export const waterSession = (scope = '') => waterSessionId + (scope === '' ? '' : '-' + String(scope));
// Publication receipts bind the JSON representation retained by the drawing, including its
// normalization of signed zero and optional fields.
const waterJournalKey = replay => sha256(canonicalJSON(copy(replay)));
const waterPublicationKey = shape => sha256(shape.raster) + ':' + waterJournalKey(shape.paint.replay);
// Only material the current execution actually published can be selectively replayed. Saved
// pixels open independently of these receipts; a file's auxiliary journal grants no authority.
export function rememberWaterPainting(shape, session = waterSession()) {
	const replay = shape?.paint?.replay;
	if (shape?.paint?.mode !== 'water' || replay?.session !== session || typeof shape.raster !== 'string') return false;
	let rows = waterPublications.get(session);
	if (!rows) waterPublications.set(session, rows = new Set());
	rows.add(waterPublicationKey(shape));
	return true;
}
export function waterPaintingIsLive(shape, session = waterSession()) {
	const replay = shape?.paint?.replay;
	return typeof shape?.raster === 'string' && replay?.session === session && waterPublications.get(session)?.has(waterPublicationKey(shape)) === true;
}
export function forgetWaterSession(session) { waterPublications.delete(session); }

export function agentPaintBrushRegistry() {
	// Each brush carries its own first-use size: the width the Paint tool opens it at and the width a stroke takes when it names none.
	return {modes: ['paint', 'water'], controls: {...PAINT_BRUSH_CONTROLS, modes:{water:WATER_CONTROLS}}, brushes: [...RAPIER_PAINT_BRUSHES.map(entry => ({id: entry.id, name: entry.name, mode: 'paint', kind: entry.myb.settings.rapier_op?.base_value ? 'material' : 'brush', size: paintSizeDefault(entry.id)})), ...WATER_BRUSHES.map(({id,name,size,water,load,description}) => ({id,name,size,water,load,description,mode:'water'}))], tools: WATER_TOOLS, papers: WATER_PAPERS.map(({id,name})=>({id,name})), pigments: WATER_PIGMENTS.map(({id,name,colour})=>({id,name,colour})), actions: WATER_AGENT_ACTIONS};
}

const WATER_AGENT_ACTIONS = Object.freeze({
 stroke:{kind:'stroke',brush:'water/round',pigment:'ultramarine',controls:{size:44,water:.68,load:.65},paths:[[[10,10,.65,0],[30,20,.65,12]]]},
 water:{kind:'stroke',tool:'water',paths:[[[10,10,.65,0],[30,20,.65,12]]]},
 lift:{kind:'stroke',tool:'lift',paths:[[[10,10,.65,0],[30,20,.65,12]]]},
 dry:{kind:'dry'},fill:{kind:'fill',at:[10,10],pigment:'hansa-yellow',tolerance:.12},
 text:{kind:'text',text:'Water',at:[10,10],textSize:48,set:'water-hand',brush:'water/round',pigment:'ultramarine'},
 trace:{kind:'trace',shapeId:'inspected-shape-id',brush:'water/round',pigment:'ultramarine'},
 paper:{kind:'paper',paper:'rough'},advance:{kind:'advance',ticks:60},
 tip:{kind:'tip',brush:{brush:'water/own-stamp',tip:{width:2,height:2,mask:[255,128,128,255]}}}
});

// One stroke as the wire gives it, admitted or null. `size` is the tool's 0..100 slider; `load` and `water` the Dip's axes.
export function admitAgentStroke(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const entry = typeof raw.brush === 'string' ? paintBrushById(raw.brush) : null;
	if (!entry || typeof raw.colour !== 'string' || !HEX.test(raw.colour)) return null;
	if (raw.size != null && !(finite(raw.size) && raw.size >= 0 && raw.size <= 100)) return null;
	if (raw.load != null && !unit(raw.load) || raw.water != null && !unit(raw.water)) return null;
	if (raw.angle != null && !(finite(raw.angle) && raw.angle >= 0 && raw.angle <= 179)) return null;
	if (raw.follow != null && typeof raw.follow !== 'boolean' || raw.erase != null && typeof raw.erase !== 'boolean') return null;
	if (!Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > AGENT_PAINT_LIMITS.points) return null;
	const points = [];
	for (const p of raw.points) {
		if (!Array.isArray(p) || p.length < 2 || p.length > 3 || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6) return null;
		if (p.length === 3 && !unit(p[2])) return null;
		points.push(p.length === 3 ? [p[0], p[1], p[2]] : [p[0], p[1]]);
	}
	const stroke = {brush: entry.id, colour: raw.colour.toLowerCase(), size: raw.size ?? paintSizeDefault(entry.id), angle: raw.angle ?? 45, follow: raw.follow ?? false, erase: raw.erase ?? false, points};
	if (raw.load != null && raw.load < PAINT_DIP_FULL) stroke.load = raw.load;
	if (raw.water != null && raw.water > 0.005) stroke.water = raw.water;
	return stroke;
}
export function admitAgentStrokes(raw) {
	if (!Array.isArray(raw) || !raw.length || raw.length > AGENT_PAINT_LIMITS.strokes) return null;
	const strokes = raw.map(admitAgentStroke);
	if (strokes.some(s => !s) || strokes.reduce((n, s) => n + s.points.length, 0) > AGENT_PAINT_LIMITS.total) return null;
	return strokes;
}

// A new stroke seats the brush with a second stationary sample. Keep that sample in its own
// record and count it at admission; replay executes existing records without changing them.
function prepareAgentStrokes(raw) {
	const strokes = admitAgentStrokes(raw);
	if (!strokes) return null;
	for (const stroke of strokes) stroke.points.unshift(stroke.points[0].slice());
	return admitAgentStrokes(strokes);
}

// The brush a stroke means: the preset, dipped as the tool dips it (paint-tool.js _rapierPaintApplyDip).
function brushFor(stroke) {
	const def = paintBrushDip(parseBrush(paintBrushById(stroke.brush).myb), stroke.load, stroke.water);
	return {def, logRadius: def.settings[3].base + paintBrushRadiusOffset(stroke.size)};
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
	constructor(strokes, frame = agentPaintFrame(strokes), seed = 1, {pixels = null, offset = [0, 0], scale = AGENT_PAINT_GRAIN, deferSettle = false} = {}) {
		this.strokes = strokes; this.frame = frame; this.seed = seed;
		this.surface = new PaintSurface(frame.w, frame.h, {wet: AGENT_PAINT_WET});
		this.surface.paper = null; this.scale = scale; this.surface.scale = scale / AGENT_PAINT_GRAIN;
		this.surface.toothOX = -offset[0]; this.surface.toothOY = -offset[1];
		if (pixels) this.surface.fromRGBA8(pixels.data, pixels.width, pixels.height, offset[0], offset[1]);
		this.deferSettle = deferSettle; this.settling = null;
		this.stroke = 0; this.point = 0; this.brush = null; this.motion = null;
	}
	get done() { return this.stroke >= this.strokes.length; }
	// Checks `until(strokeIndex, pointIndex)` before each dab. Returns the number of completed input points.
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
				const head = paintBrushHead(stroke, !!def.rapier?.rapier_op);
				this.brush.setHead(head.held, head.clear);
				this.brush.reset(); this.brush.newStroke();
			}
			const points = stroke.points;
			if (until(this.stroke, this.point)) return laid;
			if (!this.motion) {
				const p = points[Math.min(this.point, points.length - 1)], q = points[this.point - 1];
				const lifting = this.point === points.length;
				const dt = lifting ? .016 : q ? Math.min(5, Math.max(.0001, Math.hypot(p[0] - q[0], p[1] - q[1]) / HAND_PACE)) : .0001;
				this.motion = this.brush.strokeToWork(this.surface, (p[0] - ox) * g, (p[1] - oy) * g, lifting ? 0 : p[2] ?? .6, 0, 0, dt, 1, 0, 0, true);
			}
			if (!this.motion.next().done) continue;
			this.motion = null;
			if (this.point < points.length) { this.point++; laid++; }
			else { this.stroke++; this.point = 0; this.brush = null; }
		}
		if (!this.deferSettle) this.finishSlice(Infinity);
		return laid;
	}
	// Settling uses the material owner's existing iterator, so a worker can yield between its bands.
	finishSlice(until = Infinity, steps = Infinity) {
		if (!this.done) return false;
		if (!this.settling && this.surface.wetState) { this.surface.wetPending = 0; this.settling = this.surface._settleWetWork(); }
		while (this.settling && performance.now() < until && steps-- > 0) if (this.settling.next().done) this.settling = null;
		return !this.settling;
	}
}

const codec = createPaintPNGCodec();
// The kernel host's paint: strokes in, the paint shape the recipe keeps out (its raster, its frame, and the strokes, so the
// page can replay them). Null when the strokes do not admit or would make a sheet past the side limit.
// Separate material preparation from encoding so an execution owner can attach its row pool.
// No host-dependent branch lives here: the Node door still calls paintAgentStrokes directly.
export function prepareAgentPainting(raw, seed = 1, options = {}) {
	cancelled(options.signal);
	const admitted = prepareAgentStrokes(raw), frame = admitted && agentPaintFrame(admitted);
	if (!frame || !Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) return null;
	const strokes = admitted.map(s => ({...s, points: s.points.map(p => [round(p[0] - frame.x), round(p[1] - frame.y), ...p.slice(2)])}));
	return {frame, run: new AgentPaintRun(strokes, {x: 0, y: 0, w: frame.w, h: frame.h}, seed), options};
}

// One affine map from native raster pixels to the inspected drawing, and its inverse for samples.
function layerMap(target, side = AGENT_PAINT_LIMITS.side) {
	const geom = target?.geom, px = target?.paint?.px, scale = target?.paint?.scale;
	if (!geom || !Array.isArray(px) || px.length !== 2 || !px.every(n => Number.isInteger(n) && n > 0 && n <= side) || px[0] * px[1] > 12000000 || !(finite(scale) && scale > 0 && scale <= 16)) return null;
	let corners = geom.p;
	if (!corners) {
		if (![geom.cx, geom.cy, geom.w, geom.h, geom.rot ?? 0].every(finite) || geom.w <= 0 || geom.h <= 0) return null;
		const a = (geom.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
		corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [geom.cx + x * geom.w / 2 * cs - y * geom.h / 2 * sn, geom.cy + x * geom.w / 2 * sn + y * geom.h / 2 * cs]);
	}
	if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(p => Array.isArray(p) && p.length === 2 && p.every(finite))) return null;
	const [c0, c1, c2, c3] = corners, ux = (c1[0] - c0[0]) / px[0], uy = (c1[1] - c0[1]) / px[0], vx = (c3[0] - c0[0]) / px[1], vy = (c3[1] - c0[1]) / px[1], det = ux * vy - uy * vx;
	if (!finite(det) || Math.abs(det) < 1e-12 || Math.hypot(c2[0] - c1[0] - c3[0] + c0[0], c2[1] - c1[1] - c3[1] + c0[1]) > 1e-6) return null;
	return {px, scale, at: (x, y) => [c0[0] + x * ux + y * vx, c0[1] + x * uy + y * vy],
		local: ([x, y, ...rest]) => [((x - c0[0]) * vy - (y - c0[1]) * vx) / det / scale, ((y - c0[1]) * ux - (x - c0[0]) * uy) / det / scale, ...rest]};
}

export async function prepareAgentLayerPainting(raw, target, seed = 1, options = {}) {
	cancelled(options.signal);
	if(target?.paint?.mode==='water')throw Object.assign(new Error('Use Water for this layer, or paint on a new layer.'),{code:'paint_mode_mismatch'});
	const admitted = prepareAgentStrokes(raw), map = layerMap(target);
	if (!admitted || !map || !Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff || typeof target.raster !== 'string') return null;
	const pixels = await decodePaintRaster(target.raster, options);
	cancelled(options.signal);
	if (!pixels || pixels.width !== map.px[0] || pixels.height !== map.px[1]) return null;
	const local = admitted.map(s => ({...s, points: s.points.map(map.local)}));
	if (local.some(s => s.points.some(p => !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6))) return null;
	const bounds = agentPaintFrame(local);
	if (!bounds) return null;
	const left = Math.max(0, Math.ceil(-bounds.x * map.scale)), top = Math.max(0, Math.ceil(-bounds.y * map.scale));
	const right = Math.max(0, Math.ceil((bounds.x + bounds.w / AGENT_PAINT_GRAIN) * map.scale - pixels.width)), bottom = Math.max(0, Math.ceil((bounds.y + bounds.h / AGENT_PAINT_GRAIN) * map.scale - pixels.height));
	const frame = {x: 0, y: 0, w: pixels.width + left + right, h: pixels.height + top + bottom};
	if (frame.w > AGENT_PAINT_LIMITS.side || frame.h > AGENT_PAINT_LIMITS.side) return null;
	const grow = [left, top, right, bottom], strokes = local.map(s => ({...s, points: s.points.map(([x, y, ...p]) => [round(x + left / map.scale), round(y + top / map.scale), ...p])}));
	const geom = grow.some(Boolean) ? {p: [[-left, -top], [pixels.width + right, -top], [pixels.width + right, pixels.height + bottom], [-left, pixels.height + bottom]].map(p => map.at(...p))} : copy(target.geom);
	const replay = target.paint.replay == null ? {baseRaster: target.raster, px: map.px.slice(), scale: map.scale, entries: []} : admitPaintReplay(target.paint.replay);
	if (!replay) return null;
	if (target.paint.replay != null) {
		const sheet = replayPaintSheet(replay);
		if (!sheet || sheet.px[0] !== pixels.width || sheet.px[1] !== pixels.height || !sameScale(sheet.scale, map.scale)) return null;
		const expected = await replayPaintEntries(replay, {...options, onProgress: undefined});
		if (!samePixels(pixels, expected)) return null;
	}
	return {frame, target, geom, grow, replay, options, run: new AgentPaintRun(strokes, frame, seed, {pixels, offset: [left, top], scale: map.scale})};
}

export async function encodeAgentPainting(prepared) {
	const {run, frame, target, options = {}} = prepared, {strokes, seed} = run;
	cancelled(options.signal);
	if (!run.done || run.settling || run.surface.wetState) throw new Error('An agent painting must finish before encoding');
	const total = strokes.reduce((n, stroke) => n + stroke.points.length, 0);
	options.onProgress?.({phase: 'encoding', completed: total, total});
	const px = run.surface.toRGBA8();
	if (!target && !px.data.some((v, i) => i % 4 === 3 && v)) return null;
	const raster = await codec.compressed(px), w = frame.w / AGENT_PAINT_GRAIN, h = frame.h / AGENT_PAINT_GRAIN;
	cancelled(options.signal);
	const replay = prepared.replay || {baseRaster: await codec.compressed({width: frame.w, height: frame.h, data: new Uint8ClampedArray(frame.w * frame.h * 4)}), px: [frame.w, frame.h], scale: run.scale, entries: []};
	const contribution = typeof options.contribution === 'string' ? options.contribution : 'paint-' + seed + '-' + (replay.entries.length + 1);
	const entry = {id: contribution, actor: 'agent', strokes, seed, px: [frame.w, frame.h], scale: run.scale, grow: prepared.grow || [0, 0, 0, 0]};
	if (replay.entries.some(row => row.id === contribution)) throw new Error('Paint contribution is already present');
	// Selective Undo needs this contribution's complete replay beside later work. A budget
	// refuses the new contribution before it can replace the kept painting or its history.
	const grown = {...replay, entries: [...replay.entries, entry]};
	if (!paintReplayFits(grown)) throw paintHistoryFull();
	const paint = {...(target?.paint || {}), brush: strokes[0].brush, px: [frame.w, frame.h], scale: run.scale, strokes, seed, replay: grown};
	return {...(target || {}), recognized: 'paint', geom: prepared.geom || {cx: frame.x + w / 2, cy: frame.y + h / 2, w, h}, raster, paint};
}
export async function paintAgentStrokes(raw, seed = 1, target = null, options = {}) {
	if (options.mode === 'water') return paintAgentWater(options.actions ?? raw, seed, target, options);
	if (target?.paint?.mode === 'water') throw Object.assign(new Error('Use Water for this layer, or paint on a new layer.'), {code: 'paint_mode_mismatch'});
	const prepared = target ? await prepareAgentLayerPainting(raw, target, seed, options) : prepareAgentPainting(raw, seed, options);
	if (!prepared) return null;
	await finishRun(prepared.run, options);
	return encodeAgentPainting(prepared);
}
const round = n => Math.round(n * 1000) / 1000;
// The replay's plan for a kept layer: its strokes on the sheet the engine lays for them, which the painter replays (draw/paint-worker.mjs
// `replayCreate`, `replay`). A declared size is not that sheet, and it is not allocated.
export function agentPaintReplayPlan(paint) {
	if (paint?.mode === 'water') return waterReplayPlan(paint);
	const strokes = admitAgentStrokes(paint?.strokes), px = paint?.px;
	if (!strokes || !Array.isArray(px) || px.length !== 2 || !px.every(n => Number.isInteger(n) && n >= 1 && n <= AGENT_PAINT_LIMITS.side)) return null;
	const replay = admitPaintReplay(paint.replay), last = replay?.entries.at(-1), sheet = replay && replayPaintSheet(replay);
	if (!last || last.actor !== 'agent' || last.removed || !sheet || sheet.px[0] !== px[0] || sheet.px[1] !== px[1] || last.px[0] !== px[0] || last.px[1] !== px[1] || replay.views?.some(view => view.at === replay.entries.length) || !sameScale(sheet.scale, paint.scale) || JSON.stringify(admitAgentStrokes(last.strokes)) !== JSON.stringify(strokes) || last.seed !== paint.seed) return null;
	return {strokes, frame: {x: 0, y: 0, w: px[0], h: px[1]}, seed: paint.seed, scale: paint.scale, replay};
}
// The same plan as a run on a surface of its own, for a host that lays it in this realm.
export async function agentPaintReplayRun(paint) {
	if(paint?.mode==='water') {
		const plan=waterReplayPlan(paint);if(!plan)return null;
		const prior={...plan.replay,entries:plan.replay.entries.slice(0,-1)},last=plan.replay.entries.at(-1);
		const restored=await replayPaintEntries(prior,{surface:true,seed:plan.seed}),surface=restored.surface;
		try {
			await surface.reframe(plan.frame.w,plan.frame.h,last.grow[0]-restored.crop[0],last.grow[1]-restored.crop[1]);
			return new AgentWaterReplayRun({...plan,actions:waterActionsInFrame(plan.actions,surface)},surface);
		} catch(error) {surface.dispose();throw error;}
	}
	const plan = agentPaintReplayPlan(paint);
	if (!plan) return null;
	const prior = {...plan.replay, entries: plan.replay.entries.slice(0, -1)}, last = plan.replay.entries.at(-1);
	const pixels = await replayPaintEntries(prior);
	return new AgentPaintRun(plan.strokes, plan.frame, plan.seed, {pixels, offset: last.grow.slice(0, 2), scale: plan.scale});
}

// A human publication has a valid material sheet even though its last stroke has no agent nib.
// Follow the recorded growth and crop dimensions without allocating any pixels.
function replayBrushDefinition(definition) {
	try {
		const parsed = parseBrush(serializeBrush(definition));
		const material = value => Object.fromEntries(['settings', 'rapier', 'wet', 'wetInputs', 'tool'].filter(key => value[key] != null).map(key => [key, value[key]]));
		// The existing preset parser owns instrument limits. A dropped mapping or changed
		// setting is not the captured instrument, so it cannot silently enter material replay.
		return canonicalJSON(material(parsed)) === canonicalJSON(material(definition)) ? parsed : null;
	} catch (_) { return null; }
}

function replayPaintSheet(replay) {
	let px = replay.px.slice(), scale = replay.scale, live = null, viewIndex = 0;
	for (let index = 0; index <= replay.entries.length; index++) {
		const view = replay.views?.[viewIndex];
		if (view?.at === index) {
			const [x0, y0, x1, y1] = view.crop;
			if (x1 >= px[0] || y1 >= px[1]) return null;
			px = [x1 - x0 + 1, y1 - y0 + 1]; live = null; viewIndex++;
		}
		const entry = replay.entries[index];
		if (!entry) break;
		if (entry.actor === 'agent') {
			const [left, top, right, bottom] = entry.grow;
			px = [px[0] + left + right, px[1] + top + bottom];
			if (!boundedSheet(...px) || px[0] !== entry.px[0] || px[1] !== entry.px[1] || !sameScale(scale, entry.scale)) return null;
			live = null;
			continue;
		}
		const sheet = entry.sheet;
		if (entry.mode !== 'water' && entry.brushes.some(brush => !replayBrushDefinition(brush.definition))) return null;
		if (!live || live.id !== sheet.id) {
			if (sheet.offset[0] < 0 || sheet.offset[1] < 0 || sheet.offset[0] + px[0] > sheet.width || sheet.offset[1] + px[1] > sheet.height) return null;
			live = {id: sheet.id, width: sheet.width, height: sheet.height, scale: sheet.scale ?? scale / AGENT_PAINT_GRAIN};
		}
		for (const command of entry.commands || []) if (command.target === 'surface') {
			const args = command.args;
			if (command.method === 'grow') {
				if (args.length !== 4 || args.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
				live.width += args[0] + args[2]; live.height += args[1] + args[3];
				if (!boundedSheet(live.width, live.height)) return null;
			} else if (command.method === 'set' && args[0] === 'scale') {
				if (!(finite(args[1]) && args[1] > 0 && args[1] <= 16)) return null;
				live.scale = args[1];
			}
		}
		const [x0, y0, x1, y1] = entry.crop;
		if (x1 >= live.width || y1 >= live.height) return null;
		px = [x1 - x0 + 1, y1 - y0 + 1]; scale = live.scale * AGENT_PAINT_GRAIN;
	}
	return {px, scale};
}

// Lossless pieces retain their complete source history and name the native crop at the cut.
// Further painting follows that crop. A later cut adds a boundary instead of discarding it.
export function cropPaintReplay(raw, crop) {
	const replay = admitPaintReplay(raw), sheet = replay && replayPaintSheet(replay);
	if (!sheet || !Array.isArray(crop) || crop.length !== 4 || crop.some(n => !Number.isSafeInteger(n) || n < 0) || crop[2] < crop[0] || crop[3] < crop[1] || crop[2] >= sheet.px[0] || crop[3] >= sheet.px[1]) return null;
	const views = replay.views ? replay.views.map(view => ({at: view.at, crop: view.crop.slice()})) : [];
	const at = replay.entries.length, last = views.at(-1);
	if (last?.at === at) last.crop = [last.crop[0] + crop[0], last.crop[1] + crop[1], last.crop[0] + crop[2], last.crop[1] + crop[3]];
	else views.push({at, crop: crop.slice()});
	return {...replay, views};
}

// The kernel can retain a human-ended history without inventing a latest-stroke replay.
export function agentPaintSheetHolds(paint) {
	if (paint?.mode === 'water' && paint.replay == null) return Array.isArray(paint.px) && paint.px.length === 2 && boundedSheet(...paint.px) && finite(paint.scale) && paint.scale > 0 && paint.scale <= 16 && !!waterPaperById(paint.paper);
	if (paint?.strokes != null) return !!agentPaintReplayPlan(paint);
	const replay = admitPaintReplay(paint?.replay), sheet = replay && replayPaintSheet(replay);
	return !!sheet && Array.isArray(paint.px) && paint.px.length === 2 && sheet.px[0] === paint.px[0] && sheet.px[1] === paint.px[1] && sameScale(sheet.scale, paint.scale);
}

const yieldPainting = () => new Promise(resolve => setTimeout(resolve, 0));
const boundedSheet = (width, height) => Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= 12000000;
const samePixels = (a, b) => !!a && !!b && a.width === b.width && a.height === b.height && a.data.length === b.data.length && a.data.every((value, i) => value === b.data[i]);
function cropPaintPixels(pixels, [x0, y0, x1, y1]) {
	if (x1 >= pixels.width || y1 >= pixels.height) throw new Error('The paint replay crop leaves its material');
	const width = x1 - x0 + 1, height = y1 - y0 + 1, data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) data.set(pixels.data.subarray(((y0 + y) * pixels.width + x0) * 4, ((y0 + y) * pixels.width + x1 + 1) * 4), y * width * 4);
	return {width, height, data};
}
async function finishRun(run, {signal, onProgress} = {}) {
	run.deferSettle = true;
	const total = run.strokes.reduce((n, stroke) => n + stroke.points.length, 0);
	while (!run.done) {
		cancelled(signal);
		const start = performance.now(); let samples = 0;
		run.run(() => samples++ >= (signal ? 1 : 8) || performance.now() - start >= 12);
		const completed = run.strokes.slice(0, run.stroke).reduce((n, stroke) => n + stroke.points.length, 0) + run.point;
		onProgress?.({phase: 'painting', completed, total, stroke: run.stroke, point: run.point, strokes: run.strokes.length});
		if (!run.done) await yieldPainting();
	}
	while (!run.finishSlice(performance.now() + 12, 64)) { cancelled(signal); await yieldPainting(); }
	cancelled(signal);
}

// A current-session journal preserves material across human and agent sheets. Saved pixels
// remain the document boundary; callers explicitly request ownership of a live surface.
async function replayPaintEntries(replay, options = {}) {
	cancelled(options.signal);
	let pixels = replay.baseRaster === null && replay.mode === 'water' ? {width:replay.px[0],height:replay.px[1],data:new Uint8ClampedArray(replay.px[0]*replay.px[1]*4)} : await decodePaintRaster(replay.baseRaster, options), live = null, brushes = new Map();
	if (!pixels || pixels.width !== replay.px[0] || pixels.height !== replay.px[1]) throw new Error('The paint replay base does not match its raster');
	if (options.requireEmptyBase === true && pixels.data.some(value => value !== 0)) throw new Error('The new paint layer has unrecorded base material');
	let turn = performance.now(), viewIndex = 0, waterPaper = replay.paper, retainedSurface = null;
	try {
	for (let index = 0; index <= replay.entries.length; index++) {
		cancelled(options.signal);
		const view = replay.views?.[viewIndex];
		if (view?.at === index) {
			pixels = cropPaintPixels(pixels, view.crop);
			if (live?.water) {
				await live.surface.reframe(pixels.width,pixels.height,-live.crop[0]-view.crop[0],-live.crop[1]-view.crop[1]);
				live={surface:live.surface,water:true,crop:[0,0,pixels.width-1,pixels.height-1]};
			} else live=null;
			brushes = new Map(); viewIndex++;
		}
		const entry = replay.entries[index];
		if (!entry) break;
		if (entry.mode === 'water') {
			if (entry.actor === 'agent') {
				const [left,top,right,bottom]=entry.grow, width=pixels.width+left+right, height=pixels.height+top+bottom;
				if (!boundedSheet(width,height) || width!==entry.px[0] || height!==entry.px[1]) throw new Error('The Water replay sheet does not match its growth');
				if(live?.water) await live.surface.reframe(width,height,left-live.crop[0],top-live.crop[1]);
				else {
					const surface=await waterSurface(width,height,entry.scale,waterPaper || entry.paper,entry.seed);
					live={surface,water:true};
					if(replay.baseRaster!==null || index>0)await surface.fromRGBA8(pixels.data,pixels.width,pixels.height,left,top);
				}
				live.id=null;live.crop=[0,0,width-1,height-1];
				// Tip data remains a dependency of later strokes after its introducing marks are removed.
				const actions=entry.removed?entry.actions.filter(action=>action.kind==='tip'):entry.actions;
				await applyWaterActions(live.surface,waterActionsInFrame(actions,live.surface),{...options,replayFrames:true,frameOffset:live.surface.origin.slice()});
				pixels=await live.surface.toRGBA8();waterPaper=live.surface.paperId;brushes=new Map();
			} else {
				const sheet=entry.sheet;
				if(!live || live.id!==sheet.id || !live.water) {
					if(live?.water) await live.surface.reframe(sheet.width,sheet.height,sheet.offset[0]-live.crop[0],sheet.offset[1]-live.crop[1]);
					else {
						const surface=await waterSurface(sheet.width,sheet.height,sheet.scale*AGENT_PAINT_GRAIN,waterPaper || sheet.options.paper,sheet.waterFrame?.seed??sheet.options.seed,sheet.waterFrame?.origin,sheet.waterFrame);
						live={surface,water:true};
						if(replay.baseRaster!==null || index>0)await surface.fromRGBA8(pixels.data,pixels.width,pixels.height,...sheet.offset);
					}
					live.id=sheet.id;brushes=new Map();
				}
				const origin=sheet.waterFrame?.origin??[0,0],frameOffset=live.surface.origin.map((value,index)=>value-origin[index]);
				await applyWaterActions(live.surface,waterActionsInFrame(entry.actions,live.surface,origin),{...options,replayFrames:true,frameOffset});
				waterPaper=live.surface.paperId;
				const [x0,y0,x1,y1]=entry.crop, box={x0,y0,x1,y1};
				pixels=await live.surface.toRGBA8(box);live.crop=entry.crop.slice();
			}
			live.surface.takeWaterReplay();
			continue;
		}
		if (entry.actor === 'agent') {
			live = null; brushes = new Map();
			const grow = entry.grow, width = pixels.width + grow[0] + grow[2], height = pixels.height + grow[1] + grow[3];
			if (!boundedSheet(width, height) || entry.px[0] !== width || entry.px[1] !== height) throw new Error('The paint replay sheet does not match its growth');
			const strokes = admitAgentStrokes(entry.strokes);
			if (!strokes) throw new Error('The paint replay brush is unavailable');
			const run = new AgentPaintRun(strokes, {x: 0, y: 0, w: width, h: height}, entry.seed, {pixels, offset: grow.slice(0, 2), scale: entry.scale, deferSettle: true});
			if (!entry.removed) await finishRun(run, options);
			pixels = run.surface.toRGBA8();
			continue;
		}
		const sheet = entry.sheet;
		if (!live || live.id !== sheet.id) {
			const surface = new PaintSurface(sheet.width, sheet.height, sheet.options);
			if (sheet.offset[0] < 0 || sheet.offset[1] < 0 || sheet.offset[0] + pixels.width > sheet.width || sheet.offset[1] + pixels.height > sheet.height) throw new Error('The paint replay does not hold its previous raster');
			surface.fromRGBA8(pixels.data, pixels.width, pixels.height, ...sheet.offset);
			surface.scale = sheet.scale ?? replay.scale / AGENT_PAINT_GRAIN;
			surface.paper = sheet.paper ?? null; surface.toothOX = sheet.toothOX ?? 0; surface.toothOY = sheet.toothOY ?? 0;
			live = {id: sheet.id, surface}; brushes = new Map();
		}
		const surface = live.surface;
		for (const {id, definition} of entry.brushes) if (!brushes.has(id)) {
			const admitted = replayBrushDefinition(definition);
			if (!admitted) throw new Error('The captured paint brush is invalid');
			brushes.set(id, new PaintBrush(admitted));
		}
		for (const command of entry.commands) {
			cancelled(options.signal);
			const args = command.args;
			if (command.target === 'brush') {
				const brush = brushes.get(command.id); if (!brush) throw new Error('A replay brush is missing');
				brush[command.method](...args);
			} else if (command.target === 'stroke') {
				const brush = brushes.get(command.brushId); if (!brush) throw new Error('A replay brush is missing');
				brush.strokeTo(surface, ...args);
			} else if (command.method === 'set') {
				if (args[0] === 'scale' && !(finite(args[1]) && args[1] > 0 && args[1] <= 16)) throw new Error('Invalid paint replay scale');
				surface[args[0]] = args[1];
			} else if (command.method === 'grow') {
				if (args.length !== 4 || args.some(n => !Number.isSafeInteger(n) || n < 0) || !boundedSheet(surface.width + args[0] + args[2], surface.height + args[1] + args[3])) throw new Error('Invalid paint replay growth');
				surface.grow(...args);
			} else surface[command.method](...args);
			if (performance.now() - turn >= 12) { await yieldPainting(); turn = performance.now(); }
		}
		const [x0, y0, x1, y1] = entry.crop;
		if (x1 >= surface.width || y1 >= surface.height) throw new Error('Invalid paint replay publication');
		pixels = surface.toRGBA8({x0, y0, x1, y1});
	}
	cancelled(options.signal);
	if(options.surface && replay.mode==='water') {
		if(!live?.water) {
			const surface=await waterSurface(pixels.width,pixels.height,replay.scale,waterPaper,options.seed);
			live={surface,water:true,crop:[0,0,pixels.width-1,pixels.height-1]};
			if(replay.baseRaster!==null)await surface.fromRGBA8(pixels.data,pixels.width,pixels.height);
		}
		retainedSurface=live.surface;
		return {pixels,surface:retainedSurface,crop:live.crop.slice()};
	}
	return options.material ? {pixels,state:null} : pixels;
	} finally { if (live?.water && live.surface!==retainedSurface) live.surface.dispose(); }
}

// Removing a contribution is another material replay, never a pixel replacement over a later
// human stroke. First prove the captured inputs still account for the current saved raster.
export async function replayAgentPainting(shape, omitIds, options = {}) {
	cancelled(options.signal);
	const replay = admitPaintReplay(shape?.paint?.replay), ids = new Set(omitIds);
	if (!replay || !replayPaintSheet(replay) || !ids.size || [...ids].some(id => !replay.entries.some(entry => entry.actor === 'agent' && !entry.removed && entry.id === id))) return null;
	const water=shape.paint.mode==='water', session=options.waterSession || waterSession();
	if (water && (replay.session !== session || !options.waterAuthorized && !waterPaintingIsLive(shape, session))) return null;
	const actual=await decodePaintRaster(shape.raster, options);
	if (!water && !samePixels(actual, await replayPaintEntries(replay, options))) return null;
	const revised = {...replay, entries: replay.entries.map(entry => ids.has(entry.id) ? {...entry, removed: true} : entry)};
	const pixels = await replayPaintEntries(revised, options);
	if (pixels.width !== actual.width || pixels.height !== actual.height) throw new Error('Paint replay changed the current pixel frame');
	const raster = water ? await encodeWaterRaster(pixels,options) : await codec.compressed(pixels);
	cancelled(options.signal);
	const paint = {...shape.paint, replay: revised}; delete paint.strokes; delete paint.actions; delete paint.seed;
	if (water) paint.paper=waterReplayPaper(revised);
	const result={...shape, raster, paint};
	if (water) rememberWaterPainting(result, session);
	return result;
}

function paintHistoryFull() {
	return Object.assign(new Error('The paint history is full. Continue on a new layer.'), {code:'paint_history_full'});
}
async function waterSurface(width,height,scale,paper,seed=1,origin,frame=null) {
	const material=frame?Object.fromEntries(['paperScale','paperOrigin','paperSeed'].filter(key=>frame[key]!=null).map(key=>[key,frame[key]])):{};
	const surface=new WaterSurface(width,height,{pixelScale:scale,paper,seed,...(origin?{origin}: {}),...material});
	await surface.ready;
	return surface;
}
async function applyWaterActions(surface,actions,options={}) {
	for(let index=0;index<actions.length;index++) {
		cancelled(options.signal);
		for await(const step of surface.applyWaterSteps(actions[index],{replayFrames:options.replayFrames===true,frameOffset:options.frameOffset})) {cancelled(options.signal);await yieldPainting();}
		options.onProgress?.({phase:'painting',completed:index+1,total:actions.length});
		await yieldPainting();
	}
}
async function encodeWaterRaster(pixels,options={}) {
	const job=encodeJXLSteps(pixels.data,pixels.width,pixels.height,{quality:100});
	for(let result=job.next();!result.done;result=job.next()) {cancelled(options.signal);await yieldPainting();}
	cancelled(options.signal);
	let binary=''; const bytes=job.bytes;
	for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));
	return 'data:image/jxl;base64,'+btoa(binary);
}
function waterActionMap(actions,map) {
	return actions.map(action=>({...action,...(action.paths?{paths:action.paths.map(path=>path.map(map))}:{}),...(action.at?{at:map(action.at).slice(0,2)}:{})}));
}
function waterActionsInFrame(actions,surface,origin=[0,0]) {
	const dx=(surface.origin[0]-origin[0])/surface.pixelScale,dy=(surface.origin[1]-origin[1])/surface.pixelScale;
	return dx || dy ? waterActionMap(actions,([x,y,...rest])=>[x+dx,y+dy,...rest]) : actions;
}
function waterActionBounds(actions) {
	let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,reach=4;
	for(const action of actions) {
		const size=action.controls?.size??50;
		reach=Math.max(reach,4+3*(action.controls?.radius??waterRadius(size)));
		for(const path of action.paths || (action.at?[[action.at]]:[])) for(const [x,y] of path) {x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
	}
	return Number.isFinite(x0)?{x:x0-reach,y:y0-reach,w:x1-x0+2*reach,h:y1-y0+2*reach}:null;
}

// Raster and physical source cross the publication boundary together. A larger source is refused
// before any kept recipe is touched; the caller's current material remains available to recover.
export function waterReplayAt(prior,capture,box,{raster=null,px,scale=AGENT_PAINT_GRAIN,sheet}={}) {
	if(!capture || !sheet || !box) return prior || null;
	const actions=admitWaterActions(capture.actions);
	if(!actions) throw Object.assign(new Error('Invalid Water actions'),{code:'paint_strokes_invalid'});
	const session=sheet.options.waterSession || waterSession();
	let replay=prior?.session===session?admitPaintReplay(prior):{mode:'water',paper:sheet.options.paper,session,baseRaster:raster,px:px.slice(),scale,entries:[]};
	if(!replay)throw Object.assign(new Error('Invalid Water source'),{code:'paint_sheet_invalid'});
	replay={...replay,mode:'water',paper:replay.paper || sheet.options.paper};
	const id=sheet.id+'-water',entry={id,actor:'human',mode:'water',sheet:{...copy(sheet),...(capture.frame?{waterFrame:copy(capture.frame)}:{})},actions,crop:[box.x0,box.y0,box.x1,box.y1]};
	const at=replay.entries.findIndex(row=>row.id===id);
	// A sheet born empty has no imported pixels to displace when it grows. Its frame
	// already locates every recorded contact in the stable paper coordinate system.
	if(replay.baseRaster===null && (replay.entries.length===0 || at===0))entry.sheet.offset=[0,0];
	if(at<0)replay.entries.push(entry);else replay.entries[at]=entry;
	if(!paintReplayFits(replay))throw paintHistoryFull();
	const admitted=admitPaintReplay(replay);
	if(!admitted)throw Object.assign(new Error('Invalid Water replay frame'),{code:'paint_sheet_invalid'});
	return admitted;
}

export async function restoreWaterReplay(raw,options={}) {
	const replay=admitPaintReplay(raw);
	if(!replay || replay.mode!=='water' || !replayPaintSheet(replay))throw Object.assign(new Error('Invalid Water replay'),{code:'paint_sheet_invalid'});
	if (replay.session !== (options.waterSession || waterSession())) throw Object.assign(new Error('This Water journal belongs to another painting session.'), {code:'paint_target_changed'});
	return replayPaintEntries(replay,{...options,material:true});
}

export async function sampleAgentPainting(shape,point,options={}) {
	const map=layerMap(shape,16384);
	if(shape?.paint?.mode!=='water' || !map || !Array.isArray(point) || point.length!==2 || !point.every(finite))return null;
	await waterReady(); cancelled(options.signal);
	const pixels=await decodePaintRaster(shape.raster,options);
	if (!pixels || pixels.width!==map.px[0] || pixels.height!==map.px[1]) return null;
	const surface=await waterSurface(pixels.width,pixels.height,shape.paint.scale,shape.paint.paper);
	try {
		await surface.fromRGBA8(pixels.data,pixels.width,pixels.height);
		const sample=await surface.samplePigment(...map.local(point));
		cancelled(options.signal);
		return sample?{...sample,pigment:admitWaterPigment(Object.fromEntries(['coefficients','granulation','staining','source'].filter(key=>sample[key]!=null).map(key=>[key,sample[key]])))}:null;
	} finally { surface.dispose(); }
}

async function paintAgentWater(raw,seed,target,options) {
	cancelled(options.signal);
	await waterReady(); cancelled(options.signal);
	let actions=admitWaterActions(lowerWaterActions(raw,options.recipe));
	if(actions?.some(action=>action.frame || action.frames?.some(frame=>frame.length===4)))throw Object.assign(new Error('A new Water action cannot change a stored material frame.'),{code:'paint_strokes_invalid'});
	const paper=options.paper || target?.paint?.paper || 'cold-press';
	const session=options.waterSession || waterSession();
	if(!actions || !actions.length || !waterPaperById(paper) || !Number.isInteger(seed) || seed<0 || seed>0x7fffffff)return null;
	const map=target&&layerMap(target,16384);
	if(target&&!map)return null;
	if(target && options.paper && options.paper!==target.paint?.paper) actions=[{kind:'paper',paper},...actions];
	if(map)actions=waterActionMap(actions,map.local);
	const bounds=waterActionBounds(actions);
	if(!target&&!bounds)return null;
	let pixels=null,replay,geom,frame,retained=false,grow=[0,0,0,0],scale=map?.scale || AGENT_PAINT_GRAIN;
	if(target) {
		pixels=await decodePaintRaster(target.raster,options);
		if(!pixels || pixels.width!==map.px[0] || pixels.height!==map.px[1])return null;
		retained=target.paint.replay?.session===session && (options.waterAuthorized || waterPaintingIsLive(target,session));
		replay=retained?admitPaintReplay(target.paint.replay):{mode:'water',paper,session,baseRaster:target.raster,px:map.px.slice(),scale,entries:[]};
		if(!replay)return null;
		replay={...replay,mode:'water',paper:replay.paper || paper};
		if(bounds)grow=[Math.max(0,Math.ceil(-bounds.x*scale)),Math.max(0,Math.ceil(-bounds.y*scale)),Math.max(0,Math.ceil((bounds.x+bounds.w)*scale-pixels.width)),Math.max(0,Math.ceil((bounds.y+bounds.h)*scale-pixels.height))];
		frame={x:0,y:0,w:pixels.width+grow[0]+grow[2],h:pixels.height+grow[1]+grow[3]};
		actions=waterActionMap(actions,([x,y,...rest])=>[x+grow[0]/scale,y+grow[1]/scale,...rest]);
		geom=grow.some(Boolean)?{p:[[-grow[0],-grow[1]],[pixels.width+grow[2],-grow[1]],[pixels.width+grow[2],pixels.height+grow[3]],[-grow[0],pixels.height+grow[3]]].map(p=>map.at(...p))}:copy(target.geom);
	} else {
		frame={x:bounds.x,y:bounds.y,w:Math.ceil(bounds.w*scale),h:Math.ceil(bounds.h*scale)};
		actions=waterActionMap(actions,([x,y,...rest])=>[x-frame.x,y-frame.y,...rest]);
		replay={mode:'water',paper,session,baseRaster:null,px:[frame.w,frame.h],scale,entries:[]};
		geom={cx:frame.x+frame.w/scale/2,cy:frame.y+frame.h/scale/2,w:frame.w/scale,h:frame.h/scale};
	}
	if(!boundedSheet(frame.w,frame.h))return null;
	const id=typeof options.contribution==='string'?options.contribution:'paint-'+seed+'-'+(replay.entries.length+1);
	if(replay.entries.some(row=>row.id===id))throw new Error('Paint contribution is already present');
	const entry={id,actor:'agent',mode:'water',actions,seed,paper,px:[frame.w,frame.h],scale,grow};
	const grown={...replay,entries:[...replay.entries,entry]};
	if(!paintReplayFits(grown))throw paintHistoryFull();
	if(!admitPaintReplay(grown))return null;
	let surface;
	try {
		if(retained) {
			const restored=await replayPaintEntries(replay,{...options,surface:true,seed});surface=restored.surface;
			await surface.reframe(frame.w,frame.h,grow[0]-restored.crop[0],grow[1]-restored.crop[1]);
		} else {
			surface=await waterSurface(frame.w,frame.h,scale,paper,seed);
			if(pixels)await surface.fromRGBA8(pixels.data,pixels.width,pixels.height,...grow.slice(0,2));
		}
		await applyWaterActions(surface,waterActionsInFrame(actions,surface),options);
		const painted=await surface.toRGBA8();
		if(!target&&!painted.data.some((value,index)=>index%4===3&&value))return null;
		const raster=await encodeWaterRaster(painted,options);
		if(raster.length>8*1024*1024)throw Object.assign(new Error('The painted layer is full. Continue on a new layer.'),{code:'paint_layer_full'});
		const paint={...(target?.paint||{}),mode:'water',paper:surface.paperId,brush:actions.find(action=>typeof action.brush==='string')?.brush || 'water/round',px:[frame.w,frame.h],scale,seed,replay:grown};
		delete paint.strokes;delete paint.actions;
		const result={...(target||{}),recognized:'paint',geom,raster,paint};
		rememberWaterPainting(result,session);
		return result;
	} finally { surface?.dispose(); }
}

function waterReplayPaper(replay) {
	let paper=replay.paper;
	for (const entry of replay.entries) if (!entry.removed) {
		for (const action of entry.actions || []) if (action.paper) paper=action.paper;
	}
	return paper;
}

function waterReplayOrigin(replay) {
	let origin=[0,0],water=false,viewIndex=0;
	for(let index=0;index<=replay.entries.length;index++) {
		const view=replay.views?.[viewIndex];
		if(view?.at===index){origin=[origin[0]+view.crop[0],origin[1]+view.crop[1]];viewIndex++;}
		const entry=replay.entries[index];if(!entry)break;
		if(entry.mode!=='water'){origin=[0,0];water=false;continue;}
		if(entry.actor==='agent')origin=[0,0];
		else {const frame=entry.sheet.waterFrame;origin=frame?.origin?.slice() || (water?[origin[0]-entry.sheet.offset[0],origin[1]-entry.sheet.offset[1]]:[0,0]);origin=[origin[0]+entry.crop[0],origin[1]+entry.crop[1]];}
		water=true;
	}
	return origin;
}

function waterReplayPlan(paint) {
	const replay=admitPaintReplay(paint?.replay),last=replay?.entries.at(-1),sheet=replay&&replayPaintSheet(replay);
	if(!last || last.actor!=='agent' || last.mode!=='water' || last.removed || !sheet || !Array.isArray(paint.px) || !sameScale(sheet.scale,paint.scale) || sheet.px.some((value,index)=>value!==paint.px[index]) || replay.views?.some(view=>view.at===replay.entries.length))return null;
	const strokes=[],origin=waterReplayOrigin(replay);
	for(const [actionIndex,action] of last.actions.entries())for(const path of action.paths || []) {
		const pigment=WATER_PIGMENTS.find(row=>row.id===action.pigment);
		strokes.push({brush:action.brush,colour:pigment?.colour || '#526581',size:action.controls?.size??50,points:path.map(([x,y,pressure])=>[x-origin[0]/paint.scale,y-origin[1]/paint.scale,pressure]),actionIndex});
	}
	return {mode:'water',paper:last.paper,actions:last.actions,strokes,frame:{x:0,y:0,w:paint.px[0],h:paint.px[1]},seed:last.seed,scale:paint.scale,replay};
}
class AgentWaterReplayRun {
	constructor(plan,surface) {Object.assign(this,plan);this.surface=surface;this.stroke=0;this.point=0;this.action=0;this.path=0;this.iterator=null;}
	get done(){return this.action>=this.actions.length;}
	async run(until=()=>false) {
		let points=0;
		while(!this.done) {
			const indices=this.strokes.map((stroke,index)=>stroke.actionIndex===this.action?index:-1).filter(index=>index>=0);
			const next=indices[this.path];
			if(next!=null&&until(next,this.point))break;
			this.iterator ||= this.surface.applyWaterSteps(this.actions[this.action]);
			const step=await this.iterator.next();
			if(step.done){this.iterator=null;this.action++;this.path=0;this.point=0;continue;}
			if(Number.isSafeInteger(step.value?.path)&&Number.isSafeInteger(step.value?.point)) {
				this.path=step.value.path;this.stroke=indices[this.path];this.point=step.value.point+1;points++;
				if(this.point>=this.strokes[this.stroke].points.length){this.path++;this.stroke=indices[this.path]??this.stroke+1;this.point=0;}
			}
		}
		return points;
	}
	finishSlice(){return this.done;}
}

function lowerWaterActions(raw,recipe) {
	if(!Array.isArray(raw))return raw;
	return raw.map(action=>{
		if(!['text','trace'].includes(action?.kind))return action;
		const {kind,seed=1,brush='water/round',pigment='ultramarine',controls={},paper,pressure=.65,tick=0,speed=180,...input}=action;
		let paths;
		if(kind==='text') {
			const {text,at=[0,0],textSize=48,set='water-hand',align='left',lineHeight=1.5,spacing=.12,...rest}=input;
			if(Object.keys(rest).length || !Array.isArray(at) || at.length!==2)throw Object.assign(new Error('Invalid Water text inputs'),{code:'paint_strokes_invalid'});
			paths=waterTextPaths(text,{x:at[0],y:at[1],size:textSize,set,align,lineHeight,spacing,pressure,tick,speed}).paths;
		}else {
			const {shapeId,...rest}=input;
			const shape=recipe?.shapes?.find(shape=>shape.id===shapeId);
			if(Object.keys(rest).length || !shape)throw Object.assign(new Error('Trace a shape from this inspected drawing.'),{code:'paint_target_invalid'});
			paths=waterTracePaths(shape,recipe,{pressure,tick,speed}).paths;
		}
		return {kind:'stroke',seed,brush,pigment,controls,source:kind,paths,...(paper?{paper}:{})};
	});
}
