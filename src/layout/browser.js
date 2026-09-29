const _rapierImageFlow = (() => {
  'use strict';
  const geometry = globalThis.RapierImageLayout, pretext = globalThis.RapierPretext;
  const metadata = globalThis.RapierMarkdownLayout;
  const host = document.getElementById('editor-blocks');
  const projections = new Map(), ownedStyles = new Map(), endpoints = new WeakMap(), floats = new Map(), floatsRight = new Map();
  let cache = new WeakMap(), sourceCache = new WeakMap(), shapeProfiles = new WeakMap();
  let frame = 0, dragFrame = 0, rotateFrame = 0, observer, selected = null, moving = null, tail, settle = null, settledAt = -1e9, settledImage = null, gripsOk = true;
  const resizeGrips = [];
  let pointerClick = null;
  // Rotate-drag counters for picture-rotate-perf, via status().rotatePerf; reset per gesture.
  const rotatePerf = {writer: 0, urlsCreated: 0, urlsRevoked: 0, decodesStarted: 0, inFlight: 0, maxInFlight: 0};
  function resetRotatePerf() { rotatePerf.writer = rotatePerf.urlsCreated = rotatePerf.urlsRevoked = rotatePerf.decodesStarted = rotatePerf.inFlight = rotatePerf.maxInFlight = 0; }

  let moveHandle = null, rotateGrip = null, wrapRow = null, wrapRowOpen = false, fadeRow = null, fadeRowOpen = false, fadeHold = false, armed = false;
  // Draw's touch-rotate rules (draw/draw.js): live 15deg magnet, right-angle gravity at release.
  const ROTATE_STEP = Math.PI / 12, ROTATE_MAGNET_RAD = 4 * Math.PI / 180, ROTATE_GRAVITY_RAD = 5 * Math.PI / 180;
  let lastWidth = 0, lastHeight = 0, restoring = false, printing = false, lastObstacles = [], userIntent = 0, caretPlaced = null;
  let ownerBoxes = new Map(), lastPictures = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrapped = layout => layout?.wrap === 'around' || layout?.wrap === 'box';
  // F75-6: behind/front leave the flow. `positioned` = has anchored x/y; `wrapped` = text reflows around it.
  const outOfFlow = layout => layout?.wrap === 'behind' || layout?.wrap === 'front';
  // A behind picture paints at z-index -1: no pointer lands on it. The engine takes it from a gap; this file's hold takes it through the words (#358).
  function behindPictureAt(x, y) {
    if (!host || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (const image of host.querySelectorAll('.block-read img[data-rapier-markdown-image]')) {
      const holder = image.closest('[data-md-layout]');
      if (!holder || metadata?.parseLayoutAttribute?.(holder.getAttribute('data-md-layout'))?.wrap !== 'behind') continue;
      const box = image.getBoundingClientRect();
      if (box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return image;
    }
    return null;
  }
  const positioned = layout => wrapped(layout) || outOfFlow(layout);
  const px = value => `${Math.round(value * 100) / 100}px`;
  const notify = () => globalThis.RapierAgentBrowser?.contextChanged?.('image');
  const rect = element => element.getBoundingClientRect();
  const hasSelection = () => {
    const selection = window.getSelection();
    return selection && !selection.isCollapsed && selection.rangeCount && _rangeIntersectsEditor(selection.getRangeAt(0));
  };

  function style(element, values) {
    let saved = ownedStyles.get(element);
    if (!saved) { saved = new Map(); ownedStyles.set(element, saved); }
    for (const [name, value] of Object.entries(values)) {
      if (!saved.has(name)) saved.set(name, {value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name), applied: value});
      else saved.get(name).applied = value;
      element.style.setProperty(name, value);
      saved.get(name).applied = element.style.getPropertyValue(name);
    }
  }

  function watch() {
    observer?.observe(host, {childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'hidden', 'data-section-hidden', 'data-folded',
        'data-rapier-image-layout', 'data-md-image-width', 'data-rapier-image-size', 'width', 'src']});
  }

  function settleComposition(paragraph, record) {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const mapping = endpoints.get(node);
      if (mapping?.record === record) spliceComposedRun(mapping, node.data ?? '');
    }
  }

  function restore(wrapper = null) {
    observer?.disconnect();
    restoring = true;
    for (const [paragraph, record] of projections) {
      if (wrapper && record.wrapper !== wrapper) continue;
      if (paragraph.dataset.rapierFlow === 'true') {
        // IME may have edited projected text; mirror it before replacing the projection with its original nodes.
        settleComposition(paragraph, record);

        const current = paragraph.childNodes, written = record.projected;
        const intact = !!written && current.length === written.length &&
          written.every((node, index) => current[index] === node);
        // The projection is a view, never the content (R86v): a browser edit inside it is read back by difference and the original nodes restored.
        if (!intact) reconcileProjection(paragraph, record);
        paragraph.replaceChildren(...record.original);
        delete paragraph.dataset.rapierFlow;
      }
      projections.delete(paragraph);
    }
    for (const map of [floats, floatsRight]) for (const [paragraph, box] of map) {
      if (wrapper && !wrapper.contains(paragraph) && !wrapper.contains(box)) continue;
      box.remove(); map.delete(paragraph);
    }
    for (const [element, saved] of ownedStyles) {
      if (wrapper && element !== wrapper && !wrapper.contains(element)) continue;
      for (const [name, state] of saved) {
        if (element.style.getPropertyValue(name) !== state.applied) continue;
        if (state.value) element.style.setProperty(name, state.value, state.priority); else element.style.removeProperty(name);
      }
      ownedStyles.delete(element);
    }
    if (!wrapper && !holding()) tail?.remove();
    restoring = false;
    watch();
  }

  // A browser-inserted line break counts as one space. The caret moves to the original node at the same offset.
  function reconcileProjection(paragraph, record) {
    const written = record.projected || [];
    const oldParts = [], points = [];
    const mapped = [];
    for (const root of written) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      if (root.nodeType === Node.TEXT_NODE) mapped.push(root);
      for (let node; (node = walker.nextNode());) mapped.push(node);
    }
    let last = null;
    for (const node of mapped) {
      const mapping = endpoints.get(node);
      if (!mapping || mapping.record !== record) continue;
      const own = mapping.points || mapping.offsets?.map(offset => ({node: mapping.node, offset, parents: mapping.parents}));
      const text = mapping.text ?? '';
      if (!own || own.length < text.length + 1) return;
      oldParts.push(text); points.push(...own.slice(0, text.length)); last = own[text.length];
    }
    if (!last) return;
    points.push(last);
    const selection = window.getSelection();
    let caret = null;
    const parts = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let length = 0;
    for (let node; (node = walker.nextNode());) {
      if (node.nodeType === Node.ELEMENT_NODE) { if (node.tagName === 'BR') { parts.push(' '); length++; } continue; }
      if (selection?.rangeCount && selection.anchorNode === node && selection.isCollapsed) caret = length + clamp(selection.anchorOffset, 0, node.data.length);
      parts.push(node.data); length += node.data.length;
    }
    const whole = {points, record, text: oldParts.join('')};
    const spliced = spliceComposedRun(whole, parts.join(''));
    if (spliced && caret != null && whole.points[caret]) {
      const point = whole.points[caret];
      try { selection.setBaseAndExtent(point.node, point.offset, point.node, point.offset); } catch (_) {}
    }
  }

  // Split law (R86v): splitting a wrapped picture's paragraph never moves the picture; it stays with the half its top is in, `y` restated.
  // `place`: 'keep', 'before' or 'between' for _splitBlockAtCaret. `range` is the caret.
  function splitPlan(wrapper, range) {
    const paragraph = prose(wrapper);
    if (!paragraph || !range || !lastPictures.length) return null;
    const box = ownerBoxes.get(wrapper);
    if (!box) return null;
    const own = lastPictures.filter(picture => picture.ownerWrapper === wrapper && picture.row.standalone &&
      picture.row.block && picture.row.image?.isConnected && !outOfFlow(picture.row.layout));
    if (!own.length) return null;
    const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight) || box.em * 1.65;
    const paragraphRect = rect(paragraph), wrapperRect = rect(wrapper);
    // The last line is that of the last non-space character before the caret: a soft wrap draws the caret at the next line.
    const probe = document.createRange();
    let at = range.startOffset;
    const text = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.data : null;
    if (text) while (at > 0 && /\s/.test(text[at - 1])) at--;
    if (text && at > 0) { probe.setStart(range.startContainer, at - 1); probe.setEnd(range.startContainer, at); }
    else { probe.setStart(range.startContainer, range.startOffset); probe.collapse(true); }
    const rects = probe.getClientRects(), caretRect = rects.length ? rects[rects.length - 1] : probe.getBoundingClientRect();
    const firstBottom = Math.max(0, caretRect.top - paragraphRect.top) + lineHeight;
    // A top inside the opening between halves lands at the second half's top.
    const inset = Math.max(0, paragraphRect.top - wrapperRect.top) + Math.max(0, wrapperRect.bottom - paragraphRect.bottom);
    const secondTop = firstBottom + inset + (parseFloat(getComputedStyle(wrapper).marginBottom) || 0);
    const plan = [];
    for (const picture of own) {
      const top = picture.y - picture.ownerTop;
      const before = !!(picture.row.wrapper.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING);
      const lower = top >= firstBottom;
      const layout = picture.row.layout;
      const source = sourceCache.get(picture.row.block);
      if (!layout || !source?.occurrence?.standalone) continue;
      const restated = () => {
        const y = Math.round(Math.max(0, top - secondTop) / box.em * 100) / 100;
        const edit = imageLayoutEdit({block: picture.row.block}, source.occurrence, {...layout, y});
        const raw = picture.row.block.raw;
        return raw.slice(0, edit.start) + edit.text + raw.slice(edit.end);
      };
      if (before && lower) plan.push({block: picture.row.block, place: 'between', raw: restated()});
      else if (!before && lower) plan.push({block: picture.row.block, place: 'keep', raw: restated()});
      else if (!before && !lower) plan.push({block: picture.row.block, place: 'before', raw: picture.row.block.raw});
    }
    return plan.length ? plan : null;
  }

  // Re-setting the selection drops the caret's pending B/I/U/S mark: only set it where this moved it.
  function sameSelection(selection, start, end) {
    return !!selection?.rangeCount && selection.anchorNode === start?.node && selection.anchorOffset === start?.offset &&
      selection.focusNode === end?.node && selection.focusOffset === end?.offset;
  }

  function mappedPoint(node, offset) {
    if (node?.nodeType === Node.TEXT_NODE) {
      const mapping = endpoints.get(node);
      if (mapping) {
        const at = clamp(Number(offset) || 0, 0, (mapping.points || mapping.offsets).length - 1);
        return {...(mapping.points?.[at] || {node: mapping.node, offset: mapping.offsets[at], parents: mapping.parents}), mapping};
      }
      return {node, offset};
    }
    if (!node?.querySelectorAll || !node.closest?.('[data-rapier-flow="true"]')) return {node, offset};
    const children = node.childNodes;
    let child = children[Math.min(Number(offset) || 0, children.length - 1)];
    const atEnd = Number(offset) >= children.length;
    while (child?.childNodes?.length) child = atEnd ? child.lastChild : child.firstChild;
    return child ? mappedPoint(child, atEnd ? (child.textContent || '').length : 0) : null;
  }

  function textOffset(root, node, offset) {
    const records = [...projections].filter(([paragraph]) => root === paragraph || root.contains(paragraph));
    if (!records.length) return undefined;
    const length = node => node.nodeType === Node.COMMENT_NODE ? 0 : (node.textContent || '').length;
    const prefix = (root, node, offset) => {
      if (!node || root !== node && !root.contains(node)) return null;
      let size = node.nodeType === Node.TEXT_NODE ? clamp(offset, 0, length(node)) :
        [...node.childNodes].slice(0, offset).reduce((sum, child) => sum + length(child), 0);
      for (let current = node; current !== root; current = current.parentNode)
        for (let previous = current.previousSibling; previous; previous = previous.previousSibling) size += length(previous);
      return size;
    };
    const at = prefix(root, node, offset);
    if (at == null) return null;
    let result = at;
    for (const [paragraph, record] of records) {
      const start = prefix(root, paragraph, 0), visible = length(paragraph);
      const original = record.original.reduce((sum, child) => sum + length(child), 0);
      if (paragraph === node || paragraph.contains(node)) {
        let own = 0;
        if (paragraph === node && offset === paragraph.childNodes.length) own = original;
        else if (paragraph !== node || offset !== 0) {
          const point = mappedPoint(node, offset);
          if (!point?.node) return null;
          let found = false;
          for (const child of record.original) {
            if (child === point.node || child.contains?.(point.node)) {
              own += prefix(child, point.node, point.offset); found = true; break;
            }
            own += length(child);
          }
          if (!found) return null;
        }
        result += own - (at - start);
      } else if (start + visible <= at) result += original - visible;
    }
    return result;
  }

  function sourcePoint(wrapper, block, node, offset) {
    const point = mappedPoint(node, offset);
    if (!point?.mapping) return undefined;
    const record = point.mapping.record;
    if (!node?.isConnected || !wrapper.contains(node) || record.wrapper !== wrapper || record.raw !== block.raw) return null;
    const transformed = point.parents?.some(element =>
      /^(A|CODE|STRONG|B|EM|I|S|DEL|U|INS|MARK|ABBR)$/.test(element.tagName) || element.hasAttribute('data-rapier-source'));
    return {node: point.node, offset: point.offset, transformed: !!transformed};
  }

  function restoreSelection() {
    const viewport = _rapierCaptureEditorViewport();
    try {
      const selection = window.getSelection();
      if (!selection?.rangeCount) { restore(); return; }
      const start = mappedPoint(selection.anchorNode, selection.anchorOffset);
      const end = mappedPoint(selection.focusNode, selection.focusOffset);
      restore();
      if (start?.node?.isConnected && end?.node?.isConnected) {
        try { selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset); } catch (_) {}
      }
    } finally { _rapierRestoreEditorViewport(viewport); }
  }

  function projectedPoint(paragraph, node, offset) {
    if (!node || paragraph?.dataset.rapierFlow !== 'true') return null;
    const record = projections.get(paragraph);
    if (node.nodeType !== Node.TEXT_NODE) {
      const children = node === paragraph ? record?.original : node.childNodes;
      if (!children) return null;
      const index = clamp(Number(offset) || 0, 0, children.length);
      const text = (child, end) => {
        if (child?.nodeType === Node.TEXT_NODE) return child;
        const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        let found = walker.nextNode();
        if (end) for (let next; (next = walker.nextNode());) found = next;
        return found;
      };
      let found = null, end = false;
      for (let at = index; !found && at < children.length; at++) found = text(children[at], false);
      if (!found) {
        end = true;
        for (let at = index - 1; !found && at >= 0; at--) found = text(children[at], true);
      }
      if (!found) return null;
      node = found; offset = end ? found.data.length : 0;
    }
    const positions = new Map();
    let size = 0;
    for (const run of record.runs) { positions.set(run.node, size); size += run.node.data.length; }
    if (!positions.has(node)) return null;
    const target = positions.get(node) + clamp(Number(offset) || 0, 0, node.data.length);
    let best = null, distance = Infinity;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      const mapping = endpoints.get(text);
      if (!mapping) continue;
      for (let at = 0; at < (mapping.points || mapping.offsets || []).length; at++) {
        const point = mapping.points?.[at] || {node: mapping.node, offset: mapping.offsets[at]};
        if (!positions.has(point.node)) continue;
        if (point.node === node && point.offset === offset) return {node: text, offset: at};
        const delta = Math.abs(positions.get(point.node) + point.offset - target);
        if (delta < distance) { best = {node: text, offset: at}; distance = delta; }
      }
    }
    return best;
  }

  function unproject(wrapper) {
    if (!wrapper || ![...projections.values()].some(row => row.wrapper === wrapper)) return false;
    const selection = window.getSelection();
    let start = null, end = null;
    if (selection?.rangeCount) {
      start = mappedPoint(selection.anchorNode, selection.anchorOffset);
      end = mappedPoint(selection.focusNode, selection.focusOffset);
    }
    restore(wrapper);
    if (start?.node?.isConnected && end?.node?.isConnected) {
      try { selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset); } catch (_) {}
    }
    return true;
  }

  function editSource(wrapper) {
    for (const [paragraph, record] of projections) {
      if (record.wrapper !== wrapper || paragraph.dataset.rapierFlow !== 'true') continue;
      const clone = paragraph.cloneNode(false);
      clone.append(...record.original.map(node => node.cloneNode(true)));
      return clone;
    }
    return null;
  }

  function livePoint(wrapper, node, offset) {
    for (const [paragraph, record] of projections) {
      if (wrapper && record.wrapper !== wrapper) continue;
      const point = projectedPoint(paragraph, node, offset);
      if (point) return point;
    }
    return null;
  }

  // Projected offsets can collapse whitespace or cross nodes; splice the original range and rebase every endpoint.
  function spliceComposedRun(mapping, newText) {
    const oldText = mapping.text ?? '';
    if (oldText === newText) return null;
    const points = mapping.points || mapping.offsets?.map(offset => ({node: mapping.node, offset, parents: mapping.parents}));
    if (!points?.length) return null;
    let prefix = 0;
    const capPrefix = Math.min(oldText.length, newText.length);
    while (prefix < capPrefix && oldText[prefix] === newText[prefix]) prefix++;
    let suffix = 0;
    const capSuffix = Math.min(oldText.length, newText.length) - prefix;
    while (suffix < capSuffix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;
    const removedStart = prefix, removedEnd = oldText.length - suffix;
    const insertedText = newText.slice(prefix, newText.length - suffix);
    const from = points[clamp(removedStart, 0, points.length - 1)];
    const to = points[clamp(removedEnd, 0, points.length - 1)];
    const runs = mapping.record.runs, start = runs.findIndex(run => run.node === from.node),
      end = runs.findIndex(run => run.node === to.node);
    if (start < 0 || end < start || runs.slice(start, end + 1).some(run =>
      run.parents.some(parent => parent.getAttribute('contenteditable') === 'false'))) return null;
    const changes = new Map();
    for (let index = end; index >= start; index--) {
      const node = runs[index].node, data = node.data;
      const a = index === start ? clamp(from.offset, 0, data.length) : 0;
      const b = index === end ? clamp(to.offset, a, data.length) : data.length;
      const text = index === start ? insertedText : '';
      node.data = data.slice(0, a) + text + data.slice(b);
      changes.set(node, {a, b, length: text.length});
    }
    const relocate = point => {
      const change = changes.get(point.node);
      if (!change || point.offset < change.a) return point;
      return {...point, offset: point.offset >= change.b ? point.offset + change.length - change.b + change.a : change.a + change.length};
    };
    const walker = document.createTreeWalker(mapping.record.paragraph, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const other = endpoints.get(node);
      if (!other || other === mapping || other.record !== mapping.record) continue;
      if (other.points) other.points = other.points.map(relocate);
      if (other.offsets && changes.has(other.node))
        other.offsets = other.offsets.map(offset => relocate({node: other.node, offset}).offset);
    }
    const next = points.slice(0, prefix + 1);
    const a = changes.get(from.node).a;
    for (let index = 1; index <= insertedText.length; index++) next.push({...from, offset: a + index});
    next.push(...points.slice(removedEnd + 1).map(relocate));
    mapping.points = next;
    delete mapping.offsets;
    mapping.text = newText;
    return true;
  }

  function mirrorComposedText(record, text, mapping) {
    spliceComposedRun(mapping, text.data ?? '');
    layoutNow(record.wrapper);
  }

  function activation(wrapper, value) {
    if (![...projections.values()].some(row => row.wrapper === wrapper)) return value;
    const viewport = _rapierCaptureEditorViewport(null, false);
    const options = {...(value || {})};
    const range = options.liveRange || (Number.isFinite(options.clientX) && Number.isFinite(options.clientY)
      ? _rapierCaretRangeFromPoint(options.clientX, options.clientY) : null);
    const point = range && mappedPoint(range.startContainer, range.startOffset);
    restore(wrapper);
    if (point?.node?.isConnected && wrapper.contains(point.node)) {
      const restored = document.createRange();
      try {
        restored.setStart(point.node, point.offset); restored.collapse(true);
        options.liveRange = restored;

        options.caretNode = point.node; options.caretOffset = point.offset;
        delete options.clientX; delete options.clientY;
      } catch (_) { options.liveRange = null; }
    }
    schedule();
    _rapierRestoreEditorViewport(viewport);
    return options;
  }

  function prepareParagraph(paragraph, wrapper) {
    const known = cache.get(paragraph);
    if (known && known.raw === _rapierBoundBlock(wrapper)?.raw) return known;
    if (!paragraph.textContent.trim() || paragraph.textContent.length > 8192 ||
        paragraph.querySelector('img,svg,math,br,input,button,iframe,canvas,.math-rendered')) return null;
    const runs = [], items = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (runs.length >= 192) return null;
      const parents = [];
      for (let parent = node.parentElement; parent && parent !== paragraph; parent = parent.parentElement) {
        if (!/^(A|SPAN|EM|I|STRONG|B|DEL|S|MARK|CODE|U|INS|ABBR|SUP|SUB)$/.test(parent.tagName)) return null;
        parents.unshift(parent);
      }
      const computed = getComputedStyle(node.parentElement);
      const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
      const letterSpacing = parseFloat(computed.letterSpacing) || 0;
      const softbreak = parents.some(parent => parent.classList.contains('rapier-source-token--softbreak'));
      const prepared = geometry.prepareRun(softbreak ? ' ' : node.data, font, letterSpacing);
      if (!prepared) return null;
      const atomic = parents.some(parent => parent.tagName === 'CODE' || parent.hasAttribute('data-rapier-source'));
      const extraWidth = atomic ? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
        .reduce((width, key) => width + (parseFloat(computed[key]) || 0), 0) : 0;
      const directions = parents.map(parent => parent.getAttribute('dir') === 'auto' ? getComputedStyle(parent).direction : null);
      runs.push({node, parents, directions, prepared});
      items.push({text: prepared.raw, font, letterSpacing, break: atomic && !softbreak ? 'never' : 'normal', extraWidth});
    }
    if (!runs.length) return null;
    const computed = getComputedStyle(paragraph);

    if (computed.textAlign === 'justify' || computed.writingMode !== 'horizontal-tb' || computed.textTransform !== 'none') return null;
    const fontSize = parseFloat(computed.fontSize) || 16;
    const record = {wrapper, paragraph, runs, flow: pretext.prepareRichInline(items),
      original: [...paragraph.childNodes], raw: _rapierBoundBlock(wrapper)?.raw, fontSize,
      lineHeight: parseFloat(computed.lineHeight) || fontSize * 1.65,
      direction: computed.direction, align: computed.textAlign, balance: computed.textWrapStyle === 'balance' ? fontSize : 0};
    cache.set(paragraph, record);
    return record;
  }

  function fragmentNode(record, fragment) {
    const run = record.runs[fragment.itemIndex];
    const mapped = geometry.mapFragment(run.prepared, fragment);
    if (!mapped) return null;
    const text = document.createTextNode(mapped.text);

    endpoints.set(text, {node: run.node, offsets: mapped.offsets, parents: run.parents, record, text: mapped.text});
    let child = text;
    for (let index = run.parents.length - 1; index >= 0; index--) {
      const shell = run.parents[index].cloneNode(false);
      shell.removeAttribute('id');
      if (run.directions[index]) shell.setAttribute('dir', run.directions[index]);
      shell.append(child); child = shell;
    }
    return child;
  }

  function gapPoints(record, previous, current) {
    if (!previous) return null;
    let first = null, last = null, sealed = false;
    for (let index = previous.itemIndex; index <= current.itemIndex; index++) {
      const run = record.runs[index];
      const start = index === previous.itemIndex ? geometry.cursorOffset(run.prepared, previous.end) : 0;
      const end = index === current.itemIndex ? geometry.cursorOffset(run.prepared, current.start) : run.prepared.raw.length;
      if (start == null || end == null || end < start) return null;
      const raw = run.prepared.raw.slice(start, end);
      if (!raw) continue;
      if (!/^[ \t\n\r\f]+$/.test(raw)) return null;
      sealed ||= run.parents.some(parent => parent.getAttribute('contenteditable') === 'false');
      first ||= {node: run.node, offset: start, parents: run.parents};
      last = {node: run.node, offset: end, parents: run.parents};
    }
    return first ? {points: [first, last], sealed} : null;
  }

  function narrowestColumn(fontSize) {
    return metadata.wrapColumnFloor(fontSize);
  }

  // F75-11: a committed raster rotation turns this alpha via geometry.rotatedRasterAlpha; the angle is in the cache key.
  function pictureProfile(image, rotateRad = 0) {
    // A live rotate keeps the <img> src and feeds its own profile, bypassing the cache.
    if (moving?.kind === 'rotate' && moving.image === image) return moving.previewProfile || null;
    if (!image?.complete || !(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return null;
    const src = image.currentSrc || image.getAttribute('src') || '';
    const cached = shapeProfiles.get(image);
    if (cached?.src === src && cached.width === image.naturalWidth && cached.height === image.naturalHeight && cached.angle === rotateRad) return cached.profile;
    let profile = (typeof _rapierDrawShapeProfile === 'function' && _rapierDrawShapeProfile(image)) || geometry.alphaProfile(image);
    if (rotateRad && profile) profile = geometry.rotatedRasterAlpha(profile, image.naturalWidth, image.naturalHeight, rotateRad) || profile;
    shapeProfiles.set(image, {src, width: image.naturalWidth, height: image.naturalHeight, angle: rotateRad, profile});
    return profile;
  }

  function pictureSlices(image, x, y, width, height, rotateRad = 0) {
    return geometry.pictureSlices(pictureProfile(image, rotateRad), x, y, width, height);
  }

  // Only a Rapier drawing turns its bytes; a raster rotates through `rotate=` (F75-11). Never both owners of one angle.
  function isDrawing(image) {
    return typeof _rapierDrawRecipeFromImage === 'function' && !!_rapierDrawRecipeFromImage(image);
  }

  function recipeView(recipe) {
    const view = recipe.view;
    return view && view.w > 0 && view.h > 0 ? view : {x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h};
  }

  // geometry.polygonProfile is the one owner.

  // No recipe: no profile; its box is the whole rectangle.
  function boxProfile(recipe) {
    const corners = recipe && globalThis.RapierDrawEdit?.contentTiltBox(recipe);
    if (!corners) return null;
    const view = recipeView(recipe);
    return geometry.polygonProfile(corners.map(([x, y]) => [(x - view.x) / view.w, (y - view.y) / view.h]));
  }

  function boxSlices(image, x, y, width, height, previewRecipe) {
    const recipe = previewRecipe || (typeof _rapierDrawRecipeFromImage === 'function' && _rapierDrawRecipeFromImage(image));
    return geometry.pictureSlices(recipe ? boxProfile(recipe) : null, x, y, width, height);
  }

  // Live preview and commit render from one candidate (the headless writer, whole-pixel view box): the saved footprint is what the finger drags.
  // Text glyphs get no cover mid-drag.
  function rotateCandidate(recipe) {
    const core = globalThis.RapierDrawCore;
    if (typeof _rapierDrawShapeProfileFor !== 'function' || !core?._rapierDrawBuildSVG) return null;
    rotatePerf.writer++;
    const svg = core._rapierDrawBuildSVG(recipe);
    const match = /viewBox="([^"]+)"/.exec(svg);
    if (!match) return null;
    const [x, y, w, h] = match[1].trim().split(/\s+/).map(Number);
    const view = {x, y, w, h};
    return {svg, view, profile: _rapierDrawShapeProfileFor({...recipe, view}, null)};
  }

  function project(record, width, top, obstacles) {
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      narrowestColumn(record.fontSize), record.direction, record.balance);
    if (!plan) return null;
    const output = document.createDocumentFragment();
    let previous = null;
    const {lineHeight} = record;
    for (const line of plan.lines) {
      const element = document.createElement('span');
      element.className = 'rapier-flow-line';
      element.style.cssText = `left:${px(line.x)};top:${px(line.y)};width:${px(line.width)};height:${px(lineHeight)};direction:${record.direction}`;
      element.style.textAlign = ['left', 'center', 'right', 'start', 'end'].includes(record.align)
        ? record.align : record.direction === 'rtl' ? 'right' : 'left';
      for (const fragment of line.fragments) {
        const child = fragmentNode(record, fragment);
        if (!child) return null;
        const mapped = gapPoints(record, previous, fragment);
        if (mapped) {
          const space = document.createTextNode(' '), gap = document.createElement('span');
          endpoints.set(space, {points: mapped.points, record, text: ' '});
          gap.style.cssText = `display:inline-block;width:${px(fragment.gapBefore)}`;
          if (mapped.sealed) gap.setAttribute('contenteditable', 'false');
          gap.append(space); element.append(gap);
        }
        element.append(child); previous = fragment;
      }
      output.append(element);
    }
    record.paragraph.replaceChildren(output);
    record.paragraph.dataset.rapierFlow = 'true';
    style(record.paragraph, {position: 'relative', height: px(plan.height), 'min-height': '0'});

    record.projected = [...record.paragraph.childNodes];
    projections.set(record.paragraph, record);
    return plan.height;
  }

  function floatAround(paragraph, natural, top, obstacles) {
    const width = natural.width, bottom = top + natural.height;
    const inside = obstacles.filter(obstacle => obstacle.y < bottom + 4096 && obstacle.y + obstacle.height > top &&
      obstacle.x < width && obstacle.x + obstacle.width > 0);
    if (!inside.length) return null;
    // Geometry is layout/model.mjs wrapShape; only the CSS spelling is local.
    const shapeFor = side => {
      const shape = geometry.wrapShape(side, inside, width, top);
      if (!shape) return null;
      return {...shape, shapeCss: ';shape-outside:polygon(' + shape.points.map(point => px(point[0]) + ' ' + px(point[1])).join(',') + ') border-box'};
    };
    const shapes = {left: shapeFor('left'), right: shapeFor('right')};
    const spent = (shapes.left?.boxWidth || 0) + (shapes.right?.boxWidth || 0);
    if (!spent || spent > width - narrowestColumn(parseFloat(getComputedStyle(paragraph).fontSize))) return null;
    for (const [side, map] of [['left', floats], ['right', floatsRight]]) {
      const shape = shapes[side];
      let box = map.get(paragraph);
      if (!shape) { box?.remove(); map.delete(paragraph); continue; }
      if (!box) {
        box = document.createElement('span'); box.className = 'rapier-flow-float';
        box.setAttribute('contenteditable', 'false'); box.setAttribute('aria-hidden', 'true');
        map.set(paragraph, box);
      }
      box.style.cssText = `float:${side};width:${px(shape.boxWidth)};height:${px(shape.boxHeight)};margin-top:${px(shape.startY)}${shape.shapeCss}`;
      if (paragraph.firstChild !== box) paragraph.prepend(box);
    }
    // flow-root and float bottoms bound to content: floats never stack across blocks. Settles in a pass or two.
    style(paragraph, {display: 'flow-root'});
    const contentBottom = () => {
      const range = document.createRange();
      let first = paragraph.firstChild;
      while (first && first.classList?.contains('rapier-flow-float')) first = first.nextSibling;
      if (!first || !paragraph.lastChild) return rect(paragraph).height;
      range.setStartBefore(first); range.setEndAfter(paragraph.lastChild);
      return range.getBoundingClientRect().bottom - rect(paragraph).top;
    };
    for (let pass = 0; pass < 4; pass++) {
      const content = contentBottom();
      let changed = false;
      for (const [side, map] of [['left', floats], ['right', floatsRight]]) {
        const box = map.get(paragraph), shape = shapes[side];
        if (!box || !shape) continue;
        const bounded = Math.max(0, Math.min(shape.boxHeight, content - shape.startY));
        if (Math.abs((parseFloat(box.style.height) || 0) - bounded) > 0.5) { box.style.height = px(bounded); changed = true; }
      }
      if (!changed) break;
    }
    return rect(paragraph).height;
  }

  function layoutOf(image) {
    return metadata.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
  }

  // geometry.imageOnly (layout/model.mjs) admits a linked picture.
  const imageOnly = geometry.imageOnly;

  // F75-11: an inline turned raster stays in flow with CSS transform and margins reserving the AABB growth; alone in its paragraph it also
  // turns display:block. Plain (F75-12) clears any turn this node still wears.
  const CLEARED_ROTATE_STYLE = Object.freeze({transform: '', 'transform-origin': '', 'margin-left': '', 'margin-right': '', display: '', 'margin-top': '', 'margin-bottom': ''});
  function syncInlineRotatedPictures() {
    if (!host) return;
    const plain = _rapierPlainLayout();
    for (const image of host.querySelectorAll('img[data-rapier-image-layout]')) {
      if (moving?.image === image) continue;
      const layout = layoutOf(image);
      // Clear only what this wrote: resize and alignment own their margins.
      const turnedHere = image.hasAttribute('data-rapier-inline-turn');
      if (plain || !layout?.rotate || positioned(layout) || !(image.naturalWidth > 0) || !(image.naturalHeight > 0) || !image.isConnected) {
        if (turnedHere) { style(image, CLEARED_ROTATE_STYLE); image.removeAttribute('data-rapier-inline-turn'); }
        continue;
      }
      const width = image.offsetWidth, height = image.offsetHeight;
      if (!(width > 0 && height > 0)) { if (turnedHere) { style(image, CLEARED_ROTATE_STYLE); image.removeAttribute('data-rapier-inline-turn'); } continue; }
      const paragraph = image.closest('p');
      const alone = !!paragraph && imageOnly(paragraph, image);
      const baseLeft = parseFloat(getComputedStyle(image).marginLeft) || 0;
      const rotated = geometry.rotatedBoundsRad(width, height, layout.rotate * Math.PI / 180);
      const dx = (rotated.width - width) / 2, dy = (rotated.height - height) / 2;
      const values = {transform: `rotate(${layout.rotate}deg)`, 'transform-origin': '50% 50%',
        'margin-left': px(baseLeft + dx), 'margin-right': px(dx)};
      if (alone) { values.display = 'block'; values['margin-top'] = px(dy); values['margin-bottom'] = px(dy); }
      style(image, values);
      image.setAttribute('data-rapier-inline-turn', '1');
    }
  }

  function sourceOccurrence(record) {
    const {block, image} = record, raw = block.raw, tokenEnd = image.tokenEnd ?? image.end;
    const target = metadata.layoutTargets(raw, md, _rapierMarkdownEnvironment()).find(value => value.start <= image.start && value.end >= tokenEnd);
    if (target?.reason || target?.level > 0) return {reason: target.reason || 'nested_image'};
    if (target?.imageOnly && !(raw.slice(0, target.start) + raw.slice(target.end)).trim()) {
      return {...target, start: 0, end: raw.length, standalone: true, source: raw};
    }
    return {start: image.start, end: tokenEnd, insert: tokenEnd, marker: null, layout: {}, standalone: false,
      source: raw.slice(image.start, tokenEnd)};
  }

  function heldWrappers() {
    if (!host?.isConnected) return [];
    const top = host.scrollTop, bottom = top + host.clientHeight;
    return [...new Set([...lastObstacles.filter(obstacle => obstacle.wrapper?.isConnected &&
      obstacle.y < bottom && obstacle.y + obstacle.height > top).flatMap(obstacle => [obstacle.wrapper, obstacle.owner]),
      moving?.image.closest('.block-wrapper'), moving?.owner].filter(Boolean))];
  }

  function readOf(wrapper) {
    return wrapper?.querySelector(':scope > .block-read') ||
      wrapper?._rapierDormant?.find(node => node.classList?.contains('block-read'));
  }

  function editProse(wrapper) {
    if (!wrapper?.classList.contains('block-wrapper--editing') || wrapper.classList.contains('block-wrapper--source-edit')) return null;
    const edit = wrapper.querySelector(':scope > .block-edit');
    const paragraph = edit?.children.length === 1 && edit.firstElementChild.tagName === 'P' ? edit.firstElementChild : null;
    return paragraph?.textContent.trim() && !paragraph.querySelector('img') ? paragraph : null;
  }

  function prose(wrapper) {
    if (!wrapper || wrapper.hidden || wrapper.classList.contains('block-wrapper--metadata')) return null;
    if (wrapper.classList.contains('block-wrapper--editing')) return editProse(wrapper);
    const read = readOf(wrapper);
    const paragraph = read?.children.length === 1 && read.firstElementChild.tagName === 'P' ? read.firstElementChild : null;
    return paragraph?.textContent.trim() && !paragraph.querySelector('img') ? paragraph : null;
  }

  function pictureOnly(wrapper) {
    const read = readOf(wrapper);
    const paragraph = read?.children.length === 1 && read.firstElementChild.tagName === 'P' ? read.firstElementChild : null;
    return !!paragraph && !paragraph.textContent.trim() && paragraph.querySelectorAll('img').length === 1;
  }

  // Wrap law: ownership is paragraph-only; participation is any prose or heading in the band. Lists, quotes and details flow through a float.
  // Tables, code, rules, math and figures push below.
  const WRAP_PARTICIPANT_TAG = /^(P|H[1-6])$/;
  const wrapParticipant = element => element && WRAP_PARTICIPANT_TAG.test(element.tagName) ? element : null;
  const FLOW_BLOCK_TAG = /^(UL|OL|BLOCKQUOTE|DETAILS|DL)$/;
  const flowBlock = element => element && FLOW_BLOCK_TAG.test(element.tagName) && !element.querySelector('table, pre, figure, .math-rendered, img') ? element : null;

  // An empty paragraph is transparent to the owner search until it holds words.
  function emptyParagraph(wrapper) {
    const surface = wrapper.classList.contains('block-wrapper--editing') ? wrapper.querySelector(':scope > .block-edit') : readOf(wrapper);
    if (!surface) return false;
    const children = [...surface.children];
    if (children.length > 1 || (children.length === 1 && children[0].tagName !== 'P')) return false;
    return !surface.textContent.trim() && !surface.querySelector('img');
  }

  function wrapOwner(wrapper) {
    return metadata.wrapNeighbour(wrapper, node => {
      if (!node.classList.contains('block-wrapper') || node.classList.contains('block-wrapper--metadata')) return 'metadata';
      if (emptyParagraph(node)) return 'metadata';
      if (node.classList.contains('block-wrapper--editing')) return {stop: editProse(node) ? node : null};
      if (prose(node)) return 'prose';
      if (!node.hidden && pictureOnly(node)) return 'picture';
      return null;
    });
  }

  function nextProse(wrapper, direction = 1) {
    for (let node = wrapper?.[direction > 0 ? 'nextElementSibling' : 'previousElementSibling']; node;
      node = node[direction > 0 ? 'nextElementSibling' : 'previousElementSibling']) {
      if (!node.classList.contains('block-wrapper')) continue;
      if (emptyParagraph(node)) continue;
      if (node.classList.contains('block-wrapper--editing')) return editProse(node) ? node : null;
      if (prose(node)) return node;
    }
    return null;
  }

  function mountedWrappers() {
    if (!host.classList.contains('editor-area--virtualized')) return [...host.children].filter(wrapper => wrapper.classList.contains('block-wrapper'));
    const ledger = _rapierWysiwygLedger, window = ledger.window;
    if (!window) return [];
    const wrappers = new Set(heldWrappers());
    for (let index = window[0]; index <= window[1]; index++) {
      const wrapper = ledger.entries.get(ledger.order[index])?.wrapper;
      if (wrapper) wrappers.add(wrapper);
    }
    if (moving) {
      wrappers.add(moving.image.closest('.block-wrapper'));
      wrappers.add(moving.owner);
      wrappers.add(nextProse(moving.owner || moving.image.closest('.block-wrapper'), -1));
      wrappers.add(nextProse(moving.owner || moving.image.closest('.block-wrapper')));
    }

    for (const wrapper of [...wrappers]) {
      if (!wrapper) continue;
      for (const side of ['nextElementSibling', 'previousElementSibling']) {
        for (let node = wrapper[side]; node?.classList?.contains('block-wrapper') && pictureOnly(node); node = node[side]) {
          if (readOf(node)?.querySelector('img[data-rapier-image-layout]')) wrappers.add(node);
        }
      }
    }
    for (const wrapper of [...wrappers]) {
      if (readOf(wrapper)?.querySelector('img[data-rapier-image-layout]')) wrappers.add(wrapOwner(wrapper));
    }
    for (const wrapper of wrappers) if (wrapper) _rapierWysiwygWake(wrapper);
    return [...wrappers].filter(Boolean).sort((a, b) =>
      ledger.indexById.get(String(a.dataset.blockId)) - ledger.indexById.get(String(b.dataset.blockId)));
  }

  function rows(wrappers) {
    return wrappers.filter(wrapper => wrapper?.isConnected && wrapper.classList.contains('block-wrapper') &&
      !wrapper.hidden && !wrapper._rapierDormant && !wrapper.classList.contains('block-wrapper--metadata')).map(wrapper => {
      const bounds = rect(wrapper), read = wrapper.querySelector(':scope > .block-read');
      const block = _rapierBoundBlock(wrapper);
      const image = moving && moving.blockId === block?.id ? moving.image : read?.querySelector('img');
      let source = block && sourceCache.get(block);
      if (image && block && (source?.raw !== block.raw || source?.references !== rapier.semantic.referenceRevision)) {
        const images = _rapierScanMarkdownImages(block.raw);
        source = {raw: block.raw, references: rapier.semantic.referenceRevision, images,
          occurrence: images.length === 1 ? sourceOccurrence({block, image: images[0]}) : null};
        sourceCache.set(block, source);
      }
      const found = source?.images || [];
      const standalone = found.length === 1 && source.occurrence?.standalone === true;
      // F75-12: Plain reads every layout as empty (_rapierPlainLayout); the source is untouched.
      const layout = standalone && image && !_rapierPlainLayout() ? source.occurrence.layout : null;
      const editable = wrapper.classList.contains('block-wrapper--editing');
      const children = read && [...read.children];
      const paragraph = editable ? editProse(wrapper) : children?.length === 1 ? wrapParticipant(children[0]) : null;
      const editChildren = editable ? [...(wrapper.querySelector(':scope > .block-edit')?.children || [])] : null;
      const flowing = paragraph ? null : editable ? (editChildren?.length === 1 ? flowBlock(editChildren[0]) : null)
        : children?.length === 1 ? flowBlock(children[0]) : null;
      const padTarget = editable ? wrapper.querySelector(':scope > .block-edit') : read;
      const imageBounds = image && rect(image);
      const naturalWidth = Number(image?.getAttribute('data-rapier-natural-width')) || image?.naturalWidth;
      const naturalHeight = Number(image?.getAttribute('data-rapier-natural-height')) || image?.naturalHeight;
      return {wrapper, read, block, image, standalone, layout, bounds, paragraph, flowing, editable, padTarget, naturalWidth, naturalHeight,
        imageBounds, paddingTop: padTarget ? parseFloat(getComputedStyle(padTarget).paddingTop) || 0 : 0};
    }).filter(row => row.block && row.bounds.width > 0 && row.bounds.height > 0);
  }

  function hideAnchor(row) {
    style(row.wrapper, {'content-visibility': 'visible', contain: 'none', height: '0', 'min-height': '0', margin: '0'});
    style(row.read, {position: 'relative', height: '0', 'min-height': '0', padding: '0', border: '0'});
    const paragraph = row.read.querySelector(':scope > p');
    if (paragraph) style(paragraph, {height: '0', margin: '0'});
  }

  function holding() {
    return !!moving && !moving.committing && moving.hold > 0;
  }
  function holdTail(wrappers) {
    if (!holding()) return;
    const last = wrappers.at(-1);
    if (!last || nextProse(last)) return;
    tail ||= document.createElement('div');
    tail.setAttribute('aria-hidden', 'true'); tail.className = 'rapier-flow-tail';
    if (!tail.isConnected || (parseFloat(tail.style.height) || 0) < moving.hold) tail.style.height = px(moving.hold);
    if (tail.previousElementSibling !== last) last.after(tail);
  }

  function gestureAnchor(gesture = moving) {
    return gesture?.anchor || (gesture?.kind === 'resize' && (!positioned(gesture.layout) || !gesture.owner)
      ? gesture.image.closest('.block-wrapper') : gesture?.owner) || null;
  }

  function viewAnchor() {
    const area = rect(host), x = Math.min(area.right - 2, area.left + 32), y = area.top + host.clientHeight * _RAPIER_VIEW_ANCHOR_RATIO;
    for (const element of document.elementsFromPoint(x, y)) {
      if (element === host) break;
      if (element.tagName === 'IMG' || element.classList?.contains('rapier-flow-tail')) continue;
      const wrapper = element.closest?.('#editor-blocks > .block-wrapper');
      if (wrapper && rect(wrapper).height >= 1) return wrapper;
    }
    return null;
  }

  function layout(anchorWrapper = null) {
    const pending = settle;
    // A just-settled picture owns the viewport for its settling interval (picture-rotate-perf's 8px).
    const settledWrapper = !pending && !moving && !anchorWrapper && performance.now() - settledAt < 400 && settledImage?.isConnected
      ? settledImage.closest('#editor-blocks > .block-wrapper') : null;
    const viewport = pending ? null : moving ? _rapierCaptureEditorViewport(gestureAnchor() || viewAnchor(), false, true)
      : anchorWrapper?.isConnected ? _rapierCaptureEditorViewport(anchorWrapper, false, true)
      : settledWrapper ? _rapierCaptureEditorViewport(settledWrapper, false, true)
      : _rapierEditorReadingPoint(viewAnchor(), false);
    try { projectDocument(anchorWrapper?.isConnected ? anchorWrapper : null); }
    catch (error) {
      restore();
      if (moving) { cancel(); showToast('image layout is unavailable for this passage', 'info'); }
      console.warn('[rapier] image layout', error);
    } finally {
      if (moving) moving.anchor = null; watch();
      if (pending) pinSettled();
      else if (moving?.kind === 'resize' && !moving.ownerGeometry) pinResize();
      else if (viewport) {

        _rapierRestoreEditorViewport(viewport);
        positionGrip();
      }

      if (host.classList.contains('editor-area--virtualized')) _rapierScheduleRenderWindow();
    }
  }

  const SETTLE_WINDOW = 320;
  function pinSettled() {
    const pending = settle;
    if (!pending) return false;
    if (userIntent !== pending.intent || performance.now() > pending.until) { endSettle(); return false; }

    const open = _activeBlockEditContext();
    if (open && open.editDiv !== pending.editDiv) { endSettle(); return false; }
    if (!pending.image?.isConnected) {

      pending.image = null;
      if (pending.position == null || rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown') return false;
      const spans = _rapierExcerptCanonicalBlockSpans();
      const block = rapier.document.blocks.find(row => spans.get(row.id)?.start === pending.position);

      const wrapper = block && _rapierWysiwygWake(document.querySelector('[data-block-id="' + block.id + '"]'));
      const image = wrapper?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[pending.index];
      if (!image) return false;
      pending.image = image;
    }
    _rapierCancelViewRestore();
    const delta = rect(pending.image).top - rect(host).top - pending.top;
    if (Math.abs(delta) > .5) { _rapierNoteViewportWrite(); host.scrollTop += delta; }
    settledAt = performance.now(); settledImage = pending.image;
    positionGrip();
    return true;
  }

  // Arm before projection replacement so the release position owns the first settled frame; new intent cancels it.
  function armSettle(top, position, index) {
    endSettle();
    if (!Number.isFinite(top)) return;
    settle = {image: null, top, position, index, intent: userIntent, until: performance.now() + 4000, observer: null, frame: 0,
      editDiv: _activeBlockEditContext()?.editDiv || null};
  }

  function endSettle() {
    if (!settle) return;
    settle.observer?.disconnect();
    if (settle.frame) cancelAnimationFrame(settle.frame);
    settle = null;
  }

  function settleNow(image, top) {
    if (!image?.isConnected || !Number.isFinite(top)) { endSettle(); schedule(); return; }
    const intent = settle?.intent ?? userIntent;
    endSettle();
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (settle?.observer === observer) pinSettled(); }) : null;
    settle = {image, top, position: null, index: -1, intent, until: performance.now() + SETTLE_WINDOW, observer, frame: 0,
      editDiv: _activeBlockEditContext()?.editDiv || null};
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    layout();
    if (!settle) return;
    if (observer) for (const wrapper of mountedWrappers()) observer.observe(wrapper);
    const tick = () => {
      if (!settle) return;
      settle.frame = 0;
      if (pinSettled() && settle) settle.frame = requestAnimationFrame(tick);
    };
    settle.frame = requestAnimationFrame(tick);
  }

  function projectDocument(forceWrapper = null) {
    frame = 0;

    if (!host || !geometry || !metadata || !pretext || restoring || printing || (hasSelection() && !forceWrapper) || rapier.composition.block || rapier.composition.source) return;
    if (moving?.committing) return;
    if (moving && !rebaseGesture(moving)) return;
    observer?.disconnect();

    const editSelection = window.getSelection();
    let preserveStart = null, preserveEnd = null;
    if (editSelection?.rangeCount && (host.contains(editSelection.anchorNode) || host.contains(editSelection.focusNode))) {
      preserveStart = mappedPoint(editSelection.anchorNode, editSelection.anchorOffset);
      preserveEnd = mappedPoint(editSelection.focusNode, editSelection.focusOffset);
    }
    restore(); observer?.disconnect();
    if (preserveStart && !preserveStart.node?.isConnected && editSelection?.rangeCount && host.contains(editSelection.anchorNode)) {
      preserveStart = {node: editSelection.anchorNode, offset: editSelection.anchorOffset};
      preserveEnd = {node: editSelection.focusNode, offset: editSelection.focusOffset};
    }
    // A caret in a page field (notes/todo.js "+ List item") is not a document selection: leave it.
    const inField = !!document.activeElement?.matches?.('input, textarea, select');
    if (!inField && preserveStart?.node?.isConnected && preserveEnd?.node?.isConnected && !sameSelection(editSelection, preserveStart, preserveEnd)) {
      try { editSelection.setBaseAndExtent(preserveStart.node, preserveStart.offset, preserveEnd.node, preserveEnd.offset); } catch (_) {}
    }
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source' || rapier.compare.active) {
      lastObstacles = []; return;
    }
    // An inline turned raster is never an obstacle but still reserves its growth in flow.
    syncInlineRotatedPictures();
    const wrappers = mountedWrappers();
    holdTail(wrappers);
    if (!moving && !wrappers.some(wrapper => wrapper.querySelector('img[data-rapier-image-layout]'))) {
      lastObstacles = []; ownerBoxes.clear(); positionGrip(); return;
    }
    for (const wrapper of wrappers) if (wrapper.querySelector('img[data-rapier-image-layout]') || wrapper === moving?.image.closest('.block-wrapper'))
      style(wrapper, {'content-visibility': 'visible', contain: 'none'});
    const measured = rows(wrappers);
    const byWrapper = new Map(measured.map(row => [row.wrapper, row])), anchors = new Map(), placed = new Set();
    let free = null;
    for (const row of measured) {
      const active = moving?.image === row.image, layout = active && moving.activated ? moving.layout : row.layout;
      if (active && moving.activated && moving.free) {
        if (row.standalone) hideAnchor(row);
        style(row.image, {position: 'absolute', margin: '0'});
        free = row; continue;
      }
      if (row.editable || !positioned(layout) || !(row.naturalWidth > 0 && row.naturalHeight > 0 && row.imageBounds.width > 0)) continue;
      const owner = active ? moving.owner : wrapOwner(row.wrapper);
      const target = byWrapper.get(owner);
      if (!target?.paragraph || !prose(owner)) continue;
      const values = anchors.get(owner) || [];
      values.push({row, layout, active}); anchors.set(owner, values); placed.add(row);
      style(owner, {'content-visibility': 'visible', contain: 'none'});
      if (row.standalone) hideAnchor(row);
      style(row.image, {position: 'absolute', margin: '0'});
    }
    if (moving?.kind === 'resize' && moving.resized && ![...placed].some(row => row.image === moving.image)) {
      style(moving.image, {display: 'block', width: px(moving.box.width), height: px(moving.box.height), 'max-width': 'none',
        'margin-left': px(moving.box.x - moving.column.left), 'margin-right': '0'});
    }
    ownerBoxes = new Map();
    if (!placed.size && !moving) { lastObstacles = []; positionGrip(); return; }

    const area = rect(host), origin = area.top - host.scrollTop;
    for (const row of measured) {
      row.bounds = rect(row.wrapper); row.top = row.bounds.top - origin; row.height = row.bounds.height;
      row.paragraphBounds = row.paragraph && rect(row.paragraph);
      row.flowingBounds = row.flowing && rect(row.flowing);
    }
    const obstacles = [], pictures = [];
    let shift = 0, preparedCount = 0, lastBottom = 0;
    for (const row of measured) {
      let top = row.top + shift;
      if (placed.has(row) && row.standalone) continue;
      const natural = row.paragraphBounds;
      const owner = prose(row.wrapper) && {wrapper: row.wrapper, left: natural.left - area.left, width: natural.width,
        top: top + natural.top - row.bounds.top, height: natural.height, em: parseFloat(getComputedStyle(row.paragraph).fontSize) || 16};
      if (owner) ownerBoxes.set(row.wrapper, owner);
      const own = anchors.get(row.wrapper) || [];
      if (moving && moving.originalOwnerId !== moving.owner?.dataset.blockId) {
        const order = entry => entry.active ? 1 :
          entry.row.wrapper.compareDocumentPosition(row.wrapper) & Node.DOCUMENT_POSITION_FOLLOWING ? 0 : 2;
        own.sort((a, b) => order(a) - order(b));
      }
      let ownerLed = false;
      for (const {row: source, layout, active} of own) {
        // While rotating, the box takes the live candidate's natural width, not a stale one.
        const defaultWidth = active && moving?.kind === 'rotate' ? source.naturalWidth : source.imageBounds.width;
        const unrotated = geometry.imageBox(owner.width, source.naturalWidth, source.naturalHeight, layout, defaultWidth);
        if (!unrotated) continue;
        // A drawing's imageBox is already turned; only a raster reserves for CSS rotation. The live angle wins during its gesture.
        const rasterRad = !isDrawing(source.image)
          ? (active && moving?.kind === 'rotate' && moving.raster ? moving.baseAngleRad + (moving.angle || 0) : (layout.rotate || 0) * Math.PI / 180)
          : 0;
        // rasterReserved (layout/model.mjs) is the one result for box, <img>, obstacles and grips.
        const fit = geometry.rasterReserved(owner.width, unrotated, rasterRad);
        if (!fit) continue;
        const box = fit.reserved, visualDeltaX = fit.visualDeltaX, visualDeltaY = fit.visualDeltaY;
        const x = owner.left + box.x;
        const ownerTop = owner.top + Math.min(layout.y || 0, owner.height / owner.em) * owner.em;
        let y = ownerTop;
        // F75-6: behind/front are never obstacles.
        if (!outOfFlow(layout)) {
          for (const obstacle of [...obstacles].sort((a, b) => a.y - b.y)) {
            if (obstacle.x < x + box.width + 10 && obstacle.x + obstacle.width > x - 10 &&
                obstacle.y + obstacle.height > y - 10 && obstacle.y < y + box.height + 10)
              y = obstacle.y + obstacle.height + 10;
          }
          // R87N: the first in-flow picture takes its owner down (margin-top on the collapsed wrapper, row top moved by the same lead), as clearTo does in export.
          if (!ownerLed && y > ownerTop + 0.5) {
            const lead = y - ownerTop;
            style(source.wrapper, {'margin-top': px(lead)});
            shift += lead;
            top += lead;
            owner.top += lead;
            ownerBoxes.set(row.wrapper, owner);
          }
          ownerLed = true;
        }
        pictures.push({row: source, x, y, width: box.width, height: box.height, wrap: layout.wrap, ownerWrapper: row.wrapper, ownerTop: owner.top,
          visualX: x + visualDeltaX, visualY: y + visualDeltaY, visualWidth: fit.fit.width, visualHeight: fit.fit.height,
          rotateDeg: rasterRad ? rasterRad * 180 / Math.PI : 0});
        if (!outOfFlow(layout)) {
          const previewRecipe = active && moving?.kind === 'rotate' && !moving.raster ? moving.previewRecipe : null;
          const slices = layout.wrap === 'box'
            ? (rasterRad ? geometry.pictureSlices(geometry.rasterTiltProfile(fit.fit.width, fit.fit.height, rasterRad), x, y, box.width, box.height)
                : boxSlices(source.image, x, y, box.width, box.height, previewRecipe))
            : pictureSlices(source.image, x, y, box.width, box.height, rasterRad);
          for (const slice of slices) obstacles.push({...slice, wrapper: source.wrapper, owner: row.wrapper});
        }
        if (active) {
          moving.column = {left: owner.left, width: owner.width}; moving.ownerGeometry = owner;
          moving.box = {x, y, width: box.width, height: box.height};
        }
      }
      const relevant = obstacles.filter(obstacle => obstacle.y + obstacle.height > top && obstacle.y < top + row.height + 4096);
      if (!relevant.length) { lastBottom = top + row.height; continue; }
      if (row.paragraph) {
        if (row.editable) cache.delete(row.paragraph);
        const record = preparedCount++ < 192 ? prepareParagraph(row.paragraph, row.wrapper) : null;
        const horizontal = natural.left - area.left;
        const paragraphTop = top + natural.top - row.bounds.top;
        const mapped = relevant.map(obstacle => ({...obstacle, x: obstacle.x - horizontal}));
        let height = record ? project(record, natural.width, paragraphTop, mapped) : null;
        if (height == null) height = floatAround(row.paragraph, natural, paragraphTop, mapped);
        if (height != null) {
          style(row.wrapper, {'content-visibility': 'visible', contain: 'none'});
          shift += height - natural.height;
          lastBottom = row.top + shift + row.height;
          continue;
        }
      }
      if (row.flowing && row.flowingBounds) {
        const box = row.flowingBounds, horizontal = box.left - area.left, blockTop = top + box.top - row.bounds.top;
        const height = floatAround(row.flowing, box, blockTop, relevant.map(obstacle => ({...obstacle, x: obstacle.x - horizontal})));
        if (height != null) {
          style(row.wrapper, {'content-visibility': 'visible', contain: 'none'});
          shift += height - box.height;
          lastBottom = row.top + shift + row.height;
          continue;
        }
      }
      const overlap = relevant.filter(obstacle => obstacle.y < top + row.height);
      const push = overlap.length ? Math.max(0, ...overlap.map(obstacle => obstacle.y + obstacle.height - top)) : 0;
      if (push && row.padTarget) { style(row.padTarget, {'padding-top': px(row.paddingTop + push)}); shift += push; }
      lastBottom = row.top + shift + row.height;
    }
    if (preserveStart?.node && preserveEnd?.node) {
      const from = livePoint(null, preserveStart.node, preserveStart.offset) || preserveStart;
      const to = livePoint(null, preserveEnd.node, preserveEnd.offset) || preserveEnd;
      if (from.node?.isConnected && to.node?.isConnected) {
        try {
          if (!sameSelection(editSelection, from, to)) editSelection.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
          caretPlaced = {anchor: from.node, anchorOffset: from.offset, focus: to.node, focusOffset: to.offset};
        } catch (_) {}
      }
    }

    const positions = pictures.map(picture => ({...picture, anchor: rect(moving?.image === picture.row.image && moving.carrier || picture.row.read)}));
    if (free) positions.push({row: free, ...freePreviewBox(moving), anchor: rect(moving.carrier || free.read)});
    for (const {row, x, y, width, height, visualX, visualY, visualWidth, visualHeight, rotateDeg, anchor, wrap} of positions)
      style(row.image, {position: 'absolute', left: px(area.left + (visualX ?? x) - anchor.left), top: px(origin + (visualY ?? y) - anchor.top),
        width: px(visualWidth ?? width), height: px(visualHeight ?? height), 'max-width': 'none', margin: '0',
        // Always 'none' for a drawing.
        transform: rotateDeg ? `rotate(${rotateDeg}deg)` : 'none', 'transform-origin': '50% 50%',
        // behind sinks below in-flow text via negative z-index; front is the default stack.
        'z-index': wrap === 'behind' ? '-1' : moving?.image === row.image ? '4' : '3'});
    lastObstacles = obstacles; lastPictures = pictures;
    const bottom = Math.max(lastBottom, ...obstacles.map(value => value.y + value.height));
    const last = measured.at(-1)?.wrapper;
    const held = holding() ? moving.hold : 0;
    if ((bottom > lastBottom + 1 || held > 0) && last && !nextProse(last)) {
      tail ||= document.createElement('div');
      tail.setAttribute('aria-hidden', 'true'); tail.className = 'rapier-flow-tail';
      tail.style.height = px(Math.max(bottom - lastBottom, held)); last.after(tail);
    }
    positionGrip();
  }

  let pressed = false, pressedLayout = false;
  function schedule() {
    if (pressed && !moving) { pressedLayout = true; return; }
    if (!frame && host) frame = requestAnimationFrame(() => layout());
  }

  function layoutNow(anchorWrapper = null) {
    if (!host) return;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    layout(anchorWrapper);
  }

  function gripsAllowed() {
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    return !record || !sourceOccurrence(record).reason;
  }

  function positionGrip() {
    if (!resizeGrips.length) return;
    // F75-12: Plain has no move, resize or rotate grips.
    const shown = gripsOk && selected?.isConnected && selected.naturalWidth > 0 &&
      !rapier.access.readOnly && !rapier.compare.active && rapier.view.mode !== 'source' && !_rapierPlainLayout();
    if (!shown) {
      for (const button of resizeGrips) button.hidden = true;
      if (moveHandle) moveHandle.hidden = true;
      if (rotateGrip) rotateGrip.hidden = true;
      return;
    }
    const bounds = rect(selected), area = rect(host), toolbar = _rapierImageRuntime.toolbar;
    const bottom = !moving && toolbar && !toolbar.hidden ? Math.min(area.bottom, rect(toolbar).top) : area.bottom;

    const radius = 22, resizing = moving?.kind === 'resize' && moving.resized, rotating = moving?.kind === 'rotate';
    for (const button of resizeGrips) {
      const corner = button.dataset.corner, x = corner.includes('w') ? bounds.left : bounds.right;
      const y = corner.includes('n') ? bounds.top : bounds.bottom;
      button.hidden = rotating || !!resizing && corner !== moving.corner || y < area.top || y + radius > bottom || x < area.left || x > area.right;
      button.style.left = px(x); button.style.top = px(y);
    }
    if (moveHandle) {
      const x = Math.max(bounds.left + 22, bounds.right - 34), y = Math.min(bounds.bottom - 22, bounds.top + 34);
      moveHandle.hidden = rotating || !!resizing || y < area.top || y + radius > bottom || x < area.left || x > area.right;
      moveHandle.style.left = px(x); moveHandle.style.top = px(y);
    }
    if (rotateGrip) {
      const allowed = !resizing;
      if (rotating) {
        // Follows the finger directly while active, matching how the Draw editor's own active
        // handle tracks a touch rather than the (here CSS-tilted) box geometry underneath it.
        const at = moving.pointer != null ? moving.drag : null;
        const x = at ? at.clientX : bounds.left + bounds.width / 2, y = at ? at.clientY : bounds.top - 44;
        rotateGrip.hidden = false; rotateGrip.style.left = px(x); rotateGrip.style.top = px(y);
      } else {
        const x = clamp(bounds.left + bounds.width / 2, area.left + 22, area.right - 22), y = bounds.top - 44;
        rotateGrip.hidden = !allowed || y < area.top || x < area.left || x > area.right;
        rotateGrip.style.left = px(x); rotateGrip.style.top = px(y);
      }
    }
  }

  // F75-6: icon buttons, aria-label carries the word ("Draw is icons"). `around` and `shape` write the same wrap=around.
  // SVG paint order draws the front/behind glyphs; no colour tied to the background.
  const WRAP_PLACEMENTS = [
    {place: 'inline', wrap: null, label: 'Inline, no wrap',
      icon: '<path d="M3 4h18"/><rect x="5" y="8" width="14" height="8" rx="1"/><path d="M3 20h18"/>'},
    {place: 'around', wrap: 'around', label: 'Wrap beside',
      icon: '<rect x="3" y="5" width="8" height="8" rx="1"/><path d="M15 5h6M15 9h6M15 13h6M3 17h18M3 21h18"/>'},
    {place: 'shape', wrap: 'around', label: 'Wrap around shape',
      icon: '<circle cx="7" cy="9" r="5"/><path d="M14 6h7M16 9h5M14 12h7M3 17h18M3 21h18"/>'},
    {place: 'box', wrap: 'box', label: 'Wrap around box',
      icon: '<rect x="2" y="4" width="10" height="10" rx="1"/><path d="M14 6h7M14 9h7M14 12h7M3 17h18M3 21h18"/>'},
    {place: 'behind', wrap: 'behind', label: 'Behind the words',
      icon: '<rect x="7" y="5" width="10" height="8" rx="1" fill="currentColor" fill-opacity=".2"/><path d="M3 8h18M3 12h18M3 16h18"/>'},
    {place: 'front', wrap: 'front', label: 'In front of the words',
      icon: '<path d="M3 8h18M3 12h18M3 16h18"/><rect x="7" y="5" width="10" height="8" rx="1" fill="currentColor" fill-opacity=".2"/>'},
  ];

  function closeWrapRow() {
    if (!wrapRowOpen) return;
    wrapRowOpen = false;
    if (wrapRow) wrapRow.hidden = true;
    _rapierImageRuntime.toolbar?.querySelector('.rapier-image-wrap')?.setAttribute('aria-expanded', 'false');
    // The row is a second storey: tell the toast lift when it opens or closes, or a toast lands on it.
    try { _rapierScheduleToastLift(); } catch (_) {}
  }

  function toggleWrapRow() {
    if (wrapRowOpen) { closeWrapRow(); return; }
    if (!wrapRow) return;
    closeFadeRow();
    wrapRowOpen = true; wrapRow.hidden = false;
    _rapierImageRuntime.toolbar?.querySelector('.rapier-image-wrap')?.setAttribute('aria-expanded', 'true');
    try { _rapierScheduleToastLift(); } catch (_) {}
    updateWrapRow(selected && layoutOf(selected));
  }

  function updateWrapRow(layout) {
    if (!wrapRow) return;
    const current = layout?.wrap || null;
    for (const button of wrapRow.children) {
      const entry = WRAP_PLACEMENTS.find(row => row.place === button.dataset.wrapPlace);
      button.setAttribute('aria-pressed', String(entry.wrap === current));
      button.disabled = rapier.access.readOnly || rapier.compare.active;
    }
  }

  // Transparency (the founder, 27 September 2026): a second storey as placement's is, one slider whose word is a percentage,
  // 0% solid to 95%. The picture fades under the finger; the release writes `opacity=` (100 less the slider), one Undo step.
  const FADE_MAX = 95;
  function closeFadeRow() {
    if (!fadeRowOpen) return;
    fadeRowOpen = false;
    if (fadeRow) fadeRow.hidden = true;
    previewFade(null);
    _rapierImageRuntime.toolbar?.querySelector('.rapier-image-fade')?.setAttribute('aria-expanded', 'false');
    try { _rapierScheduleToastLift(); } catch (_) {}
  }

  function toggleFadeRow() {
    if (fadeRowOpen) { closeFadeRow(); return; }
    if (!fadeRow) return;
    closeWrapRow();
    fadeRowOpen = true; fadeRow.hidden = false;
    _rapierImageRuntime.toolbar?.querySelector('.rapier-image-fade')?.setAttribute('aria-expanded', 'true');
    try { _rapierScheduleToastLift(); } catch (_) {}
    updateFadeRow(selected && layoutOf(selected));
  }

  function updateFadeRow(layout) {
    if (!fadeRow) return;
    const input = fadeRow.querySelector('input');
    input.value = String(100 - (layout?.opacity ?? 100));
    input.disabled = rapier.access.readOnly || rapier.compare.active;
    showFade(input);
  }

  function showFade(input) {
    fadeRow.querySelector('output').textContent = input.value + '%';
    fadeRow.querySelector('.rapier-image-fade-seek').style.setProperty('--seek-frac', String(Number(input.value) / FADE_MAX));
  }

  // Display only while the finger moves; the picture's own opacity comes back unless the release lands.
  let fadePreview = null;
  function previewFade(value) {
    if (fadePreview && (value == null || fadePreview.image !== selected)) { fadePreview.image.style.opacity = fadePreview.opacity; fadePreview = null; }
    if (value == null || !selected) return;
    fadePreview ||= {image: selected, opacity: selected.style.opacity};
    selected.style.opacity = String((100 - value) / 100);
  }

  // The one fade writer: `opacity=` beside every other field, one commitLayout; the row stays with the picture it faded.
  async function setFade(value) {
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    if (!record || _rapierUserMutationBlocked() || !_rapierCommitPendingHistory()) { previewFade(null); return false; }
    const occurrence = sourceOccurrence(record), opacity = 100 - clamp(Math.round(value), 0, FADE_MAX);
    if (occurrence.reason) { previewFade(null); showToast('This picture cannot be faded without altering its source', 'info'); return false; }
    if ((occurrence.layout.opacity ?? 100) === opacity) { previewFade(null); return true; }
    const layout = {...occurrence.layout};
    if (opacity < 100) layout.opacity = opacity; else delete layout.opacity;
    fadeHold = true;
    try {
      const committed = await commitLayout(record, occurrence, layout, 'document.fade-image');
      if (committed) fadePreview = null; else previewFade(null);
      return committed;
    } finally { fadeHold = false; if (fadeRowOpen) updateFadeRow(selected && layoutOf(selected)); }
  }

  function controls() {
    const toolbar = _rapierImageRuntime.toolbar;
    if (!toolbar) return;
    if (moving) toolbar.dataset.moving = 'true'; else delete toolbar.dataset.moving;
    toolbar.inert = !!moving;
    if (moving) { closeWrapRow(); closeFadeRow(); }
    let wrap = toolbar.querySelector('.rapier-image-wrap');
    if (!wrap) {
      wrap = document.createElement('button'); wrap.type = 'button';
      wrap.className = 'rapier-image-tools__btn rapier-image-wrap';
      wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="8" height="8" rx="1"/><path d="M15 5h6M15 9h6M15 13h6M3 17h18M3 21h18"/></svg>';
      wrap.setAttribute('aria-label', 'Picture placement');
      wrap.setAttribute('aria-expanded', 'false');
      wrap.addEventListener('click', event => { event.preventDefault(); if (event.isTrusted) toggleWrapRow(); });
      toolbar.insertBefore(wrap, toolbar.querySelector('[data-image-act="edit"]'));
    }
    if (!wrapRow) {
      wrapRow = document.createElement('div'); wrapRow.className = 'rapier-image-wrap-row'; wrapRow.hidden = true;
      wrapRow.setAttribute('role', 'group'); wrapRow.setAttribute('aria-label', 'picture placement');
      for (const entry of WRAP_PLACEMENTS) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'rapier-image-tools__btn'; button.dataset.wrapPlace = entry.place;
        button.setAttribute('aria-label', entry.label); button.setAttribute('aria-pressed', 'false');
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + entry.icon + '</svg>';
        button.addEventListener('click', event => {
          event.preventDefault();
          if (!event.isTrusted) return;
          if (entry.wrap == null) inline(); else setWrapShape(entry.wrap);
          updateWrapRow(selected && layoutOf(selected));
        });
        wrapRow.append(button);
      }
      toolbar.append(wrapRow);
    }
    let fade = toolbar.querySelector('.rapier-image-fade');
    if (!fade) {
      fade = document.createElement('button'); fade.type = 'button';
      fade.className = 'rapier-image-tools__btn rapier-image-fade';
      fade.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4h4v4h-4zM16 8h4v4h-4zM12 12h4v4h-4zM16 16h4v4h-4z" fill="currentColor" stroke="none"/></svg>';
      fade.setAttribute('aria-label', 'Transparency');
      fade.setAttribute('aria-expanded', 'false');
      fade.addEventListener('click', event => { event.preventDefault(); if (event.isTrusted) toggleFadeRow(); });
      wrap.after(fade);
    }
    if (!fadeRow) {
      fadeRow = document.createElement('div'); fadeRow.className = 'rapier-image-wrap-row rapier-image-fade-row'; fadeRow.hidden = true;
      fadeRow.setAttribute('role', 'group'); fadeRow.setAttribute('aria-label', 'picture transparency');
      fadeRow.innerHTML = '<span class="rapier-image-fade-seek"><input type="range" min="0" max="' + FADE_MAX + '" step="1" value="0" aria-label="Transparency">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg></span><output>0%</output>';
      const input = fadeRow.querySelector('input');
      input.addEventListener('input', event => { showFade(input); if (event.isTrusted) previewFade(Number(input.value)); });
      input.addEventListener('change', event => { if (event.isTrusted) void setFade(Number(input.value)); });
      toolbar.append(fadeRow);
    }
    const layout = selected && layoutOf(selected);
    // F75-12: Plain authors rung 0 only -- no placement row (view, edit, draw, delete, close).
    const plain = _rapierPlainLayout();
    wrap.hidden = plain;
    if (plain) closeWrapRow();
    wrap.setAttribute('aria-pressed', positioned(layout) ? 'true' : 'false');
    wrap.title = 'Placement';
    wrap.disabled = rapier.access.readOnly || rapier.compare.active;
    if (wrapRowOpen) updateWrapRow(layout);
    fade.hidden = plain;
    if (plain) closeFadeRow();
    fade.setAttribute('aria-pressed', layout?.opacity < 100 ? 'true' : 'false');
    fade.title = 'Transparency';
    fade.disabled = rapier.access.readOnly || rapier.compare.active;
    if (fadeRowOpen) updateFadeRow(layout);
  }

  function select(image) {
    if (moving && moving.image !== image) cancel();
    if (selected !== image) { disarm(); closeWrapRow(); if (!fadeHold) closeFadeRow(); selected?.removeAttribute('data-rapier-image-selected'); }
    selected = image;
    selected.setAttribute('data-rapier-image-selected', 'true');
    gripsOk = gripsAllowed();
    if (!resizeGrips.length) {
      for (const [corner, label] of [['nw', 'top left'], ['ne', 'top right'], ['sw', 'bottom left'], ['se', 'bottom right']]) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'rapier-image-grip'; button.dataset.corner = corner;
        button.setAttribute('aria-label', 'Resize image from ' + label);
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
        });
        resizeGrips.push(button);
      }
      document.body.append(...resizeGrips);
    }
    if (!moveHandle) {
      moveHandle = document.createElement('button'); moveHandle.type = 'button';
      moveHandle.className = 'rapier-image-move';
      moveHandle.setAttribute('aria-label', 'Move image'); moveHandle.setAttribute('aria-pressed', 'false');
      moveHandle.title = 'Move';
      moveHandle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
      moveHandle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
      document.body.append(moveHandle);
    }
    if (!rotateGrip) {
      rotateGrip = document.createElement('button'); rotateGrip.type = 'button';
      rotateGrip.className = 'rapier-image-rotate';
      rotateGrip.setAttribute('aria-label', 'Rotate picture');
      rotateGrip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 2.64 6.36"/><path d="M3 21v-6h6"/></svg>';
      rotateGrip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
      document.body.append(rotateGrip);
    }
    controls(); positionGrip();
  }

  function setArmed(value) {
    armed = !!value && !!selected?.isConnected;
    moveHandle?.setAttribute('aria-pressed', armed ? 'true' : 'false');
    if (selected) { if (armed) selected.setAttribute('data-rapier-image-armed', 'true'); else selected.removeAttribute('data-rapier-image-armed'); }
    // No hint toast on arming.
  }
  function disarm() { if (armed) setArmed(false); }

  // Shared preamble for every image gesture: settles pending typing/composition, re-measures the
  // live layout, and locates this picture's own occurrence in the current source. Returns null (and
  // has already shown any relevant toast) when the gesture cannot begin.
  function readyGesture(moveMessage) {
    if (_rapierUserMutationBlocked() || !selected?.isConnected || !selected.naturalWidth ||
        !selected.naturalHeight || !_rapierCommitPendingHistory()) return null;
    layoutNow();
    if (!selected?.isConnected) return null;
    if (hasSelection()) { showToast('clear the text selection to move an image', 'info'); return null; }
    if (selected.closest('.block-edit')) {
      if (!_rapierSettleSelectedImage() || !selected?.isConnected || !selected.naturalWidth) return null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; layout(); }
    }
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    if (!record) return null;
    const occurrence = sourceOccurrence(record);
    if (occurrence.reason) { showToast(moveMessage, 'info'); return null; }
    return {record, occurrence};
  }

  function beginRotate() {
    const ready = readyGesture('This picture cannot be rotated without altering its source');
    if (!ready) return;
    const {record, occurrence} = ready;
    const image = selected;
    // Spelled out for the profile-seams check (docs/build.md, "Build profiles").
    const recipe = isDrawing(image) && typeof _rapierDrawRecipeFromImage === 'function' && _rapierDrawRecipeFromImage(image);
    const bounds = rect(image), area = rect(host);
    endSettle();
    resetRotatePerf();
    const shared = {kind: 'rotate', image, blockId: record.block.id, imageIndex: record.imageIndex, record, occurrence,
      owner: positioned(occurrence.layout) ? wrapOwner(image.closest('.block-wrapper')) : null,
      center: {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2},
      angle: 0, previewProfile: null,
      box: {x: bounds.left - area.left, y: bounds.top - area.top + host.scrollTop, width: bounds.width, height: bounds.height},
      stamp: Object.freeze(_rapierMutationStamp()), source: _rapierSourceText(), pointer: null};
    if (recipe) {
      moving = {...shared,
        baseRecipe: recipe, baseAngleRad: (recipe.angle || 0) * Math.PI / 180, previewRecipe: null,
        // A painting's silhouette read once before the gesture; the preview turns this alpha.
        baseAlpha: recipe.shapes.some(shape => shape.recognized === 'paint' || shape.recognized === 'text') ? geometry.alphaProfile(image) : null,
        baseView: globalThis.RapierDrawCore?._rapierDrawInkView ? globalThis.RapierDrawCore._rapierDrawInkView(recipe) : null,
        pivot: (() => { const corners = globalThis.RapierDrawEdit?.contentTiltBox(recipe); return corners ? [corners.reduce((a, c) => a + c[0], 0) / corners.length, corners.reduce((a, c) => a + c[1], 0) / corners.length] : null; })(),
        // The preview swaps <img> src and natural-size attributes; these restore them on cancel.
        originalSrc: image.src, originalNaturalWidth: image.getAttribute('data-rapier-natural-width'),
        originalNaturalHeight: image.getAttribute('data-rapier-natural-height'), candidateUrl: null, candidateToken: 0,
        // At most one candidate decode in flight; pendingRecipe is the latest, never a queue.
        pendingRecipe: null, candidateBusy: false};
    } else {
      // F75-11: a raster turns via `rotate=`; baseAngleRad composes a second rotate. Its alpha is read once, before any transform.
      moving = {...shared, raster: true, baseAngleRad: (occurrence.layout.rotate || 0) * Math.PI / 180,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, baseAlpha: geometry.alphaProfile(image)};
    }
    _rapierCancelViewRestore();
    image.setAttribute('data-rapier-image-gesture', 'rotate');
    host.setAttribute('data-rapier-image-gesture', 'rotate');
    controls(); notify(); schedule();
  }

  function begin(kind = 'move', corner = 'se') {
    if (kind === 'rotate') { beginRotate(); return; }
    const ready = readyGesture('This image layout cannot be moved without altering its source');
    if (!ready) return;
    const {record, occurrence} = ready;
    if (selected.closest('a') && !occurrence.standalone) { showToast('Move a linked image in its own paragraph', 'info'); return; }

    const image = selected, bounds = rect(image), area = rect(host), wrapper = image.closest('.block-wrapper');
    const read = image.closest('.block-read');
    if (!read) return;
    const computed = getComputedStyle(read), inset = parseFloat(computed.paddingLeft) || 0;
    const column = read.clientWidth - inset - (parseFloat(computed.paddingRight) || 0);
    const columnLeft = rect(read).left + inset - area.left, width = Math.min(bounds.width, column);
    if (width <= 0) return;
    const ownParagraph = !occurrence.standalone && read.children.length === 1 && read.firstElementChild.tagName === 'P' &&
      read.querySelectorAll('img').length === 1 && read.textContent.trim();
    const owner = ownParagraph ? wrapper : lastObstacles.find(row => row.wrapper === wrapper)?.owner || wrapOwner(wrapper);
    const ownerGeometry = positioned(occurrence.layout) ? measureOwner(owner) : null;
    const {align, ...requested} = occurrence.layout;
    // A move keeps the placement it had; an unpositioned picture defaults to Shape.
    if (kind === 'move') requested.wrap = ['box', 'behind', 'front'].includes(occurrence.layout.wrap) ? occurrence.layout.wrap : 'around';

    endSettle();
    moving = {kind, corner, image, blockId: record.block.id, imageIndex: record.imageIndex, record, occurrence, owner,
      originalOwnerId: owner?.dataset.blockId, layout: requested, ownerGeometry, activated: !!ownerGeometry,
      stamp: Object.freeze(_rapierMutationStamp()), source: _rapierSourceText(), pointer: null,
      column: ownerGeometry ? {left: ownerGeometry.left, width: ownerGeometry.width} : {left: columnLeft, width: column},
      box: {x: bounds.left - area.left, y: bounds.top - area.top + host.scrollTop, width,
        height: width * bounds.height / bounds.width}};
    moving.start = {...moving.box};
    moving.screenEdge = (corner.includes('n') ? bounds.bottom : bounds.top) - area.top;
    const wrapperStyle = getComputedStyle(wrapper), wrapperBounds = rect(wrapper);
    moving.hold = Math.ceil(wrapperBounds.height + (parseFloat(wrapperStyle.marginTop) || 0) + (parseFloat(wrapperStyle.marginBottom) || 0));
    _rapierCancelViewRestore();
    image.setAttribute('data-rapier-image-gesture', kind);
    host.setAttribute('data-rapier-image-gesture', kind);
    controls(); notify(); schedule();
  }

  function measureOwner(wrapper = moving?.owner) {
    if (!wrapper) return null;
    _rapierWysiwygWake(wrapper);
    const paragraph = prose(wrapper), known = ownerBoxes.get(wrapper);
    if (!paragraph) return null;

    const bounds = rect(paragraph), area = rect(host);
    return {wrapper, left: known?.left ?? bounds.left - area.left, width: known?.width ?? bounds.width,
      top: known?.top ?? bounds.top - area.top + host.scrollTop, height: known?.height ?? bounds.height,
      em: parseFloat(getComputedStyle(paragraph).fontSize) || 16};
  }

  function activateMove() {
    if (!moving || moving.kind !== 'move' || moving.activated) return;
    moving.activated = true; moving.anchor = moving.image.closest('.block-wrapper');
    if (!moving.occurrence.standalone) {
      observer?.disconnect();
      restore(); observer?.disconnect();
      const marker = document.createComment(''), carrier = document.createElement('span');
      carrier.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0';
      moving.image.before(marker); moving.anchor.append(carrier); carrier.append(moving.image);
      moving.marker = marker; moving.carrier = carrier; cache = new WeakMap();
    }

    const standing = moving.owner === moving.anchor ? moving.owner : ownerAtTop(moving.box.y);
    if (standing) moving.owner = standing;
    const owner = standing ? measureOwner(standing) : null;
    if (owner) {
      moving.ownerGeometry = owner;
      moving.column = {left: owner.left, width: owner.width};
      moving.layout.width ??= Number(clamp(moving.box.width / owner.width * 100, .01, 100).toFixed(2));
      setPosition(moving.box.x, moving.box.y);
    } else { moving.owner = null; setFree(); }
  }

  function ownerAtTop(y, edge = 0) {
    const own = moving?.image.closest('.block-wrapper');
    let found = null;
    for (const [wrapper, box] of ownerBoxes) {
      if (!wrapper.isConnected || wrapper === own) continue;
      if (y >= box.top - edge && y <= box.top + box.height + edge) found = wrapper;
    }
    return found;
  }

  function freeBox(x, y) {
    if (!moving) return;
    const column = moving.column;
    moving.box = {...moving.box, x: clamp(x, column.left, column.left + Math.max(0, column.width - moving.box.width)), y};
    schedule();
  }

  function setFree() {
    if (!moving || moving.free) return;
    moving.free = true; moving.owner = null; moving.ownerGeometry = null;
    moving.layout.width ??= Number(clamp(moving.box.width / moving.column.width * 100, .01, 100).toFixed(2));

    moving.fade?.cancel();
    freeBox(moving.point?.x ?? moving.box.x, moving.point?.y ?? moving.box.y);
  }

  function freeSlot(gesture) {
    const own = gesture.image.closest('.block-wrapper'), area = rect(host), origin = area.top - host.scrollTop;
    const edge = gesture.box.y;
    const wrappers = mountedWrappers().filter(wrapper => wrapper !== own && wrapper.isConnected && !wrapper.hidden &&
      !wrapper.classList.contains('block-wrapper--metadata') && _rapierBoundBlock(wrapper));
    let before = null, after = null;
    for (const wrapper of wrappers) {
      const bounds = rect(wrapper), middle = bounds.top - origin + bounds.height / 2;
      if (edge < middle) { before = wrapper; break; }
      after = wrapper;
    }
    const column = gesture.column, ratio = column.width > 0 ? (gesture.box.x - column.left + gesture.box.width / 2) / column.width : .5;
    const full = gesture.box.width >= column.width - 1;
    const align = full ? null : ratio < 1 / 3 ? null : ratio > 2 / 3 ? 'right' : 'center';

    if (!before && !after) return own ? {own: true, align} : null;
    return {before, after: before ? null : after, align};
  }

  function wrapperInset(wrapper) {
    const inner = wrapper && wrapper.querySelector('.block-read')?.firstElementChild;
    return inner ? rect(inner).top - rect(wrapper).top : 0;
  }

  function gapBelow(wrapper, own) {
    if (!wrapper) return 0;
    const list = mountedWrappers().filter(w => w !== own && w.isConnected && !w.hidden &&
      !w.classList.contains('block-wrapper--metadata') && _rapierBoundBlock(w));
    const i = list.indexOf(wrapper);
    if (i < 0) return 0;
    if (i + 1 < list.length) return rect(list[i + 1]).top - rect(wrapper).bottom;
    if (i > 0) return rect(wrapper).top - rect(list[i - 1]).bottom;
    return 0;
  }

  // Preview the same normal-flow slot finish() commits, including the neighbour's inset and inter-block gap.
  function freePreviewBox(gesture) {
    const box = gesture.box, column = gesture.column, slot = freeSlot(gesture);
    const x = column.width > 0
      ? column.left + (slot?.align === 'right' ? column.width - box.width : slot?.align === 'center' ? (column.width - box.width) / 2 : 0)
      : box.x;
    const area = rect(host), origin = area.top - host.scrollTop;
    const own = gesture.image.closest('.block-wrapper');

    const y = slot?.before ? rect(slot.before).top - origin + wrapperInset(slot.before)
      : slot?.after ? rect(slot.after).bottom - origin + gapBelow(slot.after, own) + wrapperInset(slot.after)
      : box.y;
    return {x, y, width: box.width, height: box.height};
  }

  function freeStep(own, direction) {
    let node = own;
    for (;;) {
      node = node?.[direction > 0 ? 'nextElementSibling' : 'previousElementSibling'];
      if (!node) return null;
      if (node.classList?.contains('block-wrapper') && !node.hidden &&
        !node.classList.contains('block-wrapper--metadata') && _rapierBoundBlock(node)) return node;
    }
  }

  function freeZoneX(zone, column, width) {
    return column.left + (zone === 'right' ? 5 / 6 : zone === 'center' ? .5 : 1 / 6) * column.width - width / 2;
  }

  function releasePointer() {
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = 0; }
    if (!moving) return;
    const pointer = moving.pointer, owner = moving.pointerOwner;
    moving.pointer = null; moving.drag = null; moving.pointerOwner = null;
    try { if (pointer != null) owner?.releasePointerCapture(pointer); } catch (_) {}
  }

  async function remove() {
    if (moving) cancel();
    if (_rapierUserMutationBlocked() || !_rapierCommitPendingHistory()) return false;
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    if (!record) return false;
    const found = sourceOccurrence(record), spans = _rapierExcerptCanonicalBlockSpans(), from = spans.get(record.block.id);
    if (!from) return false;

    const occurrence = found.reason
      ? {start: record.image.start, end: record.image.tokenEnd ?? record.image.end, standalone: false, reason: found.reason}
      : found;
    const source = _rapierSourceText();
    let removeStart = from.start + occurrence.start, removeEnd = from.start + occurrence.end;
    if (occurrence.standalone && !occurrence.reason) {
      const blockIndex = rapier.document.blocks.indexOf(record.block), nextBlock = rapier.document.blocks[blockIndex + 1];
      if (blockIndex > 0) removeStart -= String(record.block.leading ?? '\n\n').length;
      else if (nextBlock && spans.has(nextBlock.id)) removeEnd = spans.get(nextBlock.id).start;
    } else if (source[removeEnd] === ' ' && (removeStart === from.start || source[removeStart - 1] === ' ')) removeEnd++;
    else if (source[removeStart - 1] === ' ' && removeStart - 1 >= from.start) removeStart--;
    if (removeEnd <= removeStart) return false;
    const splices = [{pos: removeStart, removed: source.slice(removeStart, removeEnd), inserted: ''}];
    const wrapper = document.querySelector('#editor-blocks > .block-wrapper[data-block-id="' + record.block.id + '"]');
    let previous = wrapper?.previousElementSibling;
    while (previous && (!previous.classList.contains('block-wrapper') || previous.hidden)) previous = previous.previousElementSibling;
    const area = rect(host);
    const viewport = previous && rect(previous).bottom > area.top && rect(previous).top < area.bottom
      ? _rapierCaptureEditorViewport(previous, true, true) : _rapierCaptureEditorViewport();
    _rapierCloseImageTools();
    return _rapierCommitSourceProjection(splices, 'document.remove-image', null, null, viewport);
  }

  function cancel() {
    if (!moving) return;
    if (rotateFrame) { cancelAnimationFrame(rotateFrame); rotateFrame = 0; }
    if (!moving.committing) _rapierCancelViewRestore();
    const click = !moving.committing && !!moving.drag && !moving.drag.moved;
    releasePointer(); moving.image.removeAttribute('data-rapier-image-gesture');
    moving.image.style.removeProperty('transform');
    host.removeAttribute('data-rapier-image-gesture');

    const image = moving.image, top = click ? rect(image).top - rect(host).top : null;
    const viewport = moving.committing || click ? null
      : _rapierCaptureEditorViewport(moving.activated && moving.image.closest('.block-wrapper') || gestureAnchor(), false, true);
    moving.fade?.cancel();
    restoreRotateImage(moving);
    if (moving.activated) {
      restore(); observer?.disconnect();
      if (moving.carrier) { moving.marker.replaceWith(moving.image); moving.carrier.remove(); }
      cache = new WeakMap();
    }
    moving = null; controls(); notify();
    if (click && image.isConnected) { settleNow(image, top); return; }
    schedule();
    if (viewport) _rapierRestoreEditorViewport(viewport);
  }

  function admitGesture(gesture) {
    _rapierCancelViewRestore(); releasePointer(); gesture.committing = true;
    gesture.image.removeAttribute('data-rapier-image-gesture'); host.removeAttribute('data-rapier-image-gesture');
    gesture.image.style.removeProperty('transform');
    gesture.fade?.cancel();
    return _rapierCaptureEditorViewport(gestureAnchor(gesture), true, true);
  }

  function close() {

    if (!moving?.committing) cancel();
    disarm();
    closeWrapRow();
    if (!fadeHold) closeFadeRow();
    selected?.removeAttribute('data-rapier-image-selected'); selected = null;
    for (const button of resizeGrips) button.hidden = true;
    if (moveHandle) moveHandle.hidden = true;
    if (rotateGrip) rotateGrip.hidden = true;
  }

  function imageLayoutEdit(record, occurrence, value) {
    const source = record.block.raw, marker = metadata.formatLayout(value);
    let start = occurrence.marker?.start ?? occurrence.insert;
    const end = occurrence.marker?.end ?? start;
    if (!marker && occurrence.marker && source[start - 1] === ' ' && start > occurrence.start &&
        !/[ \t\r\n]/.test(source[start - 2] || '')) start--;
    return {start, end, text: marker && !occurrence.marker ? ' ' + marker : marker};
  }

  function imageLayoutEdits(record, occurrence, value) {
    const edits = [imageLayoutEdit(record, occurrence, value)], imported = _rapierImageAltSourceParts(record.image.altSource);
    if (value.width != null && imported.width) edits.push({start: record.image.altStart, end: record.image.altEnd, text: imported.alt});
    return edits.sort((a, b) => b.start - a.start);
  }

  function imageSource(record, occurrence, edits) {
    let source = record.block.raw.slice(occurrence.start, occurrence.end);
    for (const edit of edits) source = source.slice(0, edit.start - occurrence.start) + edit.text + source.slice(edit.end - occurrence.start);
    return source;
  }

  async function commitLayout(record, occurrence, value, operation = 'document.image-layout', viewport = _rapierCaptureEditorViewport(),
    releaseTop = null) {
    const gesture = moving?.committing ? moving : null;
    if (releaseTop == null && selected?.isConnected) releaseTop = rect(selected).top - rect(host).top;
    const span = _rapierExcerptCanonicalBlockSpans().get(record.block.id);
    if (!span) return false;
    const source = record.block.raw;

    let edits, reselectIndex = record.imageIndex, pictureAt = 0;
    if (occurrence.standalone) {
      edits = imageLayoutEdits(record, occurrence, value);
    } else {
      const plan = _rapierPlanImageLayoutChange(record, value);
      if (!plan || plan.refuse) {
        showToast(plan?.refuse === 'link' ? 'Resize a linked image in its own paragraph' : 'Resize an image in its own paragraph', 'info');
        return false;
      }
      edits = plan.edits; reselectIndex = 0; pictureAt = plan.pictureOffset;
    }
    let replacement = source;
    for (const row of edits) replacement = replacement.slice(0, row.start) + row.text + replacement.slice(row.end);
    if (replacement === source) return true;
    const identity = rapier.identity.authority, intent = userIntent;

    const targetPosition = span.start + pictureAt;
    armSettle(releaseTop, targetPosition, reselectIndex);

    let committed = occurrence.standalone
      ? _rapierCommitBlockLayoutInPlace(record.block.id, source, replacement, operation) : false;
    if (committed !== true) committed = await _rapierCommitSourceProjection(edits.map(row => ({
      pos: span.start + row.start, removed: source.slice(row.start, row.end), inserted: row.text,
    })), operation, null, () => userIntent === intent, viewport);
    if (gesture && moving === gesture) cancel();

    if (gesture && moving && moving !== gesture && moving.image === gesture.image) return committed;
    if (committed && identity === rapier.identity.authority && intent === userIntent) {
      const spans = _rapierExcerptCanonicalBlockSpans();
      const block = rapier.document.blocks.find(row => spans.get(row.id)?.start === targetPosition);
      const wrapper = block && document.querySelector('[data-block-id="' + block.id + '"]');
      const image = wrapper?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[reselectIndex];
      if (image) { _rapierSelectImage(block, image); settleNow(image, releaseTop); return committed; }
    }
    endSettle(); schedule();
    return committed;
  }

  // The one place the original bytes go back, exactly once.
  function restoreRotateImage(gesture) {
    if (!gesture?.candidateUrl) return;
    const url = gesture.candidateUrl; gesture.candidateUrl = null;
    if (gesture.image?.isConnected && gesture.image.src === url) {
      gesture.image.src = gesture.originalSrc;
      setOrRemove(gesture.image, 'data-rapier-natural-width', gesture.originalNaturalWidth);
      setOrRemove(gesture.image, 'data-rapier-natural-height', gesture.originalNaturalHeight);
    }
    URL.revokeObjectURL(url); rotatePerf.urlsRevoked++;
  }
  function setOrRemove(element, name, value) {
    if (value == null) element.removeAttribute(name); else element.setAttribute(name, value);
  }

  // Rotation changes only the definition's SVG bytes; replaceImage re-carries the occurrence's layout marker verbatim.
  async function commitRotate(record, gesture, angle, releaseTop, viewport = null) {
    const edit = globalThis.RapierDrawEdit, core = globalThis.RapierDrawCore, assets = globalThis.RapierImageAssets;
    if (!edit || !core || !assets) return false;
    const span = _rapierExcerptCanonicalBlockSpans().get(record.block.id);
    if (!span) return false;
    // Capture identity before the first await: a stale gesture must not pin the viewport or steal the reselect. The rotation still lands.
    const identity = rapier.identity.authority, intent = userIntent;
    const current = () => identity === rapier.identity.authority && intent === userIntent;
    const recipe = edit.rotateDrawing(gesture.baseRecipe, angle);
    // Preview and commit share this candidate; admission only rounds an integer viewport.
    const candidate = rotateCandidate(recipe);
    const svgText = candidate?.svg ?? core._rapierDrawBuildSVG(recipe);
    const currentAlt = _rapierImageAltText(_rapierImageAltSourceParts(record.image.altSource).alt);
    // One finally: restore pre-rotation bytes only when nothing replaced them.
    try {
      const asset = await assets.createAsset(new TextEncoder().encode(svgText), null, {codec: 'image/svg+xml', title: currentAlt || 'drawing'});
      const raw = '![' + _rapierEscapeImageAlt(currentAlt) + '][' + asset.label + ']';
      const normalized = {asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height};
      if (current()) armSettle(releaseTop, span.start, record.imageIndex);
      // Restore to the captured viewport, never a reveal.
      const committed = await globalThis.RapierEmbeddedImages.insert(normalized, raw,
        {replaceImage: {blockId: record.block.id, imageIndex: record.imageIndex}, viewport}, gesture.stamp);
      if (committed && current()) {
        const block = rapier.document.blocks.find(row => row.id === record.block.id);
        const wrapper = block && document.querySelector('[data-block-id="' + block.id + '"]');
        const image = wrapper?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[record.imageIndex];
        if (image) { _rapierSelectImage(block, image); settleNow(image, releaseTop); return committed; }
      }
      endSettle(); schedule();
      return committed;
    } finally { restoreRotateImage(gesture); }
  }

  // Fold into the writer's own domain, `(-180, 180]` degrees.
  function normalizeRotateDeg(deg) {
    let value = ((deg + 180) % 360 + 360) % 360 - 180;
    if (value <= -180) value += 360;
    return value;
  }

  // A raster's rotate is a layout fact: base angle plus the released delta (docs/rotate-rules.md), one commitLayout, one Undo step.
  async function commitRasterRotate(record, gesture, deltaAngleRad, releaseTop, viewport) {
    const absoluteDeg = normalizeRotateDeg(Math.round((gesture.baseAngleRad + deltaAngleRad) * 180 / Math.PI));
    return commitLayout(record, gesture.occurrence, {...gesture.occurrence.layout, rotate: absoluteDeg},
      'document.rotate-image', viewport, releaseTop);
  }

  // The one placement writer (RapierImageFlow.setWrapShape): positioned rewrites wrap in place; inline is given an owner first.
  function setWrapShape(mode) {
    if (_rapierUserMutationBlocked() || !_rapierCommitPendingHistory()) return false;
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    if (!record) return false;
    const occurrence = sourceOccurrence(record);
    if (occurrence.reason) { showToast('This image layout cannot be changed without altering its source', 'info'); return false; }
    if (positioned(occurrence.layout)) {
      if (occurrence.layout.wrap === mode) return false;
      return commitLayout(record, occurrence, {...occurrence.layout, wrap: mode});
    }
    if (!occurrence.standalone) {
      begin();
      if (!moving) return false;
      moving.layout.wrap = mode;
      void finish(true);
      return true;
    }
    if (!wrapOwner(selected?.closest('.block-wrapper'))) {
      // Warn only when no prose paragraph is near: a heading or list can join a wrap but never own it.
      if (!mountedWrappers().some(prose)) showToast('There is no prose nearby to wrap the image against', 'info');
      return false;
    }
    const {align, ...layout} = occurrence.layout;
    if (align) layout.x = {left: 0, center: 50, right: 100}[align];
    const owner = wrapOwner(selected.closest('.block-wrapper')), paragraph = owner && prose(owner);
    if (paragraph && (mode === 'around' || mode === 'box') &&
        rect(paragraph).width - rect(selected).width < narrowestColumn(parseFloat(getComputedStyle(paragraph).fontSize)) + 24)
      showToast('Make the picture smaller to wrap words beside it', 'info');
    return commitLayout(record, occurrence, {...layout, wrap: mode});
  }

  function inline() {
    if (moving && (!_rapierMutationStampIsCurrent(moving.stamp) || moving.source !== _rapierSourceText())) { cancel(); return; }
    if (_rapierUserMutationBlocked() || !_rapierCommitPendingHistory()) { cancel(); return; }
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    cancel();
    if (!record) return;
    const occurrence = sourceOccurrence(record);
    if (occurrence.reason || !positioned(occurrence.layout)) return;
    const {wrap, y, ...layout} = occurrence.layout;
    if (layout.x != null && layout.width == null) {
      const column = selected?.closest('p'), width = column && rect(column).width;
      if (width > 0) layout.width = Number(clamp(rect(selected).width / width * 100, .01, 100).toFixed(4));
      else delete layout.x;
    }
    void commitLayout(record, occurrence, layout);
  }

  // R86e: a gesture on a changed document re-bases when its picture's occurrence is intact; only a gone picture goes back, and says so.
  // `thorough` (release) compares the text; a frame reads only the stamp.
  function rebaseGesture(gesture, thorough = false) {
    if (!gesture || gesture.committing) return false;
    if (_rapierMutationStampIsCurrent(gesture.stamp) && (!thorough || gesture.source === _rapierSourceText())) return true;
    const record = _rapierImageRecord(gesture.blockId, gesture.imageIndex);
    const intact = !!record && record.image.source === gesture.record.image.source &&
      (!gesture.owner || (gesture.owner.isConnected && !!_rapierBoundBlock(gesture.owner)));
    if (intact) { gesture.stamp = Object.freeze(_rapierMutationStamp()); gesture.source = _rapierSourceText(); gesture.record = record; return true; }
    cancel();
    showToast('The document changed while the picture was held, so it went back where it was. Move it again.', 'info');
    return false;
  }

  async function finish(force = false) {
    const gesture = moving;
    if (!gesture || gesture.committing) return false;
    if (_rapierUserMutationBlocked()) { cancel(); showToast('The document is still finishing an edit, so the picture went back where it was. Move it again.', 'info'); return false; }
    if (!rebaseGesture(gesture, true)) return false;
    if (force) activateMove();
    // Resolve the final live layout synchronously before measuring the landing slot and release position.
    if (frame) { cancelAnimationFrame(frame); frame = 0; layout(); }
    if (moving !== gesture) return false;
    const sourceRecord = _rapierImageRecord(gesture.blockId, gesture.imageIndex);
    const spans = _rapierExcerptCanonicalBlockSpans(), from = sourceRecord && spans.get(sourceRecord.block.id);
    if (!from || sourceRecord.image.source !== gesture.record.image.source) { cancel(); showToast('The picture\'s own block changed while it was held, so it went back where it was. Move it again.', 'info'); return false; }
    const occurrence = sourceOccurrence(sourceRecord);
    if (occurrence.reason || occurrence.source !== gesture.occurrence.source) {
      cancel(); showToast('The picture\'s own line changed while it was held, so it went back where it was. Move it again.', 'info'); return false;
    }
    if (gesture.kind === 'resize') {
      if (Math.abs(gesture.box.width - gesture.start.width) <= .5) { cancel(); return true; }
      const releaseTop = rect(gesture.image).top - rect(host).top, viewport = admitGesture(gesture);
      try { return await commitLayout(sourceRecord, occurrence, gesture.layout, 'document.resize-image', viewport, releaseTop); }
      finally { if (moving === gesture) cancel(); }
    }
    if (gesture.kind === 'rotate') {
      const angle = releaseRotateAngle(gesture, gesture.angle || 0);
      if (!angle) { cancel(); return true; }
      const releaseTop = rect(gesture.image).top - rect(host).top, viewport = admitGesture(gesture);
      try {
        return gesture.raster ? await commitRasterRotate(sourceRecord, gesture, angle, releaseTop, viewport)
          : await commitRotate(sourceRecord, gesture, angle, releaseTop, viewport);
      } finally { if (moving === gesture) cancel(); }
    }
    const sameOwner = !gesture.free && gesture.owner?.dataset.blockId === gesture.originalOwnerId;
    const changed = gesture.free || !sameOwner || Math.abs(gesture.box.x - gesture.start.x) > .5 || Math.abs(gesture.box.y - gesture.start.y) > .5;
    if (!force && (!gesture.activated || !changed)) { cancel(); return true; }
    const slot = gesture.free ? freeSlot(gesture) : null;

    const ownSlot = !!(gesture.free && slot?.own && occurrence.standalone);

    const startSlot = gesture.free && !ownSlot ? freeSlot({...gesture, box: gesture.start}) : null;
    const samePlacement = !!(startSlot && slot && slot.before === startSlot.before && slot.after === startSlot.after && occurrence.standalone);

    const toWrapper = gesture.free ? slot?.before : gesture.owner;
    const toId = toWrapper ? Number(toWrapper.dataset.blockId) : null;
    const to = toWrapper ? spans.get(toId) : null;
    const afterWrapper = gesture.free && !to ? slot?.after : null;
    const afterId = afterWrapper ? Number(afterWrapper.dataset.blockId) : null;
    const after = afterWrapper ? spans.get(afterId) : null;
    if (!to && !after && !ownSlot) { cancel(); return false; }
    // Carry the gesture's placement through the commit.
    const value = gesture.free ? {} : {wrap: ['box', 'behind', 'front'].includes(gesture.layout.wrap) ? gesture.layout.wrap : 'around', x: gesture.layout.x ?? occurrence.layout.x ?? 0, y: gesture.layout.y || 0};
    if (gesture.free && slot.align) value.align = slot.align;
    if (gesture.free) { if (occurrence.layout.width != null) value.width = occurrence.layout.width; }
    else if (gesture.layout.width != null) value.width = gesture.layout.width;
    // F75-11: carry `rotate` through a move, and the fade with it.
    if (gesture.layout.rotate) value.rotate = gesture.layout.rotate;
    if (gesture.layout.opacity < 100) value.opacity = gesture.layout.opacity;
    const edits = imageLayoutEdits(sourceRecord, occurrence, value);
    let splices, nextPosition = from.start, nextIndex = sourceRecord.imageIndex;

    let layoutReplacement = null, blockRanges = null;
    if (ownSlot || samePlacement || (occurrence.standalone && sameOwner)) {
      splices = edits.map(edit => ({pos: from.start + edit.start,
        removed: sourceRecord.block.raw.slice(edit.start, edit.end), inserted: edit.text}));
      layoutReplacement = sourceRecord.block.raw;
      for (const edit of edits.slice().sort((a, b) => b.start - a.start))
        layoutReplacement = layoutReplacement.slice(0, edit.start) + edit.text + layoutReplacement.slice(edit.end);
    } else {
      let removeStart = from.start + occurrence.start, removeEnd = from.start + occurrence.end;
      const sourceBlock = sourceRecord.block, blockIndex = rapier.document.blocks.indexOf(sourceBlock);
      const nextBlock = rapier.document.blocks[blockIndex + 1];
      if (occurrence.standalone) {
        if (blockIndex > 0) removeStart -= String(sourceBlock.leading ?? '\n\n').length;
        else if (nextBlock && spans.has(nextBlock.id)) removeEnd = spans.get(nextBlock.id).start;
      }
      const replacement = imageSource(sourceRecord, occurrence, edits), eol = rapier.document.sourceNewline || '\n';
      const insertAt = to ? to.start : after.end, inserted = to ? replacement + eol + eol : eol + eol + replacement;
      splices = [{pos: removeStart, removed: gesture.source.slice(removeStart, removeEnd), inserted: ''},
        {pos: insertAt, removed: '', inserted}].sort((a, b) => b.pos - a.pos);
      const shift = removeStart < insertAt ? removeEnd - removeStart : 0;
      nextPosition = (to ? insertAt : insertAt + eol.length * 2) - shift; nextIndex = 0;

      let sourceRange = null;
      if (!occurrence.standalone) {
        const raw = sourceBlock.raw.slice(0, occurrence.start) + sourceBlock.raw.slice(occurrence.end);
        sourceRange = {startIndex: blockIndex, blocksBefore: [{id: sourceBlock.id, raw: sourceBlock.raw,
            type: sourceBlock.type, order: sourceBlock.order, leading: sourceBlock.leading}],
          blocksAfter: [{id: sourceBlock.id, raw, type: sourceBlock.type, order: sourceBlock.order, leading: sourceBlock.leading}]};
      } else if (blockIndex > 0) {
        sourceRange = {startIndex: blockIndex, blocksBefore: [{id: sourceBlock.id, raw: sourceBlock.raw,
            type: sourceBlock.type, order: sourceBlock.order, leading: sourceBlock.leading}], blocksAfter: []};
      } else if (nextBlock) {
        sourceRange = {startIndex: 0, blocksBefore: [{id: sourceBlock.id, raw: sourceBlock.raw,
            type: sourceBlock.type, order: sourceBlock.order, leading: sourceBlock.leading},
            {id: nextBlock.id, raw: nextBlock.raw, type: nextBlock.type, order: nextBlock.order, leading: nextBlock.leading}],
          blocksAfter: [{id: nextBlock.id, raw: nextBlock.raw, type: nextBlock.type, order: nextBlock.order, leading: null}]};
      }

      let destRange = null;
      if (to && toId != null) {
        const toBlock = rapier.document.blocks.find(row => row.id === toId);
        const toIndex = toBlock ? rapier.document.blocks.indexOf(toBlock) : -1;
        if (toBlock && toIndex > -1) destRange = {startIndex: toIndex, blocksBefore: [{id: toBlock.id, raw: toBlock.raw,
            type: toBlock.type, order: toBlock.order, leading: toBlock.leading}],
          blocksAfter: [{id: _nextBlockId(), raw: replacement, leading: toBlock.leading},
            {id: toBlock.id, raw: toBlock.raw, type: toBlock.type, order: toBlock.order, leading: eol + eol}]};
      } else if (after && afterId != null) {
        const afterBlock = rapier.document.blocks.find(row => row.id === afterId);
        const afterIndex = afterBlock ? rapier.document.blocks.indexOf(afterBlock) : -1;
        if (afterBlock && afterIndex > -1) destRange = {startIndex: afterIndex + 1, blocksBefore: [],
          blocksAfter: [{id: _nextBlockId(), raw: replacement, leading: eol + eol}]};
      }
      if (sourceRange && destRange) blockRanges = [sourceRange, destRange];
    }
    if (splices.every(edit => edit.removed === edit.inserted)) { cancel(); return true; }
    let candidate = gesture.source;
    for (const edit of splices) candidate = candidate.slice(0, edit.pos) + edit.inserted + candidate.slice(edit.pos + edit.removed.length);
    if (candidate === gesture.source) { cancel(); return true; }
    const intent = userIntent, identity = rapier.identity.authority;
    const releaseTop = rect(gesture.image).top - rect(host).top, viewport = admitGesture(gesture);
    armSettle(releaseTop, nextPosition, nextIndex);
    let committed = layoutReplacement !== null
      ? _rapierCommitBlockLayoutInPlace(sourceRecord.block.id, sourceRecord.block.raw, layoutReplacement, 'document.move-image')
      : blockRanges ? _rapierCommitRangesInPlace(blockRanges, splices, 'document.move-image', Array.from(new Set(
          blockRanges.flatMap(range => range.blocksBefore.concat(range.blocksAfter).map(row => row.id))))) : false;
    if (committed !== true) {
      try { committed = await _rapierCommitSourceProjection(splices, 'document.move-image', null, () => userIntent === intent, viewport); }
      finally { if (moving === gesture) cancel(); }
    } else if (moving === gesture) cancel();

    if (moving && moving.image === gesture.image) return committed;
    let landed = null;
    if (committed && userIntent === intent && rapier.identity.authority === identity) {
      const nextSpans = _rapierExcerptCanonicalBlockSpans();
      const block = rapier.document.blocks.find(row => nextSpans.get(row.id)?.start === nextPosition);
      const wrapper = block && document.querySelector('[data-block-id="' + block.id + '"]');
      const image = wrapper?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[nextIndex];
      if (image) { _rapierSelectImage(block, image); landed = image; } else _rapierCloseImageTools();
    }
    watch(); notify();
    if (landed) settleNow(landed, releaseTop); else { endSettle(); schedule(); }
    return committed;
  }

  if (!host || !geometry || !metadata) return Object.freeze({schedule() {}, close() {}, select() {}, restore() {},
    restoreSelection() {}, invalidate() {}, sourcePoint() {}, mappedPoint: (node, offset) => ({node, offset}),
    textOffset: () => undefined, activation: (_wrapper, value) => value, heldWrappers: () => [], setWrapShape() { return false; },
    status: () => ({moving: false, projections: 0, images: 0})});
  const sheet = document.createElement('style');
  sheet.textContent = `
    .rapier-flow-line{position:absolute;display:block;white-space:pre;line-height:inherit}
    img[data-rapier-image-selected]{outline:1px solid var(--color-accent);outline-offset:2px;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;cursor:move;-webkit-touch-callout:none}
    img[data-rapier-image-gesture]{cursor:grabbing;touch-action:none}
    #editor-blocks[data-rapier-image-gesture]{overflow-anchor:none;overscroll-behavior:contain}
    .rapier-image-grip{position:fixed;z-index:151;width:44px;height:44px;transform:translate(-50%,-50%);padding:0;border:0;border-radius:0;background:transparent;color:var(--color-accent);display:grid;place-items:center;cursor:nwse-resize;touch-action:none;-webkit-tap-highlight-color:transparent}
    .rapier-image-grip::after{content:'';width:9px;height:9px;border:1px solid currentColor;background:var(--color-bg)}
    .rapier-image-grip[data-corner="ne"],.rapier-image-grip[data-corner="sw"]{cursor:nesw-resize}
    .rapier-flow-float{pointer-events:none;user-select:none;-webkit-user-select:none}
    .rapier-image-grip[hidden]{display:none}
    .rapier-image-move{position:fixed;z-index:152;width:44px;height:44px;transform:translate(-50%,-50%);padding:0;border:0;border-radius:0;background:transparent;color:var(--color-accent);display:grid;place-items:center;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent}
    .rapier-image-move::before{content:'';grid-area:1/1;width:32px;height:32px;border-radius:50%;background:var(--color-bg);border:1px solid currentColor}
    .rapier-image-move svg{grid-area:1/1;width:18px;height:18px;position:relative}
    .rapier-image-move[aria-pressed="true"]{color:var(--color-accent-foreground,#fff)}
    .rapier-image-move[aria-pressed="true"]::before{background:var(--color-accent);border-color:var(--color-accent)}
    .rapier-image-move[hidden]{display:none}
    .rapier-image-move:focus-visible{outline:none}.rapier-image-move:focus-visible::before{outline:2px solid currentColor;outline-offset:2px}
    .rapier-image-rotate{position:fixed;z-index:152;width:44px;height:44px;transform:translate(-50%,-50%);padding:0;border:0;border-radius:0;background:transparent;color:var(--color-accent);display:grid;place-items:center;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent}
    .rapier-image-rotate::before{content:'';grid-area:1/1;width:32px;height:32px;border-radius:50%;background:var(--color-bg);border:1px solid currentColor}
    .rapier-image-rotate svg{grid-area:1/1;width:18px;height:18px;position:relative}
    .rapier-image-rotate[hidden]{display:none}
    .rapier-image-rotate:focus-visible{outline:none}.rapier-image-rotate:focus-visible::before{outline:2px solid currentColor;outline-offset:2px}
    img[data-rapier-image-selected][data-rapier-image-armed]{outline:2px dashed var(--color-accent);outline-offset:2px}
    body:has(.link-dialog__overlay,dialog[open]) .rapier-image-grip,body:has(.link-dialog__overlay,dialog[open]) .rapier-image-move,body:has(.link-dialog__overlay,dialog[open]) .rapier-image-rotate{visibility:hidden}
    .rapier-image-grip:focus-visible{outline:none}.rapier-image-grip:focus-visible::after{outline:2px solid currentColor;outline-offset:3px}
    .rapier-image-tools[data-moving]{visibility:hidden;pointer-events:none}
    .rapier-image-wrap[aria-pressed="true"]{color:var(--color-accent)}
    /* F75-6: the placement row sits directly on top of the bar (its bottom edge is the bar's own
       top edge -- \`bottom:100%\` inside the bar's own fixed containing block), same background,
       same button grid (it reuses .rapier-image-tools__btn). The current placement reads as a
       filled, inverted pill, same law as .rapier-draw-btn--mode[aria-pressed="true"]. */
    .rapier-image-wrap-row{position:absolute;left:0;right:0;bottom:100%;display:flex;align-items:stretch;justify-content:center;background:var(--format-toolbar-bg)}
    .rapier-image-wrap-row[hidden]{display:none}
    .rapier-image-wrap-row .rapier-image-tools__btn[aria-pressed="true"]{background:var(--color-icon);color:var(--color-bg)}
    .rapier-image-fade[aria-pressed="true"]{color:var(--color-accent)}
    /* Transparency's storey: Draw's seek (a line, the ring the finger holds) and the size control's word. */
    .rapier-image-fade-seek{position:relative;flex:1 1 auto;min-width:0;max-width:420px;height:56px;margin-left:6px;--seek-frac:0;--seek:calc(22px + (100% - 44px) * var(--seek-frac))}
    .rapier-image-fade-seek::before,.rapier-image-fade-seek::after{content:'';position:absolute;top:50%;height:2px;transform:translateY(-50%);pointer-events:none}
    .rapier-image-fade-seek::before{left:0;width:max(0px,calc(var(--seek) - 14px));background:var(--color-text)}
    .rapier-image-fade-seek::after{left:min(100%,calc(var(--seek) + 14px));right:0;background:color-mix(in srgb,var(--color-text) 28%,transparent)}
    .rapier-image-fade-seek svg{position:absolute;left:var(--seek);top:50%;width:32px;height:32px;transform:translate(-50%,-50%);fill:none;stroke:var(--color-text);stroke-width:1.5;pointer-events:none}
    .rapier-image-fade-seek input:active+svg{fill:var(--color-text)}
    .rapier-image-fade-seek input{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;touch-action:none}
    .rapier-image-fade-seek input::-webkit-slider-runnable-track{height:100%;background:transparent}
    .rapier-image-fade-seek input::-webkit-slider-thumb{-webkit-appearance:none;width:44px;height:56px;border:0;background:transparent}
    .rapier-image-fade-seek input::-moz-range-track{height:100%;background:transparent;border:0}
    .rapier-image-fade-seek input::-moz-range-thumb{width:44px;height:56px;border:0;background:transparent}
    .rapier-image-fade-seek input:focus-visible{outline:0}
    .rapier-image-fade-row output{min-width:56px;display:inline-flex;align-items:center;justify-content:center;font:var(--fw-medium) var(--text-xs)/1 var(--font-mono);letter-spacing:var(--track-caps);color:var(--color-text)}
    @media(prefers-reduced-motion:reduce){.rapier-image-tools{animation:none}}
    @media print{.rapier-image-grip,.rapier-image-move,.rapier-image-rotate,.rapier-image-tools{display:none!important}}
    /* Transparency made the drawing's bar eleven controls (the founder, 27 September 2026): 10 x 56 + 72 = 632 px, so
       each step below keeps every control on the glass at the widths it names, the new one as wide as its neighbours. */
    @media(max-width:640px){.rapier-image-tools__btn{min-width:44px;padding-inline:10px}.rapier-image-tools__size{min-width:56px}}
    /* F75-5: at phone width the un-narrowed bar overflows past 360px (nine buttons at 44px plus
       the size control) and clips its own leftmost button. Narrower still, uniform with the row
       above so its six icon buttons share the same grid. */
    @media(max-width:496px){.rapier-image-tools__btn{min-width:36px;padding-inline:6px}.rapier-image-tools__size{min-width:46px}}
    /* 10 x 33 + 44 = 374 px on a 390 px phone, down to 375; the 20 px icon sits centred in 33. */
    @media(max-width:405px){.rapier-image-tools__btn{min-width:33px;padding-inline:4px}.rapier-image-tools__size{min-width:44px}}
    /* R86g law 9 made the drawing's bar ten buttons (the download icon), Transparency eleven: 10 x 31 + 42 = 352 px on a
       360 px phone, and the 20 px icon still sits centred in 31 (picture-toolbar-fits-phone). */
    @media(max-width:374px){.rapier-image-tools__btn{min-width:31px;padding-inline:4px}.rapier-image-tools__size{min-width:42px}}
  `;
  document.head.append(sheet);
  observer = new MutationObserver(records => {
    if (restoring) return;
    if (records.every(record => record.type === 'characterData' && record.target.parentElement?.closest('.block-edit'))) return;
    schedule();
  });
  watch();

  new ResizeObserver(() => {
    const width = host.clientWidth, height = host.clientHeight;
    if (width !== lastWidth || height !== lastHeight) {
      if (lastWidth && width !== lastWidth && moving) { cancel(); showToast('The page changed width while the picture was held, so it went back where it was. Move it again.', 'info'); }
      lastWidth = width; lastHeight = height; schedule();
    }
  }).observe(host);
  const invalidate = () => { cache = new WeakMap(); schedule(); };
  new MutationObserver(invalidate).observe(document.body, {attributes: true, attributeFilter: ['class', 'style']});
  new MutationObserver(invalidate).observe(document.documentElement, {attributes: true, attributeFilter: ['style']});
  document.fonts?.addEventListener('loadingdone', invalidate);
  host.addEventListener('load', event => { if (event.target?.tagName === 'IMG') schedule(); }, true);
  host.addEventListener('scroll', () => {
    positionGrip();
    if (moving) schedule();
  }, {passive: true});
  host.addEventListener('pointerdown', event => {
    if (event.isTrusted && event.isPrimary !== false) pressed = true;
  }, {capture: true, passive: true});
  for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, () => {
    if (!pressed) return;
    pressed = false;
    if (pressedLayout) { pressedLayout = false; schedule(); }
  }, {capture: true, passive: true});

  document.addEventListener('selectionchange', () => {
    if (hasSelection()) return;
    const selection = window.getSelection();
    if (caretPlaced && selection?.anchorNode === caretPlaced.anchor && selection.anchorOffset === caretPlaced.anchorOffset &&
        selection.focusNode === caretPlaced.focus && selection.focusOffset === caretPlaced.focusOffset) return;
    schedule();
  });
  document.addEventListener('compositionend', schedule);
  for (const name of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(name, event => {
    if (event.isTrusted) userIntent++;
  }, {capture: true, passive: true});
  // F75-6: other taps close the row without preventDefault or stopPropagation.
  document.addEventListener('pointerdown', event => {
    if (!wrapRowOpen && !fadeRowOpen || !event.isTrusted) return;
    const toolbar = _rapierImageRuntime.toolbar, inside = toolbar?.contains(event.target);
    if (!(inside && (toolbar.querySelector('.rapier-image-wrap')?.contains(event.target) || wrapRow?.contains(event.target)))) closeWrapRow();
    if (!(inside && (toolbar.querySelector('.rapier-image-fade')?.contains(event.target) || fadeRow?.contains(event.target)))) closeFadeRow();
  }, {capture: true, passive: true});
  function setPosition(x, y) {
    const owner = moving?.ownerGeometry || measureOwner();
    if (!moving || !owner?.width) return;
    moving.ownerGeometry = owner;
    moving.layout.x = Number(clamp((x - owner.left + moving.box.width / 2) / owner.width * 100, 0, 100).toFixed(2));
    // R86y: up to the picture's height above the first line; the block above does not reflow.
    moving.layout.y = Number((clamp(y - owner.top, -moving.box.height, owner.height) / owner.em).toFixed(3));
    const box = geometry.imageBox(owner.width, Number(moving.image.dataset.rapierNaturalWidth) || moving.image.naturalWidth,
      Number(moving.image.dataset.rapierNaturalHeight) || moving.image.naturalHeight,
      moving.layout, moving.box.width);
    if (box) moving.box = {x: owner.left + box.x, y: owner.top + moving.layout.y * owner.em, width: box.width, height: box.height};
    schedule();
  }

  function handoffTarget() {
    const drag = moving?.drag;
    if (!drag?.moved || moving.kind !== 'move' || !moving.point) return undefined;
    const edge = Math.min(Math.max(drag.contact / 2 + 4, 8), 18);
    if (moving.owner) {
      const box = ownerBoxes.get(moving.owner);
      if (box && moving.point.y >= box.top - edge && moving.point.y <= box.top + box.height + edge) return moving.owner;
    }
    const target = ownerAtTop(moving.point.y);
    if (target) _rapierWysiwygWake(target);
    return target;
  }

  function switchOwner(owner) {
    if (!moving || !owner || owner === moving.owner) return;
    moving.owner = owner; moving.free = false; moving.ownerGeometry = measureOwner(owner);
    if (!moving.ownerGeometry) { moving.owner = null; setFree(); return; }
    moving.column = {left: moving.ownerGeometry.left, width: moving.ownerGeometry.width};
    moving.layout.width = Number(clamp(moving.box.width / moving.column.width * 100, .01, 100).toFixed(2));

    moving.fade?.cancel();
    const drag = moving.drag;
    const area = rect(host);
    setPosition(drag ? drag.clientX - area.left - drag.offsetX : moving.box.x,
      drag ? drag.clientY - area.top + host.scrollTop - drag.offsetY : moving.ownerGeometry.top);
  }

  function considerHandoff() {
    const target = handoffTarget();
    if (target === undefined || !moving || target === (moving.owner || null)) return;
    if (target) switchOwner(target); else setFree();
  }

  function pinResize() {
    if (!moving?.resized || moving.ownerGeometry) { positionGrip(); return; }
    const bounds = rect(moving.image), edge = moving.corner.includes('n') ? bounds.bottom : bounds.top;
    const delta = edge - rect(host).top - moving.screenEdge;
    if (Math.abs(delta) > .5) {
      _rapierCancelViewRestore(); _rapierNoteViewportWrite(); host.scrollTop += delta;
    }
    positionGrip();
  }

  function resizeTo(width) {
    if (!moving || moving.kind !== 'resize' || moving.committing) return;
    const start = moving.start, west = moving.corner.includes('w'), north = moving.corner.includes('n');
    const owner = positioned(moving.layout) && moving.owner ? measureOwner() : null;
    moving.ownerGeometry = owner;
    if (owner) moving.column = {left: owner.left, width: owner.width};
    const column = moving.column;
    let room = west ? start.x + start.width - column.left : column.left + column.width - start.x;
    if (owner && north) room = Math.min(room, (start.y + start.height - owner.top) * start.width / start.height);
    width = Math.max(.01, Math.min(room, clamp(width, Math.min(32, start.width), column.width)));
    const percent = Number((width / column.width * 100).toFixed(4));
    moving.resized = true;
    if (!(percent > 0) || percent === moving.layout.width) { positionGrip(); return; }
    moving.layout.width = percent;
    moving.box.width = column.width * percent / 100;
    moving.box.height = moving.box.width * start.height / start.width;
    const x = west ? start.x + start.width - moving.box.width : start.x;
    if (owner) setPosition(x, north ? start.y + start.height - moving.box.height : start.y);
    else {
      moving.box.x = x;
      moving.layout.x = Number(clamp((x - column.left + moving.box.width / 2) / column.width * 100, 0, 100).toFixed(4));
      schedule();
    }
    positionGrip();
  }

  // Magnet on the ABSOLUTE angle (start plus delta), returned as a delta.
  function liveRotateAngle() {
    const drag = moving.drag, cx = moving.center.x, cy = moving.center.y;
    const originAngle = Math.atan2(drag.y - cy, drag.x - cx);
    let angle = Math.atan2(drag.clientY - cy, drag.clientX - cx) - originAngle;
    const absolute = moving.baseAngleRad + angle;
    const nearest15 = Math.round(absolute / ROTATE_STEP) * ROTATE_STEP;
    if (Math.abs(absolute - nearest15) < ROTATE_MAGNET_RAD) angle = nearest15 - moving.baseAngleRad;
    return angle;
  }

  // Release half: right-angle gravity, then whole degrees. Takes the live angle: the pointer is gone by `finish`.
  function releaseRotateAngle(gesture, angle) {
    const start = gesture.baseAngleRad, right = Math.PI / 2, nearest90 = Math.round((start + angle) / right) * right;
    if (Math.abs(start + angle - nearest90) < ROTATE_GRAVITY_RAD) angle = nearest90 - start;
    return Math.round((start + angle) * 180 / Math.PI) * Math.PI / 180 - start;
  }

  // Geometry every frame (core._rapierDrawInkView, no serialization); the decoded candidate refreshes at bounded cadence, one in flight.
  // The base alpha is unrotated per 48x48 cell into the candidate view (Astra I03).
  function rotatedAlpha(gesture, view, angle) {
    const base = gesture.baseAlpha, from = gesture.baseView, pivot = gesture.pivot;
    if (!base || !from || !pivot || !view || !(view.w > 0) || !(view.h > 0) || !(from.w > 0) || !(from.h > 0)) return null;
    const grid = 48, cs = Math.cos(-angle), sn = Math.sin(-angle), bands = [];
    for (let i = 0; i < grid; i++) {
      const runs = [];
      let start = -1;
      for (let j = 0; j <= grid; j++) {
        let occupied = false;
        if (j < grid) {
          const px = view.x + (j + .5) / grid * view.w, py = view.y + (i + .5) / grid * view.h;
          const dx = px - pivot[0], dy = py - pivot[1];
          const qx = pivot[0] + dx * cs - dy * sn, qy = pivot[1] + dx * sn + dy * cs;
          const nx = (qx - from.x) / from.w, ny = (qy - from.y) / from.h;
          if (nx >= 0 && nx < 1 && ny >= 0 && ny < 1) occupied = (base.runsAt(ny) || []).some(([a, b]) => nx >= a && nx < b);
        }
        if (occupied) { if (start < 0) start = j; }
        else if (start >= 0) { runs.push([start / grid, j / grid]); start = -1; }
      }
      bands.push(runs);
    }
    return geometry.bandsProfile ? geometry.bandsProfile(bands) : null;
  }

  function rotatePreview() {
    if (!moving || moving.kind !== 'rotate' || moving.committing) return;
    const gesture = moving;
    const angle = liveRotateAngle();
    gesture.angle = angle;
    if (gesture.raster) {
      // No bytes to turn: layout reads moving.angle; this only turns the captured alpha for the obstacle.
      const total = gesture.baseAngleRad + angle;
      gesture.previewProfile = geometry.rotatedRasterAlpha(gesture.baseAlpha, gesture.naturalWidth, gesture.naturalHeight, total);
      schedule();
      return;
    }
    const edit = globalThis.RapierDrawEdit, core = globalThis.RapierDrawCore;
    const recipe = edit ? edit.rotateDrawing(gesture.baseRecipe, angle) : gesture.baseRecipe;
    gesture.previewRecipe = recipe;
    const view = core?._rapierDrawInkView ? core._rapierDrawInkView(recipe) : null;
    gesture.previewProfile = view && typeof _rapierDrawShapeProfileFor === 'function' ? _rapierDrawShapeProfileFor({...recipe, view}, rotatedAlpha(gesture, view, angle)) : null;
    if (view) {
      gesture.image.setAttribute('data-rapier-natural-width', view.w);
      gesture.image.setAttribute('data-rapier-natural-height', view.h);
    }
    schedule();
    refreshRotateCandidate(gesture, recipe);
  }

  // One recompute per animation frame; listeners only set moving.drag.
  function scheduleRotatePreview() {
    if (rotateFrame) return;
    rotateFrame = requestAnimationFrame(() => { rotateFrame = 0; rotatePreview(); });
  }

  // Never a second serialize+decode in flight; superseded recipes are dropped before the writer.
  function refreshRotateCandidate(gesture, recipe) {
    gesture.pendingRecipe = recipe;
    if (!gesture.candidateBusy) drainRotateCandidate(gesture);
  }

  function drainRotateCandidate(gesture) {
    const recipe = gesture.pendingRecipe;
    gesture.pendingRecipe = null;
    if (!recipe || moving !== gesture || gesture.committing) return;
    const candidate = rotateCandidate(recipe);
    if (!candidate) return;
    gesture.candidateBusy = true;
    adoptRotateCandidate(gesture, candidate.svg, candidate.view, () => {
      gesture.candidateBusy = false;
      drainRotateCandidate(gesture);
    });
  }

  // Decode before adopting; candidateToken orders frames. src and natural size move together. onSettled always runs; every object URL revoked once.
  function adoptRotateCandidate(gesture, svg, view, onSettled) {
    // Presented for the paper (inkForPaper); the commit writes the candidate's bytes.
    const shown = globalThis.RapierEmbeddedImages?.inkForPaper ? globalThis.RapierEmbeddedImages.inkForPaper(svg) : svg;
    const url = URL.createObjectURL(new Blob([shown], {type: 'image/svg+xml'}));
    rotatePerf.urlsCreated++;
    const token = ++gesture.candidateToken;
    const probe = new Image();
    rotatePerf.decodesStarted++; rotatePerf.inFlight++;
    rotatePerf.maxInFlight = Math.max(rotatePerf.maxInFlight, rotatePerf.inFlight);
    const settled = () => { rotatePerf.inFlight--; onSettled(); };
    probe.onload = () => {
      if (moving === gesture && gesture.candidateToken === token && !gesture.committing) {
        if (gesture.candidateUrl) { URL.revokeObjectURL(gesture.candidateUrl); rotatePerf.urlsRevoked++; }
        gesture.candidateUrl = url;
        gesture.image.src = url;
        gesture.image.setAttribute('data-rapier-natural-width', view.w);
        gesture.image.setAttribute('data-rapier-natural-height', view.h);
        schedule();
      } else { URL.revokeObjectURL(url); rotatePerf.urlsRevoked++; }
      settled();
    };
    probe.onerror = () => { URL.revokeObjectURL(url); rotatePerf.urlsRevoked++; settled(); };
    probe.src = url;
  }

  function updatePointerBox() {
    if (!moving?.drag || !moving.drag.moved) return;
    if (!rebaseGesture(moving)) return;
    if (moving.kind === 'rotate') { scheduleRotatePreview(); return; }
    const drag = moving.drag, dx = drag.clientX - drag.x;
    const dy = drag.clientY - drag.y + (moving.kind === 'resize' && !moving.ownerGeometry ? 0 : host.scrollTop - drag.scroll);
    if (moving.kind === 'resize') {
      const horizontalWidth = dx * (moving.corner.includes('w') ? -1 : 1);
      const verticalWidth = dy * moving.start.width / moving.start.height * (moving.corner.includes('n') ? -1 : 1);
      resizeTo(drag.width + (Math.abs(horizontalWidth) >= Math.abs(verticalWidth) ? horizontalWidth : verticalWidth));
    } else {
      activateMove();
      const area = rect(host);
      moving.point = {x: drag.clientX - area.left - drag.offsetX, y: drag.clientY - area.top + host.scrollTop - drag.offsetY};
      if (moving.free) freeBox(moving.point.x, moving.point.y);
      else { moving.ownerGeometry = measureOwner(); setPosition(moving.point.x, moving.point.y); }
      considerHandoff();
    }
  }

  function autoScroll(timestamp) {
    dragFrame = 0;
    const drag = moving?.drag;
    if (!drag?.moved || moving.kind !== 'move') return;
    const bounds = rect(host), bottom = bounds.bottom;
    const edge = Math.min(64, Math.max(24, (bottom - bounds.top) / 4));
    const elapsed = drag.scrollTime == null ? 16 : clamp(timestamp - drag.scrollTime, 1, 32);
    drag.scrollTime = timestamp;
    const speed = drag.clientY < bounds.top + edge ? -clamp((bounds.top + edge - drag.clientY) / edge, 0, 1) * .75 * elapsed :
      drag.clientY > bottom - edge ? clamp((drag.clientY - bottom + edge) / edge, 0, 1) * .75 * elapsed : 0;
    const before = host.scrollTop;
    if (speed) { _rapierCancelViewRestore(); host.scrollTop += speed; }
    if (host.scrollTop !== before) {
      updatePointerBox();
      dragFrame = requestAnimationFrame(autoScroll);
    }
  }

  // R84: 500 ms, Android's long press. A vertical drag releases only while this timer is pending, and 260 ms caught ordinary scrolls.
  // Draw's RAPIER_DRAW_HOLD_MS stays 260: its surface is touch-action none. Do not unify; re-run picture-hold-not-pause.
  const HOLD_TO_MOVE = 500, HOLD_SLOP = 8;
  // Coarse pointer threshold after the hold (touch-rules.md T6/T9): 4px is a mouse's.
  const DRAG_MOVED_PX = 4, DRAG_MOVED_TOUCH_PX = 8;
  let hold = null;
  function clearHold() {
    if (!hold) return;
    clearTimeout(hold.timer); hold = null;
  }
  // #358: a hold inside a behind picture's box takes the picture as a tap on a bare picture would.
  function takeBehind(held, event) {
    const image = held.behind;
    if (!image.isConnected || moving) return;
    const wrapper = image.closest('.block-wrapper'), block = wrapper && _rapierBoundBlock(wrapper);
    if (!block) return;
    const live = window.getSelection && window.getSelection();
    if (live && !live.isCollapsed) { try { live.removeAllRanges(); } catch (_) {} }
    if (_activeBlockEditContext()) _leaveAllEditingBlocks();
    if (!_rapierSelectImage(block, image) || selected !== image) return;
    startGesture(event, 'move', null, {x: held.x, y: held.y, held: true});
  }
  function startGesture(event, kind, handle, at = null) {
    cancel(); begin(kind, handle?.dataset.corner);
    if (!moving) { pointerClick = event.pointerId; return; }
    const owner = handle || host;
    const bounds = rect(moving.image), x = at?.x ?? event.clientX, y = at?.y ?? event.clientY;
    moving.pointer = event.pointerId; moving.pointerOwner = owner; moving.pointerType = event.pointerType;
    moving.drag = {x, y, clientX: x, clientY: y,
      left: moving.box.x, top: moving.box.y, width: moving.box.width, scroll: host.scrollTop,
      offsetX: x - bounds.left, offsetY: y - bounds.top,
      contact: Number(event.height) || 1, moved: false};
    try { owner.setPointerCapture(event.pointerId); } catch (_) { cancel(); return; }
    if (at?.held) { try { navigator.vibrate?.(12); } catch (_) {} }
    notify();
  }
  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.isPrimary === false || (event.button !== 0 && event.pointerType === 'mouse')) return;
    pointerClick = null; clearHold();
    if (moving?.pointer != null || moving?.committing) return;
    if (rotateGrip && !rotateGrip.hidden && event.target?.closest?.('.rapier-image-rotate') === rotateGrip) {
      if (!selected?.isConnected) return;
      event.preventDefault(); event.stopImmediatePropagation();
      startGesture(event, 'rotate', rotateGrip);
      return;
    }
    const handle = event.target?.closest?.('.rapier-image-grip');
    if (moveHandle && event.target?.closest?.('.rapier-image-move') === moveHandle) {
      if (!selected?.isConnected) return;
      event.preventDefault(); event.stopImmediatePropagation();

      if (event.pointerType !== 'touch' && document.activeElement !== host && document.activeElement !== selected) host.focus({preventScroll: true});

      hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: 0, mouse: true, handle: true};
      return;
    }
    // #358: hold takes a behind picture through the words; a tap stays a tap. Same 500 ms.
    if (!handle && event.target !== selected && !event.target?.closest?.('[data-rapier-markdown-image], .rapier-image-tools, .rapier-image-wrap-row')) {
      const behind = behindPictureAt(event.clientX, event.clientY);
      if (behind) {
        hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, behind, timer: setTimeout(() => {
          if (!hold || hold.pointerId !== event.pointerId) return;
          const held = hold; hold = null;
          takeBehind(held, event);
        }, HOLD_TO_MOVE)};
        return;
      }
    }
    // A tap on a drawing in a note opens Draw (notes.js _rapierNotesDrawTap); a hold takes it; the click after is swallowed.
    const drawing = !handle && event.target !== selected && typeof _rapierNotesDrawsAt === 'function' ? event.target?.closest?.('[data-rapier-markdown-image]') : null;
    if (drawing && _rapierNotesDrawsAt(drawing)) {
      hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, behind: drawing, timer: setTimeout(() => {
        if (!hold || hold.pointerId !== event.pointerId) return;
        const held = hold; hold = null;
        takeBehind(held, event);
      }, HOLD_TO_MOVE)};
      return;
    }
    if (!resizeGrips.includes(handle) && event.target !== selected) return;
    const kind = handle ? 'resize' : 'move';
    if (event.target === selected && event.pointerType !== 'touch' && document.activeElement !== host && document.activeElement !== selected)
      host.focus({preventScroll: true});
    if (kind === 'move' && event.pointerType === 'touch' && armed) {

      event.preventDefault(); event.stopImmediatePropagation();
      setArmed(false);
      startGesture(event, 'move', null, {x: event.clientX, y: event.clientY, held: true});
      return;
    }
    if (kind === 'move' && event.pointerType === 'touch') {
      hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(() => {
        if (!hold || hold.pointerId !== event.pointerId) return;
        const held = hold; hold = null;
        startGesture(event, 'move', null, {x: held.x, y: held.y, held: true});
      }, HOLD_TO_MOVE)};
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (kind === 'move') {

      hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: 0, mouse: true};
      return;
    }
    startGesture(event, kind, handle);
  }, {capture: true, passive: false});
  document.addEventListener('pointermove', event => {
    if (hold && event.pointerId === hold.pointerId && event.isTrusted) {
      const dx = event.clientX - hold.x, dy = event.clientY - hold.y;
      if (Math.hypot(dx, dy) <= HOLD_SLOP) return;
      const held = hold; clearHold();
      if (held.behind) return;
      if (!held.mouse && Math.abs(dx) <= Math.abs(dy)) return;
      startGesture(event, 'move', null, {x: held.x, y: held.y});
    }
    if (!moving?.drag || event.pointerId !== moving.pointer || !event.isTrusted) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const drag = moving.drag;
    drag.clientX = event.clientX; drag.clientY = event.clientY;
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > (event.pointerType === 'touch' ? DRAG_MOVED_TOUCH_PX : DRAG_MOVED_PX);
    updatePointerBox();
    if (!dragFrame && drag.moved) dragFrame = requestAnimationFrame(autoScroll);
  }, {capture: true, passive: false});

  document.addEventListener('touchmove', event => {
    if (!moving?.drag || moving.pointerType !== 'touch') return;
    if (event.cancelable) event.preventDefault();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0], drag = moving.drag;
    if (touch.clientX === drag.clientX && touch.clientY === drag.clientY) return;
    drag.clientX = touch.clientX; drag.clientY = touch.clientY;
    drag.moved ||= Math.hypot(touch.clientX - drag.x, touch.clientY - drag.y) > DRAG_MOVED_TOUCH_PX;
    updatePointerBox();
    if (!dragFrame && drag.moved) dragFrame = requestAnimationFrame(autoScroll);
  }, {capture: true, passive: false});
  document.addEventListener('contextmenu', event => {
    if (moving || hold || (selected && event.target === selected)) event.preventDefault();
  }, true);
  // While a behind hold is armed, or a gesture holds a picture, the browser's own long press must
  // not start a text selection under it (#358).
  document.addEventListener('selectstart', event => {
    if (hold?.behind || moving?.pointer != null) event.preventDefault();
  }, true);
  document.addEventListener('pointerup', event => {
    if (hold?.pointerId === event.pointerId) {
      const held = hold; clearHold();
      if (held.handle && event.isTrusted) setArmed(!armed);
    }
    if (moving?.pointer !== event.pointerId || !event.isTrusted) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (moving.drag?.moved) {
      moving.drag.clientX = event.clientX; moving.drag.clientY = event.clientY; updatePointerBox();
      // Flush the pending preview frame before releasePointer() clears the drag state.
      if (moving.kind === 'rotate' && rotateFrame) { cancelAnimationFrame(rotateFrame); rotateFrame = 0; rotatePreview(); }
    }
    const commit = moving?.drag?.moved;
    const target = commit ? handoffTarget() : undefined;
    if (target) switchOwner(target); else if (target === null) setFree();
    pointerClick = event.pointerId;
    if (commit) { releasePointer(); void finish(); } else cancel();
  }, true);
  document.addEventListener('click', event => {
    if (pointerClick == null || !event.isTrusted || !event.detail) return;
    pointerClick = null; event.preventDefault(); event.stopImmediatePropagation();
  }, true);

  for (const name of ['pointercancel', 'lostpointercapture']) document.addEventListener(name, event => {
    if (hold?.pointerId === event.pointerId) clearHold();
    if (moving?.pointer !== event.pointerId) return;
    if (name === 'lostpointercapture' && event.target !== moving.pointerOwner) return;
    // The browser took the touch (a scroll or a system gesture it decided was its own). Never
    // silent: a picture that goes back says why (R86e).
    const moved = !!moving.drag?.moved;
    cancel();
    if (moved) showToast('The browser took over that touch, so the picture went back where it was. Hold it and move it again.', 'info');
  }, true);
  host.addEventListener('dragstart', event => {
    if (event.target === selected) event.preventDefault();
  });
  function commitKeyboard() {
    if (!moving?.keyboard) return;
    const target = document.activeElement, intent = userIntent;
    void finish().then(committed => {
      if (!committed || intent !== userIntent || !selected?.isConnected ||
          document.activeElement !== document.body && document.activeElement !== target) return;
      (resizeGrips.includes(target) ? target : selected).focus({preventScroll: true});
    });
  }
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || !selected || moving?.committing) return;
    const handle = event.target?.closest?.('.rapier-image-grip');
    const erase = (event.key === 'Backspace' || event.key === 'Delete') && !moving;

    if (!handle && (event.target === document.body || event.target?.closest?.('.rapier-image-tools'))) {
      if (event.key !== 'Escape' && !erase) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (erase) void remove(); else _rapierCloseImageTools();
      return;
    }

    const fromHost = event.target === host && !_activeBlockEditContext();
    const fromMover = !!moveHandle && event.target === moveHandle;
    if (!resizeGrips.includes(handle) && event.target !== selected && !fromHost && !fromMover && !moving?.keyboard) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      _rapierCloseImageTools(); return;
    }
    if (fromMover && (event.key === 'Enter' || event.key === ' ') && !moving) {
      event.preventDefault(); event.stopImmediatePropagation();
      setArmed(!armed); return;
    }
    if (erase && (resizeGrips.includes(handle) || fromMover)) {
      event.preventDefault(); event.stopImmediatePropagation();
      void remove(); return;
    }
    if (event.key === 'Tab') { commitKeyboard(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!moving) { begin(handle ? 'resize' : 'move', handle?.dataset.corner); if (moving) moving.keyboard = true; }
    if (!moving?.keyboard) return;
    const step = event.shiftKey ? 24 : 6;
    if (moving.kind === 'resize') {
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const reverse = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? moving.corner.includes('w') : moving.corner.includes('n');
      resizeTo(moving.box.width + step * direction * (reverse ? -1 : 1));
      return;
    }
    activateMove();

    if (moving.free && moving.occurrence.standalone) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const target = freeStep(moving.anchor, event.key === 'ArrowDown' ? 1 : -1);
        if (target) {
          const area = rect(host), bounds = rect(target);
          freeBox(moving.box.x, event.key === 'ArrowDown' ? bounds.bottom - area.top + host.scrollTop : bounds.top - area.top + host.scrollTop);
        }
        return;
      }
      const column = moving.column;
      if (column.width > 0 && moving.box.width < column.width - 1) {
        const ratio = (moving.box.x - column.left + moving.box.width / 2) / column.width;
        const zone = ratio < 1 / 3 ? 'left' : ratio > 2 / 3 ? 'right' : 'center', order = ['left', 'center', 'right'];
        const at = order.indexOf(zone), to = order[event.key === 'ArrowRight' ? Math.min(at + 1, 2) : Math.max(at - 1, 0)];
        if (to !== zone) freeBox(freeZoneX(to, column, moving.box.width), moving.box.y);
      }
      return;
    }
    moving.ownerGeometry = measureOwner();
    if (!moving.ownerGeometry) { switchOwner(nextProse(moving.image.closest('.block-wrapper'), event.key === 'ArrowUp' ? -1 : 1)); return; }
    const x = moving.box.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0);
    const y = moving.box.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    const owner = moving.ownerGeometry;
    if (event.key === 'ArrowUp' && y < owner.top - .5) switchOwner(nextProse(moving.owner, -1));
    else if (event.key === 'ArrowDown' && y > owner.top + owner.height + .5) switchOwner(nextProse(moving.owner));
    else setPosition(x, y);
  }, true);
  document.addEventListener('keyup', event => {
    if (!event.isTrusted || !moving?.keyboard || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); commitKeyboard();
  }, true);
  for (const name of ['copy', 'cut']) document.addEventListener(name, event => {
    if (!_rapierClipboardOutsideDocument(event) && hasSelection() && projections.size) restoreSelection();
  }, true);
  let reprojectAfterInput = null;
  window.addEventListener('beforeinput', event => {
    reprojectAfterInput = null;
    if (_rapierHostNativeField(event.target)) return;
    const composing = event.isComposing || event.inputType === 'insertCompositionText' || rapier.composition.block;
    if (event.isTrusted && !composing && hasSelection() && projections.size) { restoreSelection(); return; }

    if (!event.isTrusted || !projections.size || composing) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const node = selection.anchorNode;
    const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const paragraph = element?.closest?.('[data-rapier-flow="true"]');
    const record = paragraph && projections.get(paragraph);
    if (!record || !record.wrapper.classList.contains('block-wrapper--editing')) return;
    reprojectAfterInput = unproject(record.wrapper) ? record.wrapper : null;
  }, true);

  window.addEventListener('input', event => {
    if (!reprojectAfterInput) return;
    const wrapper = reprojectAfterInput; reprojectAfterInput = null;
    if (!_rapierHostNativeField(event.target) && !rapier.composition.block) layoutNow(wrapper);
  }, true);

  window.addEventListener('compositionend', event => {
    if (_rapierHostNativeField(event.target) || !projections.size) return;
    const selection = window.getSelection();
    const text = selection?.rangeCount ? selection.anchorNode : null;
    if (!text || text.nodeType !== Node.TEXT_NODE) return;
    const mapping = endpoints.get(text);
    const record = mapping?.record;
    if (!mapping || !record || record.paragraph?.dataset.rapierFlow !== 'true' ||
        !record.wrapper.classList.contains('block-wrapper--editing')) return;
    mirrorComposedText(record, text, mapping);
  });
  window.addEventListener('keydown', event => {
    if (event.isTrusted && !event.isComposing && !_rapierHostNativeField(event.target) && !moving && hasSelection() && projections.size &&
        ['Backspace', 'Delete', 'Enter'].includes(event.key)) restoreSelection();
  }, true);
  window.addEventListener('beforeprint', () => { printing = true; restoreSelection(); close(); });
  window.addEventListener('afterprint', () => { printing = false; schedule(); });
  window.addEventListener('blur', cancel);
  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  schedule();
  return Object.freeze({schedule, layoutNow, select, close, activation, restoreSelection, restore, heldWrappers, mappedPoint, sourcePoint, textOffset, invalidate, pinSettled,
    remove, armSettle, settleNow, unproject, editSource, livePoint, setWrapShape, splitPlan, behindPictureAt,
    status: () => ({moving: !!moving && !moving.committing, committing: !!moving?.committing, settling: !!settle || !!moving?.committing || performance.now() - settledAt < 400, projections: projections.size, images: lastObstacles.length, rotatePerf: {...rotatePerf}})});
})();
globalThis.RapierImageFlow = _rapierImageFlow;
