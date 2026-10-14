// SPDX-License-Identifier: AGPL-3.0-only
import {diff} from '../packages/rapier-diff/index.mjs';
import {restore, restoreEdits} from '../packages/rapier-diff/restore.mjs';
export {diff, restore, restoreEdits};

export function compare(before, after, options = {}) {
  const stats = {}, code = options.docKind === 'code';
  const result = diff(before, after, {as: code ? 'code' : options.docKind === 'text' ? 'prose' : 'auto',
    structure: options.structure, from: options.from, limit: options.maxWork ?? 2000000, _stats: stats});
  const owners = new Map(result.changes.flatMap(change => change.edits.map(index => [index, change])));
  const edits = result.edits.map((edit, index) => ({...owners.get(index), ...edit, index,
    format: owners.get(index).kind === 'format'}));
  const span = (text, range) => range[0] === range[1] ? null : {from: range[0], to: range[1], text: text.slice(...range)};
  const parts = (text, range, rows, side) => {
    const out = [];
    let at = range[0];
    for (const row of rows.slice().sort((a, b) => a[side][0] - b[side][0])) {
      const [from, to] = row[side];
      if (to <= from || from < at || to > range[1]) continue;
      if (from > at) out.push({text: text.slice(at, from), changed: false});
      out.push({text: text.slice(from, to), changed: !row.format && row.kind !== 'move', format: !!row.format});
      at = to;
    }
    if (at < range[1]) out.push({text: text.slice(at, range[1]), changed: false});
    return out;
  };
  const region = group => {
    const {rows, before: left, after: right} = group, first = rows[0];
    const quiet = rows.every(row => row.format), moved = rows.every(row => row.kind === 'move');
    return {id: first.id, changeIds: [...new Set(rows.map(row => row.id))],
    kind: first.unit === 'char' || first.unit === 'word' || first.unit === 'sentence'
      ? code ? 'code-line' : 'paragraph' : first.unit === 'line' ? 'code-line' : first.unit,
    name: first.name, change: moved ? 'move' : quiet ? 'format' : left[0] === left[1] ? 'insert'
      : right[0] === right[1] ? 'delete' : 'replace', granularity: first.unit,
    before: span(before, left), after: span(after, right), beforeAnchor: left[0], afterAnchor: right[0],
    oldParts: parts(before, left, rows, 'before'), newParts: parts(after, right, rows, 'after')};
  };
  const boundaries = text => {
    const starts = [0], pattern = code ? /\n/g : /\r?\n[\t ]*(?:\r?\n)+/g;
    let match;
    while ((match = pattern.exec(text))) if (pattern.lastIndex < text.length) starts.push(pattern.lastIndex);
    starts.push(text.length);
    return range => {
      const locate = position => {
        let low = 0, high = starts.length - 1;
        while (low + 1 < high) { const middle = (low + high) >>> 1; if (starts[middle] <= position) low = middle; else high = middle; }
        return low;
      };
      if (!text.length) return [0, 0];
      const start = locate(range[0]), end = locate(Math.max(range[0], range[1] - 1));
      return [starts[start], starts[end + 1]];
    };
  };
  const oldBounds = boundaries(before), newBounds = boundaries(after);
  const raw = edits.map(row => ({before: row.before, after: row.after, rows: [row]}));
  const expanded = raw.map(group => group.rows[0].kind === 'move' ? group :
    {...group, before: oldBounds(group.before), after: newBounds(group.after)}).sort((a, b) => a.before[0] - b.before[0]);
  const grouped = [];
  for (const group of expanded) {
    const prior = grouped.at(-1);
    if (prior && ![prior, group].some(value => value.rows.some(row => row.kind === 'move')) &&
      group.before[0] < prior.before[1] && group.after[0] < prior.after[1] && group.after[0] >= prior.after[0]) {
      prior.before = [prior.before[0], Math.max(prior.before[1], group.before[1])];
      prior.after = [prior.after[0], Math.max(prior.after[1], group.after[1])];
      prior.rows = [...prior.rows, ...group.rows];
    } else grouped.push({...group});
  }
  const context = groups => {
    const gaps = (text, side) => {
      const out = [];
      let at = 0;
      for (const range of groups.map(group => group[side]).filter(range => range[0] !== range[1]).sort((a, b) => a[0] - b[0])) {
        if (range[0] < at || range[1] > text.length) return null;
        if (range[0] > at) out.push([at, range[0]]);
        at = range[1];
      }
      if (at < text.length) out.push([at, text.length]);
      return out;
    };
    const left = gaps(before, 'before'), right = gaps(after, 'after'), out = [];
    if (!left || !right) return null;
    let oldIndex = 0, newIndex = 0, oldAt = left[0]?.[0], newAt = right[0]?.[0];
    while (oldIndex < left.length && newIndex < right.length) {
      const length = Math.min(left[oldIndex][1] - oldAt, right[newIndex][1] - newAt);
      if (before.slice(oldAt, oldAt + length) !== after.slice(newAt, newAt + length)) return null;
      out.push({kind: code ? 'code-line' : 'text', change: 'equal',
        before: span(before, [oldAt, oldAt + length]), after: span(after, [newAt, newAt + length])});
      oldAt += length; newAt += length;
      if (oldAt === left[oldIndex][1]) oldAt = left[++oldIndex]?.[0];
      if (newAt === right[newIndex][1]) newAt = right[++newIndex]?.[0];
    }
    return oldIndex === left.length && newIndex === right.length ? out : null;
  };
  let selected = grouped, equal = context(grouped);
  if (!equal) { selected = raw; equal = context(raw); }
  if (!equal) {
    selected = [{before: [0, before.length], after: [0, after.length], rows: edits}];
    equal = []; stats.projectionFallback = true;
  }
  const regions = [...equal, ...selected.map(region)].sort((a, b) =>
    (a.before?.from ?? a.beforeAnchor) - (b.before?.from ?? b.beforeAnchor) || Number(a.change === 'equal') - Number(b.change === 'equal'));
  return {...result, regions, bounded: result.edits.some(row => row.coarse) || !!stats.projectionFallback, stats};
}

export function installDiffWorker(scope) {
  scope.RapierDiff = {compare};
}
