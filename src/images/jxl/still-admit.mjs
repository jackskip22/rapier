// SPDX-License-Identifier: MIT
import {codecError, byteView, boundedDimensions} from './worker-input.mjs';
import {BALANCED_EFFORT} from './effort-level.mjs';

const PRESETS = {web: [85, 3, true], photo: [90, BALANCED_EFFORT, true], archive: [100, 9, false], screen: [100, 5, false], lossless: [100, 3, false]};

export function admitStill(options, image) {
  if (options === undefined) options = {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw codecError('JXL_OPTIONS', 'JPEG XL options are invalid.');
  if (options.preset !== undefined && (typeof options.preset !== 'string' || !Object.hasOwn(PRESETS, options.preset)))
    throw codecError('JXL_OPTIONS', 'JPEG XL preset must be web, photo, archive, screen or lossless.');
  const preset = PRESETS[options.preset] || [90, BALANCED_EFFORT, true];
  const quality = options.lossless === true ? 100 : options.quality ?? preset[0], effort = options.effort ?? preset[1];
  if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 1 || quality > 100 || !Number.isInteger(effort) || effort < 1 || effort > 9)
    throw codecError('JXL_OPTIONS', 'JPEG XL quality must be 1–100 and effort 1–9.');
  const photo = (options.photo ?? preset[2]) === true;
  const admitted = {quality, effort, photo, options: {...options, quality, effort, photo}};
  if (image === undefined) return admitted;
  const {width, height} = boundedDimensions(image.width, image.height);
  const data = image.data instanceof Uint16Array || image.data instanceof Float32Array ? image.data : byteView(image.data);
  if (data.length !== width * height * 4) throw codecError('JXL_RGBA', 'JPEG XL encoding requires one RGBA value per pixel.');
  return {...admitted, data, width, height};
}
