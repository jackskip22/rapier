// SPDX-License-Identifier: MIT
import {driveGpu, gpuWanted} from './gpu-drive.mjs';
import {LIMITS, encode, encodeSteps, coreSteps} from './core-steps.mjs';

export {LIMITS, encode, encodeSteps};

export function encodeAsync(data, width, height, options) {
  try { return driveGpu(coreSteps(data, width, height, options, gpuWanted(options, width, height)), options?.gpu); }
  catch (error) { return Promise.reject(error); }
}
