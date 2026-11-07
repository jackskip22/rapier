import {feature, pixels, same, assert} from './helpers.mjs';

export async function run({dist, observe}) {
  const {variants} = await feature(dist);
  const original = pixels(32, 24), before = original.data.slice();
  const files = new Map([['original', before.slice()]]), media = {original: 'original', renditions: []};
  const results = await variants(original, {fidelity: 'exact', effort: 1, outputs: [{width: 16}, {width: 24}]});
  for (const [index, result] of results.entries()) {
    assert.ok(result.fits);
    const key = `rendition-${index}.jxl`;
    assert.ok(!files.has(key));
    files.set(key, result.bytes.slice());
    const stored = {...result, bytes: files.get(key)};
    same(stored.bytes, result.bytes);
    media.renditions.push({key, result: stored});
    await observe?.(original, stored, key);
  }
  same(original.data, before);
  same(files.get(media.original), before);
  assert.equal(media.original, 'original');
  return {originalPreserved: true, renditions: media.renditions.length,
    dimensions: media.renditions.map(({result: {width, height}}) => ({width, height})), storedBytesEqual: true};
}
