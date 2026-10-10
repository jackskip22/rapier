// One contiguous source window hides the trailing image appendix. Canonical
// bytes, edits, selection offsets and history remain owned by the source store.
// The records show only when the person turns ASSETS on under CODE in the settings panel (off by default).
globalThis.RapierSourceAssets = (() => {
  let authority = '', expanded = false, cachedSource = null, boundary = -1, cached = null, prepared = null;
  const active = () => _rapierHeavyRuntime.window?.assetFold === true;
  const wanted = () => !!RapierPreferences.read('assets');
  function identity() {
    if (authority === rapier.identity.authority) return;
    authority = rapier.identity.authority;
    expanded = wanted(); cachedSource = null; boundary = -1; cached = null;
  }
  function info(source) {
    identity();
    if (rapier.document.docKind !== 'markdown' || source !== _rapierSourceText()) return null;
    const floor = active() ? _rapierHeavyRuntime.window.assetEnd ?? _rapierHeavyRuntime.window.endChar : 0;
    if (cachedSource === source && boundary === floor) return cached;
    cachedSource = source; boundary = floor; cached = null;
    if (prepared?.includeAssets && prepared.source === source && (prepared.floor === floor || prepared.summary?.start === floor)) {
      cached = prepared.summary;
      return cached;
    }
    try {
      cached = globalThis.RapierSourceWorker.sourceAssetSummary(source, floor, md);
    } catch (_) { /* Unrecognized or malformed source stays visible. */ }
    return cached;
  }
  async function prepare(source, {signal, onProgress, yield: pause, floor = 0, includeAssets = true} = {}) {
    const value = String(source ?? '');
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (prepared?.source === value && prepared.floor === floor && prepared.includeAssets === includeAssets &&
        _rapierSourceRuntime.documentLineStartCache.source === value) return prepared;
    const result = await globalThis.RapierSourceWorker.requestSourceWork(value, {kind: 'prepare', floor, includeAssets},
      {createWorker: _rapierFindRuntime.createWorker, signal, onProgress: fraction => onProgress?.(.8 * fraction), yield: pause});
    let text = value;
    if (value.includes('\r')) {
      const parts = [];
      let started = _rapierNow();
      for (let at = 0; at < value.length;) {
        let end = Math.min(value.length, at + 65536);
        if (value[end - 1] === '\r' && value[end] === '\n') end++;
        parts.push(_rapierNormalizeSourceNewlines(value.slice(at, end))); at = end;
        if (_rapierNow() - started >= 8) {
          onProgress?.(.8 + .19 * at / Math.max(1, value.length));
          await (pause ? pause() : _rapierYieldUserVisibleWork());
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
          started = _rapierNow();
        }
      }
      text = parts.join('');
    }
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const starts = new Uint32Array(result.starts);
    _rapierSourceRuntime.documentLineStartCache = {source: value, text, starts};
    // This pure reading survives identity installation; only identical source can use it.
    prepared = {source: value, floor, includeAssets, summary: result.summary, starts};
    onProgress?.(1);
    return prepared;
  }
  function refresh() {
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
      }
    }
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
    if (summary.start >= 262144) {
      _rapierHeavyWindowMountFromString(source, start, end, {...options, assetFold: true, assetEnd: summary.start});
      return true;
    }
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
  // The switch under CODE: show the records when it is on, fold them when it is off.
  async function sync() {
    if (rapier.view.mode !== 'source' || wanted() !== active()) return false;
    return toggle();
  }
  RapierPreferences.subscribe('assets', () => { void sync(); });
  return Object.freeze({active, mount, refresh, toggle, sync, prepare});
})();
