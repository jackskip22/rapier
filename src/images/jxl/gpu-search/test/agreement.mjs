import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {decoder} from '../../public/test/decoder.mjs';
import {ssimulacra2, linearFromRGBA} from '../ssimulacra2.mjs';
import {openBrowser} from './browser.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [refPath, ...others] = process.argv.slice(2);
const ref = readPng(readFileSync(refPath)), {width, height} = ref, n = width * height;
const dec = await decoder();
const rgbaOf = d => { if (d.channels === 4) return d.data; const o = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) o[i * 4 + c] = d.data[i * d.channels + c]; o[i * 4 + 3] = 255; } return o; };
const {page, adapter, close} = await openBrowser();
console.log(JSON.stringify({adapter}));
await page.evaluate(async ({width, height, ref}) => {
  const {GpuSsimulacra2} = await import('/gpu-search/gpu-ssimulacra2.mjs');
  const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
  device.onuncapturederror = e => console.error('webgpu: ' + e.error.message);
  window.metric = await GpuSsimulacra2.create(device, width, height);
  window.metric.setReference(Uint8Array.from(atob(ref), c => c.charCodeAt(0)));
}, {width, height, ref: Buffer.from(ref.rgba).toString('base64')});
const refLinear = linearFromRGBA(ref.rgba, n);
for (const path of others) {
  const rgba = path.endsWith('.jxl') ? rgbaOf(dec(readFileSync(path))) : readPng(readFileSync(path)).rgba;
  const gpu = await page.evaluate(async b64 => {
    const r = await window.metric.score(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), {wantMap: true});
    let sum = 0; for (const v of r.map) sum += v;
    return {score: r.score, sum: r.sum, mapSum: sum, map: Array.from(r.map.subarray(0, 0))};
  }, Buffer.from(rgba).toString('base64'));
  const js = ssimulacra2(refLinear, linearFromRGBA(rgba, n), width, height);
  const tool = path.endsWith('.jxl') ? null : Number(execFileSync(join(tools, 'ssimulacra2'), [refPath, path]).toString());
  console.log(JSON.stringify({path, gpu: +gpu.score.toFixed(5), js: +js.score.toFixed(5), tool, gpuMinusJs: +(gpu.score - js.score).toExponential(2),
    toolMinusJs: tool === null ? null : +(tool - js.score).toExponential(2), mapSumMinusSum: +(gpu.mapSum - gpu.sum).toExponential(2)}));
}
await close();
