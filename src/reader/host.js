// SPDX-License-Identifier: AGPL-3.0-only
// What the shared renderer asks of its host, answered for a reader: no editor state, and nothing stored but the person's view
// settings. The renderer's factories (kit/render*.mjs) take every dependency by name; tools/reader-build.mjs cuts each factory to
// what the reader calls and writes `_rapierRenderModule` from the names that remain, so a port is never listed twice by hand.
// Classic script fragment: it shares one scope with the renderer's parts and the editor code the build links in.

let md;
// The optional plug-ins (shell/plugin-loader.js) publish here when verified and installed.
const _rapierProviders = Object.seal({math: null, mermaid: null, flowchart: null, pdf: null, docx: null, ocr: null});
// No host stores pictures for the reader: a picture shows from the bytes the document carries.
const _rapierEmbedAssetSource = () => false;
// The reader shows no editing surface, so no block waits dormant and none is hidden from a heading search.
const _rapierDormantHeadings = () => [];

const READER_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

// A document is text of at most 25 MiB with no byte-order mark, NUL or lone surrogate. Line endings stay as written: the
// Markdown reader reads all three.
function readerDocumentText(value) {
	const text = String(value == null ? '' : value);
	if (new TextEncoder().encode(text).byteLength > READER_DOCUMENT_MAX_BYTES) throw new Error('document is too large for Rapier (max 25 MiB)');
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

// The Markdown parser for the whole page, made once from the renderer's own setup.
function readerParser() {
	if (md) return md;
	const markdown = _rapierRenderModule('render-markdown');
	markdown.initMarkdownIt();
	md = markdown.parser();
	return md;
}
