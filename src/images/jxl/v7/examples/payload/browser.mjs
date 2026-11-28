// SPDX-License-Identifier: MIT
import {encode} from 'rapier-jxl/upload';
import {recompress} from 'rapier-jxl/jpeg';

const JPEG_MIME = /^image\/jpe?g$/i;
const RASTER_MIME = /^image\/(jpe?g|png|webp|gif|avif|bmp)$/i;
const ALLOWED_OPTIONS = new Set(['effort', 'fidelity', 'keepSmaller']);

const fail = (code, message) => Object.assign(new Error(message), {code});
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function isJxlBytes(bytes) {
  if (!bytes || bytes.length < 2) return false;
  if (bytes[0] === 0xff && bytes[1] === 0x0a) return true;
  return bytes.length >= 12 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x0c &&
    bytes[4] === 0x4a && bytes[5] === 0x58 && bytes[6] === 0x4c && bytes[7] === 0x20;
}

function isJpeg(bytes, mimeType) {
  if (bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  return typeof mimeType === 'string' && JPEG_MIME.test(mimeType.trim());
}

function isRaster(bytes, mimeType) {
  if (!bytes || bytes.length < 4 || isJxlBytes(bytes)) return false;
  if (typeof mimeType === 'string' && mimeType) {
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    if (clean === 'image/svg+xml' || clean === 'image/jxl' || clean.includes('xml')) return false;
    if (RASTER_MIME.test(clean)) return true;
    if (!clean.startsWith('image/') && clean !== 'application/octet-stream') return false;
  }
  return isJpeg(bytes, mimeType) ||
    (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) ||
    (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38);
}

function jxlName(name) {
  if (typeof name !== 'string' || !name) return 'upload.jxl';
  if (/\.jxl$/i.test(name)) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}.jxl` : `${name}.jxl`;
}

export async function prepareUploadFile(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw fail('JXL_INPUT', 'prepareUploadFile requires a File or Blob');
  }
  if (!plain(options)) throw fail('JXL_OPTIONS', 'prepareUploadFile options must be an object');
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTIONS.has(key)) throw fail('JXL_OPTIONS', `Unknown prepareUploadFile option: ${key}`);
  }
  if (options.effort !== undefined && (!Number.isInteger(options.effort) || options.effort < 1 || options.effort > 3)) {
    throw fail('JXL_OPTIONS', 'effort must be an integer from 1 to 3');
  }
  if (options.keepSmaller !== undefined && typeof options.keepSmaller !== 'boolean') {
    throw fail('JXL_OPTIONS', 'keepSmaller must be a boolean');
  }

  const originalFilesize = Number.isFinite(file.size) ? file.size : 0;
  const mimeType = typeof file.type === 'string' ? file.type : '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const untouched = {
    file,
    jxlFile: null,
    originalFile: file,
    converted: false,
    kept: true,
    originalFilesize: bytes.byteLength || originalFilesize,
    filesize: bytes.byteLength || originalFilesize,
  };
  if (!isRaster(bytes, mimeType) || (typeof file.name === 'string' && /\.jxl$/i.test(file.name))) {
    return untouched;
  }

  const sourceIsJpeg = isJpeg(bytes, mimeType);
  let encoded;
  if (sourceIsJpeg) {
    encoded = await recompress(bytes, options.effort !== undefined ? {effort: options.effort} : {});
  } else {
    const opts = {
      ...(options.effort !== undefined ? {effort: options.effort} : {}),
      ...(options.fidelity !== undefined ? {fidelity: options.fidelity} : {}),
    };
    encoded = await encode(file, opts);
  }

  const outBytes = encoded.bytes;
  if (options.keepSmaller !== false && outBytes.byteLength >= bytes.byteLength) {
    return untouched;
  }

  const outFile = new File([outBytes], jxlName(file.name), {
    type: 'image/jxl',
    lastModified: typeof file.lastModified === 'number' ? file.lastModified : Date.now(),
  });
  if (sourceIsJpeg) {
    return {
      file: outFile,
      jxlFile: null,
      originalFile: file,
      converted: true,
      kept: false,
      originalFilesize: bytes.byteLength,
      filesize: outBytes.byteLength,
    };
  }
  return {
    file,
    jxlFile: outFile,
    originalFile: file,
    converted: true,
    kept: false,
    originalFilesize: bytes.byteLength,
    filesize: outBytes.byteLength,
  };
}

export function appendPreparedUpload(formData, prepared) {
  if (!formData || typeof formData.append !== 'function') {
    throw fail('JXL_INPUT', 'appendPreparedUpload requires a FormData instance');
  }
  if (!plain(prepared) || !prepared.file) {
    throw fail('JXL_INPUT', 'appendPreparedUpload requires a result from prepareUploadFile');
  }
  formData.append('file', prepared.file);
  if (prepared.jxlFile) {
    formData.append('jxl', prepared.jxlFile);
  }
  return formData;
}

export default prepareUploadFile;
