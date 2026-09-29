import {gzipSync} from 'node:zlib';
// The build's one compressor: Zopfli (tools/vendor/zopfli, Apache-2.0), plain gzip DecompressionStream decodes. Deterministic.
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// Loaded on first use: the module decodes a WASM binary from base64 at load, so a build the gates
// refuse never allocates it and a refusal's message stands alone on stderr.
let _zopfli = null;
const zopfli = () => _zopfli || (_zopfli = require('./vendor/zopfli/index.js'));

// RAPIER_PACK=fast packs with zlib for iteration (seconds, not minutes); never a release: the
// build receipt says so and the size gate is judged only on the Zopfli path.
export const FAST_PACK = process.env.RAPIER_PACK === 'fast';
export async function zopfliGzip(bytes) {
  if (FAST_PACK) return gzipSync(Buffer.from(bytes), {level: 9, mtime: 0});
  // blocksplittingmax 0: 13,355 bytes smaller than the default 15-block cap; ~105 s instead of ~45 s.
  const out = await zopfli().gzipAsync(Buffer.from(bytes), {numiterations: 15, blocksplittingmax: 0});
  const gzip = Buffer.from(out);
  if (gzip[0] !== 0x1f || gzip[1] !== 0x8b) throw new Error('Zopfli did not produce a gzip stream');
  return gzip;
}
