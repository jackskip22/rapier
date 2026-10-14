// SPDX-License-Identifier: MIT
// Capture only the reader contract before another observation can reuse its objects.
function observe(text, reader, spend, safe, references = true, lenient = false) {
  let value;
  try { value = reader(text); } catch { return null; }
  try {
    const flat = [], links = [], meaning = references && value?.meaning;
    const span = (at, from, end) => {
      if (!Array.isArray(at) || at.length !== 2 || !at.every(Number.isSafeInteger) ||
          at[0] < from || at[1] < at[0] || at[1] > end) throw null;
      if (safe(text, at[0]) && safe(text, at[1])) return [at[0], at[1]];
      if (!lenient) throw null;
    };
    const scalar = (value, key = false) => {
      if (value != null && typeof value !== 'string' && !(key && (typeof value === 'boolean' || Number.isFinite(value)))) throw false;
      return value;
    };
    let count = 0;
    function copy(rows, from, end, depth, retained = true) {
      if (!Array.isArray(rows) || rows.length > 131072 || depth > 128) throw null;
      const parts = [];
      let at = from;
      for (const row of rows) {
        if (!spend() || count++ >= 131072) throw null;
        const {start, end: stop, kind, name, key, nameAt, children} = row;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop) ||
            start < at || stop < start || stop > end) throw null;
        at = stop;
        const usable = safe(text, start) && safe(text, stop);
        if (!usable && !lenient) throw null;
        const part = {start, end: stop, kind: scalar(kind), name: scalar(name), key: scalar(key, true)};
        if (nameAt != null) part.nameAt = span(nameAt, start, stop);
        // Discard unsafe evidence only after validating its complete subtree.
        if (retained && usable) { parts.push(part); flat.push(part); }
        part.children = children == null ? [] : copy(children, start, stop, depth + 1, retained && usable);
      }
      return parts;
    }
    const parts = copy(value?.parts, 0, text.length, 0), rows = references && value.links || [];
    if (!Array.isArray(rows) || rows.length > 131072) throw null;
    for (const row of rows) {
      if (!spend()) throw null;
      const {at, to, key, labelAt} = row;
      if (typeof to !== 'string') throw null;
      const place = span(at, 0, text.length), label = labelAt == null ? null : span(labelAt, 0, text.length), binding = scalar(key, true);
      if (place) links.push({at: place, to, key: binding, ...(label && {labelAt: label})});
    }
    return {parts, flat, links, meaning: typeof meaning === 'string' ? meaning : undefined};
  } catch (error) { return error === false ? {invalid: true} : null; }
}

// Segment only requested non-ASCII boundaries; observations never share a global document cache.
function boundaries() {
  const segments = Object.create(null);
  let segmenter;
  return function safe(text, at) {
    if (!at || at === text.length) return true;
    const a = text.charCodeAt(at - 1), b = text.charCodeAt(at);
    if ((a & 0xfc00) === 0xd800 && (b & 0xfc00) === 0xdc00 || a === 13 && b === 10) return false;
    if (a < 0x300 && b < 0x300) return true;
    return (segments[text] ||= (segmenter ||= new Intl.Segmenter('en', {granularity: 'grapheme'})).segment(text)).containing(at).index === at;
  }
}

export function diff(before, after, options = {}) {
  if (before === after) return {edits: [], changes: []};
  const budget = options._budget || {left: Number.isFinite(options.limit) ? Math.max(0, options.limit) : 1e7};
  const initial = budget.left, raw = options._unit;
  let result = [], code = options.as === 'code', structures, pa, pb, la, lb, aliases;
  const spend = (n = 1) => (budget.left -= n) >= 0;
  const letter = c => c && /[\p{L}\p{M}\p{N}_]/u.test(c), within = (text, at) => letter(text[at - 1]) && letter(text[at]);
  const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0];
  const inside = (c, a, b) => [a, b].every((range, side) => c[side][0] === c[side][1] ||
    c[side][0] >= range[0] && c[side][1] <= range[1]);
  if (options.as !== 'prose' && options.as !== 'code') code = /(?:^|\n)\s*(?:[{}]|(?:function|class|const|let|var|import|export|def|fn|func|package)\s+\w[^]{0,80}[({=:;])/.test(before.slice(0, 4096) + after.slice(0, 4096));

  const safe = boundaries();

  function record(a0, a1, b0, b1, unit, part, coarse = false) {
    if (a1 - a0 === b1 - b0 && before.slice(a0, a1) === after.slice(b0, b1)) return;
    // Internal records: before, after, coarse, concern, transported fragments.
    result.push([[a0, a1], [b0, b1], coarse, [a0 === a1 ? 2 : b0 === b1 ? 0 : 1, part?.kind || unit, part?.name]]);
  }

  function tokens(text, start, end, level, parts) {
    // Each source boundary is stored once, alongside comparison keys and optional owners.
    const keys = [], at = [start], owners = [];
    const out = [keys, at, owners];
    const add = (a, b, part, value) => {
      if (b <= a) return;
      if (!part && owners[keys.length - 1]?.name && !/\S/.test(text.slice(a, b))) at[at.length - 1] = b;
      else {
        at.push(b); if (part) owners[keys.length] = part;
        const key = part?.name ? '\0' + part.kind + '\0' + (aliases?.get(part)?.name || part.name) : value ?? text.slice(a, b);
        keys.push(level === 1 && !raw ? key.trimEnd() : key);
      }
    };
    if (parts?.length && level === 0) {
      let at = start;
      for (const part of parts) {
        if (!spend() || keys.length >= 131072) return null;
        if (part.start < at || part.end <= part.start || part.end > end) continue;
        if (at < part.start) add(at, part.start);
        add(part.start, part.end, part); at = part.end;
      }
      add(at, end); return keys.length > 131072 ? null : out;
    }
    const pattern = level === 1 ? /[^\n]*\n(?:\r?\n)*|[^\n]+$/g : level === 2 ? /[\p{L}\p{M}\p{N}_]+|[^\S\r\n]+|\r\n|[^]/gu : /[^]/gu;
    pattern.lastIndex = start;
    let match;
    while (pattern.lastIndex < end && (match = pattern.exec(text))) {
      if (!spend() || keys.length >= 131072) return null;
      const a = match.index, b = Math.min(end, pattern.lastIndex);
      if (keys.length && !safe(text, a)) {
        at[at.length - 1] = b; keys[keys.length - 1] = text.slice(at[at.length - 2], b);
      } else add(a, b, undefined, b === pattern.lastIndex ? match[0] : undefined);
      if (b === end) break;
    }
    return out;
  }

  // Unique anchors and fallback equal pairs share one bounded subsequence search.
  function matches(a, b) {
    const found = new Array(a.length), pending = [[0, a.length, 0, b.length]];
    let nodes = 0;
    while (pending.length) {
      let [a0, a1, b0, b1] = pending.pop();
      while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) found[a0++] = b0++;
      while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) found[--a1] = --b1;
      if (a0 === a1 || b0 === b1 || !spend(a1 - a0 + b1 - b0)) continue;
      const positions = Object.create(null), tails = [];
      for (let j = b0; j < b1; j++) {
        const key = b[j];
        (positions[key] ||= [0]).push(j);
      }
      for (let i = a0; i < a1; i++) {
        const list = positions[a[i]]; if (list) list[0]++;
      }
      let unique = 0;
      if (a1 - a0 + b1 - b0 > 32) {
        let count = 0;
        for (const list of Object.values(positions)) {
          count += list[0] * (list.length - 1);
          if (list[0] === 1 && list.length === 2) unique++;
        }
        if (!count) continue;
        // A chain is admitted only after visiting every candidate. Reject a
        // search whose mandatory visits cannot fit before allocating its nodes.
        if ((unique || count) > Math.min(131072 - nodes, budget.left)) {
          // Repetitive text has too many equal pairs; a shortest script needs no anchors.
          if (!shortest(a, b, a0, a1, b0, b1, found) && budget.left >= 0) (found.coarse ||= new Set()).add(a0);
          continue;
        }
      }
      search: for (let i = a0; i < a1; i++) {
        const list = positions[a[i]];
        if (!list || unique && (list[0] !== 1 || list.length !== 2)) continue;
        for (let p = list.length - 1; p > 0; p--) {
          if (!spend() || ++nodes > 131072) { budget.left = -1; break search; }
          const j = list[p];
          let lo = 0, hi = tails.length;
          while (lo < hi) {
            if (!spend()) break search;
            const middle = lo + hi >>> 1;
            if (tails[middle][1] < j) lo = middle + 1; else hi = middle;
          }
          tails[lo] = [i, j, tails[lo - 1]];
        }
      }
      if (budget.left < 0) continue;
      const chain = [];
      for (let node = tails.at(-1); node; node = node[2]) chain.push(node);
      chain.reverse();
      let x = a0, y = b0;
      for (const [i, j] of chain) {
        found[i] = j;
        if (unique && x < i && y < j) pending.push([x, i, y, j]);
        x = i + 1; y = j + 1;
      }
      if (unique && x < a1 && y < b1) pending.push([x, a1, y, b1]);
    }
    return found;
  }

  // Myers' greedy search: O((N + M) D) steps; each frontier is kept for the backward pass.
  function shortest(a, b, a0, a1, b0, b1, found) {
    const n = a1 - a0, m = b1 - b0, v = new Int32Array(2 * (n + m) + 3), o = n + m + 1, trace = [];
    for (let d = 0; d <= 2048 && spend(2 * d + 1); d++) {
      trace.push(v.slice(o - d, o + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || k !== d && v[o + k - 1] < v[o + k + 1] ? v[o + k + 1] : v[o + k - 1] + 1, y = x - k;
        while (x < n && y < m && a[a0 + x] === b[b0 + y] && spend()) { x++; y++; }
        v[o + k] = x;
        if (x < n || y < m) continue;
        for (x = n, y = m; d >= 0; d--) {
          const w = trace[d], k = x - y, prev = k === -d || k !== d && w[d + k - 1] < w[d + k + 1] ? k + 1 : k - 1;
          const px = d ? w[d + prev] : 0, py = px - prev;
          while (x > px && y > py) if (a[a0 + --x] === b[b0 + --y]) found[a0 + x] = b0 + y;
          x = px; y = py;
        }
        return true;
      }
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
    if (!raw && level === 2 && a1 - a0 + b1 - b0 <= 2 && letter(before[a0 - 1] || after[b0 - 1]) && letter(before[a1] || after[b1])) unit = 'char';
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
          else walk(x0, x1, y0, y1, 1, null, null, context);
        } else if (level < 2 && raw !== 'line') walk(x0, x1, y0, y1, raw === 'char' ? 3 : 2, null, null, context);
        else if (level === 2 && !raw && i - ai <= 1 && j - bi <= 1 && x1 - x0 + y1 - y0 < 100) {
          const start = result.length;
          walk(x0, x1, y0, y1, 3, null, null, context);
          const edits = result.slice(start);
          // A letter-sized correction stays a letter; any other word change marks the whole word.
          if (edits.length !== 1 || edits[0][0][1] - edits[0][0][0] + edits[0][1][1] - edits[0][1][0] > Math.max(2, (x1 - x0 + y1 - y0) / 3)) {
            result.length = start; record(x0, x1, y0, y1, unit, context);
          }
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

  if (options.structure && (!raw || options._structure)) {
    try {
      structures = options._observed || [observe(before, options.structure, spend, safe), observe(after, options.structure, spend, safe)];
      if (structures.some(value => !value || value.invalid)) throw null;
      [pa, pb] = structures.map(value => value.flat); [la, lb] = structures.map(value => value.links);
      aliases = new Map();
      const oldByKey = new Map(pa.filter(p => p.key != null).map(p => [p.key, p]));
      const oldNames = new Set(pa.map(p => p.name)), newNames = new Set(pb.map(p => p.name));
      for (const p of pb) {
        const old = oldByKey.get(p.key);
        if (old?.nameAt && p.nameAt && old.kind === p.kind && !oldNames.has(p.name) && !newNames.has(old.name)) aliases.set(p, old);
      }
    } catch { structures = undefined; code = true; }
  }
  const evidence = options.from && operations(options.from);
  if (evidence) for (const span of evidence) walk(...span, structures ? 0 : raw === 'char' ? 3 : 1, pa, pb);
  else walk(0, before.length, 0, after.length, structures ? 0 : raw === 'char' ? 3 : raw === 'word' ? 2 : 1,
    structures?.[0]?.parts, structures?.[1]?.parts);

  // A separator-only piece beside another edit joins it; equal separators at its ends stay unchanged.
  if (!raw) for (let i = result.length - 1; i > 0; i--) {
    const p = result[i - 1], q = result[i], side = p[0][0] === p[0][1] ? 1 : p[1][0] === p[1][1] ? 0 : -1, text = side ? after : before;
    if (side >= 0 && !/\S/.test(text.slice(...p[side]))) {
      let n = 0;
      while (p[0][1] + n < q[0][0] && text[p[side][0] + n] === text[p[side][1] + n]) n++;
      if (p[0][1] + n === q[0][0] && p.slice(0, 2).every((span, k) => safe(k ? after : before, span[0] + n) && safe(k ? after : before, span[1] + n)))
        for (const span of p.slice(0, 2)) { span[0] += n; span[1] += n; }
    }
    if (p[2] || q[2] || p[0][1] !== q[0][0] || p[1][1] !== q[1][0] ||
      ![p, q].some(r => !/\S/.test(before.slice(...r[0]) + after.slice(...r[1])))) continue;
    const x = [p[0][0], q[0][1]], y = [p[1][0], q[1][1]], keep = /\S/.test(before.slice(...q[0]) + after.slice(...q[1])) ? q : p;
    while (x[0] < x[1] && y[0] < y[1] && /\s/.test(before[x[1] - 1]) && before[x[1] - 1] === after[y[1] - 1] &&
      safe(before, x[1] - 1) && safe(after, y[1] - 1)) { x[1]--; y[1]--; }
    keep[3][0] = x[0] === x[1] ? 2 : y[0] === y[1] ? 0 : 1;
    result.splice(i - 1, 2, [x, y, false, keep[3]]);
  }
  try { if (!raw && budget.left >= 0) {
    const check = n => { if (!spend(n)) throw null; };
    // Split transported text at wording boundaries; positions and words own distinct edits.
    const deleted = new Map();
    const moveKey = (item, side, text, parts = []) => {
      check(parts.length);
      return parts.some(p => p.start === item[side][0] && p.end <= item[side][1] && p.name === item[3][2] && !/\S/.test(text.slice(p.end, item[side][1])))
        ? item[3][1] + '\0' + item[3][2] : text.slice(...item[side]).trim();
    };
    for (const item of result) if (item[3][0] === 0 && !item[2]) {
      const value = before.slice(...item[0]), key = moveKey(item, 0, before, pa);
      if (item[3][2] || value.trim().length >= 4 && /[\n ]/.test(value)) deleted.set(key, deleted.has(key) ? null : item);
    }
    for (const item of result) if (item[3][0] === 2 && !item[2]) {
      const value = after.slice(...item[1]), key = moveKey(item, 1, after, pb);
      let old = deleted.get(key), score = 0;
      if (!old && !structures && key.length >= 24) for (const [prior, candidate] of deleted) {
        if (!candidate || candidate[4]) continue;
        const a = tokens(prior, 0, prior.length, 2), b = tokens(key, 0, key.length, 2);
        if (!a || !b) throw null;
        const n = matches(a[0], b[0]).reduce((n, j, i) => n + a[1][i + 1] - a[1][i], 0);
        check(0);
        if (n * 5 > Math.max(prior.length, key.length) * 3 && n >= score) { old = n === score ? null : candidate; score = n; }
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
      const outer = result; result = [];
      walk(...x, ...y, 1);
      const inner = result; result = outer;
      // Equal boundary fragments make the exact extent recoverable without display context.
      if (inner.length && (inner[0][0][0] === x[0] || inner[0][1][0] === y[0] ||
        inner.at(-1)[0][1] === x[1] || inner.at(-1)[1][1] === y[1] || inner.some(c => c[2]))) continue;
      const move = [3, item[3][2] ? item[3][1] : code ? 'line' : 'block', item[3][2], [x, y]];
      old[4] = []; item[4] = [];
      const fragment = (a0, a1, b0, b1, group) => {
        if (a0 < a1) old[4].push([[a0, a1], [old[1][0], old[1][0]], false, group]);
        if (b0 < b1) item[4].push([[item[0][0], item[0][0]], [b0, b1], false, group]);
      };
      fragment(old[0][0], x[0], 0, 0, [0, 'char']); fragment(0, 0, item[1][0], y[0], [2, 'char']);
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
      fragment(x[1], old[0][1], 0, 0, [0, 'char']);
      fragment(0, 0, y[1], item[1][1], [2, 'char']);
    }
    result = result.flatMap(item => item[4] || [item]);

    if (structures) {
      check(la.length * Math.ceil(Math.log2(la.length + 1)) + lb.length + pa.length + pb.length);
      const mapped = {}; let cursor = 0, delta = 0;
      for (const link of [...la].sort((a, b) => a.at[0] - b.at[0])) {
        while (cursor < result.length && result[cursor][0][1] <= link.at[0]) { delta = result[cursor][1][1] - result[cursor][0][1]; cursor++; }
        if (cursor === result.length || result[cursor][0][0] >= link.at[1]) mapped[[link.at[0] + delta, link.at[1] + delta]] = link.to;
      }
      lb = lb.map(l => l.key != null ? l : {...l, to: mapped[l.at] || l.to});
      for (const [p, old] of aliases) {
        if (before.slice(...old.nameAt) === after.slice(...p.nameAt)) continue;
        check(la.length + lb.length);
        const left = la.filter(l => l.key === old.key), right = lb.filter(l => l.key === p.key);
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
          check(result.length * 2);
          if (result.some(c => c[3]?.[0] !== 3 && (overlaps(c[0], x[i]) || overlaps(c[1], y[i])) && !inside(c, x[i], y[i]))) { complete = false; break; }
          const found = result.filter(c => c[3][0] < 3 && inside(c, x[i], y[i]));
          if (!found.length) { complete = false; break; }
          owned.push(...found);
        }
        if (!complete) continue;
        check(result.length + owned.length * 2);
        const owners = new Set(owned.map(c => c[3]).filter(Boolean)), members = new Set(owned);
        if (result.some(c => owners.has(c[3]) && !members.has(c))) continue;
        const group = [4, p.kind, old.name, [[...old.nameAt], [...p.nameAt]]];
        for (const item of owned) item[3] = group;
      }
    }
  } } catch (error) {
    if (error !== null) throw error;
    result = result.flatMap(item => item[4] || [item]);
  }

  // Whole-word replacements separated only by spaces read and restore as one phrase.
  if (!raw && !code) for (let i = result.length - 1; i > 0; i--) {
    const p = result[i - 1], q = result[i], gap = before.slice(p[0][1], q[0][0]);
    if (p[3][0] !== 1 || q[3][0] !== 1 || p[3][3] || q[3][3] || p[2] || q[2] || !/^[^\S\r\n]+$/.test(gap) ||
      gap !== after.slice(p[1][1], q[1][0]) || within(before, p[0][0]) || within(after, p[1][0]) ||
      within(before, q[0][1]) || within(after, q[1][1])) continue;
    p[0][1] = q[0][1]; p[1][1] = q[1][1]; result.splice(i, 1);
  }
  const changes = [], edits = [];
  let normalized;
  const meaning = structures?.[0]?.meaning;
  const format = typeof meaning === 'string' && meaning === structures[1].meaning;
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (raw === 'char' && !evidence) {
      const a = item[0], b = item[1], next = result[i + 1];
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
      // Context completes a word only where an edge falls inside it.
      if (!raw) for (const [text, span] of [[before, context[0]], [after, context[1]]]) {
        const start = within(text, span[0]), end = within(text, span[1]);
        while (start && span[0] && spend() && letter(text[span[0] - 1]) && safe(text, span[0] - 1)) span[0]--;
        while (end && span[1] < text.length && spend() && letter(text[span[1]]) && safe(text, span[1] + 1)) span[1]++;
      }
      group[4] = []; changes.push(group);
      if (format) group[0] = 5;
    }
    group[4].push(edits.length);
    edits.push({before: item[0], after: item[1], ...(item[2] ? {coarse: true} : {})});
  }
  if (structures && !raw && budget.left >= 0) {
    const oldNames = new Set(pa.filter(p => p.nameAt).map(p => p.name)), newNames = new Set(pb.filter(p => p.nameAt).map(p => p.name));
    for (const change of changes) {
      if (change[0] === 5) continue;
      if (!spend(pa.length + pb.length + lb.length)) break;
      const range = change[3];
      const older = pa.filter(p => p.start <= range[0][0] && p.end >= range[0][1]), newer = pb.filter(p => p.start <= range[1][0] && p.end >= range[1][1]);
      const part = (change[0] === 0 ? older : newer).at(-1) || older.at(-1);
      if (!change[2] && part?.name) { change[2] = part.name; change[1] = part.kind; }
      const names = new Set([change[2], ...older.map(p => p.name), ...newer.map(p => p.name)]), breaks = [], affects = [];
      for (const {at, to} of lb) {
        if (!names.has(to)) continue;
        if (!newNames.has(to)) { if (oldNames.has(to)) breaks.push({at, to}); continue; }
        if (!spend(edits.length + pb.length) || edits.some(c => overlaps(at, c.after))) continue;
        const p = pb.filter(p => p.start <= at[0] && p.end >= at[1] && /^(paragraph|call|item|task|cell|declaration)$/.test(p.kind)).at(-1);
        affects.push(p && !edits.some(c => p.start < c.after[1] && p.end > c.after[0]) ? [p.start, p.end] : at);
      }
      if (breaks.length) change[6] = breaks;
      if (affects.length) change[5] = affects;
    }
  }
  if (options._stats) Object.assign(options._stats, {work: Math.max(0, initial - Math.max(0, budget.left)), coarse: edits.some(c => c.coarse)});
  // Concern tuples: kind, unit, name, context, edits, affects, breaks.
  return {edits, changes: changes.map(([kind, unit, name, context, owned, affects, breaks], i) => ({
    id: i + 1, kind: ['delete', 'replace', 'insert', 'move', 'rename', 'format'][kind], unit, edits: owned,
    ...(name ? {name} : {}), ...(context ? {context: {before: context[0], after: context[1]}} : {}),
    ...(affects ? {affects} : {}), ...(breaks ? {breaks} : {})
  }))};
}

export function merge(base, mine, theirs, options = {}) {
  if (mine === theirs || base === theirs || base === mine) return {text: base === mine ? theirs : mine, conflicts: []};
  const budget = {...options, _unit: 'char', _structure: true,
    _budget: options._budget || {left: Number.isFinite(options.limit) ? Math.max(0, options.limit) : 1e7}};
  const sources = [base, mine, theirs];
  const complete = () => ({text: mine, conflicts: [{at: [0, mine.length], theirs}]});
  const spend = (n = 1) => (budget._budget.left -= n) >= 0;
  const check = n => { if (!spend(n)) throw null; };
  const safe = options.structure && boundaries();
  const trees = options.structure && !options._edits
    ? [base, mine, base, theirs].map(text => observe(text, options.structure, spend, safe, false, true)) : [];
  const repeatedBase = trees.splice(2, 1)[0];
  const equal = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);
  if (trees.some(Boolean) || repeatedBase) {
    try {
      if (!trees.every(tree => tree && !tree.invalid) || !repeatedBase || repeatedBase.invalid) return complete();
      const a = trees[0].flat, b = repeatedBase.flat;
      check(a.length + b.length);
      if (a.length !== b.length) return complete();
      for (let i = 0; i < a.length; i++) {
        const p = a[i], q = b[i];
        if (p.start !== q.start || p.end !== q.end || p.kind !== q.kind || p.name !== q.name || p.key !== q.key ||
            p.children.length !== q.children.length || !equal(p.nameAt || [], q.nameAt || [])) return complete();
      }
      for (const tree of trees) for (const part of tree.flat)
        part.id = part.name && part.kind ? part.kind.length + ':' + part.kind + part.name : null;
      const removed = [new Map(), new Map()], added = [new Map(), new Map()];
      let container = 0;
      const content = (part, side) => sources[side].slice(part.start, part.end);
      function align(nodes) {
        const original = content(nodes[0], 0);
        if (original === content(nodes[1], 1) && original === content(nodes[2], 2)) {
          nodes[0].common = original; return;
        }
        const hidden = nodes.flatMap(node => node.children.filter(part => !part.id));
        while (hidden.length) {
          const part = hidden.pop(); check(1);
          if (part.id) throw null;
          for (const child of part.children) hidden.push(child);
        }
        const rows = nodes.map(node => node.children.filter(part => part.id));
        const width = rows.reduce((n, list) => n + list.length, 0);
        check(1 + width);
        let repeated = false;
        const index = nameOf => {
          const duplicates = new Set();
          const maps = rows.map((list, side) => {
            const map = new Map();
            for (const part of list) {
              const name = nameOf(part, side);
              if (!name) continue;
              const old = map.get(name);
              if (!old) map.set(name, part);
              else {
                duplicates.add(name);
                if (Array.isArray(old)) old.push(part); else map.set(name, [old, part]);
              }
            }
            return map;
          });
          for (const name of duplicates) {
            repeated = true;
            const values = maps.map((map, side) => {
              const part = map.get(name), list = Array.isArray(part) ? part : part ? [part] : [];
              check(list.length); map.set(name, null);
              return list.map(part => content(part, side));
            });
            if (!equal(values[0], values[1]) || !equal(values[0], values[2])) throw null;
          }
          return maps;
        };
        const maps = index(part => part.id), orders = rows.map(list => list.map(part => part.id));
        const reordered = [1, 2].map(side => !equal(orders[0].filter(name => maps[side].has(name)),
          orders[side].filter(name => maps[0].has(name))));
        index((part, side) => {
          check(1);
          if (part.nameAt) return part.kind.length + ':' + part.kind + sources[side].slice(...part.nameAt);
        });
        const parent = container++;
        for (const side of [1, 2]) {
          const peer = 3 - side;
          for (const [name, part] of maps[0]) if (!maps[side].has(name)) {
            removed[side - 1].set(parent + ':' + name, [part.kind, parent]);
            const other = maps[peer].get(name);
            if (part?.nameAt && other?.nameAt && content(part, 0) !== content(other, peer)) throw null;
          }
          for (const [name, part] of maps[side]) if (!maps[0].has(name))
            added[side - 1].set(parent + ':' + name, [part.kind, parent]);
        }
        let frame = -1;
        if (reordered.some(Boolean)) {
          if (repeated || !maps.every(map => map.size === maps[0].size && [...maps[0].keys()].every(name => map.has(name)))) throw null;
          if (reordered.every(Boolean) && !equal(orders[1], orders[2])) throw null;
          frame = reordered[0] ? 1 : 2;
          const gaps = rows.map((list, side) => {
            let at = nodes[side].start;
            return [...list.map(part => { const gap = sources[side].slice(at, part.start); at = part.end; return gap; }),
              sources[side].slice(at, nodes[side].end)];
          });
          if (!equal(gaps[3 - frame], gaps[reordered.every(Boolean) ? frame : 0])) throw null;
        }
        const children = new Map();
        for (const [name, part] of maps[0]) if (part && maps[1].get(name) && maps[2].get(name)) {
          const child = align([part, maps[1].get(name), maps[2].get(name)]);
          if (child) children.set(name, child);
        }
        if (frame < 0 && !children.size) return;
        // A plan is a tree of range triples; a string is an already-admitted gap.
        const plan = [];
        if (frame >= 0) {
          let at = nodes[frame].start;
          for (const part of rows[frame]) {
            plan.push(sources[frame].slice(at, part.start), children.get(part.id) || (maps[0].get(part.id).common ?? {ranges: maps.map(map => map.get(part.id))}));
            at = part.end;
          }
          plan.push(sources[frame].slice(at, nodes[frame].end));
        } else {
          let at = nodes.map(node => node.start);
          for (const child of children.values()) {
            const ranges = child.nodes;
            plan.push({ranges: ranges.map((node, side) => ({start: at[side], end: node.start}))}, child);
            at = ranges.map(node => node.end);
          }
          plan.push({ranges: nodes.map((node, side) => ({start: at[side], end: node.end}))});
        }
        return {nodes, plan};
      }
      const plan = align(trees.map((tree, side) => ({start: 0, end: sources[side].length, children: tree.parts})));
      for (const side of [0, 1]) {
        const destinations = new Map();
        check(added[side].size + removed[side].size);
        for (const [kind, parent] of added[side].values())
          destinations.set(kind, destinations.has(kind) && destinations.get(kind) !== parent ? null : parent);
        for (const [kind, parent] of removed[side].values())
          if (destinations.has(kind) && destinations.get(kind) !== parent) throw null;
      }
      if ([...removed[0].keys()].some(name => removed[1].has(name)) &&
        (added[0].size !== added[1].size || [...added[0].keys()].some(name => !added[1].has(name)))) throw null;
      if (plan) {
        // Project original ranges once. Nested moves never rebuild aligned documents.
        const chunks = [], conflicts = [];
        let length = 0;
        function project(item) {
          if (item.plan) { for (const child of item.plan) project(child); return; }
          check(1);
          let text = item;
          if (typeof item !== 'string') {
            const result = merge(...item.ranges.map(content), {...budget, structure: undefined, from: undefined});
            check(0); text = result.text;
            for (const conflict of result.conflicts)
              conflicts.push({at: conflict.at.map(at => at + length), theirs: conflict.theirs});
          }
          chunks.push(text); length += text.length;
        }
        project(plan);
        return {text: chunks.join(''), conflicts};
      }
    } catch (error) { if (error !== null) throw error; return complete(); }
  }
  const changes = options._edits || [mine, theirs].map((text, side) => diff(base, text,
    {...budget, structure: trees[0] && options.structure, _observed: trees[0] ? [trees[0], trees[side + 1]] : undefined}).edits);
  if (trees.some(Boolean) && budget._budget.left < 0) return complete();
  const edits = [mine, theirs].flatMap((text, side) => changes[side].map(change =>
    [...change.before, text.slice(...change.after), side]));
  edits.sort((a, b) => a[0] - b[0] || a[3] - b[3] || a[1] - b[1]);
  const conflicts = [];
  let at = 0, text = '';
  for (let index = 0; index < edits.length;) {
    const start = edits[index][0], sides = [['', start], ['', start]];
    let end = start, changed = 0;
    for (;;) {
      const edit = edits[index++], side = edit[3], row = sides[side];
      if (edit[1] >= end) {
        if (edit[1] > end) sides[1 - side][2] = null;
        end = edit[1]; row[2] = edit;
      }
      row[0] += base.slice(row[1], edit[0]) + edit[2]; changed |= 1 << side;
      row[1] = edit[1];
      if (index === edits.length) break;
      const [a, b, t, side2] = edits[index], peer = sides[1 - side2][2];
      if (!(a < end || a === start || peer &&
        (a === end && peer[0] === end || a === b && peer[0] < end &&
          a - end < t.length && (peer[2] + base.slice(end, a)).endsWith(t)))) break;
    }
    for (const row of sides) row[0] += base.slice(row[1], end);
    text += base.slice(at, start);
    const from = text.length;
    text += sides[changed & 1 ? 0 : 1][0];
    if (changed === 3 && sides[0][0] !== sides[1][0]) conflicts.push({at: [from, text.length], theirs: sides[1][0]});
    at = end;
  }
  return {text: text + base.slice(at), conflicts};
}
