// SPDX-License-Identifier: AGPL-3.0-only
import {diff} from '../packages/rapier-diff/index.mjs';
import {restore, restoreEdits} from '../packages/rapier-diff/restore.mjs';
import {toHTML} from '../packages/rapier-diff/html.mjs';
import {review, OPEN, CLOSE, marked} from '../packages/rapier-diff/review.mjs';
export {diff, restore, restoreEdits, toHTML, review, OPEN, CLOSE, marked};

const STRUCTURE_CHARS = 1048576;
export function compare(before, after, options = {}) {
  const stats = {}, code = options.docKind === 'code';
  const structure = before.length <= STRUCTURE_CHARS && after.length <= STRUCTURE_CHARS ? options.structure : undefined;
  const result = diff(before, after, {as: code ? 'code' : options.docKind === 'text' ? 'prose' : 'auto',
    structure, from: options.from, limit: options.maxWork ?? 2000000, _stats: stats});
  const owners = new Map(result.changes.flatMap(change => change.edits.map(index => [index, change])));
  const transports = result.changes.filter(change => change.kind === 'move').map(change => {
    const range = side => {
      const spans = change.edits.map(index => result.edits[index][side]).filter(([from, to]) => from < to);
      return [spans[0][0], spans.at(-1)[1]];
    };
    return {id: change.id, before: range('before'), after: range('after')};
  });
  const edits = result.edits.map((edit, index) => {
    const owner = owners.get(index), transport = owner.kind === 'rename' && transports.find(move =>
      ['before', 'after'].every(side => edit[side][0] === edit[side][1] ||
        edit[side][0] >= move[side][0] && edit[side][1] <= move[side][1]));
    return {...owner, ...edit, index, ...(transport ? {move: transport.id} : {}), format: owner.kind === 'format'};
  });
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
  const whole = (rows, kind) => rows.every(row => {
    const [text, [from, to]] = kind === 'insert' ? [after, row.after] : [before, row.before];
    return row.kind === kind && (!from || text[from - 1] === '\n') && (text[to - 1] === '\n' || to === text.length || text[to] === '\n');
  });
  const region = group => {
    const {rows, before: left, after: right} = group, first = rows.find(row => row.kind === 'move') || rows[0];
    const quiet = rows.every(row => row.format), moved = !!group.move;
    return {id: first.id, changeIds: [...new Set([first.id, ...rows.map(row => row.id)])],
    kind: first.unit === 'char' || first.unit === 'word' || first.unit === 'sentence'
      ? code ? 'code-line' : 'paragraph' : first.unit === 'line' ? 'code-line' : first.unit,
    name: first.name, change: moved ? 'move' : quiet ? 'format' : left[0] === left[1] || whole(rows, 'insert') ? 'insert'
      : right[0] === right[1] || whole(rows, 'delete') ? 'delete' : 'replace', granularity: first.unit,
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
  const raw = [], sides = new Map();
  for (const row of edits) {
    const move = row.kind === 'move' ? row.id : row.move;
    if (!move) { raw.push({before: row.before, after: row.after, rows: [row]}); continue; }
    const side = row.after[0] === row.after[1] ? 0 : 1, key = move + ':' + side, group = sides.get(key);
    if (group) {
      group.rows.push(row);
      group.before = [Math.min(group.before[0], row.before[0]), Math.max(group.before[1], row.before[1])];
      group.after = [Math.min(group.after[0], row.after[0]), Math.max(group.after[1], row.after[1])];
    } else { const next = {before: [...row.before], after: [...row.after], rows: [row], move, side}; sides.set(key, next); raw.push(next); }
  }
  const expanded = raw.map(group => group.move ? group :
    {...group, before: oldBounds(group.before), after: newBounds(group.after)}).sort((a, b) => a.before[0] - b.before[0]);
  const grouped = [];
  for (const group of expanded) {
    const prior = grouped.at(-1);
    if (prior && !prior.move && !group.move &&
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
  for (const left of regions) {
    const right = left.change === 'move' && left.before && regions.find(row => row.change === 'move' && row.after && row.id === left.id);
    if (!right) continue;
    const move = result.changes.find(change => change.id === left.id), pieces = movedPieces(before, after, move, edits, code);
    left.moved = right.moved = {before: move.context.before, after: move.context.after, down: right.beforeAnchor >= left.before.to};
    left.changeIds = right.changeIds = [...new Set([...left.changeIds, ...right.changeIds])];
    if (pieces) right.pieces = pieces;
  }
  return {...result, regions, bounded: result.edits.some(row => row.coarse) || !!stats.projectionFallback, stats};
}

function movedPieces(before, after, move, edits, code) {
  const [x, y] = [move.context.before, move.context.after];
  const wording = edits.filter(row => row.move === move.id);
  const removed = wording.filter(row => row.before[0] < row.before[1]).sort((a, b) => a.before[0] - b.before[0]);
  const added = wording.filter(row => row.after[0] < row.after[1]).sort((a, b) => a.after[0] - b.after[0]);
  const runs = [];
  let a = x[0], b = y[0], i = 0, j = 0;
  while (a < x[1] || b < y[1]) {
    const n = Math.min((removed[i]?.before[0] ?? x[1]) - a, (added[j]?.after[0] ?? y[1]) - b);
    if (n > 0) { runs.push({type: 'equal', before: [a, a + n], after: [b, b + n]}); a += n; b += n; }
    else if (removed[i]?.before[0] === a) { runs.push({type: 'remove', before: removed[i].before, after: [b, b]}); a = removed[i++].before[1]; }
    else if (added[j]?.after[0] === b) { runs.push({type: 'add', before: [a, a], after: added[j].after}); b = added[j++].after[1]; }
    else return null;
  }
  if (i < removed.length || j < added.length) return null;
  const pieces = [];
  let piece = null;
  const open = run => piece ||= {before: [run.before[0], run.before[0]], after: [run.after[0], run.after[0]], parts: []};
  const close = () => { if (piece) pieces.push(piece); piece = null; };
  for (const run of runs) {
    if (run.type !== 'equal') {
      open(run).parts.push({text: run.type === 'remove' ? before.slice(...run.before) : after.slice(...run.after), changed: true, type: run.type});
      piece.before[1] = run.before[1]; piece.after[1] = run.after[1]; continue;
    }
    let at = 0;
    const text = before.slice(...run.before);
    while (at < text.length) {
      const end = text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at) + 1;
      open({before: [run.before[0] + at], after: [run.after[0] + at]}).parts.push({text: text.slice(at, end), changed: false});
      piece.before[1] = run.before[0] + end; piece.after[1] = run.after[0] + end;
      if (text[end - 1] === '\n') close();
      at = end;
    }
  }
  close();
  const span = (text, range) => ({from: range[0], to: range[1], text: text.slice(...range)});
  return pieces.map(({before: left, after: right, parts}) => ({before: span(before, left), after: span(after, right), parts,
    oldParts: parts.filter(part => part.type !== 'add'), newParts: parts.filter(part => part.type !== 'remove'), code}));
}

export function installDiffWorker(scope) {
  scope.RapierDiff = {compare, review};
}
