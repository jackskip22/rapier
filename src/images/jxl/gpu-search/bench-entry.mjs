// SPDX-License-Identifier: MIT
import {encodeWithField} from './search.mjs';
import {SETTINGS} from './settings.mjs';
import {encodeToScore} from './encode-to-score.mjs';
import {gpuMeasure, browserDecoder} from './gpu-measure.mjs';
import {GpuNativeSsimulacra2} from '../gpu-ssimulacra2-native.mjs';
import {GpuButteraugli} from './gpu-butteraugli.mjs';
import {ssimulacra2, linearFromRGBA} from './ssimulacra2.mjs';
import {butteraugli, butteraugliReference} from './butteraugli.mjs';

const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];

export async function readPhoto(blob, maxPixels = 4e6) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
  const width = Math.max(8, Math.round(bitmap.width * scale)), height = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(bitmap, 0, 0, width, height);
  const original = {width: bitmap.width, height: bitmap.height};
  bitmap.close();
  return {width, height, original, rgba: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer)};
}

export async function benchPhoto(blob, {targets = [{ssimulacra2: 80}, {butteraugli3: 1.0}], settings = ['v6tuned2', 'v6tuned3', 'v6tuned4'], effort = 7,
  maxPixels = 4e6, cpuSearch = false, repeats = 3, onProgress = () => {}} = {}) {
  const photo = await readPhoto(blob, maxPixels), {width, height, rgba} = photo, n = width * height;
  const adapter = await navigator.gpu?.requestAdapter();
  const report = {userAgent: navigator.userAgent, width, height, original: photo.original, effort, settings,
    adapter: adapter ? {vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description,
      software: adapter.info.isFallbackAdapter, features: [...adapter.features].sort()} : null, metrics: {}, searches: []};
  if (!adapter) return {...report, error: 'This browser offers no WebGPU adapter.'};
  const device = await adapter.requestDevice();
  const decode = await browserDecoder(width, height);

  onProgress('metrics');
  const {tune, ...extra} = SETTINGS.v6;
  const t0 = performance.now(), {bytes} = encodeWithField(rgba, width, height, 85, null, effort, tune, extra);
  report.encodeMs = performance.now() - t0; report.encodeBytes = bytes.length;
  const decoded = await decode(bytes);
  const time = async fn => { const runs = []; let value; for (let i = 0; i < repeats; i++) { const s = performance.now(); value = await fn(); runs.push(performance.now() - s); } return {value, ms: median(runs), first: runs[0]}; };
  const ref = linearFromRGBA(rgba, n);
  const cpuS2 = await time(() => ssimulacra2(ref, linearFromRGBA(decoded, n), width, height).score);
  const baRef = butteraugliReference(ref, width, height);
  const cpuBa = await time(() => butteraugli(baRef, linearFromRGBA(decoded, n)));
  const setupStart = performance.now();
  const gs2 = await GpuNativeSsimulacra2.create(device, rgba, width, height), gba = await GpuButteraugli.create(device, width, height);
  if (!gs2) throw new Error('This device cannot hold the SSIMULACRA2 scorer.');
  gba.setReference(rgba);
  const setupMs = performance.now() - setupStart;
  const gpuS2 = await time(async () => {
    const view = decoded.subarray(0, width * height * 4);
    gs2.device.queue.writeBuffer(gs2.dist, 0, new Uint32Array(Uint8Array.from(view).buffer));
    return (await gs2.score()).score;
  });
  const gpuBa = await time(() => gba.score(decoded));
  report.metrics = {
    ssimulacra2: {cpu: {score: cpuS2.value, ms: cpuS2.ms}, gpu: {score: gpuS2.value, ms: gpuS2.ms, firstMs: gpuS2.first}},
    butteraugli: {cpu: {score: cpuBa.value.score, pnorm3: cpuBa.value.pnorm3, ms: cpuBa.ms},
      gpu: {score: gpuBa.value.score, pnorm3: gpuBa.value.pnorm3, ms: gpuBa.ms, firstMs: gpuBa.first}},
    gpuSetupMs: setupMs,
  };
  gs2.destroy(); gba.destroy();

  for (const target of targets) {
    onProgress('search ' + JSON.stringify(target));
    const measure = await gpuMeasure(device, rgba, width, height, target, decode);
    const s = performance.now(), result = await encodeToScore(rgba, width, height, {target, measure, settings, effort});
    const row = {target, gpu: {ms: performance.now() - s, setting: result.setting, quality: result.quality, bytes: result.size,
      ssimulacra2: result.ssimulacra2, butteraugli3: result.butteraugli3, butteraugli: result.butteraugli, probes: result.probes.length}};
    measure.destroy();
    if (cpuSearch) {
      const cpuMeasureFn = async b => {
        const lin = linearFromRGBA(await decode(b), n), out = {};
        if (target.ssimulacra2 !== undefined) out.ssimulacra2 = ssimulacra2(ref, lin, width, height).score;
        if (target.butteraugli3 !== undefined || target.butteraugli !== undefined) { const r = butteraugli(baRef, lin); out.butteraugli = r.score; out.butteraugli3 = r.pnorm3; }
        return out;
      };
      const c = performance.now(), r = await encodeToScore(rgba, width, height, {target, measure: cpuMeasureFn, settings, effort});
      row.cpu = {ms: performance.now() - c, setting: r.setting, quality: r.quality, bytes: r.size, probes: r.probes.length};
    }
    report.searches.push(row);
  }
  device.destroy();
  return report;
}
