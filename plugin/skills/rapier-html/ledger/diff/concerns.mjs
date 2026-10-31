// SPDX-License-Identifier: MIT
import {letter, within, prev, next} from "./tokens.mjs";

export function separate(c, endA = c.before.length, endB = c.after.length) {
  const {before, after, safe, raw, spend} = c;
  if (!raw) for (let i = c.result.length - 1; i > 0; i--) {
    const p = c.result[i - 1], q = c.result[i], side = p[0][0] === p[0][1] ? 1 : p[1][0] === p[1][1] ? 0 : -1, text = side ? after : before;
    if (!c.evidence && side >= 0 && !/\S/.test(text.slice(...p[side]))) {
      let n = 0;
      while (p[0][1] + n < q[0][0] && text[p[side][0] + n] === text[p[side][1] + n] && spend()) n++;
      if (p[0][1] + n === q[0][0] && p.slice(0, 2).every((span, k) => safe(k ? after : before, span[0] + n) && safe(k ? after : before, span[1] + n)))
        for (const span of p.slice(0, 2)) { span[0] += n; span[1] += n; }
    }
    if (p[2] || q[2] || p[0][1] !== q[0][0] || p[1][1] !== q[1][0] ||
      ![p, q].some(r => !/\S/.test(before.slice(...r[0]) + after.slice(...r[1])))) continue;
    const x = [p[0][0], q[0][1]], y = [p[1][0], q[1][1]], keep = /\S/.test(before.slice(...q[0]) + after.slice(...q[1])) ? q : p;
    for (let k; x[0] < x[1] && y[0] < y[1] && /\s/.test(before[x[1] - 1]) && before[x[1] - 1] === after[y[1] - 1] &&
      (k = before.endsWith('\r\n', x[1]) && after.endsWith('\r\n', y[1]) ? 2 : 1) <= Math.min(x[1] - x[0], y[1] - y[0]) &&
      safe(before, x[1] - k) && safe(after, y[1] - k);) { x[1] -= k; y[1] -= k; }
    keep[3][0] = x[0] === x[1] ? 2 : y[0] === y[1] ? 0 : 1;
    c.result.splice(i - 1, 2, [x, y, false, keep[3]]);
  }
  if (!raw && !c.evidence) for (let i = 0; i < c.result.length; i++) {
    const p = c.result[i], q = c.result[i + 1], side = p[0][0] === p[0][1] ? 1 : p[1][0] === p[1][1] ? 0 : -1;
    if (side < 0 || p[2]) continue;
    const text = side ? after : before;
    const room = Math.min((q?.[0][0] ?? endA) - p[0][1], (q?.[1][0] ?? endB) - p[1][1]);
    let n = 0, shift = 0;
    while (n < room && text[p[side][0] + n] === text[p[side][1] + n] && spend()) {
      n++;
      if (text[p[side][0] + n - 1] === '\n' && /^\r?\n/.test(text.slice(p[side][0] + n))) { shift = n; break; }
    }
    if (shift && p.slice(0, 2).every((span, k) => safe(k ? after : before, span[0] + shift) && safe(k ? after : before, span[1] + shift)))
      for (const span of p.slice(0, 2)) { span[0] += shift; span[1] += shift; }
  }
  if (!raw) for (let i = 1; i < c.result.length; i++) {
    const p = c.result[i - 1], q = c.result[i], kind = p[3][0], side = kind ? 1 : 0, text = side ? after : before;
    if (kind % 2 || q[3][0] !== kind || p[2] || q[2] || p[side][1] !== q[side][0] || p[1 - side][0] !== q[1 - side][0]) continue;
    const blank = /^\r?\n/.test(text.slice(...p[side])) && !/^\r?\n/.test(text.slice(...q[side])) && /(\r?\n)(?:[ \t]*\r?\n)+$/.exec(text.slice(...p[side]));
    if (blank && blank.index > 0) p[side][1] = q[side][0] -= blank[0].length - blank[1].length;
  }
}

export function phrases(c) {
  const {before, after, raw, code} = c;
  if (!raw) for (let i = c.result.length - 1; i > 0; i--) {
    const p = c.result[i - 1], q = c.result[i], gap = before.slice(p[0][1], q[0][0]);
    if (p[3][0] !== 1 || q[3][0] !== 1 || p[3][3] || q[3][3] || p[2] || q[2] || gap !== after.slice(p[1][1], q[1][0])) continue;
    const number = /^(?:[.,:/-]\d*)+$/.test(gap) && /\d/.test(before[p[0][1] - 1] + after[p[1][1] - 1]) && /\d/.test(before[q[0][0]] + after[q[1][0]]);
    if (!number && (code || !/^[^\S\r\n]+$/.test(gap) || within(before, p[0][0]) || within(after, p[1][0]) ||
      within(before, q[0][1]) || within(after, q[1][1]))) continue;
    p[0][1] = q[0][1]; p[1][1] = q[1][1]; c.result.splice(i, 1);
  }
  if (!raw && !code) for (let i = 1; i < c.result.length; i++) {
    const p = c.result[i - 1], q = c.result[i], kind = p[3][0], side = kind ? 1 : 0, text = side ? after : before;
    if (kind % 2 || kind !== q[3][0] || p[2] || q[2] || p[3][3] || q[3][3]) continue;
    const open = text.slice(...p[side]), close = text.slice(...q[side]), inner = text.slice(p[side][1], q[side][0]);
    if (!inner.trim() || inner.includes('\n') || !(open === close && /^(?:[*_]{1,3}|~~|==|`+)$/.test(open) ||
      open === '[' && /^\]\([^\s()]*\)$/.test(close))) continue;
    p[3] = q[3] = [kind, 'word', p[3][2], [[p[0][0], q[0][1]], [p[1][0], q[1][1]]]];
  }
}

export function concerns(c) {
  phrases(c);
  const {before, after, spend, safe, budget, raw, code, evidence, structures, initial, options, pa, pb} = c, lb = c.lb;
  const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0];
  const containing = (parts, from, to, out = []) => {
    let lo = 0, hi = parts.length;
    while (lo < hi) { const mid = lo + hi >>> 1; if (parts[mid].end < to) lo = mid + 1; else hi = mid; }
    for (let k = lo; k < parts.length && parts[k].start <= from && spend(); k++)
      if (parts[k].end >= to) { out.push(parts[k]); containing(parts[k].children, from, to, out); }
    return out;
  };
  const touched = (edits, range) => {
    let lo = 0, hi = edits.length;
    while (lo < hi) { const mid = lo + hi >>> 1; if (edits[mid].after[1] <= range[0]) lo = mid + 1; else hi = mid; }
    return lo < edits.length && overlaps(range, edits[lo].after);
  };
  const changes = [], edits = [];
  let normalized;
  const meaning = structures?.[0]?.meaning;
  const format = typeof meaning === 'string' && meaning === structures[1].meaning;
  for (let i = 0; i < c.result.length; i++) {
    const item = c.result[i];
    if (raw === 'char' && !evidence) {
      const a = item[0], b = item[1], next = c.result[i + 1];
      if (item[3][0] !== 1) {
        const room = Math.min((next?.[0][0] ?? before.length) - a[1], (next?.[1][0] ?? after.length) - b[1]);
        let n = 0;
        while (n < room && before[a[0] + n] === after[b[0] + n] && spend()) n++;
        while (n && (!safe(before, a[0] + n) || !safe(before, a[1] + n) || !safe(after, b[0] + n) || !safe(after, b[1] + n))) n--;
        a[0] += n; a[1] += n; b[0] += n; b[1] += n;
      }
      const p = normalized;
      if (p && p[0][0] === p[0][1] && item[3][0] === 2 && p[0][0] === a[0] && p[1][1] === b[0]) {
        p[1][1] = b[1]; if (item[2]) edits.at(-1).coarse = true; continue;
      }
      normalized = item;
    }
    const group = item[3];
    if (!raw && !group[3]) group[3] = [[...item[0]], [...item[1]]];
    if (!group[4]) {
      const context = group[3];
      if (!raw) for (const [text, span] of [[before, context[0]], [after, context[1]]]) {
        const start = within(text, span[0]), end = within(text, span[1]);
        for (let c; start && letter(c = prev(text, span[0])) && spend() && safe(text, span[0] - c.length);) span[0] -= c.length;
        for (let c; end && letter(c = next(text, span[1])) && spend() && safe(text, span[1] + c.length);) span[1] += c.length;
      }
      group[4] = []; changes.push(group);
      if (format) group[0] = 5;
    }
    group[4].push(edits.length);
    edits.push({before: item[0], after: item[1], ...(item[2] ? {coarse: true} : {})});
  }
  if (structures && !raw && budget.left >= 0) {
    const oldNames = new Set(pa.filter(p => p.nameAt).map(p => p.name)), newNames = new Set(pb.filter(p => p.nameAt).map(p => p.name));
    const linksTo = new Map();
    if (spend(pa.length + pb.length + lb.length)) lb.forEach((link, k) => linksTo.set(link.to, [...linksTo.get(link.to) || [], k]));
    for (const change of changes) {
      if (change[0] === 5) continue;
      if (budget.left < 0) break;
      const range = change[3];
      const older = containing(structures[0].parts, ...range[0]), newer = containing(structures[1].parts, ...range[1]);
      const part = (change[0] === 0 ? older : newer).at(-1) || older.at(-1);
      if (!change[2] && part?.name) { change[2] = part.name; change[1] = part.kind; }
      const names = new Set([change[2], ...older.map(p => p.name), ...newer.map(p => p.name)]), breaks = [], affects = [];
      for (const k of [...names].flatMap(name => linksTo.get(name) || []).sort((a, b) => a - b)) {
        const {at, to} = lb[k];
        if (!newNames.has(to)) { if (oldNames.has(to)) breaks.push({at, to}); continue; }
        if (!spend() || touched(edits, at)) continue;
        const p = containing(structures[1].parts, ...at).filter(p => /^(paragraph|call|item|task|cell|declaration)$/.test(p.kind)).at(-1);
        affects.push(p && !touched(edits, [p.start, p.end]) ? [p.start, p.end] : at);
      }
      if (breaks.length) change[6] = breaks;
      if (affects.length) change[5] = affects;
    }
  }
  if (options._stats) Object.assign(options._stats, {work: Math.max(0, initial - Math.max(0, budget.left)), coarse: edits.some(c => c.coarse)});
  const moves = new Map(changes.map((change, i) => change[0] === 3 && [change[3], i + 1]).filter(Boolean));
  return {edits, changes: changes.map(([kind, unit, name, context, owned, affects, breaks], i) => ({
    id: i + 1, kind: ['delete', 'replace', 'insert', 'move', 'rename', 'format'][kind], unit, edits: owned,
    ...(name ? {name} : {}), ...(context ? {context: {before: context[0], after: context[1]}} : {}),
    ...(kind !== 3 && moves.has(context) ? {move: moves.get(context)} : {}),
    ...(affects ? {affects} : {}), ...(breaks ? {breaks} : {})
  }))};
}
