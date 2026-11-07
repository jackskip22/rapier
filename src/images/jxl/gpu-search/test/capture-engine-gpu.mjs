// SPDX-License-Identifier: MIT
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url';
const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const chrome = option('--chrome', process.env.CHROME || process.env.RAPIER_CHROME), allowFallback = args.includes('--allow-fallback'), timing = args.includes('--time');
const flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7)), root = fileURLToPath(new URL('../../', import.meta.url));
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, {'content-type': 'text/html'}); return res.end('<!doctype html><title>e</title>'); }
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'}); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const {chromium} = createRequire(path.join(process.env.PLAYWRIGHT_ROOT || '/opt/node-tools/node_modules', 'x'))('playwright');
const browser = await chromium.launch({executablePath: chrome, args: flags.length ? flags : ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan']});
const page = await browser.newPage();
page.on('console', m => console.error('[page]', m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const result = await page.evaluate(async ({allowFallback, timing}) => {
  const gpu = navigator.gpu, request = gpu.requestAdapter.bind(gpu);
  let real = null;
  for (let i = 0; i < 20 && !real; i++) { real = await request(); if (!real) await new Promise(r => setTimeout(r, 250)); }
  if (!real || real.info.isFallbackAdapter && !allowFallback) return {error: 'no hardware adapter'};
  let graph = 0;
  const {gpuDevice} = await import('/gpu-device.mjs');
  const realm = async wrap => {
    const before = await gpuDevice();
    if (before) { before.destroy(); await before.lost; }
    Object.defineProperty(gpu, 'requestAdapter', {configurable: true, value: async () => {
      const adapter = await request();
      return {info: {isFallbackAdapter: false}, limits: adapter.limits, requestDevice: async d => wrap(await adapter.requestDevice(d))};
    }});
    graph++;
    const engine = await import(`/gpu-capture.mjs?g=${graph}`), learner = await import(`/gpu-capture-tally.mjs?g=${graph}`), {captureTally, captureFeatures, CAPTURE_PROPERTIES, CAPTURE_CUTS} = await import('/capture-tally.mjs'), kernels = await import('/capture-kernels.mjs');
    await kernels.compileCaptureKernels();
    return {captureEngine: webgpu => engine.captureEngine(webgpu, [engine.WEIGHTED, learner.FEATURES, learner.TALLY]), captureTally, captureFeatures, CAPTURE_PROPERTIES, CAPTURE_CUTS, captureWeighted: kernels.captureWeighted};
  };
  let s = 11; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const planes = [[256, 256, 510], [100, 37, 65535], [3, 300, 80]].map(([width, height, range]) => ({width, height, plane: Int16Array.from({length: width * height}, () => Math.round((rnd() - 0.5) * range))}));
  const n = 70000, props = 4, tally = {kind: 'tally', n, props, bins: 32, preds: 4, toks: 64, slots: 16, bin: Uint8Array.from({length: n * props}, () => rnd() * 33), tok: Uint32Array.from({length: n}, () => rnd() * 2 ** 24 >>> 0), node: Uint16Array.from({length: n}, () => rnd() < 0.05 ? 0xffff : rnd() * 17)};
  const out = {};
  {
    const m = await realm(d => d), engine = await m.captureEngine();
    const w = await engine({kind: 'weighted', planes}), t = await engine(tally), twin = m.captureTally(tally);
    let wrong = 0;
    planes.forEach((p, k) => { const n = p.width * p.height, r = new Uint32Array(n), q = new Int32Array(n); m.captureWeighted(null, null, p.plane, p.width, p.height, 0, undefined, r, q); for (let i = 0; i < n; i++) if (r[i] !== w[k].residuals[i] || q[i] !== w[k].properties[i]) wrong++; });
    for (let i = 0; i < twin.length; i++) if (twin[i] !== t[i]) wrong++;
    const f = {kind: 'features', ...planes[0], wpRes: w[0].residuals, wpProp: w[0].properties, cuts: Int32Array.from({length: m.CAPTURE_PROPERTIES.length * m.CAPTURE_CUTS}, (_, i) => (i % m.CAPTURE_CUTS - 15) * (1 + (i / m.CAPTURE_CUTS | 0)) * 9)};
    const fa = await engine(f), ft = m.captureFeatures(f);
    for (let i = 0; i < ft.bin.length; i++) if (ft.bin[i] !== fa.bin[i]) wrong++;
    for (let i = 0; i < ft.tok.length; i++) if (ft.tok[i] !== fa.tok[i]) wrong++;
    out.sound = {engine: !!engine, wrong, featureBins: ft.bin.length};
  }
  {
    const m = await realm(d => new Proxy(d, {get: (t, k) => k === 'createShaderModule' ? desc => t.createShaderModule({...desc, code: desc.code.replace('if (b >= p.bins) { return; }', 'if (b >= p.bins || i == 7u) { return; }')}) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]}));
    let required = null;
    try { await m.captureEngine('required'); } catch (error) { required = error.code; }
    out.selfTest = {engine: await m.captureEngine(), required};
  }
  {
    let corrupt = false;
    const m = await realm(d => new Proxy(d, {get: (t, k) => k === 'createBuffer' ? desc => { const b = t.createBuffer(desc); if (desc.usage & GPUBufferUsage.MAP_READ) { const read = b.getMappedRange.bind(b); b.getMappedRange = (...a) => { const r = read(...a); if (corrupt) new Uint32Array(r)[1] ^= 1; return r; }; } return b; } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]}));
    const engine = await m.captureEngine();
    corrupt = true;
    const wrong = await engine({kind: 'weighted', planes: planes.slice(0, 1)});
    corrupt = false;
    out.audit = {engine: !!engine, wrongAnswer: wrong, after: await engine(tally), again: await m.captureEngine()};
  }
  if (timing) {
    const m = await realm(d => d), engine = await m.captureEngine(), W = 1024, n = W * W;
    const p = {width: W, height: W, plane: Int16Array.from({length: n}, (_, i) => Math.round(80 * Math.sin(i % W / 13) * Math.cos((i / W | 0) / 9) + (rnd() - 0.5) * 40))};
    const cutsF = Int32Array.from({length: m.CAPTURE_PROPERTIES.length * m.CAPTURE_CUTS}, (_, i) => (i % m.CAPTURE_CUTS - 15) * 6);
    const median = async f => { await f(); const t = []; for (let r = 0; r < 3; r++) { const s = performance.now(); await f(); t.push(performance.now() - s); } return Math.round(t.sort((a, b) => a - b)[1]); };
    const w = (await engine({kind: 'weighted', planes: [p]}))[0], f = {kind: 'features', ...p, wpRes: w.residuals, wpProp: w.properties, cuts: cutsF}, feats = m.captureFeatures(f);
    const tally = {kind: 'tally', n, props: 10, bins: 32, preds: 4, toks: 64, slots: 64, bin: feats.bin, tok: feats.tok, node: Uint16Array.from({length: n}, () => rnd() * 64)};
    out.time = {samples: n,
      weighted: {device: await median(() => engine({kind: 'weighted', planes: [p]})), cpu: await median(() => { const r = new Uint32Array(n), q = new Int32Array(n); m.captureWeighted(null, null, p.plane, W, W, 0, undefined, r, q); })},
      features: {device: await median(() => engine(f)), cpu: await median(() => m.captureFeatures(f))},
      tally: {device: await median(() => engine(tally)), cpu: await median(() => m.captureTally(tally))}};
  }
  return out;
}, {allowFallback, timing});
await browser.close(); server.close();
console.log(JSON.stringify(result, (k, v) => typeof v === 'function' ? 'engine' : v?.residuals ? 'answer' : v).slice(0, 2000));
if (process.env.OUT) fs.writeFileSync(path.join(process.env.OUT, 'engine.json'), JSON.stringify(result, (k, v) => typeof v === 'function' ? 'engine' : v?.residuals ? 'answer' : v, 1));
const pass = !result.error && result.sound.engine && result.sound.wrong === 0 && result.selfTest.engine === null && result.selfTest.required === 'JXL_WEBGPU' &&
  result.audit.engine && result.audit.wrongAnswer === null && result.audit.after === null && result.audit.again === null;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
