(() => {
  const overlay = document.getElementById('feedback-overlay');
  const opener = document.getElementById('feedback-report-open');
  const close = document.getElementById('feedback-close');
  const message = document.getElementById('feedback-message');
  const submit = document.getElementById('feedback-submit');
  const explain = document.getElementById('feedback-explain');
  const status = document.getElementById('feedback-status');
  const limit = 3000;
  let revision = 0;
  let pending = null;
  if (!overlay || !opener || !message || !submit) return;
  const site = location.origin === 'https://rapier.website' &&
    globalThis.RapierPlatform?.environment?.id === 'web';
  if (site) explain.textContent = 'No account needed. Your report is recorded to help improve Rapier. Please avoid sensitive information.';
  const kind = () => overlay.querySelector('input[name="feedback-kind"]:checked')?.value || 'bug';
  const bytes = new TextEncoder();
  const report = () => ({
    kind: kind(), message: message.value.trim(),
    version: document.querySelector('meta[name="rapier-version"]')?.content || '',
    source: site ? 'website' : (globalThis.RapierPlatform?.environment?.id || 'browser')
  });
  const valid = () => {
    const text = message.value.trim();
    return text.length > 0 && text.length <= 1600 && bytes.encode(text).length <= limit;
  };
  const update = () => {
    submit.disabled = !valid() || submit.dataset.sending === 'true';
    if (bytes.encode(message.value.trim()).length > limit)
      status.textContent = 'This report is too long. Please shorten it.';
  };
  function encode(payload) {
    const utf8 = bytes.encode(JSON.stringify(payload));
    if (utf8.length > 3800) throw new Error('The report exceeds the browser handoff limit.');
    let bin = '';
    for (const value of utf8) bin += String.fromCharCode(value);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  opener.addEventListener('click', () => {
    status.dataset.error = '';
    status.textContent = '';
    closeDialog(_rapierUi.refs.settingsOverlay);
    openDialog(overlay, {panel: '.settings-panel', onEscape: () => closeDialog(overlay)});
    update();
  });
  close.addEventListener('click', () => closeDialog(overlay));
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeDialog(overlay);
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      closeDialog(overlay);
    }
  });
  message.addEventListener('input', () => {
    revision++; pending = null;
    status.dataset.error = '';
    status.textContent = '';
    update();
  });
  overlay.querySelectorAll('input[name="feedback-kind"]').forEach(input =>
    input.addEventListener('change', () => {
      revision++; pending = null;
      status.dataset.error = '';
      status.textContent = '';
      update();
    }));
  submit.addEventListener('click', async () => {
    if (!valid() || submit.dataset.sending === 'true') return;
    const attempt = pending?.revision === revision ? pending :
      {revision, body: {...report(), id: crypto.randomUUID()}};
    pending = attempt;
    submit.dataset.sending = 'true'; update();
    status.dataset.error = '';
    try {
      if (site) {
        const response = await fetch('/api/feedback', {
          method: 'POST', mode: 'same-origin', credentials: 'omit',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(attempt.body)
        });
        if (!response.ok) throw new Error(response.status === 429 ?
          'Too many reports. Please try again later.' : 'Could not send feedback. Please try again.');
        const receipt = await response.json();
        if (receipt.received !== true || receipt.id !== attempt.body.id)
          throw new Error('Feedback was not confirmed. Please retry.');
        if (revision === attempt.revision) {
          message.value = ''; pending = null; revision++;
          status.textContent = 'Feedback received. Thank you.';
        } else {
          status.textContent = 'Earlier feedback received. Your new draft is unchanged.';
        }
        update();
      } else {
        const url = 'https://rapier.website/feedback#r=' + encode(attempt.body);
        const hostOpen = globalThis.RapierPlatform?.host?.externalOpen;
        let opened = false;
        if (typeof hostOpen === 'function') opened = await hostOpen(url) !== false;
        else opened = !!window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) throw new Error('Could not open your browser. Your report is still here.');
        if (revision === attempt.revision)
          status.textContent = 'Browser opened. It will confirm when your report is received.';
      }
    } catch (error) {
      if (revision === attempt.revision) {
        status.dataset.error = 'true';
        status.textContent = error?.message || 'Could not send feedback. Please try again.';
      }
    } finally {
      delete submit.dataset.sending;
      update();
    }
  });
  update();
})();
