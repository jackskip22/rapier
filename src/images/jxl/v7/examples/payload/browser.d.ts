// SPDX-License-Identifier: MIT
export interface PrepareUploadOptions {
  /** Upload encoding effort from 1 (fastest) to 3. */
  effort?: 1 | 2 | 3;
  /** Encoder fidelity for non-JPEG formats. JPEGs always recompress losslessly. */
  fidelity?: 'exact' | {quality: number};
  /** Keep the original file when the JPEG XL output is not smaller. Defaults to true. */
  keepSmaller?: boolean;
}

export interface PreparedUploadFile {
  /** Primary file to append as `file`: the .jxl for converted JPEGs, or the original file for non-JPEGs and skipped files. */
  file: File;
  /** Browser-encoded .jxl companion for converted non-JPEG rasters, or null for JPEGs and skipped files. */
  jxlFile: File | null;
  /** Always the original File passed to prepareUploadFile. */
  originalFile: File;
  converted: boolean;
  kept: boolean;
  originalFilesize: number;
  filesize: number;
}

/**
 * Encodes a supported raster File to JPEG XL in the editor's browser before upload to Payload + R2.
 * JPEGs recompress losslessly into `file` so the Worker restores the exact JPEG in pure JS for non-JXL clients.
 * Non-JPEG rasters (PNG, WebP, GIF, AVIF, BMP) keep the original in `file` and place the encoded .jxl in `jxlFile`
 * so Payload 4.0 stores both and serves the original to browsers without JPEG XL.
 */
export declare function prepareUploadFile(
  file: File,
  options?: PrepareUploadOptions,
): Promise<PreparedUploadFile>;

/** Appends `prepared.file` as `file` and, for converted non-JPEGs, `prepared.jxlFile` as `jxl` onto a FormData instance. */
export declare function appendPreparedUpload(
  formData: FormData,
  prepared: PreparedUploadFile,
): FormData;

export default prepareUploadFile;
