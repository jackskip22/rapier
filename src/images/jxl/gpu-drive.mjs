// SPDX-License-Identifier: MIT
import {guard, answer} from './admit.mjs';
import {captureAnswer, screenPhotoAnswer} from './screen-floor.mjs';
import {gpuOffered, hostGPU} from './gpu-gate.mjs';
import {FAST_EFFORT} from './effort-level.mjs';
import {gpuQueue} from './gpu-queue.mjs';
import {deviceTrials} from './device-trial.mjs';
import {gpuCoreDevice, gpuCoreImage} from './gpu-core.mjs';
import {deferRetirement} from './call-scope.mjs';
import {gpuReadPending} from './turn.mjs';

export const gpuWanted = (options, width, height) => options?.gpu !== false && (!!options?.gpu || gpuOffered(width, height, options?.effort ?? FAST_EFFORT) && !!hostGPU());

async function gpuAnswer(request, given) {
  const device = (typeof given === 'object' && given) || await gpuCoreDevice();
  return device ? await gpuCoreImage(device, request) : null;
}

export async function driveGpu(it, given) {
  let step, reply;
  const gpu = gpuQueue(request => gpuAnswer(request, given));
  try {
    for (;;) {
      while (gpuReadPending) await gpuReadPending;
      step = guard(() => { deviceTrials(false); return it.next(reply); });
      if (step.done) break;
      const v = step.value;
      reply = v?.gpu ? (v.later ? gpu(v.gpu) : await gpu(v.gpu)) : v?.await !== undefined ? await gpu.watch(v.await)
        : v?.capture ? await captureAnswer(v.capture) : v?.screenPhoto ? await screenPhotoAnswer(v.screenPhoto) : undefined;
    }
    return answer(step.value);
  } finally { try { deferRetirement(gpu.end(), () => !step?.done ? it.return?.() : undefined); } catch {  } }
}

export function gpuJob(steps, device) {
  const it = (async function* () {
    let step, last, reply;
    const gpu = device ? gpuQueue(request => gpuAnswer(request, device)) : () => null;
    try { for (;;) {
      while (gpuReadPending) await gpuReadPending;
      step = guard(() => { deviceTrials(false); return steps.next(reply); });
      if (step.done) break;
      if (step.value?.gpu) reply = step.value.later ? gpu(step.value.gpu) : await gpu(step.value.gpu);
      else if (step.value?.await !== undefined) reply = await (gpu.watch ? gpu.watch(step.value.await) : step.value.await);
      else if (step.value?.capture) reply = await captureAnswer(step.value.capture);
      else if (step.value?.screenPhoto) reply = await screenPhotoAnswer(step.value.screenPhoto);
      else if (step.value?.split) reply = undefined;
      else { yield last = step.value; reply = it.hurry; }
    } } finally { deferRetirement(gpu.end?.(), () => !step?.done ? steps.return?.() : undefined); }
    if (last < 1) yield 1;
    return it.bytes = answer(step.value);
  })();
  it.bytes = null; it.hurry = false;
  return it;
}
