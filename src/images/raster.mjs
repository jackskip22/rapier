// SPDX-License-Identifier: AGPL-3.0-only
// Allocation preflight, not a second image decoder. Native decoding is mandatory.
// PNG: https://www.w3.org/TR/png-3/
// WebP: https://developers.google.com/speed/webp/docs/riff_container
// Camera metadata: https://developer.android.com/media/platform/motion-photo-format
import {JPEG_XL_LIMITS, JPEG_XL_PICTURE_LIMITS} from './header.mjs';

function fail(code = 'RASTER_HEADER', message = 'Rapier could not read this image’s dimensions.') {
  throw Object.assign(new Error(message), {code});
}

// The admission takes what the door takes: a JPEG is carried whole (the carrier's limits), any other picture's pixels
// are encoded (the core's).
function dimensions(width, height, limits = JPEG_XL_LIMITS) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail();
  if (width > limits.edge || height > limits.edge || width * height > limits.pixels) {
    fail('RASTER_DIMENSIONS', 'This image exceeds the ' + limits.pixels / 1e6 + ' megapixel or 16,384 pixel edge limit.');
  }
  return {width, height};
}

function result(type, width, height, orientation = 1) {
  dimensions(width, height, type === 'image/jpeg' ? JPEG_XL_PICTURE_LIMITS : JPEG_XL_LIMITS);
  orientation ||= 1;
  return {type, width, height, orientation, displayWidth: orientation >= 5 ? height : width, displayHeight: orientation >= 5 ? width : height};
}

function animation() {
  fail('RASTER_ANIMATION', 'Animated images cannot be inserted as a still image.');
}

function fourCC(bytes, start) {
  return String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
}

// EXIF is optional metadata. Invalid offsets, unsupported tags and duplicates must
// not reject decodable pixels. Never follow thumbnails or another metadata IFD.
function exifOrientation(bytes, start, end) {
  if (end - start >= 6 && fourCC(bytes, start) === 'Exif' && bytes[start + 4] === 0 && bytes[start + 5] === 0) start += 6;
  if (end - start < 8) return null;
  const order = String.fromCharCode(bytes[start], bytes[start + 1]);
  if (order !== 'II' && order !== 'MM') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start), little = order === 'II';
  if (view.getUint16(2, little) !== 42) return null;
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset > view.byteLength - 2) return null;
  const count = Math.min(view.getUint16(offset, little), Math.floor((view.byteLength - offset - 2) / 12));
  for (let i = 0, position = offset + 2; i < count; i++, position += 12) {
    if (view.getUint16(position, little) !== 0x0112 || view.getUint16(position + 2, little) !== 3 ||
        view.getUint32(position + 4, little) !== 1) continue;
    const orientation = view.getUint16(position + 8, little);
    if (orientation >= 1 && orientation <= 8) return orientation;
  }
  return null;
}

function png(bytes, view) {
  if (bytes.length < 24 || view.getUint32(8) !== 13 || fourCC(bytes, 12) !== 'IHDR') fail();
  const {width, height} = dimensions(view.getUint32(16), view.getUint32(20));
  let orientation = null;
  // Skip compressed bytes by chunk length. CRC, palettes, chunk-name bits and
  // optional metadata belong to the native decoder, not admission policy.
  for (let position = 33; position + 8 <= bytes.length;) {
    const length = view.getUint32(position), type = fourCC(bytes, position + 4), start = position + 8, end = start + length;
    if (type === 'IEND') break;
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') animation();
    if (end + 4 > bytes.length) break;
    if (type === 'eXIf' && orientation == null) orientation = exifOrientation(bytes, start, end);
    position = end + 4;
  }
  return result('image/png', width, height, orientation);
}

function jpeg(bytes, view) {
  let position = 2, width, height, orientation = null, auxiliaryPictures = false, cameraMotion = false;
  while (position + 1 < bytes.length) {
    if (bytes[position] !== 255) break;
    while (bytes[position] === 255) position++;
    const marker = bytes[position++];
    // Pixel decoding, scan structure and EOI/trailing data are the browser's job.
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0 || marker === 0xd8) break;
    if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (position + 2 > bytes.length) break;
    const length = view.getUint16(position), start = position + 2, end = position + length;
    if (length < 2 || end > bytes.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && start + 5 <= end) {
      const frame = dimensions(view.getUint16(start + 3), view.getUint16(start + 1), JPEG_XL_PICTURE_LIMITS);
      width ??= frame.width; height ??= frame.height;
    } else if (marker === 0xe1) {
      if (end - start >= 6 && fourCC(bytes, start) === 'Exif' && bytes[start + 4] === 0 && bytes[start + 5] === 0) {
        orientation ??= exifOrientation(bytes, start, end);
      } else {
        const metadata = new TextDecoder().decode(bytes.subarray(start, end));
        // A declaration is only a UI hint: edited copies can retain this metadata
        // after their video has been stripped. It is never an animation rejection.
        if (metadata.includes('http://ns.google.com/photos/1.0/camera/') &&
            /(?:\bMotionPhoto\s*=\s*["']1["']|:MotionPhoto\s*>\s*1\s*<)/.test(metadata)) cameraMotion = true;
      }
    } else if (marker === 0xe2 && end - start >= 4 && fourCC(bytes, start) === 'MPF\0') auxiliaryPictures = true;
    position = end;
  }
  return {...result('image/jpeg', width, height, orientation), auxiliaryPictures, cameraMotion};
}

function webp(bytes, view) {
  if (bytes.length < 20) fail();
  // RIFF explicitly allows readers to ignore bytes after the declared container.
  const limit = Math.min(bytes.length, view.getUint32(4, true) + 8);
  let width, height, canvasWidth, canvasHeight, orientation = null;
  const uint24 = offset => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
  for (let position = 12; position + 8 <= limit;) {
    const type = fourCC(bytes, position), length = view.getUint32(position + 4, true), start = position + 8, end = start + length;
    const available = Math.min(end, limit) - start;
    if (type === 'VP8X' && available >= 10) {
      if (bytes[start] & 2) animation();
      const canvas = dimensions(1 + uint24(start + 4), 1 + uint24(start + 7));
      canvasWidth ??= canvas.width; canvasHeight ??= canvas.height;
    } else if (type === 'VP8 ' && available >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 1 && bytes[start + 5] === 0x2a) {
      const frame = dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      width ??= frame.width; height ??= frame.height;
    } else if (type === 'VP8L' && available >= 5 && bytes[start] === 0x2f) {
      const packed = view.getUint32(start + 1, true), frame = dimensions(1 + (packed & 0x3fff), 1 + (packed >>> 14 & 0x3fff));
      width ??= frame.width; height ??= frame.height;
    } else if (type === 'EXIF' && end <= limit && orientation == null) {
      orientation = exifOrientation(bytes, start, end);
    }
    if (end > limit) break;
    position = end + (length & 1);
  }
  return result('image/webp', canvasWidth ?? width, canvasHeight ?? height, orientation);
}

// Encoded dimensions bound the input before native decode; decoded dimensions
// are checked again by the caller before canvas allocation or JPEG XL encoding.
export function inspectRaster(input, {maximumBytes = JPEG_XL_LIMITS.bytes} = {}) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
    input instanceof Uint8Array || input instanceof Uint8ClampedArray ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes) fail('RASTER_INPUT', 'Image input must be bytes.');
  if (!bytes.length || bytes.length > maximumBytes) fail('RASTER_SIZE', 'This image is empty or exceeds 16 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return png(bytes, view);
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 0xd8) return jpeg(bytes, view);
  if (bytes.length >= 12 && fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') return webp(bytes, view);
  fail('RASTER_SIGNATURE', 'Choose a PNG, JPEG or WebP image.');
}
