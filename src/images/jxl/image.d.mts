// SPDX-License-Identifier: MIT
export type ImageSource = Blob | ImageBitmap | ImageData | OffscreenCanvas | HTMLCanvasElement | HTMLImageElement;
export interface ImageOptions {
  /** A Worker running capture-worker.mjs (lossless only), rapier-still-worker.js or rapier-worker.js,
   * or a file URL (a new worker for that call).
   * Calls sharing one `Worker` run one after another. Required. */
  worker: Worker | string | URL;
  /** 1 to 99 is lossy; omitted or 100 is lossless. Does not apply to a carried JPEG. */
  quality?: number | undefined;
  /** 1 to 9; defaults to 7 in the still/complete workers. */
  effort?: number | undefined;
  /** Set false to decode a JPEG and encode its pixels instead of carrying its coefficients. */
  transcode?: boolean | undefined;
  /** Disable the worker's helper pool when a host already owns the upload queue. */
  parallel?: boolean | undefined;
  /** false keeps CPU encoding; automatic GPU selection skips software adapters. */
  gpu?: boolean | undefined;
  /** Reject immediately on abort. A shared worker finishes cancellation before starting its next call. */
  signal?: AbortSignal | undefined;
  /** Completed work from 0 to 1. */
  progress?: ((fraction: number) => void) | undefined;
}
/** A picture to a Blob of type image/jxl. JPEG files are carried losslessly by default.
 * A shared worker prepares and encodes one source at a time. Keep mutable sources unchanged until their call completes.
 * Caller-owned bitmaps and ImageData remain usable; a URL-owned worker is terminated after completion or abort. */
export function toJXL(source: ImageSource, options: ImageOptions): Promise<Blob>;

export const CONTRACT_VERSION: 1;
export interface EncoderOptions {
  /** A worker URL, or a factory that creates a private Worker. */
  worker: string | URL | (() => Worker);
  /** Images that may wait behind the active one. Default 2. */
  maxQueue?: number | undefined;
  /** Default 24 million pixels. */
  maxPixels?: number | undefined;
  /** Milliseconds to wait for the worker's version handshake. Default 15000. */
  startupTimeout?: number | undefined;
}
export interface EncodeOptions extends Omit<ImageOptions, 'worker'> {
  signal?: AbortSignal | undefined;
  /** Progress from 0 to 1, never decreasing. */
  onProgress?: ((fraction: number) => void) | undefined;
  /** At most the encoder's own `maxPixels`. */
  maxPixels?: number | undefined;
  /** The capture worker only: each RGB sample may move by at most this many 8-bit levels, 0–8; few-color regions and alpha stay exact. Default 0 keeps every sample. */
  maxError?: number | undefined;
}
export type PixelSource = {data: Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array; width: number; height: number; colorSpace?: string | undefined};
export interface ImageEncoder {
  /** One active image. Further calls wait. Inputs are copied, never detached. */
  encode(source: ImageSource | PixelSource, options?: EncodeOptions): Promise<Uint8Array>;
  close(): void;
}
/** Reusable page client over rapier-still-worker.js, rapier-worker.js or capture-worker.mjs (RGBA8 only). Before the first
 * image it asks the worker for its contract version, which must be `CONTRACT_VERSION`. */
export function createEncoder(options: EncoderOptions): ImageEncoder;
/** Wait for previously queued toJXL calls, including cancellation acknowledgements. Does not terminate the worker. */
export function whenIdle(worker: Worker): Promise<void>;
