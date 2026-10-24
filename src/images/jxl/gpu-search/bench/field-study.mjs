import {copyFileSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from '../test/browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const targets = opt('--targets', '1,0.8').split(',').map(Number), chrome = opt('--chrome', undefined), flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7));
const onlyArg = opt('--variants', '');
const [out, ...photos] = args.filter(a => !a.startsWith('--'));
const VARIANTS = {
  base: {},
  switch10: {switchCost: 0.1},
  switch50: {switchCost: 0.5},
  narrow: {levels: [0.8, 0.9, 1, 1.12, 1.25], min: 0.8, max: 1.25},
  gentle: {gamma: 0.25},
  aim50: {aimQuantile: 0.5},
  narrowSwitch: {levels: [0.8, 0.9, 1, 1.12, 1.25], min: 0.8, max: 1.25, switchCost: 0.1},
  closed32: {candidate: 'closed'},
  closed64: {candidate: 'closed', ids: [5, 10, 11, 4, 6, 7, 18, 19, 20]},
  closedL05: {candidate: 'closed', lambda: 0.5}, closedL2: {candidate: 'closed', lambda: 2}, closedL4: {candidate: 'closed', lambda: 4},
  blocks32: {candidate: 'blocks'}, blocks64: {candidate: 'blocks', ids: [5, 10, 11, 4, 6, 7, 18, 19, 20]},
};
const only = onlyArg ? onlyArg.split(',') : Object.keys(VARIANTS);
const variants = Object.fromEntries(only.map(name => [name, VARIANTS[name]]));
const dir = fileURLToPath(new URL('./.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined}), rows = [];
for (const photo of photos) {
  copyFileSync(photo, dir + 'study.png');
  const row = await browser.page.evaluate(async ({targets, variants}) => {
    const blob = await (await fetch('/gpu-search/bench/.data/study.png')).blob(), bitmap = await createImageBitmap(blob);
    const width = bitmap.width, height = bitmap.height, c = new OffscreenCanvas(width, height), x = c.getContext('2d');
    x.drawImage(bitmap, 0, 0);
    const rgba = new Uint8Array(x.getImageData(0, 0, width, height).data.buffer);
    const S = await import('/photo-v6-search.mjs'), {GpuMeasure} = await import('/gpu-reconstruct.mjs');
    let adapter = null;
    for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter(); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
    const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
    const gpu = await GpuMeasure.create(device, rgba, width, height), pr = S.prepareV6(rgba, width, height), result = {width, height, targets: {}};
    for (const t of targets) {
      const r = {};
      const run = async (candidates, {candidate, ids, lambda, field, ...aq}) => { const t0 = performance.now(), f = await S.runAsync(S.scoreSteps(pr, {butteraugli3: t}, {candidates, effort: 5, aq: {...S.AQ, ...aq}, ...(ids ? {ids} : {}), ...(lambda ? {lambda} : {}), ...(field === false ? {field} : {})}), (im, w) => gpu.measure(im, w));
        return {tried: f.tried.map(({candidate, quality, size, butteraugli3}) => ({candidate, quality, size, ba3: butteraugli3})), ms: Math.round(performance.now() - t0)}; };
      for (const [name, aq] of Object.entries(variants)) {
        const other = aq.candidate || 'field', {tried, ms} = await run(['gaborish', other], aq), g = tried.find(x => x.candidate === 'gaborish'), f = tried.find(x => x.candidate === other);
        r.gaborish ??= g; r[name] = {...f, vsGaborish: +((f.size / g.size - 1) * 100).toFixed(2), ms};
      }
      result.targets[t] = r;
    }
    gpu.destroy();
    return result;
  }, {targets, variants});
  row.photo = basename(photo);
  rows.push(row);
  console.log(JSON.stringify(row));
  writeFileSync(out, JSON.stringify(rows, null, 1));
}
await browser.close();
rmSync(dir, {recursive: true});
