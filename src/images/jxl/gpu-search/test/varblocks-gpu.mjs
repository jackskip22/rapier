import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const chrome = opt('--chrome', undefined), out = opt('--out', null), flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7));
const [photo, quality = '90'] = args.filter(a => !a.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url)), name = 'vb' + extname(photo);
mkdirSync(dir, {recursive: true}); copyFileSync(photo, dir + name);
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const report = await browser.page.evaluate(async ({url, quality}) => {
  const ms = () => performance.now();
  const bitmap = await createImageBitmap(await (await fetch(url)).blob()), width = bitmap.width, height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  const {complete} = await import('/bits.mjs'), {photoXYBSteps} = await import('/photo-xyb.mjs');
  const {V6, GABORISH, prepareV6: prepare} = await import('/photo-v6.mjs'), {xybStrategies, encodeStrategyImage} = await import('/varblocks.mjs');
  const {GpuVarblockCosts} = await import('/gpu-varblocks.mjs');
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'}); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
  const errors = [];
  device.addEventListener('uncapturederror', e => errors.push(e.error.message.slice(0, 300)));
  const pr = prepare(rgba, width, height);
  const base = complete(photoXYBSteps(rgba, width, height, quality, {...V6, ...GABORISH, pre: pr.pre, keepPlanes: true}));
  const options = {deadzone: V6.deadzone};
  let t = ms(); const cpuRates = new Map(); const cpu = xybStrategies(base, width, height, {...options, rates: cpuRates}); const cpuMs = ms() - t;
  const gpu = await GpuVarblockCosts.create(device);
  await gpu.costs(base, width, height, options);
  t = ms(); const costs = await gpu.costs(base, width, height, options); const gpuPriceMs = ms() - t;
  t = ms(); const fromGpu = xybStrategies(base, width, height, {...options, costs}); const gpuChooseMs = ms() - t;
  const rate = {};
  for (const [id, r] of cpuRates) {
    const g = costs.get(id)?.R;
    if (!g) continue;
    let n = 0, worst = 0, sum = 0;
    for (let i = 0; i < r.length; i++) if (r[i]) { n++; const e = Math.abs(g[i] - r[i]) / Math.max(1, r[i]); sum += e; worst = Math.max(worst, e); }
    rate[id] = {positions: n, meanRelative: sum / n, worstRelative: worst};
  }
  const key = l => l.map(b => b.id + ':' + b.bx + ':' + b.by).sort().join(','), a = new Set(cpu.layout.map(b => b.id + ':' + b.bx + ':' + b.by));
  const same = fromGpu.layout.filter(b => a.has(b.id + ':' + b.bx + ':' + b.by)).length;
  const cpuBytes = encodeStrategyImage(cpu.image).length, gpuBytes = encodeStrategyImage(fromGpu.image).length;
  return {adapter: {vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter},
    width, height, quality, cpuMs: Math.round(cpuMs), gpuPriceMs: Math.round(gpuPriceMs), gpuChooseMs: Math.round(gpuChooseMs),
    rate, layout: {cpu: cpu.layout.length, gpu: fromGpu.layout.length, sameBlocks: same, identical: key(cpu.layout) === key(fromGpu.layout)},
    counts: {cpu: cpu.counts, gpu: fromGpu.counts}, bytes: {cpu: cpuBytes, gpu: gpuBytes}, errors};
}, {url: '/gpu-search/bench/.data/' + name, quality: Number(quality)});
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
await browser.close();
rmSync(dir + name);
