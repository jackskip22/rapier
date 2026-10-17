// SPDX-License-Identifier: AGPL-3.0-only
import {JPEG_XL_LIMITS, JPEG_XL_PICTURE_LIMITS} from './header.mjs';
import {inspectGIF} from './gif.mjs';

function fail(code = 'RASTER_HEADER', message = 'Rapier could not read this image’s dimensions.') {
  throw Object.assign(new Error(message), {code});
}

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

function exifOrientation(bytes, start, end) {
  if (end - start >= 6 && fourCC(bytes, start) === 'Exif' && bytes[start + 4] === 0) start += 6;
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
      if (end - start >= 6 && fourCC(bytes, start) === 'Exif' && bytes[start + 4] === 0) {
        orientation ??= exifOrientation(bytes, start, end);
      } else {
        const metadata = new TextDecoder().decode(bytes.subarray(start, end));
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

const HEIF_TYPES = {avif: 'image/avif', heic: 'image/heic', heix: 'image/heic', heim: 'image/heic', heis: 'image/heic'};
export function inspectHEIF(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length > JPEG_XL_LIMITS.bytes) fail('RASTER_SIZE', 'This image is empty or exceeds 16 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const children = (start, end) => {
    const out = [];
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at), header = 8;
      if (size === 1) { if (at + 16 > end || view.getUint32(at + 8)) fail(); size = view.getUint32(at + 12); header = 16; }
      else if (size === 0) size = end - at;
      if (size < header || at + size > end) fail();
      out.push({type: fourCC(bytes, at + 4), start: at + header, end: at + size});
      at += size;
    }
    return out;
  };
  const top = children(0, bytes.length), ftyp = top[0];
  if (ftyp?.type !== 'ftyp' || ftyp.end - ftyp.start < 8) fail('RASTER_SIGNATURE', 'Choose a PNG, JPEG, WebP, GIF, AVIF or HEIC image.');
  const brands = [fourCC(bytes, ftyp.start)];
  for (let at = ftyp.start + 8; at + 4 <= ftyp.end; at += 4) brands.push(fourCC(bytes, at));
  if (brands[0] === 'avis' || brands[0] === 'msf1') animation();
  const type = brands.map(brand => HEIF_TYPES[brand]).find(Boolean);
  if (!type) fail('RASTER_SIGNATURE', 'Choose a PNG, JPEG, WebP, GIF, AVIF or HEIC image.');
  const meta = top.find(box => box.type === 'meta');
  if (!meta) fail();
  const inMeta = children(meta.start + 4, meta.end), find = name => inMeta.find(box => box.type === name);
  const pitm = find('pitm'), iprp = find('iprp');
  if (!pitm || !iprp) fail();
  const primary = bytes[pitm.start] ? view.getUint32(pitm.start + 4) : view.getUint16(pitm.start + 4);
  const inProperties = children(iprp.start, iprp.end), ipco = inProperties.find(box => box.type === 'ipco');
  if (!ipco) fail();
  const properties = children(ipco.start, ipco.end);
  let width, height, angle = 0;
  for (const ipma of inProperties.filter(box => box.type === 'ipma')) {
    const version = bytes[ipma.start], wide = bytes[ipma.start + 3] & 1;
    let at = ipma.start + 8;
    for (let entries = view.getUint32(ipma.start + 4); entries-- > 0 && at < ipma.end;) {
      const item = version < 1 ? view.getUint16(at) : view.getUint32(at); at += version < 1 ? 2 : 4;
      const count = bytes[at++];
      for (let i = 0; i < count; i++, at += wide ? 2 : 1) {
        if (item !== primary) continue;
        const property = properties[(wide ? view.getUint16(at) & 0x7fff : bytes[at] & 0x7f) - 1];
        if (property?.type === 'ispe' && property.end - property.start >= 12) { width = view.getUint32(property.start + 4); height = view.getUint32(property.start + 8); }
        else if (property?.type === 'irot' && property.end > property.start) angle = bytes[property.start] & 3;
      }
    }
  }
  return result(type, width, height, [1, 8, 3, 6][angle]);
}

export function inspectRaster(input, {maximumBytes = JPEG_XL_LIMITS.bytes} = {}) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
    input instanceof Uint8Array || input instanceof Uint8ClampedArray ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes) fail('RASTER_INPUT', 'Image input must be bytes.');
  if (!bytes.length || bytes.length > maximumBytes) fail('RASTER_SIZE', 'This image is empty or exceeds 16 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 6 && fourCC(bytes, 0) === 'GIF8') return inspectGIF(bytes);
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return png(bytes, view);
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 0xd8) return jpeg(bytes, view);
  if (bytes.length >= 12 && fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') return webp(bytes, view);
  fail('RASTER_SIGNATURE', 'Choose a PNG, JPEG, WebP or GIF image.');
}
