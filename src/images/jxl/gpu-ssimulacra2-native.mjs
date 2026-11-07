// SPDX-License-Identifier: MIT
import {ssimulacra2} from './ssimulacra2.mjs';
import {s2RGBA} from './ssimulacra2-input.mjs';
import {toRGBA} from './reconstruct.mjs';
import {gpuPipelineSet} from './gpu-pipelines.mjs';
import {Ssimulacra2Readback} from './gpu-ssimulacra2-measure.mjs';
import {metricPlaceShader} from './gpu-metric-pixels.mjs';
import {compileKernels} from './kernel-runtime.mjs';

function thresholds() {
  const level = v => toRGBA([Float32Array.of(v), Float32Array.of(0), Float32Array.of(0)], 1, 1)[0];
  const bits = new Uint32Array(1), values = new Float32Array(bits.buffer), at = b => { bits[0] = b; return values[0]; };
  const out = new Float32Array(256); out[0] = -Infinity;
  for (let k = 1; k < 256; k++) {
    let lo = 0, hi = 0x3f800000;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (level(at(mid)) >= k) hi = mid; else lo = mid + 1; }
    out[k] = at(lo);
  }
  return out;
}

const rgbaPipelines = gpuPipelineSet({place: metricPlaceShader([
  ['r', 'read'], ['g', 'read'], ['b', 'read'], ['th', 'read'], ['dist', 'read_write', 'u32'],
], 'dist[o] = level(r[k]) | (level(g[k]) << 8u) | (level(b[k]) << 16u) | 0xff000000u;', `
fn level(v: f32) -> u32 {
  var lo = 0u; var hi = 255u;
  while (lo < hi) { let mid = (lo + hi + 1u) >> 1u; if (v >= th[mid]) { lo = mid; } else { hi = mid - 1u; } }
  return lo;
}`)});

export class GpuNativeSsimulacra2 extends Ssimulacra2Readback {
  static async create(device, rgba, width, height) {
    if (!this.fits(device, width, height)) return null;
    const pixels = s2RGBA(rgba, width * height), self = new GpuNativeSsimulacra2();
    device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
    let thrown = null, remaining = 2;
    try {
      try {
        const [pipelines] = await Promise.all([rgbaPipelines(device), compileKernels()]);
        self.init(device, width, height, pipelines);
        self.keepReference({rgba: new Uint8Array(pixels)});
        self.dist = self.buffer(width * height * 4); self.th = self.buffer(256 * 4);
        device.queue.writeBuffer(self.th, 0, thresholds());
      } catch (error) { thrown = error; }
      remaining--; const validation = await device.popErrorScope();
      remaining--; const memory = await device.popErrorScope();
      this.failure = validation?.message || memory?.message || thrown?.message || null;
      if (validation || memory || thrown) { self.destroy(); return null; }
      return self;
    } catch (error) { self.destroy(); throw error; }
    finally { while (remaining-- > 0) await device.popErrorScope().catch(() => null); }
  }

  place(pass, rgb, tile) { this.placeBuffers(pass, [...rgb, this.th, this.dist], tile); }

  scoreRgba(rgba) {
    if (this.destroyed || this.busy) throw Object.assign(new Error('SSIMULACRA2 pixel owner is unavailable.'), {code: 'JXL_GPU'});
    return ssimulacra2(this.reference, {rgba}, this.width, this.height);
  }

  async score() {
    if (this.destroyed || this.busy) throw Object.assign(new Error('SSIMULACRA2 pixel owner is unavailable.'), {code: 'JXL_GPU'});
    this.busy = true;
    try {
      const [rgba] = await this.pixels([this.dist], Uint8Array);
      return ssimulacra2(this.reference, {rgba}, this.width, this.height);
    } finally { this.busy = false; }
  }
}
