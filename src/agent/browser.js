(() => {
  const {createKernel, createState, measurementsRequired, receiptStructureEligible, receiptStructureFact} = globalThis.RapierKernel;
  const {resolveCaller} = globalThis.RapierDoorIdentity;
  const {TOOLS, PAGE_TOOLS, getTool, annotations, validateInput} = globalThis.RapierAgentCatalog;
  const {guideResult} = globalThis.RapierAgentGuide;
  // The decision core takes no clock or randomness of its own (docs/kernel.md, "The census"); this
  // door supplies the real ones, same as mcp/worker.mjs does for the hosted door.
  const kernelClock = () => Date.now();
  const kernelMintId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
  // This door's one identity axis beyond a single wire message: a boot-scoped session id, never
  // read from the wire, folded into every derived invocationKey (docs/kernel.md, "Two identities").
  // Stable for the page's lifetime; a reload is a fresh session by construction, so a retry from
  // before the reload cannot collide with anything minted after it.
  const doorSession = kernelMintId('session_');
  // The name a door gave at its own handshake, once, for this page session (nameAtDoor below).
  let doorName = '';
  const subscribers = new Set();
  const contextSubscribers = new Set();
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
  // otherwise mutate the read surface for a change whose outcome is already settled in the person's
  // hand, which can race a picture-deleting change's own asset retirement into a spurious image
  // error (R75, the review-peek-picture regression this guards against).
  const decidingChanges = new Set();
  const apps = globalThis.RAPIER_APPS_HOST === true;
  const idleSignal = new AbortController().signal;
  let kernel, previous, refreshing, registrationOwner, registrationExposure = '';
  let readyResolve, readyReject, readyDone = false, replacing = false, refreshAgain = false;
  let comparisonOwner = null, comparisonKernelId = null, comparisonGeneration = -1, remoteComparison = null;
  let contextSequence = 0, humanSequence = 0, contextQueued = false, contextTimer = 0, lastInputAt = 0, lastPointerAt = 0;
  let retainedPointer = null, policyAvailable = false, remoteReview = null, projecting = 0, viewFlight = null;
  let visualFlight = null;
  let embedReviewSignature = '';
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  const fail = (reason, outcome = 'refused') => ({ok: false, outcome, reason});
  const abort = request => request.signal?.throwIfAborted();
  const context = (request, operation) => ({
    actor: {kind: request.actor || 'agent', id: request.principal || 'webmcp'},
    transport: request.transport === 'webmcp' ? 'webmcp' : 'platform',
    operation, requestId: request.requestId || crypto.randomUUID(),
  });
  const scope = request => ({kind: request.actor || 'agent', id: request.principal || 'webmcp',
    transport: request.transport === 'webmcp' ? 'webmcp' : 'platform'});
  const caller = request => _rapierDoorStamp({actor: context(request).actor,
    signal: request.signal || idleSignal, invocation: {id: request.requestId || crypto.randomUUID()}},
    request.transport === 'webmcp' ? 'webmcp' : 'platform');
  const ownsComparison = owner => comparisonOwner === owner && _rapierCompareRuntime.agentOpened &&
    comparisonGeneration === _rapierCompareRuntime.jobId;
  const nativeComparisonId = () => String(rapier.identity.authority) + ':native:' + _rapierCompareRuntime.jobId;

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
    const ta = document.getElementById('source-textarea');
    if (ta && document.activeElement === ta &&
        (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source')) {
      const start = _rapierAbsPos(ta.selectionStart), end = _rapierAbsPos(ta.selectionEnd);
      const active = editing();
      return {selection: {start, end, active}, focus: {start, end, active}};
    }
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return {selection: null, focus: null};
    // The object under the finger (Weapon-R69 §17.1): a picture or drawing the person has selected
    // is the focus, whole, before any text range -- the agent's "this" is what the person is
    // holding, and the kernel names its kind from the source it points at.
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
    });
  }

  function humanActivity(event) {
    if (event.isTrusted !== true || projecting) return;
    const target = event.target;
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

  async function humanContext() {
    const basic = {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled),
      generation: Number(rapier.revision.generation)};
    if (!readyDone || admission() || composing() || _rapierMutationBarrierActive() || Date.now() - lastInputAt < 900) {
      return {...fail('document_not_settled', 'yielded'), ...basic,
        context: {sequence: contextSequence, visible: visible(), editing: visible() && editing(), selection: null, focus: null}};
    }
    const captured = await _rapierWithSettledExternalDocument(documentState, {quiet: true});
    if (!captured.settled) return {...fail('document_not_settled', 'yielded'), ...basic,
      context: {sequence: contextSequence, visible: visible(), editing: true, selection: null, focus: null}};
    const value = captured.value;
    if (Date.now() - lastPointerAt < 1500) rememberPointer();
    const pointer = visible() && pointerCurrent() ? {selection: retainedPointer.selection, focus: retainedPointer.focus}
      : {selection: null, focus: null};
    return {ok: true, documentId: value.documentId, revision: value.revision, generation: value.generation,
      filename: value.filename, docKind: value.docKind, text: value.text,
      context: {...pointer, sequence: contextSequence, visible: visible(), editing: visible() && editing(true),
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

  // Notes' cards over the document (A29 item 3, docs/open-work.md item 11): the fact goes into the
  // agent's context, and no edit, open or drawing reaches the document behind them. The visual
  // `inert` fence is not an authority fence; this is.
  // Read from the owner's standing (notes.js publishes it beside the diagnostic facts getter, whose deep
  // copy of the index this fence must never cost a checkpoint); undefined without Notes on the page.
  const notesFact = () => { const f = globalThis.rapierNotesStanding; return f && typeof f === 'object' ? {open: !!f.open, current: f.current || null} : null; };
  const notesFence = () => { const f = notesFact(); return f && f.open ? 'notes_library_open' : ''; };
  // Draw's session (body.rapier-draw-open is the public fact): the person is painting, not looking
  // at the markdown. The canvas is not an authority fence; this is.
  // The one exception, and the reason for it (docs/briefs/agent-on-the-canvas.md): an edit to the
  // very drawing the person has open is not an edit to the markdown behind the canvas -- it is the
  // one change that is ABOUT what they are looking at, and they watch it arrive (the replay).
  // Narrow on purpose, and on three facts at once: the edit must be a plain shapes patch (the only
  // shape of edit the open surface can take into the drawing it is holding -- anything else would
  // be silently overwritten by the person's own Done), it must name a drawing (kernel.mjs
  // drawEdit's `fence`, derived from the held handle, never from the wire), and Draw must be open
  // on that same picture. The predicate for the last of those is the SAME one that decides the
  // hand-off, so the fence can never open on an edit the surface would then refuse to show. A new
  // picture under the canvas, an operations batch, a caption change, a staged CHECK review, an
  // apply, a save, an open: all still refused, exactly as before.
  const drawFence = fact => {
    if (typeof document === 'undefined' || !document.body?.classList?.contains('rapier-draw-open')) return '';
    const open = typeof _rapierDrawEditingAsset === 'function' ? _rapierDrawEditingAsset() : '';
    return fact?.shapesOnly && open && fact.drawingAsset && String(fact.drawingAsset) === open ? '' : 'draw_session_open';
  };
  const hostFence = fact => notesFence() || drawFence(fact);
  function documentState() {
    const notes = notesFact();
    return {documentId: String(rapier.identity.authority), revision: Number(rapier.revision.settled), ...(notes ? {notes} : {}),
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
        actor: tx.actor.kind, principal: tx.actor.id, transport: tx.transport,
        operation: tx.operation, sourceTransactionId: tx.sourceTransactionId,
        splices: splices.map(row => ({pos: row.pos, removed: row.removed, inserted: row.inserted}))}] : [];
    });
    return {...documentState(), ...editorFocus(), journal, externalComparison: externalComparison(),
      closedComparisonId: !apps && comparisonKernelId && !ownsComparison(comparisonOwner) ? comparisonKernelId : null};
  }

  async function snapshot() {
    await ready;
    const reason = admission();
    if (reason) throw Object.assign(new Error(reason), {code: reason});
    const read = await _rapierWithSettledExternalDocument(current, {quiet: true});
    if (!read.settled) throw Object.assign(new Error('document_not_settled'), {code: 'document_not_settled'});
    return read.value;
  }

  function matches(request, revision = request.revision ?? request.baseRevision) {
    return request.documentId === String(rapier.identity.authority) &&
      (revision == null || revision === Number(rapier.revision.settled)) &&
      (request.beforeText == null || request.beforeText === _rapierSourceText());
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
    // Canonical ↔ rendered mapping is editor-owned (`_rapierResolvePoint` / `_rapierRestoreCanonicalSelection`);
    // this door does not walk the DOM itself (docs/kernel.md: surface-dependent is not surface-owned).
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
    const reason = admission() || hostFence(request.fence);
    if (reason) return reason;
    if (!matches(request)) return 'document_changed';
    if (rapier.access.readOnly) return 'document_read_only';
    if (_rapierUserMutationBlocked()) return 'document_not_settled';
    if (_rapierWillReviewSlot.settling || _rapierCompareRuntime.lawReview) return 'human_review_in_progress';
    if (rapier.compare?.active && !ownsComparison(comparisonOwner)) return 'human_comparison_open';
    if (request.actor === 'agent' && !request.sourceTransactionId && !reviews.has(request.reviewToken)) {
      if (_rapierPosture() === 'ask') return 'human_review_required';
    }
    return '';
  }

  async function commit(request) {
    abort(request);
    const review = reviews.get(request.reviewToken);
    if (request.reviewToken && (!review || review.documentId !== request.documentId ||
        review.revision !== request.baseRevision || review.beforeText !== request.beforeText ||
        review.text !== request.text || review.principal !== request.principal ||
        review.requestId !== request.requestId || review.expires < Date.now())) {
      reviews.delete(request.reviewToken);
      return fail('review_lapsed');
    }
    const refused = commitAdmission(request);
    if (refused) { reviews.delete(request.reviewToken); return fail(refused, refused === 'document_changed' ? 'conflict' : 'refused'); }
    reviews.delete(request.reviewToken);
    const place = capturePlace();
    const ctx = context(request, request.operation);
    const resolved = request.splices.map(row => ({text: row.inserted,
      resolved: {kind: 'document-range', source: request.beforeText, start: row.pos, end: row.pos + row.removed.length}}));
    let proof = null;
    if (request.actor === 'agent' && rapier.document.docKind === 'markdown') {
      let text = request.beforeText;
      for (const row of request.splices) {
        const will = {..._rapierWillParse(text), space: 'source'};
        if (!review && !request.sourceTransactionId && _rapierWillRefuses(will,
          {kind: 'document-range', start: row.pos, end: row.pos + row.removed.length}, row.inserted)) return fail('document_law');
        text = text.slice(0, row.pos) + row.inserted + text.slice(row.pos + row.removed.length);
      }
      proof = _rapierWillProofBefore('agent', review ? resolved.slice(0, request.authoredCount ?? resolved.length) : resolved,
        !!review, !!request.sourceTransactionId);
    }
    const drafts = request.splices.map(row => ({kind: 'document-range',
      startBlockId: null, endBlockId: null, beforeText: row.removed, afterText: row.inserted,
      anchorBefore: row.pos, anchorAfter: row.pos, replacementLength: row.inserted.length}));
    const changeSet = _rapierChangeSetMetadata(ctx, drafts, request.label || request.operation,
      request.sourceTransactionId ? 'undo' : 'change');
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
        if (!restorePlace(place, request.splices)) throw Object.assign(new Error('selection_restore_failed'), {code: 'selection_restore_failed'});
        abort(request);
      }, {changeSet, sourceTransactionId: request.sourceTransactionId});
      committed = {ok: true, revision: result.commitReceipt.documentRevision,
        documentId: result.commitReceipt.documentAuthority, transactionId: result.transaction?.id};
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
      if (error?.name === 'AbortError' || request.signal?.aborted) throw error;
      return fail(error?.code || 'commit_failed', 'conflict');
    } finally {
      try { if (!done) restorePlace(place, []); } catch (_) {}
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

  async function reveal(request) {
    if (!matches(request) || rapier.compare?.active) return fail('view_changed');
    abort(request);
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
    if (resolved.kind === 'markdown-range') _rapierRestoreCanonicalSelection(request.start, request.end);
    _rapierRevealMarker(resolved, scroll.element);
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

  async function applyView(intent, expected, value) {
    await ready;
    if (!intent || intent.status !== 'pending' || !['document', 'compare'].includes(intent.kind)) return fail('view_invalid', 'invalid');
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
        principal: 'mcp', actor: 'agent', transport: 'platform', signal: controller.signal};
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
    // proposal pending and unpresented (R75, docs/handoff.md "R75: change peeking, the inline
    // surface"). This is the one place stageReview's own presentation attempt reaches the browser.
    _rapierReviewSpansRefresh();
    await ready;
    if (!review || review.status !== 'pending') return dismissReview();
    if (remoteReview?.review.id === review.id && remoteReview.value.revision === value?.revision &&
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
    const presentation = review.kind === 'check' ? {kind: 'check', baseline: image.baseline,
      baseRevision: review.baseRevision, includesHumanChanges: review.includesHumanChanges === true} : null;
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
    const record = {review, value, expected: {...expected}, image, options, pending, controller, presented: false, done: null};
    remoteReview = record;
    // Review content outlives execution authority (Astra K08): `expiresAt` is the agent's
    // authority-lapse clock, not a session bound. The presentation stays until the person
    // decides or the document moves; surviveReview at decideReview revalidates the target.
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
    if (!_rapierEmbed.active || !_rapierEmbed.connected || !_rapierEmbed.loaded ||
        _rapierEmbed.loading || !_rapierEmbed.capabilities?.includes('agent') || !kernel) {
      embedReviewSignature = ''; return false;
    }
    const review = kernel.collaboration()?.review;
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
  // included (Tranche H, docs/kernel.md "A review is decided over time"): the review token pins the
  // text a decision commits to the kernel's own previewReview at the live revision, so the host's
  // own commit -- which recomputes the identical picture-retirement splices -- never refuses a
  // decision this preview already approved. presentKernelReview's onDecision (the law lens, R73)
  // and the inline read-surface's keep/drop strip and type-over (R75, Weapon-R69 §17.2) both call
  // this -- one decision path, so the token pinning and hosted parity stay one owner (docs/handoff.md
  // "R75: change peeking, the inline surface").
  async function decideKernelReview(review, action, changeIds) {
    const refuse = reason => { showToast('Review could not be applied: ' + reason, 'error'); return {outcome: 'refused', reason}; };
    if (!review || !['approve', 'decline', 'apply', 'drop'].includes(action)) return refuse('review_decision_invalid');
    let reviewToken;
    const live = kernel.collaboration()?.review;
    const current = kernel.snapshot();
    const expectedRevision = live?.revision ?? current.revision;
    // approve/decline decide every still-pending change at once (kept or dropped); apply/drop name
    // only the ones they carry. Either way this is exactly the set the inline read surface must
    // leave undrawn until the commit below resolves (decidingChanges' own comment names why).
    const affected = action === 'approve' || action === 'decline'
      ? Array.isArray((live || review).changeIds) ? (live || review).changeIds : []
      : Array.isArray(changeIds) ? changeIds : [];
    for (const id of affected) decidingChanges.add(id);
    try {
    if ((action === 'approve' || action === 'apply') && (live || review).kind === 'proposal') {
      // The token pins the text the person approved (or applied) to the kernel's own preview of
      // this exact decision -- picture-retirement splices included -- so the host's commit never
      // refuses a decision the preview already approved (docs/kernel.md, R73 change peeking).
      const previewArgs = {reviewId: review.id, ...(Array.isArray(changeIds) ? {changeIds} : {})};
      const preview = typeof kernel.previewReview === 'function' ? kernel.previewReview(previewArgs) : null;
      let text;
      if (preview?.outcome === 'ok') {
        text = preview.text;
      } else if (Array.isArray(changeIds) && Array.isArray((live || review).changeIds)) {
        const keep = new Set(changeIds);
        const source = live || review;
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
    // reaches this door by any path (docs/handoff.md "R75: change peeking, the inline surface").
    if (request?.review?.kind === 'proposal' && request.review.id) {
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

  // The inline read-surface's own read of the pending proposal (R75, Weapon-R69 §17.2): a pure
  // accessor over the same collaboration() snapshot document.get_context and the law lens already
  // read, relocated (docs/kernel.md, "Relocation runs at decision time... and whenever a door reads
  // collaboration()") so a stale position never reaches the spans. Never anything but a proposal
  // under decision -- a check, inline or comparison-driven review has nothing for a person to keep
  // or drop change by change.
  function pendingReviewSnapshot() {
    if (!kernel) return null;
    const review = kernel.collaboration()?.review;
    return review && review.kind === 'proposal' && review.status === 'pending' ? review : null;
  }

  // The wider twin of pendingReviewSnapshot: the same proposal a moment after a decision closes it,
  // still carrying each change's final status (applied/dropped), before the next unrelated edit or
  // TTL expiry clears it from collaboration(). The inline surface's own span-undo reads this --
  // pendingReviewSnapshot's pending-only filter goes stale the instant the decision it is undoing
  // for lands (docs/handoff.md "R75: change peeking, the inline surface").
  function reviewSnapshot() {
    if (!kernel) return null;
    const review = kernel.collaboration()?.review;
    return review && review.kind === 'proposal' ? review : null;
  }

  // Astra R75-K04: the small, review-only slice of kernel state a restart needs to bring a pending
  // negotiation back -- never the document text itself, which the editor's own existing recovery
  // store already owns and restores independently (`refresh`'s own `!kernel` branch merges the two).
  // Called by that same store's existing write cycle; returns null the instant there is nothing
  // pending to retain, so an idle document's ordinary autosave writes nothing new here at all -- one
  // bounded pending negotiation, not a growing archive of past ones.
  function agentRecoveryState() {
    if (!kernel) return null;
    // The kernel's own state otherwise only catches up with an ordinary human edit the way every
    // kernel operation already does -- host.snapshot() pulled and reconciled at the very start of
    // the next invoke()/decideReview() (kernel.mjs's own internal refresh(context)) -- so a document
    // that settles into autosave without an intervening agent call would retain a stale revision.
    // Reconciling here, against the same live snapshot() every door already reads, keeps the
    // retained slice current with no new source of truth and no extra write of its own.
    try { kernel.reconcile(current(), {actor: 'system', principal: 'bootstrap'}); } catch (_) {}
    const snap = kernel.snapshot();
    if (!snap.review || snap.review.status !== 'pending') return null;
    const {text, ...rest} = snap;
    return {...rest, invocationJournal: kernel.invocationJournal()};
  }

  // The inline read-surface's keep/drop strip and type-over call this directly instead of going
  // through the law lens's whole present/dismiss ceremony -- decideKernelReview is still the one
  // place a decision reaches the kernel (docs/handoff.md "R75: change peeking, the inline surface").
  // Refuses (without reaching the kernel) a reviewId that is no longer the live pending review, the
  // same shape kernel.decideReview itself would refuse it with.
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
    const review = pendingReviewSnapshot();
    if (!review) return {ok: false, reason: 'review_missing'};
    return presentKernelReview({review, principal: 'local', transport: 'platform', requestId: crypto.randomUUID()});
  }

  // Structural parse for a JS/HTML document: the browser's own answer to a world.structure fact
  // decide can no longer await. Shared by resolveStructureFact (a surface-fact pending's
  // continuation) below; kernel.mjs never calls this directly (docs/kernel.md, "structure
  // freshness" in "The gates").
  async function structureJob(input) {
    const request = globalThis.RapierStructureRequest.structureRequest(input);
    if (!request) return {ok: false, complete: false, reason: 'structure_unavailable'};
    const sameSource = () => _rapierSourceText() === input.text && String(rapier.document.filename) === input.filename;
    if (!sameSource()) return {ok: false, complete: false, reason: 'document_changed'};
    const result = await _rapierStructureJob(request, idleSignal);
    return sameSource() ? result : {ok: false, complete: false, reason: 'document_changed'};
  }

  // Answers one pending{kind:'surface-fact'} requirement (docs/kernel.md, "The envelope and the
  // outcome") from this door's own current document -- outline and structural find are the two
  // call sites that can genuinely need it; get_outline's is knowable from the op alone
  // (measurementsRequired in agent/kernel.mjs), so invoke() below also tries it up front and this
  // function is what a first-time or racing call falls back to. Returns null when the requirement
  // no longer matches this document, letting the kernel's own revision check answer instead of a
  // second, adapter-side guess at staleness.
  async function resolveStructureFact(requirements) {
    if (!requirements || !['outline', 'find'].includes(requirements.mode)) return null;
    if (String(rapier.document.filename) !== requirements.filename) return null;
    const text = _rapierSourceText();
    const input = {text, filename: requirements.filename, mode: requirements.mode,
      ...(requirements.mode === 'find' ? {query: requirements.query, kind: requirements.kind,
        within: requirements.within, offset: requirements.offset} : {})};
    const value = await structureJob(input);
    return {mode: requirements.mode, revision: Number(rapier.revision.settled), filename: requirements.filename,
      ...(requirements.mode === 'find' ? {query: requirements.query, kind: requirements.kind,
        within: requirements.within, offset: requirements.offset} : {}), value};
  }

  // Pixels are an observation of exactly this source, never a source handle. Apps supplies its
  // already-verified local snapshot separately because local and server revision counters differ.
  async function inspectVisual(request, expected) {
    await ready;
    const identity = {documentId: request?.documentId, revision: request?.revision, scope: request?.scope};
    const refuse = reason => ({...identity, outcome: 'refused', reason});
    if (request?.signal?.aborted) return refuse('cancelled');
    if (visualFlight) return refuse('visual_capture_busy');
    if (request?.kind !== 'visual' || !['viewport', 'page', 'focus', 'selection'].includes(request.scope))
      return refuse('visual_target_unavailable');
    if (admission() || !visible()) return refuse('host_not_connected');
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

  // Drives the inline Will review UI for a pending{kind:'human-review'} whose review.kind is
  // 'inline' -- the same _rapierWillReviewOpen presentation host.review used to drive synchronously
  // inside the kernel. decide no longer blocks on it (docs/kernel.md, "The finding that remains"):
  // it stages the pending review and returns; this runs after, from invoke() below, and reports the
  // decision back on a continuation through kernel.decideReview -- the one commit owner applies it.
  async function driveInlineReview(review, requestMeta) {
    publishEmbedReview();
    const decline = () => kernel.decideReview({expectedRevision: review.revision, reviewId: review.id, action: 'decline'},
      {actor: 'human', principal: 'local', transport: 'platform', requestId: crypto.randomUUID(), signal: idleSignal});
    const beforeText = _rapierSourceText();
    const splice = review.authoredSplices?.[0];
    if (String(rapier.identity.authority) !== review.documentId || Number(rapier.revision.settled) !== review.revision ||
        !splice || beforeText.slice(splice.pos, splice.pos + splice.removed.length) !== splice.removed) return decline();
    const resolved = {kind: 'document-range', source: beforeText, start: splice.pos, end: splice.pos + splice.removed.length, record: {}};
    if (!review.byPosture) {
      const will = {..._rapierWillParse(beforeText), space: 'source'};
      if (!_rapierWillCanReview(will, resolved)) return decline();
    }
    const who = {actor: 'agent', principal: requestMeta.principal || 'mcp', requestId: requestMeta.requestId || review.id,
      transport: requestMeta.transport || 'platform', signal: idleSignal};
    const decision = await _rapierWillReviewOpen(resolved, splice.inserted, caller(who), review.byPosture === true);
    let reviewToken;
    try {
      const restored = decision.review && await _rapierAwaitWillRestore(decision.review, idleSignal);
      const approve = decision.allowed && restored && _rapierSourceText() === beforeText &&
        String(rapier.identity.authority) === review.documentId && Number(rapier.revision.settled) === review.revision;
      if (!approve) return decline();
      const text = globalThis.RapierKernel.transformSplices(beforeText, review.splices);
      if (typeof text !== 'string') return decline();
      reviewToken = crypto.randomUUID();
      reviews.set(reviewToken, {documentId: review.documentId, revision: review.revision, beforeText, text,
        principal: who.principal, requestId: who.requestId, expires: Date.now() + 30000});
      return await kernel.decideReview({expectedRevision: review.revision, reviewId: review.id, action: 'approve'},
        {actor: 'human', principal: 'local', transport: 'platform', requestId: crypto.randomUUID(), signal: idleSignal, reviewToken});
    } finally {
      if (decision.review) _rapierWillReviewRelease(decision.review, false);
      if (reviewToken) reviews.delete(reviewToken);
    }
  }

  const host = {
    snapshot, commit, reveal, compare: showComparison, closeCompare: closeComparison, presentReview: presentKernelReview,
    // notes.list / notes.read (R86i): the folder is answered by the Notes shell's own door where the
    // build carries Notes (notes/notes.js sets globalThis.rapierNotesHost at install); the document
    // profile has no such door, so the kernel returns an empty, unavailable listing
    // (docs/sync-engine.md, "the host contract the shell wires").
    //
    // Call-time lookup, never a one-time capture: this file is spliced BEFORE notes/notes.js
    // (editor/scripts.json), so the door does not exist at adapter create. Returning null when the
    // door is absent used to look like notes_folder_unreadable (retry the folder) instead of
    // an unavailable empty listing (this build has no Notes). undefined is the kernel's "no door" signal;
    // the door itself still returns null when the folder cannot answer.
    notesList: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.list !== 'function') return undefined; return door.list({signal: request?.signal}); },
    notesRead: async request => { const door = globalThis.rapierNotesHost; if (typeof door?.read !== 'function') return undefined; return door.read(String(request?.file || ''), {signal: request?.signal}); },
    // Declares the capability decide's own commit branch reads (docs/kernel.md, "Capability
    // negotiation"): this door can present a review inline, at the exact edit, not only through the
    // Compare-panel proposal flow. mcp/worker.mjs does not set this -- it has no inline UI to show,
    // so it stays on the staged 'proposal' review every door can present later.
    inlineReview: true,
    note: text => { _rapierAgentNoteSet(String(text || '')); _rapierAgentNoteShow(); },
    markdown: async input => {
      abort(input);
      if (_rapierSourceText() !== input.text) return {entries: [], complete: false, reason: 'document_changed'};
      const value = globalThis.RapierAgentMarkdown.outlineMarkdown(input.text, {limit: input.limit}, window.markdownit);
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
      // and would write the agent's text over the folder file (Astra B05, R85b).
      if (notesFact()?.current) return fail('notes_note_open');
      if (_rapierEmbed.active) return fail('host_owns_document');
      if (rapier.access.readOnly) return fail('document_read_only');
      abort(request);
      // The editor's own Open (law 3): unsaved work under it is set aside in the held slot, never asked about.
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
    // Unknown names and schema-invalid arguments are admitted to kernel.invoke so they journal
    // (Astra K06). Admission of a known tool — the person-is-here / dirty-draft checks — still
    // happens here, outside the invocation boundary, because those are this door's facts, not
    // a kernel outcome.
    if (tool && TOOLS.includes(tool)) {
      const reason = admission();
      if (reason) return {outcome: 'refused', reason};
    }
    // resolveCaller is the one caller-resolution and invocation-identity implementation every door
    // shares (agent/door-identity.mjs, docs/kernel.md's "adapter vectors" gate and "Two identities"):
    // invocationKey is always derived from this door's own wire-message id, principal and session --
    // never the wire's own claim. requestId is that wire-message id, minted or supplied exactly once
    // per real call (the WebMCP registration wrapper and the platform-host bridge each do this
    // before invoke() is ever reached, never re-derived per processing attempt here), so the same
    // logical message always derives the same key and a deliberate second call, with a fresh id,
    // always derives a different one.
    const resolved = resolveCaller({actor: request.actor, principal: request.principal, transport: request.transport,
      requestId: request.requestId || crypto.randomUUID(), invocationKey: request.invocationKey, session: doorSession},
      {actor: 'agent', principal: 'platform', transport: 'platform'});
    if (resolved.invocationKeyRejected) {
      // The wire tried to choose its own invocation identity -- never trusted, and not silently
      // dropped either: refused through the kernel's own invalid path so the refusal is recorded in
      // the same invocation journal a legitimate retry answers from (docs/kernel.md, "Two
      // identities"). No invocationKey is forwarded; participant() mints its own for bookkeeping.
      return kernel.invoke(name, args, {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
        requestId: resolved.requestId, rejectedInvocationKey: true, signal: request.signal || idleSignal});
    }
    const who = {actor: resolved.actor, principal: resolved.principal, transport: resolved.transport,
      requestId: resolved.requestId, invocationKey: resolved.invocationKey, signal: request.signal || idleSignal};
    // measurementsRequired is the fast path where the need is knowable from the op alone: get_outline
    // on a non-Markdown document always wants structure, so this door hands world the fact before
    // ever asking, and the common case costs no round trip (docs/kernel.md, "The decision is pure;
    // the commit is owned"). Anything not knowable up front -- a structural find past its first page,
    // a review this call turns out to need -- still resolves below, from the pending outcome itself.
    const eager = measurementsRequired(name, args);
    const beforeText = _rapierSourceText();
    const run = async () => {
      let world, visualFact;
      if (eager?.structure?.mode === 'outline') {
        const fact = await resolveStructureFact({mode: 'outline', filename: String(rapier.document.filename)});
        if (fact) world = {structure: fact};
      }
      let result = await kernel.invoke(name, args, world ? {...who, world} : who);
      // pending is a complete outcome, not a suspension (docs/kernel.md, "The envelope and the
      // outcome"): this loop is the caller invoking again with the fact in world and continues set,
      // not the kernel waiting on anything -- each iteration is its own fresh decide().
      for (let guard = 0; guard < 4 && result.outcome === 'pending'; guard++) {
        if (result.pending?.kind === 'surface-fact') {
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
      // The receipt's structural parse check (docs/kernel.md, "The census"): decide never awaits a
      // host for it -- structureReceipt reads only context.world, matched to the exact before/after
      // digest pair, and reports not_checked otherwise, because the after-text does not exist until
      // commit has already decided the transition (gating an applied outcome on a round trip would
      // be the half-applied state the architecture forbids). This door runs the same analysis the
      // old structure host did -- strictly after the fact, on the outcome it is about to return,
      // never inside decide -- and marks the result an adapter-attested fact rather than routing it
      // back through a second invocation.
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
          ...(result.observation.sourceRange ? {sourceRange: result.observation.sourceRange} : {})};
        // A read receipt may replay after its pixels were released. Re-observe that exact source
        // and target; never return metadata alone as though an image had reached the caller.
        visualFact ||= await inspectVisual({...requirements, signal: who.signal});
        const validated = globalThis.RapierAgentVisual.visualResult(requirements, visualFact);
        if (validated.outcome !== 'ok') return {...result, ...validated, observation: undefined};
        return {...result, ...validated, content: [{type: 'image', mimeType: 'image/png', data: visualFact.image.data}]};
      }
      return result;
    };
    const result = await (who.actor === 'agent'
      ? _rapierAgentInvocationTracked(name, args, run, who.requestId) : run());
    if (name === 'document.apply_edits' && ['applied', 'rebased'].includes(result.outcome)) {
      _rapierAgentNoteSet(typeof args.note === 'string' ? args.note : '');
      _rapierAgentNoteShow();
    }
    // The agent's edit has landed in the document. If the person happens to be looking at that same
    // drawing in Draw right now, they watch it arrive in the order it was written instead of in one
    // frame (docs/briefs/agent-on-the-canvas.md). Nothing here decides anything: the change is
    // already committed, the replay is only how it is shown, and Draw refuses the hand-off unless it
    // is open on the very picture `replaced` names. Guarded because the document profile ships no
    // Draw UI at all (tools/check-profile-seams.mjs).
    if (name === 'document.draw' && ['applied', 'rebased'].includes(result.outcome) && args?.shapes && result.replaced
        && typeof _rapierDrawAgentPatch === 'function') {
      try { _rapierDrawAgentPatch(args.shapes, {asset: result.replaced, reference: result.asset?.reference, name: doorName}); }
      catch (_) {}
    }
    // Any call can be the first thing to relocate a pending review's changes through document.
    // get_context's own collaboration() read (docs/kernel.md, "Relocation runs at decision time,
    // at document.get_context, and whenever a door reads collaboration()") -- a stale change from
    // a human edit elsewhere becomes visible here, not only on the next agent-initiated decision.
    _rapierReviewSpansRefresh();
    publishEmbedReview();
    return result;
  }

  function status() {
    return {available: registrations.size > 0, ready: readyDone,
      reason: apps ? 'mcp_apps_host' : admission() || (registrationOwner ? '' : 'webmcp_unavailable'),
      registered: [...registrations.keys()], failures: Object.fromEntries(failures)};
  }

  function retire() {
    for (const entry of registrations.values()) entry.abort();
    registrations.clear(); failures.clear(); registrationOwner = null; registrationExposure = '';
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
    nameAtDoor(owner.clientInfo?.name);
    for (const tool of PAGE_TOOLS) {
      if (registrations.has(tool.name) || failures.has(tool.name)) continue;
      const controller = new AbortController();
      try {
        await owner.registerTool({name: tool.name, title: tool.title, description: tool.description,
          inputSchema: tool.inputSchema, annotations: annotations(tool.effect, 'webmcp'),
          execute: (args, options = {}) => {
            if (controller.signal.aborted || owner !== registrationOwner || admission())
              return {outcome: 'refused', reason: 'host_not_connected'};
            return invoke(tool.name, args, {actor: 'agent', principal: 'webmcp', transport: 'webmcp',
              requestId: crypto.randomUUID(), signal: options.signal});
          }}, {signal: controller.signal, ...(exposure ? {exposedTo: [exposure]} : {})});
        if (admission() || registrationOwner !== owner || registrationExposure !== exposure) controller.abort();
        else registrations.set(tool.name, controller);
      } catch (error) {
        controller.abort(); failures.set(tool.name, String(error?.name || 'registration_failed'));
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
    if (admission()) retire();
    if (refreshing) { refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      // Passive: a person's typing burst is never cut into a transaction for this read; the burst's own checkpoint refreshes again.
      const read = await _rapierWithSettledExternalDocument(current, {quiet: true, passive: true});
      if (!read.settled) return status();
      const value = read.value;
      if (!kernel) {
        // Astra R75-K04: a pending negotiation is retained state, not a live-session-only fact
        // (docs/kernel.md, "A review is decided over time") -- but a fresh page load has always
        // built its kernel from document identity/text/revision alone, with no pending review or
        // invocation-journal restoration, silently dropping whatever was mid-decision the moment the
        // page (not just this one kernel instance) goes away. `recovery`, when the caller has one, is
        // the small, review-only slice the editor's own existing recovery store read back alongside
        // the document (editor/engine.js's `rapierTryRestore`, handed down through the one boot-ready
        // call this function is always reached from first, `_rapierWebMcpSync`) -- never the document
        // text itself, which that same store already owns and just finished restoring into `value`
        // above; only this call's own `_rapierBootstrapRuntime.complete` transition ever lets a
        // `refresh()` reach this branch at all, so an earlier, recovery-less call (this module's own
        // pre-boot `pageshow`/microtask refreshes) never builds the kernel first and strands it. A
        // restore whose own recorded documentId+revision no longer match this live document (an
        // explicit replacement, a stale or foreign record) is discarded outright, never partially
        // applied.
        const restored = recovery || null;
        const inherits = restored && restored.documentId === value.documentId && restored.revision === value.revision;
        const {invocationJournal: restoredJournal, ...restoredState} = restored || {};
        // The posture toggle is live UI state, not persisted with the document -- a fresh page
        // always boots it back to 'free'. Left alone, that reads to kernel.reconcile() below as a
        // person having just turned ASK off, which is exactly the policy change that invalidates a
        // pending review (agent/kernel.mjs's own `invalidateReview('policy_changed')`), destroying
        // the very review this restore exists to keep. So a restore that inherits also puts the
        // toggle itself back the way the restored review's own posture had it, before reconcile ever
        // sees a mismatch that was never a person's decision.
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
    try {
      if (value.documentId !== before.documentId) {
        const stamp = _rapierMutationStamp();
        const loaded = await rapierLoad(value.text, value.filename, {documentAuthority: value.documentId,
          documentKind: value.docKind, expectedMutationStamp: stamp, returnReceipt: true, appsSnapshot: true});
        if (!loaded) return fail('document_changed', 'conflict');
      } else if (value.text !== before.text) {
        const row = _rapierPrefixSuffixDiff(before.text, value.text);
        const committed = await commit({documentId: before.documentId, baseRevision: before.revision,
          beforeText: before.text, text: value.text, splices: [row], actor: 'system', principal: 'mcp',
          transport: 'platform', operation: 'document.remote_edit', label: 'Remote edit'});
        if (!committed.ok) return committed;
      }
      if (value.filename !== String(rapier.document.filename) || value.docKind !== rapier.document.docKind) {
        if (_rapierSourceText() !== value.text || String(rapier.identity.authority) !== value.documentId) return fail('document_changed', 'conflict');
        const loaded = await rapierLoad(value.text, value.filename, {sameDocument: true, preserveHistory: true,
          documentKind: value.docKind, expectedMutationStamp: _rapierMutationStamp(), appsSnapshot: true});
        if (!loaded) return fail('document_changed', 'conflict');
      }
      const exact = _rapierSourceText() === value.text && String(rapier.identity.authority) === value.documentId;
      if (exact) projectPolicy(value);
      const comparison = !exact ? {...fail('document_changed'), visible: false} : remoteReview
        ? {ok: true, visible: true, review: remoteReview.review.id} : await syncComparison(value);
      await refresh();
      return {ok: true, outcome: 'applied', comparison, snapshot: await snapshot()};
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

  // The name at the door (docs/briefs/agent-on-the-canvas.md, "Where the name comes from"). MCP
  // hands a clientInfo.name over when the session opens, and the other doors have their own; Rapier
  // shows the name it was GIVEN AT THE DOOR, one source, for the whole session. Deliberately not a
  // per-call argument and not a field in a tool's own schema: a name that can be set differently on
  // every call is a costume, not a name. So this is first-write-wins for the life of the page -- a
  // second handshake claiming something else changes nothing -- and it is only ever a name written
  // on a drawing, the way a person writes theirs. Rapier does not vouch for it (agent/
  // door-identity.mjs owns what IS authenticated: principal, invocation, presence, origin).
  // If no door gave a name this stays empty and the nib draws without a tag; never an invented one.
  function nameAtDoor(given) {
    if (doorName) return doorName;
    const text = typeof given === 'string' ? given.trim().replace(/\s+/g, ' ') : '';
    if (text && text.length <= 32) doorName = text;
    return doorName;
  }

  globalThis.RapierAgentBrowser = Object.freeze({ready, snapshot, invoke, refresh, status,
    nameAtDoor, doorName: () => doorName,
    replaceDocument, acknowledge, compareSelection, humanContext, contextChanged, setPolicy, inspectVisual,
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
    if (!visible()) { retainedPointer = null; viewFlight?.abort(); visualFlight?.abort(); }
    contextChanged('visibility');
  });
  window.addEventListener('blur', () => { contextChanged('blur'); });
  window.addEventListener('focus', () => { contextChanged('focus'); });
  window.addEventListener('pagehide', () => { visualFlight?.abort(); retire(); });
  window.addEventListener('pageshow', () => { void refresh(); });
  queueMicrotask(() => { void refresh(); });
})();
