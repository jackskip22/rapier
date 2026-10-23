// SPDX-License-Identifier: AGPL-3.0-only
import {_rapierDrawReadRecipeFromSVGText} from '../draw/core.mjs';
import {inspectRaster} from './raster.mjs';

export async function readOpenRasterMembers(archive, work) {
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  if (text.decode(await archive.read('mimetype')) !== 'image/openraster')
    throw new Error('Invalid OpenRaster file');
  let result;
  if (archive.has('drawing.svg')) {
    const bytes = await archive.read('drawing.svg'), svg = text.decode(bytes);
    if (!_rapierDrawReadRecipeFromSVGText(svg)) throw new Error('The editable drawing could not be read.');
    result = {bytes, codec: 'image/svg+xml', editable: true};
  } else {
    const bytes = await archive.read('mergedimage.png');
    if (inspectRaster(bytes).type !== 'image/png') throw new Error('Invalid OpenRaster picture');
    result = {bytes, codec: 'image/png', editable: false};
  }
  await archive.verify();
  work.check();
  return result;
}
