// SPDX-License-Identifier: MIT
export function toHTML(before, after, result) {
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const owners = [];
  for (const change of result.changes) for (const index of change.edits) owners[index] = change;
  const out = [];
  const emit = (value, tag, change) => {
    if (!value) return;
    const last = out.at(-1);
    if (last && last.tag === tag && last.change === change) last.value += value;
    else out.push({value, tag, change});
  };
  let at = 0;
  for (const [index, row] of result.edits.entries()) {
    emit(after.slice(at, row.after[0]));
    emit(before.slice(...row.before), 'del', owners[index]);
    emit(after.slice(...row.after), 'ins', owners[index]);
    at = row.after[1];
  }
  emit(after.slice(at));
  return out.map(({value, tag, change}) => tag ? '<' + tag + ' class="' + escape(change.unit + ' ' + change.kind) +
    '" data-change="' + escape(change.id) + '">' + escape(value) + '</' + tag + '>' : escape(value)).join('');
}
