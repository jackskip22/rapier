(() => {
  const {createKernel, createState, measurementsRequired, receiptStructureEligible, receiptStructureFact, exportFilename, exportFidelity} = globalThis.RapierKernel;
  const {resolveCaller} = globalThis.RapierDoorIdentity;
  const {TOOLS, PAGE_TOOLS, MAX_EXPORT_BYTES, getTool, annotations, validateInput} = globalThis.RapierAgentCatalog;
  const editorProtocol = globalThis.RapierAgentEditor;
  const {guideResult} = globalThis.RapierAgentGuide;
  // The decision core takes no clock or randomness of its own; this door supplies the real ones,
  // same as mcp/worker.mjs does for the hosted door.
  const kernelClock = () => Date.now();
  const kernelMintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
  // This door's one identity axis beyond a single wire message: a boot-scoped session id, never
  // read from the wire, folded into every derived invocationKey. Stable for the page's lifetime; a
  // reload is a fresh session by construction, so a retry from before the reload cannot collide
  // with anything minted after it.
  const doorSession = kernelMintId('session_');
  // The name a door gave at its own handshake, once, for this page session (nameAtDoor below).
  let doorName = '';
  const transactionPrincipals = new Map(), doorNames = new Map();
  const subscribers = new Set();
  const contextSubscribers = new Set();
  const ownedNotesEndpoints = new Set();
  const registrations = new Map();
  const failures = new Map();
  const reviews = new Map();
  // A commit that carries a review's reviewToken is attributed to the review's own original
  // proposer (kernel.mjs `reviewDecision`'s `participant(review, mintId)`), not to the human
  // deciding it -- so the token this door mints for a decision must pin `principal`/`requestId` to
  // that same original identity or commit()'s own reviewToken check refuses it `review_lapsed`.
  // presentKernelReview (stageReview's one unconditional call for every proposal, whether or not
  // the modal ever opens) is the one place that identity is ever handed to this door; it is learned
  // there once and read back here by decideKernelReview, so the inline surface's own apply/drop
  // never needs a second way to learn it.
  const reviewIdentities = new Map();
  // The still-pending change ids a decision names while `decideKernelReview` is in flight -- from
  // the moment KEEP/DROP/ALLOW/type-over is tapped until the kernel's own commit resolves. The
  // inline read surface's own span-refresh (engine.js `_rapierReviewSpansRefresh`) reads this to
  // leave those changes undrawn for that one span, rather than decorating a change that is moments
  // from being applied or dropped -- closing the window where a `refresh()` fired ahead of the
  // commit (the law lens's own close-on-decide, before the kernel has actually committed) would
  // otherwise mutate the read surface for a change whose outcome is already settled in the
  // person's hand, which can race a picture-deleting change's own asset retirement into a spurious
  // image error (review-peek-picture).
  const decidingChanges = new Set();
  const apps = globalThis.RAPIER_APPS_HOST === true;
  const idleSignal = new AbortController().signal;
  let kernel, previous, refreshing, registrationOwner, registrationExposure = '';
  let readyResolve, readyReject, readyDone = false, replacing = false, refreshAgain = false;
  let comparisonOwner = null, comparisonKernelId = null, comparisonGeneration = -1, remoteComparison = null;
  let contextSequence = 0, humanSequence = 0, contextQueued = false, contextTimer = 0, lastInputAt = 0, lastPointerAt = 0;
  let retainedPointer = null, policyAvailable = false, remoteReview = null, projecting = 0, viewFlight = null;
  let visualFlight = null;
  let pendingView = null, viewTimer = 0;
  const editorRequests = new Map(), preferenceVersions = new Map(), agentPreferenceWrites = new Set();
  let editorCard = null;
  let embedReviewSignature = '';
  let reviewPersistenceSignature = '';
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  const fail = (reason, outcome = 'refused') => ({ok: false, outcome, reason});
  const abort = request => request.signal?.throwIfAborted();
  const context = (request, operation) => ({
    actor: {kind: request.actor || 'agent', id: (request.actor || 'agent') === 'agent'
      ? RapierLedger.agentActorId(request.principal || 'webmcp', request.hostAgent ? {name: request.hostAgent} : null)
      : request.principal || 'local'},
    transport: request.transport === 'webmcp' ? 'webmcp' : 'platform',
    operation, requestId: request.requestId || crypto.randomUUID(),
    ...(request.contribution ? {contribution: request.contribution} : {}),
    ...(Number.isSafeInteger(request.contributionBaseRevision) ? {contributionBaseRevision: request.contributionBaseRevision} : {}),
    ...(request.sourceTransactionIds ? {sourceTransactionIds: request.sourceTransactionIds.slice()} : {}),
  });
  const scope = request => ({kind: request.actor || 'agent', id: request.principal || 'webmcp',
    transport: request.transport === 'webmcp' ? 'webmcp' : 'platform'});
  const caller = request => _rapierDoorStamp({actor: {kind: request.actor || 'agent', id: request.principal || 'webmcp'},
    signal: request.signal || idleSignal, invocation: {id: request.requestId || crypto.randomUUID()}},
    request.transport === 'webmcp' ? 'webmcp' : 'platform');
  const ownsComparison = owner => comparisonOwner === owner && _rapierCompareRuntime.agentOpened &&
    comparisonGeneration === _rapierCompareRuntime.jobId;
  const nativeComparisonId = () => String(rapier.identity.authority) + ':native:' + _rapierCompareRuntime.jobId;
  const reviewSignature = review => JSON.stringify(review && {id: review.id, kind: review.kind, status: review.status,
    revision: review.revision, contribution: review.contribution, changes: review.changes, splices: review.splices});

  function externalComparison() {
    const compare = rapier.compare;
    return !apps && compare?.active && !_rapierCompareRuntime.agentOpened && !_rapierCompareRuntime.lawReview
      ? {id: nativeComparisonId(), baseline: compare.currentText, incoming: compare.incomingText, name: compare.incomingName}
      : null;
  }

  function admission() {
    if (_rapierBootstrapRuntime.failed) return 'bootstrap_failed';
    if (_rapierEmbed.active && !_rapierEmbed.capabilities?.includes('agent')) return 'embed_agent_not_granted';
    if (!_rapierBootstrapRuntime.complete) return 'document_not_ready';
    if (_rapierEmbed.framed && !_rapierEmbed.local &&
        !(_rapierEmbed.active && _rapierEmbed.connected && _rapierEmbed.loaded)) return 'host_not_connected';
    return '';
  }

  const visible = () => document.visibilityState !== 'hidden';
  const composing = () => !!(rapier.composition.source || rapier.composition.block);
  // A successful external-document checkpoint has already committed the live drafts. A dirty
  // block still needs its reading projection rebuilt, and an idle label field may remain open;
  // neither is a human editing lease after that checkpoint. Fresh input and barriers still win.
  const editing = (settled = false) => composing() || _rapierMutationBarrierActive() ||
    (!settled && (globalThis.RapierFlowchartEditor?.editing() === true || rapier.document.blocks.some(block => block.dirty))) ||
    Date.now() - lastInputAt < 900 ||
    globalThis.RapierImageFlow?.status().moving === true;
  const pointerCurrent = () => retainedPointer && retainedPointer.documentId === String(rapier.identity.authority) &&
    retainedPointer.revision === Number(rapier.revision.settled) &&
    retainedPointer.generation === Number(rapier.revision.generation);

  function livePointer() {
    if (typeof _rapierDrawState === 'object' && _rapierDrawState.open) {
      const selected = _rapierAskChatSelectionText();
      const range = selected?.objectId ? {...selected.selection, objectId: selected.objectId, active: false} : null;
      return {selection: range, focus: range};
    }
    const ta = document.getElementById('source-textarea');
    if (ta && document.activeElement === ta &&
        (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source')) {
      const start = _rapierAbsPos(ta.selectionStart), end = _rapierAbsPos(ta.selectionEnd);
      const active = editing();
      return {selection: {start, end, active}, focus: {start, end, active}};
    }
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return {selection: null, focus: null};
    // The object under the finger: a picture or drawing the person has selected is the focus,
    // whole, before any text range -- the agent's "this" is what the person is holding, and the
    // kernel names its kind from the source it points at.
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
    // A keystroke needs its two endpoints, not a span object and Map row for every
    // block. The source owner walks the prefix and stops once both are known.
    const spans = _rapierExcerptCanonicalBlockSpans([a.id, b.id]);
    const sa = a && spans.get(a.id), sb = b && spans.get(b.id);
    if (!sa || !sb) return {selection: null, focus: null};
    const start = _rapierRenderedBoundaryToCanonical(first, a, range.startContainer, range.startOffset, sa);
    const end = _rapierRenderedBoundaryToCanonical(last, b, range.endContainer, range.endOffset, sb);
    const exact = Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start;
    const ownsFocus = document.getElementById('editor-blocks')?.contains(document.activeElement);
    return {
      selection: exact ? {start, end, active: editing()} : null,
      focus: ownsFocus ? {start: sa.start, end: sb.end,
        active: editing() || !exact} : null,
    };
  }

  function rememberPointer() {
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
    });
  }

  function humanActivity(event) {
    if (event.isTrusted !== true || projecting) return;
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
      lastInputAt = Date.now();
      clearTimeout(contextTimer);
      contextTimer = setTimeout(() => { rememberPointer(); contextChanged('settled'); }, 950);
    }
    queueMicrotask(() => { rememberPointer(); contextChanged(event.type); });
  }

  function drawingContext() {
    return typeof _rapierDrawContext === 'function' ? _rapierDrawContext() : null;
  }

  async function humanContext() {
    const basic = {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled),
      generation: Number(rapier.revision.generation)};
    if (!readyDone || admission() || _rapierMutationBarrierActive()) {
      return {...fail('document_not_settled', 'yielded'), ...basic,
        context: {sequence: contextSequence, visible: visible(), editing: visible() && editing(), view: viewMode(), selection: null, focus: null}};
    }
    const drawing = drawingContext();
    if (drawing?.open) {
      // Draw owns its settled recipe and the gesture still in progress. Observing either
      // never checkpoints the document or completes the person's current stroke or label.
      const value = documentState();
      const focus = drawing.occurrence && Number.isSafeInteger(drawing.occurrence.start) && Number.isSafeInteger(drawing.occurrence.end)
        ? {start: drawing.occurrence.start, end: drawing.occurrence.end, active: false} : null;
      return {ok: true, ...value, context: {sequence: contextSequence, visible: visible(), editing: false, view: viewMode(),
        selection: null, focus, drawing, posture: value.posture, readOnly: value.readOnly}};
    }
    // Read the kept source and its live focus without checkpointing a draft or composition.
    // The hosted adapter maps this range to its acknowledged source before publishing it.
    const busy = () => ({...fail('document_not_settled', 'yielded'), ...documentState(),
      context: {...editorFocus(), sequence: contextSequence, visible: visible(), editing: visible() && editing(), view: viewMode()}});
    if (composing() || Date.now() - lastInputAt < 900) return busy();
    const captured = await _rapierWithSettledExternalDocument(documentState, {quiet: true});
    if (!captured.settled) return busy();
    const value = captured.value;
    if (Date.now() - lastPointerAt < 1500) rememberPointer();
    const pointer = visible() && pointerCurrent() ? {selection: retainedPointer.selection, focus: retainedPointer.focus}
      : {selection: null, focus: null};
    return {ok: true, documentId: value.documentId, revision: value.revision, generation: value.generation,
      filename: value.filename, docKind: value.docKind, text: value.text,
      context: {...pointer, sequence: contextSequence, visible: visible(), editing: visible() && editing(true), view: viewMode(),
        posture: value.posture, readOnly: value.readOnly,
        ...(value.reviewedRevision == null ? {} : {reviewedRevision: value.reviewedRevision})}};
  }

  function setPolicy(policy, event) {
    if (!apps || event?.isTrusted !== true) return fail('trusted_human_required');
    if (!policyAvailable) return fail('policy_not_ready');
    if (!policy || Object.keys(policy).some(key => !['posture', 'readOnly'].includes(key)) ||
        (!Object.hasOwn(policy, 'posture') && !Object.hasOwn(policy, 'readOnly')) ||
        (Object.hasOwn(policy, 'posture') && !['free', 'check', 'ask'].includes(policy.posture)) ||
        (Object.hasOwn(policy, 'readOnly') && typeof policy.readOnly !== 'boolean')) return fail('policy_invalid', 'invalid');
    const value = {sequence: ++contextSequence, visible: visible(), editing: editing(), trusted: true, policy: {...policy}};
    for (const notify of contextSubscribers) { try { notify(value); } catch (_) {} }
    return {ok: true, pending: true};
  }

  function projectPolicy(value) {
    const policy = value.collaboration;
    if (!apps || !policy || !['free', 'check', 'ask'].includes(policy.posture) || typeof policy.readOnly !== 'boolean') return;
    policyAvailable = true;
    if (_rapierPosture() !== policy.posture) _rapierPostureSet(policy.posture);
    if (rapier.access.readOnly !== policy.readOnly) rapierSetReadOnly(policy.readOnly);
    _rapierPostureRender();
  }

  // Notes' cards over the document: the fact goes into the agent's context. An edit (a fact with
  // splices) reaches the document behind the cards as it would a hidden page, except while Notes is
  // swapping or certifying that document (`busy`: a note opening, the way back, a rename), where a
  // landed edit would make the person's own tap refuse. An open, a save, a comparison or a picture
  // of the page does not reach it at all. The visual `inert` fence is not an authority fence; this is.
  // Read from the owner's standing (notes.js publishes it beside the diagnostic facts getter, whose
  // deep copy of the index this fence must never cost a checkpoint); undefined without Notes on the
  // page.
  const notesFact = () => { const f = globalThis.rapierNotesStanding; return f && typeof f === 'object' ? {open: !!f.open, current: f.current || null, busy: !!f.busy} : null; };
  const notesFence = fact => { const f = notesFact(); return f && f.open && !(Array.isArray(fact?.splices) && !f.busy) ? 'notes_library_open' : ''; };
  // Draw's session (body.rapier-draw-open is the public fact): the person is painting, not looking
  // at the markdown. The canvas is not an authority fence; this is, and it fences only what Draw
  // holds (draw/draw.js _rapierDrawHeldRanges: the open picture's block, or the place a new drawing
  // lands). An edit that touches none of it lands while the person draws, and Draw's place moves with
  // it (commit, below). Anything without splices -- an open, a save, a comparison -- is refused.
  // The very picture the person has open is Draw's own question (draw/draw.js _rapierDrawFence), one gate for the commit and for the landing:
  // a verified change for the exact occurrence lands now, or waits behind the person's hand and lands when it lifts; a paint layer that is no
  // longer the one the agent painted into is refused; a caption, which the canvas cannot take, keeps the ordinary fence. Every other edit
  // must leave the ranges Draw holds intact, so Done cannot overwrite work hidden behind the canvas.
  const drawFence = fact => {
    if (typeof document === 'undefined' || !document.body?.classList?.contains('rapier-draw-open')) return '';
    const open = typeof _rapierDrawEditingAsset === 'function' ? _rapierDrawEditingAsset({allowBusy: true}) : '';
    // A picture is known by its reference label, which Markdown reads without regard to case: the occurrence an agent's draw wrote
    // and the definition the page rendered (what Draw holds) name the one picture in two spellings, so the two are compared as ids.
    const id = label => { const assets = globalThis.RapierImageAssets; return assets && typeof assets.normalizeLabel === 'function' ? assets.normalizeLabel(String(label)) : String(label); };
    if (open && fact?.drawingAsset && id(fact.drawingAsset) === id(open)) {
      return typeof _rapierDrawFence === 'function' ? _rapierDrawFence(fact) : 'draw_session_open';
    }
    const held = Array.isArray(fact?.splices) && typeof _rapierDrawHeldRanges === 'function' ? _rapierDrawHeldRanges() : null;
    // The document profile has no Draw: the fence then refuses as it always has.
    return held && typeof _rapierDrawMoveRanges === 'function' && _rapierDrawMoveRanges(held, fact.splices) ? '' : 'draw_session_open';
  };
  const hostFence = fact => notesFence(fact) || drawFence(fact);
  // Draw or the cards stand over the editor: the person's place is theirs, not the editor's.
  const covered = () => typeof document !== 'undefined' && (!!document.body?.classList?.contains('rapier-draw-open') || !!notesFact()?.open);
  let carriedRecovery = null;
  // The original a portable proposal was written over, for one document authority only. The adapter holds it, not
  // the engine's sealed document record: every read checks its authority, so a record for another document is never used.
  let proposalBaseRecord = null;
  function proposalRecord() {
    const record = proposalBaseRecord;
    return record?.authority === String(rapier.identity.authority) ? record : null;
  }
  // Share preserves still-undecided changes, rather than silently exporting only the held baseline.
  function proposalExport() {
    const record = proposalRecord();
    if (!record) return null;
    const source = _rapierSourceText();
    let text = source;
    const state = kernel?.snapshot();
    if (!apps && state?.documentId === String(rapier.identity.authority) && state.text === source && state.revision === Number(rapier.revision.settled) && state.review?.kind === 'proposal' && state.review.status === 'pending') {
      const preview = kernel.previewReview({reviewId: state.review.id});
      if (typeof preview.text === 'string') text = preview.text;
    } else if (apps && record.text === source) {
      const image = reviewImage(record.review, source);
      if (image) text = image.incoming;
    }
    return {text, base: record.base};
  }
  async function stageCarriedProposal(request) {
    const base = globalThis.RapierLedgerCarried.readBase(request.base);
    const value = current();
    if (value.text !== RapierTextCodec.normalizeDocument(base.text)) return fail('proposal_base_mismatch', 'conflict');
    const staged = createKernel({state: createState({documentId: value.documentId, filename: value.filename, docKind: value.docKind, text: value.text, revision: value.revision}),
      host: {}, clock: kernelClock, mintId: kernelMintId});
    const result = await staged.stageProposal({base, text: request.text}, {actor: 'agent', principal: 'carried-proposal', transport: 'platform'});
    if (result.reason !== 'human_review_required') return result;
    if (value.documentId !== String(rapier.identity.authority) || value.text !== _rapierSourceText()) return fail('document_changed', 'conflict');
    carriedRecovery = staged.snapshot();
    proposalBaseRecord = {authority: value.documentId, base};
    // Do not await ready during boot: refresh consumes the already-staged state after boot completes.
    ready.then(() => representPendingReview()).catch(() => {});
    return result;
  }

  function documentState() {
    const notes = notesFact();
    return {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled), ...(notes ? {notes} : {}),
      proposalBase: proposalRecord()?.base || null, ledgerRoot: rapier.document.source?.rootId || null,
      generation: Number(rapier.revision.generation), filename: String(rapier.document.filename),
      docKind: String(rapier.document.docKind), text: _rapierSourceText(), readOnly: !!rapier.access.readOnly,
      posture: _rapierPosture(), ...(!rapier.review.seen?.restored && _rapierSeenUndelivered() === 0
        ? {reviewedRevision: Number(rapier.revision.settled)} : {})};
  }

  function current() {
    const journal = rapier.undo.ledger.flatMap(entry => {
      const tx = entry.transaction;
      const splices = tx && _rapierRecordSplices(entry, rapier.undo.ledger);
      return splices ? [{id: tx.id, revision: tx.revision, baseRevision: tx.baseRevision,
        actor: tx.actor.kind, principal: transactionPrincipals.get(tx.id)?.principal || (tx.actor.kind === 'agent' ? 'unverified:' + doorSession : tx.actor.id), transport: tx.transport,
        ...(transactionPrincipals.get(tx.id)?.hostAgent ? {hostAgent: transactionPrincipals.get(tx.id).hostAgent} : {}),
        operation: tx.operation, sourceTransactionId: tx.sourceTransactionId,
        ...(tx.contribution ? {contribution: tx.contribution} : {}),
        ...(Number.isSafeInteger(tx.contributionBaseRevision) ? {contributionBaseRevision: tx.contributionBaseRevision} : {}),
        ...(Array.isArray(tx.sourceTransactionIds) ? {sourceTransactionIds: tx.sourceTransactionIds.slice()} : {}),
        splices: splices.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted}))}] : [];
    });
    return {...documentState(), ...editorFocus(), drawing: drawingContext(), journal, externalComparison: externalComparison(),
      closedComparisonId: !apps && comparisonKernelId && !ownsComparison(comparisonOwner) ? comparisonKernelId : null};
  }

  async function snapshot(options = {}) {
    await ready;
    const reason = admission();
    if (reason) throw Object.assign(new Error(reason), {code: reason});
    if (options.operation === 'document.set_view' || drawingContext()?.open) return current();
    const read = await _rapierWithSettledExternalDocument(current, {quiet: true});
    if (!read.settled) throw Object.assign(new Error('document_not_settled'), {code: 'document_not_settled'});
    return read.value;
  }

  function matches(request, revision = request.revision ?? request.baseRevision) {
    return request.documentId === String(rapier.identity.authority) &&
      (revision == null || revision === Number(rapier.revision.settled)) &&
      (request.beforeText == null || request.beforeText === _rapierSourceText());
  }

  function editorFact(request, status, details = {}) {
    return {kind: 'editor', documentId: request.documentId, revision: request.revision, operation: request.operation,
      receipt: {id: request.id, status, ...(request.preference ? {preference: request.preference} : {action: request.action}), ...details}};
  }

  function editorCurrent(record) {
    const stamp = record.expected;
    return !admission() && visible() && !record.request.signal?.aborted && stamp &&
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
    return editorProtocol.editorContext({preferences: RapierPreferences.snapshot(), receipts: [...editorRequests.values()]
      .filter(record => record.localDocumentId === String(rapier.identity.authority)).map(record => record.fact?.receipt)});
  }

  // Each write has a generation, including a person's deliberate write of the same value. Undo
  // and a delayed acknowledgement can never overwrite that later choice.
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
    if (request.action === 'read_aloud' && (!_rapierEmbedFeatureAllowed('readAloud') || !_rapierSpeechEngine())) return 'read_aloud_unavailable';
    if (request.action === 'open_file' && _rapierEmbed.active) return 'host_owns_document';
    if (request.action === 'install_plugin') {
      if (request.plugin.startsWith('letters-') && !_rapierEmbedFeatureAllowed('draw')) return 'host_feature_refused';
      const provider = request.plugin === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[request.plugin];
      if (typeof provider?.install !== 'function') return 'plugin_unavailable';
    }
    return '';
  }

  async function editorAction(record) {
    const request = record.request;
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
    if (request.action === 'open_file') { await _rapierUiBeginOpenDocument(record.tap); return true; }
    if (request.action === 'install_plugin') {
      const provider = request.plugin === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[request.plugin];
      await provider.install();
      return true;
    }
    return false;
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
        if (record.fact.receipt.status === 'waiting') editorPublish(record, editorFact(request, done ? 'done' : 'unavailable',
          done ? {} : {reason: 'editor_action_failed'}));
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
      if (editorProtocol.EDITOR_EXPORT_TYPES[request.action] && prior.fact?.receipt.status === 'done' && !prior.fact.file)
        return editorFact(request, 'unavailable', {reason: 'export_expired'});
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
    // Keep at most one card, and leave any existing house dialog in the person's hands.
    if (editorProtocol.editorNeedsTap(request) && (editorCard || _rapierUi.confirmId)) return refused('editor_busy');
    editorRequests.set(request.id, record);
    while (editorRequests.size > editorProtocol.EDITOR_LIMITS.receipts) {
      const entry = [...editorRequests].find(([, row]) => row !== record && row !== editorCard);
      if (!entry) break;
      if (entry[1].url) URL.revokeObjectURL(entry[1].url);
      clearTimeout(entry[1].fileTimer); editorRequests.delete(entry[0]);
    }
    if (request.operation === 'document.set_view') {
      if (_rapierEmbed.active && ((request.preference === 'theme' && _rapierEmbed.theme) ||
          (request.preference === 'accent' && _rapierEmbed.accent))) return editorPublish(record, refused('host_owns_preference'), false);
      const previous = RapierPreferences.read(request.preference);
      agentPreferenceWrites.add(request.preference);
      try { RapierPreferences.write(request.preference, request.value); }
      finally { agentPreferenceWrites.delete(request.preference); }
      if (RapierPreferences.read(request.preference) !== request.value) return editorPublish(record, refused('preference_write_failed'), false);
      const version = preferenceVersions.get(request.preference);
      const fact = editorPublish(record, editorFact(request, 'applied', {value: request.value, previous}), false);
      showToast('view changed', 'info', {label: 'Undo', fn: () => {
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
      const artifact = await _rapierBuildEditorExport(request.action, record.expected,
        {signal: request.signal, current: () => editorCurrent(record), maxBytes: MAX_EXPORT_BYTES});
      if (!editorCurrent(record)) return editorPublish(record, refused('document_changed'), false);
      if (!(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength > MAX_EXPORT_BYTES) return editorPublish(record, refused('export_too_large'), false);
      let binary = '';
      for (let offset = 0; offset < artifact.bytes.length; offset += 32768) binary += String.fromCharCode(...artifact.bytes.subarray(offset, offset + 32768));
      const file = {name: artifact.filename, mimeType: artifact.mimeType, data: btoa(binary)};
      if (!editorProtocol.editorFile(request, file, MAX_EXPORT_BYTES)) return editorPublish(record, refused('export_invalid'), false);
      // Bytes live only at the adapter boundary, outside receipts and the invocation journal.
      // Retain one export for a bounded retry, releasing the previous page URL and payload.
      for (const prior of editorRequests.values()) if (prior.fact?.file) {
        if (prior.url) URL.revokeObjectURL(prior.url);
        clearTimeout(prior.fileTimer); prior.url = null;
        const {file: released, ...retained} = prior.fact;
        prior.fact = retained;
      }
      record.fileTimer = setTimeout(() => {
        if (record.url) URL.revokeObjectURL(record.url);
        record.url = null;
        const {file: released, ...retained} = record.fact;
        record.fact = retained;
      }, editorProtocol.EDITOR_LIMITS.cardMs);
      return editorPublish(record, {...editorFact(request, 'done', artifact.issues?.length ? {issues: artifact.issues} : {}), file}, false);
    } catch (error) {
      const reason = request.signal?.aborted ? 'cancelled' : /^WILL LOST/.test(String(error?.message)) ? 'will_lost' :
        ['document_changed', 'stale_context'].includes(error?.code) ? 'document_changed' :
        typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,95}$/.test(error.code) ? error.code : 'export_unavailable';
      return editorPublish(record, refused(reason), false);
    }
  }

  function capturePlace() {
    const capture = _rapierCaptureForegroundSelection([]);
    const spans = _rapierExcerptCanonicalBlockSpans();
    const blocks = new Map(rapier.document.blocks.map((block, index) => [block.id,
      {...spans.get(block.id), raw: block.raw, index}]));
    const scrollers = [document.getElementById('editor-blocks'), document.getElementById('source-textarea')]
      .filter(Boolean).map(node => ({node, top: node.scrollTop, left: node.scrollLeft}));
    return {capture, blocks, scrollers, x: window.scrollX, y: window.scrollY,
      pointer: livePointer(), pointerOwned: !!pointerCurrent(), editing: editing(), humanSequence};
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
    const capture = place.capture;
    const followed = followedSelection(place, splices);
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
    // Canonical ↔ rendered mapping is editor-owned (`_rapierResolvePoint` /
    // `_rapierRestoreCanonicalSelection`); this door does not walk the DOM itself (surface-dependent is not
    // surface-owned).
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
    // An Undo restores exact earlier text: one change names its source transaction, a named contribution names every member's.
    const restoring = !!request.sourceTransactionId || (Array.isArray(request.sourceTransactionIds) && request.sourceTransactionIds.length > 0);
    const reason = admission() || hostFence({...request.fence, splices: request.splices});
    if (reason) return reason;
    if (!matches(request)) return 'document_changed';
    if (rapier.access.readOnly) return 'document_read_only';
    if (_rapierUserMutationBlocked()) return 'document_not_settled';
    if (_rapierWillReviewSlot.settling || _rapierCompareRuntime.lawReview) return 'human_review_in_progress';
    if (rapier.compare?.active && !ownsComparison(comparisonOwner)) return 'human_comparison_open';
    if (request.actor === 'agent' && !restoring && !reviews.has(request.reviewToken)) {
      // The kernel's watched test admits a semantic patch for the drawing the person has open.
      // Other edits remain under the document's review policy.
      const watched = !!hostFence() && !hostFence(request.fence);
      if (_rapierPosture() === 'ask' && !watched) return 'human_review_required';
    }
    return '';
  }

  async function commit(request) {
    abort(request);
    const restoring = !!request.sourceTransactionId || (Array.isArray(request.sourceTransactionIds) && request.sourceTransactionIds.length > 0);
    const review = reviews.get(request.reviewToken);
    if (request.reviewToken && (!review || review.documentId !== request.documentId ||
        review.revision !== request.baseRevision || review.beforeText !== request.beforeText ||
        review.text !== request.text || review.principal !== request.principal ||
        review.requestId !== request.requestId || review.expires < Date.now())) {
      reviews.delete(request.reviewToken);
      return fail('review_lapsed');
    }
    // Pending surface input belongs to its own human transaction, before this
    // candidate's source is admitted and before an agent compound can own it.
    if (!_rapierSettlePendingDocumentChange()) {
      reviews.delete(request.reviewToken);
      return fail('document_not_settled');
    }
    const refused = commitAdmission(request);
    if (refused) { reviews.delete(request.reviewToken); return fail(refused, refused === 'document_changed' ? 'conflict' : 'refused'); }
    reviews.delete(request.reviewToken);
    const place = capturePlace(), hidden = covered();
    const ctx = context(request, request.operation);
    const resolved = request.splices.map(row => ({text: row.inserted,
      resolved: {kind: 'document-range', source: request.beforeText, start: row.pos, end: row.pos + row.removed.length}}));
    let proof = null;
    if (request.actor === 'agent' && rapier.document.docKind === 'markdown') {
      let text = request.beforeText;
      for (const row of request.splices) {
        const will = {..._rapierWillParse(text), space: 'source'};
        if (!review && !restoring && _rapierWillRefuses(will,
          {kind: 'document-range', start: row.pos, end: row.pos + row.removed.length}, row.inserted)) return fail('document_law');
        text = text.slice(0, row.pos) + row.inserted + text.slice(row.pos + row.removed.length);
      }
      proof = _rapierWillProofBefore('agent', review ? resolved.slice(0, request.authoredCount ?? resolved.length) : resolved,
        !!review, restoring);
    }
    const drafts = request.splices.map(row => ({kind: 'document-range',
      startBlockId: null, endBlockId: null, beforeText: row.removed, afterText: row.inserted,
      anchorBefore: row.pos, anchorAfter: row.pos, replacementLength: row.inserted.length}));
    const changeSet = _rapierChangeSetMetadata(ctx, drafts, request.label || request.operation,
      restoring ? 'undo' : 'change');
    let done = false, committed = null;
    try {
      const result = await _rapierWithCompoundTransaction(ctx, async compound => {
        abort(request);
        if (!matches(request)) throw Object.assign(new Error('document_changed'), {code: 'document_changed'});
        const applied = await _rapierApplyCanonicalSplices(request.splices,
          {keepSourceMode: rapier.view.mode === 'source', retiredImages: []});
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
        contribution: request.contribution, contributionBaseRevision: request.contributionBaseRevision,
        carriedLedger: request.carriedLedger, signal: request.signal});
      // Before any other task runs: Draw's Done reads the place it lands at after its own wait for this commit.
      if (typeof _rapierDrawFollow === 'function') _rapierDrawFollow(request.splices);
      committed = {ok: true, revision: result.commitReceipt.documentRevision,
        documentId: result.commitReceipt.documentAuthority, transactionId: result.transaction?.id};
      if (request.actor === 'agent' && request.fence?.drawingPatch) {
        committed.drawingReceipt = projectRemoteDrawing(request.fence.drawingPatch,
          {transactionId: committed.transactionId, name: request.hostAgent || doorName});
      }
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
      // The compound owner restores source and Undo before rejecting a cancelled transaction.
      if (error?.name === 'AbortError' || request.signal?.aborted) return fail('cancelled');
      return fail(error?.code || 'commit_failed', 'conflict');
    } finally {
      try { if (!done && !hidden) restorePlace(place, []); } catch (_) {}
      try { restoreViewport(place); } catch (_) { if (committed) committed.presentation = 'failed'; }
    }
  }

  async function showComparison(request) {
    if (!matches(request)) return fail('document_changed', 'conflict');
    if (hostFence()) return fail(hostFence());
    if (_rapierWillReviewSlot.settling || _rapierCompareRuntime.lawReview) return fail('human_review_in_progress');
    const owner = request.principal || 'apps';
    if (rapier.compare?.active && !ownsComparison(owner)) return fail('human_comparison_open');
    abort(request);
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
    _rapierCompareRuntime.agentScope = scope(request);
    return {ok: true};
  }

  async function closeComparison(request) {
    if (!matches(request)) return fail('document_changed');
    if (!rapier.compare?.active && !rapier.compare?.running) { comparisonOwner = null; return {ok: true}; }
    if (!ownsComparison(request.principal)) return fail('comparison_not_owned');
    if (_rapierCompareRuntime.lawReview) return fail('human_review_in_progress');
    await rapierCompareClose();
    comparisonOwner = null; comparisonGeneration = -1; remoteComparison = null;
    return {ok: true};
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
    if (!visible() || editing() || drawingContext()?.open || notesFact()?.busy || remoteReview ||
        _rapierWillReviewSlot.settling || _rapierUiViewTransition.busy) return fail('human_edit_in_progress', 'yielded');
    if (!['formatted', 'source', 'notes'].includes(request.view)) return fail('view_invalid', 'invalid');
    if (viewMode() === request.view) return {ok: true};
    const fromView = viewMode(), sequence = humanSequence;
    const guard = () => !request.signal?.aborted && !admission() && matches(request, null) && visible() &&
      !editing() && !drawingContext()?.open && !remoteReview && !_rapierWillReviewSlot.settling &&
      humanSequence === sequence && (!request.guard || request.guard()) &&
      (viewMode() === fromView || viewMode() === request.view);
    if (request.view === 'notes') {
      if (typeof _rapierNotesOpen !== 'function' || !_rapierEmbedFeatureAllowed('notes')) return fail('view_unavailable');
      await _rapierNotesOpen(false, {guard});
    } else {
      if (request.view === 'formatted' && rapier.document.docKind === 'code') return fail('view_unavailable');
      if (request.view === 'source') _rapierUiRequestSourceView();
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
    return {ok: true};
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

  async function reveal(request) {
    if (!matches(request) || rapier.compare?.active) return fail('view_changed');
    abort(request);
    if (request.pointer?.expiresAt <= Date.now()) return fail('pointer_expired');
    if (request.pointer && typeof _rapierDrawEditingAsset === 'function' && _rapierDrawEditingAsset()) {
      return agentCaret(request.pointer.id, request.pointer.words, request) ? {ok: true} : fail('target_not_visible');
    }
    let resolved = {kind: 'document-range', start: request.start, end: request.end};
    if (rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source') {
      const start = _rapierBodyOffsetOfCanonical(request.start), end = _rapierBodyOffsetOfCanonical(request.end);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return fail('target_not_visible');
      resolved = {kind: 'markdown-range', start, end};
    }
    const travel = _rapierTravelBegin('agent reveal'), token = rapier.view.restoreToken;
    _rapierSeenViewMovedByAgent();
    const scroll = _rapierScrollResolvedIntoView(resolved);
    if (scroll.reason) return fail(scroll.reason);
    if (!await _rapierSettleRevealScroll(scroll, request.signal || idleSignal, token) || !matches(request)) return fail('view_changed');
    abort(request);
    if (request.pointer) {
      if (!agentCaret(request.pointer.id, request.pointer.words, request, scroll.element)) return fail('target_not_visible');
    } else {
      if (resolved.kind === 'markdown-range') _rapierRestoreCanonicalSelection(request.start, request.end);
      _rapierRevealMarker(resolved, scroll.element);
    }
    if (scroll.scrolled) _rapierTravelCommit(travel, _rapierTravelDestinationForResolved(resolved));
    return {ok: true};
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

  function compareSelection(compare, options) {
    if (!compare || !Array.isArray(compare.changes)) return fail('comparison_missing');
    const value = comparisonHunks(compare);
    if (!value.ok) return value;
    const pendingIn = hunk => hunk ? compare.changes.filter(change => change.status === 'pending' &&
      hunkContains(hunk, change)).map(change => change.id) : [];
    const hunkIndex = rapier.compare.currentHunk;
    const changeIds = pendingIn(value.hunks[hunkIndex]);
    if (changeIds.length) return {ok: true, compareId: compare.id, changeIds, hunkIndex};
    /* The pointed-at hunk has nothing left pending here -- already decided, or the pointer never
       named a hunk at all. comparisonHunks above already ruled out CRLF/newline ambiguity, a stale
       snapshot and an in-flight recompute, so if the comparison is still otherwise exact a later
       hunk may still hold a pending, equally exact change: read as decidable rather than staying
       dead on a hunk that is already settled. Peeking here never moves the one shared pointer that
       _rapierCompareFocusChange's own comment guards ("Person stepping through, and lead pointing
       one out, must move the same marker") -- only an actual decision (options.advance) moves it,
       and only then does the view scroll to match, so a decision still always lands on exactly what
       is shown as current, never on a change nobody's pointer names. */
    const nextIndex = value.hunks.findIndex((candidate, index) => index !== hunkIndex && pendingIn(candidate).length);
    if (nextIndex < 0) return value.hunks[hunkIndex] ? fail('no_pending_change') : fail('change_not_visible');
    if (options?.advance) _rapierCompareFocusChange(nextIndex);
    return {ok: true, compareId: compare.id, changeIds: pendingIn(value.hunks[nextIndex]), hunkIndex: nextIndex};
  }

  function expectedCurrent(expected) {
    return expected?.expectedDocumentId === String(rapier.identity.authority) &&
      expected.expectedRevision === Number(rapier.revision.settled) &&
      expected.expectedText === _rapierSourceText() &&
      (expected.expectedGeneration == null || expected.expectedGeneration === Number(rapier.revision.generation));
  }

  async function applyView(intent, expected, value, options = {}) {
    await ready;
    if (!intent || intent.status !== 'pending' || !['document', 'compare', 'mode'].includes(intent.kind)) return fail('view_invalid', 'invalid');
    if (intent.kind === 'mode') {
      if (value?.documentId !== expected?.expectedDocumentId || !expectedCurrent(expected)) return fail('document_changed', 'conflict');
      if (viewMode() !== intent.fromView && viewMode() !== intent.view) return fail('human_view_changed');
      return applyViewMode({documentId: value.documentId, view: intent.view, guard: () => expectedCurrent(expected)});
    }
    const hand = await humanContext();
    if (!value || value.documentId !== expected?.expectedDocumentId || value.text !== expected.expectedText ||
        value.revision !== intent.revision || !expectedCurrent(expected)) return fail('document_changed', 'conflict');
    if (!visible()) return fail('view_hidden');
    if (!hand.ok || hand.context.editing || remoteReview || _rapierWillReviewSlot.settling) return fail('human_edit_in_progress', 'yielded');
    if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= Date.now()) return fail('view_expired');
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
        result = await reveal({...request, start: intent.start, end: intent.end});
      } else {
        const compare = value.compare;
        const change = compare?.id === intent.compareId && compare.changes?.find(row => row.id === intent.changeId);
        if (!change) return fail('comparison_changed', 'conflict');
        result = await host.revealChange({...request, compareId: compare.id, changeId: change.id,
          currentText: compare.baseline, incomingText: compare.incoming, ...change});
        if (result.ok) await new Promise(resolve => requestAnimationFrame(resolve));
      }
      controller.signal.throwIfAborted();
      if (!visible() || !expectedCurrent(expected) || intent.expiresAt <= Date.now()) return fail('view_changed');
      return result.ok ? {ok: true, presented: true, viewId: intent.id} : result;
    } catch (error) {
      return fail(error?.name === 'AbortError' ? 'human_interaction' : error?.code || 'view_failed');
    } finally {
      projecting--;
      if (viewFlight === controller) viewFlight = null;
    }
  }

  function reviewImage(review, text) {
    if (!['proposal', 'check'].includes(review?.kind) || !Array.isArray(review.splices) || !review.splices.length) return null;
    let rows = review.splices;
    if (review.kind === 'proposal' && Array.isArray(review.changes) && review.changes.length) {
      rows = review.changes.map((row, index) => row.status === 'pending' ? review.splices[index] : null).filter(Boolean);
      if (!rows.length) return null;
    }
    const transformed = globalThis.RapierKernel.transformSplices(text, rows);
    if (typeof transformed !== 'string') return null;
    const baseline = review.kind === 'check' ? transformed : text;
    const incoming = review.kind === 'check' ? text : transformed;
    if (baseline === incoming) return null;
    return {baseline, incoming};
  }

  const reviewNotify = (record, name, value) => {
    try { Promise.resolve(record.options[name]?.(value)).catch(() => showToast('The review could not be completed.', 'error')); }
    catch (_) { showToast('The review could not be completed.', 'error'); }
  };

  function presentationChanged() {
    const record = remoteReview;
    if (!record || record.presented || record.pending !== _rapierWillReviewSlot.pending) return;
    requestAnimationFrame(() => {
      if (remoteReview !== record || record.presented || record.pending !== _rapierWillReviewSlot.pending ||
          !visible() || !expectedCurrent(record.expected)) return;
      const compare = rapier.compare, content = document.getElementById('compare-content');
      if (!compare?.active || compare.running || compare.result?.status !== 'ok' ||
          compare.currentText !== record.image.baseline || compare.incomingText !== record.image.incoming ||
          !content?.querySelector('.compare-hunk') || content.getBoundingClientRect().height <= 0) return;
      record.presented = true;
      reviewNotify(record, 'onPresentation', {ok: true, presented: true, reviewId: record.review.id,
        documentId: record.value.documentId, serverRevision: record.value.revision});
    });
  }

  async function dismissReview(id, reason = 'review_changed') {
    const record = remoteReview;
    if (!record || (id && record.review.id !== id)) return {ok: true};
    record.reason = reason;
    record.controller.abort();
    await record.done;
    return {ok: true};
  }

  async function presentReview(review, value, expected, options = {}) {
    // The inline read surface's own spans are not the law lens's presentation: they read the
    // pending review directly (pendingReviewSnapshot) rather than waiting on this function's own
    // present/dismiss ceremony, so they draw whether or not the modal lens actually opens below --
    // including the guards just past this line (view hidden, a human mid-edit) that leave a fresh
    // proposal pending and unpresented. This is the one place stageReview's own presentation
    // attempt reaches the browser.
    _rapierReviewSpansRefresh();
    await ready;
    if (!review || review.status !== 'pending') return dismissReview();
    if (remoteReview?.signature === reviewSignature(review) && remoteReview.value.revision === value?.revision &&
        remoteReview.value.text === value?.text && expectedCurrent(remoteReview.expected)) {
      return {ok: true, pending: true, presented: remoteReview.presented, reviewId: review.id};
    }
    if (remoteReview) await dismissReview();
    if (!value || value.documentId !== expected?.expectedDocumentId || value.text !== expected.expectedText ||
        value.revision !== review.revision || !expectedCurrent(expected)) return fail('review_document_changed', 'conflict');
    if (!visible()) return fail('view_hidden');
    const hand = await humanContext();
    if (!hand.ok || hand.context.editing) return fail('human_edit_in_progress', 'yielded');
    if (!expectedCurrent(expected)) return fail('review_document_changed', 'conflict');
    const image = reviewImage(review, value.text);
    if (!image) return fail('review_evidence_unavailable');
    if (rapier.compare?.active && ownsComparison(comparisonOwner)) {
      const closed = await closeComparison({documentId: value.documentId, principal: comparisonOwner});
      if (!closed.ok || !expectedCurrent(expected)) return fail('review_document_changed', 'conflict');
    }
    const afterClose = await humanContext();
    if (!visible() || !afterClose.ok || afterClose.context.editing) return fail('human_edit_in_progress', 'yielded');
    if (!expectedCurrent(expected)) return fail('review_document_changed', 'conflict');
    if (rapier.compare?.active || rapier.compare?.running || _rapierWillReviewSlot.settling) return fail('human_review_in_progress');
    const controller = new AbortController();
    const resolved = {kind: 'document-range', source: value.text, start: 0, end: value.text.length, record: {}};
    const who = {actor: 'agent', principal: options.principal || 'mcp', requestId: options.requestId || review.id,
      transport: options.transport || 'platform', signal: controller.signal};
    let presentation = review.kind === 'check' ? {kind: 'check', baseline: image.baseline,
      baseRevision: review.baseRevision, includesHumanChanges: review.includesHumanChanges === true} : proposalRecord() ? {kind: 'proposal', base: proposalRecord().base} : null;
    if (review.contribution) presentation = {...(presentation || {kind: 'proposal'}), contribution: review.contribution};
    _rapierSeenViewMovedByAgent();
    const changes = review.kind === 'proposal' && Array.isArray(review.changes) && review.changes.length
      ? review.changes.filter(row => row.status === 'pending').map(row => ({id: row.id, pos: row.pos, removed: String(row.removed || '').length, inserted: String(row.inserted || '').length}))
      : review.kind === 'proposal' && Array.isArray(review.changeIds) && review.changeIds.length && review.changeIds.length <= review.splices.length
      ? review.changeIds.map((id, index) => { const row = review.splices[index]; return {id, pos: row.pos, removed: String(row.removed || '').length, inserted: String(row.inserted || '').length}; }) : null;
    const decision = _rapierWillReviewOpen(resolved, image.incoming, caller(who), true, presentation, changes);
    const pending = _rapierWillReviewSlot.pending;
    if (!pending || pending.resolved !== resolved) {
      const refusal = await decision;
      return fail(refusal.reason || 'review_unavailable');
    }
    const record = {review, signature: reviewSignature(review), value, expected: {...expected}, image, options, pending, controller, presented: false, done: null};
    remoteReview = record;
    // Review content outlives execution authority: `expiresAt` is the agent's authority-lapse
    // clock, not a session bound. The presentation stays until the person decides or the document
    // moves; surviveReview at decideReview revalidates the target.
    record.done = Promise.resolve(decision).then(async result => {
      let restored = false;
      try { restored = result.review && await _rapierAwaitWillRestore(result.review, idleSignal); }
      finally { if (result.review) _rapierWillReviewRelease(result.review, false); }
      const exact = expectedCurrent(record.expected);
      const trusted = exact && record.presented && (
        (restored && ['allowed', 'kept'].includes(result.reason)) || ['apply', 'drop'].includes(result.action));
      if (!record.presented) reviewNotify(record, 'onPresentation', {ok: false, reviewId: review.id,
        reason: record.reason || result.reason || 'review_not_presented'});
      const event = {reviewId: review.id, documentId: value.documentId, revision: expected.expectedRevision,
        generation: expected.expectedGeneration ?? pending.generation, serverRevision: value.revision,
        beforeText: value.text, trusted: trusted === true,
        ...(trusted ? {action: ['approve', 'decline', 'apply', 'drop'].includes(result.action) ? result.action : (result.allowed ? 'approve' : 'decline'),
          ...((result.allowed || result.action === 'apply' || result.action === 'drop') && Array.isArray(result.changeIds) ? {changeIds: result.changeIds} : {})} :
          {reason: record.reason || (!exact ? 'review_document_changed' : result.reason || 'review_dismissed')})};
      const keepOpen = event.trusted && ['apply', 'drop'].includes(event.action);
      if (!keepOpen && remoteReview === record) remoteReview = null;
      try { await Promise.resolve(record.options.onDecision?.(event)); }
      catch (_) { showToast('The review could not be completed.', 'error'); }
      const live = kernel.collaboration()?.review;
      const still = keepOpen && live?.status === 'pending' && live?.id === review.id;
      if (still) {
        const next = kernel.snapshot();
        record.value = {...record.value, text: next.text, revision: next.revision};
        record.expected = {...record.expected, expectedRevision: next.revision, expectedText: next.text};
        record.review = live;
        record.image = reviewImage(live, next.text) || record.image;
        remoteReview = record;
      } else if (remoteReview === record) remoteReview = null;
      return event;
    }).catch(error => {
      if (remoteReview === record) remoteReview = null;
      reviewNotify(record, 'onDecision', {reviewId: review.id, trusted: false, reason: error?.code || 'review_failed'});
    }).finally(() => { contextChanged('review'); });
    presentationChanged();
    return {ok: true, pending: true, presented: false, reviewId: review.id};
  }

  // The kernel's review is source-rich. The embed receives only this allowlist; even labels,
  // reasons and caller names can contain document text. Never spread a review onto the wire.
  function embedReviewMetadata(review) {
    if (typeof review?.id !== 'string' || !/^review_[0-9a-f]{32}$/.test(review.id) ||
        !['proposal', 'inline', 'check'].includes(review.kind) ||
        !['pending', 'approved', 'declined', 'invalidated'].includes(review.status) ||
        !['will', 'ask', 'check', 'proposal'].includes(review.cause) ||
        !Number.isSafeInteger(review.revision) || review.revision < 0) return null;
    const law = review.law ?? null, region = review.region ?? null;
    if (law !== null && !['keep', 'append', 'edit'].includes(law)) return null;
    if (region !== null && (!Number.isSafeInteger(region) || region < 0)) return null;
    if (review.changes != null && !Array.isArray(review.changes)) return null;
    const changes = [];
    for (const row of review.changes || []) {
      if (typeof row?.id !== 'string' || !row.id.startsWith(review.id + '.') ||
          !/^[1-9][0-9]*$/.test(row.id.slice(review.id.length + 1)) ||
          !['pending', 'applied', 'dropped', 'stale'].includes(row.status)) return null;
      changes.push({id: row.id, status: row.status});
    }
    let decision = null;
    if (review.decision) {
      const row = review.decision;
      if (!['approve', 'decline'].includes(row.action) ||
          !['ok', 'applied', 'rebased', 'unchanged'].includes(row.outcome) ||
          !Number.isSafeInteger(row.revision) || row.revision < 0) return null;
      decision = {action: row.action, outcome: row.outcome, revision: row.revision};
    }
    return {id: review.id, kind: review.kind, status: review.status, cause: review.cause,
      revision: review.revision, law, region, changes, decision};
  }

  function publishEmbedReview() {
    const review = kernel?.collaboration()?.review;
    const retained = review ? JSON.stringify([String(rapier.identity.authority), review.id, review.revision,
      review.status, review.changes?.map(row => [row.id, row.status, row.reason]), review.decision || null]) : '';
    if (retained !== reviewPersistenceSignature) {
      reviewPersistenceSignature = retained;
      // A proposal or Drop changes no source bytes, but still belongs to document recovery.
      _rapierArmAutosave();
    }
    if (!_rapierEmbed.active || !_rapierEmbed.connected || !_rapierEmbed.loaded ||
        _rapierEmbed.loading || !_rapierEmbed.capabilities?.includes('agent') || !kernel) {
      embedReviewSignature = ''; return false;
    }
    if (!review) { embedReviewSignature = ''; return false; }
    const payload = embedReviewMetadata(review);
    if (!payload) return false;
    // This is a notification cursor, not review history. Reconnect may replay the current record;
    // a rebase that changes only its revision must not turn ordinary typing into an event feed.
    const {revision, ...lifecycle} = payload;
    const authority = String(rapier.identity.authority);
    const signature = JSON.stringify([_rapierEmbed.portGeneration, authority, lifecycle]);
    if (signature === embedReviewSignature) return false;
    const state = kernel.snapshot();
    if (state.documentId !== authority || state.review?.documentId !== authority) return false;
    if (!_rapierEmbedPost('agent-review', payload)) return false;
    embedReviewSignature = signature;
    return true;
  }

  // The one owner of "how a human decision reaches the kernel" for a pending proposal, apply/drop
  // included (a review is decided over time): the review token pins the text a decision commits to
  // the kernel's own previewReview at the live revision, so the host's own commit -- which
  // recomputes the identical picture-retirement splices -- never refuses a decision this preview
  // already approved. presentKernelReview's onDecision (the law lens) and the inline read-surface's
  // keep/drop strip and type-over both call this -- one decision path, so the token pinning and
  // hosted parity stay one owner.
  async function decideKernelReview(review, action, changeIds) {
    const refuse = reason => { showToast('Review could not be applied: ' + reason, 'error'); return {outcome: 'refused', reason}; };
    if (!review || !['approve', 'decline', 'apply', 'drop'].includes(action)) return refuse('review_decision_invalid');
    let reviewToken;
    const live = kernel.collaboration()?.review;
    if (reviewSignature(live) !== reviewSignature(review)) return refuse('review_document_changed');
    const current = kernel.snapshot();
    const expectedRevision = live?.revision ?? current.revision;
    // A named contribution is decided whole, including stale members when it is dropped.
    // Keep every affected inline fragment suppressed until that one decision resolves.
    const source = live || review;
    const affected = source.contribution && Array.isArray(source.changes)
      ? source.changes.filter(row => row.status === 'pending' || row.status === 'stale').map(row => row.id)
      : action === 'approve' || action === 'decline'
        ? Array.isArray(source.changeIds) ? source.changeIds.slice() : []
        : Array.isArray(changeIds) ? changeIds.slice() : [];
    for (const id of affected) decidingChanges.add(id);
    try {
    if ((action === 'approve' || action === 'apply') && (live || review).kind === 'proposal') {
      // The token pins the text the person approved (or applied) to the kernel's own preview of
      // this exact decision -- picture-retirement splices included -- so the host's commit never
      // refuses a decision the preview already approved.
      const previewArgs = {reviewId: review.id, ...(Array.isArray(changeIds) ? {changeIds} : {})};
      const preview = typeof kernel.previewReview === 'function' ? kernel.previewReview(previewArgs) : null;
      let text;
      if (preview?.outcome === 'ok') {
        text = preview.text;
        for (const id of preview.changeIds || []) { decidingChanges.add(id); if (!affected.includes(id)) affected.push(id); }
      } else if (source.contribution) return refuse(preview?.reason || preview?.outcome || 'review_evidence_unavailable');
      else if (Array.isArray(changeIds) && Array.isArray(source.changeIds)) {
        const keep = new Set(changeIds);
        const splices = Array.isArray(source.changes)
          ? source.changes.filter(row => keep.has(row.id) && row.status === 'pending')
            .map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted}))
          : source.changeIds.map((id, index) => keep.has(id) ? source.splices[index] : null).filter(Boolean);
        text = globalThis.RapierKernel.transformSplices(current.text, splices);
        if (typeof text !== 'string') return refuse('review_evidence_unavailable');
      } else {
        const image = reviewImage(live || review, current.text);
        if (!image) return refuse('review_evidence_unavailable');
        text = image.incoming;
      }
      const identity = reviewIdentities.get(review.id);
      reviewToken = crypto.randomUUID();
      reviews.set(reviewToken, {documentId: current.documentId, revision: current.revision, beforeText: current.text,
        text, principal: identity?.principal ?? 'mcp', requestId: identity?.requestId ?? review.id, expires: Date.now() + 30000});
    }
    let result;
    try {
      result = await kernel.decideReview({expectedRevision, reviewId: review.id,
        action, ...(Array.isArray(changeIds) ? {changeIds} : {})}, {actor: 'human', principal: 'local', transport: 'platform',
        requestId: crypto.randomUUID(), signal: idleSignal, reviewToken});
    } finally { if (reviewToken) reviews.delete(reviewToken); }
    if (['refused', 'conflict', 'invalid'].includes(result.outcome)) showToast('Review could not be applied: ' + result.reason, 'error');
    if (result.review && result.review.status !== 'pending') reviewIdentities.delete(review.id);
    publishEmbedReview();
    void refresh();
    return result;
    } finally { for (const id of affected) decidingChanges.delete(id); }
  }

  async function presentKernelReview(request) {
    // The one place this door ever learns a proposal's own originating identity -- stageReview
    // calls this unconditionally for every proposal review, whether or not the modal lens ends up
    // opening below -- so decideKernelReview can pin a reviewToken to it later for a decision that
    // reaches this door by any path.
    // A later call for the same review (the inline bar's REVIEW) never replaces the identity learned at staging.
    if (request?.review?.kind === 'proposal' && request.review.id && !reviewIdentities.has(request.review.id)) {
      reviewIdentities.set(request.review.id, {principal: request.principal, requestId: request.requestId});
    }
    const value = await snapshot();
    if (!matches(request)) return fail('review_document_changed', 'conflict');
    publishEmbedReview();
    const image = reviewImage(request.review, value.text);
    if (!image) return fail('review_evidence_unavailable');
    return presentReview(request.review, value, {expectedDocumentId: value.documentId,
      expectedRevision: value.revision, expectedText: value.text, expectedGeneration: value.generation}, {
      principal: request.principal, transport: request.transport, requestId: request.requestId,
      onDecision: async decision => {
        if (decision.trusted !== true) return;
        if (!['approve', 'decline', 'apply', 'drop'].includes(decision.action)) return;
        const result = await decideKernelReview(request.review, decision.action, decision.changeIds);
        if (decision.action === 'approve' && request.review.kind === 'check' && result.acknowledged === true) {
          const ids = [...rapier.review.moved].filter(([, owner]) =>
            _rapierScopeOwns(scope(request), owner.actor, owner.transport)).map(([id]) => id);
          _rapierSeenWitnessBlocks(ids, null);
        }
      },
    });
  }

  // The inline read-surface's own read of the pending proposal: a pure accessor over the same
  // collaboration() snapshot document.get_context and the law lens already read, relocated
  // (relocation runs at decision time and whenever a door reads collaboration()) so a stale
  // position never reaches the spans. Never anything but a proposal under decision -- a check,
  // inline or comparison-driven review has nothing for a person to keep or drop change by change.
  function pendingReviewSnapshot() {
    if (!kernel) return null;
    const review = kernel.collaboration()?.review;
    return review && review.kind === 'proposal' && review.status === 'pending' ? review : null;
  }

  // The wider twin of pendingReviewSnapshot: the same proposal a moment after a decision closes
  // it, still carrying each change's final status (applied/dropped), before the next unrelated
  // edit or TTL expiry clears it from collaboration(). The inline surface's own span-undo reads
  // this -- pendingReviewSnapshot's pending-only filter goes stale the instant the decision it is
  // undoing for lands.
  function reviewSnapshot() {
    if (!kernel) return null;
    const review = kernel.collaboration()?.review;
    return review && review.kind === 'proposal' ? review : null;
  }

  // The kernel state a restart needs for pending negotiations and caller-scoped retries -- never
  // the document text itself, which the editor's own existing recovery store already owns and
  // restores independently (`refresh`'s `!kernel` branch merges the two). That store's existing
  // write cycle retains the kernel's bounded receipts and spent identities even in FREE, so a
  // reconnect cannot execute an old write again. Pending work, CHECK state and the person's decision
  // receipts survive too; a portable proposal also retains its original base.
  function agentRecoveryState() {
    if (!kernel) return null;
    // The kernel's own state otherwise only catches up with an ordinary human edit the way every
    // kernel operation already does -- host.snapshot() pulled and reconciled at the very start of
    // the next invoke()/decideReview() (kernel.mjs's own internal refresh(context)) -- so a document
    // that settles into autosave without an intervening agent call would retain a stale revision.
    // Reconciling here, against the same live snapshot() every door already reads, keeps the
    // retained slice current with no new source of truth and no extra write of its own.
    try { kernel.reconcile(current(), {actor: 'system', principal: 'bootstrap'}); } catch (_) {}
    const snap = kernel.snapshot(), invocationJournal = kernel.invocationJournal();
    if ((!snap.review || snap.review.status !== 'pending') && !snap.proposalBase &&
        !snap.reviewDecisions.entries.length && snap.posture !== 'check' && !invocationJournal.length) return null;
    const {text, ...rest} = snap;
    return {...rest, invocationJournal};
  }

  // The inline read-surface's keep/drop strip and type-over call this directly instead of going
  // through the law lens's whole present/dismiss ceremony -- decideKernelReview is still the one
  // place a decision reaches the kernel. Refuses (without reaching the kernel) a reviewId that is
  // no longer the live pending review, the same shape kernel.decideReview itself would refuse it
  // with.
  async function decideReviewChange(reviewId, action, changeIds) {
    await ready;
    const review = kernel?.collaboration()?.review;
    if (!review || review.id !== reviewId || review.status !== 'pending') {
      return {outcome: 'refused', reason: 'review_document_changed'};
    }
    return decideKernelReview(review, action, changeIds);
  }

  // Opens the law lens for the whole pending review on demand -- "the lens for the whole thing" the
  // inline review bar offers beside ALLOW ALL. Shares presentKernelReview (and so the same token
  // pinning and presence bookkeeping) rather than opening a second presentation path; presentReview's
  // own dedupe makes a call while the lens is already open for this review a harmless no-op.
  async function representPendingReview() {
    const review = kernel?.collaboration()?.review;
    if (!review || review.status !== 'pending') return {ok: false, reason: 'review_missing'};
    const origin = kernel.snapshot().review;
    const identity = {principal: origin.principal, transport: origin.transport, requestId: origin.requestId};
    if (review.kind === 'inline') return driveInlineReview(review, identity);
    return presentKernelReview({review, documentId: String(rapier.identity.authority), revision: review.revision, ...identity});
  }

  // Structural parse for a JS/HTML document: the browser's own answer to a world.structure fact
  // decide can no longer await. Shared by resolveStructureFact (a surface-fact pending's
  // continuation) below; kernel.mjs never calls this directly (structure freshness is a gate).
  async function structureJob(input) {
    const request = globalThis.RapierStructureRequest.structureRequest(input);
    if (!request) return {ok: false, complete: false, reason: 'structure_unavailable'};
    const sameSource = () => _rapierSourceText() === input.text && String(rapier.document.filename) === input.filename;
    if (!sameSource()) return {ok: false, complete: false, reason: 'document_changed'};
    // Markdown is read in this realm by the parser the page renders with (the engine's `md`); code goes to the structure worker.
    const result = request.kind === 'markdown'
      ? (typeof md === 'undefined' || !md ? {ok: false, complete: false, reason: 'structure_unavailable'} : globalThis.RapierAgentMarkdown.structureMarkdown(request, md))
      : await _rapierStructureJob(request, idleSignal);
    return sameSource() ? result : {ok: false, complete: false, reason: 'document_changed'};
  }

  // Answers one pending{kind:'surface-fact'} requirement from this door's own current document --
  // outline and structural find are the two call sites that can genuinely need it; get_outline's
  // is knowable from the op alone (measurementsRequired in agent/kernel.mjs), so invoke() below
  // also tries it up front and this function is what a first-time or racing call falls back to.
  // Returns null when the requirement no longer matches this document, letting the kernel's own
  // revision check answer instead of a second, adapter-side guess at staleness.
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

  // Pixels are an observation of exactly this source, never a source handle. Apps supplies its
  // already-verified local snapshot separately because local and server revision counters differ.
  async function inspectDrawingVisual(request, expected, drawing) {
    const visual = globalThis.RapierAgentVisual;
    const identity = {documentId: request.documentId, revision: request.revision, scope: request.scope,
      drawing: visual.visualDrawingIdentity(drawing)};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (!visual.sameVisualDrawing(request.drawing, drawing)) return refuse('visual_target_changed');
    if (drawing.recipeUnavailable || !drawing.recipe) return refuse('visual_render_unavailable');
    const before = documentState(), revision = expected?.expectedRevision ?? request.revision;
    if (before.documentId !== request.documentId || before.revision !== revision ||
        (expected && (expected.expectedDocumentId !== before.documentId || expected.expectedText !== before.text ||
          expected.expectedGeneration !== before.generation))) return refuse('document_changed');
    const field = request.scope === 'page' ? 'canvas' : request.scope === 'selection' ? 'selection' : 'visible';
    const clip = drawing.bounds?.[field];
    if (!clip || !(clip.width > 0 && clip.height > 0)) return refuse('visual_target_missing');
    if (typeof globalThis.RapierVisualCapture?.captureDrawing !== 'function') return refuse('visual_render_unavailable');
    const controller = new AbortController(), abortCapture = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abortCapture, {once: true});
    if (request.signal?.aborted) abortCapture();
    visualFlight = controller;
    const geometry = JSON.stringify({clip, transform: request.scope === 'viewport' ? drawing.transform : null,
      selected: request.scope === 'selection' ? drawing.selectedObjects : null});
    const current = () => {
      if (!visible() || admission() || _rapierMutationBarrierActive() || String(rapier.identity.authority) !== before.documentId ||
          Number(rapier.revision.settled) !== revision || Number(rapier.revision.generation) !== before.generation ||
          _rapierSourceText() !== before.text) return false;
      const next = drawingContext();
      return visual.sameVisualDrawing(identity.drawing, next) && geometry === JSON.stringify({clip: next?.bounds?.[field],
        transform: request.scope === 'viewport' ? next?.transform : null,
        selected: request.scope === 'selection' ? next?.selectedObjects : null});
    };
    try {
      const image = await globalThis.RapierVisualCapture.captureDrawing({recipe: drawing.recipe, clip, signal: controller.signal, current});
      return current() ? {...identity, outcome: 'ok', image} : refuse('visual_target_changed');
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
    const target = request.scope === 'focus' || request.scope === 'selection' ? hand.context[request.scope] : null;
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
      const held = request.scope === 'focus' && root.querySelector('img[data-rapier-image-selected]');
      let bounds = held?.getBoundingClientRect();
      if (!bounds && request.scope === 'selection') {
        const selection = window.getSelection();
        const selected = selection?.rangeCount && selection.getRangeAt(0);
        if (selected && root.contains(selected.commonAncestorContainer)) bounds = selected.getBoundingClientRect();
      }
      if (!bounds && request.scope === 'focus') {
        const spans = _rapierExcerptCanonicalBlockSpans();
        const wrappers = [...root.querySelectorAll(':scope > .block-wrapper')].filter(wrapper => {
          const span = spans.get(_rapierBoundBlock(wrapper)?.id);
          return span && span.start < target.end && span.end > target.start;
        });
        if (wrappers.length && !wrappers.some(wrapper => wrapper._rapierDormant)) {
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
      const image = await globalThis.RapierVisualCapture.captureVisual({root, clip, signal: controller.signal, current});
      if (!current()) return refuse('document_changed');
      return {...identity, outcome: 'ok', image, ...(target ? {sourceRange: {start: target.start, end: target.end}} : {})};
    } catch (error) {
      return refuse(request.signal?.aborted ? 'cancelled' : error?.code || 'visual_render_unavailable');
    } finally {
      request.signal?.removeEventListener('abort', abortCapture);
      if (visualFlight === controller) visualFlight = null;
    }
  }

  let exportFlight = null;
  const retainedExports = new Map();
  const RETAINED_EXPORTS = 4, EXPORT_LIFETIME_MS = 86400000;

  // Word and PDF are the editor's own writers: built from one settled snapshot, and a change of source while they render invalidates the
  // result before it can leave, through the hosted acknowledgement or the local grant. Both export requests share the artifact
  // owner; Word also shares the person's Export preparation, portability analysis, and writer.
  async function exportDocument(request, expected) {
    await ready;
    const identity = {documentId: request?.documentId, revision: request?.revision, format: request?.format};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (request?.signal?.aborted) return refuse('cancelled');
    if (exportFlight) return refuse('export_busy');
    if (request?.kind !== 'export' || !['docx', 'pdf'].includes(request.format)) return refuse('export_format_invalid');
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
      const artifact = await _rapierBuildEditorExport(request.format === 'docx' ? 'export_word' : 'export_pdf', {expectedText: local.text},
        {signal: request.signal, current, maxBytes: MAX_EXPORT_BYTES});
      const blob = new Blob([artifact.bytes], {type: artifact.mimeType}), filename = exportFilename(request.filename, request.format);
      const {pages, issues} = artifact;
      if (!current()) return refuse(request.signal?.aborted ? 'cancelled' : 'document_changed');
      if (!blob.size || blob.size > MAX_EXPORT_BYTES) return refuse('export_too_large');
      const url = await _rapierBlobDataUrl(blob);
      if (!current()) return refuse(request.signal?.aborted ? 'cancelled' : 'document_changed');
      return {...identity, outcome: 'ok', artifact: {mimeType: blob.type, data: url.slice(url.indexOf(',') + 1), filename,
        ...(pages ? {pages} : {}), ...(issues?.length ? {issues} : {})}};
    } catch (error) {
      return refuse(request.signal?.aborted ? 'cancelled' : /^WILL LOST/.test(String(error?.message)) ? 'will_lost' :
        error?.code === 'stale_context' ? 'document_changed' : typeof error?.code === 'string' && error.code ? error.code.slice(0, 128) : 'export_unavailable');
    } finally { if (exportFlight === flight) exportFlight = null; }
  }

  // A local file is a Blob address that lives a day, as a hosted grant does, and ends with its document, its place among the last few,
  // or this page.
  function forgetExport(id) {
    const value = retainedExports.get(id);
    if (!value) return;
    clearTimeout(value.timer); URL.revokeObjectURL(value.url); retainedExports.delete(id);
  }
  function releaseExports(documentId) {
    for (const [id, value] of retainedExports) if (!documentId || value.documentId !== documentId || value.expiresAt <= Date.now()) forgetExport(id);
  }

  // The file for document.export on this page: each format from its one owner, over the settled source the request names.
  // A request that carries a base is a review beside its original: the document is the base, the text is the proposal.
  async function exportFile(request) {
    const local = await snapshot(), source = request.base?.text ?? request.text;
    if (local.text !== source || local.filename !== request.filename || request.signal?.aborted) return {reason: 'document_changed'};
    let bytes, mimeType, pages, issues;
    let name = exportFilename(request.filename, request.format), fidelity = exportFidelity(request.format, request.docKind);
    if (request.file) {
      ({bytes, mimeType, name, pages, issues, fidelity} = request.file);
    } else if (request.format === 'markdown') {
      bytes = new TextEncoder().encode(request.text); mimeType = (request.docKind === 'markdown' ? 'text/markdown' : 'text/plain') + '; charset=utf-8';
    } else if (request.format === 'html') {
      if (!globalThis.RapierPortableTemplate || !globalThis.RapierPortablePage) return {reason: 'export_page_unavailable'};
      bytes = new TextEncoder().encode(globalThis.RapierPortablePage.wrap(globalThis.RapierPortableTemplate(), request.text, request.filename,
        request.base ? {base: request.base} : undefined));
      mimeType = 'text/html; charset=utf-8';
    } else {
      const captured = await _rapierCaptureSettledExternalDocument();
      if (!captured || captured.canonical !== source) return {reason: 'document_changed'};
      if (request.format === 'txt') {
        bytes = new TextEncoder().encode(_rapierRenderModule('render-markdown')._rapierPlainTextFile(_rapierBuildInterchangeContext({format: 'txt'}, captured)));
        mimeType = 'text/plain; charset=utf-8';
      } else if (request.format === 'page') {
        const artifact = await _rapierBuildArtifact({kind: 'page'}, _rapierBuildInterchangeContext({kind: 'page'}, captured));
        bytes = new TextEncoder().encode(artifact.html); mimeType = 'text/html; charset=utf-8';
      } else return {reason: 'export_format_invalid'};
    }
    if (bytes.byteLength > MAX_EXPORT_BYTES) return {reason: 'export_too_large', byteLength: bytes.byteLength, limitBytes: MAX_EXPORT_BYTES};
    const now = await snapshot();
    if (request.signal?.aborted || now.documentId !== local.documentId || now.revision !== local.revision || now.text !== local.text || now.filename !== local.filename)
      return {reason: request.signal?.aborted ? 'cancelled' : 'document_changed'};
    releaseExports(local.documentId);
    while (retainedExports.size >= RETAINED_EXPORTS) forgetExport(retainedExports.keys().next().value);
    const id = crypto.randomUUID(), url = URL.createObjectURL(new Blob([bytes], {type: mimeType})), expiresAt = Date.now() + EXPORT_LIFETIME_MS;
    const timer = setTimeout(() => forgetExport(id), EXPORT_LIFETIME_MS);
    retainedExports.set(id, {url, expiresAt, documentId: local.documentId, timer});
    return {id, url, expiresAt, name, mimeType, bytes, fidelity, ...(pages ? {pages} : {}), ...(issues?.length ? {issues} : {})};
  }

  // Drives the inline Will review UI for a pending{kind:'human-review'} whose review.kind is
  // 'inline' -- the same _rapierWillReviewOpen presentation host.review drove synchronously inside
  // the kernel. decide does not block on it: it stages the pending review and returns; this runs
  // after, from invoke() below, and reports the decision back on a continuation through
  // kernel.decideReview -- the one commit owner applies it.
  async function driveInlineReview(review, requestMeta) {
    publishEmbedReview();
    const decline = () => kernel.decideReview({expectedRevision: review.revision, reviewId: review.id, action: 'decline'},
      {actor: 'human', principal: 'local', transport: 'platform', requestId: crypto.randomUUID(), signal: idleSignal});
    const pending = reason => ({outcome: 'pending', reason: 'human_review_required', reviewId: review.id,
      review: kernel.collaboration().review, cause: review.cause, presentation: reason});
    const beforeText = _rapierSourceText();
    const splice = review.authoredSplices?.[0];
    if (String(rapier.identity.authority) !== review.documentId || Number(rapier.revision.settled) !== review.revision ||
        !splice || beforeText.slice(splice.pos, splice.pos + splice.removed.length) !== splice.removed) return pending('review_document_changed');
    const resolved = {kind: 'document-range', source: beforeText, start: splice.pos, end: splice.pos + splice.removed.length, record: {}};
    if (!review.byPosture) {
      const will = {..._rapierWillParse(beforeText), space: 'source'};
      if (!_rapierWillCanReview(will, resolved)) return pending('review_unavailable');
    }
    const who = {actor: 'agent', principal: requestMeta.principal || 'mcp', requestId: requestMeta.requestId || review.id,
      transport: requestMeta.transport || 'platform', signal: idleSignal};
    const decision = await _rapierWillReviewOpen(resolved, splice.inserted, caller(who), review.byPosture === true);
    let reviewToken;
    try {
      const restored = decision.review && await _rapierAwaitWillRestore(decision.review, idleSignal);
      if (decision.reason === 'kept') return await decline();
      const approve = decision.allowed && decision.reason === 'allowed' && restored && _rapierSourceText() === beforeText &&
        String(rapier.identity.authority) === review.documentId && Number(rapier.revision.settled) === review.revision;
      if (!approve) return pending(decision.reason || 'review_unavailable');
      const text = globalThis.RapierKernel.transformSplices(beforeText, review.splices);
      if (typeof text !== 'string') return pending('review_document_changed');
      reviewToken = crypto.randomUUID();
      reviews.set(reviewToken, {documentId: review.documentId, revision: review.revision, beforeText, text,
        principal: who.principal, requestId: who.requestId, expires: Date.now() + 30000});
      return await kernel.decideReview({expectedRevision: review.revision, reviewId: review.id, action: 'approve'},
        {actor: 'human', principal: 'local', transport: 'platform', requestId: crypto.randomUUID(), signal: idleSignal, reviewToken});
    } finally {
      if (decision.review) _rapierWillReviewRelease(decision.review, false);
      if (reviewToken) reviews.delete(reviewToken);
      publishEmbedReview();
      void refresh();
    }
  }

  const host = {
    snapshot, commit, reveal, setView, view: viewContext, exportFile, editorContext,
    paintRaster: (raster, options) => globalThis.RapierEmbeddedImages.validatePaintRaster(raster, options),
    presence: value => {
      if (caret.point && !value.pointers?.some(point => point.id === caret.point.id && point.status !== 'expired' && point.expiresAt > Date.now())) caretPut('pointer_cleared');
      const pointers = apps ? (value.pointers || []).filter(point => point.status !== 'shown' || point.id === caret.point?.id) : value.pointers;
      _rapierAgentBarRender({...value, pointers,
        active: Number(value.inFlight || 0) > 0 || pointers?.some(point => point.status === 'shown' && point.expiresAt > Date.now()) === true});
    },
    propose: async request => {
      if (!globalThis.RapierPortableTemplate || !globalThis.RapierPortablePage) return {reason: 'proposal_page_unavailable'};
      const page = globalThis.RapierPortablePage.wrap(globalThis.RapierPortableTemplate(), request.text, request.filename, {base: request.base});
      return {page: URL.createObjectURL(new Blob([page], {type: 'text/html;charset=utf-8'}))};
    },
    compare: showComparison, closeCompare: closeComparison, presentReview: presentKernelReview,
    // An agent's paint strokes, laid by the paint engine (draw/agent-paint.mjs) in the painter's own worker where the page has one (draw/draw.js); absent in the document build, where the kernel refuses them.
    // Draw edits and selective material Undo both carry the kernel's verified semantic change to the open canvas.
    ...(globalThis.RapierDrawAgentPaint ? {
      paint: (strokes, options = {}) => (typeof _rapierDrawPaintAgentStrokes === 'function' ? _rapierDrawPaintAgentStrokes : globalThis.RapierDrawAgentPaint.paintAgentStrokes)(strokes, options.seed, options.target, options),
      paintReplay: (shape, omitIds, options) => (typeof _rapierDrawPaintReplay === 'function' ? _rapierDrawPaintReplay : globalThis.RapierDrawAgentPaint.replayAgentPainting)(shape, omitIds, options),
      paintSheet: paint => globalThis.RapierDrawAgentPaint.agentPaintSheetHolds(paint),
      paintBrushes: () => globalThis.RapierDrawAgentPaint.agentPaintBrushRegistry(),
      paintSample: (shape, point, options) => typeof globalThis._rapierDrawPaintSample === 'function'
        ? globalThis._rapierDrawPaintSample(shape, point, options)
        : globalThis.RapierDrawAgentPaint.sampleAgentPainting(shape, point, options),
    } : {}),
    // notes.list / notes.read: the folder is answered by the Notes shell's own door where the build
    // carries Notes (notes/notes.js sets globalThis.rapierNotesHost at install); the document profile
    // has no such door, so the kernel returns an empty, unavailable listing.
    //
    // Call-time lookup, never a one-time capture: this file is spliced BEFORE notes/notes.js
    // (editor/scripts.json), so the door does not exist at adapter create. Returning null when the door
    // is absent would look like notes_folder_unreadable (retry the folder) instead of an unavailable
    // empty listing (this build has no Notes). undefined is the kernel's "no door" signal; the door
    // itself still returns null when the folder cannot answer.
    notesList: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.list !== 'function') return undefined; return door.list({query: request.query, signal: request?.signal}); },
    notesPropose: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.propose !== 'function') return undefined; return door.propose({text: request.text, title: request.title, of: request.of, by: request.by, base: request.base}, {signal: request?.signal, guard: request.guard}); },
    notesRead: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.read !== 'function') return undefined; return door.read(String(request?.file || ''), {version: request.version, signal: request?.signal}); },
    notesSet: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.set !== 'function') return undefined; return door.set(request, {signal: request?.signal, guard: request.guard}); },
    notesHistory: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.history !== 'function') return undefined; return door.history(request.file, {signal: request?.signal}); },
    notesSync: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.sync !== 'function') return undefined; return door.sync({action: request.action, signal: request?.signal, guard: request.guard}); },
    // Declares the capability decide's own commit branch reads (capability negotiation): this door
    // can present a review inline, at the exact edit, not only through the Compare-panel proposal
    // flow. mcp/worker.mjs does not set this -- it has no inline UI to show, so it stays on the
    // staged 'proposal' review every door can present later.
    inlineReview: true,
    note: text => { _rapierAgentNoteSet(String(text || '')); _rapierAgentNoteShow(); },
    markdown: async input => {
      abort(input);
      if (_rapierSourceText() !== input.text) return {entries: [], complete: false, reason: 'document_changed'};
      // The parser the document is rendered with: the footnote rule and the linkifier are its spec, so a footnote definition is a
      // footnote block here and not a paragraph (the plain constructor would answer otherwise), as the page's find already asks.
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
        return agentCaret(request.pointer.id, request.pointer.words, request, value.target) ? {ok: true} : fail('target_not_visible');
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
        return {...value, selection: state.selection, documentId: state.documentId, documentRevision: state.revision,
          representation: 'source', next: 'document.get_context'};
      }
      return {...value, ...(typeof text === 'string' ? {text, truncated: !!truncated} : {})};
    },
    save: async request => {
      if (hostFence()) return fail(hostFence());
      if (!matches(request) || request.text !== _rapierSourceText()) return fail('document_changed');
      try {
        const receipt = await _rapierSaveDocument({}, caller(request));
        return {...receipt, ok: receipt.verified === true || receipt.outcome === 'unchanged',
          savedDocumentId: receipt.savedDocumentAuthority,
          reason: receipt.reason || (receipt.verified ? '' : receipt.saveStatus) || ''};
      } catch (error) {
        if (error?.name === 'AbortError' || request.signal?.aborted) throw error;
        return fail(error?.code || 'save_failed');
      }
    },
    commitFence: fact => hostFence(fact),
    open: async request => {
      if (!matches(request)) return fail('document_changed');
      if (hostFence()) return fail(hostFence());
      // A note that is the current document is not the cards fence (apply_edits on it is the
      // intended door). Replacing the whole working document is not: Notes autosaves by filename
      // and would write the agent's text over the folder file.
      if (notesFact()?.current) return fail('notes_note_open');
      if (_rapierEmbed.active) return fail('host_owns_document');
      if (rapier.access.readOnly) return fail('document_read_only');
      abort(request);
      // The editor's own Open: unsaved work under it is set aside in the held slot, never asked about.
      const opened = await rapierOpenPlatformPayload({text: request.text, name: request.filename,
        documentAuthority: request.newDocumentId, transient: true},
        {requireWritable: true, documentKind: request.docKind});
      if (!opened) return fail(_rapierIsDirty() ? 'unsaved_changes_kept' : 'document_open_refused');
      return {ok: true, documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled)};
    },
  };


  async function invoke(name, args = {}, request = {}) {
    // The public guide never enters document admission, read grants or the invocation journal.
    if (name === 'rapier.guide') {
      try { validateInput(getTool(name).inputSchema, args); }
      catch (error) { return {outcome: 'invalid', reason: error.message}; }
      return guideResult();
    }
    await ready;
    const tool = getTool(name);
    // Unknown names and schema-invalid arguments are admitted to kernel.invoke so they journal.
    // Admission of a known tool — the person-is-here / dirty-draft checks — still happens here,
    // outside the invocation boundary, because those are this door's facts, not a kernel outcome.
    if (tool && TOOLS.includes(tool)) {
      const reason = admission();
      if (reason) return name === 'document.set_view' || name === 'document.ask_editor'
        ? editorProtocol.editorFailure(reason === 'embed_agent_not_granted' ? reason : 'editor_unavailable') : {outcome: 'refused', reason};
    }
    // resolveCaller is the one caller-resolution and invocation-identity implementation every door
    // shares (agent/door-identity.mjs): invocationKey is always derived from this door's own
    // wire-message id, principal and session -- never the wire's own claim. requestId is that
    // wire-message id, minted or supplied exactly once per real call (the WebMCP registration
    // wrapper and the platform-host bridge each do this before invoke() is ever reached, never
    // re-derived per processing attempt here), so the same logical message always derives the same
    // key and a deliberate second call, with a fresh id, always derives a different one.
    const resolved = resolveCaller({actor: request.actor, principal: request.principal, transport: request.transport,
      requestId: request.requestId || crypto.randomUUID(), invocationKey: request.invocationKey, session: doorSession},
      {actor: 'agent', principal: 'platform', transport: 'platform'});
    if (resolved.invocationKeyRejected) {
      // The wire tried to choose its own invocation identity -- never trusted, and not silently
      // dropped either: refused through the kernel's own invalid path so the refusal is recorded
      // in the same invocation journal a legitimate retry answers from. No invocationKey is
      // forwarded; participant() mints its own for bookkeeping.
      return kernel.invoke(name, args, {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
        requestId: resolved.requestId, rejectedInvocationKey: true, signal: request.signal || idleSignal});
    }
    const who = {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
      hostAgent: doorNames.get(resolved.transport === 'webmcp' ? 'webmcp' : 'platform') || '',
      requestId: resolved.requestId, invocationKey: resolved.invocationKey, signal: request.signal || idleSignal,
      ...(typeof request.notesGuard === 'function' ? {notesGuard: request.notesGuard} : {})};
    // measurementsRequired is the fast path where the need is knowable from the op alone:
    // get_outline on a non-Markdown document always wants structure, so this door hands world the
    // fact before ever asking, and the common case costs no round trip. Anything not knowable up
    // front -- a structural find past its first page, a review this call turns out to need -- still
    // resolves below, from the pending outcome itself.
    const eager = measurementsRequired(name, args);
    const beforeText = _rapierSourceText();
    const run = async () => {
      let world, visualFact, editorObservation;
      if (eager?.structure?.mode === 'outline') {
        const fact = await resolveStructureFact({mode: 'outline', filename: String(rapier.document.filename)});
        if (fact) world = {structure: fact};
      }
      let result = await kernel.invoke(name, args, world ? {...who, world} : who);
      // pending is a complete outcome, not a suspension: this loop is the caller invoking again
      // with the fact in world and continues set, not the kernel waiting on anything -- each
      // iteration is its own fresh decide().
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
            visualFact = await inspectVisual({...result.pending.requirements, signal: who.signal});
            result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {visual: visualFact}});
            continue;
          }
          const fact = await resolveStructureFact(result.pending.requirements);
          if (!fact) break;
          result = await kernel.invoke(name, args, {...who, continues: result.pending.requestId, world: {structure: fact}});
          continue;
        }
        if (result.pending?.kind === 'human-review') {
          const review = kernel.collaboration().review;
          if (review?.id !== result.pending.proposalId || review.kind !== 'inline') break;
          result = await driveInlineReview(review, who);
          continue;
        }
        break;
      }
      // The receipt's structural parse check: decide never awaits a host for it --
      // structureReceipt reads only context.world, matched to the exact before/after digest pair,
      // and reports not_checked otherwise, because the after-text does not exist until commit has
      // already decided the transition (gating an applied outcome on a round trip would be a
      // half-applied state). This door runs the same analysis -- strictly after the fact, on the
      // outcome it is about to return, never inside decide -- and marks the result an
      // adapter-attested fact rather than routing it back through a second invocation.
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
          ...(result.observation.sourceRange ? {sourceRange: result.observation.sourceRange} : {})};
        // A read receipt may replay after its pixels were released. Re-observe that exact source
        // and target; never return metadata alone as though an image had reached the caller.
        visualFact ||= await inspectVisual({...requirements, signal: who.signal});
        const validated = globalThis.RapierAgentVisual.visualResult(requirements, visualFact);
        if (validated.outcome !== 'ok') return {...result, ...validated, observation: undefined};
        return {...result, ...validated, content: [{type: 'image', mimeType: 'image/png', data: visualFact.image.data}]};
      }
      if (result.receipt?.status === 'done' && editorProtocol.EDITOR_EXPORT_TYPES[args.action]) {
        const record = editorRequests.get(result.receipt.id);
        const file = record?.fact?.file;
        if (!file) return {...editorProtocol.editorFailure('export_expired')};
        record.url ||= URL.createObjectURL(new Blob([editorProtocol.editorFile(record.request, file, MAX_EXPORT_BYTES).bytes], {type: file.mimeType}));
        return {...result, content: [{type: 'resource_link', name: file.name, mimeType: file.mimeType, uri: record.url}]};
      }
      return result;
    };
    const result = await (who.actor === 'agent'
      ? _rapierAgentInvocationTracked(name, args, run, who.requestId) : run());
    if (name === 'document.apply_edits' && ['applied', 'rebased'].includes(result.outcome)) {
      _rapierAgentNoteSet(typeof args.note === 'string' ? args.note : '');
      _rapierAgentNoteShow();
      try { agentCaret(result.changeId, (typeof args.agent === 'string' && args.agent.trim()) || who.hostAgent || doorName); } catch (_) {}
    }
    // Any call can be the first thing to relocate a pending review's changes through
    // document.get_context's own collaboration() read -- a stale change from a human edit
    // elsewhere becomes visible here, not only on the next agent-initiated decision.
    _rapierReviewSpansRefresh();
    publishEmbedReview();
    return result;
  }

  // Draw's own Undo has already chosen this exact history entry before waiting for Paint.
  // Its journal row supplies the caller identity, including the existing unverified local
  // owner of a carried Apps transaction. No tool arguments can select a different owner.
  async function undoDrawingChange(entry, session) {
    await ready;
    const drawing = typeof _rapierDrawState === 'object' ? _rapierDrawState : null;
    if (!drawing?.open || drawing.session !== session || !drawing.undoStack.includes(entry)) return false;
    const id = entry?.agent?.transactionId;
    const row = id && current().journal.find(row => row.id === id);
    if (!row || row.actor !== 'agent' || row.operation !== 'document.draw') return false;
    const result = await invoke('document.undo_agent_change', {change_id: id},
      {actor: row.actor, principal: row.principal, transport: row.transport});
    return result.outcome === 'applied';
  }

  function status() {
    return {available: registrations.size > 0, ready: readyDone,
      reason: apps ? 'mcp_apps_host' : admission() || (registrationOwner ? '' : 'webmcp_unavailable'),
      registered: [...registrations.keys()], failures: Object.fromEntries(failures)};
  }

  function retire() {
    if (editorCard && registrations.size) cancelEditorRequest(editorCard.request.id);
    const retired = [...registrations.values()];
    registrations.clear(); failures.clear(); registrationOwner = null; registrationExposure = '';
    retireView('webmcp');
    // Abort listeners may install a new owner synchronously; only retire this snapshot.
    for (const entry of retired) entry.abort();
  }

  async function register() {
    let owner = null;
    try { owner = document.modelContext; } catch (_) {}
    if (apps || admission() || location.protocol === 'file:' || !owner?.registerTool) { retire(); return; }
    // The host's origin, as the browser authenticated it on connect (docs/embed-contract.md section 1).
    const exposure = _rapierEmbed.active && _rapierEmbed.hostOrigin && _rapierEmbed.hostOrigin !== location.origin
      ? String(_rapierEmbed.hostOrigin) : '';
    if (registrationOwner !== owner || registrationExposure !== exposure) retire();
    registrationOwner = owner; registrationExposure = exposure;
    // WebMCP's own handshake fact, where the browser exposes one: the client that opened this
    // session, named once (nameAtDoor). Read off the door itself, never off a tool call's arguments.
    nameAtDoor(owner.clientInfo?.name, 'webmcp');
    for (const tool of PAGE_TOOLS) {
      if (registrations.has(tool.name) || failures.has(tool.name)) continue;
      const controller = new AbortController();
      // Own the callback before handing it to the host: registration itself can yield
      // or re-enter, and retire() must reach calls made before its acknowledgement.
      registrations.set(tool.name, controller);
      try {
        await owner.registerTool({name: tool.name, title: tool.title, description: tool.description,
          inputSchema: tool.inputSchema, annotations: annotations(tool.effect, 'webmcp'),
          execute: async (args, options = {}) => {
            if (controller.signal.aborted || owner !== registrationOwner || admission())
              return {outcome: 'refused', reason: 'host_not_connected'};
            // An admitted call belongs to this registration as well as to its caller.
            // Retiring the page must cancel a read or queued write already in flight,
            // not merely reject the next call through the old callback.
            const flight = new AbortController(), cancel = () => flight.abort();
            const signals = [controller.signal, options.signal].filter(Boolean);
            for (const signal of signals) signal.addEventListener('abort', cancel, {once: true});
            if (signals.some(signal => signal.aborted)) cancel();
            try {
              return await invoke(tool.name, args, {actor: 'agent', principal: 'webmcp', transport: 'webmcp',
                requestId: crypto.randomUUID(), signal: tool.name === 'document.set_view' ? AbortSignal.any(signals) : flight.signal});
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
    if (refreshing) { refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      // Passive: a person's typing burst is never cut into a transaction for this read; the burst's own checkpoint refreshes again.
      const read = await _rapierWithSettledExternalDocument(current, {quiet: true, passive: true});
      if (!read.settled) return status();
      const value = read.value;
      if (!kernel) {
        // Negotiations and retry identities survive page recovery. Building the kernel from
        // document identity/text/revision alone would drop pending decisions and allow an old write
        // to execute again. `recovery`, when the caller has one, is the kernel slice the editor's
        // own existing recovery store read
        // back alongside the document (editor/engine.js's `rapierTryRestore`, handed down through
        // the one boot-ready call this function is always reached from first, `_rapierWebMcpSync`)
        // -- never the document text itself, which that same store already owns and just finished
        // restoring into `value` above; only this call's own `_rapierBootstrapRuntime.complete`
        // transition ever lets a `refresh()` reach this branch at all, so an earlier, recovery-less
        // call (this module's own pre-boot `pageshow`/microtask refreshes) never builds the kernel
        // first and strands it. A restore whose own recorded documentId+revision no longer match
        // this live document (an explicit replacement, a stale or foreign record) is discarded
        // outright, never partially applied.
        const restored = recovery || carriedRecovery || null;
        carriedRecovery = null;
        const inherits = restored && restored.documentId === value.documentId && restored.revision === value.revision;
        const {invocationJournal: restoredJournal, ...restoredState} = restored || {};
        // The posture toggle is live UI state, not persisted with the document -- a fresh page
        // always boots it back to 'free'. Left alone, that reads to kernel.reconcile() below as a
        // person having just turned ASK off, which is exactly the policy change that invalidates a
        // pending review (agent/kernel.mjs's own `invalidateReview('policy_changed')`), destroying
        // the very review this restore exists to keep. So a restore that inherits also puts the
        // toggle itself back the way the restored review's own posture had it, before reconcile ever
        // sees a mismatch that was never a person's decision.
        if (inherits && restoredState.proposalBase) {
          proposalBaseRecord = {authority: value.documentId, base: globalThis.RapierLedgerCarried.readBase(restoredState.proposalBase)};
          value.proposalBase = proposalBaseRecord.base;
        }
        if (inherits && _RAPIER_POSTURES.includes(restoredState.posture)) {
          _rapierPostureSet(restoredState.posture); value.posture = restoredState.posture;
        }
        // decideKernelReview pins a decision's reviewToken to the review's own originating
        // principal/requestId (kernel.mjs `participant(review, mintId)`, spread onto `state.review`
        // at stageReview time) so host.commit()'s own check never refuses a decision this door's own
        // preview already approved -- but it learns that identity from `reviewIdentities`
        // (presentKernelReview, at staging), an in-memory cache a restart empties same as it empties
        // everything else this door never intended to survive. The restored review already carries
        // both fields itself (never stripped, only its own `text`-shadowing document content is);
        // seeding the cache from them, once, here, is cheaper and no less correct than teaching the
        // cache its own restore path.
        if (inherits && restoredState.review?.status === 'pending' && restoredState.review.id) {
          reviewIdentities.set(restoredState.review.id, {principal: restoredState.review.principal, requestId: restoredState.review.requestId});
          if (restoredState.review.kind !== 'proposal') {
            const reviewId = restoredState.review.id;
            ready.then(() => {
              if (visible() && kernel?.collaboration()?.review?.id === reviewId) return representPendingReview();
            }).catch(() => {});
          }
        }
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
          value.text !== prior.text || value.filename !== prior.filename || value.docKind !== prior.docKind)) {
        const events = value.documentId === prior.documentId
          ? value.journal.filter(row => row.revision > prior.revision) : [];
        if (!events.length) events.push({actor: replacing ? 'system' : 'human', principal: replacing ? 'mcp' : 'local'});
        for (const entry of events) for (const notify of subscribers) {
          try { notify({actor: entry.actor, principal: entry.principal, snapshot: value}); } catch (_) {}
        }
        if (value.documentId !== prior.documentId || !pointerCurrent()) retainedPointer = null;
        if (events.some(entry => entry.actor === 'human') && Date.now() - lastPointerAt < 1500) rememberPointer();
        contextChanged('document');
      }
      await register();
      _rapierPostureRender(); _rapierAgentBarRender(); _rapierReviewSpansRefresh();
      publishEmbedReview();
      return status();
    })().catch(error => ({...status(), reason: error?.code || 'refresh_failed'})).finally(() => {
      refreshing = null;
      if (refreshAgain) { refreshAgain = false; queueMicrotask(() => { void refresh(); }); }
    });
    return refreshing;
  }

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
    const result = await showComparison({documentId: value.documentId, revision: Number(rapier.revision.settled),
      compareId: compare.id,
      currentText: typeof compare.baseline === 'string' ? compare.baseline : _rapierSourceText(),
      incomingText, incomingName: compare.name || 'comparison.md',
      principal: 'mcp', actor: 'agent', transport: 'platform'});
    if (result.ok) remoteComparison = compare.id;
    return {...result, visible: result.ok === true};
  }

  // The agent's caret: once an edit has landed, a thin caret with the agent's name glides from where it last wrote to
  // the end of this change, rests, and fades. It traces committed work only: nothing waits for it, a target off screen
  // or under Draw or the Notes cards shows nothing (the page never scrolls to animate), reduced motion places it at
  // once, and scrolling, hiding or leaving the page puts it away. One caret, one change at a time; the same change
  // never traces twice.
  const caret = {el: null, from: null, frame: 0, rest: 0, last: null, point: null, pointResult: null};
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
    target.addEventListener(type, () => { if (caret.el) caretPut(); }, {capture: true, passive: true});
  }
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
        const occurrence = span && _rapierScanMarkdownImages(bound.raw).find(row => span.start + row.start === request.start);
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
            // The words stand in the gap above the block that holds the place (place() runs the leader down from them), never over a line of it.
            home = (resolved.node.nodeType === 1 ? resolved.node : resolved.node.parentElement)?.closest('[data-block-id]') || null;
          }
        }
      }
      if (!box) return null;
      const height = Math.max(14, Math.min(40, box.height || 18));
      const point = {x: box.left, y: box.top, height, top: home ? home.getBoundingClientRect().top : box.top};
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
      const point = {x: text ? box.right : box.left, y: box.top + (box.height - height) / 2, height, top: host.getBoundingClientRect().top};
      return point.y >= 0 && point.y + height <= window.innerHeight && point.x >= 0 && point.x <= window.innerWidth ? point : null;
    }
    return null;
  }
  function agentCaret(change, label, request, element) {
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
      // The bar stands at the exact place; the words sit in the gap above the block (--lead, the leader's length) and slide along the
      // line to stay inside the page's 16 px gutters (--tag-x); over the open canvas the bar rides above the Draw surface.
      style.textContent = '.rapier-agent-caret{position:fixed;left:0;top:0;z-index:150;pointer-events:none;width:2px;background:var(--color-accent,#12A594);transition:opacity .4s}' +
        '.rapier-agent-caret::before{content:"";position:absolute;left:0;bottom:100%;width:1px;height:var(--lead,0px);background:inherit;opacity:.55}' +
        '.rapier-agent-caret span{position:absolute;left:var(--tag-x,0px);bottom:calc(100% + var(--lead,0px));box-sizing:border-box;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;padding:2px 4px;white-space:nowrap;background:var(--color-accent,#12A594);color:#fff;font:700 9px/1.2 Geist,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}' +
        '.rapier-agent-caret[data-fading]{opacity:0}body.rapier-draw-open .rapier-agent-caret{z-index:905}@media (prefers-reduced-motion:reduce){.rapier-agent-caret{transition:none}}';
      document.head.append(style);
    }
    if (!caret.el) {
      caret.el = document.createElement('div'); caret.el.className = 'rapier-agent-caret'; caret.el.setAttribute('aria-hidden', 'true');
      caret.el.append(document.createElement('span'));
      document.body.append(caret.el);
    }
    caret.el.removeAttribute('data-fading');
    caret.el.firstChild.textContent = String(label || 'agent').slice(0, request?.pointer ? 240 : 24);
    caret.el.style.height = target.height + 'px';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const motion = globalThis.RapierCursorMotion.createCursorMotion(caret.from || target, target, 'arc', {reducedMotion: reduced || !caret.from});
    // The words keep to the gap above the target's block (a block whose top has scrolled away keeps them just above the bar) and
    // to the page's gutters: near the right edge they slide left along the line instead of running off the screen.
    const place = point => {
      const tag = caret.el.firstChild;
      caret.el.style.transform = 'translate(' + point.x + 'px,' + point.y + 'px)';
      caret.el.style.setProperty('--lead', Math.round(Math.max(0, Math.min(point.y - target.top, point.y - tag.offsetHeight - 2))) + 'px');
      caret.el.style.setProperty('--tag-x', Math.round(Math.max(16, Math.min(point.x, window.innerWidth - 16 - tag.offsetWidth)) - point.x) + 'px');
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

  // The hosted rows that replay back to this page's text, oldest first: the rows that carry source, and with `whole` the
  // metadata-only revisions between them too. Null when the retained history does not reach the text.
  function remoteJournal(value, before, whole) {
    if (!Array.isArray(value.journal) || !value.journal.length || value.text === before?.text) return null;
    const remote = []; let text = value.text, matched = !before;
    for (let i = value.journal.length - 1; i >= 0; i--) {
      const row = value.journal[i];
      if (!row || !Array.isArray(row.splices)) throw new Error('Invalid remote history');
      if (!row.splices.length) { if (whole) remote.unshift(row); continue; }
      text = RapierLedger._rapierTransformSplices(text, row.splices, true);
      if (text === null) throw new Error('Remote history does not replay');
      remote.unshift(row);
      if (before && text === before.text) { matched = true; break; }
    }
    return matched ? remote : null;
  }

  // A server revision is not a local revision. Match an exact replay suffix, then mint local
  // revision/root links while retaining every observed writer. Missing older events stay unknown.
  function remoteLedger(value, before, mapped) {
    if (!Array.isArray(value.journal) || !value.journal.length || value.text === before?.text) return null;
    const identity = id => typeof id === 'string' && id.length > 0 && id.length <= 256;
    const incoming = new Map(); let prior = null;
    for (const row of value.journal) {
      if (!row || !identity(row.id) || incoming.has(row.id) || !Array.isArray(row.splices) ||
          !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 0 || !Number.isSafeInteger(row.revision) ||
          row.revision !== row.baseRevision + 1)
        throw new Error('Invalid remote history');
      if (prior && row.baseRevision !== prior.revision) throw new Error('Remote history is not continuous');
      incoming.set(row.id, row); prior = row;
    }
    const remote = remoteJournal(value, before, true);
    if (!remote) return null; // retained remote history does not reach this local checkpoint: the text is taken without a ledger
    if (!before && (typeof value.documentId !== 'string' || !value.documentId)) throw new Error('Remote document is missing');
    const local = before ? _rapierLedgerCapture() : {records: [], documentAuthority: value.documentId,
      head: {root: RapierLedger.textRoot(remote.reduceRight((text, row) => RapierLedger._rapierTransformSplices(text, row.splices, true), value.text)), revision: 0}};
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
    // A remote row may occupy several local records. Only its complete retained splice sequence
    // proves its identity and both revision boundaries; a trimmed fragment proves neither.
    for (const [id, parts] of retained) {
      const row = incoming.get(id), splices = parts.flatMap(part => part.splices || []);
      if (splices.length !== row.splices.length || !splices.every((splice, index) => {
        const other = row.splices[index];
        return splice.pos === other.pos && splice.removed === other.removed && splice.inserted === other.inserted;
      }) || parts.some((part, index) => index && part.transaction.baseRevision !== parts[index - 1].transaction.revision)) continue;
      sources.set(id, parts.map(part => part.transaction.id));
      boundary(row.baseRevision, parts[0].transaction.baseRevision);
      boundary(row.revision, parts.at(-1).transaction.revision);
    }
    boundary(remote[0].baseRevision, local.head.revision);
    // Metadata-only server revisions share their neighbouring source checkpoint.
    for (const rows of [value.journal, value.journal.slice().reverse()]) for (const row of rows) if (!row.splices.length) {
      if (revisions.has(row.baseRevision)) boundary(row.revision, revisions.get(row.baseRevision));
      else if (revisions.has(row.revision)) boundary(row.baseRevision, revisions.get(row.revision));
    }
    let root = local.head.root, revision = local.head.revision;
    for (const row of remote) {
      boundary(row.baseRevision, revision);
      const contribution = {};
      if (row.contribution) {
        if (typeof row.contribution !== 'string' || !Number.isSafeInteger(row.contributionBaseRevision) ||
            row.contributionBaseRevision < 0 || !revisions.has(row.contributionBaseRevision))
          throw new Error('Remote contribution history is incomplete');
        contribution.contribution = row.contribution;
        contribution.contributionBaseRevision = revisions.get(row.contributionBaseRevision);
      }
      const originIds = row.sourceTransactionIds ?? (row.sourceTransactionId ? [row.sourceTransactionId] : []);
      if (!Array.isArray(originIds) || originIds.length > incoming.size || new Set(originIds).size !== originIds.length ||
          originIds.some(id => !identity(id) || !sources.has(id)) ||
          (row.sourceTransactionId && (!identity(row.sourceTransactionId) || !originIds.includes(row.sourceTransactionId))))
        throw new Error('Remote Undo history is incomplete');
      const sourceTransactionIds = originIds.flatMap(id => sources.get(id));
      const single = row.sourceTransactionId && sources.get(row.sourceTransactionId);
      const sourceTransactionId = single?.length === 1 ? single[0] : null;
      const actor = {kind: row.actor, id: row.actor === 'agent'
        ? RapierLedger.agentActorId(row.transport || 'mcp', row.hostAgent ? {name: row.hostAgent} : null)
        : row.actor === 'human' ? 'local' : row.principal || 'mcp'};
      // A hosted commit can join many local checkpoints. Carry its ordered source
      // through bounded ledger records, each linked by its own local revision.
      const parts = [];
      for (let offset = 0; offset < row.splices.length; offset += 64) {
        const splices = row.splices.slice(offset, offset + 64);
        const beforeHash = root, baseRevision = revision++;
        for (const splice of splices) root = RapierLedger.rootAfter(root, splice);
        const id = local.documentAuthority.slice(0, 48) + ':remote:' + revision.toString(36);
        parts.push(id);
        records.push({beforeHash, afterHash: root, splices, transaction: {
          id, remoteTransactionId: row.id,
          documentAuthority: local.documentAuthority, baseRevision, revision, actor, transport: 'platform',
          operation: row.operation || 'document.remote_edit', requestId: null, sourceTransactionId, ...contribution,
          ...(sourceTransactionIds.length ? {sourceTransactionIds: sourceTransactionIds.slice()} : {}),
          parent: records.at(-1)?.transaction.id ?? null, reverts: null, reapplies: null,
          createdAt: row.createdAt ?? 0, affectedBlockIds: [],
        }});
        if (mapped) mapped(row, id);
      }
      if (parts.length) sources.set(row.id, parts);
      boundary(row.revision, revision);
    }
    return RapierLedger.exportLedger({text: value.text, records, documentAuthority: local.documentAuthority,
      root, revision, complete: false});
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

  async function replaceDocument(value, expected = {}) {
    await ready;
    if (composing() || _rapierMutationBarrierActive() || Date.now() - lastInputAt < 900 ||
        globalThis.RapierImageFlow?.status().moving === true) return fail('human_edit_in_progress', 'yielded');
    const before = await snapshot();
    if (typeof value?.text !== 'string' || typeof value.documentId !== 'string') return fail('snapshot_invalid', 'invalid');
    if (expected.expectedDocumentId !== before.documentId || expected.expectedRevision !== before.revision ||
        expected.expectedText !== before.text) return fail('document_changed', 'conflict');
    if (composing() || _rapierMutationBarrierActive() || Date.now() - lastInputAt < 900 ||
        globalThis.RapierImageFlow?.status().moving === true) return fail('human_edit_in_progress', 'yielded');
    const admitted = _rapierAdmitAgentText(value.filename, value.text);
    if (admitted) return fail(admitted, 'invalid');
    if (remoteReview && (value.collaboration?.review?.id !== remoteReview.review.id ||
        value.collaboration?.review?.status !== 'pending')) {
      await dismissReview();
      if (!expectedCurrent(expected)) return fail('document_changed', 'conflict');
    }
    replacing = true;
    // The agent change this projection brought into the page, if any: its transaction, for the caret.
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
          documentKind: value.docKind, expectedMutationStamp: stamp, returnReceipt: true, appsSnapshot: true, carriedLedger});
        if (!loaded) return fail('document_changed', 'conflict');
        sourceApplied = true;
      } else if (value.text !== before.text) {
        const row = _rapierPrefixSuffixDiff(before.text, value.text);
        let carriedLedger, journal, plan;
        const mapped = new Map();
        try {
          journal = remoteJournal(value, before);
          let source = before.text;
          for (const entry of journal || []) {
            const after = RapierLedger._rapierTransformSplices(source, entry.splices);
            if (entry.drawingPatch && !globalThis.RapierKernel.verifyDrawingPatch(entry.drawingPatch, source, after))
              return fail('snapshot_drawing_invalid', 'invalid');
            source = after;
          }
          plan = journal ? remoteDrawingPlan(journal) : {fence: null, entries: new Set()};
          if (plan.reason) return fail(plan.reason, 'yielded');
          carriedLedger = remoteLedger(value, before, (entry, id) => mapped.set(entry, id));
        }
        catch (_) { return fail('snapshot_history_invalid', 'invalid'); }
        const tip = rapier.undo.ledger.at(-1)?.transaction?.id;
        const committed = await commit({documentId: before.documentId, baseRevision: before.revision,
          beforeText: before.text, text: value.text, splices: journal ? journal.flatMap(entry => entry.splices) : [row], actor: 'system', principal: 'mcp',
          transport: 'platform', operation: 'document.remote_edit', label: 'Remote edit', carriedLedger, fence: plan.fence});
        if (!committed.ok) return committed;
        for (const entry of journal || []) if (entry.drawingPatch) {
          drawingReceipts.push(projectRemoteDrawing(entry.drawingPatch, {
            transactionId: mapped.get(entry) || committed.transactionId, remoteTransactionId: entry.id,
            name: entry.hostAgent || doorName,
            ...(plan.entries.has(entry) ? {committedReference: plan.committedReference, committedPosition: plan.committedPosition} : {}),
          }));
        }
        // Only rows after the page's former tip arrived with this projection; an older agent row is not its news.
        const rows = rapier.undo.ledger;
        landed = rows.slice(rows.findLastIndex(entry => entry.transaction?.id === tip) + 1)
          .findLast(entry => entry.transaction?.actor?.kind === 'agent')?.transaction || null;
        sourceApplied = true;
      }
      if (value.filename !== String(rapier.document.filename) || value.docKind !== rapier.document.docKind) {
        if (_rapierSourceText() !== value.text || String(rapier.identity.authority) !== value.documentId)
          return {...fail('document_changed', 'conflict'), sourceApplied};
        const loaded = await rapierLoad(value.text, value.filename, {sameDocument: true, preserveHistory: true,
          documentKind: value.docKind, expectedMutationStamp: _rapierMutationStamp(), appsSnapshot: true});
        if (!loaded) return {...fail('document_changed', 'conflict'), sourceApplied};
      }
      const exact = _rapierSourceText() === value.text && String(rapier.identity.authority) === value.documentId;
      if (exact) {
        proposalBaseRecord = value.proposalBase ? {authority: value.documentId, base: globalThis.RapierLedgerCarried.readBase(value.proposalBase), text: value.text, review: value.collaboration?.review} : null;
        projectPolicy(value);
        if (apps) host.presence(value.collaboration?.agentPresence || {active: false, inFlight: 0, pointers: []});
      }
      const comparison = !exact ? {...fail('document_changed'), visible: false} : remoteReview
        ? {ok: true, visible: true, review: remoteReview.review.id} : await syncComparison(value);
      await refresh();
      // The same caret as a local agent edit: the name is the one the ledger row carries ("door/name"), else the door's.
      if (landed && exact) {
        const named = String(landed.actor.id), slash = named.indexOf('/');
        try { agentCaret(landed.id, (slash > 0 && named.slice(slash + 1)) || doorName); } catch (_) {}
      }
      return {ok: true, outcome: 'applied', comparison, snapshot: await snapshot(), ...(drawingReceipts.length ? {drawingReceipts} : {})};
    } catch (error) {
      if (sourceApplied) return {...fail('snapshot_apply_failed', 'conflict'), sourceApplied};
      throw error;
    } finally { replacing = false; }
  }

  async function acknowledge(value) {
    const local = await snapshot();
    if (local.documentId !== value.documentId || local.text !== value.text ||
        local.filename !== value.filename || local.docKind !== value.docKind ||
        local.documentId !== String(rapier.identity.authority) ||
        local.generation !== Number(rapier.revision.generation) ||
        local.revision !== Number(rapier.revision.settled)) return fail('document_changed', 'conflict');
    rapier.revision.savedGeneration = local.generation;
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

  // The name at the door. MCP hands a clientInfo.name over when the session opens, and the other
  // doors have their own; Rapier shows the name it was GIVEN AT THE DOOR, one source, for the
  // whole session. Deliberately not a per-call argument and not a field in a tool's own schema: a
  // name that can be set differently on every call is a costume, not a name. So this is
  // first-write-wins for the life of the page -- a second handshake claiming something else
  // changes nothing -- and it is a host claim carried in the ledger as well as a drawing label.
  // Rapier does not vouch for it (agent/door-identity.mjs owns what IS authenticated: principal,
  // invocation, presence, origin). If no door gave a name this stays empty and the nib draws
  // without a tag; never an invented one.
  function nameAtDoor(given, door = 'platform') {
    if (doorNames.has(door)) return doorNames.get(door);
    if (typeof given !== 'string' || !given.trim()) return '';
    try { RapierLedger.agentActorId(door, {name: given}); } catch (_) { return ''; }
    doorNames.set(door, given);
    if (!doorName) doorName = given;
    return given;
  }

  // The last call the hosted door took, as document.sync reports it (agent/apps.js): the agent is present, and the acorn shows when the call read
  // structure. The page marks it as it marks a call of its own door, through the same tracked invocation and the same lease.
  let remoteCall = '';
  function noteRemoteCall(report) {
    if (!report || typeof report.id !== 'string' || !report.id || report.id === remoteCall || typeof report.operation !== 'string' || !(report.ago >= 0)) return;
    remoteCall = report.id;
    if (report.ago >= _RAPIER_AGENT_CONNECTED_MS) return;
    if (report.ago < _RAPIER_ACORN_LINGER_MS) {
      void _rapierAgentInvocationTracked(report.operation, typeof report.kind === 'string' ? {kind: report.kind} : {}, () => new Promise(done => setTimeout(done, 1600)), report.id);
      return;
    }
    _rapierAgentBarMarkConnected({documentAuthority: String(rapier.identity.authority || ''), documentEpoch: Number(rapier.identity.epoch || 0)});
    _rapierAgentBar.connectedUntil -= report.ago;
    _rapierAgentBarRender();
  }

  // Account enrollment supplies the keys, grants and encrypted receipt store at this
  // endpoint. The private transport calls the same page door and pins this Notes folder.
  async function ownedNotesAdapter(options = {}) {
    await ready;
    if (typeof globalThis.RapierOwnedNotesAdapter?.createOwnedNotesAdapter !== 'function' ||
        typeof _rapierNotesReady !== 'function') throw Object.assign(new Error('notes_not_configured'), {code: 'notes_not_configured'});
    await _rapierNotesReady();
    await _rapierNotesStore.kind();
    const door = globalThis.rapierNotesHost, folder = _rapierNotesStore.folder, bytes = _rapierNotesStore.bytes;
    const native = globalThis.RapierPlatform?.host?.notesStore, current = options.isCurrent || (() => true);
    const endpoint = globalThis.RapierOwnedNotesAdapter.createOwnedNotesAdapter({...options,
      isCurrent: (scope, actor) => !!folder && globalThis.rapierNotesHost === door && _rapierNotesStore.folder === folder &&
        _rapierNotesStore.bytes === bytes && globalThis.RapierPlatform?.host?.notesStore === native && current(scope, actor) === true,
      invoke: (name, args, request) => invoke(name, args, {actor: 'agent', principal: request.principal,
        transport: request.transport, requestId: request.requestId, signal: request.signal, notesGuard: request.notesGuard}),
    });
    const connected = Object.freeze({receive: endpoint.receive, captureCheckpoint: endpoint.captureCheckpoint, lock: () => {
      ownedNotesEndpoints.delete(connected); return endpoint.lock();
    }});
    ownedNotesEndpoints.add(connected);
    return connected;
  }

  // Whole-store ciphertext has a separate endpoint-only key. Capture and restore use
  // the same enrolled folder as tool calls; transport bindings cannot substitute it.
  async function ownedNotesCheckpoint(options = {}) {
    await ready;
    if (typeof globalThis.RapierOwnedNotesCheckpoint?.createOwnedNotesCheckpoint !== 'function' ||
        typeof _rapierNotesReady !== 'function') throw Object.assign(new Error('notes_not_configured'), {code: 'notes_not_configured'});
    await _rapierNotesReady();
    await _rapierNotesStore.kind();
    const door = globalThis.rapierNotesHost, folder = _rapierNotesStore.folder, bytes = _rapierNotesStore.bytes;
    const native = globalThis.RapierPlatform?.host?.notesStore, current = options.isCurrent || (() => true);
    const endpoint = globalThis.RapierOwnedNotesCheckpoint.createOwnedNotesCheckpoint({...options, store: _rapierNotesStore,
      isCurrent: async () => {
        const same = () => !!folder && globalThis.rapierNotesHost === door && _rapierNotesStore.folder === folder &&
          _rapierNotesStore.bytes === bytes && globalThis.RapierPlatform?.host?.notesStore === native;
        return same() && await current() === true && same();
      },
    });
    const connected = Object.freeze({capture: endpoint.capture, publish: endpoint.publish,
      restore: input => endpoint.restore({...input, folder}), lock: () => {
        ownedNotesEndpoints.delete(connected); return endpoint.lock();
      }});
    ownedNotesEndpoints.add(connected);
    return connected;
  }

  // A sheet in the house dialog's own form for the Apps page: the confirm overlay's markup (the scrim, the pop, the title row, the
  // words, the rows of boxes), opened and closed through openDialog and closeDialog so it owns keys and focus as every house dialog
  // does. `body` is read in order: a node is placed as it is, an array of buttons becomes a row of house boxes, each button carrying
  // its role in `data-pop` (affirm unless set); the last row is the pop's (_rapierPopArrange puts the cancel or the destructive box
  // at the bottom). `onEscape` runs on Escape when given; close() takes the sheet down and runs onClose once.
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

  globalThis.RapierAgentBrowser = Object.freeze({ready, snapshot, invoke, refresh, status, undoDrawingChange, ownedNotesAdapter, ownedNotesCheckpoint,
    sheet: houseSheet,
    presence: host.presence,
    trackInvocation: (operation, input, run, invocationId) => _rapierAgentInvocationTracked(operation, input, run, invocationId),
    pointState: () => caret.point ? {...caret.point} : null,
    clearPoint: (id, reason = 'view_changed') => { if (!id || caret.point?.id === id) caretPut(reason); },
    nameAtDoor, noteRemoteCall, doorName: () => doorName, stageCarriedProposal, proposalExport,
    replaceDocument, acknowledge, compareSelection, humanContext, contextChanged, setPolicy, inspectVisual, exportDocument,
    resolveEditorRequest, cancelEditorRequest, editorContext,
    policyReady: () => policyAvailable, applyView, presentReview, dismissReview, presentationChanged, readFile, notify,
    pendingReviewSnapshot, reviewSnapshot, decideReviewChange, representPendingReview, agentRecoveryState,
    publishEmbedReview,
    reviewDecidingChange: id => decidingChanges.has(id),
    acceptImport: _rapierAcceptDocumentImport,
    importCurrent: result => !result.importStamp || _rapierMutationStampIsCurrent(result.importStamp),
    reconcile: (value, ctx) => kernel.reconcile(value, ctx),
    subscribeContext: notify => { contextSubscribers.add(notify); return () => contextSubscribers.delete(notify); },
    subscribe: notify => { subscribers.add(notify); return () => subscribers.delete(notify); }});
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionend']) {
    document.addEventListener(type, humanActivity, {capture: true, passive: true});
  }
  document.addEventListener('visibilitychange', () => {
    if (!visible()) { retainedPointer = null; viewFlight?.abort(); visualFlight?.abort(); if (editorCard) cancelEditorRequest(editorCard.request.id); }
    else if (!apps && kernel?.collaboration()?.review?.status === 'pending' && kernel.collaboration().review.kind !== 'proposal') {
      void representPendingReview().catch(() => {});
    }
    contextChanged('visibility');
  });
  window.addEventListener('blur', () => { contextChanged('blur'); });
  window.addEventListener('focus', () => { contextChanged('focus'); });
  window.addEventListener('pagehide', () => { retireView(); visualFlight?.abort(); if (editorCard) cancelEditorRequest(editorCard.request.id); retire(); for (const endpoint of ownedNotesEndpoints) void endpoint.lock(); });
  window.addEventListener('pageshow', () => { void refresh(); });
  queueMicrotask(() => { void refresh(); });
})();
