// SPDX-License-Identifier: MIT
import {ssimulacra2, ssimulacra2Reference} from './ssimulacra2.mjs';
import {GpuLinearPixels} from './gpu-metric-pixels.mjs';
import {compileKernels} from './kernel-runtime.mjs';

const unavailable = () => Object.assign(new Error('SSIMULACRA2 pixel owner is unavailable.'), {code: 'JXL_GPU'});

export class Ssimulacra2Readback extends GpuLinearPixels {
  keepReference(reference) {
    this.reference = ssimulacra2Reference(reference, this.width, this.height, {immutable: true});
  }
  destroy() { super.destroy(); this.reference = this.referenceBuffers = null; }
}

export class GpuSsimulacra2Measure extends Ssimulacra2Readback {
  static async create(device, width, height, reference) {
    const self = new GpuSsimulacra2Measure();
    try {
      await compileKernels();
      await self.initLinear(device, width, height);
      self.referenceBuffers = reference;
      return self;
    } catch (error) { self.destroy(); throw error; }
  }

  async score() {
    if (this.destroyed || this.busy) throw unavailable();
    this.busy = true;
    try {
      if (!this.reference) { this.keepReference(await this.pixels(this.referenceBuffers, Float32Array)); this.referenceBuffers = null; }
      const linear = await this.pixels(this.dist, Float32Array);
      return ssimulacra2(this.reference, linear, this.width, this.height);
    } finally { this.busy = false; }
  }
}
