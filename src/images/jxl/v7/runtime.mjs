import {check, fail, object} from './primitives.mjs';
import {runCodec} from './run-codec.mjs';
import {prepareCapture} from './run-capture.mjs';
import {requireWebGPU} from './webgpu.mjs';

let helpersUsed = false;
export async function release(owner) {
  if (helpersUsed) await (await import('../helper-pool.mjs')).closeHelpers(owner);
}

let pool = null;
const helperPool = () => {
  if (!pool) { pool = import('../helper-pool.mjs'); pool.catch(() => { pool = null; }); }
  return pool;
};
const helperFile = () => import('../parallel-spawn.mjs').then(({PARALLEL_WORKER}) => PARALLEL_WORKER);
export async function run(operation, input, options = {}, hooks = {}) {
  object(options); check(hooks.signal);
  if (hooks.lane) {
    helpersUsed = true;
    try { return await (await helperPool()).helperJob(hooks.owner, hooks.helpers, {kind: 'whole', operation, input, options, maxPixels: hooks.maxPixels, webgpu: hooks.webgpu}, {...hooks, helper: await helperFile()}); }
    catch (error) { if (!error?.lost || hooks.signal?.aborted) throw error; }
  }
  if (hooks.helpers && !hooks.lane) await helperPool().catch(() => {});
  return runCodec(operation, input, options, hooks, hooks.helpers && !hooks.lane ? helpersDrive : undefined);
}

async function helpersDrive(steps, hooks, gpu, pixels) {
  const {drain} = await import('./common.mjs');
  const helpers = hooks.alone !== false && await helperPool(), workers = helpers ? helpers.reservedHelpers(hooks.helpers, pixels) : 0;
  if (workers < 2) return drain(steps, hooks.owner && hooks.helpers ? {...hooks, split: async request => { helpersUsed = true; return (await helperPool()).splitOnIdle(hooks.owner, hooks.helpers, request, hooks.signal, await helperFile()); }} : hooks, gpu);
  helpersUsed = true;
  const {parallelJob} = await import('../parallel.mjs');
  const pool = await helpers.helperPool(hooks.owner ?? hooks.helpers, hooks.helpers, pixels, await helperFile()).catch(error => { if (error?.lost && !hooks.signal?.aborted) return null; throw error; });
  return pool ? drain(parallelJob(steps, {pool, signal: hooks.signal, gpu}), hooks) : drain(steps, hooks, gpu);
}

async function kernels() {
  const {prepareKernels} = await import('../kernels.mjs');
  if (!await prepareKernels()) throw (await import('../capture-wasm-error.mjs')).wasmRequired();
}
const PREPARE = {
  capture: prepareCapture,
  encode: () => Promise.all([kernels(), import('../effort-job.mjs'), import('../photo-v6-blocks.mjs'), import('./instant.mjs'), import('./common.mjs'), import('./input.mjs'), import('./acceleration.mjs'),
    import('../capture-codec.mjs').then(({compileCaptureKernels}) => compileCaptureKernels())]),
  recompress: () => Promise.all([kernels(), import('../jpeg-ans-effort.mjs')]),
  restore: () => import('../jpeg-reconstruction.mjs'),
  decode: () => Promise.all([import('../decode-parallel.mjs'), import('../decode-image.mjs'), import('../decode-parts.mjs'),
    Promise.all([import('../wasm-modules.mjs'), import('../decode-kernels-bytes.mjs')])
      .then(([{compileWasm}, {DECODE_KERNELS}]) => compileWasm('decode', () => Uint8Array.from(DECODE_KERNELS, c => c.charCodeAt(0))))]),
  format: () => Promise.all([kernels(), import('./author.mjs')]),
};
export async function prepare(operation, {webgpu} = {}) {
  const ready = Object.hasOwn(PREPARE, operation) ? PREPARE[operation] : null;
  if (!ready) throw fail('JXL_OPTIONS', 'prepare names its operation: encode, capture, recompress, restore, decode or format.');
  if (operation === 'encode' && webgpu === 'required') await requireWebGPU('required');
  await ready();
}
