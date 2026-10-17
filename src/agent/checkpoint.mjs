// SPDX-License-Identifier: AGPL-3.0-only
import {sha256} from '../kit/ledger/hash.mjs';

export const CHECKPOINT_LIMITS = Object.freeze({minChars: 8 * 1024, maxChars: 128 * 1024, maskBits: 15, intervalMs: 30 * 60 * 1000});
const GEAR = (() => {
  const table = new Uint32Array(65536);
  let x = 0x9e3779b9;
  for (let i = 0; i < table.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; table[i] = x; }
  return table;
})();

export function chunkText(text, {minChars = CHECKPOINT_LIMITS.minChars, maxChars = CHECKPOINT_LIMITS.maxChars, maskBits = CHECKPOINT_LIMITS.maskBits} = {}) {
  const mask = (~0 << (32 - maskBits)) >>> 0, chunks = [];
  let start = 0, hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 1) + GEAR[text.charCodeAt(i)]) >>> 0;
    const size = i + 1 - start;
    if (size < minChars) continue;
    const code = text.charCodeAt(i), next = text.charCodeAt(i + 1);
    const splittable = !(code >= 0xd800 && code <= 0xdbff) && !(code === 13 && next === 10);
    if (splittable && ((hash & mask) === 0 || size >= maxChars)) { chunks.push(text.slice(start, i + 1)); start = i + 1; hash = 0; }
  }
  if (start < text.length || !chunks.length) chunks.push(text.slice(start));
  return chunks.map(part => ({id: sha256(part), text: part}));
}

export function checkpointOf({text, revision, filename}) {
  return {revision, filename, hash: sha256(text), chunks: chunkText(text)};
}

export function createCheckpointSchedule({write, linked, clock = () => Date.now(), intervalMs = CHECKPOINT_LIMITS.intervalMs}) {
  let dirty = false, lastAt = -Infinity, writing = null;
  const flush = async reason => {
    if (!dirty || !linked() || writing) return false;
    dirty = false; lastAt = clock();
    writing = Promise.resolve().then(() => write(reason)).catch(() => { dirty = true; }).finally(() => { writing = null; });
    await writing;
    return true;
  };
  return Object.freeze({
    changed() { dirty = true; },
    pagehide() { return flush('pagehide'); },
    tick() { return clock() - lastAt >= intervalMs ? flush('interval') : Promise.resolve(false); },
    get dirty() { return dirty; },
  });
}
