// SPDX-License-Identifier: MIT
import {JPEG_SPEC as QUEUE} from './queue-spec-jpeg.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {runner} from './codec-runner.mjs';
export const JPEG_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/jpeg', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl/jpeg'})))});
