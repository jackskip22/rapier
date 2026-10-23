import {readFileSync} from 'node:fs';

export function bytesAt(points, key, target, lowerIsBetter = false) {
  const sorted = [...points].sort((a, b) => a[key] - b[key]);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (target >= a[key] && target <= b[key] && b[key] > a[key]) {
      const t = (target - a[key]) / (b[key] - a[key]);
      return Math.exp(Math.log(a.bytes) + t * (Math.log(b.bytes) - Math.log(a.bytes)));
    }
  }
  return null;
}

const TARGETS = {ssimulacra2: [60, 70, 80, 85, 90], ba3: [2.0, 1.5, 1.0, 0.7]};
export function compare(base, cand) {
  const out = {};
  for (const [key, targets] of Object.entries(TARGETS)) for (const target of targets) {
    let sb = 0, sc = 0, n = 0, logs = 0;
    for (const row of base.rows) {
      const other = cand.rows.find(r => r.image === row.image);
      if (!other) continue;
      const b = bytesAt(row.points, key, target), c = bytesAt(other.points, key, target);
      if (b === null || c === null) continue;
      sb += b; sc += c; n++; logs += Math.log(c / b);
    }
    out[key + '@' + target] = n ? {images: n, ratio: +(sc / sb).toFixed(4), geomean: +Math.exp(logs / n).toFixed(4)} : null;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basePath, ...cands] = process.argv.slice(2), base = JSON.parse(readFileSync(basePath));
  for (const path of cands) {
    const cand = JSON.parse(readFileSync(path));
    console.log(cand.encoder, 'vs', base.encoder);
    for (const [k, v] of Object.entries(compare(base, cand))) console.log('  ' + k.padEnd(16), v ? `${((v.ratio - 1) * 100).toFixed(2).padStart(7)}% (geo ${((v.geomean - 1) * 100).toFixed(2)}%, ${v.images} images)` : '-');
  }
}
