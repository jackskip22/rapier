// SPDX-License-Identifier: AGPL-3.0-only
// Recovery for unsubmitted composer text, separate from posted threads in Markdown. A failed
// device write keeps the in-memory copy; a confirmation removes only the exact submitted draft.
export function createCommentDraftStore(storage) {
  const prefix = 'rapier.comment-draft:', memory = new Map();
  const valid = value => value && typeof value === 'object' && typeof value.documentId === 'string' &&
    typeof value.filename === 'string' && typeof value.text === 'string' && typeof value.recipient === 'string' &&
    typeof value.target === 'string' && (value.replyId === null || typeof value.replyId === 'string');
  const read = id => {
    if (memory.has(id)) return structuredClone(memory.get(id));
    try {
      const value = JSON.parse(storage?.getItem(prefix + id) || 'null');
      if (valid(value)) { memory.set(id, value); return structuredClone(value); }
    } catch (_) {}
    return null;
  };
  const write = (id, value) => {
    if (typeof id !== 'string' || !id || !valid(value)) throw new TypeError('comment_draft_invalid');
    const raw = JSON.stringify(value);
    memory.set(id, structuredClone(value));
    try { storage?.setItem(prefix + id, raw); return storage?.getItem(prefix + id) === raw; } catch (_) { return false; }
  };
  const remove = (id, expected) => {
    const actual = read(id);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
    try {
      const stored = storage?.getItem(prefix + id);
      if (stored && stored !== JSON.stringify(expected)) return false;
      storage?.removeItem(prefix + id);
      if (storage?.getItem(prefix + id)) return false;
    } catch (_) { return false; }
    memory.delete(id); return true;
  };
  const list = () => {
    try { for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(prefix)) read(key.slice(prefix.length)); } } catch (_) {}
    return [...memory].map(([id, value]) => ({id, ...structuredClone(value)}));
  };
  return Object.freeze({read, write, remove, list});
}
