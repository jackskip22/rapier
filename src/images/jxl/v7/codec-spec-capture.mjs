// SPDX-License-Identifier: MIT
import {CAPTURE_SPEC as QUEUE} from './queue-spec-capture.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {runner} from './codec-runner.mjs';
export const CAPTURE_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/capture', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl/capture'})))});
