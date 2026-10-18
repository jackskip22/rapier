async function _rapierRescueStartup() {
  if (globalThis.RapierBenchRoute === true || globalThis.RapierBenchSession?.active === true) return;
  const panel = document.querySelector('.rapier-boot-failure');
  if (!panel || document.getElementById('rapier-startup-rescue')) return;
  panel.inert = false; panel.removeAttribute('aria-hidden');
  document.documentElement.classList.remove('rapier-engine-modal-locked');
  const section = document.createElement('section'), status = document.createElement('p'), files = document.createElement('div');
  const retry = document.createElement('button'), controls = document.createElement('style'), urls = new Set();
  controls.textContent = '#rapier-startup-rescue :is(a,button){box-sizing:border-box;width:100%;min-height:44px;padding:.65rem 0;border:0;background:none;color:inherit;font:inherit;overflow-wrap:anywhere;text-decoration:underline;text-underline-offset:.2em}'
    + '#rapier-startup-rescue :is(a,button):not([hidden]){display:block}'
    + '#rapier-startup-rescue :is(a,button):focus-visible{outline:none;text-decoration-thickness:3px}';
  _rapierPlainEditor(panel, controls);
  section.id = 'rapier-startup-rescue'; section.dataset.state = 'loading';
  section.style.marginTop = '1.5rem';
  panel.style.maxHeight = '100dvh'; panel.style.overflow = 'auto'; panel.style.boxSizing = 'border-box';
  retry.type = 'button'; retry.textContent = 'Read saved work again'; retry.hidden = true;
  section.append(controls, status, files, retry); panel.append(section);
  let result = null, generation = 0;
  const releaseUrls = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  const renderStatus = () => {
    const errors = result?.errors || [], count = files.childElementCount;
    status.textContent = result?.kept || errors.join(' ') || (count ? 'Download your saved documents.'
      : result?.pending ? 'Finding saved documents…' : 'No saved documents found in this browser.');
    section.dataset.state = errors.length ? 'partial' : result?.pending ? 'loading' : 'ready'; retry.hidden = !errors.length;
  };
  const exporter = () => globalThis.RapierHost ? globalThis.RapierPlatform?.files?.exportArtifact : null;
  const linkFor = (row, names, born) => {
    const link = document.createElement('a'); let busy = false, name = row.name, number = 2;
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : '';
    while (names.has(name.toLowerCase())) name = stem + '-' + number++ + extension;
    names.add(name.toLowerCase());
    link.href = '#'; link.download = name; link.textContent = name;
    link.addEventListener('click', async event => {
      if (link.getAttribute('href') !== '#') return;
      event.preventDefault(); if (busy) return; busy = true;
      try {
        const blob = row.blob || await row.read();
        if (born !== generation) return;
        const save = exporter();
        if (typeof save === 'function') { await save(blob, name); renderStatus(); return; }
        const url = URL.createObjectURL(blob); urls.add(url); link.href = url; link.click(); renderStatus();
        setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); if (link.href === url) link.href = '#'; }, 60000);
      } catch (error) {
        if (born !== generation) return;
        const message = 'This saved file could not be read: ' + String(error?.message || error);
        if (!result.errors.includes(message)) result.errors.push(message);
        renderStatus(); console.warn('[rapier] saved document could not be read', error);
      } finally { busy = false; }
    });
    return link;
  };
  const read = async () => {
    const born = ++generation; retry.disabled = true; status.textContent = 'Finding saved documents…'; section.dataset.state = 'loading';
    const names = new Set(), links = new WeakMap();
    releaseUrls(); files.replaceChildren();
    const render = next => {
      if (born !== generation) return;
      result = next; const fragment = document.createDocumentFragment();
      for (const row of [...result.drafts, ...result.notes, ...result.archives]) {
        if (!links.has(row)) links.set(row, linkFor(row, names, born));
        fragment.appendChild(links.get(row));
      }
      files.replaceChildren(fragment); renderStatus(); retry.disabled = false;
    };
    try {
      render(await globalThis.RapierBootRecovery.collect({onUpdate: render}));
    } catch (error) {
      section.dataset.state = 'partial'; retry.hidden = false;
      status.textContent = 'Saved work could not be read: ' + String(error?.message || error);
    } finally { if (born === generation) retry.disabled = false; }
  };
  retry.addEventListener('click', read); addEventListener('pagehide', releaseUrls, {once: true});
  await read();
}

function _rapierPlainEditor(panel, controls) {
  if (document.getElementById('rapier-plain-editor')) return;
  const carried = document.getElementById('rapier-document');
  let text = '', name = 'untitled.md';
  if (carried) {
    text = carried.textContent.replace(/\\([\\/!r0])/g, (_, c) => c === '\\' ? '\\' : c === 'r' ? '\r' : c === '0' ? '\0' : c === '/' ? '</' : '<!');
    name = (carried.getAttribute('data-name') || 'document.md').replace(/[\\/\0]/g, '-') || 'document.md';
  }
  const title = panel.querySelector('.rapier-boot-failure__title, h1'), detail = document.getElementById('rapier-boot-failure-detail');
  const reason = detail ? (/Startup resource: (.*)$/s.exec(detail.textContent)?.[1] || '') : '';
  if (title) title.textContent = 'Rapier opened in plain text';
  if (detail) detail.textContent = carried
    ? 'The full editor could not start. ' + name + ' is below exactly as saved: edit it, then Save. Reload to try the full editor again.'
    : 'The full editor could not start. Write below and Save, or download your saved documents. Reload to try the full editor again.';
  const editor = document.createElement('section'), area = document.createElement('textarea'), row = document.createElement('div');
  const save = document.createElement('button'), copy = document.createElement('button'), note = document.createElement('p');
  editor.id = 'rapier-plain-editor';
  editor.style.cssText = 'margin-top:1.25rem;text-align:left';
  panel.style.maxWidth = '48rem'; panel.style.width = '100%'; panel.style.boxSizing = 'border-box';
  area.value = text; area.spellcheck = true; area.setAttribute('aria-label', name);
  if (!carried) area.placeholder = 'Write here.';
  area.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-height:55dvh;margin:0;padding:.85rem;border:0;border-radius:0;outline:none;resize:vertical;' +
    'background:rgba(127,127,127,.14);color:inherit;font:15px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:4';
  row.style.cssText = 'display:flex;gap:1.5rem';
  for (const [button, label] of [[save, 'Save'], [copy, 'Copy']]) { button.type = 'button'; button.textContent = label; button.style.width = 'auto'; }
  note.style.cssText = 'min-height:1.55em';
  if (reason) { const why = document.createElement('p'); why.style.cssText = 'margin-top:.75rem;font-size:12px'; why.textContent = 'Startup resource: ' + reason; editor.append(why); }
  let edited = false;
  area.addEventListener('input', () => { edited = area.value !== text; note.textContent = ''; });
  addEventListener('beforeunload', event => { if (edited) event.preventDefault(); });
  save.addEventListener('click', async () => {
    const blob = new Blob([area.value], {type: 'text/markdown;charset=utf-8'});
    try {
      const host = globalThis.RapierHost ? globalThis.RapierPlatform?.files?.exportArtifact : null;
      if (typeof host === 'function') await host(blob, name);
      else {
        const link = document.createElement('a'), url = URL.createObjectURL(blob);
        link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      text = area.value; edited = false; note.textContent = 'Saved as ' + name + '.';
    } catch (error) { note.textContent = 'Not saved: ' + String(error?.message || error); }
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(area.value); note.textContent = 'Copied.'; }
    catch (_) { area.focus(); area.select(); note.textContent = 'Select all is on: copy it with your keyboard or the menu.'; }
  });
  editor.prepend(area);
  row.append(save, copy);
  editor.insertBefore(row, editor.children[1] || null);
  editor.insertBefore(note, row.nextSibling);
  panel.append(editor);
  if (!controls.textContent.includes('#rapier-plain-editor'))
    controls.textContent += '#rapier-plain-editor button{box-sizing:border-box;min-height:44px;padding:.65rem 0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:.2em;cursor:pointer}'
      + '#rapier-plain-editor button:focus-visible{outline:none;text-decoration-thickness:3px}';
  if (!controls.isConnected) panel.append(controls);
}
