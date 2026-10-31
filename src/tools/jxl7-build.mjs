// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, writeFile, mkdir, rm, copyFile, cp, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join, dirname, resolve, relative, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {checkBudgets} from './jxl-budgets.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'), codec = join(repo, 'images/jxl'), v7 = join(codec, 'v7');
const {GPU_FROM} = await import(pathToFileURL(join(codec, 'gpu-gate.mjs')).href);
function autoGpuWords(table) {
  const pixels = n => n === 1 << 20 ? 'a megapixel' : n % (1 << 20) ? (n / (1 << 20)).toFixed(1) + ' megapixels' : n / (1 << 20) + ' megapixels';
  const groups = new Map();
  for (const [effort, from] of Object.entries(table).sort((a, b) => a[0] - b[0])) groups.set(from, [...(groups.get(from) || []), +effort]);
  if (!groups.size) return 'none in this version, so WebAssembly everywhere';
  const efforts = list => list.length > 1 && list.at(-1) - list[0] === list.length - 1 ? `efforts ${list[0]}–${list.at(-1)}` : (list.length > 1 ? 'efforts ' : 'effort ') + list.join(', ');
  return [...groups].map(([from, list]) => from === 0 ? `every lossy encode at ${efforts(list)}` : `lossy encodes of ${pixels(from)} or more at ${efforts(list)}`).join('; ');
}
const AUTO_GPU = autoGpuWords(GPU_FROM);
const out = process.env.JXL7_OUT ? resolve(process.env.JXL7_OUT) : join(repo, 'dist/jxl7'), dist = join(out, 'dist');
export const ESBUILD_VERSION = '0.25.10';
const esbuild = createRequire(import.meta.url)(process.env.ESBUILD || 'esbuild');
if (esbuild.version !== ESBUILD_VERSION) throw new Error('rapier-jxl 7.0 builds with esbuild ' + ESBUILD_VERSION + ', not ' + esbuild.version + '.');
export const TERSER_VERSION = '5.51.2';
const terserRoot = process.env.TERSER ? resolve(process.env.TERSER) : dirname(createRequire(import.meta.url).resolve('terser/package.json'));
const terser = createRequire(import.meta.url)(terserRoot), terserVersion = JSON.parse(await readFile(join(terserRoot, 'package.json'), 'utf8')).version;
if (terserVersion !== TERSER_VERSION) throw new Error('rapier-jxl 7.0 builds with terser ' + TERSER_VERSION + ', not ' + terserVersion + '.');
const version = '8.0.1';

export const ONE_FILE = ['index', 'upload', 'capture', 'animation', 'format', 'decode', 'jpeg', 'metadata', 'codec', 'polyfill', 'snapdom'];
export const WASM_MODULES = ['index', 'upload', 'capture', 'animation', 'format', 'decode', 'jpeg'];
export const WORKER_FILES = ['still', 'upload', 'capture', 'animation', 'format', 'decode', 'jpeg'];
export const HELPER_FILES = ['still', 'upload', 'animation', 'format'];
const MODULE_FILE = /^\.\/(index|upload|capture|animation|format|decode|jpeg|helpers)\.mjs$/;
const common = {absWorkingDir: repo, bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'none', logLevel: 'warning',
  external: ['node:*'], define: {__RAPIER_JXL_VERSION__: JSON.stringify(version)}, banner: {js: '/*! rapier-jxl ' + version + ' | MIT */'}};

await rm(out, {recursive: true, force: true});
await mkdir(dist, {recursive: true});
const moduleFiles = {name: 'module-files', setup(build) {
  build.onResolve({filter: MODULE_FILE}, ({path, importer}) => importer === join(v7, 'codec.mjs') ? {path, external: true} : undefined);
}};
const built = {metafile: {inputs: {}, outputs: {}}}, contents = {};
async function oneFile(name, file = name + '.mjs', from = v7) {
  const {metafile} = await esbuild.build({...common, metafile: true, plugins: [moduleFiles], entryPoints: [join(from, file)], outfile: join(dist, file)});
  Object.assign(built.metafile.inputs, metafile.inputs); Object.assign(built.metafile.outputs, metafile.outputs);
  const [output] = Object.values(metafile.outputs);
  const loads = output.imports.filter(edge => !(edge.external && (edge.path.startsWith('node:') || MODULE_FILE.test(edge.path))));
  if (loads.length) throw new Error(file + ' is not one file: ' + loads.map(edge => edge.path).join(', '));
  contents[name] = Object.keys(output.inputs);
}
for (const name of ONE_FILE) await oneFile(name);
for (const name of WORKER_FILES) await oneFile(name + '.worker', name + '.worker.mjs');
for (const name of HELPER_FILES) await oneFile(name + '.helper', name + '.helper.mjs');
await oneFile('helpers');
for (const name of HELPER_FILES) {
  const held = contents[name + '.helper'];
  const spawns = ['helper-pool.mjs', 'parallel-spawn.mjs', 'parallel.mjs', 'parallel-worker.mjs', 'v7/helpers.mjs', 'v7/worker-runtime.mjs']
    .filter(file => held.some(input => input.endsWith('/' + file)));
  if (spawns.length) throw new Error(name + '.helper.mjs reaches a spawn site: ' + spawns.join(', '));
  if (/\b[a-z-]+\.(helper|worker)\.mjs\b|parallel-worker\.mjs/.test(await readFile(join(dist, name + '.helper.mjs'), 'utf8'))) throw new Error(name + '.helper.mjs names a worker file');
}
for (const [name, inputs] of Object.entries(contents)) {
  const stale = ['v7/legacy-queue.mjs', 'v7/shared.mjs', 'v7/runtime.mjs', 'v7/run-codec.mjs', 'v7/worker.mjs', 'v7/offline.mjs'].filter(file => inputs.some(input => input.endsWith('/' + file)));
  if (stale.length) throw new Error(name + ' holds the 7.x queue entry: ' + stale.join(', '));
}
{
  const OUTSIDE = ['photo-v6-blocks.mjs', 'varblocks.mjs', 'aq.mjs', 'photo-v6-search.mjs', 'gpu-core.mjs', 'photo-advanced.mjs', 'score.mjs', 'local.mjs', 'butteraugli.mjs', 'parallel-drive.mjs', 'parallel-serve.mjs',
    'channels.mjs', 'planar-transforms.mjs', 'planar-squeeze.mjs', 'planar-input.mjs', 'weighted-custom.mjs',
    'exact-ladder.mjs', 'palette-search.mjs', 'screen-local.mjs'];
  const holds = (file, inputs) => { const outside = OUTSIDE.filter(name => inputs.some(input => input.endsWith('/' + name))); if (outside.length) throw new Error(file + ' holds ' + outside.join(', ')); };
  holds('upload.mjs', contents.upload); holds('upload.helper.mjs', contents['upload.helper']);
  const ALLOWED = ['helper-runtime.mjs', 'photo-split.mjs', 'v7/upload.helper.mjs', 'v7/module-runtime.mjs', 'v7/drive.mjs', 'v7/webgpu.mjs', 'v7/protocol.mjs'];
  const beyond = contents['upload.helper'].filter(input => !contents.upload.includes(input) && !ALLOWED.some(name => input.endsWith('/' + name)));
  if (beyond.length) throw new Error('upload.helper.mjs holds more than upload: ' + beyond.join(', '));
}
for (const name of ['index', 'upload', 'animation', 'format'])
  if ((await readFile(join(dist, name + '.mjs'), 'utf8')).includes('OpenEXR')) throw new Error(name + '.mjs holds the OpenEXR reader');
await oneFile('wasm');
await oneFile('wasm-modules', 'wasm-modules.mjs', codec);

for (const file of await readdir(dist)) {
  const path = join(dist, file), module = file.endsWith('.mjs');
  const {code} = await terser.minify(await readFile(path, 'utf8'), {module, ecma: 2020, compress: false, mangle: true, format: {comments: /^!/}});
  await writeFile(path, code);
  for (const [key, output] of Object.entries(built.metafile.outputs)) if (basename(key) === file) output.bytes = Buffer.byteLength(code);
}

const {CAPTURE} = await import(join(codec, 'capture-kernels-bytes.mjs'));
const {SIMD} = await import(join(codec, 'kernels-bytes.mjs'));
const {JPEG_KERNELS} = await import(join(codec, 'jpeg-kernels-bytes.mjs'));
const {DECODE_KERNELS} = await import(join(codec, 'decode-kernels-bytes.mjs'));
for (const [name, text] of [['capture',CAPTURE],['simd',SIMD],['jpeg',JPEG_KERNELS],['decode',DECODE_KERNELS]])
  await writeFile(join(dist, name + '.wasm'), Uint8Array.from(text, c => c.charCodeAt(0)));
const conditions = name => ({workerd: `./dist/${name}.workerd.mjs`, 'edge-light': `./dist/${name}.edge-light.mjs`});
for (const condition of ['workerd','edge-light']) {
  const load = name => `import ${name} from './${name}.wasm${condition === 'edge-light' ? '?module' : ''}';`, names = ['capture','simd','jpeg','decode'];
  await writeFile(join(dist, `wasm.${condition}.mjs`), `${names.map(load).join('\n')}\nimport {wasmBundle} from './wasm-modules.mjs';\nexport default wasmBundle({${names.join(',')}});\n`);
  for (const name of WASM_MODULES)
    await writeFile(join(dist, `${name}.${condition}.mjs`), `import wasm from './wasm.${condition}.mjs';\nimport {configureWasm} from './${name}.mjs';\nconfigureWasm(wasm);\nexport * from './${name}.mjs';\n`);
}

await mkdir(join(out, 'types'), {recursive: true});
const declarations = (await readdir(v7)).filter(name => name.endsWith('.d.mts')).map(name => join(v7, name));
for (let at = 0; at < declarations.length; at++) {
  const path = declarations[at], text = await readFile(path, 'utf8'), own = dirname(path) === v7;
  for (const [, specifier] of text.matchAll(/from ['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const dependency = resolve(dirname(path), specifier.replace(/\.mjs$/, '.d.mts'));
    if (!existsSync(dependency)) throw new Error('Missing declaration ' + dependency + ' (from ' + path + ')');
    if (!declarations.includes(dependency)) declarations.push(dependency);
  }
  const target = own ? join(out, 'types', relative(v7, path)) : join(out, 'types/codec', relative(codec, path));
  await mkdir(dirname(target), {recursive: true});
  const filled = own ? text.replace(/(['"])\.\.\/([^'"\n]+)\1/g, (_, quote, rest) => quote + './codec/' + rest + quote).replaceAll('__AUTO_GPU__', AUTO_GPU) : text;
  if (filled.includes('__AUTO_GPU__')) throw new Error(path + ': __AUTO_GPU__ left unfilled');
  await writeFile(target, filled);
}
await copyFile(join(codec, 'LICENSE'), join(out, 'LICENSE'));
await copyFile(join(v7, 'THIRD_PARTY_NOTICES'), join(out, 'THIRD_PARTY_NOTICES'));
const changelog = existsSync(join(v7, 'CHANGELOG.md'));
if (changelog) await writeFile(join(out, 'CHANGELOG.md'), (await readFile(join(v7, 'CHANGELOG.md'), 'utf8')).replaceAll('__AUTO_GPU__', AUTO_GPU));
const EXAMPLES = ['polyfill.html', '09-browser-upload-queue.html', '09-browser-upload-queue.mjs', 'snapdom'];
await mkdir(join(out, 'examples'), {recursive: true});
for (const file of EXAMPLES) await cp(join(v7, 'examples', file), join(out, 'examples', file), {recursive: true});
const exports = {};
for (const name of ONE_FILE) exports[name === 'index' ? '.' : './' + name] = {types: `./types/${name}.d.mts`, ...(WASM_MODULES.includes(name) && conditions(name)), import: `./dist/${name}.mjs`};
exports['./wasm'] = {types: './types/wasm.d.mts', ...conditions('wasm'), import: './dist/wasm.mjs'};
exports['./package.json'] = './package.json';
const sideEffects = ['./dist/polyfill.mjs', ...WORKER_FILES.map(name => `./dist/${name}.worker.mjs`), ...HELPER_FILES.map(name => `./dist/${name}.helper.mjs`),
  ...[...WASM_MODULES, 'wasm'].flatMap(name => Object.values(conditions(name)))];
const {repository, homepage, bugs, keywords} = JSON.parse(await readFile(join(codec, 'package.json'), 'utf8'));
await writeFile(join(out, 'package.json'), JSON.stringify({name: 'rapier-jxl', version, type: 'module', license: 'MIT',
  description: 'JPEG XL for pictures, captures and exact JPEG reconstruction.', repository, homepage, bugs, keywords, exports, types: './types/index.d.mts',
  sideEffects, files: ['dist', 'types', 'examples', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES', ...(changelog ? ['CHANGELOG.md'] : [])],
  engines: {node: '^20.16.0 || >=22.3.0'}}, null, 1) + '\n');

const measure = bytes => ({min: bytes.length, gzip: gzipSync(bytes, {level: 9}).length,
  brotli: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}}).length});
const sizes = {esbuild: esbuild.version, terser: terserVersion, node: process.version, version, files: {}, contents, modules: {}};
for (const file of (await readdir(dist)).filter(name => name.endsWith('.mjs')).sort()) sizes.files[file] = measure(await readFile(join(dist, file)));
const gz = file => sizes.files[file].gzip;
sizes.modules = {still: gz('index.mjs'), upload: gz('upload.mjs'), capture: gz('capture.mjs'), animation: gz('animation.mjs'), format: gz('format.mjs'),
  decode: gz('decode.mjs'), jpeg: gz('jpeg.mjs'), metadata: gz('metadata.mjs'), codec: gz('codec.mjs'), polyfill: gz('polyfill.mjs'), snapdom: gz('snapdom.mjs'),
  captureQueued: gz('codec.mjs') + gz('capture.worker.mjs'), uploadQueued: gz('codec.mjs') + gz('upload.worker.mjs'), stillQueued: gz('codec.mjs') + gz('still.worker.mjs')};
checkBudgets(sizes.modules);
let readme = await readFile(join(v7, 'README.md'), 'utf8');
const kb = bytes => Math.round(bytes / 1000).toLocaleString('en-US') + ' KB';
const others = JSON.parse(await readFile(join(codec, 'public/encoder-sizes.json'), 'utf8')).entries;
const smallest = names => others.filter(names).reduce((a, b) => a.total.minifiedGzip <= b.total.minifiedGzip ? a : b);
const otherEncoder = smallest(entry => entry.encoder), otherJPEG = smallest(entry => ['jxl-wasm', 'jpeg-to-jxl'].includes(entry.name)),
  otherDecoder = smallest(entry => entry.name === 'jxl-oxide-wasm');
const fill = {AUTO_GPU, ...Object.fromEntries(Object.entries(sizes.modules).map(([key, gzip]) => [key.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase() + '_KB', kb(gzip)]))};
for (const [key, entry] of [['OTHER_ENCODER', otherEncoder], ['OTHER_JPEG', otherJPEG], ['OTHER_DECODER', otherDecoder]])
  Object.assign(fill, {[key]: '`' + entry.name + '` ' + entry.version, [key + '_KB']: kb(entry.total.minifiedGzip)});
const uploadsFile = join(v7, 'uploads.json');
if (existsSync(uploadsFile)) {
  const {method, columns, rows} = JSON.parse(await readFile(uploadsFile, 'utf8'));
  fill.UPLOADS = method + '\n\n| | ' + columns.join(' | ') + ' |\n| --- |' + columns.map(() => ' ---: |').join('') + '\n' +
    rows.map(([label, ...values]) => '| ' + label + ' | ' + values.join(' | ') + ' |').join('\n');
  fill.UPLOADS_MEASURED = true;
  const split = (await readFile(join(codec, 'photo-v6.mjs'), 'utf8')).includes('yield {split:');
  const {helpers} = JSON.parse(await readFile(uploadsFile, 'utf8'));
  fill.HELPERS_SPEED = split ? helpers.split : helpers.noSplit;
  if (!fill.HELPERS_SPEED) throw new Error('v7/uploads.json lacks helpers.' + (split ? 'split' : 'noSplit'));
} else {
  const section = '__UPLOADS__\n\n';
  if (!readme.includes(section)) throw new Error('README.md: the __UPLOADS__ table moved');
  readme = readme.replace(section, '').replace(' __HELPERS_SPEED__', '');
  fill.UPLOADS_MEASURED = false;
  console.warn('README: no v7/uploads.json, so the README has no Uploads section and no Helpers speed sentence.');
}
const comparisonFile = join(v7, 'comparison.json');
const comparison = existsSync(comparisonFile) ? JSON.parse(await readFile(comparisonFile, 'utf8')) : {};
fill.COMPARISON_MEASURED = true;
for (const [, key] of readme.matchAll(/__(CMP_[A-Z0-9_]+)__/g)) {
  if (typeof comparison[key] === 'string') fill[key] = comparison[key];
  else { fill[key] = '…'; fill.COMPARISON_MEASURED = false; }
}
for (const [key, value] of Object.entries(fill)) if (typeof value === 'string') readme = readme.replaceAll('__' + key + '__', value);
if (/__[A-Z][A-Z_0-9]*__/.test(readme)) throw new Error('README.md placeholder left unfilled: ' + readme.match(/__[A-Z][A-Z_0-9]*__/)[0]);
await writeFile(join(out, 'README.md'), readme);
sizes.readme = fill;

const shipped = [];
for (const directory of ['dist', 'types', 'examples']) for (const file of (await readdir(join(out, directory), {recursive: true, withFileTypes: true})).filter(entry => entry.isFile()))
  shipped.push(relative(out, join(file.parentPath ?? file.path, file.name)));
shipped.push('package.json', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES', ...(changelog ? ['CHANGELOG.md'] : [])); shipped.sort();
const fileHashes = Object.fromEntries(await Promise.all(shipped.map(async file => [file, createHash('sha256').update(await readFile(join(out, file))).digest('hex')])));
sizes.distribution = {sha256: createHash('sha256').update(JSON.stringify(fileHashes)).digest('hex'), files: fileHashes,
  flags: {...common, banner: undefined, passes: ['one file: ' + ONE_FILE.join(','), 'workers: ' + WORKER_FILES.join(','), 'helpers: ' + HELPER_FILES.join(','), 'wasm, wasm-modules']}};
await writeFile(join(out, 'sizes.json'), JSON.stringify(sizes, null, 1) + '\n');
await writeFile(join(out, 'metafile.json'), JSON.stringify(built.metafile));
for (const [file, value] of Object.entries(sizes.files)) console.log(file.padEnd(20), 'gzip', value.gzip);
console.log('distribution sha256', sizes.distribution.sha256);

