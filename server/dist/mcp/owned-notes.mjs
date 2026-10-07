// SPDX-License-Identifier: AGPL-3.0-only
// Owned Notes stores signed ciphertext only. Enrollment belongs to the account authority; content tools terminate at an enrolled endpoint.
import {verifyLiveEnvelope, LIVE_ENVELOPE_MAX_BYTES} from '../notes/live-envelope.mjs';

const HEAD = 'owned:head', TYPE = 'owned-notes', MAX_PAGE = 16;
const MAX_BODY_BYTES = Math.ceil(LIVE_ENVELOPE_MAX_BYTES / 3) * 4 + 2048;
const MESSAGE_KINDS = new Set(['edit', 'proposal', 'decision', 'comment', 'presence', 'checkpoint', 'rotate', 'notes-call', 'notes-result']);
const CODEC_ERRORS = new Set(['live_envelope_bytes', 'live_envelope_frame', 'live_envelope_header', 'live_envelope_scope', 'live_envelope_key', 'live_envelope_signature']);
const SAFE = Symbol('owned Notes failure'), te = new TextEncoder();
const clone = value => structuredClone(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= minimum;
const digestValue = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = code => { throw Object.assign(new Error(code), {code, [SAFE]: true}); };
const publicError = error => {
  if (error?.[SAFE]) return error;
  const code = CODEC_ERRORS.has(error?.code) ? error.code : 'owned_notes_uncertain';
  return Object.assign(new Error(code), {code, [SAFE]: true});
};
const exact = (value, allowed, required = allowed, code = 'owned_notes_input') => {
  if (!record(value) || !required.every(key => Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.includes(key))) fail(code);
};
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const scopeOf = (head, actor, verificationKey) => ({workspaceId: head.workspaceId, documentId: head.documentId, keyEpoch: head.keyEpoch, actorIndex: actor.actorIndex, verificationKey});

function publicJwk(value) {
  exact(value, ['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg'], ['kty', 'crv', 'x', 'y'], 'owned_notes_enrollment');
  if (value.kty !== 'EC' || value.crv !== 'P-256' || !/^[A-Za-z0-9_-]{43}$/.test(value.x) || !/^[A-Za-z0-9_-]{43}$/.test(value.y) ||
      value.alg !== undefined && value.alg !== 'ES256' || value.ext !== undefined && typeof value.ext !== 'boolean' ||
      value.key_ops !== undefined && (!Array.isArray(value.key_ops) || value.key_ops.length !== 1 || value.key_ops[0] !== 'verify')) fail('owned_notes_enrollment');
  return {kty: 'EC', crv: 'P-256', x: value.x, y: value.y};
}
const verificationKey = jwk => crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']);
function sameActor(a, b) { return a.actorIndex === b.actorIndex && JSON.stringify(a.publicJwk) === JSON.stringify(b.publicJwk) && JSON.stringify(a.messageKinds) === JSON.stringify(b.messageKinds); }
function actorOf(head, actorIndex) {
  if (!integer(actorIndex)) fail('owned_notes_input');
  const actor = head.actors.find(row => row.actorIndex === actorIndex);
  if (!actor) fail('owned_notes_actor_unknown');
  if (actor.revoked) fail('owned_notes_actor_revoked');
  return actor;
}
function encode(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(LIVE_ENVELOPE_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('owned_notes_input');
  let bytes;
  try { bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)); }
  catch { fail('owned_notes_input'); }
  if (bytes.length > LIVE_ENVELOPE_MAX_BYTES || encode(bytes) !== value) fail('owned_notes_input');
  return bytes;
}
async function bodyOf(request) {
  if (!request.body) fail('owned_notes_input');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); fail('owned_notes_request_too_large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { fail('owned_notes_input'); }
}

export class RapierOwnedNotes {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.pending = Promise.resolve();
  }
  exclusive(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }
  async guarded(operation) {
    try { return await operation(); }
    catch (error) { throw publicError(error); }
  }
  head() {
    const head = this.ctx.storage.kv.get(HEAD);
    if (head === undefined) return null;
    if (!record(head) || head.type !== TYPE || !identifier(head.workspaceId) || !identifier(head.documentId) || !digestValue(head.capabilityHash) ||
        !integer(head.keyEpoch, 1) || !integer(head.sequence) || !Array.isArray(head.actors) || !integer(head.enrollmentRevision, 1)) fail('owned_notes_corrupt');
    return clone(head);
  }
  authorized(capabilityHash) {
    if (!digestValue(capabilityHash)) fail('owned_notes_input');
    const head = this.head();
    if (!head) fail('notes_not_configured');
    if (head.capabilityHash !== capabilityHash) fail('owned_notes_denied');
    return head;
  }
  saveHead(head) {
    // A SQLite key/value is bounded. Refusing new enrollment preserves the whole existing store.
    if (te.encode(JSON.stringify(head)).length > 2_000_000 - 1024) fail('owned_notes_enrollment');
    this.ctx.storage.kv.put(HEAD, head);
  }

  // Trusted account setup calls this method directly. There is no HTTP enrollment route and no content key argument.
  enroll(input) { return this.guarded(async () => {
    exact(input, ['workspaceId', 'documentId', 'capabilityHash', 'keyEpoch', 'actors', 'adapterId'], ['workspaceId', 'documentId', 'capabilityHash', 'keyEpoch', 'actors'], 'owned_notes_enrollment');
    const config = clone(input);
    if (!identifier(config.workspaceId) || !identifier(config.documentId) || !digestValue(config.capabilityHash) || !integer(config.keyEpoch, 1) ||
        !Array.isArray(config.actors) || config.adapterId !== undefined && !identifier(config.adapterId)) fail('owned_notes_enrollment');
    const seen = new Set();
    const actors = config.actors.map(value => {
      exact(value, ['actorIndex', 'publicJwk', 'messageKinds'], undefined, 'owned_notes_enrollment');
      if (!integer(value.actorIndex) || seen.has(value.actorIndex) || !Array.isArray(value.messageKinds) || !value.messageKinds.length ||
          new Set(value.messageKinds).size !== value.messageKinds.length || value.messageKinds.some(kind => !MESSAGE_KINDS.has(kind))) fail('owned_notes_enrollment');
      seen.add(value.actorIndex);
      return {actorIndex: value.actorIndex, publicJwk: publicJwk(value.publicJwk), messageKinds: [...value.messageKinds].sort(), revoked: false};
    }).sort((a, b) => a.actorIndex - b.actorIndex);
    try { await Promise.all(actors.map(actor => verificationKey(actor.publicJwk))); }
    catch { fail('owned_notes_enrollment'); }
    return this.exclusive(async () => {
      const previous = this.head();
      if (previous && ['workspaceId', 'documentId', 'capabilityHash', 'keyEpoch'].some(field => previous[field] !== config[field])) fail('owned_notes_enrollment_conflict');
      const head = previous || {type: TYPE, workspaceId: config.workspaceId, documentId: config.documentId, capabilityHash: config.capabilityHash,
        keyEpoch: config.keyEpoch, sequence: 0, enrollmentRevision: 1, actors: [], adapterId: null};
      let changed = !previous;
      for (const actor of actors) {
        const known = head.actors.find(row => row.actorIndex === actor.actorIndex);
        if (known && !sameActor(known, actor)) fail('owned_notes_actor_conflict');
        // Replaying an earlier enrollment never reactivates a revoked signing identity.
        if (!known) { head.actors.push(actor); changed = true; }
      }
      head.actors.sort((a, b) => a.actorIndex - b.actorIndex);
      if (config.adapterId !== undefined) {
        if (head.adapterId && head.adapterId !== config.adapterId) fail('owned_notes_enrollment_conflict');
        if (!head.adapterId) { head.adapterId = config.adapterId; changed = true; }
      }
      if (changed) {
        if (previous) head.enrollmentRevision++;
        this.ctx.storage.transactionSync(() => this.saveHead(head));
      }
      await this.ctx.storage.sync();
      return {outcome: 'enrolled', workspaceId: head.workspaceId, documentId: head.documentId, keyEpoch: head.keyEpoch,
        sequence: head.sequence, enrollmentRevision: head.enrollmentRevision, replayed: !changed};
    });
  }); }

  // Revocation is an authority-owner operation. It can complete while a submitted signature is being checked.
  revoke(actorIndex) { return this.guarded(() => this.exclusive(async () => {
    if (!integer(actorIndex)) fail('owned_notes_input');
    const head = this.head(); if (!head) fail('notes_not_configured');
    const actor = head.actors.find(row => row.actorIndex === actorIndex);
    if (!actor) fail('owned_notes_actor_unknown');
    const changed = !actor.revoked;
    if (changed) { actor.revoked = true; head.enrollmentRevision++; this.ctx.storage.transactionSync(() => this.saveHead(head)); }
    await this.ctx.storage.sync();
    return {outcome: 'revoked', actorIndex, changed, enrollmentRevision: head.enrollmentRevision};
  })); }

  status(input) { return this.guarded(() => {
    exact(input, ['capabilityHash']); const {capabilityHash} = input;
    if (!digestValue(capabilityHash)) fail('owned_notes_input');
    return this.exclusive(async () => {
      await this.ctx.storage.sync();
      if (!this.head()) return {outcome: 'ok', availability: 'unavailable', reason: 'notes_not_configured'};
      const head = this.authorized(capabilityHash);
      return {outcome: 'ok', availability: 'locked', reason: 'notes_locked',
        hint: head.adapterId ? 'Open Notes through the enrolled encrypted endpoint.' : 'Enroll and unlock a Notes endpoint on your device.',
        adapterEnrolled: !!head.adapterId, workspaceId: head.workspaceId, documentId: head.documentId, keyEpoch: head.keyEpoch, sequence: head.sequence};
    });
  }); }

  append(input) { return this.guarded(async () => {
    exact(input, ['capabilityHash', 'actorIndex', 'envelope']);
    const {capabilityHash, actorIndex} = input;
    if (!(input.envelope instanceof Uint8Array) || input.envelope.length > LIVE_ENVELOPE_MAX_BYTES) fail('live_envelope_bytes');
    const envelope = input.envelope.slice(), before = this.authorized(capabilityHash), enrolled = actorOf(before, actorIndex);
    const key = await verificationKey(enrolled.publicJwk);
    const checked = await verifyLiveEnvelope(envelope, scopeOf(before, enrolled, key));
    const digest = await hash(checked.bytes);
    return this.exclusive(async () => {
      const head = this.authorized(capabilityHash), actor = actorOf(head, actorIndex);
      if (head.workspaceId !== before.workspaceId || head.documentId !== before.documentId || head.keyEpoch !== before.keyEpoch || !sameActor(actor, enrolled)) fail('owned_notes_enrollment_conflict');
      if (!actor.messageKinds.includes(checked.header.messageKind)) fail('owned_notes_kind');
      const operationId = checked.header.operationId, receiptKey = 'owned:receipt:' + operationId;
      const known = this.ctx.storage.kv.get(receiptKey);
      if (known) {
        if (!record(known) || !integer(known.sequence, 1) || known.sequence > head.sequence || !digestValue(known.digest)) fail('owned_notes_corrupt');
        if (known.digest !== digest || known.actorIndex !== actorIndex || known.keyEpoch !== head.keyEpoch) fail('owned_notes_operation_conflict');
        const retained = this.ctx.storage.kv.get('owned:envelope:' + known.sequence);
        if (retained?.sequence !== known.sequence || !(retained.envelope instanceof Uint8Array) || retained.envelope.length !== checked.bytes.length ||
            retained.envelope.some((byte, index) => byte !== checked.bytes[index])) fail('owned_notes_corrupt');
        await this.ctx.storage.sync();
        return {outcome: 'stored', sequence: known.sequence, operationId, replayed: true};
      }
      if (checked.header.baseSequence > head.sequence || !integer(head.sequence + 1, 1)) fail('owned_notes_sequence');
      const sequence = head.sequence + 1;
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.kv.put('owned:envelope:' + sequence, {sequence, header: checked.header, envelope: checked.bytes});
        this.ctx.storage.kv.put(receiptKey, {sequence, digest, actorIndex, keyEpoch: head.keyEpoch});
        this.saveHead({...head, sequence});
      });
      await this.ctx.storage.sync();
      return {outcome: 'stored', sequence, operationId, replayed: false};
    });
  }); }

  read(input) { return this.guarded(() => {
    exact(input, ['capabilityHash', 'afterSequence', 'limit'], ['capabilityHash']);
    const {capabilityHash, afterSequence = 0, limit = MAX_PAGE} = input;
    if (!integer(afterSequence) || !integer(limit, 1) || limit > MAX_PAGE) fail('owned_notes_input');
    return this.exclusive(async () => {
      await this.ctx.storage.sync();
      const head = this.authorized(capabilityHash);
      if (afterSequence > head.sequence) fail('owned_notes_sequence');
      const rows = [], end = Math.min(head.sequence, afterSequence + limit);
      for (let sequence = afterSequence + 1; sequence <= end; sequence++) {
        const row = this.ctx.storage.kv.get('owned:envelope:' + sequence);
        if (!record(row) || row.sequence !== sequence || !(row.envelope instanceof Uint8Array) || row.envelope.length > LIVE_ENVELOPE_MAX_BYTES ||
            row.header?.workspaceId !== head.workspaceId || row.header?.documentId !== head.documentId || row.header?.keyEpoch !== head.keyEpoch) fail('owned_notes_corrupt');
        rows.push({sequence, header: clone(row.header), envelope: row.envelope.slice()});
      }
      return {outcome: 'ok', sequence: head.sequence, rows, nextSequence: end, complete: end === head.sequence};
    });
  }); }

  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST' || !['/status', '/append', '/read'].includes(path)) return json({outcome: 'refused', reason: 'owned_notes_route'}, 404);
      const input = await bodyOf(request);
      if (path === '/status') return json(await this.status(input));
      if (path === '/append') {
        exact(input, ['capabilityHash', 'actorIndex', 'envelope']);
        return json(await this.append({...input, envelope: decode(input.envelope)}));
      }
      const result = await this.read(input);
      return json({...result, rows: result.rows.map(row => ({...row, envelope: encode(row.envelope)}))});
    } catch (caught) {
      const error = publicError(caught), uncertain = error.code === 'owned_notes_uncertain';
      return json({outcome: uncertain ? 'uncertain' : 'refused', reason: error.code,
        ...(uncertain ? {retry: 'Retry the same operation with identical envelope bytes.'} : {})}, uncertain ? 503 : error.code === 'owned_notes_denied' ? 403 : 400);
    }
  }
}
