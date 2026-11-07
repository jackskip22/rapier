// SPDX-License-Identifier: MIT
import * as resumable from 'rapier-jxl/resumable';

const fail = (code, message, cause) => Object.assign(new Error(message, cause && {cause}), {code});
const versioned = value => typeof value === 'string' && value.length > 0 ||
  Number.isSafeInteger(value) && value >= 0;
const copy = value => {
  try { return structuredClone(value); }
  catch (cause) { throw fail('JXL_INPUT', 'Job inputs and saved records must be cloneable data.', cause); }
};
const observed = (current, outcome = 'stale') => ({outcome, ...current});

export function createDurableDriver({operation, store, readSource} = {}) {
  if (typeof operation !== 'function') throw fail('JXL_OPTIONS', 'Pass the imported encoding operation.');
  for (const name of ['getVersioned', 'compareAndSet', 'read'])
    if (typeof store?.[name] !== 'function') throw fail('JXL_OPTIONS', 'store.' + name + ' is required.');
  if (typeof store.write !== 'function' && typeof store.writeMany !== 'function')
    throw fail('JXL_OPTIONS', 'The immutable store needs write or writeMany.');
  if (typeof readSource !== 'function') throw fail('JXL_OPTIONS', 'An immutable source reader is required.');

  const ioFor = input => ({
    readSource: (offset, length) => readSource(copy(input), offset, length),
    read: ref => store.read(ref),
    ...(typeof store.readMany === 'function' && {readMany: refs => store.readMany(refs)}),
    ...(typeof store.write === 'function' && {write: (ref, bytes) => store.write(ref, bytes)}),
    ...(typeof store.writeMany === 'function' && {writeMany: parts => store.writeMany(parts)}),
  });
  function record(value) {
    const saved = copy(value);
    if (saved?.kind !== 'resumable-job' || typeof saved.input?.generation !== 'string' ||
        !saved.input.generation || typeof saved.done !== 'boolean' || typeof saved.canceled !== 'boolean' ||
        saved.done && saved.canceled || !Number.isSafeInteger(saved.checkpoint?.revision) ||
        saved.checkpoint.revision < 0 || typeof saved.commit !== 'string' || !saved.commit)
      throw fail('JXL_INPUT', 'Invalid saved host job.');
    return saved;
  }
  async function inspect(key) {
    if (typeof key !== 'string' || !key) throw fail('JXL_OPTIONS', 'A job storage key is required.');
    const current = await store.getVersioned(key);
    if (!current || current.version !== null && !versioned(current.version) ||
        current.value !== null && current.version === null)
      throw fail('JXL_INPUT', 'Store returned an invalid versioned job.');
    return {version: current.version, value: current.value === null ? null : record(current.value)};
  }
  function fence(command) {
    if (!command || typeof command.generation !== 'string' || !command.generation ||
        command.expectedVersion !== null && !versioned(command.expectedVersion))
      throw fail('JXL_OPTIONS', 'Name the saved source generation and observed store version.');
    return {...command};
  }
  const matches = (current, command) => current.value?.input.generation === command.generation &&
    current.version === command.expectedVersion;

  async function save(key, current, next, signal) {
    const value = record({...next, commit: crypto.randomUUID()});
    signal?.throwIfAborted();
    let saved, error;
    try { saved = await store.compareAndSet(key, current.version, copy(value)); } catch (cause) { error = cause; }
    if (saved?.ok === true && versioned(saved.version) && saved.version !== current.version)
      return {outcome: 'committed', value, version: saved.version};
    let actual;
    try { actual = await inspect(key); }
    catch (cause) {
      if (error || saved?.ok !== false)
        throw Object.assign(fail('JXL_IO', 'Checkpoint commit outcome is unknown.', error ?? cause), {commitOutcome: 'unknown'});
      throw cause;
    }
    if (actual.value?.commit === value.commit) {
      if (actual.version === current.version) throw fail('JXL_INPUT', 'Store reused a CAS version.');
      return observed(actual, 'observed');
    }
    if ((error || saved?.ok !== false) && actual.version === current.version)
      throw Object.assign(fail('JXL_IO', 'Checkpoint commit outcome is unknown.', error), {commitOutcome: 'unknown'});
    return observed(actual);
  }

  return {
    inspect,
    async start(key, {input, options, expectedVersion = null, signal} = {}) {
      if (expectedVersion !== null && !versioned(expectedVersion)) throw fail('JXL_OPTIONS', 'Invalid expected store version.');
      const ownedInput = copy(input), ownedOptions = copy(options);
      signal?.throwIfAborted();
      const current = await inspect(key);
      if (current.version !== expectedVersion) return observed(current);
      signal?.throwIfAborted();
      const checkpoint = await resumable.start({operation, input: ownedInput, options: ownedOptions, store: ioFor(ownedInput)});
      return save(key, current, {kind: 'resumable-job', input: ownedInput, checkpoint, done: false, canceled: false}, signal);
    },
    async advance(key, command) {
      command = fence(command);
      const current = await inspect(key);
      command.signal?.throwIfAborted();
      if (!matches(current, command)) return observed(current);
      if (current.value.done || current.value.canceled) return observed(current, 'observed');
      const {checkpoint, done} = await resumable.advance(current.value.checkpoint, {
        operation, input: current.value.input, store: ioFor(current.value.input), budget: command.budget ?? {ms: 30}, signal: command.signal,
      });
      return save(key, current, {...current.value, checkpoint, done}, command.signal);
    },
    async finish(key, command) {
      command = fence(command);
      const current = await inspect(key);
      command.signal?.throwIfAborted();
      if (!matches(current, command)) return observed(current);
      if (!current.value.done || current.value.canceled) throw fail('JXL_INPUT', 'Only a completed job can finish.');
      const result = await resumable.finish(current.value.checkpoint, {
        operation, input: current.value.input, store: ioFor(current.value.input), signal: command.signal,
      });
      command.signal?.throwIfAborted();
      const actual = await inspect(key);
      command.signal?.throwIfAborted();
      if (!matches(actual, command)) return observed(actual);
      return {...observed(actual, 'finished'), result};
    },
    async cancel(key, command) {
      command = fence(command);
      const current = await inspect(key);
      command.signal?.throwIfAborted();
      if (!matches(current, command)) return observed(current);
      if (current.value.done || current.value.canceled) return observed(current, 'observed');
      return save(key, current, {...current.value, canceled: true}, command.signal);
    },
  };
}
