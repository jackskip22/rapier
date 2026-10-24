// SPDX-License-Identifier: AGPL-3.0-only

let md;
const _rapierProviders = Object.seal({math: null, mermaid: null, 'mermaid-zenuml': null, flowchart: null, pdf: null, docx: null, ocr: null});
const _rapierEmbedAssetSource = () => false;
const _rapierDormantHeadings = (root, selector, includeLive) => includeLive ? Array.from(root.querySelectorAll(selector)) : [];

const READER_DOCUMENT_MAX_BYTES = 64 * 1024 * 1024;

function readerDocumentText(value) {
	const text = String(value == null ? '' : value);
	if (new TextEncoder().encode(text).byteLength > READER_DOCUMENT_MAX_BYTES) throw new Error('document is too large for Rapier (max 64 MiB)');
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code === 0) throw new Error('document is not plain UTF-8 text');
		if (code >= 0xD800 && code <= 0xDFFF) {
			if (code >= 0xDC00 || !(text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF)) throw new Error('document is not plain UTF-8 text');
			i++;
		}
	}
	return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function _rapierPlainLayout() { return readerPreference('layout') === 'plain'; }

function readerParser() {
	if (md) return md;
	const markdownRender = _rapierRenderModule('render-markdown');
	_rapierRenderModule('render-sanitize')._rapierInstallDocumentSanitizeHooks();
	markdownRender.initMarkdownIt();
	globalThis.RapierHtmlBlocks.mountHtmlBlocks(document, {identity: () => reader.generation, source: () => reader.source,
		imageInfo: url => {const {bytes, codec} = RapierImageAssets.decodeDataImageBytes(url); return {...(codec === 'image/jxl' ? RapierImageAssets.inspectJPEGXL(bytes) : {}), ...RapierImageAssets.imageDimensions(bytes, codec)};}});
	md = markdownRender.parser();
	return md;
}

const _rapierRenderedAnchorOriginalIds = _rapierReadProjectionRuntime.anchorOriginalIds;

function _rapierFillDiagram(host, detached = false) {
	const generation = reader.generation, render = reader.render;
	if (!_rapierDrawingRenderStateIsCurrent(_rapierReadProjectionRuntime.renderState))
		_rapierReadProjectionRuntime.renderState = _rapierDrawingRenderState();
	return _rapierDrawDiagram(host, {
		detached, renderState: _rapierReadProjectionRuntime.renderState,
		isCurrent: () => reader.generation === generation && reader.render === render,
		stateCurrent: _rapierDrawingRenderStateIsCurrent,
		retry: () => _rapierFillDiagram(host, detached),
	});
}
