// SPDX-License-Identifier: AGPL-3.0-only
import {applySplices, parallelSplices, reconcileQueue, undoQueue, rebasePresence, mergeSplices, inverseSplices} from '../kernel/live-merge.mjs';
import {_rapierTransformSplices as transformSplices, _rapierTransformMetadata as transformMetadata,
  _rapierHistoryEffects as historyEffects} from '../kit/ledger/journal-records.mjs';
import {sha256, rootAfter} from '../kit/ledger/hash.mjs';
import {readLedger} from '../kit/ledger/format.mjs';
import {canonicalJSON} from '../kit/ledger/data.mjs';
import {authoredBasis, authoredPlacement} from '../kit/ledger/transport.mjs';
import {canonicalLiveAct, placedLiveAct} from '../kernel/live-act.mjs';
import {initialLiveLedger, carriedLiveLedger, appendLiveJournal, liveLedgerPatch, liveRows} from './live-ledger.mjs';
import {createPrivateInvitation, sealPrivate, openPrivateInitial, openPrivatePresence, openPrivateRecord, privateAuthor} from './live-private.mjs';
import {PRIVATE_LIVE_PROTOCOL, privateId, privatePeer, privateInteger, privateSecret} from '../kernel/live-private-wire.mjs';

function movePresence(source, presence, changes, client) {
  let text = source;
  const log = changes.map((entry, index) => {
    const undo = inverseSplices(text, entry.splices); text = applySplices(text, entry.splices);
    return {...entry, undo, gen: index + 1};
  });
  return rebasePresence({text, base: 0, gen: log.length, log}, presence, 0, client);
}

function freshPlainLog(message) {
  if (!Array.isArray(message.log) || !Array.isArray(message.history) || message.log.length !== message.gen ||
      message.history.length !== message.log.length) throw new Error('live_history_unavailable');
  let source = message.source, metadata = {filename: message.filename, docKind: message.docKind};
  for (let index = message.history.length - 1; index >= 0; index--) {
    const act = message.history[index], entry = message.log[index];
    if (!act || act.id !== entry.actId || act.revision !== index + 1 || act.baseRevision !== index || entry.gen !== index + 1)
      throw new Error('live_history_invalid');
    source = transformSplices(source, act.splices, true);
    metadata = transformMetadata(metadata, act.metadata, true);
    if (source === null || !metadata) throw new Error('live_history_invalid');
  }
  const baseline = initialLiveLedger({documentId: message.documentId, source, ...metadata});
  const log = message.log.map((entry, index) => {
    const act = message.history[index], undo = inverseSplices(source, entry.splices);
    const next = applySplices(source, entry.splices);
    if (transformSplices(source, act.splices) !== next) throw new Error('live_history_invalid');
    source = next; return {...entry, act, undo};
  });
  if (source !== message.source) throw new Error('live_snapshot_mismatch');
  return {log, baseline};
}

function joinedBaselineLog(rows, source, gen) {
  if (!Array.isArray(rows) || rows.length && rows.at(-1).gen !== gen) throw new Error('live_history_unavailable');
  let text = source;
  for (let index = rows.length - 1; index >= 0; index--) {
    const entry = rows[index];
    if (!entry?.act || entry.actId !== entry.act.id || entry.gen !== gen - (rows.length - 1 - index)) throw new Error('live_history_invalid');
    text = transformSplices(text, entry.act.splices, true);
    if (text === null) throw new Error('live_history_invalid');
  }
  return rows.map(entry => {
    const undo = inverseSplices(text, entry.splices), next = applySplices(text, entry.splices);
    if (transformSplices(text, entry.act.splices) !== next) throw new Error('live_history_invalid');
    text = next; return {...entry, undo, baseline: true};
  });
}

function durableStore(indexedDB, name, slot) {
  let opened;
  const open = () => opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('live_store_blocked'));
  });
  return {
    async read() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('sessions').objectStore('sessions').get(slot);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },
    async write(value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put(value, slot);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('live_store_failed'));
      });
    },
    async close() { if (opened) (await opened).close(); },
  };
}

export function createLiveClient({post, socket: Socket, store, clock, timer, cancelTimer, fetch: fetcher}) {
  let descriptor, state, ws, stopped = false, connected = false, greeted = false, replaying = false;
  let serial = Promise.resolve(), reconnect = 0, retry = 0, retryDelay = 300, received = 0;
  let view = '', localSerial = 0, projectionId = 0, projection = null, ready = false, mounted = false, presence = null;
  let corrections = [], privateFresh = false, canonical = null, inFlight = null;
  let pendingActs = [], remotePeers = [], lastStatus = '', lastError = '';
  const emit = value => post(value);
  const status = () => {
    let canUndo = false, canRedo = false;
    try {
      canUndo = !!((state?.client || state?.initial) && undoQueue(state.base, state.log, state.pending, state.client, state.nextSeq));
      canRedo = !!((state?.client || state?.initial) && state.redo?.length && undoQueue(state.base, state.log, state.pending,
        state.client, state.nextSeq, state.redo.at(-1)));
    } catch (_) {}
    const value = {type: 'status', state: lastError ? 'stopped' : !connected ? 'offline' : !ready ? 'connecting' : state.pending.length ? 'syncing' : 'live',
      ready, gen: state?.gen ?? 0, pending: state?.pending?.length ?? 0, client: state?.client || '',
      author: state?.author || null, received, atLocal: localSerial, saved: !lastError, error: lastError,
      canUndo,
      canRedo, encrypted: !!descriptor?.private, canStop: lastError !== 'sharing_stopped' && (descriptor?.private
        ? !!state?.private?.owner && !state.private.stopped : !!state?.stopKey && !state.sharingStopped)};
    const signature = JSON.stringify(value);
    if (signature !== lastStatus) { lastStatus = signature; emit(value); }
  };
  const fail = error => {
    lastError = String(error?.message || error || 'live_session_failed');
    cancelTimer(retry); cancelTimer(reconnect); retry = reconnect = 0;
    status();
  };
  const run = action => {
    serial = serial.then(action).catch(fail);
    return serial;
  };
  const save = async () => { await store.write({...state, url: descriptor.url,
    ui: {...state.ui, source: view}, corrections}); };
  const ledgerFor = () => canonical ||= carriedLiveLedger(state.baselineLedger, state.log.filter(row => !row.baseline), state.pending, state.text);
  const checkpoint = (revision, root, journal = null, carried = null) => {
    const prior = state.ui, checkpoints = prior?.checkpoints?.slice() || [];
    let ledger = carried;
    if (journal) {
      const tx = journal.transaction, before = transformSplices(view, journal.splices, true);
      if (!prior?.ledger || before === null || tx.documentAuthority !== state.documentId || tx.baseRevision !== prior.revision ||
          tx.revision !== revision || journal.beforeHash !== prior.root || journal.afterHash !== root ||
          sha256(before) !== prior.digest || journal.splices.reduce(rootAfter, prior.root) !== root)
        throw new Error('live_checkpoint_history_mismatch');
      ledger = appendLiveJournal(prior.ledger, journal, view);
    }
    ledger ||= prior?.ledger;
    const checked = readLedger(ledger, view);
    if (checked.revision !== revision || checked.root !== root || ledger.documentAuthority !== state.documentId)
      throw new Error('live_checkpoint_history_mismatch');
    if (prior?.ledger && prior.ledger.sha256 !== ledger.sha256)
      checkpoints.push({revision: prior.revision, root: prior.root, digest: prior.digest, sha256: prior.ledger.sha256});
    let bytes = 0;
    for (let index = checkpoints.length - 1; index >= 0; index--) {
      bytes += new TextEncoder().encode(JSON.stringify(checkpoints[index])).length;
      if (bytes > 4 * 1024 * 1024) { checkpoints.splice(0, index + 1); break; }
    }
    state.ui = {revision, root, digest: sha256(view), checkpoints, ledger};
  };
  const packet = value => {
    if (descriptor.private && !['hello', 'private-edit', 'private-presence'].includes(value.type)) throw new Error('live_private_plaintext_refused');
    if (!ws || ws.readyState !== 1 || !connected) return false;
    ws.send(JSON.stringify(value));
    return true;
  };
  const projectedPeers = () => {
    if (!state?.client) return;
    let text = view;
    const back = corrections.map(row => {
      const splices = inverseSplices(text, row.splices); text = applySplices(text, row.splices);
      return {client: row.client, splices};
    }).reverse();
    const acknowledged = {text: state.base, gen: state.gen, base: state.log.length ? state.log[0].gen - 1 : state.gen, log: state.log};
    const rows = [];
    for (const peer of remotePeers) {
      if (peer.client === state.client) continue;
      try {
        const known = rebasePresence(acknowledged, peer, peer.gen ?? state.gen, peer.client);
        const at = movePresence(state.base, known, [...state.pending, ...back], peer.client);
        rows.push({...peer, ...at, gen: state.gen});
      } catch (_) { rows.push({...peer, anchor: null, head: null}); }
    }
    emit({type: 'peers', peers: rows, atLocal: localSerial});
  };
  const project = () => {
    if (!mounted || projection || stopped || lastError) return;
    const ledger = ledgerFor();
    if (!corrections.length && state.ui?.ledger?.sha256 === ledger.sha256) {
      if (view !== state.text) throw new Error('live_projection_history_missing');
      if (pendingActs.length) { emit({type: 'acts', acts: pendingActs}); pendingActs = []; }
      projectedPeers();
      return;
    }
    let text = view; const rows = [];
    for (const correction of corrections) {rows.push(...liveRows(text, correction.splices)); text = applySplices(text, correction.splices);}
    if (text !== state.text) throw new Error('live_projection_history_missing');
    projection = {id: ++projectionId, atLocal: localSerial, text, before: view,
      splices: parallelSplices(view, rows), ledger, correctionCount: corrections.length, actCount: pendingActs.length,
      acts: [...pendingActs, ...corrections.flatMap(row => row.act ? [row.act] : [])]};
    emit({type: 'project', ...projection});
  };
  const sendPresence = async () => {
    if (!ready || !presence || lastError) return;
    let text = state.base;
    const back = state.pending.map(row => {
      const splices = inverseSplices(text, row.splices); text = applySplices(text, row.splices);
      return {client: row.client, splices};
    }).reverse();
    try {
      const changes = [...corrections, ...back], at = movePresence(view, presence, changes, state.client);
      const composing = presence.composing ? movePresence(view, presence.composing, changes, state.client) : false;
      const value = {gen: state.gen, anchor: at.anchor, head: at.head,
        composing: composing ? {anchor: composing.anchor, head: composing.head} : false};
      if (descriptor.private) packet({type: 'private-presence', ciphertext: await sealPrivate(descriptor.private, 'presence',
        {...value, author: state.author}, state.client)});
      else packet({type: 'presence', ...value});
    } catch (_) {
    }
  };
  const send = async (retrying = false) => {
    if (!ready || stopped || lastError || !state.pending.length) { status(); return; }
    const head = state.pending[0];
    if (!retrying && inFlight?.socket === ws && inFlight.seq === head.seq) { status(); return; }
    if (!head.sent) {
      const undoes = head.undoTargets ? head.undoTargets.map(target => {
        const entry = state.log.find(row => row.client === target.client && row.seq === target.seq);
        if (!entry) throw new Error('live_undo_history_unavailable');
        return entry.gen;
      }) : head.undoes;
      head.sent = {type: 'edit', seq: head.seq, gen: state.gen, splices: head.splices, act: structuredClone(head.act),
        ...(head.undoTarget ? {undoTarget: head.undoTarget} : {}),
        ...(undoes ? {undoes} : {}), ...(head.prejoin ? {prejoin: true} : {})};
      await save();
    }
    if (descriptor.private && !head.ciphertext) {
      head.ciphertext = await sealPrivate(descriptor.private, 'edit', head.sent, state.client, head.seq);
      await save();
    }
    if (packet(descriptor.private ? {type: 'private-edit', seq: head.seq, ciphertext: head.ciphertext} : head.sent)) {
      const sent = inFlight = {socket: ws, seq: head.seq};
      cancelTimer(retry);
      retry = timer(() => run(() => { if (inFlight === sent) return send(true); }), 4000);
    }
    status();
  };
  const typingBurst = last => {
    const history = [...state.log, ...state.pending];
    let index = history.findIndex(row => row.client === last?.client && row.seq === last.seq);
    const typed = row => row?.act?.operation === 'document.edit-block' && row.act.affectedBlockIds?.length === 1 &&
      !row.undoTarget && !row.undoTargets && !row.act.metadata;
    const time = row => Number(row.act.createdAt);
    if (index < 0 || !typed(history[index])) return null;
    const group = [history[index]];
    while (index > 0) {
      const before = history[index - 1], after = history[index];
      if (before.client !== last.client) break;
      if (!typed(before) || before.act.affectedBlockIds[0] !== after.act.affectedBlockIds[0] ||
          before.act.author?.id !== after.act.author?.id || !(time(after) - time(before) <= 2000)) break;
      group.unshift(before); index--;
    }
    return group.length > 1 ? group.map(row => ({client: row.client, seq: row.seq})) : null;
  };
  const placePending = () => {
    const placed = new Set();
    for (const row of state.pending) {
      if (placedLiveAct(row.act, row.splices) !== row.act) placed.add(row.actId);
      else if (!row.sent && row.act.authored?.basis.some(id => placed.has(id))) {
        const {authored: _, ...act} = row.act;
        row.act = act; placed.add(row.actId);
      }
    }
  };
  const superseded = seq => {
    const head = state.pending[0];
    if (!head || head.seq !== seq || head.splices.length || head.undoTarget || head.undoTargets || head.undoes != null ||
        state.pending.slice(1).some(row => row.sent)) throw new Error('live_superseded_mismatch');
    const renumber = target => target.client === state.client && target.seq > seq ? {...target, seq: target.seq - 1} : target;
    state.pending = state.pending.slice(1).map(row => ({...row, seq: row.seq - 1,
      ...(row.undoTarget ? {undoTarget: renumber(row.undoTarget)} : {}),
      ...(row.undoTargets ? {undoTargets: row.undoTargets.map(renumber)} : {})}));
    state.redo = state.redo.map(renumber);
    state.nextSeq--;
    inFlight = null; cancelTimer(retry); retry = 0; canonical = null;
    return true;
  };
  const accepted = entry => {
    if (!Number.isSafeInteger(entry?.gen) || !Array.isArray(entry.splices) || entry.actId !== entry.act?.id)
      throw new Error('live_record_invalid');
    if (entry.gen <= state.gen) return false;
    if (entry.gen !== state.gen + 1) throw new Error('live_generation_gap');
    const undo = inverseSplices(state.base, entry.splices);
    const localId = state.pending.find(row => row.client === entry.client && row.seq === entry.seq)?.localId;
    const witnessed = {...entry, undo, ...(localId ? {localTransactionId: localId} : {})};
    const result = reconcileQueue(state.base, state.pending, entry, [...state.log, witnessed]);
    if (result.splices.length) corrections.push({client: entry.client, actId: entry.actId, splices: result.splices, act: witnessed});
    else pendingActs.push(witnessed);
    state.base = result.base; state.text = result.text; state.pending = result.pending;
    placePending();
    state.gen = entry.gen;
    state.log.push(witnessed);
    canonical = null;
    received++;
    if (result.accepted) { cancelTimer(retry); retry = 0; }
    return true;
  };
  const enqueue = value => {
    if (value.baseRevision != null && state.ui && (value.baseRevision !== state.ui.revision || value.beforeRoot !== state.ui.root))
      throw new Error('live_local_history_mismatch');
    const nextView = transformSplices(view, value.splices);
    if (nextView === null) throw new Error('live_local_source_mismatch');
    if (!value.journal || value.journal.transaction.id !== value.id || !state.ui?.ledger) throw new Error('live_local_act_missing');
    const raw = parallelSplices(view, value.splices, {authoredRanges: true});
    const act = canonicalLiveAct(value.journal, {source: view, basis: authoredBasis(state.ui.ledger.records)});
    const pending = {client: state.client, seq: state.nextSeq, splices: raw, localId: value.id, actId: act.id, act,
      ...(state.client ? {} : {prejoin: true})};
    const navigation = value.journal?.transaction, history = [...state.log, ...state.pending];
    const effects = historyEffects([...state.ui.ledger.records, value.journal]);
    if (!effects.ok) throw new Error('live_local_effect_invalid');
    const references = effects.references.get(act.id);
    const targets = references.map(id => history.find(row => row.actId === id)).filter(Boolean);
    const target = targets.length === 1 && references.length === 1 ? targets[0] : null;
    if (targets.length < references.length && !state.client) pending.references = references;
    else if (target) pending.undoTarget = {client: target.client, seq: target.seq};
    else if (targets.length) pending.undoTargets = targets.map(row => ({client: row.client, seq: row.seq}));
    let authored = raw;
    const movedCorrections = [];
    for (const correction of corrections) {
      const moved = mergeSplices(pending.actId, authored, [correction]);
      authored = moved.splices;
      if (moved.remote.length) movedCorrections.push({...correction, splices: moved.remote[0].splices});
      else if (correction.act) pendingActs.push(correction.act);
    }
    pending.splices = authored; corrections = movedCorrections; view = nextView;
    if (raw.length || act.metadata || effects.references.get(act.id).length) {
      state.nextSeq++; state.pending.push(pending); state.text = applySplices(state.text, pending.splices);
      if (navigation?.reverts && target) state.redo.push({client: state.client, seq: pending.seq});
      else if (navigation?.reapplies && target) state.redo.pop();
      else state.redo = [];
    }
    checkpoint(value.revision, value.root, value.journal);
    canonical = null;
  };
  const recover = local => {
    if (!state.ui?.ledger || !local || local.ledger?.documentAuthority !== state.documentId) return;
    const checked = readLedger(local.ledger, local.source), current = state.ui.ledger;
    if (checked.ledger.sha256 === current.sha256) return;
    const accepted = ledgerFor();
    if (checked.ledger.sha256 === accepted.sha256) {
      view = local.source; corrections = []; pendingActs = [];
      checkpoint(checked.revision, checked.root, null, checked.ledger); return;
    }
    const samePrefix = (before, after) => before.records.length <= after.records.length &&
      before.start.root === after.start.root && before.start.text === after.start.text &&
      before.records.every((row, index) => canonicalJSON(row) === canonicalJSON(after.records[index]));
    const known = state.ui.checkpoints.some(row => row.sha256 === local.ledger.sha256 && row.revision === checked.revision &&
      row.root === checked.root && row.digest === sha256(local.source)) || samePrefix(local.ledger, current);
    if (known) {
      const splices = liveLedgerPatch(local.ledger, current), last = current.records.at(-1)?.transaction;
      if (!last) throw new Error('live_recovery_history_missing');
      return {before: local.source, revision: checked.revision, root: checked.root,
        records: [{transaction: last, splices}], ledger: current, acts: state.log};
    }
    const prefix = [current, accepted].find(value => samePrefix(value, local.ledger));
    if (!prefix) throw new Error('live_recovery_branch_unproven');
    if (prefix.sha256 !== current.sha256) {
      view = readLedger(prefix).text; corrections = []; pendingActs = [];
      checkpoint(prefix.head.revision, prefix.head.root, null, prefix);
    }
    const suffix = local.ledger.records.slice(prefix.records.length);
    if (!suffix.length) throw new Error('live_recovery_branch_unproven');
    for (const row of suffix) {
      if (row.transaction.actor?.kind !== 'human' || row.transaction.actor.id !== state.author?.id &&
          !(state.prejoined && row.transaction.actor.id === 'local')) throw new Error('live_recovery_author_unproven');
      enqueue({id: row.transaction.id, splices: row.splices, revision: row.transaction.revision, root: row.afterHash,
        baseRevision: row.transaction.baseRevision, beforeRoot: row.beforeHash, journal: row});
    }
    if (view !== local.source || state.ui.ledger.sha256 !== local.ledger.sha256) throw new Error('live_recovery_branch_unproven');
  };
  const completeHello = async () => {
    if (state.expected && (state.gen !== state.expected.gen || (descriptor.private
      ? state.private.transcript !== state.expected.transcript : state.base !== state.expected.source))) throw new Error('live_snapshot_mismatch');
    if (privateFresh) {
      view = state.text; corrections = []; pendingActs = [];
      privateFresh = false;
    }
    delete state.expected;
    ready = true; replaying = false;
    await save();
    if (!greeted) {
      greeted = true;
      emit({type: 'ready', source: view, gen: state.gen, client: state.client, author: state.author,
        documentId: descriptor.documentId, filename: descriptor.filename, docKind: descriptor.docKind, recovered: state.pending.length > 0,
        ledger: state.ui?.ledger || ledgerFor(),
        initial: state.initial === true, acts: state.log, ...(!state.pending.length && !corrections.length && view === state.base
          ? {history: state.log.map(row => row.act)} : {})});
    }
    project();
    if (descriptor.private && !presence) presence = {anchor: 0, head: 0, composing: false};
    await sendPresence(); await send(); status();
  };
  const receivePrivate = async message => {
    const config = descriptor.private;
    const accept = async row => {
      if (!privateInteger(row?.gen, 1)) throw new Error('live_private_record_invalid');
      if (row.gen <= state.gen) {
        const known = state.log.find(entry => entry.gen === row.gen);
        if (!known || known.client !== row.client || known.seq !== row.seq || known.wireDigest !== sha256(row.ciphertext) ||
            known.transcript !== row.digest) throw new Error('live_private_replay_changed');
        return false;
      }
      const result = await openPrivateRecord(config, row, {text: state.base, gen: state.gen,
        base: state.log[0]?.gen - 1 || 0, log: state.log, seen: state.private.seen,
        baselineRecords: state.baselineLedger.records, baselineRevision: state.baselineLedger.head.revision}, state.private.transcript);
      accepted(result.entry); state.private.seen = result.seen; state.private.transcript = result.transcript; return true;
    };
    if (message.type === 'private-hello') {
      if (message.id !== config.id || !privatePeer(message.client) || !privateInteger(message.gen) || message.gen < state.gen ||
          state.client && state.client !== message.client || !state.client && !privateSecret(message.token))
        throw new Error('live_private_hello_invalid');
      const opened = await openPrivateInitial(config, message.ciphertext, state.private.initialDigest);
      const initial = opened.initial;
      if (state.documentId && state.documentId !== initial.documentId || descriptor.requestedId && descriptor.requestedId !== initial.documentId)
        throw new Error('live_document_identity_changed');
      state.private.initialDigest = opened.digest;
      state.private.transcript ||= opened.digest;
      descriptor.documentId = state.documentId = initial.documentId;
      descriptor.filename = state.filename = initial.filename; descriptor.docKind = initial.docKind;
      if (state.baselineLedger && state.baselineLedger.sha256 !== initial.ledger.sha256)
        throw new Error('live_private_initial_changed');
      state.baselineLedger = initial.ledger; canonical = null;
      if (!state.client) {
        state.client = message.client; state.token = message.token;
        if (state.initial) {
          if (state.gen !== 0 || state.base !== initial.source) throw new Error('live_initial_baseline_invalid');
          state.pending = state.pending.map(row => ({...row, client: state.client,
            ...(row.undoTarget ? {undoTarget: {...row.undoTarget, client: row.undoTarget.client || state.client}} : {}),
            ...(row.undoTargets ? {undoTargets: row.undoTargets.map(target => ({...target, client: target.client || state.client}))} : {})}));
          corrections = corrections.map(row => row.client ? row : {...row, client: state.client,
            ...(row.act ? {act: {...row.act, client: state.client}} : {})});
          state.redo = state.redo.map(row => ({...row, client: row.client || state.client}));
        } else {
          state.base = state.text = view = initial.source; state.gen = 0; state.pending = []; state.log = [];
          state.private.seen = {}; state.private.transcript = opened.digest; privateFresh = true;
        }
      }
      state.author = privateAuthor(state.client, state.author?.name || descriptor.name || 'Guest');
      state.nextSeq = Math.max(state.nextSeq, Number(message.nextSeq) || 1);
      state.expected = {gen: message.gen, transcript: message.transcript};
      remotePeers = []; retryDelay = 300; replaying = true; return;
    }
    if (message.type === 'private-edit' || message.type === 'private-ack' || message.type === 'private-replay') {
      const rows = message.type === 'private-replay' ? message.records : [message.type === 'private-ack' ? message.record : message];
      if (!Array.isArray(rows)) throw new Error('live_private_record_invalid');
      let changed = false;
      for (const row of rows) changed = await accept(row) || changed;
      if (changed && !replaying) {await save(); project(); await sendPresence(); await send();}
      return;
    }
    if (message.type === 'private-ready') {
      if (!state.expected || message.gen !== state.expected.gen || message.transcript !== state.expected.transcript)
        throw new Error('live_private_transcript_mismatch');
      await completeHello(); return;
    }
    if (message.type === 'private-presence') {
      const peer = await openPrivatePresence(config, message);
      remotePeers = [...remotePeers.filter(row => row.client !== peer.client), peer];
      if (!replaying) projectedPeers(); return;
    }
    if (message.type === 'private-left') {
      if (!privatePeer(message.client)) throw new Error('live_private_presence_invalid');
      remotePeers = remotePeers.filter(row => row.client !== message.client); projectedPeers(); return;
    }
    throw new Error('live_private_message_invalid');
  };
  const receive = async message => {
    if (!message || typeof message.type !== 'string') throw new Error('live_message_invalid');
    if (descriptor.private && !['error', 'resync'].includes(message.type)) return receivePrivate(message);
    if (message.type === 'hello') {
      if (typeof message.source !== 'string' || !Number.isSafeInteger(message.gen) || typeof message.client !== 'string')
        throw new Error('live_hello_invalid');
      if (state.client && state.client !== message.client) throw new Error('live_identity_changed');
      if (state.documentId && state.documentId !== message.documentId || descriptor.requestedId && descriptor.requestedId !== message.documentId)
        throw new Error('live_document_identity_changed');
      descriptor.documentId = message.documentId;
      descriptor.filename = message.filename;
      descriptor.docKind = message.docKind;
      state.documentId = message.documentId;
      state.filename = message.filename;
      if (!state.client) {
        state.client = message.client; state.token = message.token;
        if (state.initial) {
          state.pending = state.pending.map(row => ({...row, client: state.client,
            ...(row.undoTarget ? {undoTarget: {...row.undoTarget, client: row.undoTarget.client || state.client}} : {}),
            ...(row.undoTargets ? {undoTargets: row.undoTargets.map(target => ({...target, client: target.client || state.client}))} : {})}));
          corrections = corrections.map(row => row.client ? row : {...row, client: state.client,
            ...(row.act ? {act: {...row.act, client: state.client}} : {})});
          state.redo = state.redo.map(row => ({...row, client: row.client || state.client}));
          state.log = [...joinedBaselineLog(message.log, readLedger(state.baselineLedger).text,
            state.log.length ? state.log[0].gen - 1 : state.gen), ...state.log];
          for (const row of state.pending) if (row.references) {
            const history = [...state.log, ...state.pending], found = row.references.map(id => history.find(entry => entry.actId === id));
            if (found.some(entry => !entry)) throw new Error('live_undo_history_unavailable');
            if (found.length === 1) row.undoTarget = {client: found[0].client, seq: found[0].seq};
            else row.undoTargets = found.map(entry => ({client: entry.client, seq: entry.seq}));
            delete row.references;
          }
          state.expected = {source: message.source, gen: message.gen};
          for (const entry of message.records || []) accepted(entry);
        } else {
          const fresh = freshPlainLog(message);
          state.base = state.text = message.source; state.gen = message.gen; state.pending = []; state.log = fresh.log;
          state.baselineLedger = fresh.baseline; canonical = null;
          view = message.source;
        }
      } else {
        state.expected = {source: message.source, gen: message.gen};
        for (const entry of message.records || []) accepted(entry);
      }
      state.author = message.author;
      state.nextSeq = Math.max(state.nextSeq, Number(message.nextSeq) || 1);
      remotePeers = message.peers || [];
      retryDelay = 300; replaying = message.replaying === true;
      if (!replaying) await completeHello();
      return;
    }
    if (message.type === 'replay') {
      for (const entry of message.records || []) accepted(entry);
      return;
    }
    if (message.type === 'ready') { await completeHello(); return; }
    if (message.type === 'edit') {
      if (accepted(message)) { await save(); project(); await sendPresence(); await send(); }
      return;
    }
    if (message.type === 'ack') {
      let changed = false;
      if (message.record) changed = accepted(message.record);
      else if (message.status === 'superseded') changed = superseded(message.seq);
      else if (!['duplicate', 'applied', 'noop'].includes(message.status)) throw new Error(message.reason || 'live_edit_refused');
      if (changed) { await save(); project(); await sendPresence(); await send(); }
      return;
    }
    if (message.type === 'presence') { remotePeers = message.peers || []; projectedPeers(); return; }
    if (message.type === 'error' && message.reason === 'workspace_unacknowledged') { ready = false; status(); return; }
    if (message.type === 'resync' || message.type === 'error') throw new Error(message.reason || message.code || 'live_history_unavailable');
  };
  const connect = () => {
    if (stopped || lastError) return;
    ready = false; connected = false;
    const key = descriptor.key, opening = new Socket(descriptor.url, [descriptor.private ? PRIVATE_LIVE_PROTOCOL : 'rapier-live-v1', key]);
    ws = opening;
    opening.onopen = () => run(() => {
      if (ws !== opening || stopped) return;
      connected = true;
      packet({type: 'hello', ...(state.client ? {client: state.client, token: state.token, gen: state.gen}
        : state.initial || descriptor.private ? {gen: state.gen} : {}), ...(descriptor.private ? {} : {name: descriptor.name})});
      status();
    });
    opening.onmessage = event => run(async () => {
      if (ws !== opening || stopped) return;
      await receive(JSON.parse(event.data));
    });
    opening.onerror = () => {};
    opening.onclose = event => run(() => {
      if (ws !== opening || stopped) return;
      connected = ready = false; replaying = false;
      cancelTimer(retry); retry = 0;
      if (event.code === 1008 || event.code === 1009) lastError ||= event.reason || (event.code === 1009 ? 'message_too_large' : 'session_unavailable');
      if (lastError === 'session_unavailable' && descriptor.key !== key) lastError = '';
      status();
      if (!lastError) {
        reconnect = timer(connect, retryDelay);
        retryDelay = Math.min(15000, retryDelay * 2);
      }
    });
    status();
  };
  return {
    start(options) { return run(async () => {
      descriptor = options;
      const kept = await store.read();
      if (kept && kept.url !== descriptor.url) throw new Error('live_store_document_mismatch');
      state = kept || {client: '', token: '', author: null, gen: 0, nextSeq: 1, base: '', text: '', pending: [], log: []};
      if (kept?.author?.name) descriptor.name = kept.author.name;
      if (options.stopKey != null) {
        if (typeof options.stopKey !== 'string' || !options.stopKey) throw new Error('live_stop_credential_invalid');
        state.stopKey = options.stopKey;
      }
      if (state.sharingStopped) throw new Error('sharing_stopped');
      state.redo ||= [];
      if (!!kept?.private !== !!descriptor.private && kept) throw new Error('live_store_document_mismatch');
      if (descriptor.private) {
        if (!privateId(descriptor.private.id) || !privateSecret(descriptor.private.key) ||
            descriptor.private.owner && !privateSecret(descriptor.private.owner)) throw new Error('live_private_binding_invalid');
        if (state.private?.id && state.private.id !== descriptor.private.id) throw new Error('live_store_document_mismatch');
        state.private ||= {id: descriptor.private.id, initialDigest: null, transcript: null, seen: {}, owner: null};
        if (descriptor.private.owner) {
          if (state.private.owner && state.private.owner !== descriptor.private.owner) throw new Error('live_private_owner_changed');
          state.private.owner = descriptor.private.owner;
        }
        if (state.private.stopped) throw new Error('sharing_stopped');
      }
      if (!kept && options.baseline) {
        const baseline = options.baseline, local = options.local;
        if (baseline.documentId !== descriptor.requestedId || baseline.documentId !== local?.ledger?.documentAuthority ||
            !Number.isSafeInteger(baseline.gen) || baseline.gen < 0 || descriptor.private && baseline.gen !== 0 ||
            typeof baseline.source !== 'string') throw new Error('live_initial_baseline_invalid');
        const captured = readLedger(baseline.ledger || initialLiveLedger({documentId: baseline.documentId,
          source: baseline.source, filename: descriptor.filename, docKind: descriptor.docKind || 'markdown'}), baseline.source);
        readLedger(local.ledger, local.source);
        if (captured.ledger.documentAuthority !== baseline.documentId || captured.ledger.start.root !== local.ledger.start.root ||
            captured.ledger.records.length > local.ledger.records.length || captured.ledger.records.some((row, index) =>
              canonicalJSON(row) !== canonicalJSON(local.ledger.records[index]))) throw new Error('live_initial_branch_unproven');
        state.initial = state.prejoined = true; state.documentId = baseline.documentId; state.filename = descriptor.filename;
        state.gen = baseline.gen; state.base = state.text = view = baseline.source; state.baselineLedger = captured.ledger;
        checkpoint(captured.revision, captured.root, null, captured.ledger);
        for (const journal of local.ledger.records.slice(captured.ledger.records.length)) enqueue({id: journal.transaction.id, splices: journal.splices,
          revision: journal.transaction.revision, root: journal.afterHash, baseRevision: journal.transaction.baseRevision,
          beforeRoot: journal.beforeHash, journal});
        await save();
      }
      if (state.documentId && descriptor.requestedId && state.documentId !== descriptor.requestedId) throw new Error('live_store_document_mismatch');
      if (state.client || state.initial) {
        state.text = state.pending.reduce((text, row) => applySplices(text, row.splices), state.base);
        view = state.ui?.source ?? state.text; corrections = state.corrections || [];
        if (corrections.reduce((text, row) => applySplices(text, row.splices), view) !== state.text)
          throw new Error('live_recovery_projection_mismatch');
        const recovery = recover(options.local); await save();
        greeted = true;
        emit({type: 'ready', source: view, gen: state.gen, client: state.client, author: state.author,
          documentId: state.documentId, filename: state.filename, recovered: !!kept, initial: !kept && state.initial === true,
          acts: state.log, ledger: state.ui.ledger,
          ...(recovery ? {recovery} : {}),
          ...(!state.pending.length && !corrections.length && view === state.base
            ? {history: state.log.map(row => row.act)} : {})});
      }
      if (descriptor.private && !state.client && !state.initial) await save();
      connect();
    }); },
    local(value) { return run(async () => {
      if (!state?.client && !state?.initial) throw new Error('live_not_joined');
      if (value.serial !== localSerial + 1) throw new Error('live_local_generation_gap');
      enqueue(value); localSerial = value.serial;
      await save(); project(); await sendPresence(); await send();
    }); },
    loaded(value) { return run(async () => {
      const prior = state.ui?.ledger, incoming = value.ledger;
      if (prior && incoming && incoming.sha256 !== prior.sha256) {
        const samePrefix = (before, after) => before.records.length <= after.records.length &&
          before.start.root === after.start.root && before.start.text === after.start.text &&
          before.records.every((row, index) => {
            const next = after.records[index];
            return row.transaction.id === next.transaction.id && row.beforeHash === next.beforeHash &&
              row.afterHash === next.afterHash && row.transaction.revision === next.transaction.revision;
          });
        if (!samePrefix(prior, incoming)) throw new Error('live_checkpoint_history_mismatch');
        for (const row of incoming.records.slice(prior.records.length)) {
          const journal = structuredClone(row);
          delete journal.authored;
          enqueue({id: journal.transaction.id, splices: journal.splices, revision: journal.transaction.revision,
            root: journal.afterHash, baseRevision: journal.transaction.baseRevision, beforeRoot: journal.beforeHash,
            journal});
        }
        if (state.ui.revision !== incoming.head.revision || state.ui.root !== incoming.head.root)
          throw new Error('live_checkpoint_history_mismatch');
      } else {
        checkpoint(value.revision, value.root, null, incoming);
      }
      mounted = true;
      if (state.client) state.initial = false;
      await save(); project();
    }); },
    projected(value) { return run(async () => {
      if (!projection || projection.id !== value.id) return;
      if (value.reason) throw new Error(value.reason);
      if (value.ok) {
        view = projection.text; corrections = corrections.slice(projection.correctionCount);
        if (!value.ledger || value.ledger.sha256 !== projection.ledger.sha256) throw new Error('live_projection_history_mismatch');
        checkpoint(value.revision, value.root, null, value.ledger);
        pendingActs = pendingActs.slice(projection.actCount);
      }
      projection = null;
      await save(); project(); await sendPresence();
    }); },
    presence(value) { return run(async () => { presence = value; await sendPresence(); }); },
    rename(value) { return run(async () => {
      if (!state?.client || state.author?.kind !== 'human') throw new Error('live_not_joined');
      state.author = privateAuthor(state.client, value.name); descriptor.name = value.name;
      await save();
      if (descriptor.private) await sendPresence();
      else {
        const previous = ws; ws = null;
        if (previous?.readyState === 0) {
          previous.onopen = () => { try { previous.close(1000, 'renamed'); } catch (_) {} };
          previous.onerror = () => {}; previous.onmessage = () => {}; previous.onclose = () => {};
        } else previous?.close(1000, 'renamed');
        cancelTimer(reconnect); reconnect = 0; connect();
      }
      status();
    }); },
    undo(value = {}) { return run(async () => {
      if (!state?.client && !state?.initial) return emit({type: 'undo', id: value.id, changed: false});
      let target = value.redo ? state.redo.at(-1) : value.target;
      if (target?.actId) {
        const found = state.log.find(row => row.actId === target.actId);
        if (!found) return emit({type: 'undo', id: value.id, changed: false});
        target = {client: found.client, seq: found.seq};
      }
      if (value.redo && !target) return emit({type: 'undo', id: value.id, changed: false});
      const id = state.documentId.slice(0, 48) + ':' + crypto.randomUUID();
      let next = undoQueue(state.base, state.log, state.pending, state.client, state.nextSeq, target, id);
      if (!next) return emit({type: 'undo', id: value.id, changed: false});
      const group = !target && !value.redo ? typingBurst(next.undoTarget) : null;
      if (group) next = undoQueue(state.base, state.log, state.pending, state.client, state.nextSeq, group, id) || next;
      const history = [...state.log, ...state.pending];
      const originals = (next.undoTargets || [next.undoTarget]).map(ref => history.find(row => row.client === ref.client && row.seq === ref.seq));
      if (originals.some(row => !row?.actId)) throw new Error('live_undo_history_unavailable');
      const original = originals.at(-1);
      const ledger = ledgerFor();
      const author = state.author || {kind: 'human', id: 'local', ...(descriptor.name ? {name: descriptor.name} : {})};
      const act = {id, author: {...author}, createdAt: clock(), operation: 'document.undo',
        ...(originals.length > 1 ? {sourceTransactionId: null, sourceTransactionIds: originals.map(row => row.actId)}
          : {sourceTransactionId: original.actId, sourceTransactionIds: [original.actId]}),
        authored: authoredPlacement(state.text, liveRows(state.text, next.splices), authoredBasis(ledger.records))};
      Object.assign(next, {actId: id, localId: id, act, ...(state.client ? {} : {prejoin: true})});
      if (value.redo) state.redo.pop(); else state.redo.push({client: state.client, seq: next.seq});
      state.nextSeq++; state.pending.push(next); state.text = applySplices(state.text, next.splices);
      canonical = null;
      corrections.push({client: state.client, actId: id, splices: next.splices, act: {client: state.client, seq: next.seq,
        author, actId: id, at: act.createdAt, splices: next.splices, act,
        ...(next.undoTargets ? {undoTargets: next.undoTargets} : {undoTarget: next.undoTarget}), localUndo: true, localRedo: value.redo === true}});
      await save(); project(); await send(); emit({type: 'undo', id: value.id, changed: true});
    }); },
    reconnect() { return run(() => {
      if (stopped || lastError || ws?.readyState === 1) return;
      cancelTimer(reconnect); reconnect = 0; connect();
    }); },
    credential(value) { return run(() => {
      if (typeof value.key !== 'string' || !value.key || value.key === descriptor.key) return;
      descriptor.key = value.key;
      if (lastError && !['session_unavailable', 'workspace_unacknowledged'].includes(lastError)) { status(); return; }
      if (!lastError && ws?.readyState === 1) return;
      lastError = '';
      const old = ws; ws = null;
      if (old?.readyState === 0) {
        old.onopen = () => { try { old.close(1000, 'renewed'); } catch (_) {} };
        old.onerror = () => {}; old.onmessage = () => {}; old.onclose = () => {};
      } else old?.close(1000, 'renewed');
      cancelTimer(reconnect); reconnect = 0; connect();
    }); },
    stop(value = {}) { return run(async () => {
      const owner = descriptor.private ? state.private?.owner : state.stopKey;
      if (!owner || typeof fetcher !== 'function') {
        emit({type: 'stop', id: value.id, stopped: false, reason: 'live_stop_unavailable'}); return;
      }
      try {
        const url = new URL(descriptor.url);
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        if (descriptor.private) {
          if (!url.pathname.endsWith('/socket')) throw new Error('live_stop_unavailable');
          url.pathname = url.pathname.slice(0, -7) + '/stop';
        } else url.pathname = url.pathname.replace(/\/$/, '') + '/stop';
        const response = await fetcher(url.href, {method: 'POST', headers: {'X-Rapier-Live-Owner': owner}});
        const result = await response.json();
        if (!response.ok || result.stopped !== true || descriptor.private && result.id !== descriptor.private.id)
          throw new Error(result.reason || 'live_stop_unconfirmed');
        if (descriptor.private) state.private.stopped = true; else state.sharingStopped = true;
        await save();
        lastError = 'sharing_stopped'; stopped = true; connected = ready = false;
        cancelTimer(reconnect); cancelTimer(retry); reconnect = retry = 0;
        ws?.close(1000, 'sharing_stopped');
        emit({type: 'stop', id: value.id, stopped: true}); status();
      } catch (error) {emit({type: 'stop', id: value.id, stopped: false, reason: error.message || 'live_stop_unconfirmed'});}
    }); },
    close() { return run(async () => {
      stopped = true; connected = ready = false;
      cancelTimer(reconnect); cancelTimer(retry); reconnect = retry = 0;
      if (ws) {
        const closing = ws; ws = null;
        if (closing.readyState === 0) {
          closing.onopen = () => { try { closing.close(1000, 'left'); } catch (_) {} };
          closing.onerror = () => {};
          closing.onmessage = () => {};
          closing.onclose = () => {};
        } else {
          try { closing.close(1000, 'left'); } catch (_) {}
        }
      }
      await store.close(); status();
    }); },
  };
}

export function installLiveWorker(scope) {
  let client;
  scope.onmessage = event => {
    const value = event.data;
    if (value?.type === 'invitation' && !client) {
      const {documentId, filename, docKind, source, ledger} = value;
      void createPrivateInvitation({documentId, filename, docKind, source, ledger}).then(invitation =>
        scope.postMessage({type: 'invitation', requestId: value.requestId, invitation}), error =>
        scope.postMessage({type: 'invitation', requestId: value.requestId, error: error.message || 'live_private_create_failed'}));
    } else if (value?.type === 'start' && !client) {
      client = createLiveClient({post: message => scope.postMessage(message), socket: scope.WebSocket,
        store: durableStore(scope.indexedDB, value.scope + ':live', value.slot), clock: () => Date.now(),
        timer: (fn, ms) => scope.setTimeout(fn, ms), cancelTimer: id => scope.clearTimeout(id),
        fetch: (...args) => scope.fetch(...args)});
      void client.start(value);
    } else if (client && ['local', 'loaded', 'projected', 'presence', 'rename', 'undo', 'reconnect', 'credential', 'stop', 'close'].includes(value?.type)) {
      void client[value.type](value);
    }
  };
}
