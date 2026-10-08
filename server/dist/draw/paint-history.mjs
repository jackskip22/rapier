// SPDX-License-Identifier: AGPL-3.0-only
// Stored paint commands are document data. Admission does not load the material engine.
import {admitWaterActions, waterPaperById} from './water-data.mjs';
import {AGENT_PAINT_LIMITS,storedPaintPointCount,PAINT_REPLAY_MAX_BYTES,paintReplayFits} from './paint-limits.mjs';
export {PAINT_REPLAY_MAX_BYTES,paintReplayFits};
const finite = n => typeof n === 'number' && Number.isFinite(n);
const unit = n => finite(n) && n >= 0 && n <= 1;
const integer = n => Number.isSafeInteger(n) && n >= 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const dimensions = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isSafeInteger(n) && n > 0 && n <= 16384) && v[0] * v[1] <= 12000000;
const scale = n => finite(n) && n > 0 && n <= 16;
const copy = v => structuredClone(v);

export function admitPaintStrokeRecords(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > AGENT_PAINT_LIMITS.strokes) return null;
  const strokes = []; let total = 0;
  for (const s of raw) {
    if (!object(s) || typeof s.brush !== 'string' || !s.brush || s.brush.length > 96 || typeof s.colour !== 'string' || !/^#[0-9a-f]{6}$/.test(s.colour)) return null;
    if (!(finite(s.size) && s.size >= 0 && s.size <= 100) || s.load != null && !unit(s.load) || s.water != null && !unit(s.water)) return null;
    if (s.angle != null && !(finite(s.angle) && s.angle >= 0 && s.angle <= 179)) return null;
    if (s.follow != null && typeof s.follow !== 'boolean' || s.erase != null && typeof s.erase !== 'boolean') return null;
    if (!Array.isArray(s.points) || !s.points.length || storedPaintPointCount(s.points) > AGENT_PAINT_LIMITS.points ||
        (total += storedPaintPointCount(s.points)) > AGENT_PAINT_LIMITS.total) return null;
    if (!s.points.every(p => Array.isArray(p) && (p.length === 2 || p.length === 3 && unit(p[2])) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 1e6 && Math.abs(p[1]) <= 1e6)) return null;
    const stroke = {brush: s.brush, colour: s.colour, size: s.size, points: s.points.map(p => p.slice())};
    for (const key of ['load', 'water', 'angle', 'follow', 'erase']) if (s[key] != null) stroke[key] = s[key];
    strokes.push(stroke);
  }
  return strokes;
}

const surfaceMethods = new Set(['set', 'grow', 'tilt', 'settleWet', '_finishWetWork', 'stepWet', 'composeWet']);
const brushMethods = new Set(['seed', 'setColor', 'setBaseValue', 'reset', 'newStroke', 'rebase', 'setHead']);
const properties = new Set(['paper', 'scale', 'toothOX', 'toothOY', 'wetPending']);
const wetTime = n => finite(n) && n >= 0 && n <= 60000;
const dataOnly = (value, depth = 0) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 12 || typeof value !== 'object') return false;
  return Object.values(value).every(v => dataOnly(v, depth + 1));
};

// Replay custody fits the document's material budget (draw/paint-limits.mjs owns the bound: the UTF-8 bytes of every retained command,
// captured brush definition and base raster); a history past it is never admitted. The Paint tool may drop replay while its source
// transaction owns Undo (draw/paint-tool.js _rapierPaintReplayAt); an agent contribution requires selective Undo and refuses instead
// (draw/agent-paint.mjs encodeAgentPainting), preserving the kept painting and its replay.
export function admitPaintReplay(raw, validRaster = value => typeof value === 'string' && /^data:image\/(png|jxl);base64,/.test(value)) {
  if (!object(raw) || !(raw.mode === 'water' && raw.baseRaster === null || validRaster(raw.baseRaster)) || !dimensions(raw.px) || !scale(raw.scale) || !Array.isArray(raw.entries)) return null;
  if (raw.mode != null && raw.mode !== 'water' || raw.mode === 'water' && (!waterPaperById(raw.paper) || !identity(raw.session))) return null;
  if (!paintReplayFits(raw)) return null;
  const views = [];
  if (raw.views != null) {
    if (!Array.isArray(raw.views)) return null;
    let previous = -1;
    for (const view of raw.views) {
      if (!object(view) || !integer(view.at) || view.at > raw.entries.length || view.at <= previous ||
        !Array.isArray(view.crop) || view.crop.length !== 4 || !view.crop.every(integer) ||
        view.crop[2] < view.crop[0] || view.crop[3] < view.crop[1] ||
        !dimensions([view.crop[2] - view.crop[0] + 1, view.crop[3] - view.crop[1] + 1])) return null;
      views.push({at: view.at, crop: view.crop.slice()}); previous = view.at;
    }
  }
  const entries = [], ids = new Set(); let waterSeen = false;
  for (const entry of raw.entries) {
    if (!object(entry) || !identity(entry.id) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    if (entry.mode === 'water') {
      if(raw.mode !== 'water')return null;
      waterSeen = true;
      const actions = admitWaterActions(entry.actions);
      if (!actions || !['agent', 'human'].includes(entry.actor)) return null;
      if (entry.actor === 'agent') {
        if (!integer(entry.seed) || entry.seed > 0x7fffffff || !waterPaperById(entry.paper) || !dimensions(entry.px) || !scale(entry.scale) || !Array.isArray(entry.grow) || entry.grow.length !== 4 || !entry.grow.every(n => integer(n) && n <= 16384)) return null;
        const kept = {id: entry.id, actor: 'agent', mode: 'water', actions, seed: entry.seed, paper: entry.paper, px: entry.px.slice(), scale: entry.scale, grow: entry.grow.slice()};
        if (entry.removed != null) {if (typeof entry.removed !== 'boolean') return null; kept.removed = entry.removed;}
        entries.push(kept); continue;
      }
      const sheet = entry.sheet, crop = entry.crop;
      if (!object(sheet) || !(identity(sheet.id) || Number.isSafeInteger(sheet.id) && sheet.id > 0) || !dimensions([sheet.width, sheet.height]) || !Array.isArray(sheet.offset) || sheet.offset.length !== 2 || !sheet.offset.every(n => Number.isSafeInteger(n) && Math.abs(n) <= 16384) || !scale(sheet.scale) || !object(sheet.options) || sheet.options.mode !== 'water' || !waterPaperById(sheet.options.paper) || !dataOnly(sheet)) return null;
      if (!Array.isArray(crop) || crop.length !== 4 || !crop.every(integer) || crop[2] < crop[0] || crop[3] < crop[1] || !dimensions([crop[2]-crop[0]+1,crop[3]-crop[1]+1])) return null;
      entries.push({id:entry.id,actor:'human',mode:'water',sheet:copy(sheet),actions,crop:crop.slice()}); continue;
    }
    if (entry.mode != null || waterSeen) return null;
    if (entry.actor === 'agent') {
      const strokes = admitPaintStrokeRecords(entry.strokes);
      if (!strokes || !integer(entry.seed) || entry.seed > 0x7fffffff || !dimensions(entry.px) || !scale(entry.scale) ||
          !Array.isArray(entry.grow) || entry.grow.length !== 4 || !entry.grow.every(n => integer(n) && n <= 16384)) return null;
      const kept = {id: entry.id, actor: 'agent', strokes, seed: entry.seed, px: entry.px.slice(), scale: entry.scale, grow: entry.grow.slice()};
      if (entry.removed != null) {if (typeof entry.removed !== 'boolean') return null; kept.removed = entry.removed;}
      entries.push(kept);
      continue;
    }
    if (entry.actor !== 'human' || !object(entry.sheet) || !Array.isArray(entry.brushes) || !Array.isArray(entry.commands)) return null;
    const sheet = entry.sheet;
    if (!(identity(sheet.id) || Number.isSafeInteger(sheet.id) && sheet.id > 0) || !dimensions([sheet.width, sheet.height])) return null;
    if (!Array.isArray(sheet.offset) || sheet.offset.length !== 2 || !sheet.offset.every(n => Number.isSafeInteger(n) && Math.abs(n) <= 16384)) return null;
    if (sheet.scale != null && !scale(sheet.scale) || sheet.toothOX != null && !finite(sheet.toothOX) || sheet.toothOY != null && !finite(sheet.toothOY)) return null;
    if (sheet.options != null && (!object(sheet.options) || !dataOnly(sheet.options)) || sheet.paper != null && !dataOnly(sheet.paper)) return null;
    const brushIds = new Set();
    for (const brush of entry.brushes) {
      if (!object(brush) || !Number.isSafeInteger(brush.id) || brush.id < 1 || brushIds.has(brush.id) || !object(brush.definition) || !Array.isArray(brush.definition.settings) || !dataOnly(brush.definition)) return null;
      brushIds.add(brush.id);
    }
    for (const c of entry.commands) {
      if (!object(c) || !Array.isArray(c.args) || !dataOnly(c.args)) return null;
      if (c.target === 'stroke') {
        if (!brushIds.has(c.brushId) || c.args.length < 3 || c.args.length > 11 || !c.args.every((v, i) => i < 10 ? finite(v) : typeof v === 'boolean')) return null;
        if (c.args.length > 5 && !(c.args[5] >= 0 && c.args[5] <= 60)) return null;
      } else if (c.target === 'brush') {
        if (!brushIds.has(c.id) || !brushMethods.has(c.method)) return null;
      } else if (c.target === 'surface') {
        if (!surfaceMethods.has(c.method) || c.method === 'set' && !properties.has(c.args[0])) return null;
        // Stored drying is the exact bounded feed, never a clock-driven loop. Each event
        // has bounded representable time independently of the history's event count.
        if (c.method === 'stepWet' && (c.args.length !== 2 || !c.args.every(wetTime))) return null;
        if (c.method === 'set' && c.args[0] === 'wetPending' && (c.args.length !== 2 || !wetTime(c.args[1]))) return null;
      } else return null;
    }
    if (!Array.isArray(entry.crop) || entry.crop.length !== 4 || !entry.crop.every(integer) || entry.crop[2] < entry.crop[0] || entry.crop[3] < entry.crop[1] || !dimensions([entry.crop[2] - entry.crop[0] + 1, entry.crop[3] - entry.crop[1] + 1])) return null;
    entries.push(copy(entry));
  }
  return {baseRaster: raw.baseRaster, px: raw.px.slice(), scale: raw.scale, entries, ...(raw.mode === 'water' ? {mode: 'water', paper: raw.paper, session: raw.session} : {}), ...(views.length ? {views} : {})};
}
