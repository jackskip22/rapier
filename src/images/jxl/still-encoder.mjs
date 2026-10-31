// SPDX-License-Identifier: MIT
import {ensureKernels} from './kernels.mjs';
import {admitStill} from './still-admit.mjs';
import {effortJob} from './effort-job.mjs';
import {fault} from './fault.mjs';
import {guard} from './admit.mjs';
import {jpegReconstruction} from './container.mjs';
import {encodePhotoJobSteps, encodePhotoGpuSteps} from './photo.mjs';
import {gpuJob} from './gpu-drive.mjs';
import {gpuOffered} from './gpu-gate.mjs';
import {inspectPixels} from './lossless.mjs';
import {finishEncoding, checkSignal} from './async-job.mjs';
import {serialJob} from './job-drive.mjs';
import {serveAcGroup} from './ac-group.mjs';
import {runJob} from './exact-region.mjs';
import {spawnJxlHelper} from './worker-assets.mjs';
import {workerLease} from './worker-reservation.mjs';
import {memoryPlan} from './memory-plan.mjs';
import {codecError} from './worker-input.mjs';
import {preferXYB} from './photo-xyb.mjs';
import {searchV6} from './photo-v6-search.mjs';
import {photoAnsSteps} from './photo-v6-blocks.mjs';
import {EXACT_LADDER} from './exact-ladder.mjs';
import {BALANCED_EFFORT, FAST_EFFORT} from './effort-level.mjs';

let gpuDevice;
async function gpu() {
  if (gpuDevice !== undefined) return gpuDevice;
  gpuDevice = null;
  try {
    for (let i = 0; i < 4 && globalThis.navigator?.gpu && !gpuDevice; i++) {
      const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
      if (adapter?.info.isFallbackAdapter) break;
      if (adapter) gpuDevice = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize}});
      else await new Promise(resolve => setTimeout(resolve, 250));
    }
    gpuDevice?.lost.then(() => { gpuDevice = undefined; });
  } catch { gpuDevice = null; }
  return gpuDevice;
}


function gpuForSignal(signal) {
  checkSignal(signal);
  if (!signal) return gpu();
  return new Promise((resolve, reject) => {
    let pending = true;
    const abort = () => { pending = false; signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, {once: true});
    gpu().then(device => {
      signal.removeEventListener('abort', abort);
      if (pending) { pending = false; resolve(device); }
    }, error => {
      signal.removeEventListener('abort', abort);
      if (pending) { pending = false; reject(error); }
    });
  });
}

const BROTLI_DICTIONARY_BYTES = 122784;

export function stillEncoder({spawn, memory, parallel = true} = {}, drive) {
  if (spawn !== undefined && typeof spawn !== 'function') throw new TypeError('spawn must create a worker.');
  let reserved = memory === undefined ? undefined : memorySnapshot(memory), pinned = memory !== undefined, busy = false;
  let poisoned = false, cleanupFailure, suppliedWords = null;
  if (typeof parallel !== 'boolean') throw new TypeError('parallel must be a boolean.');
  const available = !!drive && parallel && (!!spawn || typeof Worker === 'function');
  const driven = drive?.job ?? serialJob;
  const spawnWorker = spawn || spawnJxlHelper;
  ensureKernels();
  return {
    async encode(data, width, height, options) {
      const admitted = admitStill(options, {data, width, height});
      data = admitted.data; width = admitted.width; height = admitted.height; options = admitted.options;
      checkSignal(options.signal);
      if (poisoned) throw cleanupFailure;
      if (busy) throw codecError('JXL_BUSY', 'The image worker is busy.');
      const requested = options.memory === undefined ? reserved ?? {} : memorySnapshot(options.memory);
      if (pinned && !sameMemory(reserved, requested)) throw codecError('JXL_OPTIONS', 'The encoder memory reservation changed.');
      const memoryOptions = Object.freeze({...requested, width, height, inputBytes: data.buffer.byteLength, exact: false});
      const memory = memoryPlan(width * height, memoryOptions);
      if (memory.known && !memory.fits) throw codecError('JXL_MEMORY', 'The image exceeds its memory reservation.');
      if (!pinned) { reserved = Object.freeze(requested); pinned = true; }
      options = {...options, memory: memoryOptions};
      const lease = workerLease(available && options.parallel !== false && memory.known && memory.fits ? memory.workerReservation : undefined, spawnWorker);
      busy = true;
      let failed = false;
      const helpers = {workers: options.parallel !== false ? lease.reservation.count : 0, spawn: lease.spawn, signal: options.signal};
      try {
        const {quality, photo} = options;
        if (options.losslessProfile === undefined && photo && quality < 100 && (data instanceof Uint8Array || data instanceof Uint8ClampedArray) && !inspectPixels(data, width, height).palette) {
          const effort = options.effort ?? FAST_EFFORT;
          if (options.gpu !== false && (options.gpu || gpuOffered(width, height, effort))) {
            if (memory.known) throw codecError('JXL_MEMORY_GPU_UNPROVEN', 'GPU allocation has no complete memory reservation.');
            const device = options.gpu && typeof options.gpu === 'object' ? options.gpu : await gpuForSignal(options.signal);
            checkSignal(options.signal);
            if (device) return await finishEncoding(gpuJob(encodePhotoGpuSteps(data, width, height, options), device), options);
          }
          return await finishEncoding(driven(encodePhotoJobSteps(data, width, height, options), helpers), options);
        }
        return await finishEncoding(driven(effortJob(data, width, height, options, false, undefined, searchV6, photoAnsSteps, EXACT_LADDER), helpers), options);
      } catch (error) { failed = true; throw error; }
      finally {
        try { await lease.close(); }
        catch (error) {
          poisoned = true; cleanupFailure = error;
          if (!failed) { checkSignal(options.signal); throw error; }
        } finally { busy = false; }
        if (!failed) checkSignal(options.signal);
      }
    },
    async transcode(jpeg, options = {}) {
      checkSignal(options.signal);
      return (await import('./still-jpeg.mjs')).transcodeJPEG(jpeg, {...options, effort: options.effort ?? BALANCED_EFFORT});
    },
    async reconstruct(bytes, {signal, dictionary} = {}) {
      if (dictionary !== undefined) {
        if (!(dictionary instanceof Uint8Array) || dictionary.length !== BROTLI_DICTIONARY_BYTES) throw fault('JXL_OPTIONS', 'The Brotli dictionary is RFC 7932\'s 122,784 bytes.');
        suppliedWords ??= dictionary;
      }
      checkSignal(signal);
      if (!guard(() => jpegReconstruction(bytes))) return null;
      const {restoreJPEGFile} = await import('./still-jpeg.mjs');
      checkSignal(signal);
      try { return restoreJPEGFile(bytes); }
      catch (error) {
        if (error?.code !== 'JXL_DICTIONARY') throw error;
        let words = suppliedWords;
        if (!words) {
          try { words = (await import('./brotli-dictionary.mjs')).brotliDictionary(); }
          catch {
            checkSignal(signal);
            throw Object.assign(fault('JXL_RECONSTRUCTION', 'This file\'s JPEG data needs the Brotli dictionary (brotli-dictionary.mjs beside the worker), which could not be loaded.'), {dictionary: true});
          }
        }
        checkSignal(signal);
        return restoreJPEGFile(bytes, words);
      }
    },
    serve(message) {
      if (message.pool === 'exact') return serveExact(message);
      if (message.pool === 'ac-model' || message.pool === 'ac-group') return serveAcGroup(message);
      if (message.pool === 'parallel' && drive) return drive.serve(message);
      throw Object.assign(new Error('Unknown image worker message.'), {code: 'JXL_INPUT', pool: message?.pool});
    },
  };
}

function serveExact(message) {
  try { return [{pool: 'exact', id: message.id, result: runJob(message)}, []]; }
  catch (error) {
    return [{pool: 'exact', id: message.id, error: {name: String(error?.name ?? 'Error'),
      message: String(error?.message ?? error), ...(error?.code === undefined ? {} : {code: error.code})}}, []];
  }
}

function memorySnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('memory must describe a reservation.');
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.some(([, item]) => typeof item !== 'number' && typeof item !== 'boolean'))
    throw new TypeError('Memory reservation fields must be numbers or booleans.');
  return Object.freeze(Object.fromEntries(entries));
}
function sameMemory(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && Object.is(a[key], b[key]));
}
