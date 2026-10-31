// SPDX-License-Identifier: MIT
import {createJPEGXLCodec, installJPEGXLWorker} from './worker.mjs';
import {LIMITS, JPEG_LIMITS} from './limits.mjs';
import {readImage} from './image-source.mjs';
import {kernelMode} from './kernels.mjs';

export function codecEntry(encoderFactory, formatHandler) {
  return {
    createEncoder(options = {}) {
      return createJPEGXLCodec({imageReader: readImage, encoderFactory: () => encoderFactory(options), formatHandler});
    },
    installWorker(options = {}) {
      return installJPEGXLWorker({imageReader: readImage, encoderFactory: () => encoderFactory(options), formatHandler});
    },
  };
}
export {LIMITS, JPEG_LIMITS, kernelMode};
