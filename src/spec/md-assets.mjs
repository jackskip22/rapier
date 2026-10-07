// SPDX-License-Identifier: MIT
// Pure text and markdown-it tokens: no DOM, no byte decoding, no globalThis.Rapier* (MIT kit; decoders stay in images/assets.mjs).

export const IMAGE_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, sourceChars: 25 * 1024 * 1024, dimension: 16384, pixels: 24000000, assets: 1024});
const parsers = new WeakMap();
const cached = [];
let configured = null, splitSource = null;
export function configureParser(parser, split) { configured = parser; splitSource = split; cached.length = 0; }
function fail(reason) { throw new Error(reason); }
export const normalizeLabel = label => String(label).trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
// New titles have one identity before hashing, serializing or matching a repeated append.
// Existing document bytes are never rewritten; CommonMark entity decoding must not change a title.
export const assetTitle = value => String(value || '').replace(/[\r\n]/g, ' ').replace(/\0/g, '\ufffd');

// The same hook runs in the editor, its parse worker and the agent's parser.
export function installMarkdownImages(md) {
  if (md.__rapierImagesInstalled) return md;
  md.__rapierImagesInstalled = true;
  const validate = md.validateLink;
  md.validateLink = url => /^data:image\/(?:jxl|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i.test(url) || validate(url);
  const reference = md.block.ruler.__rules__.find(row => row.name === 'reference').fn;
  md.block.ruler.at('reference', (state, start, end, silent) => {
    if (silent) return reference(state, start, end, silent);
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
    const close = state.md.helpers.parseLinkLabel(state, start + 1, false);
    const before = state.tokens.length;
    if (!image(state, silent)) return false;
    if (!silent && state.tokens.length > before) {
      const token = state.tokens[state.tokens.length - 1], source = state.src.slice(start, state.pos);
      if (token.type === 'image') {
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

export function dataImage(url) {
  if (typeof url !== 'string' || url.length > IMAGE_LIMITS.sourceChars) return null;
  const match = /^data:(image\/(?:jxl|png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
  if (!match || match[2].length % 4) return null;
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const byteLength = match[2].length / 4 * 3 - padding;
  if (!byteLength || byteLength > IMAGE_LIMITS.bytes) return null;
  return {codec: match[1].toLowerCase(), byteLength, payloadStart: match[0].length - match[2].length};
}

// Markdown-it owns recognition, nesting, duplicate precedence and escapes; block parse only.
export function parseAssets(source, factory = configured || globalThis.markdownit, bodyOffset = 0) {
  if (typeof source !== 'string') return fail('image_source_invalid');
  if (source.length > IMAGE_LIMITS.sourceChars) return fail('image_source_limit');
  if (!source.includes(']:')) return {assets: new Map(), blocks: [], duplicateLabels: new Set(), appendixStart: source.length, references: Object.create(null)};
  const prior = cached.find(row => row.source === source && row.factory === factory && row.bodyOffset === bodyOffset);
  if (prior) return prior.index;
  const parser = parserFor(factory), env = {}, tokens = [];
  const starts = [bodyOffset];
  for (let at = bodyOffset; at < source.length; at++) {
    if (source[at] === '\r') { if (source[at + 1] === '\n') at++; starts.push(at + 1); }
    else if (source[at] === '\n') starts.push(at + 1);
  }
  parser.block.parse(source.slice(bodyOffset).replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd'), parser, env, tokens);
  const references = env.references || Object.create(null), assets = new Map(), blocks = [], seen = new Set(), duplicateLabels = new Set();
  for (const token of tokens) {
    if (token.type !== 'reference_definition' || !token.map) continue;
    const id = token.meta.label, definition = token.meta.mdImageDefinition, first = !seen.has(id);
    if (!first) duplicateLabels.add(id);
    seen.add(id);
    const info = dataImage(definition?.href);
    if (!info) continue;
    const start = starts[token.map[0]], stop = starts[token.map[1]] ?? source.length;
    let end = stop;
    if (source[end - 1] === '\n') end--;
    if (source[end - 1] === '\r') end--;
    // Repeated definitions are source, not additional image owners.
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

// Project only parser-recognized payload spans. Their ordinary data URL remains a data URL,
// with every source newline intact; the parser never needs megabytes of picture bytes.
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
    const image = dataImage(definition.href);
    references[label] = {href: image ? definition.href.slice(0, image.payloadStart) + 'AA==' : definition.href,
      title: definition.title};
  }
  return {source: records.length ? parts.join('') : source, records, references};
}

// The same index folded from the document's top-level blocks: `rows` are the blocks as markdown-it's block parse
// of the body cuts them, each {start, raw} with `start` absolute in `source`, and `parse(raw, row)` is parseAssets
// over one block (the caller may cache it by the row). A definition the whole parse finds is one a block's own parse
// finds at the block's place, because a top-level block's lines parse the same alone as in the document; labels,
// duplicates, the first definition's precedence, the count limit and the appendix fold as parseAssets folds them.
// Null when the rows are not this source: a block's bytes elsewhere than its start, rows out of order or overlapping,
// or text that could hold a definition (`]:`) between the body's start, the rows and the end, where no row parses
// it. Positions are the source's own, never normalized.
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
    // Every label the block defines, picture or not: an earlier definition of a label, of any kind, is the one
    // the document resolves, so a later picture under it is inactive and the label a duplicate.
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
      // Repeated text in code or an unmapped container is not deletion proof.
      if (found.length !== rows.length) continue;
      found.forEach((at, index) => images.push({...rows[index], start: originalOffset(at), end: originalOffset(at + raw.length)}));
    }
  }
  const simple = tokens.length === 3 && tokens[1].type === 'inline' && tokens[1].level === 1 &&
    images.length === (tokens[1].children || []).filter(row => row.type === 'image').length;
  return {urls, images, simple, html: html.join('\n').toUpperCase()};
}

// A parse failure answers true: uncertainty keeps the definition.
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

// A permissive gate keeps ordinary typing out of full-document image parsing.
// Recognition and retirement proof still belong to Markdown-it below.
export function mayRetireImageDefinitions(source, splices, factory) {
  if (!/data:image\//i.test(source)) return false;
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
    const image = source.lastIndexOf('![', end);
    return image >= 0 && (image >= start || Math.max(source.lastIndexOf('\n\n', start),
      source.lastIndexOf('\r\n\r\n', start), source.lastIndexOf('\r\r', start)) < image);
  });
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

// Whole deletion or a valid replacement at the rebased occurrence may retire
// bytes. Unfinished source edits and pre-existing unused definitions do not.
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
    return current.blocks.filter(row => {
      const old = prior.assets.get(row.id);
      return deleted.has(row.id) && row.active && row.topLevel && old?.topLevel &&
        row.status === 'unverified' && old.source === row.source && !now.urls.has(row.url) &&
        !prior.duplicateLabels.has(row.id) && !current.duplicateLabels.has(row.id) &&
        !remaining.includes('[' + row.id) && !now.html.includes(row.id) && !now.html.includes(row.url.toUpperCase());
    }).sort((a, b) => b.start - a.start).map(row => ({pos: row.start, removed: row.source, inserted: ''}));
  } catch (_) { return []; }
}

// Disclosure stays conservative even for code examples and malformed definitions.
// Keep labels and readable prose; omit only the binary destination.
export function assetOmissions(source) {
  if (typeof source !== 'string') return [];
  const pattern = /data:(image\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=\\;&%#._~-]*/ig, spans = [];
  for (let match; (match = pattern.exec(source));) {
    const value = match[0], payload = value.slice(value.indexOf(',') + 1);
    const bytes = payload.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(payload)
      ? payload.length / 4 * 3 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0) : null;
    spans.push({start: match.index, end: pattern.lastIndex, chars: value.length,
      domain: 'image_bytes', reason: 'embedded_asset', profile: 'embedded', type: match[1].toLowerCase(), bytes});
  }
  return spans;
}
export function isAssetBlock(raw) {
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

// Mirrors engine.js _rapierEscapeImageAlt without importing the editor bundle.
export function escapeImageAlt(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ')
    .replace(/[\\[\]*_`~^+$=<&]/g, '\\$&').replace(/\|(?=[1-9]\d{1,3}$)/, '\\|');
}
export function serializeAsset(asset) {
  if (!asset || !/^[a-z0-9-]+$/i.test(asset.label) || !dataImage(asset.url)) return fail('image_metadata_invalid');
  const value = assetTitle(asset.title), title = value ? ' "' + value.replace(/&/g, '&amp;').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '';
  return '[' + asset.label + ']: ' + asset.url + title;
}
// Pure: re-derived at commit against the moved document; appends only at the text's end.
// A replay supplies the retained definition's line ending instead of choosing one from later prose.
export function appendAssetText(source, asset, lineEnding) {
  if (typeof source !== 'string' || !asset || normalizeLabel(asset.label) !== asset.id) return fail('image_source_invalid');
  const parsed = documentAssets(source), title = assetTitle(asset.title);
  const existing = [...parsed.assets.values()].find(row => row.url === asset.url && row.title === title);
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
