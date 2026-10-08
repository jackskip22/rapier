// SPDX-License-Identifier: AGPL-3.0-only
(() => {
  const comments = globalThis.RapierComments;
  const host = () => globalThis.RapierAgentBrowser;
  let openSheet = null, keepActiveDraft = () => true;
  // A duplicated tab can inherit sessionStorage. Each live page writes its own draft key;
  // earlier pages' drafts remain available for explicit recovery instead of overwriting them.
  const tab = crypto.randomUUID();
  let draftStorage = null;
  try { draftStorage = localStorage; } catch (_) {}
  const drafts = comments.createCommentDraftStore(draftStorage);
  const node = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const button = (label, action) => {
    const element = node('button', label, 'settings-action-btn');
    element.type = 'button'; element.addEventListener('click', action); return element;
  };
  const message = value => host()?.notify(value, 'info');

  // Project the committed carrier without replacing the person's active prose block.
  function project(rows) {
    for (const row of rows) {
      const before = globalThis.RapierComments.commentProjectionParts(row.removed);
      const after = globalThis.RapierComments.commentProjectionParts(row.inserted);
      if (!before || !after || before.parts.length !== after.parts.length) continue;
      const blocks = rapier.document.blocks;
      for (let start = 0; start < blocks.length; start++) {
        if (blocks[start].type !== 'html_block' || !String(blocks[start].raw || '').startsWith(before.parts[0])) continue;
        const owned = blocks.slice(start, start + before.parts.length);
        if (owned.length !== before.parts.length || owned.some((block, index) => block.type !==
          (!index || index === owned.length - 1 ? 'html_block' : index === 1 ? 'paragraph' : 'footnote_reference'))) continue;
        const raw = owned.map((block, index) => (index ? String(block.leading || '') : '') + String(block.raw || '')).join('');
        if (!raw.startsWith(row.removed) || !/^(?:\r\n|\n|\r)?$/.test(raw.slice(row.removed.length))) continue;
        const tail = raw.slice(row.removed.length), changed = [];
        owned.forEach((block, index) => {
          const next = after.parts[index] + (index === owned.length - 1 ? tail : '');
          const leading = index ? after.eol + after.eol : block.leading;
          if (block.raw === next && block.leading === leading) return;
          block.raw = next; block.leading = leading; block.dirty = false;
          rapier.autosave.dirty.add(block.id); changed.push(index);
        });
        const referencesChanged = changed.some(index => index > 0) && rebuildReferenceIndex(blocks);
        for (const index of changed) {
          const block = owned[index];
          block.rendered = renderBlock(block.raw);
          if (index) _spliceBlockDOM(start + index, 1, [block]);
          else {
            const wrapper = document.querySelector('.block-wrapper[data-block-id="' + block.id + '"]');
            if (wrapper) {
              wrapper._rapierBlockRaw = block.raw;
              wrapper.querySelector('.block-read')?.replaceChildren();
            }
          }
        }
        if (referencesChanged) _rapierRefreshReferenceConsumers(new Set(owned.map(block => block.id)));
        break;
      }
    }
  }

  async function call(name, args, event) {
    if (event?.isTrusted !== true) return {outcome: 'refused', reason: 'human_action_required'};
    if (globalThis.RAPIER_APPS_HOST === true) {
      const result = await globalThis.RapierMcpApp?.invokeComment(name, args, event);
      return result?.structuredContent || result || {outcome: 'refused', reason: 'host_not_connected'};
    }
    return host().invoke(name, args, {actor: 'human', principal: 'local', transport: 'platform', requestId: crypto.randomUUID()});
  }

  async function open(event) {
    if (event?.isTrusted !== true || openSheet) return false;
    const snapshot = await host().snapshot(), pointer = await host().humanContext();
    if (snapshot.docKind !== 'markdown') { message('Comments belong to Markdown documents.'); return false; }
    const documentId = snapshot.documentId;
    const draftId = tab + ':' + documentId, previousDraft = drafts.read(draftId);
    const pointing = pointer.context || snapshot;
    let range = pointing.selection?.end > pointing.selection?.start ? pointing.selection : pointing.focus;
    let held = null, selectedKind = 'text', shapes = [];
    if (range?.end > range?.start) {
      const selected = snapshot.text.slice(range.start, range.end), trimmed = selected.trim();
      if (trimmed.startsWith('![')) {
        const leading = selected.length - selected.trimStart().length;
        range = {start: range.start + leading, end: range.start + leading + trimmed.length};
        selectedKind = 'image';
      }
      let read = await call('document.read_context', {start: range.start, end: range.end}, event), recipe = read.text || '';
      while (read.outcome === 'ok' && !read.complete && read.next_cursor) {
        read = await call('document.read_context', {cursor: read.next_cursor}, event); recipe += read.text || '';
      }
      if (read.outcome === 'ok' && (read.complete_handle || read.handle || read.comment_handle)) {
        if (selectedKind === 'image') {
          try {
            const value = JSON.parse(recipe);
            if (Array.isArray(value.shapes) && value.canvas) { selectedKind = 'drawing'; shapes = value.shapes; }
          } catch (_) {}
        }
        held = read.comment_handle || read.complete_handle || (selectedKind === 'drawing' || read.start === range.start && read.end === range.end ? read.handle : null);
      }
    }
    rapierCloseDocumentNavigator(false);
    const sheet = node('dialog');
    sheet.style.cssText = 'font:inherit;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border);margin:auto;padding:24px;box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:85dvh;overflow:auto';
    const title = node('h2', 'Comments'), list = node('div'), status = node('p');
    title.id = 'rapier-comments-title'; sheet.setAttribute('aria-labelledby', title.id);
    status.setAttribute('aria-live', 'polite');
    const field = node('textarea'); field.rows = 3; field.maxLength = 4096;
    field.placeholder = 'Add a comment'; field.setAttribute('aria-label', 'Comment');
    field.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;resize:vertical';
    const recipient = node('input'); recipient.type = 'text'; recipient.maxLength = 64;
    recipient.placeholder = 'Recipient (optional)'; recipient.setAttribute('aria-label', 'Comment recipient');
    const target = node('select'); target.setAttribute('aria-label', 'Comment location');
    if (held) {
      const choice = node('option', selectedKind === 'text' ? 'Selected passage' : selectedKind === 'image' ? 'Selected image' : 'Selected drawing');
      choice.value = selectedKind; target.append(choice);
      for (const shape of shapes) {
        const choice = node('option', String(shape.label || shape.id));
        choice.value = 'object:' + shape.id; target.append(choice);
      }
    }
    const whole = node('option', 'Whole document'); whole.value = 'document'; target.append(whole);
    let replyId = previousDraft?.replyId || null, busy = false, subscription = null;
    if (previousDraft) {
      field.value = previousDraft.text; recipient.value = previousDraft.recipient;
      if (!replyId && previousDraft.target !== 'document') {
        const pending = node('option', 'Choose a location for the saved draft'); pending.value = 'unavailable'; target.prepend(pending); target.value = 'unavailable';
      } else target.value = 'document';
      target.disabled = !!replyId;
    }
    const current = () => String(rapier.identity.authority) === documentId;
    const draft = () => ({documentId, filename: snapshot.filename, text: field.value, recipient: recipient.value,
      replyId, target: target.value});
    const keepDraft = () => {
      const value = draft();
      if (!value.text && !value.recipient) {
        const prior = drafts.read(draftId); return !prior || drafts.remove(draftId, prior);
      }
      const kept = drafts.write(draftId, value);
      if (!kept) status.textContent = 'This draft could not be saved on this device. Keep comments open or copy your text before leaving.';
      return kept;
    };
    keepActiveDraft = keepDraft;
    field.addEventListener('input', keepDraft); recipient.addEventListener('input', keepDraft); target.addEventListener('change', keepDraft);
    const render = async () => {
      if (!sheet.open || busy) return;
      if (!current()) { status.textContent = 'The document changed. Close comments and open them again.'; submit.disabled = true; return; }
      const saved = await host().snapshot();
      if (!current()) return;
      const parsed = comments.parseComments(saved.text), threads = comments.commentThreads(saved.text, parsed);
      list.replaceChildren();
      if (parsed.reason) { status.textContent = 'This file contains a comment record that cannot be read. Its source is kept.'; return; }
      for (const thread of threads) {
        const article = node('article'), heading = node('p', thread.resolved ? 'Resolved' : 'Open');
        article.append(heading);
        if (thread.anchor.kind !== 'document') article.append(node('blockquote', thread.anchor.quote));
        if (thread.anchor.status === 'stale') article.append(node('p', 'The original location changed; this thread is kept without a live anchor.'));
        for (const item of thread.messages) {
          const by = item.author.kind === 'human' ? item.author.name || 'Person' : item.author.name;
          article.append(node('p', by + (item.recipient ? ' → ' + item.recipient : '') + (item.date ? ' · ' + item.date : '')), node('p', item.text));
        }
        const actions = node('div', null, 'settings-action-row');
        actions.append(button('Reply', e => {
          if (!e.isTrusted) return;
          replyId = thread.id; target.disabled = true; field.placeholder = 'Reply to this thread'; keepDraft(); field.focus();
        }), button(thread.resolved ? 'Reopen' : 'Resolve', e => void mutate({action: thread.resolved ? 'reopen' : 'resolve', thread_id: thread.id}, e)));
        if (globalThis.RapierMcpApp?.askAboutSelection) actions.append(button('Ask agent', e => {
          if (!e.isTrusted || !current()) return;
          const context = {threadId: thread.id, anchor: {...thread.anchor, ...comments.commentSourceRange(thread.anchor, parsed)}, messages: thread.messages};
          void globalThis.RapierMcpApp.askAboutSelection(JSON.stringify(context));
        }));
        article.append(actions); list.append(article);
      }
    };
    const mutate = async (args, e) => {
      if (!e.isTrusted || busy || !current()) return;
      const submitted = draft();
      keepDraft();
      busy = true; submit.disabled = true;
      try {
        const result = await call('document.comment', args, e);
        if (['applied', 'rebased', 'unchanged'].includes(result?.outcome)) {
          if ((args.action === 'create' || args.action === 'reply') && JSON.stringify(draft()) === JSON.stringify(submitted)) {
            drafts.remove(draftId, submitted);
            field.value = ''; recipient.value = ''; replyId = null; target.disabled = false; field.placeholder = 'Add a comment';
          }
          status.textContent = '';
        } else status.textContent = result?.reason === 'context_expired' || result?.reason === 'target_changed'
          ? 'The selected location changed. Your comment is kept here; choose the whole document or reopen comments to select a fresh location.'
          : 'The comment was not applied. Your text is kept here. ' + String(result?.reason || 'Try again.');
      } catch (_) { status.textContent = 'The comment was not confirmed. Your text is kept here; try again.'; }
      finally { busy = false; submit.disabled = !current(); void render(); }
    };
    const submit = button('Add comment', e => {
      if (!replyId && target.value === 'unavailable') { status.textContent = 'Choose where this saved draft belongs before adding it.'; return; }
      const kind = target.value.startsWith('object:') ? 'drawing' : target.value;
      const args = {action: replyId ? 'reply' : 'create', text: field.value,
        ...(recipient.value.trim() ? {recipient: recipient.value.trim()} : {}),
        ...(replyId ? {thread_id: replyId} : {anchor: kind, ...(kind === 'document' ? {} : {context_handle: held}),
          ...(target.value.startsWith('object:') ? {object_id: target.value.slice(7)} : {})})};
      void mutate(args, e);
    });
    const actions = node('div', null, 'settings-action-row');
    actions.append(submit, button('New thread', e => {
      if (!e.isTrusted) return;
      replyId = null; target.disabled = false; field.placeholder = 'Add a comment'; keepDraft(); field.focus();
    }), button('Close', e => { if (e.isTrusted && !busy && keepDraft()) sheet.close(); }));
    const recovery = node('details'), recoveryTitle = node('summary', 'Saved comment drafts');
    recovery.append(recoveryTitle);
    for (const saved of drafts.list()) if (saved.id !== draftId && (saved.text || saved.recipient)) {
      const recovered = node('article');
      recovered.append(node('p', saved.filename), node('p', saved.text), node('p', saved.recipient), button('Use draft in this document', e => {
        if (!e.isTrusted || busy || !current()) return;
        if (field.value || recipient.value) { status.textContent = 'Finish or clear the current draft before recovering another.'; return; }
        field.value = saved.text; recipient.value = saved.recipient;
        replyId = saved.documentId === documentId ? saved.replyId : null;
        target.disabled = !!replyId;
        if (!replyId && saved.target !== 'document') {
          if (![...target.options].some(option => option.value === 'unavailable')) {
            const pending = node('option', 'Choose a location for the saved draft'); pending.value = 'unavailable'; target.prepend(pending);
          }
          target.value = 'unavailable';
        } else target.value = 'document';
        keepDraft(); field.focus();
      }), button('Discard saved draft', e => {
        if (!e.isTrusted || busy) return;
        const {id, ...value} = saved;
        if (drafts.remove(id, value)) recovered.remove();
      }));
      recovery.append(recovered);
    }
    recovery.hidden = recovery.children.length === 1;
    sheet.append(title, recovery, list, target, recipient, field, actions, status);
    sheet.addEventListener('cancel', e => { if (busy || !keepDraft()) e.preventDefault(); });
    const departing = event => { if ((field.value || recipient.value) && !keepDraft()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', departing);
    sheet.addEventListener('close', () => { keepDraft(); keepActiveDraft = () => true; window.removeEventListener('beforeunload', departing); subscription?.(); openSheet = null; sheet.remove(); });
    document.body.append(sheet); openSheet = sheet; sheet.showModal();
    subscription = host().subscribe(() => void render());
    await render(); field.focus(); return true;
  }

  globalThis.RapierCommentsUI = Object.freeze({project, open, keepDraft: () => keepActiveDraft()});
  const entry = button('Comments', event => { void open(event).catch(() => message('Comments could not open. Finish the current edit and try again.')); });
  entry.id = 'document-comments';
  const anchor = document.getElementById('agent-row');
  anchor?.before(entry);
})();
