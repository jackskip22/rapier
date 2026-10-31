// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Worker} from 'node:worker_threads';
import {decodeDataImage, svgElements} from '../../images/assets.mjs';
import {RAPIER_DRAW_VERSION} from '../../draw/core.mjs';
import {declarations} from '../check-satellite-support.mjs';
import {drawSource} from './_draw-source.mjs';

async function resourceCustody(inspect, asSvg) {
  const [letters, liquid] = await Promise.all([
    import('../../draw/letters.mjs?inspection-custody'), import('../../draw/liquid.mjs?inspection-custody'),
  ]);
  const path = 'M0 0l900 0 0 1000-900 0z', laterPath = 'M0 0l500 0 0 800-500 0z';
  const body = '<path d="M 0 0 L 10 10"/>', box = {minX: 0, minY: 0, maxX: 10, maxY: 10};
  const effect = liquid.liquidPreset(), key = liquid.liquidStillKey(effect, body, box);
  const still = name => 'data:image/jxl;base64,' + readFileSync(new URL('../../images/jxl/public/test/seeds/' + name + '.jxl', import.meta.url)).toString('base64');
  const firstStill = still('jxl-rs-default-squeeze'), lastStill = still('jxl-rs-subnormal');
  const recipe = {version: RAPIER_DRAW_VERSION, canvas: {w: 100, h: 100}, strokes: [], shapes: [
    {id: 'capital', recognized: 'text', geom: {cx: 50, cy: 50}, label: 'BB', textFont: 'letters:field', textSize: 24},
  ]};
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><metadata id="rapier-draw">' + JSON.stringify(recipe) + '</metadata>' +
    '<g data-shape-id="capital"><g fill="#121212" fill-rule="evenodd"><path transform="matrix(0.024 0 0 0.024 0 0)" d="' + path + '"/>' +
    '<path transform="matrix(0.024 0 0 0.024 25 0)" d="' + laterPath + '"/></g></g>' +
    '<g data-rapier-effect="liquid"><g data-rapier-liquid-source="" display="none">' + body + '</g>' +
    '<image data-rapier-liquid-still="' + key + '" href="' + firstStill + '"/><image data-rapier-liquid-still="' + key + '" href="' + lastStill + '"/></g></svg>';
  const inspected = await inspect(asSvg(source));
  for (const dark of [true, false]) {
    const viewed = await inspect(asSvg(source), {dark});
    assert.equal(await viewed.blob.text(), source, 'display inversion must preserve the exact SVG, custom colours, font paths and nested raster bytes');
    assert.deepEqual(viewed.recipe, inspected.recipe, 'display inversion cannot author the drawing recipe');
  }
  assert.equal(inspected.recipe.shapes[0].textFont, 'letters:field');
  assert.deepEqual(inspected.resources, {letters: [{set: 'field', letter: 'B', path}], stills: [{key, href: lastStill}]},
    'worker inspection carries the first admitted capital and last saved still for their identities');
  assert.equal(letters.letterGlyph(letters.letterSet('field'), 'B')[1], null);
  assert.equal(liquid.liquidStillHas(key), false);
  const adopt = vm.runInNewContext(declarations(drawSource(), ['_rapierDrawAdoptInspection']) +
    '\n_rapierDrawAdoptInspection;', {RapierDrawLetters: letters, RapierDrawCore: liquid});
  adopt(inspected.resources);
  assert.equal(letters.letterGlyph(letters.letterSet('field'), 'B')[1], path, 'the receiving page keeps the exact ornamental outline without the letter plug-in');
  const savedStill = () => svgElements('<svg xmlns="http://www.w3.org/2000/svg">' + liquid.liquidMarkup(effect, body, box, 'saved') + '</svg>', {inspect: false})
    .nodes.find(node => node.local === 'image')?.attributes.get('href')?.value;
  assert.equal(savedStill(), lastStill, 'the receiving writer emits the exact saved liquid still');
  adopt({letters: [{set: 'field', letter: 'C', path: '"><script>attack()</script>'}], stills: [{key, href: 'https://example.invalid/changed.jxl'}]});
  assert.equal(letters.letterGlyph(letters.letterSet('field'), 'C')[1], null, 'resource adoption retains the original letter-path validator');
  assert.equal(savedStill(), lastStill, 'resource adoption retains the original still validator');
}

async function borrowedPresentationCurrentness() {
  const image = {src: 'blob:original', isConnected: true}, jobs = [];
  let dark = true;
  const scope = {
    presentationRevision: 0, darkPaper: () => dark,
    host: {querySelectorAll: () => [], contains: () => false},
    document: {querySelectorAll: () => [image]}, presented: new WeakMap(),
    cache: new Map([['source', {type: 'image/svg+xml', displayUrl: 'blob:original', signature: 'source'}]]),
    darkened: new Map([['source', {url: 'blob:derived'}]]),
    present: () => new Promise(resolve => jobs.push(resolve)), schedule() {},
  };
  const retheme = vm.runInNewContext(declarations(readFileSync(new URL('../../images/browser.js', import.meta.url), 'utf8'), ['retheme']) + '\nretheme;', scope);
  retheme(); dark = false; retheme();
  jobs[0]({url: 'blob:derived'}); await Promise.resolve();
  assert.equal(image.src, 'blob:original', 'an older completion cannot take the borrowed resource from a newer request');
  jobs[1]({url: 'blob:original'}); await Promise.resolve();
  assert.equal(image.src, 'blob:original');
  dark = true; retheme(); dark = false; retheme(); dark = true; retheme();
  jobs[4]({url: 'blob:derived'}); await Promise.resolve();
  jobs[3]({url: 'blob:original'}); jobs[2]({url: 'blob:derived'}); await Promise.resolve();
  assert.equal(image.src, 'blob:derived', 'the latest completed request keeps resource ownership after older replies');
}

export async function imageInspectionSecurity() {
  const entry = new URL('../../images/inspection.mjs', import.meta.url).href;
  const worker = new Worker(`
    const {parentPort} = require('node:worker_threads');
    import(${JSON.stringify(entry)}).then(({installImageInspectionWorker}) => {
      const scope = {postMessage: (message, transfer) => parentPort.postMessage(message, transfer)};
      installImageInspectionWorker(scope);
      parentPort.on('message', data => scope.onmessage({data}));
      parentPort.postMessage({ready: true});
    });
  `, {eval: true, execArgv: []});
  const pending = new Map(), replies = [];
  let serial = 0, stopped = false, failure = null, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = error => {
    failure ||= error; readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on('error', fail);
  worker.on('messageerror', fail);
  worker.on('exit', code => { if (!stopped) fail(new Error('image worker exited before completion: ' + code)); });
  worker.on('message', message => {
    if (message.ready) { readyResolve(); return; }
    replies.push(message.id);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(Object.assign(new Error(message.error.message), message.error));
    else request.resolve(message.result);
  });
  const inspect = (url, options = {}) => {
    if (failure) return Promise.reject(failure);
    const id = ++serial, result = new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
    worker.postMessage({id, operation: 'begin', kind: 'image', options});
    for (let at = 0; at < url.length; at += 32771) worker.postMessage({id, operation: 'part', text: url.slice(at, at + 32771)});
    worker.postMessage({id, operation: 'finish'});
    return result;
  };
  const asSvg = text => 'data:image/svg+xml;base64,' + Buffer.from(text).toString('base64');
  const blobBytes = async result => new Uint8Array(await result.blob.arrayBuffer());
  try {
    await ready;
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">' +
      '<text>Exact 😀 &amp; snow 雪</text><desc>' + 'x'.repeat(180000) + '</desc><text>Tail café ☃</text></svg>';
    const url = asSvg(source), exact = await inspect(url);
    assert.equal(exact.type, 'image/svg+xml');
    assert.equal(exact.url, null, 'an admitted SVG needs no replacement of its retained data URL');
    assert.deepEqual(await blobBytes(exact), new TextEncoder().encode(source), 'chunked worker admission must preserve every safe SVG byte, including Unicode');
    assert.equal(exact.recipe, null, 'an ordinary SVG must not acquire a drawing recipe');

    const hostile = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="globalThis.svgAttack=1">' +
      '<script>globalThis.svgAttack=1</script><image href="https://example.invalid/pixel"/><text>Keep 雪</text></svg>';
    const clean = await inspect(asSvg(hostile)), cleanBytes = await blobBytes(clean), cleanText = new TextDecoder().decode(cleanBytes);
    assert.deepEqual(decodeDataImage(clean.url), cleanBytes, 'the worker returns one canonical sanitized payload for retained and display bytes');
    const parsed = svgElements(cleanText, {inspect: false});
    assert(!parsed.nodes.some(node => node.local.toLowerCase() === 'script' || [...node.attributes].some(([name, attr]) =>
      name.toLowerCase().startsWith('on') || attr.value.startsWith('https://example.invalid'))),
    'worker admission must remove script, handler and remote-resource authority');
    assert(cleanText.includes('<text>Keep 雪</text>'), 'sanitation preserves safe authored content');
    await assert.rejects(inspect(asSvg(source.replace('</svg>', '<path'))), 'a valid header cannot admit a corrupt trailing SVG body');

    const cancelled = ++serial, split = Math.floor(url.length / 2);
    worker.postMessage({id: cancelled, operation: 'begin', kind: 'image', options: {}});
    worker.postMessage({id: cancelled, operation: 'part', text: url.slice(0, split)});
    worker.postMessage({id: cancelled, operation: 'cancel'});
    worker.postMessage({id: cancelled, operation: 'part', text: url.slice(split)});
    worker.postMessage({id: cancelled, operation: 'finish'});
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
    const raster = await inspect(png);
    assert.equal(raster.type, 'image/png');
    assert.deepEqual(await blobBytes(raster), decodeDataImage(png), 'the next request receives its exact PNG bytes, never cancelled source');
    assert(!replies.includes(cancelled), 'cancelled input cannot publish a stale result after its remaining messages arrive');
    await assert.rejects(inspect(png.replace('image/png', 'image/jpeg')), 'raster bytes must agree with the declared codec');

    const truncated = Uint8Array.from([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10]);
    const damaged = await inspect('data:image/jxl;base64,' + Buffer.from(truncated).toString('base64'));
    assert.equal(damaged.type, 'image/jxl');
    assert.equal(damaged.containerDamaged, true, 'a truncated JPEG XL container is identified as damaged');
    assert.deepEqual(await blobBytes(damaged), truncated, 'damage classification must preserve the original JPEG XL bytes');
    for (const name of ['epf3-q50', 'progressive-q75', 'modular-q50-epf2']) {
      const file = readFileSync(new URL('fixtures/jxl-admission/libjxl-' + name + '.jxl', import.meta.url));
      for (const [bytes, damaged] of [[file, null], [file.subarray(0, -1), true]])
        assert.equal((await inspect('data:image/jxl;base64,' + bytes.toString('base64'))).damaged, damaged, 'libjxl ' + name + (damaged ? ' cut short' : ' whole'));
    }
    await resourceCustody(inspect, asSvg);
    await borrowedPresentationCurrentness();
    return 'image worker preserves safe SVG/PNG bytes and Unicode, sanitizes hostile content, rejects a corrupt SVG tail, drops cancelled source, classifies damaged and cut libjxl JPEG XL, and restores exact ornamental paths and liquid stills through their original validators';
  } finally {
    stopped = true;
    await worker.terminate();
  }
}
