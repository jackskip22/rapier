// SPDX-License-Identifier: MIT
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createServer as createSocket} from 'node:net';
import {mkdir, writeFile, readFile, readlink, readdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {measureCpu} from './runtime-cpu.mjs';
import {READ_BATCH_BYTES} from '../resumable-prefetch.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processMemoryPid(pid) {
  const parent = Number(await readlink('/proc/self'));
  for (const candidate of (await readdir('/proc')).filter(name => /^\d+$/.test(name))) {
    let status;
    try { status = await readFile(`/proc/${candidate}/status`, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const actualParent = Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
    const namespacePids = /^NSpid:\s+([\d\s]+)$/m.exec(status)?.[1].trim().split(/\s+/).map(Number);
    if (actualParent === parent && namespacePids?.at(-1) === pid) return Number(candidate);
  }
  throw new Error('Cannot identify Workerd child for process memory counters: ' + pid);
}

async function processMemory(pid) {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const amount = name => {
    const match = new RegExp(`^${name}:\\s+(\\d+) kB$`, 'm').exec(status);
    if (!match) throw new Error('Missing Workerd process memory counter: ' + name);
    return Number(match[1]) * 1024;
  };
  return {rssBytes: amount('VmRSS'), hwmBytes: amount('VmHWM')};
}

export async function buildWorkerd({sourceDir, stepper, esbuild, directory, workerStepper = join(dirname(stepper), 'capture-host-entry.mjs')}) {
  sourceDir = resolve(sourceDir); stepper = resolve(stepper); directory = resolve(directory);
  await mkdir(directory, {recursive: true});
  const api = await import(pathToFileURL(stepper));
  const hostApi = await import(pathToFileURL(resolve(workerStepper)));
  if (api.BUILD !== hostApi.BUILD) throw new Error('The frozen Node and host capture builds differ.');
  if (typeof api.captureKernelBytes !== 'function' || typeof api.configureCaptureKernels !== 'function')
    throw new Error('Use the generated capture entry so hostcompiled kernels belong to its exact closure.');
  const kernels = api.captureKernelBytes(), modules = Object.keys(kernels);
  for (const name of modules) await writeFile(join(directory, name + '.wasm'), kernels[name]);
  const entry = `
${modules.map(name => `import ${name} from './${name}.wasm';`).join('\n')}
import * as api from ${JSON.stringify(resolve(workerStepper))};
api.configureCaptureKernels({${modules.join(', ')}});
async function bytes(response) {
  response = await response;
  if (!response.ok) throw new Error('Fixture host: ' + response.status + ' ' + await response.text());
  return new Uint8Array(await response.arrayBuffer());
}
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/__ready') return new Response('ready');
    try {
      const call = await request.json();
      const io = {
        source: call.source,
        expectedRevision: call.expectedRevision,
        readSource: (offset, length) => bytes(env.HOST.fetch('http://fixture/source?offset=' + offset + '&length=' + length)),
        read: ref => bytes(env.HOST.fetch('http://fixture/part/' + ref.hash + '?length=' + ref.length)),
        async readMany(refs) {
          const data = await bytes(env.HOST.fetch('http://fixture/parts', {method: 'POST', body: JSON.stringify(refs)}));
          let at = 0;
          const rows = refs.map(ref => { const from = at; at += ref.length; return data.subarray(from, at); });
          if (at !== data.length) throw new Error('Fixture batch byte length changed.');
          return rows;
        }
      };
      const result = call.operation === 'start'
        ? await api.start({source: call.source, options: call.options})
        : await api.advance(call.checkpoint, io, {units: call.units});
      const parts = [];
      for (const part of result.parts || []) {
        const response = await env.HOST.fetch('http://fixture/part/' + part.ref.hash, {method: 'PUT', body: part.bytes});
        if (!response.ok) throw new Error('Part persistence: ' + response.status + ' ' + await response.text());
        parts.push(part.ref);
      }
      return Response.json({...result, parts});
    } catch (error) {
      return Response.json({error: {code: error.code || 'RE1_RUNTIME', message: error.message, stack: error.stack}}, {status: 500});
    }
  }
};
`;
  const entryPath = join(directory, 'entry.mjs'), bundle = join(directory, 'worker.mjs');
  await writeFile(entryPath, entry);
  execFileSync(esbuild, [entryPath, '--bundle', '--minify', '--format=esm', '--platform=neutral', '--target=es2022', '--external:*.wasm', '--outfile=' + bundle, '--log-level=warning'], {stdio: 'pipe'});
  const assets = {};
  for (const name of ['worker.mjs', ...modules.map(name => name + '.wasm')]) {
    const content = await readFile(join(directory, name));
    assets[name] = {length: content.length, sha256: sha256(content)};
  }
  return {directory, assets, modules, esbuild: execFileSync(esbuild, ['--version'], {encoding: 'utf8'}).trim()};
}

export async function fixtureHost(source, maxPartBytes = 1 << 20, parts = new Map()) {
  const counters = {sourceReads: 0, partReads: 0, partReadBatches: 0, partPuts: 0, duplicates: 0, readBytes: 0, writeBytes: 0, maxPartBytes: 0};
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture');
      if (url.pathname === '/source' && request.method === 'GET') {
        const offset = Number(url.searchParams.get('offset')), length = Number(url.searchParams.get('length'));
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > source.length) throw new Error('Invalid source range.');
        counters.sourceReads++; counters.readBytes += length;
        response.writeHead(200, {'content-type': 'application/octet-stream'}); response.end(source.subarray(offset, offset + length)); return;
      }
      if (url.pathname === '/parts' && request.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 32768) throw new Error('Part frontier exceeds its metadata bound.'); chunks.push(chunk); }
        const refs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(refs) || refs.length > 128) throw new Error('Invalid part read batch.');
        let length = 0;
        const values = refs.map(ref => {
          if (!ref || !/^[a-f0-9]{64}$/.test(ref.hash) || !Number.isSafeInteger(ref.length) || ref.length < 0 ||
              ref.length > 1048576 || Object.keys(ref).length !== 2) throw new Error('Invalid batch part reference.');
          const value = parts.get(ref.hash); length += ref.length;
          if (!value || value.length !== ref.length || length > READ_BATCH_BYTES) throw new Error('Missing, truncated or oversized part batch.');
          return value;
        });
        counters.partReadBatches++; counters.partReads += refs.length; counters.readBytes += length;
        response.writeHead(200, {'content-type': 'application/octet-stream'}); response.end(Buffer.concat(values)); return;
      }
      const match = /^\/part\/([a-f0-9]{64})$/.exec(url.pathname);
      if (!match) { response.writeHead(404); response.end('Unknown fixture path.'); return; }
      const hash = match[1];
      if (request.method === 'GET') {
        const part = parts.get(hash);
        if (!part) { response.writeHead(404); response.end('Missing immutable part.'); return; }
        if (Number(url.searchParams.get('length')) !== part.length) throw new Error('Part length mismatch.');
        counters.partReads++; counters.readBytes += part.length;
        response.writeHead(200, {'content-type': 'application/octet-stream'}); response.end(part); return;
      }
      if (request.method === 'PUT') {
        let length = 0; const chunks = [];
        for await (const chunk of request) {
          length += chunk.length;
          if (length > maxPartBytes) throw new Error('Immutable part exceeds 1 MiB.');
          chunks.push(chunk);
        }
        const value = Buffer.concat(chunks);
        if (sha256(value) !== hash) throw new Error('Part digest mismatch.');
        counters.partPuts++;
        if (parts.has(hash)) {
          if (!parts.get(hash).equals(value)) throw new Error('Immutable part changed.');
          counters.duplicates++;
        } else {
          parts.set(hash, value); counters.writeBytes += value.length;
          counters.maxPartBytes = Math.max(counters.maxPartBytes, value.length);
        }
        response.writeHead(204); response.end(); return;
      }
      response.writeHead(405); response.end();
    } catch (error) { response.writeHead(400); response.end(error.message); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {port: server.address().port, parts, counters, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }};
}

async function unusedPort() {
  const socket = createSocket();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

export async function workerdProcess({binary, build, hostPort, clock, label}) {
  const port = await unusedPort(), configuration = join(build.directory, 'config.capnp');
  const modules = ['(name = "worker.mjs", esModule = embed "worker.mjs")', ...build.modules.map(name => `(name = "${name}.wasm", wasm = embed "${name}.wasm")`)];
  await writeFile(configuration, `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "main", worker = (modules = [${modules.join(',')}], compatibilityDate = "2026-09-07", bindings = [(name = "HOST", service = "fixture")])),
    (name = "fixture", external = (address = "127.0.0.1:${hostPort}", http = ()))
  ],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")]
);
`);
  const child = spawn(binary, ['serve', configuration, '--experimental'], {cwd: build.directory, stdio: ['ignore', 'pipe', 'pipe']});
  let log = '', exited = false, spawnError;
  const append = data => { log = (log + data.toString()).slice(-65536); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('error', error => { spawnError = error; }); child.on('exit', () => { exited = true; });
  const endpoint = 'http://127.0.0.1:' + port;
  let startupCpuMs, startupMemory, memoryPid;
  async function close() {
    if (!exited && !spawnError) {
      const done = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await done; clearTimeout(timer);
    }
    await writeFile(join(build.directory, label + '.log'), log);
  }
  try {
    const until = Date.now() + 20000;
    while (true) {
      if (spawnError) throw spawnError;
      if (exited) throw new Error('Workerd exited before ready: ' + log);
      try { const response = await fetch(endpoint + '/__ready', {signal: AbortSignal.timeout(1000)}); if (response.ok) break; } catch {}
      if (Date.now() >= until) throw new Error('Workerd readiness timed out: ' + log);
      await delay(25);
    }
    startupCpuMs = Number(await clock.read(child.pid)) / 1e6;
    memoryPid = await processMemoryPid(child.pid);
    startupMemory = await processMemory(memoryPid);
  } catch (error) { await close(); throw error; }
  return {
    startupCpuMs, startupMemory,
    async call(body) {
      const measured = await measureCpu(clock, child.pid, async () => {
        const response = await fetch(endpoint + '/', {method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(120000)});
        return {status: response.status, value: await response.json()};
      });
      const {result, ...time} = measured;
      const memory = await processMemory(memoryPid);
      const sample = {...time, memory, startupCpuMs, startupMemory, coldTotalCpuMs: time.processCpuMs};
      if (result.status !== 200) throw Object.assign(new Error(result.value.error?.message || 'Workerd invocation failed.'),
        {code: result.value.error?.code || 'RE1_RUNTIME', receipt: {...sample, result}});
      return {...sample, result: result.value};
    },
    close
  };
}
