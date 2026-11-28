// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {scoreBandFits} from './band-geometry.mjs';
import {canShare, coreWorkerPool, helperPools, ownerPool, closeHelpers, idle, HELPER_RUNTIME, helperBytes, nodeBuiltin, spawnHelper, helperJob as baseHelperJob, splitOnIdle as baseSplitOnIdle, warmHelpers as baseWarmHelpers} from './helper-pool-base.mjs';

export {canShare, closeHelpers, idle, nodeBuiltin, spawnHelper};

export function portable(value, copies) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  if (copies.has(value)) return copies.get(value);
  let out;
  if (ArrayBuffer.isView(value)) {
    if (!canShare() || value.buffer instanceof SharedArrayBuffer) out = value;
    else {
      const shared = new SharedArrayBuffer(value.byteLength);
      new Uint8Array(shared).set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      const node = globalThis.Buffer;
      out = typeof node === 'function' && node.isBuffer(value) ? node.from(shared) : new value.constructor(shared);
    }
  } else if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
    out = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) { const p = portable(v, copies); if (p === undefined && v !== undefined) return undefined; out[k] = p; }
  } else return undefined;
  copies.set(value, out);
  return out;
}

export function workerPool(spawn, count) {
  const inputIds = new Map();
  let copies = new WeakMap();
  const inputId = value => {
    let id = inputIds.get(value);
    if (id === undefined) {
      const shared = portable(value, copies);
      if (shared === undefined) return undefined;
      inputIds.set(value, id = {n: inputIds.size, shared});
    }
    return id;
  };
  return coreWorkerPool(spawn, count, (api, members, queue, pending, drop, end, finish, pump, nextId, isClosed) => {
    api.run = (task, big, transfer = [], validate = null, onGpu = null) => {
      if (isClosed()) return api.retired().then(() => undefined);
      const ins = [], message = {...task};
      for (const field of big) {
        if (task[field] == null) continue;
        const id = inputId(task[field]);
        if (!id) return Promise.resolve(undefined);
        ins.push(id); message[field] = id.n;
      }
      let job;
      const promise = new Promise((resolve, reject) => {
        job = {id: nextId(), task: message, inputs: ins, transfer, validate, onGpu, resolve, reject};
        pending.set(job.id, job); queue.push(job); pump();
      });
      promise.job = job;
      return promise;
    };
    api.trim = n => { for (const member of members.filter(m => !m.busy).slice(0, Math.max(0, members.length - n))) drop(member); return api.retired(); };
    api.promote = function promote(promise) {
      for (const dep of promise.deps ?? []) this.promote(dep);
      const at = queue.indexOf(promise.job);
      if (at > 0) queue.unshift(...queue.splice(at, 1));
    };
    api.release = (stop = false) => {
      for (const job of queue.splice(0)) finish(job, undefined);
      if (stop) for (const member of members.filter(m => m.busy)) {
        member.dead = true; members.splice(members.indexOf(member), 1);
        end(member.worker);
        finish(member.busy, undefined); member.busy = null;
      }
      api.dropped = Promise.all(members.map(member => new Promise(resolve => {
        member.dropAck = () => { member.dropAck = null; resolve(); };
        try { member.worker.postMessage({pool: 'parallel', drop: null}); } catch { member.dropAck(); }
      })));
      for (const member of members) for (const n of member.sent) try { member.worker.postMessage({pool: 'parallel', drop: n}); } catch {}
      for (const member of members) member.sent.clear();
      inputIds.clear(); copies = new WeakMap();
    };
    return [
      (member, job) => {
        for (const input of job.inputs) if (!member.sent.has(input.n)) { member.worker.postMessage({pool: 'parallel', input: input.n, value: input.shared}); member.sent.add(input.n); }
        member.worker.postMessage({pool: 'parallel', id: job.id, task: job.task}, job.transfer);
      },
      (member, job, reply) => {
        if (reply.gpu === undefined) return false;
        const asked = job.onGpu ? Promise.resolve().then(() => job.onGpu(reply.gpu)).catch(() => null) : Promise.resolve(null);
        asked.then(answer => {
          if (member.dead) return;
          try { member.worker.postMessage({id: job.id, ask: reply.ask, gpuAnswer: answer ?? null}); }
          catch { if (member.busy === job) { drop(member); pump(); } }
        });
        return true;
      },
      (member, job, reply) => {
        if (!job.validate) return true;
        let valid = false;
        try { valid = job.validate(reply.result); } catch {}
        if (!valid) { drop(member); pump(); return false; }
        return true;
      },
    ];
  });
}

export const helperJob = (owner, reservation, task, opts) => baseHelperJob(owner, reservation, task, opts, workerPool);
export const splitOnIdle = (owner, reservation, request, signal, helper) => baseSplitOnIdle(owner, reservation, request, signal, helper, workerPool);
export const warmHelpers = (owner, reservation, helper) => baseWarmHelpers(owner, reservation, helper, workerPool);

export async function retireBandHelpers(owner, geometry) {
  const pool = helperPools.get(owner);
  if (pool?.failure) throw pool.failure;
  if (pool?.bandBytes === undefined || geometry !== undefined && scoreBandFits(pool.bandGeometry, geometry)) return;
  if (pool.busy || pool.jobs) throw fault('JXL_INTERNAL', 'helper-pool:busy');
  await pool.trim(0);
  pool.bandBytes = undefined;
  pool.bandGeometry = undefined;
  pool.used = false;
}
export async function helperPool(owner, reservation, pixels, helper, jobBytes, geometry, floor) {
  if (jobBytes !== undefined && (typeof geometry !== 'string' || !geometry)) throw fault('JXL_INTERNAL', 'helper-pool:geometry');
  let limit = reservedHelpers(reservation, pixels, jobBytes, floor);
  const spawn = await spawnHelper(helper);
  let pool = await ownerPool(owner, reservation, spawn, workerPool);
  if (pool.busy || pool.jobs) return Object.assign(workerPool(spawn, limit), {limit, once: true, bandBytes: jobBytes, bandGeometry: geometry});
  const fits = jobBytes !== undefined && pool.bandGeometry !== undefined && scoreBandFits(pool.bandGeometry, geometry);
  const changed = (pool.bandBytes === undefined) !== (jobBytes === undefined) || jobBytes !== undefined && !fits;
  if (changed) {
    if (pool.used) { await pool.trim(0); pool.used = false; }
    pool.bandBytes = undefined;
  }
  if (jobBytes !== undefined) {
    jobBytes = Math.max(jobBytes, pool.bandBytes ?? 0);
    limit = reservedHelpers(reservation, pixels, jobBytes, floor);
  }
  pool.bandBytes = jobBytes;
  if (!fits) pool.bandGeometry = geometry;
  pool.hold(true);
  pool.limit = limit;
  await pool.trim(limit);
  return pool;
}

const HELPER_HEAP = 112 * 1048576;
const helpersWithin = (budget, pixels) => Math.floor((budget - 16 * pixels) / helperBytes(pixels));
const HELPER_PIXELS = 524288;
export const reservedHelpers = (reservation, pixels, jobBytes, floor = HELPER_PIXELS) => reservation && pixels >= floor ? Math.max(0, Math.min(reservation.count,
  jobBytes === undefined ? helpersWithin(reservation.memoryBytes, pixels) : Math.floor(reservation.memoryBytes / (HELPER_RUNTIME + HELPER_HEAP + jobBytes)))) : 0;

export async function memoryWorkers(pixels) {
  let budget;
  try { budget = globalThis.navigator?.deviceMemory ? navigator.deviceMemory * 268435456 : nodeBuiltin('node:os').freemem() / 2; } catch { return Infinity; }
  return Math.max(1, helpersWithin(budget, pixels));
}

export const defaultWorkers = async () => {
  if (globalThis.navigator?.hardwareConcurrency) return navigator.hardwareConcurrency;
  try { return nodeBuiltin('node:os').availableParallelism(); } catch { return 1; }
};
