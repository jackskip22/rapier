/* Import prepares one complete Markdown copy before the existing open transaction. */
const _rapierDocumentImport = {active: null};

function _rapierImportKind(name, mime = '') {
  mime = String(mime).toLowerCase().split(';')[0].trim();
  if (/\.docx$/i.test(String(name)) || mime === RAPIER_DOCX_MIME) return 'docx';
  if (/\.pdf$/i.test(String(name)) || mime === 'application/pdf') return 'pdf';
  if (/\.(textpack|zip)$/i.test(String(name)) || ['application/zip', 'application/x-zip-compressed'].includes(mime)) return 'textpack';
  return null;
}

function _rapierImportFields(options) {
  return new Promise(resolve => _openFieldDialog({...options, onOk: resolve, onCancel: () => resolve(null)}));
}

function _rapierImportProgress(run, message) {
  if (_rapierDocumentImport.active !== run || run.controller.signal.aborted) return;
  if (!run.banner) {
    const banner = document.createElement('div');
    banner.className = 'rapier-import-progress';
    banner.setAttribute('role', 'status');
    const label = document.createElement('span');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'cancel';
    cancel.addEventListener('click', () => {
      run.controller.abort();
      banner.remove();
    });
    banner.append(label, cancel);
    document.body.append(banner);
    run.banner = banner;
  }
  run.banner.firstChild.textContent = String(message || 'Importing document…');
}

function _rapierPdfSettingsRefresh() {
  const button = document.getElementById('pdf-plugin-action');
  const status = document.getElementById('pdf-plugin-installed');
  if (!button || !status) return;
  const state = globalThis.RapierPdfPlugin?.state();
  button.hidden = !!state?.installed;
  button.disabled = !!state?.downloading;
  button.textContent = state?.downloading ? 'DOWNLOADING PDF IMPORT PLUGIN…' : 'INSTALL PDF IMPORT PLUGIN';
  status.hidden = !state?.installed;
  status.textContent = state?.persistent ? 'PDF IMPORT PLUGIN INSTALLED' : 'PDF IMPORT PLUGIN READY THIS SESSION';
}

async function _rapierEnsurePdfImportPlugin(run) {
  const plugin = globalThis.RapierPdfPlugin;
  if (!plugin) throw new Error('The PDF import plugin is unavailable.');
  if (!await plugin.checkInstalled()) {
    // Android has no INTERNET (docs/intent.md): reaching here means the offline path failed; say so, never open a download that must fail.
    if (_rapierUiAndroid()) {
      throw new Error('Page images and text both need the PDF reader plugin, and this app ' +
        'cannot download it on Android (no internet access). This PDF needs on-device text ' +
        'import instead: Android 15, or Android 12–14 with the latest system update.');
    }
    const accepted = await rapierConfirm({title: 'PDF import plugin',
      message: 'Download the ' + (plugin.downloadBytes / 1e6).toFixed(2) + ' MB PDF reader from jsDelivr? It is checked before use and saved for offline imports when storage is available. Your document stays on this device.',
      confirmLabel: 'download'});
    if (!accepted) return false;
    _rapierImportProgress(run, 'Downloading PDF import plugin…');
    await plugin.install({signal: run.controller.signal, onProgress: message => _rapierImportProgress(run, message)});
  }
  if (run.controller.signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
  await plugin.ensureLoaded();
  _rapierPdfSettingsRefresh();
  return true;
}

async function _rapierInstallPdfImportPlugin() {
  if (_rapierDocumentImport.active) { showToast('Another import is already running', 'info'); return false; }
  const run = {controller: new AbortController(), banner: null};
  _rapierDocumentImport.active = run;
  try {
    if (await _rapierEnsurePdfImportPlugin(run)) showToast(globalThis.RapierPdfPlugin.state().persistent
      ? 'PDF import plugin installed' : 'PDF import plugin ready for this session; offline storage is unavailable', 'success');
  } catch (error) {
    if (error.name !== 'AbortError') showToast('PDF import plugin: ' + String(error.message || error), 'error');
  } finally {
    run.controller.abort(); run.banner?.remove();
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
    if (run.controller.signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
    if (!_rapierMutationStampIsCurrent(run.stamp)) throw new Error('The document changed; import the file again.');
  };
  try {
    if (kind === 'textpack') {
      _rapierImportProgress(run, 'Reading TextPack…');
      const text = await _rapierReadTextPackDocument(file, {checkCurrent, profile: RapierPreferences.read('imageStorage')});
      checkCurrent();
      const base = String(name).replace(/\.(textpack|zip)$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'imported';
      return {text, filename: base + '.md', admittedBytes: new TextEncoder().encode(text).length,
        importStamp: run.stamp, importSummary: 'TextPack imported'};
    }
    const fields = kind === 'pdf' ? [{label: 'import as', type: 'select', value: 'text', options: [
      {value: 'text', label: 'Editable text'}, {value: 'pages', label: 'Page images'},
    ]}] : [];
    fields.push({label: 'Keep original image format', type: 'toggle', value: RapierPreferences.read('imageStorage') === 'original'});
    const values = await _rapierImportFields({title: 'import ' + kind.toUpperCase(),
      description: kind === 'pdf'
        ? 'Editable text leaves pictures out. Page images preserve appearance. Pictures use JPEG XL unless the original format is kept.'
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
      checkCurrent();
      const bytes = image.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image.bytes);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      checkCurrent();
      const transform = _rapierCanonicalImportedTransform(image.transform);
      const key = RapierBundleIO.toBase64(new Uint8Array(digest)) + ':' + JSON.stringify(transform);
      if (!converted.has(key)) {
        _rapierImportProgress(run, 'Embedding picture ' + (++imageCount) + '…');
        const normalized = await _rapierNormaliseRaster(new File([bytes], image.name || 'picture.png'), profile, transform);
        checkCurrent();
        converted.set(key, {reference: normalized.asset.label, url: normalized.asset.url, width: normalized.width, height: normalized.height});
        if (!assets.has(normalized.asset.id)) {
          assets.set(normalized.asset.id, normalized.asset);
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
    _rapierImportProgress(run, 'Reading ' + kind.toUpperCase() + '…');
    const reader = kind === 'docx' ? globalThis.RapierDocxImport.readDocx : globalThis.RapierPdf.readPdf;
    const result = await reader(file, {mode, embedImage, checkCurrent, signal: run.controller.signal,
      onProgress: progress => _rapierImportProgress(run, typeof progress === 'string' ? progress :
        'Reading page ' + progress.page + (progress.pages ? ' of ' + progress.pages : '') + '…')});
    checkCurrent();
    // Flow images carry labels; ordinary HTML tables carry their converted data URLs.
    const inert = document.createElement('template');
    inert.innerHTML = result.html;
    const expectedImages = _rapierImportedImageSources(inert.content, assets, true);
    let text = turndown.turndown(inert.content).trim();
    if (!text) throw new Error(kind === 'pdf' ? 'This PDF has no editable text. Import it as page images.' : 'This document has no supported content.');
    for (const asset of assets.values()) {
      checkCurrent();
      text = (await RapierImageAssets.appendAsset(text, asset)).source;
    }
    const actualImages = _rapierImportedMarkdownImageSources(text, assets);
    if (actualImages.length !== expectedImages.length || actualImages.some((src, index) => src !== expectedImages[index]))
      throw new Error('The pictures could not all be preserved in Markdown. The current document is unchanged.');
    text += text.endsWith('\n') ? '' : '\n';
    const admittedBytes = new TextEncoder().encode(text).length;
    RapierTextCodec.normalizeDocument(text, admittedBytes);
    checkCurrent();
    const warnings = [...new Set([...(result.warnings || []).map(row => typeof row === 'string' ? row : row.message).filter(Boolean), ...imageWarnings])];
    if (warnings.length) {
      run.banner?.remove(); run.banner = null;
      const accepted = await rapierConfirm({title: 'Import notes',
        message: warnings.slice(0, 8).join('\n\n') + (warnings.length > 8 ? '\n\nOther document-specific formatting also uses normal Markdown flow.' : ''),
        confirmLabel: 'open Markdown'});
      if (!accepted) return null;
      checkCurrent();
    }
    const baseName = String(name).replace(/\.(docx|pdf)$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'imported';
    return {text, filename: baseName + '.md', admittedBytes, importStamp: run.stamp, imageStorage: imageCount ? profile : null,
      importSummary: kind.toUpperCase() + ' imported' + (imageCount ? ' · ' + imageCount + ' embedded picture' + (imageCount === 1 ? '' : 's') : '')};
  } catch (error) {
    error.rapierImport = true;
    throw error;
  } finally {
    run.controller.abort(); run.banner?.remove();
    if (_rapierDocumentImport.active === run) _rapierDocumentImport.active = null;
    _rapierPdfSettingsRefresh();
  }
}

function _rapierAcceptDocumentImport(result) {
  if (result.imageStorage) RapierPreferences.write('imageStorage', result.imageStorage);
  showToast(result.importSummary || 'Document imported', 'success');
}

async function _rapierOpenImportedFile(file, name = file?.name || '', options = {}) {
  try {
    const result = await _rapierReadImportedDocument(file, name);
    if (!result) return false;
    if (options.expectedMutationStamp && !_rapierMutationStampIsCurrent(options.expectedMutationStamp)) {
      showToast('The document changed; open the file again', 'info'); return false;
    }
    const opened = await rapierOpenPlatformPayload({name: result.filename, text: result.text,
      admittedBytes: result.admittedBytes, transient: true}, {...options, expectedMutationStamp: result.importStamp});
    if (opened) _rapierAcceptDocumentImport(result);
    return !!opened;
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Import failed: ' + String(error.message || error), 'error');
    return false;
  }
}
// Reader source tokens are inert transport, not permission to skip image custody. Complex
// tables carry ordinary HTML; inspect their verified source and the Markdown HTML tokens too.
function _rapierImportedImageSources(root, assets, sourceTokens) {
  const sources = [];
  const visit = node => {
    if (sourceTokens && node.nodeType === 1 && node.hasAttribute('data-rapier-source')) {
      const source = _rapierSourceTokenValue(node);
      if (source !== null && /^<table[ >]/i.test(source)) {
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
