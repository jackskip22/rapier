// SPDX-License-Identifier: MIT
// One host connection owns the wire. Source leaves the editor only in save-request.
const DEFAULT_SRC = 'https://rapier.website/embed/rapier-document.html';
const revision = value => Number.isSafeInteger(value) && value >= 0 || typeof value === 'string' && value.length > 0 && value.length <= 256;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const themeValue = value => ['light', 'dark', 'system'].includes(value);
const mint = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // A handle can be mounted before its caller starts awaiting it.
  promise.catch(() => {});
  return {promise, resolve, reject};
}
const refused = payload => Object.assign(new Error(payload?.reason || payload?.code || 'The editor refused the request'), {code: payload?.code, payload});

function conflict(currentRevision) {
  if (!revision(currentRevision)) throw new TypeError('A conflict needs the current revision');
  return Object.assign(new Error('The stored document has changed'), {code: 'conflict', currentRevision});
}

function mount(target, options = {}) {
  const document = target?.ownerDocument;
  if (!document) throw new TypeError('Mount needs an iframe or a container element');
  const host = document.defaultView, iframe = target.tagName === 'IFRAME' ? target : document.createElement('iframe');
  const source = new URL(options.src || DEFAULT_SRC, host.location.href);
  if (source.username || source.password || !(source.protocol === 'https:' || source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)))
    throw new TypeError('The editor needs HTTPS, or HTTP on localhost');
  source.searchParams.set('embed', '1');
  const origin = source.origin, sessionId = options.sessionId ?? mint('session'), documentId = options.documentId ?? mint('document');
  if (!identifier(sessionId) || !identifier(documentId)) throw new TypeError('Session and document IDs must be nonempty strings of at most 256 code units');
  if (options.theme !== undefined && !themeValue(options.theme)) throw new TypeError('Theme must be light, dark or system');
  if (options.save !== undefined && typeof options.save !== 'function') throw new TypeError('save must be a durable storage callback');
  const capabilities = [
    ...(options.load !== undefined ? ['open'] : []), ...(options.save ? ['read'] : []),
    ...(options.save || options.onState ? ['changes'] : []), ...(options.compare ? ['compare'] : []),
    ...(options.onClose ? ['close'] : []), ...(options.agent ? ['agent'] : []),
  ];
  if (options.agent && (!capabilities.includes('open') || !capabilities.includes('read')))
    throw new TypeError('Agent access needs both load and save');
  const ids = {sessionId, documentId}, answers = new Map(), waiting = new Map(), listeners = new Map();
  let port = null, posted = false, connected = false, ended = false, sawLoad = false, seq = 0, activeSave = null, activeClose = null;
  let currentTheme = options.theme, lastSaved = null, readOnly = false, connectedWait = deferred(), boot;
  const ready = deferred();
  const emit = (type, value) => { for (const fn of listeners.get(type) || []) fn(value); };
  const fail = error => { emit('error', error); options.onError?.(error); };
  const rejectPending = error => {
    for (const job of waiting.values()) job.reject(error);
    waiting.clear(); activeSave?.reject(error); activeSave = null; activeClose?.reject(error); activeClose = null;
  };
  function send(type, payload, baseRevision, quiet = false) {
    if (ended || !connected || !port) return Promise.reject(new Error('The editor connection has ended or is not connected'));
    const requestId = 'host-' + ++seq;
    const message = {type, ...ids, requestId, ...(baseRevision !== undefined ? {baseRevision} : {}), ...(payload !== undefined ? {payload} : {})};
    const pending = deferred();
    if (!quiet) waiting.set(requestId, pending);
    try { port.postMessage(message); if (quiet) pending.resolve(); }
    catch (error) { waiting.delete(requestId); pending.reject(error); }
    return pending.promise;
  }
  function requestCapture() {
    send('save', undefined, undefined, true).catch(error => { activeSave?.reject(error); activeSave = null; });
  }
  async function answerSave(message, channel) {
    const {requestId, baseRevision, payload} = message;
    if (!options.save || !identifier(requestId) || !revision(baseRevision) || typeof payload?.content !== 'string') return;
    if (!answers.has(requestId)) {
      // Cache the promise before entering storage: an in-flight Retry is the same write.
      const job = Promise.resolve().then(async () => {
        try {
          const result = await options.save({...payload, requestId, baseRevision});
          if (!revision(result?.revision) || result.revision === baseRevision || typeof result.revision === 'number' && typeof baseRevision === 'number' && result.revision <= baseRevision)
            throw new TypeError('save must return an advancing durable revision');
          return {type: 'save-ack', ...ids, requestId, baseRevision, payload: {revision: result.revision}};
        } catch (error) {
          return {type: 'save-nack', ...ids, requestId, baseRevision, payload: error?.code === 'conflict' && revision(error.currentRevision)
            ? {code: 'conflict', currentRevision: error.currentRevision}
            : {code: 'failed', reason: String(error?.message || error).slice(0, 500)}};
        }
      });
      answers.set(requestId, job);
    }
    const reply = await answers.get(requestId);
    if (ended || channel !== port) return;
    channel.postMessage(reply);
    if (reply.type === 'save-ack') {
      lastSaved = reply.payload;
      if (activeSave) activeSave.acknowledged = true;
    } else if (activeSave) { activeSave.reject(refused(reply.payload)); activeSave = null; }
  }
  function onPortMessage(event, channel) {
    if (channel !== port || ended) return;
    const message = event.data;
    if (!record(message) || message.sessionId !== sessionId || message.documentId !== documentId || !record(message.payload)
      || !(message.requestId === null || identifier(message.requestId)) || !(message.baseRevision == null || revision(message.baseRevision))) return;
    const {type, payload, requestId} = message, pending = waiting.get(requestId);
    if (type === 'connected') {
      if (connected) return;
      connected = true; connectedWait.resolve(); emit('connected', payload); return;
    }
    if (!connected) return;
    if (type === 'save-request') { answerSave(message, channel).catch(fail); return; }
    if (type === 'document-state' && capabilities.includes('changes')) {
      if (!['loaded', 'dirty', 'saving', 'closing', 'readOnly'].every(key => typeof payload[key] === 'boolean')
        || Object.keys(payload).some(key => !['loaded', 'dirty', 'saving', 'closing', 'readOnly', 'filename', 'docKind'].includes(key))) return;
      readOnly = payload.readOnly; emit('state', payload); options.onState?.(payload);
      // Storage completion alone cannot settle Save: the frame may hold newer edits or an earlier save.
      if (activeSave?.acknowledged && !payload.saving && message.baseRevision === lastSaved?.revision) {
        if (payload.dirty) { activeSave.acknowledged = false; requestCapture(); }
        else { activeSave.resolve(lastSaved); activeSave = null; }
      }
      return;
    }
    if (type === 'agent-review' && options.agent) { emit('agent-review', payload); return; }
    if (type === 'close-request' && options.onClose) {
      Promise.resolve().then(() => options.onClose({dirty: !!payload.dirty})).then(decision => {
        if (!['save', 'discard', 'cancel'].includes(decision)) throw new TypeError('Close needs save, discard or cancel');
        if (channel !== port || ended) return;
        channel.postMessage({type: 'close-decision', ...ids, requestId, baseRevision: message.baseRevision, payload: {decision}});
        if (decision === 'cancel') { activeClose?.resolve({cancelled: true}); activeClose = null; }
      }).catch(error => { activeClose?.reject(error); activeClose = null; fail(error); });
      emit('close-request', payload); return;
    }
    if (type === 'close-ready' && options.onClose) { activeClose?.resolve(payload); activeClose = null; emit('closed', payload); return; }
    if (type === 'protocol-error') {
      const error = refused(payload);
      if (pending) { waiting.delete(requestId); pending.reject(error); }
      else { activeSave?.reject(error); activeSave = null; activeClose?.reject(error); activeClose = null; fail(error); }
      return;
    }
    if (pending && ['load-ack', 'load-nack', 'compare-ack', 'compare-nack'].includes(type)) {
      waiting.delete(requestId);
      if (type === 'load-ack') readOnly = payload.readOnly === true;
      if (type.endsWith('-nack')) pending.reject(refused(payload)); else pending.resolve(payload);
    }
  }
  function prepareBoot() {
    boot = connectedWait.promise.then(async () => {
      if (options.load !== undefined) {
        const value = typeof options.load === 'function' ? await options.load() : options.load;
        if (!record(value) || typeof value.content !== 'string' || !revision(value.revision)) throw new TypeError('load needs content and its revision');
        await send('load', value, null);
      }
      ready.resolve(handle);
    });
    boot.catch(error => { ready.reject(error); if (!ended) fail(error); });
  }
  function connect() {
    if (posted || ended) return;
    const channel = new host.MessageChannel();
    port = channel.port1; posted = true;
    port.onmessage = event => onPortMessage(event, channel.port1);
    port.onmessageerror = () => { rejectPending(new Error('The editor connection was lost')); };
    try { iframe.contentWindow.postMessage({type: 'rapier-connect', ...ids, capabilities, ...(currentTheme ? {theme: currentTheme} : {})}, origin, [channel.port2]); }
    catch (error) { port.close(); port = null; posted = false; fail(error); }
  }
  function onLoad() {
    if (sawLoad && posted) {
      rejectPending(new Error('The editor reconnected')); port?.close();
      connected = false; posted = false; readOnly = false; connectedWait = deferred(); prepareBoot();
    }
    sawLoad = true;
    connect();
  }
  function onWindowMessage(event) {
    if (event.source !== iframe.contentWindow || event.origin !== origin) return;
    if (event.data?.type === 'rapier-ready') connect();
    else if (event.data?.type === 'close-ready' && event.data.sessionId === sessionId && event.data.documentId === documentId && options.onClose) {
      activeClose?.resolve(event.data.payload); activeClose = null; emit('closed', event.data.payload);
    }
  }
  const handle = Object.freeze({
    iframe, ready: ready.promise,
    get connected() { return connected && !ended; },
    async load(content, {filename, revision: version, readOnly, title} = {}) {
      await boot;
      return send('load', {content, revision: version, ...(filename !== undefined ? {filename} : {}), ...(readOnly !== undefined ? {readOnly} : {}), ...(title !== undefined ? {title} : {})}, null);
    },
    async save() {
      await boot;
      if (!options.save) throw new Error('No save callback was granted');
      if (ended) throw new Error('The editor connection has ended');
      if (readOnly) throw new Error('The document is read-only');
      if (!activeSave) activeSave = {...deferred(), acknowledged: false};
      const promise = activeSave.promise;
      requestCapture(); return promise;
    },
    async compare(content, {filename} = {}) { await boot; return send('compare', {content, ...(filename !== undefined ? {filename} : {})}); },
    async close() {
      await boot;
      if (!options.onClose) throw new Error('No close callback was granted');
      if (!activeClose) { activeClose = deferred(); send('close', undefined, undefined, true).catch(error => { activeClose?.reject(error); activeClose = null; }); }
      return activeClose.promise;
    },
    async theme(value) {
      if (!themeValue(value)) throw new TypeError('Theme must be light, dark or system');
      currentTheme = value; await boot; return send('theme', {theme: value}, undefined, true);
    },
    disconnect() {
      if (ended) return;
      if (connected) send('disconnect', undefined, undefined, true).catch(() => {});
      ended = true; connected = false;
      const error = new Error('The editor connection has ended');
      rejectPending(error); connectedWait.reject(error); ready.reject(error);
      host.removeEventListener('message', onWindowMessage); iframe.removeEventListener('load', onLoad);
      port?.close(); port = null; listeners.clear();
    },
    on(type, fn) {
      if (typeof fn !== 'function') throw new TypeError('An event listener must be a function');
      if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
  });
  prepareBoot();
  iframe.setAttribute('title', options.title || 'Markdown editor');
  iframe.setAttribute('allow', options.agent ? 'clipboard-write; tools' : 'clipboard-write');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads');
  // Install before navigation or insertion: the first ready or load can arrive immediately.
  host.addEventListener('message', onWindowMessage); iframe.addEventListener('load', onLoad);
  iframe.src = source.href;
  if (iframe !== target) target.append(iframe);
  return handle;
}

export const Rapier = Object.freeze({mount, conflict});

// One submit owner per form captures every enabled editor before native validation and submission.
const forms = new WeakMap();
function joinForm(field, form) {
  if (!form) return () => {};
  let group = forms.get(form);
  if (!group) {
    group = {fields: new Set(), pending: false, releasing: false};
    group.submit = async event => {
      if (group.releasing) return;
      event.preventDefault();
      if (group.pending) return;
      group.pending = true;
      const submitter = event.submitter;
      const enabled = () => [...group.fields].filter(field => field.isConnected && field.form === form && !field._disabled);
      const captured = enabled().map(field => ({field, generation: field._generation, authority: field._formAuthority}));
      // A reset, replacement or association change retires this submit, including a rejected old capture.
      const current = () => forms.get(form) === group && enabled().length === captured.length && captured.every(({field, generation, authority}) =>
        group.fields.has(field) && field.isConnected && field.form === form && !field._disabled && field._generation === generation && field._formAuthority === authority);
      try {
        await Promise.all(captured.map(({field}) => field.save()));
        if (!current() || submitter && (submitter.form !== form || submitter.disabled)) return;
        group.releasing = true;
        // requestSubmit repeats native constraints, submitter overrides and all ordinary submit listeners.
        if (submitter?.form === form) form.requestSubmit(submitter); else form.requestSubmit();
      } catch (error) { if (current()) for (const {field} of captured) field._error(error); }
      finally { group.pending = false; group.releasing = false; }
    };
    form.addEventListener('submit', group.submit, true); forms.set(form, group);
  }
  group.fields.add(field);
  return () => {
    group.fields.delete(field);
    if (!group.fields.size) { form.removeEventListener('submit', group.submit, true); forms.delete(form); }
  };
}

export class RapierEditor extends (globalThis.HTMLElement || class {}) {
  static formAssociated = true;
  static observedAttributes = ['disabled', 'required', 'theme', 'src', 'name'];
  constructor() {
    super();
    this._internals = this.attachInternals(); this._value = ''; this._revision = 0; this._dirty = false;
    this._disabled = false; this._initialized = false; this._sync = Promise.resolve(); this._generation = 0; this._formAuthority = 0;
    const shadow = this.attachShadow({mode: 'open', delegatesFocus: true}), doc = this.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = ':host{display:block}button{font:inherit;color:inherit;cursor:pointer}.preview{width:100%;white-space:pre-wrap;text-align:start;padding:1rem;max-height:16rem;overflow:auto}.panel{box-sizing:border-box;width:100%;height:32rem;border:0;padding:0;position:static;color:inherit;background:Canvas}.mount,.mount iframe{width:100%;height:100%;border:0}.done{display:none}@media(max-width:600px){.panel{position:fixed;inset:0;width:100%;max-width:none;height:100dvh;max-height:none;margin:0}.mount{height:calc(100% - 3rem)}.done{display:block;height:3rem;width:100%}}@media(min-width:601px){.preview{display:none}}';
    this._preview = doc.createElement('button'); this._preview.type = 'button'; this._preview.className = 'preview';
    this._panel = doc.createElement('dialog'); this._panel.className = 'panel';
    this._done = doc.createElement('button'); this._done.type = 'button'; this._done.className = 'done'; this._done.textContent = 'Done';
    this._mount = doc.createElement('div'); this._mount.className = 'mount';
    this._panel.append(this._done, this._mount); shadow.append(style, this._preview, this._panel);
    this._preview.addEventListener('click', () => this.focus());
    this._done.addEventListener('click', () => this._finish());
    this._panel.addEventListener('cancel', event => { event.preventDefault(); this._finish(); });
  }
  connectedCallback() {
    if (!this._initialized) {
      this._fallback = this.querySelector('textarea');
      const own = Object.prototype.hasOwnProperty.call(this, 'value') ? this.value : undefined;
      if (own !== undefined) delete this.value;
      this._value = own !== undefined ? String(own) : this._hasValue ? this._value : this._fallback?.value ?? this.textContent;
      this._defaultValue = this._fallback?.defaultValue ?? this._value;
      if (this._fallback) this._fallback.disabled = true;
      this._initialized = true;
    }
    this._disabled = this.matches(':disabled'); this.tabIndex = this._disabled ? -1 : 0;
    this._media ||= this.ownerDocument.defaultView.matchMedia('(max-width:600px)');
    this._onMedia ||= () => this._layout(); this._media.addEventListener('change', this._onMedia);
    this._bindForm(); this._updateValue(); this._layout(); if (this._panel.open) this._start();
  }
  disconnectedCallback() {
    this._formAuthority++;
    queueMicrotask(() => {
      if (this.isConnected) return;
      this._leaveForm?.(); this._leaveForm = null; this._media?.removeEventListener('change', this._onMedia);
      this._editor?.disconnect(); this._editor = null; this._mount.replaceChildren();
    });
  }
  attributeChangedCallback(name) {
    if (!this._initialized) return;
    if (name === 'disabled') this.formDisabledCallback(this.matches(':disabled'));
    else if (name === 'theme') this._editor?.theme(this.getAttribute('theme') || 'system').catch(error => this._error(error));
    else if (name === 'src') this.save().then(() => this._replace(this._value)).catch(error => this._error(error));
    else this._updateValue();
  }
  get value() { return this._value; }
  set value(value) { this._hasValue = true; this._replace(String(value)); }
  get name() { return this.getAttribute('name') || ''; }
  set name(value) { this.setAttribute('name', value); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { this.toggleAttribute('disabled', !!value); }
  get required() { return this.hasAttribute('required'); }
  set required(value) { this.toggleAttribute('required', !!value); }
  get form() { return this._internals.form; }
  get labels() { return this._internals.labels; }
  get validity() { return this._internals.validity; }
  get validationMessage() { return this._internals.validationMessage; }
  get willValidate() { return this._internals.willValidate; }
  checkValidity() { return this._internals.checkValidity(); }
  reportValidity() { return this._internals.reportValidity(); }
  setCustomValidity(message) { this._customValidity = String(message); this._updateValue(); }
  _bindForm() { this._formAuthority++; this._leaveForm?.(); this._leaveForm = joinForm(this, this.form); }
  formAssociatedCallback() { if (this._initialized && this.isConnected) this._bindForm(); }
  formResetCallback() { this._replace(this._defaultValue); }
  formStateRestoreCallback(state) { if (typeof state === 'string') this._replace(state); }
  formDisabledCallback(disabled) {
    const wasDisabled = this._disabled; this._disabled = disabled;
    if (disabled !== wasDisabled) this._formAuthority++;
    this.tabIndex = disabled ? -1 : 0; this._preview.disabled = disabled; this._mount.inert = disabled;
    if (!this._initialized) return;
    this._updateValue();
    const editor = this._editor;
    if (!editor || disabled === wasDisabled) return;
    this._sync = this._sync.then(async () => {
      if (this._editor !== editor) return;
      await editor.ready;
      if (!wasDisabled) await editor.save();
      if (this._editor === editor) await editor.load(this._value, {filename: this._filename(), revision: this._revision, readOnly: disabled});
    }).catch(error => { if (this._editor === editor) this._error(error); });
  }
  _filename() { return (this.getAttribute('name') || 'document').slice(0, 240) + '.md'; }
  _updateValue() {
    // Multipart text fields normalize newlines. A Markdown file part preserves the exact UTF-8 bytes.
    const File = this.ownerDocument.defaultView.File;
    this._internals.setFormValue(new File([this._value], this._filename(), {type: 'text/markdown'}), this._value);
    this._preview.textContent = this._value || 'Edit document'; this._preview.disabled = this._disabled;
    if (this._fallback) this._fallback.value = this._value;
    const missing = this.required && !this._value && !this._dirty;
    const error = this._customValidity || (missing ? 'Please fill out this field.' : '');
    this._internals.setValidity(error ? (this._customValidity ? {customError: true} : {valueMissing: true}) : {}, error, this._preview);
  }
  _replace(value) {
    this._value = value; this._dirty = false; this._revision = 0; this._generation++;
    this._editor?.disconnect(); this._editor = null; this._mount.replaceChildren(); this._updateValue();
    if (this._initialized && this.isConnected && this._panel.open) this._start();
  }
  _start() {
    if (this._editor) return;
    const generation = this._generation;
    this._editor = Rapier.mount(this._mount, {
      src: this.getAttribute('src') || DEFAULT_SRC, theme: this.getAttribute('theme') || 'system',
      load: {content: this._value, filename: this._filename(), revision: this._revision, readOnly: this._disabled},
      save: ({content, baseRevision}) => {
        if (this._generation !== generation) throw new Error('The form field was replaced');
        if (baseRevision !== this._revision) throw conflict(this._revision);
        this._value = content; this._revision++; this._dirty = false; this._updateValue();
        this.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
        return {revision: this._revision};
      },
      onState: state => { this._dirty = state.dirty; this._updateValue(); },
      onError: error => this._error(error),
    });
    this._mount.inert = this._disabled;
  }
  _layout() {
    const narrow = this._media.matches;
    if (this._narrow === narrow) return;
    this._narrow = narrow;
    if (this._panel.open) this._panel.close();
    if (!narrow) { this._panel.setAttribute('open', ''); this._start(); }
  }
  focus(options) {
    if (this._disabled) return;
    if (this._narrow && !this._panel.open) this._panel.showModal();
    this._start(); this._editor.iframe.focus(options);
  }
  async save() {
    await this._sync;
    if (this._editor && !this._disabled) await this._editor.save();
    return this._value;
  }
  async _finish() {
    try { await this.save(); this._panel.close(); this._preview.focus(); }
    catch (error) { this._error(error); }
  }
  _error(error) { this.dispatchEvent(new CustomEvent('error', {detail: error, bubbles: true, composed: true})); }
}

export function defineRapierEditor(registry = globalThis.customElements) {
  if (!registry || !globalThis.ElementInternals) throw new Error('rapier-editor needs form-associated custom elements');
  if (!registry.get('rapier-editor')) registry.define('rapier-editor', RapierEditor);
  return RapierEditor;
}
