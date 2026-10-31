(() => {
  const {createKernel, createState, measurementsRequired, receiptStructureEligible, receiptStructureFact, exportFilename, exportFidelity, PAGE_RESULT_BYTES, resultBytes, boundedResult, modelReply} = globalThis.RapierKernel;
  const {resolveCaller} = globalThis.RapierDoorIdentity;
  const {TOOLS, PAGE_TOOLS, MAX_EXPORT_BYTES, getHumanOperation, getOwnedOperation, annotations, publishedSchema, validateInput} = globalThis.RapierAgentCatalog;
  const editorProtocol = globalThis.RapierAgentEditor;
  const kernelClock = () => Date.now();
  const kernelMintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
  const doorSession = kernelMintId('session_');
  let doorName = '';
  const transactionPrincipals = new Map(), doorNames = new Map();
  const subscribers = new Set();
  const contextSubscribers = new Set();
  const registrations = new Map();
  const failures = new Map();
  const apps = globalThis.RAPIER_APPS_HOST === true;
  const idleSignal = new AbortController().signal;
  let kernel, previous, refreshing, registrationOwner, registrationExposure = '';
  let readyResolve, readyReject, readyDone = false, replacing = false, refreshAgain = false;
  let comparisonOwner = null, comparisonKernelId = null, comparisonGeneration = -1, remoteComparison = null;
  let contextSequence = 0, humanSequence = 0, checkpointedSequence = -1, contextQueued = false, contextTimer = 0, lastInputAt = 0, lastPointerAt = 0;
  let retainedPointer = null, projecting = 0, viewFlight = null;
  let pointerFrame = 0;
  let visualFlight = null, materialFlight = null;
  let drawingNavigationSequence = 0;
  let pendingView = null, viewTimer = 0;
  const editorRequests = new Map(), preferenceVersions = new Map(), agentPreferenceWrites = new Set();
  let editorCard = null;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  const fail = (reason, outcome = 'refused') => ({ok: false, outcome, reason});
  const abort = request => request.signal?.throwIfAborted();
  const context = (request, operation) => {
    if (!request.author?.id || request.author.kind !== request.actor) throw new Error('Canonical author identity is required.');
    return {
      actor: {...request.author},
    transport: request.transport === 'webmcp' ? 'webmcp' : 'platform',
    operation, requestId: request.requestId || crypto.randomUUID(),
    ...(request.turnId ? {turnId: request.turnId} : {}),
    ...(Number.isSafeInteger(request.turnBaseRevision) ? {turnBaseRevision: request.turnBaseRevision} : {}),
    ...(request.sourceTransactionIds ? {sourceTransactionIds: request.sourceTransactionIds.slice()} : {}),
    };
  };
  const caller = request => _rapierDoorStamp({actor: {kind: request.actor || 'agent', id: request.principal || 'webmcp'},
    signal: request.signal || idleSignal, invocation: {id: request.requestId || crypto.randomUUID()}},
    request.transport === 'webmcp' ? 'webmcp' : 'platform');
  const ownsComparison = owner => comparisonOwner === owner && _rapierCompareRuntime.agentOpened &&
    comparisonGeneration === _rapierCompareRuntime.jobId;
  const nativeComparisonId = () => String(rapier.identity.authority) + ':native:' + _rapierCompareRuntime.jobId;
  function externalComparison() {
    const compare = rapier.compare;
    return !apps && compare?.active && !_rapierCompareRuntime.agentOpened
      ? {id: nativeComparisonId(), baseline: compare.currentText, incoming: compare.incomingText, name: compare.incomingName}
      : null;
  }

  function admission() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return 'notes_locked';
    if (_rapierBootstrapRuntime.failed) return 'bootstrap_failed';
    if (_rapierEmbed.active && !_rapierEmbed.capabilities?.includes('agent')) return 'embed_agent_not_granted';
    if (!_rapierBootstrapRuntime.complete) return 'document_not_ready';
    if (_rapierEmbed.framed && !_rapierEmbed.local &&
        !(_rapierEmbed.active && _rapierEmbed.connected && _rapierEmbed.loaded)) return 'host_not_connected';
    return '';
  }

  const visible = () => document.visibilityState !== 'hidden';
  const composing = () => !!(rapier.composition.source || rapier.composition.block);
  const editing = (settled = false) => composing() || _rapierMutationBarrierActive() ||
    (!settled && (globalThis.RapierFlowchartEditor?.editing() === true ||
      humanSequence !== checkpointedSequence && rapier.document.blocks.some(block => block.dirty))) ||
    Date.now() - lastInputAt < 900 ||
    globalThis.RapierImageFlow?.status().moving === true;
  const pointerCurrent = () => retainedPointer && retainedPointer.documentId === String(rapier.identity.authority) &&
    retainedPointer.revision === Number(rapier.revision.settled) &&
    retainedPointer.generation === Number(rapier.revision.generation);

  function livePointer() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return {selection: null, focus: null};
    if (typeof _rapierDrawState === 'object' && _rapierDrawState.open) {
      const selected = _rapierAskChatSelectionText();
      const range = selected?.objectId ? {...selected.selection, objectId: selected.objectId, active: false} : null;
      return {selection: range, focus: range};
    }
    const ta = document.getElementById('source-textarea');
    if (ta && document.activeElement === ta &&
        (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source')) {
      const {start, end} = _rapierHeavyRuntime.selection(ta);
      const active = editing();
      return {selection: {start, end, active}, focus: {start, end, active}};
    }
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return {selection: null, focus: null};
    const held = document.querySelector('#editor-blocks img[data-rapier-image-selected]');
    const heldWrapper = held?.closest('.block-wrapper');
    const heldBlock = heldWrapper && _rapierBoundBlock(heldWrapper);
    if (heldBlock) {
      const span = _rapierExcerptCanonicalBlockSpans([heldBlock.id]).get(heldBlock.id);
      if (span) return {selection: null, focus: {start: span.start, end: span.end, active: false}};
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return {selection: null, focus: null};
    const range = selection.getRangeAt(0);
    if (!_rangeIntersectsEditor(range)) return {selection: null, focus: null};
    const wrappers = _rangeSelectedWrappers(range);
    const first = _rangeBoundaryWrapper(range, false) || wrappers[0];
    const last = _rangeBoundaryWrapper(range, true) || wrappers[wrappers.length - 1];
    const a = _rapierBoundBlock(first), b = _rapierBoundBlock(last);
    if (!a || !b) return {selection: null, focus: null};
    const spans = _rapierExcerptCanonicalBlockSpans([a.id, b.id]);
    const sa = a && spans.get(a.id), sb = b && spans.get(b.id);
    if (!sa || !sb) return {selection: null, focus: null};
    const start = _rapierRenderedBoundaryToCanonical(first, a, range.startContainer, range.startOffset, sa, true);
    const end = _rapierRenderedBoundaryToCanonical(last, b, range.endContainer, range.endOffset, sb, true);
    const exact = Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start;
    const ownsFocus = document.getElementById('editor-blocks')?.contains(document.activeElement);
    return {
      selection: exact ? {start, end, active: editing()} : null,
      focus: ownsFocus ? {start: sa.start, end: sb.end,
        active: editing() || !exact} : null,
    };
  }

  function rememberPointer(automatic = false) {
    if (automatic) {
      const observed = () => contextSubscribers.size > 0 || _rapierAgentConnected();
      if (pointerFrame || !observed()) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (observed()) rememberPointer();
      });
      return;
    }
    if (!readyDone || !visible() || projecting || replacing || composing() || _rapierMutationBarrierActive()) return;
    const value = livePointer();
    if (!value.selection && !value.focus) return;
    retainedPointer = {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled),
      generation: Number(rapier.revision.generation), selection: value.selection && {...value.selection, active: false},
      focus: value.focus && {...value.focus, active: false}};
  }

  function editorFocus() {
    if (!visible()) return {selection: null, focus: null};
    const value = livePointer();
    if (value.selection || value.focus) return value;
    return pointerCurrent() ? {selection: retainedPointer.selection, focus: retainedPointer.focus}
      : {selection: null, focus: null};
  }

  function contextChanged(reason = 'context') {
    contextSequence++;
    if (contextQueued) return;
    contextQueued = true;
    queueMicrotask(() => {
      contextQueued = false;
      const value = {sequence: contextSequence, visible: visible(), editing: editing(), reason};
      for (const notify of contextSubscribers) { try { notify(value); } catch (_) {} }
      if (pendingView?.status === 'pending') void drainView();
      if (!apps && kernel && ['drawing', 'drawing_presentation', 'drawing_navigation', 'visibility', 'playback'].includes(reason)) reconcileDrawingSoon();
    });
  }
  let drawingReconcile = 0, drawingChangedAt = 0, drawingPrimedAt = -1;
  const DRAWING_STILL_MS = 1500;
  function reconcileDrawingSoon() {
    drawingChangedAt = Date.now();
    if (drawingReconcile) return;
    const idle = () => { drawingReconcile = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, {timeout: 3000}) : setTimeout(run, 250); };
    const run = () => {
      drawingReconcile = 0;
      const still = Date.now() - drawingChangedAt, busy = typeof _rapierDrawBusy === 'function' && _rapierDrawBusy().human;
      if (busy || still < DRAWING_STILL_MS) { drawingReconcile = setTimeout(idle, Math.max(250, DRAWING_STILL_MS - still)); return; }
      const digestText = globalThis.RapierNotesIntegrity?.sha256TextOffThread;
      if (drawingPrimedAt !== drawingChangedAt && typeof digestText === 'function') {
        drawingPrimedAt = drawingChangedAt;
        const recipe = typeof _rapierDrawSettledRecipe === 'function' ? _rapierDrawSettledRecipe() : null;
        if (recipe) {
          drawingReconcile = -1;
          void globalThis.RapierKernel.primeRecipeDigest(recipe, digestText).catch(() => false).finally(() => { drawingReconcile = 0; idle(); });
          return;
        }
      }
      try {
        const value = current();
        reconcileKernel(value, {actor: 'system', principal: 'bootstrap'});
        kernel.humanContext({contextId: doorSession, sequence: contextSequence, expectedRevision: value.revision,
          visible: visible(), editing: editing(), navigationSequence: drawingNavigationSequence,
          drawing: value.drawing, drawingReceipts: value.drawingReceipts, objects: objectPlayback()}, {actor: 'human', principal: 'local', transport: 'platform'});
      } catch (_) {}
    };
    idle();
  }

  function drawingNavigationChanged() {
    drawingNavigationSequence++;
    contextChanged('drawing_navigation');
  }

  function humanActivity(event) {
    if (event.isTrusted !== true || projecting) return;
    if (['pointerdown', 'keydown', 'beforeinput', 'compositionstart'].includes(event.type)) drawingNavigationSequence++;
    const target = event.target;
    if (target?.closest?.('.rapier-draw-surface')) {
      humanSequence++;
      queueMicrotask(() => contextChanged(event.type));
      return;
    }
    const inEditor = target?.id === 'source-textarea' || document.getElementById('editor-blocks')?.contains(target);
    if (!inEditor) return;
    humanSequence++;
    viewFlight?.abort();
    lastPointerAt = Date.now();
    if (['beforeinput', 'input', 'compositionstart', 'compositionend'].includes(event.type)) {
      materialFlight?.abort();
      lastInputAt = Date.now();
      clearTimeout(contextTimer);
      contextTimer = setTimeout(() => { rememberPointer(true); contextChanged('settled'); }, 950);
    }
    queueMicrotask(() => { rememberPointer(true); contextChanged(event.type); });
  }

  function drawingContext() {
    return typeof _rapierDrawContext === 'function' ? _rapierDrawContext() : null;
  }

  function drawingPresentationReceipts() {
    return typeof _rapierDrawPresentationReceipts === 'function' ? _rapierDrawPresentationReceipts() : [];
  }

  async function humanContext() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return {...fail('notes_locked'), message: 'Locked notes stay on this phone. Agents cannot read them.'};
    const basic = {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled),
      generation: Number(rapier.revision.generation)};
    if (!readyDone || admission() || _rapierMutationBarrierActive()) {
      return {...fail('document_not_settled', 'yielded'), ...basic,
        context: {sequence: contextSequence, navigationSequence: drawingNavigationSequence, drawingReceipts: drawingPresentationReceipts(), visible: visible(), editing: visible() && editing(), view: viewMode(), selection: null, focus: null}};
    }
    const drawing = drawingContext();
    if (drawing?.open) {
      const value = documentState();
      const focus = drawing.occurrence && Number.isSafeInteger(drawing.occurrence.start) && Number.isSafeInteger(drawing.occurrence.end)
        ? {start: drawing.occurrence.start, end: drawing.occurrence.end, active: false} : null;
      const held = !drawing.occurrence && typeof _rapierDrawHeldRanges === 'function' ? _rapierDrawHeldRanges() : null;
      return {ok: true, ...value, context: {sequence: contextSequence, navigationSequence: drawingNavigationSequence, drawingReceipts: drawingPresentationReceipts(), visible: visible(), editing: false, view: viewMode(),
        selection: null, focus, drawing: Array.isArray(held) ? {...drawing, held: held.map(range => ({start: range.start, end: range.end}))} : drawing}};
    }
    const busy = () => ({...fail('document_not_settled', 'yielded'), ...documentState(),
      context: {...editorFocus(), sequence: contextSequence, navigationSequence: drawingNavigationSequence, drawingReceipts: drawingPresentationReceipts(), visible: visible(), editing: visible() && editing(), view: viewMode()}});
    if (composing() || Date.now() - lastInputAt < 900) return busy();
    const sequence = humanSequence, captured = await _rapierWithSettledExternalDocument(documentState, {quiet: true});
    if (!captured.settled) return busy();
    checkpointedSequence = sequence;
    const value = captured.value;
    if (Date.now() - lastPointerAt < 1500) rememberPointer();
    const pointer = visible() && pointerCurrent() ? {selection: retainedPointer.selection, focus: retainedPointer.focus}
      : {selection: null, focus: null};
    return {ok: true, documentId: value.documentId, revision: value.revision, generation: value.generation,
      filename: value.filename, docKind: value.docKind, text: value.text,
      context: {...pointer, sequence: contextSequence, navigationSequence: drawingNavigationSequence, drawingReceipts: drawingPresentationReceipts(), visible: visible(), editing: visible() && editing(true), view: viewMode(), objects: objectPlayback()}};
  }

  const notesFact = () => { const f = globalThis.rapierNotesStanding; return f && typeof f === 'object' ? {open: !!f.open, current: f.current || null, busy: !!f.busy} : null; };
  const notesFence = fact => { const f = notesFact(); return f && f.open && !(Array.isArray(fact?.splices) && !f.busy) ? 'notes_library_open' : ''; };
  const drawFence = fact => {
    if (typeof document === 'undefined' || !document.body?.classList?.contains('rapier-draw-open')) return '';
    const open = typeof _rapierDrawEditingAsset === 'function' ? _rapierDrawEditingAsset({allowBusy: true}) : '';
    const id = label => { const assets = globalThis.RapierImageAssets; return assets && typeof assets.normalizeLabel === 'function' ? assets.normalizeLabel(String(label)) : String(label); };
    if (open && fact?.drawingAsset && id(fact.drawingAsset) === id(open)) {
      return typeof _rapierDrawFence === 'function' ? _rapierDrawFence(fact) : 'draw_session_open';
    }
    const held = Array.isArray(fact?.splices) && typeof _rapierDrawHeldRanges === 'function' ? _rapierDrawHeldRanges() : null;
    return held && typeof _rapierDrawMoveRanges === 'function' && _rapierDrawMoveRanges(held, fact.splices) ? '' : 'draw_session_open';
  };
  const hostFence = fact => notesFence(fact) || drawFence(fact);
  const covered = () => typeof document !== 'undefined' && (!!document.body?.classList?.contains('rapier-draw-open') || !!notesFact()?.open);
  let comparisonBaseRecord = null;
  function comparisonRecord() {
    return comparisonBaseRecord?.authority === String(rapier.identity.authority) ? comparisonBaseRecord : null;
  }
  function comparisonExport() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return null;
    const record = comparisonRecord();
    return record ? {text: _rapierSourceText(), base: record.base} : null;
  }
  async function presentCarriedComparison(request) {
    const base = globalThis.RapierLedgerCarried.readBase(request.base);
    const value = current();
    if (value.text !== RapierTextCodec.normalizeDocument(request.text)) return fail('comparison_source_changed', 'conflict');
    comparisonBaseRecord = {authority: value.documentId, base};
    const sequence = humanSequence;
    void ready.then(async () => {
      if (value.documentId !== String(rapier.identity.authority) || value.text !== _rapierSourceText() || humanSequence !== sequence) return;
      await showComparison({documentId: value.documentId, revision: Number(rapier.revision.settled),
        currentText: base.text, currentName: base.name, incomingText: value.text, incomingName: value.filename,
        principal: 'carried-comparison', actor: 'agent', transport: 'platform', signal: idleSignal});
    }).catch(() => {});
    return {ok: true, pending: true, presentation: {status: 'pending', acknowledged: false}};
  }

  function documentState(includeText = true) {
    const notes = notesFact(), edge = _rapierUntouchedEdgeMark();
    return {documentId: String(rapier.identity.authority), revision: Number(edge ? edge.revision : rapier.revision.settled), ...(notes ? {notes} : {}),
      comparisonBase: comparisonRecord()?.base || null, ledgerRoot: (edge ? edge.source.rootId : rapier.document.source?.rootId) || null,
      generation: Number(rapier.revision.generation), filename: String(rapier.document.filename),
      docKind: String(rapier.document.docKind), ...(includeText ? {text: edge ? edge.source.read() : _rapierSourceText()} : {})};
  }

  function current() {
    const edge = _rapierUntouchedEdgeMark();
    const journal = (edge ? rapier.undo.ledger.slice(0, edge.ledger) : rapier.undo.ledger).flatMap(entry => {
      const tx = entry.transaction;
      const splices = tx && _rapierRecordSplices(entry, rapier.undo.ledger);
      return splices ? [{id: tx.id, ...(tx.remoteTransactionId ? {remoteTransactionId: tx.remoteTransactionId} : {}), revision: tx.revision, baseRevision: tx.baseRevision,
        author: {...tx.actor}, ...(entry.authored ? {authored: structuredClone(entry.authored)} : {}),
        ...(tx.reverts ? {reverts: tx.reverts} : {}), ...(tx.reapplies ? {reapplies: tx.reapplies} : {}),
        ...(RapierLedger._rapierRecordMetadata(entry, rapier.undo.ledger) ? {metadata: RapierLedger._rapierRecordMetadata(entry, rapier.undo.ledger)} : {}),
        ...(tx.turnLabel === undefined ? {} : {turnLabel: tx.turnLabel}),
        actor: tx.actor.kind, principal: transactionPrincipals.get(tx.id)?.principal || (tx.actor.kind === 'agent' ? 'unverified:' + doorSession : tx.actor.id), transport: tx.transport,
        ...(transactionPrincipals.get(tx.id)?.hostAgent ? {hostAgent: transactionPrincipals.get(tx.id).hostAgent} : {}),
        operation: tx.operation, createdAt: tx.createdAt, label: entry.changeSet?.label ?? tx.label,
        ...(Array.isArray(tx.affectedBlockIds) ? {affectedBlockIds: tx.affectedBlockIds.slice()} : {}), sourceTransactionId: tx.sourceTransactionId,
        ...(tx.turnId ? {turnId: tx.turnId} : {}),
        ...(Number.isSafeInteger(tx.turnBaseRevision) ? {turnBaseRevision: tx.turnBaseRevision} : {}),
        ...(Array.isArray(tx.sourceTransactionIds) ? {sourceTransactionIds: tx.sourceTransactionIds.slice()} : {}),
        splices: splices.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted}))}] : [];
    });
    return {...documentState(), ...editorFocus(), drawing: drawingContext(), navigationSequence: drawingNavigationSequence, drawingReceipts: drawingPresentationReceipts(), journal, historyComplete: _rapierHistoryIsComplete() && !rapier.undo.trimReason, externalComparison: externalComparison(),
      closedComparisonId: !apps && comparisonKernelId && !ownsComparison(comparisonOwner) ? comparisonKernelId : null};
  }

  async function snapshot(options = {}) {
    await ready;
    const reason = admission();
    if (reason) throw Object.assign(new Error(reason), {code: reason});
    if (['editor.set_view', 'editor.set_preferences'].includes(options.operation) || drawingContext()?.open) return current();
    const sequence = humanSequence, read = await _rapierWithSettledExternalDocument(current, {quiet: true});
    if (!read.settled) throw Object.assign(new Error('document_not_settled'), {code: 'document_not_settled'});
    checkpointedSequence = sequence;
    return read.value;
  }

  function reconcileKernel(value, context) {
    try { kernel.reconcile(value, context); return; }
    catch (error) { if (error?.message !== 'history_invalid') throw error; }
    kernel = createKernel({state: createState({id: value.documentId, filename: value.filename, text: value.text,
      docKind: value.docKind, revision: value.revision}), host, clock: kernelClock, mintId: kernelMintId,
      invocationJournal: kernel.invocationJournal()});
    kernel.reconcile(value, {actor: 'system', principal: 'bootstrap'});
  }

  async function undoHistoryAct(target) {
    await ready;
    const captured = await _rapierWithSettledExternalDocument(current, {quiet: true});
    if (!captured.settled) return {outcome: 'conflict', reason: 'document_not_settled'};
    reconcileKernel(captured.value);
    const result = await kernel.undoHistoryAct(target, {signal: idleSignal, author: _rapierLive.author()}, captured.value);
    await refresh();
    return result;
  }

  function matches(request, revision = request.revision ?? request.baseRevision) {
    const edge = _rapierUntouchedEdgeMark();
    if (edge && request.documentId === String(rapier.identity.authority) && (revision == null || revision === Number(edge.revision)) &&
        (request.beforeText == null || request.beforeText === edge.source.read())) _rapierLeaveEdgeParagraph();
    return request.documentId === String(rapier.identity.authority) &&
      (revision == null || revision === Number(rapier.revision.settled)) &&
      (request.beforeText == null || request.beforeText === _rapierSourceText()) &&
      (request.beforeMetadata == null || _rapierSameDocumentMetadata(request.beforeMetadata, _rapierDocumentMetadata()));
  }

  function editorFact(request, status, details = {}) {
    return {kind: 'editor', documentId: request.documentId, revision: request.revision, operation: request.operation,
      receipt: {id: request.id, status, ...(request.preference ? {preference: request.preference} : {action: request.action}), ...details}};
  }

  function editorCurrent(record, allowHidden = false) {
    const stamp = record.expected;
    return !admission() && (allowHidden || visible()) && !record.request.signal?.aborted && stamp &&
      stamp.expectedDocumentId === String(rapier.identity.authority) &&
      stamp.expectedRevision === Number(rapier.revision.settled) &&
      stamp.expectedGeneration === Number(rapier.revision.generation) &&
      stamp.expectedText === _rapierSourceText();
  }

  function editorPublish(record, fact, notify = true) {
    record.fact = fact;
    if (fact.receipt.status !== 'waiting') {
      clearTimeout(record.timer);
      record.cleanup?.(); record.cleanup = null;
      if (editorCard === record) editorCard = null;
      record.expected = null;
    }
    if (notify) for (const callback of record.callbacks) { try { callback(fact); } catch (_) {} }
    contextChanged('editor');
    return fact;
  }

  function cancelEditorRequest(id, reason = 'editor_unavailable') {
    const record = editorRequests.get(id);
    if (!record || record.fact?.receipt.status !== 'waiting') return false;
    editorPublish(record, editorFact(record.request, 'unavailable', {reason}));
    if (_rapierUi.confirmId === record.confirmId) _rapierUiResolveConfirm(false);
    return true;
  }

  function editorContext() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return {...fail('notes_locked'), message: 'Locked notes stay on this phone. Agents cannot read them.'};
    return editorProtocol.editorContext({preferences: RapierPreferences.snapshot(), receipts: [...editorRequests.values()]
      .filter(record => record.localDocumentId === String(rapier.identity.authority)).map(record => record.fact?.receipt)});
  }

  for (const preference of Object.keys(globalThis.RapierPreferenceDefinitions.PREFERENCE_DEFINITIONS)) {
    preferenceVersions.set(preference, 0);
    RapierPreferences.subscribe(preference, value => {
      preferenceVersions.set(preference, preferenceVersions.get(preference) + 1);
      const record = [...editorRequests.values()].findLast(row => row.request.preference === preference && row.fact?.receipt.status === 'applied');
      if (record && !agentPreferenceWrites.has(preference)) editorPublish(record, {...record.fact, receipt: {...record.fact.receipt, superseded: true, current: value}});
      contextChanged('preferences');
    });
  }

  function editorActionRefusal(request) {
    if (request.action === 'playback') {const image = playbackImage(request); if (typeof image === 'string' || !image) return image || 'preview_unavailable';}
    if (request.action === 'read_aloud' && (!_rapierEmbedFeatureAllowed('readAloud') || !_rapierSpeechEngine())) return 'read_aloud_unavailable';
    if (request.action === 'open_file' && _rapierEmbed.active) return _rapierEmbed.fileOpen.refusal();
    if (request.action === 'install_plugin') {
      if (request.plugin.startsWith('letters-') && !_rapierEmbedFeatureAllowed('draw')) return 'host_feature_refused';
      const provider = request.plugin === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[request.plugin];
      if (typeof provider?.install !== 'function') return 'plugin_unavailable';
    }
    return '';
  }

  async function editorAction(record) {
    const request = record.request;
    if (request.action === 'playback') return document.rapierObjects?.playback(playbackImage(request), request.value)?.ok === true;
    if (request.action === 'read_aloud') return _readFlatDoc(0, request.text) === true;
    if (request.action === 'copy') {
      if (request.format === 'complete') {
        const authority = _rapierExcerptAuthoritySnapshot(), range = request.sourceRange;
        const source = _rapierSourceText();
        if (!authority || !range || source.slice(range.start, range.end) !== request.text) return false;
        const exact = {...range, canonicalLength: authority.canonicalLength};
        const plan = _rapierPlanCompleteExcerpt(exact, rapier.semantic.facts, rapier.semantic.index);
        const payload = _rapierMaterializeCompleteExcerpt(exact, plan, source);
        return !!payload && await _rapierWriteTextClipboard(_rapierCompleteImageExcerpt(payload.excerpt, source)) === true;
      }
      return rapierCopy(request.format, {canonical: request.text, metadata: {filename: String(rapier.document.filename),
        docKind: String(rapier.document.docKind), codeLang: rapier.document.codeLang}});
    }
    if (request.action === 'open_file') {
      const opened = await _rapierUiBeginOpenDocument(record.tap);
      return _rapierEmbed.active ? opened === true : true;
    }
    if (request.action === 'install_plugin') {
      const provider = request.plugin === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[request.plugin];
      if (request.plugin === 'pdf') return await _rapierInstallPdfImportPlugin() !== false && provider.state().installed === true;
      if (request.plugin === 'ocr') { await _rapierOcrInstall(); return provider.status === 'ready'; }
      await provider[provider.status === 'error' ? 'reinstall' : 'install']();
      return true;
    }
    return false;
  }

  function animatedObjects() {
    const query = '#editor-blocks img[data-rapier-html],#editor-blocks img[data-rapier-animation]', rows = [];
    if (!document.rapierObjects || !document.querySelector(query)) return rows;
    const spans = _rapierExcerptCanonicalBlockSpans();
    for (const image of document.querySelectorAll(query)) {
      const fact = document.rapierObjects.inspect(image), block = image.closest('.block-wrapper'), span = block && spans.get(Number(block.dataset.blockId));
      if (fact?.animated && span) rows.push({image, start: span.start, end: span.end, playing: !fact.paused});
    }
    return rows;
  }

  function objectPlayback() {
    const rows = animatedObjects().slice(0, 64);
    return rows.length ? rows.map(({start, playing}) => ({start, playing})) : undefined;
  }

  function playbackImage(request) {
    const range = request.sourceRange;
    if (!range || !document.rapierObjects) return null;
    const images = animatedObjects().filter(row => row.start < range.end && range.start < row.end);
    return images.length === 1 ? images[0].image : images.length ? 'object_ambiguous' : 'no_animated_object';
  }

  function editorActionFact(record, done) {
    return editorFact(record.request, done ? 'done' : 'unavailable', done
      ? {} : {reason: 'editor_action_failed'});
  }

  function editorShowCard(record) {
    const request = record.request;
    const labels = {read_aloud: 'read aloud', copy: 'copy passage', open_file: 'open a file', install_plugin: 'install plug-in'};
    const shown = request.text ? editorProtocol.editorPreview(request.text) : null;
    const message = shown ? (shown.omitted ? shown.head + ' … ' + shown.omitted + ' more characters … ' + shown.tail : shown.head) : (request.plugin ? 'Install ' + request.plugin + ' on this device?' : 'Choose a file from this device to open in Rapier.');
    const answer = rapierConfirm({title: labels[request.action], message, confirmLabel: labels[request.action]});
    record.confirmId = _rapierUi.confirmId;
    editorCard = record;
    const accept = document.getElementById('confirm-accept');
    const tapped = event => {
      if (_rapierUi.confirmId !== record.confirmId) return;
      if (!event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      record.tap = event;
    };
    const aborted = () => cancelEditorRequest(request.id);
    accept.addEventListener('click', tapped, true);
    request.signal?.addEventListener('abort', aborted, {once: true});
    record.cleanup = () => { accept.removeEventListener('click', tapped, true); request.signal?.removeEventListener('abort', aborted); };
    record.timer = setTimeout(() => cancelEditorRequest(request.id, 'editor_request_expired'), editorProtocol.EDITOR_LIMITS.cardMs);
    answer.then(async accepted => {
      if (record.fact.receipt.status !== 'waiting') return;
      if (!accepted) { editorPublish(record, editorFact(request, 'declined')); return; }
      if (!record.tap || !editorCurrent(record)) { editorPublish(record, editorFact(request, 'unavailable', {reason: 'document_changed'})); return; }
      const refusal = editorActionRefusal(request);
      if (refusal) { editorPublish(record, editorFact(request, 'unavailable', {reason: refusal})); return; }
      try {
        const done = await editorAction(record);
        if (record.fact.receipt.status === 'waiting') editorPublish(record, editorActionFact(record, done));
      } catch (error) {
        if (record.fact.receipt.status === 'waiting') editorPublish(record, editorFact(request, 'unavailable', {reason: 'editor_action_failed'}));
      }
    });
  }

  async function resolveEditorRequest(requirements, expected, options = {}) {
    const prepared = editorProtocol.editorRequest(requirements, requirements.operation, requirements);
    if (prepared.outcome !== 'ok') return editorFact(requirements, 'unavailable', {reason: prepared.reason});
    const request = {...prepared.request, id: requirements.id, ...(requirements.sourceRange ? {sourceRange: requirements.sourceRange} : {}),
      ...(requirements.expiresAt ? {expiresAt: requirements.expiresAt} : {}), ...(requirements.signal ? {signal: requirements.signal} : {})};
    if (typeof request.id !== 'string' || !request.id || request.id.length > 128) return editorFact(request, 'unavailable', {reason: 'editor_request_invalid'});
    const signature = JSON.stringify({...prepared.request, sourceRange: request.sourceRange});
    const prior = editorRequests.get(request.id);
    if (prior) {
      if (prior.signature !== signature) return editorFact(request, 'unavailable', {reason: 'editor_request_changed'});
      if (options.onReceipt) prior.callbacks.add(options.onReceipt);
      return prior.fact || editorFact(request, 'unavailable', {reason: 'editor_busy'});
    }
    const stamp = expected || {expectedDocumentId: request.documentId, expectedRevision: request.revision,
      expectedText: _rapierSourceText(), expectedGeneration: Number(rapier.revision.generation)};
    const record = {request, signature, expected: {...stamp}, localDocumentId: stamp.expectedDocumentId, callbacks: new Set()};
    if (options.onReceipt) record.callbacks.add(options.onReceipt);
    const refused = reason => editorFact(request, 'unavailable', {reason});
    if (admission() || !visible()) return refused('editor_unavailable');
    if (!editorCurrent(record)) return refused('document_changed');
    if (request.expiresAt && request.expiresAt <= Date.now()) return refused('editor_request_expired');
    if (editorProtocol.editorNeedsTap(request) && (editorCard || _rapierUi.confirmId)) return refused('editor_busy');
    editorRequests.set(request.id, record);
    while (editorRequests.size > editorProtocol.EDITOR_LIMITS.receipts) {
      const entry = [...editorRequests].find(([, row]) => row !== record && row !== editorCard);
      if (!entry) break;
      editorRequests.delete(entry[0]);
    }
    if (request.operation === 'editor.set_preferences') {
      if (_rapierEmbed.active && RapierPreferences.held(request.preference)) return editorPublish(record, refused('host_owns_preference'), false);
      const previous = RapierPreferences.read(request.preference);
      if (request.preference === 'defaultDocumentFont') {
        const beforeVersion = preferenceVersions.get(request.preference);
        try {
          const changed = await _rapierDocumentFonts.chooseDefault(request.value, {current: () => editorCurrent(record) &&
            preferenceVersions.get(request.preference) === beforeVersion && RapierPreferences.read(request.preference) === previous});
          if (!changed) return editorPublish(record, refused(_rapierFeatureAllowed('defaultDocumentFont') ? 'document_changed' : 'pro_required'), false);
        } catch (_) { return editorPublish(record, refused('preference_write_failed'), false); }
      } else {
        agentPreferenceWrites.add(request.preference);
        try { RapierPreferences.write(request.preference, request.value); }
        finally { agentPreferenceWrites.delete(request.preference); }
      }
      if (RapierPreferences.read(request.preference) !== request.value) return editorPublish(record, refused('preference_write_failed'), false);
      const version = preferenceVersions.get(request.preference);
      const fact = editorPublish(record, editorFact(request, 'applied', {value: request.value, previous}), false);
      if (request.preference === 'defaultDocumentFont') {
        showToast('Default font changed', 'info');
        return fact;
      }
      showToast('View changed', 'info', {label: 'Undo', fn: () => {
        if (preferenceVersions.get(request.preference) === version && RapierPreferences.read(request.preference) === request.value)
          RapierPreferences.write(request.preference, previous);
      }});
      return fact;
    }
    const refusal = editorActionRefusal(request);
    if (refusal) return editorPublish(record, refused(refusal), false);
    if (editorProtocol.editorNeedsTap(request)) {
      const fact = editorPublish(record, editorFact(request, 'waiting'), false);
      editorShowCard(record);
      return fact;
    }
    try {
      const done = await editorAction(record);
      return editorPublish(record, editorActionFact(record, done), false);
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'cancelled' : error?.name === 'NotAllowedError' ? 'device_activation_required'
        : 'editor_action_failed';
      return editorPublish(record, refused(reason), false);
    }
  }

  function capturePlace() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) throw Object.assign(new Error('Locked notes stay on this phone'), {code: 'notes_locked'});
    const capture = _rapierCaptureForegroundSelection([]);
    const spans = _rapierExcerptCanonicalBlockSpans();
    const blocks = new Map(rapier.document.blocks.map((block, index) => [block.id,
      {...spans.get(block.id), raw: block.raw, index}]));
    const scrollers = [document.getElementById('editor-blocks'), document.getElementById('source-textarea')]
      .filter(Boolean).map(node => ({node, top: node.scrollTop, left: node.scrollLeft}));
    const pointer = livePointer();
    return {capture, blocks, scrollers, x: window.scrollX, y: window.scrollY,
      docKind: rapier.document.docKind, pointer,
      canonicalIntegrity: pointer.selection && _rapierTextIntegrity(_rapierSourceText().slice(pointer.selection.start, pointer.selection.end)),
      pointerOwned: !!pointerCurrent(), editing: editing(), humanSequence, covered: covered()};
  }

  function followedSelection(place, splices) {
    const selected = place.pointer.selection;
    if (place.editing || !selected || selected.start === selected.end || humanSequence !== place.humanSequence) return null;
    let start = selected.start, end = selected.end, touched = false;
    for (const row of splices) {
      const until = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
      touched ||= row.removed.length ? row.pos < end && until > start : row.pos > start && row.pos < end;
      const move = (point, last) => point >= until ? point + delta
        : point > row.pos ? row.pos + (last ? row.inserted.length : 0) : point;
      start = move(start, false); end = move(end, true);
    }
    return touched && start >= 0 && end >= start && end <= _rapierSourceText().length ? {start, end} : null;
  }

  function movedPoint(point, splices, collapse) {
    let value = point;
    for (const row of splices) {
      if (value >= row.pos + row.removed.length) value += row.inserted.length - row.removed.length;
      else if (value > row.pos) {
        if (!collapse) return null;
        value = row.pos + Math.min(value - row.pos, row.inserted.length);
      }
    }
    return value;
  }

  function restorePlace(place, splices) {
    if (place.covered) return true;
    const capture = place.capture;
    const followed = followedSelection(place, splices);
    if (place.docKind !== rapier.document.docKind && ['source', 'wysiwyg'].includes(capture.kind)) {
      const selected = place.pointer.selection;
      if (!selected) return false;
      const collapsed = selected.start === selected.end;
      const start = followed?.start ?? movedPoint(selected.start, splices, collapsed);
      const end = followed?.end ?? movedPoint(selected.end, splices, collapsed);
      if (start == null || end == null || end < start ||
          (!followed && !_rapierIntegrityMatches(place.canonicalIntegrity, _rapierSourceText().slice(start, end)))) return false;
      if (rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source') {
        if (_rapierRestoreCanonicalSelection(start, end, capture)) return true;
        rapierSetMode('source', {mutationOwner: _rapierTransactionRuntime.compound});
      }
      const ta = document.getElementById('source-textarea');
      if (!ta) return false;
      _rapierFlatSelectAndReveal(start, end, false);
      ta.setSelectionRange(_rapierTaPos(start), _rapierTaPos(end), capture.direction);
      ta.focus({preventScroll: true});
      return _rapierAbsPos(ta.selectionStart) === start && _rapierAbsPos(ta.selectionEnd) === end;
    }
    if (capture.kind === 'source') {
      const collapsed = capture.start.offset === capture.end.offset;
      const start = followed?.start ?? movedPoint(capture.start.offset, splices, collapsed);
      const end = followed?.end ?? movedPoint(capture.end.offset, splices, collapsed);
      if (start == null || end == null || end < start ||
          (!followed && !_rapierIntegrityMatches(capture.selectedIntegrity, _rapierSourceText().slice(start, end)))) return false;
      const ta = document.getElementById('source-textarea');
      if (!ta) return false;
      _rapierFlatSelectAndReveal(start, end, false);
      ta.setSelectionRange(_rapierTaPos(start), _rapierTaPos(end), capture.direction);
      ta.focus({preventScroll: true});
      return _rapierAbsPos(ta.selectionStart) === start && _rapierAbsPos(ta.selectionEnd) === end;
    }
    if (capture.kind !== 'wysiwyg') return _rapierRestoreForegroundSelection(capture, []);
    if (followed) return _rapierRestoreCanonicalSelection(followed.start, followed.end, capture);
    const spans = _rapierExcerptCanonicalBlockSpans();
    const collapsed = capture.start.blockId === capture.end.blockId && capture.start.offset === capture.end.offset;
    const remap = point => {
      const old = place.blocks.get(point.blockId);
      if (!old) return null;
      const start = movedPoint(old.start, splices, false), end = movedPoint(old.end, splices, false);
      let block = rapier.document.blocks.find(item => {
        const span = spans.get(item.id);
        return span && span.start === start && span.end === end && item.raw === old.raw;
      });
      let offset = point.offset;
      if (!block && collapsed) {
        const at = movedPoint(old.start, splices, true);
        block = rapier.document.blocks.find(item => {
          const span = spans.get(item.id);
          return span && span.start <= at && span.end >= at;
        }) || rapier.document.blocks.find(item => (spans.get(item.id)?.start ?? -1) >= at)
          || rapier.document.blocks[rapier.document.blocks.length - 1];
        if (block) offset = Math.min(offset, String(_rapierBlockLiveText(block.id) || '').length);
      }
      return block ? {...point, blockId: block.id,
        blockIndex: rapier.document.blocks.indexOf(block), offset} : null;
    };
    const start = remap(capture.start), end = remap(capture.end);
    if (!start || !end) return false;
    const active = capture.activeBlockId == null ? null : remap({blockId: capture.activeBlockId, offset: 0});
    return _rapierRestoreForegroundSelection({...capture, start, end,
      activeBlockId: active?.blockId ?? null, activeBlockIndex: active?.blockIndex ?? -1}, []);
  }

  function restoreViewport(place) {
    for (const {node, top, left} of place.scrollers) { node.scrollTop = top; node.scrollLeft = left; }
    if (window.scrollX !== place.x || window.scrollY !== place.y) window.scrollTo(place.x, place.y);
  }

  function commitAdmission(request) {
    const reason = admission() || hostFence({...request.fence, splices: request.splices});
    if (reason) return reason;
    if (!matches(request)) return 'document_changed';
    if (request.metadata?.docKind && request.metadata.docKind.before !== request.metadata.docKind.after && drawingContext()?.open) return 'draw_session_open';
    if (composing() || _rapierMutationBarrierActive() || _rapierEditingRuntime.inputDraining || rapier.sourceTransition.busy || rapier.bindingTransition.busy || rapier.undo.applying) return 'document_not_settled';
    return '';
  }

  async function commit(request) {
    abort(request);
    const restoring = !!request.sourceTransactionId || (Array.isArray(request.sourceTransactionIds) && request.sourceTransactionIds.length > 0);
    if (!_rapierSettlePendingDocumentChange()) {
      return fail('document_not_settled');
    }
    const refused = commitAdmission(request);
    if (refused) return fail(refused, refused === 'document_changed' ? 'conflict' : 'refused');
    const place = capturePlace(), hidden = covered();
    const ctx = context(request, request.operation);
    const resolved = request.splices.map(row => ({text: row.inserted,
      resolved: {kind: 'document-range', source: request.beforeText, start: row.pos, end: row.pos + row.removed.length}}));
    let proof = null;
    if (request.actor === 'agent' && rapier.document.docKind === 'markdown') {
      let text = request.beforeText;
      for (const row of request.splices) {
        const will = {..._rapierWillParse(text), space: 'source'};
        if (!restoring && _rapierWillRefuses(will,
          {kind: 'document-range', start: row.pos, end: row.pos + row.removed.length}, row.inserted)) return fail('document_law');
        text = text.slice(0, row.pos) + row.inserted + text.slice(row.pos + row.removed.length);
      }
      proof = _rapierWillProofBefore(resolved, restoring ? request.restored || [] : null);
    }
    const drafts = request.splices.map(row => ({kind: 'document-range',
      startBlockId: null, endBlockId: null, beforeText: row.removed, afterText: row.inserted,
      anchorBefore: row.pos, anchorAfter: row.pos, replacementLength: row.inserted.length}));
    const changeSet = _rapierChangeSetMetadata(ctx, drafts, request.label ?? request.operation,
      restoring ? 'undo' : 'change');
    let done = false, committed = null;
    try {
      const result = await _rapierWithCompoundTransaction(ctx, async compound => {
        abort(request);
        if (!matches(request)) throw Object.assign(new Error('document_changed'), {code: 'document_changed'});
        const applied = !request.splices.length || await _rapierApplyCanonicalSplices(request.splices,
          {keepSourceMode: rapier.view.mode === 'source', retiredImages: []});
        if (request.metadata) {
          const metadataCommit = _rapierCommitSplices([], {metadata: request.metadata});
          if (!metadataCommit) throw Object.assign(new Error('metadata_invalid'), {code: 'metadata_invalid'});
          if (request.metadata.docKind && request.metadata.docKind.before !== request.metadata.docKind.after)
            await _rapierProjectDocumentMetadata(compound);
          else {updateFilenameDisplay(); renderDocumentKind(); if (rapier.document.docKind === 'code') _refreshCodeHighlight();}
        }
        abort(request);
        if (admission()) throw Object.assign(new Error('host_not_connected'), {code: 'host_not_connected'});
        if (!applied || _rapierSourceText() !== request.text) throw Object.assign(new Error('splice_integrity_failure'), {code: 'splice_integrity_failure'});
        const spans = _rapierExcerptCanonicalBlockSpans();
        request.splices.forEach((row, index) => {
          const rest = request.splices.slice(index + 1);
          const start = movedPoint(row.pos, rest, true), end = movedPoint(row.pos + row.inserted.length, rest, true);
          for (const [id, span] of spans) {
            if (start === end ? span.start <= start && span.end >= end : span.start < end && span.end > start) compound.affectedBlockIds.add(id);
          }
        });
        if (_rapierWillProofFails(proof)) throw Object.assign(new Error('document_law'), {code: 'document_law'});
        if (!hidden && !restorePlace(place, request.splices)) throw Object.assign(new Error('selection_restore_failed'), {code: 'selection_restore_failed'});
        abort(request);
      }, {changeSet, sourceTransactionId: request.sourceTransactionId, sourceTransactionIds: request.sourceTransactionIds,
        turnId: request.turnId, turnBaseRevision: request.turnBaseRevision,
        carriedLedger: request.carriedLedger, signal: request.signal});
      if (typeof _rapierDrawFollow === 'function') _rapierDrawFollow(request.splices);
      committed = {ok: true, revision: result.commitReceipt.documentRevision,
        documentId: result.commitReceipt.documentAuthority, transactionId: result.transaction?.id, createdAt: result.transaction?.createdAt,
        metadata: _rapierDocumentMetadata(), ...(result.transaction ? {author: {...result.transaction.actor}} : {}),
        ...(Array.isArray(result.transaction?.affectedBlockIds) ? {affectedBlockIds: result.transaction.affectedBlockIds.slice()} : {})};
      if (caret.point) caretPut('document_changed');
      if (committed.transactionId && !request.carriedLedger) {
        transactionPrincipals.set(committed.transactionId, {principal: request.principal, hostAgent: request.hostAgent});
        const retained = new Set(rapier.undo.ledger.map(row => row.transaction.id));
        for (const id of transactionPrincipals.keys()) if (!retained.has(id)) transactionPrincipals.delete(id);
      }
      done = true;
      if (place.pointerOwned && !place.editing && humanSequence === place.humanSequence) {
        const pointer = livePointer();
        retainedPointer = {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled),
          generation: Number(rapier.revision.generation), selection: pointer.selection && {...pointer.selection, active: false},
          focus: pointer.focus && {...pointer.focus, active: false}};
      }
      if (result.transaction?.actor.kind === 'agent') _rapierRememberAgentReview(result.transaction,
        request.label, {beforeGeneration: result.beforeGeneration, afterGeneration: result.commitReceipt.generation});
      void refresh();
      return committed;
    } catch (error) {
      if (committed) { committed.presentation = 'failed'; return committed; }
      if (error?.name === 'AbortError' || request.signal?.aborted) return fail('cancelled');
      return fail(error?.code || 'commit_failed', 'conflict');
    } finally {
      try { if (!done && !hidden) restorePlace(place, []); } catch (_) {}
      try { if (!committed) restoreViewport(place); } catch (_) {}
    }
  }

  async function showComparison(request) {
    if (!matches(request)) return fail('document_changed', 'conflict');
    if (hostFence()) return fail(hostFence());
    const owner = request.principal || 'apps';
    if (rapier.compare?.active && !ownsComparison(owner)) return fail('human_comparison_open');
    abort(request);
    const answer = owner === 'carried-comparison' || request.invited ? 'looking' : await invitation('comparison', !covered() && rapier.compare?.active === true,
      'compare:' + (request.compareId || request.incomingText?.length + ':' + request.incomingName));
    const refused = invitationRefused(answer);
    if (refused) return refused;
    if (!matches(request)) return fail('document_changed', 'conflict');
    const read = await _rapierWithSettledExternalDocument(() => matches(request), {quiet: true});
    if (!read.settled || !read.value) return fail('document_changed', 'conflict');
    const compare = rapier.compare;
    if (!compare.active) compare.snapshot = _rapierCompareCaptureView();
    compare.lens = 'text'; compare.changeId = null;
    compare.currentText = request.currentText; compare.currentName = request.currentName || rapier.document.filename;
    _rapierSeenViewMovedByAgent();
    _rapierCompareStart(request.currentText, compare.currentName, request.incomingText, request.incomingName || 'comparison.md', {exact: true});
    if (!matches(request)) return fail('comparison_not_opened');
    comparisonOwner = owner;
    comparisonKernelId = request.compareId || null;
    comparisonGeneration = _rapierCompareRuntime.jobId;
    _rapierCompareRuntime.agentOpened = true;
    return {ok: true, presented: visible() && rapier.compare.active === true, ...invitationTaken(answer)};
  }

  async function closeComparison(request) {
    if (!matches(request)) return fail('document_changed');
    if (!rapier.compare?.active && !rapier.compare?.running) { comparisonOwner = null; return {ok: true, closed: !rapier.compare?.active && !rapier.compare?.running}; }
    if (!ownsComparison(request.principal)) return fail('comparison_not_owned');
    await rapierCompareClose();
    comparisonOwner = null; comparisonGeneration = -1; remoteComparison = null;
    return {ok: true, closed: !rapier.compare?.active && !rapier.compare?.running};
  }

  function viewMode(documentOnly = false) {
    return !documentOnly && notesFact()?.open ? 'notes' : rapier.document.docKind === 'code' || rapier.view.mode === 'source' ? 'source' : 'formatted';
  }

  function viewContext() {
    return {current: viewMode(), ...(pendingView ? {id: pendingView.id, requested: pendingView.view,
      status: pendingView.status, ...(pendingView.reason ? {reason: pendingView.reason} : {})} : {})};
  }

  function retireView(transport) {
    if (transport && pendingView?.transport !== transport) return;
    const request = pendingView;
    pendingView = null;
    clearTimeout(viewTimer); viewTimer = 0;
    if (request?.status === 'pending') { request.status = 'refused'; request.reason = 'host_not_connected'; }
  }

  async function applyViewMode(request) {
    if (!matches(request, null)) return fail('document_changed', 'conflict');
    const reason = admission();
    if (reason) return fail(reason);
    if (request.signal?.aborted) return fail('cancelled');
    if (!visible() || editing() || drawingContext()?.open || notesFact()?.busy || _rapierUiViewTransition.busy) return fail('human_edit_in_progress', 'yielded');
    if (!['formatted', 'source', 'notes'].includes(request.view)) return fail('view_invalid', 'invalid');
    if (viewMode() === request.view) return {ok: true};
    const answer = await invitation(request.view, false, request.id ? 'mode:' + request.id : '');
    const refused = invitationRefused(answer);
    if (refused) return refused;
    if (!matches(request, null)) return fail('document_changed', 'conflict');
    if (!visible() || editing() || drawingContext()?.open || notesFact()?.busy || _rapierUiViewTransition.busy) return fail('human_edit_in_progress', 'yielded');
    if (viewMode() === request.view) return {ok: true, ...invitationTaken(answer)};
    const fromView = viewMode(), sequence = humanSequence;
    const guard = () => !request.signal?.aborted && !admission() && matches(request, null) && visible() &&
      !editing() && !drawingContext()?.open && !notesFact()?.busy &&
      humanSequence === sequence && (!request.guard || request.guard()) &&
      (viewMode() === fromView || viewMode() === request.view);
    if (request.view === 'notes') {
      if (_rapierEmbedFeatureAllowed('notes') && typeof _rapierNotesOpen !== 'function' && _rapierPartAvailable('notes')) await part('notes');
      if (typeof _rapierNotesOpen !== 'function' || !_rapierEmbedFeatureAllowed('notes') || !guard()) return fail('view_unavailable');
      await _rapierNotesOpen(false, {guard});
    } else {
      if (request.view === 'formatted' && rapier.document.docKind === 'code') return fail('view_unavailable');
      if (request.view === 'source') await _rapierUiRequestSourceView({guard});
      else if (rapier.view.mode === 'source') await _rapierUiRequestWysiwygView({guard});
    }
    if (!matches(request, null)) return fail('document_changed', 'conflict');
    if (admission()) return fail(admission());
    if (request.signal?.aborted) return fail('cancelled');
    if (viewMode() !== fromView && viewMode() !== request.view) return fail('human_view_changed');
    if (request.guard && !request.guard()) return fail('view_changed');
    if (!guard()) return fail('human_edit_in_progress', 'yielded');
    if (request.view !== 'notes' && notesFact()?.open) {
      if (viewMode(true) !== request.view) return fail('view_unavailable');
      _rapierNotesClose();
    }
    if (viewMode() !== request.view) return fail('view_unavailable');
    _rapierSeenViewMovedByAgent();
    contextChanged('view');
    return {ok: true, ...invitationTaken(answer)};
  }

  async function drainView() {
    clearTimeout(viewTimer); viewTimer = 0;
    const request = pendingView;
    if (!request || request.status !== 'pending' || request.running) return;
    request.running = true;
    try {
      const current = viewMode();
      const result = current !== request.fromView && current !== request.view ? fail('human_view_changed')
        : await applyViewMode({...request, guard: () => pendingView === request && request.status === 'pending'});
      if (pendingView !== request) return result;
      if (result.outcome === 'yielded') {
        viewTimer = setTimeout(() => { void drainView(); }, 950);
        return {pending: true, viewId: request.id};
      }
      request.status = result.ok ? 'presented' : 'refused';
      if (result.reason) request.reason = result.reason;
      contextChanged('view');
      return {...result, viewId: request.id};
    } finally { request.running = false; }
  }

  async function setView(request) {
    await ready;
    pendingView = {...request, id: kernelMintId('view_'), fromView: viewMode(), status: 'pending'};
    return await drainView();
  }

  async function invitation(kind, looking, key = '', until = 0) {
    if (typeof _rapierAgentInvite !== 'function') return 'following';
    const answer = await _rapierAgentInvite(kind, {looking, key, until});
    if (answer === 'accepted' && kind !== 'notes' && kind !== 'note' && notesFact()?.open && typeof _rapierNotesClose === 'function') _rapierNotesClose();
    return answer;
  }
  const invitationRefused = answer => answer === 'typing' ? fail('human_edit_in_progress', 'yielded') : answer === 'declined' ? fail('invitation_not_taken') : null;
  const invitationTaken = answer => answer === 'accepted' ? {reason: 'invitation_accepted'} : {};

  function revealResolved(request) {
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return {kind: 'document-range', start: request.start, end: request.end};
    const start = _rapierBodyOffsetOfCanonical(request.start), end = _rapierBodyOffsetOfCanonical(request.end);
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) ? {kind: 'markdown-range', start, end} : null;
  }
  function revealInView(resolved) {
    if (!resolved || covered() || rapier.compare?.active) return false;
    if (resolved.kind === 'document-range') {
      const textarea = document.getElementById('source-textarea'), local = textarea ? _rapierTaPos(resolved.start) : -1;
      if (local < 0 || local > textarea.value.length) return false;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20, top = _rapierLineFromPos(textarea.value, local) * lineHeight;
      return top + lineHeight > textarea.scrollTop && top < textarea.scrollTop + textarea.clientHeight;
    }
    const region = _rapierMarkdownRangeBlockIndices(resolved.start, resolved.end), host = document.getElementById('editor-blocks');
    const wrapper = region && document.querySelector('#editor-blocks > [data-block-id="' + CSS.escape(String(rapier.document.blocks[region.first].id)) + '"]');
    if (!wrapper || !host || !wrapper.getClientRects().length) return false;
    const box = wrapper.getBoundingClientRect(), view = host.getBoundingClientRect();
    return box.bottom > view.top && box.top < view.bottom;
  }

  async function reveal(request, invited = false) {
    if (!matches(request) || rapier.compare?.active) return fail('view_changed');
    abort(request);
    if (request.pointer?.expiresAt <= Date.now()) return fail('pointer_expired');
    if (request.pointer && typeof _rapierDrawEditingAsset === 'function' && _rapierDrawEditingAsset()) {
      return agentCaret(request.pointer.id, '', request) ? {ok: true} : fail('target_not_visible');
    }
    let answer = invited;
    if (!answer) {
      answer = await invitation(request.pointer ? 'pointer' : 'passage', revealInView(revealResolved(request)), '', request.pointer?.expiresAt || 0);
      const refused = invitationRefused(answer);
      if (refused) return refused;
      if (!matches(request) || rapier.compare?.active) return fail('view_changed');
      abort(request);
    }
    if (request.pointer?.expiresAt <= Date.now()) request = {...request, pointer: null};
    const resolved = revealResolved(request);
    if (!resolved) return fail('target_not_visible');
    const travel = _rapierTravelBegin('agent reveal');
    _rapierSeenViewMovedByAgent();
    const scroll = _rapierScrollResolvedIntoView(resolved);
    if (scroll.reason) return fail(scroll.reason);
    const yielded = new AbortController(), personMoved = () => yielded.abort(), outer = request.signal || idleSignal;
    const inputs = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    for (const type of inputs) document.addEventListener(type, personMoved, {capture: true, passive: true});
    if (outer?.aborted) yielded.abort(); else outer?.addEventListener?.('abort', personMoved, {once: true});
    let settled;
    try { settled = await _rapierSettleRevealScroll(scroll, yielded.signal, null); }
    finally { for (const type of inputs) document.removeEventListener(type, personMoved, {capture: true}); outer?.removeEventListener?.('abort', personMoved); }
    if (!settled || !matches(request)) return fail('view_changed');
    abort(request);
    if (request.pointer) {
      if (!agentCaret(request.pointer.id, '', request, scroll.element)) return fail('target_not_visible');
    } else {
      if (resolved.kind === 'markdown-range') _rapierRestoreCanonicalSelection(request.start, request.end);
      _rapierRevealMarker(resolved, scroll.element);
    }
    if (scroll.scrolled) _rapierTravelCommit(travel, _rapierTravelDestinationForResolved(resolved));
    return {ok: true, ...invitationTaken(answer)};
  }

  function comparisonHunks(compare) {
    if (typeof compare?.baseline !== 'string' || typeof compare.incoming !== 'string') return fail('comparison_missing');
    const local = rapier.compare;
    if (!local?.active || local.running || local.result?.status !== 'ok') return fail('comparison_not_ready');
    if (local.currentText !== compare.baseline || local.incomingText !== compare.incoming) return fail('comparison_changed');
    if (!_rapierCompareRuntime.exact && (compare.baseline.includes('\r') || compare.incoming.includes('\r') ||
        compare.baseline.endsWith('\n') !== compare.incoming.endsWith('\n'))) return fail('comparison_inexact');
    const offsets = text => {
      const result = [0];
      for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) result.push(at + 1);
      result.push(text.length);
      return result;
    };
    const before = offsets(compare.baseline), after = offsets(compare.incoming);
    const interval = (row, values, name) => ({start: values[row[name] - 1], end: values[row[name]]});
    return {ok: true, hunks: local.result.hunks.map(hunk => ({
      removed: hunk.rows.filter(row => row.type === 'remove').map(row => interval(row, before, 'oldLine')),
      inserted: hunk.rows.filter(row => row.type === 'add').map(row => interval(row, after, 'newLine')),
    }))};
  }

  function hunkContains(hunk, change) {
    const covers = (ranges, start, end) => {
      if (start === end) return true;
      let at = start;
      for (const row of ranges) {
        if (row.start > at) break;
        if (row.end > at) at = row.end;
        if (at >= end) return true;
      }
      return false;
    };
    return covers(hunk.removed, change.start, change.end) &&
      covers(hunk.inserted, change.incomingStart, change.incomingEnd);
  }

  function expectedCurrent(expected) {
    return expected?.expectedDocumentId === String(rapier.identity.authority) &&
      expected.expectedRevision === Number(rapier.revision.settled) &&
      expected.expectedText === _rapierSourceText() &&
      (expected.expectedGeneration == null || expected.expectedGeneration === Number(rapier.revision.generation));
  }

  async function presentDrawing(intent, expected, {onReceipt, signal} = {}) {
    await ready;
    const transactionId = String(intent?.transactionId || '');
    const unavailable = reason => ({transactionId, documentId: intent?.documentId, status: 'unavailable', reason,
      presentation: {status: 'unavailable', session: null, surfaceGeneration: 0}});
    if (intent && ['pending', 'replaying'].includes(intent.status) && expected && _rapierDrawOffered() && !_rapierDrawPresent()) await part('drawing');
    if (!intent || !['pending', 'replaying'].includes(intent.status) || !expected || typeof _rapierDrawPresentCommitted !== 'function') return unavailable('drawing_unavailable');
    const sequence = expected.expectedNavigationSequence ?? intent.navigationSequence ?? drawingNavigationSequence;
    const controller = new AbortController(), abortPresentation = () => controller.abort();
    signal?.addEventListener('abort', abortPresentation, {once: true});
    const isCurrent = () => !admission() && visible() && !signal?.aborted && !controller.signal.aborted && expectedCurrent(expected) &&
      drawingNavigationSequence === sequence && !composing() && !_rapierMutationBarrierActive() &&
      !drawingContext()?.busy?.human && (drawingContext()?.open || !editing());
    const changed = () => { if (!isCurrent()) controller.abort(); };
    contextSubscribers.add(changed);
    subscribers.add(changed);
    try {
      return await _rapierDrawPresentCommitted(intent, {current: isCurrent, signal: controller.signal,
        onReceipt: value => { contextChanged('drawing_presentation'); try { onReceipt?.(value); } catch (_) {} }});
    } finally {
      signal?.removeEventListener('abort', abortPresentation);
      contextSubscribers.delete(changed);
      subscribers.delete(changed);
    }
  }

  async function closeAgentDrawingTurn(reason = 'material_ended') {
    await ready;
    if (typeof _rapierDrawState !== 'object' || !_rapierDrawState?.open) return false;
    if (typeof _rapierDrawBusy === 'function' && _rapierDrawBusy().human) return false;
    const recipe = _rapierDrawState.recipe;
    const empty = typeof _rapierDrawHasContent === 'function' ? !_rapierDrawHasContent(recipe) : !(recipe?.shapes?.length);
    const unchangedEdit = _rapierDrawState.editing && typeof _rapierDrawChangedSinceOpen === 'function' && !_rapierDrawChangedSinceOpen();
    if (!empty && !unchangedEdit) return false;
    try {
      if (typeof _rapierDrawBackupClear === 'function') await _rapierDrawBackupClear();
      if (typeof _rapierDrawClose === 'function') await _rapierDrawClose({landed: false});
      return true;
    } catch (_) { return false; }
  }

    async function applyView(intent, expected, value, options = {}) {
    await ready;
    if (!intent || intent.status !== 'pending' || !['document', 'compare', 'mode'].includes(intent.kind)) return fail('view_invalid', 'invalid');
    if (intent.kind === 'mode') {
      if (value?.documentId !== expected?.expectedDocumentId || !expectedCurrent(expected)) return fail('document_changed', 'conflict');
      if (viewMode() !== intent.fromView && viewMode() !== intent.view) return fail('human_view_changed');
      return applyViewMode({documentId: value.documentId, view: intent.view, id: intent.id, guard: () => expectedCurrent(expected)});
    }
    const hand = await humanContext();
    if (!value || value.documentId !== expected?.expectedDocumentId || value.text !== expected.expectedText ||
        value.revision !== intent.revision || !expectedCurrent(expected)) return fail('document_changed', 'conflict');
    if (!visible()) return fail('view_hidden');
    if (!hand.ok || hand.context.editing) return fail('human_edit_in_progress', 'yielded');
    if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= Date.now()) return fail('view_expired');
    let answer = 'looking';
    if (intent.kind === 'document' && !(intent.pointer && typeof _rapierDrawEditingAsset === 'function' && _rapierDrawEditingAsset())) {
      answer = await invitation(intent.pointer ? 'pointer' : 'passage',
        revealInView(revealResolved({start: intent.start, end: intent.end})), 'view:' + intent.id, intent.expiresAt);
      const refused = invitationRefused(answer);
      if (refused) return refused;
      if (!visible() || !expectedCurrent(expected)) return fail('view_changed');
    }
    viewFlight?.abort();
    const controller = new AbortController();
    viewFlight = controller;
    projecting++;
    try {
      const request = {documentId: value.documentId, revision: expected.expectedRevision,
        principal: 'mcp', actor: 'agent', transport: 'platform', signal: controller.signal,
        ...(intent.pointer ? {pointer: intent.pointer, onPointResult: options.onPointResult} : {})};
      let result;
      if (intent.kind === 'document') {
        if (!Number.isSafeInteger(intent.start) || !Number.isSafeInteger(intent.end) || intent.start < 0 ||
            intent.end < intent.start || intent.end > value.text.length) return fail('view_range_invalid', 'invalid');
        result = await reveal({...request, start: intent.start, end: intent.end}, answer);
      } else {
        const compare = value.compare;
        const change = compare?.id === intent.compareId && compare.changes?.find(row => row.id === intent.changeId);
        if (!change) return fail('comparison_changed', 'conflict');
        result = await host.revealChange({...request, compareId: compare.id, changeId: change.id,
          currentText: compare.baseline, incomingText: compare.incoming, ...change});
        if (result.ok) await new Promise(resolve => requestAnimationFrame(resolve));
      }
      controller.signal.throwIfAborted();
      if (!visible() || !expectedCurrent(expected) || answer !== 'accepted' && intent.expiresAt <= Date.now()) return fail('view_changed');
      return result.ok ? {ok: true, presented: true, viewId: intent.id, ...invitationTaken(answer)} : result;
    } catch (error) {
      return fail(error?.name === 'AbortError' ? 'human_interaction' : error?.code || 'view_failed');
    } finally {
      projecting--;
      if (viewFlight === controller) viewFlight = null;
    }
  }

  function agentRecoveryState() {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) return null;
    if (!kernel) return null;
    if (!kernel.invocationJournal().length && !comparisonRecord()) return null;
    try { kernel.reconcile(current(), {actor: 'system', principal: 'bootstrap'}); } catch (_) {}
    const snap = kernel.snapshot(), invocationJournal = kernel.invocationJournal();
    if (!invocationJournal.length && !comparisonRecord()) return null;
    const {text, ...rest} = snap;
    return {...rest, ...(comparisonRecord() ? {comparisonBase: comparisonRecord().base} : {}), invocationJournal};
  }

  async function structureJob(input) {
    const request = globalThis.RapierStructureRequest.structureRequest(input);
    if (!request) return {ok: false, complete: false, reason: 'structure_unavailable'};
    const sameSource = () => _rapierSourceText() === input.text && String(rapier.document.filename) === input.filename;
    if (!sameSource()) return {ok: false, complete: false, reason: 'document_changed'};
    const result = request.kind === 'markdown'
      ? (typeof md === 'undefined' || !md ? {ok: false, complete: false, reason: 'structure_unavailable'} : globalThis.RapierAgentMarkdown.structureMarkdown(request, md))
      : await _rapierStructureJob(request, idleSignal);
    return sameSource() ? result : {ok: false, complete: false, reason: 'document_changed'};
  }

  async function resolveStructureFact(requirements) {
    if (!requirements || !['outline', 'find'].includes(requirements.mode)) return null;
    if (String(rapier.document.filename) !== requirements.filename) return null;
    const text = _rapierSourceText();
    const input = {text, filename: requirements.filename, mode: requirements.mode,
      ...(requirements.mode === 'find' ? {docKind: requirements.docKind, query: requirements.query, kind: requirements.kind,
        within: requirements.within, offset: requirements.offset} : {})};
    const value = await structureJob(input);
    return {mode: requirements.mode, revision: Number(rapier.revision.settled), filename: requirements.filename,
      ...(requirements.mode === 'find' ? {query: requirements.query, kind: requirements.kind,
        within: requirements.within, offset: requirements.offset} : {}), value};
  }

  function visualImageBudget(result, request) {
    const {pending, reason, ...base} = result;
    return image => {
      const bytes = image.data.length / 4 * 3 - (image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0);
      const output = {...base, outcome: 'ok', representation: 'visual', observation: {
        documentId: request.documentId, revision: request.revision, scope: request.scope,
        mimeType: image.mimeType, width: image.width, height: image.height, bytes,
        ...(request.drawing ? {drawing: globalThis.RapierAgentVisual.visualDrawingIdentity(request.drawing)} : {}),
        ...(request.sourceRange ? {sourceRange: {...request.sourceRange}} : {})},
        content: [{type: 'image', mimeType: image.mimeType, data: ''}]};
      return (request.detail ? Math.ceil(globalThis.RapierAgentVisual.VISUAL_LIMITS.imageBytes / 3) * 4 + PAGE_RESULT_BYTES : PAGE_RESULT_BYTES) - 1024 - resultBytes(output);
    };
  }

  async function inspectDrawingVisual(request, expected, drawing) {
    const visual = globalThis.RapierAgentVisual;
    const identity = {documentId: request.documentId, revision: request.revision, scope: request.scope,
      drawing: visual.visualDrawingIdentity(drawing), ...(request.sourceRange ? {sourceRange: {...request.sourceRange}} : {})};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (!visual.sameVisualDrawing(request.drawing, drawing)) return refuse('visual_target_changed');
    if (drawing.recipeUnavailable || !drawing.recipe) return refuse('visual_render_unavailable');
    const before = documentState(), revision = expected?.expectedRevision ?? request.revision;
    if (before.documentId !== request.documentId || before.revision !== revision ||
        (expected && (expected.expectedDocumentId !== before.documentId || expected.expectedText !== before.text ||
          expected.expectedGeneration !== before.generation))) return refuse('document_changed');
    const field = request.scope === 'page' || request.named ? 'canvas' : request.scope === 'selection' ? 'selection' : 'visible';
    const clip = drawing.bounds?.[field];
    if (!clip || !(clip.width > 0 && clip.height > 0)) return refuse('visual_target_missing');
    if (typeof globalThis.RapierVisualCapture?.captureDrawing !== 'function') return refuse('visual_render_unavailable');
    const controller = new AbortController(), abortCapture = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortCapture, {once: true});
    if (request.signal?.aborted) abortCapture();
    visualFlight = controller;
    const geometry = JSON.stringify({clip, transform: request.scope === 'viewport' ? drawing.transform : null,
      selected: request.scope === 'selection' ? drawing.selectedObjects : null});
    const sequence = humanSequence;
    const current = () => {
      if (controller.signal.aborted || humanSequence !== sequence || !visible() || admission() || _rapierMutationBarrierActive() || String(rapier.identity.authority) !== before.documentId ||
          Number(rapier.revision.settled) !== revision || Number(rapier.revision.generation) !== before.generation ||
          _rapierSourceText() !== before.text) return false;
      const next = drawingContext();
      return visual.sameVisualDrawing(identity.drawing, next) && geometry === JSON.stringify({clip: next?.bounds?.[field],
        transform: request.scope === 'viewport' ? next?.transform : null,
        selected: request.scope === 'selection' ? next?.selectedObjects : null});
    };
    try {
      const observed = request.detail ? await _rapierDrawPart?.observe({recipe: drawing.recipe, signal: controller.signal, current}) : {recipe: drawing.recipe};
      if (!observed?.recipe) return refuse('visual_render_unavailable');
      const image = await globalThis.RapierVisualCapture.captureDrawing({recipe: observed.recipe, clip,
        detail: request.detail, signal: controller.signal, current, imageBudget: request.imageBudget});
      return current() ? {...identity, outcome: 'ok', image, ...(observed.state ? {state: observed.state} : {})} : refuse('visual_target_changed');
    } catch (error) {
      return refuse(request.signal?.aborted ? 'cancelled' : error?.code || 'visual_render_unavailable');
    } finally {
      request.signal?.removeEventListener('abort', abortCapture);
      if (visualFlight === controller) visualFlight = null;
    }
  }

  async function inspectStoredDrawingVisual(request, expected) {
    const visual = globalThis.RapierAgentVisual;
    const identity = {documentId: request.documentId, revision: request.revision, scope: request.scope,
      sourceRange: {...request.sourceRange}, ...(request.drawing ? {drawing: request.drawing} : {})};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    const before = documentState(), revision = expected?.expectedRevision ?? request.revision;
    if (before.documentId !== request.documentId || before.revision !== revision ||
        (expected && (expected.expectedDocumentId !== before.documentId || expected.expectedText !== before.text ||
          expected.expectedGeneration !== before.generation))) return refuse('document_changed');
    const controller = new AbortController(), abortCapture = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortCapture, {once: true});
    if (request.signal?.aborted) abortCapture();
    visualFlight = controller;
    const sequence = humanSequence;
    const current = () => !controller.signal.aborted && visible() && !admission() && !_rapierMutationBarrierActive() &&
      humanSequence === sequence && String(rapier.identity.authority) === before.documentId &&
      Number(rapier.revision.settled) === revision && Number(rapier.revision.generation) === before.generation &&
      _rapierSourceText() === before.text;
    try {
      if (!current()) return refuse('document_changed');
      const raw = before.text.slice(request.sourceRange.start, request.sourceRange.end);
      const match = /^!\[((?:\\.|[^\]\\])*)\]\[([^\]\r\n]+)\](?:[ \t]*<!--md-layout:v1[^>]*-->)?$/.exec(raw);
      if (!match) return refuse('visual_target_missing');
      const assets = globalThis.RapierImageAssets;
      const asset = assets.documentAssets(before.text).assets.get(assets.normalizeLabel(match[2]));
      if (!asset || !/^data:image\/svg\+xml(?:;base64)?,/i.test(asset.url)) return refuse('visual_target_unavailable');
      let recipe = globalThis.RapierDrawCore._rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(assets.decodeDataImage(asset.url)));
      if (!recipe?.view) return refuse('visual_target_unavailable');
      let state = recipe.shapes.some(shape => shape.paint?.mode === 'water') ? 'stored' : 'settled', projection = 'stored';
      if (state === 'stored' && typeof globalThis.RapierDrawAgentPaint?.observeAgentPainting !== 'function') {
        await part('drawing');
        if (!current()) return refuse('document_changed');
      }
      if (!request.preview && state === 'stored') {
        const states = [];
        for (const shape of recipe.shapes) if (shape.paint?.mode === 'water') {
          let observed;
          try { observed = await globalThis.RapierDrawAgentPaint.observeAgentPainting(shape, {signal: controller.signal}); }
          catch (error) { if (controller.signal.aborted) throw error; }
          if (!current()) return refuse('document_changed');
          states.push(observed?.state || 'stored');
        }
        state = states.includes('wet') ? 'wet' : states.includes('stored') ? 'stored' : 'settled';
      }
      if (request.preview) {
        recipe = structuredClone(recipe);
        for (const shape of recipe.shapes) if (shape.paint?.mode === 'water') {
          const observed = await globalThis.RapierDrawAgentPaint.observeAgentPainting(shape, {settle: true, signal: controller.signal});
          if (!current()) return refuse('document_changed');
          if (observed?.unavailable) return refuse('visual_resources_unavailable');
          if (observed) Object.assign(shape, {raster: observed.raster, geom: observed.geom, paint: observed.paint});
        }
        state = 'settled'; projection = 'settled';
      }
      const view = recipe.view, clip = {x: view.x, y: view.y, width: view.w, height: view.h,
        ...(request.preview ? {outputWidth: visual.DRAWING_PREVIEW_EDGE, outputHeight: visual.DRAWING_PREVIEW_EDGE} : {})};
      const image = await globalThis.RapierVisualCapture.captureDrawing({recipe, clip, detail: true,
        signal: controller.signal, current, imageBudget: request.preview ? () => request.previewChars || visual.DRAWING_PREVIEW_CHARS : request.imageBudget});
      return current() ? {...identity, outcome: 'ok', image, state, projection} : refuse('document_changed');
    } catch (error) {
      return refuse(request.signal?.aborted ? 'cancelled' : error?.code || 'visual_render_unavailable');
    } finally {
      request.signal?.removeEventListener('abort', abortCapture);
      if (visualFlight === controller) visualFlight = null;
    }
  }

  async function inspectVisual(request, expected) {
    await ready;
    const identity = {documentId: request?.documentId, revision: request?.revision, scope: request?.scope};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (request?.signal?.aborted) return refuse('cancelled');
    if (visualFlight) return refuse('visual_capture_busy');
    if (request?.kind !== 'visual' || !['viewport', 'page', 'focus', 'selection'].includes(request.scope))
      return refuse('visual_target_unavailable');
    if (admission() || !visible()) return refuse('host_not_connected');
    const drawing = drawingContext();
    if (request.detail && (request.preview || !request.drawing)) return inspectStoredDrawingVisual(request, expected);
    if (drawing?.open) return inspectDrawingVisual(request, expected, drawing);
    if (request.drawing) return refuse('visual_target_changed');
    if (hostFence()) return refuse(hostFence());
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source' || rapier.compare?.active)
      return refuse('visual_render_unavailable');
    const hand = await humanContext();
    const localRevision = expected?.expectedRevision ?? request.revision;
    if (!hand.ok || hand.context.editing) return refuse('human_edit_in_progress');
    if (hand.documentId !== request.documentId || hand.revision !== localRevision ||
        (expected && (expected.expectedDocumentId !== hand.documentId || expected.expectedText !== hand.text ||
          expected.expectedGeneration !== hand.generation))) return refuse('document_changed');
    const root = document.getElementById('editor-blocks');
    if (!root || !globalThis.RapierVisualCapture?.captureVisual) return refuse('visual_render_unavailable');
    const target = request.named === true && request.scope === 'focus' ? request.sourceRange
      : request.scope === 'focus' || request.scope === 'selection' ? hand.context[request.scope] : null;
    if (target && (target.start !== request.sourceRange?.start || target.end !== request.sourceRange?.end))
      return refuse('visual_target_changed');
    if (['focus', 'selection'].includes(request.scope) && (!target || target.end <= target.start))
      return refuse('visual_target_missing');
    const sequence = humanSequence, generation = hand.generation, text = hand.text;
    const geometry = [root.scrollLeft, root.scrollTop, root.clientWidth, root.clientHeight];
    const rootRect = root.getBoundingClientRect();
    let clip;
    if (request.scope === 'page') clip = {x: 0, y: 0, width: root.clientWidth, height: root.scrollHeight};
    else if (request.scope === 'viewport') clip = {x: root.scrollLeft, y: root.scrollTop, width: root.clientWidth, height: root.clientHeight};
    else {
      const held = request.scope === 'focus' && request.named !== true ? root.querySelector('img[data-rapier-image-selected]') : null;
      let bounds = held?.getBoundingClientRect();
      if (!bounds && request.scope === 'selection') {
        const selection = window.getSelection();
        const selected = selection?.rangeCount && selection.getRangeAt(0);
        if (selected && root.contains(selected.commonAncestorContainer)) bounds = selected.getBoundingClientRect();
      }
      if (!bounds && request.scope === 'focus') {
        const spans = _rapierExcerptCanonicalBlockSpans();
        const wrappers = _blockWrapperChildren(root).filter(wrapper => {
          const span = spans.get(_rapierBoundBlock(wrapper)?.id);
          return span && span.start < target.end && span.end > target.start;
        });
        if (wrappers.length && !wrappers.some(wrapper => wrapper._rapierUnrendered === true)) {
          const boxes = wrappers.map(wrapper => wrapper.getBoundingClientRect());
          bounds = {left: Math.min(...boxes.map(box => box.left)), right: Math.max(...boxes.map(box => box.right)),
            top: Math.min(...boxes.map(box => box.top)), bottom: Math.max(...boxes.map(box => box.bottom))};
          bounds.width = bounds.right - bounds.left; bounds.height = bounds.bottom - bounds.top;
        }
      }
      if (!bounds?.width || !bounds?.height) return refuse('visual_target_unavailable');
      clip = {x: bounds.left - rootRect.left + root.scrollLeft, y: bounds.top - rootRect.top + root.scrollTop,
        width: bounds.width, height: bounds.height};
    }
    if (visualFlight) return refuse('visual_capture_busy');
    const controller = new AbortController(), abortCapture = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortCapture, {once: true});
    if (request.signal?.aborted) abortCapture();
    visualFlight = controller;
    const current = () => visible() && !admission() && !hostFence() && !editing() && humanSequence === sequence &&
      String(rapier.identity.authority) === hand.documentId && Number(rapier.revision.settled) === localRevision &&
      Number(rapier.revision.generation) === generation && _rapierSourceText() === text &&
      geometry.every((value, index) => value === [root.scrollLeft, root.scrollTop, root.clientWidth, root.clientHeight][index]);
    try {
      const image = await globalThis.RapierVisualCapture.captureVisual({root, clip, signal: controller.signal, current, imageBudget: request.imageBudget});
      if (!current()) return refuse('document_changed');
      return {...identity, outcome: 'ok', image, ...(target ? {sourceRange: {start: target.start, end: target.end}} : {})};
    } catch (error) {
      return refuse(request.signal?.aborted ? 'cancelled' : error?.code || 'visual_render_unavailable');
    } finally {
      request.signal?.removeEventListener('abort', abortCapture);
      if (visualFlight === controller) visualFlight = null;
    }
  }

  async function prepareMaterial(request, expected) {
    await ready;
    const identity = {kind: 'material', documentId: request?.documentId, revision: request?.revision, job: request?.job};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (request?.signal?.aborted) return refuse('cancelled');
    if (request?.kind !== 'material' || !['paint', 'replay', 'sample', 'refraction'].includes(request.task) ||
        !request.payload || typeof request.payload !== 'object') return refuse('material_request_invalid');
    if (materialFlight && !materialFlight.signal.aborted) return refuse('material_busy');
    if (admission() || !visible()) return refuse('editor_unavailable');
    const before = documentState(), revision = expected?.expectedRevision ?? request.revision;
    if (before.documentId !== request.documentId || before.revision !== revision ||
        (expected && (expected.expectedDocumentId !== before.documentId || expected.expectedText !== before.text ||
          expected.expectedGeneration !== before.generation))) return refuse('document_changed');
    const controller = new AbortController(), abortMaterial = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortMaterial, {once: true});
    if (request.signal?.aborted) abortMaterial();
    materialFlight = controller;
    let reason = 'cancelled';
    const current = () => {
      if (controller.signal.aborted) return false;
      if (!visible() || admission()) { reason = 'editor_unavailable'; return false; }
      if (Number.isFinite(request.expiresAt) && request.expiresAt <= Date.now()) { reason = 'material_request_expired'; return false; }
      const state = documentState(), drawing = drawingContext();
      if (state.documentId !== before.documentId || state.revision !== revision || state.generation !== before.generation ||
          state.text !== before.text || state.filename !== before.filename || state.docKind !== before.docKind) {
        reason = 'document_changed'; return false;
      }
      if (_rapierMutationBarrierActive() || composing() || drawing?.busy?.human || (!drawing?.open && editing())) {
        reason = 'human_edit_in_progress'; return false;
      }
      if (!globalThis.RapierKernel.materialMatches(request, {...state, revision: request.revision}, drawing)) {
        reason = 'material_target_changed'; return false;
      }
      return true;
    };
    const changed = () => { if (!current()) controller.abort(); };
    contextSubscribers.add(changed);
    subscribers.add(changed);
    try {
      if (!current()) return refuse(reason);
      const payload = structuredClone(request.payload), options = {...payload, signal: controller.signal};
      let value;
      if (request.task === 'paint' && typeof host.paint === 'function')
        value = await host.paint(payload.strokes, options);
      else if (request.task === 'replay' && typeof host.paintReplay === 'function')
        value = await host.paintReplay(payload.shape, payload.omitIds, options);
      else if (request.task === 'sample' && typeof host.paintSample === 'function')
        value = await host.paintSample(payload.shape, payload.point, options);
      else if (request.task === 'refraction' && typeof globalThis.RapierDrawRefraction?.prepare === 'function') {
        const prepared = await globalThis.RapierDrawRefraction.prepare(payload.recipe, {signal: controller.signal});
        value = {renditions: prepared?.renditions || []};
      }
      else return refuse('material_unavailable');
      if (!current()) return refuse(reason);
      return {...identity, ...globalThis.RapierKernel.admitMaterialResult(request, {...identity, outcome: 'ok', value})};
    } catch (error) {
      return refuse(controller.signal.aborted ? reason : /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(error?.code || '')
        ? error.code : 'material_unavailable');
    } finally {
      request.signal?.removeEventListener('abort', abortMaterial);
      contextSubscribers.delete(changed);
      subscribers.delete(changed);
      if (materialFlight === controller) materialFlight = null;
    }
  }

  let exportFlight = null;
  const retainedExports = new Map();
  const RETAINED_EXPORTS = 4, EXPORT_LIFETIME_MS = 86400000;

  async function exportDocument(request, expected) {
    await ready;
    const identity = {documentId: request?.documentId, revision: request?.revision, format: request?.format,
      ...(request?.part ? {part: request.part.sha256} : {})};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (request?.signal?.aborted) return refuse('cancelled');
    if (exportFlight) return refuse('export_busy');
    if (request?.kind !== 'export' || !['docx', 'pdf', 'page'].includes(request.format)) return refuse('export_format_invalid');
    if (admission() || !visible()) return refuse('editor_unavailable');
    const fence = hostFence();
    if (fence) return refuse(fence);
    const local = await humanContext(), revision = expected?.expectedRevision ?? request.revision;
    if (!local.ok || local.context.editing) return refuse('human_edit_in_progress');
    if (local.documentId !== request.documentId || local.revision !== revision ||
        (expected && (expected.expectedDocumentId !== local.documentId || expected.expectedText !== local.text ||
          expected.expectedGeneration !== local.generation))) return refuse('document_changed');
    const current = () => !request.signal?.aborted && visible() && !admission() && !hostFence() && !editing() &&
      String(rapier.identity.authority) === local.documentId && Number(rapier.revision.settled) === revision &&
      Number(rapier.revision.generation) === local.generation && _rapierSourceText() === local.text &&
      String(rapier.document.filename) === local.filename;
    const flight = {}; exportFlight = flight;
    try {
      if (request.part && typeof request.part.text !== 'string') return refuse('export_scope_invalid');
      const artifact = await _rapierBuildEditorExport(request.format === 'docx' ? 'export_word' : request.format === 'page' ? 'export_page' : 'export_pdf', {expectedText: local.text},
        {signal: request.signal, current, maxBytes: MAX_EXPORT_BYTES, ...(request.part ? {part: request.part.text} : {})});
      const blob = new Blob([artifact.bytes], {type: artifact.mimeType}), filename = exportFilename(request.filename, request.format);
      const {pages, issues} = artifact;
      if (!current()) return refuse(request.signal?.aborted ? 'cancelled' : 'document_changed');
      if (!blob.size || blob.size > MAX_EXPORT_BYTES) return refuse('export_too_large');
      const url = await _rapierBlobDataUrl(blob);
      if (!current()) return refuse(request.signal?.aborted ? 'cancelled' : 'document_changed');
      return {...identity, outcome: 'ok', artifact: {mimeType: blob.type, data: url.slice(url.indexOf(',') + 1), filename,
        ...(pages ? {pages} : {}), ...(issues?.length ? {issues} : {})}};
    } catch (error) {
      const refused = refuse(request.signal?.aborted ? 'cancelled' : /^WILL LOST/.test(String(error?.message)) ? 'will_lost' :
        error?.code === 'stale_context' ? 'document_changed' : typeof error?.code === 'string' && error.code ? error.code.slice(0, 128) : 'export_unavailable');
      return typeof error?.picture === 'string' && error.picture ? {...refused, picture: error.picture.slice(0, 256), alt: String(error.alt || '').slice(0, 256)} : refused;
    } finally { if (exportFlight === flight) exportFlight = null; }
  }

  function forgetExport(id) {
    const value = retainedExports.get(id);
    if (!value) return;
    clearTimeout(value.timer); URL.revokeObjectURL(value.url); retainedExports.delete(id);
  }
  function releaseExports(documentId) {
    for (const [id, value] of retainedExports) if (!documentId || value.documentId !== documentId || value.expiresAt <= Date.now()) forgetExport(id);
  }

  async function portablePage(request, local) {
    const captured = await _rapierCaptureSettledExternalDocument({quiet: true, passive: true});
    if (!captured || captured.canonical !== local.text) throw Object.assign(new Error('The document changed before export.'), {code: 'document_changed'});
    const page = await _rapierBuildEditablePage({...captured, canonical: request.text, comparisonBase: request.base || null, ledger: null, carried: 'none'});
    const current = await snapshot();
    if (request.signal?.aborted || current.documentId !== local.documentId || current.revision !== local.revision || current.text !== local.text)
      throw Object.assign(new Error('The document changed during export.'), {code: request.signal?.aborted ? 'cancelled' : 'document_changed'});
    return page;
  }

  async function exportFile(request) {
    const local = await snapshot(), source = request.source ?? request.text;
    if (local.documentId !== request.documentId || local.revision !== request.revision || local.text !== source ||
        local.filename !== request.filename || request.signal?.aborted || request.guard?.() === false) return {reason: 'document_changed'};
    const comparisonCurrent = () => !request.compareId || rapier.compare?.active === true &&
      comparisonKernelId === request.compareId && ownsComparison(comparisonOwner);
    if (!comparisonCurrent()) return {reason: 'compare_changed'};
    let bytes, mimeType, pages, issues, fontState, fontStamp, artifact;
    let name = exportFilename(request.filename, request.format), fidelity = exportFidelity(request.format, request.docKind);
    if (request.file) {
      ({bytes, mimeType, name, pages, issues, fidelity} = request.file);
    } else if (request.format === 'markdown') {
      const captured = await _rapierCaptureSettledExternalDocument({quiet: true, passive: true});
      if (!captured || captured.canonical !== source) return {reason: 'document_changed'};
      let text = request.text;
      if (request.docKind === 'markdown') {
        fontState = _rapierDocumentFonts.stateKey();
        fontStamp = captured.stamp;
        try { text = await _rapierDocumentFonts.materialize((await _rapierDocumentObjects.materialize(request.text, {signal: request.signal})).source); }
        catch (_) { return {reason: request.signal?.aborted ? 'cancelled' :
          fontState !== _rapierDocumentFonts.stateKey() ? 'document_changed' : 'font_preparation_failed'}; }
      }
      bytes = new TextEncoder().encode((captured.metadata.bom === true ? '\uFEFF' : '') + text);
      mimeType = (request.docKind === 'markdown' ? 'text/markdown' : 'text/plain') + '; charset=utf-8';
    } else if (request.format === 'html') {
      if (!globalThis.RapierPortableShell || !globalThis.RapierPortablePage) return {reason: 'export_page_unavailable'};
      const base = request.base || comparisonRecord()?.base;
      fontState = _rapierDocumentFonts.stateKey();
      fontStamp = _rapierMutationStamp();
      try { const page = await portablePage({...request, base}, local); artifact = page.blob; fidelity = {...fidelity, carries: page.included}; }
      catch (error) { return {reason: typeof error?.code === 'string' ? error.code : 'export_page_unavailable'}; }
      bytes = new Uint8Array(await artifact.arrayBuffer());
      mimeType = 'text/html; charset=utf-8';
    } else {
      const captured = await _rapierCaptureSettledExternalDocument();
      if (!captured || captured.canonical !== source) return {reason: 'document_changed'};
      if (request.format === 'txt') {
        bytes = new TextEncoder().encode(_rapierRenderModule('render-markdown')._rapierPlainTextFile(_rapierBuildInterchangeContext({format: 'txt'},
          request.text === source ? captured : {...captured, canonical: request.text, comparisonBase: null, wordComparison: null})));
        mimeType = 'text/plain; charset=utf-8';
      } else return {reason: 'export_format_invalid'};
    }
    if (bytes.byteLength > MAX_EXPORT_BYTES) return {reason: 'export_too_large', byteLength: bytes.byteLength, limitBytes: MAX_EXPORT_BYTES};
    const now = await snapshot();
    if (request.signal?.aborted || now.documentId !== local.documentId || now.revision !== local.revision || now.text !== local.text ||
        now.filename !== local.filename || now.generation !== local.generation || request.guard?.() === false ||
        fontState !== undefined && (!_rapierMutationStampIsCurrent(fontStamp) || fontState !== _rapierDocumentFonts.stateKey() || _rapierMutationBarrierActive() ||
          rapier.composition.block || rapier.composition.source))
      return {reason: request.signal?.aborted ? 'cancelled' : 'document_changed'};
    if (!comparisonCurrent()) return {reason: 'compare_changed'};
    releaseExports(local.documentId);
    while (retainedExports.size >= RETAINED_EXPORTS) forgetExport(retainedExports.keys().next().value);
    const id = crypto.randomUUID(), url = URL.createObjectURL(artifact || new Blob([bytes], {type: mimeType})), expiresAt = Date.now() + EXPORT_LIFETIME_MS;
    const timer = setTimeout(() => forgetExport(id), EXPORT_LIFETIME_MS);
    retainedExports.set(id, {url, expiresAt, documentId: local.documentId, timer});
    return {id, url, expiresAt, name, mimeType, bytes, fidelity, ...(pages ? {pages} : {}), ...(issues?.length ? {issues} : {})};
  }

  const part = async id => { if (_rapierPartAvailable(id)) await RapierParts.need(id); };
  const notesDoor = async () => { if (!globalThis.rapierNotesHost) await part('notes'); return globalThis.rapierNotesHost; };
  const host = {
    ready: part,
    snapshot: async options => {
      try { return await snapshot(options); }
      catch (error) {
        if (error?.code === 'document_not_settled') return fail(error.code);
        throw error;
      }
    }, commit, reveal, setView, view: viewContext, exportFile, exportScope: true, editorContext, presentDrawing,
    drawingPresentationBinding: () => !apps && visible() && !admission()
      ? {contextId: doorSession, navigationSequence: drawingNavigationSequence} : undefined,
    paintRaster: (raster, options) => globalThis.RapierEmbeddedImages.validatePaintRaster(raster, options),
    presence: value => {
      if (caret.point && !value.pointers?.some(point => point.id === caret.point.id && point.status !== 'expired' && point.expiresAt > Date.now())) caretPut('pointer_cleared');
      const pointers = apps ? (value.pointers || []).filter(point => point.status !== 'shown' || point.id === caret.point?.id) : value.pointers;
      _rapierAgentBarRender({...value, pointers,
        active: Number(value.inFlight || 0) > 0 || pointers?.some(point => point.status === 'shown' && point.expiresAt > Date.now()) === true});
    },
    compare: showComparison, closeCompare: closeComparison,
    ...(_rapierDrawOffered() ? {
      paint: async (strokes, options = {}) => { await part('drawing'); return _rapierDrawPaintAgentStrokes(strokes, options.seed, options.target, options); },
      paintReplay: async (shape, omitIds, options) => { await part('drawing'); return _rapierDrawPaintReplay(shape, omitIds, options); },
      paintSheet: paint => !!globalThis.RapierDrawAgentPaint?.agentPaintSheetHolds(paint),
      paintBrushes: () => globalThis.RapierDrawAgentPaint?.agentPaintBrushRegistry() ?? null,
      paintStrokesFault: (strokes, field) => globalThis.RapierDrawAgentPaint?.agentStrokesFault(strokes, field) ?? null,
      paintSample: async (shape, point, options) => { await part('drawing'); return _rapierDrawPaintSample(shape, point, options); },
    } : {}),
    notesForeground: () => ({binding: String(rapier.identity.authority) + ':' + Number(rapier.identity.epoch || 0), generation: humanSequence}),
    notesFind: async request => { const door = await notesDoor(); if (typeof door?.find !== 'function') return undefined; return door.find({query: request.query, signal: request?.signal}); },
    notesWrite: async request => {
      const door = await notesDoor();
      if (typeof door?.write !== 'function') return undefined;
      return door.write({text: request.text, title: request.title, target: request.target, by: request.by, base: request.base,
        actor: request.actor, author: request.author, principal: request.principal, transport: request.transport, requestId: request.requestId,
        turn_id: request.turn_id, label: request.label}, {signal: request.signal, guard: request.guard,
        writeOpenNote: async (value, options) => {
          options.guard?.();
          if (request.signal?.aborted) return {reason: 'cancelled'};
          const live = await snapshot(), digest = await globalThis.RapierNotesIntegrity.sha256(live.text);
          options.guard?.();
          if (request.signal?.aborted) return {reason: 'cancelled'};
          if (live.documentId !== value.binding?.documentId || Number(rapier.identity.epoch || 0) !== value.binding?.epoch || digest !== value.base)
            return {reason: 'notes_changed'};
          const result = await request.writeOpenNote(value, {guard: options.guard});
          if (!['applied', 'rebased', 'unchanged'].includes(result.outcome)) return result;
          return {file: value.file, act: result.act ?? null, changed: result.sourceChanged === true};
        }});
    },
    notesRead: async request => {
      const door = await notesDoor();
      if (typeof door?.read !== 'function') return undefined;
      return door.read(request.note_ref, {version: request.version, signal: request.signal,
        readOpenNote: async (value, options) => {
          options.guard?.();
          if (request.signal?.aborted) return {reason: 'cancelled'};
          const live = await snapshot();
          options.guard?.();
          if (request.signal?.aborted) return {reason: 'cancelled'};
          if (live.documentId !== value.binding?.documentId || Number(rapier.identity.epoch || 0) !== value.binding?.epoch)
            return {reason: 'notes_changed'};
          return {text: live.text};
        }});
    },
    notesSet: async request => { const door = await notesDoor(); if (typeof door?.set !== 'function') return undefined; return door.set(request, {signal: request?.signal, guard: request.guard}); },
    notesUndo: async request => { const door = await notesDoor(); if (typeof door?.undo !== 'function') return undefined; return door.undo(request, {signal: request?.signal, guard: request.guard}); },
    notesHistory: async request => { const door = await notesDoor(); if (typeof door?.history !== 'function') return undefined; return door.history(request.note_ref, {signal: request?.signal}); },
    notesSync: async request => { const door = await notesDoor(); if (typeof door?.sync !== 'function') return undefined; return door.sync({action: request.action, signal: request?.signal, guard: request.guard}); },
    notesOpen: async request => {
      const door = await notesDoor(); if (typeof door?.open !== 'function') return undefined;
      const before = host.notesForeground();
      const foreground = () => {
        const current = host.notesForeground();
        return current.binding === before.binding && current.generation === before.generation && visible() && !admission() && !editing() && !drawingContext()?.open;
      };
      if (request.expected_foreground?.binding !== before.binding || request.expected_foreground?.generation !== before.generation || !foreground())
        return {refused: 'notes_foreground_changed'};
      const answer = await invitation('note', !!notesFact()?.open || !!door.activeDocument?.(request.note_ref));
      if (answer === 'typing') return {refused: 'human_edit_in_progress'};
      if (answer === 'declined') return {refused: 'invitation_not_taken'};
      if (!foreground()) return {refused: 'notes_foreground_changed'};
      return door.open({note_ref: request.note_ref}, {signal: request.signal, guard: request.guard,
        foregroundGuard: foreground, presentationGuard: () => humanSequence === before.generation && visible()});
    },
    note: text => { _rapierAgentNoteSet(String(text || ''), 'ask'); _rapierAgentNoteShow(); },
    markdown: async input => {
      abort(input);
      if (_rapierSourceText() !== input.text) return {entries: [], complete: false, reason: 'document_changed'};
      if (typeof md === 'undefined' || !md) return {entries: [], complete: false, reason: 'markdown_parser_unavailable'};
      const value = globalThis.RapierAgentMarkdown.outlineMarkdown(input.text, {limit: input.limit}, md);
      abort(input);
      return _rapierSourceText() === input.text ? value : {entries: [], complete: false, reason: 'document_changed'};
    },
    revealChange: async request => {
      const imported = externalComparison();
      if (!matches(request, null) || !rapier.compare?.active ||
          (!ownsComparison(request.principal) && !(request.hostCompareId && imported?.id === request.hostCompareId))) return fail('comparison_not_owned');
      const hunks = comparisonHunks({baseline: request.currentText, incoming: request.incomingText});
      if (!hunks.ok) return hunks;
      const index = hunks.hunks.findIndex(hunk => hunkContains(hunk, request));
      if (index < 0) return fail('change_not_visible');
      _rapierSeenViewMovedByAgent();
      const value = _rapierCompareFocusChange(index);
      if (request.pointer && value.target) {
        if (value.scrolled && !await _rapierAwaitScrollRest(value.scroller, request.signal || idleSignal)) return fail('view_changed');
        if (!matches(request, null) || request.pointer.expiresAt <= Date.now()) return fail('pointer_expired');
        return agentCaret(request.pointer.id, '', request, value.target) ? {ok: true} : fail('target_not_visible');
      }
      return value.target ? {ok: true} : fail('change_not_visible');
    },
    wait: async request => {
      if (!matches(request)) return fail('document_changed');
      if (request.target) return fail('scoped_wait_unavailable');
      const result = await _rapierWaitForUser({event: request.mode, timeout_ms: request.timeout_ms}, caller(request));
      const {context_handle, selection, target, text, truncated, ...value} = result;
      if (value.outcome === 'selection') {
        const state = await snapshot();
        return {...value, selection: {...state.selection, ...(typeof text === 'string' ? {text, truncated: !!truncated} : {})},
          documentId: state.documentId, documentRevision: state.revision, representation: 'source', next: 'document.observe'};
      }
      return {...value, ...(typeof text === 'string' ? {text, truncated: !!truncated} : {})};
    },
    save: async request => {
      if (hostFence()) return fail(hostFence());
      if (!matches(request) || request.text !== _rapierSourceText()) return fail('document_changed');
      try {
        const receipt = await _rapierSaveDocument({}, caller(request));
        return {...receipt, ok: receipt.verified === true || receipt.outcome === 'unchanged',
          destination: _rapierEmbed.active ? 'host_file' : 'device_file',
          savedDocumentId: receipt.savedDocumentAuthority,
          reason: receipt.reason || (receipt.verified ? '' : receipt.saveStatus) || ''};
      } catch (error) {
        if (error?.name === 'AbortError' || request.signal?.aborted) throw error;
        return fail(error?.code || 'save_failed');
      }
    },
    commitFence: fact => hostFence(fact),
  };


  function waitForRead(after, milliseconds, signal, isCurrent) {
    const started = Date.now();
    return new Promise(resolve => {
      let timer, finished = false;
      const finish = reason => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        contextSubscribers.delete(changed);
        signal.removeEventListener('abort', cancelled);
        resolve(reason ? fail(reason) : {waited_ms: Date.now() - started});
      };
      const changed = (expired = false) => {
        const reason = !isCurrent() ? 'document_authority_changed' : admission();
        if (reason) finish(reason);
        else if (expired === true || documentState(false).revision > after && !editing(true)) finish();
      };
      const cancelled = () => finish('cancelled');
      contextSubscribers.add(changed);
      signal.addEventListener('abort', cancelled, {once: true});
      timer = setTimeout(() => changed(true), milliseconds);
      if (signal.aborted) cancelled(); else changed();
    });
  }

  async function invoke(name, args = {}, request = {}) {
    const documentId = String(rapier.identity.authority), documentEpoch = Number(rapier.identity.epoch || 0);
    const inheritedGuard = request.documentGuard;
    const documentGuard = () => String(rapier.identity.authority) === documentId && Number(rapier.identity.epoch || 0) === documentEpoch &&
      (typeof inheritedGuard !== 'function' || inheritedGuard() === true);
    await ready;
    const owned = typeof request.notesGuard === 'function' || typeof request.documentGuard === 'function';
    const tool = TOOLS.find(entry => entry.name === name) || (request.actor === 'human' ? getHumanOperation(name) : owned ? getOwnedOperation(name) : null);
    if (!tool) return {outcome: 'invalid', reason: 'operation_unknown'};
    if (tool && (TOOLS.includes(tool) || owned)) {
      const reason = admission();
      if (reason) return ['editor.set_view', 'editor.set_preferences'].includes(name) || editorProtocol.EDITOR_TOOL_ACTIONS[name]
        ? editorProtocol.editorFailure(reason === 'embed_agent_not_granted' ? reason : 'editor_unavailable') : {outcome: 'refused', reason};
    }
    const resolved = resolveCaller({actor: request.actor, principal: request.principal, transport: request.transport,
      requestId: request.requestId || crypto.randomUUID(), invocationKey: request.invocationKey, session: doorSession},
      {actor: 'agent', principal: 'platform', transport: 'platform'});
    if (resolved.invocationKeyRejected) {
      return kernel.invoke(name, args, {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
        requestId: resolved.requestId, rejectedInvocationKey: true, signal: request.signal || idleSignal, documentGuard});
    }
    const who = {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
      hostAgent: doorNames.get(resolved.transport === 'webmcp' ? 'webmcp' : 'platform') || '',
      requestId: resolved.requestId, invocationKey: resolved.invocationKey, signal: request.signal || idleSignal, documentGuard,
      ...(typeof request.notesGuard === 'function' ? {notesGuard: request.notesGuard} : {})};
    const eager = measurementsRequired(name, args);
    const beforeText = _rapierSourceText(), beforeNavigation = drawingNavigationSequence;
    const run = async () => {
      let waited;
      if (name === 'read' && args && (args.after_revision !== undefined || args.wait_ms !== undefined)) {
        try { validateInput(tool.inputSchema, args, 'arguments', !tool.visibility); }
        catch { return kernel.invoke(name, args, who); }
        if (args.after_revision === undefined) return {...fail('after_revision_required', 'invalid'), field: 'after_revision',
          hint: 'wait_ms needs after_revision, the document revision you last read.'};
        const selector = ['search', 'note', 'guide', 'cursor', 'return_id', 'version', 'versions'].find(key => args[key] !== undefined);
        if (selector) return {...fail('read_wait_selector_conflict', 'invalid'), field: selector,
          hint: 'after_revision and wait_ms watch this document. Read the other target separately.'};
        waited = await waitForRead(args.after_revision, args.wait_ms || 0, who.signal, documentGuard);
        if (waited.outcome) return waited;
      }
      let world, visualFact, editorObservation;
      if (eager?.structure?.mode === 'outline') {
        const fact = await resolveStructureFact({mode: 'outline', filename: String(rapier.document.filename)});
        if (fact) world = {structure: fact};
      }
      let result = await kernel.invoke(name, args, world ? {...who, world} : who);
      for (let guard = 0; guard < 4 && result.outcome === 'pending'; guard++) {
        if (result.pending?.kind === 'surface-fact') {
          if (result.pending.requirements?.kind === 'export') {
            const fact = await exportDocument({...result.pending.requirements, signal: who.signal});
            result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {export: fact}});
            continue;
          }
          if (result.pending.requirements?.kind === 'editor') {
            editorObservation = await resolveEditorRequest({...result.pending.requirements, signal: who.signal});
            result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {editor: editorObservation}});
            continue;
          }
          if (result.pending.requirements?.kind === 'visual') {
            const requirements = result.pending.requirements;
            visualFact = await inspectVisual({...requirements, signal: who.signal,
              ...(who.transport === 'webmcp' ? {imageBudget: visualImageBudget(result, requirements)} : {})});
            result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {visual: visualFact}});
            continue;
          }
          const fact = await resolveStructureFact(result.pending.requirements);
          if (!fact) break;
          result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {structure: fact}});
          continue;
        }
        break;
      }
      const drawingIntent = kernel.collaboration().drawingIntent;
      if (['pending', 'replaying'].includes(drawingIntent?.status) && drawingIntent.documentId === String(rapier.identity.authority) &&
          drawingIntent.revision === Number(rapier.revision.settled)) {
        const expanded = globalThis.RapierKernel.expandDrawingIntent(drawingIntent, kernel.snapshot());
        const drawingReceipt = expanded ? await presentDrawing(expanded, {expectedDocumentId: drawingIntent.documentId,
          expectedRevision: drawingIntent.revision, expectedText: _rapierSourceText(), expectedGeneration: Number(rapier.revision.generation),
          expectedNavigationSequence: drawingIntent.navigationSequence ?? beforeNavigation}, {signal: who.signal}) :
          {transactionId: drawingIntent.transactionId, documentId: drawingIntent.documentId, status: 'unavailable',
            reason: 'drawing_history_unavailable', presentation: {status: 'unavailable'}};
        if (result.act?.id === drawingIntent.transactionId) result = {...result, drawingReceipt};
      }
      if (['applied', 'rebased'].includes(result.outcome) && result.structure?.parse === 'not_checked' &&
          receiptStructureEligible(rapier.document.filename)) {
        const afterText = _rapierSourceText();
        if (afterText !== beforeText) {
          const receipt = await structureJob({text: afterText, filename: String(rapier.document.filename), mode: 'receipt', beforeText});
          if (receipt?.ok) result = {...result, structure: {...receiptStructureFact(beforeText, afterText, receipt), attestedBy: 'adapter'}};
        }
      }
      if (result.outcome === 'ok' && result.representation === 'visual' && result.observation) {
        const requirements = {kind: 'visual', documentId: result.observation.documentId,
          revision: result.observation.revision, scope: result.observation.scope,
          ...(result.observation.drawing ? {drawing: result.observation.drawing} : {}),
          ...(result.observation.sourceRange ? {sourceRange: result.observation.sourceRange, ...(result.observation.named ? {named: true} : {})} : {}),
          ...(result.observation.detail ? {block: result.observation.block, detail: true} : {})};
        visualFact ||= await inspectVisual({...requirements, signal: who.signal,
          ...(who.transport === 'webmcp' ? {imageBudget: visualImageBudget(result, requirements)} : {})});
        const validated = globalThis.RapierAgentVisual.visualResult(requirements, visualFact);
        if (validated.outcome !== 'ok') return {...result, ...validated, observation: undefined};
        result = {...result, ...validated, content: [{type: 'image', mimeType: 'image/png', data: visualFact.image.data}]};
      }

      if (name === 'edit' && ['applied', 'rebased'].includes(result.outcome) && result.previews?.length) {
        const visual = globalThis.RapierAgentVisual, previews = [], content = [];
        const chars = Math.min(visual.DRAWING_PREVIEW_CHARS, Math.floor(visual.DRAWING_PREVIEW_TOTAL_CHARS / result.previews.length));
        for (const target of result.previews) {
          try {
            const prepared = visual.visualRequest({...documentState(), drawing: null}, {expectedRevision: target.revision,
              scope: 'focus', sourceRange: target.sourceRange, block: target.block, detail: true, preview: true, previewChars: chars});
            if (target.documentId !== String(rapier.identity.authority) || prepared.outcome !== 'ok') {
              previews.push({block: target.block, outcome: 'unavailable', reason: prepared.reason || 'document_changed'}); continue;
            }
            const fact = await inspectVisual({...prepared.request, signal: who.signal});
            const observed = visual.visualResult(prepared.request, fact);
            previews.push({block: target.block, ...(observed.outcome === 'ok' ? {outcome: 'ok', observation: observed.observation}
              : {outcome: 'unavailable', reason: observed.reason})});
            if (observed.outcome === 'ok') content.push({type: 'image', mimeType: fact.image.mimeType, data: fact.image.data});
          } catch (error) {
            previews.push({block: target.block, outcome: 'unavailable', reason: who.signal?.aborted ? 'cancelled' : 'visual_render_unavailable'});
          }
        }
        return {...result, previews, ...(content.length ? {content} : {})};
      }

      return waited && result.outcome === 'ok' ? {...result, waited_ms: waited.waited_ms,
        changed: (result.documentRevision ?? result.revision) > args.after_revision} : result;
    };
    const result = await (who.actor === 'agent' ? _rapierAgentInvocationTracked(name, args, run, who.requestId,
      (typeof args.agent === 'string' && args.agent.trim()) || who.hostAgent || doorName) : run());
    if (name === 'edit' && ['applied', 'rebased'].includes(result.outcome)) {
      try { if (who.actor === 'agent') agentCaret(result.act?.id, (typeof args.agent === 'string' && args.agent.trim()) || who.hostAgent || doorName, undefined, undefined, result.act?.label); } catch (_) {}
    }
    if (who.actor === 'agent' && result?.reason === 'document_law' && Number.isSafeInteger(result.region)) {
      try { _rapierAgentWillKept(result.region); } catch (_) {}
    }
    return result;
  }

  async function undoDrawingChange(entry, session) {
    await ready;
    const drawing = typeof _rapierDrawState === 'object' ? _rapierDrawState : null;
    if (!drawing?.open || drawing.session !== session || !drawing.undoStack.includes(entry)) return false;
    const id = entry?.agent?.transactionId;
    const row = id && current().journal.find(row => row.id === id);
    if (!row || row.actor !== 'agent' || row.operation !== 'document.draw') return false;
    const result = await invoke('undo', {act: id},
      {actor: row.actor, principal: row.principal, transport: row.transport});
    return result.outcome === 'applied';
  }

  function status() {
    return {available: registrations.size > 0, ready: readyDone,
      reason: admission() || (registrationOwner ? '' : apps ? 'mcp_apps_host' : 'webmcp_unavailable'),
      registered: [...registrations.keys()], failures: Object.fromEntries(failures)};
  }

  function retire() {
    if (editorCard && registrations.size) cancelEditorRequest(editorCard.request.id);
    const retired = [...registrations.values()];
    registrations.clear(); failures.clear(); registrationOwner = null; registrationExposure = '';
    retireView('webmcp');
    for (const entry of retired) entry.abort();
  }

  async function register() {
    let owner = null;
    try { owner = document.modelContext; } catch (_) {}
    const appsOrigin = apps ? window.RapierMcpApp?.hostOrigin?.() : null;
    if (admission() || location.protocol === 'file:' || !owner?.registerTool || (apps && !appsOrigin)) { retire(); return; }
    const hostOrigin = apps ? appsOrigin : _rapierEmbed.active ? _rapierEmbed.hostOrigin : '';
    const exposure = hostOrigin && hostOrigin !== location.origin ? String(hostOrigin) : '';
    if (registrationOwner !== owner || registrationExposure !== exposure) retire();
    registrationOwner = owner; registrationExposure = exposure;
    nameAtDoor(owner.clientInfo?.name, 'webmcp');
    for (const tool of PAGE_TOOLS) {
      if (apps && tool.name === 'open') continue;
      if (registrations.has(tool.name) || failures.has(tool.name)) continue;
      const controller = new AbortController();
      registrations.set(tool.name, controller);
      try {
        await owner.registerTool({name: tool.name, title: tool.title, description: tool.description,
          inputSchema: publishedSchema(tool.inputSchema), annotations: annotations(tool.effect, 'webmcp'),
          execute: async (args, options = {}) => {
            if (controller.signal.aborted || owner !== registrationOwner || admission())
              return {outcome: 'refused', reason: 'host_not_connected'};
            const flight = new AbortController(), cancel = () => flight.abort();
            const signals = [controller.signal, options.signal].filter(Boolean);
            for (const signal of signals) signal.addEventListener('abort', cancel, {once: true});
            if (signals.some(signal => signal.aborted)) cancel();
            try {
              const result = await invoke(tool.name, args, {actor: 'agent', principal: 'webmcp', transport: 'webmcp',
                requestId: crypto.randomUUID(), signal: tool.name === 'show' ? AbortSignal.any(signals) : flight.signal});
              const reply = modelReply(tool.name, result, {notesVersions: globalThis.RAPIER_WORKSPACE === true});
              if (reply.content?.some(item => item.type === 'image')) {
                const {content, ...text} = reply;
                return {...boundedResult(text, {readOnly: tool.effect === 'read'}), content};
              }
              return boundedResult(reply, {readOnly: tool.effect === 'read'});
            } finally {
              for (const signal of signals) signal.removeEventListener('abort', cancel);
            }
          }}, {signal: controller.signal, ...(exposure ? {exposedTo: [exposure]} : {})});
        if (controller.signal.aborted || admission() || registrationOwner !== owner || registrationExposure !== exposure) {
          controller.abort();
          if (registrations.get(tool.name) === controller) registrations.delete(tool.name);
          return;
        }
      } catch (error) {
        controller.abort();
        if (registrations.get(tool.name) !== controller) return;
        registrations.delete(tool.name); failures.set(tool.name, String(error?.name || 'registration_failed'));
      }
    }
  }

  async function refresh(recovery) {
    if (_rapierBootstrapRuntime.failed) {
      retire();
      if (!readyDone) readyReject(new Error('bootstrap_failed'));
      return status();
    }
    if (!_rapierBootstrapRuntime.complete) return status();
    if (admission()) { if (editorCard) cancelEditorRequest(editorCard.request.id); retire(); }
    if (editorCard && !editorCurrent(editorCard)) cancelEditorRequest(editorCard.request.id, 'document_changed');
    if (refreshing) { refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      if (kernel && subscribers.size) await new Promise(done => {
        const timer = setTimeout(done, 100);
        if (typeof requestAnimationFrame === 'function' && visible()) {
          requestAnimationFrame(() => setTimeout(() => { clearTimeout(timer); done(); }, 0));
        } else { clearTimeout(timer); setTimeout(done, 0); }
      });
      const read = await _rapierWithSettledExternalDocument(() => {
        if (_rapierPendingSource()) { _rapierWebMcpSync(recovery); return null; }
        return !kernel || subscribers.size ? current() : documentState(false);
      }, {quiet: true, passive: true});
      if (!read.settled || !read.value) return status();
      const value = read.value;
      if (!kernel) {
        const restored = recovery || null;
        const inherits = restored && restored.documentId === value.documentId && restored.revision === value.revision;
        const {invocationJournal: restoredJournal, ...restoredState} = restored || {};
        if (inherits && restoredState.comparisonBase)
          comparisonBaseRecord = {authority: value.documentId, base: globalThis.RapierLedgerCarried.readBase(restoredState.comparisonBase)};
        kernel = createKernel({
          state: inherits
            ? {...restoredState, documentId: value.documentId, revision: value.revision,
                filename: value.filename, docKind: value.docKind, text: value.text}
            : createState({id: value.documentId, filename: value.filename, text: value.text,
                docKind: value.docKind, revision: value.revision}),
          host, clock: kernelClock, mintId: kernelMintId,
          ...(inherits && Array.isArray(restoredJournal) ? {invocationJournal: restoredJournal} : {}),
        });
        kernel.reconcile(value, {actor: 'system', principal: 'bootstrap'});
      }
      if (!readyDone) {
        readyDone = true; readyResolve();
        window.dispatchEvent(new Event('rapier-agent-ready'));
      }
      const prior = previous; previous = value;
      releaseExports(value.documentId);
      if (editorCard && !editorCurrent(editorCard)) cancelEditorRequest(editorCard.request.id, 'document_changed');
      if (prior && (value.documentId !== prior.documentId || value.revision !== prior.revision ||
          value.ledgerRoot !== prior.ledgerRoot || value.filename !== prior.filename || value.docKind !== prior.docKind)) {
        const events = value.documentId === prior.documentId
          ? value.journal ? value.journal.filter(row => row.revision > prior.revision)
            : rapier.undo.ledger.filter(row => row.transaction.revision > prior.revision).map(({transaction: tx}) => ({
              actor: tx.actor.kind,
              principal: transactionPrincipals.get(tx.id)?.principal || (tx.actor.kind === 'agent' ? 'unverified:' + doorSession : tx.actor.id),
            })) : [];
        if (!events.length) events.push({actor: replacing ? 'system' : 'human', principal: replacing ? 'mcp' : 'local'});
        for (const entry of events) for (const notify of admission() ? [] : subscribers) {
          try { notify({actor: entry.actor, principal: entry.principal, snapshot: value}); } catch (_) {}
        }
        if (value.documentId !== prior.documentId || !pointerCurrent()) retainedPointer = null;
        if (events.some(entry => entry.actor === 'human') && Date.now() - lastPointerAt < 1500) rememberPointer(true);
        contextChanged('document');
      }
      await register();
      _rapierAgentBarRender();
        return status();
    })().catch(error => ({...status(), reason: error?.code || 'refresh_failed'})).finally(() => {
      refreshing = null;
      if (refreshAgain) { refreshAgain = false; queueMicrotask(() => { void refresh(); }); }
    });
    return refreshing;
  }

  let invitedComparison = null;
  async function syncComparison(value) {
    const compare = value.compare;
    if (!compare) {
      if (remoteComparison) {
        const result = await closeComparison({documentId: value.documentId, principal: comparisonOwner});
        return {...result, visible: !!rapier.compare?.active};
      }
      return {ok: true, visible: false};
    }
    const incomingText = compare.incomingText ?? compare.incoming;
    if (typeof incomingText !== 'string') return {...fail('comparison_invalid'), visible: false};
    if (remoteComparison === compare.id && ownsComparison('mcp') && rapier.compare?.active &&
        rapier.compare.incomingText === incomingText && rapier.compare.currentText === compare.baseline) return {ok: true, visible: true};
    const request = {documentId: value.documentId, revision: Number(rapier.revision.settled),
      compareId: compare.id,
      currentText: typeof compare.baseline === 'string' ? compare.baseline : _rapierSourceText(),
      incomingText, incomingName: compare.name || 'comparison.md',
      principal: 'mcp', actor: 'agent', transport: 'platform'};
    if (!rapier.compare?.active && typeof _rapierAgentFollowing === 'function' && !_rapierAgentFollowing()) {
      if (invitedComparison !== compare.id) {
        invitedComparison = compare.id;
        void invitation('comparison', false, 'compare:' + compare.id).then(async answer => {
          if (answer === 'typing') { invitedComparison = null; return; }
          if (answer !== 'accepted' || remoteComparison === compare.id) return;
          const shown = await showComparison({...request, revision: Number(rapier.revision.settled), invited: true});
          if (shown.ok) remoteComparison = compare.id;
        });
      }
      return {ok: true, visible: false};
    }
    const result = await showComparison(request);
    if (result.ok) remoteComparison = compare.id;
    return {...result, visible: result.ok === true};
  }

  const caret = {el: null, from: null, frame: 0, rest: 0, last: null, point: null, pointResult: null, at: 0};
  function caretPut(reason = 'view_changed') {
    cancelAnimationFrame(caret.frame); clearTimeout(caret.rest); caret.frame = caret.rest = 0;
    const point = caret.point, completed = caret.pointResult;
    caret.point = caret.pointResult = null;
    if (caret.el) caret.el.remove();
    caret.el = null; caret.from = null;
    if (point) {
      const value = {pointerId: point.id, status: 'expired', reason};
      if (completed) completed(value);
      else if (!apps) kernel.pointResult(value, {actor: 'human', principal: 'local', transport: 'platform'});
      if (apps) {
        const work = _rapierAgentBar.workAuthority === String(rapier.identity.authority) ? _rapierAgentBar.work : null;
        const pointers = (work?.pointers || []).filter(row => row.id !== point.id);
        _rapierAgentBarRender({...work, pointers, active: Number(work?.inFlight || 0) > 0 ||
          pointers.some(row => row.status === 'shown' && row.expiresAt > Date.now())});
      }
      else _rapierAgentBarRender();
    }
  }
  for (const [target, type] of [[window, 'scroll'], [window, 'resize'], [window, 'pagehide'], [document, 'visibilitychange']]) {
    target.addEventListener(type, () => { if (caret.el && (type !== 'scroll' || performance.now() - caret.at > 300)) caretPut(); }, {capture: true, passive: true});
  }
  document.addEventListener('rapier-playback', () => contextChanged('playback'));
  document.addEventListener('pointerdown', event => {
    if (event.isTrusted && caret.point) caretPut('human_interaction');
  }, {capture: true, passive: true});
  function caretTarget(request, element) {
    if (request?.pointer) {
      const pointer = request.pointer;
      let box, home = null;
      if (pointer.assetLabel && typeof _rapierDrawEditingAsset === 'function' && _rapierDrawState.open) {
        if (_rapierDrawEditingAsset() !== pointer.assetLabel || _rapierDrawState.editing?.position !== request.start) return null;
        box = pointer.objectId ? [...(_rapierDrawState.svg?.querySelectorAll('[data-shape-id]') || [])]
          .find(node => node.getAttribute('data-shape-id') === pointer.objectId)?.getBoundingClientRect() : _rapierDrawState.svgRoot?.getBoundingClientRect();
      } else {
        if (covered()) return null;
        const bound = element && _rapierBoundBlock(element), span = bound && _rapierExcerptCanonicalBlockSpans([bound.id]).get(bound.id);
        const occurrence = span && _rapierRenderModule('render')._rapierScanMarkdownImages(bound.raw).find(row => span.start + row.start === request.start);
        const image = occurrence && element.querySelector('img[data-rapier-image-index="' + occurrence.renderIndex + '"]');
        if (image && pointer.objectId && pointer.assetLabel) {
          const assets = globalThis.RapierImageAssets, core = globalThis.RapierDrawCore;
          const asset = assets.documentAssets(_rapierSourceText()).assets.get(assets.normalizeLabel(pointer.assetLabel));
          try {
            const recipe = core._rapierDrawReadRecipeFromSVGText(new TextDecoder().decode(assets.decodeDataImage(asset.url)));
            const shape = recipe.shapes.find(row => row.id === pointer.objectId), view = recipe.view;
            if (!shape || !view || !(view.w > 0 && view.h > 0)) return null;
            const bounds = core._rapierDrawShapeBBoxIn(shape, recipe), rect = image.getBoundingClientRect();
            box = {left: rect.left + (bounds.minX - view.x) / view.w * rect.width,
              top: rect.top + (bounds.minY - view.y) / view.h * rect.height,
              height: Math.max(14, Math.min(40, (bounds.maxY - bounds.minY) / view.h * rect.height))};
          } catch (_) { return null; }
        } else if (pointer.objectId) return null;
        else if (image) box = image.getBoundingClientRect();
        else if (rapier.compare?.active) box = element?.getBoundingClientRect();
        else if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') {
          box = _rapierSourceRectForOffset(document.getElementById('source-textarea'), _rapierTaPos(request.start));
        } else {
          const resolved = _rapierResolvePoint(request.start);
          if (resolved) {
            const range = document.createRange(); range.setStart(resolved.node, resolved.offset); range.collapse(true);
            box = _rapierCaretClientRect(range) || range.getBoundingClientRect();
            home = (resolved.node.nodeType === 1 ? resolved.node : resolved.node.parentElement)?.closest('[data-block-id]') || null;
          }
        }
      }
      if (!box) return null;
      const height = Math.max(14, Math.min(40, box.height || 18));
      const point = {x: box.left, y: box.top, height, left: home ? home.getBoundingClientRect().left : box.left, blockId: home?.dataset.blockId ?? null};
      return point.y >= 0 && point.y + height <= window.innerHeight && point.x >= 0 && point.x <= window.innerWidth ? point : null;
    }
    if (covered()) return null;
    const ledger = rapier.undo.ledger;
    for (let i = ledger.length - 1; i >= 0; i--) {
      if (ledger[i].transaction?.actor?.kind !== 'agent') continue;
      const rows = _rapierRecordSplices(ledger[i], ledger);
      const lastRow = rows && rows[rows.length - 1];
      if (!lastRow) return null;
      const region = _rapierMarkdownRangeBlockIndices(...Array(2).fill(_rapierBodyOffsetOfCanonical(lastRow.pos + lastRow.inserted.length)));
      const block = region && rapier.document.blocks[region.last];
      const host = block && document.querySelector('[data-block-id="' + block.id + '"] .block-read');
      if (!host) return null;
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let text = null; for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.trim()) text = node;
      const range = document.createRange();
      if (text) { range.setStart(text, text.data.length); range.collapse(true); } else range.selectNodeContents(host);
      const rects = range.getClientRects(), box = rects.length ? rects[rects.length - 1] : host.getBoundingClientRect();
      const height = Math.max(14, Math.min(40, box.height || 18));
      const point = {x: text ? box.right : box.left, y: box.top + (box.height - height) / 2, height, left: host.getBoundingClientRect().left, blockId: block.id};
      return point.y >= 0 && point.y + height <= window.innerHeight && point.x >= 0 && point.x <= window.innerWidth ? point : null;
    }
    return null;
  }
  function agentCaret(change, label, request, element, actLabel) {
    if (!request && change) { _rapierAgentNamed(label); _rapierAgentBarActed(change, actLabel); }
    if (!change || document.visibilityState === 'hidden') return false;
    if (change === caret.last) return !!caret.el;
    if (request?.pointer && request.pointer.expiresAt <= Date.now()) return false;
    if (caret.point) caretPut('superseded');
    caret.last = change;
    const target = caretTarget(request, element);
    if (!target) { caretPut(); return false; }
    if (!document.getElementById('rapier-agent-caret-style')) {
      const style = document.createElement('style');
      style.id = 'rapier-agent-caret-style';
      style.textContent = '.rapier-agent-caret{position:fixed;left:0;top:0;z-index:150;pointer-events:none;width:2px;background:var(--color-accent,#12A594);transition:opacity .4s}' +
        '.rapier-agent-caret>span{position:absolute;left:var(--tag-x,0px);top:calc(50% - 10px)}.rapier-agent-caret[data-tag=off]>span{display:none}' +
        '.rapier-agent-caret[data-fading]{opacity:0}body.rapier-draw-open .rapier-agent-caret{z-index:905}@media (prefers-reduced-motion:reduce){.rapier-agent-caret{transition:none}}';
      document.head.append(style);
    }
    if (!caret.el) {
      caret.el = document.createElement('div'); caret.el.className = 'rapier-agent-caret'; caret.el.setAttribute('aria-hidden', 'true');
      const tag = document.createElement('span'); tag.className = 'agent-tag';
      caret.el.append(tag);
      document.body.append(caret.el);
    }
    caret.el.removeAttribute('data-fading');
    caret.at = performance.now();
    _rapierAgentWho(caret.el.firstChild);
    if (request?.pointer?.words) { _rapierAgentNoteSet(request.pointer.words); _rapierAgentNoteShow(); }
    _rapierAgentBarWrote(target.blockId);
    caret.el.style.height = target.height + 'px';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const circle = document.getElementById('scroll-fab'), disc = circle?.classList.contains('visible') ? circle.getBoundingClientRect() : null;
    const from = caret.from || (disc?.width ? {x: disc.left + disc.width / 2, y: disc.top + (disc.height - target.height) / 2, height: target.height} : null);
    const motion = globalThis.RapierCursorMotion.createCursorMotion(from || target, target, 'arc', {reducedMotion: reduced || !from});
    delete caret.el.dataset.tag;
    const tag = caret.el.firstChild, tagX = target.left - 28 - tag.offsetWidth;
    caret.el.dataset.tag = tagX >= 8 ? 'on' : 'off';
    const place = point => {
      caret.el.style.transform = 'translate(' + point.x + 'px,' + point.y + 'px)';
      caret.el.style.setProperty('--tag-x', Math.round(tagX - point.x) + 'px');
    };
    cancelAnimationFrame(caret.frame); clearTimeout(caret.rest);
    if (request?.pointer) {
      caret.point = {...request.pointer, documentId: request.documentId, revision: request.revision, status: 'shown'};
      caret.pointResult = request.onPointResult || null;
      caret.rest = setTimeout(() => caretPut('lifetime_elapsed'), Math.max(0, request.pointer.expiresAt - Date.now()));
      if (apps) _rapierAgentBarRender({..._rapierAgentBar.work, active: true,
        pointers: [...(_rapierAgentBar.work?.pointers || []).filter(row => row.id !== caret.point.id), caret.point]});
      else _rapierAgentBarRender();
    }
    const started = performance.now();
    const step = now => {
      const {position} = motion.at(now - started);
      place(position);
      if (now - started < motion.durationMs) { caret.frame = requestAnimationFrame(step); return; }
      caret.from = target;
      if (!caret.point) caret.rest = setTimeout(() => { if (!caret.el) return; caret.el.dataset.fading = ''; caret.rest = setTimeout(caretPut, 450); }, 2600);
    };
    place(motion.at(0).position);
    caret.frame = requestAnimationFrame(step);
    return true;
  }

  function remoteJournal(value, before, whole) {
    if (!Array.isArray(value.journal) || !value.journal.length) return null;
    const metadata = {filename: value.filename, docKind: value.docKind};
    const incoming = new Map(value.journal.map(row => [row.id, row]));
    const known = before?.journal?.findLast(row => incoming.has(row.remoteTransactionId || row.id));
    const boundary = known ? incoming.get(known.remoteTransactionId || known.id).revision
      : before && before.revision === 0 ? 0 : null;
    if (before && boundary == null) return null;
    const remote = []; let text = value.text, priorMetadata = metadata, matched = !before;
    for (let i = value.journal.length - 1; i >= 0; i--) {
      const row = value.journal[i];
      if (!row || !Array.isArray(row.splices)) throw new Error('Invalid remote history');
      if (before && row.revision <= boundary) break;
      text = RapierLedger._rapierTransformSplices(text, row.splices, true);
      priorMetadata = RapierLedger._rapierTransformMetadata(priorMetadata, row.metadata, true);
      if (text === null || !priorMetadata) throw new Error('Remote history does not replay');
      remote.unshift(row);
      if (before && row.baseRevision === boundary) {
        matched = text === before.text && priorMetadata.filename === before.filename && priorMetadata.docKind === before.docKind;
        break;
      }
    }
    return matched && remote.length ? remote : null;
  }

  function remoteLedger(value, before, mapped) {
    if (globalThis.RapierPlatform?.host?.lockedNotes === true) throw Object.assign(new Error('Locked notes stay on this phone'), {code: 'notes_locked'});
    if (!Array.isArray(value.journal)) return null;
    if (typeof value.documentId !== 'string' || !value.documentId || before && before.documentId !== value.documentId)
      throw new Error('Remote document is missing');
    const captured = before ? _rapierLedgerCapture() : null;
    if (!value.journal.length) {
      const metadata = {filename: value.filename, docKind: value.docKind};
      if (before && (value.text !== before.text || !_rapierSameDocumentMetadata(metadata, before))) return null;
      const complete = value.historyComplete !== false && (captured
        ? captured.complete || value.historyComplete === true && !captured.records.length && captured.head.revision === 0 && value.revision === 0
        : value.revision === 0);
      return RapierLedger.exportLedger({text: value.text, metadata, records: captured?.records || [],
        documentAuthority: captured?.documentAuthority || value.documentId, root: captured?.head.root,
        revision: captured?.head.revision ?? value.revision, complete});
    }
    const identity = id => typeof id === 'string' && id.length > 0 && id.length <= 256;
    const incoming = new Map(); let prior = null;
    for (const row of value.journal) {
      if (!row || !identity(row.id) || incoming.has(row.id) || !Array.isArray(row.splices) ||
          Object.hasOwn(row, 'authored') && !RapierLedger._rapierValidAuthored(row.authored) ||
          !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 0 || !Number.isSafeInteger(row.revision) ||
          row.revision !== row.baseRevision + 1)
        throw new Error('Invalid remote history');
      if (prior && row.baseRevision !== prior.revision) throw new Error('Remote history is not continuous');
      incoming.set(row.id, row); prior = row;
    }
    let replaceHistory = false;
    if (captured && captured.records.every(record => incoming.has(record.transaction.remoteTransactionId || record.transaction.id))) {
      let initialText = value.text, initialMetadata = {filename: value.filename, docKind: value.docKind};
      for (const row of value.journal.slice().reverse()) {
        initialText = RapierLedger._rapierTransformSplices(initialText, row.splices, true);
        initialMetadata = RapierLedger._rapierTransformMetadata(initialMetadata, row.metadata, true);
        if (initialText == null || !initialMetadata) throw new Error('Remote history does not reverse');
      }
      const hasAuthored = captured.records.some(record => Object.hasOwn(record, 'authored')) ||
        value.journal.some(row => Object.hasOwn(row, 'authored'));
      const localOrigins = hasAuthored ? RapierLedger.authoredHistory(captured.start.text, captured.records).origins : null;
      const remoteOrigins = hasAuthored ? RapierLedger.authoredHistory(initialText,
        value.journal.map(row => ({transaction: row, splices: row.splices, ...(row.authored ? {authored: row.authored} : {})}))).origins : null;
      const unchangedAct = record => {
        const tx = record.transaction, row = incoming.get(tx.remoteTransactionId || tx.id);
        const authored = rows => rows.map(({removed, inserted}) => ({removed, inserted}));
        const left = localOrigins?.get(tx.id), right = remoteOrigins?.get(row.id);
        const sameSource = hasAuthored ? left.source === right.source &&
          left.basis.length === right.basis.length && left.basis.every((id, index) => id === right.basis[index]) &&
          left.splices.length === right.splices.length && left.splices.every((splice, index) => {
            const other = right.splices[index];
            return splice.pos === other.pos && splice.removed === other.removed && splice.inserted === other.inserted;
          }) : JSON.stringify(authored(record.splices)) === JSON.stringify(authored(row.splices));
        return sameSource &&
          _rapierSameMetadataEffect(record.metadata, row.metadata) &&
          tx.actor.kind === row.author?.kind && tx.actor.id === row.author?.id && tx.actor.name === row.author?.name && tx.createdAt === row.createdAt &&
          tx.operation === row.operation && (record.changeSet?.label ?? tx.label ?? null) === (row.label ?? null) &&
          (tx.turnId ?? null) === (row.turnId ?? null) &&
          (tx.turnLabel ?? null) === (row.turnLabel ?? null) &&
          JSON.stringify(tx.affectedBlockIds || []) === JSON.stringify(row.affectedBlockIds || []) &&
          (tx.sourceTransactionId ?? null) === (row.sourceTransactionId ?? null) &&
          JSON.stringify(tx.sourceTransactionIds || []) === JSON.stringify(row.sourceTransactionIds || []) &&
          (tx.reverts ?? null) === (row.reverts ?? null) && (tx.reapplies ?? null) === (row.reapplies ?? null);
      };
      replaceHistory = initialText === captured.start.text &&
        _rapierSameDocumentMetadata(initialMetadata, captured.start.metadata) && captured.records.every(unchangedAct);
    }
    const remote = remoteJournal(value, replaceHistory ? null : before, true);
    if (!remote) return null;
    const local = before && !replaceHistory ? captured : {records: [], documentAuthority: value.documentId,
      head: {root: RapierLedger.textRoot(remote.reduceRight((text, row) => RapierLedger._rapierTransformSplices(text, row.splices, true), value.text)), revision: remote[0].baseRevision}};
    const records = local.records.slice(), sources = new Map(), revisions = new Map(), retained = new Map();
    const boundary = (remoteRevision, localRevision) => {
      if (revisions.has(remoteRevision) && revisions.get(remoteRevision) !== localRevision)
        throw new Error('Remote revision has conflicting local evidence');
      revisions.set(remoteRevision, localRevision);
    };
    for (const record of records) {
      const tx = record.transaction, id = tx.remoteTransactionId ?? tx.id;
      if (!identity(id)) throw new Error('Invalid remote transaction identity');
      if (!incoming.has(id)) continue;
      if (!retained.has(id)) retained.set(id, []);
      retained.get(id).push(record);
    }
    for (const [id, parts] of retained) {
      const row = incoming.get(id), splices = parts.flatMap(part => part.splices || []);
      if (!_rapierSameMetadataEffect(parts.length === 1 ? parts[0].metadata : null, row.metadata) ||
          splices.length !== row.splices.length || !splices.every((splice, index) => {
        const other = row.splices[index];
        return splice.pos === other.pos && splice.removed === other.removed && splice.inserted === other.inserted;
      }) || parts.some((part, index) => index && part.transaction.baseRevision !== parts[index - 1].transaction.revision)) continue;
      sources.set(id, parts.map(part => part.transaction.id));
      boundary(row.baseRevision, parts[0].transaction.baseRevision);
      boundary(row.revision, parts.at(-1).transaction.revision);
    }
    boundary(remote[0].baseRevision, local.head.revision);
    let root = local.head.root, revision = local.head.revision;
    for (const row of remote) {
      boundary(row.baseRevision, revision);
      const turnId = {};
      if (row.turnId) {
        if (typeof row.turnId !== 'string' || !row.turnId || row.turnId.length > 160) throw new Error('Invalid remote turn identity');
        turnId.turnId = row.turnId;
      }
      if (row.turnLabel !== undefined) {
        if (typeof row.turnLabel !== 'string' || !row.turnLabel || row.turnLabel.length > 240 ||
            !row.turnLabel.isWellFormed() || /[\u0000-\u001f\u007f]/.test(row.turnLabel))
          throw new Error('Invalid remote turn label');
        turnId.turnLabel = row.turnLabel;
      }
      const originIds = row.sourceTransactionIds ?? (row.sourceTransactionId ? [row.sourceTransactionId] : []);
      if (!Array.isArray(originIds) || originIds.length > incoming.size || new Set(originIds).size !== originIds.length ||
          originIds.some(id => !identity(id) || !sources.has(id)) ||
          (row.sourceTransactionId && (!identity(row.sourceTransactionId) || !originIds.includes(row.sourceTransactionId))))
        throw new Error('Remote Undo history is incomplete');
      const sourceTransactionIds = originIds.flatMap(id => sources.get(id));
      const single = row.sourceTransactionId && sources.get(row.sourceTransactionId);
      const sourceTransactionId = single?.length === 1 ? single[0] : null;
      if (!row.author?.id || row.author.kind !== row.actor) throw new Error('Canonical remote author identity is required');
      const actor = {...row.author};
      if (row.splices.length > 64) throw new Error('Remote act exceeds the canonical splice limit');
      const parts = [];
      {
        const splices = row.splices;
        const beforeHash = root, baseRevision = revision++;
        for (const splice of splices) root = RapierLedger.rootAfter(root, splice);
        const id = row.id;
        if (records.some(record => record.transaction.id === id)) throw new Error('Remote act identity is repeated');
        parts.push(id);
        records.push({beforeHash, afterHash: root, splices,
          ...(row.authored ? {authored: structuredClone(row.authored)} : {}),
          ...(row.metadata ? {metadata: structuredClone(row.metadata)} : {}),
          ...(typeof row.label === 'string' ? {changeSet: {label: row.label}} : {}), transaction: {
          id, remoteTransactionId: row.id,
          documentAuthority: local.documentAuthority, baseRevision, revision, actor, transport: 'platform',
          operation: row.operation || 'document.remote_edit', requestId: null, sourceTransactionId, ...turnId,
          ...(sourceTransactionIds.length ? {sourceTransactionIds: sourceTransactionIds.slice()} : {}),
          parent: records.at(-1)?.transaction.id ?? null, reverts: row.reverts || null, reapplies: row.reapplies || null,
          createdAt: row.createdAt ?? null, affectedBlockIds: Array.isArray(row.affectedBlockIds) ? row.affectedBlockIds.slice() : [],
          ...(typeof row.label === 'string' ? {label: row.label} : {}),
        }});
        if (mapped) mapped(row, id);
      }
      if (parts.length) sources.set(row.id, parts);
      boundary(row.revision, revision);
    }
    return RapierLedger.exportLedger({text: value.text, metadata: {filename: value.filename, docKind: value.docKind}, records, documentAuthority: local.documentAuthority,
      root, revision, complete: value.historyComplete !== false && (before && (!replaceHistory || value.historyComplete !== true)
        ? captured.complete : remote[0].baseRevision === 0)});
  }

  function projectRemoteDrawing(envelope, options) {
    const transactionId = options.remoteTransactionId || options.transactionId;
    if (typeof _rapierDrawAgentPatch !== 'function') return {status: 'unavailable', transactionId};
    try { return _rapierDrawAgentPatch(envelope.patch, {...envelope, ...options}); }
    catch (_) { return {status: 'uncertain', transactionId, reason: 'drawing_projection_failed'}; }
  }

  function remoteDrawingPlan(journal) {
    const drawing = drawingContext();
    const occurrence = drawing?.occurrence;
    if (!drawing?.open || !occurrence) return {fence: null, entries: new Set()};
    let ranges = typeof _rapierDrawHeldRanges === 'function' ? _rapierDrawHeldRanges() : null;
    let position = occurrence.position ?? occurrence.start, asset = occurrence.reference || occurrence.asset;
    let first = null;
    const entries = new Set(), normalize = globalThis.RapierImageAssets.normalizeLabel;
    for (const row of journal) {
      const patch = row.drawingPatch;
      if (patch && patch.occurrence.start === position && normalize(patch.asset) === normalize(asset)) {
        if (!first) {
          if (typeof _rapierDrawCanQueuePatch !== 'function' || !_rapierDrawCanQueuePatch(patch))
            return {reason: 'draw_session_open'};
          first = patch;
        }
        entries.add(row);
        asset = patch.reference;
        ranges = ranges?.map(range => RapierLedger.transportTouchedInterval(range.start, range.end, row.splices));
      } else {
        ranges = ranges && typeof _rapierDrawMoveRanges === 'function' ? _rapierDrawMoveRanges(ranges, row.splices) : null;
        if (!ranges) return {reason: 'draw_session_open'};
      }
      position = movedPoint(position, row.splices, true);
    }
    return {fence: first ? {operation: 'document.draw', drawingAsset: first.asset, shapesOnly: true, drawingPatch: first} : null,
      entries, committedReference: asset, committedPosition: position};
  }

  let credited = null;
  function remoteAgentActs(value) {
    if (!Array.isArray(value.journal) || !Number.isSafeInteger(value.revision)) return [];
    if (credited?.documentId !== value.documentId) { credited = {documentId: value.documentId, revision: value.revision}; return []; }
    const from = credited.revision;
    credited.revision = Math.max(from, value.revision);
    return value.journal.filter(row => row?.revision > from && row.actor === 'agent').flatMap(row => {
      const entry = rapier.undo.ledger.findLast(item => item.transaction?.remoteTransactionId === row.id || item.transaction?.id === row.id);
      return entry ? [{id: entry.transaction.id, name: row.agent || row.hostAgent || entry.transaction.actor?.name || doorName, label: row.label}] : [];
    });
  }

  async function replaceDocument(value, expected = {}) {
    await ready;
    if (composing() || _rapierMutationBarrierActive() || Date.now() - lastInputAt < 900 ||
        globalThis.RapierImageFlow?.status().moving === true) return fail('human_edit_in_progress', 'yielded');
    const before = await snapshot();
    if (typeof value?.text !== 'string' || typeof value.documentId !== 'string') return fail('snapshot_invalid', 'invalid');
    if (expected.expectedDocumentId !== before.documentId || expected.expectedRevision !== before.revision ||
        expected.expectedText !== before.text || expected.expectedMetadata && !_rapierSameDocumentMetadata(expected.expectedMetadata, _rapierDocumentMetadata())) return fail('document_changed', 'conflict');
    if (composing() || _rapierMutationBarrierActive() || Date.now() - lastInputAt < 900 ||
        globalThis.RapierImageFlow?.status().moving === true) return fail('human_edit_in_progress', 'yielded');
    const admitted = _rapierAdmitAgentText(value.filename, value.text);
    if (admitted) return fail(admitted, 'invalid');
    replacing = true;
    let landed = null;
    const drawingReceipts = [];
    let sourceApplied = false;
    try {
      if (value.documentId !== before.documentId) {
        const stamp = _rapierMutationStamp();
        let carriedLedger;
        try { carriedLedger = remoteLedger(value, null); }
        catch (_) { return fail('snapshot_history_invalid', 'invalid'); }
        const loaded = await rapierLoad(value.text, value.filename, {documentAuthority: value.documentId,
          documentKind: value.docKind, expectedMutationStamp: stamp, returnReceipt: true, appsSnapshot: true, carriedLedger,
          restore: globalThis.RAPIER_WORKSPACE === true});
        if (!loaded) return fail('document_changed', 'conflict');
        sourceApplied = true;
      } else if (value.text !== before.text || value.filename !== before.filename || value.docKind !== before.docKind ||
          typeof value.historyComplete === 'boolean' && value.historyComplete !== before.historyComplete ||
          value.journal && (value.revision !== before.revision || value.journal.length !== before.journal?.length ||
            value.journal.some((row, index) => (before.journal?.[index]?.remoteTransactionId || before.journal?.[index]?.id) !== row.id ||
              globalThis.RapierKernel.canonicalJson(row.authored ?? null) !== globalThis.RapierKernel.canonicalJson(before.journal?.[index]?.authored ?? null)))) {
        const row = _rapierPrefixSuffixDiff(before.text, value.text);
        let carriedLedger, journal, plan;
        const mapped = new Map();
        try {
          journal = remoteJournal(value, before);
          let source = before.text;
          const expanded = [];
          for (const entry of journal || []) {
            const after = RapierLedger._rapierTransformSplices(source, entry.splices);
            let drawingPatch;
            if (entry.drawingPatch) {
              drawingPatch = globalThis.RapierKernel.expandDrawingPatch(entry.drawingPatch, source, after);
              if (!drawingPatch || !globalThis.RapierKernel.verifyDrawingPatch(drawingPatch, source, after))
                return fail('snapshot_drawing_invalid', 'invalid');
            }
            expanded.push(drawingPatch ? {...entry, drawingPatch} : entry);
            source = after;
          }
          if (journal) journal = expanded;
          plan = journal ? remoteDrawingPlan(journal) : {fence: null, entries: new Set()};
          if (plan.reason) return fail(plan.reason, 'yielded');
          carriedLedger = remoteLedger(value, before, (entry, id) => mapped.set(entry.id, id));
          if ((Array.isArray(value.journal) || typeof value.historyComplete === 'boolean') && !carriedLedger)
            return fail('snapshot_history_unavailable', 'conflict');
        }
        catch (_) { return fail('snapshot_history_invalid', 'invalid'); }
        const tip = rapier.undo.ledger.at(-1)?.transaction?.id;
        const committed = await commit({documentId: before.documentId, baseRevision: before.revision,
          beforeText: before.text, text: value.text, splices: row.removed || row.inserted ? [row] : [], actor: 'system', principal: 'mcp', author: {kind: 'system', id: 'mcp-projection'},
          beforeMetadata: {filename: before.filename, docKind: before.docKind},
          metadata: RapierLedger._rapierMetadataDelta({filename: before.filename, docKind: before.docKind},
            {filename: value.filename, docKind: value.docKind}),
          transport: 'platform', operation: 'document.remote_edit', label: 'Remote edit', carriedLedger, fence: plan.fence});
        if (!committed.ok) return committed;
        for (const entry of journal || []) if (entry.drawingPatch) {
          drawingReceipts.push(projectRemoteDrawing(entry.drawingPatch, {
            transactionId: mapped.get(entry.id) || committed.transactionId, remoteTransactionId: entry.id,
            name: entry.hostAgent || doorName,
            ...(plan.entries.has(entry) ? {committedReference: plan.committedReference, committedPosition: plan.committedPosition} : {}),
          }));
        }
        const rows = rapier.undo.ledger;
        landed = rows.slice(rows.findLastIndex(entry => entry.transaction?.id === tip) + 1)
          .findLast(entry => entry.transaction?.actor?.kind === 'agent')?.transaction || null;
        sourceApplied = true;
      }
      const exact = _rapierSourceText() === value.text && String(rapier.identity.authority) === value.documentId &&
        rapier.document.filename === value.filename && rapier.document.docKind === value.docKind;
      if (exact) {
        comparisonBaseRecord = value.comparisonBase ? {authority: value.documentId, base: globalThis.RapierLedgerCarried.readBase(value.comparisonBase)} : null;
        if (apps) host.presence(value.collaboration?.agentPresence || {active: false, inFlight: 0, pointers: []});
      }
      const comparison = !exact ? {...fail('document_changed'), visible: false} : await syncComparison(value);
      await refresh();
      if (exact) {
        const fresh = remoteAgentActs(value);
        if (landed && !fresh.some(row => row.id === landed.id)) fresh.push({id: landed.id, name: landed.actor.name || doorName});
        for (const row of fresh.slice(0, -1)) { _rapierAgentNamed(row.name); _rapierAgentBarActed(row.id, row.label); }
        if (fresh.length) try { agentCaret(fresh.at(-1).id, fresh.at(-1).name, undefined, undefined, fresh.at(-1).label); } catch (_) {}
      }
      return {ok: true, outcome: 'applied', comparison, snapshot: await snapshot(), ...(drawingReceipts.length ? {drawingReceipts} : {})};
    } catch (error) {
      if (sourceApplied) return {...fail('snapshot_apply_failed', 'conflict'), sourceApplied};
      throw error;
    } finally { replacing = false; }
  }

  async function acknowledge(value) {
    const captured = {stamp: _rapierMutationStamp(), sourceRootId: rapier.document.source.rootId,
      sourceContentId: rapier.document.source.contentId,
      metadata: {filename: String(rapier.document.filename), docKind: String(rapier.document.docKind)}};
    const local = await snapshot();
    if (!_rapierMutationStampIsCurrent(captured.stamp) ||
        local.documentId !== value.documentId || local.text !== value.text ||
        local.filename !== value.filename || local.docKind !== value.docKind ||
        local.documentId !== String(rapier.identity.authority) ||
        local.generation !== Number(rapier.revision.generation) ||
        local.revision !== Number(rapier.revision.settled)) return fail('document_changed', 'conflict');
    _rapierDirtyMarkOwner.acknowledge(local.generation, captured.sourceRootId, captured.metadata, captured.sourceContentId);
    rapier.identity.saveAsRequired = false;
    _notifyDirtyState(); updateFilenameDisplay();
    return {ok: true, localRevision: local.revision};
  }

  async function readFile(file, name = file?.name || 'Imported.md') {
    if (_rapierImportKind(name, file?.type)) return _rapierReadImportedDocument(file, name);
    const text = await RapierTextCodec.readDocumentBlob(file);
    const shared = await _rapierReadSharedDocument(text, name);
    const source = shared?.source ?? text, filename = String(shared?.filename ?? name);
    const reason = _rapierAdmitAgentText(filename, source);
    if (reason) throw Object.assign(new Error(reason), {code: reason});
    return {text: source, filename, ...(shared ? {docKind: shared.kind} : {admittedBytes: Number(file.size)})};
  }

  function notify(message, kind = 'info') {
    showToast(String(message || '').slice(0, 320), ['info', 'error', 'success'].includes(kind) ? kind : 'info');
  }

  function nameAtDoor(given, door = 'platform') {
    if (doorNames.has(door)) return doorNames.get(door);
    if (typeof given !== 'string' || !given.trim()) return '';
    try { RapierLedger.agentActorId(door, {name: given}); } catch (_) { return ''; }
    doorNames.set(door, given);
    if (!doorName) doorName = given;
    return given;
  }

  let remoteCall = '';
  function noteRemoteCall(report) {
    if (!report || typeof report.id !== 'string' || !report.id || report.id === remoteCall || typeof report.operation !== 'string' || !(report.ago >= 0)) return;
    remoteCall = report.id;
    const name = typeof report.name === 'string' ? report.name.trim().slice(0, 24) : '';
    if (report.ago >= _RAPIER_AGENT_CONNECTED_MS) return;
    if (report.ago < _RAPIER_ACORN_LINGER_MS) {
      void _rapierAgentInvocationTracked(report.operation, typeof report.kind === 'string' ? {kind: report.kind} : {}, () => new Promise(done => setTimeout(done, 1600)), report.id, name);
      return;
    }
    _rapierAgentNamed(name);
    _rapierAgentBarMarkConnected({documentAuthority: String(rapier.identity.authority || ''), documentEpoch: Number(rapier.identity.epoch || 0)});
    _rapierAgentBar.connectedUntil -= report.ago;
    _rapierAgentBarRender();
  }

  let sheetSequence = 0;
  function houseSheet({title, words = '', body = [], onEscape = null, onClose = null}) {
    const overlay = document.createElement('div'), panel = document.createElement('div'), inner = document.createElement('div');
    const titleRow = document.createElement('div'), heading = document.createElement('h2'), rows = [];
    overlay.className = 'settings-overlay restore-modal-overlay';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
    panel.className = 'settings-panel rapier-pop'; panel.style.cssText = 'max-width:420px;margin:auto';
    inner.className = 'settings-panel__body';
    titleRow.className = 'navigator-title-row'; heading.className = 'settings-section__title';
    heading.id = 'rapier-sheet-title-' + (++sheetSequence); heading.textContent = title;
    overlay.setAttribute('aria-labelledby', heading.id);
    titleRow.append(heading); inner.append(titleRow);
    if (words) {
      const p = document.createElement('p'); p.style.cssText = 'margin:0 0 var(--space-4);line-height:1.5'; p.textContent = words; inner.append(p);
    }
    for (const item of body) {
      if (!Array.isArray(item)) { inner.append(item); continue; }
      const row = document.createElement('div'); row.className = 'settings-action-row'; row.setAttribute('data-pop-row', '');
      for (const box of item) { box.classList.add('settings-action-btn'); if (!box.dataset.pop) box.dataset.pop = 'affirm'; row.append(box); }
      inner.append(row); rows.push(row);
    }
    if (rows.length) _rapierPopArrange(rows[rows.length - 1]);
    panel.append(inner); overlay.append(panel); document.body.append(overlay);
    let open = true;
    const sheet = {overlay, get open() { return open; }, close() {
      if (!open) return false;
      open = false;
      closeDialog(overlay); overlay.remove();
      try { onClose?.(); } catch (_) {}
      return true;
    }};
    openDialog(overlay, {panel: '.settings-panel', onEscape: onEscape ? () => onEscape(sheet) : null});
    return sheet;
  }

  globalThis.RapierAgentBrowser = Object.freeze({ready, snapshot, invoke, refresh, status, undoDrawingChange, undoHistoryAct,
    remoteLedger, livePlace: Object.freeze({capture: capturePlace, restore: restorePlace, viewport: restoreViewport, pointer: livePointer}),
    prepareSave: () => _rapierDocumentFonts.prepare(),
    isSavePrepared: text => _rapierDocumentFonts.isPrepared(text),
    sheet: houseSheet,
    presence: host.presence,
    trackInvocation: (operation, input, run, invocationId) => _rapierAgentInvocationTracked(operation, input, run, invocationId,
      typeof input?.agent === 'string' ? input.agent.trim() : ''),
    pointState: () => caret.point ? {...caret.point} : null,
    clearPoint: (id, reason = 'view_changed') => { if (!id || caret.point?.id === id) caretPut(reason); },
    nameAtDoor, noteRemoteCall, doorName: () => doorName, presentCarriedComparison, comparisonExport,
    replaceDocument, acknowledge, humanContext, contextChanged, inspectVisual, exportDocument, prepareMaterial,
    resolveEditorRequest, cancelEditorRequest, editorContext, presentDrawing, closeAgentDrawingTurn, drawingNavigationChanged,
    applyView, readFile, notify, agentRecoveryState,
    acceptImport: _rapierAcceptDocumentImport,
    importCurrent: result => !result.importStamp || _rapierMutationStampIsCurrent(result.importStamp),
    reconcile: (value, ctx) => kernel.reconcile(value, ctx),
    subscribeContext: notify => { if (globalThis.RapierPlatform?.host?.lockedNotes === true) throw Object.assign(new Error('Locked notes stay on this phone'), {code: 'notes_locked'}); contextSubscribers.add(notify); return () => contextSubscribers.delete(notify); },
    subscribe: notify => { if (globalThis.RapierPlatform?.host?.lockedNotes === true) throw Object.assign(new Error('Locked notes stay on this phone'), {code: 'notes_locked'}); subscribers.add(notify); return () => subscribers.delete(notify); }});
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionend']) {
    document.addEventListener(type, humanActivity, {capture: true, passive: true});
  }
  document.addEventListener('visibilitychange', () => {
    if (!visible()) { retainedPointer = null; viewFlight?.abort(); visualFlight?.abort(); materialFlight?.abort(); if (editorCard) cancelEditorRequest(editorCard.request.id); }
    contextChanged('visibility');
  });
  window.addEventListener('blur', () => { contextChanged('blur'); });
  window.addEventListener('focus', () => { contextChanged('focus'); });
  window.addEventListener('popstate', drawingNavigationChanged);
  window.addEventListener('pagehide', () => { retireView(); visualFlight?.abort(); materialFlight?.abort(); if (editorCard) cancelEditorRequest(editorCard.request.id); retire(); });
  window.addEventListener('pageshow', () => { void refresh(); });
  queueMicrotask(() => { void refresh(); });
})();
