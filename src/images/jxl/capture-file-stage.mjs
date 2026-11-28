// SPDX-License-Identifier: MIT
import {stage} from './step-journal.mjs';
import {captureExact, markCaptureExact} from './capture-codec.mjs';

export function* fileStage(name, steps, file, admission, whole = false) {
  const made = yield* stage(name, function* () {
    const value = yield* steps(), bytes = file(value);
    return {value, exact: !!bytes && captureExact(bytes), passed: bytes && admission ? admission.accepts(bytes) : null,
      measured: bytes && admission ? admission.scored?.(bytes) ?? admission.measurements(bytes) : null,
      ...(bytes && admission?.notesOf && {notes: admission.notesOf(bytes)})};
  }, undefined, whole);
  const bytes = file(made.value);
  if (bytes && made.exact && !captureExact(bytes)) markCaptureExact(bytes);
  if (bytes && made.notes) admission.restore(bytes, made.notes);
  if (bytes && admission && made.passed !== null && (made.passed !== admission.accepts(bytes) || made.measured?.length && !admission.scored?.(bytes)?.length))
    admission.record(bytes, made.passed, made.measured);
  return made.value;
}
