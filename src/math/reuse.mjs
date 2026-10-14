// SPDX-License-Identifier: MIT
// Message artifacts have a different lifetime from document admission. This
// module has no renderer, host, timer or DOM imports and retains no callbacks.
const sessions = new WeakMap();
const ENTRY_BYTES = 128;

export function createMathSession({maxEntries = 128, maxRetainedBytes = 2 * 1024 * 1024,
  maxEntryBytes = 256 * 1024} = {}) {
  for (const value of [maxEntries, maxRetainedBytes, maxEntryBytes])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError('Math reuse limits must be finite nonnegative integers.');
  const state = {entries: new Map(), maxEntries, maxRetainedBytes,
    maxEntryBytes: Math.min(maxEntryBytes, maxRetainedBytes), keyBytes: 0, artifactBytes: 0,
    peakRetainedBytes: 0, hits: 0, evaluations: 0, bypasses: 0, evictions: 0, epoch: 0, disposed: false};
  const clear = () => {
    state.entries.clear(); state.keyBytes = state.artifactBytes = 0; state.epoch++;
  };
  const session = Object.freeze({
    clear,
    dispose() { clear(); state.disposed = true; },
    get stats() {
      return Object.freeze({entries: state.entries.size, retainedBytes: state.keyBytes + state.artifactBytes,
        keyBytes: state.keyBytes, artifactBytes: state.artifactBytes, peakRetainedBytes: state.peakRetainedBytes,
        hits: state.hits, evaluations: state.evaluations, bypasses: state.bypasses, evictions: state.evictions,
        disposed: state.disposed});
    },
  });
  sessions.set(session, state);
  return session;
}

export function assertMathSession(session) {
  if (session === undefined) return;
  const state = sessions.get(session);
  if (!state || state.disposed) throw new TypeError('Supply a live Math session created by createMathSession.');
}

// Only immutable scalar/string results are retained. A new nested payload needs
// its own concrete ownership/size contract. Errors and in-progress work never enter.
function artifactSize(result) {
  if (!result || !Array.isArray(result.errors) || result.errors.length || typeof result.svg !== 'string') return null;
  const fields = Reflect.ownKeys(result);
  if (fields.length > 32) return null;
  let bytes = ENTRY_BYTES;
  for (const key of fields) {
    if (typeof key !== 'string') return null;
    const field = Object.getOwnPropertyDescriptor(result, key);
    if (!field.enumerable || !('value' in field)) return null;
    bytes += 2 * key.length;
    const value = field.value;
    if (key === 'errors') continue;
    if (typeof value === 'string') bytes += 2 * value.length;
    else if (typeof value === 'number' && Number.isFinite(value)) bytes += 8;
    else if (typeof value === 'boolean' || value === null || value === undefined) bytes += 8;
    else return null;
  }
  return bytes;
}

function occurrenceNeutral(result) {
  // Current expanded output has no occurrence IDs. A compact/semantic join must
  // supply neutral preparation + per-insertion materialization before it can be
  // cached. Default changes are guarded too, even without a new option key.
  for (const value of Object.values(result)) if (typeof value === 'string' &&
    /\s(?:id|aria-labelledby|aria-describedby)\s*=|\s(?:xlink:)?href\s*=\s*["']#|url\s*\(\s*["']?#/i.test(value)) return false;
  return true;
}

const copyResult = result => ({...result, errors: result.errors.map(error => ({...error}))});

// Internal integration seam. `configuration` encodes a complete captured option
// tuple, or null for a no-cache shape. `calculate` is invoked once on a miss and
// is never stored. Source/keys are strings, never JSON-serialized caller objects.
export function reuseFormula(session, source, configuration, calculate) {
  if (session === undefined) return calculate();
  assertMathSession(session);
  const state = sessions.get(session), epoch = state.epoch;
  const keyBytes = configuration === null || typeof source !== 'string' || source.length > 1_000_000
    ? Infinity : 2 * (configuration.length + 1 + source.length);
  const eligible = state.maxEntries > 0 && keyBytes + ENTRY_BYTES <= state.maxEntryBytes;
  // Do not construct an oversized key just to refuse it.
  const key = eligible ? configuration + '\n' + source : null;
  if (key !== null && state.entries.has(key)) {
    const entry = state.entries.get(key);
    state.entries.delete(key); state.entries.set(key, entry);
    state.hits++;
    return copyResult(entry.result);
  }
  state.evaluations++;
  const result = calculate();
  const bytes = eligible ? artifactSize(result) : null;
  if (state.disposed || state.epoch !== epoch) return result;
  if (bytes === null || keyBytes + bytes > state.maxEntryBytes || !occurrenceNeutral(result)) {
    state.bypasses++;
    return result;
  }
  // Reentrant work may have populated the same key. Do not double-charge it or
  // resurrect an artifact after clear/dispose while calculation was in progress.
  if (state.entries.has(key)) return result;
  while (state.entries.size >= state.maxEntries ||
    state.keyBytes + state.artifactBytes + keyBytes + bytes > state.maxRetainedBytes) {
    const oldest = state.entries.keys().next().value, entry = state.entries.get(oldest);
    state.entries.delete(oldest); state.keyBytes -= entry.keyBytes; state.artifactBytes -= entry.bytes; state.evictions++;
  }
  const saved = Object.freeze({...result, errors: Object.freeze([])});
  state.entries.set(key, {result: saved, keyBytes, bytes});
  state.keyBytes += keyBytes; state.artifactBytes += bytes;
  state.peakRetainedBytes = Math.max(state.peakRetainedBytes, state.keyBytes + state.artifactBytes);
  return copyResult(saved);
}
