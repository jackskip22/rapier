import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist}) {
  const {encode} = await feature(dist), {decode} = await feature(dist, 'decode'), {inspect} = await feature(dist, 'metadata');
  const input = pixels(), bytes = await encode(input, {fidelity: 'exact', effort: 1});
  const header = await inspect(bytes);
  assert.equal(header.width, input.width); assert.equal(header.height, input.height);
  same((await decode(bytes)).data, input.data);
  await assert.rejects(decode(bytes, {maxPixels: 1}));
  await assert.rejects(inspect(bytes, {maxInputBytes: 1}));
  await assert.rejects(decode(new Uint8Array([255, 10, 0])));
  return {width: header.width, height: header.height, malformedAndOverBudgetInputsRefused: true};
}
