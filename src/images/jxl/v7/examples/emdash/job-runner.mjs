// SPDX-License-Identifier: MIT
import * as resumable from 'rapier-jxl/resumable';
import {createEmDashJobStore, createEmDashCallBudget} from './job-store.mjs';

const ID = /^[a-f0-9]{32}$/, text = new TextEncoder();
const fail = (code, message) => Object.assign(new Error(message), {code});
const nameOf = id => `jxl-${id}`;
const keyOf = id => `jxl:job:${id}`;
const summary = result => { const {bytes, ...record} = result; return record; };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createEmDashJobRunner(ctx, {operations, media, scope = '', ms = 30, driver = resumable} = {}) {
  if (!Number.isFinite(ms) || ms <= 0 || ms > 40 || typeof scope !== 'string' || !ctx?.cron || !ctx?.kv)
    throw fail('JXL_OPTIONS', 'Expected EmDash scheduling, versioned KV and a budget up to 40 ms.');
  const budget = createEmDashCallBudget();
  const read = async id => {
    if (typeof id !== 'string' || !ID.test(id)) throw fail('JXL_INPUT', 'Expected the saved image job ID.');
    const current = await budget.call(() => ctx.kv.getVersioned(keyOf(id))) ?? {value: null, revision: null};
    if (current.value && current.value.command.scope !== scope) throw fail('JXL_INPUT', 'The job belongs to another media backend.');
    return current;
  };
  async function save(id, current, value) {
    const saved = await budget.call(() => ctx.kv.compareAndSet(keyOf(id), current.revision, value));
    if (saved?.applied === true) return {value, revision: saved.revision};
    if (saved?.applied === false) return read(id);
    throw fail('JXL_IO', 'The checkpoint write was not acknowledged.');
  }
  function commandOf(value) {
    if (typeof value?.id !== 'string' || !ID.test(value.id) || typeof value.key !== 'string' || !value.key ||
        typeof value.operation !== 'string' || !Object.hasOwn(operations ?? {}, value.operation) ||
        typeof operations[value.operation] !== 'function' || value.scope !== scope || !record(value.input) ||
        value.options !== undefined && !record(value.options))
      throw fail('JXL_OPTIONS', 'Expected a job ID, original key and encoder operation.');
    const command = {id: value.id, key: value.key, scope, operation: value.operation, input: value.input, options: value.options ?? {}};
    let json;
    try { json = JSON.stringify(command, (_, item) => {
      if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof item) || typeof item === 'number' && !Number.isFinite(item))
        throw fail('JXL_OPTIONS', 'Image requests contain JSON data.');
      return record(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
    }); } catch { throw fail('JXL_OPTIONS', 'Expected an acyclic JSON image request.'); }
    if (text.encode(json).length > 4096) throw fail('JXL_LIMIT', 'The image request exceeds the scheduler limit.');
    return JSON.parse(json);
  }
  async function ensure(command, current) {
    if (current.value) {
      if (JSON.stringify(current.value.command) !== JSON.stringify(command)) throw fail('JXL_INPUT', 'This job ID belongs to another request.');
      return current;
    }
    const saved = await save(command.id, current, {command, checkpoint: null, result: null, publication: null, canceled: false});
    if (JSON.stringify(saved.value?.command) !== JSON.stringify(command)) throw fail('JXL_INPUT', 'This job ID belongs to another request.');
    return saved;
  }
  const view = current => current?.value ? {id: current.value.command.id, revision: current.revision,
    done: current.value.result !== null, canceled: current.value.canceled,
    publishing: !current.value.canceled && current.value.result === null && current.value.checkpoint?.status === 'done',
    result: current.value.result, publication: current.value.publication} : null;

  async function step(current, signal) {
    const job = current?.value;
    if (!job) throw fail('JXL_INPUT', 'The image job is missing.');
    signal?.throwIfAborted();
    const {command} = job;
    if (job.result !== null && job.publication?.collect) {
      await media.collect(job.publication.collect, {signal, call: action => budget.call(action)});
      const {collect, ...publication} = job.publication;
      return view(await save(command.id, current, {...job, publication}));
    }
    if (job.result !== null || job.canceled) {
      await budget.call(() => ctx.cron.cancel(nameOf(command.id)));
      return view(current);
    }
    const operation = operations[command.operation];
    const store = createEmDashJobStore(ctx, {budget, readSource: (offset, length) =>
      media.readSource(command.key, offset, length, {generation: command.input.generation, signal,
        call: action => budget.call(action)})});
    if (!job.checkpoint) {
      const checkpoint = await driver.start({operation, input: command.input, options: command.options, store});
      return view(await save(command.id, current, {...job, checkpoint}));
    }
    if (job.checkpoint.status !== 'done') {
      const {checkpoint} = await driver.advance(job.checkpoint, {operation, input: command.input, store, budget: {ms}, signal});
      return view(await save(command.id, current, {...job, checkpoint}));
    }
    const result = await driver.finish(job.checkpoint, {operation, input: command.input, store, signal});
    signal?.throwIfAborted();
    const publication = result.fits === true ? await media.attach(command.key, result, {source: command.input.sha256,
      expectedGeneration: command.input.generation, jobIdentity: command.id, signal, call: action => budget.call(action)}) : null;
    return view(await save(command.id, current, {...job, result: summary(result), publication}));
  }
  return {
    budget,
    async queue(value) {
      const command = commandOf({...value, scope});
      const current = await read(command.id);
      if (current.value) return view(await ensure(command, current));
      await budget.call(() => ctx.cron.schedule(nameOf(command.id), {schedule: '* * * * *', data: command}));
      return view(await ensure(command, current));
    },
    async advance(id, {signal} = {}) { return step(await read(id), signal); },
    async status(id) { return view(await read(id)); },
    async cancel(id) {
      let current = await read(id);
      while (current.value && current.value.result === null && current.value.checkpoint?.status !== 'done' && !current.value.canceled)
        current = await save(id, current, {...current.value, canceled: true});
      return view(current);
    },
    async cron(event) {
      const id = event?.data?.id;
      if (event?.name !== nameOf(id)) throw fail('JXL_INPUT', 'The scheduled image job has another name.');
      const current = await read(id);
      return step(current.value ? current : await ensure(commandOf(event.data), current));
    },
  };
}
