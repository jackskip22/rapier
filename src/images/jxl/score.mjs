// SPDX-License-Identifier: MIT
import {complete} from './bits.mjs';
import {fault} from './admit.mjs';
import {checkSignal} from './async-job.mjs';
import {prepareV6, scoreSteps, cpuMeasure, runAsync, gpuDoubt} from './photo-v6-search.mjs';
import {exactAnswerer, exactScores} from './exact-region.mjs';
import {gpuSetup} from './gpu-setup.mjs';
import {GpuMeasure, attachVarblocks} from './gpu-measure.mjs';
import {LIMITS, admitScore, scoreMemory, finishScore, encodeToScoreSteps} from './score-steps.mjs';

export {LIMITS, encodeToScoreSteps};

const S2_DOUBT = 2e-4;


export async function encodeToScore(data, width, height, options) {
  checkSignal(options?.signal);
  const settings = admitScore(data, width, height, options), {target, effort, candidates} = settings, gpu = options?.gpu;
  const {memory, plan} = scoreMemory(data, width, height, options, target.ssimulacra2 !== undefined);
  const stats = {backend: gpu ? 'gpu+cpu' : 'cpu', gpuProbes: 0, cpuProbes: 0, cpuFallbacks: 0, gpuFailures: 0,
    probes: 0, recomputed: 0, regions: 0, gpuBufferBytes: 0, hostBufferBytes: 0, cacheBytes: 0};
  const publish = () => { if (options?.stats) Object.assign(options.stats, stats); };
  if (gpu && plan.known) {
    stats.backend = 'refused'; stats.gpuFailure = 'JXL_MEMORY_GPU_UNPROVEN'; publish();
    throw fault('JXL_MEMORY_GPU_UNPROVEN', 'no GPU memory bound');
  }
  if (!gpu) { try { return complete(encodeToScoreSteps(data, width, height, {...options, stats})); } finally { publish(); } }
  let measurer = null, exactAnswer = null, steps = null, cpuOnce = null, metricRgba = null, gpuFailure, gpuFailed = false, completed = false;
  const recordMemory = () => {
    stats.gpuBufferBytes = Math.max(stats.gpuBufferBytes, measurer?.gpuBufferBytes ?? 0);
    stats.hostBufferBytes = Math.max(stats.hostBufferBytes, measurer?.hostBufferBytes ?? 0);
    stats.cacheBytes = Math.max(stats.cacheBytes, measurer?.cacheBytes ?? 0);
    stats.metricCacheBytes = Math.max(stats.metricCacheBytes ?? 0, cpuOnce?.cacheBytes ?? 0);
    stats.metricReferenceBytes = Math.max(stats.metricReferenceBytes ?? 0, cpuOnce?.referenceBytes ?? 0);
    stats.metricInputBytes = Math.max(stats.metricInputBytes ?? 0, metricRgba?.byteLength ?? 0);
  };
  const cleanup = async () => {
    const closing = [];
    for (const release of [recordMemory, () => exactAnswer?.destroy(), () => measurer?.destroy(),
      () => steps?.return(), () => cpuOnce?.destroy?.()]) {
      try { closing.push(Promise.resolve(release())); } catch (error) { closing.push(Promise.reject(error)); }
    }
    const results = await Promise.allSettled(closing), failures = results.filter(result => result.status === 'rejected');
    stats.cleanupFailures = (stats.cleanupFailures ?? 0) + failures.length;
    exactAnswer = measurer = steps = cpuOnce = metricRgba = null;
    return {failed: failures.length > 0, error: failures[0]?.reason};
  };
  const cpu = (image, want) => {
    stats.cpuProbes++;
    return exactScores(cpuOnce ||= cpuMeasure(metricRgba, width, height, {cacheBytes: plan.cacheBytes, immutable: true}), null, width, height, image, want, plan);
  };
  cpu.withReference = consume => (cpuOnce ||= cpuMeasure(metricRgba, width, height, {cacheBytes: plan.cacheBytes, immutable: true})).withReference(consume);
  try {
    metricRgba = new Uint8Array(width * height * 4); metricRgba.set(data.subarray(0, metricRgba.length));
    cpuOnce = cpuMeasure(metricRgba, width, height, {cacheBytes: plan.cacheBytes, immutable: true});
    try {
      measurer = await GpuMeasure.create(gpu, metricRgba, width, height, {signal: options?.signal});
      await attachVarblocks(measurer, gpu, {signal: options?.signal});
    } catch (error) { gpuFailure = error; gpuFailed = true; throw error; }
    const measure = async (image, want) => {
      checkSignal(options?.signal);
      if (want?.exact) { stats.recomputed++; return cpu(image, want); }
      if (want && ('p' in want || 'margin' in want)) {
        stats.cpuDecisions = (stats.cpuDecisions ?? 0) + 1; return cpu(image, want);
      }
      let out;
      try { out = await gpuSetup(() => measurer.measure(image, want), {signal: options?.signal, dispose: () => measurer?.destroy()}); }
      catch (error) { gpuFailure = error; gpuFailed = true; throw error; }
      stats.probes++; stats.gpuProbes++; recordMemory();
      if (!want?.ssimulacra2) return {...out, doubt: gpuDoubt(out)};
      if (out.ssimulacra2 !== undefined) return {...out, doubt: gpuDoubt(out, S2_DOUBT)};
      stats.cpuFallbacks++;
      return {...out, ssimulacra2: cpu(image, {...want, butteraugli: false}).ssimulacra2, doubt: gpuDoubt(out)};
    };
    measure.varblocks = async request => {
      const result = await gpuSetup(() => measurer.varblocks?.(request), {signal: options?.signal, dispose: () => measurer?.destroy()});
      stats.varblockGpuFailures = measurer.varblockResources?.failures ?? 0;
      if (stats.varblockGpuFailures) stats.backend = 'gpu+cpu-fallback';
      stats.varblockGpuBufferPeak = measurer.varblockResources?.peakBufferBytes ?? 0;
      recordMemory(); return result;
    };
    measure.exact = async request => {
      checkSignal(options?.signal);
      stats.regions += request.regions?.length ?? 1;
      if (!exactAnswer) exactAnswer = exactAnswerer(width, height, cpu, options?.signal);
      const result = await exactAnswer(request);
      stats.regionFallbacks = exactAnswer.fallbacks;
      return result;
    };
    steps = scoreSteps(prepareV6(data, width, height, {}, memory), target, {candidates, effort, exactSize: true});
    const progress = value => { checkSignal(options?.signal); options?.onProgress?.(value); checkSignal(options?.signal); };
    const result = await runAsync(steps, measure, progress);
    const released = await cleanup(); checkSignal(options?.signal); if (released.failed) throw released.error;
    const finish = finishScore(result, data, width, height, settings);
    let answer;
    try {
      let step;
      while (!(step = finish.next()).done) progress(step.value);
      answer = step.value;
    } finally { finish.return(); }
    checkSignal(options?.signal); completed = true; return answer;
  } catch (error) {
    if (options?.signal?.aborted) { stats.backend = 'canceled'; throw options.signal.reason; }
    if (error?.name === 'AbortError') throw error;
    if (!gpuFailed) throw error;
    stats.gpuFailures++; stats.backend = 'gpu-failed';
    stats.gpuFailure = gpuFailure?.code ?? gpuFailure?.name ?? 'Error';
    const released = await cleanup(); if (released.failed) throw error;
    checkSignal(options?.signal);
    stats.cpuFallbacks++; stats.cpuFallbackSearches = 1; stats.backend = 'cpu-fallback';
    const answer = complete(encodeToScoreSteps(data, width, height, {...options, stats}));
    checkSignal(options?.signal); completed = true; return answer;
  } finally {
    await cleanup();
    const canceled = completed && options?.signal?.aborted;
    if (canceled) stats.backend = 'canceled';
    publish(); if (canceled) throw options.signal.reason;
  }
}
