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
  const literal = [], comments = new Map(), observed = new WeakMap();
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
  const tokens = owner.parse(body, {});
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
        if (span.comment) comments.set(start, end);
        else add(start, end);
      }
    }
  };
  let table = null;
  for (const token of tokens) {
    if (token.type === 'tr_open' && token.map) {
      // GFM unescapes a pipe before parsing a cell. Preserve that one-character projection and
      // consume cells in order, so repeated cells and backticks across a separator never alias.
      const start = lineAt(token.map[0]), end = lineAt(token.map[0] + 1), offsets = [];
      let text = '';
      for (let at = start; at < end; at++) {
        if (source[at] === '\\' && source[at + 1] === '|') at++;
        offsets.push(at); text += source[at] === '\0' ? '\ufffd' : source[at];
      }
      offsets.push(end); table = {text, offsets, at: 0};
    }
    if (token.type === 'tr_close') table = null;
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
    if (token.type !== 'inline' || !token.content) continue;
    let rawOffset;
    if (token.map) {
      const offsets = [], starts = [], rows = token.content.split('\n');
      let local = 0;
      for (let i = 0; i < rows.length; i++) {
        const start = lineAt(token.map[0] + i), end = lineAt(token.map[0] + i + 1);
        const at = source.slice(start, end).replace(/\0/g, '\ufffd').indexOf(rows[i]);
        if (at < 0) throw new Error('Markdown inline source mapping failed');
        starts.push(local); offsets.push(start + at); local += rows[i].length + 1;
      }
      rawOffset = pos => {
        let row = starts.length - 1;
        while (row > 0 && starts[row] > pos) row--;
        return offsets[row] + pos - starts[row];
      };
    } else if (table) {
      const at = table.text.indexOf(token.content, table.at);
      if (at < 0) throw new Error('Markdown table source mapping failed');
      table.at = at + token.content.length;
      rawOffset = pos => table.offsets[at + pos];
    } else continue;
    readInline(token.children, token.content, rawOffset);
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
  return {isText, isComment: (start, end) => comments.get(start) === end};
}
