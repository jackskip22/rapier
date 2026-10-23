// SPDX-License-Identifier: AGPL-3.0-only
import {markdownParser, markdownBodyOffset, documentAssets, parseAssets, projectImageDefinitions, eachBlockWindow} from '../spec/md-assets.mjs';
import {decodeDataImage} from '../images/assets.mjs';
import {_rapierDrawReadRecipeFromSVGText} from '../draw/core.mjs';
import {_rapierTransformSplices as transformSplices} from '../kit/ledger/journal-records.mjs';
import {createCommentDraftStore} from './comment-drafts.mjs';
import {commentBodyDigest, createCommentText, createCommentBlocks} from './comment-index.mjs';
export {createCommentDraftStore};

const MARKER = '<!-- md-comments:v1 ';
const int = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => plain(value) && required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const id = value => typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
const text = value => typeof value === 'string' && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(value);
const memos = [], MEMOS = 3;
const remembered = source => memos.find(row => row.source === source)?.parsed;
const grammar = new WeakMap();
const sources = new WeakMap();
const revisions = new WeakMap();

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

export function commentProjectionParts(raw) {
  const opening = /^(<!-- md-comments:v1 [^\r\n]*? -->)(?=\r|\n|$)/.exec(raw)?.[1];
  if (!opening) return null;
  let data;
  try { data = JSON.parse(opening.slice(MARKER.length, -4)); } catch { return null; }
  if (!validData(data)) return null;
  if (opening !== raw) return null;
  return {parts: [opening]};
}

function scanComments(source, verifyBody = true, definitions, scopeOffset) {
  const empty = {record: null, threads: [], body: source, current: true};
  if (scopeOffset === undefined && !source.includes('md-comments:')) return empty;
  if (!definitions) {
    try { definitions = documentAssets(source).blocks; } catch (_) { definitions = []; }
  }
  const offset = scopeOffset ?? markdownBodyOffset(source);
  definitions = definitions.filter(row => row.start >= offset);
  const projected = projectImageDefinitions(source, {blocks: definitions, references: {}});
  const payloadEnds = [], payloadUnits = [];
  for (const row of projected.records) { payloadEnds.push(row.end); payloadUnits.push((payloadUnits.at(-1) || 0) + row.payload.length - 4); }
  const sourceOffset = at => {
    let low = 0, high = payloadEnds.length;
    while (low < high) { const mid = (low + high) >>> 1; if (payloadEnds[mid] <= at) low = mid + 1; else high = mid; }
    return low ? at + payloadUnits[low - 1] : at;
  };
  const parser = markdownParser(), env = {};
  const records = [], blocks = [], referenceRows = [], regions = [], firstDefinitions = [];
  const known = new Map(definitions.map(row => [row.start, row]));
  eachBlockWindow(projected.source, offset, parser, env, ({tokens, lineStart}) => {
    const lineOffset = line => { const at = lineStart(line); return at === undefined ? source.length : sourceOffset(at); };
    for (const token of tokens) {
      const isDefinition = token.type === 'reference_definition';
      if (!token.map || !isDefinition && token.level !== 0) continue;
      const start = lineOffset(token.map[0]), stop = lineOffset(token.map[1]);
      if (isDefinition) {
        let end = stop;
        if (source[end - 1] === '\n') end--;
        if (source[end - 1] === '\r') end--;
        const previous = known.get(start), definition = token.meta.mdImageDefinition;
        let exactReference = definition;
        const projectedURL = previous?.payloadStart != null
          ? previous.url.slice(0, previous.payloadStart - previous.urlStart) + 'AA==' : previous?.url;
        if (previous?.end === end && previous.id === token.meta.label && definition?.href === projectedURL) {
          blocks.push({...previous, topLevel: token.level === 0});
          exactReference = {...definition, href: previous.url};
          if (env.references?.[previous.id] === definition) firstDefinitions.push([previous.id, exactReference]);
        } else {
          for (const row of parseAssets(source.slice(start, end)).blocks) {
            const moved = {...row, start: row.start + start, end: row.end + start};
            for (const key of ['urlStart', 'urlEnd', 'payloadStart', 'payloadEnd']) if (row[key] != null) moved[key] += start;
            blocks.push(moved);
          }
        }
        referenceRows.push({start, label: token.meta.label, definition: exactReference});
      }
      if (token.level !== 0) continue;
      if (token.map[1] > token.map[0]) regions.push({start, stop, type: token.type});
      const match = token.type === 'html_block' && /^(<!-- md-comments:[^\r\n]*? -->)(?:\r\n|\n|\r)?$/.exec(source.slice(start, stop));
      if (match) records.push({start, end: start + match[1].length, raw: match[1]});
    }
  }, true);
  const references = Object.assign(Object.create(null), env.references);
  for (const [label, definition] of firstDefinitions) references[label] = {...definition};
  if (!regions.length || regions[0].start > 0) regions.unshift({start: 0, stop: offset, type: 'trivia'});
  let recordAt = 0, rowAt = 0;
  const scopes = regions.map((region, index) => {
    const next = regions[index + 1]?.start ?? source.length, defined = [];
    while (recordAt < records.length && records[recordAt].start < region.start) recordAt++;
    for (; rowAt < referenceRows.length && referenceRows[rowAt].start < next; rowAt++)
      if (referenceRows[rowAt].start >= region.start) defined.push([referenceRows[rowAt].label, referenceRows[rowAt].definition]);
    return {length: next - region.start, parsedLength: region.stop - region.start, type: region.type,
      record: records[recordAt]?.start === region.start ? records[recordAt].raw : null, references: defined};
  });
  const result = value => { grammar.set(value, {blocks, references, scopes, offset}); return value; };
  if (!records.length) return result(empty);
  if (records.length !== 1) return result({...empty, reason: 'comments_ambiguous'});
  const record = records[0];
  if (!record.raw.startsWith(MARKER)) return result({...empty, reason: 'comments_format_unknown'});
  let data;
  try { data = JSON.parse(record.raw.slice(MARKER.length, -4)); } catch { return result({...empty, reason: 'comments_malformed'}); }
  if (!validData(data)) return result({...empty, reason: 'comments_malformed'});
  const body = source.slice(0, record.start) + source.slice(record.end);
  return result({record, threads: data.threads, body, current: verifyBody && data.body === commentBodyDigest(body)});
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
  const stale = memos.findIndex(row => row.source === source);
  if (stale >= 0) memos.splice(stale, 1);
  memos.unshift({source, parsed: Object.freeze(parsed)});
  if (memos.length > MEMOS) memos.pop();
  return parsed;
}

const sourceStore = value => value && typeof value === 'object' && typeof value.readSlice === 'function' && typeof value.read === 'function';
const sourceState = source => {
  const owned = sources.get(source);
  if (owned?.current.rootId === source.rootId) return owned.current;
  let restored = revisions.get(source.cacheKey);
  if (restored) {
    if (restored.rootId !== source.rootId) {
      restored = {...restored, rootId: source.rootId};
      revisions.set(source.cacheKey, restored);
    }
    sources.set(source, {current: restored, pending: null});
    return restored;
  }
  return null;
};
const sameRows = (left, right) => left.length === right.length && left.every((row, index) =>
  row.pos === right[index].pos && row.removed === right[index].removed && row.inserted === right[index].inserted);
const bodySlice = (state, start, end) => {
  const record = state.parsed.record;
  if (!record || end <= record.start) return state.text.readSlice(start, end);
  if (start >= record.start) return state.text.readSlice(start + record.raw.length, end + record.raw.length);
  return state.text.readSlice(start, record.start) + state.text.readSlice(record.end, end + record.raw.length);
};

function liveIndexedThreads(state) {
  const {parsed, text: source} = state, view = {slice: source.readSlice, length: source.length};
  return parsed.threads.map(thread => {
    let anchor = thread.anchor;
    if (anchor.kind !== 'document' && anchor.status === 'attached') {
      const reason = !parsed.current ? 'source_changed_without_history' :
        commentDigest(bodySlice(state, anchor.start, anchor.end)) !== anchor.exact ? 'target_changed' :
          !objectPresent(view, anchor, parsed) ? 'object_missing' : '';
      if (reason) anchor = {...anchor, status: 'stale', reason};
    }
    return {...thread, anchor, messages: thread.messages.slice()};
  });
}

function commentValueSlots(raw) {
  const stack = [], slots = {body: null, anchors: []};
  for (let at = MARKER.length; at < raw.length - 4; at++) {
    const character = raw[at], parent = stack.at(-1);
    if (character === '{' || character === '[') {
      const kind = !parent ? 'record' : parent.kind === 'record' && parent.key === 'threads' && character === '['
        ? 'threads' : parent.kind === 'threads' && character === '{' ? 'thread'
          : parent.kind === 'thread' && parent.key === 'anchor' && character === '{' ? 'anchor' : '';
      if (kind === 'threads') slots.anchors = [];
      stack.push({kind, start: at, index: kind === 'threads' ? 0 : parent?.index, key: null});
    } else if (character === '}' || character === ']') {
      const frame = stack.pop();
      if (frame.kind === 'anchor') slots.anchors[frame.index] = {start: frame.start, end: at + 1};
    } else if (character === ',') {
      if (parent) {parent.key = null; if (parent.kind === 'threads') parent.index++;}
    } else if (character === '"') {
      const start = at++;
      while (at < raw.length && raw[at] !== '"') {if (raw[at] === '\\') at++; at++;}
      const end = at + 1;
      let next = end;
      while (next < raw.length && /\s/.test(raw[next])) next++;
      if (raw[next] === ':' && (parent?.kind === 'record' || parent?.kind === 'thread')) parent.key = JSON.parse(raw.slice(start, end));
      else if (parent?.kind === 'record' && parent.key === 'body') slots.body = {start, end};
    }
  }
  return slots;
}

function readIndexed(state, previous) {
  const {text: source, blocks} = state;
  const parsed = {record: null, threads: [], current: true};
  Object.defineProperty(parsed, 'body', {enumerable: true, get: () => parsed.record
    ? source.readSlice(0, parsed.record.start) + source.readSlice(parsed.record.end) : source.readSlice()});
  state.parsed = parsed;
  if (blocks.records > 1) parsed.reason = 'comments_ambiguous';
  else if (blocks.records === 1) {
    const found = blocks.record(), opening = found.value, start = found.start;
    if (!opening.startsWith(MARKER)) parsed.reason = 'comments_format_unknown';
    else {
      let data, slot, anchorSlots;
      if (previous?.carrier?.opening === opening) ({data, slot, anchorSlots} = previous.carrier);
      else {
        try {data = JSON.parse(opening.slice(MARKER.length, -4));} catch (_) {}
        if (validData(data)) ({body: slot, anchors: anchorSlots} = commentValueSlots(opening)); else data = null;
      }
      if (!data) parsed.reason = 'comments_malformed';
      else {
        parsed.record = {start, end: start + opening.length, raw: opening}; parsed.threads = data.threads;
        parsed.current = data.body === source.digest(parsed.record);
        state.carrier = {opening, data, slot, anchorSlots};
      }
    }
  }
  grammar.set(parsed, {get references() {return state.references ||= blocks.references();}});
  return state;
}

function sameScope(left, right) {
  return left && right && left.length === right.length && left.parsedLength === right.parsedLength && left.type === right.type;
}

function frontmatterOpening(source) {
  if (source.firstLineBreak < 0 || !/^\uFEFF?---(?: |\r|\n|$)/.test(source.readSlice(0, 5)) ||
      !/^\uFEFF?--- *$/.test(source.readSlice(0, source.firstLineBreak))) return 0;
  return source.firstLineBreak + (source.readSlice(source.firstLineBreak, source.firstLineBreak + 2) === '\r\n' ? 2 : 1);
}

function indexedSplice(state, row) {
  const source = state.text.splice(row);
  if (!source) return null;
  const delta = row.inserted.length - row.removed.length, stop = row.pos + row.removed.length;
  const openingEnd = row.pos <= (state.text.firstLineBreak < 0 ? state.text.length : state.text.firstLineBreak + 2)
    ? frontmatterOpening(source) : state.openingEnd;
  const reframe = () => {
    const raw = source.readSlice(), offset = markdownBodyOffset(raw), scanned = scanComments(raw, false, [], offset);
    const context = grammar.get(scanned);
    return readIndexed({...state, text: source, blocks: createCommentBlocks(context.scopes), offset, openingEnd,
      references: context.references, definitionsChanged: true}, state);
  };
  const headerLast = state.offset ? state.text.readSlice(state.offset - 1, state.offset) : '';
  if (state.offset && (row.pos < state.offset || row.pos === state.offset &&
      (!/[\r\n]/.test(headerLast) || headerLast === '\r' && source.readSlice(row.pos, row.pos + 1) === '\n'))) {
    const offset = state.offset + delta;
    if (stop <= state.offset && offset > 0 && markdownBodyOffset(source.readSlice(0, offset + 1)) === offset) {
      const first = state.blocks.at(0).value;
      return readIndexed({...state, text: source, offset, openingEnd,
        blocks: state.blocks.replace(0, 1, [{...first, length: first.length + delta, parsedLength: first.parsedLength + delta}])}, state);
    }
    return reframe();
  }
  if (!state.offset && openingEnd && !state.openingEnd) return reframe();
  const first = state.blocks.containing(row.pos), last = state.blocks.containing(stop);
  let low = Math.max(0, first.index - 1), high = Math.min(state.blocks.count - 1, last.index + 1);
  for (;;) {
    const left = state.blocks.at(low), right = state.blocks.at(high), start = left.start;
    const end = right.start + right.value.length, raw = source.readSlice(start, end + delta);
    if (!state.offset && openingEnd && /(?:^|\r\n|\r|\n)(?:---|\.\.\.) *(?=\r|\n|$)/
      .test(raw.slice(Math.max(0, openingEnd - start)))) return reframe();
    const offset = start === 0 ? state.offset : 0;
    const scanned = scanComments(raw, false, [], offset), context = grammar.get(scanned), scopes = context.scopes;
    const firstScope = scopes[0], lastScope = scopes.at(-1);
    const leftStable = low === 0 || row.pos >= start + left.value.length && sameScope(left.value, firstScope);
    const rightStable = high === state.blocks.count - 1 || stop <= right.start && sameScope(right.value, lastScope);
    if (!leftStable) {low = Math.max(0, low - Math.max(1, high - low)); continue;}
    if (!rightStable) {high = Math.min(state.blocks.count - 1, high + Math.max(1, high - low)); continue;}
    const priorReferences = [];
    for (let index = low; index <= high; index++) priorReferences.push(...state.blocks.at(index).value.references);
    const references = scopes.flatMap(scope => scope.references);
    const definitionsChanged = priorReferences.length !== references.length || priorReferences.some(([label, definition], index) =>
      label !== references[index][0] || definition?.href !== references[index][1]?.href || definition?.title !== references[index][1]?.title);
    return readIndexed({...state, text: source, openingEnd, blocks: state.blocks.replace(low, high - low + 1, scopes),
      references: definitionsChanged ? null : state.references, definitionsChanged: state.definitionsChanged || definitionsChanged}, state);
  }
}

function advanceIndexed(state, rows) {
  let next = {...state, definitionsChanged: false};
  for (const row of rows) {next = indexedSplice(next, row); if (!next) return null;}
  return next;
}

export function prepareCommentSource(source, options = {}) {
  if (!sourceStore(source)) throw new TypeError('comments_source_invalid');
  if (options.signal?.aborted) return false;
  if (sourceState(source)) return true;
  if (!source.contains('md-comments:')) {
    const captured = source.capture(), rootAfter = options.rootAfter || globalThis.RapierSourceStore?.rootAfter;
    if (typeof rootAfter !== 'function') throw new TypeError('comments_source_root_unavailable');
    const parsed = {record: null, threads: [], current: true, get body() {return captured.read();}};
    const state = {rootId: source.rootId, rootAfter, empty: true, parsed, live: []};
    remember(source, parsed);
    revisions.set(source.cacheKey, state);
    sources.set(source, {current: state, pending: null});
    return true;
  }
  const rootId = source.rootId, raw = source.read();
  const parsed = scanComments(raw, false);
  const context = grammar.get(parsed) || grammar.get(scanComments(raw, false, [], markdownBodyOffset(raw)));
  const complete = text => {
    if (source.rootId !== rootId || options.signal?.aborted) return false;
    const state = readIndexed({rootId, rootAfter: options.rootAfter || globalThis.RapierSourceStore?.rootAfter,
      text, blocks: createCommentBlocks(context.scopes), offset: context.offset, openingEnd: frontmatterOpening(text), references: context.references});
    if (typeof state.rootAfter !== 'function') throw new TypeError('comments_source_root_unavailable');
    state.live = liveIndexedThreads(state); remember(source, state.parsed);
    revisions.set(source.cacheKey, state);
    sources.set(source, {current: state, pending: null}); return true;
  };
  const text = createCommentText(raw, options);
  return text?.then ? text.then(complete) : complete(text);
}

export function commentSourcePrepared(source) {return !!sourceState(source);}

export function commentSourceCommitted(source, rows) {
  const owned = sources.get(source);
  if (!owned) return false;
  const restored = sourceState(source);
  if (restored) {owned.pending = null; return true;}
  const before = owned.current;
  const expected = rows.reduce((root, row) => before.rootAfter(root, row), before.rootId);
  if (expected !== source.rootId) {owned.pending = null; return false;}
  if (before.empty || !source.contains('md-comments:')) return prepareCommentSource(source, {rootAfter: before.rootAfter});
  const pending = owned.pending;
  const next = pending && sameRows(pending.rows, rows) ? pending.state : advanceIndexed(before, rows);
  if (!next) {owned.pending = null; return false;}
  next.rootId = source.rootId;
  if (!pending || next !== pending.state) next.live = liveIndexedThreads(next);
  remember(source, next.parsed);
  revisions.set(source.cacheKey, next);
  owned.current = next; owned.pending = null;
  return true;
}

export function parseComments(source) {
  if (sourceStore(source)) {
    const state = sourceState(source);
    if (!state) throw new TypeError('comments_source_not_prepared');
    return state.parsed;
  }
  return remembered(source) || remember(source, scanComments(source));
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
  const parser = markdownParser(), assets = grammar.get(parsed) || grammar.get(remembered(source)) || documentAssets(source), tokens = [];
  parser.inline.parse(occurrence, parser, {references: assets.references}, tokens);
  if (tokens.length !== 1 || tokens[0].type !== 'image' || tokens[0].meta?.mdImage?.source !== occurrence) return false;
  if (anchor.kind === 'image') return true;
  const url = tokens[0].attrGet('src');
  if (!/^data:image\/svg\+xml(?:;base64)?,/i.test(url || '')) return false;
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
  if (sourceStore(source)) {
    const state = sourceState(source);
    if (!state || state.parsed !== parsed) throw new TypeError('comments_source_not_prepared');
    return state.live.map(thread => ({...thread, anchor: {...thread.anchor}, messages: thread.messages.slice()}));
  }
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
  return encodeCommentRecord(threads, commentBodyDigest(body));
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
  if (anchor.kind === 'document' || anchor.status !== 'attached' &&
      !(anchor.kind === 'drawing' && anchor.reason === 'object_missing')) return anchor;
  const end = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
  if (end <= anchor.start) return {...anchor, start: anchor.start + delta, end: anchor.end + delta};
  if (row.pos >= anchor.end) return anchor;
  if (anchor.kind === 'drawing' && row.pos === anchor.start && end === anchor.end && row.inserted) {
    return {...anchor, end: anchor.start + row.inserted.length, exact: commentDigest(row.inserted),
      quote: Array.from(row.inserted).slice(0, 256).join('')};
  }
  return {...anchor, status: 'stale', reason: row.inserted ? 'target_changed' : 'target_deleted'};
}

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

function encodeCommentValue(data) {
  return JSON.stringify(data).replace(/"(?:[^"\\]|\\.)*"/g, value => value.replace(/[<>&-]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')));
}

function encodeCommentRecord(threads, digest) {
  const data = {body: digest, threads};
  if (!validData(data)) throw new TypeError('comments_data_invalid');
  return MARKER + encodeCommentValue(data) + ' -->';
}

function indexedCommentSplices(source, splices) {
  const state = sourceState(source);
  if (!state) throw new TypeError('comments_source_not_prepared');
  const parsed = state.parsed, owned = sources.get(source);
  owned.pending = null;
  if (!parsed.record || parsed.reason) return [];
  let position = parsed.record.start, end = parsed.record.end;
  const bodyRows = [];
  for (const row of splices) {
    const stop = row.pos + row.removed.length;
    if (row.pos < end && stop > position || row.pos > position && row.pos < end) return [];
    bodyRows.push({...row, pos: row.pos >= end ? row.pos - parsed.record.raw.length : row.pos});
    if (stop <= position) {position += row.inserted.length - row.removed.length; end += row.inserted.length - row.removed.length;}
  }
  const next = advanceIndexed(state, splices);
  if (!next?.parsed.record || next.parsed.reason || next.parsed.record.start !== position ||
      next.parsed.record.raw !== parsed.record.raw) return [];
  let threadsChanged = false;
  const changedTargets = new Set();
  const threads = state.live.map((thread, index) => {
    let anchor = thread.anchor;
    for (const row of bodyRows) {
      if (row.pos < anchor.end && row.pos + row.removed.length > anchor.start ||
          row.inserted.length && row.pos > anchor.start && row.pos < anchor.end) changedTargets.add(index);
      anchor = transport(anchor, row);
    }
    if (anchor !== thread.anchor && anchorValue(anchor) !== anchorValue(thread.anchor)) threadsChanged = true;
    return anchor === thread.anchor ? thread : {...thread, anchor};
  });
  const view = {slice: next.text.readSlice, length: next.text.length};
  for (let index = 0; index < threads.length; index++) {
    const thread = threads[index];
    if (thread.anchor.status === 'attached' && (next.definitionsChanged || changedTargets.has(index)) &&
        !objectPresent(view, thread.anchor, next.parsed)) {
      threads[index] = {...thread, anchor: {...thread.anchor, status: 'stale', reason: 'object_missing'}};
      threadsChanged = true;
    }
  }
  if (threads.some((thread, index) => thread.anchor !== parsed.threads[index].anchor &&
      anchorValue(thread.anchor) !== anchorValue(parsed.threads[index].anchor))) threadsChanged = true;
  const bodyDigest = next.text.digest(next.parsed.record);
  const {slot, anchorSlots} = state.carrier;
  const fieldsOnly = slot &&
    (!threadsChanged || anchorSlots?.length === threads.length && threads.every((_, index) => anchorSlots[index]));
  let rows;
  let final = next;
  if (fieldsOnly) {
    const fields = [{...slot, value: bodyDigest}];
    if (threadsChanged) for (let index = 0; index < threads.length; index++) {
      const anchor = threads[index].anchor;
      if (anchorValue(anchor) === anchorValue(parsed.threads[index].anchor)) continue;
      if (!validAnchor(anchor)) throw new TypeError('comments_data_invalid');
      fields.push({...anchorSlots[index], value: anchor});
    }
    const edits = fields.map(field => ({pos: field.start, removed: state.carrier.opening.slice(field.start, field.end),
      inserted: encodeCommentValue(field.value)})).filter(row => row.inserted !== row.removed).sort((a, b) => b.pos - a.pos);
    rows = edits.map(row => ({...row, pos: position + row.pos}));
    let text = next.text;
    for (const row of rows) {text = text.splice(row); if (!text) return [];}
    const moveSlot = slot => {
      let {start, end} = slot;
      for (const row of edits) {
        const delta = row.inserted.length - row.removed.length;
        if (row.pos === start && row.removed.length === end - start) end += delta;
        else if (row.pos + row.removed.length <= start) {start += delta; end += delta;}
      }
      return {start, end};
    };
    const opening = transformSplices(state.carrier.opening, edits);
    const region = next.blocks.containing(position), delta = opening.length - state.carrier.opening.length;
    const block = {...region.value, length: region.value.length + delta, parsedLength: region.value.parsedLength + delta, record: opening};
    final = readIndexed({...next, text, blocks: next.blocks.replace(region.index, 1, [block])},
      {...next, carrier: {...state.carrier, opening, data: {...state.carrier.data, body: bodyDigest, threads},
        slot: moveSlot(slot), anchorSlots: anchorSlots?.map(moveSlot)}});
  } else {
    const row = {pos: position, removed: parsed.record.raw, inserted: encodeCommentRecord(threads, bodyDigest)};
    rows = row.inserted === row.removed ? [] : [row];
    if (rows.length) final = advanceIndexed(next, rows);
  }
  if (!final?.parsed.current) return [];
  final.live = threads;
  owned.pending = {rows: [...splices, ...rows], state: final};
  return rows;
}

export function commentSplices(before, splices) {
  if (sourceStore(before)) return indexedCommentSplices(before, splices);
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

export function commentSpliceParts(source, splice) {
  const next = transformSplices(source, [splice]);
  if (next == null || !commentChanges(source, next)?.length) return [splice];
  const prior = parseComments(source), following = parseComments(next);
  const exact = parsed => ({...parsed.record, text: parsed.record.raw});
  const before = prior.record && following.record ? exact(prior) : commentEnvelope(source, prior);
  const after = prior.record && following.record ? exact(following) : commentEnvelope(next, following);
  if (prior.record && following.record) {
    const ranges = [[before.end, source.slice(before.end), next.slice(after.end)],
      [before.start, before.text, after.text], [0, source.slice(0, before.start), next.slice(0, after.start)]];
    return ranges.map(([offset, old, value]) => {const row = bodyDelta(old, value); return {...row, pos: offset + row.pos};})
      .filter(row => row.removed || row.inserted);
  }
  const body = before ? source.slice(0, before.start) + source.slice(before.end) : source;
  const target = after ? next.slice(0, after.start) + next.slice(after.end) : next;
  const changed = bodyDelta(body, target);
  return [...(before ? [{pos: before.start, removed: before.text, inserted: ''}] : []),
    ...(changed.removed || changed.inserted ? [changed] : []),
    ...(after ? [{pos: after.start, removed: '', inserted: after.text}] : [])];
}

function bodyTransport(source, anchor, splices) {
  for (const row of splices) {
    const parsed = parseComments(source), next = transformSplices(source, [row]);
    if (next == null || parsed.reason) return null;
    const following = parseComments(next);
    if (following.reason) return null;
    const record = parsed.record, end = row.pos + row.removed.length;
    let bodyRow;
    if (record && row.pos >= record.start && end <= record.end && following.record &&
        (row.removed.length || row.pos > record.start && row.pos < record.end)) {
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

function writeRestoredComments(source, threads, current, before, change) {
  if (!change.later?.some(row => !change.selectedIds.has(row.id)) &&
      current.record && before.record && current.body === before.body &&
      JSON.stringify(threads) === JSON.stringify(before.threads)) {
    const original = commentEnvelope(change.beforeSource, before), live = commentEnvelope(source, current);
    if (source.slice(0, live.start) === change.beforeSource.slice(0, original.start) &&
        source.slice(live.end) === change.beforeSource.slice(original.end)) {
      const row = bodyDelta(live.text, original.text);
      return {...row, pos: live.start + row.pos};
    }
    return {pos: current.record.start, removed: current.record.raw, inserted: before.record.raw};
  }
  return writeComments(source, threads, current);
}

export function commentUndoSplice(source, change, later = []) {
  const {beforeSource, afterSource, entry} = change;
  const before = parseComments(beforeSource), after = parseComments(afterSource), current = parseComments(source);
  const changed = commentChanges(beforeSource, afterSource);
  if (!changed?.length || current.reason) return null;
  const threads = commentThreads(source, current);
  const restoredBody = before.current && before.body === current.body &&
    !change.later?.some(row => !change.selectedIds.has(row.id));
  const originalThreads = restoredBody ? commentThreads(beforeSource, before) : [];
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
    const original = originalThreads.find(thread => thread.id === id)?.anchor;
    const anchor = original?.kind === 'text' && original.status === 'attached' ? {...original} : live?.anchor || expectedAnchor;
    const index = threads.findIndex(thread => thread.id === id);
    if (!prior) threads.splice(index, 1);
    else if (live) threads[index] = {...live, anchor, resolved: prior.resolved, messages: prior.messages.slice()};
    else {
      const following = before.threads.slice(before.threads.indexOf(prior) + 1).find(thread => threads.some(live => live.id === thread.id));
      const index = following ? threads.findIndex(thread => thread.id === following.id) : threads.length;
      threads.splice(index, 0, {...prior, anchor, messages: prior.messages.slice()});
    }
  }
  if (!current.record && before.record) {
    const envelope = commentEnvelope(beforeSource, before);
    let position = bodyTransport(beforeSource, {kind: 'text', status: 'attached', start: envelope.start, end: envelope.start}, entry.splices);
    for (const row of later) position = position && bodyTransport(position.source, position.anchor, row.splices);
    if (!position || position.source !== source || position.anchor.status !== 'attached') return null;
    const at = position.anchor.start, prefix = beforeSource.slice(envelope.start, before.record.start), suffix = beforeSource.slice(before.record.end, envelope.end);
    const body = source.slice(0, at) + prefix + suffix + source.slice(at);
    const raw = body === before.body && JSON.stringify(threads) === JSON.stringify(before.threads)
      ? before.record.raw : serializeComments(threads, body);
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
  return writeRestoredComments(source, threads, current, before, change);
}

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
  return changed ? writeRestoredComments(source, threads, current, before, change) : null;
}
