// SPDX-License-Identifier: AGPL-3.0-only
import {inspectRaster} from '../images/raster.mjs';
export function rtfPictures(value) {
  const source = String(value || '');
  if (source.length > 32 * 1024 * 1024 || !/^\{\\rtf\d/.test(source)) return [];
  const pictures = [], stack = [], blocked = [];
  let picture = null;
  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (char === '{') { if (stack.length >= 128) return []; stack.push(at); blocked.push(blocked.at(-1) || false); continue; }
    if (char === '}') {
      if (picture?.depth === stack.length) {
        if (picture.type && picture.hex.length && !(picture.hex.length % 2)) {
          const bytes = new Uint8Array(picture.hex.length / 2);
          for (let n = 0; n < bytes.length; n++) bytes[n] = parseInt(picture.hex.slice(n * 2, n * 2 + 2), 16);
          try {
            const info = inspectRaster(bytes);
            if (info.type === picture.type) pictures.push({bytes, type: info.type});
          } catch (_) {  }
        }
        picture = null;
        if (pictures.length >= 64) break;
      }
      stack.pop(); blocked.pop(); continue;
    }
    if (char === '\\') {
      const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(source.slice(at, at + 80));
      if (!match) { at++; continue; }
      at += match[0].length - 1;
      const word = match[1].toLowerCase(), number = Number(match[2]);
      if (['object', 'objdata', 'fldinst', 'datastore'].includes(word)) blocked[blocked.length - 1] = true;
      if (word === 'pict' && !blocked.at(-1)) picture = {depth: stack.length, type: null, hex: ''};
      if (picture && picture.depth === stack.length) {
        if (word === 'pngblip') picture.type = 'image/png';
        if (word === 'jpegblip') picture.type = 'image/jpeg';
      }
      if (word === 'bin') {
        if (!Number.isSafeInteger(number) || number < 0 || at + number >= source.length) return [];
        if (picture) picture.type = null;
        at += number;
      }
      continue;
    }
    if (picture?.type && picture.depth === stack.length && /[\da-f]/i.test(char)) picture.hex += char;
  }
  return pictures;
}
