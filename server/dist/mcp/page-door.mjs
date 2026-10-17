// SPDX-License-Identifier: AGPL-3.0-only
import {createKernel} from '../agent/kernel.mjs';
import {WORKER_PRESENCE, resolveCaller} from '../agent/door-identity.mjs';
import {createCommitFence} from '../agent/commit-fence.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {LiveSessions} from './live-session.mjs';
import {viewChanged, sourceHash, boundedDiff, custodyBytes, CUSTODY_LIMITS} from './custody-wire.mjs';

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const FOREVER = Number.MAX_SAFE_INTEGER;
const mintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');

class LocalSocket {
  constructor() { this.readyState = 1; this.saved = null; this.listeners = new Set(); }
  serializeAttachment(value) { this.saved = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.saved); }
  send(value) {
    if (this.readyState !== 1) throw new Error('closed');
    for (const listener of this.peer.listeners) listener(value);
  }
  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = this.peer.readyState = 3;
    this.closed = this.peer.closed = {code, reason};
    for (const listener of this.peer.closers || []) listener({code, reason});
  }
}

export function validHandover(value) {
  return plain(value) && plain(value.state) && typeof value.state.text === 'string' && Number.isSafeInteger(value.state.revision) &&
    Array.isArray(value.state.journal) && Array.isArray(value.journal) && plain(value.head) &&
    Number.isSafeInteger(value.head.version) && /^[a-f0-9]{64}$/.test(value.head.capabilityHash || '') &&
    value.head.documentId === value.state.documentId;
}

export class PageDoor {
  constructor({handover, rules, host = {}, clock = Date.now, save = null, oversize = null, handbackBytes = CUSTODY_LIMITS.handbackBytes}) {
    this.oversize = oversize; this.handbackBytes = handbackBytes; this.bearer = handover.head.bearer === true;
    if (!validHandover(handover)) throw new TypeError('custody_handover_invalid');
    if (!rules || ['analyzeMarkdown', 'checkMarkdownReferences', 'analyzeDocument'].some(name => typeof rules[name] !== 'function'))
      throw new TypeError('custody_rules_unavailable');
    this.rules = rules;
    const localSecret = secret();
    this.env = {EDITOR_KEY_SECRET: localSecret};
    this.clock = clock;
    this.extraHost = host;
    this.save = save;
    this.state = structuredClone(handover.state);
    this.journal = structuredClone(handover.journal);
    this.head = {documentId: handover.head.documentId, capabilityHash: handover.head.capabilityHash,
      version: handover.head.version, revision: this.state.revision, expiresAt: FOREVER, agentAccess: true};
    this.root = sha256(localSecret);
    const sockets = this.localSockets = [];
    const head = () => this.head;
    this.ctx = {
      getWebSockets: () => sockets.filter(socket => socket.readyState === 1),
      acceptWebSocket: socket => sockets.push(socket),
      storage: {kv: {get: key => key === 'head' ? structuredClone(head()) : undefined, put() {}, delete() {}},
        transactionSync: fn => fn(), transaction: async fn => fn(), sync: async () => {}, getAlarm: async () => null, setAlarm: async () => {}},
    };
    this.pending = Promise.resolve();
    this.live = new LiveSessions(this);
    this.agentCall = null;
    this.inFlightCount = Number.isSafeInteger(handover.head.inFlight) ? handover.head.inFlight : 0;
  }

  async grantCurrent() { return false; }

  exclusive(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }

  get cachedState() { return this.state; }
  set cachedState(_) {}
  get cachedJournal() { return this.journal; }
  set cachedJournal(_) {}
  readState() { return this.state; }
  readJournal() { return this.journal; }
  describe(state, head, version) { return {...head, revision: state.revision, version}; }
  async persist(head, state, journal) {
    const previous = this.state;
    const live = state ? this.live.prepare(state, previous) : null;
    this.head = {...this.head, ...head, expiresAt: FOREVER, revision: state ? state.revision : this.head.revision};
    if (state) this.state = state;
    if (Array.isArray(journal)) this.journal = journal;
    if (live) this.live.publish(live, this.head);
    const held = this.custody();
    await this.save?.(held);
    if (this.oversize && this.state.text.length * 16 > this.handbackBytes && custodyBytes(held) > this.handbackBytes) this.oversize();
  }

  connect() {
    const client = new LocalSocket(), server = new LocalSocket();
    client.peer = server; server.peer = client;
    server.listeners.add(raw => { void this.exclusive(() => this.live.message(server, raw)); });
    server.closers = [() => { void this.exclusive(() => this.live.disconnected(server)); }];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({capabilityHash: this.head.capabilityHash, root: this.root, expiresAt: FOREVER,
      helloBy: FOREVER, client: null, sentGen: -1});
    return client;
  }

  headView(collaboration = createKernel({state: this.state, host: {retainHistory: true, liveSession: true}, clock: this.clock, mintId}).collaboration()) {
    const state = this.state;
    return {head: {documentId: state.documentId, revision: state.revision, filename: state.filename, docKind: state.docKind,
      chars: state.text.length, version: this.head.version}, collaboration, rev: state.revision, hash: sourceHash(state.text)};
  }

  presentationBinding() {
    const state = this.state;
    const row = Object.values(state.humanContexts || {}).filter(row => row.visible && row.expiresAt > this.clock() && row.revision === state.revision)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return row ? {contextId: row.contextId, contextOwner: row.owner, navigationSequence: row.navigationSequence || 0} : null;
  }

  turn(intent) {
    return this.exclusive(async () => {
      const {operation, args, caller, inFlight = [], facts = {}} = intent;
      const before = this.state, journal = this.journal;
      const kernelHost = {retainHistory: true};
      if (journal.some(row => row.key === caller.invocationKey || row.spent?.some(([key]) => key === caller.invocationKey))) {
        const replay = createKernel({state: before, host: {retainHistory: true, liveSession: true}, invocationJournal: journal, inFlight,
          clock: this.clock, mintId}).replay(operation, args, caller);
        if (replay) return this.answer(replay, before, []);
      }
      const live = this.live, door = this;
      let state = before;
      const kernel = createKernel({state, inFlight, host: {...kernelHost, ...this.extraHost,
        get liveSession() { return live.sockets().some(socket => !!live.valid(socket, door.head)?.client); },
        liveComposition: splices => live.collision(kernel.snapshot(), splices), exportScope: true,
        markdown: this.rules.analyzeMarkdown, referenceCheck: this.rules.checkMarkdownReferences,
        commitFence: createCommitFence(() => kernel, () => state.text, this.rules.analyzeMarkdown),
        drawingPresentationBinding: () => this.presentationBinding(),
        view: () => ({current: kernel.collaboration().presence?.view || null}),
        editorContext: () => facts.editorContext || {preferences: null, receipts: []},
        ...(!this.extraHost.paintBrushes && facts.paintBrushes ? {paintBrushes: () => facts.paintBrushes} : {}),
        ...(!this.extraHost.material && facts.material ? {material: () => null} : {}),
        returns: () => facts.returns || [],
      }, clock: this.clock, mintId, invocationJournal: journal});
      const who = {...caller, signal: AbortSignal.timeout(60000)};
      if (operation === 'open') return this.observe(kernel, args, caller, before);
      let value = await kernel.invoke(operation, args, {...who, world: {presence: WORKER_PRESENCE}});
      for (let guard = 0; guard < 4 && value.outcome === 'pending' && value.pending?.kind === 'surface-fact'; guard++) {
        const requirements = value.pending.requirements;
        if (!requirements || !['outline', 'find'].includes(requirements.mode) || state.filename !== requirements.filename) break;
        const fact = {mode: requirements.mode, revision: state.revision, filename: state.filename,
          ...(requirements.mode === 'find' ? {query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset} : {}),
          value: await this.rules.analyzeDocument({text: state.text, filename: state.filename, mode: requirements.mode,
            ...(requirements.mode === 'find' ? {docKind: requirements.docKind, query: requirements.query, kind: requirements.kind, within: requirements.within, offset: requirements.offset} : {})})};
        value = await kernel.invoke(operation, args, {...who, continues: value.pending.requestId, world: {presence: WORKER_PRESENCE, structure: fact}});
      }
      const next = kernel.snapshot(), collaboration = kernel.collaboration();
      state = next;
      if (value.replayed) return this.answer(value, before, [], collaboration);
      const changed = viewChanged(before, next) || this.inFlightCount !== collaboration.agentPresence.inFlight;
      this.inFlightCount = collaboration.agentPresence.inFlight;
      const head = {...this.head, version: this.head.version + (changed ? 1 : 0)};
      const calledBy = typeof args.agent === 'string' && args.agent.trim() ? args.agent.trim().slice(0, 24) : typeof caller.hostAgent === 'string' ? caller.hostAgent.slice(0, 24) : '';
      this.agentCall = {id: caller.requestId, at: this.clock(), operation, ...(calledBy ? {name: calledBy} : {})};
      const nextJournal = kernel.invocationJournal();
      live.observe(next, nextJournal, {...caller, ...(args.agent ? {agent: args.agent} : {})}, value);
      await this.persist(head, next, nextJournal);
      return this.answer(value, before, next.journal.filter(row => row.revision > before.revision), collaboration);
    });
  }

  async observe(kernel, args, caller, before) {
    const value = await kernel.invoke('open', typeof args.agent === 'string' ? {agent: args.agent} : {},
      {...resolveCaller({actor: 'agent', principal: caller.principal, requestId: mintId('observation_')}, {transport: 'mcp'}),
        world: {presence: WORKER_PRESENCE}});
    const next = kernel.snapshot(), collaboration = kernel.collaboration();
    const changed = viewChanged(before, next) || this.inFlightCount !== collaboration.agentPresence.inFlight;
    this.inFlightCount = collaboration.agentPresence.inFlight;
    await this.persist({...this.head, version: this.head.version + (changed ? 1 : 0)}, next, kernel.invocationJournal());
    const {documentId, revision, text, filename, docKind, journal, history, compare} = next;
    return {...this.answer(value, before, [], collaboration),
      snapshot: {documentId, revision, text, filename, docKind, journal, history: {complete: history.complete === true}, compare: compare || null}};
  }

  answer(value, before, rows, collaboration) {
    const view = this.headView(collaboration);
    return {outcome: value.outcome || 'ok', value, ...view, act_id: value.act?.id ?? null, diff: boundedDiff(rows)};
  }

  humanContext(args, who) {
    return this.exclusive(async () => {
      const kernel = createKernel({state: this.state, host: {retainHistory: true, liveSession: true}, clock: this.clock, mintId, invocationJournal: this.journal});
      const value = kernel.humanContext(args, who);
      this.state = kernel.snapshot();
      return value;
    });
  }

  async context(args) {
    const who = {...resolveCaller({actor: 'human', principal: 'remote:' + this.head.capabilityHash, session: 'editor', requestId: args.contextId},
      {transport: 'mcp'}), serverNow: this.clock()};
    const value = await this.humanContext(args, who);
    return {structuredContent: {...value, outcome: value.outcome || 'ok', contextId: args.contextId, contextExpiresAt: value.expiresAt ?? null,
      ...(value.outcome === 'conflict' ? {code: 'HUMAN_CONTEXT_STALE'} : {})},
      ...(['refused', 'invalid', 'conflict', 'yielded', 'target_gone'].includes(value.outcome) ? {isError: true} : {})};
  }

  sync(args = {}) {
    return this.exclusive(async () => {
      const state = this.state, head = this.head;
      const call = this.agentCall;
      const agent = call ? {agent: {id: call.id, ago: Math.max(0, this.clock() - call.at), operation: call.operation, ...(call.name ? {name: call.name} : {})}} : {};
      if (args.afterVersion === head.version && (args.afterRevision === undefined || args.afterRevision === state.revision))
        return {structuredContent: {outcome: 'current', unchanged: true, ...agent, documentId: state.documentId, revision: state.revision, version: head.version}};
      const collaboration = createKernel({state, host: {retainHistory: true, liveSession: true}, clock: this.clock, mintId, invocationJournal: this.journal}).collaboration();
      const compare = state.compare ? {id: state.compare.id, revision: state.compare.revision, baseline: state.compare.baseline, incoming: state.compare.incoming,
        name: state.compare.name, ...(state.compare.turnId ? {turnId: state.compare.turnId} : {}), changes: state.compare.changes.map(({id, start, end, incomingStart, incomingEnd, removed, inserted}) =>
          ({id, start, end, incomingStart, incomingEnd, removed, inserted}))} : null;
      const snapshot = {documentId: state.documentId, revision: state.revision, text: state.text, filename: state.filename, docKind: state.docKind,
        journal: state.journal, historyComplete: state.history.complete === true, compare, collaboration, viewIntent: null,
        ...(this.bearer ? {} : {agentAccess: true})};
      return {structuredContent: {outcome: 'current', unchanged: false, ...agent, documentId: state.documentId, revision: state.revision,
        version: head.version, filename: state.filename, docKind: state.docKind, chars: state.text.length}, _meta: {rapier: {snapshot}}};
    });
  }

  custody() {
    return {state: structuredClone(this.state), journal: structuredClone(this.journal),
      head: {documentId: this.head.documentId, capabilityHash: this.head.capabilityHash, version: this.head.version, ...(this.bearer ? {bearer: true} : {})},
      rev: this.state.revision, hash: sourceHash(this.state.text)};
  }
}
