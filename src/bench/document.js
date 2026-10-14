// SPDX-License-Identifier: AGPL-3.0-only
(() => {
  const environment = globalThis.RapierBenchSession;
  if (environment?.active !== true) return;

  const operations = new Set(['open', 'type-start', 'type-middle', 'type-end', 'search', 'copy-formatted', 'save']);
  const encoder = new TextEncoder();
  const fail = message => { throw new Error(message); };
  const aborted = () => new DOMException('Benchmark stopped', 'AbortError');
  const current = context => {
    if (environment !== globalThis.RapierBenchSession || environment.active !== true || context.signal?.aborted) throw aborted();
    const identity = context.session.document?.identity;
    if (identity && (identity.epoch !== rapier.identity.epoch || identity.authority !== rapier.identity.authority)) {
      throw new Error('The benchmark document changed during the sample.');
    }
  };
  const keepIdentity = state => {
    state.identity = {epoch: rapier.identity.epoch, authority: rapier.identity.authority};
    state.stamp = _rapierMutationStamp();
  };
  const twoFrames = context => new Promise((resolve, reject) => {
    let frame = 0;
    const cancel = () => { cancelAnimationFrame(frame); reject(aborted()); };
    context.signal?.addEventListener('abort', cancel, {once: true});
    const step = remaining => {
      try { current(context); }
      catch (error) { context.signal?.removeEventListener('abort', cancel); reject(error); return; }
      if (!remaining) { context.signal?.removeEventListener('abort', cancel); resolve(); return; }
      frame = requestAnimationFrame(() => step(remaining - 1));
    };
    step(2);
  });
  const fingerprint = async (text, context) => {
    current(context);
    const bytes = encoder.encode(text);
    let sha256;
    if (globalThis.crypto?.subtle) {
      sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    } else {
      const hash = globalThis.RapierNotesIntegrity?.sha256State?.();
      if (!hash) fail('SHA-256 is unavailable; source integrity cannot be verified.');
      for (let at = 0; at < bytes.length; at += 262144) {
        hash.update(bytes.subarray(at, at + 262144));
        await new Promise(resolve => setTimeout(resolve, 0));
        current(context);
      }
      sha256 = hash.finish();
    }
    current(context);
    return {bytes: bytes.length, sha256};
  };
  const exactSource = async (expected, context) => {
    current(context);
    const captured = await _rapierCaptureSettledExternalDocument({quiet: true});
    current(context);
    if (!captured || !_rapierMutationStampIsCurrent(captured.stamp)) fail('The benchmark source did not settle.');
    if (captured.canonical !== expected) fail('The benchmark operation changed unexpected source bytes.');
    const proof = await fingerprint(captured.canonical, context);
    if (!_rapierMutationStampIsCurrent(captured.stamp)) fail('The source changed while its bytes were being checked.');
    return proof;
  };
  const load = async (state, context) => {
    current(context);
    state.identity = null;
    const receipt = await rapierLoad(state.fixture.source, state.filename, {
      signal: context.signal, documentKind: 'markdown', returnReceipt: true,
    });
    current(context);
    if (!receipt || !_rapierLoadReceiptIsCurrent(receipt)) fail('The document owner did not accept the benchmark input.');
    keepIdentity(state);
    return receipt;
  };
  const capture = () => {
    if (!environment.capture || typeof environment.capture !== 'object') fail('The isolated output capture is unavailable.');
    return environment.capture;
  };

  async function prepare(run, context) {
    if (!operations.has(run.operation) || run.kind !== 'document') fail('Unknown document benchmark.');
    current(context);
    const fixture = await context.getFixture(run.fixture);
    current(context);
    if (!fixture || typeof fixture.source !== 'string' || fixture.metadata?.id !== run.fixture) fail('The benchmark fixture is unavailable.');
    const state = context.session.document = {fixture, filename: fixture.metadata.id + '.md', operation: run.operation, identity: null};
    const source = await fingerprint(fixture.source, context);
    if (source.bytes !== fixture.metadata.bytes || source.sha256 !== fixture.metadata.sha256) fail('The built-in document differs from its fixed input hash.');
    state.input = source;
    const output = capture(); output.clipboard = null; output.saved = null;
    environment.signal = context.signal;
    state.cancel = () => {
      rapierFindClear();
      document.querySelector('.rapier-progress__cancel')?.click();
    };
    context.signal?.addEventListener('abort', state.cancel, {once: true});
    rapierFindClear();
    if (run.operation === 'open') {
      const empty = await rapierLoad('', 'benchmark-empty.md', {signal: context.signal, documentKind: 'markdown', returnReceipt: true});
      current(context);
      if (!empty || !_rapierLoadReceiptIsCurrent(empty) || !rapierSetMode('read', {announce: false})) fail('The empty editor could not be prepared.');
      return;
    }
    await load(state, context);
    current(context);
    if (run.operation.startsWith('type-')) {
      if (!rapierSetMode('source', {announce: false})) fail('The source editing owner is unavailable.');
      const fraction = run.operation === 'type-start' ? 0 : run.operation === 'type-middle' ? .5 : 1;
      let position = Math.floor(fixture.source.length * fraction);
      if (position && /[\uDC00-\uDFFF]/.test(fixture.source[position] || '')) position--;
      if (fixture.source[position - 1] === '\r' && fixture.source[position] === '\n') position--;
      const textarea = document.getElementById('source-textarea');
      if (!textarea) fail('The source textarea is unavailable.');
      textarea.focus({preventScroll: true});
      _rapierFlatSelectAndReveal(position, position, true);
      if (_rapierAbsPos(textarea.selectionStart) !== position || _rapierAbsPos(textarea.selectionEnd) !== position) fail('The source owner could not place the benchmark caret.');
      state.position = position;
      state.text = 'x';
      state.textarea = textarea;
    } else {
      rapierSetMode('read', {announce: false});
      if (run.operation === 'search') {
        const input = document.getElementById('find-input');
        if (!input) fail('The Find owner is unavailable.');
        input.value = '';
        input._rapierFindWarm = null;
        state.searchInput = input;
      }
    }
    await exactSource(fixture.source, context);
    keepIdentity(state);
    await twoFrames(context);
  }

  async function execute(run, context) {
    current(context);
    const state = context.session.document;
    if (!state || state.operation !== run.operation) fail('The document sample was not prepared.');
    if (state.stamp && !_rapierMutationStampIsCurrent(state.stamp)) fail('The prepared document changed before the sample.');
    const start = performance.now();
    let result;
    if (run.operation === 'open') {
      result = await load(state, context);
    } else if (run.operation.startsWith('type-')) {
      const textarea = state.textarea;
      const before = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'insertText', data: state.text});
      if (!textarea.dispatchEvent(before)) fail('The source owner refused the scripted input.');
      textarea.setRangeText(state.text, textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: state.text}));
      result = {trustedInput: false};
    } else if (run.operation === 'search') {
      state.searchInput.value = state.fixture.metadata.rare;
      result = await rapierFindRun();
      current(context);
      if (result !== true) fail('The Find owner did not complete the benchmark query.');
    } else if (run.operation === 'copy-formatted') {
      result = await rapierCopy('formatted');
      current(context);
      if (result !== true || !capture().clipboard) fail('Formatted copy did not reach the isolated capture.');
    } else if (run.operation === 'save') {
      result = await rapierSave({signal: context.signal, carried: 'none', returnReceipt: true, quiet: true});
      current(context);
      if (!capture().saved) fail('Save did not reach the isolated capture.');
      if (result?.saved !== true || result.confirmed !== true || result.verified !== true) fail('The transient save lifecycle did not complete.');
    }
    current(context);
    const ownerCompletionMs = performance.now() - start;
    keepIdentity(state);
    state.result = result;
    await twoFrames(context);
    const extra = {ownerCompletionMs, domTwoFramesMs: performance.now() - start};
    if (run.operation.startsWith('type-')) extra.trustedKeydownToScreenMs = {unavailable: 'Scripted source input uses the untrusted-event fallback; physical keydown and display scanout are not observed.'};
    if (run.operation === 'copy-formatted') extra.osClipboardWriteMs = {unavailable: 'The prepared formats are captured in memory; the system clipboard is not written.'};
    if (run.operation === 'save') extra.durableFileSaveMs = {unavailable: 'The serialized Blob is captured by a transient host; no filesystem write occurs.'};
    return {extra};
  }

  async function verify(run, value, context) {
    current(context);
    const state = context.session.document, {fixture} = state;
    const proof = {input: state.input, mode: rapier.view.mode, projection: rapier.document.projection.wysiwyg,
      projectionReason: rapier.document.projection.reason || '', measurement: 'Owner completion and DOM plus two animation frames; no display scanout observation.'};
    if (run.operation.startsWith('type-')) {
      rapier.undo.flushTypingBurst();
      proof.edited = await exactSource(fixture.source.slice(0, state.position) + state.text + fixture.source.slice(state.position), context);
      current(context);
      const undone = await rapierUndo();
      current(context);
      if (!undone) fail('Undo refused the scripted edit.');
      proof.undo = await exactSource(fixture.source, context);
      if (proof.undo.bytes !== state.input.bytes || proof.undo.sha256 !== state.input.sha256) fail('Undo did not restore the exact input.');
      proof.inputEventsTrusted = false;
      proof.sourceOffset = state.position;
    } else {
      proof.source = await exactSource(fixture.source, context);
      if (run.operation === 'search') {
        const expected = fixture.source.indexOf(fixture.metadata.rare);
        const ranges = rapier.find.ranges.filter(row => row.surface !== 'picture');
        if (expected < 0 || fixture.source.indexOf(fixture.metadata.rare, expected + 1) !== -1 || ranges.length !== 1 ||
            ranges[0].start !== expected || ranges[0].end !== expected + fixture.metadata.rare.length) fail('Find did not return the exact rare-word source range.');
        proof.search = {matches: ranges.length, start: ranges[0].start, end: ranges[0].end, surface: ranges[0].surface};
      } else if (run.operation === 'copy-formatted') {
        const output = capture().clipboard;
        if (output.markdown !== fixture.source || typeof output.html !== 'string' || typeof output.text !== 'string' ||
            !output.html.includes(fixture.metadata.rare) || !output.text.includes(fixture.metadata.rare)) fail('The formatted-copy payload lost document content.');
        proof.clipboard = {destination: 'transient memory capture', markdown: await fingerprint(output.markdown, context),
          html: await fingerprint(output.html, context), plain: await fingerprint(output.text, context)};
      } else if (run.operation === 'save') {
        const output = capture().saved;
        if (!(output.blob instanceof Blob) || output.filename !== state.filename) fail('The save capture has the wrong file identity.');
        const text = await output.blob.text();
        current(context);
        if (text !== fixture.source) fail('The serialized save differs from the exact document source.');
        proof.save = {destination: 'transient memory capture', filename: output.filename, ...await fingerprint(text, context)};
        if (proof.save.bytes !== output.blob.size || proof.save.bytes !== state.input.bytes || proof.save.sha256 !== state.input.sha256) fail('The serialized file has the wrong bytes.');
      }
    }
    current(context);
    return proof;
  }

  async function cleanup(context) {
    const state = context.session.document;
    if (state?.cancel) context.signal?.removeEventListener('abort', state.cancel);
    if (environment !== globalThis.RapierBenchSession) return;
    rapierFindClear();
    if (context.signal?.aborted) document.querySelector('.rapier-progress__cancel')?.click();
    if (environment.capture) { environment.capture.clipboard = null; environment.capture.saved = null; }
    if (environment.signal === context.signal) environment.signal = null;
    delete context.session.document;
  }

  (globalThis.RapierPhoneBenchAdapters ||= {}).document = Object.freeze({prepare, execute, verify, cleanup});
})();
