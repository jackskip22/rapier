// SPDX-License-Identifier: MIT

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/, HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const LIST = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;
const PICTURES = new Set(['mermaid', 'math', 'latex', 'tex', 'katex', 'zenuml', 'svg', 'html', 'dot', 'graphviz',
  'plantuml', 'abc', 'vega', 'vega-lite', 'geojson', 'topojson', 'stl', 'csv', 'tsv']);
export const OPEN = '﷐', CLOSE = '﷑';

function lines(text) {
  const out = [];
  for (let at = 0; at <= text.length;) {
    const newline = text.indexOf('\n', at), end = newline < 0 ? text.length : newline;
    const content = text.charCodeAt(end - 1) === 13 ? end - 1 : end;
    out.push({from: at, to: content, text: text.slice(at, content)});
    if (newline < 0) break;
    at = newline + 1;
  }
  return out;
}

function lineAt(text, at) {
  let line = 1;
  for (let index = text.indexOf('\n'); index >= 0 && index < at; index = text.indexOf('\n', index + 1)) line++;
  return line;
}

export function blocks(text) {
  const rows = lines(String(text)), out = [];
  let open = null, fence = null;
  const close = () => { if (open) out.push(open); open = null; };
  const start = (row, index, kind) => { open = {from: row.from, to: row.to, line: index + 1, kind}; };
  for (const [index, row] of rows.entries()) {
    if (fence) {
      open.to = row.to;
      if (fence === '---') {
        if (row.text === '---') { fence = null; close(); }
        continue;
      }
      const marker = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(row.text);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) { fence = null; close(); }
      continue;
    }
    if (index === 0 && row.text === '---') { start(row, index, 'frontmatter'); fence = '---'; continue; }
    const opening = FENCE.exec(row.text);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      close(); start(row, index, 'fence'); fence = opening[1];
      open.language = opening[2].trim().split(/[\s{]/)[0].toLowerCase();
      continue;
    }
    if (!row.text.trim()) { close(); continue; }
    if (HEADING.test(row.text)) { close(); start(row, index, 'heading'); open.level = /#+/.exec(row.text)[0].length; close(); continue; }
    if (open) { open.to = row.to; continue; }
    const previous = out.at(-1);
    if (previous && /^(?: {2,}|\t)/.test(row.text) && (previous.kind === 'list' || previous.kind === 'text' && previous.list)) {
      open = out.pop(); open.to = row.to; continue;
    }
    start(row, index, LIST.test(row.text) ? 'list' : 'text');
  }
  if (fence === '---' && open?.kind === 'frontmatter') open.kind = 'text';
  close();
  return out;
}

function places(edits, at) {
  let delta = 0, inserted = 0;
  for (const edit of edits) {
    const [from, to] = edit.before, size = edit.after[1] - edit.after[0] - (to - from);
    if (to < at || to === at && from < at) delta += size;
    else if (from === at && to === at) inserted += size;
    else if (from >= at) break;
  }
  return [at + delta, at + delta + inserted];
}

function guarded(source, block) {
  const out = [];
  for (const pattern of [/\]\([^)\n]*\)/g, /<[^>\n]*>/g, /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, /^ {0,3}\[[^\]\n]+\]:.*$/gm])
    for (const match of source.matchAll(pattern)) out.push([match.index, match.index + match[0].length]);
  if (block.kind === 'fence') {
    const first = source.indexOf('\n');
    out.push([0, first < 0 ? source.length : first + 1]);
    out.push([source.lastIndexOf('\n') + 1, source.length]);
  }
  return out;
}

function covered(block, rows, side, text) {
  let at = block.from;
  for (const row of rows.slice().sort((a, b) => a[side][0] - b[side][0])) {
    const [from, to] = row[side];
    if (to <= at) continue;
    if (from > at && text.slice(at, Math.min(from, block.to)).trim()) return false;
    at = Math.max(at, to);
    if (at >= block.to) return true;
  }
  return !text.slice(at, block.to).trim();
}

const PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+(?:\[[ xX]\](?:[ \t]+|$))?|$)|#{1,6}(?:[ \t]+|$)|\|)?/;
const RULE = /^[ \t>]*[|:=*_ \t-]*[-=*_][|:=*_ \t-]*$/;

function marksIn(text, block, edits, side) {
  if (block.kind === 'frontmatter' || block.kind === 'fence' && PICTURES.has(block.language)) return [];
  const source = text.slice(block.from, block.to);
  if (source.includes(OPEN) || source.includes(CLOSE)) return [];
  const unsafe = guarded(source, block), out = [];
  for (const edit of edits) {
    const from = Math.max(edit[side][0], block.from) - block.from, to = Math.min(edit[side][1], block.to) - block.from;
    if (to <= from || !source.slice(from, to).trim()) continue;
    if (unsafe.some(([start, end]) => from < end && to > start)) continue;
    for (let at = from; at < to;) {
      const lineStart = source.lastIndexOf('\n', at - 1) + 1, newline = source.indexOf('\n', at);
      const lineEnd = newline < 0 ? source.length : newline, line = source.slice(lineStart, lineEnd).replace(/\r$/, '');
      let start = at, end = Math.min(to, lineStart + line.length);
      if (block.kind !== 'fence') {
        if (RULE.test(line)) start = end;
        else start = Math.max(start, lineStart + PREFIX.exec(line)[0].length);
      }
      at = newline < 0 ? to : Math.max(newline + 1, at + 1);
      if (end <= start || !source.slice(start, end).trim()) continue;
      const previous = out.at(-1);
      if (previous && previous[1] <= start && !/\S|\n/.test(source.slice(previous[1], start))) previous[1] = end;
      else out.push([start, end]);
    }
  }
  return out;
}

export function marked(text, block, marks) {
  let out = '', at = block.from;
  for (const [from, to] of marks) {
    out += text.slice(at, block.from + from) + OPEN + text.slice(block.from + from, block.from + to) + CLOSE;
    at = block.from + to;
  }
  return out + text.slice(at, block.to);
}

export function review(before, after, result) {
  before = String(before); after = String(after);
  const oldBlocks = blocks(before), newBlocks = blocks(after), edits = result.edits;
  const owner = new Map();
  for (const change of result.changes) for (const index of change.edits) owner.set(index, change);
  const pairs = [];
  let next = 0;
  for (const [index, block] of oldBlocks.entries()) {
    const source = before.slice(block.from, block.to);
    for (const at of new Set(places(edits, block.from))) {
      let found = next;
      while (found < newBlocks.length && newBlocks[found].from < at) found++;
      const candidate = newBlocks[found];
      if (candidate && candidate.from === at && after.slice(candidate.from, candidate.to) === source) {
        pairs.push([index, found]); next = found + 1; break;
      }
    }
  }
  const items = [];
  let unchanged = [];
  const flush = last => {
    const run = unchanged; unchanged = [];
    let folded = [];
    const fold = () => {
      if (folded.length > 1 || folded.length && !(items.some(item => item.type === 'change') && last)) items.push({type: 'fold', blocks: folded});
      else if (folded.length) items.push({type: 'same', block: folded[0]});
      folded = [];
    };
    for (const pair of run) {
      if (pair.kind === 'heading') { fold(); items.push({type: 'same', block: pair}); }
      else folded.push(pair);
    }
    fold();
  };
  let oldAt = 0, newAt = 0;
  for (const [index, [oldIndex, newIndex]] of [...pairs, [oldBlocks.length, newBlocks.length]].entries()) {
    const removed = oldBlocks.slice(oldAt, oldIndex), added = newBlocks.slice(newAt, newIndex);
    const gapFrom = oldAt ? oldBlocks[oldAt - 1].to : 0, gapTo = oldIndex < oldBlocks.length ? oldBlocks[oldIndex].from : before.length;
    const owned = [];
    for (const [edit, row] of edits.entries()) if (row.before[0] >= gapFrom && row.before[1] <= gapTo) owned.push(edit);
    if (owned.length || removed.length || added.length) {
      flush(true);
      const pure = (list, side) => list.filter(block => covered(block, owned.map(edit => edits[edit])
        .filter(row => row[side === 'after' ? 'before' : 'after'][0] === row[side === 'after' ? 'before' : 'after'][1]), side,
        side === 'after' ? after : before));
      const arrived = pure(added, 'after'), left = pure(removed, 'before');
      let coreOld = removed.filter(block => !left.includes(block)), coreNew = added.filter(block => !arrived.includes(block));
      if (!coreOld.length || !coreNew.length) { coreOld = []; coreNew = []; }
      const touches = (row, block, side) => row[side][0] < block.to && row[side][1] > block.from ||
        row[side][0] === row[side][1] && row[side][0] >= block.from && row[side][0] <= block.to;
      const claimed = new Set(), groups = [];
      for (const block of left.filter(block => !coreOld.includes(block)))
        groups.push({kind: 'delete', before: [block], after: [], at: block.from, edits: owned.filter(edit => touches(edits[edit], block, 'before'))});
      for (const block of added.filter(block => !coreNew.includes(block)))
        groups.push({kind: 'insert', before: [], after: [block], at: null, edits: owned.filter(edit => touches(edits[edit], block, 'after'))});
      for (const group of groups) for (const edit of group.edits) claimed.add(edit);
      const rest = owned.filter(edit => !claimed.has(edit));
      const cores = coreOld.length === coreNew.length ? coreOld.map((block, index) => [[block], [coreNew[index]]])
        : coreOld.length ? [[coreOld, coreNew]] : [];
      for (const [index, [oldRows, newRows]] of cores.entries()) {
        const last = index === cores.length - 1, upTo = last ? Infinity : cores[index + 1][0][0].from;
        groups.push({kind: 'replace', before: oldRows, after: newRows, at: oldRows[0].from,
          edits: rest.filter(edit => !claimed.has(edit) && (last || edits[edit].before[0] < upTo) && claimed.add(edit))});
      }
      if (!cores.length && rest.length) {
        if (groups.length) groups.at(-1).edits.push(...rest);
        else groups.push({kind: 'spacing', before: [], after: [], at: -1, edits: rest});
      }
      for (const group of groups) group.at ??= group.edits.length ? Math.min(...group.edits.map(edit => edits[edit].before[0])) : gapTo;
      groups.sort((a, b) => a.at - b.at);
      for (const group of groups) {
        group.edits.sort((a, b) => a - b);
        const kinds = new Set(group.edits.map(edit => owner.get(edit)?.kind));
        const carried = group.edits.some(edit => owner.get(edit)?.kind === 'move' || owner.get(edit)?.move != null);
        const kind = group.kind !== 'spacing' && kinds.size === 1 && kinds.has('move') ||
          (group.kind === 'insert' || group.kind === 'delete') && carried ? 'move' : group.kind;
        const quiet = group.edits.filter(edit => !['move', 'format'].includes(owner.get(edit)?.kind)).map(edit => edits[edit]);
        const side = (text, list, name) => list.map(block => ({...block,
          marks: kind === 'replace' || kind === 'move' ? marksIn(text, block, quiet, name) : []}));
        const first = group.edits.length ? edits[group.edits[0]] : null;
        const line = {before: group.before[0]?.line ?? (first ? lineAt(before, first.before[0]) : null),
          after: group.after[0]?.line ?? (first ? lineAt(after, first.after[0]) : null)};
        items.push({type: 'change', kind, line, before: side(before, group.before, 'before'), after: side(after, group.after, 'after'),
          edits: group.edits, changes: [...new Set(group.edits.map(edit => owner.get(edit)?.id).filter(id => id != null))]});
      }
    }
    if (index < pairs.length) {
      const oldBlock = oldBlocks[oldIndex], newBlock = newBlocks[newIndex];
      unchanged.push({kind: oldBlock.kind, ...(oldBlock.level ? {level: oldBlock.level} : {}), ...(oldBlock.language != null ? {language: oldBlock.language} : {}),
        before: {from: oldBlock.from, to: oldBlock.to, line: oldBlock.line}, after: {from: newBlock.from, to: newBlock.to, line: newBlock.line}});
    }
    oldAt = oldIndex + 1; newAt = newIndex + 1;
  }
  flush(false);
  const moves = items.filter(item => item.type === 'change' && item.kind === 'move'), carrier = item => new Set(item.edits
    .map(edit => owner.get(edit)).map(change => change?.kind === 'move' ? change.id : change?.move).filter(id => id != null));
  for (const left of moves) for (const arrived of moves) {
    if (left.after.length || arrived.before.length || left === arrived) continue;
    const ids = carrier(arrived);
    if ([...carrier(left)].some(id => ids.has(id))) { left.line.after = arrived.line.after; arrived.line.before = left.line.before; }
  }
  return {items};
}
