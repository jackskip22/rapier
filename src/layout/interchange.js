// SPDX-License-Identifier: AGPL-3.0-only

function _rapierProjectArtifactLayout(root, metadata, geometry, pretext) {
  if (!root || !metadata || !geometry || !pretext) return null;
  const doc = root.ownerDocument, view = doc.defaultView;
  const styles = new Map(), originals = new Map(), spacers = [], floats = [], profiles = new WeakMap();
  const css = node => view.getComputedStyle(node);
  const box = node => node.getBoundingClientRect();
  const pixels = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0) + 'px';
  let scheduled = 0, busy = false, stopped = false, printing = false, lastWidth = -1;

  function style(node, values) {
    if (!styles.has(node)) styles.set(node, node.getAttribute('style'));
    for (const [key, value] of Object.entries(values)) node.style.setProperty(key, value);
  }

  function restore() {
    for (const [paragraph, nodes] of originals) paragraph.replaceChildren(...nodes);
    originals.clear();
    for (const [node, value] of styles) {
      if (value === null) node.removeAttribute('style');
      else node.setAttribute('style', value);
    }
    styles.clear();
    for (const spacer of spacers) spacer.remove();
    spacers.length = 0;
    for (const float of floats) float.remove();
    floats.length = 0;
  }

  // Participation, not ownership (as browser.js wrapParticipant): unreadable blocks, lists, quotes and details float; tables, code, rules, figures, math clearTo.
  function prepare(paragraph) {
    if (!/^(P|H[1-6])$/.test(paragraph.tagName) || !paragraph.textContent.trim() || paragraph.textContent.length > 8192 ||
        paragraph.querySelector('img,svg,math,br,input,button,iframe,canvas,.math-rendered')) return null;
    const computed = css(paragraph);
    if (computed.textAlign === 'justify' || computed.writingMode !== 'horizontal-tb' ||
        computed.textTransform !== 'none' || computed.whiteSpace !== 'normal' || computed.transform !== 'none' ||
        // Lines start at the padding box's top-left: left, right or top inset is refused.
        ['paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth']
          .some(key => parseFloat(computed[key]) > 0)) return null;
    const runs = [], items = [], walker = doc.createTreeWalker(paragraph, 4);
    for (let node; (node = walker.nextNode());) {
      if (runs.length === 192) return null;
      const parents = [];
      for (let parent = node.parentElement; parent !== paragraph; parent = parent.parentElement) {
        if (!parent || !/^(A|SPAN|EM|I|STRONG|B|DEL|S|MARK|CODE|U|INS|ABBR|SUP|SUB)$/.test(parent.tagName)) return null;
        parents.unshift(parent);
      }
      const computedRun = css(node.parentElement);
      if (computedRun.textTransform !== 'none' || computedRun.writingMode !== 'horizontal-tb') return null;
      const font = `${computedRun.fontStyle} ${computedRun.fontWeight} ${computedRun.fontSize} ${computedRun.fontFamily}`;
      const letterSpacing = parseFloat(computedRun.letterSpacing) || 0;
      const prepared = geometry.prepareRun(node.data, font, letterSpacing);
      if (!prepared) return null;
      const atomic = parents.some(parent => parent.tagName === 'CODE');
      const extraWidth = atomic ? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
        .reduce((width, key) => width + (parseFloat(computedRun[key]) || 0), 0) : 0;
      runs.push({parents, prepared, directions: parents.map(parent => parent.getAttribute('dir') === 'auto' ? css(parent).direction : null)});
      items.push({text: prepared.raw, font, letterSpacing, break: atomic ? 'never' : 'normal', extraWidth});
    }
    if (!runs.length) return null;
    const fontSize = parseFloat(computed.fontSize) || 16;
    return {paragraph, runs, flow: pretext.prepareRichInline(items), direction: computed.direction,
      align: computed.textAlign, fontSize, lineHeight: parseFloat(computed.lineHeight) || fontSize * 1.65,
      balance: computed.textWrapStyle === 'balance' ? fontSize : 0};
  }

  // An id survives on the first fragment only.
  const idsKept = new WeakSet();
  function fragmentNode(record, fragment) {
    const run = record.runs[fragment.itemIndex], mapped = geometry.mapFragment(run?.prepared, fragment);
    if (!mapped) return null;
    let child = doc.createTextNode(mapped.text);
    for (let index = run.parents.length - 1; index >= 0; index--) {
      const shell = run.parents[index].cloneNode(false);
      if (shell.id) { if (idsKept.has(run.parents[index])) shell.removeAttribute('id'); else idsKept.add(run.parents[index]); }
      if (run.directions[index]) shell.setAttribute('dir', run.directions[index]);
      shell.append(child); child = shell;
    }
    return child;
  }

  function project(record, width, top, obstacles) {
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      metadata.wrapColumnFloor(record.fontSize), record.direction, record.balance);
    if (!plan) return false;
    const output = doc.createDocumentFragment();
    let previous = null;
    for (const line of plan.lines) {
      const element = doc.createElement('span');
      element.style.cssText = `display:block;position:absolute;left:${pixels(line.x)};top:${pixels(line.y)};width:${pixels(line.width)};height:${pixels(record.lineHeight)};white-space:pre;direction:${record.direction}`;
      element.style.textAlign = ['left', 'center', 'right', 'start', 'end'].includes(record.align)
        ? record.align : record.direction === 'rtl' ? 'right' : 'left';
      for (const fragment of line.fragments) {
        const child = fragmentNode(record, fragment);
        if (!child) return false;
        if (hasGap(record, previous, fragment)) {
          const gap = doc.createElement('span');
          gap.style.cssText = 'display:inline-block;width:' + pixels(fragment.gapBefore);
          gap.textContent = ' '; element.append(gap);
        }
        element.append(child); previous = fragment;
      }
      output.append(element);
    }
    originals.set(record.paragraph, [...record.paragraph.childNodes]);
    record.paragraph.replaceChildren(output);
    style(record.paragraph, {position: 'relative', height: pixels(plan.height), 'min-height': '0'});
    return true;
  }

  function hasGap(record, previous, current) {
    if (!previous) return false;
    let found = false;
    for (let index = previous.itemIndex; index <= current.itemIndex; index++) {
      const run = record.runs[index].prepared;
      const start = index === previous.itemIndex ? geometry.cursorOffset(run, previous.end) : 0;
      const end = index === current.itemIndex ? geometry.cursorOffset(run, current.start) : run.raw.length;
      if (start == null || end == null || end < start) return false;
      const gap = run.raw.slice(start, end);
      if (gap && !/^[ \t\n\r\f]+$/.test(gap)) return false;
      found ||= !!gap;
    }
    return found;
  }

  // wrap=around reads data-rapier-occupancy, else alpha. Cache key: src, dimensions, layout.wrap, rotate angle.
  // A turned raster's profile is recomputed here as pictureProfile does, never shipped.
  function profile(image, layout) {
    const src = image.currentSrc || image.getAttribute('src') || '', rotateRad = (layout.rotate || 0) * Math.PI / 180;
    const cached = profiles.get(image);
    if (cached?.src === src && cached.width === image.naturalWidth && cached.height === image.naturalHeight &&
        cached.wrap === layout.wrap && cached.angle === rotateRad) return cached.profile;
    let value;
    if (layout.wrap === 'box') {
      value = boxProfile(image);
      if (!value && rotateRad) value = geometry.rasterTiltProfile(image.naturalWidth, image.naturalHeight, rotateRad);
    } else {
      const occupancy = typeof geometry.parseProfile === 'function' && geometry.parseProfile(image.getAttribute('data-rapier-occupancy'));
      value = occupancy || geometry.alphaProfile(image);
      if (!occupancy && rotateRad && value) value = geometry.rotatedRasterAlpha(value, image.naturalWidth, image.naturalHeight, rotateRad) || value;
    }
    profiles.set(image, {src, width: image.naturalWidth, height: image.naturalHeight, wrap: layout.wrap, angle: rotateRad, profile: value});
    return value;
  }

  // wrap=box reads data-rapier-box-polygon; this page never parses a recipe or bundles Draw. No polygon: whole rectangle.
  function boxProfile(image) {
    const raw = image.getAttribute('data-rapier-box-polygon');
    if (!raw) return null;
    const numbers = raw.trim().split(/\s+/).map(Number);
    if (numbers.length < 6 || numbers.length % 2 || numbers.some(value => !Number.isFinite(value))) return null;
    const corners = [];
    for (let index = 0; index < numbers.length; index += 2) corners.push([numbers[index], numbers[index + 1]]);
    return geometry.polygonProfile(corners);
  }

  // F75-11: as the live editor (browser.js).
  function syncInlineRotatedPictures(exclude) {
    for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
      if (exclude.has(image) || !image.complete || !image.naturalWidth || !image.naturalHeight) continue;
      const layout = metadata.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
      if (!layout?.rotate || ['around', 'box', 'behind', 'front'].includes(layout.wrap)) continue;
      const width = image.offsetWidth, height = image.offsetHeight;
      if (!(width > 0 && height > 0)) continue;
      const paragraph = image.closest('p');
      // geometry.imageOnly (layout/model.mjs).
      const alone = !!paragraph && imageOnly(paragraph, image);
      const baseLeft = parseFloat(css(image).marginLeft) || 0;
      const rotated = geometry.rotatedBoundsRad(width, height, layout.rotate * Math.PI / 180);
      const dx = (rotated.width - width) / 2, dy = (rotated.height - height) / 2;
      const values = {transform: `rotate(${layout.rotate}deg)`, 'transform-origin': '50% 50%',
        'margin-left': pixels(baseLeft + dx), 'margin-right': pixels(dx)};
      if (alone) { values.display = 'block'; values['margin-top'] = pixels(dy); values['margin-bottom'] = pixels(dy); }
      style(image, values);
    }
  }

  // Nothing is ever inserted between a picture and its words: a reader and the witnesses read nextElementSibling.
  function clearTo(element, bottom, origin, before = element) {
    const distance = bottom - (box(element).top - origin);
    if (distance <= 0) return;
    const spacer = doc.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.cssText = 'height:' + pixels(distance) + ';clear:both;';
    before.before(spacer); spacers.push(spacer);
  }

  const imageOnly = geometry.imageOnly;

  function neighbourKind(element) {
    if (element.tagName === 'P' && element.textContent.trim() && !element.querySelector('img')) return 'prose';
    const image = element.tagName === 'P' ? element.querySelector('img') : null;
    if (image && imageOnly(element, image)) return 'picture';
    // An empty paragraph is transparent to the owner search, as in the editor (R75).
    if (element.tagName === 'P' && !element.textContent.trim() && !image) return 'metadata';
    return null;
  }

  // Float fallback as the editor's floatAround.
  const FLOAT_BLOCK = /^(P|H[1-6]|UL|OL|BLOCKQUOTE|DETAILS|DL)$/;
  function floatAround(element, width, height, top, obstacles) {
    if (!FLOAT_BLOCK.test(element.tagName) || element.querySelector('table, pre, figure, img, .math-rendered')) return false;
    const bottom = top + height;
    const inside = obstacles.filter(obstacle => obstacle.y < bottom + 4096 && obstacle.y + obstacle.height > top &&
      obstacle.x < width && obstacle.x + obstacle.width > 0);
    if (!inside.length) return false;
    // layout/model.mjs wrapShape; `geometry` is modules["layout/model.mjs"].
    const shapeFor = side => {
      const shape = geometry.wrapShape(side, inside, width, top);
      if (!shape) return null;
      return {...shape, shape: 'polygon(' + shape.points.map(point => pixels(point[0]) + ' ' + pixels(point[1])).join(',') + ') border-box'};
    };
    const shapes = {left: shapeFor('left'), right: shapeFor('right')};
    const spent = (shapes.left?.boxWidth || 0) + (shapes.right?.boxWidth || 0);
    if (!spent || spent > width - metadata.wrapColumnFloor(parseFloat(css(element).fontSize) || 16)) return false;
    const placed = [];
    for (const side of ['left', 'right']) {
      const shape = shapes[side];
      if (!shape) continue;
      const float = doc.createElement('span');
      float.setAttribute('aria-hidden', 'true');
      float.style.cssText = `float:${side};width:${pixels(shape.boxWidth)};height:${pixels(shape.boxHeight)};margin-top:${pixels(shape.startY)};shape-outside:${shape.shape};pointer-events:none`;
      element.prepend(float); floats.push(float); placed.push([float, shape]);
    }
    // The block contains its floats and each float ends at the block's own content bottom, so
    // successive blocks' floats never stack side by side (the same bound the editor applies).
    style(element, {display: 'flow-root'});
    const contentBottom = () => {
      let first = element.firstChild;
      while (first && placed.some(([float]) => float === first)) first = first.nextSibling;
      if (!first || !element.lastChild) return box(element).height;
      const range = doc.createRange(); range.setStartBefore(first); range.setEndAfter(element.lastChild);
      return range.getBoundingClientRect().bottom - box(element).top;
    };
    for (let pass = 0; pass < 4; pass++) {
      const content = contentBottom();
      let changed = false;
      for (const [float, shape] of placed) {
        const bounded = Math.max(0, Math.min(shape.boxHeight, content - shape.startY));
        if (Math.abs((parseFloat(float.style.height) || 0) - bounded) > 0.5) { float.style.height = pixels(bounded); changed = true; }
      }
      if (!changed) break;
    }
    return true;
  }

  function reflow() {
    if (stopped || busy) return;
    busy = true;
    try {
      restore();

      if (!root.isConnected || printing || view.matchMedia?.('print').matches) return;
      const children = [...root.children];
      if (children.length > 8192) return;
      // behind/front collapse and place like around/box but are never obstacles.
      const outOfFlow = value => value?.wrap === 'behind' || value?.wrap === 'front';
      const origin = box(root).top, obstacles = [], anchors = new Map(), wrapped = new Set(), placed = [], positionedImages = new Set();
      for (const element of children) {
        const layout = metadata.parseLayoutAttribute(element.getAttribute('data-md-layout'));
        const image = ['around', 'box', 'behind', 'front'].includes(layout?.wrap) && element.tagName === 'P'
          ? element.querySelector('img[data-rapier-image-layout]') : null;
        if (!image?.complete || !image.naturalWidth || !image.naturalHeight || !imageOnly(element, image)) continue;

        const owner = metadata.wrapNeighbour(element, neighbourKind);
        const computed = owner && css(owner);
        if (!owner || computed.writingMode !== 'horizontal-tb' || computed.transform !== 'none') continue;
        if (wrapped.size === 1024) { restore(); return; }
        const records = anchors.get(owner) || [];
        records.push({element, image, layout, width: box(image).width}); anchors.set(owner, records); wrapped.add(element); positionedImages.add(image);
        style(element, {position: 'relative', height: '0', 'min-height': '0', 'margin-top': '0', 'margin-bottom': '0', 'padding-top': '0', 'padding-bottom': '0', 'line-height': '0'});
        style(image, {position: 'absolute', margin: '0'});
      }
      // As the live editor.
      syncInlineRotatedPictures(positionedImages);
      for (const element of children) {
        if (wrapped.has(element)) continue;
        // `let`: a pushed picture moves its owner and every later element.
        let bounds = box(element);
        if (!bounds.width || !bounds.height) continue;
        const computed = css(element), inset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
        const width = bounds.width - inset - (parseFloat(computed.paddingRight) || 0) - (parseFloat(computed.borderRightWidth) || 0);

        let ownerLed = false;
        for (const {element: source, image, layout, width: imageWidth} of anchors.get(element) || []) {
          const unrotated = geometry.imageBox(width, image.naturalWidth, image.naturalHeight, layout, imageWidth);
          if (!unrotated) { restore(); return; }
          // rasterReserved (layout/model.mjs).
          const rasterRad = (layout.rotate || 0) * Math.PI / 180;
          const fit = geometry.rasterReserved(width, unrotated, rasterRad);
          if (!fit) { restore(); return; }
          const rectangle = fit.reserved, visualDeltaX = fit.visualDeltaX, visualDeltaY = fit.visualDeltaY;
          const left = bounds.left + inset + rectangle.x;
          const em = parseFloat(computed.fontSize) || 16;
          const topInset = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.borderTopWidth) || 0);
          const height = Math.max(0, bounds.height - topInset - (parseFloat(computed.paddingBottom) || 0) - (parseFloat(computed.borderBottomWidth) || 0));
          let y = bounds.top - origin + topInset + Math.min(layout.y || 0, height / em) * em;
          if (!outOfFlow(layout)) {
            for (const obstacle of [...obstacles].sort((left, right) => left.y - right.y)) {
              if (obstacle.x < left + rectangle.width + 10 && obstacle.x + obstacle.width > left - 10 &&
                  obstacle.y + obstacle.height > y - 10 && obstacle.y < y + rectangle.height + 10)
                y = obstacle.y + obstacle.height + 10;
            }
            // R87k: a picture pushed down by an earlier one takes its owner with it. A deliberate `y` stays; only the collision push moves the paragraph.
            const ownerTop = bounds.top - origin + topInset + Math.min(layout.y || 0, height / em) * em;
            // Only the first picture of an owner takes it down.
            if (!ownerLed && y > ownerTop + 0.5) {
              clearTo(element, (bounds.top - origin) + (y - ownerTop), origin, source);
              bounds = box(element);
            }
            ownerLed = true;
            obstacles.push(...geometry.pictureSlices(profile(image, layout), left, y, rectangle.width, rectangle.height));
          }
          placed.push({source, image, rectangle, left, y, wrap: layout.wrap,
            visualLeft: left + visualDeltaX, visualTop: y + visualDeltaY, visualWidth: fit.fit.width, visualHeight: fit.fit.height,
            rotateDeg: layout.rotate || 0});
        }
        const top = bounds.top - origin, active = obstacles.filter(obstacle => obstacle.y + obstacle.height > top);
        if (active.length) {
          const own = active.map(obstacle => ({...obstacle, x: obstacle.x - bounds.left - inset}));
          const prepared = prepare(element);
          if (!(prepared && width > 0 && project(prepared, width, top, own)) && !(width > 0 && floatAround(element, width, bounds.height, top, own))) {
            const overlapping = active.filter(obstacle => obstacle.y < top + bounds.height);
            if (overlapping.length) clearTo(element, Math.max(...overlapping.map(obstacle => obstacle.y + obstacle.height)), origin);
          }
        }
      }
      for (const {source, image, rectangle, left, y, wrap, visualLeft, visualTop, visualWidth, visualHeight, rotateDeg} of placed) {
        const anchor = box(source);
        style(image, {position: 'absolute', left: pixels((visualLeft ?? left) - anchor.left), top: pixels((visualTop ?? y) - (anchor.top - origin)),
          width: pixels(visualWidth ?? rectangle.width), height: pixels(visualHeight ?? rectangle.height), 'max-width': 'none', margin: '0',
          transform: rotateDeg ? `rotate(${rotateDeg}deg)` : 'none', 'transform-origin': '50% 50%',
          // As the live editor.
          ...(wrap === 'behind' ? {'z-index': '-1'} : {})});
      }
      if (obstacles.length) {
        const end = Math.max(...obstacles.map(obstacle => obstacle.y + obstacle.height));
        const bottom = box(root).bottom - origin - (parseFloat(css(root).paddingBottom) || 0);
        if (end > bottom) {
          const tail = doc.createElement('div');
          tail.setAttribute('aria-hidden', 'true'); tail.style.height = pixels(end - bottom);
          root.append(tail); spacers.push(tail);
        }
      }
    } catch (_) { restore(); }
    finally { busy = false; }
  }

  function schedule() {
    if (scheduled || stopped) return;
    scheduled = view.requestAnimationFrame(() => { scheduled = 0; reflow(); });
  }

  function beforePrint() { printing = true; restore(); }
  function afterPrint() { printing = false; schedule(); }

  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => {
    const width = root.clientWidth;
    if (width !== lastWidth) { lastWidth = width; schedule(); }
  }) : null;
  observer?.observe(root);
  root.addEventListener('load', schedule, true);
  root.addEventListener('error', schedule, true);
  view.addEventListener('resize', schedule);
  view.addEventListener('pageshow', schedule);
  view.addEventListener('beforeprint', beforePrint);
  view.addEventListener('afterprint', afterPrint);
  doc.fonts?.addEventListener?.('loadingdone', schedule);
  Promise.resolve(doc.fonts?.ready).then(schedule, schedule);
  schedule();
  return Object.freeze({reflow, destroy() {
    stopped = true;
    if (scheduled) view.cancelAnimationFrame(scheduled);
    observer?.disconnect(); restore();
    root.removeEventListener('load', schedule, true);
    root.removeEventListener('error', schedule, true);
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pageshow', schedule);
    view.removeEventListener('beforeprint', beforePrint);
    view.removeEventListener('afterprint', afterPrint);
    doc.fonts?.removeEventListener?.('loadingdone', schedule);
  }});
}

function _rapierArtifactLayoutScript(root, nonce = '') {
  const dependencies = globalThis.RapierArtifactLayoutDependencies;
  // Every wrap value earns the reflow script, and an inline turned raster (keyed off data-rapier-image-layout).
  const layoutOf = element => globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'));
  const pictureLayoutOf = image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
  if (!dependencies?.factories ||
      (![...root.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'box', 'behind', 'front'].includes(layoutOf(element)?.wrap)) &&
       ![...root.querySelectorAll('img[data-rapier-image-layout]')].some(image => pictureLayoutOf(image)?.rotate))) return '';
  const modules = Object.entries(dependencies.factories).map(([path, factory]) =>
    'modules[' + JSON.stringify(path) + '] = (' + Function.prototype.toString.call(factory) + ')();').join('\n');
  const script = '/* Rapier export layout: SPDX-License-Identifier: AGPL-3.0-only */\n' +
    '/* Pretext 0.0.9\n' + dependencies.license + '\n*/\n' +
    '(() => {\nconst modules = {};\n' + modules + '\n(' + _rapierProjectArtifactLayout.toString() +
    ')(document.querySelector("main.rapier-page"), modules["spec/md-layout.mjs"], modules["layout/model.mjs"], modules["agent/vendor/pretext/rich-inline.js"]);\n})();';

  return '<script' + (nonce ? ' nonce="' + nonce + '"' : '') + '>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>';
}
