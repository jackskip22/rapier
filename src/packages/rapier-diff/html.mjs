// SPDX-License-Identifier: MIT
import {review, marked, OPEN, CLOSE} from './review.mjs';

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


const escapeText = value => String(value).replace(/[&<>"']/g, character =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

function placeMarks(html, tag) {
  let out = '', inside = false, opened = 0, closed = 0;
  for (let at = 0; at < html.length;) {
    if (html[at] === '<' && /[A-Za-z/!?]/.test(html[at + 1] || '')) {
      let end = at + 1, quote = '';
      if (html.startsWith('<!--', at)) end = html.indexOf('-->', at) + 3 || html.length;
      else for (; end < html.length; end++) {
        const character = html[end];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '>') { end++; break; }
      }
      const tag = html.slice(at, end);
      if (/[﷐﷑]|%EF%B7%9[01]/i.test(tag)) return null;
      out += tag; at = end; continue;
    }
    let end = at;
    while (end < html.length && !(html[end] === '<' && /[A-Za-z/!?]/.test(html[end + 1] || ''))) end++;
    let run = '';
    for (const character of html.slice(at, end)) {
      if (character === OPEN) { if (inside) return null; if (run) out += run; run = ''; inside = true; opened++; }
      else if (character === CLOSE) { if (!inside) return null; if (run) out += tag + run + '</mark>'; run = ''; inside = false; closed++; }
      else run += character;
    }
    if (run) out += inside && run.trim() ? tag + run + '</mark>' : run;
    at = end;
  }
  return inside || opened !== closed ? null : out;
}

export const reviewCSS = `.rd-review{--rd-old:light-dark(color-mix(in srgb,#d1242f 11%,transparent),color-mix(in srgb,#f85149 16%,transparent));--rd-new:light-dark(color-mix(in srgb,#1a7f37 11%,transparent),color-mix(in srgb,#3fb950 16%,transparent));--rd-muted:light-dark(#6f6f6f,#9a9a9a);display:grid;gap:16px}
.rd-review>*{min-width:0}.rd-block>:first-child,.rd-panel>:first-child{margin-top:0}.rd-block>:last-child,.rd-panel>:last-child{margin-bottom:0}
.rd-fold>summary{list-style:none;cursor:pointer;padding:12px 0;color:var(--rd-muted);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em}
.rd-fold>summary::-webkit-details-marker{display:none}.rd-fold>summary::before{content:'⋯ '}.rd-fold[open]>summary{display:none}.rd-fold>.rd-block+.rd-block{margin-top:16px}
.rd-change{display:grid;gap:8px}.rd-label{display:flex;justify-content:space-between;gap:16px;color:var(--rd-muted);font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;font-variant-numeric:tabular-nums}
.rd-panel{padding:16px 20px;overflow-x:auto}.rd-old{background:var(--rd-old)}.rd-new{background:var(--rd-new)}.rd-move{background:color-mix(in srgb,currentColor 6%,transparent)}
.rd-panel mark{color:inherit}.rd-panel .rd-del{background:light-dark(color-mix(in srgb,#d1242f 32%,transparent),color-mix(in srgb,#f85149 40%,transparent))}.rd-panel .rd-ins{background:light-dark(color-mix(in srgb,#1a7f37 32%,transparent),color-mix(in srgb,#3fb950 40%,transparent))}`;

const LABELS = {replace: 'Changed', insert: 'Added', delete: 'Removed', move: 'Moved', spacing: 'Spacing'};

export function toReview(before, after, result, options = {}) {
  before = String(before); after = String(after);
  const render = options.render || (source => '<pre>' + escapeText(source) + '</pre>');
  const block = (text, range, marks = []) => {
    const plain = render(text.slice(range.from, range.to));
    if (!marks.length) return plain;
    return placeMarks(render(marked(text, range, marks)), text === before ? '<mark class="rd-del">' : '<mark class="rd-ins">') ?? plain;
  };
  const line = change => change.line.before == null || change.line.before === change.line.after ? 'Line ' + (change.line.after ?? change.line.before)
    : change.line.after == null ? 'Line ' + change.line.before : 'Line ' + change.line.before + ' → ' + change.line.after;
  const out = [];
  for (const item of review(before, after, result).items) {
    if (item.type === 'same') out.push('<div class="rd-block">' + block(after, item.block.after) + '</div>');
    else if (item.type === 'fold') out.push('<details class="rd-fold"><summary>' + item.blocks.length + ' unchanged block' +
      (item.blocks.length === 1 ? '' : 's') + '</summary>' + item.blocks.map(row => '<div class="rd-block">' + block(after, row.after) + '</div>').join('') + '</details>');
    else {
      const panels = [...item.before.map(row => '<div class="rd-panel ' + (item.kind === 'move' ? 'rd-move' : 'rd-old') + '">' + block(before, row, row.marks) + '</div>'),
        ...item.after.map(row => '<div class="rd-panel ' + (item.kind === 'move' ? 'rd-move' : 'rd-new') + '">' + block(after, row, row.marks) + '</div>')];
      out.push('<section class="rd-change rd-' + item.kind + '" data-changes="' + item.changes.join(' ') + '"><div class="rd-label"><span>' +
        LABELS[item.kind] + '</span><span>' + line(item) + '</span></div>' + panels.join('') + '</section>');
    }
  }
  return '<div class="rd-review">' + out.join('') + '</div>';
}
