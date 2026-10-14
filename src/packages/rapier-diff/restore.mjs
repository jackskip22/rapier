// SPDX-License-Identifier: MIT
function project(before, after, result, ids, splices) {
  const fail = () => { throw new TypeError('Invalid comparison or change ids'); };
  if (typeof before !== 'string' || typeof after !== 'string' ||
      !Array.isArray(result?.edits) || !Array.isArray(result?.changes) || !Array.isArray(ids)) fail();
  const {edits, changes} = result, selected = new Set(ids), owners = [], known = new Set();
  for (const change of changes) {
    if (!Number.isSafeInteger(change.id) || change.id < 1 || known.has(change.id) || !change.edits?.length) fail();
    known.add(change.id);
    for (const index of change.edits) {
      if (!Number.isSafeInteger(index) || !edits[index] || owners[index]) fail();
      owners[index] = change;
    }
  }
  for (const id of selected) if (!known.has(id)) fail();
  let a = 0, b = 0;
  const values = edits.map((edit, index) => {
    for (const [span, text] of [[edit.before, before], [edit.after, after]]) {
      if (!Array.isArray(span) || span.length !== 2 || !span.every(Number.isSafeInteger) ||
          span[0] < 0 || span[1] < span[0] || span[1] > text.length) fail();
    }
    const x = edit.before, y = edit.after;
    if (!owners[index] || x[0] < a || y[0] < b || before.slice(a, x[0]) !== after.slice(b, y[0])) fail();
    a = x[1]; b = y[1];
    return selected.has(owners[index].id) ? before.slice(...x) : after.slice(...y);
  });
  if (before.slice(a) !== after.slice(b)) fail();

  const used = new Set();
  for (const move of changes) if (move.kind === 'move') {
    const old = [], next = [];
    for (const index of move.edits) {
      const {before: x, after: y} = edits[index];
      if (x[0] < x[1] && y[0] === y[1]) old.push(index);
      else if (x[0] === x[1] && y[0] < y[1]) next.push(index);
      else fail();
    }
    old.sort((x, y) => x - y); next.sort((x, y) => x - y);
    if (!old.length || old.length !== next.length) fail();
    let text = '';
    for (let i = 0; i < old.length; i++) {
      const x = edits[old[i]].before, y = edits[next[i]].after;
      if (before.slice(...x) !== after.slice(...y)) fail();
      text += after.slice(...y);
      if (i + 1 === old.length) continue;
      const concerns = new Set();
      for (const list of [old, next]) for (let j = list[i] + 1; j < list[i + 1]; j++) concerns.add(owners[j]);
      if (concerns.size > 1 || concerns.has(move)) fail();
      const undo = selected.has([...concerns][0]?.id);
      text += undo ? before.slice(x[1], edits[old[i + 1]].before[0])
        : after.slice(y[1], edits[next[i + 1]].after[0]);
    }
    for (const [list, side] of [[old, 'before'], [next, 'after']]) {
      let end = edits[list[0]][side][0];
      for (let i = list[0]; i <= list.at(-1); i++) {
        const span = edits[i][side], peer = edits[i][side === 'before' ? 'after' : 'before'];
        if (used.has(i) || span[0] !== end || peer[0] !== peer[1]) fail();
        used.add(i); end = span[1]; values[i] = '';
      }
    }
    values[(selected.has(move.id) ? old : next)[0]] = text;
  }
  b = 0;
  let output = splices ? [] : '', at = 0;
  for (let i = 0; i < edits.length; i++) {
    const span = edits[i].after, inserted = values[i];
    if (splices) {
      at += span[0] - b;
      const removed = after.slice(...span);
      if (removed !== inserted) output.push({pos: at, removed, inserted});
      at += inserted.length;
    } else output += after.slice(b, span[0]) + inserted;
    b = span[1];
  }
  return splices ? output : output + after.slice(b);
}

export function restore(before, after, result, ids) {
  return project(before, after, result, ids);
}

export function restoreEdits(before, after, result, ids) {
  return project(before, after, result, ids, true);
}
