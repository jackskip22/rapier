// SPDX-License-Identifier: MIT
import type {Bytes, Limits} from './index.mjs';
export const LIMITS: Limits;
export interface CaptureOptions {
  /** Aborts the returned promise. A reply that arrives after the abort is ignored. */
  signal?: AbortSignal | undefined;
  /** false encodes on this thread. A Worker encodes there. The default is a module worker on a document, and this thread elsewhere. */
  worker?: Worker | false | undefined;
  /** Each RGB sample may move by at most this many 8-bit levels, integer 0–8. Default 0 keeps every sample.
   * Regions with few colors (text, icons, flat UI) and alpha stay exact. */
  maxError?: number | undefined;
}
/** JPEG XL for a screen capture. Exact unless maxError is set.
 * The caller's pixels are left unchanged. */
export function encodeCapture(data: Uint8Array | Uint8ClampedArray, width: number, height: number, options?: CaptureOptions): Promise<Bytes>;
