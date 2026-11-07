// SPDX-License-Identifier: MIT
import {fault} from './admit.mjs';
import {varDCTGeometry, varDCTLayout} from './vardct-header.mjs';
import {strategyStorageShape} from './vardct-blocks.mjs';
import {TRANSFORMS} from './vardct-strategies.mjs';
import {prefetchTyped} from './typed-views.mjs';

const bad = () => { throw fault('JXL_INPUT', 'Invalid finite VarDCT image descriptor.'); };
const integer = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
const samples = v => v instanceof Int16Array || v instanceof Int32Array;
const plane = (v, minimum) => (v instanceof Int8Array || v instanceof Uint8Array || v instanceof Uint8ClampedArray ||
  v instanceof Int16Array || v instanceof Uint16Array || v instanceof Int32Array || v instanceof Uint32Array ||
  v instanceof Float32Array || v instanceof Float64Array) && integer(v.length, minimum, Number.MAX_SAFE_INTEGER);
const bits = v => v?.bytes instanceof Uint8Array && integer(v.at, 0, v.bytes.length) && integer(v.pending, 0, 7) && integer(v.acc, 0, 2 ** v.pending - 1);
const power = v => [1, 2, 4, 8].includes(v);
const fieldSize = v => integer(v, 1, 2 ** 30);

function bitFields(record, names) {
  if (record !== undefined && (record === null || typeof record !== 'object' || Array.isArray(record))) bad();
  for (const name of names) if (record?.[name] != null && !bits(record[name])) bad();
}

function tableShape(table, family) {
  const transform = TRANSFORMS.find(t => t.table === family);
  const width = Math.max(transform.width, transform.height), height = Math.min(transform.width, transform.height);
  if (!table || table.w !== width || table.h !== height || !Array.isArray(table.planes) || table.planes.length !== 3 ||
      table.planes.some(v => !(v instanceof Int32Array || v instanceof Float64Array) || v.length !== width * height)) bad();
  if (table.parameters == null) return;
  const p = table.parameters, syntax = p.syntax;
  if (!p || !syntax || !integer(p.mode, 0, 6) || p.mode !== syntax.mode || typeof p.library !== 'boolean' || p.library !== syntax.library ||
      !integer(syntax.kind, 1, 6) || !Array.isArray(p.weights) || p.weights.length !== 3 ||
      p.weights.some(v => !(v instanceof Float64Array) || v.length !== width * height)) bad();
  const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  const triplet = (v, n) => Array.isArray(v) && v.length === 3 && v.every(row => vector(row, n));
  const bands = v => integer(v?.[0]?.length, 1, 16) && triplet(v, v[0].length);
  if (syntax.kind === 1 || syntax.kind === 2) { if (!triplet(syntax.weights, syntax.kind === 1 ? 3 : 6)) bad(); }
  else if (syntax.kind === 3) { if (!triplet(syntax.multipliers, 2) || !bands(syntax.bands)) bad(); }
  else if (syntax.kind === 4) { if (!vector(syntax.multipliers, 3) || !bands(syntax.bands)) bad(); }
  else if (syntax.kind === 5) { if (!triplet(syntax.weights, 9) || !bands(syntax.bands4x8) || !bands(syntax.bands4x4)) bad(); }
  else if (!bands(syntax.bands)) bad();
}

export function varDCTImageShape(image, plan = {}) {
  if (!image || !fieldSize(image.width) || !fieldSize(image.height) || !Number.isSafeInteger(image.width * image.height) ||
      !Array.isArray(image.components) || ![1, 3].includes(image.components.length) ||
      !Number.isFinite(image.quantScale ?? 1) || (image.quantScale ?? 1) <= 0 ||
      !integer(image.quantFieldBase ?? 1, 1, 2 ** 31) || !power(image.upsampling ?? 1)) bad();
  if (image.band || image.unpackBand || image.alphaRows || image.frameHeader || image.colorSpace && typeof image.colorSpace === 'object')
    throw fault('JXL_UNSUPPORTED', 'Finite VarDCT needs committed numerical views and prepared image-header spans.');
  for (const c of image.components) if (!c || ![1, 2].includes(c.h) || ![1, 2].includes(c.v) ||
      !integer(c.stride, 1, Number.MAX_SAFE_INTEGER) || !integer(c.rows, 1, Number.MAX_SAFE_INTEGER) ||
      !plane(c.quant, 64) || c.quant.length !== 64 || c.row0 != null && c.row0 !== 0) bad();
  const progression = image.progression, passes = progression?.count ?? 1;
  if (!integer(passes, 1, 11)) bad();
  if (progression) {
    if (!Array.isArray(progression.passes) || progression.passes.length !== passes || !bits(progression.header) ||
        !integer(progression.alphaPass, 0, passes - 1) || !Array.isArray(progression.brackets) || progression.brackets.length !== passes || progression.value !== undefined) bad();
    for (let i = 0; i < passes; i++) {
      const pass = progression.passes[i], previous = progression.passes[i - 1], bracket = progression.brackets[i];
      if (!pass || !power(pass.downsample) || !integer(pass.shift, 0, 3) || pass.scale !== 2 ** pass.shift ||
          previous && (pass.downsample > previous.downsample || pass.shift > previous.shift) ||
          !bracket || !integer(bracket.minimum, 0, 3) || !integer(bracket.maximum, -1, 3)) bad();
    }
    if (progression.passes.at(-1).downsample !== 1 || progression.passes.at(-1).shift !== 0) bad();
  }
  if (plan.orders && (!Array.isArray(plan.orders) || plan.orders.length !== image.components.length ||
      plan.orders.some(v => !Array.isArray(v) || v.length !== 64 || v.some(k => !integer(k, 0, 63)) || new Set(v).size !== 64 || v[0] !== 0))) bad();
  const layout = varDCTGeometry(image, plan), cells = layout.xsizeBlocks * layout.ysizeBlocks;
  if (!Number.isSafeInteger(cells) || !Number.isSafeInteger(layout.field) || !Number.isSafeInteger(layout.shift)) bad();
  for (let channel = 0; channel < 3; channel++) {
    const c = layout.comps[channel], w = layout.xsizeBlocks >> layout.hshifts[channel], h = layout.ysizeBlocks >> layout.vshifts[channel];
    if (c.stride < w || c.rows < h || !Number.isSafeInteger(c.stride * c.rows * 64) ||
        !samples(c.coeffs) || !image.strategyData && c.coeffs.length < c.stride * c.rows * 64 ||
        c.dc != null && (!samples(c.dc) || c.dc.length < c.stride * c.rows)) bad();
  }
  if (image.strategyData) {
    strategyStorageShape(image.strategyData, layout.xsizeBlocks, layout.ysizeBlocks, layout.numGroups);
    for (let family = 0; family < 17; family++) if (image.strategyData.tables[family] !== null) tableShape(image.strategyData.tables[family], family);
  }
  if (image.quantFields != null && !plane(image.quantFields, cells) ||
      image.sharpness != null && !plane(image.sharpness, cells) || image.alpha != null && !plane(image.alpha, image.width * image.height * 4)) bad();
  if (image.cfl) {
    const width = Math.ceil(layout.xsizeBlocks / 8), height = Math.ceil(layout.ysizeBlocks / 8);
    if (image.cfl.width !== width || !plane(image.cfl.x, width * height) || !plane(image.cfl.b, width * height)) bad();
  }
  if (image.nonZero != null && (!Array.isArray(image.nonZero) || image.nonZero.length !== image.components.length ||
      image.nonZero.some((v, c) => !plane(v, image.components[c].stride * image.components[c].rows)))) bad();
  if (image.quantTable != null && (!Array.isArray(image.quantTable) || image.quantTable.length !== image.components.length ||
      image.quantTable.some(v => !Array.isArray(v) || v.length !== 6 || v.some(k => !integer(k, 0, 65535))))) bad();
  bitFields(image.profile, ['colorData', 'toneData', 'iccData', 'imageFields', 'extraChannelData', 'transformData']);
  if (image.splineBits != null && !bits(image.splineBits) || image.noiseLut != null &&
      (!(image.noiseLut instanceof Float64Array) || image.noiseLut.length !== 8)) bad();
  if (image.authoredOrderPasses != null) {
    if (!Array.isArray(image.authoredOrderPasses) || image.authoredOrderPasses.length !== passes) bad();
    for (const order of image.authoredOrderPasses) if (!order || !bits(order.header)) bad();
  }
  const placement = image.placement;
  if (placement) {
    if (!integer(placement.saveAsReference ?? 0, 0, 3) || placement.mask && (!placement.alphaChannel || !placement.crop)) bad();
    if (placement.crop && (!fieldSize(placement.imageWidth) || !fieldSize(placement.imageHeight) ||
        !integer(placement.crop.x, -(2 ** 29), 2 ** 29 - 1) || !integer(placement.crop.y, -(2 ** 29), 2 ** 29 - 1) ||
        !fieldSize(placement.crop.width) || !fieldSize(placement.crop.height))) bad();
  }
  const extra = image.auxiliary;
  if (extra) {
    if (!integer(extra.count, 1, 256) || !Array.isArray(extra.factors) || extra.factors.length !== extra.count ||
        extra.factors.some(v => !power(v)) || !Array.isArray(extra.channels) || extra.channels.length !== extra.count) bad();
    if (extra.global || extra.group || extra.downsample) throw fault('JXL_UNSUPPORTED', 'Finite auxiliary streams need their plain channel descriptors.');
    for (const channel of extra.channels) if (!channel || !fieldSize(channel.width) || !fieldSize(channel.height) ||
        !integer(channel.shift, 0, 30) || !integer(channel.hshift ?? channel.shift, 0, 30) || !integer(channel.vshift ?? channel.shift, 0, 30) ||
        !plane(channel.data, channel.width * channel.height)) bad();
  }
  return layout;
}

export function prepareVarDCTLayout(image, plan = {}) {
  const layout = varDCTImageShape(image, plan);
  prefetchTyped(...layout.comps.map(c => [c.quant, [0]]));
  for (const c of layout.comps) if (!integer(c.quant[0], 1, 2 ** 31 - 1)) bad();
  return varDCTLayout(image, plan, layout);
}
