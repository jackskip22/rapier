import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {readPng} from '../../public/bench/image-io.mjs';
import {decoder} from '../../public/test/decoder.mjs';
import {encodeToScore, encodeWithField, cpuMetric} from '../search.mjs';

const [png, targetText, effortText = '7'] = process.argv.slice(2), target = Number(targetText), effort = Number(effortText);
const image = readPng(readFileSync(png)), {width, height, rgba} = image;
const dec = await decoder(), decode = bytes => dec(bytes).data.length === width * height * 4 ? dec(bytes).data : toRGBA(dec(bytes));
function toRGBA(d) { const out = new Uint8Array(width * height * 4); for (let i = 0; i < width * height; i++) { for (let c = 0; c < 3; c++) out[i * 4 + c] = d.data[i * d.channels + c]; out[i * 4 + 3] = 255; } return out; }
const metric = cpuMetric(rgba, width, height);
const cli = bytes => { writeFileSync('/tmp/try.jxl', bytes); return Number(execFileSync('/home/user/tools/libjxl/tools/ssimulacra2', [png, '/tmp/try.jxl']).toString()); };
let lo = 30, hi = 99, plain = null;
for (let i = 0; i < 12; i++) {
  const q = (lo + hi) / 2, {bytes} = encodeWithField(rgba, width, height, q, null, effort), s = metric(decode(bytes)).score;
  if (s >= target) { hi = q; plain = {q, bytes, s}; } else lo = q;
}
const t0 = performance.now();
const {best, history} = encodeToScore(rgba, width, height, {target, decode, metric, effort, log: r => console.error('  ', r.quality.toFixed(2), r.score.toFixed(3), r.bytes)});
const ms = performance.now() - t0;
console.log(JSON.stringify({png, target, plain: {quality: plain.q, bytes: plain.bytes.length, js: plain.s, cli: cli(plain.bytes)},
  search: {quality: best.quality, bytes: best.bytes.length, js: best.score, cli: cli(best.bytes)}, ratio: best.bytes.length / plain.bytes.length, rounds: history.length, ms: Math.round(ms)}));
