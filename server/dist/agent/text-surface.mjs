import {htmlAttributes, htmlFence} from '../spec/html-blocks.mjs';
import {markdownParser, markdownBodyOffset, eachBlockWindow} from '../spec/md-assets.mjs';
import {diff} from '../packages/rapier-diff/index.mjs';

const utf8 = new TextEncoder();
export const textBytes = text => utf8.encode(text).length;
export function textHead(text, budget = 32768) {
  if (text.length <= budget && textBytes(text) <= budget) return text;
  let lo = 0, hi = Math.min(text.length, budget);
  while (lo < hi) {const mid = Math.ceil((lo + hi) / 2); if (textBytes(text.slice(0, mid)) <= budget) lo = mid; else hi = mid - 1;}
  if (lo && /[\uD800-\uDBFF]/.test(text[lo - 1])) lo--;
  return text.slice(0, lo);
}
function lineNumber(text, end, from = 0, line = 1) {
  if (!(end > from)) return line;
  const bounded = text.slice(from, Math.ceil(end));
  for (let at = bounded.indexOf('\n'); at !== -1; at = bounded.indexOf('\n', at + 1)) line++;
  return line;
}
const LINE_STRIDE = 4096;
function lineIndex(text) {
  const marks = [1];
  const mark = stride => {
    while (marks.length <= stride) marks.push(lineNumber(text, marks.length * LINE_STRIDE, (marks.length - 1) * LINE_STRIDE, marks.at(-1)));
    return marks[stride];
  };
  return {
    number(offset) {
      const stride = offset > 0 ? Math.floor(Math.min(offset, text.length) / LINE_STRIDE) : 0;
      return lineNumber(text, offset, stride * LINE_STRIDE, mark(stride));
    },
    offset(index) {
      if (!Number.isInteger(index) || index < 0) return text.length;
      while (marks.at(-1) <= index && marks.length * LINE_STRIDE <= text.length) mark(marks.length);
      let low = 0, high = marks.length;
      while (low + 1 < high) {const mid = (low + high) >>> 1; if (marks[mid] <= index) low = mid; else high = mid;}
      let at = low * LINE_STRIDE;
      for (let line = marks[low]; line <= index; line++) {const next = text.indexOf('\n', at); if (next < 0) return text.length; at = next + 1;}
      return at;
    },
  };
}
function headingOutline(text) {
  const offset = markdownBodyOffset(text), body = text.slice(offset);
  const titles = [], levels = [], depths = [], parents = [], starts = [], ends = [], lines = [];
  const path = row => {const heading = []; for (let at = row; at >= 0; at = parents[at]) heading.unshift(titles[at]); return heading;};
  const outline = {titles, depths, starts, ends, path, get count() {return titles.length;},
    row: row => ({heading: path(row), title: titles[row], level: levels[row], start: starts[row], end: ends[row], line: lines[row]})};
  if (!/[#=-]/.test(body)) return outline;
  const parser = markdownParser(), env = {}, kept = [], offsets = new Map();
  const counted = /\r(?!\n)/.test(body) ? lineIndex(text) : null;
  eachBlockWindow(text, offset, parser, env, ({tokens, firstLine, lineStart}) => {
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.type === 'heading_open' && token.map) {
        offsets.set(token.map[0] + firstLine, lineStart(token.map[0]));
        token.map = [token.map[0] + firstLine, token.map[1] + firstLine];
        kept.push(token, tokens[++index]);
      } else if (token.type === 'footnote_reference_open' || token.type === 'footnote_reference_close' ||
          token.type === 'inline' && /\[\^|\^\[/.test(token.content)) kept.push(token);
    }
  });
  if (!offsets.size) return outline;
  const rules = parser.core.ruler.getRules(''), block = rules.indexOf(parser.core.ruler.__rules__.find(row => row.name === 'block')?.fn);
  if (block < 0) throw new Error('markdown_block_rule_unavailable');
  const state = new parser.core.State('', parser, env);
  state.tokens = kept;
  for (const rule of rules.slice(block + 1)) rule(state);
  const tokens = state.tokens;
  const stack = [], open = [], firstLine = lineNumber(text, offset);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]; if (token.type !== 'heading_open' || !token.map) continue;
    const level = Number(token.tag.slice(1)), inline = tokens[i + 1];
    const title = inline?.children?.map(child => child.type === 'softbreak' ? ' ' : child.content || '').join('') || inline?.content || '';
    while (stack.length && levels[stack.at(-1)] >= level) stack.pop();
    const row = titles.length, start = offsets.get(token.map[0]);
    if (start !== text.length) for (let deeper = level; deeper < open.length; deeper++) {
      for (const section of open[deeper] || []) ends[section] = start;
      open[deeper] = undefined;
    }
    titles.push(title); levels.push(level); depths.push(stack.length + 1); parents.push(stack.length ? stack.at(-1) : -1);
    starts.push(start); ends.push(text.length); lines.push(counted ? counted.number(start) : firstLine + token.map[0]);
    (open[level] ||= []).push(row); stack.push(row);
  }
  return outline;
}
export function textOutline(text) {
  const outline = headingOutline(text);
  return outline.titles.map((_, row) => outline.row(row));
}
export function textTargets(text) {
  let outline, blocks, lines;
  return {
    get outline() {return outline ||= headingOutline(text);},
    get lines() {return lines ||= lineIndex(text);},
    get blocks() {
      if (!blocks) try {blocks = {rows: fencedBlocks(text, true)};} catch (error) {blocks = {error};}
      if (blocks.error) throw blocks.error;
      return blocks.rows;
    },
  };
}
export function fencedBlocks(text, all = false) {
  if (!text.includes('```') && !text.includes('~~~')) return [];
  const result = []; let offset = 0, line = 0;
  const lineEnd = start => {const next = text.indexOf('\n', start); return next < 0 ? text.length : next + 1;};
  while (offset < text.length) {
    const openingEnd = lineEnd(offset), openingLine = ++line;
    const opening = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(text.slice(offset, openingEnd));
    if (!opening || opening[2][0] === '`' && opening[3].includes('`')) {offset = openingEnd; continue;}
    const start = offset, bodyStart = openingEnd, fence = opening[2];
    let bodyEnd = bodyStart, end = bodyStart, closed = false;
    while (end < text.length) {
      const next = lineEnd(end), close = /^( {0,3})(`{3,}|~{3,})[ \t]*\r?\n?$/.exec(text.slice(end, next));
      line++;
      if (close && close[2][0] === fence[0] && close[2].length >= fence.length) {closed = true; end = next; break;}
      bodyEnd = end = next;
    }
    const info = opening[3].trim();
    if (/^html(?:\s|$)/i.test(info) && closed) {
      const attrs = htmlAttributes(info);
      if (attrs) {
        const next = lineEnd(end), object = htmlFence(text.slice(start, next));
        if (object?.marker) {end = next; line++;}
        const id = attrs.id || 'html-line-' + openingLine;
        if (result.some(row => row.id === id)) throw new TypeError('Block ids must be unique.');
        result.push({id, kind: 'html', attrs, body: text.slice(bodyStart, bodyEnd).replace(/\r?\n$/, ''), start, end, text: text.slice(start, end)});
      }
    }
    if (/^rapier-(draw|water|paint|comment|svg)(?:\s|$)/.test(info)) {
      const kind = info.split(/\s/, 1)[0], attrs = {}, tail = info.slice(kind.length), attr = /\s+([a-z_]+)=((?:"(?:[^"\\]|\\.)*")|[^\s"]+)/gy;
      let at = 0;
      while (at < tail.length && tail.slice(at).trim()) {
        attr.lastIndex = at; const match = attr.exec(tail);
        if (!match || Object.hasOwn(attrs, match[1])) throw new TypeError('Invalid fenced block attributes.');
        attrs[match[1]] = match[2][0] === '"' ? JSON.parse(match[2]) : match[2]; at = attr.lastIndex;
      }
      if (!attrs.id || !/^[A-Za-z0-9_-]{1,128}$/.test(attrs.id)) throw new TypeError('A Rapier block needs a stable id.');
      if (result.some(row => row.id === attrs.id)) throw new TypeError('Rapier block ids must be unique.');
      if (!closed) throw new TypeError('Close the Rapier block fence.');
      const next = lineEnd(end), layout = kind !== 'rapier-comment' && /^(<!--md-layout:v1 [^>\r\n]{1,180}-->)[ \t]*\r?\n?$/.exec(text.slice(end, next))?.[1];
      const bodyText = text.slice(bodyStart, bodyEnd).replace(/\r?\n$/, '');
      if (layout) {end = next; line++;}
      result.push({id: attrs.id, kind, attrs, body: bodyText, start, end, text: text.slice(start, end), ...(layout ? {layout} : {})});
    }
    if (all && !result.some(row => row.start === start) && !/^rapier-(draw|water|paint|comment|svg)(?:\s|$)/.test(info) && closed) {
      const id = /(?:^|[\s{])#([A-Za-z][\w-]*)|(?:^|\s)id=([A-Za-z][\w-]*)/.exec(info);
      if (id) {const value = id[1] || id[2]; if (result.some(row => row.id === value)) throw new TypeError('Block ids must be unique.'); result.push({id:value,kind:info.split(/\s/,1)[0],attrs:{id:value},body:text.slice(bodyStart,bodyEnd).replace(/\r?\n$/, ''),start,end,text:text.slice(start,end)});}
    }
    offset = end;
  }
  return result;
}
export function blockText(kind, attrs, body) {
  const runs = body.match(/`+/g) || [], fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
  const info = Object.entries(attrs).filter(([,value]) => value !== undefined).map(([key,value]) => key + '=' + (/^[A-Za-z0-9_-]+$/.test(String(value)) ? value : JSON.stringify(String(value)))).join(' ');
  return `${fence}${kind} ${info}\n${body}\n${fence}`;
}
export function textScope(text, input = {}, targets = textTargets(text)) {
  if (input.block && input.heading) return {reason: 'scope_conflict'};
  if (input.block) {
    const block = targets.blocks.find(row => row.id === input.block);
    return block ? {start: block.start, end: block.end} : {reason: 'block_missing'};
  }
  if (input.heading !== undefined) {
    const path = Array.isArray(input.heading) ? input.heading : [input.heading], outline = targets.outline;
    const whole = path.length !== 1 && outline.count ? JSON.stringify(path) : '';
    let found = -1, matches = 0;
    for (let row = 0; row < outline.count && matches < 2; row++) {
      if (path.length === 1 ? outline.titles[row] !== path[0]
        : outline.depths[row] !== path.length || JSON.stringify(outline.path(row)) !== whole) continue;
      found = row; matches++;
    }
    return matches === 1 ? {start: outline.starts[found], end: outline.ends[found]} : {reason: matches ? 'heading_ambiguous' : 'heading_missing'};
  }
  return {start: 0, end: text.length};
}
export function textContext(text, start = 0, end = start, budget = 1800, lineAt = offset => lineNumber(text, offset)) {
  let from = Math.max(0, Math.min(start, text.length)), to = Math.max(from, Math.min(end, text.length));
  for (let i = 0; i < 3 && from; i++) from = text.lastIndexOf('\n', from - 2) + 1;
  for (let i = 0; i < 3 && to < text.length; i++) {const next = text.indexOf('\n', to); to = next < 0 ? text.length : next + 1;}
  const excerpt = textHead(text.slice(from, to), budget);
  return {line: lineAt(from), text: excerpt, complete: excerpt.length === to - from};
}
export function excerptRow(source, at, length, lines) {
  const line = lines.number(at), lineStart = lines.offset(line - 1), next = source.indexOf('\n', lineStart), lineEnd = next < 0 ? source.length : next;
  let from = Math.max(lineStart, at - 120), to = Math.min(lineEnd, at + length + 120);
  const split = pos => pos > 0 && (source.charCodeAt(pos - 1) & 0xfc00) === 0xd800 && (source.charCodeAt(pos) & 0xfc00) === 0xdc00;
  if (split(from)) from--;
  if (split(to)) to++;
  return {line, text: (from > lineStart ? '…' : '') + source.slice(from, to) + (to < lineEnd ? '…' : '')};
}
export function exactMatches(text, query, scope = {start: 0, end: text.length}, limit = Infinity) {
  const rows = []; if (!query) return rows;
  for (let at = text.indexOf(query, scope.start); at >= 0 && at + query.length <= scope.end && rows.length < limit; at = text.indexOf(query, at + 1)) rows.push(at);
  return rows;
}
export function planTextChanges(text, changes, targets = textTargets(text)) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 32) return {reason: 'changes_required'};
  const planned = [], ranges = [];
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index], whole = Object.hasOwn(change, 'text');
    if (whole) {
      if (changes.length !== 1 || typeof change.text !== 'string') return {reason: 'whole_document_must_be_alone'};
      planned.push({pos: 0, removed: text, inserted: change.text, index}); continue;
    }
    const scope = textScope(text, change, targets); if (scope.reason) return {...scope, index};
    const inserting = Object.hasOwn(change, 'after'), needle = inserting ? change.after : change.old;
    const replacement = inserting ? change.insert : change.new;
    if (typeof needle !== 'string' || typeof replacement !== 'string') return {reason: 'change_invalid', index};
    const matches = needle === '' && text === '' && inserting ? [0] : exactMatches(text, needle, scope, 2);
    if (matches.length !== 1) return {reason: matches.length ? 'text_ambiguous' : 'text_missing', index};
    ranges.push({pos: matches[0], removed: needle, inserted: needle});
    const pos = matches[0] + (inserting ? needle.length : 0);
    planned.push({pos, removed: inserting ? '' : needle, inserted: replacement, index});
  }
  planned.sort((a,b) => a.pos - b.pos || a.removed.length - b.removed.length);
  for (let i = 1; i < planned.length; i++) {
    const a = planned[i - 1], b = planned[i];
    if (b.pos < a.pos + a.removed.length || a.pos === b.pos) return {reason: 'changes_overlap', index: b.index};
  }
  const dropped = droppedObjectLayout(text, planned); if (dropped != null) return {reason: 'object_layout_dropped', index: dropped};
  let after = text, delta = 0;
  const receipts = planned.map(row => {const start = row.pos + delta; delta += row.inserted.length - row.removed.length; return {index: row.index, start};});
  const splices = planned.toReversed().map(({pos, removed, inserted}) => ({pos, removed, inserted}));
  for (const row of splices) after = after.slice(0, row.pos) + row.inserted + after.slice(row.pos + row.removed.length);
  const lines = textTargets(after).lines;
  return {text: after, splices, ranges, lines: receipts.toSorted((a,b) => a.index - b.index).map(row => lines.number(row.start))};
}

function droppedObjectLayout(text, planned) {
  if (!text.includes('<!--md-layout:v1')) return null;
  let blocks; try {blocks = fencedBlocks(text);} catch (_) {return null;}
  for (const block of blocks) {
    const fence = block.kind === 'html' && htmlFence(block.text), marker = fence?.marker; if (!marker && !block.layout) continue;
    const at = marker ? null : block.start + block.text.lastIndexOf(block.layout), to = marker ? block.start + marker.end : at + block.layout.length, fenceEnd = marker ? block.start + fence.fenceEnd : at;
    const row = planned.find(row => row.removed !== text && row.pos < fenceEnd && row.pos + row.removed.length >= to &&
      new RegExp('^ {0,3}(?:`{3,}|~{3,})' + block.kind, 'im').test(row.inserted) && !row.inserted.includes('<!--md-layout:v1'));
    if (row) return row.index;
  }
  return null;
}

export function projectSegments(source, replacements) {
  const segments = replacements.toSorted((a,b) => a.start - b.start); let end = 0, text = '';
  for (const row of segments) {
    if (row.start < end) throw new TypeError('Block projections overlap.');
    text += source.slice(end, row.start); row.from = text.length; text += row.text; row.to = text.length; end = row.end;
  }
  text += source.slice(end);
  return {text, segments};
}
export function sourcePosition(projection, at, end = false) {
  let delta = 0;
  for (const row of projection.segments) {
    if (at < row.from || at === row.from && !end) break;
    if (at < row.to) return end ? row.end : row.start;
    delta += row.end - row.start - (row.to - row.from);
  }
  return at + delta;
}
export function keptRangesAfterSplice(ranges, {pos, removed, inserted}) {
  const until = pos + removed.length, delta = inserted.length - removed.length;
  return ranges.flatMap(({start, end}) => {
    if (start === end) {
      const at = start <= pos ? start : Math.max(pos, start - removed.length) + inserted.length;
      return [{start: at, end: at}];
    }
    if (end <= pos) return [{start, end}];
    if (start >= until) return [{start: start + delta, end: end + delta}];
    return [...(start < pos ? [{start, end: pos}] : []),
      ...(end > until ? [{start: pos + inserted.length, end: end + delta}] : [])];
  });
}
export function expandedChanges(projection, plan) {
  const framing = projection.segments.filter(row => row.kind === 'comments').flatMap(row => {
    const blocks = fencedBlocks(row.text);
    return [{start: row.from, end: row.from}, ...blocks.slice(1).map((block, index) => ({
      start: row.from + blocks[index].end - (/\r?\n$/.exec(blocks[index].text)?.[0].length || 0), end: row.from + block.start}))];
  });
  const ranges = plan.splices.map(row => {
    let start = row.pos, end = row.pos + row.removed.length;
    for (const segment of projection.segments) if (start < segment.to && segment.from < end || start === end && (start > segment.from && start < segment.to || segment.kind === 'comments' && start >= segment.from && start <= segment.to)) {
      start = Math.min(start, segment.from); end = Math.max(end, segment.to);
    }
    return {start, end, changes: [row]};
  }).sort((a,b) => a.start - b.start);
  const merged = [];
  for (const row of ranges) {
    const last = merged.at(-1);
    if (last && row.start < last.end) {last.end = Math.max(last.end, row.end); last.changes.push(...row.changes);}
    else merged.push(row);
  }
  return merged.reverse().map(row => {
    const original = projection.text.slice(row.start, row.end);
    let inserted = original, kept = framing.filter(gap => gap.start >= row.start && gap.end <= row.end)
      .map(gap => ({start: gap.start - row.start, end: gap.end - row.start}));
    for (const change of row.changes.sort((a,b) => b.pos - a.pos)) {
      const at = change.pos - row.start; inserted = inserted.slice(0, at) + change.inserted + inserted.slice(at + change.removed.length);
    }
    if (kept.length) {
      const body = text => projectSegments(text, fencedBlocks(text).filter(block => block.kind === 'rapier-comment')
        .map(block => ({start: block.start, end: block.end - (/\r?\n$/.exec(block.text)?.[0].length || 0), text: ''})));
      const before = body(original), after = body(inserted);
      for (const segment of before.segments.toReversed())
        kept = keptRangesAfterSplice(kept, {pos: segment.start, removed: original.slice(segment.start, segment.end), inserted: ''});
      const edits = diff(before.text, after.text, {_unit: 'char'}).edits;
      if (edits.some(edit => edit.coarse && kept.some(gap => gap.start === gap.end
        ? edit.before[0] < gap.start && gap.start < edit.before[1]
        : edit.before[0] < gap.end && gap.start < edit.before[1]))) throw new TypeError('comment_framing_requires_exact_changes');
      for (const edit of edits.toReversed())
        kept = keptRangesAfterSplice(kept, {pos: edit.before[0], removed: before.text.slice(...edit.before), inserted: after.text.slice(...edit.after)});
      kept = kept.map(gap => ({start: sourcePosition(after, gap.start, gap.start !== gap.end), end: sourcePosition(after, gap.end)}));
    }
    return {...row, inserted, framing: kept, pos: sourcePosition(projection, row.start), until: sourcePosition(projection, row.end, true)};
  });
}
