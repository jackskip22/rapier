import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {encodePhoto} from '../../photo.mjs';
import {encodeWithField} from '../search.mjs';
import {SETTINGS} from '../settings.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [out, encoder, ...files] = process.argv.slice(2);
const grid = (process.env.GRID || '30,40,50,60,65,70,75,80,85,88,90,92,94,96').split(',').map(Number);
const work = mkdtempSync(join(tmpdir(), 'curves-'));

export function score(png, jxl) {
  const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, jxl]).toString().trim());
  const b = execFileSync(join(tools, 'butteraugli_main'), [png, jxl, '--pnorm', '3']).toString();
  return {ssimulacra2: s, butteraugli: Number(b.split('\n')[0]), ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])};
}

async function encodeAt(name, png, image, setting) {
  const file = join(work, basename(png) + '.' + name.replace(/:/g, '_') + '.' + setting + '.jxl');
  const [kind, a] = name.split(':');
  const started = process.hrtime.bigint();
  if (kind === 'cjxl') execFileSync(join(tools, 'cjxl'), [png, file, '-q', String(setting), '-e', a, '--num_threads=1'], {stdio: 'ignore'});
  else if (kind === 'rapier') writeFileSync(file, encodePhoto(image.rgba, image.width, image.height, {quality: setting, effort: Number(a)}));
  else if (kind === 'v6') { const {tune, ...extra} = SETTINGS[name.split(':')[2]]; writeFileSync(file, encodeWithField(image.rgba, image.width, image.height, setting, null, Number(a), tune, extra).bytes); }
  else throw new Error('unknown encoder ' + name);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const bytes = readFileSync(file).length;
  return {setting, bytes, ms, ...score(png, file)};
}

const rows = [];
for (const png of files) {
  const image = readPng(readFileSync(png));
  const points = [];
  for (const q of grid) points.push(await encodeAt(encoder, png, image, q));
  rows.push({image: basename(png), width: image.width, height: image.height, points});
  console.error(basename(png), points.map(p => p.setting + ':' + p.bytes + '/' + p.ssimulacra2.toFixed(1)).join(' '));
}
writeFileSync(out, JSON.stringify({encoder, grid, rows}, null, 1));
rmSync(work, {recursive: true});
