// Pinned jixel (images/vendor/jxl-encoder): bytes in through alloc, result at out_ptr. No filesystem, network or imports.
import {JPEG_XL_LIMITS, codecError} from './header.mjs';

export async function createJPEGXLEncoder({wasmBinary}) {
  const {instance} = await WebAssembly.instantiate(joinWasm(wasmBinary), {});
  const api = instance.exports;
  const opaque = data => { for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false; return true; };
  const refused = () => codecError('JXL_MEMORY', 'JPEG XL could not allocate enough memory for this image.');
  // A trap is `unreachable` for OOM and every panic alike: a trap in alloc, or memory within an encode's peak of its maximum, is a memory refusal.
  const exhausted = plane => {
    const most = Math.max(plane * 1.25, 8 * 1048576);
    if (JPEG_XL_LIMITS.memory - api.memory.buffer.byteLength < most) return true;
    try { api.memory.grow(Math.ceil(most / 65536)); return false; } catch (_) { return true; }
  };
  return {encode(data, width, height, {quality, effort}) {
    let input = 0, allocating = true;
    try {
      input = api.alloc(data.byteLength);
      allocating = false;
      if (!input) throw refused();
      // alloc and encode can grow memory and detach every earlier buffer view.
      new Uint8Array(api.memory.buffer, input, data.byteLength).set(data);
      // Lossless effort 1 is the fast path; higher effort is Modular. Lossy with alpha is jixel's stream, read by libjxl, not by jxl-oxide 0.12.6.
      // Quality to distance per libjxl JxlEncoderDistanceFromQuality: 90 is 1.0, 95 is 0.55, 100 lossless.
      const distance = quality >= 100 ? 0 : quality >= 30 ? 0.1 + (100 - quality) * 0.09 : 53 / 3000 * quality * quality - 23 / 20 * quality + 25;
      const lossless = quality === 100;
      let size;
      if (lossless) size = effort <= 1 ? api.encode_fast(input, width, height) : api.encode(input, width, height, 1, 100);
      else if (opaque(data)) size = api.encode_rgb(input, width, height, 0, distance);
      else {
        // A lossy copy rounds alpha to 32 levels; jixel keeps alpha exact otherwise.
        const held = new Uint8Array(api.memory.buffer, input, data.byteLength);
        for (let i = 3; i < held.length; i += 4) { const a = held[i]; if (a && a !== 255) held[i] = Math.min(255, Math.round(a / 8) * 8); }
        size = api.encode(input, width, height, 0, distance);
      }
      if (!size) throw codecError('JXL_ENCODE', 'JPEG XL could not encode this image.');
      if (size > JPEG_XL_LIMITS.bytes) throw codecError('JXL_SIZE', 'The encoded JPEG XL image exceeds 16 MiB.');
      return new Uint8Array(new Uint8Array(api.memory.buffer, api.out_ptr(), size));
    } catch (error) {
      if (error?.name === 'RuntimeError' && (allocating || exhausted(data.byteLength))) throw refused();
      throw error;
    } finally {
      if (input) api.dealloc(input, data.byteLength);
      api.release();
    }
  }};
}

// Inverse of codec-build.mjs splitWasm, byte for byte; input without the mark passes through.
export function joinWasm(packed) {
  if (packed[0] !== 0 || packed[1] !== 0x73 || packed[2] !== 0x74 || packed[3] !== 0x72) return packed;
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const out = new Uint8Array(view.getUint32(4, true)), bodies = view.getUint32(8, true);
  // One cursor per part, in splitWasm's order: 0 head, 1 tail, 2 body sizes, 3 locals, 4 opcodes,
  // 5 block types, 6 branch depths, 7 calls, 8 call types, 9 local indices, 10 globals, 11 aligns,
  // 12 offsets, 13 memories, 14 i32, 15 i64, 16 f32, 17 f64.
  const cursor = new Uint32Array(18), limit = new Uint32Array(18);
  for (let k = 0, read = 12; k < 18; k++) { const length = view.getUint32(read, true); cursor[k] = read + 4; limit[k] = read + 4 + length; read += 4 + length; }
  let at = 0;
  const leb = k => { let p = cursor[k], value = 0, scale = 1, byte; do { byte = packed[p++]; out[at++] = byte; value += (byte & 127) * scale; scale *= 128; } while (byte & 128); cursor[k] = p; return value; };
  const copy = (k, length) => { const p = cursor[k]; out.set(packed.subarray(p, p + length), at); cursor[k] = p + length; at += length; };
  copy(0, limit[0] - cursor[0]);
  for (let n = 0; n < bodies; n++) {
    const size = leb(2), end = at + size;
    for (let groups = leb(3); groups--;) { leb(3); out[at++] = packed[cursor[3]++]; }
    while (at < end) {
      const op = out[at++] = packed[cursor[4]++];
      if (op >= 0x20 && op <= 0x22) leb(9);
      else if (op >= 0x28 && op <= 0x3e) { leb(11); leb(12); }
      else if (op === 0x41) leb(14);
      else if (op >= 0x45 || op <= 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x1a || op === 0x1b) {
        if (op === 0xfc) { const sub = leb(4); if (sub === 10) { leb(13); leb(13); } else if (sub === 11) leb(13); }
      }
      else if (op >= 0x02 && op <= 0x04) { const type = packed[cursor[5]]; if (type === 0x40 || (type >= 0x6f && type <= 0x7f)) out[at++] = packed[cursor[5]++]; else leb(5); }
      else if (op === 0x0c || op === 0x0d) leb(6);
      else if (op === 0x0e) for (let targets = leb(6) + 1; targets--;) leb(6);
      else if (op === 0x10) leb(7);
      else if (op === 0x11) { leb(8); leb(8); }
      else if (op === 0x23 || op === 0x24) leb(10);
      else if (op === 0x3f || op === 0x40) leb(13);
      else if (op === 0x42) leb(15);
      else if (op === 0x43) copy(16, 4);
      else if (op === 0x44) copy(17, 8);
    }
  }
  copy(1, limit[1] - cursor[1]);
  return out;
}
