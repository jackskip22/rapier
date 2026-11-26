// SPDX-License-Identifier: MIT
import {ANIMATION_SPEC as QUEUE} from './queue-spec-animation.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {requireWebGPU} from './webgpu.mjs';
import {runner, helpers, helperFile} from './codec-runner.mjs';
const helper = helperFile('rapier-jxl/animation helper', QUEUE.file);
export const ANIMATION_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/animation', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl/animation', gpu: requireWebGPU, helpers, helper})))});
