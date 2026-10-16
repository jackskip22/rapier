// SPDX-License-Identifier: MIT
// One comparison: observe structure, walk the source into exact records, find moves and renames, then read them as
// concerns. Each stage lives in its own module and shares one comparison context.
import {observe} from './structure.mjs';
import {boundaries, tokenizer, wordSegmenter} from './tokens.mjs';
import {matcher} from './matching.mjs';
import {walker} from './walk.mjs';
import {moves} from './moves.mjs';
import {separate, concerns} from './concerns.mjs';

export function diff(before, after, options = {}) {
  if (before === after) return {edits: [], changes: []};
  const budget = options._budget || {left: Number.isFinite(options.limit) ? Math.max(0, options.limit) : 1e7};
  const spend = (n = 1) => (budget.left -= n) >= 0, safe = boundaries(), raw = options._unit;
  // Internal records: [before range, after range, coarse, concern, transported fragments].
  const c = {before, after, options, budget, spend, safe, raw, chars: options.unit === 'char', initial: budget.left,
    segmenter: wordSegmenter(), result: [], code: options.as === 'code'};
  // A Markdown fence holds code inside prose; only code outside fences makes the text code.
  if (options.as !== 'prose' && options.as !== 'code') c.code = /(?:^|\n)\s*(?:[{}]|(?:function|class|const|let|var|import|export|def|fn|func|package)\s+\w[^]{0,80}[({=:;])/
    .test((before.slice(0, 4096) + '\n' + after.slice(0, 4096)).replace(/^ {0,3}(`{3,}|~{3,})[^]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![^]))/gm, ''));
  let fallback;
  if (options.structure && (!raw || options._structure)) {
    let structures;
    try {
      structures = options._observed || [observe(before, options.structure, spend, safe), observe(after, options.structure, spend, safe)];
      if (structures.some(value => !value || value.invalid)) throw null;
      const [pa, pb] = structures.map(value => value.flat), aliases = new Map();
      const oldByKey = new Map(pa.filter(p => p.key != null).map(p => [p.key, p]));
      const oldNames = new Set(pa.map(p => p.name)), newNames = new Set(pb.map(p => p.name));
      for (const p of pb) {
        const old = oldByKey.get(p.key);
        if (old?.nameAt && p.nameAt && old.kind === p.kind && !oldNames.has(p.name) && !newNames.has(old.name)) aliases.set(p, old);
      }
      Object.assign(c, {structures, pa, pb, la: structures[0].links, lb: structures[1].links, aliases});
    } catch {
      // A failed reader preserves an explicit prose choice and reports why structure was not used.
      const failed = structures?.find(value => !value || value.invalid);
      fallback = {structure: failed?.threw ? 'threw' : budget.left < 0 ? 'limit' : 'invalid', ...(failed?.threw ? {error: failed.error} : {})};
      c.code = options.as !== 'prose';
    }
  }
  c.tokens = tokenizer(c); c.matches = matcher(spend, budget);
  const {walk, operations} = Object.assign(c, walker(c)), {structures, pa, pb} = c;
  const evidence = c.evidence = options.from && operations(options.from);
  if (options.from && !evidence) (fallback ||= {}).from = budget.left < 0 ? 'limit' : 'invalid';
  if (evidence) for (const span of evidence) walk(...span, structures ? 0 : raw === 'char' ? 3 : 1, pa, pb);
  else walk(0, before.length, 0, after.length, structures ? 0 : raw === 'word' ? 2 : 1,
    structures?.[0]?.parts, structures?.[1]?.parts);
  separate(c);
  moves(c);
  // A heading edit can re-record its children. Compare both walks after transport is known: unchanged moved
  // fragments cost nothing, so a smaller plain walk cannot discard a move just by aligning some of its lines.
  if (structures && !evidence && !raw && c.result.some(r => r[0][0] === r[0][1]) && c.result.some(r => r[1][0] === r[1][1]) &&
    budget.left >= c.initial - budget.left) {
    const size = (rows, transport = false) => rows.reduce((n, r) => n + (!transport && r[3][0] === 3 ? 0 : r[0][1] - r[0][0] + r[1][1] - r[1][0]), 0);
    const walked = c.result, links = c.lb, cost = size(walked);
    if (cost) {
      c.result = []; c.lb = structures[1].links;
      walk(0, before.length, 0, after.length, 1);
      separate(c); moves(c);
      const plain = size(c.result);
      if (budget.left < 0 || c.result.some(r => r[2]) || plain > cost ||
        plain === cost && size(c.result, true) >= size(walked, true)) { c.result = walked; c.lb = links; }
    }
  }
  const {edits, changes} = concerns(c);
  return {edits, ...(fallback && !raw ? {fallback} : {}), changes};
}
