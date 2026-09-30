// The encoder's limits: 16 MiB of output, 16,384 pixels on an edge, and each door's pixels by its memory (images/jxl/
// bits.mjs): 24 megapixels for pixels the page encodes (a lossy picture holds its squeezed planes whole), 64 for a JPEG
// the carrier keeps whole (its coefficients, two bytes a sample).
import {LIMITS, JPEG_LIMITS} from './jxl/bits.mjs';
// The one owner of the limits is the encoder (images/jxl/bits.mjs): what the page admits is what the codec takes.
export const JPEG_XL_LIMITS = LIMITS;
// The largest picture the page keeps: a JPEG carried whole; a stored JPEG XL is admitted up to it.
export const JPEG_XL_PICTURE_LIMITS = JPEG_LIMITS;

export function codecError(code, message) {
  return Object.assign(new Error(message), {code});
}

export function byteView(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw codecError('JXL_INPUT', 'JPEG XL input must be bytes.');
}

export function boundedDimensions(width, height, limits = JPEG_XL_LIMITS) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limits.edge || height > limits.edge || width * height > limits.pixels) {
    throw codecError('JXL_DIMENSIONS', 'This image exceeds the ' + limits.pixels / 1e6 + ' megapixel image limit.');
  }
  return {width, height};
}

// SizeHeader and ImageMetadata field order from the pinned libjxl source.
// Inspect dimensions before the C++ decoder can allocate its output planes.
export function inspectJPEGXL(input) {
  const bytes = byteView(input);
  if (bytes.length < 3 || bytes.length > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'JPEG XL data is empty or exceeds 16 MiB.');
  let header = bytes;
  if (bytes[0] !== 255 || bytes[1] !== 10) {
    const signature = [0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10];
    if (signature.some((value, index) => bytes[index] !== value)) throw codecError('JXL_SIGNATURE', 'This is not a JPEG XL image.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), prefix = new Uint8Array(128);
    let offset = 12, used = 0, nextPart = 0, complete = false, codestream = false;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) throw codecError('JXL_CONTAINER', 'JPEG XL has a truncated container box.');
      let length = view.getUint32(offset), start = offset + 8;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (length === 1) {
        if (offset + 16 > bytes.length || view.getUint32(offset + 8) !== 0) throw codecError('JXL_CONTAINER', 'JPEG XL has an invalid large container box.');
        length = view.getUint32(offset + 12);
        start += 8;
      } else if (length === 0) length = bytes.length - offset;
      if (length < start - offset || length > bytes.length - offset) throw codecError('JXL_CONTAINER', 'JPEG XL container length is invalid.');
      const end = offset + length;
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
        const take = Math.min(prefix.length - used, end - start);
        prefix.set(bytes.subarray(start, start + take), used);
        used += take;
      }
      offset = end;
    }
    if (!codestream || !complete || used < 3) throw codecError('JXL_CONTAINER', 'JPEG XL codestream is incomplete.');
    header = prefix.subarray(0, used);
    if (header[0] !== 255 || header[1] !== 10) throw codecError('JXL_SIGNATURE', 'JPEG XL codestream signature is invalid.');
  }
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
  let orientation = 1;
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
    if (read(1)) throw codecError('JXL_ANIMATION', 'Animated JPEG XL images cannot be inserted as a still image.');
  }
  return {...dimensions, orientation};
}

