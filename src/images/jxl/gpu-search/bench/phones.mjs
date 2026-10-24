import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {availableParallelism, tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const cjxlEffort = opt('--cjxl', '9'), rapierEffort = opt('--rapier', '7'), kinds = opt('--kinds', 'cjxl,rapier').split(',');
const grid = opt('--grid', '60,70,80,86,90,93,95,97,98').split(',').map(Number), cgrid = opt('--cgrid', '40,55,70,80,86,90,93,96').split(',').map(Number);
const [from, to] = opt('--photos', '0-23').split('-').map(Number), out = args[0], tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const here = fileURLToPath(new URL('./', import.meta.url)), phones = process.env.PHONES || join(tmpdir(), 'phone24');
mkdirSync(out, {recursive: true}); mkdirSync(phones, {recursive: true});
const rows = JSON.parse(readFileSync(join(here, 'phone24.json'))).rows.slice(from, to + 1);
for (const r of rows) {
  const jpg = join(phones, r.file);
  for (let attempt = 0; attempt < 6 && !(existsSync(jpg) && createHash('sha256').update(readFileSync(jpg)).digest('hex') === r.sha256); attempt++) {
    try { execFileSync('curl', ['-sSLf', '-A', 'rapier-jxl-bench/1.0 (github.com/jackskip22)', '-o', jpg, r.originalURL.split('?')[0]]); } catch { execFileSync('sleep', [String(20 * (attempt + 1))]); }
  }
  if (createHash('sha256').update(readFileSync(jpg)).digest('hex') !== r.sha256) throw new Error(r.file + ': SHA-256 differs from the manifest');
  const png = jpg.replace(/\.jpg$/, '.png');
  if (!existsSync(png)) execFileSync('python3', ['-c', `
import io, sys
from PIL import Image, ImageCms
im = Image.open(sys.argv[1]); icc = im.info.get('icc_profile')
im = im.convert('RGB')
if icc: im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile('sRGB'), outputMode='RGB')
im.save(sys.argv[2])`, jpg, png]);
  r.png = png;
}
if (process.argv.includes('--prepare-only')) { console.log(rows.map(r => r.png).join('\n')); process.exit(0); }
const jobs = [];
for (const r of rows) for (const kind of kinds) for (const q of kind === 'cjxl' ? cgrid : grid) jobs.push({kind, r, q});
const results = Object.fromEntries(kinds.map(k => [k, new Map()])), started = Date.now();
const runOne = job => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(here, 'phone-point.mjs'), job.kind, job.r.png, String(job.q), job.kind === 'cjxl' ? cjxlEffort : rapierEffort], {stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, JXL_TOOLS: tools}});
  let text = ''; child.stdout.on('data', d => { text += d; });
  child.on('close', code => code ? reject(new Error(job.kind + ' ' + job.r.file + ' q' + job.q + ' exit ' + code)) : resolve(JSON.parse(text)));
});
let next = 0;
await Promise.all(Array.from({length: Number(process.env.WORKERS || availableParallelism())}, async () => {
  while (next < jobs.length) {
    const job = jobs[next++], point = await runOne(job), map = results[job.kind];
    if (!map.has(job.r.id)) map.set(job.r.id, []);
    map.get(job.r.id).push(point);
  }
}));
for (const kind of kinds) writeFileSync(join(out, kind + '.json'), JSON.stringify({encoder: kind + ':' + (kind === 'cjxl' ? cjxlEffort : rapierEffort), grid: kind === 'cjxl' ? cgrid : grid,
  rows: rows.map(r => ({image: r.id, width: r.width, height: r.height, points: results[kind].get(r.id).sort((a, b) => a.setting - b.setting)}))}));
console.error(((Date.now() - started) / 1000).toFixed(0) + ' s');
if (kinds.includes('cjxl')) console.log(execFileSync(process.execPath, [join(here, 'compare.mjs'), join(out, 'cjxl.json'), ...kinds.filter(k => k !== 'cjxl').map(k => join(out, k + '.json'))]).toString());
