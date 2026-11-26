// SPDX-License-Identifier: MIT
import {complete} from './bits.mjs';
import {prepareV6, v6Options} from './photo-v6.mjs';
import {uploadFlat, uploadGrain} from './photo-v6-settings.mjs';
import {pruneLayout} from './photo-whole-search.mjs';
import {wholeRebuildMeasure} from './photo-whole-rebuild.mjs';
import {photoXYBSteps} from './photo-xyb.mjs';
import {fixedStrategyImage} from './varblock-core.mjs';
import {strategyAnsSteps} from './coefficient-ans.mjs';
import {learnedOrders} from './varblock-write.mjs';
import {writeImageSteps} from './photo-image-write.mjs';
import {quantFieldValue} from './vardct-planes.mjs';

const TILE = 32, SIDE = 128, PIXELS = SIDE * SIDE, SAMPLE_MARGIN = 0.01;

function mapPatchLayout(layout, patches, stride) {
  const shape = [];
  for (const {id, bx, by} of pruneLayout(layout)) {
    const patch = patches.get((by & ~3) * stride + (bx & ~3));
    if (patch) shape.push({id, bx: bx - patch.bx + patch.x, by: by - patch.by + patch.y});
  }
  shape.sort((a, b) => a.by - b.by || a.bx - b.bx);
  return shape;
}

function sampleGrid(source, width, height) {
  const pixels = new Uint8Array(4 * PIXELS), patches = new Map(), cells = [];
  const stride = Math.ceil(width / 8);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const bx = 4 * Math.floor((width - TILE) * (x + .5) / 4 / TILE);
    const by = 4 * Math.floor((height - TILE) * (y + .5) / 4 / TILE);
    patches.set(by * stride + bx, {bx, by, x: x * 4, y: y * 4});
    for (let row = 0; row < TILE; row++) {
      const first = 4 * ((8 * by + row) * width + 8 * bx);
      pixels.set(source.subarray(first, first + 4 * TILE), 4 * ((y * TILE + row) * SIDE + x * TILE));
    }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++)
      cells[(y * 4 + j) * (SIDE / 8) + x * 4 + i] = (by + j) * stride + bx + i;
  }
  if (patches.size !== 16) return null;
  return {pixels, patches, cells, stride};
}

function sampleTiles(source, width, height, layout) {
  const grid = sampleGrid(source, width, height);
  if (!grid) return null;
  return {pixels: grid.pixels, cells: grid.cells, shape: mapPatchLayout(layout, grid.patches, grid.stride)};
}

function costsMore(low, high) {
  if (!low.ordinary || !low.seed || !high.ordinary || !high.seed) return false;
  const ordinary = high.ordinary.score - low.ordinary.score, seed = high.seed.score - low.seed.score;
  if (ordinary <= .05 || seed <= .05 || high.ordinary.price <= low.ordinary.price || high.seed.price <= low.seed.price) return false;
  const slope = (Math.log(high.seed.price / low.seed.price) + Math.log(high.ordinary.price / low.ordinary.price)) / (ordinary + seed);
  const logRate = Math.log(low.seed.price / low.ordinary.price) + Math.log(high.seed.price / high.ordinary.price);
  const gap = low.ordinary.score - low.seed.score + high.ordinary.score - high.seed.score;
  return logRate + slope * gap > -2 * SAMPLE_MARGIN;
}

export function declineSampledSeed(source, width, height, quality, plan, reading = null) {
  if (reading) reading.low = reading.high = null;
  if (!plan?.layout || Math.min(width, height) < SIDE || width * height <= 4 * PIXELS) return false;
  const sample = sampleTiles(source, width, height, plan.layout);
  if (!sample) return false;
  const {pixels, cells, shape} = sample, fraction = PIXELS / (width * height);
  const prepared = prepareV6(pixels, SIDE, SIDE, {}, {}, {upload: true});
  prepared.facts = {flat: uploadFlat(source, width, height), grain: uploadGrain(source, width, height)};
  const meter = wholeRebuildMeasure(pixels, SIDE, SIDE, {space: 'srgb'}), receipts = new WeakMap();
  try {
    const options = {...plan.options, model: 'simple', deadzone: v6Options(prepared, 75).deadzone, layout: shape,
      ...(quality > 85 && {gentleChromaDz: true})};
    if (plan.options?.deadzoneMap) options.deadzoneMap = cells.map(i => plan.options.deadzoneMap[i]);
    const take = (image, file) => {
      const receipt = receipts.get(file);
      if (!receipt) return null;
      const {header, section} = receipt;
      const native = meter.measure(image, {ssimulacra2: true, butteraugli: false, exact: true, arithmetic: 'libjxl'});
      const score = (typeof native?.next === 'function' ? complete(native) : native).ssimulacra2;
      return {score, price: section - header / 8 + fraction * header / 8};
    };
    const at = coder => {
      const plain = complete(photoXYBSteps(pixels, SIDE, SIDE, coder, {...v6Options(prepared, coder), keepPlanes: true}));
      const base = {...plain};
      if (plan.field) {
        base.quantFields = Int32Array.from(cells, i => quantFieldValue(64 * plan.field[i]));
        base.quantFieldBase = 64;
        base.epf *= 2;
      }
      base.epf *= plan.epfScale ?? 1;
      const image = fixedStrategyImage(base, SIDE, SIDE, options).image;
      plain.seedSampleCosts = image.seedSampleCosts = receipts;
      const ordinary = take(plain, complete(writeImageSteps(plain, 5)));
      const seed = take(image, complete(strategyAnsSteps(image, 6, learnedOrders(image))));
      return {ordinary, seed};
    };
    const low = at(plan.quality), high = at(Math.min(99.5, plan.quality + 2));
    if (reading) { reading.low = low.seed; reading.high = high.seed; }
    return costsMore(low, high);
  } finally {
    meter.destroy?.();
    prepared.pres.clear();
  }
}
