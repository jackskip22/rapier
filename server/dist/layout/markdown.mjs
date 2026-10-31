// SPDX-License-Identifier: AGPL-3.0-only

import {fields, parseLayout, formatLayout, validLayout, decodeLayoutAttribute, parseLayoutAttribute, imageStyle, textStyle, textLayout, stepIndent, linesHeightCss, objectHeight, wrapTextBlock, wrapNeighbour, wrapColumnFloor} from '../spec/md-layout.mjs';
import {htmlFence} from '../spec/html-blocks.mjs';

export {parseLayout, formatLayout, decodeLayoutAttribute, parseLayoutAttribute, imageStyle, textStyle, textLayout, stepIndent, linesHeightCss, objectHeight, wrapTextBlock, wrapNeighbour, wrapColumnFloor};

const installed = new WeakSet();
const horizontal = /^[ \t]*$/;
const family = /^<!--[ \t]*md-layout(?=[: \t\r\n-]|$)/i;

function validTargetLayout(value, imageOnly, listMarker = false, paragraph = true) {
  return validLayout(value) && (!Object.hasOwn(value, 'marker') || listMarker) &&
    (imageOnly ? value.align !== 'justify' && !['first', 'indent', 'marker', 'hyphens', 'caps', 'hanging', 'line'].some(key => Object.hasOwn(value, key)) :
      !['width', 'wrap', 'x', 'y', 'rotate', 'opacity'].some(key => Object.hasOwn(value, key)) &&
      (paragraph || !['lines', 'hyphens', 'caps', 'hanging'].some(key => Object.hasOwn(value, key))));
}

const whitespaceToken = token => token.type === 'text' && !token.content.trim();

function malformedText(inline) {
  if ((inline.content || '').indexOf('<!--') < 0) return false;
  if (!(inline.children || []).some(token => token.type === 'text' && /<!--[ \t]*md-layout(?=[: \t-]|$)/i.test(token.content))) return false;
  const source = inline.content || '', pattern = /<!--[ \t]*md-layout(?=[: \t-]|$)/ig;
  for (let match; (match = pattern.exec(source));) {
    let slashes = 0;
    for (let at = match.index - 1; at >= 0 && source[at] === '\\'; at--) slashes++;
    if (!(slashes & 1) && !(inline.children || []).some(token =>
      token.type === 'html_inline' && source.startsWith(token.content, match.index))) return true;
  }
  return false;
}

function inspectInline(inline, paragraph, listMarker) {
  const children = inline.children || [];
  let candidates = 0, markerToken = null;
  for (const token of children) {
    if (token.type === 'html_inline' && family.test(token.content)) { candidates++; markerToken = token; }
  }
  if (candidates !== 1) markerToken = null;
  let tail = children.length - 1;
  while (tail >= 0 && whitespaceToken(children[tail])) tail--;
  const marker = markerToken?.content || '';
  const parsed = marker ? parseLayout(marker) : null;
  let reason;
  if (candidates > 1) reason = 'duplicate_layout';
  else if (markerToken && !parsed) reason = 'invalid_layout';
  else if (markerToken && (children[tail] !== markerToken || !inline.content.trimEnd().endsWith(marker))) reason = 'non_tail_layout';
  else if (malformedText(inline)) reason = 'malformed_layout';
  let visibleCount = 0, imageCount = 0, image = null;
  const first = [];
  for (const token of children) {
    if (token === markerToken || token.type === 'softbreak' || whitespaceToken(token)) continue;
    if (visibleCount++ < 3) first.push(token);
    if (token.type === 'image' && !imageCount++) image = token;
  }
  const imageOnly = paragraph && imageCount === 1 && (visibleCount === 1 ||
    visibleCount === 3 && first[0].type === 'link_open' && first[1].type === 'image' && first[2].type === 'link_close');
  if (!reason && parsed && !validTargetLayout(parsed, imageOnly, listMarker, paragraph)) {
    reason = Object.hasOwn(parsed, 'marker') && !listMarker ? 'marker_outside_list' :
      imageOnly ? 'invalid_image_alignment' : !paragraph && ['lines', 'hyphens', 'caps', 'hanging'].some(key => Object.hasOwn(parsed, key)) ?
        'prose_layout_on_heading' : 'image_layout_on_prose';
  }
  return {layout: !reason && parsed ? parsed : {}, marker, markerToken, imageOnly, listMarker, image: imageOnly ? image : null, reason};
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
  if (info.listMarker) result.listMarker = true;
  if (info.reason) result.reason = info.reason;
  if (line < map[0] || starts[line] === undefined) return {...result, reason: result.reason || 'unmapped_layout_tail'};
  const lineStart = starts[line], lineStop = starts[line + 1] ?? source.length;
  const raw = source.slice(lineStart, source[lineStop - 1] === '\n' ? lineStop - 1 : lineStop);
  const last = inline.content.slice(inline.content.lastIndexOf('\n') + 1).trim();
  const atx = opener.type === 'heading_open' && /^#{1,6}$/.test(opener.markup);
  let position = -1;
  if (last) {
    const closing = atx ? /[ \t]+#+[ \t]*$/.exec(raw) : null;
    const content = closing ? raw.slice(0, closing.index) : raw;
    const found = content.lastIndexOf(last);
    if (found >= 0) {
      if (horizontal.test(content.slice(found + last.length))) position = found + last.length;
    }
  } else if (atx) {
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

export function annotateMarkdownLayout(state) {
  const tokens = state.tokens || [], source = typeof state.src === 'string' ? state.src : '';
  let starts;
  const items = [];
  for (let index = 0; index < tokens.length; index++) {
    const inline = tokens[index], opener = tokens[index - 1];
    if (inline.type === 'fence' && inline.level === 0 && /^html(?:\s|$)/i.test(inline.info || '') && inline.map) {
      starts ||= lineStarts(source);
      if (!inline.meta?.mdLayoutSource) {
        const next = tokens[index + 1], begin = starts[inline.map[0]], stop = starts[inline.map[1]] ?? source.length;
        const end = next?.type === 'html_block' && next.level === 0 && next.map?.[0] === inline.map[1]
          ? starts[next.map[1]] ?? source.length : stop;
        const record = htmlFence(source.slice(begin, end));
        if (record?.marker) {
          const target = {start: begin, end, insert: begin + record.marker.end,
            marker: {...record.marker, start: begin + record.marker.start, end: begin + record.marker.end},
            layout: record.layout, imageOnly: true, level: 0, kind: 'html'};
          (inline.meta ||= {}).mdLayoutSource = target;
          inline.meta.mdLayout = {layout: record.layout, marker: record.marker.text, imageOnly: true};
          inline.map[1] = next.map[1]; tokens.splice(index + 1, 1);
        }
      }
      continue;
    }
    if (inline.type === 'list_item_close') items.pop();
    const item = items.at(-1);
    if (item && !item.first && inline.level === item.token.level + 1 && inline.block && inline.nesting !== -1) item.first = inline;
    if (inline.type === 'list_item_open') items.push({token: inline, first: null});
    if (inline.type !== 'inline' || !Array.isArray(inline.children) ||
        (opener?.type !== 'paragraph_open' && opener?.type !== 'heading_open')) continue;
    const info = inspectInline(inline, opener.type === 'paragraph_open', item?.first === opener && opener.type === 'paragraph_open');
    if (info.imageOnly) opener.attrSet('data-md-picture', '');
    starts ||= lineStarts(source);
    const target = sourceTarget(source, starts, opener, inline, info);
    inline.meta ||= {};
    if (target) inline.meta.mdLayoutSource = target;
    if (info.marker && (info.reason || target?.reason)) inline.meta.mdLayoutFault = {reason: info.reason || target.reason, marker: info.marker};
    if (info.reason || target?.reason || !target || !info.marker) continue;
    const tight = opener.type === 'paragraph_open' && !!opener.hidden;
    const meta = {layout: info.layout, marker: info.marker, imageOnly: info.imageOnly, tight};
    (opener.meta ||= {}).mdLayout = meta;
    inline.meta.mdLayout = meta;
    if (info.image) (info.image.meta ||= {}).mdLayout = meta;
    opener.attrSet('data-md-layout', encodeURIComponent(info.marker));
    if (info.layout.align) opener.attrSet('data-md-align', info.layout.align);
    if (info.layout.first) opener.attrSet('data-md-first', String(info.layout.first));
    if (info.layout.indent) opener.attrSet('data-md-indent', String(info.layout.indent));
    for (const key of ['before', 'after']) {
      if (info.layout[key] != null) opener.attrSet('data-md-' + key, String(info.layout[key]));
    }
    if (!info.imageOnly) for (const key of ['lines', 'hyphens', 'caps', 'hanging']) {
      if (info.layout[key] != null) opener.attrSet('data-md-' + key, String(info.layout[key]));
    }
    const style = [textStyle(info.layout), !info.imageOnly && info.layout.lines != null ? '--md-drop-lines:' + info.layout.lines : ''].filter(Boolean).join(';');
    if (style) opener.attrSet('style', (opener.attrGet('style') || '') + ';' + style);
    if (info.layout.marker) {
      item.token.attrSet('data-md-marker', String(info.layout.marker));
      item.token.attrSet('style', (item.token.attrGet('style') || '') + ';' + textStyle({marker: info.layout.marker}));
    }
    if (tight) {
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

export function layoutTargets(source, parser, env = {}) {
  if (typeof source !== 'string') throw new TypeError('markdown_source_required');
  installMarkdownLayout(parser);
  const tokens = parser.parse(source, env), offset = originalOffsetMap(source), targets = [];
  for (const token of tokens) {
    const target = token.meta?.mdLayoutSource;
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

const LAYOUT_WINDOW_MIN = 65536, LAYOUT_WINDOW_REACH = 1 << 22;
const LAYOUT_OPENER = /^ {0,3}(?:(`{3,}|~{3,})|(\$\$)|(<!--)|(<\?)|(<!\[CDATA\[)|(<![A-Za-z])|<(script|pre|style|textarea)(?=[\s>]|$))/gim;
function layoutHazards(source, limit) {
  const spans = [];
  LAYOUT_OPENER.lastIndex = 0;
  for (let match; (match = LAYOUT_OPENER.exec(source)) && match.index < limit;) {
    const after = match.index + match[0].length, lineEnd = at => { const end = source.indexOf('\n', at); return end < 0 ? source.length : end + 1; };
    let close = -1;
    if (match[1]) {
      const fence = new RegExp('^ {0,3}' + (match[1][0] === '`' ? '`' : '~') + '{' + match[1].length + ',}[ \\t]*$', 'gm');
      fence.lastIndex = lineEnd(after);
      const found = fence.exec(source);
      close = found ? lineEnd(found.index) : source.length;
    } else if (match[2]) {
      const end = source.indexOf('$$', after); close = end < 0 ? source.length : lineEnd(end + 2);
    } else {
      const closer = match[3] ? '-->' : match[4] ? '?>' : match[5] ? ']]>' : match[6] ? '>' : null;
      if (closer) { const end = source.indexOf(closer, after); close = end < 0 ? source.length : lineEnd(end + closer.length); }
      else {
        const tag = new RegExp('</' + match[7] + '>', 'gi'); tag.lastIndex = after;
        const found = tag.exec(source); close = found ? lineEnd(found.index) : source.length;
      }
    }
    spans.push([match.index, close]);
    LAYOUT_OPENER.lastIndex = Math.max(close, after);
  }
  return spans;
}
export function layoutWindow(source, start, end) {
  if (typeof source !== 'string' || source.length < LAYOUT_WINDOW_MIN || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end < start || end > source.length) return null;
  const blank = (from, to) => !/[^ \t\r\n]/.test(source.slice(from, to));
  const boundary = at => {
    if (at <= 0 || at >= source.length || source[at - 1] !== '\n') return false;
    const previous = source.lastIndexOf('\n', at - 2) + 1;
    if (!blank(previous, at - 1)) return false;
    const line = source.slice(at, at + 16);
    return !/^(?:[ \t\r\n>:|]|[-*+](?:[ \t\r\n]|$)|\d{1,9}[.)](?:[ \t\r\n]|$))/.test(line);
  };
  let from = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  while (from > 0 && !boundary(from)) {
    from = source.lastIndexOf('\n', from - 2) + 1;
    if (start - from > LAYOUT_WINDOW_REACH) return null;
  }
  let to = source.indexOf('\n', end);
  to = to < 0 ? source.length : to + 1;
  while (to < source.length && !boundary(to)) {
    const next = source.indexOf('\n', to);
    to = next < 0 ? source.length : next + 1;
    if (to - end > LAYOUT_WINDOW_REACH) return null;
  }
  const spans = layoutHazards(source, source.length);
  for (let moved = true; moved;) {
    moved = false;
    for (const [open, close] of spans) {
      if (open < from && from < close) { from = open; moved = true; }
      if (open < to && to < close) { to = close; moved = true; }
    }
    while (from > 0 && !boundary(from)) from = source.lastIndexOf('\n', from - 2) + 1;
    while (to < source.length && !boundary(to)) { const next = source.indexOf('\n', to); to = next < 0 ? source.length : next + 1; }
  }
  return from === 0 && to === source.length ? null : {start: from, end: to};
}

export const hasBlockSpacing = source => /<!--md-layout:v1[^\r\n]*?[ \t](?:before|after|line)=/.test(source);

export function editLayout(source, parser, range, patch, env = {}) {
  if (typeof source !== 'string' || !range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
      range.start < 0 || range.end < range.start || range.end > source.length) return {edits: [], targets: [], reason: 'invalid_layout_range'};
  const wellFormed = change => !!change && typeof change === 'object' && !Array.isArray(change) && Object.keys(change).every(key => fields.has(key));
  if (typeof patch !== 'function' && !wellFormed(patch)) return {edits: [], targets: [], reason: 'invalid_layout_patch'};
  const targets = layoutTargets(source, parser, env).filter(target => range.start === range.end ?
    target.start <= range.start && range.start <= target.end : target.start < range.end && target.end > range.start);
  if (!targets.length) return {edits: [], targets, reason: 'no_layout_target'};
  const edits = [];
  for (const target of targets) {
    const value = {...target.layout}, change = typeof patch === 'function' ? patch(target, source) : patch;
    if (!wellFormed(change)) return {edits: [], targets, reason: 'invalid_layout_patch'};
    let changed = false;
    for (const key of Object.keys(change)) {
      if (change[key] == null) {
        if (Object.hasOwn(value, key)) { delete value[key]; changed = true; }
      } else if (value[key] !== change[key]) { value[key] = change[key]; changed = true; }
    }
    if (!changed) continue;
    if (target.reason || target.insert === null) return {edits: [], targets, reason: target.reason || 'unmapped_layout_tail'};
    if (!validTargetLayout(value, target.imageOnly, target.listMarker, target.kind === 'paragraph')) {
      return {edits: [], targets, reason: 'invalid_layout_patch'};
    }
    const text = formatLayout(value);
    if (target.marker) {
      if (target.marker.text === text) continue;
      let start = target.marker.start;
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
