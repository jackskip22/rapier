// SPDX-License-Identifier: AGPL-3.0-only
// The picture download crosses from an inert image to an executable SVG file. Exercise
// the real Markdown asset index and download owner; the host sink captures delivered bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import markdownit from '../../agent/vendor/markdownit.mjs';
import * as assets from '../../images/assets.mjs';
import {declarations} from '../check-satellite-support.mjs';

export async function svgDownloadSecurity() {
  const owner = declarations(readFileSync(new URL('../../images/browser.js', import.meta.url), 'utf8'), ['recordFor', 'downloadOriginal']);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const honest = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><metadata id="rapier-draw">{"version":1}</metadata>' +
    '<g data-shape-id="paint"><image data-rapier-paint="paint" width="1" height="1" href="' + png + '"/></g>' +
    '<path id="p" d="M 0 0 L 1 1"/><use href="#p"/></svg>';
  const unsafe = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="globalThis.svgAttack=1"><script>globalThis.svgAttack=1</script><image href="https://example.invalid/pixel"/></svg>';
  const malformed = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><s<iframe/>cript>globalThis.svgAttack=1</script></svg>';
  const asSvg = text => 'data:image/svg+xml;base64,' + Buffer.from(text).toString('base64');
  const capture = async url => {
    const source = '![Figure][picture]\n\n[picture]: ' + url + '\n';
    const index = assets.documentAssets(source, markdownit), delivered = [], refusals = [];
    const context = vm.createContext({assets, Blob, TextEncoder, TextDecoder,
      _rapierImageRuntime: {image: null}, _rapierEmbedAssetSource: () => '',
      documentIndex: () => ({source, index}),
      rapier: {document: {filename: 'proof.md', blocks: [{id: 1, raw: '![Figure][picture]'}]}},
      _rapierScanMarkdownImages: () => [], showToast: (...args) => refusals.push(args),
      _download: async (blob, name) => delivered.push({bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type, name}),
    });
    vm.runInContext(owner, context);
    await context.downloadOriginal({block: {id: 1}, imageIndex: 0, image: {reference: 'picture'}});
    assert.equal(index.assets.get('PICTURE').url, url, 'export must not rewrite the document\'s retained picture');
    return {delivered, refusals};
  };
  for (const [name, url] of [['SVG', asSvg(honest)], ['PNG', png]]) {
    const {delivered, refusals} = await capture(url);
    assert.equal(delivered.length, 1, name + ': one file is delivered');
    assert.equal(refusals.length, 0, name + ': the admitted picture is not refused');
    assert.deepEqual(delivered[0].bytes, assets.decodeDataImage(url), name + ': safe original bytes are exact');
  }
  const {delivered} = await capture(asSvg(unsafe));
  assert.equal(delivered.length, 1, 'safe SVG content remains downloadable');
  const text = new TextDecoder().decode(delivered[0].bytes);
  assert.equal(delivered[0].type, 'image/svg+xml');
  const parsed = assets.svgElements(text, {inspect: false});
  assert(!parsed.nodes.some(node => node.local.toLowerCase() === 'script' || [...node.attributes].some(([name, attr]) =>
    name.toLowerCase().startsWith('on') || attr.value.startsWith('https://example.invalid'))),
  'a downloaded picture cannot acquire script or resource authority when opened as an SVG document');
  const refused = await capture(asSvg(malformed));
  assert.equal(refused.delivered.length, 0, 'malformed XML must not become a standalone SVG file');
  assert.equal(refused.refusals.length, 1, 'the failed export is surfaced without replacing retained source');
  return 'standalone picture downloads sanitize scripts, handlers and remote resources, refuse malformed XML, and preserve safe SVG/PNG plus the document\'s exact source';
}
