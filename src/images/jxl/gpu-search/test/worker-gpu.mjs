import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openBrowser} from './browser.mjs';
import {buildRapierWorker} from '../../../../tools/jxl-bundle.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const chrome = opt('--chrome', undefined), out = opt('--out', null), given = opt('--worker', null), scale = Number(opt('--scale', '1'));
const qualities = opt('--qualities', '75,90').split(',').map(Number), efforts = opt('--efforts', '7').split(',').map(Number);
const flags = args.filter(a => a.startsWith('--flag=')).map(a => a.slice(7)), photos = args.filter(a => !a.startsWith('--'));
const jxl = fileURLToPath(new URL('../../', import.meta.url)), dir = jxl + 'gpu-search/bench/.data/';
mkdirSync(dir, {recursive: true});
const worker = given ? readFileSync(given, 'utf8') : (await buildRapierWorker(jxl, {still: true, inline: ['gpu-core']})).bytes.toString('utf8');
writeFileSync(dir + 'wg-worker.js', worker);
const workerSha = createHash('sha256').update(worker).digest('hex');
console.log('worker sha256 ' + workerSha);
const browser = await openBrowser({chrome, flags: flags.length ? flags : undefined});
const rows = [];
let failed = 0;
for (const png of photos) {
  copyFileSync(png, dir + 'wg.png');
  const r = await browser.page.evaluate(async ({url, workerUrl, qualities, efforts, scale}) => {
    const bitmap = await createImageBitmap(await (await fetch(url, {cache: 'no-store'})).blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
    const width = bitmap.width * scale, height = bitmap.height * scale, canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, width, height);
    const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
    const prelude = `{const p=GPUComputePassEncoder.prototype,d=p.dispatchWorkgroups;self.__pipelines=0;
p.dispatchWorkgroups=function(...x){self.__pipelines++;return d.apply(this,x)};
const post=self.postMessage.bind(self);self.postMessage=(m,t)=>post(m&&typeof m==='object'&&'id' in m?{...m,pipelines:self.__pipelines}:m,t);}\n`;
    const source = prelude + await (await fetch(workerUrl, {cache: 'no-store'})).text();
    const w = new Worker(URL.createObjectURL(new Blob([source], {type: 'text/javascript'})));
    let next = 1;
    const call = options => new Promise((resolve, reject) => {
      const id = next++, data = rgba.slice(), t = performance.now();
      w.onmessage = ({data: m}) => { if (m.id !== id || m.progress !== undefined) return; m.ok ? resolve({bytes: m.bytes, pipelines: m.pipelines, ms: performance.now() - t}) : reject(new Error(m.error?.code + ' ' + m.error?.message)); };
      w.postMessage({id, operation: 'encode', width, height, data, options}, [data.buffer]);
    });
    const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
    const out = [];
    for (const effort of efforts) for (const quality of qualities) {
      const o = {quality, effort, photo: true, parallel: false};
      const cpu = await call({...o, gpu: false}), before = cpu.pipelines;
      const gpu = await call(o);
      out.push({effort, quality, same: (await hash(cpu.bytes)) === (await hash(gpu.bytes)), bytes: cpu.bytes.length,
        gpuDispatches: gpu.pipelines - before, cpuMs: Math.round(cpu.ms), gpuMs: Math.round(gpu.ms)});
    }
    w.terminate();
    return {width, height, rows: out};
  }, {url: '/gpu-search/bench/.data/wg.png', workerUrl: '/gpu-search/bench/.data/wg-worker.js', qualities, efforts, scale});
  for (const row of r.rows) {
    const ok = row.same && row.gpuDispatches > 0;
    if (!ok) failed++;
    console.log(`${ok ? 'same' : 'FAIL'} ${basename(png)} ${r.width}x${r.height} e${row.effort} q${row.quality}: ${row.same ? 'same file' : 'FILE DIFFERS'} (${row.bytes}); GPU dispatches ${row.gpuDispatches}; cpu ${row.cpuMs} ms, gpu ${row.gpuMs} ms`);
  }
  rows.push({photo: basename(png), worker: given ? basename(given) : 'built, gpu-core inlined', workerSha, ...r});
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
}
await browser.close();
rmSync(dir + 'wg.png', {force: true}); rmSync(dir + 'wg-worker.js', {force: true});
process.exit(failed ? 1 : 0);
