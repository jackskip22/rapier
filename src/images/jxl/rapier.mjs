// SPDX-License-Identifier: MIT
import {createJPEGXLEncoder} from './rapier-encoder.mjs';
import {format} from './format-worker.mjs';
import {codecEntry, LIMITS, JPEG_LIMITS, kernelMode} from './codec-entry.mjs';

const video = codecEntry(createJPEGXLEncoder, format);
export const {createEncoder, installWorker} = video;
export {LIMITS, JPEG_LIMITS, kernelMode};
