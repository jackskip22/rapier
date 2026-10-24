import {readFileSync, writeFileSync} from 'node:fs';
import {compare} from './compare.mjs';

const [base, ours, out, corpus] = process.argv.slice(2), b = JSON.parse(readFileSync(base)), o = JSON.parse(readFileSync(ours));
const rows = Object.fromEntries(Object.entries(compare(b, o)).filter(([, v]) => v).map(([k, v]) => [k, {percent: +((v.ratio - 1) * 100).toFixed(2), images: v.images}]));
writeFileSync(out, JSON.stringify({about: 'Bytes at equal score against libjxl (gpu-search/bench/compare.mjs): negative is smaller.',
  encoder: o.encoder, against: b.encoder, corpus, rows}, null, 1) + '\n');
console.log(JSON.stringify(rows));
