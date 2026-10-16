// SPDX-License-Identifier: MIT
export function matcher(spend, budget) {
  function matches(a, b) {
    const found = new Array(a.length), pending = [[0, a.length, 0, b.length]];
    const chain = (pairs, a0, a1, b0, b1, split, near) => {
      const tails = [];
      for (const [i, j] of pairs) {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const middle = lo + hi >>> 1; if (tails[middle][1] < j) lo = middle + 1; else hi = middle; }
        tails[lo] = [i, j, tails[lo - 1]];
      }
      const kept = [];
      for (let node = tails.at(-1); node; node = node[2]) kept.push(node);
      let x = a0, y = b0;
      for (const [i, j] of kept.reverse()) {
        found[i] = j;
        if (split && x < i && y < j) pending.push([x, i, y, j, near]);
        x = i + 1; y = j + 1;
      }
      if (split && x < a1 && y < b1) pending.push([x, a1, y, b1, near]);
    };
    while (pending.length) {
      let [a0, a1, b0, b1, near] = pending.pop();
      while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) found[a0++] = b0++;
      while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) found[--a1] = --b1;
      if (a0 === a1 || b0 === b1 || !spend(a1 - a0 + b1 - b0)) continue;
      if (near && shortest(a, b, a0, a1, b0, b1, found, 4 * (a1 - a0 + b1 - b0))) continue;
      const positions = new Map();
      for (let j = b0; j < b1; j++) {
        const list = positions.get(b[j]);
        if (list) list.push(j); else positions.set(b[j], [0, j]);
      }
      for (let i = a0; i < a1; i++) {
        const list = positions.get(a[i]); if (list) list[0]++;
      }
      let unique = 0, count = 0;
      for (const list of positions.values()) {
        count += list[0] * (list.length - 1);
        if (list[0] === 1 && list.length === 2) unique++;
      }
      if (!count) continue;
      if (!unique && a1 - a0 === b1 - b0) {
        const anchors = diagonal(a, b, a0, a1, b0, b1);
        if (anchors) { chain(anchors, a0, a1, b0, b1, true, true); continue; }
      }
      const chained = unique || count, cost = chained * Math.ceil(Math.log2(chained + 2));
      if (cost <= budget.left) {
        const pairs = [];
        for (let i = a0; i < a1; i++) {
          const list = positions.get(a[i]);
          if (!list || unique && (list[0] !== 1 || list.length !== 2)) continue;
          for (let p = list.length - 1; p > 0; p--) pairs.push([i, list[p]]);
        }
        spend(cost);
        chain(pairs, a0, a1, b0, b1, unique > 0);
        continue;
      }
      if (shortest(a, b, a0, a1, b0, b1, found, a1 - a0 + b1 - b0)) continue;
      const anchors = runs(a, b, a0, a1, b0, b1) || diagonal(a, b, a0, a1, b0, b1);
      if (anchors) chain(anchors, a0, a1, b0, b1, true, true);
      else if (!shortest(a, b, a0, a1, b0, b1, found) && budget.left >= 0) (found.coarse ||= new Set()).add(a0);
    }
    return found;
  }

  function runs(a, b, a0, a1, b0, b1) {
    const ids = new Map(), id = key => ids.get(key) ?? (ids.set(key, ids.size), ids.size - 1);
    const left = Int32Array.from({length: a1 - a0}, (_, k) => id(a[a0 + k])), right = Int32Array.from({length: b1 - b0}, (_, k) => id(b[b0 + k]));
    for (const k of [16, 4, 64]) {
      if (k > Math.min(left.length, right.length) || !spend(2 * (left.length + right.length))) return;
      const P = 2147483647, B = 1000003;
      let power = 1;
      for (let n = 1; n < k; n++) power = power * B % P;
      const windows = list => {
        const seen = new Map();
        let hash = 0;
        for (let n = 0; n < list.length; n++) {
          if (n >= k) hash = (hash + P - (list[n - k] + 1) * power % P) % P;
          hash = (hash * B + list[n] + 1) % P;
          if (n >= k - 1) seen.set(hash, seen.has(hash) ? -1 : n - k + 1);
        }
        return seen;
      };
      const mine = windows(left), theirs = windows(right), pairs = [];
      for (const [hash, i] of mine) {
        const j = theirs.get(hash);
        if (i < 0 || j === undefined || j < 0) continue;
        let n = 0;
        while (n < k && left[i + n] === right[j + n]) n++;
        if (n === k) pairs.push([a0 + i, b0 + j]);
      }
      pairs.sort((p, q) => p[0] - q[0]);
      const spaced = [];
      for (const pair of pairs) if (!spaced.length || pair[0] >= spaced.at(-1)[0] + k) spaced.push(pair);
      if (spaced.length && spend(pairs.length + spaced.length * Math.ceil(Math.log2(spaced.length + 2)))) return spaced;
    }
  }

  function diagonal(a, b, a0, a1, b0, b1) {
    const n = a1 - a0, m = b1 - b0, shift = m - n, size = Math.min(n, m);
    if (!spend(2 * (n + m))) return;
    const head = new Int32Array(n + 1), tail = new Int32Array(n + 2);
    for (let i = 0; i < n; i++) head[i + 1] = head[i] + (i < m && a[a0 + i] === b[b0 + i]);
    for (let i = n - 1; i >= 0; i--) tail[i] = tail[i + 1] + (i + shift >= 0 && a[a0 + i] === b[b0 + i + shift]);
    let best = -1, split = 0;
    for (let s = 0; s <= n; s++) {
      const rest = Math.min(n, s + Math.max(0, -shift)), kept = head[s] + tail[rest];
      if (kept > best) { best = kept; split = s; }
    }
    if (best * 2 < size) return;
    const pairs = [], rest = Math.min(n, split + Math.max(0, -shift));
    for (let i = 0; i < split; i++) if (i < m && a[a0 + i] === b[b0 + i]) pairs.push([a0 + i, b0 + i]);
    for (let i = rest; i < n; i++) if (i + shift >= 0 && a[a0 + i] === b[b0 + i + shift]) pairs.push([a0 + i, b0 + i + shift]);
    return pairs;
  }

  function shortest(a, b, a0, a1, b0, b1, found, share = Infinity) {
    const n = a1 - a0, m = b1 - b0, v = new Int32Array(2 * (n + m) + 3), o = n + m + 1, trace = [];
    const step = (k = 1) => (share -= k) >= 0 && spend(k);
    for (let d = 0; step(2 * d + 1); d++) {
      trace.push(v.slice(o - d, o + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || k !== d && v[o + k - 1] < v[o + k + 1] ? v[o + k + 1] : v[o + k - 1] + 1, y = x - k;
        while (x < n && y < m && a[a0 + x] === b[b0 + y]) { if (!step()) return; x++; y++; }
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
  return matches;
}
