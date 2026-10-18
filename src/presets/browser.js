// SPDX-License-Identifier: AGPL-3.0-only
_rapierPresetPart = (() => {
  const owner = globalThis.RapierPresets, shelf = _rapierPersonalStore;
  const requireCurrent = current => { if (!current()) throw new Error('The document or selection changed. Open Starters again.'); };
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
    if (kind === 'selection' && (!exact || exact.end <= exact.start)) throw new Error('Select a passage, then open Starters.');
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
      if (!target) throw new Error('Place the caret or select a passage, then open Starters.');
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
    async function list() {
      requireCurrent(current); title('Starters');
      button('Page borders', () => { close(); _rapierComposerAct('borders'); });
      try { await shelf.ready; await shelf.snapshot(); }
      catch (error) { box.append(element('p', 'link-dialog__description', 'Personal starters could not be read. ' + String(error?.message || error))); button('Close', close); return; }
      requireCurrent(current);
      for (const record of Object.values(shelf.values('preset/'))) {
        try { const admitted = owner.admitPreset(record); button(admitted.name, () => choose(admitted)); }
        catch (_) { box.append(element('p', 'link-dialog__description', 'A saved starter could not be read.')); }
      }
      const saving = (label, kind) => button(label, () => { if (gate()) nameForm(label, String(rapier.document.filename || 'My starter').replace(/\.md$/i, '').slice(0, 80), name => save(name, kind, capture, current)); });
      saving('Save document as starter', 'document');
      const selected = range(capture); if (selected && selected.end > selected.start) saving('Save selected passage', 'selection');
      saving('Save document style', 'style');
      button('Import starter', () => {
        if (!gate()) return;
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.rapier-preset.json';
        input.addEventListener('change', () => void run(async () => {
          const file = input.files?.[0]; if (!file) return;
          if (file.size > owner.PRESET_BYTES) throw new Error('A starter can be at most 4 MiB.');
          const record = owner.admitPreset(JSON.parse(await file.text())); requireCurrent(current);
          await store({...record, id: owner.newId()}, current); await list();
        })); input.click();
      });
      button('Close', close); box.querySelector('button')?.focus();
    }
    void run(list);
  }
  return Object.freeze({open, startPage, saveFromAgent: (name, kind, current) => save(name, kind, null, current, true)});
})();
