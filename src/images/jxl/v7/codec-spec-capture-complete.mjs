// SPDX-License-Identifier: MIT
import {CAPTURE_COMPLETE_SPEC as QUEUE} from './queue-spec-capture-complete.mjs';
import {moduleRuntime} from './module-runtime.mjs';
import {runner, helperFile} from './codec-runner.mjs';
const helper = helperFile('rapier-jxl/capture-complete group helper', QUEUE.file);
export const CAPTURE_COMPLETE_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/capture-complete', () => Promise.all([QUEUE.load(), import('./capture-groups.mjs')])
    .then(([module, {withGroups}]) => withGroups(moduleRuntime(module, {name: 'rapier-jxl/capture-complete'}), module, 'rapier-jxl/capture-complete', helper)))});
