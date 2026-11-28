import {copyFile, mkdir, readFile, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {brotliCompressSync, constants as zlibConstants, deflateRawSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const deflate9 = bytes => deflateRawSync(bytes, {level: 9}).length;
const brotli11 = bytes => brotliCompressSync(bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}).length;
const modules = ['jpeg', 'animation'], browserFiles = ['animation.browser'];
export async function prepareAssets({example = here, packageDir = process.env.JXL_PACKAGE && resolve(process.env.JXL_PACKAGE)} = {}) {
  const pkg = packageDir || resolve(example, 'node_modules/jpegxl');
  const web = join(example, 'assets/web'), out = join(web, 'jpegxl');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  await rm(out, {recursive: true, force: true});
  await mkdir(out, {recursive: true});
  for (const name of modules) {
    const path = `dist/${name}.mjs`;
    if (manifest.exports?.[`./${name}`]?.import !== `./${path}`)
      throw Object.assign(new Error(`${pkg} is not a built package with ./${name}.`), {code: 'JXL_PACKAGE'});
    await copyFile(join(pkg, path), join(out, `${name}.mjs`));
  }
  for (const name of browserFiles) {
    if (manifest.exports?.[`./${name.replace('.browser', '')}`]?.browser !== `./dist/${name}.mjs`)
      throw Object.assign(new Error(`${pkg} has no browser file for ./${name.replace('.browser', '')}.`), {code: 'JXL_PACKAGE'});
    await copyFile(join(pkg, `dist/${name}.mjs`), join(out, `${name}.mjs`));
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) await copyFile(join(pkg, name), join(out, name));
  if (manifest.exports?.['./decode']?.import !== './dist/decode.mjs') throw Object.assign(new Error(`${pkg} has no ./decode.`), {code: 'JXL_PACKAGE'});
  for (const name of ['decode.mjs', 'decode.wasm']) await copyFile(join(pkg, 'dist', name), join(example, 'example/assets/fixtures', name));
  const files = [];
  for (const path of ['encoder.html', 'page.mjs', 'encoder.mjs', ...[...modules, ...browserFiles].map(n => `jpegxl/${n}.mjs`), 'jpegxl/LICENSE', 'jpegxl/THIRD_PARTY_NOTICES']) {
    const bytes = await readFile(join(web, path));
    files.push({path, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes)});
  }
  return {
    package: {name: manifest.name, version: manifest.version},
    files,
    totalBytes: files.reduce((s, f) => s + f.bytes, 0),
    totalDeflateBytes: files.reduce((s, f) => s + f.deflateBytes, 0),
    totalBrotliBytes: files.reduce((s, f) => s + f.brotliBytes, 0),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareAssets(), null, 2)); }
  catch (error) { console.error(`${error.code || 'JXL_PACKAGE'}: ${error.message}\nSet JXL_PACKAGE to a built package, or run npm install --no-save jpegxl in this folder.`); process.exitCode = 1; }
}
