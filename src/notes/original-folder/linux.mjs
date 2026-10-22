import {nativeTree} from './native.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

export function failure(code) { return Object.assign(new Error(code), {code}); }
export function check(signal) { if (signal?.aborted) throw failure('cancelled'); }

export async function linuxTree(rootPath) {
  const broker = globalThis.process.env.RAPIER_FOLDER_BROKER ||
    fileURLToPath(new URL('../../linux/app/target/debug/examples/folder-broker', import.meta.url));
  const process = spawn(broker, [rootPath],
    {stdio: ['pipe', 'pipe', 'pipe']});
  let serial = 0, closed = false;
  const pending = new Map();
  process.stderr.resume();
  const exit = new Promise(resolve => process.once('close', resolve));
  function stop(code = 'revoked') {
    closed = true;
    for (const {reject} of pending.values()) reject(failure(code));
    pending.clear();
  }
  process.on('error', () => stop('broker_unavailable'));
  process.on('exit', () => stop(closed ? 'revoked' : 'broker_unavailable'));
  process.stdin.on('error', () => stop('broker_unavailable'));
  const lines = createInterface({input: process.stdout});
  lines.on('line', line => {
    try {
      const reply = JSON.parse(line), wait = pending.get(reply.id);
      if (!wait) return;
      pending.delete(reply.id);
      if (reply.error) wait.reject(failure(reply.error)); else wait.resolve(reply.value);
    } catch { stop('broker_protocol'); process.kill(); }
  });
  function call(method, args = {}) {
    if (closed) return Promise.reject(failure('revoked'));
    if (typeof args.path === 'string' && !args.path.isWellFormed()) return Promise.reject(failure('invalid_path'));
    const id = ++serial;
    const request = JSON.stringify({id, method, args}) + '\n';
    if (Buffer.byteLength(request, 'utf8') > 16384) return Promise.reject(failure('request_limit'));
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      process.stdin.write(request);
    });
  }
  let hello;
  try { hello = await call('hello'); }
  catch (error) { process.kill(); throw error; }
  return nativeTree(hello, call, async () => {
    if (!closed) { stop(); process.kill(); }
    await exit; lines.close();
  });
}
