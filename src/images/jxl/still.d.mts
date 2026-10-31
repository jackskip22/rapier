// SPDX-License-Identifier: MIT
import type {Bytes, Pixels, Limits} from './index.mjs';
import type {Transcoded} from './jpeg.mjs';
import type {Failure, Image, ImageSource, Options, PictureOptions, ProgressOptions, TranscodeOptions, WorkerOptions} from './rapier.mjs';
import type {FormatRequest, FormatResult} from './format-worker.mjs';
import type {ScoreOptions, ScoreResult} from './score.mjs';
export type {Bytes, Pixels, Limits, Transcoded, Failure, Image, ImageSource, Options, PictureOptions, ProgressOptions, TranscodeOptions, WorkerOptions, FormatRequest, FormatResult, ScoreOptions, ScoreResult};
export type {KernelMode, KernelParts} from './kernels.mjs';
export {configureKernels, kernelMode} from './kernels.mjs';

export const LIMITS: Limits;
export const JPEG_LIMITS: Limits;

/** In a worker or in Node. On a document thread, call `encode` instead. Animation is not available; use `rapier-jxl/rapier`. */
export interface StillCodec {
  encode(image: Image, options?: Options): Promise<Bytes>;
  transcode(input: {bytes: Uint8Array | Uint8ClampedArray | ArrayBuffer}, options?: TranscodeOptions): Promise<Transcoded>;
  image(input: {source: ImageSource}, options?: PictureOptions): Promise<Transcoded | {bytes: Bytes}>;
  reconstruct(input: {bytes: Uint8Array | Uint8ClampedArray | ArrayBuffer}): Promise<Bytes | null>;
  format(input: FormatRequest, options?: ProgressOptions): Promise<FormatResult>;
  failure(error: unknown): Failure;
}

/**
 * Still-image encode. Quality defaults to 90, effort to 7, photographic coding on.
 * `lossless: true` forces quality 100. Effort 1–9. Effort 8–9 is the measured high-quality photograph.
 * `gpu: false` stays on the CPU; a `GPUDevice` uses WebGPU. No JPEG XL pixel decoder.
 */
export function encode(data: Pixels, width: number, height: number, options?: Options & {gpu?: boolean | object | undefined}): Promise<Bytes>;
/** JPEG transcode. Effort defaults to 7 inside the still encoder. */
export function transcode(jpeg: Uint8Array, options?: TranscodeOptions): Promise<Transcoded>;
/** Original JPEG bytes, or null when this file has no reconstruction data. */
export function reconstruct(bytes: Uint8Array): Bytes | null;
/** High-quality search: the smallest file whose measured picture meets the target. */
export function encodeToScore(data: Uint8Array | Uint8ClampedArray, width: number, height: number, options: ScoreOptions): Promise<ScoreResult>;
export function createEncoder(options?: WorkerOptions): StillCodec;
/** Install the worker protocol on this realm. One call at a time. */
export function installWorker(options?: WorkerOptions): void;
