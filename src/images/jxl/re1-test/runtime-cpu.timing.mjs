// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {processCpuClock, measureCpu} from './runtime-cpu.mjs';

test('external process CPU excludes a sleeping interval and includes a busy interval', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {createInterface} from 'node:readline';
    for await (const operation of createInterface({input: process.stdin})) {
      if (operation === 'sleep') await new Promise(resolve => setTimeout(resolve, 150));
      else if (operation === 'spin') { const at = process.cpuUsage(); while (process.cpuUsage(at).user < 60000) {} }
      console.log('done');
    }
  `], {stdio: ['pipe', 'pipe', 'inherit']});
  const lines = createInterface({input: child.stdout}), clock = processCpuClock();
  const invoke = operation => new Promise(resolve => { lines.once('line', resolve); child.stdin.write(operation + '\n'); });
  try {
    await invoke('ready');
    const sleep = await measureCpu(clock, child.pid, () => invoke('sleep'));
    const spin = await measureCpu(clock, child.pid, () => invoke('spin'));
    assert.ok(sleep.wallMs >= 120, `sleep elapsed ${sleep.wallMs}`);
    assert.ok(sleep.cpuMs < 40, `sleep CPU ${sleep.cpuMs}`);
    assert.ok(spin.cpuMs >= 50, `spin CPU ${spin.cpuMs}`);
    assert.ok(spin.cpuMs > sleep.cpuMs * 2, `CPU measurement must distinguish work from waiting: ${spin.cpuMs} vs ${sleep.cpuMs}`);
  } finally {
    child.stdin.end();
    await new Promise(resolve => child.once('exit', resolve));
    await clock.close(); lines.close();
  }
});
