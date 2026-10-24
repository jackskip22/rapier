import {appendFileSync, writeFileSync, readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadImages} from './entropy-cache.mjs';
import {writeImage} from '../../photo-v6-search.mjs';
import {encodeStrategyImage} from '../../varblocks.mjs';

const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const decode = args.includes('--decode'); if (decode) args.splice(args.indexOf('--decode'), 1);
const scored = args.includes('--score'); if (scored) args.splice(args.indexOf('--score'), 1);
const efforts = (flag('--efforts') || '7').split(',').map(Number), shard = (flag('--shard') || '0/1').split('/').map(Number);
const kinds = (flag('--kinds') || 'gaborish,closed').split(',');
const [dir, out, qualities, ...files] = args;
const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools', oxide = process.env.JXL_OXIDE || '/home/user/tools/oxide/bin/jxl-oxide';
const work = mkdtempSync(join(tmpdir(), 'entropy-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

function pixels(bytes) {
  const file = join(work, 'a.jxl'), a = join(work, 'a.png'), b = join(work, 'b.png');
  writeFileSync(file, bytes);
  execFileSync(join(tools, 'djxl'), [file, a, '--bits_per_sample=16', '--num_threads=1'], {stdio: 'ignore'});
  execFileSync(oxide, [file, '-o', b, '-f', 'png16'], {stdio: 'ignore'});
  return {djxl: sha(readFileSync(a)), oxide: sha(readFileSync(b))};
}

function score(png, bytes) {
  const file = join(work, 's.jxl');
  writeFileSync(file, bytes);
  const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString().trim());
  const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
  return {ssimulacra2: s, butteraugli: Number(b.split('\n')[0]), ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])};
}

let index = 0;
for (const point of loadImages(dir, files.filter((_, i) => i % shard[1] === shard[0]), qualities.split(',').map(Number))) {
  for (const kind of kinds) for (const effort of efforts) {
    const started = Date.now(), image = point[kind];
    const bytes = kind === 'closed' ? encodeStrategyImage(image, true, effort) : writeImage(image, effort);
    const row = {name: point.name, kind, effort, bytes: bytes.length, sha: sha(bytes), ms: Date.now() - started};
    if (decode) Object.assign(row, pixels(bytes));
    if (scored) Object.assign(row, score(point.png, bytes));
    appendFileSync(out, JSON.stringify(row) + '\n');
  }
  index++;
}
rmSync(work, {recursive: true});
