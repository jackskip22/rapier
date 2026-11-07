import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist, observe}) {
  const {capture: encode} = await feature(dist, 'capture'), {decode} = await feature(dist, 'decode');
  const input = pixels(63, 47), before = input.data.slice();
  const exact = await encode(input, {fidelity: {maxError: 0}});
  same((await decode(exact.bytes)).data, before);
  const bounded = await encode(input, {fidelity: {maxError: 1}}), decoded = await decode(bounded.bytes);
  let maximum = 0;
  for (let i = 0; i < before.length; i++) {
    if (i % 4 === 3) assert.equal(decoded.data[i], before[i]);
    else maximum = Math.max(maximum, Math.abs(decoded.data[i] - before[i]));
  }
  assert.ok(maximum <= 1); same(input.data, before);
  await observe?.(input, exact, 'exact');
  await observe?.(input, bounded, 'bounded');
  return {exactBytes: exact.bytes.length, boundedBytes: bounded.bytes.length, maxRGBError: maximum, alphaExact: true};
}
