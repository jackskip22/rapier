// SPDX-License-Identifier: MIT
import {spawnHelper} from './helper-pool.mjs';
export const PARALLEL_WORKER = Object.freeze({
  worker: () => new Worker(new URL('./parallel-worker.mjs', import.meta.url), {type: 'module'}),
  url: () => new URL('./parallel-worker.mjs', import.meta.url),
});
export const spawnParallelWorker = () => spawnHelper(PARALLEL_WORKER);
