// SPDX-License-Identifier: MIT
export function observe(text, reader, spend, safe, references = true, lenient = false) {
  let value;
  try { value = reader(text); } catch (error) { return {invalid: true, threw: true, error}; }
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
