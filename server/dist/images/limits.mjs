// SPDX-License-Identifier: AGPL-3.0-only
export const JPEG_XL_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, pixels: 40_000_000, edge: 16384});
export const JPEG_XL_PICTURE_LIMITS = Object.freeze({bytes: 16 * 1024 * 1024, pixels: 64_000_000, edge: 16384});
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
