import {jsonChunks} from './json-record.mjs';

const omitted = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
const prepare = (value, key) => value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
function smallJson(value) {
  let chars = 0, fields = 0;
  const pending = [value], seen = new Set();
  while (pending.length) {
    const entry = pending.pop();
    if (typeof entry === 'string') chars += entry.length;
    else if (!entry || typeof entry !== 'object') chars += 24;
    else {
      if (seen.has(entry)) return false;
      seen.add(entry);
      const proto = Object.getPrototypeOf(entry);
      if (!Array.isArray(entry) && proto !== Object.prototype && proto !== null) return false;
      for (const key of Object.keys(entry)) {
        const field = Object.getOwnPropertyDescriptor(entry, key);
        if (!field || !Object.hasOwn(field, 'value') || key === 'toJSON') return false;
        chars += key.length + 4; pending.push(field.value);
        if (++fields > 512 || chars > 4096) return false;
      }
    }
    if (chars > 4096) return false;
  }
  return true;
}
function snapshotJson(value) {
  let estimate = 0;
  const active = new Set();
  const scalar = value => {
    if (typeof value === 'string') estimate += value.length;
    else if (typeof value === 'bigint') throw new TypeError('BigInt cannot be serialized as JSON');
    else estimate += 8;
    return value;
  };
  value = prepare(value, '');
  if (!value || typeof value !== 'object') return {value: scalar(value), estimate};
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    const text = JSON.stringify(value);
    return {value: text === undefined ? undefined : JSON.parse(text), estimate: text?.length || 0};
  }
  const container = value => Array.isArray(value) ? [] : {};
  const root = container(value), frames = [{source: value, target: root, index: 0,
    keys: Array.isArray(value) ? null : Object.keys(value)}];
  active.add(value);
  while (frames.length) {
    const frame = frames.at(-1), array = frame.keys === null;
    if (frame.index === (array ? frame.source.length : frame.keys.length)) {
      active.delete(frame.source); frames.pop(); continue;
    }
    const index = frame.index++;
    const key = array ? String(index) : frame.keys[index];
    let entry = prepare(frame.source[array ? index : key], key);
    if (omitted(entry)) { if (!array) continue; entry = null; }
    estimate += key.length + 4;
    const assign = child => {
      if (array) frame.target[index] = child;
      else if (key === '__proto__') Object.defineProperty(frame.target, key,
        {value: child, enumerable: true, writable: true, configurable: true});
      else frame.target[key] = child;
    };
    if (!entry || typeof entry !== 'object') { assign(scalar(entry)); continue; }
    const proto = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && proto !== Object.prototype && proto !== null) {
      const text = JSON.stringify(entry); estimate += text?.length || 0;
      if (text !== undefined) assign(JSON.parse(text));
      else if (array) assign(null);
      continue;
    }
    if (active.has(entry)) throw new TypeError('Converting circular structure to JSON');
    const child = container(entry); assign(child); active.add(entry);
    frames.push({source: entry, target: child, index: 0, keys: Array.isArray(entry) ? null : Object.keys(entry)});
  }
  return {value: root, estimate};
}

export function jsonBody(value) {
  if (smallJson(value)) return JSON.stringify(value);
  let snapshot = snapshotJson(value);
  if (snapshot.estimate <= 16384) return JSON.stringify(snapshot.value);
  let iterator = jsonChunks(snapshot.value, 8192), high = '';
  snapshot = null;
  const encoder = new TextEncoder();
  const release = () => { iterator?.return(); iterator = null; high = ''; };
  return new ReadableStream({
    pull(controller) {
      try {
        const next = iterator.next();
        if (next.done) {
          if (high) controller.enqueue(encoder.encode(high));
          release(); controller.close(); return;
        }
        let text = high + next.value; high = '';
        const last = text.charCodeAt(text.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) { high = text.slice(-1); text = text.slice(0, -1); }
        if (text) controller.enqueue(encoder.encode(text));
      } catch (error) { release(); controller.error(error); }
    },
    cancel() { release(); },
  }, {highWaterMark: 0});
}

export const jsonBodyInit = value => ({body: jsonBody(value), duplex: 'half'});
const jsonHeaders = headers => ({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', ...headers});
export const jsonResponse = (value, status = 200, headers = {}) => new Response(jsonBody(value), {status, headers: jsonHeaders(headers)});

const PREPARED = new WeakMap();
export function preparedJson(value) {
  PREPARED.set(value, new TextEncoder().encode(JSON.stringify(value)));
  return value;
}
function around(value, path) {
  if (!path.length) return ['', ''];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || 'toJSON' in value) return null;
  let before = '{', after = '', inside = false;
  for (const key of Object.keys(value)) {
    if (key === path[0]) {
      const inner = around(value[key], path.slice(1));
      if (!inner) return null;
      before += (before === '{' ? '' : ',') + JSON.stringify(key) + ':' + inner[0]; after = inner[1]; inside = true;
      continue;
    }
    const field = JSON.stringify(value[key]);
    if (field === undefined) continue;
    const text = JSON.stringify(key) + ':' + field;
    if (inside) after += ',' + text; else before += (before === '{' ? '' : ',') + text;
  }
  return inside ? [before, after + '}'] : null;
}
export function preparedJsonResponse(value, path, status = 200, headers = {}) {
  let held = value;
  for (const key of path) held = held?.[key];
  const bytes = held && typeof held === 'object' ? PREPARED.get(held) : undefined;
  const sides = bytes && around(value, path);
  if (!sides) return null;
  const encoder = new TextEncoder();
  const parts = [encoder.encode(sides[0]), bytes.slice(), encoder.encode(sides[1])];
  return new Response(new ReadableStream({pull(controller) {
    controller.enqueue(parts.shift());
    if (!parts.length) controller.close();
  }}, {highWaterMark: 0}), {status, headers: jsonHeaders(headers)});
}
