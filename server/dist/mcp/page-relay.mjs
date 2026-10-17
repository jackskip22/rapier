// SPDX-License-Identifier: AGPL-3.0-only
import {createKernel} from '../agent/kernel.mjs';
import {oauthGrantCurrent} from './oauth.mjs';
import {LIVE_LIMITS} from './live-session.mjs';
import {relayable, validAck, sourceHash, custodyBytes, CUSTODY_LIMITS} from './custody-wire.mjs';
import {validHandover} from './page-door.mjs';
import {queueIntent, waitingIntents, acknowledgeIntent, clearIntents} from './page-queue.mjs';
import {writeCheckpoint, closedPageRead, deleteCheckpoint} from './page-checkpoint.mjs';

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const turnId = () => 'turn_' + crypto.randomUUID().replaceAll('-', '');
const unavailable = {outcome: 'refused', reason: 'editor_unavailable'};
const ZERO_HASH = '0'.repeat(64);
const STATE_FREE = new Set(['document.rotate_capability', 'document.delete']);

export class PageRelay {
  constructor(owner, bind) {
    this.owner = owner; this.bind = bind;
    this.turns = new Map(); this.recalling = null; this.memory = null;
  }

  enabled() { return this.owner.env?.DOOR_PAGE_CUSTODY === '1'; }
  binding(head, connection = '') { return {workspace: head.documentId, connection: 'custody:' + head.capabilityHash + connection}; }
  head() { return this.owner.ctx.storage.kv.get('head'); }
  attachment(socket) { try { return socket.deserializeAttachment(); } catch { return null; } }
  holder(head = this.head()) {
    if (!head?.custody) return null;
    return this.owner.live.sockets().find(socket => this.attachment(socket)?.custody === true && this.owner.live.valid(socket, head)) || null;
  }
  send(socket, value) {
    try { socket.send(JSON.stringify(value)); return true; } catch { return false; }
  }

  intercept(socket, raw) {
    if (typeof raw !== 'string' || raw.length > LIVE_LIMITS.frameBytes || !raw.startsWith('{"type":"')) return undefined;
    const type = /^\{"type":"([a-z]{2,16})"/.exec(raw)?.[1];
    if (type === 'ack') { this.acked(socket, raw); return Promise.resolve(); }
    if (type === 'release') return this.released(socket, raw) || Promise.resolve();
    if (type === 'custody') return this.owner.exclusive(() => this.claim(socket, raw));
    if (type === 'checkpoint') return this.owner.exclusive(() => this.checkpoint(socket, raw));
    if (type === 'hello' && this.head()?.custody && this.attachment(socket)?.custody !== true)
      return this.recall().then(ok => ok ? this.owner.exclusive(() => this.owner.live.message(socket, raw)) : this.refuseJoin(socket));
    return undefined;
  }

  async claim(socket, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { message = null; }
    const head = this.head(), attached = this.owner.live.valid(socket, head);
    const refuse = reason => { this.send(socket, {type: 'custody', refused: reason}); };
    if (!this.enabled()) return refuse('custody_unavailable');
    if (!attached || attached.client || !plain(message) || attached.grant && !await oauthGrantCurrent(attached.grant, this.owner.env))
      return refuse('custody_refused');
    const verdict = typeof message.key === 'string' ? await this.owner.live.admit(head, message.key, this.binding.bind(this)) : {ok: false};
    if (!verdict.ok) return refuse('custody_refused');
    if (this.owner.live.sockets().some(other => other !== socket && this.attachment(other)?.client)) return refuse('custody_shared');
    if (head.custody) {
      if (!Number.isSafeInteger(message.rev) || message.rev < head.custody.since || !/^[a-f0-9]{64}$/.test(message.hash || '') ||
          message.hash === ZERO_HASH || message.held !== true) return refuse('custody_held');
      if (this.holder(head)) return refuse('custody_held');
      socket.serializeAttachment({...attached, client: 'custody', custody: true});
      this.memory = {rev: message.rev, hash: message.hash};
      this.send(socket, {type: 'custody', resumed: true, rev: message.rev});
      if (waitingIntents(this.owner.ctx.storage.kv).length) void this.replayQueued(socket);
      return;
    }
    const state = this.owner.readState(head), journal = this.owner.readJournal();
    const handover = {state, journal, head: {documentId: state.documentId, capabilityHash: head.capabilityHash, version: head.version, ...(head.bearer ? {bearer: true} : {}),
      inFlight: head.collaboration?.agentPresence?.inFlight || 0}};
    const frame = {type: 'custody', handover};
    if (raw.length > LIVE_LIMITS.frameBytes || custodyBytes(frame) > CUSTODY_LIMITS.handbackBytes) return refuse('custody_too_large');
    const next = {...head, custody: {since: state.revision, at: Date.now()}};
    this.owner.ctx.storage.transactionSync(() => this.owner.ctx.storage.kv.put('head', next));
    await this.owner.ctx.storage.sync();
    socket.serializeAttachment({...attached, client: 'custody', custody: true});
    this.memory = {rev: state.revision, hash: sourceHash(state.text)};
    this.send(socket, frame);
  }

  async route(input, signal) {
    const head = this.head();
    if (!head?.custody) return null;
    if (!input.page) {
      try { await this.owner.assertAuthority(input); } catch { return null; }
      if (head.ownerKey !== input.ownerKey || head.capabilityHash !== input.capabilityHash || head.expiresAt <= Date.now()) return null;
    }
    if (this.recalling) return await this.recalling ? null : this.bind.envelope(input.operation, unavailable, head);
    if (!relayable(input, head)) {
      if (await this.recall()) return null;
      if (STATE_FREE.has(input.operation)) return null;
      return this.bind.envelope(input.operation, unavailable, head);
    }
    if (head.agentAccess === false) return null;
    const socket = this.holder(head);
    if (!socket) return this.closed(input, head);
    const grant = this.attachment(socket)?.grant;
    if (this.renewDue(head) && grant && !await oauthGrantCurrent(grant, this.owner.env)) {
      this.owner.live.close(socket, 1008, 'session_unavailable');
      this.disconnected(socket);
      return this.bind.envelope(input.operation, unavailable, head);
    }
    return this.turn(socket, input, head, signal);
  }

  closed(input, head) {
    const kv = this.owner.ctx.storage.kv;
    if (input.operation === 'edit') {
      const {signal: _signal, requestKey: _key, requestExpiresAt: _expires, ...intent} = input;
      const value = this.owner.ctx.storage.transactionSync(() => queueIntent(kv, {intent, operationId: input.operationId ?? null,
        agent: {principal: this.bind.caller(input).principal}, same: {operation: input.operation, args: input.args}}));
      return this.bind.envelope(input.operation, value, head);
    }
    if (input.operation === 'read') return this.bind.envelope(input.operation, closedPageRead(kv), head);
    return this.bind.envelope(input.operation, unavailable, head);
  }

  async replayQueued(socket) {
    const kv = this.owner.ctx.storage.kv;
    for (const entry of waitingIntents(kv)) {
      const head = this.head();
      if (!head?.custody || this.holder(head) !== socket) return;
      const input = entry.intent;
      let admitted = head.agentAccess !== false && head.ownerKey === input.ownerKey && head.capabilityHash === input.capabilityHash && relayable(input, head);
      if (admitted) try { await this.owner.assertAuthority(input); } catch { admitted = false; }
      if (admitted) {
        const ack = await this.exchange(socket, input, head);
        if (ack.pending || ack.unsent) return;
        if (Number.isSafeInteger(ack.rev)) this.memory = {rev: ack.rev, hash: ack.hash};
      }
      this.owner.ctx.storage.transactionSync(() => acknowledgeIntent(kv, entry.id));
    }
  }

  checkpoint(socket, raw) {
    const head = this.head();
    if (!head?.custody || this.holder(head) !== socket || head.agentAccess === false) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const result = this.owner.ctx.storage.transactionSync(() => writeCheckpoint(this.owner.ctx.storage.kv, message || {}, {retentionMs: this.owner.retention}));
    this.send(socket, {type: 'checkpoint', outcome: result.outcome, ...(result.reason ? {reason: result.reason} : {})});
  }

  exchange(socket, input, head, signal) {
    const id = turnId(), caller = this.bind.caller(input);
    const answered = new Promise(resolve => {
      const timer = setTimeout(() => this.settle(id, {pending: true}), CUSTODY_LIMITS.turnMs);
      const abort = () => this.settle(id, {pending: true});
      signal?.addEventListener('abort', abort, {once: true});
      this.turns.set(id, {socket, resolve: value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); }});
    });
    const {signal: _signal, ...wireCaller} = caller;
    if (!this.send(socket, {type: 'turn', turn: id, operation: input.operation, args: input.args, caller: wireCaller,
      inFlight: this.bind.inFlight(input, head, caller), facts: this.bind.facts(head, input.operation)})) {
      this.turns.delete(id);
      return {unsent: true};
    }
    return answered;
  }

  async turn(socket, input, head, signal) {
    const ack = await this.exchange(socket, input, head, signal);
    if (ack.unsent) return this.bind.envelope(input.operation, unavailable, head);
    if (ack.pending) return this.bind.envelope(input.operation, {outcome: 'pending', reason: 'editor_unavailable',
      retry: 'Send the same call with the same operation_id once the editor is open; it answers what the page decided.'}, head);
    if (ack.refused) return this.bind.envelope(input.operation, {outcome: 'refused', reason: ack.refused}, head);
    this.memory = {rev: ack.rev, hash: ack.hash};
    await this.renew(head);
    const projected = {documentId: ack.head.documentId, revision: ack.head.revision, filename: ack.head.filename,
      docKind: ack.head.docKind, text: {length: ack.head.chars}};
    const described = this.owner.describe(projected, this.head(), ack.head.version, ack.collaboration);
    if (input.operation === 'open') {
      if (!plain(ack.snapshot) || typeof ack.snapshot.text !== 'string' || ack.snapshot.revision !== ack.rev) return this.bind.envelope(input.operation, unavailable, head);
      return this.bind.opened(input, ack.value, described, ack.snapshot, ack.collaboration);
    }
    return this.bind.envelope(input.operation, this.bind.decorate(input.operation, ack.value, described), described);
  }

  settle(id, value) {
    const row = this.turns.get(id);
    if (!row) return;
    this.turns.delete(id);
    row.resolve(value);
  }

  acked(socket, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const row = validAck(message) && this.turns.get(message.turn);
    if (!row || row.socket !== socket) return;
    this.settle(message.turn, message);
  }

  renewDue(head) { return head.expiresAt <= Date.now() + this.owner.retention - CUSTODY_LIMITS.renewMs; }
  async renew(head) {
    const expiresAt = Date.now() + this.owner.retention;
    if (!this.renewDue(head)) return;
    const next = {...this.head(), expiresAt};
    this.owner.ctx.storage.transactionSync(() => this.owner.ctx.storage.kv.put('head', next));
    const alarm = await this.owner.ctx.storage.getAlarm();
    if (alarm === null || alarm === head.expiresAt) await this.owner.ctx.storage.setAlarm(expiresAt);
    await this.owner.ctx.storage.sync();
  }

  recall() {
    if (this.recalling) return this.recalling;
    const head = this.head(), socket = this.holder(head);
    if (!head?.custody) return Promise.resolve(true);
    if (!socket) return Promise.resolve(false);
    this.recalling = new Promise(resolve => {
      const timer = setTimeout(() => finish(false), CUSTODY_LIMITS.recallMs);
      const finish = value => { clearTimeout(timer); if (this.recalled === finish) this.recalled = null; resolve(value); };
      this.recalled = finish; this.recallSocket = socket;
      if (!this.send(socket, {type: 'recall'})) finish(false);
    }).then(async message => {
      if (!message) return false;
      return this.owner.exclusive(() => this.adopt(message, socket));
    }).finally(() => { this.recalling = null; });
    return this.recalling;
  }

  refuseJoin(socket) {
    this.send(socket, {type: 'error', reason: 'custody_held'});
    this.owner.live.close(socket, 1008, 'custody_held');
  }

  released(socket, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { message = null; }
    const custody = validHandover(message?.custody) ? message.custody : null;
    if (socket === this.recallSocket && this.recalled) return this.recalled(custody);
    if (!custody || this.attachment(socket)?.custody !== true || !this.head()?.custody) return;
    const adopting = this.owner.exclusive(() => this.adopt(custody, socket)).finally(() => {
      if (this.recalling === adopting) this.recalling = null;
    });
    this.recalling = adopting;
    return adopting;
  }

  async adopt(custody, socket) {
    const head = this.head();
    if (!head?.custody || custody.head.capabilityHash !== head.capabilityHash || custody.state.documentId !== head.documentId ||
        custody.state.revision < head.custody.since) return false;
    const {custody: _held, ...rest} = head;
    const collaboration = createKernel({state: custody.state, host: {retainHistory: true, liveSession: true}, clock: Date.now,
      mintId: prefix => prefix + crypto.randomUUID().replaceAll('-', ''), invocationJournal: custody.journal}).collaboration();
    const next = this.owner.describe(custody.state, rest, Math.max(custody.head.version, head.version), collaboration);
    await this.owner.persist(next, custody.state, custody.journal);
    this.owner.ctx.storage.transactionSync(() => { deleteCheckpoint(this.owner.ctx.storage.kv); clearIntents(this.owner.ctx.storage.kv); });
    this.memory = null;
    this.owner.live.close(socket, 4001, 'custody_released');
    return true;
  }

  disconnected(socket) {
    for (const [id, row] of this.turns) if (row.socket === socket) this.settle(id, {pending: true});
    if (socket === this.recallSocket) this.recalled?.(null);
  }
}

