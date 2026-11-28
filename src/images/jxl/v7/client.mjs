// SPDX-License-Identifier: MIT
import {createBaseCodec} from './client-base.mjs';
import {admitFrames} from './surface.mjs';
import {isImageResult} from './result-shape.mjs';
import {helperReservation} from './helper-reservation.mjs';
export {deviceHelpers, helperReservation} from './helper-reservation.mjs';

export function createCodec(config = {}, spec) {
  return createBaseCodec(config, spec, admitFrames, isImageResult, helperReservation);
}
