import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {brotliCompressSync, constants as zlibConstants, deflateRawSync} from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const deflate9 = bytes => deflateRawSync(bytes, {level: 9}).length;
const brotli11 = bytes => brotliCompressSync(bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_LGWIN]: 24}}).length;

export async function prepareAssets({example = here, packageDir = process.env.JXL_PACKAGE && resolve(process.env.JXL_PACKAGE)} = {}) {
  const pkg = packageDir || resolve(example, 'node_modules/jpegxl');
  const source = join(example, 'app/src/main/assets'), generated = join(example, 'app/build/generated/encoder-assets');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  await rm(join(generated, 'jpegxl'), {recursive: true, force: true});
  await mkdir(join(generated, 'jpegxl'), {recursive: true});
  if (manifest.exports?.['./jpeg']?.import !== './dist/jpeg.mjs')
    throw Object.assign(new Error(`${pkg} is not a built package with ./jpeg.`), {code: 'JXL_PACKAGE'});
  if (manifest.exports?.['./animation']?.browser !== './dist/animation.browser.mjs' || manifest.exports['./animation'].import !== './dist/animation.mjs')
    throw Object.assign(new Error(`${pkg} is not a built package with ./animation.`), {code: 'JXL_PACKAGE'});
  for (const name of ['jpeg', 'animation', 'animation.browser'])
    await copyFile(join(pkg, `dist/${name}.mjs`), join(generated, 'jpegxl', `${name}.mjs`));
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) await copyFile(join(pkg, name), join(generated, 'jpegxl', name));
  const page = await readFile(join(source, 'encoder.html'), 'utf8');
  const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('JXL_ASSETS: The encoder page has no module.');
  const hash = createHash('sha256').update(script).digest('base64');
  const headers = {
    'Content-Security-Policy': `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'; worker-src 'self'; connect-src 'self' blob:; img-src 'self' blob: data:; media-src blob:; base-uri 'none'; frame-ancestors 'none'`,
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
  };
  await writeFile(join(generated, 'headers.json'), JSON.stringify(headers, null, 2) + '\n');
  const files = [];
  for (const [root, paths] of [[source, ['encoder.html', 'encoder.mjs']], [generated, ['jpegxl/jpeg.mjs', 'jpegxl/animation.mjs', 'jpegxl/animation.browser.mjs', 'jpegxl/LICENSE', 'jpegxl/THIRD_PARTY_NOTICES', 'headers.json']]]) {
    for (const path of paths) {
      const bytes = await readFile(join(root, path));
      files.push({path, bytes: bytes.length, deflateBytes: deflate9(bytes), brotliBytes: brotli11(bytes), sha256: digest(bytes)});
    }
  }
  const report = {
    package: {name: manifest.name, version: manifest.version, manifestSha256: digest(await readFile(join(pkg, 'package.json')))},
    measurement: 'Encoder assets inside the APK (raw, ZIP Deflate-9, and Brotli-11). Excludes Kotlin classes, androidx.webkit, and ZIP framing.',
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    totalDeflateBytes: files.reduce((sum, file) => sum + file.deflateBytes, 0),
    totalBrotliBytes: files.reduce((sum, file) => sum + file.brotliBytes, 0),
  };
  await mkdir(join(example, 'build'), {recursive: true});
  await writeFile(join(example, 'build/encoder-assets.json'), JSON.stringify(report, null, 2) + '\n');
  return {source, generated, headers, report};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify((await prepareAssets()).report, null, 2)); }
  catch (error) { console.error(`${error.code || 'JXL_PACKAGE'}: ${error.message}\nSet JXL_PACKAGE to a built package, or run npm install --no-save jpegxl in this example.`); process.exitCode = 1; }
}
