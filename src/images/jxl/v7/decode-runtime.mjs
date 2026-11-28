// SPDX-License-Identifier: MIT
import {object, check, fail, pixelLimit, PIXELS, snapshotOptions, admitSignal} from './primitives.mjs';

export function simpleRuntime(module, name) {
  const checkOp = op => { if (!Object.hasOwn(module, op) || typeof module[op] !== 'function') throw fail('JXL_OPTIONS', `unknown operation: ${op}`); };
  return Object.freeze({
    module: name,
    async run(operation, input, options = {}, hooks = {}) {
      object(options); check(hooks.signal);
      checkOp(operation);
      const maxPixels = Math.min(options.maxPixels === undefined ? Infinity : pixelLimit(options.maxPixels), hooks.maxPixels ?? PIXELS);
      const {webgpu: _webgpu, ...rest} = options;
      const call = {...rest, maxPixels, signal: hooks.signal, onProgress: hooks.onProgress, ...(hooks.onFrame && {onFrame: hooks.onFrame})};
      return await module[operation](input, call);
    },
    async prepare(operation) {
      checkOp(operation);
      const takes = module.prepare?.operations;
      return module.prepare?.(takes ? (takes.includes(operation) ? operation : takes[0]) : undefined);
    },
    async release() {},
  });
}

const QUEUED = /* @__PURE__ */ new Set(['workerFactory', 'workerStartupTimeout', 'maxPendingBytes', 'maxPendingJobs']);
const queued = (key, value) => {
  if (key === 'workerFactory' ? typeof value !== 'function' : !(Number.isSafeInteger(value) && value > 0 && (key !== 'workerStartupTimeout' || value <= 2147483647)))
    throw fail('JXL_OPTIONS', `Invalid ${key}; ${key === 'workerFactory' ? 'pass a function' : 'use a positive whole number'}.`);
};

export function inPlaceSimple(name, raw) {
  let settings = null, running = 0, runtime = null, closing = null, maxJobs = Infinity, pending = 0;
  const live = () => runtime ??= simpleRuntime(raw, name);
  const shut = () => fail('JXL_CLOSED', 'closing');
  const configure = given => {
    const config = snapshotOptions(given, 'options');
    for (const key of Object.keys(config)) {
      if (QUEUED.has(key)) { if (config[key] !== undefined) queued(key, config[key]); continue; }
      if (key !== 'maxPixels') throw fail('JXL_OPTIONS', `unknown option: ${key} (allowed: maxPixels)`);
    }
    if (closing) throw fail('JXL_OPTIONS', 'closing: wait for close()');
    if (running || pending) throw fail('JXL_OPTIONS', 'configure: call active');
    const jobs = config.maxPendingJobs ?? Infinity;
    for (const key of QUEUED) delete config[key];
    pixelLimit(config.maxPixels);
    settings = Object.keys(config).length ? config : null;
    maxJobs = jobs;
  };
  const close = () => {
    if (closing) return closing;
    return closing = Promise.resolve().finally(() => { closing = null; });
  };
  const wrap = op => {
    const fn = raw[op];
    const run = function (input, options) {
      const config = settings ?? {};
      running++;
      return (async () => {
        try {
          options = snapshotOptions(options, 'Options', ['signal', 'onProgress', 'onEncoded']);
          admitSignal(options.signal); check(options.signal);
          const hooks = {signal: options.signal, onProgress: options.onProgress, onEncoded: options.onEncoded,
            maxPixels: config.maxPixels, owned: false};
          const result = await (op !== 'prepare' ? live().run(op, input, options, hooks) : fn.call(this, input));
          check(options.signal);
          return result;
        } finally { running--; }
      })();
    };
    const call = function (input, options) {
      if (closing) return Promise.reject(shut());
      if (maxJobs !== Infinity) {
        if (pending >= maxJobs) return Promise.reject(fail('JXL_MEMORY', 'Calls at maxPendingJobs; wait or raise it.'));
        pending++;
        let result;
        try { result = settings ? run.apply(this, arguments) : fn.apply(this, arguments); }
        catch (reason) { pending--; throw reason; }
        return Promise.resolve(result).finally(() => { pending--; });
      }
      if (!settings) return fn.apply(this, arguments);
      return run.apply(this, arguments);
    };
    return Object.defineProperties(call, Object.getOwnPropertyDescriptors(fn));
  };
  return {configure, close, wrap};
}
