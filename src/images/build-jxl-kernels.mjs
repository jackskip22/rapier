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
const generated = name => new URL(flat ? 'jxl/' + name : '../src/' + name, here);
const {stripKernelExports, rebuildKernelSources, checkRGB8Thresholds} = await import(new URL(
  flat ? '../tools/jxl-rebuild-kernels.mjs' : 'jxl-rebuild-kernels.mjs', here));
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

const METRICS = [];
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
        origin + '\n' + (license.includes(' AND MIT') ? ';; Linked musl math routines: see butteraugli-NOTICES for the required MIT notice.\n' : '') +
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
function squeezeSteps(source) {
  const head = '(func (export "squeezeStep") (param $p i32) (param $w i32) (param $h i32) (param $horizontal i32) (param $out i32) (param $res i32) (param $wide i32) (result i32)';
  const at = source.indexOf(head), test = '(if (local.get $wide)';
  if (at < 0 || source.indexOf(head, at + 1) >= 0) throw new Error('The squeezeStep entry changed');
  const whole = forms('(module ' + source.slice(at))[0];
  if (whole.split(test).length !== 2) throw new Error('The squeezeStep sample-width test changed');
  const one = (name, wide) => whole.replace(head, head.replace('"squeezeStep"', `"${name}"`).replace(' (param $wide i32)', ''))
    .replace(test, `(if (i32.const ${wide})`);
  return source.slice(0, at) + one('squeezeStep', 0) + '\n' + one('squeezeStep32', 1) + source.slice(at + whole.length);
}
const scalar = await readWat('kernels-scalar');
const exactMath = (() => {
  const decode = readFile(new URL('decode-kernels.wat', directory), 'utf8');
  return decode.then(text => namespace(['round', 'pow2', 'xlog', 'xexp', 'xpow'].map(name => {
    const found = forms(text.slice(text.indexOf('(module'))).find(form => form.startsWith('(func $' + name + ' '));
    if (!found) throw new Error('Missing decode-kernels.wat function $' + name);
    return found;
  }).join('\n'), 'exact_'));
})();
const s2Source = await readWat('ssimulacra2');
const {S2_MEMORY} = await import(new URL('ssimulacra2-memory.mjs', directory));
if (!s2Source.includes(`(i32.load (i32.const ${S2_MEMORY.gaussian + 244}))`)) throw new Error('ssimulacra2.wat does not read S2_MEMORY\'s fused flag');
const s2Fragment = namespace(fragment(s2Source), 's2k_');
const metrics = [];
metrics.push(metricFragment(await readWat('text-ink'), 'text_ink_', ['inkLines', 'findText']));
for (const [name, exports, license, c = name, flags = []] of METRICS) {
  const prefix = name.replaceAll('-', '_') + '_';
  metrics.push(metricFragment(await metricSource(name, license, {c, flags}), prefix, exports));
}
const butteraugliSource = '(module (import "env" "memory" (memory 1))\n' + [
  namespace(forms(s2Source).find(form => form.startsWith('(func $s2_init ')), 's2_init_'),
  metricFragment(await readWat('butteraugli-arithmetic'), 'butteraugli_arithmetic_',
    ['baMetricBands', 'baMetricMask', 'baMetricDiff', 'baMetricDown', 'baMetricMix']),
].join('\n') + '\n)';
const kernelsSource = '(module (import "env" "memory" (memory 1))\n' + [
  fragment(await readWat('kernels-simd')),
  func(scalar, 'tokens'), func(scalar, 'weighted'), captureWeighted(scalar),
  await readWat('sample-resize'), await readWat('ac-stage'), await readWat('screen-photo-tiles'), squeezeSteps(await readWat('capture-copies')), await readWat('capture-copies-step'), await readWat('capture-patches'), await readWat('capture-masks'), await exactMath,
  await readWat('capture-tokens'), await readWat('capture-trees'), await readWat('picture-scans'), fragment(await readWat('capture-fused')), s2Fragment, ...metrics,
  await readWat('animation-diff'), await readWat('png-rows'), await readWat('color-bytes'),
].join('\n') + '\n)';
const {KEY, storedWasmText, wasmBytes, interfaceOf} = await import(new URL('wasm-text.mjs', directory));
const HOSTED = {KERNELS: 'kernels', JPEG_KERNELS: 'jpeg', DECODE_KERNELS: 'decode'}, interfaces = {};
const {REBUILD_EXPORTS} = await import(new URL('rebuild-kernels.mjs', directory));
const FUSED_FEATURES = {relaxed_simd: true};
const fusedSource = await readWat('ssimulacra2-fused');
{
  const all = forms(fusedSource), functions = all.filter(form => form.startsWith('(func '));
  const exported = all.filter(form => /^\(export\s/.test(form)).map(form => /^\(export\s+"([^"]+)"/.exec(form)[1]);
  if (exported.join() !== 's2FusedRow,s2FusedBlur4,s2FusedVertRow') throw new Error('The fused leaf must export s2FusedRow, s2FusedBlur4 and s2FusedVertRow alone');
  if (all.some(form => /^\((data|elem)\s/.test(form)) || /global\.set/.test(fusedSource)) throw new Error('The fused leaf must hold no stack or data');
  const relaxed = functions.filter(form => /relaxed/.test(form));
  if (!relaxed.length || relaxed.some(form => !/^\(func \$s2_fused_(row|blur4|vert_row)\b/.test(form))) throw new Error('Every relaxed SIMD instruction must be in a fused entry');
}
const outputs = [
  ['kernels-bytes.mjs', '// Generated from the canonical kernel sources by build-jxl-kernels.mjs. MIT and BSD-3-Clause; see source notices and v7/THIRD_PARTY_NOTICES. Do not edit.\n', [['kernels', 'KERNELS'], ['kernels-probe', 'SIMD_PROBE']]],
  ['decode-kernels-bytes.mjs', '// Generated from decode-kernels.wat. MIT. Do not edit.\n', [['decode-kernels', 'DECODE_KERNELS']]],
  ['jpeg-kernels-bytes.mjs', '// Generated from jpeg-kernels.wat. MIT. Do not edit.\n', [['jpeg-kernels', 'JPEG_KERNELS']]],
  ['butteraugli-kernels-bytes.mjs', '// Generated from butteraugli-arithmetic.wat and ssimulacra2.wat by build-jxl-kernels.mjs, for the tests and tools. BSD-3-Clause. Do not edit.\n',
    [['butteraugli-arithmetic', 'BA_KERNELS']]],
  ['ssimulacra2-fused-bytes.mjs', '// Generated from ssimulacra2-fused.wat by build-jxl-kernels.mjs. BSD-3-Clause; see its notice. Do not edit.\n',
    [['ssimulacra2-fused', 'S2_FUSED']]],
];
let decodeWritten, decodeOptimized;
for (const [output, header, sources] of outputs) {
  let text = header;
  for (const [name, symbol] of sources) {
    const source = new URL(`${name}.wat`, directory);
    const textSource = symbol === 'KERNELS' ? kernelsSource : symbol === 'BA_KERNELS' ? butteraugliSource : await readFile(source, 'utf8');
    const features = {simd: true, bulk_memory: true, ...(symbol === 'S2_FUSED' && FUSED_FEATURES)};
    const wat = wabt.parseWat(fileURLToPath(source), textSource, features);
    try {
      wat.resolveNames(); wat.validate(features);
      const {buffer: written} = wat.toBinary({log: false, canonicalize_lebs: true, write_debug_names: false});
      if (symbol === 'DECODE_KERNELS') decodeWritten = written;
      const origin = `// ${symbol} from wabt: sha256 ${sha256(written)}\n`;
      const exports = (HOSTED[symbol] || symbol === 'DECODE_KERNELS') ? WebAssembly.Module.exports(new WebAssembly.Module(written)) : null;
      if (HOSTED[symbol]) interfaces[HOSTED[symbol]] = interfaceOf(exports);
      if (symbol === 'DECODE_KERNELS') interfaces.rebuild = interfaceOf(exports.filter(entry => REBUILD_EXPORTS.includes(entry.name)));
      if (!binaryen) { text += origin; continue; }
      const buffer = symbol === 'SIMD_PROBE' ? written : optimized(written, symbol === 'S2_FUSED');
      if (symbol === 'DECODE_KERNELS') decodeOptimized = buffer;
      if ((symbol !== 'S2_FUSED' || WebAssembly.validate(written)) && !WebAssembly.validate(buffer)) throw new Error(`Invalid ${name} module`);
      const stored = storedWasmText(buffer), key = stored.charCodeAt(0) & 127;
      if (key !== KEY) console.log(`${symbol}: key ${key} (a NUL before a digit under ${KEY})`);
      const emitted = JSON.stringify(stored);
      if (!Buffer.from(wasmBytes(JSON.parse(emitted))).equals(Buffer.from(buffer))) throw new Error(`${symbol} does not read back as its module's bytes`);
      text += origin + `export const ${symbol} = ${emitted};\n`;
      console.log(`${symbol}: ${buffer.length} WebAssembly bytes`);
    } finally { wat.destroy(); }
  }
  const target = generated(output);
  if (check) {
    const committed = await readFile(target, 'utf8');
    if (binaryen ? text !== committed : text.split('\n').some(line => line && !committed.split('\n').includes(line)))
      throw new Error(output + ' differs from the WAT build');
  } else await writeFile(target, text);
}
{
  const committedBytes = async (name, symbol) => {
    const text = await readFile(generated(name), 'utf8'), prefix = 'export const ' + symbol + ' = ';
    const line = text.split('\n').find(line => line.startsWith(prefix));
    if (!line?.endsWith(';')) throw new Error(name + ' has no generated ' + symbol + ' byte store');
    return wasmBytes(JSON.parse(line.slice(prefix.length, -1)));
  };
  const decode = decodeOptimized ?? await committedBytes('decode-kernels-bytes.mjs', 'DECODE_KERNELS');
  const cut = binaryen ? await stripKernelExports(decode, [...REBUILD_EXPORTS], binaryen)
    : await committedBytes('rebuild-kernels-bytes.mjs', 'REBUILD_KERNELS');
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(cut));
  if (interfaceOf(exports) !== interfaces.rebuild || exports.length !== REBUILD_EXPORTS.length)
    throw new Error('The rebuild kernel interface differs from REBUILD_EXPORTS');
  const {rebuild, thresholds} = rebuildKernelSources(decode, cut, storedWasmText);
  await checkRGB8Thresholds(decodeOptimized ?? decodeWritten, thresholds);
  for (const [name, text] of [['rebuild-kernels-bytes.mjs', rebuild], ['rgb8-thresholds.mjs', thresholds]]) {
    const target = generated(name);
    if (check) {
      if (await readFile(target, 'utf8') !== text) throw new Error(name + ' differs from the decoder build');
    } else await writeFile(target, text);
  }
  console.log(binaryen ? `REBUILD_KERNELS: ${cut.length} WebAssembly bytes`
    : 'REBUILD_KERNELS: provenance and RGB8 words checked; full derivation replay needs binaryen@123.0.0');
}
{
  const jgrWatText = await readWat('jpeg-general-rows');
  metricFragment(jgrWatText, 'jgr_', ['jpegGeneralRows']);
  const jgrParsed = wabt.parseWat(fileURLToPath(new URL('jpeg-general-rows.wat', directory)), jgrWatText, {simd: true, bulk_memory: true});
  let jgrWritten;
  try {
    jgrParsed.resolveNames(); jgrParsed.validate({simd: true, bulk_memory: true});
    jgrWritten = jgrParsed.toBinary({log: false, canonicalize_lebs: true, write_debug_names: false}).buffer;
  } finally { jgrParsed.destroy(); }
  interfaces.general = interfaceOf(WebAssembly.Module.exports(new WebAssembly.Module(jgrWritten)));
  const jgrTarget = new URL(flat ? 'jxl/jpeg-general-rows-bytes.mjs' : '../src/jpeg-general-rows-bytes.mjs', here);
  const jgrOrigin = `// JPEG_GENERAL_ROWS from wabt: sha256 ${sha256(jgrWritten)}\n`;
  if (binaryen) {
    const jgrBuf = Buffer.from(optimized(jgrWritten, false));
    if (!WebAssembly.validate(jgrBuf)) throw new Error('Invalid jpeg-general-rows module');
    const jgrText = '// SPDX-License-Identifier: MIT\n// Generated from jpeg-general-rows.wat by build-jxl-kernels.mjs. Do not edit.\n' +
      jgrOrigin + '// The sampler is loaded only for a general legal T.81 JPEG layout.\n' +
      `export const JPEG_GENERAL_ROWS = '${jgrBuf.toString('base64')}';\n`;
    console.log(`JPEG_GENERAL_ROWS: ${jgrBuf.length} WebAssembly bytes`);
    if (check) {
      if (await readFile(jgrTarget, 'utf8') !== jgrText) throw new Error('jpeg-general-rows-bytes.mjs differs from the WAT build');
    } else await writeFile(jgrTarget, jgrText);
  } else if (check) {
    const committed = await readFile(jgrTarget, 'utf8');
    if (!committed.includes(jgrOrigin.trim())) throw new Error('jpeg-general-rows-bytes.mjs differs from the WAT build');
  }

  const text = '// Generated by build-jxl-kernels.mjs from the modules\' exports. MIT. Do not edit.\nexport const INTERFACES = ' +
    JSON.stringify(Object.fromEntries([...Object.values(HOSTED), 'rebuild', 'general'].map(name => [name, interfaces[name]]))) + ';\n';
  const target = generated('wasm-interfaces.mjs');
  if (check) { if (await readFile(target, 'utf8') !== text) throw new Error('wasm-interfaces.mjs differs from the WAT build'); }
  else await writeFile(target, text);
}
