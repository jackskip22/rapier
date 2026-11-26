// SPDX-License-Identifier: MIT
import {FORMAT_SPEC as QUEUE} from './queue-spec-format.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {requireWebGPU} from './webgpu.mjs';
import {runner, helpers, helperFile} from './codec-runner.mjs';
const helper = helperFile('rapier-jxl/format helper', QUEUE.file);
export const FORMAT_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/format', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl/format', gpu: requireWebGPU, helpers, helper})))});
