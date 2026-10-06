const _rapierImageFlow = (() => {
  'use strict';
  const geometry = globalThis.RapierImageLayout, pretext = globalThis.RapierPretext;
  const metadata = globalThis.RapierMarkdownLayout;
  const rotateGlyph = '<path d="M3 12a9 9 0 1 1 2.64 6.36"/><path d="M3 21v-6h6"/>';
  const host = document.getElementById('editor-blocks');
  const projections = new Map(), ownedStyles = new Map(), endpoints = new WeakMap(), floats = new Map(), floatsRight = new Map();
  let cache = new WeakMap(), sourceCache = new WeakMap(), shapeProfiles = new WeakMap();
  let frame = 0, dragFrame = 0, rotateFrame = 0, observer, selected = null, moving = null, tail, settle = null, settledAt = -1e9, settledImage = null, gripsOk = true;
  const resizeGrips = [];
  let dialogWatch = null;
  let pointerClick = null;
  // Rotate-drag counters for picture-rotate-perf, via status().rotatePerf; reset per gesture.
  const rotatePerf = {writer: 0, urlsCreated: 0, urlsRevoked: 0, decodesStarted: 0, inFlight: 0, maxInFlight: 0};
  function resetRotatePerf() { rotatePerf.writer = rotatePerf.urlsCreated = rotatePerf.urlsRevoked = rotatePerf.decodesStarted = rotatePerf.inFlight = rotatePerf.maxInFlight = 0; }

  let moveHandle = null, rotateGrip = null, wrapRow = null, wrapRowOpen = false, fadeRow = null, fadeRowOpen = false, fadeHold = false, armed = false;
  // A box of a drawing edited where it stands: the field over the box and what it holds.
  let fieldOpen = null;
  // Draw's touch-rotate rules (draw/draw.js): live 15deg magnet, right-angle gravity at release.
  const MOVE_REST_MS = 150, ROTATE_REST_MS = 150, ROTATE_STEP = Math.PI / 12, ROTATE_MAGNET_RAD = 4 * Math.PI / 180, ROTATE_GRAVITY_RAD = 5 * Math.PI / 180;
  let lastWidth = 0, lastHeight = 0, restoring = false, printing = false, lastObstacles = [], userIntent = 0, caretPlaced = null;
  let ownerBoxes = new Map(), lastPictures = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrapped = layout => layout?.wrap === 'around' || layout?.wrap === 'box';
  // behind/front leave the flow. `positioned` = has anchored x/y; `wrapped` = text reflows around it.
  const outOfFlow = layout => layout?.wrap === 'behind' || layout?.wrap === 'front';
  // A behind picture paints at z-index -1: no pointer lands on it. The engine takes it from a gap; this file's hold takes it through the words (#358).
  // `hold`: the 500 ms hold asks, and a locked picture answers it (a hold takes it, to unlock it); a tap never takes a locked one.
  function behindPictureAt(x, y, hold = false) {
    if (!host || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (const image of host.querySelectorAll('.block-read img[data-rapier-markdown-image]')) {
      const holder = image.closest('[data-md-layout]');
      const held = holder && metadata?.parseLayoutAttribute?.(holder.getAttribute('data-md-layout'));
      if (!held || (held.lock === 'on' ? !hold : held.wrap !== 'behind')) continue;
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
      attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-section-hidden', 'data-folded',
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
        // The projection is a view, never the content: a browser edit inside it is read back by difference and the original nodes restored.
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

  // Split rule: splitting a wrapped picture's paragraph never moves the picture; it stays with the half its top is in, `y` restated.
  // `place`: 'keep', 'before' or 'between' for _splitBlockAtCaret. `range` is the caret.
  function splitPlan(wrapper, range) {
    const paragraph = prose(wrapper);
    if (paragraph?.tagName !== 'P') return null;
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

  function projectedPoint(paragraph, node, offset, surface = paragraph) {
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
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
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
    if (!hasFlow(wrapper)) return false;
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
    if (!hasFlow(wrapper)) return null;
    const surface = wrapper.querySelector(':scope > .block-edit');
    if (surface?.children.length !== 1) return null;
    const root = surface.firstElementChild, clone = root.cloneNode(true);
    const nodes = [root, ...root.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
    const generated = new Set([...floats.values(), ...floatsRight.values()]);
    // Serialization sees authored nodes/styles, never the live wrapping furniture. A clone
    // keeps the checkbox state and disclosure body without disturbing a caret or composition.
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index], copy = copies[index], record = projections.get(node);
      if (generated.has(node)) { copy.remove(); continue; }
      if (record && node.dataset.rapierFlow === 'true') {
        // A composition-end waiter can checkpoint before the window's reflow listener.
        // Collect final mapped text here so that checkpoint never marks old originals fresh.
        if (!rapier.composition.block) settleComposition(node, record);
        copy.replaceChildren(...record.original.map(child => child.cloneNode(true)));
        delete copy.dataset.rapierFlow;
      }
      for (const [name, state] of ownedStyles.get(node) || []) {
        if (node.style.getPropertyValue(name) !== state.applied) continue;
        if (state.value) copy.style.setProperty(name, state.value, state.priority);
        else copy.style.removeProperty(name);
      }
    }
    return clone;
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
  function spliceComposedRun(mapping, newText, insertion = null) {
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
    // A native insert has an exact event range and bytes. Do not rediscover its position
    // from repeated letters in the rendered fragment; composition alone needs the diff.
    if (insertion) {
      if (oldText.slice(0, insertion.offset) + insertion.text + oldText.slice(insertion.offset) !== newText) return null;
      prefix = insertion.offset; suffix = oldText.length - prefix;
    }
    const removedStart = prefix, removedEnd = oldText.length - suffix;
    const insertedText = insertion ? insertion.text : newText.slice(prefix, newText.length - suffix);
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

  // A composed word lands with the paragraph's own lines first, as a typed letter does (replan): the whole pass
  // when the paragraph's height moved since the composition began, or when that height is not known. The frame
  // that this compositionend's own schedule left for the whole pass is cancelled once the landing is done (it
  // would lay the same lines again, measured at 42 ms a word at CPU 4); a frame another cause left stands.
  function mirrorComposedText(record, text, mapping, previousHeight = null) {
    spliceComposedRun(mapping, text.data ?? '');
    const pending = frame, own = composeFrame;
    composeFrame = 0;
    // A word changes the same source runs as a native letter. Keep its original nodes
    // detached and publish their new lines directly while the surrounding geometry stands.
    const local = !window.__rapierWholeProjection && (!pending || pending === own) &&
      !pressedLayout && !moving && !restoring && !printing && reflowProjected(record);
    if (!local && !(Number.isFinite(previousHeight) && replan(record.wrapper, previousHeight))) { frame = pending; layoutNow(record.wrapper); return; }
    if (pending && own === pending) cancelAnimationFrame(pending);
    else if (pending && !frame) frame = pending;
    if (local && frame === own) frame = 0;
  }

  function activation(wrapper, value) {
    if (!hasFlow(wrapper)) return value;
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
      // A chip and a source token wear a box that each piece of them repeats. Only the token is one unit; a chip breaks as the browser
      // breaks inline code (at a space, after a hyphen, and inside itself where it is wider than its slot), never leaving a column empty.
      const boxed = parents.some(parent => parent.tagName === 'CODE' || parent.hasAttribute('data-rapier-source'));
      const unit = parents.some(parent => parent.hasAttribute('data-rapier-source'));
      const extraWidth = boxed ? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
        .reduce((width, key) => width + (parseFloat(computed[key]) || 0), 0) : 0;
      const directions = parents.map(parent => parent.getAttribute('dir') === 'auto' ? getComputedStyle(parent).direction : null);
      runs.push({node, parents, directions});
      items.push({text: softbreak ? ' ' : node.data, font, letterSpacing, break: unit && !softbreak ? 'never' : 'normal', extraWidth});
    }
    if (!runs.length) return null;
    const flow = pretext.prepareRichInline(items);
    for (let index = 0; index < runs.length; index++) {
      const item = items[index];
      runs[index].prepared = geometry.prepareRun(item.text, item.font, item.letterSpacing, flow.items[index]?.prepared);
      if (!runs[index].prepared) return null;
    }
    const computed = getComputedStyle(paragraph);

    if (computed.textAlign === 'justify' || computed.writingMode !== 'horizontal-tb' || computed.textTransform !== 'none') return null;
    const fontSize = parseFloat(computed.fontSize) || 16;
    const record = {wrapper, paragraph, runs, items, flow,
      original: [...paragraph.childNodes], raw: _rapierBoundBlock(wrapper)?.raw, fontSize,
      lineHeight: parseFloat(computed.lineHeight) || fontSize * 1.65,
      direction: computed.direction, align: computed.textAlign, balance: computed.textWrapStyle === 'balance' ? fontSize : 0};
    cache.set(paragraph, record);
    return record;
  }

  // The writer and native-retention comparison consume the same text, attributes and source maps.
  // Comparison only collects replacements; a later mismatch must leave every live endpoint alone.
  function projectedText(body, mapping, current, updates) {
    if (updates) {
      if (current?.nodeType !== Node.TEXT_NODE || current.data !== body) return null;
      updates.push([current, mapping]);
      return current;
    }
    const text = document.createTextNode(body);
    endpoints.set(text, mapping);
    return text;
  }

  function projectedSpan(attributes, current, updates) {
    if (updates) {
      if (current?.nodeType !== Node.ELEMENT_NODE || current.tagName !== 'SPAN' || current.localName !== 'span' ||
          current.namespaceURI !== 'http://www.w3.org/1999/xhtml' || current.prefix !== null ||
          current.attributes.length !== attributes.length) return null;
      for (const [name, value] of attributes) {
        const attribute = current.getAttributeNode(name);
        if (!attribute || attribute.namespaceURI !== null || attribute.prefix !== null ||
            attribute.localName !== name || attribute.value !== value) return null;
      }
      return current;
    }
    const element = document.createElement('span');
    for (const [name, value] of attributes) element.setAttribute(name, value);
    return element;
  }

  function fragmentNode(record, fragment, current = null, updates = null) {
    const run = record.runs[fragment.itemIndex];
    if (updates && run.parents.length) return null;
    const mapped = geometry.mapFragment(run.prepared, fragment);
    if (!mapped) return null;
    // A line ends on the white space it broke at. A chip, a link or a highlight must not paint that space, so it stands after the shell.
    const kept = run.parents.length ? mapped.text.replace(/[ \t\n\r\f]+$/, '') : mapped.text;
    const split = kept && kept.length < mapped.text.length;
    const body = split ? kept : mapped.text;
    const text = projectedText(body,
      {node: run.node, offsets: split ? mapped.offsets.slice(0, body.length + 1) : mapped.offsets, parents: run.parents, record, text: body},
      current, updates);
    if (!text) return null;
    let child = text;
    for (let index = run.parents.length - 1; index >= 0; index--) {
      const shell = run.parents[index].cloneNode(false);
      shell.removeAttribute('id');
      if (run.directions[index]) shell.setAttribute('dir', run.directions[index]);
      shell.append(child); child = shell;
    }
    if (!split) return child;
    const restText = mapped.text.slice(body.length), pair = document.createDocumentFragment();
    const rest = projectedText(restText,
      {node: run.node, offsets: mapped.offsets.slice(body.length), parents: run.parents, record, text: restText});
    pair.append(child, rest);
    return pair;
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

  // A committed raster rotation turns this alpha via geometry.rotatedRasterAlpha; the angle is in the cache key.
  function pictureProfile(image, rotateRad = 0) {
    // A live rotate keeps the <img> src and feeds its own profile, bypassing the cache.
    if ((moving?.kind === 'rotate' || moving?.kind === 'shape') && moving.image === image) return moving.previewProfile || null;
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
    return geometry.pictureSlices(pictureProfile(image, rotateRad), x, y, width, height, geometry.frameScale(image));
  }

  // Only a Rapier drawing turns its bytes; a raster rotates through `rotate=`. Never both owners of one angle.
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
    return geometry.pictureSlices(recipe ? boxProfile(recipe) : null, x, y, width, height, geometry.frameScale(image));
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

  function projectedLines(record, plan, current = null) {
    const updates = current ? [] : null;
    if (updates && current.childNodes.length !== plan.lines.length) return null;
    const output = updates ? null : document.createDocumentFragment();
    let previous = null;
    const {lineHeight} = record;
    const align = ['left', 'center', 'right', 'start', 'end'].includes(record.align)
      ? record.align : record.direction === 'rtl' ? 'right' : 'left';
    let lineIndex = 0;
    for (const line of plan.lines) {
      // Assign this exact spelling once; comparison reads attributes without invoking the CSS parser.
      const attributes = [['class', 'rapier-flow-line'],
        ['style', `left:${px(line.x)};top:${px(line.y)};width:${px(line.width)};height:${px(lineHeight)};direction:${record.direction};text-align:${align}`]];
      const element = projectedSpan(attributes, current?.childNodes.item(lineIndex++), updates);
      if (!element) return null;
      let childAt = updates ? element.firstChild : null;
      for (const fragment of line.fragments) {
        const mapped = gapPoints(record, previous, fragment);
        if (mapped) {
          const attributes = [['style', `display:inline-block;width:${px(fragment.gapBefore)}`]];
          if (mapped.sealed) attributes.push(['contenteditable', 'false']);
          const gap = projectedSpan(attributes, childAt, updates);
          if (!gap || updates && gap.childNodes.length !== 1) return null;
          const space = projectedText(' ', {points: mapped.points, record, text: ' '}, gap.firstChild, updates);
          if (!space) return null;
          if (updates) childAt = gap.nextSibling;
          else { gap.append(space); element.append(gap); }
        }
        const child = fragmentNode(record, fragment, childAt, updates);
        if (!child) return null;
        if (updates) childAt = child.nextSibling;
        else element.append(child);
        previous = fragment;
      }
      if (updates) { if (childAt) return null; }
      else output.append(element);
    }
    return updates || output;
  }

  function project(record, width, top, obstacles) {
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      narrowestColumn(record.fontSize), record.direction, record.balance);
    if (!plan) return null;
    const output = projectedLines(record, plan);
    if (!output) return null;
    record.paragraph.replaceChildren(output);
    record.paragraph.dataset.rapierFlow = 'true';
    style(record.paragraph, {position: 'relative', height: px(plan.height), 'min-height': '0'});

    record.projected = [...record.paragraph.childNodes];
    record.structure = [...record.paragraph.querySelectorAll('*')].map(node => [node, [...node.childNodes]]);
    record.plan = plan;
    record.geometry = {width, top, obstacles, height: plan.height};
    projections.set(record.paragraph, record);
    return plan.height;
  }

  // Only a plain, one-to-one source run can take a native insertion in its projected text. A single
  // interior space is equally exact; collapsed whitespace, mark boundaries and pending marks are not.
  function projectedInsert(event, record, selection) {
    if (window.__rapierWholeProjection || frame || pressedLayout || moving || restoring || printing ||
        rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source' || rapier.compare.active ||
        event.inputType !== 'insertText' || typeof event.data !== 'string' || !event.data) return null;
    const text = selection.anchorNode, offset = selection.anchorOffset, mapping = endpoints.get(text);
    if (/\s/.test(event.data) && !(event.data === ' ' && offset > 0 && offset < text?.data?.length &&
        /\S/.test(text.data[offset - 1]) && /\S/.test(text.data[offset]))) return null;
    const edit = record.wrapper.querySelector(':scope > .block-edit');
    if (!record.geometry || text?.nodeType !== Node.TEXT_NODE || mapping?.record !== record ||
        text.parentElement?.parentElement !== record.paragraph || edit?._rapierTypingMarks ||
        text.data !== mapping.text || !event.getTargetRanges) return null;
    const targets = event.getTargetRanges();
    if (targets.length !== 1 || targets[0].startContainer !== text || targets[0].endContainer !== text ||
        targets[0].startOffset !== offset || targets[0].endOffset !== offset) return null;
    const points = mapping.points || mapping.offsets?.map(at => ({node: mapping.node, offset: at, parents: mapping.parents}));
    const first = points?.[0], point = points?.[offset];
    if (!first || !point || points.length !== text.data.length + 1 ||
        points.some((value, index) => value.node !== first.node || value.offset !== first.offset + index || value.parents?.length) ||
        first.node.data.slice(first.offset, points.at(-1).offset) !== text.data) return null;
    const index = record.runs.findIndex(run => run.node === point.node);
    if (index < 0 || record.runs[index].parents.length || point.offset === 0 && index > 0 ||
        point.offset === point.node.data.length && index < record.runs.length - 1 ||
        _rapierCaretBoundary(point.node.data, point.offset) !== point.offset) return null;
    const future = record.runs.map(run => run.node === point.node
      ? run.node.data.slice(0, point.offset) + event.data + run.node.data.slice(point.offset) : run.node.data).join('');
    if (_rapierFirstStrongDir(future) !== record.direction) return null;
    // Resize, style/font, picture and structural mutations invalidate through schedule.
    // The current plan owns these dimensions; reading the live boxes here flushed layout
    // before every native insert even when no geometry had changed.
    if (cache.get(record.paragraph) !== record) return null;
    return {record, text, mapping, offset, index, expected: text.data.slice(0, offset) + event.data + text.data.slice(offset)};
  }

  // Mirror before the editor serializes its input. When the same planner reproduces the live nodes exactly,
  // only their source maps change: the browser already put the caret in the right node, with no selection write.
  function retainProjectedInsert(pending, event) {
    const {record, text, mapping, offset, expected} = pending;
    const selection = window.getSelection();
    if (!event.isTrusted || event.inputType !== 'insertText' || !text.isConnected || text.data !== expected ||
        projections.get(record.paragraph) !== record || !selection?.isCollapsed ||
        selection.anchorNode !== text || selection.anchorOffset !== offset + event.data?.length) return false;
    if (!spliceComposedRun(mapping, text.data, {offset, text: event.data})) return false;
    if (frame || pressedLayout || moving || restoring || printing) return false;
    return reflowProjected(record);
  }

  // Update only changed text and attributes. Equal descendants keep their native identity;
  // CharacterData's minimal splice also keeps a caret outside the changed tail in place.
  function reconcileProjected(parent, candidate) {
    const desired = [...candidate.childNodes];
    for (let index = 0; index < desired.length; index++) {
      const next = desired[index], current = parent.childNodes[index];
      if (!current) { parent.append(next); continue; }
      if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
        current.replaceWith(next); continue;
      }
      if (next.nodeType === Node.TEXT_NODE) {
        const before = current.data, after = next.data;
        if (before !== after) {
          let head = 0, tail = 0;
          while (head < Math.min(before.length, after.length) && before[head] === after[head]) head++;
          while (tail < Math.min(before.length, after.length) - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
          current.replaceData(head, before.length - head - tail, after.slice(head, after.length - tail));
        }
        endpoints.set(current, endpoints.get(next));
      } else {
        for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        for (const attribute of next.attributes) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        reconcileProjected(current, next);
      }
    }
    while (parent.childNodes.length > desired.length) parent.lastChild.remove();
  }

  function reflowProjected(record) {
    const selection = window.getSelection(), paragraph = record.paragraph;
    if (cache.get(paragraph) !== record || projections.get(paragraph) !== record || !record.geometry ||
        !selection?.isCollapsed || !paragraph.contains(selection.anchorNode) ||
        !record.projected || paragraph.childNodes.length !== record.projected.length ||
        record.projected.some((node, at) => node !== paragraph.childNodes[at])) return false;
    // A composition may change a second run or split nodes. The old restore/reconcile
    // owner must collect all of that work before any candidate can replace its view.
    if (record.structure.some(([node, children]) => node.childNodes.length !== children.length ||
        children.some((child, at) => child !== node.childNodes[at]))) return false;
    const texts = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node; (node = texts.nextNode());) {
      const mapping = endpoints.get(node);
      if (mapping?.record !== record || mapping.text !== node.data) return false;
    }
    const source = mappedPoint(selection.anchorNode, selection.anchorOffset);
    if (!source?.mapping || source.mapping.record !== record ||
        _rapierFirstStrongDir(record.runs.map(run => run.node.data).join('')) !== record.direction) return false;
    const changed = [];
    for (let index = 0; index < record.runs.length; index++) {
      const run = record.runs[index];
      if (run.node.data === run.prepared.raw) continue;
      // Source tokens have their own text normalization and measurement rules.
      if (run.parents.some(parent => parent.hasAttribute('data-rapier-source'))) return false;
      record.items[index] = {...record.items[index], text: run.node.data};
      changed.push(index);
    }
    record.flow = pretext.prepareRichInline(record.items);
    for (const index of changed) {
      const run = record.runs[index], old = run.prepared;
      const prepared = geometry.prepareRun(run.node.data, old.font, old.letterSpacing, record.flow.items[index]?.prepared);
      if (!prepared) return false;
      run.prepared = prepared;
    }
    const {width, top, obstacles, height} = record.geometry;
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      narrowestColumn(record.fontSize), record.direction, record.balance);
    if (!plan || plan.height !== height) return false;
    let replacement = null;
    if (record.runs.every(run => !run.parents.length)) {
      const updates = projectedLines(record, plan, record.paragraph);
      if (updates) {
        for (const [node, mapping] of updates) endpoints.set(node, mapping);
      } else {
        replacement = projectedLines(record, plan);
        if (!replacement) return false;
      }
    } else {
      // Rich shells keep their existing DOM equality check; the plain path has no clone or CSS work.
      const output = projectedLines(record, plan), live = record.paragraph.childNodes;
      if (!output) return false;
      if (live.length !== output.childNodes.length ||
          [...output.childNodes].some((node, at) => !node.isEqualNode(live[at]))) replacement = output;
      else {
        const before = document.createTreeWalker(output, NodeFilter.SHOW_TEXT);
        const after = document.createTreeWalker(record.paragraph, NodeFilter.SHOW_TEXT);
        for (let node; (node = before.nextNode());) endpoints.set(after.nextNode(), endpoints.get(node));
      }
    }
    if (replacement) {
      // This input already prepared the exact same-height plan. Publish it once instead of
      // restoring the paragraph, measuring its styles and planning these lines a second time.
      // Unexpected native structure still needs restore's source reconciliation.
      const point = source && projectedPoint(record.paragraph, source.node, source.offset, replacement);
      if (!point) return false;
      observer?.disconnect();
      try {
        reconcileProjected(record.paragraph, replacement);
        record.projected = [...record.paragraph.childNodes];
        record.structure = [...record.paragraph.querySelectorAll('*')].map(node => [node, [...node.childNodes]]);
        const live = projectedPoint(record.paragraph, source.node, source.offset);
        if (!sameSelection(selection, live, live)) selection.setBaseAndExtent(live.node, live.offset, live.node, live.offset);
      } finally { watch(); }
    }
    record.plan = plan;
    caretPlaced = {anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset};
    return true;
  }

  function paragraphStyle(paragraph) {
    const record = projections.get(paragraph);
    return !frame && cache.get(paragraph) === record && record ? {align: record.align, direction: record.direction} : null;
  }

  function caretBand(node, offset) {
    const mapping = endpoints.get(node), record = mapping?.record;
    if (frame || restoring || printing || moving || rapier.composition.block || !record?.plan ||
        cache.get(record.paragraph) !== record || projections.get(record.paragraph) !== record ||
        node?.nodeType !== Node.TEXT_NODE || node.data !== mapping.text || mapping.parents?.length ||
        node.parentElement?.parentElement !== record.paragraph || offset < 0 || offset > node.length ||
        record.lineHeight < record.fontSize) return null;
    const index = record.projected.indexOf(node.parentElement), line = record.plan.lines[index];
    if (!line || record.paragraph.childNodes[index] !== node.parentElement) return null;
    const top = record.geometry.top + line.y;
    // Font fallback can overhang the CSS line box. This wider band only proves an
    // interior no-scroll case; the browser still owns every correction near an edge.
    return {top: top - record.fontSize, bottom: top + record.lineHeight + record.fontSize};
  }

  function floatAround(paragraph, natural, top, obstacles) {
    // A closed details only lays out its summary. Keep the live disclosure and its body intact.
    if (paragraph.tagName === 'DETAILS' && !paragraph.open) {
      const summary = paragraph.querySelector(':scope > summary');
      if (!summary) return null;
      const bounds = rect(summary);
      const height = floatAround(summary, bounds, top + bounds.top - natural.top,
        obstacles.map(obstacle => ({...obstacle, x: obstacle.x - bounds.left + natural.left})));
      return height == null ? null : rect(paragraph).height;
    }
    const computed = getComputedStyle(paragraph);
    const left = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
    const right = (parseFloat(computed.paddingRight) || 0) + (parseFloat(computed.borderRightWidth) || 0);
    top += (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.borderTopWidth) || 0);
    const width = natural.width - left - right, bottom = top + natural.height;
    obstacles = obstacles.map(obstacle => ({...obstacle, x: obstacle.x - left}));
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
    style(paragraph, {display: computed.display.includes('list-item') ? 'flow-root list-item' : 'flow-root'});
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

  // An inline turned raster stays in flow with CSS transform and margins reserving the AABB growth; alone in its paragraph it also turns
  // display:block. Plain clears any turn this node still wears.
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

  function hasFlow(wrapper) {
    return !!wrapper && ([...projections.values()].some(row => row.wrapper === wrapper) ||
      [...floats.keys(), ...floatsRight.keys()].some(element => wrapper.contains(element)));
  }

  function textOf(surface) {
    return surface?.children.length === 1 ? metadata.wrapTextBlock(surface.firstElementChild) : null;
  }

  function editProse(wrapper) {
    if (!wrapper?.classList.contains('block-wrapper--editing') || wrapper.classList.contains('block-wrapper--source-edit')) return null;
    return textOf(wrapper.querySelector(':scope > .block-edit'));
  }

  function prose(wrapper) {
    if (!wrapper || wrapper.hidden || wrapper.classList.contains('block-wrapper--metadata')) return null;
    if (wrapper.classList.contains('block-wrapper--editing')) return editProse(wrapper);
    return textOf(readOf(wrapper));
  }

  function pictureOnly(wrapper) {
    const read = readOf(wrapper);
    const paragraph = read?.children.length === 1 && read.firstElementChild.tagName === 'P' ? read.firstElementChild : null;
    return !!paragraph && !paragraph.textContent.trim() && paragraph.querySelectorAll('img').length === 1;
  }

  // Text blocks can own a picture in read and edit mode. Complex blocks retain their live
  // controls through native shape floats; only plain inline runs use Pretext projections.
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
      // Plain reads every layout as empty (_rapierPlainLayout); the source is untouched.
      const layout = standalone && image && !_rapierPlainLayout() ? source.occurrence.layout : null;
      const editable = wrapper.classList.contains('block-wrapper--editing');
      const padTarget = editable ? wrapper.querySelector(':scope > .block-edit') : read;
      const content = !wrapper.classList.contains('block-wrapper--source-edit') &&
        padTarget?.children.length === 1 ? padTarget.firstElementChild : null;
      const paragraph = wrapParticipant(content), flowing = paragraph ? null : flowBlock(content);
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
      if (!(target?.paragraph || target?.flowing) || !prose(owner)) continue;
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
      const natural = row.paragraphBounds || row.flowingBounds;
      const owner = natural && prose(row.wrapper) && ownerBox(row.wrapper, row.paragraph || row.flowing, natural,
        natural.left - area.left, top + natural.top - row.bounds.top);
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
        const defaultWidth = active && (moving?.kind === 'rotate' || moving?.kind === 'shape') ? source.naturalWidth : source.imageBounds.width;
        // A picture sized in lines (`lines`) reads its anchor's line and stands on the first line's cap height.
        const lines = layout.lines != null ? ownerLines(owner) : null;
        const unrotated = geometry.imageBox(owner.width, source.naturalWidth, source.naturalHeight, layout, defaultWidth, lines);
        if (!unrotated) continue;
        // A drawing's imageBox is already turned; only a raster reserves for CSS rotation. The live angle wins during its gesture.
        const rasterRad = active && moving?.kind === 'rotate'
          ? (moving.raster ? moving.baseAngleRad + (moving.angle || 0) : (moving.angle || 0) - moving.shownAngle)
          : !isDrawing(source.image) ? (layout.rotate || 0) * Math.PI / 180 : 0;
        // rasterReserved (layout/model.mjs) is the one result for box, <img>, obstacles and grips.
        const fit = geometry.rasterReserved(owner.width, unrotated, rasterRad);
        if (!fit) continue;
        const box = fit.reserved, visualDeltaX = fit.visualDeltaX, visualDeltaY = fit.visualDeltaY;
        const x = owner.left + box.x;
        const ownerTop = owner.top + geometry.linesTop(layout, lines) + Math.min(layout.y || 0, owner.height / owner.em) * owner.em;
        let y = ownerTop;
        // behind/front are never obstacles.
        // The room two pictures keep, in the reference scale's pixels (layout/model.mjs
        // frameScale).
        const room = 10 * geometry.frameScale(source.image);
        if (!outOfFlow(layout)) {
          for (const obstacle of [...obstacles].sort((a, b) => a.y - b.y)) {
            if (obstacle.x < x + box.width + room && obstacle.x + obstacle.width > x - room &&
                obstacle.y + obstacle.height > y - room && obstacle.y < y + box.height + room)
              y = obstacle.y + obstacle.height + room;
          }
          // The first in-flow picture takes its owner down (margin-top on the collapsed wrapper, row top moved by the same lead), as clearTo does in export.
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
        pictures.push({row: source, x, y, width: box.width, height: box.height, wrap: layout.wrap, ownerWrapper: row.wrapper, ownerTop: owner.top + geometry.linesTop(layout, lines),
          visualX: x + visualDeltaX, visualY: y + visualDeltaY, visualWidth: fit.fit.width, visualHeight: fit.fit.height,
          rotateDeg: rasterRad ? rasterRad * 180 / Math.PI : 0});
        if (!outOfFlow(layout)) {
          const previewRecipe = active && (moving?.kind === 'rotate' || moving?.kind === 'shape') && !moving.raster ? moving.previewRecipe : null;
          const slices = layout.wrap === 'box'
            ? (rasterRad ? geometry.pictureSlices(geometry.rasterTiltProfile(fit.fit.width, fit.fit.height, rasterRad), x, y, box.width, box.height, geometry.frameScale(source.image))
                : boxSlices(source.image, x, y, box.width, box.height, previewRecipe))
            : pictureSlices(source.image, x, y, box.width, box.height, rasterRad);
          for (const slice of geometry.linesSlices(slices, layout, lines, y, box.height)) obstacles.push({...slice, wrapper: source.wrapper, owner: row.wrapper});
        }
        if (active) {
          moving.column = {left: owner.left, width: owner.width}; moving.ownerGeometry = owner;
          moving.box = {x, y, width: box.width, height: box.height};
          // Where this pass laid the moving picture: a move's frames show it from here by a transform (showMove).
          moving.shown = {x, y, rotate: rasterRad ? rasterRad * 180 / Math.PI : 0, owner: row.wrapper};
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
    if (!frame && host) frame = requestAnimationFrame(() => { const wrapper = replanWrapper; replanWrapper = null; if (!(wrapper && replan(wrapper))) layout(); });
  }

  // Typing inside one wrapped paragraph: the picture beside it has not moved and nothing above or
  // below has changed height, so only that paragraph's lines want laying again, against the obstacles
  // the last whole pass left. The paragraph is unprojected, prepared and projected alone, its selection
  // carried as the whole pass carries it; if its height came out as before, the rest of the document
  // stands where it was and the pass is done, else the whole pass runs. Measured on the welcome's first
  // paragraph at CPU 4, the whole pass was 39 ms of every 30 ms key. `window.__rapierWholeProjection`
  // forces the whole pass, so a probe can prove the two lay identical geometry.
  let replanWrapper = null;
  function replan(wrapper, previousHeight = null) {
    if (window.__rapierWholeProjection || !wrapper?.isConnected || !host || !geometry || !metadata || !pretext || moving || restoring || printing) return false;
    if (hasSelection() || rapier.composition.block || rapier.composition.source) return false;
    if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source' || rapier.compare.active) return false;
    const [row] = rows([wrapper]);
    if (!row?.paragraph || row.image || !prose(wrapper)) return false;
    const area = rect(host), origin = area.top - host.scrollTop;
    const before = rect(wrapper), top = before.top - origin, wasHeight = previousHeight ?? before.height;
    const relevant = lastObstacles.filter(obstacle => obstacle.y + obstacle.height > top && obstacle.y < top + wasHeight + 4096);
    if (!relevant.length) return false;
    frame = 0;
    observer?.disconnect();
    const editSelection = window.getSelection();
    let preserveStart = null, preserveEnd = null;
    if (editSelection?.rangeCount && (host.contains(editSelection.anchorNode) || host.contains(editSelection.focusNode))) {
      preserveStart = mappedPoint(editSelection.anchorNode, editSelection.anchorOffset);
      preserveEnd = mappedPoint(editSelection.focusNode, editSelection.focusOffset);
    }
    restore(wrapper); observer?.disconnect();
    const bounds = rect(wrapper), natural = rect(row.paragraph);
    if (row.editable) cache.delete(row.paragraph);
    const record = prepareParagraph(row.paragraph, wrapper);
    const horizontal = natural.left - area.left, paragraphTop = top + natural.top - bounds.top;
    const mapped = relevant.map(obstacle => ({...obstacle, x: obstacle.x - horizontal}));
    let height = record ? project(record, natural.width, paragraphTop, mapped) : null;
    if (height == null) height = floatAround(row.paragraph, natural, paragraphTop, mapped);
    if (height != null) style(wrapper, {'content-visibility': 'visible', contain: 'none'});
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
    watch();
    if (height == null || Math.abs(rect(wrapper).height - wasHeight) > 0.5) return false;
    positionGrip();
    return true;
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

  // A dialog over the page hides the picture's grips.
  function coverGrips() {
    const covered = !!document.querySelector('.link-dialog__overlay, dialog[open]');
    for (const grip of [...resizeGrips, moveHandle, rotateGrip]) grip?.toggleAttribute('data-rapier-covered', covered);
  }

  function positionGrip() {
    if (!resizeGrips.length) return;
    // Plain has no move, resize or rotate grips.
    const shown = gripsOk && selected?.isConnected && selected.naturalWidth > 0 && moving?.kind !== 'shape' && !fieldOpen && layoutOf(selected)?.lock !== 'on' &&
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

  // Icon buttons, aria-label carries the word (Draw is icons). `around` and `shape` write the same wrap=around.
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

  // Transparency: a second storey as placement's is, one slider whose word is a percentage, 0% solid to 95%. The picture
  // fades under the finger; the release writes `opacity=` (100 less the slider), one Undo step.
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

  // The lock: a locked picture stays where it is; a tap goes to the words around it, never to it, and a hold takes it to unlock
  // it. `lock=on` beside every other field, one commitLayout, one Undo step.
  async function setLock(on) {
    const record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
    if (!record || _rapierUserMutationBlocked() || !_rapierCommitPendingHistory()) return false;
    const occurrence = sourceOccurrence(record);
    if (occurrence.reason) { showToast('This picture cannot be locked without altering its source', 'info'); return false; }
    if ((occurrence.layout.lock === 'on') === on) return true;
    const layout = {...occurrence.layout};
    if (on) layout.lock = 'on'; else delete layout.lock;
    const committed = await commitLayout(record, occurrence, layout, on ? 'document.lock-image' : 'document.unlock-image');
    return committed;
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
    let lock = toolbar.querySelector('.rapier-image-lock');
    if (!lock) {
      lock = document.createElement('button'); lock.type = 'button';
      lock.className = 'rapier-image-tools__btn rapier-image-lock';
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), body = document.createElementNS(ns, 'rect'), shackle = document.createElementNS(ns, 'path');
      for (const [key, value] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) svg.setAttribute(key, value);
      for (const [key, value] of [['x', '5'], ['y', '11'], ['width', '14'], ['height', '10'], ['rx', '2']]) body.setAttribute(key, value);
      shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
      svg.append(body, shackle); lock.append(svg);
      lock.setAttribute('aria-label', 'Lock in place');
      lock.addEventListener('click', event => { event.preventDefault(); if (event.isTrusted) void setLock(lock.getAttribute('aria-pressed') !== 'true'); });
      fade.after(lock);
    }
    const layout = selected && layoutOf(selected);
    // Plain authors rung 0 only -- no placement row (view, edit, draw, delete, close).
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
    lock.setAttribute('aria-pressed', layout?.lock === 'on' ? 'true' : 'false');
    lock.title = layout?.lock === 'on' ? 'Unlock' : 'Lock in place';
    lock.disabled = rapier.access.readOnly || rapier.compare.active;
    if (fadeRowOpen) updateFadeRow(layout);
  }

  function select(image) {
    if (moving && moving.image !== image) cancel();
    if (selected !== image) { disarm(); closeWrapRow(); if (!fadeHold) closeFadeRow(); closeShapeField(); selected?.removeAttribute('data-rapier-image-selected'); selected?.removeAttribute('data-rapier-drawing'); }
    selected = image;
    selected.setAttribute('data-rapier-image-selected', 'true');
    // A diagram's boxes take the finger in any direction, so the browser pans nothing from a selected diagram; any other
    // drawing is a picture, and the page pans from it as from a photo.
    if (isDrawing(image) && typeof _rapierDrawRecipeFromImage === 'function' && isDiagram(_rapierDrawRecipeFromImage(image))) selected.setAttribute('data-rapier-drawing', 'true'); else selected.removeAttribute('data-rapier-drawing');
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
      rotateGrip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + rotateGlyph + '</svg>';
      rotateGrip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
      document.body.append(rotateGrip);
    }
    if (!dialogWatch) {
      // Dialogs open on body's own children (_rapierBeginEngineDialog) or by `open`; a body:has() rule kept this before and
      // made every write under body a whole-document style recalculation, four a frame while a picture moved.
      dialogWatch = new MutationObserver(coverGrips);
      dialogWatch.observe(document.body, {childList: true});
      dialogWatch.observe(document.documentElement, {subtree: true, attributes: true, attributeFilter: ['open']});
    }
    coverGrips(); controls(); positionGrip();
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
    // Spelled out for the profile-seams check.
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
      // The shown bytes turn on screen as a picture's do; shownAngle is the angle those bytes already carry.
      const shownProfile = pictureProfile(image);
      moving = {...shared, shownProfile, shownAngle: 0, restTimer: 0,
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
      // A raster turns via `rotate=`; baseAngleRad composes a second rotate. Its alpha is read once, before any transform.
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
    return known || ownerBox(wrapper, paragraph, bounds, bounds.left - area.left, bounds.top - area.top + host.scrollTop);
  }

  // An owner's padding, border and type size cannot change while a finger moves a picture; read once per gesture.
  // Read every frame between the pass's own margin writes, each read was a whole-document style recalculation
  // (17 of 39 s of a phone-speed move of the welcome's diagram).
  const ownerInsets = new WeakMap();
  function ownerBox(wrapper, element, bounds, left, top) {
    let edges = moving ? ownerInsets.get(element) : null;
    if (!edges || edges.gesture !== moving) {
      const computed = getComputedStyle(element);
      const inset = side => (parseFloat(computed['padding' + side]) || 0) + (parseFloat(computed['border' + side + 'Width']) || 0);
      edges = {gesture: moving, left: inset('Left'), top: inset('Top'), right: inset('Right'), bottom: inset('Bottom'), em: parseFloat(computed.fontSize) || 16};
      if (moving) ownerInsets.set(element, edges);
    }
    return {wrapper, left: left + edges.left, top: top + edges.top,
      width: Math.max(0, bounds.width - edges.left - edges.right),
      height: Math.max(0, bounds.height - edges.top - edges.bottom), em: edges.em, element};
  }

  // An owner's line metrics read its computed style too: once per gesture, beside its insets.
  function ownerLines(owner) {
    if (owner.lines !== undefined) return owner.lines;
    const edges = moving ? ownerInsets.get(owner.element) : null;
    if (edges && edges.gesture === moving) return owner.lines = edges.lines !== undefined ? edges.lines : (edges.lines = geometry.lineMetrics(owner.element));
    return owner.lines = geometry.lineMetrics(owner.element);
  }

  function activateMove() {
    if (!moving || moving.kind !== 'move' || moving.activated) return;
    moving.activated = true; moving.anchor = moving.image.closest('.block-wrapper'); moving.shown = null;
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
      if (moving.layout.lines == null) moving.layout.width ??= Number(clamp(moving.box.width / owner.width * 100, .01, 100).toFixed(2));
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
    if (moving.layout.lines == null) moving.layout.width ??= Number(clamp(moving.box.width / moving.column.width * 100, .01, 100).toFixed(2));

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
    closeShapeField();
    selected?.removeAttribute('data-rapier-image-selected'); selected?.removeAttribute('data-rapier-drawing'); selected = null;
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
    dropShapeLive(gesture);
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

  // A drawing's new bytes into the document: the recipe's SVG as a fresh asset, the occurrence's layout marker
  // re-carried verbatim by replaceImage, one Undo step. A rotation, a box moved and a box relabelled all land here.
  // A box moved or reworded changes the drawing's extent. What the finger saw is what lands: every box keeps its size on the page
  // (the scale before the gesture) and the drawing's old top-left stays where it was, so the picture grows from that corner,
  // never about its centre. A picture sized in lines that grows takes the width that keeps the scale and gives up `lines` in the
  // same write (the two are never written together); a picture in normal flow takes `x`, which needs a width and excludes `align`.
  function keptScalePlacement(record, before, after, image) {
    const placed = record.image.placementSource;
    if (!before || !placed?.includes('<!--md-layout:')) return undefined;
    const layout = sourceOccurrence(record).layout, core = globalThis.RapierDrawCore;
    if (!layout || !(layout.width > 0 || layout.lines != null)) return undefined;
    // The shown picture is the stored view; the new one is the after's ink view, placed in the same scale and frame.
    const view = recipeView(before), was = core?._rapierDrawInkView?.(before), now = core?._rapierDrawInkView?.(after);
    if (!(view?.w > 0) || !(was?.w > 0) || !(now?.w > 0)) return undefined;
    if (Math.abs(now.w - was.w) < .5 && Math.abs(now.x - was.x) < .5 && Math.abs(now.y - was.y) < .5) return undefined;
    const column = _rapierImageColumnWidth(image), box = image && rect(image);
    if (!(column > 0) || !(box?.width > 0) || !(box.height > 0)) return undefined;
    // The ink is contained in the box (a picture in lines letterboxes): the drawn scale and the drawn left inside the box.
    const scale = Math.min(box.width / view.w, box.height / view.h), inset = (box.width - view.w * scale) / 2, insetY = (box.height - view.h * scale) / 2;
    const oldWidth = box.width, newWidth = Math.min(column, now.w * scale);
    const next = {...layout};
    delete next.lines;
    next.width = Math.min(100, Math.max(1, Math.round(newWidth / column * 10000) / 100));
    // The old left edge of the ink on the page: the clamped centre a wrapped picture or an `x` stands at, else its alignment's.
    const oldLeft = inset + (layout.x != null ? clamp(column * layout.x / 100 - oldWidth / 2, 0, Math.max(0, column - oldWidth))
      : layout.align === 'center' ? (column - oldWidth) / 2 : layout.align === 'right' ? column - oldWidth : 0);
    const newLeft = oldLeft + (now.x - view.x) * scale;
    if (layout.x != null || layout.wrap || Math.abs(newLeft - oldLeft) > .5 || layout.align === 'center' || layout.align === 'right') {
      delete next.align;
      next.x = Math.round(clamp((newLeft + newWidth / 2) / column * 100, 0, 100) * 100) / 100;
    }
    // A picture in lines stood on the first line's cap height; a width picture's `y` counts from the paragraph's top.
    const placedNow = layout.lines != null && lastPictures.find(picture => picture.row.image === image);
    const capTop = placedNow ? Math.max(0, placedNow.ownerTop - (ownerBoxes.get(placedNow.ownerWrapper)?.top ?? placedNow.ownerTop)) : 0;
    if (layout.wrap && (Math.abs(now.y - view.y) > .5 || capTop || insetY > .5)) {
      const em = parseFloat(getComputedStyle(image).fontSize) || 16;
      const y = Math.round(((layout.y || 0) + (capTop + insetY + (now.y - view.y) * scale) / em) * 1000) / 1000;
      if (y >= -50) next.y = y; else delete next.y;
      if (!next.y) delete next.y;
    }
    let marker;
    try { marker = metadata.formatLayout(next); } catch (_) { return undefined; }
    return placed.replace(/<!--md-layout:[\s\S]*?-->/, marker);
  }
  async function commitDrawing(record, gesture, recipe, releaseTop, viewport = null, before = null, keepSelected = false) {
    const core = globalThis.RapierDrawCore, assets = globalThis.RapierImageAssets;
    if (!core || !assets || !recipe) return false;
    const span = _rapierExcerptCanonicalBlockSpans().get(record.block.id);
    if (!span) return false;
    // Capture identity before the first await: a stale gesture must not pin the viewport or steal the reselect. The change still lands.
    const identity = rapier.identity.authority, intent = userIntent;
    const current = () => identity === rapier.identity.authority && intent === userIntent;
    // Preview and commit share this candidate; admission only rounds an integer viewport.
    const candidate = rotateCandidate(recipe);
    const svgText = candidate?.svg ?? core._rapierDrawBuildSVG(recipe);
    const currentAlt = _rapierImageAltText(_rapierImageAltSourceParts(record.image.altSource).alt);
    // One finally: restore the pre-gesture bytes only when nothing replaced them.
    try {
      const asset = await assets.createAsset(new TextEncoder().encode(svgText), null, {codec: 'image/svg+xml', title: currentAlt || 'drawing'});
      const raw = '![' + _rapierEscapeImageAlt(currentAlt) + '][' + asset.label + ']';
      const normalized = {asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height};
      if (current()) armSettle(releaseTop, span.start, record.imageIndex);
      // Restore to the captured viewport, never a reveal.
      const placement = keptScalePlacement(record, before, recipe, gesture?.image || _rapierImageRuntime.image);
      const committed = await globalThis.RapierEmbeddedImages.insert(normalized, raw,
        {replaceImage: {blockId: record.block.id, imageIndex: record.imageIndex, ...(placement != null ? {placement} : {})}, viewport}, gesture.stamp);
      if (committed && current()) {
        const block = rapier.document.blocks.find(row => row.id === record.block.id);
        const wrapper = block && document.querySelector('[data-block-id="' + block.id + '"]');
        const image = wrapper?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[record.imageIndex];
        if (image) { _rapierSelectImage(block, image); settleNow(image, releaseTop); return committed; }
        // Words set in a box: the diagram stays selected for the next box's words. Its block may carry a new id (its own
        // source changed); it is the block that now starts where it started. The view is already held by the restore.
        if (keepSelected) {
          const spans = _rapierExcerptCanonicalBlockSpans(), moved = rapier.document.blocks.find(row => spans.get(row.id)?.start === span.start);
          const again = moved && document.querySelector('[data-block-id="' + moved.id + '"]')?.querySelectorAll('.block-read [data-rapier-markdown-image]')?.[record.imageIndex];
          if (again) { endSettle(); _rapierSelectImage(moved, again); schedule(); return committed; }
        }
      }
      endSettle(); schedule();
      return committed;
    } finally { restoreRotateImage(gesture); }
  }

  // Rotation changes only the definition's SVG bytes; replaceImage re-carries the occurrence's layout marker verbatim.
  async function commitRotate(record, gesture, angle, releaseTop, viewport = null) {
    const edit = globalThis.RapierDrawEdit;
    if (!edit) return false;
    return commitDrawing(record, gesture, edit.rotateDrawing(gesture.baseRecipe, angle), releaseTop, viewport);
  }

  // --- A diagram's boxes, inside the document. A tap selects the drawing as before; on a selected drawing the
  // finger takes a box in any direction and a tap on a box opens its words (or its step number) where they
  // stand. Every change is the headless editor's, written back as the drawing's new bytes in one Undo step;
  // nothing here knows how a box is drawn.

  // A page point in a drawing's own units, through the picture's view (the SVG's viewBox fills the <img>).
  function drawingPoint(image, recipe, clientX, clientY) {
    const bounds = rect(image), view = recipeView(recipe);
    if (!(bounds.width > 0) || !(bounds.height > 0) || !(view.w > 0) || !(view.h > 0)) return null;
    return [view.x + (clientX - bounds.left) / bounds.width * view.w, view.y + (clientY - bounds.top) / bounds.height * view.h];
  }
  // A diagram: figures that hold words or a step number, or connectors bound to them. Any other drawing (the
  // welcome's rapier, a regular SVG) is a picture in the document: it moves, resizes and turns whole, and its parts
  // move only in Draw.
  function isDiagram(recipe) {
    return !!recipe?.shapes?.some(shape => shape.bind?.start?.to || shape.bind?.end?.to || Number.isInteger(shape.step) ||
      (shape.label && shape.recognized !== 'text'));
  }
  // The box under a page point: a figure that holds words or can (never a connector, ink or paint), front to back.
  // `step` says the point sits on the box's step figures, which stand above its words: from the box's top to just under the
  // figures themselves. The gap between the figures and the words, and the middle of the box, are the words' (a tap at the
  // centre must not turn on a fraction of a pixel of where the page happens to sit).
  function boxAt(image, clientX, clientY) {
    const core = globalThis.RapierDrawCore, recipe = typeof _rapierDrawRecipeFromImage === 'function' ? _rapierDrawRecipeFromImage(image) : null;
    if (!isDiagram(recipe) || !core?._rapierDrawShapeBBoxIn) return null;
    const point = drawingPoint(image, recipe, clientX, clientY);
    if (!point) return null;
    for (let i = recipe.shapes.length - 1; i >= 0; i--) {
      const shape = recipe.shapes[i];
      if (shape.locked || !shape.geom || ['line', 'arrow', 'ink', 'paint', 'arc'].includes(shape.recognized)) continue;
      const box = core._rapierDrawShapeBBoxIn(shape, recipe);
      if (!box || point[0] < box.minX || point[0] > box.maxX || point[1] < box.minY || point[1] > box.maxY) continue;
      const polygon = shape.recognized === 'text' ? null : core._rapierDrawShapePolygon?.(shape, recipe);
      if (polygon?.length > 2 && core._rapierDrawPointInPolygon && !core._rapierDrawPointInPolygon(point, polygon)) continue;
      let step = false;
      if (Number.isInteger(shape.step) && shape.labelIn && core._rapierDrawTextLayout) {
        try { const laid = core._rapierDrawTextLayout(shape, recipe); step = laid?.stepBottom > 0 && point[1] < laid.stepBottom + (laid.fontSize || 14) * .3; } catch (_) { step = false; }
      }
      return {image, recipe, shape, box, point, step};
    }
    return null;
  }

  function beginShape(hit) {
    const ready = readyGesture('This drawing cannot be changed without altering its source');
    if (!ready) return;
    const {record, occurrence} = ready;
    const image = selected, recipe = hit.recipe, bounds = rect(image), area = rect(host), view = recipeView(recipe);
    if (!(bounds.width > 0) || !(view.w > 0)) return;
    endSettle();
    resetRotatePerf();
    moving = {kind: 'shape', image, blockId: record.block.id, imageIndex: record.imageIndex, record, occurrence, hit,
      owner: positioned(occurrence.layout) ? wrapOwner(image.closest('.block-wrapper')) : null,
      shapeId: hit.shape.id, baseRecipe: recipe, previewRecipe: null, previewProfile: null, refused: null, offset: null,
      // Page pixels per drawing unit at the start; the box follows the finger's travel in the drawing's own units.
      scale: bounds.width / view.w, angle: 0,
      box: {x: bounds.left - area.left, y: bounds.top - area.top + host.scrollTop, width: bounds.width, height: bounds.height},
      stamp: Object.freeze(_rapierMutationStamp()), source: _rapierSourceText(), pointer: null,
      // The preview swaps <img> src and natural-size attributes; these restore them on cancel.
      originalSrc: image.src, originalNaturalWidth: image.getAttribute('data-rapier-natural-width'),
      originalNaturalHeight: image.getAttribute('data-rapier-natural-height'), candidateUrl: null, candidateToken: 0,
      pendingRecipe: null, candidateBusy: false};
    _rapierCancelViewRestore();
    image.setAttribute('data-rapier-image-gesture', 'shape');
    host.setAttribute('data-rapier-image-gesture', 'shape');
    // No layout pass here: nothing the words flow around changes until the release (the picture is not resized by a box drag).
    controls(); notify();
  }

  function startShape(event, hit) {
    cancel(); beginShape(hit);
    if (!moving) { pointerClick = event.pointerId; return; }
    const x = event.clientX, y = event.clientY, bounds = rect(moving.image);
    moving.pointer = event.pointerId; moving.pointerOwner = host; moving.pointerType = event.pointerType;
    moving.drag = {x, y, clientX: x, clientY: y, left: moving.box.x, top: moving.box.y, width: moving.box.width, scroll: host.scrollTop,
      offsetX: x - bounds.left, offsetY: y - bounds.top, contact: Number(event.height) || 1, moved: false};
    try { host.setPointerCapture(event.pointerId); } catch (_) { cancel(); return; }
    notify();
    // The live copy is built while the finger is still settling (idle, off the first frame of the drag, or of the words).
    const gesture = moving, prebuild = () => { if (moving === gesture && gesture.live === undefined && !gesture.prepared) gesture.prepared = buildLive(gesture.image, gesture.baseRecipe, globalThis.RapierDrawCore); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(prebuild, {timeout: 120}); else setTimeout(prebuild, 30);
  }

  // Every frame of a box drag: the box moved on the base recipe by the finger's travel; a move the drawing refuses
  // (a connector left no way) keeps the last one it took, and the release says so if it took none.
  function shapePreview() {
    if (!moving || moving.kind !== 'shape' || moving.committing || !moving.drag) return;
    const gesture = moving, drag = gesture.drag, edit = globalThis.RapierDrawEdit, core = globalThis.RapierDrawCore;
    if (!edit?.editDrawing) return;
    // The one layout read of the frame, before any write.
    const top = host.scrollTop, scrolled = gesture.live ? top - gesture.live.scroll : 0;
    const dx = (drag.clientX - drag.x) / gesture.scale, dy = (drag.clientY - drag.y + top - drag.scroll) / gesture.scale;
    if (gesture.offset && gesture.offset.dx === dx && gesture.offset.dy === dy) return;
    let recipe;
    try { recipe = edit.editDrawing(gesture.baseRecipe, [gesture.shapeId], {type: 'move', dx, dy}).recipe; gesture.refused = null; }
    catch (error) { gesture.refused = error; return; }
    gesture.offset = {dx, dy}; gesture.previewRecipe = recipe;
    // The frame touches neither the source nor the document's layout: the shape's group is translated and only the
    // connectors bound to it are rewritten, in a picture-sized copy laid over the picture (the one write of this frame).
    const live = shapeLive(gesture, core);
    if (live) paintShapeLive(live, gesture, recipe, dx, dy, scrolled);
  }

  // The drawing as inline SVG laid over its picture for the length of one box drag: a copy of the picture's own bytes
  // (as the paper shows them), the picture itself hidden beneath. Dropped by restoreRotateImage, whatever ends the gesture.
  function hideImage(image) { image.style.opacity = '0'; image.setAttribute('data-rapier-live', ''); }
  function shapeLive(gesture, core) {
    if (gesture.live !== undefined) return gesture.live;
    gesture.live = gesture.prepared || buildLive(gesture.image, gesture.baseRecipe, core);
    gesture.prepared = null;
    if (!gesture.live) return null;
    hideImage(gesture.image);
    const bounds = rect(gesture.image), svg = gesture.live.svg, holder = liveHolder(svg);
    holder.style.cssText = 'position:fixed;margin:0;pointer-events:none;z-index:90;left:' + px(bounds.left) + ';top:' + px(bounds.top) +
      ';width:' + px(bounds.width) + ';height:' + px(bounds.height);
    gesture.live.holder = holder;
    gesture.live.groups.get(gesture.shapeId).style.willChange = 'transform';
    document.body.append(holder);
    gesture.live.scroll = host.scrollTop;
    return gesture.live;
  }
  // The live copy lives in a shadow tree: its writes (every frame of a drag) never reach the page's own selectors
  // (:has() would restyle the whole document for each attribute changed under body). A slot carries any field over it.
  function liveHolder(svg, into = null) {
    const holder = into || document.createElement('div'), root = holder.attachShadow({mode: 'open'});
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none';
    root.append(svg, document.createElement('slot'));
    return holder;
  }
  // The recipe's own SVG as the paper shows it, as live nodes (not yet in the page), and the picture itself made
  // invisible beneath (opacity, so it still takes the finger). Null when the drawing cannot be copied.
  function buildLive(image, recipe, core) {
    if (!core?._rapierDrawBuildSVG || !core._rapierDrawShapeMarkup) return null;
    try {
      const text = core._rapierDrawBuildSVG(recipe);
      const shown = globalThis.RapierEmbeddedImages?.inkForPaper ? globalThis.RapierEmbeddedImages.inkForPaper(text) : text;
      const parsed = new DOMParser().parseFromString(shown, 'image/svg+xml').documentElement;
      if (!parsed || parsed.localName !== 'svg' || parsed.querySelector('parsererror')) return null;
      const svg = document.importNode(parsed, true);
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.setAttribute('data-rapier-shape-live', ''); svg.setAttribute('aria-hidden', 'true');
      const groups = new Map(), keys = new Map();
      for (const group of svg.querySelectorAll('g[data-shape-id]')) groups.set(group.getAttribute('data-shape-id'), group);
      for (const shape of recipe.shapes) if (shape.bind) keys.set(shape.id, globalThis.RapierDrawCore._rapierDrawShapeMarkup(shape, recipe));
      return {svg, groups, keys, image, scroll: 0};
    } catch (_) { return null; }
  }
  const liveColour = new Set(['fill', 'stroke', 'color', 'stop-color']);
  // Same element shape, new numbers: copy what moved (never a colour, which the paper may have re-inked) and leave the rest.
  function liveCopy(old, next) {
    if (old.localName !== next.localName || old.childElementCount !== next.childElementCount) return false;
    for (const {name, value} of next.attributes) if (!liveColour.has(name) && old.getAttribute(name) !== value) old.setAttribute(name, value);
    for (const {name} of [...old.attributes]) if (!liveColour.has(name) && !next.hasAttribute(name)) old.removeAttribute(name);
    if (!next.childElementCount && old.textContent !== next.textContent) old.textContent = next.textContent;
    for (let i = 0; i < next.childElementCount; i++) if (!liveCopy(old.children[i], next.children[i])) return false;
    return true;
  }
  // One figure's markup, from the drawing's own writer, as a node.
  function liveMarkup(markup) {
    const parsed = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + markup + '</svg>', 'image/svg+xml').documentElement;
    return parsed?.localName === 'svg' && parsed.firstElementChild ? document.importNode(parsed.firstElementChild, true) : null;
  }
  function paintShapeLive(live, gesture, recipe, dx, dy, scrolled) {
    const core = globalThis.RapierDrawCore;
    live.svg.style.transform = scrolled ? 'translateY(' + px(-scrolled) + ')' : '';
    live.groups.get(gesture.shapeId).setAttribute('transform', 'translate(' + Math.round(dx * 100) / 100 + ' ' + Math.round(dy * 100) / 100 + ')');
    for (const shape of recipe.shapes) {
      if (!shape.bind || shape.id === gesture.shapeId) continue;
      // Keyed on the route the commit will draw, not the endpoints alone: an arrow that only bends round the moving box
      // keeps its ends and changes its path, and must change here, not on release.
      const markup = core._rapierDrawShapeMarkup(shape, recipe);
      if (live.keys.get(shape.id) === markup) continue;
      live.keys.set(shape.id, markup);
      const old = live.groups.get(shape.id);
      if (!old) continue;
      const next = liveMarkup(markup);
      if (next && !liveCopy(old, next)) { old.replaceWith(next); live.groups.set(shape.id, next); }
    }
  }
  function dropShapeLive(gesture) {
    const live = gesture?.live;
    if (!live) return;
    gesture.live = undefined;
    live.holder?.remove();
    if (live.image?.isConnected) { live.image.style.removeProperty('opacity'); live.image.removeAttribute('data-rapier-live'); }
  }
  function scheduleShapePreview() {
    if (rotateFrame) return;
    rotateFrame = requestAnimationFrame(() => { rotateFrame = 0; shapePreview(); });
  }

  // The words of a box, or its step number, edited where they stand: the drawing's own live copy is laid over its
  // picture with that figure's words lifted out, and a bare field takes their place, set in the same type, size and
  // ink at the same spot, with the keyboard up. Enter, a tap away or Escape writes the drawing; a drag on a shape
  // drops the edit. No pop-up, no buttons: the words are edited in the diagram.
  function openShapeField(hit, prepared = null) {
    closeShapeField();
    const {image, shape} = hit, step = hit.step, edit = globalThis.RapierDrawEdit, core = globalThis.RapierDrawCore;
    if (!edit?.editDrawing || !selected || selected !== image || !image.isConnected) return;
    const live = prepared || buildLive(image, hit.recipe, core);
    if (!live) return;
    hideImage(image);
    const group = live.groups.get(shape.id);
    const holder = document.createElement('div');
    holder.setAttribute('data-rapier-diagram-edit', ''); holder.setAttribute('role', 'group'); holder.setAttribute('aria-label', 'diagram words');
    const bounds = rect(image), view = recipeView(hit.recipe), scale = bounds.width / view.w;
    holder.style.cssText = 'position:fixed;margin:0;padding:0;pointer-events:none;z-index:90;left:' + px(bounds.left) + ';top:' + px(bounds.top) +
      ';width:' + px(bounds.width) + ';height:' + px(bounds.height);
    liveHolder(live.svg, holder);
    document.body.append(holder);
    const input = document.createElement(step ? 'input' : 'textarea');
    if (step) {
      // The step number: a small field over the figures, as before.
      const text = group?.querySelector('text'), spot = text ? rect(text) : rect(group || live.svg), look = text ? getComputedStyle(text) : null;
      const ink = look?.fill && look.fill !== 'none' ? look.fill : 'currentColor';
      const fontPx = (parseFloat(text?.getAttribute('font-size')) || parseFloat(look?.fontSize) || 14) * scale, linePx = fontPx * 1.25, width = Math.max(48, fontPx * 3);
      input.type = 'number'; input.min = '1'; input.max = '99'; input.inputMode = 'numeric';
      input.value = shape.step != null ? String(shape.step) : '';
      input.setAttribute('aria-label', 'Step number');
      input.style.cssText = 'position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;outline:0;pointer-events:auto;touch-action:manipulation;' +
        'background:var(--color-bg);color:' + ink + ';caret-color:' + ink + ';font-family:' + (look?.fontFamily || 'inherit') + ';font-size:' + px(fontPx) +
        ';line-height:' + px(linePx) + ';text-align:center;-moz-appearance:textfield;font-variant-numeric:tabular-nums;width:' + px(width) + ';height:' + px(linePx) +
        ';left:' + px(spot.left - bounds.left + spot.width / 2 - width / 2) + ';top:' + px(spot.top - bounds.top - linePx * 1.2);
    } else {
      // The words: the drawing keeps drawing them, redrawn by its own engine on every keystroke (the box refits and its
      // connectors follow, as Draw's label editor does), and the field lies exactly over them with its own letters
      // transparent, so what shows is the drawing and the field gives the caret, the selection and the keyboard.
      input.value = shape.label || ''; input.spellcheck = true;
      input.className = 'rapier-draw-label-input';
      input.setAttribute('aria-label', shape.recognized === 'text' ? 'Drawing text' : 'Box words');
      input.style.position = 'absolute'; input.style.pointerEvents = 'auto'; input.style.touchAction = 'manipulation';
    }
    holder.append(input);
    fieldOpen = {image, shapeId: shape.id, step, input, holder, live, value: input.value, done: false, pressing: false,
      base: hit.recipe, recipe: hit.recipe, view, scale, keys: new Map(hit.recipe.shapes.map(row => [row.id, globalThis.RapierDrawCore._rapierDrawShapeMarkup(row, hit.recipe)]))};
    const settle = () => { if (!fieldOpen || fieldOpen.input !== input) return; const area = rect(image); holder.style.left = px(area.left); holder.style.top = px(area.top); };
    fieldOpen.scrolled = () => requestAnimationFrame(settle);
    host.addEventListener('scroll', fieldOpen.scrolled, {passive: true});
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape' || (event.key === 'Enter' && (step || !event.shiftKey))) { event.preventDefault(); void applyShapeField(); }
    });
    if (!step) {
      placeWords(fieldOpen);
      input.addEventListener('input', () => {
        const open = fieldOpen;
        if (!open || open.input !== input) return;
        // An empty box still shows its step number while its words are being retyped.
        let next;
        try { next = edit.editDrawing(open.base, [open.shapeId], {type: 'set_label', label: input.value}).recipe; } catch (_) { return; }
        open.recipe = next;
        repaintLive(open.live, next, open.keys);
        placeWords(open);
      });
    }
    input.addEventListener('blur', () => {
      if (fieldOpen?.input !== input || fieldOpen.done) return;
      setTimeout(() => { if (fieldOpen?.input === input && !fieldOpen.done && !fieldOpen.pressing && document.activeElement !== input) void applyShapeField(); }, 0);
    });
    positionGrip(); controls();
    input.focus({preventScroll: true});
    if (!step) input.setSelectionRange(input.value.length, input.value.length);
  }
  // The open words' layout, as the engine lays them for the recipe being typed.
  function wordsLayout(open) {
    const core = globalThis.RapierDrawCore, shape = open.recipe.shapes.find(row => row.id === open.shapeId);
    try { return shape && core?._rapierDrawTextLayout ? {shape, laid: core._rapierDrawTextLayout(shape, open.recipe)} : null; } catch (_) { return null; }
  }
  // The field over the words: the engine's own wrap width, line height, face, weight and alignment, at the picture's scale.
  // A letter set's advance font, made once per set from the core's bytes; the field is placed again when it has loaded.
  const letterFaces = new Map();
  function letterInputFamily(id, open) {
    let face = letterFaces.get(id);
    if (!face) {
      const bytes = globalThis.RapierDrawCore?.letterInputFont?.(id);
      face = {family: bytes ? 'rapier-page-letters-' + id : null};
      letterFaces.set(id, face);
      if (bytes) try {
        const font = new FontFace(face.family, bytes);
        document.fonts.add(font);
        font.load().then(() => { if (fieldOpen === open && open.input?.isConnected) placeWords(open); }, () => { face.family = null; });
      } catch (_) { face.family = null; }
    }
    return face.family;
  }
  function placeWords(open) {
    const found = wordsLayout(open), input = open.input;
    if (!found?.laid?.box) return;
    const {shape, laid} = found, k = open.scale, view = open.view, b = laid.box;
    const W = laid.wrapWidth || Math.max(b.maxX - b.minX, laid.fontSize);
    const left = laid.align === 'end' ? b.maxX - W : laid.align === 'middle' ? (b.minX + b.maxX) / 2 - W / 2 : b.minX;
    const lineHeight = laid.lineHeight || laid.fontSize * 1.25, height = Math.max(laid.height || 0, lineHeight);
    const st = input.style;
    st.left = px((left - view.x) * k); st.top = px((b.minY - view.y) * k);
    st.width = px(Math.max(1, W * k)); st.height = px(height * k);
    st.fontSize = px(laid.fontSize * k); st.lineHeight = px(lineHeight * k);
    // A letter set's capitals are paths: the field types in the set's own advance font (Draw's canvas does the same), so the
    // caret stands on the drawn letter, and a set shows no bold, italic or case.
    const lettered = /^letters:/.test(shape.textFont || ''), letterFamily = lettered && letterInputFamily(shape.textFont.slice(8), open);
    if (letterFamily) st.fontFamily = letterFamily + (laid.fontFamily ? ', ' + laid.fontFamily : '');
    else if (laid.fontFamily) st.fontFamily = laid.fontFamily;
    st.fontWeight = shape.textBold && !lettered ? '700' : '400'; st.fontStyle = shape.textItalic && !lettered ? 'italic' : 'normal';
    const shownCase = lettered ? '' : shape.textCase;
    st.textTransform = shownCase === 'upper' ? 'uppercase' : shownCase === 'lower' ? 'lowercase' : 'none';
    st.fontVariantCaps = shownCase === 'small' ? 'small-caps' : 'normal';
    st.letterSpacing = shape.letterSpacing ? shape.letterSpacing + 'em' : '0';
    st.textAlign = laid.align === 'middle' ? 'center' : laid.align === 'end' ? 'right' : 'left';
    input.wrap = laid.wrapWidth ? 'soft' : 'off';
    // The caret in the words' own ink, which the engine chose to read on this box's fill (an accent caret vanishes on a teal box).
    const ink = open.live.groups.get(open.shapeId)?.querySelector('text');
    const fill = ink && getComputedStyle(ink).fill;
    if (fill && fill !== 'none') st.caretColor = fill;
    st.transformOrigin = '0 0';
    st.transform = laid.rotation ? 'rotate(' + (laid.rotation * 180 / Math.PI) + 'deg)' : 'none';
  }
  // A tap inside the words being edited moves the caret there: the nearest caret the engine laid on the nearest line.
  function placeCaretAt(open, clientX, clientY) {
    const found = wordsLayout(open), point = drawingPoint(open.image, open.recipe, clientX, clientY), input = open.input;
    let offset = input.value.length;
    const lines = found?.laid?.lines?.filter(line => line.carets?.length);
    if (point && lines?.length) {
      const laid = found.laid, top = line => line.y - (laid.baseline || 0);
      const line = lines.reduce((best, row) => Math.abs(top(row) + laid.lineHeight / 2 - point[1]) < Math.abs(top(best) + laid.lineHeight / 2 - point[1]) ? row : best, lines[0]);
      const caret = line.carets.reduce((best, row) => Math.abs(line.x + row.x - point[0]) < Math.abs(line.x + best.x - point[0]) ? row : best, line.carets[0]);
      offset = Math.min(input.value.length, caret.offset);
    }
    input.focus({preventScroll: true});
    input.setSelectionRange(offset, offset);
  }
  // Redraw, in the live copy, every figure the new recipe changed (the box and the connectors that follow it).
  function repaintLive(live, recipe, keys) {
    const core = globalThis.RapierDrawCore;
    for (const shape of recipe.shapes) {
      // The drawn markup is the key: a connector rerouted round a box whose words grew changes here though its own fields do not.
      const markup = core._rapierDrawShapeMarkup(shape, recipe);
      if (keys.get(shape.id) === markup) continue;
      keys.set(shape.id, markup);
      const old = live.groups.get(shape.id);
      if (!old) continue;
      const next = liveMarkup(markup);
      if (next && !liveCopy(old, next)) { old.replaceWith(next); live.groups.set(shape.id, next); }
    }
  }
  function closeShapeField() {
    if (!fieldOpen) return;
    const open = fieldOpen;
    open.done = true; fieldOpen = null;
    host.removeEventListener('scroll', open.scrolled);
    open.holder.remove();
    if (open.live.image?.isConnected) { open.live.image.style.removeProperty('opacity'); open.live.image.removeAttribute('data-rapier-live'); }
    positionGrip();
  }
  async function applyShapeField() {
    const open = fieldOpen;
    if (!open || open.done) return false;
    const value = open.input.value, before = open.value, edit = globalThis.RapierDrawEdit;
    closeShapeField();
    if (value === before || !edit?.editDrawing || !selected?.isConnected || selected !== open.image || typeof _rapierDrawRecipeFromImage !== 'function') return false;
    // The drawing as it is now, not as it was when the field opened: an agent may have changed it meanwhile.
    const base = _rapierDrawRecipeFromImage(open.image);
    if (!base || !base.shapes.some(row => row.id === open.shapeId)) { showToast('That box is no longer in the drawing.', 'info'); return false; }
    let recipe;
    try {
      const result = open.step
        ? edit.editDrawing(base, [open.shapeId], {type: 'set_step', step: value.trim() === '' ? null : Number(value)})
        : edit.editDrawing(base, [open.shapeId], {type: 'set_label', label: value});
      if (!result.changed) return false;
      recipe = result.recipe;
    } catch (error) {
      showToast(error.code === 'drawing_label_invalid' ? (open.step ? 'A step number is 1 to 99.' : 'Those words cannot go in this box.')
        : error.code === 'drawing_route_blocked' ? 'Those words leave a connector no way, so the drawing was kept.' : String(error.message || error), 'error');
      return false;
    }
    const ready = readyGesture('This drawing cannot be changed without altering its source');
    if (!ready) return false;
    const image = selected, releaseTop = rect(image).top - rect(host).top;
    const gesture = {image, stamp: Object.freeze(_rapierMutationStamp()), candidateUrl: null};
    // As a box drag admits its release: no older view restore left to fire, and the view anchored where the drag's is.
    _rapierCancelViewRestore();
    const viewport = _rapierCaptureEditorViewport(positioned(ready.occurrence.layout) ? wrapOwner(image.closest('.block-wrapper')) : null, true, true);
    return commitDrawing(ready.record, gesture, recipe, releaseTop, viewport, base, true);
  }

  // Fold into the writer's own domain, `(-180, 180]` degrees.
  function normalizeRotateDeg(deg) {
    let value = ((deg + 180) % 360 + 360) % 360 - 180;
    if (value <= -180) value += 360;
    return value;
  }

  // A raster's rotate is a layout fact: base angle plus the released delta, one commitLayout, one Undo step.
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
      if (!mountedWrappers().some(prose)) showToast('There is no text nearby to wrap the image around', 'info');
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
    // A picture in lines keeps its lines inline; normal-flow `x` needs a width it does not have, so the place goes.
    if (layout.lines != null) delete layout.x;
    else if (layout.x != null && layout.width == null) {
      const column = selected?.closest('p'), width = column && rect(column).width;
      if (width > 0) layout.width = Number(clamp(rect(selected).width / width * 100, .01, 100).toFixed(4));
      else delete layout.x;
    }
    void commitLayout(record, occurrence, layout);
  }

  // A gesture on a changed document re-bases when its picture's occurrence is intact; only a gone picture goes back, and says so.
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
    if (gesture.kind === 'shape') {
      // The pointer is already released here (releasePointer clears drag): the offset says whether a preview moved the box.
      const recipe = gesture.previewRecipe;
      if (!gesture.offset || (!gesture.offset.dx && !gesture.offset.dy)) {
        const refused = gesture.refused; cancel();
        if (refused) showToast('That move leaves a connector no way, so the box stayed where it was.', 'info');
        return !refused;
      }
      const releaseTop = rect(gesture.image).top - rect(host).top, viewport = admitGesture(gesture);
      try { return await commitDrawing(sourceRecord, gesture, recipe, releaseTop, viewport, gesture.baseRecipe); }
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
    // A picture sized in lines keeps its lines through a move: its size follows the words wherever it lands.
    const lines = gesture.free ? occurrence.layout.lines : gesture.layout.lines;
    if (lines != null && value.width == null) value.lines = lines;
    // Carry `rotate` through a move, and the fade with it.
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

  if (!host || !geometry || !metadata) return Object.freeze({rotateGlyph, schedule() {}, close() {}, select() {}, restore() {},
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
    img[data-rapier-image-selected][data-rapier-drawing]{touch-action:none}
    img[data-rapier-image-selected][data-rapier-image-armed]{outline:2px dashed var(--color-accent);outline-offset:2px}
    .rapier-image-grip[data-rapier-covered],.rapier-image-move[data-rapier-covered],.rapier-image-rotate[data-rapier-covered]{visibility:hidden}
    .rapier-image-grip:focus-visible{outline:none}.rapier-image-grip:focus-visible::after{outline:2px solid currentColor;outline-offset:3px}
    .rapier-image-tools[data-moving]{visibility:hidden;pointer-events:none}
    .rapier-image-wrap[aria-pressed="true"]{color:var(--color-accent)}
    .rapier-image-lock[aria-pressed="true"] rect{fill:currentColor}
    img[data-rapier-image-layout*="lock%3Don"]{pointer-events:none}
    /* The placement row sits directly on top of the bar (its bottom edge is the bar's own top edge
       -- \`bottom:100%\` inside the bar's own fixed containing block), same background, same
       button grid (it reuses .rapier-image-tools__btn). The current placement reads as a filled,
       inverted pill, same rule as .rapier-draw-btn--mode[aria-pressed="true"]. */
    .rapier-image-wrap-row{position:absolute;left:0;right:0;bottom:100%;display:flex;align-items:stretch;justify-content:center;background:linear-gradient(var(--format-toolbar-bg),var(--format-toolbar-bg)),var(--color-bg)}
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
    /* The drawing's bar holds eleven controls: 10 x 56 + 72 = 632 px, so each step below keeps every control on the
       glass at the widths it names, the newest as wide as its neighbours. */
    @media(max-width:640px){.rapier-image-tools__btn{min-width:44px;padding-inline:10px}.rapier-image-tools__size{min-width:56px}}
    /* At phone width the un-narrowed bar overflows past 360px (nine buttons at 44px plus the size
       control) and clips its own leftmost button. Narrower still, uniform with the row above so
       its six icon buttons share the same grid. */
    @media(max-width:496px){.rapier-image-tools__btn{min-width:36px;padding-inline:6px}.rapier-image-tools__size{min-width:46px}}
    /* 10 x 33 + 44 = 374 px on a 390 px phone, down to 375; the 20 px icon sits centred in 33. */
    @media(max-width:405px){.rapier-image-tools__btn{min-width:33px;padding-inline:4px}.rapier-image-tools__size{min-width:44px}}
    /* The drawing's bar has eleven buttons: 10 x 31 + 42 = 352 px on a 360 px phone, and the 20 px icon still sits
       centred in 31 (picture-toolbar-fits-phone). */
    @media(max-width:374px){.rapier-image-tools__btn{min-width:31px;padding-inline:4px}.rapier-image-tools__size{min-width:42px}}
  `;
  document.head.append(sheet);
  // Typing re-renders one block's edit surface (child-list records, not only text). When no band
  // touches that block, it holds no picture and its height is what it was, no wrapper's box has moved
  // and the pass would lay the same lines again: measured on the welcome at CPU 4, 39 ms of every
  // 30 ms key (the whole document unprojected, measured, re-planned and its selection put back).
  // A wrapped paragraph, a block holding a picture, a second block, or a changed height still schedules.
  const typedHeights = new WeakMap();
  function typedBlock(records) {
    let wrapper = null;
    for (const record of records) {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      const edit = target?.closest?.('.block-edit');
      if (!edit) return null;
      const owner = edit.closest('#editor-blocks > .block-wrapper');
      if (!owner || (wrapper && wrapper !== owner)) return null;
      wrapper = owner;
    }
    return wrapper;
  }
  function wrappedBlock(wrapper) {
    if (wrapper.querySelector('[data-rapier-flow="true"]')) return true;
    for (const map of [floats, floatsRight]) for (const paragraph of map.keys()) if (wrapper.contains(paragraph)) return true;
    return false;
  }
  observer = new MutationObserver(records => {
    if (restoring) return;
    if (records.every(record => record.type === 'characterData' && record.target.parentElement?.closest('.block-edit'))) return;
    const typed = typedBlock(records);
    if (typed && !typed.querySelector('img[data-rapier-image-layout]')) {
      if (wrappedBlock(typed)) { replanWrapper = typed; schedule(); return; }
      const height = typed.offsetHeight;
      if (typedHeights.get(typed) === height) return;
      typedHeights.set(typed, height);
    }
    replanWrapper = null;
    schedule();
  });
  watch();

  new ResizeObserver(() => {
    const width = host.clientWidth, height = host.clientHeight;
    if (width !== lastWidth || height !== lastHeight) {
      if (lastWidth && width !== lastWidth && moving) { cancel(); showToast('The page changed width while the picture was held, so it went back where it was. Move it again.', 'info'); }
      // A width change can change a size the plans measured (a host may tie its unit to the width): they are measured again.
      if (width !== lastWidth) cache = new WeakMap();
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
    // A move's own frames follow the finger through a scroll (autoScroll's updatePointerBox); its pass waits for the rest.
    if (moving && !(moving.kind === 'move' && moving.shown)) schedule();
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
    // A caret moving inside a wrapped paragraph lays that paragraph again, as typing does, not the whole document.
    const anchor = selection?.anchorNode, element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const wrapper = element?.closest?.('#editor-blocks > .block-wrapper');
    if (wrapper && wrapper === element.closest('.block-wrapper--editing') && !wrapper.querySelector('img[data-rapier-image-layout]') &&
        wrappedBlock(wrapper) && !frame) replanWrapper = wrapper;
    schedule();
  });
  // The frame a compositionend creates for the whole pass is remembered, so the word's own landing (mirrorComposedText,
  // on the window after this) can cancel that one and no other.
  let composeFrame = 0;
  document.addEventListener('compositionend', () => { const pending = frame; schedule(); composeFrame = !pending && frame ? frame : 0; });
  for (const name of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(name, event => {
    if (event.isTrusted) userIntent++;
  }, {capture: true, passive: true});
  // Other taps close the row without preventDefault or stopPropagation.
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
    // Up to the picture's height above the first line; the block above does not reflow.
    const lines = moving.layout.lines != null ? ownerLines(owner) : null, top = owner.top + geometry.linesTop(moving.layout, lines);
    moving.layout.y = Number((clamp(y - top, -moving.box.height, owner.top + owner.height - top) / owner.em).toFixed(3));
    const box = geometry.imageBox(owner.width, Number(moving.image.dataset.rapierNaturalWidth) || moving.image.naturalWidth,
      Number(moving.image.dataset.rapierNaturalHeight) || moving.image.naturalHeight,
      moving.layout, moving.box.width, lines);
    if (box) moving.box = {x: owner.left + box.x, y: top + moving.layout.y * owner.em, width: box.width, height: box.height};
    showMove();
  }

  // A move shows the picture under the finger by a transform from where the last whole pass laid it, and lays the words again
  // when the finger rests and at release, as the turn does: a whole pass every frame cost 150 to 450 ms a frame at a phone's CPU
  // with the welcome's W or its diagram. A picture no pass has laid for this owner yet is laid now.
  function showMove() {
    const shown = moving?.shown;
    if (moving?.kind !== 'move' || !shown || shown.owner !== moving.owner || !moving.box) { schedule(); return; }
    style(moving.image, {transform: 'translate(' + (moving.box.x - shown.x) + 'px,' + (moving.box.y - shown.y) + 'px)' +
      (shown.rotate ? ' rotate(' + shown.rotate + 'deg)' : '')});
    positionGrip();
    clearTimeout(moving.restTimer);
    const gesture = moving;
    gesture.restTimer = setTimeout(() => { if (moving === gesture && !gesture.committing) schedule(); }, MOVE_REST_MS);
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
    if (moving.layout.lines == null) moving.layout.width = Number(clamp(moving.box.width / moving.column.width * 100, .01, 100).toFixed(2));

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
    // A picture sized in lines beside its words grows and shrinks a whole line at a time; elsewhere it takes a width.
    const lines = moving.layout.lines != null && owner ? ownerLines(owner) : null;
    if (lines) {
      // Never more lines than the column can hold at the picture's aspect: a stored N is drawn N lines tall.
      let count = clamp(Math.round((width * start.height / start.width - lines.cap) / lines.line) + 1, 1, 12);
      while (count > 1 && geometry.linesHeight(count, lines) * start.width / start.height > column.width) count--;
      const height = geometry.linesHeight(count, lines);
      if (count === moving.layout.lines && moving.box.height === height) { positionGrip(); return; }
      moving.layout.lines = count;
      moving.box.height = height;
      moving.box.width = Math.min(column.width, height * start.width / start.height);
    } else {
      if (!(percent > 0) || percent === moving.layout.width) { positionGrip(); return; }
      delete moving.layout.lines;
      moving.layout.width = percent;
      moving.box.width = column.width * percent / 100;
      moving.box.height = moving.box.width * start.height / start.width;
    }
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

  // Once per rested candidate: the base alpha is unrotated per 48x48 cell into the candidate view.
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
    // A drawing turns like a picture while the finger moves: CSS on the shown bytes and their outline turned, no
    // recipe, serialise or decode per frame (a phone's jank). The bytes are rebuilt when the finger rests.
    shownTurn(gesture);
    schedule();
    clearTimeout(gesture.restTimer);
    gesture.restTimer = setTimeout(() => {
      if (moving !== gesture || gesture.committing || gesture.angle !== angle) return;
      const edit = globalThis.RapierDrawEdit, recipe = edit ? edit.rotateDrawing(gesture.baseRecipe, angle) : gesture.baseRecipe;
      gesture.previewRecipe = recipe;
      refreshRotateCandidate(gesture, recipe, angle);
    }, ROTATE_REST_MS);
  }

  // The outline of the shown bytes, turned by what the finger added since those bytes were made.
  function shownTurn(gesture) {
    const image = gesture.image, w = Number(image.getAttribute('data-rapier-natural-width')) || image.naturalWidth;
    const h = Number(image.getAttribute('data-rapier-natural-height')) || image.naturalHeight, delta = (gesture.angle || 0) - gesture.shownAngle;
    gesture.previewProfile = gesture.shownProfile && Math.abs(delta) > 1e-6 ? geometry.rotatedRasterAlpha(gesture.shownProfile, w, h, delta) || gesture.shownProfile : gesture.shownProfile;
  }

  // One recompute per animation frame; listeners only set moving.drag.
  function scheduleRotatePreview() {
    if (rotateFrame) return;
    rotateFrame = requestAnimationFrame(() => { rotateFrame = 0; rotatePreview(); });
  }

  // Never a second serialize+decode in flight; superseded recipes are dropped before the writer.
  function refreshRotateCandidate(gesture, recipe, angle) {
    gesture.pendingRecipe = recipe; gesture.pendingAngle = angle;
    if (!gesture.candidateBusy) drainRotateCandidate(gesture);
  }

  function drainRotateCandidate(gesture) {
    const recipe = gesture.pendingRecipe, angle = gesture.pendingAngle;
    gesture.pendingRecipe = null;
    if (!recipe || moving !== gesture || gesture.committing) return;
    const candidate = rotateCandidate(recipe);
    if (!candidate) return;
    gesture.candidateBusy = true;
    adoptRotateCandidate(gesture, candidate.svg, candidate.view, () => {
      // A painting's or a letter's ink is the base alpha turned into the candidate's view; shapes outline themselves.
      const glyphs = gesture.baseAlpha && rotatedAlpha(gesture, candidate.view, angle);
      gesture.shownAngle = angle; gesture.shownProfile = glyphs && typeof _rapierDrawShapeProfileFor === 'function' ? _rapierDrawShapeProfileFor({...recipe, view: candidate.view}, glyphs) : candidate.profile;
      shownTurn(gesture);
    }, () => {
      gesture.candidateBusy = false;
      drainRotateCandidate(gesture);
    });
  }

  // Decode before adopting; candidateToken orders frames. src and natural size move together. onSettled always runs; every object URL revoked once.
  function adoptRotateCandidate(gesture, svg, view, onAdopted, onSettled) {
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
        onAdopted();
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
    // A drag on a shape ends the words being edited: words that changed are written first and this drag stands down
    // (the next one moves the box); unchanged words just close, and the drag goes on.
    if (moving.kind === 'shape' && fieldOpen) {
      if (fieldOpen.input.value !== fieldOpen.value) { cancel(); void applyShapeField(); return; }
      closeShapeField();
    }
    if (moving.kind === 'rotate') { scheduleRotatePreview(); return; }
    if (moving.kind === 'shape') { scheduleShapePreview(); return; }
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

  // 500 ms, Android's long press. A vertical drag releases only while this timer is pending, and 260 ms catches ordinary scrolls.
  // Draw's RAPIER_DRAW_HOLD_MS stays 260: its surface is touch-action none. Do not unify; re-run picture-hold-not-pause.
  const HOLD_TO_MOVE = 500, HOLD_SLOP = 8;
  // Coarse pointer threshold after the hold: 4px is a mouse's.
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
    // A second finger calls off the first one's unfinished move, resize, turn or box drag: nothing of it is written, as on Draw's canvas.
    if (event.isTrusted && event.isPrimary === false && moving?.pointer != null && !moving.committing) { cancel(); return; }
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
      const behind = behindPictureAt(event.clientX, event.clientY, true);
      if (behind) {
        hold = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, behind, timer: setTimeout(() => {
          if (!hold || hold.pointerId !== event.pointerId) return;
          const held = hold; hold = null;
          takeBehind(held, event);
        }, HOLD_TO_MOVE)};
        return;
      }
    }
    // A box of a selected drawing: the finger takes the box in any direction, no hold; a tap opens its words.
    if (!handle && event.target === selected && !armed && !moving) {
      const hit = boxAt(selected, event.clientX, event.clientY);
      if (hit) {
        if (fieldOpen) fieldOpen.pressing = true;
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.pointerType !== 'touch' && document.activeElement !== host && document.activeElement !== selected) host.focus({preventScroll: true});
        startShape(event, hit);
        return;
      }
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
      if (moving.kind === 'shape' && rotateFrame) { cancelAnimationFrame(rotateFrame); rotateFrame = 0; shapePreview(); }
    }
    const commit = moving?.drag?.moved;
    if (moving.kind === 'shape' && !commit) {
      // A tap on a box: its words, or its step number, open where they stand.
      const hit = moving.hit, prepared = moving.prepared; pointerClick = event.pointerId; cancel();
      // A tap away from the words being edited writes them; a tap on a box with none open opens its words.
      if (fieldOpen && !fieldOpen.step && hit && !hit.step && hit.shape.id === fieldOpen.shapeId) { fieldOpen.pressing = false; placeCaretAt(fieldOpen, event.clientX, event.clientY); return; }
      if (fieldOpen) void applyShapeField(); else if (hit) openShapeField(hit, prepared);
      return;
    }
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
    // silent: a picture that goes back says why.
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
    const erase = (event.key === 'Backspace' || event.key === 'Delete') && !moving && !event.ctrlKey && !event.metaKey && !event.altKey;

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
      const owner = moving.layout.lines != null && moving.owner ? measureOwner() : null;
      const lines = owner && (ownerLines(owner));
      // In lines, a key is a line.
      const height = lines && geometry.linesHeight(clamp(moving.layout.lines + direction * (reverse ? -1 : 1), 1, 12), lines);
      resizeTo(height ? height * moving.start.width / moving.start.height : moving.box.width + step * direction * (reverse ? -1 : 1));
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
  let reprojectAfterInput = null, reprojectHeight = null, insertInProjection = null;
  window.addEventListener('beforeinput', event => {
    reprojectAfterInput = null; reprojectHeight = null; insertInProjection = null;
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
    insertInProjection = projectedInsert(event, record, selection);
    if (insertInProjection) { reprojectAfterInput = record.wrapper; return; }
    reprojectHeight = rect(record.wrapper).height;
    reprojectAfterInput = unproject(record.wrapper) ? record.wrapper : null;
  }, true);

  window.addEventListener('input', event => {
    if (!reprojectAfterInput) return;
    const wrapper = reprojectAfterInput, wasHeight = reprojectHeight, pending = insertInProjection;
    reprojectAfterInput = null; reprojectHeight = null; insertInProjection = null;
    if (pending) {
      if (retainProjectedInsert(pending, event)) return;
      // A different native mutation still belongs to the person. Read it back before mapping the caret for fallback.
      settleComposition(pending.record.paragraph, pending.record);
    }
    // The paragraph's own lines first (its picture has not moved); the whole pass when its height changed.
    if (!_rapierHostNativeField(event.target) && !rapier.composition.block && !replan(wrapper, wasHeight)) layoutNow(wrapper);
  }, true);

  // Restore a replacing selection before the edit surface snapshots it and native IME can remove whole projected fragments.
  window.addEventListener('compositionstart', event => {
    if (!event.isTrusted || event.defaultPrevented || rapier.composition.block ||
        !host.contains(event.target) || _rapierHostNativeField(event.target)) return;
    if (hasSelection() && projections.size) restoreSelection();
  }, true);

  // The wrapper's height when a composition begins, so the word's landing knows whether the paragraph grew.
  let composeWrapper = null, composeHeight = null;
  window.addEventListener('compositionstart', event => {
    composeWrapper = null; composeHeight = null;
    if (_rapierHostNativeField(event.target) || !projections.size) return;
    const selection = window.getSelection();
    const text = selection?.rangeCount ? selection.anchorNode : null;
    const record = text?.nodeType === Node.TEXT_NODE ? endpoints.get(text)?.record : null;
    if (record?.wrapper?.isConnected) { composeWrapper = record.wrapper; composeHeight = rect(record.wrapper).height; }
  });
  window.addEventListener('compositionend', event => {
    const wrapper = composeWrapper, height = composeHeight;
    composeWrapper = null; composeHeight = null;
    if (_rapierHostNativeField(event.target) || !projections.size) return;
    const selection = window.getSelection();
    const text = selection?.rangeCount ? selection.anchorNode : null;
    if (!text || text.nodeType !== Node.TEXT_NODE) return;
    const mapping = endpoints.get(text);
    const record = mapping?.record;
    if (!mapping || !record || record.paragraph?.dataset.rapierFlow !== 'true' ||
        !record.wrapper.classList.contains('block-wrapper--editing')) return;
    mirrorComposedText(record, text, mapping, record.wrapper === wrapper ? height : null);
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
  return Object.freeze({rotateGlyph, schedule, layoutNow, select, close, activation, restoreSelection, restore, heldWrappers, mappedPoint, sourcePoint, textOffset, invalidate, pinSettled,
    remove, armSettle, settleNow, unproject, editSource, livePoint, setWrapShape, splitPlan, behindPictureAt, paragraphStyle, caretBand,
    status: () => ({moving: !!moving && !moving.committing, committing: !!moving?.committing, settling: !!settle || !!moving?.committing || performance.now() - settledAt < 400, projections: projections.size, images: lastObstacles.length, rotatePerf: {...rotatePerf}})});
})();
globalThis.RapierImageFlow = _rapierImageFlow;
