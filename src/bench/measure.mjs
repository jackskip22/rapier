// SPDX-License-Identifier: AGPL-3.0-only
const missing = unavailable => ({unavailable});
const nextTask = environment => {
 if (typeof environment.setTimeout !== 'function') throw new Error('Task scheduling unavailable');
 return new Promise(resolve => environment.setTimeout(resolve, 0));
};
const cancelled = () => Object.assign(new Error('Measurement cancelled'), {name: 'AbortError', code: 'BENCH_STOPPED'});

export function beginMeasurement(environment = globalThis) {
 const clock = environment.performance;
 if (typeof clock?.now !== 'function') throw new Error('Monotonic performance clock unavailable');
 const tasks = [], frameGaps = [], intervals = [];
 let observer, frame, previousFrame, previous, frames = 0, state = 'active', rafReason = null;
 let observerReason = 'PerformanceObserver longtask unavailable';
 const rafAvailable = typeof environment.requestAnimationFrame === 'function' && typeof environment.cancelAnimationFrame === 'function';
 const closeObserver = () => {
  if (!observer) return;
  const current = observer; observer = null;
  try { current.disconnect(); }
  catch (error) { observerReason = 'Long-task observer could not close: ' + String(error?.message || error); }
 };
 const closeFrames = () => {
  if (frame === undefined) return;
  const current = frame; frame = undefined;
  try { environment.cancelAnimationFrame(current); }
  catch (error) { rafReason = 'Animation callback could not be retired: ' + String(error?.message || error); }
 };
 if (environment.PerformanceObserver?.supportedEntryTypes?.includes('longtask') === true) {
  try {
   observer = new environment.PerformanceObserver(list => {
    if (state === 'cancelled' || state === 'finished') return;
    try { for (const entry of list.getEntries()) tasks.push(entry); }
    catch (error) { observerReason = 'Long-task entries could not be read: ' + String(error?.message || error); }
   });
   observer.observe({type: 'longtask'});
   observerReason = null;
  } catch (error) {
   closeObserver();
   observerReason = 'Long-task observer could not start: ' + String(error?.message || error);
  }
 }
 let start;
 try { start = clock.now(); if (!Number.isFinite(start)) throw new Error('Monotonic performance clock returned an invalid value'); }
 catch (error) { closeObserver(); throw error; }
 previous = start;
 const sampleFrame = time => {
  if (state !== 'active') return;
  if (Number.isFinite(time) && time >= previous) {
   intervals.push(time - previous);
   if (previousFrame !== undefined) frameGaps.push(time - previousFrame);
   previousFrame = time; previous = time; frames++;
  }
  try { frame = environment.requestAnimationFrame(sampleFrame); }
  catch (error) { rafReason = 'Animation callbacks could not be scheduled: ' + String(error?.message || error); }
 };
 if (rafAvailable) {
  try { frame = environment.requestAnimationFrame(sampleFrame); }
  catch (error) { rafReason = 'Animation callbacks could not be scheduled: ' + String(error?.message || error); }
 }
 const cancel = () => {
  if (state === 'cancelled' || state === 'finished') return;
  state = 'cancelled'; closeFrames(); closeObserver();
 };
 const finish = async value => {
  if (state !== 'active') throw new Error('Measurement is already closed');
  state = 'finishing';
  let end, heap;
  try {
   end = clock.now();
   try { heap = clock.memory?.usedJSHeapSize; } catch (_) {}
  } catch (error) { cancel(); throw error; }
  closeFrames();
  if (observer) {
   const current = observer;
   try {
    await nextTask(environment);
    if (observer === current) for (const entry of current.takeRecords()) tasks.push(entry);
   } catch (error) { observerReason = 'Long-task entries could not be collected: ' + String(error?.message || error); }
   finally { closeObserver(); }
  }
  if (state === 'cancelled') throw cancelled();
  state = 'finished';
  if (!Number.isFinite(end) || end < start) throw new Error('Monotonic performance clock returned an invalid interval');
  if (end > previous) intervals.push(end - previous);
  const overlapping = tasks.filter(row => Number.isFinite(row.startTime) && Number.isFinite(row.duration) && row.duration >= 0 && row.startTime < end && row.startTime + row.duration > start);
  return {sample: {
   durationMs: end - start,
   longestTaskMs: observerReason ? missing(observerReason) : overlapping.reduce((longest, row) => Math.max(longest, row.duration), 0),
   droppedFrames: rafReason ? missing(rafReason) : rafAvailable ? intervals.reduce((sum, delta) => sum + Math.max(0, Math.floor(delta / (1000 / 60)) - 1), 0) : missing('requestAnimationFrame unavailable'),
   heapBytes: Number.isFinite(heap) && heap >= 0 ? heap : missing('performance.memory.usedJSHeapSize unavailable'),
   extra: {...value?.extra,
    observedRafIntervalMs: rafReason ? missing(rafReason) : frameGaps.length ? frameGaps.reduce((sum, gap) => sum + gap, 0) / frameGaps.length : missing('Fewer than two animation callbacks in measured interval'),
    observedRafCallbacks: rafReason ? missing(rafReason) : rafAvailable ? frames : missing('requestAnimationFrame unavailable')},
   ...(value?.details ? {details: value.details} : {}),
  }, value};
 };
 return Object.freeze({finish, cancel});
}

export async function measureExecution(execute, environment = globalThis) {
 await nextTask(environment);
 const measurement = beginMeasurement(environment);
 try { return await measurement.finish(await execute()); }
 catch (error) { measurement.cancel(); throw error; }
}
