import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir, availableParallelism} from 'node:os';
import {join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
if (isMainThread) {
  const [out, effort, ...files] = process.argv.slice(2), grid = (process.env.GRID || '40,50,60,70,75,80,85,88,90,92,94,96').split(',').map(Number);
  const pool = Array.from({length: Number(process.env.WORKERS || availableParallelism())}, () => new Worker(fileURLToPath(import.meta.url)));
  const queue = [], idle = [...pool], started = Date.now();
  const run = job => new Promise(resolve => { queue.push({job, resolve}); pump(); });
  function pump() { while (idle.length && queue.length) { const w = idle.pop(), {job, resolve} = queue.shift(); w.once('message', m => { idle.push(w); resolve(m); pump(); }); w.postMessage(job); } }
  const rows = files.map(png => ({image: basename(png), points: []})), jobs = [];
  for (const q of [...grid].sort((a, b) => b - a)) files.forEach((png, i) => jobs.push(run({png, q, effort: Number(effort)}).then(p => rows[i].points.push(p))));
  await Promise.all(jobs);
  for (const r of rows) r.points.sort((a, b) => a.setting - b.setting);
  writeFileSync(out, JSON.stringify({encoder: 'rapier6:' + effort, grid, rows}));
  console.error(((Date.now() - started) / 1000).toFixed(0) + ' s');
  for (const w of pool) w.terminate();
} else {
  const {readPng} = await import('../../public/bench/image-io.mjs'), {encode} = await import('../../effort.mjs');
  const work = mkdtempSync(join(tmpdir(), 'product-')), images = new Map();
  parentPort.on('message', ({png, q, effort}) => {
    if (!images.has(png)) images.set(png, readPng(readFileSync(png)));
    const {width, height, rgba} = images.get(png), file = join(work, 'c.jxl'), t = Date.now();
    const bytes = encode(rgba, width, height, {quality: q, effort}), ms = Date.now() - t;
    writeFileSync(file, bytes);
    const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString());
    const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
    parentPort.postMessage({setting: q, bytes: bytes.length, ms, ssimulacra2: s, butteraugli: Number(b.split('\n')[0]), ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])});
  });
}
