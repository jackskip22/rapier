import {encode, configure, close} from 'rapier-jxl/upload';
import {edit} from 'rapier-jxl/metadata';

const STILL = /^image\/(jpeg|png|webp|heic|heif)$/;

export function shrinker({helpers = true, maxPixels, ...preset} = {}) {
  let configured = false;
  const encoder = () => {
    if (!configured) { configure({...(helpers !== false && {helpers}), ...(maxPixels !== undefined && {maxPixels})}); configured = true; }
    return {encode};
  };
  async function shrink(file, options = {}) {
    const {fidelity = {quality: 70}, effort = 3, retainExif = false, signal, onProgress} = {...preset, ...options};
    try {
      if (!STILL.test(file.type)) return {file, result: null, code: 'type'};
      if (await animated(file)) return {file, result: null, code: 'animated'};
      const result = await encoder().encode(file, {fidelity, effort, signal, onProgress});
      if (!result.bytes) return {file, result, code: result.reason?.code ?? 'larger'};
      let bytes = result.bytes;
      if (retainExif && file.type === 'image/jpeg') {
        const exif = await jpegExif(file);
        if (exif) bytes = await edit(bytes, {exif});
      }
      if (bytes.length >= file.size) return {file, result, code: 'larger'};
      const name = file.name.replace(/\.[^.]*$/, '') + '.jxl';
      return {file: new File([bytes], name, {type: 'image/jxl', lastModified: file.lastModified}), result, code: null};
    } catch (error) {
      return {file, result: null, code: error?.name === 'AbortError' ? 'AbortError' : error?.code ?? 'error'};
    }
  }
  return {shrink, close: () => { configured = false; return close(); }};
}

async function animated(file) {
  if (file.type !== 'image/png' && file.type !== 'image/webp') return false;
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  if (file.type === 'image/webp') return text(head, 12, 4) === 'VP8X' && (head[20] & 2) !== 0;
  for (let at = 8; at + 8 <= head.length;) {
    const type = text(head, at + 4, 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
    at += 12 + (head[at] << 24 >>> 0) + (head[at + 1] << 16) + (head[at + 2] << 8) + head[at + 3];
  }
  return false;
}

async function jpegExif(file) {
  const head = new Uint8Array(await file.slice(0, 1 << 17).arrayBuffer());
  for (let at = 2; at + 4 <= head.length && head[at] === 0xff;) {
    if (head[at + 1] === 0xff) { at++; continue; }
    const marker = head[at + 1], end = at + 2 + (head[at + 2] << 8 | head[at + 3]);
    if (marker === 0xda || end > head.length) return null;
    if (marker === 0xe1 && text(head, at + 4, 6) === 'Exif\0\0') return upright(head.slice(at + 10, end));
    at = end;
  }
  return null;
}

function upright(tiff) {
  if (tiff.length < 8) return null;
  const view = new DataView(tiff.buffer), little = tiff[0] === 0x49, ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return tiff;
  for (let i = 0, count = view.getUint16(ifd, little); i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint16(entry + 2, little) === 4) view.setUint32(entry + 8, 1, little);
    else view.setUint16(entry + 8, 1, little);
  }
  return tiff;
}

const text = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
