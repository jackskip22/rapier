// The SVG remains the reading surface while one label is typed. Source ranges come from the
// Mermaid parser; edits use the document's journal, autosave and Undo, never an SVG serialization.
(function () {
  let active = null;
  let opening = 0;

  function flush(announce = true) {
    const held = active;
    if (!held) return true;
    if (held.composing) return false;
    clearTimeout(held.timer);
    const block = rapier.document.blocks.find(row => row.id === held.blockId);
    if (rapier.identity.authority !== held.authority || !block || block.raw !== held.raw ||
        _rapierUserMutationBlocked(false)) return false;
    if (held.input.value === held.value) return true;
    const changed = globalThis.RapierFlowchart.editFlowchartLabel(held.body, held.target, held.input.value);
    if (!changed.ok) {
      held.input.setCustomValidity(changed.reason);
      if (announce) { showToast(changed.reason, 'info'); held.input.focus({preventScroll: true}); }
      return false;
    }
    held.input.setCustomValidity('');
    const next = held.raw.slice(0, held.bodyStart) + changed.source + held.raw.slice(held.bodyStart + held.body.length);
    if (!_rapierCommitBlockEdit(block.id, held.raw, next, {operation: 'document.edit-diagram-label'})) return false;
    block.raw = next;
    block.rendered = renderBlock(next);
    held.raw = next;
    held.body = changed.source;
    held.value = held.input.value;
    // Sorting the graph can move a labelled edge's ordinal. Keep identifying it by its source declaration.
    if (held.target.kind === 'edge') {
      const labels = {}, parsed = globalThis.RapierFlowchart.parseFlowchart(changed.source, labels);
      if (parsed.ok) held.target = {kind: 'edge', id: [...labels.edges].find(([, span]) => span?.start === changed.splice.pos)?.[0] ?? held.target.id};
    }
    rapierDirty(block.id);
    _notifyHistoryState();
    _scheduleStatsUpdate();
    return true;
  }

  function close() {
    ++opening;
    const held = active;
    if (!held || !flush()) return !held;
    active = null;
    clearTimeout(held.timer);
    held.listeners.abort();
    held.input.remove();
    for (const text of held.texts) text.style.removeProperty('visibility');
    const block = rapier.document.blocks.find(row => row.id === held.blockId);
    if (held.diagram.isConnected && block && block.raw === held.raw && held.raw !== held.openRaw) {
      const viewport = _rapierCaptureEditorViewport(held.diagram, true, true);
      _writeBlockDOM(held.wrapper, block, {exitEditing: true});
      _rapierFillDiagram(held.wrapper.querySelector('.diagram-block'));
      _rapierRestoreEditorViewport(viewport);
    }
    return true;
  }

  function bind(diagram, source, recipe, labels) {
    // An Undo/load may replace the projection after settling the draft. Release that old view;
    // never make a later document inherit an editor whose source was already committed.
    if (active && !active.input.isConnected && active.input.value === active.value) {
      clearTimeout(active.timer); active.listeners.abort(); active = null;
    }
    diagram._rapierFlowchart = {source, recipe, labels};
    for (const group of diagram.querySelectorAll('[data-shape-id]')) if (labels[group.dataset.shapeId]) {
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', 'Edit ' + (recipe.shapes.find(shape => shape.id === group.dataset.shapeId)?.label || 'label'));
      // Keep the current field until the click selects the next label. A focus-driven blur would
      // rebuild the SVG between pointerdown and click, discarding the person's intended target.
      group.addEventListener('pointerdown', event => { if (active) event.preventDefault(); });
      group.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); event.stopPropagation(); open(diagram, group);
      });
    }
  }

  async function open(diagram, pressed) {
    let group = pressed.closest('[data-shape-id]'), data = diagram._rapierFlowchart;
    let target = group && data?.labels[group.dataset.shapeId];
    if (!target || _rapierUserMutationBlocked()) return false;
    const wrapper = diagram.closest('.block-wrapper'), authority = rapier.identity.authority;
    const replacing = active?.diagram === diagram && (active.raw !== active.openRaw || active.input.value !== active.value);
    let edge = target.kind === 'edge' ? globalThis.RapierFlowchart.parseFlowchart(data.source).graph.edges[target.id] : null;
    if (edge && active?.shapeId === group.dataset.shapeId && active.diagram === diagram) edge = {...edge, label: active.input.value};
    if (!close()) return false;
    const request = ++opening;
    _leaveAllEditingBlocks();
    if (replacing) {
      diagram = wrapper.querySelector('.diagram-block');
      await _rapierFillDiagram(diagram);
      if (request !== opening || rapier.identity.authority !== authority) return false;
      data = diagram?._rapierFlowchart;
      if (!data) return false;
      if (edge) target = {kind: 'edge', id: globalThis.RapierFlowchart.parseFlowchart(data.source).graph.edges.findIndex(row => JSON.stringify(row) === JSON.stringify(edge))};
      group = [...diagram.querySelectorAll('[data-shape-id]')].find(node => {
        const label = data.labels[node.dataset.shapeId];
        return label?.kind === target.kind && label.id === target.id;
      });
      if (!group) return false;
    }
    const block = _rapierBoundBlock(wrapper);
    if (!block || !diagram.isConnected) return false;
    // Locate the fence body without normalizing line endings or touching its delimiters.
    const fence = /^(?:\uFEFF)?[ \t]*(?:`{3,}|~{3,})[ \t]*mermaid[^\r\n]*(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)[ \t]*(?:`{3,}|~{3,})[ \t\r\n]*$/id.exec(block.raw);
    if (!fence) return false;
    const body = fence[1], shape = data.recipe.shapes.find(row => row.id === group.dataset.shapeId);
    if (body.replace(/\r\n?/g, '\n') !== data.source) return false;
    const texts = [...group.querySelectorAll('text')];
    if (!shape || !texts.length) return false;
    const bodyStart = fence.indices[1][0];
    if (bodyStart < 0) return false;
    const layout = globalThis.RapierDrawCore._rapierDrawTextLayout(shape, data.recipe);
    const svg = diagram.querySelector('svg'), matrix = svg?.getScreenCTM();
    if (!matrix) return false;
    const at = new DOMPoint(layout.box.minX, layout.box.minY).matrixTransform(matrix);
    const scaleX = Math.hypot(matrix.a, matrix.b), scaleY = Math.hypot(matrix.c, matrix.d);
    const bounds = diagram.getBoundingClientRect(), style = getComputedStyle(texts[0]);
    const input = document.createElement('textarea');
    input.className = 'rapier-diagram-label';
    input.value = shape.label;
    input.rows = Math.max(1, layout.lines.length);
    input.setAttribute('aria-label', 'Diagram label');
    input.setAttribute('enterkeyhint', 'done');
    Object.assign(input.style, {
      left: (at.x - bounds.left + diagram.scrollLeft) + 'px', top: (at.y - bounds.top + diagram.scrollTop) + 'px',
      width: Math.max(32, layout.width * scaleX + 2) + 'px', height: Math.max(layout.height * scaleY + 2, 24) + 'px',
      fontFamily: layout.fontFamily, fontSize: layout.fontSize * scaleY + 'px', lineHeight: layout.lineHeight * scaleY + 'px',
      fontWeight: style.fontWeight, fontStyle: style.fontStyle, color: style.fill,
      letterSpacing: style.letterSpacing, textAlign: {start: 'left', middle: 'center', end: 'right'}[layout.align] || 'left'
    });
    const listeners = new AbortController();
    active = {diagram, wrapper, shapeId: group.dataset.shapeId, blockId: block.id, authority: rapier.identity.authority, raw: block.raw, openRaw: block.raw,
      body, bodyStart, target, value: shape.label, input, texts, listeners, timer: 0, composing: false};
    const held = active;
    for (const text of texts) text.style.visibility = 'hidden';
    diagram.append(input);
    input.addEventListener('compositionstart', () => { held.composing = true; }, {signal: listeners.signal});
    input.addEventListener('compositionend', () => { held.composing = false; schedule(); }, {signal: listeners.signal});
    function schedule() {
      clearTimeout(held.timer);
      held.timer = setTimeout(() => { if (active === held) flush(false); }, 600);
    }
    input.addEventListener('input', schedule, {signal: listeners.signal});
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') close();
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); close(); }
    }, {signal: listeners.signal});
    input.addEventListener('blur', () => { if (active === held) close(); }, {signal: listeners.signal});
    input.addEventListener('click', event => event.stopPropagation(), {signal: listeners.signal});
    input.focus({preventScroll: true});
    input.select();
    return true;
  }

  globalThis.RapierFlowchartEditor = Object.freeze({bind, open, flush, close, editing: () => !!active});
})();
