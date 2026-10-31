// SPDX-License-Identifier: MIT
import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args.splice(i, 2)[1];
};
const chrome = option('--chrome', undefined);
const out = option('--out', null);
const qualities = option('--qualities', '75,90').split(',').map(Number);
const efforts = option('--efforts', '4,5,6,7').split(',').map(Number);
const allowFallback = args.includes('--allow-fallback');
const speedFrom = Number(option('--speed-from', Infinity));
const publicRoute = args.includes('--public');
const flags = args.filter(v => v.startsWith('--flag=')).map(v => v.slice(7));
const photos = args.filter(v => !v.startsWith('--'));
if (!photos.length || !qualities.every(Number.isFinite) || !efforts.every(v => Number.isInteger(v) && v >= 4 && v <= 7)) {
  throw new Error('Usage: lossy-blocks-parity.mjs <png...> [--qualities 75,90] [--efforts 4,5,6,7] [--speed-from pixels] [--public] [--allow-fallback] [--chrome path] [--flag=<chrome flag>...] [--out results.json]');
}
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url));
mkdirSync(dir, {recursive: true});
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let failures = 0;
try {
  for (let i = 0; !browser.adapter && i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    browser.adapter = await browser.page.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter();
      return a ? {vendor: a.info.vendor, architecture: a.info.architecture, fallback: a.info.isFallbackAdapter} : null;
    });
  }
  if (!browser.adapter || (browser.adapter.fallback && !allowFallback)) throw new Error('GPU bed returned no hardware adapter: ' + JSON.stringify(browser.adapter));
  for (const png of photos) {
    const name = basename(png);
    try {
      copyFileSync(png, dir + 'lossy-blocks-parity.png');
      const result = await browser.page.evaluate(async ({url, qualities, efforts, allowFallback, publicRoute}) => {
        const bitmap = await createImageBitmap(await (await fetch(url, {cache: 'no-store'})).blob(),
          {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const rgba = new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer);
        const width = bitmap.width, height = bitmap.height;
        const {V6, GABORISH} = await import('/photo-v6.mjs');
        const {photoXYBSteps, XYB_TABLES} = await import('/photo-xyb.mjs');
        const {complete} = await import('/bits.mjs');
        const {transformDCT8, dct8Basis} = await import('/photo-dct.mjs');
        const {varDCTSteps} = await import('/vardct.mjs');
        const {GpuCore, gpuCoreQualification} = await import('/gpu-core.mjs');
        const {encodeAsync} = await import('/effort.mjs');
        const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
        if (!adapter || (adapter.info.isFallbackAdapter && !allowFallback)) throw new Error('no hardware WebGPU adapter');
        const device = await adapter.requestDevice({requiredLimits: {
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          maxBufferSize: adapter.limits.maxBufferSize,
        }});
        const errors = [];
        device.addEventListener('uncapturederror', event => errors.push(event.error.message));
        const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          x => x.toString(16).padStart(2, '0')).join('');
        const opts = {...V6, ...GABORISH};
        const core = await GpuCore.create(device, {complete, photoXYBSteps, transformDCT8, dct8Basis, xyb: XYB_TABLES});
        const qualification = await gpuCoreQualification(device);
        const [{runCodec}, {acceleration}] = publicRoute ? await Promise.all([import('/v7/run-codec.mjs'), import('/v7/acceleration.mjs')]) : [{}, {}];
        const samples = [];
        try {
          for (const quality of qualities) {
            const begin = performance.now();
            const cpu = complete(photoXYBSteps(rgba, width, height, quality, opts));
            const cpuMs = performance.now() - begin;
            const start = performance.now();
            const gpu = await core.image(rgba, width, height, quality, opts);
            const gpuMs = performance.now() - start;
            let coefficientsDiffer = 0, nonzeroDiffer = 0, cflDiffer = 0;
            for (let c = 0; c < 3; c++) {
              const a = cpu.components[c].coeffs, b = gpu.image.components[c].coeffs;
              for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) coefficientsDiffer++;
              for (let block = 0; block < gpu.image.nonZero[c].length; block++) {
                let count = 0;
                for (let k = 1; k < 64; k++) if (a[block * 64 + k]) count++;
                if (count !== gpu.image.nonZero[c][block]) nonzeroDiffer++;
              }
            }
            for (let i = 0; i < cpu.cfl.x.length; i++) if (
              cpu.cfl.x[i] !== gpu.image.cfl.x[i] || cpu.cfl.b[i] !== gpu.image.cfl.b[i]) cflDiffer++;
            const vardctCPU = await sha(complete(varDCTSteps(cpu)));
            const vardctGPU = await sha(complete(varDCTSteps(gpu.image)));
            const files = [];
            for (const effort of efforts) {
              const timed = async run => { const t = performance.now(); const bytes = await run(); return [bytes, performance.now() - t]; };
              const [a, cpuFirstMs] = await timed(() => encodeAsync(rgba, width, height, {quality, effort, gpu: false}));
              const [b, gpuFirstMs] = await timed(() => encodeAsync(rgba, width, height, {quality, effort, gpu: device}));
              const [, cpuWarmMs] = await timed(() => encodeAsync(rgba, width, height, {quality, effort, gpu: false}));
              const [, gpuWarmMs] = await timed(() => encodeAsync(rgba, width, height, {quality, effort, gpu: device}));
              const cpuSha256 = await sha(a), gpuSha256 = await sha(b);
              const file = {effort, cpuSha256, gpuSha256, cpuBytes: a.length, gpuBytes: b.length,
                same: a.length === b.length && cpuSha256 === gpuSha256, cpuFirstMs: Math.round(cpuFirstMs), gpuFirstMs: Math.round(gpuFirstMs),
                cpuWarmMs: Math.round(cpuWarmMs), gpuWarmMs: Math.round(gpuWarmMs)};
              if (publicRoute) {
                const route = mode => runCodec('encode', {data: rgba.slice(), width, height}, {fidelity: {quality}, effort, acceleration: mode});
                await route('wasm'); await route('auto');
                const [w, wasmMs] = await timed(() => route('wasm')), [g, autoMs] = await timed(() => route('auto'));
                Object.assign(file, {publicSame: (await sha(w)) === (await sha(g)), autoUsesGpu: typeof await acceleration('auto', width, height, effort) === 'function',
                  publicWasmWarmMs: Math.round(wasmMs), publicAutoWarmMs: Math.round(autoMs)});
              }
              files.push(file);
            }
            samples.push({quality, width, height, coefficientsDiffer, cflDiffer, nonzeroDiffer,
              vardctCpuSha256: vardctCPU, vardctGpuSha256: vardctGPU,
              doubtfulTiles: gpu.doubtfulTiles, tiles: gpu.tiles,
              doubtfulBlocks: gpu.doubtfulBlocks, blocks: gpu.blocks, auditBlocks: gpu.auditBlocks, auditWorst: gpu.auditWorst,
              cpuForwardMs: Math.round(cpuMs), gpuForwardMs: Math.round(gpuMs), qualification,
              files, errors: errors.slice()});
          }
        } finally { device.destroy(); }
        return {adapter: adapter.info.description || adapter.info.architecture, samples};
      }, {url: '/gpu-search/bench/.data/lossy-blocks-parity.png', qualities, efforts, allowFallback, publicRoute});
      rows.push({photo: name, ...result});
      for (const sample of result.samples) {
        const correct = !sample.coefficientsDiffer && !sample.cflDiffer && !sample.nonzeroDiffer &&
          sample.vardctCpuSha256 === sample.vardctGpuSha256 && sample.qualification.ok &&
          sample.files.every(row => row.same && row.publicSame !== false) && !sample.errors.length;
        const big = sample.width * sample.height >= speedFrom;
        const slower = sample.files.filter(row => row.gpuWarmMs > row.cpuWarmMs || row.autoUsesGpu && row.publicAutoWarmMs > row.publicWasmWarmMs).map(row => row.effort);
        if (big && slower.length) failures++;
        const accelerated = sample.doubtfulTiles < sample.tiles;
        if (!correct || !accelerated && !allowFallback) failures++;
        console.log(JSON.stringify({photo: name, quality: sample.quality, pixels: sample.width * sample.height, correct, accelerated, slower,
          qualified: sample.qualification.ok, qualificationFailures: sample.qualification.failures,
          coefficientMismatches: sample.coefficientsDiffer, cflMismatches: sample.cflDiffer,
          nonzeroMismatches: sample.nonzeroDiffer, doubtfulTiles: sample.doubtfulTiles, doubtfulBlocks: sample.doubtfulBlocks, blocks: sample.blocks,
          doubtfulBlockShare: sample.blocks ? +(sample.doubtfulBlocks / sample.blocks).toFixed(5) : null,
          tiles: sample.tiles, auditBlocks: sample.auditBlocks, auditWorst: sample.auditWorst, cpuForwardMs: sample.cpuForwardMs, gpuForwardMs: sample.gpuForwardMs,
          efforts: sample.files.map(row => ({effort: row.effort, same: row.same,
            cpuSha256: row.cpuSha256, gpuSha256: row.gpuSha256, cpuFirstMs: row.cpuFirstMs, gpuFirstMs: row.gpuFirstMs,
            cpuWarmMs: row.cpuWarmMs, gpuWarmMs: row.gpuWarmMs, publicSame: row.publicSame, autoUsesGpu: row.autoUsesGpu,
            publicWasmWarmMs: row.publicWasmWarmMs, publicAutoWarmMs: row.publicAutoWarmMs})), errors: sample.errors}));
      }
    } catch (error) {
      failures++;
      rows.push({photo: name, error: String(error?.stack || error)});
      console.error('FAILED', name, error);
    }
    if (out) writeFileSync(out, JSON.stringify({failures, rows}, null, 2) + '\n');
  }
} finally {
  await browser.close();
  rmSync(dir + 'lossy-blocks-parity.png', {force: true});
}
if (failures) console.error('GPU parity failures:', failures);
process.exit(failures ? 1 : 0);
