import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {complete} from '../../bits.mjs';
import {photoXYBSteps} from '../../photo-xyb.mjs';
import {coefficientAnsSteps} from '../../coefficient-ans.mjs';
import {xybStrategies, encodeStrategyImage} from '../xyb-strategies.mjs';
import {SETTINGS} from '../settings.mjs';
import {reconstruct, toRGBA} from '../reconstruct.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [png, q = '90'] = process.argv.slice(2), quality = Number(q), {width, height, rgba} = readPng(readFileSync(png));
const work = mkdtempSync(join(tmpdir(), 'recon-')), {tune, ...extra} = SETTINGS.v6tuned4;
const blocks = Math.ceil(width / 8) * Math.ceil(height / 8), field = Float64Array.from({length: blocks}, (_, i) => [0.7, 1, 1.4][(i * 7) % 3]);
const dct8 = opts => { const image = complete(photoXYBSteps(rgba, width, height, quality, {tune, ...extra, ...opts})); return {image, bytes: complete(coefficientAnsSteps(image, 7))}; };
const forced = (id, opts = {}) => {
  const base = complete(photoXYBSteps(rgba, width, height, quality, {tune, ...extra, ...opts, keepPlanes: true}));
  const {image} = xybStrategies(base, width, height, {deadzone: extra.deadzone, force: id});
  return {image, bytes: encodeStrategyImage(image, false)};
};
const gab = {gaborish: {strength: 1, tilt: 1}, epfScale: 2};
const cases = [['dct8', () => dct8({})], ['dct8 gaborish', () => dct8(gab)], ['dct8 field', () => dct8({fieldScale: field})],
  ...[0, 4, 6, 7, 5, 10, 11].map(id => ['force ' + id, () => forced(id)]), ['force 5 gab+field', () => forced(5, {...gab, fieldScale: field})]];
let failed = 0;
for (const [name, make] of cases) {
  const {image, bytes} = make(), file = join(work, 'c.jxl'), out = join(work, 'c.png');
  writeFileSync(file, bytes);
  execFileSync(join(tools, 'djxl'), [file, out], {stdio: 'ignore'});
  const lib = readPng(readFileSync(out)).rgba, ours = toRGBA(reconstruct(image), width, height);
  let worst = 0, sum = 0, over1 = 0;
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++) {
    const d = Math.abs(lib[i * 4 + c] - ours[i * 4 + c]); worst = Math.max(worst, d); sum += d; if (d > 1) over1++;
  }
  const ok = worst <= 2 && over1 / (width * height * 3) < 1e-3;
  if (!ok) failed++;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name.padEnd(18) + ' max ' + worst + ', mean ' + (sum / (width * height * 3)).toFixed(4) + ', samples >1: ' + over1);
}
process.exit(failed ? 1 : 0);
