// SPDX-License-Identifier: AGPL-3.0-only
// Threads are ordinary ignored HTML comments in the exact Markdown source. There is no
// second durable owner, and neither a message nor a named recipient is an instruction.
import {markdownParser, markdownBodyOffset, documentAssets, parseAssets, projectImageDefinitions} from '../spec/md-assets.mjs';
import {decodeDataImage} from '../images/assets.mjs';
import {_rapierDrawReadRecipeFromSVGText} from '../draw/core.mjs';
import {_rapierTransformSplices as transformSplices} from '../editor/journal-records.mjs';
import {createCommentDraftStore} from './comment-drafts.mjs';
export {createCommentDraftStore};

const MARKER = '<!-- md-comments:v1 ';
const int = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => plain(value) && required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const id = value => typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
const text = value => typeof value === 'string' && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(value);
let memo = null;
const grammar = new WeakMap();

export function commentDigest(value) {
  let fnv = 0x811c9dc5, a = 1, b = 0;
  // Reduce the Adler sums per safe numeric chunk, not per source unit. Image appendices are
  // source too; two divisions on every byte would make ordinary typing wait on their size.
  for (let offset = 0; offset < value.length; offset += 4096) {
    const end = Math.min(value.length, offset + 4096);
    for (let index = offset; index < end; index++) {
      const code = value.charCodeAt(index);
      fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a;
    }
    a %= 65521; b %= 65521;
  }
  return `${value.length}:${fnv >>> 0}:${((b << 16) | a) >>> 0}`;
}

function validAnchor(anchor) {
  if (!exactKeys(anchor, ['kind', 'status'], ['start', 'end', 'exact', 'quote', 'objectId', 'reason'])) return false;
  if (!['document', 'text', 'image', 'drawing'].includes(anchor.kind) || !['attached', 'stale'].includes(anchor.status)) return false;
  if (anchor.kind !== 'document' && (!int(anchor.start) || !int(anchor.end) || anchor.end < anchor.start || !text(anchor.exact) || !text(anchor.quote))) return false;
  return (anchor.objectId === undefined || anchor.kind === 'drawing' && id(anchor.objectId)) &&
    (anchor.reason === undefined || text(anchor.reason));
}

function validData(data) {
  if (!exactKeys(data, ['body', 'threads']) || !text(data.body) || !Array.isArray(data.threads)) return false;
  const threadIds = new Set(), messageIds = new Set();
  return data.threads.every(thread => {
    if (!exactKeys(thread, ['id', 'anchor', 'resolved', 'messages']) || !id(thread.id) || threadIds.has(thread.id) ||
        !validAnchor(thread.anchor) || typeof thread.resolved !== 'boolean' || !Array.isArray(thread.messages) || !thread.messages.length) return false;
    threadIds.add(thread.id);
    return thread.messages.every(message => {
      if (!exactKeys(message, ['id', 'text', 'author', 'createdAt'], ['recipient']) || !id(message.id) || messageIds.has(message.id) ||
          !text(message.text) || !int(message.createdAt) || !exactKeys(message.author, ['kind', 'name']) ||
          !['human', 'agent', 'system'].includes(message.author.kind) || !text(message.author.name) ||
          (message.recipient !== undefined && !text(message.recipient))) return false;
      messageIds.add(message.id); return true;
    });
  });
}

// Block recognition belongs to the Markdown parser. A pasted code example, frontmatter or
// inline literal that happens to spell this marker is never a document thread record.
function scanComments(source, verifyBody = true, definitions) {
  const empty = {record: null, threads: [], body: source, current: true};
  if (!source.includes('md-comments:')) return empty;
  if (!definitions) {
    try { definitions = documentAssets(source).blocks; } catch (_) { definitions = []; }
  }
  const offset = markdownBodyOffset(source);
  // Earlier edits can move an unchanged old definition into frontmatter. Never shorten bytes
  // before the current body's absolute offset, which is also the parser's source-map origin.
  definitions = definitions.filter(row => row.start >= offset);
  const projected = projectImageDefinitions(source, {blocks: definitions, references: {}});
  const starts = [offset], tokens = [], env = {};
  const lines = /\r\n?|\n/g;
  lines.lastIndex = offset;
  while (lines.exec(source)) starts.push(lines.lastIndex);
  const parser = markdownParser();
  parser.block.parse(projected.source.slice(offset).replace(/\r\n?/g, '\n'), parser, env, tokens);
  const records = [], blocks = [], references = Object.assign(Object.create(null), env.references);
  const known = new Map(definitions.map(row => [row.start, row]));
  for (const token of tokens) {
    if (token.type === 'reference_definition' && token.map) {
      const start = starts[token.map[0]], stop = starts[token.map[1]] ?? source.length;
      let end = stop;
      if (source[end - 1] === '\n') end--;
      if (source[end - 1] === '\r') end--;
      const previous = known.get(start), definition = token.meta.mdImageDefinition;
      const projectedURL = previous?.payloadStart != null
        ? previous.url.slice(0, previous.payloadStart - previous.urlStart) + 'AA==' : previous?.url;
      if (previous?.end === end && previous.id === token.meta.label && definition?.href === projectedURL) {
        blocks.push({...previous, topLevel: token.level === 0});
        if (env.references?.[previous.id] === definition) references[previous.id] = {...definition, href: previous.url};
      } else {
        // Changed definitions use the same image grammar on their actual current bytes.
        for (const row of parseAssets(source.slice(start, end)).blocks) {
          const moved = {...row, start: row.start + start, end: row.end + start};
          for (const key of ['urlStart', 'urlEnd', 'payloadStart', 'payloadEnd']) if (row[key] != null) moved[key] += start;
          blocks.push(moved);
        }
      }
    }
    if (token.type !== 'html_block' || token.level !== 0 || !token.map) continue;
    const start = starts[token.map[0]], stop = starts[token.map[1]] ?? source.length;
    const raw = source.slice(start, stop), match = /^(<!-- md-comments:[^\r\n]*? -->)(?:\r\n|\n|\r)?$/.exec(raw);
    if (!match) continue;
    records.push({start, end: start + match[1].length, raw: match[1]});
  }
  const result = value => { grammar.set(value, {blocks, references}); return value; };
  if (!records.length) return result(empty);
  if (records.length !== 1) return result({...empty, reason: 'comments_ambiguous'});
  const record = records[0];
  if (!record.raw.startsWith(MARKER)) return result({...empty, reason: 'comments_format_unknown'});
  let data;
  try { data = JSON.parse(record.raw.slice(MARKER.length, -4)); } catch { return result({...empty, reason: 'comments_malformed'}); }
  if (!validData(data)) return result({...empty, reason: 'comments_malformed'});
  const body = source.slice(0, record.start) + source.slice(record.end);
  return result({record, threads: data.threads, body, current: verifyBody && data.body === commentDigest(body)});
}

function remember(source, parsed, context = grammar.get(parsed)) {
  for (const thread of parsed.threads) {
    Object.freeze(thread.anchor);
    for (const message of thread.messages) { Object.freeze(message.author); Object.freeze(message); }
    Object.freeze(thread.messages); Object.freeze(thread);
  }
  Object.freeze(parsed.threads);
  if (parsed.record) Object.freeze(parsed.record);
  if (context) grammar.set(parsed, context);
  memo = {source, parsed: Object.freeze(parsed)};
  return memo.parsed;
}

// An immutable source-derived memo avoids repeatedly parsing binary image appendices while a
// tool and the editor inspect one revision. The source record remains the only durable owner.
export function parseComments(source) {
  return memo?.source === source ? memo.parsed : remember(source, scanComments(source));
}

export function commentSourceRange(anchor, parsed) {
  if (anchor.kind === 'document' || anchor.status !== 'attached') return null;
  const at = (value, start) => parsed.record && (value > parsed.record.start || start && value === parsed.record.start) ? value + parsed.record.raw.length : value;
  return {start: at(anchor.start, true), end: at(anchor.end, false)};
}

export function commentAnchor(kind, start, end, source, parsed, objectId) {
  if (kind === 'document') return {kind, status: 'attached'};
  const record = parsed.record;
  if (!int(start) || !int(end) || end <= start || end > source.length ||
      record && start < record.end && record.start < end) throw new TypeError('comment_anchor_invalid');
  const at = value => record && value >= record.end ? value - record.raw.length : value;
  const selected = source.slice(start, end);
  return {kind, status: 'attached', start: at(start), end: at(end), exact: commentDigest(selected),
    quote: Array.from(selected).slice(0, 256).join(''), ...(objectId ? {objectId} : {})};
}

function objectPresent(source, anchor, parsed) {
  if (anchor.kind !== 'drawing' && anchor.kind !== 'image') return true;
  const range = commentSourceRange(anchor, parsed), occurrence = source.slice(range.start, range.end);
  const parser = markdownParser(), assets = grammar.get(parsed) || (memo?.source === source && grammar.get(memo.parsed)) || documentAssets(source), tokens = [];
  parser.inline.parse(occurrence, parser, {references: assets.references}, tokens);
  if (tokens.length !== 1 || tokens[0].type !== 'image' || tokens[0].meta?.mdImage?.source !== occurrence) return false;
  if (anchor.kind === 'image') return true;
  const url = tokens[0].attrGet('src');
  if (!/^data:image\/svg\+xml;base64,/i.test(url || '')) return false;
  let recipe;
  try { recipe = _rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(decodeDataImage(url))); } catch { return false; }
  return !!recipe && (!anchor.objectId || recipe.shapes.some(shape => shape.id === anchor.objectId));
}

export function imageCommentTarget(source, start, end) {
  try {
    const parsed = parseComments(source), anchor = commentAnchor('image', start, end, source, parsed);
    return objectPresent(source, anchor, parsed);
  } catch (_) { return false; }
}

export function commentThreads(source, parsed = parseComments(source)) {
  return parsed.threads.map(thread => {
    let anchor = {...thread.anchor};
    if (anchor.kind !== 'document' && anchor.status === 'attached') {
      const reason = !parsed.current ? 'source_changed_without_history' :
        commentDigest(parsed.body.slice(anchor.start, anchor.end)) !== anchor.exact ? 'target_changed' :
          !objectPresent(source, anchor, parsed) ? 'object_missing' : '';
      if (reason) anchor = {...anchor, status: 'stale', reason};
    }
    return {...thread, anchor, messages: thread.messages.slice()};
  });
}

export function serializeComments(threads, body) {
  const data = {body: commentDigest(body), threads};
  // The writer admits exactly the format the reader accepts. Existing records take the same
  // gate as a newly appended one; a bad recipient or display name cannot poison earlier work.
  if (!validData(data)) throw new TypeError('comments_data_invalid');
  const json = JSON.stringify(data).replace(/[<>&-]/g,
    value => '\\u' + value.charCodeAt(0).toString(16).padStart(4, '0'));
  return MARKER + json + ' -->';
}

export function writeComments(source, threads, parsed = parseComments(source)) {
  if (parsed.reason) throw new TypeError(parsed.reason);
  if (parsed.record) return {pos: parsed.record.start, removed: parsed.record.raw, inserted: serializeComments(threads, parsed.body)};
  const eol = /\r\n|\n|\r/.exec(source)?.[0] || '\n';
  const prefix = !source || /(?:\r\n|\n|\r){2}$/.test(source) ? '' : /[\r\n]$/.test(source) ? eol : eol + eol;
  const body = source + prefix + eol;
  const inserted = prefix + serializeComments(threads, body) + eol;
  const next = parseComments(source + inserted);
  if (!next.record || next.reason) throw new TypeError('comments_appendix_unavailable');
  return {pos: source.length, removed: '', inserted};
}

function transport(anchor, row) {
  if (anchor.status !== 'attached' || anchor.kind === 'document') return anchor;
  const end = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
  if (end <= anchor.start) return {...anchor, start: anchor.start + delta, end: anchor.end + delta};
  if (row.pos >= anchor.end) return anchor;
  // Drawing edits replace precisely their image occurrence. Preserve the located object only
  // at that same occurrence, and validate its stable id in the resulting recipe below.
  if (anchor.kind === 'drawing' && row.pos === anchor.start && end === anchor.end && row.inserted) {
    return {...anchor, end: anchor.start + row.inserted.length, exact: commentDigest(row.inserted),
      quote: Array.from(row.inserted).slice(0, 256).join('')};
  }
  return {...anchor, status: 'stale', reason: row.inserted ? 'target_changed' : 'target_deleted'};
}

// A cache is proof only while the entire parser-recognized definition is byte-identical.
// Touching any part (including its delimiters) removes it from the compact parse path.
function carryDefinitions(source, blocks, splices) {
  return blocks.flatMap(block => {
    let {start, end} = block;
    for (const row of splices) {
      const stop = row.pos + row.removed.length;
      if (row.pos <= end && stop >= start) return [];
      if (stop < start) { start += row.inserted.length - row.removed.length; end += row.inserted.length - row.removed.length; }
    }
    if (source.slice(start, end) !== block.source) return [];
    const moved = {...block, start, end};
    for (const key of ['urlStart', 'urlEnd', 'payloadStart', 'payloadEnd']) if (block[key] != null) moved[key] += start - block.start;
    return [moved];
  });
}

// Derived rows join the user's existing transaction, including Undo. If the user edits a
// record itself, preserve those bytes verbatim; unknown formats are never repaired or erased.
export function commentSplices(before, splices) {
  if (!before.includes(MARKER)) return [];
  const parsed = parseComments(before);
  if (!parsed.record || parsed.reason) return [];
  let position = parsed.record.start, end = parsed.record.end;
  const bodyRows = [];
  for (const row of splices) {
    const stop = row.pos + row.removed.length;
    if (row.pos < end && stop > position || row.pos > position && row.pos < end) return [];
    bodyRows.push({...row, pos: row.pos >= end ? row.pos - parsed.record.raw.length : row.pos});
    if (stop <= position) { position += row.inserted.length - row.removed.length; end += row.inserted.length - row.removed.length; }
  }
  const after = transformSplices(before, splices);
  if (after == null) return [];
  const next = scanComments(after, false, carryDefinitions(after, grammar.get(parsed)?.blocks || [], splices));
  if (!next.record || next.reason || next.record.start !== position || next.record.raw !== parsed.record.raw) return [];
  const threads = commentThreads(before, parsed).map(thread => ({...thread,
    anchor: bodyRows.reduce(transport, thread.anchor)}));
  for (const thread of threads) if (thread.anchor.status === 'attached' && !objectPresent(after, thread.anchor, next)) {
    thread.anchor = {...thread.anchor, status: 'stale', reason: 'object_missing'};
  }
  const row = writeComments(after, threads, next);
  if (row.inserted !== row.removed) {
    const final = after.slice(0, row.pos) + row.inserted + after.slice(row.pos + row.removed.length);
    const context = grammar.get(next);
    remember(final, {...next, current: true, threads,
      record: {...next.record, raw: row.inserted, end: row.pos + row.inserted.length}},
      context && {...context, blocks: carryDefinitions(final, context.blocks, [row])});
  }
  return row.inserted === row.removed ? [] : [row];
}

export function commentSummary(source) {
  const parsed = parseComments(source), threads = commentThreads(source, parsed);
  return {total: threads.length, open: threads.filter(thread => !thread.resolved).length,
    stale: threads.filter(thread => thread.anchor.status === 'stale').length, ...(parsed.reason ? {reason: parsed.reason} : {})};
}

// Selective Undo of a comment is semantic only after the exact source inverse has conflicted.
// Independent prose may have updated the footer's digest. A newer reply or resolution on this
// thread is authored work, so it refuses instead of removing somebody else's discussion.
export function commentUndoSplice(source, entry, later = []) {
  if (entry.operation !== 'document.comment' || entry.splices.length !== 1) return null;
  const row = entry.splices[0], before = parseComments(row.removed), after = parseComments(row.inserted), current = parseComments(source);
  if (before.reason || after.reason || current.reason || !after.record || !current.record) return null;
  const semantic = thread => thread ? JSON.stringify({id: thread.id, resolved: thread.resolved, messages: thread.messages}) : null;
  const beforeById = new Map(before.threads.map(thread => [thread.id, thread]));
  const changed = after.threads.filter(thread => semantic(thread) !== semantic(beforeById.get(thread.id)));
  if (changed.length !== 1 || before.threads.some(thread => !after.threads.some(row => row.id === thread.id))) return null;
  const authored = changed[0], live = current.threads.find(thread => thread.id === authored.id);
  if (semantic(live) !== semantic(authored)) return null;
  let expectedAnchor = authored.anchor, recordStart = row.pos + after.record.start, recordEnd = recordStart + after.record.raw.length;
  for (const change of later) for (const splice of change.splices) {
    const stop = splice.pos + splice.removed.length, delta = splice.inserted.length - splice.removed.length;
    if (splice.pos >= recordStart && stop <= recordEnd && (splice.removed.length || splice.pos > recordStart && splice.pos < recordEnd)) {
      recordEnd += delta; continue;
    }
    if (splice.pos < recordEnd && stop > recordStart) return null;
    expectedAnchor = transport(expectedAnchor, {...splice, pos: splice.pos >= recordEnd ? splice.pos - (recordEnd - recordStart) : splice.pos});
    if (stop <= recordStart) { recordStart += delta; recordEnd += delta; }
  }
  if (expectedAnchor.status === 'attached' && !objectPresent(source, expectedAnchor, current)) expectedAnchor = {...expectedAnchor, status: 'stale', reason: 'object_missing'};
  const anchorValue = anchor => JSON.stringify(['kind', 'status', 'start', 'end', 'exact', 'quote', 'objectId', 'reason'].map(key => anchor[key] ?? null));
  if (anchorValue(live.anchor) !== anchorValue(expectedAnchor)) return null;
  const prior = beforeById.get(authored.id), threads = commentThreads(source, current).flatMap(thread => thread.id !== authored.id ? [thread]
    : prior ? [{...thread, resolved: prior.resolved, messages: prior.messages.slice()}] : []);
  if (!before.record && !threads.length) {
    const prefix = row.inserted.slice(0, after.record.start), suffix = row.inserted.slice(after.record.end);
    const start = current.record.start - prefix.length, end = current.record.end + suffix.length;
    return start >= 0 && source.slice(start, current.record.start) === prefix && source.slice(current.record.end, end) === suffix
      ? {pos: start, removed: source.slice(start, end), inserted: ''}
      : {pos: current.record.start, removed: current.record.raw, inserted: ''};
  }
  return writeComments(source, threads, current);
}
