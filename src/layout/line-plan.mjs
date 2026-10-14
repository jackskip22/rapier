// SPDX-License-Identifier: MIT

const lastSource = line => line.fragments.at(-1);
const afterSource = (point, previous) => !!point && (!previous || point.itemIndex > previous.itemIndex ||
  point.itemIndex === previous.itemIndex && point.sourceEnd > previous.sourceEnd);

function insideChip(items, line) {
  const last = lastSource(line), item = items?.[last?.itemIndex];
  return item?.extraWidth > 0 && typeof item.text === 'string' &&
    /[^ \t\r\n\f]/.test(item.text.slice(last.sourceEnd));
}

function beforeChip(flow, range, line, cursor, items, next, materialize) {
  let first = lastSource(line).itemIndex;
  while (first > 0 && items[first - 1]?.extraWidth > 0) first--;
  if (first <= line.fragments[0].itemIndex) return null;
  for (let limit = range.width - .05, tries = 64; tries > 0 && limit > 0; tries--) {
    const shorter = next(flow, limit, cursor);
    if (!shorter || shorter.width > limit + .05) return null;
    const materialized = materialize(flow, shorter), last = lastSource(materialized);
    if (!last) return null;
    if (last.itemIndex < first) return {range: shorter, line: materialized};
    limit = shorter.width - .05;
  }
  return null;
}

function laterWholeWord(flow, cursor, line, items, bands, slot, next, materialize) {
  if (line.fragments.length !== 1) return false;
  const first = line.fragments[0], item = items?.[first.itemIndex], text = item?.text;
  if (typeof text !== 'string' || item.break === 'never' || item.extraWidth > 0) return false;
  const start = first.sourceStart, end = first.sourceEnd;
  const letter = char => /\p{L}/u.test(char) && /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u.test(char);
  const join = char => char === '\u00a0' || char === '\u202f';
  const member = char => letter(char) || /\p{M}/u.test(char) || join(char);
  const point = at => at < text.length ? String.fromCodePoint(text.codePointAt(at)) : '';
  const before = [...text.slice(Math.max(0, start - 2), start)].at(-1) || '';
  if (!(end > start) || start === 0 && first.itemIndex > 0 || !letter(point(start)) ||
      ![...text.slice(start, end)].every(member) || member(before) || /[\p{L}\p{M}\p{N}]/u.test(before) || !member(point(end))) return false;
  let wordEnd = end, lastPoint = '';
  while (wordEnd < text.length && member(point(wordEnd))) {
    lastPoint = point(wordEnd); wordEnd += lastPoint.length;
  }
  if (join(lastPoint) || /[\p{L}\p{M}\p{N}]/u.test(point(wordEnd)) ||
      wordEnd === text.length && first.itemIndex + 1 < items.length) return false;
  for (let at = slot + 1; at < bands.length; at++) {
    if (bands[at].width <= bands[slot].width) continue;
    const range = next(flow, bands[at].width, cursor);
    if (!range || !Number.isFinite(range.width) || range.width > bands[at].width + .5) continue;
    const candidate = materialize(flow, range), begin = candidate.fragments[0], last = lastSource(candidate);
    if (begin?.itemIndex !== first.itemIndex || begin.sourceStart !== start) continue;
    if (last && (last.itemIndex > first.itemIndex ||
        last.itemIndex === first.itemIndex && last.sourceEnd >= wordEnd)) return true;
  }
  return false;
}

export function linePlan(flow, width, top, obstacles, lineHeight, minWidth, direction, balance,
  slotsForBand, layoutNextRichInlineLineRange, materializeRichInlineLineRange, items = null) {
  if (!flow || balance) return null;
  const lines = [];
  let cursor, previous = null, y = 0, bottom = 0, rows = 0;
  for (let step = 0; step < 4096 && rows < 768; step++) {
    const bands = slotsForBand(width, obstacles, top + y, lineHeight, Math.min(minWidth, width));
    if (!bands) return null;
    if (direction === 'rtl') bands.reverse();
    let advanced = false;
    for (let slot = 0; slot < bands.length; slot++) {
      const band = bands[slot];
      let range = layoutNextRichInlineLineRange(flow, band.width, cursor);
      if (!range) return lines.length ? {lines, height: Math.max(lineHeight, bottom)} : null;
      if (!Number.isFinite(range.width) || range.width > width + .5) return null;
      if (range.width > band.width + .5) continue;
      let line = materializeRichInlineLineRange(flow, range), column = false;
      if (!afterSource(lastSource(line), previous)) return null;
      if (laterWholeWord(flow, cursor, line, items, bands, slot, layoutNextRichInlineLineRange, materializeRichInlineLineRange)) continue;
      if (slot + 1 < bands.length && insideChip(items, line)) {
        const whole = beforeChip(flow, range, line, cursor, items, layoutNextRichInlineLineRange, materializeRichInlineLineRange);
        if (whole) { range = whole.range; line = whole.line; } else column = true;
      }
      if (!afterSource(lastSource(line), previous) || lines.length === 4096) return null;
      lines.push({...line, ...band, y});
      previous = lastSource(line); cursor = range.end; advanced = true; bottom = y + lineHeight;
      if (column) break;
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

function measuredPlan(flow, width, lineHeight, fontSize, next, materialize) {
  const lines = [], ranges = [];
  let cursor = {itemIndex: 0, segmentIndex: 0, graphemeIndex: 0};
  for (let row = 0; row < 768; row++) {
    const range = next(flow, width, cursor);
    if (!range) return lines.length ? {lines: fontSize ? balanced(flow, width, fontSize, lines, ranges, lineHeight, next, materialize) : lines} : null;
    if (range.width > width + .5 || range.end.segmentIndex === cursor.segmentIndex) return null;
    lines.push({...materialize(flow, range), x: 0, width, y: row * lineHeight}); ranges.push(range);
    cursor = range.end;
  }
  return null;
}

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
  const plan = measuredPlan(flow, width, lineHeight, fontSize, next, materialize);
  return plan?.lines.map(line => {
    const fragment = line.fragments[0];
    return {text: fragment.text, start: fragment.sourceStart, end: fragment.sourceEnd, width: fragment.occupiedWidth};
  }) || null;
}
