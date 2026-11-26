// SPDX-License-Identifier: MIT
import {STILL_SPEC as QUEUE} from './queue-spec-still.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {requireWebGPU} from './webgpu.mjs';
import {runner, helpers, helperFile} from './codec-runner.mjs';
const helper = helperFile('rapier-jxl helper', QUEUE.file);
export const STILL_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl', gpu: requireWebGPU, helpers, helper})))});
