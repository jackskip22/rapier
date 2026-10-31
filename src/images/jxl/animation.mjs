// SPDX-License-Identifier: MIT
import {fault} from './admit.mjs';
import {ANIMATION_LIMITS, useMeasuredSearch} from './animation-frames.mjs';
import {encodeAnimationJob as steps} from './animation-steps.mjs';
import {searchV6} from './photo-v6-search.mjs';

export {ANIMATION_LIMITS as LIMITS};

export function encodeAnimation(animation, options) {
  const steps = encodeAnimationSteps(animation, options), progress = options?.progress;
  if (progress !== undefined && typeof progress !== 'function') throw fault('JXL_INPUT', 'progress is a function.');
  for (const fraction of steps) if (progress && fraction < 1) progress(fraction);
  progress?.(1);
  return steps.bytes;
}

export function encodeAnimationSteps(animation, options = {}) {
  useMeasuredSearch(searchV6);
  return steps(animation, options);
}
