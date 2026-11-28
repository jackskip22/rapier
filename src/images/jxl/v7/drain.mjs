// SPDX-License-Identifier: MIT
import {check, abortable} from './primitives.mjs';
import {captureRefused} from '../fault.mjs';
import {captureAnswer, compileCaptureKernels, captureBusy} from '../capture-codec.mjs';
import {screenPhotoSteps} from '../screen-photo-mixed.mjs';
import {exclusive, exclusiveActive, turn, gpuReadPending} from '../turn.mjs';
import {journalNext} from '../step-journal.mjs';
import {deferRetirement} from '../call-scope.mjs';

export async function drainCore(iterator, hooks = {}, gpuAnswer, makeQueue, setTrials) {
  const {signal, onProgress, journal} = hooks;
  check(signal);
  let last = 0, told = 0, reply, lastTurn = performance.now(), failed = false;
  let gpu = gpuAnswer && makeQueue ? makeQueue(gpuAnswer) : null;
  try {
    const warm = gpuAnswer?.warm?.();
    if (warm !== undefined) await abortable(warm, signal);
    for (;;) {
      while (gpuReadPending) await abortable(gpuReadPending, signal);
      check(signal);
      setTrials?.(gpu?.trials, gpu?.generation, gpu?.phoneRequired);
      const step = await (journal ? journalNext(iterator, reply, journal) : iterator.next(reply));
      const asked = !step.done ? step.value?.await : undefined;
      const pending = typeof asked?.then === 'function' && makeQueue ? (gpu ??= makeQueue(() => null)).watch(asked) : asked;
      check(signal);
      if (step.done) { onProgress?.(1); check(signal); return step.value ?? iterator.bytes; }
      if (journal && (step.value?.unit !== undefined || step.value?.unitDone !== undefined || step.value?.unitFailed !== undefined)) { reply = await journal(step.value); continue; }
      if (step.value?.gpu) { const answer = gpu ? gpu(step.value.gpu) : null; reply = step.value.later ? answer : await abortable(answer, signal); continue; }
      if (asked !== undefined) { reply = await abortable(pending, signal); continue; }
      if (step.value?.capture) { reply = await captureAnswer(step.value.capture, signal, steps => drainCore(steps, {signal, journal}, undefined, makeQueue, setTrials)); continue; }
      if (step.value?.screenPhoto) {
        try {
          await compileCaptureKernels();
          reply = await exclusive(() => drainCore(screenPhotoSteps(step.value.screenPhoto), {
            ...hooks, onProgress: fraction => onProgress?.(fraction * .95),
          }, undefined, makeQueue, setTrials), signal);
        } catch (error) {
          check(signal);
          if (error?.name === 'AbortError') throw error;
          if (!captureRefused(error)) throw error;
          reply = null;
        }
        continue;
      }
      if (step.value?.split) { reply = hooks.split ? await hooks.split(step.value.split) : undefined; continue; }
      reply = undefined;
      if (typeof step.value === 'number' && Number.isFinite(step.value)) last = Math.max(last, Math.min(0.999999, step.value));
      const due = performance.now() - lastTurn >= 8;
      if (last > told && (due || !told)) { told = last; onProgress?.(last); check(signal); }
      const waiting = step.value === 0 && (captureBusy() || exclusiveActive());
      if (due || waiting) {
        if (signal || waiting) await turn();
        lastTurn = performance.now();
      }
    }
  } catch (reason) { failed = true; throw reason; }
  finally {
    try { await deferRetirement(gpu?.end(), () => iterator.return?.()); } catch (reason) { if (!failed) throw reason; }
  }
}

export const drainPlain = (iterator, hooks = {}) => drainCore(iterator, hooks);
