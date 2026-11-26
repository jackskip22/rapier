// SPDX-License-Identifier: MIT
import {UPLOAD_SPEC as QUEUE} from './queue-spec-upload.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {runner, helpers, helperFile} from './codec-runner.mjs';
const helper = helperFile('rapier-jxl/upload helper', QUEUE.file);
export const UPLOAD_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/upload', () => QUEUE.load().then(module => moduleRuntime(module, {name: 'rapier-jxl/upload', helpers, helper})))});
