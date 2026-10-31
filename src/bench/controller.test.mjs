// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {BENCH_MANIFEST} from './manifest.mjs';
import {CHILD_CSP, captureBenchTemplate, createBenchSrcdoc, createBenchRealm, startPage, requestBenchWakeLock} from './controller.mjs';
import {parseResult, serializeResult} from './results.mjs';
import {beginMeasurement} from './measure.mjs';

const {parseHTML} = createRequire(new URL('../mcp/package.json', import.meta.url))('linkedom');

const page = readFileSync(new URL('../rapier.html', import.meta.url), 'utf8');
const packed = document => [...document.querySelectorAll('script[id]')].filter(node => /^(application\/rapier-|text\/rapier-vendor)/.test(node.type));

function checkPackedIsolation() {
 const {document} = parseHTML(page);
 const carried = document.createElement('script');
 carried.id = 'rapier-document'; carried.type = 'text/plain'; carried.textContent = 'PRIVATE CARRIED DOCUMENT';
 document.body.append(carried);
 const template = captureBenchTemplate(document);
 const srcdoc = createBenchSrcdoc(template, '1234567890abcdef1234567890abcdef');
 const child = parseHTML(srcdoc).document;
 assert.equal(child.getElementById('rapier-document'), null);
 assert.equal(child.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length, 1);
 assert.equal(child.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), CHILD_CSP);
 assert.ok(srcdoc.indexOf('Content-Security-Policy') < srcdoc.indexOf('<script>'));
 assert.equal(child.querySelector('link, base, script[src]'), null);
 for (const original of packed(document)) assert.equal(child.getElementById(original.id).textContent, original.textContent, original.id + ' remains the loaded artifact bytes');
 const directives = Object.fromEntries(CHILD_CSP.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
 assert.deepEqual(directives['connect-src'], ["'none'"]);
 assert.deepEqual(directives['frame-src'], ["'none'"]);
 assert.deepEqual(directives['form-action'], ["'none'"]);
 assert.equal(Object.values(directives).flat().some(source => /^https?:|^'self'$|^\*$/.test(source)), false);
 assert.throws(() => createBenchSrcdoc(template, '</script><script>'), /nonce/);
 document.getElementById('rapier-editor-runtime').textContent = 'partial';
 assert.throws(() => captureBenchTemplate(document), /incomplete/);
}

function harness() {
 const {document} = parseHTML('<!doctype html><html><head></head><body></body></html>');
 const listeners = new Set();
 let childPort = null, connected = 0;
 const childWindow = {postMessage(message, destination, ports) {
  assert.equal(message.type, 'rapier-bench-connect'); assert.equal(destination, '*');
  connected++; childPort = ports[0]; childPort.start();
 }};
 const createElement = document.createElement.bind(document);
 document.createElement = name => {
  const element = createElement(name);
  if (name === 'iframe') Object.defineProperty(element, 'contentWindow', {value: childWindow});
  return element;
 };
 const window = {crypto: webcrypto, MessageChannel, performance, setTimeout, clearTimeout,
  addEventListener(type, callback) { if (type === 'message') listeners.add(callback); },
  removeEventListener(type, callback) { if (type === 'message') listeners.delete(callback); }};
 const realm = createBenchRealm({window, document, template: {head: '', body: ''}});
 const frame = document.querySelector('iframe');
 const nonce = /[a-f0-9]{32}/.exec(frame.srcdoc)[0];
 const emit = (source, value = nonce) => { for (const listener of listeners) listener({source, data: {type: 'rapier-bench-ready', nonce: value}}); };
 return {realm, document, frame, nonce, childWindow, emit, get connected() { return connected; }, get port() { return childPort; }, close() { realm.destroy(); childPort?.close(); }};
}

async function checkMessageAuthority() {
 const h = harness();
 try {
 assert.equal(h.frame.getAttribute('sandbox'), 'allow-scripts');
 h.emit({}); h.emit(h.childWindow, '0'.repeat(32));
 assert.equal(h.connected, 0);
 h.emit(h.childWindow);
 await h.realm.ready;
 assert.equal(h.connected, 1);
 const runId = BENCH_MANIFEST.runs.find(run => run.kind !== 'start').id;
 await assert.rejects(h.realm.execute('arbitrary-function', 0), /fixed/);
 await assert.rejects(h.realm.execute(runId, 3), /fixed/);
 const command = new Promise(resolve => h.port.once('message', resolve));
 let settled = false;
 const measurement = h.realm.execute(runId, 0).then(value => { settled = true; return value; });
 const request = await command;
 assert.equal(request.runId, runId);
 h.port.postMessage({type: 'result', ...request, nonce: '0'.repeat(32), result: {forged: true}});
 h.port.postMessage({...request, type: 'result', requestId: request.requestId + 1, result: {forged: true}});
 h.port.postMessage({...request, type: 'result', runId: 'arbitrary-function', result: {forged: true}});
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(settled, false);
 h.port.postMessage({...request, type: 'result', result: {sample: {durationMs: 2}}});
 assert.deepEqual(await measurement, {sample: {durationMs: 2}});
 } finally { h.close(); }
}

async function checkStoppedRealm() {
 const h = harness();
 try {
 h.emit(h.childWindow); await h.realm.ready;
 const pending = h.realm.execute(BENCH_MANIFEST.runs[0].id, 0);
 const rejected = assert.rejects(pending, error => error.code === 'BENCH_STOPPED');
 h.realm.destroy();
 await rejected;
 assert.equal(h.document.querySelector('iframe'), null);
 h.emit(h.childWindow);
 assert.equal(h.connected, 1);
 await assert.rejects(h.realm.execute(BENCH_MANIFEST.runs[0].id, 0), error => error.code === 'BENCH_STOPPED');
 } finally { h.close(); }
}

async function checkStartupProjection() {
 const srcdoc = createBenchSrcdoc({head: '', body: ''}, '1234567890abcdef1234567890abcdef');
 const prelude = parseHTML(srcdoc).document.querySelector('script').textContent;
 const clone = value => JSON.parse(JSON.stringify(value));
 const state = {now: 0, heap: 7};
 let begins = 0, finishAt = null, ownerSample;
 const messages = [];
 const world = {performance: {now: () => state.now, get memory() { return {usedJSHeapSize: state.heap}; }}, setTimeout,
  parent: {postMessage(message) { messages.push(clone(message)); }},
  RapierPhoneBenchCore: {beginMeasurement(environment) {
   begins++;
   const meter = beginMeasurement(environment);
   return {cancel: meter.cancel, finish(value) {
    finishAt = state.now;
    return meter.finish(value).then(measured => { ownerSample = clone(measured.sample); return measured; });
   }};
  }},
 };
 vm.runInContext(prelude, vm.createContext(world));
 const start = world.RapierBenchSession.startEditor();
 assert.equal(begins, 0, 'Benchmark inflation task is excluded before opening the meter.');
 await start;
 assert.equal(begins, 1);
 state.now = 37; state.heap = 99;
 const ready = world.RapierBenchSession.ready({identity: {kind: 'wiring-vector'}});
 assert.equal(finishAt, 37, 'Readiness snapshots the meter before yielding.');
 state.now = 999; state.heap = 999;
 await ready;
 assert.deepEqual(messages[0].payload.startup.sample, ownerSample);
 assert.deepEqual(messages[0].payload.identity, {kind: 'wiring-vector'});
 await world.RapierBenchSession.ready();
 assert.equal(messages.length, 1);
 const absent = {setTimeout, parent: {postMessage(message) { messages.push(clone(message)); }}};
 vm.runInContext(prelude, vm.createContext(absent));
 await absent.RapierBenchSession.startEditor();
 await absent.RapierBenchSession.ready();
 const missing = messages.at(-1).payload.startup.sample;
 assert.equal(Object.values(missing).every(value => typeof value.unavailable === 'string'), true);
 assert.equal(messages.at(-1).payload.startup.error.code, 'BENCH_METER_MISSING');
}

function wakeSentinel() {
 const listeners = new Set();
 return {released: false, releases: 0,
  addEventListener(type, callback) { if (type === 'release') listeners.add(callback); },
  release() { this.releases++; this.released = true; for (const callback of listeners) callback(); return Promise.resolve(); },
  lose() { this.released = true; for (const callback of listeners) callback(); },
 };
}
async function checkWakeLockLifetime() {
 const make = () => {
  let resolve, reject, timeout, current = true, requests = 0;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const records = [];
  const window = {navigator: {wakeLock: {request(kind) { assert.equal(kind, 'screen'); requests++; return promise; }}},
   setTimeout(callback) { timeout = callback; return 1; }, clearTimeout() { timeout = null; }};
  const lock = requestBenchWakeLock({window, isCurrent: () => current, onChange: record => records.push(record)});
  return {lock, records, resolve, reject, expire: () => timeout(), end: () => { current = false; }, requests: () => requests};
 };
 const normal = make(), held = wakeSentinel();
 normal.resolve(held); await normal.lock.ready;
 assert.equal(normal.records.at(-1).state, 'acquired');
 normal.lock.release('Finished.'); normal.lock.release('Finished again.');
 assert.equal(held.releases, 1);
 assert.equal(normal.records.at(-1).releaseRequested, true);
 assert.equal(normal.requests(), 1);
 for (const how of ['stop', 'timeout', 'stale']) {
  const pending = make(), late = wakeSentinel();
  if (how === 'stop') pending.lock.release('Stopped.');
  if (how === 'timeout') pending.expire();
  if (how === 'stale') pending.end();
  pending.resolve(late); await pending.lock.ready;
  await Promise.resolve();
  assert.equal(late.releases, 1, 'An unusable late lock is retired.');
  assert.equal(pending.records.some(record => record.acquired), false);
  assert.equal(pending.requests(), 1);
 }
 const denied = make(); denied.reject(new Error('Permission unavailable.')); await denied.lock.ready;
 assert.equal(denied.records.at(-1).state, 'unavailable');
 assert.equal(denied.records.at(-1).acquired, false);
 const lost = make(), released = wakeSentinel(); lost.resolve(released); await lost.lock.ready;
 released.lose(); lost.lock.release('Run ended.');
 assert.equal(lost.records.at(-1).releasedWhileRunning, true);
 assert.equal(lost.requests(), 1, 'The meter never competes with wake-lock reacquisition.');
 const unsupported = requestBenchWakeLock({window: {navigator: {}, clearTimeout() {}}, isCurrent: () => true});
 const absent = await unsupported.ready;
 assert.equal(absent.requested, false); assert.equal(absent.acquired, false); assert.equal(absent.state, 'unavailable');
 assert.equal(typeof absent.reason, 'string');
}

async function checkStoppedController() {
 const {document} = parseHTML(page);
 const oldWindow = globalThis.window;
 const listeners = new Map();
 const childPorts = [], wakeLocks = [];
 let admit = false, corrupt = false, pendingWake = null;
 const emit = event => { for (const listener of listeners.get('message') || []) listener(event); };
 const createElement = document.createElement.bind(document);
 document.createElement = name => {
  const element = createElement(name);
  if (name === 'iframe') {
   const childWindow = {postMessage(message, destination, ports) {
    const port = ports[0]; childPorts.push(port);
    port.on('message', request => {
     if (request.type === 'run') port.postMessage(corrupt && request.runId === BENCH_MANIFEST.runs[0].id ? {...request, type: 'result', result: {sample: {durationMs: NaN}}} : {...request, type: 'error', error: {code: 'BENCH_UNSUPPORTED', message: 'No editor executes in this authority proof.'}});
    });
    port.start();
   }};
   Object.defineProperty(element, 'contentWindow', {value: childWindow});
   setImmediate(() => {
    if (!admit || !element.isConnected) return;
    const nonce = /[a-f0-9]{32}/.exec(element.srcdoc)[0];
    emit({source: childWindow, data: {type: 'rapier-bench-ready', nonce, payload: {startup: corrupt ? {error: {code: 'BENCH_METER_MISSING', message: 'Benchmark meter missing: authority vector.'}} : {sample: {durationMs: 1, longestTaskMs: 0, droppedFrames: 0, heapBytes: {unavailable: 'Authority vector'}}}}}});
   });
  }
  return element;
 };
 const window = {document, crypto: webcrypto, MessageChannel, performance, setTimeout, clearTimeout,
  navigator: {userAgent: 'Authority boundary proof', wakeLock: {request() { const lock = wakeSentinel(); wakeLocks.push(lock); const deferred = pendingWake; pendingWake = null; return deferred ? deferred.promise : Promise.resolve(lock); }}},
  __rapierPhoneBenchEnvironment: {kind: 'lab', source: 'authority proof'},
  addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
  removeEventListener(type, callback) { listeners.get(type)?.delete(callback); }};
 Object.defineProperty(window, 'localStorage', {get() { throw new Error('Parent storage must not be read.'); }});
 Object.defineProperty(window, 'indexedDB', {get() { throw new Error('Parent storage must not be read.'); }});
 globalThis.window = window;
 try {
  startPage();
  const first = window.RapierPhoneBench.start({deviceModel: 'Fixture'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.RapierPhoneBench.status().state, 'running');
  const stopped = window.RapierPhoneBench.stop();
  assert.equal(document.querySelector('#rapier-bench button').disabled, true, 'Start is not admitted before current cleanup settles.');
  assert.equal(window.RapierPhoneBench.start({deviceModel: 'Pending cleanup'}), first);
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.identity.environment.screenWakeLock.acquired, true);
  assert.equal(wakeLocks[0].releases, 1);
  assert.equal(parseResult(serializeResult(stopped)).runs.length, BENCH_MANIFEST.runs.length);
  assert.deepEqual(await first, stopped);
  assert.equal(document.querySelector('#rapier-bench button').disabled, false, 'Settled cleanup admits the next run.');
  assert.equal(document.querySelector('iframe'), null);
  const detached = window.RapierPhoneBench.result();
  detached.identity.device.model = 'Edited by a caller';
  assert.equal(window.RapierPhoneBench.result().identity.device.model, 'Fixture');
  admit = true;
  const completed = await window.RapierPhoneBench.start({deviceModel: 'Fixture'});
  assert.equal(completed.state, 'completed');
  assert.equal(completed.identity.environment.kind, 'lab');
  assert.deepEqual(parseResult(serializeResult(completed)), completed);
  assert.equal(completed.runs.every(run => run.id.startsWith('start.') ? run.state === 'completed' : run.state === 'unsupported'), true);
  corrupt = true;
  const invalid = await window.RapierPhoneBench.start({deviceModel: 'Fixture'});
  assert.equal(invalid.runs[0].state, 'error');
  assert.deepEqual(invalid.runs[0].samples, []);
  for (const startup of invalid.runs.filter(run => run.id.startsWith('start.'))) {
   assert.equal(startup.state, 'error');
   assert.deepEqual(startup.samples, []);
   assert.match(startup.reason, /Benchmark meter missing/);
  }
  assert.notEqual(window.RapierPhoneBench.status().state, 'running');
  assert.deepEqual(parseResult(serializeResult(invalid)), invalid);
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(wakeLocks.every(lock => lock.releases === 1), true);
  admit = false;
  const hidden = window.RapierPhoneBench.start({deviceModel: 'Fixture'});
  await new Promise(resolve => setImmediate(resolve));
  for (const listener of listeners.get('pagehide')) listener();
  assert.equal((await hidden).state, 'stopped');
  assert.equal(wakeLocks.at(-1).releases, 1);
  for (const afterRestart of [false, true]) {
   let resolve;
   const promise = new Promise(done => { resolve = done; });
   pendingWake = {promise};
   const waiting = window.RapierPhoneBench.start({deviceModel: 'Fixture'});
   await new Promise(done => setImmediate(done));
   const lateSentinel = wakeLocks.at(-1);
   window.RapierPhoneBench.stop(); await waiting;
   const stoppedText = serializeResult(window.RapierPhoneBench.result());
   assert.equal(document.querySelector('textarea').value, stoppedText);
   if (afterRestart) {
    admit = true; corrupt = false;
    await window.RapierPhoneBench.start({deviceModel: 'Replacement fixture'});
   }
   const currentText = serializeResult(window.RapierPhoneBench.result());
   resolve(lateSentinel);
   await new Promise(done => setImmediate(done));
   assert.equal(lateSentinel.releases, 1);
   assert.equal(serializeResult(window.RapierPhoneBench.result()), currentText);
   assert.equal(document.querySelector('textarea').value, currentText);
   if (!afterRestart) assert.equal(currentText, stoppedText);
  }
 } finally {
  window.RapierPhoneBench?.stop();
  for (const port of childPorts) port.close();
  if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
 }
}

export async function checkPhoneBenchController() {
 checkPackedIsolation();
 await checkMessageAuthority();
 await checkStoppedRealm();
 await checkStartupProjection();
 await checkWakeLockLifetime();
 await checkStoppedController();
 return {packedBytes: 'preserved', childAuthority: 'opaque nonce/source/port', stop: 'terminal', result: 'parseable'};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 console.log(JSON.stringify(await checkPhoneBenchController()));
}
