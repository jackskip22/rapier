// Host inputs for the shared MIT renderer; no rendering implementation lives here.
function _rapierRenderModule(kind) {
  switch (kind) {
    case 'render': return globalThis.RapierRender.createRenderer({
      dataImageDestinationsAsync: (source, work) => _rapierExportParse(source, {kind: 'destinations', work}),
      RAPIER_COLOR_CLOSE: typeof RAPIER_COLOR_CLOSE === 'undefined' ? undefined : RAPIER_COLOR_CLOSE,
      RapierLedgerCarried: typeof RapierLedgerCarried === 'undefined' ? undefined : RapierLedgerCarried,
      RapierPageReturnAddress: typeof RapierPageReturnAddress === 'undefined' ? undefined : RapierPageReturnAddress,
      RapierTextCodec: typeof RapierTextCodec === 'undefined' ? undefined : RapierTextCodec,
      _rapierArtifactHighlight: typeof _rapierArtifactHighlight === 'undefined' ? undefined : _rapierArtifactHighlight,
      _rapierArtifactPreference: typeof _rapierArtifactPreference === 'undefined' ? undefined : _rapierArtifactPreference,
      _rapierArtifactStyles: typeof _rapierArtifactStyles === 'undefined' ? undefined : _rapierArtifactStyles,
      _rapierBlobDataUrl: typeof _rapierBlobDataUrl === 'undefined' ? undefined : _rapierBlobDataUrl,
      _rapierBuildInterchangeContext: typeof _rapierBuildInterchangeContext === 'undefined' ? undefined : _rapierBuildInterchangeContext,
      _rapierDocumentNameIsAdmissible: typeof _rapierDocumentNameIsAdmissible === 'undefined' ? undefined : _rapierDocumentNameIsAdmissible,
      _rapierLedgerParts: typeof _rapierLedgerParts === 'undefined' ? undefined : _rapierLedgerParts,
      _rapierDrawReadSVGRecipe: typeof _rapierDrawReadSVGRecipe === 'undefined' ? undefined : _rapierDrawReadSVGRecipe,
      _rapierDrawShapeProfileFor: typeof _rapierDrawShapeProfileFor === 'undefined' ? undefined : _rapierDrawShapeProfileFor,
      _rapierExportFontCss: (root, options) => globalThis.RapierExportFonts.exportFontCss(root, {
        ...options,
        fontCss: _rapierStyleText('rapier-font-style') + (root.querySelector('svg[aria-roledescription="zenuml"]')
          ? (_rapierProviders?.mermaid?.exportFontCss?.() || '') : ''),
        subset: (bytes, characters) => globalThis.RapierFontSubsetPlugin.subset(bytes, characters),
      }),
      _rapierFillDiagram: typeof _rapierFillDiagram === 'undefined' ? undefined : _rapierFillDiagram,
      _rapierFinalizeExportCode: async root => {
        const codes = [...root.querySelectorAll('pre > code')].filter(code =>
          !code.parentElement?.classList.contains('diagram-source') &&
          _rapierCodeReading(_rapierLanguageClass(code) || 'text') === 'code' && _rapierHighlightAdmitted(code.textContent || ''));
        if (!codes.length || !RapierLexer.available(navigator) || !_rapierEnsureLexer()) return;
        for (const code of codes) {
          if (!RapierLexer.available(navigator)) break;
          const source = code.textContent || '';
          try {
            const answer = await RapierLexer.ask(window, source, _rapierLexerRefused);
            _rapierPaintCode(code, _rapierTokensHtml(source, answer.spans));
          } catch (_) { /* The editor keeps its CPU reading when this device refuses. */ }
        }
      },
      _rapierFormatColorOpen: typeof _rapierFormatColorOpen === 'undefined' ? undefined : _rapierFormatColorOpen,
      _rapierLanguageClass: typeof _rapierLanguageClass === 'undefined' ? undefined : _rapierLanguageClass,
      _rapierLineStartOffsets: typeof _rapierLineStartOffsets === 'undefined' ? undefined : _rapierLineStartOffsets,
      _rapierMarkdownEnvironment: typeof _rapierMarkdownEnvironment === 'undefined' ? undefined : _rapierMarkdownEnvironment,
      _rapierPortableHtml: typeof _rapierPortableHtml === 'undefined' ? undefined : _rapierPortableHtml,
      _rapierPrepareInterchangeContext: typeof _rapierPrepareInterchangeContext === 'undefined' ? undefined : _rapierPrepareInterchangeContext,
      _rapierProjectPortableRoot: typeof _rapierProjectPortableRoot === 'undefined' ? undefined : _rapierProjectPortableRoot,
      _rapierProjectPortableRootAsync: (...args) => _rapierRenderModule('render-markdown')._rapierProjectPortableRootAsync(...args),
      _rapierPortableHtmlAsync: (...args) => _rapierRenderModule('render-markdown')._rapierPortableHtmlAsync(...args),
      _rapierProviders: typeof _rapierProviders === 'undefined' ? undefined : _rapierProviders,
      _rapierSourceCharEscaped: typeof _rapierSourceCharEscaped === 'undefined' ? undefined : _rapierSourceCharEscaped,
      _rapierSourceLineSpan: typeof _rapierSourceLineSpan === 'undefined' ? undefined : _rapierSourceLineSpan,
      crypto: typeof crypto === 'undefined' ? undefined : crypto,
      document: typeof document === 'undefined' ? undefined : document,
      escapeRapierHtmlText: typeof escapeRapierHtmlText === 'undefined' ? undefined : escapeRapierHtmlText,
      globalThis: typeof globalThis === 'undefined' ? undefined : globalThis,
      md: typeof md === 'undefined' ? undefined : md,
      rapierConfirm: globalThis.__rapierServerRenderHost === true ? async () => false : (typeof rapierConfirm === 'undefined' ? undefined : rapierConfirm),
      sanitizeRapierHtml: typeof sanitizeRapierHtml === 'undefined' ? undefined : sanitizeRapierHtml
    });
    case 'render-styles': return globalThis.RapierRenderStyles.createRenderStyles({
      _rapierArtifactAccent: typeof _rapierArtifactAccent === 'undefined' ? undefined : _rapierArtifactAccent,
      _rapierStyleText: typeof _rapierStyleText === 'undefined' ? undefined : _rapierStyleText
    });
    case 'render-markdown': return globalThis.RapierRenderMarkdown.createMarkdownRenderer({
      Node: typeof Node === 'undefined' ? undefined : Node,
      parseAsync: typeof _rapierExportParse === 'undefined' ? undefined : _rapierExportParse,
      prefixAnchorsSteps: (...args) => _rapierRenderModule('render')._rapierPrefixPortableAnchorsSteps(...args),
      _rapierPrefixPortableAnchors: typeof _rapierPrefixPortableAnchors === 'undefined' ? undefined : _rapierPrefixPortableAnchors,
      RAPIER_HIGHLIGHT_COLOR_BY_MARKER: typeof RAPIER_HIGHLIGHT_COLOR_BY_MARKER === 'undefined' ? undefined : RAPIER_HIGHLIGHT_COLOR_BY_MARKER,
      RAPIER_MARKDOWN_SPEC: typeof RAPIER_MARKDOWN_SPEC === 'undefined' ? undefined : RAPIER_MARKDOWN_SPEC,
      RAPIER_RENDERED_HEADING_SELECTOR: typeof RAPIER_RENDERED_HEADING_SELECTOR === 'undefined' ? undefined : RAPIER_RENDERED_HEADING_SELECTOR,
      _rapierApplyMarkdownSpec: typeof _rapierApplyMarkdownSpec === 'undefined' ? undefined : _rapierApplyMarkdownSpec,
      _rapierChromeOwnsId: typeof _rapierChromeOwnsId === 'undefined' ? undefined : _rapierChromeOwnsId,
      _rapierCodeHtml: typeof _rapierCodeHtml === 'undefined' ? undefined : _rapierCodeHtml,
      _rapierDeriveDarkColor: typeof _rapierDeriveDarkColor === 'undefined' ? undefined : _rapierDeriveDarkColor,
      _rapierDormantHeadings: typeof _rapierDormantHeadings === 'undefined' ? undefined : _rapierDormantHeadings,
      _rapierEmbedAssetSource: typeof _rapierEmbedAssetSource === 'undefined' ? undefined : _rapierEmbedAssetSource,
      _rapierHeadingSlugBase: typeof _rapierHeadingSlugBase === 'undefined' ? undefined : _rapierHeadingSlugBase,
      _rapierNextHeadingSlug: typeof _rapierNextHeadingSlug === 'undefined' ? undefined : _rapierNextHeadingSlug,
      _rapierHighlightAdmitted: typeof _rapierHighlightAdmitted === 'undefined' ? undefined : _rapierHighlightAdmitted,
      _rapierInstallMarkdownMath: typeof _rapierInstallMarkdownMath === 'undefined' ? undefined : _rapierInstallMarkdownMath,
      _rapierMarkdownPreview: typeof _rapierMarkdownPreview === 'undefined' ? undefined : _rapierMarkdownPreview,
      _rapierPlainLayout: typeof _rapierPlainLayout === 'undefined' ? undefined : _rapierPlainLayout,
      _rapierProviders: typeof _rapierProviders === 'undefined' ? undefined : _rapierProviders,
      _rapierRemoteContent: typeof _rapierRemoteContent === 'undefined' ? undefined : _rapierRemoteContent,
      _rapierRemoteImagePlaceholder: typeof _rapierRemoteImagePlaceholder === 'undefined' ? undefined : _rapierRemoteImagePlaceholder,
      _rapierRemoteSubresourceOrigin: typeof _rapierRemoteSubresourceOrigin === 'undefined' ? undefined : _rapierRemoteSubresourceOrigin,
      _rapierRenderedAnchorOriginalIds: typeof _rapierRenderedAnchorOriginalIds === 'undefined' ? undefined : _rapierRenderedAnchorOriginalIds,
      _rapierSourceCharEscaped: typeof _rapierSourceCharEscaped === 'undefined' ? undefined : _rapierSourceCharEscaped,
      _rapierSplitOpeningFrontmatter: typeof _rapierSplitOpeningFrontmatter === 'undefined' ? undefined : _rapierSplitOpeningFrontmatter,
      _rapierUiDiagram: typeof _rapierUiDiagram === 'undefined' ? undefined : _rapierUiDiagram,
      _rapierUiMath: typeof _rapierUiMath === 'undefined' ? undefined : _rapierUiMath,
      document: typeof document === 'undefined' ? undefined : document,
      escapeRapierHtmlText: typeof escapeRapierHtmlText === 'undefined' ? undefined : escapeRapierHtmlText,
      globalThis: typeof globalThis === 'undefined' ? undefined : globalThis,
      md: typeof md === 'undefined' ? undefined : md,
      sanitizeRapierHtml: typeof sanitizeRapierHtml === 'undefined' ? undefined : sanitizeRapierHtml,
      window: typeof window === 'undefined' ? undefined : window
    });
    case 'render-sanitize': return globalThis.RapierRenderSanitizer.createRenderSanitizer({
      CSSStyleSheet: typeof CSSStyleSheet === 'undefined' ? undefined : CSSStyleSheet,
      DOMPurify: typeof DOMPurify === 'undefined' ? undefined : DOMPurify,
      RAPIER_RASTER_DATA_URL_RE: typeof RAPIER_RASTER_DATA_URL_RE === 'undefined' ? undefined : RAPIER_RASTER_DATA_URL_RE,
      RAPIER_SANITIZE_FORBID_ATTR: typeof RAPIER_SANITIZE_FORBID_ATTR === 'undefined' ? undefined : RAPIER_SANITIZE_FORBID_ATTR,
      RAPIER_SANITIZE_FORBID_TAGS: typeof RAPIER_SANITIZE_FORBID_TAGS === 'undefined' ? undefined : RAPIER_SANITIZE_FORBID_TAGS,
      URL: typeof URL === 'undefined' ? undefined : URL,
      _rapierCssDeclaration: typeof _rapierCssDeclaration === 'undefined' ? undefined : _rapierCssDeclaration,
      _rapierDropRemoteDeclarations: typeof _rapierDropRemoteDeclarations === 'undefined' ? undefined : _rapierDropRemoteDeclarations,
      _rapierRemoteContent: typeof _rapierRemoteContent === 'undefined' ? undefined : _rapierRemoteContent,
      _rapierRuleDescriptorIsRemote: typeof _rapierRuleDescriptorIsRemote === 'undefined' ? undefined : _rapierRuleDescriptorIsRemote,
      _rapierSanitizeRuntime: typeof _rapierSanitizeRuntime === 'undefined' ? undefined : _rapierSanitizeRuntime,
      document: typeof document === 'undefined' ? undefined : document,
      globalThis: typeof globalThis === 'undefined' ? undefined : globalThis,
      location: typeof location === 'undefined' ? undefined : location
    });
    case 'render-print': return globalThis.RapierRenderPrint.createPrintRenderer({
      Node: typeof Node === 'undefined' ? undefined : Node,
      _rapierWillParse: typeof _rapierWillParse === 'undefined' ? undefined : _rapierWillParse,
      crypto: typeof crypto === 'undefined' ? undefined : crypto,
      document: typeof document === 'undefined' ? undefined : document,
      globalThis: typeof globalThis === 'undefined' ? undefined : globalThis
    });
    default: throw new Error('Unknown render owner');
  }
}

async function _rapierExportParse(source, options = {}) {
  const work = options.work || options;
  if (work.signal?.aborted) throw Object.assign(new Error('The operation was cancelled.'), {name: 'AbortError', code: 'cancelled'});
  const body = _rapierParseRuntime.markdownSource + '\n' + globalThis.RapierExportWorker.workerSource();
  const url = URL.createObjectURL(new Blob([body], {type: 'text/javascript'}));
  let worker;
  try { worker = new Worker(url, {name: 'rapier-export'}); }
  finally { URL.revokeObjectURL(url); }
  const tokens = [], text = [], prototype = new md.core.State('', md, {}).Token.prototype;
  let env = {};
  return new Promise((resolve, reject) => {
    const finish = (value, error) => {
      worker.terminate(); work.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(null, Object.assign(new Error('The operation was cancelled.'), {name: 'AbortError', code: 'cancelled'}));
    const restore = token => { Object.setPrototypeOf(token, prototype); for (const child of token.children || []) restore(child); };
    work.signal?.addEventListener('abort', abort, {once: true});
    worker.onerror = event => finish(null, new Error(event.message || 'The document parser could not start.'));
    worker.onmessageerror = () => finish(null, new Error('The document parser returned invalid data.'));
    worker.onmessage = async event => {
      try {
        if (work.signal?.aborted) return abort();
        const data = event.data;
        if (data.error) return finish(null, new Error(data.error));
        if (data.progress != null) { work.onProgress?.(.05 + data.progress * .1); return; }
        if (data.result) return finish(data.result);
        if (data.done) return finish(data.value ? text.join('') : {tokens, env});
        if (data.value) { worker.postMessage({next: true}); return; }
        if (data.fraction != null && !data.tokens && data.text === undefined) { work.onProgress?.(data.fraction); return; }
        if (data.env) { env = data.env; worker.postMessage({next: true}); return; }
        for (const token of data.tokens || []) { restore(token); tokens.push(token); }
        if (data.text !== undefined) text.push(data.text);
        work.onProgress?.(data.text !== undefined ? .7 + data.fraction * .25 : .15 + data.fraction * .15);
        if (work.yield) await work.yield();
        else await new Promise(done => setTimeout(done, 0));
        if (work.signal?.aborted) return abort();
        worker.postMessage({next: true});
      } catch (error) { finish(null, error); }
    };
    void (async () => {
      worker.postMessage({operation: 'begin', kind: options.kind, page: options.page === true});
      let began = performance.now();
      for (let at = 0; at < source.length; at += 65536) {
        if (work.signal?.aborted) return abort();
        worker.postMessage({operation: 'part', text: source.slice(at, at + 65536)});
        if (performance.now() - began >= 8) {
          work.onProgress?.(.03 * Math.min(1, (at + 65536) / source.length));
          if (work.yield) await work.yield(); else await new Promise(done => setTimeout(done, 0));
          began = performance.now();
        }
      }
      if (work.signal?.aborted) return abort();
      worker.postMessage({operation: 'finish'});
    })().catch(error => finish(null, error));
  });
}


// An opt-in read-only host. The server sets this before loading the generated page in its
// isolated, network-denied browser. No source is put into the editor, saved, or admitted as
// a human action: every writer receives the immutable capture it was asked to export.
let _rapierServerReadyPromise;
async function _rapierServerRenderReady() {
  if (!_rapierServerReadyPromise) _rapierServerReadyPromise = (async () => {
    if (!await _rapierRuntimeReady || !await _rapierVendorsReady())
      throw new Error('The retained render libraries could not start');
    const manifest = document.getElementById('rapier-server-plugins');
    if (!manifest) throw new Error('The server render resources are missing');
    const groups = JSON.parse(manifest.textContent), resources = new Map();
    for (const group of groups) {
      const spans = await _rapierInflateVendor(group.element);
      if (spans.length !== group.files.length) throw new Error('The server render resources are incomplete');
      group.files.forEach((file, index) => {
        if (spans[index].name !== file.name || spans[index].bytes.byteLength !== file.bytes || resources.has(file.id))
          throw new Error('The server render resource is invalid: ' + file.id);
        resources.set(file.id, spans[index].bytes);
      });
    }
    const read = async id => {
      const bytes = resources.get(id);
      if (!bytes) throw new Error('The server does not carry this render resource: ' + id);
      return bytes.slice();
    };
    // The ordinary plug-in installer verifies each retained file against its SHA-384 pin.
    _rapierPlatformPortRuntime.port = {...window.RapierPlatform, resources: Object.freeze({
      status: async id => ({status: resources.has(id) ? 'ready' : 'absent'}), read, ensure: read,
    })};
  })();
  return _rapierServerReadyPromise;
}
async function _rapierServerRenderDocument({source, filename = 'document.md', format = 'html'}) {
  if (typeof source !== 'string' || !_rapierDocumentNameIsAdmissible(filename))
    throw new TypeError('A document source and admissible filename are required');
  await _rapierServerRenderReady();
  const canonical = RapierTextCodec.normalizeDocument(source);
  const captured = {canonical, metadata: {filename, docKind: 'markdown', bom: source.charCodeAt(0) === 0xfeff}, plain: false};
  if (format === 'html') return _rapierRenderModule('render').render(source, {filename});
  if (format === 'semantic') return {html: _rapierRenderSemanticRoot(canonical, captured.metadata).innerHTML};
  if (format === 'pdf') {
    const artifact = await _rapierBuildPrintArtifact(captured);
    return {html: artifact.html, filename: artifact.filename};
  }
  if (format === 'docx') {
    const context = await _rapierPrepareInterchangeContext({format: 'docx'}, captured);
    await _rapierRenderModule('render')._rapierRequireOfflinePageImages(context.semanticRoot);
    const prepared = await _rapierBuildDocxHtml(context);
    const blob = await _rapierConvertPortableHtmlToDocx(prepared);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return {base64: btoa(binary), filename: context.baseName + '.docx'};
  }
  throw new TypeError('Unknown document export format');
}
async function _rapierServerReadWord(base64) {
  await _rapierServerRenderReady();
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  let index = 0; const pictures = new Map();
  const result = await globalThis.RapierDocxImport.readDocx(new Blob([bytes]), {embedImage: async image => {
    const reference = 'server-word-' + (++index);
    const url = await _rapierBlobDataUrl(new Blob([image.bytes], {type: image.type}));
    pictures.set(reference, url);
    return {reference, url};
  }});
  if (result.error) throw new Error(result.error);
  let markdown = result.canonical;
  if (typeof markdown !== 'string') {
    markdown = turndown.turndown(result.html).trim();
    for (const [reference, url] of pictures) markdown += '\n\n[' + reference + ']: ' + url;
    markdown = globalThis.RapierDocxImport.finishDocxMarkdown(markdown + '\n', result, {convertHtml: html => turndown.turndown(html)});
  }
  return {...result, markdown};
}
if (globalThis.__rapierServerRenderHost === true) {
  Object.defineProperty(globalThis, 'RapierServerRenderer', {value: Object.freeze({render: _rapierServerRenderDocument, readWord: _rapierServerReadWord})});
}
