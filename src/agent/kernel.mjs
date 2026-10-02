// Rapier shared document kernel. SPDX-License-Identifier: AGPL-3.0-only.
import { parseWill, willMarkerOf, willRegionsIn, willTouchesMarker, willGovern, willIntentOf, stripOneTerminator } from './will.mjs';
import { diffLines } from './diff.mjs';
import { outlineMarkdown } from './markdown.mjs';
import { changedReferenceRegion } from './references.mjs';
import { assetOmissions, retireDeletedImageDefinitions, documentAssets, markdownParser, normalizeLabel, createAsset, appendAsset, appendAssetText, escapeImageAlt, decodeDataImage } from '../images/assets.mjs';
import { _rapierDrawNormalizeAgentRecipe, _rapierDrawBuildSVG, _rapierDrawNextAssetName, _rapierDrawApplyShapesPatch, _rapierDrawReadRecipeFromSVGText, _rapierDrawFigureFault } from '../draw/core.mjs';
import { applyOperations } from '../draw/edit.mjs';
import { parseLayout } from '../layout/markdown.mjs';
import { getTool, validateInput } from './catalog.mjs';
import { _rapierTransformSplices as transformSplices } from '../editor/journal-records.mjs';
import { pairMarkers, hasInkMarker, hasColorMarker } from '../spec/md-marks.mjs';
import {parseComments, commentThreads, commentAnchor, commentSourceRange, commentSplices, writeComments, commentSummary, commentUndoSplice, imageCommentTarget} from './comments.mjs';
import {visualRequest, visualResult} from './visual.mjs';

// The door and the editor replay exactly one splice law, including every intermediate row.
export { transformSplices };

export const LIMITS = Object.freeze({
  documentBytes: 25 * 1024 * 1024, editChars: 262144, edits: 16,
  readChars: 4096, resultBytes: 12288, handles: 64, refs: 128, cursors: 64,
  authorityBytes: 1024 * 1024, lifetimeMs: 300000,
  journalEntries: 500, journalBytes: 4 * 1024 * 1024,
  compareBytes: 8 * 1024 * 1024, compareLines: 100000, compareChanges: 1200,
  humanContexts: 8, presenceMs: 15000, reviewMs: 120000, principals: 16, invocationKeys: 256,
  drawAlt: 240,
});
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const bytes = value => encoder.encode(value).byteLength;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// A refusal names its next step (docs/kernel.md, "A refusal carries a hint"): one sentence a caller can act on. The
// reason stays the contract; the hint is advice, present only for the reasons below.
const HINTS = {
  context_missing: 'This handle is unknown here or was consumed; call find or read_context again for a fresh handle.',
  context_expired: 'This handle has expired; call find or read_context again for a fresh handle.',
  reference_missing: 'This ref is unknown here; call get_outline or find again for a fresh ref.',
  document_replaced: 'The document was replaced; call get_context, then read again before editing.',
  document_changed: 'The document changed since this handle was read; read_context again and resend with the fresh handle.',
  target_changed: 'The passage changed since it was read; read_context again and resend with the fresh handle.',
  context_handle_wrong_kind: 'This handle is not for this call: edit with a handle from find or read_context, decide a comparison with a change handle, edit a drawing with its recipe_handle.',
  authority_mismatch: 'This handle or ref belongs to another caller; obtain your own with find, read_context or get_outline.',
  change_not_inspected: 'Read each difference with read_context by its change handle before accepting it.',
  change_missing: 'No such change; get_context lists the changes since your last look.',
  change_not_owned_or_unavailable: 'That change is not yours to reverse, or is no longer reversible; get_context lists the changes.',
  no_agent_change: 'No change under this agent name to undo; name change_id, or the agent name that made it.',
  other_agent_latest: 'The latest change is another agent\'s; name its change_id to undo it.',
  compare_not_open: 'No comparison is open; open one with compare, or show one of your changes with show_changes.',
  edits_overlap: 'Two edits cover the same text; merge them into one edit.',
  batch_too_large: 'Send fewer edits in one call.',
  draw_shape_limit: 'A drawing holds 1 to 128 shapes; send fewer.',
  draw_alt_required: 'Give alt, a short caption of the drawing.',
  draw_requires_markdown: 'Drawings live in Markdown documents only.',
  figures_invalid: 'Each figure names a kind from kinds and the fields the tool description lists for it.',
  recipe_invalid: 'Send figures, or a recipe exactly as read_context returned it.',
  document_read_only: 'The person set this workspace read-only; ask them, or propose_edits.',
  document_law: 'The Will in the document refuses this change; read the Will from get_context and keep to it.',
  human_edit_in_progress: 'The person is editing; wait for their input to settle, then get_context and retry.',
  human_review_required: 'The person\'s review is required before this applies; wait_for_user or check get_context, do not resend.',
  review_pending: 'One review at a time; wait for the pending one to settle.',
  editor_not_present: 'No editor is open on this workspace: get_context reports headless, so deliver the page through a file surface or ask the person to open Rapier.',
  presentation_already_pending: 'A reveal is already pending; check its view status in get_context before another.',
  wait_already_pending: 'One wait at a time; the earlier wait must finish first.',
  notes_folder_unreadable: 'Notes could not answer just now; try again later.',
  world_changed: 'The document changed during the call; call again.',
  outline_changed: 'The document changed during the call; call get_outline again.',
  search_changed: 'The document changed during the call; call find again.',
  read_snapshot_changed: 'The document changed during the call; read_context again.',
  comment_missing: 'Call list_comments for the current thread ids before replying or resolving.',
  comment_text_invalid: 'Send a nonempty comment of at most 4096 UTF-8 bytes.',
  comment_anchor_invalid: 'Read the exact passage or drawing again, then use that handle and an existing object id.',
  comments_appendix_unavailable: 'Finish the unclosed Markdown block at the end of the document before adding a comment.',
};
// The figure kinds draw/core.mjs admits (_rapierDrawFigureFault's kind check), answered beside a refused figures list.
const FIGURE_KINDS = Object.freeze(['rect', 'ellipse', 'circle', 'triangle', 'diamond', 'hexagon', 'cylinder', 'subroutine', 'asymmetric', 'text', 'line', 'arrow', 'group']);
const failure = (reason, outcome = 'refused', detail = {}) => ({ outcome, reason, ...(HINTS[reason] && !Object.hasOwn(detail, 'hint') ? { hint: HINTS[reason] } : {}), ...detail });
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
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[\x00-\x1f\x7f/\\]/.test(value) && value !== '.' && value !== '..';
}

export function minimalSplice(before, after) {
  let start = 0, left = before.length, right = after.length;
  while (start < left && start < right && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (!safeBoundary(before, start) || !safeBoundary(after, start)) start--;
  while (left > start && right > start && before.charCodeAt(left - 1) === after.charCodeAt(right - 1)) { left--; right--; }
  if (!safeBoundary(before, left) || !safeBoundary(after, right)) { left++; right++; }
  return { pos: start, removed: before.slice(start, left), inserted: after.slice(start, right) };
}

function transportInterval(start, end, splices) {
  let a = start, b = end;
  for (const row of splices) {
    if (!safeInt(row.pos)) return null;
    if (row.pos + row.removed.length <= a) {
      const delta = row.inserted.length - row.removed.length;
      a += delta; b += delta;
    } else if (row.pos < b || (a === b && row.pos < a && row.pos + row.removed.length > a)) return null;
  }
  return { start: a, end: b };
}

function digest(text) {
  let fnv = 0x811c9dc5, a = 1, b = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 16777619); a = (a + code) % 65521; b = (b + a) % 65521;
  }
  return `${text.length}:${fnv >>> 0}:${((b << 16) | a) >>> 0}`;
}

// Sorted keys; array order kept. No cycle guard: input is decoded JSON.
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
}

// Filenames the receipt's structural parse applies to (docs/kernel.md, "The census").
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
  return { engine: value.engine || 'acorn@8.18.0',
    parse, ...(parse === 'not_checked' ? { reason: after.status || 'structure_unavailable' } : {}),
    complete: value.complete === true,
    added_declarations: added.slice(0, 8), removed_declarations: removed.slice(0, 8), changed_declarations: changed.slice(0, 8),
    omitted: Math.max(0, added.length - 8) + Math.max(0, removed.length - 8) + Math.max(0, changed.length - 8),
    ...(value.omissions?.length ? { omissions: value.omissions.slice(0, 3).map(row => ({ domain: row.domain, reason: row.reason })) } : {}) };
}

function participant(context = {}, mintId) {
  const source = typeof context.actor === 'object' ? context.actor.kind : context.actor;
  const actor = source || 'agent';
  const principal = String(context.principal || (typeof context.actor === 'object' ? context.actor.id : '') || 'session');
  if (!['human', 'agent', 'system'].includes(actor) || !principal || principal.length > 160) throw new TypeError('Invalid participant');
  return { actor, principal, transport: String(context.transport || 'platform'), requestId: clip(context.requestId || mintId('call_'), 160),
    invocationKey: clip(context.invocationKey || mintId('key_'), 160) };
}
const ownerOf = who => `${who.transport}:${who.actor}:${who.principal}`;
const sameOwner = (record, who) => record.owner === ownerOf(who);

// documentId is minted once (injected mintId). clock starts at 0, never Date.now(): createKernel's monotonic max dominates (docs/kernel.md, "The census").
export function createState({ id, documentId, filename = 'Untitled.md', text = '', docKind, revision = 0, posture = 'free', mintId } = {}) {
  const invalid = admissibleSnapshotText(text);
  if (invalid || !validName(filename)) throw new TypeError(invalid || 'filename_invalid');
  const kind = docKind || documentKind(filename);
  if (!['markdown', 'text', 'code'].includes(kind)) throw new TypeError('document_kind_invalid');
  const resolvedId = documentId || id || (typeof mintId === 'function' ? mintId('doc_') : null);
  if (!resolvedId) throw new TypeError('document_id_required');
  return {
    documentId: String(resolvedId), revision: safeInt(revision) ? revision : 0,
    filename, docKind: kind, text, readOnly: false, posture: ['free', 'check', 'ask'].includes(posture) ? posture : 'free', selection: null, focus: null,
    journal: [], handles: {}, refs: {}, cursors: {}, compare: null,
    humanContexts: {}, contextSequences: {}, review: null, reviewed: {}, resume: {},
    history: { earliestRevision: safeInt(revision) ? revision : 0, trimmedBytes: 0, complete: true,
      unreviewed: {}, unknownReviewRevision: 0 }, reviewedRevision: 0,
    clock: 0,
  };
}

function journalBytes(entry) {
  return entry.splices.reduce((sum, row) => sum + bytes(row.removed) + bytes(row.inserted), 0);
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
    if (!after.startsWith(before)) return { law: 'append', rule: 'law_violated', region: region.index };
  }
  return null;
}

export function imageDeletionSplices(before, after, splices, actor = 'human') {
  const rows = retireDeletedImageDefinitions(before, after, splices);
  if (!rows.length || actor !== 'agent') return rows;
  const will = parseWill(after);
  return rows.filter(row => !regionVerdict(will, row));
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

// What an edit would break of the paired marks it meets, or null. A marker left standing alone that holds bytes of a marker of a pair, from
// text no row wrote, is a pair severed (an opener cut into is no marker, and then its closer is what stands alone); the pair is
// named by where it stands in the document. More empty pairs than the document held is a pair written empty, whoever wrote its
// comments. A marker standing alone that the edit wrote is its author's own, and a stray that was one already is not the edit's.
function markerBroken(before, after, rows, kind) {
  const was = pairMarkers(before, kind).runs;
  if (!was.length && !rows.some(row => (kind === 'color' ? hasColorMarker : hasInkMarker)(row.inserted))) return null;
  const now = pairMarkers(after, kind);
  const pairAt = at => {
    let low = 0, high = was.length;
    while (low < high) { const mid = (low + high) >> 1; if (was[mid].end <= at) low = mid + 1; else high = mid; }
    const run = was[low];
    return run && at >= run.start && (at < run.innerStart || at >= run.innerEnd) ? run : null;
  };
  for (const stray of now.strays) {
    for (let at = stray.start; at < stray.end; at++) {
      const from = markerOffsetBefore(rows, at), pair = from >= 0 && pairAt(from);
      if (pair) return { rule: 'marker_stranded', start: pair.start, end: pair.end };
    }
  }
  const empty = run => run.innerStart === run.innerEnd;
  return now.runs.filter(empty).length > was.filter(empty).length ? { rule: 'pair_emptied' } : null;
}

// A pair an edit emptied goes with its words, so no empty pair is ever written: both markers of each empty pair whose two markers
// the rows left as they were and stood in pairs with words before. They remove only what stood before, each marker as a row of
// its own, the opener then the closer, so the change still reverses around the point its words went from. A pair that was empty
// before, and one the edit wrote, are not the edit's to clear.
function markerDeletionSplices(before, after, rows, actor, kind) {
  const opened = new Set(), closed = new Set();
  for (const run of pairMarkers(before, kind).runs) if (run.innerEnd > run.innerStart) { opened.add(run.start); closed.add(run.innerEnd); }
  if (!opened.size) return [];
  const unchanged = (start, end) => {
    const from = markerOffsetBefore(rows, start), last = markerOffsetBefore(rows, end - 1);
    return from >= 0 && last === from + end - 1 - start && before.slice(from, from + end - start) === after.slice(start, end) ? from : -1;
  };
  let gone = pairMarkers(after, kind).runs.filter(run => run.innerEnd === run.innerStart &&
    opened.has(unchanged(run.start, run.innerStart)) && closed.has(unchanged(run.innerEnd, run.end))).reverse();
  if (gone.length && actor === 'agent') {
    const will = parseWill(after);
    gone = gone.filter(run => !regionVerdict(will, { pos: run.start, removed: after.slice(run.start, run.end), inserted: '' }));
  }
  return gone.flatMap(run => [{ pos: run.start, removed: after.slice(run.start, run.innerStart), inserted: '' },
    { pos: run.start, removed: after.slice(run.innerEnd, run.end), inserted: '' }]);
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
  reviewedRegion = null, restores = false, bodyOnly = false, referenceCheck} = {}) {
  const regions = [];
  for (const region of before.regions) {
    if (region.law === 'edit' || region.index === reviewedRegion) continue;
    const was = beforeText.slice(region.start, region.end), following = after.regions[region.index];
    if (!following) return {law: region.law, rule: 'law_violated', region: region.index};
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
  catch (_) { return {law: regions[0].law, rule: 'law_violated', region: regions[0].index}; }
  const region = regions.find(row => row.index === index);
  return region ? {law: region.law, rule: 'law_violated', region: region.index} : null;
}

const willFaults = will => will.faults.slice(0, 4).map(fault => ({ mode: fault.mode, line: fault.line }));
export function enforceWill(beforeText, afterText, splices, { docKind = 'markdown', actor = 'agent', restores = false, reviewedRegion = null, referenceCheck } = {}) {
  if (actor !== 'agent' || docKind !== 'markdown') return null;
  const before = parseWill(beforeText), after = parseWill(afterText);
  if (!before.present && !after.present) return null;
  // A faulted Will keeps the whole document; the refusal names the faults (mode and line), so the agent knows the marker to
  // mend or to ask the person about, instead of reading a bare rule (the lane of 26 September, walked as the agent).
  if (before.faults.length) return { law: 'keep', rule: 'before_faulted', faults: willFaults(before) };
  // Marker custody precedes the resulting parse. Execution order is right to left; a refusal names
  // the first affected region in the document, retaining the original splice index for the caller.
  let touched = null;
  if (!restores) for (let index = 0; index < splices.length; index++) {
    const row = splices[index], marker = willTouchesMarker(before, row.pos, row.pos + row.removed.length);
    if (marker && (!touched || (marker.index ?? Infinity) < (touched.region ?? Infinity))) {
      touched = { law: marker.law, rule: 'marker_span_touched', editIndex: index,
        ...(safeInt(marker.index) ? { region: marker.index } : {}) };
    }
  }
  if (touched) return touched;
  if (after.faults.length) return { law: 'keep', rule: 'result_faulted', faults: willFaults(after) };
  if (before.markers.length !== after.markers.length || before.markers.some((marker, index) =>
      marker.kind !== after.markers[index].kind || beforeText.slice(marker.start, marker.end) !==
        afterText.slice(after.markers[index].start, after.markers[index].end))) {
    return { law: 'keep', rule: 'marker_sequence_mismatch' };
  }
  // Body laws judge the whole act. Individual splices can cancel without changing any governed
  // byte; marker custody above remains strict even when marker bytes are written back identically.
  for (let index = 0; index < before.regions.length; index++) {
    const region = before.regions[index];
    const was = beforeText.slice(region.start, region.end);
    const now = afterText.slice(after.regions[index].start, after.regions[index].end);
    if (region.law === 'append' && !restores && !now.startsWith(stripOneTerminator(was))) {
      return { law: 'append', rule: 'law_violated', region: index };
    }
    if (region.law !== 'keep') continue;
    if (index === reviewedRegion && splices.length === 1) continue;
    if (was === now) continue;
    const moved = minimalSplice(was, now);
    if (restores && splices.some(row => {
      const wrote = minimalSplice(row.removed, row.inserted);
      return row.pos + wrote.pos === region.start + moved.pos &&
        row.pos >= region.start && row.pos + row.removed.length <= region.end &&
        wrote.removed === moved.removed && wrote.inserted === moved.inserted;
    })) continue;
    return { law: 'keep', rule: 'law_violated', region: index };
  }
  return enforceWillReferences(beforeText, afterText, {before, after, restores, reviewedRegion, referenceCheck});
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
  if (op === 'document.get_outline') return { structure: { mode: 'outline' } };
  if (op === 'document.find' && typeof args.kind === 'string' && !args.cursor) {
    return { structure: { mode: 'find', query: args.query, kind: args.kind, within: args.within || null, offset: 0 } };
  }
  return null;
}

export function createKernel({ state: supplied, host = {}, clock, mintId, invocationJournal: suppliedJournal } = {}) {
  if (typeof clock !== 'function') throw new TypeError('createKernel requires an injected clock');
  if (typeof mintId !== 'function') throw new TypeError('createKernel requires an injected id minter');
  let state = supplied ? clone(supplied) : createState({ mintId });
  if (!state || typeof state.text !== 'string' || !state.documentId || !safeInt(state.revision) ||
      !Array.isArray(state.journal) || !state.handles || !state.refs || !state.cursors || !state.history ||
      !state.humanContexts || !state.contextSequences || !state.reviewed || !state.resume) {
    throw new TypeError('Invalid Rapier state');
  }
  let queue = Promise.resolve();
  let outlineCache = null;
  let imageCache = null;
  let waitPending = false;
  let pendingInspection = null;
  // Surface-fact continuations: ephemeral, never journalled.
  const pendingFacts = new Map();
  // Invocation journal (docs/kernel.md, "Two identities"): top-level invocations by key once settled; a retransmission replays, anything else collides.
  // "Same base revision" means the revision the original SETTLED at: nothing else has moved the document since.
  // inputDigest must match too: a reused name with different arguments collides. A seeded row without a digest is skipped.
  // An identity acts once: a read's receipt is bounded (a replayed read only recomputes); a mutation's is kept for the
  // document's life, its output bounded -- past the bound only its settled revision and a short digest remain (`spent`),
  // enough to replay or collide and never to run again.
  const invocationJournal = new Map(), readJournal = new Map(), spentJournal = new Map();
  const reading = operation => getTool(operation)?.effect === 'read';
  const short = value => String(value).slice(0, 12);
  function bound() {
    while (readJournal.size > LIMITS.invocationKeys) readJournal.delete(readJournal.keys().next().value);
    while (invocationJournal.size > LIMITS.invocationKeys) {
      const [key, record] = invocationJournal.entries().next().value;
      invocationJournal.delete(key);
      spentJournal.set(key, { settledRevision: record.settledRevision, digest: short(record.inputDigest) });
    }
  }
  // Reseeded by a door that re-creates the kernel per request (mcp/worker.mjs). Malformed or undigested rows are skipped, never thrown.
  if (Array.isArray(suppliedJournal)) {
    for (const entry of suppliedJournal) {
      if (Array.isArray(entry?.spent)) {
        for (const row of entry.spent) if (Array.isArray(row) && typeof row[0] === 'string' && row[0] && typeof row[2] === 'string')
          spentJournal.set(row[0], { settledRevision: safeInt(row[1]) ? row[1] : 0, digest: row[2] });
        continue;
      }
      if (!entry || typeof entry.key !== 'string' || !entry.key || typeof entry.operation !== 'string' || !entry.documentId || typeof entry.inputDigest !== 'string') continue;
      (reading(entry.operation) ? readJournal : invocationJournal).set(entry.key, { operation: entry.operation, documentId: entry.documentId,
        settledRevision: safeInt(entry.settledRevision) ? entry.settledRevision : 0, output: clone(entry.output ?? {}), inputDigest: entry.inputDigest });
    }
    bound();
  }
  function recordInvocation(key, operation, documentId, output, inputDigest) {
    if (!key) return;
    invocationJournal.delete(key); readJournal.delete(key); spentJournal.delete(key);
    (reading(operation) ? readJournal : invocationJournal).set(key, { operation, documentId, settledRevision: output.documentRevision, output: clone(output), inputDigest });
    bound();
  }
  // The receipt for a key: whole, or spent (a mutation whose output the bound let go). Null when the key never acted.
  function priorInvocation(key) {
    const whole = invocationJournal.get(key) || readJournal.get(key);
    if (whole) return whole;
    const spent = spentJournal.get(key);
    return spent ? { spent: true, settledRevision: spent.settledRevision, digest: spent.digest } : null;
  }
  // Replay, or null when the key collides: the same arguments on the revision the original settled at.
  function replayOf(prior, name, inputDigest) {
    if (prior.spent) return prior.settledRevision === state.revision && prior.digest === short(inputDigest)
      ? stamp({ outcome: 'replayed', replayed: true, reason: 'receipt_output_spent' }) : null;
    return prior.operation === name && prior.documentId === state.documentId && prior.settledRevision === state.revision &&
      prior.inputDigest === inputDigest ? { ...clone(prior.output), replayed: true } : null;
  }
  // Beside `state`, never in it. Oldest first, JSON-round-trippable: one row of spent identities ([key, revision, digest]),
  // then whole mutations, then reads.
  function invocationJournalEntries() {
    const whole = ([key, record]) => ({ key, operation: record.operation, documentId: record.documentId,
      settledRevision: record.settledRevision, output: clone(record.output), inputDigest: record.inputDigest });
    return (spentJournal.size ? [{ spent: [...spentJournal].map(([key, record]) => [key, record.settledRevision, record.digest]) }] : [])
      .concat([...invocationJournal].map(whole), [...readJournal].map(whole));
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
    // Bounded (R65-30): the oldest goes.
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
    // Content outlives authority (K08): expiresAt is an authority clock, not a status. A lapsed review stays pending and readable;
    // surviveReview revalidates at decision. Renewal is the person's act.
  }

  function invalidateReview(reason = 'document_changed') {
    if (state.review?.status !== 'pending') return;
    state.review.status = 'invalidated'; state.review.reason = reason; state.review.decidedAt = now();
  }

  // A handle-carrying proposal survives edits: changes relocate through their handles (docs/kernel.md, "A review is decided over time").
  // review.changes[i].handleId aligns with splices[i] and changeIds[i] (storage order, last-first). Other reviews invalidate on change.
  function reviewSurvivesEdits(review = state.review) {
    return review?.status === 'pending' && review.kind === 'proposal'
      && Array.isArray(review.handleIds) && review.handleIds.length
      && Array.isArray(review.changes) && review.changes.length
      && !review.options?.compareDecision;
  }

  function pendingChangeIds(review) {
    if (Array.isArray(review.changes) && review.changes.length) {
      return review.changes.filter(row => row.status === 'pending').map(row => row.id);
    }
    return Array.isArray(review.changeIds) ? [...review.changeIds] : [];
  }

  function sortChangeIds(ids) {
    return [...ids].sort((a, b) => Number(String(a).split('.').pop()) - Number(String(b).split('.').pop()));
  }

  function publicReviewChanges(review, rich) {
    if (!Array.isArray(review.changes) || !review.changes.length) return null;
    return review.changes.map((row, index) => {
      const splice = review.splices[index];
      const out = { id: row.id, status: row.status, ...(row.reason ? { reason: row.reason } : {}) };
      if (rich && splice) { out.pos = splice.pos; out.removed = splice.removed; out.inserted = splice.inserted; }
      return out;
    });
  }

  // `assets` and `handlePairs` are index-aligned with `rows`. A drawing stages one authored change, its occurrence; definition and retirement
  // derive at commit. handlePairs come from the author, never reconstructed from as-minted bounds (K03). `evidence` clones the handle's disclosed
  // span, revision and content at staging, so a decision can revalidate after the handle's lifetime.
  function initReviewChanges(reviewId, rows, authored, handlePairs, assets) {
    return rows.slice(0, authored).map((splice, index) => {
      const paired = handlePairs?.[index];
      const held = paired?.handleId ? state.handles[paired.handleId] : null;
      return { id: reviewId + '.' + (authored - index), status: 'pending',
        handleId: paired?.handleId ?? null, offset: paired?.offset ?? 0,
        // A1-K03 evidence: the handle's span, revision, content and (Draw) asset identity, cloned while fresh.
        ...(held ? { evidence: { start: held.start, end: held.end, revision: held.revision, text: held.text,
          digest: digest(held.text), ...(held.kind === 'draw' ? { assetLabel: held.assetLabel, assetDigest: held.assetDigest } : {}) } } : {}),
        ...(assets?.[index] ? { asset: assets[index] } : {}) };
    });
  }

  function refreshReviewExpiry(review) {
    const pending = (review.changes || []).filter(row => row.status === 'pending' && row.handleId);
    const handleExpiry = pending.map(row => state.handles[row.handleId]?.expiresAt).filter(Number.isFinite);
    review.expiresAt = Math.min(review.createdAt + LIMITS.reviewMs, ...handleExpiry);
    review.editCount = (review.changes || []).filter(row => row.status === 'pending').length;
  }

  // Pure. Runs at decision, get_context and collaboration(); never on the commit path.
  function surviveReview({ invalidateIfEmpty = true } = {}) {
    const review = state.review;
    if (!reviewSurvivesEdits(review)) return;
    if (review.documentId !== state.documentId || review.filename !== state.filename || review.docKind !== state.docKind) {
      invalidateReview();
      return;
    }
    if (review.revision === state.revision && review.sourceDigest === digest(state.text)) return;
    const who = participant(review, mintId);
    if (review.splices.length > review.changes.length) review.splices = review.splices.slice(0, review.changes.length);
    let pending = 0;
    for (let index = 0; index < review.changes.length; index++) {
      const change = review.changes[index];
      if (change.status !== 'pending') continue;
      if (!change.handleId) {
        change.status = 'stale'; change.reason = 'target_changed'; continue;
      }
      const held = peekHandle(change.handleId, who);
      // A lapsed or evicted handle ends agent authority, not the person's decision: only a real conflict stales from the live row;
      // otherwise fall back to retained evidence. Preview and decision share this path.
      if (held.outcome && !['context_expired', 'context_missing'].includes(held.reason)) {
        change.status = 'stale'; change.reason = held.reason; continue;
      }
      if (!change.evidence) { change.status = 'stale'; change.reason = held.reason || 'target_changed'; continue; }
      // An unchanged ![alt][label] is not an unchanged drawing: a human may have replaced
      // its definition. Retain this binding beyond handle expiry, eviction and re-anchoring.
      if (typeof change.evidence.assetLabel === 'string' &&
          assetDigest(change.evidence.assetLabel) !== change.evidence.assetDigest) {
        change.status = 'stale'; change.reason = 'target_changed'; continue;
      }
      const range = relocate(change.evidence);
      if (range.outcome) { change.status = 'stale'; change.reason = range.reason; continue; }
      // Advance the anchor so a later history trim cannot orphan evidence.
      change.evidence = { ...change.evidence, start: range.start, end: range.end, revision: state.revision, text: state.text.slice(range.start, range.end) };
      const splice = review.splices[index];
      const drawInsertion = review.operation === 'document.draw' && change.asset && !splice.removed;
      let pos = range.start + (change.offset || 0);
      if (drawInsertion) {
        // Transport the insertion point through the journal; never widen the read handle.
        const entries = since(review.revision);
        let point = entries && { start: splice.pos, end: splice.pos };
        for (const entry of entries || []) if (point) point = transportInterval(point.start, point.end, entry.splices);
        if (!point) { change.status = 'stale'; change.reason = 'target_changed'; continue; }
        pos = point.start;
        // Human text at the boundary can change the separators' Markdown role.
        let placed = false;
        try {
          const candidate = appendAssetText(transformSplices(state.text, [{ ...splice, pos }]), change.asset).source;
          const occurrence = pos + splice.inserted.length - splice.inserted.trimStart().length;
          const facts = outlineMarkdown(candidate, { limit: 0 }, markdownParser());
          placed = facts.images?.entries.some(row => row.blockStart === occurrence && row.id === change.asset.id);
        } catch {}
        if (!placed) { change.status = 'stale'; change.reason = 'draw_placement_unavailable'; continue; }
      }
      if (!safeInt(pos) || pos + splice.removed.length > (drawInsertion ? state.text.length : range.end) ||
          state.text.slice(pos, pos + splice.removed.length) !== splice.removed) {
        change.status = 'stale'; change.reason = 'target_changed'; continue;
      }
      splice.pos = pos;
      pending++;
    }
    if (!pending) {
      if (invalidateIfEmpty) invalidateReview();
      else { review.revision = state.revision; review.sourceDigest = digest(state.text); refreshReviewExpiry(review); }
      return;
    }
    review.revision = state.revision;
    review.sourceDigest = digest(state.text);
    refreshReviewExpiry(review);
  }

  // Model-facing: ids, statuses, counts and a bounded inserted excerpt; never splice text (K04). changes keep storage order (get_context's contract).
  function contextReviewProjection(review) {
    return review ? reviewSummary(review, true) : null;
  }

  // Explain the existing review owner; a protected passage can need a decision even under FREE.
  const reviewCause = review => review.law ? 'will' : review.kind === 'check' ? 'check' : review.byPosture ? 'ask' : 'proposal';

  function reviewSummary(review = state.review, context = false) {
    if (!review) return null;
    const pending = pendingChangeIds(review);
    const changes = publicReviewChanges(review, false);
    return { id: review.id, kind: review.kind, status: review.status, cause: reviewCause(review), revision: review.revision,
      expiresAt: review.expiresAt, label: review.label, editCount: review.editCount,
      ...(review.kind !== 'check' && Array.isArray(review.changeIds) ? { changeIds: context ? pending : sortChangeIds(pending) } : {}),
      ...(review.kind !== 'check' && changes ? { changes: context ? changes.map((row, index) => {
        const text = row.status === 'pending' ? review.splices[index]?.inserted : null;
        return text ? { ...row, excerpt: clip(text, 80) } : row;
      }) : changes.slice().sort((a, b) => Number(String(a.id).split('.').pop()) - Number(String(b.id).split('.').pop())) } : {}),
      ...(review.baseRevision != null ? { baseRevision: review.baseRevision, scope: 'changes_since_revision',
        includesHumanChanges: review.includesHumanChanges === true } : {}),
      ...(review.law ? { law: review.law, region: review.region } : {}),
      ...(review.reason ? { reason: review.reason } : {}),
      ...(review.decision ? { decision: clone(review.decision) } : {}) };
  }

  function collaboration() {
    expireCollaboration();
    surviveReview();
    const contexts = Object.values(state.humanContexts).filter(row => row.visible);
    const targets = contexts.filter(row => !row.editing && row.revision === state.revision)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const target = targets.find(row => row.selection || row.focus) || targets[0];
    const editing = contexts.some(row => row.editing);
    const presence = contexts.length ? { active: true, editing,
      revision: target?.revision ?? state.revision,
      selection: target?.selection ? clone(target.selection) : null,
      focus: target?.focus ? clone(target.focus) : null,
      expiresAt: Math.max(...contexts.map(row => row.expiresAt)) } : null;
    const review = reviewSummary();
    if (review && state.review.status === 'pending') {
      review.documentId = state.review.documentId;
      review.splices = clone(state.review.splices);
      review.changeIds = pendingChangeIds(state.review);
      const rich = publicReviewChanges(state.review, true);
      if (rich) review.changes = rich;
      if (state.review.kind === 'inline') {
        review.authoredSplices = clone(state.review.authoredSplices);
        review.byPosture = state.review.byPosture === true;
      }
    }
    // nextExpiryAt projects only future moments; a lapsed expiresAt would force every sync to do full work forever.
    const expiries = contexts.map(row => row.expiresAt);
    if (state.review?.status === 'pending' && state.review.expiresAt > now()) expiries.push(state.review.expiresAt);
    return { posture: state.posture, readOnly: state.readOnly, presence, review,
      nextExpiryAt: expiries.length ? Math.min(...expiries) : null };
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
        typeof input.visible !== 'boolean' || typeof input.editing !== 'boolean') return stamp(failure('human_context_invalid', 'invalid'));
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
    if (input.expectedRevision > state.revision || (!input.editing && input.expectedRevision !== state.revision)) return stamp(failure('human_context_stale', 'conflict'));
    const range = value => value && safeBoundary(state.text, value.start) && safeBoundary(state.text, value.end) && value.start <= value.end
      ? { start: value.start, end: value.end } : null;
    const time = now(), exact = input.expectedRevision === state.revision && !input.editing;
    const selection = exact ? range(input.selection) : null, focus = exact ? range(input.focus) : null;
    if (exact && ((input.selection != null && !selection) || (input.focus != null && !focus))) return stamp(failure('human_context_range_invalid', 'invalid'));
    if (!prior && Object.keys(state.humanContexts).length >= LIMITS.humanContexts) return stamp(failure('human_context_limit'));
    state.humanContexts[key] = { owner: ownerOf(who), sequence: input.sequence, revision: input.expectedRevision,
      visible: true, editing: input.editing, selection, focus, updatedAt: time, expiresAt: time + LIMITS.presenceMs };
    recordSequence();
    return stamp(accepted({ acknowledged: true, sequence: input.sequence, expiresAt: time + LIMITS.presenceMs }));
  }

  function setPolicy(input, context = {}) {
    humanParticipant(context);
    if (input.expectedRevision !== state.revision) return stamp(failure('document_changed', 'conflict'));
    if ((!own(input, 'posture') && !own(input, 'readOnly')) ||
        (own(input, 'posture') && !['free', 'check', 'ask'].includes(input.posture)) ||
        (own(input, 'readOnly') && typeof input.readOnly !== 'boolean')) return stamp(failure('policy_invalid', 'invalid'));
    let changed = false;
    for (const key of ['posture', 'readOnly']) if (own(input, key) && state[key] !== input[key]) { state[key] = input[key]; changed = true; }
    if (changed) invalidateReview('policy_changed');
    return stamp(accepted({ changed, posture: state.posture, readOnly: state.readOnly }));
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

  function mint(pool, prefix, row, who) {
    const time = now(), id = mintId(prefix);
    state[pool][id] = { ...row, id, owner: ownerOf(who), documentId: state.documentId,
      createdAt: time, expiresAt: time + LIMITS.lifetimeMs };
    prune();
    return state[pool][id] || null;
  }

  function lookup(pool, id, who, consumeExpired = true) {
    const row = state[pool][String(id || '')];
    if (!row) return failure(pool === 'handles' ? 'context_missing' : 'reference_missing', 'target_gone');
    if (!sameOwner(row, who)) return failure('authority_mismatch');
    if (row.used) return failure('context_replayed');
    if (now() > row.expiresAt) { if (consumeExpired) delete state[pool][row.id]; return failure('context_expired', 'target_gone'); }
    if (row.documentId !== state.documentId) return failure('document_replaced', 'target_gone');
    return row;
  }

  // lookup's checks without its delete-on-expiry: the agent is still owed context_expired. Never grants authority.
  function peekHandle(id, who) {
    return lookup('handles', id, who, false);
  }

  // Compare change ids live on state.compare, not the handle pool (Law 3). Callers that refuse them check changeOf before lookup('handles').
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

  function relocate(record) {
    const entries = since(record.revision);
    if (!entries) return failure('history_unavailable', 'conflict');
    let range = { start: record.start, end: record.end };
    for (const entry of entries) {
      range = transportInterval(range.start, range.end, entry.splices);
      if (!range) return failure(entry.actor === 'human' ? 'human_changed_target' : 'target_changed', entry.actor === 'human' ? 'yielded' : 'conflict');
    }
    if (!safeBoundary(state.text, range.start) || !safeBoundary(state.text, range.end) || range.end < range.start) {
      return failure('target_changed', 'conflict');
    }
    const selected = state.text.slice(range.start, range.end);
    if ((typeof record.text === 'string' && selected !== record.text) || (record.digest && digest(selected) !== record.digest)) {
      return failure('target_changed', 'conflict');
    }
    return { ...range, rebased: record.revision !== state.revision };
  }

  function retain(entry, approvedReview) {
    state.journal.push(entry);
    let retained = state.journal.reduce((sum, row) => sum + journalBytes(row), 0);
    // Before a trim, advance pending review anchors to this revision while the journal is whole (the one exception to "never on the commit path").
    // Skipped when this commit is that review's own decision: its change still reads pending and would stale itself.
    if (state.journal.length > 1 && (state.journal.length > LIMITS.journalEntries || retained > LIMITS.journalBytes) &&
        !(approvedReview && state.review?.id === approvedReview)) {
      surviveReview();
    }
    while (state.journal.length > 1 && (state.journal.length > LIMITS.journalEntries || retained > LIMITS.journalBytes)) {
      const row = state.journal.shift(), cost = journalBytes(row);
      retained -= cost; state.history.trimmedBytes += cost; state.history.earliestRevision = row.revision;
      state.history.complete = false;
      if (row.actor === 'agent' && row.splices.length && !row.sourceTransactionId && !row.humanReviewed &&
          row.revision > Math.max(state.reviewedRevision || 0, state.reviewed[row.owner]?.revision || 0) &&
          !state.journal.some(entry => entry.sourceTransactionId === row.id)) {
        state.history.unreviewed[row.owner] = Math.max(state.history.unreviewed[row.owner] || 0, row.revision);
        const keys = Object.keys(state.history.unreviewed);
        while (keys.length > LIMITS.principals) {
          const key = keys.shift();
          state.history.unknownReviewRevision = Math.max(state.history.unknownReviewRevision, state.history.unreviewed[key]);
          delete state.history.unreviewed[key];
        }
      }
    }
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
      operation, requestId: who.requestId, invocationKey: who.invocationKey, label: clip(options.label || operation, 120),
      splices: clone(splices), createdAt: now(), sourceTransactionId: options.sourceTransactionId || null,
      humanReviewed: options.humanReviewed === true,
      ...(agent ? { agent } : {}),
      ...(derivedCommentIndex == null ? {} : {derivedCommentIndex}),
    };
    state.text = text; state.revision = revision;
    if (state.selection) {
      const moved = transportInterval(state.selection.start, state.selection.end, splices);
      state.selection = moved ? { ...state.selection, ...moved } : null;
    }
    if (state.focus) {
      const focus = transportInterval(state.focus.start, state.focus.end, splices);
      state.focus = focus ? { ...state.focus, ...focus } : null;
    }
    for (const row of Object.values(state.humanContexts)) {
      if (row.revision !== baseRevision || row.editing) { row.selection = null; row.focus = null; continue; }
      for (const key of ['selection', 'focus']) if (row[key]) row[key] = transportInterval(row[key].start, row[key].end, splices);
      row.revision = revision;
    }
    if (!reviewSurvivesEdits(state.review)) invalidateReview();
    retain(entry, options.approvedReview || null);
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
    if (incoming.documentId && incoming.documentId !== state.documentId) {
      state = createState({ documentId: incoming.documentId, text: incoming.text, filename,
        docKind: incoming.docKind, revision: incoming.revision, mintId });
      outlineCache = null;
    } else if (incoming.text !== state.text || (safeInt(incoming.revision) && incoming.revision !== state.revision)) {
      const base = state.revision, target = incoming.revision;
      let evidence = null;
      if (Array.isArray(incoming.journal) && safeInt(target) && target > base) {
        const entries = incoming.journal.filter(row => Number(row.revision ?? row.transaction?.revision) > base &&
          Number(row.revision ?? row.transaction?.revision) <= target).map(row => {
          const tx = row.transaction || row, actor = typeof tx.actor === 'object' ? tx.actor.kind : tx.actor;
          const principal = tx.principal || (typeof tx.actor === 'object' ? tx.actor.id : '') || 'local';
          return { ...row, revision: Number(tx.revision), baseRevision: Number(tx.baseRevision),
            id: String(tx.id || tx.transactionId || mintId('change_')), actor: actor || 'human',
            principal: String(principal), transport: String(tx.transport || 'platform'),
            operation: String(tx.operation || 'document.human_edit'), splices: row.splices };
        }).sort((a, b) => a.revision - b.revision);
        let replay = state.text, revision = base, valid = true;
        for (const row of entries) {
          if (row.baseRevision !== revision || row.revision !== revision + 1 || !Array.isArray(row.splices)) { valid = false; break; }
          replay = transformSplices(replay, row.splices);
          if (replay == null) { valid = false; break; }
          revision = row.revision;
        }
        if (valid && revision === target && replay === incoming.text) evidence = entries;
      }
      const inferred = evidence ? null : minimalSplice(state.text, incoming.text);
      if (evidence) {
        for (const row of evidence) {
          const actor = participant(row, mintId), text = transformSplices(state.text, row.splices);
          appendCommit(text, row.splices, actor, row.operation, {...row, derivedCommentIndex: null});
        }
      } else if (incoming.journal != null || (safeInt(target) && target !== base + 1) ||
          transformSplices(state.text, [inferred]) !== incoming.text) {
        // The snapshot is authoritative, not a licence to invent an unencodable undo row.
        // A repair touching existing damage is adopted with explicitly unavailable history.
        invalidateReview();
        state.text = incoming.text; state.revision = safeInt(target) ? target : base + 1;
        state.journal = []; state.history.earliestRevision = state.revision; state.history.complete = false;
        state.history.unknownReviewRevision = Math.max(state.history.unknownReviewRevision, state.revision);
        state.compare = null; outlineCache = null;
        for (const row of Object.values(state.humanContexts)) { row.selection = null; row.focus = null; }
      } else {
        appendCommit(incoming.text, inferred.removed || inferred.inserted ? [inferred] : [], who,
          'document.human_edit', { revision: safeInt(target) ? target : base + 1 });
      }
    }
    if (state.filename !== filename || state.docKind !== nextKind) invalidateReview('document_metadata_changed');
    state.filename = filename;
    state.docKind = nextKind;
    for (const field of ['selection', 'focus']) {
      if (!own(incoming, field)) continue;
      const row = incoming[field];
      state[field] = row && safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end) && row.start <= row.end
        ? { start: row.start, end: row.end, active: row.active === true } : null;
    }
    if (own(incoming, 'readOnly') && state.readOnly !== (incoming.readOnly === true)) { state.readOnly = incoming.readOnly === true; invalidateReview('policy_changed'); }
    // Notes' cards over the document: the host refuses edits behind them.
    state.notes = own(incoming, 'notes') && incoming.notes && typeof incoming.notes === 'object' ? { open: incoming.notes.open === true, current: typeof incoming.notes.current === 'string' ? incoming.notes.current : null } : null;
    if (own(incoming, 'posture') && ['free', 'check', 'ask'].includes(incoming.posture) && state.posture !== incoming.posture) { state.posture = incoming.posture; invalidateReview('policy_changed'); }
    if (safeInt(incoming.reviewedRevision) && incoming.reviewedRevision <= state.revision) {
      state.reviewedRevision = Math.max(state.reviewedRevision || 0, incoming.reviewedRevision);
    }
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
          imported.reviewOnly = external.baseline !== state.text && external.incoming === state.text;
          imported.detached = external.baseline !== state.text && external.incoming !== state.text;
          state.compare = imported;
        } else state.compare = null;
      }
    }
    prune();
    return { ...current(), outcome: 'ok' };
  }

  async function refresh(context) {
    cancelled(context);
    if (typeof host.snapshot === 'function') {
      const value = await host.snapshot(); cancelled(context);
      if (!value || value.ok === false) return failure(value?.reason || 'document_not_settled');
      reconcile(value, { actor: 'human', principal: 'local' });
    }
    return null;
  }

  function documentLaw(start, end) {
    if (state.docKind !== 'markdown') return {};
    const will = parseWill(state.text);
    if (!will.present) return {};
    return { law: willGovern(will, start, end), ...(willIntentOf(will, start, end) ? { intent: willIntentOf(will, start, end) } : {}) };
  }

  function reference(start, end, who, info = {}) {
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return null;
    return mint('refs', 'ref_', { start, end, revision: state.revision,
      digest: digest(state.text.slice(start, end)), ...info }, who);
  }

  function handle(start, end, who, info = {}) {
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return null;
    const text = state.text.slice(start, end);
    if (text.length > LIMITS.editChars || bytes(text) > LIMITS.authorityBytes ||
        imageSpans().some(row => row.start < end && start < row.end)) return null;
    return mint('handles', 'ctx_', { start, end, revision: state.revision, text, used: false, ...info }, who);
  }

  // A recipe handle spans the occurrence, never the definition bytes; relocate()'s integrity check applies unmodified.
  // It binds the definition too: new SVG behind the same label is a changed target.
  function assetDigest(label) {
    const row = documentAssets(state.text).assets.get(normalizeLabel(label));
    return row ? digest(row.url) : null;
  }
  function drawHandle(start, end, recipeJSON, assetLabel, who) {
    if (recipeJSON.length > LIMITS.editChars || bytes(recipeJSON) > LIMITS.authorityBytes) return null;
    const text = state.text.slice(start, end);
    return mint('handles', 'ctx_', { start, end, revision: state.revision, text, used: false, kind: 'draw', recipeJSON, assetLabel, assetDigest: assetDigest(assetLabel) }, who);
  }

  // Exactly one drawing occurrence discloses its recipe JSON, never SVG bytes; the handle covers the occurrence.
  const DRAW_OCCURRENCE = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\](?:[ \t]*<!--md-layout:v1[^>]*-->)?$/;
  function drawingAt(start, end) {
    const slice = state.text.slice(start, end), lead = slice.length - slice.trimStart().length;
    const match = DRAW_OCCURRENCE.exec(slice.trim());
    if (!match) return null;
    const row = documentAssets(state.text).assets.get(normalizeLabel(match[2]));
    if (!row || !/^data:image\/svg\+xml;base64,/i.test(row.url)) return null;
    let recipe;
    try { recipe = _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(row.url))); }
    catch (_) { return null; }
    if (!recipe) return null;
    const occurrence = '![' + match[1] + '][' + match[2] + ']';
    return { targetStart: start + lead, targetEnd: start + lead + occurrence.length, draw: { recipeText: JSON.stringify(recipe), assetLabel: row.label } };
  }

  function readTarget(input, who) {
    if ([input.cursor, input.context_handle, input.ref, input.start != null || input.end != null].filter(Boolean).length > 1) {
      return failure('read_target_ambiguous', 'invalid');
    }
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (!['read', 'draw-read'].includes(cursor.kind)) return failure('cursor_kind_mismatch');
      if (cursor.revision !== state.revision) return failure('read_snapshot_changed', 'conflict');
      return { ...cursor, cursor, ...(cursor.kind === 'draw-read' ? { draw: { recipeText: cursor.recipeText, assetLabel: cursor.assetLabel } } : {}) };
    }
    if (input.context_handle) {
      const change = changeOf(input.context_handle);
      if (change) return { change };
      const held = lookup('handles', input.context_handle, who);
      if (held.outcome) return held;
      const range = relocate(held);
      if (range.outcome) return range;
      // A reread must not bind an old recipe to a person's newer asset definition.
      if (held.kind === 'draw' && held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
      return { ...range, targetStart: range.start, targetEnd: range.end, offset: range.start, coverage: [],
        ...(held.kind === 'draw' ? { draw: { recipeText: held.recipeJSON, assetLabel: held.assetLabel } } : {}) };
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
    if (!safeBoundary(state.text, start) || !safeBoundary(state.text, end) || end < start) return failure('range_invalid', 'invalid');
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

  // Recipe paging walks the recipe string ('draw-read' cursor) and never disclose(): a font's data: URI would false-match redaction.
  // Only the completing page mints a handle. Paint rasters disclose their data-URL length, not payload.
  function readDrawContext(target, input, who) {
    const recipeText = target.draw.recipeText, recipe = JSON.parse(recipeText);
    for (const shape of recipe.shapes) if (shape.recognized === 'paint') {
      shape.raster = { kept: true, bytes: shape.raster.length, type: shape.raster.startsWith('data:image/png;') ? 'png' : 'jxl' };
    }
    const law = documentLaw(target.targetStart, target.targetEnd);
    const text = JSON.stringify(recipe), limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars);
    const offset = target.cursor ? target.offset : 0;
    if (!safeBoundary(text, offset)) return failure('range_invalid', 'invalid');
    let end = Math.min(text.length, offset + limit);
    if (!safeBoundary(text, end)) end--;
    let page = text.slice(offset, end);
    while (bytes(JSON.stringify({ ...current(), ...law, text: page })) > LIMITS.resultBytes - 1600 && page.length) {
      end = offset + clip(text.slice(offset, end), Math.floor((end - offset) * 0.8)).length;
      page = text.slice(offset, end);
    }
    const complete = end >= text.length;
    const disclosedHandle = complete ? drawHandle(target.targetStart, target.targetEnd, recipeText, target.draw.assetLabel, who) : null;
    const next = !complete ? mint('cursors', 'read_', { kind: 'draw-read', revision: state.revision,
      targetStart: target.targetStart, targetEnd: target.targetEnd, recipeText, assetLabel: target.draw.assetLabel, offset: end }, who) : null;
    if (target.cursor) delete state.cursors[target.cursor.id];
    return { ...current(), outcome: 'ok', start: target.targetStart, end: target.targetEnd, text: page,
      ...law,
      complete, remaining: text.length - end, handle: disclosedHandle?.id || null,
      coverage: { disclosed: end, chars: text.length, complete },
      ...(complete && !disclosedHandle ? { edit_unavailable: 'target_over_edit_budget' } : {}),
      next_cursor: next?.id || null, expires_in_ms: LIMITS.lifetimeMs };
  }

  async function readContext(input, who, context) {
    let target = readTarget(input, who);
    if (target.outcome) return target;
    if (target.change) return readChange({ change_id: target.change.id }, who);
    const facts = await markdownFacts(context);
    if (facts?.outcome) return facts;
    const layout = facts?.layout, images = facts?.images;
    if (!target.draw && !target.cursor) {
      const drawing = drawingAt(target.targetStart, target.targetEnd);
      if (drawing) target = { ...target, ...drawing, offset: 0, coverage: [] };
    }
    if (target.draw) return readDrawContext(target, input, who);
    const limit = bounded(input.limit, LIMITS.readChars, 256, LIMITS.readChars);
    const start = target.offset;
    let end = Math.min(target.targetEnd, start + limit);
    if (!safeBoundary(state.text, end)) end--;
    const hiddenAtEnd = imageSpans().find(row => row.start < end && end < row.end);
    if (hiddenAtEnd) end = Math.min(target.targetEnd, hiddenAtEnd.end);
    let projection = disclose(state.text, start, end), text = projection.text;
    const base = { ...current(), outcome: 'ok', start, end, text, ...documentLaw(start, end),
      complete: end === target.targetEnd && !projection.omissions.length, remaining: target.targetEnd - end,
      ...(projection.omissions.length ? { omissions: projection.omissions.slice(0, 4), omissionCount: projection.omissions.length } : {}) };
    const initialLayout = layoutInRange(layout, start, end);
    if (initialLayout) base.layout = initialLayout;
    const initialImages = imagesInRange(images, start, end);
    if (initialImages) base.images = initialImages;
    while (bytes(JSON.stringify(base)) > LIMITS.resultBytes - 1600 && text.length) {
      const narrowed = clip(state.text.slice(start, end), Math.floor((end - start) * 0.8)); end = start + narrowed.length;
      projection = disclose(state.text, start, end); text = projection.text;
      Object.assign(base, { end, text, ...documentLaw(start, end), complete: end === target.targetEnd && !projection.omissions.length, remaining: target.targetEnd - end });
      if (projection.omissions.length) Object.assign(base, { omissions: projection.omissions.slice(0, 4), omissionCount: projection.omissions.length });
      else { delete base.omissions; delete base.omissionCount; }
      const pageLayout = layoutInRange(layout, start, end);
      if (pageLayout) base.layout = pageLayout; else delete base.layout;
      const pageImages = imagesInRange(images, start, end);
      if (pageImages) base.images = pageImages; else delete base.images;
    }
    const disclosed = projection.omissions.length ? null : handle(start, end, who);
    const coverage = [...(target.coverage || []), ...(projection.omissions.length ? [] : [[start, end]])];
    let reached = target.targetStart;
    for (const row of coverage.slice().sort((a, b) => a[0] - b[0])) {
      if (row[0] > reached) break;
      reached = Math.max(reached, row[1]);
    }
    const whole = reached >= target.targetEnd;
    let completeHandle = null;
    if (whole && (start !== target.targetStart || end !== target.targetEnd)) {
      completeHandle = handle(target.targetStart, target.targetEnd, who, { disclosure: 'paged' });
    }
    const next = end < target.targetEnd ? mint('cursors', 'read_', {
      kind: 'read', revision: state.revision, targetStart: target.targetStart, targetEnd: target.targetEnd,
      offset: end, coverage, ref: target.ref || null,
    }, who) : null;
    if (target.cursor) delete state.cursors[target.cursor.id];
    // Redacted image bytes cannot grant source editing. This separate typed handle permits
    // only an image comment at the fully inspected image occurrence, including inline data URLs.
    const commentHandle = end === target.targetEnd && !whole && state.docKind === 'markdown' &&
      imageCommentTarget(state.text, target.targetStart, target.targetEnd)
      ? mint('handles', 'ctx_', {kind: 'image-comment', revision: state.revision, start: target.targetStart, end: target.targetEnd,
        digest: digest(state.text.slice(target.targetStart, target.targetEnd)), used: false}, who) : null;
    return { ...base, handle: disclosed?.id || null, ...(target.ref ? { ref: target.ref } : {}),
      coverage: { disclosed: Math.max(0, reached - target.targetStart), chars: target.targetEnd - target.targetStart, complete: whole },
      ...(completeHandle ? { complete_handle: completeHandle.id } : {}),
      ...(commentHandle ? {comment_handle: commentHandle.id} : {}),
      ...(!disclosed ? { edit_unavailable: projection.omissions.length ? 'source_redacted' : 'target_over_edit_budget' } : {}),
      next_cursor: next?.id || null, expires_in_ms: LIMITS.lifetimeMs };
  }

  // The notes store is injected; never import notes/model.mjs (the document profile has no Notes).
  // An absent store is ordinary empty data. A configured but unreadable folder remains a refusal.
  const noNotes = file => accepted({ availability: 'unavailable', reason: 'notes_not_configured',
    message: 'Notes is not set up on this host.', complete: true, remaining: 0, next_cursor: null,
    ...(file === undefined ? {notes: []} : {file, found: false, text: null}) });
  async function notesList(input, who, context) {
    if (typeof host.notesList !== 'function') return noNotes();
    cancelled(context);
    const rows = await host.notesList({ ...who, signal: context.signal });
    cancelled(context);
    // undefined: no door. null or non-array: the folder could not answer.
    if (rows === undefined) return noNotes();
    if (!Array.isArray(rows)) return failure('notes_folder_unreadable');
    const sorted = rows.map(row => ({
      file: clip(String(row?.file || ''), 256),
      title: clip(String(row?.title || String(row?.file || '').replace(/\.md$/i, '')), 192),
      section: clip(String(row?.section || (row?.skill ? 'skills' : 'others')), 64),
      skill: row?.skill === true || row?.section === 'skills',
      modified: Number.isFinite(row?.modified) ? row.modified : undefined,
    })).filter(row => row.file);
    sorted.sort((a, b) => {
      const as = a.skill ? 0 : 1, bs = b.skill ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.file.localeCompare(b.file);
    });
    let offset = 0;
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'notes-list') return failure('notes_cursor_wrong_kind', 'invalid');
      offset = cursor.offset || 0;
    }
    const limit = bounded(input.limit, 32, 1, 64);
    const page = [];
    for (let i = offset; i < sorted.length; i++) {
      const item = { file: sorted[i].file, title: sorted[i].title, section: sorted[i].section,
        ...(sorted[i].modified != null ? { modified: sorted[i].modified } : {}) };
      if (bytes(JSON.stringify({ notes: [...page, item] })) > LIMITS.resultBytes - 1800) break;
      page.push(item);
      if (page.length >= limit) break;
    }
    const end = offset + page.length;
    const next = end < sorted.length ? mint('cursors', 'notes_list_', { kind: 'notes-list', offset: end }, who) : null;
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({ availability: 'available', notes: page, complete: end >= sorted.length, remaining: Math.max(0, sorted.length - end), next_cursor: next?.id || null,
      ...(!sorted.length ? {message: 'Notes has nothing yet.'} : {}) });
  }

  async function notesRead(input, who, context) {
    const file = typeof input.file === 'string' ? input.file : '';
    if (!file) return failure('notes_file_required', 'invalid');
    if (typeof host.notesRead !== 'function') return noNotes(file);
    cancelled(context);
    const got = await host.notesRead({ file, ...who, signal: context.signal });
    cancelled(context);
    if (got === undefined) return noNotes(file);
    if (!got) return accepted({availability: 'available', file, found: false, text: null, complete: true,
      remaining: 0, next_cursor: null, reason: 'notes_not_found', message: 'This note is not in Notes. List notes to choose an available file.'});
    if (typeof got.text !== 'string') return failure('notes_folder_unreadable');
    const text = got.text;
    let offset = 0;
    if (input.cursor) {
      const cursor = lookup('cursors', input.cursor, who);
      if (cursor.outcome) return cursor;
      if (cursor.kind !== 'notes-read' || cursor.file !== file) return failure('notes_cursor_wrong_kind', 'invalid');
      offset = cursor.offset || 0;
    } else if (Number.isInteger(input.start) && input.start > 0) {
      offset = Math.min(input.start, text.length);
    }
    if (!safeBoundary(text, offset)) return failure('range_invalid', 'invalid');
    const pageChars = 12288;
    let end = Math.min(text.length, offset + bounded(input.limit, pageChars, 256, pageChars));
    if (!safeBoundary(text, end)) end--;
    let page = text.slice(offset, end);
    while (bytes(JSON.stringify({ ...current(), outcome: 'ok', file, text: page, start: offset, end })) > LIMITS.resultBytes - 800 && page.length) {
      end = offset + clip(text.slice(offset, end), Math.floor((end - offset) * 0.8)).length;
      page = text.slice(offset, end);
    }
    const complete = end >= text.length;
    const next = !complete ? mint('cursors', 'notes_read_', { kind: 'notes-read', file, offset: end }, who) : null;
    if (input.cursor) delete state.cursors[input.cursor];
    return accepted({ availability: 'available', found: true, file, text: page, start: offset, end, complete, remaining: Math.max(0, text.length - end), next_cursor: next?.id || null });
  }

  async function outline(context) {
    if (outlineCache?.revision === state.revision && outlineCache.filename === state.filename) return outlineCache.value;
    const text = state.text, revision = state.revision, filename = state.filename;
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
    if (state.revision !== revision || state.filename !== filename) return failure('document_changed', 'conflict');
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
    outlineCache = { revision, filename, value };
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
      return { start, end, sectionEnd, text: value.text,
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
    const analysis = await outline(context);
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
      // complete is this response's (the parser finished and no page follows), as notes.list says it.
      next_cursor: next?.id || null, complete: analysis.complete && !next, omitted: Math.max(0, analysis.total - analysis.entries.length),
      ...(analysis.reason ? { reason: analysis.reason } : {}) });
  }

  async function find(input, who, context) {
    if (typeof input.query !== 'string' || !input.query || input.query.length > 512 ||
        /[\uD800-\uDFFF]/u.test(input.query)) return failure('query_invalid', 'invalid');
    if (state.compare) {
      // Source-search-only fields under an open comparison are a wrong-tool call: refuse
      // naming the field rather than silently ignoring it (docs/tool-surface-decision.md).
      for (const field of ['case_sensitive', 'within', 'kind']) {
        if (Object.hasOwn(input, field)) return failure(field + '_not_applicable', 'invalid');
      }
      return findInComparison(input, who);
    }
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
    let found = [], complete = true, windowed = false, structuralRemaining = 0, sectionEntries = null;
    const limit = bounded(input.limit, 8, 1, 16);
    if (input.kind) {
      const requirements = { mode: 'find', filename: state.filename, query: input.query, kind: input.kind, within: range, offset };
      const resolved = worldOrPending(context, 'find', requirements, fact =>
        fact.query === input.query && fact.kind === input.kind && fact.offset === offset &&
        JSON.stringify(fact.within) === JSON.stringify(range));
      if (resolved.terminal) return resolved.terminal;
      const value = resolved.value;
      if (value?.reason && !value.matches) return failure(value.reason);
      found = (value?.matches || []).filter(row => safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end));
      complete = value?.complete !== false;
      windowed = value?.windowed === true; structuralRemaining = Number(value?.remaining) || 0;
      sectionEntries = (value?.entries || []).map(row => ({ start: row.start, end: row.extentEnd ?? row.end,
        label: display(row.label || row.name || '', 192), kind: row.kind || 'declaration' }));
    } else {
      const haystack = input.case_sensitive ? state.text : state.text.toLocaleLowerCase('und');
      const needle = input.case_sensitive ? input.query : input.query.toLocaleLowerCase('und');
      // Locale folding can change UTF-16 width; exact indices come from a case-insensitive regex in that case.
      if (haystack.length !== state.text.length || needle.length !== input.query.length) {
        const pattern = new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
        pattern.lastIndex = range.start;
        for (const match of state.text.matchAll(pattern)) {
          if (match.index >= range.end) break;
          if (match.index + match[0].length <= range.end) found.push({ start: match.index, end: match.index + match[0].length });
          if (found.length >= offset + limit + 1) { complete = false; break; }
        }
      } else {
        let at = range.start;
        while (at <= range.end) {
          const start = haystack.indexOf(needle, at);
          if (start < 0 || start + input.query.length > range.end) break;
          found.push({ start, end: start + input.query.length });
          at = start + Math.max(1, input.query.length);
          if (found.length >= offset + limit + 1) { complete = false; break; }
        }
      }
    }
    if (!sectionEntries && (state.docKind === 'markdown' ||
        (/\.(?:[cm]?js|html?)$/i.test(state.filename) && worldHasFact(context, 'outline')))) {
      const mapped = await outline(context);
      if (!mapped.outcome) sectionEntries = mapped.entries;
    }
    sectionEntries = (sectionEntries || []).filter(row => safeBoundary(state.text, row.start) && safeBoundary(state.text, row.end));
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
        if (sectionRef && !sectionRef.listed) delete state.refs[sectionRef.id];
        break;
      }
      matches.push(item);
      if (sectionRef) sectionRef.listed = true;
    }
    const end = offset + matches.length;
    const more = localOffset + matches.length < found.length || (input.kind ? structuralRemaining > 0 : !complete);
    const next = more ? mint('cursors', 'find_', { kind: 'find', revision: state.revision, signature, offset: end }, who) : null;
    return accepted({ matches, next_cursor: next?.id || null, complete: complete && !more,
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

  const reviewedThrough = who => Math.max(state.reviewedRevision || 0, state.reviewed[ownerOf(who)]?.revision || 0);
  const missingReviewHistory = who => Math.max(state.history.unknownReviewRevision, state.history.unreviewed[ownerOf(who)] || 0) > reviewedThrough(who);

  // Guidance, not new authority: an inspected target and the commit gate still decide each write.
  function editingState(who, together, will) {
    if (state.readOnly) return { mode: 'read_only', reason: 'document_read_only' };
    if (together.presence?.editing) return { mode: 'yield', reason: 'human_edit_in_progress' };
    if (state.review?.status === 'pending') return { mode: 'review_pending', reason: reviewCause(state.review) };
    if (will?.faults.length) return { mode: 'blocked', reason: 'document_law' };
    if (state.posture === 'ask') return { mode: 'review_required', reason: 'ask' };
    if (state.posture === 'check') {
      if (missingReviewHistory(who)) return { mode: 'blocked', reason: 'review_history_unavailable' };
      if (activeChanges(who).some(row => !row.humanReviewed && row.revision > reviewedThrough(who)))
        return { mode: 'review_required', reason: 'check' };
    }
    return { mode: 'inspect', reason: 'inspect_target' };
  }

  function remember(pool, who, value) {
    pool[ownerOf(who)] = { ...value, at: now() };
    const entries = Object.entries(pool).sort((a, b) => a[1].at - b[1].at);
    while (entries.length > LIMITS.principals) delete pool[entries.shift()[0]];
  }

  function commitGate(splices, who, restores = false, approved = false) {
    expireCollaboration();
    if (state.readOnly) return failure('document_read_only');
    if (who.actor !== 'agent') return null;
    // A live human hand wins over an autonomous commit; an `approved` review cannot lose to the person's own restored caret.
    if (!approved) {
      if (Object.values(state.humanContexts).some(row => row.visible && row.editing)) return failure('human_edit_in_progress', 'yielded');
      let selection = state.selection?.active && state.selection.start !== state.selection.end ? state.selection : null;
      let focus = state.focus?.active ? state.focus : null;
      for (const row of splices) {
        if (overlap(selection, row) || overlap(focus, row)) return failure('foreground_hand_wins', 'yielded');
        if (selection) selection = transportInterval(selection.start, selection.end, [row]);
        if (focus) focus = transportInterval(focus.start, focus.end, [row]);
      }
    }
    if (!restores && !approved && state.posture === 'ask') return failure('human_review_required', 'pending', { reviewKind: 'proposal' });
    if (!restores && !approved && state.posture === 'check' && missingReviewHistory(who)) return failure('review_history_unavailable', 'conflict');
    if (!restores && !approved && state.posture === 'check' && activeChanges(who).some(row => !row.humanReviewed && row.revision > reviewedThrough(who))) {
      return failure('human_review_required', 'pending', { reviewKind: 'check' });
    }
    return null;
  }

  async function stageReview(kind, splices, who, context, operation, options = {}) {
    expireCollaboration();
    let rows = splices, changeIds = [], changes = [], baseRevision, includesHumanChanges = false;
    if (kind === 'check') {
      const changes = activeChanges(who).filter(row => !row.humanReviewed && row.revision > reviewedThrough(who));
      if (!changes.length) return failure('nothing_to_review');
      baseRevision = Math.min(...changes.map(row => row.baseRevision));
      const journal = since(baseRevision);
      if (!journal) return failure('review_history_unavailable', 'conflict');
      rows = [];
      for (const entry of journal.slice().reverse()) {
        for (const row of entry.splices.slice().reverse()) rows.push({ pos: row.pos, removed: row.inserted, inserted: row.removed });
      }
      if (transformSplices(state.text, rows) == null) return failure('review_history_unavailable', 'conflict');
      changeIds = changes.map(row => row.id);
      includesHumanChanges = journal.some(row => row.actor === 'human');
    }
    const signature = digest(JSON.stringify({ kind, rows, operation, metadata: options.metadata || null }));
    const requirements = { revision: state.revision, kind, editCount: kind === 'check' ? changeIds.length : options.editCount || rows.length };
    const prior = state.review;
    if (prior?.status === 'pending') {
      if (prior.owner === ownerOf(who) && prior.revision === state.revision && prior.signature === signature) {
        return { outcome: 'pending', reason: 'human_review_required', cause: reviewCause(prior), reviewId: prior.id, review: reviewSummary(),
          pending: { kind: 'human-review', proposalId: prior.id, requirements } };
      }
      // After authority lapse a fresh proposal is a new review (K08).
      if (!(Number.isFinite(prior.expiresAt) && prior.expiresAt <= now())) {
        return failure('review_pending', 'pending', { cause: reviewCause(prior), reviewId: prior.id, review: reviewSummary() });
      }
    }
    if (prior?.status === 'declined' && prior.owner === ownerOf(who) && prior.revision === state.revision && prior.signature === signature) {
      return failure('review_declined', 'refused', { review: reviewSummary() });
    }
    const time = now();
    // 'inline' shares proposal expiry and revalidation; 'check' carries no handles.
    const tracksHandles = kind === 'proposal' || kind === 'inline';
    const handleExpiry = (tracksHandles ? options.handleIds || [] : []).map(id => state.handles[id]?.expiresAt).filter(Number.isFinite);
    const id = mintId('review_');
    // Change ids derive from the review's; only authored splices are keepable, derived ones follow. Stored last-first; ".1" is first in document order.
    if (kind !== 'check') {
      const authored = tracksHandles ? options.authoredCount ?? rows.length : rows.length;
      changes = initReviewChanges(id, rows, authored, tracksHandles ? options.handlePairs || [] : [], options.drawAssets);
      changeIds = changes.map(row => row.id);
    }
    state.review = { id, kind, status: 'pending', documentId: state.documentId,
      revision: state.revision, sourceDigest: digest(state.text), filename: state.filename, docKind: state.docKind,
      createdAt: time, expiresAt: Math.min(time + LIMITS.reviewMs, ...handleExpiry), owner: ownerOf(who), ...who, operation,
      label: clip(kind === 'check' ? 'Review changes before continuing' : kind === 'inline' ? (options.label || 'Edit review')
        : options.label || 'Proposed edits', 120),
      splices: clone(rows), authoredSplices: clone(options.authoredSplices || rows),
      handleIds: tracksHandles ? [...(options.handleIds || [])] : [],
      editCount: tracksHandles ? options.editCount || rows.length : changeIds.length,
      reviewedRegion: options.reviewedRegion ?? null, changeIds, changes, signature,
      byPosture: options.byPosture === true, ...(options.law ? { law: options.law, region: options.region } : {}),
      ...(baseRevision != null ? { baseRevision, includesHumanChanges } : {}),
      options: { label: options.label, editCount: options.editCount, authoredCount: options.authoredCount, rebased: options.rebased === true,
        keepCompare: options.keepCompare === true, compareDecision: options.compareDecision || null,
        metadata: options.metadata || null, note: options.note || null },
    };
    let presentation = null;
    // Inline review presents at the edit through its own adapter path, not host.presentReview.
    if (kind !== 'inline' && typeof host.presentReview === 'function') {
      try {
        const value = await host.presentReview({ documentId: state.documentId, revision: state.revision,
          review: collaboration().review, ...who, signal: context.signal });
        presentation = value?.ok || value?.pending ? 'pending' : value?.reason || 'unavailable';
      } catch { presentation = 'unavailable'; }
    }
    return { outcome: 'pending', reason: 'human_review_required', cause: reviewCause(state.review), reviewId: id, review: reviewSummary(),
      pending: { kind: 'human-review', proposalId: id, requirements }, ...(presentation ? { presentation } : {}) };
  }

  // One owner of committed text, shared by commit and previewReview. Pure. Null when stale or a definition cannot append.
  // Order: authored, retirements, then definitions, so append never reintroduces a retired definition.
  function committedText(beforeText, splices, authoredCount, actor, docKind, operation, restores, sourceTransactionId, drawAssets) {
    const authoredSplices = splices.slice(0, authoredCount);
    let derivedCommentIndex = null;
    let text = transformSplices(beforeText, splices);
    if (text == null) return null;
    if (docKind === 'markdown' && operation !== 'document.open_text' && !restores && !sourceTransactionId) {
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
    if (docKind === 'markdown' && operation !== 'document.open_text') {
      const comments = commentSplices(beforeText, splices);
      if (comments.length) { splices = splices.concat(comments); text = transformSplices(text, comments); derivedCommentIndex = splices.length - 1; }
    }
    return { text, splices, authoredSplices, derivedCommentIndex };
  }

  // The host's one fence over every commit path, asked before a review exists. `fact` lets a Draw fence admit an edit to the open drawing.
  function commitFenceRefusal(fact) {
    const fence = typeof host.commitFence === 'function' ? host.commitFence(fact) : '';
    return fence ? failure(fence, 'refused') : null;
  }

  // A keep-region violation the person may allow in review: one splice, wholly inside one keep region, touching no marker.
  function reviewableLaw(beforeText, splices, law) {
    if (!law || law.law !== 'keep' || law.rule !== 'law_violated' || splices.length !== 1 || state.docKind !== 'markdown') return null;
    const will = parseWill(beforeText), row = splices[0], regions = willRegionsIn(will, row.pos, row.pos + row.removed.length);
    return !will.faults.length && regions.length === 1 && regions[0].law === 'keep' && law.region === regions[0].index &&
      !willTouchesMarker(will, row.pos, row.pos + row.removed.length) ? regions[0].index : null;
  }

  async function commit(splices, who, context, operation, options = {}) {
    cancelled(context);
    const beforeText = state.text, baseRevision = state.revision, documentId = state.documentId;
    const authoredCount = options.authoredCount ?? splices.length;
    if (!safeInt(authoredCount) || authoredCount > splices.length) return failure('edit_invalid', 'invalid');
    const computed = committedText(beforeText, splices, authoredCount, who.actor, state.docKind, operation,
      options.restores === true, options.sourceTransactionId, options.drawAssets);
    if (!computed) return failure('target_changed', 'conflict');
    let { text, splices: withRetirements, authoredSplices } = computed;
    splices = withRetirements;
    options = {...options, authoredCount, editCount: options.editCount ?? authoredCount};
    const invalid = admissibleSnapshotText(text);
    if (invalid) return failure(invalid, 'invalid');
    const metadataChanged = options.metadata && (options.metadata.filename !== state.filename || options.metadata.docKind !== state.docKind);
    if (text === beforeText && !metadataChanged) return { outcome: 'unchanged', changeId: null, editCount: 0 };
    const approved = options.approvedReview && state.review?.id === options.approvedReview && state.review.status === 'pending';
    let gate = commitGate(splices, who, options.restores === true, approved);
    if (gate && gate.reason !== 'human_review_required') return gate;
    let reviewedRegion = approved ? state.review.reviewedRegion : null;
    let law = enforceWill(beforeText, text, authoredSplices, { docKind: state.docKind, actor: who.actor,
      restores: options.restores === true, reviewedRegion, referenceCheck: host.referenceCheck });
    let reviewToken = approved ? context.reviewToken || null : null;
    // Same fence as commit(): asked for every path before a review exists.
    const fenced = commitFenceRefusal(options.fence);
    if (fenced) return fenced;
    // An agent's edit never leaves a colour or ink marker standing alone or an empty pair: each pair stays whole or goes whole, or the edit is
    // refused with the source exact.
    if (!law && state.docKind === 'markdown' && who.actor === 'agent' && operation !== 'document.open_text' &&
        options.restores !== true && !options.sourceTransactionId) {
      for (const kind of ['ink', 'color']) {
        const broken = markerBroken(beforeText, text, splices, kind);
        if (broken) return failure(kind + '_pair_broken', 'refused', broken);
      }
    }
    // R87g law: on the drawing the person has OPEN, an agent draws immediately (one Undo step). options.watched is remembered, so it is
    // re-established here from both halves (DS-02): the patch is admitted and ordinary commits are fenced. Otherwise the posture applies.
    const watchedNow = options.watched === true && !!options.fence && !!commitFenceRefusal();
    if (gate?.reason === 'human_review_required' && watchedNow) gate = null;
    if (law || gate || options.propose) {
      const reviewed = reviewableLaw(beforeText, authoredSplices, law);
      if (law && reviewed == null) return failure('document_law', 'refused', law);
      if (gate?.reviewKind === 'check') return stageReview('check', [], who, context, operation, options);
      // Human review is a typed pending outcome, decided on a continuation (reviewDecision).
      const inline = !options.propose && options.reviewInline !== false && authoredSplices.length === 1 && host.inlineReview === true;
      return stageReview(inline ? 'inline' : 'proposal', splices, who, context, operation,
        { ...options, reviewedRegion: reviewed, authoredSplices, byPosture: !!gate, ...(reviewed == null ? {} : { law: 'keep', region: reviewed }) });
    }
    let result = null;
    if (typeof host.commit === 'function') {
      result = await host.commit({ documentId, baseRevision, beforeText, text, splices: clone(splices), authoredCount,
        ...who, signal: context.signal, operation, label: clip(options.label || operation, 120),
        sourceTransactionId: options.sourceTransactionId || null, reviewToken, fence: options.fence || null });
      if (!result || result.ok !== true) return failure(result?.reason || 'commit_refused', result?.outcome || 'conflict');
      // A successful host commit is irreversible to this invocation; cancellation cannot report it as absent.
      if (result.documentId && result.documentId !== documentId) return failure('document_replaced_after_commit', 'conflict');
    } else cancelled(context);
    const revision = result?.revision == null ? baseRevision + 1 : result.revision;
    if (!safeInt(revision) || revision <= baseRevision) return failure('host_revision_invalid');
    const entry = appendCommit(text, splices, who, operation, { ...options, derivedCommentIndex: computed.derivedCommentIndex, revision, humanReviewed: !!approved || !!reviewToken, id: result?.transactionId || undefined });
    if (options.metadata) { state.filename = options.metadata.filename; state.docKind = options.metadata.docKind; state.handles = {}; state.refs = {}; state.cursors = {}; }
    const structure = structureReceipt(beforeText, text, state.filename, context);
    return { outcome: options.rebased ? 'rebased' : 'applied', changeId: entry.id, editCount: options.editCount || splices.length,
      ...(result?.presentation ? {presentation: result.presentation} : {}),
      ...(structure ? { structure } : {}),
      // law/region are the record of what governed this commit.
      ...(reviewedRegion == null ? {} : { law: 'keep', region: reviewedRegion }),
      transaction: { transactionId: entry.id, baseRevision, revision, actor: who.actor, principal: who.principal,
        operation, sourceTransactionId: options.sourceTransactionId || null } };
  }

  async function applyEdits(input, who, context, propose = false) {
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
      if (held.kind === 'draw' || held.kind === 'image-comment') return failure('context_handle_wrong_kind', 'invalid', { editIndex: index });
      const range = relocate(held);
      if (range.outcome) return { ...range, editIndex: index };
      rebased ||= range.rebased;
      const placement = edit.placement || 'replace';
      const start = placement === 'after' ? range.end : range.start;
      const end = placement === 'replace' ? range.end : start;
      const inserted = placement === 'after' && needsParagraphBreakAfter(state.text, range.end)
        ? paragraphBreakAround(state.text, range.end).prefix + edit.text : edit.text;
      const narrow = minimalSplice(state.text.slice(start, end), inserted);
      // Offset within the just-relocated range (K03).
      ready.push({ held, editIndex: index, start, end, offset: start - range.start + narrow.pos,
        splice: { pos: start + narrow.pos, removed: narrow.removed, inserted: narrow.inserted } });
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
    const result = await commit(splices, who, context, propose ? 'document.propose_edits' : 'document.apply_edits', {
      label: input.label || (propose ? 'Proposed edits' : 'Agent edit'), rebased, editCount: ready.length,
      handleIds: ready.map(row => row.held.id), handlePairs, note: input.note || null, propose,
    });
    if (['applied', 'rebased', 'unchanged'].includes(result.outcome)) {
      for (const row of ready) row.held.used = true;
      if (input.note && typeof host.note === 'function') host.note(clip(input.note, 240));
    }
    return result;
  }

  async function reviewDecision(input, context) {
    const caller = humanParticipant(context);
    const inputDigest = digest(canonicalJson(input));
    if (!context.continues) {
      const prior = priorInvocation(caller.invocationKey);
      if (prior) return replayOf(prior, 'document.review_decide', inputDigest) || stamp(failure('invocation_key_collision', 'invalid'));
    }
    const finish = result => {
      const output = stamp(result);
      recordInvocation(caller.invocationKey, 'document.review_decide', state.documentId, output, inputDigest);
      return output;
    };
    // One finalizer, as execute() (K06): an error that can only precede a commit (cancellation, TypeError) is recorded; anything else re-throws.
    try {
    if (!safeInt(input.expectedRevision) || typeof input.reviewId !== 'string' ||
        !['approve', 'decline', 'apply', 'drop'].includes(input.action)) {
      return finish(failure('review_decision_invalid', 'invalid'));
    }
    // apply/drop leave the review open; approve with ids keeps those and closes; approve without applies all; decline drops all.
    // Only a proposal's pending splices can be named.
    const namedIds = input.changeIds === undefined ? null : input.changeIds;
    if (namedIds !== null && (!Array.isArray(namedIds) || !namedIds.length || namedIds.length > 128 ||
        namedIds.some(id => typeof id !== 'string'))) {
      return finish(failure('review_decision_invalid', 'invalid'));
    }
    if (input.action === 'decline' && namedIds !== null) return finish(failure('review_decision_invalid', 'invalid'));
    if ((input.action === 'apply' || input.action === 'drop') && namedIds === null) {
      return finish(failure('review_decision_invalid', 'invalid'));
    }
    const unsettled = await refresh(context);
    if (unsettled) return finish(unsettled);
    expireCollaboration();
    const review = state.review;
    if (!review || input.reviewId !== review.id) return finish(failure('review_missing', 'target_gone'));
    if (review.status !== 'pending') return finish(failure('review_not_pending', 'conflict', { review: reviewSummary() }));
    if (input.expectedRevision !== review.revision) {
      return finish(failure('review_document_changed', 'conflict', { review: reviewSummary() }));
    }
    if (reviewSurvivesEdits(review)) {
      surviveReview();
      if (review.status !== 'pending') return finish(failure('review_document_changed', 'conflict', { review: reviewSummary() }));
    } else if (review.revision !== state.revision || review.documentId !== state.documentId ||
        review.sourceDigest !== digest(state.text) || review.filename !== state.filename || review.docKind !== state.docKind) {
      invalidateReview(); return finish(failure('review_document_changed', 'conflict', { review: reviewSummary() }));
    }
    const closedKind = review.kind === 'check' || review.kind === 'inline' || !!review.options.compareDecision;
    if ((input.action === 'apply' || input.action === 'drop') && closedKind) {
      return finish(failure('review_decision_invalid', 'invalid', { review: reviewSummary() }));
    }
    if (input.action === 'decline') {
      if (Array.isArray(review.changes)) for (const row of review.changes) if (row.status === 'pending') row.status = 'dropped';
      review.status = 'declined'; review.decidedAt = now();
      review.decision = { action: 'decline', outcome: 'ok', revision: state.revision };
      return finish(accepted({ review: reviewSummary() }));
    }
    const who = participant(review, mintId);
    if (review.kind === 'check') {
      remember(state.reviewed, who, { revision: review.revision });
      review.status = 'approved'; review.decidedAt = now();
      review.decision = { action: 'approve', outcome: 'ok', revision: state.revision };
      return finish(accepted({ acknowledged: true, review: reviewSummary() }));
    }
    // A surviving review's handles were checked through surviveReview (with the evidence fallback); a second lookup here would reimpose the lapsed window.
    // Other reviews keep the direct check.
    if (!reviewSurvivesEdits(review)) {
      const pendingHandles = Array.isArray(review.changes)
        ? review.changes.filter(row => row.status === 'pending' && row.handleId).map(row => row.handleId)
        : review.handleIds;
      for (const id of pendingHandles) {
        const held = lookup('handles', id, who);
        if (held.outcome) { invalidateReview(held.reason); return finish({ ...held, review: reviewSummary() }); }
      }
    }
    const decision = review.options.compareDecision;
    if (decision && (state.compare?.id !== decision.compareId || decision.changeIds.some(id =>
        !state.compare.changes.some(row => row.id === id && row.status === 'pending')))) {
      invalidateReview('comparison_changed'); return finish(failure('review_comparison_changed', 'conflict', { review: reviewSummary() }));
    }
    const ownPending = pendingChangeIds(review);
    if (namedIds !== null) {
      if (decision || !ownPending.length || namedIds.some(id => !ownPending.includes(id))) {
        return finish(failure('review_decision_invalid', 'invalid', { review: reviewSummary() }));
      }
    }
    if (input.action === 'drop') {
      const drop = new Set(namedIds);
      for (const row of review.changes) if (row.status === 'pending' && drop.has(row.id)) row.status = 'dropped';
      refreshReviewExpiry(review);
      if (!pendingChangeIds(review).length) {
        const applied = review.changes.some(row => row.status === 'applied');
        review.status = applied ? 'approved' : 'declined'; review.decidedAt = now();
        review.decision = { action: applied ? 'approve' : 'decline', outcome: 'ok', revision: state.revision };
      }
      return finish(accepted({ review: reviewSummary() }));
    }
    const keep = new Set(namedIds !== null ? namedIds : ownPending);
    let splices, drawAssets = [], kept = null, dropped = null;
    if (Array.isArray(review.changes) && review.changes.length) {
      splices = review.changes.map((row, index) => row.status === 'pending' && keep.has(row.id) ? review.splices[index] : null)
        .filter(Boolean).sort((a, b) => b.pos - a.pos);
      // Definition derived fresh in committedText.
      drawAssets = review.changes.filter(row => row.status === 'pending' && keep.has(row.id) && row.asset).map(row => row.asset);
      if (input.action === 'approve' && namedIds !== null) {
        kept = namedIds.filter(id => keep.has(id));
        dropped = ownPending.filter(id => !keep.has(id));
      }
    } else {
      splices = review.splices;
      if (namedIds !== null) {
        const own = Array.isArray(review.changeIds) ? review.changeIds : [];
        splices = review.splices.slice(0, own.length).filter((_, index) => keep.has(own[index]));
        kept = own.filter(id => keep.has(id)); dropped = own.filter(id => !keep.has(id));
      }
    }
    const result = await commit(splices, who, context, review.operation, { ...review.options, approvedReview: review.id, drawAssets,
      ...((Array.isArray(review.changes) && review.changes.length) || namedIds !== null
        ? { authoredCount: splices.length, editCount: splices.length } : {}) });
    if (['applied', 'rebased', 'unchanged'].includes(result.outcome)) {
      if (Array.isArray(review.changes) && review.changes.length) {
        for (const row of review.changes) {
          if (row.status === 'pending' && keep.has(row.id)) {
            row.status = 'applied';
            if (row.handleId && state.handles[row.handleId]) state.handles[row.handleId].used = true;
          } else if (input.action === 'approve' && row.status === 'pending' && !keep.has(row.id)) {
            row.status = 'dropped';
          }
        }
      } else {
        for (const id of review.handleIds) if (state.handles[id]) state.handles[id].used = true;
      }
      if (decision && state.compare?.id === decision.compareId) {
        for (const row of state.compare.changes) if (decision.changeIds.includes(row.id)) row.status = decision.accept ? 'accepted' : 'rejected';
      }
      if (input.action === 'approve') {
        const anyApplied = Array.isArray(review.changes) ? review.changes.some(row => row.status === 'applied') : true;
        review.status = anyApplied ? 'approved' : 'declined'; review.decidedAt = now(); delete review.reason;
        review.decision = { action: 'approve', outcome: result.outcome, revision: state.revision, changeId: result.changeId || null,
          ...(kept ? { kept, dropped } : {}) };
      } else {
        surviveReview({ invalidateIfEmpty: false });
        if (!pendingChangeIds(review).length) {
          review.status = 'approved'; review.decidedAt = now(); delete review.reason;
          review.decision = { action: 'approve', outcome: result.outcome, revision: state.revision, changeId: result.changeId || null };
        }
      }
      if (review.options.note && typeof host.note === 'function') host.note(clip(review.options.note, 240));
    }
    return finish({ ...result, review: reviewSummary() });
    } catch (error) {
      if (error?.name === 'AbortError' || context.signal?.aborted) return finish(failure('cancelled'));
      if (error instanceof TypeError || error?.code === 'invalid_arguments') return finish(failure(clip(error.message, 160), 'invalid'));
      throw error;
    }
  }

  // Pure preview through committedText, validated exactly as reviewDecision; a door pins its token to this text.
  function previewReview({ reviewId, changeIds } = {}) {
    expireCollaboration();
    surviveReview();
    const review = state.review;
    if (typeof reviewId !== 'string' || !review || reviewId !== review.id || review.status !== 'pending') {
      return { outcome: 'review_missing' };
    }
    if (review.revision !== state.revision || review.documentId !== state.documentId ||
        review.sourceDigest !== digest(state.text) || review.filename !== state.filename || review.docKind !== state.docKind) {
      return { outcome: 'review_missing' };
    }
    const keepIds = changeIds === undefined ? null : changeIds;
    if (review.kind === 'check') {
      return keepIds === null ? { outcome: 'ok', text: state.text } : { outcome: 'review_decision_invalid' };
    }
    if (keepIds !== null && (!Array.isArray(keepIds) || !keepIds.length || keepIds.length > 128 || keepIds.some(id => typeof id !== 'string'))) {
      return { outcome: 'review_decision_invalid' };
    }
    const ownPending = pendingChangeIds(review);
    let splices = review.splices, authoredCount = review.options.authoredCount ?? review.splices.length, drawAssets = [];
    if (keepIds !== null) {
      if (review.options.compareDecision || !ownPending.length || keepIds.some(id => !ownPending.includes(id))) {
        return { outcome: 'review_decision_invalid' };
      }
      const keep = new Set(keepIds);
      if (Array.isArray(review.changes) && review.changes.length) {
        splices = review.changes.map((row, index) => row.status === 'pending' && keep.has(row.id) ? review.splices[index] : null)
          .filter(Boolean).sort((a, b) => b.pos - a.pos);
        drawAssets = review.changes.filter(row => row.status === 'pending' && keep.has(row.id) && row.asset).map(row => row.asset);
      } else {
        const own = Array.isArray(review.changeIds) ? review.changeIds : [];
        splices = review.splices.slice(0, own.length).filter((_, index) => keep.has(own[index]));
      }
      authoredCount = splices.length;
    } else if (Array.isArray(review.changes) && review.changes.length) {
      const keep = new Set(ownPending);
      splices = review.changes.map((row, index) => keep.has(row.id) ? review.splices[index] : null)
        .filter(Boolean).sort((a, b) => b.pos - a.pos);
      drawAssets = review.changes.filter(row => keep.has(row.id) && row.asset).map(row => row.asset);
      authoredCount = splices.length;
    }
    const computed = committedText(state.text, splices, authoredCount, review.actor, state.docKind, review.operation, false, undefined, drawAssets);
    if (!computed) return { outcome: 'review_missing' };
    return { outcome: 'ok', text: computed.text };
  }

  function decideReview(input, context = {}) {
    const run = () => reviewDecision(input, context);
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function activeChanges(who) {
    const withdrawn = new Set(state.journal.filter(row => row.sourceTransactionId).map(row => row.sourceTransactionId));
    return state.journal.filter(row => row.actor === 'agent' && row.owner === ownerOf(who) &&
      !row.sourceTransactionId && row.splices.length && !withdrawn.has(row.id));
  }

  function liveAgents(who) {
    const names = [];
    for (const row of activeChanges(who)) if (row.agent && !names.includes(row.agent)) names.push(row.agent);
    return names;
  }

  function inverse(entry) {
    const later = since(entry.revision);
    if (!later) return failure('history_unavailable', 'conflict');
    const reverse = (splices, keepIndices = false) => {
      const rows = [];
      for (let index = splices.length - 1; index >= 0; index--) {
        const row = splices[index];
        const range = transportInterval(row.pos, row.pos + row.inserted.length, splices.slice(index + 1));
        if (!range) return null;
        // Where this row's words stood before any row of the change ran: deletions that collapse at one point restore there
        // from the right-hand one first, so the left-hand one lands before it and the words read as they did.
        let origin = row.pos;
        for (let back = index - 1; back >= 0; back--) {
          const earlier = splices[back];
          if (origin >= earlier.pos) origin = origin >= earlier.pos + earlier.inserted.length
            ? origin - earlier.inserted.length + earlier.removed.length : earlier.pos;
        }
        rows.push({ pos: range.start, removed: row.inserted, inserted: row.removed, origin, index });
      }
      return rows.sort((a, b) => b.pos - a.pos || b.origin - a.origin).map(({pos, removed, inserted, index}) =>
        ({pos, removed, inserted, ...(keepIndices ? {index} : {})}));
    };
    // An edit followed by its exact Undo is neutral, including nested undone pairs. Keep the journal and
    // handle invalidation intact; only inverse transport can cross these proven cancellations. A claimed
    // sourceTransactionId alone is not proof: every inverse row, unit and coordinate must agree.
    const remaining = [];
    for (const row of later) {
      const prior = remaining.at(-1), reversed = prior && row.sourceTransactionId === prior.id && reverse(prior.splices);
      if (reversed && reversed.length === row.splices.length && reversed.every((undo, index) => {
        const actual = row.splices[index];
        return undo.pos === actual.pos && undo.removed === actual.removed && undo.inserted === actual.inserted;
      })) remaining.pop();
      else remaining.push(row);
    }
    const reversed = reverse(entry.splices, true);
    if (!reversed) return failure('change_not_invertible', 'conflict');
    const operations = [];
    for (const row of reversed) {
      let range = { start: row.pos, end: row.pos + row.removed.length };
      for (const laterEntry of remaining) {
        range = transportInterval(range.start, range.end, laterEntry.splices);
        if (!range) break;
      }
      if (!range || state.text.slice(range.start, range.end) !== row.removed) {
        // New replies or independent edits must not prevent selective Undo of prose. Their
        // current thread record remains; commit re-derives anchors over the admitted inverse.
        if (row.index === entry.derivedCommentIndex) continue;
        return failure('change_interleaved', 'conflict');
      }
      operations.push({pos: range.start, removed: row.removed, inserted: row.inserted});
    }
    operations.sort((a, b) => b.pos - a.pos);
    for (let index = 1; index < operations.length; index++) {
      if (operations[index].pos + operations[index].removed.length > operations[index - 1].pos) return failure('change_interleaved', 'conflict');
    }
    return operations;
  }

  async function undo(input, who, context) {
    const changes = activeChanges(who);
    const label = who.agent || '';
    const latest = changes.at(-1) || null;
    // No name: one stream, the latest change. A name undoes that name's latest, never another name's.
    const own = label ? changes.filter(row => row.agent === label) : changes;
    const entry = input.change_id ? changes.find(row => row.id === input.change_id) : own.at(-1);
    const other = !input.change_id && label && latest && latest.agent !== label ? {
      latestChangeId: latest.id,
      ...(latest.agent ? { latestAgent: latest.agent } : {}),
      route: latest.agent
        ? 'The latest change is ' + latest.agent + '\'s (' + latest.id + '). Name change_id to undo it.'
        : 'The latest change (' + latest.id + ') has no agent name. Name change_id to undo it.',
    } : null;
    if (!entry) {
      if (other) return failure('other_agent_latest', 'refused', other);
      return failure(input.change_id ? 'change_not_owned_or_unavailable' : 'no_agent_change', 'target_gone');
    }
    let splices = inverse(entry);
    if (splices.reason === 'change_interleaved') {
      const row = commentUndoSplice(state.text, entry, since(entry.revision));
      if (row) splices = [row];
    }
    if (splices.outcome) return splices;
    const result = await commit(splices, who, context, 'document.undo_agent_change', {
      label: `Undo ${entry.label}`, sourceTransactionId: entry.id, restores: true, editCount: splices.length,
    });
    if (result.outcome === 'applied') {
      result.undoneChangeId = entry.id;
      if (other) Object.assign(result, other);
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
        removed: change.removed, inserted: change.inserted, status: 'pending', inspectedBy: [] });
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
    return { id: mintId('compare_'), owner: ownerOf(who), revision: state.revision,
      baseline, incoming, name: clip(name || 'Comparison.md', 512), changes, createdAt: now() };
  }

  function comparisonFields() {
    if (!state.compare) return null;
    return {
      compareId: state.compare.id, name: state.compare.name,
      changes: state.compare.changes.length,
      // `remaining`, not `pending`: the envelope's pending is the typed outcome (K05).
      open: state.compare.changes.filter(row => row.status === 'pending').length,
      accepted: state.compare.changes.filter(row => row.status === 'accepted').length,
      rejected: state.compare.changes.filter(row => row.status === 'rejected').length,
      items: state.compare.changes.slice(0, 24).map(row => ({ change_id: row.id, status: row.status,
        removed_chars: row.removed.length, inserted_chars: row.inserted.length,
        preview: clip(row.inserted ? disclose(state.compare.incoming, row.incomingStart, row.incomingEnd).text
          : disclose(state.compare.baseline, row.start, row.end).text, 96) })),
      remaining: Math.max(0, state.compare.changes.length - 24),
    };
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
    const presentation = {};
    if (typeof host.compare === 'function') {
      const result = await host.compare({ documentId: state.documentId, revision: state.revision, compareId: compared.id,
        currentText: baseline, incomingText: input.text, currentName: state.filename, incomingName: compared.name,
        ...who, signal: context.signal });
      if (!result?.ok) return failure(result?.reason || 'compare_open_refused');
      presentation.visible = true;
    }
    state.compare = compared;
    // Remote editors consume the comparison asynchronously. No local acknowledgement means unknown, not hidden.
    return { ...comparisonContext(), ...presentation };
  }

  // One owner of open/accept/reject/close; action defaults to open. A retried key with different action or ids collides.
  async function compareAction(input, who, context) {
    const action = input.action || 'open';
    if (action === 'open') return compareText(input, who, context);
    if (action === 'accept' || action === 'reject') {
      return state.compare?.reviewOnly && who.actor !== 'human'
        ? failure('review_only', 'refused', { next: 'document.undo_agent_change' })
        : await decideChanges(input, who, context, action === 'accept');
    }
    if (action === 'close') {
      if (!state.compare) return failure('compare_not_open');
      if (who.actor !== 'human' && state.compare.owner !== ownerOf(who)) return failure('compare_not_owned');
      if (typeof host.closeCompare === 'function') {
        const closed = await host.closeCompare({ documentId: state.documentId, ...who, signal: context.signal });
        if (!closed?.ok) return failure(closed?.reason || 'compare_close_refused');
      }
      state.compare = null;
      return accepted({ closed: true });
    }
    return failure('action_invalid', 'invalid');
  }

  function getComparisonChange(id) {
    if (!state.compare) return failure('compare_not_open');
    return changeOf(id) || failure('change_missing', 'target_gone');
  }

  function readChange(input, who) {
    const row = getComparisonChange(input.change_id);
    if (row.outcome) return row;
    const removed = disclose(state.compare.baseline, row.start, row.end);
    const inserted = disclose(state.compare.incoming, row.incomingStart, row.incomingEnd);
    const omitted = removed.omissions.length + inserted.omissions.length;
    const total = row.removed.length + row.inserted.length;
    if (omitted || total > LIMITS.readChars || bytes(row.removed) + bytes(row.inserted) > LIMITS.resultBytes - 2048) {
      return accepted({ change_id: row.id, status: row.status, removed_chars: row.removed.length,
        inserted_chars: row.inserted.length, removed: clip(removed.text, 1200), inserted: clip(inserted.text, 1200),
        complete: false, reason: omitted ? 'source_redacted' : 'change_over_read_budget',
        ...(omitted ? { omissions: [...removed.omissions, ...inserted.omissions].slice(0, 4) } : {}) });
    }
    pendingInspection = { row, owner: ownerOf(who) };
    return accepted({ change_id: row.id, status: row.status, start: row.start, end: row.end,
      removed: row.removed, inserted: row.inserted, complete: true });
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
    return accepted({
      matches: page.map(row => {
        const preview = clip(row.inserted ? disclose(state.compare.incoming, row.incomingStart, row.incomingEnd).text
          : disclose(state.compare.baseline, row.start, row.end).text, 160);
        const change = changeOf(row.id);
        return {
          matched: preview, handle: row.id, snippet: preview,
          start: change ? change.start : 0, end: change ? change.end : 0,
          handle_scope: 'change', status: row.status,
        };
      }),
      remaining: found.length - end, next_cursor: next?.id || null, complete: !next?.id,
    });
  }

  async function decideChanges(input, who, context, accept) {
    const compared = state.compare;
    if (!compared) return failure('compare_not_open');
    if (who.actor !== 'human' && compared.owner !== ownerOf(who)) return failure('compare_not_owned');
    if (compared.detached && accept) return failure('comparison_not_current_document');
    if (input.change_ids != null && (!Array.isArray(input.change_ids) || input.change_ids.some(id => typeof id !== 'string') ||
        new Set(input.change_ids).size !== input.change_ids.length)) return failure('change_ids_invalid', 'invalid');
    const ids = input.change_ids || compared.changes.filter(row => row.status === 'pending').map(row => row.id);
    const rows = ids.map(id => compared.changes.find(row => row.id === id));
    if (rows.some(row => !row || row.status !== 'pending')) return failure('change_not_pending');
    if (!rows.length) return { outcome: 'unchanged', decided: 0 };
    const acknowledge = status => {
      for (const row of rows) row.status = status;
      if (who.actor === 'human' && compared.reviewOnly && compared.changes.every(row => row.status !== 'pending')) {
        const entry = state.journal.find(row => row.id === compared.changeId);
        if (entry) entry.humanReviewed = true;
      }
    };
    if ((!compared.reviewOnly && !accept) || (compared.reviewOnly && accept)) {
      acknowledge(accept ? 'accepted' : 'rejected'); return { outcome: 'applied', decided: rows.length };
    }
    if (who.actor !== 'human' && rows.some(row => !row.inspectedBy.includes(ownerOf(who)))) return failure('change_not_inspected');
    if (who.actor !== 'human' && (rows.length > LIMITS.edits || rows.reduce((sum, row) => sum + row.inserted.length, 0) > LIMITS.editChars)) return failure('batch_too_large', 'invalid');
    const splices = [];
    for (const row of rows) {
      const reverting = compared.reviewOnly === true;
      const resolved = relocate({ start: reverting ? row.incomingStart : row.start, end: reverting ? row.incomingEnd : row.end,
        revision: compared.revision, text: reverting ? row.inserted : row.removed });
      if (resolved.outcome) return resolved;
      splices.push({ pos: resolved.start, removed: reverting ? row.inserted : row.removed, inserted: reverting ? row.removed : row.inserted });
    }
    splices.sort((a, b) => b.pos - a.pos);
    const result = await commit(splices, who, context, 'document.compare', {
      label: accept ? 'Accept comparison changes' : 'Reject comparison changes', keepCompare: true,
      compareDecision: { compareId: compared.id, changeIds: rows.map(row => row.id), accept },
    });
    const landed = result.outcome === 'applied' || result.outcome === 'rebased';
    if (landed) acknowledge(accept ? 'accepted' : 'rejected');
    return { ...result, decided: landed ? rows.length : 0 };
  }

  async function showChanges(input, who, context) {
    const changes = activeChanges(who);
    const entry = input.change_id ? changes.find(row => row.id === input.change_id) : changes.at(-1);
    if (!entry) return failure('change_not_owned_or_unavailable', 'target_gone');
    const splices = inverse(entry);
    if (splices.outcome) return splices;
    const baseline = transformSplices(state.text, splices);
    if (baseline == null) return failure('change_interleaved', 'conflict');
    const result = await compareText({ text: state.text, name: state.filename }, who, context, baseline);
    if (result.outcome !== 'ok' || state.compare?.id !== result.compareId) return result;
    state.compare.reviewOnly = true; state.compare.changeId = entry.id;
    return { ...result, changeId: entry.id, review_only: true };
  }

  async function openText(input, who, context) {
    const filename = input.filename || 'Untitled.md', kind = input.docKind || documentKind(filename);
    if (!validName(filename) || !['markdown', 'text', 'code'].includes(kind)) return failure('filename_invalid', 'invalid');
    const invalid = admissibleText(input.text);
    if (invalid) return failure(invalid, 'invalid');
    if (who.actor === 'agent' && state.docKind === 'markdown' && kind !== 'markdown' && parseWill(state.text).present) {
      return failure('document_law', 'refused', { law: 'keep', rule: 'carrier_changed' });
    }
    const splice = minimalSplice(state.text, input.text), splices = splice.removed || splice.inserted ? [splice] : [];
    if (typeof host.open === 'function') {
      // The worker door's law and posture (commit, below) before the host opens anything: the one splice from the document
      // to the text answers to the person's Will and to the review, and a refusal or a staged review asks the host nothing.
      if (splices.length || filename !== state.filename || kind !== state.docKind) {
        const gate = commitGate(splices, who);
        if (gate && gate.reason !== 'human_review_required') return gate;
        const law = enforceWill(state.text, input.text, splices, { docKind: state.docKind, actor: who.actor, referenceCheck: host.referenceCheck });
        const reviewed = reviewableLaw(state.text, splices, law);
        if (law && reviewed == null) return failure('document_law', 'refused', law);
        const open = { label: 'Open document', metadata: { filename, docKind: kind }, authoredCount: splices.length, editCount: splices.length };
        if (gate?.reviewKind === 'check') return stageReview('check', [], who, context, 'document.open_text', open);
        if (law || gate) return stageReview('proposal', splices, who, context, 'document.open_text',
          { ...open, reviewedRegion: reviewed, authoredSplices: splices, byPosture: !!gate, ...(reviewed == null ? {} : { law: 'keep', region: reviewed }) });
      }
      const result = await host.open({ documentId: state.documentId, newDocumentId: mintId('doc_'), filename,
        text: input.text, docKind: kind, ...who, signal: context.signal });
      if (!result?.ok) return failure(result?.reason || 'open_refused');
      if (result.documentId && result.documentId !== state.documentId) {
        state = createState({ documentId: result.documentId, filename, text: input.text, docKind: kind, revision: result.revision, mintId });
        return { outcome: 'applied', filename, docKind: kind };
      }
      const revision = safeInt(result.revision) && result.revision > state.revision ? result.revision : state.revision + 1;
      if (transformSplices(state.text, [splice]) !== input.text) {
        // The host already opened this source. Adopt it, but do not invent an unencodable undo
        // record when opening repaired text over an already-damaged current document.
        reconcile({ documentId: state.documentId, revision, text: input.text, filename, docKind: kind }, who);
      } else if (splice.removed || splice.inserted || filename !== state.filename || kind !== state.docKind) {
        appendCommit(input.text, splice.removed || splice.inserted ? [splice] : [], who, 'document.open_text', { revision });
      }
      state.filename = filename; state.docKind = kind; state.handles = {}; state.refs = {}; state.cursors = {}; state.compare = null; outlineCache = null;
      return { outcome: 'applied', filename, docKind: kind };
    }
    const result = await commit(splices, who, context, 'document.open_text', {
      label: 'Open document', metadata: { filename, docKind: kind },
    });
    if (['applied', 'unchanged'].includes(result.outcome)) {
      if (result.outcome === 'unchanged' && (state.filename !== filename || state.docKind !== kind)) {
        appendCommit(state.text, [], who, 'document.open_text'); result.outcome = 'applied';
      }
      state.filename = filename; state.docKind = kind; state.handles = {}; state.refs = {}; state.cursors = {}; state.compare = null; outlineCache = null;
    }
    return { ...result, filename, docKind: kind };
  }

  // One entry point, registry row and commit owner: recipe_handle selects drawEdit, else drawCreate.
  async function drawPicture(input, who, context) {
    if (state.docKind !== 'markdown') return failure('draw_requires_markdown', 'invalid');
    if (changeOf(input.recipe_handle) || changeOf(input.context_handle)) return failure('context_handle_wrong_kind', 'invalid');
    return input.recipe_handle ? drawEdit(input, who, context) : drawCreate(input, who, context);
  }

  async function drawCreate(input, who, context) {
    if (input.recipe != null && input.figures != null) return failure('draw_recipe_figures_conflict', 'invalid');
    if (typeof input.alt !== 'string' || !input.alt.trim()) return failure('draw_alt_required', 'invalid');
    const assets = documentAssets(state.text);
    let position = assets.appendixStart, held = null, rebased = false, heldOffset = 0;
    if (input.context_handle) {
      held = lookup('handles', input.context_handle, who);
      if (held.outcome) return held;
      if (held.kind === 'image-comment') return failure('context_handle_wrong_kind', 'invalid');
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
      // K03.
      heldOffset = position - range.start;
    }
    const early = commitGate([{ pos: position, removed: '', inserted: '' }], who);
    if (early && early.reason !== 'human_review_required') return early;
    if (early?.reviewKind === 'check') {
      const fenced = commitFenceRefusal();
      if (fenced) return fenced;
      return stageReview('check', [], who, context, 'document.draw', { label: input.label || 'Draw a picture' });
    }
    let svg, recipe;
    try {
      const recipeInput = input.recipe != null ? input.recipe : input.figures != null ? { figures: input.figures, direction: input.direction } : null;
      recipe = recipeInput && _rapierDrawNormalizeAgentRecipe(recipeInput);
      // A refused figure names itself (draw/core.mjs _rapierDrawFigureFault): the index, the field and what the field takes,
      // and the kinds a figure may name (the list draw/core.mjs admits).
      if (!recipe) return input.figures != null && input.recipe == null ? failure('figures_invalid', 'invalid', { ...(_rapierDrawFigureFault(input.figures, [], input.direction) || {}), kinds: FIGURE_KINDS }) : failure('recipe_invalid', 'invalid');
      recipe = applyOperations(recipe, input.operations || []).recipe;
      if (!recipe.shapes.length || recipe.shapes.length > 128) return failure('draw_shape_limit', 'invalid');
      svg = _rapierDrawBuildSVG(recipe);
    }
    catch (error) { return failure(error?.code || 'draw_render_failed'); }
    if (!svg) return failure('recipe_invalid', 'invalid');
    const source = state.text, revision = state.revision, documentId = state.documentId;
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
    const facts = outlineMarkdown(appended.source, {limit: 0}, markdownParser());
    if (!facts.images?.entries.some(row => row.blockStart === occStart && row.id === normalizeLabel(appended.reference))) {
      return failure(facts.blocks?.complete ? 'draw_placement_unavailable' : 'draw_structure_unavailable');
    }
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    const result = await commit(splices, who, context, 'document.draw', {
      label: input.label || 'Draw a picture', editCount: 1, authoredCount: 1, rebased,
      handleIds: held ? [held.id] : [], reviewInline: false,
      handlePairs: [{ handleId: held ? held.id : null, offset: heldOffset }],
      drawAssets: [{ id: normalizeLabel(appended.reference), label: appended.reference, url: asset.url, title: asset.title }],
    });
    if (!['applied', 'rebased'].includes(result.outcome)) return result;
    if (held) held.used = true;
    const recipeHandle = drawHandle(occStart, occStart + raw.length, JSON.stringify(recipe), appended.reference, who);
    return { ...result, asset: {reference: appended.reference, title}, width: asset.width, height: asset.height,
      recipe_handle: recipeHandle?.id || null };
  }

  // Patches the recipe disclosed at mint, never a re-read, so relocate() catches a person's edit. New content-addressed asset;
  // occurrence rewritten in place; the old definition retires via imageDeletionSplices. One definition throughout.
  async function drawEdit(input, who, context) {
    if (input.recipe != null || input.figures != null) return failure('draw_edit_recipe_conflict', 'invalid');
    const patch = input.shapes;
    if (!input.operations?.length && !(patch && (patch.add?.length || patch.replace?.length || patch.remove?.length))) return failure('draw_edit_empty', 'invalid');
    if (input.alt != null && (typeof input.alt !== 'string' || !input.alt.trim())) return failure('draw_alt_required', 'invalid');
    const held = lookup('handles', input.recipe_handle, who);
    if (held.outcome) return held;
    if (held.kind !== 'draw') return failure('context_handle_wrong_kind', 'invalid');
    const range = relocate(held);
    if (range.outcome) return range;
    if (held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
    const early = commitGate([{ pos: range.start, removed: held.text, inserted: '' }], who);
    if (early && early.reason !== 'human_review_required') return early;
    // An open Draw's fence admits only a plain shapes patch: anything else would be overwritten by the person's Done.
    const editingFence = { operation: 'document.draw', drawingAsset: held.assetLabel || '',
      shapesOnly: !!input.shapes && !input.operations?.length && input.alt == null };
    // Early read only, deciding the CHECK branch; commit() re-establishes it at the boundary (DS-02). Never from the wire.
    const watched = !!commitFenceRefusal() && !commitFenceRefusal(editingFence);
    // R87g law: a CHECK draw on the open drawing lands immediately; elsewhere unchanged.
    if (early?.reviewKind === 'check' && !watched) {
      const fenced = commitFenceRefusal();
      if (fenced) return fenced;
      return stageReview('check', [], who, context, 'document.draw', { label: input.label || 'Edit a drawing' });
    }
    let svg, recipe;
    try {
      let base = JSON.parse(held.recipeJSON);
      if (input.shapes) {
        // Kept bytes belong to this held paint id, never to a new shape or an array position.
        const shapes = { ...input.shapes, replace: input.shapes.replace?.slice() };
        if (shapes.add?.some(shape => shape.raster?.kept === true)) return failure('recipe_invalid', 'invalid');
        for (let i = 0; i < (shapes.replace?.length || 0); i++) {
          const shape = shapes.replace[i];
          if (shape.recognized !== 'paint' || shape.raster?.kept !== true) continue;
          const original = base.shapes.find(original => original.id === shape.id && original.recognized === 'paint');
          if (!original) return failure('recipe_invalid', 'invalid');
          shapes.replace[i] = { ...shape, raster: original.raster };
        }
        const patched = _rapierDrawApplyShapesPatch(base, shapes);
        // A figure that cannot be added names itself, as on a create; a shape or a replace that cannot land stays a bare refusal.
        if (!patched) return failure('draw_shapes_patch_invalid', 'invalid', _rapierDrawFigureFault((shapes.add || []).filter(raw => raw && typeof raw.kind === 'string'), base.shapes) || {});
        base = patched;
      }
      recipe = applyOperations(base, input.operations || []).recipe;
      if (!recipe.shapes.length || recipe.shapes.length > 128) return failure('draw_shape_limit', 'invalid');
      svg = _rapierDrawBuildSVG(recipe);
    } catch (error) { return failure(error?.code || 'draw_render_failed'); }
    if (!svg) return failure('recipe_invalid', 'invalid');
    const source = state.text, revision = state.revision, documentId = state.documentId;
    const occStart = range.start, oldOccText = held.text;
    let asset, appended, raw, title;
    try {
      title = _rapierDrawNextAssetName(documentAssets(source).assets.values());
      asset = await createAsset(encoder.encode(svg), null, {codec: 'image/svg+xml', title});
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
    const facts = outlineMarkdown(validated, {limit: 0}, markdownParser());
    if (!facts.images?.entries.some(row => row.blockStart === occStart && row.id === normalizeLabel(appended.reference))) {
      return failure(facts.blocks?.complete ? 'draw_placement_unavailable' : 'draw_structure_unavailable');
    }
    const refreshed = await refresh(context);
    if (refreshed) return refreshed;
    if (state.documentId !== documentId || state.revision !== revision || state.text !== source) return failure('document_changed', 'conflict');
    const result = await commit(splices, who, context, 'document.draw', {
      fence: editingFence, watched,
      label: input.label || 'Edit a drawing', editCount: 1, authoredCount: splices.length, handleIds: [held.id], reviewInline: false,
      handlePairs: [{ handleId: held.id, offset: occStart - range.start }],
      drawAssets: [{ id: normalizeLabel(appended.reference), label: appended.reference, url: asset.url, title: asset.title }],
    });
    if (!['applied', 'rebased'].includes(result.outcome)) return result;
    held.used = true;
    const recipeHandle = drawHandle(occStart, occStart + raw.length, JSON.stringify(recipe), appended.reference, who);
    // `replaced`: the picture the handle held; the replay matches on it. Never from the wire.
    return { ...result, asset: {reference: appended.reference, title}, replaced: held.assetLabel || null,
      width: asset.width, height: asset.height, recipe_handle: recipeHandle?.id || null };
  }

  function sourceChanges(who) {
    const observed = state.resume[ownerOf(who)]?.revision;
    if (observed == null) return { sinceRevision: null, throughRevision: state.revision, complete: true, changes: [], reason: 'first_observation' };
    const retained = since(observed);
    const entries = retained || state.journal.filter(row => row.revision > observed);
    const rows = entries.slice(-8);
    const changes = rows.map(entry => {
      const targets = [];
      const later = since(entry.revision);
      if (later) for (let index = 0; index < entry.splices.length && targets.length < 2; index++) {
        const row = entry.splices[index];
        let range = transportInterval(row.pos, row.pos + row.inserted.length, entry.splices.slice(index + 1));
        for (const next of later) { if (!range) break; range = transportInterval(range.start, range.end, next.splices); }
        if (!range) continue;
        const ref = reference(range.start, range.end, who, { kind: 'change' });
        if (ref) targets.push({ ref: ref.id, chars: range.end - range.start });
      }
      return { changeId: entry.id, revision: entry.revision, actor: entry.actor,
        ...(entry.agent ? { agent: entry.agent } : {}),
        yours: entry.owner === ownerOf(who),
        operation: clip(entry.operation, 64), label: display(entry.label, 96),
        insertedChars: entry.splices.reduce((sum, row) => sum + row.inserted.length, 0),
        removedChars: entry.splices.reduce((sum, row) => sum + row.removed.length, 0), targets };
    });
    return { sinceRevision: observed, throughRevision: state.revision, complete: !!retained && entries.length <= rows.length,
      retainedChanges: entries.length, omitted: entries.length - rows.length, changes,
      ...(!retained ? { reason: 'retained_history_limited' } : {}) };
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
      ...(row.recipient ? {recipient: display(row.recipient, 64)} : {})});
    while (offset < rows.length) {
      const row = rows[offset];
      const message = thread ? {...publicMessage(row), text: clip(row.text.slice(textOffset), 2048), offset: textOffset,
        complete: textOffset + clip(row.text.slice(textOffset), 2048).length === row.text.length, chars: row.text.length} : null;
      const item = thread ? message : {id: row.id, resolved: row.resolved, anchor: publicCommentAnchor(row.anchor, parsed),
        messages: row.messages.length, lastMessage: {...publicMessage(row.messages.at(-1)), text: display(row.messages.at(-1).text, 240)}};
      if (bytes(JSON.stringify([...items, item])) > budget) break;
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
        if (held.kind === 'draw' && held.assetDigest && assetDigest(held.assetLabel) !== held.assetDigest) return failure('target_changed', 'conflict');
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
    const result = await commit([row], who, context, 'document.comment', {label: 'Comment', editCount: 1,
      authoredCount: 1, reviewInline: false});
    return {...result, threadId: thread.id, ...(message ? {messageId: message.id} : {})};
  }

  function inspectVisual(input, context) {
    const pointing = collaboration().presence;
    const prepared = visualRequest({...state, selection: pointing?.selection || state.selection,
      focus: pointing?.focus || state.focus}, input);
    if (prepared.outcome !== 'ok') return prepared;
    const mode = 'visual:' + prepared.request.scope;
    if (context.continues) {
      const invalid = checkContinuation(context, mode);
      if (invalid) return invalid;
      const prior = pendingFacts.get(context.continues);
      pendingFacts.delete(context.continues);
      if (canonicalJson(prior.requirements?.sourceRange) !== canonicalJson(prepared.request.sourceRange)) return failure('visual_target_changed');
    }
    if (context.world?.visual) return visualResult(prepared.request, context.world.visual);
    const requestId = mintId('fact_');
    pendingFacts.set(requestId, {documentId: state.documentId, revision: state.revision, mode, requirements: prepared.request});
    while (pendingFacts.size > LIMITS.invocationKeys) pendingFacts.delete(pendingFacts.keys().next().value);
    return {outcome: 'pending', reason: 'surface_fact_required', pending: {kind: 'surface-fact', requestId, requirements: prepared.request}};
  }

  async function execute(name, input, context) {
    pendingInspection = null;
    const who = participant(context, mintId);
    const named = agentLabel(input && input.agent);
    if (named) who.agent = named;
    // Digest before either branch: recordInvocation wants the digest of whatever ran under this key.
    const inputDigest = digest(canonicalJson(input));
    // One finalizer inside the invocation boundary (K06): every outcome records its code. A collision is not recorded; a replay writes no second row.
    const finalize = (result, { record = true } = {}) => {
      const output = stamp(result || failure('operation_failed'));
      if (record) recordInvocation(who.invocationKey, name, state.documentId, output, inputDigest);
      return output;
    };
    try {
    // A wire-supplied key refuses the envelope, still recorded under participant()'s key.
    if (context.rejectedInvocationKey) {
      return finalize(failure('invocation_key_not_allowed', 'invalid'));
    }
    // A continuation reuses the key; skip dedupe or it replays its predecessor's pending forever. It still overwrites the record.
    if (!context.continues) {
      const prior = priorInvocation(who.invocationKey);
      // inputDigest must match; an undigested row never matches and collides. A replay says it is the record, so a caller
      // that meant a new operation under an old name learns that nothing new ran. First owner wins the key; a collision is
      // never recorded.
      if (prior) return replayOf(prior, name, inputDigest) || stamp(failure('invocation_key_collision', 'invalid'));
    }
    const descriptor = getTool(name);
    if (!descriptor) return finalize(failure('operation_unknown', 'invalid'));
    validateInput(descriptor.inputSchema, input);
    const beforeHandles = new Set(Object.keys(state.handles));
    const unsettled = await refresh(context);
    if (unsettled) return finalize(unsettled);
    prune();
    let result;
    let resumed = false;
    switch (name) {
      case 'document.get_context': {
        const facts = await markdownFacts(context);
        if (facts?.outcome) { result = facts; break; }
        const layout = facts?.layout, images = facts?.images;
        const returns = typeof host.returns === 'function' ? await host.returns() : [];
        const will = state.docKind === 'markdown' ? parseWill(state.text) : null;
        const together = collaboration(), pointing = together.presence;
        const selected = pointing?.selection || state.selection;
        const focused = pointing?.focus || state.focus;
        const focus = focused && reference(focused.start, focused.end, who, { kind: 'focus' });
        result = accepted({ filename: state.filename, docKind: state.docKind, chars: state.text.length,
          surface: pointing?.active ? { kind: 'editor', next: 'continue' } : { kind: 'headless', next: 'deliver_page' },
          editing: editingState(who, together, will),
          readOnly: state.readOnly, posture: state.posture, ...(state.notes ? { notes: state.notes } : {}), selection: selected ? { start: selected.start, end: selected.end } : null,
          focus: focus ? { ref: focus.id, chars: focus.end - focus.start, kind: pointedKind(state.text, focus.start, focus.end, images) } : null,
          collaboration: { posture: together.posture, readOnly: together.readOnly, presence: together.presence,
            review: contextReviewProjection(state.review) },
          sourceChanges: sourceChanges(who),
          ...(state.docKind === 'markdown' ? {comments: commentSummary(state.text)} : {}),
          ...(liveAgents(who).length ? { agents: liveAgents(who) } : {}),
          ...(images ? { images: { scope: 'markdown', total: images.total, indexed: images.entries.length,
            profiles: images.entries.reduce((counts, row) => { counts[row.profile]++; return counts; }, { embedded: 0, linked: 0 }),
            drawings: images.entries.filter(row => row.drawing).length,
            assetRecords: images.assetRecords, declaredAssetBytes: images.declaredAssetBytes,
            complete: images.complete, omitted: Math.max(0, images.total - images.entries.length),
            ...(images.reason ? { reason: images.reason } : {}) } } : {}),
          ...(layout && (layout.total || !layout.complete || layout.faults?.length) ? { layout: { standard: 'md-layout:v1', annotatedBlocks: layout.total,
            alignments: [...new Set(layout.entries.map(row => row.align).filter(Boolean))],
            // All four wrap values leave normal flow.
            wrappedImages: layout.entries.filter(row => row.kind === 'image' && ['around', 'box', 'behind', 'front'].includes(row.wrap)).length,
            // Comments the renderer ignored: the count, and each one's reason and block (the agent's own check on what it wrote).
            malformed: (layout.faults || []).length, ...(layout.faults?.length ? { faults: layout.faults.slice(0, 8) } : {}),
            complete: layout.complete, omitted: Math.max(0, layout.total - layout.entries.length),
            ...(layout.reason ? { reason: layout.reason } : {}) } } : {}),
          history: { complete: state.history.complete, earliestRevision: state.history.earliestRevision,
            retainedChanges: state.journal.length, trimmedBytes: state.history.trimmedBytes,
            reviewEvidenceComplete: !missingReviewHistory(who) },
          // Structure is a declared world fact; `available` names only the size bound (agent/structure-request.mjs).
          ...(/\.(?:[cm]?js|html?)$/i.test(state.filename) ? { structure: { engine: 'acorn@8.18.0',
            available: state.text.length <= 8 * 1024 * 1024,
            supports: ['outline', 'declaration', 'reference', 'call', 'construct', 'write', 'member', 'import', 'export'] } } : {}),
          ...(will?.present ? { law: { default: will.faults.length ? 'keep' : 'edit', regions: will.regions.length,
            laws: [...new Set(will.regions.map(row => row.law))], ...(will.faults.length ? { faults: will.faults.slice(0, 4), faultCount: will.faults.length } : {}) } } : {}),
          ...(state.compare ? { compare: comparisonFields() } : {}),
          returns, returnWaiting: returns.length > 0,
        });
        const brief = await continuationBrief(context, Math.min(3072, LIMITS.resultBytes - bytes(JSON.stringify(result)) - bytes(JSON.stringify(current())) - 128));
        if (brief?.outcome) result = brief;
        else if (brief) result.brief = brief;
        resumed = true;
        break;
      }
      case 'document.get_outline': result = await getOutline(input, who, context); break;
      case 'document.list_comments': result = listComments(input, who); break;
      case 'document.comment': result = await comment(input, who, context); break;
      case 'document.inspect_visual': result = inspectVisual(input, context); break;
      case 'document.read_context':
        result = input.return_id !== undefined
          ? typeof host.readReturn === 'function' ? await host.readReturn(input) : failure('return_unavailable')
          : await readContext(input, who, context);
        break;
      case 'document.find': result = await find(input, who, context); break;
      case 'document.apply_edits': result = await applyEdits(input, who, context); break;
      case 'document.propose_edits': result = await applyEdits(input, who, context, true); break;
      case 'document.undo_agent_change': result = await undo(input, who, context); break;
      case 'document.compare': result = await compareAction(input, who, context); break;
      case 'document.show_changes': result = await showChanges(input, who, context); break;
      case 'document.open_text': result = await openText(input, who, context); break;
      case 'document.reveal': {
        const change = changeOf(input.context_handle);
        if (change) {
          if (typeof host.revealChange !== 'function') { result = failure('reveal_unavailable'); break; }
          const value = await host.revealChange({ documentId: state.documentId, revision: state.revision, compareId: state.compare.id, changeId: change.id,
            hostCompareId: state.compare.hostCompareId || null,
            start: change.start, end: change.end, incomingStart: change.incomingStart, incomingEnd: change.incomingEnd,
            removed: change.removed, inserted: change.inserted, currentText: state.compare.baseline, incomingText: state.compare.incoming,
            index: state.compare.changes.indexOf(change), ...who, signal: context.signal });
          result = value?.pending && value.viewId ? { outcome: 'pending', reason: 'presentation_pending', view: { id: value.viewId, status: 'pending' } }
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
        result = value?.pending && value.viewId ? { outcome: 'pending', reason: 'presentation_pending', view: { id: value.viewId, status: 'pending' } }
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
          timeout_ms: bounded(input.timeout_ms, 30000, 1000, 120000), after_return_id: input.after_return_id, ...who, signal: context.signal });
        if (!result || typeof result !== 'object') result = failure('wait_unavailable');
        break;
      }
      case 'document.save': {
        if (typeof host.save !== 'function') { result = failure('save_unavailable'); break; }
        const value = await host.save({ documentId: state.documentId, revision: state.revision, filename: state.filename, text: state.text,
          ...who, signal: context.signal });
        result = {
          outcome: clip(value?.outcome || (value?.ok ? 'ok' : 'refused'), 64),
          saved: value && own(value, 'saved') ? value.saved === true : value?.ok === true,
          verified: value?.verified === true, confirmed: value?.confirmed === true,
          filename: state.filename,
          ...(value?.saveStatus ? { saveStatus: clip(value.saveStatus, 64) } : {}),
          ...(value?.reason ? { reason: clip(value.reason, 160) } : !value?.ok ? { reason: 'save_refused' } : {}),
          ...(value?.savedDocumentId ? { savedDocumentId: clip(value.savedDocumentId, 256) } : {}),
          ...(safeInt(value?.savedDocumentRevision) ? { savedDocumentRevision: value.savedDocumentRevision } : {}),
        };
        break;
      }
      case 'document.draw': result = await drawPicture(input, who, context); break;
      case 'notes.list': result = await notesList(input, who, context); break;
      case 'notes.read': result = await notesRead(input, who, context); break;
      default: result = failure('operation_unknown', 'invalid');
    }
    const output = stamp(result || failure('operation_failed'));
    let finalOutput = output;
    if (bytes(JSON.stringify(output)) <= LIMITS.resultBytes) {
      if (resumed) remember(state.resume, who, { revision: state.revision });
      if (pendingInspection && !pendingInspection.row.inspectedBy.includes(pendingInspection.owner)) {
        pendingInspection.row.inspectedBy.push(pendingInspection.owner);
      }
    } else {
      for (const id of Object.keys(state.handles)) if (!beforeHandles.has(id)) delete state.handles[id];
      finalOutput = ['applied', 'rebased', 'unchanged'].includes(output.outcome) || output.saved
        ? stamp({ outcome: output.outcome, changeId: output.changeId || null,
            ...(output.transaction ? { transaction: output.transaction } : {}), ...(output.saved ? { saved: true, verified: output.verified === true } : {}),
            complete: false, omissions: [{ domain: 'receipt', reason: 'result_over_budget' }] })
        : stamp(failure('result_over_budget', 'refused', { complete: false }));
    }
    // Recorded for fresh invocations and settled continuations; a plain retry never reaches here.
    return finalize(finalOutput);
    } catch (error) {
      if (error?.name === 'AbortError' || context.signal?.aborted) return finalize(failure('cancelled'));
      if (error instanceof TypeError || error?.code === 'invalid_arguments') return finalize(failure(clip(error.message, 160), 'invalid'));
      throw error;
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

  return Object.freeze({ invoke, snapshot, reconcile, humanContext, setPolicy, decideReview, collaboration, previewReview, invocationJournal: invocationJournalEntries });
}
