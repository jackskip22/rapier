// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, writeFile, mkdir, rm, copyFile, cp, readdir, chmod} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join, dirname, resolve, relative, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {reportSizes} from './jxl-budgets.mjs';
import {shrinkShaders} from './jxl-shaders.mjs';
import {fillChangelogSection, stageJxlChangelog, JXL_HISTORY_BASELINE} from './changelog.mjs';
import {assertPhotoOwners, assertPhotoKernels} from './jxl-photo-owners.mjs';
import {createKernelStripper, createBridgeCutter, kernelProfile, keptExports} from './jxl-kernel-strip.mjs';
import {bundleKernelNeeds} from './jxl-kernel-reach.mjs';
import {refuseDecoder, refuseBrowserVerifyDecoder, refuseSecondAnsWriter, refuseSecondRans, refuseSecondScorer, refuseOtherFormat} from './jxl-module-checks.mjs';
import acorn from '../agent/vendor/acorn.mjs';

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
const SAFE_COMPRESS = {defaults: false, dead_code: true, conditionals: true, booleans: true, sequences: true, join_vars: true, if_return: true,
  evaluate: true, unused: true, comparisons: true, side_effects: true, directives: true, loops: true, properties: true, switches: true, typeofs: true,
  reduce_vars: true, collapse_vars: true, hoist_funs: true};
const CAPTURE_COMPRESS = {...SAFE_COMPRESS, inline: 1, passes: 2, pure_new: true, lhs_constants: true};
const COMPRESSED = /^(capture(-complete)?(\.worker)?|upload(\.worker)?|index|still\.worker|codec)\.mjs$/;
const terserRoot = process.env.TERSER ? resolve(process.env.TERSER) : dirname(createRequire(import.meta.url).resolve('terser/package.json'));
const terser = createRequire(import.meta.url)(terserRoot), terserVersion = JSON.parse(await readFile(join(terserRoot, 'package.json'), 'utf8')).version;
if (terserVersion !== TERSER_VERSION) throw new Error('rapier-jxl 7.0 builds with terser ' + TERSER_VERSION + ', not ' + terserVersion + '.');
const version = '8.3.0';

export const ONE_FILE = ['index', 'upload', 'capture', 'capture-complete', 'animation', 'format', 'decode', 'jpeg', 'metadata', 'codec', 'polyfill', 'serve', 'verify', 'storage', 'resumable'];
export const WASM_MODULES = ['index', 'upload', 'capture', 'capture-complete', 'animation', 'format', 'decode', 'jpeg', 'verify'];
export const WORKER_FILES = ['still', 'upload', 'capture', 'capture-complete', 'capture-complete.groups', 'animation', 'format', 'decode', 'jpeg'];
export const HELPER_FILES = ['still', 'upload', 'animation', 'format', 'capture-complete'];
export const NODE_FILES = ['serve', 'jpeg', 'decode', 'verify'];
const MODULE_FILE = /^\.\/(index|upload|capture|capture-complete|animation|format|decode|jpeg|codec|helpers|capture-groups|verify)\.mjs$/;
const common = {absWorkingDir: repo, bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'none', logLevel: 'warning',
  external: ['node:*'], define: {__RAPIER_JXL_VERSION__: JSON.stringify(version), __RAPIER_JXL_SAMPLE__: 'false', __RAPIER_JXL_PROBES__: 'false'}, banner: {js: '/*! rapier-jxl ' + version + ' | MIT */'}};

await rm(out, {recursive: true, force: true});
await mkdir(dist, {recursive: true});
const shaders = {name: 'shaders', setup(build) {
  build.onLoad({filter: /[\\/](gpu-[\w-]+|int-ops)\.mjs$/}, async ({path}) => ({contents: shrinkShaders(await readFile(path, 'utf8')), loader: 'js'}));
}};
function untimed(text) {
  const pure = node => node.type === 'Literal' || node.type === 'Identifier' || node.type === 'ConditionalExpression' && [node.test, node.consequent, node.alternate].every(pure);
  for (;;) {
    const calls = [];
    (function walk(node) {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'timed' && node.arguments.length === 2 && pure(node.arguments[0])) calls.push(node);
      for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object') walk(child);
    })(acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'}));
    const call = calls.find(outer => !calls.some(inner => inner !== outer && inner.start > outer.start && inner.end <= outer.end));
    if (!call) return text;
    const work = call.arguments[1], arrow = work.type === 'ArrowFunctionExpression' && !work.params.length && !work.async && work.body.type !== 'BlockStatement';
    text = text.slice(0, call.start) + '(' + (arrow ? text.slice(work.body.start, work.body.end) + ')' : text.slice(work.start, work.end) + ')()') + text.slice(call.end);
  }
}
const probesOut = {name: 'probes-out', setup(build) {
  build.onLoad({filter: /[\\/]capture-codec\.mjs$/}, async ({path}) => ({contents: untimed(await readFile(path, 'utf8')), loader: 'js'}));
}};
const nativeDictionary = {name: 'native-dictionary', setup(build) {
  build.onResolve({filter: /(^|\/)brotli-dictionary\.mjs$/}, ({path, resolveDir}) =>
    resolve(resolveDir, path) === join(codec, 'brotli-dictionary.mjs') ? {path: join(codec, 'brotli-dictionary-native.mjs')} : undefined);
}};
const moduleFiles = {name: 'module-files', setup(build) {
  build.onResolve({filter: MODULE_FILE}, ({path, importer}) => importer === join(v7, 'cli.mjs') && path === './verify.mjs' ? {path: './verify.node.mjs', external: true}
    : importer === join(v7, 'codec-modules.mjs') || importer === join(v7, 'cli.mjs') ? {path, external: true} : undefined);
}};
const browserVerify = {name: 'browser-verify', setup(build) {
  build.onResolve({filter: /(^|\/)verify-own\.mjs$/}, () => ({path: join(v7, 'verify-own.browser.mjs')}));
}};
const built = {metafile: {inputs: {}, outputs: {}, photoOwners: {}, kernelExports: {}, jpegKernelExports: {}, kernelBridgesCut: {}}}, contents = {};
const kernels = await createKernelStripper(codec), bridges = createBridgeCutter(codec), {KERNEL_EXPORTS} = await import(pathToFileURL(join(codec, 'kernel-sets.mjs')).href);
const sourceTexts = new Map(), sourceText = path => { if (!sourceTexts.has(path)) sourceTexts.set(path, readFile(path, 'utf8')); return sourceTexts.get(path); };
async function oneFile(name, file = name + '.mjs', from = v7, plugins = []) {
  const define = {...common.define, __RAPIER_JXL_UPLOAD__: String(/^upload(\.|$)/.test(name)), __RAPIER_JXL_JPEG__: String(/^jpeg(\.|$)/.test(name)),
    __RAPIER_JXL_CAPTURE_LEAN__: String(/^capture(\.|$)/.test(name)),
    __RAPIER_JXL_CAPTURE_DEEP__: String(!/^(capture|upload)(\.|$)/.test(name)),
    __RAPIER_JXL_CAPTURE_PHOTO__: String(/^capture-(photo|complete)(\.|$)/.test(name)),
    __RAPIER_JXL_METADATA__: String(/^metadata(\.|$)/.test(name)),
    __RAPIER_JXL_SAMPLE__: String(name === 'verify')};
  const names = {...common, minify: false, minifySyntax: true, banner: undefined, define, write: false, metafile: true, entryPoints: [join(from, file)], outfile: join(dist, name + '.mjs')};
  const first = await esbuild.build({...names, plugins: [moduleFiles, probesOut, ...plugins]});
  const {unreached, capturePhotoAtLoad} = bundleKernelNeeds(first.outputFiles.find(output => output.path.endsWith('.mjs')).text, kernels.exports);
  const readable = await esbuild.build({...names, plugins: [moduleFiles, probesOut, bridges(unreached, !capturePhotoAtLoad), ...plugins]});
  const profile = kernelProfile(name), text = readable.outputFiles.find(output => output.path.endsWith('.mjs')).text;
  const embeds = file => Object.keys(readable.metafile.inputs).some(input => input.endsWith('/' + file));
  const keep = embeds('kernels-bytes.mjs') ? (({needs, optional}) => keptExports(name + '.mjs', needs, optional, profile ? KERNEL_EXPORTS[profile] : kernels.exports, profile, text))(
    bundleKernelNeeds(text, kernels.exports)) : null;
  const jpegKeep = embeds('jpeg-kernels-bytes.mjs') ? [...new Set(['memory', ...keptExports(name + '.mjs', new Set(), new Set(), kernels.jpegExports, null, text)])].sort() : null;
  built.metafile.kernelExports[name] = keep;
  built.metafile.kernelBridgesCut[name] = capturePhotoAtLoad ? [...unreached, 'capture-kernels PHOTO_KERNELS'] : unreached;
  built.metafile.jpegKernelExports[name] = jpegKeep;
  const result = await esbuild.build({...common, define, metafile: true, sourcemap: 'external', plugins: [moduleFiles, shaders, probesOut, bridges(unreached, !capturePhotoAtLoad), kernels({kernels: keep, jpeg: jpegKeep}), ...plugins],
    entryPoints: [join(from, file)], outfile: join(dist, name + '.mjs')});
  const {metafile} = result;
  const mapPath = join(dist, name + '.mjs.map');
  let map; try { map = JSON.parse(await readFile(mapPath, 'utf8')); } finally { await rm(mapPath, {force: true}); }
  for (const key of Object.keys(metafile.outputs)) if (key.endsWith('.map')) delete metafile.outputs[key];
  built.metafile.photoOwners[name] = assertPhotoOwners(await readFile(join(dist, name + '.mjs'), 'utf8'), map, name + '.mjs');
  Object.assign(built.metafile.inputs, metafile.inputs); Object.assign(built.metafile.outputs, metafile.outputs);
  const [output] = Object.values(metafile.outputs);
  const loads = output.imports.filter(edge => name === 'verify'
    || /^(index|still|upload|capture)([.-]|$)/.test(name) && edge.path.endsWith('/verify.mjs')
    || !(edge.external && (edge.path.startsWith('node:') || MODULE_FILE.test(edge.path) || name === 'cli' && edge.path === './verify.node.mjs')));
  if (loads.length) throw new Error(file + ' is not one file: ' + loads.map(edge => edge.path).join(', '));
  contents[name] = Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path);
  refuseDecoder(name, contents[name]);
  refuseSecondScorer(name, contents[name], keep ?? []);
  refuseOtherFormat(name, await readFile(join(dist, name + '.mjs'), 'utf8'));
  refuseBrowserVerifyDecoder(name, contents[name]);
  refuseSecondAnsWriter(name, [...(keep ? [{name: 'kernels', exports: keep}] : []), ...(jpegKeep ? [{name: 'jpeg', exports: jpegKeep}] : [])]);
  refuseSecondRans(name, await Promise.all(contents[name].filter(path => path.endsWith('.mjs')).map(async path => [path, await sourceText(join(repo, path))])));
}
for (const name of ONE_FILE) await oneFile(name, undefined, undefined, name === 'verify' ? [browserVerify] : []);
for (const name of NODE_FILES) {
  await oneFile(name + '.node', name + '.mjs', v7, [nativeDictionary]);
  const dictionary = file => contents[file].some(input => input.endsWith('/brotli-dictionary.mjs'));
  if (dictionary(name + '.node') || name !== 'verify' && !dictionary(name)) throw new Error(name + '.node.mjs holds the dictionary text, or ' + name + '.mjs lacks it');
}
{
  const outside = ['capture-photo.mjs','capture-vardct.mjs','photo-xyb.mjs','photo-dct.mjs','v7/client.mjs','v7/session.mjs','v7/worker-runtime.mjs']
    .filter(file => contents.capture.some(input => input.endsWith('/' + file)));
  if (outside.length) throw new Error('Lean capture holds ' + outside.join(', '));
  const higher = ['capture-ans.mjs', 'capture-trees.mjs', 'gpu-capture.mjs'], root = ['vardct.mjs', 'varblocks.mjs', 'ans.mjs', 'entropy.mjs', 'gpu-core.mjs', 'photo-v6.mjs', 'photo-v6-search.mjs'];
  for (const [name, barred] of [['capture', [...higher, 'ans-core.mjs', 'capture-ans-regions.mjs', ...root]], ['upload', ['gpu-capture.mjs']]]) {
    const held = barred.filter(file => contents[name].some(input => input.endsWith('/' + file)));
    if (held.length) throw new Error(name + '.mjs holds ' + held.join(', '));
  }
}
await oneFile('cli');
for (const name of WORKER_FILES) await oneFile(name + '.worker', name + '.worker.mjs');
for (const name of HELPER_FILES) await oneFile(name + '.helper', name + '.helper.mjs');
await oneFile('helpers');
await oneFile('capture-groups');
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
  if (/^(index|still|upload|capture)([.-]|$)/.test(name) && inputs.some(input => /\/v7\/(?:verify(?:-[^/]+)?|result-identity)\.mjs$/.test(input)))
    throw new Error(name + ' holds the separate verifier.');
}
{
  const OUTSIDE = ['photo-v6-blocks.mjs', 'varblocks.mjs', 'aq.mjs', 'photo-v6-search.mjs', 'gpu-core.mjs', 'photo-advanced.mjs', 'score.mjs', 'local.mjs', 'butteraugli.mjs', 'parallel-drive.mjs', 'parallel-serve.mjs',
    'channels.mjs', 'planar-transforms.mjs', 'planar-squeeze.mjs', 'planar-input.mjs', 'weighted-custom.mjs',
    'exact-ladder.mjs', 'palette-search.mjs', 'screen-local.mjs',
    'photo-plan.mjs', 'v7/preparation-plan.mjs'];
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
  const command = file === 'cli.mjs', source = (await readFile(path, 'utf8')).replace(/^#![^\n]*\n/, '');
  let {code} = await terser.minify(source, {module, ecma: 2020, compress: COMPRESSED.test(file) && (/^capture-/.test(file) ? CAPTURE_COMPRESS : SAFE_COMPRESS), mangle: true, format: {comments: /^!/}});
  if (module) {
    const original = code, parse = text => acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'}).body;
    const nodes = parse(original), functions = [], statements = [];
    for (const node of nodes) (node.type === 'FunctionDeclaration' ? functions : statements).push(original.slice(node.start, node.end));
    if (functions.length > 1) {
      let count = 0; while (nodes[count]?.directive) count++;
      const directives = statements.slice(0, count), prefix = original.slice(0, nodes[0].start), suffix = original.slice(nodes.at(-1).end);
      const brotli = text => brotliCompressSync(text, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}}).length;
      let bytes = brotli(code);
      for (const order of [[...statements, ...functions], [...directives, ...functions, ...statements.slice(count)]]) {
        const packed = prefix + order.join('\n') + suffix, body = parse(packed);
        let end = 0; while (body[end]?.directive) end++;
        if (end !== count || body.slice(0, end).some((node, i) => packed.slice(node.start, node.end) !== directives[i])) continue;
        const size = brotli(packed);
        if (size < bytes) {code = packed; bytes = size;}
      }
    }
  }
  if (command) code = '#!/usr/bin/env node\n' + code;
  assertPhotoKernels(code, file);
  await writeFile(path, code);
  if (command) await chmod(path, 0o755);
  for (const [key, output] of Object.entries(built.metafile.outputs)) if (basename(key) === file) output.bytes = Buffer.byteLength(code);
}

const {wasmBytes} = await import(join(codec, 'wasm-text.mjs'));
const {KERNELS} = await import(join(codec, 'kernels-bytes.mjs'));
const {JPEG_KERNELS} = await import(join(codec, 'jpeg-kernels-bytes.mjs'));
const {DECODE_KERNELS} = await import(join(codec, 'decode-kernels-bytes.mjs'));
for (const [name, text] of [['kernels',KERNELS],['jpeg',JPEG_KERNELS],['decode',DECODE_KERNELS]])
  await writeFile(join(dist, name + '.wasm'), wasmBytes(text));
const conditions = name => ({workerd: `./dist/${name}.workerd.mjs`, 'edge-light': `./dist/${name}.edge-light.mjs`});
for (const condition of ['workerd','edge-light']) {
  const load = name => `import ${name} from './${name}.wasm${condition === 'edge-light' ? '?module' : ''}';`, names = ['kernels','jpeg','decode'];
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
await copyFile(join(v7, 'SKILL.md'), join(out, 'SKILL.md'));
if (existsSync(join(v7, 'webp-comparison.md'))) { await mkdir(join(out, 'bench'), {recursive: true}); await copyFile(join(v7, 'webp-comparison.md'), join(out, 'bench', 'webp-comparison.md')); }
const changelog = existsSync(join(v7, 'CHANGELOG.md'));
const webpFiguresFile = join(v7, 'webp-figures.json');
const webpFigures = existsSync(webpFiguresFile) ? JSON.parse(await readFile(webpFiguresFile, 'utf8')).figures : {};
const positive = line => (!line.includes('__WEBP_UNDER_092__') || 2 * Number(webpFigures.UNDER_092) > Number(webpFigures.CASES_092))
  && (!line.includes('__WEBP_SAME_BYTES_BETTER__') || (2 * Number(webpFigures.SAME_BYTES_BETTER) > Number(webpFigures.SAME_BYTES_CASES)
    && Number(webpFigures.SAME_BYTES_S2_GAIN) > 0 && Number(webpFigures.SAME_BYTES_CVVDP_GAIN) > 0));
const speed = () => Number(webpFigures.TIME_RATIO) <= 1.25 ? " and about WebP's speed" : '';
const fillWebp = (name, text) => text.split('\n').filter(line => {
  const missing = [...line.matchAll(/__WEBP_([A-Z0-9_]+)__/g)].map(([, key]) => key).filter(key => key !== 'AND_SPEED' && typeof webpFigures[key] !== 'string');
  const keep = missing.length === 0 && positive(line);
  if (!keep) console.log(name + ': left out, ' + (missing.length ? 'no figure for ' + missing.join(', ') : 'not a positive claim') + ': ' + line.trim());
  return keep;
}).map(line => line.replace('__WEBP_AND_SPEED__', speed()).replace('__WEBP_SAME_BYTES_BETTER__ of __WEBP_SAME_BYTES_CASES__',
  all => webpFigures.SAME_BYTES_BETTER === webpFigures.SAME_BYTES_CASES ? 'all __WEBP_SAME_BYTES_CASES__' : all))
  .map(line => !line.includes('__WEBP_UNDER_092__') ? line : webpFigures.UNDER_092 === webpFigures.CASES_092
  ? line.replace('__WEBP_UNDER_092__ of __WEBP_CASES_092__', 'all __WEBP_CASES_092__')
  : line.replace(/\.$/, '; the rest are being worked on for ' + version.split('.').slice(0, 2).join('.') + '.x.'))
  .join('\n').replace(/__WEBP_([A-Z0-9_]+)__/g, (all, key) => webpFigures[key]);

const EXAMPLES = ['polyfill.html', '09-browser-upload-queue.html', '09-browser-upload-queue.mjs', 'page-rects.js', 'page-rects.d.ts', 'svg-jxl.js', 'svg-jxl.d.ts', 'snapdom'];
await mkdir(join(out, 'examples'), {recursive: true});
for (const file of EXAMPLES) await cp(join(v7, 'examples', file), join(out, 'examples', file), {recursive: true,
  filter: path => !relative(join(v7, 'examples', file), path).split(/[\\/]/).some(part => part === 'node_modules' || part === 'registry')});
const exports = {};
for (const name of ONE_FILE) exports[name === 'index' ? '.' : './' + name] = {types: `./types/${name}.d.mts`, ...(WASM_MODULES.includes(name) && conditions(name)),
  ...(NODE_FILES.includes(name) && {node: `./dist/${name}.node.mjs`}), import: `./dist/${name}.mjs`};
exports['./wasm'] = {types: './types/wasm.d.mts', ...conditions('wasm'), import: './dist/wasm.mjs'};
exports['./page-rects'] = {types: './examples/page-rects.d.ts', import: './examples/page-rects.js'};
exports['./svg-jxl'] = {types: './examples/svg-jxl.d.ts', import: './examples/svg-jxl.js'};
exports['./package.json'] = './package.json';
const sideEffects = ['./dist/polyfill.mjs', ...WORKER_FILES.map(name => `./dist/${name}.worker.mjs`), ...HELPER_FILES.map(name => `./dist/${name}.helper.mjs`),
  ...[...WASM_MODULES, 'wasm'].flatMap(name => Object.values(conditions(name)))];
const {repository, homepage, bugs, keywords} = JSON.parse(await readFile(join(codec, 'package.json'), 'utf8'));
await writeFile(join(out, 'package.json'), JSON.stringify({name: 'rapier-jxl', version, type: 'module', license: 'MIT',
  description: 'JPEG XL in JavaScript and WebAssembly with WebGPU for high efforts.', repository, homepage, bugs, keywords, bin: {'rapier-jxl': 'dist/cli.mjs'}, exports, types: './types/index.d.mts',
  sideEffects, files: ['dist', 'types', 'examples', 'LICENSE', 'README.md', 'SKILL.md', 'THIRD_PARTY_NOTICES', ...(changelog ? ['CHANGELOG.md'] : [])],
  engines: {node: '^20.16.0 || >=22.3.0'}}, null, 1) + '\n');

const measure = bytes => ({min: bytes.length, gzip: gzipSync(bytes, {level: 9}).length,
  brotli: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}}).length});
const sizes = {esbuild: esbuild.version, terser: terserVersion, node: process.version, version, files: {}, contents, modules: {}};
for (const file of (await readdir(dist)).filter(name => name.endsWith('.mjs')).sort()) sizes.files[file] = measure(await readFile(join(dist, file)));
const gz = file => sizes.files[file].gzip;
sizes.modules = {still: gz('index.mjs'), upload: gz('upload.mjs'), capture: gz('capture.mjs'),
  captureComplete: gz('capture-complete.mjs'), captureCompleteWorker: gz('capture-complete.worker.mjs'), animation: gz('animation.mjs'), format: gz('format.mjs'),
  decode: gz('decode.mjs'), jpeg: gz('jpeg.mjs'), verify: gz('verify.mjs'), decodeNode: gz('decode.node.mjs'), jpegNode: gz('jpeg.node.mjs'), serveNode: gz('serve.node.mjs'), metadata: gz('metadata.mjs'), codec: gz('codec.mjs'), polyfill: gz('polyfill.mjs'), serve: gz('serve.mjs'), storage: gz('storage.mjs'), cli: gz('cli.mjs'),
  captureQueued: gz('codec.mjs') + gz('capture.worker.mjs'),
  captureCompleteQueued: gz('codec.mjs') + gz('capture-complete.worker.mjs'), uploadQueued: gz('codec.mjs') + gz('upload.worker.mjs'), stillQueued: gz('codec.mjs') + gz('still.worker.mjs')};
const br = file => sizes.files[file].brotli;
sizes.modulesBrotli = Object.fromEntries(Object.entries({still: ['index.mjs'], upload: ['upload.mjs'], capture: ['capture.mjs'],
  captureComplete: ['capture-complete.mjs'], animation: ['animation.mjs'], format: ['format.mjs'], decode: ['decode.mjs'], jpeg: ['jpeg.mjs'],
  metadata: ['metadata.mjs'], codec: ['codec.mjs'], polyfill: ['polyfill.mjs'], serve: ['serve.mjs'], storage: ['storage.mjs'], cli: ['cli.mjs'], verify: ['verify.mjs'],
  captureQueued: ['codec.mjs', 'capture.worker.mjs'], captureCompleteQueued: ['codec.mjs', 'capture-complete.worker.mjs'],
  uploadQueued: ['codec.mjs', 'upload.worker.mjs'], stillQueued: ['codec.mjs', 'still.worker.mjs']}).map(([key, files]) => [key, files.reduce((sum, file) => sum + br(file), 0)]));
console.log(reportSizes(sizes.modules));
let readme = fillWebp('README.md', await readFile(join(v7, 'README.md'), 'utf8'));
const kb = bytes => Math.round(bytes / 1000).toLocaleString('en-US') + ' KB';
const others = JSON.parse(await readFile(join(codec, 'public/encoder-sizes.json'), 'utf8')).entries;
const smallest = names => others.filter(names).reduce((a, b) => a.total.minifiedGzip <= b.total.minifiedGzip ? a : b);
const otherEncoder = smallest(entry => entry.encoder), otherJPEG = smallest(entry => ['jxl-wasm', 'jpeg-to-jxl'].includes(entry.name)),
  otherDecoder = smallest(entry => entry.name === 'jxl-oxide-wasm');
const fill = {AUTO_GPU, ...Object.fromEntries(Object.entries(sizes.modules).map(([key, gzip]) => [key.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase() + '_KB', kb(gzip)])),
  ...Object.fromEntries(Object.entries(sizes.modulesBrotli).map(([key, bytes]) => [key.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase() + '_BROTLI_KB', kb(bytes)]))};
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
  readme = readme.replace('__UPLOADS__\n\n', '').replace(' __HELPERS_SPEED__', '');
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
if (changelog) {
  const sourceChangelog = await readFile(join(v7, 'CHANGELOG.md'), 'utf8');
  const releaseChangelog = Object.hasOwn(JXL_HISTORY_BASELINE.sections, version) ? sourceChangelog :
    stageJxlChangelog(sourceChangelog, version, await readFile(join(repo, 'tools/fixtures/jxl-published-v8.2.0.md'), 'utf8'));
  const text = fillChangelogSection(releaseChangelog, version, section => {
    let current = fillWebp('CHANGELOG.md', section.replaceAll('__AUTO_GPU__', AUTO_GPU));
    for (const [key, value] of Object.entries(fill)) if (typeof value === 'string') current = current.replaceAll('__' + key + '__', value);
    return current.replaceAll('__RELEASE_DATE__', process.env.RAPIER_RELEASE_DATE || new Date().toISOString().slice(0, 10));
  });
  if (/__[A-Z][A-Z_0-9]*__/.test(text)) throw new Error('CHANGELOG.md placeholder left unfilled: ' + text.match(/__[A-Z][A-Z_0-9]*__/)[0]);
  await writeFile(join(out, 'CHANGELOG.md'), text);
}

const shipped = [];
for (const directory of ['dist', 'types', 'examples']) for (const file of (await readdir(join(out, directory), {recursive: true, withFileTypes: true})).filter(entry => entry.isFile()))
  shipped.push(relative(out, join(file.parentPath ?? file.path, file.name)));
shipped.push('package.json', 'LICENSE', 'README.md', 'SKILL.md', 'THIRD_PARTY_NOTICES', ...(changelog ? ['CHANGELOG.md'] : [])); shipped.sort();
const fileHashes = Object.fromEntries(await Promise.all(shipped.map(async file => [file, createHash('sha256').update(await readFile(join(out, file))).digest('hex')])));
sizes.distribution = {sha256: createHash('sha256').update(JSON.stringify(fileHashes)).digest('hex'), files: fileHashes,
  flags: {...common, banner: undefined, passes: ['one file: ' + ONE_FILE.join(','), 'workers: ' + WORKER_FILES.join(','), 'helpers: ' + HELPER_FILES.join(','), 'wasm, wasm-modules', 'terser safe compress: ' + COMPRESSED.source]}};
await writeFile(join(out, 'sizes.json'), JSON.stringify(sizes, null, 1) + '\n');
{
  const {encoderDecoderInputs, captureRebuildInputs} = await import('./jxl-encoder-inputs.mjs'), carried = encoderDecoderInputs(built.metafile);
  const named = list => list.map(({output, inputs}) => output + ' (' + inputs.join(', ') + ')').join('; ');
  if (carried.length) throw new Error('An encoder module carries a decoder: ' + named(carried));
  const rebuilt = captureRebuildInputs(built.metafile);
  if (rebuilt.length) throw new Error('A capture module carries the encoders\' rebuild: ' + named(rebuilt));
}
await writeFile(join(out, 'metafile.json'), JSON.stringify(built.metafile));
for (const [file, value] of Object.entries(sizes.files)) console.log(file.padEnd(20), 'gzip', value.gzip);
console.log('distribution sha256', sizes.distribution.sha256);


