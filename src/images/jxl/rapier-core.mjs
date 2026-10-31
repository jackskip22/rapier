// SPDX-License-Identifier: MIT
import {createStillEncoder} from './rapier-still.mjs';
import {formatStill} from './format-still.mjs';
import {codecEntry, LIMITS, JPEG_LIMITS, kernelMode} from './codec-entry.mjs';

const still = codecEntry(createStillEncoder, formatStill);
export const {createEncoder, installWorker} = still;
export {LIMITS, JPEG_LIMITS, kernelMode};
