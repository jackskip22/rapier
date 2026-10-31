// SPDX-License-Identifier: MIT
import {LIMITS} from './limits.mjs';
import {complete} from './bits.mjs';
import {job} from './admit.mjs';
import {effortJob} from './effort-job.mjs';
import {searchV6} from './photo-v6-search.mjs';
import {photoAnsSteps} from './photo-v6-blocks.mjs';
import {EXACT_LADDER} from './exact-ladder.mjs';
import {driveGpu, gpuWanted} from './gpu-drive.mjs';

export {LIMITS};

export function encode(data, width, height, options) { return complete(encodeSteps(data, width, height, options)); }

export function encodeSteps(data, width, height, options) { return job(effortJob(data, width, height, options, false, undefined, searchV6, photoAnsSteps, EXACT_LADDER)); }

export function encodeAsync(data, width, height, options) {
  try { return driveGpu(effortJob(data, width, height, options, gpuWanted(options, width, height), undefined, searchV6, photoAnsSteps, EXACT_LADDER), options?.gpu); }
  catch (error) { return Promise.reject(error); }
}
