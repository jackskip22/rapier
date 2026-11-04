// SPDX-License-Identifier: MIT
function countLines(source, from, to) {
  let lines = 0;
  for (let i = from; i < to; i++) {
    const code = source.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) lines++;
  }
  return lines;
}

export function createMathMatcher(source, {singleDollar = false, brackets = true} = {}) {
  if (typeof source !== 'string') throw new TypeError('Math boundaries require source text.');
  const len = source.length;
  if (len === 0 || (source.indexOf('$') < 0 && (!brackets || source.indexOf('\\') < 0))) {
    return () => null;
  }
  const markers = new Map(), list = [], next = Object.create(null);
  if (!brackets) {
    let line = 0, lastAt = 0;
    for (let at = source.indexOf('$'); at >= 0; at = source.indexOf('$', at)) {
      line += countLines(source, lastAt, at);
      let slashes = 0;
      for (let s = at - 1; s >= 0 && source.charCodeAt(s) === 0x5c; s--) slashes++;
      let end = at + 1;
      while (end < len && source.charCodeAt(end) === 0x24) end++;
      const count = end - at;
      if (!(slashes & 1) && (count === 2 || count === 1 && singleDollar)) {
        const entry = {at, marker: count === 2 ? '$$' : '$', line, close: undefined};
        markers.set(at, entry);
        list.push(entry);
      }
      lastAt = end;
      at = end;
    }
  } else {
    let slashes = 0, line = 0;
    for (let at = 0; at < len;) {
      const code = source.charCodeAt(at);
      if (code === 0x5c) { slashes++; at++; continue; }
      if (code === 0x0a || code === 0x0d) line++;
      if (code === 0x24) {
        let end = at + 1;
        while (end < len && source.charCodeAt(end) === 0x24) end++;
        const count = end - at;
        if (!(slashes & 1) && (count === 2 || count === 1 && singleDollar)) {
          const entry = {at, marker: count === 2 ? '$$' : '$', line, close: undefined};
          markers.set(at, entry);
          list.push(entry);
        }
        at = end;
      } else {
        if (slashes & 1 && (code === 0x28 || code === 0x29 || code === 0x5b || code === 0x5d)) {
          const entry = {at: at - 1, marker: '\\' + source[at], line, close: undefined};
          markers.set(at - 1, entry);
          list.push(entry);
        }
        at++;
      }
      slashes = 0;
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    const closing = entry.marker === '\\(' ? '\\)' : entry.marker === '\\[' ? '\\]' : entry.marker;
    entry.close = next[closing];
    next[entry.marker] = entry;
  }
  return function match(start, limit = len) {
    const open = markers.get(start), close = open?.close;
    if (!close || open.marker === '\\)' || open.marker === '\\]' || close.at + close.marker.length > limit) return null;
    const bodyStart = start + open.marker.length, bodyEnd = close.at;
    if (open.marker === '$' && (open.line !== close.line || bodyStart === bodyEnd ||
        /\s/.test(source[bodyStart]) || /\s/.test(source[bodyEnd - 1]) || /[0-9]/.test(source[bodyEnd + 1] || ''))) return null;
    return {start, end: bodyEnd + close.marker.length, bodyStart, bodyEnd,
      open: open.marker, close: close.marker, displayMode: open.marker === '$$' || open.marker === '\\['};
  };
}
