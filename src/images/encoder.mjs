// Rapier's own JPEG XL encoder (images/jxl, MIT): pure JavaScript, no WebAssembly, no filesystem, network or imports
// at run time. One picture at a time: RGBA in, a bare codestream out.
import {JPEG_XL_LIMITS, codecError, boundedDimensions} from './header.mjs';
import {inspectPixels, encodeLossless} from './jxl/lossless.mjs';
import {encodeLossy} from './jxl/lossy.mjs';
import {transcodeJPEG} from './jxl/vardct.mjs';
import {parseJPEG} from './jxl/jpeg.mjs';

export function createJPEGXLEncoder() {
  const refused = () => codecError('JXL_MEMORY', 'JPEG XL could not allocate enough memory for this image.');
  return {encode(data, width, height, {quality}) {
    try {
      const shape = inspectPixels(data, width, height);
      let bytes;
      if (quality >= 100) bytes = encodeLossless(data, width, height, {shape});
      else if (!shape.palette) bytes = encodeLossy(data, width, height, {quality, shape});
      else {
        // A picture of few colours is smaller exact than approximated: a lossy request never costs more bytes than
        // the lossless answer, and never less quality when the bytes are the same. The exact stream is cheap to make
        // (256-pixel sections) and is made first, so a lossy attempt that runs out of memory still answers with it.
        const exact = encodeLossless(data, width, height, {shape});
        try { bytes = encodeLossy(data, width, height, {quality, shape}); }
        catch (error) { if (!(error instanceof RangeError)) throw error; bytes = exact; }
        if (exact.length <= bytes.length) bytes = exact;
      }
      if (bytes.length > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'The encoded JPEG XL image exceeds 16 MiB.');
      return bytes;
    } catch (error) {
      if (error instanceof RangeError) throw refused();
      throw error;
    }
  },
  // A JPEG carried whole: its coefficients into a VarDCT frame, its Exif orientation into the header. JXL_JPEG names
  // a JPEG this path does not take (the caller decodes and encodes it instead).
  transcode(jpeg) {
    try {
      const parsed = parseJPEG(jpeg);
      boundedDimensions(parsed.width, parsed.height);
      const bytes = transcodeJPEG(jpeg, parsed);
      if (bytes.length > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'The encoded JPEG XL image exceeds 16 MiB.');
      const swapped = parsed.orientation >= 5;
      return {bytes, width: swapped ? parsed.height : parsed.width, height: swapped ? parsed.width : parsed.height, orientation: parsed.orientation};
    } catch (error) {
      if (error instanceof RangeError) throw refused();
      throw error;
    }
  }};
}
