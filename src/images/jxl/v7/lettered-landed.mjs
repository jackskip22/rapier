// SPDX-License-Identifier: MIT
import {photoTextLayersSteps} from '../photo-text-layers.mjs';
import {gradientPageLayers} from '../capture-gradient-page.mjs';
import {searchQuality} from '../photo-region-search.mjs';
import {qualitySteps} from '../photo-quality-search.mjs';
import {regionPhotoFrameSteps} from '../photo-rgb.mjs';
import {SHARED_PHOTO_SEARCH as search} from '../photo-plane-measured.mjs';
import {measuredLook} from '../photo-quality-table.mjs';
import {CAPTURE_TOOLS_COMPLETE} from '../capture-ans.mjs';
import {stage} from '../step-journal.mjs';
import {spannedSteps} from '../photo-measured-steps.mjs';

const PROBES = 12;

export function* landedLetteredSteps({data, width, height}, found, codec, intent, signal) {
  const floor = measuredLook(intent);
  const grad = gradientPageLayers(data, width, height, intent, codec.effort, CAPTURE_TOOLS_COMPLETE, signal,
    {measured: true, libjxl: true, found, targetFloor: floor});
  if (grad) {
    return {bytes: grad.bytes, measurements: [{metric: 'ssimulacra2', score: grad.score, floor: grad.floor, domain: 'encoder-reconstruction'}]};
  }
  const mask = found.mask, rect = {x: 0, y: 0, width, height};
  const passes = Math.max(1, codec.effort - 5);
  let measurements = [];
  const frame = (filled, quality, effort, from, span) => stage('lettered-frame', function* () {
    let passed = false, measured = [];
    const photoAdmission = {record(bytes, ok, m) { passed = ok; measured = m ?? []; return bytes; }};
    const bytes = yield* spannedSteps(regionPhotoFrameSteps((top, count) => filled.subarray(top * width * 4, (top + count) * width * 4), width, height, {
      quality, colorSpace: 'srgb', placement: {alphaChannel: true}, effort, photoBlockEffort: effort,
      readingIntent: intent, readingLook: floor, readingArithmetic: 'libjxl', photoSearch: search, photoAdmission, signal,
      referenceRows: (top, count) => data.subarray(top * width * 4, (top + count) * width * 4),
      exactRows: (top, count) => mask.subarray(top * width, (top + count) * width),
      project: (rgba, top) => { for (let i = 0; i < rgba.length / 4; i++) if (mask[top * width + i]) rgba.set(data.subarray((top * width + i) * 4, (top * width + i) * 4 + 4), i * 4); }}),
      from, from + span);
    return {bytes, quality, passed, measurements: measured};
  });
  const base = function* (filled) {
    const start = searchQuality(filled, width, rect, codec.quality, intent, 0, 0, [], 'srgb', codec.quality, [], {step: 1});
    let best = null;
    for (let effort = 6; effort <= codec.effort; effort++) {
      const passFrom = (effort - 6) / passes, passSpan = 1 / (passes * PROBES);
      const target = best?.measurements[0].score;
      const landing = qualitySteps(function* (quality) { return {quality}; }, {ssimulacra2: 0},
        {start: best?.quality ?? start, low: 1, high: 99, probes: PROBES});
      let next, score, probe = 0;
      try {
        while (!(next = landing.next(score)).done) {
          const candidate = yield* frame(filled, next.value.measure.quality, effort, passFrom + Math.min(PROBES - 1, probe++) * passSpan, passSpan);
          const readings = candidate.measurements;
          if (!readings.length || readings.some(m => !Number.isFinite(m.score) || !Number.isFinite(m.floor))) break;
          score = {ssimulacra2: Math.min(...readings.map(m => m.score - Math.max(m.floor, target ?? m.floor)))};
          if (candidate.passed && score.ssimulacra2 >= 0 && (!best || candidate.bytes.length < best.bytes.length)) best = candidate;
        }
      } finally { landing.return(); }
    }
    if (!best) return null;
    measurements = best.measurements;
    return best.bytes;
  };
  const bytes = yield* photoTextLayersSteps(data, width, height, mask, codec.quality, codec.effort, CAPTURE_TOOLS_COMPLETE, base);
  return bytes && {bytes, measurements};
}
