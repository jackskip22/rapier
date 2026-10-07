// SPDX-License-Identifier: AGPL-3.0-only
import {getTool, validateInput} from '../agent/catalog.mjs';
import {resolveCaller} from '../agent/door-identity.mjs';
import {seal, open, VDK_BYTES} from './vault.mjs';
import {sealLiveEnvelope, openLiveEnvelope, verifyLiveEnvelope} from './live-envelope.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const METHODS = new Set(['notes.list', 'notes.read', 'notes.propose', 'notes.set', 'notes.history', 'notes.sync']);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = reason => Object.assign(new Error(reason), {code: reason});
const refused = reason => ({outcome: 'refused', reason});
const LOCKED_HINT = 'Unlock Notes at the enrolled endpoint and reconnect through its private connection.';
const locked = () => ({outcome: 'refused', availability: 'locked', reason: 'notes_locked', hint: LOCKED_HINT, message: LOCKED_HINT});
const encode = value => encoder.encode(JSON.stringify(value));
const decode = bytes => JSON.parse(decoder.decode(bytes));
async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Enrollment and custody are trusted endpoint inputs, never tool arguments. invoke reaches
// the existing kernel; the adapter owns only encrypted delivery receipts and its scoped key.
export function createOwnedNotesAdapter({scope: givenScope, documentKey, signingKey, actors,
  invoke, custody, isCurrent = () => true, recover, checkpointSequence} = {}) {
  if (!record(givenScope) || !identifier(givenScope.workspaceId) || !identifier(givenScope.documentId) ||
      !integer(givenScope.actorIndex) || !integer(givenScope.keyEpoch) || !givenScope.keyEpoch ||
      typeof invoke !== 'function' || typeof custody?.read !== 'function' || typeof custody?.write !== 'function' ||
      !Array.isArray(actors) || typeof isCurrent !== 'function' || signingKey?.type !== 'private' ||
      signingKey.algorithm?.name !== 'ECDSA' || signingKey.algorithm.namedCurve !== 'P-256' ||
      !signingKey.usages?.includes('sign') || checkpointSequence !== undefined && !integer(checkpointSequence)) throw fail('notes_adapter_configuration');
  const scope = Object.freeze({workspaceId: givenScope.workspaceId, documentId: givenScope.documentId,
    keyEpoch: givenScope.keyEpoch, actorIndex: givenScope.actorIndex});
  const grants = new Map();
  for (const actor of actors) {
    if (!record(actor) || !integer(actor.actorIndex) || grants.has(actor.actorIndex) ||
        typeof actor.principal !== 'string' || !actor.principal || actor.principal.length > 160 || !Array.isArray(actor.methods) ||
        actor.methods.some(name => !METHODS.has(name)) || actor.verificationKey?.type !== 'public' ||
        actor.verificationKey.algorithm?.name !== 'ECDSA' || actor.verificationKey.algorithm.namedCurve !== 'P-256' ||
        !actor.verificationKey.usages?.includes('verify')) throw fail('notes_adapter_grant');
    grants.set(actor.actorIndex, Object.freeze({...actor, methods: Object.freeze([...new Set(actor.methods)])}));
  }
  const key = documentKey instanceof Uint8Array && documentKey.length === VDK_BYTES ? new Uint8Array(documentKey) : null;
  let active = !!key, queue = Promise.resolve(), state = null, flight = null, controller = null;
  const domain = 'rapier-owned-notes-adapter-v1:' + JSON.stringify(scope);
  const requestIdentity = header => hash(encode([scope.workspaceId, scope.documentId, scope.keyEpoch,
    header.actorIndex, header.operationId])).then(digest => 'owned_notes_' + digest);
  const check = actor => {
    if (!active || isCurrent(scope, actor) !== true) throw fail('notes_locked');
    controller?.signal.throwIfAborted();
  };
  const withKey = async action => {
    check(); const copy = new Uint8Array(key);
    try {return await action(copy);} finally {copy.fill(0);}
  };
  async function load() {
    if (state) return;
    const bytes = await custody.read(); check();
    if (bytes == null) {const baseSequence = checkpointSequence ?? 0; state = {version: 1, baseSequence, sequence: baseSequence, receipts: [], pending: null}; return;}
    let value;
    try {value = decode(await withKey(key => open(key, domain, bytes)));}
    catch {throw fail('notes_locked');}
    check();
    if (!record(value) || value.version !== 1 || !integer(value.sequence) || !integer(value.baseSequence) || value.baseSequence > value.sequence ||
        checkpointSequence !== undefined && value.baseSequence !== checkpointSequence || !Array.isArray(value.receipts) ||
        value.receipts.length !== value.sequence - value.baseSequence || value.receipts.some((row, index) => !record(row) || row.sequence !== value.baseSequence + index + 1 ||
          !/^[a-f0-9]{64}$/.test(row.digest) || row.envelope !== null && (!Array.isArray(row.envelope) || row.envelope.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255))) ||
        value.pending !== null && (!record(value.pending) || value.pending.sequence !== value.sequence + 1 ||
          !/^[a-f0-9]{64}$/.test(value.pending.digest) || !record(value.pending.header) || !record(value.pending.call))) throw fail('notes_locked');
    state = value;
  }
  async function persist(next) {
    check();
    const bytes = await withKey(key => seal(key, domain, encode(next))); check();
    try {await custody.write(bytes);}
    catch {state = null; throw fail('notes_receipt_unacknowledged');}
    state = next; check();
  }
  async function finish(pending, result) {
    check(pending.header.actorIndex);
    const operationId = 'reply_' + await hash(encoder.encode(pending.header.actorIndex + ':' + pending.header.operationId));
    const envelope = await withKey(key => sealLiveEnvelope({...scope, operationId, baseSequence: pending.sequence,
      messageKind: 'notes-result'}, encode({requestOperationId: pending.header.operationId, requestSequence: pending.sequence, result}), key, signingKey));
    check(pending.header.actorIndex);
    await persist({version: 1, baseSequence: state.baseSequence, sequence: pending.sequence, pending: null,
      receipts: [...state.receipts, {sequence: pending.sequence, digest: pending.digest, envelope: Array.from(envelope)}]});
    check(pending.header.actorIndex);
    flight = null;
    return {outcome: 'answered', sequence: pending.sequence, envelope};
  }
  async function receiveRow(row) {
    check(); await load(); check();
    if (!record(row) || !integer(row.sequence) || !row.sequence || !record(row.header) || !(row.envelope instanceof Uint8Array)) return refused('notes_envelope_invalid');
    const bytes = new Uint8Array(row.envelope), digest = await hash(bytes); check();
    const actor = grants.get(row.header.actorIndex);
    if (!actor) return refused('notes_actor_not_enrolled');
    check(actor.actorIndex);
    let opened;
    const verification = {...scope, actorIndex: actor.actorIndex, verificationKey: actor.verificationKey};
    // Checkpoints use the endpoint's separate store key. Following their signed position
    // does not need that key and never restores or changes Notes during a tool delivery.
    try {opened = ['notes-result', 'checkpoint'].includes(row.header.messageKind)
      ? await verifyLiveEnvelope(bytes, verification)
      : await withKey(key => openLiveEnvelope(bytes, verification, key));}
    catch {check(actor.actorIndex); return refused('notes_envelope_invalid');}
    check(actor.actorIndex);
    if (opened.header.baseSequence >= row.sequence || Object.keys(row.header).length !== Object.keys(opened.header).length ||
        Object.keys(opened.header).some(field => row.header[field] !== opened.header[field])) return refused('notes_envelope_invalid');
    if (row.sequence <= state.baseSequence) return {outcome: 'refused', reason: 'notes_checkpoint_covered', throughSequence: state.baseSequence};
    if (row.sequence <= state.sequence) {
      const prior = state.receipts[row.sequence - state.baseSequence - 1];
      if (prior.digest !== digest) return refused('notes_operation_conflict');
      return prior.envelope === null ? {outcome: 'observed', sequence: row.sequence, replayed: true}
        : {outcome: 'answered', sequence: row.sequence, replayed: true, envelope: new Uint8Array(prior.envelope)};
    }
    if (state.pending && row.sequence !== state.pending.sequence) return {outcome: 'uncertain', reason: 'notes_previous_outcome_unacknowledged', sequence: state.pending.sequence};
    if (row.sequence !== state.sequence + 1) return refused('notes_sequence_gap');
    if (opened.header.messageKind !== 'notes-call') {
      if (state.pending) return refused('notes_operation_conflict');
      if (!['notes-result', 'checkpoint'].includes(opened.header.messageKind)) return refused('notes_record_handler_required');
      await persist({...state, sequence: row.sequence, receipts: [...state.receipts, {sequence: row.sequence, digest, envelope: null}]});
      check(actor.actorIndex);
      return {outcome: 'observed', sequence: row.sequence};
    }
    if (state.pending) {
      if (state.pending.digest !== digest) return refused('notes_operation_conflict');
      if (flight?.digest === digest) return finish(state.pending, flight.result);
      if (typeof recover === 'function') {
        const recovered = await recover({operationId: opened.header.operationId, principal: actor.principal,
          requestId: await requestIdentity(opened.header), name: state.pending.call.name,
          arguments: state.pending.call.arguments, signal: controller.signal}); check(actor.actorIndex);
        if (recovered?.found === true) return finish(state.pending, recovered.result);
      }
      return {outcome: 'uncertain', reason: 'notes_outcome_unacknowledged', sequence: row.sequence};
    }
    let value;
    try {value = decode(opened.bytes);}
    catch {return finish({sequence: row.sequence, digest, header: opened.header}, refused('notes_arguments_invalid'));}
    const pending = {sequence: row.sequence, digest, header: opened.header, call: value};
    // An authenticated call already occupies a relay sequence. Its application refusal
    // is an encrypted result, so a later valid call can continue through the same stream.
    const decline = reason => finish(pending, refused(reason));
    if (!record(value) || Object.keys(value).length !== 2 || typeof value.name !== 'string' || !record(value.arguments) ||
        !actor.methods.includes(value.name) || !METHODS.has(value.name)) return decline('notes_method_not_granted');
    const tool = getTool(value.name);
    if (!tool) return decline('notes_method_unavailable');
    try {validateInput(tool.inputSchema, value.arguments, 'arguments', true);}
    catch {return decline('notes_arguments_invalid');}
    // Custody precedes handing the effect to its owner. A restart with this record must
    // recover the owner's receipt or report uncertainty; it must never execute twice.
    await persist({...state, pending}); check(actor.actorIndex);
    const requestId = await requestIdentity(opened.header); check(actor.actorIndex);
    const caller = resolveCaller({actor: 'agent', principal: actor.principal, requestId,
      session: scope.workspaceId + ':' + scope.documentId + ':' + scope.keyEpoch, transport: 'mcp'});
    const result = await invoke(value.name, value.arguments, {...caller, signal: controller.signal,
      notesGuard: () => check(actor.actorIndex)});
    flight = {digest, result}; check(actor.actorIndex);
    return finish(pending, result);
  }
  function serialized(operation) {
    const run = async () => {
      if (!active) return locked();
      controller = new AbortController();
      try {return await operation();}
      catch (error) {
        if (!active || ['notes_locked', 'notes_checkpoint_locked'].includes(error?.code) || controller.signal.aborted) return locked();
        return {outcome: 'uncertain', reason: 'notes_receipt_unacknowledged'};
      } finally {controller = null;}
    };
    const result = queue.then(run, run); queue = result.then(() => undefined, () => undefined); return result;
  }
  function receive(value) {
    // The caller can reuse its buffers as soon as this invocation returns its promise.
    const row = record(value) ? {...value, header: record(value.header) ? {...value.header} : value.header,
      envelope: value.envelope instanceof Uint8Array ? new Uint8Array(value.envelope) : value.envelope} : value;
    return serialized(() => receiveRow(row));
  }
  function captureCheckpoint(checkpoint, input = {}) {
    const options = {operationId: input.operationId, ...(input.stamp === undefined ? {} : {stamp: input.stamp})};
    return serialized(async () => {
      check(); await load(); check();
      if (state.pending) return {outcome: 'uncertain', reason: 'notes_outcome_unacknowledged', sequence: state.pending.sequence};
      if (typeof checkpoint?.capture !== 'function') return refused('notes_checkpoint_unavailable');
      // Capture shares the delivery queue. Its snapshot includes the settled prefix,
      // and no later Notes call can land while that prefix is being certified.
      const prepared = await checkpoint.capture({...options, capturedSequence: state.sequence});
      check(); return prepared;
    });
  }
  function lock() {
    active = false; controller?.abort(); key?.fill(0);
    return queue.finally(() => {state = null; flight = null;});
  }
  return Object.freeze({receive, captureCheckpoint, lock});
}
