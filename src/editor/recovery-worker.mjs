// SPDX-License-Identifier: AGPL-3.0-only
import {createWorkerExecution} from '../shell/worker-execution.mjs';
import {prepareLedgerAsync, readLedger, historyEnvelope, textRoot} from '../kit/ledger/format.mjs';
import {jsonParts, plainPrototype} from '../kit/ledger/data.mjs';
import {_rapierRecoveryBomManifest, _rapierRecoveryStamp} from './recovery-policy.mjs';
import {recoveryHistoryDigest, recoveryHeaderIntegrity, recoveryHeaderMatches, recoveryBodyParts,
  recoveryRecord, readRecoveryBody, parseRecoveryBody} from './recovery-storage.mjs';
export {recoveryHistoryDigest, recoveryHeaderIntegrity, recoveryHeaderMatches, recoveryBodyParts,
  recoveryRecord, readRecoveryBody, parseRecoveryBody};

const abort = () => Object.assign(new Error('Canceled'), {name: 'AbortError'});
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const settled = new WeakSet();
function packet(value) {
  const strings = [], active = new Set();
  const pathOf = at => { const path = []; for (; at; at = at.up) path.unshift(at.key); return path; };
  const copy = (value, at) => {
    if (typeof value === 'function' || typeof value === 'symbol') throw new TypeError('Recovery needs plain data');
    if (typeof value === 'string' && value.length > 65536) { strings.push({path: pathOf(at), value}); return null; }
    if (value === null || typeof value !== 'object') return value;
    if (settled.has(value) && Object.isFrozen(value)) return value;
    if (active.has(value)) throw new TypeError('Recovery contains a cycle');
    if (!Array.isArray(value) && !plainPrototype(Object.getPrototypeOf(value))) throw new TypeError('Recovery needs plain data');
    active.add(value);
    const out = Array.isArray(value) ? new Array(value.length) : {}, descriptors = Object.getOwnPropertyDescriptors(value), long = strings.length;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue;
      const field = descriptors[key];
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !field.enumerable || !Object.hasOwn(field, 'value'))
        throw new TypeError('Recovery needs plain data');
      out[key] = copy(field.value, {up: at, key});
    }
    if (strings.length === long) settled.add(out);
    active.delete(value); return out;
  };
  return {value: copy(value, null), strings};
}
export function recoveryRow(...values) {
  if (values.some(value => typeof value !== 'number' && typeof value !== 'string')) throw new TypeError('Recovery needs plain data');
  const row = Object.freeze(values);
  settled.add(row);
  return row;
}
export function recoveryRows(rows) {
  const list = Object.freeze(Array.from(rows));
  if (!list.every(row => settled.has(row))) throw new TypeError('Recovery needs plain data');
  settled.add(list);
  return list;
}
function place(value, path, text) {
  if (!path.length) return text;
  let parent = value;
  for (const key of path.slice(0, -1)) parent = parent[key];
  parent[path.at(-1)] = text;
  return value;
}
function captured(value) {
  const packed = packet(value);
  let result = packed.value;
  for (const row of packed.strings) result = place(result, row.path, row.value);
  return freeze(result);
}
function receiver() {
  let value, path = null, text = '';
  return data => {
    if (data.operation === 'begin') value = data.value;
    else if (data.operation === 'string') { path = data.path; text = ''; }
    else if (data.operation === 'part') text += data.text;
    else if (data.operation === 'end-string') { value = place(value, path, text); text = ''; path = null; }
    return data.operation === 'finish' ? {value} : null;
  };
}
function* textParts(value) { for (let at = 0; at < value.length; at += 65536) yield value.slice(at, at + 65536); }
async function sendPacket(port, packed, current = () => true) {
  if (!current()) return;
  port.postMessage({operation: 'begin', value: packed.value});
  let turn = performance.now();
  for (const {path, value, parts} of packed.strings) {
    port.postMessage({operation: 'string', path});
    let text = '';
    for (const part of parts || textParts(value)) {
      if (!current()) return;
      text += part;
      if (text.length < 65536) continue;
      port.postMessage({operation: 'part', text}); text = '';
      if (performance.now() - turn >= 4) { await new Promise(resolve => setTimeout(resolve, 0)); turn = performance.now(); }
    }
    if (!current()) return;
    if (text) port.postMessage({operation: 'part', text});
    port.postMessage({operation: 'end-string'});
  }
  if (current()) port.postMessage({operation: 'finish'});
}
const integrityFromRoot = root => {
  const [chars, fnv, adler] = root.split(':');
  return {chars: Number(chars), fnv, adler};
};
const integrityOf = text => integrityFromRoot(textRoot(text));
async function integrityParts(parts, signal) {
  let chars = 0, fnv = 0x811c9dc5, a = 1, b = 0, turn = performance.now();
  for (const text of parts) {
    signal?.throwIfAborted();
    chars += text.length;
    for (let at = 0; at < text.length;) {
      const end = Math.min(text.length, at + 4096);
      for (; at < end; at++) { const code = text.charCodeAt(at); fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a; }
      a %= 65521; b %= 65521;
    }
    if (performance.now() - turn >= 4) { await new Promise(resolve => setTimeout(resolve, 0)); turn = performance.now(); }
  }
  signal?.throwIfAborted();
  return {chars, fnv: (fnv >>> 0).toString(36), adler: (((b << 16) | a) >>> 0).toString(36)};
}
async function preparation(core, state, signal) {
  signal?.throwIfAborted();
  if ((state.needLedger || state.undo) && !core.ledger) {
    if (core.input.carriedLedger) {
      core.ledger = readLedger(core.input.carriedLedger, core.input.text, core.input.metadata).ledger;
      core.integrity ||= await integrityParts(textParts(core.input.text), signal);
    } else {
      let turn = performance.now();
      const prepared = await prepareLedgerAsync(core.input, {signal, yield: () => {
        if (performance.now() - turn < 4) return;
        return new Promise(resolve => setTimeout(resolve, 0)).then(() => { turn = performance.now(); });
      }});
      core.ledger = prepared.ledger; core.integrity = integrityFromRoot(prepared.contentRoot);
      core.utf8Bytes = prepared.utf8Bytes;
    }
  }
  core.integrity ||= await integrityParts(textParts(core.input.text), signal);
  const ledger = state.needLedger ? core.ledger : null, integrity = core.integrity;
  const undo = state.undo ? {...state.undo, ledger: core.input.records} : null;
  if (undo) delete undo.integrity;
  const undoIntegrity = undo ? await integrityParts(jsonParts(undo), signal) : null;
  const historyDigest = undo ? recoveryHistoryDigest(historyEnvelope(core.ledger)) : null;
  const seenIntegrity = typeof state.seenText === 'string'
    ? state.seenText === core.input.text ? integrity : await integrityParts(textParts(state.seenText), signal) : null;
  const snapshot = state.snapshot ? {...state.snapshot, integrity,
    historyDigest: recoveryHistoryDigest(historyEnvelope(ledger)),
    bomIntegrity: integrityOf(_rapierRecoveryBomManifest({...state.snapshot, integrity})),
    sourceRootId: ledger?.head?.root, checkpointId: String(core.input.documentAuthority || 'document') + ':' +
      Number(core.input.revision || 0).toString(36) + ':' + String(ledger?.head?.root || '')} : null;
  if (snapshot && snapshot.sourceRootId === undefined) delete snapshot.sourceRootId;
  signal?.throwIfAborted();
  return {ledger, integrity, undoIntegrity, historyDigest, seenIntegrity, snapshotHeader: snapshot,
    encoded: null, parts: snapshot ? recoveryBodyParts(core.input.text, null, ledger) : null};
}
const databases = new Map();
function recoveryDatabase(idb, {name, version}) {
  if (databases.has(name)) return databases.get(name);
  const opening = new Promise((resolve, reject) => {
    const request = idb.open(name, version);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { try { db.close(); } catch (_) {} databases.delete(name); };
      resolve(db);
    };
    request.onerror = () => { databases.delete(name); reject(request.error || new Error('IndexedDB unavailable')); };
  });
  databases.set(name, opening);
  return opening;
}
function storeRecords(text, write, db, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(write.stores, 'readwrite', {durability: write.durability}); }
    catch (_) { tx = db.transaction(write.stores, 'readwrite'); }
    const cancel = () => { try { tx.abort(); } catch (_) {} };
    const finish = (error, value) => {
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(value);
    };
    signal?.addEventListener('abort', cancel, {once: true});
    const current = tx.objectStore('meta').get(write.docId);
    current.onsuccess = () => {
      if (write.base != null && _rapierRecoveryStamp(current.result) !== write.base) { finish(null, true); tx.abort(); return; }
      try {
        let body = null, bodyUndo = null;
        for (const row of write.records) {
          let value = row.value;
          if (row.text || Object.hasOwn(value, 'canonicalText')) {
            value = recoveryRecord(value, row.text ? text : value.canonicalText, value.undo || null, value.ledger || null,
              row.text && row.value.undo === bodyUndo ? body : null);
            if (row.text) { body = value.body; bodyUndo = row.value.undo; }
          }
          tx.objectStore(row.store).put(value);
        }
      } catch (error) { try { tx.abort(); } catch (_) {} finish(error); }
    };
    tx.oncomplete = () => finish(null, false);
    tx.onerror = tx.onabort = () => finish(signal?.aborted ? signal.reason : tx.error || new Error('IndexedDB transaction failed'));
  });
}
export function installRecoveryWorker(scope) {
  const receiving = new Map(), running = new Map(), revisions = new Map();
  scope.onmessage = ({data}) => {
    try {
      if (data.operation === 'cancel') { receiving.delete(data.id); running.get(data.id)?.abort(); return; }
      if (data.operation === 'release') { revisions.delete(data.revisionId); return; }
      if (data.operation === 'begin') receiving.set(data.id, receiver());
      const receive = receiving.get(data.id);
      if (!receive) return;
      const complete = receive(data);
      if (!complete) return;
      receiving.delete(data.id);
      const controller = new AbortController(); running.set(data.id, controller);
      const current = () => running.get(data.id) === controller && !controller.signal.aborted;
      const port = {postMessage: message => { if (current()) scope.postMessage({id: data.id, ...message}); }};
      void (async () => {
        const request = complete.value;
        let core = revisions.get(request.revisionId);
        if (!core) {
          if (!request.core) throw new Error('Recovery revision expired');
          let input = request.core;
          if (request.textChange) {
            const base = revisions.get(request.baseRevisionId)?.input;
            if (!base) throw Object.assign(new Error('Recovery base expired'), {code: 'recovery_base_expired'});
            const {start, removed, inserted} = request.textChange;
            if (base.documentAuthority !== input.documentAuthority || typeof base.text !== 'string' ||
                !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(removed) || removed < 0 ||
                start + removed > base.text.length || typeof inserted !== 'string' || input.text !== null)
              throw new Error('Recovery delta is invalid');
            input = {...input, text: base.text.slice(0, start) + inserted + base.text.slice(start + removed)};
          }
          core = {input, ledger: null, integrity: null};
        }
        if (request.write) {
          if (!scope.indexedDB) throw new Error('IndexedDB unavailable');
          const newer = await storeRecords(core.input.text, request.write, await recoveryDatabase(scope.indexedDB, request.write.db), controller.signal);
          await sendPacket(port, packet({newer}), current);
          if (current()) revisions.set(request.revisionId, core);
          return;
        }
        const state = request.state.seenCurrent ? {...request.state, seenText: core.input.text} : request.state;
        const result = await preparation(core, state, controller.signal);
        const {parts, ...value} = result;
        if (value.ledger && request.reuseLedger) { value.ledger = null; value.reusedLedger = true; }
        const packed = packet(value);
        if (parts) packed.strings.push({path: ['encoded'], parts});
        await sendPacket(port, packed, current);
        if (current()) revisions.set(request.revisionId, core);
      })().catch(error => port.postMessage({error: error.message, code: error.code, name: error.name}))
        .finally(() => { if (running.get(data.id) === controller) running.delete(data.id); });
    } catch (error) { receiving.delete(data.id); scope.postMessage({id: data.id, error: error.message, code: error.code, name: error.name}); }
  };
  scope.postMessage({ready: true});
  return () => { for (const job of running.values()) job.abort(); receiving.clear(); revisions.clear(); };
}

const prepared = new WeakMap(), captures = new WeakMap(), revisions = new WeakMap();
let revisionSequence = 0;
export function captureRecoveryRevision(input, baseToken = null) {
  const value = captured(input), base = baseToken == null ? null : revisions.get(baseToken);
  if (baseToken != null && !base) throw new Error('Recovery capture is not owned');
  const token = Object.freeze({});
  const deltaBase = base?.remote && base.input.documentAuthority === value.documentAuthority
    ? {entry: base, release: retainRecoveryRevision(baseToken)} : null;
  revisions.set(token, {input: value, id: ++revisionSequence, lifetime: 0, users: 0, base: deltaBase,
    remote: null, ledger: null, local: null, chain: Promise.resolve()});
  return token;
}
function releaseBase(entry) {
  const base = entry.base; entry.base = null; base?.release();
}
function releaseRemote(entry) {
  if (entry.remote) {
    try { entry.remote.worker.postMessage({operation: 'release', revisionId: entry.id}); } catch (_) {}
  }
  entry.remote = null; entry.ledger = null; entry.local = null;
  releaseBase(entry);
}
export function retireRecoveryRevision(token) {
  const entry = revisions.get(token);
  if (!entry) return;
  revisions.delete(token); entry.retiring = true;
  if (!entry.users) { releaseRemote(entry); entry.lifetime++; entry.input = null; }
}
export function retainRecoveryRevision(token) {
  const entry = revisions.get(token);
  if (!entry) throw new Error('Recovery capture is not owned');
  entry.users++;
  let held = true;
  return () => {
    if (!held) return;
    held = false; entry.users--;
    if (!entry.users && entry.retiring) { releaseRemote(entry); entry.lifetime++; entry.input = null; }
  };
}
function keep(value, entry, state) {
  freeze(value);
  const proof = {entry, lifetime: entry.lifetime};
  if (value.ledger) prepared.set(value.ledger, {...proof,
    filename: entry.input.metadata.filename, docKind: entry.input.metadata.docKind});
  captures.set(value, {...proof, seenText: state.seenText, snapshot: state.snapshot});
  return value;
}
const alive = held => !!held && held.lifetime === held.entry.lifetime;
export function preparedLedger(ledger, text, metadata) {
  const held = prepared.get(ledger);
  return alive(held) && held.entry.input.text === text && held.filename === metadata.filename && held.docKind === metadata.docKind;
}
export function preparedIntegrity(value, text) {
  const held = captures.get(value);
  if (!alive(held)) return null;
  return held.entry.input.text === text ? value.integrity : held.seenText === text ? value.seenIntegrity : null;
}
export function preparedSnapshot(value, text, ledger, state, docId) {
  const held = captures.get(value);
  if (!alive(held) || !held.snapshot || held.entry.input.text !== text || value.ledger !== ledger || held.snapshot.docId !== docId) return null;
  const keys = new Set(['docId', 'ts', ...Object.keys(state)]);
  if (!Number.isFinite(held.snapshot.ts) || Object.keys(held.snapshot).some(key => !keys.has(key))) return null;
  for (const [key, field] of Object.entries(state)) {
    if (field && typeof field === 'object' ? JSON.stringify(field) !== JSON.stringify(held.snapshot[key]) : field !== held.snapshot[key]) return null;
  }
  return value.encoded;
}

const RECOVERY_TIMEOUT_MS = 120000;
let client = null, sequence = 0;
async function sharedWorker(workerSource) {
  if (typeof workerSource !== 'function') throw new Error('Recovery execution is unavailable');
  if (client?.source === workerSource && client.constructor === globalThis.Worker) return client.ready;
  const owner = {source: workerSource, constructor: globalThis.Worker, jobs: new Map(), worker: null};
  client = owner;
  owner.stop = error => {
    if (client === owner) client = null;
    if (owner.worker) { owner.worker.onmessage = owner.worker.onerror = owner.worker.onmessageerror = null; owner.worker.terminate(); }
    for (const job of owner.jobs.values()) job.finish(error);
  };
  owner.ready = (async () => {
    owner.worker = createWorkerExecution({source: workerSource, name: 'rapier-recovery',
      install: installRecoveryWorker, scope: {indexedDB: globalThis.indexedDB}});
    owner.worker.onmessage = ({data}) => {
      const job = owner.jobs.get(data?.id);
      if (!job) return;
      try {
        if (data.error) { job.finish(Object.assign(new Error(data.error), {code: data.code, name: data.name || 'Error'})); return; }
        const complete = job.receive(data);
        if (complete) job.finish(null, complete.value);
      } catch (error) { job.finish(error); }
    };
    owner.worker.onerror = event => { event.preventDefault?.(); owner.stop(new Error(event.message || 'Recovery worker stopped')); };
    owner.worker.onmessageerror = () => owner.stop(new Error('Recovery worker returned unreadable data'));
    await owner.worker.ready;
    return owner;
  })().catch(error => { owner.stop(error); throw error; });
  return owner.ready;
}
async function prepareEntry(entry, state, {workerSource, signal} = {}) {
  signal?.throwIfAborted();
  if (typeof document === 'undefined') {
    const core = entry.local || {input: entry.input, ledger: null, integrity: null};
    const {parts, ...value} = await preparation(core, state, signal);
    if (parts) {
      let encoded = '', turn = performance.now();
      for (const part of parts) {
        signal?.throwIfAborted(); encoded += part;
        if (performance.now() - turn >= 4) { await new Promise(resolve => setTimeout(resolve, 0)); turn = performance.now(); }
      }
      value.encoded = encoded;
    }
    signal?.throwIfAborted(); entry.local = core; releaseBase(entry);
    return keep(value, entry, state);
  }
  const owner = await sharedWorker(workerSource);
  signal?.throwIfAborted();
  const reuse = entry.remote === owner;
  const value = await ask(owner, entry, reuse, {reuseLedger: reuse && !!entry.ledger, state}, signal);
  signal?.throwIfAborted();
  if (value.reusedLedger) {
    if (!entry.ledger || !reuse) throw new Error('Recovery ledger expired');
    value.ledger = entry.ledger; delete value.reusedLedger;
  } else if (value.ledger) entry.ledger = value.ledger;
  return keep(value, entry, state);
}
function textChange(before, after) {
  const limit = Math.min(before.length, after.length);
  let start = 0, end = 0;
  for (const step of [65536, 1024, 1])
    while (start + step <= limit && before.slice(start, start + step) === after.slice(start, start + step)) start += step;
  for (const step of [65536, 1024, 1])
    while (end + step <= limit - start && before.slice(before.length - end - step, before.length - end) === after.slice(after.length - end - step, after.length - end)) end += step;
  return {start, removed: before.length - start - end, inserted: after.slice(start, after.length - end)};
}
async function ask(owner, entry, reuse, request, signal, full = false) {
  const id = ++sequence;
  const base = !reuse && !full && entry.base?.entry.remote === owner ? entry.base.entry : null;
  const change = base && typeof base.input.text === 'string' && typeof entry.input.text === 'string'
    ? textChange(base.input.text, entry.input.text) : null;
  const delta = change && change.inserted.length < entry.input.text.length;
  const state = request.state?.seenText === entry.input.text
    ? {...request.state, seenText: null, seenCurrent: true} : request.state;
  const packed = packet({revisionId: entry.id, core: reuse ? null : delta ? {...entry.input, text: null} : entry.input,
    ...request, ...(state ? {state} : {}), ...(delta ? {baseRevisionId: base.id, textChange: change} : {})});
  const value = await new Promise((resolve, reject) => {
    let settled = false, timer = 0;
    const cancel = () => finish(abort());
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); owner.jobs.delete(id);
      if (error) {
        try {
          owner.worker.postMessage({id, operation: 'cancel'});
          if (!reuse) owner.worker.postMessage({operation: 'release', revisionId: entry.id});
        } catch (_) {}
        reject(error);
      }
      else resolve(value);
    };
    timer = setTimeout(() => finish(new Error('Recovery preparation took too long')), RECOVERY_TIMEOUT_MS);
    owner.jobs.set(id, {receive: receiver(), finish});
    signal?.addEventListener('abort', cancel, {once: true});
    if (signal?.aborted) { cancel(); return; }
    const port = {postMessage: message => owner.worker.postMessage({id, ...message})};
    void sendPacket(port, packed, () => !settled).catch(error => finish(error));
  }).catch(error => {
    if (delta && error.code === 'recovery_base_expired') return ask(owner, entry, false, request, signal, true);
    throw error;
  });
  entry.remote = owner;
  releaseBase(entry);
  return value;
}
export async function writeRecoveryRecords(prepared, write, {workerSource, signal, db} = {}) {
  const held = captures.get(prepared);
  if (!alive(held) || !held.entry.input) throw new Error('Recovery capture is not owned');
  const {entry} = held;
  if (typeof document === 'undefined') return storeRecords(entry.input.text, write, db, signal);
  const owner = await sharedWorker(workerSource);
  signal?.throwIfAborted();
  return (await ask(owner, entry, entry.remote === owner, {write}, signal)).newer;
}
export async function prepareRecoveryCapture(input, options = {}) {
  options.signal?.throwIfAborted();
  const descriptor = input && Object.getOwnPropertyDescriptor(input, 'capture');
  let data = input;
  if (descriptor) {
    data = {};
    for (const key of Reflect.ownKeys(input)) {
      const field = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !field.enumerable || !Object.hasOwn(field, 'value')) throw new TypeError('Recovery needs plain data');
      if (key !== 'capture') data[key] = field.value;
    }
  }
  data = captured(data);
  const reusable = !!descriptor;
  const token = reusable ? descriptor.value : captureRecoveryRevision(Object.fromEntries(
    Object.entries(data).filter(([key]) => !['undo', 'seenText', 'snapshot', 'needLedger'].includes(key))));
  const entry = revisions.get(token);
  if (!entry) throw new Error('Recovery capture is not owned');
  if (reusable && Object.keys(data).some(key => !['undo', 'seenText', 'snapshot', 'needLedger'].includes(key)))
    throw new Error('A captured recovery revision cannot change');
  const state = {undo: data.undo || null, seenText: data.seenText ?? null,
    snapshot: data.snapshot || null, needLedger: data.needLedger === true};
  entry.users++;
  const pending = entry.chain.catch(() => undefined).then(() => prepareEntry(entry, state, options));
  entry.chain = pending.then(() => undefined, () => undefined);
  try { return await pending; }
  finally {
    entry.users--;
    if (!reusable) releaseRemote(entry);
    else if (!entry.users && entry.retiring) { releaseRemote(entry); entry.lifetime++; entry.input = null; }
  }
}
