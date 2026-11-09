// SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';
import {start, advance, finish} from '../v7/resumable.mjs';

export async function named(record, original) {
  const {sourceIdentity} = await import('../v7/result-identity.mjs'), source = await sourceIdentity(original);
  const one = r => r.source ? r : {...r, source};
  return Array.isArray(record) ? record.map(one) : one(record);
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const sourceRecord = (input, extra) => ({generation: 'rs1/' + sha256(input).slice(0, 16), sha256: sha256(input),
  byteLength: input.byteLength, ...extra});

export function memoryStore(input) {
  const parts = new Map();
  return {parts,
    write: async (ref, bytes) => { if (sha256(bytes) !== ref.hash || bytes.length !== ref.length) throw new Error('part digest'); parts.set(ref.hash, bytes.slice()); },
    read: async ref => parts.get(ref.hash)?.slice(), readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource: async (at, length) => input.slice(at, at + length)};
}

export async function drive(operation, input, description, options, {ms = 30, onAdvance, maxCalls = 1e6, verify} = {}) {
  const store = memoryStore(input), times = [], cpu = [];
  const source = sourceRecord(input, description);
  let text = JSON.stringify(await start({operation, input: source, options, store, ...(verify && {verify})})), done = false, calls = 0;
  while (!done) {
    const before = JSON.parse(text), t = performance.now(), c = process.cpuUsage();
    const result = await advance(before, {operation, input: source, store, ...(verify && {verify}), budget: {ms}});
    times.push(performance.now() - t); const used = process.cpuUsage(c); cpu.push((used.user + used.system) / 1000);
    await onAdvance?.({before, result, store, calls, input: source});
    for (const ref of result.released ?? []) store.parts.delete(ref.hash);
    text = JSON.stringify(result.checkpoint); done = result.done;
    if (++calls > maxCalls) throw new Error('unbounded resumable job');
  }
  const record = await finish(JSON.parse(text), {operation, input: source, store});
  return {record, bytes: record.bytes, calls, times, cpu, store, checkpoint: JSON.parse(text)};
}
