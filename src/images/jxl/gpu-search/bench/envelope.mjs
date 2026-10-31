import {readFileSync} from 'node:fs';
import {bytesAt} from './compare.mjs';

const args = process.argv.slice(2), vsAt = args.indexOf('--vs'), vs = vsAt >= 0 ? JSON.parse(readFileSync(args.splice(vsAt, 2)[1])) : null;
const [file, baseName, ...names] = args, all = JSON.parse(readFileSync(file)), base = vs || all[baseName];
const TARGETS = {ssimulacra2: [60, 70, 80, 85, 90], ba3: [2.0, 1.5, 1.0, 0.7]};
const out = [];
for (const [key, targets] of Object.entries(TARGETS)) for (const target of targets) {
  let sb = 0, sc = 0, n = 0;
  const chosen = {};
  for (const row of base.rows) {
    const b = bytesAt(row.points, key, target);
    if (b === null) continue;
    let best = null, who = null;
    for (const name of names) {
      const r = all[name].rows.find(x => x.image === row.image), c = r && bytesAt(r.points, key, target);
      if (c !== null && c !== undefined && (best === null || c < best)) { best = c; who = name; }
    }
    if (best === null) continue;
    sb += b; sc += best; n++; chosen[who] = (chosen[who] || 0) + 1;
  }
  out.push(`${(key === 'ssimulacra2' ? 's2' : 'ba3')}@${target} ${n ? ((sc / sb - 1) * 100).toFixed(2) + '%' : '-'} (${n} images; ${Object.entries(chosen).map(([k, v]) => k + ' ' + v).join(', ')})`);
}
console.log(names.join(' | ') + ' vs ' + (vs ? vs.encoder : baseName) + '\n  ' + out.join('\n  '));
