// SPDX-License-Identifier: MIT
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const CLOCK_HELPER = String.raw`
import ctypes, json, sys, time
libc = ctypes.CDLL(None, use_errno=True)
libc.clock_getcpuclockid.argtypes = [ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
libc.clock_getcpuclockid.restype = ctypes.c_int
for line in sys.stdin:
    try:
        request = json.loads(line)
        clock = ctypes.c_int()
        status = libc.clock_getcpuclockid(request['pid'], ctypes.byref(clock))
        if status: raise OSError(status, 'clock_getcpuclockid failed')
        result = {'id': request['id'], 'nanoseconds': str(time.clock_gettime_ns(clock.value))}
    except Exception as error:
        result = {'id': request.get('id'), 'error': str(error)}
    print(json.dumps(result), flush=True)
`;

export function processCpuClock(python = 'python3') {
  if (process.platform !== 'linux') throw new Error('Workerd CPU measurement requires Linux process CPU clocks.');
  const child = spawn(python, ['-u', '-c', CLOCK_HELPER], {stdio: ['pipe', 'pipe', 'pipe']});
  let sequence = 0, failure, stderr = '';
  const waiting = new Map(), lines = createInterface({input: child.stdout});
  const rejectAll = error => {
    failure ??= error;
    for (const {reject} of waiting.values()) reject(error);
    waiting.clear();
  };
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4096); });
  child.on('error', rejectAll);
  child.on('exit', (code, signal) => {
    if (waiting.size) rejectAll(new Error(`CPU clock helper exited (${code ?? signal}): ${stderr}`));
  });
  lines.on('line', line => {
    let value;
    try { value = JSON.parse(line); } catch (cause) { rejectAll(new Error('Invalid CPU clock response.', {cause})); return; }
    const request = waiting.get(value.id);
    if (!request) return;
    waiting.delete(value.id);
    if (value.error) request.reject(new Error(value.error));
    else request.resolve(BigInt(value.nanoseconds));
  });
  return {
    async read(pid) {
      if (failure) throw failure;
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError('A live process PID is required.');
      return await new Promise((resolve, reject) => {
        const id = ++sequence;
        waiting.set(id, {resolve, reject});
        child.stdin.write(JSON.stringify({id, pid}) + '\n', error => {
          if (!error) return;
          waiting.delete(id); reject(error);
        });
      });
    },
    async close() {
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise(resolve => child.once('exit', resolve));
      }
      lines.close();
    }
  };
}

export async function measureCpu(clock, pid, operation) {
  const before = await clock.read(pid), wall = performance.now();
  const result = await operation();
  const wallMs = performance.now() - wall, after = await clock.read(pid);
  if (after < before) throw new Error('Process CPU clock moved backwards.');
  return {result, cpuMs: Number(after - before) / 1e6, processCpuMs: Number(after) / 1e6, wallMs};
}
