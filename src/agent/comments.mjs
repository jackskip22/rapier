// SPDX-License-Identifier: AGPL-3.0-only
// Threads are ordinary ignored HTML comments in the exact Markdown source. There is no
// second durable owner, and neither a message nor a named recipient is an instruction.
import {markdownParser, markdownBodyOffset, documentAssets, parseAssets, projectImageDefinitions} from '../spec/md-assets.mjs';
import {markdownSourcePositions} from '../spec/md-source.mjs';
import {decodeDataImage} from '../images/assets.mjs';
import {_rapierDrawReadRecipeFromSVGText} from '../draw/core.mjs';
import {_rapierTransformSplices as transformSplices} from '../kit/ledger/journal-records.mjs';
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

export function validCommentTimestamp(value) {
  return value === null || Number.isSafeInteger(value) && value >= -62167219200000 && value <= 253402300799999;
}

export function validCommentDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zoneHour, zoneMinute] = match.map((part, index) => index ? Number(part) : part);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour <= 23 && minute <= 59 && second <= 59 &&
    (match[7] === undefined || zoneHour <= 14 && zoneMinute <= 59 && (zoneHour !== 14 || zoneMinute === 0));
}

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
  if (!exactKeys(data, ['body', 'threads'], ['notes']) || !text(data.body) || !Array.isArray(data.threads) ||
      data.notes !== undefined && !id(data.notes)) return false;
  const threadIds = new Set(), messageIds = new Set();
  return data.threads.every(thread => {
    if (!exactKeys(thread, ['id', 'anchor', 'resolved', 'messages']) || !id(thread.id) || threadIds.has(thread.id) ||
        !validAnchor(thread.anchor) || typeof thread.resolved !== 'boolean' || !Array.isArray(thread.messages) || !thread.messages.length) return false;
    threadIds.add(thread.id);
    const localMessageIds = new Set(thread.messages.map(message => message?.id));
    const validMessages = thread.messages.every((message, index) => {
      if (!exactKeys(message, ['id', 'text', 'author', 'createdAt'], ['recipient', 'date', 'replyTo']) || !id(message.id) || messageIds.has(message.id) ||
          !text(message.text) || !validCommentTimestamp(message.createdAt) ||
          message.date !== undefined && !validCommentDate(message.date) ||
          !exactKeys(message.author, ['kind', 'name']) ||
          !['human', 'agent', 'system'].includes(message.author.kind) || !text(message.author.name) ||
          (message.recipient !== undefined && !text(message.recipient)) || (message.replyTo !== undefined &&
            (!index || !id(message.replyTo) || message.replyTo === message.id || !localMessageIds.has(message.replyTo)))) return false;
      messageIds.add(message.id); return true;
    });
    if (!validMessages) return false;
    const parents = new Map(thread.messages.map(message => [message.id, message.replyTo])), finished = new Set();
    for (const message of thread.messages) {
      const seen = new Set(); let at = message.id;
      while (at !== undefined && !finished.has(at)) {
        if (seen.has(at)) return false;
        seen.add(at); at = parents.get(at);
      }
      for (const id of seen) finished.add(id);
    }
    return true;
  });
}

const noteLabels = (threads, prefix) => threads.map((_, index) => prefix + '-' + (index + 1));
const noteLiteral = value => String(value).replace(/[&<>\\`*{}[\]()!#+\-\r\n|~]/g,
  character => '&#' + character.charCodeAt(0) + ';');

function noteMessageSource(source) {
  if (!/\[\^|\^\[/.test(source)) return source;
  // Markdown footnotes do not nest. Preserve local note notation and detail as ordinary text
  // inside its owning review note, without changing code or raw HTML recognized by the parser.
  // A message is block content, so an opening YAML-looking block is not document frontmatter.
  const prefix = 'Review\n\n', positions = markdownSourcePositions(prefix + source, markdownParser());
  return source.replace(/\[\^|\^\[/g, (opening, at) => {
    if (positions.isText(prefix.length + at)) return opening;
    let before = at;
    while (before > 0 && source[before - 1] === '\\') before--;
    if ((at - before) % 2) return opening;
    return opening === '[^' ? '&#91;^' : '&#94;[';
  });
}

// Imported discussions have an ordinary Markdown projection for readers without threads.
// Its prefix is source data; its bytes are derived from this same record, never a second owner.
function commentNoteParts(threads, prefix, eol) {
  if (!threads.length) return [];
  const labels = noteLabels(threads, prefix);
  const definitions = threads.map((thread, index) => {
    const heading = 'Thread ' + noteLiteral(thread.id) + ' — ' + (thread.resolved ? 'Resolved' : 'Open');
    const discussion = thread.messages.map((message, index) => {
      const date = message.date ?? (message.createdAt === null ? '' : new Date(message.createdAt).toISOString());
      const metadata = [noteLiteral(message.id), noteLiteral(message.author.name), date,
        index ? 'Reply to ' + noteLiteral(message.replyTo || thread.messages[0].id) : '',
        message.recipient ? 'To ' + noteLiteral(message.recipient) : ''].filter(Boolean).join(' · ');
      return metadata + '\n\n' + noteMessageSource(message.text.replace(/\r\n?/g, '\n'));
    }).join('\n\n');
    return '[^' + labels[index] + ']: ' + (heading + '\n\n' + discussion).replace(/\n/g, eol + '    ');
  });
  return [labels.map(label => '[^' + label + ']').join(' '), ...definitions, '<!-- /md-comments notes -->'];
}

function commentNotes(threads, prefix, eol) {
  return commentNoteParts(threads, prefix, eol).map(part => eol + eol + part).join('');
}

// Match the writer's complete carrier before projecting its already-parsed editor blocks.
export function commentProjectionParts(raw) {
  const opening = /^(<!-- md-comments:v1 [^\r\n]*? -->)(?=\r|\n|$)/.exec(raw)?.[1];
  if (!opening) return null;
  let data;
  try { data = JSON.parse(opening.slice(MARKER.length, -4)); } catch { return null; }
  if (!validData(data)) return null;
  const eol = /^(?:\r\n|\n|\r)/.exec(raw.slice(opening.length))?.[0] || '\n';
  const parts = [opening, ...(data.notes ? commentNoteParts(data.threads, data.notes, eol) : [])];
  if (parts.join(eol + eol) !== raw) return null;
  return {parts, eol};
}

function commentsNotesPrefix(threads, body, requested) {
  if (!requested) return undefined;
  const occupied = body + JSON.stringify(threads);
  let prefix = typeof requested === 'string' ? requested : 'review';
  for (let counter = 1; occupied.toLowerCase().includes('[^' + prefix.toLowerCase() + '-'); counter++) prefix = 'review' + counter;
  return prefix;
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
  if (data.notes) {
    const eol = /^(?:\r\n|\n|\r)/.exec(source.slice(record.end))?.[0] || '\n';
    const projection = commentNotes(data.threads, data.notes, eol);
    if (!source.startsWith(projection, record.end)) return result({...empty, reason: 'comments_notes_changed'});
    record.end += projection.length;
    record.raw += projection;
  }
  const body = source.slice(0, record.start) + source.slice(record.end);
  return result({record, threads: data.threads, body, current: verifyBody && data.body === commentDigest(body),
    ...(data.notes ? {notes: data.notes, noteLabels: noteLabels(data.threads, data.notes)} : {})});
}

function remember(source, parsed, context = grammar.get(parsed)) {
  for (const thread of parsed.threads) {
    Object.freeze(thread.anchor);
    for (const message of thread.messages) { Object.freeze(message.author); Object.freeze(message); }
    Object.freeze(thread.messages); Object.freeze(thread);
  }
  Object.freeze(parsed.threads);
  if (parsed.noteLabels) Object.freeze(parsed.noteLabels);
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

export function serializeComments(threads, body, {notes, eol = /\r\n|\n|\r/.exec(body)?.[0] || '\n'} = {}) {
  const prefix = commentsNotesPrefix(threads, body, notes);
  const data = {body: commentDigest(body), threads, ...(prefix ? {notes: prefix} : {})};
  // The writer admits exactly the format the reader accepts. Existing records take the same
  // gate as a newly appended one; a bad recipient or display name cannot poison earlier work.
  if (!validData(data)) throw new TypeError('comments_data_invalid');
  const json = JSON.stringify(data).replace(/"(?:[^"\\]|\\.)*"/g, value => value.replace(/[<>&-]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')));
  return MARKER + json + ' -->' + (prefix ? commentNotes(threads, prefix, eol) : '');
}

export function writeComments(source, threads, parsed = parseComments(source), {notes = parsed.notes} = {}) {
  if (parsed.reason) throw new TypeError(parsed.reason);
  if (parsed.record) return {pos: parsed.record.start, removed: parsed.record.raw, inserted: serializeComments(threads, parsed.body, {notes})};
  const eol = /\r\n|\n|\r/.exec(source)?.[0] || '\n';
  const prefix = !source || /(?:\r\n|\n|\r){2}$/.test(source) ? '' : /[\r\n]$/.test(source) ? eol : eol + eol;
  const body = source + prefix + eol;
  const inserted = prefix + serializeComments(threads, body, {notes, eol}) + eol;
  const next = parseComments(source + inserted);
  if (!next.record || next.reason) throw new TypeError('comments_appendix_unavailable');
  return {pos: source.length, removed: '', inserted};
}

function transport(anchor, row) {
  // A deleted drawing object retains its exact image occurrence. Move that locator
  // without reviving the object, so later prose does not invalidate a proved Undo.
  if (anchor.kind === 'document' || anchor.status !== 'attached' &&
      !(anchor.kind === 'drawing' && anchor.reason === 'object_missing')) return anchor;
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
    const notes = commentsNotesPrefix(threads, next.body, next.notes);
    remember(final, {...next, current: true, threads, ...(notes ? {notes, noteLabels: noteLabels(threads, notes)} : {}),
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

const semanticThread = thread => thread ? JSON.stringify({id: thread.id, resolved: thread.resolved, messages: thread.messages}) : null;
const anchorValue = anchor => JSON.stringify(['kind', 'status', 'start', 'end', 'exact', 'quote', 'objectId', 'reason'].map(key => anchor[key] ?? null));

export function commentChanges(beforeSource, afterSource) {
  const before = parseComments(beforeSource), after = parseComments(afterSource);
  if (before.reason || after.reason) return null;
  const ids = new Set([...before.threads, ...after.threads].map(thread => thread.id));
  return [...ids].filter(id => semanticThread(before.threads.find(thread => thread.id === id)) !==
    semanticThread(after.threads.find(thread => thread.id === id)));
}

function commentEnvelope(source, parsed) {
  if (!parsed.record) return null;
  let start = parsed.record.start, end = parsed.record.end;
  while (start && /[\r\n]/.test(source[start - 1])) start--;
  while (end < source.length && /[\r\n]/.test(source[end])) end++;
  return {start, end, text: source.slice(start, end)};
}

function bodyDelta(before, after) {
  let start = 0, a = before.length, b = after.length;
  const boundary = (text, at) => !(at > 0 && at < text.length &&
    (text.charCodeAt(at - 1) & 0xFC00) === 0xD800 && (text.charCodeAt(at) & 0xFC00) === 0xDC00);
  while (start < a && start < b && before[start] === after[start]) start++;
  if (!boundary(before, start) || !boundary(after, start)) start--;
  while (a > start && b > start && before[a - 1] === after[b - 1]) {a--; b--;}
  if (!boundary(before, a) || !boundary(after, b)) {a++; b++;}
  return {pos: start, removed: before.slice(start, a), inserted: after.slice(start, b)};
}

// A coarse source replacement can contain prose and a whole discussion. Split its
// exact forward bytes so the history owner can select prose independently of the footer.
export function commentSpliceParts(source, splice) {
  const next = transformSplices(source, [splice]);
  if (next == null || !commentChanges(source, next)?.length) return [splice];
  const before = commentEnvelope(source, parseComments(source)), after = commentEnvelope(next, parseComments(next));
  const body = before ? source.slice(0, before.start) + source.slice(before.end) : source;
  const target = after ? next.slice(0, after.start) + next.slice(after.end) : next;
  const changed = bodyDelta(body, target);
  return [...(before ? [{pos: before.start, removed: before.text, inserted: ''}] : []),
    ...(changed.removed || changed.inserted ? [changed] : []),
    ...(after ? [{pos: after.start, removed: '', inserted: after.text}] : [])];
}

// Project exact source rows onto the body without assigning serialized footer bytes to an
// anchor. Whole-record insertion/removal may also carry authored separating newlines.
function bodyTransport(source, anchor, splices) {
  for (const row of splices) {
    const parsed = parseComments(source), next = transformSplices(source, [row]);
    if (next == null || parsed.reason) return null;
    const following = parseComments(next);
    if (following.reason) return null;
    const record = parsed.record, end = row.pos + row.removed.length;
    let bodyRow;
    if (record && row.pos >= record.start && end <= record.end && following.record) {
      if (parsed.body !== following.body) return null;
    } else if ((!record || end <= record.start || row.pos >= record.end) &&
        !!record === !!following.record) {
      bodyRow = {...row, pos: row.pos - (record && row.pos >= record.end ? record.raw.length : 0)};
    } else {
      bodyRow = bodyDelta(parsed.body, following.body);
    }
    if (bodyRow) anchor = transport(anchor, bodyRow);
    source = next;
  }
  return {source, anchor};
}

// Reverse semantic discussion ownership, including acts that restored an earlier inverse.
// The current wrapper, other threads and later discussion always remain with their authors.
export function commentUndoSplice(source, change, later = []) {
  const {beforeSource, afterSource, entry} = change;
  const before = parseComments(beforeSource), after = parseComments(afterSource), current = parseComments(source);
  const changed = commentChanges(beforeSource, afterSource);
  if (!changed?.length || current.reason) return null;
  const threads = commentThreads(source, current);
  for (const id of changed) {
    const prior = before.threads.find(thread => thread.id === id), authored = after.threads.find(thread => thread.id === id);
    const live = threads.find(thread => thread.id === id);
    if (semanticThread(live) !== semanticThread(authored)) return null;
    let positioned = authored ? {source: afterSource, anchor: authored.anchor} : bodyTransport(beforeSource, prior.anchor, entry.splices);
    for (const row of later) {
      const previousSource = positioned?.source;
      positioned = positioned && bodyTransport(positioned.source, positioned.anchor, row.splices);
      if (!positioned) return null;
      if (row.id && !change.selectedIds.has(row.id)) {
        if (commentChanges(previousSource, positioned.source)?.includes(id)) return null;
        const parsed = parseComments(positioned.source), actual = parsed.threads.find(thread => thread.id === id)?.anchor;
        if (positioned.anchor.status === 'attached' && !objectPresent(positioned.source, positioned.anchor, parsed))
          positioned.anchor = {...positioned.anchor, status: 'stale', reason: 'object_missing'};
        if (actual && anchorValue(actual) !== anchorValue(positioned.anchor)) return null;
      }
    }
    if (!positioned || positioned.source !== source) return null;
    let expectedAnchor = positioned.anchor;
    if (expectedAnchor.status === 'attached' && !objectPresent(source, expectedAnchor, current))
      expectedAnchor = {...expectedAnchor, status: 'stale', reason: 'object_missing'};
    if (live && anchorValue(live.anchor) !== anchorValue(expectedAnchor)) return null;
    const index = threads.findIndex(thread => thread.id === id);
    if (!prior) threads.splice(index, 1);
    else if (live) threads[index] = {...live, resolved: prior.resolved, messages: prior.messages.slice()};
    else {
      const following = before.threads.slice(before.threads.indexOf(prior) + 1).find(thread => threads.some(live => live.id === thread.id));
      const index = following ? threads.findIndex(thread => thread.id === following.id) : threads.length;
      threads.splice(index, 0, {...prior, anchor: expectedAnchor, messages: prior.messages.slice()});
    }
  }
  if (!current.record && before.record) {
    const envelope = commentEnvelope(beforeSource, before);
    let position = bodyTransport(beforeSource, {kind: 'text', status: 'attached', start: envelope.start, end: envelope.start}, entry.splices);
    for (const row of later) position = position && bodyTransport(position.source, position.anchor, row.splices);
    if (!position || position.source !== source || position.anchor.status !== 'attached') return null;
    const at = position.anchor.start, prefix = beforeSource.slice(envelope.start, before.record.start), suffix = beforeSource.slice(before.record.end, envelope.end);
    const body = source.slice(0, at) + prefix + suffix + source.slice(at);
    const eol = /\r\n|\n|\r/.exec(envelope.text)?.[0] || '\n';
    const raw = body === before.body && JSON.stringify(threads) === JSON.stringify(before.threads)
      ? before.record.raw : serializeComments(threads, body, {notes: before.notes, eol});
    return {pos: at, removed: '', inserted: prefix + raw + suffix};
  }
  if (!before.record && !threads.length && current.record) {
    const envelope = commentEnvelope(afterSource, after);
    const prefix = afterSource.slice(envelope.start, after.record.start), suffix = afterSource.slice(after.record.end, envelope.end);
    const start = current.record.start - prefix.length, end = current.record.end + suffix.length;
    return start >= 0 && source.slice(start, current.record.start) === prefix && source.slice(current.record.end, end) === suffix
      ? {pos: start, removed: source.slice(start, end), inserted: ''}
      : {pos: current.record.start, removed: current.record.raw, inserted: ''};
  }
  return writeComments(source, threads, current);
}

// A canonical inverse can restore a removed drawing object. Prove its original derived
// transition and every later anchor before restoring attachment; replies remain untouched.
export function commentRestoreSplice(source, change, later, inverseSplices) {
  const {beforeSource, afterSource, entry} = change, index = entry.derivedCommentIndex;
  if (index == null || !later) return null;
  const before = parseComments(beforeSource), after = parseComments(afterSource), current = parseComments(source);
  if (!before.current || !after.current || !current.current || current.reason) return null;
  const derived = commentSplices(beforeSource, entry.splices.slice(0, index))[0];
  if (!derived || ['pos', 'removed', 'inserted'].some(key => derived[key] !== entry.splices[index][key])) return null;
  const threads = commentThreads(source, current);
  let changed = false;
  for (const original of before.threads) {
    const removed = after.threads.find(thread => thread.id === original.id), live = threads.find(thread => thread.id === original.id);
    if (original.anchor.kind !== 'drawing' || original.anchor.status !== 'attached' ||
        removed?.anchor.reason !== 'object_missing' || live?.anchor.status !== 'stale') continue;
    let candidate = bodyTransport(beforeSource, original.anchor, entry.splices), observed = removed.anchor, valid = !!candidate;
    for (const row of later) {
      const next = candidate && bodyTransport(candidate.source, candidate.anchor, row.splices);
      const expected = candidate && bodyTransport(candidate.source, observed, row.splices);
      if (!next || !expected) {valid = false; break;}
      const parsed = parseComments(next.source), actual = parsed.threads.find(thread => thread.id === original.id)?.anchor;
      if (!actual || anchorValue(actual) !== anchorValue(expected.anchor) ||
          next.anchor.status !== 'attached' || objectPresent(next.source, next.anchor, parsed)) {valid = false; break;}
      candidate = next; observed = actual;
    }
    const expected = valid && bodyTransport(candidate.source, observed, inverseSplices);
    candidate = valid && bodyTransport(candidate.source, candidate.anchor, inverseSplices);
    if (!candidate || candidate.source !== source || candidate.anchor.status !== 'attached' ||
        !expected || anchorValue(live.anchor) !== anchorValue(expected.anchor) ||
        commentDigest(current.body.slice(candidate.anchor.start, candidate.anchor.end)) !== candidate.anchor.exact ||
        !objectPresent(source, candidate.anchor, current)) continue;
    live.anchor = candidate.anchor; changed = true;
  }
  return changed ? writeComments(source, threads, current) : null;
}
