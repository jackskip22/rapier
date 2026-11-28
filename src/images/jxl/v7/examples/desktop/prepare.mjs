import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliCompressSync, constants as zlibConstants, deflateRawSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const deflate9 = bytes => deflateRawSync(bytes, {level: 9}).length;
const brotli11 = bytes => brotliCompressSync(bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}).length;
const names = ['jpeg', 'animation'];
export async function prepare({web, packageDir = process.env.JXL_PACKAGE && resolve(process.env.JXL_PACKAGE), app}) {
  const pkg = packageDir || resolve(app, 'node_modules/jpegxl');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  await rm(web, {recursive: true, force: true});
  await mkdir(join(web, 'jpegxl'), {recursive: true});
  for (const name of ['index.html', 'app.mjs']) await copyFile(join(here, name), join(web, name));
  const files = [];
  for (const name of names) for (const file of [`${name}.mjs`, `${name}.browser.mjs`]) {
    if (manifest.exports?.[`./${name}`]?.browser !== `./dist/${name}.browser.mjs`)
      throw Object.assign(new Error(`${pkg} is not a built package with ./${name}.`), {code: 'JXL_PACKAGE'});
    await copyFile(join(pkg, 'dist', file), join(web, 'jpegxl', file));
    files.push(`jpegxl/${file}`);
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) await copyFile(join(pkg, name), join(web, 'jpegxl', name));
  const sizes = [];
  for (const path of ['index.html', 'app.mjs', ...files, 'jpegxl/LICENSE', 'jpegxl/THIRD_PARTY_NOTICES']) {
    const bytes = await readFile(join(web, path));
    sizes.push({path, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes), sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  const report = {
    package: {name: manifest.name, version: manifest.version},
    files: sizes,
    totalBytes: sizes.reduce((sum, f) => sum + f.bytes, 0),
    totalDeflateBytes: sizes.reduce((sum, f) => sum + f.deflateBytes, 0),
    totalBrotliBytes: sizes.reduce((sum, f) => sum + f.brotliBytes, 0),
  };
  await writeFile(join(web, '..', 'web-assets.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
