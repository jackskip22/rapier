import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {brotliCompressSync, constants as zlibConstants, deflateRawSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const deflate9 = bytes => deflateRawSync(bytes, {level: 9}).length;
const brotli11 = bytes => brotliCompressSync(bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}).length;
const modules = ['jpeg', 'animation'];
export async function prepareAssets({example = here, packageDir = process.env.JXL_PACKAGE && resolve(process.env.JXL_PACKAGE)} = {}) {
  const pkg = packageDir || resolve(example, 'node_modules/jpegxl');
  const web = join(example, 'Sources/RapierJXL/Web'), out = join(web, 'jpegxl');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  await rm(out, {recursive: true, force: true});
  await mkdir(out, {recursive: true});
  for (const name of modules) {
    const path = `dist/${name}.mjs`;
    if (manifest.exports?.[`./${name}`]?.import !== `./${path}`)
      throw Object.assign(new Error(`${pkg} is not a built package with ./${name}.`), {code: 'JXL_PACKAGE'});
    await copyFile(join(pkg, path), join(out, `${name}.mjs`));
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) await copyFile(join(pkg, name), join(out, name));
  if (manifest.exports?.['./decode']?.import !== './dist/decode.mjs') throw Object.assign(new Error(`${pkg} has no ./decode.`), {code: 'JXL_PACKAGE'});
  await copyFile(join(pkg, 'dist/decode.mjs'), join(example, 'Tests/RapierJXLTests/Fixtures/decode.mjs'));
  const files = [];
  for (const path of ['encoder.html', 'page.mjs', 'encoder.mjs', 'headers.json', ...modules.map(n => `jpegxl/${n}.mjs`), 'jpegxl/LICENSE', 'jpegxl/THIRD_PARTY_NOTICES']) {
    const bytes = await readFile(join(web, path));
    files.push({path, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes), sha256: digest(bytes)});
  }
  const report = {
    package: {name: manifest.name, version: manifest.version},
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    totalDeflateBytes: files.reduce((sum, file) => sum + file.deflateBytes, 0),
    totalBrotliBytes: files.reduce((sum, file) => sum + file.brotliBytes, 0),
  };
  await mkdir(join(example, 'build'), {recursive: true});
  await writeFile(join(example, 'build/web-assets.json'), JSON.stringify(report, null, 2) + '\n');
  return {web, report};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify((await prepareAssets()).report, null, 2)); }
  catch (error) { console.error(`${error.code || 'JXL_PACKAGE'}: ${error.message}\nSet JXL_PACKAGE to a built package, or run npm install --no-save jpegxl in this example.`); process.exitCode = 1; }
}
