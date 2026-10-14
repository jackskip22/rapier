// SPDX-License-Identifier: AGPL-3.0-only
(function () {
  const host = document.getElementById('editor-blocks');
  if (!host) return;
  const prefix = 'rapier:changes-seen:';
  let documentId = '', revision = -1, generation = -1, places = [], seen = {keys: new Set(), spans: []};
  let comparison = null, snapshot = null, seenRoot = null, seenKey = {text: null, key: ''};
  let active = null, dirty = true, timer = 0, frame = 0, ticket = 0, viewTicket = 0, running = null, typingUntil = 0;
  let presenceValue = null, hold = null, swallowedClick = null;
  const marks = new Map();
  const layer = document.createElement('div');
  layer.className = 'rapier-changes-layer';
  const away = document.createElement('div');
  away.className = 'rapier-changes-away'; away.hidden = true;
  const words = document.createElement('span'); words.className = 'rapier-changes-away__words';
  const count = document.createElement('span'); count.className = 'rapier-changes-away__count';
  const phrase = document.createElement('span');
  words.append(count, phrase);
  const nextButton = button('Next', 'Next unseen change');
  nextButton.append(arrow('right'));
  away.append(words, nextButton);
  const edge = button('', 'Go to the agent');
  edge.className = 'rapier-changes-presence'; edge.hidden = true;
  layer.append(away, edge); document.body.append(layer);

  function button(text, label) {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    if (label) node.setAttribute('aria-label', label);
    return node;
  }
  function arrow(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', direction === 'up' ? 'M8 13V3M3 8l5-5 5 5'
      : direction === 'down' ? 'M8 3v10M3 8l5 5 5-5' : 'M3 8h10M8 3l5 5-5 5');
    svg.append(path); return svg;
  }
  function identity() { return String(rapier.identity.authority || ''); }
  function inDraw() { return typeof _rapierDrawState !== 'undefined' && _rapierDrawState.open; }
  function busy() {
    return !!(rapier.composition.block || rapier.composition.source ||
      _rapierMutationBarrierActive() || performance.now() < typingUntil);
  }
  function stored(id) {
    try {
      const value = JSON.parse(localStorage.getItem(prefix + id) || '{}');
      return {keys: new Set(Array.isArray(value?.keys) ? value.keys.filter(key => typeof key === 'string') : []),
        spans: Array.isArray(value?.spans) ? value.spans.filter(span => span && typeof span.actId === 'string' &&
          Number.isSafeInteger(span.from) && span.from >= 0 && Number.isSafeInteger(span.to) && span.to >= span.from) : []};
    } catch (_) { return {keys: new Set(), spans: []}; }
  }
  function isSeen(place) {
    return seen.keys.has(place.key) || (place.kind === 'text' && place.coverage?.length > 0 &&
      place.coverage.every(range => seen.spans.some(span => span.actId === range.actId && span.from <= range.from && span.to >= range.to)));
  }
  function remember(rows) {
    const combined = stored(documentId);
    for (const key of seen.keys) combined.keys.add(key);
    combined.spans.push(...seen.spans);
    for (const place of rows) {
      combined.keys.add(place.key);
      combined.spans.push(...(place.coverage || []));
    }
    combined.spans.sort((a, b) => a.actId.localeCompare(b.actId) || a.from - b.from || a.to - b.to);
    const spans = [];
    for (const span of combined.spans) {
      const prior = spans.at(-1);
      if (prior?.actId === span.actId && prior.to >= span.from) prior.to = Math.max(prior.to, span.to);
      else spans.push({...span});
    }
    combined.spans = spans;
    seen = combined;
    try { localStorage.setItem(prefix + documentId, JSON.stringify({keys: [...combined.keys], spans})); } catch (_) {}
  }
  function groupKey(act) {
    return JSON.stringify([act.actor.kind, act.actor.id, act.turnId || null, act.turnId ? null : act.id]);
  }
  function otherAuthor(actor) {
    return actor?.kind === 'agent' || actor?.kind === 'human' && _rapierLive.active() && actor.id !== _rapierLive.author()?.id;
  }
  function imageOnly(source) {
    const images = _rapierRenderModule('render')._rapierScanMarkdownImages(source);
    if (!images.length) return false;
    let end = 0;
    for (const image of images) {
      if (source.slice(end, image.start).trim()) return false;
      end = image.end;
    }
    return !source.slice(end).trim();
  }
  function reset() {
    ticket++; close(); clearTimeout(timer); timer = 0; running = null;
    documentId = identity(); revision = generation = -1; seen = stored(documentId); places = []; comparison = snapshot = seenRoot = null;
    dirty = true; presenceValue = null;
    for (const mark of marks.values()) mark.remove();
    marks.clear(); away.hidden = edge.hidden = true;
    schedule();
  }
  function schedule() {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; void refresh(); }, Math.max(180, typingUntil - performance.now()));
  }
  function scheduleLocate() {
    if (!frame && (marks.size || active || presenceValue?.active || !away.hidden || !edge.hidden || layer.parentElement !== document.body))
      frame = requestAnimationFrame(locate);
  }
  function currentRows() {
    const drawing = globalThis.RapierChangesDraw;
    const rows = drawing?.currentPlaces(places.filter(place => place.kind === 'drawing')) || [];
    return (inDraw() ? rows : places).filter(place => !isSeen(place));
  }
  function summary() {
    return {ok: true, documentId, revision, places: structuredClone(currentRows()), activeKey: active?.key || null};
  }
  let worker = null, jobs = 0;
  function compare(before, after, options) {
    worker ||= _rapierCompareMakeWorker().catch(() => null);
    return worker.then(live => live ? new Promise((resolve, reject) => {
      const jobId = ++jobs;
      const end = () => { live.removeEventListener('message', done); live.removeEventListener('error', fail); };
      const done = event => {
        if (event.data?.jobId !== jobId) return;
        end();
        if (event.data.status === 'error') reject(new Error('comparison unavailable'));
        else resolve({...event.data.diff, regions: event.data.regions});
      };
      const fail = () => { end(); worker = null; live.terminate(); reject(new Error('comparison unavailable')); };
      live.addEventListener('message', done); live.addEventListener('error', fail);
      live.postMessage({type: 'compare', jobId, currentText: before, incomingText: after, docKind: options.docKind,
        language: options.language, from: options.from, regions: true});
    }) : RapierDiff.compare(before, after, {...options,
      ...(globalThis.RapierDiffStructure ? {structure: source => globalThis.RapierDiffStructure.diffStructure(source, options)} : {})}));
  }
  async function snapshotPlaces(input, blocks, id, rev, gen) {
    const before = rapier.review?.seen ? _rapierReviewText(rapier.review.seen) : null, after = input.source;
    if (before == null || before === after) return {review: null, places: []};
    if (!comparison || comparison.before !== before || comparison.after !== after || comparison.revision !== rev || comparison.documentId !== id) {
      const options = {docKind: rapier.document.docKind, language: rapier.document.codeLang || '',
        from: globalThis.RapierJournalRecords.journalOperations(before, after, input.records)};
      const result = await compare(before, after, options);
      comparison = {before, after, revision: rev, documentId: id, result};
    }
    const {result} = comparison;
    const lineage = globalThis.RapierLedger.historyPlaces(input, result.edits.map((edit, index) =>
      ({id: index, from: edit.after[0], to: edit.after[1]})));
    if (!lineage.ok) throw new Error(lineage.reason);
    const recorded = new Set(lineage.blocks.filter(block => block.acts.some(act =>
      act.operation !== 'document.restore-change')).map(block => block.id));
    if (seenKey.text !== before) seenKey = {text: before, key: _rapierSeenDigest(before)};
    const rows = [], baselineKey = seenKey.key;
    for (const change of result.changes) {
      if (change.edits.some(index => recorded.has(index))) continue;
      const changeKey = [baselineKey, change.kind, change.edits.map(index => {
        const edit = result.edits[index];
        return [edit.before, _rapierSeenDigest(before.slice(...edit.before)), _rapierSeenDigest(after.slice(...edit.after))];
      })];
      const visited = new Set();
      for (const region of result.regions) {
        if (!region.changeIds?.includes(change.id)) continue;
        const start = region.after?.from ?? region.afterAnchor, end = region.after?.to ?? start;
        const block = blocks.find(block => block.from <= start && start < block.to)
          || blocks.find(block => block.from >= start) || blocks.at(-1);
        if (!block || visited.has(block.id) || globalThis.RapierImageAssets.isAssetBlock(block.raw)) continue;
        visited.add(block.id);
        rows.push({kind: 'text', key: JSON.stringify(['snapshot', changeKey, region.before?.from ?? region.beforeAnchor]),
          diffIds: [change.id], change: {kind: change.kind, unit: change.unit, ...(change.name ? {name: change.name} : {})},
          blockId: block.id, from: block.from, to: block.to, displayAfter: [start, end],
          before: region.before?.text || '', after: region.after?.text || '', current: region.after?.text || '',
          actor: {name: change.name || 'Changes'}});
      }
    }
    return {review: {documentId: id, revision: rev, generation: gen, identityEpoch: rapier.identity.epoch, metadata: {...input.metadata}, before, after,
      result: {edits: result.edits, changes: result.changes}}, places: rows};
  }
  async function refresh() {
    if (documentId !== identity()) reset();
    if (busy()) { schedule(); return {ok: false, reason: 'editing_in_progress'}; }
    if (!dirty && revision === rapier.revision.settled && generation === rapier.revision.generation && seenRoot === rapier.review?.seen) {
      renderMarks(); return summary();
    }
    if (running) return running;
    const run = ++ticket, id = identity(), rev = rapier.revision.settled, gen = rapier.revision.generation;
    const valid = () => run === ticket && id === identity() && rev === rapier.revision.settled && gen === rapier.revision.generation && !busy();
    running = (async () => {
      const records = rapier.undo.ledger.slice();
      const source = _rapierSourceText();
      const spans = _rapierExcerptCanonicalBlockSpans();
      const blocks = rapier.document.docKind === 'markdown' ? rapier.document.blocks.map(block => ({
        id: block.id, raw: block.raw, from: spans.get(block.id)?.start, to: spans.get(block.id)?.end,
      })).filter(block => Number.isSafeInteger(block.from) && Number.isSafeInteger(block.to))
        : [{id: null, raw: source, from: 0, to: source.length}];
      const input = {source, records, revision: rev, earliestRevision: rapier.undo.earliestRevision, earliestRoot: _rapierUndoEarliestHash(),
        metadata: _rapierDocumentMetadata()};
      const projected = globalThis.RapierLedger.historyPlaces(input, blocks);
      if (!projected.ok) return projected;
      const fallback = await snapshotPlaces(input, blocks, id, rev, gen), next = fallback.places;
      if (!valid()) { dirty = true; schedule(); return {ok: false, reason: 'document_changed'}; }
      for (const block of projected.blocks) {
        if (globalThis.RapierImageAssets.isAssetBlock(block.source)) continue;
        const groups = new Map();
        for (const act of block.acts) {
          if (!otherAuthor(act.actor) || projected.reversed.includes(act.id)) continue;
          const key = groupKey(act), group = groups.get(key);
          const coverage = {actId: act.id, from: act.after.from, to: act.after.to};
          if (group) { group.actIds.push(act.id); group.coverage.push(coverage); group.after = act.after.source; group.act = act; }
          else groups.set(key, {kind: 'text', groupKey: key, actId: act.id, actIds: [act.id], act,
            blockId: block.id, from: block.from, to: block.to, before: act.before.source, after: act.after.source,
            origin: [act.after.from, act.after.to], coverage: [coverage]});
        }
        for (const group of groups.values()) {
          group.key = JSON.stringify(['text', group.groupKey, group.actIds, group.origin]);
          group.actor = group.act.actor; group.createdAt = group.act.createdAt;
          group.turnId = group.act.turnId; group.current = block.source;
          next.push(group);
        }
      }
      const drawing = await globalThis.RapierChangesDraw?.sourcePlaces({...input, blocks, replay: projected,
        acts: projected.acts.filter(act => otherAuthor(act.actor) && !projected.reversed.includes(act.id)), current: valid}) || [];
      if (!valid()) { dirty = true; schedule(); return {ok: false, reason: 'document_changed'}; }
      snapshot = fallback.review;
      for (const place of drawing) {
        place.actIds ||= [place.actId]; place.actor ||= place.act?.actor; place.createdAt ||= place.act?.createdAt;
      }
      const drawingBlocks = new Set(drawing.map(place => place.blockId));
      const imageOnlyBlocks = new Map();
      places = [...next.filter(place => {
        if (!drawingBlocks.has(place.blockId)) return true;
        if (!imageOnlyBlocks.has(place.blockId)) imageOnlyBlocks.set(place.blockId, imageOnly(place.current));
        return !imageOnlyBlocks.get(place.blockId);
      }), ...drawing]
        .sort((a, b) => a.from - b.from || (a.createdAt || 0) - (b.createdAt || 0) || a.key.localeCompare(b.key));
      revision = rev; generation = gen; seenRoot = rapier.review?.seen; dirty = false;
      if (active && (!places.some(place => place.key === active.key) || active.revision !== rev)) close();
      renderMarks(); return summary();
    })().catch(error => {
      console.warn('[rapier] change projection unavailable', error);
      return {ok: false, reason: 'history_unavailable'};
    }).finally(() => { if (run === ticket) running = null; });
    return running;
  }
  function wrapper(place) {
    if (place.kind === 'drawing') return globalThis.RapierChangesDraw?.container(place);
    return place.blockId == null ? document.getElementById('source-mode')
      : host.querySelector(':scope > [data-block-id="' + CSS.escape(String(place.blockId)) + '"]');
  }
  function rect(place) {
    if (place.kind === 'drawing') return globalThis.RapierChangesDraw?.getRect(place);
    const home = wrapper(place);
    const reading = home?.querySelector('.rapier-changes-before') || home?.querySelector('.block-read, .block-edit');
    return reading?.getBoundingClientRect() || home?.getBoundingClientRect();
  }
  function renderMarks() {
    const rows = currentRows(), live = new Set(rows.map(place => place.key));
    for (const [key, mark] of marks) if (!live.has(key)) { mark.remove(); marks.delete(key); }
    rows.forEach((place, index) => {
      let mark = marks.get(place.key);
      if (!mark) {
        mark = button('', 'Show the before of change ' + (index + 1));
        mark.className = 'rapier-changes-mark';
        mark.append(document.createElement('span'));
        mark.addEventListener('click', event => { event.stopPropagation(); void show(place.key, {focus: event.detail === 0}); });
        marks.set(place.key, mark); layer.append(mark);
      }
      mark.firstChild.textContent = String(index + 1);
      mark.setAttribute('aria-label', 'Show the before of change ' + (index + 1));
      mark.setAttribute('aria-expanded', String(active?.key === place.key));
    });
    count.textContent = String(rows.length);
    phrase.textContent = rows.length === 1 ? 'place changed' : 'places changed';
    nextButton.disabled = !rows.length;
    if (!rows.length) away.hidden = true;
    scheduleLocate();
  }
  function viewport() {
    const surface = inDraw() ? _rapierDrawState.stageEl || _rapierDrawState.surface
      : rapier.view.mode === 'source' ? document.getElementById('source-mode') : host;
    const bounds = surface?.getBoundingClientRect() || host.getBoundingClientRect();
    const tools = inDraw() ? null : document.querySelector('.rapier-image-tools:not([hidden])');
    if (!tools?.getClientRects().length) return bounds;
    const bottom = Math.min(bounds.bottom, tools.getBoundingClientRect().top);
    return {left: bounds.left, top: bounds.top, right: bounds.right, bottom,
      width: bounds.width, height: Math.max(0, bottom - bounds.top)};
  }
  function locate() {
    frame = 0;
    const parent = inDraw() ? _rapierDrawState.surface : document.body;
    if (parent && layer.parentElement !== parent) { parent.append(layer); layer.inert = false; layer.removeAttribute('aria-hidden'); }
    const rows = currentRows(), bounds = viewport();
    const live = new Set(rows.map(place => place.key));
    for (const [key, mark] of marks) if (!live.has(key)) mark.hidden = true;
    const obscured = rapier.compare.active || document.hidden || !bounds.height ||
      document.getElementById('settings-overlay')?.getAttribute('aria-hidden') === 'false';
    let left = Math.max(16, bounds.left + 16), right = bounds.right - 16;
    const firstBlock = host.querySelector(':scope > .block-wrapper');
    const firstRead = firstBlock?.querySelector('.rapier-changes-before') || firstBlock?.querySelector('.block-read');
    if (!inDraw() && rapier.view.mode !== 'source' && firstRead) {
      const readBox = firstRead.getBoundingClientRect(); left = Math.max(16, readBox.left); right = readBox.right;
    }
    away.hidden = obscured || !rows.length || !!inDraw();
    away.style.left = left + 'px'; away.style.top = bounds.top + 'px';
    away.style.width = Math.max(0, right - left) + 'px';
    const occupied = [];
    rows.forEach(place => {
      const mark = marks.get(place.key); if (!mark) return;
      const box = rect(place);
      const visible = !obscured && box && box.height >= 0 && box.bottom > bounds.top + 2 && box.top < bounds.bottom - 2;
      mark.hidden = !visible;
      if (!visible) return;
      let y = Math.max(bounds.top + (inDraw() ? 4 : 42), box.top);
      const x = Math.max(bounds.left, box.left - 20);
      while (occupied.some(prior => Math.abs(prior.x - x) < 18 && Math.abs(prior.y - y) < 22)) y += 23;
      if (y + 24 > bounds.bottom) { mark.hidden = true; return; }
      occupied.push({x, y});
      mark.style.left = x + 'px'; mark.style.top = y + 'px';
    });
    globalThis.RapierChangesDraw?.updateBefore();
    if (active?.place.kind === 'drawing') {
      const box = rect(active.place), controls = active.controls;
      if (box && controls) {
        controls.style.left = Math.max(bounds.left + 16, Math.min(box.left, bounds.right - controls.offsetWidth - 16)) + 'px';
        controls.style.top = Math.min(bounds.bottom - controls.offsetHeight - 16, Math.max(bounds.top + 16, box.bottom + 8)) + 'px';
      }
    }
    const target = presenceValue?.target;
    const element = target?.startBlock ? host.querySelector(':scope > [data-block-id="' + CSS.escape(String(target.startBlock.id)) + '"]')
      : presenceValue?.blockId != null ? host.querySelector(':scope > [data-block-id="' + CSS.escape(String(presenceValue.blockId)) + '"]') : null;
    const agentBox = element?.getBoundingClientRect();
    const direction = agentBox && (agentBox.top >= bounds.bottom - 24 ? 'down' : agentBox.bottom <= bounds.top + 40 ? 'up' : '');
    edge.hidden = obscured || !presenceValue?.active || !direction || !!inDraw();
    if (!edge.hidden) {
      edge.replaceChildren(arrow(direction));
      edge.setAttribute('aria-label', 'Go to ' + (presenceValue.name || 'the agent') + (direction === 'down' ? ' below' : ' above'));
      edge.style.left = Math.max(0, left - 20) + 'px';
      edge.style.top = (direction === 'down' ? bounds.bottom - 30 : bounds.top + 42) + 'px';
    }
  }
  function close() {
    viewTicket++;
    if (active) {
      const ownsFocus = active.preview?.contains(document.activeElement) || active.controls?.contains(document.activeElement);
      const opener = active.opener;
      active.preview?.remove(); active.controls?.remove(); active.home?.classList.remove('rapier-changes-open');
      active = null;
      if (ownsFocus) {
        const available = opener?.isConnected && !opener.closest('[inert],[hidden],[aria-hidden="true"]');
        (available ? opener : host).focus({preventScroll: true});
      }
    }
    globalThis.RapierChangesDraw?.closeBefore();
    for (const mark of marks.values()) mark.setAttribute('aria-expanded', 'false');
    scheduleLocate();
  }
  function beforeText(place) {
    if (place.actId || !snapshot) return place.before;
    let [from, to] = place.displayAfter, value = snapshot.after.slice(from, to);
    for (const row of RapierDiff.restoreEdits(snapshot.before, snapshot.after, snapshot.result, place.diffIds)) {
      const end = row.pos + row.removed.length, shift = row.inserted.length - row.removed.length;
      if (end < from || end === from && row.pos < from) { from += shift; to += shift; }
      else if (row.pos > to || row.pos === to && row.removed.length) continue;
      else if (row.pos >= from && end <= to) {
        value = value.slice(0, row.pos - from) + row.inserted + value.slice(end - from); to += shift;
      } else return place.before;
    }
    return value;
  }
  async function renderBefore(place) {
    const history = place.actId ? globalThis.RapierLedger.sourceBefore({source: _rapierSourceText(), records: rapier.undo.ledger,
      revision: rapier.revision.settled, earliestRevision: rapier.undo.earliestRevision, metadata: _rapierDocumentMetadata()}, place.actId)
      : {ok: !!snapshot, source: snapshot?.before};
    if (!history.ok) throw new Error(history.reason);
    const references = _rapierBuildReferenceIndex(await splitMarkdownBlocksAsync(history.source), history.source);
    const node = document.createElement('div');
    node.className = 'block-read rapier-changes-before'; node.contentEditable = 'false';
    const after = document.createElement('div');
    const previous = beforeText(place);
    node.innerHTML = _rapierRenderModule('render-sanitize').sanitizeRapierHtml(renderBlock(previous, references));
    after.innerHTML = _rapierRenderModule('render-sanitize').sanitizeRapierHtml(renderBlock(place.current));
    if (!previous.trim()) {
      node.replaceChildren(...after.childNodes); node.classList.add('rapier-changes-added'); return node;
    }
    const textNodes = root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode(text) {
        return text.parentElement?.closest('button, .code-copy-btn, .katex, svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }});
      const result = []; for (let text = walker.nextNode(); text; text = walker.nextNode()) result.push(text);
      return result;
    };
    const texts = textNodes(node), prior = texts.map(text => text.data).join('');
    const current = textNodes(after).map(text => text.data).join('');
    const {edits} = RapierDiff.diff(prior, current, {as: 'prose', limit: 1000000});
    if (edits.some(edit => edit.coarse)) {
      node.classList.add('rapier-changes-removed'); return node;
    }
    const point = at => {
      for (const text of texts) { if (at <= text.length) return [text, at]; at -= text.length; }
      return [node, node.childNodes.length];
    };
    for (const edit of edits.slice().reverse()) {
      const [from, to] = edit.before, inserted = current.slice(...edit.after);
      const range = document.createRange(); range.setStart(...point(from)); range.setEnd(...point(to));
      if (from !== to) {
        const removed = document.createElement('del'); removed.className = 'rapier-changes-removed';
        removed.append(range.extractContents()); range.insertNode(removed);
        if (inserted) { const added = document.createElement('ins'); added.className = 'rapier-changes-added'; added.textContent = inserted; removed.after(added); }
      } else if (inserted) {
        const added = document.createElement('ins'); added.className = 'rapier-changes-added'; added.textContent = inserted; range.insertNode(added);
      }
    }
    return node;
  }
  async function show(key, options = {}) {
    const opener = document.activeElement;
    if (active?.key === key) { close(); return {ok: true, closed: true}; }
    const state = await refresh(); if (!state.ok) return state;
    const place = currentRows().find(row => row.key === key);
    if (!place || documentId !== identity()) return {ok: false, reason: 'act_unavailable'};
    close();
    const home = wrapper(place); if (!home) return {ok: false, reason: 'place_unavailable'};
    if (home.classList.contains('block-wrapper--editing') || home.querySelector('.block-edit:focus'))
      return {ok: false, reason: 'editing_in_progress'};
    const selected = {documentId, revision, generation, ticket, viewTicket};
    const current = () => selected.documentId === identity() && selected.revision === rapier.revision.settled &&
      selected.generation === rapier.revision.generation && selected.ticket === ticket && selected.viewTicket === viewTicket && home.isConnected &&
      !home.classList.contains('block-wrapper--editing') && !home.querySelector('.block-edit:focus') && !busy();
    if (options.scroll) {
      home.scrollIntoView({block: 'center', behavior: 'instant'});
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!current()) return {ok: false, reason: 'document_changed'};
    }
    let preview = null;
    if (place.kind === 'drawing') {
      if (!place.live && home.classList.contains('block-wrapper')) _rapierWysiwygWake(home);
      if (!globalThis.RapierChangesDraw?.showBefore(place)) return {ok: false, reason: 'place_unavailable'};
    } else if (place.blockId == null) {
      preview = document.createElement('pre'); preview.className = 'rapier-changes-before rapier-changes-source';
      preview.textContent = beforeText(place); home.append(preview); home.classList.add('rapier-changes-open');
    } else {
      _rapierWysiwygWake(home);
      try { preview = await renderBefore(place); }
      catch (_) { return {ok: false, reason: 'history_unavailable'}; }
      if (!current()) return {ok: false, reason: 'document_changed'};
      home.append(preview); home.classList.add('rapier-changes-open');
    }
    if (preview) { preview.tabIndex = -1; preview.setAttribute('role', 'region'); preview.setAttribute('aria-label', 'Before this change'); }
    const controls = document.createElement('div'); controls.className = 'rapier-changes-controls'; controls.contentEditable = 'false';
    controls.addEventListener('click', event => event.stopPropagation());
    if (place.kind === 'drawing') controls.classList.add('rapier-changes-controls--drawing');
    const who = document.createElement('span'); who.className = 'rapier-changes-controls__who';
    const name = document.createElement('strong'); name.textContent = place.actor?.name || place.act?.actor?.name || (place.actor?.kind === 'human' ? 'Person' : 'Agent');
    const rows = currentRows(), index = rows.findIndex(row => row.key === key);
    who.append(name, document.createTextNode(' · ' + String(index + 1).padStart(2, '0') + ' / ' + String(rows.length).padStart(2, '0')));
    who.title = place.act?.turnLabel || place.act?.label || '';
    const undoButton = button('Undo', place.act?.turnId ? 'Undo this turn, keeping later edits' : 'Undo this change, keeping later edits');
    const doneButton = button('Done', 'Mark this change seen');
    undoButton.addEventListener('click', () => void undo(key)); doneButton.addEventListener('click', () => done(key));
    controls.append(who, undoButton, doneButton);
    (place.kind === 'drawing' ? layer : home).append(controls);
    active = {key, place, home, preview, controls, revision, documentId, opener};
    if (options.focus && document.activeElement === opener) (preview || controls.querySelector('button'))?.focus({preventScroll: true});
    renderMarks(); return {ok: true, key, actId: place.actId};
  }
  async function next(options = {}) {
    if (!_rapierSettlePendingDocumentChange()) return {ok: false, reason: 'editing_in_progress'};
    _leaveAllEditingBlocks(); typingUntil = 0;
    const before = active?.key, state = await refresh(); if (!state.ok) return state;
    const rows = currentRows(); if (!rows.length) return {ok: true, unchanged: true};
    const index = rows.findIndex(place => place.key === before);
    return show(rows[(index + 1) % rows.length].key, {scroll: true, ...options});
  }
  function done(key = active?.key) {
    const place = currentRows().find(place => place.key === key);
    if (!place || documentId !== identity())
      return {ok: false, reason: 'act_unavailable'};
    remember([place]); close(); renderMarks(); return {ok: true, documentId, key};
  }
  async function undo(key = active?.key) {
    const selected = currentRows().find(place => place.key === key);
    const intent = {documentId: identity(), viewTicket, drawSession: inDraw() ? _rapierDrawState.session : null,
      review: selected?.diffIds ? snapshot : null, diffIds: selected?.diffIds};
    const state = await refresh(); if (!state.ok) return state;
    if (intent.documentId !== identity() || intent.viewTicket !== viewTicket ||
      intent.drawSession !== (inDraw() ? _rapierDrawState.session : null))
      return {ok: false, reason: 'document_changed'};
    const rows = currentRows(), place = rows.find(row => row.key === key), priorRows = [...places, ...rows];
    if (!place) return {ok: false, reason: 'act_unavailable'};
    const id = documentId;
    if (active?.controls) for (const control of active.controls.querySelectorAll('button')) control.disabled = true;
    const target = place.kind === 'drawing' ? globalThis.RapierChangesDraw.undoTarget(place)
      : place.turnId ? {turnId: place.turnId, actorId: place.actor?.id} : {actId: place.actId};
    if (place.kind !== 'drawing' && active) close();
    const selection = globalThis.getSelection?.();
    if (selection?.rangeCount && !document.querySelector('.block-wrapper--editing') &&
      document.getElementById('editor-blocks')?.contains(selection.anchorNode)) selection.removeAllRanges();
    let result;
    const undone = [];
    const took = value => ['applied', 'unchanged'].includes(value?.outcome) &&
      undone.push(...(value.undoneChangeIds || value.act?.reverses || []), value.undoneChangeId);
    const separately = async () => {
      for (const actId of (place.actIds || [place.actId]).slice().reverse()) {
        result = await rapier.undo.undoAct({actId}); took(result);
        if (!['applied', 'unchanged'].includes(result?.outcome) || id !== identity()) break;
      }
    };
    try {
      if (place.diffIds) result = await rapier.undo.restoreChanges(intent.review, intent.diffIds);
      else if (place.kind !== 'drawing' && !target.turnId) await separately();
      else {
        result = await rapier.undo.undoAct(target);
        if (target.turnId && result?.reason === 'turn_ambiguous') await separately(); else took(result);
      }
    } catch (_) { result = {outcome: 'conflict', reason: 'history_unavailable'}; }
    if (id !== identity()) return {ok: false, reason: 'document_changed'};
    if (['applied', 'unchanged'].includes(result?.outcome)) {
      if (place.diffIds) remember(priorRows.filter(row => row.diffIds?.some(id => intent.diffIds.includes(id))));
      else {
        const ids = new Set(undone.filter(Boolean));
        if (!ids.size) for (const actId of place.actIds || [place.actId]) ids.add(actId);
        remember(priorRows.filter(row => (row.actIds || [row.actId]).some(actId => ids.has(actId))));
      }
      close(); dirty = true; await refresh();
    } else {
      if (active?.controls) for (const control of active.controls.querySelectorAll('button')) control.disabled = false;
      showToast(result?.reason === 'drawing_open' ? 'Close Draw to undo this turn.' : 'This change could not be undone.', 'info');
    }
    return result;
  }
  function presence(value) { presenceValue = value; scheduleLocate(); }
  function cancelHold() { if (hold) clearTimeout(hold.timer); hold = null; }
  nextButton.addEventListener('click', event => void next({focus: event.detail === 0}));
  edge.addEventListener('click', () => { void _rapierAgentBarJump(); });
  document.addEventListener('pointerdown', event => {
    const target = event.target;
    if (target.closest?.('.rapier-changes-layer, .rapier-changes-controls')) {
      event.preventDefault();
      if (inDraw() && _rapierDrawState.surface?.contains(target) && target.closest?.('.rapier-changes-mark')) return;
      event.stopPropagation(); return;
    }
    if (target.closest?.('.rapier-changes-before')) { event.preventDefault(); event.stopPropagation(); return; }
    cancelHold();
    const home = target.closest?.('#editor-blocks > .block-wrapper');
    const place = home && currentRows().find(row => row.blockId === Number(home.dataset.blockId) && row.kind === 'text');
    if (!place || target.closest('button, a, input, textarea, .block-edit')) return;
    hold = {x: event.clientX, y: event.clientY, timer: setTimeout(() => {
      hold = null; swallowedClick = {home, until: performance.now() + 1500}; void show(place.key, {focus: event.detail === 0});
    }, 500)};
  }, true);
  document.addEventListener('pointermove', event => { if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) cancelHold(); }, {passive: true});
  for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, cancelHold, {passive: true});
  document.addEventListener('click', event => {
    const held = swallowedClick; swallowedClick = null;
    if (held && performance.now() < held.until && held.home.contains(event.target)) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.target.closest?.('.rapier-changes-before')) { event.preventDefault(); event.stopPropagation(); close(); }
  }, true);
  document.addEventListener('beforeinput', event => {
    if (!event.target.closest?.('#editor-blocks, #source-mode')) return;
    typingUntil = performance.now() + 350;
    if (active) close();
    if (timer) { clearTimeout(timer); timer = 0; schedule(); }
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active) { close(); event.stopPropagation(); } }, true);
  host.addEventListener('scroll', () => { cancelHold(); scheduleLocate(); }, {passive: true});
  document.getElementById('source-mode')?.addEventListener('scroll', scheduleLocate, {passive: true});
  window.addEventListener('resize', scheduleLocate, {passive: true});
  window.visualViewport?.addEventListener('resize', scheduleLocate, {passive: true});
  window.addEventListener('storage', event => {
    if (event.key !== prefix + documentId) return;
    seen = stored(documentId); if (active && isSeen(active.place)) close(); renderMarks();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); else close(); });
  new ResizeObserver(scheduleLocate).observe(host);
  new MutationObserver(() => { if (active && !active.preview?.isConnected && active.place.kind !== 'drawing') close(); schedule(); })
    .observe(host, {childList: true});
  globalThis.RapierChanges = Object.freeze({current: refresh, show, next, done, undo, close, schedule, reset, presence,
    locate: scheduleLocate});
  reset();
}());
