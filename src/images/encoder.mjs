// JPEG XL worker adapter. Complete the requested search before returning the smallest result.
import {configureKernels} from './jxl/kernels.mjs';
import {encodeSteps} from './jxl/effort.mjs';
import {encodePool, servePool} from './jxl/pool.mjs';
import {transcode} from './jxl/jpeg.mjs';
import {encodePhoto} from './jxl/photo.mjs';
import {inspectPixels} from './jxl/lossless.mjs';

const POOL_GROUPS = 40;
const POOL = typeof Worker === 'function' && typeof location === 'object' && location?.href ? Math.min(4, (globalThis.navigator?.hardwareConcurrency || 1) - 1) : 0;

export function createJPEGXLEncoder() {
  configureKernels('auto');
  return {
    async encode(data, width, height, options) {
      const {quality, photo} = options;
      if (photo && quality < 100 && (data instanceof Uint8Array || data instanceof Uint8ClampedArray) && !inspectPixels(data, width, height).palette)
        return encodePhoto(data, width, height, options);
      const pooled = POOL > 1 && quality >= 100 && Math.ceil(width / 256) * Math.ceil(height / 256) >= POOL_GROUPS;
      const job = pooled ? encodePool(data, width, height, options, {spawn: () => new Worker(location.href), workers: POOL}) : encodeSteps(data, width, height, options);
      while (!(await job.next()).done);
      return job.bytes;
    },
    transcode: jpeg => transcode(jpeg, {effort: 9}),
    serve: servePool,
  };
}
