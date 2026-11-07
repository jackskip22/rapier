// SPDX-License-Identifier: MIT
import {join, resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import acorn from '../agent/vendor/acorn.mjs';
import {pathToFileURL} from 'node:url';

let optimizer;
async function binaryen() {
  if (!optimizer) optimizer = import(process.env.BINARYEN_MODULE
    ? pathToFileURL(resolve(process.env.BINARYEN_MODULE)).href : 'binaryen')
    .then(module => module.default).catch(cause => {
      optimizer = undefined;
      throw new Error('Kernel stripping needs build-time binaryen@123.0.0; set BINARYEN_MODULE to its index.js.', {cause});
    });
  return optimizer;
}

export function kernelProfile(name) {
  if (/^capture-complete(?:\.|$)/.test(name)) return 'capture-complete';
  if (/^capture(?:\.|$)/.test(name)) return 'capture';
  if (/^upload(?:\.|$)/.test(name)) return 'upload';
  if (/^jpeg(?:\.|$)/.test(name)) return 'jpeg';
  if (name === 'verify') return 'verify';
  return null;
}

export async function stripKernelExports(bytes, keep, implementation) {
  const original = new WebAssembly.Module(bytes), exports = WebAssembly.Module.exports(original);
  const names = new Set(keep);
  if (names.size !== keep.length) throw new Error('Duplicate kernel export in the entry profile.');
  for (const name of names) if (!exports.some(item => item.name === name)) throw new Error('Missing canonical kernel export: ' + name);
  const api = implementation || await binaryen(), module = api.readBinary(bytes);
  try {
    module.setFeatures(api.Features.SIMD128 | api.Features.BulkMemory | api.Features.BulkMemoryOpt | api.Features.NontrappingFPToInt);
    for (const item of exports) if (!names.has(item.name)) module.removeExport(item.name);
    module.runPasses(['remove-unused-module-elements']);
    if (!module.validate()) throw new Error('The stripped kernel module is invalid.');
    const result = module.emitBinary();
    const emitted = WebAssembly.Module.exports(new WebAssembly.Module(result)).map(item => item.name).sort();
    if (JSON.stringify(emitted) !== JSON.stringify([...names].sort())) throw new Error('The stripped kernel interface differs from its entry profile.');
    return result;
  } finally { module.dispose(); }
}

export async function createKernelStripper(codec) {
  const [{wasmBytes, storedWasmByte, KEY}, store, jpegStore] = await Promise.all([
    import(pathToFileURL(join(codec, 'wasm-text.mjs')).href),
    import(pathToFileURL(join(codec, 'kernels-bytes.mjs')).href), import(pathToFileURL(join(codec, 'jpeg-kernels-bytes.mjs')).href)
  ]);
  const stores = {
    kernels: {file: join(codec, 'kernels-bytes.mjs'), filter: /[\\/]kernels-bytes\.mjs$/, full: wasmBytes(store.KERNELS),
      text: kernels => 'export const KERNELS = ' + JSON.stringify(kernels) + ';\nexport const SIMD_PROBE = ' + JSON.stringify(store.SIMD_PROBE) + ';\n'},
    jpeg: {file: join(codec, 'jpeg-kernels-bytes.mjs'), filter: /[\\/]jpeg-kernels-bytes\.mjs$/, full: wasmBytes(jpegStore.JPEG_KERNELS),
      text: kernels => 'export const JPEG_KERNELS = ' + JSON.stringify(kernels) + ';\n'},
  }, cache = new Map();
  for (const store of Object.values(stores)) store.exports = WebAssembly.Module.exports(new WebAssembly.Module(store.full)).map(item => item.name);
  const plugin = keep => ({name: 'one-kernel-set', setup(build) {
    const sets = Array.isArray(keep) ? {kernels: keep} : keep ?? {};
    for (const [name, list] of Object.entries(sets)) {
      if (!list) continue;
      const {file, filter, full, text} = stores[name], key = name + ':' + [...list].sort().join(' ');
      build.onLoad({filter}, async ({path}) => {
        if (resolve(path) !== resolve(file)) return;
        if (!cache.has(key)) cache.set(key, (async () => {
          const bytes = await stripKernelExports(full, [...list].sort());
          const stored = Uint8Array.from(bytes, byte => storedWasmByte(byte) ^ KEY);
          const kept = Buffer.from(stored).toString('latin1');
          if (!Buffer.from(wasmBytes(kept)).equals(Buffer.from(bytes))) throw new Error('The stripped kernel bytes do not round-trip.');
          return text(kept);
        })());
        return {contents: await cache.get(key), loader: 'js'};
      });
    }
  }});
  plugin.exports = stores.kernels.exports;
  plugin.jpegExports = stores.jpeg.exports;
  return plugin;
}

export function keptExports(file, needs, optional, allowed, profile, text) {
  const gaps = profile ? [...needs].filter(name => !allowed.includes(name) && !optional.has(name)) : [];
  if (gaps.length) throw new Error(file + ' calls kernel exports its profile (' + profile + ', kernel-sets.mjs) strips: ' + gaps.sort().join(', '));
  if (typeof text !== 'string') throw new Error('keptExports needs the file\'s names-kept bundle.');
  const named = namesIn(text);
  return allowed.filter(name => named.has(name)).sort();
}

const namesSeen = new Map();
function namesIn(text) {
  if (namesSeen.has(text)) return namesSeen.get(text);
  const names = new Set();
  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') names.add(node.name);
    else if (node.type === 'Literal' && typeof node.value === 'string') names.add(node.value);
    else if (node.type === 'TemplateElement') names.add(node.value.cooked);
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object') walk(child);
  })(acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'module'}));
  namesSeen.clear(); namesSeen.set(text, names);
  return names;
}

export function createBridgeCutter(codec) {
  const file = join(codec, 'kernels.mjs'), capture = join(codec, 'capture-kernels.mjs');
  const FALLBACK = "(typeof __RAPIER_JXL_CAPTURE_PHOTO__ === 'undefined' || __RAPIER_JXL_CAPTURE_PHOTO__ === true ? PHOTO_KERNELS : null);";
  return (unreached, photoBridges = true) => ({name: 'kernel-bridges', setup(build) {
    if (unreached?.length) build.onLoad({filter: /[\\/]kernels\.mjs$/}, async ({path}) => {
      if (resolve(path) !== resolve(file)) return;
      const source = await readFile(file, 'utf8');
      return {contents: cutBridges(source, unreached), loader: 'js'};
    });
    if (!photoBridges) build.onLoad({filter: /[\\/]capture-kernels\.mjs$/}, async ({path}) => {
      if (resolve(path) !== resolve(capture)) return;
      const source = await readFile(capture, 'utf8');
      if (source.split(FALLBACK).length !== 2) throw new Error('capture-kernels.mjs photoKernels fallback changed; update the bridge cutter.');
      return {contents: source.replace(FALLBACK, 'null;'), loader: 'js'};
    });
  }});
}

export function cutBridges(source, unreached) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  let factory = null;
  (function find(node) {
    if (factory || !node || typeof node.type !== 'string') return;
    if (node.type === 'ArrowFunctionExpression' && node.body.type === 'BlockStatement' &&
        node.body.body.filter(s => s.type === 'VariableDeclaration' || s.type === 'FunctionDeclaration').length > 50) { factory = node; return; }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object') find(child);
  })(ast);
  if (!factory) throw new Error('kernels.mjs has no bridge factory.');
  const declared = new Map();
  for (const statement of factory.body.body) if (statement.type === 'VariableDeclaration')
    for (const d of statement.declarations) if (d.id.type === 'Identifier' && d.init && /Function|Conditional/.test(d.init.type)) declared.set(d.id.name, d.init);
  const named = unreached.map(name => declared.has(name) ? name : name.replace(/\d+$/, '')).filter(name => declared.has(name));
  const cuts = named.map(name => declared.get(name)).sort((a, b) => b.start - a.start);
  for (const init of cuts) source = source.slice(0, init.start) + 'null' + source.slice(init.end);
  return source;
}
