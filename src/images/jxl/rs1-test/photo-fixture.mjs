// SPDX-License-Identifier: MIT
import {readFile} from 'node:fs/promises';

export async function tiled(width, height) {
  const {readPng} = await import('../../../jxl/png.mjs');
  const tile = await readPng(new Uint8Array(await readFile(new URL('../v7/test/fixtures/photo.png', import.meta.url))));
  const data = new Uint8Array(width * height * 4), channels = tile.data.length / (tile.width * tile.height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tx = Math.floor(x / tile.width) % 2 ? tile.width - 1 - x % tile.width : x % tile.width;
    const ty = Math.floor(y / tile.height) % 2 ? tile.height - 1 - y % tile.height : y % tile.height;
    const from = (ty * tile.width + tx) * channels, to = (y * width + x) * 4;
    data[to] = tile.data[from]; data[to + 1] = tile.data[from + 1]; data[to + 2] = tile.data[from + 2]; data[to + 3] = 255;
  }
  return {width, height, data};
}
