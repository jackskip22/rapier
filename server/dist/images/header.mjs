import {LIMITS, JPEG_LIMITS} from './jxl/bits.mjs';
import {codecError, byteView, boundedDimensions} from './jxl/worker-input.mjs';
export const JPEG_XL_LIMITS = LIMITS;
export const JPEG_XL_PICTURE_LIMITS = JPEG_LIMITS;

export {codecError, byteView, boundedDimensions};

export function inspectJPEGXL(input, prefix = false) {
  const bytes = byteView(input);
  if (bytes.length < 3 || bytes.length > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'JPEG XL data is empty or exceeds 16 MiB.');
  const parts = jxlCodestreamParts(bytes, prefix);
  let header = parts[0];
  if (parts.length > 1) {
    header = new Uint8Array(128);
    let used = 0;
    for (const part of parts) { const take = Math.min(128 - used, part.length); header.set(part.subarray(0, take), used); used += take; }
    header = header.subarray(0, used);
  }
  if (header.length < 3) throw codecError('JXL_CONTAINER', 'JPEG XL codestream is incomplete.');
  if (header[0] !== 255 || header[1] !== 10) throw codecError('JXL_SIGNATURE', 'JPEG XL codestream signature is invalid.');
  let bit = 16;
  const read = count => {
    if (bit + count > header.length * 8) throw codecError('JXL_HEADER', 'JPEG XL header is truncated.');
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value += ((header[bit >>> 3] >>> (bit & 7)) & 1) * 2 ** i;
    return value;
  };
  const ratioWidth = (height, ratio) => {
    const numerator = [0, 1, 12, 4, 3, 16, 5, 2][ratio], denominator = [1, 1, 10, 3, 2, 9, 4, 1][ratio];
    return Math.floor(height * numerator / denominator);
  };
  const size = () => {
    const small = read(1), dimension = () => small ? 8 * (1 + read(5)) : 1 + read([9, 13, 18, 30][read(2)]);
    const height = dimension(), ratio = read(3), width = ratio ? ratioWidth(height, ratio) : dimension();
    return boundedDimensions(width, height, JPEG_XL_PICTURE_LIMITS);
  };
  const dimensions = size();
  let orientation = 1, animated = false;
  if (!read(1) && read(1)) {
    orientation = 1 + read(3);
    if (read(1)) size();
    if (read(1)) {
      const div8 = read(1), dimension = () => {
        const choice = read(2);
        return div8 ? (choice < 2 ? [16, 32][choice] : [0, 0, 1, 33][choice] + read([0, 0, 5, 9][choice])) * 8 : [1, 65, 321, 1345][choice] + read([6, 8, 10, 12][choice]);
      };
      const height = dimension(), ratio = read(3);
      boundedDimensions(ratio ? ratioWidth(height, ratio) : dimension(), height, JPEG_XL_PICTURE_LIMITS);
    }
    animated = !!read(1);
  }
  return {...dimensions, orientation, animated};
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
