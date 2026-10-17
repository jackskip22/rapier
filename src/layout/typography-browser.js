// SPDX-License-Identifier: AGPL-3.0-only

(() => {
  const host = document.getElementById('editor-blocks');
  if (!host) return;
  const printMedia = matchMedia('print');
  let frame = 0, printing = printMedia.matches;
  const options = {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'lang', 'dir', 'data-md-layout', 'data-md-align', 'data-md-hyphens', 'data-md-lines', 'data-md-caps', 'data-md-hanging']};
  const floatOnly = record => !!(record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest('.rapier-flow-float') ||
    record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && node.matches('.rapier-flow-float'));
  let composing = false;
  const observer = new MutationObserver(records => {
    const edits = new Set();
    let readChanged = false;
    for (const record of records) {
      const edit = (record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest('.block-edit');
      if (!edit) readChanged = true;
      else if (!floatOnly(record)) edits.add(edit);
      else readChanged = true;
    }
    if (readChanged || edits.size) schedule();
  });
  function leaveSeparator() {
    const selection = document.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const node = selection.anchorNode, separator = (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('[data-rapier-typography-separator]');
    if (!separator || !host.contains(separator) || !separator.closest('.block-edit')) return;
    if (selection.anchorOffset === 0 && node.nodeType === 3 && !node.previousSibling) selection.collapse(separator.parentNode, [...separator.parentNode.childNodes].indexOf(separator));
    else if (node.nodeType !== 3 || selection.anchorOffset === node.length && !node.nextSibling) selection.collapse(separator.parentNode, [...separator.parentNode.childNodes].indexOf(separator) + 1);
  }
  function composingMark(on) {
    observer.disconnect();
    try { for (const paragraph of host.querySelectorAll('.block-edit p[data-rapier-typography-fit]')) paragraph.toggleAttribute('data-rapier-typography-composing', on); }
    finally { observer.observe(host, options); }
  }
  document.addEventListener('compositionstart', event => {
    if (!host.contains(event.target)) return;
    leaveSeparator(); composing = true; composingMark(true);
  }, true);
  document.addEventListener('compositionend', event => {
    if (!composing) return;
    composing = false;
    composingMark(false);
    observer.disconnect();
    try { for (const edit of host.querySelectorAll('.block-edit')) { globalThis.RapierTypography.clear(edit); globalThis.RapierTypography.protectInitial(edit); } }
    finally { observer.observe(host, options); }
    schedule();
  }, true);
  document.addEventListener('beforeinput', event => {
    if (event.inputType === 'insertText' && host.contains(event.target)) leaveSeparator();
  }, true);
  let editCost = 0, editTask = 0;
  function setEdits() {
    if (composing || printing || document.documentElement.dataset.layout === 'plain') return;
    for (const edit of host.querySelectorAll('.block-edit')) {
      const started = performance.now();
      if (globalThis.RapierTypography.apply(edit, {all: true, editing: true}).changed) editCost = performance.now() - started;
    }
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      observer.disconnect();
      try {
        if (printing || document.documentElement.dataset.layout === 'plain') globalThis.RapierTypography.clear(host);
        else {
          if (editCost <= 12) setEdits();
          else if (!editTask) editTask = setTimeout(() => {
            editTask = 0;
            observer.disconnect();
            try { setEdits(); } finally { observer.observe(host, options); }
          });
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
