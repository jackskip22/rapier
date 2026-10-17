(function () {
  const TICK_MS = 4, GLIDE_MS = 180, DRAG_PX = 8;
  const SHAPES = [['rect', 'Box', '<rect x="3" y="7" width="18" height="10"/>'], ['round', 'Rounded box', '<rect x="3" y="7" width="18" height="10" rx="2"/>'],
    ['stadium', 'Pill', '<rect x="2" y="7" width="20" height="10" rx="5"/>'], ['circle', 'Circle', '<circle cx="12" cy="12" r="8"/>'],
    ['diamond', 'Diamond', '<path d="M12 3l9 9-9 9-9-9z"/>'], ['cylinder', 'Database', '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>'],
    ['subroutine', 'Subroutine', '<rect x="3" y="7" width="18" height="10"/><path d="M7 7v10M17 7v10"/>'], ['asymmetric', 'Flag', '<path d="M3 7h18v10H3l4-5z"/>'],
    ['hexagon', 'Hexagon', '<path d="M7 5h10l5 7-5 7H7l-5-7z"/>']];
  const DIRECTIONS = [['TD', 'Top to bottom', '<path d="M12 4v16M6 14l6 6 6-6"/>'], ['LR', 'Left to right', '<path d="M4 12h16M14 6l6 6-6 6"/>'],
    ['BT', 'Bottom to top', '<path d="M12 20V4M6 10l6-6 6 6"/>'], ['RL', 'Right to left', '<path d="M20 12H4M10 6l-6 6 6 6"/>']];
  const ICONS = {
    add: '<rect x="2.5" y="8" width="7" height="8"/><path d="M9.5 12h3.5M17.5 8v8M13.5 12h8"/>',
    link: '<rect x="2.5" y="3.5" width="7" height="7"/><rect x="14.5" y="13.5" width="7" height="7"/><path d="M9.5 7h3.5v10h1.5"/>',
    shape: '<rect x="3" y="3" width="11" height="11"/><circle cx="15" cy="15" r="6"/>',
    direction: '<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>',
    words: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    remove: '<path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const SVG = 'http://www.w3.org/2000/svg';
  function icon(shapes) {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [name, value] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) svg.setAttribute(name, value);
    for (const match of shapes.matchAll(/<(\w+)([^>]*?)\/>/g)) {
      const node = document.createElementNS(SVG, match[1]);
      for (const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attribute[1], attribute[2]);
      svg.append(node);
    }
    return svg;
  }

  let sel = null;
  let bar = null, row = null;
  let plate = null, dragState = null, ghost = null;
  let shown = null;
  const positions = new Map();
  let escapeWasEditing = false, lastDragAt = 0;

  const editor = () => globalThis.RapierFlowchartEditor;
  const edits = () => globalThis.RapierFlowchart.flowchartEdits;
  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const tick = () => { try { navigator.vibrate?.(TICK_MS); } catch (_) {} };

  function blockOf(from) {
    const wrapper = from?.matches?.('.block-wrapper') ? from : from?.closest?.('.block-wrapper');
    return wrapper ? {wrapper, block: _rapierBoundBlock(wrapper), diagram: wrapper.querySelector('.diagram-block')} : {};
  }


  function graphOf(block) {
    const found = block && editor().fence(block.raw);
    const parsed = found && globalThis.RapierFlowchart.parseFlowchart(found.body);
    return parsed?.ok ? {...found, graph: parsed.graph} : null;
  }

  function edgeIndex(graph, pair) {
    return graph.edges.findIndex(edge => edge.from === pair.from && edge.to === pair.to);
  }


  async function commit(from, operation, make, after) {
    if (_rapierUserMutationBlocked()) return false;
    const {wrapper} = blockOf(from);
    if (!editor().close()) return false;
    const {block} = blockOf(wrapper), found = block && editor().fence(block.raw);
    if (!found) return false;
    const result = make(found.body);
    if (!result.ok) { showToast(result.reason, 'info'); return false; }
    if (result.splice === null) return true;
    const authority = rapier.identity.authority, raw = block.raw;
    const next = raw.slice(0, found.bodyStart) + result.source + raw.slice(found.bodyStart + found.body.length);
    if (!_rapierCommitBlockEdit(block.id, raw, next, {operation})) return false;
    block.raw = next;
    block.rendered = renderBlock(next);
    rapierDirty(block.id);
    _notifyHistoryState();
    _scheduleStatsUpdate();
    after?.(result);
    const diagram = wrapper.querySelector('.diagram-block');
    if (diagram && diagram.isConnected && rapier.identity.authority === authority) {
      const viewport = _rapierCaptureEditorViewport(diagram, true, true);
      const scroll = {left: diagram.scrollLeft, top: diagram.scrollTop};
      _writeBlockDOM(wrapper, block, {exitEditing: true});
      const redrawn = wrapper.querySelector('.diagram-block');
      if (redrawn) redrawn._rapierDiagramScroll = scroll;
      await _rapierFillDiagram(redrawn);
      _rapierRestoreEditorViewport(viewport);
    }
    return true;
  }

  async function add(from, fromId) {
    if (_rapierUserMutationBlocked()) return false;
    const {wrapper} = blockOf(from);
    if (!editor().close()) return false;
    const {block, diagram} = blockOf(wrapper), found = block && editor().fence(block.raw);
    if (!found || !diagram) return false;
    const preview = edits().addBox(found.body, fromId, '…');
    if (!preview.ok) { showToast(preview.reason, 'info'); return false; }
    const key = 'data-diagram-src', original = diagram.getAttribute(key);
    diagram.setAttribute(key, encodeURIComponent(preview.source.replace(/\r\n?/g, '\n')));
    await _rapierFillDiagram(diagram);
    const view = diagram, group = view.querySelector('[data-shape-id="' + preview.id + '"]');
    const restore = () => {
      if (view.getAttribute(key) !== original) { view.setAttribute(key, original); _rapierFillDiagram(view); }
    };
    if (group) reveal(view, group);
    if (!group || !(await editor().open(view, group, {base: preview.source, restore, operation: 'document.add-diagram-box',
        created: () => select({blockId: block.id, kind: 'node', id: preview.id})}))) restore();
    return true;
  }

  function reveal(diagram, group) {
    const frame = diagram.getBoundingClientRect(), box = group.getBoundingClientRect();
    const dx = box.right > frame.right ? box.right - frame.right + 16 : box.left < frame.left ? box.left - frame.left - 16 : 0;
    if (dx) diagram.scrollLeft += dx;
  }

  async function words(from) {
    if (!sel) return false;
    const {wrapper} = blockOf(from);
    let diagram = from;
    if (sel.kind === 'node') {
      const group = diagram.querySelector('[data-shape-id="' + sel.id + '"]');
      return group ? editor().open(diagram, group) : false;
    }
    if (_rapierUserMutationBlocked() || !editor().close()) return false;
    const current = blockOf(wrapper), info = graphOf(current.block);
    diagram = current.diagram;
    const index = info && edgeIndex(info.graph, sel.pair);
    if (!info || index < 0 || !diagram) return false;
    const key = 'data-diagram-src';
    if (info.graph.edges[index].label) {
      const data = diagram._rapierFlowchart;
      const shapeId = Object.keys(data.labels).find(id => data.labels[id].kind === 'edge' && data.labels[id].id === index);
      const group = shapeId && diagram.querySelector('[data-shape-id="' + shapeId + '"]');
      return group ? editor().open(diagram, group) : false;
    }
    const preview = edits().edgeLabel(info.body, index, '…');
    if (!preview.ok) { showToast(preview.reason, 'info'); return false; }
    const original = diagram.getAttribute(key);
    diagram.setAttribute(key, encodeURIComponent(preview.source.replace(/\r\n?/g, '\n')));
    await _rapierFillDiagram(diagram);
    const view = diagram, data = view._rapierFlowchart, parsed = globalThis.RapierFlowchart.parseFlowchart(preview.source);
    const labelled = parsed.ok ? parsed.graph.edges.findIndex(edge => edge.from === sel.pair.from && edge.to === sel.pair.to && edge.label === '…') : -1;
    const shapeId = data && Object.keys(data.labels).find(id => data.labels[id].kind === 'edge' && data.labels[id].id === labelled);
    const group = shapeId && view.querySelector('[data-shape-id="' + shapeId + '"]');
    const restore = () => { if (view.getAttribute(key) !== original) { view.setAttribute(key, original); _rapierFillDiagram(view); } };
    if (group) reveal(view, group);
    if (!group || !(await editor().open(view, group, {base: preview.source, restore, operation: 'document.edit-diagram-label'}))) restore();
    return true;
  }

  const connect = (diagram, from, to) => commit(diagram, 'document.connect-diagram-boxes', source => edits().connect(source, from, to), () => tick());
  const shape = (diagram, id, kind) => commit(diagram, 'document.shape-diagram-box', source => edits().shape(source, id, kind));
  const direction = (diagram, value) => commit(diagram, 'document.flip-diagram', source => edits().direction(source, value));

  async function remove(diagram) {
    if (!sel) return false;
    const target = sel, {block} = blockOf(diagram), info = graphOf(block);
    if (!info) return false;
    const index = target.kind === 'edge' ? edgeIndex(info.graph, target.pair) : -1;
    const done = await commit(diagram, target.kind === 'node' ? 'document.delete-diagram-box' : 'document.delete-diagram-line',
      source => target.kind === 'node' ? edits().deleteBox(source, target.id) : edits().deleteEdge(source, index));
    if (done) deselect();
    return done;
  }


  function restyle(group, style) {
    const saved = [];
    for (const element of [group, ...group.querySelectorAll('*')]) saved.push([element, element.getAttribute('style')]);
    style(group);
    return () => { for (const [element, css] of saved) { if (css === null) element.removeAttribute('style'); else element.setAttribute('style', css); } };
  }

  function paintNode(group) {
    const parts = [...group.children];
    const shapeEl = parts.find(element => element.localName !== 'text');
    if (shapeEl) shapeEl.style.setProperty('fill', 'var(--color-icon)', 'important');
    for (const element of parts) {
      if (element === shapeEl) continue;
      if (element.localName === 'path') element.style.setProperty('fill', 'var(--color-bg)', 'important');
      if (element.localName === 'text') element.style.setProperty('fill', 'var(--color-bg)', 'important');
    }
  }

  function paintEdge(group) {
    for (const element of group.querySelectorAll('path, polygon, line, polyline')) {
      if (element.hasAttribute('data-hit')) continue;
      if (element.getAttribute('stroke') && element.getAttribute('stroke') !== 'none') element.style.setProperty('stroke', 'var(--color-accent)', 'important');
      if (element.getAttribute('fill') && element.getAttribute('fill') !== 'none') element.style.setProperty('fill', 'var(--color-accent)', 'important');
    }
  }

  function groupOf(diagram, selection) {
    const data = diagram._rapierFlowchart;
    if (!data) return null;
    if (selection.kind === 'node') return diagram.querySelector('[data-shape-id="' + selection.id + '"]');
    const info = graphOf(blockOf(diagram).block), index = info ? edgeIndex(info.graph, selection.pair) : -1;
    const shapeId = data.parts && Object.keys(data.parts).find(id => data.parts[id].kind === 'edge' && data.parts[id].id === index);
    return shapeId ? diagram.querySelector('[data-shape-id="' + shapeId + '"]') : null;
  }

  function unpaint() {
    if (shown) { try { shown.saved(); } catch (_) {} shown = null; }
    plate?.remove(); plate = null;
  }

  function draw(diagram) {
    unpaint();
    if (!sel) { showBar(null); return; }
    const group = groupOf(diagram, sel);
    if (!group) { sel = null; showBar(null); return; }
    shown = {diagram, group, saved: restyle(group, sel.kind === 'node' ? paintNode : paintEdge)};
    if (sel.kind === 'node') placePlate(diagram, group);
    showBar(diagram);
  }

  function select(next) {
    const diagram = findDiagram(next.blockId);
    if (!diagram) return false;
    if (next.kind === 'edge' && !next.pair) return false;
    if (!sel || sel.blockId !== next.blockId || sel.kind !== next.kind || sel.id !== next.id) {
      sel = {...next, linking: false};
    } else sel.linking = !!next.linking;
    draw(diagram);
    return true;
  }

  function findDiagram(blockId) {
    for (const wrapper of document.querySelectorAll('.block-wrapper')) {
      if (_rapierBoundBlock(wrapper)?.id === blockId) return wrapper.querySelector('.diagram-block[data-diagram-native]');
    }
    return null;
  }

  function deselect() {
    sel = null;
    unpaint();
    showBar(null);
  }


  function button(act, label, path, pressed) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'rapier-image-tools__btn'; node.dataset.flowAct = act;
    node.setAttribute('aria-label', label); node.title = label;
    if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
    node.append(icon(path));
    return node;
  }

  function ensureBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'rapier-image-tools rapier-diagram-tools'; bar.hidden = true;
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'diagram tools'); bar.tabIndex = -1;
    row = document.createElement('div');
    row.className = 'rapier-diagram-row'; row.hidden = true; row.setAttribute('role', 'group');
    bar.addEventListener('pointerdown', event => { if (editor().editing()) event.preventDefault(); });
    bar.addEventListener('mousedown', event => event.preventDefault());
    bar.addEventListener('click', event => {
      const act = event.target.closest?.('[data-flow-act]')?.dataset;
      if (act) { event.preventDefault(); void run(act.flowAct, act.flowValue); }
    });
    document.body.appendChild(bar);
  }

  function showBar(diagram) {
    if (!sel || !diagram) {
      if (bar && !bar.hidden) { bar.hidden = true; row.hidden = true; _rapierScrollRuntime.place?.(); _rapierScheduleToastLift(); }
      return;
    }
    ensureBar();
    const node = sel.kind === 'node';
    const info = graphOf(blockOf(diagram).block);
    const current = info && node ? info.graph.nodes.find(item => item.id === sel.id)?.shape : null;
    bar.replaceChildren(row);
    if (node) {
      bar.append(button('add', 'Add a connected box', ICONS.add), button('link', 'Connect to another box', ICONS.link, sel.linking),
        button('shape', 'Box shape', ICONS.shape, row.dataset.kind === 'shape' && !row.hidden), button('words', 'Edit words', ICONS.words));
    } else bar.append(button('words', 'Words on the line', ICONS.words));
    bar.append(button('direction', 'Direction', ICONS.direction, row.dataset.kind === 'direction' && !row.hidden), button('remove', node ? 'Delete box' : 'Delete line', ICONS.remove),
      button('close', 'Close diagram tools', ICONS.close));
    fillRow(info, current);
    _rapierCloseImageTools?.();
    bar.hidden = false;
    _rapierScrollRuntime.place?.();
    _rapierScheduleToastLift();
  }

  function fillRow(info, current) {
    const kind = row.dataset.kind;
    row.replaceChildren();
    if (!kind || row.hidden) return;
    const items = kind === 'shape' ? SHAPES : DIRECTIONS, chosen = kind === 'shape' ? current : info?.graph.direction;
    row.setAttribute('aria-label', kind === 'shape' ? 'box shape' : 'direction');
    for (const [value, label, path] of items) {
      const node = button(kind, label, path, value === chosen || (kind === 'direction' && value === 'TD' && chosen === 'TD'));
      node.dataset.flowValue = value;
      row.append(node);
    }
  }

  function openRow(kind) {
    const same = !row.hidden && row.dataset.kind === kind;
    row.dataset.kind = kind; row.hidden = same;
    const diagram = sel && findDiagram(sel.blockId);
    if (diagram) showBar(diagram);
  }

  async function run(act, value) {
    if (!sel) return;
    const diagram = findDiagram(sel.blockId);
    if (!diagram) { deselect(); return; }
    if (act === 'close') { deselect(); return; }
    if (act === 'add' && sel.kind === 'node') return add(diagram, sel.id);
    if (act === 'link') {
      sel.linking = !sel.linking;
      if (sel.linking) showToast('Touch the box to connect to.', 'info');
      showBar(diagram);
      return;
    }
    if (act === 'shape' && !value) return openRow('shape');
    if (act === 'direction' && !value) return openRow('direction');
    if (act === 'shape') return shape(diagram, sel.id, value);
    if (act === 'direction') return direction(diagram, value);
    if (act === 'words') return words(diagram);
    if (act === 'remove') return remove(diagram);
  }


  function tap(diagram, pressed) {
    if (Date.now() - lastDragAt < 400) return true;
    const data = diagram._rapierFlowchart, {block} = blockOf(diagram);
    if (!data || !block) return false;
    const group = pressed.closest?.('[data-shape-id]');
    const part = group && data.parts?.[group.dataset.shapeId];
    if (pressed.closest?.('.rapier-diagram-plate') && sel?.kind === 'node') {
      return editor().open(diagram, diagram.querySelector('[data-shape-id="' + sel.id + '"]') || pressed);
    }
    if (sel?.linking && part?.kind === 'node' && sel.kind === 'node' && part.id !== sel.id) {
      const from = sel.id; sel.linking = false;
      void connect(diagram, from, part.id);
      return true;
    }
    if (!part) { editor().close(); deselect(); return true; }
    if (part.kind === 'node') {
      select({blockId: block.id, kind: 'node', id: part.id});
      return editor().open(diagram, pressed);
    }
    if (part.kind === 'edge') {
      const info = graphOf(block), edge = info?.graph.edges[part.id];
      if (!edge) return false;
      select({blockId: block.id, kind: 'edge', id: part.id, pair: {from: edge.from, to: edge.to}});
      return data.labels[group.dataset.shapeId] ? editor().open(diagram, pressed) : true;
    }
    return editor().open(diagram, pressed);
  }

  function nodeRects(diagram) {
    const rects = new Map();
    for (const group of diagram.querySelectorAll('[data-shape-id]')) {
      const part = diagram._rapierFlowchart?.parts?.[group.dataset.shapeId];
      if (part?.kind !== 'node') continue;
      const shapeEl = [...group.children].find(element => element.localName !== 'text') || group;
      rects.set(part.id, shapeEl.getBoundingClientRect());
    }
    return rects;
  }

  function placePlate(diagram, group) {
    const bounds = diagram.getBoundingClientRect(), rect = ([...group.children].find(element => element.localName !== 'text') || group).getBoundingClientRect();
    plate = document.createElement('div');
    plate.className = 'rapier-diagram-plate';
    Object.assign(plate.style, {left: rect.left - bounds.left + diagram.scrollLeft + 'px', top: rect.top - bounds.top + diagram.scrollTop + 'px',
      width: rect.width + 'px', height: rect.height + 'px'});
    plate.addEventListener('pointerdown', event => beginPointer(event, diagram, sel.id, true));
    diagram.append(plate);
  }

  function beginPointer(event, diagram, id, onPlate) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (editor().editing()) event.preventDefault();
    dragState = {diagram, id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, rects: null, hover: null, onPlate};
    window.addEventListener('pointermove', dragMove, true);
    window.addEventListener('pointerup', dragEnd, true);
    window.addEventListener('pointercancel', dragEnd, true);
  }

  const toLocal = (diagram, x, y) => {
    const bounds = diagram.getBoundingClientRect();
    return {x: x - bounds.left + diagram.scrollLeft, y: y - bounds.top + diagram.scrollTop};
  };

  function edgePoint(rect, toward) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return {x: cx, y: cy};
    const scale = Math.min(dx ? (rect.width / 2) / Math.abs(dx) : Infinity, dy ? (rect.height / 2) / Math.abs(dy) : Infinity);
    return {x: cx + dx * Math.min(scale, 1), y: cy + dy * Math.min(scale, 1)};
  }

  function dragMove(event) {
    const s = dragState;
    if (!s || event.pointerId !== s.pointerId) return;
    if (!s.moved) {
      if (Math.hypot(event.clientX - s.x, event.clientY - s.y) < DRAG_PX) return;
      s.moved = true;
      s.rects = nodeRects(s.diagram);
      if (!s.rects.has(s.id)) { dragEnd(event, true); return; }
      select({blockId: blockOf(s.diagram).block.id, kind: 'node', id: s.id});
      ghost = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ghost.setAttribute('class', 'rapier-diagram-ghost');
      ghost.append(document.createElementNS(SVG, 'line'), document.createElementNS(SVG, 'polygon'));
      s.diagram.append(ghost);
      tick();
    }
    event.preventDefault();
    const from = s.rects.get(s.id);
    let hover = null;
    for (const [id, rect] of s.rects) {
      if (id !== s.id && event.clientX >= rect.left - 6 && event.clientX <= rect.right + 6 && event.clientY >= rect.top - 6 && event.clientY <= rect.bottom + 6) hover = id;
    }
    if (hover !== s.hover) {
      s.unhover?.(); s.unhover = null;
      if (hover) {
        const group = s.diagram.querySelector('[data-shape-id="' + hover + '"]');
        if (group) s.unhover = restyle(group, paintNode);
        tick();
      }
      s.hover = hover;
    }
    const tip = hover ? {x: s.rects.get(hover).left + s.rects.get(hover).width / 2, y: s.rects.get(hover).top + s.rects.get(hover).height / 2} : {x: event.clientX, y: event.clientY};
    const start = edgePoint(from, tip), end = hover ? edgePoint(s.rects.get(hover), start) : tip;
    const a = toLocal(s.diagram, start.x, start.y), b = toLocal(s.diagram, end.x, end.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x), size = 10;
    const p = (r, t) => (b.x - Math.cos(angle + t) * r) + ',' + (b.y - Math.sin(angle + t) * r);
    ghost.setAttribute('width', s.diagram.scrollWidth); ghost.setAttribute('height', s.diagram.scrollHeight);
    ghost.firstChild.setAttribute('x1', a.x); ghost.firstChild.setAttribute('y1', a.y);
    ghost.firstChild.setAttribute('x2', b.x - Math.cos(angle) * (size - 1)); ghost.firstChild.setAttribute('y2', b.y - Math.sin(angle) * (size - 1));
    ghost.lastChild.setAttribute('points', b.x + ',' + b.y + ' ' + p(size, -.4) + ' ' + p(size, .4));
  }

  function dragEnd(event, cancel) {
    const s = dragState;
    if (!s || (event.pointerId !== undefined && event.pointerId !== s.pointerId)) return;
    dragState = null;
    window.removeEventListener('pointermove', dragMove, true);
    window.removeEventListener('pointerup', dragEnd, true);
    window.removeEventListener('pointercancel', dragEnd, true);
    s.unhover?.();
    ghost?.remove(); ghost = null;
    if (!s.moved) return;
    lastDragAt = Date.now();
    event.preventDefault?.();
    if (cancel === true || event.type === 'pointercancel' || !s.hover) return;
    void connect(s.diagram, s.id, s.hover);
  }


  function neighbor(diagram, key) {
    const info = graphOf(blockOf(diagram).block);
    if (!info || sel?.kind !== 'node') return null;
    const rects = nodeRects(diagram), here = rects.get(sel.id);
    if (!here) return null;
    const near = new Set();
    for (const edge of info.graph.edges) { if (edge.from === sel.id) near.add(edge.to); if (edge.to === sel.id) near.add(edge.from); }
    const vector = {ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1]}[key];
    let best = null, bestScore = Infinity;
    for (const id of near) {
      const rect = rects.get(id);
      if (!rect) continue;
      const dx = rect.left + rect.width / 2 - (here.left + here.width / 2), dy = rect.top + rect.height / 2 - (here.top + here.height / 2);
      const along = dx * vector[0] + dy * vector[1], across = Math.abs(dx * vector[1] - dy * vector[0]);
      if (along <= 0) continue;
      const score = across * 2 - along;
      if (score < bestScore) { best = id; bestScore = score; }
    }
    return best;
  }

  function keydown(diagram, event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || editor().editing()) return;
    if (!sel || sel.kind !== 'node' && event.key !== 'Escape' && event.key !== 'Delete' && event.key !== 'Backspace') return;
    const {block} = blockOf(diagram);
    if (!block || sel.blockId !== block.id) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); deselect(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); void remove(diagram); return; }
    if (event.key === 'Tab' && !event.shiftKey && sel.kind === 'node') { event.preventDefault(); event.stopPropagation(); void add(diagram, sel.id); return; }
    if (event.key.startsWith('Arrow') && sel.kind === 'node') {
      const id = neighbor(diagram, event.key);
      event.preventDefault(); event.stopPropagation();
      if (id) {
        select({blockId: block.id, kind: 'node', id});
        diagram.querySelector('[data-shape-id="' + id + '"]')?.focus({preventScroll: true});
      }
    }
  }


  function glide(diagram, blockId) {
    const svg = diagram.querySelector('svg'), box = svg?.viewBox?.baseVal, data = diagram._rapierFlowchart;
    if (!svg || !box || !data?.parts) return;
    const now = new Map();
    for (const group of diagram.querySelectorAll('[data-shape-id]')) {
      const part = data.parts[group.dataset.shapeId];
      if (!part || part.kind === 'edge') continue;
      const rect = group.getBBox();
      now.set(group.dataset.shapeId, {x: rect.x - box.x, y: rect.y - box.y});
    }
    const before = positions.get(blockId);
    positions.delete(blockId); positions.set(blockId, now);
    while (positions.size > 8) positions.delete(positions.keys().next().value);
    if (!before || reduced()) return;
    let changed = false;
    for (const [id, at] of now) {
      const group = diagram.querySelector('[data-shape-id="' + id + '"]'), old = before.get(id);
      if (!group?.animate) continue;
      if (!old) { changed = true; group.animate([{opacity: 0}, {opacity: 1}], {duration: GLIDE_MS, easing: 'ease-out'}); continue; }
      const dx = old.x - at.x, dy = old.y - at.y;
      if (Math.abs(dx) + Math.abs(dy) < .5) continue;
      changed = true;
      group.animate([{transform: 'translate(' + dx + 'px,' + dy + 'px)'}, {transform: 'translate(0px,0px)'}], {duration: GLIDE_MS, easing: 'cubic-bezier(.2,.7,.3,1)'});
    }
    if (!changed) return;
    for (const group of diagram.querySelectorAll('[data-shape-id]')) {
      if (data.parts[group.dataset.shapeId]?.kind === 'edge' && group.animate) {
        group.animate([{opacity: 0}, {opacity: 1}], {duration: GLIDE_MS * .6, delay: GLIDE_MS * .4, easing: 'ease-out', fill: 'backwards'});
      }
    }
  }

  function bind(diagram, source, recipe, labels, parts) {
    const {block} = blockOf(diagram);
    if (!block || !diagram._rapierFlowchart) return;
    diagram._rapierFlowchart.parts = parts;
    for (const group of diagram.querySelectorAll('[data-shape-id]')) {
      const part = parts?.[group.dataset.shapeId];
      if (part?.kind === 'edge') {
        for (const line of [...group.querySelectorAll('path, line, polyline')]) {
          if (line.getAttribute('stroke') && line.getAttribute('stroke') !== 'none' && !line.hasAttribute('data-hit')) {
            const hit = line.cloneNode(false);
            hit.removeAttribute('style'); hit.removeAttribute('class'); hit.setAttribute('data-hit', ''); hit.setAttribute('stroke', 'rgba(0,0,0,0)'); hit.setAttribute('stroke-width', '28'); hit.setAttribute('fill', 'none');
            hit.removeAttribute('stroke-dasharray'); hit.removeAttribute('marker-end'); hit.removeAttribute('marker-start'); hit.setAttribute('pointer-events', 'stroke');
            group.append(hit);
          }
        }
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', 'Line');
      } else if (part?.kind === 'node') {
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') beginPointer(event, diagram, part.id, false); });
        group.addEventListener('focus', () => { if (group.matches(':focus-visible')) select({blockId: block.id, kind: 'node', id: part.id}); });
      }
    }
    glide(diagram, block.id);
    if (sel && sel.blockId === block.id) {
      const info = graphOf(block);
      if (!info || sel.kind === 'node' && !info.graph.nodes.some(node => node.id === sel.id) || sel.kind === 'edge' && edgeIndex(info.graph, sel.pair) < 0) deselect();
      else draw(diagram);
    }
  }

  document.addEventListener('keydown', event => { if (event.key === 'Escape') escapeWasEditing = editor().editing(); }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !sel || escapeWasEditing || event.defaultPrevented) return;
    deselect();
  });
  document.addEventListener('keydown', event => {
    if (!sel || editor().editing() || event.defaultPrevented) return;
    const target = event.target;
    if (target !== document.body && target !== document.documentElement && !target?.closest?.('.diagram-block')) return;
    const diagram = findDiagram(sel.blockId);
    if (diagram) keydown(diagram, event);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!sel || !event.target?.closest) return;
    if (event.target.closest('.rapier-diagram-tools, .rapier-diagram-plate, .rapier-diagram-label')) return;
    const diagram = findDiagram(sel.blockId);
    if (diagram && diagram.contains(event.target)) return;
    deselect();
  }, true);

  globalThis.RapierFlowchartTouch = Object.freeze({bind, tap, add, select, deselect, selection: () => sel && {...sel}});
})();
