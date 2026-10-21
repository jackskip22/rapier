const _rapierDocumentImport = {active: null};

function _rapierImportKind(name, mime = '') {
  mime = String(mime).toLowerCase().split(';')[0].trim();
  if (/\.do[ct]x$/i.test(String(name)) || mime === RAPIER_DOCX_MIME || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.template') return 'docx';
  if (/\.pdf$/i.test(String(name)) || mime === 'application/pdf') return 'pdf';
  if (/\.(textpack|zip)$/i.test(String(name)) || ['application/zip', 'application/x-zip-compressed'].includes(mime)) return 'textpack';
  return null;
}

function _rapierImportFields(options) {
  return new Promise(resolve => _openFieldDialog({...options, onOk: resolve, onCancel: () => resolve(null)}));
}

function _rapierImportProgress(run, words, fraction = null) {
  if (_rapierDocumentImport.active !== run || run.controller.signal.aborted) return;
  if (!run.banner) run.banner = _rapierProgressOpen({label: words, cancel: () => run.controller.abort()});
  run.banner.set(fraction, words);
}

function _rapierPdfSettingsRefresh() {
  const button = document.getElementById('pdf-plugin-action');
  const status = document.getElementById('pdf-plugin-installed');
  if (!button || !status) return;
  const state = globalThis.RapierPdfPlugin?.state();
  const update = state?.update;
  button.hidden = !!state?.installed && !update;
  button.disabled = !!state?.downloading;
  button.textContent = state?.downloading ? 'DOWNLOADING PDF IMPORT…' : update ? 'UPDATE PDF IMPORT \u00b7 ' + _rapierPluginSize(update.bytes) : 'INSTALL PDF IMPORT';
  status.hidden = !state?.installed || !!update;
  (status.querySelector('span') || status).textContent = state?.persistent ? 'PDF IMPORT INSTALLED' : 'PDF IMPORT READY THIS SESSION';
}

async function _rapierEnsurePdfImportPlugin(run, tapped = false) {
  const plugin = globalThis.RapierPdfPlugin;
  if (!plugin) throw new Error('The PDF import plugin is unavailable.');
  const here = await plugin.checkInstalled(), waiting = plugin.state().update;
  if (here && tapped && waiting && !_rapierUiAndroid()) {
    _rapierImportProgress(run, 'Updating PDF reader');
    await plugin.install({signal: run.controller.signal, onProgress: fraction => _rapierImportProgress(run, 'Updating PDF reader', fraction)});
  } else if (!here && waiting?.required && !_rapierUiAndroid()) {
    if (!tapped && await rapierConfirm({title: 'Update PDF import?', message: 'PDF import needs an update to work with this Rapier \u00b7 ' + _rapierPluginSize(waiting.bytes), confirmLabel: 'update', plain: true}) !== true) { showToast('PDF import waits for the update', 'info'); return false; }
    _rapierImportProgress(run, 'Updating PDF reader');
    await plugin.install({signal: run.controller.signal, onProgress: fraction => _rapierImportProgress(run, 'Updating PDF reader', fraction)});
  } else if (!here) {
    if (_rapierUiAndroid()) {
      const resources = globalThis.RapierPlatform?.resources;
      if (typeof resources?.ensure !== 'function') throw new Error('Google Play cannot bring the PDF reader on this device.');
      const sized = resources.installMessage?.('pdf', 'prompt') || "Google Play downloads Rapier's plug-ins pack once; they then all work offline.";
      if (!await rapierConfirm({title: 'PDF import plugin', message: sized + ' Your document stays on this device.', confirmLabel: 'download'})) return false;
      _rapierImportProgress(run, 'Downloading PDF reader');
      await resources.ensure('rapier-pdf');
      if (!await plugin.checkInstalled()) throw new Error('Google Play brought the plug-ins, but the PDF reader in them is not complete. Tap retry.');
    } else {
    const accepted = await rapierConfirm({title: 'PDF import plugin',
      message: '• ' + (plugin.downloadBytes / 1e6).toFixed(1) + ' MB PDF reader, once.\n• Works offline.\n• Your file stays here.',
      confirmLabel: 'download'});
    if (!accepted) return false;
    _rapierImportProgress(run, 'Downloading PDF reader');
    await plugin.install({signal: run.controller.signal, onProgress: fraction => _rapierImportProgress(run, 'Downloading PDF reader', fraction)});
    }
  }
  if (run.controller.signal.aborted) throw new DOMException('Import canceled', 'AbortError');
  await plugin.ensureLoaded();
  _rapierPdfSettingsRefresh();
  return true;
}

async function _rapierInstallPdfImportPlugin() {
  if (_rapierDocumentImport.active) { showToast('Another import is already running', 'info'); return false; }
  const run = {controller: new AbortController(), banner: null};
  _rapierDocumentImport.active = run;
  try {
    if (await _rapierEnsurePdfImportPlugin(run, true)) showToast(globalThis.RapierPdfPlugin.state().persistent
      ? 'PDF import plugin installed' : 'PDF import plugin ready for this session; offline storage is unavailable', 'success');
  } catch (error) {
    if (error.name !== 'AbortError') showToast('PDF import plugin: ' + String(error.message || error), 'error');
  } finally {
    run.controller.abort(); run.banner?.end();
    if (_rapierDocumentImport.active === run) _rapierDocumentImport.active = null;
    _rapierPdfSettingsRefresh();
  }
}

async function _rapierReadImportedDocument(file, name = file?.name || '') {
  const kind = _rapierImportKind(name, file?.type);
  if (!kind) throw new Error('Choose a DOCX, PDF or TextPack document.');
  if (!(file instanceof Blob) || !file.size || file.size > RapierImageArchive.ARCHIVE_LIMITS.bytes)
    throw new Error('Choose a document smaller than 25 MiB.');
  if (_rapierDocumentImport.active) throw new Error('Another document is still being imported.');
  const settled = await _rapierWithSettledExternalDocument(() => Object.freeze(_rapierMutationStamp()), {quiet: true});
  if (!settled.settled) throw new Error('Finish the current edit, then import the document again.');
  if (_rapierDocumentImport.active) throw new Error('Another document is still being imported.');
  const run = {stamp: settled.value, controller: new AbortController(), banner: null};
  _rapierDocumentImport.active = run;
  const checkCurrent = () => {
    if (run.controller.signal.aborted) throw new DOMException('Import canceled', 'AbortError');
    if (!_rapierMutationStampIsCurrent(run.stamp)) {
      run.controller.abort();
      throw new Error('The document changed; import the file again.');
    }
  };
  try {
    const words = kind === 'textpack' ? 'Importing TextPack' : kind === 'pdf' ? 'Importing PDF' : 'Importing Word';
    const onProgress = progress => _rapierImportProgress(run, words,
      typeof progress === 'number' ? progress : Number.isFinite(progress?.fraction) ? progress.fraction :
        progress?.pages > 0 ? (progress.page - 1) / progress.pages : null);
    const work = RapierImageArchive.createImportWork({signal: run.controller.signal, checkCurrent, onProgress});
    const textBytes = async text => {
      let bytes = 0;
      const encoder = new TextEncoder();
      for (let start = 0; start < text.length;) {
        await work.checkpoint();
        let end = Math.min(text.length, start + 65536);
        if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
        const part = text.slice(start, end);
        if (!RapierTextCodec.isDocumentFragment(part)) throw new Error('document is not plain UTF-8 text');
        bytes += encoder.encode(part).length;
        if (bytes > RapierTextCodec.maxDocumentBytes) throw new Error('document is too large for Rapier (max 64 MiB)');
        start = end;
      }
      work.check();
      return bytes;
    };
    if (kind === 'pdf') {
      const original = await globalThis.RapierPdf.readAttachedSource(file, {checkCurrent, signal: run.controller.signal});
      if (original) {
        checkCurrent();
        const text = original.canonical, admittedBytes = await textBytes(text);
        const filename = String(original.filename).replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'imported.md';
        return {text, filename, admittedBytes, importStamp: run.stamp, warnings: original.warnings,
          importSummary: 'PDF source restored'};
      }
    }
    if (kind === 'textpack') {
      _rapierImportProgress(run, 'Importing TextPack');
      const text = await _rapierReadTextPackDocument(file, {work, profile: RapierPreferences.read('imageStorage')});
      checkCurrent();
      const base = String(name).replace(/\.(textpack|zip)$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'imported';
      return {text, filename: base + '.md', admittedBytes: await textBytes(text),
        importStamp: run.stamp, importSummary: 'TextPack imported'};
    }
    const fields = kind === 'pdf' ? [{label: 'import as', type: 'select', value: 'text', options: [
      {value: 'text', label: 'Editable text'}, {value: 'pages', label: 'Page images'},
    ]}] : [];
    fields.push({label: 'Keep original image format', type: 'toggle', value: RapierPreferences.read('imageStorage') === 'original'});
    const values = await _rapierImportFields({title: 'import ' + kind.toUpperCase(),
      description: kind === 'pdf'
        ? 'Editable text reconstructs text and pictures; check the reading order. Page images preserve appearance. Pictures use JPEG XL unless the original format is kept.'
        : 'Create an editable copy with headings, lists, tables, alignment and pictures. Pictures use JPEG XL unless the original format is kept.',
      fields, okLabel: 'import'});
    if (!values) return null;
    checkCurrent();
    const profile = values[values.length - 1] ? 'original' : 'jxl';
    const mode = kind === 'pdf' ? values[0] : null;
    if (kind === 'pdf' && !await _rapierEnsurePdfImportPlugin(run)) return null;
    checkCurrent();
    const assets = new Map(), converted = new Map(), imageWarnings = new Set();
    let imageCount = 0, embeddedChars = 0;
    const embedImage = async image => {
      await work.checkpoint();
      const bytes = image.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image.bytes);
      if (!bytes.length || bytes.length > RapierImageAssets.IMAGE_LIMITS.bytes) throw new Error('Images must be smaller than 16 MiB.');
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      checkCurrent();
      const transform = _rapierCanonicalImportedTransform(image.transform);
      const key = RapierBundleIO.toBase64(new Uint8Array(digest)) + ':' + JSON.stringify(transform);
      if (!converted.has(key)) {
        ++imageCount;
        const isJxl = RapierImageAssets.isJxl(bytes), info = isJxl ? RapierImageAssets.inspectJPEGXL(bytes) : image.mime === 'image/svg+xml' ? null : RapierImageAssets.inspectRaster(bytes);
        const normalized = info ? await _rapierNormaliseRaster(null, profile, transform, {
          input: {bytes, isJxl, info, mime: isJxl ? 'image/jxl' : info.type}, signal: work.signal,
          progress: () => work.check(),
        }) : await _rapierNormaliseVector(null, {input: {bytes, info: RapierImageAssets.inspectSVG(bytes)}, signal: work.signal});
        await work.checkpoint();
        converted.set(key, {reference: normalized.asset.label, url: normalized.asset.url, width: normalized.width, height: normalized.height});
        if (!assets.has(normalized.asset.id)) {
          const {id, label, url, title} = normalized.asset;
          assets.set(id, {id, label, url, title});
          embeddedChars += normalized.asset.block.length;
        }
        if (embeddedChars > RapierImageArchive.ARCHIVE_LIMITS.bytes)
          throw new Error('The embedded pictures exceed the 25 MiB document limit.');
      }
      const normalized = converted.get(key);
      if (image.displayWidth > 0 && image.displayHeight > 0 &&
          Math.abs(normalized.width / normalized.height / (image.displayWidth / image.displayHeight) - 1) > .03)
        imageWarnings.add('Stretched pictures use their natural proportions in Markdown.');
      return kind === 'docx' ? {reference: normalized.reference, url: normalized.url} : normalized.reference;
    };
    _rapierImportProgress(run, words);
    const reader = kind === 'docx' ? globalThis.RapierDocxImport.readDocx : globalThis.RapierPdf.readPdf;
    const result = await reader(file, {name, mode, embedImage, checkCurrent, signal: work.signal, onProgress, work});
    await work.checkpoint();
    let text = result.canonical;
    if (typeof text !== 'string') {
      const inert = document.createElement('template');
      inert.innerHTML = result.html;
      const expectedImages = _rapierImportedImageSources(inert.content, assets, true);
      await work.checkpoint();
      if (kind === 'pdf') {
        const parts = [], chunk = document.createDocumentFragment();
        let characters = 0;
        for (const node of [...inert.content.childNodes]) {
          chunk.append(node); characters += node.textContent.length;
          if (characters < 16000) continue;
          parts.push(turndown.turndown(chunk).trim());
          chunk.replaceChildren(); characters = 0;
          await work.checkpoint();
        }
        if (chunk.childNodes.length) parts.push(turndown.turndown(chunk).trim());
        text = parts.filter(Boolean).join('\n\n');
      } else text = turndown.turndown(inert.content).trim();
      await work.checkpoint();
      text = (await _rapierAppendImportedImageAssets(text, assets.values(), work)).source;
      const actualImages = _rapierImportedMarkdownImageSources(text, assets);
      if (actualImages.length !== expectedImages.length || actualImages.some((src, index) => src !== expectedImages[index]))
        throw new Error('The pictures could not all be preserved in Markdown. The current document is unchanged.');
      text += text.endsWith('\n') ? '' : '\n';
      if (kind === 'docx') text = globalThis.RapierDocxImport.finishDocxMarkdown(text, result, {convertHtml: html => turndown.turndown(html)});
      if (kind === 'docx' && /^ {0,3}\[[^\]\n]+\]: data:image\/gif;/m.test(text)) text = (await _rapierDocumentObjects.materialize(text, {signal: work.signal})).source;
      if (!text.trim()) throw new Error(kind === 'pdf' ? 'This PDF has no editable text. Import it as page images.' : 'This document has no supported content.');
    }
    const admittedBytes = await textBytes(text);
    checkCurrent();
    const warnings = [...new Set([...(result.warnings || []).map(row => typeof row === 'string' ? row : row.message).filter(Boolean), ...imageWarnings])];
    const baseName = String(name).replace(/\.(docx|pdf)$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'imported';
    return {text, filename: baseName + '.md', admittedBytes, importStamp: run.stamp, pdfCopy: kind === 'pdf', imageStorage: imageCount ? profile : null, warnings,
      importSummary: kind.toUpperCase() + ' imported' + (imageCount ? ' · ' + imageCount + ' embedded picture' + (imageCount === 1 ? '' : 's') : '')};
  } catch (error) {
    error.rapierImport = true;
    throw error;
  } finally {
    run.controller.abort(); run.banner?.end();
    if (_rapierDocumentImport.active === run) _rapierDocumentImport.active = null;
    _rapierPdfSettingsRefresh();
  }
}

function _rapierAcceptDocumentImport(result) {
  if (result.imageStorage) RapierPreferences.write('imageStorage', result.imageStorage);
  const said = result.importSummary || 'Document imported', warnings = result.warnings || [];
  if (!warnings.length) { showToast(said, 'success'); return; }
  showToast(said + ' · ' + warnings.length + (warnings.length === 1 ? ' note' : ' notes') + ' on what the copy keeps', 'info',
    {label: 'SHOW', stay: true, fn: () => _rapierInfoSheetShow('import notes', warnings)});
}

async function _rapierOpenImportedFile(file, name = file?.name || '', options = {}) {
  try {
    const result = await _rapierReadImportedDocument(file, name);
    if (!result) return false;
    if (options.expectedMutationStamp && !_rapierMutationStampIsCurrent(options.expectedMutationStamp)) {
      showToast('The document changed; open the file again', 'info'); return false;
    }
    const bom = result.text.charCodeAt(0) === 0xFEFF;
    if (result.pdfCopy) {
      const initial = RapierLedger.exportLedger({text: '', records: [], revision: 0, complete: true,
        documentAuthority: _rapierCreateDocumentAuthority(), metadata: {filename: result.filename, docKind: 'markdown'}});
      const carriedLedger = RapierLedger.replaceLedgerText(initial, bom ? result.text.slice(1) : result.text,
        {actor: {kind: 'human', id: 'human'}, operation: 'document.import-pdf'});
      options = {...options, carriedLedger, documentAuthority: carriedLedger.documentAuthority};
    }
    const work = _rapierProgressTask({label: 'Opening document', after: 0, signal: options.signal});
    let opened;
    try {
      opened = await rapierOpenPlatformPayload({name: result.filename, text: bom ? result.text.slice(1) : result.text,
        admittedBytes: result.admittedBytes - (bom ? 3 : 0), bom, transient: true}, {...options, work, expectedMutationStamp: result.importStamp});
    } finally { work.end(); }
    if (opened) _rapierAcceptDocumentImport(result);
    return !!opened;
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Import failed: ' + String(error.message || error), 'error');
    return false;
  }
}
function _rapierImportedImageSources(root, assets, sourceTokens) {
  const sources = [];
  const visit = node => {
    if (sourceTokens && node.nodeType === 1 && node.hasAttribute('data-rapier-source')) {
      const source = _rapierRenderModule('render-markdown')._rapierSourceTokenValue(node);
      if (source !== null && /^(?:<table[ >]|<section class="footnotes">)/i.test(source)) {
        const fragment = document.createElement('template');
        fragment.innerHTML = source;
        for (const child of fragment.content.childNodes) visit(child);
        return;
      }
    }
    if (node.nodeName === 'IMG') {
      const label = node.getAttribute('data-rapier-asset');
      const url = label ? assets.get(RapierImageAssets.normalizeLabel(label))?.url : node.getAttribute('src');
      if (!RapierImageAssets.dataImage(url)) throw new Error('An imported picture is missing its embedded source.');
      sources.push(md.normalizeLink(url));
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
  return sources;
}

function _rapierImportedMarkdownImageSources(text, assets) {
  const sources = [];
  const visit = tokens => { for (const token of tokens) {
    if (token.type === 'image') sources.push(token.attrGet('src') || '');
    else if ((token.type === 'html_block' || token.type === 'html_inline') && /<img(?:\s|\/|>)/i.test(token.content)) {
      const fragment = document.createElement('template');
      fragment.innerHTML = token.content;
      sources.push(..._rapierImportedImageSources(fragment.content, assets, false));
    } else if (token.children) visit(token.children);
  }};
  visit(md.parse(text, {}));
  return sources;
}
