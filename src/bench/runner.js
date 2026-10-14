// SPDX-License-Identifier: AGPL-3.0-only
(() => {
 const session = globalThis.RapierBenchSession;
 if (session?.active !== true) return;
 const core = globalThis.RapierPhoneBenchCore;
 if (!core) throw new Error('Phone benchmark contract missing');
 const runs = new Map(core.BENCH_MANIFEST.runs.map(run => [run.id, run]));
 let port = null, busy = false, stopped = false, generation = 0, controller = null, lastRequestId = 0;
 const currentSession = () => globalThis.RapierBenchSession === session && session.active === true && !stopped;
 const getFixture = id => core.DOCUMENT_FIXTURES.some(row => row.id === id)
  ? core.generateDocumentFixture(id)
  : globalThis.RapierPhoneBenchGraphicsFixtures.getGraphicsFixture(id);
 const errorRecord = error => ({code: error?.name === 'AbortError' ? 'BENCH_STOPPED' : error?.code || 'BENCH_ERROR', message: String(error?.message || error)});
 const receive = async event => {
  const message = event.data;
  if (!currentSession() || !message || message.nonce !== session.nonce || !Number.isSafeInteger(message.requestId) || message.requestId < 1) return;
  if (message.type === 'stop') { stopped = true; generation++; controller?.abort(); return; }
  if (message.type !== 'run' || message.requestId <= lastRequestId) return;
  lastRequestId = message.requestId;
  const reply = payload => {
   if (currentSession()) port?.postMessage({nonce: session.nonce, requestId: message.requestId, runId: message.runId, ...payload});
  };
  if (busy) { reply({type:'error', error:{code:'BENCH_BUSY',message:'An owner operation is already running'}}); return; }
  const run = runs.get(message.runId);
  if (!run || run.kind === 'start') { reply({type:'error',error:{code:'BENCH_UNKNOWN_RUN',message:'Unknown fixed benchmark operation'}}); return; }
  const adapter = globalThis.RapierPhoneBenchAdapters?.[run.kind === 'document' ? 'document' : 'graphics'];
  if (!adapter || ['prepare', 'execute', 'verify', 'cleanup'].some(name => typeof adapter[name] !== 'function')) {
   reply({type:'error',error:{code:'BENCH_UNSUPPORTED',message:'This build does not include the operation owner'}}); return;
  }
  busy = true;
  const epoch = ++generation, operation = new AbortController();
  controller = operation;
  session.signal = operation.signal;
  const context = {signal:operation.signal,getFixture,session:{capture:session.capture}};
  const current = () => epoch === generation && currentSession() && !operation.signal.aborted;
  const check = () => { if (!current()) throw new DOMException('Benchmark stopped', 'AbortError'); };
  let response;
  try {
   if (run.kind !== 'document' && typeof RapierParts !== 'undefined' && RapierParts.has('drawing')) { await RapierParts.need('drawing'); check(); }
   await adapter.prepare(run, context); check();
   const measured = await core.measureExecution(() => { check(); return adapter.execute(run, context); });
   check();
   const custody = await adapter.verify(run, measured.value, context); check();
   measured.sample.details = {...measured.sample.details, ...(custody === undefined ? {} : {custody})};
   response = {type:'result',result:{sample:measured.sample, ...(measured.value?.details ? {details:measured.value.details} : {})}};
  } catch (error) { response = {type:'error',error:errorRecord(error)}; }
  finally {
   try { await adapter.cleanup(context); }
   catch (error) { response = {type:'error',error:{code:'BENCH_CLEANUP_FAILED',message:String(error?.message || error), ...(response?.error ? {cause:response.error} : {})}}; }
   if (session.signal === operation.signal) session.signal = null;
   if (controller === operation) controller = null;
   busy = false;
  }
  if (current()) reply(response);
 };
 addEventListener('message', event => {
  if (!currentSession() || port || event.source !== parent || event.data?.type !== 'rapier-bench-connect' || event.data.nonce !== session.nonce || event.ports?.length !== 1) return;
  port = event.ports[0]; port.onmessage = receive; port.start();
 });
})();
