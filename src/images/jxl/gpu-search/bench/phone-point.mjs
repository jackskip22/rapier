import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {encode} from '../../effort.mjs';
import {prepareV6, candidateImage, writeImage} from '../../photo-v6-search.mjs';

const [kind, png, q, effort] = process.argv.slice(2), tools = process.env.JXL_TOOLS, work = mkdtempSync(join(tmpdir(), 'pp-')), file = join(work, 'p.jxl');
const t = Date.now();
if (kind === 'cjxl') execFileSync(join(tools, 'cjxl'), [png, file, '-q', q, '-e', effort, '--num_threads=1'], {stdio: 'ignore'});
else {
  const {width, height, rgba} = readPng(readFileSync(png));
  writeFileSync(file, kind === 'plain' ? writeImage(candidateImage(prepareV6(rgba, width, height), 'plain', Number(q)), Number(effort)) : encode(rgba, width, height, {quality: Number(q), effort: Number(effort)}));
}
const ms = Date.now() - t, bytes = readFileSync(file).length;
const s = Number(execFileSync(join(tools, 'ssimulacra2'), [png, file]).toString());
const b = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3']).toString();
rmSync(work, {recursive: true});
process.stdout.write(JSON.stringify({setting: Number(q), bytes, ms, ssimulacra2: s, butteraugli: Number(b.split('\n')[0]), ba3: Number(/3-norm: ([\d.]+)/.exec(b)[1])}));
