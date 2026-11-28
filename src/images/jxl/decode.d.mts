// SPDX-License-Identifier: MIT
export type DecodeFormat = 'auto' | 'uint8' | 'uint16' | 'float32';
export type DecodedPixels = Uint8Array | Uint16Array | Float32Array;
export interface DecodeColorTarget {
  space: 'rgb' | 'gray' | 'xyb';
  whitePoint?: 'd65' | 'dci' | 'e' | 'd50' | [number, number];
  primaries?: 'srgb' | 'display-p3' | 'rec2020' | [[number, number], [number, number], [number, number]];
  transferFunction?: 'srgb' | 'linear' | 'bt709' | 'dci' | 'pq' | 'hlg' | 'gamma';
  /** Positive encoding exponent. Infers transferFunction: 'gamma' when that field is omitted. Conflicting transfers are rejected. */
  gamma?: number;
  renderingIntent?: 0 | 1 | 2 | 3;
}
export interface DecodeLimits {
  maxPixels: number;
  /** Each side of the image and of every frame. */
  maxDimension: number;
  maxSamples: number;
  /** Conservative budget for saved references, returned frames and the frame being rendered. */
  maxRetainedSamples: number;
  /** Budget for frame samples and canvas work. An explicit limit is checked from frame headers before rendering. */
  maxTotalSamples: number;
  /** Bound samples plus evaluated Modular tree nodes within one frame. */
  maxModularWork: number;
  maxFrames: number;
  maxBoxes: number;
  maxMetadataBytes: number;
  maxInputBytes: number;
  maxFeatureBytes: number;
  maxFeatureWork: number;
}
export const DECODE_LIMITS: Readonly<DecodeLimits>;
export interface DecodeOptions extends Partial<DecodeLimits> {
  /** Auto selects 8/16-bit integers from the source depth, or float for floating/over-16-bit input. For a canvas, pass
   * `{format: 'uint8', colorSpace: 'srgb'}`: `new ImageData(data, width, height)` takes only 8-bit data. */
  format?: DecodeFormat;
  /** Original preserves the source color meaning. Select sRGB or another SDR target for a display image: PQ and HLG
   * pictures are tone-mapped to 255 nits using ITU-R BT.2408 (PQ) or BT.2100 HLG OOTF with gamut mapping matching
   * libjxl 0.13.0. Converting HDR to another HDR transfer or XYB refuses JXL_UNSUPPORTED. */
  colorSpace?: 'original' | 'srgb' | 'linear-srgb' | 'display-p3' | 'rec2020' | 'xyb' | DecodeColorTarget;
  /** Apply all eight orientations to every output plane. Default true. */
  applyOrientation?: boolean;
  /** Unassociate RGBA RGB values when the first alpha channel is associated. Default false. Native planes are preserved. */
  unpremultiplyAlpha?: boolean;
  /** Apply signaled spot-color swatches to RGBA. Default false. Native extra channels are preserved. */
  renderSpotColors?: boolean;
  /** Also return the float32 color planes beside RGBA. Default false: planes is []. */
  planes?: boolean;
  /** Decode only this rectangle of the picture as returned (after orientation when applyOrientation): whole pixels inside
   * it. The result, every frame and its planes are the rectangle, equal to the same pixels of a whole decode. Groups outside the rectangle are skipped where the file's layout allows.
   * Some compositing features require a whole-frame decode before cropping. */
  region?: DecodeRegion;
  /** A file cut short (a download in progress) decodes to the picture at 1:8 from the LF its bytes hold, instead of being
   * refused: the result is ceil(width / 8) x ceil(height / 8) and says partial. A whole file decodes as without it.
   * Plain VarDCT frames without alpha only. Anything else cut short is refused. Not with region. Default false. */
  partial?: boolean;
  /** Decode packed raw color components instead of RGBA: 1 sample per pixel for grayscale, 3 for RGB or XYB, and 4 for
   * CMYK (C, M, Y and the black extra channel), with no RGBA buffer allocated. Extra channels such as alpha stay in
   * extraChannels. Not with unpremultiplyAlpha or renderSpotColors. Default false. */
  components?: boolean;
  /** Decode only the first displayed frame of an animation, stopping before later frames are read. Zero-duration layers
   * that build frame 0 are still composited. Default false. */
  firstFrame?: boolean;
  /** Called with each shown frame and its index, in order, as it is composited. The frame is then dropped from the result,
   * which keeps only the first, so an animation of any length decodes in the memory of a few frames. The next frame is not
   * rendered until the returned promise settles, so a slow consumer holds the decode back. A throw or rejection fails the
   * decode with that error. The frame is the decoder's own: copy it to change it. Where decode runs in place (Node, a worker,
   * an edge host). A call from a page refuses JXL_OPTIONS. Not with region or partial. */
  onFrame?: (frame: DecodedFrame, index: number) => void | PromiseLike<void>;
}
export interface DecodeRegion {x: number; y: number; width: number; height: number}
export interface DecodedBitDepth {bits: number; exponentBits: number; float: boolean}
export interface DecodedColorEncoding {
  space: string;
  spaceId?: number;
  wantICC?: boolean;
  whitePoint?: string | number[];
  primaries?: string | number[][];
  transferFunction?: string;
  gamma?: number;
  renderingIntent?: number;
  invertedCMYK?: boolean;
  iccSpace?: string | null;
  [key: string]: unknown;
}
export interface DecodedExtraChannel {
  /** JPEG XL extra-channel enum: alpha 0, depth 1, spot 2, selection 3, black 4, CFA 5, thermal 6, optional 15, nonoptional 16. */
  type: number;
  bitDepth: DecodedBitDepth;
  dimShift: number;
  name: string;
  associated: boolean;
  spotColor?: number[];
  cfaChannel?: number;
  width: number;
  height: number;
  /** Normalized full-resolution samples. Float inputs retain their floating range. */
  data: Float32Array;
}
export interface DecodedFrame {
  width: number;
  height: number;
  /** Interleaved RGBA by default, or interleaved raw components (1 gray, 3 RGB/XYB, or 4 CMYK) when components is true. Integer outputs scale normalized channels to 255 or 65535 and clip. Float output is not clipped. */
  data: DecodedPixels;
  format: Exclude<DecodeFormat, 'auto'>;
  /** Present when components is true: number of interleaved color samples per pixel (1, 3 or 4). */
  components?: 1 | 3 | 4;
  /** With planes: true, normalized color planes in the selected output space, before RGBA conversion, unassociation or spot rendering. Else []. */
  planes: Float32Array[];
  extraChannels: DecodedExtraChannel[];
  colorEncoding: DecodedColorEncoding;
  icc: Uint8Array | null;
  /** RGBA color meaning. Native XYB and non-RGB/gray ICC spaces are converted to sRGB for the RGBA array. */
  rgbaColorEncoding: DecodedColorEncoding;
  rgbaICC: Uint8Array | null;
  /** Frame duration in header.animation ticks (NOT milliseconds, multiply durationSeconds by 1000 for ms). */
  duration: number;
  /** Frame duration in seconds (duration * denominator / numerator). */
  durationSeconds: number;
  /** Unsigned 32-bit SMPTE timecode when header.animation.timecodes is true. Otherwise 0. */
  timecode: number;
  name: string;
  alphaPremultiplied: boolean;
}
export interface DecodedBox {type: string; data: Uint8Array; compressed: boolean}
export interface DecodedAnimation {numerator: number; denominator: number; loops: number; timecodes: boolean}
export interface DecodedImage extends DecodedFrame {
  frames: DecodedFrame[];
  preview: DecodedFrame | null;
  /** Original EXIF-style orientation, 1 through 8. */
  orientation: number;
  orientationApplied: boolean;
  /** The region decoded, when the options gave one. */
  region?: DecodeRegion;
  /** Present when partial decoded a cut file: the result is the picture at 1:scale. */
  partial?: {scale: 8};
  animation: DecodedAnimation | null;
  /** Metadata box payloads, decompressed when stored in brob. */
  boxes: DecodedBox[];
  /** Exif box payloads include their four-byte TIFF offset field. */
  exif: Uint8Array[];
  xmp: Uint8Array[];
  metadata: {
    width: number;
    height: number;
    bitDepth: DecodedBitDepth;
    colorEncoding: DecodedColorEncoding;
    icc?: Uint8Array;
    extraChannels: Omit<DecodedExtraChannel, 'data' | 'width' | 'height'>[];
    [key: string]: unknown;
  };
}
/** Decode a complete bare JPEG XL codestream or ISOBMFF container. Throws on malformed input or a configured resource limit. */
export function decode(bytes: Uint8Array, options?: DecodeOptions): DecodedImage;
