import {readFile} from 'node:fs/promises';
import {feature, same} from './helpers.mjs';
export async function run({dist, observe}) {
  const {recompress, restore} = await feature(dist, 'jpeg');
  const original = new Uint8Array(await readFile(new URL('../fixtures/small.jpg', import.meta.url)));
  const encoded = await recompress(original, {effort: 7});
  same((await restore(encoded.bytes)).bytes, original);
  const foreign = new Uint8Array(await readFile(new URL('../fixtures/small-libjxl.jxl', import.meta.url)));
  same((await restore(foreign)).bytes, original);
  await observe?.(original, encoded, 'recompressed');
  await observe?.(original, {...encoded, bytes: foreign}, 'libjxl');
  return {originalBytes: original.length, jxlBytes: encoded.bytes.length, exactReconstruction: true, libjxlReconstruction: true};
}
