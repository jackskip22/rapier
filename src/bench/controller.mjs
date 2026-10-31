// SPDX-License-Identifier: AGPL-3.0-only
import {BENCH_MANIFEST} from './manifest.mjs';
import {appendRun, createResult, finishResult, serializeResult, unavailable, validateSample} from './results.mjs';

export const CHILD_CSP = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";
const PAYLOAD_IDS = ['rapier-platform-runtime', 'rapier-codec-runtime', 'rapier-styles-runtime', 'rapier-style-rest-runtime', 'rapier-ui-runtime', 'rapier-editor-runtime'];
const STOP_REASON = 'Stopped by the person running the benchmark.';
const clone = value => value === null ? null : JSON.parse(JSON.stringify(value));
const describeError = error => String(error?.message || error || 'Unknown benchmark error.').slice(0, 1000);
const abortError = reason => Object.assign(new Error(reason), {name: 'AbortError', code: 'BENCH_STOPPED'});

export function captureBenchTemplate(document) {
 for (const id of PAYLOAD_IDS) {
  const payload = document.getElementById(id);
  if (!payload || !payload.textContent.endsWith('/* RAPIER_VENDOR_SPANS_END */\n')) throw new Error('The loaded editor payload is incomplete: ' + id);
 }
 const root = document.documentElement.cloneNode(true);
 for (const element of root.querySelectorAll('meta[http-equiv], link, base, #rapier-boot-theme, #rapier-document, #rapier-font-style, #rapier-content-style, #rapier-app-style, #rapier-editor-style, #rapier-highlight-style')) element.remove();
 if (root.querySelector('script[src]')) throw new Error('The benchmark requires a self-contained editor page.');
 const head = root.querySelector('head'), body = root.querySelector('body');
 if (!head || !body) throw new Error('The loaded editor shell is incomplete.');
 return Object.freeze({head: head.innerHTML, body: body.innerHTML});
}

function installBenchSession(nonce) {
 let started = false, ready = false, meter = null;
 let failure = {code: 'BENCH_METER_MISSING', message: 'Benchmark meter missing: editor startup boundary was not reported.'};
 const missing = reason => Object.fromEntries(['durationMs', 'longestTaskMs', 'droppedFrames', 'heapBytes'].map(key => [key, {unavailable: reason}]));
 globalThis.RapierBenchSession = {
  active: true, nonce,
  async startEditor() {
   if (started) return;
   started = true;
   try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const begin = globalThis.RapierPhoneBenchCore?.beginMeasurement;
    if (typeof begin !== 'function') throw Object.assign(new Error('Benchmark meter missing: editor startup measurement owner is unavailable.'), {code: 'BENCH_METER_MISSING'});
    meter = begin(globalThis);
   } catch (error) { failure = {code: error?.code || 'BENCH_METER_FAILED', message: String(error?.message || error)}; }
  },
  async ready(payload) {
   if (ready) return;
   ready = true;
   let sample, error = meter ? null : failure;
   try {
    sample = meter ? (await meter.finish()).sample : missing(failure.message);
   } catch (cause) {
    try { await meter?.cancel(); } catch (_) {}
    error = {code: 'BENCH_METER_FAILED', message: 'Editor startup measurement failed: ' + String(cause?.message || cause)};
    sample = missing(error.message);
   }
   parent.postMessage({type: 'rapier-bench-ready', nonce, payload: {...(payload || {}), startup: {sample, ...(error ? {error} : {})}}}, '*');
  },
 };
}

export function createBenchSrcdoc(template, nonce) {
 if (!/^[a-f0-9]{32}$/.test(nonce)) throw new TypeError('Invalid benchmark session nonce.');
 const prelude = '(' + installBenchSession.toString() + ')(' + JSON.stringify(nonce) + ');';
 return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="' + CHILD_CSP + '"><script>' + prelude + '</script>' + template.head + '</head><body>' + template.body + '</body></html>';
}

export function acceptsReady(event, childWindow, nonce) {
 return event.source === childWindow && event.data?.type === 'rapier-bench-ready' && event.data.nonce === nonce;
}

export function createBenchRealm({window, document, template, onIdentity = () => {}}) {
 const bytes = new Uint8Array(16);
 window.crypto.getRandomValues(bytes);
 const nonce = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
 const iframe = document.createElement('iframe');
 iframe.setAttribute('sandbox', 'allow-scripts');
 iframe.setAttribute('aria-hidden', 'true');
 iframe.setAttribute('title', 'Isolated benchmark editor');
 iframe.tabIndex = -1;
 iframe.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;border:0;pointer-events:none;z-index:1;';
 let port = null, destroyed = false, nextRequest = 0, pending = null, timer = null;
 let resolveReady, rejectReady;
 const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
 const clearTimer = () => { if (timer !== null) { window.clearTimeout(timer); timer = null; } };
 const receiveReady = event => {
  if (destroyed || port || !acceptsReady(event, iframe.contentWindow, nonce)) return;
  window.removeEventListener('message', receiveReady);
  clearTimer();
  const elapsedMs = window.performance.now() - started;
  const channel = new window.MessageChannel();
  port = channel.port1;
  port.onmessage = event => {
   const message = event.data;
   if (destroyed || !pending || message?.nonce !== nonce || message.requestId !== pending.requestId || message.runId !== pending.runId) return;
   if (message.type !== 'result' && message.type !== 'error') return;
   clearTimer();
   const task = pending;
   pending = null;
   if (message.type === 'error') task.reject(Object.assign(new Error(message.error?.message || 'The isolated run failed.'), {code: message.error?.code || 'BENCH_ERROR'}));
   else task.resolve(message.result);
  };
  port.onmessageerror = () => destroy(new Error('The isolated result could not be read.'));
  port.start();
  try {
   iframe.contentWindow.postMessage({type: 'rapier-bench-connect', nonce}, '*', [channel.port2]);
   if (event.data.payload?.identity) onIdentity(event.data.payload.identity);
   resolveReady({durationMs: elapsedMs, payload: event.data.payload});
  } catch (error) { channel.port2.close(); destroy(error); }
 };
 const destroy = (reason = abortError(STOP_REASON)) => {
  if (destroyed) return;
  destroyed = true;
  clearTimer();
  window.removeEventListener('message', receiveReady);
  if (port) {
   try { port.postMessage({type: 'stop', nonce, requestId: ++nextRequest}); } catch (_) {}
   port.onmessage = null; port.onmessageerror = null; port.close(); port = null;
  }
  iframe.remove();
  rejectReady(reason);
  if (pending) { pending.reject(reason); pending = null; }
 };
 window.addEventListener('message', receiveReady);
 iframe.srcdoc = createBenchSrcdoc(template, nonce);
 const started = window.performance.now();
 timer = window.setTimeout(() => destroy(Object.assign(new Error('The isolated editor did not become ready within two minutes.'), {code: 'BENCH_TIMEOUT'})), 120000);
 document.body.appendChild(iframe);
 return {
  ready, destroy,
  execute(runId, repetition) {
   if (!BENCH_MANIFEST.runs.some(run => run.id === runId && run.kind !== 'start') || !Number.isInteger(repetition) || repetition < 0 || repetition >= BENCH_MANIFEST.repetitions) return Promise.reject(new Error('Unknown fixed benchmark operation or repetition.'));
   if (destroyed || !port) return Promise.reject(abortError('The isolated editor is no longer available.'));
   if (pending) return Promise.reject(new Error('An isolated operation is already running.'));
   return new Promise((resolve, reject) => {
    pending = {requestId: ++nextRequest, runId, resolve, reject};
    timer = window.setTimeout(() => destroy(Object.assign(new Error('The isolated operation exceeded its ten-minute safety timeout.'), {code: 'BENCH_TIMEOUT'})), 600000);
    try { port.postMessage({type: 'run', nonce, requestId: pending.requestId, runId, repetition}); }
    catch (error) { destroy(error); }
   });
  },
 };
}

export function requestBenchWakeLock({window, isCurrent, onChange = () => {}}) {
 let sentinel = null, accepting = true, settled = false, timer = null, resolveReady;
 let record = {requested: false, acquired: false, state: 'unavailable'};
 const ready = new Promise(resolve => { resolveReady = resolve; });
 const publish = () => onChange({...record});
 const settle = () => {
  if (timer !== null) { window.clearTimeout(timer); timer = null; }
  if (!settled) { settled = true; resolveReady({...record}); }
 };
 const retire = lock => {
  try { Promise.resolve(lock.release()).catch(() => {}); } catch (_) {}
 };
 const unavailable = reason => {
  if (settled) return;
  accepting = false;
  if (sentinel) { const held = sentinel; sentinel = null; retire(held); }
  record = {...record, state: 'unavailable', reason};
  publish(); settle();
 };
 const release = reason => {
  if (!accepting) return;
  accepting = false;
  if (sentinel) {
   record = {...record, state: 'release-requested', releaseRequested: true, reason};
   publish();
   const held = sentinel; sentinel = null; retire(held);
  } else if (!settled) {
   record = {...record, state: 'cancelled', reason}; publish();
  }
  settle();
 };
 try {
  const api = window.navigator.wakeLock;
  if (typeof api?.request !== 'function') unavailable('Screen wake lock is unavailable in this browser.');
  else {
   record = {requested: true, acquired: false, state: 'requesting'}; publish();
   timer = window.setTimeout(() => unavailable('Screen wake lock did not respond within two seconds.'), 2000);
   Promise.resolve(api.request('screen')).then(lock => {
    if (!accepting || !isCurrent()) { retire(lock); if (!settled) release('The run ended before screen wake lock was acquired.'); return; }
    if (!lock || typeof lock.release !== 'function' || typeof lock.addEventListener !== 'function') { retire(lock); unavailable('The browser returned no usable screen wake lock.'); return; }
    if (lock.released) { retire(lock); unavailable('The browser released screen wake lock before the run.'); return; }
    sentinel = lock;
    record = {requested: true, acquired: true, state: 'acquired'};
    lock.addEventListener('release', () => {
     if (sentinel !== lock || !accepting) return;
     sentinel = null; accepting = false;
     record = {...record, state: 'released', releasedWhileRunning: true, reason: 'The browser released screen wake lock during the run.'};
     publish();
    }, {once: true});
    publish(); settle();
   }, error => unavailable('Screen wake lock was not acquired: ' + describeError(error))).catch(error => unavailable('Screen wake lock was not acquired: ' + describeError(error)));
  }
 } catch (error) { unavailable('Screen wake lock was not acquired: ' + describeError(error)); }
 return {ready, release};
}

export async function browserIdentity(navigator) {
 const userAgent = navigator.userAgent || '';
 const match = /\b(EdgA?|EdgiOS)\/([\d.]+)/.exec(userAgent) || /\b(Firefox|FxiOS)\/([\d.]+)/.exec(userAgent) || /\b(Chrome|CriOS)\/([\d.]+)/.exec(userAgent) || /\b(Version)\/([\d.]+)/.exec(userAgent);
 const name = match ? ({Edg: 'Edge', EdgA: 'Edge', EdgiOS: 'Edge', Chrome: 'Chrome', CriOS: 'Chrome', Firefox: 'Firefox', FxiOS: 'Firefox', Version: 'Safari'}[match[1]]) : 'Unknown';
 const version = match?.[2] || unavailable('The browser did not expose its version.');
 const identity = {name, version, userAgent};
 const chromium = /\bChrome\/([\d.]+)/.exec(userAgent);
 if (chromium) identity.engine = {name: 'Chromium', version: chromium[1], source: 'user-agent'};
 try {
  if (await navigator.brave?.isBrave?.()) { identity.name = 'Brave'; identity.version = unavailable('Brave does not expose its own release version.'); }
 } catch (_) {}
 try {
  if (navigator.userAgentData?.getHighEntropyValues) {
   const hints = await navigator.userAgentData.getHighEntropyValues(['fullVersionList', 'platformVersion']);
   const brands = hints.fullVersionList || navigator.userAgentData.brands;
   if (Array.isArray(brands)) identity.brands = brands;
   if (typeof navigator.userAgentData.platform === 'string') identity.platform = navigator.userAgentData.platform;
   if (hints.platformVersion) identity.platformVersion = hints.platformVersion;
   const brand = hints.fullVersionList?.find(row => row.brand === ({Chrome: 'Google Chrome', Edge: 'Microsoft Edge'}[identity.name]));
   if (brand) identity.version = brand.version;
   const engine = hints.fullVersionList?.find(row => row.brand === 'Chromium');
   if (engine) identity.engine = {name: 'Chromium', version: engine.version, source: 'user-agent-data'};
  }
 } catch (_) {}
 return identity;
}

function runLabel(run) {
 if (run.kind === 'document') {
  const fixture = BENCH_MANIFEST.fixtures.find(row => row.id === run.fixture);
  const operation = {open: 'Open', 'type-start': 'Type at start', 'type-middle': 'Type in middle', 'type-end': 'Type at end', search: 'Search', 'copy-formatted': 'Copy formatted', save: 'Save'}[run.operation];
  return operation + ' · ' + (fixture.bytes / 1000000) + ' MB';
 }
 return {'paintings.open-three': 'Open three paintings', 'painting.save-fast': 'Save painting', 'painting.save-effort7': 'Compact painting save · effort 7', 'jxl.decode': 'Decode JPEG XL', 'jxl.encode-effort7': 'Encode JPEG XL · effort 7', 'paint.dieterle-60hz': 'Paint · Dieterle stroke at 60 Hz', 'start.cold': 'Editor start · fresh realm', 'start.warm': 'Editor start · primed fresh realm'}[run.id] || 'Water · ' + run.parameters.shaderPath + ' · ' + run.operation.replaceAll('-', ' ');
}

function mountPage(document, window) {
 const style = document.createElement('style');
 style.id = 'rapier-bench-style';
 style.textContent = `
html{color-scheme:dark;background:#000;color:#fafafa;scroll-behavior:auto}
body{margin:0;min-height:100dvh;background:#000;color:#fafafa;font:400 16px/1.5 Geist,system-ui,sans-serif}
#rapier-bench{--bench-muted:#a1a1a1;--bench-line:#252525;--bench-hover:#1a1a1a;box-sizing:border-box;width:min(100%,720px);margin:0 auto;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(40px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
#rapier-bench *{box-sizing:border-box;border-radius:0}
#rapier-bench h1{margin:0 0 8px;font-size:28px;font-weight:500;line-height:1.2}
#rapier-bench p{margin:12px 0;color:var(--bench-muted)}
#rapier-bench .bench-mark{margin:0 0 24px;font:500 12px/1.4 'Geist Mono',monospace;letter-spacing:.035em;text-transform:uppercase}
#rapier-bench label{display:block;margin:24px 0 8px}
#rapier-bench select,#rapier-bench input{display:block;width:100%;min-height:48px;padding:10px 12px;border:1px solid var(--bench-line);background:transparent;color:inherit;font:inherit}
#rapier-bench option{background:Canvas;color:CanvasText}
#rapier-bench .bench-actions{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}
#rapier-bench button{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-width:64px;min-height:44px;padding:0 16px;border:0;background:transparent;color:inherit;font:500 14px 'Geist Mono',monospace;letter-spacing:.035em;text-transform:uppercase;cursor:pointer;touch-action:manipulation}
#rapier-bench button:first-child{background:#12a594;color:#000}
#rapier-bench button:disabled{opacity:.5;cursor:default}
#rapier-bench button:focus-visible,#rapier-bench button:active{outline:2px solid currentColor;outline-offset:2px}
#rapier-bench progress{display:block;width:100%;height:3px;border:0;background:var(--bench-line);accent-color:#12a594}
#rapier-bench progress::-webkit-progress-bar{background:var(--bench-line)}
#rapier-bench progress::-webkit-progress-value{background:#12a594}
#rapier-bench .bench-status{color:inherit;min-height:3em;overflow-wrap:anywhere}
#rapier-bench .bench-notice{font-size:14px}
#rapier-bench .bench-results{border-top:1px solid var(--bench-line);margin-top:28px;padding-top:12px}
#rapier-bench textarea{display:block;width:100%;min-height:260px;padding:12px;border:1px solid var(--bench-line);background:transparent;color:inherit;font:12px/1.5 'Geist Mono',monospace;resize:vertical;white-space:pre;overflow:auto}
#rapier-bench [hidden]{display:none!important}
#rapier-bench[data-running="true"]>.bench-panel{position:fixed;inset:0 0 auto;z-index:2;padding:8px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));background:#000;color:#fafafa;border-bottom:1px solid var(--bench-line)}
#rapier-bench[data-running="true"]>.bench-panel .bench-actions{position:absolute;right:12px;top:8px;margin:0}
#rapier-bench[data-running="true"]>.bench-panel .bench-actions button:first-child{display:none}
#rapier-bench[data-running="true"]>.bench-panel .bench-status{min-height:44px;margin:0;padding-right:88px;font-size:13px;line-height:1.5}
#rapier-bench[data-running="true"]>:not(.bench-panel){display:none!important}
@media(prefers-color-scheme:light){html,body{color-scheme:light;background:#fff;color:#121212}#rapier-bench{--bench-muted:#656565;--bench-line:#dedede;--bench-hover:#f2f2f2}#rapier-bench[data-running="true"]>.bench-panel{background:#fff;color:#121212}}
`;
 document.head.appendChild(style);
 const node = (tag, text, attributes = {}) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
 };
 const main = node('main', undefined, {id: 'rapier-bench'});
 main.append(node('p', 'Rapier · Phone benchmark', {class: 'bench-mark'}), node('h1', 'Measure this phone'), node('p', 'Fixed documents, painting strokes and editor starts. Keep this page open while it runs.'));
 const label = node('label', 'Phone model', {for: 'rapier-bench-model'});
 const model = node('select', undefined, {id: 'rapier-bench-model'});
 for (const [value, text] of [['', 'Choose your phone'], ['Moto G04', 'Moto G04'], ['Moto Edge 60 Fusion', 'Moto Edge 60 Fusion'], ['custom', 'Another device']]) model.append(node('option', text, {value}));
 const custom = node('input', undefined, {type: 'text', 'aria-label': 'Device model', placeholder: 'Device model', maxlength: '120', autocomplete: 'off'});
 custom.hidden = true;
 model.addEventListener('change', () => { custom.hidden = model.value !== 'custom'; if (!custom.hidden) custom.focus(); });
 const actions = node('div', undefined, {class: 'bench-actions'});
 const start = node('button', 'Start', {type: 'button'}), stop = node('button', 'Stop', {type: 'button'});
 stop.disabled = true;
 actions.append(start, stop);
 const progress = node('progress', undefined, {value: '0', max: String(BENCH_MANIFEST.runs.length * BENCH_MANIFEST.repetitions), 'aria-label': 'Benchmark progress'});
 const status = node('p', 'Ready. ' + BENCH_MANIFEST.runs.length + ' tests, three repetitions each.', {class: 'bench-status', role: 'status', 'aria-live': 'polite'});
 const panel = node('div', undefined, {class: 'bench-panel'});
 const wakeNotice = node('p', '', {class: 'bench-notice', role: 'status'});
 wakeNotice.hidden = true;
 panel.append(actions, progress, status, wakeNotice);
 main.append(label, model, custom, panel, node('p', 'Your documents stay untouched. Runs use disposable copies of the loaded editor, with network access blocked. Nothing leaves this device unless you choose Copy or Share.', {class: 'bench-notice'}), node('p', 'Stop discards the current editor when the browser can respond. A long synchronous task can delay the button. Closing or hiding this page stops the run.', {class: 'bench-notice'}));
 const results = node('section', undefined, {class: 'bench-results', 'aria-label': 'Benchmark result'});
 results.hidden = true;
 const summary = node('p');
 const resultActions = node('div', undefined, {class: 'bench-actions'});
 const copy = node('button', 'Copy', {type: 'button'}), share = node('button', 'Share', {type: 'button'});
 share.disabled = typeof window.navigator.share !== 'function';
 const output = node('textarea', undefined, {readonly: '', spellcheck: 'false', 'aria-label': 'Complete benchmark result'});
 const message = node('p', '', {role: 'status', class: 'bench-notice'});
 resultActions.append(copy, share);
 results.append(summary, resultActions, output, message);
 main.append(results);
 document.body.replaceChildren(main);
 document.title = 'Rapier · Phone benchmark';
 return {main, model, custom, start, stop, progress, status, wakeNotice, results, summary, copy, share, output, message};
}

export function startPage() {
 if (globalThis.RapierBenchSession?.active === true) return false;
 const window = globalThis.window, document = window.document;
 if (window.RapierPhoneBench) return true;
 let page = null, template = null, setupError = null, active = null, wakeLock = null, epoch = 0, inFlight = null, result = null;
 let runIndex = 0, repetition = 0, currentRow = null;
 const loaded = new Promise(resolve => {
  const mount = () => {
   try { template = captureBenchTemplate(document); } catch (error) { setupError = error; }
   page = mountPage(document, window);
   page.start.addEventListener('click', () => { void start(); });
   page.stop.addEventListener('click', stop);
   page.copy.addEventListener('click', async () => {
    try { await window.navigator.clipboard.writeText(page.output.value); page.message.textContent = 'Result copied.'; }
    catch (_) { page.output.focus(); page.output.select(); page.message.textContent = 'Select and copy the result above. Clipboard access is unavailable.'; }
   });
   page.share.addEventListener('click', async () => {
    try { await window.navigator.share({title: 'Rapier phone benchmark', text: page.output.value}); page.message.textContent = 'Share sheet closed.'; }
    catch (error) { if (error.name !== 'AbortError') page.message.textContent = 'Sharing is unavailable. Copy the result instead.'; }
   });
   if (setupError) page.status.textContent = describeError(setupError);
   resolve();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
 });
 const state = () => result?.state || (setupError ? 'error' : 'ready');
 const render = () => {
  if (!page) return;
  const running = state() === 'running';
  page.main.setAttribute('data-running', String(running));
  page.wakeNotice.hidden = !running;
  page.start.disabled = running || inFlight !== null; page.stop.disabled = !running;
  page.model.disabled = running; page.custom.disabled = running;
  page.progress.value = Math.min(BENCH_MANIFEST.runs.length * BENCH_MANIFEST.repetitions, runIndex * BENCH_MANIFEST.repetitions + repetition);
  if (running) {
   page.results.hidden = true;
   page.status.textContent = (runIndex + 1) + ' / ' + BENCH_MANIFEST.runs.length + ' · ' + runLabel(BENCH_MANIFEST.runs[runIndex]) + ' · ' + Math.min(repetition + 1, BENCH_MANIFEST.repetitions) + ' / ' + BENCH_MANIFEST.repetitions;
  } else if (result) {
   const counts = Object.fromEntries(['completed', 'unsupported', 'error', 'stopped'].map(name => [name, result.runs.filter(run => run.state === name).length]));
   page.results.hidden = false;
   page.summary.textContent = counts.completed + ' measured · ' + counts.unsupported + ' unsupported · ' + counts.error + ' errors · ' + counts.stopped + ' stopped. Raw repetitions, median and p95 are included below.';
   page.status.textContent = result.state === 'completed' ? 'Finished.' : result.reason;
   page.output.value = serializeResult(result);
   page.message.textContent = '';
  }
 };
 const finish = (state, reason) => {
  if (!result || result.state !== 'running') return;
  wakeLock?.release(state === 'completed' ? 'The benchmark finished.' : reason || STOP_REASON); wakeLock = null;
  if (currentRow && currentRow.id === BENCH_MANIFEST.runs[result.runs.length]?.id) {
   appendRun(result, {...currentRow, state: state === 'error' ? 'error' : 'stopped', reason: reason || STOP_REASON});
   currentRow = null;
  }
  finishResult(result, state, reason ? {reason} : {});
  render();
 };
 function stop(reason = STOP_REASON) {
  if (typeof reason !== 'string') reason = STOP_REASON;
  if (state() !== 'running') { if (inFlight) epoch++; return clone(result); }
  epoch++;
  const old = active; active = null;
  old?.destroy(abortError(reason));
  finish('stopped', reason);
  return clone(result);
 }
 const openRealm = async token => {
  if (token !== epoch) throw abortError(STOP_REASON);
  const realm = createBenchRealm({window, document, template, onIdentity(identity) {
   if (token === epoch && result?.state === 'running' && identity.gpu) result.identity.gpu = clone(identity.gpu);
  }});
  active = realm;
  try {
   const startup = await realm.ready;
   if (token !== epoch || result?.state !== 'running') throw abortError(STOP_REASON);
   return {realm, startup};
  }
  catch (error) { realm.destroy(error); if (active === realm) active = null; error.benchBootFailed = true; throw error; }
 };
 const discard = realm => { realm.destroy(); if (active === realm) active = null; };
 async function runAll(token) {
  try {
   if (setupError) throw setupError;
   for (runIndex = 0; runIndex < BENCH_MANIFEST.runs.length; runIndex++) {
    if (token !== epoch) throw abortError(STOP_REASON);
    const run = BENCH_MANIFEST.runs[runIndex];
    currentRow = {id: run.id, state: 'completed', samples: []};
    let realm = null;
    repetition = 0; render();
    try {
     if (run.kind === 'document') ({realm} = await openRealm(token));
     for (repetition = 0; repetition < BENCH_MANIFEST.repetitions; repetition++) {
      if (token !== epoch) throw abortError(STOP_REASON);
      render();
      if (run.kind === 'start') {
       if (run.operation === 'warm') { const prime = await openRealm(token); discard(prime.realm); }
       const opened = await openRealm(token); realm = opened.realm;
       const startup = opened.startup.payload?.startup;
       if (startup?.error) throw Object.assign(new Error(startup.error.message), {code: startup.error.code});
       if (!startup?.sample) throw new Error('Benchmark meter missing: editor startup measurement was not reported.');
       const sample = {...startup.sample, extra: {...startup.sample.extra, realmReadyMs: opened.startup.durationMs}};
       validateSample(sample); currentRow.samples.push(sample);
       discard(realm); realm = null;
      } else {
       if (!realm) ({realm} = await openRealm(token));
       const response = await realm.execute(run.id, repetition);
       if (token !== epoch) throw abortError(STOP_REASON);
       if (!response?.sample) throw new Error('The isolated run returned no measurement.');
       validateSample(response.sample); currentRow.samples.push(response.sample);
       if (response.sample.details?.identity?.gpu) result.identity.gpu = clone(response.sample.details.identity.gpu);
       if (run.kind !== 'document') { discard(realm); realm = null; }
      }
     }
    } catch (error) {
     if (token !== epoch || error.name === 'AbortError' || error.benchBootFailed) throw error;
     currentRow.state = error.code === 'BENCH_UNSUPPORTED' && currentRow.samples.length === 0 ? 'unsupported' : 'error';
     currentRow.reason = describeError(error);
    } finally { if (realm) discard(realm); }
    if (token !== epoch) throw abortError(STOP_REASON);
    appendRun(result, currentRow); currentRow = null;
   }
   finish('completed');
  } catch (error) {
   if (token === epoch && result?.state === 'running') finish(error.name === 'AbortError' ? 'stopped' : 'error', describeError(error));
  }
  return clone(result);
 }
 function start(options = {}) {
  if (inFlight) return inFlight;
  const token = ++epoch;
  inFlight = (async () => {
   await loaded;
   if (token !== epoch) return clone(result);
   const model = typeof options.deviceModel === 'string' ? options.deviceModel.trim().slice(0, 120) : page.model.value === 'custom' ? page.custom.value.trim() : page.model.value;
   const build = window.RapierPhoneBenchBuild || {};
   result = createResult({release: {version: build.version || document.querySelector('meta[name="rapier-version"]')?.content || unavailable('Release version unavailable.'), build: build.build || unavailable('Build identity unavailable.')},
    device: {model: model || unavailable('The person running the benchmark did not identify the device.')},
    browser: {userAgent: window.navigator.userAgent || unavailable('User agent unavailable.')},
    gpu: {adapter: unavailable('No isolated operation has reported GPU adapter information.'), features: unavailable('No isolated operation has reported GPU features.')},
    environment: options.environment ? clone(options.environment) : window.__rapierPhoneBenchEnvironment ? clone(window.__rapierPhoneBenchEnvironment) : {kind: window.navigator.userAgentData?.mobile === true || /Android|iPhone|iPad/.test(window.navigator.userAgent) ? 'phone' : 'browser', deviceSelection: model ? 'manual' : 'unspecified', source: 'user-agent mobile classification'},
    isolation: {origin: 'opaque', network: 'blocked', fixtures: 'bundled', persistence: 'ephemeral'}});
   runIndex = 0; repetition = 0; currentRow = null; render();
   const runResult = result;
   wakeLock = requestBenchWakeLock({window, isCurrent: () => token === epoch && result === runResult && runResult.state === 'running', onChange(record) {
    if (runResult.state !== 'running') return;
    runResult.identity.environment.screenWakeLock = record;
    if (result === runResult && runResult.state === 'running') page.wakeNotice.textContent = record.state === 'acquired' ? 'Screen wake lock is on for this run.' : record.state === 'requesting' ? 'Keeping the screen awake…' : 'Screen wake lock is unavailable. Keep the screen awake while this runs.';
   }});
   const browser = await browserIdentity(window.navigator);
   await wakeLock?.ready;
   if (token !== epoch) return clone(result);
   result.identity.browser = browser;
   return runAll(token);
  })().finally(() => { inFlight = null; render(); });
  return inFlight;
 }
 window.addEventListener('pagehide', () => stop('Stopped because the benchmark page was closed or navigated away.'));
 document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Stopped because the benchmark page was hidden. Keep it visible for valid frame measurements.'); });
 window.RapierPhoneBench = Object.freeze({start, stop, result: () => clone(result), status: () => ({state: state(), runId: state() === 'running' ? BENCH_MANIFEST.runs[runIndex]?.id || null : null, runIndex, repetition, total: BENCH_MANIFEST.runs.length})});
 return true;
}
