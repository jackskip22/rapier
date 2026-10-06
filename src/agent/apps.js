(() => {
  'use strict';
  if (globalThis.RAPIER_APPS_HOST !== true || window.RapierMcpApp) return;

  const VERSION = '2026-01-26';
  // Each switchDocument() that strands unsent edits adds an entry; a later clean switch never clears another document's. Capped by forgetting the
  // oldest entry already delivered another way (the automatic download); an entry that exists only here is never dropped.
  const STRANDED_DRAFT_LIMIT = 8;
  const pending = new Map(), listeners = new AbortController();
  const nonce = crypto.randomUUID();
  let nextId = 0, origin = null, initialized = false, closed = false, closing = false;
  let host, capabilities = {}, context = {}, token = '', base = null, incoming = null;
  let version = 0, incomingVersion = 0, presentationBlocked = false;
  let dirty = false, flight = null, continuation = null, decisionFlight = null, switching = false;
  let editEpoch = 0, lastEdit = 0, composing = false, contextEditing = false, contextEditingAt = 0;
  let running = null, timer = 0, failures = 0, connecting = null, notice, modeButton;
  let unsubscribe, observer, compareObserver, compareButtons = [], locked = [], status = 'opening';
  let importRunning = false, uploadRunning = false, homeDialog, fileDialog, homeRequested = false;
  let boundFile = null, fileOpenEpoch = 0, pendingFileResult = null;
  let receiveSequence = 0, latestOpenSequence = 0, deferredOpen = null;
  const fileHydrations = new Map(), fileAttempts = new Map(), hydratedFiles = new Set(), fileBindings = new Map();
  let contextFlight = null, contextTimer = 0, contextExpiryTimer = 0, contextEpoch = 0, contextSequence = 0, contextFailures = 0;
  let contextQueued = false, contextAck = null, contextIssue = '', unsubscribeContext;
  let modelFlight = null, modelQueued = false, modelAvailable = true, modelFailures = 0, modelSent = '';
  let policyQueued = null, reviewQueued = null, presentedReview = null, viewFlight = null, visualFlight = null;
  let openingSwitch = false;
  let imageSupportNoticeStarted = false;
  // After "Disconnect agents" the editor holds a capability no agent has; it stays out of model context until shared again from here.
  let withheld = false;
  let strandedDrafts = []; // oldest first -- see STRANDED_DRAFT_LIMIT above
  const viewed = new Set();

  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (a, b) => !!a && !!b && a.documentId === b.documentId && a.text === b.text &&
    a.filename === b.filename && a.docKind === b.docKind;
  const validToken = value => typeof value === 'string' && /^rpr_[A-Za-z0-9_-]{43}$/.test(value);
  const snapshot = value => object(value) && typeof value.documentId === 'string' &&
    value.documentId.length > 0 && value.documentId.length <= 256 && Number.isSafeInteger(value.revision) &&
    value.revision >= 0 && typeof value.text === 'string' && typeof value.filename === 'string' &&
    value.filename.length <= 512 && ['markdown', 'text', 'code'].includes(value.docKind);
  const visible = () => document.visibilityState !== 'hidden';
  // A text edit is followed by a corrected contextEditing once input settles; some changes (a checklist box) never are. Trust true only briefly.
  const contextBusy = () => contextEditing && Date.now() - contextEditingAt < 3000;
  const editing = () => composing || contextBusy() || Date.now() - lastEdit < 900;
  const metadata = result => object(result?._meta?.rapier) ? result._meta.rapier : {};
  const viewVersion = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const canImport = () => typeof window.openai?.selectFiles === 'function' &&
    typeof window.openai?.getFileDownloadUrl === 'function';
  const canUpload = () => typeof window.openai?.uploadFile === 'function';
  const activeFile = () => boundFile?.document === token && boundFile.documentId === base?.documentId ? boundFile.store : null;
  const fileDirty = () => !!activeFile() && (activeFile().pending || !activeFile().isSaved(base.text));
  const filePreserved = local => !activeFile() || (!activeFile().pending && (activeFile().isSaved(local.text) ||
    (boundFile.savedCopy?.text === local.text && boundFile.savedCopy.filename === local.filename)));

  // Before ui/initialize answers, only the bootstrap (name, version, display modes, protocol; never a document, bearer or editor key) may go to the parent
  // unaddressed: its reply names the origin. Anything else is refused, not held. After binding, only the bound origin; never 'null'.
  function post(message) {
    if (closed) return;
    if (origin === null && (message.method !== 'ui/initialize' || pending.get(message.id)?.method !== 'ui/initialize')) throw new Error('HOST_UNBOUND');
    window.parent.postMessage({jsonrpc: '2.0', ...message}, origin ?? '*');
  }

  function request(method, params, timeout = 20000) {
    if (closed) return Promise.reject(new Error('CLOSED'));
    const id = `${nonce}:${++nextId}`;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        reject(new Error('TIMEOUT'));
      }, timeout);
      pending.set(id, {resolve, reject, timeoutId, method});
      try { post({id, method, params}); }
      catch (error) { clearTimeout(timeoutId); pending.delete(id); reject(error); }
    });
  }

  function call(name, args, timeout, human = false) {
    if (!initialized || !object(capabilities.serverTools)) return Promise.reject(new Error('HOST_UNAVAILABLE'));
    // Editor operations carry the editor key: proof the call came from the person's editor.
    const own = globalThis.RapierAgentCatalog?.getTool?.(name)?.visibility?.includes('app') ||
      (human && ['document.comment', 'document.read_context'].includes(name));
    const editorKey = typeof globalThis.RAPIER_EDITOR_KEY === 'string' ? globalThis.RAPIER_EDITOR_KEY : '';
    return request('tools/call', {name, arguments: own && editorKey ? {...args, editorKey} : args}, timeout);
  }

  function button(label, action, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', event => Promise.resolve().then(() => action(event)).catch(failed), {signal: listeners.signal});
    return element;
  }

  function setStatus(value) {
    status = value;
    if (value === 'ready') void explainImageSupport();
    if (!notice) return;
    // Stranded drafts keep the notice (and its Copy/Download draft) up whatever this cycle's status says.
    const strandedText = strandedDrafts.length === 1 ? 'A draft from a document you switched away from is unsaved'
      : strandedDrafts.length > 1 ? `${strandedDrafts.length} drafts from documents you switched away from are unsaved` : '';
    const fileIssue = activeFile()?.issue;
    const fileText = {
      conflict: 'The ChatGPT file also changed. Your draft is safe here.',
      read_only: 'This file is read only. Save your edits as a new file.',
      unversioned: 'This host cannot protect concurrent file edits. Save a new file.',
      unconfirmed: 'The file save is not confirmed. Your draft is safe here.',
      too_large: 'This draft exceeds the host’s file size limit. Download a copy.'
    }[fileIssue] || '';
    const text = {
      opening: 'Opening document', reconnecting: 'Reconnecting', offline: 'Connection interrupted',
      unavailable: 'Document unavailable', expired: 'This editor session has expired. Reload to keep editing',
      unsupported: 'This host cannot connect to Rapier', detached: 'This document is open elsewhere',
      blocked: 'This update needs attention',
      review_waiting: 'A change is ready for review',
      comparison_changed: 'The comparison changed. Review it again.', comparison_refused: 'This comparison needs another look.'
    }[value] || strandedText || fileText;
    notice.hidden = !text;
    notice.firstElementChild.textContent = text || '';
    notice.children[1].hidden = !['reconnecting', 'offline', 'opening', 'blocked'].includes(value);
    notice.children[2].hidden = value !== 'review_waiting' && !fileIssue;
    notice.children[3].hidden = !base || !(['offline', 'unavailable', 'unsupported', 'detached', 'blocked', 'expired'].includes(value) || strandedDrafts.length > 0 || fileIssue);
    document.documentElement.dataset.rapierSync = value;
    updateCompareControls();
  }

  // Temporary rollout notice, only in the hosted plugin. Reuse the editor's real decode probe;
  // a release date or browser name cannot establish support inside an app's embedded browser.
  async function explainImageSupport() {
    if (imageSupportNoticeStarted) return;
    imageSupportNoticeStarted = true;
    const images = globalThis.RapierEmbeddedImages;
    if (!images || await images.whenJxlDisplayKnown() || closed) return;
    const panel = document.createElement('aside');
    panel.className = 'rapier-app-image-notice';
    panel.setAttribute('aria-labelledby', 'rapier-app-image-notice-title');
    const title = document.createElement('strong');
    title.id = 'rapier-app-image-notice-title';
    title.textContent = 'JPEG XL support is arriving';
    const explanation = document.createElement('p');
    explanation.textContent = 'This app’s browser cannot display JPEG XL (JXL) yet. JXL pictures and saved paintings may look blank or show a placeholder. Their image data stays in your document.';
    const schedule = document.createElement('p');
    schedule.textContent = 'Google schedules JXL support in Chrome 155 stable for October 6, 2026. In-app browsers may receive it later. Update your app and browser, or open your saved document in a browser with JXL support.';
    panel.append(title, explanation, schedule, button('Got it', () => panel.remove()));
    (document.getElementById('toast-root') || document.body).append(panel);
    notifySize();
  }

  function mountUi() {
    const style = document.createElement('style');
    style.textContent = `
      .rapier-app-notice{pointer-events:auto;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:var(--color-surface-2);color:var(--color-text);font:var(--text-sm)/1.5 var(--font-mono)}
      .rapier-app-notice[hidden]{display:none}.rapier-app-notice>span{flex:1 1 auto}
      .rapier-app-notice button,.rapier-app-dialog button{font:inherit;color:inherit;background:var(--color-surface-hover);border:0;border-radius:0;min-height:48px;padding:8px 14px;cursor:pointer}
      .rapier-app-dialog{max-width:min(440px,calc(100vw - 32px));padding:24px;border:0;border-radius:0;background:var(--color-bg);color:var(--color-text);font:inherit}
      .rapier-app-dialog::backdrop{background:#0009}.rapier-app-dialog h2{font-size:1.15em;margin:0 0 12px}.rapier-app-dialog p{line-height:1.5}
      .rapier-app-dialog>div{display:flex;gap:10px;flex-wrap:wrap}.rapier-app-dialog button:disabled{opacity:.5;cursor:wait}
      .rapier-app-image-notice{pointer-events:auto;width:min(440px,calc(100vw - 32px));box-sizing:border-box;padding:20px;background:var(--color-bg);color:var(--color-text);font:inherit}
      .rapier-app-image-notice strong{font-size:1.05em}.rapier-app-image-notice p{margin:12px 0;line-height:1.5}
      .rapier-app-image-notice button{font:inherit;text-transform:uppercase;color:var(--color-accent-foreground,#fff);background:var(--color-accent);border:0;border-radius:0;padding:12px 16px;cursor:pointer}
      .rapier-app-decision{font:inherit;font-size:12px;width:auto;padding:0 9px;min-height:36px}
      .rapier-app-decision:disabled{opacity:.4;cursor:default}
      #top-actions{position:relative}
      .rapier-app-fullscreen{position:absolute;inset-block-start:100%;inset-inline-end:0;background:color-mix(in srgb,var(--color-bg) 50%,transparent);border-radius:0}
      html{height:var(--rapier-app-height,560px);overflow:hidden;scroll-behavior:auto}
      body{height:100%;min-height:0;overflow:hidden}
      .editor-area,.compare-mode{min-height:0;overscroll-behavior-y:auto;margin-block-end:max(var(--native-inset-bottom,0px),var(--rapier-keyboard-occlusion,0px))}
      /* The thumb rule on the one row dense enough to need it: Reject and the close (✕) both
         discard -- a proposal, or the whole comparison -- so a phone-width finger gets real
         separation before either, not just enough gap to avoid overlap. */
      @media (max-width:480px){
        /* The bar is a fixed --top-bar-h (52px, rapier-app.css) with 48px controls already close
           to filling it -- a second row has nowhere to go without growing the bar itself, well
           outside what this fix needs. One row, real gaps instead: Reject (discard the proposal)
           and the close (discard the comparison) are the two ways this row loses work, so both
           get real clearance rather than the row's ordinary 2px rhythm; that leaves ~40px of the
           390px budget spare in the phone harness's own build, comfortably inside it. */
        #compare-actions .rapier-app-decision + .rapier-app-decision{margin-left:14px}
        #compare-actions [data-action="compare-close"]{margin-left:28px}
      }
    `;
    document.head.append(style);
    notice = document.createElement('div');
    notice.className = 'rapier-app-notice';
    notice.setAttribute('role', 'region');
    notice.setAttribute('aria-label', 'Document connection');
    const label = document.createElement('span');
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    notice.append(label, button('Retry', retry), button('Review', () => activeFile()?.issue ? reviewHostFile() : resumeReview()), button('Copy draft', downloadDraft));
    (document.getElementById('toast-root') || document.body).append(notice);

    modeButton = button('', () => requestDisplayMode(context.displayMode === 'fullscreen' ? 'inline' : 'fullscreen'), 'icon-btn rapier-app-fullscreen');
    modeButton.hidden = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({width: '22', height: '22', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'})) svg.setAttribute(key, value);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
    svg.append(path);
    modeButton.append(svg);
    document.getElementById('top-actions')?.append(modeButton);
    const homeButton = button('', showHome, 'icon-btn');
    homeButton.setAttribute('aria-label', 'Documents');
    homeButton.title = 'Documents';
    const homeSvg = svg.cloneNode(false), homePath = path.cloneNode(false);
    homePath.setAttribute('d', 'M3 9l9-7 9 7v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9m6 12v-9h6v9');
    homeSvg.append(homePath);
    homeButton.append(homeSvg);
    document.getElementById('top-actions')?.append(homeButton);
    const bar = document.getElementById('compare-actions');
    if (bar) {
      compareButtons = ['accept', 'reject'].map(action => {
        const control = button(action === 'accept' ? 'Accept' : 'Reject', event => decideComparison(action, event), 'icon-btn rapier-app-decision');
        control.hidden = true;
        bar.insertBefore(control, bar.querySelector('[data-action="compare-close"]'));
        return control;
      });
      compareObserver = new MutationObserver(updateCompareControls);
      const content = document.getElementById('compare-content');
      if (content) compareObserver.observe(content, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-current']});
    }
    lock();
    setStatus(status);
  }

  function lock() {
    for (const child of document.body.children) {
      if (['SCRIPT', 'STYLE'].includes(child.tagName) || child === notice || child.id === 'toast-root' || child.inert) continue;
      child.inert = true;
      locked.push(child);
    }
  }

  function unlock() {
    for (const element of locked) element.inert = false;
    locked = [];
  }

  // The document scrolls inside Rapier, below its toolbar. Never size the host frame from the
  // document's length: that turns the whole conversation into an unbounded editor page.
  function updateFrameLayout() {
    const dimensions = context.containerDimensions || {};
    const fixed = context.displayMode === 'fullscreen' || Number.isFinite(dimensions.height);
    const height = Number.isFinite(dimensions.maxHeight) && dimensions.maxHeight > 0
      ? Math.min(560, dimensions.maxHeight) : 560;
    document.documentElement.style.setProperty('--rapier-app-height', fixed ? '100dvh' : `${height}px`);
  }

  function updateContext(value) {
    if (!object(value)) return;
    for (const key of ['theme', 'displayMode', 'availableDisplayModes', 'containerDimensions', 'safeAreaInsets',
      'styles', 'locale', 'timeZone', 'platform', 'deviceCapabilities']) {
      if (Object.hasOwn(value, key)) context[key] = value[key];
    }
    if (context.theme === 'light' || context.theme === 'dark') {
      document.body.classList.toggle('light', context.theme === 'light');
      document.documentElement.style.colorScheme = context.theme;
    }
    updateFrameLayout();
    // Unused by Rapier's UI today; retained and reachable via window.RapierMcpApp.hostLocale().
    document.documentElement.dataset.rapierHostPlatform = typeof context.platform === 'string' ? context.platform : '';
    document.documentElement.dataset.rapierHostTouch = context.deviceCapabilities?.touch === true ? '1' :
      context.deviceCapabilities?.touch === false ? '0' : '';
    if (modeButton) {
      const mode = context.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
      modeButton.hidden = !Array.isArray(context.availableDisplayModes) || !context.availableDisplayModes.includes(mode);
      modeButton.setAttribute('aria-label', mode === 'fullscreen' ? 'Expand editor' : 'Exit fullscreen');
      modeButton.title = modeButton.getAttribute('aria-label');
      modeButton.querySelector('path').setAttribute('d', mode === 'fullscreen'
        ? 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5' : 'M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5');
    }
    if (notice) notice.children[3].textContent = object(capabilities.downloadFile) ? 'Download draft' : 'Copy draft';
    updateSafeArea();
    if (initialized) notifySize();
  }

  function updateSafeArea() {
    const insets = object(context.safeAreaInsets) ? context.safeAreaInsets : window.openai?.safeArea?.insets;
    const style = document.documentElement.style;
    let changed = false;
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const value = insets?.[edge], property = `--native-inset-${edge}`;
      const next = Number.isFinite(value) && value >= 0 ? `${value}px` : '';
      if (style.getPropertyValue(property) === next) continue;
      if (next) style.setProperty(property, next);
      else style.removeProperty(property);
      changed = true;
    }
    // The editor's viewport owner repositions its caret, review actions and floating controls.
    if (changed) window.dispatchEvent(new Event('rapier:native-insets'));
  }

  let lastSize = '';
  function notifySize() {
    if (!initialized || closed || context.displayMode === 'fullscreen' || Number.isFinite(context.containerDimensions?.height)) return;
    const height = Math.round(document.documentElement.getBoundingClientRect().height);
    if (height > 0 && height !== lastSize) {
      lastSize = height;
      post({method: 'ui/notifications/size-changed', params: {height}});
    }
  }

  async function requestDisplayMode(mode) {
    if (!['inline', 'fullscreen'].includes(mode) || !context.availableDisplayModes?.includes(mode)) return false;
    const result = await request('ui/request-display-mode', {mode});
    if (['inline', 'fullscreen'].includes(result?.mode)) updateContext({displayMode: result.mode});
    return result?.mode === mode;
  }

  function sourceRange(value, length) {
    return object(value) && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) &&
      value.start >= 0 && value.end >= value.start && value.end <= length ? {start: value.start, end: value.end} : null;
  }

  function contextRanges(captured, source) {
    // Metadata may still be pending after the same document's source was adopted.
    if (!captured || captured.documentId !== source.documentId ||
        typeof captured.text !== 'string' || typeof source.text !== 'string') return null;
    let splices;
    try {
      splices = RapierLiveMerge.sourceSplices(captured.text, source.text).reverse().map(row =>
        ({pos: row.at, removed: captured.text.slice(row.at, row.at + row.remove), inserted: row.insert}));
    } catch (_) { return null; }
    const move = value => {
      const range = sourceRange(value, captured.text.length);
      return range && sourceRange(RapierLedger.transportTouchedInterval(range.start, range.end, splices), source.text.length);
    };
    return {selection: move(captured.context?.selection), focus: move(captured.context?.focus)};
  }

  function contextChanged(event) {
    contextEpoch++;
    if (typeof event?.editing === 'boolean') { contextEditing = event.editing; contextEditingAt = Date.now(); }
    contextQueued = true;
    contextFailures = 0;
    if (event?.trusted === true && object(event.policy)) queuePolicy(event.policy);
    clearTimeout(contextTimer);
    if (!closed && !switching && initialized && base) contextTimer = setTimeout(() => void publishHumanContext(), 80);
    void publishModelContext();
  }

  async function publishHumanContext(release = false) {
    clearTimeout(contextTimer);
    if (contextFlight) {
      contextQueued = true;
      if (release) { await contextFlight; return publishHumanContext(true); }
      return contextFlight;
    }
    if (closed || !initialized || !token || !base || (!release && switching)) return false;
    const documentToken = token, source = base, epoch = contextEpoch;
    contextQueued = false;
    contextFlight = (async () => {
      let captured;
      if (!release) {
        try { captured = await host.humanContext(); }
        catch (_) { captured = {ok: false}; }
      }
      if (token !== documentToken || closed) return false;
      if (epoch === contextEpoch && typeof captured?.context?.editing === 'boolean') { contextEditing = captured.context.editing; contextEditingAt = Date.now(); }
      const active = !release && !closing && visible();
      const exact = captured?.ok === true && same(captured, source) && !dirty && !flight && !composing;
      const busy = active && (!exact || editing() || captured?.context?.editing === true ||
        (!!decisionFlight && decisionFlight.kind !== 'review') || !!policyQueued);
      const args = {document: documentToken, expectedRevision: source.revision, contextId: nonce,
        sequence: ++contextSequence, visible: active, editing: busy};
      const ranges = active && contextRanges(captured, source);
      if (ranges) Object.assign(args, ranges);
      const result = await call('document.human_context', args, 5000);
      if (token !== documentToken || closed) return false;
      if (result.isError) {
        contextIssue = result.structuredContent?.code === 'HUMAN_CONTEXT_STALE' ? 'stale' : 'unavailable';
        captureIncoming(result);
        schedule(0);
        return false;
      }
      contextFailures = 0;
      const receipt = result.structuredContent;
      if (receipt?.acknowledged !== true || receipt.contextId !== nonce || receipt.sequence !== args.sequence) return false;
      contextIssue = '';
      contextAck = {revision: source.revision, epoch,
        selection: receipt.revision === source.revision ? args.selection || null : null,
        focus: receipt.revision === source.revision ? args.focus || null : null,
        visible: active, editing: busy};
      clearTimeout(contextExpiryTimer);
      if (Number.isFinite(receipt.contextExpiresAt)) contextExpiryTimer = setTimeout(() => {
        contextAck = null;
        void publishModelContext();
      }, Math.max(0, Math.min(15000, receipt.contextExpiresAt - Date.now())));
      void publishModelContext();
      return true;
    })().catch(() => { contextIssue = 'unavailable'; contextFailures++; void publishModelContext(); return false; }).finally(() => {
      contextFlight = null;
      if (!closed && !closing && !switching && initialized && base && contextFailures < 3 && visible()) {
        contextTimer = setTimeout(() => void publishHumanContext(), contextQueued ? 80 : 5000);
      }
    });
    return contextFlight;
  }

  function modelContext() {
    if (!base) return null;
    const unsent = dirty || !!flight || composing;
    const current = !withheld && !unsent && visible() && contextAck?.visible && contextAck.revision === base.revision &&
      contextAck.epoch === contextEpoch;
    const selection = current ? contextAck.selection : null, focus = current ? contextAck.focus : null;
    const selected = !unsent && base.compare ? selectedChanges() : null;
    return {document: withheld ? null : token, agentsDisconnected: withheld, documentId: base.documentId, revision: base.revision, filename: base.filename,
      docKind: base.docKind, visible: visible(), dirty: unsent, selection, focus,
      file: activeFile() ? {name: activeFile().file.name, writable: activeFile().resource.writable,
        saved: !fileDirty(), conflict: activeFile().issue === 'conflict'} : null,
      pendingDecision: decisionFlight?.kind || (reviewQueued ? 'review' : policyQueued ? 'policy' : null),
      posture: base.collaboration?.posture || 'free', readOnly: base.collaboration?.readOnly === true,
      comparison: base.compare ? {id: base.compare.id, changeIds: selected?.ok ? selected.changeIds.slice(0, 16) : [],
        more: selected?.ok && selected.changeIds.length > 16} : null,
      review: base.collaboration?.review ? {id: base.collaboration.review.id, kind: base.collaboration.review.kind,
        status: base.collaboration.review.status} : null};
  }

  async function publishModelContext() {
    if (!initialized || closed || switching || !modelAvailable || !base) return;
    if (modelFlight) { modelQueued = true; return modelFlight; }
    const value = modelContext(), signature = JSON.stringify(value);
    if (signature === modelSent) return;
    modelQueued = false;
    // The host shows this block as an attachment the person can remove; the title names it (block _meta never reaches the model).
    modelFlight = request('ui/update-model-context', {structuredContent: {rapier: value}, content: [{type: 'text',
      text: value.dirty ? 'The person has unsaved edits; edit after they sync.' :
        'The person\'s view of the Rapier document; selection is a source range. Read with document.get_context and document.read_context before editing.',
      _meta: {'openai/title': value.filename ? 'Rapier: ' + value.filename : 'Rapier document'}}]}, 5000)
      .then(() => { modelSent = signature; modelFailures = 0; })
      .catch(error => { if (error?.code === -32601 || ++modelFailures >= 3) modelAvailable = false; })
      .finally(() => { modelFlight = null; if (modelQueued) void publishModelContext(); });
    return modelFlight;
  }

  function queuePolicy(value) {
    if (!base || switching || closed) return;
    const policy = {};
    if (['free', 'ask'].includes(value.posture)) policy.posture = value.posture;
    if (typeof value.readOnly === 'boolean') policy.readOnly = value.readOnly;
    if (!Object.keys(policy).length) return;
    policyQueued = {...policyQueued, ...policy, document: token};
    updateCompareControls();
    schedule(0);
  }

  async function commitPolicy() {
    const desired = policyQueued;
    if (!desired || desired.document !== token) { policyQueued = null; return; }
    policyQueued = null;
    decisionFlight = {tool: 'document.set_policy', kind: 'policy', args: {...desired,
      expectedRevision: base.revision, expectedVersion: version, decisionId: crypto.randomUUID()}};
    await performDecision();
  }

  function reviewDecision(value, shown) {
    if (presentedReview !== shown) return;
    if (value?.trusted !== true || !['approve', 'decline', 'apply', 'drop'].includes(value.action) ||
        value.reviewId !== shown.id || value.documentId !== shown.documentId || value.serverRevision !== shown.serverRevision ||
        value.beforeText !== shown.text || value.revision !== shown.localRevision || value.generation !== shown.generation) {
      shown.dismissed = true;
      if (!closing && !switching) setStatus('review_waiting');
      return;
    }
    if (dirty || flight || decisionFlight || switching ||
        base?.collaboration?.review?.id !== shown.id || base.revision !== shown.serverRevision || base.text !== shown.text) {
      shown.dismissed = true;
      if (!switching) setStatus('review_waiting');
      host.notify('That review changed. Inspect the current proposal before deciding.', 'info');
      return;
    }
    reviewQueued = {document: token, reviewId: shown.id, action: value.action,
      ...((value.action === 'approve' || value.action === 'apply' || value.action === 'drop') && Array.isArray(value.changeIds) ? {changeIds: value.changeIds} : {}),
      expectedRevision: shown.serverRevision, text: shown.text};
    if (!['apply', 'drop'].includes(value.action)) presentedReview = null;
    updateCompareControls();
    schedule(0);
  }

  function resumeReview() {
    if (presentedReview?.failed || presentedReview?.dismissed) presentedReview = null;
    setStatus('ready');
    schedule(0);
  }

  async function commitReview() {
    const desired = reviewQueued;
    reviewQueued = null;
    if (!desired || desired.document !== token || dirty || composing || desired.expectedRevision !== base.revision ||
        desired.text !== base.text || base.collaboration?.review?.id !== desired.reviewId ||
        base.collaboration.review.status !== 'pending') {
      host.notify('That review changed. Inspect the current proposal before deciding.', 'info');
      return;
    }
    const {text, ...args} = desired;
    decisionFlight = {tool: 'document.review_decide', kind: 'review', args: {...args,
      expectedVersion: version, decisionId: crypto.randomUUID()}};
    await performDecision();
  }

  async function acknowledgeView() {
    const sent = viewFlight;
    if (!sent || dirty || flight || composing) return;
    const result = await call('document.view_ack', sent);
    viewFlight = null;
    captureIncoming(result);
    schedule(0);
  }

  async function presentVisual(local, expected) {
    const intent = base?.visualIntent;
    if (!intent || intent.status !== 'pending' || intent.revision !== base.revision || intent.documentId !== base.documentId) {
      visualFlight = null;
      return;
    }
    if (!visualFlight || visualFlight.visualId !== intent.id) {
      const target = {document: token, documentId: base.documentId, revision: base.revision};
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(0, intent.expiresAt - Date.now()));
      let fact;
      try {
        fact = typeof host.inspectVisual === 'function'
          ? await host.inspectVisual({...intent, signal: controller.signal}, expected)
          : {outcome: 'refused', reason: 'capture_unavailable'};
      } catch (_) { fact = {outcome: 'refused', reason: 'capture_unavailable'}; }
      finally { clearTimeout(timeout); }
      if (token !== target.document || closed || closing || switching) return;
      const current = await host.snapshot();
      if (dirty || composing || !same(current, local) || current.generation !== local.generation ||
          current.revision !== local.revision || base.revision !== target.revision) fact = {outcome: 'refused', reason: 'document_changed'};
      visualFlight = {document: target.document, visualId: intent.id, expectedRevision: target.revision,
        fact: {...fact, documentId: target.documentId, revision: target.revision, scope: intent.scope}};
    }
    const sent = visualFlight;
    const result = await call('document.visual_ack', sent);
    if (visualFlight === sent) visualFlight = null;
    captureIncoming(result);
  }

  async function presentCollaboration() {
    const review = base?.collaboration?.review;
    if (presentedReview && (review?.id !== presentedReview.id || review.status !== 'pending' ||
        base.revision !== presentedReview.serverRevision || base.text !== presentedReview.text)) {
      await host.dismissReview(presentedReview.id, 'review_changed');
      presentedReview = null;
    }
    if (!base || closed || closing || switching || !visible() || dirty || flight || decisionFlight ||
        policyQueued || reviewQueued || incoming || editing()) return;
    if (viewFlight) { await acknowledgeView(); return; }
    const local = await host.snapshot();
    if (!same(local, base)) { dirty = true; contextChanged(); return; }
    const expected = {expectedDocumentId: local.documentId, expectedRevision: local.revision,
      expectedText: local.text, expectedGeneration: local.generation};
    if (base.visualIntent?.status === 'pending') { await presentVisual(local, expected); return; }
    if (review?.status === 'pending' && review.revision === base.revision) {
      if (presentedReview?.id === review.id) {
        if (presentedReview.failed || presentedReview.dismissed) setStatus('review_waiting');
        return;
      }
      const shown = {id: review.id, documentId: base.documentId, serverRevision: base.revision,
        text: base.text, localRevision: local.revision, generation: local.generation};
      presentedReview = shown;
      const result = await host.presentReview(review, base, expected, {
        onDecision: value => reviewDecision(value, shown),
        onPresentation: value => {
          if (presentedReview !== shown) return;
          shown.visible = value?.ok === true;
          if (!shown.visible) { shown.failed = true; setStatus('review_waiting'); }
          updateCompareControls();
        }
      });
      if (!result?.ok) {
        presentedReview = null;
        if (result?.outcome !== 'yielded' && !['document_not_settled', 'foreground_hand_wins', 'review_busy', 'human_edit_in_progress', 'human_review_in_progress'].includes(result?.reason)) {
          shown.failed = true;
          presentedReview = shown;
          setStatus('review_waiting');
          host.notify('That proposal could not be shown. Try changing the document view, then retry.', 'info');
        }
      }
      updateCompareControls();
      return;
    }
    const intent = base.viewIntent;
    if (!intent || intent.status !== 'pending' || intent.revision !== base.revision || viewed.has(intent.id)) return;
    const result = await host.applyView(intent, expected, base);
    if (dirty || composing || !same(await host.snapshot(), base)) return;
    if (!result?.ok && (result?.outcome === 'yielded' || ['document_not_settled', 'foreground_hand_wins', 'human_edit_in_progress'].includes(result?.reason))) return;
    viewed.add(intent.id);
    if (viewed.size > 64) viewed.delete(viewed.values().next().value);
    viewFlight = {document: token, expectedRevision: base.revision, viewId: intent.id,
      status: result?.ok ? 'presented' : 'refused', ...(result?.ok ? {} : {reason: String(result?.reason || 'view_unavailable').slice(0, 128)})};
    await acknowledgeView();
  }

  function schedule(delay = 1500) {
    clearTimeout(timer);
    if (closed || closing || switching || failures >= 5 || !initialized || !visible()) {
      return;
    }
    timer = setTimeout(() => { timer = 0; void cycle(); }, delay);
  }

  function humanEdit() {
    editEpoch++;
    lastEdit = Date.now();
    if (base) dirty = true;
    updateCompareControls();
    contextChanged();
    schedule(500);
  }

  function failed(error) {
    if (closed) return;
    failures++;
    if (error?.message === 'HOST_UNAVAILABLE' || error?.message === 'PROTOCOL_VERSION') {
      setStatus('unsupported');
      return;
    }
    setStatus(failures >= 5 ? 'offline' : 'reconnecting');
    schedule(Math.min(30000, 1500 * 2 ** (failures - 1)));
  }

  function ensureResult(result) {
    if (!object(result)) throw new Error('INVALID_RESULT');
    if (!result.isError) return true;
    const code = result.structuredContent?.code;
    const latest = metadata(result).snapshot, latestVersion = viewVersion(result.structuredContent?.version);
    if (snapshot(latest) && latestVersion !== null && (!base || latest.documentId === base.documentId)) {
      incoming = latest;
      incomingVersion = latestVersion;
    }
    if (code === 'REVISION_CONFLICT') {
      setStatus('comparison_changed');
      return false;
    }
    if (code === 'DOCUMENT_UNAVAILABLE') {
      failures = 5;
      setStatus('unavailable');
      return false;
    }
    // The editor key lasts a day (mcp/editor-keys.mjs): say so and keep the draft reachable; do not retry.
    if (code === 'HUMAN_AUTHORITY_REQUIRED') {
      failures = 5;
      setStatus('expired');
      return false;
    }
    throw new Error('TOOL_ERROR');
  }

  async function hydrateHostFile(result, file) {
    const data = result.structuredContent, initial = metadata(result).snapshot;
    if (!object(capabilities.experimental?.['openai/resource']) || !snapshot(initial) ||
        !validToken(data.document) || data.created !== true) throw new Error('FILE_HOST_UNAVAILABLE');
    const epoch = ++fileOpenEpoch;
    pendingFileResult = result;
    const work = (async () => {
      let attempt = fileAttempts.get(data.document);
      if (!attempt) {
        const resource = await globalThis.RapierHostFiles.readHostFile(request, file, globalThis.RapierAgentCatalog.MAX_TEXT_BYTES);
        attempt = {resource, args: {document: data.document, expectedRevision: initial.revision,
          text: resource.text, filename: file.name, docKind: /\.(?:md|markdown)$/i.test(file.name) ? 'markdown' : 'text',
          commitId: crypto.randomUUID()}};
        fileAttempts.set(data.document, attempt);
      }
      const {resource} = attempt;
      if (closed || closing || epoch !== fileOpenEpoch) return null;
      const committed = await call('document.commit', attempt.args);
      const value = metadata(committed).snapshot;
      if (committed.isError || !snapshot(value) ||
          value.documentId !== initial.documentId) throw new Error('FILE_OPEN_CONFLICT');
      if (closed || closing || epoch !== fileOpenEpoch) return null;
      const store = globalThis.RapierHostFiles.createHostFileBinding({request, file, resource,
        maxBytes: globalThis.RapierAgentCatalog.MAX_TEXT_BYTES, changed: () => { setStatus(status); void publishModelContext(); }});
      fileBindings.set(data.document, {document: data.document, documentId: value.documentId, store});
      hydratedFiles.add(data.document);
      fileAttempts.delete(data.document);
      pendingFileResult = null;
      return {...committed, structuredContent: {...committed.structuredContent, document: data.document, created: true, outcome: 'created'}};
    })();
    fileHydrations.set(data.document, work);
    try { return await work; }
    catch (error) { if (epoch !== fileOpenEpoch) return null; throw error; }
    finally {
      fileHydrations.delete(data.document);
      if (epoch !== fileOpenEpoch) fileAttempts.delete(data.document);
    }
  }

  function adoptHostFile() {
    if (boundFile?.document === token) return;
    const previous = boundFile;
    boundFile = fileBindings.get(token) || null;
    fileBindings.delete(token);
    if (previous) {
      previous.store.dispose();
      void request('resources/unsubscribe', {uri: previous.store.file.resourceUri}).catch(() => {});
    }
    if (boundFile) {
      const current = boundFile;
      void request('resources/subscribe', {uri: current.store.file.resourceUri}).catch(() => {});
      // Read once after subscribing to close the gap between the opening read and subscription.
      void refreshHostFile(current).catch(() => {});
    }
  }

  async function saveHostFile() {
    const store = activeFile();
    if (!store) return true;
    const documentToken = token, local = await host.snapshot();
    if (activeFile() !== store || token !== documentToken || !same(local, base) || dirty || flight || composing) return false;
    try { await store.save(local.text); }
    catch (_) { setStatus(status); return false; }
    const current = await host.snapshot();
    return activeFile() === store && token === documentToken && same(local, current) && store.isSaved(current.text);
  }

  async function refreshHostFile(binding = boundFile) {
    if (!binding || binding !== boundFile || closed || closing) return;
    try {
      await binding.store.refresh();
      if (binding !== boundFile || closed) return;
      if (binding.store.incoming) {
        if (running) await running;
        if (binding === boundFile && !closed && !closing && !switching && !editing()) {
          await useHostFileVersion(binding.store, binding.store.incoming, true);
        }
        setStatus(status);
      }
    } catch (_) {
      if (binding === boundFile && !closed) host.notify('The ChatGPT file could not be refreshed. Your draft is still here.', 'info');
    }
  }

  async function useHostFileVersion(store, resource, onlyIfUnedited = false) {
    if (!resource || activeFile() !== store || resource !== store.incoming || switching || closed || closing || !await flush()) return false;
    const local = await host.snapshot(), currentBase = base;
    if (activeFile() !== store || resource !== store.incoming || !same(local, currentBase) || dirty || composing) return false;
    if (onlyIfUnedited && (local.text !== store.resource.text || editing())) return false;
    clearTimeout(timer);
    switching = true;
    lock();
    try {
      const draft = {...local, text: resource.text};
      delete draft.journal;
      const adopted = await host.replaceDocument(draft, {expectedDocumentId: local.documentId,
        expectedRevision: local.revision, expectedText: local.text});
      if (adopted?.outcome !== 'applied') return false;
      store.accept(resource);
      dirty = true;
      await commit();
      return !dirty && !flight;
    } finally {
      switching = false;
      unlock();
      contextChanged();
      schedule();
      resumeOpen();
    }
  }

  function reviewHostFile() {
    const store = activeFile();
    if (!store || closed || closing || switching) return;
    fileDialog?.close();
    const resource = store.incoming, sheet = document.createElement('dialog');
    fileDialog = sheet;
    sheet.className = 'rapier-app-dialog';
    sheet.setAttribute('aria-label', 'Save your file');
    const title = document.createElement('h2'), text = document.createElement('p'), actions = document.createElement('div');
    title.textContent = store.file.name;
    text.textContent = resource
      ? 'The file changed outside this editor. Keep my version replaces the file; Use file version replaces this draft. Save a copy first if you want both.'
      : 'Your draft is safe in this editor. Save a new copy to ChatGPT Files or download it, or retry saving the original.';
    const act = (label, action) => button(label, async event => {
      if (event?.isTrusted !== true || activeFile() !== store) return;
      for (const child of actions.children) child.disabled = true;
      try { if (await action(event)) sheet.close(); }
      finally { for (const child of actions.children) child.disabled = false; }
    });
    actions.append(act(object(capabilities.downloadFile) ? 'Download draft' : 'Copy draft', downloadDraft));
    if (canUpload()) actions.append(act('Save to ChatGPT Files', uploadCurrent));
    if (resource) {
      actions.append(act('Keep my version', async () => {
        if (!await flush() || activeFile() !== store || store.incoming !== resource || !store.accept(resource)) return false;
        return saveHostFile();
      }), act('Use file version', () => useHostFileVersion(store, resource)));
    } else actions.append(act('Retry save', saveHostFile));
    actions.append(button('Keep editing', () => sheet.close()));
    sheet.append(title, text, actions);
    sheet.addEventListener('close', () => sheet.remove(), {once: true});
    document.body.append(sheet);
    sheet.showModal();
  }

  function resumeOpen() {
    if (!deferredOpen || switching || openingSwitch || closed || closing) return;
    const next = deferredOpen;
    deferredOpen = null;
    void receive(next.result, next.sequence).catch(failed);
  }

  async function receive(result, sequence = ++receiveSequence) {
    let data = result?.structuredContent;
    if (!object(data)) return;
    const created = !result.isError && data.created === true && data.outcome === 'created' && validToken(data.document);
    if (created) {
      if (sequence > latestOpenSequence && pendingFileResult && pendingFileResult.structuredContent?.document !== data.document) {
        pendingFileResult = null;
        fileOpenEpoch++;
      }
      latestOpenSequence = Math.max(latestOpenSequence, sequence);
    }
    if (switching || openingSwitch || closing) {
      if (created && (!deferredOpen || sequence >= deferredOpen.sequence)) deferredOpen = {result, sequence};
      return;
    }
    if (created && sequence < latestOpenSequence) return;
    // A commit used to hydrate an entrypoint can also arrive as a tool-result notification.
    // Its owning open operation must finish attaching file persistence before it is presented.
    if (fileHydrations.has(data.document)) return;
    const file = globalThis.RapierHostFiles?.fileInput(metadata(result).hostFile);
    if (file && !hydratedFiles.has(data.document) && !result.isError) {
      result = await hydrateHostFile(result, file);
      if (!result) return;
      data = result.structuredContent;
      if (sequence < latestOpenSequence || closed || closing) {
        fileBindings.get(data.document)?.store.dispose();
        fileBindings.delete(data.document);
        return;
      }
      if (switching || openingSwitch) { deferredOpen = {result, sequence}; return; }
    }
    if (metadata(result).home === true && !base) homeRequested = true;
    if (!token && validToken(data.document)) token = data.document;
    if (data.document && data.document !== token) {
      // A stray result is dropped unless it is a fresh rapier.open: outcome:'created' is set only in mcp/worker.mjs's create branch.
      if (base && !result.isError && data.created === true && data.outcome === 'created' && validToken(data.document)) {
        await switchDocument(data, result);
      }
      return;
    }
    if (base && data.documentId && data.documentId !== base.documentId) return;
    if (result.isError) {
      captureIncoming(result);
      schedule(0);
      return;
    }
    captureIncoming(result);
    schedule(0);
  }

  function captureIncoming(result) {
    const data = result?.structuredContent;
    if (!object(data)) return;
    const meta = metadata(result);
    const value = meta.currentSnapshot || meta.snapshot;
    const nextVersion = viewVersion(meta.currentSnapshot ? data.currentVersion : data.version);
    if (nextVersion !== null && nextVersion >= version && snapshot(value) &&
        (!base || value.documentId === base.documentId) && (!incoming || nextVersion >= incomingVersion)) {
      incoming = value;
      incomingVersion = nextVersion;
    }
  }

  async function loadIncoming(force = false, expected = null, immediate = false) {
    const value = incoming, nextVersion = incomingVersion;
    if (!value || (base && (value.revision < base.revision || nextVersion < version))) { incoming = null; return; }
    if (!force && base && (dirty || flight || decisionFlight || composing || contextBusy() || (!immediate && editing()))) return;
    const epoch = editEpoch;
    const local = expected || await host.snapshot();
    if (!snapshot(local)) throw new Error('INVALID_EDITOR_STATE');
    if (!force && base && !same(local, base)) { dirty = true; return; }
    if (epoch !== editEpoch) return;
    if (base && local.documentId !== base.documentId) { failures = 5; setStatus('detached'); return; }
    const result = await host.replaceDocument(value, {
      expectedDocumentId: local.documentId, expectedRevision: local.revision, expectedText: local.text
    });
    if (result?.outcome !== 'applied') {
      if (result?.sourceApplied === true) {
        base = value;
        version = nextVersion;
        continuation = {documentId: value.documentId, revision: value.revision, text: value.text, splices: [],
          metadata: {filename: local.filename, docKind: local.docKind}};
      }
      dirty = !!base && !same(await host.snapshot(), base);
      if (['conflict', 'yielded'].includes(result?.outcome)) return;
      failures = 5;
      setStatus('blocked');
      return;
    }
    base = value;
    continuation = null;
    version = nextVersion;
    adoptHostFile();
    if (incoming === value) incoming = null;
    dirty = !same(await host.snapshot(), base);
    if (!dirty && !(await host.acknowledge(base))?.ok) dirty = true;
    presentationBlocked = result.comparison?.ok === false;
    unlock();
    failures = 0;
    setStatus(presentationBlocked ? 'comparison_refused' : 'ready');
    contextChanged();
    if (homeRequested) { homeRequested = false; showHome(); }
  }

  async function sync(force = false) {
    const args = {document: token};
    if (base && !force) { args.afterRevision = base.revision; args.afterVersion = version; }
    const result = await call('document.sync', args);
    if (!ensureResult(result)) return false;
    const value = metadata(result).snapshot;
    const nextVersion = viewVersion(result.structuredContent?.version);
    if (snapshot(value) && nextVersion !== null && (!base || value.documentId === base.documentId)) {
      incoming = value;
      incomingVersion = nextVersion;
    }
    else if (result.structuredContent?.unchanged !== true) throw new Error('MISSING_SNAPSHOT');
    failures = 0;
    return true;
  }

  async function commit() {
    if (!flight) {
      const local = await host.snapshot();
      if (!snapshot(local) || local.documentId !== base.documentId) { failures = 5; setStatus('detached'); return; }
      if (same(local, base)) { dirty = false; continuation = null; return; }
      const kept = continuation?.documentId === base.documentId && continuation.revision === base.revision ? continuation : null;
      const splices = [...(kept?.splices || []), ...RapierLiveMerge.sourceEdits(kept?.text ?? base.text, local.text, local.journal)];
      const filename = local.filename === kept?.metadata?.filename ? base.filename : local.filename;
      const docKind = local.docKind === kept?.metadata?.docKind ? base.docKind : local.docKind;
      flight = {
        document: token, expectedRevision: base.revision, text: local.text, splices,
        ...(filename !== base.filename ? {filename} : {}),
        ...(docKind !== base.docKind ? {docKind} : {}), commitId: crypto.randomUUID()
      };
    }
    const sent = flight;
    const result = await call('document.commit', sent);
    if (!ensureResult(result)) return;
    const meta = metadata(result), value = meta.snapshot;
    const nextVersion = viewVersion(result.structuredContent?.version);
    if (!snapshot(value) || nextVersion === null || value.documentId !== base.documentId || value.revision < sent.expectedRevision) throw new Error('MISSING_SNAPSHOT');
    const local = await host.snapshot();
    if (!snapshot(local) || local.documentId !== base.documentId) { failures = 5; setStatus('detached'); return; }
    // The acknowledgement includes concurrent edits. Rebase any further typing from
    // the submitted draft before moving the base; a failed CAS keeps this receipt live.
    const {sourceEdits, mergeSource, replay} = RapierLiveMerge;
    const remote = value.draftEdits;
    if (!Array.isArray(remote) || remote.some(row => typeof row.client !== 'string' || !Array.isArray(row.splices)) ||
        replay(sent.text, remote) !== value.text) throw new Error('MISSING_COMMIT_EDITS');
    const kept = continuation?.commitId === sent.commitId ? continuation : null;
    const continued = kept
      ? mergeSource(value.text, [...kept.splices, ...sourceEdits(kept.text, local.text, local.journal)], 'human', [])
      : mergeSource(sent.text, sourceEdits(sent.text, local.text, local.journal), 'human', remote);
    const {text} = continued;
    const adopted = {...value, text,
      filename: local.filename === (sent.filename ?? continuation?.metadata?.filename ?? base.filename) ? value.filename : local.filename,
      docKind: local.docKind === (sent.docKind ?? continuation?.metadata?.docKind ?? base.docKind) ? value.docKind : local.docKind};
    // This local continuation is not a server journal suffix. Its exact source change
    // is recorded by the editor, while the original authors remain in the server journal.
    if (text !== value.text) delete adopted.journal;
    if (!same(local, adopted)) {
      const applied = await host.replaceDocument(adopted, {expectedDocumentId: local.documentId,
        expectedRevision: local.revision, expectedText: local.text});
      if (applied?.outcome !== 'applied') {
        if (applied?.sourceApplied === true)
          continuation = {documentId: value.documentId, revision: value.revision, commitId: sent.commitId, text, splices: continued.splices,
            ...(continuation?.metadata ? {metadata: continuation.metadata} : {})};
        dirty = true;
        if (!['conflict', 'yielded'].includes(applied?.outcome)) { failures = 5; setStatus('blocked'); }
        return;
      }
    }
    base = value;
    continuation = {documentId: value.documentId, revision: value.revision, text, splices: continued.splices};
    version = nextVersion;
    flight = null;
    if (incoming && incomingVersion <= version) incoming = null;
    if (!incoming) { incoming = value; incomingVersion = version; }
    if (snapshot(meta.currentSnapshot) && meta.currentSnapshot.documentId === base.documentId &&
        viewVersion(result.structuredContent?.currentVersion) > version) {
      incoming = meta.currentSnapshot;
      incomingVersion = result.structuredContent.currentVersion;
    }
    dirty = !same(await host.snapshot(), base);
    if (!dirty) continuation = null;
    if (!dirty && !(await host.acknowledge(base))?.ok) dirty = true;
    failures = 0;
    setStatus('ready');
    contextChanged();
  }

  function cycle(force = false) {
    if (running) return running;
    if (closed || switching || !initialized || !token || !host || (!force && (!visible() || failures >= 5))) return Promise.resolve(false);
    running = (async () => {
      if (!base) {
        if (!incoming && !await sync()) return false;
        await loadIncoming(false, null, force);
      } else {
        const local = await host.snapshot();
        if (local.documentId !== base.documentId) { failures = 5; setStatus('detached'); return false; }
        dirty = !same(local, base);
        if (decisionFlight) await performDecision();
        else if (reviewQueued) await commitReview();
        else if (flight || dirty) {
          if (composing) return false;
          await commit();
          if (!dirty && incoming) await loadIncoming(false, null, force);
        } else if (policyQueued) await commitPolicy();
        else if (!editing() || force) {
          if (!incoming && !await sync()) return false;
          await loadIncoming(false, null, force);
        }
      }
      await presentCollaboration();
      if (base && !dirty && !flight) await saveHostFile();
      return !!base && !dirty && !flight && !decisionFlight && !policyQueued && !reviewQueued && !incoming;
    })().catch(error => { failed(error); return false; }).finally(() => {
      running = null;
      updateCompareControls();
      schedule(failures ? Math.min(30000, 1500 * 2 ** (failures - 1)) : policyQueued || reviewQueued ? 0 : dirty ? 500 : 1500);
    });
    return running;
  }

  async function flush() {
    clearTimeout(timer);
    if (running) await running;
    return cycle(true);
  }

  async function retry() {
    failures = 0;
    contextFailures = 0;
    if (presentedReview?.failed) presentedReview = null;
    if (!initialized) await connect();
    if (pendingFileResult && !fileHydrations.size) await receive(pendingFileResult);
    contextChanged();
    await flush();
  }

  async function invokeOperation(name, args = {}, human = false) {
    const tool = globalThis.RapierAgentCatalog?.TOOLS?.find(entry => entry.name === name);
    if (!tool) throw new Error('UNKNOWN_TOOL');
    globalThis.RapierAgentCatalog.validateInput(tool.inputSchema, args);
    const target = {document: token, documentId: base?.documentId};
    const current = () => !!base && token === target.document && base.documentId === target.documentId && !closed && !closing && !switching;
    if (!current()) return {isError: true, structuredContent: {outcome: 'refused', reason: 'document_changed'}};
    if (!await flush()) return {isError: true, structuredContent: {outcome: 'refused', reason: 'unsent_draft'}};
    if (!current()) return {isError: true, structuredContent: {outcome: 'refused', reason: 'document_changed'}};
    const local = await host.snapshot();
    if (!current() || !same(local, base) || dirty || flight || composing) {
      return {isError: true, structuredContent: {outcome: 'refused', reason: 'document_changed'}};
    }
    clearTimeout(timer);
    running = (async () => {
      // Each invoke is its own operation, named once.
      const result = await call(name, {...args, document: target.document, operation_id: crypto.randomUUID()}, undefined, human);
      if (!result.isError) {
        await receive(result);
        if (incoming) await loadIncoming();
      }
      return result;
    })().finally(() => { running = null; schedule(); });
    return running;
  }

  function invoke(name, args = {}) { return invokeOperation(name, args); }

  async function invokeComment(name, args, event) {
    if (!(event instanceof Event) || event.isTrusted !== true || !['document.comment', 'document.list_comments', 'document.read_context'].includes(name)) {
      return {isError: true, structuredContent: {outcome: 'refused', reason: 'human_authority_required'}};
    }
    return invokeOperation(name, args, true);
  }

  async function openDocument(args = {}, {admission = () => true} = {}) {
    const catalog = globalThis.RapierAgentCatalog;
    catalog.validateInput(catalog.getTool('rapier.open').inputSchema, args);
    if (Object.hasOwn(args, 'document') || Object.hasOwn(args, 'file') || switching || closing || closed || fileHydrations.size) return false;
    if (base && !await flush()) return false;
    if (base) await saveHostFile();
    if (!base && token) return false;
    const local = await host.snapshot();
    if (!admission() || (base && !same(local, base)) || !filePreserved(local) || dirty || flight || decisionFlight) return false;
    clearTimeout(timer);
    switching = true;
    lock();
    setStatus('opening');
    running = (async () => {
      await publishHumanContext(true);
      if (presentedReview) await host.dismissReview(presentedReview.id, 'document_changed');
      const result = await call('rapier.open', args);
      const value = metadata(result).snapshot, nextVersion = viewVersion(result.structuredContent?.version);
      const nextToken = result.structuredContent?.document;
      if (result.isError || !snapshot(value) || nextVersion === null || !validToken(nextToken)) throw new Error('OPEN_FAILED');
      const replaced = await host.replaceDocument(value, {
        expectedDocumentId: local.documentId, expectedRevision: local.revision, expectedText: local.text
      });
      if (replaced?.outcome !== 'applied') throw new Error('OPEN_REFUSED');
      token = nextToken;
      base = value;
      continuation = null;
      version = nextVersion;
      adoptHostFile();
      incoming = null;
      contextAck = null;
      presentedReview = null;
      policyQueued = null;
      reviewQueued = null;
      viewFlight = null;
      visualFlight = null;
      viewed.clear();
      presentationBlocked = replaced.comparison?.ok === false;
      dirty = !same(await host.snapshot(), base);
      if (!dirty && !(await host.acknowledge(base))?.ok) dirty = true;
      failures = 0;
      setStatus(presentationBlocked ? 'comparison_refused' : 'ready');
      homeDialog?.close();
      return !dirty;
    })().catch(error => { failed(error); return false; }).finally(() => {
      switching = false;
      running = null;
      unlock();
      updateCompareControls();
      contextChanged();
      schedule();
      resumeOpen();
    });
    return running;
  }

  // The model opened another document here. flush() runs before `switching` is set (cycle() refuses once it is); whatever it could not save
  // becomes its own strandedDrafts entry, oldest first, and is downloaded when the host allows. Never overwrite an earlier stranded draft.
  async function switchDocument(data, result) {
    if (openingSwitch || switching || closed) return false;
    const value = metadata(result).snapshot;
    const nextVersion = viewVersion(result.structuredContent?.version);
    const nextToken = data.document;
    if (!snapshot(value) || nextVersion === null || !validToken(nextToken) || !base || value.documentId === base.documentId) return false;
    openingSwitch = true;
    try {
      let notice = '';
      if (presentedReview) await host.dismissReview(presentedReview.id, 'document_changed');
      const before = await host.snapshot();
      if (dirty || flight || !same(before, base)) {
        dirty = true;
        await flush();
      }
      const fileSaved = await saveHostFile();
      // Read the outgoing identity and text once, after flush() and before lock(): the retry may only overwrite this snapshot, never a fresh read.
      const settled = await host.snapshot();
      const outgoing = settled;
      if (dirty || flight || !same(settled, base) || (!fileSaved && !filePreserved(settled))) {
        // Record before the download attempt: if the download throws, the draft must already be listed.
        const record = {text: settled.text, filename: settled.filename, docKind: settled.docKind, delivered: false};
        strandedDrafts.push(record);
        const sent = object(capabilities.downloadFile) && await exportFile(new Blob([settled.text], {type: 'text/plain;charset=utf-8'}), settled.filename);
        record.delivered = !!sent;
        // Bound the list now (STRANDED_DRAFT_LIMIT); only entries delivered elsewhere are forgotten, else it grows past the cap.
        while (strandedDrafts.length > STRANDED_DRAFT_LIMIT) {
          const dropIndex = strandedDrafts.findIndex(entry => entry.delivered);
          if (dropIndex === -1) break;
          strandedDrafts.splice(dropIndex, 1);
        }
        notice = sent ? `Switched to a new document. Your unsent changes to “${settled.filename}” were downloaded first.`
          : `Switched to a new document. Your unsent changes to “${settled.filename}” are kept -- use Copy draft to recover them.`;
      } else {
        // This switch had nothing unsent; strandedDrafts from earlier switches stay as they are.
        notice = base.filename ? `Switched to a new document. “${base.filename}” was saved.` : 'Switched to a new document.';
      }
      clearTimeout(timer);
      switching = true;
      lock();
      setStatus('opening');
      // replaceDocument() yields mid-keystroke (lastInputAt < 900 ms); a one-shot switch retries here, briefly, against the one captured snapshot.
      let replaced = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        replaced = await host.replaceDocument(value, {
          expectedDocumentId: outgoing.documentId, expectedRevision: outgoing.revision, expectedText: outgoing.text
        });
        if (replaced?.outcome === 'applied' || !['yielded', 'conflict'].includes(replaced?.outcome)) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (replaced?.outcome !== 'applied') throw new Error('OPEN_REFUSED');
      token = nextToken;
      base = value;
      continuation = null;
      version = nextVersion;
      adoptHostFile();
      incoming = null;
      contextAck = null;
      presentedReview = null;
      policyQueued = null;
      reviewQueued = null;
      viewFlight = null;
      visualFlight = null;
      viewed.clear();
      presentationBlocked = replaced.comparison?.ok === false;
      dirty = !same(await host.snapshot(), base);
      if (!dirty && !(await host.acknowledge(base))?.ok) dirty = true;
      failures = 0;
      setStatus(presentationBlocked ? 'comparison_refused' : 'ready');
      homeDialog?.close();
      host.notify(notice, 'info');
      return true;
    } catch (error) {
      failed(error);
      return false;
    } finally {
      openingSwitch = false;
      switching = false;
      unlock();
      updateCompareControls();
      contextChanged();
      schedule();
      resumeOpen();
    }
  }

  async function saveCurrent(options = {}) {
    let saved = false, outcome = 'pending';
    if (options.signal?.aborted) outcome = 'cancelled';
    else if (base && options.forceSaveAs === true) {
      const binding = boundFile;
      const local = await host.snapshot();
      const accepted = await exportFile(new Blob([local.text], {type: 'text/plain;charset=utf-8'}), local.filename);
      if (accepted) rememberFileCopy(binding, local);
      outcome = accepted ? 'dispatched' : 'cancelled';
    } else if (base) {
      saved = await flush();
      saved = await saveHostFile() && saved;
      saved = saved && !dirty && !flight && !decisionFlight && same(await host.snapshot(), base);
      outcome = saved ? 'confirmed' : 'pending';
    }
    const local = host && base ? await host.snapshot() : null;
    const receipt = Object.freeze({status: outcome, saved, confirmed: saved, verified: saved,
      filename: local?.filename || '', documentAuthority: local?.documentId || '',
      generation: local?.generation ?? 0, documentRevision: local?.revision ?? 0});
    return options.returnReceipt === true ? receipt : saved;
  }

  function selectedChanges(options) {
    const selection = host?.compareSelection?.(base?.compare, options);
    if (!selection?.ok) return selection || {ok: false, reason: 'comparison_unavailable'};
    if (selection.changeIds.length > 128) return {ok: false, reason: 'comparison_too_large'};
    return selection;
  }

  function updateCompareControls() {
    const comparison = base?.compare;
    const selection = comparison ? selectedChanges() : null;
    const ready = !!selection?.ok && failures < 5 && !presentationBlocked && !dirty && !flight && !decisionFlight &&
      !policyQueued && !reviewQueued && !presentedReview && !switching;
    for (const [index, control] of compareButtons.entries()) {
      control.hidden = !comparison;
      control.disabled = !ready;
      const action = index ? 'Reject' : 'Accept';
      const meaning = comparison?.reviewOnly ? (index ? 'Undo this change' : 'Keep this change') : `${action} this proposal`;
      control.title = selection?.reason === 'comparison_too_large' ? 'This difference has too many changes for one decision.' :
        selection && !selection.ok ? 'This difference cannot be decided exactly in this view.' : meaning;
      control.setAttribute('aria-label', `${meaning} in the current difference`);
    }
    void publishModelContext();
  }

  async function performDecision() {
    const task = decisionFlight;
    if (!task) return false;
    if (!task.sent && task.kind === 'review' && (task.args.action === 'approve' || task.args.action === 'apply') && base.collaboration?.review?.kind === 'proposal') {
      if (contextFlight) await contextFlight;
      if (!await publishHumanContext()) {
        if (contextIssue !== 'stale') throw new Error('CONTEXT_UNAVAILABLE');
        decisionFlight = null;
        await sync(true);
        await loadIncoming(false, null, true);
        host.notify('That proposal changed. Review the current document before deciding.', 'info');
        return false;
      }
      if (dirty || flight || composing || contextBusy() || contextAck?.editing) {
        decisionFlight = null;
        host.notify('Finish the current edit, then review that proposal again.', 'info');
        return false;
      }
    }
    task.sent = true;
    const result = await call(task.tool, task.args);
    const value = metadata(result).snapshot, nextVersion = viewVersion(result.structuredContent?.version);
    if (!snapshot(value) || value.documentId !== base.documentId || nextVersion === null) {
      if (result.structuredContent?.code === 'DOCUMENT_UNAVAILABLE') {
        decisionFlight = null;
        return ensureResult(result);
      }
      if (result.isError) {
        decisionFlight = null;
        host.notify('That decision could not be applied. Review the current document and try again.', 'info');
        return false;
      }
      throw new Error('MISSING_SNAPSHOT');
    }
    decisionFlight = null;
    incoming = value;
    incomingVersion = nextVersion;
    dirty = !same(await host.snapshot(), base);
    if (result.isError && result.structuredContent?.code === 'REVISION_CONFLICT' && dirty) {
      return false;
    }
    failures = 0;
    await loadIncoming(false, null, true);
    if (task.kind === 'review' && ['apply', 'drop'].includes(task.args.action) && presentedReview && base) {
      const live = base.collaboration?.review;
      if (live?.status === 'pending' && live.id === presentedReview.id) {
        presentedReview.serverRevision = base.revision;
        presentedReview.text = base.text;
        presentedReview.localRevision = base.revision;
      } else presentedReview = null;
    }
    if (result.isError) {
      if (task.kind === 'compare') setStatus(result.structuredContent?.code === 'REVISION_CONFLICT' ? 'comparison_changed' : 'comparison_refused');
      else host.notify('The document changed before that decision arrived. Review it and try again.', 'info');
    }
    // Publish the saved decision as document context. Accept/Reject is not a request to send a chat prompt.
    contextChanged();
    return !result.isError;
  }

  async function decideComparison(action, event) {
    if (!(event instanceof Event) || !event.isTrusted || !['accept', 'reject', 'close'].includes(action)) return false;
    if (action === 'close' && presentedReview && !presentedReview.failed && !presentedReview.dismissed) {
      await host.dismissReview(presentedReview.id, 'review_dismissed');
      return true;
    }
    if (!base?.compare ||
        switching || dirty || flight || decisionFlight) return false;
    // advance:true only here: if the pointed hunk is settled, move the shared pointer to the next decidable hunk before deciding.
    const selection = action === 'close' ? {ok: true} : selectedChanges({advance: true});
    if (!selection?.ok) { setStatus('comparison_refused'); return false; }
    const expectedRevision = base.revision, expectedVersion = version, compareId = base.compare.id;
    if (!await flush() || expectedRevision !== base.revision || expectedVersion !== version || compareId !== base.compare?.id) {
      setStatus('comparison_changed');
      return false;
    }
    clearTimeout(timer);
    decisionFlight = {tool: 'document.compare_decide', kind: 'compare', args: {document: token, expectedRevision, expectedVersion, compareId, action,
      ...(action === 'close' ? {} : {changeIds: selection.changeIds}), decisionId: crypto.randomUUID()}};
    contextChanged();
    updateCompareControls();
    running = performDecision().catch(error => { failed(error); return false; }).finally(() => {
      running = null;
      updateCompareControls();
      schedule();
    });
    return running;
  }

  async function exportFile(blob, filename) {
    if (!object(capabilities.downloadFile)) return false;
    const resource = {uri: `rapier://export/${encodeURIComponent(filename || 'document.txt')}`, mimeType: blob.type || 'application/octet-stream'};
    if (/^text\//.test(resource.mimeType)) resource.text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await blob.arrayBuffer());
    else {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      resource.blob = btoa(binary);
    }
    const result = await request('ui/download-file', {contents: [{type: 'resource', resource}]});
    return object(result) && result.isError !== true;
  }

  function recentHostFiles() {
    let records = [];
    try { records = JSON.parse(localStorage.getItem('rapier.apps.recent-files:' + origin) || '[]'); } catch (_) {}
    const privateRecords = window.openai?.widgetState?.privateContent?.rapierRecentFiles;
    if (Array.isArray(privateRecords)) records = [...(Array.isArray(records) ? records : []), ...privateRecords];
    const unique = new Map();
    for (const value of Array.isArray(records) ? records : []) {
      if (object(value) && typeof value.fileId === 'string' && value.fileId && typeof value.fileName === 'string' && value.fileName) {
        unique.set(value.fileId, {fileId: value.fileId, fileName: value.fileName,
          mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'text/plain'});
      }
    }
    return [...unique.values()];
  }

  function rememberHostFile(file) {
    const records = recentHostFiles().filter(value => value.fileId !== file.fileId);
    records.unshift({fileId: file.fileId, fileName: file.fileName, mimeType: file.mimeType || 'text/plain'});
    // Descriptors only: document source, workspace capabilities and expiring download URLs do
    // not belong in browser history or the host's model-visible widget state.
    try { localStorage.setItem('rapier.apps.recent-files:' + origin, JSON.stringify(records)); } catch (_) {}
    const api = window.openai;
    if (typeof api?.setWidgetState === 'function') {
      const state = object(api.widgetState) ? api.widgetState : {};
      try {
        void Promise.resolve(api.setWidgetState({...state,
          privateContent: {...(object(state.privateContent) ? state.privateContent : {}), rapierRecentFiles: records}})).catch(() => {});
      } catch (_) {}
    }
  }

  function showHome() {
    if (closed || closing || switching) return false;
    if (homeDialog?.open) return true;
    homeDialog?.remove();
    const sheet = document.createElement('dialog');
    homeDialog = sheet;
    sheet.className = 'rapier-app-dialog';
    sheet.setAttribute('aria-label', 'Rapier documents');
    const title = document.createElement('h2'), actions = document.createElement('div');
    title.textContent = 'Your documents';
    actions.append(button('New document', async () => { await openDocument({text: '', filename: 'untitled.md', docKind: 'markdown'}); }));
    if (canImport()) actions.append(button('Open from ChatGPT Files', async event => { if (await importFile(event)) sheet.close(); }));
    actions.append(button('Open from device', async event => { if (await openLocalFile(event)) sheet.close(); }));
    if (base && canUpload()) actions.append(button('Save to ChatGPT Files', uploadCurrent));
    sheet.append(title, actions);
    const records = recentHostFiles();
    if (records.length && typeof window.openai?.getFileDownloadUrl === 'function') {
      const heading = document.createElement('p'), recent = document.createElement('div');
      heading.textContent = 'Recently opened or saved';
      for (const file of records) recent.append(button(file.fileName, async event => { if (await importFile(event, file)) sheet.close(); }));
      sheet.append(heading, recent);
    }
    sheet.append(button(base ? 'Back to document' : 'Close', () => sheet.close()));
    document.body.append(sheet);
    sheet.showModal();
    return true;
  }

  async function openLocalFile(event) {
    if (!(event instanceof Event) || event.isTrusted !== true || importRunning || switching || closed || closing) return false;
    importRunning = true;
    const openedToken = token;
    try {
      const input = document.createElement('input');
      input.type = 'file';
      const file = await new Promise(resolve => {
        input.addEventListener('change', () => resolve(input.files?.[0] || null), {once: true});
        input.addEventListener('cancel', () => resolve(null), {once: true});
        input.click();
      });
      if (!file || closed || closing || token !== openedToken) return false;
      const loaded = await host.readFile(file, file.name);
      if (!loaded || closed || closing || token !== openedToken) return false;
      const opened = await openDocument({text: loaded.text, filename: loaded.filename, ...(loaded.docKind ? {docKind: loaded.docKind} : {})},
        {admission: () => token === openedToken && host.importCurrent(loaded)});
      if (opened && loaded.importSummary) host.acceptImport(loaded);
      return opened;
    } finally { importRunning = false; }
  }

  async function uploadCurrent(event) {
    if (!(event instanceof Event) || event.isTrusted !== true || !canUpload() || !base || switching || closed || closing || uploadRunning) return false;
    uploadRunning = true;
    const openedToken = token, binding = boundFile;
    try {
      const local = await host.snapshot();
      if (openedToken !== token || closed || closing || switching || local.documentId !== base?.documentId) return false;
      const mimeType = local.docKind === 'markdown' ? 'text/markdown' : 'text/plain';
      const result = await window.openai.uploadFile(new File([local.text], local.filename, {type: mimeType}), {library: true});
      if (typeof result?.fileId !== 'string' || !result.fileId) throw new Error('FILE_UPLOAD_UNCONFIRMED');
      rememberHostFile({fileId: result.fileId, fileName: local.filename, mimeType});
      rememberFileCopy(binding, local);
      if (!closed) {
        const current = await host.snapshot();
        host.notify(openedToken === token && same(local, current)
          ? 'A copy was uploaded to ChatGPT. It is saved in Files when your file library is available.'
          : 'The captured version was uploaded to ChatGPT. Your newer edits are still here.', 'info');
      }
      return true;
    } catch (_) {
      if (!closed) host.notify('The upload was not confirmed. Your draft is still here; try again or download a copy.', 'error');
      return false;
    } finally { uploadRunning = false; }
  }

  async function importFile(event, selected = null) {
    if (!(event instanceof Event) || !event.isTrusted || (!selected && !canImport()) ||
        typeof window.openai?.getFileDownloadUrl !== 'function' || importRunning || switching || closed || closing) return false;
    importRunning = true;
    const openedToken = token;
    const controller = new AbortController();
    let timeout;
    try {
      const files = selected ? [selected] : await window.openai.selectFiles();
      if (!Array.isArray(files) || !files.length) return false;
      if (files.length !== 1) {
        host.notify('Choose one file to open.', 'info');
        return false;
      }
      const file = files[0];
      if (typeof file.fileId !== 'string' || !file.fileId || typeof file.fileName !== 'string' || !file.fileName) throw new Error('FILE_INVALID');
      const link = await window.openai.getFileDownloadUrl({fileId: file.fileId});
      const url = new URL(link?.downloadUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('FILE_INVALID');
      // The deployment's file-download origins: any other origin is refused before the network; none configured means no download.
      const allowedOrigins = Array.isArray(globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS) ? globalThis.RAPIER_FILE_DOWNLOAD_ORIGINS : [];
      if (!allowedOrigins.includes(url.origin)) throw new Error('FILE_ORIGIN_REFUSED');
      timeout = setTimeout(() => controller.abort(), 20000);
      // A checked first URL does not authorize a redirect's next origin. Require a direct link.
      const response = await fetch(url.href, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal});
      if (!response.ok || !response.body) throw new Error('FILE_UNAVAILABLE');
      const limit = globalThis.RapierAgentCatalog.MAX_TEXT_BYTES;
      if (Number(response.headers.get('content-length')) > limit) throw new Error('FILE_TOO_LARGE');
      const reader = response.body.getReader(), parts = [];
      let bytes = 0;
      for (;;) {
        const row = await reader.read();
        if (row.done) break;
        bytes += row.value.byteLength;
        if (bytes > limit) { await reader.cancel(); throw new Error('FILE_TOO_LARGE'); }
        parts.push(row.value);
      }
      clearTimeout(timeout);
      const loaded = await host.readFile(new Blob(parts, {type: file.mimeType || 'application/octet-stream'}), file.fileName);
      if (!loaded || token !== openedToken || switching || closed || closing) return false;
      const opened = await openDocument({text: loaded.text, filename: loaded.filename, ...(loaded.docKind ? {docKind: loaded.docKind} : {})},
        {admission: () => token === openedToken && host.importCurrent(loaded)});
      if (opened && loaded.importSummary) host.acceptImport(loaded);
      if (opened) {
        rememberHostFile(file);
        host.notify('Opened an editable copy. Save to ChatGPT Files keeps a new file in ChatGPT.', 'info');
      }
      return opened;
    } catch (error) {
      if (!closed && error?.name !== 'AbortError') host.notify(error?.rapierImport ? 'Import failed: ' + error.message : error?.message === 'FILE_TOO_LARGE' ? 'That file is too large. Open a file under 25 MiB.' :
        'That file could not be opened. Try downloading it and opening the local copy.', 'error');
      return false;
    } finally {
      clearTimeout(timeout);
      controller.abort();
      importRunning = false;
    }
  }

  // Remove exactly the draft this recovery captured, if still listed, then setStatus so the notice shows what remains.
  function retireStrandedDraft(stranded) {
    if (!stranded) return;
    const index = strandedDrafts.indexOf(stranded);
    if (index === -1) return;
    strandedDrafts.splice(index, 1);
    setStatus(status);
  }

  function rememberFileCopy(binding, local) {
    if (binding && boundFile === binding && binding.documentId === local.documentId) {
      binding.savedCopy = {text: local.text, filename: local.filename};
    }
  }

  async function downloadDraft() {
    // A stranded draft first (host.snapshot() cannot reach it); oldest first, one per press.
    const stranded = strandedDrafts[0];
    const binding = stranded ? null : boundFile;
    const local = stranded || await host.snapshot();
    const delivered = () => { rememberFileCopy(binding, local); retireStrandedDraft(stranded); };
    if (object(capabilities.downloadFile)) {
      const sent = await exportFile(new Blob([local.text], {type: 'text/plain;charset=utf-8'}), local.filename);
      if (sent) delivered();
      return sent;
    }
    try {
      await navigator.clipboard.writeText(local.text);
      delivered();
    }
    catch (_) {
      const sheet = document.createElement('dialog'), field = document.createElement('textarea');
      sheet.className = 'rapier-app-dialog';
      sheet.setAttribute('aria-label', 'Copy your draft');
      field.readOnly = true;
      field.value = local.text;
      field.setAttribute('aria-label', 'Draft text. Select all and copy.');
      field.style.cssText = 'width:100%;height:40vh;font:inherit';
      sheet.append(field, button('I copied it', () => { delivered(); sheet.close(); }));
      sheet.addEventListener('close', () => sheet.remove(), {once: true});
      document.body.append(sheet);
      sheet.showModal();
      field.focus();
      field.select();
    }
  }

  // "Disconnect agents": rotate the capability; the successor returns sealed to the editor key, is unsealed here and withheld from the model
  // until shared. Needs a trusted event, as setPolicy.
  async function disconnectAgents(event) {
    if (event?.isTrusted !== true || !base || switching || closed || decisionFlight) return false;
    const target = {document: token, documentId: base.documentId};
    const editorKey = typeof globalThis.RAPIER_EDITOR_KEY === 'string' ? globalThis.RAPIER_EDITOR_KEY : '';
    const unseal = globalThis.RapierDoorIdentity?.unsealForEditor;
    if (!editorKey || typeof unseal !== 'function') { host.notify('This editor cannot disconnect agents here.', 'info'); return false; }
    const agreed = await confirmSheet('Disconnect agents?', 'Every agent holding this document loses access now. Your editor keeps the document. To let an agent back in, share it again from here.', 'Disconnect');
    if (!agreed) return false;
    if (!await flush()) { host.notify('Finish the current edit, then try again.', 'info'); return false; }
    if (token !== target.document || base?.documentId !== target.documentId || switching || closed || closing) return false;
    clearTimeout(timer);
    switching = true;
    lock();
    try {
      const result = await call('document.rotate_capability', {document: target.document});
      if (result?.isError || result?.structuredContent?.rotated !== true) {
        if (result?.structuredContent?.code === 'DOCUMENT_UNAVAILABLE' || result?.structuredContent?.code === 'HUMAN_AUTHORITY_REQUIRED') ensureResult(result);
        else host.notify('Agents could not be disconnected. Try again.', 'error');
        return false;
      }
      const next = await unseal(editorKey, result.structuredContent.sealed);
      if (!validToken(next)) {
        // The old capability is already retired; without the successor this editor has no way in.
        failures = 5;
        setStatus('unavailable');
        host.notify('The new capability could not be read. Copy your draft.', 'error');
        return false;
      }
      if (boundFile?.document === target.document && boundFile.documentId === target.documentId) boundFile.document = next;
      token = next;
      withheld = true;
      modelSent = '';
      host.notify('Agents disconnected. Share the document to let one back in.', 'success');
      return true;
    } finally {
      switching = false;
      unlock();
      contextChanged();
      schedule(0);
      resumeOpen();
    }
  }

  // "Send to chat" gives the capability to this chat's model and lifts the withholding; "Copy" is for another agent and keeps it withheld.
  async function shareDocument(event) {
    if (event?.isTrusted !== true || !base || !withheld || closed) return false;
    return new Promise(resolve => {
      const sheet = document.createElement('dialog');
      sheet.className = 'rapier-app-dialog';
      sheet.setAttribute('aria-labelledby', 'rapier-app-share-title');
      const title = document.createElement('h2');
      title.id = 'rapier-app-share-title';
      title.textContent = 'Share this document with an agent';
      const text = document.createElement('p');
      text.textContent = 'An agent that receives this document capability can read and edit the document under your FREE or ASK control until you disconnect agents again.';
      const field = document.createElement('input');
      field.type = 'text';
      field.readOnly = true;
      field.value = token;
      field.setAttribute('aria-label', 'Document capability');
      field.style.cssText = 'width:100%;font:inherit;padding:9px 10px;border-radius:7px;border:1px solid currentColor;background:none;color:inherit;box-sizing:border-box';
      const actions = document.createElement('div');
      let settled = false;
      const finish = outcome => { if (settled) return; settled = true; sheet.close(); resolve(outcome); };
      if (object(capabilities.message)) actions.append(button('Send to chat', async () => {
        try {
          await request('ui/message', {role: 'user', content: [{type: 'text', text: 'Rapier document capability: ' + token + '\nUse it as the document argument of the Rapier tools.'}]});
          withheld = false;
          modelSent = '';
          contextChanged();
          host.notify('Sent to chat.', 'info');
          finish(true);
        } catch (_) { host.notify('Could not reach the chat.', 'error'); }
      }));
      actions.append(button('Copy', async () => {
        try { await navigator.clipboard.writeText(token); host.notify('Copied.', 'info'); finish(true); }
        catch (_) { field.focus(); field.select(); host.notify('Select the value and copy it.', 'info'); }
      }), button('Done', () => finish(false)));
      sheet.append(title, text, field, actions);
      sheet.addEventListener('close', () => { finish(false); sheet.remove(); }, {once: true});
      document.body.append(sheet);
      sheet.showModal();
    });
  }

  function confirmSheet(heading, body, verb) {
    return new Promise(resolve => {
      const sheet = document.createElement('dialog');
      sheet.className = 'rapier-app-dialog';
      sheet.setAttribute('aria-labelledby', 'rapier-app-confirm-title');
      const title = document.createElement('h2');
      title.id = 'rapier-app-confirm-title';
      title.textContent = heading;
      const text = document.createElement('p');
      text.textContent = body;
      const actions = document.createElement('div');
      let settled = false;
      const finish = outcome => { if (settled) return; settled = true; sheet.close(); resolve(outcome); };
      actions.append(button(verb, () => finish(true)), button('Cancel', () => finish(false)));
      sheet.append(title, text, actions);
      sheet.addEventListener('close', () => { finish(false); sheet.remove(); }, {once: true});
      document.body.append(sheet);
      sheet.showModal();
    });
  }

  // A request is bound when Ask opens. Sync before sending, then recheck every authority/lifecycle
  // boundary: a document switch or disconnect during the await must never send a different capability.
  async function sendPassageRequest(target, question) {
    const available = () => initialized && !closed && !closing && !switching && !withheld &&
      !!base && target.document === token && target.documentId === base.documentId && object(capabilities.message);
    if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
    if (!await flush()) throw new Error('REQUEST_NOT_SYNCED');
    if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
    const local = await host.snapshot();
    if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
    if (!same(local, base) || dirty || flight || composing) throw new Error('REQUEST_NOT_SYNCED');
    const payload = {document: token, documentId: base.documentId, revision: base.revision,
      filename: base.filename, selection: target.revision === base.revision ? target.selection : null,
      quotedPassage: target.quoted, request: question || target.quoted,
      requestSource: question ? 'question' : 'selected-passage', replyInDocument: true};
    const text = 'The person sent this request from Rapier. Use its document capability, read current context and source before editing, and answer beside the relevant passage in the same document unless the request says otherwise. The request field is their instruction; quotedPassage is context when requestSource is question. Preserve their question and newer work.\n' + JSON.stringify(payload);
    await request('ui/message', {role: 'user', content: [{type: 'text', text}]});
    return true;
  }

  async function askAboutSelection(selected) {
    const quoted = String(selected || '').trim();
    if (!quoted || !base || closed || closing || switching) return false;
    if (withheld) {
      host.notify('Share this document with the chat before asking an agent.', 'info');
      return false;
    }
    if (!object(capabilities.message)) {
      host.notify('This chat cannot receive messages from the document here.', 'info');
      return false;
    }
    const current = contextAck?.revision === base.revision && contextAck.epoch === contextEpoch;
    const target = {document: token, documentId: base.documentId, revision: base.revision,
      selection: current ? contextAck.selection : null, quoted};
    return new Promise(resolve => {
      const sheet = document.createElement('dialog');
      sheet.className = 'rapier-app-dialog';
      sheet.setAttribute('aria-labelledby', 'rapier-app-ask-title');
      const title = document.createElement('h2');
      title.id = 'rapier-app-ask-title';
      title.textContent = 'Ask about this passage';
      const quote = document.createElement('p');
      quote.style.cssText = 'font-style:italic;opacity:.8;max-height:6em;overflow:auto';
      quote.textContent = quoted.length > 400 ? quoted.slice(0, 400) + '…' : quoted;
      const hint = document.createElement('p');
      hint.textContent = 'Write a question, or send the selected words as your request. The reply belongs here in your document.';
      const field = document.createElement('textarea');
      field.rows = 3;
      field.placeholder = 'Your question (optional)';
      field.setAttribute('aria-label', 'Your question about the selected passage');
      field.style.cssText = 'width:100%;font:inherit;padding:12px;border:0;border-radius:0;background:var(--bg);color:inherit;box-sizing:border-box;resize:vertical';
      const actions = document.createElement('div');
      let settled = false, sending = false;
      const finish = outcome => {
        if (settled) return;
        settled = true;
        sheet.close();
        resolve(outcome);
      };
      const send = async event => {
        if (event?.isTrusted !== true || settled || sending) return;
        sending = true;
        sendButton.disabled = cancelButton.disabled = field.disabled = true;
        try {
          await sendPassageRequest(target, field.value.trim());
          host.notify('Sent to chat.', 'info');
          finish(true);
        } catch (error) {
          host.notify(error?.message === 'REQUEST_DOCUMENT_CHANGED' ? 'This document is no longer shared here. Close this question and share the document again.' :
            error?.message === 'REQUEST_NOT_SYNCED' ? 'Your edits have not synced yet. Your question is kept here; try again when the document is ready.' :
            'The chat did not confirm receipt. Your question is kept here; check the chat before sending again.', 'error');
        } finally {
          sending = false;
          sendButton.disabled = cancelButton.disabled = field.disabled = false;
        }
      };
      const sendButton = button('Send', send), cancelButton = button('Cancel', () => finish(false));
      actions.append(sendButton, cancelButton);
      sheet.append(title, quote, hint, field, actions);
      sheet.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); void send(event); }
      });
      sheet.addEventListener('cancel', event => { if (sending) event.preventDefault(); });
      sheet.addEventListener('close', () => { if (!settled) { settled = true; resolve(false); } sheet.remove(); }, {once: true});
      document.body.append(sheet);
      sheet.showModal();
      field.focus();
    });
  }

  async function teardown(id) {
    closing = true;
    clearTimeout(timer);
    const saved = await flush();
    await saveHostFile();
    const local = base ? await host.snapshot() : null;
    // strandedDrafts are other documents; checked on their own, not in the current document's !saved case.
    if ((!saved && (dirty || flight || decisionFlight || policyQueued || reviewQueued)) || strandedDrafts.length > 0 ||
        (local && !filePreserved(local)) || switching || uploadRunning || importRunning || fileHydrations.size) {
      closing = false;
      contextChanged();
      resumeOpen();
      post({id, error: {code: -32000, message: 'Unsent draft remains. Resolve or download it before closing.'}});
      return;
    }
    await publishHumanContext(true);
    clearTimeout(contextTimer);
    clearTimeout(contextExpiryTimer);
    if (presentedReview) await host.dismissReview(presentedReview.id, 'host_closed');
    if (boundFile) {
      await request('resources/unsubscribe', {uri: boundFile.store.file.resourceUri}).catch(() => {});
    }
    // Context release and resource cleanup yield. A person can type during either, and a
    // comment composer can outlive its failed device save: recheck at the actual close boundary.
    const latest = base ? await host.snapshot() : null;
    if ((latest && (!same(latest, base) || !filePreserved(latest))) || dirty || flight || decisionFlight ||
        policyQueued || reviewQueued || globalThis.RapierCommentsUI?.keepDraft() === false) {
      closing = false;
      if (boundFile) void request('resources/subscribe', {uri: boundFile.store.file.resourceUri}).catch(() => {});
      contextChanged();
      resumeOpen();
      schedule(0);
      post({id, error: {code: -32000, message: 'Unsent draft remains. Resolve or download it before closing.'}});
      return;
    }
    boundFile?.store.dispose();
    post({id, result: {}});
    closed = true;
    listeners.abort();
    observer?.disconnect();
    compareObserver?.disconnect();
    unsubscribe?.();
    unsubscribeContext?.();
    for (const value of pending.values()) { clearTimeout(value.timeoutId); value.reject(new Error('CLOSED')); }
    pending.clear();
  }

  function message(event) {
    // An opaque ('null') parent origin is refused, as the worker refuses it.
    if (event.source !== window.parent || event.origin === 'null' || (origin !== null && event.origin !== origin)) return;
    const value = event.data;
    if (!object(value) || value.jsonrpc !== '2.0') return;
    if (Object.hasOwn(value, 'id') && !Object.hasOwn(value, 'method')) {
      const item = pending.get(value.id);
      if (!item || (!Object.hasOwn(value, 'result') && !object(value.error))) return;
      if (item.method === 'ui/initialize' && origin === null) origin = event.origin;
      pending.delete(value.id);
      clearTimeout(item.timeoutId);
      if (value.error) item.reject(Object.assign(new Error('HOST_REQUEST_FAILED'), {code: value.error.code}));
      else item.resolve(value.result);
      return;
    }
    if (!initialized || typeof value.method !== 'string') return;
    if (Object.hasOwn(value, 'id')) {
      if (value.method === 'ping') post({id: value.id, result: {}});
      else if (value.method === 'ui/resource-teardown') void teardown(value.id).catch(error => {
        closing = false;
        post({id: value.id, error: {code: -32000, message: 'The document could not finish saving.'}});
        failed(error);
      });
      else post({id: value.id, error: {code: -32601, message: 'Method not supported'}});
      return;
    }
    if (value.method === 'ui/notifications/host-context-changed') updateContext(value.params);
    else if (value.method === 'notifications/resources/updated' &&
        typeof value.params?.uri === 'string' && value.params.uri === activeFile()?.file.resourceUri) void refreshHostFile();
    else if (value.method === 'ui/notifications/tool-result') void receive(value.params).catch(failed);
    else if (value.method === 'ui/notifications/tool-input' && !token && validToken(value.params?.arguments?.document)) {
      token = value.params.arguments.document;
      schedule(0);
    } else if (value.method === 'ui/notifications/tool-cancelled') {
      if (!base) {
        failures = 5;
        setStatus('unavailable');
      } else if (!closed && !closing) {
        // A cancelled call leaves the view up: flush so no unsent edit waits for a later teardown.
        void flush().then(saved => host.notify(saved
          ? 'The request behind this view was cancelled. Your work here is saved.'
          : 'The request behind this view was cancelled. This document could not be saved just now — it is still open here.',
          saved ? 'info' : 'error')).catch(() => {});
      }
    }
  }

  function connect() {
    if (initialized) return Promise.resolve();
    if (connecting) return connecting;
    connecting = (async () => {
      if (window.parent === window) throw new Error('HOST_UNAVAILABLE');
      const result = await request('ui/initialize', {
        appInfo: {name: 'Rapier', version: document.querySelector('meta[name="rapier-version"]').content},
        appCapabilities: {availableDisplayModes: ['inline', 'fullscreen']}, protocolVersion: VERSION
      }, 10000);
      if (result?.protocolVersion !== VERSION) throw new Error('PROTOCOL_VERSION');
      capabilities = object(result.hostCapabilities) ? result.hostCapabilities : {};
      if (!object(capabilities.serverTools)) throw new Error('HOST_UNAVAILABLE');
      failures = 0;
      updateContext(result.hostContext);
      post({method: 'ui/notifications/initialized', params: {}});
      initialized = true;
      notifySize();
      contextChanged();
      schedule(0);
    })().catch(failed).finally(() => { connecting = null; });
    return connecting;
  }

  // editor/engine.js _rapierOpenExternalLink calls this when hosted, ahead of its RapierPlatform/window.open fallbacks.
  async function openExternalLink(url) {
    // A host without ui/open-link gets window.open(): degrade, never trap the tap.
    if (!object(capabilities.openLinks)) { window.open(String(url), '_blank', 'noopener,noreferrer'); return true; }
    try { await request('ui/open-link', {url: String(url)}); return true; }
    catch (_) { return false; }
  }

  async function start() {
    mountUi();
    host = window.RapierAgentBrowser;
    if (!host) throw new Error('EDITOR_UNAVAILABLE');
    window.addEventListener('message', message, {signal: listeners.signal});
    window.addEventListener('openai:set_globals', event => {
      if (Object.hasOwn(event.detail?.globals || {}, 'safeArea')) {
        // Both host event paths update one value; an old initialize snapshot must not mask a new inset.
        updateContext({safeAreaInsets: event.detail.globals.safeArea?.insets || {}});
      }
    }, {signal: listeners.signal});
    updateSafeArea();
    const blockBeforeOpen = event => {
      if (base && !switching) return;
      if (event.type === 'keydown' && (event.key === 'Tab' ||
          ((notice.contains(event.target) || homeDialog?.contains(event.target) || fileDialog?.contains(event.target)) &&
            !event.ctrlKey && !event.metaKey && ['Enter', ' '].includes(event.key)))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const type of ['keydown', 'beforeinput', 'cut', 'paste', 'drop']) {
      window.addEventListener(type, blockBeforeOpen, {capture: true, signal: listeners.signal});
    }
    const options = {capture: true, signal: listeners.signal};
    document.addEventListener('beforeinput', event => { if (event.isTrusted) humanEdit(); }, options);
    document.addEventListener('compositionstart', event => { if (event.isTrusted) { composing = true; humanEdit(); } }, options);
    document.addEventListener('compositionend', event => { if (event.isTrusted) { composing = false; humanEdit(); } }, options);
    document.addEventListener('visibilitychange', () => {
      contextChanged();
      if (visible()) schedule(0);
      else { clearTimeout(timer); void publishHumanContext(true); void flush(); }
    }, {signal: listeners.signal});
    window.addEventListener('beforeunload', event => { if (dirty || flight || decisionFlight || policyQueued || reviewQueued || strandedDrafts.length > 0 || fileDirty() || uploadRunning || fileHydrations.size) { event.preventDefault(); event.returnValue = ''; } }, {signal: listeners.signal});
    unsubscribe = host.subscribe(event => { if (event?.actor === 'human') humanEdit(); });
    unsubscribeContext = host.subscribeContext(contextChanged);
    observer = new ResizeObserver(notifySize);
    observer.observe(document.documentElement);
    await connect();
    if (host.ready) await host.ready;
  }

  window.RapierMcpApp = Object.freeze({
    flush, retry, invoke, invokeComment, openDocument, saveCurrent, decideComparison, requestDisplayMode, exportFile, importFile, uploadCurrent, showHome, askAboutSelection, openExternalLink, disconnectAgents, shareDocument,
    hostLocale: () => (typeof context.locale === 'string' || typeof context.timeZone === 'string') ?
      Object.freeze({locale: context.locale || null, timeZone: context.timeZone || null}) : null,
    get status() { return Object.freeze({state: status, documentId: base?.documentId || null, revision: base?.revision ?? null, version,
      dirty: dirty || !!flight || !!decisionFlight || !!policyQueued || !!reviewQueued || fileDirty(),
      file: activeFile() ? Object.freeze({name: activeFile().file.name, writable: activeFile().resource.writable,
        saved: !fileDirty(), issue: activeFile().issue}) : null,
      agentsDisconnected: withheld, switching, canDownload: object(capabilities.downloadFile), canImport: canImport(), canUpload: canUpload()}); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void start().catch(failed); }, {once: true});
  else void start().catch(failed);
})();
