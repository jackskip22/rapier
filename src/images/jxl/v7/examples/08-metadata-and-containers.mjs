import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist}) {
  const {encode} = await feature(dist), metadata = await feature(dist, 'metadata'), {inspect, edit} = metadata;
  const original = await encode(pixels(), {fidelity: 'exact', effort: 1});
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/">A gift to the world — 世界</x:xmpmeta>';
  const supplied = new TextEncoder().encode(xmp);
  const pending = edit(original, {xmp: supplied}); supplied.fill(0);
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
  return {metadataBytes: written.length, repackedBytes: boxed.length, streamChunks: streamed.length, codestreamUnchanged: true};
}
