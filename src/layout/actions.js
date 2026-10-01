async function _rapierCommitSourceProjection(splices, operation, selection = null, navigationCurrent = null,
    viewport = _rapierCaptureEditorViewport()) {
  if (_rapierUserMutationBlocked()) return false;
  if (!splices.length) return true;
  // Pending letters commit here; if that moved the text the splices name nothing. Refuse rather than misplace.
  const measured = _rapierSourceText();
  if (!_rapierSettlePendingDocumentChange()) return false;
  if (_rapierSourceText() !== measured) { showToast('The document changed; try the action again', 'error'); return false; }
  const textarea = document.getElementById('source-textarea');
  const mode = rapier.view.mode;
  const selectionContext = mode !== 'source' && _rapierSelectionContext(window.getSelection());
  const bookmark = selectionContext ? _rapierSelectionBookmark({...selectionContext, selection: window.getSelection()}) : null;
  const before = _rapierSourceText(), stamp = Object.freeze(_rapierMutationStamp());
  const selectionBefore = mode === 'source' && textarea ? {
    start: _rapierAbsPos(textarea.selectionStart), end: _rapierAbsPos(textarea.selectionEnd),
  } : null;
  let candidate, retired;
  try {
    const preview = rapier.document.source.fork();
    for (const row of splices) preview.splice(row.pos, row.removed, row.inserted);
    candidate = preview.read();
    retired = rapier.document.docKind === 'markdown'
      ? globalThis.RapierKernel.imageDeletionSplices(before, candidate, splices) : [];
    for (const row of retired) preview.splice(row.pos, row.removed, row.inserted);
    if (retired.length) {
      splices = splices.concat(retired); candidate = preview.read();
      selection = _rapierAfterImageRetirement(selection, retired);
    }
  } catch (error) {
    showToast(error?.code === 'target_changed' ? 'The document changed; try the action again' :
      String(error?.message || 'That change cannot be applied'), 'error');
    return false;
  }
  // A splice near a <!--md-layout:...--> marker is checked with layoutTargets (a moved boundary strands the marker); far ones cannot.
  if (rapier.document.docKind === 'markdown' && md && globalThis.RapierMarkdownLayout &&
      splices.some(row => before.slice(Math.max(0, row.pos - 500), Math.min(before.length, row.pos + row.removed.length + 500)).includes('md-layout'))) {
    const badMarkers = text => {
      try { return globalThis.RapierMarkdownLayout.layoutTargets(text, md, _rapierMarkdownEnvironment())
        .filter(target => target.reason).length; }
      catch (_) { return 0; }
    };
    if (badMarkers(candidate) > badMarkers(before)) {
      showToast('The document changed; try the action again', 'error');
      return false;
    }
  }
  const busy = _rapierBeginSourceTransitionBusy();
  let loaded = false, committed = false, failure = null;
  try {
    loaded = await _loadMarkdownDoc(candidate, rapier.document.filename, stamp.loadToken, {
      sameDocument: true, preserveHistory: true, deferFlush: true, sourceSplices: splices,
      mutationOwner: rapier.sourceTransition, loadCommitGuard: stamp,
      requireVisualProjection: mode !== 'source',
      sourceProjectionCommit: prepared => {
        // Navigation does not cancel an admitted edit. Only source ownership can.
        if (prepared !== candidate || !_rapierMutationStampIsCurrent(stamp) ||
            rapier.access.readOnly || before !== _rapierSourceText()) return false;
        committed = !!_rapierCommitSplices(splices, {operation, selectionBefore, selectionAfter: selection,
          retiredImages: retired, retireProjection: false});
        if (committed) {
          try { _bumpDocGeneration(); }
          catch (error) { console.warn('[rapier] source projection generation presentation', error); }
          _rapierArmAutosave();
          try { _notifyHistoryState(); }
          catch (error) { console.warn('[rapier] source projection history presentation', error); }
        }
        return committed;
      },
    });
  } catch (error) { failure = error; console.warn('[rapier] source projection', error); }
  finally {
    try { _rapierEndSourceTransitionBusy(busy); }
    catch (error) { console.warn('[rapier] source transition presentation', error); }
  }
  try {
  if (!loaded) {
    showToast(committed ? 'The change is applied, but the view could not refresh' :
      !_rapierMutationStampIsCurrent(stamp) ? 'The document changed; try the action again' :
      /(?:limit|budget)$/.test(String(failure?.code || '')) ? 'This change is too big for this view; use source view' :
      'The change could not be displayed; your document is unchanged', 'error');
    _rapierRestoreEditorViewport(viewport);
    return committed;
  }
  if (!committed) return false;
  if (!_rapierMutationStampSharesDocument(stamp) || candidate !== _rapierSourceText()) return true;
  globalThis.RapierEmbeddedImages?.schedule();
  const retainSelection = (!viewport || viewport.token === rapier.view.restoreToken) &&
    (!navigationCurrent || navigationCurrent());
  if (mode === 'source') {
    const surface = document.getElementById('source-textarea');
    if (surface && selection && retainSelection) {
      _rapierFlatSelectAndReveal(selection.start, selection.end, false);
      surface.setSelectionRange(_rapierTaPos(selection.start), _rapierTaPos(selection.end), selection.direction || 'none');
    }
  } else if (retainSelection) _rapierRestoreSelectionBookmark(bookmark);
  _rapierRestoreEditorViewport(viewport, splices, {hold: true});
  return true;
  } catch (error) {
    console.warn('[rapier] source projection presentation', error);
    return committed;
  }
}

// The layout of an empty line (a blank paragraph or heading the caret stands in): the attributes a laid-out line's edit surface
// carries, so the caret shows it and the words typed next take it, written as the marker words already get, after them. Nothing
// is written to the source until there are words, and a line left empty writes nothing. `change` is the keys to set, a null taking
// one off (left is the default alignment, so it takes the attributes off); the line's other keys stay. False when the line is not
// empty or is not a paragraph or heading (a list item, a quote: nothing changes).
function _rapierLayoutEmptyLine(wrapper, change) {
  const edit = wrapper.classList.contains('block-wrapper--editing') ? wrapper.querySelector(':scope > .block-edit') : null;
  if (!edit || /\S/.test(String(edit.textContent || '')) || edit.querySelector('li, blockquote, pre, table, img, svg, hr, math, .math-rendered')) return false;
  let line = edit.querySelector('p, h1, h2, h3, h4, h5, h6');
  if (!line) {
    line = document.createElement('p');
    line.dir = 'ltr';
    while (edit.firstChild) line.appendChild(edit.firstChild);
    edit.appendChild(line);
  }
  const layout = globalThis.RapierMarkdownLayout, next = {...(layout.parseLayoutAttribute(line.getAttribute('data-md-layout')) || {})};
  for (const key of Object.keys(change)) { if (change[key] == null) delete next[key]; else next[key] = change[key]; }
  let marker;
  try { marker = layout.formatLayout(next); } catch (_) { return false; }
  if (marker) line.setAttribute('data-md-layout', encodeURIComponent(marker)); else line.removeAttribute('data-md-layout');
  for (const key of ['align', 'first', 'indent']) { if (next[key]) line.setAttribute('data-md-' + key, String(next[key])); else line.removeAttribute('data-md-' + key); }
  _rapierSeatCaretAtBlockStart(edit);
  _rapierRememberToolbarSelection(window.getSelection(), edit);
  _rapierUpdateAlignmentButton(window.getSelection());
  refreshFormatToolbar();
  return true;
}

function _rapierAlignEmptyLine(wrapper, align) { return _rapierLayoutEmptyLine(wrapper, {align: align === 'left' ? null : align}); }

// The direction a layout target's words read in: the first strong letter of its visible text, as the page draws the paragraph (dir=auto).
function _rapierTargetDirection(source, target) {
  try {
    const words = [];
    const walk = tokens => tokens.forEach(token => {
      if (token.type === 'text' || token.type === 'code_inline') words.push(token.content);
      if (token.children) walk(token.children);
    });
    walk(md.parse(String(source).slice(target.start, target.end), {}));
    return _rapierFirstStrongDir(words.join(' '));
  } catch (_) { return 'ltr'; }
}

// What Left writes for one paragraph: left is the default alignment of a left-to-right paragraph, so Left there takes the marker's
// alignment off (Word's Left writes nothing); on a right-to-left paragraph left is a side that means something, and it is written.
// The lead's ruling of 30 September. `text` is the source that `target` ranges over (editLayout in layout/markdown.mjs hands both).
function _rapierLeftAlignPatch(target, text) {
  return {align: _rapierTargetDirection(text, target) === 'rtl' ? 'left' : null, wrap: null, x: null, y: null};
}

async function rapierAlign(align) {
  if (!['left', 'center', 'right', 'justify'].includes(align)) return false;
  return _rapierEditLayout(align === 'left' ? _rapierLeftAlignPatch : {align, wrap: null, x: null, y: null}, 'document.align',
    wrapper => _rapierAlignEmptyLine(wrapper, align), () => _rapierUpdateAlignmentButton(window.getSelection()));
}

// Tab in a paragraph of its own (Shift+Tab takes one off): the first line is indented one more level, up to the grammar's four, as Word's Tab at a
// paragraph's start sets a first-line indent; written as `first` in the layout comment, one Undo step, never as characters in the words.
function rapierFirstLine(step) {
  const change = target => { const level = Math.max(0, Math.min(4, (target.layout.first || 0) + step)); return {first: level || null}; };
  return _rapierEditLayout(change, 'document.first-line', wrapper => {
    const line = wrapper.querySelector(':scope > .block-edit > p');
    const now = line && globalThis.RapierMarkdownLayout.parseLayoutAttribute(line.getAttribute('data-md-layout'));
    return _rapierLayoutEmptyLine(wrapper, change({layout: now || {}}));
  }, () => {});
}

// Edit the layout comment of the paragraphs a selection or the caret is in: `patch` is one object of fields for every target, or a function giving
// each its own (layout/markdown.mjs editLayout). `onEmptyLine(wrapper)` writes it on an empty line (which has no words to carry the comment), and
// `after` runs once the source is written.
async function _rapierEditLayout(patch, operation, onEmptyLine, after) {
  if (_rapierUserMutationBlocked() || rapier.document.docKind !== 'markdown') return false;
  const layout = globalThis.RapierMarkdownLayout;
  _rapierRestoreToolbarSelection();
  _rapierCheckpointPendingTyping();
  if (rapier.view.mode === 'source') {
    const textarea = document.getElementById('source-textarea');
    if (!textarea || !rapierCheckpointMarkdownSource()) return false;
    const source = _rapierSourceText();
    const range = {start: _rapierAbsPos(textarea.selectionStart), end: _rapierAbsPos(textarea.selectionEnd)};
    const opening = _rapierSplitOpeningFrontmatter(source), offset = opening.bodyOffset;
    if (range.start < offset) { showToast('Choose document text below its metadata', 'info'); return false; }
    const plan = layout.editLayout(opening.body, md, {start: range.start - offset, end: range.end - offset},
      patch, globalThis.RapierImageAssets.imageEnvironment(source));
    if (plan.reason) { showToast('This layout cannot be changed without altering its source', 'info'); return false; }
    for (const edit of plan.edits) { edit.start += offset; edit.end += offset; }
    const map = point => plan.edits.reduce((at, edit) => at + (edit.end <= point ? edit.text.length - (edit.end - edit.start) : 0), point);
    return _rapierCommitSourceProjection(plan.edits.slice().sort((a,b) => b.start-a.start)
      .map(edit => ({pos: edit.start, removed: source.slice(edit.start, edit.end), inserted: edit.text})),
      operation, {start: map(range.start), end: map(range.end), direction: textarea.selectionDirection});
  }
  const selection = window.getSelection();
  const context = _rapierSelectionContext(selection);
  // Across blocks the two ends decide, as they do for the format bar: a block between them that cannot be aligned (a picture, a rule, a page
  // break, a diagram, an expanding section, a footnote, raw HTML) is passed over, quietly, and the paragraphs around it are aligned (every
  // block having to be one that can be aligned, the press did nothing at all).
  let wrappers = context && _rapierSelectionActionableForFormat(context) ? context.wrappers : [];
  let range = context?.range || null;
  const image = _rapierImageRuntime.image;
  if (image?.isConnected) {
    const wrapper = image.closest('.block-wrapper');
    if (wrapper) { wrappers = [wrapper]; range = null; }
  }
  if (!wrappers.length) return false;
  // An empty line has no words to carry the layout marker (it is written after them): the alignment stands on the line itself.
  if (wrappers.length === 1 && range && range.collapsed && !image?.isConnected && onEmptyLine(wrappers[0])) return true;
  const state = {selection, range, wrappers,
    blocksBefore: wrappers.map(wrapper => _rapierHistoryBlock(_rapierBoundBlock(wrapper)))};
  const next = [];
  for (let index = 0; index < wrappers.length; index++) {
    const wrapper = wrappers[index], block = _rapierBoundBlock(wrapper);
    const raw = String(block.raw || '');
    if (wrappers.length > 1 && !_rapierSelectionWrapperActionable(wrapper)) { next.push(raw); continue; }
    let start = 0, end = raw.length;
    if (range) {
      const span = {start: 0, end: raw.length};
      if (wrapper.contains(range.startContainer)) start = _rapierRenderedBoundaryToCanonical(wrapper, block,
        range.startContainer, range.startOffset, span);
      if (wrapper.contains(range.endContainer)) end = _rapierRenderedBoundaryToCanonical(wrapper, block,
        range.endContainer, range.endOffset, span);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        const targets = layout.layoutTargets(raw, md, _rapierMarkdownEnvironment());
        if (targets.length !== 1) { showToast('Select the paragraph again to align it', 'info'); return false; }
        start = targets[0].start; end = targets[0].end;
      }
    }
    const plan = layout.editLayout(raw, md, {start, end}, patch, _rapierMarkdownEnvironment());
    if (plan.reason === 'no_layout_target') { next.push(raw); continue; }
    if (plan.reason) { showToast('This layout cannot be changed without altering its source', 'info'); return false; }
    let value = raw;
    for (const edit of plan.edits.slice().sort((a,b) => b.start-a.start))
      value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
    next.push(value);
  }
  const changed = _rapierApplyRawRange(state, next, {keepEditing: true});
  after();
  refreshFormatToolbar();
  return changed;
}
