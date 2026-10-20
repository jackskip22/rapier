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
    const record = {version: 1, id: owner.newId(), name: owner.presetName(row.name), content: {scope: 'document', text}};
    try { return await use(record, 'new', null, () => _rapierMutationStampIsCurrent(stamp), true); }
    catch (error) { showToast(String(error?.message || error), 'error'); return false; }
  }
  function open(capture) {
    const overlay = document.createElement('div'), box = document.createElement('div');
    overlay.id = 'rapier-starters'; overlay.className = 'link-dialog__overlay';
    box.className = 'link-dialog'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Starters'); overlay.append(box);
    let active = true, busy = false;
    const state = _rapierBeginEngineDialog(overlay, () => { active = false; }); state.capture = capture;
    const current = () => active && _rapierMutationStampIsCurrent(state.documentGuard);
    const element = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
    const close = () => { active = false; state.close(); };
    const run = async work => {
      if (busy || !_rapierEngineDialogSubmitAdmission(state)) return;
      busy = true; state.blocking = true;
      for (const input of box.querySelectorAll('button,input')) input.disabled = true;
      try { await work(); }
      catch (error) { showToast(String(error?.message || error), 'error'); }
      finally { busy = false; state.blocking = false; for (const input of box.querySelectorAll('button,input')) input.disabled = false; }
    };
    const button = (text, action) => { const node = element('button', 'settings-action-btn', text); node.type = 'button'; node.addEventListener('click', () => void run(action)); box.append(node); return node; };
    const title = (name, description = '') => { box.replaceChildren(element('div', 'link-dialog__title', name)); if (description) box.append(element('p', 'link-dialog__description', description)); };
    const finish = async pending => { if (await pending) close(); };
    const gate = () => { if (allowed(false)) return true; close(); _rapierRequireFeature('presets'); return false; };
    const nameForm = (heading, initial, action) => {
      title(heading); const label = element('label', 'link-dialog__label', 'Name'), input = element('input', 'link-dialog__input');
      input.id = 'rapier-starter-name'; input.maxLength = 80; input.value = initial; label.htmlFor = input.id; box.append(label, input);
      button('Save', async () => { await action(owner.presetName(input.value)); showToast('Starter saved', 'info'); await list(); });
      button('Back', list); input.focus(); input.select();
    };
    const choose = record => {
      title(record.name, record.description || [record.content?.scope === 'selection' ? 'Passage' : record.content ? 'Document' : '', record.presentation ? 'Fonts and line spacing' : ''].filter(Boolean).join(' · '));
      const action = kind => async () => { if (gate()) await finish(use(record, kind, capture, current, false)); };
      if (record.content) { button('New document', action('new')); button('Insert passage', action('insert')); }
      if (record.presentation) button('Apply style to document', action('style'));
      {
        button('Rename', () => { if (gate()) nameForm('Rename starter', record.name, name => store({...record, name}, current, {previous: record})); });
        button('Export starter', () => _download(new Blob([JSON.stringify(record, null, 2) + '\n'], {type: 'application/json'}), record.name + '.rapier-preset.json'));
        button('Remove', () => {
          title('Remove ' + record.name + '?', 'Documents already made from it keep their content.');
          button('Remove from library', async () => {
            await shelf.set('preset/' + record.id, null, next => {
              requireCurrent(current);
              if (JSON.stringify(next.blobs[next.records['preset/' + record.id]?.value?.content]) !== JSON.stringify(record)) throw new Error('This starter changed in another window.');
            }); sync(); await list();
          });
          button('Back', () => choose(record));
        });
      }
      button('Back', list); box.querySelector('button')?.focus();
    };
    const target = _rapierImageInsertionTarget(), stamp = Object.freeze(_rapierMutationStamp());
    let tab = 'borders';
    const card = (picture, label, action) => {
      const node = element('button', 'rapier-gallery__card'); node.type = 'button'; node.setAttribute('aria-label', label);
      node.append(picture); node.addEventListener('click', () => void run(action)); return node;
    };
    const installed = async kind => {
      if (_rapierOrnamentDoor.held.has(kind)) return true;
      const provider = _rapierOrnamentProvider(kind);
      if (!provider) return false;
      await _rapierOrnamentSettled(provider);
      return provider.status === 'ready';
    };
    const bring = async kind => { _rapierOrnamentDoor.allowed.add(kind); await _rapierOrnamentBring(kind); requireCurrent(current); await list(); };
    const shaped = (row, ink, tiles) => {
      const image = _rapierOrnamentThumbnail(row, ink, tiles);
      image.classList.add('rapier-gallery__picture'); image.style.aspectRatio = row.w + ' / ' + row.h; return image;
    };
    async function borders(grid) {
      const ink = _rapierComposerHex(getComputedStyle(document.body).color);
      if (await installed('templates')) {
        const rows = await _rapierOrnamentBring('templates'); requireCurrent(current);
        const ordered = [...rows.filter(row => /^Title/.test(row.name)), ...rows.filter(row => !/^Title/.test(row.name))];
        for (const row of ordered) grid.append(card(shaped(row, ink, 0), row.name, async () => { close(); await startPage(row, stamp); }));
      } else {
        for (const preview of globalThis.RapierGalleryPreviews?.GALLERY_PREVIEWS || []) {
          const image = element('img', 'rapier-gallery__picture rapier-gallery__picture--preview');
          image.alt = ''; image.draggable = false; image.src = preview.src; image.style.aspectRatio = preview.w + ' / ' + preview.h;
          grid.append(card(image, preview.name, () => bring('templates')));
        }
      }
      try {
        await shelf.ready; await shelf.snapshot(); requireCurrent(current);
        for (const record of Object.values(shelf.values('preset/'))) {
          try { const admitted = owner.admitPreset(record); grid.append(card(element('span', 'rapier-gallery__name', admitted.name), admitted.name, () => choose(admitted))); } catch (_) {}
        }
      } catch (_) {}
    }
    async function elements(grid, open) {
      if (!await installed('elements')) {
        for (const preview of globalThis.RapierGalleryPreviews?.ELEMENT_PREVIEWS || []) {
          const image = element('img', 'rapier-gallery__picture rapier-gallery__picture--preview');
          image.alt = ''; image.draggable = false; image.src = preview.src; image.style.aspectRatio = preview.w + ' / ' + preview.h;
          grid.append(card(image, preview.name, () => bring('elements')));
        }
        return;
      }
      const packs = await _rapierOrnamentBring('elements'); requireCurrent(current);
      const groups = new Map();
      for (const pack of packs) for (const item of pack.items) { if (!groups.has(item.group)) groups.set(item.group, []); groups.get(item.group).push(item); }
      if (groups.has('Lettering')) { const lettering = groups.get('Lettering'); groups.delete('Lettering'); groups.set('Lettering', lettering); }
      const ink = _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
      if (!open) {
        for (const [name, items] of groups) {
          const near = items.filter(item => item.tile !== true && item.w / item.h >= .7 && item.w / item.h <= 2.2);
          const pool = near.length ? near.slice().sort((a, b) => a.path.length - b.path.length) : items.slice().sort((a, b) => a.w / a.h - b.w / b.h);
          const sample = pool[Math.floor(pool.length * (near.length ? .6 : .1))];
          const face = card(shaped(sample, ink, sample.tile ? 2 : 0), name + ', ' + items.length, () => draw(name));
          face.append(element('span', 'rapier-gallery__name', name + ' \u00b7 ' + items.length)); grid.append(face);
        }
        return;
      }
      for (const item of groups.get(open) || []) grid.append(card(shaped(item, ink, item.tile ? Math.min(3, RapierOrnaments.bandTiles(item)) : 0), item.name,
        async () => { close(); await _rapierComposerInsert({item, ink: _rapierComposerSheet.ink, target}); }));
    }
    async function letters(grid, open) {
      if (!await installed('lettersets')) {
        for (const preview of globalThis.RapierGalleryPreviews?.LETTER_PREVIEWS || []) {
          const image = element('img', 'rapier-gallery__picture rapier-gallery__picture--preview');
          image.alt = ''; image.draggable = false; image.src = preview.src; image.style.aspectRatio = preview.w + ' / ' + preview.h;
          grid.append(card(image, preview.name, () => bring('lettersets')));
        }
        return;
      }
      const sets = await _rapierOrnamentBring('lettersets'); requireCurrent(current);
      const ink = _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
      const picture = (set, entry) => {
        const box = RapierDrawOrnaments.outlineBox(entry.path), image = element('img', 'rapier-gallery__picture');
        image.alt = ''; image.draggable = false; image.style.aspectRatio = (box[2] - box[0] + 24) + ' / ' + (box[3] - box[1] + 24);
        image.dataset.draw = '1';
        image._rapierDraw = () => { image.src = 'data:image/svg+xml;base64,' + btoa(RapierOrnaments.letterSVG(set, entry, {ink, box})); };
        if (_rapierOrnamentSeen) _rapierOrnamentSeen.observe(image); else image._rapierDraw();
        return image;
      };
      if (!open) {
        for (const set of [...sets.filter(s => !s.partial), ...sets.filter(s => s.partial)]) {
          const face = card(picture(set, set.letters[0]), set.name + ', ' + set.letters.length, () => draw(set.id));
          face.append(element('span', 'rapier-gallery__name', set.name + ' \u00b7 ' + set.letters.length)); grid.append(face);
        }
        return;
      }
      const set = sets.find(s => s.id === open); grid.classList.add('rapier-gallery__grid--rows');
      for (const entry of set?.letters || []) grid.append(card(picture(set, entry), set.name + ' ' + (entry.letter || entry.key), async () => {
        close();
        const box = RapierDrawOrnaments.outlineBox(entry.path), svg = RapierOrnaments.letterSVG(set, entry, {ink: _rapierComposerSheet.ink || RapierOrnaments.ELEMENT_INK, box});
        await _rapierComposerPlace(svg, set.name + ' ' + (entry.letter || entry.key), 'width=25% x=50%', target);
      }));
    }
    async function draw(group = null) {
      requireCurrent(current);
      box.replaceChildren();
      const shut = element('button', 'navigator-close'); shut.type = 'button'; shut.setAttribute('aria-label', 'close gallery');
      shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      shut.addEventListener('click', close);
      const head = element('div', 'navigator-title-row rapier-gallery__head'), tabs = element('div', 'rapier-gallery__tabs'); tabs.setAttribute('role', 'tablist');
      for (const [id, word] of [['borders', 'borders'], ['elements', 'elements'], ['letters', 'letter sets']]) {
        const t = element('button', 'rapier-gallery__tab', word); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(tab === id));
        t.addEventListener('click', () => { if (tab !== id) { tab = id; void run(() => draw()); } }); tabs.append(t);
      }
      head.append(tabs, shut); box.append(head);
      if (group) {
        const back = element('button', 'link-dialog__btn rapier-gallery__back', '\u2039 ' + (tab === 'letters' ? (_rapierOrnamentDoor.held.get('lettersets')?.find(s => s.id === group)?.name || group) : group)); back.type = 'button';
        back.addEventListener('click', () => void run(() => draw())); box.append(back);
      }
      const grid = element('div', 'rapier-gallery__grid'); box.append(grid);
      if (tab === 'borders') await borders(grid); else if (tab === 'letters') await letters(grid, group); else await elements(grid, group);
      box.scrollTop = 0; tabs.querySelector('[aria-selected="true"]')?.focus({preventScroll: true});
    }
    const list = () => draw();
    box.classList.add('rapier-gallery'); box.setAttribute('aria-label', 'Gallery');
    void run(list);
  }
  return Object.freeze({open, startPage, saveFromAgent: (name, kind, current) => save(name, kind, null, current, true)});
})();
