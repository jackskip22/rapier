// SPDX-License-Identifier: AGPL-3.0-only
import {createKernel, canonicalJson, admissibleText, transformSplices} from '../agent/kernel.mjs';
import {createDoc, applyEdit, rebasePresence, undoEdit, parallelSplices} from '../kernel/live-merge.mjs';
import {validateLiveAct, placedLiveAct} from '../kernel/live-act.mjs';
import {_rapierHistoryEffects, _rapierTransformMetadata, _rapierMetadataState, _rapierMetadataDelta} from '../kit/ledger/journal-records.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {resolveCaller, base64url} from '../agent/door-identity.mjs';
import {mintEditorKey, verifyEditorKey, EDITOR_KEY_LIFETIME_MS} from './editor-keys.mjs';
import {getTool} from '../agent/catalog.mjs';
import {validateInput} from '../agent/validate-input.mjs';
import {JsonDepthGuard} from '../kit/json-depth.mjs';

export const LIVE_PROTOCOL = 'rapier-live-v1';
export const LIVE_LIMITS = Object.freeze({frameBytes: 32 * 1024 * 1024, replayBytes: 1024 * 1024,
  composingMs: 15000, helloMs: 15000, contextBytes: 4 * 1024 * 1024, heldContextMs: 10 * 60 * 1000});
const utf8 = new TextEncoder();
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const known = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const secret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const refused = reason => Object.assign(new Error(reason), {liveReason: reason});
const label = value => typeof value === 'string' && value.length > 0 && [...value].length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);

function compactRequest(request, row) {
  return {...request, splices: request.splices.map(splice => {
    if (!splice.insert) return {...splice};
    for (let index = 0; index < row.splices.length; index++) {
      const at = row.splices[index].inserted.indexOf(splice.insert);
      if (at >= 0) return {...splice, insert: [index, at, splice.insert.length]};
    }
    return {...splice};
  })};
}
function expandedRequest(row) {
  return {...row.live.request, splices: row.live.request.splices.map(splice => {
    if (typeof splice.insert === 'string') return {...splice};
    const [index, at, length] = splice.insert;
    const text = row.splices[index]?.inserted;
    if (![index, at, length].every(integer) || typeof text !== 'string' || at + length > text.length) throw refused('journal_source_mismatch');
    return {...splice, insert: text.slice(at, at + length)};
  })};
}

function jsonBytes(value, limit = LIVE_LIMITS.frameBytes) {
  if (value === null) return 4;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).length : 4;
  if (typeof value === 'string') {
    let bytes = 2;
    for (let index = 0; index < value.length && bytes <= limit; index++) {
      const code = value.charCodeAt(index);
      if (code < 0x20) bytes += [8, 9, 10, 12, 13].includes(code) ? 2 : 6;
      else if (code === 34 || code === 92) bytes += 2;
      else if (code < 0x80) bytes++;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {bytes += 4; index++;}
      else bytes += code >= 0xd800 && code <= 0xdfff ? 6 : 3;
    }
    return bytes;
  }
  const entries = Array.isArray(value) ? value.map(item => [null, item]) : Object.entries(value).filter(([, item]) => item !== undefined);
  let bytes = 2;
  for (let index = 0; index < entries.length && bytes <= limit; index++) {
    const [key, item] = entries[index];
    bytes += (index ? 1 : 0) + (key === null ? 0 : jsonBytes(key, limit - bytes) + 1) +
      (item === undefined ? 4 : jsonBytes(item, limit - bytes));
  }
  return bytes;
}

function participant(row, state) {
  const kind = row.actor === 'agent' ? 'agent' : row.actor === 'system' ? 'system' : 'human';
  const name = kind === 'agent' ? row.hostAgent || row.agent || 'Agent' : kind === 'human' ? 'Person' : 'Rapier';
  if (row.author?.id && row.author.kind === row.actor)
    return {...row.author, name: label(row.author.name) ? row.author.name : label(name) ? name : kind === 'agent' ? 'Agent' : 'Person'};
  const identity = JSON.stringify([String(row.transport || 'platform'), kind, String(row.principal || 'session')]);
  return {id: state?.authorIdentities?.[identity] || 'author_' + crypto.randomUUID().replaceAll('-', ''),
    name: label(name) ? name : kind === 'agent' ? 'Agent' : 'Person', kind};
}

function liveJournal(row) {
  const value = {id: row.id, actor: row.actor, author: {...row.author}, baseRevision: row.baseRevision,
    revision: row.revision, operation: row.operation, splices: structuredClone(row.splices), createdAt: row.createdAt ?? null};
  for (const key of ['metadata', 'authored', 'label', 'turnId', 'turnLabel', 'affectedBlockIds',
    'sourceTransactionId', 'sourceTransactionIds', 'reverts', 'reapplies'])
    if (row[key] !== undefined) value[key] = structuredClone(row[key]);
  return value;
}

function record(entry, row) {
  return {type: 'edit', client: entry.client, seq: entry.seq, gen: entry.gen, splices: entry.splices,
    author: row.live.author, actId: row.id, at: row.createdAt, undoes: entry.undoes,
    act: liveJournal(row)};
}

const LIVE_GRANT_RENEW_MS = 60 * 60 * 1000;

export class LiveSessions {
  constructor(owner) { this.owner = owner; this.cached = null; }

  sockets() { return (this.owner.ctx.getWebSockets?.() || []).filter(socket => socket.readyState === 1); }
  attachment(socket) { try { return socket.deserializeAttachment(); } catch { return null; } }
  close(socket, code = 1008, reason = 'session_unavailable') { try { socket.close(code, reason); } catch {} }
  reset() { this.cached = null; }
  binding(head, connection = '') { return {workspace: head.documentId, connection: 'live:' + head.capabilityHash + connection}; }
  stopBinding(head, connection = '') { return {workspace: head.documentId, connection: 'live-stop:' + head.capabilityHash + connection}; }
  async grant(head, authority = {}) {
    if (head.liveStopped || head.agentAccess === false) return {stopped: true};
    if (this.owner.env.ACCESS_PROFILE === true) {
      const access = authority.access;
      if (access?.kind !== 'browser' || head.ownerKey !== sha256(access.ownerId) || !await this.owner.env.accessCurrent(access)) return null;
      return {key: access.principalId, stopKey: access.principalId,
        ...(this.owner.relay?.enabled() ? {custodyKey: access.principalId} : {})};
    }
    const now = Date.now(), grant = authority.oauthGrant;
    if (grant && !grant.scopes?.includes('rapier:write')) return null;
    let connection = '', issuedAt = now;
    if (grant) {
      connection = ':' + authority.connectionKey;
      const held = head.liveGrants?.[authority.connectionKey];
      if (held && held.at <= now && now - held.at < LIVE_GRANT_RENEW_MS && canonicalJson(held.grant) === canonicalJson(grant)) issuedAt = held.at;
      else {
        head.liveGrants = Object.fromEntries(Object.entries(head.liveGrants || {}).filter(([, row]) => row.at + EDITOR_KEY_LIFETIME_MS > now));
        head.liveGrants[authority.connectionKey] = {grant, at: now};
        this.owner.ctx.storage.transactionSync(() => this.owner.ctx.storage.kv.put('head', head));
      }
    }
    return {key: await mintEditorKey(this.owner.env.EDITOR_KEY_SECRET, issuedAt, this.binding(head, connection)),
      stopKey: await mintEditorKey(this.owner.env.EDITOR_KEY_SECRET, issuedAt, this.stopBinding(head, connection)),
      ...(this.owner.relay?.enabled() ? {custodyKey: await mintEditorKey(this.owner.env.EDITOR_KEY_SECRET, issuedAt, this.owner.relay.binding(head, connection))} : {})};
  }
  async admit(head, key, bind, access) {
    if (this.owner.env.ACCESS_PROFILE === true) return access?.kind === 'browser' && key === access.principalId &&
      head.ownerKey === sha256(access.ownerId) && await this.owner.env.accessCurrent(access)
      ? {ok: true, issuedAt: access.issuedAt, expiresAt: access.expiresAt, access} : {ok: false};
    const now = Date.now(), secret = this.owner.env.EDITOR_KEY_SECRET;
    const verdict = await verifyEditorKey(secret, key, now, bind(head));
    if (verdict.ok) return verdict;
    for (const [connection, row] of Object.entries(head.liveGrants || {})) {
      const bound = await verifyEditorKey(secret, key, now, bind(head, ':' + connection));
      if (bound.ok) return await this.owner.grantCurrent(row.grant) ? {...bound, grant: row.grant} : {ok: false};
    }
    return verdict;
  }
  async stop(request) {
    const head = this.owner.ctx.storage.kv.get('head');
    if (!head || head.expiresAt <= Date.now()) return new Response(null, {status: 410});
    let access;
    if (this.owner.env.ACCESS_PROFILE === true) {
      try {access = this.owner.requestAuthority(request).access;} catch {return new Response(null, {status: 403});}
    }
    const verdict = await this.admit(head, request.headers.get('X-Rapier-Live-Owner'), this.stopBinding.bind(this), access);
    if (!verdict.ok) return new Response(null, {status: 403});
    const {custody: _custody, ...current} = head;
    const next = {...current, liveStopped: true, agentAccess: false};
    await this.owner.persist(next, this.owner.readState(head), this.owner.readJournal(), false, null, undefined,
      access ? {ownerKey: head.ownerKey, access} : null);
    for (const socket of this.sockets()) {
      this.send(socket, {type: 'error', reason: 'sharing_stopped'});
      this.close(socket, 1008, 'sharing_stopped');
    }
    return new Response(JSON.stringify({stopped: true}), {headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  }

  append(doc, row) {
    const actual = transformSplices(doc.text, row.splices);
    if (actual === null || row.baseRevision !== doc.gen || row.revision !== doc.gen + 1) throw refused('journal_source_mismatch');
    if (!row.live) {
      const author = participant(row), seq = (doc.seen[author.id]?.seq || 0) + 1;
      row.live = {client: author.id, seq, author,
        request: compactRequest({gen: doc.gen, splices: parallelSplices(doc.text, row.splices, {authoredRanges: true}), agent: row.actor === 'agent'}, row)};
    }
    const result = applyEdit(doc, {...expandedRequest(row), client: row.live.client, seq: row.live.seq, actId: row.id});
    if (result.status !== 'applied' || result.gen !== row.revision || result.state.text !== actual) throw refused('journal_source_mismatch');
    const entry = result.state.log.at(-1);
    const effects = _rapierHistoryEffects([...doc.log.map(item => ({transaction: item.record.act})), {transaction: row}]);
    if (!effects.ok) throw refused('journal_source_mismatch');
    const ids = effects.references.get(row.id);
    const targets = ids.map(id => doc.log.find(item => item.actId === id)?.gen);
    if (targets.some(gen => gen === undefined) || new Set(targets).size !== targets.length ||
        entry.undoes.length && canonicalJson(entry.undoes) !== canonicalJson(targets)) throw refused('journal_source_mismatch');
    entry.undoes = targets;
    entry.actId = row.id; entry.record = record(entry, row);
    return result.state;
  }

  document(state) {
    if (this.cached?.gen === state.revision && this.cached.text === state.text) return this.cached;
    let text = state.text;
    for (let index = state.journal.length - 1; index >= 0; index--) {
      if (!state.journal[index].live) throw refused('live_history_unavailable');
      text = transformSplices(text, state.journal[index].splices, true);
      if (text === null) throw refused('journal_source_mismatch');
    }
    let doc = createDoc(text);
    const base = state.journal[0]?.baseRevision ?? state.revision;
    doc = {...doc, base, gen: base};
    for (const row of state.journal) doc = this.append(doc, row);
    if (doc.text !== state.text || doc.gen !== state.revision) throw refused('journal_source_mismatch');
    this.cached = doc;
    return doc;
  }

  prepare(state, previous) {
    if (!previous) {
      state.live = {sessions: []};
      return {...createDoc(state.text), gen: state.revision, base: state.revision};
    }
    if (!state.live || !Array.isArray(state.live.sessions)) throw refused('live_history_unavailable');
    let doc = this.document(previous);
    for (const row of state.journal) if (row.revision > doc.gen) doc = this.append(doc, row);
    if (doc.gen !== state.revision || doc.text !== state.text) throw refused('journal_source_mismatch');
    return doc;
  }

  accessAttachment(socket, head) {
    const attached = this.attachment(socket), now = Date.now();
    return attached && head && !head.liveStopped && head.agentAccess !== false &&
      head.expiresAt > now && attached.capabilityHash === head.capabilityHash && attached.access?.kind === 'browser' &&
      head.ownerKey === sha256(attached.access.ownerId) && attached.expiresAt > now &&
      (attached.client || attached.helloBy >= now) ? attached : null;
  }

  valid(socket, head) {
    if (this.owner.env.ACCESS_PROFILE === true) {
      const attached = this.accessAttachment(socket, head);
      return attached && this.owner.env.accessLease(attached.access) > Date.now() ? attached : null;
    }
    const attached = this.attachment(socket), now = Date.now();
    if (this.owner.env.LOCAL_PAGE === true) return attached && head && !head.liveStopped && head.agentAccess !== false &&
      head.expiresAt > now && attached.capabilityHash === head.capabilityHash && attached.expiresAt >= now &&
      (attached.client || attached.helloBy >= now) ? attached : null;
    return attached && head && !head.liveStopped && head.agentAccess !== false && head.expiresAt > now && attached.capabilityHash === head.capabilityHash &&
      attached.root === sha256(this.owner.env.EDITOR_KEY_SECRET) && attached.expiresAt >= now &&
      (attached.client || attached.helloBy >= now) ? attached : null;
  }

  closeUnavailable(socket, head = this.owner.ctx.storage.kv.get('head'), reason = 'session_unavailable') {
    const attached = this.owner.env.ACCESS_PROFILE === true && this.accessAttachment(socket, head);
    const refresh = attached && this.owner.env.accessRefreshNeeded?.(attached.access);
    this.close(socket, refresh ? 1011 : 1008, refresh ? 'access_refresh_required' : reason);
  }

  send(socket, value) {
    if (this.owner.env.ACCESS_PROFILE === true && !this.valid(socket, this.owner.ctx.storage.kv.get('head'))) {
      this.closeUnavailable(socket); return false;
    }
    try {
      if (jsonBytes(value) > LIVE_LIMITS.frameBytes) {
        socket.send(JSON.stringify({type: 'error', reason: 'message_too_large', limitBytes: LIVE_LIMITS.frameBytes}));
        this.close(socket, 1009, 'message_too_large'); return false;
      }
      socket.send(JSON.stringify(value)); return true;
    }
    catch { this.close(socket, 1011, 'connection_lost'); return false; }
  }

  catchUp(socket, doc) {
    const attached = this.attachment(socket);
    if (!attached?.client) return;
    for (const entry of doc.log) if (entry.gen > attached.sentGen && !this.send(socket, entry.record)) return;
    if (attached.sentGen !== doc.gen) { attached.sentGen = doc.gen; socket.serializeAttachment(attached); }
  }

  publish(doc, head) {
    this.cached = doc;
    for (const socket of this.sockets()) {
      if (!this.valid(socket, head)) { this.closeUnavailable(socket, head, head.liveStopped ? 'sharing_stopped' : 'session_unavailable'); continue; }
      this.catchUp(socket, doc);
    }
    this.broadcastPresence(head);
  }

  presences(state, head, doc = this.document(state)) {
    const peers = [];
    for (const socket of this.sockets()) {
      const attached = this.valid(socket, head);
      if (!attached?.client) continue;
      const session = state.live.sessions.find(row => row.client === attached.client);
      if (!session) continue;
      const presence = attached.presence;
      if (!presence) { peers.push({client: session.client, author: session.author, gen: doc.gen, anchor: 0, head: 0, composing: false}); continue; }
      const moved = rebasePresence(doc, presence, presence.gen, session.client);
      const composing = presence.composing && presence.at + LIVE_LIMITS.composingMs > Date.now()
        ? rebasePresence(doc, presence.composing, presence.gen, session.client) : false;
      peers.push({client: session.client, author: session.author, ...moved,
        composing: composing ? {anchor: composing.anchor, head: composing.head} : false});
    }
    const agents = new Map();
    for (const call of this.owner.readJournal()) if (call.documentId === state.documentId && call.presence?.at + LIVE_LIMITS.composingMs > Date.now()) {
      const row = call.presence, prior = agents.get(row.client);
      if (!prior || prior.at <= row.at) agents.set(row.client, row);
    }
    for (const agent of agents.values()) {
      const moved = rebasePresence(doc, agent, agent.gen, agent.client);
      peers.push({client: agent.client, author: agent.author, ...moved, composing: false});
    }
    return peers;
  }

  observe(state, journal, who, value) {
    if (who.actor !== 'agent' || value.replayed) return;
    const entry = state.journal.findLast(row => row.requestId === who.requestId && row.principal === who.principal);
    const author = participant(entry || who, state);
    let range = integer(value.start) && integer(value.end) ? value : value.matches?.[0] || value.current;
    if (entry?.splices.length) {
      const before = transformSplices(state.text, entry.splices, true);
      const rows = before === null ? [] : parallelSplices(before, entry.splices, {authoredRanges: true});
      if (rows.length) range = {start: rows[0].at, end: rows[0].at + rows[0].insert.length};
    }
    if (!integer(range?.start) || !integer(range?.end) || range.start > state.text.length || range.end > state.text.length) return;
    const call = journal.find(row => row.key === who.invocationKey && row.documentId === state.documentId);
    if (call) call.presence = {client: author.id, author, anchor: range.start, head: range.end, gen: state.revision, at: Date.now()};
  }

  broadcastPresence(head = this.owner.ctx.storage.kv.get('head')) {
    if (!head || head.expiresAt <= Date.now()) return;
    const peers = this.presences(this.owner.readState(head), head);
    for (const socket of this.sockets()) if (this.valid(socket, head)?.client) this.send(socket, {type: 'presence', peers});
  }

  notice(head, waiting) {
    return {type: 'changed', version: head.version, revision: head.revision, agent: head.agentCall?.id || null,
      waiting, expiry: Number.isFinite(head.nextExpiryAt) ? head.nextExpiryAt : null};
  }
  notify(waiting, asked = null) {
    const sockets = this.sockets();
    if (!sockets.length) return;
    const head = this.owner.ctx.storage.kv.get('head');
    if (!head || head.expiresAt <= Date.now()) return;
    const value = this.notice(head, waiting), mark = sha256(JSON.stringify(value)).slice(0, 16);
    for (const socket of sockets) {
      const attached = this.valid(socket, head);
      if (!attached?.client || attached.custody || attached.notice === mark && socket !== asked) continue;
      if (!this.send(socket, socket === asked ? {...value, check: true} : value)) continue;
      if (attached.notice !== mark) { attached.notice = mark; socket.serializeAttachment(attached); }
    }
  }

  holds(contextId) {
    if (typeof contextId !== 'string') return false;
    const head = this.owner.ctx.storage.kv.get('head');
    return this.sockets().some(socket => this.valid(socket, head)?.client && !this.attachment(socket).custody && this.attachment(socket).contextId === contextId);
  }
  async context(socket, message, head, attached) {
    if (typeof this.owner.operate !== 'function' || !known(message, ['type', 'args']) || !plain(message.args) ||
        jsonBytes(message.args) > LIVE_LIMITS.contextBytes) throw refused('invalid_context');
    let args;
    try {
      const {document, editorKey, ...rest} = validateInput(getTool('document.human_context').inputSchema,
        {...message.args, document: 'socket', editorKey: 'socket'}, 'arguments', false);
      args = rest;
    } catch { throw refused('invalid_context'); }
    if (attached.contextId !== args.contextId) {
      attached.contextId = args.contextId;
      socket.serializeAttachment(attached);
    }
    const result = await this.owner.operate({operation: 'document.human_context', args, capabilityHash: head.capabilityHash,
      ownerKey: head.ownerKey, editorAuthorized: true, operationId: crypto.randomUUID(), ...(attached.access ? {access: attached.access} : {})});
    this.send(socket, {type: 'context', sequence: args.sequence, isError: result.isError === true,
      structuredContent: result.structuredContent});
  }
  heldState(state) {
    const sockets = this.sockets();
    if (!sockets.length || !state?.humanContexts) return state;
    const head = this.owner.ctx.storage.kv.get('head'), held = new Set(sockets.map(socket => this.valid(socket, head)?.client &&
      !this.attachment(socket).custody ? this.attachment(socket).contextId : null).filter(Boolean));
    const now = Date.now(), until = now + LIVE_LIMITS.heldContextMs;
    if (!Object.values(state.humanContexts).some(row => row.visible && held.has(row.contextId) && row.expiresAt < now + 15000)) return state;
    const humanContexts = Object.fromEntries(Object.entries(state.humanContexts).map(([key, row]) =>
      [key, row.visible && held.has(row.contextId) && row.expiresAt < now + 15000 ? {...row, expiresAt: until} : row]));
    return {...state, humanContexts};
  }
  async release(socket) {
    const contextId = this.attachment(socket)?.contextId;
    if (typeof contextId !== 'string' || this.holds(contextId)) return;
    const head = this.owner.ctx.storage.kv.get('head');
    if (!head || head.expiresAt <= Date.now()) return;
    const state = this.owner.readState(head), until = Date.now() + 15000;
    let changed = false;
    for (const row of Object.values(state.humanContexts || {})) if (row.contextId === contextId && row.expiresAt > until) {
      row.expiresAt = until; changed = true;
    }
    if (!changed) return;
    const next = structuredClone(head);
    if (!(next.nextExpiryAt <= until)) next.nextExpiryAt = until;
    await this.owner.persist(next, state, this.owner.readJournal(), true);
  }

  collision(state, splices) {
    const head = this.owner.ctx.storage.kv.get('head');
    if (!head || !this.sockets().length || !splices?.length) return null;
    const doc = this.prepare(state, this.owner.readState(head));
    const composing = this.presences(state, head, doc).filter(row => row.author.kind === 'human' && row.composing)
      .map(row => ({client: row.client, ...row.composing, gen: row.gen}));
    if (!composing.length) return null;
    const result = applyEdit(doc, {client: 'composition_probe', seq: 1, gen: doc.gen,
      splices: parallelSplices(state.text, splices, {authoredRanges: true}), agent: true}, {composing});
    if (result.status !== 'held') return null;
    const [start, end] = result.range;
    return {start, end, text: state.text.slice(start, end)};
  }

  async upgrade(request) {
    const head = this.owner.ctx.storage.kv.get('head');
    const key = request.headers.get('X-Rapier-Live-Key');
    if (!head || head.expiresAt <= Date.now()) return new Response(null, {status: 404});
    if (head.liveStopped || head.agentAccess === false) return new Response(null, {status: 410});
    let access;
    if (this.owner.env.ACCESS_PROFILE === true) {
      try {access = this.owner.requestAuthority(request).access;} catch {return new Response(null, {status: 403});}
    }
    const verdict = await this.admit(head, key, this.binding.bind(this), access);
    if (!verdict.ok) return new Response(null, {status: 403});
    this.expire(head);
    const [client, server] = Object.values(new WebSocketPair());
    this.owner.ctx.acceptWebSocket(server);
    server.serializeAttachment({capabilityHash: head.capabilityHash,
      ...(access ? {access} : {root: sha256(this.owner.env.EDITOR_KEY_SECRET)}),
      expiresAt: access ? access.expiresAt : verdict.issuedAt + EDITOR_KEY_LIFETIME_MS, helloBy: Date.now() + LIVE_LIMITS.helloMs, client: null, sentGen: -1,
      ...(verdict.grant ? {grant: verdict.grant} : {})});
    const next = Math.min(head.expiresAt, this.nextAlarm());
    const alarm = await this.owner.ctx.storage.getAlarm();
    if (alarm === null || alarm > next) await this.owner.ctx.storage.setAlarm(next);
    return new Response(null, {status: 101, webSocket: client, headers: {'Sec-WebSocket-Protocol': LIVE_PROTOCOL}});
  }

  async hello(socket, message, state, head, attached) {
    if (!known(message, ['type', 'client', 'token', 'gen', 'name']) || message.gen !== undefined && !integer(message.gen) ||
        message.name !== undefined && !label(message.name) || (message.client === undefined) !== (message.token === undefined)) throw refused('invalid_hello');
    if (attached.client) throw refused('already_joined');
    const doc = this.document(state);
    const from = message.gen ?? doc.gen;
    if (from < doc.base || from > doc.gen) throw refused('generation_unavailable');
    let session, token;
    if (message.client !== undefined) {
      if (!/^peer_[a-f0-9]{32}$/.test(message.client) || !/^[A-Za-z0-9_-]{43}$/.test(message.token)) throw refused('invalid_resume');
      session = state.live.sessions.find(row => row.client === message.client && row.tokenHash === sha256(message.token));
      if (!session) throw refused('invalid_resume');
      if (message.name && message.name !== session.author.name) {
        state = structuredClone(state);
        session = state.live.sessions.find(row => row.client === message.client);
        session.author = {...session.author, name: message.name};
        await this.owner.persist(head, state, this.owner.readJournal(), false, null, undefined,
          attached.access ? {ownerKey: head.ownerKey, access: attached.access} : null);
      }
    } else {
      token = secret();
      const client = 'peer_' + crypto.randomUUID().replaceAll('-', '');
      session = {client, tokenHash: sha256(token), author: {id: client, name: message.name || 'Person ' + (state.live.sessions.length + 1), kind: 'human'}};
      state = structuredClone(state); state.live.sessions.push(session);
      await this.owner.persist(head, state, this.owner.readJournal(), false, null, undefined,
        attached.access ? {ownerKey: head.ownerKey, access: attached.access} : null);
    }
    for (const other of this.sockets()) if (other !== socket && this.attachment(other)?.client === session.client) this.close(other, 4000, 'session_resumed');
    attached.client = session.client; attached.sentGen = doc.gen;
    socket.serializeAttachment(attached);
    const records = message.gen !== undefined ? doc.log.filter(row => row.gen > from).map(row => row.record) : [];
    const batches = [[]]; let size = 0;
    for (const row of records) {
      const bytes = jsonBytes(row);
      if (size && size + bytes > LIVE_LIMITS.replayBytes) {batches.push([]); size = 0;}
      batches.at(-1).push(row); size += bytes;
    }
    if (!this.send(socket, {type: 'hello', client: session.client, ...(token ? {token} : {}), author: session.author,
      documentId: state.documentId, filename: state.filename, docKind: state.docKind, source: state.text,
      gen: doc.gen, base: doc.base, nextSeq: (doc.seen[session.client]?.seq || 0) + 1,
      records: [], ...(message.gen === undefined ? {history: state.journal.map(liveJournal), log: doc.log.map(row => row.record)}
        : message.client === undefined ? {log: doc.log.filter(row => row.gen <= from).map(row => row.record)} : {}),
      replaying: records.length > 0, peers: this.presences(state, head)})) return;
    if (records.length) {
      for (const batch of batches) if (!this.send(socket, {type: 'replay', records: batch})) return;
      this.send(socket, {type: 'ready', gen: doc.gen});
    }
    this.broadcastPresence(head);
  }

  async edit(socket, message, state, head, attached) {
    const isUndo = message.type === 'undo';
    if (!known(message, isUndo ? ['type', 'seq', 'target', 'act', 'prejoin'] : ['type', 'seq', 'gen', 'splices', 'undoes', 'undoTarget', 'act', 'prejoin']) ||
        !integer(message.seq) || message.seq < 1 || isUndo && message.target !== undefined && !integer(message.target) ||
        message.prejoin !== undefined && message.prejoin !== true ||
        !isUndo && (!integer(message.gen) || !Array.isArray(message.splices) ||
          message.splices.some(row => !known(row, ['at', 'remove', 'insert']) || !integer(row.at) || !integer(row.remove) || typeof row.insert !== 'string')))
      throw refused('invalid_edit');
    const doc = this.document(state), session = state.live.sessions.find(row => row.client === attached.client);
    const hash = sha256(canonicalJson(message));
    const retained = state.journal.find(row => row.live?.client === session.client && row.live.seq === message.seq);
    if (retained) {
      if (retained.live.wireHash !== hash) throw refused('operation_reused');
      const entry = doc.log.find(row => row.gen === retained.revision);
      this.publish(doc, head);
      this.send(socket, {type: 'ack', seq: message.seq, gen: entry.gen, status: 'duplicate', record: entry.record});
      return;
    }
    if (message.seq !== (doc.seen[session.client]?.seq || 0) + 1) throw refused('sequence_gap');
    if (state.readOnly) throw refused('document_read_only');
    let act;
    try { act = validateLiveAct(message.act, {author: session.author, allowLocal: message.prejoin === true}); }
    catch (error) { throw refused(error.code || 'live_act_invalid'); }
    if (state.journal.some(row => row.id === act.id)) throw refused('operation_reused');
    const canonical = row => ({transaction: row, splices: row.splices || [],
      ...(row.metadata ? {metadata: row.metadata} : {}), ...(row.authored ? {authored: row.authored} : {})});
    const records = state.journal.map(canonical), candidate = canonical(act);
    const effects = _rapierHistoryEffects([...records, candidate]);
    if (!effects.ok) throw refused('live_act_invalid');
    const targets = effects.references.get(act.id).map(id => doc.log.find(row => row.actId === id)?.gen);
    if (targets.some(gen => gen === undefined)) throw refused('live_act_invalid');
    const currentMetadata = {filename: state.filename, docKind: state.docKind};
    let metadata, acceptedMetadata = act.metadata;
    if (targets.length) {
      let initialMetadata = currentMetadata;
      for (let index = records.length - 1; index >= 0 && initialMetadata; index--)
        initialMetadata = _rapierTransformMetadata(initialMetadata, records[index].metadata, true);
      metadata = initialMetadata && _rapierMetadataState(initialMetadata, [...records, candidate], effects);
      acceptedMetadata = metadata && _rapierMetadataDelta(currentMetadata, metadata);
    } else metadata = _rapierTransformMetadata(currentMetadata, act.metadata);
    if (!metadata) throw refused('metadata_changed');
    let edit = isUndo ? undoEdit(doc, session.client, message.seq, message.target)
      : {client: session.client, seq: message.seq, gen: message.gen, splices: message.splices,
        ...(message.undoes !== undefined ? {undoes: message.undoes} : {}), ...(message.undoTarget !== undefined ? {undoTarget: message.undoTarget} : {})};
    edit ||= {client: session.client, seq: message.seq, gen: doc.gen, splices: []};
    edit = {...edit, agent: false, actId: act.id};
    const result = applyEdit(doc, edit);
    if (result.status !== 'applied') throw refused('edit_not_applied');
    if (canonicalJson(result.state.log.at(-1).undoes) !== canonicalJson(targets)) throw refused('live_act_inverse_mismatch');
    const invalid = admissibleText(result.state.text);
    if (invalid) throw refused(invalid);
    if (!result.splices.length && !acceptedMetadata && !targets.length) {
      this.send(socket, {type: 'ack', seq: message.seq, gen: doc.gen, status: 'superseded'}); return;
    }
    const who = resolveCaller({actor: 'human', principal: 'live:' + session.client, session: session.client,
      requestId: 'live:' + message.seq}, {transport: 'websocket'});
    const entry = {...who, ...placedLiveAct(act, result.splices), actor: 'human', baseRevision: state.revision, revision: result.gen,
      splices: result.splices.slice().reverse().map(row => ({pos: row.at, removed: state.text.slice(row.at, row.at + row.remove), inserted: row.insert}))};
    if (acceptedMetadata) entry.metadata = acceptedMetadata; else delete entry.metadata;
    const kernel = createKernel({state, clock: Date.now, mintId: prefix => prefix + crypto.randomUUID().replaceAll('-', ''),
      invocationJournal: this.owner.readJournal(), host: {retainHistory: true, liveSession: true}});
    try { kernel.reconcile({documentId: state.documentId, text: result.state.text, revision: result.gen,
      ...metadata, journal: [entry]}, who); }
    catch (error) { throw refused(/^[a-z_]{1,64}$/.test(error?.message) ? error.message : 'history_invalid'); }
    const next = kernel.snapshot(), stored = next.journal.at(-1);
    const {client, seq, ...request} = edit;
    stored.live = {client, seq, author: {...act.author}, request: compactRequest(request, stored), wireHash: hash};
    const described = this.owner.describe(next, head, head.version + 1, kernel.collaboration());
    await this.owner.persist(described, next, kernel.invocationJournal(), false, null, undefined,
      attached.access ? {ownerKey: head.ownerKey, access: attached.access} : null);
    const accepted = this.document(next).log.at(-1);
    this.send(socket, {type: 'ack', seq, gen: accepted.gen, status: 'applied', record: accepted.record});
  }

  async message(socket, raw) {
    let message;
    try {
      if (this.owner.env.ACCESS_PROFILE === true && !await this.owner.env.accessCurrent(this.attachment(socket)?.access)) {this.close(socket); return;}
      const head = this.owner.ctx.storage.kv.get('head'), attached = this.valid(socket, head);
      if (!attached || attached.grant && !await this.owner.grantCurrent(attached.grant)) {this.close(socket); return;}
      if (typeof raw !== 'string' || raw.length > LIVE_LIMITS.frameBytes || utf8.encode(raw).byteLength > LIVE_LIMITS.frameBytes) throw refused('message_too_large');
      new JsonDepthGuard(128, {failure: () => refused('message_too_deep')}).write(raw);
      try { message = JSON.parse(raw); } catch { throw refused('invalid_message'); }
      if (!plain(message)) throw refused('invalid_message');
      const state = this.owner.readState(head);
      if (message.type === 'hello') return await this.hello(socket, message, state, head, attached);
      if (!attached.client) throw refused('hello_required');
      this.catchUp(socket, this.document(state));
      if (message.type === 'edit' || message.type === 'undo') return await this.edit(socket, message, state, head, attached);
      if (message.type === 'check' && known(message, ['type'])) { this.notify(this.owner.waiting?.() ?? 0, socket); return; }
      if (message.type === 'context') return await this.context(socket, message, head, attached);
      if (message.type !== 'presence' || !known(message, ['type', 'gen', 'anchor', 'head', 'composing']) ||
          !integer(message.gen) || !integer(message.anchor) || !integer(message.head) ||
          message.composing !== undefined && message.composing !== false &&
          (!known(message.composing, ['anchor', 'head']) || !integer(message.composing.anchor) || !integer(message.composing.head))) throw refused('invalid_presence');
      const doc = this.document(state), moved = rebasePresence(doc, message, message.gen, attached.client);
      if (moved.anchor > state.text.length || moved.head > state.text.length) throw refused('invalid_presence');
      const composing = message.composing ? rebasePresence(doc, message.composing, message.gen, attached.client) : false;
      if (composing && (composing.anchor > state.text.length || composing.head > state.text.length)) throw refused('invalid_presence');
      attached.presence = {...moved, composing, at: Date.now()};
      socket.serializeAttachment(attached);
      this.broadcastPresence(head);
    } catch (error) {
      this.owner.cachedState = null; this.owner.cachedJournal = null; this.reset();
      const capacity = error.code === 'WORKSPACE_STATE_LIMIT';
      const reason = error.liveReason || (capacity ? 'workspace_state_limit' : error.code === 'DOCUMENT_UNAVAILABLE'
        ? 'session_unavailable' : error instanceof RangeError ? 'edit_conflict' : 'workspace_unacknowledged');
      this.send(socket, {type: 'error', ...(integer(message?.seq) ? {seq: message.seq} : {}),
        reason, ...(capacity && integer(error.details?.limitBytes) ? {limitBytes: error.details.limitBytes} : {})});
      if (reason === 'workspace_unacknowledged') this.close(socket, 1011, reason);
      else if (reason === 'session_unavailable') this.close(socket, 1008, reason);
    }
  }

  nextAlarm() {
    const deadlines = this.sockets().map(socket => this.attachment(socket)).filter(Boolean)
      .map(row => Math.min(row.client ? row.expiresAt : Math.min(row.expiresAt, row.helloBy),
        this.owner.env.ACCESS_PROFILE === true ? this.owner.env.accessLease(row.access) || Date.now() : Infinity));
    return deadlines.length ? Math.min(...deadlines) : Infinity;
  }

  expire(head) { for (const socket of this.sockets()) if (!this.valid(socket, head)) this.closeUnavailable(socket, head); }
  async disconnected(socket) {
    this.close(socket, 1000, 'closed'); this.broadcastPresence();
    try { await this.release(socket); } catch { this.owner.cachedState = null; this.owner.cachedJournal = null; this.reset(); }
  }
}
