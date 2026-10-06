// SPDX-License-Identifier: AGPL-3.0-only
// Disjoint rows, original Float64 arithmetic and original Float32 stores. Only the paint
// worker may wait at a dab barrier. Small dabs call the untouched engine immediately.
import {PaintSurface} from './paint.mjs';
export const PAINT_SPLIT_PIXELS = 16384;
const EPOCH = 0, COMPLETE = 16, REMAINING = 32, MODE = 48, FAILED = 64;
const mix = PaintSurface.prototype._blendNormalPaint, lay = PaintSurface.prototype._lay;

export function installPaintRowWorker(scope = globalThis) {
 let configured = false;
 scope.onmessage = ({data: message}) => {
  if (message.operation === 'init') {
   if (configured) throw new Error('Paint row worker already configured');
   configured = true;
   const {slot, count, controlBuffer, parameterBuffer, partitionBuffer, resultBuffer} = message;
   const control = new Int32Array(controlBuffer), parameters = new Float64Array(parameterBuffer);
   const partitions = new Int32Array(partitionBuffer), results = new Int32Array(resultBuffer);
   scope.onmessage = ({data: binding}) => {
    const surface = Object.create(PaintSurface.prototype);
    surface.width = binding.width; surface.height = binding.height;
    surface.data = new Float32Array(binding.dataBuffer);
    const volume = new Uint8Array(binding.volumeBuffer), mask = new Float32Array(binding.maskBuffer), spans = new Int32Array(binding.spanBuffer);
    surface._lay = function(p, a, o) { this.volume ||= volume; return lay.call(this, p, a, o); };
    surface.toothTiles = null; surface.toothTilesW = 0;
    surface.toothSeed = parameters[10]; surface.toothOX = parameters[11]; surface.toothOY = parameters[12];
    let seen = Atomics.load(control, EPOCH);
    const arrive = () => { if (Atomics.sub(control, REMAINING, 1) === 1) { Atomics.store(control, COMPLETE, seen); Atomics.notify(control, COMPLETE); } };
    arrive();
    try {
     for (;;) {
      Atomics.wait(control, EPOCH, seen);
      const next = Atomics.load(control, EPOCH);
      if (next === seen) continue;
      seen = next;
      if (Atomics.load(control, MODE) === 2) return;
      const from = partitions[slot], to = partitions[slot + 1], w = parameters[2];
      surface.body = parameters[8]; surface.bite = parameters[9]; surface.volume = parameters[13] ? volume : null;
      if (surface.toothSeed !== parameters[10] || surface.toothOX !== parameters[11] || surface.toothOY !== parameters[12]) {
       surface.toothSeed = parameters[10]; surface.toothOX = parameters[11]; surface.toothOY = parameters[12]; surface.toothTiles = null;
      }
      if (to > from) mix.call(surface, {x0:parameters[0], y0:parameters[1] + from, w, h:to - from,
       mask:mask.subarray(from * w, to * w), spans:parameters[14] ? spans.subarray(from * 2, to * 2) : null}, parameters[4], parameters[5], parameters[6], parameters[7]);
      results[slot * 2] = surface.toothTiles ? 1 : 0; results[slot * 2 + 1] = surface.volume ? 1 : 0;
      arrive();
     }
    } catch (error) {
     Atomics.store(control, FAILED, slot + 1); Atomics.store(control, COMPLETE, seen); Atomics.notify(control, COMPLETE);
     scope.postMessage({error: String(error.message || error)});
    }
   };
   scope.postMessage({ready:true});
  }
 };
}

export async function createPaintRowPool({count = 0, threshold = PAINT_SPLIT_PIXELS, spawn, isolated = false} = {}) {
 if (!count || !isolated || typeof SharedArrayBuffer !== 'function') return {attach() {}, detach() {}, async close() {}, stats:{split:0, serial:0}};
 if (![2,4,8].includes(count) || !Number.isSafeInteger(threshold) || threshold < 0 || typeof spawn !== 'function') throw new Error('Invalid paint row pool');
 const controlBuffer = new SharedArrayBuffer(80 * 4), parameterBuffer = new SharedArrayBuffer(16 * 8);
 const partitionBuffer = new SharedArrayBuffer((count + 1) * 4), resultBuffer = new SharedArrayBuffer(count * 2 * 4);
 const control = new Int32Array(controlBuffer), parameters = new Float64Array(parameterBuffer);
 const partitions = new Int32Array(partitionBuffer), results = new Int32Array(resultBuffer);
 const workers = [], states = new WeakMap(), attached = new Set(), stats = {split:0, serial:0};
 let active = null, sequence = 0, retired = false;
 const starts = await Promise.allSettled(Array.from({length:count}, async (_,slot) => {
  const worker = await spawn({slot, count, controlBuffer, parameterBuffer, partitionBuffer, resultBuffer});
  workers.push(worker);
 }));
 const failedStart = starts.find(result => result.status === 'rejected');
 if (failedStart) { await Promise.allSettled(workers.map(w => w.terminate())); throw failedStart.reason; }
 function wait() {
  const deadline = performance.now() + 30000;
  while (Atomics.load(control, COMPLETE) !== sequence) {
   const before = Atomics.load(control, COMPLETE), remaining = deadline - performance.now();
   if (before === sequence) break;
   if (remaining <= 0 || Atomics.wait(control, COMPLETE, before, remaining) === 'timed-out') throw new Error('Paint row barrier timed out; surface retained, not replayed');
  }
  if (Atomics.load(control, FAILED)) throw new Error('Paint row worker failed; surface retained, not replayed');
 }
 function bind(surface) {
  let state = states.get(surface);
  if (state && state.data === surface.data && state.width === surface.width && state.height === surface.height && active === state) return state;
  if (active) { Atomics.store(control, MODE, 2); Atomics.store(control, EPOCH, ++sequence); Atomics.notify(control, EPOCH); active = null; }
  if (!state || state.data !== surface.data || state.width !== surface.width || state.height !== surface.height) {
   const n = surface.width * surface.height;
   const data = new Float32Array(new SharedArrayBuffer(n * 16)); data.set(surface.data);
   const volume = new Uint8Array(new SharedArrayBuffer(n)); if (surface.volume) volume.set(surface.volume);
   state = {data, volume, mask:new Float32Array(new SharedArrayBuffer(n * 4)), spans:new Int32Array(new SharedArrayBuffer(surface.height * 8)), width:surface.width, height:surface.height};
   // A rollback referencing this very allocation must follow the storage move, not become a
   // stale copy. The checkpoint's saved tiles still undo every subsequent disjoint-row write.
   if (surface.strokeCheckpoint?.data === surface.data) {
    surface.strokeCheckpoint.data = data;
    if (surface.strokeCheckpoint.volume === surface.volume && surface.volume) surface.strokeCheckpoint.volume = volume;
   }
   surface.data = data; if (surface.volume) surface.volume = volume;
   states.set(surface, state);
  }
  parameters[10] = surface.toothSeed; parameters[11] = surface.toothOX; parameters[12] = surface.toothOY;
  Atomics.store(control, REMAINING, count); Atomics.store(control, EPOCH, ++sequence);
  for (const w of workers) w.postMessage({width:state.width,height:state.height,dataBuffer:state.data.buffer,volumeBuffer:state.volume.buffer,maskBuffer:state.mask.buffer,spanBuffer:state.spans.buffer});
  wait(); active = state; return state;
 }
 function blend(box, r, g, b, opacity) {
  if (retired) throw new Error('Paint row pool is retired');
  // No mask census, SAB allocation, binding or barrier for Oil's small dabs.
  // An oil hair's dab lays its own height plane and meets the canvas weave, which the helpers do not hold: it always runs here.
  if (box.w * box.h <= threshold || box.h < count || this.oilTop > 0) { stats.serial++; return mix.call(this, box, r, g, b, opacity); }
  const state = bind(this), {w,h,mask,spans} = box;
  state.mask.set(mask.subarray(0,w*h)); if (spans) state.spans.set(spans.subarray(0,h*2));
  if (this.volume && this.volume !== state.volume) { state.volume.set(this.volume); this.volume = state.volume; }
  // A cancelled stroke may return the owner to no relief without replacing its pigment
  // allocation. The next first body dab must see a fresh zeroed height field, not cancelled ink.
  if (!this.volume && this.body > 0) state.volume.fill(0);
  parameters.set([box.x0,box.y0,w,h,r,g,b,opacity,this.body,this.bite,this.toothSeed,this.toothOX,this.toothOY,this.volume ? 1 : 0,spans ? 1 : 0]);
  // Spans provide a cheap balanced partition without revisiting every mask pixel.
  let total = 0; for (let y=0;y<h;y++) total += spans ? spans[y*2+1]-spans[y*2] : w;
  partitions[0]=0; partitions[count]=h;
  let next=1, sum=0;
  for (let y=0;y<h && next<count;y++) { sum += spans ? spans[y*2+1]-spans[y*2] : w; while(next<count && sum>=total*next/count) partitions[next++]=y+1; }
  while(next<count) partitions[next++]=h;
  Atomics.store(control, REMAINING,count); Atomics.store(control,MODE,1); Atomics.store(control,EPOCH,++sequence); Atomics.notify(control,EPOCH);
  wait(); stats.split++;
  for(let slot=0;slot<count;slot++) {
   if(results[slot*2+1]) this.volume=state.volume;
   if(results[slot*2] && !this.toothTiles) this._toothTileFor(box.x0,box.y0);
  }
 }
 return {stats, attach(surface) { if (!attached.has(surface)) { surface._blendNormalPaint=blend; attached.add(surface); } },
  detach(surface) {
   if (!attached.delete(surface)) return;
   if (active === states.get(surface)) { Atomics.store(control,MODE,2); Atomics.store(control,EPOCH,++sequence); Atomics.notify(control,EPOCH); active=null; }
   delete surface._blendNormalPaint; states.delete(surface);
  },
  async close() { retired=true; if(active) { Atomics.store(control,MODE,2); Atomics.store(control,EPOCH,++sequence); Atomics.notify(control,EPOCH); }
   for(const surface of attached) delete surface._blendNormalPaint; attached.clear(); await Promise.allSettled(workers.map(w=>w.terminate())); }
 };
}
