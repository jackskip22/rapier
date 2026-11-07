// SPDX-License-Identifier: MIT
import {captureTally, captureFeatures, featureStride, CAPTURE_PROPERTIES, CAPTURE_CUTS} from './capture-tally.mjs';

const TALLY_WGSL =  `
struct P { n: u32, props: u32, bins: u32, preds: u32, toks: u32, slots: u32, stride: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> bin: array<u32>;
@group(0) @binding(2) var<storage, read> tok: array<u32>;
@group(0) @binding(3) var<storage, read> node: array<u32>;
@group(0) @binding(4) var<storage, read_write> out: array<atomic<u32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = id.x + id.z * groups.x * 256u; let prop = id.y;
  if (i >= p.n) { return; }
  let slot = (node[i >> 1u] >> ((i & 1u) * 16u)) & 0xffffu;
  if (slot >= p.slots) { return; }
  let at = prop * p.stride + i;
  let b = (bin[at >> 2u] >> ((at & 3u) * 8u)) & 0xffu;
  if (b >= p.bins) { return; }
  let t = tok[i];
  let base = ((prop * p.slots + slot) * p.bins + b) * p.preds * p.toks;
  for (var k = 0u; k < p.preds; k++) { atomicAdd(&out[base + k * p.toks + ((t >> (6u * k)) & 63u)], 1u); }
}`;
const FEATURES_WGSL =  `
struct P { n: u32, width: u32, stride: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> plane: array<i32>;
@group(0) @binding(2) var<storage, read> wpRes: array<u32>;
@group(0) @binding(3) var<storage, read> wpProp: array<i32>;
@group(0) @binding(4) var<storage, read> cuts: array<i32>;
@group(0) @binding(5) var<storage, read_write> bins: array<u32>;
@group(0) @binding(6) var<storage, read_write> tok: array<u32>;
fn token(v: u32) -> u32 {
  if (v < 16u) { return v; }
  let e = 31u - countLeadingZeros(v);
  return min(63u, 16u + (((e - 4u) << 2u) | (((v >> (e - 1u)) & 1u) << 1u) | (v & 1u)));
}
fn packed(r: i32) -> u32 { return select(u32(-r) * 2u - 1u, u32(r) * 2u, r >= 0); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let q = id.x + id.y * groups.x * 64u;
  if (q * 4u >= p.n) { return; }
  var words = array<u32, ${CAPTURE_PROPERTIES.length}>();
  let width = i32(p.width);
  for (var j = 0u; j < 4u; j++) {
    let i = q * 4u + j;
    if (i >= p.n) { break; }
    let x = i32(i % p.width); let y = i32(i / p.width); let at = i32(i);
    var w = 0; if (x > 0) { w = plane[at - 1]; } else if (y > 0) { w = plane[at - width]; }
    var nn = w; if (y > 0) { nn = plane[at - width]; }
    var nw = w; if (x > 0 && y > 0) { nw = plane[at - width - 1]; }
    var ne = nn; if (y > 0 && x + 1 < width) { ne = plane[at - width + 1]; }
    var n2 = nn; if (y > 1) { n2 = plane[at - 2 * width]; }
    var ww = w; if (x > 1) { ww = plane[at - 2]; }
    var value = array<i32, ${CAPTURE_PROPERTIES.length}>(y, x, abs(nn), abs(w), w - nw, nw - nn, nn - ne, nn - n2, w - ww, wpProp[i]);
    for (var k = 0u; k < ${CAPTURE_PROPERTIES.length}u; k++) {
      var b = 0u;
      loop { if (b >= ${CAPTURE_CUTS}u || cuts[k * ${CAPTURE_CUTS}u + b] >= value[k]) { break; } b++; }
      words[k] = words[k] | (b << (8u * j));
    }
    let v = plane[i]; let gradient = max(min(w, nn), min(max(w, nn), w + nn - nw));
    tok[i] = token(packed(v - w)) | (token(packed(v - nn)) << 6u) | (token(packed(v - gradient)) << 12u) | (token(wpRes[i]) << 18u);
  }
  for (var k = 0u; k < ${CAPTURE_PROPERTIES.length}u; k++) { bins[k * (p.stride / 4u) + q] = words[k]; }
}`;
const featurePipelines = new WeakMap();
async function featuresOnDevice(device, {plane, width, height, wpRes, wpProp, cuts}) {
  const n = width * height, stride = featureStride(n), props = CAPTURE_PROPERTIES.length;
  let pipeline = featurePipelines.get(device);
  if (!pipeline) featurePipelines.set(device, pipeline = await device.createComputePipelineAsync({layout: 'auto', compute: {module: device.createShaderModule({code: FEATURES_WGSL}), entryPoint: 'main'}}));
  const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, made = [];
  const buffer = (bytes, usage) => { const b = device.createBuffer({size: Math.max(16, bytes + 3 & ~3), usage}); made.push(b); return b; };
  const upload = (array, usage = S | D) => { const b = buffer(array.byteLength, usage); device.queue.writeBuffer(b, 0, array); return b; };
  try {
    const binB = buffer(props * stride, S | GPUBufferUsage.COPY_SRC), tokB = buffer(n * 4, S | GPUBufferUsage.COPY_SRC);
    const readBin = buffer(props * stride, GPUBufferUsage.MAP_READ | D), readTok = buffer(n * 4, GPUBufferUsage.MAP_READ | D);
    const entries = [upload(Uint32Array.of(n, width, stride, 0), GPUBufferUsage.UNIFORM | D), upload(Int32Array.from(plane.subarray(0, n))), upload(wpRes), upload(wpProp), upload(cuts), binB, tokB]
      .map((b, binding) => ({binding, resource: {buffer: b}}));
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(), blocks = Math.ceil(n / 256), wide = Math.min(blocks, 65535);
    pass.setPipeline(pipeline); pass.setBindGroup(0, device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries}));
    pass.dispatchWorkgroups(wide, Math.ceil(blocks / wide)); pass.end();
    encoder.copyBufferToBuffer(binB, 0, readBin, 0, props * stride); encoder.copyBufferToBuffer(tokB, 0, readTok, 0, n * 4);
    device.queue.submit([encoder.finish()]);
    await Promise.all([readBin.mapAsync(GPUMapMode.READ), readTok.mapAsync(GPUMapMode.READ)]);
    return {bin: new Uint8Array(readBin.getMappedRange().slice(0)), tok: new Uint32Array(readTok.getMappedRange().slice(0))};
  } finally { for (const b of made) b.destroy(); }
}

const tallies = new WeakMap();
async function tallyOnDevice(device, request) {
  const {n, props, bins, preds, toks, slots, bin, tok, node} = request;
  let pipeline = tallies.get(device);
  if (!pipeline) tallies.set(device, pipeline = await device.createComputePipelineAsync({layout: 'auto', compute: {module: device.createShaderModule({code: TALLY_WGSL}), entryPoint: 'main'}}));
  const size = props * slots * bins * preds * toks * 4, S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, made = [];
  const buffer = (bytes, usage) => { const b = device.createBuffer({size: Math.max(16, bytes + 3 & ~3), usage}); made.push(b); return b; };
  const upload = (array, usage = S | D) => { const b = buffer(array.byteLength, usage), whole = array.byteLength & ~3; if (whole) device.queue.writeBuffer(b, 0, array.buffer, array.byteOffset, whole); if (whole < array.byteLength) { const tail = new Uint8Array(4); tail.set(new Uint8Array(array.buffer, array.byteOffset + whole, array.byteLength - whole)); device.queue.writeBuffer(b, whole, tail); } return b; };
  try {
    const params = upload(Uint32Array.of(n, props, bins, preds, toks, slots, featureStride(n), 0), GPUBufferUsage.UNIFORM | D), out = buffer(size, S | GPUBufferUsage.COPY_SRC), read = buffer(size, GPUBufferUsage.MAP_READ | D);
    const entries = [params, upload(bin), upload(tok), upload(node), out].map((b, binding) => ({binding, resource: {buffer: b}}));
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass(), blocks = Math.ceil(n / 256), wide = Math.min(blocks, 65535);
    pass.setPipeline(pipeline); pass.setBindGroup(0, device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries}));
    pass.dispatchWorkgroups(wide, props, Math.ceil(blocks / wide)); pass.end();
    encoder.copyBufferToBuffer(out, 0, read, 0, size);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    return new Uint32Array(read.getMappedRange().slice(0));
  } finally { for (const b of made) b.destroy(); }
}


export const FEATURES = Object.freeze({
  name: 'features',
  run: featuresOnDevice,
  audit(request, answer, turn) {
    const n = request.width * request.height, from = Math.min(n, turn * 1024 % Math.max(1, n)), to = Math.min(n, from + 1024), stride = featureStride(n), twin = captureFeatures(request, from, to);
    for (let i = from; i < to; i++) {
      if (answer.tok[i] !== twin.tok[i]) return false;
      for (let p = 0; p < CAPTURE_PROPERTIES.length; p++) if (answer.bin[p * stride + i] !== twin.bin[p * stride + i]) return false;
    }
    return true;
  },
  async selfTest(device) {
    let s = 9;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296, n = 37 * 29;
    const request = {kind: 'features', width: 37, height: 29, plane: Int16Array.from({length: n}, () => Math.round((rnd() - 0.5) * 600)),
      wpRes: Uint32Array.from({length: n}, () => rnd() * 4096 >>> 0), wpProp: Int32Array.from({length: n}, () => Math.round((rnd() - 0.5) * 300)),
      cuts: Int32Array.from({length: CAPTURE_PROPERTIES.length * CAPTURE_CUTS}, (_, i) => (i % CAPTURE_CUTS - 15) * 8)};
    const answer = await featuresOnDevice(device, request);
    return FEATURES.audit(request, answer, 0) && FEATURES.audit(request, answer, 1);
  },
});
export const TALLY = Object.freeze({
  name: 'tally',
  run: tallyOnDevice,
  audit(request, answer, turn) {
    const prop = turn % request.props, twin = captureTally(request, prop), block = request.slots * request.bins * request.preds * request.toks;
    for (let i = prop * block; i < (prop + 1) * block; i++) if (answer[i] !== twin[i]) return false;
    return true;
  },
  async selfTest(device) {
    let s = 11;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296, n = 4096, props = 3;
    const request = {kind: 'tally', n, props, bins: 32, preds: 4, toks: 64, slots: 8, bin: Uint8Array.from({length: n * props}, () => rnd() * 33),
      tok: Uint32Array.from({length: n}, () => rnd() * 2 ** 24 >>> 0), node: Uint16Array.from({length: n}, () => rnd() < 0.1 ? 0xffff : rnd() * 9)};
    const answer = await tallyOnDevice(device, request);
    for (let prop = 0; prop < props; prop++) if (!TALLY.audit(request, answer, prop)) return false;
    return true;
  },
});
