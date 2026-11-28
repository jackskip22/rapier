// SPDX-License-Identifier: MIT
import {LIMITS} from './limits.mjs';
import {admitPixels, fault, guard, answer} from './admit.mjs';
import {admitEffort, BALANCED_EFFORT} from './effort-level.mjs';
import {effortJob} from './effort-job.mjs';
import {EXACT_LADDER} from './exact-ladder.mjs';
import {checkSignal} from './async-job.mjs';
import {prepareV6, scoreSteps, cpuMeasure, CANDIDATES} from './photo-v6-search.mjs';
import {exactScores} from './exact-region.mjs';
import {memoryPlan} from './memory-plan.mjs';
import {photoTarget} from './photo-quality-search.mjs';
import {explicitShownMargin} from './photo-whole-policy.mjs';
import {nativeRGBA} from './photo-output.mjs';
import {bandedOutputs} from './photo-reconstruct-bands.mjs';

export {LIMITS};

export function admitScore(data, width, height, options) {
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) throw fault('JXL_INPUT', 'samples: 8-bit sRGB RGBA');
  admitPixels(data, width, height, LIMITS);
  const candidates = options?.candidates ?? CANDIDATES;
  if (!Array.isArray(candidates) || !candidates.length || candidates.some(c => !CANDIDATES.includes(c))) throw fault('JXL_INPUT', `candidates: ${CANDIDATES.join(', ')}`);
  const allowLossless = options?.allowLossless === undefined ? true : options.allowLossless, maxBytes = options?.maxBytes ?? Number.MAX_SAFE_INTEGER;
  if (typeof allowLossless !== 'boolean') throw fault('JXL_INPUT', 'allowLossless: boolean');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || options?.maxBytes === null) throw fault('JXL_INPUT', 'maxBytes: positive integer');
  return {target: photoTarget(options?.target), effort: admitEffort(options ?? {}, BALANCED_EFFORT, true), candidates, allowLossless, maxBytes};
}

export function scoreMemory(data, width, height, options, exact) {
  const inputBytes = data.buffer.byteLength, metricInputBytes = width * height * 4, scope = options?.memory;
  if (scope?.inputBytes !== undefined && scope.inputBytes < inputBytes) throw fault('JXL_MEMORY', 'inputBytes: below retained input');
  if (scope?.metricInputBytes !== undefined && scope.metricInputBytes < metricInputBytes) throw fault('JXL_MEMORY', 'metricInputBytes: below snapshot');
  const memory = {...scope, inputBytes: scope?.inputBytes ?? inputBytes, metricInputBytes: scope?.metricInputBytes ?? metricInputBytes, width, height, exact};
  const plan = memoryPlan(width * height, memory);
  if (plan.known && !plan.fits) throw fault('JXL_MEMORY', 'over memory reservation');
  return {memory, plan};
}

const scoreAnswer = r => ({bytes: r.bytes, quality: r.quality, candidate: r.candidate, pass: r.pass,
  ...(r.ssimulacra2 !== undefined ? {ssimulacra2: r.ssimulacra2} : {})});

function scoreRefusal(result, target, code, reason) {
  const margin = row => row.ssimulacra2 - target.ssimulacra2;
  const best = result.tried.map(row => row.bestObserved).reduce((a, b) => margin(b) > margin(a) ? b : a);
  const scores = Object.fromEntries(Object.keys(target).map(key => [key, best[key]]));
  return Object.assign(fault(code, reason + '; best: ' + Object.entries(scores).map(([key, value]) => key + ' ' + value).join(', ')),
    {target: {...target}, best: {...scores, candidate: best.candidate, quality: best.quality}});
}

export function* finishScore(result, data, width, height, {target, effort, allowLossless, maxBytes}) {
  if (result.pass && result.bytes.length <= maxBytes) return scoreAnswer(result);
  if (!allowLossless) throw scoreRefusal(result, target, result.pass ? 'JXL_SIZE' : 'JXL_TARGET',
    result.pass ? 'over maxBytes' : 'missed target (allowLossless: false)');
  const exact = effortJob(data, width, height, {quality: 100, effort}, false, undefined, undefined, undefined, EXACT_LADDER);
  try {
    let step, reply;
    while (!(step = guard(() => exact.next(reply))).done) {
      const value = step.value;
      if (value?.capture) reply = yield value;
      else { reply = undefined; if (!value?.split && !value?.gpu) yield 0.95 + 0.05 * value; }
    }
    const bytes = answer(step.value);
    if (bytes.length > maxBytes) throw scoreRefusal(result, target, 'JXL_SIZE', 'lossless: over maxBytes');
    return scoreAnswer({bytes, quality: 100, candidate: 'lossless', pass: true, ssimulacra2: 100});
  } finally { exact.return(); }
}

export function* encodeToScoreSteps(data, width, height, options) {
  checkSignal(options?.signal);
  const settings = admitScore(data, width, height, options), {target, effort, candidates} = settings;
  if ((typeof __RAPIER_JXL_EFFORT_TEN__ === 'undefined' || __RAPIER_JXL_EFFORT_TEN__ === true) && effort === 10) {
    const nine = yield* encodeToScoreSteps(data, width, height, {...options, effort: 9});
    if (!nine?.pass || nine.quality === 100) return nine;
    const raised = target.ssimulacra2 !== undefined && Number.isFinite(nine.ssimulacra2) ? {...target, ssimulacra2: Math.max(target.ssimulacra2, nine.ssimulacra2)} : target;
    const ten = yield* encodeToScoreSteps(data, width, height, {...options, effort: 9, target: raised, _writerEffort: 10});
    return ten?.pass && ten.bytes.length < nine.bytes.length ? ten : nine;
  }
  const {memory, plan} = scoreMemory(data, width, height, options, target.ssimulacra2 !== undefined);
  let whole = null, steps = null;
  try {
    const shown = options?.shownBound && target.ssimulacra2 !== undefined;
    const nativeBand = (linear, from, count, out, at, y) => out.set(nativeRGBA(
      linear.map(plane => plane.subarray(from, from + count)), width, count / width, {y}), at * 4);
    function* shownOutputs(image) {
      const made = bandedOutputs(image, 256, nativeBand);
      yield {kind: 'package', rgba: made.package};
      yield {kind: 'native', rgba: made.native};
    }
    whole = cpuMeasure(data, width, height, {cacheBytes: plan.cacheBytes, ...(shown && {native: true, rgbaOutputs: shownOutputs})});
    const measure = (image, want) => {
      const out = exactScores(whole, {rgba: data}, width, height, image, want, plan);
      if (options?.stats) {
        options.stats.cpuProbes = (options.stats.cpuProbes ?? 0) + 1;
        options.stats.metricCacheBytes = Math.max(options.stats.metricCacheBytes ?? 0, whole.cacheBytes ?? 0);
        options.stats.metricReferenceBytes = Math.max(options.stats.metricReferenceBytes ?? 0, whole.referenceBytes ?? 0);
      }
      if (shown && want?.ssimulacra2 && Number.isFinite(out?.ssimulacra2))
        return {...out, ssimulacra2: out.ssimulacra2 - explicitShownMargin(out.ssimulacra2, width, height)};
      return out;
    };
    steps = scoreSteps(prepareV6(data, width, height, {}, memory), target, {candidates, effort: options?._writerEffort ?? effort, exactSize: true});
    let step, reply, n = 0;
    while (!(step = steps.next(reply)).done) {
      checkSignal(options?.signal);
      reply = step.value?.measure ? measure(step.value.measure, step.value.want) : undefined;
      if (step.value?.measure) yield Math.min(0.95, ++n / 30);
    }
    steps.return(); whole.destroy?.(); reply = undefined; steps = whole = null;
    return yield* finishScore(step.value, data, width, height, settings);
  } finally { steps?.return(); whole?.destroy?.(); }
}
