// Rapier's own JPEG XL encoder (images/jxl, MIT) behind the page's worker, through the package's own checked doors:
// pure JavaScript, no WebAssembly, no filesystem, network or imports at run time; one picture at a time. Pixels go to
// the effort door (the core's work with a search above it), exact at quality 100 and lossy modular below it (a picture
// of few colours exact when that is smaller). A request the page marks `photo` (a photograph it turned, resized or
// converted) goes to the photo door, unless the picture has few colours; notes thumbnails and paintings stay on the
// modular path (at matched PSNR the photo door gains a thumbnail nothing). A JPEG carried whole keeps its
// coefficients; JXL_JPEG names one the carrier does not take, which the caller decodes and encodes instead.
//
// The time rule (the lead's ruling, 30 September 2026): an exact picture is written at the page's effort, 3 (the
// weighted predictor, its contexts split by its own error), and its search gets one second after effort 1 ends. The
// door writes effort 1's stream first (the job's first half, fractions up to 0.5), so today's bytes are the floor; the
// job is hurried SEARCH_MS after that, or at once when the search's own pace, read over its first half second, says it
// would end later, and a hurried job answers with the smallest stream written so far. No insert waits more than about
// a second longer than it does today, and a faster device ends effort 1 sooner and gets more of the search inside the
// same second. The editor shows a picture only when the encode returns, which is why the second is per insert. A
// hurried picture records and says nothing: the person sees the picture; the bytes are what the second allowed.
import {encodeSteps} from './jxl/effort.mjs';
import {transcode} from './jxl/jpeg.mjs';
import {encodePhoto} from './jxl/photo.mjs';
import {inspectPixels} from './jxl/lossless.mjs';

const SEARCH_MS = 1000;

export function createJPEGXLEncoder() {
  return {
    encode(data, width, height, {quality, effort, photo}) {
      if (photo && quality < 100 && !inspectPixels(data, width, height).palette) return encodePhoto(data, width, height, {quality});
      const job = encodeSteps(data, width, height, {quality, effort});
      let mark = null;
      for (let step = job.next(); !step.done; step = job.next()) {
        const now = performance.now(), done = step.value;
        if (!mark) { if (done >= 0.5) mark = [now, done]; continue; }
        const spent = now - mark[0], pace = spent > 500 ? spent / (done - mark[1]) : 0;
        if (spent > SEARCH_MS || spent + pace * (1 - done) > SEARCH_MS) job.hurry = true;
      }
      return job.bytes;
    },
    transcode,
  };
}
