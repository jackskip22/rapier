// SPDX-License-Identifier: MIT
import {codecError} from './worker-input.mjs';
import {createStillEncoder} from './rapier-still.mjs';
import {reconstructJPEG} from './jpeg-ans.mjs';
import {encodeToScore as scoreEncode} from './score.mjs';
import {admitStill} from './still-admit.mjs';
import {createEncoder, installWorker, LIMITS, JPEG_LIMITS} from './rapier-core.mjs';
import {configureKernels, kernelMode} from './kernels.mjs';

export {createEncoder, installWorker, LIMITS, JPEG_LIMITS, configureKernels, kernelMode};

export async function encode(data, width, height, options) {
  const admitted = admitStill(options, {data, width, height});
  return createStillEncoder().encode(admitted.data, admitted.width, admitted.height, admitted.options);
}

export async function transcode(jpeg, options) {
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
  return createStillEncoder().transcode(jpeg, options);
}

export function reconstruct(bytes) {
  return reconstructJPEG(bytes);
}

export async function encodeToScore(data, width, height, options) {
  return scoreEncode(data, width, height, options);
}

