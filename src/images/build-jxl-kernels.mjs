// SPDX-License-Identifier: MIT
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const here = new URL('./', import.meta.url), flat = existsSync(new URL('jxl/kernels-scalar.wat', here));
const directory = flat ? new URL('jxl/', here) : here;
const specifier = process.env.WABT_MODULE ? pathToFileURL(resolve(process.env.WABT_MODULE)).href : 'wabt';
let factory;
try { ({default: factory} = await import(specifier)); }
catch (cause) { throw new Error('The kernel build needs build-time wabt@1.0.39. Set WABT_MODULE to its index.js when installed outside this tree.', {cause}); }
const wabt = await factory();
const check = process.argv.includes('--check');
const binaryenSpecifier = process.env.BINARYEN_MODULE ? pathToFileURL(resolve(process.env.BINARYEN_MODULE)).href : 'binaryen';
let binaryen = null;
try { ({default: binaryen} = await import(binaryenSpecifier)); }
catch (cause) { if (!check) throw new Error('The kernel build needs build-time binaryen@123.0.0. Set BINARYEN_MODULE to its index.js when installed outside this tree.', {cause}); }
function optimized(buffer) {
  const module = binaryen.readBinary(buffer);
  try {
    module.setFeatures(binaryen.Features.SIMD128 | binaryen.Features.BulkMemory | binaryen.Features.BulkMemoryOpt | binaryen.Features.NontrappingFPToInt);
    if (!module.validate()) throw new Error('A kernel module uses a feature outside simd, bulk memory and saturating conversions');
    binaryen.setOptimizeLevel(2); binaryen.setShrinkLevel(0); binaryen.setDebugInfo(false);
    module.optimize();
    return module.emitBinary();
  } finally { module.dispose(); }
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function captureSource(source, copies) {
  const start = source.indexOf('(func $weighted\n');
  if (start < 0) throw new Error('Missing canonical weighted kernel');
  let depth = 0, end = start;
  for (; end < source.length; end++) {
    if (source[end] === '(') depth++;
    if (source[end] === ')' && --depth === 0) { end++; break; }
  }
  let weighted = source.slice(start, end), removed = 0;
  weighted = weighted.replace(/\s*;; capture-context begin\n[\s\S]*?;; capture-context end/g, () => { removed++; return ''; });
  if (removed !== 2) throw new Error('The weighted context boundaries changed');
  return '(module (import "env" "memory" (memory 1 320))\n' + weighted + '\n' + copies + '\n)';
}
function func(source, name) {
  const start = source.indexOf(`(func $${name}\n`);
  if (start < 0) throw new Error(`Missing kernel function $${name}`);
  let depth = 0, end = start;
  for (; end < source.length; end++) {
    if (source[end] === '(') depth++;
    if (source[end] === ')' && --depth === 0) { end++; break; }
  }
  return source.slice(start, end);
}
function simdSource(simd, scalar) {
  const end = simd.lastIndexOf(')');
  return simd.slice(0, end) + ['tokens', 'weighted'].map(name => '  ' + func(scalar, name)).join('\n') + '\n' + simd.slice(end);
}
function pruned(source, keep) {
  const start = source.indexOf('(module'), spans = [];
  let depth = 0, from = -1, i = start + 7;
  for (; i < source.length; i++) {
    if (source[i] === ';' && source[i + 1] === ';') { const line = source.indexOf('\n', i); i = line < 0 ? source.length : line; continue; }
    if (source[i] === '(') { if (!depth) from = i; depth++; }
    else if (source[i] === ')') { if (!depth) break; if (!--depth) spans.push([from, i + 1]); }
  }
  const funcs = spans.map(([a, b]) => ({a, b, text: source.slice(a, b)})).filter(f => /^\(func\b/.test(f.text));
  for (const f of funcs) {
    f.name = f.text.match(/^\(func\s+(\$[\w.]+)/)?.[1];
    f.exports = [...f.text.matchAll(/\(export\s+"([^"]+)"\)/g)].map(m => m[1]);
    f.calls = [...f.text.matchAll(/\bcall\s+(\$[\w.]+)/g)].map(m => m[1]);
  }
  const missing = keep.filter(name => !funcs.some(f => f.exports.includes(name)));
  if (missing.length) throw new Error('No kernel exports ' + missing.join(', '));
  const named = new Map(funcs.filter(f => f.name).map(f => [f.name, f])), live = new Set(), stack = funcs.filter(f => f.exports.some(name => keep.includes(name)));
  while (stack.length) { const f = stack.pop(); if (live.has(f)) continue; live.add(f); for (const call of f.calls) if (named.has(call)) stack.push(named.get(call)); }
  let out = '', at = 0;
  for (const f of funcs) {
    out += source.slice(at, f.a);
    if (live.has(f)) out += f.text.replace(/\s*\(export\s+"([^"]+)"\)/g, (all, name) => keep.includes(name) ? all : '');
    at = f.b;
  }
  return out + source.slice(at);
}
function unpaired(source) {
  let removed = 0;
  const out = source.replace(/\n[ \t]*;; paired begin[^\n]*\n[\s\S]*?;; paired end/g, () => { removed++; return ''; });
  if (removed !== 2) throw new Error('The paired-count boundaries changed');
  return out;
}
const {SIMD_JPEG_EXPORTS, SIMD_UPLOAD_EXPORTS} = await import(new URL('kernel-sets.mjs', directory));
const {KEY, storedWasmByte, wasmBytes} = await import(new URL('wasm-text.mjs', directory));
const outputs = [
  ['kernels-bytes.mjs', '// Generated from kernels-*.wat. MIT. Do not edit.\n', [['kernels-simd', 'SIMD'], ['kernels-simd', 'SIMD_JPEG'], ['kernels-simd', 'SIMD_UPLOAD'], ['kernels-probe', 'SIMD_PROBE']], 'latin1'],
  ['capture-kernels-bytes.mjs', '// Generated from kernels-scalar.wat and capture-copies.wat. MIT. Do not edit.\n', [['kernels-scalar', 'CAPTURE']], 'latin1'],
  ['decode-kernels-bytes.mjs', '// Generated from decode-kernels.wat. MIT. Do not edit.\n', [['decode-kernels', 'DECODE_KERNELS']], 'latin1'],
  ['jpeg-kernels-bytes.mjs', '// Generated from jpeg-kernels.wat. MIT. Do not edit.\n', [['jpeg-kernels', 'JPEG_KERNELS']], 'latin1'],
];
for (const [output, header, sources, encoding] of outputs) {
  let text = header;
  for (const [name, symbol] of sources) {
    const source = new URL(`${name}.wat`, directory);
    const textSource = await readFile(source, 'utf8');
    const wat = wabt.parseWat(fileURLToPath(source), symbol === 'CAPTURE' ? captureSource(textSource, await readFile(new URL('capture-copies.wat', directory), 'utf8'))
      : symbol === 'SIMD' ? simdSource(textSource, await readFile(new URL('kernels-scalar.wat', directory), 'utf8'))
      : symbol === 'SIMD_JPEG' || symbol === 'SIMD_UPLOAD' ? pruned(simdSource(unpaired(textSource), await readFile(new URL('kernels-scalar.wat', directory), 'utf8')),
        symbol === 'SIMD_JPEG' ? SIMD_JPEG_EXPORTS : SIMD_UPLOAD_EXPORTS) : textSource, {simd: true, bulk_memory: true});
    try {
      wat.resolveNames(); wat.validate({simd: true, bulk_memory: true});
      const {buffer: written} = wat.toBinary({log: false, canonicalize_lebs: true, write_debug_names: false});
      const origin = `// ${symbol} from wabt: sha256 ${sha256(written)}\n`;
      if (!binaryen) { text += origin; continue; }
      const buffer = symbol === 'SIMD_PROBE' ? written : optimized(written);
      if (!WebAssembly.validate(buffer)) throw new Error(`Invalid ${name} module`);
      const stored = buffer.map(b => storedWasmByte(b) ^ KEY);
      if (!stored.every((b, i) => b || !(stored[i + 1] >= 48 && stored[i + 1] <= 57))) throw new Error(`${symbol} has a NUL before a digit under KEY`);
      const emitted = JSON.stringify(Buffer.from(stored).toString(encoding));
      if (!Buffer.from(wasmBytes(JSON.parse(emitted))).equals(Buffer.from(buffer))) throw new Error(`${symbol} does not read back as its module's bytes`);
      text += origin + `export const ${symbol} = ${emitted};\n`;
      console.log(`${symbol}: ${buffer.length} WebAssembly bytes`);
    } finally { wat.destroy(); }
  }
  const target = new URL(flat ? 'jxl/' + output : '../src/' + output, here);
  if (check) {
    const committed = await readFile(target, 'utf8');
    if (binaryen ? text !== committed : text.split('\n').some(line => line && !committed.split('\n').includes(line)))
      throw new Error(output + ' differs from the WAT build');
  } else await writeFile(target, text);
}

