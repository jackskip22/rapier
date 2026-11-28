import {fail, check, abortable} from './primitives.mjs';
export {encodeOptions, callOptions} from './encode-options.mjs';
import {gpuQueue} from '../gpu-queue.mjs';
import {deviceTrials} from '../device-trial.mjs';
import {drainCore} from './drain.mjs';

export function targetSource(data, ...descriptions) {
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray))
    throw fail('JXL_INPUT', 'measured fidelity: 8-bit straight sRGB RGBA, or use exact');
  const compatible = {colorSpace: 'srgb', bitDepth: 8, sampleFormat: 'uint', transferFunction: 'srgb', alphaPremultiplied: false, intensityTarget: 255};
  for (const description of descriptions) {
    for (const [key, value] of Object.entries(compatible)) if (description[key] !== undefined && description[key] !== value)
      throw fail('JXL_INPUT', `${key}: not with measured fidelity`);
    if (description.icc !== undefined)
      throw fail('JXL_INPUT', 'icc: not with measured fidelity');
  }
}
export const drain = (iterator, hooks = {}, gpuAnswer) => drainCore(iterator, hooks, gpuAnswer, gpuQueue, deviceTrials);
export async function driveSteps(steps, hooks, gpu, pixels, helpers, parallelJob, stage = null, jobBytes, geometry, floor) {
  check(hooks.signal);
  await abortable(gpu?.warm?.(), hooks.signal);
  const pool = parallelJob && helpers?.pool ? await helpers.pool(pixels, jobBytes, geometry, floor) : null;
  if (pool) return drain(parallelJob(steps, {kept: pool, signal: hooks.signal, gpu, stage}), hooks);
  return drain(steps, helpers?.split ? {...hooks, split: helpers.split} : hooks, gpu);
}
