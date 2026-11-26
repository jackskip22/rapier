import {inspect} from 'rapier-jxl/metadata';

export const COLOR_HEADER_BYTES = 64 * 1024;
const WHITES = ['d65', 'e', 'dci', 'd50'], PRIMARIES = ['srgb', 'display-p3', 'rec2020'];
const TRANSFERS = ['srgb', 'linear', 'bt709', 'dci', 'pq', 'hlg', 'unknown'];
const xy = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const named = (value, names, size) => names.includes(value) ||
  (size === 1 ? xy(value) : Array.isArray(value) && value.length === 3 && value.every(xy));

export async function colorOf(bytes) {
  let encoding;
  try { encoding = (await inspect(bytes)).colorEncoding; } catch { return null; }
  if (!encoding || encoding.transferFunction === 'icc') return {profile: true};
  const gray = encoding.space === 'gray';
  if (!gray && encoding.space !== 'rgb') return {profile: true};
  return {space: gray ? 'gray' : 'rgb', whitePoint: encoding.whitePoint ?? 'd65',
    ...(!gray && {primaries: encoding.primaries ?? 'srgb'}),
    ...(encoding.gamma !== undefined ? {gamma: encoding.gamma} : {transferFunction: encoding.transferFunction ?? 'srgb'})};
}

export function isColor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (value.profile === true) return keys.length === 1;
  if (!['rgb', 'gray'].includes(value.space) || !named(value.whitePoint, WHITES, 1)) return false;
  if (value.space === 'rgb' ? !named(value.primaries, PRIMARIES, 3) : 'primaries' in value) return false;
  const curve = value.gamma !== undefined ? Number.isFinite(value.gamma) && value.gamma > 0 && !('transferFunction' in value)
    : TRANSFERS.includes(value.transferFunction);
  return curve && keys.every(key => ['space', 'whitePoint', 'primaries', 'transferFunction', 'gamma'].includes(key));
}

export function sameColor(color, sourceColor) {
  if (color.profile || sourceColor.profile) return true;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return same(color.whitePoint, sourceColor.whitePoint) && same(color.gamma, sourceColor.gamma) &&
    same(color.transferFunction, sourceColor.transferFunction) &&
    (color.space !== 'rgb' || sourceColor.space !== 'rgb' || same(color.primaries, sourceColor.primaries));
}

export const checkable = key => /\.(?:jpe?g|jpe|jfif|png)$/i.test(key);
