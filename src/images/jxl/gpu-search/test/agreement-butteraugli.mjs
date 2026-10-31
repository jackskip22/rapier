import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {linearFromRGBA} from '../ssimulacra2.mjs';
import {butteraugli, butteraugliReference} from '../butteraugli.mjs';
import {openBrowser} from './browser.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [refPath, ...others] = process.argv.slice(2);
const ref = readPng(readFileSync(refPath)), {width, height} = ref, n = width * height;
const {page, adapter, close} = await openBrowser();
console.log(JSON.stringify({adapter}));
await page.evaluate(async ({width, height, ref}) => {
  const {GpuButteraugli} = await import('/gpu-search/gpu-butteraugli.mjs');
  const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
  device.onuncapturederror = e => console.error('webgpu: ' + e.error.message);
  window.ba = await GpuButteraugli.create(device, width, height);
  window.ba.setReference(Uint8Array.from(atob(ref), c => c.charCodeAt(0)));
}, {width, height, ref: Buffer.from(ref.rgba).toString('base64')});
const jsRef = butteraugliReference(linearFromRGBA(ref.rgba, n), width, height);
for (const path of others) {
  const rgba = readPng(readFileSync(path)).rgba;
  const gpu = await page.evaluate(async b64 => { const r = await window.ba.score(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); return {score: r.score, pnorm3: r.pnorm3}; }, Buffer.from(rgba).toString('base64'));
  const js = butteraugli(jsRef, linearFromRGBA(rgba, n));
  const out = execFileSync(join(tools, 'butteraugli_main'), [refPath, path, '--pnorm', '3']).toString();
  const tool = Number(out.split('\n')[0]), tool3 = Number(/3-norm: ([\d.]+)/.exec(out)[1]);
  console.log(JSON.stringify({path, max: {gpu: +gpu.score.toFixed(5), js: +js.score.toFixed(5), tool}, pnorm3: {gpu: +gpu.pnorm3.toFixed(5), js: +js.pnorm3.toFixed(5), tool: tool3}}));
}
await close();
