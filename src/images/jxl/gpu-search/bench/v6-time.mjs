import {copyFileSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {basename, extname} from 'node:path';
import {openBrowser} from '../test/browser.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const target = JSON.parse(opt('--target', '{"butteraugli3":1}')), candidates = opt('--candidates', 'gaborish,closed').split(','), out = opt('--out', null);
const efforts = opt('--efforts', null), quality = Number(opt('--quality', '90'));
const chrome = opt('--chrome', undefined), cpu = args.includes('--cpu'), varblocksOnGpu = !args.includes('--cpu-varblocks'), flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7));
const photo = args.find(a => !a.startsWith('--'));
const dir = fileURLToPath(new URL('./.data/', import.meta.url)), name = 'photo' + extname(photo);
mkdirSync(dir, {recursive: true}); copyFileSync(photo, dir + name);
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
if (efforts) {
  const rows = await browser.page.evaluate(async ({url, efforts, quality}) => {
    const blob = await (await fetch(url)).blob(), bitmap = await createImageBitmap(blob);
    const width = bitmap.width, height = bitmap.height, canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
    const {createStillEncoder} = await import('/rapier-still.mjs'), encoder = createStillEncoder(), out = [];
    for (const effort of efforts) {
      const t = performance.now(), bytes = await encoder.encode(rgba, width, height, {quality, effort, photo: true});
      out.push({effort, quality, width, height, bytes: bytes.length, ms: Math.round(performance.now() - t)});
    }
    const a = await navigator.gpu?.requestAdapter();
    return {adapter: a && {vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description}, rows: out};
  }, {url: '/gpu-search/bench/.data/' + name, efforts: efforts.split(',').map(Number), quality});
  console.log(JSON.stringify(rows, null, 1));
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
  await browser.close(); rmSync(dir, {recursive: true}); process.exit(0);
}
const report = await browser.page.evaluate(async ({url, target, candidates, cpu, varblocksOnGpu}) => {
  const ms = () => performance.now(), T = {};
  const add = (k, v) => { T[k] = (T[k] || 0) + v; };
  const blob = await (await fetch(url)).blob(), bitmap = await createImageBitmap(blob);
  const width = bitmap.width, height = bitmap.height, canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
  const {prepareV6, scoreSteps, cpuMeasure} = await import('/photo-v6-search.mjs'), {GpuMeasure} = await import('/gpu-reconstruct.mjs'), {attachVarblocks} = await import('/gpu-varblocks.mjs');
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'}); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  const info = adapter.info, device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
  const errors = [];
  device.addEventListener('uncapturederror', e => errors.push(e.error.message.slice(0, 300)));
  const started = ms();
  let t = ms(); const pr = prepareV6(rgba, width, height); add('prepareV6 (Gaborish planes)', ms() - t);
  t = ms(); const gpu = await GpuMeasure.create(device, rgba, width, height); if (varblocksOnGpu) await attachVarblocks(gpu, device); add('GPU setup', ms() - t);
  const steps = scoreSteps(pr, target, {candidates});
  let step, reply, measures = 0, last = ms();
  while (!(step = steps.next(reply)).done) {
    add('CPU between measurements', ms() - last);
    if (step.value?.measure) { t = ms(); reply = await gpu.measure(step.value.measure, step.value.want); add('GPU measurements', ms() - t); measures++; }
    else if (step.value?.varblocks) { t = ms(); reply = await gpu.varblocks?.(step.value.varblocks); add('GPU varblocks', ms() - t); }
    else reply = undefined;
    last = ms();
  }
  add('CPU between measurements', ms() - last);
  const total = ms() - started, r = step.value;
  let cpuMeasureMs = null;
  if (cpu) { const m = cpuMeasure(rgba, width, height), img = r.candidate && null; t = ms(); m((await import('/photo-v6-search.mjs')).candidateImage(pr, 'gaborish', 90)); cpuMeasureMs = ms() - t; }
  return {adapter: {vendor: info.vendor, architecture: info.architecture, description: info.description, fallback: info.isFallbackAdapter},
    width, height, target, candidates, measures, totalMs: Math.round(total), phases: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])),
    perMeasureMs: Math.round(T['GPU measurements'] / measures), cpuMeasureMs: cpuMeasureMs && Math.round(cpuMeasureMs), errors: errors.slice(0, 5),
    result: {candidate: r.candidate, quality: r.quality, size: r.size, butteraugli3: r.butteraugli3, butteraugli: r.butteraugli, tried: r.tried}};
}, {url: '/gpu-search/bench/.data/' + name, target, candidates, cpu, varblocksOnGpu});
report.photo = basename(photo);
console.log(JSON.stringify(report, null, 1));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
await browser.close();
rmSync(dir, {recursive: true});
