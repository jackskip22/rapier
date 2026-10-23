import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir, availableParallelism} from 'node:os';
import {join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const QUALITIES = (process.env.TUNE_QUALITIES || '78,84,90').split(',').map(Number);
const TARGETS = process.env.TUNE_TARGETS ? JSON.parse(process.env.TUNE_TARGETS) : [['ba3', 1.2], ['ba3', 0.9], ['ssimulacra2', 76], ['ssimulacra2', 84]];
export const PARAMS = [['xs', 1, 0.15, 0.5, 2.5], ['bs', 1, 0.15, 0.5, 2.5], ['tx', 0, 0.3, -0.9, 3], ['ty', 0, 0.1, -0.5, 1], ['tb', 0, 0.3, -0.9, 3],
  ['dxl', 0.58, 0.04, 0.4, 0.9], ['dxh', 0.62, 0.04, 0.4, 0.9], ['dyl', 0.56, 0.03, 0.4, 0.9], ['dyh', 0.62, 0.03, 0.4, 0.9],
  ['dbl', 0.58, 0.04, 0.4, 0.9], ['dbh', 0.62, 0.04, 0.4, 0.9], ['epf', 2, 0.4, 0.5, 5],
  ['qx', 0, 0.3, -0.9, 3], ['qy', 0, 0.1, -0.5, 1], ['qb', 0, 0.3, -0.9, 3], ['dcx', 1, 0.15, 0.5, 2], ['dcy', 1, 0.1, 0.5, 2], ['dcb', 1, 0.15, 0.5, 2],
  ['cfl', 1, 0.15, 0, 1.5]];
const FROM = {v6tuned: {xs: 1.15, bs: 1.225, tx: 0.45, ty: 0.15, tb: 0, dxl: 0.64, dxh: 0.64, dyl: 0.515, dyh: 0.605, dbl: 0.58, dbh: 0.62, epf: 2},
  v6tuned2: {xs: 1.075, bs: 1.225, tx: 0.45, ty: 0.3, tb: 0, dxl: 0.68, dxh: 0.68, dyl: 0.485, dyh: 0.62, dbl: 0.56, dbh: 0.62, epf: 2.2, qy: 0.1, dcx: 1.225, dcy: 1.15, dcb: 1.225, cfl: 0.775},
  v6tuned3: {xs: 1.225, bs: 1.45, tx: 0.45, ty: 0.45, tb: 0, dxl: 0.72, dxh: 0.72, dyl: 0.485, dyh: 0.62, dbl: 0.52, dbh: 0.62, epf: 2.8, qx: 0.15, qy: 0.05, dcx: 1.45, dcy: 1.3, dcb: 1.45, cfl: 0.85},
  v6tuned4: {xs: 1.3, bs: 1.675, tx: 0.45, ty: 0.45, tb: 0, dxl: 0.72, dxh: 0.76, dyl: 0.485, dyh: 0.575, dbl: 0.54, dbh: 0.6, epf: 3, qx: -0.15, qy: 0.05, dcx: 1.675, dcy: 1.35, dcb: 1.675, cfl: 0.7}};

export async function options(p) {
  const {defaultChroma} = await import('../settings.mjs');
  const v = Object.fromEntries(PARAMS.map(([name], i) => [name, p[i]]));
  const r = k => Math.sqrt(((k & 7) ** 2 + (k >> 3) ** 2) / 98);
  return {tune: (c, k) => defaultChroma(c, k) * [v.xs, 1, v.bs][c] * (1 + [v.tx, v.ty, v.tb][c] * r(k)) * (1 + [v.qx, v.qy, v.qb][c] * r(k) * r(k)),
    deadzone: [v.dxl, v.dxh, v.dyl, v.dyh, v.dbl, v.dbh], epfScale: v.epf, filterAlways: true, dcScale: [v.dcx, v.dcy, v.dcb], cflScale: v.cfl};
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), out = args[0], get = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const train = get('--train').split(','), test = get('--test').split(','), rounds = Number(get('--rounds', 2)), effort = Number(get('--effort', 7));
  const pool = Array.from({length: Math.max(1, availableParallelism() - 0)}, () => new Worker(fileURLToPath(import.meta.url), {workerData: {effort}}));
  const queue = [], idle = [...pool];
  const run = job => new Promise(resolve => { queue.push({job, resolve}); pump(); });
  function pump() { while (idle.length && queue.length) { const w = idle.pop(), {job, resolve} = queue.shift(); w.once('message', m => { idle.push(w); resolve(m); pump(); }); w.postMessage(job); } }
  const {bytesAt} = await import('./compare.mjs');
  const curves = (p, images) => Promise.all(images.map(png => run({png, p})));
  const score = (cand, base) => {
    let sum = 0, n = 0;
    for (let i = 0; i < base.length; i++) for (const [k, t] of TARGETS) {
      const b = bytesAt(base[i], k, t), c = bytesAt(cand[i], k, t);
      if (b && c) { sum += Math.log(c / b); n++; }
    }
    return n ? Math.exp(sum / n) - 1 : Infinity;
  };
  const from = FROM[get('--from')] || {}, start = PARAMS.map(([name, v]) => from[name] ?? v);
  let p = [...start];
  const base = await curves(p, train), log = [];
  let best = 0;
  for (let round = 0; round < rounds; round++) for (let i = 0; i < PARAMS.length; i++) for (const dir of [1, -1]) {
    const step = PARAMS[i][2] / (round + 1), q = [...p]; q[i] = Math.max(PARAMS[i][3], Math.min(PARAMS[i][4], q[i] + dir * step));
    if (q[i] === p[i]) continue;
    const s = score(await curves(q, train), base);
    log.push({round, param: PARAMS[i][0], value: q[i], score: s});
    console.error(round, PARAMS[i][0], q[i].toFixed(3), (s * 100).toFixed(2) + '%', s < best ? 'kept' : '');
    if (s < best) { best = s; p = q; break; }
  }
  const testBase = await curves(start, test), testBest = await curves(p, test);
  const result = {params: Object.fromEntries(PARAMS.map(([name], i) => [name, p[i]])), train: {images: train.map(f => basename(f)), change: best},
    test: {images: test.map(f => basename(f)), change: score(testBest, testBase), byTarget: Object.fromEntries(TARGETS.map(([k, t]) => [k + '@' + t, score(testBest.map(c => c), testBase) && null]))}, log};
  for (const [k, t] of TARGETS) {
    let a = 0, b = 0; for (let i = 0; i < test.length; i++) { const x = bytesAt(testBase[i], k, t), y = bytesAt(testBest[i], k, t); if (x && y) { a += x; b += y; } }
    result.test.byTarget[k + '@' + t] = b / a - 1;
  }
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({params: result.params, train: result.train.change, test: result.test}, null, 1));
  for (const w of pool) w.terminate();
} else if (!isMainThread) {
  const {readPng} = await import('../../public/bench/image-io.mjs'), {encodeWithField} = await import('../search.mjs');
  const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools', work = mkdtempSync(join(tmpdir(), 'tune-')), images = new Map();
  parentPort.on('message', async ({png, p}) => {
    if (!images.has(png)) images.set(png, readPng(readFileSync(png)));
    const {width, height, rgba} = images.get(png), {tune, ...extra} = await options(p), file = join(work, 'c.jxl');
    const points = QUALITIES.map(q => {
      const bytes = encodeWithField(rgba, width, height, q, null, workerData.effort, tune, extra).bytes;
      writeFileSync(file, bytes);
      const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString());
      const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
      return {bytes: bytes.length, ssimulacra2: s, ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])};
    });
    parentPort.postMessage(points);
  });
}
