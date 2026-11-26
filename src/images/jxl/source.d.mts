// SPDX-License-Identifier: MIT
import type {ColorSpace, SampleFormat, TransferFunction} from './index.mjs';
import type {ColorEncoding} from './icc.mjs';

/** Original RGBA words and encoding options. Floating-point words retain signed zero, subnormals and IEEE payloads.
 * PNG alpha is straight. OpenEXR alpha is associated. */
export interface SourceImage {
  data: Uint16Array | Float32Array;
  width: number;
  height: number;
  bitDepth: 16 | 32;
  sampleFormat: SampleFormat;
  /** Present for enumerated source colors. ICC or custom declarations instead use the fields below. */
  colorSpace?: ColorSpace | undefined;
  transferFunction?: TransferFunction | undefined;
  /** Original PNG iCCP bytes. Pass the source options to encodeProfile from rapier-jxl/icc. */
  icc?: Uint8Array | undefined;
  /** Custom PNG cHRM/gAMA, extended cICP, or an explicit sRGB rendering intent. Pass to encodeProfile. */
  colorEncoding?: ColorEncoding | undefined;
  alphaPremultiplied: boolean;
  intensityTarget?: number | undefined;
}

/** Decode PNG (16-bit, 8-bit or less, including Adam7). OpenEXR and Radiance are `rapier-jxl/hdr`'s.
 * PNG supports grayscale/RGB with optional alpha, cICP, exact RGB/GRAY iCCP profiles, sRGB rendering intent,
 * custom cHRM and gAMA exponents representable by JPEG XL (1/8192 through 1). Color precedence is cICP, iCCP,
 * sRGB, then cHRM/gAMA. Untagged PNG assumes sRGB. Profile decompression must exactly match its declared ICC
 * extent, and the complete profile must fit available memory.
 * Compressed input uses DecompressionStream. Errors use the encoder's public codes. */
export function readSource(bytes: Uint8Array | ArrayBuffer): Promise<SourceImage>;
