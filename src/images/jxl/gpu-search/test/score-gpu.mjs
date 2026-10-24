import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';
import {openBrowser} from './browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const chrome = opt('--chrome', undefined), out = opt('--out', null), candidates = opt('--candidates', 'gaborish,field,closed').split(',');
const flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7)), [photo, target = '{"butteraugli3":0.9}'] = args.filter(a => !a.startsWith('--'));
const dir = fileURLToPath(new URL('../bench/.data/', import.meta.url)), name = 'sg' + extname(photo);
mkdirSync(dir, {recursive: true}); copyFileSync(photo, dir + name);
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const report = await browser.page.evaluate(async ({url, target, candidates}) => {
  const ms = () => performance.now();
  const bitmap = await createImageBitmap(await (await fetch(url)).blob()), width = bitmap.width, height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  const {prepareV6, scoreSteps, cpuMeasure, runAsync} = await import('/photo-v6-search.mjs'), {GpuVarblockCosts} = await import('/gpu-varblocks.mjs');
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'}); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
  const errors = [], requests = {};
  device.addEventListener('uncapturederror', e => errors.push(e.error.message.slice(0, 300)));
  const cpu = cpuMeasure(rgba, width, height), gpu = await GpuVarblockCosts.create(device);
  const run = async useGpu => {
    const measure = async (image, want) => cpu(image, want);
    if (useGpu) measure.varblocks = r => { requests[r.kind] = (requests[r.kind] || 0) + 1; return gpu.request(r); };
    const t = ms(), r = await runAsync(scoreSteps(prepareV6(rgba, width, height), target, {candidates}), measure);
    return {ms: Math.round(ms() - t), candidate: r.candidate, quality: r.quality, size: r.size, bytes: Array.from(r.bytes.slice(0, 0)), hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', r.bytes))).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''),
      tried: r.tried.map(({candidate, quality, size, butteraugli3}) => ({candidate, quality, size, butteraugli3}))};
  };
  const cpuRun = await run(false), gpuRun = await run(true);
  return {adapter: {vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description},
    width, height, target, candidates, cpu: cpuRun, gpu: gpuRun, identical: cpuRun.hash === gpuRun.hash, requests, errors};
}, {url: '/gpu-search/bench/.data/' + name, target: JSON.parse(target), candidates});
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
await browser.close();
rmSync(dir + name);
