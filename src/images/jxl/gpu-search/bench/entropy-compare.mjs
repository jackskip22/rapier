import {readFileSync} from 'node:fs';

const load = file => new Map(readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(r => [`${r.name}|${r.kind}|${r.effort}`, r]));
const [base, cand] = process.argv.slice(2).map(load);
const groups = new Map();
let pixels = 0, moved = [];
for (const [key, b] of base) {
  const c = cand.get(key);
  if (!c) continue;
  const quality = /-q(\d+)$/.exec(b.name)[1], id = `${b.kind} e${b.effort} q${quality}`;
  const g = groups.get(id) || groups.set(id, {base: 0, cand: 0, ms0: 0, ms1: 0, n: 0, worst: -Infinity, worstName: ''}).get(id);
  g.base += b.bytes; g.cand += c.bytes; g.ms0 += b.ms; g.ms1 += c.ms; g.n++;
  const growth = c.bytes / b.bytes - 1;
  if (growth > g.worst) { g.worst = growth; g.worstName = b.name; }
  if (b.djxl && c.djxl) { pixels++; if (b.djxl !== c.djxl || b.oxide !== c.oxide) moved.push(key); }
}
const pct = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(2) + '%';
const all = {base: 0, cand: 0};
for (const [id, g] of [...groups].sort()) {
  all.base += g.base; all.cand += g.cand;
  console.log(id.padEnd(18), String(g.n).padStart(3), String(g.base).padStart(9), String(g.cand).padStart(9), pct(g.cand / g.base - 1).padStart(8),
    'worst', pct(g.worst), g.worstName, 'time', (g.ms1 / g.ms0).toFixed(2) + 'x');
}
console.log('all'.padEnd(18), '   ', String(all.base).padStart(9), String(all.cand).padStart(9), pct(all.cand / all.base - 1).padStart(8));
console.log(`pixels: ${pixels} files decoded by djxl and jxl-oxide; ${moved.length ? 'MOVED: ' + moved.join(' ') : 'all identical to the base'}`);
