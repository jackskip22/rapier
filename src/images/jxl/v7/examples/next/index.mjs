// SPDX-License-Identifier: MIT
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspect} from 'rapier-jxl/metadata';
import {IMAGE, jxlFiles} from '../files/index.mjs';

const DEVICE = [640, 750, 828, 1080, 1200, 1920, 2048, 3840], SIZES = [32, 48, 64, 96, 128, 256, 384];
export const JXL_DIR = '_jxl';
export const jxlPath = (url, width) => `/${JXL_DIR}/w${width}${url}.jxl`;

async function images(dir, base) {
  let names;
  try { names = await readdir(dir, {recursive: true}); } catch { return []; }
  return names.filter(name => IMAGE.test(name) && !name.split(sep).includes(JXL_DIR)).map(name => ({file: join(dir, name), url: base + name.split(sep).join('/')}));
}

export async function writeNextJxl({root = process.cwd(), fidelity = {quality: 64}, effort = 3, log = console.log} = {}) {
  root = resolve(root);
  const dist = join(root, '.next');
  let config = {};
  try { config = JSON.parse(await readFile(join(dist, 'required-server-files.json'), 'utf8')).config ?? {}; }
  catch { throw Object.assign(new Error("Missing build: no .next/required-server-files.json."), {code: 'JXL_SETUP', fix: 'npm run build: this step runs as its postbuild.'}); }
  const imagesConfig = config.images ?? {};
  const widths = [...new Set([...(imagesConfig.deviceSizes ?? DEVICE), ...(imagesConfig.imageSizes ?? SIZES)])].sort((a, b) => a - b);
  const exported = config.output === 'export';
  const files = jxlFiles({fidelity, effort, cacheDir: join(dist, 'cache', 'rapier-jxl')});
  const found = [...await images(join(root, 'public'), '/'), ...await images(join(dist, 'static', 'media'), '/_next/static/media/')];
  const targets = [join(root, 'public'), ...(exported ? [join(root, config.distDir && config.distDir !== '.next' ? config.distDir : 'out')] : [])];
  let written = 0, bytesIn = 0, bytesOut = 0;
  const left = [];
  const started = performance.now();
  for (const {file, url} of found) {
    const source = new Uint8Array(await readFile(file));
    let own;
    try { const info = await inspect(source); own = info.orientation >= 5 ? info.height : info.width; }
    catch (error) { left.push(relative(root, file)); log(`rapier-jxl left ${relative(root, file)} as it is: ${error.message}`); continue; }
    let previous = null;
    for (const width of widths) {
      if (previous && previous.full) { await save(width, previous.bytes); continue; }
      const full = width >= own;
      let out;
      try { out = await files.toJxl(file, {bytes: source, width: full ? undefined : width}); }
      catch (error) { left.push(`${relative(root, file)} at ${width} px`); log(`rapier-jxl left ${relative(root, file)} at ${width} px as it is: ${error.code || ''} ${error.message}`); continue; }
      previous = {full, bytes: out.bytes};
      await save(width, out.bytes);
    }
    bytesIn += source.length;
    async function save(width, bytes) {
      for (const target of targets) {
        const to = join(target, ...jxlPath(url, width).split('/'));
        await mkdir(dirname(to), {recursive: true}); await writeFile(to, bytes);
      }
      written++; bytesOut += bytes.length;
    }
  }
  const summary = {pictures: found.length, files: written, left, widths, inputBytes: bytesIn, outputBytes: bytesOut, ms: Math.round(performance.now() - started), exported};
  log(`rapier-jxl: ${found.length} pictures, ${written} JPEG XL files in public/${JXL_DIR}${exported ? ' and the export' : ''} (${summary.ms} ms)`);
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), json = args.includes('--json');
  const run = async () => {
    const options = {log: json ? () => {} : console.log}, seen = new Set();
    const refuse = message => { throw Object.assign(new Error(message), {code: 'JXL_OPTIONS'}); };
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (!['--quality', '--effort', '--json'].includes(flag)) refuse(`Unknown option: ${flag}`);
      if (seen.has(flag)) refuse(`Repeated option: ${flag}`);
      seen.add(flag);
      if (flag === '--json') continue;
      const value = Number(args[++i]);
      if (flag === '--quality') {
        if (!Number.isFinite(value) || value < 1 || value > 100) refuse('quality: number from 1 to 100');
        options.fidelity = {quality: value};
      } else {
        if (!Number.isInteger(value) || value < 1 || value > 9) refuse('effort: integer from 1 to 9');
        options.effort = value;
      }
    }
    return writeNextJxl(options);
  };
  run().then(summary => { if (json) console.log(JSON.stringify(summary)); }, error => {
    console.error(`rapier-jxl: ${error.code || ''} ${error.message}${error.fix ? ' Fix: ' + error.fix : ''}`);
    process.exitCode = 1;
  });
}
