// the seams. node gpu-search/test/gpu-measure.mjs <png> [quality]; RAPIER_CHROME, PLAYWRIGHT_ROOT as browser.mjs.
import {readFileSync} from 'node:fs';
import {readPng} from '../../public/bench/image-io.mjs';
import {openBrowser} from './browser.mjs';

const [png, q = '85'] = process.argv.slice(2), {width, height, rgba} = readPng(readFileSync(png)), tile = Number(process.env.TILE || 256);
const flags = process.env.GPU_FLAGS ? process.env.GPU_FLAGS.split(' ') : undefined;
const browser = await openBrowser({flags});
console.log(JSON.stringify({adapter: browser.adapter}));
const rows = await browser.page.evaluate(async ({data, width, height, quality, tile}) => {
  const rgba = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const {prepareV6, V6, GABORISH} = await import('/photo-v6.mjs'), {cpuMeasure} = await import('/photo-v6-search.mjs');
  const {complete} = await import('/bits.mjs'), {photoXYBSteps} = await import('/photo-xyb.mjs'), {xybStrategies} = await import('/varblocks.mjs');
  const {GpuMeasure} = await import('/gpu-reconstruct.mjs');
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter(); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  const device = await adapter.requestDevice({requiredLimits: {maxStorageBuffersPerShaderStage: Math.min(10, adapter.limits.maxStorageBuffersPerShaderStage),
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
  device.addEventListener('uncapturederror', e => console.error('GPU: ' + e.error.message.slice(0, 600)));
  const pr = prepareV6(rgba, width, height), cpu = cpuMeasure(rgba, width, height);
  let t = performance.now(); const gpu = await GpuMeasure.create(device, rgba, width, height, {tile}); const setup = performance.now() - t;
  const field = Float64Array.from({length: Math.ceil(width / 8) * Math.ceil(height / 8)}, (_, i) => [0.7, 1, 1.4][(i * 7) % 3]);
  const base = {...V6, ...GABORISH, pre: pr.pre};
  const cases = [['dct8 gab', complete(photoXYBSteps(rgba, width, height, quality, base))],
    ['dct8 gab field', complete(photoXYBSteps(rgba, width, height, quality, {...base, fieldScale: field}))],
    ['plain', complete(photoXYBSteps(rgba, width, height, quality, V6))]];
  const keep = complete(photoXYBSteps(rgba, width, height, quality, {...base, fieldScale: field, keepPlanes: true}));
  for (const id of [0, 4, 5, 10, 11, 18, 19, 20]) cases.push(['force ' + id, xybStrategies(keep, width, height, {deadzone: V6.deadzone, force: id}).image]);
  const out = [];
  for (const [name, image] of cases) {
    t = performance.now(); const c = cpu(image); const cpuMs = performance.now() - t;
    t = performance.now(); const g = await gpu.measure(image); const gpuMs = performance.now() - t;
    const cs = c.cells, bd = c.blocks;
    let dc = 0, db = 0; for (let k = 0; k < cs.length; k++) { dc = Math.max(dc, Math.abs(cs[k] - g.cells[k]) / Math.max(1e-3, cs[k])); db = Math.max(db, Math.abs(bd[k] - g.blocks[k]) / Math.max(1e-3, bd[k])); }
    out.push({name, cpu: [c.butteraugli, c.butteraugli3], gpu: [g.butteraugli, g.butteraugli3], cellRel: dc, blockRel: db, cpuMs: Math.round(cpuMs), gpuMs: Math.round(gpuMs)});
  }
  return {setup: Math.round(setup), out};
}, {data: Buffer.from(rgba).toString('base64'), width, height, quality: Number(q), tile});
let failed = 0;
for (const r of rows.out) {
  const ok = Math.abs(r.cpu[1] - r.gpu[1]) / r.cpu[1] < 1e-3 && Math.abs(r.cpu[0] - r.gpu[0]) / r.cpu[0] < 1e-2 && r.cellRel < 0.02 && r.blockRel < 0.02;
  if (!ok) failed++;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + r.name.padEnd(16) + ` ba3 cpu ${r.cpu[1].toFixed(5)} gpu ${r.gpu[1].toFixed(5)}  max ${r.cpu[0].toFixed(4)}/${r.gpu[0].toFixed(4)}  cells ${r.cellRel.toExponential(1)} blocks ${r.blockRel.toExponential(1)}  ${r.cpuMs}/${r.gpuMs} ms`);
}
console.log('setup', rows.setup, 'ms');
await browser.close();
process.exit(failed ? 1 : 0);
