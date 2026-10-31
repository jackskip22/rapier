// SPDX-License-Identifier: MIT
import {copyFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', undefined), flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7));
const firstEffort = Number(option('--first', '8'));
const allowFallback = args.includes('--allow-fallback'), [a, b] = args.filter(v => !v.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
copyFileSync(a, dir + 'concurrent-a.png'); copyFileSync(b, dir + 'concurrent-b.png');
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
let ok = false;
try {
  if (!browser.adapter || (browser.adapter.fallback && !allowFallback)) throw new Error('No hardware adapter: ' + JSON.stringify(browser.adapter));
  const r = await browser.page.evaluate(async EA => {
    const load = async name => {
      const bitmap = await createImageBitmap(await (await fetch(`/gpu-search/bench/.data/${name}.png`, {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return {data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer), width: bitmap.width, height: bitmap.height};
    };
    const [pa, pb] = [await load('concurrent-a'), await load('concurrent-b')];
    const {configureKernels, prepareKernels} = await import('/kernels.mjs');
    await prepareKernels(); configureKernels('auto');
    const {encodeAsync} = await import('/effort.mjs');
    const {gpuBlocksStats} = await import('/gpu-blocks.mjs'), {gpuBlocks16Stats} = await import('/gpu-blocks16.mjs');
    const {gpuS2Stats} = await import('/gpu-ssimulacra2-native.mjs'), {gpuStats} = await import('/photo-v6-search.mjs');
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
    const count = () => (gpuBlocksStats.costs ?? 0) + (gpuBlocks16Stats?.costs ?? 0) + gpuS2Stats.scores + gpuStats.levels;
    const hex = bytes => [...bytes.slice(0, 0)].join('') + bytes.length + ':' + bytes.reduce((h, v) => (h * 31 + v) >>> 0, 7);
    const run = async jobs => { const before = count(); const files = await Promise.all(jobs.map(([p, effort]) => encodeAsync(p.data, p.width, p.height, {quality: 90, effort, gpu: device}))); return {files: files.map(hex), used: count() - before}; };
    const seven = await run([[pa, EA]]), eight = await run([[pb, 8]]), both = await run([[pa, EA], [pb, 8]]);
    return {seven, eight, both};
  }, firstEffort);
  ok = r.both.files[0] === r.seven.files[0] && r.both.files[1] === r.eight.files[0] && r.both.used === r.seven.used + r.eight.used && r.seven.used > 0 && r.eight.used > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}: alone ${r.seven.files[0]} (device answers ${r.seven.used}), ${r.eight.files[0]} (${r.eight.used}); together ${r.both.files.join(', ')} (${r.both.used}); adapter ${JSON.stringify(browser.adapter)}`);
} finally { await browser.close(); }
process.exit(ok ? 0 : 1);
