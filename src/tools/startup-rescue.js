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
  const exporter = globalThis.RapierHost ? globalThis.RapierPlatform?.files?.exportArtifact : null;
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
        if (typeof exporter === 'function') { await exporter(blob, name); renderStatus(); return; }
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
