// SPDX-License-Identifier: MIT
import {createStillEncoder} from './rapier-still.mjs';
import {encodeAnimationSteps} from './animation.mjs';
import {finishEncoding, checkSignal} from './async-job.mjs';

export function createJPEGXLEncoder(options = {}) {
  const still = createStillEncoder(options);
  return {
    ...still,
    async animation(animation, options) {
      checkSignal(options.signal);
      return finishEncoding(encodeAnimationSteps(animation, options), options);
    },
  };
}
