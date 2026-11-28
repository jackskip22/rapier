// SPDX-License-Identifier: AGPL-3.0-only
import {readFile, writeFile, mkdir, rm, copyFile, cp, readdir, chmod} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join, dirname, resolve, relative, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {reportSizes} from './jxl-budgets.mjs';
import {shrinkShaders, shaderNames} from './jxl-shaders.mjs';
import {fillChangelogSection, jxlReleaseNotes, JXL_HISTORY_BASELINE} from './changelog.mjs';
import {notesPath} from './release-notes.mjs';
import {assertPhotoOwners, assertPhotoKernels} from './jxl-photo-owners.mjs';
import {allHazards, newDeadCalls} from './jxl-fold-hazards.mjs';
import {createKernelStripper, createBridgeCutter, kernelProfile, keptExports} from './jxl-kernel-strip.mjs';
import {bundleKernelNeeds} from './jxl-kernel-reach.mjs';
import {refuseDecoder, refuseBrowserVerifyDecoder, refuseSecondAnsWriter, refuseSecondRans, refuseSecondScorer, refuseOtherFormat} from './jxl-module-checks.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import {unsteppedSource} from './jxl-unstepped.mjs';
import {foldReached} from './jxl-fold-reached.mjs';
import {foldedButCalled, lostThrows, refuseAssumingOptions, provenDead, declarationLayouts, importCalls} from './jxl-bundle-checks.mjs';
import {UNSTEPPED, entryDefines} from './jxl-build-defines.mjs';
import {jpegaMeasurementSource} from './jxl-jpega-measure.mjs';
import {reservedProperties, scriptReserved, MODULE_CROSSING_RESERVED, crossingSeedEntries, verifyCrossingNames} from './jxl-property-mangle.mjs';
import {fillReadmeSizes} from './jxl-readme-sizes.mjs';
import {PROJECT_PARTS} from './jxl-package-files.mjs';
import {verifyWasmAssets} from './jxl-wasm-assets.mjs';
import {entryGroupedStores, chooseGroupedKey} from './jxl-grouped-key.mjs';
import {byteStoresFromMap, createPrecompiledWriter} from './jxl-precompiled.mjs';
import {precompiledMap} from './jxl-precompiled-map.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'), codec = join(repo, 'images/jxl'), v7 = join(codec, 'v7');
const {GPU_FROM} = await import(pathToFileURL(join(codec, 'gpu-gate.mjs')).href);
function autoGpuWords(table) {
  const pixels = n => n < 1 << 20 ? n.toLocaleString('en-US') + ' pixels' : n === 1 << 20 ? 'a megapixel' : n % (1 << 20) ? (n / (1 << 20)).toFixed(1) + ' megapixels' : n / (1 << 20) + ' megapixels';
  const {10: exact, ...lossy} = table;
  const exactWords = exact === undefined ? '' : `; exact encodes ${exact ? `of ${pixels(exact)} or more ` : ''}at effort 10`;
  return lossyGpuWords(lossy, pixels) + exactWords;
}
function lossyGpuWords(table, pixels) {
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
const CAPTURE_COMPRESS = {...SAFE_COMPRESS, inline: 1, passes: 2, lhs_constants: true};
const CAPTURE_COMPRESSED = /^(capture-complete|index|max|polyfill|resumable(\.node)?)\.mjs$/;
const PACKED_COMPRESS = {...CAPTURE_COMPRESS, passes: 3, inline: 3, reduce_funcs: true};
for (const [name, set] of [['one-pass', SAFE_COMPRESS], ['capture', CAPTURE_COMPRESS], ['packed', PACKED_COMPRESS]]) refuseAssumingOptions(name, set);
const PACKED = /^(animation|format|cli|wasm(-modules)?|index|max|capture(-complete)?|upload|jpeg(\.node)?|metadata|hdr|polyfill|serve(\.node)?|verify(\.node)?)\.mjs$/;
const COMPRESSED = /^(capture(-complete)?|upload(\.browser)?|helpers|index|max|jpeg(\.node)?|metadata|hdr|polyfill|serve(\.node)?|cli(-[\w-]+)?|resumable(\.node)?|verify(\.node)?)\.mjs$/;
const terserRoot = process.env.TERSER ? resolve(process.env.TERSER) : dirname(createRequire(import.meta.url).resolve('terser/package.json'));
const terser = createRequire(import.meta.url)(terserRoot), terserVersion = JSON.parse(await readFile(join(terserRoot, 'package.json'), 'utf8')).version;
if (terserVersion !== TERSER_VERSION) throw new Error('rapier-jxl 7.0 builds with terser ' + TERSER_VERSION + ', not ' + terserVersion + '.');
const finalMaps = process.env.JXL_MAPS ? (await import('./jxl-build-maps.mjs')).moduleMaps(terserRoot, process.env.JXL_MAPS) : null;
const version = '8.5.0';

if (existsSync(join(v7, 'CHANGELOG.md')) && !Object.hasOwn(JXL_HISTORY_BASELINE.notes, version)) {
  const early = await readFile(join(v7, 'CHANGELOG.md'), 'utf8');
  jxlReleaseNotes(fillChangelogSection(early, version, section => section), version, await readFile(join(repo, 'tools/fixtures', JXL_HISTORY_BASELINE.fixture), 'utf8'));
}

export const ONE_FILE = ['index', 'max', 'upload', 'capture', 'capture-complete', 'animation', 'format', 'decode', 'jpeg', 'metadata', 'hdr', 'polyfill', 'serve', 'verify', 'resumable'];
export const WASM_MODULES = ['index', 'max', 'upload', 'capture', 'capture-complete', 'animation', 'format', 'decode', 'jpeg', 'verify', 'resumable'];
export const WORKER_MODULES = ['index', 'max', 'upload', 'capture', 'capture-complete', 'animation', 'format', 'decode', 'jpeg'];
export const BROWSER_FILES = WORKER_MODULES.map(name => name + '.browser');
export const NODE_FILES = ['serve', 'jpeg', 'decode', 'verify', 'resumable'];
const MODULE_FILE = /^\.\/(index|max|upload|capture|capture-complete|animation|format|decode|jpeg|codec|helpers|capture-groups|verify)\.mjs$/;
const JPEGA_MEASUREMENT_OFF = process.env.JXL7_MEASURE_JPEGA_OFF === '1';
if (process.env.JXL7_MEASURE_JPEGA_OFF !== undefined && !['0', '1'].includes(process.env.JXL7_MEASURE_JPEGA_OFF))
  throw new Error('JXL7_MEASURE_JPEGA_OFF must be 0 or 1');
if (JPEGA_MEASUREMENT_OFF && (!process.env.JXL7_OUT || out === join(repo, 'dist/jxl7')))
  throw new Error('jpega-off measurement requires a separate JXL7_OUT; never write over the default package');
const common = {absWorkingDir: repo, bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'none', logLevel: 'warning',
  external: ['node:*'], define: {__RAPIER_JXL_VERSION__: JSON.stringify(version), __RAPIER_JXL_SAMPLE__: 'false', __RAPIER_JXL_PROBES__: 'false'}, banner: {js: '/*! rapier-jxl ' + version + ' | MIT */'}};

await rm(out, {recursive: true, force: true});
await mkdir(dist, {recursive: true});
const SHADER_FILE = /^(gpu-[\w-]+|int-ops)\.mjs$/;
const shaderMap = shaderNames(await Promise.all((await readdir(codec)).filter(name => SHADER_FILE.test(name)).map(name => readFile(join(codec, name), 'utf8'))));
const shaders = {name: 'shaders', setup(build) {
  build.onLoad({filter: /[\\/](gpu-[\w-]+|int-ops)\.mjs$/}, async ({path}) => ({contents: shrinkShaders(await readFile(path, 'utf8'), dirname(path) === codec ? shaderMap : null), loader: 'js'}));
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
const FOLD_FILTER = /\.mjs$/;
const probes = (folds = true, entry = '') => ({name: 'probes-out', setup(build) {
  if (folds) build.onLoad({filter: FOLD_FILTER}, async ({path}) => {
    if (!path.startsWith(codec + '/')) return undefined;
    const raw = await readFile(path, 'utf8'), text = /[\\/]capture-codec\.mjs$/.test(path) ? untimed(raw) : raw;
    const next = foldReached(path, text, entry);
    return next === raw ? undefined : {contents: next, loader: 'js', resolveDir: dirname(path)};
  });
  if (!folds) build.onLoad({filter: /[\\/]capture-codec\.mjs$/}, async ({path}) => ({contents: untimed(await readFile(path, 'utf8')), loader: 'js'}));
}});
const jpegaMeasurementPlugin = (entry, folds) => ({name: 'jpega-measurement-off', setup(build) {
  build.onLoad({filter: /[\\/](jfif|jpeg-reconstruction|jpeg-kernels)\.mjs$/}, async ({path}) => {
    const raw = jpegaMeasurementSource(path, await readFile(path, 'utf8'), true);
    return {contents: folds && (/^upload(\.|$)/.test(entry) || /[\\/]jpeg-kernels\.mjs$/.test(path)) ? foldReached(path, raw, entry) : raw,
      loader: 'js', resolveDir: dirname(path)};
  });
}});
const nativeDictionary = {name: 'native-dictionary', setup(build) {
  build.onResolve({filter: /(^|\/)brotli-dictionary\.mjs$/}, ({path, resolveDir}) =>
    resolve(resolveDir, path) === join(codec, 'brotli-dictionary.mjs') ? {path: join(codec, 'brotli-dictionary-native.mjs')} : undefined);
}};
const unsteppedFor = (entry = '') => ({name: 'unstepped', setup(build) {
  build.onLoad({filter: /\.mjs$/}, async ({path}) => {
    if (!path.startsWith(codec + '/')) return undefined;
    const text = await readFile(path, 'utf8'), switched = jpegaMeasurementSource(path, text, JPEGA_MEASUREMENT_OFF);
    const timed = /[\\/]capture-codec\.mjs$/.test(path) ? untimed(switched) : switched;
    const folded = foldReached(path, timed, entry), next = unsteppedSource(folded, {file: path, journal: join(codec, 'step-journal.mjs')});
    return next !== text ? {contents: next, loader: 'js', resolveDir: dirname(path)} : undefined;
  });
}});
const CLI_MODULES = ['emdash', 'astro', 'payload', 'add', 'workers', 'cloudflare', 'servers', 'places', 'site', 'selftest', 'epub'], CLI_MODULE = new RegExp('^\\./cli-(' + CLI_MODULES.join('|') + ')\\.mjs$');
const CLI_PARSER = './cli-acorn.mjs';
const cliParser = {name: 'cli-parser', setup(build) {
  build.onResolve({filter: /[\\/]agent[\\/]vendor[\\/]acorn\.mjs$/}, () => ({path: CLI_PARSER, external: true}));
}};
const moduleFiles = {name: 'module-files', setup(build) {
  build.onResolve({filter: /^\.\/(metadata|hdr)\.mjs$/}, ({path, importer}) => importer === join(v7, 'cli.mjs') ? {path, external: true} : undefined);
  build.onResolve({filter: CLI_MODULE}, ({path, importer}) =>
    importer === join(v7, 'cli.mjs') ? {path, external: true} : undefined);
  build.onResolve({filter: MODULE_FILE}, ({path, importer}) => importer === join(v7, 'cli.mjs') && path === './verify.mjs' ? {path: './verify.node.mjs', external: true}
    : importer === join(v7, 'codec-modules.mjs') || /[\\/](codec-(spec-[\w-]+|runner)|queue-spec-[\w-]+)\.mjs$/.test(importer) || importer === join(v7, 'cli.mjs') ? {path, external: true} : undefined);
}};
const browserVerify = {name: 'browser-verify', setup(build) {
  build.onResolve({filter: /(^|\/)verify-own\.mjs$/}, () => ({path: join(v7, 'verify-own.browser.mjs')}));
}};
const resumableVerify = {name: 'resumable-verify', setup(build) {
  build.onResolve({filter: /(^|\/)verify-own\.mjs$/}, () => ({path: join(v7, 'verify-own.resumable.mjs')}));
}};
const built = {metafile: {inputs: {}, outputs: {}, photoOwners: {}, planarFunctions: {}, kernelExports: {}, jpegKernelExports: {}, rebuildKernelExports: {}, decodeKernelExports: {}, kernelBridgesCut: {}, kernelMethodsCut: {}}}, contents = {};
const embeddedStores = new Map(), precompiledEntries = new Map();
const refusals = [];
const kernels = await createKernelStripper(codec), bridges = createBridgeCutter(codec), {KERNEL_EXPORTS} = await import(pathToFileURL(join(codec, 'kernel-sets.mjs')).href);
const groupedStores = new Map();
const sourceTexts = new Map(), sourceText = path => { if (!sourceTexts.has(path)) sourceTexts.set(path, readFile(path, 'utf8')); return sourceTexts.get(path); };
function planarFunctions(text) {
  const names = new Set(['encodeChannelsSteps', 'admitPlanarTransforms', 'admitPlanarSqueeze', 'channelLosslessSteps', 'modularPasses']), found = new Set();
  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) found.add(node.id.name);
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object') walk(child);
  })(acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'}));
  return [...found].sort();
}
async function oneFile(name, file = name + '.mjs', from = v7, plugins = []) {
  const define = {...common.define, ...entryDefines(name), ...(JPEGA_MEASUREMENT_OFF ? {__RAPIER_JXL_JPEGA__: 'false'} : {})};
  const probesOut = probes(true, name);
  const jpegaOff = JPEGA_MEASUREMENT_OFF ? [jpegaMeasurementPlugin(name, true)] : [];
  const jpegaUnfolded = JPEGA_MEASUREMENT_OFF ? [jpegaMeasurementPlugin(name, false)] : [];
  const names = {...common, minify: false, minifySyntax: true, banner: undefined, define, write: false, metafile: true, entryPoints: [join(from, file)], outfile: join(dist, name + '.mjs')};
  const first = await esbuild.build({...names, plugins: [moduleFiles, ...plugins, ...jpegaOff, probesOut]});
  const firstText = first.outputFiles.find(output => output.path.endsWith('.mjs')).text;
  const {unreached} = bundleKernelNeeds(firstText, kernels.exports, 'kernels');
  const readable = await esbuild.build({...names, plugins: [moduleFiles, ...plugins, ...jpegaOff, probesOut, bridges(unreached)]});
  const profile = kernelProfile(name), text = readable.outputFiles.find(output => output.path.endsWith('.mjs')).text;
  const unfolded = await esbuild.build({...names, plugins: [moduleFiles, ...plugins, ...jpegaUnfolded, probes(false, name), bridges(unreached)]});
  for (const cut of foldedButCalled(text, unfolded.outputFiles.find(output => output.path.endsWith('.mjs')).text))
    refusals.push(`${file}: ${cut.name} is cut by jxl-fold-reached.mjs (null at line ${cut.defined}) and ${cut.from} still calls it (line ${cut.line}).`);
  if (/^(index|max|still|animation|format)(\.|$)/.test(name)) {
    const held = built.metafile.planarFunctions[name] = planarFunctions(text);
    if (define.__RAPIER_JXL_STILL__ === 'true' && held.length)
      throw new Error(name + '.mjs holds an unreachable exact-planar coder: ' + held.join(', '));
  }
  const embeds = file => Object.values(readable.metafile.outputs).some(output =>
    Object.entries(output.inputs).some(([input, data]) => input.endsWith('/' + file) && data.bytesInOutput > 0));
  const keep = embeds('kernels-bytes.mjs') ? (({needs, optional}) => keptExports(name + '.mjs', needs, optional, profile ? KERNEL_EXPORTS[profile] : kernels.exports, profile))(
    bundleKernelNeeds(text, kernels.exports, 'kernels')) : null;
  const jpegKeep = embeds('jpeg-kernels-bytes.mjs') ? [...new Set(['memory', ...(({needs, optional}) =>
    keptExports(name + '.mjs', needs, optional, kernels.jpegExports, null))(bundleKernelNeeds(text, kernels.jpegExports, 'jpeg'))])].sort() : null;
  const engineKeep = (exports, family) => [...new Set(['memory', ...bundleKernelNeeds(text, exports, family).needs])].sort();
  const decodeKeep = embeds('decode-kernels-bytes.mjs') ? engineKeep(kernels.decodeExports, 'decode') : null;
  const rebuildKeep = embeds('rebuild-kernels-bytes.mjs') ? profile === 'upload'
    ? ['memory', 'block8', 'lfPrepare', 'gabRows', 'epf', 'xyb', 'srgb8Build', 'srgb8', 'rgba', 'transposeCells8'] : engineKeep(kernels.rebuildExports, 'rebuild') : null;
  if (profile === 'upload' && rebuildKeep && /function renderVarBlock\d*\s*\(/.test(text)) throw new Error(file + ' reaches the generic inverse outside its rebuild kernel profile.');
  built.metafile.kernelExports[name] = keep;
  built.metafile.kernelBridgesCut[name] = unreached;
  built.metafile.jpegKernelExports[name] = jpegKeep;
  built.metafile.rebuildKernelExports[name] = rebuildKeep;
  built.metafile.decodeKernelExports[name] = decodeKeep;
  built.metafile.kernelMethodsCut[name] = {};
  // leave whitespace to terser, which keeps them (KEPT_COMMENTS). It also drops /* @__PURE__ */, so upload leaves whitespace
  const spaced = BROWSER_FILES.includes(name) || name === 'polyfill' || name === 'upload' ? {minify: false, minifySyntax: true, minifyIdentifiers: true} : {};
  const result = await esbuild.build({...common, ...spaced, define, metafile: true, sourcemap: 'external', plugins: [moduleFiles, shaders, ...plugins, ...jpegaOff, probesOut, bridges(unreached), kernels({kernels: keep, jpeg: jpegKeep, rebuild: rebuildKeep, decode: decodeKeep})],
    entryPoints: [join(from, file)], outfile: join(dist, name + '.mjs')});
  const {metafile} = result;
  const mapPath = join(dist, name + '.mjs.map');
  let map; try { map = JSON.parse(await readFile(mapPath, 'utf8')); } finally { await rm(mapPath, {force: true}); }
  finalMaps?.set(name + '.mjs', map);
  groupedStores.set(name + '.mjs', entryGroupedStores(map));
  if (WASM_MODULES.includes(name) || name === 'resumable.node')
    embeddedStores.set(name, byteStoresFromMap(map, {outfile: join(dist, name + '.mjs'), codec}));
  for (const key of Object.keys(metafile.outputs)) if (key.endsWith('.map')) delete metafile.outputs[key];
  built.metafile.photoOwners[name] = assertPhotoOwners(await readFile(join(dist, name + '.mjs'), 'utf8'), map, name + '.mjs');
  Object.assign(built.metafile.inputs, metafile.inputs); Object.assign(built.metafile.outputs, metafile.outputs);
  const [output] = Object.values(metafile.outputs);
  const loads = output.imports.filter(edge => name === 'verify'
    || /^(index|max|still|upload|capture)([.-]|$)/.test(name) && edge.path.endsWith('/verify.mjs')
    || !(edge.external && (edge.path.startsWith('node:') || MODULE_FILE.test(edge.path) || name === 'cli' &&
      (edge.path === './verify.node.mjs' || (CLI_MODULE.test(edge.path) || edge.path === './metadata.mjs' || edge.path === './hdr.mjs') && edge.kind === 'dynamic-import')
      || /^cli-/.test(name) && edge.path === CLI_PARSER)));
  if (loads.length) throw new Error(file + ' is not one file: ' + loads.map(edge => edge.path).join(', '));
  const splits = WORKER_MODULES.includes(name) ? importCalls(await readFile(join(dist, name + '.mjs'), 'utf8')) : [];
  if (splits.length) throw new Error(file + ' calls import(' + splits.map(call => call.source).join('), import(') + '): a classic worker build cannot split it');
  if (name === 'resumable.node' && output.imports.length) throw new Error('resumable.node.mjs must have no external imports.');
  contents[name] = Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path);
  if (!/^max(\.|$)/.test(name)) {
    const ten = contents[name].filter(path => /\/(effort-ten|photo-effort-ten|tree-device)\.mjs$/.test(path));
    if (ten.length) throw new Error(name + '.mjs holds effort 10 outside jpegxl/max: ' + ten.join(', '));
  }
  refuseDecoder(name, contents[name]);
  refuseSecondScorer(name, contents[name], keep ?? []);
  refuseOtherFormat(name, await readFile(join(dist, name + '.mjs'), 'utf8'));
  refuseBrowserVerifyDecoder(name, contents[name]);
  refuseSecondAnsWriter(name, [...(keep ? [{name: 'kernels', exports: keep}] : []), ...(jpegKeep ? [{name: 'jpeg', exports: jpegKeep}] : [])]);
  refuseSecondRans(name, await Promise.all(contents[name].filter(path => path.endsWith('.mjs')).map(async path => [path, await sourceText(join(repo, path))])));
}
for (const name of ONE_FILE) await oneFile(name, undefined, undefined, name === 'verify' || name === 'resumable' ? [browserVerify] : UNSTEPPED.test(name) ? [unsteppedFor(name)] : []);
for (const name of BROWSER_FILES) await oneFile(name, name + '.mjs', v7);
for (const name of BROWSER_FILES) {
  const held = WORKER_MODULES.filter(module => contents[name].some(input => input.endsWith('/v7/' + module + '.mjs')));
  const loads = importCalls(await readFile(join(dist, name + '.mjs'), 'utf8')).filter(call => /^["'`]/.test(call.source));
  if (held.length || loads.length) throw new Error(name + '.mjs holds or loads a module: ' + [...held, ...loads.map(call => call.source)].join(', '));
}
for (const name of NODE_FILES) {
  await oneFile(name + '.node', name + '.mjs', v7, [nativeDictionary, ...(name === 'resumable' ? [resumableVerify] : []), ...(UNSTEPPED.test(name) ? [unsteppedFor(name + '.node')] : [])]);
  const dictionary = file => contents[file].some(input => input.endsWith('/brotli-dictionary.mjs'));
  if (dictionary(name + '.node') || !['verify', 'resumable'].includes(name) && !dictionary(name)) throw new Error(name + '.node.mjs holds the dictionary text, or ' + name + '.mjs lacks it');
}
{
  const outside = ['capture-photo.mjs','capture-vardct.mjs','photo-xyb.mjs','photo-dct.mjs','v7/client.mjs','v7/session.mjs']
    .filter(file => contents.capture.some(input => input.endsWith('/' + file)));
  if (outside.length) throw new Error('Lean capture holds ' + outside.join(', '));
  const higher = ['capture-ans.mjs', 'capture-trees.mjs', 'gpu-capture.mjs'], root = ['vardct.mjs', 'varblocks.mjs', 'ans.mjs', 'entropy.mjs', 'gpu-core.mjs', 'photo-v6.mjs', 'photo-v6-search.mjs'];
  for (const [name, barred] of [['capture', [...higher, 'ans-core.mjs', 'capture-ans-regions.mjs', ...root]], ['upload', ['gpu-capture.mjs', 'parallel-drive.mjs']]]) {
    const held = barred.filter(file => contents[name].some(input => input.endsWith('/' + file)));
    if (held.length) throw new Error(name + '.mjs holds ' + held.join(', '));
  }
  for (const [name, inputs] of Object.entries(contents)) if (inputs.some(input => /\/sampled[\w-]*\.mjs$/.test(input))) throw new Error(name + '.mjs holds a second Modular learner (sampled*.mjs)');
}
await oneFile('cli', undefined, undefined, [unsteppedFor('cli')]);
for (const name of CLI_MODULES) await oneFile('cli-' + name, undefined, undefined, [cliParser]);
await oneFile('cli-acorn', 'acorn.mjs', join(repo, 'agent/vendor'));
if (contents.cli.some(input => new RegExp('/(?:' + CLI_MODULES.map(name => 'cli-' + name).join('|') + '|selftest|acorn)\\.mjs$').test(input)))
  throw new Error('cli.mjs eagerly bundles an integration\'s setup, the self-test or the parser');
for (const [name, inputs] of Object.entries(contents)) if (UNSTEPPED.test(name) && inputs.some(input => /\/resumable(-journal)?\.mjs$/.test(input)))
  throw new Error(name + '.mjs is built unstepped but holds the resumable driver');
await oneFile('helpers');
{
  const outside = ['photo-split.mjs', 'kernels.mjs', 'capture-codec.mjs', 'vardct.mjs']
    .filter(file => contents.helpers.some(input => input.endsWith('/' + file)));
  if (outside.length) throw new Error('helpers.mjs holds encoder code: ' + outside.join(', '));
}
await oneFile('capture-groups');
for (const name of WORKER_MODULES) {
  const spawns = ['v7/client.mjs', 'v7/codec-runner.mjs', 'parallel-spawn.mjs', 'parallel.mjs', 'parallel-worker.mjs'].filter(file => contents[name].some(input => input.endsWith('/' + file)))
    .concat(contents[name].filter(input => /\/v7\/codec-spec-[\w-]+\.mjs$/.test(input)));
  if (spawns.length) throw new Error(name + '.mjs reaches a spawn site: ' + spawns.join(', '));
  if (/new Worker\(new URL\(/.test(await readFile(join(dist, name + '.mjs'), 'utf8'))) throw new Error(name + '.mjs names a worker file');
}
for (const [name, inputs] of Object.entries(contents)) if (/^capture-(photo|complete)(\.|$)/.test(name)) {
  const outside = ['photo-plan.mjs', 'photo-advanced.mjs', 'hybrid.mjs', 'parallel-drive.mjs', 'parallel-serve.mjs', 'photo-v6-blocks.mjs', 'block-split.mjs']
    .filter(file => inputs.some(input => input.endsWith('/' + file)));
  if (outside.length) throw new Error(name + '.mjs holds a route outside its capture profile: ' + outside.join(', '));
}
for (const [name, inputs] of Object.entries(contents)) {
  const stale = ['v7/run-codec.mjs'].filter(file => inputs.some(input => input.endsWith('/' + file)));
  if (stale.length) throw new Error(name + ' holds the default helper\'s runner: ' + stale.join(', '));
  if (/^(index|max|still|upload|capture)([.-]|$)/.test(name) && inputs.some(input => /\/v7\/(?:verify(?:-[^/]+)?|result-identity)\.mjs$/.test(input)))
    throw new Error(name + ' holds the separate verifier.');
}
{
  const OUTSIDE = ['photo-v6-blocks.mjs', 'varblocks.mjs', 'aq.mjs', 'photo-v6-search.mjs', 'gpu-core.mjs', 'photo-advanced.mjs', 'score.mjs', 'local.mjs', 'butteraugli.mjs', 'parallel-drive.mjs', 'parallel-serve.mjs',
    'channels.mjs', 'planar-transforms.mjs', 'planar-squeeze.mjs', 'planar-input.mjs', 'weighted-custom.mjs',
    'exact-ladder.mjs', 'palette-search.mjs', 'screen-local.mjs',
    'photo-plan.mjs', 'v7/preparation-plan.mjs'];
  const holds = (file, inputs) => { const outside = OUTSIDE.filter(name => inputs.some(input => input.endsWith('/' + name))); if (outside.length) throw new Error(file + ' holds ' + outside.join(', ')); };
  holds('upload.mjs', contents.upload);
}
for (const name of ['index', 'max', 'upload', 'animation', 'format'])
  if ((await readFile(join(dist, name + '.mjs'), 'utf8')).includes('OpenEXR')) throw new Error(name + '.mjs holds the OpenEXR reader');
await oneFile('wasm-modules', 'wasm-modules.mjs', codec);

async function assertSameAnswers(source, file, module, compress) {
  const minify = set => terser.minify(source, {module, ecma: 2020, compress: set, mangle: false}).then(result => result.code);
  const [base, code] = [await minify(SAFE_COMPRESS), await minify(compress)];
  const added = newDeadCalls(base, code);
  if (added.length) refusals.push(`${file}: the multi-pass minifier wrote ${added.length} call(s) on a literal undefined or null that the one-pass set does not: ${added.join('; ').slice(0, 300)}; it folded a callback away.`);
  const kept = new Set(lostThrows(source, base).map(lost => lost.message));
  for (const lost of lostThrows(source, code)) if (!kept.has(lost.message) && !provenDead(file, lost.message)) refusals.push(`${file}: the multi-pass minifier deleted the refusal "${lost.message.slice(0, 60)}" (${await sourceOf(lost.message)}).`);
}
{
  const trigger = allHazards([join(repo, 'images/jxl')]).filter(h => h.param && h.chained && !h.file.includes('/examples/'));
  if (trigger.length) throw new Error('A parameter is assigned a constant in a closure that an optional chain follows, which terser folds:\n' +
    trigger.map(h => `${h.file}:${h.line} ${h.name}`).join('\n'));
}
const sourceFiles = [];
async function sourceOf(message) {
  if (!sourceFiles.length) for (const dir of [codec, v7]) for (const name of await readdir(dir)) if (name.endsWith('.mjs')) sourceFiles.push([relative(repo, join(dir, name)), await readFile(join(dir, name), 'utf8')]);
  for (const [name, text] of sourceFiles) { const at = text.indexOf(message.replace(/'/g, "\\'")); if (at >= 0) return `${name}:${text.slice(0, at).split('\n').length}`; }
  return 'source not found';
}
// The license line, and the two words that tell webpack and Vite to leave a module's import of its own file to the host
const KEPT_COMMENTS = /^!|^ (webpackIgnore: true|@vite-ignore) $/;
const scripts = (await readdir(dist)).filter(file => /\.m?js$/.test(file)).sort();
const baseReserved = await reservedProperties(repo, []);
const scriptSources = new Map(await Promise.all(scripts.map(async file => [file, await readFile(join(dist, file), 'utf8')])));
const scriptResByFile = new Map([...scriptSources].map(([file, text]) => [file, scriptReserved(text)]));
verifyCrossingNames(scriptSources, baseReserved, scriptResByFile);
const seededEntries = crossingSeedEntries(), shortenedProperties = new Map(seededEntries);
const propertiesFor = (file, raw) => {
  if (/^cli/.test(file)) return {options: false, cache: null};
  const cache = {props: new Map(seededEntries)};
  const reserved = [...new Set([...baseReserved, ...MODULE_CROSSING_RESERVED, ...(scriptResByFile.get(file) ?? scriptReserved(raw))])];
  return {options: {reserved, keep_quoted: 'strict', cache}, cache};
};
for (const file of [...scripts, ...(await readdir(dist)).filter(file => !scripts.includes(file))]) {
  const path = join(dist, file), module = file.endsWith('.mjs');
  const command = file === 'cli.mjs', unstripped = scriptSources.get(file) ?? await readFile(path, 'utf8'), source = unstripped.replace(/^#![^\n]*\n/, '');
  const {options: propOptions, cache: fileCache} = propertiesFor(file, unstripped);
  let {code, map} = await terser.minify(source, {module, ecma: 2020, compress: PACKED.test(file) ? PACKED_COMPRESS : COMPRESSED.test(file) && (CAPTURE_COMPRESSED.test(file) ? CAPTURE_COMPRESS : SAFE_COMPRESS), mangle: {properties: propOptions}, format: {comments: KEPT_COMMENTS},
    ...(finalMaps && {sourceMap: finalMaps.options(file, source !== unstripped)})});
  if (fileCache?.props) for (const [name, mangled] of fileCache.props) if (!shortenedProperties.has(name)) shortenedProperties.set(name, mangled);
  const mappedCode = finalMaps && code;
  if (module && (PACKED.test(file) || CAPTURE_COMPRESSED.test(file))) await assertSameAnswers(source, file, module, PACKED.test(file) ? PACKED_COMPRESS : CAPTURE_COMPRESS);
  if (module) {
    const layouts = declarationLayouts(code);
    if (layouts.length > 1) {
      const brotli = text => brotliCompressSync(text, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}}).length;
      let bytes = brotli(code);
      for (const packed of layouts.slice(1)) {
        const size = brotli(packed);
        if (size < bytes) {code = packed; bytes = size;}
      }
    }
  }
  if (command) code = '#!/usr/bin/env node\n' + code;
  const keyed = await chooseGroupedKey(code, groupedStores.get(file), terser);
  if (finalMaps) await finalMaps.write(file, mappedCode, code, map, keyed);
  if (keyed) code = keyed.code;
  assertPhotoKernels(code, file);
  await writeFile(path, code);
  if (command) await chmod(path, 0o755);
  for (const [key, output] of Object.entries(built.metafile.outputs)) if (basename(key) === file) output.bytes = Buffer.byteLength(code);
}
if (refusals.length) throw new Error('The package would answer differently from the source:\n' + refusals.join('\n'));

const {wasmBytes} = await import(join(codec, 'wasm-text.mjs'));
const {KERNELS, SIMD_PROBE} = await import(join(codec, 'kernels-bytes.mjs'));
const {JPEG_KERNELS} = await import(join(codec, 'jpeg-kernels-bytes.mjs'));
const {DECODE_KERNELS} = await import(join(codec, 'decode-kernels-bytes.mjs'));
const {REBUILD_KERNELS} = await import(join(codec, 'rebuild-kernels-bytes.mjs'));
const {JPEG_GENERAL_ROWS} = await import(join(codec, 'jpeg-general-rows-bytes.mjs'));
for (const [name, text] of [['kernels',KERNELS],['jpeg',JPEG_KERNELS],['decode',DECODE_KERNELS],['rebuild',REBUILD_KERNELS]])
  await writeFile(join(dist, name + '.wasm'), wasmBytes(text));
await writeFile(join(dist, 'general.wasm'), Buffer.from(JPEG_GENERAL_ROWS, 'base64'));
built.metafile.wasmAssets = await verifyWasmAssets({dist, codec});
const {S2_FUSED} = await import(join(codec, 'ssimulacra2-fused-bytes.mjs'));
const byteIdentity = (bytes, source) => ({bytes, source, sha256: createHash('sha256').update(bytes).digest('hex')});
const precompiledWriter = await createPrecompiledWriter({
  assets: Object.fromEntries(await Promise.all(built.metafile.wasmAssets.modules.map(async asset =>
    [asset.name, {bytes: await readFile(join(dist, asset.file)), sha256: asset.sha256, source: asset.source}]))),
  probe: byteIdentity(wasmBytes(SIMD_PROBE), 'kernels-bytes.mjs#SIMD_PROBE'),
  fused: byteIdentity(wasmBytes(S2_FUSED), 'ssimulacra2-fused-bytes.mjs#S2_FUSED')});
built.metafile.precompiled = {};
async function precompiledEntry(entry, supplied) {
  if (precompiledEntries.has(entry)) return precompiledEntries.get(entry);
  const file = entry + '.mjs', target = entry + '.precompiled', targetFile = target + '.mjs';
  const source = await readFile(join(dist, file), 'utf8');
  const result = await precompiledWriter({code: source, supplied, file: targetFile, stores: embeddedStores.get(entry) ?? []});
  built.metafile.precompiled[file] = result.provenance;
  if (!result.edits.length) { precompiledEntries.set(entry, entry); return entry; }
  await writeFile(join(dist, targetFile), result.code);
  contents[target] = contents[entry];
  const original = Object.entries(built.metafile.outputs).find(([path]) => basename(path) === file);
  if (!original) throw new Error(file + ': missing original output for precompiled copy');
  const [originalPath, output] = original;
  built.metafile.outputs[relative(repo, join(dist, targetFile))] = {bytes: Buffer.byteLength(result.code),
    imports: output.imports, exports: output.exports, entryPoint: output.entryPoint,
    inputs: Object.fromEntries(Object.keys(output.inputs).map(path => [path, {}])),
    derivedFrom: originalPath, inputByteCounts: 'not measured after byte-store removal'};
  if (finalMaps) {
    const map = JSON.parse(await readFile(join(resolve(process.env.JXL_MAPS), file + '.map'), 'utf8'));
    const mapped = precompiledMap(map, source, result.code, result.edits, targetFile,
      createRequire(join(terserRoot, 'package.json'))('@jridgewell/source-map'));
    await writeFile(join(resolve(process.env.JXL_MAPS), targetFile + '.map'), JSON.stringify(mapped));
  }
  precompiledEntries.set(entry, target);
  return target;
}
const conditions = name => ({workerd: `./dist/${name}.workerd.mjs`, 'edge-light': `./dist/${name}.edge-light.mjs`});
for (const condition of ['workerd','edge-light']) {
  const load = name => `import ${name} from './${name}.wasm${condition === 'edge-light' ? '?module' : ''}';`, names = ['kernels','jpeg','decode','general'];
  for (const name of WASM_MODULES) {
    const entry = name === 'resumable' ? 'resumable.node' : name, held = contents[entry] ?? [];
    const holds = file => held.some(path => path.endsWith('/' + file));
    const own = [['kernels', holds('kernels-bytes.mjs')], ['jpeg', holds('jpeg-kernels-bytes.mjs')], ['decode', holds('decode-kernels-bytes.mjs')],
      ['rebuild', holds('rebuild-kernels-bytes.mjs') && !holds('decode-kernels-bytes.mjs')], ['general', holds('jpeg-general-rows-bytes.mjs')]].filter(([, held]) => held).map(([module]) => module);
    const used = name === 'resumable' && !own.length ? names : own;
    const target = await precompiledEntry(entry, used);
    const lines = used.map(load);
    if (used.length) lines.push("import {provideWasm} from './wasm-modules.mjs';", `provideWasm({${used.join(',')}});`);
    lines.push(`export * from './${target}.mjs';`);
    await writeFile(join(dist, `${name}.${condition}.mjs`), lines.join('\n') + '\n');
  }
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
await mkdir(join(out, 'skills/rapier-jxl'), {recursive: true});
await copyFile(join(v7, 'skills/rapier-jxl/SKILL.md'), join(out, 'skills/rapier-jxl/SKILL.md'));
await cp(join(v7, 'bench'), join(out, 'bench'), {recursive: true});
if (existsSync(join(v7, 'webp-comparison.md'))) await copyFile(join(v7, 'webp-comparison.md'), join(out, 'bench', 'webp-comparison.md'));
const changelog = existsSync(join(v7, 'CHANGELOG.md'));
const webpFiguresFile = join(v7, 'size-figures.json');
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

const EXAMPLES = ['polyfill.html', 'node-png-to-jxl.mjs', 'jpeg-exact.mjs', 'browser-no-bundler.html', 'decode-to-canvas.html', '09-browser-upload-queue.html', '09-browser-upload-queue.mjs', 'page-rects.js', 'page-rects.d.ts', 'svg-jxl.js', 'svg-jxl.d.ts', 'snapdom', 'emdash', 'astro', 'files', 'vite', 'webpack', 'next', 'netlify', 'upload-widgets', 'workers', 'r2', 'agents', 'void', 'wordpress', 'payload', 'android', 'capacitor'];
await mkdir(join(out, 'examples'), {recursive: true});
for (const file of EXAMPLES) await cp(join(v7, 'examples', file), join(out, 'examples', file), {recursive: true,
  filter: path => {
    const parts = relative(join(v7, 'examples', file), path).split(/[\\/]/);
    if (parts.some(part => part === 'node_modules' || part === 'registry')) return false;
    if (file !== 'android' && file !== 'capacitor') return true;
    return !parts.some(part => ['build', 'dist', '.gradle', '.idea'].includes(part)) &&
      !['local.properties', 'package-lock.json'].includes(parts.at(-1)) && !(file === 'capacitor' && parts[0] === 'android');
  }});
const PLACE_PARTS = {ios: ['Package.swift', 'Sources', 'prepare-assets.mjs'], flutter: ['pubspec.yaml', 'lib', 'assets', 'prepare-assets.mjs'],
  'react-native': ['src', 'web', 'prepare-assets.mjs'], electron: ['main.mjs', 'preload.cjs', 'prepare-assets.mjs'], tauri: ['prepare-assets.mjs', 'src-tauri/src/main.rs'],
  desktop: ['index.html', 'app.mjs', 'prepare.mjs']};
for (const [example, parts] of Object.entries(PLACE_PARTS)) for (const part of parts)
  await cp(join(v7, 'examples', example, part), join(out, 'examples', example, part), {recursive: true,
    filter: path => !relative(join(v7, 'examples', example, part), path).split(/[\\/]/).some(name => name === 'jpegxl' || name === 'node_modules') && !path.endsWith('selftest.ts')});
const PACKED_EXAMPLES = [...EXAMPLES.filter(file => !Object.hasOwn(PROJECT_PARTS, file)), ...Object.keys(PLACE_PARTS),
  ...Object.entries(PROJECT_PARTS).flatMap(([name, parts]) => parts.map(part => name + '/' + part))].map(path => 'examples/' + path);
for (const path of PACKED_EXAMPLES) if (!existsSync(join(out, path))) throw new Error(path + ' is listed for the package and was not built');
const exports = {};
for (const name of ONE_FILE) exports[name === 'index' ? '.' : './' + name] = {types: `./types/${name}.d.mts`, ...(WASM_MODULES.includes(name) && conditions(name)),
  ...(NODE_FILES.includes(name) ? {node: `./dist/${name}.node.mjs`} : WORKER_MODULES.includes(name) && {node: `./dist/${name}.mjs`}),
  ...(BROWSER_FILES.includes(name + '.browser') && {browser: `./dist/${name}.browser.mjs`}), import: `./dist/${name}.mjs`};
exports['./page-rects'] = {types: './examples/page-rects.d.ts', import: './examples/page-rects.js'};
exports['./svg-jxl'] = {types: './examples/svg-jxl.d.ts', import: './examples/svg-jxl.js'};
exports['./emdash'] = {types: './examples/emdash/index.d.ts', browser: './examples/emdash/server-only.mjs', import: './examples/emdash/index.mjs'};
exports['./package.json'] = './package.json';
const browser = Object.fromEntries(Object.entries(exports).filter(([, value]) => value.import).map(([key, value]) => [key === '.' ? './index.js' : key, value.browser ?? value.import]));
const sideEffects = ['./dist/polyfill.mjs', ...WORKER_MODULES.map(name => `./dist/${name}.mjs`),
  ...WORKER_MODULES.filter(name => precompiledEntries.get(name) !== name).map(name => `./dist/${precompiledEntries.get(name)}.mjs`),
  ...WASM_MODULES.flatMap(name => Object.values(conditions(name)))];
const PEERS = {emdash: '>=1.5.0 <2.0.0', '@emdash-cms/cloudflare': '>=1.5.0 <2.0.0', '@cloudflare/kumo': '>=2.6.0', astro: '>=6.0.0', react: '>=18.0.0'};
const {repository, homepage, bugs, keywords} = JSON.parse(await readFile(join(codec, 'package.json'), 'utf8'));
await writeFile(join(out, 'package.json'), JSON.stringify({name: 'rapier-jxl', version, type: 'module', license: 'MIT',
  description: 'JPEG XL encoder and decoder in WebAssembly for browsers, Node and Cloudflare Workers, with no native dependencies. Page captures with exact text, fast uploads, animation, lossless JPEG recompression.', repository, homepage, bugs, keywords, bin: {'rapier-jxl': 'dist/cli.mjs'}, exports, browser, types: './types/index.d.mts',
  sideEffects, peerDependencies: PEERS, peerDependenciesMeta: Object.fromEntries(Object.keys(PEERS).map(name => [name, {optional: true}])),
  files: ['dist', 'types', ...PACKED_EXAMPLES, 'skills', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES'],
  engines: {node: '>=22.3.0'}}, null, 1) + '\n');

const measure = bytes => ({min: bytes.length, gzip: gzipSync(bytes, {level: 9}).length,
  brotli: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT}}).length});
const sizes = {esbuild: esbuild.version, terser: terserVersion, node: process.version, version, files: {}, contents, modules: {}};
for (const file of (await readdir(dist)).filter(name => name.endsWith('.mjs')).sort()) sizes.files[file] = measure(await readFile(join(dist, file)));
const gz = file => sizes.files[file].gzip;
sizes.modules = {still: gz('index.mjs'), max: gz('max.mjs'), upload: gz('upload.mjs'), capture: gz('capture.mjs'),
  captureComplete: gz('capture-complete.mjs'), animation: gz('animation.mjs'), format: gz('format.mjs'),
  decode: gz('decode.mjs'), jpeg: gz('jpeg.mjs'), verify: gz('verify.mjs'), decodeNode: gz('decode.node.mjs'), jpegNode: gz('jpeg.node.mjs'), serveNode: gz('serve.node.mjs'), metadata: gz('metadata.mjs'), hdr: gz('hdr.mjs'), polyfill: gz('polyfill.mjs'), serve: gz('serve.mjs'), cli: gz('cli.mjs'), cliSetup: gz('cli-emdash.mjs'), cliSelftest: gz('cli-selftest.mjs'),
  captureQueued: gz('capture.browser.mjs') + gz('capture.mjs'),
  captureCompleteQueued: gz('capture-complete.browser.mjs') + gz('capture-complete.mjs'), uploadQueued: gz('upload.browser.mjs') + gz('upload.mjs'), stillQueued: gz('index.browser.mjs') + gz('index.mjs'), maxQueued: gz('max.browser.mjs') + gz('max.mjs')};
const br = file => sizes.files[file].brotli;
sizes.modulesBrotli = Object.fromEntries(Object.entries({still: ['index.mjs'], max: ['max.mjs'], upload: ['upload.mjs'], capture: ['capture.mjs'],
  captureComplete: ['capture-complete.mjs'], animation: ['animation.mjs'], format: ['format.mjs'], decode: ['decode.mjs'], jpeg: ['jpeg.mjs'],
  metadata: ['metadata.mjs'], hdr: ['hdr.mjs'], polyfill: ['polyfill.mjs'], serve: ['serve.mjs'], cli: ['cli.mjs'], cliSetup: ['cli-emdash.mjs'], cliSelftest: ['cli-selftest.mjs'], verify: ['verify.mjs'],
  captureQueued: ['capture.browser.mjs', 'capture.mjs'], captureCompleteQueued: ['capture-complete.browser.mjs', 'capture-complete.mjs'],
  uploadQueued: ['upload.browser.mjs', 'upload.mjs'], stillQueued: ['index.browser.mjs', 'index.mjs'], maxQueued: ['max.browser.mjs', 'max.mjs']}).map(([key, files]) => [key, files.reduce((sum, file) => sum + br(file), 0)]));
console.log(reportSizes(sizes.modules));
for (const file of ['cli.mjs', ...CLI_MODULES.map(name => 'cli-' + name + '.mjs')]) {
  const {min, gzip, brotli} = sizes.files[file];
  console.log(`${file} raw ${min} gzip ${gzip} brotli ${brotli}`);
}
let readme = fillReadmeSizes(fillWebp('README.md', await readFile(join(v7, 'README.md'), 'utf8')), sizes.files);
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
await rm(notesPath(out), {force: true});
if (changelog && !Object.hasOwn(JXL_HISTORY_BASELINE.notes, version)) {
  const sourceChangelog = await readFile(join(v7, 'CHANGELOG.md'), 'utf8');
  const filled = fillChangelogSection(sourceChangelog, version, section => {
    let current = fillWebp('CHANGELOG.md', section.replaceAll('__AUTO_GPU__', AUTO_GPU));
    for (const [key, value] of Object.entries(fill)) if (typeof value === 'string') current = current.replaceAll('__' + key + '__', value);
    return current.replaceAll('__RELEASE_DATE__', process.env.RAPIER_RELEASE_DATE || new Date().toISOString().slice(0, 10));
  });
  const notes = jxlReleaseNotes(filled, version, await readFile(join(repo, 'tools/fixtures', JXL_HISTORY_BASELINE.fixture), 'utf8'));
  if (/__[A-Z][A-Z_0-9]*__/.test(notes)) throw new Error('release notes placeholder left unfilled: ' + notes.match(/__[A-Z][A-Z_0-9]*__/)[0]);
  await writeFile(notesPath(out), notes);
  sizes.notes = createHash('sha256').update(notes).digest('hex');
}

const [{files: packed}] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--silent', out], {encoding: 'utf8', cwd: tmpdir()}));
const shipped = packed.map(({path}) => path).sort();
for (const path of PACKED_EXAMPLES) if (!shipped.some(file => file === path || file.startsWith(path + '/'))) throw new Error(path + ' is listed for the package and npm does not pack it');
const fileHashes = Object.fromEntries(await Promise.all(shipped.map(async file => [file, createHash('sha256').update(await readFile(join(out, file))).digest('hex')])));
sizes.distribution = {sha256: createHash('sha256').update(JSON.stringify(fileHashes)).digest('hex'), files: fileHashes,
  flags: {...common, banner: undefined, passes: ['one file: ' + ONE_FILE.join(','), 'their own workers: ' + WORKER_MODULES.join(','), 'wasm, wasm-modules', 'terser safe compress: ' + COMPRESSED.source]}};
await writeFile(join(out, 'sizes.json'), JSON.stringify(sizes, null, 1) + '\n');
{
  const {encoderDecoderInputs, captureRebuildInputs} = await import('./jxl-encoder-inputs.mjs'), carried = encoderDecoderInputs(built.metafile);
  const named = list => list.map(({output, inputs}) => output + ' (' + inputs.join(', ') + ')').join('; ');
  if (carried.length) throw new Error('An encoder module carries a decoder: ' + named(carried));
  const rebuilt = captureRebuildInputs(built.metafile);
  if (rebuilt.length) throw new Error('A capture module carries the encoders\' rebuild: ' + named(rebuilt));
}
built.metafile.distributionSha256 = sizes.distribution.sha256;
built.metafile.shortenedProperties = Object.fromEntries([...shortenedProperties].sort());
{
  const {runtimeNames} = await import('./jxl-runtime-names.mjs'), shortened = runtimeNames(codec).filter(name => Object.hasOwn(built.metafile.shortenedProperties, name));
  if (shortened.length) throw new Error('The build shortened names the codec reads by a runtime string: ' + shortened.join(', '));
}
await writeFile(join(out, 'metafile.json'), JSON.stringify(built.metafile));
for (const [file, value] of Object.entries(sizes.files)) console.log(file.padEnd(20), 'gzip', value.gzip);
console.log('distribution sha256', sizes.distribution.sha256);


