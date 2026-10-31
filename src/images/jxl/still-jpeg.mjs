// SPDX-License-Identifier: MIT
import {ansTranscodeSteps} from './jpeg-ans-effort.mjs';
import {restoreJPEG} from './jpeg-reconstruction.mjs';
import {ensureKernels} from './kernels.mjs';
import {finishEncoding} from './async-job.mjs';

export async function transcodeJPEG(jpeg, {effort, icc, iccCompression, signal, progress, hurrySignal}) {
  ensureKernels();
  const job = ansTranscodeSteps(jpeg, {effort, icc, iccCompression});
  const bytes = await finishEncoding(job, {signal, progress, hurrySignal});
  return {bytes, width: job.width, height: job.height, orientation: job.orientation};
}

export function restoreJPEGFile(bytes, words) {
  ensureKernels();
  return words ? restoreJPEG(bytes, () => words) : restoreJPEG(bytes);
}
