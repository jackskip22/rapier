// SPDX-License-Identifier: MIT
export const PICTURE_BYTES = 16 * 1024 * 1024;
export const PICTURE_EDGE = 16384;
export const ASSET_PIXELS = 24_000_000;
export const PLAYBACK_PIXELS = 24_000_000;
export const JPEG_XL_ENCODE_PIXELS = 40_000_000;
export const KEPT_JPEG_PIXELS = 64_000_000;
export const PICTURE_BASE64_URL_CHARS = Math.ceil(PICTURE_BYTES / 3) * 4 + 96;
export const PICTURE_PERCENT_URL_CHARS = PICTURE_BYTES * 3 + 19;
export const PICTURE_LIMITS = Object.freeze({
  bytes: PICTURE_BYTES,
  edge: PICTURE_EDGE,
  assetPixels: ASSET_PIXELS,
  playbackPixels: PLAYBACK_PIXELS,
  jpegXlEncodePixels: JPEG_XL_ENCODE_PIXELS,
  keptJpegPixels: KEPT_JPEG_PIXELS,
  base64UrlChars: PICTURE_BASE64_URL_CHARS,
  percentUrlChars: PICTURE_PERCENT_URL_CHARS,
});
export const JPEG_XL_LIMITS = Object.freeze({bytes: PICTURE_BYTES, pixels: JPEG_XL_ENCODE_PIXELS, edge: PICTURE_EDGE});
export const JPEG_XL_PICTURE_LIMITS = Object.freeze({bytes: PICTURE_BYTES, pixels: KEPT_JPEG_PIXELS, edge: PICTURE_EDGE});
export function codecError(code, message) {
  return Object.assign(new Error(message), {code});
}
export function byteView(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw codecError('JXL_INPUT', 'JPEG XL input must be bytes.');
}
export function boundedDimensions(width, height, limits = JPEG_XL_LIMITS) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > limits.edge || height > limits.edge || width * height > limits.pixels)
    throw codecError('JXL_DIMENSIONS', 'This image exceeds the ' + limits.pixels / 1e6 + ' megapixel image limit.');
  return {width, height};
}
