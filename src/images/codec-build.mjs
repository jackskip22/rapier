import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {JPEG_XL_LIMITS, codecError, byteView, boundedDimensions} from './header.mjs';
import {joinWasm} from './encoder.mjs';
import {gunzipSync} from 'node:zlib';
import {zopfliGzip} from '../tools/zopfli.mjs';

// Leave the vendored bytes untouched; cap the shipped WASM memory declaration at `bytes`.
export function boundedWasm(input, bytes) {
  let cursor = 8, found = false;
  const read = () => {
    let value = 0, scale = 1, byte;
    do {
      if (cursor >= input.length || scale > 2 ** 28) throw new Error('Invalid JPEG XL WASM integer');
      byte = input[cursor++]; value += (byte & 127) * scale; scale *= 128;
    } while (byte & 128);
    return value;
  };
  const leb = value => {
    const bytes = [];
    do { const rest = value % 128; value = Math.floor(value / 128); bytes.push(rest | (value ? 128 : 0)); } while (value);
    return Buffer.from(bytes);
  };
  if (!input.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) throw new Error('Invalid JPEG XL WASM signature');
  const sections = [input.subarray(0, 8)];
  while (cursor < input.length) {
    const sectionStart = cursor, id = input[cursor++], size = read(), end = cursor + size;
    if (end > input.length) throw new Error('Truncated JPEG XL WASM section');
    if (id === 5) {
      if (found || read() !== 1) throw new Error('Unexpected JPEG XL WASM memory layout');
      const flags = read();
      if (flags !== 0 && flags !== 1) throw new Error('Unexpected JPEG XL WASM memory flags');
      const initial = read(), maximum = flags ? read() : Infinity, pages = bytes / 65536;
      if (!Number.isInteger(pages) || pages > 65536 || cursor !== end || initial > pages || maximum < pages) throw new Error('Unexpected JPEG XL WASM memory limits');
      const body = Buffer.concat([leb(1), leb(1), leb(initial), leb(pages)]);
      sections.push(Buffer.concat([Buffer.from([5]), leb(body.length), body]));
      found = true;
    } else sections.push(input.subarray(sectionStart, end));
    cursor = end;
  }
  if (!found) throw new Error('JPEG XL WASM memory declaration is missing');
  return Buffer.concat(sections);
}

// Opcodes split from each kind of immediate, in encoder.mjs joinWasm's order, after the "\0str" mark: Zopfli then sees opcode repeats (19% smaller).
// Any instruction not handled refuses the build.
function splitWasm(input) {
  const streams = Array.from({length: 16}, () => []);
  const [sizes, locals, ops, blocks, depths, calls, types, indices, globals, aligns, offsets, memories, i32s, i64s, f32s, f64s] = streams;
  let at = 8, head = null, tail = null, bodies = 0;
  const leb = () => {
    let value = 0, scale = 1, byte;
    do { byte = input[at++]; value += (byte & 127) * scale; scale *= 128; } while (byte & 128);
    return value;
  };
  const take = (stream, length) => { stream.push(input.subarray(at, at + length)); at += length; };
  const takeLeb = stream => { const start = at, value = leb(); stream.push(input.subarray(start, at)); return value; };
  const plain = op => op <= 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x1a || op === 0x1b || (op >= 0x45 && op <= 0xc4);
  while (at < input.length && !head) {
    const id = input[at++], size = leb(), end = at + size;
    if (id === 10) {
      bodies = leb();
      head = input.subarray(0, at);
      for (let n = 0; n < bodies; n++) {
        const size = takeLeb(sizes), bodyEnd = at + size;
        for (let groups = takeLeb(locals); groups--;) { takeLeb(locals); take(locals, 1); }
        while (at < bodyEnd) {
          const op = input[at];
          take(ops, 1);
          if (op >= 0x02 && op <= 0x04) {
            const type = input[at];
            if (type === 0x40 || (type >= 0x6f && type <= 0x7f)) take(blocks, 1); else takeLeb(blocks);
          } else if (op === 0x0c || op === 0x0d) takeLeb(depths);
          else if (op === 0x0e) for (let targets = takeLeb(depths) + 1; targets--;) takeLeb(depths);
          else if (op === 0x10) takeLeb(calls);
          else if (op === 0x11) { takeLeb(types); takeLeb(types); }
          else if (op >= 0x20 && op <= 0x22) takeLeb(indices);
          else if (op === 0x23 || op === 0x24) takeLeb(globals);
          else if (op >= 0x28 && op <= 0x3e) { takeLeb(aligns); takeLeb(offsets); }
          else if (op === 0x3f || op === 0x40) takeLeb(memories);
          else if (op === 0x41) takeLeb(i32s);
          else if (op === 0x42) takeLeb(i64s);
          else if (op === 0x43) take(f32s, 4);
          else if (op === 0x44) take(f64s, 8);
          else if (op === 0xfc) {
            const sub = takeLeb(ops);
            if (sub === 10) { takeLeb(memories); takeLeb(memories); } else if (sub === 11) takeLeb(memories);
            else if (sub > 7) throw new Error('JPEG XL WASM instruction 0xfc ' + sub + ' is not packed');
          } else if (!plain(op)) throw new Error('JPEG XL WASM instruction 0x' + op.toString(16) + ' is not packed');
        }
        if (at !== bodyEnd) throw new Error('A JPEG XL WASM function body overruns its size');
      }
      if (at !== end) throw new Error('The JPEG XL WASM code section overruns its size');
      tail = input.subarray(end);
    }
    at = end;
  }
  if (!head) throw new Error('JPEG XL WASM has no code section');
  const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
  const part = bytes => Buffer.concat([u32(bytes.length), bytes]);
  return Buffer.concat([Buffer.from([0, 0x73, 0x74, 0x72]), u32(input.length), u32(bodies), part(head), part(tail), ...streams.map(stream => part(Buffer.concat(stream)))]);
}

// The document profile reads no encoder bytes; its worker refuses encode with JXL_UNAVAILABLE. `memory` is both the declared max and JPEG_XL_LIMITS.memory.
export async function buildJPEGXLWorker(root, {profile = 'full', memory = JPEG_XL_LIMITS.memory} = {}) {
  let factory = 'const encoderFactory = undefined;', encoderWasm, encoderNotices = '';
  if (profile !== 'document') {
    const directory = resolve(root, 'images/vendor/jxl-encoder');
    const read = name => readFile(resolve(directory, name));
    const provenance = JSON.parse(await read('PROVENANCE.json'));
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    const binary = await read('encode.wasm.gz');
    if (digest(binary) !== provenance.files['encode.wasm.gz'].sha256) throw new Error('JPEG XL encoder checksum mismatch');
    const encoderBinary = gunzipSync(binary);
    if (digest(encoderBinary) !== provenance.upstreamWasmSha256) throw new Error('Unexpected JPEG XL encoder module');
    const encoderSource = (await readFile(resolve(root, 'images/encoder.mjs'), 'utf8')).replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    factory = encoderSource + '\nconst encoderFactory = createJPEGXLEncoder;';
    const bounded = boundedWasm(encoderBinary, memory), streams = splitWasm(bounded);
    if (!Buffer.from(joinWasm(streams)).equals(bounded)) throw new Error('The JPEG XL encoder streams do not join back into its module');
    encoderWasm = (await zopfliGzip(streams)).toString('base64');
    encoderNotices = (await read('THIRD-PARTY-NOTICES.txt')).toString('utf8') + '\n';
  }
  // R83: no bundled JPEG XL decoder; the encoder stays. Serialize the actual definitions, never a source slice tied to comments.
  const header = 'const JPEG_XL_LIMITS = Object.freeze(' + JSON.stringify({...JPEG_XL_LIMITS, memory}) + ');\n' +
    [codecError, byteView, boundedDimensions].join('\n');
  const adapter = header + '\n' + (await readFile(resolve(root, 'images/codec.mjs'), 'utf8')).replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const notices = encoderNotices.replaceAll('*/', '* /');
  const source = `/* ${notices}\n*/\n'use strict';\n${factory}\n${adapter}\ninstallJPEGXLWorker({encoderFactory, encoderWasm: ${JSON.stringify(encoderWasm)}});\n`;
  new vm.Script(source, {filename: 'rapier-jxl-worker.js'});
  return source;
}
