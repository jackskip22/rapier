const _rapierLive = (() => {
  let worker = null, binding = null, epoch = 0, serial = 0, preparing = false, applying = false, loading = false;
  let state = {state: 'closed', ready: false, pending: 0, gen: 0}, peers = [], frame = 0, presenceTimer = 0;
  let latestInput = 0, pendingProjection = null, projectionTimer = 0, clearComposition = 0, lastPresence = null, heldPresence = null;
  let joining = null, resolveJoin, rejectJoin, undoSequence = 0, shareFlight = null;
  let list = null, layer = null, sheet = null;
  const undoRequests = new Map(), stopRequests = new Map(), subscribers = new Set();
  const own = () => binding && binding.authority === String(rapier.identity.authority || '');
  const addressOwned = () => globalThis.RAPIER_APPS_HOST !== true && globalThis.__rapierServerRenderHost !== true &&
    !(typeof _rapierEmbed !== 'undefined' && (_rapierEmbed.active || _rapierEmbed.local)) && window.top === window;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const explicitInvitation = ['live', 'key', 'private'].some(key => fragment.has(key));
  const birthNote = (() => { try { return decodeURIComponent(/^#n\/([^/]+)/.exec(location.hash)?.[1] || ''); } catch (_) { return ''; } })();
  let resumeCandidate = (() => { try { return !explicitInvitation && addressOwned() ? resumeDescriptor(history.state?.rapierLiveResume) : null; } catch (_) { return null; } })();
  let resumeReady = false, resumeOpening = false, resumeGeneration = 0;
  function resumeDescriptor(value) {
    const known = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
    const secret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
    if (!known(value, ['version', 'documentId', 'url', 'key', 'private']) || value.version !== 1 ||
        typeof value.documentId !== 'string' || !value.documentId || value.documentId.length > 256 ||
        typeof value.url !== 'string' || value.url.length > 4096 || typeof value.key !== 'string') return null;
    let url;
    try { url = new URL(value.url); } catch (_) { return null; }
    if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.hash || url.search ||
        url.protocol === 'ws:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
    if (value.private !== undefined) {
      if (!known(value.private, ['id', 'key']) || !/^[a-f0-9]{32}$/.test(value.private.id) || !secret(value.private.key) ||
          !secret(value.key) || !url.pathname.endsWith('/live/' + value.private.id + '/socket')) return null;
    } else if (!/^ek1\.[A-Za-z0-9_-]{22}\.\d{1,16}\.[A-Za-z0-9_-]{43}$/.test(value.key)) return null;
    return {version: 1, documentId: value.documentId, url: url.href, key: value.key,
      ...(value.private ? {private: {id: value.private.id, key: value.private.key}} : {})};
  }
  function boundResume() {
    const authority = binding?.authority || binding?.resumeAuthority;
    return authority ? resumeDescriptor({version: 1, documentId: authority, url: binding.url, key: binding.key,
      ...(binding.private ? {private: {id: binding.private.id, key: binding.private.key}} : {})}) : null;
  }
  function navigationState(value) {
    if (!addressOwned()) return value;
    const result = {...value}; delete result.rapierLiveResume;
    const candidate = boundResume() || (!birthNote ? resumeCandidate : null);
    if (addressOwned() && candidate?.documentId === String(rapier.identity.authority)) result.rapierLiveResume = candidate;
    return result;
  }
  function navigationProvider(on) {
    if (typeof _rapierBackEntries === 'undefined') return;
    if (on && addressOwned()) _rapierBackEntries.liveNavigationState = navigationState;
    else if (_rapierBackEntries.liveNavigationState === navigationState) delete _rapierBackEntries.liveNavigationState;
  }
  function keepResume() {
    if (!addressOwned() || !own() || !boundResume()) return;
    try { history.replaceState(navigationState(history.state), ''); } catch (_) {}
  }
  function clearResume(candidate) {
    if (!candidate || !addressOwned()) return;
    try {
      const state = history.state, current = state?.rapierLiveResume;
      if (current?.documentId !== candidate.documentId || current?.url !== candidate.url) return;
      const next = {...state}; delete next.rapierLiveResume; history.replaceState(next, '');
    } catch (_) {}
  }
  function cancelResume() {
    const prior = resumeCandidate; resumeCandidate = null; resumeGeneration++;
    clearResume(prior);
    if (!binding) navigationProvider(false);
  }
  function noteResumeCurrent(candidate) {
    if (!birthNote) return true;
    const state = typeof _rapierNotes === 'undefined' ? null : _rapierNotes, proof = state?.currentProof;
    let currentNote;
    try { currentNote = decodeURIComponent(/^#n\/([^/]+)/.exec(location.hash)?.[1] || ''); } catch (_) { return false; }
    return !!state && !state.open && !state.noteOpening && !state.opening && !state.returning &&
      currentNote === birthNote && proof?.id === birthNote && proof.authority === candidate.documentId && proof.epoch === Number(rapier.identity.epoch || 0) &&
      typeof _rapierNotesDocumentBound === 'function' && _rapierNotesDocumentBound();
  }
  async function resumeCurrent() {
    if (!resumeCandidate || !resumeReady || resumeOpening || !addressOwned()) return;
    const candidate = resumeCandidate, generation = resumeGeneration;
    resumeOpening = true;
    try {
      const read = await _rapierWithSettledExternalDocument(() => ({documentId: String(rapier.identity.authority),
        epoch: Number(rapier.identity.epoch || 0)}), {quiet: true, passive: true});
      if (generation !== resumeGeneration || candidate !== resumeCandidate) return;
      if (!read.settled || read.value.documentId !== candidate.documentId ||
          read.value.epoch !== Number(rapier.identity.epoch || 0) || !noteResumeCurrent(candidate)) { cancelResume(); return; }
      resumeCandidate = null;
      await join({...candidate, name: personName()}, candidate.documentId);
    } catch (error) { clearResume(candidate); cancelResume(); showToast(error.message, 'error'); }
    finally { resumeOpening = false; }
  }
  function restored(id, opened) {
    if (!resumeCandidate || !birthNote || id !== birthNote) return;
    if (opened !== true || !noteResumeCurrent(resumeCandidate)) { cancelResume(); return; }
    void globalThis.RapierAgentBrowser.ready.then(() => { resumeReady = true; return resumeCurrent(); }).catch(() => cancelResume());
  }
  if (resumeCandidate) {
    navigationProvider(true);
    void globalThis.RapierAgentBrowser.ready.then(() => {
      resumeReady = true;
      if (!birthNote) return resumeCurrent();
    }).catch(() => cancelResume());
  }
  const blocked = () => loading || rapier.composition.block || rapier.composition.source || _rapierMutationBarrierActive();
  const send = value => {
    try { worker?.postMessage(value); return !!worker; }
    catch (error) {
      state = {...state, state: 'stopped', error: error.message || 'Live worker unavailable'};
      queueMicrotask(publish); return false;
    }
  };
  const colors = ['#167d8d', '#a45230', '#7054aa', '#357341', '#a33e6a', '#82630d'];
  const color = author => {
    let hash = 0;
    for (const char of String(author?.id || '')) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
    return colors[hash % colors.length];
  };
  const snapshot = () => ({...state, pending: state.pending + Math.max(0, serial - (state.atLocal || 0)),
    documentId: binding?.authority || null, peers: peers.map(peer => ({...peer})),
    active: !!own() && state.state !== 'stopped' && state.state !== 'closed', joining: loading});
  const publish = () => {
    const value = snapshot();
    for (const listener of subscribers) { try { listener(value); } catch (_) {} }
    document.dispatchEvent(new CustomEvent('rapier:live-state', {detail: value}));
    renderHistory();
    drawSoon();
  };
  const act = rows => {
    for (const entry of rows || []) document.dispatchEvent(new CustomEvent('rapier:act', {detail: {
      documentId: binding?.authority || binding?.requestedId || String(rapier.identity.authority || ''), author: entry.author, actId: entry.actId, at: entry.at,
      gen: entry.gen, client: entry.client, seq: entry.seq, splices: entry.splices, before: entry.undo,
      sourceAct: entry.act || null, undoTarget: entry.undoTarget || null, localTransactionId: entry.localTransactionId || null,
    }}));
  };
  const receipt = record => record ? {..._rapierJournalRecord(record),
    splices: _rapierRecordSplices(record, rapier.undo.ledger)} : null;
  const move = (at, rows, end = false) => {
    let value = at;
    for (const row of rows) {
      const stop = row.pos + row.removed.length;
      if (value > stop) value += row.inserted.length - row.removed.length;
      else if (value >= row.pos) value = row.pos + (end || value > row.pos ? row.inserted.length : 0);
    }
    return value;
  };
  function restore(place, rows) {
    if (place.covered) return true;
    const capture = place.capture, selected = place.pointer.selection;
    if (!selected) return globalThis.RapierAgentBrowser.livePlace.restore(place, rows);
    const collapsed = selected.start === selected.end;
    const start = move(selected.start, rows), end = move(selected.end, rows, !collapsed);
    if (capture.kind === 'source' || rapier.view.mode === 'source') {
      const ta = document.getElementById('source-textarea');
      _rapierFlatSelectAndReveal(start, end, false);
      ta.setSelectionRange(_rapierTaPos(start), _rapierTaPos(end), capture.direction);
      if (capture.kind === 'source' ? capture.activeWasSource !== false : capture.activeWasEdit === true)
        ta.focus({preventScroll: true});
      return true;
    }
    if (_rapierRestoreCanonicalSelection(start, end, capture)) return true;
    return globalThis.RapierAgentBrowser.livePlace.restore(place, rows);
  }
  async function projectSource(before, text, rows, current, context, options) {
    const currentEpoch = epoch;
    let place = null, done = false, transaction = null, load = null;
    const metadata = async owner => {
      const target = options?.carriedLedger?.head.metadata;
      if (!target) return;
      const effect = RapierLedger._rapierMetadataDelta(_rapierDocumentMetadata(), target);
      if (!effect) return;
      if (!_rapierCommitSplices([], {metadata: effect})) throw new Error('live_metadata_projection_failed');
      if (effect.docKind) await _rapierProjectDocumentMetadata(owner);
      else { updateFilenameDisplay(); renderDocumentKind(); }
    };
    preparing = true;
    try {
      if (before === text && options?.carriedLedger) {
        if (!current() || _rapierSourceText() !== before || !_rapierLoadCommitAdmissionCurrent()) return null;
        place = globalThis.RapierAgentBrowser.livePlace.capture(); applying = true;
        transaction = _rapierWithCompoundTransaction(context, metadata, options);
      } else if (rapier.document.docKind === 'markdown') {
        const loadToken = ++rapier.identity.loadToken, guard = _rapierMutationStamp();
        const loadOptions = {
          sameDocument: true, preserveHistory: true, deferFlush: true, sourceSplices: rows,
          loadCommitGuard: guard,
          sourceProjectionCommit() {
            if (!current() || !_rapierLoadCommitAdmissionCurrent() || _rapierSettlePendingDocumentChange() === false ||
                !current() || _rapierSourceText() !== before || !_rapierMutationStampIsCurrent(guard)) return false;
            place = globalThis.RapierAgentBrowser.livePlace.capture();
            applying = true;
            let admitted = false;
            transaction = _rapierWithCompoundTransaction(context, async owner => {
              loadOptions.mutationOwner = owner;
              admitted = !!_rapierCommitSplices(rows, {navigation: false});
              if (!admitted || !await load || !current() || _rapierSourceText() !== text)
                throw new Error('live_projection_failed');
              await metadata(owner);
              _bumpDocGeneration();
              if (!restore(place, rows)) throw new Error('live_selection_restore_failed');
            }, options);
            return admitted;
          },
        };
        load = _loadMarkdownDoc(text, rapier.document.filename, loadToken, loadOptions);
        try { await load; }
        catch (error) {
          if (transaction) await transaction.catch(() => {});
          throw error;
        }
        if (!transaction) return null;
      } else {
        if (!current() || _rapierSourceText() !== before || !_rapierLoadCommitAdmissionCurrent()) return null;
        place = globalThis.RapierAgentBrowser.livePlace.capture();
        applying = true;
        transaction = _rapierWithCompoundTransaction(context, async owner => {
          const committed = await _rapierApplyCanonicalSplices(rows, {keepSourceMode: rapier.view.mode === 'source', navigation: false});
          if (!committed || !current() || _rapierSourceText() !== text) throw new Error('live_projection_failed');
          await metadata(owner);
          if (!restore(place, rows)) throw new Error('live_selection_restore_failed');
        }, options);
      }
      const result = await transaction;
      done = true;
      if (rows.length && typeof _rapierDrawFollow === 'function') _rapierDrawFollow(rows);
      return result;
    } finally {
      if (epoch === currentEpoch) {
        preparing = applying = false;
        if (place && !done && current()) {
          try { restore(place, []); } catch (_) {}
          globalThis.RapierAgentBrowser.livePlace.viewport(place);
        }
      }
    }
  }
  async function project(value) {
    if (!own() || !worker) return;
    if (preparing || applying) { pendingProjection = value; return; }
    if (blocked() || !value.splices.length && value.before === value.text && value.ledger && _rapierTypingBurstOpen()) {
      pendingProjection = value;
      if (!projectionTimer) projectionTimer = setTimeout(() => {
        projectionTimer = 0;
        if (pendingProjection) { const next = pendingProjection; pendingProjection = null; void project(next); }
      }, 40);
      return;
    }
    _rapierSettlePendingDocumentChange();
    if (value.atLocal !== serial || _rapierSourceText() !== value.before) {
      send({type: 'projected', id: value.id, ok: false}); return;
    }
    const currentEpoch = epoch;
    const rows = value.splices.slice().reverse().map(row => ({pos: row.at,
      removed: value.before.slice(row.at, row.at + row.remove), inserted: row.insert}));
    const entry = value.acts?.at(-1), author = entry?.author || {kind: 'system', id: 'live'};
    try {
      const ctx = {actor: {...author}, transport: 'platform',
        operation: entry?.localRedo ? 'history.redo' : entry?.localUndo ? 'history.undo' : 'document.remote_edit', requestId: entry?.actId || null};
      const result = await projectSource(value.before, value.text, rows,
        () => epoch === currentEpoch && own() && value.atLocal === serial, ctx,
        {carriedLedger: value.ledger, remoteTransactionId: entry?.actId || null, createdAt: entry?.at});
      if (epoch !== currentEpoch || !own()) return;
      if (!result) {
        _rapierSettlePendingDocumentChange();
        send({type: 'projected', id: value.id, ok: false}); return;
      }
      movePresence(rows);
      act(value.acts);
      send({type: 'projected', id: value.id, ok: true, revision: rapier.revision.settled, root: rapier.document.source.rootId,
        transactionId: result.transaction?.id,
        ...(value.ledger ? {ledger: _rapierLedgerCapture()} : {
          journal: receipt(rapier.undo.ledger.find(row => row.transaction.id === result.transaction?.id))})});
      _rapierArmAutosave();
    } catch (error) {
      if (epoch === currentEpoch) {
        state = {...state, state: 'stopped', error: error.message};
        send({type: 'projected', id: value.id, ok: false, reason: error.message});
        showToast('Live changes are kept. ' + error.message, 'error');
      }
    } finally {
      if (epoch === currentEpoch && own()) {
        if (pendingProjection) { const next = pendingProjection; pendingProjection = null; void project(next); }
        publish(); presenceSoon();
      }
    }
  }
  async function receive(value, currentEpoch) {
    if (epoch !== currentEpoch || !worker) return;
    if (value.type === 'status') {
      state = {...state, ...value}; delete state.type;
      if (state.state === 'stopped') {
        if (state.error === 'sharing_stopped') clearResume(boundResume());
        if (loading) {
          loading = false; rejectJoin?.(new Error(state.error)); resolveJoin = rejectJoin = null; joining = null;
        }
        for (const finish of undoRequests.values()) finish(false);
        undoRequests.clear();
      }
      publish(); return;
    }
    if (value.type === 'peers') { if (value.atLocal === serial) { peers = value.peers; publish(); } return; }
    if (value.type === 'acts') { act(value.acts); return; }
    if (value.type === 'undo') {
      undoRequests.get(value.id)?.(value.changed === true); undoRequests.delete(value.id); return;
    }
    if (value.type === 'stop') {
      stopRequests.get(value.id)?.(value); stopRequests.delete(value.id); return;
    }
    if (value.type === 'project') { await project(value); return; }
    if (value.type !== 'ready') return;
    loading = true;
    try {
      const authority = value.documentId || binding.requestedId;
      if (typeof authority !== 'string' || !authority) throw new Error('Live document identity is missing.');
      if (binding.resumeAuthority && (value.documentId !== binding.resumeAuthority || String(rapier.identity.authority) !== binding.resumeAuthority))
        throw new Error('The open document changed before its live session could resume.');
      const filename = value.filename || binding.filename || 'Shared.md';
      const carriedLedger = value.ledger || (value.history ? globalThis.RapierAgentBrowser.remoteLedger({
        documentId: authority, text: value.source, filename, docKind: value.docKind || 'markdown',
        revision: value.gen, journal: value.history, historyComplete: value.historyComplete !== false}, null) : null);
      const same = String(rapier.identity.authority) === authority && _rapierSourceText() === value.source;
      if (value.recovery) {
        const recovery = value.recovery;
        if (String(rapier.identity.authority) !== authority || _rapierSourceText() !== recovery.before ||
            rapier.revision.settled !== recovery.revision || rapier.document.source.rootId !== recovery.root)
          throw new Error('The open document changed before its live history could be recovered.');
        const rows = recovery.records.flatMap(row => row.splices);
        const last = recovery.records.at(-1).transaction;
        const result = await projectSource(recovery.before, value.source, rows,
          () => epoch === currentEpoch && String(rapier.identity.authority) === authority,
          {actor: last.actor, transport: last.transport, operation: last.operation, requestId: last.requestId},
          {carriedLedger: recovery.ledger});
        if (epoch !== currentEpoch) return;
        if (!result) {
          _rapierSettlePendingDocumentChange();
          throw new Error('The open document changed before its live history could be recovered.');
        }
        movePresence(rows);
        act(recovery.acts); _rapierArmAutosave();
      } else if (value.initial) {
        if (String(rapier.identity.authority) !== authority || binding.baseline?.documentId !== authority)
          throw new Error('The open document changed while joining.');
      } else if (!same) {
        if (String(rapier.identity.authority) === authority) throw new Error('Live history is unavailable for the open draft. Your changes are kept.');
        const guard = _rapierMutationStamp();
        if (_rapierIsDirty() && !await _rapierSetAsideOutgoing(guard)) throw new Error('The open document could not be kept.');
        if (epoch !== currentEpoch) return;
        const loaded = await rapierLoad(value.source, filename, {documentAuthority: authority,
          expectedMutationStamp: guard, appsSnapshot: true, ...(carriedLedger ? {carriedLedger, restore: true,
            documentKind: carriedLedger.head.metadata.docKind} : {})});
        if (!loaded) throw new Error('The open document changed while joining. Join again.');
      } else if (carriedLedger && _rapierLedgerCapture().sha256 !== carriedLedger.sha256) {
        const result = await projectSource(value.source, value.source, [],
          () => epoch === currentEpoch && String(rapier.identity.authority) === authority,
          {actor: {kind: 'system', id: 'live'}, transport: 'platform', operation: 'document.remote_edit'}, {carriedLedger});
        if (!result) throw new Error('The open document changed while its history was joining.');
      }
      if (epoch !== currentEpoch) return;
      binding.authority = authority; keepResume();
      state = {...state, client: value.client, author: value.author, gen: value.gen};
      act(value.acts);
      _rapierSettlePendingDocumentChange();
      const ledger = _rapierLedgerCapture();
      send({type: 'loaded', revision: ledger.head.revision, root: ledger.head.root, ledger});
      loading = false;
      resolveJoin?.(snapshot()); resolveJoin = rejectJoin = null; joining = null;
      publish(); presenceSoon();
    } catch (error) {
      if (epoch !== currentEpoch) return;
      loading = false; rejectJoin?.(error); resolveJoin = rejectJoin = null; joining = null;
      await leave();
      state = {...state, state: 'stopped', error: error.message}; publish();
      showToast(error.message, 'error');
    }
  }
  async function join(options, resumeAuthority = null) {
    const url = new URL(String(options?.url || ''));
    if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.hash || url.search ||
        (url.protocol === 'ws:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) ||
        typeof options?.key !== 'string' || !options.key) throw new Error('Use a live document link.');
    if (binding?.url === url.href && (own() || loading)) {
      if (options.joinUrl) binding.joinUrl = options.joinUrl;
      if (binding.key !== options.key) { binding.key = options.key; send({type: 'credential', key: options.key}); }
      if (options.stopKey) binding.stopKey = options.stopKey;
      keepResume();
      return joining || snapshot();
    }
    await leave();
    await globalThis.RapierAgentBrowser.ready;
    if (resumeAuthority && (!addressOwned() || String(rapier.identity.authority) !== resumeAuthority))
      throw new Error('The open document changed before its live session could resume.');
    if (!_rapierSettlePendingDocumentChange()) throw new Error('Finish composing, then join the live document.');
    const currentEpoch = ++epoch;
    binding = {url: url.href, key: options.key, name: personName(options.name),
      filename: options.filename || 'Shared.md', requestedId: options.documentId || null, authority: null,
      joinUrl: options.joinUrl || publicPage(), baseline: options.baseline || null, resumeAuthority,
      ...(options.private ? {private: {...options.private}} : {}), ...(options.stopKey ? {stopKey: options.stopKey} : {})};
    loading = true; serial = 0; peers = []; state = {state: 'connecting', ready: false, pending: 0, gen: 0};
    navigationProvider(true);
    let slot;
    const slotKey = 'rapier:live:' + url.href;
    try {
      slot = sessionStorage.getItem(slotKey);
      if (!slot) { slot = crypto.randomUUID(); sessionStorage.setItem(slotKey, slot); }
    } catch (_) { slot = crypto.randomUUID(); }
    const blob = new Blob([globalThis.RapierLiveSession.workerSource()], {type: 'text/javascript'});
    const workerUrl = URL.createObjectURL(blob);
    try { worker = new Worker(workerUrl); } finally { URL.revokeObjectURL(workerUrl); }
    worker.onmessage = event => { void receive(event.data, currentEpoch); };
    worker.onerror = event => {
      if (epoch !== currentEpoch) return;
      state = {...state, state: 'stopped', error: event.message || 'Live worker unavailable'};
      loading = false; rejectJoin?.(new Error(state.error)); resolveJoin = rejectJoin = null; joining = null; publish();
    };
    joining = new Promise((resolve, reject) => { resolveJoin = resolve; rejectJoin = reject; });
    const local = _rapierLedgerCapture();
    send({type: 'start', ...binding, slot, scope: globalThis.RapierStorage?.scope || location.pathname,
      local: {source: _rapierSourceText(), ledger: local}});
    publish();
    return joining;
  }
  async function leave() {
    clearResume(boundResume()); cancelResume(); navigationProvider(false);
    ++epoch;
    if (worker) { const old = worker; worker = null; old.postMessage({type: 'close'}); setTimeout(() => old.terminate(), 1000); }
    binding = null; loading = preparing = applying = false; serial = 0; peers = []; pendingProjection = null;
    clearTimeout(projectionTimer); clearTimeout(clearComposition); clearTimeout(presenceTimer);
    projectionTimer = clearComposition = presenceTimer = latestInput = 0; lastPresence = heldPresence = null;
    state = {state: 'closed', ready: false, pending: 0, gen: 0};
    for (const finish of undoRequests.values()) finish(false);
    undoRequests.clear();
    for (const finish of stopRequests.values()) finish({stopped: false, reason: 'session_closed'});
    stopRequests.clear();
    resolveJoin?.(false); resolveJoin = rejectJoin = null; joining = null;
    sheet?.close(); sheet = null; publish();
    return true;
  }
  function observe(record) {
    if (loading || !own() || applying || !worker || state.state === 'stopped') return;
    const journal = receipt(record);
    movePresence(journal.splices, true);
    send({type: 'local', serial: ++serial, id: record.transaction.id, splices: journal.splices, journal,
      basis: rapier.undo.ledger.slice(0, rapier.undo.ledger.indexOf(record)).map(row => row.transaction.id),
      revision: record.transaction.revision, root: record.afterHash, baseRevision: record.transaction.baseRevision,
      beforeRoot: record.beforeHash});
    presenceSoon(); publish();
  }
  function canonicalRows(rows, beforeSource) {
    if ((!own() && !(loading && binding?.baseline?.documentId === String(rapier.identity.authority))) || applying) return rows;
    if (!rows.length) { if (typeof beforeSource === 'function') beforeSource(); return rows; }
    const before = typeof beforeSource === 'function' ? beforeSource() : beforeSource ?? _rapierSourceText();
    const after = _rapierTransformSplices(before, rows);
    if (after === null) return rows;
    let narrow;
    try {
      narrow = globalThis.RapierLiveMerge.parallelSplices(before, rows).slice().reverse().map(row => Object.freeze({
        pos: row.at, removed: before.slice(row.at, row.at + row.remove), inserted: row.insert}));
    } catch (error) {
      if (error && error.message === 'source_diff_limit') return rows;
      throw error;
    }
    if (_rapierTransformSplices(before, narrow) !== after) throw new Error('live_original_history_mismatch');
    return narrow.length <= 64 ? narrow : rows;
  }
  function movePresence(rows, local = false) {
    if (!lastPresence && !heldPresence) return;
    const changes = rows.map(row => {
      const change = _rapierPrefixSuffixDiff(row.removed, row.inserted);
      return {...change, pos: row.pos + change.pos};
    });
    if (lastPresence) lastPresence = {anchor: move(lastPresence.anchor, changes, local), head: move(lastPresence.head, changes, local)};
    if (heldPresence) heldPresence = {anchor: move(heldPresence.anchor, changes), head: move(heldPresence.head, changes, true)};
  }
  function editingBlockSpan(caret) {
    const spans = typeof _rapierCurrentBodyBlockSpans === 'function' ? _rapierCurrentBodyBlockSpans() : null;
    if (!spans || !spans.length) return null;
    const active = typeof _activeBlockEditContext === 'function' ? _activeBlockEditContext() : null;
    const named = active && active.block ? spans.find(row => row.id === active.block.id) : null;
    if (named && named.end >= named.start) return {anchor: named.start, head: named.end};
    if (typeof _rapierBlockAtSourceOffset !== 'function') return null;
    const found = _rapierBlockAtSourceOffset(caret);
    const span = found && spans[found.index];
    return span && span.end >= span.start ? {anchor: span.start, head: span.end} : null;
  }
  function capturePresence(typing) {
    const selected = globalThis.RapierAgentBrowser.livePlace.pointer().selection;
    if (!selected) return;
    lastPresence = {anchor: selected.start, head: selected.end};
    if (!typing) return;
    const block = editingBlockSpan(Math.min(selected.start, selected.end));
    if (block) { heldPresence = block; return; }
    let start = selected.start, end = selected.end;
    const source = _rapierSourceText(), word = /^[\p{L}\p{N}\p{M}_]$/u;
    while (start > 0) {
      let previous = start - 1;
      if (previous > 0 && (source.charCodeAt(previous) & 0xfc00) === 0xdc00 &&
          (source.charCodeAt(previous - 1) & 0xfc00) === 0xd800) previous--;
      if (!word.test(source.slice(previous, start))) break;
      start = previous;
    }
    while (end < source.length) {
      const char = String.fromCodePoint(source.codePointAt(end));
      if (!word.test(char)) break;
      end += char.length;
    }
    heldPresence = {anchor: start, head: end};
  }
  function presence() {
    presenceTimer = 0;
    if (!own() || applying || loading) return;
    const typing = latestInput > 0 && (rapier.composition.block || rapier.composition.source || Date.now() - latestInput < 900);
    capturePresence(typing);
    if (!typing) heldPresence = null;
    if (lastPresence) send({type: 'presence', ...lastPresence, composing: heldPresence || false});
  }
  function presenceSoon() {
    if (!own() || presenceTimer) return;
    presenceTimer = setTimeout(presence, 40);
  }
  async function undo(target, redo = false) {
    if (!own() || blocked()) return false;
    _rapierSettlePendingDocumentChange();
    const id = ++undoSequence;
    const promise = new Promise(resolve => undoRequests.set(id, resolve));
    if (!send({type: 'undo', id, redo, ...(target ? {target} : {})})) {
      undoRequests.get(id)?.(false); undoRequests.delete(id);
    }
    return promise;
  }
  async function flush() {
    if (!own() || blocked()) return false;
    _rapierSettlePendingDocumentChange();
    const settled = () => state.ready && !preparing && !applying && !pendingProjection && (state.atLocal || 0) === serial && !state.pending;
    if (settled()) return true;
    return new Promise(resolve => {
      const changed = () => { if (settled()) finish(true); else if (!own() || state.state === 'stopped') finish(false); };
      const finish = value => { clearTimeout(timer); subscribers.delete(changed); resolve(value); };
      const timer = setTimeout(() => finish(false), 10000);
      subscribers.add(changed); changed();
    });
  }
  function make(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function ensureUI() {
    if (list) return;
    list = make('button', 'rapier-live-bar'); list.type = 'button'; list.hidden = true;
    list.addEventListener('click', people);
    layer = make('div', 'rapier-live-layer'); layer.setAttribute('aria-hidden', 'true');
    document.body.append(list, layer);
  }
  function pointRect(offset) {
    if (rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown') {
      const ta = document.getElementById('source-textarea');
      return ta && _rapierSourceRectForOffset(ta, _rapierTaPos(offset));
    }
    const point = _rapierResolvePoint(offset);
    if (!point) return null;
    const range = document.createRange(); range.setStart(point.node, point.offset); range.collapse(true);
    return _rapierCaretClientRect(range);
  }
  function draw() {
    frame = 0; ensureUI(); list.hidden = !own(); layer.replaceChildren();
    if (!own()) return;
    const other = peers.filter(peer => peer.author && peer.client !== state.client);
    const count = other.length, label = state.state === 'live' ? 'Live' : state.state === 'syncing' ? 'Syncing' : state.state === 'offline' ? 'Offline' : state.state === 'stopped' ? 'Paused' : 'Connecting';
    list.replaceChildren(make('span', 'rapier-live-state', label));
    for (const peer of other.slice(0, 2)) {
      const name = make('span', 'rapier-live-name', peer.author.name || 'Guest');
      name.style.setProperty('--live-color', color(peer.author)); list.append(name);
    }
    if (count > 2) list.append(make('span', 'rapier-live-more', '+' + (count - 2)));
    list.setAttribute('aria-label', label + '. ' + count + (count === 1 ? ' collaborator' : ' collaborators'));
    const source = rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown';
    const host = document.getElementById(source ? 'source-textarea' : 'editor-blocks');
    if (!host || document.body.classList.contains('rapier-draw-open')) return;
    const box = host.getBoundingClientRect();
    let edgeStart = Math.max(box.top + 24, list.getBoundingClientRect().bottom + 4), edgeEnd = box.bottom - 6;
    for (const peer of other) {
      if (!Number.isSafeInteger(peer.head)) continue;
      const rect = pointRect(peer.head);
      let top = rect?.top, left = rect?.left;
      let edge = '';
      if (!rect || top < box.top || top > box.bottom - 18) {
        const span = _rapierBlockAtSourceOffset(_rapierBodyOffsetOfCanonical(peer.head));
        const wrapper = span && document.querySelector('[data-block-id="' + span.block.id + '"]');
        const above = rect ? top < box.top : wrapper ? wrapper.getBoundingClientRect().top < box.top : peer.head < _rapierSourceText().length / 2;
        edge = above ? 'up' : 'down'; top = above ? box.top + 40 : box.bottom - 24; left = box.right - 18;
      }
      const caret = make('div', 'rapier-live-caret'); caret.dataset.edge = edge;
      caret.style.setProperty('--live-color', color(peer.author));
      caret.style.left = Math.max(box.left + 3, Math.min(box.right - 3, left)) + 'px';
      caret.style.top = top + 'px'; caret.style.height = Math.max(16, rect?.height || 18) + 'px';
      const name = make('span', 'rapier-live-label', (edge === 'up' ? '↑ ' : edge === 'down' ? '↓ ' : '') + (peer.author.name || 'Guest'));
      const initials = String(peer.author.name || 'Guest').split(/\s+/).map(word => [...word][0] || '').slice(0, 2).join('');
      name.dataset.initials = initials; caret.append(name); layer.append(caret);
      if (edge) {
        name.style.maxWidth = Math.max(0, Math.min(130, box.width - 24)) + 'px';
        const labelHeight = Math.ceil(name.getBoundingClientRect().height), caretHeight = Math.max(16, rect?.height || 18);
        const height = labelHeight + caretHeight;
        if (box.width < 24 || edgeEnd - edgeStart < height) { caret.remove(); continue; }
        if (edge === 'up') { top = edgeStart + labelHeight; edgeStart += height + 4; }
        else { top = edgeEnd - caretHeight; edgeEnd -= height + 4; }
        caret.style.top = top + 'px';
      }
      if (!edge && left > box.right - 132) name.style.insetInlineStart = 'auto', name.style.insetInlineEnd = '0';
      if (!edge && peer.anchor !== peer.head && !source) {
        const a = _rapierResolvePoint(Math.min(peer.anchor, peer.head)), b = _rapierResolvePoint(Math.max(peer.anchor, peer.head), true);
        if (a && b) {
          const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
          for (const rect of range.getClientRects()) {
            if (rect.bottom < box.top || rect.top > box.bottom) continue;
            const highlight = make('span', 'rapier-live-selection');
            highlight.style.setProperty('--live-color', color(peer.author));
            Object.assign(highlight.style, {left: rect.left + 'px', top: Math.max(rect.top, box.top) + 'px',
              width: rect.width + 'px', height: Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) + 'px'});
            layer.append(highlight);
          }
        }
      }
    }
  }
  function drawSoon() { if (!frame) frame = requestAnimationFrame(draw); }
  function endpoint() {
    const url = new URL(globalThis.RAPIER_DOOR || 'https://mcp.rapier.website/mcp');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('The live document service is unavailable.');
    return url.origin;
  }
  function publicPage() {
    const current = new URL(location.href);
    if (!['https:', 'http:'].includes(current.protocol) || /\/d\/ws_|rapier-app\.html$/.test(current.pathname))
      return new URL('/rapier.html', endpoint()).href;
    current.hash = ''; return current.href;
  }
  function personName(value) {
    if (!value) { try { value = localStorage.getItem('rapier:live-name'); } catch (_) {} }
    value = [...String(value || 'Person').trim()].slice(0, 80).join('');
    if (!value || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)) value = 'Person';
    return value;
  }
  function link() {
    if (!binding) return null;
    const url = new URL(binding.joinUrl || publicPage());
    url.hash = new URLSearchParams({live: binding.url, key: binding.key,
      ...(binding.private ? {private: binding.private.key} : {})}).toString();
    return url.href;
  }
  async function copyLink() {
    const value = link(); if (!value) return false;
    const copied = await _rapierWriteTextClipboard(value);
    if (copied) showToast('Live link copied', 'success');
    return copied;
  }
  function invitation(captured) {
    return new Promise((resolve, reject) => {
      const workerUrl = URL.createObjectURL(new Blob([globalThis.RapierLiveSession.workerSource()], {type: 'text/javascript'}));
      let creator;
      try { creator = new Worker(workerUrl); } catch (error) { URL.revokeObjectURL(workerUrl); reject(error); return; }
      URL.revokeObjectURL(workerUrl);
      const requestId = crypto.randomUUID();
      const finish = (value, error) => { clearTimeout(timeout); creator.terminate(); error ? reject(error) : resolve(value); };
      const timeout = setTimeout(() => finish(null, new Error('The live link could not be prepared. Try again.')), 30000);
      creator.onerror = event => finish(null, new Error(event.message || 'The live link could not be prepared.'));
      creator.onmessage = event => {
        const value = event.data;
        if (value?.type !== 'invitation' || value.requestId !== requestId) return;
        finish(value.invitation, value.error ? new Error(value.error) : null);
      };
      creator.postMessage({type: 'invitation', requestId, ...captured});
    });
  }
  function share(options = {}) {
    if (own()) { people(); return Promise.resolve(snapshot()); }
    if (shareFlight) return shareFlight;
    shareFlight = (async () => {
      await globalThis.RapierAgentBrowser.ready;
      if (!_rapierSettlePendingDocumentChange()) throw new Error('Finish composing, then share the document.');
      const captured = {documentId: String(rapier.identity.authority), filename: rapier.document.filename,
        docKind: rapier.document.docKind, source: _rapierSourceText(), ledger: _rapierLedgerCapture()};
      const prepared = await invitation(captured), origin = endpoint();
      if (String(rapier.identity.authority) !== captured.documentId) throw new Error('The open document changed. Share it again.');
      const response = await fetch(new URL('/live/' + prepared.id + '/create', origin), {method: 'POST',
        credentials: 'omit', cache: 'no-store', redirect: 'error', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(prepared.request), signal: AbortSignal.timeout(30000)});
      const result = await response.json();
      if (!response.ok || result.created !== true || result.id !== prepared.id)
        throw new Error(result.reason || 'The live link could not be created. Your document is kept.');
      const socket = new URL('/live/' + prepared.id + '/socket', origin); socket.protocol = socket.protocol === 'http:' ? 'ws:' : 'wss:';
      const joined = await join({url: socket.href, key: prepared.access, name: personName(options.name),
        private: {id: prepared.id, key: prepared.key, owner: prepared.owner}, documentId: captured.documentId,
        filename: captured.filename, baseline: {documentId: captured.documentId, gen: 0, source: captured.source, ledger: captured.ledger}, joinUrl: publicPage()});
      people(); return joined;
    })().catch(error => { showToast(error.message, 'error'); throw error; }).finally(() => {shareFlight = null;});
    return shareFlight;
  }
  async function stop() {
    if (!own() || !state.canStop) return false;
    const id = ++undoSequence;
    const result = await new Promise(resolve => {
      stopRequests.set(id, resolve);
      if (!send({type: 'stop', id})) {stopRequests.delete(id); resolve({stopped: false, reason: 'live_unavailable'});}
    });
    if (!result.stopped) { showToast(result.reason || 'Sharing could not be stopped. Try again.', 'error'); return false; }
    await leave(); showToast('Sharing stopped', 'success'); return true;
  }
  function rename(value) {
    const name = personName(value);
    if (!own()) return false;
    binding.name = name;
    try { localStorage.setItem('rapier:live-name', name); } catch (_) {}
    return send({type: 'rename', name});
  }
  function people() {
    if (!own()) return;
    sheet?.close();
    const names = make('div', 'rapier-live-people');
    const privacy = make('p', 'rapier-live-privacy', binding.private
      ? 'Encrypted between people. Anyone with the link can read and edit. The server sees connections and message sizes; text, names and carets are encrypted.'
      : 'Shared with agents. The server and connected agents can read and edit this document. Anyone with the link can edit.');
    const label = make('label', 'rapier-live-field', 'Your name');
    const name = make('input', 'rapier-live-input'); name.type = 'text'; name.value = state.author?.name || binding.name;
    name.maxLength = 80; name.autocomplete = 'nickname'; name.addEventListener('change', () => rename(name.value)); label.append(name);
    const address = make('input', 'rapier-live-input'); address.type = 'text'; address.readOnly = true;
    address.value = link(); address.setAttribute('aria-label', 'Live document link'); address.addEventListener('focus', () => address.select());
    const copy = make('button', '', 'Copy live link'); copy.type = 'button'; copy.addEventListener('click', () => void copyLink());
    const changes = make('button', '', 'Changes'); changes.type = 'button'; changes.addEventListener('click', () => {
      sheet?.close(); void globalThis.RapierChanges.next();
    });
    const done = make('button', '', 'Done'); done.type = 'button'; done.addEventListener('click', () => sheet?.close());
    const end = make('button', '', state.canStop ? 'Stop sharing' : 'Leave'); end.type = 'button'; end.dataset.pop = 'exit';
    end.addEventListener('click', async () => {end.disabled = true; if (state.canStop) { if (!await stop()) end.disabled = false; } else await leave();});
    const refresh = () => {
      names.replaceChildren(privacy);
      if (state.state === 'stopped') names.append(make('p', 'rapier-live-problem', 'Your changes are kept on this device. ' + (state.error || 'The live session is paused.')));
      for (const author of [state.author, ...peers.filter(peer => peer.client !== state.client).map(peer => peer.author)].filter(Boolean)) {
        const row = make('div', 'rapier-live-person', author.name || 'Person'); row.style.setProperty('--live-color', color(author)); names.append(row);
      }
      end.textContent = state.canStop ? 'Stop sharing' : 'Leave';
    };
    refresh(); subscribers.add(refresh);
    sheet = globalThis.RapierAgentBrowser.sheet({title: 'Share live', body: [names, label, address, [copy, changes, done], [end]],
      onEscape: current => current.close(), onClose: () => { subscribers.delete(refresh); sheet = null; }});
  }
  function openJoin() { void share().catch(() => {}); }
  function input(event) {
    if (!own() || !event.target?.closest?.('#editor-blocks, #source-wrap, #source-textarea')) return;
    if (event.type === 'beforeinput' || event.type === 'compositionstart') capturePresence(true);
    latestInput = Date.now(); presenceSoon();
    clearTimeout(clearComposition);
    clearComposition = setTimeout(() => { clearComposition = 0; presence(); }, 940);
    if (event.type === 'compositionend') setTimeout(() => {
      if (pendingProjection) { const next = pendingProjection; pendingProjection = null; void project(next); }
      presenceSoon();
    }, 0);
  }
  for (const type of ['beforeinput', 'input', 'compositionstart', 'compositionend']) document.addEventListener(type, input, {capture: true, passive: true});
  document.addEventListener('selectionchange', presenceSoon, {passive: true});
  document.addEventListener('scroll', drawSoon, {capture: true, passive: true});
  window.addEventListener('resize', drawSoon, {passive: true});
  window.addEventListener('blur', () => { latestInput = 0; heldPresence = null; if (lastPresence) send({type: 'presence', ...lastPresence, composing: false}); });
  window.addEventListener('online', () => send({type: 'reconnect'}));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { send({type: 'reconnect'}); presenceSoon(); drawSoon(); }
    else { latestInput = 0; heldPresence = null; if (lastPresence) send({type: 'presence', ...lastPresence, composing: false}); }
  });
  window.addEventListener('pagehide', () => { latestInput = 0; heldPresence = null; if (own()) { _rapierSettlePendingDocumentChange(); send({type: 'presence', anchor: 0, head: 0, composing: false}); } });
  for (const type of ['popstate', 'hashchange']) window.addEventListener(type, cancelResume);
  if (explicitInvitation) queueMicrotask(() => {
    void (async () => {
      const url = fragment.get('live'), privateKey = fragment.get('private');
      if (fragment.has('private') && !privateKey) throw new Error('Use a live document link.');
      return join({url, key: fragment.get('key'), name: personName(),
        ...(privateKey ? {private: {id: /\/live\/([a-f0-9]{32})\/socket$/.exec(new URL(url).pathname)?.[1], key: privateKey}} : {})});
    })().catch(error => showToast(error.message, 'error'));
  });
  return Object.freeze({join, leave, restored, observe, canonicalRows, undo, flush, status: snapshot, copyLink, link, share, stop, rename, color, people, openJoin,
    redo: () => undo(undefined, true),
    active: () => !!own(), actor: () => own() ? state.author?.id || null : null,
    author: () => own() ? state.author || null : null,
    changing: authority => {
      if (resumeReady && resumeCandidate && authority !== resumeCandidate.documentId) cancelResume();
      if (!loading && binding && authority !== binding.authority) void leave();
    },
    subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }});
})();
