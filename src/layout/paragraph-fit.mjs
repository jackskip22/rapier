// SPDX-License-Identifier: MIT
export function createParagraphFitter() {
  const indexes = new WeakMap();
  function prepare(input) {
    if (!input?.segments || typeof input.text !== 'string') return null;
    const segments = input.segments.map(segment => {
      const prefix = [0], gaps = [0], minimum = [0];
      const points = [{word: 0, cut: null, cutIndex: -1, end: segment.start, next: segment.start, kind: 'start'}];
      segment.words.forEach((word, index) => {
        prefix.push(prefix.at(-1) + word.width + (word.gap?.width || 0));
        gaps.push(gaps.at(-1) + (word.gap?.width || 0));
        minimum.push(minimum.at(-1) + Math.max(0, word.width - word.endTrim) + Math.max(0, (word.gap?.width || 0) * .6));
        word.breaks.forEach((cut, cutIndex) => points.push({word: index, cut, cutIndex, end: cut.offset, next: cut.offset, kind: cut.kind}));
        points.push({word: index + 1, cut: null, cutIndex: -1, end: word.end, next: word.gap?.end ?? word.end,
          kind: index === segment.words.length - 1 ? 'end' : 'space'});
      });
      if (segment.words.length) points[0].end = points[0].next = segment.words[0].start;
      return {...segment, prefix, gaps, minimum, points};
    });
    const handle = Object.freeze({});
    indexes.set(handle, {text: input.text, segments});
    return handle;
  }

  function* solveSteps(handle, width, {indent = 0, left = 0, right = 0} = {}, known) {
    const prepared = indexes.get(handle);
    if (!prepared || ![width, indent, left, right].every(Number.isFinite) || width <= 0) return null;
    const lines = []; let work = 0, visited = 0, totalCost = 0;
    for (let segmentIndex = 0; segmentIndex < prepared.segments.length; segmentIndex++) {
      const {words, points, prefix, gaps, minimum} = prepared.segments[segmentIndex];
      if (!words.length) continue;
      const ceiling = width + Math.max(0, left) + Math.max(0, right) + Math.max(0, -indent);
      const lastIndex = points.length - 1;
      let smallest = Infinity;
      for (let index = 0; index < words.length - 1; index++) smallest = Math.min(smallest, words[index].gap?.width || 0);
      let natural = prefix[words.length] - prefix[0];
      natural -= (words.at(-1).gap?.width || 0) + words.at(-1).endTrim;
      natural += words[0].startExtra;
      const opening = Math.min(Math.max(0, left), words[0].opening);
      const closing = Math.min(Math.max(0, right), words.at(-1).closing);
      const target = width - (segmentIndex === 0 ? indent : 0) + opening + closing;
      const count = words.length - 1;
      const delta = !count ? 0 : Math.max(-smallest * .4, Math.min(0, (target - natural) / count));
      const overflow = natural + delta * count - target;
      const cost = 1 + 100 * Math.max(0, overflow / target) ** 2;
      if (Number.isFinite(natural) && target > 0 && cost < 2 && minimum[words.length - 1] - minimum[Math.min(words.length - 1, 1)] <= ceiling + .02 &&
          !(overflow > .02 && (count || words.at(-1).breaks.length))) {
        lines.push({start: points[0].next, end: points[lastIndex].end, next: points[lastIndex].next, kind: 'end', glyph: '',
          wordSpacing: delta, opening, closing, firstWord: 0, lastWord: words.length - 1, segment: segmentIndex});
        totalCost += cost; work++; continue;
      }

      const costs = new Float64Array(points.length * 12);
      const previous = new Float64Array(costs.length), spacing = new Float64Array(costs.length);
      const prefixes = [], suffixes = [], reachable = new Uint16Array(points.length);
      reachable[0] = 1 << 3;
      let lastPlain = lastIndex - 1;
      while (lastPlain > 0 && (points[lastPlain].kind === 'soft' || points[lastPlain].kind === 'auto')) lastPlain--;
      for (let endIndex = 1; endIndex < points.length; endIndex++) {
        const end = points[endIndex], final = end.kind === 'end', lastWord = end.cut ? end.word : end.word - 1;
        const discretionary = end.kind === 'soft' || end.kind === 'auto';
        if (end.cut && end.word === words.length - 1 && (end.kind === 'auto' || endIndex > lastPlain)) continue;
        let smallest = Infinity, minWord = lastWord;
        for (let startIndex = endIndex - 1; startIndex >= 0; startIndex--) {
          if (++visited % 1024 === 0) yield null;
          const start = points[startIndex];
          if (start.word > lastWord) continue;
          if (minimum[lastWord] - minimum[Math.min(lastWord, start.word + 1)] > ceiling + .02) break;
          while (minWord > start.word) smallest = Math.min(smallest, words[--minWord].gap?.width || 0);
          if (final && (start.kind === 'soft' || start.kind === 'auto')) continue;
          if (start.cut && end.cut && start.word === end.word && (start.kind === 'auto' || end.kind === 'auto')) continue;
          const available = reachable[startIndex] & (discretionary ? 0x6db : 0xfff);
          if (!available) continue;
          let natural;
          if (start.cut && end.cut && start.word === end.word) {
            natural = yield {segment: segmentIndex, word: start.word, from: start.cutIndex, to: end.cutIndex};
          } else {
            natural = prefix[end.word] - prefix[start.word];
            if (end.cut) {
              if (prefixes[endIndex] === undefined) {
                const query = {segment: segmentIndex, word: end.word, from: -1, to: end.cutIndex};
                prefixes[endIndex] = known?.(query);
                if (prefixes[endIndex] === undefined) prefixes[endIndex] = yield query;
              }
              natural += prefixes[endIndex];
            } else natural -= (words[lastWord].gap?.width || 0) + words[lastWord].endTrim;
            if (start.cut) {
              if (suffixes[startIndex] === undefined) {
                const query = {segment: segmentIndex, word: start.word, from: start.cutIndex, to: -1};
                suffixes[startIndex] = known?.(query);
                if (suffixes[startIndex] === undefined) suffixes[startIndex] = yield query;
              }
              natural -= words[start.word].width - suffixes[startIndex];
            } else natural += words[start.word].startExtra;
          }
          if (!Number.isFinite(natural)) continue;
          const count = lastWord - start.word, gapWidth = gaps[lastWord] - gaps[start.word];
          const opening = start.cut ? 0 : Math.min(Math.max(0, left), words[start.word].opening);
          const closing = end.cut ? 0 : Math.min(Math.max(0, right), words[lastWord].closing);
          const target = width - (segmentIndex === 0 && startIndex === 0 ? indent : 0) + opening + closing;
          if (target <= 0) continue;
          const remaining = target - natural;
          const delta = !count ? 0 : Math.max(-smallest * .4, Math.min(final ? 0 : smallest * .8, remaining / count));
          const overflow = natural + delta * count - target;
          if (overflow > .02 && (count || start.cut || end.cut || words[lastWord].breaks.length)) continue;
          const residual = Math.max(0, remaining - delta * count);
          const ratio = gapWidth > 0 ? delta * count / gapWidth : 0;
          const fitness = final ? 1 : ratio < -.075 ? 0 : ratio <= .2 ? 1 : ratio <= .5 ? 2 : 3;
          let local = 1 + 100 * Math.max(0, overflow / target) ** 2;
          if (final && startIndex) local += 100 * Math.max(0, .45 - natural / target) ** 2 + (count === 0 ? 25 : 0);
          else if (!final) local += (ratio < 0 ? 100 : 12.5) * ratio ** 2 + 2400 * (residual / target) ** 2;
          const priorDiscretionary = start.kind === 'soft' || start.kind === 'auto';
          if (discretionary) local += 12 + (priorDiscretionary ? 12 : 0);
          if (final && priorDiscretionary) continue;
          for (let active = available; active; active &= active - 1) {
            const slot = 31 - Math.clz32(active & -active), priorIndex = startIndex * 12 + slot;
            const hyphens = discretionary ? slot % 3 + 1 : 0;
            if (hyphens > 2) continue;
            work++;
            const cost = costs[priorIndex] + local + (!final && startIndex ? .6 * (fitness - Math.floor(slot / 3)) ** 2 : 0);
            const stateIndex = fitness * 3 + hyphens;
            const index = endIndex * 12 + stateIndex;
            if (reachable[endIndex] & 1 << stateIndex && costs[index] <= cost) continue;
            costs[index] = cost; previous[index] = priorIndex; spacing[index] = delta;
            reachable[endIndex] |= 1 << stateIndex;
          }
        }
      }
      let best = -1;
      for (let slot = 0; slot < 12; slot++) if (reachable[lastIndex] & 1 << slot) {
        const index = lastIndex * 12 + slot;
        if (best < 0 || costs[index] < costs[best]) best = index;
      }
      if (best < 0) return null;
      totalCost += costs[best];
      const chosen = [];
      for (let endIndex = lastIndex; endIndex;) {
        const priorIndex = previous[best], startIndex = Math.floor(priorIndex / 12);
        const start = points[startIndex], end = points[endIndex], lastWord = end.cut ? end.word : end.word - 1;
        chosen.push({start: start.next, end: end.end, next: end.next, kind: end.kind, glyph: end.cut?.glyph || '',
          wordSpacing: spacing[best], opening: start.cut ? 0 : Math.min(Math.max(0, left), words[start.word].opening),
          closing: end.cut ? 0 : Math.min(Math.max(0, right), words[lastWord].closing),
          firstWord: start.word, lastWord, segment: segmentIndex});
        best = priorIndex; endIndex = startIndex;
      }
      lines.push(...chosen.reverse());
    }
    return {lines, work, cost: totalCost, approximate: false};
  }

  function solve(prepared, width, options, observe) {
    const work = solveSteps(prepared, width, options);
    try {
      let step = work.next();
      while (!step.done) {
        if (step.value && !observe) return null;
        step = work.next(step.value ? observe(step.value) : undefined);
      }
      return step.value;
    } finally { work.return(); }
  }
  return {prepare, solve, solveSteps};
}

const fitter = createParagraphFitter();
export const prepareParagraph = fitter.prepare;
export const fitParagraph = fitter.solve;
