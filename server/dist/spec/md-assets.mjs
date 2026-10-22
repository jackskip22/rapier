// SPDX-License-Identifier: MIT
// Pure text and markdown-it tokens: no DOM, no byte decoding, no globalThis.Rapier* (MIT kit; decoders stay in images/assets.mjs).
import {isWordSidecarBlock} from './word-sidecar.mjs';
import {sourceFacts, sourceView, sourceEdit} from '../kit/ledger/source.mjs';

export const IMAGE_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, sourceChars: 64 * 1024 * 1024, dimension: 16384, pixels: 24000000, assets: 1024});
const parsers = new WeakMap();
const cached = [];
let preparedDefinitions = [];
let configured = null, splitSource = null;
export function configureParser(parser, split) { configured = parser; splitSource = split; cached.length = 0; preparedDefinitions = []; }
function fail(reason) { throw new Error(reason); }
export const normalizeLabel = label => String(label).trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
export const assetTitle = value => String(value || '').replace(/[\r\n]/g, ' ').replace(/\0/g, '\ufffd');

export function installMarkdownImages(md) {
  if (md.__rapierImagesInstalled) return md;
  md.__rapierImagesInstalled = true;
  const validate = md.validateLink;
  md.validateLink = url => /^data:image\/(?:jxl|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url) || validate(url);
  const normalize = md.normalizeLink;
  md.normalizeLink = url => /^data:image\/(?:jxl|png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url) ? url : normalize(url);
  const reference = md.block.ruler.__rules__.find(row => row.name === 'reference').fn;
  md.block.ruler.at('reference', (state, start, end, silent) => {
    if (silent) return reference(state, start, end, silent);
    if (state.src.charCodeAt(state.bMarks[start] + state.tShift[start]) !== 0x5B) return false;
    const saved = state.env.references, local = Object.create(null);
    state.env.references = local;
    let accepted;
    try { accepted = reference(state, start, end, false); }
    finally { state.env.references = saved; }
    if (accepted) {
      const token = state.tokens[state.tokens.length - 1], label = token.meta.label;
      token.meta.mdImageDefinition = local[label];
      const refs = state.env.references ||= Object.create(null);
      if (!Object.hasOwn(refs, label)) refs[label] = local[label];
    }
    return accepted;
  });
  const image = md.inline.ruler.__rules__.find(row => row.name === 'image').fn;
  md.inline.ruler.at('image', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '!' || state.src[start + 1] !== '[') return false;
    const before = state.tokens.length;
    if (!image(state, silent)) return false;
    if (!silent && state.tokens.length > before) {
      const token = state.tokens[state.tokens.length - 1], source = state.src.slice(start, state.pos);
      if (token.type === 'image') {
        const close = state.md.helpers.parseLinkLabel(state, start + 1, false);
        let reference = null;
        if (close >= 0 && state.src[close + 1] !== '(') {
          const explicit = state.src[close + 1] === '[' ? state.src.slice(close + 2, state.pos - 1) : '';
          reference = md.utils.normalizeReference(explicit || state.src.slice(start + 2, close));
        }
        (token.meta ||= {}).mdImage = {source, reference};
      }
    }
    return true;
  });
  return md;
}

function parserFor(factory = configured || globalThis.markdownit) {
  if (factory?.block && factory?.utils) return factory;
  if (configured && factory === globalThis.markdownit) return configured;
  if (typeof factory !== 'function') return fail('markdown_parser_unavailable');
  let parser = parsers.get(factory);
  if (!parser) { parser = installMarkdownImages(factory({html: true, maxNesting: 20})); parsers.set(factory, parser); }
  return parser;
}
export {parserFor as markdownParser};
export const markdownBodyOffset = source => splitSource ? splitSource(source).bodyOffset : 0;

const BLOCK_WINDOW = 1024, TABLE_STEP = 128, WINDOW_END = Symbol('block window end');
const LINE_TABLES = ['bMarks', 'eMarks', 'tShift', 'sCount', 'bsCount'];
const lineIndex = key => typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key);
let unheldLine = null;
const unheldLines = new Proxy(Array.prototype, {
  get: (target, key, table) => unheldLine && lineIndex(key) ? unheldLine(table, Number(key)) : Reflect.get(target, key, table),
  set: (target, key, value, table) => unheldLine && lineIndex(key) ? unheldLine(table, Number(key), true, value) : Reflect.set(target, key, value, table),
});

export function eachBlockWindow(source, bodyOffset, parser, env, visit, keepNul = false) {
  for (const window of blockWindows(source, bodyOffset, parser, env, keepNul)) visit(window);
}

export function* blockWindows(source, bodyOffset, parser, env, keepNul = false) {
  const lineEnds = source.slice(bodyOffset).replace(/\r\n?/g, '\n'), body = keepNul ? lineEnds : lineEnds.replace(/\0/g, '\ufffd');
  let pair = source.indexOf('\r\n', bodyOffset), shift = bodyOffset;
  const sourceOffset = at => {
    while (pair >= 0 && at + shift > pair) { shift++; pair = source.indexOf('\r\n', pair + 2); }
    for (let last; shift > bodyOffset && at + shift - 1 <= (last = source.lastIndexOf('\r\n', (pair < 0 ? source.length : pair) - 1)); pair = last) shift--;
    return at + shift;
  };
  const tokens = [];
  let origin = 0, first = 0, state;
  const report = () => ({tokens, firstLine: first, lineStart: line => {
    if (!line) return sourceOffset(origin);
    const end = Object.hasOwn(state.eMarks, line - 1) ? state.eMarks[line - 1] : body.length;
    return end < body.length ? sourceOffset(end + 1) : undefined;
  }});
  let lines = 0;
  for (let at = 0; at < body.length; at++) if (body.charCodeAt(at) === 10) lines++;
  if (lines <= BLOCK_WINDOW) {
    state = new parser.block.State(body, parser, env, tokens);
    state.rapierSourceSlice = (from, to) => source.slice(sourceOffset(from), sourceOffset(to));
    parser.block.tokenize(state, state.line, state.lineMax);
    yield report(); return;
  }
  state = new parser.block.State(body.slice(body.lastIndexOf('\n') + 1), parser, env, tokens);
  state.rapierSourceSlice = (from, to) => source.slice(sourceOffset(from), sourceOffset(to));
  lines += state.lineMax;
  state.src = body;
  const tables = new WeakMap();
  for (const name of LINE_TABLES) { state[name].length = 0; tables.set(Object.setPrototypeOf(state[name], unheldLines), name); }
  let frontier = 0, ended = false, betweenBlocks = false;
  const fill = line => {
    while (!ended && line >= state.bMarks.length) {
      const held = state.bMarks.length;
      let until = frontier;
      for (let more = held ? Math.max(TABLE_STEP, held - BLOCK_WINDOW) : BLOCK_WINDOW; more && until < body.length; more--) {
        const end = body.indexOf('\n', until);
        until = end < 0 ? body.length : end + 1;
      }
      const scanned = new parser.block.State(body.slice(frontier, until), parser, env, []);
      ended = until === body.length;
      const added = ended ? scanned.lineMax + 1 : scanned.lineMax;
      for (const name of LINE_TABLES) {
        const old = state[name], next = scanned[name], offset = name === 'bMarks' || name === 'eMarks' ? frontier : 0, table = [];
        for (let at = 0; at < held; at++) table.push(old[at]);
        for (let at = 0; at < added; at++) table.push(next[at] + offset);
        old.length = 0;
        tables.set(table, name);
        state[name] = Object.setPrototypeOf(table, unheldLines);
      }
      frontier = until;
    }
  };
  const answer = (table, line, write, value) => {
    const name = tables.get(table);
    if (line >= state[name].length) {
      if (betweenBlocks) throw WINDOW_END;
      fill(line);
    }
    const current = state[name], held = Object.hasOwn(current, line);
    if (!write) return held ? current[line] : undefined;
    if (held) current[line] = value;
    else Object.defineProperty(current, line, {value, writable: true, enumerable: true, configurable: true});
    return true;
  };
  const skipEmptyLines = state.skipEmptyLines;
  state.skipEmptyLines = function (line) {
    if (this.level || line !== this.line || !line) return skipEmptyLines.call(this, line);
    if (line >= BLOCK_WINDOW) throw WINDOW_END;
    betweenBlocks = true;
    line = skipEmptyLines.call(this, line);
    betweenBlocks = false;
    return line;
  };
  for (;;) {
    for (let at = origin; at < body.length; at++) {
      const code = body.charCodeAt(at);
      if (code === 10) { origin = at + 1; first++; }
      else if (!parser.utils.isSpace(code)) break;
    }
    frontier = origin; ended = false; betweenBlocks = false;
    state.line = 0; state.lineMax = lines - first; state.rapierFirstLine = first;
    const outer = unheldLine;
    unheldLine = answer;
    let finished = true;
    try { parser.block.tokenize(state, 0, state.lineMax); }
    catch (error) { if (error !== WINDOW_END) throw error; finished = false; }
    finally { unheldLine = outer; }
    yield report();
    if (finished) return;
    tokens.length = 0;
    origin = state.eMarks[state.line - 1] + 1; first += state.line;
    for (const name of LINE_TABLES) state[name].length = 0;
  }
}

export function dataImage(url) {
  if (typeof url !== 'string' || url.length > IMAGE_LIMITS.sourceChars) return null;
  const prepared = preparedDefinitions.find(row => row.image.url === url)?.image;
  if (prepared) return {codec: prepared.codec, byteLength: prepared.byteLength, payloadStart: url.indexOf(',') + 1};
  const match = /^data:(image\/(?:jxl|png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
  if (!match || match[2].length % 4) return null;
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const byteLength = match[2].length / 4 * 3 - padding;
  if (!byteLength || byteLength > IMAGE_LIMITS.bytes) return null;
  return {codec: match[1].toLowerCase(), byteLength, payloadStart: match[0].length - match[2].length};
}

export function parseAssets(source, factory = configured || globalThis.markdownit, bodyOffset = 0) {
  const steps = assetSteps(source, factory, bodyOffset);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
export async function parseAssetsWork(source, factory, bodyOffset, work) {
  const steps = assetSteps(source, factory, bodyOffset);
  work.signal?.throwIfAborted();
  let next = steps.next();
  while (!next.done) { await work.yield(); work.signal?.throwIfAborted(); next = steps.next(); }
  return next.value;
}
function* assetSteps(source, factory = configured || globalThis.markdownit, bodyOffset = 0) {
  if (typeof source !== 'string') return fail('image_source_invalid');
  if (source.length > IMAGE_LIMITS.sourceChars) return fail('image_source_limit');
  if (!source.includes(']:')) return {assets: new Map(), blocks: [], duplicateLabels: new Set(), appendixStart: source.length, references: Object.create(null)};
  const prior = cached.find(row => row.source === source && row.factory === factory && row.bodyOffset === bodyOffset);
  if (prior) return prior.index;
  const definition = !bodyOffset && preparedDefinitions.find(row => row.source === source && row.factory === factory);
  if (definition) return definition.index;
  const parser = parserFor(factory), env = {};
  const assets = new Map(), blocks = [], seen = new Set(), duplicateLabels = new Set();
  for (const {tokens, lineStart} of blockWindows(source, bodyOffset, parser, env)) {
    for (const token of tokens) {
      if (token.type !== 'reference_definition' || !token.map) continue;
      const id = token.meta.label, definition = token.meta.mdImageDefinition, first = !seen.has(id);
      if (!first) duplicateLabels.add(id);
      seen.add(id);
      const info = dataImage(definition?.href);
      if (!info) continue;
      const start = lineStart(token.map[0]), stop = lineStart(token.map[1]) ?? source.length;
      let end = stop;
      if (source[end - 1] === '\n') end--;
      if (source[end - 1] === '\r') end--;
      const raw = source.slice(start, end), found = raw.indexOf(definition.href);
      const repeated = found >= 0 ? raw.indexOf(definition.href, found + 1) : -1;
      const labelContainsUrl = definition.href.length <= id.length && id.includes(parser.utils.normalizeReference(definition.href));
      const urlStart = found >= 0 && repeated < 0 && !labelContainsUrl ? start + found : null;
      const row = {id, label: id, source: raw, url: definition.href, title: definition.title || '', start, end,
        ...info, urlStart, urlEnd: urlStart == null ? null : urlStart + definition.href.length,
        payloadStart: urlStart == null ? null : urlStart + info.payloadStart, payloadEnd: urlStart == null ? null : urlStart + definition.href.length, status: 'unverified', active: first, topLevel: token.level === 0};
      blocks.push(row);
      if (first) assets.set(id, row);
    }
    yield;
  }
  const references = env.references || Object.create(null);
  if (assets.size > IMAGE_LIMITS.assets) for (const asset of assets.values()) asset.status = 'asset_count_limit';
  let appendixStart = source.length;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    if (!block.active || !block.topLevel || !/^[ \t\r\n]*$/.test(source.slice(block.end, appendixStart))) break;
    appendixStart = block.start;
  }
  const index = {assets, blocks, duplicateLabels, appendixStart, references};
  cached.unshift({source, factory, bodyOffset, index});
  if (cached.length > 3) cached.pop();
  return index;
}
export function documentAssets(source, factory) { return parseAssets(source, factory, markdownBodyOffset(source)); }

export function packAssetIndex(index, offset = 0) {
  const positions = ['start', 'end', 'urlStart', 'urlEnd', 'payloadStart', 'payloadEnd'];
  const blocks = index.blocks.map(row => {
    const packed = {...row};
    delete packed.source;
    if (Number.isSafeInteger(row.urlStart) && Number.isSafeInteger(row.urlEnd)) delete packed.url;
    for (const key of positions) if (Number.isSafeInteger(packed[key])) packed[key] -= offset;
    return packed;
  });
  const references = Object.create(null);
  for (const [label, definition] of Object.entries(index.references)) {
    const image = index.assets.get(label);
    references[label] = image?.url === definition.href
      ? {row: index.blocks.indexOf(image), title: definition.title}
      : {...definition};
  }
  return {blocks, references, duplicateLabels: [...index.duplicateLabels], appendixStart: index.appendixStart - offset};
}

export function restoreAssetIndex(source, packet, {offset = 0, bodyOffset = 0, factory = configured || globalThis.markdownit} = {}) {
  const positions = ['start', 'end', 'urlStart', 'urlEnd', 'payloadStart', 'payloadEnd'];
  const blocks = packet.blocks.map(packed => {
    const row = {...packed};
    for (const key of positions) if (Number.isSafeInteger(row[key])) row[key] += offset;
    row.source = source.slice(row.start, row.end);
    if (Number.isSafeInteger(row.urlStart) && Number.isSafeInteger(row.urlEnd)) row.url = source.slice(row.urlStart, row.urlEnd);
    return row;
  });
  const references = Object.create(null), assets = new Map();
  for (const row of blocks) if (row.active) assets.set(row.id, row);
  for (const [label, definition] of Object.entries(packet.references)) references[label] = Number.isSafeInteger(definition.row)
    ? {href: blocks[definition.row].url, title: definition.title} : {...definition};
  const index = {assets, blocks, duplicateLabels: new Set(packet.duplicateLabels), appendixStart: packet.appendixStart + offset, references};
  cached.unshift({source, factory, bodyOffset, index});
  if (cached.length > 3) cached.pop();
  preparedDefinitions = blocks.filter(row => row.topLevel).map(row => {
    const local = {...row, start: 0, end: row.source.length, active: true, status: 'unverified'};
    for (const key of positions.slice(2)) if (Number.isSafeInteger(local[key])) local[key] -= row.start;
    const image = Object.freeze({url: row.url, codec: row.codec, byteLength: row.byteLength});
    return {source: row.source, factory, image, index: {assets: new Map([[row.id, local]]), blocks: [local],
      references: Object.assign(Object.create(null), {[row.id]: {href: row.url, title: row.title}}),
      duplicateLabels: new Set(), appendixStart: 0}};
  });
  return index;
}

export function projectImageDefinitions(source, index) {
  const records = [], parts = [];
  let at = 0, length = 0;
  for (const row of index.blocks) {
    if (!Number.isSafeInteger(row.payloadStart) || !Number.isSafeInteger(row.payloadEnd) || row.payloadStart < at) continue;
    const text = source.slice(at, row.payloadStart);
    parts.push(text, 'AA=='); length += text.length;
    records.push({start: length, end: length + 4, id: row.id, codec: row.codec,
      payload: source.slice(row.payloadStart, row.payloadEnd), url: row.url});
    length += 4; at = row.payloadEnd;
  }
  parts.push(source.slice(at));
  const references = Object.create(null);
  for (const [label, definition] of Object.entries(index.references)) {
    const image = index.assets.get(label);
    references[label] = {href: image?.url === definition.href ? 'data:' + image.codec + ';base64,AA==' : definition.href,
      title: definition.title};
  }
  return {source: records.length ? parts.join('') : source, records, references};
}

export function blockwiseAssets(source, rows, parse = raw => parseAssets(raw), bodyOffset = markdownBodyOffset(source)) {
  if (typeof source !== 'string' || !Array.isArray(rows)) return null;
  const blocks = [], references = Object.create(null), duplicateLabels = new Set(), seen = new Set(), assets = new Map();
  let cursor = bodyOffset;
  for (const row of rows) {
    const raw = String(row.raw || ''), start = row.start;
    if (!(start >= cursor) || source.slice(cursor, start).includes(']:') || source.slice(start, start + raw.length) !== raw) return null;
    cursor = start + raw.length;
    if (!raw.includes(']:')) continue;
    const index = parse(raw, row);
    const labels = Object.keys(index.references);
    for (const label of index.duplicateLabels) duplicateLabels.add(label);
    for (const label of labels) {
      if (seen.has(label)) duplicateLabels.add(label);
      if (!Object.hasOwn(references, label)) references[label] = index.references[label];
    }
    for (const block of index.blocks) {
      const active = block.active && !seen.has(block.id);
      const shifted = {...block, start: block.start + start, end: block.end + start, status: 'unverified', active};
      for (const key of ['urlStart', 'urlEnd', 'payloadStart', 'payloadEnd']) if (block[key] != null) shifted[key] = block[key] + start;
      blocks.push(shifted);
      if (active) assets.set(block.id, shifted);
    }
    for (const label of labels) seen.add(label);
  }
  if (source.slice(cursor).includes(']:')) return null;
  if (assets.size > IMAGE_LIMITS.assets) for (const asset of assets.values()) asset.status = 'asset_count_limit';
  let appendixStart = source.length;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    if (!block.active || !block.topLevel || !/^[ \t\r\n]*$/.test(source.slice(block.end, appendixStart))) break;
    appendixStart = block.start;
  }
  return {assets, blocks, duplicateLabels, appendixStart, references};
}
export function imageEnvironment(source, factory) { return {references: Object.assign(Object.create(null), documentAssets(source, factory).references)}; }

function imageUses(source, factory, env = {}) {
  const parser = parserFor(factory), offset = markdownBodyOffset(source), starts = [offset], normalized = [0];
  let position = 0;
  for (let at = offset; at < source.length; at++, position++) {
    if (source[at] === '\r') { if (source[at + 1] === '\n') at++; }
    else if (source[at] !== '\n') continue;
    starts.push(at + 1); normalized.push(position + 1);
  }
  const originalOffset = at => {
    let low = 0, high = normalized.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (normalized[mid] <= at) low = mid; else high = mid;
    }
    return starts[low] + at - normalized[low];
  };
  const body = source.slice(offset).replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
  const tokens = parser.parse(body, env), urls = new Set(), images = [], html = [];
  const visit = rows => {
    for (const token of rows || []) {
      if (token.type === 'image') urls.add(token.attrGet('src'));
      if (token.type === 'link_open') urls.add(token.attrGet('href'));
      if (token.type === 'html_inline' || token.type === 'html_block') html.push(parser.utils.unescapeAll(token.content));
      if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index], map = token.map || tokens[index - 1]?.map;
    if (token.type !== 'inline' || !map) continue;
    const groups = new Map();
    for (const image of token.children || []) {
      const meta = image.type === 'image' && image.meta?.mdImage;
      if (!meta?.source) continue;
      if (!groups.has(meta.source)) groups.set(meta.source, []);
      groups.get(meta.source).push({id: meta.reference, url: image.attrGet('src')});
    }
    const start = normalized[map[0]], end = normalized[map[1]] ?? body.length;
    if (!Number.isSafeInteger(start) || end <= start) continue;
    for (const [raw, rows] of groups) {
      const found = [];
      for (let at = body.indexOf(raw, start); at >= 0 && at + raw.length <= end; at = body.indexOf(raw, at + raw.length)) found.push(at);
      if (found.length !== rows.length) continue;
      found.forEach((at, index) => images.push({...rows[index], start: originalOffset(at), end: originalOffset(at + raw.length)}));
    }
  }
  const simple = tokens.length === 3 && tokens[1].type === 'inline' && tokens[1].level === 1 &&
    images.length === (tokens[1].children || []).filter(row => row.type === 'image').length;
  return {urls, images, simple, html: html.join('\n').toUpperCase()};
}

export function referenceOccurs(source, id, factory) {
  try { return imageUses(source, factory).images.some(image => image.id === id); }
  catch (_) { return true; }
}

function occurrenceChange(image, splices) {
  let {start, end} = image, changed = false;
  for (const row of splices) {
    const stop = row.pos + row.removed.length;
    if (row.pos <= start && stop >= end && stop > row.pos) return true;
    const shift = row.inserted.length - row.removed.length;
    if (stop <= start) { start += shift; end += shift; continue; }
    if (row.pos > end || row.pos === end && row.removed.length) continue;
    if (row.pos < start || stop > end) return null;
    changed = true; end += shift;
  }
  return changed ? {start, end} : null;
}

export function mayRetireImageDefinitions(source, splices, factory, hint) {
  const store = typeof source === 'string' ? null : source;
  if (store ? !store.contains(']:') || !store.contains('data:image/', true)
    : !source.includes(']:') || !/data:image\//i.test(source)) return false;
  const original = (at, right, count) => {
    for (let index = count - 1; index >= 0; index--) {
      const row = splices[index], end = row.pos + row.inserted.length;
      if (at >= end) at += row.removed.length - row.inserted.length;
      else if (at > row.pos) at = row.pos + (right ? row.removed.length : 0);
    }
    return at;
  };
  const possible = splices.some((row, index) => {
    if (!row.removed && !row.inserted) return false;
    const start = original(row.pos, false, index), end = original(row.pos + row.removed.length, true, index);
    if (store) {
      if (!store.contains('![')) return false;
      const from = Math.max(0, start - 8192);
      const local = store.readSlice(from, Math.min(store.length, end + 4));
      const image = local.lastIndexOf('![', end - from);
      const separator = Math.max(local.lastIndexOf('\n\n', start - from),
        local.lastIndexOf('\r\n\r\n', start - from), local.lastIndexOf('\r\r', start - from));
      if (image >= 0) return image + from >= start || separator < image;
      const exclude = left => {
        if (hint && splices.length === 1) hint.excluded = {start: left, end};
        return false;
      };
      if (separator >= 0 || from === 0) return exclude(separator >= 0 ? from + separator + 4 : 0);
      let cursor = from;
      while (cursor > 0) {
        const sliceFrom = Math.max(0, cursor - 8192);
        const chunk = store.readSlice(sliceFrom, Math.min(store.length, cursor + 3));
        const limit = cursor - sliceFrom;
        const sep = Math.max(chunk.lastIndexOf('\n\n', limit), chunk.lastIndexOf('\r\n\r\n', limit),
          chunk.lastIndexOf('\r\r', limit));
        const imageAt = chunk.lastIndexOf('![', limit);
        if (imageAt >= 0 && (sep < 0 || imageAt > sep)) return true;
        if (sep >= 0 || sliceFrom === 0) return exclude(sep >= 0 ? sliceFrom + sep + 4 : 0);
        cursor = sliceFrom;
      }
      return false;
    }
    const image = source.lastIndexOf('![', end);
    return image >= 0 && (image >= start || Math.max(source.lastIndexOf('\n\n', start),
      source.lastIndexOf('\r\n\r\n', start), source.lastIndexOf('\r\r', start)) < image);
  });
  if (store) return possible && mayRetireImageDefinitions(store.read(), splices, factory);
  if (!possible || splices.length !== 1) return possible;
  const row = splices[0];
  if (row.removed.includes('![') || /[\r\n]/.test(row.removed) || /[\r\n]/.test(row.inserted)) return true;
  const start = row.pos ? Math.max(source.lastIndexOf('\n', row.pos - 1), source.lastIndexOf('\r', row.pos - 1)) + 1 : 0;
  let end = source.length;
  for (const eol of ['\r', '\n']) { const at = source.indexOf(eol, row.pos); if (at >= 0) end = Math.min(end, at); }
  if (end - start > 8192 || row.pos + row.removed.length > end ||
      start !== markdownBodyOffset(source) && !/(?:\n\n|\r\n\r\n|\r\r)$/.test(source.slice(Math.max(0, start - 4), start)) ||
      end !== source.length && !/^(?:\n\n|\r\n\r\n|\r\r)/.test(source.slice(end, end + 4))) return true;
  try {
    const local = imageUses(source.slice(start, end), factory, imageEnvironment(source, factory));
    return !local.simple || local.images.some(image => occurrenceChange({...image,
      start: start + image.start, end: start + image.end}, splices));
  } catch (_) { return true; }
}

export function retireDeletedImageDefinitions(before, after, splices, factory) {
  if (before === after || !mayRetireImageDefinitions(before, splices, factory)) return [];
  try {
    const prior = documentAssets(before, factory), current = documentAssets(after, factory);
    if (!prior.assets.size || !current.assets.size) return [];
    const changes = imageUses(before, factory).images.filter(image => image.id)
      .map(image => ({image, change: occurrenceChange(image, splices)})).filter(row => row.change);
    if (!changes.length) return [];
    const now = imageUses(after, factory);
    const deleted = new Set(changes.filter(({image, change}) => change === true || now.images.some(row =>
      row.start === change.start && row.end === change.end && row.url !== image.url)).map(row => row.image.id));
    if (!deleted.size) return [];
    let remaining = '', at = 0;
    for (const row of current.blocks) { remaining += after.slice(at, row.start); at = row.end; }
    remaining = normalizeLabel(remaining + after.slice(at)).replace(/\[\s+/g, '[');
    const retired = current.blocks.filter(row => {
      const old = prior.assets.get(row.id);
      return deleted.has(row.id) && row.active && row.topLevel && old?.topLevel &&
        row.status === 'unverified' && old.source === row.source && !now.urls.has(row.url) &&
        !prior.duplicateLabels.has(row.id) && !current.duplicateLabels.has(row.id) &&
        !remaining.includes('[' + row.id) && !now.html.includes(row.id) && !now.html.includes(row.url.toUpperCase());
    });
    return retired.sort((a, b) => b.start - a.start).map(row => {
      const gap = /(?:\r\n\r\n|\n\n|\r\r)$/.exec(after.slice(Math.max(0, row.start - 4), row.start));
      let tail = after.slice(row.end);
      const last = /^(?:\r\n|\n|\r)?$/.test(tail);
      for (const other of retired) if (other.start >= row.end) tail = tail.replace(other.source, '');
      const whole = gap && !/\S/.test(tail) && row.start - gap[0].length > markdownBodyOffset(after);
      return whole ? {pos: row.start - gap[0].length, removed: gap[0] + row.source + (last ? after.slice(row.end) : ''), inserted: ''} : {pos: row.start, removed: row.source, inserted: ''};
    });
  } catch (_) { return []; }
}

const omissionCache = new WeakMap();
function payloadFacts(text) {
  let bad = 0, equals = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code === 61) equals++;
    else if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) bad++;
  }
  return {bad, equals};
}
function payloadBytes(length, bad, equals, tail) {
  return length % 4 === 0 && !bad && equals <= 2 && length > equals && tail === '='.repeat(equals)
    ? length / 4 * 3 - equals : null;
}
function previousOmissions(view, kind) {
  const changes = [];
  let cursor = view, held;
  while (!(held = omissionCache.get(cursor)?.[kind])) {
    const after = cursor, change = sourceEdit(cursor);
    if (!change || changes.length === 64 || !(cursor = change.before.deref())) return new Map();
    changes.push({...change, after});
  }
  let rows = [...held.values()];
  for (const change of changes.reverse()) {
    const end = change.pos + change.removed, delta = change.inserted - change.removed;
    rows = rows.flatMap(row => {
      const permitted = kind === 'asset' ? /^[A-Za-z0-9+/=\\;&%#._~-]*$/
        : row.profile === 'base64' ? /^[A-Za-z0-9+/=\s]*$/ : /^[A-Za-z0-9\-._~!$&*+;=:@/?%]*$/;
      if (change.pos >= row.payloadStart && end <= row.end && permitted.test(change.text)) {
        const next = {...row, end: row.end + delta, chars: row.chars + delta};
        if (kind === 'asset') {
          const was = payloadFacts(change.before.deref().slice(change.pos, end)), now = payloadFacts(change.text);
          next.bad += now.bad - was.bad; next.equals += now.equals - was.equals;
          next.bytes = payloadBytes(next.end - next.payloadStart, next.bad, next.equals,
            next.equals <= 2 ? change.after.slice(next.end - next.equals, next.end) : '');
        }
        return [next];
      }
      if (change.pos > row.end) return [row];
      if (end < row.start) return [{...row, start: row.start + delta, end: row.end + delta,
        ...(row.payloadStart === undefined ? {} : {payloadStart: row.payloadStart + delta})}];
      return [];
    });
  }
  return new Map(rows.map(row => [row.start, row]));
}
function dataMatches(source, kind, envelopes = []) {
  const measured = sourceFacts(source), view = sourceView(source), cached = omissionCache.get(view);
  if (cached?.[kind]) return cached[kind];
  const prior = previousOmissions(view, kind), rows = new Map();
  const pattern = kind === 'asset' ? /data:(image\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=\\;&%#._~-]*/iy
    : /data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)(?:;[^,\s"'<>)]*)?,/iy;
  let end = 0, envelopeIndex = 0;
  for (const at of measured.markers) {
    if (kind === 'asset' && at < end) continue;
    while (envelopeIndex < envelopes.length && envelopes[envelopeIndex].end <= at) envelopeIndex++;
    if (envelopes[envelopeIndex]?.start <= at) continue;
    let row = prior.get(at);
    if (!row) {
      pattern.lastIndex = at;
      const match = pattern.exec(source);
      if (!match) continue;
      if (kind === 'asset') {
        const value = match[0], payload = value.slice(value.indexOf(',') + 1);
        const {bad, equals} = payloadFacts(payload);
        const bytes = payloadBytes(payload.length, bad, equals, equals <= 2 ? payload.slice(payload.length - equals) : '');
        row = {start: at, end: pattern.lastIndex, chars: value.length,
          domain: 'image_bytes', reason: 'embedded_asset', profile: 'embedded', type: match[1].toLowerCase(), bytes,
          payloadStart: pattern.lastIndex - payload.length, bad, equals};
      } else {
        const payloadStart = pattern.lastIndex, base64 = /;base64,/i.test(match[0]);
        let to = payloadStart;
        const permitted = base64 ? /[A-Za-z0-9+/=\s]/ : /[A-Za-z0-9\-._~!$&*+;=:@/?%]/;
        while (to < source.length && permitted.test(source[to])) to++;
        row = {start: at, end: to, payloadStart, type: match[1], chars: to - at, profile: base64 ? 'base64' : 'data'};
      }
      Object.freeze(row);
    }
    rows.set(at, row); end = row.end;
  }
  omissionCache.set(view, {...cached, [kind]: rows});
  return rows;
}
export function assetOmissions(source) {
  if (typeof source !== 'string') return [];
  return [...dataMatches(source, 'asset').values()].map(({payloadStart, bad, equals, ...row}) => row);
}

export function dataOmissions(source) {
  const envelopes = assetOmissions(source), spans = [...envelopes];
  let envelopeIndex = 0, end = 0;
  for (const row of dataMatches(source, 'generic', envelopes).values()) {
    if (row.start < end) continue;
    while (envelopeIndex < envelopes.length && envelopes[envelopeIndex].end <= row.start) envelopeIndex++;
    const envelope = envelopes[envelopeIndex];
    if (envelope && envelope.start <= row.start) { end = envelope.end; continue; }
    const {payloadStart, ...span} = row;
    if (row.end > payloadStart) spans.push(span);
    end = row.end;
  }
  return spans.sort((a, b) => a.start - b.start);
}
export function isAssetBlock(raw) {
  if (isWordSidecarBlock(raw)) return true;
  if (typeof raw !== 'string' || !/data:image\//i.test(raw)) return false;
  const parsed = parseAssets(raw);
  if (!parsed.blocks.length) return false;
  let at = 0;
  for (const block of parsed.blocks) {
    if (!block.active || !block.topLevel || !/^[ \t\r\n]*$/.test(raw.slice(at, block.start))) return false;
    at = block.end;
  }
  return /^[ \t\r\n]*$/.test(raw.slice(at));
}

export function escapeImageAlt(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ')
    .replace(/[\\[\]*_`~^+$=<&]/g, '\\$&').replace(/\|(?=[1-9]\d{1,3}$)/, '\\|');
}
export function serializeAsset(asset) {
  if (!asset || !/^[a-z0-9-]+$/i.test(asset.label) || !dataImage(asset.url)) return fail('image_metadata_invalid');
  const value = assetTitle(asset.title), title = value ? ' "' + value.replace(/&/g, '&amp;').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '';
  return '[' + asset.label + ']: ' + asset.url + title;
}
export function appendAssetText(source, asset, lineEnding, {preserveLabel = false} = {}) {
  if (typeof source !== 'string' || !asset || normalizeLabel(asset.label) !== asset.id) return fail('image_source_invalid');
  const parsed = documentAssets(source), title = assetTitle(asset.title);
  const existing = !preserveLabel && [...parsed.assets.values()].find(row => row.url === asset.url && row.title === title);
  if (existing) return {source, id: existing.id, reference: existing.label, added: false, suffix: ''};
  const previous = parsed.references[asset.id];
  const block = serializeAsset(asset);
  if (previous) {
    if (previous.href !== asset.url || (previous.title || '') !== title) return fail('image_label_conflict');
    return {source, id: asset.id, reference: asset.label, added: false, suffix: ''};
  }
  if (parsed.assets.size >= IMAGE_LIMITS.assets) return fail('image_asset_count_limit');
  const eol = lineEnding || /\r\n|\n|\r/.exec(source)?.[0] || '\n', tail = /(?:\r\n?|\n)[ \t]*$/.exec(source);
  const separator = !source || tail && /[\r\n][ \t]*$/.test(source.slice(0, tail.index)) ? '' : tail ? eol : eol + eol;
  const suffix = separator + block + eol, nextSource = source + suffix;
  if (nextSource.length > IMAGE_LIMITS.sourceChars) return fail('image_source_limit');
  if (documentAssets(nextSource).references[asset.id]?.href !== asset.url) return fail('image_appendix_not_available');
  return {source: nextSource, id: asset.id, reference: asset.label, added: true, suffix};
}
export async function appendAsset(source, asset) { return appendAssetText(source, asset); }
