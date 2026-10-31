// SPDX-License-Identifier: AGPL-3.0-only
import {canonicalJson} from './kernel.mjs';
import {normalizeLabel} from '../images/assets.mjs';
import {sha256} from '../kit/ledger/hash.mjs';

export function createCommitFence(kernelOf, sourceText, analyzeMarkdown) {
  let watchedDrawing;
  return fact => {
    const kernel = kernelOf(), state = {text: sourceText()};
    const drawing = kernel.drawingContext();
    if (!drawing?.open) return '';
    if (!fact) return 'draw_session_open';
    const occurrence = drawing.occurrence, target = fact.occurrence;
    if (!occurrence && Array.isArray(drawing.held) && Array.isArray(fact.splices) && !fact.drawingAsset) {
      const ranges = drawing.held.map(range => ({...range}));
      let intact = true;
      for (const splice of fact.splices) {
        const from = splice.pos, to = from + splice.removed.length, delta = splice.inserted.length - splice.removed.length;
        for (const range of ranges) {
          if (from <= range.end && to >= range.start) { intact = false; break; }
          if (to < range.start) { range.start += delta; range.end += delta; }
        }
        if (!intact) break;
      }
      if (intact) return '';
    }
    if (occurrence && normalizeLabel(fact.drawingAsset || '') !== normalizeLabel(occurrence.reference) && Array.isArray(fact.splices)) {
      const blocks = analyzeMarkdown({text: state.text}).blocks;
      const held = blocks?.entries.find(row => row.start <= occurrence.start && row.end >= occurrence.end);
      if (held && blocks.complete) {
        let {start, end} = held, intact = true;
        for (const splice of fact.splices) {
          const from = splice.pos, to = from + splice.removed.length;
          if (from <= end && to >= start) { intact = false; break; }
          if (to < start) { const delta = splice.inserted.length - splice.removed.length; start += delta; end += delta; }
        }
        if (intact) return '';
      }
    }
    if (!fact.shapesOnly || !drawing.recipeDigest || fact.surfaceRecipeDigest !== drawing.recipeDigest || !occurrence || !target ||
        normalizeLabel(fact.drawingAsset || '') !== normalizeLabel(occurrence.reference) ||
        normalizeLabel(target.reference || '') !== normalizeLabel(occurrence.reference) ||
        target.start !== occurrence.start || target.end !== occurrence.end || drawing.busy?.human)
      return 'draw_session_open';
    const binding = canonicalJson({session: drawing.session, surfaceGeneration: drawing.surfaceGeneration,
      assetGeneration: drawing.assetGeneration, occurrence, recipeDigest: drawing.recipeDigest});
    if (watchedDrawing !== undefined && watchedDrawing !== binding) return 'draw_surface_changed';
    watchedDrawing = binding;
    const patch = fact.drawingPatch;
    if (patch && (patch.session !== drawing.session || patch.surfaceGeneration !== drawing.surfaceGeneration ||
        patch.assetGeneration !== drawing.assetGeneration || sha256(canonicalJson(patch.recipeBefore)) !== drawing.recipeDigest))
      return 'draw_surface_changed';
    if (drawing.recipe && fact.paintTargets?.some(target => !drawing.recipe.shapes.some(shape => shape.id === target.id && canonicalJson(shape) === canonicalJson(target))))
      return 'paint_target_changed';
    return '';
  };
}
