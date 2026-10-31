// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Jack Skipworth. See LICENSE-MIT.
import {ensureMarkdownParser} from "./md-parser-runtime.mjs";
import {markdownParser, markdownBodyOffset, documentAssets, parseAssets, projectImageDefinitions, eachBlockWindow} from "./md-assets.mjs";
import {_rapierTransformSplices as transformSplices} from "./journal-records.mjs";

export const MARKER = '<!-- md-comments:v1 ';
const int = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => plain(value) && required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const id = value => typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
const text = value => typeof value === 'string' && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(value);

const FIRST = 16777619, SECOND = 2246822519;
export const emptyHash = () => ({length: 0, first: 0, second: 0, firstPower: 1, secondPower: 1});

export function hashText(text) {
  let first = 0, second = 0, firstPower = 1, secondPower = 1;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at) + 1;
    first = (Math.imul(first, FIRST) + code) >>> 0;
    second = (Math.imul(second, SECOND) + code) >>> 0;
    firstPower = Math.imul(firstPower, FIRST) >>> 0;
    secondPower = Math.imul(secondPower, SECOND) >>> 0;
  }
  return {length: text.length, first, second, firstPower, secondPower};
}

export function foldHash(left, right) {
  return {length: left.length + right.length,
    first: (Math.imul(left.first, right.firstPower) + right.first) >>> 0,
    second: (Math.imul(left.second, right.secondPower) + right.second) >>> 0,
    firstPower: Math.imul(left.firstPower, right.firstPower) >>> 0,
    secondPower: Math.imul(left.secondPower, right.secondPower) >>> 0};
}

export const digest = hash => 'p1:' + hash.length + ':' + hash.first + ':' + hash.second;
export const commentBodyDigest = text => digest(hashText(text));
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

export function validAnchor(anchor) {
  if (!exactKeys(anchor, ['kind', 'status'], ['start', 'end', 'exact', 'quote', 'objectId', 'reason'])) return false;
  if (!['document', 'text', 'image', 'drawing'].includes(anchor.kind) || !['attached', 'stale'].includes(anchor.status)) return false;
  if (anchor.kind !== 'document' && (!int(anchor.start) || !int(anchor.end) || anchor.end < anchor.start || !text(anchor.exact) || !text(anchor.quote))) return false;
  return (anchor.objectId === undefined || anchor.kind === 'drawing' && id(anchor.objectId)) &&
    (anchor.reason === undefined || text(anchor.reason));
}

export function validData(data) {
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

export function serializeComments(threads, body) {
  return encodeCommentRecord(threads, commentBodyDigest(body));
}

export function transport(anchor, row) {
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

export function encodeCommentValue(data) {
  return JSON.stringify(data).replace(/"(?:[^"\\]|\\.)*"/g, value => value.replace(/[<>&-]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')));
}

export function encodeCommentRecord(threads, digest) {
  const data = {body: digest, threads};
  if (!validData(data)) throw new TypeError('comments_data_invalid');
  return MARKER + encodeCommentValue(data) + ' -->';
}

export function freezeCommentRecord(parsed) {
  for (const thread of parsed.threads) {
    Object.freeze(thread.anchor);
    for (const message of thread.messages) { Object.freeze(message.author); Object.freeze(message); }
    Object.freeze(thread.messages); Object.freeze(thread);
  }
  Object.freeze(parsed.threads);
  if (parsed.record) Object.freeze(parsed.record);
  return Object.freeze(parsed);
}

export function createCommentSourceOwner({readDrawing} = {}) {
  const memos = [], MEMOS = 3;
  const remembered = source => memos.find(row => row.source === source)?.parsed;
  const grammar = new WeakMap();

  function scanComments(source, verifyBody = true, definitions, scopeOffset) {
    const empty = {record: null, threads: [], body: source, current: true};
    if (scopeOffset === undefined && !source.includes('md-comments:')) return empty;
    ensureMarkdownParser();
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
    freezeCommentRecord(parsed);
    if (context) grammar.set(parsed, context);
    const stale = memos.findIndex(row => row.source === source);
    if (stale >= 0) memos.splice(stale, 1);
    memos.unshift({source, parsed});
    if (memos.length > MEMOS) memos.pop();
    return parsed;
  }

  function parseComments(source) {
    return remembered(source) || remember(source, scanComments(source));
  }

  function objectPresent(source, anchor, parsed, context) {
    if (anchor.kind !== 'drawing' && anchor.kind !== 'image') return true;
    const range = commentSourceRange(anchor, parsed), occurrence = source.slice(range.start, range.end);
    const parser = markdownParser(), assets = context || grammar.get(parsed) || grammar.get(remembered(source)) || documentAssets(source), tokens = [];
    parser.inline.parse(occurrence, parser, {references: assets.references}, tokens);
    if (tokens.length !== 1 || tokens[0].type !== 'image' || tokens[0].meta?.mdImage?.source !== occurrence) return false;
    if (anchor.kind === 'image') return true;
    const url = tokens[0].attrGet('src');
    if (!/^data:image\/svg\+xml(?:;base64)?,/i.test(url || '')) return false;
    let recipe;
    try { recipe = readDrawing?.(url); } catch { return false; }
    return !!recipe && (!anchor.objectId || recipe.shapes.some(shape => shape.id === anchor.objectId));
  }

  function commentThreads(source, parsed = parseComments(source)) {
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

  function writeComments(source, threads, parsed = parseComments(source)) {
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

  function commentSplices(before, splices) {
    if (!before.includes(MARKER)) return [];
    const parsed = parseComments(before);
    if (!parsed.record || parsed.reason) return [];
    if (!readDrawing && parsed.threads.some(thread => thread.anchor.kind === 'drawing')) return [];
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

  function derivedCommentEdits(base, edits) {
  	const parsed = parseComments(base), submitted = transformSplices(base, edits);
  	if (parsed.reason || submitted === null) return null;
  	if (!parsed.record) return parseComments(submitted).record ? null : {edits, restore: []};
  	let start = parsed.record.start, end = parsed.record.end;
  	const body = [];
  	for (const row of edits) {
  		const stop = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
  		if (row.pos < end && stop > start || row.pos > start && row.pos < end) {
  			if (row.pos < start || stop > end) return null;
  			end += delta;
  		} else {
  			body.push({...row, pos: row.pos >= end ? row.pos - (end - start) + parsed.record.raw.length : row.pos});
  			if (stop <= start) { start += delta; end += delta; }
  		}
  	}
  	const clean = transformSplices(base, body), derived = commentSplices(base, body);
  	if (clean === null || transformSplices(clean, derived) !== submitted) return null;
  	const restore = derived.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
  	return {edits: body, restore};
  }

  return Object.freeze({scanComments, parseComments, commentThreads, writeComments, commentSplices,
    derivedCommentEdits, objectPresent, context: parsed => grammar.get(parsed)});
}

const portable = createCommentSourceOwner();
export const {parseComments, commentSplices, derivedCommentEdits} = portable;
