import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPng} from '../../public/bench/image-io.mjs';
import {decoder} from '../../public/test/decoder.mjs';
import {encodeXYBStrategies, encodeClosedLoop} from '../xyb-strategies.mjs';
import {SETTINGS} from '../settings.mjs';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';
const [png, q = '90'] = process.argv.slice(2), quality = Number(q), {width, height, rgba} = readPng(readFileSync(png));
const n = width * height, work = mkdtempSync(join(tmpdir(), 'structural-')), oxide = await decoder();
const {tune, ...extra} = SETTINGS.v6tuned4, photo = {tune, ...extra};
const version = execFileSync(join(tools, 'djxl'), ['--version']).toString();
if (!version.includes('v0.12.0')) throw new Error('djxl is not libjxl 0.12.0: ' + version);
const cases = [...[0, 3, 12, 13, 4, 6, 7, 5, 10, 11].map(id => ['force ' + id, () => encodeXYBStrategies(rgba, width, height, quality, photo, {force: id}).bytes]),
  ['closed loop', () => encodeClosedLoop(png, rgba, width, height, quality, photo, {lambda: 1, ids: [5, 10, 11, 4, 6, 7, 3, 12, 13]}).bytes]];
let failed = 0;
for (const [name, encode] of cases) {
  const bytes = encode(), again = encode(), file = join(work, 'c.jxl'), out = join(work, 'c.png');
  writeFileSync(file, bytes);
  execFileSync(join(tools, 'djxl'), [file, out], {stdio: 'ignore'});
  const lib = readPng(readFileSync(out)).rgba, ox = oxide(bytes);
  let worst = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(lib[i * 4 + c] - ox.data[i * ox.channels + c]));
  const same = bytes.length === again.length && bytes.every((b, i) => b === again[i]);
  const ok = worst <= 1 && same;
  if (!ok) failed++;
  console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name.padEnd(12) + ' ' + bytes.length + ' bytes, djxl vs jxl-oxide max ' + worst + (same ? ', deterministic' : ', NOT deterministic'));
}
process.exit(failed ? 1 : 0);
