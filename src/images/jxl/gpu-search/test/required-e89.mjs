// SPDX-License-Identifier: MIT
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', undefined), out = option('--out', null), quality = Number(option('--quality', '90'));
const efforts = option('--efforts', '8,9').split(',').map(Number);
const flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7)), photos = args.filter(v => !v.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let failures = 0;
try {
  for (let i = 0; !browser.adapter && i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    browser.adapter = await browser.page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null; });
  }
  console.log('adapter', JSON.stringify(browser.adapter));
  for (const photo of photos) {
    copyFileSync(photo, dir + 'required.png');
    const result = await browser.page.evaluate(async ({quality, efforts}) => {
      const bitmap = await createImageBitmap(await (await fetch('/gpu-search/bench/.data/required.png', {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const width = bitmap.width, height = bitmap.height, data = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      const {encode} = await import('/v7/index.mjs');
      const {gpuBlocksStats} = await import('/gpu-blocks.mjs');
      const {gpuS2Stats} = await import('/gpu-ssimulacra2-native.mjs');
      const {gpuCoreDevice} = await import('/gpu-core.mjs');
      const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      const plain = {encode: (p, o) => encode(p, {...o, webgpu: false})}, required = {encode: (p, o) => encode(p, {...o, webgpu: 'required'})};
      const rows = [];
      {
        for (const effort of efforts) {
          const options = {fidelity: {quality}, effort}, picture = () => ({data: data.slice(), width, height});
          let t = performance.now();
          const a = await plain.encode(picture(), options), cpuMs = performance.now() - t;
          const costs = gpuBlocksStats.costs, scores = gpuS2Stats.scores;
          t = performance.now();
          let b = null, error = null;
          try { b = await required.encode(picture(), options); } catch (e) { error = e?.code ?? String(e); }
          const gpuMs = performance.now() - t, costsUsed = gpuBlocksStats.costs - costs, scoresUsed = gpuS2Stats.scores - scores;
          const broken = await gpuCoreDevice(), submit = broken.queue.submit;
          broken.queue.submit = () => { throw new Error('a broken device (required-e89.mjs)'); };
          let refused = null, fallback = null;
          try { await required.encode(picture(), options); refused = 'encoded'; } catch (e) { refused = e?.code ?? String(e); }
          try { fallback = await sha(await encode(picture(), options)); } catch (e) { fallback = e?.code ?? String(e); }
          broken.queue.submit = submit;
          rows.push({effort, width, height, plain: await sha(a), required: b && await sha(b), error, bytes: a.length,
            costsUsed, scoresUsed, refused, fallback, cpuMs, gpuMs});
        }
      }
      return rows;
    }, {quality, efforts});
    for (const r of result) {
      const ok = r.required === r.plain && r.costsUsed > 0 && r.scoresUsed > 0 && r.refused === 'JXL_WEBGPU' && r.fallback === r.plain;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${basename(photo)} e${r.effort} q${quality} ${r.width}x${r.height}: ${r.required === r.plain ? 'same SHA-256' : 'DIFFERENT'} (${r.plain.slice(0, 16)}, ${r.bytes} B${r.error ? ', required failed: ' + r.error : ''}), device costs used ${r.costsUsed}, S2 scores used ${r.scoresUsed}; broken device: required ${r.refused}, default ${r.fallback === r.plain ? 'same SHA-256' : r.fallback}; WebAssembly ${r.cpuMs.toFixed(0)} ms, required ${r.gpuMs.toFixed(0)} ms (one run)`);
      rows.push({file: basename(photo), quality, ...r, adapter: browser.adapter});
    }
  }
} finally { await browser.close(); }
if (out) writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
process.exit(failures ? 1 : 0);
