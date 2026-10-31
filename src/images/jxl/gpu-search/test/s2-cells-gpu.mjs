// SPDX-License-Identifier: MIT
import {copyFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', undefined), allowFallback = args.includes('--allow-fallback');
const flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7)), photos = args.filter(v => !v.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
let failures = 0;
try {
  for (let i = 0; !browser.adapter && i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    browser.adapter = await browser.page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null; });
  }
  if (!browser.adapter || (browser.adapter.fallback && !allowFallback)) throw new Error('No hardware adapter: ' + JSON.stringify(browser.adapter));
  for (const photo of photos) {
    copyFileSync(photo, dir + 's2-cells.png');
    const rows = await browser.page.evaluate(async () => {
      const bitmap = await createImageBitmap(await (await fetch('/gpu-search/bench/.data/s2-cells.png', {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const W = bitmap.width, H = bitmap.height, full = new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer);
      const {s2CellSums} = await import('/s2-cells.mjs');
      const {gpuS2Cells} = await import('/gpu-s2-cells.mjs');
      const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
      const crop = (w, h) => { const o = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) o.set(full.subarray(y * W * 4, (y * W + w) * 4), y * w * 4); return o; };
      const changed = (rgba, w, h) => {
        const o = new Uint8Array(rgba.length);
        let seed = 12345;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
          seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
          const src = rgba[(y * w + Math.min(w - 1, x + (y % 37 < 5 ? 1 : 0))) * 4 + c];
          o[(y * w + x) * 4 + c] = c === 3 ? 255 : Math.max(0, Math.min(255, src + ((seed >>> 24) % 9) - 4 + (x * 7 % 23 === 0 ? 40 : 0)));
        }
        return o;
      };
      const sizes = [[W, H], [Math.max(8, W - 3), Math.max(8, H - 5)], [Math.min(W, 61), Math.min(H, 45)], [8, 8]];
      const rows = [];
      for (const [w, h] of sizes) {
        const ref = crop(w, h);
        for (const [what, cand] of [['changed', changed(ref, w, h)], ['itself', ref]]) {
          let t = performance.now();
          const cpu = s2CellSums({rgba: ref}, {rgba: cand}, w, h), cpuMs = performance.now() - t;
          t = performance.now();
          const gpu = await gpuS2Cells(device, {reference: ref, decoded: cand, width: w, height: h}), gpuMs = performance.now() - t;
          let differ = gpu ? 0 : -1, first = null, terms = 0;
          if (gpu) for (const [s, sc] of cpu.scales.entries()) for (const [j, term] of sc.sums.entries()) {
            terms++;
            const g = gpu.scales[s]?.sums[j];
            if (!g || g.k !== term.k || g.sum.length !== term.sum.length) { differ++; first ??= `scale ${s} term ${j} shape`; continue; }
            for (let i = 0; i < term.sum.length; i++) if (g.sum[i] !== term.sum[i]) { differ++; first ??= `scale ${s} k ${term.k} p ${term.p} [${i}] cpu ${term.sum[i]} gpu ${g.sum[i]}`; }
          }
          rows.push({w, h, what, differ, first, terms, cpuMs, gpuMs});
        }
      }
      device.destroy();
      return rows;
    });
    for (const r of rows) {
      const ok = r.differ === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${basename(photo)} ${r.w}x${r.h} ${r.what}: ${r.terms} terms, ${r.differ < 0 ? 'device answered null' : r.differ + ' values differ'}${r.first ? ' (first: ' + r.first + ')' : ''}; ${r.gpuMs.toFixed(0)} ms device, ${r.cpuMs.toFixed(0)} ms CPU`);
    }
  }
} finally { await browser.close(); }
console.log(`adapter ${JSON.stringify(browser.adapter)}`);
process.exit(failures ? 1 : 0);
