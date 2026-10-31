// SPDX-License-Identifier: MIT
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const here = new URL('./', import.meta.url), flat = existsSync(new URL('jxl/kernels-scalar.wat', here));
const directory = flat ? new URL('jxl/', here) : here;
const specifier = process.env.WABT_MODULE ? pathToFileURL(resolve(process.env.WABT_MODULE)).href : 'wabt';
let factory;
try { ({default: factory} = await import(specifier)); }
catch (cause) { throw new Error('The kernel build needs build-time wabt@1.0.39. Set WABT_MODULE to its index.js when installed outside this tree.', {cause}); }
const wabt = await factory();

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
  const globals = scalar.match(/^  \(global \$[^\n]*\n/gm);
  if (!globals || globals.length !== 12) throw new Error('The entropy writer\'s globals changed');
  const end = simd.lastIndexOf(')');
  return simd.slice(0, end) + globals.join('') + ['bits', 'emit', 'context', 'tokens', 'weighted'].map(name => '  ' + func(scalar, name)).join('\n') + '\n' + simd.slice(end);
}
const outputs = [
  ['kernels-bytes.mjs', '// Generated from kernels-*.wat. MIT. Do not edit.\n', [['kernels-simd', 'SIMD'], ['kernels-probe', 'SIMD_PROBE']], 'latin1'],
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
      : symbol === 'SIMD' ? simdSource(textSource, await readFile(new URL('kernels-scalar.wat', directory), 'utf8')) : textSource, {simd: true, bulk_memory: true});
    try {
      wat.resolveNames(); wat.validate({simd: true, bulk_memory: true});
      const {buffer} = wat.toBinary({log: false, canonicalize_lebs: true, write_debug_names: false});
      if (!WebAssembly.validate(buffer)) throw new Error(`Invalid ${name} module`);
      const key = symbol === 'DECODE_KERNELS' ? Array.from({length: 256}, (_, k) => k).find(k => buffer.every((b, i) => (b ^ k) || !((buffer[i + 1] ^ k) >= 48 && (buffer[i + 1] ^ k) <= 57))) : 0;
      if (key === undefined) throw new Error(`No key keeps ${symbol} free of a NUL before a digit`);
      const emitted = JSON.stringify(Buffer.from(buffer.map(b => b ^ key)).toString(encoding));
      if (!Buffer.from(Uint8Array.from(JSON.parse(emitted), c => c.charCodeAt(0) ^ key)).equals(Buffer.from(buffer))) throw new Error(`${symbol} does not read back as its module's bytes`);
      text += key ? `const ${symbol}_STORED = ${emitted};\nexport const ${symbol} = ${symbol}_STORED.replace(/[\\s\\S]/g, c => String.fromCharCode(c.charCodeAt(0) ^ ${key}));\n`
        : `export const ${symbol} = ${emitted};\n`;
      console.log(`${name}: ${buffer.length} WebAssembly bytes`);
    } finally { wat.destroy(); }
  }
  const target = new URL(flat ? 'jxl/' + output : '../src/' + output, here);
  if (process.argv.includes('--check')) {
    if (text !== await readFile(target, 'utf8')) throw new Error(output + ' differs from the WAT build');
  } else await writeFile(target, text);
}

