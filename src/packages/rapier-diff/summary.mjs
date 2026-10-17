// SPDX-License-Identifier: MIT
export function summary(before, after, result, options = {}) {
  let left = Number.isFinite(options.chars) ? Math.max(0, options.chars) : 4000, omitted = 0;
  const starts = new Map(), lineOf = (text, position) => {
    let at = starts.get(text);
    if (!at) {
      starts.set(text, at = [0]);
      for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) at.push(i + 1);
    }
    let lo = 0, hi = at.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (at[mid] <= position) lo = mid; else hi = mid; }
    return lo + 1;
  };
  let graphemes;
  const cut = (text, at) => (graphemes ||= new Intl.Segmenter('en', {granularity: 'grapheme'})).segment(text).containing(at).index;
  const clip = text => text.length > 160 ? text.slice(0, cut(text, 100)) + `…(${text.length})…` + text.slice(cut(text, text.length - 40)) : text;
  const changes = [];
  for (const change of result.changes) {
    const owned = change.edits.map(i => result.edits[i]);
    const ranges = side => owned.map(e => e[side]).filter(([a, b]) => a < b);
    const span = side => { const rows = ranges(side); return rows.length ? [rows[0][0], rows.at(-1)[1]] : owned[0][side]; };
    const {before: x, after: y} = !change.move && change.context || {before: span('before'), after: span('after')};
    const kind = (change.kind === 'delete' || change.kind === 'insert') && x[0] < x[1] && y[0] < y[1] ? 'replace' : change.kind;
    const row = {id: change.id, kind, line: lineOf(after, y[0])};
    if (change.kind === 'move') Object.assign(row, {from: lineOf(before, x[0]), text: clip(after.slice(...y))});
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
