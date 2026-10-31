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
	if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.addHook === 'function') DOMPurify.addHook('uponSanitizeElement', readerNoteRemoteMedia);
	markdownRender.initMarkdownIt();
	globalThis.RapierHtmlBlocks.mountHtmlBlocks(document, {identity: () => reader.generation, source: () => reader.source,
		imageInfo: url => {const {bytes, codec} = RapierImageAssets.decodeDataImageBytes(url); return {...(codec === 'image/jxl' ? RapierImageAssets.inspectJPEGXL(bytes) : {}), ...RapierImageAssets.imageDimensions(bytes, codec)};}});
	md = markdownRender.parser();
	readerFootnoteRules(md);
	return md;
}

function readerFirstRemoteMediaUrl(node) {
	const originOf = _rapierRenderModule('render-sanitize')._rapierRemoteSubresourceOrigin;
	const consider = value => {
		const raw = String(value || '').replace(/[\u0009\u000a\u000d]+/g, '').trim();
		return raw && originOf(raw) ? raw : '';
	};
	const fromSrcset = value => {
		for (const part of String(value || '').split(',')) {
			const found = consider(part.trim().split(/\s+/)[0]);
			if (found) return found;
		}
		return '';
	};
	const elements = [node, ...node.querySelectorAll('source,track,img,video,audio')];
	for (const element of elements) {
		for (const name of ['src', 'poster']) {
			const found = consider(element.getAttribute?.(name));
			if (found) return found;
		}
		const set = fromSrcset(element.getAttribute?.('srcset'));
		if (set) return set;
	}
	return '';
}

function readerNoteRemoteMedia(node) {
	if (_rapierRemoteContent.allowed || !node || node.nodeType !== 1) return;
	if (node.nodeName !== 'VIDEO' && node.nodeName !== 'AUDIO') return;
	const url = readerFirstRemoteMediaUrl(node);
	if (!url) return;
	node._rapierHeldBack = true;
	node.setAttribute('data-rapier-remote-src', url);
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
