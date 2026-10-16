// SPDX-License-Identifier: MIT
import {splitOpeningFrontmatter} from './frontmatter.mjs';

// The standard parser owns literal regions and comment boundaries. Offsets are original UTF-16,
// including BOM/CRLF and list/quote prefixes. A private parser view observes rules; it changes no
// live rule or token. Call once per source, then ask isText(position) or isComment(start, end).
export function markdownSourcePositions(source, parser) {
  if (typeof source !== 'string' || !parser) throw new TypeError('Source positions require text and its Markdown parser');
  const {body, bodyOffset} = splitOpeningFrontmatter(source), lines = [bodyOffset];
  for (const row of body.matchAll(/\r\n?|\n/g)) lines.push(bodyOffset + row.index + row[0].length);
  const lineAt = line => lines[line] ?? source.length;
  const literal = [], comments = new Map(), observed = new WeakMap(), typography = [], openedStyles = new Map();
  const add = (start, end) => { if (end > start) literal.push({start, end}); };
  if (bodyOffset) add(0, bodyOffset);
  const owner = Object.create(parser), inline = Object.create(parser.inline), ruler = Object.create(parser.inline.ruler);
  owner.inline = inline; inline.ruler = ruler;
  ruler.getRules = chain => parser.inline.ruler.getRules(chain).map(rule => (state, silent) => {
    const start = state.pos, first = state.tokens.length;
    const matched = rule(state, silent), token = state.tokens.at(-1);
    // A pending text token may flush before this token. Never overwrite a nested rule's span
    // with its enclosing link's range.
    if (matched && !silent && state.tokens.length > first && !observed.has(token) &&
        ['code_inline', 'html_inline', 'image', 'footnote_ref'].includes(token?.type)) {
      observed.set(token, {start, end: state.pos, source: state.src,
        comment: token.type === 'html_inline' && token.content.startsWith('<!--'),
        footnote: token.type === 'footnote_ref' && state.src.startsWith('^[', start)
          ? state.env.footnotes?.list?.[token.meta.id] : null});
    }
    return matched;
  });
  // A core rule may rewrite an inline token's content after its children were parsed (a task item drops
  // its `[ ] `). Map rows from the text the inline rules read.
  const read = new WeakMap();
  inline.parse = function (text, md, env, children) { read.set(children, text); return parser.inline.parse.call(this, text, md, env, children); };
  const {tokens, cells} = markdownTableSources(body, owner, {}, lines);
  const readInline = (children, content, rawOffset) => {
    for (const child of children || []) {
      const span = observed.get(child);
      if (!span || span.source !== content) continue;
      // Inline footnotes are moved to a generated footer without line maps. Their parser-owned
      // child tokens still stand inside the original ^[...] carrier, not in that footer.
      if (span.footnote?.tokens) {
        readInline(span.footnote.tokens, span.footnote.content, pos => rawOffset(span.start + 2 + pos));
      } else if (child.type !== 'footnote_ref') {
        const start = rawOffset(span.start), end = rawOffset(span.end);
        const style = child.meta?.typography;
        if (style && child.nesting === 1) openedStyles.set(style, {start, innerStart: end, style: style.style});
        else if (style && child.nesting === -1 && openedStyles.has(style)) {
          typography.push({...openedStyles.get(style), innerEnd: start, end});
          openedStyles.delete(style);
        }
        if (span.comment) comments.set(start, end);
        else add(start, end);
      }
    }
  };
  for (const token of tokens) {
    if (token.map && ['fence', 'code_block', 'html_block', 'reference_definition'].includes(token.type)) {
      const start = lineAt(token.map[0]), end = lineAt(token.map[1]);
      add(start, end);
      // A comment-carrier block can contain several adjacent comments. Keep each carrier,
      // including a closer surviving damage to its opener. Never promote nested comments or
      // comment-shaped text in a raw tagged HTML block (pre, script, div, ...).
      if (token.type === 'html_block' && /^\s*<!--/.test(token.content)) {
        let at = source.indexOf('<!--', start);
        while (at >= start && at < end) {
          const close = source.indexOf('-->', at + 4);
          const stop = close >= 0 && close + 3 <= end ? close + 3 : end;
          comments.set(at, stop);
          at = source.indexOf('<!--', stop);
        }
      }
      continue;
    }
    const content = read.get(token.children) ?? token.content;
    if (token.type !== 'inline' || !content) continue;
    let rawOffset;
    if (token.map) {
      const offsets = [], starts = [], spaces = [], rows = content.split('\n');
      let local = 0;
      for (let i = 0; i < rows.length; i++) {
        const start = lineAt(token.map[0] + i), end = lineAt(token.map[0] + i + 1), line = source.slice(start, end).replace(/\0/g, '\ufffd');
        let at = line.indexOf(rows[i]), lead = 0;
        // A container that consumes part of a tab leaves the rest as spaces the source does not hold.
        // They all stand for that tab.
        if (at < 0) { const rest = rows[i].replace(/^ +/, ''); lead = rows[i].length - rest.length; at = line.indexOf(rest); if (!lead || line[at - 1] !== '\t') at = -1; }
        if (at < 0) throw new Error('Markdown inline source mapping failed');
        starts.push(local); spaces.push(lead); offsets.push(start + at - lead); local += rows[i].length + 1;
      }
      rawOffset = pos => {
        let row = starts.length - 1;
        while (row > 0 && starts[row] > pos) row--;
        return offsets[row] + Math.max(pos - starts[row], spaces[row] - 1);
      };
    } else if (cells.has(token)) {
      rawOffset = cells.get(token);
    } else continue;
    readInline(token.children, content, rawOffset);
  }
  literal.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of literal) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({...range});
  }
  const isText = position => {
    if (comments.has(position)) return false;
    let low = 0, high = merged.length;
    while (low < high) { const mid = (low + high) >> 1; if (merged[mid].end <= position) low = mid + 1; else high = mid; }
    return low < merged.length && merged[low].start <= position;
  };
  return {isText, isComment: (start, end) => comments.get(start) === end, typography: typography.sort((a, b) => a.start - b.start)};
}

// Capture only table-cell provenance while the parser still owns container-adjusted row
// bounds. Looking for cell text in a whole row aliases literal pipes and quote/list markers.
export function markdownTableSources(source, parser, environment, lineStarts = null) {
  const cells = new WeakMap();
  if (!source.includes('|')) return {tokens: parser.parse(source, environment), cells};
  const lines = lineStarts || [0];
  if (!lineStarts) for (const row of source.matchAll(/\r\n?|\n/g)) lines.push(row.index + row[0].length);
  const owner = Object.create(parser), block = Object.create(parser.block), ruler = Object.create(parser.block.ruler);
  owner.block = block; block.ruler = ruler;
  ruler.getRules = chain => parser.block.ruler.getRules(chain).map(rule => (state, start, end, silent) => {
    const first = state.tokens.length, matched = rule(state, start, end, silent);
    if (matched && !silent && state.tokens[first]?.type === 'table_open') {
      let cell;
      for (let at = first; at < state.tokens.length; at++) {
        const token = state.tokens[at];
        if (token.type === 'tr_open') {
          const row = token.map[0], from = state.bMarks[row] + state.tShift[row];
          const line = state.src.lastIndexOf('\n', from - 1) + 1;
          cell = tableSource(state.src.slice(from, state.eMarks[row]), lines[row] + from - line);
        } else if (token.type === 'inline' && cell) cells.set(token, cell(token.content));
        else if (token.type === 'tr_close') cell = null;
      }
    }
    return matched;
  });
  return {tokens: owner.parse(source, environment), cells};
}

function tableSource(row, base) {
  const trim = row.trimStart();
  base += row.length - trim.length; row = trim.trimEnd();
  const offsets = [], stops = [];
  let text = '', cursor = 0;
  for (let at = 0; at < row.length; at++) {
    if (row[at] === '\\' && row[at + 1] === '|') at++;
    else if (row[at] === '|') stops.push(text.length);
    offsets.push(base + at); text += row[at];
  }
  offsets.push(base + row.length);
  let next = stops[0] === 0 ? 1 : 0;
  if (next) cursor = 1;
  if (stops.at(-1) !== text.length - 1) stops.push(text.length);
  return content => {
    const stop = stops[next++] ?? text.length, raw = text.slice(cursor, stop);
    const start = Math.min(text.length, cursor + raw.length - raw.trimStart().length);
    if (raw.trim() !== content) throw new Error('Markdown table source mapping failed');
    cursor = stop + 1;
    return pos => offsets[start + pos];
  };
}
