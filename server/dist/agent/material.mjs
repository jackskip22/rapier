// A material result supplies pixels, never source-edit or human authority. SPDX-License-Identifier: AGPL-3.0-only.
import {sha256} from '../kit/ledger/hash.mjs';
import {canonicalJSON} from '../kit/ledger/data.mjs';
import {visualDrawingIdentity, sameVisualDrawing} from './visual.mjs';
import {admitWaterPigment} from '../draw/water-data.mjs';

export const MATERIAL_LIMITS = Object.freeze({bytes: 24 * 1024 * 1024, sampleBytes: 4096, lifetimeMs: 60000});
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const size = value => encoder.encode(JSON.stringify(value)).byteLength;
const refused = reason => ({outcome: 'refused', reason});
const clone = value => JSON.parse(JSON.stringify(value));

export function materialRequest(state, task, payload, drawing = null) {
  if (!['paint', 'replay', 'sample'].includes(task) || !object(payload)) throw new TypeError('material_request_invalid');
  const kept = clone(payload);
  if (size(kept) > MATERIAL_LIMITS.bytes) throw Object.assign(new Error('The material request is too large.'), {code: 'material_too_large'});
  const binding = {kind: 'material', task, documentId: state.documentId, revision: state.revision,
    sourceSha256: sha256(state.text), drawing: drawing == null ? null : visualDrawingIdentity(drawing)};
  if (drawing != null && !binding.drawing) throw new TypeError('material_request_invalid');
  // A contribution is minted on the first preparation. Re-entering the kernel reuses its
  // prepared result; the operation's position distinguishes otherwise identical new layers.
  const {contribution, ...input} = kept;
  return {...binding, job: sha256(canonicalJSON({...binding, payload: input})), payload: kept};
}

export function materialDescription(request) {
  const {kind, task, documentId, revision, sourceSha256, drawing, job} = request;
  return {kind, task, documentId, revision, sourceSha256, drawing, job};
}

export function materialMatches(request, state, drawing = null) {
  return request?.kind === 'material' && state?.documentId === request.documentId && state.revision === request.revision &&
    typeof state.text === 'string' && sha256(state.text) === request.sourceSha256 && sameVisualDrawing(request.drawing, drawing);
}

export function admitMaterialResult(request, fact) {
  if (!object(fact) || fact.kind !== 'material' || fact.documentId !== request.documentId ||
      fact.revision !== request.revision || fact.job !== request.job) return refused('material_result_mismatch');
  if (fact.outcome !== 'ok') return refused(fact.outcome === 'refused' && typeof fact.reason === 'string' &&
    /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(fact.reason) ? fact.reason : 'material_unavailable');
  if (fact.value === null && request.task === 'paint') return refused('paint_strokes_invalid');
  if (fact.value === null && request.task === 'replay') return refused('paint_replay_unavailable');
  if (!object(fact.value) || size(fact.value) > MATERIAL_LIMITS.bytes) return refused('material_result_invalid');
  if (request.task === 'sample') {
    const value = fact.value;
    const water = request.payload.shape?.paint?.mode === 'water';
    const pigment = !water ? null : admitWaterPigment(Object.fromEntries(['coefficients', 'granulation', 'staining', 'source']
      .filter(key => value[key] != null).map(key => [key, value[key]])));
    if (size(value) > MATERIAL_LIMITS.sampleBytes || water && !pigment || !Array.isArray(value.rgba) || value.rgba.length !== 4 ||
        !value.rgba.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255) ||
        typeof value.colour !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value.colour)) return refused('material_result_invalid');
    return {outcome: 'ok', value: {...(water ? {...pigment, pigment: clone(pigment)} : {}), rgba: value.rgba.slice(), colour: value.colour}};
  }
  const value = fact.value, target = request.task === 'replay' ? request.payload.shape : request.payload.target;
  const water = (request.task === 'replay' ? target?.paint?.mode : request.payload.mode) === 'water';
  if (value.recognized !== 'paint' || !object(value.geom) || !object(value.paint) || (water ? value.paint.mode !== 'water' : value.paint.mode != null && value.paint.mode !== 'paint') ||
      typeof value.raster !== 'string' || !/^data:image\/(?:png|jxl);base64,/.test(value.raster) ||
      (target && value.id !== target.id)) return refused('material_result_invalid');
  // Only the painter-owned fields may change. An editor response cannot replace labels,
  // locks, identifiers or any other authored field of the inspected target.
  return {outcome: 'ok', value: {...(target ? clone(target) : {}), recognized: 'paint',
    geom: clone(value.geom), raster: value.raster, paint: clone(value.paint)}};
}
