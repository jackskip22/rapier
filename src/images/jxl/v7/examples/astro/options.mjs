import {baseService} from 'astro/assets';
import pkg from 'rapier-jxl/package.json' with {type: 'json'};

const NAMED = {low: 25, mid: 50, high: 80, max: 100};

export function settings(config, workers) {
  const {effort = 3, quality = 72, jpeg = 'pixels', maxPixels = workers ? 12_600_000 : undefined} = config?.service?.config?.jxl ?? {};
  return {effort, quality, jpeg, maxPixels};
}

export function asked(value) {
  if (value == null || value === '') return undefined;
  const number = NAMED[value] ?? (Number.isFinite(+value) ? +value : undefined);
  return number === undefined ? undefined : Math.min(100, Math.max(1, Math.round(number)));
}

export const propertiesToHash = ['src', 'width', 'height', 'format', 'quality', 'fit', 'position', 'background', 'jxl'];

export function validateOptions(options, config) {
  const valid = baseService.validateOptions(options, config);
  if (valid.format === 'jxl') {
    const {effort, quality, jpeg} = settings(config);
    valid.jxl = `${pkg.version}:${effort}:${quality}:${jpeg}`;
  }
  return valid;
}

export function getHTMLAttributes(options, config) {
  const {jxl, ...rest} = options;
  return baseService.getHTMLAttributes(rest, config);
}

export function bytes(result, src) {
  if (result.bytes) return result.bytes;
  throw Object.assign(new Error(`${src}: ${result.reason.code} ${result.reason.message}`), {code: result.reason.code});
}
