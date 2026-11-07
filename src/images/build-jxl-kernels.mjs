// SPDX-License-Identifier: MIT
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
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
function optimized(buffer, relaxed = false) {
  const module = binaryen.readBinary(buffer);
  try {
    module.setFeatures(binaryen.Features.SIMD128 | binaryen.Features.BulkMemory | binaryen.Features.BulkMemoryOpt | binaryen.Features.NontrappingFPToInt
      | (relaxed ? binaryen.Features.RelaxedSIMD : 0));
    if (!module.validate()) throw new Error('A kernel module uses a feature outside simd, bulk memory and saturating conversions');
    binaryen.setOptimizeLevel(2); binaryen.setShrinkLevel(0); binaryen.setDebugInfo(false);
    module.optimize();
    return module.emitBinary();
  } finally { module.dispose(); }
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const S2_EXACT_C = 'ssimulacra2-simd';
const METRICS = [
  ['ssimulacra2-arithmetic', ['s2MetricInit', 's2MetricDown', 's2MetricScale'], 'BSD-3-Clause', S2_EXACT_C],
  ['butteraugli-arithmetic', ['baMetricBands', 'baMetricMask', 'baMetricDiff', 'baMetricDown', 'baMetricMix'], 'BSD-3-Clause AND MIT'],
];
const CLANG_VERSION = '23.1.0-wasi-sdk';
const C_FLAGS = ['--target=wasm32-unknown-wasip1', '-std=c11', '-O3', '-ffp-contract=off', '-fno-fast-math',
  '-fno-builtin', '-ffreestanding', '-msimd128', '-mbulk-memory', '-nostartfiles', '-Wl,--no-entry',
  '-Wl,--import-memory', '-Wl,--initial-memory=131072', '-Wl,-z,stack-size=65536', '-Wl,--global-base=65536'];
const C_LIBRARIES = ['-lm'];
const compileC = process.argv.includes('--compile-c'), compiler = process.env.WASM_CLANG || 'clang';
if (compileC) {
  const version = execFileSync(compiler, ['--version'], {encoding: 'utf8'}).split('\n')[0];
  if (!version.startsWith('clang version ' + CLANG_VERSION + ' '))
    throw new Error('Metric generation requires wasi-sdk clang ' + CLANG_VERSION + '; set WASM_CLANG to its clang.');
}
const metricHeader = await readFile(new URL('metric-float.h', directory), 'utf8');
async function metricSource(name, license, {c = name, flags = [], features = {}} = {}) {
  const cFile = new URL(c + '.c', directory), watFile = new URL(name + '.wat', directory);
  const source = await readFile(cFile, 'utf8'), cFlags = [...C_FLAGS, ...flags];
  const origin = ';; C inputs sha256 ' + sha256(JSON.stringify(flags.length
    ? {compiler: CLANG_VERSION, flags: cFlags, libraries: C_LIBRARIES, license, source, metricHeader}
    : {compiler: CLANG_VERSION, flags: C_FLAGS, libraries: C_LIBRARIES, license, source, metricHeader}));
  if (!compileC) {
    const text = await readFile(watFile, 'utf8');
    if (!text.split('\n').includes(origin)) throw new Error(name + '.wat is stale; run build-jxl-kernels.mjs --compile-c.');
    return text;
  }
  const temporary = await mkdtemp(join(tmpdir(), 'jxl-metric-'));
  try {
    const binary = join(temporary, name + '.wasm');
    execFileSync(compiler, [...cFlags, '-o', binary, fileURLToPath(cFile), ...C_LIBRARIES], {stdio: 'pipe'});
    const parsed = wabt.readWasm(await readFile(binary), {readDebugNames: true, simd: true, bulk_memory: true, ...features});
    let text;
    try {
      parsed.generateNames(); parsed.applyNames();
      const notice = source.match(/\/\*![\s\S]*?\*\//)?.[0];
      if (!notice) throw new Error(name + '.c must retain its copyright and license notice.');
      text = ';; SPDX-License-Identifier: ' + license + '\n;; Generated from ' + c + '.c' + (flags.length ? ' (' + flags.join(' ') + ')' : '') +
        ' and metric-float.h by build-jxl-kernels.mjs.\n' +
        origin + '\n' + (license.includes('MIT') ? ';; Linked musl math routines: see v7/THIRD_PARTY_NOTICES for the required MIT notice.\n' : '') +
        notice.split('\n').map(line => ';; ' + line.trimEnd()).join('\n') + '\n' +
        parsed.toText({foldExprs: true, inlineExport: false});
    } finally { parsed.destroy(); }
    if (check) {
      if (await readFile(watFile, 'utf8') !== text) throw new Error(name + '.wat differs from the C build');
    } else await writeFile(watFile, text);
    return text;
  } finally { await rm(temporary, {recursive: true, force: true}); }
}

function forms(source) {
  const start = source.indexOf('(module');
  let depth = 0, from = -1, quoted = false, comment = 0;
  const spans = [];
  for (let i = start + 7; i < source.length; i++) {
    const a = source[i], b = source[i + 1];
    if (comment) {
      if (a === '(' && b === ';') { comment++; i++; }
      else if (a === ';' && b === ')') { comment--; i++; }
      continue;
    }
    if (quoted) { if (a === '\\') i++; else if (a === '"') quoted = false; continue; }
    if (a === '"') { quoted = true; continue; }
    if (a === ';' && b === ';') { const line = source.indexOf('\n', i); i = line < 0 ? source.length : line; continue; }
    if (a === '(' && b === ';') { comment++; i++; continue; }
    if (a === '(') { if (!depth) from = i; depth++; }
    else if (a === ')') { if (!depth) break; if (!--depth) spans.push(source.slice(from, i + 1)); }
  }
  return spans;
}
function fragment(source) {
  return forms(source).filter(form => !/^\(import\s+"env"\s+"memory"/.test(form)).join('\n');
}
function namespace(source, prefix) {
  let from = 0, result = '', quoted = false, comment = 0;
  for (let i = 0; i < source.length; i++) {
    const a = source[i], b = source[i + 1];
    if (comment) {
      if (a === '(' && b === ';') { comment++; i++; }
      else if (a === ';' && b === ')') { comment--; i++; }
      continue;
    }
    if (quoted) { if (a === '\\') i++; else if (a === '"') quoted = false; continue; }
    if (a === '"') { quoted = true; continue; }
    if (a === ';' && b === ';') { const line = source.indexOf('\n', i); i = line < 0 ? source.length : line; continue; }
    if (a === '(' && b === ';') { comment++; i++; continue; }
    if (a === '$') {
      let end = i + 1;
      while (end < source.length && !/[\s()]/.test(source[end])) end++;
      result += source.slice(from, i) + '$' + prefix + source.slice(i + 1, end); from = end; i = end - 1;
    }
  }
  return result + source.slice(from);
}
function metricFragment(source, prefix, keep) {
  const parts = forms(source);
  if (parts.some(form => /^\((data|start|elem|memory|tag)(?=[\s(])/.test(form)) || /\b(?:call_indirect|return_call_indirect|table\.)/.test(source))
    throw new Error('Metric kernels must use caller-owned memory without initialization or table side effects');
  const imports = parts.filter(form => /^\(import\s/.test(form));
  if (imports.length !== 1 || !/^\(import\s+"env"\s+"memory"/.test(imports[0]))
    throw new Error('Metric kernels must import only env.memory');
  const exports = parts.filter(form => /^\(export\s/.test(form)).map(form => /^\(export\s+"([^"]+)"/.exec(form)[1]);
  for (const name of keep) if (!exports.includes(name)) throw new Error('Missing metric export ' + name);
  return namespace(parts.filter(form => !/^\((import|table)\s/.test(form) &&
    (!/^\(export\s/.test(form) || keep.includes(/^\(export\s+"([^"]+)"/.exec(form)[1]))).join('\n'), prefix);
}
function func(source, name) {
  const found = forms(source).find(form => form.startsWith(`(func $${name}\n`));
  if (!found) throw new Error(`Missing kernel function $${name}`);
  return found;
}
function captureWeighted(source) {
  let weighted = func(source, 'weighted'), removed = 0;
  weighted = weighted.replace(/\s*;; capture-context begin\n[\s\S]*?;; capture-context end/g, () => { removed++; return ''; });
  if (removed !== 2) throw new Error('The weighted context boundaries changed');
  return weighted.replace('$weighted', '$captureWeighted').replace('(export "weighted")', '(export "captureWeighted")')
    .replace('(loop $ys', '(local.set $y (local.get $contexts))\n    (loop $ys');
}
const readWat = name => readFile(new URL(name + '.wat', directory), 'utf8');
const scalar = await readWat('kernels-scalar');
const reconstruction = fragment(await readWat('ssimulacra2-kernel'));
if (/\((data|start|table|memory)(?=[\s(])/.test(reconstruction) || /\(export\s+"memory"/.test(reconstruction))
  throw new Error('Reconstruction must use caller-owned memory without initialization side effects');
const metrics = [];
for (const [name, exports, license, c = name] of METRICS) metrics.push(metricFragment(await metricSource(name, license, {c}), name.replaceAll('-', '_') + '_', exports));
const kernelsSource = '(module (import "env" "memory" (memory 1))\n' + [
  fragment(await readWat('kernels-simd')),
  func(scalar, 'tokens'), func(scalar, 'weighted'), captureWeighted(scalar),
  await readWat('sample-resize'), await readWat('capture-copies'), await readWat('capture-copies-step'), await readWat('capture-patches'),
  await readWat('capture-tokens'), fragment(await readWat('capture-fused')), reconstruction, ...metrics,
].join('\n') + '\n)';
const {KEY, storedWasmByte, wasmBytes, interfaceOf} = await import(new URL('wasm-text.mjs', directory));
const HOSTED = {KERNELS: 'kernels', JPEG_KERNELS: 'jpeg', DECODE_KERNELS: 'decode'}, interfaces = {};
const FUSED_FEATURES = {relaxed_simd: true};
const fusedSource = await metricSource('ssimulacra2-fused', 'BSD-3-Clause', {c: 'ssimulacra2-simd',
  flags: ['-mrelaxed-simd', '-DS2_FUSED'], features: FUSED_FEATURES});
{
  const functions = forms(fusedSource).filter(form => form.startsWith('(func '));
  const exported = forms(fusedSource).filter(form => /^\(export\s/.test(form)).map(form => /^\(export\s+"([^"]+)"\s+\(func\s+(\S+?)\)\)/.exec(form));
  if (exported.length !== 1 || exported[0][1] !== 's2MetricScale') throw new Error('The fused metric must export only s2MetricScale');
  const wrapper = functions.find(form => form.startsWith(`(func ${exported[0][2]} `) || form.startsWith(`(func ${exported[0][2]}\n`));
  const target = wrapper && /\bcall (\$\S+)/.exec(wrapper.replace(/call \$__wasm_call_\w+/g, ''))?.[1];
  for (const form of functions) if (/relaxed/.test(form) && !form.startsWith(`(func ${target} `) && !form.startsWith(`(func ${target}\n`))
    throw new Error('A relaxed SIMD instruction is outside the probed s2MetricScale');
}
const outputs = [
  ['kernels-bytes.mjs', '// Generated from the canonical kernel sources by build-jxl-kernels.mjs. MIT and BSD-3-Clause; see source notices and v7/THIRD_PARTY_NOTICES. Do not edit.\n', [['kernels', 'KERNELS'], ['kernels-probe', 'SIMD_PROBE']], 'latin1'],
  ['decode-kernels-bytes.mjs', '// Generated from decode-kernels.wat. MIT. Do not edit.\n', [['decode-kernels', 'DECODE_KERNELS']], 'latin1'],
  ['jpeg-kernels-bytes.mjs', '// Generated from jpeg-kernels.wat. MIT. Do not edit.\n', [['jpeg-kernels', 'JPEG_KERNELS']], 'latin1'],
  ['ssimulacra2-fused-bytes.mjs', '// Generated from ssimulacra2-fused.wat by build-jxl-kernels.mjs. BSD-3-Clause; see its notice. Do not edit.\n',
    [['ssimulacra2-fused', 'S2_FUSED']], 'latin1'],
];
for (const [output, header, sources, encoding] of outputs) {
  let text = header;
  for (const [name, symbol] of sources) {
    const source = new URL(`${name}.wat`, directory);
    const textSource = symbol === 'KERNELS' ? kernelsSource : await readFile(source, 'utf8');
    const features = {simd: true, bulk_memory: true, ...(symbol === 'S2_FUSED' && FUSED_FEATURES)};
    const wat = wabt.parseWat(fileURLToPath(source), textSource, features);
    try {
      wat.resolveNames(); wat.validate(features);
      const {buffer: written} = wat.toBinary({log: false, canonicalize_lebs: true, write_debug_names: false});
      const origin = `// ${symbol} from wabt: sha256 ${sha256(written)}\n`;
      if (HOSTED[symbol]) interfaces[HOSTED[symbol]] = interfaceOf(WebAssembly.Module.exports(new WebAssembly.Module(written)));
      if (!binaryen) { text += origin; continue; }
      const buffer = symbol === 'SIMD_PROBE' ? written : optimized(written, symbol === 'S2_FUSED');
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
{
  const text = '// Generated by build-jxl-kernels.mjs from the modules\' exports. MIT. Do not edit.\nexport const INTERFACES = ' +
    JSON.stringify(Object.fromEntries(Object.values(HOSTED).map(name => [name, interfaces[name]]))) + ';\n';
  const target = new URL(flat ? 'jxl/wasm-interfaces.mjs' : '../src/wasm-interfaces.mjs', here);
  if (check) { if (await readFile(target, 'utf8') !== text) throw new Error('wasm-interfaces.mjs differs from the WAT build'); }
  else await writeFile(target, text);
}

