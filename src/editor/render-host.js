// Host inputs for the shared MIT renderer; no rendering implementation lives here.
function _rapierRenderModule(kind) {
  switch (kind) {
    case 'render': return globalThis.RapierRender.createRenderer({
      RAPIER_COLOR_CLOSE: typeof RAPIER_COLOR_CLOSE === 'undefined' ? undefined : RAPIER_COLOR_CLOSE,
      RapierLedgerCarried: typeof RapierLedgerCarried === 'undefined' ? undefined : RapierLedgerCarried,
      RapierPageReturnAddress: typeof RapierPageReturnAddress === 'undefined' ? undefined : RapierPageReturnAddress,
      RapierTextCodec: typeof RapierTextCodec === 'undefined' ? undefined : RapierTextCodec,
      _rapierArtifactHighlight: typeof _rapierArtifactHighlight === 'undefined' ? undefined : _rapierArtifactHighlight,
      _rapierArtifactLexerScript: typeof _rapierArtifactLexerScript === 'undefined' ? undefined : _rapierArtifactLexerScript,
      _rapierArtifactMarkLexed: typeof _rapierArtifactMarkLexed === 'undefined' ? undefined : _rapierArtifactMarkLexed,
      _rapierArtifactPreference: typeof _rapierArtifactPreference === 'undefined' ? undefined : _rapierArtifactPreference,
      _rapierArtifactStyles: typeof _rapierArtifactStyles === 'undefined' ? undefined : _rapierArtifactStyles,
      _rapierBlobDataUrl: typeof _rapierBlobDataUrl === 'undefined' ? undefined : _rapierBlobDataUrl,
      _rapierBuildInterchangeContext: typeof _rapierBuildInterchangeContext === 'undefined' ? undefined : _rapierBuildInterchangeContext,
      _rapierDocumentNameIsAdmissible: typeof _rapierDocumentNameIsAdmissible === 'undefined' ? undefined : _rapierDocumentNameIsAdmissible,
      _rapierLedgerParts: typeof _rapierLedgerParts === 'undefined' ? undefined : _rapierLedgerParts,
      _rapierDrawReadSVGRecipe: typeof _rapierDrawReadSVGRecipe === 'undefined' ? undefined : _rapierDrawReadSVGRecipe,
      _rapierDrawShapeProfileFor: typeof _rapierDrawShapeProfileFor === 'undefined' ? undefined : _rapierDrawShapeProfileFor,
      _rapierFillDiagram: typeof _rapierFillDiagram === 'undefined' ? undefined : _rapierFillDiagram,
      _rapierFormatColorOpen: typeof _rapierFormatColorOpen === 'undefined' ? undefined : _rapierFormatColorOpen,
      _rapierLanguageClass: typeof _rapierLanguageClass === 'undefined' ? undefined : _rapierLanguageClass,
      _rapierLineStartOffsets: typeof _rapierLineStartOffsets === 'undefined' ? undefined : _rapierLineStartOffsets,
      _rapierMarkdownEnvironment: typeof _rapierMarkdownEnvironment === 'undefined' ? undefined : _rapierMarkdownEnvironment,
      _rapierPortableHtml: typeof _rapierPortableHtml === 'undefined' ? undefined : _rapierPortableHtml,
      _rapierPrepareInterchangeContext: typeof _rapierPrepareInterchangeContext === 'undefined' ? undefined : _rapierPrepareInterchangeContext,
      _rapierProjectPortableRoot: typeof _rapierProjectPortableRoot === 'undefined' ? undefined : _rapierProjectPortableRoot,
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
      RAPIER_HIGHLIGHT_COLOR_BY_MARKER: typeof RAPIER_HIGHLIGHT_COLOR_BY_MARKER === 'undefined' ? undefined : RAPIER_HIGHLIGHT_COLOR_BY_MARKER,
      RAPIER_MARKDOWN_SPEC: typeof RAPIER_MARKDOWN_SPEC === 'undefined' ? undefined : RAPIER_MARKDOWN_SPEC,
      RAPIER_RENDERED_HEADING_SELECTOR: typeof RAPIER_RENDERED_HEADING_SELECTOR === 'undefined' ? undefined : RAPIER_RENDERED_HEADING_SELECTOR,
      _rapierApplyMarkdownSpec: typeof _rapierApplyMarkdownSpec === 'undefined' ? undefined : _rapierApplyMarkdownSpec,
      _rapierBidiStrong: typeof _rapierBidiStrong === 'undefined' ? undefined : _rapierBidiStrong,
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
      _rapierVerifyRasterBytes: typeof _rapierVerifyRasterBytes === 'undefined' ? undefined : _rapierVerifyRasterBytes,
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


// An opt-in read-only host. The server sets this before loading the generated page in its
// isolated, network-denied browser. No source is put into the editor, saved, or admitted as
// a human action: every writer receives the immutable capture it was asked to export.
let _rapierServerReadyPromise;
async function _rapierServerRenderReady() {
  if (!_rapierServerReadyPromise) _rapierServerReadyPromise = (async () => {
    if (!await _rapierRuntimeReady || !await _rapierVendorsReady())
      throw new Error('The retained render libraries could not start');
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
  let index = 0;
  const result = await globalThis.RapierDocxImport.readDocx(new Blob([bytes]), {embedImage: async image => {
    const reference = 'server-word-' + (++index);
    const url = await _rapierBlobDataUrl(new Blob([image.bytes], {type: image.type}));
    return {reference, url};
  }});
  if (result.error) throw new Error(result.error);
  return result;
}
if (globalThis.__rapierServerRenderHost === true) {
  Object.defineProperty(globalThis, 'RapierServerRenderer', {value: Object.freeze({render: _rapierServerRenderDocument, readWord: _rapierServerReadWord})});
}
