// SPDX-License-Identifier: MIT
export const roleName = (module, role) => module + ' ' + role;

function workerRole() {
  if (typeof WorkerGlobalScope === 'function' && globalThis instanceof WorkerGlobalScope) return typeof globalThis.name === 'string' ? globalThis.name : '';
  let threads;
  try { threads = globalThis.process?.getBuiltinModule?.('node:worker_threads'); } catch {}
  if (!threads || threads.isMainThread) return '';
  return typeof threads.workerData === 'string' ? threads.workerData : typeof threads.threadName === 'string' ? threads.threadName : '';
}

const classic = () => { try { globalThis.importScripts('about:blank'); return true; } catch (error) { return !(error instanceof TypeError); } };

const here = () => globalThis.location && globalThis.location.protocol !== 'blob:' ? globalThis.location.href : import.meta.url;
const served = url => () => {
  const found = url();
  return found.protocol === 'file:' && globalThis.location && !['file:', 'blob:'].includes(globalThis.location.protocol) ? new URL(globalThis.location.href) : found;
};
export const ownFile = (role, given = () => new URL(here())) => {
  const url = served(given);
  return Object.freeze({role, url, worker: () => new Worker(url(), {type: classic() ? 'classic' : 'module', name: role})});
};

export function serveRole(module, roles) {
  const role = workerRole();
  if (!role.startsWith(module + ' ')) return;
  const serve = roles[role.slice(module.length + 1)];
  if (serve) serve();
}
