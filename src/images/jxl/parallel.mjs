// SPDX-License-Identifier: MIT
import {effortJob} from './effort-job.mjs';
import {searchV6} from './photo-v6-search.mjs';
import {photoAnsSteps} from './photo-v6-blocks.mjs';
import {EXACT_LADDER} from './exact-ladder.mjs';
import {jpegSteps} from './jpeg-job.mjs';
import {jpegEffortSteps} from './jpeg-effort.mjs';
import {jpegAnsEffortSteps} from './jpeg-ans-effort.mjs';
import {describePlan, serveParallel} from './parallel-serve.mjs';
export {describePlan, serveParallel};
import {parallelJob as driveJob, drain} from './parallel-drive.mjs';
import {workerPool, closeHelpers, reservedHelpers, defaultWorkers, memoryWorkers, spawnHelper, helperPool as poolFor, helperJob as jobOn, splitOnIdle as splitOn} from './helper-pool.mjs';
export {workerPool, closeHelpers, reservedHelpers, defaultWorkers};
const legacy = () => import('./parallel-spawn.mjs').then(({PARALLEL_WORKER}) => PARALLEL_WORKER);
export const spawnParallelWorker = async () => spawnHelper(await legacy());
export const helperPool = async (owner, reservation, pixels, helper) => poolFor(owner, reservation, pixels, helper ?? await legacy());
export const helperJob = async (owner, reservation, task, hooks = {}) => jobOn(owner, reservation, task, {...hooks, helper: hooks.helper ?? await legacy()});
export const splitOnIdle = async (owner, reservation, request, signal, helper) => splitOn(owner, reservation, request, signal, helper ?? await legacy());
export function parallelJob(steps, {workers = 0, spawn, signal, gpu, pool: kept} = {}) {
  return kept ? driveJob(steps, {signal, gpu, kept}) : driveJob(steps, {signal, gpu, pool: workers >= 2 ? workerPool(spawn, workers) : null});
}


export function createParallelEncoder({workers, spawn} = {}) {
  let pool, spawner, count, busy = Promise.resolve();
  const ready = (async () => {
    count = workers ?? await defaultWorkers();
    spawner = spawn ?? await spawnParallelWorker();
    if (count >= 2) { pool = workerPool(spawner, count); pool.warm(); }
  })();
  return {
    encode(data, width, height, options, {signal} = {}) {
      const run = busy.then(async () => {
        await ready;
        const steps = effortJob(data, width, height, options, false, undefined, searchV6, photoAnsSteps, EXACT_LADDER);
        if (!pool) return drain(steps, null, signal);
        pool.limit = Math.min(count, await memoryWorkers(width * height));
        let ended = false;
        try { const bytes = await drain(steps, pool, signal); ended = true; return bytes; }
        finally { pool.release(!ended); }
      });
      busy = run.catch(() => {});
      return run;
    },
    transcode(jpeg, options, {signal, ans = false} = {}) {
      const run = busy.then(async () => {
        await ready;
        if (pool) pool.limit = count;
        const shown = {}, steps = jpegSteps(jpeg, options, ans ? jpegAnsEffortSteps : jpegEffortSteps, fields => Object.assign(shown, fields));
        let ended = false;
        const bytes = pool ? await drain(steps, pool, signal).then(value => { ended = true; return value; }).finally(() => pool.release(!ended)) : await drain(steps, null, signal);
        return {bytes, ...shown};
      });
      busy = run.catch(() => {});
      return run;
    },
    async close() { await ready; await pool?.close(); },
  };
}

export async function encodeParallel(data, width, height, options, {workers, spawn, signal} = {}) {
  const encoder = createParallelEncoder({workers, spawn});
  try { return await encoder.encode(data, width, height, options, {signal}); }
  finally { await encoder.close(); }
}
