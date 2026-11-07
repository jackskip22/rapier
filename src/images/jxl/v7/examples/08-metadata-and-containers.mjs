import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist, observe}) {
  const {encode} = await feature(dist), metadata = await feature(dist, 'metadata'), {inspect, edit} = metadata;
  const input = pixels(), original = await encode(input, {fidelity: 'exact', effort: 1});
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/">A gift to the world — 世界</x:xmpmeta>';
  const supplied = new TextEncoder().encode(xmp);
  const pending = edit(original.bytes, {xmp: supplied}); supplied.fill(0);
  const written = await pending, read = (await inspect(written, {details: ['metadata']})).metadata;
  assert.equal(new TextDecoder().decode(read.xmp[0]), xmp);
  const boxed = await edit(written, {chunkSize: 17});
  const [before, after] = (await Promise.all([inspect(written, {details: ['layout']}), inspect(boxed, {details: ['layout']})])).map(info => info.layout);
  same(before.codestream, after.codestream);
  const streamed = [];
  for await (const chunk of metadata.stream([before.codestream.subarray(0, 9), before.codestream.subarray(9)], {chunkSize: 17})) streamed.push(chunk);
  const collected = new Uint8Array(streamed.reduce((n, part) => n + part.length, 0));
  let offset = 0; for (const chunk of streamed) {collected.set(chunk, offset); offset += chunk.length;}
  same((await inspect(collected, {details: ['layout']})).layout.codestream, before.codestream);
  for (const [name, bytes] of [['original', original.bytes], ['metadata', written], ['repacked', boxed], ['streamed', collected]])
    await observe?.(input, {...original, bytes}, name);
  return {metadataBytes: written.length, repackedBytes: boxed.length, streamChunks: streamed.length, codestreamUnchanged: true};
}
