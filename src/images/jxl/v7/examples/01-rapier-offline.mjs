import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist}) {
  const {encode} = await feature(dist), offline = await feature(dist, 'upload');
  const input = pixels(), options = {fidelity: 'exact', effort: 1};
  const pending = [encode(input, options), offline.encode(input, options)];
  input.data.fill(0);
  const [ordinary, embedded] = await Promise.all(pending);
  same(ordinary, embedded);
  assert.ok(ordinary.length > 0);
  return {bytes: ordinary.length, embeddedArtifactHasIdenticalOutput: true};
}
