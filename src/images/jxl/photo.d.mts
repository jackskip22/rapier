// SPDX-License-Identifier: MIT
import type {Pixels, Bytes, EncodeOptions, Job, Limits} from './index.mjs';
export type {Pixels, Bytes, ColorSpace, SampleFormat, TransferFunction, Limits, EncodeOptions, ErrorCode, EncoderError, Job} from './index.mjs';
/** Limits: 268,435,456 pixels and 65,535 pixels per side. Output uses available memory. */
export const LIMITS: Limits;
export interface PhotoOptions extends Omit<EncodeOptions, 'photo'> {
  /** Integer from 1 to 9. Default 1. Higher efforts search for smaller photographic streams. */
  effort?: number | undefined;
}
/** Encode photographs with exact alpha. Quality defaults to 90. 100 preserves all samples.
 * Lossy eight-bit photos use photographic coding with effort-dependent block and quality search.
 * Native precision and HDR use Modular coding with source-domain quantization. Input limits do not
 * depend on effort. */
export function encodePhoto(data: Pixels, width: number, height: number, options?: PhotoOptions): Bytes;
/** Incremental encodePhoto with immediate input validation. */
export function encodePhotoSteps(data: Pixels, width: number, height: number, options?: PhotoOptions): Job;
