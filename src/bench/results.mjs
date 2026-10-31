// SPDX-License-Identifier: AGPL-3.0-only
import {BENCH_MANIFEST, METRIC_DEFINITIONS} from './manifest.mjs';

export const RESULT_HEADER = 'RAPIER-BENCH/1';
export const RESULT_SCHEMA = 1;
export const RUN_STATES = Object.freeze(['completed', 'stopped', 'unsupported', 'error']);
const BASE_METRICS = ['durationMs', 'longestTaskMs', 'droppedFrames', 'heapBytes'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError('Invalid benchmark result: ' + message); };
const same = (a, b) => canonical(a) === canonical(b);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function canonical(value) {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
 return JSON.stringify(value);
}
function jsonValue(value, path = 'value') {
 if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
 if (typeof value === 'number' && Number.isFinite(value)) return;
 if (Array.isArray(value)) { for (const item of value) jsonValue(item, path); return; }
 if (record(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
  for (const [key, item] of Object.entries(value)) jsonValue(item, path + '.' + key);
  return;
 }
 fail(path + ' must contain only JSON values');
}
function clone(value) { jsonValue(value); return JSON.parse(JSON.stringify(value)); }
function keys(value, required, optional = []) {
 if (!record(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('record fields');
}
export function unavailable(reason) {
 if (!nonempty(reason)) fail('unavailable metric requires a reason');
 return {unavailable: reason};
}
function metric(value, name) {
 if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return;
 if (record(value) && Object.keys(value).length === 1 && nonempty(value.unavailable)) return;
 fail(name + ' must be a nonnegative finite number or an unavailable reason');
}
export function validateSample(sample) {
 keys(sample, BASE_METRICS, ['extra', 'details']);
 for (const name of BASE_METRICS) metric(sample[name], name);
 if (sample.extra !== undefined) {
  if (!record(sample.extra)) fail('extra metrics');
  for (const [name, value] of Object.entries(sample.extra)) {
   if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || BASE_METRICS.includes(name)) fail('extra metric name');
   metric(value, name);
  }
 }
 if (sample.details !== undefined) { if (!record(sample.details)) fail('sample details'); jsonValue(sample.details); }
}
function summarizeMetric(values) {
 const numbers = values.filter(value => typeof value === 'number').sort((a, b) => a - b);
 const missing = values.flatMap((value, sample) => typeof value === 'number' ? [] : [{sample: sample + 1, reason: value.unavailable}]);
 const n = numbers.length, left = numbers[Math.floor((n - 1) / 2)], right = numbers[Math.ceil((n - 1) / 2)];
 return {n, median: n ? left + (right - left) / 2 : null,
  p95: n ? numbers[Math.ceil(n * .95) - 1] : null, min: n ? numbers[0] : null, max: n ? numbers[n - 1] : null,
  unavailable: missing};
}
export function summarizeSamples(samples) {
 if (!Array.isArray(samples)) fail('samples must be an array');
 samples.forEach(validateSample);
 const summary = Object.fromEntries(BASE_METRICS.map(name => [name, summarizeMetric(samples.map(sample => sample[name]))]));
 const extraNames = [...new Set(samples.flatMap(sample => Object.keys(sample.extra || {})))].sort();
 if (extraNames.length) summary.extra = Object.fromEntries(extraNames.map(name => [name,
  summarizeMetric(samples.map(sample => sample.extra?.[name] ?? unavailable('Not recorded for this repetition.')))]));
 return summary;
}
function validateIdentity(identity) {
 if (!record(identity)) fail('identity');
 for (const name of ['release', 'device', 'browser', 'gpu']) {
  if (!record(identity[name]) || !Object.keys(identity[name]).length) fail('identity.' + name + ' must be recorded or explicitly unavailable');
 }
 jsonValue(identity, 'identity');
}
function timestamp(value, name) {
 if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(name + ' must be an ISO date');
}
function normalizeRun(input, expected) {
 keys(input, ['id', 'state', 'samples'], ['reason', 'details', 'summary']);
 if (input.id !== expected?.id) fail('run order or identity: ' + input.id);
 if (!RUN_STATES.includes(input.state)) fail('run state');
 if (input.state !== 'completed' && !nonempty(input.reason)) fail('unfinished run requires a reason');
 if (input.reason !== undefined && !nonempty(input.reason)) fail('run reason');
 if (!Array.isArray(input.samples) || input.samples.length > BENCH_MANIFEST.repetitions) fail('repetition count');
 if (input.state === 'completed' && input.samples.length !== BENCH_MANIFEST.repetitions) fail('completed run lacks repetitions');
 if (input.state === 'unsupported' && input.samples.length) fail('unsupported run cannot contain measured repetitions');
 const summary = summarizeSamples(input.samples);
 if (input.summary !== undefined && !same(input.summary, summary)) fail('summary does not match raw samples');
 if (input.details !== undefined) { if (!record(input.details)) fail('run details'); jsonValue(input.details); }
 return {id: input.id, state: input.state, ...(input.reason === undefined ? {} : {reason: input.reason}),
  ...(input.details === undefined ? {} : {details: clone(input.details)}), samples: clone(input.samples), summary};
}
export function createResult(identity, {startedAt = new Date().toISOString()} = {}) {
 validateIdentity(identity); timestamp(startedAt, 'startedAt');
 return {schema: RESULT_SCHEMA, benchmark: {id: BENCH_MANIFEST.id, sha256: BENCH_MANIFEST.sha256},
  identity: clone(identity), startedAt, fixtures: clone(BENCH_MANIFEST.fixtures), metrics: clone(METRIC_DEFINITIONS),
  repetitions: BENCH_MANIFEST.repetitions, runs: [], state: 'running'};
}
export function appendRun(result, input) {
 if (result.state !== 'running') fail('result is already finished');
 const run = normalizeRun(input, BENCH_MANIFEST.runs[result.runs.length]);
 result.runs.push(run);
 return run;
}
export function finishResult(result, state = 'completed', {reason, finishedAt = new Date().toISOString()} = {}) {
 if (result.state !== 'running') fail('result is already finished');
 if (!RUN_STATES.includes(state)) fail('final state');
 if (state !== 'completed' && !nonempty(reason)) fail('unfinished result requires a reason');
 timestamp(finishedAt, 'finishedAt');
 if (Date.parse(finishedAt) < Date.parse(result.startedAt)) fail('finish precedes start');
 if (state === 'completed' && result.runs.length !== BENCH_MANIFEST.runs.length) fail('completed result lacks runs');
 while (result.runs.length < BENCH_MANIFEST.runs.length) appendRun(result, {
  id: BENCH_MANIFEST.runs[result.runs.length].id,
  state: state === 'unsupported' ? 'unsupported' : 'stopped', reason, samples: [],
 });
 result.state = state;
 result.finishedAt = finishedAt;
 if (reason !== undefined) result.reason = reason;
 return result;
}
export function validateResult(result) {
 keys(result, ['schema', 'benchmark', 'identity', 'startedAt', 'finishedAt', 'fixtures', 'metrics', 'repetitions', 'runs', 'state'], ['reason']);
 if (result.schema !== RESULT_SCHEMA || !same(result.benchmark, {id: BENCH_MANIFEST.id, sha256: BENCH_MANIFEST.sha256})) fail('benchmark/schema identity differs');
 if (!same(result.fixtures, BENCH_MANIFEST.fixtures)) fail('fixture identity differs');
 if (!same(result.metrics, METRIC_DEFINITIONS) || result.repetitions !== BENCH_MANIFEST.repetitions) fail('measurement contract differs');
 validateIdentity(result.identity); timestamp(result.startedAt, 'startedAt'); timestamp(result.finishedAt, 'finishedAt');
 if (Date.parse(result.finishedAt) < Date.parse(result.startedAt)) fail('finish precedes start');
 if (!RUN_STATES.includes(result.state)) fail('final state');
 if (result.state !== 'completed' && !nonempty(result.reason)) fail('unfinished result requires a reason');
 if (result.reason !== undefined && !nonempty(result.reason)) fail('result reason');
 if (!Array.isArray(result.runs) || result.runs.length !== BENCH_MANIFEST.runs.length) fail('result lacks run records');
 result.runs.forEach((run, index) => {
  if (!Object.hasOwn(run, 'summary')) fail('finished run lacks its raw-sample summary');
  normalizeRun(run, BENCH_MANIFEST.runs[index]);
 });
 if (result.state === 'completed' && result.runs.some(run => run.state === 'stopped')) fail('completed result includes stopped runs');
 if (result.state === 'unsupported' && result.runs.some(run => run.state !== 'unsupported')) fail('unsupported result includes executed runs');
 return result;
}
export function serializeResult(result) {
 validateResult(result);
 const {runs, state, reason, finishedAt, ...header} = result;
 return [RESULT_HEADER, JSON.stringify({type: 'identity', ...header}), ...runs.map(run => JSON.stringify({type: 'run', ...run})),
  JSON.stringify({type: 'end', state, finishedAt, ...(reason === undefined ? {} : {reason})})].join('\n');
}
export function parseResult(text) {
 if (typeof text !== 'string') fail('text');
 const lines = text.trim().split(/\r?\n/);
 if (lines.shift() !== RESULT_HEADER || lines.length < 2) fail('text header');
 let records;
 try { records = lines.map(line => JSON.parse(line)); } catch { fail('malformed JSON line'); }
 const header = records.shift(), footer = records.pop();
 if (!record(header) || header.type !== 'identity' || !record(footer) || footer.type !== 'end') fail('identity/end records');
 if (records.some(row => !record(row) || row.type !== 'run')) fail('run records');
 const {type: headerType, ...metadata} = header;
 const {type: footerType, ...ending} = footer;
 if (Object.keys(ending).some(key => !['state', 'finishedAt', 'reason'].includes(key))) fail('end fields');
 if (Object.hasOwn(metadata, 'runs') || Object.keys(ending).some(key => Object.hasOwn(metadata, key))) fail('overlapping text records');
 const result = {...metadata, runs: records.map(({type, ...run}) => run), ...ending};
 validateResult(result);
 return result;
}
