// SPDX-License-Identifier: MIT
import {join, resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import acorn from '../agent/vendor/acorn.mjs';
import {pathToFileURL} from 'node:url';
import {stripKernelExports} from './jxl-rebuild-kernels.mjs';
export {stripKernelExports};

export function kernelProfile(name) {
  if (/^capture-complete(?:\.|$)/.test(name)) return 'capture-complete';
  if (/^capture(?:\.|$)/.test(name)) return 'capture';
  if (/^upload(?:\.|$)/.test(name)) return 'upload';
  if (/^jpeg(?:\.|$)/.test(name)) return 'jpeg';
  if (/^resumable(?:\.|$)/.test(name)) return 'resumable';
  if (name === 'verify') return 'verify';
  return null;
}

export async function createKernelStripper(codec) {
  const [{wasmBytes, storedWasmText}, store, jpegStore, rebuildStore, decodeStore] = await Promise.all([
    import(pathToFileURL(join(codec, 'wasm-text.mjs')).href),
    import(pathToFileURL(join(codec, 'kernels-bytes.mjs')).href), import(pathToFileURL(join(codec, 'jpeg-kernels-bytes.mjs')).href),
    import(pathToFileURL(join(codec, 'rebuild-kernels-bytes.mjs')).href), import(pathToFileURL(join(codec, 'decode-kernels-bytes.mjs')).href)
  ]);
  const stores = {
    kernels: {file: join(codec, 'kernels-bytes.mjs'), filter: /[\\/]kernels-bytes\.mjs$/, full: wasmBytes(store.KERNELS),
      text: kernels => 'export const KERNELS = ' + JSON.stringify(kernels) + ';\nexport const SIMD_PROBE = ' + JSON.stringify(store.SIMD_PROBE) + ';\n'},
    jpeg: {file: join(codec, 'jpeg-kernels-bytes.mjs'), filter: /[\\/]jpeg-kernels-bytes\.mjs$/, full: wasmBytes(jpegStore.JPEG_KERNELS),
      text: kernels => 'export const JPEG_KERNELS = ' + JSON.stringify(kernels) + ';\n'},
    rebuild: {file: join(codec, 'rebuild-kernels-bytes.mjs'), filter: /[\\/]rebuild-kernels-bytes\.mjs$/, full: wasmBytes(rebuildStore.REBUILD_KERNELS),
      text: kernels => 'export const REBUILD_KERNELS = ' + JSON.stringify(kernels) + ';\n'},
    decode: {file: join(codec, 'decode-kernels-bytes.mjs'), filter: /[\\/]decode-kernels-bytes\.mjs$/, full: wasmBytes(decodeStore.DECODE_KERNELS),
      text: kernels => 'export const DECODE_KERNELS = ' + JSON.stringify(kernels) + ';\n'},
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
          const kept = storedWasmText(bytes);
          if (!Buffer.from(wasmBytes(kept)).equals(Buffer.from(bytes))) throw new Error('The stripped kernel bytes do not round-trip.');
          return text(kept);
        })());
        return {contents: await cache.get(key), loader: 'js'};
      });
    }
  }});
  plugin.exports = stores.kernels.exports;
  plugin.jpegExports = stores.jpeg.exports;
  plugin.rebuildExports = stores.rebuild.exports;
  plugin.decodeExports = stores.decode.exports;
  return plugin;
}

export function keptExports(file, needs, optional, allowed, profile) {
  const gaps = profile ? [...needs].filter(name => !allowed.includes(name) && !optional.has(name)) : [];
  if (gaps.length) throw new Error(file + ' calls kernel exports its profile (' + profile + ', kernel-sets.mjs) strips: ' + gaps.sort().join(', '));
  return allowed.filter(name => needs.has(name)).sort();
}

export function createBridgeCutter(codec) {
  const file = join(codec, 'kernels.mjs');
  return unreached => ({name: 'kernel-bridges', setup(build) {
    if (unreached?.length) build.onLoad({filter: /[\\/]kernels\.mjs$/}, async ({path}) => {
      if (resolve(path) !== resolve(file)) return;
      const source = await readFile(file, 'utf8');
      return {contents: cutBridges(source, unreached), loader: 'js'};
    });
  }});
}

export function cutBridges(source, unreached) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  let factory = null;
  (function find(node) {
    if (factory || !node || typeof node.type !== 'string') return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && node.body.type === 'BlockStatement' &&
        node.body.body.filter(s => s.type === 'VariableDeclaration' || s.type === 'FunctionDeclaration').length >= 10) { factory = node; return; }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object') find(child);
  })(ast);
  if (!factory) throw new Error('kernels.mjs has no bridge factory.');
  const declared = new Map();
  for (const statement of factory.body.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const d of statement.declarations) if (d.id.type === 'Identifier' && d.init && /Function|Conditional/.test(d.init.type))
        declared.set(d.id.name, {start: d.init.start, end: d.init.end, replacement: 'null'});
    } else if (statement.type === 'FunctionDeclaration' && statement.id?.type === 'Identifier') {
      declared.set(statement.id.name, {start: statement.start, end: statement.end, replacement: `const ${statement.id.name} = null;`});
    }
  }
  const named = [...new Set(unreached.map(name => declared.has(name) ? name : name.replace(/\d+$/, '')).filter(name => declared.has(name)))];
  if (named.includes('weighted') && declared.has('initializeTables') && !named.includes('initializeTables')) named.push('initializeTables');
  const cuts = named.map(name => declared.get(name)).sort((a, b) => b.start - a.start);
  for (const cut of cuts) source = source.slice(0, cut.start) + cut.replacement + source.slice(cut.end);
  return source;
}
