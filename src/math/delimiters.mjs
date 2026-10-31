// SPDX-License-Identifier: MIT
// A boundary index for a host-owned text region, not a Markdown parser.
export function createMathMatcher(source, {singleDollar = false, brackets = true} = {}) {
  if (typeof source !== 'string') throw new TypeError('Math boundaries require source text.');
  const markers = new Map(), next = Object.create(null);
  let slashes = 0, line = 0;
  for (let at = 0; at < source.length;) {
    const char = source[at];
    if (char === '\\') { slashes++; at++; continue; }
    if (char === '\n' || char === '\r') line++;
    if (char === '$') {
      let end = at + 1;
      while (source[end] === '$') end++;
      const count = end - at;
      if (!(slashes & 1) && (count === 2 || count === 1 && singleDollar))
        markers.set(at, {at, marker: count === 2 ? '$$' : '$', line});
      at = end;
    } else {
      if (brackets && slashes & 1 && '()[]'.includes(char))
        markers.set(at - 1, {at: at - 1, marker: '\\' + char, line});
      at++;
    }
    slashes = 0;
  }
  for (const entry of [...markers.values()].reverse()) {
    const closing = entry.marker === '\\(' ? '\\)' : entry.marker === '\\[' ? '\\]' : entry.marker;
    entry.close = next[closing];
    next[entry.marker] = entry;
  }
  return function match(start, limit = source.length) {
    const open = markers.get(start), close = open?.close;
    if (!close || open.marker === '\\)' || open.marker === '\\]' || close.at + close.marker.length > limit) return null;
    const bodyStart = start + open.marker.length, bodyEnd = close.at;
    if (open.marker === '$' && (open.line !== close.line || bodyStart === bodyEnd ||
        /\s/.test(source[bodyStart]) || /\s/.test(source[bodyEnd - 1]) || /[0-9]/.test(source[bodyEnd + 1] || ''))) return null;
    return {start, end: bodyEnd + close.marker.length, bodyStart, bodyEnd,
      open: open.marker, close: close.marker, displayMode: open.marker === '$$' || open.marker === '\\['};
  };
}
