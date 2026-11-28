// SPDX-License-Identifier: MIT
import {DECODE_SPEC as QUEUE} from './queue-spec-decode.mjs';
import {simpleRuntime} from './decode-runtime.mjs';
import {runner} from './codec-runner.mjs';
export const DECODE_SPEC = Object.freeze({...QUEUE,
  runtime: () => runner('rapier-jxl/decode', () => QUEUE.load().then(module => simpleRuntime(module, 'rapier-jxl/decode')))});
