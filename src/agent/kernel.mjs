import {sha256} from '../kit/ledger/hash.mjs';
import {readBase} from '../kit/ledger/carried.mjs';
import {agentActorId} from '../kit/ledger/format.mjs';
import {transportInterval, transportTouchedInterval} from '../kit/ledger/merge.mjs';
import {authoredSourceReader} from '../kit/ledger/transport.mjs';
// Rapier shared document kernel. SPDX-License-Identifier: AGPL-3.0-only.
import { parseWill, willMarkerOf, willRegionsIn, willTouchesMarker, willGovern, willIntentOf, stripOneTerminator } from './will.mjs';
import { diffLines } from './diff.mjs';
import { outlineMarkdown, structureMarkdown } from './markdown.mjs';
import { changedReferenceRegion } from './references.mjs';
import { assetOmissions, retireDeletedImageDefinitions, documentAssets, markdownParser, normalizeLabel, createAsset, appendAsset, appendAssetText, escapeImageAlt, decodeDataImage, inspectSVG, editSVGNodes } from '../images/assets.mjs';
import { RAPIER_DRAW_NIB_DEFAULT, RAPIER_DRAW_SMOOTH_DEFAULT, _rapierDrawNormalizeAgentRecipe, _rapierDrawRecipeFault, _rapierDrawAdmitRecipe, _rapierDrawMergeAgentRecipe, _rapierDrawUndoRecipe, _rapierDrawRecipeDelta, _rapierDrawBuildSVG, _rapierDrawNextAssetName, _rapierDrawApplyShapesPatch, _rapierDrawReadRecipeFromSVGText, _rapierDrawFigureFault, _rapierDrawLowerFigures } from '../draw/core.mjs';
import { applyOperations } from '../draw/edit.mjs';
import { parseLayout } from '../layout/markdown.mjs';
import { getTool, validateInput, MAX_EXPORT_BYTES, MAX_FILENAME_CHARS } from './catalog.mjs';
import { FIND_KINDS } from './structure-request.mjs';
import { _rapierTransformSplices as transformSplices, _rapierMetadataDelta as metadataDelta, _rapierTransformMetadata as transformMetadata, _rapierHasHistoryEffect as hasHistoryEffect, _rapierHistoryEffects as historyEffects, _rapierValidMetadata as validMetadata } from '../kit/ledger/journal-records.mjs';
import { pairMarkers, pairInkSpans, scanInkMarkers, scanColorMarkers, hasInkMarker, hasColorMarker } from '../spec/md-marks.mjs';
import { markdownSourcePositions } from '../spec/md-source.mjs';
import {parseComments, commentThreads, commentAnchor, commentSourceRange, commentSplices, writeComments, commentSummary, commentChanges, commentSpliceParts, commentUndoSplice, commentRestoreSplice, imageCommentTarget} from './comments.mjs';
import {visualRequest, visualResult} from './visual.mjs';
import {paintUndoPlan, paintUndoChanges} from './paint-undo.mjs';
export {paintUndoChanges};
import {historyProjection, sourceBefore, selectiveUndo} from '../kit/ledger/history.mjs';
import {EDITOR_TOOL_ACTIONS, editorRequest, editorResult, editorContext as projectEditorContext} from './editor.mjs';
import {PAGE_RESULT_BYTES, resultBytes, boundedResult} from './page-result.mjs';
export {PAGE_RESULT_BYTES, resultBytes, boundedResult};
import {materialRequest, materialDescription, materialMatches, admitMaterialResult} from './material.mjs';

// The door and the editor replay exactly one splice law, including every intermediate row.
export { transformSplices };
export { materialMatches, admitMaterialResult };

// The file's name, by format; the editor's answer for Word or PDF must carry exactly this name.
export function exportFilename(filename, format) {
  if (format === 'markdown') return filename;
  const suffix = format === 'html' ? '.rapier.html' : '.' + (format === 'page' ? 'html' : format);
  // The offline page keeps its own rule (the Markdown and text extensions go). The other files are named as the editor's own Export names
  // them: the document's name without its last extension.
  const stem = format === 'html' ? filename.replace(/\.(md|markdown|txt)$/i, '') : filename.replace(/\.[a-z0-9]+$/i, '') || 'document';
  return [...stem].slice(0, MAX_FILENAME_CHARS - suffix.length).join('') + suffix;
}

// What each format keeps, said in the receipt. A text file of a Markdown document is its portable words and the one
// final newline the editor's Export adds; a plain or code document is its own text.
export function exportFidelity(format, docKind = 'markdown') {
  const representation = {markdown: 'source', html: 'offline-editor', txt: 'plain-text', page: 'rendered-page', docx: 'word', pdf: 'raster-pdf'}[format];
  return {representation, sourceEmbedded: ['html', 'pdf'].includes(format),
    ...(format === 'txt' ? docKind === 'markdown' ? {projection: 'copy-as-text', images: 'descriptions-and-urls', formatting: 'text-markers', addsFinalNewline: true}
      : {projection: 'source', addsFinalNewline: false} : {}),
    ...(format === 'page' ? {html: 'sanitized', images: 'embedded-bytes', code: 'source-text',
      equations: 'source-text', mermaid: 'source-text', layout: 'static-styles', scripts: false} : {}),
    ...(format === 'pdf' ? {textLayer: 'rendered-text', pagination: 'css-columns', dpi: 96} : {})};
}

// Bytes arrive only as a host fact. The request binds their kind, name and source
// revision; the exported artifact never enters the document or its invocation journal.
export function admitExportArtifact(request, fact) {
  if (!fact || fact.documentId !== request.documentId || fact.revision !== request.revision || fact.format !== request.format)
    return {reason: 'document_changed'};
  if (fact.outcome !== 'ok') {
    const reason = typeof fact.reason === 'string' ? fact.reason.slice(0, 128) : 'export_unavailable';
    return {reason, ...(reason === 'export_too_large' ? {limitBytes: MAX_EXPORT_BYTES} : {})};
  }
  const artifact = fact.artifact, mimeType = request.format === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
  if (!artifact || artifact.mimeType !== mimeType || artifact.filename !== exportFilename(request.filename, request.format) || typeof artifact.data !== 'string')
    return {reason: 'export_artifact_invalid'};
  if (artifact.data.length > Math.ceil(MAX_EXPORT_BYTES / 3) * 4) return {reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES};
  if (artifact.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(artifact.data)) return {reason: 'export_artifact_invalid'};
  let data;
  try { data = atob(artifact.data); } catch { return {reason: 'export_artifact_invalid'}; }
  if (data.length > MAX_EXPORT_BYTES) return {reason: 'export_too_large', limitBytes: MAX_EXPORT_BYTES, byteLength: data.length};
  if (request.format === 'docx' ? !data.startsWith('PK\x03\x04') : !data.startsWith('%PDF-')) return {reason: 'export_artifact_invalid'};
  if (request.format === 'pdf' && (!Number.isSafeInteger(artifact.pages) || artifact.pages < 1)) return {reason: 'export_artifact_invalid'};
  return {name: artifact.filename, mimeType, bytes: Uint8Array.from(data, char => char.charCodeAt(0)), fidelity: exportFidelity(request.format),
    ...(Number.isSafeInteger(artifact.pages) ? {pages: artifact.pages} : {}),
    ...(Array.isArray(artifact.issues) ? {issues: artifact.issues.slice(0, 32).filter(row => row && typeof row.code === 'string').map(row => ({code: row.code.slice(0, 128),
      ...(typeof row.severity === 'string' ? {severity: row.severity.slice(0, 32)} : {}), ...(Number.isSafeInteger(row.count) && row.count >= 0 ? {count: row.count} : {}),
      ...(typeof row.message === 'string' ? {message: row.message.slice(0, 512)} : {})}))} : {})};
}

export const LIMITS = Object.freeze({
  documentBytes: 25 * 1024 * 1024, editChars: 262144, drawingWorkChars: 786432, edits: 16,
  readChars: 4096, resultBytes: 12288, handles: 64, refs: 128, cursors: 64,
  authorityBytes: 1024 * 1024, lifetimeMs: 300000, retryMs: 24 * 60 * 60 * 1000,
  compareBytes: 8 * 1024 * 1024, compareLines: 100000, compareChanges: 1200,
  humanContexts: 8, presenceMs: 15000, principals: 16, invocationKeys: 256,
  drawAlt: 240,
});
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const bytes = value => encoder.encode(value).byteLength;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// A refusal names its next step: one sentence a caller can act on. The reason stays the contract; the hint is
// advice, present only for the reasons below.
const HINTS = {
  context_missing: 'This handle is unknown here or was consumed; call find or document.read again for a fresh handle.',
  context_expired: 'This handle has expired; call find or document.read again for a fresh handle.',
  context_has_no_block: 'Read a nonempty source block and use its handle to place the drawing after that block, or omit context_handle to append.',
  cursor_missing: 'This page cursor is unknown here or was consumed; repeat the original read, search or listing without a cursor.',
  reference_missing: 'This ref is unknown here; call document.outline or find again for a fresh ref.',
  document_replaced: 'The document was replaced; call document.observe, then read again before editing.',
  document_changed: 'The document changed since this handle was read; document.read again and resend with the fresh handle.',
  foreground_hand_wins: 'The person is editing this range; wait for their hand to settle, then resend the same edit.',
  invocation_key_collision: 'This operation already has a receipt; inspect the current document before starting another operation.',
  target_changed: 'The passage changed since it was read; document.read again and resend with the fresh handle.',
  draw_surface_changed: 'The settled drawing changed; read its current occurrence again before editing.',
  operation_retry_expired: 'The retry receipt has expired. Inspect the current document before starting another operation.',
  context_handle_wrong_kind: 'This handle is not for this call: edit with a handle from find or document.read, read a comparison with a change handle, edit a drawing with its recipe_handle.',
  authority_mismatch: 'This handle or ref belongs to another caller; obtain your own with find, document.read or document.outline.',
  change_missing: 'No such change; document.observe lists changes since your last successful observation or supplied cursor.',
  change_not_owned_or_unavailable: 'That change is not yours to reverse, or is no longer reversible; document.observe lists the changes.',
  no_agent_change: 'No change under this agent name to undo; name change_id, or the agent name that made it.',
  other_agent_latest: 'The latest change is another agent\'s; name its change_id to undo it.',
  compare_not_open: 'No comparison is open; use comparison.present with action open or show.',
  edits_overlap: 'Two edits cover the same text; merge them into one edit.',
  batch_too_large: 'Send fewer edits in one call.',
  draw_shape_limit: 'A drawing holds 1 to 128 shapes; send fewer.',
  draw_alt_required: 'Give alt, a short caption of the drawing.',
  draw_requires_markdown: 'Drawings live in Markdown documents only.',
  draw_create_patch_conflict: 'Create with figures and alt first; shapes patches need target kind edit and recipe_handle from a complete drawing read.',
  paint_strokes_invalid: 'Read the paint guide. A paint figure uses kind, id and seed with strokes, or mode water with paper and actions; geometry belongs in path points, not figure x/y/w/h.',
  material_request_expired: 'The material request expired without commitment. Once a visible editor is available, reread the target and use a new operation_id; Water also needs WebGPU.',
  paint_history_full: 'This layer has reached its editable history limit. Continue on a new layer with shapes.add.',
  paint_layer_full: 'This layer has reached its image size limit. Continue on a new layer with shapes.add.',
  paint_mode_mismatch: 'Use mode:water and actions for a Water layer, or strokes for a Paint layer. Add a new layer with shapes.add to use another mode.',
  paint_sheet_invalid: 'Read the drawing again for its current material, or add a new layer with shapes.add.',
  paint_sample_unavailable: 'Material sampling is unavailable in this editor. Read the drawing recipe for its pigment and paper settings.',
  paint_sample_invalid: 'Sample an existing Paint or Water layer at a point in its drawing coordinates.',
  water_webgpu_unavailable: 'Water needs WebGPU in the active editor. The drawing is unchanged.',
  WATER_BUDGET: 'This Water operation exceeds the live material budget. Use a smaller stroke or a new layer; the drawing is unchanged.',
  WATER_REPLAY_BUDGET: 'This Water journal is full. Continue on a new layer; the drawing is unchanged.',
  WATER_GPU_MEMORY: 'The graphics device could not allocate this Water operation. Use a smaller layer; the drawing is unchanged.',
  WATER_GPU_FAILED: 'The graphics device refused this Water operation. The drawing is unchanged; reopen the editor before retrying.',
  WATER_DEVICE_LOST: 'The Water graphics device is no longer available. The drawing is unchanged; reopen the editor before retrying.',
  paint_replay_unavailable: 'This turn cannot be replayed separately from the retained material. The current drawing is unchanged.',
  figures_invalid: 'Each figure names a kind from kinds and the fields the tool description lists for it.',
  recipe_invalid: 'Send figures, or a recipe exactly as document.read returned it.',
  target_over_edit_budget: 'Read a fitting object with document.read and objectId, then pass its recipe_handle to document.draw with shapes or operations.',
  document_law: 'The Will protects the source range named by start and end; keep it and edit another passage.',
  human_edit_in_progress: 'The person is editing; wait for their input to settle, then document.observe and retry.',
  editor_not_present: 'No editor is open on this workspace: document.observe reports headless, so deliver the page through a file surface or ask the person to open Rapier.',
  editor_unavailable: 'Open the paired Rapier editor and keep it visible for painting, sampling, visual inspection, Word or PDF. Without an editor, export markdown, html, txt or page.',
  export_render_limit: 'This document is too large for the worker to write as txt or page; export markdown or html, or open it in Rapier for Word or PDF.',
  export_render_unavailable: 'This host could not write the txt or page file; export markdown or html instead.',
  presentation_already_pending: 'A reveal is already pending; check its view status in document.observe before another.',
  wait_already_pending: 'One wait at a time; the earlier wait must finish first.',
  notes_folder_unreadable: 'Notes could not answer just now; try again later.',
  notes_not_read: 'Read the whole note first, then write against its current source.',
  notes_changed: 'The note changed after your read. Read it again before writing.',
  notes_open: 'The live note is unavailable to this call. Read its current source before writing.',
  notes_history_unavailable: 'The note\'s History could not retain the current words. The note is unchanged.',
  world_changed: 'The document changed during the call; call again.',
  kind_not_applicable: 'Code kinds search code, Markdown kinds search Markdown, and an open comparison takes no kind; search words with no kind.',
  outline_changed: 'The document changed during the call; call document.outline again.',
  search_changed: 'The document changed during the call; call find again.',
  read_snapshot_changed: 'The document changed during the call; document.read again.',
  comment_missing: 'Call comments.read for current thread IDs before replying or resolving.',
  comments_record: 'That range holds the document\'s comment threads; edit the text around it, and use comments.write for discussions.',
  comment_text_invalid: 'Send a nonempty comment of at most 4096 UTF-8 bytes.',
  comment_anchor_invalid: 'Read the exact passage or drawing again, then use that handle and an existing object id.',
  comments_appendix_unavailable: 'Finish the unclosed Markdown block at the end of the document before adding a comment.',
  comments_notes_changed: 'The portable review notes changed. Keep those source edits; the old thread record cannot safely update them.',
};
// The figure kinds draw/core.mjs admits (_rapierDrawFigureFault's kind check), answered beside a refused figures list.
const FIGURE_KINDS = Object.freeze(['rect', 'ellipse', 'circle', 'triangle', 'diamond', 'hexagon', 'cylinder', 'subroutine', 'asymmetric', 'text', 'line', 'arrow', 'group', 'paint']);
const failure = (reason, outcome = 'refused', detail = {}) => ({ outcome, reason, ...(HINTS[reason] && !Object.hasOwn(detail, 'hint') ? { hint: HINTS[reason] } : {}), ...detail });
// A refused recipe names the first field, or shape, that stopped it admitting (draw/core.mjs _rapierDrawRecipeFault).
const recipeInvalid = fault => failure('recipe_invalid', 'invalid', fault ? { field: fault.field, hint: 'The recipe was refused at ' + fault.field + ': send it as document.read returned it, or with the values the tool description lists for it.' } : {});
const accepted = value => ({ outcome: 'ok', ...value });
// The object under the finger (focus.kind), derived from text and image facts, never sent by a door.
function pointedKind(text, start, end, images) {
  const raw = String(text || '').slice(start, end);
  const head = raw.replace(/^\s+/, '');
  if (/^!\[/.test(head) || /^\[[^\]]*\]:\s*<?data:image\//i.test(head)) {
    const rows = Array.isArray(images?.entries) ? images.entries : [];
    const drawing = rows.some(row => { const at = Number.isFinite(row.start) ? row.start : row.blockStart; return row.drawing === true && Number.isFinite(at) && at >= start && at < end; });
    return drawing ? 'drawing' : 'picture';
  }
  if (/^\|/.test(head)) return 'table';
  if (/^(?:```|~~~)/.test(head)) return 'code';
  if (/^#{1,6}\s/.test(head)) return 'heading';
  if (/^>/.test(head)) return 'quote';
  if (/^(?:[-+*]|\d+[.)])\s/.test(head)) return 'list';
  if (/^\$\$/.test(head)) return 'math';
  return raw.trim() ? 'paragraph' : 'empty';
}
// One owner of "after a block ends a paragraph": without the blank line a quote, list item or fence lazily continues.
function paragraphBreakAround(source, position) {
  const before = source.slice(0, position), after = source.slice(position);
  const eol = /\r\n|\r|\n/.exec(source)?.[0] || '\n';
  // A new LF after an existing CR (or a new CR before an existing LF) joins one CRLF. Supply the
  // second logical break without changing the existing source units at either insertion seam.
  const prefix = before && !/(?:\r\n|\r(?!\n)|\n){2}$/.test(before) ? (/[\r\n]$/.test(before) && !(before.endsWith('\r') && eol === '\n') ? eol : eol + eol) : '';
  const suffix = after && !/^(?:\r\n|\r(?!\n)|\n){2}/.test(after) ? (/^[\r\n]/.test(after) && !(after.startsWith('\n') && eol === '\r') ? eol : eol + eol) : '';
  return { prefix, suffix };
}
function lineEndingAt(source, end) {
  let probe = end;
  while (probe > 0 && (source[probe - 1] === '\n' || source[probe - 1] === '\r')) probe--;
  const start = source.lastIndexOf('\n', probe - 1) + 1;
  return { start, text: source.slice(start, probe), atLineEnd: end === probe || end === source.length || /[\r\n]/.test(source[end] || '') };
}
function atFenceBlockEnd(source, end) {
  try {
    const facts = outlineMarkdown(source, { limit: 0 }, markdownParser());
    const blocks = facts.blocks?.entries || [];
    return blocks.some(row => {
      const nl = source.indexOf('\n', row.start);
      const first = source.slice(row.start, nl < 0 || nl > row.end ? row.end : nl);
      if (!/^[ \t]{0,3}(?:`{3,}|~{3,})/.test(first)) return false;
      let contentEnd = row.end;
      while (contentEnd > row.start && /[\r\n]/.test(source[contentEnd - 1])) contentEnd--;
      return end === row.end || end === contentEnd;
    });
  } catch { return false; }
}
function needsParagraphBreakAfter(source, end) {
  const line = lineEndingAt(source, end);
  if (!line.atLineEnd || !line.text) return false;
  const trimmed = line.text.replace(/^[ \t]{0,3}/, '');
  if (/^>/.test(trimmed)) return true;
  if (/^(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/.test(trimmed)) return true;
  if (/^(?:`{3,}|~{3,})/.test(trimmed)) return atFenceBlockEnd(source, end);
  return false;
}
const safeInt = value => Number.isSafeInteger(value) && value >= 0;
const bounded = (value, fallback, min, max) => value == null ? fallback : Math.max(min, Math.min(max, Math.floor(Number(value) || min)));
// The one wait clamp: the catalogue's range, or a door's own bound (the Muse host holds a call well under 20 s), the default inside it.
export const waitTimeout = (value, bound = 120000) => bounded(value, Math.min(20000, bound), 1000, bound);
const clip = (value, length) => {
  const text = String(value == null ? '' : value);
  let end = Math.min(text.length, length);

  if (end && end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800) end--;
  return text.slice(0, end);
};
// A display name, not a principal. Empty after trim is absent. The ledger stores it beside the change.
function agentLabel(value) {
  if (typeof value !== 'string') return '';
  return clip(value.trim(), 64);
}

export function documentKind(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (['md', 'markdown', 'mdown', 'mkd'].includes(ext)) return 'markdown';
  return /^(?:js|mjs|cjs|ts|tsx|jsx|html|htm|css|scss|json|jsonc|py|rs|go|java|kt|kts|c|h|cc|cpp|hpp|cs|swift|rb|php|sh|bash|zsh|sql|yaml|yml|toml|xml|vue|svelte|lua|r|dart|ex|exs|pl|zig)$/.test(ext) ? 'code' : 'text';
}

// A current snapshot may already contain damage. Owning that document must not strand its
// healthy text. Authored whole documents use the strict admission below; edits use the shared
// journal transform, which permits untouched damage but never malformed splice fragments.
function admissibleSnapshotText(value) {
  if (typeof value !== 'string') return 'text_required';
  if (value.length > LIMITS.documentBytes || bytes(value) > LIMITS.documentBytes) return 'text_too_large';
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return 'text_control_characters';
  return '';
}

export function admissibleText(value) {
  const invalid = admissibleSnapshotText(value);
  if (invalid) return invalid;
  return /[\uD800-\uDFFF]/u.test(value) ? 'text_not_utf8_text' : '';
}

function validName(value) {
  return validMetadata({filename: value, docKind: 'markdown'});
}

export function minimalSplice(before, after) {
  let start = 0, left = before.length, right = after.length;
  while (start < left && start < right && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (!safeBoundary(before, start) || !safeBoundary(after, start)) start--;
  while (left > start && right > start && before.charCodeAt(left - 1) === after.charCodeAt(right - 1)) { left--; right--; }
  if (!safeBoundary(before, left) || !safeBoundary(after, right)) { left++; right++; }
  return { pos: start, removed: before.slice(start, left), inserted: after.slice(start, right) };
}


function digest(text) {
  let fnv = 0x811c9dc5, a = 1, b = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 16777619); a = (a + code) % 65521; b = (b + a) % 65521;
  }
  return `${text.length}:${fnv >>> 0}:${((b << 16) | a) >>> 0}`;
}

const sansView = recipe => { const {view, ...rest} = recipe; return rest; };
// Retry identities sort keys; transport keeps the caller's insertion order (some
// authored figure defaults are seeded from it). Both traverse decoded JSON without
// consuming the JavaScript call stack. Transport omits undefined object fields and
// keeps undefined array entries as null, as JSON.stringify does.
export function canonicalJson(value) { return jsonText(value, true); }
export function serializeJson(value) { return jsonText(value, false); }
function jsonText(value, canonical) {
  const prepare = (value, key) => !canonical && value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
  const missing = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
  const parts = [], frames = [{value: prepare(value, ''), index: -1}], active = new Set();
  while (frames.length) {
    const frame = frames[frames.length - 1];
    if (frame.index < 0) {
      const object = frame.value && typeof frame.value === 'object';
      const prototype = object && Object.getPrototypeOf(frame.value);
      if (!object || !canonical && !Array.isArray(frame.value) && prototype !== Object.prototype && prototype !== null) {
        const encoded = JSON.stringify(canonical && frame.value === undefined ? null : frame.value);
        if (frames.length === 1) return encoded;
        parts.push(encoded === undefined ? '' : encoded);
        frames.pop();
        continue;
      }
      if (active.has(frame.value)) throw Object.assign(new TypeError('Cyclic tool input cannot be represented as JSON.'), {code: 'invalid_arguments', path: 'arguments'});
      active.add(frame.value);
      frame.keys = Array.isArray(frame.value) ? null : Object.keys(frame.value);
      if (frame.keys && canonical) frame.keys.sort();
      frame.length = frame.keys ? frame.keys.length : frame.value.length;
      frame.index = 0; frame.written = 0;
      parts.push(frame.keys ? '{' : '[');
    }
    if (frame.index === frame.length) {
      parts.push(frame.keys ? '}' : ']');
      active.delete(frame.value); frames.pop();
      continue;
    }
    const key = frame.keys ? frame.keys[frame.index] : frame.index;
    frame.index++;
    let child = prepare(frame.value[key], String(key));
    if (!canonical && frame.keys && missing(child)) continue;
    if (frame.written++) parts.push(',');
    if (frame.keys) parts.push(JSON.stringify(key), ':');
    if (canonical && !frame.keys && !(key in frame.value)) continue;
    if (!canonical && !frame.keys && missing(child)) child = null;
    if (canonical && frame.keys && child !== undefined && missing(child)) { parts.push('undefined'); continue; }
    frames.push({value: child, index: -1});
  }
  return parts.join('');
}

function sourceDrawing(text, label) {
  const asset = documentAssets(text).assets.get(normalizeLabel(label));
  if (!asset || !/^data:image\/svg\+xml;base64,/i.test(asset.url)) return null;
  try {
    const recipe = _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(asset.url)));
    return recipe ? {asset, recipe} : null;
  } catch { return null; }
}

// The receiver proves semantic metadata against the exact source transaction before its fence
// admits it. The shared asset and comment owners reconstruct every derived source byte.
export function verifyDrawingPatch(envelope, beforeText, afterText) {
  return drawingPatchSource(expandDrawingPatch(envelope, beforeText, afterText), beforeText, afterText);
}

// A retained drawing replay borrows its recipes from the exact source transaction.
// Only live canvas differences need separate data; the drawing owner derives the patch.
export function expandDrawingPatch(envelope, beforeText, afterText) {
  if (!envelope || typeof envelope !== 'object') return null;
  if (!envelope.sourceReplay) return clone(envelope); // An immediate, full host envelope.
  try {
    const {sourceReplay, ...metadata} = envelope;
    if (typeof beforeText !== 'string' || typeof afterText !== 'string' ||
        sourceReplay.beforeSha256 !== sha256(beforeText) || sourceReplay.afterSha256 !== sha256(afterText)) return null;
    const before = sourceDrawing(beforeText, envelope.asset), after = sourceDrawing(afterText, envelope.reference);
    if (!before || !after || sha256(before.asset.url) !== envelope.assetGeneration) return null;
    const recipeBefore = sourceReplay.before ? _rapierDrawApplyShapesPatch(before.recipe, sourceReplay.before) : before.recipe;
    const recipeAfter = sourceReplay.after ? _rapierDrawApplyShapesPatch(after.recipe, sourceReplay.after) : after.recipe;
    const patch = _rapierDrawRecipeDelta(recipeBefore, recipeAfter);
    if (!patch) return null;
    return {...clone(metadata), sourceRecipeBefore: before.recipe, sourceRecipeAfter: after.recipe,
      recipeBefore, recipeAfter, patch};
  } catch { return null; }
}

export function expandJournalDrawingPatch(snapshot, transactionId) {
  if (!snapshot || typeof snapshot.text !== 'string' || !Array.isArray(snapshot.journal)) return null;
  try {
    let after = snapshot.text, revision = snapshot.revision;
    for (let index = snapshot.journal.length - 1; index >= 0; index--) {
      const row = snapshot.journal[index];
      if (!row || row.revision !== revision || !safeInt(row.baseRevision) || row.baseRevision + 1 !== revision) return null;
      const before = transformSplices(after, row.splices, true);
      if (before == null) return null;
      if (row.id === transactionId) {
        const expanded = expandDrawingPatch(row.drawingPatch, before, after);
        return drawingPatchSource(expanded, before, after) ? expanded : null;
      }
      after = before; revision = row.baseRevision;
    }
  } catch { return null; }
  return null;
}

export function expandDrawingIntent(intent, snapshot) {
  if (!intent || intent.documentId !== snapshot?.documentId || !Array.isArray(snapshot.journal)) return null;
  const entry = snapshot.journal.find(row => row.id === intent.transactionId);
  if (!entry?.drawingIntent || entry.drawingIntent.documentId !== snapshot.documentId ||
      entry.drawingIntent.revision !== snapshot.revision || intent.revision !== snapshot.revision ||
      !['pending', 'replaying'].includes(entry.drawingIntent.status)) return null;
  if (entry.drawingIntent.patchRequired && !entry.drawingPatch) return null;
  const drawingPatch = entry.drawingPatch ? expandJournalDrawingPatch(snapshot, entry.id) : null;
  if (entry.drawingPatch && !drawingPatch) return null;
  return {...clone(entry.drawingIntent), ...(drawingPatch ? {drawingPatch} : {})};
}

function compactDrawingPatch(envelope, beforeText, afterText) {
  const expanded = expandDrawingPatch(envelope, beforeText, afterText);
  if (!drawingPatchSource(expanded, beforeText, afterText)) return null;
  const {sourceRecipeBefore, sourceRecipeAfter, recipeBefore, recipeAfter, patch, ...metadata} = expanded;
  // Property insertion order is not a canvas difference and must not duplicate a raster.
  const delta = (from, to) => _rapierDrawRecipeDelta(JSON.parse(canonicalJson(from)), JSON.parse(canonicalJson(to)));
  const before = delta(sourceRecipeBefore, recipeBefore);
  const after = delta(sourceRecipeAfter, recipeAfter);
  if (!before || !after) return null;
  const compact = {...metadata, sourceReplay: {beforeSha256: sha256(beforeText), afterSha256: sha256(afterText),
    ...(Object.keys(before).length ? {before} : {}), ...(Object.keys(after).length ? {after} : {})}};
  const restored = expandDrawingPatch(compact, beforeText, afterText);
  if (!restored || canonicalJson(restored.recipeBefore) !== canonicalJson(recipeBefore) ||
      canonicalJson(restored.recipeAfter) !== canonicalJson(recipeAfter) || !drawingPatchSource(restored, beforeText, afterText)) return null;
  return compact;
}

function drawingPatchSource(envelope, beforeText, afterText, restoreDefinition = false) {
  try {
    if (!envelope || typeof beforeText !== 'string' || typeof afterText !== 'string' ||
        !envelope.occurrence || !envelope.targetOccurrence) return false;
    const before = sourceDrawing(beforeText, envelope.asset), after = sourceDrawing(afterText, envelope.reference);
    if (!before || !after || canonicalJson(before.recipe) !== canonicalJson(envelope.sourceRecipeBefore) ||
        canonicalJson(after.recipe) !== canonicalJson(envelope.sourceRecipeAfter)) return false;
    if (envelope.assetGeneration !== sha256(before.asset.url)) return false;
    const applied = _rapierDrawApplyShapesPatch(envelope.recipeBefore, envelope.patch);
    const admitted = applied && _rapierDrawAdmitRecipe(applied), expected = _rapierDrawAdmitRecipe(envelope.recipeAfter);
    if (!admitted || !expected || canonicalJson(admitted) !== canonicalJson(expected)) return false;
    const occurrence = envelope.occurrence, target = envelope.targetOccurrence;
    if (![occurrence.start, occurrence.end, target.start, target.end].every(safeInt) ||
        occurrence.end <= occurrence.start || target.end <= target.start) return false;
    const oldText = beforeText.slice(occurrence.start, occurrence.end), newText = afterText.slice(target.start, target.end);
    const oldRef = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\]$/.exec(oldText);
    const newRef = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\]$/.exec(newText);
    if (!oldRef || !newRef || oldRef[1] !== newRef[1] || normalizeLabel(oldRef[2]) !== normalizeLabel(envelope.asset) ||
        normalizeLabel(newRef[2]) !== normalizeLabel(envelope.reference) ||
        normalizeLabel(occurrence.reference) !== normalizeLabel(envelope.asset) ||
        normalizeLabel(target.reference) !== normalizeLabel(envelope.reference)) return false;
    if (envelope.undo === true) {
      return drawingPatchSource({...envelope, undo: false, asset: envelope.reference, reference: envelope.asset,
        occurrence: target, targetOccurrence: occurrence, assetGeneration: sha256(after.asset.url), sourceRecipeBefore: after.recipe, sourceRecipeAfter: before.recipe,
        recipeBefore: envelope.recipeAfter, recipeAfter: envelope.recipeBefore,
        patch: _rapierDrawRecipeDelta(envelope.recipeAfter, envelope.recipeBefore)}, afterText, beforeText, true);
    }
    if (canonicalJson(envelope.recipeAfter) !== canonicalJson(after.recipe)) return false;
    const rows = [{pos: occurrence.start, removed: oldText, inserted: newText}];
    let text = transformSplices(beforeText, rows);
    if (text == null) return false;
    const retired = imageDeletionSplices(beforeText, text, rows, 'agent');
    if (retired.length) { text = transformSplices(text, retired); rows.push(...retired); }
    // Undo can follow text with a different first line ending. Replay the definition's own terminator,
    // which belongs to the retained source transaction, rather than choosing one from the current prose.
    const asset = {...after.asset, label: envelope.reference, id: normalizeLabel(envelope.reference)};
    const eol = /^(?:\r\n|\n|\r)/.exec(afterText.slice(after.asset.end))?.[0] || /\r\n|\n|\r/.exec(text)?.[0] || '\n';
    const appended = appendAssetText(text, asset, eol);
    const matches = (source, addition = null) => {
      const comments = commentSplices(beforeText, addition ? rows.concat(addition) : rows);
      return (comments.length ? transformSplices(source, comments) : source) === afterText;
    };
    if (matches(appended.source, appended.added ? {pos: text.length, removed: '', inserted: appended.suffix} : null)) return true;
    if (!restoreDefinition || !appended.added) return false;
    // A person can type after an appended definition. Undo replays that definition at its retained
    // position, not at the new end of the document. Only the asset owner's own separator bytes may
    // precede it; the complete source and derived comments must still match exactly.
    let start = after.asset.start;
    const keptComments = parseComments(text).record, finalComments = parseComments(afterText).record;
    if (keptComments && finalComments && finalComments.end <= start) start -= finalComments.raw.length - keptComments.raw.length;
    for (const separator of ['', eol, eol + eol]) {
      const position = start - separator.length;
      if (!safeInt(position) || position > text.length) continue;
      const restored = appendAssetText(text.slice(0, position), asset, eol);
      if (restored.added && matches(restored.source + text.slice(position),
        {pos: position, removed: '', inserted: restored.suffix})) return true;
    }
    return false;
  } catch { return false; }
}

// Filenames the receipt's structural parse applies to.
export function receiptStructureEligible(filename) {
  return /\.(?:[cm]?js|html?)$/i.test(String(filename || ''));
}

// Pure receipt diff over agent/structure.mjs receipt output; an adapter may call it post-commit, never inside decide.
export function receiptStructureFact(beforeText, afterText, value) {
  const before = value?.before, after = value?.after;
  if (!before || !after) return { parse: 'not_checked', reason: value?.reason || 'structure_unavailable' };
  const key = row => [row.kind || '', row.container || '', row.name || ''].join(':');
  const beforeMap = new Map((before.declarations || []).map(row => [key(row), row]));
  const afterMap = new Map((after.declarations || []).map(row => [key(row), row]));
  const added = [], removed = [], changed = [];
  const label = (text, limit) => clip(String(text || ''), limit);
  for (const [id, row] of afterMap) {
    if (!beforeMap.has(id)) added.push(label(row.name || row.label || id, 128));
    else {
      const prior = beforeMap.get(id);
      if (safeInt(prior.start) && safeInt(prior.end) && safeInt(row.start) && safeInt(row.end) &&
          beforeText.slice(prior.start, prior.end) !== afterText.slice(row.start, row.end)) changed.push(label(row.name || row.label || id, 128));
    }
  }
  for (const [id, row] of beforeMap) if (!afterMap.has(id)) removed.push(label(row.name || row.label || id, 128));
  const introduced = after.status === 'syntax_error' && before.status === 'ok' && before.complete === true;
  const parse = after.status === 'syntax_error' ? (introduced ? 'introduced_parse_failure' : 'syntax_error')
    : after.status === 'ok' && after.complete === true ? 'ok' : 'not_checked';
  return { engine: value.engine || 'acorn@8.19.0',
    parse, ...(parse === 'not_checked' ? { reason: after.status || 'structure_unavailable' } : {}),
    complete: value.complete === true,
    added_declarations: added.slice(0, 8), removed_declarations: removed.slice(0, 8), changed_declarations: changed.slice(0, 8),
    omitted: Math.max(0, added.length - 8) + Math.max(0, removed.length - 8) + Math.max(0, changed.length - 8),
    ...(value.omissions?.length ? { omissions: value.omissions.slice(0, 3).map(row => ({ domain: row.domain, reason: row.reason })) } : {}) };
}

function historyAuthor(value, kind) {
  const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit &&
    value.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(value);
  if (!value || value.kind !== kind || !text(value.id, 160) ||
      (value.name !== undefined && !text(value.name, 120))) throw new TypeError('history_author_invalid');
  return {kind, id: value.id, ...(value.name === undefined ? {} : {name: value.name})};
}

function historyTurn(value) {
  const fields = {};
  for (const [key, limit] of [['turnId', 160], ['turnLabel', 120]]) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !value[key].length || value[key].length > limit ||
        !value[key].isWellFormed() || /[\u0000-\u001f\u007f]/.test(value[key])) throw new TypeError('history_turn_invalid');
    fields[key] = value[key];
  }
  return fields;
}

function participantIdentity(context = {}, mintId, authors) {
  const source = typeof context.actor === 'object' ? context.actor.kind : context.actor;
  const actor = source || 'agent';
  const principal = String(context.principal || (typeof context.actor === 'object' ? context.actor.id : '') || 'session');
  if (!['human', 'agent', 'system'].includes(actor) || !principal || principal.length > 160) throw new TypeError('Invalid participant');
  const hostAgent = actor === 'agent' && typeof context.hostAgent === 'string' ? context.hostAgent : '';
  if (hostAgent) agentActorId('agent', {name: hostAgent});
  const agent = agentLabel(context.agent);
  // Attribution is descriptive data. It never replaces the principal that owns live capabilities.
  const identity = JSON.stringify([String(context.transport || 'platform'), actor, principal]);
  let author = context.author;
  if (!author) {
    // A portable author is an opaque provenance identity. The private access principal
    // remains solely in this owner's mapping and live custody records, never its hash or prefix.
    let id = authors[identity];
    if (!id) { id = actor === 'human' && principal === 'local' ? 'local' : mintId('author_'); authors[identity] = id; }
    author = {kind: actor, id, ...(hostAgent || agent ? {name: hostAgent || agent} : {})};
  }
  author = historyAuthor(author, actor);
  return { actor, principal, author, ...historyTurn(context), ...(hostAgent ? {hostAgent} : {}), ...(agent ? {agent} : {}), transport: String(context.transport || 'platform'), requestId: clip(context.requestId || mintId('call_'), 160),
    invocationKey: clip(context.invocationKey || mintId('key_'), 160) };
}
const ownerOf = who => `${who.transport}:${who.actor}:${who.principal}`;
const sameOwner = (record, who) => record.owner === ownerOf(who);

// documentId is minted once (injected mintId). clock starts at 0, never Date.now(): createKernel's monotonic max dominates.
export function createState({ id, documentId, filename = 'Untitled.md', text = '', docKind, revision = 0, mintId } = {}) {
  const invalid = admissibleSnapshotText(text);
  if (invalid || !validName(filename)) throw new TypeError(invalid || 'filename_invalid');
  const kind = docKind || documentKind(filename);
  if (!['markdown', 'text', 'code'].includes(kind)) throw new TypeError('document_kind_invalid');
  const resolvedId = documentId || id || (typeof mintId === 'function' ? mintId('doc_') : null);
  if (!resolvedId) throw new TypeError('document_id_required');
  return {
    documentId: String(resolvedId), revision: safeInt(revision) ? revision : 0,
    filename, docKind: kind, text, selection: null, focus: null, drawing: null,
    journal: [], handles: {}, refs: {}, cursors: {}, compare: null, pointers: {},
    humanContexts: {}, contextSequences: {}, resume: {}, ledgerRoot: null, authorIdentities: {},
    history: { earliestRevision: safeInt(revision) ? revision : 0, trimmedBytes: 0, complete: true },
    clock: 0,
  };
}

// Existing discussions belong to comments.write. Agent text writes cannot change their record,
// or alter the carrier or Markdown context so those discussions disappear.
function touchesCommentRecord(text, splices, kind = 'markdown') {
  const record = text.includes('md-comments:') ? parseComments(text).record : null;
  if (!record) return false;
  if (kind !== 'markdown') return true;
  const changed = transformSplices(text, splices);
  return changed == null || parseComments(changed).record?.raw !== record.raw;
}

function regionVerdict(will, splice) {
  if (will.faults.length) return { law: 'keep', rule: 'before_faulted', faults: willFaults(will) };
  const start = splice.pos, end = start + splice.removed.length;
  const marker = willTouchesMarker(will, start, end);
  if (marker) return { law: marker.law, rule: 'marker_span_touched', ...(safeInt(marker.index) ? { region: marker.index } : {}) };
  for (const region of willRegionsIn(will, start, end)) {
    if (region.law === 'keep') return { law: 'keep', rule: 'law_violated', region: region.index };
    if (region.law !== 'append') continue;
    if (start < region.start || end > region.end) return { law: 'append', rule: 'law_violated', region: region.index };
    const before = stripOneTerminator(will.text.slice(region.start, region.end));
    const after = will.text.slice(region.start, start) + splice.inserted + will.text.slice(end, region.end);
    if (!stripOneTerminator(after).startsWith(before)) return { law: 'append', rule: 'law_violated', region: region.index };
  }
  return null;
}

export function imageDeletionSplices(before, after, splices, actor = 'human') {
  const rows = retireDeletedImageDefinitions(before, after, splices);
  if (!rows.length || actor !== 'agent') return rows;
  const will = parseWill(after);
  return rows.filter(row => !regionVerdict(will, row));
}

// The editor commits human source edits through the same ink retirement owner as the agent door.
export function inkDeletionSplices(before, after, splices, actor = 'human', markers = null) {
  return markerDeletionSplices(before, after, splices, actor, 'ink', markers);
}

// Colour and ink (spec/md-marks.mjs): a pair is the person's mark on its words, so a door edit leaves it whole or takes it with the last of
// its words. Where an offset of the text the rows made stood in the text they began from, or -1 inside what a row wrote.
function markerOffsetBefore(rows, offset) {
  for (let index = rows.length - 1; index >= 0 && offset >= 0; index--) {
    const { pos, removed, inserted } = rows[index];
    if (offset >= pos) offset = offset >= pos + inserted.length ? offset - inserted.length + removed.length : -1;
  }
  return offset;
}

// Hidden boundaries are no words of a containing ink span. Counting source without those
// boundaries retires every nested shell together when the final anchor characters are deleted.
function markerTextOffsets(markers) {
  const offsets = new Map();
  let hidden = 0;
  for (const marker of markers) {
    offsets.set(marker.start, marker.start - hidden);
    hidden += marker.end - marker.start;
    offsets.set(marker.end, marker.end - hidden);
  }
  return offsets;
}

// What an edit would break of the paired marks it meets, or null. A marker left standing alone that holds bytes of a marker of a pair, from
// text no row wrote, is a pair severed (an opener cut into is no marker, and then its closer is what stands alone); the pair is
// named by where it stands in the document. More empty pairs than the document held is a pair written empty, whoever wrote its
// comments. A marker standing alone that the edit wrote is its author's own, and a stray that was one already is not the edit's.
// The standard's source-position owner distinguishes comment carriers from literal examples of any kind.
function semanticMarkers(source, kind) {
  const markers = kind === 'ink' ? scanInkMarkers(source) : scanColorMarkers(source);
  if (!markers.length) return markers;
  const positions = markdownSourcePositions(source, markdownParser());
  return markers.filter(marker => !positions.isText(marker.start) && positions.isComment(marker.start, marker.end));
}

function markerBroken(before, after, rows, kind) {
  const beforeMarkers = semanticMarkers(before, kind), afterMarkers = semanticMarkers(after, kind);
  const was = pairMarkers(before, kind, beforeMarkers).runs;
  if (!was.length && !rows.some(row => (kind === 'color' ? hasColorMarker : hasInkMarker)(row.inserted))) return null;
  const now = pairMarkers(after, kind, afterMarkers);
  const boundaries = was.flatMap(run => [{start: run.start, end: run.innerStart, run}, {start: run.innerEnd, end: run.end, run}]).sort((a, b) => a.start - b.start);
  const pairAt = at => {
    let low = 0, high = boundaries.length;
    while (low < high) { const mid = (low + high) >> 1; if (boundaries[mid].end <= at) low = mid + 1; else high = mid; }
    const boundary = boundaries[low];
    return boundary && at >= boundary.start ? boundary.run : null;
  };
  for (const stray of now.strays) {
    for (let at = stray.start; at < stray.end; at++) {
      const from = markerOffsetBefore(rows, at), pair = from >= 0 && pairAt(from);
      if (pair) return { rule: 'marker_stranded', start: pair.start, end: pair.end };
    }
  }
  const emptyCount = (runs, markers) => {
    const offsets = kind === 'ink' ? markerTextOffsets(markers) : null;
    return runs.filter(run => offsets ? offsets.get(run.innerStart) === offsets.get(run.innerEnd) : run.innerStart === run.innerEnd).length;
  };
  return emptyCount(now.runs, afterMarkers) > emptyCount(was, beforeMarkers) ? { rule: 'pair_emptied' } : null;
}

// A pair an edit emptied goes with its words, so no empty pair is ever written: both markers of each empty pair whose two markers
// the rows left as they were and stood in pairs with words before. They remove only what stood before, each marker as a row of
// its own, from the end backward, so every offset and the inverse still name the original bytes. A pair that was empty
// before, and one the edit wrote, are not the edit's to clear.
function markerDeletionSplices(before, after, rows, actor, kind, semantic = null) {
  const markersBefore = semantic?.before ?? semanticMarkers(before, kind);
  const previous = pairMarkers(before, kind, markersBefore);
  const beforeOffsets = kind === 'ink' ? markerTextOffsets(markersBefore) : null;
  const hasWords = (run, offsets) => offsets ? offsets.get(run.innerEnd) > offsets.get(run.innerStart) : run.innerEnd > run.innerStart;
  const opened = new Set(), closed = new Set();
  for (const run of previous.runs) if (hasWords(run, beforeOffsets)) { opened.add(run.start); closed.add(run.innerEnd); }
  if (!opened.size) return [];
  const unchanged = (start, end) => {
    const from = markerOffsetBefore(rows, start), last = markerOffsetBefore(rows, end - 1);
    return from >= 0 && last === from + end - 1 - start && before.slice(from, from + end - start) === after.slice(start, end) ? from : -1;
  };
  const markersAfter = semantic?.after ?? semanticMarkers(after, kind);
  const afterOffsets = kind === 'ink' ? markerTextOffsets(markersAfter) : null;
  const current = (kind === 'ink' ? pairInkSpans(after, markersAfter) : pairMarkers(after, kind, markersAfter)).runs;
  const intact = run => opened.has(unchanged(run.start, run.innerStart)) && closed.has(unchanged(run.innerEnd, run.end));
  let groups = current.filter(run => run.mark?.id == null && !hasWords(run, afterOffsets) && intact(run)).map(run => [run]);
  if (previous.arrows?.length) {
    const byId = new Map();
    for (const run of current) if (run.mark.id != null) {
      if (!byId.has(run.mark.id)) byId.set(run.mark.id, []);
      byId.get(run.mark.id).push(run);
    }
    for (const arrow of previous.arrows) {
      if ([arrow.tail, arrow.head].some(run => !hasWords(run, beforeOffsets))) continue;
      const present = byId.get(arrow.id) || [];
      const originals = present.filter(run => intact(run) && [arrow.tail.start, arrow.head.start].includes(unchanged(run.start, run.innerStart)));
      // A newly introduced collision cannot retire an existing arrow. Only the loss of an original anchor or
      // its last words retires its mate; an intentionally rewritten complete pair remains the author's.
      if (originals.length === 2 && originals.every(run => hasWords(run, afterOffsets))) continue;
      if (present.length === 2 && present[0].mark.kind !== present[1].mark.kind && present.every(run => hasWords(run, afterOffsets))) continue;
      // A rendered block edit can rewrite its unchanged comments with the block. Its empty endpoint is
      // still part of the original pair; keep retirement whole while leaving actual collisions for refusal.
      if (present.length <= 2 && new Set(present.map(run => run.mark.kind)).size === present.length) groups.push(present);
      else if (originals.length) groups.push(originals);
    }
  }
  const markers = run => [{ start: run.start, end: run.innerStart }, { start: run.innerEnd, end: run.end }];
  if (groups.length && actor === 'agent') {
    const will = parseWill(after);
    // Authority covers the entire arrow: a protected mate refuses the edit instead of retiring only one half.
    groups = groups.filter(group => group.every(run => markers(run).every(marker => !regionVerdict(will,
      { pos: marker.start, removed: after.slice(marker.start, marker.end), inserted: '' }))));
  }
  return groups.flat().flatMap(markers).sort((a, b) => b.start - a.start)
    .map(marker => ({ pos: marker.start, removed: after.slice(marker.start, marker.end), inserted: '' }));
}

// A drawing's definition is derived at commit against the decided text, appended once at the text's end if absent,
// after imageDeletionSplices. Throws on a label collision or limit so the caller refuses as target_changed.
function pendingAssetSplices(text, drawAssets) {
  if (!drawAssets?.length) return [];
  const additions = [];
  for (const asset of drawAssets) {
    if (!asset || typeof asset.id !== 'string' || typeof asset.label !== 'string') continue;
    const current = documentAssets(text);
    if (current.references[asset.id]?.href === asset.url) continue;
    const appended = appendAssetText(text, asset);
    if (appended.added) { additions.push({ pos: text.length, removed: '', inserted: appended.suffix }); text = appended.source; }
  }
  return additions;
}

export function enforceWillReferences(beforeText, afterText, {before = parseWill(beforeText), after = parseWill(afterText),
  restores = false, bodyOnly = false, referenceCheck} = {}) {
  const regions = [];
  for (const region of before.regions) {
    if (region.law === 'edit') continue;
    const was = beforeText.slice(region.start, region.end), following = after.regions[region.index];
    if (!following) return {law: region.law, rule: 'law_violated', region: region.index, ...lawBounds(region)};
    const now = afterText.slice(following.start, following.end);
    // A separately admitted keep restoration changes those exact source bytes.
    if (region.law === 'keep' && was !== now) continue;
    let length = region.law === 'append' ? stripOneTerminator(was).length : was.length;
    if (restores && region.law === 'append') length = Math.min(length, minimalSplice(was, now).pos);
    if (length) regions.push({...region, end: region.start + length});
  }
  if (!regions.length) return null;
  let index;
  try { index = referenceCheck ? referenceCheck(beforeText, afterText, regions)
    : changedReferenceRegion(beforeText, afterText, regions, undefined, bodyOnly); }
  catch (_) { return {law: regions[0].law, rule: 'law_violated', region: regions[0].index, ...lawBounds(before.regions[regions[0].index])}; }
  const region = regions.find(row => row.index === index);
  return region ? {law: region.law, rule: 'law_violated', region: region.index, ...lawBounds(before.regions[region.index])} : null;
}

const lawBounds = region => ({start: region.start, end: region.end});
const willFaults = will => will.faults.slice(0, 4).map(fault => ({ mode: fault.mode, line: fault.line }));
export function enforceWill(beforeText, afterText, splices, { docKind = 'markdown', actor = 'agent', restores = false, referenceCheck, markerSplices = splices } = {}) {
  if (actor !== 'agent' || docKind !== 'markdown') return null;
  const before = parseWill(beforeText), after = parseWill(afterText);
  if (!before.present && !after.present) return null;
  // A faulted Will keeps the whole document; the refusal names the faults (mode and line), so the agent knows the marker
  // to mend or to ask the person about, instead of reading a bare rule.
  if (before.faults.length) return { law: 'keep', rule: 'before_faulted', faults: willFaults(before), start: 0, end: beforeText.length };
  // Marker custody precedes the resulting parse. Execution order is right to left; a refusal names
  // the first affected region in the document, retaining the original splice index for the caller.
  let touched = null;
  if (!restores) for (let index = 0; index < splices.length; index++) {
    const row = splices[index], marker = willTouchesMarker(before, row.pos, row.pos + row.removed.length);
    if (marker && (!touched || (marker.index ?? Infinity) < (touched.region ?? Infinity))) {
      touched = { law: marker.law, rule: 'marker_span_touched', editIndex: index,
        ...(safeInt(marker.index) ? { region: marker.index } : {}),
        ...lawBounds(before.regions[marker.index] || marker) };
    }
  }
  if (touched) return touched;
  if (after.faults.length) return { law: 'keep', rule: 'result_faulted', faults: willFaults(after), start: 0, end: beforeText.length };
  if (before.markers.length !== after.markers.length || before.markers.some((marker, index) => {
      const following = after.markers[index];
      // Track the original source through the complete act, including derived retirements.
      return marker.kind !== following.kind || beforeText.slice(marker.start, marker.end) !==
        afterText.slice(following.start, following.end) || !restores &&
        (markerOffsetBefore(markerSplices, following.start) !== marker.start ||
          markerOffsetBefore(markerSplices, following.end - 1) !== marker.end - 1);
    })) {
    return { law: 'keep', rule: 'marker_sequence_mismatch', start: 0, end: beforeText.length };
  }
  // Body laws judge the whole act. Individual splices can cancel without changing any governed
  // byte; marker custody above remains strict even when marker bytes are written back identically.
  for (let index = 0; index < before.regions.length; index++) {
    const region = before.regions[index];
    const was = beforeText.slice(region.start, region.end);
    const now = afterText.slice(after.regions[index].start, after.regions[index].end);
    if (region.law === 'append' && !restores && !stripOneTerminator(now).startsWith(stripOneTerminator(was))) {
      return { law: 'append', rule: 'law_violated', region: index, ...lawBounds(region) };
    }
    if (region.law !== 'keep') continue;
    if (was === now) continue;
    const moved = minimalSplice(was, now);
    if (restores && splices.some(row => {
      const wrote = minimalSplice(row.removed, row.inserted);
      return row.pos + wrote.pos === region.start + moved.pos &&
        row.pos >= region.start && row.pos + row.removed.length <= region.end &&
        wrote.removed === moved.removed && wrote.inserted === moved.inserted;
    })) continue;
    return { law: 'keep', rule: 'law_violated', region: index, ...lawBounds(region) };
  }
  return enforceWillReferences(beforeText, afterText, {before, after, restores, referenceCheck});
}

function overlap(range, splice) {
  if (!range || !safeInt(range.start) || !safeInt(range.end)) return false;
  const start = splice.pos, end = start + splice.removed.length;
  if (range.start === range.end) return start <= range.start && range.start <= end;
  if (start === end) return range.start < start && start < range.end;
  return range.start < end && start < range.end;
}

function safeBoundary(text, offset) {
  return safeInt(offset) && offset <= text.length && !(offset > 0 && offset < text.length &&
    (text.charCodeAt(offset - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(offset) & 0xfc00) === 0xdc00);
}

// clock and mintId are the only impure facts, injected; no Date.now or randomUUID here (the decision-purity gate in tools/build.mjs).
// Pure: names the surface fact a call would require; an adapter may fill `world` up front.
export function measurementsRequired(op, args = {}) {
  if (op === 'document.outline') return { structure: { mode: 'outline' } };
  if (op === 'document.find' && typeof args.kind === 'string' && !args.cursor) {
    return { structure: { mode: 'find', query: args.query, kind: args.kind, within: args.within || null, offset: 0 } };
  }
  return null;
}

function inspectPaintRecord(paint) {
  return paint ? {...paint,
    ...(paint.actions ? {actions: {kept: true, count: paint.actions.length}} : {}),
    ...(paint.replay ? {replay: {kept: true, entries: paint.replay.entries.length}} : {})} : paint;
}
// The recipe as a caller is shown it: each paint layer's pixels and history are named, never carried, and a replace that keeps the
// marker keeps the layer's own bytes. The whole-recipe edit budget measures this text; an object handle measures its named shape.
export function disclosedRecipe(recipe) {
  return {...recipe, shapes: recipe.shapes.map(shape => shape.recognized !== 'paint' ? shape : {...shape,
    raster: { kept: true, bytes: shape.raster.length, type: shape.raster.startsWith('data:image/png;') ? 'png' : 'jxl' },
    ...(shape.paint ? {paint: inspectPaintRecord(shape.paint)} : {})})};
}

// The digest of a recipe object, hashed once. The page hands one recipe object to each of the door's listeners for a change, and the
// kernel hands its own admitted copy back to itself on every read of the open drawing; each later look finds the first digest here.
// A recipe object is never changed after it is handed over: the page builds a new one for every change.
const recipeDigests = new WeakMap();
function digestOfRecipe(source, admitted) {
  let digest = recipeDigests.get(source);
  if (digest === undefined) {
    digest = sha256(canonicalJson(admitted));
    recipeDigests.set(source, digest);
    recipeDigests.set(admitted, digest);
  }
  return digest;
}

export function drawingRecipeDigest(recipe) {
  const admitted = _rapierDrawAdmitRecipe(recipe);
  return admitted ? digestOfRecipe(recipe, admitted) : null;
}

export function createKernel({ state: supplied, host = {}, clock, mintId, invocationJournal: suppliedJournal, inFlight: suppliedInFlight = [] } = {}) {
  if (typeof clock !== 'function') throw new TypeError('createKernel requires an injected clock');
  if (typeof mintId !== 'function') throw new TypeError('createKernel requires an injected id minter');
  let state = supplied ? clone(supplied) : createState({ mintId });
  if (!state || typeof state.text !== 'string' || !state.documentId || !safeInt(state.revision) ||
      !Array.isArray(state.journal) || !state.handles || !state.refs || !state.cursors || !state.history ||
      !state.humanContexts || !state.contextSequences || !state.resume || !state.pointers) {
    throw new TypeError('Invalid Rapier state');
  }
  const participant = context => {
    if (!state.authorIdentities) state.authorIdentities = {};
    return participantIdentity(context, mintId, state.authorIdentities);
  };
  let queue = Promise.resolve();
  let outlineCache = null;
  let imageCache = null;
  let waitPending = false;
  const working = new Map();
  const presenceKey = who => ownerOf(who) + '\u0000' + (who.agent || '');
  // Existing host waits outlive a kernel invocation; their callers are ephemeral facts, never document state.
  const carriedWork = suppliedInFlight.map(context => participant(context, mintId)).filter(who => who.actor === 'agent').map(presenceKey);
  // Surface-fact continuations: ephemeral, never journalled.
  const pendingFacts = new Map();
  // A retry belongs to one caller, document and operation identity. Mutation outputs last 24 hours;
  // spent mutation identities remain until the document is discarded, so expiry never repeats a write.
  const invocationJournal = new Map(), readJournal = new Map(), spentJournal = new Map();
  const reading = operation => getTool(operation)?.effect === 'read';
  const short = value => String(value);
  const invocationOwner = who => JSON.stringify([who.transport, who.actor, who.principal]);
  const invocationScope = (key, owner, documentId) => JSON.stringify([owner, documentId, key]);
  function bound() {
    while (readJournal.size > LIMITS.invocationKeys) readJournal.delete(readJournal.keys().next().value);
    const time = Math.max(Number(state.clock) || 0, clock());
    for (const [scope, record] of invocationJournal) if (record.expiresAt <= time) {
      invocationJournal.delete(scope);
      const {key, owner, documentId, operation, settledRevision, expiresAt} = record;
      spentJournal.set(scope, {key, owner, documentId, operation, settledRevision, expiresAt, digest: short(record.inputDigest)});
    }
  }
  if (Array.isArray(suppliedJournal)) {
    for (const entry of suppliedJournal) {
      if (Array.isArray(entry?.spent)) {
        for (const row of entry.spent) if (Array.isArray(row) && typeof row[0] === 'string' && row[0] &&
            typeof row[2] === 'string' && typeof row[3] === 'string' && typeof row[4] === 'string' &&
            typeof row[5] === 'string' && safeInt(row[6])) {
          const [key, settledRevision, digest, owner, documentId, operation, expiresAt] = row;
          spentJournal.set(invocationScope(key, owner, documentId), {key, owner, documentId, operation,
            settledRevision: safeInt(settledRevision) ? settledRevision : 0, digest, expiresAt});
        }
        continue;
      }
      if (!entry || typeof entry.key !== 'string' || !entry.key || typeof entry.owner !== 'string' ||
          typeof entry.operation !== 'string' || !entry.documentId || typeof entry.inputDigest !== 'string' || !safeInt(entry.expiresAt)) continue;
      (reading(entry.operation) ? readJournal : invocationJournal).set(invocationScope(entry.key, entry.owner, entry.documentId),
        {key: entry.key, owner: entry.owner, operation: entry.operation, documentId: entry.documentId,
          settledRevision: safeInt(entry.settledRevision) ? entry.settledRevision : 0, output: clone(entry.output ?? {}),
          inputDigest: entry.inputDigest, expiresAt: entry.expiresAt});
    }
    bound();
  }
  function recordInvocation(key, operation, documentId, output, inputDigest, who) {
    if (!key) return;
    const owner = invocationOwner(who), scope = invocationScope(key, owner, documentId);
    const expiresAt = (invocationJournal.get(scope) || readJournal.get(scope) || spentJournal.get(scope))?.expiresAt ?? now() + LIMITS.retryMs;
    invocationJournal.delete(scope); readJournal.delete(scope); spentJournal.delete(scope);
    (reading(operation) ? readJournal : invocationJournal).set(scope,
      {key, owner, operation, documentId, settledRevision: output.documentRevision, output: clone(output), inputDigest, expiresAt});
    bound();
  }
  function priorInvocation(key, who) {
    const scope = invocationScope(key, invocationOwner(who), state.documentId);
    const whole = invocationJournal.get(scope) || readJournal.get(scope);
    if (whole) return whole;
    const spent = spentJournal.get(scope);
    return spent ? {...spent, spent: true} : null;
  }
  function replayOf(prior, name, inputDigest) {
    if (prior.operation !== name || (prior.spent ? prior.digest !== short(inputDigest) : prior.inputDigest !== inputDigest)) return null;
    if (prior.spent || !reading(name) && now() >= prior.expiresAt) return stamp(failure('operation_retry_expired', 'refused', {retryExpiresAt: prior.expiresAt}));
    const output = {...clone(prior.output), replayed: true};
    if (name === 'editor.point' && output.pointerId) {
      expireCollaboration();
      const pointer = Object.values(state.pointers).find(row => row.id === output.pointerId);
      const status = pointer?.status || 'expired';
      Object.assign(output, {outcome: status, status});
    }
    return output;
  }
  const invocationCaller = (input, context) => {
    const named = typeof input?.operation_id === 'string' && input.operation_id.length > 0 && input.operation_id.length <= 128 ? input.operation_id : null;
    return participant(named ? {...context, invocationKey: named} : context, mintId);
  };
  function recordedInvocation(name, inputDigest, who) {
    const prior = priorInvocation(who.invocationKey, who);
    return prior ? replayOf(prior, name, inputDigest) || stamp(failure('invocation_key_collision', 'invalid')) : null;
  }
  function replay(name, input = {}, context = {}) {
    if (documentGuardFailure(context)) return stamp(documentGuardFailure(context));
    if (context.continues || context.rejectedInvocationKey) return null;
    const inputDigest = sha256(canonicalJson(input));
    const who = invocationCaller(input, context);
    const output = recordedInvocation(name, inputDigest, who);
    // The work bar remains a current observation, while the receipt keeps its original effect.
    if (name === 'document.observe' && output?.collaboration) {
      output.collaboration.agentPresence = agentPresence({...who, ...(output.collaboration.agentPresence?.agent ? {agent: output.collaboration.agentPresence.agent} : {})}, false);
    }
    return output;
  }
  function invocationJournalEntries() {
    bound();
    return (spentJournal.size ? [{spent: [...spentJournal.values()].map(record => [record.key, record.settledRevision,
      record.digest, record.owner, record.documentId, record.operation, record.expiresAt])}] : [])
      .concat([...invocationJournal.values(), ...readJournal.values()].map(clone));
  }
  const current = () => ({ documentId: state.documentId, documentRevision: state.revision, representation: 'source' });
  const stamp = result => ({ ...current(), ...result });
  const now = () => (state.clock = Math.max(Number(state.clock) || 0, clock()));
  const cancelled = context => context.signal?.throwIfAborted();
  const snapshot = () => clone(state);

  // world is the only source. A `continues` must name a pending fact minted here for this document, revision and mode; spent once.
  function checkContinuation(context, mode) {
    if (!context?.continues) return null;
    const record = pendingFacts.get(context.continues);
    if (!record) return failure('continuation_unknown', 'invalid');
    if (record.documentId !== state.documentId) return failure('continuation_wrong_document', 'invalid');
    if (record.mode !== mode) return failure('continuation_wrong_kind', 'invalid');
    if (record.revision !== state.revision) {
      pendingFacts.delete(context.continues);
      return failure('world_changed', 'refused', { expectedRevision: record.revision });
    }
    return null;
  }
  function worldOrPending(context, mode, requirements, matchExtra) {
    if (context?.continues) {
      const bad = checkContinuation(context, mode);
      if (bad) return { terminal: bad };
      pendingFacts.delete(context.continues);
    }
    const fact = context?.world?.structure;
    if (fact && fact.mode === mode && fact.revision === state.revision && fact.filename === state.filename &&
        (!matchExtra || matchExtra(fact))) {
      return { value: fact.value };
    }
    const requestId = mintId('fact_');
    pendingFacts.set(requestId, { documentId: state.documentId, revision: state.revision, mode });
    // Bounded: the oldest goes.
    while (pendingFacts.size > LIMITS.invocationKeys) pendingFacts.delete(pendingFacts.keys().next().value);
    return { terminal: { outcome: 'pending', reason: 'surface_fact_required', pending: { kind: 'surface-fact', requestId, requirements } } };
  }

  // Peeks at world without minting a request: for a side annotation worth using only when already
  // cheap (find's section context for a plain-text search below), not worth a surface-fact round
  // trip of its own.
  function worldHasFact(context, mode) {
    const fact = context?.world?.structure;
    return !!(fact && fact.mode === mode && fact.revision === state.revision && fact.filename === state.filename);
  }

  function expireCollaboration() {
    const time = now();
    for (const [key, row] of Object.entries(state.humanContexts)) {
      if (row.expiresAt <= time) delete state.humanContexts[key];
    }
    for (const row of Object.values(state.pointers)) if (row.expiresAt <= time || row.documentId !== state.documentId) row.status = 'expired';
  }

  function agentPresence(who = null, excludeCurrent = false) {
    expireCollaboration();
    const key = who && presenceKey(who);
    const localWork = who ? working.get(key)?.count || 0 : [...working.values()].reduce((n, row) => n + row.count, 0);
    const inFlight = Math.max(0, localWork - (excludeCurrent ? 1 : 0)) + (who ? carriedWork.filter(value => value === key).length : carriedWork.length);
    const pointers = (who ? [state.pointers[key]].filter(Boolean) : Object.values(state.pointers)).map(row => clone(row));
    const active = inFlight > 0 || pointers.some(row => row.status === 'shown');
    return who ? {active, inFlight, pointer: pointers[0] ? {id: pointers[0].id, status: pointers[0].status, expiresAt: pointers[0].expiresAt} : null,
      ...(who.agent ? {agent: who.agent} : {})} : {active, inFlight, pointers};
  }

  function publishPresence() {
    if (typeof host.presence === 'function') {
      try { host.presence(agentPresence()); } catch {}
    }
  }

  function pointResult(input, context = {}) {
    humanParticipant(context);
    expireCollaboration();
    const row = Object.values(state.pointers).find(row => row.id === input.pointerId);
    if (!row) return stamp(failure('pointer_missing', 'target_gone'));
    if (!['shown', 'expired'].includes(input.status)) return stamp(failure('pointer_status_invalid', 'invalid'));
    if (row.status !== 'expired') {
      if (input.status === 'shown') for (const other of Object.values(state.pointers)) if (other !== row && other.status === 'shown') {
        other.status = 'expired'; other.reason = 'pointer_replaced';
      }
      row.status = input.status;
    }
    if (input.reason) row.reason = clip(input.reason, 160);
    publishPresence();
    return stamp({outcome: row.status, status: row.status, pointerId: row.id, expires_at: row.expiresAt});
  }

  function continuationContext(will) {
    const intents = will?.faults.length ? [] : (will?.regions || []).filter(row => row.intent);
    return {person: {intents: intents.map(row => ({region: row.index, law: row.law, start: row.start, end: row.end, text: row.intent})),
      intentsComplete: !will?.faults.length, omittedIntents: 0,
      intentsRead: {tool: 'document.read', arguments: {target: {kind: 'source'}}}}};
  }

  // Presentation acknowledges an already committed transaction. It is never edit authority.
  function normalizeDrawingReceipts(rows) {
    return rows.flatMap(row => {
      const entry = state.journal.find(entry => entry.id === row?.transactionId);
      if (!entry || (!entry.drawingIntent && !entry.drawingPatch) ||
          row.documentId != null && row.documentId !== state.documentId ||
          !['incorporated', 'presentation_deferred', 'unavailable', 'uncertain'].includes(row.status)) return [];
      const kept = {transactionId: entry.id, documentId: state.documentId, status: row.status,
        ...(typeof row.reason === 'string' ? {reason: clip(row.reason, 128)} : {})};
      const presented = row.presentation;
      const targets = [entry.drawingIntent?.originalOccurrence, entry.drawingIntent?.occurrence, entry.drawingPatch?.targetOccurrence].filter(Boolean);
      const target = targets.find(target => presented?.occurrence?.start === target.start && presented?.occurrence?.end === target.end &&
        normalizeLabel(presented?.occurrence?.reference || '') === normalizeLabel(target.reference || entry.drawingIntent?.reference || '')) || targets[0];
      if (presented != null) {
        if (!['deferred', 'replaying', 'completed', 'skipped', 'interrupted', 'unavailable'].includes(presented.status)) return [];
        if (presented.occurrence && (!target || presented.occurrence.start !== target.start || presented.occurrence.end !== target.end ||
            normalizeLabel(presented.occurrence.reference || '') !== normalizeLabel(target.reference || entry.drawingIntent?.reference || ''))) return [];
        if (['replaying', 'completed', 'skipped'].includes(presented.status) && (!presented.occurrence ||
            typeof presented.session !== 'string' || !safeInt(presented.surfaceGeneration))) return [];
        kept.presentation = {status: presented.status,
          ...(typeof presented.session === 'string' && presented.session.length <= 128 ? {session: presented.session} : {}),
          ...(safeInt(presented.surfaceGeneration) ? {surfaceGeneration: presented.surfaceGeneration} : {}),
          ...(presented.occurrence ? {occurrence: clone(target)} : {})};
      }
      return [kept];
    });
  }

  function drawingPresentationBinding() {
    const row = Object.values(state.humanContexts).filter(row => row.visible && row.expiresAt > now() && row.revision === state.revision)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return row ? {contextId: row.contextId, contextOwner: row.owner, navigationSequence: row.navigationSequence || 0} : null;
  }

  function pendingDrawingIntent() {
    const entry = state.journal.find(row => ['pending', 'replaying'].includes(row.drawingIntent?.status));
    if (!entry) return null;
    return {...clone(entry.drawingIntent), ...(entry.drawingPatch ? {drawingPatch: clone(entry.drawingPatch)} : {})};
  }

  function drawingPatchForEntry(entry) {
    return expandJournalDrawingPatch(state, entry.id);
  }

  function retireDrawingPresentation(entry, reason) {
    const intent = entry.drawingIntent;
    if (!intent || !['pending', 'replaying', 'awaiting_receipt'].includes(intent.status)) return;
    intent.status = 'unavailable'; intent.reason = reason;
    entry.drawingReceipt = {transactionId: entry.id, documentId: state.documentId, status: 'unavailable', reason,
      presentation: {status: 'unavailable', reason}};
    for (const record of invocationJournal.values()) if (record.output?.act?.id === entry.id) {
      record.output = {...record.output, drawingReceipt: clone(entry.drawingReceipt),
        ...(record.output.receipt ? {receipt: {...record.output.receipt, presentation: 'unavailable'}} : {})};
    }
  }

  function drawingTurnSummary() {
    const entry = state.journal.findLast(row => row.drawingIntent);
    const intent = entry?.drawingIntent;
    return intent ? {transactionId: entry.id, status: intent.status,
      occurrence: clone(intent.occurrence), reference: intent.reference,
      presentation: entry.drawingReceipt?.presentation ? clone(entry.drawingReceipt.presentation) : {status: intent.status}} : null;
  }

  function normalizeDrawing(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || value.open !== true || typeof value.session !== 'string' ||
        !value.session || value.session.length > 128 || !safeInt(value.surfaceGeneration) || value.recipeReference != null) return false;
    let occurrence = null;
    if (value.occurrence != null) {
      const row = value.occurrence;
      if (!safeBoundary(state.text, row.start) || !safeBoundary(state.text, row.end) || row.end <= row.start ||
          typeof row.reference !== 'string') return false;
      const match = DRAW_OCCURRENCE.exec(state.text.slice(row.start, row.end));
      const asset = documentAssets(state.text).assets.get(normalizeLabel(row.reference));
      if (!match || normalizeLabel(match[2]) !== normalizeLabel(row.reference) || !asset ||
          value.assetGeneration !== sha256(asset.url)) return false;
      occurrence = {reference: row.reference, position: row.start, start: row.start, end: row.end,
        ...(row.blockId != null ? {blockId: String(row.blockId)} : {}),
        ...(safeInt(row.imageIndex) ? {imageIndex: row.imageIndex} : {})};
    } else if (value.assetGeneration != null) return false;
    const result = {open: true, session: value.session, surfaceGeneration: value.surfaceGeneration,
      assetGeneration: occurrence ? value.assetGeneration : null, occurrence};
    const allowed = ['selectedObjects', 'paintTarget', 'bounds', 'transform', 'transforms', 'busy', 'tool', 'brushes', 'limits'];
    for (const field of allowed) if (own(value, field)) result[field] = clone(value[field]);
    if (bytes(JSON.stringify(result)) > LIMITS.authorityBytes) return false;
    if (value.recipeDigest != null) {
      if (typeof value.recipeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.recipeDigest)) return false;
      result.recipeDigest = value.recipeDigest;
    }
    if (typeof value.recipeUnavailable === 'string') result.recipeUnavailable = clip(value.recipeUnavailable, 128);
    if (value.recipe != null) {
      // The open canvas's recipe is measured as a caller is shown it (disclosedRecipe): its pixels and histories are the document's.
      let text;
      try { text = JSON.stringify(Array.isArray(value.recipe?.shapes) ? disclosedRecipe(value.recipe) : value.recipe); } catch (_) { return false; }
      const recipe = _rapierDrawAdmitRecipe(value.recipe);
      if (!recipe) return false;
      const recipeDigest = digestOfRecipe(value.recipe, recipe);
      if (result.recipeDigest && result.recipeDigest !== recipeDigest) return false;
      result.recipeDigest = recipeDigest;
      if (bytes(text) > LIMITS.authorityBytes) result.recipeUnavailable = 'target_over_edit_budget';
      else result.recipe = recipe;
    }
    if (Array.isArray(value.receipts)) result.receipts = normalizeDrawingReceipts(value.receipts);
    if (value.event != null) {
      const event = value.event;
      if (event.kind !== 'human' || !safeInt(event.sequence) || event.session !== value.session ||
          !safeInt(event.surfaceGeneration) || event.surfaceGeneration > value.surfaceGeneration) return false;
      result.event = {kind: 'human', sequence: event.sequence, session: event.session, surfaceGeneration: event.surfaceGeneration};
    }
    return result;
  }

  function currentDrawing() {
    const direct = state.drawing && normalizeDrawing(state.drawing);
    if (direct) return direct;
    const contexts = Object.values(state.humanContexts).filter(row => row.visible && row.expiresAt > now() &&
      row.revision === state.revision && row.drawing).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const row of contexts) { const value = normalizeDrawing(row.drawing); if (value) return value; }
    return null;
  }

  function drawingSummary(value = currentDrawing()) {
    if (!value) return null;
    const {recipe, ...summary} = value;
    const result = clone(summary), lists = [
      [result, 'selectedObjects', 'selectedObjectCount', 'selectedObjectsComplete'],
      [result.brushes, 'paint', 'paintCount', 'paintComplete'],
      [result.brushes, 'vector', 'vectorCount', 'vectorComplete'],
      [result, 'receipts', 'receiptCount', 'receiptsComplete'],
    ].filter(([owner, field]) => Array.isArray(owner?.[field]));
    for (const [owner, field, count, complete] of lists) {
      owner[count] = owner[field].length;
      owner[field] = owner[field].slice(0, 128);
      owner[complete] = owner[field].length === owner[count];
    }
    // A full canvas selection and installed brushes are useful facts, but they must share
    // one reply with the document. Counts make bounded lists explicit; raw recipes stay private.
    while (bytes(JSON.stringify(result)) > LIMITS.resultBytes / 3) {
      const list = lists.filter(([owner, field]) => owner[field].length)
        .sort((a, b) => bytes(JSON.stringify(b[0][b[1]])) - bytes(JSON.stringify(a[0][a[1]])))[0];
      if (!list) return {open: result.open, session: result.session, occurrence: result.occurrence,
        assetGeneration: result.assetGeneration, surfaceGeneration: result.surfaceGeneration,
        summaryUnavailable: 'drawing_context_over_budget', ...(result.recipeUnavailable ? {recipeUnavailable: result.recipeUnavailable} : {})};
      const [owner, field, , complete] = list;
      owner[field] = owner[field].slice(0, Math.floor(owner[field].length / 2)); owner[complete] = false;
    }
    return result;
  }

  function drawingFor(start, end, assetLabel) {
    const value = currentDrawing(), row = value?.occurrence;
    return row && row.start === start && row.end === end && normalizeLabel(row.reference) === normalizeLabel(assetLabel) ? value : null;
  }

  function drawingBinding(value) {
    return value?.recipe || value?.recipeDigest ? {drawSession: value.session, surfaceGeneration: value.surfaceGeneration,
      surfaceRecipeDigest: value.recipeDigest || digestOfRecipe(value.recipe, value.recipe)} : {};
  }

  function drawBindingFailure(held, range, live) {
    if (!held.drawSession) return null;
    if (live === undefined) live = drawingFor(range.start, range.end, held.assetLabel);
    return !live || live.session !== held.drawSession || live.surfaceGeneration !== held.surfaceGeneration ||
      (live.recipeDigest || (live.recipe && digestOfRecipe(live.recipe, live.recipe))) !== held.surfaceRecipeDigest
      ? failure('draw_surface_changed', 'conflict') : null;
  }

  function collaboration() {
    expireCollaboration();
    const contexts = Object.values(state.humanContexts).filter(row => row.visible);
    const targets = contexts.filter(row => !row.editing && row.revision === state.revision)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const target = targets.find(row => row.selection || row.focus) || targets[0];
    const view = contexts.filter(row => row.view).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.view;
    const editing = contexts.some(row => row.editing);
    const drawing = drawingSummary();
    const presence = contexts.length ? { active: true, editing,
      ...(view ? {view} : {}),
      revision: target?.revision ?? state.revision,
      selection: target?.selection ? clone(target.selection) : null,
      focus: target?.focus ? clone(target.focus) : null,
      expiresAt: Math.max(...contexts.map(row => row.expiresAt)),
      ...(drawing ? {drawing} : {}) } : null;
    // nextExpiryAt projects only future moments; a lapsed expiresAt would force every sync to do full work forever.
    const expiries = contexts.map(row => row.expiresAt);
    for (const pointer of Object.values(state.pointers)) if (pointer.status !== 'expired') expiries.push(pointer.expiresAt);
    return { presence, agentPresence: agentPresence(),
      drawingIntent: pendingDrawingIntent(), nextExpiryAt: expiries.length ? Math.min(...expiries) : null };
  }

  function humanParticipant(context) {
    const who = participant(context, mintId);
    if (who.actor !== 'human') throw new TypeError('Human authority required');
    if (safeInt(context.serverNow)) state.clock = Math.max(Number(state.clock) || 0, context.serverNow);
    return who;
  }

  function humanContext(input, context = {}) {
    const who = humanParticipant(context);
    if (typeof input.contextId !== 'string' || !input.contextId || input.contextId.length > 128 ||
        !safeInt(input.sequence) || !safeInt(input.expectedRevision) ||
        typeof input.visible !== 'boolean' || typeof input.editing !== 'boolean' ||
        input.view != null && !['formatted', 'source', 'notes'].includes(input.view) ||
        input.navigationSequence != null && !safeInt(input.navigationSequence) ||
        input.drawingReceipts != null && !Array.isArray(input.drawingReceipts)) return stamp(failure('human_context_invalid', 'invalid'));
    expireCollaboration();
    const key = ownerOf(who) + ':' + input.contextId, prior = state.humanContexts[key], priorSequence = state.contextSequences[key];
    if (priorSequence && input.sequence <= priorSequence.sequence) return stamp(accepted({ acknowledged: false, sequence: priorSequence.sequence, expiresAt: prior?.expiresAt || null }));
    const recordSequence = () => {
      state.contextSequences[key] = { sequence: input.sequence, at: now() };
      const entries = Object.entries(state.contextSequences).sort((a, b) => a[1].at - b[1].at);
      while (entries.length > 64) delete state.contextSequences[entries.shift()[0]];
    };
    if (!input.visible) {
      delete state.humanContexts[key]; recordSequence();
      return stamp(accepted({ acknowledged: true, sequence: input.sequence, expiresAt: null }));
    }
    // A delayed attestation must not erase a live range already transported by a newer commit.
    if (input.expectedRevision !== state.revision) return stamp(failure('human_context_stale', 'conflict'));
    const range = value => value && safeBoundary(state.text, value.start) && safeBoundary(state.text, value.end) && value.start <= value.end
      ? { start: value.start, end: value.end, ...(typeof value.objectId === 'string' ? {objectId: value.objectId} : {}) } : null;
    const time = now(), selection = range(input.selection), focus = range(input.focus);
    if ((input.selection != null && !selection) || (input.focus != null && !focus)) return stamp(failure('human_context_range_invalid', 'invalid'));
    let drawingInput = input.drawing, referencedRecipe = null;
    if (drawingInput?.recipeReference === true) {
      // A reference borrows this editor's live attestation, never another editor or saved asset bytes.
      const held = prior?.drawing, occurrence = drawingInput.occurrence, priorOccurrence = held?.occurrence;
      const sameOccurrence = !occurrence && !priorOccurrence || occurrence && priorOccurrence &&
        occurrence.start === priorOccurrence.start && occurrence.end === priorOccurrence.end && occurrence.reference === priorOccurrence.reference;
      if (drawingInput.recipe != null || drawingInput.recipeUnavailable != null || !held?.recipe || prior.revision !== input.expectedRevision ||
          held.session !== drawingInput.session || held.surfaceGeneration !== drawingInput.surfaceGeneration ||
          held.assetGeneration !== drawingInput.assetGeneration || held.recipeDigest !== drawingInput.recipeDigest || !sameOccurrence)
        return stamp(failure('human_context_recipe_required', 'conflict'));
      referencedRecipe = held.recipe;
      const {recipeReference, ...value} = drawingInput;
      drawingInput = value;
    }
    const drawing = normalizeDrawing(drawingInput);
    if (drawing === false) return stamp(failure('human_context_drawing_invalid', 'invalid'));
    if (referencedRecipe) drawing.recipe = referencedRecipe;
    if (!prior && Object.keys(state.humanContexts).length >= LIMITS.humanContexts) return stamp(failure('human_context_limit'));
    state.humanContexts[key] = { owner: ownerOf(who), contextId: input.contextId, navigationSequence: input.navigationSequence || 0, sequence: input.sequence, revision: input.expectedRevision,
      ...(input.view ? {view: input.view} : {}),
      visible: true, editing: input.editing, selection, focus, drawing, updatedAt: time, expiresAt: time + LIMITS.presenceMs };
    for (const receipt of normalizeDrawingReceipts([...(input.drawingReceipts || []), ...(drawing?.receipts || [])])) {
      const entry = state.journal.find(row => row.id === receipt.transactionId), intent = entry?.drawingIntent;
      if (!intent || intent.contextId !== input.contextId || intent.contextOwner && intent.contextOwner !== ownerOf(who) || !['pending', 'replaying', 'awaiting_receipt', 'superseded'].includes(intent.status)) continue;
      const status = receipt.presentation?.status;
      if (['completed', 'skipped', 'interrupted', 'unavailable'].includes(status)) intent.status = status;
      else if (status === 'replaying' && intent.status !== 'superseded' && intent.status !== 'awaiting_receipt') intent.status = 'replaying';
      else if (receipt.status === 'unavailable' || receipt.status === 'uncertain') intent.status = receipt.status;
      entry.drawingReceipt = receipt;
    }
    recordSequence();
    return stamp(accepted({ acknowledged: true, sequence: input.sequence, expiresAt: time + LIMITS.presenceMs }));
  }

  function imageSpans(text = state.text) {
    if (imageCache?.text === text) return imageCache.spans;
    const envelopes = assetOmissions(text), spans = [...envelopes];
    const pattern = /data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)(?:;[^,\s"'<>)]*)?,/ig;
    let envelopeIndex = 0;
    for (let match; (match = pattern.exec(text));) {
      while (envelopeIndex < envelopes.length && envelopes[envelopeIndex].end <= match.index) envelopeIndex++;
      const envelope = envelopes[envelopeIndex];
      if (envelope && envelope.start <= match.index) { pattern.lastIndex = envelope.end; continue; }
      const payloadStart = pattern.lastIndex;
      const base64 = /;base64,/i.test(match[0]);
      let end = payloadStart;
      const permitted = base64 ? /[A-Za-z0-9+/=\s]/ : /[A-Za-z0-9\-._~!$&*+;=:@/?%]/;
      while (end < text.length && permitted.test(text[end])) end++;
      if (end > payloadStart) spans.push({ start: match.index, end, type: match[1], chars: end - match.index,
        profile: base64 ? 'base64' : 'data' });
      pattern.lastIndex = Math.max(pattern.lastIndex, end);
    }
    spans.sort((a, b) => a.start - b.start);
    if (text === state.text) imageCache = { text, spans };
    return spans;
  }

  function disclose(text, start = 0, end = text.length) {
    const spans = imageSpans(text).filter(row => row.start < end && start < row.end);
    if (!spans.length) return { text: text.slice(start, end), omissions: [] };
    let at = start, output = '';
    const omissions = [];
    for (const row of spans) {
      const left = Math.max(start, row.start), right = Math.min(end, row.end);
      output += text.slice(at, left) + `<embedded ${row.type}; ${row.chars} source characters omitted>`;
      at = right;
      omissions.push({ domain: 'image_bytes', reason: row.reason || 'embedded_data_uri', start: left, end: right, omitted: right - left,
        profile: row.profile || 'embedded',
        ...(row.id ? { id: row.id } : {}), ...(row.width ? { width: row.width, height: row.height, bytes: row.bytes } : {}) });
    }
    return { text: output + text.slice(at, end), omissions };
  }

  const display = (text, limit) => clip(disclose(String(text || '')).text, limit);

  function currentRange(range, who = null) {
    let end = Math.min(range.end, range.start + LIMITS.readChars);
    while (!safeBoundary(state.text, end) && end > range.start) end--;
    const shown = disclose(state.text, range.start, end);
    const value = {start: range.start, end: range.end, text: shown.text,
      complete: end === range.end && !shown.omissions.length};
    if (shown.omissions.length) value.omissions = shown.omissions.slice(0, 8);
    // The refusal must keep its cause even when the current range is large or needs JSON escaping.
    while (value.text.length && bytes(JSON.stringify({...current(), current: value})) > LIMITS.resultBytes - 1600) {
      value.text = clip(value.text, Math.floor(value.text.length / 2)); value.complete = false;
    }
    // Only complete source disclosure can renew source authority. Picture syntax keeps
    // its typed read; a human-overlap refusal does not call this renewal path.
    if (who && value.complete &&
        !(state.docKind === 'markdown' && DRAW_OCCURRENCE.test(value.text.trim()))) {
      const fresh = handle(range.start, range.end, who);
      if (fresh) Object.assign(value, {handle: fresh.id, expires_in_ms: LIMITS.lifetimeMs});
    }
    return {current: value, ...(value.handle
      ? {hint: 'The passage changed; inspect current.text, then resend the intended edit with current.handle.'} : {})};
  }

  function prune() {
    expireCollaboration();
    for (const key of ['handles', 'refs', 'cursors']) {
      for (const [id, row] of Object.entries(state[key])) {
        // An expired row stays until lookup names context_expired; dropping it reads as context_missing.
        if (row.used || row.documentId !== state.documentId) delete state[key][id];
      }
      const limit = LIMITS[key];
      const rows = Object.values(state[key]).sort((a, b) => a.createdAt - b.createdAt);
      while (rows.length > limit) delete state[key][rows.shift().id];
    }
    const rows = Object.values(state.handles).sort((a, b) => a.createdAt - b.createdAt);
    let retained = rows.reduce((sum, row) => sum + bytes(row.text || ''), 0);
    while (retained > LIMITS.authorityBytes && rows.length) {
      const row = rows.shift(); retained -= bytes(row.text || ''); delete state.handles[row.id];
    }
  }

  function mint(pool, prefix, row, who, id = mintId(prefix)) {
    const time = now();
    state[pool][id] = { ...row, id, owner: ownerOf(who), documentId: state.documentId,
      createdAt: time, expiresAt: time + LIMITS.lifetimeMs };
    prune();
    return state[pool][id] || null;
  }

  function lookup(pool, id, who, consumeExpired = true) {
    const row = state[pool][String(id || '')];
    if (!row) return failure(pool === 'handles' ? 'context_missing' : pool === 'cursors' ? 'cursor_missing' : 'reference_missing', 'target_gone');
    if (!sameOwner(row, who)) return failure('authority_mismatch');
    if (row.used) return failure('context_replayed');
    if (now() > row.expiresAt) { if (consumeExpired) delete state[pool][row.id]; return failure('context_expired', 'target_gone'); }
    if (row.documentId !== state.documentId) return failure('document_replaced', 'target_gone');
    return row;
  }

  // Compare change ids live on state.compare, not the handle pool. Callers that refuse them check changeOf before lookup('handles').
  function changeOf(id) {
    if (id == null || id === '' || !state.compare) return null;
    return state.compare.changes.find(row => row.id === String(id)) || null;
  }

  function since(revision) {
    if (revision === state.revision) return [];
    if (!safeInt(revision) || revision > state.revision) return null;
    const rows = state.journal.filter(row => row.revision > revision).sort((a, b) => a.revision - b.revision);
    let next = revision;
    for (const row of rows) {
      if (row.baseRevision !== next || row.revision !== next + 1) return null;
      next = row.revision;
    }
    return next === state.revision ? rows : null;
  }

  function relocate(record, who = null) {
    const entries = since(record.revision);
    if (!entries) return failure('history_unavailable', 'conflict');
    // Refs, comparison evidence and typed picture handles never become source handles.
    let sourceCaller = who && !record.kind && state.handles[record.id] === record && sameOwner(record, who) ? who : null;
    let range = { start: record.start, end: record.end }, changedBy = null;
    for (const entry of entries) {
      const moved = transportInterval(range.start, range.end, entry.splices);
      if (!moved && changedBy === null) changedBy = entry.actor;
      if (!moved && entry.actor === 'human') sourceCaller = null;
      range = moved || transportTouchedInterval(range.start, range.end, entry.splices);
    }
    if (!safeBoundary(state.text, range.start) || !safeBoundary(state.text, range.end) || range.end < range.start) {
      return failure('target_changed', 'conflict');
    }
    if (changedBy !== null) return failure(changedBy === 'human' ? 'human_changed_target' : 'target_changed',
      changedBy === 'human' ? 'yielded' : 'conflict', currentRange(range, sourceCaller));
    const selected = state.text.slice(range.start, range.end);
    if ((typeof record.text === 'string' && selected !== record.text) || (record.digest && digest(selected) !== record.digest)) {
      return failure('target_changed', 'conflict', currentRange(range, sourceCaller));
    }
    return { ...range, rebased: record.revision !== state.revision };
  }

  function retain(entry) {
    state.journal.push(entry);
    outlineCache = null;
    imageCache = null;
  }

  function appendCommit(text, splices, who, operation, options = {}) {
    const baseRevision = state.revision, revision = options.revision == null ? baseRevision + 1 : options.revision;
    const agent = agentLabel(who.agent || options.agent);
    // Only attest a derived footer row by recomputing it from the actual preceding source
    // and edits. An imported journal's claim cannot turn an authored comment into metadata.
    const tail = splices.at(-1), derived = options.derivedCommentIndex == null && who.actor === 'agent' && state.docKind === 'markdown' && splices.length > 1
      ? commentSplices(state.text, splices.slice(0, -1))[0] : null;
    const derivedCommentIndex = options.derivedCommentIndex ?? (derived && tail.pos === derived.pos && tail.removed === derived.removed && tail.inserted === derived.inserted
      ? splices.length - 1 : null);
    const entry = {
      id: options.id || mintId('change_'), baseRevision, revision,
      actor: who.actor, principal: who.principal, transport: who.transport, owner: ownerOf(who),
      ...(who.hostAgent ? {hostAgent: who.hostAgent} : {}),
      operation, requestId: who.requestId, invocationKey: who.invocationKey, label: options.reconciled ? (typeof options.label === 'string' ? clip(options.label, 120) : null) : clip(options.label ?? operation, 120),
      splices: clone(splices), ...(Object.hasOwn(options, 'authored') ? {authored: clone(options.authored)} : {}), ...(options.metadataDelta ? {metadata: clone(options.metadataDelta)} : {}), author: historyAuthor(options.author || who.author, who.actor),
      ...(options.reverts ? {reverts: options.reverts} : {}), ...(options.reapplies ? {reapplies: options.reapplies} : {}),
      createdAt: options.reconciled || Object.hasOwn(options, 'createdAt') ? (safeInt(options.createdAt) ? options.createdAt : null) : now(), sourceTransactionId: options.sourceTransactionId || null,
      ...(options.turnId ? {turnId: options.turnId,
        turnBaseRevision: options.turnBaseRevision ?? state.journal.find(row => row.turnId === options.turnId && sameHistoryAuthor(row, who))?.baseRevision ?? baseRevision} : {}),
      ...(options.sourceTransactionIds?.length ? {sourceTransactionIds: [...options.sourceTransactionIds]} : {}),
      ...(agent ? {agent} : {}),
      ...(Array.isArray(options.affectedBlockIds) ? {affectedBlockIds: options.affectedBlockIds.filter(Number.isSafeInteger)} : {}),
      ...(derivedCommentIndex == null ? {} : {derivedCommentIndex}),
    };
    if (options.drawingPresentation) {
      const requested = options.drawingPresentation, occurrence = requested.occurrence;
      const found = DRAW_OCCURRENCE.exec(text.slice(occurrence.start, occurrence.end));
      const asset = documentAssets(text).assets.get(normalizeLabel(requested.reference));
      if (found && normalizeLabel(found[2]) === normalizeLabel(requested.reference) && asset) {
        entry.drawingIntent = {...clone(requested), id: entry.id, transactionId: entry.id,
          documentId: state.documentId, revision, status: requested.contextId ? 'pending' : 'unavailable',
          ...(options.drawingPatch ? {patchRequired: true} : {}),
          occurrence: {...occurrence, reference: requested.reference}, originalOccurrence: {...occurrence, reference: requested.reference}, assetGeneration: sha256(asset.url)};
      }
    }
    if (options.drawingPatch) {
      const retained = compactDrawingPatch(options.drawingPatch, state.text, text);
      if (retained) entry.drawingPatch = {...clone(retained), transactionId: entry.id};
      else retireDrawingPresentation(entry, 'drawing_history_unavailable');
    }
    for (const [key, pointer] of Object.entries(state.pointers)) if (pointer.status !== 'expired') {
      pointer.status = 'expired'; pointer.reason = who.actor === 'agent' && key === presenceKey(who) ? 'agent_changed' : 'document_changed';
    }
    for (const prior of state.journal) {
      const intent = prior.drawingIntent;
      if (!intent || !['pending', 'replaying'].includes(intent.status)) continue;
      const moved = transportInterval(intent.occurrence.start, intent.occurrence.end, splices);
      if (!moved) {intent.status = intent.status === 'replaying' ? 'awaiting_receipt' : 'superseded'; continue;}
      intent.occurrence = {...intent.occurrence, ...moved}; intent.revision = revision;
    }
    if (options.metadataDelta) {
      const nextMetadata = transformMetadata({filename: state.filename, docKind: state.docKind}, options.metadataDelta);
      if (!nextMetadata) throw new TypeError('metadata_history_invalid');
      state.filename = nextMetadata.filename; state.docKind = nextMetadata.docKind;
    }
    state.text = text; state.revision = revision;
    if (state.selection) {
      const moved = transportInterval(state.selection.start, state.selection.end, splices);
      state.selection = moved ? { ...state.selection, ...moved } : null;
    }
    if (state.focus) {
      const focus = transportInterval(state.focus.start, state.focus.end, splices);
      state.focus = focus ? { ...state.focus, ...focus } : null;
    }
    const moveDrawing = drawing => {
      if (!drawing?.occurrence) return drawing;
      const moved = transportInterval(drawing.occurrence.start, drawing.occurrence.end, splices);
      return moved ? {...drawing, occurrence: {...drawing.occurrence, ...moved, position: moved.start}} : null;
    };
    state.drawing = moveDrawing(state.drawing);
    for (const row of Object.values(state.humanContexts)) {
      row.drawing = moveDrawing(row.drawing);
      if (row.revision !== baseRevision) { row.selection = null; row.focus = null; continue; }
      for (const key of ['selection', 'focus']) if (row[key]) {
        const move = row.editing ? transportTouchedInterval : transportInterval;
        const moved = move(row[key].start, row[key].end, splices);
        row[key] = moved ? {...row[key], ...moved} : null;
      }
      row.revision = revision;
    }
    retain(entry);
    if (state.compare && !options.keepCompare) state.compare = null;
    return entry;
  }

  function reconcile(incoming, context = { actor: 'human', principal: 'local' }) {
    if (!incoming || typeof incoming.text !== 'string') throw new TypeError('Snapshot text required');
    const invalid = admissibleSnapshotText(incoming.text);
    if (invalid) throw new TypeError(invalid);
    const filename = incoming.filename == null ? state.filename : incoming.filename;
    if (!validName(filename)) throw new TypeError('filename_invalid');
    const nextKind = incoming.docKind || documentKind(filename);
    if (!['markdown', 'text', 'code'].includes(nextKind)) throw new TypeError('document_kind_invalid');
    const who = participant(context, mintId);
    let carriedHistory = null;
    const admitHistory = (source, revision) => {
      const known = new Map(state.journal.map(row => [row.revision, row]));
      let previous = -1;
      for (const row of incoming.journal) {
        if (!validSnapshotJournalRow(row) || row.revision <= previous) throw new TypeError('history_invalid');
        previous = row.revision;
        const prior = known.get(row.revision);
        const provenance = row => {const {derivedCommentIndex, ...record} = journalHistory([row]).records[0]; return record;};
        if (prior && (canonicalJson(provenance(prior)) !== canonicalJson(provenance(row)) ||
            prior.derivedCommentIndex != null && row.derivedCommentIndex != null && row.derivedCommentIndex !== prior.derivedCommentIndex))
          throw new TypeError('history_invalid');
      }
      // Overlap must prove the retained acts, not replace their provenance. An earlier
      // carrier may extend the known prefix; a suffix cannot discard it.
      const boundary = state.journal[0]?.baseRevision ?? state.revision;
      const supplied = new Map(incoming.journal.map(row => [row.revision, row]));
      const retained = state.journal.map(row => row.derivedCommentIndex == null && supplied.get(row.revision)?.derivedCommentIndex != null
        ? {...row, derivedCommentIndex: supplied.get(row.revision).derivedCommentIndex} : row);
      const rows = incoming.journal.filter(row => row.revision <= boundary).concat(retained,
        incoming.journal.filter(row => row.revision > state.revision));
      const history = {...journalHistory(rows, source, incoming.historyComplete ?? state.history.complete),
        metadata: {filename, docKind: nextKind}, revision};
      const proof = historyProjection(history, {from: 0, to: 0});
      if (!proof.ok) throw new TypeError(proof.reason);
      if (!validCommentHistory(history, rows)) throw new TypeError('history_invalid');
      return {rows, proof};
    };
    if ((!incoming.documentId || incoming.documentId === state.documentId) && Array.isArray(incoming.journal) &&
        incoming.revision === state.revision && incoming.text === state.text && filename === state.filename && nextKind === state.docKind)
      carriedHistory = admitHistory(state.text, state.revision);
    if (incoming.documentId && incoming.documentId !== state.documentId) {
      state = createState({ documentId: incoming.documentId, text: incoming.text, filename,
        docKind: incoming.docKind, revision: incoming.revision, mintId });
      outlineCache = null;
    } else if (incoming.text !== state.text || filename !== state.filename || nextKind !== state.docKind || (safeInt(incoming.revision) && incoming.revision !== state.revision)) {
      const base = state.revision, target = incoming.revision;
      let evidence = null;
      if (Array.isArray(incoming.journal) && safeInt(target) && target > base) {
        const entries = incoming.journal.filter(row => row?.revision > base && row.revision <= target)
          .sort((a, b) => a.revision - b.revision);
        let replay = state.text, metadata = {filename: state.filename, docKind: state.docKind}, revision = base, valid = true;
        for (const row of entries) {
          if ((!validSnapshotJournalRow(row) && !state.journal.length) || row.baseRevision !== revision || row.revision !== revision + 1) { valid = false; break; }
          metadata = transformMetadata(metadata, row.metadata);
          if (!metadata) {valid = false; break;}
          replay = transformSplices(replay, row.splices);
          if (replay == null) { valid = false; break; }
          revision = row.revision;
        }
        if (valid && revision === target && replay === incoming.text && metadata.filename === filename && metadata.docKind === nextKind) evidence = entries;
      }
      const inferred = evidence ? null : minimalSplice(state.text, incoming.text);
      if (evidence) {
        // Admit the complete joined provenance before publishing any source, metadata or
        // journal change, whether the carrier is a suffix or overlaps retained history.
        carriedHistory = admitHistory(incoming.text, target);
        for (const row of evidence) {
          const actor = participant(row, mintId), text = transformSplices(state.text, row.splices);
          appendCommit(text, row.splices, actor, row.operation, {...row, metadataDelta: row.metadata, reconciled: true, derivedCommentIndex: null});
        }
      } else if (incoming.journal != null || (safeInt(target) && target !== base + 1) ||
          transformSplices(state.text, [inferred]) !== incoming.text) {
        // The snapshot is authoritative, not a licence to invent an unencodable undo row.
        // A repair touching existing damage is adopted with explicitly unavailable history.
        for (const entry of state.journal) retireDrawingPresentation(entry, 'drawing_history_unavailable');
        state.text = incoming.text; state.revision = safeInt(target) ? target : base + 1;
        state.journal = []; state.history.earliestRevision = state.revision; state.history.complete = false;
        state.compare = null; outlineCache = null;
        // An authoritative replacement may reuse a revision; document cursors still belong to its former source.
        for (const [id, cursor] of Object.entries(state.cursors)) if (own(cursor, 'revision')) delete state.cursors[id];
        for (const row of Object.values(state.humanContexts)) { row.selection = null; row.focus = null; }
      } else {
        appendCommit(incoming.text, inferred.removed || inferred.inserted ? [inferred] : [], who,
          'document.human_edit', { revision: safeInt(target) ? target : base + 1, metadataDelta: metadataDelta(
            {filename: state.filename, docKind: state.docKind}, {filename, docKind: nextKind}) });
      }
    }
    if (incoming.historyComplete === false) state.history.complete = false;
    if (own(incoming, 'drawing')) state.drawing = normalizeDrawing(incoming.drawing) || null;
    if (own(incoming, 'ledgerRoot')) state.ledgerRoot = typeof incoming.ledgerRoot === 'string' ? incoming.ledgerRoot : null;
    state.filename = filename;
    state.docKind = nextKind;
    if (Array.isArray(incoming.journal) && incoming.revision === state.revision) {
      try {
        const {rows, proof} = carriedHistory || admitHistory(state.text, state.revision);
        if (proof.ok) {
          const records = rows.map(row => {const actor = participant(row, mintId);
            return {...clone(row), ...actor, owner: ownerOf(actor), createdAt: row.createdAt ?? null, label: row.label ?? null};});
          const retained = new Map(state.journal.map(row => [row.id, row]));
          state.journal = records.map(row => {const prior = retained.get(row.id);
            return prior && canonicalJson(prior.splices) === canonicalJson(row.splices) && canonicalJson(prior.metadata) === canonicalJson(row.metadata) ? {...prior, ...row} : row;});
          state.history.earliestRevision = proof.earliestRevision; state.history.complete = proof.complete;
        }
      } catch (_) { state.history.complete = false; }
    }
    for (const field of ['selection', 'focus']) {
      if (!own(incoming, field)) continue;
      const row = incoming[field];
      state[field] = row && safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end) && row.start <= row.end
        ? { start: row.start, end: row.end, active: row.active === true, ...(typeof row.objectId === 'string' ? {objectId: row.objectId} : {}) } : null;
    }
    // Notes' cards over the document: the host refuses edits behind them.
    state.notes = own(incoming, 'notes') && incoming.notes && typeof incoming.notes === 'object' ? { open: incoming.notes.open === true, current: typeof incoming.notes.current === 'string' ? incoming.notes.current : null } : null;
    if (typeof incoming.closedComparisonId === 'string' && state.compare?.id === incoming.closedComparisonId) {
      state.compare = null;
    }
    if (own(incoming, 'externalComparison')) {
      const external = incoming.externalComparison;
      if (!external) {
        if (state.compare?.hostCompareId) state.compare = null;
      } else if ((!state.compare || state.compare.hostCompareId) &&
          typeof external.id === 'string' && typeof external.baseline === 'string' && typeof external.incoming === 'string' &&
          state.compare?.hostCompareId !== external.id) {
        const imported = buildComparison(external.baseline, external.incoming, external.name,
          participant({ actor: 'human', principal: 'local', transport: 'platform' }, mintId));
        if (!imported.outcome) {
          imported.hostCompareId = external.id;
          imported.detached = external.baseline !== state.text && external.incoming !== state.text;
          state.compare = imported;
        } else state.compare = null;
      }
    }
    prune();
    return { ...current(), outcome: 'ok' };
  }

  const documentGuardFailure = context => typeof context.documentGuard === 'function' && context.documentGuard() !== true
    ? failure('document_authority_changed', 'refused') : null;

  async function refresh(context, operation) {
    cancelled(context);
    const guarded = documentGuardFailure(context); if (guarded) return guarded;
    if (typeof host.snapshot === 'function') {
      const value = await host.snapshot({operation}); cancelled(context);
      const guarded = documentGuardFailure(context); if (guarded) return guarded;
      if (!value || value.ok === false) return failure(value?.reason || 'document_not_settled');
      reconcile(value, { actor: 'human', principal: 'local' });
    }
    return null;
  }

  // Derived read targets belong to one exact source, including when a parser yields.
  const readSnapshot = () => ({documentId: state.documentId, revision: state.revision,
    filename: state.filename, docKind: state.docKind, text: state.text});
  const sameReadSnapshot = snapshot => snapshot?.documentId === state.documentId && snapshot.revision === state.revision &&
    snapshot.filename === state.filename && snapshot.docKind === state.docKind && snapshot.text === state.text;

  function documentLaw(start, end, will = null) {
    if (state.docKind !== 'markdown') return {};
    will ||= parseWill(state.text);
    if (!will.present) return {};
    return { law: willGovern(will, start, end), ...(willIntentOf(will, start, end) ? { intent: willIntentOf(will, start, end) } : {}) };
  }

  function reference(start, end, who, info = {}) {
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return null;
    return mint('refs', 'ref_', { start, end, revision: state.revision,
      digest: digest(state.text.slice(start, end)), ...info }, who);
  }

  function handleText(start, end) {
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return null;
    const text = state.text.slice(start, end);
    if (text.length > LIMITS.editChars || bytes(text) > LIMITS.authorityBytes ||
        imageSpans().some(row => row.start < end && start < row.end)) return null;
    return text;
  }

  function handle(start, end, who, info = {}, id) {
    const text = handleText(start, end);
    if (text === null) return null;
    return mint('handles', 'ctx_', { start, end, revision: state.revision, text, used: false, ...info }, who, id);
  }

  // A recipe handle spans the occurrence, never the definition bytes; relocate()'s integrity check applies unmodified.
  // It binds the definition too: new SVG behind the same label is a changed target.
  function assetDigest(label) {
    const row = documentAssets(state.text).assets.get(normalizeLabel(label));
    return row ? digest(row.url) : null;
  }
  // The recipe the document holds under a label, read from its definition (draw/core.mjs: the SVG's own metadata and image resources);
  // null for a definition that is not a Rapier drawing or cannot be read.
  function storedRecipe(assetLabel) {
    const row = documentAssets(state.text).assets.get(normalizeLabel(assetLabel));
    if (!row || !/^data:image\/svg\+xml;base64,/i.test(row.url)) return null;
    try { return _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(row.url))); }
    catch (_) { return null; }
  }
  function drawInspection(assetLabel) {
    const recipe = storedRecipe(assetLabel);
    return recipe ? JSON.stringify(recipe) : null;
  }
  // Handle admission measures disclosed editable scope. Retained pixels are not work:
  // a vector edit preserves them byte for byte. The actual paint/material operation
  // admits its own target, actions, pixel and result budgets before computation.
  function drawHandleRefusal(disclosed, fullChars, objectId = null) {
    const editable = objectId && disclosed != null
      ? JSON.stringify(JSON.parse(disclosed).shapes.find(shape => shape.id === objectId)) : disclosed;
    if (editable == null || editable.length > LIMITS.editChars || bytes(editable) > LIMITS.authorityBytes) return 'target_over_edit_budget';
    return null;
  }
  const unavailableEdit = reason => ({edit_unavailable: reason, ...(HINTS[reason] ? {hint: HINTS[reason]} : {})});
  function drawingEditAvailability(assetLabel, disclosed = null, objectId = null) {
    const recipe = storedRecipe(assetLabel);
    if (!recipe) return {};
    const reason = drawHandleRefusal(disclosed ?? JSON.stringify(disclosedRecipe(recipe)), JSON.stringify(recipe).length, objectId);
    return reason ? unavailableEdit(reason) : {};
  }
  // A recipe handle holds no recipe of the document's. Its digest binds the definition the caller was shown, so a re-read and an edit read
  // the recipe again from that definition, pixels and histories included: those bytes are the document's, and no handle's size follows them.
  // Its budget is the text the caller may edit: the disclosed recipe, or the named object alone for an object-scoped handle.
  // A read hands in its completed disclosure and full size; create and edit, which return no text, measure the definition they have just
  // written. The one recipe a handle keeps is the open canvas's, when the read came from the surface (a binding): the document does not
  // hold that recipe, and an edit is laid against what the caller saw of it (drawEdit). The page's kernel alone has a surface.
  function drawHandle(start, end, assetLabel, who, binding = {}, inspection = null, surfaceRecipeJSON = null, objectId = null, id) {
    if (!inspection) {
      const recipe = storedRecipe(assetLabel);
      if (!recipe) return null;
      inspection = {text: JSON.stringify(disclosedRecipe(recipe)), fullChars: JSON.stringify(recipe).length};
    }
    if (drawHandleRefusal(inspection.text, inspection.fullChars, objectId)) return null;
    const text = state.text.slice(start, end);
    return mint('handles', 'ctx_', { start, end, revision: state.revision, text, used: false, kind: 'draw', assetLabel, assetDigest: assetDigest(assetLabel),
      ...binding, ...(surfaceRecipeJSON != null ? {recipeJSON: surfaceRecipeJSON} : {}), ...(objectId ? {objectId} : {}) }, who, id);
  }

  function svgHandle(start, end, nodeIds, assetLabel, who, id) {
    const text = state.text.slice(start, end);
    return mint('handles', 'ctx_', {start, end, revision: state.revision, text, used: false,
      kind: 'svg', nodeIds: [...nodeIds], assetLabel, assetDigest: assetDigest(assetLabel)}, who, id);
  }

  function svgInspection(assetLabel) {
    const asset = documentAssets(state.text).assets.get(normalizeLabel(assetLabel));
    if (!asset || !/^data:image\/svg\+xml;base64,/i.test(asset.url)) return null;
    try { return JSON.stringify(inspectSVG(decodeDataImage(asset.url), {nodes: true})); }
    catch (_) { return null; }
  }

  // A picture occurrence discloses its native recipe or its bounded imported node tree. The handle covers that occurrence.
  const DRAW_OCCURRENCE = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\](?:[ \t]*<!--md-layout:v1[^>]*-->)?$/;
  // An image may share a paragraph or stand inside a list or quote. Only the parser's exact image span proves its placement;
  // a block start or a sibling with the same reference cannot authorize this occurrence, including inside literal code.
  function drawingPlacement(source, start, raw, assetLabel, standalone = false) {
    const end = start + raw.length, match = DRAW_OCCURRENCE.exec(raw);
    if (!match || normalizeLabel(match[2]) !== normalizeLabel(assetLabel) || source.slice(start, end) !== raw) return {placed: false, complete: true};
    const facts = structureMarkdown({source, kinds: ['image'], within: {start, end}, matchLimit: 1}, markdownParser());
    const matched = facts.matches?.some(row => row.start === start && row.end === end) === true;
    if (!matched || !standalone) return {placed: matched, complete: facts.complete === true};
    // A new drawing was inserted as its own block. Later prose may leave the image token
    // valid while joining it to a paragraph; that changes the drawing's placement.
    // Existing inline drawings remain editable through the exact occurrence check above.
    const blocks = outlineMarkdown(source, {limit: 0}, markdownParser()).blocks;
    return {placed: blocks?.entries?.some(row => row.start <= start && row.end >= end &&
      source.slice(row.start, row.end).trim() === raw) === true, complete: facts.complete === true && blocks?.complete === true};
  }
  function drawingAt(start, end) {
    const slice = state.text.slice(start, end), lead = slice.length - slice.trimStart().length;
    const match = DRAW_OCCURRENCE.exec(slice.trim());
    if (!match) return null;
    const row = documentAssets(state.text).assets.get(normalizeLabel(match[2]));
    if (!row || !/^data:image\/svg\+xml;base64,/i.test(row.url)) return null;
    let recipe;
    try { recipe = _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(row.url))); }
    catch (_) { return null; }
    const occurrence = '![' + match[1] + '][' + match[2] + ']';
    const targetStart = start + lead, targetEnd = targetStart + occurrence.length;
    if (recipe) {
      // A drawing the person has open is read as the canvas stands, settled, never as the saved bytes behind it.
      const live = drawingFor(targetStart, targetEnd, row.label);
      return {targetStart, targetEnd, draw: {recipeText: JSON.stringify(live?.recipe || recipe), assetLabel: row.label,
        ...(live ? {drawing: drawingSummary(live), binding: drawingBinding(live)} : {})}};
    }
    const inspectionText = svgInspection(row.label);
    return inspectionText ? {targetStart, targetEnd, svg: {inspectionText, assetLabel: row.label}} : null;
  }

  function readTarget(input, who) {
    if ([input.cursor, input.context_handle, input.ref, input.start != null || input.end != null].filter(Boolean).length > 1) {
      return failure('read_target_ambiguous', 'invalid');
    }
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind === 'compare-read') {
        if (cursor.revision !== state.revision || cursor.compareId !== state.compare?.id) return failure('compare_changed', 'conflict');
        const change = changeOf(cursor.changeId);
        return change ? {change, cursor} : failure('change_missing', 'target_gone');
      }
      if (!['read', 'draw-read', 'svg-read'].includes(cursor.kind)) return failure('cursor_kind_mismatch');
      if (cursor.revision !== state.revision) return failure('read_snapshot_changed', 'conflict');
      if (cursor.kind === 'draw-read') {
        if (typeof cursor.disclosedText !== 'string') return failure('read_snapshot_changed', 'conflict');
        const stale = drawBindingFailure(cursor, {start: cursor.targetStart, end: cursor.targetEnd});
        if (stale) return stale;
      }
      return { ...cursor, cursor, ...(cursor.kind === 'draw-read' ? {draw: {assetLabel: cursor.assetLabel, objectId: cursor.objectId || null,
        binding: {drawSession: cursor.drawSession, surfaceGeneration: cursor.surfaceGeneration, surfaceRecipeDigest: cursor.surfaceRecipeDigest},
        drawing: drawingSummary(drawingFor(cursor.targetStart, cursor.targetEnd, cursor.assetLabel))}} : {}),
        ...(cursor.kind === 'svg-read' ? {svg: {inspectionText: cursor.inspectionText, assetLabel: cursor.assetLabel}} : {}) };
    }
    if (input.context_handle) {
      const change = changeOf(input.context_handle);
      if (change) return { change };
      const held = lookup('handles', input.context_handle, who);
      if (held.outcome) return held;
      const range = relocate(held, who);
      if (range.outcome) return range;
      // A reread must not bind an old recipe to a person's newer asset definition.
      if (['draw', 'svg'].includes(held.kind) && held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
      if (held.kind === 'draw') { const stale = drawBindingFailure(held, range); if (stale) return stale; }
      const inspectionText = held.kind === 'svg' ? svgInspection(held.assetLabel) : null;
      if (held.kind === 'svg' && !inspectionText) return failure('target_changed', 'conflict');
      const recipeText = held.kind === 'draw' ? drawInspection(held.assetLabel) : null;
      if (held.kind === 'draw' && !recipeText) return failure('target_changed', 'conflict');
      const drawn = held.kind === 'draw' ? drawingAt(range.start, range.end) || {draw: {recipeText, assetLabel: held.assetLabel}} : null;
      return { ...range, targetStart: range.start, targetEnd: range.end, offset: range.start, coverage: [],
        ...(drawn ? {...drawn, draw: {...drawn.draw, objectId: held.objectId || null}} : {}),
        ...(inspectionText ? {svg: {inspectionText, assetLabel: held.assetLabel}} : {}) };
    }
    if (input.ref) {
      const change = changeOf(input.ref);
      if (change) return { change };
      const ref = lookup('refs', input.ref, who);
      if (ref.outcome) return ref;
      const range = relocate(ref);
      if (range.outcome) return range;
      return { ...range, ref: ref.id, targetStart: range.start, targetEnd: range.end, offset: range.start, coverage: [] };
    }
    const start = input.start == null ? 0 : input.start, end = input.end == null ? state.text.length : input.end;
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return failure('range_invalid', 'invalid', {length: state.text.length});
    return { start, end, targetStart: start, targetEnd: end, offset: start, coverage: [] };
  }

  async function markdownFacts(context) {
    if (state.docKind !== 'markdown' || !['md-layout:', '![', 'data:image/'].some(marker => state.text.includes(marker))) return null;
    return outline(context);
  }

  function layoutInRange(analysis, start, end) {
    if (!analysis) return null;
    const rows = analysis.entries.filter(row => start === end ? row.blockStart <= start && start <= row.blockEnd
      : row.blockStart < end && start < row.blockEnd);
    if (!rows.length && analysis.complete) return null;
    const items = rows.slice(0, 16).map(row => ({ start: row.start, end: row.end, kind: row.kind,
      ...(row.align ? { align: row.align } : {}), ...(row.width != null ? { width: row.width } : {}),
      ...(row.wrap ? { wrap: row.wrap } : {}), ...(row.x != null ? { x: row.x } : {}), ...(row.y != null ? { y: row.y } : {}) }));
    return { standard: 'md-layout:v1', items, total: rows.length, omitted: rows.length - items.length,
      complete: analysis.complete && rows.length === items.length,
      ...(!analysis.complete ? { reason: analysis.reason || 'markdown_layout_index_limited' } : {}) };
  }

  function imagesInRange(analysis, start, end) {
    if (!analysis) return null;
    const rows = analysis.entries.filter(row => start === end ? row.blockStart <= start && start <= row.blockEnd
      : row.blockStart < end && start < row.blockEnd);
    if (!rows.length && analysis.complete) return null;
    const items = rows.slice(0, 8).map((row, index) => {
      const { id, ...rest } = row;
      return { picture: (index + 1) + ' of ' + rows.length, ...rest };
    });
    while (items.length && bytes(JSON.stringify(items)) > 3072) items.pop();
    return { scope: 'markdown', items, total: rows.length, omitted: rows.length - items.length,
      complete: analysis.complete && rows.length === items.length,
      ...(!analysis.complete ? { reason: analysis.reason || 'markdown_image_index_limited' } : {}) };
  }

  // Recipe paging retains only the disclosed string ('draw-read' cursor), never private rasters or replay history.
  // It does not use disclose(): a font's data: URI would false-match redaction.
  // Only the completing page mints a handle. Paint rasters disclose their data-URL length, not payload.
  async function readDrawContext(target, input, who, context) {
    const picture = target.svg || target.draw, imported = !!target.svg, drawing = target.draw?.drawing;
    const recipeText = picture.inspectionText || picture.recipeText, continuation = !imported && target.cursor;
    const stored = continuation ? null : JSON.parse(recipeText);
    const text = continuation ? target.cursor.disclosedText : JSON.stringify(imported ? stored : disclosedRecipe(stored));
    const fullChars = continuation ? target.cursor.fullChars : recipeText.length;
    const storedRecipeDigest = continuation ? target.cursor.storedRecipeDigest : drawing?.recipeUnavailable ? drawingRecipeDigest(stored) : null;
    if (imported && input.objectId) return failure('drawing_object_scope', 'invalid');
    const objectId = imported ? null : picture.objectId || input.objectId || null;
    const storedSurface = !imported && objectId && drawing?.recipeUnavailable &&
      drawing.recipeDigest === storedRecipeDigest;
    if (input.objectId && picture.objectId && input.objectId !== picture.objectId) return failure('drawing_object_scope', 'invalid');
    if (objectId && (!continuation || !picture.objectId) && !(stored || JSON.parse(text)).shapes.some(row => row.id === objectId)) {
      return failure('drawing_object_missing', 'target_gone');
    }
    let paintSample = null;
    if (input.paintSample) {
      if (imported || objectId && input.paintSample.objectId !== objectId) return failure('drawing_object_scope', 'invalid');
      if (drawing?.recipeUnavailable) return failure(drawing.recipeUnavailable);
      // Sampling needs material only for this invocation, never as retained cursor state.
      const live = drawingFor(target.targetStart, target.targetEnd, picture.assetLabel);
      const stale = drawBindingFailure({...target.draw.binding, assetLabel: picture.assetLabel},
        {start: target.targetStart, end: target.targetEnd}, live);
      if (stale) return stale;
      const sampled = stored || (target.draw.binding?.drawSession ? live?.recipe : storedRecipe(picture.assetLabel));
      const shape = sampled?.shapes.find(row => row.id === input.paintSample.objectId && row.recognized === 'paint');
      if (!shape) return failure('paint_target_invalid', 'invalid');
      if (typeof host.paintSample !== 'function' && typeof host.material !== 'function') return failure('paint_sample_unavailable');
      const documentId = state.documentId, revision = state.revision, digest = assetDigest(picture.assetLabel);
      cancelled(context);
      try {
        if (typeof host.material === 'function') {
          const prepared = await prepareMaterial('sample', {position: 'sample:' + shape.id, shape, point: input.paintSample.point}, context);
          if (prepared.refusal) return prepared.refusal;
          paintSample = prepared.value;
        } else paintSample = await host.paintSample(shape, input.paintSample.point, {signal: context.signal});
      }
      catch (error) { cancelled(context); return failure(error?.code || 'paint_sample_invalid', 'invalid'); }
      cancelled(context);
      const refreshed = await refresh(context);
      if (refreshed) return refreshed;
      if (state.documentId !== documentId || state.revision !== revision || assetDigest(picture.assetLabel) !== digest) return failure('read_snapshot_changed', 'conflict');
      const changed = drawBindingFailure({...target.draw.binding, assetLabel: picture.assetLabel}, {start: target.targetStart, end: target.targetEnd});
      if (changed) return changed;
      if (!target.draw.binding?.drawSession && drawingFor(target.targetStart, target.targetEnd, picture.assetLabel)) return failure('draw_surface_changed', 'conflict');
      if (!paintSample || typeof paintSample !== 'object' || Array.isArray(paintSample)) return failure('paint_sample_invalid', 'invalid');
      paintSample = {...paintSample, objectId: shape.id, point: input.paintSample.point.slice()};
    }
    const law = documentLaw(target.targetStart, target.targetEnd);
    const limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars);
    const offset = target.cursor ? target.offset : 0;
    if (!safeBoundary(text, offset)) return failure('range_invalid', 'invalid');
    let end = Math.min(text.length, offset + limit);
    while (!safeBoundary(text, end)) end--;
    const ids = {handle: mintId('ctx_'), cursor: mintId('read_')};
    const unavailable = (!storedSurface && drawing?.recipeUnavailable) || (imported ? null : drawHandleRefusal(text, fullChars, objectId));
    const page = fitReadPage(text, offset, end, until => {
      const complete = until === text.length;
      return { ...current(), outcome: 'ok', start: target.targetStart, end: target.targetEnd, text: text.slice(offset, until),
        ...law, ...(objectId ? {objectId} : {}), complete, remaining: text.length - until,
        kind: imported ? 'svg' : 'drawing', handle: complete && !unavailable ? ids.handle : null,
        [imported ? 'svg_handle' : 'recipe_handle']: complete && !unavailable ? ids.handle : null,
        ...(drawing ? {drawing} : {}), ...(paintSample ? {paintSample} : {}),
        coverage: {disclosed: until, chars: text.length, complete},
        ...(unavailable ? unavailableEdit(unavailable) : {}),
        next_cursor: complete ? null : ids.cursor, expires_in_ms: LIMITS.lifetimeMs};
    });
    if (!page) return failure('result_over_budget', 'refused', {complete: false});
    end = page.end;
    const complete = end === text.length;
    // A completing live handle needs the exact inspected merge base. Revalidate after the parser or material reader yielded.
    let surfaceRecipeJSON = null;
    if (complete && target.draw?.binding?.drawSession) {
      const live = drawingFor(target.targetStart, target.targetEnd, picture.assetLabel);
      const stale = drawBindingFailure({...target.draw.binding, assetLabel: picture.assetLabel},
        {start: target.targetStart, end: target.targetEnd}, live);
      if (stale) return stale;
      if (!storedSurface) surfaceRecipeJSON = continuation ? JSON.stringify(live.recipe) : recipeText;
    }
    const disclosedHandle = complete && !unavailable ? imported
      ? svgHandle(target.targetStart, target.targetEnd, stored.nodes.map(node => node.id), picture.assetLabel, who, ids.handle)
      : drawHandle(target.targetStart, target.targetEnd, picture.assetLabel, who, target.draw.binding, {text, fullChars},
          surfaceRecipeJSON, objectId, ids.handle) : null;
    const next = !complete ? mint('cursors', 'read_', {kind: imported ? 'svg-read' : 'draw-read', revision: state.revision,
      targetStart: target.targetStart, targetEnd: target.targetEnd,
      ...(imported ? {inspectionText: recipeText} : {disclosedText: text, fullChars, objectId, ...target.draw.binding,
        ...(storedRecipeDigest ? {storedRecipeDigest} : {})}),
      assetLabel: picture.assetLabel, offset: end}, who, ids.cursor) : null;
    const result = {...page.result, handle: disclosedHandle?.id || null,
      [imported ? 'svg_handle' : 'recipe_handle']: disclosedHandle?.id || null,
      ...(complete && !disclosedHandle && !unavailable ? unavailableEdit(
        (imported ? null : drawHandleRefusal(text, fullChars, objectId)) || 'target_over_edit_budget') : {}),
      next_cursor: next?.id || null};
    if (bytes(JSON.stringify(result)) > LIMITS.resultBytes) {
      if (disclosedHandle) delete state.handles[disclosedHandle.id];
      if (next) delete state.cursors[next.id];
      return failure('result_over_budget', 'refused', {complete: false});
    }
    if (target.cursor) delete state.cursors[target.cursor.id];
    return result;
  }

  // Measure the complete serialized envelope before minting authority or consuming a cursor.
  // Character limits are upper bounds; UTF-8 and JSON escapes decide the actual page boundary.
  function fitReadPage(source, start, end, project) {
    const first = project(end);
    if (bytes(JSON.stringify(first)) <= LIMITS.resultBytes) return {end, result: first};
    let low = start, high = end - 1, fitted = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      let until = middle;
      while (until > start && !safeBoundary(source, until)) until--;
      const result = project(until);
      if (bytes(JSON.stringify(result)) <= LIMITS.resultBytes) {
        fitted = {end: until, result}; low = middle + 1;
      } else high = until - 1;
    }
    // An empty successful page would return a cursor that can never advance.
    return fitted && (fitted.end > start || start === end) ? fitted : null;
  }

  async function readContext(input, who, context) {
    const snapshot = readSnapshot();
    let target = readTarget(input, who);
    if (target.outcome) return target;
    if (target.change) return input.kind && input.kind !== 'comparison' ? failure('read_kind_mismatch', 'invalid')
      : input.paintSample ? failure('drawing_object_scope', 'invalid') : readChange({...input, change_id: target.change.id}, who, target.cursor);
    if (input.kind === 'comparison') return failure('change_missing', 'target_gone');
    const facts = await markdownFacts(context);
    if (!sameReadSnapshot(snapshot)) return failure('read_snapshot_changed', 'conflict');
    if (facts?.outcome) return facts;
    const layout = facts?.layout, images = facts?.images;
    if (!target.draw && !target.svg && !target.cursor && ['drawing', 'svg'].includes(input.kind)) {
      const drawing = drawingAt(target.targetStart, target.targetEnd);
      if (drawing) target = { ...target, ...drawing, offset: 0, coverage: [] };
    }
    const kind = target.svg ? 'svg' : target.draw ? 'drawing' : 'source';
    if (input.kind && input.kind !== kind) return failure('read_kind_mismatch', 'invalid', {kind});
    if (target.draw || target.svg) return readDrawContext(target, input, who, context);
    if (input.objectId || input.paintSample) return failure('drawing_object_scope', 'invalid');
    const limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars), start = target.offset;
    let end = Math.min(target.targetEnd, start + limit);
    while (!safeBoundary(state.text, end)) end--;
    const hiddenAtEnd = imageSpans().find(row => row.start < end && end < row.end);
    if (hiddenAtEnd) end = Math.min(target.targetEnd, hiddenAtEnd.end);
    const ids = {handle: mintId('ctx_'), complete: mintId('ctx_'), comment: mintId('ctx_'), cursor: mintId('read_')};
    const sha = sha256(state.text), drawing = drawingSummary(), will = state.docKind === 'markdown' ? parseWill(state.text) : null;
    const coverageAt = (until, omitted) => {
      const coverage = [...(target.coverage || []), ...(omitted ? [] : [[start, until]])];
      let reached = target.targetStart;
      for (const row of coverage.slice().sort((a, b) => a[0] - b[0])) {
        if (row[0] > reached) break;
        reached = Math.max(reached, row[1]);
      }
      return {coverage, reached, whole: reached >= target.targetEnd};
    };
    const page = fitReadPage(state.text, start, end, until => {
      const projection = disclose(state.text, start, until), omitted = projection.omissions.length;
      const {reached, whole} = coverageAt(until, omitted);
      const canEdit = !omitted && handleText(start, until) !== null;
      const pageLayout = layoutInRange(layout, start, until), pageImages = imagesInRange(images, start, until);
      const comment = until === target.targetEnd && !whole && state.docKind === 'markdown' &&
        imageCommentTarget(state.text, target.targetStart, target.targetEnd);
      return {...current(), outcome: 'ok', kind: 'source', start, end: until, text: projection.text, ...documentLaw(start, until, will),
        ...(drawing ? {drawing} : {}), complete: until === target.targetEnd && !omitted, remaining: target.targetEnd - until,
        ...(omitted ? {omissions: projection.omissions.slice(0, 4), omissionCount: omitted} : {}),
        ...(pageLayout ? {layout: pageLayout} : {}), ...(pageImages ? {images: pageImages} : {}),
        sha256: sha, handle: canEdit ? ids.handle : null, ...(target.ref ? {ref: target.ref} : {}),
        coverage: {disclosed: Math.max(0, reached - target.targetStart), chars: target.targetEnd - target.targetStart, complete: whole},
        ...(whole && (start !== target.targetStart || until !== target.targetEnd) ? {complete_handle: ids.complete} : {}),
        ...(comment ? {comment_handle: ids.comment} : {}),
        ...(!canEdit ? {edit_unavailable: omitted ? 'source_redacted' : 'target_over_edit_budget'} : {}),
        next_cursor: until < target.targetEnd ? ids.cursor : null, expires_in_ms: LIMITS.lifetimeMs};
    });
    if (!page) return failure('result_over_budget', 'refused', {complete: false});
    end = page.end;
    const omitted = page.result.omissionCount || 0, {coverage, whole} = coverageAt(end, omitted);
    const disclosed = !omitted ? handle(start, end, who, {sha256: sha}, ids.handle) : null;
    const completeHandle = whole && (start !== target.targetStart || end !== target.targetEnd)
      ? handle(target.targetStart, target.targetEnd, who, {disclosure: 'paged', sha256: sha}, ids.complete) : null;
    const next = end < target.targetEnd ? mint('cursors', 'read_', {kind: 'read', revision: state.revision,
      targetStart: target.targetStart, targetEnd: target.targetEnd, offset: end, coverage, ref: target.ref || null}, who, ids.cursor) : null;
    // Redacted image bytes cannot grant source editing. This typed handle permits only a comment.
    const commentHandle = page.result.comment_handle ? mint('handles', 'ctx_', {kind: 'image-comment', revision: state.revision,
      start: target.targetStart, end: target.targetEnd, digest: digest(state.text.slice(target.targetStart, target.targetEnd)), used: false}, who, ids.comment) : null;
    if (target.cursor) delete state.cursors[target.cursor.id];
    const result = {...page.result, handle: disclosed && state.handles[disclosed.id] ? disclosed.id : null, next_cursor: next?.id || null};
    if (completeHandle && state.handles[completeHandle.id]) result.complete_handle = completeHandle.id;
    else delete result.complete_handle;
    if (commentHandle) result.comment_handle = commentHandle.id; else delete result.comment_handle;
    return result;
  }

  // The notes store is injected; never import notes/model.mjs (the document profile has no Notes).
  // An absent store is ordinary empty data. A configured but unreadable folder remains a refusal.
  const noNotes = note_ref => accepted({ availability: 'unavailable', reason: 'notes_not_configured',
    message: 'Notes is not set up on this host.', complete: true, remaining: 0, next_cursor: null,
    ...(note_ref === undefined ? {notes: []} : {note_ref, found: false, text: null}) });
  const unavailableNotes = (got, note_ref) => ['locked', 'unavailable'].includes(got?.availability)
    ? accepted({availability: got.availability, ...(note_ref ? {note_ref} : {}),
      ...(typeof got.reason === 'string' ? {reason: clip(got.reason, 128)} : {}),
      ...(typeof got.hint === 'string' ? {hint: clip(got.hint, 512), message: clip(got.hint, 512)} : {})}) : null;
  const notesRefused = got => got?.refused ? failure(got.refused, got.refused === 'notes_changed' ? 'conflict' : 'refused') : null;
  async function notesList(input, who, context) {
    if (typeof host.notesFind !== 'function') return noNotes();
    let held = null, query = input.query || '';
    if (input.cursor) {
      held = lookup('cursors', input.cursor, who);
      if (held.outcome) return held;
      if (held.kind !== 'notes-list') return failure('notes_cursor_wrong_kind', 'invalid');
      if (input.query !== undefined && input.query !== held.query) return failure('notes_cursor_wrong_query', 'invalid');
      query = held.query;
    }
    cancelled(context);
    const rows = await host.notesFind({query, ...who, signal: context.signal });
    cancelled(context);
    // undefined: no door. null or non-array: the folder could not answer.
    if (rows === undefined) return noNotes();
    const unavailable = unavailableNotes(rows) || notesRefused(rows); if (unavailable) return unavailable;
    if (!Array.isArray(rows)) return failure('notes_folder_unreadable');
    const sorted = rows.map(row => ({
      file: clip(String(row?.file || ''), 256), note_ref: clip(String(row?.note_ref || ''), 256),
      title: clip(String(row?.title || String(row?.file || '').replace(/\.md$/i, '')), 192),
      section: clip(String(row?.section || (row?.skill ? 'skills' : 'others')), 64),
      skill: row?.skill === true || row?.section === 'skills',
      modified: Number.isFinite(row?.modified) ? row.modified : undefined,
    })).filter(row => row.file && row.note_ref);
    sorted.sort((a, b) => {
      const as = a.skill ? 0 : 1, bs = b.skill ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.file.localeCompare(b.file);
    });
    const version = digest(JSON.stringify(sorted));
    let offset = 0;
    if (held) {
      if (held.version !== version) return failure('notes_changed', 'conflict');
      offset = held.offset || 0;
    }
    const limit = bounded(input.limit, 32, 1, 64);
    const page = [];
    for (let i = offset; i < sorted.length; i++) {
      const item = {file: sorted[i].file, note_ref: sorted[i].note_ref, title: sorted[i].title, section: sorted[i].section,
        ...(sorted[i].modified != null ? { modified: sorted[i].modified } : {}) };
      if (bytes(JSON.stringify({ notes: [...page, item] })) > LIMITS.resultBytes - 1800) break;
      page.push(item);
      if (page.length >= limit) break;
    }
    const end = offset + page.length;
    const next = end < sorted.length ? mint('cursors', 'notes_list_', { kind: 'notes-list', offset: end, version, query }, who) : null;
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({ availability: 'available', notes: page, ...(typeof host.notesForeground === 'function' ? {foreground: host.notesForeground()} : {}), complete: end >= sorted.length, remaining: Math.max(0, sorted.length - end), next_cursor: next?.id || null,
      ...(!sorted.length ? {message: 'Notes has nothing yet.'} : {}) });
  }

  // What each caller has read of each note, whole: the SHA-256 of its words when the read reached the end having started at the beginning.
  // notes.write writes a change at once only over words the caller read; the host compares this with the note as it stands.
  const noteReads = new Map();
  const rememberNote = (who, file, text) => {
    const key = ownerOf(who) + '\u0000' + file;
    noteReads.delete(key); noteReads.set(key, sha256(text));
    while (noteReads.size > 64) noteReads.delete(noteReads.keys().next().value);
  };
  // The Notes owner writes only the exact inspected base, or returns its currentness refusal.
  // Notes returns public receipts across an owner boundary. Never spread private attribution fields.
  function noteAct(value) {
    if (value === null) return null;
    const bounded = (text, limit, empty = false) => typeof text === 'string' && (empty || text.length > 0) &&
      text.length <= limit && text.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(text);
    if (!value || !bounded(value.id, 256) || !bounded(value.document_id, 256) ||
        !safeInt(value.base_revision) || !safeInt(value.revision) || value.revision !== value.base_revision + 1 ||
        !['human', 'agent', 'system'].includes(value.author?.kind) ||
        value.author.name !== undefined && !bounded(value.author.name, 120) || !bounded(value.operation, 96) ||
        value.at !== null && !(typeof value.at === 'string' && Number.isFinite(Date.parse(value.at)) &&
          new Date(value.at).toISOString() === value.at) ||
        value.turn_id !== undefined && !bounded(value.turn_id, 160) ||
        value.label !== undefined && !bounded(value.label, 120, true) ||
        value.reverses !== undefined && (!Array.isArray(value.reverses) || !value.reverses.length ||
          value.reverses.some(id => !bounded(id, 256)))) throw new TypeError('notes_act_invalid');
    return {id: value.id, document_id: value.document_id, base_revision: value.base_revision, revision: value.revision,
      author: {kind: value.author.kind, ...(value.author.name !== undefined ? {name: value.author.name} : {})},
      at: value.at, operation: value.operation, ...(value.turn_id !== undefined ? {turn_id: value.turn_id} : {}),
      ...(value.label !== undefined ? {label: value.label} : {}),
      ...(value.reverses !== undefined ? {reverses: value.reverses.slice()} : {})};
  }

  async function notesWrite(input, who, context) {
    const text = typeof input.text === 'string' ? input.text : '';
    const invalid = text.trim() ? admissibleText(text) : 'notes_text_required';
    if (invalid) return failure(invalid, 'invalid');
    if (typeof host.notesWrite !== 'function') return noNotes(input.target?.note_ref);
    cancelled(context);
    const ref = input.target?.kind === 'note' ? input.target.note_ref : '';
    let got;
    try { got = await host.notesWrite({text, title: input.title || '', target: input.target, turn_id: input.turn_id, label: input.label,
      base: ref ? noteReads.get(ownerOf(who) + '\u0000' + ref) : undefined,
      by: agentLabel(who.agent) || 'An agent', ...who, signal: context.signal, guard: context.notesGuard,
      writeOpenNote: async (value, options = {}) => {
        const fresh = await refresh(context);
        if (fresh) return fresh;
        // The Notes owner must still hold this note after the canonical snapshot yields.
        options.guard?.();
        if (!value.binding || value.binding.documentId !== state.documentId || sha256(state.text) !== value.base)
          return failure('notes_changed', 'conflict');
        const splice = minimalSplice(state.text, value.text);
        return publicWriteReceipt(await commit(splice.removed || splice.inserted ? [splice] : [], who, context, 'notes.write',
          {turnId: input.turn_id, label: input.label ?? 'Edit note'}));
      }}); }
    catch { return failure('notes_write_unconfirmed', 'uncertain'); }
    if (got === undefined) return noNotes(ref || undefined);
    if (got?.outcome === 'uncertain') return failure(got.reason || 'notes_write_unconfirmed', 'uncertain');
    const blocked = unavailableNotes(got, ref) || notesRefused(got); if (blocked) return blocked;
    if (typeof got?.file !== 'string' || typeof got?.note_ref !== 'string' ||
        !['applied', 'original_changed', 'created'].every(key => typeof got[key] === 'boolean'))
      return failure('notes_write_unconfirmed', 'uncertain');
    let act;
    try { if (Object.hasOwn(got, 'act')) act = noteAct(got.act); }
    catch { return failure('notes_write_unconfirmed', 'uncertain'); }
    if (got.applied && typeof got.saved === 'string') rememberNote(who, got.note_ref, got.saved);
    return accepted({availability: 'available', file: got.file, note_ref: got.note_ref, applied: got.applied,
      original_changed: got.original_changed, created: got.created, ...(Object.hasOwn(got, 'act') ? {act} : {}),
      destination: 'notes_store', ...(typeof got.reason === 'string' ? {reason: got.reason} : {})});
  }
  async function notesOpen(input, who, context) {
    if (typeof host.notesOpen !== 'function') return noNotes(input.note_ref);
    cancelled(context);
    let got;
    try {got = await host.notesOpen({...input, ...who, signal: context.signal, guard: context.notesGuard});}
    catch {return failure('notes_open_unconfirmed', 'uncertain');}
    if (got === undefined) return noNotes(input.note_ref);
    if (got?.outcome === 'uncertain') return failure(got.reason || 'notes_open_unconfirmed', 'uncertain');
    const blocked = unavailableNotes(got, input.note_ref) || notesRefused(got); if (blocked) return blocked;
    if (got?.opened !== true || got.note_ref !== input.note_ref) return failure(got?.reason || 'notes_open_unconfirmed', got?.opened ? 'uncertain' : 'refused');
    let refreshed = context.signal?.aborted ? failure('cancelled_after_open') : null;
    if (!refreshed) {try {refreshed = await refresh(context);} catch {refreshed = failure('notes_open_currentness_unconfirmed');}}
    // Navigation already happened; a later guard failure cannot erase its truthful receipt.
    return accepted({opened: true, presented: got.presented === true && !context.signal?.aborted, note_ref: got.note_ref, file: got.file,
      document_binding: got.document_binding, document_access: got.document_access || 'unavailable',
      ...(refreshed ? {currentness: 'changed', reason: refreshed.reason} : {})});
  }
  async function notesRead(input, who, context) {
    const note_ref = typeof input.note_ref === 'string' ? input.note_ref : '';
    if (!note_ref) return failure('notes_reference_required', 'invalid');
    if (typeof host.notesRead !== 'function') return noNotes(note_ref);
    let cursor = null, selectedVersion = input.version ?? null;
    if (input.cursor) {
      cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'notes-read' || cursor.note_ref !== note_ref) return failure('notes_cursor_wrong_kind', 'invalid');
      if (input.version !== undefined && input.version !== cursor.selectedVersion) return failure('notes_cursor_wrong_version', 'invalid');
      selectedVersion = cursor.selectedVersion;
    }
    cancelled(context);
    const got = await host.notesRead({ note_ref, ...(selectedVersion === null ? {} : {version: selectedVersion}), ...who, signal: context.signal });
    cancelled(context);
    if (got === undefined) return noNotes(note_ref);
    const unavailable = unavailableNotes(got, note_ref) || notesRefused(got); if (unavailable) return unavailable;
    if (!got && cursor) return failure('notes_changed', 'conflict');
    if (!got) return accepted({availability: 'available', note_ref, found: false, text: null, complete: true,
      remaining: 0, next_cursor: null, reason: 'notes_not_found', message: 'This note is not in Notes. List notes to choose an available note_ref.'});
    if (got.note_ref !== note_ref || typeof got.text !== 'string') return failure('notes_folder_unreadable');
    const text = got.text, version = digest(text);
    let offset = 0;
    if (cursor) {
      if (cursor.version !== version) return failure('notes_changed', 'conflict');
      offset = cursor.offset || 0;
    } else if (Number.isInteger(input.start) && input.start > 0) {
      offset = Math.min(input.start, text.length);
    }
    if (!safeBoundary(text, offset)) return failure('range_invalid', 'invalid');
    const pageChars = 12288;
    let end = Math.min(text.length, offset + bounded(input.limit, pageChars, 256, pageChars));
    if (!safeBoundary(text, end)) end--;
    let page = text.slice(offset, end);
    while (bytes(JSON.stringify({ ...current(), outcome: 'ok', note_ref, text: page, start: offset, end })) > LIMITS.resultBytes - 800 && page.length) {
      end = offset + clip(text.slice(offset, end), Math.floor((end - offset) * 0.8)).length;
      page = text.slice(offset, end);
    }
    const complete = end >= text.length;
    const whole = offset === 0 || cursor?.whole === true;
    if (complete && whole && selectedVersion === null) rememberNote(who, note_ref, text);
    const next = !complete ? mint('cursors', 'notes_read_', { kind: 'notes-read', note_ref, offset: end, version, selectedVersion, whole }, who) : null;
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({ availability: 'available', found: true, note_ref, file: got.file, ...(typeof host.notesForeground === 'function' ? {foreground: host.notesForeground()} : {}), ...(selectedVersion === null ? {} : {version: selectedVersion}), text: page, start: offset, end, complete, remaining: Math.max(0, text.length - end), next_cursor: next?.id || null });
  }

  async function notesSet(input, who, context) {
    if (typeof host.notesSet !== 'function') return noNotes(input.note_ref);
    cancelled(context);
    let got;
    try { got = await host.notesSet({...input, ...who, signal: context.signal, guard: context.notesGuard}); }
    catch { return failure('notes_set_unconfirmed', 'uncertain'); }
    if (got === undefined) return noNotes(input.note_ref);
    if (got?.outcome === 'uncertain') return failure(got.reason || 'notes_set_unconfirmed', 'uncertain');
    const unavailable = unavailableNotes(got, input.note_ref) || notesRefused(got); if (unavailable) return unavailable;
    if (got?.note_ref !== input.note_ref || !got.changed || !got.previous) return failure('notes_folder_unwritable');
    let act;
    try { if (Object.hasOwn(got, 'act')) act = noteAct(got.act); }
    catch { return failure('notes_set_unconfirmed', 'uncertain'); }
    return accepted({availability: 'available', note_ref: got.note_ref, file: got.file, changed: got.changed, previous: got.previous,
      ...(Object.hasOwn(got, 'act') ? {act} : {}), ...(got.reminder ? {reminder: got.reminder} : {})});
  }
  async function notesHistory(input, who, context) {
    if (typeof host.notesHistory !== 'function') return noNotes(input.note_ref);
    let cursor = null;
    if (input.cursor) {
      cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'notes-history' || cursor.note_ref !== input.note_ref) return failure('notes_cursor_wrong_kind', 'invalid');
    }
    cancelled(context);
    const got = await host.notesHistory({note_ref: input.note_ref, ...who, signal: context.signal});
    cancelled(context);
    if (got === undefined) return noNotes(input.note_ref);
    if (got?.outcome === 'uncertain') return failure(got.reason || 'notes_set_unconfirmed', 'uncertain');
    const unavailable = unavailableNotes(got, input.note_ref) || notesRefused(got); if (unavailable) return unavailable;
    if (!got || !Array.isArray(got.versions)) return failure('notes_history_unavailable');
    const versions = got.versions;
    if (versions.some(row => !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.time) || row.time < 0 ||
      !Number.isSafeInteger(row.size) || row.size < 0 || typeof row.reason !== 'string')) return failure('notes_history_unavailable');
    const version = digest(JSON.stringify(versions));
    if (cursor && cursor.version !== version) return failure('notes_changed', 'conflict');
    const offset = cursor?.offset || 0, limit = bounded(input.limit, 32, 1, 64), page = [];
    for (let i = offset; i < versions.length && page.length < limit; i++) {
      const row = versions[i], item = {version: row.version, time: row.time, reason: clip(row.reason, 64), size: row.size, current: row.current === true};
      if (bytes(JSON.stringify([...page, item])) > LIMITS.resultBytes - 1800) break;
      page.push(item);
    }
    const end = offset + page.length, next = end < versions.length ? mint('cursors', 'notes_history_', {kind: 'notes-history', note_ref: input.note_ref, offset: end, version}, who) : null;
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({availability: 'available', note_ref: input.note_ref, file: got.file, found: got.found === true, versions: page, complete: end >= versions.length,
      remaining: Math.max(0, versions.length - end), next_cursor: next?.id || null,
      ...(Number.isSafeInteger(got.tidied) ? {tidied: got.tidied, tidiedAt: got.tidiedAt ?? null} : {})});
  }
  async function notesSync(input, who, context) {
    if (typeof host.notesSync !== 'function') return noNotes();
    cancelled(context);
    let got;
    try { got = await host.notesSync({action: input.action, ...who, signal: context.signal, guard: context.notesGuard}); }
    catch { return failure('notes_sync_unconfirmed', 'uncertain'); }
    if (got === undefined) return noNotes();
    if (got?.outcome === 'uncertain') return failure(got.reason || 'notes_sync_unconfirmed', 'uncertain');
    const unavailable = unavailableNotes(got) || notesRefused(got); if (unavailable) return unavailable;
    if (typeof got?.synced !== 'boolean') return failure('notes_sync_failed');
    return accepted({availability: 'available', action: 'now', synced: got.synced,
      ...(typeof got.reason === 'string' ? {reason: clip(got.reason, 128)} : {}),
      ...(typeof got.complete === 'boolean' ? {complete: got.complete} : {}), ...(typeof got.unchanged === 'boolean' ? {unchanged: got.unchanged} : {}),
      ...(Number.isSafeInteger(got.skipped) ? {skipped: got.skipped} : {}), ...(Number.isSafeInteger(got.missing) ? {missing: got.missing} : {}),
      ...(Number.isSafeInteger(got.backedUpAt) ? {backedUpAt: got.backedUpAt} : {})});
  }

  async function outline(context) {
    if (sameReadSnapshot(outlineCache)) return outlineCache.value;
    const snapshot = readSnapshot(), {text, revision, filename} = snapshot;
    let value;
    if (state.docKind === 'markdown') {
      const rows = typeof host.markdown === 'function' ? await host.markdown({ text, limit: 2048, signal: context.signal }) : outlineMarkdown(text, { limit: 2048 }, markdownParser());
      value = Array.isArray(rows) ? { entries: rows, engine: 'markdown', complete: true } : { engine: 'markdown', ...rows };
    } else {
      // decide reads structure from world at this revision; never re-parses, never awaits a host.
      const resolved = worldOrPending(context, 'outline', { mode: 'outline', filename, revision });
      if (resolved.terminal) return resolved.terminal;
      value = resolved.value;
    }
    cancelled(context);
    if (!sameReadSnapshot(snapshot)) return failure('document_changed', 'conflict');
    const blockRows = Array.isArray(value?.blocks?.entries) ? value.blocks.entries : [];
    const blocks = blockRows.filter(row => safeBoundary(text, row.start) && safeBoundary(text, row.end) && row.end > row.start);
    const layoutRows = (value?.layout?.entries || []).slice(0, 2048);
    const layouts = layoutRows.flatMap(row => {
      if (![row.start, row.end, row.blockStart, row.blockEnd].every(offset => safeBoundary(text, offset)) ||
          row.start < row.blockStart || row.end > row.blockEnd || row.end <= row.start ||
          !['heading', 'paragraph', 'image'].includes(row.kind)) return [];
      const layout = parseLayout(text.slice(row.start, row.end));
      return layout ? [{ start: row.start, end: row.end, blockStart: row.blockStart, blockEnd: row.blockEnd, kind: row.kind, ...layout }] : [];
    });
    const headingLayouts = new Map(layouts.filter(row => row.kind === 'heading').map(row => [row.blockStart,
      { ...(row.align ? { align: row.align } : {}), ...(row.wrap ? { wrap: row.wrap } : {}),
        ...(row.x != null ? { x: row.x } : {}), ...(row.y != null ? { y: row.y } : {}) }]));
    const imageLayouts = new Map(layouts.filter(row => row.kind === 'image').map(row => [row.blockStart,
      { ...(row.align ? { align: row.align } : {}), ...(row.width != null ? { width: row.width } : {}),
        ...(row.wrap ? { wrap: row.wrap } : {}), ...(row.x != null ? { x: row.x } : {}), ...(row.y != null ? { y: row.y } : {}) }]));
    const imageRows = (value?.images?.entries || []).slice(0, 2048);
    const images = imageRows.flatMap(row => {
      if (![row.blockStart, row.blockEnd].every(offset => safeBoundary(text, offset)) || row.blockEnd <= row.blockStart ||
          !safeInt(row.index) || !['embedded', 'linked'].includes(row.profile)) return [];
      return [{ blockStart: row.blockStart, blockEnd: row.blockEnd, index: row.index, alt: display(row.alt, 192), profile: row.profile,
        ...(typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 999 ? { id: display(row.id, 999) } : {}),
        ...(typeof row.mime === 'string' && /^image\/[a-z0-9.+-]{1,64}$/.test(row.mime) ? { mime: row.mime } : {}),
        ...(typeof row.assetStatus === 'string' ? { assetStatus: clip(row.assetStatus, 64) } : {}),
        ...(safeInt(row.bytes) ? { bytes: row.bytes } : {}),
        ...(row.drawing === true ? { drawing: true } : {}),
        ...(row.intrinsic && [row.intrinsic.width, row.intrinsic.height].every(value => safeInt(value) && value > 0 && value <= 16384)
          ? { intrinsic: { width: row.intrinsic.width, height: row.intrinsic.height } } : {}),
        ...(imageLayouts.get(row.blockStart) || {}) }];
    });
    const sourceRows = (value?.entries || []).filter(row => safeBoundary(text, row.start) && safeBoundary(text, row.end) && row.end >= row.start);
    const entries = sourceRows.map((row, index) => {
      let end = safeBoundary(text, row.extentEnd) && row.extentEnd >= row.end ? row.extentEnd : row.end;
      if (state.docKind === 'markdown') {
        const next = sourceRows[index + 1];
        end = next ? next.start : value?.complete === false ? row.end : text.length;
        while (end > row.start && /\s/.test(text[end - 1])) end--;
        for (;;) {
          const start = text.lastIndexOf('\n', end - 1) + 1;
          const marker = willMarkerOf(text.slice(start, end));
          if (start <= row.start || !marker || marker.kind === 'near') break;
          end = start;
          while (end > row.start && /\s/.test(text[end - 1])) end--;
        }
      }
      const hidden = imageSpans(text).some(span => span.start < row.end && row.start < span.end);
      return { start: row.start, end, depth: bounded(row.depth ?? row.level, 1, 1, 64),
        label: hidden ? '<embedded data omitted>' : display(row.label || '', 192),
        kind: String(row.kind || (state.docKind === 'markdown' ? 'heading' : 'declaration')),
        ...(headingLayouts.has(row.start) ? { layout: headingLayouts.get(row.start) } : {}) };
    });
    value = { entries, engine: value?.engine || null, complete: value?.complete !== false,
      ...(value?.brief && [value.brief.start, value.brief.end].every(at => safeBoundary(text, at)) && value.brief.end > value.brief.start
        ? { brief: { start: value.brief.start, end: value.brief.end, complete: value.brief.complete === true } } : {}),
      ...(state.docKind === 'markdown' ? { blocks: {entries: blocks, complete: value?.blocks?.complete === true && blocks.length === blockRows.length},
        images: { entries: images, total: Math.max(images.length, Number(value?.images?.total) || 0),
        assetRecords: safeInt(value?.images?.assetRecords) ? value.images.assetRecords : 0,
        declaredAssetBytes: safeInt(value?.images?.declaredAssetBytes) ? value.images.declaredAssetBytes : 0,
        complete: value?.images?.complete === true && images.length === imageRows.length,
        ...(value?.images?.reason || !value?.images ? { reason: value?.images?.reason || value?.reason || 'markdown_parser_unavailable' } : {}) },
        layout: { entries: layouts, total: Math.max(layouts.length, Number(value?.layout?.total) || 0),
          // A layout comment the renderer ignored, with why (layout/markdown.mjs inspectInline's reasons) and its block.
          faults: (Array.isArray(value?.layout?.faults) ? value.layout.faults : []).slice(0, 32).flatMap(row => typeof row?.reason === 'string'
            ? [{ reason: clip(row.reason, 64), ...([row.blockStart, row.blockEnd].every(offset => safeBoundary(text, offset)) && row.blockEnd > row.blockStart ? { blockStart: row.blockStart, blockEnd: row.blockEnd } : {}) }] : []),
        complete: value?.layout?.complete === true && layouts.length === layoutRows.length,
        ...(value?.layout?.reason || !value?.layout ? { reason: value?.layout?.reason || value?.reason || 'markdown_parser_unavailable' } : {}) } } : {}),
      total: Number(value?.total) || entries.length, ...(value?.reason ? { reason: value.reason } : {}) };
    outlineCache = {...snapshot, value};
    return value;
  }

  async function continuationBrief(context, budget) {
    if (state.docKind !== 'markdown' || !/continuation[ \t]+brief/i.test(state.text)) return null;
    const facts = await outline(context);
    if (facts.outcome) return facts;
    const section = facts.brief;
    if (!section) return null;
    const start = section.start, sectionEnd = section.end;
    let end = Math.min(sectionEnd, start + 2048);
    if (!safeBoundary(state.text, end)) end--;
    const project = () => {
      const value = disclose(state.text, start, end);
      return { source: 'document', authority: false, start, end, sectionEnd, text: value.text,
        complete: section.complete && end === sectionEnd && !value.omissions.length,
        remaining: sectionEnd - end, ...(!section.complete ? {reason: 'markdown_work_bound'} : {}),
        ...(value.omissions.length ? {omissions: value.omissions.slice(0, 4)} : {}) };
    };
    let result = project();
    // Context keeps its other facts. The brief is source data, never a handle or a second authority.
    while (bytes(JSON.stringify(result)) > budget && end > start) {
      end = start + clip(state.text.slice(start, end), Math.floor((end - start) * 0.75)).length;
      result = project();
    }
    return result;
  }

  async function getOutline(input, who, context) {
    // The outline cache answers a repeat read without a fact round trip, but never a forged or
    // spent continuation: the handle is checked first and consumed after, cache hit or not.
    const bad = checkContinuation(context, 'outline');
    if (bad) return bad;
    const snapshot = readSnapshot(), analysis = await outline(context);
    if (!sameReadSnapshot(snapshot)) return failure('document_changed', 'conflict');
    if (context?.continues) pendingFacts.delete(context.continues);
    if (analysis.outcome) return analysis;
    let entries = analysis.entries;
    let offset = 0, within = null;
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'outline' || cursor.revision !== state.revision) return failure('outline_changed', 'conflict');
      offset = cursor.offset; within = cursor.within;
    } else if (input.within) {
      const ref = lookup('refs', input.within, who);
      if (ref.outcome) return ref;
      const range = relocate(ref);
      if (range.outcome) return range;
      within = range;
    }
    if (within) entries = entries.filter(row => row.start >= within.start && row.end <= within.end);
    const limit = bounded(input.limit, 24, 1, 32), page = entries.slice(offset, offset + limit);
    const items = [];
    for (const row of page) {
      const item = { ref: reference(row.start, row.end, who, { kind: row.kind, label: row.label })?.id || null,
        kind: row.kind, depth: row.depth, label: row.label, chars: row.end - row.start,
        ...(row.layout ? { layout: row.layout } : {}), ...documentLaw(row.start, row.end) };
      if (bytes(JSON.stringify(items)) + bytes(JSON.stringify(item)) > LIMITS.resultBytes - 1800) {
        if (item.ref) delete state.refs[item.ref];
        break;
      }
      items.push(item);
    }
    const end = offset + items.length;
    const next = end < entries.length ? mint('cursors', 'outline_', { kind: 'outline', revision: state.revision, offset: end, within }, who) : null;
    return accepted({ engine: analysis.engine, items, total: within ? entries.length : analysis.total, remaining: entries.length - end,
      // complete is this response's (the parser finished and no page follows), as notes.find says it.
      next_cursor: next?.id || null, complete: analysis.complete && !next, omitted: Math.max(0, analysis.total - analysis.entries.length),
      ...(analysis.reason ? { reason: analysis.reason } : {}) });
  }

  async function find(input, who, context) {
    const snapshot = readSnapshot();
    // A Markdown kind with no words lists every element of that kind; text and code names need a query.
    if (!['source', 'comparison'].includes(input.scope)) return failure('search_scope_required', 'invalid');
    if (typeof input.query !== 'string' || (!input.query && input.scope !== 'comparison' && !FIND_KINDS.markdown.includes(input.kind)) || input.query.length > 512 ||
        /[\uD800-\uDFFF]/u.test(input.query)) return failure('query_invalid', 'invalid');
    if (input.scope === 'comparison' && !state.compare) return failure('compare_not_open');
    if (input.scope === 'comparison') {
      // Source-search-only fields under an open comparison are a wrong-tool call: refuse naming
      // the field rather than silently ignoring it.
      for (const field of ['case_sensitive', 'within', 'kind']) {
        if (Object.hasOwn(input, field)) return failure(field + '_not_applicable', 'invalid');
      }
      return findInComparison(input, who);
    }
    if (input.kind && Object.hasOwn(input, 'case_sensitive')) return failure('case_sensitive_not_applicable', 'invalid');
    // The document kind decides the analyzer: Markdown kinds search a Markdown document, code kinds a code one.
    if (input.kind && FIND_KINDS.markdown.includes(input.kind) !== (state.docKind === 'markdown')) return failure('kind_not_applicable', 'invalid');
    let range = { start: 0, end: state.text.length }, offset = 0;
    const signature = JSON.stringify([input.query, !!input.case_sensitive, input.kind || '', input.within || '']);
    if (input.within) {
      const ref = lookup('refs', input.within, who);
      if (ref.outcome) return ref;
      range = relocate(ref);
      if (range.outcome) return range;
    }
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'find' || cursor.revision !== state.revision || cursor.signature !== signature) return failure('search_changed', 'conflict');
      offset = cursor.offset;
    }
    // Hidden comment data never occupies a search page or its cursor's offset.
    const record = state.docKind === 'markdown' && state.text.includes('md-comments:') ? parseComments(state.text).record : null;
    const outsideRecord = row => !record || row.end <= record.start || row.start >= record.end;
    let found = [], complete = true, windowed = false, structuralRemaining = 0, sectionEntries = null;
    const limit = bounded(input.limit, 8, 1, 16);
    if (input.kind) {
      const requirements = { mode: 'find', filename: state.filename, docKind: state.docKind, query: input.query, kind: input.kind, within: range, offset };
      const resolved = worldOrPending(context, 'find', requirements, fact =>
        fact.query === input.query && fact.kind === input.kind && fact.offset === offset &&
        JSON.stringify(fact.within) === JSON.stringify(range));
      if (resolved.terminal) return resolved.terminal;
      const value = resolved.value;
      if (value?.reason && !value.matches) return failure(value.reason);
      found = (value?.matches || []).filter(row => safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end));
      complete = value?.complete !== false;
      windowed = value?.windowed === true; structuralRemaining = Number(value?.remaining) || 0;
      // Code reports its own sections; a Markdown find leaves them to the outline, below.
      sectionEntries = Array.isArray(value?.entries) ? value.entries.map(row => ({ start: row.start, end: row.extentEnd ?? row.end,
        label: display(row.label || row.name || '', 192), kind: row.kind || 'declaration' })) : null;
    } else {
      const haystack = input.case_sensitive ? state.text : state.text.toLocaleLowerCase('und');
      const needle = input.case_sensitive ? input.query : input.query.toLocaleLowerCase('und');
      // Locale folding can change UTF-16 width; exact indices come from a case-insensitive regex in that case.
      if (haystack.length !== state.text.length || needle.length !== input.query.length) {
        const pattern = new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
        pattern.lastIndex = range.start;
        for (const match of state.text.matchAll(pattern)) {
          if (match.index >= range.end) break;
          const row = { start: match.index, end: match.index + match[0].length };
          if (row.end <= range.end && outsideRecord(row)) found.push(row);
          if (found.length >= offset + limit + 1) { complete = false; break; }
        }
      } else {
        let at = range.start;
        while (at <= range.end) {
          const start = haystack.indexOf(needle, at);
          if (start < 0 || start + input.query.length > range.end) break;
          const row = { start, end: start + input.query.length };
          if (outsideRecord(row)) found.push(row);
          at = start + Math.max(1, input.query.length);
          if (found.length >= offset + limit + 1) { complete = false; break; }
        }
      }
    }
    if (!sectionEntries && (state.docKind === 'markdown' ||
        (/\.(?:[cm]?js|html?)$/i.test(state.filename) && worldHasFact(context, 'outline')))) {
      const mapped = await outline(context);
      if (mapped.outcome) return mapped;
      sectionEntries = mapped.entries;
    }
    if (!sameReadSnapshot(snapshot)) return failure('read_snapshot_changed', 'conflict');
    sectionEntries = (sectionEntries || []).filter(row => safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end));
    // The comment record is data the comment tools read; a match inside it is never offered as editable text.
    if (record) found = found.filter(outsideRecord);
    const sectionRefs = new Map();
    const localOffset = windowed ? 0 : offset;
    const page = found.slice(localOffset, localOffset + limit), matches = [];
    for (const row of page) {
      const projected = disclose(state.text, row.start, row.end), held = handle(row.start, row.end, who);
      let snippetStart = Math.max(range.start, row.start - 64), snippetEnd = Math.min(range.end, row.end + 96);
      if (!safeBoundary(state.text, snippetStart)) snippetStart--;
      if (!safeBoundary(state.text, snippetEnd)) snippetEnd++;
      const item = { matched: projected.text, handle: held?.id || null, start: row.start, end: row.end,
        snippet: clip(disclose(state.text, snippetStart, snippetEnd).text, 192),
        handle_scope: 'matched', ...documentLaw(row.start, row.end),
        ...(projected.omissions.length ? { complete: false, omissions: projected.omissions.slice(0, 2) } : {}) };
      const section = sectionEntries.filter(entry => entry.start <= row.start && row.end <= entry.end)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
      let sectionRef = null;
      if (section) {
        const key = `${section.start}:${section.end}`;
        sectionRef = sectionRefs.get(key);
        if (!sectionRef) {
          const ref = reference(section.start, section.end, who, { kind: section.kind, label: section.label });
          if (ref) { sectionRef = { id: ref.id, listed: false }; sectionRefs.set(key, sectionRef); }
        }
        if (sectionRef) { item.section_ref = sectionRef.id; item.section = section.label; }
      }
      if (bytes(JSON.stringify(matches)) + bytes(JSON.stringify(item)) > LIMITS.resultBytes - 1400) {
        if (held) delete state.handles[held.id];
        if (matches.length) {
          if (sectionRef && !sectionRef.listed) delete state.refs[sectionRef.id];
          break;
        }
        // A complete declaration or paragraph can exceed one reply. Keep its location and a
        // bounded excerpt, without editing authority; document.read discloses the full range.
        item.handle = null; item.complete = false; item.reason = 'match_over_result_budget';
        while (item.matched.length && bytes(JSON.stringify(matches)) + bytes(JSON.stringify(item)) > LIMITS.resultBytes - 1400) {
          item.matched = clip(item.matched, Math.floor(item.matched.length * 0.8));
        }
      }
      matches.push(item);
      if (sectionRef) sectionRef.listed = true;
    }
    const end = offset + matches.length;
    const more = localOffset + matches.length < found.length || (input.kind ? structuralRemaining > 0 : !complete);
    const next = more ? mint('cursors', 'find_', { kind: 'find', revision: state.revision, signature, offset: end }, who) : null;
    return accepted({ scope: 'source', matches, next_cursor: next?.id || null, complete: complete && !more,
      ...(input.kind && !complete ? { reason: 'structure_bounded' } : {}), ...(matches.length ? { expires_in_ms: LIMITS.lifetimeMs } : {}) });
  }

  // Receipt is best-effort: world.structure(mode:'receipt') for this exact pair, else not_checked. An applied commit cannot pend.
  function structureReceipt(beforeText, text, filename, context) {
    if (!receiptStructureEligible(filename)) return null;
    const fact = context?.world?.structure;
    const beforeDigest = digest(beforeText), afterDigest = digest(text);
    if (!fact || fact.mode !== 'receipt' || fact.filename !== filename ||
        fact.beforeDigest !== beforeDigest || fact.afterDigest !== afterDigest) {
      return { parse: 'not_checked', reason: 'structure_unavailable' };
    }
    try { return receiptStructureFact(beforeText, text, fact.value); }
    catch (error) { return { parse: 'not_checked', reason: 'structure_unavailable' }; }
  }

  function remember(pool, who, value) {
    pool[ownerOf(who)] = { ...value, at: now() };
    const entries = Object.entries(pool).sort((a, b) => a[1].at - b[1].at);
    while (entries.length > LIMITS.principals) delete pool[entries.shift()[0]];
  }

  function commitGate(splices, who, drawingTarget = null) {
    expireCollaboration();
    if (who.actor !== 'agent') return null;
    const sameDrawing = value => drawingTarget && value?.occurrence && value.occurrence.start === drawingTarget.occurrence?.start &&
      value.occurrence.end === drawingTarget.occurrence?.end && normalizeLabel(value.occurrence.reference) === normalizeLabel(drawingTarget.asset);
    const ranges = sameDrawing(state.drawing) ? [] : [state.selection?.active && state.selection.start !== state.selection.end ? state.selection : null,
      state.focus?.active ? state.focus : null];
    for (const row of Object.values(state.humanContexts)) if (row.visible && row.editing && row.revision === state.revision && !sameDrawing(row.drawing)) {
      ranges.push(row.selection, row.focus);
    }
    const hands = ranges.filter(Boolean).map(range => ({original: range, moved: range}));
    for (const row of splices) {
      const touched = hands.find(hand => overlap(hand.moved, row));
      if (touched) return failure('foreground_hand_wins', 'yielded', {current: {start: touched.original.start, end: touched.original.end}});
      for (const hand of hands) hand.moved = transportInterval(hand.moved.start, hand.moved.end, [row]);
    }
    return null;
  }

  // One owner of committed text. Pure. Null when stale or a definition cannot append.
  // Order: authored, retirements, then definitions, so append never reintroduces a retired definition.
  function committedText(beforeText, splices, authoredCount, actor, docKind, operation, restores, sourceTransactionId, drawAssets, commentInverses, commentRestorations) {
    const authoredSplices = splices.slice(0, authoredCount);
    let derivedCommentIndex = null;
    let text = transformSplices(beforeText, splices);
    if (text == null) return null;
    if (docKind === 'markdown' && operation !== 'document.replace' && !restores && !sourceTransactionId) {
      const retired = imageDeletionSplices(beforeText, text, authoredSplices, actor);
      if (retired.length) { splices = splices.concat(retired); text = transformSplices(text, retired); }
      // Retiring an inner pair can empty the other kind around it. Only untouched original
      // markers retire, and every pass removes bytes, so the derived rows finish together.
      let emptied;
      do {
        emptied = false;
        for (const kind of ['ink', 'color']) {
          const rows = markerDeletionSplices(beforeText, text, splices, actor, kind);
          if (rows.length) { splices = splices.concat(rows); text = transformSplices(text, rows); emptied = true; }
        }
      } while (emptied);
    }
    if (docKind === 'markdown' && drawAssets?.length) {
      let additions;
      try { additions = pendingAssetSplices(text, drawAssets); } catch { return null; }
      if (additions.length) { splices = splices.concat(additions); text = transformSplices(text, additions); }
    }
    if (docKind === 'markdown' && operation !== 'document.replace') {
      const comments = commentSplices(beforeText, splices);
      if (comments.length) { splices = splices.concat(comments); text = transformSplices(text, comments); derivedCommentIndex = splices.length - 1; }
    }
    for (const change of commentRestorations || []) {
      const row = commentRestoreSplice(text, change, change.later, splices);
      if (row) {splices = splices.concat(row); text = transformSplices(text, [row]);}
    }
    for (const change of commentInverses || []) {
      const row = change.later && commentUndoSplice(text, change, change.later.concat({splices}));
      if (!row) return {reason: 'change_interleaved'};
      splices = splices.concat(row); text = transformSplices(text, [row]);
      if (text == null) return null;
    }
    return { text, splices, authoredSplices, derivedCommentIndex };
  }

  // The host's one fence over every commit path, checked before source changes. `fact` carries the edit's splices, so a host
  // refuses only what it holds (Draw: the open picture, or where a new one lands), and lets a Draw fence admit a patch to the
  // open drawing. Asked bare, it says whether a fence stands at all.
  function commitFenceRefusal(fact) {
    const fence = typeof host.commitFence === 'function' ? host.commitFence(fact) : '';
    return fence ? failure(fence, 'refused') : null;
  }

  async function commit(splices, who, context, operation, options = {}) {
    options = {...options, turnId: options.turnId ?? who.turnId};
    const guarded = documentGuardFailure(context); if (guarded) return guarded;
    cancelled(context);
    const beforeText = state.text, baseRevision = state.revision, documentId = state.documentId;
    const authoredCount = options.authoredCount ?? splices.length;
    if (!safeInt(authoredCount) || authoredCount > splices.length) return failure('edit_invalid', 'invalid');
    const computed = committedText(beforeText, splices, authoredCount, who.actor, state.docKind, operation,
      options.restores === true, options.sourceTransactionId, options.drawAssets, options.commentInverses, options.commentRestorations);
    if (!computed) return failure('target_changed', 'conflict');
    if (computed.reason) return failure(computed.reason, 'conflict');
    let { text, splices: withRetirements, authoredSplices } = computed;
    splices = withRetirements;
    options = {...options, authoredCount, editCount: options.editCount ?? authoredCount};
    if (options.drawingPatch) {
      const candidate = clone(options.drawingPatch);
      const index = splices.findIndex(row => {
        const match = DRAW_OCCURRENCE.exec(row.removed);
        return match && normalizeLabel(match[2]) === normalizeLabel(candidate.asset);
      });
      if (index < 0) return failure('draw_patch_invalid', 'conflict');
      const authored = splices[index];
      const target = transportInterval(authored.pos, authored.pos + authored.inserted.length, splices.slice(index + 1));
      if (!target) return failure('draw_patch_invalid', 'conflict');
      candidate.occurrence = {...candidate.occurrence, start: authored.pos, end: authored.pos + authored.removed.length, position: authored.pos};
      candidate.targetOccurrence = {...candidate.targetOccurrence, ...target, position: target.start};
      if (!verifyDrawingPatch(candidate, beforeText, text)) return failure('draw_patch_invalid', 'conflict');
      const retainedDrawingPatch = compactDrawingPatch(candidate, beforeText, text);
      if (!retainedDrawingPatch) return failure('draw_patch_invalid', 'conflict');
      options = {...options, drawingPatch: candidate, fence: {...options.fence, drawingPatch: candidate}};
    }
    if (options.drawingPresentation) {
      const requested = options.drawingPresentation;
      let occurrence = null;
      for (let index = 0; index < splices.length && !occurrence; index++) {
        const splice = splices[index], images = /!\[((?:\\.|[^\]\\])*)\]\[([^\]\n]+)\]/g;
        for (let match; (match = images.exec(splice.inserted));) {
          if (normalizeLabel(match[2]) !== normalizeLabel(requested.reference)) continue;
          occurrence = transportInterval(splice.pos + match.index, splice.pos + match.index + match[0].length, splices.slice(index + 1));
          break;
        }
      }
      options = {...options, drawingPresentation: occurrence ? {...requested, occurrence} : null};
    }
    const invalid = admissibleSnapshotText(text);
    if (invalid) return failure(invalid, 'invalid');
    const beforeMetadata = {filename: state.filename, docKind: state.docKind};
    const metadata = options.metadataDelta || (options.metadata ? metadataDelta(beforeMetadata, options.metadata, {assign: options.metadataAssignments || []}) : null);
    const afterMetadata = transformMetadata(beforeMetadata, metadata);
    if (!afterMetadata) return failure('metadata_invalid', 'invalid');
    const metadataChanged = afterMetadata.filename !== beforeMetadata.filename || afterMetadata.docKind !== beforeMetadata.docKind;
    if (afterMetadata.docKind !== beforeMetadata.docKind && currentDrawing()?.open) return failure('draw_session_open', 'conflict');
    const effectChanged = hasHistoryEffect({splices: [], transaction: {sourceTransactionId: options.sourceTransactionId, sourceTransactionIds: options.sourceTransactionIds}}, journalHistory().records);
    options = {...options, metadataDelta: metadata, metadata: afterMetadata};
    if (text === beforeText && !metadataChanged && !effectChanged) return {outcome: 'unchanged', sourceChanged: false, changeId: null, editCount: 0};
    const gate = commitGate(splices, who, options.drawingPatch);
    if (gate) return gate;
    if (state.docKind === 'markdown' && who.actor === 'agent' && operation !== 'comments.write' &&
        options.restores !== true && !options.sourceTransactionId &&
        touchesCommentRecord(beforeText, authoredSplices, options.metadata?.docKind || state.docKind)) return failure('comments_record');
    const law = enforceWill(beforeText, text, authoredSplices, { docKind: state.docKind, actor: who.actor,
      restores: options.restores === true, referenceCheck: host.referenceCheck, markerSplices: splices });
    if (law) return failure('document_law', 'refused', law);
    // Same fence as commit(): asked for every path before source changes.
    const fenced = commitFenceRefusal({...options.fence, splices});
    if (fenced) return fenced;
    // An agent's edit never leaves a colour or ink marker standing alone or an empty pair: each pair stays whole or goes whole, or the edit is
    // refused with the source exact.
    if (!law && state.docKind === 'markdown' && who.actor === 'agent' && operation !== 'document.replace' &&
        options.restores !== true && !options.sourceTransactionId) {
      for (const kind of ['ink', 'color']) {
        const broken = markerBroken(beforeText, text, splices, kind);
        if (broken) return failure(kind + '_pair_broken', 'refused', broken);
      }
    }
    let result = null, transactionId = null, revision = baseRevision + 1, presentation = null;
    const uncertain = reason => failure(reason, 'uncertain', { operation, requestId: who.requestId, baseRevision,
      ...(transactionId ? { transactionId } : {}) });
    if (documentGuardFailure(context)) return documentGuardFailure(context);
    if (typeof host.commit === 'function') {
      // Once the host is called, a missing or unusable receipt cannot establish that no write happened.
      try {
        result = await host.commit({ documentId, baseRevision, beforeText, text, splices: clone(splices), authoredCount,
          ...who, signal: context.signal, operation, label: clip(options.label ?? operation, 120),
          sourceTransactionId: options.sourceTransactionId || null,
          metadata, beforeMetadata, afterMetadata,
          ...(options.sourceTransactionIds?.length ? {sourceTransactionIds: options.sourceTransactionIds} : {}),
          ...(options.turnId ? {turnId: options.turnId} : {}), fence: options.fence || null });
        const ok = result?.ok;
        if (ok === false) {
          const reason = result.reason, outcome = result.outcome;
          return failure(typeof reason === 'string' && reason ? clip(reason, 160) : 'commit_refused',
            outcome === 'refused' ? 'refused' : 'conflict');
        }
        if (ok !== true) return uncertain('host_commit_receipt_invalid');
        const suppliedId = result.transactionId;
        if (suppliedId == null) return uncertain('host_commit_receipt_invalid');
        if (suppliedId != null) {
          if (typeof suppliedId !== 'string' || !suppliedId || suppliedId.length > 256) return uncertain('host_commit_receipt_invalid');
          transactionId = suppliedId;
        }
        const suppliedDocumentId = result.documentId;
        if (typeof suppliedDocumentId !== 'string' || !suppliedDocumentId) return uncertain('host_commit_receipt_invalid');
        if (suppliedDocumentId !== documentId) return uncertain('document_replaced_after_commit');
        const suppliedRevision = result.revision;
        if (suppliedRevision == null) return uncertain('host_commit_receipt_invalid');
        revision = suppliedRevision;
        if (result.createdAt !== undefined && result.createdAt !== null && !safeInt(result.createdAt)) return uncertain('host_commit_receipt_invalid');
        if (result.author !== undefined) historyAuthor(result.author, who.actor);
        if (metadata && (canonicalJson(result.metadata) !== canonicalJson(afterMetadata))) return uncertain('host_commit_receipt_invalid');
        presentation = result.drawingReceipt || result.presentation;
      } catch { return uncertain('host_commit_unconfirmed'); }
    } else cancelled(context);
    if (!safeInt(revision) || revision !== baseRevision + 1) return result ? uncertain('host_revision_invalid') : failure('host_revision_invalid');
    const entry = appendCommit(text, splices, who, operation, { ...options, derivedCommentIndex: computed.derivedCommentIndex, revision, ...(result ? {createdAt: result.createdAt ?? null, affectedBlockIds: result.affectedBlockIds, author: result.author || who.author} : {}), id: transactionId || undefined });
    if (metadataChanged) { state.handles = {}; state.refs = {}; state.cursors = {}; }
    const structure = structureReceipt(beforeText, text, state.filename, context);
    const output = { outcome: options.rebased ? 'rebased' : 'applied', sourceChanged: text !== beforeText,
      sourceRevision: state.revision, act: publicAct(entry), changeId: entry.id, editCount: options.editCount || splices.length,
      ...(options.turnId ? {turnId: options.turnId} : {}),
      ...(presentation ? {presentation, ...(result?.drawingReceipt ? {drawingReceipt: result.drawingReceipt} : {})} : {}),
      ...(options.drawingPatch ? {drawingPatch: {...clone(options.drawingPatch), transactionId: entry.id}} : {}),
      ...(structure ? { structure } : {}),
      transaction: { transactionId: entry.id, baseRevision, revision, actor: who.actor, principal: who.principal,
        operation, createdAt: entry.createdAt, author: clone(entry.author), sourceTransactionId: options.sourceTransactionId || null,
        ...(options.sourceTransactionIds?.length ? {sourceTransactionIds: [...options.sourceTransactionIds]} : {}),
        ...(options.turnId ? {turnId: options.turnId, turnBaseRevision: entry.turnBaseRevision} : {}) } };
    return operation === 'document.draw' || options.drawingPatch ? drawingReceipt(output) : output;
  }

  async function applyEdits(input, who, context) {
    if (!Array.isArray(input.edits) || !input.edits.length || input.edits.length > LIMITS.edits) return failure('edits_invalid', 'invalid');
    const ready = [], seen = new Set();
    let total = 0, rebased = false;
    for (let index = 0; index < input.edits.length; index++) {
      const edit = input.edits[index];
      if (!edit || typeof edit.context_handle !== 'string' || typeof edit.text !== 'string' ||
          edit.text.length > LIMITS.editChars || (edit.placement && !['replace', 'before', 'after'].includes(edit.placement))) return failure('edit_invalid', 'invalid', { editIndex: index });
      total += edit.text.length;
      if (total > LIMITS.editChars) return failure('batch_too_large', 'invalid');
      if (seen.has(edit.context_handle)) return failure('context_repeated', 'invalid', { editIndex: index });
      seen.add(edit.context_handle);
      if (changeOf(edit.context_handle)) return failure('context_handle_wrong_kind', 'invalid', { editIndex: index });
      const held = lookup('handles', edit.context_handle, who);
      if (held.outcome) return { ...held, editIndex: index };
      // A recipe_handle authorizes document.draw on that picture only.
      if (['draw', 'svg', 'image-comment'].includes(held.kind)) return failure('context_handle_wrong_kind', 'invalid', { editIndex: index });
      const range = relocate(held, who);
      if (range.outcome) return { ...range, editIndex: index };
      rebased ||= range.rebased;
      const placement = edit.placement || 'replace';
      const start = placement === 'after' ? range.end : range.start;
      const end = placement === 'replace' ? range.end : start;
      const inserted = placement === 'after' && needsParagraphBreakAfter(state.text, range.end)
        ? paragraphBreakAround(state.text, range.end).prefix + edit.text : edit.text;
      const narrow = minimalSplice(state.text.slice(start, end), inserted);
      const pos = start + narrow.pos;
      // Offset from the just-relocated range.
      ready.push({ held, editIndex: index, start, end, offset: pos - range.start,
        splice: { pos, removed: narrow.removed, inserted: narrow.inserted } });
    }
    const ordered = ready.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < ordered.length; index++) {
      const prev = ordered[index - 1], next = ordered[index];
      if (next.start < prev.end || (next.start === prev.start && (next.start === next.end || prev.start === prev.end))) {
        return failure('edits_overlap', 'invalid', { editIndex: next.editIndex });
      }
    }
    const withSplices = ready.filter(row => row.splice.removed || row.splice.inserted).sort((a, b) => b.splice.pos - a.splice.pos);
    const splices = withSplices.map(row => row.splice);
    const handlePairs = withSplices.map(row => ({ handleId: row.held.id, offset: row.offset }));
    const result = await commit(splices, who, context, 'document.edit', {
      label: input.label ?? 'Agent edit', rebased, editCount: ready.length,
      handleIds: ready.map(row => row.held.id), handlePairs, note: input.note || null, turnId: input.turn_id,
    });
    if (['applied', 'rebased', 'unchanged'].includes(result.outcome)) {
      if (result.outcome !== 'unchanged' && splices.length) {
        // One exact authored insertion, transported through the rest of this committed transaction.
        const entry = state.journal.find(row => row.id === result.changeId);
        const span = entry && transportInterval(splices[0].pos, splices[0].pos + splices[0].inserted.length, entry.splices.slice(1));
        const fresh = span && handle(span.start, span.end, who);
        if (fresh) result.handle = fresh.id;
      }
      for (const row of ready) row.held.used = true;
      if (input.note && typeof host.note === 'function') {try {host.note(clip(input.note, 240));} catch {}}
    }
    return result;
  }

  // Carried history uses zero for an unknown time; do not attest that sentinel as 1970.
  function publicAct(entry) {
    if (!entry) return null;
    return {id: entry.id, document_id: state.documentId, base_revision: entry.baseRevision, revision: entry.revision,
      author: {kind: entry.author?.kind || entry.actor, ...((entry.author?.name || entry.agent || entry.hostAgent)
        ? {name: entry.author?.name || entry.agent || entry.hostAgent} : {})},
      at: safeInt(entry.createdAt) && entry.createdAt > 0 && Number.isFinite(new Date(entry.createdAt).getTime()) ? new Date(entry.createdAt).toISOString() : null, operation: entry.operation,
      ...(entry.turnId ? {turn_id: entry.turnId} : {}), ...(entry.label != null ? {label: entry.label} : {}),
      ...(entry.sourceTransactionIds?.length || entry.sourceTransactionId
        ? {reverses: entry.sourceTransactionIds || [entry.sourceTransactionId]} : {})};
  }

  function publicWriteReceipt(value) {
    if (!value.transaction && !Object.hasOwn(value, 'changeId')) return value.outcome === 'unchanged' ? {...value, act: null} : value;
    const {transaction, changeId, undoneChangeId, undoneChangeIds, turnId, ...result} = value;
    return {...result, ...(value.outcome === 'unchanged' ? {act: null} : {})};
  }

  function validSnapshotJournalRow(row) {
    if (!row || !safeInt(row.revision) || !safeInt(row.baseRevision) || !Array.isArray(row.splices) ||
        typeof row.id !== 'string' || !row.id || !['human', 'agent', 'system'].includes(row.actor) ||
        typeof row.principal !== 'string' || !row.principal || row.principal.length > 160 ||
        typeof row.transport !== 'string' || !row.transport || typeof row.operation !== 'string' || !row.operation) return false;
    try { if (row.author) historyAuthor(row.author, row.actor); historyTurn(row); }
    catch (_) { return false; }
    return true;
  }

  function journalHistory(rows = state.journal, source = state.text, complete = state.history.complete) {
    const material = rows;
    return {source, complete: complete === true, metadata: {filename: state.filename, docKind: state.docKind}, revision: material.at(-1)?.revision ?? state.revision,
      earliestRevision: material[0]?.baseRevision ?? state.revision,
      records: material.map(row => ({splices: row.splices, ...(Object.hasOwn(row, 'authored') ? {authored: row.authored} : {}), ...(row.metadata ? {metadata: row.metadata} : {}),
        ...(row.label == null ? {} : {changeSet: {label: row.label}}),
        ...(row.derivedCommentIndex == null ? {} : {derivedCommentIndex: row.derivedCommentIndex}),
        transaction: {id: row.id, baseRevision: row.baseRevision, revision: row.revision,
          actor: historyAuthor(row.author || {kind: row.actor, id: row.principal}, row.actor), createdAt: row.createdAt ?? null,
          operation: row.operation, affectedBlockIds: row.affectedBlockIds || [], sourceTransactionId: row.sourceTransactionId || null,
          ...(row.sourceTransactionIds?.length ? {sourceTransactionIds: row.sourceTransactionIds} : {}),
          ...(row.reverts ? {reverts: row.reverts} : {}), ...(row.reapplies ? {reapplies: row.reapplies} : {}),
          ...historyTurn(row)}}))};
  }

  function validCommentHistory(history, rows) {
    if (!rows.some(row => row.derivedCommentIndex != null)) return true;
    const before = sourceBefore(history, rows[0].id);
    if (!before.ok) return false;
    let source = before.source, originalSource;
    for (const row of rows) {
      const index = row.derivedCommentIndex;
      if (index != null) {
        if (row.authored) originalSource ||= authoredSourceReader(before.source, history.records);
        const original = row.authored ? originalSource(row.id) : {source, splices: row.splices};
        if (!safeInt(index) || index >= original.splices.length) return false;
        const derived = commentSplices(original.source, original.splices.slice(0, index))[0], claimed = original.splices[index];
        if (!derived || ['pos', 'removed', 'inserted'].some(key => derived[key] !== claimed[key])) return false;
      }
      source = transformSplices(source, row.splices);
      if (source == null) return false;
    }
    return true;
  }

  function inversePlan(entries, options) {
    const plan = selectiveUndo(journalHistory(), entries.map(row => row.id), options);
    if (!plan.ok && plan.reason === 'history_invalid') {
      // A forward edit can join two pre-existing lone units into a whole scalar. Its
      // recorded inverse still cannot split that scalar; retain this precise refusal.
      let text = state.text;
      for (const entry of state.journal.slice().reverse()) for (const row of entry.splices.slice().reverse()) {
        const prior = transformSplices(text, [row], true);
        if (prior === null) {
          const end = row.pos + row.inserted.length;
          if (safeInt(row.pos) && row.pos >= 0 && end <= text.length && text.slice(row.pos, end) === row.inserted &&
              (!safeBoundary(text, row.pos) || !safeBoundary(text, end))) return failure('target_changed', 'conflict');
          return failure(plan.reason, 'conflict');
        }
        text = prior;
      }
    }
    return plan.ok ? plan : failure(plan.reason, 'conflict');
  }

  function inverse(entry) {
    const plan = inversePlan([entry]);
    return plan.ok ? plan.splices : plan;
  }

  function historyDrawings(source) {
    const facts = structureMarkdown({source, kinds: ['image'], matchLimit: 2048}, markdownParser());
    if (!facts.complete) throw Error('drawing_history_unavailable');
    const rows = [];
    for (const match of facts.matches || []) {
      const raw = source.slice(match.start, match.end), parsed = DRAW_OCCURRENCE.exec(raw);
      if (!parsed) continue;
      const saved = sourceDrawing(source, parsed[2]);
      if (saved) rows.push({start: match.start, end: match.end, raw, alt: parsed[1], asset: parsed[2], recipe: saved.recipe,
        definition: {start: saved.asset.start, end: saved.asset.end}});
    }
    return rows;
  }

  function drawingHistory(entries) {
    if (state.docKind !== 'markdown') return [];
    const chosen = new Set(entries.map(row => row.id)), first = entries.reduce((a, b) => a.revision < b.revision ? a : b);
    const base = sourceBefore(journalHistory(), first.id), journal = since(first.baseRevision);
    if (!base.ok || !journal) throw Error('drawing_history_unavailable');
    let source = base.source, previous = historyDrawings(source);
    const tracks = previous.map(row => ({current: row, events: [], aliases: new Set([normalizeLabel(row.asset)]), raws: new Set([row.raw])}));
    previous.forEach((row, index) => row.track = tracks[index]);
    for (const entry of journal) {
      const afterSource = transformSplices(source, entry.splices);
      if (afterSource == null) throw Error('drawing_history_unavailable');
      const following = historyDrawings(afterSource), available = new Set(following), paired = new Map();
      const pair = (before, after) => {paired.set(before, after); available.delete(after);};
      for (const before of previous) {
        const moved = transportInterval(before.start, before.end, entry.splices);
        const exact = moved && [...available].find(after => after.start === moved.start && after.end === moved.end && after.raw === before.raw);
        if (exact) pair(before, exact);
      }
      for (const before of previous.filter(row => !paired.has(row))) {
        const ids = new Set(before.recipe.shapes.map(shape => shape.id));
        const candidates = [...available].filter(after => normalizeLabel(after.asset) === normalizeLabel(before.asset) ||
          after.recipe.shapes.some(shape => ids.has(shape.id)));
        const unique = candidates.filter(after => previous.filter(row => !paired.has(row)).filter(row =>
          normalizeLabel(row.asset) === normalizeLabel(after.asset) || row.recipe.shapes.some(shape => after.recipe.shapes.some(next => next.id === shape.id))).length === 1);
        if (unique.length === 1) pair(before, unique[0]);
      }
      const original = chosen.has(entry.id) && entry.drawingPatch ? drawingPatchForEntry(entry) : null;
      for (const before of previous) {
        const after = paired.get(before), track = before.track;
        track.current = after || null;
        if (after) {after.track = track; track.aliases.add(normalizeLabel(after.asset)); track.raws.add(after.raw);}
        if (!after || canonicalJson(sansView(before.recipe)) !== canonicalJson(sansView(after.recipe)) || before.raw !== after.raw) {
          const liveOriginal = original && normalizeLabel(original.asset) === normalizeLabel(before.asset) &&
            original.occurrence.start === before.start && after && normalizeLabel(original.reference) === normalizeLabel(after.asset);
          track.events.push({entry, chosen: chosen.has(entry.id), before: liveOriginal ? original.recipeBefore : before.recipe,
            after: after ? liveOriginal ? original.recipeAfter : after.recipe : null, beforeAlt: before.alt, afterAlt: after?.alt});
        }
      }
      for (const after of available) {
        // Later work depends on a created drawing's enclosure. Its selective inverse removes
        // contributed shapes/material without changing the frame or effects under surviving paint.
        const track = {current: after, aliases: new Set([normalizeLabel(after.asset)]), raws: new Set([after.raw]),
          events: [{entry, chosen: chosen.has(entry.id), before: {...after.recipe, shapes: [], strokes: []}, after: after.recipe,
            beforeAlt: after.alt, afterAlt: after.alt, created: true}]};
        tracks.push(track); after.track = track;
      }
      previous = following; source = afterSource;
    }
    return tracks.filter(track => track.current && track.events.some(event => event.chosen)).map(track => {
      for (const event of track.events) {
        if (event.chosen || !event.before || !event.after) continue;
        const refs = event.entry.sourceTransactionIds || (event.entry.sourceTransactionId ? [event.entry.sourceTransactionId] : []);
        const prior = track.events.find(row => !row.chosen && !row.neutral && refs.includes(row.entry.id));
        if (prior?.before && prior.after && canonicalJson(sansView(prior.before)) === canonicalJson(sansView(event.after)) &&
            canonicalJson(sansView(prior.after)) === canonicalJson(sansView(event.before)) &&
            prior.beforeAlt === event.afterAlt && prior.afterAlt === event.beforeAlt) prior.neutral = event.neutral = true;
      }
      const live = drawingFor(track.current.start, track.current.end, track.current.asset);
      const firstChosen = track.events.findIndex(event => event.chosen);
      return {...track, live, needsSemantic: track.events.slice(firstChosen + 1).some(event => !event.chosen && !event.neutral) ||
        !!live && canonicalJson(live.recipe) !== canonicalJson(track.current.recipe)};
    });
  }

  async function replayPaintingChanges(input, changes, context) {
    if (typeof host.paintReplay !== 'function' && typeof host.material !== 'function') return failure('paint_replay_unavailable', 'conflict');
    const recipe = clone(input);
    for (const change of changes) {
      const index = recipe.shapes.findIndex(shape => shape.id === change.id), before = recipe.shapes[index];
      let replayed;
      if (typeof host.material === 'function') {
        const prepared = await prepareMaterial('replay', {position: 'undo:' + change.id, shape: before,
          omitIds: change.omitIds, requireEmptyBase: change.requireEmptyBase === true}, context);
        if (prepared.refusal) return ['paint_replay_unavailable', 'material_result_invalid', 'material_unavailable'].includes(prepared.refusal.reason)
          ? failure('paint_replay_unavailable', 'conflict') : prepared.refusal;
        replayed = prepared.value;
      } else replayed = await host.paintReplay(before, change.omitIds, {signal: context.signal, requireEmptyBase: change.requireEmptyBase === true});
      cancelled(context);
      if (!replayed || replayed.id !== before.id || replayed.recognized !== 'paint' ||
          canonicalJson(replayed.geom) !== canonicalJson(before.geom) ||
          canonicalJson(replayed.paint?.px) !== canonicalJson(before.paint?.px) || replayed.paint?.scale !== before.paint?.scale)
        return failure('paint_replay_unavailable', 'conflict');
      const omitted = new Set(change.omitIds), expected = {...before.paint.replay,
        entries: before.paint.replay.entries.map(row => omitted.has(row.id) ? {...row, removed: true} : row)};
      if (canonicalJson(replayed.paint?.replay) !== canonicalJson(expected)) return failure('paint_replay_changed', 'conflict');
      recipe.shapes[index] = {...before, raster: replayed.raster, paint: replayed.paint};
    }
    return {recipe};
  }

  async function drawingInverse(entries, tracks, who, context, commentOptions) {
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const semantic = tracks.filter(track => track.needsSemantic);
    if (!semantic.length) return null;
    const aliases = new Set(semantic.flatMap(track => [...track.aliases])), raws = new Set(semantic.flatMap(track => [...track.raws]));
    const held = (text, splice, inserted) => {
      const end = splice.pos + (inserted ? splice.inserted.length : splice.removed.length);
      const touches = (start, finish) => splice.pos === end ? splice.pos > start && splice.pos < finish : splice.pos < finish && end > start;
      for (const asset of documentAssets(text).assets.values()) if (aliases.has(normalizeLabel(asset.label)) && touches(asset.start, asset.end)) return true;
      for (const raw of raws) for (let at = text.indexOf(raw); at >= 0; at = text.indexOf(raw, at + raw.length)) if (touches(at, at + raw.length)) return true;
      return false;
    };
    const protectedActs = new Map();
    const plan = inversePlan(entries, {...commentOptions, keepHunk: ({actId, actSource, priorSplices, beforeSource, splice}) => {
      if (commentOptions?.keepHunk({actId, beforeSource, splice})) return true;
      // Authored projection can reorder and split retained rows. Bind semantic ranges to
      // that exact projected act, then move them through its preceding transient hunks.
      let protectedAct = protectedActs.get(actId);
      if (!protectedAct || protectedAct.source !== actSource) {
        const ranges = [...documentAssets(actSource).assets.values()].filter(asset => aliases.has(normalizeLabel(asset.label)))
          .map(asset => ({start: asset.start, end: asset.end}));
        for (const raw of raws) for (let at = actSource.indexOf(raw); at >= 0; at = actSource.indexOf(raw, at + raw.length))
          ranges.push({start: at, end: at + raw.length});
        protectedAct = {source: actSource, ranges}; protectedActs.set(actId, protectedAct);
      }
      const ranges = protectedAct.ranges.map(range => transportTouchedInterval(range.start, range.end, priorSplices));
      if (ranges.some(range => splice.removed.length ? splice.pos < range.end && splice.pos + splice.removed.length > range.start
        : splice.pos > range.start && splice.pos < range.end)) return true;
      const after = transformSplices(beforeSource, [splice]);
      return held(beforeSource, splice, false) || after != null && held(after, splice, true);
    }});
    if (!plan.ok) return plan;
    const assets = [], additions = [], patches = [], replacedAssets = [], sourceDrawings = historyDrawings(source);
    for (const track of semantic) {
      const current = track.current, liveRecipe = track.live?.recipe || current.recipe;
      let recipe = clone(liveRecipe), alt = current.alt;
      for (let index = track.events.length - 1; index >= 0; index--) {
        const event = track.events[index];
        if (!event.chosen || !event.after) continue;
        const later = track.events.slice(index + 1).filter(row => !row.chosen && !row.neutral && row.before && row.after);
        const changes = paintUndoChanges(recipe, event.before, event.after);
        if (changes?.some(change => sourceDrawings.filter(drawing => change.omitIds.some(id =>
          drawing.recipe.shapes.some(shape => shape.paint?.replay?.entries?.some(entry => entry.id === id && !entry.removed)))).length > 1))
          return failure('paint_replay_unavailable', 'conflict');
        const laterMaterial = event.after.shapes.some(shape => {
          if (shape.recognized !== 'paint') return false;
          const before = event.before.shapes.find(row => row.id === shape.id), current = recipe.shapes.find(row => row.id === shape.id);
          const material = row => row && {raster: row.raster, paint: row.paint};
          return canonicalJson(material(before)) !== canonicalJson(material(shape)) && current &&
            canonicalJson(material(current)) !== canonicalJson(material(shape));
        });
        if (laterMaterial && !changes) return failure('paint_replay_unavailable', 'conflict');
        let before = event.before, after = event.after;
        if (changes) {
          const replayed = await replayPaintingChanges(recipe, changes, context);
          if (replayed.outcome) return replayed;
          recipe = replayed.recipe; before = clone(before); after = clone(after);
          for (const change of changes) {
            const following = after.shapes.find(shape => shape.id === change.id), prior = before.shapes.find(shape => shape.id === change.id);
            if (!prior) before.shapes.push(clone(following));
            else {prior.raster = following.raster; prior.paint = clone(following.paint);
              if (canonicalJson(event.before.shapes.find(shape => shape.id === change.id).paint?.px) !== canonicalJson(following.paint?.px)) prior.geom = clone(following.geom);}
          }
        }
        recipe = _rapierDrawUndoRecipe(recipe, before, after, later.map(row => ({before: row.before, after: row.after, act: row.entry})));
        if (!recipe) return failure('drawing_history_unavailable', 'conflict');
        if (alt === event.afterAlt && !later.some(row => row.beforeAlt !== row.afterAlt)) alt = event.beforeAlt;
      }
      if (canonicalJson(sansView(recipe)) === canonicalJson(sansView(current.recipe)) && alt === current.alt) continue;
      const rasterRefusal = await paintRastersHold(recipe, liveRecipe, context);
      if (rasterRefusal) return rasterRefusal;
      const svg = _rapierDrawBuildSVG(recipe);
      if (!svg) return failure('drawing_history_unavailable', 'conflict');
      const title = _rapierDrawNextAssetName([...documentAssets(source).assets.values(), ...assets]);
      const asset = await createAsset(encoder.encode(svg), null, {codec: 'image/svg+xml', title});
      const range = transportInterval(current.start, current.end, plan.splices);
      if (!range || plan.after.slice(range.start, range.end) !== current.raw) return failure('drawing_history_unavailable', 'conflict');
      const raw = '![' + alt + '][' + asset.label + ']', saved = sourceDrawing(source, current.asset), after = _rapierDrawReadRecipeFromSVGText(svg);
      additions.push({pos: range.start, removed: current.raw, inserted: raw});
      assets.push({id: normalizeLabel(asset.label), label: asset.label, url: asset.url, title: asset.title});
      replacedAssets.push(current.asset);
      if (saved && alt === current.alt) patches.push({patch: _rapierDrawRecipeDelta(liveRecipe, after),
        occurrence: {...(track.live?.occurrence || {}), start: current.start, end: current.end, reference: current.asset},
        targetOccurrence: {start: range.start, end: range.start + raw.length, reference: asset.label},
        asset: current.asset, reference: asset.label, assetGeneration: sha256(saved.asset.url),
        ...(track.live?.session ? {session: track.live.session, surfaceGeneration: track.live.surfaceGeneration} : {}),
        sourceRecipeBefore: current.recipe, sourceRecipeAfter: after, recipeBefore: liveRecipe, recipeAfter: after});
    }
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    for (const track of semantic) {
      const refused = drawBindingFailure({assetLabel: track.current.asset, ...drawingBinding(track.live)}, track.current);
      if (refused) return refused;
    }
    const authored = plan.splices.concat(additions.sort((a, b) => b.pos - a.pos)), text = transformSplices(source, authored);
    if (text == null) return failure('document_changed', 'conflict');
    const splices = authored.concat(imageDeletionSplices(source, text, authored, who.actor));
    const drawingPatch = !plan.splices.length && additions.length === 1 && patches.length === 1 ? patches[0] : null;
    return {splices, authoredCount: authored.length, drawAssets: assets,
      ...(assets.length === 1 ? {result: {replaced: replacedAssets[0], asset: {reference: assets[0].label, title: assets[0].title}}} : {}),
      ...(drawingPatch ? {drawingPatch,
      fence: {operation: 'document.draw', drawingAsset: drawingPatch.asset, shapesOnly: true, drawingPatch}} : {})};
  }

  async function paintInverse(entry, who, context, interleaved) {
    if (typeof host.paintReplay !== 'function' && typeof host.material !== 'function') return null;
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const plan = paintUndoPlan(source, entry, since(entry.revision), currentDrawing());
    if (!plan) return null;
    const live = drawingFor(plan.start, plan.end, plan.asset), binding = {assetLabel: plan.asset, ...drawingBinding(live)};
    // A human's open-layer publication is not a source splice. The textual inverse can still
    // fit while its whole-raster replacement would erase those later commands.
    const laterPaint = plan.changes.some(change => {
      const known = new Set(change.replay.entries.map(row => row.id));
      return plan.recipe.shapes.find(shape => shape.id === change.id)?.paint?.replay?.entries.some(row => !known.has(row.id));
    });
    if (!interleaved && !laterPaint) return null;
    const replayed = await replayPaintingChanges(plan.recipe, plan.changes, context);
    if (replayed.outcome) return replayed;
    const recipe = replayed.recipe;
    const rasterRefusal = await paintRastersHold(recipe, plan.recipe, context);
    if (rasterRefusal) return rasterRefusal;
    const svg = _rapierDrawBuildSVG(recipe);
    if (!svg) return failure('paint_replay_unavailable', 'conflict');
    const title = _rapierDrawNextAssetName(documentAssets(source).assets.values());
    const asset = await createAsset(encoder.encode(svg), null, {codec: 'image/svg+xml', title});
    cancelled(context);
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    const settled = drawBindingFailure(binding, {start: plan.start, end: plan.end});
    if (settled) return settled;
    const raw = '![' + plan.alt + '][' + asset.label + ']';
    const authored = [{pos: plan.start, removed: plan.raw, inserted: raw}];
    const changed = transformSplices(source, authored);
    if (changed == null) return failure('document_changed', 'conflict');
    // This is a new material result, not the old definition restored verbatim. Derive retirement
    // through the image owner before the ordinary Undo commit appends its replacement asset.
    const splices = authored.concat(imageDeletionSplices(source, changed, authored, who.actor));
    const saved = sourceDrawing(source, plan.asset), after = _rapierDrawReadRecipeFromSVGText(svg);
    const patch = after && _rapierDrawRecipeDelta(plan.recipe, after);
    if (!saved || !patch) return failure('paint_replay_unavailable', 'conflict');
    const drawingPatch = {patch,
      occurrence: {...(live?.occurrence || {}), start: plan.start, end: plan.end, reference: plan.asset},
      targetOccurrence: {start: plan.start, end: plan.start + raw.length, reference: asset.label},
      asset: plan.asset, reference: asset.label, assetGeneration: sha256(saved.asset.url),
      ...(binding.drawSession ? {session: binding.drawSession, surfaceGeneration: binding.surfaceGeneration} : {}),
      sourceRecipeBefore: plan.sourceRecipe, sourceRecipeAfter: after, recipeBefore: plan.recipe, recipeAfter: after};
    return {splices, authoredCount: 1, drawAssets: [{id: normalizeLabel(asset.label), label: asset.label, url: asset.url, title: asset.title}],
      drawingPatch,
      fence: {operation: 'document.draw', drawingAsset: plan.asset, shapesOnly: true,
        drawingPatch, paintTargets: plan.changes.map(change => plan.recipe.shapes.find(shape => shape.id === change.id))},
      result: {replaced: plan.asset, asset: {reference: asset.label, title}}};
  }

  function sameHistoryAuthor(left, right) {
    return (left.author?.kind || left.actor) === (right.author?.kind || right.actor) &&
      (left.author?.id || left.principal) === (right.author?.id || right.principal);
  }

  function turnChanges(name, changes = state.journal) {
    const entries = changes.filter(row => row.turnId === name);
    if (!entries.length) return failure('act_unavailable', 'target_gone');
    // A turn identifier has one canonical author scope. Never choose a colliding scope by label.
    if (entries.some(row => !sameHistoryAuthor(row, entries[0]))) return failure('turn_ambiguous', 'conflict');
    if (!since(Math.min(...entries.map(row => row.baseRevision)))) return failure('history_unavailable', 'conflict');
    return entries;
  }

  // The existing journal supplies every inverse. Preview all of them against temporary source before one commit.
  function inverseTurn(entries) {
    const plan = inversePlan(entries);
    return plan.ok ? plan.splices : plan;
  }

  function undoHistoryAct(target, context = {}, snapshot) {
    const run = async () => {
      cancelled(context);
      if (snapshot) {
        if (snapshot.documentId !== state.documentId || snapshot.revision !== state.revision ||
            snapshot.text !== state.text || !Array.isArray(snapshot.journal)) return failure('document_changed', 'conflict');
        let rows, projection;
        try {
          if (!snapshot.journal.every(validSnapshotJournalRow)) return failure('history_invalid', 'conflict');
          const history = journalHistory(snapshot.journal, state.text, snapshot.historyComplete ?? state.history.complete);
          projection = historyProjection(history, {from: 0, to: 0});
          if (!projection.ok) return failure(projection.reason, 'conflict');
          if (!validCommentHistory(history, snapshot.journal)) return failure('history_invalid', 'conflict');
          rows = snapshot.journal.map(row => {
            const who = participant(row, mintId);
            return {...clone(row), ...who, owner: ownerOf(who), createdAt: row.createdAt ?? null,
              label: row.label ?? null, sourceTransactionId: row.sourceTransactionId || null};
          });
        } catch (_) { return failure('history_invalid', 'conflict'); }
        const retained = new Map(state.journal.map(row => [row.id, row]));
        // Keep optional live drawing metadata only where the source identity is proved unchanged.
        state.journal = rows.map(row => {
          const prior = retained.get(row.id);
          return prior && canonicalJson(prior.splices) === canonicalJson(row.splices) ? {...prior, ...row} : row;
        });
        state.history.earliestRevision = projection.earliestRevision;
        state.history.complete = projection.complete;
      }
      const requested = typeof target === 'string' ? {actId: target} : target || {};
      const entry = requested.actId ? state.journal.find(row => row.id === requested.actId)
        : requested.turnId ? state.journal.findLast(row => row.turnId === requested.turnId &&
          (!requested.actorId || row.author?.id === requested.actorId)) : null;
      if (!entry) return failure('act_unavailable', 'target_gone');
      if (requested.actorId && entry.author?.id !== requested.actorId) return failure('act_unavailable', 'target_gone');
      return undo(requested.turnId ? {turn_id: requested.turnId} : {change_id: entry.id},
        participant({actor: 'human', principal: 'local', transport: 'platform'}, mintId), context);
    };
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function undo(input, who, context) {
    const retainedBinding = typeof host.drawingPresentationBinding === 'function' ? host.drawingPresentationBinding() : undefined;
    const presentationBinding = retainedBinding === undefined ? drawingPresentationBinding() : retainedBinding;
    if (input.turn_id && input.change_id) return failure('change_target_ambiguous', 'invalid');
    const changes = state.journal;
    const group = input.turn_id ? turnChanges(input.turn_id, changes) : null;
    if (group?.outcome) return group;
    const entry = input.change_id ? changes.find(row => row.id === input.change_id) : group?.at(-1);
    if (!entry) return failure('act_unavailable', 'target_gone');
    const selectedIds = new Set((group || [entry]).map(row => row.id));
    const commentEntries = [], commentRestorations = [];
    if (state.text.includes('<!-- md-comments:v1 ') || (group || [entry]).some(row =>
        row.splices.some(splice => splice.removed.includes('<!-- md-comments:v1 ') || splice.inserted.includes('<!-- md-comments:v1 ')))) {
      const effects = historyEffects(journalHistory().records);
      if (!effects.ok) return failure('history_invalid', 'conflict');
      for (const row of group || [entry]) {
        if (!effects.active.has(row.id)) continue;
        const before = sourceBefore(journalHistory(), row.id);
        if (!before.ok) return failure(before.reason, 'conflict');
        const afterSource = transformSplices(before.source, row.splices);
        if (afterSource == null) return failure('history_invalid', 'conflict');
        const change = {entry: row, beforeSource: before.source, afterSource, later: since(row.revision), selectedIds};
        const discussionChanges = commentChanges(before.source, afterSource);
        if (discussionChanges === null) return failure('change_interleaved', 'conflict');
        if (discussionChanges.length) commentEntries.push(change);
        if (row.derivedCommentIndex != null) commentRestorations.push(change);
      }
    }
    // Thread wrappers belong to the semantic owner even when an inverse or imported act
    // authored them. Retain only their hunks; unrelated source in that act still reverses.
    const commentIds = new Set(commentEntries.concat(commentRestorations.filter(change =>
      change.entry.sourceTransactionId || change.entry.sourceTransactionIds?.length)).map(change => change.entry.id));
    const keepComments = ({actId, beforeSource, splice}) => {
      if (!commentIds.has(actId)) return false;
      const afterSource = transformSplices(beforeSource, [splice]);
      return [[beforeSource, splice.removed], [afterSource, splice.inserted]].some(([source, text]) => {
        if (source == null) return true;
        const parsed = parseComments(source), record = parsed.record;
        return !!(parsed.reason || record && (text.length ? splice.pos < record.end && splice.pos + text.length > record.start
          : splice.pos > record.start && splice.pos < record.end));
      });
    };
    const commentOptions = commentIds.size ? {keepHunk: keepComments, ...(commentEntries.length
      ? {splitSplice: ({beforeSource, splice}) => commentSpliceParts(beforeSource, splice)} : {})} : undefined;
    const plan = inversePlan(group || [entry], commentOptions);
    if (plan.ok && plan.unchanged) return {outcome: 'unchanged', act: null, sourceChanged: false, editCount: 0};
    let splices = plan.ok ? plan.splices : plan, painting = null, drawingTracks = [];
    if (plan.ok && (state.text.includes('data:image/svg+xml;base64,') || (group || [entry]).some(row => row.drawingPatch))) {
      try { drawingTracks = drawingHistory(group || [entry]); painting = await drawingInverse(group || [entry], drawingTracks, who, context, commentOptions); }
      catch (error) { cancelled(context); return failure(error?.message === 'paint_replay_unavailable' ? error.message : 'drawing_history_unavailable', 'conflict'); }
      if (painting?.outcome) return painting;
      if (painting) splices = painting.splices;
    }
    if (!painting && !(group?.length > 1) && entry.operation === 'document.draw' && (!splices.outcome || splices.reason === 'change_interleaved')) {
      try { painting = await paintInverse(entry, who, context, !!plan.overlaps?.length || splices.reason === 'change_interleaved'); }
      catch { cancelled(context); return failure('paint_replay_unavailable', 'conflict'); }
      if (painting?.outcome) return painting;
      if (painting) splices = painting.splices;
    }
    if (splices.outcome) return splices;
    // The exact source inverse reuses the original semantic change. Material replay has already
    // built its own verified change against the live recipe, preserving the person's later paint.
    let drawingPatch = null;
    // One member's drawing delta is the whole inverse only when the name holds that one change; a longer name returns its source whole.
    if (entry.drawingPatch && splices.length && !painting && !(group?.length > 1)) {
      const original = drawingPatchForEntry(entry);
      if (!original) return failure('drawing_history_unavailable', 'conflict');
      const saved = sourceDrawing(state.text, original.reference);
      if (!saved) return failure('target_changed', 'conflict');
      const prior = sourceBefore(journalHistory(), entry.id), later = since(entry.revision);
      const tracked = drawingTracks.find(track => track.events.some(event => event.chosen && event.entry.id === entry.id) &&
        normalizeLabel(track.current.asset) === normalizeLabel(original.reference) &&
        canonicalJson(track.current.recipe) === canonicalJson(original.sourceRecipeAfter));
      const current = later && transportInterval(original.targetOccurrence.start, original.targetOccurrence.end, later.flatMap(row => row.splices)) || tracked?.current;
      const target = transformSplices(state.text, splices);
      if (!prior.ok || !current || target == null) return failure('drawing_history_unavailable', 'conflict');
      const occurrence = {pos: current.start, removed: state.text.slice(current.start, current.end),
        inserted: prior.source.slice(original.occurrence.start, original.occurrence.end)};
      const replaced = transformSplices(state.text, [occurrence]);
      if (replaced == null) return failure('drawing_history_unavailable', 'conflict');
      // The source planner may split a hashed reference into character hunks. Present the
      // same exact result as one occurrence replacement so the existing semantic fence can prove it.
      const beforeComments = parseComments(replaced), afterComments = parseComments(target);
      let remainder;
      if (beforeComments.record && afterComments.record && beforeComments.record.raw === afterComments.record.raw) {
        // Compact each side separately: spanning an untouched footer would hide the
        // source edit from its derived-anchor owner and leave its body fingerprint stale.
        const tail = minimalSplice(replaced.slice(beforeComments.record.end), target.slice(afterComments.record.end));
        remainder = [{...tail, pos: beforeComments.record.end + tail.pos},
          minimalSplice(replaced.slice(0, beforeComments.record.start), target.slice(0, afterComments.record.start))];
      } else remainder = [minimalSplice(replaced, target)];
      splices = [occurrence, ...remainder.filter(row => row.removed || row.inserted)];
      drawingPatch = {undo: original.undo !== true, patch: _rapierDrawRecipeDelta(original.recipeAfter, original.recipeBefore),
        occurrence: clone(original.targetOccurrence), targetOccurrence: clone(original.occurrence),
        asset: original.reference, reference: original.asset, assetGeneration: sha256(saved.asset.url),
        sourceRecipeBefore: clone(original.sourceRecipeAfter), sourceRecipeAfter: clone(original.sourceRecipeBefore),
        recipeBefore: clone(original.recipeAfter), recipeAfter: clone(original.recipeBefore)};
    }
    const inversePatch = painting?.drawingPatch || drawingPatch;
    const reversedIds = plan.sourceTransactionIds || (group || [entry]).map(row => row.id);
    const result = await commit(splices, who, context, 'document.undo', {
      label: `Undo ${entry.label || entry.operation}`, metadataDelta: plan.metadata,
      commentInverses: commentEntries.slice().reverse(), commentRestorations: commentRestorations.slice().reverse(),
      sourceTransactionId: reversedIds.length === 1 ? reversedIds[0] : null,
      ...(reversedIds.length ? {sourceTransactionIds: reversedIds} : {}), restores: true, editCount: splices.length,
      ...(inversePatch ? {drawingPresentation: {...presentationBinding, presentation: {open: false, replay: false},
        reference: inversePatch.reference}} : {}),
      ...(painting ? {authoredCount: painting.authoredCount, drawAssets: painting.drawAssets, fence: painting.fence, drawingPatch: painting.drawingPatch}
        : drawingPatch ? {drawingPatch, fence: {operation: 'document.draw', drawingAsset: drawingPatch.asset,
          shapesOnly: true, drawingPatch}} : {}),
    });
    if (result.outcome === 'applied' || result.outcome === 'unchanged') {
      result.undoneChangeId = entry.id;
      if (group) result.undoneChangeIds = group.map(row => row.id);
      if (painting) Object.assign(result, painting.result);
    }
    return result;
  }

  function buildComparison(baseline, incoming, name, who) {
    if (bytes(baseline) + bytes(incoming) > LIMITS.compareBytes) return failure('compare_byte_limit');
    const lines = (baseline.match(/\n/g)?.length || 0) + (incoming.match(/\n/g)?.length || 0);
    if (lines > LIMITS.compareLines) return failure('compare_line_limit');
    const parts = diffLines(baseline, incoming, { maxEditLength: 20000 });
    if (!parts) return failure('compare_too_complex');
    const changes = [];
    let position = 0, incomingPosition = 0, removed = '', inserted = '', start = 0, incomingStart = 0;
    const flush = () => {
      if (!removed && !inserted) return;
      const change = minimalSplice(removed, inserted);
      changes.push({ id: mintId('diff_'), start: start + change.pos, end: start + change.pos + change.removed.length,
        incomingStart: incomingStart + change.pos, incomingEnd: incomingStart + change.pos + change.inserted.length,
        removed: change.removed, inserted: change.inserted });
      removed = ''; inserted = '';
    };
    for (const part of parts) {
      if (!part.added && !part.removed) { flush(); position += part.value.length; incomingPosition += part.value.length; continue; }
      if (!removed && !inserted) { start = position; incomingStart = incomingPosition; }
      if (part.removed) { removed += part.value; position += part.value.length; }
      else { inserted += part.value; incomingPosition += part.value.length; }
    }
    flush();
    if (changes.length > LIMITS.compareChanges) return failure('compare_change_limit');
    return { id: mintId('compare_'), owner: ownerOf(who), documentId: state.documentId, revision: state.revision,
      baseline, incoming, name: clip(name || 'Comparison.md', 512), changes, createdAt: now() };
  }

  function comparisonFields() {
    if (!state.compare) return null;
    const fields = {
      compareId: state.compare.id, name: state.compare.name,
      ...(state.compare.turnId ? {turn_id: state.compare.turnId} : {}),
      changes: state.compare.changes.length,
      items: [], remaining: state.compare.changes.length,
      enumerate: {tool: 'document.find', arguments: {scope: 'comparison', query: ''}},
    };
    for (const row of state.compare.changes) {
      const item = {change_id: row.id, removed_chars: row.removed.length, inserted_chars: row.inserted.length,
        preview: clip(row.inserted ? disclose(state.compare.incoming, row.incomingStart, row.incomingEnd).text
          : disclose(state.compare.baseline, row.start, row.end).text, 96)};
      if (bytes(JSON.stringify(stamp({...fields, items: [...fields.items, item]}))) > LIMITS.resultBytes - 1024) break;
      fields.items.push(item); fields.remaining--;
    }
    return fields;
  }

  const comparisonContext = () => {
    const fields = comparisonFields();
    return fields ? accepted(fields) : failure('compare_not_open');
  };

  async function compareText(input, who, context, baseline = state.text) {
    const invalid = admissibleText(input.text);
    if (invalid) return failure(invalid, 'invalid');
    if (state.compare && who.actor !== 'human' && state.compare.owner !== ownerOf(who)) return failure('compare_not_owned');
    const compared = buildComparison(baseline, input.text, input.name, who);
    if (compared.outcome) return compared;
    const presentation = {presentation: {status: 'unconfirmed', acknowledged: false}};
    if (typeof host.compare === 'function') {
      const result = await host.compare({ documentId: state.documentId, revision: state.revision, compareId: compared.id,
        currentText: baseline, incomingText: input.text, currentName: state.filename, incomingName: compared.name,
        ...who, signal: context.signal });
      if (!result?.ok) return failure(result?.reason || 'compare_open_refused');
      presentation.presentation = {status: result.pending ? 'pending' : result.presented === true || result.visible === true ? 'presented' : 'unconfirmed',
        acknowledged: result.presented === true || result.visible === true, ...(result.viewId ? {id: result.viewId} : {})};
    }
    state.compare = compared;
    // Remote editors consume the comparison asynchronously. No local acknowledgement means unknown, not hidden.
    return { ...comparisonContext(), mode: 'alternative', sourceChanged: false, ...presentation };
  }

  // One presentation owner. A retried key with a different action or target collides.
  async function compareAction(input, who, context) {
    const action = input.action || 'open';
    if (action === 'open') return compareText(input, who, context);
    if (action === 'close') {
      if (!state.compare) return failure('compare_not_open');
      if (input.compare_id && input.compare_id !== state.compare.id) return failure('compare_changed', 'conflict');
      if (who.actor !== 'human' && state.compare.owner !== ownerOf(who)) return failure('compare_not_owned');
      let closed = null;
      if (typeof host.closeCompare === 'function') {
        closed = await host.closeCompare({ documentId: state.documentId, ...who, signal: context.signal });
        if (!closed?.ok) return failure(closed?.reason || 'compare_close_refused');
      }
      state.compare = null;
      return accepted({closed: true, mode: 'closed', sourceChanged: false, presentation: {status: closed?.closed === true ? 'closed' : closed?.pending ? 'pending' : 'unconfirmed', acknowledged: closed?.closed === true}});
    }
    return failure('action_invalid', 'invalid');
  }

  function getComparisonChange(id) {
    if (!state.compare) return failure('compare_not_open');
    return changeOf(id) || failure('change_missing', 'target_gone');
  }

  function readChange(input, who, cursor = null) {
    const row = getComparisonChange(input.change_id);
    if (row.outcome) return row;
    const compared = state.compare, source = row.removed + row.inserted, total = source.length;
    const start = cursor?.offset || 0, limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars);
    let end = Math.min(total, start + limit);
    while (!safeBoundary(source, end)) end--;
    const cursorId = mintId('compare_read_');
    const page = fitReadPage(source, start, end, until => {
      const removedStart = Math.min(start, row.removed.length), removedEnd = Math.min(until, row.removed.length);
      const insertedStart = Math.max(0, start - row.removed.length), insertedEnd = Math.max(0, until - row.removed.length);
      const removed = disclose(compared.baseline, row.start + removedStart, row.start + removedEnd);
      const inserted = disclose(compared.incoming, row.incomingStart + insertedStart, row.incomingStart + insertedEnd);
      const omissions = [...removed.omissions, ...inserted.omissions];
      const redacted = cursor?.redacted === true || omissions.length > 0;
      return stamp(accepted({kind: 'comparison', change_id: row.id, compareId: compared.id, start: row.start, end: row.end,
        removed: removed.text, inserted: inserted.text, removed_start: removedStart, removed_end: removedEnd,
        inserted_start: insertedStart, inserted_end: insertedEnd, removed_chars: row.removed.length, inserted_chars: row.inserted.length,
        complete: until === total && !redacted, remaining: total - until,
        coverage: {disclosed: redacted ? cursor?.disclosed || 0 : until, chars: total, complete: until === total && !redacted},
        ...(redacted ? {reason: 'source_redacted'} : {}), ...(omissions.length ? {omissions, omissionCount: omissions.length} : {}),
        next_cursor: until < total ? cursorId : null, expires_in_ms: LIMITS.lifetimeMs}));
    });
    if (!page) return failure('result_over_budget', 'refused', {complete: false});
    const next = page.end < total ? mint('cursors', 'compare_read_', {kind: 'compare-read', compareId: compared.id,
      changeId: row.id, revision: state.revision, offset: page.end, redacted: page.result.reason === 'source_redacted',
      disclosed: page.result.coverage.disclosed}, who, cursorId) : null;
    if (cursor) delete state.cursors[cursor.id];
    return {...page.result, next_cursor: next?.id || null};
  }

  // document.find returns change handles directly: one match shape, in comparison order.
  function findInComparison(input, who) {
    if (!state.compare) return failure('compare_not_open');
    if (typeof input.query !== 'string' || input.query.length > 512) return failure('query_invalid', 'invalid');
    let offset = 0;
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'compare' || cursor.compareId !== state.compare.id || cursor.query !== input.query) return failure('compare_changed', 'conflict');
      offset = cursor.offset;
    }
    const needle = input.query.toLowerCase();
    const found = state.compare.changes.filter(row => row.removed.toLowerCase().includes(needle) || row.inserted.toLowerCase().includes(needle));
    const page = found.slice(offset, offset + bounded(input.limit, 8, 1, 16)), end = offset + page.length;
    const next = end < found.length ? mint('cursors', 'compare_', { kind: 'compare', compareId: state.compare.id,
      query: input.query, offset: end }, who) : null;
    return accepted({scope: 'comparison',
      matches: page.map(row => {
        const preview = clip(row.inserted ? disclose(state.compare.incoming, row.incomingStart, row.incomingEnd).text
          : disclose(state.compare.baseline, row.start, row.end).text, 160);
        const change = changeOf(row.id);
        return {
          matched: preview, handle: row.id, snippet: preview,
          start: change ? change.start : 0, end: change ? change.end : 0,
          handle_scope: 'change',
        };
      }),
      remaining: found.length - end, next_cursor: next?.id || null, complete: !next?.id,
    });
  }

  async function showChanges(input, who, context) {
    if (input.turn_id && input.change_id) return failure('change_target_ambiguous', 'invalid');
    const changes = state.journal;
    const entry = input.change_id ? changes.find(row => row.id === input.change_id)
      : input.turn_id ? changes.filter(row => row.turnId === input.turn_id).at(-1) : changes.at(-1);
    if (!entry) return failure('act_unavailable', 'target_gone');
    const turnId = input.turn_id;
    const group = turnId ? turnChanges(turnId, changes) : null;
    if (group?.outcome) return group;
    const splices = group ? inverseTurn(group) : inverse(entry);
    if (splices.outcome) return splices;
    const baseline = transformSplices(state.text, splices);
    if (baseline == null) return failure('change_interleaved', 'conflict');
    const result = await compareText({ text: state.text, name: turnId || state.filename }, who, context, baseline);
    if (result.outcome !== 'ok' || state.compare?.id !== result.compareId) return result;
    state.compare.changeId = entry.id;
    if (group) { state.compare.turnId = turnId; state.compare.changeIds = group.map(row => row.id); }
    return {...result, mode: 'applied_changes', acts: (group || [entry]).map(publicAct)};
  }

  async function exportDocument({format, compare_id}, who, context) {
    if (typeof host.exportFile !== 'function') return failure('export_unavailable');
    const snapshot = readSnapshot(), text = snapshot.text, compared = compare_id ? state.compare : null;
    let base;
    if (compare_id) {
      if (format !== 'html') return failure('compare_export_format_invalid', 'invalid');
      if (!compared) return failure('compare_not_open');
      if (compared.id !== compare_id) return failure('compare_changed', 'conflict');
      if (compared.owner !== ownerOf(who)) return failure('compare_not_owned');
      if (compared.documentId !== snapshot.documentId || compared.revision !== snapshot.revision)
        return failure('compare_changed', 'conflict');
      if (compared.detached || compared.baseline !== text && compared.incoming !== text)
        return failure('comparison_not_current_document', 'conflict');
      // Export the current source unchanged. The other side is display data, never edit authority.
      const reference = compared.incoming === text ? compared.baseline : compared.incoming;
      base = readBase({text: reference, sha256: sha256(reference), revision: String(compared.revision),
        name: snapshot.filename, by: agentLabel(who.agent).replace(/[\u0000-\u001f\u007f]/g, ' ') || 'An agent',
        at: new Date(compared.createdAt).toISOString()});
    }
    const exportCurrent = () => sameReadSnapshot(snapshot) && !documentGuardFailure(context) &&
      (!compared || state.compare?.id === compare_id && state.compare.documentId === snapshot.documentId && state.compare.revision === snapshot.revision);
    const request = {kind: 'export', documentId: state.documentId, revision: state.revision, format, filename: state.filename}, docKind = state.docKind;
    let checked;
    // Word and PDF are the open editor's: the request goes out as a surface fact, and the editor's answer returns in the world,
    // admitted against this exact document, revision, format and name before any host retains a byte.
    if (format === 'docx' || format === 'pdf') {
      const mode = 'export:' + format;
      if (context.continues) {
        const invalid = checkContinuation(context, mode);
        if (invalid) return invalid;
        pendingFacts.delete(context.continues);
      }
      if (!context.world?.export) {
        const requestId = mintId('fact_');
        pendingFacts.set(requestId, {documentId: state.documentId, revision: state.revision, mode, requirements: request});
        while (pendingFacts.size > LIMITS.invocationKeys) pendingFacts.delete(pendingFacts.keys().next().value);
        return {outcome: 'pending', reason: 'surface_fact_required', pending: {kind: 'surface-fact', requestId, requirements: request}};
      }
      checked = admitExportArtifact(request, context.world.export);
      if (!checked.bytes) return failure(checked.reason || 'export_unavailable', 'refused', {
        ...(checked.reason === 'editor_unavailable' ? {availableFormats: ['markdown', 'html', 'txt', 'page']} : {}),
        ...(safeInt(checked.limitBytes) ? {limitBytes: checked.limitBytes} : {}), ...(safeInt(checked.byteLength) ? {bytes: checked.byteLength} : {})});
    }
    if (documentGuardFailure(context)) return documentGuardFailure(context);
    let file;
    try {file = await host.exportFile({...request, docKind, text, guard: exportCurrent,
      ...(base ? {base, compareId: compare_id} : {}), signal: context.signal, ...(checked ? {file: checked, artifact: context.world.export.artifact} : {})});}
    catch {return failure('export_unconfirmed', 'uncertain', {sourceChanged: false, sourceRevision: request.revision, sourceDocumentId: request.documentId, artifact: {status: 'unconfirmed'}});}
    if (file?.outcome === 'uncertain') return failure(file.reason || 'export_unconfirmed', 'uncertain',
      {sourceChanged: false, sourceRevision: request.revision, sourceDocumentId: request.documentId, artifact: {status: 'unconfirmed'}});
    if (!file?.bytes) return failure(file?.reason || 'export_unavailable', 'refused', {
      ...(safeInt(file?.limitBytes) ? {limitBytes: file.limitBytes} : {}), ...(safeInt(file?.byteLength) ? {bytes: file.byteLength} : {})});
    if (file.bytes.byteLength > MAX_EXPORT_BYTES) return failure('export_too_large', 'refused', {limitBytes: MAX_EXPORT_BYTES, bytes: file.bytes.byteLength});
    return accepted({artifactCreated: true, sourceChanged: false, sourceRevision: request.revision, sourceDocumentId: request.documentId,
      artifact: {status: 'created', sourceRevision: request.revision, sourceDocumentId: request.documentId, destination: file.destination || (file.url?.startsWith('blob:') ? 'local_session' : 'hosted_export'),
        ...(file.expiresAt ? {expiresAt: new Date(file.expiresAt).toISOString()} : {})}, format, filename: file.name, mimeType: file.mimeType, bytes: file.bytes.byteLength, limitBytes: MAX_EXPORT_BYTES,
      fidelity: file.fidelity || exportFidelity(format, docKind),
      ...(file.id ? {exportId: file.id} : {}), ...(file.url ? {downloadUrl: file.url} : {}),
      ...(file.expiresAt ? {exportExpiresAt: new Date(file.expiresAt).toISOString()} : {}),
      ...(safeInt(file.pages) ? {pages: file.pages} : {}), ...(Array.isArray(file.issues) ? {issues: file.issues} : {})});
  }

  async function openText(input, who, context) {
    if (input.expected_document_id !== state.documentId || input.expected_revision !== state.revision)
      return failure('document_changed', 'conflict');
    const priorDocumentId = state.documentId, priorRevision = state.revision, priorText = state.text;
    const filename = input.filename || state.filename, kind = input.docKind || (input.filename ? documentKind(filename) : state.docKind);
    if (!validName(filename) || !['markdown', 'text', 'code'].includes(kind)) return failure('filename_invalid', 'invalid');
    const invalid = admissibleText(input.text);
    if (invalid) return failure(invalid, 'invalid');
    if (who.actor === 'agent' && state.docKind === 'markdown' && kind !== 'markdown' && parseWill(state.text).present) {
      return failure('document_law', 'refused', { law: 'keep', rule: 'carrier_changed', start: 0, end: state.text.length });
    }
    const splice = minimalSplice(state.text, input.text), splices = splice.removed || splice.inserted ? [splice] : [];
    if (who.actor === 'agent' && state.docKind === 'markdown' && touchesCommentRecord(state.text, splices, kind)) return failure('comments_record');
    const result = await commit(splices, who, context, 'document.replace', {
      label: input.label ?? 'Replace document', turnId: input.turn_id, metadata: {filename, docKind: kind},
      metadataAssignments: [...(Object.hasOwn(input, 'filename') ? ['filename'] : []), ...(Object.hasOwn(input, 'docKind') ? ['docKind'] : [])],
    });
    if (['applied', 'unchanged'].includes(result.outcome)) {
      state.filename = filename; state.docKind = kind; state.handles = {}; state.refs = {}; state.cursors = {}; state.compare = null; outlineCache = null;
    }
    return {...result, ...(result.outcome === 'uncertain' ? {} : {sourceChanged: ['applied', 'rebased'].includes(result.outcome) ? state.text !== priorText : false}), identityChanged: false,
      previousDocument: {documentId: priorDocumentId, revision: priorRevision, retention: 'document_history'}, filename, docKind: kind};
  }

  function drawingReceipt(result) {
    const committed = ['applied', 'rebased', 'unchanged'].includes(result.outcome);
    const states = ['incorporated', 'presentation_deferred', 'unavailable', 'uncertain'];
    const supplied = result.presentation?.status || result.presentation;
    const intent = state.journal.find(row => row.id === result.changeId)?.drawingIntent;
    const presentation = intent?.status === 'unavailable' ? 'unavailable' : states.includes(supplied) ? supplied : committed &&
      Object.values(state.humanContexts).some(row => row.visible && row.expiresAt > now()) ? 'presentation_deferred' : 'unavailable';
    return {...result, receipt: {...(result.reason === 'cancelled' ? {landed: 0} : {}), state: result.reason === 'cancelled' ? 'cancelled' : committed ? 'committed' : result.outcome === 'pending' && result.pending?.requirements?.kind === 'material' ? 'accepted' : result.outcome === 'uncertain' ? 'uncertain' : 'unavailable',
      presentation: result.outcome === 'uncertain' ? 'uncertain' : presentation}};
  }

  // Typed picture handles select their owner; creation uses an ordinary source placement.
  async function drawPicture(input, who, context) {
    if (state.docKind !== 'markdown') return failure('draw_requires_markdown', 'invalid');
    if (changeOf(input.recipe_handle) || changeOf(input.svg_handle) || changeOf(input.context_handle)) return failure('context_handle_wrong_kind', 'invalid');
    const retained = typeof host.drawingPresentationBinding === 'function' ? host.drawingPresentationBinding() : undefined;
    context = {...context, drawingPresentation: {binding: retained === undefined ? drawingPresentationBinding() : retained,
      presentation: {open: input.presentation?.open !== false, replay: input.presentation?.replay !== false}}};
    return drawingReceipt(await (input.kind === 'edit' ? drawEdit(input, who, context) : drawCreate(input, who, context)));
  }

  // The hosted painter asks the connected editor for private material. The returned value
  // passes the same recipe, raster and commit owners as local paint; it grants no read or write authority.
  async function prepareMaterial(task, payload, context) {
    const request = materialRequest(state, task, payload, currentDrawing());
    cancelled(context);
    const fact = await host.material(request, {signal: context.signal});
    cancelled(context);
    if (!materialMatches(request, state, currentDrawing())) return {refusal: failure('document_changed', 'conflict')};
    if (fact == null) {
      const requestId = mintId('fact_');
      return {refusal: {outcome: 'pending', reason: 'surface_fact_required', pending: {kind: 'surface-fact', requestId,
        requirements: materialDescription(request)}}};
    }
    const result = admitMaterialResult(request, fact);
    return result.outcome === 'ok' ? {value: result.value} : {refusal: failure(result.reason)};
  }

  // Paint figures carry strokes; Water figures carry mode and actions. The host returns the material shape the recipe keeps.
  // Only the kernel supplies the inspected recipe used to resolve Trace sources.
  async function paintFigures(list, context, field = 'figures', recipe = null, replace = false) {
    if (!Array.isArray(list) || !list.some(row => row?.kind === 'paint')) return { list };
    if (typeof host.paint !== 'function' && typeof host.material !== 'function') return { refusal: failure('paint_unavailable') };
    const out = [];
    for (const [index, row] of list.entries()) {
      if (row?.kind !== 'paint') { out.push(row); continue; }
      const { kind, strokes, id, seed = 1, mode, actions, paper, ...rest } = row;
      const at = field + '[' + index + ']';
      if (Object.keys(rest).length) return { refusal: failure('paint_strokes_invalid', 'invalid', {field: at + '.' + Object.keys(rest)[0]}) };
      if (own(row, 'mode') && mode !== 'water') return { refusal: failure('paint_strokes_invalid', 'invalid', {field: at + '.mode'}) };
      const water = mode === 'water';
      if (water ? strokes != null : actions != null || paper != null) return { refusal: failure('paint_strokes_invalid', 'invalid', {field: at + '.' + (water ? 'strokes' : actions != null ? 'actions' : 'paper')}) };
      if (!Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) return { refusal: failure('paint_strokes_invalid', 'invalid', {field: at + '.seed'}) };
      const target = replace ? recipe?.shapes.find(shape => shape.id === id && shape.recognized === 'paint') || null : null;
      if (replace && !target) return {refusal: failure('paint_target_invalid', 'invalid', {field: at + '.id'})};
      if (target?.locked) return {refusal: failure('paint_target_locked', 'refused', {field: at + '.id'})};
      let shape = null;
      cancelled(context);
      try {
        const options = {seed, target, contribution: mintId('paint_'),
          ...(water ? {mode, actions, ...(paper != null ? {paper} : {}), ...(recipe ? {recipe} : {})} : {})};
        if (typeof host.material === 'function') {
          const prepared = await prepareMaterial('paint', {position: at, strokes: water ? null : strokes, ...options}, context);
          if (prepared.refusal) return {refusal: prepared.refusal.reason === 'paint_strokes_invalid'
            ? failure('paint_strokes_invalid', 'invalid', {field: at + (water ? '.actions' : '.strokes')}) : prepared.refusal};
          shape = prepared.value;
        } else shape = await host.paint(water ? null : strokes, {...options, signal: context.signal});
      }
      catch (error) {
        cancelled(context);
        return {refusal: failure(error?.code || 'paint_strokes_invalid', error?.code === 'paint_target_changed' ? 'conflict' : ['paint_history_full','paint_layer_full','water_webgpu_unavailable','WATER_BUDGET','WATER_REPLAY_BUDGET','WATER_GPU_MEMORY','WATER_GPU_FAILED','WATER_DEVICE_LOST'].includes(error?.code) ? 'refused' : 'invalid')};
      }
      cancelled(context);
      if (!shape) return { refusal: failure('paint_strokes_invalid', 'invalid', {field: at + (water ? '.actions' : '.strokes')}) };
      out.push(id == null ? shape : { ...shape, id });
    }
    return { list: out };
  }

  async function paintOperations(operations, context, recipe) {
    const out = [];
    for (const [index, operation] of (operations || []).entries()) {
      if (operation.type !== 'create') { out.push(operation); continue; }
      const painted = await paintFigures(operation.figures, context, 'operations[' + index + '].figures', recipe);
      if (painted.refusal) return painted;
      out.push({...operation, figures: painted.list});
    }
    return {list: out};
  }

  // A paint shape that keeps strokes is replayed on the open drawing on the sheet it names; that sheet must be the one
  // the engine lays for those strokes, checked before the document keeps it, on create and on patch. A host without the
  // engine keeps no strokes layer at all.
  function paintSheetsHold(recipe) {
    for (const shape of recipe?.shapes || []) {
      if (shape?.recognized !== 'paint' || shape.paint?.mode !== 'water' && shape.paint?.strokes == null && shape.paint?.replay == null) continue;
      if (typeof host.paintSheet !== 'function' || host.paintSheet(shape.paint) !== true) return false;
    }
    return true;
  }

  async function paintRastersHold(recipe, previous, context) {
    const rasters = value => (value?.shapes || []).flatMap(shape => shape.recognized === 'paint'
      ? [shape.raster, shape.paint?.replay?.baseRaster].filter(Boolean) : []);
    const kept = new Set(rasters(previous)), added = [...new Set(rasters(recipe))].filter(raster => !kept.has(raster));
    if (!added.length) return null;
    if (typeof host.paintRaster !== 'function') return failure('paint_raster_decoder_unavailable');
    const source = state.text, revision = state.revision, documentId = state.documentId;
    try {
      for (const raster of added) {
        cancelled(context);
        if (await host.paintRaster(raster, {signal: context.signal}) !== true) return failure('paint_raster_decoder_unavailable');
      }
    } catch (error) {
      cancelled(context);
      return error?.code === 'paint_raster_decoder_unavailable' ? failure(error.code) : failure('paint_raster_invalid', 'invalid');
    }
    cancelled(context);
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    return null;
  }

  async function drawCreate(input, who, context) {
    if (input.shapes != null) return failure('draw_create_patch_conflict', 'invalid');
    if (input.recipe != null && input.figures != null) return failure('draw_recipe_figures_conflict', 'invalid');
    if (input.recipe?.figures != null && input.direction != null && input.recipe.direction != null && input.direction !== input.recipe.direction) return failure('draw_direction_conflict', 'invalid');
    if (typeof input.alt !== 'string' || !input.alt.trim()) return failure('draw_alt_required', 'invalid');
    // Placement and drawing authority belong to this source, before any asynchronous preparation.
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const assets = documentAssets(state.text);
    let position = assets.appendixStart, held = null, rebased = false, heldOffset = 0;
    if (input.context_handle) {
      held = lookup('handles', input.context_handle, who);
      if (held.outcome) return held;
      if (held.kind === 'svg' || held.kind === 'image-comment') return failure('context_handle_wrong_kind', 'invalid');
      const range = relocate(held);
      if (range.outcome) return range;
      const facts = await outline(context);
      if (facts.outcome) return facts;
      const blocks = facts.blocks?.entries || [];
      const touched = blocks.filter(row => range.start === range.end
        ? row.start <= range.end && range.end < row.end : row.start < range.end && range.start < row.end);
      if (!touched.length) return failure(facts.blocks?.complete ? 'context_has_no_block' : 'draw_structure_unavailable');
      position = touched[touched.length - 1].end;
      rebased = range.rebased;
      // The handle pairs are the author's.
      heldOffset = position - range.start;
    }
    const early = commitGate([{ pos: position, removed: '', inserted: '' }], who);
    if (early) return early;
    let painted = null;
    if (input.figures?.some?.(row => row?.kind === 'paint')) {
      const result = await paintFigures(input.figures, context);
      if (result.refusal) return result.refusal;
      // Paint is a native shape, not a boundary in the agent's graph. Lower the whole batch so
      // forward arrows, groups, layout and authored stacking keep the same meaning around it.
      painted = _rapierDrawApplyShapesPatch({ shapes: [] }, { add: result.list }, input.direction);
      if (!painted) return failure('figures_invalid', 'invalid', { kinds: FIGURE_KINDS });
    }
    let svg, recipe;
    try {
      const recipeInput = painted || (input.recipe != null
        ? input.recipe.figures != null && input.direction != null ? { ...input.recipe, direction: input.direction } : input.recipe
        : input.figures != null ? { figures: input.figures, direction: input.direction } : null);
      recipe = recipeInput && _rapierDrawNormalizeAgentRecipe(recipeInput);
      // A refused figure names itself (draw/core.mjs _rapierDrawFigureFault): the index, the field and what the field takes,
      // and the kinds a figure may name (the list draw/core.mjs admits).
      if (!recipe) return input.figures != null && input.recipe == null ? failure('figures_invalid', 'invalid', { ...(_rapierDrawFigureFault(input.figures, [], input.direction) || {}), kinds: FIGURE_KINDS }) : recipeInvalid(_rapierDrawRecipeFault(recipeInput));
      const operations = await paintOperations(input.operations, context, recipe);
      if (operations.refusal) return operations.refusal;
      recipe = applyOperations(recipe, operations.list).recipe;
      if (!recipe.shapes.length || recipe.shapes.length > 128) return failure('draw_shape_limit', 'invalid');
      if (!paintSheetsHold(recipe)) return failure('paint_sheet_invalid', 'invalid');
      const rasterRefusal = await paintRastersHold(recipe, null, context);
      if (rasterRefusal) return rasterRefusal;
      svg = _rapierDrawBuildSVG(recipe);
    }
    catch (error) { cancelled(context); return failure(error?.code || 'draw_render_failed', error?.field ? 'invalid' : 'refused', error?.field ? {field: error.field} : {}); }
    if (!svg) return failure('recipe_invalid', 'invalid');
    recipe = _rapierDrawReadRecipeFromSVGText(svg);
    if (!recipe) return failure('recipe_invalid', 'invalid');
    const title = _rapierDrawNextAssetName(assets.assets.values());
    let asset, appended, prospective, raw, prefix, suffix;
    try {
      asset = await createAsset(encoder.encode(svg), null, {codec: 'image/svg+xml', title});
      cancelled(context);
      const before = source.slice(0, position), after = source.slice(position);
      const around = paragraphBreakAround(source, position);
      prefix = around.prefix;
      suffix = around.suffix;
      raw = '![' + escapeImageAlt(input.alt) + '][' + asset.label + ']';
      prospective = before + prefix + raw + suffix + after;
      appended = await appendAsset(prospective, asset);
      if (appended.reference !== asset.label) raw = '![' + escapeImageAlt(input.alt) + '][' + appended.reference + ']';
    } catch (error) {
      cancelled(context);
      return failure(error?.code || 'draw_asset_failed');
    }
    cancelled(context);
    const occStart = position + prefix.length;
    // One authored splice, the occurrence; appended.source only validates. The definition derives at commit.
    const splices = [{pos: position, removed: '', inserted: prefix + raw + suffix}];
    const placement = drawingPlacement(appended.source, occStart, raw, appended.reference, true);
    if (!placement.placed) {
      return failure(placement.complete ? 'draw_placement_unavailable' : 'draw_structure_unavailable');
    }
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    const result = await commit(splices, who, context, 'document.draw', {
      label: input.label ?? 'Draw a picture', editCount: 1, authoredCount: 1, rebased,
      drawingPresentation: {...context.drawingPresentation?.binding, presentation: context.drawingPresentation?.presentation,
        occurrence: {start: occStart, end: occStart + raw.length}, reference: appended.reference},
      turnId: input.turn_id,
      handleIds: held ? [held.id] : [],
      handlePairs: [{ handleId: held ? held.id : null, offset: heldOffset }],
      drawAssets: [{ id: normalizeLabel(appended.reference), label: appended.reference, url: asset.url, title: asset.title }],
    });
    if (!['applied', 'rebased'].includes(result.outcome)) return result;
    if (held) held.used = true;
    const recipeHandle = drawHandle(occStart, occStart + raw.length, appended.reference, who);
    const editUnavailable = !recipeHandle && drawHandleRefusal(JSON.stringify(disclosedRecipe(recipe)), JSON.stringify(recipe).length);
    return { ...result, asset: {reference: appended.reference, title}, width: asset.width, height: asset.height,
      recipe_handle: recipeHandle?.id || null, ...(editUnavailable ? unavailableEdit(editUnavailable) : {}) };
  }

  // Patches the recipe of the definition the handle was minted over, read from the document and never held: a person's edit is a changed
  // target (relocate() for the occurrence, the digest for the definition), and only the text the caller was shown counts against the
  // budget, whatever the pixels and histories weigh. New content-addressed asset; occurrence rewritten in place; the old definition
  // retires via imageDeletionSplices. One definition throughout.
  async function drawEdit(input, who, context) {
    if (input.figures != null || input.recipe != null && input.shapes != null) return failure('draw_edit_recipe_conflict', 'invalid');
    if (input.context_handle != null) return failure('draw_edit_placement_conflict', 'invalid');
    const patch = input.shapes;
    if (input.recipe == null && input.alt == null && !input.operations?.length && !(patch && (patch.add?.length || patch.replace?.length || patch.remove?.length || Object.keys(patch.set || {}).length))) return failure('draw_edit_empty', 'invalid');
    if (input.alt != null && (typeof input.alt !== 'string' || !input.alt.trim())) return failure('draw_alt_required', 'invalid');
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const held = lookup('handles', input.recipe_handle, who);
    if (held.outcome) return held;
    if (held.kind !== 'draw') return failure('context_handle_wrong_kind', 'invalid');
    if (held.objectId && input.alt != null) return failure('drawing_object_scope', 'invalid');
    const range = relocate(held);
    if (range.outcome) return range;
    if (held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
    const staleSurface = drawBindingFailure(held, range);
    // The digest proves the definition is the one the caller was shown, and nothing awaits before it is read. What the caller saw is that
    // definition, or the open canvas's recipe the handle kept when the read came from the surface.
    const stored = storedRecipe(held.assetLabel);
    if (!stored) return failure('target_changed', 'conflict');
    const inspected = held.recipeJSON != null ? JSON.parse(held.recipeJSON) : stored;
    if (input.recipe != null) {
      const unavailable = drawHandleRefusal(JSON.stringify(disclosedRecipe(inspected)), JSON.stringify(inspected).length);
      if (unavailable) return failure(unavailable, 'refused', {field: 'recipe'});
    }
    const live = drawingFor(range.start, range.end, held.assetLabel);
    if (live?.recipeUnavailable && live.recipeDigest !== drawingRecipeDigest(stored)) return failure('draw_surface_unavailable', 'conflict', {detail: live.recipeUnavailable});
    if (staleSurface && (!live?.recipe || live.session !== held.drawSession)) return staleSurface;
    // The view record is derived by every build, never a hand's decision: it says nothing about whether the canvas moved. The open
    // surface reports the pen settings a definition omits (draw.js: its baseline fills smooth and nib with the defaults), so the
    // comparison fills the same, or a definition no hand touched reads as a canvas that moved. The merge still sees every difference.
    const penned = recipe => ({...recipe, smooth: recipe.smooth ?? RAPIER_DRAW_SMOOTH_DEFAULT, nib: recipe.nib ?? RAPIER_DRAW_NIB_DEFAULT});
    const surfaceDiffers = !!live?.recipe && (!!staleSurface || canonicalJson(sansView(live.recipe)) !== canonicalJson(sansView(inspected)));
    const rebasedSurface = surfaceDiffers && (!!staleSurface || canonicalJson(sansView(penned(live.recipe))) !== canonicalJson(sansView(penned(inspected))));
    const writeBase = live?.recipe || inspected;
    const writeBinding = {assetLabel: held.assetLabel, ...drawingBinding(live)};
    const early = commitGate([{ pos: range.start, removed: held.text, inserted: '' }], who,
      {asset: held.assetLabel, occurrence: {start: range.start, end: range.end}});
    if (early) return early;
    // Object patches, operations, dials and a whole recipe share the open Draw owner's semantic hand-off: only a verified change enters the
    // live drawing owner, and the final fence below carries the admitted delta, never the caller's recipe or operation spelling. A caption
    // is source outside the canvas and keeps the ordinary fence.
    const editingFence = {operation: 'document.draw', surfaceRecipeDigest: drawingRecipeDigest(writeBase), drawingAsset: held.assetLabel || '',
      shapesOnly: input.alt == null, occurrence: {start: range.start, end: range.end, reference: held.assetLabel}};
    if (input.shapes?.replace?.some(row => row?.kind === 'paint')) {
      editingFence.paintTargets = clone(input.shapes.replace.filter(row => row?.kind === 'paint')
        .map(row => inspected.shapes.find(shape => shape.id === row.id && shape.recognized === 'paint')).filter(Boolean));
    }
    const watched = !!commitFenceRefusal() && !commitFenceRefusal(editingFence);
    let svg, recipe;
    try {
      let base = clone(inspected);
      const outsideObject = value => {
        const {shapes, ...settings} = value;
        return canonicalJson({...settings, shapes: shapes.filter(row => row.id !== held.objectId)});
      };
      const untouched = held.objectId ? outsideObject(base) : null;
      if (input.recipe != null) {
        // A whole inspected recipe reaches canvas, paper, strokes and fonts without replacing the document.
        // Redacted pixels are restored only from the same held paint id, as for a shapes replacement.
        if (!Array.isArray(input.recipe.shapes) || input.recipe.figures != null) return failure('recipe_invalid', 'invalid');
        const shapes = [];
        for (const shape of input.recipe.shapes) {
          if (shape?.raster?.kept !== true) { shapes.push(shape); continue; }
          const original = base.shapes.find(original => original.id === shape.id && original.recognized === 'paint');
          if (!original || shape.recognized !== 'paint') return failure('recipe_invalid', 'invalid');
          if (canonicalJson(shape.paint ?? null) !== canonicalJson(inspectPaintRecord(original.paint) ?? null)) return failure('paint_kept_recipe_changed', 'invalid');
          shapes.push({ ...shape, raster: original.raster, paint: original.paint });
        }
        base = _rapierDrawNormalizeAgentRecipe({ ...input.recipe, shapes });
        if (!base) return recipeInvalid(_rapierDrawRecipeFault({ ...input.recipe, shapes }));
      }
      if (input.shapes) {
        const add = await paintFigures(input.shapes.add, context, 'shapes.add', base);
        if (add.refusal) return add.refusal;
        const replace = await paintFigures(input.shapes.replace, context, 'shapes.replace', base, true);
        if (replace.refusal) return replace.refusal;
        // Kept bytes belong to this held paint id, never to a new shape or an array position.
        const shapes = { ...input.shapes, add: add.list, replace: replace.list?.slice() };
        if (shapes.add?.some(shape => shape.raster?.kept === true)) return failure('recipe_invalid', 'invalid');
        for (let i = 0; i < (shapes.replace?.length || 0); i++) {
          const shape = shapes.replace[i];
          if (shape.recognized !== 'paint' || shape.raster?.kept !== true) continue;
          const original = base.shapes.find(original => original.id === shape.id && original.recognized === 'paint');
          if (!original) return failure('recipe_invalid', 'invalid');
          if (canonicalJson(shape.paint ?? null) !== canonicalJson(inspectPaintRecord(original.paint) ?? null)) return failure('paint_kept_recipe_changed', 'invalid');
          shapes.replace[i] = { ...shape, raster: original.raster, paint: original.paint };
        }
        const patched = _rapierDrawApplyShapesPatch(base, shapes, input.direction);
        // A figure that cannot be added names itself, as on a create; a shape or a replace that cannot land stays a bare refusal.
        if (!patched) return failure('draw_shapes_patch_invalid', 'invalid', _rapierDrawFigureFault((shapes.add || []).filter(raw => raw && typeof raw.kind === 'string'), base.shapes, input.direction) || {});
        // The dials of `set` are admitted with the rest of the recipe, whole; a refusal names the field that stopped it.
        const fault = shapes.set && _rapierDrawRecipeFault(patched);
        if (fault) return recipeInvalid(fault);
        base = patched;
      }
      const operations = await paintOperations(input.operations, context, base);
      if (operations.refusal) return operations.refusal;
      recipe = applyOperations(base, operations.list).recipe;
      // A handle scoped to one object lets the agent change that object alone; the check is on the agent's own change, before the canvas's is laid under it.
      if (held.objectId && outsideObject(recipe) !== untouched) return failure('drawing_object_scope', 'invalid');
      // The agent worked on the drawing it inspected; the canvas has moved on since (the person drew). Its change is laid over the canvas as
      // it stands, by the one merge, and an object or dial both hands touched refuses here, before anything is written.
      if (surfaceDiffers) {
        recipe = _rapierDrawMergeAgentRecipe(writeBase, inspected, recipe);
        if (!recipe) return failure('draw_surface_changed', 'conflict');
      }
      // The drawing's own budget (2048 shapes, admitted with the recipe) is the one limit: a canvas the person has filled is still editable.
      if (!paintSheetsHold(recipe)) return failure('paint_sheet_invalid', 'invalid');
      const rasterRefusal = await paintRastersHold(recipe, writeBase, context);
      if (rasterRefusal) return rasterRefusal;
      svg = _rapierDrawBuildSVG(recipe);
    } catch (error) { cancelled(context); return failure(error?.code || 'draw_render_failed', error?.field ? 'invalid' : 'refused', error?.field ? {field: error.field} : {}); }
    // Rendering may await a worker while recovery reconciles a new document or a human edit.
    // The earlier inspected recipe must not acquire that newer source's revision at commit.
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    if (!recipe.shapes.length && !recipe.background) {
      // Done removes an emptied existing drawing. Its occurrence and orphaned definition retire
      // through the source owner, in one transaction. An open canvas needs an occurrence to follow.
      const result = await commit([{pos: range.start, removed: held.text, inserted: ''}], who, context, 'document.draw', {
        fence: {...editingFence, shapesOnly: false}, label: input.label ?? 'Remove an empty drawing',
        turnId: input.turn_id,
        editCount: 1, authoredCount: 1, handleIds: [held.id],
        handlePairs: [{handleId: held.id, offset: 0}],
      });
      if (!['applied', 'rebased'].includes(result.outcome)) return result;
      held.used = true;
      return {...result, removed: true, replaced: held.assetLabel || null, recipe_handle: null};
    }
    if (!svg) return failure('recipe_invalid', 'invalid');
    // The recipe the asset will hold, read back from its own bytes: the semantic change is proved against exactly what the source stores.
    recipe = _rapierDrawReadRecipeFromSVGText(svg);
    if (!recipe) return failure('recipe_invalid', 'invalid');
    return commitPictureEdit(input, who, context, held, range, encoder.encode(svg), {recipe, editingFence, watched, writeBase, writeBinding, live, rebased: !!rebasedSurface});
  }

  async function drawSVGEdit(input, who, context) {
    if (typeof input.svg_handle !== 'string') return failure('svg_handle_required', 'invalid', {field: 'svg_handle'});
    if (input.alt != null && (typeof input.alt !== 'string' || !input.alt.trim())) return failure('draw_alt_required', 'invalid', {field: 'alt'});
    for (const field of ['recipe_handle', 'recipe', 'figures', 'shapes', 'operations', 'direction', 'context_handle']) {
      if (input[field] != null) return failure('svg_edit_conflict', 'invalid', {field});
    }
    if (!Array.isArray(input.node_edits) || !input.node_edits.length) return failure('svg_node_edit_invalid', 'invalid', {field: 'node_edits'});
    const held = lookup('handles', input.svg_handle, who);
    if (held.outcome) return held;
    if (held.kind !== 'svg') return failure('context_handle_wrong_kind', 'invalid', {field: 'svg_handle'});
    const range = relocate(held);
    if (range.outcome) return range;
    if (assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
    const disclosed = new Set(held.nodeIds);
    for (let index = 0; index < input.node_edits.length; index++) {
      if (!disclosed.has(input.node_edits[index].id)) return failure('svg_node_edit_invalid', 'invalid', {field: 'node_edits[' + index + '].id'});
    }
    const early = commitGate([{pos: range.start, removed: held.text, inserted: ''}], who);
    if (early) return early;
    const editingFence = {operation: 'svg.edit', drawingAsset: held.assetLabel, shapesOnly: false};
    const asset = documentAssets(state.text).assets.get(normalizeLabel(held.assetLabel));
    let edited;
    try { edited = editSVGNodes(decodeDataImage(asset.url), input.node_edits); }
    catch (error) { return failure(error.code || 'svg_node_edit_invalid', 'invalid', {field: error.field || 'node_edits'}); }
    return commitPictureEdit(input, who, context, held, range, edited, {nodeIds: held.nodeIds, editingFence, watched: false});
  }

  // The one commit of a picture edit, native or imported. A native recipe edit also carries the verified semantic change (the envelope) to
  // the open canvas, bound to the surface and the occurrence it was made for.
  async function commitPictureEdit(input, who, context, held, range, svgBytes, {recipe, nodeIds, editingFence, watched, writeBase, writeBinding, live, rebased}) {
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const occStart = range.start, oldOccText = held.text;
    let asset, appended, raw, title;
    try {
      title = _rapierDrawNextAssetName(documentAssets(source).assets.values());
      asset = await createAsset(svgBytes, null, {codec: 'image/svg+xml', title});
      cancelled(context);
      // Omitted alt keeps the existing caption, or none.
      const altSource = input.alt != null ? escapeImageAlt(input.alt) : (DRAW_OCCURRENCE.exec(oldOccText)?.[1] ?? '');
      raw = '![' + altSource + '][' + asset.label + ']';
      appended = await appendAsset(source, asset);
      if (appended.reference !== asset.label) raw = '![' + altSource + '][' + appended.reference + ']';
    } catch (error) {
      cancelled(context);
      return failure(error?.code || 'draw_asset_failed');
    }
    cancelled(context);
    // One semantic change: the occurrence; retirement and addition derive at commit.
    const splices = [{ pos: occStart, removed: oldOccText, inserted: raw }];
    const validated = transformSplices(appended.source, splices);
    if (validated == null) return failure('document_changed', 'conflict');
    const placement = drawingPlacement(validated, occStart, raw, appended.reference);
    if (!placement.placed) {
      return failure(placement.complete ? 'draw_placement_unavailable' : 'draw_structure_unavailable');
    }
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    const settled = writeBinding ? drawBindingFailure(writeBinding, range) : null;
    if (settled) return settled;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    // Captions are source outside the canvas. Even a combined caption/recipe edit keeps the ordinary source fence; only a recipe change
    // carries authority into an open Draw session.
    let drawingPatch = null;
    if (recipe && input.alt == null) {
      const saved = sourceDrawing(source, held.assetLabel);
      if (!saved) return failure('target_changed', 'conflict');
      const delta = _rapierDrawRecipeDelta(writeBase, recipe);
      if (!delta) return failure('draw_patch_invalid', 'conflict');
      drawingPatch = {patch: delta,
        occurrence: {...(live?.occurrence || {}), start: occStart, end: occStart + oldOccText.length, reference: held.assetLabel},
        targetOccurrence: {start: occStart, end: occStart + raw.length, reference: appended.reference},
        asset: held.assetLabel, reference: appended.reference, assetGeneration: sha256(saved.asset.url),
        ...(writeBinding?.drawSession ? {session: writeBinding.drawSession, surfaceGeneration: writeBinding.surfaceGeneration} : {}),
        sourceRecipeBefore: saved.recipe, sourceRecipeAfter: recipe, recipeBefore: writeBase, recipeAfter: recipe};
    }
    const result = await commit(splices, who, context, recipe ? 'document.draw' : 'svg.edit', {
      fence: {...editingFence, ...(drawingPatch ? {drawingPatch} : {})}, ...(drawingPatch ? {drawingPatch} : {}),
      watched, rebased,
      ...(recipe ? {drawingPresentation: {...context.drawingPresentation?.binding, presentation: context.drawingPresentation?.presentation,
        occurrence: {start: occStart, end: occStart + raw.length}, reference: appended.reference}} : {}),
      turnId: input.turn_id,
      label: input.label ?? 'Edit a drawing', editCount: 1, authoredCount: splices.length, handleIds: [held.id],
      handlePairs: [{ handleId: held.id, offset: occStart - range.start }],
      drawAssets: [{ id: normalizeLabel(appended.reference), label: appended.reference, url: asset.url, title: asset.title }],
    });
    if (!['applied', 'rebased'].includes(result.outcome)) return result;
    held.used = true;
    const nextHandle = recipe ? (held.objectId && !recipe.shapes.some(row => row.id === held.objectId) ? null
      : drawHandle(occStart, occStart + raw.length, appended.reference, who, {}, null, null, held.objectId))
      : svgHandle(occStart, occStart + raw.length, nodeIds, appended.reference, who);
    // `replaced`: the picture the handle held; the replay matches on it. Never from the wire.
    return { ...result, asset: {reference: appended.reference, title}, replaced: held.assetLabel || null,
      width: asset.width, height: asset.height, ...(recipe ? {recipe_handle: nextHandle?.id || null,
        ...(!nextHandle ? drawingEditAvailability(appended.reference) : {})} : {svg_handle: nextHandle?.id || null}) };
  }

  function sourceChangeTargets(changeId) {
    const entry = state.journal.find(row => row.id === changeId);
    if (!entry) return [];
    const targets = [];
    const later = since(entry.revision);
    if (later) for (let index = 0; index < entry.splices.length && targets.length < 2; index++) {
      const row = entry.splices[index];
      let range = transportInterval(row.pos, row.pos + row.inserted.length, entry.splices.slice(index + 1));
      for (const next of later) { if (!range) break; range = transportInterval(range.start, range.end, next.splices); }
      if (!range) continue;
      targets.push({start: range.start, end: range.end, chars: range.end - range.start});
    }
    return targets;
  }

  function sourceChanges(who, observed = null, seen = []) {
    if (observed == null) return { sinceRevision: null, throughRevision: state.revision, complete: true, changes: [], reason: 'first_observation' };
    const retained = since(observed);
    const delivered = new Set(seen);
    const entries = (retained || state.journal.filter(row => row.revision > observed)).filter(row => !delivered.has(row.id));
    const rows = entries;
    const changes = rows.map(entry => {
      return {act: publicAct(entry), yours: entry.owner === ownerOf(who),
        insertedChars: entry.splices.reduce((sum, row) => sum + row.inserted.length, 0),
        removedChars: entry.splices.reduce((sum, row) => sum + row.removed.length, 0), targets: [] };
    });
    return { sinceRevision: observed, throughRevision: state.revision, complete: !!retained && entries.length <= rows.length,
      retainedChanges: entries.length, omitted: entries.length - rows.length, changes,
      ...(!retained ? { reason: 'retained_history_limited' } : {}) };
  }

  // Context is one bounded observation. Keep Will, human changes, current source
  // identity and the pointer; optional lists share the remaining bytes, with omissions explicit.
  function fitContext(result, budget) {
    const omitted = domain => {
      const rows = result.omissions ||= [];
      let row = rows.find(row => row.domain === domain);
      if (!row) rows.push(row = {domain, reason: 'result_budget', omitted: 0});
      row.omitted++; result.complete = false;
    };
    const lists = [
      [result.drawing, 'selectedObjects', () => {result.drawing.selectedObjectsComplete = false;}],
      [result.drawing?.brushes, 'paint', () => {result.drawing.brushes.paintComplete = false;}],
      [result.drawing?.brushes, 'vector', () => {result.drawing.brushes.vectorComplete = false;}],
      [result.compare, 'items', () => {result.compare.remaining++; omitted('comparison_items');}],
      [result, 'agents', () => omitted('agent_names')],
      [result, 'returns', () => omitted('returned_pages')],
      [result.editor, 'receipts', () => omitted('editor_receipts')],
      [result.drawing, 'receipts', () => {result.drawing.receiptsComplete = false;}],
      [result.continuation?.person, 'intents', () => {result.continuation.person.intentsComplete = false; result.continuation.person.omittedIntents++;}],
      [result.sourceChanges, 'changes', row => {
        result.sourceChanges.complete = false; result.sourceChanges.omitted++;
        for (const target of row.targets) if (target.ref) delete state.refs[target.ref];
      }],
    ].filter(([owner, field]) => Array.isArray(owner?.[field]));
    while (bytes(JSON.stringify(stamp(result))) > budget) {
      const list = lists.find(([owner, field]) => owner[field].length);
      if (!list) break;
      const [owner, field, record] = list;
      // Keep recent changes and receipts; comparison items retain their first-page order.
      const index = owner === result.sourceChanges ? owner[field].findIndex(row => row.act.author.kind !== 'human') : -1;
      record(index >= 0 ? owner[field].splice(index, 1)[0] : field === 'items' ? owner[field].pop() : owner[field].shift());
    }
    return result;
  }

  function publicCommentAnchor(anchor, parsed) {
    const {exact, start, end, ...rest} = anchor;
    return {...rest, ...(anchor.quote ? {quote: display(anchor.quote, 256)} : {}),
      ...(anchor.status === 'attached' ? commentSourceRange(anchor, parsed) : {})};
  }

  function listComments(input, who) {
    if (state.docKind !== 'markdown') return failure('comments_require_markdown');
    const parsed = parseComments(state.text);
    if (parsed.reason) return failure(parsed.reason);
    let offset = 0, textOffset = 0, threadId = input.thread_id || null, status = input.status || 'all';
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'comments') return failure('cursor_kind_mismatch');
      if (cursor.revision !== state.revision) return failure('read_snapshot_changed', 'conflict');
      ({offset, textOffset, threadId, status} = cursor);
    }
    const threads = commentThreads(state.text, parsed).filter(thread => status === 'all' || thread.resolved === (status === 'resolved'));
    const thread = threadId ? threads.find(row => row.id === threadId) : null;
    if (threadId && !thread) return failure('comment_missing', 'target_gone');
    const items = [], rows = thread ? thread.messages : threads, budget = LIMITS.resultBytes - 2048;
    const publicMessage = row => ({id: row.id, text: row.text,
      author: {kind: row.author.kind, name: display(row.author.name, 64)}, createdAt: row.createdAt,
      ...(row.date !== undefined ? {date: row.date} : {}),
      ...(row.replyTo !== undefined ? {replyTo: row.replyTo} : {}),
      ...(row.recipient ? {recipient: display(row.recipient, 64)} : {})});
    while (offset < rows.length) {
      const row = rows[offset];
      const message = thread ? {...publicMessage(row), text: clip(row.text.slice(textOffset), 2048), offset: textOffset,
        complete: textOffset + clip(row.text.slice(textOffset), 2048).length === row.text.length, chars: row.text.length} : null;
      const item = thread ? message : {id: row.id, resolved: row.resolved, anchor: publicCommentAnchor(row.anchor, parsed),
        messages: row.messages.length, lastMessage: {...publicMessage(row.messages.at(-1)), text: display(row.messages.at(-1).text, 240)}};
      if (bytes(JSON.stringify([...items, item])) > budget) {
        // Exact metadata cannot be clipped or paged as message text. A cursor must advance.
        if (!items.length) {
          if (input.cursor) delete state.cursors[input.cursor];
          return failure('result_over_budget', 'refused', {complete: false});
        }
        break;
      }
      items.push(item);
      if (message && !message.complete) { textOffset += message.text.length; break; }
      offset++; textOffset = 0;
    }
    const complete = offset >= rows.length;
    const next = complete ? null : mint('cursors', 'comments_', {kind: 'comments', revision: state.revision,
      threadId, status, offset, textOffset}, who);
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({...(thread ? {thread: {id: thread.id, resolved: thread.resolved, anchor: publicCommentAnchor(thread.anchor, parsed)}, messages: items}
      : {threads: items}), total: rows.length, complete, next_cursor: next?.id || null});
  }

  async function comment(input, who, context) {
    if (state.docKind !== 'markdown') return failure('comments_require_markdown');
    const parsed = parseComments(state.text);
    if (parsed.reason) return failure(parsed.reason);
    const threads = commentThreads(state.text, parsed);
    const action = input.action;
    const writesMessage = action === 'create' || action === 'reply';
    if (writesMessage && (typeof input.text !== 'string' || !input.text.trim() ||
        bytes(input.text) > 4096 || admissibleText(input.text))) return failure('comment_text_invalid', 'invalid');
    if (!writesMessage && (input.text !== undefined || input.recipient !== undefined) ||
        action !== 'create' && (input.context_handle !== undefined || input.anchor !== undefined || input.object_id !== undefined)) {
      return failure('comment_arguments_invalid', 'invalid');
    }
    let thread, held = null;
    if (action === 'create') {
      if (input.thread_id) return failure('comment_arguments_invalid', 'invalid');
      const kind = input.anchor || (input.context_handle ? 'text' : 'document');
      if (kind === 'document' && (input.context_handle || input.object_id) || kind !== 'drawing' && input.object_id) return failure('comment_anchor_invalid', 'invalid');
      let range = null;
      if (kind !== 'document') {
        held = lookup('handles', input.context_handle, who);
        if (held.outcome) return held;
        if (held.kind === 'change') return failure('context_handle_wrong_kind', 'invalid');
        if (held.kind === 'image-comment' && kind !== 'image') return failure('context_handle_wrong_kind', 'invalid');
        range = relocate(held);
        if (range.outcome) return range;
        if (['draw', 'svg'].includes(held.kind) && held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
        if (kind === 'drawing' && held.kind !== 'draw') return failure('context_handle_wrong_kind', 'invalid');
      }
      const anchor = commentAnchor(kind, range?.start, range?.end, state.text, parsed, input.object_id);
      thread = {id: mintId('thread_'), anchor, resolved: false, messages: []};
      // The same semantic validation used on every later read proves an image and its object id now.
      const checked = commentThreads(state.text, {...parsed, current: true, threads: [thread]})[0];
      if (checked.anchor.status !== 'attached') return failure('comment_anchor_invalid', 'invalid', {detail: checked.anchor.reason});
      threads.push(thread);
    } else {
      thread = threads.find(row => row.id === input.thread_id);
      if (!thread) return failure('comment_missing', 'target_gone');
    }
    let message = null;
    if (writesMessage) {
      const recipient = typeof input.recipient === 'string' ? input.recipient.trim() : '';
      message = {id: mintId('message_'), text: input.text,
        author: {kind: who.actor, name: who.actor === 'human' ? 'You' : who.agent || who.actor},
        createdAt: Math.floor(now()), ...(recipient ? {recipient} : {})};
      thread.messages.push(message);
    } else if (action === 'resolve' || action === 'reopen') {
      if (thread.resolved === (action === 'resolve')) return {outcome: 'unchanged', threadId: thread.id};
      thread.resolved = action === 'resolve';
    } else return failure('comment_action_invalid', 'invalid');
    const row = writeComments(state.text, threads, parsed);
    const result = await commit([row], who, context, 'comments.write', {label: input.label ?? 'Comment', turnId: input.turn_id, editCount: 1,
      authoredCount: 1, });
    return {...result, threadId: thread.id, ...(message ? {messageId: message.id} : {})};
  }

  function inspectVisual(input, context) {
    const pointing = collaboration().presence;
    const drawing = drawingSummary();
    const prepared = visualRequest({...state, drawing, selection: pointing?.selection || state.selection,
      focus: pointing?.focus || state.focus}, input);
    if (prepared.outcome !== 'ok') return {...failure(prepared.reason, prepared.outcome, prepared), ...(drawing ? {drawing} : {})};
    const mode = 'visual:' + prepared.request.scope;
    if (context.continues) {
      const invalid = checkContinuation(context, mode);
      if (invalid) return invalid;
      const prior = pendingFacts.get(context.continues);
      pendingFacts.delete(context.continues);
      if (canonicalJson(prior.requirements?.sourceRange) !== canonicalJson(prepared.request.sourceRange)) return failure('visual_target_changed');
    }
    if (context.world?.visual) {
      const result = visualResult(prepared.request, context.world.visual);
      return {...(result.outcome === 'ok' ? result : failure(result.reason, result.outcome, result)), ...(drawing ? {drawing} : {})};
    }
    const requestId = mintId('fact_');
    pendingFacts.set(requestId, {documentId: state.documentId, revision: state.revision, mode, requirements: prepared.request});
    while (pendingFacts.size > LIMITS.invocationKeys) pendingFacts.delete(pendingFacts.keys().next().value);
    return {outcome: 'pending', reason: 'surface_fact_required', ...(drawing ? {drawing} : {}), pending: {kind: 'surface-fact', requestId, requirements: prepared.request}};
  }

  function askEditor(operation, input, who, context) {
    let sourceRange;
    if (input.context_handle !== undefined) {
      if (input.text !== undefined || !['read_aloud', 'copy'].includes(input.action)) return failure('editor_arguments_invalid', 'invalid');
      const target = readTarget({context_handle: input.context_handle}, who);
      if (target.outcome) return target;
      // A drawing or an imported SVG is read as its recipe or node tree; only a passage of words reaches the person's device.
      if (target.change || target.draw || target.svg) return failure('context_handle_wrong_kind', 'invalid');
      input = {...input, text: state.text.slice(target.start, target.end)};
      sourceRange = {start: target.start, end: target.end};
    }
    if (input.action === 'copy' && input.format === 'complete' && !sourceRange) return failure('editor_context_required', 'refused',
      {hint: 'Read the passage first, then copy its context_handle as a complete excerpt.'});
    const prepared = editorRequest(state, operation, input);
    if (prepared.outcome !== 'ok') return prepared;
    if (sourceRange) prepared.request.sourceRange = sourceRange;
    const mode = 'editor:' + operation;
    let requestId = context.world?.editor?.receipt?.id;
    if (context.continues) {
      const invalid = checkContinuation(context, mode);
      if (invalid) return invalid;
      const prior = pendingFacts.get(context.continues);
      pendingFacts.delete(context.continues);
      const {id, ...requirements} = prior.requirements || {};
      if (canonicalJson(requirements) !== canonicalJson(prepared.request)) return failure('editor_request_changed');
      requestId = context.continues;
    }
    if (context.world?.editor) return editorResult({...prepared.request, ...(requestId ? {id: requestId} : {})}, context.world.editor);
    requestId = mintId('fact_');
    const requirements = {...prepared.request, id: requestId};
    pendingFacts.set(requestId, {documentId: state.documentId, revision: state.revision, mode, requirements});
    while (pendingFacts.size > LIMITS.invocationKeys) pendingFacts.delete(pendingFacts.keys().next().value);
    return {outcome: 'pending', reason: 'surface_fact_required', pending: {kind: 'surface-fact', requestId, requirements}};
  }

  async function point(input, who, context) {
    const {target: selected} = input;
    input = {...input, ...selected};
    if (selected.kind === 'act') input.change_id = selected.act_id;
    let target, reveal = host.reveal;
    const change = selected.kind === 'comparison' ? changeOf(input.change_id) : null;
    if (selected.kind === 'comparison' && !change) return failure('change_missing', 'target_gone');
    if (change) {
      if (state.compare.owner !== ownerOf(who) && !state.compare.hostCompareId) return failure('compare_not_owned');
      target = {compareId: state.compare.id, changeId: change.id, hostCompareId: state.compare.hostCompareId || null,
        start: change.start, end: change.end, incomingStart: change.incomingStart, incomingEnd: change.incomingEnd,
        removed: change.removed, inserted: change.inserted, currentText: state.compare.baseline, incomingText: state.compare.incoming,
        index: state.compare.changes.indexOf(change)};
      reveal = host.revealChange;
    } else if (input.change_id) {
      const entry = state.journal.find(row => row.id === input.change_id);
      if (!entry) return failure('act_unavailable', 'target_gone');
      const later = since(entry.revision);
      if (!later) return failure('history_unavailable', 'conflict');
      for (let index = 0; index < entry.splices.length; index++) {
        const row = entry.splices[index];
        let range = transportTouchedInterval(row.pos, row.pos + row.inserted.length, entry.splices.slice(index + 1));
        for (const next of later) { if (!range) break; range = transportTouchedInterval(range.start, range.end, next.splices); }
        if (range) { target = range; break; }
      }
      if (!target && !entry.splices.length) target = {start: 0, end: 0};
      if (!target) return failure('target_changed', 'conflict');
    } else {
      const held = lookup('handles', input.context_handle, who);
      if (held.outcome) return held;
      const range = relocate(held);
      if (range.outcome) return range;
      if (held.kind === 'draw' && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
      target = {...range, ...(held.kind === 'draw' ? {assetLabel: held.assetLabel, ...(held.objectId ? {objectId: held.objectId} : {})} : {})};
    }
    const createdAt = now(), lifetime = input.lifetime ?? 6, key = presenceKey(who);
    // One editor view has one pointer. A valid replacement retires its previous attention before presentation awaits.
    for (const row of Object.values(state.pointers)) if (row.status !== 'expired') {
      row.status = 'expired'; row.reason = 'pointer_replaced';
    }
    const pointer = {id: mintId('pointer_'), documentId: state.documentId, revision: state.revision,
      owner: ownerOf(who), ...(who.agent ? {agent: who.agent} : {}), start: target.start, end: target.end,
      ...(target.objectId ? {objectId: target.objectId} : {}), ...(target.assetLabel ? {assetLabel: target.assetLabel} : {}),
      ...(target.compareId ? {compareId: target.compareId, changeId: target.changeId} : {}),
      words: input.words, createdAt, expiresAt: createdAt + lifetime * 1000, status: 'deferred'};
    state.pointers[key] = pointer;
    const retained = Object.entries(state.pointers).sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (retained.length > LIMITS.principals) delete state.pointers[retained.shift()[0]];
    publishPresence();
    let value;
    try {
      if (typeof reveal === 'function') value = await reveal({documentId: state.documentId, revision: state.revision,
        ...target, pointer: clone(pointer), ...who, signal: context.signal});
      cancelled(context);
    } catch (error) {
      pointer.status = 'expired'; publishPresence(); throw error;
    }
    expireCollaboration();
    if (pointer.status !== 'expired') pointer.status = value?.status === 'expired' ? 'expired' : value?.ok && !value?.pending ? 'shown' : 'deferred';
    if (value?.viewId) pointer.viewId = value.viewId;
    publishPresence();
    return {outcome: pointer.status, status: pointer.status, pointerId: pointer.id, createdAt, expires_at: pointer.expiresAt, lifetime,
      ...(value?.viewId ? {view: {id: value.viewId, status: value.pending ? 'pending' : pointer.status}} : {}),
      ...(value?.reason ? {reason: value.reason} : {})};
  }

  async function readDocument(input, who, context) {
    if (input.cursor && input.target) return failure('read_target_ambiguous', 'invalid');
    let target = input.target, returnStart = null;
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind === 'return-read') {
        target = {kind: 'return', return_id: cursor.returnId, start: cursor.offset};
        returnStart = cursor.start;
      }
    }
    if (target?.kind === 'return') {
      if (input.paintSample) return failure('drawing_object_scope', 'invalid');
      if (typeof host.readReturn !== 'function') return failure('return_unavailable');
      const result = await host.readReturn({return_id: target.return_id, start: target.start ?? 0, limit: input.limit});
      if (result?.outcome !== 'ok') return result || failure('return_unavailable');
      const start = returnStart ?? target.start ?? 0;
      const next = result.complete ? null : mint('cursors', 'return_read_', {kind: 'return-read', returnId: target.return_id,
        start, offset: result.end}, who);
      if (input.cursor) delete state.cursors[input.cursor];
      return {...result, kind: 'return', authority: false, next_cursor: next?.id || null,
        coverage: {start, end: result.end, disclosed: result.end - start, chars: result.end + result.remaining, complete: start === 0 && result.complete === true}};
    }
    const args = {...input, ...target};
    delete args.target;
    if (target?.kind === 'comparison' && target.change_id) args.context_handle = target.change_id;
    return readContext(args, who, context);
  }

  async function observe(input, who, context) {
    const snapshot = readSnapshot();
    const resumed = state.resume[ownerOf(who)];
    let observed = resumed?.revision ?? null, seenChanges = resumed?.seenChanges || [];
    if (input.since) {
      const cursor = lookup('cursors', input.since, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'observation') return failure('cursor_kind_mismatch', 'invalid');
      if (cursor.revision > state.revision) return failure('observation_changed', 'conflict');
      observed = cursor.revision; seenChanges = cursor.seenChanges || [];
    }
    const facets = new Set(input.facets || ['changes', 'receipts', 'capabilities']);
    const budget = bounded(input.budget_bytes, 6144, 2048, LIMITS.resultBytes);
    const together = collaboration(), pointing = together.presence, will = state.docKind === 'markdown' ? parseWill(state.text) : null;
    const focused = pointing?.focus || state.focus, selected = pointing?.selection || state.selection;
    const focus = focused && reference(focused.start, focused.end, who, {kind: 'focus'});
    const selection = selected && reference(selected.start, selected.end, who, {kind: 'selection'});
    const editor = projectEditorContext(typeof host.editorContext === 'function' ? await host.editorContext() : null);
    const drawing = drawingSummary(), sha = sha256(state.text), paint = typeof host.paintBrushes === 'function' ? host.paintBrushes() : null;
    const drawingCore = drawing ? Object.fromEntries(['open', 'session', 'occurrence', 'assetGeneration', 'surfaceGeneration', 'recipeDigest', 'recipeUnavailable', 'mode', 'busy']
      .filter(key => drawing[key] !== undefined).map(key => [key, drawing[key]])) : null;
    const paintCore = {available: !!paint, ...(paint?.modes ? {modes: paint.modes} : {}),
      renderer: {status: typeof host.material === 'function' ? (drawingPresentationBinding() ? 'attached' : 'unavailable')
        : typeof host.paint === 'function' ? 'local' : 'unavailable', water: 'unprobed'},
      guide: {tool: 'rapier.guide', arguments: {topic: 'paint'}}};
    const result = accepted({filename: state.filename, docKind: state.docKind, chars: state.text.length, sha256: sha,
      surface: {kind: pointing?.active ? 'editor' : 'headless', next: pointing?.active ? 'continue' : 'deliver_page'},
      human: pointing ? {active: pointing.active === true, editing: pointing.editing === true, revision: pointing.revision,
        ...(pointing.view ? {view: pointing.view} : {}), expiresAt: pointing.expiresAt} : {status: 'unobserved'},
      ...(typeof host.notesForeground === 'function' ? {foreground: host.notesForeground()} : {}),
      focus: focus ? {ref: focus.id, start: focus.start, end: focus.end} : null,
      selection: selection ? {ref: selection.id, start: selection.start, end: selection.end,
        ...(selected.objectId ? {objectId: selected.objectId} : {})} : null,
      collaboration: {agentPresence: agentPresence(who, true)},
      ...(state.notes ? {notes: state.notes} : {}),
      ...(typeof host.view === 'function' ? {view: host.view()} : {}),
      ...(will?.present ? {law: {default: will.faults.length ? 'keep' : 'edit', regions: will.regions.length,
        laws: [...new Set(will.regions.map(row => row.law))], ...(will.faults.length ? {faultCount: will.faults.length} : {})}} : {}),
      ...(facets.has('changes') ? {sourceChanges: sourceChanges(who, observed, seenChanges)} : {}),
      continuation: continuationContext(will),
      ...(facets.has('receipts') ? {editor: {receipts: editor.receipts}, drawingIntent: drawingTurnSummary()} : {}),
      ...(facets.has('capabilities') ? {capabilities: {source: true, nativeDrawing: state.docKind === 'markdown',
        svg: state.docKind === 'markdown', editor: pointing?.active ? 'attached' : 'unavailable',
        notes: typeof host.notesFind === 'function' ? 'host' : 'unavailable'},
        editorPreferences: editor.preferences} : {}),
      drawing: facets.has('drawing') && drawing ? drawing : drawingCore,
      paint: facets.has('paint') && paint ? {...paint, ...paintCore} : paintCore,
      ...(facets.has('comments') && state.docKind === 'markdown' ? {comments: commentSummary(state.text)} : {}),
      ...(facets.has('comparison') && state.compare ? {compare: comparisonFields()} : {}),
      ...(facets.has('history') ? {history: {complete: state.history.complete, earliestRevision: state.history.earliestRevision,
        retainedChanges: state.journal.length, trimmedBytes: state.history.trimmedBytes}} : {}),
    });
    if (facets.has('returns')) {
      result.returns = typeof host.returns === 'function' ? await host.returns() : [];
      result.returnWaiting = result.returns.length > 0;
    }
    if (['structure', 'images', 'layout'].some(facet => facets.has(facet))) {
      const facts = await outline(context);
      if (facts?.outcome) return facts;
      if (facets.has('structure')) result.structure = {engine: facts.engine, total: facts.total, complete: facts.complete,
        ...(facts.reason ? {reason: facts.reason} : {})};
      const {images, layout} = facts;
      if (images && (facets.has('images') || facets.has('structure'))) result.images = {scope: 'markdown', total: images.total, indexed: images.entries.length,
        profiles: images.entries.reduce((counts, row) => {counts[row.profile]++; return counts;}, {embedded: 0, linked: 0}),
        drawings: images.entries.filter(row => row.drawing).length, assetRecords: images.assetRecords,
        declaredAssetBytes: images.declaredAssetBytes, complete: images.complete,
        omitted: Math.max(0, images.total - images.entries.length), ...(images.reason ? {reason: images.reason} : {})};
      if (layout && (facets.has('layout') || facets.has('structure'))) result.layout = {standard: 'md-layout:v1', annotatedBlocks: layout.total,
        alignments: [...new Set(layout.entries.map(row => row.align).filter(Boolean))],
        wrappedImages: layout.entries.filter(row => row.kind === 'image' && ['around', 'box', 'behind', 'front'].includes(row.wrap)).length,
        malformed: (layout.faults || []).length, ...(layout.faults?.length ? {faults: layout.faults.slice(0, 8)} : {}),
        complete: layout.complete, omitted: Math.max(0, layout.total - layout.entries.length), ...(layout.reason ? {reason: layout.reason} : {})};
    }
    if (facets.has('brief')) {
      const brief = await continuationBrief(context, Math.max(0, budget - bytes(JSON.stringify(stamp(result))) - 512));
      if (brief?.outcome) return brief;
      if (brief) result.brief = brief;
    }
    if (!sameReadSnapshot(snapshot)) {
      if (focus) delete state.refs[focus.id];
      if (selection) delete state.refs[selection.id];
      return failure('read_snapshot_changed', 'conflict');
    }
    const cursor = mint('cursors', 'observe_', {kind: 'observation', revision: snapshot.revision}, who);
    result.observation_cursor = cursor?.id || null;
    if (cursor) result.continuation.next = {tool: 'document.observe', arguments: {since: cursor.id}};
    result.facets = [...facets];
    // Optional catalogs and projections go before human changes, pending receipts or Will.
    for (const field of ['brief', 'editorPreferences', 'paint', 'drawing', 'compare', 'comments', 'history', 'images', 'layout', 'structure', 'capabilities']) {
      if (bytes(JSON.stringify(stamp(result))) <= budget - 128) break;
      if (result[field] === undefined) continue;
      if (field === 'drawing') {if (result.drawing === drawingCore) continue; result.drawing = drawingCore;}
      else if (field === 'paint') {if (result.paint === paintCore) continue; result.paint = paintCore;}
      else delete result[field];
      (result.omissions ||= []).push({domain: field, reason: 'result_budget'}); result.complete = false;
    }
    fitContext(result, budget - 128);
    // Mint read locations only for the delivered page, never for a hidden pre-budget list.
    for (const row of result.sourceChanges?.changes || []) {
      row.targets = sourceChangeTargets(row.act.id);
      for (const target of row.targets) {
        const ref = reference(target.start, target.end, who, {kind: 'change'});
        if (ref) {target.ref = ref.id; delete target.start; delete target.end;}
      }
    }
    fitContext(result, budget - 128);
    if (bytes(JSON.stringify(stamp(result))) > budget) {
      if (focus) delete state.refs[focus.id];
      if (selection) delete state.refs[selection.id];
      if (cursor) delete state.cursors[cursor.id];
      for (const row of result.sourceChanges?.changes || []) for (const target of row.targets) if (target.ref) delete state.refs[target.ref];
      return failure('result_over_budget', 'refused', {requiredBytes: bytes(JSON.stringify(stamp(result)))});
    }
    if (cursor) {
      if (result.sourceChanges?.omitted > 0 || !result.sourceChanges && observed !== null) {
        cursor.revision = observed; cursor.seenChanges = [...new Set([...seenChanges, ...(result.sourceChanges?.changes || []).map(row => row.act.id)])];
      }
      const retainedSourceBacklog = !result.sourceChanges && observed !== null &&
        state.journal.some(row => row.revision > observed && !seenChanges.includes(row.id));
      if (!result.sourceChanges?.omitted && !retainedSourceBacklog) delete result.continuation.next;
    }
    return result;
  }

  async function execute(name, input, context) {
    if (documentGuardFailure(context)) return stamp(documentGuardFailure(context));
    // Digest before caller admission: malformed input cannot mint portable attribution,
    // and clipping or ignoring fields must not hide different retry arguments.
    const inputDigest = sha256(canonicalJson(input));
    const who = invocationCaller(input, context);
    let workKey = null;
    // One finalizer inside the invocation boundary: every outcome records its code. A collision is not recorded; a replay writes no second row.
    const finalize = (result, { record = true } = {}) => {
      const value = publicWriteReceipt(result || failure('operation_failed'));
      if (value.outcome === 'uncertain' && ['document.edit', 'document.replace', 'document.draw', 'svg.edit', 'document.undo', 'comments.write'].includes(name))
        value.sourceStatus = 'uncertain';
      const output = stamp(value);
      if (name === 'document.observe' && output.collaboration) {
        output.collaboration.agentPresence = agentPresence({...who, ...(output.collaboration.agentPresence?.agent ? {agent: output.collaboration.agentPresence.agent} : {})}, !!workKey);
      }
      if (record) recordInvocation(who.invocationKey, name, state.documentId, output, inputDigest, who);
      return output;
    };
    try {
    // A wire-supplied key refuses the envelope, still recorded under participant()'s key.
    if (context.rejectedInvocationKey) {
      return finalize(failure('invocation_key_not_allowed', 'invalid'));
    }
    // A continuation reuses the key; skip dedupe or it replays its predecessor's pending forever. It still overwrites the record.
    const recorded = !context.continues && recordedInvocation(name, inputDigest, who);
    if (recorded) return finalize(recorded, {record: false});
    const descriptor = getTool(name);
    if (!descriptor) return finalize(failure('operation_unknown', 'invalid'));
    input = validateInput(descriptor.inputSchema, input, 'arguments', !descriptor.visibility);
    const named = agentLabel(input.agent);
    if (named) who.agent = named;
    if (who.actor === 'agent') {
      workKey = presenceKey(who);
      const held = working.get(workKey);
      working.set(workKey, {who, count: (held?.count || 0) + 1});
      publishPresence();
    }
    const beforeHandles = new Set(Object.keys(state.handles)), beforeRefs = new Set(Object.keys(state.refs)), beforeCursors = new Set(Object.keys(state.cursors));
    const unsettled = await refresh(context, name);
    if (unsettled) return finalize(unsettled);
    if (context.materialBinding && !materialMatches(context.materialBinding, state, currentDrawing()))
      return finalize(failure('document_changed', 'conflict'));
    prune();
    let result;
    let resumed = false;
    switch (name) {
      case 'document.observe': result = await observe(input, who, context); resumed = result.outcome === 'ok'; break;
      case 'document.outline': result = await getOutline(input, who, context); break;
      case 'comments.read': result = listComments(input, who); break;
      case 'comments.write': result = await comment(input, who, context); break;
      case 'document.inspect_visual': result = inspectVisual(input, context); break;
      case 'editor.read_aloud':
      case 'editor.copy':
      case 'editor.open_file':
      case 'editor.install_plugin':
        result = askEditor('document.device_action', {...input, action: EDITOR_TOOL_ACTIONS[name]}, who, context); break;
      case 'document.read': result = await readDocument(input, who, context); break;
      case 'document.find': result = await find(input, who, context); break;
      case 'document.edit': result = await applyEdits(input, who, context); break;
      case 'document.undo': result = await undo({...input, change_id: input.target?.act_id, turn_id: input.target?.turn_id}, who, context); break;
      case 'comparison.present': result = input.action === 'show'
        ? await showChanges({...input, change_id: input.target?.act_id, turn_id: input.target?.turn_id}, who, context) : await compareAction(input, who, context); break;
      case 'document.replace': result = await openText(input, who, context); break;
      case 'editor.point': result = await point(input, who, context); break;
      case 'editor.set_preferences': result = askEditor(name, input, who, context); break;
      case 'editor.set_view': {
        if (input.preference !== undefined || input.value !== undefined) {
          result = failure('editor_arguments_invalid', 'invalid', {hint: 'Pass view alone, or pass preference and value together.'}); break;
        }
        if (typeof host.setView !== 'function') { result = failure('view_unavailable', 'refused', {hint: 'Open the document in its connected editor, then retry.'}); break; }
        const value = await host.setView({documentId: state.documentId, revision: state.revision, view: input.view, ...who, signal: context.signal});
        const view = {...(typeof host.view === 'function' ? host.view() : {}), requested: input.view,
          ...(value?.viewId ? {id: value.viewId} : {}), status: value?.pending ? 'pending' : value?.ok ? 'presented' : 'refused'};
        result = value?.pending ? {outcome: 'pending', reason: 'presentation_pending', view}
          : value?.ok ? accepted({view}) : failure(value?.reason || 'view_unavailable', value?.outcome || 'refused',
            {view, hint: value?.hint || 'Open the document in its connected editor and select an available view.'});
        break;
      }
      case 'editor.reveal': {
        const change = changeOf(input.context_handle);
        if (change) {
          if (typeof host.revealChange !== 'function') { result = failure('reveal_unavailable'); break; }
          const value = await host.revealChange({ documentId: state.documentId, revision: state.revision, compareId: state.compare.id, changeId: change.id,
            hostCompareId: state.compare.hostCompareId || null,
            start: change.start, end: change.end, incomingStart: change.incomingStart, incomingEnd: change.incomingEnd,
            removed: change.removed, inserted: change.inserted, currentText: state.compare.baseline, incomingText: state.compare.incoming,
            index: state.compare.changes.indexOf(change), ...who, signal: context.signal });
          result = value?.pending && value.viewId ? { outcome: 'pending', reason: 'presentation_pending', view: {id: value.viewId, status: 'pending'} }
            : value?.ok ? accepted({ revealed: true }) : failure(value?.reason || 'view_changed');
          break;
        }
        const held = lookup('handles', input.context_handle, who);
        if (held.outcome) { result = held; break; }
        const range = relocate(held);
        if (range.outcome) { result = range; break; }
        if (typeof host.reveal !== 'function') { result = failure('reveal_unavailable'); break; }
        const value = await host.reveal({ documentId: state.documentId, revision: state.revision, start: range.start, end: range.end,
          ...who, signal: context.signal });
        result = value?.pending && value.viewId ? { outcome: 'pending', reason: 'presentation_pending', view: {id: value.viewId, status: 'pending'} }
          : value?.ok ? accepted({ revealed: true }) : failure(value?.reason || 'view_changed'); break;
      }
      case 'document.create_return':
        result = typeof host.createReturn === 'function' ? await host.createReturn() : failure('return_unavailable');
        break;
      case 'document.wait_for_user': {
        if (typeof host.wait !== 'function') { result = failure('wait_unavailable'); break; }
        const mode = input.mode || 'message';
        if (!['message', 'selection'].includes(mode)) { result = failure('wait_mode_invalid', 'invalid'); break; }
        result = await host.wait({ documentId: state.documentId, revision: state.revision, mode,
          timeout_ms: waitTimeout(input.timeout_ms), after_return_id: input.after_return_id, ...who, signal: context.signal });
        if (!result || typeof result !== 'object') result = failure('wait_unavailable');
        break;
      }
      case 'document.save': {
        if (input.expected_revision !== undefined && input.expected_revision !== state.revision) {result = failure('document_changed', 'conflict'); break;}
        if (typeof host.save !== 'function') { result = failure('save_unavailable'); break; }
        const request = {documentId: state.documentId, revision: state.revision, filename: state.filename, text: state.text,
          ...who, signal: context.signal};
        let value;
        try {value = await host.save(request);}
        catch {result = failure('save_unconfirmed', 'uncertain', {sourceChanged: false}); break;}
        result = {
          outcome: value?.outcome === 'unacknowledged' ? 'uncertain' : clip(value?.outcome || (value?.ok ? 'ok' : 'refused'), 64),
          ...(!['uncertain', 'unacknowledged'].includes(value?.outcome) && typeof value?.saved === 'boolean' ? {saved: value.saved} : {}),
          destination: value?.destination || 'unconfirmed', sourceChanged: false,
          verified: value?.verified === true, confirmed: value?.confirmed === true,
          filename: request.filename,
          ...(value?.saveStatus ? { saveStatus: clip(value.saveStatus, 64) } : {}),
          ...(value?.reason ? { reason: clip(value.reason, 160) } : !value?.ok ? { reason: 'save_refused' } : {}),
          ...(value?.savedDocumentId ? { savedDocumentId: clip(value.savedDocumentId, 256) } : {}),
          ...(safeInt(value?.savedDocumentRevision) ? {savedDocumentRevision: value.savedDocumentRevision} : {}),
          ...(value?.binding ? {binding: value.binding} : {}),
        };
        break;
      }
      case 'document.draw': result = await drawPicture({...input, ...input.target}, who, context); break;
      case 'svg.edit': result = state.docKind !== 'markdown' ? failure('draw_requires_markdown', 'invalid')
        : await drawSVGEdit(input, who, context); break;
      // The host retains a file from settled source; document source, revision and edit history stay unchanged.
      case 'document.export': result = await exportDocument(input, who, context); break;
      case 'notes.find': result = await notesList(input, who, context); break;
      case 'notes.read': result = await notesRead(input, who, context); break;
      case 'notes.open': result = await notesOpen(input, who, context); break;
      case 'notes.write': result = await notesWrite(input, who, context); break;
      case 'notes.set': result = await notesSet(input, who, context); break;
      case 'notes.history': result = await notesHistory(input, who, context); break;
      case 'notes.sync': result = await notesSync(input, who, context); break;
      default: result = failure('operation_unknown', 'invalid');
    }
    if (descriptor.effect === 'read' && documentGuardFailure(context)) {
      for (const [pool, before] of [['handles', beforeHandles], ['refs', beforeRefs], ['cursors', beforeCursors]])
        for (const id of Object.keys(state[pool])) if (!before.has(id)) delete state[pool][id];
      result = documentGuardFailure(context);
    }
    if (result?.drawingPatch && bytes(JSON.stringify(stamp(result))) > LIMITS.resultBytes) {
      const {asset, reference, occurrence, targetOccurrence, transactionId} = result.drawingPatch;
      result = {...result, drawingPatch: {asset, reference, occurrence, targetOccurrence, transactionId,
        complete: false, reason: 'semantic_patch_in_journal'}};
    }
    const output = stamp(publicWriteReceipt(result || failure('operation_failed')));
    let finalOutput = output;
    if (bytes(JSON.stringify(output)) <= LIMITS.resultBytes) {
      if (resumed) {
        const observation = state.cursors[output.observation_cursor];
        remember(state.resume, who, {revision: observation?.revision ?? state.revision,
          ...(observation?.seenChanges ? {seenChanges: observation.seenChanges} : {})});
      }
    } else {
      for (const id of Object.keys(state.handles)) if (!beforeHandles.has(id)) delete state.handles[id];
      finalOutput = boundedResult(output, {limit: LIMITS.resultBytes + 1, readOnly: descriptor.effect === 'read'});
      if (output.pending?.kind === 'surface-fact' && finalOutput.outcome !== 'pending') pendingFacts.delete(output.pending.requestId);
    }
    // Recorded for fresh invocations and settled continuations; a plain retry never reaches here.
    return finalize(finalOutput);
    } catch (error) {
      if (error?.name === 'AbortError' || context.signal?.aborted) return finalize(name === 'document.draw' ? drawingReceipt(failure('cancelled')) : failure('cancelled'));
      // A schema fault names its field, as every other refusal does.
      if (error instanceof TypeError || error?.code === 'invalid_arguments') return finalize(failure(clip(error.message, 160), 'invalid', error?.path ? {field: String(error.path).replace(/^arguments\.?/, '')} : undefined));
      throw error;
    } finally {
      if (workKey) {
        const held = working.get(workKey);
        if (held?.count > 1) held.count--;
        else working.delete(workKey);
        publishPresence();
      }
    }
  }

  function invoke(name, input = {}, context = {}) {
    if (name === 'document.wait_for_user' && waitPending) return Promise.resolve(stamp(failure('wait_already_pending')));
    if (name === 'document.wait_for_user') waitPending = true;
    const run = async () => {
      try { return await execute(name, input, context); }
      finally { if (name === 'document.wait_for_user') waitPending = false; }
    };
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return Object.freeze({ invoke, replay, snapshot, reconcile, undoHistoryAct, humanContext, pointResult, collaboration, drawingContext: drawingSummary, invocationJournal: invocationJournalEntries });
}
