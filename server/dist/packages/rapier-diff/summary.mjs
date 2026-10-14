// SPDX-License-Identifier: MIT
export function summary(before, after, result, options = {}) {
  let left = Number.isFinite(options.chars) ? Math.max(0, options.chars) : 4000, at = 0, line = 1, omitted = 0;
  const lineOf = position => {
    if (position < at) { at = 0; line = 1; }
    for (; at < position; at++) if (after.charCodeAt(at) === 10) line++;
    return line;
  };
  const clip = text => text.length > 160 ? text.slice(0, 100) + `…(${text.length})…` + text.slice(-40) : text;
  const changes = [];
  for (const change of result.changes) {
    const first = result.edits[change.edits[0]], {before: x, after: y} = change.context || first;
    const row = {id: change.id, kind: change.kind, line: lineOf(y[0])};
    if (change.kind === 'move') Object.assign(row, {from: before.slice(0, x[0]).split('\n').length, text: clip(after.slice(...y))});
    else {
      if (x[0] < x[1]) row.removed = clip(before.slice(...x));
      if (y[0] < y[1]) row.inserted = clip(after.slice(...y));
    }
    if (change.name && change.unit !== 'paragraph') row.name = clip(change.name);
    const size = JSON.stringify(row).length + 1;
    if (size > left) { omitted++; left = 0; } else { left -= size; changes.push(row); }
  }
  return {changes, omitted};
}
