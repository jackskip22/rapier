// SPDX-License-Identifier: MIT
import {createJournalStepper} from '../resumable-journal.mjs';
import {capture} from '../v7/capture.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {encode, fit, variants} from '../v7/index.mjs';
import {configureModules} from '../wasm-modules.mjs';
import {prepareCaptureKernels} from '../capture-kernels.mjs';
import {prepareKernels} from '../kernels.mjs';
import {wasmBytes} from '../wasm-text.mjs';
import {KERNELS} from '../kernels-bytes.mjs';

export const BUILD = 'b'.repeat(64);
let job, steps, ready;
const jobOf = () => {
  if (!job) {
    steps = {capture, recompress, restore, encode, fit, variants}[globalThis.RS1_OPERATION ?? 'capture'][Symbol.for('rapier-jxl.steps')];
    job = createJournalStepper({id: steps.id, build: BUILD, normalize: steps.normalize, open: steps.open, run: steps.run, eager: steps.eager});
  }
  return job;
};
export const start = (...args) => jobOf().start(...args), outputParts = (...args) => jobOf().outputParts(...args);
export async function advance(...args) {
  jobOf(); await (ready ??= prepareKernels()); await steps.prepare?.();
  const t = performance.now(), result = await job.advance(...args);
  if (result.work?.[0]) result.work[0].isolateMs = +(performance.now() - t).toFixed(1);
  return result;
}
export function configureCaptureKernels({kernels}) {
  configureModules({kernels});
  if (!prepareCaptureKernels()) throw new Error('The host-compiled capture kernel could not be prepared.');
}
export const captureKernelBytes = () => ({kernels: wasmBytes(KERNELS)});
