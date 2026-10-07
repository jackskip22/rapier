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

const DIAGRAM_LABEL_HTML = new Set('div span p br strong em b i s u del code sub sup'.split(' '));
const DIAGRAM_LABEL_MATH = new Set(('math mrow mi mn mo mtext mspace ms msub msup msubsup mfrac msqrt mroot mstyle merror '
	+ 'mpadded mphantom mfenced menclose munder mover munderover mtable mtr mtd mlabeledtr mmultiscripts mprescripts none semantics').split(' '));
const DIAGRAM_LABEL_MATH_ATTRIBUTES = new Set(('display mathvariant mathsize mathcolor mathbackground dir accent accentunder '
	+ 'columnalign columnlines columnspacing columnspan columnwidth depth displaystyle equalcolumns equalrows fence frame framespacing '
	+ 'height largeop linebreak linethickness lspace maxsize minsize movablelimits notation rowalign rowlines rowspacing rowspan rspace '
	+ 'scriptlevel scriptminsize scriptsizemultiplier separator stretchy subscriptshift superscriptshift valign voffset width').split(' '));
const DIAGRAM_LABEL_CLASSES = new Set('nodeLabel edgeLabel labelBkg markdown-node-label katex messageText'.split(' '));
const DIAGRAM_LABEL_CSS = new Set(('color fill stroke background-color font-family font-size font-style font-weight font-variant '
	+ 'font-variant-ligatures font-feature-settings line-height letter-spacing word-spacing text-align vertical-align white-space '
	+ 'word-break overflow-wrap text-wrap text-transform text-decoration text-decoration-line text-decoration-style text-decoration-color '
	+ 'text-decoration-thickness text-underline-offset align-items align-content justify-content justify-items flex-direction flex-wrap '
	+ 'width height min-width min-height max-width max-height margin margin-top margin-right margin-bottom margin-left '
	+ 'padding padding-top padding-right padding-bottom padding-left').split(' '));
const DIAGRAM_LABEL_SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DIAGRAM_LABEL_HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const DIAGRAM_LABEL_MATH_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

// Snapshot current math text before a Markdown writer collapses whitespace. Rendered SVG
// glyphs have no textContent: put their retained source in this inert copy so the writer's
// blank-node rule cannot discard an equation or its containing paragraph/list item.
function prepareMathSource(input, DOMParser) {
	const html = typeof input === 'string';
	const MARK = 'span[data-rapier-math-source],span.math-rendered[data-math-src]';
	if (html ? !/data-(?:rapier-math-source|math-src)/i.test(input) : typeof input?.cloneNode !== 'function' ||
		!(input.matches?.(MARK) || input.querySelector?.(MARK))) return input;
	const root = html ? new DOMParser().parseFromString(
		'<x-turndown id="turndown-root">' + input + '</x-turndown>', 'text/html').getElementById('turndown-root') : input.cloneNode(true);
	const nodes = Array.from(root.querySelectorAll(MARK));
	const sourceRoot = root.nodeName === 'SPAN' && root.matches(MARK);
	if (sourceRoot) nodes.push(root);
	for (const node of nodes) {
		if (node.classList.contains('math-rendered') && node.hasAttribute('data-math-src')) {
			try { node.textContent = decodeURIComponent(node.getAttribute('data-math-src')); } catch (_) {}
			continue;
		}
		try { node.setAttribute('data-rapier-math-source', encodeURIComponent(node.textContent || '')); }
		catch (_) { node.removeAttribute('data-rapier-math-source'); }
	}
	return sourceRoot ? root.outerHTML : root;
}

// The document's renderer. DOM, codecs and host state are explicit inputs.
function createRenderSanitizer(runtime) {
  const {CSSStyleSheet, DOMPurify, RAPIER_RASTER_DATA_URL_RE, URL, _rapierCssDeclaration, _rapierDropRemoteDeclarations, _rapierRemoteContent, _rapierRuleDescriptorIsRemote, _rapierSanitizeRuntime, _rapierVerifyRasterBytes, document, globalThis, location} = runtime;

// Only the diagram reader and its styled export admit static foreignObject labels. The
// ordinary SVG reader still rejects HTML subdocuments. The export class selects scope;
// every descendant is checked again, so a copied class never confers authority.
function diagramLabelRoot(node) {
	for (let current = node; current?.nodeType === 1; current = current.parentElement) {
		if (current.localName?.toLowerCase() === 'foreignobject') return current;
	}
	return null;
}

function diagramLabelStyle(property, value) {
	property = String(property).toLowerCase();
	value = String(value).trim();
	if (property === 'display') return /^(?:none|block|inline|inline-block|table|table-cell|flex|inline-flex)$/.test(value);
	if (/^overflow(?:-[xy])?$/.test(property)) return /^(?:hidden|clip)$/.test(value);
	if (property === 'contain') return value === 'content';
	if (property === 'isolation') return value === 'isolate';
	if (!DIAGRAM_LABEL_CSS.has(property)) return false;
	const declaration = document.createElement('span').style;
	declaration.setProperty(property, value);
	const parsed = declaration.getPropertyValue(property);
	if (!parsed || /(?:url|image-set|element|paint|attr)\s*\(/i.test(parsed)) return false;
	// SVG paint accepts resource references; a custom property must not smuggle one in.
	return !/^(?:fill|stroke)$/.test(property) || !/var\s*\(/i.test(parsed);
}

function diagramLabelElement(node) {
	if (node.nodeType !== 1) return;
	const label = diagramLabelRoot(node);
	if (!label) return;
	if (node === label) {
		const svg = node.parentElement?.closest('svg');
		if (node.namespaceURI !== DIAGRAM_LABEL_SVG_NAMESPACE || !svg || diagramLabelRoot(node.parentElement) ||
				(_rapierSanitizeRuntime.context !== 'diagram' && !svg.classList.contains('rapier-diagram'))) node.remove();
		return;
	}
	const name = node.localName?.toLowerCase();
	if (!(node.namespaceURI === DIAGRAM_LABEL_HTML_NAMESPACE && DIAGRAM_LABEL_HTML.has(name)) &&
			!(node.namespaceURI === DIAGRAM_LABEL_MATH_NAMESPACE && DIAGRAM_LABEL_MATH.has(name))) node.remove();
}

function diagramLabelAttribute(node, data) {
	const label = diagramLabelRoot(node);
	if (!label) return;
	data.forceKeepAttr = false;
	const name = String(data.attrName).toLowerCase();
	const value = String(data.attrValue);
	if (name === 'style') {
		const declaration = document.createElement('span').style;
		declaration.cssText = value;
		for (const property of Array.from(declaration)) {
			if (!diagramLabelStyle(property, declaration.getPropertyValue(property))) declaration.removeProperty(property);
		}
		data.attrValue = declaration.cssText;
		data.keepAttr = !!data.attrValue;
		return;
	}
	if (name === 'class') {
		data.attrValue = value.split(/\s+/).filter(token => DIAGRAM_LABEL_CLASSES.has(token)).join(' ');
		data.keepAttr = !!data.attrValue;
		return;
	}
	if (name === 'xmlns') {
		data.keepAttr = value === node.namespaceURI;
		return;
	}
	if (node === label) {
		data.keepAttr = name === 'transform' || /^(?:x|y|width|height)$/.test(name) &&
			/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:px|%)?$/i.test(value) && Number.isFinite(parseFloat(value)) &&
			(!/^(?:width|height)$/.test(name) || parseFloat(value) >= 0);
		return;
	}
	data.keepAttr = node.namespaceURI === DIAGRAM_LABEL_MATH_NAMESPACE
		? DIAGRAM_LABEL_MATH_ATTRIBUTES.has(name)
		: name === 'dir' && /^(?:ltr|rtl|auto)$/.test(value);
}

function diagramLabelContained(node) {
	const label = diagramLabelRoot(node);
	if (!label) return;
	if (node === label) node.style.setProperty('overflow', 'hidden', 'important');
	else if (node.parentElement === label) node.style.setProperty('contain', 'content', 'important');
}

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
	let options = selected === 'raw' ? { ...RAPIER_SANITIZE_OPTIONS.render, ALLOW_DATA_ATTR: false } : RAPIER_SANITIZE_OPTIONS[selected] || RAPIER_SANITIZE_OPTIONS.render;
	const labels = selected === 'diagram' || selected === 'export';
	if (labels) {
		options = {...options, USE_PROFILES: {...options.USE_PROFILES, mathMl: true}, ADD_TAGS: ['foreignobject'],
			HTML_INTEGRATION_POINTS: {foreignobject: true}, FORBID_TAGS: options.FORBID_TAGS.filter(tag => tag !== 'foreignobject')};
		DOMPurify.addHook('uponSanitizeElement', diagramLabelElement);
		DOMPurify.addHook('uponSanitizeAttribute', diagramLabelAttribute);
		DOMPurify.addHook('afterSanitizeAttributes', diagramLabelContained);
	}
	_rapierSanitizeRuntime.context = selected;
	try {
		return DOMPurify.sanitize(value == null ? '' : String(value), options);
	} finally {
		if (labels) {
			DOMPurify.removeHook('uponSanitizeElement', diagramLabelElement);
			DOMPurify.removeHook('uponSanitizeAttribute', diagramLabelAttribute);
			DOMPurify.removeHook('afterSanitizeAttributes', diagramLabelContained);
		}
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

  return {_rapierInstallSanitizeHooks, sanitizeRapierHtml, diagramLabelStyle, escapeRapierHtmlText, _rapierChromeOwnsId, _rapierSafeRasterDataUrl, _rapierCssPresentationIsRemote, _rapierRemoteSubresourceOrigin, _rapierStyleWithoutRemoteUrls, _rapierStylesheetWithoutRemoteUrls, _rapierDropRemoteRules};
}
export {RAPIER_SANITIZE_FORBID_TAGS as forbidTags, RAPIER_SANITIZE_FORBID_ATTR as forbidAttributes, createRenderSanitizer, RAPIER_SANITIZE_OPTIONS as options, prepareMathSource};
