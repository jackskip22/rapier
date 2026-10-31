import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist}) {
  const {encode} = await feature(dist, 'animation'), {decode} = await feature(dist, 'decode');
  const first = pixels(13, 9), second = pixels(13, 9); second.data[0] ^= 127;
  const input = {width: 13, height: 9, loops: 2,
    frames: [{data: first.data, duration: 100}, {data: second.data, duration: 80}]};
  const encoded = await encode(input, {fidelity: 'exact', effort: 1});
  const output = await decode(encoded);
  assert.equal(output.frames.length, 2); assert.equal(output.animation.loops, 2);
  same(output.frames[0].data, first.data); same(output.frames[1].data, second.data);
  assert.equal(output.frames[0].durationSeconds, 0.1); assert.equal(output.frames[1].durationSeconds, 0.08);
  return {bytes: encoded.length, frames: output.frames.length, exactDurations: true};
}
