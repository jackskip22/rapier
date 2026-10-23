import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {decoder} from '../../public/test/decoder.mjs';
import {encodeToScore, cpuMeasure} from '../encode-to-score.mjs';
import {openBrowser} from './browser.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [png, targetJson, settingsText = 'v6,plain', effortText = '7'] = process.argv.slice(2);
const target = JSON.parse(targetJson), settings = settingsText.split(','), effort = Number(effortText);
const {width, height, rgba} = readPng(readFileSync(png)), n = width * height, work = mkdtempSync(join(tmpdir(), 'e2s-'));
const oxide = await decoder();
const rgbaOf = d => { if (d.channels === 4) return d.data; const o = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) o[i * 4 + c] = d.data[i * d.channels + c]; o[i * 4 + 3] = 255; } return o; };

function check(bytes, name) {
  const file = join(work, name + '.jxl'); writeFileSync(file, bytes);
  execFileSync(join(tools, 'djxl'), [file, join(work, name + '.png')], {stdio: 'ignore'});
  const decodedOxide = oxide(bytes);
  const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString());
  const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
  return {bytes: bytes.length, djxl: 'decoded', jxlOxide: decodedOxide.width === width && decodedOxide.height === height ? 'decoded' : 'size mismatch',
    tool: {ssimulacra2: s, butteraugli: Number(b.split('\n')[0]), butteraugli3: Number(/3-norm: ([\d.]+)/.exec(b)[1])}};
}

const t0 = performance.now();
const cpu = await encodeToScore(rgba, width, height, {target, settings, effort, measure: cpuMeasure(rgba, width, height, async b => rgbaOf(oxide(b)), target)});
const cpuMs = performance.now() - t0;
const {page, adapter, close} = await openBrowser();
const gpu = await page.evaluate(async ({width, height, rgba, target, settings, effort}) => {
  const {encodeToScore} = await import('/gpu-search/encode-to-score.mjs');
  const {gpuMeasure} = await import('/gpu-search/gpu-measure.mjs');
  const pixels = Uint8Array.from(atob(rgba), c => c.charCodeAt(0));
  const device = await (await navigator.gpu.requestAdapter()).requestDevice();
  device.onuncapturederror = e => console.error('webgpu: ' + e.error.message);
  const t0 = performance.now(), measure = await gpuMeasure(device, pixels, width, height, target);
  const result = await encodeToScore(pixels, width, height, {target, settings, effort, measure});
  const ms = performance.now() - t0;
  let s = ''; for (const b of result.bytes) s += String.fromCharCode(b);
  return {...result, bytes: btoa(s), ms};
}, {width, height, rgba: Buffer.from(rgba).toString('base64'), target, settings, effort});
await close();
const strip = r => ({setting: r.setting, quality: r.quality, ssimulacra2: r.ssimulacra2, butteraugli3: r.butteraugli3, butteraugli: r.butteraugli, probes: r.probes.length});
console.log(JSON.stringify({png, target, adapter,
  cpu: {...strip(cpu), ms: Math.round(cpuMs), ...check(cpu.bytes, 'cpu')},
  gpu: {...strip(gpu), ms: Math.round(gpu.ms), ...check(Buffer.from(gpu.bytes, 'base64'), 'gpu')}}, null, 1));
