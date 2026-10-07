// Rapier's own JPEG XL encoder (images/jxl, MIT) behind the page's worker, through the package's own checked doors: JavaScript with
// optional inlined WebAssembly SIMD, no filesystem, network or imports at run time; one picture at a time. Pixels go to the effort
// door (the core's work with a search above it), exact at quality 100 and lossy modular below it (a picture of few colours exact when
// that is smaller). A request the page marks `photo` (a photograph it turned, resized or converted) goes to the photo door, unless the
// picture has few colours; notes thumbnails and paintings stay on the modular path (at matched PSNR the photo door gains a thumbnail
// nothing). A JPEG carried whole keeps its coefficients; JXL_JPEG names one the carrier does not take, which the caller decodes and
// encodes instead.
//
// The time rule: an exact picture is written at the page's effort, 3 (the weighted predictor, its contexts split by its own error),
// and its search gets one second after effort 1 ends. The door writes effort 1's stream first (the job's first half, fractions up to
// 0.5), so effort 1's bytes are the floor; the job is hurried SEARCH_MS after that, or at once when the search's own pace, read over
// its first half second, says it would end later, and a hurried job answers with the smallest stream written so far. No insert waits
// more than about a second longer than effort 1 alone, and a faster device ends effort 1 sooner and gets more of the search inside the
// same second. The editor shows a picture only when the encode returns, which is why the second is per insert. A hurried picture
// records and says nothing: the person sees the picture; the bytes are what the second allowed.
//
// Every core: an exact picture of POOL_GROUPS groups or more is written by a pool of nested workers, each a copy of this image worker
// started from its own address, which answer the pool's messages (codec.mjs, servePool): the same bytes, the time divided. One fewer
// than the device's cores, at most four; none where a worker cannot start a worker, on a device of two cores or fewer, or below 40
// groups (about 2.6 MP): in Chrome 154 on four cores a 30-group picture breaks even and a 48-group one gains a third at effort 1
// (tools/probes/jxl-pool-browser.mjs), the workers' start costing about 50 ms. The time rule reads the same fractions; a worker that
// fails leaves its groups to this one, which codes groups too; ending this worker ends them.
import {configureKernels} from './jxl/kernels.mjs';
import {encodeSteps} from './jxl/effort.mjs';
import {encodePool, servePool} from './jxl/pool.mjs';
import {transcode} from './jxl/jpeg.mjs';
import {encodePhoto} from './jxl/photo.mjs';
import {inspectPixels} from './jxl/lossless.mjs';

const SEARCH_MS = 1000, POOL_GROUPS = 40;
const POOL = typeof Worker === 'function' && typeof location === 'object' && location?.href ? Math.min(4, (globalThis.navigator?.hardwareConcurrency || 1) - 1) : 0;

export function createJPEGXLEncoder() {
  configureKernels('auto');
  return {
    async encode(data, width, height, options) {
      const {quality, effort, photo} = options;
      if (photo && quality < 100 && (data instanceof Uint8Array || data instanceof Uint8ClampedArray) && !inspectPixels(data, width, height).palette)
        return encodePhoto(data, width, height, {...options, effort: undefined});
      const pooled = POOL > 1 && quality >= 100 && Math.ceil(width / 256) * Math.ceil(height / 256) >= POOL_GROUPS;
      const job = pooled ? encodePool(data, width, height, options, {spawn: () => new Worker(location.href), workers: POOL}) : encodeSteps(data, width, height, options);
      let mark = null;
      for (let step = await job.next(); !step.done; step = await job.next()) {
        const now = performance.now(), done = step.value;
        if (!mark) { if (done >= 0.5) mark = [now, done]; continue; }
        const spent = now - mark[0], pace = spent > 500 ? spent / (done - mark[1]) : 0;
        if (spent > SEARCH_MS || spent + pace * (1 - done) > SEARCH_MS) job.hurry = true;
      }
      return job.bytes;
    },
    transcode,
    serve: servePool,
  };
}
