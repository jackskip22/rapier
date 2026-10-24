import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {readFileSync, writeFileSync, mkdtempSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir, availableParallelism} from 'node:os';
import {join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';

if (isMainThread) {
  const [out, spec, ...files] = process.argv.slice(2);
  const variants = JSON.parse(existsSync(spec) ? readFileSync(spec, 'utf8') : spec);
  const grid = (process.env.GRID || '60,70,78,84,88,91,94,96').split(',').map(Number);
  const pool = Array.from({length: Number(process.env.WORKERS || availableParallelism())}, () => new Worker(fileURLToPath(import.meta.url)));
  const queue = [], idle = [...pool];
  const run = job => new Promise(resolve => { queue.push({job, resolve}); pump(); });
  function pump() { while (idle.length && queue.length) { const w = idle.pop(), {job, resolve} = queue.shift(); w.once('message', m => { idle.push(w); resolve(m); pump(); }); w.postMessage(job); } }
  const started = Date.now();
  const results = {};
  await Promise.all(Object.entries(variants).map(async ([name, v]) => {
    results[name] = {encoder: name, variant: v, grid, rows: await Promise.all(files.map(async png => ({image: basename(png),
      points: await Promise.all(grid.map(q => run({png, q, v})))})))};
  }));
  writeFileSync(out, JSON.stringify(results));
  const {compare} = await import('./compare.mjs');
  const names = Object.keys(results), base = results[names[0]];
  for (const name of names.slice(1)) {
    const r = compare(base, results[name]);
    console.log(name.padEnd(28), Object.entries(r).map(([k, v]) => k.replace('ssimulacra2', 's2') + ' ' + (v ? ((v.ratio - 1) * 100).toFixed(2) + '%' : '-')).join('  '));
  }
  console.error(((Date.now() - started) / 1000).toFixed(0) + ' s');
  for (const w of pool) w.terminate();
} else {
  const {readPng} = await import('../../public/bench/image-io.mjs'), {encodeWithField} = await import('../search.mjs');
  const {SETTINGS} = await import('../settings.mjs'), {closedLoopField} = await import('../aq.mjs'), {encodeXYBStrategies, encodeClosedLoop} = await import('../xyb-strategies.mjs');
  const work = mkdtempSync(join(tmpdir(), 'variants-')), images = new Map();
  parentPort.on('message', ({png, q, v}) => {
    if (!images.has(png)) images.set(png, readPng(readFileSync(png)));
    const {width, height, rgba} = images.get(png), {tune, ...base} = SETTINGS[v.from || 'v6tuned4'], file = join(work, 'c.jxl');
    const t = Date.now(), extra = {...base, ...v.extra};
    let field = null;
    if (v.aq) {
      const found = closedLoopField(png, width, height, (f, sharpness) => encodeWithField(rgba, width, height, q, f, v.effort ?? 9, tune, {...extra, sharpness}).bytes, v.aq);
      field = found.field; if (found.sharpness) extra.sharpness = found.sharpness;
    }
    const bytes = v.closed ? encodeClosedLoop(png, rgba, width, height, q, {tune, ...extra, fieldScale: field}, {cache: process.env.MAPS_CACHE, ...v.closed}).bytes
      : v.strategy ? encodeXYBStrategies(rgba, width, height, q, {tune, ...extra}, v.strategy).bytes
      : encodeWithField(rgba, width, height, q, field, v.effort ?? 9, tune, extra).bytes, ms = Date.now() - t;
    writeFileSync(file, bytes);
    const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString());
    const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
    parentPort.postMessage({setting: q, bytes: bytes.length, ms, ssimulacra2: s, ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])});
  });
}
