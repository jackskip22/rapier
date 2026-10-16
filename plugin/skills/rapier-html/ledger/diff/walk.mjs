// SPDX-License-Identifier: MIT
import {words, letter, within, prev, next} from './tokens.mjs';

// Exact source records for a range: lines, then words, then characters, or structural parts when supplied.
export function walker(c) {
  const {before, after, spend, safe, budget, raw, chars, code, segmenter, tokens, matches} = c;
  function record(a0, a1, b0, b1, unit, part, coarse = false) {
    if (a1 - a0 === b1 - b0 && before.slice(a0, a1) === after.slice(b0, b1)) return;
    // Internal records: before, after, coarse, concern, transported fragments.
    c.result.push([[a0, a1], [b0, b1], coarse, [a0 === a1 ? 2 : b0 === b1 ? 0 : 1, part?.kind || unit, part?.name]]);
  }

  // A line deletion or insertion holding whole named parts and only blank text besides is one record per part,
  // cut at line starts, so each keeps its own name (and its callers' breaks).
  function name(from, ownersA, ownersB) {
    for (let r = from; r < c.result.length; r++) {
      const [[a0, a1], [b0, b1]] = c.result[r], side = a0 === a1 ? 1 : b0 === b1 ? 0 : -1;
      if (side < 0) continue;
      const [s0, s1] = c.result[r][side], text = side ? after : before;
      const parts = (side ? ownersB : ownersA).filter(part => part?.name && part.start >= s0 && part.end <= s1);
      if (!parts.length || !spend(s1 - s0)) continue;
      let blank = text.slice(s0, parts[0].start);
      for (let k = 1; k <= parts.length; k++) blank += text.slice(parts[k - 1].end, parts[k]?.start ?? s1);
      if (/\S/.test(blank)) continue;
      const rows = parts.map((part, k) => {
        const start = k ? Math.max(parts[k - 1].end, text.lastIndexOf('\n', part.start - 1) + 1) : s0;
        return [start, part];
      });
      c.result.splice(r, 1, ...rows.map(([start, part], k) => {
        const end = rows[k + 1]?.[0] ?? s1, here = [side ? [a0, a0] : [start, end], side ? [start, end] : [b0, b0]];
        return [here[0], here[1], false, [side ? 2 : 0, part.kind, part.name]];
      }));
      r += rows.length - 1;
    }
  }

  // A search step scans at most one fixed-size source chunk.
  function common(a, b, end, step) {
    let n = 0;
    while (n < end && spend()) {
      const stop = Math.min(end, n + 256);
      while (n < stop && before.charCodeAt(a) === after.charCodeAt(b)) { n++; a += step; b += step; }
      if (n < stop) break;
    }
    return n;
  }

  function walk(a0, a1, b0, b1, level, ap, bp, context) {
    if (a1 - a0 === b1 - b0 && before.slice(a0, a1) === after.slice(b0, b1)) return;
    if (!spend()) { record(a0, a1, b0, b1, 'block', context, true); return; }
    const structural = level <= 0 && level > -128 && (ap?.length || bp?.length);
    if (!structural && raw !== 'word') {
      let n = common(a0, b0, Math.min(a1 - a0, b1 - b0), 1);
      while (n && (!safe(before, a0 + n) || !safe(after, b0 + n) || !raw && level < 3 && (within(before, a0 + n) || within(after, b0 + n)))) {
        if (!spend()) { n = 0; break; } n--;
      }
      if (level === 1 && n) {
        const next = Math.max(0, before.lastIndexOf('\n', a0 + n - 1) + 1 - a0);
        spend(Math.ceil((n - next) / 256)); n = next;
      }
      a0 += n; b0 += n;
      n = common(a1 - 1, b1 - 1, Math.min(a1 - a0, b1 - b0), -1);
      while (n && (!safe(before, a1 - n) || !safe(after, b1 - n) || !raw && level < 3 && (within(before, a1 - n) || within(after, b1 - n)))) {
        if (!spend()) { n = 0; break; } n--;
      }
      if (level === 1) while (n && (before[a1 - n - 1] !== '\n' || after[b1 - n - 1] !== '\n' || before[a1 - n] === '\n' || after[b1 - n] === '\n')) { if (!spend()) { n = 0; break; } n--; }
      a1 -= n; b1 -= n;
      if (budget.left < 0) { record(a0, a1, b0, b1, 'block', context, true); return; }
    }
    let unit = level >= 3 ? 'char' : level === 2 ? 'word' : 'line';
    if (!raw && level === 2 && a1 - a0 + b1 - b0 <= 4 && [...before.slice(a0, a1), ...after.slice(b0, b1)].length <= 2 &&
    letter(prev(before, a0) || prev(after, b0)) && letter(next(before, a1) || next(after, b1))) unit = 'char';
    if (!structural && (a0 === a1 || b0 === b1)) { record(a0, a1, b0, b1, unit, context); return; }
    const left = tokens(before, a0, a1, structural ? 0 : Math.max(1, level), ap);
    const right = tokens(after, b0, b1, structural ? 0 : Math.max(1, level), bp);
    if (!left || !right) { record(a0, a1, b0, b1, unit, context, true); return; }
    const [a, x, ownersA] = left, [b, y, ownersB] = right, pairs = matches(a, b);
    let ai = 0, bi = 0;
    for (let i = 0; i <= a.length; i++) {
      const j = i === a.length ? b.length : pairs[i];
      if (j === undefined) continue;
      const x0 = x[ai], x1 = x[i], y0 = y[bi], y1 = y[j];
      if (ai < i || bi < j) {
        if (budget.left < 0 || pairs.coarse?.has(ai)) record(x0, x1, y0, y1, unit, context, true);
        else if (structural && (ai === i || bi === j)) {
          for (let k = ai; k < i; k++) record(x[k], x[k + 1], y0, y0, unit, ownersA[k] || context);
          for (let k = bi; k < j; k++) record(x1, x1, y[k], y[k + 1], unit, ownersB[k] || context);
        } else if (structural) {
          const p = ownersA[ai], q = ownersB[bi];
          if (i - ai === 1 && j - bi === 1 && p && q && p.kind === q.kind) walk(x0, x1, y0, y1, level - 1, p.children, q.children, q);
          else {
            const from = c.result.length;
            walk(x0, x1, y0, y1, 1, null, null, context);
            name(from, ownersA.slice(ai, i), ownersB.slice(bi, j));
          }
        } else if (level < 2 && raw !== 'line') lines(x.slice(ai, i + 1), y.slice(bi, j + 1), context);
        else if (level === 2 && chars && !raw && i - ai <= 1 && j - bi <= 1 && x1 - x0 + y1 - y0 < 100) {
          // A changed token is replaced whole unless the caller asks for the characters inside it.
          walk(x0, x1, y0, y1, 3, null, null, context);
        } else record(x0, x1, y0, y1, unit, context);
      }
      if (i < a.length) {
        const p = ownersA[i], q = ownersB[j];
        if ((p || q || level <= 1 && !raw) && before.slice(x[i], x[i + 1]) !== after.slice(y[j], y[j + 1]))
          walk(x[i], x[i + 1], y[j], y[j + 1], p || q ? level - 1 : 3, p?.children, q?.children, q || p || context);
      }
      ai = i + 1; bi = j + 1;
    }
  }

  // Unequal lines pair in order by shared words. A line sharing under a quarter of its words with every candidate is
  // replaced whole: an inserted line never borrows a neighbour's words, and a rewrite never reads as stray fragments.
  function lines(x, y, context) {
    const n = x.length - 1, m = y.length - 1;
    if (n * m > 4096 || !spend(n * m + x[n] - x[0] + y[m] - y[0])) return row(x[0], x[n], y[0], y[m], context);
    // A renamed name's sites count as shared words.
    if (!c.renames) {
      c.renames = [[], []];
      for (const [p, old] of c.aliases || []) if (before.slice(...old.nameAt) !== after.slice(...p.nameAt)) {
        c.renames[0].push(old.nameAt, ...c.la.filter(l => l.key === old.key).map(l => l.at));
        c.renames[1].push(p.nameAt, ...c.lb.filter(l => l.key === p.key).map(l => l.at));
      }
    }
    const weight = (side, a, b) => {
      const counts = new Map(), text = side ? after : before;
      for (const [c, d] of words(segmenter, text.slice(a, b))) counts.set(text.slice(a + c, a + d), (counts.get(text.slice(a + c, a + d)) || 0) + d - c);
      return [counts, [...counts.values()].reduce((n, v) => n + v, 0), c.renames[side].reduce((n, at) => n + Math.max(0, Math.min(b, at[1]) - Math.max(a, at[0])), 0)];
    };
    const left = x.slice(0, -1).map((at, k) => weight(0, at, x[k + 1])), right = y.slice(0, -1).map((at, k) => weight(1, at, y[k + 1]));
    const best = Array.from({length: n + 1}, () => new Float64Array(m + 1)), pairs = [];
    for (let k = 1; k <= n; k++) for (let l = 1; l <= m; l++) {
      const [a, sa, ra] = left[k - 1], [b, sb, rb] = right[l - 1];
      let shared = sa || sb ? Math.max(ra, rb) : 0.5;
      for (const [key, v] of a) shared += Math.min(v, b.get(key) || 0);
      best[k][l] = Math.max(best[k - 1][l], best[k][l - 1], shared * 4 > Math.max(sa, sb) && best[k - 1][l - 1] + shared);
    }
    for (let k = n, l = m; k && l;) {
      if (best[k][l] === best[k - 1][l]) k--;
      else if (best[k][l] === best[k][l - 1]) l--;
      else pairs.unshift([--k, --l]);
    }
    let k = 0, l = 0;
    for (const [p, q] of [...pairs, [n, m]]) {
      // A merge compares one line against one line by character, whatever they share.
      if (raw === 'char' && p - k === 1 && q - l === 1) row(x[k], x[p], y[l], y[q], context);
      else if (k < p || l < q) record(x[k], x[p], y[l], y[q], 'line', context);
      if (p < n) row(x[p], x[p + 1], y[q], y[q + 1], context);
      k = p + 1; l = q + 1;
    }
  }

  // A table row with the same number of cells on both sides changes cell by cell; a character diff stays in its line.
  function row(a0, a1, b0, b1, context) {
    if (raw === 'char') return walk(a0, a1, b0, b1, 3, null, null, context);
    const cells = (text, a, b) => /^[ \t]*\|/.test(text.slice(a, b)) && [...text.slice(a, b).matchAll(/(?<!\\)\|/g)].map(m => a + m.index);
    const p = !code && cells(before, a0, a1), q = p && cells(after, b0, b1);
    if (!q || p.length !== q.length || !spend(p.length)) return walk(a0, a1, b0, b1, 2, null, null, context);
    for (let k = 0; k <= p.length; k++) walk(k ? p[k - 1] + 1 : a0, p[k] ?? a1, k ? q[k - 1] + 1 : b0, q[k] ?? b1, 2, null, null, context);
  }

  // Surviving source pieces keep the occurrence witnessed by the host.
  function operations(rows) {
    if (!Array.isArray(rows)) return null;
    const pieces = [[0, before.length]];
    let length = before.length, steps = 1e7;
    const verify = n => {
      if ((steps -= n) >= 0) return true;
      budget.left = -1; return false;
    };
    const split = at => {
      let position = 0;
      for (let i = 0; i < pieces.length; i++) {
        const [start, end, text] = pieces[i], size = end - start;
        if (position === at) return i;
        if (position + size > at) {
          const n = at - position;
          pieces.splice(i, 1, [start, start + n, text], [start + n, end, text]);
          return i + 1;
        }
        position += size;
      }
      return pieces.length;
    };
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.pos) || typeof row.removed !== 'string' || typeof row.inserted !== 'string' ||
        row.pos < 0 || row.pos + row.removed.length > length || !verify(pieces.length * 2 + 1)) return null;
      const left = split(row.pos), right = split(row.pos + row.removed.length);
      let at = 0;
      for (let i = left; i < right; i++) {
        const [start, end, text = before] = pieces[i];
        if (!row.removed.startsWith(text.slice(start, end), at)) return null;
        at += end - start;
      }
      if (row.removed === row.inserted) continue;
      pieces.splice(left, right - left, [0, row.inserted.length, row.inserted]);
      length += row.inserted.length - row.removed.length;
    }
    if (length !== after.length) return null;
    const spans = [];
    let a = 0, b = 0, at = 0;
    for (const [start, end, text] of pieces) {
      const size = end - start;
      if (!verify(1) || !after.startsWith((text ?? before).slice(start, end), at)) return null;
      if (text === undefined) {
        let x = start, y = at, tail = end;
        while (x < tail && (!safe(before, x) || !safe(after, y))) { x++; y++; if (!verify(1)) return null; }
        while (tail > x && (!safe(before, tail) || !safe(after, at + tail - start))) { tail--; if (!verify(1)) return null; }
        if (tail > x) {
          if (a !== x || b !== y) spans.push([a, x, b, y]);
          a = tail; b = at + tail - start;
        }
      }
      at += size;
    }
    if (a !== before.length || b !== after.length) spans.push([a, before.length, b, after.length]);
    return spans;
  }
  return {record, name, walk, operations};
}
