// SPDX-License-Identifier: MIT
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', undefined), out = option('--out', null), qualities = option('--qualities', '50,75,90').split(',').map(Number);
const allowFallback = args.includes('--allow-fallback'), flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7));
const photos = args.filter(v => !v.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let worst = 0, bound = 0, failures = 0;
try {
  for (let i = 0; !browser.adapter && i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    browser.adapter = await browser.page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null; });
  }
  if (!browser.adapter || (browser.adapter.fallback && !allowFallback)) throw new Error('No hardware adapter: ' + JSON.stringify(browser.adapter));
  for (const photo of photos) {
    copyFileSync(photo, dir + 's2-native.png');
    const result = await browser.page.evaluate(async qualities => {
      const bitmap = await createImageBitmap(await (await fetch('/gpu-search/bench/.data/s2-native.png', {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const width = bitmap.width, height = bitmap.height, rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      const {prepareKernels, configureKernels} = await import('/kernels.mjs');
      await prepareKernels(); configureKernels('auto');
      const {prepareV6, v6Image} = await import('/photo-v6.mjs');
      const {s2GuidedBlocks, NATIVE_DOUBT} = await import('/photo-v6-search.mjs');
      const {materialize} = await import('/varblocks.mjs');
      const {reconstruct, toRGBA} = await import('/reconstruct.mjs');
      const {ssimulacra2, ssimulacra2Reference} = await import('/ssimulacra2.mjs');
      const {gpuS2Native} = await import('/gpu-ssimulacra2-native.mjs');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
      const prep = prepareV6(rgba, width, height);
      const refNative = ssimulacra2Reference({rgba}, width, height, {native: true, immutable: true, cacheBytes: 64 << 20});
      const rows = [];
      const live = new Set(), make = device.createBuffer.bind(device);
      device.createBuffer = descriptor => { const b = make(descriptor), destroy = b.destroy.bind(b); live.add(b); b.destroy = () => { live.delete(b); destroy(); }; return b; };
      for (const quality of qualities) {
        const base = v6Image(prep, quality, {keepPlanes: true, calibrationRow: 's2e8', noLevels: false}, false);
        for (const [ids, lam] of [[[4, 5, 6, 7], 0.85], [[4, 5, 6, 7, 10, 11], 1.25]]) {
          const decoded = toRGBA(reconstruct(materialize(s2GuidedBlocks(base, width, height, {rgba}, ids, lam).s2Var)), width, height);
          const cpu = ssimulacra2(refNative, {rgba: decoded}, width, height, {native: true}).score;
          let t = performance.now();
          const gpu = (await gpuS2Native(device, {rgba, width, height, decoded}))?.score ?? null;
          const gpuMs = performance.now() - t, leftOver = live.size;
          t = performance.now(); ssimulacra2(refNative, {rgba: decoded}, width, height, {native: true}); const cpuMs = performance.now() - t;
          rows.push({quality, ids: ids.join(','), width, height, cpu, gpu, diff: gpu === null ? null : gpu - cpu, gpuMs, cpuMs, leftOver});
        }
      }
      device.destroy();
      return {rows, bound: NATIVE_DOUBT};
    }, qualities);
    bound = result.bound;
    for (const r of result.rows) {
      const ok = r.diff !== null && Math.abs(r.diff) <= bound && r.leftOver === 0;
      if (!ok) failures++;
      worst = Math.max(worst, Math.abs(r.diff ?? Infinity));
      console.log(`${ok ? 'PASS' : 'FAIL'} ${basename(photo)} q${r.quality} ids ${r.ids} ${r.width}x${r.height}: CPU ${r.cpu.toFixed(6)}, device ${r.gpu?.toFixed(6)}, difference ${r.diff?.toExponential(2)}; score ${r.gpuMs.toFixed(0)} ms on the device, ${r.cpuMs.toFixed(0)} ms on the CPU; device buffers left ${r.leftOver}`);
      rows.push({file: basename(photo), ...r, adapter: browser.adapter});
    }
  }
} finally { await browser.close(); }
console.log(`largest difference ${worst.toExponential(2)} (bound ${bound}); adapter ${JSON.stringify(browser.adapter)}`);
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
process.exit(failures ? 1 : 0);
