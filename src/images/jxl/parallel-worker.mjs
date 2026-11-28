import {configureModules} from './wasm-modules.mjs';
// SPDX-License-Identifier: MIT
const port = typeof WorkerGlobalScope === 'function' ? self : globalThis.process.getBuiltinModule('node:worker_threads').parentPort;
const fatal = error => setTimeout(() => { throw error; });
const described = error => ({name: String(error?.name ?? 'Error'), ...(typeof error?.code === 'string' ? {code: error.code} : {}), message: String(error?.message ?? error)});
const post = (reply, transfer, answer) => {
  try { port.postMessage(reply, transfer); }
  catch (error) { port.postMessage(answer(error)); }
};
const kernels = import('./kernels.mjs').then(module => { module.disableEntropyKernels(); return module; }), split = import('./photo-split.mjs');
const runtime = import('./v7/module-runtime.mjs'), admission = import('./v7/primitives.mjs'), device = import('./v7/webgpu.mjs');
const loaded = Promise.all([kernels, split, runtime, admission, device]);
loaded.then(() => port.postMessage({ready: true}), fatal);
const ok = loaded.then(() => true, () => false);
let serving;
let order = Promise.resolve();
const next = step => { order = order.then(async () => { if (await ok) await step(); }).catch(fatal); };
const operations = {
  encode: {name: 'rapier-jxl', load: () => import('./v7/still.mjs'), gpu: true},
  animate: {name: 'rapier-jxl/animation', operation: 'encode', load: () => import('./v7/animation.mjs'), gpu: true},
  capture: {name: 'rapier-jxl/capture', load: () => import('./v7/capture-module.mjs')},
  recompress: {name: 'rapier-jxl/jpeg', load: () => import('./v7/jpeg.mjs')},
  restore: {name: 'rapier-jxl/jpeg', load: () => import('./v7/jpeg.mjs')},
  decode: {name: 'rapier-jxl/decode', load: () => import('./v7/decode.mjs'), samples: true},
  format: {name: 'rapier-jxl/format', load: () => import('./v7/format.mjs'), gpu: true},
};
const runners = new Map();
async function run(task, hooks) {
  const operation = task.operation === 'encode' && Array.isArray(task.input?.frames) ? 'animate' : task.operation;
  const route = Object.hasOwn(operations, operation) && operations[operation];
  if (!route) throw (await admission).fail('JXL_OPERATION', 'operation: public function required');
  if (!runners.has(operation)) {
    const loading = Promise.all([route.load(), runtime, device]).then(([module, {moduleRuntime}, {requireWebGPU}]) =>
      moduleRuntime(module, {name: route.name, gpu: route.gpu ? requireWebGPU : false}));
    runners.set(operation, loading);
    loading.catch(() => runners.delete(operation));
  }
  const {webgpu, ...shared} = hooks;
  const result = await (await runners.get(operation)).run(route.operation ?? operation, task.input, task.options,
    route.gpu ? {...shared, webgpu} : shared);
  return route.samples ? result : result.bytes;
}
async function whole({id, task}) {
  const [{lendEntropy}, {holdEntropy, releaseEntropy}] = await Promise.all([kernels, import('./kernel-hooks.mjs')]);
  holdEntropy(lendEntropy);
  try {
    const result = await run(task, {maxPixels: task.maxPixels, webgpu: task.webgpu, onProgress: progress => port.postMessage({id, progress})});
    post({id, result}, ArrayBuffer.isView(result) ? [result.buffer] : [], error => ({id, error: described(error)}));
  } catch (error) { port.postMessage({id, error: described(error)}); }
  finally { releaseEntropy(); }
}
const serve = data => {
  if (data?.kernels !== undefined && data.input === undefined && data.task === undefined) { next(async () => { if (data.wasmModules) configureModules(data.wasmModules); (await kernels).ensureKernels(); }); return; }
  if (data?.task?.kind === 'whole') { order.then(async () => { if (await ok) await whole(data); }).catch(fatal); return; }
  if (data?.split !== undefined) {
    const answer = error => ({split: data.split, key: data.key, ticket: data.ticket, error: described(error)});
    next(async () => {
      let reply, transfer = [];
      try { [reply, transfer] = (await split).serveSplit(data); }
      catch (error) { reply = answer(error); }
      post(reply, transfer, answer);
    });
    return;
  }
  next(async () => {
    let module;
    try { module = await (serving ||= import('./parallel-serve.mjs')); }
    catch (error) { serving = null; throw error; }
    let reply;
    try { reply = module.serveParallel(data); }
    catch (error) { reply = [{id: data?.id, error: described(error)}, []]; }
    if (reply) post(reply[0], reply[1], error => ({id: data?.id, error: described(error)}));
  });
};
if (port.on) port.on('message', serve); else port.onmessage = event => serve(event.data);
