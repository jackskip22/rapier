// SPDX-License-Identifier: MIT
import {diff} from './diff.mjs';
import {observe} from './structure.mjs';
import {boundaries, words, wordSegmenter} from './tokens.mjs';

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
    // A reader that throws gives no structure: the texts merge by source coordinates.
    ? [base, mine, base, theirs].map(text => observe(text, options.structure, spend, safe, false, true)).map(tree => tree?.threw ? null : tree) : [];
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
            // Each occurrence keeps its base text on one side, or the whole list does.
            if (!equal(values[0], values[1]) && !equal(values[0], values[2]) && !(values.every(list => list.length === values[0].length) &&
              values[0].every((text, k) => text === values[1][k] || text === values[2][k]))) throw null;
          }
          return maps;
        };
        // A part renamed on one side keeps its reader key and aligns with its base part.
        const keyed = new Map(rows[0].filter(part => part.nameAt && part.key != null).map(part => [part.key, part]));
        const own = new Set(rows[0].map(part => part.id)), renamed = new Map();
        for (const side of [1, 2]) {
          const names = new Set(rows[side].map(part => part.id));
          for (const part of rows[side]) {
            const old = keyed.get(part.key);
            if (old && part.nameAt && old.kind === part.kind && !own.has(part.id) && !names.has(old.id)) renamed.set(part, old.id);
          }
        }
        const id = part => renamed.get(part) ?? part.id;
        const maps = index(id), orders = rows.map(list => list.map(id));
        // A vanished or added copy of a repeated name keeps the order; only a different order of shared names is a reorder.
        const within = (a, b) => { let k = 0; for (const name of b) if (name === a[k]) k++; return k === a.length; };
        const reordered = [1, 2].map(side => {
          const a = orders[0].filter(name => maps[side].has(name)), b = orders[side].filter(name => maps[0].has(name));
          check(a.length + b.length); return !within(a, b) && !within(b, a);
        });
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
            plan.push(sources[frame].slice(at, part.start), children.get(id(part)) || (maps[0].get(id(part)).common ?? {ranges: maps.map(map => map.get(id(part)))}));
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
  // An edit reaches over the words it touches; edits whose reaches overlap form one group, so letters
  // joined from both branches never form a word neither wrote.
  const spans = words(wordSegmenter(), base);
  const word = at => {
    let low = 0, high = spans.length;
    while (low < high) { const mid = low + high >> 1; if (spans[mid][1] <= at) low = mid + 1; else high = mid; }
    return spans[low]?.[0] <= at ? spans[low] : null;
  };
  const edits = [mine, theirs].flatMap((text, side) => changes[side].map(({before: [from, to], after}) =>
    [from, to, text.slice(...after), side, from && (word(from - 1)?.[0] ?? from), word(to)?.[1] ?? to]));
  edits.sort((a, b) => a[0] - b[0] || a[3] - b[3] || a[1] - b[1]);
  const conflicts = [];
  let at = 0, text = '';
  for (let index = 0; index < edits.length;) {
    const start = edits[index][0], sides = [['', start], ['', start]];
    let end = start, reach = start, changed = 0;
    for (;;) {
      const edit = edits[index++], side = edit[3], row = sides[side];
      reach = Math.max(reach, edit[5]);
      if (edit[1] >= end) {
        if (edit[1] > end) sides[1 - side][2] = null;
        end = edit[1]; row[2] = edit;
      }
      row[0] += base.slice(row[1], edit[0]) + edit[2]; changed |= 1 << side;
      row[1] = edit[1];
      if (index === edits.length) break;
      const [a, b, t, side2, from] = edits[index], peer = sides[1 - side2][2];
      // One branch's insertion and replacement at the same base position are one contiguous edit.
      if (!(a < end || a === start || from < reach || edits[index - 1][0] === a && edits[index - 1][3] === side2 || peer &&
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
