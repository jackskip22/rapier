// SPDX-License-Identifier: MIT
export function linePlan(flow, width, top, obstacles, lineHeight, minWidth, direction, balance, slotsForBand, layoutNextRichInlineLineRange, materializeRichInlineLineRange) {
  const lines = [], ranges = [];
  let cursor = {itemIndex: 0, segmentIndex: 0, graphemeIndex: 0}, y = 0, bottom = 0, rows = 0;
  for (let step = 0; step < 4096 && rows < 768; step++) {
    const bands = slotsForBand(width, obstacles, top + y, lineHeight, Math.min(minWidth, width));
    if (!bands) return null;
    if (direction === 'rtl') bands.reverse();
    let advanced = false;
    for (const band of bands) {
      const range = layoutNextRichInlineLineRange(flow, band.width, cursor);
      if (!range) return lines.length ? {lines: balance ? balanced(flow, width, balance, lines, ranges, lineHeight, layoutNextRichInlineLineRange, materializeRichInlineLineRange) : lines, height: Math.max(lineHeight, bottom)} : null;
      if (range.width > width + .5 || range.end.itemIndex === cursor.itemIndex &&
          range.end.segmentIndex === cursor.segmentIndex && range.end.graphemeIndex === cursor.graphemeIndex) return null;
      if (range.width > band.width + .5) continue;
      if (lines.length === 4096) return null;
      lines.push({...materializeRichInlineLineRange(flow, range), ...band, y}); ranges.push(range);
      cursor = range.end; advanced = true; bottom = y + lineHeight;
    }
    if (advanced) { y += lineHeight; rows++; continue; }
    let next = Infinity;
    for (const obstacle of obstacles) if (obstacle.x < width && obstacle.x + obstacle.width > 0 &&
        obstacle.y < top + y + lineHeight && obstacle.y + obstacle.height > top + y)
      next = Math.min(next, obstacle.y + obstacle.height - top);
    if (!Number.isFinite(next) || next <= y) return null;
    y = next;
  }
  return null;
}

// `text-wrap: balance` as Chromium 154 lays it (score_line_breaker.cc, then paragraph_line_breaker.cc), over Pretext's own breaks:
// `balance` is the block's font size. Only a run of two to six greedy lines, each on the whole column, no word broken, balances.
// The score breaker minimises (width - line)² per line with Minikin's penalties (4·width·font a line, 2·width·font a soft hyphen)
// and 10000 on the break before the last word; it stands when there are three breaks to choose from and it keeps greedy's count.
// Otherwise the narrowest width that keeps the count, bisected to a pixel up from 0.8 of the mean line, laid greedy.
function balanced(flow, width, fontSize, lines, greedy, lineHeight, layoutNextRichInlineLineRange, materializeRichInlineLineRange) {
  const count = greedy.length;
  if (count < 2 || count > 6 || lines.some((line, index) => line.x !== 0 || line.width !== width || line.y !== index * lineHeight) ||
      greedy.some(range => range.end.graphemeIndex > 0 || range.width > width + .005)) return lines;
  const place = ranges => ranges.map((range, index) => ({...materializeRichInlineLineRange(flow, range), x: 0, width, y: index * lineHeight}));
  const keyOf = range => { const last = range.fragments.at(-1); return (last.itemIndex * 65536 + last.end.segmentIndex) * 65536 + last.end.graphemeIndex; };
  const end = keyOf(greedy.at(-1)), start = {cursor: {itemIndex: 0, segmentIndex: 0, graphemeIndex: 0}, key: -1, score: 0, lines: 0};
  const nodes = new Map([[-1, start]]), open = [start];
  const linePenalty = 4 * width * fontSize, hyphenPenalty = 2 * width * fontSize;
  const hyphenated = range => {
    const last = range.fragments.at(-1), item = flow.items[last.itemIndex];
    return last.end.graphemeIndex === 0 && item?.prepared.kinds[last.end.segmentIndex - 1] === 'soft-hyphen';
  };
  // Every break a line from `from` can end at inside the column, farthest first: each narrower try yields the break before.
  const reach = from => {
    const found = [];
    for (let limit = width, previous = Infinity; found.length < 4096;) {
      const range = layoutNextRichInlineLineRange(flow, limit, from.cursor);
      if (!range || range.end.graphemeIndex > 0 || range.width > limit + .005) break;
      const key = keyOf(range);
      if (key >= previous || key <= from.key) break;
      found.push({range, key}); previous = key; limit = range.width - .01;
    }
    return found;
  };
  const edges = new Map();
  while (open.length) {
    const from = open.shift(), out = reach(from);
    edges.set(from, out);
    for (const {range, key} of out) if (!nodes.has(key)) {
      const node = {cursor: range.end, key, score: Infinity, lines: 0, previous: null, via: null, hyphen: hyphenated(range)};
      nodes.set(key, node);
      let at = open.findIndex(other => other.key > key);
      open.splice(at < 0 ? open.length : at, 0, node);
    }
  }
  const order = [...nodes.values()].sort((a, b) => a.key - b.key), terminal = nodes.get(end);
  let solved = null;
  if (terminal === order.at(-1) && order.length >= 5) {
    for (const node of order) node.penalty = node.hyphen ? hyphenPenalty : 0;
    for (let index = order.length - 2; index > 0; index--) { order[index].penalty += 10000; if (!order[index].hyphen) break; }
    for (const from of order) {
      if (from !== start) { if (!Number.isFinite(from.score)) continue; from.score += from.penalty + linePenalty; }
      for (const {range, key} of edges.get(from)) {
        const to = nodes.get(key), score = from.score + (width - range.width) ** 2;
        if (score <= to.score) { to.score = score; to.previous = from; to.via = range; to.lines = from.lines + 1; }
      }
    }
    if (terminal.lines === count) {
      solved = [];
      for (let node = terminal; node !== start; node = node.previous) solved.unshift(node.via);
    }
  }
  if (!solved) {
    const fits = limit => {
      const out = [];
      for (let cursor = start.cursor; out.length <= count;) {
        const range = layoutNextRichInlineLineRange(flow, limit, cursor);
        if (!range) return out;
        if (range.end.graphemeIndex > 0 || range.width > limit + .005) return null;
        out.push(range); cursor = range.end;
      }
      return null;
    };
    let lower = Math.round(Math.floor(greedy.reduce((sum, range) => sum + Math.round(range.width * 64), 0) / count) * .8), upper = Math.round(width * 64);
    while (lower + 64 < upper) { const middle = Math.floor((upper + lower) / 2); if (fits(middle / 64)?.length <= count) upper = middle; else lower = middle; }
    solved = fits(upper / 64);
  }
  return solved?.length === count ? place(solved) : lines;
}

// Draw supplies its SVG advances. Every door uses the same line plan without a canvas;
// the tokens retain the source offsets and keep words and Unicode clusters intact.
export function measuredLines(tokens, width, lineHeight, fontSize) {
  if (!tokens.length) return [];
  const prepared = {kinds: tokens.map(token => token.space ? 'space' : 'text')}, flow = {items: [{prepared}]};
  const next = (_flow, limit, cursor) => {
    let first = cursor.segmentIndex, at = first, used = 0, paint = 0, content = false;
    while (tokens[first]?.space) first++;
    for (at = first; at < tokens.length; at++) {
      const token = tokens[at];
      if (!token.space && content && used + token.width > limit + .005) break;
      used += token.width;
      if (!token.space) { paint = used; content = true; }
    }
    if (!content) return null;
    return {width: paint, end: {itemIndex: 0, segmentIndex: at, graphemeIndex: 0},
      fragments: [{itemIndex: 0, start: {segmentIndex: first, graphemeIndex: 0}, end: {segmentIndex: at, graphemeIndex: 0}, occupiedWidth: paint}]};
  };
  const materialize = (_flow, range) => {
    const source = range.fragments[0], first = source.start.segmentIndex; let end = source.end.segmentIndex;
    while (end > first && tokens[end - 1].space) end--;
    return {width: range.width, end: range.end, fragments: [{...source, text: tokens.slice(first, end).map(token => token.text).join(''), sourceStart: tokens[first].start, sourceEnd: tokens[end - 1].end}]};
  };
  const plan = linePlan(flow, width, 0, [], lineHeight, 1, 'ltr', fontSize, () => [{x: 0, width}], next, materialize);
  return plan?.lines.map(line => {
    const fragment = line.fragments[0];
    return {text: fragment.text, start: fragment.sourceStart, end: fragment.sourceEnd, width: fragment.occupiedWidth};
  }) || null;
}
