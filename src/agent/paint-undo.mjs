// SPDX-License-Identifier: AGPL-3.0-only
// A material contribution survives a later save under a new SVG address. The retained source
// journal proves which contribution belongs to the change; the current recipe proves where it lives.
import {canonicalJSON} from '../kit/ledger/data.mjs';
import {_rapierTransformSplices as transformSplices} from '../kit/ledger/journal-records.mjs';
import {documentAssets, decodeDataImage, normalizeLabel, markdownParser} from '../images/assets.mjs';
import {_rapierDrawReadRecipeFromSVGText, _rapierDrawRectPolygon} from '../draw/core.mjs';
import {outlineMarkdown} from './markdown.mjs';

const occurrence = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\](?:[ \t]*<!--md-layout:v1[^>]*-->)?$/;
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
function recipeAt(assets, label) {
  const asset = assets.assets.get(normalizeLabel(label));
  if (!asset || !/^data:image\/svg\+xml;base64,/i.test(asset.url)) return null;
  try {return _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(asset.url)));}
  catch {return null;}
}
const replayBase = replay => ({baseRaster: replay.baseRaster, px: replay.px, scale: replay.scale, views: replay.views || [],
  ...(replay.mode != null ? {mode: replay.mode} : {}), ...(replay.paper != null ? {paper: replay.paper} : {})});
function nonMaterial(shape) {
  const {raster, paint, geom, ...rest} = shape;
  const {brush, strokes, actions, seed, replay, px, ...kept} = paint || {};
  // Water paper changes are replayed material actions; the mode and replay's base paper stay invariant.
  if (paint?.mode === 'water') delete kept.paper;
  return {...rest, paint: kept};
}

function growthHolds(before, after, entries) {
  let [width, height] = before.paint.px;
  const corners = shape => shape.geom.p || _rapierDrawRectPolygon(shape.geom.cx, shape.geom.cy, shape.geom.w, shape.geom.h, shape.geom.rot || 0);
  let frame = corners(before);
  for (const entry of entries) {
    const [left, top, right, bottom] = entry.grow || [0, 0, 0, 0], [a, b, , d] = frame;
    const nextWidth = width + left + right, nextHeight = height + top + bottom;
    if (entry.scale !== before.paint.scale || !same(entry.px, [nextWidth, nextHeight])) return false;
    if (left || top || right || bottom) frame = [[-left, -top], [width + right, -top], [width + right, height + bottom], [-left, height + bottom]]
      .map(([x, y]) => [a[0] + x * (b[0] - a[0]) / width + y * (d[0] - a[0]) / height,
        a[1] + x * (b[1] - a[1]) / width + y * (d[1] - a[1]) / height]);
    width = nextWidth; height = nextHeight;
  }
  if (!same(after.paint.px, [width, height])) return false;
  const actual = corners(after);
  return actual.length === frame.length && actual.every((point, i) => point.every((value, j) =>
    Math.abs(value - frame[i][j]) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(frame[i][j]))));
}

// A newly added layer can leave its empty sheet under later human material. Everything
// authored in the layer must be recorded agent paint, without another kind of shape edit.
// The material owner proves the base's decoded bytes are empty before applying this inverse.
function createdContribution(shape) {
  const replay = shape.paint?.replay;
  if (shape.recognized !== 'paint' || !replay?.entries?.length || replay.views?.length ||
      !same(nonMaterial(shape), {id: shape.id, stroke: null, recognized: 'paint', asDrawn: false,
        brush: 'ink', style: null, paint: {scale: shape.paint.scale}}) ||
      replay.entries.some(row => row.actor !== 'agent' || row.removed || typeof row.id !== 'string')) return null;
  return {id: shape.id, replay, omitIds: replay.entries.map(row => row.id), requireEmptyBase: true};
}

// Refuse mixed or ambiguous changes: a semantic paint inverse cannot claim to undo another
// kind of authored edit. Later material requires replay even when the source inverse still fits.
function contributions(before, after) {
  const {shapes: oldShapes, ...oldRest} = before, {shapes: newShapes, ...newRest} = after;
  if (!same(oldRest, newRest)) return null;
  const changes = [], oldIds = new Set(oldShapes.map(shape => shape.id));
  let index = 0;
  for (const now of newShapes) {
    const was = oldShapes[index];
    if (was?.id !== now.id) {
      if (oldIds.has(now.id)) return null;
      const created = createdContribution(now);
      if (!created) return null;
      changes.push(created); continue;
    }
    index++;
    if (same(was, now)) continue;
    if (was.recognized !== 'paint' || now.recognized !== 'paint' || !same(nonMaterial(was), nonMaterial(now))) return null;
    const prior = was.paint?.replay, next = now.paint?.replay;
    if (!next?.entries?.length) return null;
    const prefix = prior?.entries || [];
    if (prior ? !same(replayBase(prior), replayBase(next))
      : next.baseRaster !== was.raster || !same(next.px, was.paint?.px) || next.scale !== was.paint?.scale ||
        (next.mode ?? null) !== (was.paint?.mode ?? null) || !same(next.paper ?? null, was.paint?.paper ?? null)) return null;
    if (!same(next.entries.slice(0, prefix.length), prefix)) return null;
    const added = next.entries.slice(prefix.length);
    if (!added.length || added.some(row => row.actor !== 'agent' || row.removed || typeof row.id !== 'string')) return null;
    if (!growthHolds(was, now, added)) return null;
    changes.push({id: now.id, replay: next, omitIds: added.map(row => row.id)});
  }
  return index === oldShapes.length && changes.length ? changes : null;
}

function carries(recipe, changes) {
  if (!recipe) return false;
  return changes.every(change => {
    const shape = recipe.shapes.find(row => row.id === change.id && row.recognized === 'paint');
    const history = shape?.paint?.replay;
    if (!history || !same(replayBase(history), replayBase(change.replay))) return false;
    const expected = new Map(change.replay.entries.map((entry, index) => [entry.id, {entry, index}]));
    const live = new Map(history.entries.map(entry => [entry.id, entry]));
    if (!change.omitIds.every(id => live.has(id) && !live.get(id).removed && same(live.get(id), expected.get(id).entry))) return false;
    // An earlier selective Undo can have removed another entry. Never put it back. The shared
    // entries that remain keep their exact commands and order, and the material owner verifies
    // the complete current history against its saved pixels before it omits anything else.
    let last = -1;
    for (const entry of history.entries) {
      const known = expected.get(entry.id);
      if (!known) continue;
      const retained = entry.actor === 'agent' && entry.removed === true && !known.entry.removed
        ? {...known.entry, removed: true} : known.entry;
      if (known.index <= last || !same(entry, retained)) return false;
      last = known.index;
    }
    return true;
  });
}

export function paintUndoPlan(text, entry, later, drawing = null) {
  if (entry?.operation !== 'document.draw' || !Array.isArray(later)) return null;
  let after = text;
  for (let index = later.length - 1; index >= 0; index--) {
    after = transformSplices(after, later[index].splices, true);
    if (after == null) return null;
  }
  const before = transformSplices(after, entry.splices, true);
  if (before == null) return null;
  const rows = entry.splices.filter(row => (occurrence.test(row.removed) || row.removed === '') && occurrence.test(row.inserted.trim()));
  if (rows.length !== 1) return null;
  const oldOccurrence = occurrence.exec(rows[0].removed), newOccurrence = occurrence.exec(rows[0].inserted.trim());
  if (oldOccurrence && oldOccurrence[1] !== newOccurrence[1]) return null;
  const following = recipeAt(documentAssets(after), newOccurrence[2]);
  if (!following) return null;
  let prior = oldOccurrence && recipeAt(documentAssets(before), oldOccurrence[2]);
  if (oldOccurrence && !prior) return null;
  if (!oldOccurrence) {
    // A newly inserted painting has no previous occurrence. Only its default drawing
    // envelope supports the retained paint; authored effects, frames and controls are
    // separate edits that omitting material commands cannot undo.
    if (following.strokes.length || Object.keys(following).some(key =>
      !['version', 'canvas', 'strokes', 'shapes', 'view'].includes(key))) return null;
    prior = {...following, shapes: []};
  }
  const changes = contributions(prior, following);
  if (!changes) return null;
  const facts = outlineMarkdown(text, {limit: 0}, markdownParser());
  if (!facts.images?.complete) return null;
  const assets = documentAssets(text), candidates = [], recipes = new Map();
  for (const image of facts.images.entries) {
    if (!image.drawing || !image.id) continue;
    if (!recipes.has(image.id)) recipes.set(image.id, recipeAt(assets, image.id));
    const sourceRecipe = recipes.get(image.id);
    const block = text.slice(image.blockStart, image.blockEnd);
    const match = occurrence.exec(block.trim());
    if (!match || normalizeLabel(match[2]) !== image.id) continue;
    const raw = '![' + match[1] + '][' + match[2] + ']';
    const start = image.blockStart + block.length - block.trimStart().length;
    const bound = drawing?.occurrence;
    const live = bound?.start === start && bound.end === start + raw.length &&
      normalizeLabel(bound.reference) === image.id;
    // Unsaved human strokes belong to this exact open occurrence. Their recorded inputs must
    // carry the same contribution as a saved layer before the material owner can omit it.
    const recipe = live ? drawing.recipe : sourceRecipe;
    if (!carries(recipe, changes)) continue;
    candidates.push({start, end: start + raw.length, raw, alt: match[1], asset: match[2], recipe, sourceRecipe, changes});
  }
  return candidates.length === 1 ? candidates[0] : null;
}
