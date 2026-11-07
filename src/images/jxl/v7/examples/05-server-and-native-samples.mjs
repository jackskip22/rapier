import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist, observe}) {
  const {encode} = await feature(dist), {decode} = await feature(dist, 'decode'), {format} = await feature(dist, 'format');
  const eight = pixels(7, 5), sixteen = {width: 7, height: 5, data: Uint16Array.from(eight.data, n => n * 257)};
  const integer = await encode({...sixteen, bitDepth: 16}, {fidelity: 'exact', effort: 1});
  same((await decode(integer.bytes)).data, sixteen.data);
  const floating = {width: 7, height: 5, data: Float32Array.from(eight.data, n => n / 255)};
  const hdr = await encode({...floating, sampleFormat: 'float32'}, {fidelity: 'exact', effort: 1});
  same((await decode(hdr.bytes, {format: 'float32'})).data, floating.data);
  const depth = new Uint16Array(35).fill(12345);
  const channels = {kind: 'channels', image: {width: 7, height: 5,
    color: [new Uint8Array(35).fill(80)], extraChannels: [{type: 'depth', data: depth, bitDepth: 16, name: 'Depth'}]}};
  const authored = await format(channels, {fidelity: 'exact'});
  const decoded = await decode(authored.bytes);
  assert.equal(decoded.extraChannels[0].name, 'Depth');
  assert.equal(decoded.extraChannels[0].type, 1);
  await observe?.({...sixteen, bitDepth: 16}, integer, 'uint16');
  await observe?.({...floating, sampleFormat: 'float32'}, hdr, 'float32');
  await observe?.(channels, authored, 'depth');
  return {uint16Bytes: integer.bytes.length, float32Bytes: hdr.bytes.length, depthChannelBytes: authored.bytes.length};
}
