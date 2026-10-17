globalThis.RapierSourceAssets = (() => {
  let authority = '', expanded = false, cachedSource = null, boundary = -1, cached = null, prepared = null;
  let admitted = null, inertLine = null, excluded = null;
  const active = () => _rapierHeavyRuntime.window?.assetFold === true;
  const wanted = () => !!RapierPreferences.read('assets');
  function identity() {
    if (authority === rapier.identity.authority) return;
    authority = rapier.identity.authority;
    expanded = wanted(); cachedSource = null; boundary = -1; cached = null;
    admitted = null; inertLine = null; excluded = null;
    const value = rapier.document.source.read();
    if (prepared?.source !== value) prepared = null;
    if (_rapierSourceRuntime.documentLineStartCache.source !== value)
      _rapierSourceRuntime.documentLineStartCache = {source: null, text: null, starts: [0]};
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
    } catch (_) {  }
    return cached;
  }
  async function prepare(source, {signal, onProgress, yield: pause, floor = 0, includeAssets = true, store = null} = {}) {
    const value = String(source ?? '');
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (prepared?.source === value && prepared.floor === floor && prepared.includeAssets === includeAssets &&
        _rapierSourceRuntime.documentLineStartCache.source === value) return prepared;
    if (store?.lineStarts && store.read() === value && !value.includes('\r') && !value.includes(']:')) {
      const starts = store.lineStarts();
      _rapierSourceRuntime.documentLineStartCache = {source: value, text: value, starts, projection: null, views: new WeakMap()};
      prepared = {source: value, body: value.slice(_rapierSplitOpeningFrontmatter(value).bodyOffset), floor, includeAssets,
        summary: null, starts, imageIndex: null, bodyImageIndex: null, blockHashes: new Map()};
      onProgress?.(1);
      return prepared;
    }
    const result = await globalThis.RapierSourceWorker.requestSourceWork(value, {kind: 'prepare', floor, includeAssets},
      {createWorker: _rapierFindRuntime.createWorker, signal, onProgress: fraction => onProgress?.(.8 * fraction), yield: pause});
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const starts = new Uint32Array(result.starts);
    const sourceStarts = result.sourceStarts ? new Uint32Array(result.sourceStarts) : null;
    const views = new WeakMap();
    let projection = null;
    if (sourceStarts) {
      const bound = (offset, length, fallback) => {
        if (offset === undefined) return fallback;
        const at = Math.trunc(Number(offset)) || 0;
        return at < 0 ? Math.max(0, length + at) : Math.min(length, at);
      };
      const lineAt = offset => {
        let lo = 0, hi = starts.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (starts[mid] <= offset) lo = mid + 1; else hi = mid;
        }
        return Math.max(0, lo - 1);
      };
      const sourceAt = offset => {
        const line = lineAt(offset);
        return sourceStarts[line] + offset - starts[line];
      };
      const view = length => {
        const visibleStarts = starts.subarray(0, lineAt(length) + 1);
        const result = Object.freeze({length,
          slice(start, end) {
            const from = bound(start, length, 0), to = bound(end, length, length);
            return to <= from ? '' : _rapierNormalizeSourceNewlines(value.slice(sourceAt(from), sourceAt(to)));
          },
          prefix(end) { return view(bound(end, length, length)); },
        });
        views.set(result, visibleStarts);
        return result;
      };
      projection = view(result.projectedLength);
    }
    _rapierSourceRuntime.documentLineStartCache = {source: value, text: sourceStarts ? null : value,
      starts, projection, views};
    const bodyOffset = result.bodyOffset || 0, body = value.slice(bodyOffset);
    const imageIndex = result.imageIndex ? globalThis.RapierImageAssets.restoreAssetIndex(value, result.imageIndex,
      {offset: bodyOffset, bodyOffset}) : null;
    const bodyImageIndex = imageIndex && bodyOffset ? globalThis.RapierImageAssets.restoreAssetIndex(body, result.imageIndex) : imageIndex;
    const blockHashes = new Map((result.imageHashes || []).map(row => [value.slice(row.start, row.end), row.hash]));
    prepared = {source: value, body, floor, includeAssets, summary: result.summary, starts, imageIndex, bodyImageIndex, blockHashes};
    onProgress?.(1);
    return prepared;
  }
  function preparedSummaryForStore(store) {
    identity();
    if (rapier.document.docKind !== 'markdown') return null;
    if (admitted?.key === store.cacheKey) return admitted.summary;
    const value = store.read();
    const summary = prepared?.includeAssets && prepared.source === value ? prepared.summary : info(value);
    admitted = {key: store.cacheKey, summary};
    return summary;
  }
  function mayRetireImages(rows) {
    identity();
    const store = rapier.document.source, row = rows.length === 1 ? rows[0] : null;
    if (row && excluded?.key === store.cacheKey && row.pos >= excluded.start &&
        row.pos + row.removed.length <= excluded.end) return false;
    const hint = {};
    const possible = globalThis.RapierImageAssets.mayRetireImageDefinitions(store, rows, undefined, hint);
    excluded = hint.excluded && {key: store.cacheKey, ...hint.excluded};
    return possible;
  }
  function changing(store, row) {
    identity();
    const key = store.cacheKey, stop = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
    let plain = false;
    if (_rapierHeavyRuntime.window?.assetFold && _rapierHeavyRuntime.window.assetKey === key &&
        /^[a-zA-Z0-9 ]*$/.test(row.removed + row.inserted) && store.lineAt) {
      if (inertLine?.key !== key || row.pos <= inertLine.start || stop > inertLine.end) {
        const line = store.lineAt(row.pos), start = store.lineStart(line), end = store.lineEnd(line);
        const content = store.readSlice(start, end);
        inertLine = stop <= end && /^[a-zA-Z]/.test(content) && /^[^`~<>\[\]\\\r\n]*$/.test(content)
          ? {key, start, end} : null;
      }
      plain = !!(inertLine?.key === key && row.pos > inertLine.start && stop <= inertLine.end);
    }
    const negative = excluded?.key === key && row.pos > excluded.start && stop <= excluded.end &&
      !/[!\[\r\n]/.test(row.inserted + row.removed) ? {...excluded, end: excluded.end + delta} : null;
    return {key, plain, delta, negative};
  }
  function spliced(store, row, proof) {
    const win = _rapierHeavyRuntime.window;
    if (win?.assetFold) {
      if (win.assetKey === proof.key && proof.plain && row.pos + row.removed.length <= win.assetEnd) {
        win.assetKey = store.cacheKey;
        win.assetEnd += proof.delta;
        win.assetSuffix = store.length - win.assetEnd;
      } else {
        win.assetKey = null;
        if (row.pos + row.removed.length < win.assetEnd) win.assetEnd += proof.delta;
      }
    }
    inertLine = proof.plain ? {...inertLine, key: store.cacheKey, end: inertLine.end + proof.delta} : null;
    excluded = proof.negative && {...proof.negative, key: store.cacheKey};
    admitted = null;
  }
  function unfoldFoldedAppendix(source) {
    const ta = document.getElementById('source-textarea');
    if (!ta || !_rapierDocumentCommitAdmissionCurrent()) return;
    const start = _rapierAbsPos(ta.selectionStart), end = _rapierAbsPos(ta.selectionEnd);
    const scrollTop = ta.scrollTop;
    expanded = true;
    _rapierCancelViewRestore();
    rapier.selection.scope = 'window';
    _rapierHeavyWindowReset();
    _rapierHeavyWindowMountFromString(source, start, end, {scrollTop, preserveAssets: true});
  }
  function refresh() {
    identity();
    if (_rapierHeavyRuntime.composing || rapier.view.mode !== 'source' || rapier.document.docKind !== 'markdown') return;
    const source = rapier.document.source;
    const win = _rapierHeavyRuntime.window;
    if (win?.assetFold && win.assetKey !== source.cacheKey) {
      const selected = _rapierHeavyRuntime.selection
        ? _rapierHeavyRuntime.selection(document.getElementById('source-textarea'))
        : {start: 0, end: 0};
      const ta = document.getElementById('source-textarea'), scrollTop = ta?.scrollTop || 0;
      win.assetFold = false;
      const summary = preparedSummaryForStore(source);
      if (summary && !expanded && selected.end <= summary.start) {
        mount(source, {...selected, scrollTop, skipRefresh: true});
      } else {
        _rapierHeavyWindowMountFromString(source, selected.start, selected.end,
          {...selected, preserveAssets: true, skipRefresh: true, scrollTop});
      }
    }
  }

  function mount(source, options = {}) {
    const ta = document.getElementById('source-textarea');
    const store = rapier.document.source;
    const summary = typeof source === 'string' ? info(source)
      : source === store ? preparedSummaryForStore(store) : null;
    if (!ta || !summary) return false;
    let start = Math.max(0, Number(options.start) || 0);
    let end = Math.max(start, Number(options.end ?? start) || 0);
    if (options.refold) {
      expanded = wanted();
      if (!expanded) { start = Math.min(start, summary.start); end = Math.min(end, summary.start); }
    }
    if (end > summary.start) expanded = true;
    if (expanded) {
      if (options.windowed) { refresh(); return false; }
      rapier.selection.scope = 'window';
      _rapierHeavyWindowMountFromString(rapier.document.source, start, end, options);
      refresh();
      return true;
    }
    rapier.selection.scope = 'window';
    _rapierHeavyWindowReset();
    if (summary.start >= 32768) {
      _rapierHeavyWindowMountFromString(rapier.document.source, start, end, {...options, assetFold: true, assetEnd: summary.start, assetKey: store.cacheKey});
      return true;
    }
    const prose = typeof source === 'string' ? source.slice(0, summary.start) : source.readSlice(0, summary.start);
    const text = _rapierNormalizeSourceNewlines(prose);
    _rapierHeavyRuntime.window = {startLine: 0, endLine: _rapierLineCount(text), suffixLines: 0,
      startChar: 0, endChar: summary.start, guardLoChars: -1, guardHiFromEnd: -1, assetFold: true,
      assetEnd: summary.start, assetSuffix: rapier.document.source.length - summary.start,
      assetKey: store.cacheKey};
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
      _rapierHeavyWindowMountFromString(rapier.document.source, summary.recordStart, summary.recordStart);
    } else {
      mount(captured.canonical, {start: Math.min(start, summary.start), end: Math.min(end, summary.start)});
    }
    refresh();
    ta.focus({preventScroll: true});
    return true;
  }
  async function sync() {
    if (rapier.view.mode !== 'source' || wanted() !== active()) return false;
    return toggle();
  }
  RapierPreferences.subscribe('assets', () => { void sync(); });
  const imageIndex = source => prepared?.source === source ? prepared.imageIndex : prepared?.body === source ? prepared.bodyImageIndex : null;
  const blockHash = raw => prepared?.blockHashes.get(raw) || null;
  return Object.freeze({active, mount, refresh, toggle, sync, prepare, imageIndex, blockHash, mayRetireImages, changing, spliced});
})();
