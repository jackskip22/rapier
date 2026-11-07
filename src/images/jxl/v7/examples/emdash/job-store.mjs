// SPDX-License-Identifier: MIT
export const EMDASH_JOB_STORAGE = Object.freeze({jxlParts: Object.freeze({indexes: Object.freeze([])})});
const MAX_PART = 1024 * 1024, FRAGMENT = Math.floor((MAX_PART - 2) / 4) * 3;
const HASH = /^[a-f0-9]{64}$/;
const fail = (code, message) => Object.assign(new Error(message), {code});

export function createEmDashCallBudget(limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw fail('JXL_OPTIONS', 'Expected 1 to 10 storage calls.');
  let used = 0;
  return {get used() { return used; }, get remaining() { return limit - used; },
    async call(action) {
      if (used === limit) throw fail('JXL_LIMIT', 'The EmDash call budget is spent.');
      used++;
      return action();
    }};
}

function fragments(ref) {
  if (!HASH.test(ref?.hash ?? '') || !Number.isSafeInteger(ref.length) || ref.length < 0 || ref.length > MAX_PART)
    throw fail('JXL_INPUT', 'Expected an immutable part of at most 1 MiB.');
  return Array.from({length: Math.max(1, Math.ceil(ref.length / FRAGMENT))}, (_, index) => ({
    key: `jxl:${ref.hash}:${index}`, offset: index * FRAGMENT,
    length: Math.min(FRAGMENT, ref.length - index * FRAGMENT),
  }));
}
const base64 = bytes => {
  const chunks = [];
  for (let at = 0; at < bytes.length; at += 32768) chunks.push(String.fromCharCode(...bytes.subarray(at, at + 32768)));
  return btoa(chunks.join(''));
};

export function createEmDashJobStore(ctx, {readSource, budget = createEmDashCallBudget()} = {}) {
  const parts = ctx?.storage?.jxlParts;
  if (typeof parts?.getMany !== 'function' || typeof parts?.compareAndSet !== 'function' || typeof readSource !== 'function')
    throw fail('JXL_OPTIONS', 'Expected EmDash jxlParts storage and an immutable source reader.');
  const cache = new Map();
  async function readMany(refs) {
    if (!Array.isArray(refs) || refs.length > 128 || refs.reduce((n, ref) => n + ref.length, 0) > MAX_PART)
      throw fail('JXL_LIMIT', 'Read at most 128 parts and 1 MiB per batch.');
    const groups = refs.map(fragments), keys = [...new Set(groups.flat().map(part => part.key))].filter(key => !cache.has(key));
    if (keys.length) {
      const found = await budget.call(() => parts.getMany(keys));
      if (!(found instanceof Map)) throw fail('JXL_IO', 'EmDash returned an invalid part batch.');
      for (const key of keys) cache.set(key, found.get(key));
    }
    return refs.map((ref, index) => {
      const bytes = new Uint8Array(ref.length);
      for (const part of groups[index]) {
        const saved = cache.get(part.key);
        if (typeof saved !== 'string' || saved.length !== 4 * Math.ceil(part.length / 3))
          throw fail('JXL_IO', 'An immutable part is missing or truncated.');
        let text;
        try { text = atob(saved); } catch { throw fail('JXL_IO', 'An immutable part is not base64 data.'); }
        if (text.length !== part.length) throw fail('JXL_IO', 'An immutable part has the wrong length.');
        for (let i = 0; i < text.length; i++) bytes[part.offset + i] = text.charCodeAt(i);
      }
      return bytes;
    });
  }
  return {
    readSource,
    read: async ref => (await readMany([ref]))[0],
    readMany,
    async write(ref, bytes) {
      const pieces = fragments(ref);
      if (!(bytes instanceof Uint8Array) || bytes.length !== ref.length) throw fail('JXL_INPUT', 'Part length differs from its bytes.');
      const values = pieces.map(part => base64(bytes.subarray(part.offset, part.offset + part.length)));
      for (let i = 0; i < pieces.length; i++) {
        const key = pieces[i].key, value = values[i];
        if (cache.get(key) === value) continue;
        const saved = await budget.call(() => parts.compareAndSet(key, null, value));
        if (saved?.applied !== true && saved?.applied !== false) throw fail('JXL_IO', 'The immutable write was not acknowledged.');
        if (!saved.applied) {
          const found = await budget.call(() => parts.getMany([key]));
          if (!(found instanceof Map) || found.get(key) !== value) throw fail('JXL_INPUT', 'An immutable part differs from its saved bytes.');
        }
        cache.set(key, value);
      }
    },
  };
}
