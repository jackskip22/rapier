import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {brotliCompressSync, constants as zlibConstants, deflateRawSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const deflate9 = bytes => deflateRawSync(bytes, {level: 9}).length;
const brotli11 = bytes => brotliCompressSync(bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}).length;
export const ORIGIN = 'https://rapier.invalid/';
const modules = [['jpeg', './jpeg', 'dist/jpeg.mjs'],
  ['animation', './animation', 'dist/animation.mjs'], ['animation.browser', './animation', 'dist/animation.browser.mjs']];
const names = {jpeg: 'jpeg', animation: 'animation', 'animation.browser': 'animationBrowser'};

export async function prepareAssets({example = here, packageDir = process.env.JXL_PACKAGE && resolve(process.env.JXL_PACKAGE)} = {}) {
  const pkg = packageDir || resolve(example, 'node_modules/jpegxl');
  const out = join(example, 'src/generated');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  await rm(out, {recursive: true, force: true});
  await mkdir(out, {recursive: true});
  const files = [];
  for (const [name, entry, path] of modules) {
    const found = manifest.exports?.[entry];
    if (found?.import !== `./${path}` && found?.browser !== `./${path}`)
      throw Object.assign(new Error(`${pkg} is not a built package with ${entry}.`), {code: 'JXL_PACKAGE'});
    const bytes = await readFile(join(pkg, path));
    const text = bytes.toString('utf8');
    files.push({name, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes), sha256: createHash('sha256').update(bytes).digest('hex')});
    await writeFile(join(out, `${names[name]}.ts`), `// ${path} of ${manifest.name} ${manifest.version}, unchanged. Written by prepare-assets.mjs.\nexport default ${JSON.stringify(text)};\n`);
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) {
    const bytes = await readFile(join(pkg, name));
    await copyFile(join(pkg, name), join(out, name));
    files.push({name, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes), sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  const worker = await readFile(join(here, 'web/worker.js'), 'utf8');
  const script = (await readFile(join(here, 'web/page.js'), 'utf8')).replace('WORKER_SOURCE', JSON.stringify(worker));
  const csp = [`default-src 'none'`, `script-src 'sha256-${createHash('sha256').update(script).digest('base64')}' blob: 'wasm-unsafe-eval'`,
    `worker-src blob:`, `connect-src blob:`, `img-src blob: data:`, `media-src blob:`, `base-uri 'none'`].join('; ');
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>rapier-jxl</title><script>${script}</script>`;
  const htmlBytes = Buffer.from(html, 'utf8');
  await writeFile(join(out, 'page.ts'), `// Written by prepare-assets.mjs.
export const ORIGIN = ${JSON.stringify(ORIGIN)};
export const PAGE = ${JSON.stringify(html)};
export const modules: Record<string, () => Promise<string>> = {
${modules.map(([name]) => `  ${JSON.stringify(name)}: () => import('./${names[name]}.ts').then(m => m.default)`).join(',\n')}
};
`);
  const report = {
    package: {name: manifest.name, version: manifest.version},
    files,
    pageBytes: htmlBytes.length,
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0) + htmlBytes.length,
    totalDeflateBytes: files.reduce((sum, f) => sum + f.deflateBytes, 0) + deflate9(htmlBytes),
    totalBrotliBytes: files.reduce((sum, f) => sum + f.brotliBytes, 0) + brotli11(htmlBytes),
  };
  await mkdir(join(example, 'build'), {recursive: true});
  await writeFile(join(example, 'build/assets.json'), JSON.stringify(report, null, 2) + '\n');
  return {out, report};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify((await prepareAssets()).report, null, 2)); }
  catch (error) { console.error(`${error.code || 'JXL_PACKAGE'}: ${error.message}\nSet JXL_PACKAGE to a built package, or run npm install --no-save jpegxl in this example.`); process.exitCode = 1; }
}
