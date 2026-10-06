// One contiguous source window hides the trailing image appendix. Canonical
// bytes, edits, selection offsets and history remain owned by the source store.
globalThis.RapierSourceAssets = (() => {
  let authority = '', expanded = false, root = '', boundary = -1, cached = null;
  const active = () => _rapierHeavyRuntime.window?.assetFold === true;
  function identity() {
    if (authority === rapier.identity.authority) return;
    authority = rapier.identity.authority;
    expanded = false; root = ''; boundary = -1; cached = null;
  }
  function info(source) {
    identity();
    if (rapier.document.docKind !== 'markdown' || source !== _rapierSourceText()) return null;
    const floor = active() ? _rapierHeavyRuntime.window.endChar : 0;
    if (root === rapier.document.source.rootId && boundary === floor) return cached;
    root = rapier.document.source.rootId; boundary = floor; cached = null;
    try {
      const parsed = globalThis.RapierImageAssets.documentAssets(source);
      const opening = _rapierSplitOpeningFrontmatter(source), rows = [];
      let end = source.length;
      for (let index = parsed.blocks.length - 1; index >= 0; index--) {
        const row = parsed.blocks[index];
        if (!row.active || !row.topLevel || row.start < Math.max(floor, opening.bodyOffset) || row.status !== 'unverified' ||
            parsed.assets.get(row.id)?.status !== 'unverified' || !/^[ \t\r\n]*$/.test(source.slice(row.end, end))) break;
        rows.push(row); end = row.start;
      }
      if (!rows.length) return null;
      const recordStart = end;
      // Keep the separator with the hidden records: deleting at prose-end
      // must not join an image definition onto the preceding paragraph.
      while (end > Math.max(floor, opening.bodyOffset) && /[ \t\r\n]/.test(source[end - 1])) end--;
      if (end <= opening.bodyOffset && !active()) return null;
      cached = {start: end, recordStart, count: new Set(rows.map(row => row.id)).size, records: rows.length,
        bytes: rapier.document.source.utf8Bytes - _rapierSourceEncoder.encode(source.slice(0, end)).length};
    } catch (_) { /* Unrecognized or malformed source stays visible. */ }
    return cached;
  }
  function refresh() {
    const button = document.getElementById('source-image-data');
    if (!button) return;
    identity();
    const visible = rapier.view.mode === 'source' && rapier.document.docKind === 'markdown';
    const summary = visible ? info(_rapierSourceText()) : null;
    if (visible && active() && !summary && _rapierDocumentCommitAdmissionCurrent()) {
      // Prose can change the records' context (for example, an open fence).
      // Such source must become ordinary source again, with its real offsets.
      const ta = document.getElementById('source-textarea');
      if (ta) {
        const start = _rapierAbsPos(ta.selectionStart), end = _rapierAbsPos(ta.selectionEnd);
        const scrollTop = ta.scrollTop;
        expanded = true;
        _rapierCancelViewRestore();
        rapier.selection.scope = 'window';
        _rapierHeavyWindowReset();
        _rapierHeavyWindowMountFromString(_rapierSourceText(), start, end, {scrollTop});
        return;
      }
    }
    button.hidden = !summary;
    if (!summary) return;
    const folded = active();
    button.textContent = folded ? 'Show image data (' + summary.count + ')' : 'Hide image data';
    button.title = summary.bytes.toLocaleString() + ' bytes in ' + summary.records +
      (summary.records === 1 ? ' image reference' : ' image references');
    button.setAttribute('aria-expanded', folded ? 'false' : 'true');
    button.disabled = _rapierMutationBarrierActive() || rapier.composition.block || rapier.composition.source;
  }
  function mount(source, options = {}) {
    const ta = document.getElementById('source-textarea');
    const summary = info(source);
    if (!ta || !summary) return false;
    const start = Math.max(0, Number(options.start) || 0);
    const end = Math.max(start, Number(options.end ?? start) || 0);
    if (end > summary.start) expanded = true;
    if (expanded) {
      if (options.windowed) { refresh(); return false; }
      rapier.selection.scope = 'window';
      _rapierHeavyWindowMountFromString(source, start, end, options);
      refresh();
      return true;
    }
    rapier.selection.scope = 'window';
    _rapierHeavyWindowReset();
    const text = _rapierNormalizeSourceNewlines(source.slice(0, summary.start));
    _rapierHeavyRuntime.window = {startLine: 0, endLine: _rapierLineCount(text), suffixLines: 0,
      startChar: 0, endChar: summary.start, guardLoChars: -1, guardHiFromEnd: -1, assetFold: true};
    boundary = summary.start;
    ta.value = text;
    ta.setSelectionRange(_rapierTaPos(start), _rapierTaPos(end), options.direction || 'none');
    ta.scrollTop = options.scrollTop != null ? options.scrollTop : Math.max(0,
      _rapierLineFromPos(text, _rapierTaPos(start)) * _rapierMetrics().lineH - ta.clientHeight / 2);
    if (!options.skipRefresh) _rapierRefreshSourceProjection();
    refresh();
    return true;
  }
  async function toggle() {
    if (rapier.view.mode !== 'source' || rapier.document.docKind !== 'markdown' ||
        !_rapierDocumentCommitAdmissionCurrent()) return false;
    const captured = await _rapierCaptureSettledExternalDocument();
    if (!captured || !_rapierMutationStampIsCurrent(captured.stamp) || rapier.view.mode !== 'source' ||
        !_rapierDocumentCommitAdmissionCurrent()) return false;
    const ta = document.getElementById('source-textarea'), summary = info(captured.canonical);
    if (!ta || !summary) { refresh(); return false; }
    const start = _rapierAbsPos(ta.selectionStart), end = _rapierAbsPos(ta.selectionEnd);
    _rapierCancelViewRestore();
    rapier.selection.scope = 'window';
    expanded = active();
    if (expanded) {
      _rapierHeavyWindowMountFromString(captured.canonical, summary.recordStart, summary.recordStart);
    } else {
      mount(captured.canonical, {start: Math.min(start, summary.start), end: Math.min(end, summary.start)});
    }
    refresh();
    ta.focus({preventScroll: true});
    return true;
  }
  return Object.freeze({active, mount, refresh, toggle});
})();
