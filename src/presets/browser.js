// SPDX-License-Identifier: AGPL-3.0-only
_rapierPresetPart = (() => {
  const owner = globalThis.RapierPresets, shelf = _rapierPersonalStore;
  const requireCurrent = current => { if (!current()) throw new Error('The document or selection changed. Open the Gallery again.'); };
  const allowed = agent => agent || _rapierFeatureAllowed('presets');
  const sync = () => _rapierNotesPart?.sync?.changed?.('settings');
  const captureAllowed = () => {
    if (rapier.document.docKind !== 'markdown') throw new Error('Starters use Markdown documents.');
    if (globalThis.RapierPlatform?.host?.lockedNotes === true || _rapierNotesPart && !_rapierNotesPart.presetCaptureAllowed())
      throw new Error('This private note cannot be transferred to the starter library.');
  };
  function range(capture) {
    const exact = _rapierResolveExactCanonicalSelection(capture);
    if (exact) return exact;
    const target = capture?.stable?.target;
    if (target?.surface === 'source' && target.start === target.end) return {start: target.start, end: target.end};
    const held = capture?.fallback?.ranges?.[0];
    if (!held?.collapsed) return null;
    const wrapper = _rangeBoundaryWrapper(held, false), block = wrapper && _rapierBoundBlock(wrapper);
    const span = block && _rapierExcerptCanonicalBlockSpans().get(Number(block.id));
    const at = span && _rapierRenderedBoundaryToCanonical(wrapper, block, held.startContainer, held.startOffset, span);
    return Number.isSafeInteger(at) ? {start: at, end: at} : null;
  }
  async function store(record, current, {agent = false, previous = null} = {}) {
    const copy = await owner.preparePreset(record, md), key = 'preset/' + copy.id;
    requireCurrent(current);
    await shelf.putAsset(key, copy, next => {
      requireCurrent(current);
      if (!allowed(agent)) throw new Error('Personal starters need Rapier Pro on this device.');
      captureAllowed();
      if (previous && JSON.stringify(next.blobs[next.records[key]?.value?.content]) !== JSON.stringify(previous)) throw new Error('This saved starter changed in another window.');
      if (!next.records[key]?.value && Object.entries(next.records).filter(([id, row]) => id.startsWith('preset/') && row.value).length >= owner.PRESET_LIMIT)
        throw new Error('Keep at most 128 personal starters. Export or remove one first.');
    });
    sync(); return copy;
  }
  async function save(name, kind, capture, current, agent = false) {
    requireCurrent(current); captureAllowed();
    const exact = kind === 'selection' ? range(capture) : null;
    if (kind === 'selection' && (!exact || exact.end <= exact.start)) throw new Error('Select a passage, then open the Gallery.');
    const captured = await _rapierCaptureSettledExternalDocument(); requireCurrent(current);
    if (!captured) throw new Error('Finish the current edit before saving a starter.');
    const original = globalThis.RapierLedgerCarried.readDocument(captured.canonical).text;
    let source = original;
    if (exact) {
      const complete = {...exact, canonicalLength: original.length};
      const plan = _rapierPlanCompleteExcerpt(complete, rapier.semantic.facts, rapier.semantic.index);
      source = plan ? _rapierMaterializeCompleteExcerpt(complete, plan, original)?.excerpt : original.slice(exact.start, exact.end);
      if (source == null) throw new Error('Select the complete passage and try again.');
      source = _rapierCompleteImageExcerpt(source, original);
    }
    const portable = await _rapierDocumentFonts.materialize(source, {force: true}); requireCurrent(current);
    const record = {version: 1, id: owner.newId(), name: owner.presetName(name)};
    if (kind !== 'style') record.content = {scope: exact ? 'selection' : 'document', text: owner.portable(portable, md)};
    if (!exact) record.presentation = owner.presentation(portable, md);
    return store(record, current, {agent});
  }
  async function use(record, action, capture, current, builtin = false) {
    requireCurrent(current); captureAllowed();
    const {description, ...data} = record;
    const preset = await owner.preparePreset(data, md), permit = () => current() && (builtin || allowed(false));
    requireCurrent(permit);
    if (preset.content) owner.portable(preset.content.text, md);
    const before = _rapierSourceText();
    if (action === 'new') {
      let text = preset.content?.text || '';
      if (preset.presentation) text = owner.applyPresentation(text, preset.presentation, md);
      const stamp = Object.freeze(_rapierMutationStamp()); requireCurrent(permit);
      const name = preset.name + '.md', ledger = globalThis.RapierLedger;
      const empty = ledger.exportLedger({text: '', metadata: {filename: name, docKind: 'markdown'}, records: [],
        documentAuthority: crypto.randomUUID(), revision: 0, root: ledger.textRoot(''), complete: true});
      const carriedLedger = ledger.replaceLedgerText(empty, text, {actor: {kind: 'human', id: 'local'}, operation: 'Insert starter', at: Date.now()});
      return rapierOpenPlatformPayload({text, name, transient: true}, {expectedMutationStamp: stamp, carriedLedger,
        current: () => (builtin || allowed(false)) && globalThis.RapierPlatform?.host?.lockedNotes !== true});
    }
    let splice;
    if (action === 'style') splice = _rapierPrefixSuffixDiff(before, owner.applyPresentation(before, preset.presentation, md));
    else {
      const target = range(capture);
      if (!target) throw new Error('Place the caret or select a passage, then open the Gallery.');
      splice = owner.insertPassage(before, preset.content.text, target.start, target.end, md);
    }
    return _rapierCommitSourceProjection([splice], action === 'style' ? 'Apply saved style' : 'Insert passage',
      action === 'style' ? null : {start: splice.pos + splice.inserted.length, end: splice.pos + splice.inserted.length}, null, capture?.viewport, null, permit);
  }
  async function startPage(row, stamp) {
    const text = globalThis.RapierOrnaments.templateMarkdown(row, {paper: globalThis.RapierOrnaments.paperFor(globalThis.navigator?.language)});
    if (!text) throw new Error('That border could not be made into a page.');
    if (_rapierMutationStampIsCurrent(stamp) && _rapierUntouchedEdge() && _rapierLeaveEdgeParagraph()) stamp = Object.freeze(_rapierMutationStamp());
    const record = {version: 1, id: owner.newId(), name: owner.presetName(row.name), content: {scope: 'document', text}};
    try { return await use(record, 'new', null, () => _rapierMutationStampIsCurrent(stamp), true); }
    catch (error) { showToast(String(error?.message || error), 'error'); return false; }
  }
  const BLANK_PAGE = '---\ntemplate: page\npapersize: a4\ngeometry: margin=1in\n---\n';
  const isPage = text => globalThis.RapierMarkdownSpec.isTemplatePage(text);
  const isPageTemplate = record => record.content?.scope === 'document' && isPage(record.content.text);
  const ELEMENT = /^!\[([^\]\n]*)\]\[element\] <!--md-layout:v1 [^>\n]*-->\n\n\[element\]: (data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*)\n$/;
  const ownElement = record => record.content?.scope === 'selection' && !record.presentation && ELEMENT.exec(record.content.text);
  const svgOf = url => new TextDecoder().decode(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), character => character.charCodeAt(0)));
  const own = test => Object.values(shelf.values('preset/')).flatMap(record => { try { const admitted = owner.admitPreset(record); return test(admitted) ? [admitted] : []; } catch (_) { return []; } });
  async function startText(name, text, stamp) {
    if (_rapierMutationStampIsCurrent(stamp) && _rapierUntouchedEdge() && _rapierLeaveEdgeParagraph()) stamp = Object.freeze(_rapierMutationStamp());
    const record = {version: 1, id: owner.newId(), name: owner.presetName(name), content: {scope: 'document', text}};
    try { return await use(record, 'new', null, () => _rapierMutationStampIsCurrent(stamp), true); }
    catch (error) { showToast(String(error?.message || error), 'error'); return false; }
  }
  const nameOf = (text, fallback) => (String(text || '').replace(/\.[^.]*$/, '').replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, ' ').trim().slice(0, 80)) || fallback;
  async function savePageTemplate() {
    try {
      if (!_rapierTemplatePage()) throw new Error('Open a page first.');
      const stamp = Object.freeze(_rapierMutationStamp()), settings = globalThis.RapierMarkdownSpec.readDocumentSettings(_rapierSourceText());
      await save(nameOf(settings.title || rapier.document.filename, 'Page'), 'document', null, () => _rapierMutationStampIsCurrent(stamp));
      showToast('Page template saved', 'info'); return true;
    } catch (error) { showToast(String(error?.message || error), 'error'); return false; }
  }
  async function keepElement(bytes, name) {
    const title = nameOf(name, 'Element'), asset = await RapierImageAssets.createAsset(bytes, null, {codec: 'image/svg+xml', title});
    if (!/^data:image\/svg\+xml;base64,/.test(asset.url)) throw new Error('Choose an SVG picture.');
    const ratio = asset.width / Math.max(1, asset.height), layout = RapierOrnaments.pieceLayout(ratio);
    const text = '![' + _rapierEscapeImageAlt(title) + '][element] <!--md-layout:v1 ' + layout + '-->\n\n[element]: ' + asset.url + '\n';
    if (!ELEMENT.test(text)) throw new Error('Choose an SVG picture.');
    await store({version: 1, id: owner.newId(), name: title, content: {scope: 'selection', text}}, () => true);
    showToast('Saved to your Elements', 'info'); return true;
  }
  async function saveElement(image, name) {
    try {
      const url = image && _rapierDrawImageDataUrl(image);
      if (!url || !/^data:image\/svg\+xml;base64,/i.test(url)) throw new Error('Only an SVG picture can be an Element.');
      return await keepElement(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), character => character.charCodeAt(0)), name);
    } catch (error) { showToast(String(error?.message || error), 'error'); return false; }
  }
  const chooseFile = (accept, then) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.hidden = true;
    document.body.append(input);
    input.addEventListener('change', () => { const file = input.files?.[0]; input.remove(); if (file) then(file); }, {once: true});
    input.addEventListener('cancel', () => input.remove(), {once: true});
    input.click();
  };
  const gallery = {tab: 'borders', group: {}, scroll: {}};
  function open(capture, {place = null} = {}) {
    const overlay = document.createElement('div'), box = document.createElement('div');
    overlay.id = 'rapier-starters'; overlay.className = 'link-dialog__overlay';
    box.className = 'link-dialog rapier-gallery'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Starters'); overlay.append(box);
    let active = true, busy = false;
    const ending = new AbortController(), end = () => { remember(); active = false; ending.abort(); _rapierOrnamentRelease(box); };
    const state = _rapierBeginEngineDialog(overlay, () => end()); state.capture = capture; state.blocking = () => busy;
    const current = () => active && _rapierMutationStampIsCurrent(state.documentGuard);
    const requireOpen = () => { if (!active) throw Object.assign(new Error('The Gallery was closed.'), {canceled: true}); requireCurrent(current); };
    const element = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
    const close = () => { end(); state.close(); };
    const run = async work => {
      if (busy || !_rapierEngineDialogSubmitAdmission(state)) return;
      busy = true;
      for (const input of box.querySelectorAll('button,input')) if (!input.closest('.rapier-gallery__head')) input.disabled = true;
      try { await work(); }
      catch (error) { if (!error?.canceled) showToast(String(error?.message || error), 'error'); }
      finally { busy = false; for (const input of box.querySelectorAll('button,input')) input.disabled = false; }
    };
    const button = (text, action) => { const node = element('button', 'settings-action-btn', text); node.type = 'button'; node.addEventListener('click', () => void run(action)); box.append(node); return node; };
    const title = (name, description = '') => { box.classList.remove('rapier-gallery'); box.replaceChildren(element('div', 'link-dialog__title', name)); if (description) box.append(element('p', 'link-dialog__description', description)); };
    const finish = async pending => { if (await pending) close(); };
    const gate = () => { if (allowed(false)) return true; close(); _rapierRequireFeature('presets'); return false; };
    const nameForm = (heading, initial, action) => {
      title(heading); const label = element('label', 'link-dialog__label', 'Name'), input = element('input', 'link-dialog__input');
      input.id = 'rapier-starter-name'; input.maxLength = 80; input.value = initial; label.htmlFor = input.id; box.append(label, input);
      button('Save', async () => { await action(owner.presetName(input.value)); showToast('Starter saved', 'info'); await list(); });
      button('Back', list); input.focus(); input.select();
    };
    const remove = (record, back) => {
      title('Remove ' + record.name + '?', 'Documents already made from it keep their content.');
      button('Remove from library', async () => {
        await shelf.set('preset/' + record.id, null, next => {
          requireOpen();
          if (JSON.stringify(next.blobs[next.records['preset/' + record.id]?.value?.content]) !== JSON.stringify(record)) throw new Error('This starter changed in another window.');
        }); sync(); await list();
      });
      button('Back', back);
    };
    const choose = record => {
      title(record.name, record.description || [record.content?.scope === 'selection' ? 'Passage' : record.content ? 'Document' : '', record.presentation ? 'Fonts and line spacing' : ''].filter(Boolean).join(' · '));
      const action = kind => async () => { if (gate()) await finish(use(record, kind, capture, current, false)); };
      if (record.content) { button('New document', action('new')); button('Insert passage', action('insert')); }
      if (record.presentation) button('Apply style to document', action('style'));
      {
        button('Rename', () => { if (gate()) nameForm('Rename starter', record.name, name => store({...record, name}, current, {previous: record})); });
        button('Export starter', () => _download(new Blob([JSON.stringify(record, null, 2) + '\n'], {type: 'application/json'}), record.name + '.rapier-preset.json'));
        button('Remove', () => remove(record, () => choose(record)));
      }
      button('Back', list); box.querySelector('button')?.focus();
    };
    const target = _rapierImageInsertionTarget(), stamp = Object.freeze(_rapierMutationStamp());
    const card = (picture, label, action, name) => {
      const node = element('button', 'rapier-gallery__card'); node.type = 'button'; node.setAttribute('aria-label', label);
      node.append(picture); if (name) node.append(element('span', 'rapier-gallery__name', name));
      const up = () => node.removeAttribute('data-pressed');
      node.addEventListener('pointerdown', () => node.setAttribute('data-pressed', ''));
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(type, up);
      node.addEventListener('click', () => void run(action)); return node;
    };
    const installed = async (kind, family = null) => {
      if (_rapierOrnamentDoor.held.has(_rapierOrnamentSlot(kind, family))) return true;
      const provider = _rapierOrnamentProvider(kind, family);
      if (!provider) return false;
      await _rapierOrnamentSettled(provider);
      return provider.status === 'ready';
    };
    const bring = async (kind, family = null) => { await _rapierOrnamentBring(kind, family); requireOpen(); await list(); };
    const shaped = (row, ink, tiles) => _rapierOrnamentTile({d: row.frame ? row.frame.path : row.path, box: [0, 0, row.w, row.h], tiles: row.tile === true && tiles ? tiles : 1, ink,
      svg: () => tiles ? RapierOrnaments.elementSVG(row, {ink, tiles}) : RapierOrnaments.thumbnailSVG(row, ink)}, 'rapier-gallery__picture', false);
    const previews = (grid, list, kind) => {
      for (const preview of list || []) {
        const image = element('img', 'rapier-gallery__picture rapier-gallery__picture--preview');
        image.alt = ''; image.draggable = false; image.decoding = 'async'; image.src = preview.src;
        grid.append(card(image, preview.name, () => bring(kind)));
      }
    };
    async function borders(grid) {
      grid.classList.add('rapier-gallery__grid--large', 'rapier-gallery__grid--borders');
      const ink = _rapierComposerHex(getComputedStyle(document.body).color);
      if (await installed('templates')) {
        const rows = await _rapierOrnamentBring('templates'); requireOpen();
        for (const row of rows) grid.append(card(shaped(row, ink, 0), row.name, async () => { close(); await (place ? place({border: row}) : startPage(row, stamp)); }));
      } else previews(grid, globalThis.RapierGalleryPreviews?.GALLERY_PREVIEWS, 'templates');
      if (place) return;
      try {
        await shelf.ready; await shelf.snapshot(); requireOpen();
        for (const admitted of own(record => !ownElement(record))) grid.append(card(element('span', 'rapier-gallery__name', admitted.name), admitted.name, () => choose(admitted)));
      } catch (_) {}
    }
    async function elements(grid, open) {
      const ink = _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
      const covers = globalThis.RapierGalleryPreviews?.ELEMENT_PREVIEWS || [];
      const kept = await Promise.all(_RAPIER_ELEMENT_FAMILIES.map(family => installed('elements', family)));
      if (kept.every(Boolean)) await Promise.all(_RAPIER_ELEMENT_FAMILIES.map(family => _rapierOrnamentBring('elements', family)));
      requireOpen();
      let mine = [];
      if (!place) try { await shelf.ready; await shelf.snapshot(); requireOpen(); mine = own(ownElement); } catch (_) {}
      const picture = record => { const image = element('img', 'rapier-gallery__picture'); image.alt = ''; image.draggable = false; image.decoding = 'async'; image.src = ownElement(record)[2]; return image; };
      if (open === YOURS && mine.length) {
        grid.dataset.opened = YOURS;
        const yours = record => {
          title(record.name);
          button('Insert', async () => {
            const [, , url] = ownElement(record); close();
            await _rapierComposerPlace(svgOf(url), record.name, /<!--md-layout:v1 ([^>]*)-->/.exec(record.content.text)[1], target);
          });
          button('Remove', () => remove(record, () => yours(record)));
          button('Back', list); box.querySelector('button')?.focus();
        };
        for (const record of mine) grid.append(card(picture(record), record.name, () => yours(record)));
        return;
      }
      const groups = _rapierElementGroups(), chosen = groups.find(group => group.name === open && group.items);
      if (!chosen) {
        grid.classList.add('rapier-gallery__grid--large');
        if (mine.length) grid.append(card(picture(mine[0]), YOURS + ', ' + mine.length, () => enter(YOURS), YOURS));
        for (const group of groups) {
          const sample = group.items?.[0], preview = !sample && covers.find(row => row.group === group.name);
          let picture;
          if (sample) picture = shaped(sample, ink, sample.tile ? 2 : 0);
          else { picture = element('img', 'rapier-gallery__picture rapier-gallery__picture--preview'); picture.alt = ''; picture.draggable = false; picture.decoding = 'async'; if (preview) picture.src = preview.src; }
          grid.append(card(picture, group.name + ', ' + group.count, async () => {
            if (group.items) return enter(group.name);
            remember(); gallery.group.elements = group.name;
            const here = (await Promise.all(_RAPIER_ELEMENT_FAMILIES.map(family => installed('elements', family)))).every(Boolean);
            await _rapierGalleryEnsure('elements');
            const opening = _rapierProgressOpen({label: 'Opening Elements', after: here ? 400 : 0});
            try { await bring('elements', group.family); } finally { opening.end(); }
          }, group.name));
        }
        return;
      }
      grid.dataset.opened = open;
      for (const item of chosen.items) grid.append(card(shaped(item, ink, item.tile ? Math.min(3, RapierOrnaments.bandTiles(item)) : 0), item.name,
        async () => { close(); await (place ? place({item}) : _rapierComposerInsert({item, ink: _rapierComposerSheet.ink, target})); }));
    }
    async function letters(grid, open) {
      if (!await installed('lettersets')) return previews(grid, globalThis.RapierGalleryPreviews?.LETTER_PREVIEWS, 'lettersets');
      const sets = await _rapierOrnamentBring('lettersets'); requireOpen();
      const ink = _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
      const picture = (set, entry) => {
        const box = RapierDrawOrnaments.outlineBox(entry.path), pad = 12;
        return _rapierOrnamentTile({d: entry.path, box: [box[0] - pad, box[1] - pad, box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad], tiles: 1, ink,
          svg: () => RapierOrnaments.letterSVG(set, entry, {ink, box})}, 'rapier-gallery__picture', false);
      };
      const set = sets.find(s => s.id === open);
      if (!set) {
        grid.classList.add('rapier-gallery__grid--large');
        for (const each of [...sets.filter(s => !s.partial), ...sets.filter(s => s.partial)])
          grid.append(card(picture(each, each.letters[0]), each.name + ', ' + each.letters.length, () => enter(each.id), each.name));
        return;
      }
      grid.dataset.opened = set.id;
      for (const entry of set.letters) grid.append(card(picture(set, entry), set.name + ' ' + (entry.letter || entry.key), async () => {
        close();
        if (place) return place({set, entry});
        const box = RapierDrawOrnaments.outlineBox(entry.path), svg = RapierOrnaments.letterSVG(set, entry, {ink: _rapierComposerSheet.ink || RapierOrnaments.ELEMENT_INK, box});
        await _rapierComposerPlace(svg, set.name + ' ' + (entry.letter || entry.key), 'width=25% x=50%', target);
      }));
    }
    const YOURS = 'Yours', blank = !place && rapier.document.docKind === 'markdown' && !/\S/.test(_rapierSourceText());
    async function importPage() {
      await shelf.ready; await shelf.snapshot(); requireOpen();
      title('Import page');
      for (const record of own(isPageTemplate)) button(record.name, async () => { close(); await startText(record.name, record.content.text, stamp); });
      button('Choose file', () => chooseFile('text/markdown,.md,.markdown,.txt', file => void run(async () => {
        if (file.size > owner.PRESET_BYTES) throw new Error('That page is over 4 MB.');
        const {text} = await RapierTextCodec.readDocumentRecord(file);
        if (!isPage(text)) throw new Error('That file is not a page.');
        close(); await startText(nameOf(file.name, 'Page'), text, stamp);
      })));
      button('Back', list); box.querySelector('button')?.focus();
    }
    const importElement = () => chooseFile('image/svg+xml,.svg', file => void run(async () => {
      if (file.size > owner.PRESET_BYTES) throw new Error('That SVG is over 4 MB.');
      await keepElement(new Uint8Array(await file.arrayBuffer()), file.name);
      requireOpen(); await list();
    }));
    const head = element('div', 'rapier-gallery__head'), tabs = element('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff rapier-gallery__tabs');
    const body = element('div', 'rapier-gallery__body'), backRow = element('div', 'rapier-gallery__back-row');
    tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Gallery');
    const shut = element('button', 'navigator-close'); shut.type = 'button'; shut.setAttribute('aria-label', 'close gallery');
    shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    shut.addEventListener('click', close);
    const sections = [['borders', 'borders'], ['elements', 'elements'], ['letters', 'letters']].map(([id, word]) => {
      const t = element('button', 'theme-switcher__btn onoff-btn', word); t.type = 'button'; t.dataset.tab = id; t.setAttribute('role', 'tab');
      t.addEventListener('click', () => { if (gallery.tab !== id) { remember(); gallery.tab = id; void show(); } });
      tabs.append(t); return t;
    });
    tabs.addEventListener('keydown', event => {
      const step = {ArrowRight: 1, ArrowLeft: -1}[event.key]; if (!step) return;
      const at = sections.findIndex(t => t.dataset.tab === gallery.tab), next = sections[(at + step + sections.length) % sections.length];
      event.preventDefault(); next.focus(); next.click();
    });
    body.addEventListener('keydown', event => {
      const tiles = [...body.querySelectorAll('.rapier-gallery__card')], at = tiles.indexOf(document.activeElement);
      if (at < 0) return;
      const columns = getComputedStyle(tiles[0].parentElement).gridTemplateColumns.split(' ').length;
      const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns}[event.key];
      if (!step || !tiles[at + step]) return;
      event.preventDefault(); tiles[at + step].focus({preventScroll: true}); tiles[at + step].scrollIntoView({block: 'nearest'});
    });
    head.append(tabs, shut);
    const spot = () => gallery.tab + '/' + (gallery.group[gallery.tab] || '');
    const remember = () => { if (body.isConnected && body.childElementCount) gallery.scroll[spot()] = body.scrollTop; };
    const enter = group => { remember(); gallery.group[gallery.tab] = group; void show(); };
    let metrics = null, frame = 0, painting = 0, last = 0;
    const measure = () => {
      const grid = body.firstElementChild, first = grid?.firstElementChild;
      if (!first) return null;
      const style = getComputedStyle(grid), picture = first.querySelector('.rapier-gallery__picture');
      return {top: grid.offsetTop, row: first.offsetHeight + (parseFloat(style.rowGap) || 0), columns: style.gridTemplateColumns.split(' ').length,
        picture: picture && {width: picture.clientWidth, height: picture.clientHeight}};
    };
    const paint = () => {
      frame = 0;
      metrics ||= measure();
      const tiles = body.firstElementChild?.children;
      if (!metrics || !tiles || metrics.row <= 0) return;
      const moving = Math.abs(body.scrollTop - last) > metrics.row; last = body.scrollTop;
      if (moving) { schedule(); return; }
      const top = last - metrics.top, from = Math.max(0, Math.floor(top / metrics.row) - 1) * metrics.columns;
      const to = Math.min(tiles.length, (Math.ceil((top + body.clientHeight) / metrics.row) + 1) * metrics.columns);
      for (let at = from; at < to && painting < 4; at++) {
        const picture = tiles[at].firstElementChild;
        if (!picture?.dataset.draw) continue;
        delete picture.dataset.draw; painting++;
        picture._rapierDraw(metrics.picture, () => { painting--; schedule(); });
      }
    };
    const schedule = () => { if (!frame && active) frame = requestAnimationFrame(paint); };
    body.addEventListener('scroll', schedule, {passive: true});
    addEventListener('resize', () => { metrics = null; schedule(); }, {passive: true, signal: ending.signal});
    let shown = 0;
    async function show() {
      requireOpen();
      const mine = ++shown, section = gallery.tab;
      if (head.parentNode !== box) { box.classList.add('rapier-gallery'); box.replaceChildren(head, backRow, body); }
      for (const t of sections) { const on = t.dataset.tab === section; t.toggleAttribute('data-active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
      if (typeof _rapierSwitchSlide === 'function') _rapierSwitchSlide(tabs);
      const grid = element('div', 'rapier-gallery__grid'); grid.setAttribute('role', 'group');
      const group = gallery.group[section] || null;
      if (section === 'borders') await borders(grid); else if (section === 'letters') await letters(grid, group); else await elements(grid, group);
      if (mine !== shown || !active) return;
      const opened = grid.dataset.opened || null;
      if (!opened) gallery.group[section] = null;
      backRow.replaceChildren();
      const row = (text, action) => { const node = element('button', 'link-dialog__btn rapier-gallery__back', text); node.type = 'button'; node.addEventListener('click', () => void run(action)); backRow.append(node); };
      if (section === 'borders' && blank) { row('Create blank page', async () => { close(); await startText('Page', BLANK_PAGE, stamp); }); row('Import page', importPage); }
      if (section === 'elements' && !opened && !place) row('Import element', importElement);
      if (opened) {
        const named = section === 'letters' ? _rapierOrnamentDoor.held.get('lettersets')?.find(s => s.id === opened)?.name || opened : opened;
        const back = element('button', 'link-dialog__btn rapier-gallery__back', '‹ ' + named); back.type = 'button';
        back.addEventListener('click', () => enter(null)); backRow.append(back);
      }
      grid.setAttribute('aria-label', opened ? backRow.textContent.slice(2) : section);
      _rapierOrnamentRelease(body); body.replaceChildren(grid);
      body.scrollTop = gallery.scroll[spot()] || 0;
      metrics = null; last = body.scrollTop; schedule();
      if (!box.contains(document.activeElement)) sections.find(t => t.dataset.tab === section)?.focus({preventScroll: true});
    }
    const list = () => show();
    box.setAttribute('aria-label', 'Gallery');
    void run(list);
  }
  return Object.freeze({open, startPage, savePageTemplate, saveElement});
})();
