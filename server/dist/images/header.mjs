import {header} from './jxl/v7/metadata.mjs';
import {JPEG_XL_LIMITS, JPEG_XL_PICTURE_LIMITS, codecError, byteView, boundedDimensions} from './limits.mjs';
export {JPEG_XL_LIMITS, JPEG_XL_PICTURE_LIMITS, codecError, byteView, boundedDimensions};

export function inspectJPEGXL(input, prefix = false) {
  const bytes = byteView(input);
  if (bytes.length < 3 || bytes.length > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'JPEG XL data is empty or exceeds 16 MiB.');
  if (!prefix) jxlCodestreamParts(bytes);
  const info = header(bytes);
  const dimensions = boundedDimensions(info.width, info.height, JPEG_XL_PICTURE_LIMITS);
  for (const size of [info.intrinsicSize, info.preview]) if (size) boundedDimensions(size.width, size.height, JPEG_XL_PICTURE_LIMITS);
  return {...dimensions, orientation: info.orientation, animated: !!info.animation, reconstruction: info.reconstruction};
}

export function jxlCodestreamParts(input, prefix = false) {
  const bytes = byteView(input);
  if (bytes[0] === 255 && bytes[1] === 10) return [bytes];
  const signature = [0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10];
  if (signature.some((value, index) => bytes[index] !== value)) throw codecError('JXL_SIGNATURE', 'This is not a JPEG XL image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts = [];
  let offset = 12, nextPart = 0, complete = false, codestream = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw codecError('JXL_CONTAINER', 'JPEG XL has a truncated container box.');
    let length = view.getUint32(offset), start = offset + 8;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (length === 1) {
      if (offset + 16 > bytes.length || view.getUint32(offset + 8) !== 0) throw codecError('JXL_CONTAINER', 'JPEG XL has an invalid large container box.');
      length = view.getUint32(offset + 12);
      start += 8;
    } else if (length === 0) length = bytes.length - offset;
    const cut = prefix && length > bytes.length - offset && (type === 'jxlc' || type === 'jxlp');
    if (length < start - offset || length > bytes.length - offset && !cut) throw codecError('JXL_CONTAINER', 'JPEG XL container length is invalid.');
    const end = cut ? bytes.length : offset + length;
    if (type === 'jxlc' || type === 'jxlp') {
      if (complete || (type === 'jxlc' && codestream)) throw codecError('JXL_CONTAINER', 'JPEG XL contains conflicting codestreams.');
      if (type === 'jxlp') {
        if (start + 4 > end) throw codecError('JXL_CONTAINER', 'JPEG XL has an empty codestream part.');
        const index = view.getUint32(start);
        if ((index & 0x7fffffff) !== nextPart++) throw codecError('JXL_CONTAINER', 'JPEG XL codestream parts are out of order.');
        complete = Boolean(index >>> 31);
        start += 4;
      } else complete = true;
      codestream = true;
      parts.push(bytes.subarray(start, end));
      if (cut) return parts;
    }
    offset = end;
  }
  if (!codestream || !complete) throw codecError('JXL_CONTAINER', 'JPEG XL codestream is incomplete.');
  return parts;
}
