// SPDX-License-Identifier: MIT
import {suppliedWasm} from './wasm-modules.mjs';
import {startWorker} from './v7/worker-start.mjs';
import {ARENA_BYTES} from './arena.mjs';

export const canShare = () => typeof SharedArrayBuffer === 'function' && globalThis.crossOriginIsolated !== false;
export const mark = (...entry) => { globalThis.__helperMarks?.push(entry); };
const METER_IDLE_MS = 10000;

export function coreWorkerPool(spawn, count, setup) {
  const members = [], queue = [], pending = new Map(), retiring = new Set();
  let meterIdle = null;
  const gated = spawn.module !== undefined, usable = member => !gated || member.loaded;
  let retireFailure = null, serial = 0, memberSerial = 0, closed = false, hooks = null;
  const end = worker => {
    mark('end');
    let result;
    try { result = worker.terminate(); } catch (error) { result = Promise.reject(error); }
    const retired = new Promise(resolve => resolve(result)).then(() => { retiring.delete(retired); pump(); }, error => {
      retiring.delete(retired);
      retireFailure ??= error instanceof Error ? error : new Error('worker terminate failed', {cause: error});
      api.failure ??= retireFailure;
      stop();
    });
    retiring.add(retired);
  };
  const finish = (job, value) => {
    if (job.ending) return;
    job.ending = true;
    const settle = error => { pending.delete(job.id); if (error) job.reject(error); else job.resolve(value); };
    if (value === undefined && job.reject) Promise.resolve().then(() => api.retired()).then(() => settle(), settle);
    else settle();
  };
  const listen = (worker, receive, fail) => { worker.onmessage = event => receive(event.data); worker.onerror = event => { event?.preventDefault?.(); fail(); }; };
  const drop = member => {
    if (member.dead) return;
    member.dead = true;
    member.settle(false);
    member.dropAck?.();
    members.splice(members.indexOf(member), 1);
    end(member.worker);
    if (member.busy) { finish(member.busy, undefined); member.busy = null; }
  };
  const stop = () => {
    closed = true;
    for (const job of queue.splice(0)) finish(job, undefined);
    for (const member of members.splice(0)) { member.dead = true; member.settle(false); end(member.worker); if (member.busy?.lease) member.busy.resolve(); }
    for (const job of [...pending.values()]) finish(job, undefined);
  };
  const configure = member => {
    mark('kernels', true);
    try { member.worker.postMessage({pool: 'parallel', kernels: true, wasmModules: spawn.wasm ? spawn.wasm() : suppliedWasm()}); }
    catch { drop(member); }
  };
  const start = () => {
    let settle;
    const member = {worker: spawn(), id: ++memberSerial, busy: null, sent: new Set(), dead: false, loaded: false, ready: new Promise(resolve => { settle = resolve; })};
    member.settle = settle;
    mark('spawn');
    members.push(member);
    try {
      listen(member.worker, reply => {
        if (reply.ready && gated && (reply.module !== spawn.module || spawn.protocol !== undefined && reply.protocol !== spawn.protocol)) {
          mark('refused', reply.module);
          api.broken = true; settle(false); drop(member); count = members.length; pump(); return;
        }
        if (gated && !member.loaded && !reply.ready) return;
        if (reply.ready) { if (gated && !member.loaded) configure(member); member.loaded = true; mark('ready', reply.module); settle(true); if (gated) pump(); return; }
        if (reply.dropped) { member.dropAck?.(); return; }
        member.loaded = true; member.answered = true;
        if (member.busy?.lease) { member.busy.answer(reply); return; }
        const job = member.busy;
        if (!job || reply.id !== job.id) return;
        if (reply.progress !== undefined) { job.onProgress?.(reply.progress); return; }
        if (hooks && hooks[1](member, job, reply)) return;
        if (reply.error && !job.whole) { drop(member); pump(); return; }
        if (hooks && !hooks[2](member, job, reply)) return;
        member.busy = null;
        if (job) finish(job, job.whole ? reply : reply.error ? undefined : reply.result);
        pump();
      }, () => {
        if (!member.loaded || gated && !member.answered) api.broken = true;
        settle(false);
        drop(member);
        if (api.broken) count = members.length;
        pump();
      });
      if (!gated) configure(member);
    } catch (error) { drop(member); throw error; }
    return member;
  };
  const tryStart = () => {
    try { return start(); }
    catch (error) {
      count = members.length;
      if (error?.code === 'JXL_WORKER_LEASE') { api.failure = error; stop(); }
      return null;
    }
  };
  function pump() {
    while (queue.length && !closed && members.filter(m => m.busy).length < api.limit) {
      let member = members.find(m => !m.busy && usable(m));
      if (!member && gated) {
        while (members.filter(m => !m.loaded).length < queue.length && members.length + retiring.size < count && tryStart());
        break;
      }
      if (!member && members.length + retiring.size < count) member = tryStart();
      if (!member) break;
      const job = queue.shift();
      member.busy = job;
      api.used = true;
      try {
        if (hooks) hooks[0](member, job);
        else member.worker.postMessage({pool: 'parallel', id: job.id, task: job.task});
        mark('task', job.task.kind, member.id, job.task.y1 - job.task.y0 || 0);
      } catch { drop(member); }
    }
    if (!members.length && !retiring.size) for (const job of [...queue.splice(0), ...pending.values()]) finish(job, undefined);
  }
  const api = {
    count, limit: count, failure: null, broken: false, used: false,
    get waiting() { return pending.size; },
    whole(task, onProgress) {
      if (closed) return Promise.resolve(undefined);
      let job;
      const promise = new Promise(resolve => {
        job = {id: ++serial, task, inputs: [], resolve, onProgress, whole: true};
        pending.set(job.id, job); queue.push(job); pump();
      });
      promise.cancel = () => {
        const at = queue.indexOf(job), member = members.find(m => m.busy === job);
        if (at !== -1) { queue.splice(at, 1); finish(job, undefined); }
        else if (member) { drop(member); pump(); }
      };
      return promise;
    },
    lease() {
      if (closed) return [];
      return members.filter(m => !m.busy && usable(m)).map(member => {
        api.used = true;
        mark('lease');
        const waiting = new Map(), stopped = {error: {name: 'Error', message: 'helper stopped'}};
        const lease = member.busy = {id: ++serial, lease: true, ended: false, waiting,
          answer: reply => {
            waiting.get(reply.ticket)?.(reply); waiting.delete(reply.ticket);
            if (lease.ended && !waiting.size && member.busy === lease) { member.busy = null; pump(); }
          },
          resolve: () => { for (const resolve of waiting.values()) resolve(stopped); waiting.clear(); }};
        const send = (message, transfer = []) => new Promise(resolve => {
          if (member.dead) { resolve(stopped); return; }
          waiting.set(message.ticket, resolve);
          if (message.task?.kind === 'm') member.meter = true;
          try { member.worker.postMessage(message, transfer); } catch { waiting.delete(message.ticket); resolve(stopped); }
        });
        return {member, send};
      });
    },
    unlease(leased) {
      for (const {member} of leased) {
        const lease = member.busy;
        if (!lease?.lease) continue;
        lease.ended = true;
        if (!lease.waiting.size) member.busy = null;
      }
      pump();
    },
    warm() { while (!closed && members.length + retiring.size < (api.bandBytes === undefined ? count : api.limit) && tryStart()); },
    loaded() { return Promise.all(members.map(member => member.ready)).then(states => states.every(Boolean)); },
    async retired() {
      while (retiring.size) await Promise.all([...retiring]);
      if (retireFailure) throw retireFailure;
    },
    hold(on) {
      if (on && meterIdle) { clearTimeout(meterIdle); meterIdle = null; }
      for (const member of members) member.worker.hold?.(on);
    },
    idle() {
      if (closed || this.jobs || this.busy || this.starting) return;
      this.hold(false);
      if (!meterIdle && members.some(m => m.meter)) {
        meterIdle = setTimeout(() => {
          meterIdle = null;
          if (closed || this.jobs || this.busy || this.starting) return;
          for (const member of members.filter(m => m.meter && !m.busy)) { mark('meter-retire'); drop(member); }
        }, METER_IDLE_MS);
        meterIdle.unref?.();
      }
    },
    get closed() { return closed; },
    close() { stop(); return api.retired(); },
  };
  if (setup) hooks = setup(api, members, queue, pending, drop, end, finish, pump, () => ++serial, () => closed);
  return api;
}

export const helperPools = /* @__PURE__ */ new WeakMap();
export const closedOwners = /* @__PURE__ */ new WeakSet();
const dropped = typeof FinalizationRegistry === 'function' ? /* @__PURE__ */ new FinalizationRegistry(pool => pool.close().catch(() => {})) : null;
const residentHelpers = reservation => Math.min(reservation.count, Math.floor(reservation.memoryBytes / (44 * 1048576)));

export async function ownerPool(owner, reservation, spawn, makePool = coreWorkerPool) {
  for (;;) {
    if (closedOwners.has(owner)) throw Object.assign(new Error('closed'), {code: 'JXL_CLOSED'});
    let pool = helperPools.get(owner);
    if (pool?.failure) throw pool.failure;
    if (pool && !pool.closed) return pool;
    if (pool) {
      await pool.retired();
      if (closedOwners.has(owner) || helperPools.get(owner) !== pool) continue;
    }
    helperPools.set(owner, pool = makePool(spawn, residentHelpers(reservation)));
    dropped?.register(owner, pool);
    return pool;
  }
}

async function ordinaryPool(pool) {
  if (pool.bandBytes !== undefined && !pool.busy && !pool.jobs) {
    await pool.trim(0);
    pool.bandBytes = undefined;
    pool.bandGeometry = undefined;
    pool.used = false;
  }
  return pool;
}

export function closeHelpers(owner, final = false) {
  if (final) closedOwners.add(owner);
  const pool = helperPools.get(owner);
  return pool ? pool.close() : Promise.resolve();
}

const lost = async pool => { await pool.retired(); return Object.assign(new Error('helper stopped'), {code: 'JXL_WORKER', lost: true}); };
const untilAborted = (promise, signal) => new Promise(resolve => {
  const done = () => { signal?.removeEventListener('abort', done); resolve(); };
  if (signal?.aborted) { resolve(); return; }
  signal?.addEventListener('abort', done, {once: true});
  promise.then(done, done);
});
const splitFallback = async (pool, signal) => {
  const retired = pool.retired();
  await untilAborted(retired, signal);
  if (signal?.aborted) throw signal.reason;
  await retired;
};

export function idle(pool) { pool.idle(); }

export const HELPER_RUNTIME = 20 * 1048576;
export const helperBytes = pixels => HELPER_RUNTIME + 24 * 1048576 + 4 * pixels + (canShare() ? 0 : 26 * pixels);
export const nodeBuiltin = name => { try { return globalThis.process?.getBuiltinModule?.(name); } catch { return undefined; } };

export async function spawnHelper(helper) {
  if (!helper) throw Object.assign(new Error('helper-pool:file'), {code: 'JXL_INTERNAL'});
  const named = spawn => Object.assign(spawn, {module: helper.module, protocol: helper.protocol, wasm: helper.wasm});
  if (typeof Worker === 'function') return named(() => startWorker(helper));
  const threads = nodeBuiltin('node:worker_threads');
  if (!threads) throw Object.assign(new Error('no worker support'), {code: 'JXL_WORKER', lost: true});
  const {Worker: NodeWorker} = threads;
  const flags = globalThis.process.execArgv, execArgv = flags.some(flag => flag.startsWith('--input-type')) ? flags.filter(flag => !flag.startsWith('--input-type')) : undefined;
  return named(() => {
    const worker = new NodeWorker(helper.url(), {execArgv, workerData: helper.role}), host = {
      postMessage: (message, transfer) => worker.postMessage(message, transfer),
      terminate: () => worker.terminate(),
      hold: on => on ? worker.ref() : worker.unref(),
      set onmessage(f) { worker.removeAllListeners('message'); if (f) worker.on('message', data => f({data})); },
      set onerror(f) { worker.removeAllListeners('error'); worker.removeAllListeners('exit'); if (f) { worker.on('error', f); worker.on('exit', () => f()); } },
    };
    return host;
  });
}

export async function helperJob(owner, reservation, task, {signal, onProgress, helper} = {}, makePool = coreWorkerPool) {
  const pool = await ordinaryPool(await ownerPool(owner, reservation, await spawnHelper(helper), makePool));
  if (signal?.aborted) throw signal.reason;
  if (pool.broken) throw await lost(pool);
  pool.hold(true); pool.limit = pool.count; pool.jobs = (pool.jobs ?? 0) + 1;
  const reply = pool.whole(task, onProgress), abort = () => reply.cancel();
  signal?.addEventListener('abort', abort, {once: true});
  try {
    const answer = await reply;
    if (signal?.aborted) { await pool.retired().catch(() => {}); throw signal.reason; }
    if (!answer) {
      if (pool.failure) { await pool.retired().catch(() => {}); throw pool.failure; }
      throw await lost(pool);
    }
    if (answer.error) throw Object.assign(new Error(answer.error.message), {name: answer.error.name, code: answer.error.code});
    return answer.result;
  } finally {
    signal?.removeEventListener('abort', abort);
    pool.jobs--; idle(pool);
  }
}

export async function splitOnIdle(owner, reservation, request, signal, helper, makePool = coreWorkerPool) {
  const spawn = await spawnHelper(helper);
  if (signal?.aborted) return undefined;
  const pool = await ordinaryPool(await ownerPool(owner, reservation, spawn, makePool));
  if (signal?.aborted) return undefined;
  pool.warm();
  let leased = pool.lease();
  if (!leased.length && !pool.closed) {
    pool.hold(true); pool.starting = (pool.starting ?? 0) + 1;
    try { await untilAborted(pool.loaded(), signal); }
    finally { pool.starting--; }
    leased = signal?.aborted ? [] : pool.lease();
  }
  if (!leased.length) { idle(pool); return signal?.aborted ? undefined : splitFallback(pool, signal); }
  pool.hold(true); pool.jobs = (pool.jobs ?? 0) + 1;
  try {
    const arena = request.pixels > 0 && reservation?.memoryBytes >= 16 * request.pixels + leased.length * (helperBytes(request.pixels) + ARENA_BYTES);
    if (request.pixels > 0) mark('split-arena', arena, leased.length * ARENA_BYTES, reservation?.memoryBytes);
    return await request.run(leased, {signal, arena});
  }
  catch { if (signal?.aborted) throw signal.reason; return await splitFallback(pool, signal); }
  finally { pool.unlease(leased); pool.jobs--; idle(pool); }
}

export async function warmHelpers(owner, reservation, helper, makePool = coreWorkerPool) {
  const pool = await ownerPool(owner, reservation, await spawnHelper(helper), makePool);
  pool.hold(true); pool.warm(); pool.starting = (pool.starting ?? 0) + 1;
  try { await pool.loaded(); } finally { pool.starting--; idle(pool); }
}
