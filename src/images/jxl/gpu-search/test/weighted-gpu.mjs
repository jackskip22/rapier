// SPDX-License-Identifier: MIT
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url';
import {readPng} from '../../public/bench/image-io.mjs';
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', process.env.CHROME || process.env.RAPIER_CHROME), out = option('--out', null), allowFallback = args.includes('--allow-fallback');
const flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7)), pngs = args.filter(a => !a.startsWith('--'));
const root = fileURLToPath(new URL('../../', import.meta.url)), pictures = pngs.map(p => ({name: path.basename(p), ...readPng(fs.readFileSync(p))}));
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]), m = /^\/pic\/(\d+)$/.exec(url);
  if (url === '/') { res.writeHead(200, {'content-type': 'text/html'}); return res.end('<!doctype html><title>w</title>'); }
  if (m) { res.writeHead(200, {'content-type': 'application/octet-stream'}); return res.end(pictures[+m[1]].rgba); }
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'}); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const {chromium} = createRequire(path.join(process.env.PLAYWRIGHT_ROOT || '/opt/node-tools/node_modules', 'x'))('playwright');
const browser = await chromium.launch({executablePath: chrome, args: flags.length ? flags : ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan']});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const result = await page.evaluate(async ({pics, allowFallback}) => {
  let adapter = null;
  for (let i = 0; i < 20 && !adapter; i++) { adapter = await navigator.gpu?.requestAdapter(); if (!adapter) await new Promise(r => setTimeout(r, 250)); }
  if (!adapter || adapter.info.isFallbackAdapter && !allowFallback) return {error: 'no hardware adapter'};
  const device = await adapter.requestDevice();
  const {weightedOnDevice} = await import('/gpu-weighted.mjs'), {codeWeighted} = await import('/weighted.mjs'), {compileCaptureKernels, captureWeighted} = await import('/capture-kernels.mjs');
  const wasm = await compileCaptureKernels();
  const reference = j => { const n = j.width * j.height, residuals = new Uint32Array(n), properties = new Int32Array(n); codeWeighted(null, null, j.plane, j.width, j.height, 0, undefined, residuals, properties); return {residuals, properties}; };
  const onWasm = j => { const n = j.width * j.height, residuals = new Uint32Array(n), properties = new Int32Array(n); captureWeighted(null, null, j.plane, j.width, j.height, 0, undefined, residuals, properties); return {residuals, properties}; };
  const differ = (a, b) => { let n = 0; for (let i = 0; i < a.residuals.length; i++) if (a.residuals[i] !== b.residuals[i] || a.properties[i] !== b.properties[i]) n++; return n; };
  let s = 7; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const random = (width, height, range) => ({width, height, plane: Int16Array.from({length: width * height}, () => Math.round((rnd() - 0.5) * range))});
  const smooth = (width, height) => ({width, height, plane: Int16Array.from({length: width * height}, (_, i) => Math.round(100 * Math.sin(i % width / 7) + 60 * Math.cos(Math.floor(i / width) / 5) + (rnd() - 0.5) * 6))});
  const edges = [random(1, 1, 500), random(7, 3, 500), random(3, 9, 500), random(256, 256, 510), random(256, 256, 65535), smooth(256, 256), smooth(255, 131), random(64, 300, 300), smooth(600, 40), random(2, 600, 100), random(1024, 1024, 510)];
  const got = await weightedOnDevice(device, edges, {passSamples: 1 << 20});
  const shapes = edges.map((j, k) => ({width: j.width, height: j.height, differ: differ(reference(j), got[k]) + (wasm ? differ(onWasm(j), got[k]) : 0)}));
  const rows = [], cold = [];
  for (let p = 0; p < pics.length; p++) {
    const {width, height} = pics[p], rgba = new Uint8Array(await (await fetch('/pic/' + p)).arrayBuffer()), jobs = [];
    for (let gy = 0; gy < height; gy += 256) for (let gx = 0; gx < width; gx += 256) {
      const w = Math.min(256, width - gx), h = Math.min(256, height - gy), planes = [0, 1, 2].map(() => new Int16Array(w * h));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((gy + y) * width + gx + x) * 4, g = rgba[i + 1]; planes[0][y * w + x] = g; planes[1][y * w + x] = rgba[i + 2] - g; planes[2][y * w + x] = rgba[i] - g; }
      for (const plane of planes) jobs.push({width: w, height: h, plane});
    }
    if (p === 0 || p === 1) {
      const first = jobs.slice(0, 48), t0 = performance.now(), fresh = await (await navigator.gpu.requestAdapter()).requestDevice(), t1 = performance.now();
      await weightedOnDevice(fresh, first);
      const t2 = performance.now(), cpuFirst = wasm ? first.map(onWasm) : first.map(reference), t3 = performance.now();
      cold.push({picture: pics[p].name, samples: first.reduce((n, j) => n + j.width * j.height, 0), adapterAndDeviceMs: Math.round(t1 - t0), firstCallMs: Math.round(t2 - t1), cpuMs: Math.round(t3 - t2)});
      fresh.destroy();
    }
    const times = [];
    let device1;
    for (let r = 0; r < 4; r++) { const t = performance.now(); device1 = await weightedOnDevice(device, jobs); times.push(Math.round(performance.now() - t)); }
    const t = performance.now(), cpu = wasm ? jobs.map(onWasm) : jobs.map(reference), cpuMs = Math.round(performance.now() - t);
    rows.push({picture: pics[p].name, width, height, planes: jobs.length, differ: jobs.reduce((n, j, k) => n + differ(cpu[k], device1[k]), 0), deviceMs: times, cpuMs, cpu: wasm ? 'WebAssembly' : 'JavaScript'});
  }
  return {adapter: {vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter}, shapes, rows, cold};
}, {pics: pictures.map(p => ({name: p.name, width: p.width, height: p.height})), allowFallback});
await browser.close(); server.close();
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
const failed = result.error || result.shapes.some(s => s.differ) || result.rows.some(r => r.differ);
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
