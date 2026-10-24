import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const chrome = opt('--chrome', undefined), out = opt('--out', null), flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7));
const [photo, quality = '90'] = args.filter(a => !a.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url)), name = 'cl' + extname(photo);
mkdirSync(dir, {recursive: true}); copyFileSync(photo, dir + name);
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const report = await browser.page.evaluate(async ({url, quality, bandBytes}) => {
  const ms = () => performance.now();
  const bitmap = await createImageBitmap(await (await fetch(url)).blob()), width = bitmap.width, height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  const {complete} = await import('/bits.mjs'), {photoXYBSteps} = await import('/photo-xyb.mjs');
  const {V6, GABORISH, prepareV6: prepare} = await import('/photo-v6.mjs'), {closedLoopStrategySteps, encodeStrategyImage} = await import('/varblocks.mjs');
  const {cpuMeasure} = await import('/photo-v6-search.mjs'), {GpuVarblockCosts} = await import('/gpu-varblocks.mjs');
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'}); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
  const errors = [];
  device.addEventListener('uncapturederror', e => errors.push(e.error.message.slice(0, 300)));
  const pr = prepare(rgba, width, height), measure = cpuMeasure(rgba, width, height);
  const base = complete(photoXYBSteps(rgba, width, height, quality, {...V6, ...GABORISH, pre: pr.pre, keepPlanes: true}));
  const gpu = await GpuVarblockCosts.create(device);
  if (bandBytes) gpu.bandBytes = bandBytes;
  const run = async useGpu => {
    const steps = closedLoopStrategySteps(base, width, height, {deadzone: V6.deadzone, lambda: 1}), cells = [];
    let certified = null;
    let step = steps.next(), varblockMs = 0, measureMs = 0, t;
    while (!step.done) {
      if (step.value?.measure) { t = ms(); const r = measure(step.value.measure, step.value.want); measureMs += ms() - t; cells.push(r.cells); step = steps.next(r); }
      else if (step.value?.varblocks) { t = ms(); const r = useGpu ? await gpu.request(step.value.varblocks) : undefined; varblockMs += ms() - t; if (step.value.varblocks.kind === 'exact') certified = r ? r.size : 0; step = steps.next(r); }
      else step = steps.next();
    }
    return {result: step.value, cells, varblockMs, measureMs, certified};
  };
  let t = ms(); const cpu = await run(false); const cpuTotal = ms() - t;
  t = ms(); let fromGpu; try { fromGpu = await run(true); } catch (e) { return {failed: e.stack}; } const gpuTotal = ms() - t;
  const cellAgreement = cpu.cells.map((c, i) => { const g = fromGpu.cells[i]; let worst = 0, sum = 0; for (let k = 0; k < c.length; k++) { const e = Math.abs(g[k] - c[k]) / Math.max(1e-9, Math.abs(c[k])); worst = Math.max(worst, e); sum += e; } return {mean: sum / c.length, worst}; });
  const key = l => new Set(l.map(b => b.id + ':' + b.bx + ':' + b.by)), a = key(cpu.result.layout);
  const same = fromGpu.result.layout.filter(b => a.has(b.id + ':' + b.bx + ':' + b.by)).length;
  return {adapter: {vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter},
    width, height, quality, cpu: {totalMs: Math.round(cpuTotal), measureMs: Math.round(cpu.measureMs)}, gpu: {totalMs: Math.round(gpuTotal), measureMs: Math.round(fromGpu.measureMs), varblockMs: Math.round(fromGpu.varblockMs)},
    cellAgreement, layout: {cpu: cpu.result.layout.length, gpu: fromGpu.result.layout.length, sameBlocks: same, certified: fromGpu.certified},
    sameCoefficients: cpu.result.image.strategyData.blocks.every((b, i) => { const g = fromGpu.result.image.strategyData.blocks[i]; return g && [0, 1, 2].every(c => b.coeffs[c].every((v, k) => v === g.coeffs[c][k]) && b.dc[c].every((v, k) => v === g.dc[c][k])); }),
    counts: {cpu: cpu.result.counts, gpu: fromGpu.result.counts},
    bytes: {cpu: encodeStrategyImage(cpu.result.image).length, gpu: encodeStrategyImage(fromGpu.result.image).length}, errors};
}, {url: '/gpu-search/bench/.data/' + name, quality: Number(quality), bandBytes: Number(process.env.BAND_BYTES) || 0});
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
await browser.close();
rmSync(dir + name);
