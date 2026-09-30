// SPDX-License-Identifier: AGPL-3.0-only

import {fields, parseLayout, formatLayout, validLayout, decodeLayoutAttribute, parseLayoutAttribute, imageStyle, wrapTextBlock, wrapNeighbour, wrapColumnFloor} from '../spec/md-layout.mjs';

export {parseLayout, formatLayout, decodeLayoutAttribute, parseLayoutAttribute, imageStyle, wrapTextBlock, wrapNeighbour, wrapColumnFloor};

const installed = new WeakSet();
const horizontal = /^[ \t]*$/;
const family = /^<!--[ \t]*md-layout(?=[: \t\r\n-]|$)/i;

function validTargetLayout(value, imageOnly) {
  // `rotate` and `opacity` join width/wrap/x/y as picture-only (F75-11): text has no turn or fade to carry.
  return validLayout(value) && (imageOnly ? value.align !== 'justify' :
    !['width', 'wrap', 'x', 'y', 'rotate', 'opacity'].some(key => Object.hasOwn(value, key)));
}

const whitespaceToken = token => token.type === 'text' && !token.content.trim();

function malformedText(inline) {
  if (!(inline.children || []).some(token => token.type === 'text' && /<!--[ \t]*md-layout(?=[: \t-]|$)/i.test(token.content))) return false;
  // Escaped '<' and entity spellings remain ordinary visible text. Code spans
  // never enter this check because only text tokens nominate a malformed tail.
  const source = inline.content || '', pattern = /<!--[ \t]*md-layout(?=[: \t-]|$)/ig;
  for (let match; (match = pattern.exec(source));) {
    let slashes = 0;
    for (let at = match.index - 1; at >= 0 && source[at] === '\\'; at--) slashes++;
    if (!(slashes & 1) && !(inline.children || []).some(token =>
      token.type === 'html_inline' && source.startsWith(token.content, match.index))) return true;
  }
  return false;
}

function inspectInline(inline, paragraph) {
  const children = inline.children || [];
  const candidates = children.filter(token => token.type === 'html_inline' && family.test(token.content));
  let tail = children.length - 1;
  while (tail >= 0 && whitespaceToken(children[tail])) tail--;
  const markerToken = candidates.length === 1 ? candidates[0] : null;
  const marker = markerToken?.content || '';
  const parsed = marker ? parseLayout(marker) : null;
  let reason;
  if (candidates.length > 1) reason = 'duplicate_layout';
  else if (markerToken && !parsed) reason = 'invalid_layout';
  else if (markerToken && (children[tail] !== markerToken || !inline.content.trimEnd().endsWith(marker))) reason = 'non_tail_layout';
  else if (malformedText(inline)) reason = 'malformed_layout';
  const visible = children.filter(token => token !== markerToken && !whitespaceToken(token) && token.type !== 'softbreak');
  const images = visible.filter(token => token.type === 'image');
  const imageOnly = paragraph && images.length === 1 && (visible.length === 1 ||
    visible.length === 3 && visible[0].type === 'link_open' && visible[1].type === 'image' && visible[2].type === 'link_close');
  if (!reason && parsed && !validTargetLayout(parsed, imageOnly)) {
    reason = imageOnly ? 'invalid_image_alignment' : 'image_layout_on_prose';
  }
  return {layout: !reason && parsed ? parsed : {}, marker, markerToken, imageOnly, image: imageOnly ? images[0] : null, reason};
}

function lineStarts(source) {
  const starts = [0];
  for (let at = source.indexOf('\n'); at >= 0; at = source.indexOf('\n', at + 1)) starts.push(at + 1);
  return starts;
}

function sourceTarget(source, starts, opener, inline, info) {
  const map = opener.map || inline.map;
  if (!Array.isArray(map) || map.length < 2 || !Number.isSafeInteger(map[0]) || !Number.isSafeInteger(map[1]) ||
      map[0] < 0 || map[1] <= map[0] || map[0] >= starts.length || map[1] > starts.length) return null;
  const start = starts[map[0]], stop = starts[map[1]] ?? source.length;
  const end = stop > start && source[stop - 1] === '\n' ? stop - 1 : stop;
  const setext = opener.type === 'heading_open' && (opener.markup === '=' || opener.markup === '-');
  const line = map[1] - (setext ? 2 : 1);
  const result = {start, end, insert: null, marker: null, layout: info.layout, imageOnly: info.imageOnly, level: opener.level,
    kind: opener.type === 'heading_open' ? 'heading' : 'paragraph'};
  if (info.reason) result.reason = info.reason;
  if (line < map[0] || starts[line] === undefined) return {...result, reason: result.reason || 'unmapped_layout_tail'};
  const lineStart = starts[line], lineStop = starts[line + 1] ?? source.length;
  const raw = source.slice(lineStart, source[lineStop - 1] === '\n' ? lineStop - 1 : lineStop);
  const last = inline.content.slice(inline.content.lastIndexOf('\n') + 1).trim();
  const atx = opener.type === 'heading_open' && /^#{1,6}$/.test(opener.markup);
  let position = -1;
  if (last) {
    // Limit ATX matching to authored heading content: a visible '#' must never
    // accidentally match the optional closing hash run later on the same line.
    const closing = atx ? /[ \t]+#+[ \t]*$/.exec(raw) : null;
    const content = closing ? raw.slice(0, closing.index) : raw;
    const found = content.lastIndexOf(last);
    if (found >= 0) {
      if (horizontal.test(content.slice(found + last.length))) position = found + last.length;
    }
  } else if (atx) {
    // Empty ATX headings still have an exact insertion seam after the opener.
    for (let at = raw.indexOf(opener.markup); at >= 0; at = raw.indexOf(opener.markup, at + 1)) {
      const after = at + opener.markup.length;
      if (raw[at - 1] === '#' || raw[after] === '#') continue;
      if (/^(?:[ \t]+#+)?[ \t]*$/.test(raw.slice(after))) { position = after; break; }
    }
  }
  if (position < 0) return {...result, reason: result.reason || 'unmapped_layout_tail'};
  result.insert = lineStart + position;
  if (info.marker && !info.reason) {
    const markerStart = result.insert - info.marker.length;
    if (markerStart < lineStart || source.slice(markerStart, result.insert) !== info.marker) {
      result.reason = 'unmapped_layout_tail';
      return result;
    }
    result.marker = {start: markerStart, end: result.insert, text: info.marker};
  }
  return result;
}

/** Annotate existing Markdown tokens; consumers may reuse this after bounded parsing. */
export function annotateMarkdownLayout(state) {
  const tokens = state.tokens || [], source = typeof state.src === 'string' ? state.src : '';
  let starts;
  for (let index = 1; index < tokens.length; index++) {
    const inline = tokens[index], opener = tokens[index - 1];
    if (inline.type !== 'inline' || !Array.isArray(inline.children) ||
        (opener.type !== 'paragraph_open' && opener.type !== 'heading_open')) continue;
    const info = inspectInline(inline, opener.type === 'paragraph_open');
    starts ||= lineStarts(source);
    const target = sourceTarget(source, starts, opener, inline, info);
    inline.meta ||= {};
    if (target) inline.meta.mdLayoutSource = target;
    // A layout comment that is ignored says why, so the agent door can count it (a comment written without its units is
    // otherwise silently plain text: the lane of 26 September, walked as the agent).
    if (info.marker && (info.reason || target?.reason)) inline.meta.mdLayoutFault = {reason: info.reason || target.reason, marker: info.marker};
    if (info.reason || target?.reason || !target || !info.marker) continue;
    const tight = opener.type === 'paragraph_open' && !!opener.hidden;
    const meta = {layout: info.layout, marker: info.marker, imageOnly: info.imageOnly, tight};
    (opener.meta ||= {}).mdLayout = meta;
    inline.meta.mdLayout = meta;
    if (info.image) (info.image.meta ||= {}).mdLayout = meta;
    opener.attrSet('data-md-layout', encodeURIComponent(info.marker));
    if (info.layout.align) opener.attrSet('data-md-align', info.layout.align);
    if (tight) {
      // A paragraph owns its own alignment; the enclosing li also owns children.
      opener.hidden = false;
      const closer = tokens[index + 1];
      if (closer?.type === 'paragraph_close') closer.hidden = false;
      opener.attrSet('data-md-layout-tight', '');
    }
  }
  return state;
}

export function installMarkdownLayout(md) {
  if (!md?.core?.ruler || typeof md.parse !== 'function') throw new TypeError('markdown_parser_required');
  if (!installed.has(md)) {
    // Capture original task/footnote prose before later core plugins rewrite it.
    md.core.ruler.after('inline', 'md_layout', annotateMarkdownLayout);
    installed.add(md);
  }
  return md;
}

function originalOffsetMap(source) {
  if (!source.includes('\r')) return offset => offset;
  const normalized = [0], original = [0];
  let normalizedAt = 0;
  for (let at = 0; at < source.length; at++) {
    normalizedAt++;
    if (source[at] === '\r') {
      if (source[at + 1] === '\n') at++;
    } else if (source[at] !== '\n') continue;
    normalized.push(normalizedAt);
    original.push(at + 1);
  }
  return offset => {
    let low = 0, high = normalized.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (normalized[mid] <= offset) low = mid;
      else high = mid;
    }
    return original[low] + offset - normalized[low];
  };
}

/** Exact original UTF-16 source ranges. A reason means the target is preserved, never edited. */
export function layoutTargets(source, parser, env = {}) {
  if (typeof source !== 'string') throw new TypeError('markdown_source_required');
  installMarkdownLayout(parser);
  const tokens = parser.parse(source, env), offset = originalOffsetMap(source), targets = [];
  for (const token of tokens) {
    const target = token.type === 'inline' && token.meta?.mdLayoutSource;
    if (!target) continue;
    const item = {...target, start: offset(target.start), end: offset(target.end),
      insert: target.insert === null ? null : offset(target.insert), layout: {...target.layout}};
    if (target.marker) {
      item.marker = {...target.marker, start: offset(target.marker.start), end: offset(target.marker.end)};
      if (source.slice(item.marker.start, item.marker.end) !== item.marker.text) item.reason = 'unmapped_layout_tail';
    }
    targets.push(item);
  }
  return targets.sort((left, right) => left.start - right.start || left.end - right.end);
}

/** All selected prose changes are returned together; the caller owns the one transaction. `patch` is one object of fields for every
 * target, or a function (target, source) giving each target its own: a caller whose answer depends on the paragraph (Left, which
 * writes nothing on a left-to-right one) resolves it there. */
export function editLayout(source, parser, range, patch, env = {}) {
  if (typeof source !== 'string' || !range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
      range.start < 0 || range.end < range.start || range.end > source.length) return {edits: [], targets: [], reason: 'invalid_layout_range'};
  const wellFormed = change => !!change && typeof change === 'object' && !Array.isArray(change) && Object.keys(change).every(key => fields.has(key));
  if (typeof patch !== 'function' && !wellFormed(patch)) return {edits: [], targets: [], reason: 'invalid_layout_patch'};
  const targets = layoutTargets(source, parser, env).filter(target => range.start === range.end ?
    target.start <= range.start && range.start <= target.end : target.start < range.end && target.end > range.start);
  if (!targets.length) return {edits: [], targets, reason: 'no_layout_target'};
  const blocked = targets.find(target => target.reason || target.insert === null);
  if (blocked) return {edits: [], targets, reason: blocked.reason || 'unmapped_layout_tail'};
  const edits = [];
  for (const target of targets) {
    const value = {...target.layout}, change = typeof patch === 'function' ? patch(target, source) : patch;
    if (!wellFormed(change)) return {edits: [], targets, reason: 'invalid_layout_patch'};
    for (const key of Object.keys(change)) {
      if (change[key] == null) delete value[key];
      else value[key] = change[key];
    }
    if (!validTargetLayout(value, target.imageOnly)) {
      return {edits: [], targets, reason: 'invalid_layout_patch'};
    }
    const text = formatLayout(value);
    if (target.marker) {
      if (target.marker.text === text) continue;
      let start = target.marker.start;
      // The conventional separator belongs to the annotation, not the prose.
      // Additional authored whitespace and hard breaks are left byte-for-byte.
      if (!text && source[start - 1] === ' ' && start > target.start && !/[ \t\r\n]/.test(source[start - 2] || '')) start--;
      edits.push({start, end: target.marker.end, text});
    } else if (text) {
      edits.push({start: target.insert, end: target.insert, text: ' ' + text});
    }
  }
  edits.sort((left, right) => right.start - left.start || right.end - left.end);
  for (let index = 1; index < edits.length; index++) {
    if (edits[index].end > edits[index - 1].start) return {edits: [], targets, reason: 'overlapping_layout_targets'};
  }
  return {edits, targets};
}
