// SPDX-License-Identifier: MIT
import {stillEncoder} from './still-encoder.mjs';
import {parallelJob, serveParallel} from './parallel.mjs';

const drive = Object.freeze({job: parallelJob, serve: serveParallel});
export function createStillEncoder(options) {
  return stillEncoder(options, drive);
}
