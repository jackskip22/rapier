// SPDX-License-Identifier: AGPL-3.0-only
import {parseFlowchart, editFlowchartLabel, FLOWCHART_LIMITS} from '../spec/flowchart.mjs';
import {_rapierDrawNormalizeAgentRecipe, _rapierDrawBuildSVG, _rapierDrawReadRecipeFromSVGText} from './core.mjs';

const FLOWCHART_SHAPES = Object.freeze({rect: {kind: 'rect'}, round: {kind: 'rect', corner: .08}, stadium: {kind: 'rect', corner: .5},
  circle: {kind: 'circle'}, diamond: {kind: 'diamond'}, cylinder: {kind: 'cylinder'}, subroutine: {kind: 'subroutine'},
  asymmetric: {kind: 'asymmetric'}, hexagon: {kind: 'hexagon', flat: true}});
const FLOWCHART_DIRECTIONS = Object.freeze({TD: 'down', BT: 'up', LR: 'across', RL: 'back'});
const flowchartFailure = () => ({ok: false, accepted: true, code: 'flowchart_layout', reason: 'This flowchart is too large or complex to draw. Shorten its labels or split it into smaller diagrams.'});

// The public syntax owns its graph; Draw owns every size, position, port, route and painted byte. Lowering only
// translates those graph facts into ordinary figures. Author colours have one bounded owner in the saved recipe.
function lowerFlowchart(graph) {
  if (!graph || !Object.hasOwn(FLOWCHART_DIRECTIONS, graph.direction) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.groups) ||
      !graph.nodes.length || graph.nodes.length + graph.edges.length + 2 * graph.groups.length > FLOWCHART_LIMITS.figures || graph.nodes.length + graph.groups.length > FLOWCHART_LIMITS.obstacles) return flowchartFailure();
  const ids = new Set(), figures = [], labels = Object.create(null);
  let text = 0;
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(node.id) || ids.has(node.id) || !Object.hasOwn(FLOWCHART_SHAPES, node.shape) || typeof node.label !== 'string' || !node.label || node.label.length > FLOWCHART_LIMITS.labelChars) return flowchartFailure();
    text += node.label.length; ids.add(node.id);
    figures.push({...FLOWCHART_SHAPES[node.shape], id: node.id, label: node.label, ...(node.style ? {authorStyle: node.style} : {})});
    labels[node.id] = {kind: 'node', id: node.id};
  }
  const nodes = new Set(ids);
  for (const group of graph.groups) {
    if (!group || typeof group.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(group.id) || ids.has(group.id) || typeof group.title !== 'string' || !group.title || group.title.length > FLOWCHART_LIMITS.labelChars) return flowchartFailure();
    text += group.title.length;
    ids.add(group.id); figures.push({kind: 'group', id: group.id, title: group.title, members: group.members});
  }
  let serial = 0;
  for (const [index, edge] of graph.edges.entries()) {
    if (!edge || !nodes.has(edge.from) || !nodes.has(edge.to) || !['arrow', 'line'].includes(edge.kind) || !['headStart', 'headEnd', 'dash', 'thick'].every(key => typeof edge[key] === 'boolean')) return flowchartFailure();
    if (edge.label != null) { if (typeof edge.label !== 'string' || !edge.label || edge.label.length > FLOWCHART_LIMITS.labelChars) return flowchartFailure(); text += edge.label.length; }
    let id; do { id = 'mermEdge' + serial++; } while (ids.has(id)); ids.add(id);
    if (edge.label) labels[id] = {kind: 'edge', id: index};
    figures.push({kind: edge.kind, id, from: edge.from, to: edge.to, headStart: edge.headStart ? 'triangle' : 'none', headEnd: edge.headEnd ? 'triangle' : 'none',
      ...(edge.label ? {label: edge.label} : {}), ...(edge.dash ? {dash: 'dotted'} : {}), ...(edge.thick ? {nib: 18} : {})});
  }
  if (text > FLOWCHART_LIMITS.textChars) return flowchartFailure();
  try {
    const recipe = _rapierDrawNormalizeAgentRecipe({figures, direction: FLOWCHART_DIRECTIONS[graph.direction]});
    if (recipe) for (const group of graph.groups) {
      const title = recipe.shapes.find(shape => shape.group === group.id && shape.recognized === 'text');
      if (title) labels[title.id] = {kind: 'group', id: group.id};
    }
    return recipe ? {ok: true, recipe, labels} : flowchartFailure();
  } catch (error) {
    if (/^drawing_/.test(error.code || '')) return flowchartFailure();
    throw error;
  }
}

function renderFlowchart(source) {
  const parsed = parseFlowchart(source);
  if (!parsed.ok) return parsed;
  const lowered = lowerFlowchart(parsed.graph);
  if (!lowered.ok) return lowered;
  try {
    const svg = _rapierDrawBuildSVG(lowered.recipe);
    if (!svg) return flowchartFailure();
    return {ok: true, graph: parsed.graph, recipe: _rapierDrawReadRecipeFromSVGText(svg), labels: lowered.labels, svg};
  } catch (error) {
    if (/^drawing_/.test(error.code || '')) return flowchartFailure();
    throw error;
  }
}

export {parseFlowchart, editFlowchartLabel, lowerFlowchart, renderFlowchart};
