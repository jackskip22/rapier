// SPDX-License-Identifier: MIT
const RAPIER_SANITIZE_FORBID_TAGS = Object.freeze(['form', 'style', 'dialog', 'template', 'iframe']);
const RAPIER_SANITIZE_FORBID_ATTR = Object.freeze(['action', 'formaction', 'form', 'for']);
const RAPIER_SANITIZE_OPTIONS = Object.freeze({
	render: Object.freeze({
		USE_PROFILES: { html: true, svg: true, mathMl: true },
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
	paste: Object.freeze({
		USE_PROFILES: { html: true },
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
	snippet: Object.freeze({
		USE_PROFILES: { html: true },
		FORBID_TAGS: RAPIER_SANITIZE_FORBID_TAGS,
		FORBID_ATTR: Object.freeze([...'style']),
	}),
	diagram: Object.freeze({
		USE_PROFILES: { html: true, svg: true },
		FORBID_TAGS: Object.freeze(['form', 'dialog', 'template', 'iframe', 'script', 'foreignobject']),
		FORBID_ATTR: RAPIER_SANITIZE_FORBID_ATTR,
	}),
});

// Snapshot current math text before a Markdown writer collapses whitespace. The parsed copy
// stays inert; the writer still admits raw source through its shared math grammar.
function prepareMathSource(input, DOMParser) {
	const html = typeof input === 'string';
	const MARK = 'span[data-rapier-math-source]';
	if (html ? !/data-rapier-math-source/i.test(input) : typeof input?.cloneNode !== 'function' ||
		!(input.matches?.(MARK) || input.querySelector?.(MARK))) return input;
	const root = html ? new DOMParser().parseFromString(
		'<x-turndown id="turndown-root">' + input + '</x-turndown>', 'text/html').getElementById('turndown-root') : input.cloneNode(true);
	const nodes = Array.from(root.querySelectorAll(MARK));
	const sourceRoot = root.nodeName === 'SPAN' && root.hasAttribute('data-rapier-math-source');
	if (sourceRoot) nodes.push(root);
	for (const node of nodes) {
		try { node.setAttribute('data-rapier-math-source', encodeURIComponent(node.textContent || '')); }
		catch (_) { node.removeAttribute('data-rapier-math-source'); }
	}
	return sourceRoot ? root.outerHTML : root;
}

// The document's renderer. DOM, codecs and host state are explicit inputs.
function createRenderSanitizer(runtime) {
  const {CSSStyleSheet, DOMPurify, RAPIER_RASTER_DATA_URL_RE, URL, _rapierCssDeclaration, _rapierDropRemoteDeclarations, _rapierRemoteContent, _rapierRuleDescriptorIsRemote, _rapierSanitizeRuntime, _rapierVerifyRasterBytes, document, globalThis, location} = runtime;


function _rapierInstallSanitizeHooks() {
	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		if (!/^(?:src|href|xlink:href)$/i.test(data.attrName || '')) return;
		const compact = String(data.attrValue || '').replace(/[\u0000-\u0020\u00a0]+/g, '');
		if (!/^data:/i.test(compact)) return;
		const rasterAllowed = /^(?:render|export|raw|source)$/.test(_rapierSanitizeRuntime.context)
			&& data.attrName.toLowerCase() === 'src'
			&& node && node.nodeName === 'IMG'
			&& _rapierSafeRasterDataUrl(compact);
		if (!rasterAllowed) data.keepAttr = false;
	});
	// Paste and render sanitise: a remote <img src> would fetch the instant its markup lands in the page,
	// so the src the hook below is about to strip never survives. Move it to a data-* attribute first
	// (DOMPurify already leaves data-* alone, and the sanitizer's own inert document never fetches it
	// either), so the picture and its alt text still reach Turndown's rapierImage rule as a live
	// pasted-page picture and write out `![alt](url)` -- not vanish -- and an <img> in a document's own
	// HTML (a table kept as HTML) is written again with its URL: the raw profile admits no data-*, so
	// only the three this hook sets on the node it holds back stay. A picture inside a link is the same
	// node with the same fix: the outer <a> rule reads this img's own converted markdown as its content.
	DOMPurify.addHook('uponSanitizeElement', node => {
		if (_rapierRemoteContent.allowed || !/^(?:paste|render|raw)$/.test(_rapierSanitizeRuntime.context)) return;
		if (!node || node.nodeName !== 'IMG' || node.hasAttribute('data-rapier-remote-src')) return;
		const src = node.getAttribute('src') || '';
		if (!src || !_rapierRemoteSubresourceOrigin(src)) return;
		node._rapierHeldBack = true;
		node.setAttribute('data-rapier-remote-src', src);
		const alt = node.getAttribute('alt');
		if (alt != null) node.setAttribute('data-rapier-remote-alt', alt);
		const title = node.getAttribute('title');
		if (title != null) node.setAttribute('data-rapier-remote-title', title);
	});
	// A list from Word is named by the style of its paragraph and of the span that holds its marker (mso-list,
	// spec/html-reading.mjs), and the CSS pass below empties a style of every property the browser does not
	// know: a marker's style is only `mso-list:Ignore`. The paste carries both as data-* first, where they stay,
	// for the conversion that reads them (_rapierPasteWordLists).
	DOMPurify.addHook('uponSanitizeElement', node => {
		if (_rapierSanitizeRuntime.context !== 'paste' || !node || !/^(?:P|SPAN)$/.test(node.nodeName)) return;
		// Only the style names them: a page cannot bring these attributes of its own.
		node.removeAttribute('data-rapier-word-level');
		node.removeAttribute('data-rapier-word-marker');
		const style = node.getAttribute('style');
		if (!style || !/mso-list/i.test(style)) return;
		const {wordListLevel, wordListIsMarker} = globalThis.RapierMarkdownSpec;
		const level = node.nodeName === 'P' ? wordListLevel(style) : 0;
		if (level) node.setAttribute('data-rapier-word-level', String(level));
		else if (node.nodeName === 'SPAN' && wordListIsMarker(style)) node.setAttribute('data-rapier-word-marker', '1');
	});
	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		const value = String(data.attrValue == null ? '' : data.attrValue);
		// A document's own HTML never carries an id the chrome owns, remote content allowed or not: the
		// allow is about what the page fetches, and this rule is about what the page's chrome finds.
		if (String(data.attrName || '').toLowerCase() === 'id' && _rapierSanitizeRuntime.context === 'raw' && _rapierChromeOwnsId(value)) { data.keepAttr = false; return; }
		if (_rapierRemoteContent.allowed || _rapierSanitizeRuntime.context === 'source') return;
		if (String(data.attrName || '').toLowerCase() === 'style') {
			const cleaned = _rapierStyleWithoutRemoteUrls(value);
			if (cleaned !== value) data.attrValue = cleaned;
			return;
		}
		const attribute = String(data.attrName || '').toLowerCase();
		if (/^data-rapier-remote-(?:src|alt|title)$/.test(attribute) && node && node._rapierHeldBack === true) { data.forceKeepAttr = true; return; }
		if (attribute.startsWith('data-')) return;
		const element = String(node && node.nodeName || '').toUpperCase();
		if (attribute === 'href' && (element === 'A' || element === 'AREA')) return;
		if (_rapierCssPresentationIsRemote(attribute, value) ||
			value.split(/[\s,]+/).some(token => _rapierRemoteSubresourceOrigin(token))) {
			data.keepAttr = false;
		}
	});

	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		if (String(data.attrName || '').toLowerCase() === 'contenteditable' && String(data.attrValue) === 'false' &&
				node && node.nodeName === 'DIV' && node.getAttribute && node.getAttribute('data-md-break') === 'page') {
			data.keepAttr = true;
			data.forceKeepAttr = true;
		}
	});
	// A link that opens a new tab never hands that tab a window.opener or a Referer: the editor's own
	// click router already opens with noopener,noreferrer; the sanitized markup that Share and the
	// standalone export carry gets the same rule in its bytes.
	DOMPurify.addHook('afterSanitizeAttributes', node => {
		if (!node || !/^(?:A|AREA)$/i.test(node.nodeName) || !node.hasAttribute('target')) return;
		if (String(node.getAttribute('target') || '').trim().toLowerCase() !== '_blank') return;
		node.setAttribute('rel', 'noopener noreferrer');
	});
	DOMPurify.addHook('afterSanitizeElements', node => {
		if (_rapierRemoteContent.allowed) return;
		if (!node || (node.nodeName !== 'STYLE' && node.nodeName !== 'style')) return;
		const css = String(node.textContent || '');
		if (!css) return;
		const cleaned = _rapierStylesheetWithoutRemoteUrls(css);
		if (cleaned !== css) node.textContent = cleaned;
	});
}

function sanitizeRapierHtml(value, context = 'render') {
	// 'export' is the render profile under the export hooks; 'raw' is a document's own HTML (initMarkdownIt, html_block):
	// the render profile without data-* attributes, which Rapier's delegated handlers read as their own controls, and
	// (the hook) without an id the chrome owns. 'source' is Markdown source HTML, written and never shown: the render
	// profile's admission, and the block on remote content stays the reader's (a remote picture's URL is the person's words).
	const selected = context === 'raw' || context === 'export' || context === 'source' || RAPIER_SANITIZE_OPTIONS[context] ? context : 'render';
	const options = selected === 'raw' ? { ...RAPIER_SANITIZE_OPTIONS.render, ALLOW_DATA_ATTR: false } : RAPIER_SANITIZE_OPTIONS[selected] || RAPIER_SANITIZE_OPTIONS.render;
	_rapierSanitizeRuntime.context = selected;
	try {
		return DOMPurify.sanitize(value == null ? '' : String(value), options);
	} finally {
		_rapierSanitizeRuntime.context = 'render';
	}
}

function escapeRapierHtmlText(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function _rapierChromeOwnsId(id) {
	// Every id the shell's own markup carries, read once before any document renders (initMarkdownIt primes it).
	if (!_rapierSanitizeRuntime.chromeIds) _rapierSanitizeRuntime.chromeIds = new Set(Array.from(typeof document?.querySelectorAll === 'function' ? document.querySelectorAll('[id]') : [], element => element.id));
	return _rapierSanitizeRuntime.chromeIds.has(String(id));
}

function _rapierSafeRasterDataUrl(value) {
	const match = RAPIER_RASTER_DATA_URL_RE.exec(value);
	if (!match) return false;
	try {
		const mime = match[1].toLowerCase();

		// An SVG's root <svg can trail a realistic XML declaration, doctype or generator/license

		const decodeBytes = encoded => { const text = atob(encoded); return Uint8Array.from(text, char => char.charCodeAt(0)); };

		if (_rapierVerifyRasterBytes(decodeBytes(match[2].slice(0, 344)), mime)) return true;
		return mime === 'image/svg+xml' && match[2].length > 344 && _rapierVerifyRasterBytes(decodeBytes(match[2]), mime);
	} catch (_) { return false; }
}

function _rapierCssPresentationIsRemote(property, value) {
	if (!value) return false;
	const declaration = _rapierCssDeclaration();
	declaration.setProperty(property, value);
	return declaration.length ? _rapierDropRemoteDeclarations(declaration) : false;
}

function _rapierRemoteSubresourceOrigin(value) {
	const raw = String(value == null ? '' : value)
		.replace(/[\u0009\u000a\u000d]+/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
	if (!raw) return '';
	let url;
	try { url = new URL(raw, document.baseURI); } catch (_) { return ''; }
	const host = String(url.host || '');
	if (!host) return '';
	const place = String(url.protocol || '').toLowerCase() + '//' + host;
	return place === location.protocol.toLowerCase() + '//' + location.host ? '' : place;
}

function _rapierStyleWithoutRemoteUrls(value) {
	const raw = String(value == null ? '' : value);
	if (!raw) return raw;
	const declaration = _rapierCssDeclaration();
	declaration.cssText = raw;
	if (!declaration.length) return '';
	return _rapierDropRemoteDeclarations(declaration) ? declaration.cssText : raw;
}

function _rapierStylesheetWithoutRemoteUrls(css) {
	let sheet;
	try {
		sheet = new CSSStyleSheet();
		sheet.replaceSync(String(css == null ? '' : css));
	} catch (_) { return ''; }
	_rapierDropRemoteRules(sheet.cssRules, sheet);
	return [].map.call(sheet.cssRules, rule => rule.cssText).join('\n');
}

function _rapierDropRemoteRules(rules, owner) {
	for (let index = rules.length - 1; index >= 0; index--) {
		const rule = rules[index];
		if (!rule.style && !rule.cssRules && _rapierRuleDescriptorIsRemote(rule) &&
				owner && typeof owner.deleteRule === 'function') {
			try { owner.deleteRule(index); continue; } catch (_) {}
		}
		if (rule.style) _rapierDropRemoteDeclarations(rule.style);
		if (rule.cssRules) _rapierDropRemoteRules(rule.cssRules, rule);
	}
}

  return {_rapierInstallSanitizeHooks, sanitizeRapierHtml, escapeRapierHtmlText, _rapierChromeOwnsId, _rapierSafeRasterDataUrl, _rapierCssPresentationIsRemote, _rapierRemoteSubresourceOrigin, _rapierStyleWithoutRemoteUrls, _rapierStylesheetWithoutRemoteUrls, _rapierDropRemoteRules};
}
export {RAPIER_SANITIZE_FORBID_TAGS as forbidTags, RAPIER_SANITIZE_FORBID_ATTR as forbidAttributes, createRenderSanitizer, RAPIER_SANITIZE_OPTIONS as options, prepareMathSource};
