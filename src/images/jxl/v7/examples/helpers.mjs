import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
export const feature = (dist, name = 'index') => import(pathToFileURL(resolve(dist, name + '.mjs')).href);
export function pixels(width = 17, height = 13) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data.set([(x * 13 + y * 3) & 255, (x * 5 + y * 17) & 255, (x * 7 + y * 11) & 255, (x + y) % 9 ? 255 : 0], i);
  }
  return {data, width, height};
}
export const same = (actual, expected) => assert.deepEqual([...actual], [...expected]);
export {assert};
