// SPDX-License-Identifier: AGPL-3.0-only
// Drawing changes are views of the source ledger. A ghost never enters a recipe or saved SVG.
globalThis.RapierChangesDraw = (() => {
  let ghost = null, liveCache = null;
  const groupKey = act => JSON.stringify([act.actor.kind, act.actor.id, act.turnId || null, act.turnId ? null : act.id]);
  const failure = reason => Object.assign(new Error(reason), {code: reason});
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
    return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
  }
  function readDrawing(url, cache) {
    if (!/^data:image\/svg\+xml;base64,/i.test(url || '')) return null;
    if (cache.has(url)) return cache.get(url);
    const assets = globalThis.RapierImageAssets, core = globalThis.RapierDrawCore;
    let drawing = null;
    try {
      const text = new TextDecoder().decode(assets.decodeDataImage(url));
      const recipe = core._rapierDrawReadRecipeFromSVGText(text);
      if (recipe) {
        let viewBox = null;
        assets.svgElements(text, {inspect: false, visit(node) {
          if (node.parentId || node.local !== 'svg') return;
          const values = node.attributes.get('viewBox')?.value.trim().split(/[\s,]+/).map(Number);
          if (values?.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) viewBox = values;
        }});
        if (!viewBox) {
          const box = core._rapierDrawInkView(recipe);
          if (box) viewBox = [box.x, box.y, box.w, box.h];
        }
        drawing = {recipe, viewBox, url};
      }
    } catch (_) {}
    cache.set(url, drawing);
    return drawing;
  }
  function drawingsIn(source, cache) {
    const assets = globalThis.RapierImageAssets, index = assets.documentAssets(source), parser = assets.markdownParser();
    const offset = assets.markdownBodyOffset(source), body = source.slice(offset, index.appendixStart);
    if (!body.includes('![')) return [];
    const tokens = parser.parse(body, {references: Object.assign(Object.create(null), index.references)});
    return _rapierScanMarkdownImages(body, tokens).flatMap(image => {
      const drawing = readDrawing(image.destination, cache);
      if (!drawing) return [];
      const start = offset + image.start, end = offset + (image.tokenEnd ?? image.end);
      const asset = image.reference || '', definition = asset && index.assets.get(assets.normalizeLabel(asset));
      return [{...drawing, start, end, raw: source.slice(start, end), asset,
        definition: definition ? {start: definition.start, end: definition.end} : null}];
    });
  }
  function changedShapes(before, after) {
    const oldShapes = before?.shapes || [], newShapes = after?.shapes || [];
    const prior = new Map(oldShapes.map(shape => [shape.id, shape])), next = new Map(newShapes.map(shape => [shape.id, shape]));
    const all = [...new Set([...prior.keys(), ...next.keys()])];
    const inherited = before && after && ['smooth', 'nib', 'angle', 'light', 'paper', 'background', 'effect', 'fonts'].some(key => !same(before[key], after[key]));
    const strokes = before && after && !same(before.strokes, after.strokes);
    const changed = all.filter(id => !same(prior.get(id), next.get(id)) || inherited ||
      strokes && (prior.get(id)?.stroke != null || next.get(id)?.stroke != null));
    if (!changed.length && (!!before !== !!after || before && after && (inherited || !same(before.canvas, after.canvas) || !same(before.frame, after.frame) ||
      !same(oldShapes.map(shape => shape.id), newShapes.map(shape => shape.id))))) changed.push(null);
    return changed;
  }
  function bodyChanged(previous, splices, source) {
    const ledger = globalThis.RapierLedger;
    if (previous.some(row => !ledger.transportInterval(row.start, row.end, splices) ||
      row.definition && !ledger.transportInterval(row.definition.start, row.definition.end, splices))) return true;
    // Only plain word edits on a line without Markdown delimiters take the cheap path.
    // Indenting a picture or changing an HTML tag can change whether it is an image.
    if (splices.length !== 1 || !/^[\p{L}\p{N}]*$/u.test(splices[0].removed) || !/^[\p{L}\p{N}]*$/u.test(splices[0].inserted)) return true;
    const row = splices[0], start = Math.max(source.lastIndexOf('\n', row.pos - 1), source.lastIndexOf('\r', row.pos - 1)) + 1;
    const end = source.indexOf('\n', row.pos + row.removed.length);
    return /[\[\]!<>()`~\\\r]/.test(source.slice(start, end < 0 ? source.length : end));
  }
  function pairDrawings(previous, following, splices) {
    const ledger = globalThis.RapierLedger, assets = globalThis.RapierImageAssets;
    const available = new Set(following), paired = new Map();
    const pair = (before, after) => {paired.set(before, after); available.delete(after);};
    for (const before of previous) {
      const moved = ledger.transportInterval(before.start, before.end, splices);
      const exact = moved && [...available].find(after => after.start === moved.start && after.end === moved.end && after.raw === before.raw);
      if (exact) pair(before, exact);
    }
    // A renamed reference can be the complete replaced token. Only an exact transported
    // extent, or a unique association in both directions, may join its two versions.
    for (const before of previous.filter(row => !paired.has(row))) {
      const moved = ledger.transportTouchedInterval(before.start, before.end, splices);
      const exact = [...available].filter(after => after.start === moved.start && after.end === moved.end);
      if (exact.length === 1 && previous.filter(row => !paired.has(row)).filter(row => {
        const other = ledger.transportTouchedInterval(row.start, row.end, splices);
        return other.start === moved.start && other.end === moved.end;
      }).length === 1) pair(before, exact[0]);
    }
    const withinReplacement = (before, after) => {
      const moved = ledger.transportTouchedInterval(before.start, before.end, splices);
      return moved.start <= after.start && after.end <= moved.end;
    };
    const unique = related => {
      for (const before of previous.filter(row => !paired.has(row))) {
        const candidates = [...available].filter(after => withinReplacement(before, after) && related(before, after));
        if (candidates.length === 1 && previous.filter(row => !paired.has(row) && withinReplacement(row, candidates[0]) && related(row, candidates[0])).length === 1) pair(before, candidates[0]);
      }
    };
    // Shape IDs are local to a drawing. An unambiguous asset association takes
    // precedence over a coincidentally shared shape name in another picture.
    unique((before, after) => before.asset && after.asset && assets.normalizeLabel(before.asset) === assets.normalizeLabel(after.asset));
    unique((before, after) => before.recipe.shapes.some(shape => after.recipe.shapes.some(next => next.id === shape.id)));
    return {paired, added: [...available]};
  }
  function blockAt(blocks, position) {
    return blocks.find(block => (block.from ?? block.start) <= position && position < (block.to ?? block.end)) ||
      blocks.find(block => (block.from ?? block.start) >= position) || blocks.at(-1) || null;
  }
  function imageIndex(block, occurrence, source) {
    if (!block || !occurrence) return -1;
    const from = block.from ?? block.start;
    const raw = block.raw ?? source.slice(from, block.to ?? block.end);
    const parser = globalThis.RapierImageAssets.markdownParser();
    const env = globalThis.RapierImageAssets.imageEnvironment(source);
    const images = _rapierScanMarkdownImages(raw, parser.parse(raw, env));
    return images.find(image => from + image.start === occurrence.start && from + (image.tokenEnd ?? image.end) === occurrence.end)?.renderIndex ?? -1;
  }
  async function sourcePlaces(input) {
    const {source, records, revision, earliestRevision, metadata: documentMetadata, blocks = [], acts, current = () => true} = input;
    if (!current() || !records?.length) return [];
    if ((input.docKind ?? (typeof rapier === 'undefined' ? 'markdown' : rapier.document.docKind)) !== 'markdown') return [];
    const ledger = globalThis.RapierLedger, replay = input.replay || ledger.replayHistory({source, records, revision, earliestRevision, metadata: documentMetadata});
    if (!replay.ok) throw failure(replay.reason);
    if (typeof replay.initialSource !== 'string' || replay.revision !== revision) throw failure('history_invalid');
    const chosen = new Set((acts || replay.acts).filter(act => act.actor?.kind === 'agent').map(act => act.id));
    if (!chosen.size) return [];
    const svgData = /data:image\/svg\+xml;base64,/i;
    if (!svgData.test(source) && !svgData.test(replay.initialSource) && !records.some(record =>
      ledger._rapierRecordSplices(record, records).some(row => svgData.test(row.removed) || svgData.test(row.inserted)))) return [];
    const metadata = new Map(replay.acts.map(act => [act.id, act])), cache = new Map(), tracks = [];
    let text = replay.initialSource, previous = drawingsIn(text, cache), yielded = performance.now();
    for (const row of previous) {
      row.track = {current: row, anchor: row.start, events: []}; tracks.push(row.track);
    }
    for (const record of records) {
      if (!current()) return [];
      const splices = ledger._rapierRecordSplices(record, records), after = ledger._rapierTransformSplices(text, splices);
      if (after == null) throw failure('history_invalid');
      for (const track of tracks) track.anchor = ledger.transportTouchedInterval(track.anchor, track.anchor, splices).start;
      let following;
      if (bodyChanged(previous, splices, text)) following = drawingsIn(after, cache);
      else following = previous.map(row => ({...row, ...ledger.transportInterval(row.start, row.end, splices),
        definition: row.definition && ledger.transportInterval(row.definition.start, row.definition.end, splices)}));
      const {paired, added} = pairDrawings(previous, following, splices), act = metadata.get(record.transaction.id);
      const event = (track, before, next) => {
        if (!chosen.has(act.id)) return;
        const shapes = changedShapes(before?.recipe, next?.recipe);
        if (shapes.length) track.events.push({act, before, after: next, shapes,
          occurrence: {start: (next || before).start, beforeAsset: before?.asset || '', afterAsset: next?.asset || ''}});
      };
      for (const before of previous) {
        const next = paired.get(before) || null, track = before.track;
        track.current = next;
        if (next) {next.track = track; track.anchor = next.start;}
        event(track, before, next);
      }
      for (const row of added) {
        row.track = {current: row, anchor: row.start, events: []}; tracks.push(row.track);
        event(row.track, null, row);
      }
      previous = following; text = after;
      if (performance.now() - yielded > 12) {
        await new Promise(resolve => setTimeout(resolve, 0)); yielded = performance.now();
      }
    }
    if (!current() || text !== source) return [];
    const documentId = input.documentId ?? (typeof rapier === 'undefined' ? '' : String(rapier.identity.authority));
    const places = [];
    for (const track of tracks) {
      const position = track.current?.start ?? Math.min(source.length, track.anchor);
      const homes = track.current ? blocks : blocks.filter(block => !globalThis.RapierImageAssets.isAssetBlock(block.raw ?? source.slice(block.from, block.to)));
      const block = blockAt(homes, position);
      const index = imageIndex(block, track.current, source);
      for (const event of track.events) for (const shapeId of event.shapes) {
        const {act, occurrence} = event;
        places.push({kind: 'drawing', key: JSON.stringify(['drawing', act.id, occurrence.start, occurrence.beforeAsset, occurrence.afterAsset, shapeId]),
          drawingKey: JSON.stringify(['drawing', act.id, occurrence.start, occurrence.beforeAsset, occurrence.afterAsset]),
          actId: act.id, actIds: [act.id], act, actor: act.actor, groupKey: groupKey(act), shapeId, blockId: block?.id ?? null,
          imageIndex: index, from: position, to: track.current?.end ?? position, revision, documentId,
          beforeRecipe: event.before?.recipe || null, afterRecipe: event.after?.recipe || null,
          currentRecipe: track.current?.recipe || null, viewBox: track.current?.viewBox || event.before?.viewBox || event.after?.viewBox,
          sourceUrl: track.current?.url || null, occurrence: track.current ? {start: track.current.start, end: track.current.end, asset: track.current.asset} : null});
      }
    }
    return places;
  }
  function drawState() {
    return typeof _rapierDrawState !== 'undefined' && _rapierDrawState.open && _rapierDrawState.recipe ? _rapierDrawState : null;
  }
  function currentPlaces(places = []) {
    const state = drawState();
    if (!state) {liveCache = null; return places;}
    const matched = places.filter(place => state.editing && place.blockId === state.editing.blockId && place.imageIndex === state.editing.imageIndex);
    if (liveCache && liveCache.session === state.session && liveCache.stack === state.undoStack && liveCache.head === state.undoStack.at(-1) &&
      liveCache.recipe === state.recipe && liveCache.source.length === matched.length && matched.every((place, index) => liveCache.source[index] === place)) return liveCache.rows;
    const entries = new Map(state.undoStack.filter(row => row.agent).map(row => [row.agent.transactionId, row]));
    const rows = matched.map(place => {
      const entry = entries.get(place.actId);
      return {...place, live: true, session: state.session, currentRecipe: state.recipe,
        ...(entry ? {drawingActId: place.actId} : {})};
    });
    liveCache = {session: state.session, stack: state.undoStack, head: state.undoStack.at(-1), recipe: state.recipe, source: matched, rows};
    return rows;
  }
  function valid(place) {
    if (!place || typeof rapier !== 'undefined' && (place.documentId !== String(rapier.identity.authority) || place.revision !== rapier.revision.settled)) return false;
    const state = drawState();
    return place.live ? !!state && state.session === place.session && state.editing?.blockId === place.blockId && state.editing?.imageIndex === place.imageIndex : !state;
  }
  function wrapper(place) {
    if (place.blockId == null) return null;
    return [...document.querySelectorAll('#editor-blocks > .block-wrapper')].find(node => node.dataset.blockId === String(place.blockId)) || null;
  }
  function deletedDrawing(place) {return !place.live && !place.currentRecipe && !place.occurrence && !!place.beforeRecipe;}
  function container(place) { return place.live ? drawState()?.surface || null : wrapper(place) ||
    (deletedDrawing(place) ? document.getElementById('editor-blocks') : null); }
  function image(place) {
    return place.imageIndex >= 0 ? wrapper(place)?.querySelectorAll('.block-read [data-rapier-markdown-image]')[place.imageIndex] || null : null;
  }
  function projection(place, reserved = ghost?.place.drawingKey === place.drawingKey ? ghost?.slot : null) {
    if (!valid(place)) return null;
    if (place.live) {
      const state = drawState(), root = state.svgRoot, matrix = root?.getScreenCTM(), rect = root?.getBoundingClientRect();
      const view = root?.viewBox.baseVal;
      if (!matrix || !rect || !view) return null;
      return {viewBox: [view.x, view.y, view.width, view.height], rect, matrix, host: state.stageEl || state.surface,
        width: rect.width, height: rect.height, left: rect.left, top: rect.top, transform: 'none', origin: '0 0'};
    }
    const element = image(place), home = container(place);
    if (!element) {
      // Only an actually removed drawing has a vacant place. An unresolved live
      // image must not lend some other block's rectangle to a historical ghost.
      if (!deletedDrawing(place)) return null;
      const rect = reserved?.getBoundingClientRect() || home?.querySelector('.block-read')?.getBoundingClientRect() || home?.getBoundingClientRect();
      if (!rect || !place.viewBox) return null;
      const width = rect.width, height = width * place.viewBox[3] / place.viewBox[2];
      const [x, y, w] = place.viewBox, scale = width / w;
      return {viewBox: place.viewBox, rect, host: document.body, width, height, left: rect.left, top: rect.top,
        transform: 'none', origin: '0 0', matrix: {a: scale, b: 0, c: 0, d: scale, e: rect.left - x * scale, f: rect.top - y * scale}};
    }
    if (!element.isConnected || !place.viewBox) return null;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    const width = parseFloat(style.width) || element.clientWidth, height = parseFloat(style.height) || element.clientHeight;
    if (!(width > 0 && height > 0)) return null;
    const transform = style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
    const origin = style.transformOrigin.split(/\s+/).map(Number.parseFloat), ox = origin[0] || 0, oy = origin[1] || 0;
    const local = (x, y) => ({x: transform.a * (x - ox) + transform.c * (y - oy) + transform.e + ox,
      y: transform.b * (x - ox) + transform.d * (y - oy) + transform.f + oy});
    const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => local(x, y));
    const left = rect.left - Math.min(...corners.map(point => point.x)), top = rect.top - Math.min(...corners.map(point => point.y));
    const [x, y, w, h] = place.viewBox, scale = Math.min(width / w, height / h);
    const dx = (width - w * scale) / 2 - x * scale, dy = (height - h * scale) / 2 - y * scale;
    const start = local(dx, dy);
    return {viewBox: place.viewBox, rect, host: document.body, width, height, left, top, transform: style.transform, origin: style.transformOrigin,
      matrix: {a: transform.a * scale, b: transform.b * scale, c: transform.c * scale, d: transform.d * scale, e: left + start.x, f: top + start.y}};
  }
  function getRect(place) {
    const view = projection(place);
    if (!view) return null;
    const state = place.live && drawState();
    const recipe = [state?.recipe, place.currentRecipe, place.afterRecipe, place.beforeRecipe]
      .find(candidate => candidate?.shapes.some(row => row.id === place.shapeId));
    const shape = recipe?.shapes.find(row => row.id === place.shapeId);
    if (!shape) return view.rect;
    let box;
    try {box = globalThis.RapierDrawCore._rapierDrawShapePaintedBBoxIn(shape, recipe);} catch (_) {return null;}
    const m = view.matrix, corners = [[box.minX, box.minY], [box.maxX, box.minY], [box.minX, box.maxY], [box.maxX, box.maxY]]
      .map(([x, y]) => ({x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f}));
    const left = Math.min(...corners.map(point => point.x)), right = Math.max(...corners.map(point => point.x));
    const top = Math.min(...corners.map(point => point.y)), bottom = Math.max(...corners.map(point => point.y));
    return {left, right, top, bottom, width: right - left, height: bottom - top};
  }
  function closeBefore() {
    const old = ghost; ghost = null;
    old?.holder.remove(); old?.slot?.remove();
  }
  function updateBefore() {
    if (!ghost) return;
    if (ghost.slot && !ghost.slot.isConnected) {closeBefore(); return;}
    const view = projection(ghost.place);
    if (!view) {closeBefore(); return;}
    const {holder, svg} = ghost;
    holder.style.left = view.left + 'px'; holder.style.top = view.top + 'px';
    holder.style.width = view.width + 'px'; holder.style.height = view.height + 'px';
    holder.style.transform = view.transform; holder.style.transformOrigin = view.origin;
    svg.setAttribute('viewBox', view.viewBox.join(' '));
  }
  function showBefore(place) {
    closeBefore();
    if (!valid(place)) return false;
    let recipe = place.beforeRecipe;
    if (place.drawingActId != null && typeof _rapierDrawHistoryProject === 'function') {
      const projected = _rapierDrawHistoryProject({actId: place.drawingActId});
      if (!projected.ok || projected.session !== place.session) return false;
      recipe = projected.before;
    }
    if (!projection(place)) return false;
    // An insertion has no previous shape. Its exact absence needs no invented silhouette.
    if (!recipe || place.shapeId != null && !recipe.shapes.some(shape => shape.id === place.shapeId)) return true;
    let slot = null;
    try {
      const built = globalThis.RapierDrawCore._rapierDrawBuildSVG(recipe, undefined, true);
      let shown;
      if (place.live && typeof _rapierDrawDarkPaper === 'function') {
        // Draw's chosen canvas can differ from the page's theme. Promote the
        // file writer's own colour rules for that canvas, without changing ink.
        const dark = _rapierDrawDarkPaper();
        shown = built.replace(/<style>@media \(prefers-color-scheme:dark\)\{([^<]*)\}<\/style>/,
          (_, rules) => dark ? '<style>' + rules + '</style>' : '');
      } else {
        shown = globalThis.RapierEmbeddedImages?.inkForPaper?.(built) || built;
        if (document.body.classList.contains('light')) shown = shown.replace(/<style>@media \(prefers-color-scheme:dark\)\{([^<]*)\}<\/style>/, '');
      }
      const parsed = new DOMParser().parseFromString(shown, 'image/svg+xml').documentElement;
      if (!parsed || parsed.localName !== 'svg' || parsed.querySelector('parsererror')) return false;
      const svg = document.importNode(parsed, true);
      svg.querySelectorAll('metadata').forEach(node => node.remove());
      if (place.shapeId != null) {
        for (const node of svg.querySelectorAll('[data-shape-id]')) if (node.getAttribute('data-shape-id') !== place.shapeId) node.remove();
        svg.querySelectorAll('[data-rapier-background]').forEach(node => node.remove());
      }
      svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true');
      svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; svg.style.overflow = place.live ? 'hidden' : 'visible';
      if (deletedDrawing(place)) {
        const home = container(place);
        if (home.classList.contains('block-wrapper') && typeof _rapierWysiwygWake === 'function') _rapierWysiwygWake(home);
        slot = document.createElement('div'); slot.className = 'rapier-changes-deleted-drawing';
        slot.contentEditable = 'false'; slot.setAttribute('aria-hidden', 'true');
        slot.style.aspectRatio = place.viewBox[2] + ' / ' + place.viewBox[3];
        // This is a temporary reading area inside a surviving wrapper, never an
        // authored block or an editor surface. Closing Before removes it whole.
        const read = home.querySelector(':scope > .block-read');
        if (read) read.before(slot); else home.prepend(slot);
      }
      const view = projection(place, slot);
      if (!view) {slot?.remove(); return false;}
      const holder = document.createElement('div'); holder.className = 'rapier-change-ghost'; holder.setAttribute('aria-hidden', 'true');
      holder.style.position = 'fixed'; holder.style.pointerEvents = 'none'; holder.style.zIndex = place.live ? '0' : '89';
      // Filter IDs and font rules belong to this ghost, never to the live page's SVGs.
      holder.attachShadow({mode: 'open'}).append(svg);
      view.host.append(holder); ghost = {holder, svg, place, slot}; updateBefore();
      return true;
    } catch (_) {slot?.remove(); closeBefore(); return false;}
  }
  function undoTarget(place) {return place.drawingActId != null ? {drawingActId: place.drawingActId, session: place.session} : {actId: place.actId};}
  return Object.freeze({sourcePlaces, currentPlaces, getRect, showBefore, closeBefore, updateBefore, container, undoTarget});
})();
