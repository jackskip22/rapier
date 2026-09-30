import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {JPEG_XL_LIMITS, codecError, byteView, boundedDimensions} from './header.mjs';

// The encoder's modules, in dependency order; each imports only the ones before it.
export const JPEG_XL_MODULES = ['jxl/bits.mjs', 'jxl/prefix.mjs', 'jxl/modular.mjs', 'jxl/frame.mjs', 'jxl/squeeze.mjs', 'jxl/lossless.mjs', 'jxl/lossy.mjs',
  'jxl/jfif.mjs', 'jxl/entropy.mjs', 'jxl/vardct.mjs', 'jxl/admit.mjs', 'jxl/weighted.mjs', 'jxl/effort.mjs', 'jxl/jpeg.mjs', 'jxl/photo.mjs', 'encoder.mjs'];

// A module's own export lists go (a door may rename a binding for its readers); every other `export` keyword too.
const plain = source => source.replace(/^import .*;\n/gm, '').replace(/^export \{[^\n]+\};\n/gm, '').replace(/^export /gm, '');

// The document profile ships no encoder; its worker refuses encode with JXL_UNAVAILABLE.
export async function buildJPEGXLWorker(root, {profile = 'full'} = {}) {
  let factory = 'const encoderFactory = undefined;';
  if (profile !== 'document') {
    const sources = await Promise.all(JPEG_XL_MODULES.map(name => readFile(resolve(root, 'images', name), 'utf8')));
    factory = sources.map(plain).join('\n') + '\nconst encoderFactory = createJPEGXLEncoder;';
  }
  // R83: no bundled JPEG XL decoder. Serialize the actual definitions, never a source slice tied to comments.
  const header = 'const JPEG_XL_LIMITS = Object.freeze(' + JSON.stringify(JPEG_XL_LIMITS) + ');\n' +
    [codecError, byteView, boundedDimensions].join('\n');
  const adapter = header + '\n' + plain(await readFile(resolve(root, 'images/codec.mjs'), 'utf8'));
  const source = `'use strict';\n${factory}\n${adapter}\ninstallJPEGXLWorker({encoderFactory});\n`;
  new vm.Script(source, {filename: 'rapier-jxl-worker.js'});
  return source;
}
