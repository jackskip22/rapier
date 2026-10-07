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
  const editorKeys = new Map();
  let editorActivity = '';
  let contextFlight = null, contextTimer = 0, contextExpiryTimer = 0, contextEpoch = 0, contextSequence = 0, contextFailures = 0;
  let contextQueued = false, contextAck = null, contextIssue = '', unsubscribeContext;
  let modelFlight = null, modelQueued = false, modelAvailable = true, modelFailures = 0, modelSent = '';
  let policyQueued = null, reviewQueued = null, presentedReview = null, viewFlight = null, visualFlight = null, exportFlight = null;
  const editorRequests = new Map();
  let editorFlight = null, editorResolving = false;
  let openingSwitch = false;
  let hostWork = null;
  let imageSupportNoticeStarted = false;
  // After "Disconnect agents" the editor holds a capability no agent has; it stays out of model context until shared again from here.
  let withheld = false;
  // The paired editor (mcp/paired.mjs): this page at the top level, naming its one workspace, with no host around it.
  // Its calls go to its own route with this browser's cookies; the successor of a disconnect waits here for Share.
  const pairedId = window.parent === window && typeof globalThis.RAPIER_PAIRED_DOCUMENT === 'string' &&
    /^ws_[A-Za-z0-9_-]{43}$/.test(globalThis.RAPIER_PAIRED_DOCUMENT) ? globalThis.RAPIER_PAIRED_DOCUMENT : null;
  let shareable = '', pairDialog = null;
  // A connected workspace stores Disconnect as a decision its snapshots report; an anonymous one reports nothing.
  let agentAccess = null;
  let strandedDrafts = []; // oldest first -- see STRANDED_DRAFT_LIMIT above
  const viewed = new Set();

  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (a, b) => !!a && !!b && a.documentId === b.documentId && a.text === b.text &&
    a.filename === b.filename && a.docKind === b.docKind;
  const validToken = value => typeof value === 'string' && (/^rpr_[A-Za-z0-9_-]{43}$/.test(value) || value === pairedId);
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
  const reviewSignature = review => JSON.stringify(review && {id: review.id, kind: review.kind, status: review.status,
    revision: review.revision, contribution: review.contribution, changes: review.changes, splices: review.splices});
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
    if (closed || pairedId) return;
    if (origin === null && (message.method !== 'ui/initialize' || pending.get(message.id)?.method !== 'ui/initialize')) throw new Error('HOST_UNBOUND');
    window.parent.postMessage({jsonrpc: '2.0', ...message}, origin ?? '*');
  }

  function request(method, params, timeout = 20000) {
    if (closed) return Promise.reject(new Error('CLOSED'));
    if (pairedId) return method === 'tools/call' ? pageCall(params, timeout) : Promise.reject(new Error('HOST_UNAVAILABLE'));
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

  // One JSON-RPC tools/call to the page's own route, in the legacy era's stateless form, with this browser's cookies.
  async function pageCall(params, timeout) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(globalThis.RAPIER_DOOR, {method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: {'Content-Type': 'application/json', Accept: 'application/json', 'MCP-Protocol-Version': '2025-11-25'},
        body: JSON.stringify({jsonrpc: '2.0', id: `${nonce}:${++nextId}`, method: 'tools/call', params})});
      const body = await response.json();
      if (!object(body) || object(body.error) || !object(body.result)) throw Object.assign(new Error('HOST_REQUEST_FAILED'), {code: body?.error?.code});
      return body.result;
    } catch (error) {
      throw error?.name === 'AbortError' ? new Error('TIMEOUT') : error;
    } finally { clearTimeout(timer); }
  }

  function editorKeyFor(document) {
    if (pairedId) return document === pairedId && typeof globalThis.RAPIER_EDITOR_KEY === 'string' ? globalThis.RAPIER_EDITOR_KEY : '';
    return editorKeys.get(document) || '';
  }

  function rememberEditorKey(result, document = result?.structuredContent?.document) {
    const meta = metadata(result);
    // Only the host's private result channel supplies a key. Concurrent opens may hydrate before becoming the active document.
    if (result?.isError || !validToken(document) || meta.editorDocument !== document ||
        typeof meta.editorKey !== 'string' || !meta.editorKey.length || meta.editorKey.length > 512) return;
    if (pairedId) {
      if (document === pairedId) globalThis.RAPIER_EDITOR_KEY = meta.editorKey;
    } else editorKeys.set(document, meta.editorKey);
  }

  function recordEditorActivity(event) {
    if (event?.isTrusted === true && base && token && !closed && !closing && !switching && visible()) editorActivity = token;
  }

  function call(name, args, timeout, human = false) {
    if (!initialized || !object(capabilities.serverTools)) return Promise.reject(new Error('HOST_UNAVAILABLE'));
    // Widget-only proof travels outside model arguments. The paired page already has its cookie route's page authority.
    const own = globalThis.RapierAgentCatalog?.getTool?.(name)?.visibility?.includes('app') ||
      (human && ['document.comment', 'document.read_context'].includes(name));
    const editorKey = own ? editorKeyFor(args?.document) : '';
    const run = async () => {
      const params = {name, arguments: editorKey ? {...args, editorKey} : args};
      if (editorKey && !pairedId) params._meta = {'rapier/editorKey': editorKey};
      if (editorKey && editorActivity === args?.document && ['document.commit', 'document.human_context'].includes(name)) {
        params._meta = {...params._meta, 'rapier/editorActivity': true};
        editorActivity = '';
      }
      const result = await request('tools/call', params, timeout);
      rememberEditorKey(result, args?.document);
      return result;
    };
    return !own && host?.trackInvocation ? host.trackInvocation(name, args, run, crypto.randomUUID()) : run();
  }

  function finishHostWork() {
    const current = hostWork;
    hostWork = null;
    current?.();
  }

  function beginHostWork(params) {
    finishHostWork();
    if (!host?.trackInvocation || !token || params?.arguments?.document !== token) return;
    const done = new Promise(resolve => { hostWork = resolve; });
    void host.trackInvocation('agent', params.arguments,
      () => done, crypto.randomUUID()).catch(() => {});
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
    if (['unavailable', 'expired', 'unsupported', 'detached', 'unpaired'].includes(value)) cancelEditorRequests('editor_unavailable', {forget: true});
    else if (value === 'offline') cancelEditorRequests('editor_unavailable', {waitingOnly: true});
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
      unpaired: 'This browser is not paired with the document',
      unavailable: 'Document unavailable', expired: 'This editor session has expired. Open the document again from your assistant’s link',
      unsupported: 'This host cannot connect to Rapier', detached: 'This document is open elsewhere',
      blocked: 'This update needs attention',
      review_waiting: 'A change is ready for review',
      comparison_changed: 'The comparison changed. Review it again.', comparison_refused: 'This comparison needs another look.'
    }[value] || strandedText || fileText;
    notice.hidden = !text;
    notice.firstElementChild.textContent = text || '';
    notice.children[1].hidden = !['reconnecting', 'offline', 'opening', 'blocked', 'unpaired'].includes(value);
    notice.children[2].hidden = value !== 'review_waiting' && !fileIssue;
    notice.children[3].hidden = !base || !(['offline', 'unavailable', 'unsupported', 'detached', 'blocked', 'expired', 'unpaired'].includes(value) || strandedDrafts.length > 0 || fileIssue);
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
      .rapier-app-notice[hidden]{display:none}.rapier-app-notice>span{flex:1 1 auto}.rapier-app-notice button{text-transform:uppercase;letter-spacing:var(--track-caps-ui)}
      .rapier-app-notice button{font:inherit;color:inherit;background:var(--color-surface-hover);border:0;border-radius:0;min-height:48px;padding:8px 14px;cursor:pointer}
      .rapier-app-image-notice{pointer-events:auto;width:min(440px,calc(100vw - 32px));box-sizing:border-box;padding:20px;background:var(--color-bg);color:var(--color-text);font:inherit}
      .rapier-app-image-notice strong{font-size:1.05em}.rapier-app-image-notice p{margin:12px 0;line-height:1.5}
      .rapier-app-image-notice button{font:inherit;text-transform:uppercase;color:var(--color-accent-foreground,#fff);background:var(--color-accent);border:0;border-radius:0;padding:12px 16px;cursor:pointer}
      .rapier-app-decision{font:inherit;font-size:12px;width:auto;padding:0 9px;min-height:36px}
      .rapier-app-pop{z-index:300}.rapier-app-pop p{margin:0 0 var(--space-4);line-height:1.5}.rapier-app-pop input{flex:0 0 auto;width:100%;height:48px;box-sizing:border-box;margin:0 0 var(--space-4);background:var(--color-surface-2);font-family:var(--font-mono)}
      .rapier-app-pair-code{font:var(--fw-medium) 3.5rem/1 var(--font-mono);letter-spacing:.2em;text-transform:uppercase}
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
    // Your documents opens and saves host files; a paired page has one workspace and no host.
    if (!pairedId) document.getElementById('top-actions')?.append(homeButton);
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
      if (['SCRIPT', 'STYLE'].includes(child.tagName) || child === notice || child === pairDialog || child.id === 'toast-root' || child.inert) continue;
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
      value.start >= 0 && value.end >= value.start && value.end <= length ? {start: value.start, end: value.end,
        ...(typeof value.objectId === 'string' ? {objectId: value.objectId} : {})} : null;
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
      const moved = range && sourceRange(RapierLedger.transportTouchedInterval(range.start, range.end, splices), source.text.length);
      return moved && {...moved, ...(range.objectId ? {objectId: range.objectId} : {})};
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
    if (!release && editorContextBusy()) { contextQueued = true; return false; }
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
      if (active && captured?.documentId === source.documentId && ['formatted', 'source', 'notes'].includes(captured?.context?.view)) args.view = captured.context.view;
      const ranges = active && contextRanges(captured, source);
      if (ranges) Object.assign(args, ranges);
      if (active && exact && captured.context?.drawing?.open) {
        args.drawing = {...captured.context.drawing};
        if (args.drawing.recipe) {
          const recipe = JSON.stringify(args.drawing.recipe), limits = globalThis.RapierKernel.LIMITS;
          if (new TextEncoder().encode(recipe).byteLength > limits.authorityBytes) {
            delete args.drawing.recipe;
            args.drawing.recipeUnavailable = 'target_over_edit_budget';
          }
        }
      }
      if (active && typeof host.editorContext === 'function') {
        const editor = host.editorContext();
        if (object(editor?.preferences)) args.editor = {preferences: editor.preferences};
      }
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
        visible: active, editing: busy, ...(args.drawing ? {drawing: args.drawing} : {})};
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
    if (['free', 'check', 'ask'].includes(value.posture)) policy.posture = value.posture;
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
        reviewSignature(base?.collaboration?.review) !== shown.signature || base.revision !== shown.serverRevision || base.text !== shown.text) {
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
    if (!sent || sent.status !== 'expired' && (dirty || flight || composing)) return;
    const result = await call('document.view_ack', sent);
    if (viewFlight === sent) viewFlight = null;
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

  // The open editor answers a pending export request with the file it builds, bound to this workspace, document, revision and format.
  // A source that changed while it rendered, or a workspace that was switched, sends the answer nowhere with bytes.
  async function presentExport(local, expected) {
    const intent = base?.exportIntent;
    if (!intent || intent.status !== 'pending' || intent.revision !== base.revision || intent.documentId !== base.documentId) {
      exportFlight = null;
      return;
    }
    if (!exportFlight || exportFlight.exportId !== intent.id) {
      const target = {document: token, documentId: base.documentId, revision: base.revision};
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(0, intent.expiresAt - Date.now()));
      let fact;
      try {
        fact = typeof host.exportDocument === 'function'
          ? await host.exportDocument({...intent, signal: controller.signal}, expected)
          : {outcome: 'refused', reason: 'editor_unavailable'};
      } catch (_) { fact = {outcome: 'refused', reason: 'export_unavailable'}; }
      finally { clearTimeout(timeout); }
      if (token !== target.document || closed || closing || switching) return;
      const current = await host.snapshot();
      if (dirty || composing || !same(current, local) || current.generation !== local.generation ||
          current.revision !== local.revision || base.revision !== target.revision) fact = {outcome: 'refused', reason: 'document_changed'};
      exportFlight = {document: target.document, exportId: intent.id, expectedRevision: target.revision,
        fact: {...fact, documentId: target.documentId, revision: target.revision, format: intent.format}};
    }
    const sent = exportFlight;
    const result = await call('document.export_ack', sent, 60000);
    if (exportFlight === sent) exportFlight = null;
    captureIncoming(result);
  }

  function editorContextBusy() {
    return editorResolving || !!editorFlight || [...editorRequests.values()].some(row => row.initial || row.later);
  }

  function editorUnavailable(row, reason) {
    return {kind: 'editor', documentId: row.documentId, revision: row.revision, operation: row.operation,
      receipt: {id: row.id, status: 'unavailable', ...(row.preference ? {preference: row.preference} : {action: row.action}), reason}};
  }

  function queueEditorReceipt(row, fact, initial = false) {
    if (editorRequests.get(row.id) !== row || row.document !== token || closed ||
        fact?.documentId !== row.documentId || fact.revision !== row.revision || fact.operation !== row.operation ||
        fact.receipt?.id !== row.id || !['applied', 'waiting', 'done', 'declined', 'unavailable'].includes(fact.receipt.status)) return false;
    // Keep the first receipt ahead of callbacks, even when a human changes the value while its ACK is in flight.
    const captured = {...fact, receipt: {...fact.receipt}, ...(fact.file ? {file: {...fact.file}} : {})};
    if (initial) { row.initial = captured; row.status = captured.receipt.status; }
    else row.later = captured;
    clearTimeout(contextTimer);
    schedule(0);
    return true;
  }

  function forgetEditorRequest(row, reason) {
    editorRequests.delete(row.id);
    if (editorFlight?.row === row) editorFlight = null;
    host?.cancelEditorRequest?.(row.id, reason);
    row.controller.abort();
  }

  function editorReceiptStatus(row) {
    return row.later?.receipt.status || row.initial?.receipt.status || row.status;
  }

  function cancelEditorRequests(reason, {forget = false, waitingOnly = false} = {}) {
    for (const row of editorRequests.values()) {
      const status = editorReceiptStatus(row);
      if (waitingOnly && !['resolving', 'waiting'].includes(status)) continue;
      if (forget) { forgetEditorRequest(row, reason); continue; }
      row.cancelReason = reason;
      const cancelled = host?.cancelEditorRequest?.(row.id, reason);
      row.controller.abort();
      if (editorReceiptStatus(row) === 'waiting' && !cancelled) queueEditorReceipt(row, editorUnavailable(row, reason));
    }
  }

  function reconcileEditorRequests() {
    const intent = base?.editorIntent;
    for (const row of editorRequests.values()) {
      if (row.document !== token || row.documentId !== base?.documentId) forgetEditorRequest(row, 'document_changed');
      else if (['resolving', 'waiting'].includes(editorReceiptStatus(row)) && (!intent || intent.id !== row.id ||
          intent.documentId !== row.documentId || intent.revision !== row.revision || intent.expiresAt <= Date.now())) {
        forgetEditorRequest(row, 'editor_request_unavailable');
      }
      else if (row.acknowledged && !row.initial && !row.later && row.status !== 'applied' && base.editorIntent?.id !== row.id) {
        forgetEditorRequest(row, 'editor_request_unavailable');
      }
    }
  }

  async function acknowledgeEditor() {
    if (editorResolving) return false;
    if (!editorFlight) {
      for (const row of editorRequests.values()) {
        const slot = row.initial ? 'initial' : row.acknowledged && row.later ? 'later' : null;
        if (!slot) continue;
        editorFlight = {row, slot, fact: row[slot], args: {document: row.document,
          expectedRevision: row.revision, editorId: row.id, fact: row[slot]}};
        break;
      }
    }
    const sent = editorFlight;
    if (!sent) return true;
    const {row} = sent;
    if (row.document !== token || row.documentId !== base?.documentId || closed) {
      forgetEditorRequest(row, 'document_changed');
      return false;
    }
    // A context snapshot captured before a preference write must arrive before its applied receipt.
    clearTimeout(contextTimer);
    if (contextFlight) await contextFlight;
    clearTimeout(contextTimer);
    if (editorFlight !== sent) return false;
    const result = await call('document.editor_ack', sent.args, 5000);
    if (editorFlight !== sent) return false;
    captureIncoming(result);
    if (result?.isError) {
      const data = result.structuredContent;
      if (data?.outcome === 'uncertain' || ['WORKSPACE_UNAVAILABLE', 'WORKSPACE_UNACKNOWLEDGED'].includes(data?.code)) throw new Error('EDITOR_ACK_UNCONFIRMED');
      forgetEditorRequest(row, data?.reason || 'editor_request_unavailable');
      if (data?.code) ensureResult(result);
    } else {
      if (result?.structuredContent?.editorId !== row.id || !object(result.structuredContent.receipt)) throw new Error('INVALID_EDITOR_ACK');
      if (row[sent.slot] === sent.fact) row[sent.slot] = null;
      row.acknowledged = true;
      row.status = result.structuredContent.receipt.status;
      editorFlight = null;
    }
    contextChanged();
    schedule(0);
    return true;
  }

  async function presentEditor(expected) {
    const intent = base?.editorIntent;
    if (!intent || !['pending', 'waiting'].includes(intent.status) || intent.documentId !== base.documentId || intent.revision !== base.revision) return;
    if (editorRequests.has(intent.id)) return;
    const row = {id: intent.id, document: token, documentId: intent.documentId, revision: intent.revision,
      operation: intent.operation, preference: intent.preference, action: intent.action, status: 'resolving',
      controller: new AbortController(), initial: null, later: null, acknowledged: false};
    // One retained observer per applied preference is sufficient; the worker retains the latest applied receipt for it.
    if (row.preference) for (const prior of editorRequests.values()) {
      if (prior.preference === row.preference && prior.status === 'applied') forgetEditorRequest(prior, 'editor_request_replaced');
    }
    editorRequests.set(row.id, row);
    editorResolving = true;
    clearTimeout(contextTimer);
    let fact;
    try {
      if (contextFlight) await contextFlight;
      clearTimeout(contextTimer);
      fact = typeof host.resolveEditorRequest === 'function'
        ? await host.resolveEditorRequest({...intent, signal: row.controller.signal}, expected,
          {onReceipt: value => queueEditorReceipt(row, value)})
        : editorUnavailable(row, 'editor_unavailable');
    } catch (_) { fact = editorUnavailable(row, 'editor_unavailable'); }
    finally { editorResolving = false; }
    if (editorRequests.get(row.id) !== row) return;
    if (row.cancelReason && !['applied', 'done'].includes(fact?.receipt?.status)) fact = editorUnavailable(row, row.cancelReason);
    if (!queueEditorReceipt(row, fact, true)) queueEditorReceipt(row, editorUnavailable(row, 'editor_unavailable'), true);
    await acknowledgeEditor();
  }

  async function presentCollaboration() {
    reconcileEditorRequests();
    const review = base?.collaboration?.review;
    if (presentedReview && (reviewSignature(review) !== presentedReview.signature || review.status !== 'pending' ||
        base.revision !== presentedReview.serverRevision || base.text !== presentedReview.text)) {
      await host.dismissReview(presentedReview.id, 'review_changed');
      presentedReview = null;
    }
    if (!base || closed || closing || switching || !visible() || dirty || flight || decisionFlight ||
        policyQueued || reviewQueued || incoming || editing()) return;
    if (editorContextBusy()) { await acknowledgeEditor(); return; }
    if (viewFlight) { await acknowledgeView(); return; }
    const local = await host.snapshot();
    if (!same(local, base)) { dirty = true; contextChanged(); return; }
    const expected = {expectedDocumentId: local.documentId, expectedRevision: local.revision,
      expectedText: local.text, expectedGeneration: local.generation};
    if (base.exportIntent?.status === 'pending') { await presentExport(local, expected); return; }
    if (base.editorIntent) { await presentEditor(expected); return; }
    if (base.visualIntent?.status === 'pending') { await presentVisual(local, expected); return; }
    if (review?.status === 'pending' && review.revision === base.revision) {
      if (presentedReview?.id === review.id) {
        if (presentedReview.failed || presentedReview.dismissed) setStatus('review_waiting');
        return;
      }
      const shown = {id: review.id, signature: reviewSignature(review), documentId: base.documentId, serverRevision: base.revision,
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
    const documentToken = token;
    let ended = null;
    const result = await host.applyView(intent, expected, base, {onPointResult: receipt => {
      if (documentToken !== token || closed || closing || switching || base?.viewIntent?.id !== intent.id) return;
      ended = receipt;
      if (!viewed.has(intent.id)) return;
      viewFlight = {document: documentToken, expectedRevision: base.revision, viewId: intent.id,
        status: 'expired', reason: receipt.reason || 'pointer_expired'};
      schedule(0);
    }});
    if (dirty || composing || !same(await host.snapshot(), base)) return;
    if (!result?.ok && (result?.outcome === 'yielded' || ['document_not_settled', 'foreground_hand_wins', 'human_edit_in_progress'].includes(result?.reason))) return;
    viewed.add(intent.id);
    if (viewed.size > 64) viewed.delete(viewed.values().next().value);
    viewFlight = {document: token, expectedRevision: base.revision, viewId: intent.id,
      status: ended ? 'expired' : result?.ok ? 'presented' : 'refused',
      ...(ended ? {reason: ended.reason || 'pointer_expired'} : result?.ok ? {} : {reason: String(result?.reason || 'view_unavailable').slice(0, 128)})};
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
    cancelEditorRequests('document_changed', {waitingOnly: true});
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
    // A paired browser whose pairing ended (a day passed, or agents were disconnected elsewhere) pairs again on Retry.
    if (code === 'PAIRING_REQUIRED') {
      failures = 5;
      setStatus('unpaired');
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
    const resource = store.incoming, boxes = [];
    // Use file version replaces the draft, so it is the pop's bottom box; Keep editing stands among the ways forward.
    const act = (label, action, pop = 'affirm') => {
      const box = button(label, async event => {
        if (event?.isTrusted !== true || activeFile() !== store) return;
        for (const child of boxes) child.disabled = true;
        try { if (await action(event)) sheet.close(); }
        finally { for (const child of boxes) child.disabled = false; }
      });
      box.dataset.pop = pop;
      boxes.push(box);
      return box;
    };
    act(object(capabilities.downloadFile) ? 'Download draft' : 'Copy draft', downloadDraft);
    if (canUpload()) act('Save to ChatGPT Files', uploadCurrent);
    if (resource) {
      act('Keep my version', () => keepMyVersion(store, resource));
      act('Use file version', () => useHostFileVersion(store, resource), 'destructive');
    } else act('Retry save', saveHostFile);
    const keep = button('Keep editing', () => sheet.close());
    keep.dataset.pop = 'cancel';
    boxes.push(keep);
    const sheet = fileDialog = host.sheet({title: store.file.name, words: resource
      ? 'The file changed outside this editor. Keep my version replaces the file and keeps its version for Copy draft; Use file version replaces this draft.'
      : 'Your draft is safe in this editor. Save a new copy to ChatGPT Files or download it, or retry saving the original.',
      body: [boxes], onEscape: current => current.close(), onClose: () => { if (fileDialog === sheet) fileDialog = null; }});
  }

  // Keep my version: the file's version is kept before the editor's is written over it, as a switch keeps a stranded
  // draft (offered for download where the host allows, listed for Copy draft either way); then the editor's is saved.
  async function keepMyVersion(store, resource) {
    if (!await flush() || activeFile() !== store || store.incoming !== resource) return false;
    if (typeof resource.text === 'string') {
      const name = store.file.name, record = {text: resource.text, filename: name, docKind: /\.(?:md|markdown)$/i.test(name) ? 'markdown' : 'text', delivered: false};
      strandedDrafts.push(record);
      record.delivered = !!(object(capabilities.downloadFile) && await exportFile(new Blob([resource.text], {type: 'text/plain;charset=utf-8'}), name));
    }
    if (!store.accept(resource)) return false;
    return saveHostFile();
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
    rememberEditorKey(result);
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
      learnAccess(value);
    }
  }

  // A connected workspace's snapshot carries the person's stored sharing decision; while it is off, Share is offered
  // and sharing first turns it back on (reconnectAgents).
  function learnAccess(value) {
    if (typeof value?.agentAccess === 'boolean') { agentAccess = value.agentAccess; withheld = !value.agentAccess; }
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
      if (['conflict', 'yielded'].includes(result?.outcome) || result?.reason === 'draw_session_open' || result?.reason === 'drawing_busy') return;
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
    host.noteRemoteCall?.(result.structuredContent?.agent);
    const value = metadata(result).snapshot;
    const nextVersion = viewVersion(result.structuredContent?.version);
    if (snapshot(value) && nextVersion !== null && (!base || value.documentId === base.documentId)) {
      captureIncoming(result);
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
    const remote = value.draftEdits, client = value.draftClient;
    if (!Array.isArray(remote) || remote.some(row => typeof row.client !== 'string' || !Array.isArray(row.splices)) ||
        typeof client !== 'string' || !client ||
        replay(sent.text, remote) !== value.text) throw new Error('MISSING_COMMIT_EDITS');
    const kept = continuation?.commitId === sent.commitId ? continuation : null;
    let continued;
    try {
      continued = kept
        ? mergeSource(value.text, [...kept.splices, ...sourceEdits(kept.text, local.text, local.journal)], client, [])
        : mergeSource(sent.text, sourceEdits(sent.text, local.text, local.journal), client, remote);
    } catch (_) { throw new Error('DRAFT_BASE_UNAVAILABLE'); }
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
        if (!['conflict', 'yielded'].includes(applied?.outcome) && applied?.reason !== 'draw_session_open' && applied?.reason !== 'drawing_busy') { failures = 5; setStatus('blocked'); }
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
    // A host may announce tool input before its private result. That result starts the first authorized cycle.
    if (!editorKeyFor(token)) return Promise.resolve(false);
    running = (async () => {
      if (viewFlight?.status === 'expired') await acknowledgeView();
      await acknowledgeEditor();
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
          if (!await sync()) return false;
          await loadIncoming(false, null, force);
        }
      }
      await presentCollaboration();
      if (base && !dirty && !flight) await saveHostFile();
      return !!base && !dirty && !flight && !decisionFlight && !policyQueued && !reviewQueued && !incoming;
    })().catch(error => { failed(error); return false; }).finally(() => {
      running = null;
      updateCompareControls();
      schedule(failures ? Math.min(30000, 1500 * 2 ** (failures - 1)) : policyQueued || reviewQueued || editorContextBusy() ? 0 : dirty ? 500 : 1500);
    });
    return running;
  }

  async function flush() {
    clearTimeout(timer);
    if (running) await running;
    return cycle(true);
  }

  async function retry() {
    if (pairedId && status === 'unpaired') { location.reload(); return; }
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
    // A paired page edits its one workspace; another document comes from the assistant.
    if (pairedId) { host.notify('This page edits one document. Ask your assistant to open another.', 'info'); return false; }
    if (Object.hasOwn(args, 'document') || Object.hasOwn(args, 'file') || switching || closing || closed || fileHydrations.size) return false;
    cancelEditorRequests('document_changed', {waitingOnly: true});
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
      cancelEditorRequests('document_changed', {forget: true});
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
      exportFlight = null;
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
      cancelEditorRequests('document_changed', {waitingOnly: true});
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
      cancelEditorRequests('document_changed', {forget: true});
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
      exportFlight = null;
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
        presentedReview.signature = reviewSignature(live);
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
    homeDialog?.close();
    const actions = [button('New document', async () => { await openDocument({text: '', filename: 'untitled.md', docKind: 'markdown'}); })];
    if (canImport()) actions.push(button('Open from ChatGPT Files', async event => { if (await importFile(event)) sheet.close(); }));
    actions.push(button('Open from device', async event => { if (await openLocalFile(event)) sheet.close(); }));
    if (base && canUpload()) actions.push(button('Save to ChatGPT Files', uploadCurrent));
    const back = button(base ? 'Back to document' : 'Close', () => sheet.close());
    back.dataset.pop = 'cancel';
    const records = recentHostFiles(), body = [];
    if (records.length && typeof window.openai?.getFileDownloadUrl === 'function') {
      const heading = document.createElement('p');
      heading.style.cssText = 'margin:0 0 var(--space-4);line-height:1.5';
      heading.textContent = 'Recently opened or saved';
      body.push(actions, heading, [...records.map(file => button(file.fileName, async event => { if (await importFile(event, file)) sheet.close(); })), back]);
    } else body.push([...actions, back]);
    const sheet = homeDialog = host.sheet({title: 'Your documents', body, onEscape: current => current.close(),
      onClose: () => { if (homeDialog === sheet) homeDialog = null; }});
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
      const field = document.createElement('textarea');
      field.className = 'navigator-outline-filter';
      field.readOnly = true;
      field.value = local.text;
      field.setAttribute('aria-label', 'Draft text. Select all and copy.');
      field.setAttribute('autofocus', '');
      field.style.cssText = 'width:100%;height:40vh;padding-block:var(--space-2);resize:vertical;font-family:var(--font-mono)';
      const sheet = host.sheet({title: 'Copy your draft', body: [field, [button('I copied it', () => { delivered(); sheet.close(); })]],
        onEscape: current => current.close()});
      field.select();
    }
  }

  // "Disconnect agents": rotate the capability; the successor returns sealed to the editor key, is unsealed here and withheld from the model
  // until shared. Needs a trusted event, as setPolicy.
  async function disconnectAgents(event) {
    if (event?.isTrusted !== true || !base || switching || closed || decisionFlight) return false;
    const target = {document: token, documentId: base.documentId};
    const unseal = globalThis.RapierDoorIdentity?.unsealForEditor;
    if (!editorKeyFor(target.document) || typeof unseal !== 'function') { host.notify('This editor cannot disconnect agents here.', 'info'); return false; }
    // No sheet: the press is the decision. The editor keeps the document, the row says what happened, and Share lets an
    // agent back in from here.
    cancelEditorRequests('editor_unavailable', {waitingOnly: true});
    if (!await flush()) { host.notify('Finish the current edit, then try again.', 'info'); return false; }
    if (token !== target.document || base?.documentId !== target.documentId || switching || closed || closing) return false;
    clearTimeout(timer);
    switching = true;
    cancelEditorRequests('editor_unavailable', {forget: true});
    lock();
    try {
      // Flush can renew the page key. Snapshot the proof at the rotation's synchronous call boundary.
      const editorKey = editorKeyFor(target.document);
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
      rememberEditorKey(result, pairedId || next);
      withheld = true;
      if (Number.isSafeInteger(result.structuredContent.version)) version = result.structuredContent.version;
      if (agentAccess !== null) agentAccess = false;
      if (pairedId) {
        shareable = next;
        modelSent = '';
        host.notify('Agents disconnected. Share the document to let one back in.', 'success');
        return true;
      }
      if (boundFile?.document === target.document && boundFile.documentId === target.documentId) boundFile.document = next;
      token = next;
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

  // Sharing a connected workspace is first the person's stored decision, at the current revision and version.
  async function reconnectAgents(target, event) {
    if (agentAccess !== false) return true;
    const current = () => !closed && !closing && !switching && !openingSwitch && !!base && token === target.document && base.documentId === target.documentId;
    if (event?.isTrusted !== true || !current() || !await flush() || !current()) return false;
    const result = await call('document.set_policy', {document: target.document, agentAccess: true,
      expectedRevision: base.revision, expectedVersion: version, decisionId: crypto.randomUUID()});
    if (!current() || !ensureResult(result)) return false;
    captureIncoming(result);
    return agentAccess === true;
  }

  // "Send to chat" gives the capability to this chat's model and lifts the withholding; "Copy" is for another agent and keeps it withheld.
  async function shareDocument(event) {
    if (event?.isTrusted !== true || !base || !withheld || closed) return false;
    return new Promise(resolve => {
      const pop = housePop('rapier-app-share-title', 'Share with an agent');
      const text = document.createElement('p');
      // A connected workspace answers only the person's own connections; an anonymous one answers whoever holds the ID.
      text.textContent = (agentAccess === null ? 'An agent that receives this workspace ID'
        : 'An agent on one of your approved connections that receives this workspace ID')
        + ' can read and edit the document under your FREE, CHECK or ASK control until you disconnect agents again.';
      const field = document.createElement('input');
      field.type = 'text';
      field.readOnly = true;
      field.className = 'navigator-outline-filter';
      field.value = pairedId ? shareable : token;
      field.setAttribute('aria-label', 'Workspace ID');
      let settled = false;
      const finish = outcome => { if (settled) return; settled = true; pop.overlay.remove(); resolve(outcome); };
      pop.overlay.addEventListener('keydown', event => { if (event.key === 'Escape') finish(false); }, {signal: listeners.signal});
      const target = {document: token, documentId: base.documentId};
      if (object(capabilities.message)) pop.row.append(popButton('send to chat', 'affirm', async event => {
        try {
          if (!await reconnectAgents(target, event)) return;
          await request('ui/message', {role: 'user', content: [{type: 'text', text: 'Rapier document: ' + token + '\nUse it as the document argument of the Rapier tools.'}]});
          withheld = false;
          modelSent = '';
          contextChanged();
          host.notify('Sent to chat.', 'info');
          finish(true);
        } catch (_) { host.notify('Could not reach the chat.', 'error'); }
      }));
      pop.row.append(popButton('copy', 'affirm', async event => {
        try { if (!await reconnectAgents(target, event)) return; await navigator.clipboard.writeText(field.value); host.notify('Copied.', 'info'); finish(true); }
        catch (_) { field.focus(); field.select(); host.notify('Select the value and copy it.', 'info'); }
      }), popButton('done', 'cancel', () => finish(false)));
      pop.show(text, field);
    });
  }

  // The house pop-up (editor/pop.js): a settings panel with its title, its words and one row of answers, the destructive
  // answer (else Cancel) the red box at the bottom. The app build has no pop.js, so the row is arranged here the same way.
  function housePop(id, heading, extra = '') {
    const overlay = document.createElement('div');
    overlay.className = ('settings-overlay restore-modal-overlay open rapier-app-pop ' + extra).trim();
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', id);
    const panel = document.createElement('div');
    panel.className = 'settings-panel rapier-pop';
    panel.style.cssText = 'max-width:420px;margin:auto';
    const body = document.createElement('div');
    body.className = 'settings-panel__body';
    const head = document.createElement('div');
    head.className = 'navigator-title-row';
    const title = document.createElement('h2');
    title.id = id;
    title.className = 'settings-section__title';
    title.textContent = heading;
    head.append(title);
    const row = document.createElement('div');
    row.className = 'settings-action-row';
    row.setAttribute('data-pop-row', '');
    body.append(head);
    panel.append(body);
    overlay.append(panel);
    const show = (...words) => {
      body.append(...words, row);
      document.body.append(overlay);
      if (typeof globalThis._rapierPopArrange === 'function') globalThis._rapierPopArrange(row);
      else {
        const shown = [...row.children].filter(box => !box.hidden);
        const bottom = shown.find(box => box.dataset.pop === 'destructive') || shown.find(box => box.dataset.pop === 'cancel');
        if (bottom) { row.append(bottom); bottom.setAttribute('data-pop-bottom', ''); }
        row.classList.add('rapier-pop__actions');
      }
      // Focus waits on a safe answer; a pop-up whose only answer is the red box takes none.
      row.querySelector('button:not([data-pop-bottom])')?.focus({preventScroll: true});
    };
    return {overlay, row, show};
  }

  function popButton(label, role, action) {
    const element = button(label, action, 'settings-action-btn');
    element.dataset.pop = role;
    return element;
  }

  function confirmSheet(heading, body, verb) {
    return new Promise(resolve => {
      const pop = housePop('rapier-app-confirm-title', heading);
      const text = document.createElement('p');
      text.textContent = body;
      let settled = false;
      const finish = outcome => { if (settled) return; settled = true; pop.overlay.remove(); resolve(outcome); };
      pop.overlay.addEventListener('keydown', event => { if (event.key === 'Escape') finish(false); }, {signal: listeners.signal});
      pop.row.append(popButton('cancel', 'cancel', () => finish(false)), popButton(verb, 'destructive', () => finish(true)));
      pop.show(text);
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
    // A comment thread's question names the thread, not a selection: there is no passage to inspect and no handle.
    if (!target.selection) {
      const asked = {document: token, documentId: base.documentId, revision: base.revision, filename: base.filename, selection: null,
        quotedPassage: target.quoted, request: question || target.quoted,
        requestSource: question ? 'question' : 'selected-passage', replyInDocument: true};
      const prompt = 'The person sent this request from Rapier. Use its workspace ID, read current context and source before editing, and answer beside the relevant passage in the same document unless the request says otherwise. The request field is their instruction; quotedPassage is context when requestSource is question. Preserve their question and newer work.\n' + JSON.stringify(asked);
      await request('ui/message', {role: 'user', content: [{type: 'text', text: prompt}]});
      return true;
    }
    const inspectedRevision = base.revision, inspectedSource = base.text;
    let selection = {start: target.selection.start, end: target.selection.end}, carried = target.source, revision = target.localRevision;
    for (const entry of local.journal || []) {
      if (entry.revision <= revision) continue;
      if (entry.baseRevision !== revision || !Array.isArray(entry.splices)) break;
      selection = RapierLedger.transportInterval(selection.start, selection.end, entry.splices);
      if (!selection) throw new Error('REQUEST_SELECTION_CHANGED');
      carried = RapierLedger._rapierTransformSplices(carried, entry.splices);
      if (typeof carried !== 'string') throw new Error('REQUEST_SELECTION_CHANGED');
      revision = entry.revision;
    }
    if (revision !== local.revision || carried !== inspectedSource ||
        inspectedSource.slice(selection.start, selection.end) !== target.source.slice(target.selection.start, target.selection.end)) {
      throw new Error('REQUEST_SELECTION_CHANGED');
    }
    const pages = [];
    let args = {...selection, ...(target.objectId ? {objectId: target.objectId} : {})}, inspection;
    do {
      const result = await call('document.read_context', {document: target.document, ...args, limit: 4096,
        operation_id: crypto.randomUUID()});
      if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
      inspection = result.structuredContent;
      if (result.isError || inspection?.outcome !== 'ok' || inspection.documentId !== target.documentId ||
          inspection.revision !== inspectedRevision || typeof inspection.text !== 'string' || inspection.omissionCount) {
        throw new Error('REQUEST_SELECTION_CHANGED');
      }
      pages.push(inspection.text);
      args = inspection.next_cursor ? {cursor: inspection.next_cursor} : null;
    } while (args);
    const contextHandle = inspection.coverage?.complete && (inspection.complete_handle || inspection.handle);
    if (!contextHandle) throw new Error('REQUEST_SELECTION_UNAVAILABLE');
    if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
    if (base.revision !== inspectedRevision || base.text !== inspectedSource || !same(await host.snapshot(), base) || dirty || flight || composing) {
      throw new Error('REQUEST_NOT_SYNCED');
    }
    if (!available()) throw new Error('REQUEST_DOCUMENT_CHANGED');
    const payload = {document: token, documentId: base.documentId, revision: base.revision,
      filename: base.filename, selection, ...(target.objectId ? {objectId: target.objectId} : {}),
      context_handle: contextHandle, inspection: {text: pages.join(''), complete: true, coverage: inspection.coverage},
      quotedPassage: target.quoted, request: question || target.quoted,
      requestSource: question ? 'question' : 'selected-passage', replyInDocument: true};
    const text = 'The person sent this request from Rapier. The context_handle names their exact inspected selection; inspection contains its source or drawing recipe. Use its workspace ID and this handle to answer beside the selection in the same document unless the request says otherwise. The request field is their instruction; quotedPassage and inspection are context when requestSource is question. Preserve their question and newer work.\n' + JSON.stringify(payload);
    await request('ui/message', {role: 'user', content: [{type: 'text', text}]});
    return true;
  }

  // `selected` is the editor's exact selection (its source, revision and absolute interval), or a comment thread's context as text.
  async function askAboutSelection(selected) {
    const thread = typeof selected === 'string';
    if (!base || closed || closing || switching || !thread && (!object(selected) || selected.documentId !== base.documentId ||
        typeof selected.source !== 'string' || !Number.isSafeInteger(selected.revision) ||
        !sourceRange(selected.selection, selected.source.length))) return false;
    const quoted = String(thread ? selected : selected.text || '').trim();
    if (!quoted || !thread && selected.selection.start === selected.selection.end) return false;
    if (withheld) {
      host.notify('Share this document with the chat before asking an agent.', 'info');
      return false;
    }
    if (!object(capabilities.message)) {
      host.notify('This chat cannot receive messages from the document here.', 'info');
      return false;
    }
    const target = thread ? {document: token, documentId: base.documentId, revision: base.revision, selection: null, quoted}
      : {document: token, documentId: base.documentId, revision: base.revision,
        localRevision: selected.revision, source: selected.source, selection: {...selected.selection},
        ...(selected.objectId ? {objectId: selected.objectId} : {}), quoted};
    return new Promise(resolve => {
      const quote = document.createElement('p');
      quote.style.cssText = 'margin:0 0 var(--space-4);line-height:1.5;font-style:italic;opacity:.8;max-height:6em;overflow:auto';
      quote.textContent = quoted.length > 400 ? quoted.slice(0, 400) + '…' : quoted;
      const hint = document.createElement('p');
      hint.style.cssText = 'margin:0 0 var(--space-4);line-height:1.5';
      hint.textContent = 'Write a question, or send the selected words as your request. The reply belongs here in your document.';
      const field = document.createElement('textarea');
      field.className = 'navigator-outline-filter';
      field.rows = 3;
      field.placeholder = 'Your question (optional)';
      field.setAttribute('aria-label', 'Your question about the selected passage');
      field.setAttribute('autofocus', '');
      field.style.cssText = 'width:100%;height:auto;min-height:6rem;padding-block:var(--space-2);resize:vertical;box-sizing:border-box';
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
            error?.message === 'REQUEST_SELECTION_CHANGED' ? 'The selected work changed. Your question is kept here; select the current work and ask again.' :
            error?.message === 'REQUEST_SELECTION_UNAVAILABLE' ? 'This selection cannot be inspected as one editable target. Select a smaller passage and ask again.' :
            'The chat did not confirm receipt. Your question is kept here; check the chat before sending again.', 'error');
        } finally {
          sending = false;
          sendButton.disabled = cancelButton.disabled = field.disabled = false;
        }
      };
      const sendButton = button('Send', send), cancelButton = button('Cancel', () => finish(false));
      cancelButton.dataset.pop = 'cancel';
      field.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); void send(event); }
      });
      const sheet = host.sheet({title: 'Ask about this passage', body: [quote, hint, field, [sendButton, cancelButton]],
        onEscape: () => { if (!sending) finish(false); },
        onClose: () => { if (!settled) { settled = true; resolve(false); } }});
    });
  }

  async function teardown(id) {
    closing = true;
    cancelEditorRequests('editor_unavailable', {waitingOnly: true});
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
    cancelEditorRequests('editor_unavailable', {forget: true});
    post({id, result: {}});
    closed = true;
    exportFlight = null;
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
      else if (value.method === 'ui/resource-teardown') { finishHostWork(); void teardown(value.id).catch(error => {
        closing = false;
        post({id: value.id, error: {code: -32000, message: 'The document could not finish saving.'}});
        failed(error);
      }); }
      else post({id: value.id, error: {code: -32601, message: 'Method not supported'}});
      return;
    }
    if (value.method === 'ui/notifications/host-context-changed') updateContext(value.params);
    else if (value.method === 'notifications/resources/updated' &&
        typeof value.params?.uri === 'string' && value.params.uri === activeFile()?.file.resourceUri) void refreshHostFile();
    else if (value.method === 'ui/notifications/tool-result') { finishHostWork(); void receive(value.params).catch(failed); }
    else if (value.method === 'ui/notifications/tool-input') {
      if (!token && validToken(value.params?.arguments?.document)) token = value.params.arguments.document;
      beginHostWork(value.params);
      schedule(0);
    } else if (value.method === 'ui/notifications/tool-cancelled') {
      finishHostWork();
      cancelEditorRequests('editor_request_unavailable', {waitingOnly: true});
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
      if (pairedId) {
        capabilities = {serverTools: {}};
        token = pairedId;
        const light = matchMedia('(prefers-color-scheme: light)');
        updateContext({displayMode: 'fullscreen', theme: light.matches ? 'light' : 'dark'});
        light.addEventListener('change', event => updateContext({theme: event.matches ? 'light' : 'dark'}), {signal: listeners.signal});
        initialized = true;
        failures = 0;
        // Without an editor key this browser is not yet admitted: it pairs, then loads again.
        if (typeof globalThis.RAPIER_EDITOR_KEY !== 'string') { void pair(); return; }
        contextChanged();
        schedule(0);
        return;
      }
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

  // The code only identifies this pending browser. The page grants a session after the person chooses ALLOW;
  // a poll, a matched code or a stale decision never opens the editor on its own.
  async function pair() {
    const pop = housePop('rapier-app-pair-title', 'Pair this browser', 'rapier-app-pairing');
    const lead = document.createElement('p');
    lead.textContent = 'Tell your assistant this code.';
    const code = document.createElement('p');
    code.className = 'rapier-app-pair-code';
    code.setAttribute('aria-live', 'polite');
    code.textContent = '····';
    const words = document.createElement('p');
    words.textContent = 'Then choose Allow here to edit this document for a day. A code works once and changes every minute.';
    let open = true, deciding = false, poll = null;
    const close = () => { open = false; pop.overlay.remove(); pairDialog = null; setStatus('unpaired'); };
    const decide = async decision => {
      if (!open || deciding) return;
      deciding = true;
      allow.disabled = cancel.disabled = true;
      // Finish any initial code request first, so Cancel retires the cookie the browser has just received.
      await poll;
      let value = null;
      try { value = (await call('document.pair_status', {document: pairedId, decision}))?.structuredContent; } catch (_) {}
      if (!open) return;
      if (decision === 'cancel') { close(); return; }
      if (value?.outcome === 'paired') { location.reload(); return; }
      deciding = false;
      allow.disabled = cancel.disabled = false;
      lead.textContent = 'Pairing could not finish. Try again.';
    };
    const allow = popButton('allow', 'affirm', () => { void decide('allow'); });
    const cancel = popButton('cancel', 'cancel', () => { void decide('cancel'); });
    allow.hidden = true;
    // An unpaired page stays inert behind its notice: nothing typed there could reach the workspace.
    pop.row.append(allow, cancel);
    pop.overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); void decide('cancel'); } }, {signal: listeners.signal});
    pairDialog = pop.overlay;
    pop.show(lead, code, words);
    lock();
    while (open && !closed) {
      if (deciding) { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
      poll = call('document.pair_status', {document: pairedId}).then(result => result?.structuredContent).catch(() => null);
      const value = await poll;
      if (!open) return;
      if (deciding) continue;
      if (value?.outcome === 'confirmation_required') {
        lead.textContent = 'Allow this browser to edit the document?';
        words.textContent = 'This browser stays connected for a day. Disconnect agents in the document to stop agent access.';
        if (allow.hidden) {
          allow.hidden = false;
          globalThis._rapierPopArrange?.(pop.row);
          allow.focus({preventScroll: true});
        }
      } else if (value?.outcome === 'waiting' && /^[A-Z]{4}$/.test(value.pairingCode)) {
        allow.hidden = true;
        code.textContent = value.pairingCode;
        lead.textContent = 'Tell your assistant this code.';
        words.textContent = 'Then choose Allow here to edit this document for a day. A code works once and changes every minute.';
      }
      else if (value?.reason === 'busy') {
        allow.hidden = true;
        code.textContent = '';
        lead.textContent = 'Pairing is busy. Try again in a minute.';
      }
      else if (value?.code === 'DOCUMENT_UNAVAILABLE') {
        code.textContent = '';
        lead.textContent = 'This document is no longer available.';
        words.textContent = 'It was deleted or expired. Ask your assistant for a new one.';
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
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
    if (!pairedId) window.addEventListener('message', message, {signal: listeners.signal});
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
          ((notice.contains(event.target) || pairDialog?.contains(event.target) || homeDialog?.contains(event.target) || fileDialog?.contains(event.target)) &&
            !event.ctrlKey && !event.metaKey && ['Enter', ' '].includes(event.key)))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const type of ['keydown', 'beforeinput', 'cut', 'paste', 'drop']) {
      window.addEventListener(type, blockBeforeOpen, {capture: true, signal: listeners.signal});
    }
    const options = {capture: true, signal: listeners.signal};
    for (const type of ['pointerdown', 'keydown', 'beforeinput', 'compositionend']) document.addEventListener(type, recordEditorActivity, options);
    document.addEventListener('beforeinput', event => { if (event.isTrusted) humanEdit(); }, options);
    document.addEventListener('compositionstart', event => { if (event.isTrusted) { composing = true; humanEdit(); } }, options);
    document.addEventListener('compositionend', event => { if (event.isTrusted) { composing = false; humanEdit(); } }, options);
    document.addEventListener('visibilitychange', () => {
      contextChanged();
      if (visible()) schedule(0);
      else { cancelEditorRequests('editor_unavailable', {waitingOnly: true}); clearTimeout(timer); void publishHumanContext(true); void flush(); }
    }, {signal: listeners.signal});
    window.addEventListener('pagehide', () => cancelEditorRequests('editor_unavailable', {forget: true}), {signal: listeners.signal});
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
