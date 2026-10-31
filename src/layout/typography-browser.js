// SPDX-License-Identifier: AGPL-3.0-only

(() => {
  const host = document.getElementById('editor-blocks');
  if (!host) return;
  const printMedia = matchMedia('print');
  let frame = 0, printing = printMedia.matches;
  const options = {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'lang', 'dir', 'data-md-layout', 'data-md-align', 'data-md-hyphens', 'data-md-lines', 'data-md-caps', 'data-md-hanging']};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const edit = (record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest('.block-edit');
      if (!edit || record.type !== 'characterData') { schedule(); return; }
    }
  });
  function setEdits() {
    if (printing || document.documentElement.dataset.layout === 'plain') return;
    for (const edit of host.querySelectorAll('.block-edit')) globalThis.RapierTypography.apply(edit, {all: true, editing: true});
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      observer.disconnect();
      try {
        if (printing || document.documentElement.dataset.layout === 'plain') globalThis.RapierTypography.clear(host);
        else {
          setEdits();
          if (globalThis.RapierTypography.apply(host).pending) schedule();
        }
      } finally { observer.observe(host, options); }
    });
  }
  observer.observe(host, options);
  for (const event of ['copy','cut']) document.addEventListener(event, () => {
    observer.disconnect();
    try { if (globalThis.RapierTypography.clearSelection(host)) schedule(); }
    finally { observer.observe(host, options); }
  }, true);
  new MutationObserver(schedule).observe(document.documentElement, {attributes: true,
    attributeFilter: ['data-layout', 'data-font', 'data-size', 'style']});
  new ResizeObserver(schedule).observe(host);
  for (const event of ['loading', 'loadingdone', 'loadingerror']) document.fonts?.addEventListener(event, () => {
    globalThis.RapierTypography.invalidateFonts(document); schedule();
  });
  document.fonts?.ready.then(schedule);
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('scroll', schedule, {passive: true, capture: true});
  host.addEventListener('focusout', schedule);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame); frame = 0; globalThis.RapierTypography.retire(host);
  });
  printMedia.addEventListener('change', () => { printing = printMedia.matches; schedule(); });
  window.addEventListener('beforeprint', () => {
    printing = true; cancelAnimationFrame(frame); frame = 0; observer.disconnect();
    try { globalThis.RapierTypography.clear(host); }
    finally { observer.observe(host, options); }
  });
  window.addEventListener('afterprint', () => { printing = printMedia.matches; schedule(); });
  window.addEventListener('pageshow', schedule);
  schedule();
})();
