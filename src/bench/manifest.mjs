// SPDX-License-Identifier: AGPL-3.0-only
import {DOCUMENT_FIXTURES} from './fixtures.mjs';
import {GRAPHICS_FIXTURES} from './graphics-fixtures.mjs';

function freeze(value) {
 if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
 return value;
}
export const METRIC_DEFINITIONS = freeze({
 aggregation: {median: 'Middle sample; average of the middle pair for even n.', p95: 'Nearest rank: sorted[ceil(0.95*n)-1]. With three repetitions p95 is the maximum, not a tail estimate.',
  missing: 'Unavailable observations are retained with reasons and excluded from numeric statistics. n counts observed numbers. Raw repetitions are retained.'},
 durationMs: {unit: 'ms', definition: 'Elapsed monotonic wall time of the run boundary in parameters.scope; fixture preparation is excluded unless stated.'},
 longestTaskMs: {unit: 'ms', definition: 'Longest PerformanceLongTaskTiming duration overlapping the measured interval. Zero means the supported observer saw no task of at least 50 ms; not all-thread or worker blocking.'},
 droppedFrames: {unit: 'estimated frames', definition: 'Estimated missed page animation-frame opportunities against a fixed 60 Hz reference: sum(max(0, floor(deltaMs/(1000/60))-1)) within the measured execute interval. Not compositor or physical-display dropped frames.'},
 realmReadyMs: {unit: 'ms', definition: 'Parent iframe attachment to child ready, including benchmark scaffolding inflation and editor initialization. Separate from editor-start durationMs.'},
 observedRafIntervalMs: {unit: 'ms', definition: 'Mean observed page animation-frame interval inside the measured execute window.'},
 heapBytes: {unit: 'bytes', definition: 'Browser-reported used JavaScript heap at the end of a repetition. Does not include all process, worker, WASM or GPU memory.'},
 ownerCompletionMs: {unit: 'ms', definition: 'Document operation owner elapsed time before its two-frame settle.'},
 domTwoFramesMs: {unit: 'ms', definition: 'Document operation owner plus DOM update and two animation frames; no display scanout observation.'},
 trustedKeydownToScreenMs: {unit: 'ms', definition: 'Unavailable for scripted input; a trusted hardware event and physical display are not observed.'},
 osClipboardWriteMs: {unit: 'ms', definition: 'Unavailable when prepared formats are captured in memory without writing the OS clipboard.'},
 durableFileSaveMs: {unit: 'ms', definition: 'Unavailable when the serialized Blob stays in memory without a filesystem write.'},
 pageFps: {unit: 'frames/s', definition: 'Page requestAnimationFrame cadence during the Water or Paint measured execution interval.'},
 presentedFps: {unit: 'frames/s', definition: 'Water presentation counter cadence; not a physical-display measurement.'},
 workerMs: {unit: 'ms', definition: 'Water worker busy-time delta divided by presented-frame delta from the production statistics owner; not individual step latency.'},
 inputDelayMedianMs: {unit: 'ms', definition: 'Median observed pointer-sample dispatch delay after the fixed scheduled arrival time.'},
 inputDelayP95Ms: {unit: 'ms', definition: 'Nearest-rank p95 of observed pointer-sample dispatch delay after its fixed scheduled arrival time.'},
 inputLateSamples: {unit: 'samples', definition: 'Delivered pointer samples whose scheduling delay exceeded one fixed recipe interval.'},
 inputSamples: {unit: 'samples', definition: 'Pointer samples actually delivered through the product input owner.'},
 openOwnerMs: {unit: 'ms', definition: 'Production document load owner wall time for the three-painting fixture.'},
 readableTwoFramesMs: {unit: 'ms', definition: 'Three-painting document load plus two animation frames; not display scanout time.'},
 picturesReadyMs: {unit: 'ms', definition: 'Three-painting document load until all native JPEG XL image decodes are ready.'},
 picturesReady: {unit: 'pictures', definition: 'Paintings whose native image decode completed.'},
 decodeOwnerMs: {unit: 'ms', definition: 'Native JPEG XL decoder and straight-channel readback wall time.'},
 encodeOwnerMs: {unit: 'ms', definition: 'Production effort-7 encoder wall time.'},
 saveOwnerMs: {unit: 'ms', definition: 'Painting encoder or recompression-and-verification wall time; no durable document save.'},
 inputBytes: {unit: 'bytes', definition: 'Encoded input stream byte count.'},
 outputBytes: {unit: 'bytes', definition: 'Encoded output stream byte count.'},
 paperBakeMs: {unit: 'ms', definition: 'Water surface creation, shader compilation and paper bake owner wall time.'},
 reopenOwnerMs: {unit: 'ms', definition: 'Water reopen owner wall time to the first-dab-ready boundary described by the run.'},
 strokeOwnerMs: {unit: 'ms', definition: 'Paint scripted pointer replay owner wall time.'},
 sheetPixels: {unit: 'pixels', definition: 'Water output sheet width multiplied by height.'},
 simulationPixels: {unit: 'pixels', definition: 'Water simulation width multiplied by height.'},
 gpuTimestampBuffers: {unit: 'command buffers', definition: 'Completed WebGPU command-buffer timestamp readings in the measured interval.'},
 gpuTimestampSkipped: {unit: 'command buffers', definition: 'WebGPU command buffers without an available timestamp readback slot.'},
 gpuQueueMs: {unit: 'ms', definition: 'Mean WebGPU queue submission to onSubmittedWorkDone completion. Includes scheduling and queue waits; not timestamp-query GPU time.'},
 observedRafCallbacks: {unit: 'callbacks', definition: 'Animation callbacks observed inside the measured execute window.'},
 gpuMs: {unit: 'ms', definition: 'Mean completed command-buffer WebGPU timestamp-query duration when supported. Never inferred from CPU time.'},
});
const operations = ['open', 'type-start', 'type-middle', 'type-end', 'search', 'copy-formatted', 'save'];
const scopes = {
 open: 'rapierLoad owner through its settled document projection. Excludes file selection and reading source bytes.',
 'type-start': 'Scripted source textarea beforeinput/input owner at the start, DOM update and two animation frames. Not trusted hardware keydown-to-screen latency.',
 'type-middle': 'Scripted source textarea beforeinput/input owner at the middle, DOM update and two animation frames. Not trusted hardware keydown-to-screen latency.',
 'type-end': 'Scripted source textarea beforeinput/input owner at the end, DOM update and two animation frames. Not trusted hardware keydown-to-screen latency.',
 search: 'Production source search owner over the fixed rare token.',
 'copy-formatted': 'Production formatted-copy preparation captured before writing the OS clipboard.',
 save: 'Production save serialization and recovery to an in-memory transient host; no durable device save is claimed.',
};
const documentRuns = DOCUMENT_FIXTURES.flatMap(fixture => operations.map(operation => ({
 id: 'document.' + fixture.id + '.' + operation, kind: 'document', operation, fixture: fixture.id, realmPolicy: 'per-run',
 parameters: {scope: scopes[operation] + ' Reported duration includes two animation frames after owner completion.', ...(operation === 'search' ? {query: fixture.rare} : {}), ...(operation.startsWith('type-') ? {insertion: 'x', positionRatio: operation === 'type-start' ? 0 : operation === 'type-middle' ? .5 : 1} : {})},
 calibration: {domain: operation.startsWith('type-') ? 'main-thread' : 'mixed', factorEligible: operation.startsWith('type-'), durationMatchEligible: true},
})));
const graphicsRuns = [
 ['paintings.open-three', 'painting', 'open-three', 'water-three-v1', 'Open the built-in three-painting document through the production document owner.'],
 ['painting.save-fast', 'painting', 'save-fast', 'water-pixels-v1', 'Painting lossless encoder before durable document insertion.'],
 ['painting.save-effort7', 'painting', 'save-effort7', 'water-pixels-v1', 'Idle painting effort-7 encoder and exact-channel verifier before document replacement.'],
 ['jxl.decode', 'codec', 'decode', 'water-three-v1', 'Decode the built-in JPEG XL fixture through the browser decoder.'],
 ['jxl.encode-effort7', 'codec', 'encode-effort7', 'water-pixels-v1', 'Encode the fixed RGBA input with the production JPEG XL encoder at effort 7.'],
 ...['filtered', 'unfiltered'].flatMap(shaderPath => [
  ['water.' + shaderPath + '.paper-bake', 'water', 'paper-bake', 'water-video-v1', 'Create the production Water simulation and complete its paper bake.', shaderPath],
  ['water.' + shaderPath + '.replay', 'water', 'replay', 'water-video-v1', 'Replay the fixed six-stroke Water gesture script on the real WebGPU device, then synchronize the surface, settle two animation frames and read statistics. Paper bake is prepared outside this interval.', shaderPath],
  ['water.' + shaderPath + '.reopen', 'water', 'reopen', 'water-video-v1', 'Prepare the fixed wet six-stroke session, select away, then reopen Water and issue pointer-down through the production checkpoint and wet-material replay to first-dab-ready with GPU surface sync. Reported duration additionally includes final surface sync, two animation frames and statistics read. Preparation and the final rollback are excluded.', shaderPath],
 ]),
 ['paint.dieterle-60hz', 'paint', 'dieterle-60hz', 'paint-dieterle-v1', 'Replay the fixed Dieterle brush stroke with scheduled 60 Hz input, flush the painted revision and settle two animation frames. Actual delivered cadence is measured, not assumed.'],
].map(([id, kind, operation, fixture, scope, shaderPath]) => ({id, kind, operation, fixture, realmPolicy: 'per-repetition',
 parameters: {scope, ...(shaderPath ? {shaderPath} : {}), ...(id.includes('effort7') ? {effort: 7} : {})},
 calibration: {domain: kind === 'water' ? 'gpu' : kind === 'painting' && operation === 'open-three' ? 'mixed' : 'worker', factorEligible: false},
}));
const startRuns = ['cold', 'warm'].map(operation => ({id: 'start.' + operation, kind: 'start', operation, fixture: 'editor-empty-v1', realmPolicy: operation === 'warm' ? 'primed-repetition' : 'per-repetition',
 parameters: {scope: operation === 'cold' ? 'Child editor initialization boundary to empty-editor ready in a fresh isolated JavaScript realm from already loaded bytes, after benchmark scaffolding inflation. Not OS startup, cleared code caches or a network cold load.' : 'Child editor initialization boundary to empty-editor ready in a fresh isolated JavaScript realm, after benchmark scaffolding inflation and immediately preceded by an unmeasured boot from the same bytes. Not a same-realm restart or a network reload.'},
 calibration: {domain: 'mixed', factorEligible: false},
}));
export const BENCH_MANIFEST = freeze({
 schema: 1, id: 'rapier-phone-v1', sha256: "90e3d2f0770bd32b3bead81f29269a5e4d41349826322ae31b9435929e9107fc", repetitions: 3,
 fixtures: [...DOCUMENT_FIXTURES, ...GRAPHICS_FIXTURES, {id: 'editor-empty-v1', bytes: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', generator: 'empty-source-v1'}],
 runs: [...documentRuns, ...graphicsRuns, ...startRuns], metrics: METRIC_DEFINITIONS,
});
