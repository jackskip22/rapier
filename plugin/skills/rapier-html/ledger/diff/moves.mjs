// SPDX-License-Identifier: MIT
import {separate, phrases} from './concerns.mjs';

// Moves bind equal transported fragments at both ends; renames group a binding's sites.
export function moves(c) {
  const {before, after, spend, safe, budget, raw, code, tokens, matches, walk, structures, pa, pb, la, aliases} = c;
  const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0];
  const inside = (c, a, b) => [a, b].every((range, side) => c[side][0] === c[side][1] ||
    c[side][0] >= range[0] && c[side][1] <= range[1]);
  try { if (!raw && budget.left >= 0) {
    const check = n => { if (!spend(n)) throw null; };
    // Split transported text at wording boundaries; positions and words own distinct edits.
    const deleted = new Map();
    const moveKey = (item, side, text, parts = []) => {
      const [from, to] = item[side];
      let k = 0, hi = parts.length;
      while (k < hi) { const mid = k + hi >>> 1; if (parts[mid].start < from) k = mid + 1; else hi = mid; }
      for (; k < parts.length && parts[k].start <= to; k++) {
        const p = parts[k]; check(1);
        if (p.end <= to && p.name === item[3][2] && !/\S/.test(text.slice(from, p.start) + text.slice(p.end, to))) return item[3][1] + '\0' + item[3][2];
      }
      return text.slice(from, to).trim();
    };
    for (const item of c.result) if (item[3][0] === 0 && !item[2]) {
      const value = before.slice(...item[0]), key = moveKey(item, 0, before, pa);
      if (item[3][2] || value.trim().length >= 4 && /[\n ]/.test(value)) deleted.set(key, deleted.has(key) ? null : item);
    }
    for (const item of c.result) if (item[3][0] === 2 && !item[2]) {
      const value = after.slice(...item[1]), key = moveKey(item, 1, after, pb);
      let old = deleted.get(key), score = 0;
      // Edited wording still travels: plain text, or a prose part of the same kind.
      const text = value.trim(), prose = !structures || /^(paragraph|item|task|row|quote|section)$/.test(item[3][1]);
      if (!old && prose && text.length >= 24) for (const candidate of deleted.values()) {
        check(1);
        if (!candidate || candidate[4] || candidate[3][1] !== item[3][1]) continue;
        const prior = before.slice(...candidate[0]).trim();
        const a = tokens(prior, 0, prior.length, 2), b = tokens(text, 0, text.length, 2);
        if (!a || !b) throw null;
        const n = matches(a[0], b[0]).reduce((n, j, i) => n + a[1][i + 1] - a[1][i], 0);
        check(0);
        if (n * 5 > Math.max(prior.length, text.length) * 3 && n >= score) { old = n === score ? null : candidate; score = n; }
      }
      if (!old || old[4]) continue;
      // Separators that only one end carries stay outside the transported text.
      const x = [...old[0]], y = [...item[1]];
      for (const end of [0, 1]) {
        const pattern = end ? /\s*$/ : /^\s*/, left = before.slice(...x).match(pattern)[0], right = after.slice(...y).match(pattern)[0];
        let common = 0;
        while (common < Math.min(left.length, right.length) && left.at(end ? common : -1 - common) === right.at(end ? common : -1 - common)) common++;
        const dx = (left.length - common) * (end ? -1 : 1), dy = (right.length - common) * (end ? -1 : 1);
        if (safe(before, x[end] + dx) && safe(after, y[end] + dy)) { x[end] += dx; y[end] += dy; }
      }
      const outer = c.result; c.result = [];
      walk(...x, ...y, 1);
      // A changed heading can occupy a whole line while its marker still anchors the move.
      if (c.result.length && (c.result[0][0][0] === x[0] || c.result[0][1][0] === y[0] ||
        c.result.at(-1)[0][1] === x[1] || c.result.at(-1)[1][1] === y[1])) {
        c.result = []; walk(...x, ...y, 2);
      }
      separate(c, x[1], y[1]);
      phrases(c);
      const inner = c.result; c.result = outer;
      // Equal boundary fragments make the exact extent recoverable without display context.
      if (inner.length && (inner[0][0][0] === x[0] || inner[0][1][0] === y[0] ||
        inner.at(-1)[0][1] === x[1] || inner.at(-1)[1][1] === y[1] || inner.some(c => c[2]))) continue;
      const move = [3, item[3][2] ? item[3][1] : code ? 'line' : 'block', item[3][2], [x, y]];
      old[4] = []; item[4] = [];
      const fragment = (a0, a1, b0, b1, group) => {
        if (a0 < a1) old[4].push([[a0, a1], [old[1][0], old[1][0]], false, group]);
        if (b0 < b1) item[4].push([[item[0][0], item[0][0]], [b0, b1], false, group]);
      };
      // Unmatched outer separators travel with the move, so restoring it alone keeps blocks apart.
      fragment(old[0][0], x[0], 0, 0, move); fragment(0, 0, item[1][0], y[0], move);
      let a = x[0], b = y[0], wording;
      for (const edit of inner) {
        if (edit[3][3]) wording = edit[3];
        else if (a !== edit[0][0] || b !== edit[1][0]) wording = [edit[3][0], edit[3][1]];
        wording[2] = item[3][2]; wording[3] = move[3];
        if (wording[0] !== edit[3][0]) wording[0] = 1;
        fragment(a, edit[0][0], b, edit[1][0], move);
        fragment(...edit[0], ...edit[1], wording);
        a = edit[0][1]; b = edit[1][1];
      }
      fragment(a, x[1], b, y[1], move);
      fragment(x[1], old[0][1], 0, 0, move);
      fragment(0, 0, y[1], item[1][1], move);
    }
    c.result = c.result.flatMap(item => item[4] || [item]);

    if (structures) {
      check(la.length * Math.ceil(Math.log2(la.length + 1)) + c.lb.length + pa.length + pb.length);
      const mapped = {}; let cursor = 0, delta = 0;
      for (const link of [...la].sort((a, b) => a.at[0] - b.at[0])) {
        while (cursor < c.result.length && c.result[cursor][0][1] <= link.at[0]) { delta = c.result[cursor][1][1] - c.result[cursor][0][1]; cursor++; }
        if (cursor === c.result.length || c.result[cursor][0][0] >= link.at[1]) mapped[[link.at[0] + delta, link.at[1] + delta]] = link.to;
      }
      c.lb = c.lb.map(l => l.key != null ? l : {...l, to: mapped[l.at] || l.to});
      for (const [p, old] of aliases) {
        if (before.slice(...old.nameAt) === after.slice(...p.nameAt)) continue;
        check(la.length + c.lb.length);
        const left = la.filter(l => l.key === old.key), right = c.lb.filter(l => l.key === p.key);
        if (left.length !== right.length) continue;
        const x = [old.nameAt], y = [p.nameAt], owned = [];
        for (let i = 0; i < left.length; i++) {
          x.push(left[i].at); y.push(right[i].at);
          if (left[i].labelAt && right[i].labelAt && before.slice(...left[i].labelAt) === before.slice(...old.nameAt) &&
            after.slice(...right[i].labelAt) === after.slice(...p.nameAt)) { x.push(left[i].labelAt); y.push(right[i].labelAt); }
        }
        x.sort((a, b) => a[0] - b[0]); y.sort((a, b) => a[0] - b[0]);
        let complete = true;
        for (let i = 0; i < x.length; i++) {
          check(c.result.length * 2);
          if (c.result.some(c => c[3]?.[0] !== 3 && (overlaps(c[0], x[i]) || overlaps(c[1], y[i])) && !inside(c, x[i], y[i]))) { complete = false; break; }
          const found = c.result.filter(c => c[3][0] < 3 && inside(c, x[i], y[i]));
          if (!found.length) { complete = false; break; }
          owned.push(...found);
        }
        if (!complete) continue;
        check(c.result.length + owned.length * 2);
        const owners = new Set(owned.map(c => c[3]).filter(Boolean)), members = new Set(owned);
        if (c.result.some(c => owners.has(c[3]) && !members.has(c))) continue;
        const group = [4, p.kind, old.name, [[...old.nameAt], [...p.nameAt]]];
        for (const item of owned) item[3] = group;
      }
    }
  } } catch (error) {
    if (error !== null) throw error;
    c.result = c.result.flatMap(item => item[4] || [item]);
  }
}
