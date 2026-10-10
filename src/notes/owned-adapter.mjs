// SPDX-License-Identifier: AGPL-3.0-only
import {getTool, validateInput} from '../agent/catalog.mjs';
import {resolveCaller} from '../agent/door-identity.mjs';
import {seal, open, VDK_BYTES} from './vault.mjs';
import {sealLiveEnvelope, openLiveEnvelope, verifyLiveEnvelope} from './live-envelope.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const METHODS = new Set(['notes.find', 'notes.read', 'notes.write', 'notes.set', 'notes.history', 'notes.sync', 'notes.open']);
const DOCUMENT_FAMILIES = Object.freeze({
  read: ['document.observe', 'document.outline', 'document.find', 'document.read', 'document.inspect_visual'],
  edit: ['document.edit', 'document.replace', 'document.undo'],
  drawing: ['document.draw', 'svg.edit'],
  comparison: ['comparison.present'],
  comments: ['comments.read', 'comments.write'],
  delivery: ['document.save', 'document.export', 'document.create_return'],
  editor: ['editor.set_view', 'editor.set_preferences', 'editor.reveal', 'editor.point', 'editor.copy', 'editor.read_aloud', 'editor.open_file', 'editor.install_plugin'],
  wait: ['document.wait_for_user'],
});
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
  invoke, custody, isCurrent = () => true, recover, checkpointSequence,
  documentGrants = [], activeDocument, isDocumentCurrent} = {}) {
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
  const documentAccess = new Map(), retiredGrants = new Set();
  let activeActor = null, activeGrantId = null, dispatchState = 'unknown';
  const validBinding = value => record(value) && Object.keys(value).length === 2 &&
    typeof value.documentId === 'string' && value.documentId.length > 0 && value.documentId.length <= 256 && integer(value.epoch);
  const sameBinding = (a, b) => validBinding(a) && validBinding(b) && a.documentId === b.documentId && a.epoch === b.epoch;
  // Only trusted enrollment calls this function. Tool input and Notes opening cannot add grants.
  function grantDocument(value) {
    if (!active) throw fail('notes_locked');
    const actor = grants.get(value?.actorIndex);
    if (!actor || !record(value) || !identifier(value.id) || retiredGrants.has(value.id) ||
        value.principal !== actor.principal || value.keyEpoch !== scope.keyEpoch || !validBinding(value.binding) ||
        !Array.isArray(value.families) || !value.families.length || value.families.some(family => !Object.hasOwn(DOCUMENT_FAMILIES, family)) ||
        typeof activeDocument !== 'function' || typeof isDocumentCurrent !== 'function') throw fail('notes_document_grant');
    const prior = documentAccess.get(actor.actorIndex);
    if (prior && prior.id !== value.id) revokeDocument(actor.actorIndex);
    if (prior?.id === value.id) throw fail('notes_document_grant_exists');
    const grant = Object.freeze({id: value.id, actorIndex: actor.actorIndex, principal: actor.principal, keyEpoch: scope.keyEpoch,
      binding: Object.freeze({...value.binding}), families: Object.freeze([...new Set(value.families)])});
    if (isDocumentCurrent(grant) !== true || !sameBinding(activeDocument(), grant.binding)) throw fail('notes_document_unavailable');
    documentAccess.set(actor.actorIndex, grant);
    return {granted: true, grant_id: grant.id, binding: {...grant.binding}, families: [...grant.families]};
  }
  function revokeDocument(actorIndex) {
    const grant = documentAccess.get(actorIndex);
    if (!grant) return {revoked: false};
    retiredGrants.add(grant.id); documentAccess.delete(actorIndex);
    if (activeActor === actorIndex && activeGrantId === grant.id) controller?.abort(fail('notes_document_unavailable'));
    return {revoked: true, grant_id: grant.id};
  }
  function documentGrant(actorIndex, binding, id) {
    const grant = documentAccess.get(actorIndex);
    if (!grant || id !== undefined && grant.id !== id || !sameBinding(grant.binding, binding) ||
        isDocumentCurrent(grant) !== true || !sameBinding(activeDocument(), grant.binding)) throw fail('notes_document_unavailable');
    return grant;
  }
  if (!Array.isArray(documentGrants)) throw fail('notes_document_grant');
  // Initialize after the revocation controller exists; adding a grant never changes Notes enrollment.
  const key = documentKey instanceof Uint8Array && documentKey.length === VDK_BYTES ? new Uint8Array(documentKey) : null;
  let active = !!key, queue = Promise.resolve(), state = null, flight = null, controller = null;
  for (const grant of documentGrants) grantDocument(grant);
  const domain = 'rapier-owned-notes-adapter-v1:' + JSON.stringify(scope);
  const requestIdentity = (header, grantId = null) => hash(encode([scope.workspaceId, scope.documentId, scope.keyEpoch,
    header.actorIndex, header.operationId, grantId])).then(digest => 'owned_notes_' + digest);
  const callerPrincipal = (actor, grant) => grant ? hash(encode([scope, grant.id, actor.principal, grant.binding])).then(value => 'owned_document_' + value) : Promise.resolve(actor.principal);
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
    const authorized = () => {
      check(pending.header.actorIndex);
      if (pending.documentGrantId) documentGrant(pending.header.actorIndex, pending.call.binding, pending.documentGrantId);
    };
    authorized();
    const operationId = 'reply_' + await hash(encoder.encode(pending.header.actorIndex + ':' + pending.header.operationId));
    const envelope = await withKey(key => sealLiveEnvelope({...scope, operationId, baseSequence: pending.sequence,
      messageKind: pending.header.messageKind === 'document-call' ? 'document-result' : 'notes-result'}, encode({requestOperationId: pending.header.operationId, requestSequence: pending.sequence,
      ...(pending.call?.grant_id ? {grant_id: pending.call.grant_id} : {}), result}), key, signingKey));
    authorized();
    await persist({version: 1, baseSequence: state.baseSequence, sequence: pending.sequence, pending: null,
      receipts: [...state.receipts, {sequence: pending.sequence, digest: pending.digest, envelope: Array.from(envelope)}]});
    authorized();
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
    try {opened = ['notes-result', 'document-result', 'checkpoint'].includes(row.header.messageKind)
      ? await verifyLiveEnvelope(bytes, verification)
      : await withKey(key => openLiveEnvelope(bytes, verification, key));}
    catch {check(actor.actorIndex); return refused('notes_envelope_invalid');}
    check(actor.actorIndex);
    if (opened.header.baseSequence >= row.sequence || Object.keys(row.header).length !== Object.keys(opened.header).length ||
        Object.keys(opened.header).some(field => row.header[field] !== opened.header[field])) return refused('notes_envelope_invalid');
    let value, documentAdmission = null, documentError = null;
    if (opened.header.messageKind === 'document-call') {
      try {
        value = decode(opened.bytes);
        if (!record(value) || Object.keys(value).length !== 4 || typeof value.name !== 'string' || !record(value.arguments) || !validBinding(value.binding) || !identifier(value.grant_id)) throw fail('notes_arguments_invalid');
        documentAdmission = documentGrant(actor.actorIndex, value.binding, value.grant_id);
        if (!documentAdmission.families.some(family => DOCUMENT_FAMILIES[family].includes(value.name))) throw fail('notes_method_not_granted');
      } catch (error) { documentError = error?.code || 'notes_arguments_invalid'; }
    }
    if (row.sequence <= state.baseSequence) return {outcome: 'refused', reason: 'notes_checkpoint_covered', throughSequence: state.baseSequence};
    if (row.sequence <= state.sequence) {
      if (documentError) return refused(documentError);
      const prior = state.receipts[row.sequence - state.baseSequence - 1];
      if (prior.digest !== digest) return refused('notes_operation_conflict');
      return prior.envelope === null ? {outcome: 'observed', sequence: row.sequence, replayed: true}
        : {outcome: 'answered', sequence: row.sequence, replayed: true, envelope: new Uint8Array(prior.envelope)};
    }
    if (state.pending && row.sequence !== state.pending.sequence) return {outcome: 'uncertain', reason: 'notes_previous_outcome_unacknowledged', sequence: state.pending.sequence};
    if (row.sequence !== state.sequence + 1) return refused('notes_sequence_gap');
    if (!['notes-call', 'document-call'].includes(opened.header.messageKind)) {
      if (state.pending) return refused('notes_operation_conflict');
      if (!['notes-result', 'document-result', 'checkpoint'].includes(opened.header.messageKind)) return refused('notes_record_handler_required');
      await persist({...state, sequence: row.sequence, receipts: [...state.receipts, {sequence: row.sequence, digest, envelope: null}]});
      check(actor.actorIndex);
      return {outcome: 'observed', sequence: row.sequence};
    }
    if (state.pending) {
      if (state.pending.digest !== digest) return refused('notes_operation_conflict');
      if (documentError === 'notes_document_unavailable') {
        const withheld = {...state.pending}; delete withheld.documentGrantId;
        return finish(withheld, {outcome: 'uncertain', reason: 'notes_document_unavailable', document_access: 'unavailable'});
      }
      if (documentError) return refused(documentError);
      if (flight?.digest === digest) return finish(state.pending, flight.result);
      if (typeof recover === 'function') {
        const recovered = await recover({operationId: opened.header.operationId, principal: await callerPrincipal(actor, documentAdmission),
          requestId: await requestIdentity(opened.header, value?.grant_id ?? null), name: state.pending.call.name,
          arguments: state.pending.call.arguments, signal: controller.signal}); check(actor.actorIndex);
        if (recovered?.found === true) return finish(state.pending, recovered.result);
      }
      return {outcome: 'uncertain', reason: 'notes_outcome_unacknowledged', sequence: row.sequence};
    }
    try {value ??= decode(opened.bytes);}
    catch {return finish({sequence: row.sequence, digest, header: opened.header}, refused('notes_arguments_invalid'));}
    const pending = {sequence: row.sequence, digest, header: opened.header, call: value,
      ...(documentAdmission && !documentError ? {documentGrantId: documentAdmission.id} : {})};
    // An authenticated call already occupies a relay sequence. Its application refusal
    // is an encrypted result, so a later valid call can continue through the same stream.
    const decline = reason => finish(pending, refused(reason));
    if (documentError) return decline(documentError);
    if (opened.header.messageKind === 'notes-call' && (!record(value) || Object.keys(value).length !== 2 || typeof value.name !== 'string' || !record(value.arguments) ||
        !actor.methods.includes(value.name) || !METHODS.has(value.name))) return decline('notes_method_not_granted');
    const tool = getTool(value.name);
    if (!tool) return decline('notes_method_unavailable');
    try {validateInput(tool.inputSchema, value.arguments, 'arguments', true);}
    catch {return decline('notes_arguments_invalid');}
    // Custody precedes handing the effect to its owner. A restart with this record must
    // recover the owner's receipt or report uncertainty; it must never execute twice.
    await persist({...state, pending}); dispatchState = 'prepared'; check(actor.actorIndex);
    const requestId = await requestIdentity(opened.header, value?.grant_id ?? null); check(actor.actorIndex);
    const principal = await callerPrincipal(actor, documentAdmission);
    const documentGuard = documentAdmission ? () => {check(actor.actorIndex); documentGrant(actor.actorIndex, value.binding, documentAdmission.id); return true;} : null;
    documentGuard?.();
    const caller = resolveCaller({actor: 'agent', principal, requestId,
      session: scope.workspaceId + ':' + scope.documentId + ':' + scope.keyEpoch, transport: 'mcp'});
    activeActor = documentAdmission ? actor.actorIndex : null; activeGrantId = documentAdmission?.id || null;
    dispatchState = 'dispatched';
    let result = await invoke(value.name, value.arguments, {...caller, signal: controller.signal,
      notesGuard: () => check(actor.actorIndex), ...(documentGuard ? {documentGuard} : {})});
    documentGuard?.();
    if (['notes.find', 'notes.read', 'notes.open'].includes(value.name) && result?.outcome === 'ok') {
      let granted = null;
      try {granted = documentGrant(actor.actorIndex, value.name === 'notes.open' ? result.document_binding : activeDocument?.());} catch {}
      result = {...result, document_access: granted ? 'private' : 'unavailable',
        ...(granted ? {document_channel: {grant_id: granted.id, binding: {...granted.binding}, families: [...granted.families]}} : {})};
    }
    flight = {digest, result}; check(actor.actorIndex);
    return finish(pending, result);
  }
  function serialized(operation) {
    const run = async () => {
      if (!active) return locked();
      controller = new AbortController(); dispatchState = 'unknown';
      try {return await operation();}
      catch (error) {
        const documentEnded = error?.code === 'notes_document_unavailable' || controller.signal.reason?.code === 'notes_document_unavailable';
        if (!active || ['notes_locked', 'notes_checkpoint_locked'].includes(error?.code)) return locked();
        if (documentEnded && state?.pending?.header.messageKind === 'document-call') {
          // The invocation has settled, but its private result is no longer disclosable. Keep
          // an explicit uncertain receipt without source or handles, so revoking this channel
          // does not strand the independent Notes stream behind an unrecoverable pending read.
          controller = new AbortController(); activeActor = null; activeGrantId = null;
          const pending = {...state.pending}; delete pending.documentGrantId;
          try {return await finish(pending, {outcome: dispatchState === 'prepared' ? 'refused' : 'uncertain', reason: 'notes_document_unavailable', document_access: 'unavailable'});}
          catch (closed) {return !active || closed?.code === 'notes_locked' ? locked() : {outcome: 'uncertain', reason: 'notes_receipt_unacknowledged'};}
        }
        if (controller.signal.aborted) return locked();
        return {outcome: 'uncertain', reason: documentEnded ? 'notes_document_unavailable' : 'notes_receipt_unacknowledged'};
      } finally {controller = null; activeActor = null; activeGrantId = null; dispatchState = 'unknown';}
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
  function documentAccessStatus() {
    if (!active) return [];
    return [...grants.values()].filter(actor => actor.methods.length || documentAccess.has(actor.actorIndex)).map(actor => {
      let grant = null;
      try {grant = documentGrant(actor.actorIndex, activeDocument?.());} catch {}
      return {actor_index: actor.actorIndex, principal: actor.principal,
        ...(grant ? {grant: {id: grant.id, binding: {...grant.binding}, families: [...grant.families]}} : {})};
    });
  }
  function lock() {
    active = false; controller?.abort(); key?.fill(0);
    for (const grant of documentAccess.values()) retiredGrants.add(grant.id);
    documentAccess.clear();
    return queue.finally(() => {state = null; flight = null;});
  }
  return Object.freeze({receive, captureCheckpoint, grantDocument, revokeDocument, documentAccess: documentAccessStatus, lock});
}
