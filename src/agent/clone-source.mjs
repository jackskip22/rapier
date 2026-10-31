// SPDX-License-Identifier: AGPL-3.0-only
export function cloneSource(value) {
  if (!value || typeof value !== 'object') return structuredClone(value);
  const ordinary = value => Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
  if (!ordinary(value)) return structuredClone(value);
  const make = value => Array.isArray(value) ? new Array(value.length) : {};
  const root = make(value), seen = new Map([[value, root]]), queue = [[value, root]];
  for (let at = 0; at < queue.length; at++) {
    const [source, target] = queue[at];
    for (const key of Object.keys(source)) {
      const property = Object.getOwnPropertyDescriptor(source, key);
      if (!property || !Object.hasOwn(property, 'value')) return structuredClone(value);
      const entry = property.value;
      if (typeof entry === 'function' || typeof entry === 'symbol') return structuredClone(value);
      let copy = entry;
      if (entry && typeof entry === 'object') {
        if (!ordinary(entry)) return structuredClone(value);
        copy = seen.get(entry);
        if (!copy) { copy = make(entry); seen.set(entry, copy); queue.push([entry, copy]); }
      }
      if (key === '__proto__') Object.defineProperty(target, key, {value: copy, enumerable: true, writable: true, configurable: true});
      else target[key] = copy;
    }
  }
  return root;
}
