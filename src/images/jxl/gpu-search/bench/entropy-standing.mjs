import {readFileSync, writeFileSync} from 'node:fs';

const [scoredFile, effort, out, ...runs] = process.argv.slice(2);
const load = file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(r => r.effort === Number(effort));
const scores = new Map(load(scoredFile).map(r => [`${r.name}|${r.kind}`, r]));
const result = {};
for (const run of runs) {
  const [name, file] = run.split('=');
  for (const r of load(file)) {
    const s = scores.get(`${r.name}|${r.kind}`), [, image, q] = /^(.*)-q(\d+)$/.exec(r.name), key = `${name} ${r.kind}`;
    if (s.djxl && r.djxl && s.djxl !== r.djxl) throw new Error(`pixels differ: ${r.name} ${r.kind}`);
    const curves = result[key] ||= {encoder: key, grid: [], rows: []};
    let row = curves.rows.find(x => x.image === image + '.png');
    if (!row) curves.rows.push(row = {image: image + '.png', points: []});
    row.points.push({setting: Number(q), bytes: r.bytes, ssimulacra2: s.ssimulacra2, butteraugli: s.butteraugli, ba3: s.ba3});
  }
}
for (const c of Object.values(result)) for (const row of c.rows) row.points.sort((a, b) => a.setting - b.setting);
writeFileSync(out, JSON.stringify(result));
