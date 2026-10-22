// SPDX-License-Identifier: AGPL-3.0-only
import {parseFlowchart as _specParseFlowchart, editFlowchartLabel as _specEditFlowchartLabel, FLOWCHART_LIMITS, nextFlowchartId, addFlowchartBox, connectFlowchartBoxes, deleteFlowchartBox,
  deleteFlowchartEdge, setFlowchartShape, setFlowchartDirection, setFlowchartEdgeLabel} from '../spec/flowchart.mjs';
import {_rapierDrawNormalizeAgentRecipe, _rapierDrawBuildSVG, _rapierDrawReadRecipeFromSVGText, _rapierDrawShapeBBoxIn} from './core.mjs';
import {FLOWCHART_LAYOUT_LIMITS} from './flowchart-layout.mjs';

const FLOWCHART_SHAPES = Object.freeze({rect: {kind: 'rect'}, round: {kind: 'rect', corner: .08}, stadium: {kind: 'rect', corner: .5},
  circle: {kind: 'circle'}, diamond: {kind: 'diamond'}, cylinder: {kind: 'cylinder'}, subroutine: {kind: 'subroutine'},
  asymmetric: {kind: 'asymmetric'}, hexagon: {kind: 'hexagon', flat: true}});
const FLOWCHART_DIRECTIONS = Object.freeze({TD: 'down', BT: 'up', LR: 'across', RL: 'back'});
const flowchartFailure = () => ({ok: false, accepted: true, code: 'flowchart_layout', reason: 'This flowchart is too large or complex to draw. Shorten its labels or split it into smaller diagrams.'});

const _renderedLayouts = new Map();
const _editLineage = new Map();
const normSource = s => typeof s === 'string' ? s.replace(/\r\n?/g, '\n').trim() : '';
function parseFlowchart(source, ...rest) {
  const res = _specParseFlowchart(source, ...rest);
  if (res && res.ok && res.graph && typeof source === 'string') {
    Object.defineProperty(res.graph, '_source', {value: source, enumerable: false, configurable: true});
  }
  return res;
}

function extractPriorLayout(recipe, graph) {
  if (!recipe || !Array.isArray(recipe.shapes)) return null;
  const across = graph && (graph.direction === 'LR' || graph.direction === 'RL');
  const positions = new Map();
  const nodeBoxes = [];
  for (const shape of recipe.shapes) {
    if (['line', 'arrow', 'text'].includes(shape.recognized) || !shape.geom) continue;
    const b = _rapierDrawShapeBBoxIn(shape, recipe);
    if (!b || !Number.isFinite(b.minX)) continue;
    const entry = {x: b.minX - 40, y: b.minY - 40, w: b.w, h: b.h, cx: (b.minX + b.maxX) / 2 - 40, cy: (b.minY + b.maxY) / 2 - 40};
    positions.set(shape.id, entry);
    nodeBoxes.push({id: shape.id, ...entry});
  }
  if (!positions.size) return null;
  if (graph && (graph.direction === 'RL' || graph.direction === 'BT')) {
    const lo = Math.min(...nodeBoxes.map(b => across ? b.x : b.y)), hi = Math.max(...nodeBoxes.map(b => across ? b.x + b.w : b.y + b.h));
    for (const box of nodeBoxes) {
      if (across) { box.x = lo + hi - box.x - box.w; box.cx = lo + hi - box.cx; } else { box.y = lo + hi - box.y - box.h; box.cy = lo + hi - box.cy; }
      Object.assign(positions.get(box.id), {x: box.x, y: box.y, cx: box.cx, cy: box.cy});
    }
  }
  nodeBoxes.sort((a, b) => across ? (a.cx - b.cx) : (a.cy - b.cy));
  const ranks = new Map(), order = new Map();
  const rankRows = [];
  for (const box of nodeBoxes) {
    const coord = across ? box.cx : box.cy;
    const extent = across ? box.w : box.h;
    let placed = false;
    for (let r = 0; r < rankRows.length; r++) {
      const row = rankRows[r];
      if (Math.abs(coord - row.mean) <= Math.max(extent, row.extent) * 0.65) {
        row.items.push(box);
        row.mean = row.items.reduce((s, x) => s + (across ? x.cx : x.cy), 0) / row.items.length;
        row.extent = Math.max(row.extent, extent);
        placed = true;
        break;
      }
    }
    if (!placed) rankRows.push({mean: coord, extent, items: [box]});
  }
  rankRows.forEach((row, r) => {
    row.items.sort((a, b) => across ? (a.cy - b.cy) : (a.cx - b.cx));
    row.items.forEach((item, idx) => {
      ranks.set(item.id, r);
      order.set(item.id, idx);
    });
  });
  return {ranks, order, positions};
}

function rememberFlowchartLayout(source, recipe, graph = null, nextSource = null) {
  const key = normSource(source);
  if (!key || !recipe) return null;
  const state = extractPriorLayout(recipe, graph || (parseFlowchart(source).graph));
  if (!state) return null;
  _renderedLayouts.set(key, state);
  while (_renderedLayouts.size > 24) _renderedLayouts.delete(_renderedLayouts.keys().next().value);
  if (nextSource) {
    const nextKey = normSource(nextSource);
    if (nextKey) {
      _editLineage.set(nextKey, state);
      while (_editLineage.size > 24) _editLineage.delete(_editLineage.keys().next().value);
    }
  }
  return state;
}

function lowerFlowchart(graph, options = null) {
  const maxFigures = Math.max(FLOWCHART_LIMITS?.figures || 0, FLOWCHART_LAYOUT_LIMITS.figures);
  const maxObstacles = Math.max(FLOWCHART_LIMITS?.obstacles || 0, FLOWCHART_LAYOUT_LIMITS.obstacles);
  const maxLabelChars = FLOWCHART_LIMITS?.labelChars || FLOWCHART_LAYOUT_LIMITS.labelChars;
  const maxTextChars = FLOWCHART_LIMITS?.textChars || FLOWCHART_LAYOUT_LIMITS.textChars;
  if (!graph || !Object.hasOwn(FLOWCHART_DIRECTIONS, graph.direction) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.groups) ||
      !graph.nodes.length || graph.nodes.length + graph.edges.length + 2 * graph.groups.length > maxFigures || graph.nodes.length + graph.groups.length > maxObstacles) return flowchartFailure();
  const ids = new Set(), figures = [], labels = Object.create(null), parts = Object.create(null);
  let text = 0;
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(node.id) || ids.has(node.id) || !Object.hasOwn(FLOWCHART_SHAPES, node.shape) || typeof node.label !== 'string' || !node.label || node.label.length > maxLabelChars) return flowchartFailure();
    text += node.label.length; ids.add(node.id);
    figures.push({...FLOWCHART_SHAPES[node.shape], id: node.id, label: node.label, ...(node.style ? {authorStyle: node.style} : {})});
    labels[node.id] = {kind: 'node', id: node.id};
    parts[node.id] = {kind: 'node', id: node.id};
  }
  const nodes = new Set(ids);
  for (const group of graph.groups) {
    if (!group || typeof group.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(group.id) || ids.has(group.id) || typeof group.title !== 'string' || !group.title || group.title.length > maxLabelChars) return flowchartFailure();
    text += group.title.length;
    ids.add(group.id); figures.push({kind: 'group', id: group.id, title: group.title, members: group.members});
  }
  let serial = 0;
  for (const [index, edge] of graph.edges.entries()) {
    if (!edge || !nodes.has(edge.from) || !nodes.has(edge.to) || !['arrow', 'line'].includes(edge.kind) || !['headStart', 'headEnd', 'dash', 'thick'].every(key => typeof edge[key] === 'boolean')) return flowchartFailure();
    if (edge.label != null) { if (typeof edge.label !== 'string' || !edge.label || edge.label.length > maxLabelChars) return flowchartFailure(); text += edge.label.length; }
    let id; do { id = 'mermEdge' + serial++; } while (ids.has(id)); ids.add(id);
    if (edge.label) labels[id] = {kind: 'edge', id: index};
    parts[id] = {kind: 'edge', id: index};
    figures.push({kind: edge.kind, id, from: edge.from, to: edge.to, headStart: edge.headStart ? 'triangle' : 'none', headEnd: edge.headEnd ? 'triangle' : 'none',
      ...(edge.label ? {label: edge.label} : {}), ...(edge.dash ? {dash: 'dotted'} : {}), ...(edge.thick ? {nib: 18} : {})});
  }
  if (text > maxTextChars) return flowchartFailure();
  try {
    const autoPrior = options?.prior || (graph._source ? (_editLineage.get(normSource(graph._source)) || _renderedLayouts.get(normSource(graph._source))) : null);
    const lay = prior => _rapierDrawNormalizeAgentRecipe({
      figures,
      direction: FLOWCHART_DIRECTIONS[graph.direction],
      ...(prior ? {prior} : {})
    });
    const recipe = (autoPrior && lay(autoPrior)) || lay(null);
    if (recipe) for (const group of graph.groups) {
      const title = recipe.shapes.find(shape => shape.group === group.id && shape.recognized === 'text');
      if (title) { labels[title.id] = {kind: 'group', id: group.id}; parts[title.id] = {kind: 'group', id: group.id}; }
    }
    return recipe ? {ok: true, recipe, labels, parts} : flowchartFailure();
  } catch (error) {
    if (/^drawing_/.test(error.code || '')) return flowchartFailure();
    throw error;
  }
}

function renderFlowchart(source, options = null) {
  const parsed = parseFlowchart(source);
  if (!parsed.ok) return parsed;
  const key = normSource(source);
  const prior = options?.prior || (key && _editLineage.get(key)) || null;
  const lowered = lowerFlowchart(parsed.graph, prior || options ? {...options, prior} : null);
  if (!lowered.ok) return lowered;
  try {
    const svg = _rapierDrawBuildSVG(lowered.recipe);
    if (!svg) return flowchartFailure();
    const recipe = _rapierDrawReadRecipeFromSVGText(svg);
    if (key && recipe) rememberFlowchartLayout(source, recipe, parsed.graph);
    return {ok: true, graph: parsed.graph, recipe, labels: lowered.labels, parts: lowered.parts, svg};
  } catch (error) {
    if (/^drawing_/.test(error.code || '')) return flowchartFailure();
    throw error;
  }
}

function editFlowchartLabel(source, target, value, ...rest) {
  const result = _specEditFlowchartLabel(source, target, value, ...rest);
  if (result.ok && result.source) {
    const baseKey = normSource(source), nextKey = normSource(result.source);
    if (_renderedLayouts.has(baseKey)) {
      _editLineage.set(nextKey, _renderedLayouts.get(baseKey));
    }
  }
  return result;
}

const drawable = (edit, keepLayout = true) => (source, ...args) => {
  const result = edit(source, ...args);
  if (!result.ok || result.splice === null) return result;
  const baseKey = normSource(source), nextKey = normSource(result.source);
  const prior = keepLayout && baseKey ? _renderedLayouts.get(baseKey) : null;
  if (prior && nextKey) _editLineage.set(nextKey, prior);
  const parsed = parseFlowchart(result.source);
  const lowered = lowerFlowchart(parsed.graph, prior ? {prior} : null);
  if (lowered.ok && nextKey) rememberFlowchartLayout(result.source, lowered.recipe, parsed.graph);
  return lowered.ok ? result : {ok: false, code: lowered.code, reason: lowered.reason};
};
const flowchartEdits = Object.freeze({addBox: drawable(addFlowchartBox), connect: drawable(connectFlowchartBoxes), deleteBox: drawable(deleteFlowchartBox),
  deleteEdge: drawable(deleteFlowchartEdge), shape: drawable(setFlowchartShape), direction: drawable(setFlowchartDirection, false), edgeLabel: drawable(setFlowchartEdgeLabel)});

export {parseFlowchart, editFlowchartLabel, lowerFlowchart, renderFlowchart, flowchartEdits, nextFlowchartId};
