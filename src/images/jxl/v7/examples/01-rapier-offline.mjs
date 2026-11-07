import {feature, pixels, same, assert} from './helpers.mjs';
export async function run({dist, observe}) {
  const {encode} = await feature(dist), offline = await feature(dist, 'upload');
  const input = pixels(), before = {...input, data: input.data.slice()}, options = {fidelity: 'exact', effort: 1};
  const pending = [encode(input, options), offline.encode(input, options)];
  input.data.fill(0);
  const [ordinary, embedded] = await Promise.all(pending);
  same(ordinary.bytes, embedded.bytes);
  assert.ok(ordinary.fits && embedded.fits);
  assert.ok(ordinary.bytes.length > 0);
  await observe?.(before, ordinary, 'full');
  await observe?.(before, embedded, 'upload');
  return {bytes: ordinary.bytes.length, embeddedArtifactHasIdenticalOutput: true};
}
