import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist}) {
  const {encode} = await feature(dist), {decode} = await feature(dist, 'decode'), {format} = await feature(dist, 'format');
  const eight = pixels(7, 5), sixteen = {width: 7, height: 5, data: Uint16Array.from(eight.data, n => n * 257)};
  const integer = await encode({...sixteen, bitDepth: 16}, {fidelity: 'exact', effort: 1});
  same((await decode(integer)).data, sixteen.data);
  const floating = {width: 7, height: 5, data: Float32Array.from(eight.data, n => n / 255)};
  const hdr = await encode({...floating, sampleFormat: 'float32'}, {fidelity: 'exact', effort: 1});
  same((await decode(hdr, {format: 'float32'})).data, floating.data);
  const depth = new Uint16Array(35).fill(12345);
  const authored = await format({kind: 'channels', image: {width: 7, height: 5,
    color: [new Uint8Array(35).fill(80)], extraChannels: [{type: 'depth', data: depth, bitDepth: 16, name: 'Depth'}]}}, {fidelity: 'exact'});
  const decoded = await decode(authored);
  assert.equal(decoded.extraChannels[0].name, 'Depth');
  assert.equal(decoded.extraChannels[0].type, 1);
  return {uint16Bytes: integer.length, float32Bytes: hdr.length, depthChannelBytes: authored.length};
}
