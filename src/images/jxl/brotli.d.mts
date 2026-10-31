// SPDX-License-Identifier: MIT
import type {Bytes} from './index.mjs';
export interface BrotliOptions {
  /** Optional nonnegative safe-integer output budget, checked before decoder output allocation. 64 MiB (67108864) by
   * default; beyond it decoding is refused with JXL_SIZE. */
  maxOutputLength?: number;
}
export interface BrotliDecodeOptions extends BrotliOptions {
  /** Positive safe-integer limit on Brotli meta-blocks, including empty metadata blocks and
   * the terminating block. Default 65,536; exceeding it is refused with JXL_SIZE. */
  maxBlocks?: number;
}
/** Deterministic RFC 7932 LZ77/prefix compression without a static dictionary or native dependencies.
 * Input uses available memory; incompressible input uses stored blocks. Returns an owned buffer. */
export function compressBrotli(bytes: Uint8Array, options?: BrotliOptions): Bytes;
/** Bounded reader for stored blocks and the authored single-tree prefix/LZ77 subset. Other coding forms,
 * context maps, direct/postfix distances and dictionary references require a full external decoder.
 * This entry deliberately does not claim to decode all third-party Brotli streams. */
export function decompressBrotli(bytes: Uint8Array, options?: BrotliDecodeOptions): Bytes;
