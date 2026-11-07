// SPDX-License-Identifier: MIT
import {butteraugli, butteraugliReference, prepareButteraugli} from './butteraugli.mjs';
import {s2Dimensions, s2RGBA} from './ssimulacra2-input.mjs';

export class GpuButteraugli {
  static prepare() { return prepareButteraugli(); }

  static async create(device, width, height, {cacheBytes = 0} = {}) {
    s2Dimensions(width, height);
    if (!Number.isSafeInteger(cacheBytes) || cacheBytes < 0) throw new RangeError('Metric cache allowance must be nonnegative bytes.');
    await prepareButteraugli();
    const self = new GpuButteraugli();
    self.width = width; self.height = height; self.cacheBytes = cacheBytes; self.destroyed = false;
    return self;
  }

  setReference(rgba) {
    if (this.destroyed) throw new Error('The Butteraugli pixel owner is destroyed.');
    this.reference = butteraugliReference({rgba: s2RGBA(rgba, this.width * this.height)}, this.width, this.height,
      {cacheBytes: this.cacheBytes});
  }

  async score(rgba, {wantMap = false} = {}) {
    if (this.destroyed || !this.reference) throw new Error('The Butteraugli pixel owner has no reference.');
    const result = butteraugli(this.reference, {rgba: s2RGBA(rgba, this.width * this.height)});
    return {score: result.score, pnorm3: result.pnorm3, map: wantMap ? result.map : null};
  }

  destroy() { this.destroyed = true; this.reference = null; }
}
