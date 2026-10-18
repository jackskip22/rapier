// SPDX-License-Identifier: AGPL-3.0-only
import {textHead, textBytes} from './text-surface.mjs';
import {storedPaintPointCount} from '../draw/paint-limits.mjs';

const pathSummary = (points, seated = false) => ({points: seated ? storedPaintPointCount(points) : points.length,
  from: points[0].slice(0, 2), to: points.at(-1).slice(0, 2)});
const pigmentSummary = pigment => typeof pigment === 'string' ? pigment : pigment ? {
  coefficients: pigment.coefficients, ...(pigment.source ? {source: pigment.source} : {})} : null;

function* paintingRows(recipe) {
  yield {coordinates: 'Each contribution\'s recorded sheet', undo: 'An act reverses all its changes, including grouped strokes.'};
  for (const shape of recipe.shapes) {
    if (shape.recognized !== 'paint') continue;
    const paint = shape.paint || {}, replay = paint.replay;
    const entries = replay?.entries || (paint.strokes || paint.actions ? [{strokes: paint.strokes, actions: paint.actions,
      mode: paint.mode, actor: 'unknown'}] : []);
    yield {layer: shape.id, mode: paint.mode || 'paint', history: replay ? 'retained' : entries.length ? 'partial' : 'unavailable',
      ...(replay ? {base: replay.baseRaster === null ? 'empty' : 'unrecorded'} : {})};
    let order = 0;
    for (const entry of entries) {
      const base = {layer: shape.id, contribution: entry.id || null, actor: entry.actor,
        ...(entry.removed ? {removed: true} : {})};
      if (entry.mode === 'water' || entry.actions) {
        for (const [index, action] of (entry.actions || []).entries()) {
          const common = {...base, action: index + 1, tool: action.controls?.erase ? 'erase' : action.kind === 'stroke' ? action.tool : action.kind,
            ...(typeof action.brush === 'string' ? {brush: action.brush, pigment: pigmentSummary(action.pigment), size: action.controls?.size} : {}),
            ...(action.source ? {source: action.source} : {})};
          if (action.kind === 'stroke') {
            for (const [path, points] of action.paths.entries()) yield {...common, order: ++order, path: path + 1, points: pathSummary(points)};
          } else yield {...common, order: ++order, ...(action.at ? {at: action.at} : {}),
            ...(action.kind === 'advance' ? {ticks: action.ticks, dt: action.dt ?? 1 / 60} : {}),
            ...(action.kind === 'paper' ? {paper: action.paper} : {}),
            ...(action.kind === 'tip' ? {brush: action.brush.brush} : {})};
        }
      } else if (entry.strokes) {
        for (const [index, stroke] of entry.strokes.entries()) yield {...base, order: ++order, stroke: index + 1,
          tool: stroke.erase ? 'erase' : 'paint', brush: stroke.brush, pigment: stroke.pigment === false ? null : stroke.colour,
          size: stroke.size, points: pathSummary(stroke.points, true)};
      } else {
        yield {...base, order: ++order, strokes: 'unavailable', commands: entry.commands?.length || 0};
      }
    }
  }
}

export function readPainting(recipe, position, budget, actFor) {
  if (position === null) return {text: '', next: null};
  const first = position?.row || 0, offset = position?.offset || 0;
  let row = 0, text = '', remaining = budget;
  for (const record of paintingRows(recipe)) {
    if (row < first) {row++; continue;}
    const line = JSON.stringify(record.contribution ? {...record, act: actFor(record.layer, record.contribution)} : record) + '\n';
    const at = row === first ? offset : 0, tail = line.slice(at);
    if (text && textBytes(tail) > remaining) return {text, next: {row, offset: at}};
    const part = textHead(tail, remaining);
    text += part; remaining -= textBytes(part);
    if (part.length < tail.length) return {text, next: {row, offset: at + part.length}};
    row++;
  }
  return {text, next: null};
}
